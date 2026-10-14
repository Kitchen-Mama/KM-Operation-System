// =============================================================================================================
// S8-B3-R3-CP2M-R4-R1 — A CANCELLED SAVE MUST NOT WRITE
// -------------------------------------------------------------------------------------------------------------
// CP2M-R4 built the drag and checked the rule, the draft and the four write outcomes. It did NOT check what
// happens to a save whose PREFLIGHT IS STILL IN FLIGHT when the operator changes their mind, and there the
// continuation asked exactly one question — `if (!_mounted) return false;` — which answers none of these:
//
//   * CANCEL. `cancelMove()` sets `_move = null`. The page is still mounted, so the preflight resolved and
//     dispatched the write anyway. The operator pressed Cancel and the row was saved.
//   * LEAVE AND RETURN. `unmount()` sets `_mounted = false`, but coming back sets it true again. A preflight
//     that spanned the round trip found `_mounted === true` and dispatched a write belonging to an operation
//     the operator had walked away from.
//   * A NEW DRAFT. The stale continuation does not know which draft it belongs to, so on a refused preflight
//     it ran `_move = null` over whatever draft existed BY THEN, cleared `_busy` out from under a newer save,
//     and wrote its banner over the newer one's.
//   * THE DATA AND THE DOM. `preflightMove` assigns `_rows` and calls `renderFilters()` BEFORE anything is
//     checked, so even a fully superseded read replaced the table underneath the operator.
//
// "Is the page mounted" is not identity. These assertions are written against the UNFIXED code first and are
// expected to fail there; what makes them meaningful afterwards is that each one names a different thing the
// continuation has to recognise — the OPERATION, the DRAFT, and the MOUNT GENERATION.
//
// AND THE CANCEL BUTTON ITSELF IS DRIVEN, not the exported helper. A test that calls `cancelMove()` directly
// proves the function works and says nothing about whether the control reaches it.
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return require('./_read-source.js').readSource(ROOT, rel); }

var pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var PAGE_SRC = read('assets/js/pages/site-priority.js');
var CODE = PAGE_SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// -------------------------------------------------------------------------------------------------------------
function El(id) {
  this.id = id || ''; this.value = ''; this.hidden = false; this.textContent = ''; this.innerHTML = '';
  this.className = ''; this._attrs = {}; this._listeners = {};
  this.classList = { _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; },
    contains: function (c) { return !!this._s[c]; } };
}
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; };
El.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
El.prototype.addEventListener = function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); };
El.prototype.fire = function (t, ev) { (this._listeners[t] || []).forEach(function (fn) { fn(ev); }); };
El.prototype.focus = function () {};

function makeDom() {
  var byId = {};
  ['site-priority-section', 'sp-status', 'sp-rows', 'sp-empty', 'sp-filter-company', 'sp-filter-country',
   'sp-refresh', 'sp-draft', 'sp-drag-help'].forEach(function (id) { byId[id] = new El(id); });
  var extra = [], docListeners = {};
  return {
    byId: byId, extra: extra,
    document: {
      addEventListener: function (t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
      getElementById: function (id) { return byId[id] || null; },
      querySelector: function (sel) {
        for (var i = 0; i < extra.length; i++) if (extra[i]._sel === sel) return extra[i];
        return null;
      },
      querySelectorAll: function (sel) {
        return extra.filter(function (e) { return e._sel === sel || (sel === '[data-sp-input]' && e._isInput); });
      }
    }
  };
}

function bootPage(opts) {
  opts = opts || {};
  var dom = makeDom();
  var calls = { upsert: [], refLoads: 0, invalidate: [], pendingReads: [] };
  var win = {};
  var rstore = {};
  var refCache = {
    get: function (key, loader) {
      if (rstore[key]) return rstore[key];
      var pr = Promise.resolve().then(loader).catch(function (e) { delete rstore[key]; throw e; });
      rstore[key] = pr;
      return pr;
    },
    invalidate: function (key) { calls.invalidate.push(key); delete rstore[key]; },
    invalidateMany: function (ks) { (ks || []).forEach(function (k) { refCache.invalidate(k); }); },
    clear: function () { rstore = {}; }
  };
  win.KM = {
    lifecycle: { register: function (n, hooks) { win.KM._hooks = hooks; } },
    partialLoader: { loadPartial: function () { return Promise.resolve(true); } },
    countryIdentity: require(path.join(ROOT, 'assets', 'js', 'core', 'supply-planning-country-identity.js')),
    referenceCache: refCache,
    DB: {
      getMarketplaceReference: function () {
        return refCache.get('marketplaces', function () {
          calls.refLoads++;
          (opts.rows || []).forEach(function (r) {
            if (!Object.prototype.hasOwnProperty.call(r, 'marketplaceId')) {
              r.marketplaceId = 'MKT-' + r.company + '-' + r.country + '-' + r.marketplace;
            }
          });
          var snap = (opts.rows || []).map(function (r) {
            var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; }); return c;
          });
          // EVERY read is settled by hand, which is the only way to hold a preflight open across a Cancel.
          return new Promise(function (res, rej) {
            calls.pendingReads.push({ resolve: function () { res(snap); }, reject: rej, rows: snap });
          });
        });
      },
      setMarketplaceAllocationPriority: function (payload) {
        calls.upsert.push(payload);
        (opts.rows || []).forEach(function (r) {
          if (String(r.company) === payload.company && String(r.country) === payload.country
              && String(r.marketplace) === payload.marketplace) {
            r.allocationPriority = payload.allocation_priority;
          }
        });
        refCache.invalidate('marketplaces');
        if (opts.holdWrite) {
          return new Promise(function (res) { calls.resolveWrite = function () {
            res({ outcome: 'CONFIRMED_COMMITTED', code: 'OK', message: '' }); }; });
        }
        return Promise.resolve({ outcome: 'CONFIRMED_COMMITTED', code: 'OK', message: '' });
      }
    }
  };
  var code = fs.readFileSync(path.join(ROOT, 'assets/js/pages/site-priority.js'), 'utf8');
  new Function('window', 'document', 'console', 'CSS', 'KM', code)(
    win, dom.document, { warn: function () {}, log: function () {} }, null, win.KM);
  return { win: win, dom: dom, calls: calls, opts: opts, api: win.KM.sitePriority, hooks: win.KM._hooks };
}

function FIXTURE() {
  return [
    { company: 'KitchenMama', country: 'US', marketplace: 'Amazon',  allocationPriority: 100 },
    { company: 'KitchenMama', country: 'GB', marketplace: 'Amazon',  allocationPriority: 80 },
    { company: 'KitchenMama', country: 'DE', marketplace: 'Amazon',  allocationPriority: 80 },
    { company: 'KitchenMama', country: 'JP', marketplace: 'Rakuten', allocationPriority: 0 },
    { company: 'KitchenMama', country: 'CA', marketplace: 'Walmart', allocationPriority: '' }
  ];
}
var K_JP = 'KitchenMama\u0001JP\u0001Rakuten';
var K_CA = 'KitchenMama\u0001CA\u0001Walmart';

function status(b) { return b.dom.byId['sp-status'].textContent; }
function bar(b) { return b.dom.byId['sp-draft'].innerHTML; }
var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

// THE REAL CONTROLS. A delegated click on the section, carrying the attribute the shipped listener reads —
// not a direct call to the helper behind it.
function clickAttr(b, attr) {
  var t = new El('');
  t.setAttribute(attr, '1');
  b.dom.byId['site-priority-section'].fire('click', { target: t });
}

// Boot, settle the mount read, and leave a dropped draft ready to save.
function withDraft(opts) {
  var b = bootPage(opts || { rows: FIXTURE() });
  var p = b.hooks.mount();
  return tick().then(function () {
    b.calls.pendingReads.shift().resolve();         // the mount read
    return p;
  }).then(function () {
    b.api._drag.beginLift(K_JP, true);
    b.api._drag.setSlot(1);                         // between 100 and 80 -> proposes 90
    b.api._drag.dropLift();
    return b;
  });
}

var T = [];
function test(n, fn) { T.push({ name: n, fn: fn }); }

// =============================================================================================================
test('A. CANCEL DURING THE PREFLIGHT — the write must never be dispatched', function () {
  var b;
  return withDraft().then(function (x) {
    b = x;
    eq(b.calls.upsert.length, 0, 'A0 (nothing written by the drop)');
    clickAttr(b, 'data-sp-move-save');                       // real Save click
    return tick();
  }).then(function () {
    eq(b.calls.pendingReads.length, 1, 'A1 the preflight re-read is in flight');
    eq(b.calls.upsert.length, 0, 'A1a and nothing has been written yet');
    clickAttr(b, 'data-sp-move-cancel');                     // real Cancel click, mid-preflight
    eq(b.api._state().move, null, 'A2 the draft is gone, so the operator has been told it is cancelled');
    b.calls.pendingReads.shift().resolve();                  // the preflight lands AFTER the cancel
    return tick().then(tick).then(tick);
  }).then(function () {
    // THE ASSERTION THIS SUITE EXISTS FOR.
    eq(b.calls.upsert.length, 0, 'A3 NO WRITE WAS DISPATCHED after Cancel');
    eq(b.api._state().move, null, 'A3a and the stale continuation did not resurrect a draft');
    ok(!/Saved|VERIFIED/.test(status(b)), 'A3b nor report a save that the operator cancelled', status(b));
    eq(b.api._state().busy, false, 'A4 and the page is not left busy');
  });
});

// =============================================================================================================
test('B. LEAVE AND RETURN DURING THE PREFLIGHT — the old operation is dead', function () {
  var b;
  return withDraft().then(function (x) {
    b = x;
    clickAttr(b, 'data-sp-move-save');
    return tick();
  }).then(function () {
    eq(b.calls.pendingReads.length, 1, 'B1 the preflight is in flight');
    b.hooks.unmount();                                        // the operator navigates away
    var p = b.hooks.mount();                                  // ...and comes straight back
    /* THE REMOUNT JOINS THE SAME PENDING READ rather than starting a second one — `referenceCache.get`
       shares one promise per key, and the preflight has already taken it. So there is no way to settle the
       remount's read without also settling the stale preflight, and the two continuations run off the SAME
       resolution. That is harsher than the scenario this test set out to stage, and it is the real one. */
    eq(b.calls.pendingReads.length, 1, 'B1a and the remount SHARES it — one promise per key');
    b.calls.pendingReads.shift().resolve();
    return p.then(tick).then(tick).then(tick);
  }).then(function () {
    eq(b.api._state().mounted, true, 'B2 the page is mounted again — `_mounted` alone would say "go ahead"');
    eq(b.calls.upsert.length, 0, 'B3 the pre-navigation save dispatched NO write');
    eq(b.api._state().move, null, 'B3a and left no draft behind on the page the operator returned to');
  });
});

// =============================================================================================================
test('C. A NEW DRAFT MUST SURVIVE THE OLD OPERATION LANDING', function () {
  var b;
  return withDraft().then(function (x) {
    b = x;
    clickAttr(b, 'data-sp-move-save');
    return tick();
  }).then(function () {
    clickAttr(b, 'data-sp-move-cancel');
    // The operator immediately starts a DIFFERENT move: the Missing row, into the same gap.
    b.api._drag.beginLift(K_CA, true);
    b.api._drag.setSlot(1);
    b.api._drag.dropLift();
    var m = b.api._state().move;
    ok(!!m, 'C1 a new draft exists');
    eq(m.key, K_CA, 'C1a and it is the new row');
    var bannerBefore = status(b);
    b.calls.pendingReads.shift().resolve();                   // the OLD preflight lands
    return tick().then(tick).then(tick).then(function () { return bannerBefore; });
  }).then(function (bannerBefore) {
    var m = b.api._state().move;
    ok(!!m, 'C2 THE NEW DRAFT SURVIVED the old operation completing');
    eq(m && m.key, K_CA, 'C2a and is still the row the operator is actually moving');
    eq(b.calls.upsert.length, 0, 'C3 and the old operation still wrote nothing');
    eq(b.api._state().busy, false, 'C4 the new draft is not left wedged busy by the old operation');
    eq(status(b), bannerBefore, 'C5 nor did the old operation write its banner over the new state');
  });
});

// =============================================================================================================
test('D. A SUPERSEDED PREFLIGHT MAY NOT COMMIT DATA OR REDRAW', function () {
  var rows = FIXTURE();
  var b;
  return withDraft({ rows: rows }).then(function (x) {
    b = x;
    clickAttr(b, 'data-sp-move-save');
    return tick();
  }).then(function () {
    // The world moves while the preflight is open, so its snapshot is both STALE and DIFFERENT.
    var before = b.api._state().rows.length;
    eq(before, 5, 'D0 (five rows are loaded)');
    clickAttr(b, 'data-sp-move-cancel');
    // The pending read captured its snapshot at loader time; mutate the source so a commit would be visible.
    rows.push({ company: 'KitchenMama', country: 'FR', marketplace: 'Amazon', allocationPriority: 5,
                marketplaceId: 'MKT-FR' });
    b.calls.pendingReads.shift().resolve();
    return tick().then(tick).then(tick);
  }).then(function () {
    // The snapshot the stale preflight carries has 5 rows; what matters is that it did not get to decide.
    eq(b.calls.upsert.length, 0, 'D1 no write');
    // `preflightMove` assigns `_rows` and calls renderFilters() before any check, so a superseded read
    // redrew the page the operator was looking at. The fix has to reject BEFORE it commits anything.
    ok(!/NOT SAVED/.test(status(b)),
      'D2 a superseded preflight did not write its refusal banner onto the current page', status(b));
  });
});

// =============================================================================================================
test('E. THE TWO CANCEL PHASES ARE DIFFERENT, AND THE PAGE SAYS WHICH', function () {
  var b;
  // --- phase 1: before the writer is dispatched. Cancel genuinely prevents a write, and may say so.
  return withDraft().then(function (x) {
    b = x;
    clickAttr(b, 'data-sp-move-save');
    return tick();
  }).then(function () {
    clickAttr(b, 'data-sp-move-cancel');
    b.calls.pendingReads.shift().resolve();
    return tick().then(tick).then(tick);
  }).then(function () {
    eq(b.calls.upsert.length, 0, 'E1 cancelling during the preflight prevented the write');
    ok(/not|nothing/i.test(status(b)) || status(b) === '',
      'E1a and the page does not claim a save happened', status(b));

    // --- phase 2: the writer HAS been dispatched. Cancel may not claim to have undone it.
    return withDraft({ rows: FIXTURE(), holdWrite: true });
  }).then(function (x) {
    b = x;
    clickAttr(b, 'data-sp-move-save');
    return tick();
  }).then(function () {
    b.calls.pendingReads.shift().resolve();      // preflight passes
    return tick().then(tick).then(tick);
  }).then(function () {
    eq(b.calls.upsert.length, 1, 'E2 the writer HAS been dispatched and its answer is outstanding');
    // Whatever the control now offers, it must not be a Cancel that claims the write was called back.
    ok(!/Cancel</.test(bar(b)) || /cannot be cancelled|already been sent|no longer/i.test(bar(b)),
      'E3 the move bar does not offer a plain Cancel once the write is in flight', bar(b));
    eq((b.api._state().move || {}).phase, 'sent', 'E3a the draft is in the SENT phase');
    clickAttr(b, 'data-sp-move-cancel');
    eq(b.calls.upsert.length, 1, 'E4 and pressing Cancel does not dispatch or retract anything');
    /* THE ASSERTION THAT WAS MISSING, AND A MUTATION FOUND IT. The first version of E only checked that
       nothing was WRITTEN and that no sentence said "undone" — both of which stay true if Cancel simply
       drops the draft on the floor. Deleting the phase guard entirely therefore survived. What must be
       true is that the move SURVIVES the click: the request is outstanding, its outcome may be
       OUTCOME_UNKNOWN, and the row has to stay on screen to receive that answer. */
    ok(!!b.api._state().move, 'E4a THE MOVE SURVIVES the click — a sent write still needs its outcome');
    eq((b.api._state().move || {}).phase, 'sent', 'E4b and is still in the sent phase');
    ok(/cannot be cancelled/i.test(status(b)), 'E4c and the operator is told why', status(b));
    ok(/nothing will be re-sent|nothing here can call a request back/i.test(status(b)),
      'E4d together with the promise that nothing is re-sent');
    ok(!/nothing was written|cancelled the save|undone/i.test(status(b) + bar(b)),
      'E5 and nothing claims the dispatched write was undone', status(b) + ' | ' + bar(b));
    // And the outcome still lands on that draft once the server answers.
    if (b.calls.resolveWrite) b.calls.resolveWrite();
    return tick().then(tick).then(tick).then(function () {
      if (b.calls.pendingReads.length) b.calls.pendingReads.shift().resolve();
      return tick().then(tick);
    }).then(function () {
      eq(b.calls.upsert.length, 1, 'E6 still exactly one write, after the answer arrives');
    });
  });
});

// =============================================================================================================
section('F. THE SOURCE, after the fix — identity, not liveness');

ok(/_mountGen/.test(CODE), 'F1 a mount generation exists');
// The continuation must consult the OPERATION, the DRAFT and the MOUNT GENERATION — not just `_mounted`.
var saveMoveBody = (/function saveMove\(\)[\s\S]*?\n  \}/.exec(CODE) || [''])[0];
ok(saveMoveBody.length > 0, 'F2 (saveMove was located in the source)');
ok(/_mountGen/.test(saveMoveBody), 'F3 saveMove captures or checks the mount generation', saveMoveBody.length);
ok(/opId|_opSeq|moveId|_moveSeq/.test(saveMoveBody),
  'F4 and an operation or draft identity, so a superseded save can be recognised');
ok(!/if \(!_mounted\) return false;[\s\S]{0,80}commitPriority/.test(saveMoveBody),
  'F5 the continuation no longer guards the dispatch with `_mounted` alone');
// preflightMove must refuse BEFORE it touches shared state.
var preBody = (/function preflightMove\([^)]*\)[\s\S]*?\n  \}/.exec(CODE) || [''])[0];
ok(preBody.length > 0, 'F6 (preflightMove was located)');
ok(!/loadRows\(\)\.then\(function \(fresh\) \{\s*_rows = fresh;/.test(preBody),
  'F7 preflightMove does not assign _rows as its first act');
// The claim is not merely "something comes first" — it is that the STALE GATE comes first.
var gateAt = preBody.indexOf('opIsLive(op)');
var commitAt = preBody.indexOf('_rows = fresh');
ok(gateAt > 0, 'F7a the staleness gate is inside preflightMove');
ok(commitAt > 0, 'F7b (and the commit is too)');
ok(gateAt < commitAt, 'F7c and the gate is reached BEFORE the data is committed');
// Both exits are gated: a read that REJECTS must not report a refusal onto a newer operation either.
eq((preBody.match(/opIsLive\(op\)/g) || []).length, 2,
  'F7d both the resolve and the reject path check it');

// =============================================================================================================
section('G. WHICH GUARDS ARE PROVEN, AND WHICH ARE DEFENCE IN DEPTH');
// -------------------------------------------------------------------------------------------------------------
// Mutating the shipped fix, one guard at a time, and classifying with the SAME collector the sweep uses:
//
//   KILLED    the _mounted-only gate · the preflight committing before its check · the sent-phase Cancel
//             refusal · the bar offering Cancel after dispatch · dropping ALL THREE identities · keeping
//             ONLY the mount generation
//   SURVIVED  keeping only `_op` · keeping only the draft id · removing `_op = null` from cancel ·
//             removing the pre-dispatch re-check · removing the draft-id guard in `done`
//
// THE SURVIVORS ARE REPORTED, NOT HIDDEN, because each is survivable for a reason worth knowing:
//
//   * `_op` and the draft id are MUTUALLY REDUNDANT. Both `cancelMove` and `unmount` clear BOTH, so either
//     one alone recognises every superseded operation this page can currently produce. The mount generation
//     is NOT sufficient on its own — "only mountGen kept" is killed — because a Cancel does not change it.
//   * the pre-dispatch re-check is unreachable TODAY: nothing between the first gate and the writer is
//     asynchronous. It guards the day someone makes it so, which is the only moment it would matter.
//   * the draft-id guard in `done` is unreachable because a new draft cannot be started while one is in the
//     sent phase.
//
// Keeping all three identities is what the round asked for, and they are not equivalent — but this suite
// can only PROVE that at least one of `_op`/draft-id is required, plus that liveness alone is not. Saying
// which is which is the point; a count of killed mutants that quietly included the unreachable ones would
// be a worse number than this paragraph.
var LIVE = (/function opIsLive\(op\)[\s\S]*?\n  \}/.exec(CODE) || [''])[0];
ok(LIVE.length > 0, 'G1 the gate is one named function, so "is this answer wanted" has one definition');
ok(/_mounted/.test(LIVE), 'G2 it checks the page is mounted');
ok(/_op === op/.test(LIVE), 'G3 and the operation');
ok(/_move\.id === op\.moveId/.test(LIVE), 'G4 and the draft');
ok(/_mountGen === op\.mountGen/.test(LIVE), 'G5 and the mount generation');
// The dispatch is the irreversible step and is gated immediately before it, whether or not anything
// asynchronous sits in between today.
var sm = (/function saveMove\(\)[\s\S]*?\n  \}/.exec(CODE) || [''])[0];
var lastGate = sm.lastIndexOf('opIsLive(op)');
var dispatch = sm.indexOf('commitPriority(');
ok(lastGate > 0 && dispatch > 0, 'G6 (both located in saveMove)');
ok(lastGate < dispatch, 'G7 the last gate precedes the dispatch');
ok(sm.slice(lastGate, dispatch).indexOf('then(') === -1,
  'G8 with nothing asynchronous between them — which is why the re-check cannot be observed today');

// =============================================================================================================
(function run(i) {
  if (i >= T.length) {
    console.log('\n----------------------------------------');
    console.log('SITE PRIORITY SAVE CANCELLATION (S8-B3-R3-CP2M-R4-R1): ' + pass + ' passed, ' + fail + ' failed');
    if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
    if (fail > 0) process.exitCode = 1;
    return;
  }
  section(T[i].name);
  var p;
  try { p = Promise.resolve(T[i].fn()); } catch (e) { p = Promise.reject(e); }
  /* A WATCHDOG, BECAUSE A PROMISE THAT NEVER SETTLES EXITS 0. The first version of this suite hung in
     section B and node exited CLEANLY with a FAIL line still on screen — the exact shape the sweep is
     blind to. A test that cannot finish is a failure, and has to be reported as one. */
  var settled = false;
  var guard = setTimeout(function () {
    if (settled) return;
    settled = true;
    fail++; console.log('FAIL ' + T[i].name + ' DID NOT SETTLE within 20s (treated as a failure, not a pass)');
    run(i + 1);
  }, 20000);
  p.then(function () { if (settled) return; settled = true; clearTimeout(guard); run(i + 1); },
    function (e) { if (settled) return; settled = true; clearTimeout(guard); 
      fail++; console.log('FAIL ' + T[i].name + ' THREW: ' + (e && e.stack ? e.stack : e));
      run(i + 1);
    });
})(0);
