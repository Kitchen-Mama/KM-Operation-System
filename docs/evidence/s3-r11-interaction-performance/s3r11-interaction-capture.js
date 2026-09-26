/* =================================================================================================
 * S3-R11 — INTERACTION LATENCY CAPTURE
 * THIS FILE DEFINES  window.__kmS3R11
 * =================================================================================================
 *
 * Paste the whole file into the browser console on the real deployment. It defines ONE global and
 * touches nothing else. Two earlier tools in this series shared a filename and cost the operator an
 * afternoon of guessing which was which, so the banner above says what this one defines.
 *
 * WHY THIS EXISTS AT ALL. The S3-R11 browser harness runs under Chrome's virtual clock, which pauses
 * during task execution and jumps to the next due timer — so it measures request COUNTS exactly and
 * milliseconds not at all. Counts are a property of the control flow and survive any latency; the
 * milliseconds are a property of this deployment, this network and this machine, and only you can
 * take them.
 *
 * READ ONLY. Zero writes, zero locks, zero DB mutation. It starts no request of its own: it measures
 * the ones YOUR clicks cause, by timing between two marks you take.
 *
 * -------------------------------------------------------------------------------------------------
 * HOW TO USE
 *
 *   __kmS3R11.help()                 the list of contract names and what each one means
 *   __kmS3R11.start('SKU_SWITCH')    take this mark, then do the interaction
 *   __kmS3R11.stop()                 take it again the moment the UI is usable
 *   __kmS3R11.report()               the table, ready to paste back
 *   __kmS3R11.reset()                start a fresh session
 *
 * For an interaction with no obvious "done" moment, use stop() when YOU would call it ready to work
 * with. That judgement is the measurement — a number taken at a moment nobody would call ready is
 * worse than no number.
 *
 * Each row also carries the requests the transport issued between the two marks, read from
 * KM.transport.timeline(). That is how a slow interaction is split into "waiting for the server" and
 * "the browser was busy", which is the split this round could not make from outside the browser.
 * ================================================================================================= */
(function (root) {
  'use strict';

  /* The §1 contracts, in the order the round defines them. Kept as DATA so report() can tell an
     unmeasured contract from a measured one, rather than silently printing only what you happened
     to click. A blank row is a finding too. */
  var CONTRACTS = [
    ['MENU_CLICK_TO_ROUTE_VISIBLE_MS',        'sidebar click -> the page shell is on screen'],
    ['MENU_CLICK_TO_FIRST_USEFUL_UI_MS',      'sidebar click -> something you could act on'],
    ['SKU_DETAILS_ENTRY_TO_SHELL_MS',         'SKU Details: click -> shell'],
    ['SKU_DETAILS_ENTRY_TO_FIRST_ROWS_MS',    'SKU Details: click -> first table rows'],
    ['SKU_DETAILS_FILTER_MS',                 'SKU Details: apply a category/series filter'],
    ['SKU_DETAILS_SEARCH_MS',                 'SKU Details: type in the search box'],
    ['SKU_DETAILS_EDIT_MODAL_OPEN_MS',        'SKU Details: open the Edit SKU modal'],
    ['SKU_REGIONAL_ENTRY_TO_SHELL_MS',        'SKU Regional: click -> shell'],
    ['SKU_REGIONAL_ENTRY_TO_FIRST_MASTER_LIST_MS', 'SKU Regional: click -> master list'],
    ['SKU_SWITCH_MS',                         'SKU Regional: pick a different SKU in the list'],
    ['COUNTRY_SWITCH_MS',                     'SKU Regional: pick a different country tab'],
    ['MARKETPLACE_SWITCH_MS',                 'SKU Regional: pick a different marketplace record'],
    ['TAB_SWITCH_MS',                         'SKU Regional: pick a different section tab'],
    ['UPDATE_MODAL_OPEN_MS',                  'SKU Regional: open Update Regional SKU Data'],
    ['FC_ENTRY_TO_SHELL_MS',                  'FC Summary: click -> shell'],
    ['FC_ENTRY_TO_FIRST_ROWS_MS',             'FC Summary: click -> first table rows'],
    ['FC_TAB_SWITCH_MS',                      'FC Summary: Regular <-> Event tab'],
    ['FC_FILTER_MS',                          'FC Summary: change a filter'],
    ['FC_NEW_UPDATE_OPEN_MS',                 'FC Summary: + New FC Update opens'],
    ['FC_NEW_UPDATE_NEXT_MS',                 'FC Summary: Next click -> builder usable  <- the complaint'],
    ['FC_REGULAR_BUILDER_READY_MS',           'FC Summary: Regular builder fully populated'],
    ['FC_SPECIAL_BUILDER_READY_MS',           'FC Summary: Special builder fully populated'],
    ['PSB_ENTRY_TO_SHELL_MS',                 'Product Strategy: click -> shell'],
    ['PSB_SITE_UNIVERSE_READY_MS',            'Product Strategy: the site selector is populated'],
    ['PSB_FIRST_USEFUL_VIEW_MS',              'Product Strategy: a view renders after choosing a scope'],
    ['PSB_FILTER_MS',                         'Product Strategy: change a filter'],
    ['PRICING_MODAL_OPEN_MS',                 'Pricing: Update Regional SKU Data -> Pricing'],
    ['PRICING_TARGET_SWITCH_MS',              'Pricing: change country / marketplace'],
    ['PRICING_PREVIEW_MS',                    'Pricing: Preview click -> preview rendered'],
    ['PRICING_CONFIRM_TO_RESULT_MS',          'Pricing: Confirm -> result panel']
  ];

  var rows = [];
  var open = null;

  function tp() { try { return (root.KM && root.KM.transport) || null; } catch (e) { return null; } }

  /** Requests the transport has recorded so far. Read-only; this never dispatches anything. */
  function reqCount() {
    var t = tp();
    if (!t || typeof t.timeline !== 'function') return null;
    try {
      var tl = t.timeline();
      var list = (tl && Array.isArray(tl.request_timeline)) ? tl.request_timeline : [];
      return list.length;
    } catch (e) { return null; }
  }
  function reqSince(n0) {
    var t = tp();
    if (!t || typeof t.timeline !== 'function' || n0 === null) return { n: null, actions: null };
    try {
      var tl = t.timeline();
      var list = (tl && Array.isArray(tl.request_timeline)) ? tl.request_timeline : [];
      var mine = list.slice(n0);
      var by = {};
      mine.forEach(function (r) {
        var a = (r && (r.action || r.label)) || '(unnamed)';
        by[a] = (by[a] || 0) + 1;
      });
      return { n: mine.length, actions: by };
    } catch (e) { return { n: null, actions: null }; }
  }

  var API = {
    help: function () {
      console.log('%cS3-R11 interaction capture — __kmS3R11', 'font-weight:bold');
      console.log('start(NAME) -> do the interaction -> stop().  report() when done.\n');
      CONTRACTS.forEach(function (c) { console.log('  ' + c[0] + '\n      ' + c[1]); });
      console.log('\nAnything not on this list is fine too — start() accepts any name.');
      return CONTRACTS.length + ' contracts';
    },

    start: function (name) {
      if (!name) { console.warn('start(NAME) needs a name. __kmS3R11.help() lists them.'); return; }
      if (open) console.warn('replacing an unfinished mark for ' + open.name);
      open = { name: String(name), t0: (root.performance || Date).now(), r0: reqCount() };
      console.log('… timing ' + open.name + ' — do the interaction, then __kmS3R11.stop()');
      return open.name;
    },

    stop: function (note) {
      if (!open) { console.warn('nothing is being timed. __kmS3R11.start(NAME) first.'); return; }
      var ms = Math.round((root.performance || Date).now() - open.t0);
      var req = reqSince(open.r0);
      var row = { contract: open.name, ms: ms, requests: req.n, actions: req.actions,
                  note: note ? String(note) : '' };
      rows.push(row);
      open = null;
      console.log('  ' + row.contract + ' = ' + ms + ' ms'
        + (req.n === null ? '' : '  (' + req.n + ' request' + (req.n === 1 ? '' : 's') + ')'));
      return row;
    },

    /** Take the same contract a few times; report() gives the median, which is what to trust. */
    rows: function () { return rows.slice(); },

    report: function () {
      if (!rows.length) { console.warn('nothing measured yet.'); return null; }
      var by = {};
      rows.forEach(function (r) { (by[r.contract] = by[r.contract] || []).push(r); });
      var out = Object.keys(by).map(function (k) {
        var ms = by[k].map(function (r) { return r.ms; }).sort(function (a, b) { return a - b; });
        var mid = ms.length % 2 ? ms[(ms.length - 1) / 2]
          : Math.round((ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2);
        var reqs = by[k].map(function (r) { return r.requests; });
        return { contract: k, samples: ms.length, median_ms: mid, min_ms: ms[0], max_ms: ms[ms.length - 1],
                 requests: reqs.join('/'), notes: by[k].map(function (r) { return r.note; })
                   .filter(Boolean).join(' | ') };
      });
      try { console.table(out); } catch (e) { console.log(out); }
      var done = Object.keys(by);
      var missing = CONTRACTS.map(function (c) { return c[0]; })
        .filter(function (n) { return done.indexOf(n) === -1; });
      if (missing.length) {
        console.log('\nNOT MEASURED (' + missing.length + ') — leave them out rather than guessing:');
        missing.forEach(function (m) { console.log('  ' + m); });
      }
      console.log('\nPaste this back:\n' + JSON.stringify({ measured: out, not_measured: missing }, null, 1));
      return out;
    },

    reset: function () { rows = []; open = null; console.log('cleared'); return true; },

    contract: {
      build: 'S3-R11',
      defines: '__kmS3R11',
      read_only: true,
      dispatches_requests: false,
      writes: false,
      reads_transport_timeline: true
    }
  };

  root.__kmS3R11 = API;
  console.log('%c__kmS3R11 ready — read only. __kmS3R11.help() for the contract list.',
    'color:#2563EB;font-weight:bold');
}(typeof window !== 'undefined' ? window : this));
