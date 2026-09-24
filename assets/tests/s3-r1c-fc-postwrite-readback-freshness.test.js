// Kitchen Mama Operation System — S3-R1 WORKSTREAM C
// FC POST-WRITE: A READBACK THAT COULD JOIN AN ANSWER OLDER THAN THE WRITE IT WAS CONFIRMING
// Run: node assets/tests/s3-r1c-fc-postwrite-readback-freshness.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script, no browser. It extracts the REAL slice fetcher
// from fc-summary.js and drives it against a controllable server.
//
// §C1 said not to rewrite R4B's logic, and this does not. The write ack, the receipt reconciliation, the
// warm-flight join and the typed refresh failure are all untouched. What was wrong sits one layer down.
//
// C-RC1 — THE READBACK COULD JOIN A PRE-WRITE FLIGHT. _fcSliceFetch_ opens with
// `if (rec.flight) return rec.flight;`, which is correct for a READ: two tabs asking for the same slice
// should share one request. It is wrong for a post-write readback, because the flight it joins may have
// been dispatched before the write, and the server computed that answer from the rows as they were. The
// joined promise then RESOLVES — nothing failed — so the readback commits it, sets the view to CURRENT
// and clears the banner. The operator is told the view is current while looking at a table that does not
// contain what they just saved.
//
// It needs a slow backend and a save issued while the tab's own first read is still in the air. That is
// the shape of a live demonstration, and it is the shape no unit test had, which is why the symptom
// ("saved, but the view did not update") outlived every suite that passed over it.
//
// C-RC2 — A SUPERSEDED READBACK WAS REPORTED AS A FAILED ONE. FC_SUMMARY_READ_SUPERSEDED is a rejection,
// and the post-write catch treated every rejection as a refresh failure — so a readback replaced by a
// newer read raised "Saved successfully, but the view could not refresh." over a view that was about to
// be, or already had been, correctly updated, and invited a Retry that was not needed.
//
// THE FIX IS AT THE WRITE, NOT IN THE FETCHER. "May I join?" is a question about what the caller knows,
// and only the post-write path knows that an answer computed a moment ago is already out of date. The
// fetcher stays single-flight for reads, unconditionally — which is also why every existing assertion
// about its latch still passes unmodified.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
var FCS = read('assets/js/pages/fc-summary.js');

var fail = 0, pass = 0;
function ok(c, l, extra) {
  if (!c) { fail++; console.error('FAIL  ' + l + (extra === undefined ? '' : '\n   ' + JSON.stringify(extra))); }
  else { pass++; console.log('ok   ' + l); }
}
function eq(a, b, l) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) { fail++; console.error('FAIL  ' + l + '\n   expected ' + B + '\n   actual   ' + A); }
  else { pass++; console.log('ok   ' + l); }
}
function section(t) { console.log('\n-- ' + t + ' ' + new Array(Math.max(2, 100 - t.length)).join('-')); }

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*[\\s\\S]*?;[^\\S\\n]*(?:\\/\\/[^\\n]*)?\\r?\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
function swapSrc(src, a, b) {
  var re = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '[ \\t\\r]*\\n'));
  var hits = src.match(new RegExp(re.source, 'g'));
  if (!hits) throw new Error('MUTANT ANCHOR NOT FOUND:\n' + a);
  if (hits.length !== 1) throw new Error('MUTANT ANCHOR NOT UNIQUE (' + hits.length + '):\n' + a);
  return src.replace(re, function () { return b; });
}
function settle() {
  var p = Promise.resolve();
  for (var i = 0; i < 60; i++) p = p.then(function () {});
  return p;
}

// =================================================================================================
// HARNESS — the real _fcSliceFetch_ over a server whose answers each test releases by hand.
// =================================================================================================
var VARS = ['FC_FRESH_', 'FC_SLICE_', '_FC_MODEL_KEYS_', '_FC_SLICE_KEYS_', '_fcSliceState_', '_fcReadModel',
  '_fcModelGen_', '_fcCandidateYears_', '_fcInvalidateReason_'];
// _fcYearsOf_ is a dependency of _fcMergeSlice_. Leaving it out made the MERGE throw after it had
// already written the model, so _fcReadModel looked right while rec.state stayed REFUSED — a world
// broken in a way that let three assertions read as passing. D0 exists so that can never be silent.
var FNS = ['_fcModelGenNow_', '_fcInvalidateModel_', '_fcSliceRec_', '_fcHas_', '_fcSliceHasData_', '_fcYearsOf_',
  '_fcValidWorkspaceData_', '_fcMergeSlice_', '_fcSliceFetch_'];

function world(src) {
  src = src || FCS;
  var served = [];
  var ctx = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    JSON: JSON, Object: Object, Array: Array, String: String, Number: Number, Math: Math, Date: Date,
    Promise: Promise, __served: served
  };
  ctx.window = ctx;
  ctx.KM = {
    api: {
      getWorkspace: function (ws, params) {
        var slice = params && params.include && params.include.slice;
        var rec = { slice: slice, resolve: null, promise: null };
        rec.promise = new Promise(function (res) { rec.resolve = res; });
        served.push(rec);
        return rec.promise;
      }
    },
    DB: {
      adaptFcSummaryWorkspaceSlice: function (d) {
        var out = {};
        ['fcRegularForecast', 'fcSpecialEvents', 'fcTargetRules', 'marketplaces'].forEach(function (k) {
          if (d[k] !== undefined && d[k] !== null) out[k] = d[k];
        });
        if (d.observedAt) out.observedAt = d.observedAt;
        return out;
      }
    }
  };
  ctx.window.KM = ctx.KM;
  vm.createContext(ctx);
  var pieces = [];
  VARS.forEach(function (n) { pieces.push(extractVar(src, n)); });
  FNS.forEach(function (n) { pieces.push(extractFn(src, n)); });
  vm.runInContext(pieces.join('\n'), ctx, { filename: 'fc-slice.js' });
  return ctx;
}
/** Answer the Nth outstanding request with a payload tagged so the committed rows name their flight. */
function answer(ctx, i, tag) {
  ctx.__served[i].resolve({
    success: true,
    data: { slice: ctx.__served[i].slice, fcRegularForecast: [{ sku: 'TAG-' + tag }] }
  });
}
function committedTag(ctx) {
  var m = ctx._fcReadModel;
  return (m && m.fcRegularForecast && m.fcRegularForecast[0] && m.fcRegularForecast[0].sku) || null;
}

console.log('\n' + new Array(101).join('='));
console.log('S3-R1 §C — FC POST-WRITE READBACK FRESHNESS');
console.log(new Array(101).join('='));

var chain = Promise.resolve();

// =================================================================================================
chain = chain.then(function () {
  section('A. THE BOUNDARY IS UNCHANGED — §C1');
  ok(/_fcPostWriteWarm_\(_sc\);/.test(FCS), 'A1 the warm-up still runs beside the readback, not chained to it');
  ok(/if \(_sc\.merged\) \{   \/\/ the receipt was complete and is already in the model/.test(FCS),
    'A2 a complete receipt still short-circuits the readback — reconciliation is untouched');
  ok(/_fcViewState_ = FC_VIEW_\.REFRESHING;/.test(FCS), 'A3 the view state vocabulary is untouched');
  ok(/SAVED_STALE:  'Saved successfully, but the view could not refresh\.'/.test(FCS),
    'A4 and the banner text is untouched — §C1 forbade changing it to hide the symptom');
  ok(/if \(rec\.flight\) return rec\.flight;/.test(FCS),
    'A5 the fetcher is STILL unconditionally single-flight for reads — the fix is not here');
});

// =================================================================================================
chain = chain.then(function () {
  section('B. A READBACK DOES NOT JOIN A PRE-WRITE ANSWER — §C2, C-RC1');
  var c = world();
  var p1 = c._fcSliceFetch_('regular');            // the tab's own read, dispatched before the write
  eq(c.__served.length, 1, 'B1 one read is in the air');
  var joined = c._fcSliceFetch_('regular');
  eq(c.__served.length, 1, 'B2 an ordinary second reader JOINS it — single-flight is intact');
  ok(joined === p1, 'B3 ... and gets the very same promise');

  // what the post-write path does, in the order it does it
  c._fcSliceRec_('regular').flight = null;
  var p2 = c._fcSliceFetch_('regular');
  eq(c.__served.length, 2, 'B4 the readback DISPATCHES instead of joining — it may not accept a pre-write answer');
  ok(p2 !== p1, 'B5 ... and it is a different flight');

  answer(c, 1, 'POSTWRITE');
  return settle().then(function () {
    eq(committedTag(c), 'TAG-POSTWRITE', 'B6 the readback\'s own answer is the one that lands');
    answer(c, 0, 'PREWRITE');                       // the released flight arrives late
    return settle().then(function () {
      eq(committedTag(c), 'TAG-POSTWRITE',
        'B7 §C2 and the PRE-WRITE answer, arriving later, CANNOT overwrite it — STALE_RESPONSE_COMMITS = 0');
    });
  });
});

// =================================================================================================
chain = chain.then(function () {
  section('C. THE RELEASED FLIGHT CANNOT CLEAR ITS SUCCESSOR\'S HANDLE');
  var c = world();
  c._fcSliceFetch_('regular');                      // flight 1
  c._fcSliceRec_('regular').flight = null;
  c._fcSliceFetch_('regular');                      // flight 2, the readback
  answer(c, 0, 'OLD');                              // the OLDER one settles first
  return settle().then(function () {
    ok(!!c._fcSliceRec_('regular').flight,
      'C1 the live flight still has its handle — an older one landing must not discard it');
    var before = c.__served.length;
    c._fcSliceFetch_('regular');
    eq(c.__served.length, before, 'C2 ... so the next reader still JOINS rather than dispatching a duplicate');
    answer(c, 1, 'NEW');
    return settle().then(function () {
      eq(c._fcSliceRec_('regular').flight, null, 'C3 and the live flight clears its own handle when it lands');
      eq(committedTag(c), 'TAG-NEW', 'C4 with the newer answer committed');
    });
  });
});

// =================================================================================================
chain = chain.then(function () {
  section('D. A SUPERSEDED ANSWER IS NOT A FAILED SLICE — §C2, C-RC2');
  var c = world();
  var p1 = c._fcSliceFetch_('regular');
  var rejected = null;
  p1.catch(function (e) { rejected = e; });
  c._fcSliceRec_('regular').flight = null;
  var readbackErr = null;
  c._fcSliceFetch_('regular').catch(function (e) { readbackErr = e; });
  answer(c, 1, 'NEW');
  return settle().then(function () {
    ok(!readbackErr, 'D0 the readback itself succeeded', readbackErr && (readbackErr.code || readbackErr.message));
    eq(c._fcSliceRec_('regular').state, c.FC_FRESH_.CURRENT,
      'D0a the readback lands CURRENT before the older flight arrives');
    answer(c, 0, 'OLD');
    return settle().then(function () {
      ok(rejected && rejected.code === 'FC_SUMMARY_READ_SUPERSEDED',
        'D1 the older flight rejects with the typed supersession code', rejected && rejected.code);
      ok(rejected && rejected.superseded === true, 'D2 ... carrying the marker the caller reads');
      eq(c._fcSliceRec_('regular').state, c.FC_FRESH_.CURRENT,
        'D3 §C2 and the SLICE is not marked failed by it — a newer read already answered it');
      ok(!c._fcSliceRec_('regular').err, 'D4 ... and carries no error for the banner to report');
    });
  });
});

// =================================================================================================
chain = chain.then(function () {
  section('E. THE POST-WRITE CATCH — §C3');
  // The banner path is source-contract here: the harness above owns the fetcher, and the catch is three
  // lines whose whole content is which outcomes count as a failure.
  var post = FCS.slice(FCS.indexOf('  _fcPostWriteWarm_(_sc);'));
  post = post.slice(0, post.indexOf('\n}'));
  ok(/_fcSliceRec_\(_slice\)\.flight = null;/.test(post),
    'E1 the write releases the joinable flight before reading — FC_DUPLICATE_POSTWRITE_READS = 0 (one read, not two)');
  ok(/if \(err && err\.superseded\) return;/.test(post),
    'E2 a superseded readback returns before the banner — FC_FALSE_STALE_BANNER_COUNT = 0');
  ok(post.indexOf('if (err && err.superseded) return;') < post.indexOf('_fcShowBanner_(FC_MSG_.SAVED_STALE'),
    'E3 ... and it returns BEFORE it, not after');
  ok(/if \(!_fcOwns_\(epoch\)\) return;[\s\S]{0,40}\/\* S3-R1/.test(post),
    'E4 the route-ownership check still comes first — a routed-away controller draws nothing');
  ok(/_fcViewState_ = _fcReadModel \? FC_VIEW_\.STALE : FC_VIEW_\.REFUSED;/.test(post),
    'E5 a genuine refresh failure still keeps the last known table — FC_WRITE_ACK_PASS unchanged');
  ok(/_fcHydrateFromModel_\(\);/.test(post), 'E6 and a successful readback still hydrates — FC_HYDRATION_PASS');
  // Comments stripped first: the block contains a note saying _fcRenderError_ is deliberately NOT
  // called here, and reading the explanation as the call is how F4 in the transport suite went wrong.
  var postCode = post.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map(function (l) { return /^\s*\/\//.test(l) ? '' : l; }).join('\n');
  ok(!/_fcRenderError_/.test(postCode),
    'E7 the cold-load error path is still NOT called here — those rows are real and must not be blanked');
});

// =================================================================================================
chain = chain.then(function () {
  section('F. MUTANTS — each returns TRUE when the defect is CAUGHT');
  var caught = 0, survived = [];
  function mutant(id, why, anchor, repl, probe) {
    var src;
    try { src = swapSrc(FCS, anchor, repl); }
    catch (e) { fail++; console.error('HARNESS ERROR  ' + id + ' — ' + e.message); return Promise.resolve(); }
    return Promise.resolve().then(function () { return probe(world(src)); })
      .then(function (got) {
        if (got) { caught++; pass++; console.log('ok   ' + id + '  ' + why + ' (caught)'); }
        else { survived.push(id); fail++; console.error('FAIL  ' + id + '  ' + why + ' SURVIVED'); }
      }, function () { caught++; pass++; console.log('ok   ' + id + '  ' + why + ' (caught — the mutated page threw)'); });
  }

  // The baseline must work, or every probe reads as caught whatever the mutant did.
  var base = world();
  base._fcSliceFetch_('regular');
  base._fcSliceRec_('regular').flight = null;
  base._fcSliceFetch_('regular');
  answer(base, 1, 'NEW');
  return settle().then(function () {
    answer(base, 0, 'OLD');
    return settle();
  }).then(function () {
    ok(committedTag(base) === 'TAG-NEW', 'F0  the unmutated baseline commits the NEWER answer');

    return mutant('F1', 'per-slice request identity is removed, so a pre-write answer lands last',
      '      if (_fcModelGenNow_() !== gen || rec.gen !== myGen) {',
      '      if (_fcModelGenNow_() !== gen) {',
      function (c) {
        c._fcSliceFetch_('regular');
        c._fcSliceRec_('regular').flight = null;
        c._fcSliceFetch_('regular');
        answer(c, 1, 'NEW');
        return settle().then(function () { answer(c, 0, 'OLD'); return settle(); })
          .then(function () { return committedTag(c) === 'TAG-OLD'; });
      })
      .then(function () {
        return mutant('F2', 'a superseded answer is recorded as a slice FAILURE, so the banner reports it',
          '      if (_fcModelGenNow_() === gen && rec.gen === myGen) {',
          '      if (_fcModelGenNow_() === gen) {',
          function (c) {
            c._fcSliceFetch_('regular');
            c._fcSliceRec_('regular').flight = null;
            c._fcSliceFetch_('regular');
            answer(c, 1, 'NEW');
            return settle().then(function () { answer(c, 0, 'OLD'); return settle(); })
              .then(function () { return c._fcSliceRec_('regular').state !== c.FC_FRESH_.CURRENT; });
          });
      })
      .then(function () {
        return mutant('F3', 'a released flight clears its successor\'s handle, so the next read duplicates',
          '  rec.flight = p.then(function (v) { if (rec.gen === myGen) rec.flight = null; return v; },\n                      function (e) { if (rec.gen === myGen) rec.flight = null; throw e; });',
          '  rec.flight = p.then(function (v) { rec.flight = null; return v; },\n                      function (e) { rec.flight = null; throw e; });',
          function (c) {
            c._fcSliceFetch_('regular');
            c._fcSliceRec_('regular').flight = null;
            c._fcSliceFetch_('regular');
            answer(c, 0, 'OLD');
            return settle().then(function () {
              var before = c.__served.length;
              c._fcSliceFetch_('regular');
              return c.__served.length > before;     // it dispatched a duplicate instead of joining
            });
          });
      })
      .then(function () {
        console.log('\n' + new Array(101).join('='));
        console.log('S3-R1 §C FC POST-WRITE READBACK FRESHNESS — passed ' + pass + '  failed ' + fail
          + '  |  mutants caught ' + caught + '  survived ' + survived.length
          + (survived.length ? ' (' + survived.join(', ') + ')' : ''));
        console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
        console.log(new Array(101).join('='));
        process.exit(fail ? 1 : 0);
      });
  });
});

chain.catch(function (e) {
  console.error('FAIL  the suite itself threw: ' + (e && e.stack || e));
  process.exit(1);
});
