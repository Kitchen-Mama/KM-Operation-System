/**
 * assets/js/api/sales-outlook-provider.js — TARGET-SALES-R2, a LOCAL CANDIDATE.
 * Kitchen Mama Operation System — the Sales Outlook data provider (KMSOP).
 *
 * IT OWNS NO READ. It composes three that already exist and are already routed, through the clients the
 * application already loads at boot — no new action, no new transport, no router change:
 *   1. fcSummary.workspace.get (58_), the FULL answer, ONE request:   fc_regular_forecast, fc_special_events,
 *      fc_target_rules (+ marketplaces), raw rows and the `capped` flags — through KM.api.getWorkspace('fcSummary')
 *   2. productPricing.siteUniverse.get (72_), ONE request:            the sites a person may choose from
 *   3. productPricing.workspace.get (72_), ONE PER CHOSEN SITE (and per page of 1000 site SKUs):
 *      membership (marketplace_skus, every status — a SKU with a forecast keeps its price whatever its listing
 *      status), the resolved regular price and its source (73_ pricingResolveEffective_), pricing_list.currency,
 *      sku_details.series / category, and the campaign lines with their parent campaign checked column by column.
 *      include.regional is OFF: this page never reads a regional detail, so it does not pay for that sheet.
 *   Both productPricing reads are gated by the Product Strategy capability (KM.productPricingWorkspace): when it
 *   is off, sites come back FAILED with that code and no price is invented.
 *
 * WHAT IT REFUSES TO DO: write anything; store anything outside this instance (no localStorage, no
 * sessionStorage, no DB, no Script Property); ask getOperationDb; send one request per row; preload at boot.
 * Its cache lives as long as one page mount and is dropped by `destroy()`.
 *
 * LATEST REQUEST WINS. Every `load()` takes a generation; an answer that arrives for an older generation (the
 * operator changed the months or the sites meanwhile) is reported SUPERSEDED and never handed to the page.
 *
 * THE CACHE HAS OWNERS TOO (review fix 1 — Codex 7020df7e: an older read that landed after a refresh wrote its
 * stale answer back, and the next load served it). Committing to the page was guarded; writing to the cache was not.
 *   - Every read of one source (the FC, the site universe, each site) takes that source's next ISSUE number. Only
 *     the newest-issued read of a source may write its cache entry; an older one that lands later is returned to its
 *     own (superseded) caller and written nowhere. A FAILED or stopped read is never cached, a PARTIAL one keeps its
 *     state.
 *   - After destroy() nothing is written, nothing new is opened, and every waiting request is released unopened.
 *   - ONE gate for the whole provider: at most SITE_CONCURRENCY productPricing.workspace.get page requests open at once,
 *     however many loads or refreshes are running (each load used to run its own 3 lanes). A read that no current load wants any
 *     more stops before its NEXT request — a site not yet opened, or its next page. A request already sent cannot
 *     be withdrawn: it runs to its end, holds its slot until then, and its answer is dropped, not cached.
 *   - A load joins a read of the same site already in flight instead of sending a second one; a refresh joins only
 *     a read that was itself started by a refresh, so a refresh is never answered from the cache or by a read an
 *     ordinary load started — and a burst of refreshes keeps at most two reads of one source in flight.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.salesOutlookProvider = api; }
})(this, function () {
  'use strict';

  var SITE_PAGE_LIMIT = 1000;
  var SITE_PAGE_MAX = 20;          // 20 000 site SKUs on one site before the read is reported PARTIAL
  var SITE_CONCURRENCY = 3;
  var STATUSES = ['active', 'phasing_out', 'inactive', 'discontinued'];

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function siteKey(s) { return str(s.company).toUpperCase() + '|' + str(s.country).toUpperCase() + '|' + str(s.marketplace).toUpperCase(); }

  /**
   * create({ api, ppw }) — `api` is KM.api (getWorkspace), `ppw` is KM.productPricingWorkspace (get, getSiteUniverse).
   * Injected so the contract tests run against scoped mocks with no network.
   */
  function create(deps) {
    deps = deps || {};
    var gen = 0, destroyed = false, requests = [];
    var cache = { fc: null, universe: null, sites: {} };
    // per source: the last ISSUE number handed out, and the read in flight (only the newest-issued read may write)
    var issued = { fc: 0, universe: 0, sites: {} }, inflight = { fc: null, universe: null, sites: {} };
    // the provider-wide gate on productPricing requests: open now, the high-water mark, and who waits for a slot
    var gate = { open: 0, peak: 0, waiting: [] };
    function apiOf() { return deps.api || (typeof window !== 'undefined' && window.KM && window.KM.api) || null; }
    function ppwOf() { return deps.ppw || (typeof window !== 'undefined' && window.KM && window.KM.productPricingWorkspace) || null; }
    function note(action, detail) { requests.push({ action: action, detail: detail || null }); }
    // a read is wanted while a load that is still the CURRENT generation waits for it
    function wanted(entry) { return !destroyed && entry.owners.indexOf(gen) >= 0; }
    // a slot, or false when the read is no longer wanted by the time one frees up (it then opens nothing)
    function acquire(entry) {
      if (!wanted(entry)) return Promise.resolve(false);
      if (gate.open < SITE_CONCURRENCY) { gate.open++; gate.peak = Math.max(gate.peak, gate.open); return Promise.resolve(true); }
      return new Promise(function (resolve) { gate.waiting.push({ entry: entry, resolve: resolve }); });
    }
    function release() {
      gate.open--;
      while (gate.open < SITE_CONCURRENCY && gate.waiting.length) {
        var w = gate.waiting.shift();
        if (!wanted(w.entry)) { w.resolve(false); continue; }
        gate.open++; gate.peak = Math.max(gate.peak, gate.open); w.resolve(true);
      }
    }
    // one source's read: join the one in flight when that is allowed, else issue a new one; `run(entry)` reads,
    // `keep(result)` says whether it may be cached. The cache is written only by the newest-issued read, never after
    // destroy().
    function shared(kind, k, force, owner, run, keep) {
      var slot = k === null ? inflight : inflight.sites, key = k === null ? kind : k;
      var f = slot[key];
      if (f && (!force || f.force)) { if (f.owners.indexOf(owner) < 0) f.owners.push(owner); return f.promise; }
      var n = (k === null ? issued[kind] : (issued.sites[k] || 0)) + 1;
      if (k === null) issued[kind] = n; else issued.sites[k] = n;
      var entry = { force: force, owners: [owner], issue: n };
      slot[key] = entry;
      entry.promise = run(entry).then(function (r) {
        if (slot[key] === entry) delete slot[key];
        var newest = (k === null ? issued[kind] : issued.sites[k]) === n;
        if (!destroyed && newest && keep(r)) { if (k === null) cache[kind] = r; else cache.sites[k] = r; }
        return r;
      });
      return entry.promise;
    }

    function readFc(force, owner) {
      if (cache.fc && !force) return Promise.resolve(cache.fc);
      var a = apiOf();
      if (!a || typeof a.getWorkspace !== 'function') return Promise.resolve({ ok: false, code: 'WORKSPACE_UNAVAILABLE' });
      return shared('fc', null, force, owner, function () {
        note('fcSummary.workspace.get', 'FULL');
        return Promise.resolve().then(function () { return a.getWorkspace('fcSummary', { include: { summary: false } }); }).then(function (env) {
          if (!env || env.success !== true || !isObj(env.data)) {
            var e = env && env.errors && env.errors[0];
            return { ok: false, code: (e && e.code) || 'FC_SUMMARY_READ_FAILED', message: (e && e.message) || null };
          }
          var d = env.data;
          if (!Array.isArray(d.fcRegularForecast) || !Array.isArray(d.fcSpecialEvents) || !Array.isArray(d.fcTargetRules)) {
            return { ok: false, code: 'FC_SUMMARY_RESPONSE_INCOMPLETE' };
          }
          return { ok: true, regularRows: d.fcRegularForecast, eventRows: d.fcSpecialEvents, targetRuleRows: d.fcTargetRules,
            capped: { regular: !!(d.capped && d.capped.fcRegularForecast), events: !!(d.capped && d.capped.fcSpecialEvents), rules: !!(d.capped && d.capped.fcTargetRules) },
            observedAt: (env.meta && env.meta.observedAt) || null, build: (env.meta && env.meta.workspaceBuild) || null };
        }, function (e) { return { ok: false, code: (e && e.code) || 'FC_SUMMARY_READ_FAILED' }; });
      }, function (r) { return r.ok === true; });
    }

    function readUniverse(force) {
      if (cache.universe && !force) return Promise.resolve(cache.universe);
      var p = ppwOf();
      if (!p || typeof p.getSiteUniverse !== 'function') return Promise.resolve({ ok: false, code: 'PRODUCT_PRICING_CLIENT_UNAVAILABLE', sites: [] });
      // the universe belongs to the instance, not to one load: owner -1 never matches a generation, so it is never
      // "unwanted" (it opens no productPricing page through the gate either)
      return shared('universe', null, force, -1, function () {
        note('productPricing.siteUniverse.get');
        return Promise.resolve().then(function () { return p.getSiteUniverse({}); }).then(function (env) {
          var d = env && env.data;
          if (!env || env.success !== true || !isObj(d) || !Array.isArray(d.sites)) return { ok: false, code: 'SITE_UNIVERSE_FAILED', sites: [] };
          if (d.refusals && d.refusals.length && !d.sites.length) return { ok: false, code: str(d.refusals[0].code) || 'SITE_UNIVERSE_REFUSED', sites: [] };
          var seen = {}, sites = [];
          d.sites.forEach(function (s) {
            if (!str(s.company) || !str(s.country) || !str(s.marketplace)) return;
            var k = siteKey(s); if (seen[k]) return; seen[k] = 1;
            sites.push({ key: k, company: str(s.company), country: str(s.country), marketplace: str(s.marketplace), refusals: (s.refusal_reasons || []).slice() });
          });
          return { ok: true, sites: sites, readAt: (d.schema && d.schema.read_at) || null, capped: !!d.capped };
        }, function () { return { ok: false, code: 'SITE_UNIVERSE_FAILED', sites: [] }; });
      }, function (r) { return r.ok === true; });
    }

    // every page of one site, each page through the gate; the site's state as the read owner reported it (or FAILED
    // with the code, or STOPPED when no current load wanted it any more — never cached, never painted)
    function readSite(site, force, owner, progress) {
      var k = siteKey(site);
      if (cache.sites[k] && !force) { progress(k, { phase: 'CACHED', state: cache.sites[k].state }); return Promise.resolve(cache.sites[k]); }
      var p = ppwOf();
      if (!p || typeof p.get !== 'function') return Promise.resolve({ company: site.company, country: site.country, marketplace: site.marketplace, state: 'FAILED', reason: 'PRODUCT_PRICING_CLIENT_UNAVAILABLE', rows: [], pages: 0, readAt: null, findings: [] });
      var joined = inflight.sites[k];
      var pr = shared('site', k, force, owner, function (entry) {
        var out = { company: site.company, country: site.country, marketplace: site.marketplace, state: 'READY', reason: null, rows: [], pages: 0, readAt: null, findings: [] };
        entry.listeners = [progress];
        function tell(x) { entry.listeners.forEach(function (fn) { fn(k, x); }); }
        function stopped() { out.state = 'STOPPED'; out.reason = destroyed ? 'DESTROYED' : 'NOT_WANTED'; out.rows = []; return out; }
        function page(cursor) {
          return acquire(entry).then(function (ok) {
            if (!ok) return stopped();
            note('productPricing.workspace.get', k + (cursor ? ' @' + cursor : ''));
            tell({ phase: 'PAGE', page: out.pages + 1 });
            var req;
            try { req = Promise.resolve(p.get({ scope: { company: site.company, country: site.country, marketplace: site.marketplace },
              filters: { statuses: STATUSES.slice() }, include: { regional: false, pricing: true, campaigns: true },
              page: cursor ? { cursor: cursor, limit: SITE_PAGE_LIMIT } : { limit: SITE_PAGE_LIMIT } })); } catch (e0) { req = Promise.reject(e0); }
            return req.then(function (env) { release(); return env; }, function () { release(); return null; }).then(function (env) {
              var d = env && env.data;
              if (!env || env.success !== true || !isObj(d) || !Array.isArray(d.normalizedRows)) { out.state = 'FAILED'; out.reason = 'SITE_READ_FAILED'; return out; }
              // A REFUSAL carries no measured source state (72_ ppwRefusedData_: "no source was read"; the client's local
              // refusal has none either). The most specific code is reported: the feature flag before anything else.
              var refs = Array.isArray(d.refusals) ? d.refusals : [];
              if (refs.length && !str(d.sourceState)) {
                var codes = refs.map(function (x) { return str(x && x.code); });
                out.state = 'FAILED'; out.reason = codes.indexOf('FEATURE_DISABLED') >= 0 ? 'FEATURE_DISABLED' : (codes[0] || 'SITE_READ_REFUSED'); return out;
              }
              // the scope echo: an answer for another site is never painted under this one
              if (isObj(d.scope) && siteKey(d.scope) !== k) { out.state = 'FAILED'; out.reason = 'SCOPE_ECHO_MISMATCH'; return out; }
              out.pages++;
              out.rows = out.rows.concat(d.normalizedRows);
              out.findings = out.findings.concat(d.findings || []);
              out.readAt = (d.schema && d.schema.read_at) || out.readAt;
              var st = str(d.sourceState) || 'READY';
              if (st === 'STOP_DATA_INTEGRITY') out.state = st;
              else if (st === 'SOURCE_PARTIALLY_READABLE' && out.state === 'READY') { out.state = st; out.reason = (d.refusals && d.refusals[0] && d.refusals[0].code) || null; }
              var next = d.pagination && d.pagination.nextCursor;
              if (next && out.pages >= SITE_PAGE_MAX) { if (out.state === 'READY') { out.state = 'SOURCE_PARTIALLY_READABLE'; out.reason = 'SITE_PAGE_MAX'; } return out; }
              return next ? page(next) : out;
            });
          });
        }
        return page(null).then(function (r) { tell({ phase: 'DONE', state: r.state }); return r; });
      }, function (r) { return r.state !== 'FAILED' && r.state !== 'STOPPED'; });
      // a load that joined a read in flight hears its pages too
      var now = inflight.sites[k];
      if (now && now === joined && now.listeners && now.listeners.indexOf(progress) < 0) now.listeners.push(progress);
      return pr;
    }

    /**
     * load({ sites: [{company, country, marketplace}], refresh, onProgress }) → Promise of
     *   { superseded: true } — a newer load was started (or the provider destroyed); the page must ignore this answer
     *   { ok, fc, sites: [...], requests: [...] }
     * onProgress(siteKey, { phase: 'CACHED' | 'PAGE' | 'DONE', page?, state? }) is called only while this load is current.
     */
    function load(req) {
      req = req || {};
      var mine = ++gen, force = req.refresh === true;
      if (destroyed) return Promise.resolve({ superseded: true, reason: 'DESTROYED' });
      var before = requests.length;
      var cb = typeof req.onProgress === 'function' ? req.onProgress : null;
      function progress(k, x) { if (cb && !destroyed && mine === gen) { try { cb(k, x); } catch (e) { /* a painter's error is not a read error */ } } }
      var wantedSites = (req.sites || []).filter(function (s) { return str(s.company) && str(s.country) && str(s.marketplace); });
      return Promise.all([readFc(force, mine), Promise.all(wantedSites.map(function (s) { return readSite(s, force, mine, progress); }))]).then(function (r) {
        if (destroyed || mine !== gen) return { superseded: true };
        // a current load was wanted by definition; a STOPPED answer here would be a bug, so it is never passed on as data
        var sites = r[1].map(function (x) { return x.state === 'STOPPED' ? { company: x.company, country: x.country, marketplace: x.marketplace, state: 'FAILED', reason: 'READ_STOPPED', rows: [], pages: 0, readAt: null, findings: [] } : x; });
        return { ok: r[0].ok === true, fc: r[0], sites: sites, requests: requests.slice(before), generation: mine };
      });
    }

    return {
      load: load,
      universe: function (refresh) { return readUniverse(refresh === true).then(function (u) { return destroyed ? { superseded: true } : u; }); },
      generation: function () { return gen; },
      requestLog: function () { return requests.slice(); },
      gate: function () { return { open: gate.open, peak: gate.peak, waiting: gate.waiting.length, limit: SITE_CONCURRENCY }; },
      // WHICH sources are cached now (keys only, no values) — the evidence that a late answer wrote nothing
      cached: function () { return { fc: !!cache.fc, universe: !!cache.universe, sites: Object.keys(cache.sites).sort() }; },
      // nothing written after this; waiting requests released unopened; requests already sent run out and are dropped
      destroy: function () {
        destroyed = true; gen++;
        cache = { fc: null, universe: null, sites: {} };
        var w = gate.waiting; gate.waiting = []; w.forEach(function (x) { x.resolve(false); });
      }
    };
  }

  return { create: create, SITE_PAGE_LIMIT: SITE_PAGE_LIMIT, SITE_PAGE_MAX: SITE_PAGE_MAX, SITE_CONCURRENCY: SITE_CONCURRENCY, STATUSES: STATUSES.slice(),
    contract: { writes: false, stores: false, getOperationDb: false, perRowRequests: false, bootPreload: false,
      reads: ['fcSummary.workspace.get', 'productPricing.siteUniverse.get', 'productPricing.workspace.get'] } };
});
