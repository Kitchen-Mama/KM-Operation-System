// =============================================================================================================
// S8-B3-R3-CP2M-R4-R2 — THE MAP'S MOUNT CONTINUATION, MEASURED
// -------------------------------------------------------------------------------------------------------------
// CP2M-R4-R1 gave the map page a navigation generation and taught boot()'s READ callback to drop a superseded
// answer. It did not touch the one continuation that starts the whole thing:
//
//     mount: function () { ensureMarkup().then(function (loaded) { ... boot(); ... }); }
//
// That .then asks nothing. If the markup arrives after the operator has gone somewhere else, it adds `.active`
// to a section nobody is on, calls boot() — which dispatches a workspace read and writes a spinner into the map
// body — and resizes the globe. boot()'s own myNav guard cannot help: it is captured when boot is CALLED, which
// is already after the navigation, so the read still goes out and only its answer is dropped.
//
// WHY THE MARKUP ARRIVES LATE, AND WHY SLOWING IT IS NOT A CONTRIVANCE. app.js sends a route's partial and its
// scripts out together. loadPartial fetches with { cache: 'no-store' }; the scripts are ordinary cacheable
// assets. On any return visit the scripts come from the browser cache and the 1.4 KB partial is a real network
// round trip — the markup is ROUTINELY the last thing to arrive. On loopback with an empty cache that ordering
// is inverted and the window closes before it can be sampled. The server delay restores the production
// ordering. It does not invent it, and no wait limit anywhere is raised.
//
// THREE SCENARIOS, each a separate browser run:
//     away-home     mount, then the logo Home, then the markup lands
//     away-lazy     mount, then another lazy route, then the markup lands
//     leave-return  mount, leave, come back — then the markup lands and BOTH continuations run
//
// The third is the one a MutationObserver can never launder. Both mounts join the same in-flight partial, so
// both .then callbacks fire in the same tick and both call boot(): two workspace reads for one navigation, with
// the map section legitimately active the whole time. Here `.active` is CORRECT; the duplication is the defect.
//
// WHAT IS COUNTED. The page's own diagnostic (boots, renders, staleMountsBlocked) AND the server's request log,
// because "no read was dispatched" is a claim about the network, and the only place to check it without
// trusting the page is the server that would have answered it.
//
//   node assets/tests/_cp2m-r4r2-map-mount-runner.js <outDir> [markupDelayMs]
// A helper, not a suite: the leading underscore keeps the sweep from executing it.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MAP = require('./_cp2m-r2-map-runner.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(ROOT, 'docs', 'evidence', 'cp2m-r4r2-mount');
const MARKUP_DELAY = Number(process.argv[3] || 3000);
const SCENARIOS = ['away-home', 'away-lazy', 'leave-return'];

const PROBE = `
(function(){
  var T = [], MARKS = [], FATAL = null;
  window.onerror = function(m, src, line, col){ if (!FATAL) FATAL = String(m) + ' @' + line + ':' + col; };
  function now(){ return Math.round((window.performance && performance.now) ? performance.now() : Date.now()); }
  function mark(name){ MARKS.push({ name: name, t: now() }); }
  function snap(tag){
    var d;
    try { d = (window.KM && window.KM.glmDiag) ? window.KM.glmDiag() : { noDiag: true }; }
    catch (e) { d = { diagError: String(e && e.message) }; }
    try {
      var lc = window.__kmLifecycleDebug ? window.__kmLifecycleDebug() : null;
      d.lcCurrent = lc ? lc.currentSection : null;
      d.lcActive = lc ? lc.activeVisibleSectionIds : null;
      d.lcEpoch = lc ? lc.navEpoch : null;
    } catch (e2) {}
    // THE TRANSPORT'S OWN COUNTERS. Two boots do NOT have to mean two network requests: the transport
    // shares an OPEN read between identical callers. Without this, "one request for two boots" is
    // ambiguous between "the duplicate was coalesced" and "the duplicate never happened", and the
    // difference decides what the page is actually guilty of.
    try {
      var tm = (window.KM && window.KM.transport && window.KM.transport.metrics) ? window.KM.transport.metrics() : null;
      d.txRequests = tm ? tm.requests : null;
      d.txCoalesced = tm ? tm.coalesced : null;
    } catch (e4) {}
    var ms = document.getElementById('global-logistics-map-section');
    d.mapSectionPresent = !!ms;
    d.mapSectionActive = !!(ms && ms.classList && ms.classList.contains('active'));
    d.mapBodyHtmlLen = 0;
    try { var bb = ms ? ms.querySelector('[data-glm="body"]') : null; d.mapBodyHtmlLen = bb ? bb.innerHTML.length : 0; } catch (e3) {}
    d.tag = tag;
    d.t = now();
    T.push(d);
    return d;
  }
  function nav(section){
    var q = String.fromCharCode(39);
    var sel = '[onclick*=' + JSON.stringify('showSection(' + q + section + q + ')') + ']';
    var el = null;
    try { el = document.querySelector(sel); } catch (e) {}
    if (el) { el.click(); return 'click'; }
    if (window.showSection) { window.showSection(section); return 'direct'; }
    return 'none';
  }
  function home(){
    var el = null;
    try { el = document.querySelector('[onclick*="showHome()"]'); } catch (e) {}
    if (el) { el.click(); return 'click'; }
    if (window.showHome) { window.showHome(); return 'direct'; }
    return 'none';
  }
  function sampleFor(tag, ms, step, done){
    var t0 = Date.now(), i = 0;
    (function tick(){
      snap(tag + '-' + (i++));
      if (Date.now() - t0 >= ms) return done();
      setTimeout(tick, step);
    }());
  }
  function finish(){
    var out = { ok: !FATAL, fatal: FATAL, scenario: window.__SCENARIO, timeline: T, marks: MARKS };
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/__measure?id=' + encodeURIComponent(window.__CAP_ID), true);
      xhr.send(JSON.stringify(out));
    } catch (e) {}
  }
  function go(){
    try {
      snap('boot');
      mark('nav-map');
      T[T.length - 1].navHow = nav('global-logistics-map');
      // The markup is still in flight for the whole of this window: the scripts are served from disk and
      // the partial is answered late, which is the production ordering described in the header.
      sampleFor('mount-wait', 900, 100, function(){
        var s = window.__SCENARIO;
        snap('pre-leave');
        mark('leave');
        T[T.length - 1].leaveHow = (s === 'away-home') ? home() : nav('site-priority');
        sampleFor('away', 650, 100, function(){
          if (s === 'leave-return') {
            snap('pre-return');
            mark('return');
            T[T.length - 1].returnHow = nav('global-logistics-map');
          }
          // Long enough for the delayed markup to land and for both continuations to run and settle.
          sampleFor('settle', 3400, 100, function(){
            snap('final');
            finish();
          });
        });
      });
    } catch (e) { FATAL = 'go(): ' + String(e && e.message); finish(); }
  }
  var hold = document.createElement('img');
  hold.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';
  hold.src = '/__hold?id=' + encodeURIComponent(window.__CAP_ID);
  document.body.appendChild(hold);
  setTimeout(go, 700);
  // A LAST-RESORT REPORT, so a wedge produces a transcript rather than silence.
  setTimeout(function(){ if (T.length) finish(); }, 25000);
}());
`;

function sha(rel) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

function runScenario(browser, scenario) {
  return new Promise((resolve) => {
    const pages = {}, held = {}, results = {}, requestLog = [];
    const srv = MAP.startServer(pages, held, results, {
      readDelayMs: 150,
      staticDelayMs: MARKUP_DELAY,
      staticDelayMatch: 'global-logistics-map.html',
      requestLog: requestLog
    });
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port;
      const capId = 'mount-' + scenario;
      const probe = 'window.__SCENARIO=' + JSON.stringify(scenario) + ';\n' + PROBE;
      pages['/mount.html'] = MAP.buildPage(port, false, capId, probe);
      pages['/wrap.html'] = MAP.wrapperFor('/mount.html', 1280, 900);

      const udd = path.join(OUT, '.chrome-profile-' + scenario);
      const args = ['--headless=new', '--disable-gpu-sandbox', '--no-sandbox', '--no-first-run',
        '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--user-data-dir=' + udd, '--window-size=1280,900',
        'http://127.0.0.1:' + port + '/wrap.html'];

      await MAP.runChromeAsync(browser, args, 90000);
      srv.close();

      const r = results[capId] || { ok: false, reason: 'NO_RESULT', scenario: scenario };
      r.scenario = scenario;
      r.requestLog = requestLog;
      const tl = r.timeline || [];
      const last = tl.length ? tl[tl.length - 1] : {};
      const markupSample = tl.filter(s => s.mapSectionPresent)[0] || null;
      const leaveMark = (r.marks || []).filter(m => m.name === 'leave')[0] || null;
      r.summary = {
        samples: tl.length,
        // THE WINDOW ITSELF. If the markup had already arrived before the operator left, the scenario did
        // not exercise anything and every number below it would be meaningless.
        markupArrivedAt: markupSample ? markupSample.t : null,
        leftAt: leaveMark ? leaveMark.t : null,
        markupArrivedAfterLeaving: !!(markupSample && leaveMark && markupSample.t > leaveMark.t),
        boots: last.boots == null ? null : last.boots,
        renders: last.renders == null ? null : last.renders,
        attaches: last.attaches == null ? null : last.attaches,
        globeCreates: last.globeCreates == null ? null : last.globeCreates,
        globeDestroys: last.globeDestroys == null ? null : last.globeDestroys,
        staleMountsBlocked: last.staleMountsBlocked == null ? null : last.staleMountsBlocked,
        staleRendersBlocked: last.staleRendersBlocked == null ? null : last.staleRendersBlocked,
        txRequests: last.txRequests == null ? null : last.txRequests,
        txCoalesced: last.txCoalesced == null ? null : last.txCoalesced,
        finalSection: last.lcCurrent || null,
        finalActiveIds: last.lcActive || null,
        workspaceReads: requestLog.filter(e => e.kind === 'api' && e.action === 'shipment.workspace.get').length,
        mapPartialRequests: requestLog.filter(e => e.kind === 'static' && e.path.indexOf('global-logistics-map.html') !== -1).length
      };
      resolve(r);
    });
  });
}

async function main() {
  const browser = MAP.findBrowser();
  if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); return; }
  fs.mkdirSync(OUT, { recursive: true });

  const out = {
    ok: true,
    capturedAt: new Date().toISOString().slice(0, 10),
    markupDelayMs: MARKUP_DELAY,
    scenarios: {},
    sources: {}
  };
  for (const s of SCENARIOS) {
    const r = await runScenario(browser, s);
    if (!r.ok) out.ok = false;
    out.scenarios[s] = r;
  }
  ['assets/js/pages/global-logistics-map.js', 'assets/js/core/lifecycle.js', 'assets/js/core/partial-loader.js',
   'assets/js/app.js', 'index.html',
   'assets/tests/_cp2m-r4r2-map-mount-runner.js', 'assets/tests/_cp2m-r2-map-runner.js']
    .forEach(rel => { out.sources[rel] = sha(rel); });

  const dest = path.join(OUT, process.env.CP2M_R4R2_LABEL || 'mount.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(JSON.stringify({
    ok: out.ok, outFile: dest,
    scenarios: SCENARIOS.map(s => ({
      s: s,
      boots: out.scenarios[s].summary.boots,
      reads: out.scenarios[s].summary.workspaceReads,
      blocked: out.scenarios[s].summary.staleMountsBlocked,
      windowReal: out.scenarios[s].summary.markupArrivedAfterLeaving
    }))
  }));
}

main();
