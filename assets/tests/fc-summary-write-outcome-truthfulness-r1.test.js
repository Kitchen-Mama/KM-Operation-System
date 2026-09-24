// Kitchen Mama Operation System — FC-SUMMARY-R1
// WRITE OUTCOME TRUTHFULNESS, MODAL RECOVERY AND SINGLE-FLIGHT UX
//
// THE INCIDENT THIS LOCKS SHUT. An operator saved 90 SKUs of Regular Forecast. The rows reached the
// database. The browser then showed: a modal that never closed, a Save button that stayed disabled, no
// success message, and a red "FC Summary read error: No answer arrived within 60s" painted into the
// table BEHIND the modal. `_fcAfterWrite(cb)` ran the callback — the one that closes the modal and says
// "saved" — only if the POST-WRITE RE-READ succeeded. So a completed write was presented as a failed
// one, and the only obvious response, pressing Save again, is the single action that must never be
// taken while an outcome is unknown.
//
// WHAT IS ASSERTED HERE, AND HOW. Nothing is proved by reading source text. Every scenario drives the
// REAL page functions inside a vm sandbox with a stub DOM, controlled promise responses and counted
// stubs, and then reads the observable result: which messages were shown, whether the modal closed,
// whether the table was replaced or preserved, how many logical requests were issued, and what state
// each latch ended in. The mutants are scored the same way — a mutation that cannot change an observed
// value is not a test, and one whose anchor no longer matches is scored SURVIVED rather than silently
// passing.
//
// THE FOUR OUTCOMES THAT MUST NEVER COLLAPSE:
//   confirmed success · confirmed server refusal · unknown outcome · readback failure after a success.
// Only the second may keep the modal open as a failure; only the first may close it as a success; and
// the last one is not a write outcome at all.
// Run: node assets/tests/fc-summary-write-outcome-truthfulness-r1.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (the F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, neg = { caught: 0, missed: 0 };
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function score(label, r) {
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var FC = fs.readFileSync(path.join(__dirname, '..', 'js/pages/fc-summary.js'), 'utf8').replace(/\r\n/g, '\n');
var HTML = fs.readFileSync(path.join(__dirname, '..', 'html/pages/fc-summary.html'), 'utf8').replace(/\r\n/g, '\n');

function extractFn(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
/* Comments are prose, not behaviour. A check that greps the whole file would match the sentence
   EXPLAINING that a call is gone and read it as the call itself, so the structural checks below run
   against comment-stripped source. */
function stripComments(src) {
  return src.replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
function extractVar(src, name) {
  var re = new RegExp('^var ' + name + '\\s*=', 'm');
  var m = re.exec(src);
  if (!m) throw new Error('var not found: ' + name);
  // run to the first ';' that closes at depth 0
  var i = m.index, d = 0;
  for (var j = i; j < src.length; j++) {
    var c = src[j];
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
    else if (c === ';' && d === 0) return src.slice(i, j + 1);
  }
  throw new Error('unterminated var: ' + name);
}
/** A mutation whose anchor is not unique returns null and is SCORED AS SURVIVED. */
function mutate(src, from, to) {
  var n = src.split(from).length - 1;
  if (n !== 1) { console.error('  (mutant anchor matched ' + n + ' times — not applied)'); return null; }
  return src.split(from).join(to);
}

var VARS = [
  // FC-SUMMARY-R3-R1 — the read paths name a SLICE now instead of asking for the whole workspace,
  // so the slice vocabulary has to be in the sandbox for them to resolve.
  'FC_SLICE_', 'FC_FRESH_', '_FC_TAB_SLICE_', '_FC_SLICE_KEYS_', '_FC_MODEL_KEYS_', '_fcSliceState_',
  'FC_PREREQ_', 'FC_WRITE_', 'FC_VIEW_', 'FC_MSG_',
  // A3-R9 §8 — the non-retryable code set _fcPrereqRetryable_ consults.
  '_FC_NONRETRYABLE_PREREQ_', '_fcPrereqLastError_',
  // FC-SUMMARY-R2B-A2-R3 — the retry-state map. The banner's LABEL and the sentence that names it now
  // come from one place, so both must be in the sandbox for the functions below to resolve.
  'FC_RETRY_', 'FC_RETRY_LABEL_',
  // INCIDENT-BOOT-FC-R1 §4D — the stage vocabulary the refusal banner names.
  'FC_STAGE_', 'FC_UNREADABLE_CODES_',
  '_fcPrereqState_', '_fcPrereqFlight_',
  // S2-R4B §10 — the index of what is CURRENTLY being fetched, per table. The loader reads it to join
  // a request already in flight instead of issuing the same one again.
  '_fcPrereqInflightTables_',
  '_fcPrereqLoads_', '_fcPrereqTransition_', '_fcWriteState_', '_fcWriteFlight_', '_fcViewState_', '_fcReadbackFlight_',
  '_fcReadbackLoads_', '_fcLastReceipt_', '_fcMeta_', '_FC_SECONDARY_TABLES', '_fcSecondaryLoaded',
  // R2B-A3-R1 — prerequisites are now per BUILDER PATH: the table lists, the loaded-path latch and the
  // per-path in-flight map. The single `_fcPrereqFlight_` above is kept — the diagnostics still read it.
  // R2B-A3-R5 — and per TABLE, which is what the loader now consults to decide what to fetch.
  '_FC_PREREQ_TABLES_', '_fcPrereqLoadedPaths_', '_fcPrereqLoadedTables_', '_fcPrereqFlightByPath_'];
var FNS = [
  '_fcSliceRec_', '_fcWorkspaceMode_', '_fcHas_', '_fcSliceHasData_', '_fcTabNow_',
  // _fcSliceFetch_ is deliberately NOT lifted: this sandbox INJECTS it so readbacks can be counted.
  '_fcEffectiveWorkspace', '_fcMergeSlice_', '_fcFailedSlices_', '_fcYearsOf_',
  '_fcValidWorkspaceData_', '_fcValidReadModel_',
  '_fcEpoch_', '_fcOwns_', '_fcNoteEnvMeta_', '_fcMetricsSnapshot_',
  // FC-SUMMARY-R2B-A2-R3 — _fcRetryLabel_ and _fcErrDetail_ are read by every banner path in this file.
  '_fcRetryLabel_', '_fcErrDetail_', '_fcFailureStage_', '_fcStageText_', '_fcBannerHost_',
  // INCIDENT-BOOT-FC-R1 — the readback paths now hydrate through one authority instead of re-rendering
  // the rows alone. The write-outcome assertions below are untouched.
  '_fcClearBanner_', '_fcShowBanner_', '_fcRerenderTables_', '_fcHydrateFromModel_',
  '_fcRefreshViewNow_', '_fcPrereqPath_', '_fcPrereqNeeded_', '_fcPrereqMissing_',
  // A3-R9 §8 — the loader now classifies a failure as retryable or not before setting the state.
  '_fcPrereqRetryable_',
  // R2B-A3-R5 — opening a builder settles TWO owners: the broad-cache tables and, for the Special
  // path, the forecast slice its Base FC column reads. proceedToFcMode awaits both through here.
  '_fcBaseFcSourceMissing_', '_fcEnsureBaseFcSource_', '_fcPrereqAndSources_',
  '_fcLoadPrerequisites_', '_fcOnModeSelected_', '_fcResetSecondaryCache',
  '_fcNextBtn_', '_fcSetNextBusy_', '_fcClearPrereqRefusal_',
  '_fcShowPrereqRefusal_', '_fcOpenBuilder_', '_fcWriteBegin_', '_fcWriteEnd_', '_fcClassifyWrite_',
  '_fcSummaryOf_', '_fcCountsLine_', '_fcReceipt_', '_fcRefusalText_', '_fcUnknownOutcome_',
  // FC-SUMMARY-R2B-A — _fcFailWrite_ now classifies a PROVEN zero-write refusal apart from an unknown
  // outcome, so its three collaborators join the sandbox. This rig publishes no KM.DB.zeroWriteProven, so
  // the bridge answers false and every scenario below keeps the outcome it already asserted — which is the
  // point: a transport failure must NOT become a claimed refusal just because the classifier now exists.
  '_fcZeroWriteProven_', '_fcCanonicalCode_', '_fcZeroWriteRefusal_',
  // R2-STABILITY §4 — `_fcAfterWrite` now starts a post-write warm-up beside the readback, and the
  // reset it calls first consults the write receipts. Both travel with it, along with the two lookups
  // they read. This rig publishes neither `refreshCacheTables` nor `reconcileCacheRow`, so the warm-up
  // issues nothing and the reconcile keeps nothing — every outcome asserted below is unchanged, which
  // is the point: a post-write optimisation must not change what the operator is TOLD happened.
  // S2-R4B §10 — the post-write warm-up now publishes the tables it is fetching and the loader joins
  // them, so a Builder reopened during the warm-up window issues nothing instead of the same read twice.
  // The index and its three helpers are part of that pair and travel with them. Nothing this rig
  // asserts about write OUTCOMES changes: it publishes no refreshCacheTables, so the warm-up still
  // issues nothing and the join list is still empty.
  '_fcMarkTablesInflight_', '_fcReleaseTablesInflight_', '_fcInflightFor_', '_fcSettlePrereqPath_',
  '_fcReconcileFromReceipts_', '_fcPostWriteWarm_', '_fcPrereqMissing_', '_fcSliceTables_',
  '_fcSettleWrite_', '_fcFailWrite_', '_fcAfterWrite', '_fcEffectiveWorkspace', '_fcErrDetail_',
  'proceedToFcMode', '_fcSetTargetSaveEnabled_'];

function pageSource(src) {
  return VARS.map(function (v) { return extractVar(src, v); })
    .concat(FNS.map(function (f) { return extractFn(src, f); })).join('\n');
}

// -------------------------------------------------------------------------------------------------
// The rig: a stub DOM small enough to read, real enough that "did the modal close" and "was the table
// replaced" are answerable.
// -------------------------------------------------------------------------------------------------
function makeDom() {
  var byId = Object.create(null);
  function el(tag) {
    var e;
    var self = {
      tagName: tag, children: [], _text: '', _html: '', hidden: false, disabled: false,
      dataset: {}, attrs: {}, onclick: null, style: {}, _id: null,
      appendChild: function (c) { self.children.push(c); return c; },
      setAttribute: function (k, v) { self.attrs[k] = String(v); },
      removeAttribute: function (k) { delete self.attrs[k]; },
      getAttribute: function (k) { return self.attrs[k] === undefined ? null : self.attrs[k]; },
      click: function () { if (typeof self.onclick === 'function') self.onclick({}); },
      // the whole subtree as text, so an assertion can ask "is the Retry control visible"
      text: function () {
        return self._text + self.children.map(function (c) { return c.text ? c.text() : ''; }).join(' ');
      }
    };
    Object.defineProperty(self, 'textContent', {
      get: function () { return self._text; }, set: function (v) { self._text = String(v); }
    });
    Object.defineProperty(self, 'innerHTML', {
      get: function () { return self._html; },
      set: function (v) { self._html = String(v); if (v === '') self.children.length = 0; }
    });
    Object.defineProperty(self, 'id', {
      get: function () { return self._id; },
      set: function (v) { self._id = String(v); byId[self._id] = self; }
    });
    e = self; return e;
  }
  var doc = {
    createElement: el,
    getElementById: function (id) { return byId[id] || null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    __add: function (id) { var e = el('div'); e.id = id; return e; },
    __byId: byId
  };
  // the hosts the page addresses by id
  doc.__add('fc-view-banner').hidden = true;
  doc.__add('fc-mode-select-refusal').hidden = true;
  var nxt = doc.__add('button'); nxt.id = 'fc-mode-next-btn'; nxt.textContent = 'Next';
  var tgt = doc.__add('button'); tgt.id = 'fc-target-save-btn';
  return doc;
}

/** Build a sandbox holding the REAL page functions with controlled collaborators. */
function rig(opts) {
  opts = opts || {};
  var src = opts.src || FC;
  var seen = {
    alerts: [], closes: 0, renders: 0, opened: [], readbacks: 0, prereqCalls: 0,
    errorRedraws: 0, showModal: []
  };
  var doc = makeDom();
  var epoch = { n: opts.epoch === undefined ? 1 : opts.epoch, current: opts.current === undefined ? 1 : opts.current };
  var sandbox = {
    console: console, Promise: Promise, Date: Date, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, Math: Math, setTimeout: setTimeout,
    document: doc,
    alert: function (m) { seen.alerts.push(String(m)); },
    window: {
      _opDbCache: opts.opDbCache === undefined ? null : opts.opDbCache,
      KM: {
        lifecycle: {
          currentEpoch: function () { return epoch.n; },
          commitGuard: function (e, sec) { return e === epoch.current && sec === 'fc-summary-section'; },
          isCurrent: function (e) { return e === epoch.current; }
        },
        DB: {
          refreshCacheTables: opts.refreshCacheTables || function () { seen.prereqCalls++; return Promise.resolve(); }
        },
        api: { workspaceApiActive: function () { return opts.workspaceActive !== false; } }
      }
    },
    // page collaborators the R1 block calls but does not own
    _fcReadModel: opts.readModel === undefined ? { fcRegularForecast: [1] } : opts.readModel,
    _fcUseDb: function () { return opts.live !== false; },
    _fcResetSecondaryCache: function () { },
    // FC-SUMMARY-R3-R1 — the readback names a SLICE now; the injected fake follows the boundary and the
    // readback count keeps meaning exactly what it meant.
    _fcSliceFetch_: opts.workspaceRefresh || function () { seen.readbacks++; return Promise.resolve(); },
    _fcRenderError_: function () { seen.errorRedraws++; },
    renderFcRegularTable: function () { seen.renders++; },
    // INCIDENT-BOOT-FC-R1 — driven by the hydration authority; counted so a readback that skipped
    // hydration entirely would be visible here rather than passing quietly.
    _populateFcFilterOptionsFromDb: function () { seen.hydrations = (seen.hydrations || 0) + 1; },
    _populateFcYearFromDb: function () { seen.hydrations = (seen.hydrations || 0) + 1; },
    renderFcEventTable: function () { seen.renders++; },
    renderTargetRulesTable: function () { seen.renders++; },
    closeFcModal: function () { seen.closes++; },
    showFcModal: function (id) { seen.showModal.push(id); },
    openRegularUpdateModal: function () { seen.opened.push('regular'); },
    openEventModal: function () { seen.opened.push('event'); }
  };
  sandbox.window.document = doc;
  vm.createContext(sandbox);
  vm.runInContext(pageSource(src), sandbox, { filename: 'fc-r1-sandbox.js' });
  sandbox.__seen = seen;
  sandbox.__doc = doc;
  sandbox.__epoch = epoch;
  return sandbox;
}

var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
function settle(n) { var p = Promise.resolve(); for (var i = 0; i < (n || 6); i++) p = p.then(tick); return p; }
function deferred() { var d = {}; d.promise = new Promise(function (res, rej) { d.resolve = res; d.reject = rej; }); return d; }
function banner(S) { return S.__doc.getElementById('fc-view-banner'); }
function refusal(S) { return S.__doc.getElementById('fc-mode-select-refusal'); }
function nextBtn(S) { return S.__doc.getElementById('fc-mode-next-btn'); }

function main() {
  return Promise.resolve()

    // =============================================================================================
    .then(function () { section('A — NEXT / PREREQUISITE READINESS'); })

    .then(function () {
      // 1 — prerequisites resolve immediately
      var S = rig({ opDbCache: null });
      S.proceedToFcMode();
      return settle().then(function () {
        eq(S.__seen.opened, ['regular'], 'A1  prerequisites resolve → the builder opens exactly once');
        eq(S._fcPrereqLoads_, 1, 'A2  and exactly one logical prerequisite load was issued');
        ok(nextBtn(S).disabled === false, 'A3  the Next control is restored');
        ok(refusal(S).hidden === true, 'A4  with no refusal shown');
      });
    })

    .then(function () {
      // 2 + 5 — slow prerequisites, and five extra clicks while loading
      var d = deferred();
      var calls = 0;
      var S = rig({ opDbCache: null, refreshCacheTables: function () { calls++; return d.promise; } });
      S.proceedToFcMode();
      var busyImmediately = nextBtn(S).disabled === true
        && nextBtn(S).getAttribute('aria-busy') === 'true'
        && /Loading/.test(nextBtn(S).textContent);
      ok(busyImmediately, 'A5  feedback is visible in the SAME event loop: disabled + aria-busy + Loading…',
        { disabled: nextBtn(S).disabled, busy: nextBtn(S).getAttribute('aria-busy'), label: nextBtn(S).textContent });
      for (var i = 0; i < 5; i++) S.proceedToFcMode();
      eq(calls, 1, 'A6  five extra Next clicks while loading produce exactly ONE logical load');
      eq(S.__seen.opened, [], 'A7  and no builder opens while the load is in flight');
      d.resolve();
      return settle().then(function () {
        eq(S.__seen.opened, ['regular'], 'A8  when it lands, the builder opens exactly once — not six times');
        ok(nextBtn(S).disabled === false && nextBtn(S).getAttribute('aria-busy') === null,
          'A9  and the busy state is released');
      });
    })

    .then(function () {
      // 3 + 4 — one prerequisite refuses, then Retry succeeds
      var calls = 0, failFirst = true;
      var S = rig({ opDbCache: null, refreshCacheTables: function () {
        calls++;
        if (failFirst) { failFirst = false; return Promise.reject({ code: 'READ_FAILED', message: 'prereq down' }); }
        return Promise.resolve();
      } });
      S.proceedToFcMode();
      return settle().then(function () {
        eq(S.__seen.opened, [], 'A10 a prerequisite failure opens NO builder');
        eq(S.__seen.closes, 0, 'A11 and does not close the selection modal');
        ok(refusal(S).hidden === false, 'A12 the refusal is shown INSIDE the modal');
        ok(/Prerequisite data could not be loaded/.test(refusal(S).text()),
          'A13 with the typed prerequisite message', refusal(S).text());
        ok(/Retry/.test(refusal(S).text()), 'A14 and a visible Retry control');
        eq(calls, 1, 'A15 with NO automatic re-entry — the old code retried forever here');
        eq(S._fcPrereqState_, 'PREREQUISITE_REFUSED', 'A16 state = PREREQUISITE_REFUSED');
        // Retry
        var retry = S.__doc.getElementById('fc-mode-retry-btn');
        ok(!!retry, 'A17 the Retry control is addressable');
        retry.click();
        return settle().then(function () {
          eq(calls, 2, 'A18 Retry issues exactly ONE new logical load');
          eq(S.__seen.opened, ['regular'], 'A19 and the builder then opens');
          ok(refusal(S).hidden === true, 'A20 with the refusal cleared');
        });
      });
    })

    .then(function () {
      // 6 + 7 — unmount before settle, then a LATE SUCCESS after unmount
      var d = deferred();
      var S = rig({ opDbCache: null, refreshCacheTables: function () { return d.promise; } });
      S.proceedToFcMode();
      S.__epoch.current = 99;                       // the operator routed away
      d.resolve();
      return settle().then(function () {
        eq(S.__seen.opened, [], 'A21 a late prerequisite SUCCESS after unmount opens nothing');
        eq(S._fcPrereqState_, 'UNMOUNTED', 'A22 and the controller records UNMOUNTED');
      });
    })

    .then(function () {
      // 8 — late FAILURE after unmount
      var d = deferred();
      var S = rig({ opDbCache: null, refreshCacheTables: function () { return d.promise; } });
      S.proceedToFcMode();
      S.__epoch.current = 99;
      d.reject({ code: 'READ_FAILED', message: 'late' });
      return settle().then(function () {
        ok(refusal(S).hidden === true, 'A23 a late prerequisite FAILURE after unmount mutates no DOM');
        eq(S._fcPrereqState_, 'UNMOUNTED', 'A24 and records UNMOUNTED');
      });
    })

    .then(function () {
      // R2B-A3-R1 — "ALREADY PRESENT" IS NOW A CLAIM ABOUT A PATH, NOT ABOUT AN OBJECT EXISTING.
      //
      // This block used to assert readiness by handing the rig an `_opDbCache` with a single table in
      // it, because the old test was `!window._opDbCache` — the mere EXISTENCE of the cache object.
      // That was a fail-open: another page loading skuDetails alone satisfied it, and the Special
      // Event builder then opened with no campaigns and no pricing_list, showing empty datalists over
      // tables nobody had fetched. Readiness is now per builder path and page-local, so the rig says
      // which PATH is loaded. What A25 and A26 assert is unchanged: a ready path issues no request
      // and opens the builder in the same tick.
      var calls = 0;
      var S = rig({ opDbCache: { skuDetails: [] }, refreshCacheTables: function () { calls++; return Promise.resolve(); } });
      S._fcPrereqLoadedPaths_.regular = true;
      S.proceedToFcMode();
      eq(calls, 0, 'A25 with prerequisites already loaded, Next issues no request at all');
      eq(S.__seen.opened, ['regular'], 'A26 and opens the builder synchronously');
    })

    .then(function () {
      // And the fail-open it replaced: a cache object that exists but holds none of THIS path's
      // tables no longer counts as ready.
      var calls = 0;
      var S = rig({ opDbCache: { skuDetails: [] }, refreshCacheTables: function () { calls++; return Promise.resolve(); } });
      S.proceedToFcMode();
      eq(calls, 1, 'A25a a populated-by-someone-else cache is NOT this path being loaded');
      eq(S.__seen.opened, [], 'A25b so the builder does not open over tables nobody fetched');
    })

    // =============================================================================================
    .then(function () { section('B — CONFIRMED SUCCESS IS REPORTED INDEPENDENTLY OF THE READBACK'); })

    .then(function () {
      // scenario 1 — confirmed success + readback success
      var S = rig({});
      var closed = 0;
      S._fcAfterWrite(function () { closed++; S.alert('Saved successfully. rows: 3'); });
      var closedBeforeReadback = (closed === 1);
      ok(closedBeforeReadback, 'B1  the modal closes and success is reported BEFORE the readback resolves');
      return settle().then(function () {
        eq(S.__seen.readbacks, 1, 'B2  exactly one readback is issued');
        eq(S._fcViewState_, 'CURRENT', 'B3  and the view returns to CURRENT');
        ok(banner(S).hidden === true, 'B4  with no banner');
        eq(S.__seen.errorRedraws, 0, 'B5  and the error redraw is never used on this path');
      });
    })

    .then(function () {
      // scenario 2 + 3 — confirmed success + readback timeout, and + redirect-target 404
      var cases = [
        ['readback timeout', { code: 'REQUEST_TIMEOUT', message: 'No answer arrived within 60s.' }],
        ['redirect-target 404', { code: 'HTTP_NOT_FOUND_HTML', message: 'delivery target returned 404' }]
      ];
      return cases.reduce(function (p, c) {
        return p.then(function () {
          var S = rig({ workspaceRefresh: function () { return Promise.reject(c[1]); } });
          var closed = 0;
          S._fcAfterWrite(function () { closed++; S.alert('Saved successfully. rows: 90'); });
          eq(closed, 1, 'B6  [' + c[0] + '] the modal still closes — the write was confirmed');
          return settle().then(function () {
            ok(/Saved successfully/.test(S.__seen.alerts.join(' ')),
              'B7  [' + c[0] + '] success was reported', S.__seen.alerts);
            ok(!/could not be confirmed|refused/.test(S.__seen.alerts.join(' ')),
              'B8  [' + c[0] + '] and never contradicted', S.__seen.alerts);
            eq(S.__seen.errorRedraws, 0, 'B9  [' + c[0] + '] the table was NOT replaced by a read error');
            ok(S._fcReadModel !== null, 'B10 [' + c[0] + '] the last known data is preserved');
            eq(S._fcViewState_, 'STALE_AFTER_CONFIRMED_WRITE', 'B11 [' + c[0] + '] the VIEW is marked stale');
            ok(banner(S).hidden === false, 'B12 [' + c[0] + '] a non-blocking banner is shown');
            ok(/Saved successfully, but the view could not refresh/.test(banner(S).text()),
              'B13 [' + c[0] + '] with the exact stale message', banner(S).text());
            ok(/Refresh view/.test(banner(S).text()), 'B14 [' + c[0] + '] and one Refresh view control');
            ok(!/Save/.test(banner(S).text().replace(/Saved successfully, but the view could not refresh\./, '')),
              'B15 [' + c[0] + '] the remedy offered is a READ, never another Save');
          });
        });
      }, Promise.resolve());
    })

    .then(function () {
      // scenario 9 + 10 — readback retry success, then readback retry failure, single-flight
      var n = 0;
      var S = rig({ workspaceRefresh: function () {
        n++;
        return (n === 1) ? Promise.reject({ code: 'REQUEST_TIMEOUT', message: 'slow' }) : Promise.resolve();
      } });
      S._fcAfterWrite(function () { });
      return settle().then(function () {
        eq(S._fcViewState_, 'STALE_AFTER_CONFIRMED_WRITE', 'B16 the view is stale after the failed readback');
        var btn = S.__doc.getElementById('fc-view-refresh-btn');
        ok(!!btn, 'B17 the Refresh view control is addressable');
        btn.click(); btn.click(); btn.click();      // three activations while one is in flight
        return settle().then(function () {
          eq(n, 2, 'B18 three clicks issue exactly ONE new read — the retry is single-flight');
          eq(S._fcViewState_, 'CURRENT', 'B19 a successful retry clears the stale state');
          ok(banner(S).hidden === true, 'B20 and removes the banner');
          eq(S.__seen.renders >= 1, true, 'B21 and re-renders from the fresh data');
        });
      });
    })

    .then(function () {
      var m = 0;
      var S = rig({ workspaceRefresh: function () { m++; return Promise.reject({ code: 'REQUEST_TIMEOUT', message: 'still down' }); } });
      S._fcAfterWrite(function () { });
      return settle().then(function () {
        S.__doc.getElementById('fc-view-refresh-btn').click();
        return settle().then(function () {
          eq(m, 2, 'B22 a failed readback retry issues one read and no more');
          eq(S._fcViewState_, 'STALE_AFTER_CONFIRMED_WRITE', 'B23 the view stays stale');
          eq(S.__seen.errorRedraws, 0, 'B24 and STILL does not replace the table with an error');
          ok(banner(S).hidden === false, 'B25 the banner remains, offering the read again');
        });
      });
    })

    // =============================================================================================
    .then(function () { section('C — REFUSAL, UNKNOWN OUTCOME AND THE THREE-WAY SPLIT'); })

    .then(function () {
      var S = rig({});
      eq(S._fcClassifyWrite_({ success: true, data: {} }), 'CONFIRMED_SUCCESS', 'C1  success:true → CONFIRMED_SUCCESS');
      eq(S._fcClassifyWrite_({ success: false, error: 'bad scope' }), 'CONFIRMED_REFUSAL', 'C2  success:false → CONFIRMED_REFUSAL');
      eq(S._fcClassifyWrite_(null), 'OUTCOME_UNKNOWN', 'C3  a null answer → OUTCOME_UNKNOWN, never success');
      eq(S._fcClassifyWrite_(undefined), 'OUTCOME_UNKNOWN', 'C4  an absent answer → OUTCOME_UNKNOWN');
      eq(S._fcClassifyWrite_('<html>...'), 'OUTCOME_UNKNOWN', 'C5  a malformed/unreadable answer → OUTCOME_UNKNOWN');
      eq(S._fcClassifyWrite_({ data: { summary: {} } }), 'CONFIRMED_SUCCESS', 'C6  an envelope without success:false is a success');
    })

    .then(function () {
      // scenario 4 — confirmed refusal
      var S = rig({});
      var reenabled = [], opened = 0;
      var outcome = S._fcSettleWrite_({ success: false, error: 'scope changed' }, {
        ctl: 'regular', op: 'Regular Forecast Save', rows: 3, epoch: 1,
        reenable: function (v) { reenabled.push(v); },
        onSuccess: function () { opened++; }
      });
      eq(outcome, 'CONFIRMED_REFUSAL', 'C7  a server refusal is classified as a refusal');
      eq(opened, 0, 'C8  the success path never runs');
      eq(S.__seen.closes, 0, 'C9  nothing is closed as success');
      eq(reenabled, [true], 'C10 Save is re-enabled so the operator can fix and retry');
      ok(/The server refused the save: scope changed/.test(S.__seen.alerts.join(' ')),
        'C11 with the typed refusal reason', S.__seen.alerts);
      return settle().then(function () {
        eq(S.__seen.readbacks, 0, 'C12 and NO readback is started after a refusal');
      });
    })

    .then(function () {
      // scenario 5 + 6 — malformed response, and network failure
      var S1 = rig({});
      var re1 = [];
      var o1 = S1._fcSettleWrite_('<!DOCTYPE html>', { ctl: 'regular', op: 'x', rows: 1, epoch: 1, reenable: function (v) { re1.push(v); }, onSuccess: function () { } });
      eq(o1, 'OUTCOME_UNKNOWN', 'C13 a malformed response is an UNKNOWN outcome, not a success');
      ok(/could not be confirmed/.test(S1.__seen.alerts.join(' ')), 'C14 and says so');
      ok(/Do not submit again until the latest data has been checked/.test(S1.__seen.alerts.join(' ')),
        'C15 with the instruction not to resubmit', S1.__seen.alerts);
      ok(!/Saved successfully/.test(S1.__seen.alerts.join(' ')), 'C16 and never claims success');
      ok(!/The server refused/.test(S1.__seen.alerts.join(' ')), 'C17 nor claims definite failure');
      eq(re1, [true], 'C18 the permanent busy state is released');
      ok(banner(S1).hidden === false && /Check latest data/.test(banner(S1).text()),
        'C19 and a read-only reconciliation control is offered', banner(S1).text());

      var S2 = rig({});
      var re2 = [];
      S2._fcFailWrite_({ code: 'HTTP_TRANSPORT_ERROR', message: 'network down' },
        { ctl: 'regular', op: 'x', rows: 1, epoch: 1, reenable: function (v) { re2.push(v); } });
      eq(S2._fcWriteState_.regular, 'OUTCOME_UNKNOWN', 'C20 a network failure leaves OUTCOME_UNKNOWN');
      ok(/could not be confirmed/.test(S2.__seen.alerts.join(' ')), 'C21 and is reported as unknown');
      return settle().then(function () {
        eq(S2.__seen.readbacks, 0, 'C22 with NO automatic readback and NO automatic write replay');
      });
    })

    .then(function () {
      // the unknown-outcome reconciliation control performs a READ
      var S = rig({});
      S._fcFailWrite_({ code: 'X', message: 'y' }, { ctl: 'regular', op: 'x', rows: 1, epoch: 1 });
      var btn = S.__doc.getElementById('fc-view-refresh-btn');
      ok(!!btn && /Check latest data/.test(btn.textContent), 'C23 the control is "Check latest data"');
      btn.click();
      return settle().then(function () {
        eq(S.__seen.readbacks, 1, 'C24 and it issues exactly one READ — never another write');
      });
    })

    // =============================================================================================
    .then(function () { section('D — SINGLE-FLIGHT AND LIFECYCLE OWNERSHIP'); })

    .then(function () {
      // scenario 7 — repeated clicks while writing, for every control
      var S = rig({});
      var ctls = ['regular', 'baseEdit', 'event', 'targetRule', 'import', 'eventBuilder'];
      var bad = ctls.filter(function (c) {
        var first = S._fcWriteBegin_(c);
        var extra = [0, 1, 2, 3, 4].filter(function () { return S._fcWriteBegin_(c) === true; }).length;
        return !(first === true && extra === 0);
      });
      eq(bad, [], 'D1  every control latches: the first click starts a write, five more start none');
      ok(S._fcWriteBegin_('regular') === false, 'D2  and the latch stays closed until the write ends');
      S._fcWriteEnd_('regular', S.FC_WRITE_.SUCCESS);
      ok(S._fcWriteBegin_('regular') === true, 'D3  reopening only after the outcome is recorded');
      ok(S._fcWriteBegin_('baseEdit') === false, 'D4  and the latches are per-control, not global');
    })

    .then(function () {
      // scenario 8 — route-away before the write settles
      var S = rig({});
      S._fcWriteBegin_('regular');
      S.__epoch.current = 42;                       // routed away while the write is in flight
      var opened = 0, reenabled = 0;
      var outcome = S._fcSettleWrite_({ success: true, data: { summary: { created: 1, updated: 2 } } }, {
        ctl: 'regular', op: 'Regular Forecast Save', rows: 3, epoch: 1,
        reenable: function () { reenabled++; }, onSuccess: function () { opened++; }
      });
      eq(outcome, 'CONFIRMED_SUCCESS', 'D5  a write that settles after route-away is still classified');
      eq(opened, 0, 'D6  but nothing is drawn into the dead page');
      eq(reenabled, 0, 'D7  and no control on it is touched');
      eq(S.__seen.closes, 0, 'D8  no modal is closed');
      eq(S._fcWriteState_.regular, 'UNMOUNTED', 'D9  the controller records UNMOUNTED');
      ok(S._fcLastReceipt_ && S._fcLastReceipt_.operation === 'Regular Forecast Save',
        'D10 while the OUTCOME is preserved for reconciliation', S._fcLastReceipt_);
      return settle().then(function () {
        eq(S.__seen.readbacks, 0, 'D11 and a dead controller starts no readback');
      });
    })

    .then(function () {
      // a readback that settles after route-away mutates nothing
      var d = deferred();
      var S = rig({ workspaceRefresh: function () { return d.promise; } });
      S._fcAfterWrite(function () { });
      S.__epoch.current = 42;
      d.reject({ code: 'REQUEST_TIMEOUT', message: 'late' });
      return settle().then(function () {
        ok(banner(S).hidden === true, 'D12 a late readback failure after unmount shows no banner');
        eq(S.__seen.errorRedraws, 0, 'D13 and redraws nothing');
      });
    })

    // =============================================================================================
    .then(function () { section('E — THE RESPONSE PATH, RECEIPTS AND METRICS'); })

    .then(function () {
      var S = rig({});
      eq(S._fcSummaryOf_({ success: true, data: { summary: { created: 4, updated: 5, skipped: 6 } } }),
        { created: 4, updated: 5, skipped: 6 }, 'E1  the summary is read from res.data.summary — the level the server sends');
      eq(S._fcSummaryOf_({ success: true, summary: { created: 1 } }), { created: 1 },
        'E2  the legacy level still works where a writer uses it');
      eq(S._fcSummaryOf_({ success: true }), null, 'E3  and an ABSENT manifest stays absent');
      eq(S._fcCountsLine_(null), '', 'E4  a missing manifest prints nothing — never "0"');
      ok(/Created: 4/.test(S._fcCountsLine_({ created: 4, updated: 5 })) && /Updated: 5/.test(S._fcCountsLine_({ created: 4, updated: 5 })),
        'E5  a present manifest prints exactly the counts supplied');
      ok(S._fcCountsLine_({ created: 4 }).indexOf('Updated') < 0,
        'E6  and never invents the ones it was not given', S._fcCountsLine_({ created: 4 }));
    })

    .then(function () {
      var S = rig({});
      S._fcSettleWrite_({ success: true, data: { summary: { created: 2, updated: 88 } } }, {
        ctl: 'regular', op: 'Regular Forecast Save', rows: 90, epoch: 1, onSuccess: function () { }
      });
      var r = S._fcLastReceipt_;
      ok(!!r, 'E7  a confirmed write leaves a receipt');
      eq(r.operation, 'Regular Forecast Save', 'E8  naming the operation');
      eq(r.rows, 90, 'E9  the affected row count');
      eq(r.summary, { created: 2, updated: 88 }, 'E10 the manifest as supplied');
      ok(typeof r.at === 'number' && r.at > 0, 'E11 and a timestamp');
      eq(r.metrics.serverDurationMs, 'unknown', 'E12 a metric the envelope did not carry is "unknown", not 0');
      eq(r.metrics.attempts, 'unknown', 'E13 and so are attempts');
    })

    .then(function () {
      var S = rig({});
      S._fcNoteEnvMeta_({ meta: { serverDurationMs: 8123, attempts: 2, requestId: 'REQ-S000042' } });
      var m = S._fcMetricsSnapshot_();
      eq(m.serverDurationMs, 8123, 'E14 a present serverDurationMs is captured verbatim');
      eq(m.attempts, 2, 'E15 so are attempts');
      eq(m.requestId, 'REQ-S000042', 'E16 and the request id when the envelope supplies one');
      var S2 = rig({});
      S2._fcNoteEnvMeta_({ meta: {} });
      eq(S2._fcMetricsSnapshot_().serverDurationMs, 'unknown', 'E17 an empty meta invents nothing');
      S2._fcNoteEnvMeta_(null);
      eq(S2._fcMetricsSnapshot_().attempts, 'unknown', 'E18 and neither does a missing one');
    })

    .then(function () {
      // client timestamps for all three stages
      var S = rig({ opDbCache: null });
      S.proceedToFcMode();
      return settle().then(function () {
        ok(typeof S._fcMeta_.prereqStart === 'number' && typeof S._fcMeta_.prereqEnd === 'number',
          'E19 prerequisite start and end are timed');
        S._fcWriteBegin_('regular');
        S._fcWriteEnd_('regular', 'CONFIRMED_SUCCESS');
        ok(typeof S._fcMeta_.writeStart === 'number' && typeof S._fcMeta_.writeEnd === 'number',
          'E20 write start and end are timed');
        S._fcAfterWrite(function () { });
        return settle().then(function () {
          ok(typeof S._fcMeta_.readbackStart === 'number' && typeof S._fcMeta_.readbackEnd === 'number',
            'E21 readback start and end are timed');
        });
      });
    })

    // =============================================================================================
    .then(function () { section('F — EVERY CONTROL IS WIRED TO THE ONE MECHANISM'); })

    .then(function () {
      var controls = [
        ['saveRegularUpdate', 'regular', '_rgOpts'],
        ['saveFcChanges', 'baseEdit', '_beOpts'],
        ['saveEventChanges', 'event', '_evOpts'],
        ['saveNewTargetRule', 'targetRule', '_trOpts'],
        ['deleteTargetRule', 'targetRuleDelete', '_tdOpts']
      ];
      var bad = [];
      controls.forEach(function (c) {
        var src;
        try { src = extractFn(FC, c[0]); } catch (e) { bad.push(c[0] + ':missing'); return; }
        if (!new RegExp("_fcWriteBegin_\\('" + c[1] + "'\\)").test(src)) bad.push(c[0] + ':no-latch');
        if (!/_fcSettleWrite_\(/.test(src)) bad.push(c[0] + ':no-settle');
        if (!/_fcFailWrite_\(/.test(src)) bad.push(c[0] + ':no-fail');
      });
      eq(bad, [], 'F1  Regular, Base Edit, Special Event, Target Rule save and delete all latch and settle through the shared mechanism');
      var imp = extractFn(FC, 'runFcImport');
      ok(/_fcWriteBegin_\('import'\)/.test(imp), 'F2  Import Forecast latches through the same mechanism');
      ok(/_fcClassifyWrite_\(result\)/.test(imp) && /_fcUnknownOutcome_\('import'/.test(imp),
        'F3  and classifies an unreadable answer as unknown rather than as an import failure');
      ok(/_fcRenderImportResult/.test(imp), 'F4  while keeping its own per-row manifest');
      var eb = extractFn(FC, 'saveEventUpdate');
      ok(/_fcWriteBegin_\('eventBuilder'\)/.test(eb), 'F5  the Special Event Builder latches too');
      // FC-SUMMARY-R2B-A — the builder's failure handling moved out of the two-hundred-line async writer
      // into the named `_fcBuilderFailure_`, so it can be DRIVEN instead of read. This assertion pinned the
      // message constant inside saveEventUpdate; it now pins the guarantee where the guarantee lives, and
      // strengthens it — an unreadable failure is STILL an unknown outcome, and a PROVEN zero-write refusal
      // is no longer smeared into the same sentence. Driven coverage of both lives in
      // fc-refusal-classification-and-save-reentry-r2b-a.test.js sections B and D.
      ok(/_fcBuilderFailure_\(e, _ebEpoch\)/.test(eb),
        'F6  the Special Event Builder routes every failure through ONE handler');
      var bf = extractFn(FC, '_fcBuilderFailure_');
      ok(/FC_MSG_\.UNKNOWN/.test(bf) && /FC_WRITE_\.UNKNOWN/.test(bf),
        'F6b which still reports an unreadable 3-layer failure as an unknown outcome');
      ok(/_fcZeroWriteProven_\(e\)/.test(bf) && /FC_WRITE_\.REFUSAL/.test(bf),
        'F6c and separates a PROVEN zero-write refusal from it');
    })

    .then(function () {
      var bad = [];
      ['saveRegularUpdate', 'saveFcChanges', 'saveEventChanges'].forEach(function (n) {
        var src = extractFn(FC, n);
        if (/res && res\.summary\) \|\| \{\}/.test(src)) bad.push(n);
      });
      eq(bad, [], 'F7  no control reads the wrong response level any more');
      ok(!/_fcEnsureBroadCacheThen/.test(stripComments(FC)), 'F8  the swallow-and-re-enter prerequisite loader is gone entirely');
      ok(!/setInterval|setTimeout\([^,]*,\s*[0-9]{3,}/.test(extractFn(FC, 'proceedToFcMode')),
        'F9  and Next added no timer or polling loop');
      var afterWrite = extractFn(FC, '_fcAfterWrite');
      ok(stripComments(afterWrite).indexOf('_fcRenderError_') < 0,
        'F10 the post-write readback never calls the full-page error redraw');
      ok(/id="fc-mode-next-btn"/.test(HTML) && /id="fc-target-save-btn"/.test(HTML)
        && /id="fc-mode-select-refusal"/.test(HTML) && /id="fc-view-banner"/.test(HTML),
        'F11 the four semantic hosts exist in the partial');
      ok(/id="fc-view-banner"[\s\S]{0,120}hidden/.test(HTML) && /id="fc-mode-select-refusal"[\s\S]{0,80}hidden/.test(HTML),
        'F12 both are hidden until the page has something true to put in them');
    })

    .then(function () {
      // no automatic write retry anywhere in the file
      var writers = ['saveRegularUpdate', 'saveFcChanges', 'saveEventChanges', 'saveNewTargetRule', 'runFcImport', 'saveEventUpdate'];
      var bad = writers.filter(function (n) {
        var src = extractFn(FC, n);
        return /retry|again\s*\(\)|\.then\([^)]*\)\s*\.catch\([^)]*\)\s*\.then/i.test(src)
          && /importFcRegularForecastBatch|importFcSpecialEventsBatch|upsertFcTargetRule/.test(src)
          && /catch[\s\S]{0,200}(importFcRegularForecastBatch|importFcSpecialEventsBatch|upsertFcTargetRule)/.test(src);
      });
      eq(bad, [], 'F13 no write control replays its own write from a failure handler');
    })

    // =============================================================================================
    .then(function () { section('G — DRIVEN MUTANTS (each must change an OBSERVED result)'); })
    .then(runMutants)

    .then(function () {
      console.log('\n' + new Array(101).join('='));
      console.log('FC SUMMARY WRITE OUTCOME TRUTHFULNESS (R1) — passed ' + pass + '  failed ' + fail
        + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
      console.log(new Array(101).join('='));
      if (fail > 0) { process.exitCode = 1; }
    });
}

// -------------------------------------------------------------------------------------------------
// Mutants. Each rewrites the REAL source, rebuilds through the SAME rig, and is scored only on a
// changed observable — a message, a DOM state, a call count, a latch, a recorded state.
// -------------------------------------------------------------------------------------------------
function runMutants() {
  var CLOSE_A = '  if (typeof cb === \'function\') { try { cb(); } catch (e) { /* a reporting fault must not hide the write */ } }';

  function m(label, from, to, drive) {
    var src = mutate(FC, from, to);
    if (src === null) { score(label, false); return Promise.resolve(); }
    var S;
    try { S = rig({ src: src }); } catch (e) { score(label, true); return Promise.resolve(); }
    return Promise.resolve(drive(S)).then(function (killed) { score(label, killed === true); });
  }

  return Promise.resolve()

    // M1 — the modal close is put back behind readback success only
    .then(function () {
      return m('M1  the modal close is restored to readback-success only',
        CLOSE_A, '  var _cb = cb;',
        function (S) {
          var closed = 0;
          S._fcAfterWrite(function () { closed++; });
          return settle().then(function () { return closed === 0; });   // the success report vanished
        });
    })

    // M2 — a readback failure is reported as a write failure
    .then(function () {
      return m('M2  a readback failure is reported as a write failure',
        // FC-SUMMARY-R2B-A2-R3 — the anchor follows the source: the label now comes from the retry-state
        // map rather than a literal, so the mutation target moved with it. The assertion is unchanged.
        '    _fcShowBanner_(FC_MSG_.SAVED_STALE, _fcRetryLabel_(FC_RETRY_.STALE_AFTER_WRITE),\n'
        + '      function () { _fcRefreshViewNow_(FC_MSG_.SAVED_STALE, FC_RETRY_.STALE_AFTER_WRITE); });',
        '    alert(\'Save failed: \' + _fcErrDetail_(err));',
        /* The readback MUST actually fail here, or this mutant proves nothing. An earlier draft left the
           default resolving stub in place and scored "caught" whether or not the mutation applied — a
           mutant that cannot fail is not a test. The vacuity audit caught it; it is fixed, not deleted. */
        function (S) {
          S._fcSliceFetch_ = function () { return Promise.reject({ code: 'REQUEST_TIMEOUT', message: 'x' }); };
          S.__seen.alerts.length = 0;
          S._fcAfterWrite(function () { S.alert('Saved successfully.'); });
          return settle().then(function () {
            return /Save failed/.test(S.__seen.alerts.join(' '));
          });
        });
    })

    // M3 — the wrong response level
    .then(function () {
      return m('M3  the summary is read from res.summary instead of res.data.summary',
        '  var s = (d && d.summary) || (res && res.summary) || null;',
        '  var s = (res && res.summary) || null;',
        function (S) {
          var got = S._fcSummaryOf_({ success: true, data: { summary: { created: 7 } } });
          return got === null;                        // the manifest disappears, exactly as it did before
        });
    })

    /* Next is guarded TWICE, for two different reasons, so it takes two mutants. The promise latch stops
       a second REQUEST; the transition latch stops a second MODAL. An earlier draft had only the first
       mutant, and once the transition latch was added it began to SURVIVE — the second guard masked the
       first. Two guarantees, two mutants, each driven at the level it actually protects.

       S2-R4B — AND IT HAPPENED A SECOND TIME, exactly as the paragraph above predicts. The loader now
       also keeps an index of which TABLES are in flight, so that a Builder reopened during a post-write
       warm-up joins that request instead of repeating it. That index dedupes the REQUEST too, so
       removing the path latch alone no longer produces a second call and this mutant began to survive
       while describing correct code.
       So it is driven where the path latch is the ONLY owner: PROMISE IDENTITY. Two callers of the same
       path get the same promise object, which is what lets them transition together; the table index
       dedupes the request but hands each caller its own promise. The request-count guarantee the index
       provides is driven in s2-r4b-shipping-history-and-fc-warm-race (M1/M2), against the warm-up
       reopen it was built for — which is the only place it is the sole guard. */
    // M4 — the request latch, driven on the identity only it provides
    .then(function () {
      return m('M4  the prerequisite request latch is removed (callers no longer share one promise)',
        '  if (_fcPrereqFlightByPath_[p]) return _fcPrereqFlightByPath_[p];',
        '  // latch removed',
        function (S) {
          var d = deferred();
          S.window.KM.DB.refreshCacheTables = function () { return d.promise; };
          S.window._opDbCache = null;
          var a = S._fcLoadPrerequisites_();
          var b = S._fcLoadPrerequisites_();
          d.resolve();
          return settle().then(function () { return a !== b; });
        });
    })

    // M4b — the transition latch
    .then(function () {
      return m('M4b the Next transition latch is removed (one load opens several builders)',
        '  if (_fcPrereqTransition_) return;   // a transition is already pending: this click adds nothing at all',
        '  // transition latch removed',
        function (S) {
          var d = deferred();
          S.window.KM.DB.refreshCacheTables = function () { return d.promise; };
          S.window._opDbCache = null;
          S.proceedToFcMode(); S.proceedToFcMode(); S.proceedToFcMode();
          d.resolve();
          return settle().then(function () { return S.__seen.opened.length > 1; });
        });
    })

    // M5 — the silent automatic re-entry comes back
    .then(function () {
      return m('M5  a prerequisite failure silently re-enters instead of refusing',
        '    _fcSetNextBusy_(false);\n'
        + '    _fcShowPrereqRefusal_(err);   // modal stays open; no loop, no timer, no automatic retry',
        '    _fcSetNextBusy_(false);\n'
        + '    proceedToFcMode();',
        function (S) {
          var calls = 0;
          S.window._opDbCache = null;
          S.window.KM.DB.refreshCacheTables = function () {
            calls++;
            return (calls < 4) ? Promise.reject({ code: 'X', message: 'down' }) : Promise.resolve();
          };
          S.proceedToFcMode();
          return settle(14).then(function () {
            return calls > 1 && refusal(S).hidden === true;   // it retried, and showed nothing
          });
        });
    })

    // M6 — the visible Retry control is removed
    .then(function () {
      return m('M6  the visible Retry control is removed',
        '  b.textContent = \'Retry\'; b.style.marginTop = \'8px\';',
        '  b.textContent = \'Retry\'; b.style.marginTop = \'8px\'; b.hidden = true; return;',
        function (S) {
          S.window._opDbCache = null;
          S.window.KM.DB.refreshCacheTables = function () { return Promise.reject({ code: 'X', message: 'down' }); };
          S.proceedToFcMode();
          return settle().then(function () {
            return S.__doc.getElementById('fc-mode-retry-btn') === null
              || S.__doc.getElementById('fc-mode-retry-btn').hidden === true;
          });
        });
    })

    // M7 — a dead controller is allowed to mutate the DOM
    .then(function () {
      return m('M7  a dead controller is allowed to draw into the page',
        // S3-R1 §C inserted the superseded early-return between the ownership check and the comment
        // this anchor used to end on, so the anchor moves down to the line that now follows the check.
        // The mutation and the probe are unchanged: remove the ownership check, and a controller that
        // has been routed away must still be unable to draw a banner into the page.
        '    if (!_fcOwns_(epoch)) return;\n'
        + '    /* S3-R1 §C — A SUPERSEDED READBACK IS NOT A FAILED ONE.',
        '    // ownership check removed\n'
        + '    /* S3-R1 §C — A SUPERSEDED READBACK IS NOT A FAILED ONE.',
        function (S) {
          var d = deferred();
          S._fcSliceFetch_ = function () { return d.promise; };
          S._fcAfterWrite(function () { });
          S.__epoch.current = 77;                     // routed away
          d.reject({ code: 'REQUEST_TIMEOUT', message: 'late' });
          return settle().then(function () { return banner(S).hidden === false; });
        });
    })

    // M8 — the Target Rule single-flight guard is removed
    .then(function () {
      // R2B-A2-R5 — TWO leading spaces, not four. The guard moved out of `if (_fcUseDb()) { ... }` when the
      // demo path became an early return, and an anchor that no longer matches is a mutant that silently
      // stops biting. The mutated source is now checked for the REPLACEMENT, not merely for the absence of
      // the original, so a no-op mutation cannot read as a successful one.
      return m('M8  the Target Rule single-flight guard is removed',
        '  if (!_fcWriteBegin_(\'targetRule\')) return;',
        '  _fcWriteBegin_(\'targetRule\');',
        function (S) {
          // observed on the source-driven latch: the control no longer refuses a second entry
          var mutated = mutate(FC, '  if (!_fcWriteBegin_(\'targetRule\')) return;',
            '  _fcWriteBegin_(\'targetRule\');');
          if (mutated === null) throw new Error('M8 mutation did not apply — the guard anchor has moved');
          var src = extractFn(mutated, 'saveNewTargetRule');
          return /_fcWriteBegin_\('targetRule'\);/.test(src)
            && !/if \(!_fcWriteBegin_\('targetRule'\)\) return;/.test(src)
            && /upsertFcTargetRule\(payload\)/.test(src);
        });
    })

    // M9 — an automatic write retry is introduced
    .then(function () {
      return m('M9  the unknown outcome triggers an automatic write replay',
        '  alert(FC_MSG_.UNKNOWN + detail);',
        '  alert(FC_MSG_.UNKNOWN + detail); if (typeof _fcAutoReplay_ === \'function\') _fcAutoReplay_();',
        function (S) {
          var replays = 0;
          S._fcAutoReplay_ = function () { replays++; };
          S._fcUnknownOutcome_('regular', null);
          return replays === 1;
        });
    })

    // M10 — an unknown outcome is presented as a confirmed failure
    .then(function () {
      return m('M10 an unknown outcome is presented as a confirmed failure',
        '  if (res && typeof res === \'object\') return FC_WRITE_.SUCCESS;\n'
        + '  return FC_WRITE_.UNKNOWN;',
        '  if (res && typeof res === \'object\') return FC_WRITE_.SUCCESS;\n'
        + '  return FC_WRITE_.REFUSAL;',
        function (S) {
          S.__seen.alerts.length = 0;
          S._fcSettleWrite_(null, { ctl: 'regular', op: 'x', rows: 1, epoch: 1, onSuccess: function () { } });
          var joined = S.__seen.alerts.join(' ');
          return /The server refused the save/.test(joined) && !/could not be confirmed/.test(joined);
        });
    })

    // M11 — the stale view is replaced by the empty/error redraw
    .then(function () {
      // The assignment appears in BOTH _fcRefreshViewNow_ and _fcAfterWrite, so the anchor carries the
      // preceding comment line to pin the _fcAfterWrite one. A non-unique anchor scores SURVIVED.
      return m('M11 the stale view is replaced by the full-page error redraw',
        '    // because those rows are real and the write that produced them succeeded.\n'
        + '    _fcViewState_ = _fcReadModel ? FC_VIEW_.STALE : FC_VIEW_.REFUSED;',
        '    _fcRenderError_(err);\n'
        + '    _fcViewState_ = _fcReadModel ? FC_VIEW_.STALE : FC_VIEW_.REFUSED;',
        function (S) {
          S._fcSliceFetch_ = function () { return Promise.reject({ code: 'REQUEST_TIMEOUT', message: 'x' }); };
          S._fcAfterWrite(function () { });
          return settle().then(function () { return S.__seen.errorRedraws === 1; });
        });
    })

    // M12 — a missing metric becomes zero
    .then(function () {
      return m('M12 a metric the envelope never sent is reported as zero',
        '{ out[k] = (_fcMeta_[k] == null) ? \'unknown\' : _fcMeta_[k]; }',
        '{ out[k] = (_fcMeta_[k] == null) ? 0 : _fcMeta_[k]; }',
        function (S) { return S._fcMetricsSnapshot_().serverDurationMs === 0; });
    });
}

main().catch(function (e) {
  console.error('RUNNER ERROR ' + (e && e.stack || e));
  process.exitCode = 3;
});
