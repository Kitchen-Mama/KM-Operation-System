/**
 * S8-B3-R3-CP2O-R2 — THE MAP CAPTURE, RUN ON A RASTERISER THAT CAN HOLD A CONTEXT.
 *
 * WHAT CP2O-R1 GOT WRONG, AND IT IS THE REASON THIS FILE EXISTS. That round proved the canvas disappears
 * because the WebGL context is LOST, which was correct, and then attributed the loss to the host machine
 * degrading. The host was never the only variable. `_cp2m-r2-map-runner.js` launches Chrome with
 * `--use-gl=swiftshader`, so every cell of that 2x2 matrix measured the SOFTWARE rasteriser and nothing
 * else. Whether this machine had a usable GPU was never asked. It does:
 *
 *   `_cp2o-r2-gl-probe.js`, one pass per configuration, 9s hold, real frames:
 *     --use-gl=swiftshader  ->  CONTEXT LOST at 1294 ms   (SwiftShader Device (Subzero), 1 frame)
 *     no GL override        ->  HELD 9804 ms              (Intel Iris Xe, D3D11, 538 frames)
 *     --use-angle=d3d11     ->  HELD 10804 ms             (Intel Iris Xe, 537 frames)
 *     --use-angle=gl        ->  HELD 11025 ms             (Intel Iris Xe, OpenGL 4.5, 304 frames)
 *
 * The forced software rasteriser was the blocker. It is a LAUNCH PARAMETER, which is the one thing this
 * round is permitted to change -- not the engine, not a texture, not a timeout, not an acceptance
 * threshold, not a hash.
 *
 * WHY THIS IS A SEPARATE FILE AND NOT A ONE-LINE EDIT TO THE RUNNER. The runner's own SHA is pinned inside
 * three evidence files: `cp2m-r2-map/map.json`, `cp2m-r4r1-map/after.json` and `cp2m-r4r2-mount/after.json`.
 * The latter two are hashed against disk by their suites, so editing the runner would fail them until their
 * captures were re-taken -- and `map-canvas-lifecycle-...-r4-r1` additionally asserts that the "after" run
 * spent the SAME number of samples loading as a "before" run that CANNOT be re-taken, because it was taken
 * against source that no longer exists. Re-running that capture to fix a hash would stake a currently clean
 * suite on a sample count matching across a different rasteriser. Removing one blocker is not worth risking
 * two, so the pinned file is left byte-identical and the launch parameters move here.
 *
 * EVERYTHING ELSE IS THE EXISTING FLOW, BY REFERENCE, NOT BY COPY: the same `SCENES` (desktop 1280x800 and
 * mobile 390x844), the same `wrapperFor` page frame, the same `buildPage` with its DEFAULT measuring script,
 * the same `startServer` and the same fixture. Only `main()`'s orchestration is restated, because it is not
 * exported. If the builder or the fixture is ever changed, both entry points change together.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');

const R2 = require('./_cp2m-r2-map-runner.js');
const PNG = require('./_cp2m-r2-png.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

const RUNS = ['a', 'b', 'c'];      // a and b are identical (the noise floor); c drags.
const MAX_HOLD_MS = 40000;

/* THE ONLY DIFFERENCE FROM THE RUNNER'S OWN ARGUMENT LIST.
   `--use-gl=swiftshader` is NOT passed, so Chrome selects the real adapter. `--enable-unsafe-swiftshader`
   is kept so a machine with no usable GPU still falls back to software instead of failing to start -- the
   capture would then report a lost context, which is a true report, rather than no report at all. */
const GL_FLAGS = ['--enable-unsafe-swiftshader'];

/**
 * Record WHAT THOSE FLAGS RESOLVE TO on this machine, in a separate process.
 *
 * The capture itself must stay ONE launch per run -- the screenshot and the numbers have to describe the
 * same frame -- so the renderer is read by its own short launch against a trivial page. That the evidence
 * never recorded this is precisely how a software rasteriser went unnoticed for four rounds.
 */
function probeRenderer(browser, port) {
  return new Promise((resolve) => {
    const profile = path.join(os.tmpdir(), 'km-cp2o-r2-gl-' + process.pid);
    const args = ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
      '--force-device-scale-factor=1',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--user-data-dir=' + profile, '--window-size=320,240']
      .concat(GL_FLAGS)
      .concat(['http://127.0.0.1:' + port + '/__glpage']);
    R2.runChromeAsync(browser, args, 25000).then(() => resolve(null));
  });
}

const GL_PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<canvas id="c" width="64" height="64"></canvas>
<script>
(function(){
  var out = { created:false, renderer:null, vendor:null, glVersion:null, contextLost:false, lostAtMs:null, frames:0 };
  var t0 = Date.now(), cv = document.getElementById('c'), gl = null;
  try { gl = cv.getContext('webgl') || cv.getContext('experimental-webgl'); } catch(e) {}
  if (gl) {
    out.created = true;
    try { out.glVersion = gl.getParameter(gl.VERSION); } catch(e){}
    try { var d = gl.getExtension('WEBGL_debug_renderer_info');
          if (d) { out.renderer = gl.getParameter(d.UNMASKED_RENDERER_WEBGL);
                   out.vendor = gl.getParameter(d.UNMASKED_VENDOR_WEBGL); } } catch(e){}
    cv.addEventListener('webglcontextlost', function(ev){
      out.contextLost = true; out.lostAtMs = Date.now() - t0; try { ev.preventDefault(); } catch(e){}
    }, false);
    (function tick(){ if (out.contextLost) return;
      try { gl.clearColor(0.1,0.2,0.3,1); gl.clear(gl.COLOR_BUFFER_BIT); out.frames++; } catch(e){}
      requestAnimationFrame(tick); }());
  }
  /* Hold past the window that lost the context under SwiftShader (1294 ms measured), so "held" means
     held for longer than the failure, not merely sampled before it. */
  var hold = new Image(); hold.src = '/__hold?id=__gl'; document.body.appendChild(hold);
  setTimeout(function(){
    out.heldForMs = Date.now() - t0;
    var x = new XMLHttpRequest(); x.open('POST','/__measure?id=__gl',true); x.send(JSON.stringify(out));
  }, 6000);
}());
</script></body></html>`;

async function main() {
  const outDir = process.argv[2] || path.join(os.tmpdir(), 'km-cp2o-r2-map');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = R2.findBrowser();
  if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); return; }

  const port = 39500 + (process.pid % 200);
  const pages = { '/__glpage': GL_PAGE };
  R2.SCENES.forEach(sc => RUNS.forEach(run => {
    pages['/__page-' + sc.id + '-' + run] = R2.buildPage(port, run === 'c', sc.id + '-' + run);
    pages['/__frame-' + sc.id + '-' + run] = R2.wrapperFor('/__page-' + sc.id + '-' + run, sc.w, sc.h);
  }));

  const held = Object.create(null);
  const reported = Object.create(null);
  const srv = R2.startServer(pages, held, reported);
  srv.listen(port, '127.0.0.1', async () => {
    await probeRenderer(browser, port);
    const glEnv = reported['__gl'] || null;
    process.stderr.write('gl=' + (glEnv && glEnv.renderer ? String(glEnv.renderer).slice(0, 44) : 'UNKNOWN')
      + (glEnv && glEnv.contextLost ? ' LOST@' + glEnv.lostAtMs : ' held') + ' | ');

    const shots = {};
    for (const sc of R2.SCENES) for (const run of RUNS) {
      const key = sc.id + '-' + run;
      const png = path.join(outDir, 'map-' + key + '.png');
      const profile = path.join(os.tmpdir(), 'km-cp2o-r2-map-' + process.pid + '-' + key);
      const base = ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
        '--force-device-scale-factor=1',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--user-data-dir=' + profile,
        '--window-size=' + Math.max(sc.w, 560) + ',' + Math.max(sc.h, 240)]
        .concat(GL_FLAGS);
      const url = 'http://127.0.0.1:' + port + '/__frame-' + key;
      await R2.runChromeAsync(browser, base.concat(['--screenshot=' + png, url]), MAX_HOLD_MS + 25000);
      shots[key] = { png: fs.existsSync(png) ? png : null,
                     bytes: fs.existsSync(png) ? fs.statSync(png).size : 0,
                     measurements: reported[key] || null };
      process.stderr.write(key + ' ');
    }
    srv.close();
    process.stderr.write('\n');

    /* The analysis below is the runner's, restated because `main()` is not exported. It calls the SAME
       exported PNG reader with the SAME regions and the SAME thresholds-free descriptions -- it describes
       the pixels, it does not judge them. The judging is the suite's job and the suite did not change. */
    const scenes = R2.SCENES.map(sc => {
      const a = shots[sc.id + '-a'], b = shots[sc.id + '-b'], c = shots[sc.id + '-c'];
      const box = (a.measurements && a.measurements.canvasCssBox) || null;
      const out = { scene: sc.id, viewport: { w: sc.w, h: sc.h },
        canvas: a.measurements || null, canvasB: b.measurements || null,
        dragReport: c.measurements || null,
        pngBytes: { a: a.bytes, b: b.bytes, c: c.bytes } };
      if (!a.png || !b.png || !c.png) { out.error = 'MISSING_SCREENSHOT'; return out; }
      if (!box || box.w < 2 || box.h < 2) { out.error = 'NO_CANVAS_BOX'; return out; }
      try {
        const ia = PNG.decodePng(a.png), ib = PNG.decodePng(b.png), ic = PNG.decodePng(c.png);
        out.image = { w: ia.width, h: ia.height };
        out.content = PNG.describeRegion(ia, box.x, box.y, box.w, box.h, { step: 2 });
        out.noiseFloor = PNG.diffRegion(ia, ib, box.x, box.y, box.w, box.h, { step: 2 });
        out.dragEffect = PNG.diffRegion(ia, ic, box.x, box.y, box.w, box.h, { step: 2 });
        const cb = out.content.contentBox;
        out.framing = cb ? {
          fillWidthRatio: +(cb.w / box.w).toFixed(3),
          fillHeightRatio: +(cb.h / box.h).toFixed(3),
          centroidOffset: out.content.centroidOffset,
          touchesLeftEdge: cb.x <= box.x + 1, touchesRightEdge: cb.x + cb.w >= box.x + box.w - 1,
          touchesTopEdge: cb.y <= box.y + 1, touchesBottomEdge: cb.y + cb.h >= box.y + box.h - 1
        } : null;
      } catch (e) { out.decodeError = String(e.message); }
      return out;
    });

    const result = {
      ok: true, browser: path.basename(browser),
      capturedAt: new Date().toISOString().slice(0, 10),
      design: 'A and B are identical runs (the noise floor); C performs a real pointer drag (the effect).',
      /* NEW, AND THE POINT OF THE ROUND: the evidence now states which rasteriser produced it. */
      glEnvironment: { flags: GL_FLAGS, entry: 'assets/tests/_cp2o-r2-map-capture.js', probe: glEnv,
        note: 'The forced --use-gl=swiftshader of the original entry point is NOT passed here; see the '
            + 'file header and docs/evidence/cp2o-r2-gl/gl-probe.json.' },
      sources: {
        'index.html': sha('index.html'),
        'assets/js/lib/km-globe.js': sha('assets/js/lib/km-globe.js'),
        'assets/js/pages/global-logistics-map.js': sha('assets/js/pages/global-logistics-map.js'),
        'assets/js/app.js': sha('assets/js/app.js'),
        'assets/tests/_cp2m-r2-map-runner.js': sha('assets/tests/_cp2m-r2-map-runner.js'),
        'assets/tests/_cp2o-r2-map-capture.js': sha('assets/tests/_cp2o-r2-map-capture.js'),
        'assets/tests/_cp2m-r2-png.js': sha('assets/tests/_cp2m-r2-png.js')
      },
      shotsDir: outDir, scenes: scenes
    };
    fs.writeFileSync(path.join(outDir, 'map.json'), JSON.stringify(result, null, 1), 'utf8');
    console.log(JSON.stringify({ ok: true, outDir: outDir, scenes: scenes.map(s => s.scene),
      renderer: glEnv && glEnv.renderer, contextLost: glEnv && glEnv.contextLost }));
  });
}

if (require.main === module) main();
module.exports = { GL_FLAGS, RUNS };
