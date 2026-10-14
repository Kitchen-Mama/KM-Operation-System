/**
 * S8-B3-R3-CP2O-R2 — CAN THIS MACHINE HOLD A WEBGL CONTEXT? ASK BEFORE CAPTURING, NOT AFTER.
 *
 * WHY THIS EXISTS. CP2O-R1 established that the map capture fails because the WebGL context is LOST, and
 * then attributed the loss to the host machine having degraded during the session. That attribution was
 * reached from a 2x2 matrix in which EVERY cell launched Chrome with `--use-gl=swiftshader`, because the
 * capture runner hard-codes it. The matrix varied the branch and the viewport and held the rasteriser
 * fixed -- so it could not have discovered the rasteriser. "The host cannot hold a context" was really
 * "the SOFTWARE rasteriser cannot hold a context", and the difference decides whether a capture is
 * blocked or merely launched wrongly.
 *
 * WHAT IT MEASURES. One pass per launch configuration. A real canvas, a real `webgl` context, a real
 * animation-frame loop doing real clears, and a `webglcontextlost` listener. The page holds its own load
 * event open through a request the server answers late -- without that, `--screenshot` fires at load and
 * Chrome exits before any timer measured in seconds can run. (The first draft of this probe got exactly
 * that wrong and reported NO_REPORT for the configuration the shipped runner uses successfully; the
 * mistake is recorded here because a probe that cannot distinguish "lost" from "never asked" is worse
 * than no probe.)
 *
 * WHAT IT DOES NOT DO. It changes no runtime, no engine, no texture, no timeout and no acceptance
 * threshold; it touches no application source; it starts no browser the user is using and terminates
 * nothing. It reports what it finds, including failures.
 *
 *   node assets/tests/_cp2o-r2-gl-probe.js [outDir]
 */
const http = require('http');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const browser = CHROMES.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); process.exit(0); }

/* HOLD_MS is the question itself: a capture needs a context for about 4 s (600 ms settle + 1400 + 1600 +
   screenshot). CP2O-R1 measured loss at 1.3-1.9 s. 9 s is comfortably past both. */
const HOLD_MS = 9000;

const PAGE = (id) => `<!doctype html><html><head><meta charset="utf-8"><title>probe</title>
<style>html,body{margin:0;background:#061018}canvas{width:640px;height:400px;display:block}</style></head>
<body><canvas id="c" width="640" height="400"></canvas>
<script>
(function(){
  var out = { id: ${JSON.stringify(id)}, created:false, renderer:null, vendor:null,
              contextLost:false, lostAtMs:null, frames:0, lastFrameMs:0, error:null };
  var t0 = Date.now();
  var cv = document.getElementById('c');
  var gl = null;
  try { gl = cv.getContext('webgl', {antialias:true}) || cv.getContext('experimental-webgl'); }
  catch (e) { out.error = String(e && e.message).slice(0,160); }
  if (!gl) { out.error = out.error || 'NO_CONTEXT'; }
  else {
    out.created = true;
    try {
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) { out.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
                 out.vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL); }
    } catch (e) {}
    cv.addEventListener('webglcontextlost', function(ev){
      out.contextLost = true; out.lostAtMs = Date.now() - t0;
      try { ev.preventDefault(); } catch(e){}
    }, false);
    /* Real frames, real work: a context that is never asked to draw is not the context a capture needs.
       The clear colour moves so the driver cannot elide the work. */
    (function tick(){
      if (out.contextLost) return;
      try {
        var p = ((Date.now() - t0) % 2000) / 2000;
        gl.viewport(0,0,cv.width,cv.height);
        gl.clearColor(0.05 + 0.3*p, 0.1, 0.25, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        out.frames++; out.lastFrameMs = Date.now() - t0;
      } catch(e) { out.error = out.error || String(e && e.message).slice(0,160); }
      requestAnimationFrame(tick);
    }());
  }
  /* HOLD THE LOAD EVENT OPEN. headless=new takes --screenshot at the load event and then exits, so a
     timer measured in seconds never fires -- which is what the first version of this probe got wrong,
     reporting NO_REPORT for the very configuration the shipped runner uses successfully. The capture
     runner solves it the same way: an image whose response the server withholds. */
  var hold = new Image();
  hold.src = '/__hold?id=' + encodeURIComponent(out.id);
  document.body.appendChild(hold);
  setTimeout(function(){
    out.heldForMs = Date.now() - t0;
    var img = new Image();
    img.src = '/__report?d=' + encodeURIComponent(JSON.stringify(out));
    document.body.appendChild(img);
  }, ${HOLD_MS});
}());
</script></body></html>`;

const reported = Object.create(null);
const held = Object.create(null);
const PORT = 39930 + (process.pid % 60);

function runChrome(args, timeoutMs) {
  return new Promise(resolve => {
    const child = cp.spawn(browser, args, { stdio: 'ignore' });
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch (e) {} resolve('TIMEOUT'); } }, timeoutMs);
    child.on('exit', () => { if (!done) { done = true; clearTimeout(t); resolve('EXIT'); } });
    child.on('error', () => { if (!done) { done = true; clearTimeout(t); resolve('SPAWN_ERROR'); } });
  });
}

/* Every configuration keeps the capture runner's own non-GPU flags identical. Only the GL backend
   selection differs, which is the single variable this probe is allowed to move. */
const CONFIGS = [
  { id: 'swiftshader-baseline', gl: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    note: 'exactly what the capture runner forces today' },
  { id: 'angle-default', gl: [], note: 'no GL override: headless picks the real adapter if it can' },
  { id: 'angle-d3d11', gl: ['--use-angle=d3d11'], note: 'real GPU through D3D11' },
  { id: 'angle-gl', gl: ['--use-angle=gl'], note: 'real GPU through desktop GL' },
  { id: 'angle-d3d11-gpu-forced', gl: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
    note: 'real GPU, blocklist ignored' }
];

async function main() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    if (u.pathname === '/__hold') {
      const id = u.searchParams.get('id') || '';
      const release = (why) => { try { res.writeHead(200, { 'Content-Type': 'image/gif', 'X-Release': why }); res.end(GIF); } catch (e) {} };
      const timer = setTimeout(() => { if (held[id]) { delete held[id]; release('timeout'); } }, HOLD_MS + 12000);
      held[id] = { release, timer };
      return;
    }
    if (u.pathname === '/__report') {
      let id = '';
      try { const d = JSON.parse(u.searchParams.get('d')); reported[d.id] = d; id = d.id; } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'image/gif' }); res.end(GIF);
      const h = held[id];
      /* Release a touch LATER than the report: the screenshot is taken at the load event, and it should
         describe the frame the numbers describe. */
      if (h) { delete held[id]; clearTimeout(h.timer); setTimeout(() => h.release('reported'), 250); }
      return;
    }
    const id = u.pathname.replace(/^\/__p-/, '');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(PAGE(id));
  });

  srv.listen(PORT, '127.0.0.1', async () => {
    const results = [];
    for (const cfg of CONFIGS) {
      const profile = path.join(os.tmpdir(), 'km-gpuprobe-' + process.pid + '-' + cfg.id);
      const shot = path.join(os.tmpdir(), 'km-cp2o-r2-glprobe-' + process.pid + '-' + cfg.id + '.png');
      const args = ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
        '--force-device-scale-factor=1',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--user-data-dir=' + profile, '--window-size=700,460']
        .concat(cfg.gl)
        .concat(['--screenshot=' + shot, 'http://127.0.0.1:' + PORT + '/__p-' + cfg.id]);
      const how = await runChrome(args, HOLD_MS + 20000);
      const r = reported[cfg.id] || null;
      results.push({
        config: cfg.id, note: cfg.note, flags: cfg.gl, chromeExit: how,
        reported: r,
        screenshotBytes: fs.existsSync(shot) ? fs.statSync(shot).size : 0,
        /* The verdict this probe exists to produce. */
        verdict: !r ? 'NO_REPORT'
          : (!r.created ? 'NO_CONTEXT'
          : (r.contextLost ? 'CONTEXT_LOST_AT_' + r.lostAtMs + 'MS' : 'HELD_' + r.heldForMs + 'MS'))
      });
      process.stderr.write(cfg.id + ' ');
    }
    srv.close();
    process.stderr.write('\n');
    const usable = results.filter(r => /^HELD_/.test(r.verdict));
    const out = {
      ok: true, browser: path.basename(browser), capturedAt: new Date().toISOString().slice(0, 10),
      holdMs: HOLD_MS, node: process.version,
      usableConfigs: usable.map(r => r.config),
      anyUsable: usable.length > 0,
      results
    };
    const outDir = process.argv[2];
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'gl-probe.json'), JSON.stringify(out, null, 1), 'utf8');
    }
    console.log(JSON.stringify(out, null, 1));
  });
}
main();
