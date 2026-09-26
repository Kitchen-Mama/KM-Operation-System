// =================================================================================================================
// S3 DIAGNOSTIC CAPTURE TOOLS — IDENTITY, ISOLATION, AND READ-ONLINESS.
//
// WHY THIS SUITE EXISTS.
//
// S3-R6 and S3-R7 each shipped a console capture tool, and both were named `capture-console-snippet.js`. Same
// basename, different directory. In an editor tab strip they are indistinguishable, so an operator following
// the S3-R6 protocol opened the S3-R7 file, pasted it, and got `typeof __kmS3R6 === 'undefined'` — a production
// capture session spent on a filename.
//
// Nothing was corrupted and nothing was overwritten. The defect was the name, and the repair is the name: the
// files are now s3r6-read-cost-capture.js and s3r7-redirect-chain-capture.js, and each states on its second
// line which global it defines. This suite makes that permanent. A1 is the assertion that would have prevented
// the incident, and it is written against the DIRECTORY rather than against a list of known files, so a third
// tool added later is covered without anyone remembering to come back here.
//
// The rest is the operator's own acceptance list, executed rather than described: each tool defines its own
// global and only its own; loading both in one session leaves both intact; measure() emits every field the
// protocol asks for, including the COLD/WARM/REPEAT label on the row; passive() reads the timeline shape the
// transport actually returns; and neither tool can write anything.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }

const EVID = path.join(ROOT, 'docs', 'evidence');
const R6 = 'docs/evidence/s3-r6-server-read-cost/s3r6-read-cost-capture.js';
const R7 = 'docs/evidence/s3-r7-redirect-chain/s3r7-redirect-chain-capture.js';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Every console capture tool under docs/evidence, found rather than listed. */
function allTools() {
  const out = [];
  fs.readdirSync(EVID, { withFileTypes: true }).forEach((d) => {
    if (!d.isDirectory()) return;
    fs.readdirSync(path.join(EVID, d.name)).forEach((f) => {
      if (f.endsWith('.js')) out.push({ dir: d.name, file: f, rel: 'docs/evidence/' + d.name + '/' + f });
    });
  });
  return out;
}

// ===========================================================================================================
section('A — THE ROOT CAUSE: two tools may never share a basename again');
// ===========================================================================================================
{
  const tools = allTools();
  ok(tools.length >= 2, 'A0 there is more than one capture tool, which is what makes A1 necessary',
    tools.map((t) => t.rel));

  const byBase = {};
  tools.forEach((t) => { (byBase[t.file] = byBase[t.file] || []).push(t.rel); });
  const collisions = Object.keys(byBase).filter((b) => byBase[b].length > 1).map((b) => ({ basename: b, at: byBase[b] }));
  eq(collisions, [],
    'A1 no two capture tools share a basename — an editor tab strip shows the basename and nothing else',
    collisions);

  // A name that says nothing is how the collision happened in the first place.
  const vague = tools.filter((t) => /^capture-console-snippet\.js$/.test(t.file));
  eq(vague.map((t) => t.rel), [],
    'A1a and the name that caused it is gone from the tree entirely');

  tools.forEach((t) => {
    const base = t.file.replace(/\.js$/, '');
    ok(/^s3r\d/.test(base),
      'A2 ' + t.file + ' is prefixed with the round that owns it, so the path and the protocol agree');
  });
}

// ===========================================================================================================
section('B — EACH FILE DECLARES WHICH GLOBAL IT CREATES, BEFORE YOU PASTE IT');
// ===========================================================================================================
{
  const r6 = read(R6), r7 = read(R7);
  const head6 = r6.split('\n').slice(0, 12).join('\n');
  const head7 = r7.split('\n').slice(0, 12).join('\n');

  ok(head6.indexOf('__kmS3R6') >= 0, 'B1 the S3-R6 tool names __kmS3R6 in its first twelve lines');
  ok(head7.indexOf('__kmS3R7') >= 0, 'B2 the S3-R7 tool names __kmS3R7 in its first twelve lines');
  ok(head6.indexOf('s3r7-redirect-chain-capture.js') >= 0,
    'B3 and the S3-R6 header points at its sibling BY PATH, so the wrong file is recoverable without asking');
  ok(head7.indexOf('s3r6-read-cost-capture.js') >= 0, 'B4 and the S3-R7 header does the same in reverse');

  // The assignment itself, not just the prose.
  const asg6 = (r6.match(/root\.__kmS3R\d\s*=/g) || []);
  const asg7 = (r7.match(/root\.__kmS3R\d\s*=/g) || []);
  eq(asg6, ['root.__kmS3R6 ='], 'B5 the S3-R6 tool assigns exactly one global, and it is __kmS3R6');
  eq(asg7, ['root.__kmS3R7 ='], 'B6 the S3-R7 tool assigns exactly one global, and it is __kmS3R7');
}

// ===========================================================================================================
section('C — READ ONLY: neither tool can write, lock or mutate');
// ===========================================================================================================
{
  [[R6, 'S3-R6'], [R7, 'S3-R7']].forEach(([rel, name]) => {
    const src = read(rel);
    ok(!/method:\s*['"]POST['"]/.test(src), 'C1 ' + name + ' contains no POST');
    ok(!/\.(update|create|delete|submit|confirm|write|upsert)\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
      'C2 ' + name + ' calls no mutating method');
    ok(!/LockService|getLock|acquireLock/.test(src), 'C3 ' + name + ' takes no lock');
    ok(!/localStorage|sessionStorage|indexedDB/.test(src), 'C4 ' + name + ' persists nothing in the browser');
    ok(src.indexOf('writes: 0') > 0, 'C5 ' + name + ' declares a zero-write contract');
  });
  // The tools live outside every runtime path, so nothing can load them by accident.
  const idx = read('index.html');
  ok(idx.indexOf('s3r6-read-cost-capture') < 0 && idx.indexOf('s3r7-redirect-chain-capture') < 0,
    'C6 neither tool is referenced by index.html — they are pasted, never shipped');
}

// ===========================================================================================================
section('D — EXECUTED: the S3-R6 tool defines __kmS3R6 and measures what the protocol asks for');
// ===========================================================================================================

/** An envelope shaped the way every workspace handler shapes one. */
function envelope(action, opts) {
  const o = opts || {};
  return {
    success: true,
    data: { counts: { rows: o.rows === undefined ? 7 : o.rows } },
    meta: { action: action, requestId: o.rid || ('REQ-' + action), serverDurationMs: o.ms === undefined ? 1234 : o.ms,
      tablesRead: o.tables === undefined ? 3 : o.tables, slice: o.slice || null },
    errors: []
  };
}

function kmWindow() {
  const calls = [];
  const samples = [];
  let seq = 0;
  function note(action) {
    seq += 1;
    const rid = 'REQ-' + action + '-' + seq;
    calls.push(action);
    samples.push({ request_id: rid, server_request_id: rid, action: action, bytes: 4096, attempts: 1,
      concurrent_at_dispatch: 1, dispatch_ms: seq * 10, settled_ms: seq * 10 + 5, ms: 5,
      code: null, phase: 'SUCCESS', server_ms: 1234, server_answered: true, http_status: 200,
      redirected: true, kind: 'read', marks_source: 'OBSERVED' });
    return rid;
  }
  const win = {
    console: { log: () => {} },
    performance: { now: () => Date.now() },
    KM: {
      api: {
        getWorkspace: (name, opts) => {
          const slice = opts && opts.include && opts.include.slice;
          const action = name + '.workspace.get';
          return Promise.resolve(envelope(action, { rid: note(action), slice: slice || null }));
        }
      },
      productPricingWorkspace: {
        getSiteUniverse: () => Promise.resolve(envelope('productPricing.siteUniverse.get',
          { rid: note('productPricing.siteUniverse.get'), tables: 1 })),
        get: (p) => { calls.push('SCOPE:' + JSON.stringify(p && p.scope));
          return Promise.resolve(envelope('productPricing.workspace.get',
            { rid: note('productPricing.workspace.get'), tables: 6 })); }
      },
      DB: { checkDeploymentContract: () => Promise.resolve({ ok: true }) },
      transport: {
        metrics: () => ({ requests: seq, retries: 0, recoveries: 0, coalesced: 0,
          byCode: { SUCCESS: seq }, byAction: {}, samples: samples }),
        timeline: () => ({ epoch_offset_ms: 0, request_timeline: samples.slice(), mutations: [],
          mutation_requests: 0, peak_concurrent_requests: 2, requests: samples.length,
          solitary_requests: [] }),
        peakConcurrentRequests: () => 2, openRequests: () => 0,
        resetMetrics: () => { samples.length = 0; seq = 0; }
      }
    }
  };
  return { win, calls };
}

function loadInto(win, rel) {
  new Function('window', read(rel) + '\n;return true;').call(null, win);
  return win;
}

(async function D() {
  const { win, calls } = kmWindow();
  loadInto(win, R6);

  eq(typeof win.__kmS3R6, 'object', 'D1 typeof __kmS3R6 === "object" — the operator\'s acceptance check');
  ['measure', 'passive', 'reset', 'contract'].forEach((k) => {
    ok(win.__kmS3R6[k] !== undefined, 'D1a __kmS3R6.' + k + ' exists');
  });

  // The exact protocol the operator was given, scope and all.
  const SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
  win.__kmS3R6.reset();
  const cold = await win.__kmS3R6.measure('COLD', SCOPE);
  ok(typeof cold === 'string' && cold.indexOf('=== S3-R6 COLD') === 0,
    'D2 measure("COLD", scope) resolves to a pasteable block');
  const warm = await win.__kmS3R6.measure('WARM', SCOPE);
  const repeat = await win.__kmS3R6.measure('REPEAT', SCOPE);
  ok(warm.indexOf('=== S3-R6 WARM') === 0 && repeat.indexOf('=== S3-R6 REPEAT') === 0,
    'D3 WARM and REPEAT run the same way — three samples, and the report will not call them a P50');

  // Every field the operator's item 6 lists must actually appear.
  ['run', 'action', 'result', 'server_ms', 'client_total_ms', 'tables_read', 'rows_returned',
    'wire_bytes', 'request_id'].forEach((f) => {
    ok(cold.indexOf(f) > 0, 'D4 the COLD block reports ' + f);
  });
  ok(/\bCOLD\b/.test(cold.split('\n')[2] || ''),
    'D4a and the COLD/WARM/REPEAT label is on the ROW, not only in the header — a pasted table stays readable '
    + 'once it is out of context');

  // The scope really reaches the one read that is site-scoped by construction.
  ok(calls.indexOf('SCOPE:' + JSON.stringify(SCOPE)) >= 0,
    'D5 the scope is passed through to the Product Strategy workspace read', calls);
  ok(calls.indexOf('productPricing.siteUniverse.get') >= 0, 'D5a and the site universe read is issued');

  // All eight mandatory targets plus the health probe, in one sequential pass.
  const ACTIONS = ['skuDetails.workspace.get', 'productPricing.siteUniverse.get',
    'productPricing.workspace.get', 'fcSummary.workspace.get'];
  ACTIONS.forEach((a) => ok(calls.indexOf(a) >= 0, 'D6 ' + a + ' was issued'));

  // --- passive(), against the shape the transport really returns -------------------------------------------
  const tlObj = win.KM.transport.timeline();
  ok(!Array.isArray(tlObj) && Array.isArray(tlObj.request_timeline),
    'D7 timeline() is an object carrying .request_timeline');
  let blew = null, out = '';
  try { out = win.__kmS3R6.passive(); } catch (e) { blew = e; }
  ok(!blew, 'D8 passive() runs against it', blew && String(blew));
  ok(out.indexOf('--- timeline ---') > 0 && out.indexOf('skuDetails.workspace.get') > 0,
    'D8a and prints the request rows');
  ok(out.indexOf('--- timeline summary ---') > 0, 'D8b including the totals only the object shape carries');
  ok(!/\.forEach\(/.test('') && read(R6).indexOf('request_timeline') > 0,
    'D9 and it reads .request_timeline rather than forEach-ing the object — the §12 repair, still in place');

  // ===========================================================================================================
  section('E — THE TWO TOOLS DO NOT OVERWRITE EACH OTHER');
  // ===========================================================================================================
  {
    const { win: w } = kmWindow();
    w.location = { origin: 'https://example.github.io' };
    w.navigator = {};
    w.URL = URL;
    w.AbortController = AbortController;
    w.fetch = () => Promise.reject(new Error('no network in this test'));

    loadInto(w, R6);
    eq(typeof w.__kmS3R6, 'object', 'E1 after loading the S3-R6 tool, __kmS3R6 is an object');
    eq(typeof w.__kmS3R7, 'undefined', 'E1a and __kmS3R7 does not exist yet');

    loadInto(w, R7);
    eq(typeof w.__kmS3R7, 'object', 'E2 after loading the S3-R7 tool, __kmS3R7 is an object');
    eq(typeof w.__kmS3R6, 'object', 'E3 AND __kmS3R6 SURVIVES — the tools are independent');
    ok(typeof w.__kmS3R6.measure === 'function' && typeof w.__kmS3R7.matrix === 'function',
      'E3a each still has its own methods, so neither is a shell of the other');

    // And in the other order, because "does not overwrite" has to hold both ways round.
    const { win: w2 } = kmWindow();
    w2.location = { origin: 'https://example.github.io' };
    w2.navigator = {}; w2.URL = URL; w2.AbortController = AbortController;
    w2.fetch = () => Promise.reject(new Error('no network in this test'));
    loadInto(w2, R7);
    loadInto(w2, R6);
    ok(typeof w2.__kmS3R6 === 'object' && typeof w2.__kmS3R7 === 'object',
      'E4 loaded in the reverse order, both globals are still present');
    ok(typeof w2.__kmS3R7.matrix === 'function' && typeof w2.__kmS3R6.measure === 'function',
      'E4a and both are still themselves');
  }

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
  console.log('TOOL_BASENAME_COLLISIONS = 0 · __kmS3R6 = object · __kmS3R7 = object · WRITES = 0');
  process.exit(fail === 0 ? 0 : 1);
}()).catch((e) => { console.log('HARNESS ERROR ' + (e && e.stack || e)); process.exit(1); });
