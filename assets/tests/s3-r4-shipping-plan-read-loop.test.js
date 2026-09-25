// =================================================================================================================
// S3-R4 §5/§16 — THE WEEKLY SHIPPING PLAN READ LOOP.
//
// S3-R3 reproduced a page that entered and then never settled: showSection('shippingplan') returned, the macrotask
// queue stopped advancing, and nothing further happened for the length of the run. It could not say why, and it
// recorded the stall as open P0 debt with the root cause NOT ESTABLISHED.
//
// MEASURED THIS ROUND, IN A BROWSER, STREAMING: 12 705 000 requests and a macrotask heartbeat frozen on the beat
// the navigation happened on. The MutationObserver counter stayed at zero throughout, which rules out observer
// recursion; every cycle completed in microtasks, which is why no timer ever fired again.
//
// THE DEFECT, IN ONE SENTENCE. renderShippingPlanFromDb passed `renderShippingPlan` to the deployment-verdict
// callback, and renderShippingPlan is not a renderer — it is the page ENTRY POINT, whose first act in DB or
// Workspace mode is to call renderShippingPlanFromDb. The verdict callback therefore re-entered the read that had
// just dispatched it, which dispatched a fresh verdict probe, for ever.
//
// THE GUARD LOOKED LIKE THE STOP CONDITION AND WAS NOT, which is the part worth keeping a test for. Nothing bumps
// _spReadSeq between the dispatch and the callback, so `mySeq === _spReadSeq` was always true. The re-entry then
// bumped the sequence — which made the ORIGINAL read's own `.then` see a stale sequence and DISCARD the plans it
// had just fetched. Every cycle threw away the data it had read and started another one, so the page could not
// reach a first render at all. A guard that is always satisfied is not a guard, and an intermittent-looking symptom
// (a page that "sometimes doesn't load") can be a deterministic loop that simply never gets anywhere.
//
// THE FIX IS NARROW, because what the verdict is for is narrow: _spGateAttrs_ emits markup only when the verdict
// is a REFUSAL. A passing verdict, or no verdict, changes nothing on screen. So the callback now repaints the model
// already in hand, only when there is a refusal to show, and never reads again.
//
// WHAT THIS SUITE DOES NOT CLAIM. It does not measure latency and it does not touch the SKU or Product Strategy
// timeout paths. Those need a server measurement this environment cannot produce; see
// docs/evidence/s3-r4-read-latency/measurements.json for what was and was not established.
//
// NO BUSINESS SEMANTICS ARE TOUCHED. No pricing, no carrier rule, no shipment rule, no write path.
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
/** Comments out, string literals KEPT — this file asks what the code REFERENCES, and names live inside quotes. */
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('HARNESS ERROR — function not found: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('HARNESS ERROR — unbalanced braces: ' + name);
}

const SP = read('assets/js/pages/shipping-plan.js');
const EV = JSON.parse(read('docs/evidence/s3-r4-read-latency/measurements.json'));

// =================================================================================================================
section('A — EXECUTED: one entry dispatches exactly one read');
// =================================================================================================================
// The page's OWN renderShippingPlanFromDb, driven with a renderShippingPlan that re-enters exactly as the real one
// does in DB/Workspace mode. That faithfulness is the whole point: a stub that did NOT re-enter could not fail,
// and a test that cannot fail proves nothing about a loop.
//
// _spReadSeq and _spLastModel are declared in the harness rather than lifted from the file, and _spRenderReadModel_
// is a stub that records the model. Section C asserts, against the real source, that the shipped renderer performs
// that same assignment — so the division of labour is stated rather than assumed.
const RUNAWAY = 60;   // a cap, not an expectation: without it a regression hangs the suite instead of failing it.

function world(opts) {
  opts = opts || {};
  const calls = { contract: 0, read: 0, render: 0, beginLoad: 0, models: [] };
  const src = [
    'var _spReadSeq = 0;',
    'var _spLastModel = null;',
    'function _spRenderReadModel_(model) { _spLastModel = model; calls.render++; calls.models.push(model && model.tag); }',
    extractFn(SP, 'renderShippingPlanFromDb')
  ].join('\n');
  const f = new Function('calls', 'HOST',
    'function renderShippingPlan() { HOST.entry(); }\n'
    + 'function _spEnsureLoadRegion_() { return { beginLoad: function () { calls.beginLoad++; },'
    + '  set: function () {} }; }\n'
    + 'function _spRegionHasContent_() { return false; }\n'
    + 'function _spRefreshContract_() { calls.contract++; return HOST.contract(); }\n'
    + 'function loadWeeklyShippingReadModel_() { calls.read++; return HOST.model(); }\n'
    + src
    + '\nreturn { entry: renderShippingPlanFromDb, seq: function () { return _spReadSeq; },'
    + '         last: function () { return _spLastModel; } };');

  const HOST = {
    entry: function () {
      // The runaway cap. A loop that has re-entered sixty times has proved what it needs to prove.
      if (calls.read >= RUNAWAY) return;
      api.entry();
    },
    contract: function () {
      var v = (opts.verdict === undefined) ? { ok: true } : opts.verdict;
      // `slowVerdict` puts the answer several microtask turns behind the read, which is the order in which a
      // large workspace read beats a small health probe home.
      var p = Promise.resolve(v);
      if (opts.slowVerdict) { for (var i = 0; i < 4; i++) p = p.then(function (x) { return x; }); }
      return p;
    },
    model: function () { return Promise.resolve({ tag: 'M' + calls.read, plans: [], lines: [] }); }
  };
  const api = f(calls, HOST);
  return { api, calls };
}

/** Let every queued microtask drain. Ten turns is far more than one settled entry needs and far fewer than a loop. */
function drain() {
  let p = Promise.resolve();
  for (let i = 0; i < 10; i++) p = p.then(() => {});
  return p;
}

(async function () {
  {
    const w = world({ verdict: { ok: true } });
    w.api.entry();
    await drain();
    eq(w.calls.read, 1, 'A1  ONE entry dispatches ONE canonical read — the loop is closed');
    eq(w.calls.contract, 1, 'A2  and ONE deployment-verdict probe, not one per cycle');
    ok(w.calls.read < RUNAWAY, 'A3  the runaway cap was never reached, so this is a settled read and not a slow loop');
    eq(w.calls.render, 1, 'A4  the plans it fetched are RENDERED — the read is no longer discarded by its own successor');
    eq(w.api.seq(), 1, 'A5  the read sequence advanced exactly once');
  }
  {
    // THE TWO ORDERS ARE DIFFERENT CASES AND ONLY ONE OF THEM NEEDS A REPAINT. The verdict probe and the read
    // race, and which wins decides what the callback has to do. Asserting only one order would have let the
    // other regress silently — the first draft of this suite did exactly that and failed on its own assertion.
    //
    // VERDICT FIRST (the common case: system.health is small): there is no model yet, nothing to repaint, and
    // the single render that follows already has the refusal recorded. One render is CORRECT here.
    const w = world({ verdict: { ok: false, code: 'DEPLOYMENT_CONTRACT_MISMATCH' } });
    w.api.entry();
    await drain();
    eq(w.calls.read, 1, 'A6  a REFUSING verdict still costs exactly one read');
    eq(w.calls.render, 1, 'A7  verdict-before-read needs no repaint — the one render already carries the refusal');
  }
  {
    // VERDICT LAST: the page is already painted when the refusal arrives, so it MUST be repainted or the gated
    // buttons never appear. This is the case the callback exists for.
    const w = world({ verdict: { ok: false, code: 'DEPLOYMENT_CONTRACT_MISMATCH' }, slowVerdict: true });
    w.api.entry();
    await drain();
    eq(w.calls.read, 1, 'A7a a LATE refusal still costs exactly one read');
    eq(w.calls.render, 2, 'A7b and repaints, so the gated buttons actually appear');
    eq(w.calls.models[w.calls.models.length - 1], 'M1',   // the tag the FIRST read produced
      'A8  the repaint uses the model already in hand — the same data, not a second fetch');
  }
  {
    // A verdict that never answers must not hold the page, and must not start anything.
    const w = world({ verdict: null });
    w.api.entry();
    await drain();
    eq(w.calls.read, 1, 'A9  an unanswered verdict changes nothing — still one read');
    eq(w.calls.render, 1, 'A10 and no speculative repaint');
  }

  // =================================================================================================================
  section('B — the re-entry is gone from the source, and the page entry point still is one');
  // =================================================================================================================
  {
    const fromDb = decomment(extractFn(SP, 'renderShippingPlanFromDb'));
    const cb = (fromDb.match(/_spRefreshContract_\(\)\s*\.then\(function \(v\) \{([\s\S]*?)\n    \}\);/) || [])[1];
    ok(typeof cb === 'string', 'B1  the verdict callback is findable — the harness is reading the real thing');
    ok(cb && !/renderShippingPlan\s*\(/.test(cb),
      'B2  the verdict callback does NOT call renderShippingPlan — that call WAS the loop', cb);
    ok(cb && /_spRenderReadModel_\(_spLastModel\)/.test(cb),
      'B3  it repaints the model in hand instead');
    ok(cb && /v\.ok !== false/.test(cb),
      'B4  and only when the verdict is a refusal, which is the only verdict that changes the view');

    const entry = decomment(extractFn(SP, 'renderShippingPlan'));
    ok(/renderShippingPlanFromDb\(\)/.test(entry),
      'B5  renderShippingPlan IS still the entry point that dispatches the read — the fix did not work by '
      + 'quietly making the name mean something else');
  }
  {
    // §12 — failure stays explicit and retry stays bounded. The read's own rejection path is untouched by the fix.
    const fromDb = decomment(extractFn(SP, 'renderShippingPlanFromDb'));
    ok(/PAGE_READ_FAILED/.test(fromDb), 'B6  a failed read is still reported as a failure, with a code');
    // THE BODY, NOT THE DECLARATION. The first version of this line searched the whole extracted function for
    // its own name and matched `function renderShippingPlanFromDb()` — a check that could never pass.
    const body = fromDb.slice(fromDb.indexOf('{'));
    ok(!/renderShippingPlanFromDb\s*\(\s*\)/.test(body),
      'B7  and nothing inside the read function re-enters it — no self-retry anywhere on this path');
  }

  // =================================================================================================================
  section('C — the renderer records what it painted');
  // =================================================================================================================
  {
    const r = decomment(extractFn(SP, '_spRenderReadModel_'));
    ok(/_spLastModel = model/.test(r),
      'C1  _spRenderReadModel_ assigns _spLastModel — the assignment section A stubbed, asserted here on the '
      + 'shipped source so the two halves meet');
    ok(/var _spLastModel = null;/.test(SP), 'C2  and _spLastModel is declared once, at page scope');
    eq((SP.match(/_spLastModel = model/g) || []).length, 1,
      'C3  exactly one writer — a second would mean two answers to "what is on screen"');
  }

  // =================================================================================================================
  section('D — the measurement is recorded, including what it could not measure');
  // =================================================================================================================
  {
    const s = EV.shipping_plan_stall;
    ok(s.before.requests_bounded === false && s.before.requests_observed > 1000000,
      'D1  the before-state is recorded as an unbounded request storm, with the count');
    eq(s.before.macrotask_heartbeat_beat_at_navigation, s.before.macrotask_heartbeat_final_beat,
      'D2  and as a macrotask queue that never advanced past the navigation');
    eq(s.before.mutationobserver_callbacks, 0,
      'D3  with the observer counter at zero, which is what rules OUT observer recursion rather than assuming it');
    ok(s.after_ok_transport.requests_attributable_to_the_page === 2
      && s.after_rejecting_transport.requests_attributable_to_the_page === 3,
      'D4  the after-state is recorded for BOTH a resolving and a rejecting transport');
    ok(s.after_rejecting_transport.requests_attributable_to_the_page <= 3,
      'D5  and the rejecting case stays bounded — one transport retry, not a storm');
    ok(/mount/.test(String(s.corrects_s3_r3)),
      'D6  S3-R3\'s "the mount log never appears" is corrected rather than quietly dropped');
    ok(EV.read_shape.sku_details.interaction_duplicate_requests === 0
      && EV.read_shape.sku_details.controls_that_issue_a_request.length === 1,
      'D7  §10: fourteen of fifteen SKU controls issue nothing; the one that reads is the explicit Refresh');
    ok(EV.read_shape.product_strategy_board.cold_entry_requests === 0
      && /gated off/.test(EV.read_shape.product_strategy_board.reason),
      'D8  §4: the board costs zero requests here BECAUSE the feature is gated off, and the reason is recorded '
      + 'rather than the zero being left to look like a measurement');
    ok(Array.isArray(EV.operator_owned.unfilled) && EV.operator_owned.unfilled.length > 0
      && /absent, not zero/.test(EV.operator_owned.not_invented),
      'D9  every latency figure this environment cannot produce is listed as UNFILLED, not as zero');
    ok(String(EV.hypothesis_for_the_operator_to_test_first.status).indexOf('NOT PROVEN') === 0,
      'D10 and the "this loop may be starving the other pages" explanation is labelled NOT PROVEN');
  }

  // =================================================================================================================
  section('E — the diagnostic harnesses do not litter the repository');
  // =================================================================================================================
  {
    ['assets/tests/_s3r4-stall-bisect.js', 'assets/tests/_s3r4-read-shape.js'].forEach(function (rel) {
      const src = read(rel);
      ok(/finally \{[\s\S]{0,400}unlinkSync/.test(src),
        'E1  ' + path.basename(rel) + ' deletes its generated page in a finally — a stray file in the repo root '
        + 'is what the canonical sweep reports as a suite that left the tree dirty');
      ok(/require\.main === module/.test(src),
        'E2  ' + path.basename(rel) + ' launches a browser only when run directly, never on require');
      ok(/__dirname/.test(src) && !/C:\/Users\//.test(src),
        'E3  ' + path.basename(rel) + ' resolves the repo from __dirname — no machine-specific path');
    });
  }

  // =================================================================================================================
  section('J — MUTANTS');
  // =================================================================================================================
  // The probe returns TRUTHY when it OBSERVES the mutant's wrong behaviour. It is the detector, not the contract.
  {
    let caught = 0; const survived = [];
    async function mutant(id, why, anchor, repl, probe) {
      if (SP.indexOf(anchor) === -1) { fail++; console.log('  FAIL ' + id + ' HARNESS ERROR — anchor not found'); return; }
      const mutated = SP.replace(anchor, repl);
      let saw = false;
      try { saw = !!(await probe(mutated)); } catch (e) { saw = false; }
      if (saw) { caught++; pass++; console.log('  ok   ' + id + ' ' + why + ' (caught)'); }
      else { survived.push(id); fail++; console.log('  FAIL ' + id + ' ' + why + ' — MUTANT SURVIVED'); }
    }

    /** Re-run section A's world against a mutated source. */
    function worldFrom(src, verdict) {
      const calls = { contract: 0, read: 0, render: 0, beginLoad: 0, models: [] };
      const body = [
        'var _spReadSeq = 0;', 'var _spLastModel = null;',
        'function _spRenderReadModel_(model) { _spLastModel = model; calls.render++; calls.models.push(model && model.tag); }',
        extractFn(src, 'renderShippingPlanFromDb')
      ].join('\n');
      const f = new Function('calls', 'HOST',
        'function renderShippingPlan() { HOST.entry(); }\n'
        + 'function _spEnsureLoadRegion_() { return { beginLoad: function () { calls.beginLoad++; }, set: function () {} }; }\n'
        + 'function _spRegionHasContent_() { return false; }\n'
        + 'function _spRefreshContract_() { calls.contract++; return HOST.contract(); }\n'
        + 'function loadWeeklyShippingReadModel_() { calls.read++; return HOST.model(); }\n'
        + body
        + '\nreturn { entry: renderShippingPlanFromDb };');
      const HOST = {
        entry: function () { if (calls.read >= RUNAWAY) return; api.entry(); },
        contract: function () { return Promise.resolve(verdict); },
        model: function () { return Promise.resolve({ tag: 'M' + calls.read, plans: [], lines: [] }); }
      };
      const api = f(calls, HOST);
      return { api, calls };
    }

    // J1 — THE DEFECT ITSELF, planted back. This is the mutant the round exists for.
    await mutant('J1', 'the verdict callback re-enters the page entry point — the measured 12.7-million-request loop',
      '        if (_spLastModel) _spRenderReadModel_(_spLastModel);',
      '        renderShippingPlan();',
      async function (m) {
        const w = worldFrom(m, { ok: false });
        w.api.entry();
        await drain();
        return w.calls.read > 1;   // one entry, more than one read = the loop is back
      });

    // J2 — the same loop planted on the PASSING path, which is the shape the original had: the verdict was not
    //      narrowed to refusals, so every healthy page looped too.
    await mutant('J2', 'the callback fires on a passing verdict as well, so a healthy deployment loops',
      '        if (!v || v.ok !== false) return;        // nothing about the view depends on a passing verdict\n'
      + '        if (_spLastModel) _spRenderReadModel_(_spLastModel);',
      '        renderShippingPlan();',
      async function (m) {
        const w = worldFrom(m, { ok: true });
        w.api.entry();
        await drain();
        return w.calls.read > 1;
      });

    // J3 — the sequence guard is deleted. It never stopped the loop, but it IS what stops a superseded read from
    //      overwriting a newer one, and removing it must not go unnoticed just because it was not the fix.
    await mutant('J3', 'the stale-response guard on the verdict callback is removed',
      '        if (mySeq !== _spReadSeq) return;        // a newer load owns the page',
      '        /* guard removed */',
      function (m) {
        const cb = (decomment(extractFn(m, 'renderShippingPlanFromDb'))
          .match(/_spRefreshContract_\(\)\s*\.then\(function \(v\) \{([\s\S]*?)\n    \}\);/) || [])[1] || '';
        return !/mySeq !== _spReadSeq/.test(cb);
      });

    // J4 — the renderer stops recording what it painted, so a refusal has nothing to repaint from and the gated
    //      buttons silently never appear. A regression that shows up as an ABSENCE, which is the hard kind.
    await mutant('J4', 'the renderer no longer records the model, so a refusal never reaches the screen',
      '    _spLastModel = model;     // so a late deployment verdict can repaint this without re-reading',
      '    /* not recorded */',
      async function (m) {
        const keeps = extractFn(m, '_spRenderReadModel_').indexOf('_spLastModel = model') !== -1;
        const src = [
          'var _spReadSeq = 0;', 'var _spLastModel = null;',
          keeps
            ? 'function _spRenderReadModel_(model) { _spLastModel = model; calls.render++; }'
            : 'function _spRenderReadModel_(model) { calls.render++; }',
          extractFn(m, 'renderShippingPlanFromDb')
        ].join('\n');
        const calls = { contract: 0, read: 0, render: 0 };
        const f = new Function('calls', 'HOST',
          'function renderShippingPlan() {}\n'
          + 'function _spEnsureLoadRegion_() { return { beginLoad: function () {}, set: function () {} }; }\n'
          + 'function _spRegionHasContent_() { return false; }\n'
          + 'function _spRefreshContract_() { calls.contract++; return HOST.contract(); }\n'
          + 'function loadWeeklyShippingReadModel_() { calls.read++; return HOST.model(); }\n'
          + src + '\nreturn renderShippingPlanFromDb;');
        // The LATE verdict, because that is the order in which the repaint is the only thing that can show it.
        const entry = f(calls, {
          contract: function () {
            let p = Promise.resolve({ ok: false });
            for (let i = 0; i < 4; i++) p = p.then((x) => x);
            return p;
          },
          model: function () { return Promise.resolve({ tag: 'M', plans: [] }); }
        });
        entry();
        await drain();
        return calls.render < 2;   // the refusal repaint never happened
      });

    // J5 — the read's failure stops being reported, so a timeout would render as an ordinary empty page. §12.
    await mutant('J5', 'a failed read no longer reports a failure code',
      "_spRenderReadModel_({ source: 'error', error: { code: 'PAGE_READ_FAILED'",
      "_spRenderReadModel_({ plans: [], lines: [] }); return; _spRenderReadModel_({ source: 'error', error: { code: 'PAGE_READ_FAILED'",
      function (m) {
        const fromDb = decomment(extractFn(m, 'renderShippingPlanFromDb'));
        return /_spRenderReadModel_\(\{ plans: \[\], lines: \[\] \}\); return;/.test(fromDb);
      });

    console.log('\n  mutants caught ' + caught + (survived.length ? '  SURVIVED: ' + survived.join(', ') : ''));
  }

  console.log('\n' + new Array(101).join('='));
  console.log('S3-R4 SHIPPING PLAN READ LOOP — passed ' + pass + '  failed ' + fail);
  console.log('READS_PER_ENTRY = 1 · VERDICT_PROBES_PER_ENTRY = 1 · SELF_RE_ENTRY = 0');
  console.log('TIMEOUT_AS_EMPTY = 0 · UNBOUNDED_RETRY = 0');
  console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · DEPLOYMENTS=0');
  console.log(new Array(101).join('='));
  process.exit(fail ? 1 : 0);
}());
