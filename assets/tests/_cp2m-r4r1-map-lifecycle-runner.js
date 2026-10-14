// =============================================================================================================
// S8-B3-R3-CP2M-R4-R1 — WHY THE MAP CANVAS DISAPPEARS
// -------------------------------------------------------------------------------------------------------------
// CP2M-R4's map capture failed once in three runs with `canvasAppeared: true` followed by `canvasCount: 0`
// for more than four seconds. "The canvas is gone" is a symptom with at least four different causes, and the
// pixel runner cannot tell them apart:
//
//     the HOST was removed from the document but kept alive   (detachGlobe does this ON PURPOSE)
//     the globe INSTANCE was destroyed and rebuilt
//     the WebGL CONTEXT was lost
//     a late response rendered over a page the operator had left
//
// `detachGlobe` keeps the host node AND `state.globe`, so a disappearance is NOT evidence that the engine
// was rebuilt — and raising the wait limit until a run happens to succeed would prove nothing at all. This
// runner samples `KM.glmDiag()` on a timeline instead, so each sample says which of the four is true.
//
// THE SERVER IS DELIBERATELY SLOW, and that is the opposite of widening a wait. The workspace read here is
// answered after a delay because in production it is an Apps Script round trip measured in seconds; the
// loopback default of ~0ms makes the window the defect lives in too narrow to sample. Slowing the SERVER
// makes an existing window observable. It does not create the window.
//
//   node assets/tests/_cp2m-r4r1-map-lifecycle-runner.js <outDir> [readDelayMs]
'use strict';

const fs = require('fs');
const path = require('path');
const MAP = require('./_cp2m-r2-map-runner.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(ROOT, 'docs', 'evidence', 'cp2m-r4r1-map');
const READ_DELAY = Number(process.argv[3] || 1500);

// The timeline. Each tick records the whole diagnostic object, so an attribution can be made after the fact
// rather than decided in advance by what the probe thought to ask.
const PROBE = `
(function(){
  var T = [], FATAL = null;
  // A DEAD PAGE MUST SAY SO. The first version of this probe had a broken selector literal, the script
  // threw on load, nothing was ever POSTed, and the runner reported "no result" with no way to tell a
  // crashed probe from a page that simply never rendered.
  window.onerror = function(m, src, line, col){ if (!FATAL) FATAL = String(m) + ' @' + line + ':' + col; };
  function snap(tag){
    var d;
    try { d = (window.KM && window.KM.glmDiag) ? window.KM.glmDiag() : { noDiag: true }; }
    catch (e) { d = { diagError: String(e && e.message) }; }
    d.tag = tag;
    d.t = Math.round((window.performance && performance.now) ? performance.now() : Date.now());
    T.push(d);
    return d;
  }
  // Built with JSON.stringify rather than hand-escaped quotes, because the attribute value itself
  // contains single quotes and nesting them inside two layers of template literal is how the first
  // version of this file died.
  function nav(section){
    var q = String.fromCharCode(39);
    var sel = '[onclick*=' + JSON.stringify('showSection(' + q + section + q + ')') + ']';
    var el = null;
    try { el = document.querySelector(sel); } catch (e) {}
    if (el) { el.click(); return 'click'; }
    if (window.showSection) { window.showSection(section); return 'direct'; }
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
    var out = { ok: !FATAL, fatal: FATAL, timeline: T };
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/__measure?id=' + encodeURIComponent(window.__CAP_ID), true);
      xhr.send(JSON.stringify(out));
    } catch (e) {}
  }
  function go(){
    try {
      snap('boot');
      var how = nav('global-logistics-map');
      T[T.length - 1].navHow = how;
      // PHASE 1 — the first load, sampled while the (deliberately slow) read is outstanding.
      sampleFor('first-load', 5000, 120, function(){
        snap('first-settled');
        // PHASE 2 — A FORCED REFRESH. This is the teardown that is actually reachable with the host
        // already on screen: boot(true) makes ensureDb bypass its cache, so the read is asynchronous and
        // state.loading stays true for the whole round trip. A re-entry does NOT do this, because the
        // cached read model makes ensureDb call back synchronously and the detach never survives a frame.
        var rb = document.querySelector('[data-act="refresh"]');
        snap('pre-refresh');
        if (rb) rb.click(); else if (window.KM && window.KM.glmBoot) window.KM.glmBoot(true);
        T[T.length - 1].refreshFound = !!rb;
        sampleFor('refresh', 5000, 120, function(){
          snap('refresh-settled');
          phase3();
        });
      });
    } catch (e) { FATAL = 'go(): ' + String(e && e.message); finish(); }
  }
  function phase3(){
    try {
        // PHASE 3 — leave for another page and come straight back. mount() calls boot() every time.
        nav('site-priority');
        setTimeout(function(){
          snap('away');
          nav('global-logistics-map');
          sampleFor('return', 5000, 120, function(){
            snap('return-settled');
            finish();
          });
        }, 900);
    } catch (e) { FATAL = 'phase3(): ' + String(e && e.message); finish(); }
  }
  var hold = document.createElement('img');
  hold.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';
  hold.src = '/__hold?id=' + encodeURIComponent(window.__CAP_ID);
  document.body.appendChild(hold);
  setTimeout(go, 700);
  // A LAST-RESORT REPORT. If anything above wedges, the hold image would keep the page open until the
  // runner's own timeout and the result would be silence; this guarantees a transcript either way.
  setTimeout(function(){ if (T.length) finish(); }, 20000);
}());
`;

function main() {
  const browser = MAP.findBrowser();
  if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); return; }
  fs.mkdirSync(OUT, { recursive: true });

  const pages = {}, held = {}, results = {};
  // The map runner's OWN server, with its read answered late. Wrapping it to replay a consumed request
  // body was the first attempt and was fragile for no benefit; the delay belongs in the handler that
  // sends the answer.
  const srv = MAP.startServer(pages, held, results, { readDelayMs: READ_DELAY });

  srv.listen(0, '127.0.0.1', async () => {
    const port = srv.address().port;
    const capId = 'lifecycle';
    pages['/lifecycle.html'] = MAP.buildPage(port, false, capId, PROBE);
    pages['/wrap.html'] = MAP.wrapperFor('/lifecycle.html', 1280, 900);

    const udd = path.join(OUT, '.chrome-profile');
    const args = ['--headless=new', '--disable-gpu-sandbox', '--no-sandbox', '--no-first-run',
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--user-data-dir=' + udd, '--window-size=1280,900',
      '--screenshot=' + path.join(OUT, 'lifecycle.png'),
      'http://127.0.0.1:' + port + '/wrap.html'];

    await MAP.runChromeAsync(browser, args, 90000);
    srv.close();

    const r = results[capId] || { ok: false, reason: 'NO_RESULT' };
    const sha = (rel) => require('crypto').createHash('sha256')
      .update(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
    r.capturedAt = new Date().toISOString().slice(0, 10);
    r.readDelayMs = READ_DELAY;
    r.sources = {};
    ['assets/js/pages/global-logistics-map.js', 'assets/js/lib/km-globe.js', 'index.html',
     'assets/tests/_cp2m-r4r1-map-lifecycle-runner.js', 'assets/tests/_cp2m-r2-map-runner.js']
      .forEach(rel => { r.sources[rel] = sha(rel); });

    // The attribution, computed here so the suite asserts a conclusion rather than re-deriving one.
    const tl = r.timeline || [];
    const gone = tl.filter(s => s.hostExists && !s.canvasPresent || (s.hostExists && !s.hostInDocument));
    r.summary = {
      samples: tl.length,
      samplesWithoutCanvas: tl.filter(s => !s.canvasPresent).length,
      samplesHostDetached: tl.filter(s => s.hostExists && !s.hostInDocument).length,
      maxGlobeInstanceId: Math.max.apply(null, [0].concat(tl.map(s => s.globeInstanceId || 0))),
      globeCreates: tl.length ? tl[tl.length - 1].globeCreates : null,
      globeDestroys: tl.length ? tl[tl.length - 1].globeDestroys : null,
      contextLost: tl.length ? tl[tl.length - 1].contextLost : null,
      detaches: tl.length ? tl[tl.length - 1].detaches : null,
      attaches: tl.length ? tl[tl.length - 1].attaches : null,
      teardownsAvoided: tl.length ? tl[tl.length - 1].teardownsAvoided : null,
      staleRendersBlocked: tl.length ? tl[tl.length - 1].staleRendersBlocked : null,
      everLostCanvasWhileHostAlive: gone.length > 0
    };
    fs.writeFileSync(path.join(OUT, 'lifecycle.json'), JSON.stringify(r, null, 1));
    console.log(JSON.stringify({ ok: !!r.ok, outDir: OUT, samples: r.summary.samples,
      withoutCanvas: r.summary.samplesWithoutCanvas, detached: r.summary.samplesHostDetached,
      creates: r.summary.globeCreates, destroys: r.summary.globeDestroys }));
  });
}

main();
