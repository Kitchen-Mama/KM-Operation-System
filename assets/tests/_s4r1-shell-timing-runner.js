/**
 * ==================================================================================================
 * S4-R1 — REAL CLIENT TIME, MEASURED FROM OUTSIDE THE PAGE
 * ==================================================================================================
 *
 * WHY THIS FILE EXISTS AT ALL. §4 asks for milliseconds from actual browser execution, and the page
 * cannot supply them. Under `--virtual-time-budget` Chrome FREEZES the clock while a task runs and
 * jumps it to the next due timer when the queue drains — so `performance.now()` and `Date.now()` both
 * measure scheduling, not work. That is measured rather than assumed: a page running
 * `while (Date.now() - t < 300) {}` under virtual time NEVER TERMINATES, because the clock it is
 * waiting on does not advance while the loop is the running task. Every `ms` in S3's evidence is
 * named `pollMs` for exactly this reason.
 *
 * SO THE CLOCK IS MOVED OUTSIDE. Node times the Chrome PROCESS, end to end, for a page whose driver
 * stops at a named point. The difference between two stop points is the real cost of the work between
 * them. Process startup, HTML parse and the boot scripts are common to every run and cancel in the
 * subtraction.
 *
 * WHAT THIS NUMBER HONESTLY CONTAINS, stated so the report cannot overclaim:
 *
 *   IT INCLUDES  script execution, partial fetch over file://, DOM construction, style and layout,
 *                and every timer tick the app schedules up to the stop point.
 *   IT EXCLUDES  server latency, because SERVER_MS is 0 by default. Network cost is a property of
 *                the ROUND COUNT, which the census runner measures, and of the operator's production
 *                timings, which are the only real ones anybody has.
 *   IT CANNOT SEPARATE  shell from partial from JS from render. Those are one process from out here,
 *                and §4's answer for them is NOT_OBSERVABLE rather than a number with a story on it.
 *   IT CARRIES A TAIL.  After the driver's stop point Chrome keeps running until the virtual budget
 *                expires. When the page is idle that costs nothing real — virtual time races to the
 *                end. When a route has left an INTERVAL running, every tick is real work, so a long
 *                tail is itself a finding, and the census runner names which route did it.
 *
 * NOISE. Each stop point is run `repeats` times and the MEDIAN is reported beside the full spread.
 * A median with its spread hidden is a number pretending to be a measurement.
 *
 * USAGE:  node assets/tests/_s4r1-shell-timing-runner.js [repeats] [serverMs]
 * ==================================================================================================
 */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const R11 = require('./_s3r11-interaction-runner.js');
const CENSUS = require('./_s4r1-route-census-runner.js');

const ROOT = path.join(__dirname, '..', '..');
const VT_BUDGET = 120000;

/* The stop points. `baseline` is the control: it stops the instant the boot scripts have run, so
   everything common to all runs — process spawn, parse, the whole <script> block — is in it and
   subtracts away. */
const STOPS = [
  { id: 'baseline', kind: 'immediate' },
  { id: 'shell',    kind: 'shell' },
  { id: 'menu',     kind: 'menu' },
  { id: 'light',      kind: 'route', key: CENSUS.REPRESENTATIVE.light },
  { id: 'medium',     kind: 'route', key: CENSUS.REPRESENTATIVE.medium },
  { id: 'heavy',      kind: 'route', key: CENSUS.REPRESENTATIVE.heavy },
  { id: 'roundsHeavy', kind: 'route', key: CENSUS.REPRESENTATIVE.roundsHeavy },
  /* THE LOOP STOPS EXIST BECAUSE THE SINGLE-ENTRY ONES COULD NOT BE BELIEVED.
     Measured first, then fixed: over three repeats the baseline alone varied by 1 378 ms, and every
     single-entry route came out FASTER than doing nothing — which is not a small error, it is a
     signal buried under Chrome's process-startup variance. One startup's noise is a constant; the
     work is not. So the work is multiplied and the noise is not: each loop enters its route CYCLES
     times, alternating with a second route so every entry re-renders rather than short-circuiting on
     an already-current page. Per-entry cost is the delta over baseline divided by CYCLES. */
  { id: 'loopLight',  kind: 'routeLoop', key: CENSUS.REPRESENTATIVE.light,  other: CENSUS.REPRESENTATIVE.medium, cycles: 20 },
  { id: 'loopMedium', kind: 'routeLoop', key: CENSUS.REPRESENTATIVE.medium, other: CENSUS.REPRESENTATIVE.light,  cycles: 20 },
  { id: 'loopHeavy',  kind: 'routeLoop', key: CENSUS.REPRESENTATIVE.heavy,  other: CENSUS.REPRESENTATIVE.light,  cycles: 20 }
];

function driver(stop) {
  const R = CENSUS.ROUTES.filter((r) => r.key === stop.key)[0] || null;
  const O = CENSUS.ROUTES.filter((r) => r.key === stop.other)[0] || null;
  return [
    '<pre id="__measurements"></pre>',
    '<script>',
    '(function () {',
    '  var OUT = { stop: ' + JSON.stringify(stop.id) + ', reached: false, note: null };',
    '  var R = ' + JSON.stringify(R) + ', O = ' + JSON.stringify(O) + ', CYCLES = ' + JSON.stringify(stop.cycles || 0) + ';',
    '  function publish() { try { document.getElementById("__measurements").textContent = JSON.stringify(OUT); } catch (e) {} }',
    '  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }',
    '  function qa(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }',
    '  async function until(fn, cap) {',
    '    var t0 = performance.now();',
    '    while (performance.now() - t0 < (cap || 30000)) { try { if (fn()) return true; } catch (e) {} await tick(8); }',
    '    return false;',
    '  }',
    '  function usefulCount() {',
    '    var sec = document.getElementById(R.section); if (!sec) return 0;',
    '    if (R.shellIsUseful) return sec.textContent.replace(/\\s+/g, " ").trim().length > 40 ? 1 : 0;',
    '    return qa(R.useful, sec).length;',
    '  }',
    '  (async function () {',
    '    var kind = ' + JSON.stringify(stop.kind) + ';',
    '    if (kind === "immediate") { OUT.reached = true; publish(); return; }',
    '    if (kind === "shell") {',
    '      OUT.reached = await until(function () { return !!document.querySelector(".main-content"); }, 20000);',
    '      publish(); return;',
    '    }',
    '    if (kind === "menu") {',
    '      // MENU USABLE = the items exist AND their handler exists. An item that is drawn but whose',
    '      // click would throw is not usable, and this is the difference between the two.',
    '      OUT.reached = await until(function () {',
    '        return qa(".menu-item").length > 0 && typeof window.showSection === "function";',
    '      }, 20000);',
    '      publish(); return;',
    '    }',
    '    if (kind === "routeLoop") {',
    '      await until(function () { return typeof window.showSection === "function"; }, 20000);',
    '      var done = 0;',
    '      for (var c = 0; c < CYCLES; c++) {',
    '        window.showSection(O.key);',
    '        await until(function () { return usefulOf(O) > 0; }, 30000);',
    '        window.showSection(R.key);',
    '        if (await until(function () { return usefulOf(R) > 0; }, 30000)) done++;',
    '      }',
    '      OUT.reached = done === CYCLES; OUT.cycles = done; publish(); return;',
    '    }',
    '    // kind === "route"',
    '    await until(function () { return typeof window.showSection === "function"; }, 20000);',
    '    try { window.showSection(R.key); } catch (e) { OUT.note = String(e && e.message).slice(0, 120); }',
    '    OUT.reached = await until(function () { return usefulCount() > 0; }, 60000);',
    '    publish();',
    '  }());',
    '}());',
    '</script>'
  ].join('\n');
}

function once(stop, serverMs) {
  const chrome = R11.findChrome();
  if (!chrome) return { chromeMissing: true };
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + R11.probeScript(serverMs));
  html = html.replace(/<\/body>/i, driver(stop));
  const file = path.join(ROOT, '__s4r1-timing-' + stop.id + '.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const t0 = Date.now();
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', '--allow-file-access-from-files',
      '--virtual-time-budget=' + VT_BUDGET, '--dump-dom', url],
      { encoding: 'utf8', timeout: 600000, maxBuffer: 256 * 1024 * 1024 });
    const wallMs = Date.now() - t0;
    const m = /<pre id="__measurements">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
    let payload = null;
    if (m) { try { payload = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); } catch (e) {} }
    return { wallMs: wallMs, reached: !!(payload && payload.reached), note: payload && payload.note,
      cycles: payload && payload.cycles };
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
}

function median(a) {
  const s = a.slice().sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
}

function run(repeats, serverMs) {
  repeats = repeats || 3;
  const out = { vtBudgetMs: VT_BUDGET, serverMs: serverMs || 0, repeats: repeats, stops: {} };
  STOPS.forEach((stop) => {
    const runs = [];
    let reached = true, note = null;
    for (let i = 0; i < repeats; i++) {
      const r = once(stop, serverMs || 0);
      if (r.chromeMissing) { out.chromeMissing = true; return; }
      runs.push(r.wallMs);
      if (!r.reached) reached = false;
      if (r.note) note = r.note;
    }
    out.stops[stop.id] = { key: stop.key || null, cycles: stop.cycles || null, runs: runs,
      medianWallMs: median(runs),
      spreadMs: Math.max.apply(null, runs) - Math.min.apply(null, runs), reached: reached, note: note };
  });
  // The subtraction, done here so the report cannot quietly do it differently.
  const base = out.stops.baseline ? out.stops.baseline.medianWallMs : null;
  if (base != null) {
    out.deltasOverBaselineMs = {};
    out.perEntryMs = {};
    Object.keys(out.stops).forEach((k) => {
      if (k === 'baseline') return;
      const delta = out.stops[k].medianWallMs - base;
      out.deltasOverBaselineMs[k] = delta;
      const cyc = out.stops[k].cycles;
      /* A per-entry figure is published ONLY for a loop that COMPLETED EVERY CYCLE. For a single
         entry the delta is smaller than the baseline's own spread, and dividing noise by one does not
         make it a measurement; for a loop that gave up part way, the divisor is a number of cycles
         that did not happen. Both are refused by name rather than printed with a caveat. */
      if (!cyc) { out.perEntryMs[k] = 'NOT_OBSERVABLE: single entry is below the noise floor'; return; }
      if (!out.stops[k].reached) { out.perEntryMs[k] = 'NOT_OBSERVABLE: the loop did not complete its cycles'; return; }
      out.perEntryMs[k] = Math.round(delta / cyc);
    });
    out.noiseFloorMs = out.stops.baseline.spreadMs;
  }
  out.what_this_excludes = 'Server latency (serverMs=0). Shell / partial / JS / render cannot be '
    + 'separated from outside the process and are reported as NOT_OBSERVABLE.';
  /* THE VERDICT THE INSTRUMENT IS ENTITLED TO. Every delta below is compared against the baseline's
     OWN spread, because a difference smaller than the control's variance is not a measurement of
     anything. What survives that test is stated; what does not is refused. */
  out.resolvedAboveNoise = Object.keys(out.deltasOverBaselineMs || {}).filter(function (k) {
    return out.deltasOverBaselineMs[k] > out.noiseFloorMs;
  });
  out.verdict = out.resolvedAboveNoise.length
    ? 'Some stop points exceed the noise floor; see resolvedAboveNoise.'
    : 'NO stop point exceeds the baseline spread. Per-route CLIENT cost is below this instrument’s '
      + 'resolution (~' + out.noiseFloorMs + ' ms), which is itself the finding: every route, including the '
      + 'heaviest, completes inside the same band as doing nothing at all. The seconds an operator waits in '
      + 'production are therefore not client render or script time.';
  return out;
}

module.exports = { run, STOPS, VT_BUDGET };

if (require.main === module) {
  console.log(JSON.stringify(run(parseInt(process.argv[2] || '3', 10), parseInt(process.argv[3] || '0', 10)), null, 1));
}
