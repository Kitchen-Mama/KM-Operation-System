// S8-R4D-T1 — FIRST-SEARCH TRANSPORT PROBE.  READ-ONLY.  Paste into the DevTools console.
//
// WHAT IT DOES: correlates the client's own request ledger with the browser's resource timings for the
// Apps Script hops, so "where did the budget go" is answered from recorded facts instead of inferred.
// WHAT IT DOES NOT DO: it calls no page function that changes state, issues no request, writes no storage,
// mutates no DOM, adds no listener. Every statement is a read. Safe on Production, repeatable.
//
// WHEN TO RUN: immediately after a Search has FAILED (or succeeded, for a healthy baseline to compare).
// Do not reload first — a reload clears the resource timeline and the page ledger.
//
//   1. Reproduce the slow/failed first Search.
//   2. Paste this file. Press Enter.
//   3. copy(__T1__.json)   and send the blob.
//
// LIMITATION, STATED UP FRONT: script.google.com and script.googleusercontent.com are cross-origin and do
// not send Timing-Allow-Origin, so per-phase fields (responseStart, transferSize) read 0. `startTime` and
// `duration` ARE available, and those are what this probe relies on. It does not pretend to the rest.
(function () {
  'use strict';
  var out = { captured_at: new Date().toISOString() };

  function safe(label, fn) { try { return fn(); } catch (e) { return '(' + label + ' threw: ' + (e && e.message) + ')'; } }

  // ---- 1. provenance ------------------------------------------------------------------------------------
  out.assets = performance.getEntriesByType('resource')
    .filter(function (e) { return /inventory-replenishment\.(js|css)/.test(e.name); })
    .map(function (e) { return e.name.replace(/^.*\/(?=assets)/, ''); });
  out.page = { navStart: 0, now: +performance.now().toFixed(1) };

  // ---- 2. the CLIENT's own record of what it dispatched --------------------------------------------------
  // These four names are verified to exist in the shipped page. If one reports "(not exported)", say so
  // rather than substituting another — a guessed name is how three rounds went wrong.
  out.client = {
    searchState: safe('_irSearchState_', function () {
      return window._irSearchState_ ? window._irSearchState_() : '(not exported)'; }),
    bootstrap: safe('_irBootstrapDiagnostic_', function () {
      return window._irBootstrapDiagnostic_ ? window._irBootstrapDiagnostic_() : '(not exported)'; }),
    stageReport: safe('_irReadStageReport_', function () {
      return window._irReadStageReport_ ? window._irReadStageReport_() : '(not exported)'; }),
    transportMetrics: safe('KM.transport.metrics', function () {
      return (window.KM && window.KM.transport && window.KM.transport.metrics)
        ? window.KM.transport.metrics() : '(not exported)'; })
  };

  // ---- 3. THE DECISIVE NUMBER: coalescing -----------------------------------------------------------------
  // scopedSingleFlight returns the IN-FLIGHT promise to a second caller WITHOUT invoking the work function
  // (km-transport.js:636), and the timeout budget starts inside that work function (:721, :766). So a Search
  // that coalesces onto an open preload INHERITS the preload's deadline and never starts its own. A non-zero
  // `coalesced` beside a REQUEST_TIMEOUT is what distinguishes "this Search waited its full budget" from
  // "this Search was handed someone else's nearly-expired one".
  var m = out.client.transportMetrics;
  out.coalescing = (m && typeof m === 'object')
    ? { coalesced: m.coalesced, requests: m.requests, retries: m.retries, shareSkipped: m.shareSkipped }
    : '(transport metrics unavailable)';

  // ---- 4. the Apps Script hops, as the browser timed them -------------------------------------------------
  out.hops = performance.getEntriesByType('resource')
    .filter(function (e) { return /script\.google\.com|script\.googleusercontent\.com/.test(e.name); })
    .map(function (e) {
      var host = e.name.replace(/^https?:\/\//, '').split('/')[0];
      return {
        host: host,
        kind: /googleusercontent/.test(host) ? 'ECHO_REDIRECT_TARGET' : 'EXEC',
        startTime_ms: +e.startTime.toFixed(1),      // when the browser dispatched it
        duration_ms: +e.duration.toFixed(1),        // wall time for this hop
        endTime_ms: +(e.startTime + e.duration).toFixed(1),
        initiatorType: e.initiatorType,
        // 0 cross-origin without Timing-Allow-Origin — reported so a 0 is not read as "instant".
        transferSize: e.transferSize, responseStatusTAO: (e.responseStart === 0 ? 'OPAQUE' : 'VISIBLE')
      };
    })
    .sort(function (a, b) { return a.startTime_ms - b.startTime_ms; });

  // Gaps BETWEEN hops are the part no single row shows: a long gap after an /exec that ended quickly means
  // the time went somewhere other than that hop.
  out.hopGaps = out.hops.slice(1).map(function (h, i) {
    var prev = out.hops[i];
    return { from: prev.kind, to: h.kind, gap_ms: +(h.startTime_ms - prev.endTime_ms).toFixed(1) };
  });
  out.hopTotals = out.hops.reduce(function (acc, h) {
    acc[h.kind] = acc[h.kind] || { count: 0, total_ms: 0, max_ms: 0 };
    acc[h.kind].count++; acc[h.kind].total_ms = +(acc[h.kind].total_ms + h.duration_ms).toFixed(1);
    acc[h.kind].max_ms = Math.max(acc[h.kind].max_ms, h.duration_ms);
    return acc;
  }, {});

  // ---- 5. the fork this round exists to answer ------------------------------------------------------------
  var sr = out.client.stageReport;
  out.fork = {
    question: 'Did a server execution for the timed-out request run, and did it finish inside the bound?',
    server_execution_ms: (sr && typeof sr === 'object') ? sr.server_execution_ms : null,
    server_tables_read: (sr && typeof sr === 'object') ? sr.server_tables_read : null,
    frozen_healthy_baseline: { tables: 13, server_execution_ms: 6197, rows: 7299 },
    note: 'server_execution_ms is null when NO read completed — which is exactly the first-attempt-timeout ' +
          'case. A null here does NOT mean the server was slow; it means the server never told us, and the ' +
          'Apps Script Executions list is the only place that answer exists.'
  };

  out.json = JSON.stringify(out);
  window.__T1__ = out;
  console.log('%cS8-R4D-T1 FIRST-SEARCH TRANSPORT PROBE', 'font-weight:bold');
  console.log('search state', out.client.searchState);
  console.log('bootstrap   ', out.client.bootstrap);
  console.log('coalescing  ', out.coalescing);
  console.table(out.hops);
  console.log('gaps between hops', out.hopGaps, 'totals', out.hopTotals);
  console.log('fork', out.fork);
  console.log('send with:  copy(__T1__.json)');
  return out;
})();
