// =================================================================================================================
// S3-R12 — WHY THE SPECIAL BUILDER COST SIX TIMES WHAT THE REGULAR ONE DID.
//
// THE OPERATOR'S NUMBERS: Regular Next ~6 s cold and immediate warm; Special Next ~37 s cold and immediate warm.
// Both paths share one loader, one latch and one settle, so the difference is not in the machinery — it is in the
// LIST each path declares. Regular declares two tables. Special declared six.
//
// WHAT WAS RULED OUT FIRST, by measurement rather than by argument. Client normalization was the obvious suspect
// and it is not the answer: the shipped normalizeOperationDb, run in Node with real timers over 40 000
// campaign_sku_lines and 9 000 pricing rows, takes about a third of a second for the whole six-table set. The same
// fixtures serialize to roughly 20 MB of JSON for the Special set against 2.8 MB for the Regular one — a 5-7x
// ratio that tracks the observed 37 s against 6 s. The cost is the reads, and section C holds that finding.
//
// WHAT THE BUILDER ACTUALLY READS, established by EXECUTION. The R12 runner wraps every broad-cache getter and
// counts calls during a real Special builder open in a real browser. Two of the six tables — campaign_sku_lines
// and pricing_list, the two largest — are FETCHED BEFORE THE BUILDER OPENS AND THEIR GETTERS ARE NEVER CALLED.
// A third, fc_special_events, is read, but through `_evtBuilderEventRows_`, which prefers the workspace read
// model and only falls back to the broad cache.
//
// SO ONE OF THE THREE WAS SHIPPABLE THIS ROUND AND TWO WERE NOT, and the distinction is the round's main
// judgement call:
//
//   · fc_special_events had an AUTHORITATIVE SCOPED OWNER ALREADY — the `events` slice, whose declared key set is
//     exactly ['fcSpecialEvents']. Replacing a full-table getTable with the scoped slice moves nothing out of the
//     cold path and changes no freshness semantics; the data is still there when the builder opens. This is the
//     same removal R2-STABILITY §2 made for fc_regular_forecast on the Regular path, with the same replacement
//     shape (`_fcEnsureBaseFcSource_`), so it is implemented.
//
//   · campaign_sku_lines and pricing_list are genuinely needed LATER — the first when an existing event is
//     picked, the second when a SKU row is given a SKU. Dropping them from the cold path is a DEFERRAL, which is
//     exactly what §11 reserves for the operator. So they are measured, costed and PROPOSED, not shipped. The
//     variant was built, measured (4 requests / 2 rounds -> 2 requests / 1 round) and reverted.
//
// THE SKU REGIONAL TIMEOUT (§8) is not reproducible here and this suite does not pretend otherwise: the cause
// lives in the Apps Script container. What section E seals is the BEHAVIOUR the operator relied on — one read
// stalled past its 60 s budget in a real browser produces a NAMED refusal with a Retry, no stuck skeleton and no
// leaked request, and the Retry recovers in one read.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }

const FC = () => read('assets/js/pages/fc-summary.js');
const RUNNER = () => read('assets/tests/_s3r11-interaction-runner.js');
const EV = JSON.parse(read('docs/evidence/s3-r12-fc-cold-path/measurements.json'));

// -----------------------------------------------------------------------------------------------------------
// THE PREDICATES, EXECUTED. fc-summary.js is 8 000 lines of DOM-bound page code, so the whole module cannot be
// loaded here — but the three functions this round added are pure decisions over four injected dependencies, and
// running their REAL source against controlled inputs is a stronger test than matching their text.
// -----------------------------------------------------------------------------------------------------------
function extract(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('no such function: ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
/** Run the two source guards with injected dependencies; returns what they decided and what they fetched. */
function runGuards(src, deps) {
  const fetched = [];
  const sandbox = {
    FC_SLICE_: { BOOTSTRAP: 'bootstrap', REGULAR: 'regular', EVENTS: 'events', RULES: 'rules' },
    _fcPrereqPath_: (m) => (m === 'event' ? 'event' : 'regular'),
    _fcWorkspaceMode_: () => deps.workspace,
    _fcHas_: (k) => !!deps.has[k],
    _fcSliceFetch_: (n) => { fetched.push(n); return Promise.resolve('slice:' + n); },
    _fcLoadPrerequisites_: () => { fetched.push('tables'); return Promise.resolve(); },
    Promise
  };
  const ctx = vm.createContext(sandbox);
  ['_fcBaseFcSourceMissing_', '_fcEnsureBaseFcSource_', '_fcEventSourceMissing_',
   '_fcEnsureEventSource_', '_fcPrereqAndSources_'].forEach((n) => {
    vm.runInContext(extract(src, n), ctx);
  });
  return { ctx, fetched };
}

// =================================================================================================================
section('A — §2 THE TWO LISTS, WHICH IS WHERE THE WHOLE DIFFERENCE LIVES');
// =================================================================================================================
{
  const src = FC();
  const block = src.slice(src.indexOf('var _FC_PREREQ_TABLES_'), src.indexOf('// The union'));
  const regular = /regular: \[([^\]]*)\]/.exec(block)[1].replace(/'/g, '').split(',').map((s) => s.trim());
  const event = /event: \[([\s\S]*?)\]/.exec(block)[1].replace(/'/g, '').replace(/\s+/g, ' ')
    .split(',').map((s) => s.trim()).filter(Boolean);

  eq(regular, ['sku_details', 'marketplace_skus'], 'A1  the Regular path still declares two tables');
  eq(event, ['sku_details', 'marketplace_skus', 'campaigns', 'campaign_sku_lines', 'pricing_list'],
    'A2  the Special path declares FIVE — fc_special_events has left the list');
  ok(event.indexOf('fc_special_events') === -1,
    'A2a and it is gone by name, not merely reordered');

  // A3 — the two paths still DIFFER, which is the point R2-STABILITY made when it split them: attaching a
  //      Regular open to a Special load would open a builder over tables nobody fetched.
  ok(event.length > regular.length && regular.every((t) => event.indexOf(t) >= 0),
    'A3  Regular remains a strict subset of Special — the paths are separate, not merged');

  // A4 — the events slice is the owner that took it over, and its key set says so.
  ok(/events: \['fcSpecialEvents'\]/.test(src), 'A4  the events slice declares exactly fcSpecialEvents');
}

// =================================================================================================================
section('B — THE SOURCE GUARD, EXECUTED AGAINST ITS FOUR DEPENDENCIES');
// =================================================================================================================
(async function () {
  const src = FC();

  // B1 — the event path, cold: the model lacks the key, so the slice is fetched.
  {
    const { ctx, fetched } = runGuards(src, { workspace: true, has: {} });
    ok(ctx._fcEventSourceMissing_('event') === true, 'B1  event path + missing key -> the source IS missing');
    await ctx._fcEnsureEventSource_('event');
    eq(fetched, ['events'], 'B1a and the EVENTS slice is what gets fetched');
  }

  // B2 — WARM. The key is present, so nothing is issued. This is the §7 seal at its source.
  {
    const { ctx, fetched } = runGuards(src, { workspace: true, has: { fcSpecialEvents: true } });
    ok(ctx._fcEventSourceMissing_('event') === false, 'B2  a model that already holds the key is not missing');
    await ctx._fcEnsureEventSource_('event');
    eq(fetched, [], 'B2a and NOTHING is fetched — the warm path stays at zero requests');
  }

  // B3 — the REGULAR path never fetches the events slice. Fetching a tab nobody opened is the eager read
  //      _FC_SLICE_KEYS_ deliberately keeps out of bootstrap, and it would be reintroduced here.
  {
    const { ctx, fetched } = runGuards(src, { workspace: true, has: {} });
    ok(ctx._fcEventSourceMissing_('regular') === false, 'B3  the Regular path does not need the events slice');
    await ctx._fcEnsureEventSource_('regular');
    eq(fetched, [], 'B3a and does not fetch it');
  }

  // B4 — LEGACY MODE. `_fcPrereqNeeded_` returns false when the workspace is not effective, so the list is
  //      never consulted there and the broad cache answers as it always did. The guard must agree: issuing a
  //      workspace slice fetch in legacy mode would be a read that path has never made.
  {
    const { ctx, fetched } = runGuards(src, { workspace: false, has: {} });
    ok(ctx._fcEventSourceMissing_('event') === false, 'B4  legacy mode: not missing, because there is no model');
    await ctx._fcEnsureEventSource_('event');
    eq(fetched, [], 'B4a and no slice is fetched in legacy mode');
  }

  // B5 — ALL THREE SETTLE TOGETHER, and concurrently. A slice made to wait for the table reads would have
  //      moved the cost rather than removed it.
  {
    const { ctx, fetched } = runGuards(src, { workspace: true, has: {} });
    await ctx._fcPrereqAndSources_('event');
    eq(fetched.sort(), ['events', 'regular', 'tables'],
      'B5  an event open settles the tables, the Base FC slice and the events slice');
  }
  {
    const { ctx, fetched } = runGuards(src, { workspace: true, has: {} });
    await ctx._fcPrereqAndSources_('regular');
    eq(fetched.sort(), ['regular', 'tables'], 'B5a a Regular open settles the tables and Base FC only');
  }
  {
    // Fully warm: a second open of either builder issues nothing at all.
    const { ctx, fetched } = runGuards(src,
      { workspace: true, has: { fcSpecialEvents: true, fcRegularForecast: true } });
    await ctx._fcPrereqAndSources_('event');
    eq(fetched, ['tables'], 'B5b warm model -> only the table latch runs, and it is itself latched');
  }

  // B6 — the concurrency is structural, not incidental.
  ok(/Promise\.all\(\[_fcLoadPrerequisites_\(mode\), _fcEnsureBaseFcSource_\(mode\),\s*_fcEnsureEventSource_\(mode\)\]\)/
    .test(src), 'B6  the three run under one Promise.all rather than in sequence');

  // =================================================================================================================
  section('C — §3/§4 WHAT DOMINATES, AND WHAT WAS RULED OUT');
  // =================================================================================================================
  {
    const N = EV.client_normalization_cost;
    ok(N.large_scale_total_ms < 1000,
      'C1  the whole six-table set normalizes in well under a second at large scale', N.large_scale_total_ms);
    ok(N.mid_scale_total_ms < N.large_scale_total_ms, 'C1a and the cost scales with volume, as expected');
    ok(/ruled OUT/.test(N.conclusion) && /the cost is the reads/i.test(N.conclusion),
      'C2  so CLIENT_NORMALIZATION is excluded by measurement, and the reads are named instead');

    // C3 — THE FINDING THAT LICENSES §11: two tables fetched before the builder opens, never read by it.
    eq(EV.getters_called_during_special_open.FETCHED_BUT_NEVER_CALLED.sort(),
      ['getCampaignSkuLines', 'getPricingList'],
      'C3  two of the six tables are fetched cold and their getters are never called');
    ok(EV.getters_called_during_special_open.called.indexOf('getCampaigns') >= 0,
      'C3a while campaigns IS read at open, so it stays');
    ok(EV.getters_called_during_special_open.called.indexOf('getFcSpecialEvents') >= 0,
      'C3b and the events rows ARE read at open — which is why they were re-homed, not dropped');
    ok(/deferral/.test(EV.getters_called_during_special_open.why_it_matters)
      && /§11/.test(EV.getters_called_during_special_open.why_it_matters),
      'C3c and the evidence records that removing them is a DEFERRAL, hence operator territory');

    // C4 — the read pool is what turns a table count into a round count.
    eq(EV.path_diff.READ_POOL_SIZE, 2, 'C4  the scoped read pool is two lanes');
    ok(/ceil\(6\/2\) = 3/.test(EV.path_diff.TRUE_COLD_ROUNDS_PRE),
      'C4a so six tables were three sequential rounds on a true cold open');
  }

  // =================================================================================================================
  section('D — §12 PRE -> POST, AND §7 THE WARM SEAL');
  // =================================================================================================================
  {
    const pre = EV.runs.pre, post = EV.runs.post;

    // D1 — the broad full-table read is gone and a scoped slice took its place.
    ok(Object.keys(pre.FC_NEXT_SPECIAL.byAction).indexOf('getTable:fc_special_events') >= 0,
      'D1  PRE: the Special cold path read fc_special_events as a full table');
    ok(Object.keys(post.FC_NEXT_SPECIAL.byAction).indexOf('getTable:fc_special_events') === -1,
      'D1a POST: it does not');
    ok(Object.keys(post.FC_NEXT_SPECIAL.byAction).indexOf('fcSummary.workspace.get:events') >= 0,
      'D1b POST: the scoped events slice is read instead');

    // D2 — AND THE BUILDER CAN STILL READ ITS EVENTS. `_evtBuilderEventRows_` answers null for UNAVAILABLE and
    //      the picker then says so in words; a removal that produced that would be a correctness regression
    //      wearing a performance label.
    eq(post.SPECIAL_EXISTING_PICKER.unreadable, false,
      'D2  the existing-event picker does NOT report "could not be read"');
    eq(post.SPECIAL_EXISTING_PICKER.disabled, false, 'D2a it is not disabled');
    eq(post.SPECIAL_EXISTING_PICKER.noteShown, false, 'D2b and no unavailability note is shown');
    eq(post.SPECIAL_EXISTING_PICKER, pre.SPECIAL_EXISTING_PICKER,
      'D2c and it is byte-for-byte what it was before the change');

    // D3 — §7, the seal this round must not break.
    eq(post.FC_NEXT_SPECIAL_WARM.api, 0, 'D3  SPECIAL_WARM_REQUEST_COUNT = 0');
    eq(post.FC_NEXT_REGULAR_WARM.api, 0, 'D3a REGULAR_WARM_REQUEST_COUNT = 0');

    // D4 — the Regular path is untouched, which is what keeps the two paths separable.
    eq(post.FC_NEXT_REGULAR.byAction, pre.FC_NEXT_REGULAR.byAction,
      'D4  the Regular cold path issues exactly what it did before');
    eq(post.FC_NEXT_REGULAR.rounds, pre.FC_NEXT_REGULAR.rounds, 'D4a in the same number of rounds');

    // D5 — no duplicate read was introduced by giving the path a second owner.
    eq(post.FC_NEXT_SPECIAL.dupes, 0, 'D5  no duplicate request on the Special cold path');
    eq(post.FC_NEXT_REGULAR.dupes, 0, 'D5a nor on the Regular one');

    // D6 — HONEST ABOUT WHAT DID NOT MOVE. The request count and the round count are unchanged; what changed
    //      is that a full-table scan became a scoped read. Asserting this keeps the report from claiming a
    //      round-count win it did not earn.
    eq(post.FC_NEXT_SPECIAL.api, pre.FC_NEXT_SPECIAL.api,
      'D6  the Special request COUNT is unchanged — this round traded a scan for a scoped read');
    eq(post.FC_NEXT_SPECIAL.rounds, pre.FC_NEXT_SPECIAL.rounds, 'D6a and so is the round count');
  }

  // =================================================================================================================
  section('E — §8 THE SKU REGIONAL TIMEOUT: THE CAUSE IS NOT REPRODUCIBLE, THE RECOVERY IS SEALED');
  // =================================================================================================================
  {
    const T = EV.sku_regional_timeout;
    eq(T.REPRODUCED_CAUSE, false, 'E1  SKU_REGIONAL_TIMEOUT_REPRODUCED = NO, stated rather than implied');
    ok(/Apps Script container/.test(T.why), 'E1a with the reason it cannot be, not an apology');

    const R = EV.runs.post.SRD_TIMEOUT_REFUSAL, K = EV.runs.post.SRD_TIMEOUT_RECOVERY;
    eq(R.stalled, 1, 'E2  exactly one read was stalled past its budget');
    eq(R.refusalShown, true, 'E2a the page shows a Retry rather than waiting for ever');
    ok(/REQUEST_TIMEOUT/.test(R.refusalText), 'E2b and NAMES the failure');
    ok(/60s/.test(R.refusalText), 'E2c including the budget it exceeded');
    eq(R.stillSkeleton, 0, 'E3  PERMANENT_LOADING_COUNT = 0 — no skeleton is left on screen');
    eq(R.openRequests, 0, 'E3a and no request is left open, so the timeout settled its own registry row');
    eq(R.itemsRendered, 0, 'E3b nothing stale was committed in place of the answer');

    eq(K.api, 1, 'E4  Retry issues exactly ONE read — not a replay storm');
    ok(K.itemsRendered > 0, 'E4a and it recovers: the master list renders', K.itemsRendered);
    eq(K.stillSkeleton, 0, 'E4b with no skeleton left behind');
    eq(K.openRequests, 0, 'E4c and nothing still open afterwards');
  }

  // =================================================================================================================
  section('F — THE INSTRUMENT, AND THE TWO FAULTS THAT WOULD HAVE HIDDEN THIS ROUND');
  // =================================================================================================================
  {
    const r = RUNNER();
    ok(/_FC_SLICE_KEYS_|SLICE_KEYS/.test(r), 'F1  the fixture answers one key set per slice');
    ok(/ONE SLICE, ONE KEY SET/.test(r), 'F1a and says why, because the old fixture hid this round entirely');
    eq(EV.harness_faults_found_and_fixed.length, 2, 'F2  both harness faults are recorded, not quietly fixed');
    ok(/could never be missing/.test(EV.harness_faults_found_and_fixed[0]),
      'F2a including the one that made _fcEnsureEventSource_ unobservable');
    ok(/stallOnce/.test(r), 'F3  the runner can stall one named read past its budget');
    ok(/P\.getters\[n\]\+\+/.test(r), 'F4  and counts broad-cache getter calls, which is how C3 was established');
    ok(/function _rounds\(marks\)/.test(r), 'F5  and derives READ ROUNDS from sent/settled marks');

    // F6 — the §11 variant is recorded as measured-and-reverted, so nobody can mistake it for shipped work.
    const V = EV.runs.s11_variant_measurement_only;
    ok(/MEASURED AND REVERTED/.test(V.DISCLAIMER), 'F6  the §11 variant is marked measured-and-reverted');
    ok(/NOT committed and NOT shipped/.test(V.DISCLAIMER), 'F6a and explicitly not shipped');
    eq(V.FC_NEXT_SPECIAL.rounds, 1, 'F6b it measured at ONE round against the shipped two');
    ok(V.FC_NEXT_SPECIAL.api < EV.runs.post.FC_NEXT_SPECIAL.api,
      'F6c and fewer requests, which is the number the proposal carries');
    // AND IT IS NOT IN THE TREE.
    const block = FC().slice(FC().indexOf('var _FC_PREREQ_TABLES_'), FC().indexOf('// The union'));
    ok(/campaign_sku_lines/.test(block) && /pricing_list/.test(block),
      'F6d and the shipped list still contains both tables — the variant was reverted, not left behind');
  }

  // =================================================================================================================
  section('J — MUTANTS');
  // =================================================================================================================
  {
    let killed = 0, survived = 0, harness = 0;
    async function mutate(file, from, to, name, probe) {
      const abs = path.join(ROOT, file);
      const before = fs.readFileSync(abs, 'utf8');
      if (before.split(from).length - 1 !== 1) {
        harness++; console.log('  HARNESS ERROR ' + name + ' — anchor matched '
          + (before.split(from).length - 1) + ' times'); return;
      }
      fs.writeFileSync(abs, before.split(from).join(to), 'utf8');
      try {
        const bad = await probe();
        if (bad) { killed++; console.log('  ok   ' + name + ' KILLED'); }
        else { survived++; console.log('  FAIL ' + name + ' SURVIVED'); }
      } catch (e) { killed++; console.log('  ok   ' + name + ' KILLED (threw)'); }
      finally { fs.writeFileSync(abs, before, 'utf8'); }
    }
    const guards = async (deps, mode) => {
      const { ctx, fetched } = runGuards(FC(), deps);
      await ctx._fcEnsureEventSource_(mode);
      return fetched;
    };

    // J1 — the events slice is fetched for the REGULAR path too: an eager read of a tab nobody opened.
    await mutate('assets/js/pages/fc-summary.js',
      "return _fcPrereqPath_(mode) === 'event' && _fcWorkspaceMode_()",
      "return _fcWorkspaceMode_()",
      'J1 the event-path check is removed', async () =>
        (await guards({ workspace: true, has: {} }, 'regular')).length > 0);

    // J2 — the missing-key check is removed: every open re-fetches, and the §7 warm seal dies.
    await mutate('assets/js/pages/fc-summary.js',
      "&& !_fcHas_('fcSpecialEvents');", "&& true;",
      'J2 the already-loaded check is removed', async () =>
        (await guards({ workspace: true, has: { fcSpecialEvents: true } }, 'event')).length > 0);

    // J3 — the workspace-mode check is removed: legacy mode issues a slice read it has never made.
    await mutate('assets/js/pages/fc-summary.js',
      "=== 'event' && _fcWorkspaceMode_() &&", "=== 'event' &&",
      'J3 the workspace-mode check is removed', async () =>
        (await guards({ workspace: false, has: {} }, 'event')).length > 0);

    // J4 — the WRONG slice is fetched. The model never gains fcSpecialEvents, so `_evtBuilderEventRows_`
    //      falls through to a broad table this round stopped loading: the picker goes unreadable.
    await mutate('assets/js/pages/fc-summary.js',
      // SINGLE-LINE anchors, because the tree is CRLF: an anchor carrying \n matches nothing and the
      // mutant reports a HARNESS ERROR rather than a result. The same trap S3-R8's J4/J5 fell into.
      "return _fcSliceFetch_(FC_SLICE_.EVENTS);",
      "return _fcSliceFetch_(FC_SLICE_.REGULAR);",
      'J4 the Base FC slice is fetched instead of the events slice', async () => {
        const f = await guards({ workspace: true, has: {} }, 'event');
        return JSON.stringify(f) !== JSON.stringify(['events']);
      });

    // J5 — the ensure is dropped from the settle, so the builder opens before its events have landed.
    await mutate('assets/js/pages/fc-summary.js',
      "_fcEnsureEventSource_(mode)]).then(function () {});",
      "_fcEnsureBaseFcSource_(mode)]).then(function () {});",
      'J5 the events source is not awaited with the others', async () => {
        const { ctx, fetched } = runGuards(FC(), { workspace: true, has: {} });
        await ctx._fcPrereqAndSources_('event');
        return fetched.indexOf('events') === -1;
      });

    // J6 — fc_special_events is put back in the prerequisite list: the full-table scan returns, now
    //      ALONGSIDE the slice, so the round's cost is paid twice.
    await mutate('assets/js/pages/fc-summary.js',
      "          'pricing_list']", "          'pricing_list', 'fc_special_events']",
      'J6 the broad table is restored to the list', async () => {
        const src = FC();
        const block = src.slice(src.indexOf('var _FC_PREREQ_TABLES_'), src.indexOf('// The union'));
        return /fc_special_events/.test(block);
      });

    console.log('  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harness + ' harness errors');
    ok(survived === 0 && harness === 0, 'J   every planted defect was caught', { killed, survived, harness });
  }

  console.log('\n' + (fail ? 'FAIL  ' : 'PASS  ') + pass + ' passed, ' + fail + ' failed');
  console.log('SPECIAL_COLD_ROOT_CAUSE = READ VOLUME AND READ ROUNDS, NOT CLIENT WORK · '
    + 'BROAD fc_special_events REMOVED · WARM = 0 REQUESTS · CRITICAL_SECONDARY_LAZY = OPERATOR DECISION');
  if (fail) process.exitCode = 1;
}());
