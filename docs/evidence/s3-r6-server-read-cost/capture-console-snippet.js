/* =================================================================================================================
   S3-R6 §3 — PRODUCTION READ COST CAPTURE.  READ ONLY.

   HOW TO USE
   ----------
   1. Open the production site, sign in, and open the browser console (F12 → Console).
   2. Paste this whole file and press Enter. It defines window.__kmS3R6 and does nothing else.
   3. Run the three commands under "THE PROTOCOL" below, in order, pasting each block of output back.

   WHAT IT DOES, AND WHAT IT WILL NOT DO
   -------------------------------------
   It issues the SAME canonical reads the pages already issue, through the SAME client APIs, and reports what
   the server already tells us. It is not a second transport: every request below goes out through
   KM.api.getWorkspace / KM.productPricingWorkspace / KM.DB, exactly as a page mount does.

   · ZERO writes. No action here is a mutation; none takes a lock or touches a sheet.
   · ZERO new timing infrastructure. serverDurationMs and tablesRead are already in every workspace
     response's meta, and KM.transport.metrics() already records wire bytes, attempts and concurrency.
     This only reads them and lays them out.
   · SEQUENTIAL, deliberately. Each read waits for the previous one to settle, so a number here is the cost
     of ONE read rather than the cost of competing with the other seven. Measuring them concurrently would
     produce larger numbers that say something true about contention and nothing about cost.
   · It never invents a field. Anything the server does not send prints as NOT_AVAILABLE.

   THE PROTOCOL
   ------------
       await __kmS3R6.measure('COLD')     // first thing after a hard reload (Ctrl-Shift-R)
       await __kmS3R6.measure('WARM')     // immediately after, without reloading
       await __kmS3R6.measure('REPEAT')   // once more, a minute later

   Three samples are three samples. They are NOT a P50 and this report will not call them one.

   Then, after you have used FC Summary and the SKU pages normally for a while — including anything that
   fails and that you retry — run:

       __kmS3R6.passive()

   which prints what actually happened in that session: every request, its code, whether the server answered,
   how long it took, how many were open at once, and how many attempts it needed.

   PRODUCT STRATEGY needs a scope, because its workspace read is site-scoped by construction. Use a site you
   normally look at:

       await __kmS3R6.measure('COLD', { company: 'KM', country: 'US', marketplace: 'Amazon' })

   If you leave the scope out, the Product Strategy workspace row prints SKIPPED_NO_SCOPE rather than a
   number, and everything else still runs.
   ================================================================================================================= */
(function (root) {
  'use strict';

  var NA = 'NOT_AVAILABLE';

  function n(v) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v) : NA; }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  /* Rows returned, from whatever the envelope actually says. Every workspace answer carries `counts`; if one
     does not, the arrays are counted directly. Neither is estimated. */
  function rowsOf(data) {
    if (!data || typeof data !== 'object') return NA;
    var total = 0, found = false;
    if (data.counts && typeof data.counts === 'object') {
      Object.keys(data.counts).forEach(function (k) {
        if (typeof data.counts[k] === 'number') { total += data.counts[k]; found = true; }
      });
      if (found) return total;
    }
    Object.keys(data).forEach(function (k) {
      if (Array.isArray(data[k])) { total += data[k].length; found = true; }
    });
    return found ? total : NA;
  }

  /* Decoded size, which is NOT the wire size — the wire is gzipped and the true byte count is recorded by the
     transport itself. Both are reported, and which is which is stated, because quoting one as the other is how
     a payload budget ends up wrong by a factor of five. */
  function decodedBytes(env) {
    try { return JSON.stringify(env).length; } catch (e) { return NA; }
  }

  function tp() { try { return (root.KM && root.KM.transport) || null; } catch (e) { return null; } }

  /* The transport's own record for this request, matched by the id the server echoed back. This is where the
     real wire bytes and the attempt count live. */
  function sampleFor(requestId) {
    var t = tp();
    if (!t || typeof t.metrics !== 'function' || !requestId) return null;
    var s = t.metrics().samples || [];
    for (var i = s.length - 1; i >= 0; i--) {
      if (s[i] && (s[i].request_id === requestId || s[i].server_request_id === requestId)) return s[i];
    }
    return null;
  }

  function record(label, env, clientMs, err) {
    var meta = (env && env.meta) || {};
    var rid = meta.requestId || meta.request_id || null;
    var smp = sampleFor(rid);
    var ok = !!(env && env.success);
    var code = ok ? 'SUCCESS'
      : (err ? String((err && err.code) || (err && err.message) || err).slice(0, 60)
             : String(((env && env.errors && env.errors[0] && env.errors[0].code)) || 'FAILED').slice(0, 60));
    return {
      target: label,
      action: meta.action || (smp && smp.action) || NA,
      request_id: rid || NA,
      result: code,
      server_ms: (typeof meta.serverDurationMs === 'number') ? Math.round(meta.serverDurationMs)
        : (smp && typeof smp.server_ms === 'number' ? Math.round(smp.server_ms) : NA),
      tables_read: (typeof meta.tablesRead === 'number') ? meta.tablesRead : NA,
      client_total_ms: n(clientMs),
      rows_returned: ok ? rowsOf(env.data) : NA,
      wire_bytes: (smp && typeof smp.bytes === 'number' && smp.bytes > 0) ? smp.bytes : NA,
      decoded_bytes: ok ? decodedBytes(env) : NA,
      attempts: (smp && smp.attempts) || NA,
      concurrent_at_dispatch: (smp && smp.concurrent_at_dispatch) || NA,
      slice: meta.slice || null
    };
  }

  /* One read, timed around the call the page itself would make. A rejection is recorded, never swallowed:
     a target that fails is a measurement, and the slowest reads in production are the ones that fail. */
  function timed(label, fn) {
    var t0 = now();
    return Promise.resolve()
      .then(fn)
      .then(function (env) { return record(label, env, now() - t0, null); },
            function (e) { return record(label, null, now() - t0, e); });
  }

  function ws(name, include) {
    return function () {
      if (!(root.KM && root.KM.api && typeof root.KM.api.getWorkspace === 'function')) {
        throw { code: 'WORKSPACE_API_UNAVAILABLE' };
      }
      return root.KM.api.getWorkspace(name, include ? { include: include } : {});
    };
  }

  function table(rows) {
    if (root.console && typeof root.console.table === 'function') { try { root.console.table(rows); } catch (e) {} }
    // The pasteable form. console.table is easier to read and impossible to copy accurately.
    var head = ['target', 'action', 'result', 'server_ms', 'client_total_ms', 'tables_read',
      'rows_returned', 'wire_bytes', 'decoded_bytes', 'attempts', 'request_id'];
    var lines = [head.join('\t')];
    rows.forEach(function (r) { lines.push(head.map(function (k) { return String(r[k]); }).join('\t')); });
    return lines.join('\n');
  }

  var API = {
    /* Issue every mandatory target once, in order, and print the result. */
    measure: function (label, scope) {
      label = String(label || 'SAMPLE');
      var out = [];
      var steps = [
        ['A  SKU Details', ws('skuDetails', null)],
        ['B  SKU Regional', ws('skuDetails', { regional: true, pricing: true })],
        ['C  PSB site universe', function () {
          if (!(root.KM && root.KM.productPricingWorkspace)) throw { code: 'PSB_MODULE_UNAVAILABLE' };
          return root.KM.productPricingWorkspace.getSiteUniverse({});
        }],
        ['D  PSB workspace', function () {
          if (!scope) throw { code: 'SKIPPED_NO_SCOPE' };
          if (!(root.KM && root.KM.productPricingWorkspace)) throw { code: 'PSB_MODULE_UNAVAILABLE' };
          return root.KM.productPricingWorkspace.get({ scope: scope });
        }],
        ['E  FC bootstrap', ws('fcSummary', { slice: 'bootstrap' })],
        ['F  FC regular', ws('fcSummary', { slice: 'regular' })],
        ['G  FC events', ws('fcSummary', { slice: 'events' })],
        ['H  FC rules', ws('fcSummary', { slice: 'rules' })],
        ['I  system.health', function () {
          if (!(root.KM && root.KM.DB && root.KM.DB.checkDeploymentContract)) throw { code: 'DB_API_UNAVAILABLE' };
          return root.KM.DB.checkDeploymentContract().then(function (v) {
            // checkDeploymentContract returns a verdict, not an envelope; wrap it so the row is uniform and
            // honest about having no server duration of its own to report.
            return { success: !!(v && v.ok), data: null, meta: { action: 'system.health' }, errors: [] };
          });
        }]
      ];
      // SEQUENTIAL. See the header: one at a time is what makes each number the cost of that read.
      var chain = Promise.resolve();
      steps.forEach(function (s) {
        chain = chain.then(function () { return timed(s[0], s[1]); }).then(function (r) { out.push(r); });
      });
      return chain.then(function () {
        var t = tp();
        var text = '=== S3-R6 ' + label + ' @ ' + new Date().toISOString() + ' ===\n' + table(out)
          + '\n--- transport totals at end of this sample ---\n'
          + (t ? JSON.stringify({
              requests: t.metrics().requests, retries: t.metrics().retries,
              recoveries: t.metrics().recoveries, coalesced: t.metrics().coalesced,
              byCode: t.metrics().byCode,
              peak_concurrent: t.peakConcurrentRequests(), open: t.openRequests()
            }) : 'transport unavailable')
          + '\nNOTE decoded_bytes is JSON length, NOT the gzipped wire size; wire_bytes is what the transport saw.';
        root.console.log(text);
        return text;
      });
    },

    /* What actually happened in this session, including the failures and retries a scripted sample cannot
       reproduce. Run this after using the pages normally. */
    passive: function () {
      var t = tp();
      if (!t) { root.console.log('KM.transport unavailable'); return ''; }
      var m = t.metrics();
      var tl = (typeof t.timeline === 'function') ? t.timeline() : [];
      var head = ['seq', 'action', 'kind', 'code', 'elapsed_ms', 'server_ms', 'server_answered',
        'http_status', 'redirected', 'attempts', 'concurrent_at_dispatch', 'dispatch_ms', 'settled_ms', 'marks_source'];
      var lines = [head.join('\t')];
      tl.forEach(function (r) { lines.push(head.map(function (k) { return String(r[k]); }).join('\t')); });
      var text = '=== S3-R6 PASSIVE @ ' + new Date().toISOString() + ' ===\n'
        + JSON.stringify({ requests: m.requests, retries: m.retries, recoveries: m.recoveries,
            coalesced: m.coalesced, byCode: m.byCode, byAction: m.byAction,
            peak_concurrent: t.peakConcurrentRequests(), open: t.openRequests() }, null, 1)
        + '\n--- timeline ---\n' + lines.join('\n')
        + '\nNOTE a row whose marks_source is EXTERNAL_RECONSTRUCTED had its start time derived from its'
        + '\n     duration rather than observed at dispatch; do not read overlap from those rows.';
      root.console.log(text);
      return text;
    },

    /* Clear the counters so the next sample is not read against the whole session. Counters only — no state,
       no cache, nothing a page depends on. */
    reset: function () {
      var t = tp();
      if (t && typeof t.resetMetrics === 'function') { t.resetMetrics(); root.console.log('metrics reset'); }
      else root.console.log('resetMetrics unavailable');
    },

    /* What this tool will and will not touch, stated so it can be checked rather than trusted. */
    contract: {
      writes: 0, locks: 0, sheetMutations: 0, businessLogicChanges: 0,
      newTransport: false, newTimingInfrastructure: false,
      readsThrough: ['KM.api.getWorkspace', 'KM.productPricingWorkspace', 'KM.DB.checkDeploymentContract'],
      sequential: true
    }
  };

  root.__kmS3R6 = API;
  if (root.console) root.console.log('__kmS3R6 ready — see the header of this file for the protocol.');
}(typeof window !== 'undefined' ? window : this));
