/**
 * ==================================================================================================
 * S8-B3-R3-CP2M-R2 — THE MAP CANVAS VERIFICATION
 * ==================================================================================================
 *
 * WHAT WAS WRONG WITH THE PREVIOUS ANSWER. CP2M-R1 reported that WebGL is available in this headless
 * Chrome (maxTex 16384) and concluded the check was "feasible rather than blocked". That is a fact
 * about the BROWSER. It says nothing about whether this application's globe draws anything, which is
 * the question. A context that can be created is not a scene that was rendered.
 *
 * AND THE PAGE CANNOT BE ASKED. km-globe.js creates its context with { antialias: true, alpha: false }
 * and NO preserveDrawingBuffer, so the drawing buffer is discarded after compositing: toDataURL and
 * drawImage both hand back a blank image. Chrome's own screenshot is the only place those pixels
 * survive, so the evidence is a decoded PNG (see _cp2m-r2-png.js) and not a DOM query.
 *
 * THE EXPERIMENT, AND WHY IT HAS THREE RUNS RATHER THAN TWO.
 *
 *   Proving "the globe MOVED when dragged" by comparing a dragged screenshot with an undragged one
 *   proves nothing on its own: if the scene were animated, or seeded from a clock, two identical runs
 *   would differ too and the drag would get the credit. km-globe.js states it consults neither a clock
 *   nor a PRNG, so that is a claim this can TEST rather than quote:
 *
 *     A  render, no interaction
 *     B  render, no interaction          -> A vs B is the NOISE FLOOR. It should be ~0.
 *     C  render, then a real pointer drag -> C vs A is the EFFECT.
 *
 *   The finding is only meaningful if the effect is far above the floor, and both numbers are
 *   reported. A single pair would have been an assertion with a picture attached.
 *
 * REAL EVENTS, NOT AN API CALL. The drag is dispatched as PointerEvents on the canvas -- down, several
 * moves, up -- which is the path the globe's own listeners are bound to. Calling an internal rotate
 * function would prove the renderer can draw a different angle, not that a finger can turn it.
 *
 * DESKTOP AND MOBILE, because a canvas that lays out at 1280 and collapses to zero height at 390 is a
 * real and common defect, and a desktop-only check cannot see it.
 *
 * USAGE: node assets/tests/_cp2m-r2-map-runner.js [outDir]
 * A helper, not a suite: the leading underscore keeps the sweep from executing it.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const PNG = require('./_cp2m-r2-png.js');
const FIXR3 = require('./_cp2m-r3-fixtures.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
function findBrowser() { for (const b of BROWSERS) { if (fs.existsSync(b)) return b; } return null; }

const SCENES = [
  { id: 'desktop', w: 1280, h: 800 },
  { id: 'mobile', w: 390, h: 844 }
];
const RUNS = ['a', 'b', 'c'];      // a and b are identical; c drags.

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function fixtureShipments(n) {
  const route = ['CN', 'US', 'GB', 'DE', 'JP'];
  return Array.from({ length: n }, (_, i) => ({
    shipment_id: 'FIXTURE-' + i, sku: 'TEST-SKU-' + i, qty: 10 + i,
    origin_country: 'CN', destination_country: route[i % route.length],
    origin: 'CN', destination: route[i % route.length],
    status: 'in_transit', etd: '2026-10-01', eta: '2026-11-01',
    carrier: 'FixtureCarrier', shipping_method: 'SEA', progress: (i % 9) / 10
  }));
}

const DRAG = `
  function drag(cv){
    var r = cv.getBoundingClientRect();
    var x = Math.round(r.left + r.width/2), y = Math.round(r.top + r.height/2);
    function ev(type, px, py){
      var e;
      try { e = new PointerEvent(type, { pointerId:1, pointerType:'mouse', isPrimary:true,
        bubbles:true, cancelable:true, clientX:px, clientY:py, buttons: type==='pointerup'?0:1 }); }
      catch(err){ e = new MouseEvent(type.replace('pointer','mouse'), { bubbles:true, cancelable:true, clientX:px, clientY:py }); }
      cv.dispatchEvent(e);
    }
    ev('pointerdown', x, y);
    // SEVERAL moves, because the handler integrates per-move deltas: one big jump and a slow sweep are
    // different gestures, and the second is the one an operator performs.
    for (var i=1;i<=8;i++) ev('pointermove', x + i*14, y + Math.round(i*2));
    ev('pointerup', x + 8*14, y + 16);
    return { from:[x,y], to:[x+112, y+16] };
  }
`;

function measureScript(doDrag) {
  return `
(function(){
${DRAG}
  function findCanvas(){
    var sec = document.getElementById('global-logistics-map-section');
    if (!sec) return null;
    var list = sec.querySelectorAll('canvas');
    var best = null;
    for (var i=0;i<list.length;i++){
      var r = list[i].getBoundingClientRect();
      if (!best || r.width*r.height > best.getBoundingClientRect().width*best.getBoundingClientRect().height) best = list[i];
    }
    return best;
  }
  function report(extra, attempt){
    attempt = attempt || 1;
    var sec = document.getElementById('global-logistics-map-section');
    var cv = findCanvas();
    /* THE GLOBE CAN VANISH BETWEEN THE WAIT AND THE REPORT. Measured: canvasAppeared true at 391 ms and
       canvasCount 0 at report, on the desktop scene only -- the renderer tears down and rebuilds. One
       sample therefore describes whichever side of that it happened to land on, which is how two
       supposedly identical runs produced screenshots 274 KB and 438 KB apart. Re-checking for a bounded
       number of frames reports the SETTLED state instead of a instant in the middle of a rebuild. */
    if ((!cv || cv.getBoundingClientRect().width < 2) && attempt <= 40) {
      return setTimeout(function(){ report(extra, attempt + 1); }, 100);
    }
    var r = cv ? cv.getBoundingClientRect() : null;
    var out = {
      sectionPresent: !!sec,
      sectionActive: !!(sec && sec.classList && sec.classList.contains('active')),
      canvasCount: sec ? sec.querySelectorAll('canvas').length : 0,
      canvasPresent: !!cv,
      canvasCssBox: r ? { x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height) } : null,
      canvasBackingSize: cv ? { w: cv.width, h: cv.height } : null,
      canvasAriaLabel: cv ? (cv.getAttribute('aria-label')||'').slice(0,80) : null,
      reportAttempts: attempt,
      devicePixelRatio: window.devicePixelRatio,
      webglSupported: (window.KMGlobe && typeof window.KMGlobe.isSupported==='function') ? window.KMGlobe.isSupported() : null,
      diagnostics: null
    };
    try {
      if (window.KMGlobe && typeof window.KMGlobe.diagnostics === 'function') {
        var d = window.KMGlobe.diagnostics();
        out.diagnostics = { glVersion: d && d.glVersion, frames: d && d.frames,
                            yaw: d && d.camera && d.camera.yaw, pitch: d && d.camera && d.camera.pitch };
      }
    } catch(e) { out.diagnosticsError = String(e.message).slice(0,80); }
    if (extra) for (var k in extra) out[k] = extra[k];
    try {
      var xhr=new XMLHttpRequest();
      xhr.open('POST','/__measure?id='+encodeURIComponent(window.__CAP_ID),true);
      xhr.send(JSON.stringify(out));
    } catch(e){}
  }
  /* WAIT FOR THE CANVAS, DO NOT GUESS AT IT. The first run of this waited a fixed 4500 ms and the desktop
     scene reported canvasCount:0 while the SAME wait in another run found the globe -- the renderer builds
     its geometry and texture asynchronously, so a fixed delay is a coin toss. Polling turns "the globe did
     not render" into a statement about the globe rather than about the stopwatch. */
  function waitForCanvas(ms, cb){
    var t0 = Date.now();
    (function poll(){
      var cv = findCanvas();
      if (cv && cv.getBoundingClientRect().width > 2) return cb(cv, Date.now()-t0);
      if (Date.now()-t0 > ms) return cb(null, Date.now()-t0);
      setTimeout(poll, 150);
    }());
  }

  function go(){
    var el=document.querySelector('[onclick*="showSection(\\'global-logistics-map\\')"]');
    if(el) el.click(); else if(window.showSection) window.showSection('global-logistics-map');
    waitForCanvas(22000, function(cv, waitedMs){
      var extra = { dragged:false, canvasWaitMs: waitedMs, canvasAppeared: !!cv };
      /* AND BRING IT INTO THE PICTURE. --screenshot captures the VIEWPORT, not the document, and the globe
         sits below the fold at both tested sizes (y=368 of an 800px viewport on desktop, y=1433 on mobile).
         Measuring pixels in a region the camera never pointed at is how a rendered scene gets recorded as
         blank. */
      if (cv) { try { cv.scrollIntoView({block:'center', inline:'center'}); } catch(e){ try { cv.scrollIntoView(); } catch(e2){} } }
      setTimeout(function(){
      ${doDrag ? `
      try {
        var c2 = findCanvas();
        if (c2) { extra.dragPath = drag(c2); extra.dragged = true; }
        else { extra.dragged = false; extra.dragSkipped = 'NO_CANVAS'; }
      } catch(e){ extra.dragError = String(e.message).slice(0,100); }
      setTimeout(function(){ report(extra); }, 1600);` : `
      setTimeout(function(){ report(extra); }, 1600);`}
      }, 1400);   // frames, after the scroll settles
    });
  }
  /* THE PAGE HOLDS ITS OWN LOAD EVENT until it has rendered and reported -- see the viewport runner's
     note. For the globe this matters more than anywhere else: the scene needs real frames, and the two
     alternatives both fail here. --virtual-time-budget hangs against this application (measured: 8000 and
     15000 both ran the full 90s cap with no result), and it would also freeze the animation frames the
     renderer needs. --timeout does not hold --headless=new open. */
  var hold=document.createElement('img');
  hold.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';
  hold.src='/__hold?id='+encodeURIComponent(window.__CAP_ID);
  document.body.appendChild(hold);
  setTimeout(go,600);
}());
`;
}

function buildPage(port, doDrag, capId) {
  let html = read('index.html');
  html = html.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/[^"']+/g, 'http://127.0.0.1:' + port + '/__stub.js');
  const preamble = `
<script>
(function(){
  var LOCAL='http://127.0.0.1:${port}';
  var _f=window.fetch;
  window.fetch=function(input,init){
    var url=(typeof input==='string')?input:(input&&input.url)||'';
    if(/^https?:\\/\\//i.test(url)&&url.indexOf(LOCAL)!==0){
      var qs=url.indexOf('?')>=0?url.slice(url.indexOf('?')):'';
      return _f.call(this,LOCAL+'/__api'+qs,init);
    }
    return _f.apply(this,arguments);
  };
  window.__CAP_ID='${capId}';
}());
</script>`;
  const first = html.indexOf('<script');
  html = html.slice(0, first) + preamble + '\n' + html.slice(first);
  html = html.replace('</body>', '<script>' + measureScript(doDrag) + '</script>\n</body>');
  return html;
}


/**
 * Stamp a stub answer with the correlation a real deployment owes the client.
 * Without this the transport reports RESPONSE_CORRELATION_UNPROVEN and the page refuses the answer.
 */
function withCorrelation(payload, action, rid) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = Object.assign({}, payload);
  out.meta = Object.assign({}, out.meta || {}, { action: action, requestId: rid || undefined });
  if (rid) out.request_id = rid;
  return out;
}

const MAX_HOLD_MS = 40000;   // the globe needs real frames; this is the ceiling, not the expectation

function startServer(pages, held, results) {
  const ships = fixtureShipments(14);
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = decodeURIComponent(u.pathname);

    if (p === '/__measure') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const id = u.searchParams.get('id') || '';
        try { results[id] = JSON.parse(body); } catch (e) { results[id] = { parseError: String(e.message) }; }
        res.writeHead(204); res.end();
        const h = held[id];
        if (h) { delete held[id]; clearTimeout(h.timer); h.release('measured'); }
      });
      return;
    }
    if (p === '/__hold') {
      const id = u.searchParams.get('id') || '';
      const release = (why) => {
        try {
          res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store', 'X-Release': why });
          res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
        } catch (e) {}
      };
      const timer = setTimeout(() => { if (held[id]) { delete held[id]; release('timeout'); } }, MAX_HOLD_MS);
      held[id] = { release, timer };
      return;
    }
    if (p === '/__stub.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('window.Chart=window.Chart||function(){return{destroy:function(){},update:function(){},resize:function(){},data:{},options:{}};};'
        + 'window.Chart.register=window.Chart.register||function(){};window.ExcelJS=window.ExcelJS||{Workbook:function(){}};');
      return;
    }
    if (p === '/__api') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        let action = u.searchParams.get('action') || '';
        let table = u.searchParams.get('table') || '';
        let rid = u.searchParams.get('km_rid') || '';
        if (!action && body) {
          try { const j = JSON.parse(body); action = j.action || ''; table = table || j.table || ''; rid = rid || j.requestId || ''; }
          catch (e) {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        const send = (o) => res.end(JSON.stringify(withCorrelation(o, action, rid)));
        if (action === 'getClientCapabilities') { send({ success: true, data: { product_strategy_enabled: true } }); return; }
        /* THE SHIPMENT OVERLAY, in its real shape. CP2M-R2 answered this generically and the map drew
           its formal empty state, so the globe was verified with nothing on it. Every key comes from
           KM.DB.adaptShipmentWorkspace's own normalizers -- see _cp2m-r3-fixtures.js. */
        if (action === 'shipment.workspace.get') { send({ success: true, data: FIXR3.shipmentWorkspace(8) }); return; }
        if (action === 'getTable' && table === 'shipments') { send({ success: true, data: { rows: ships } }); return; }
        if (action === 'getTable') { send({ success: true, data: { rows: [] } }); return; }
        send({ success: true, data: { rows: ships, shipments: ships, items: ships, marketplaces: [], countries: [] } });
      });
      return;
    }
    if (pages[p]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(pages[p]); return; }
    const abs = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
}

function wrapperFor(innerPath, w, h) {
  return ['<!doctype html><html><head><meta charset="utf-8"><style>',
    'html,body{margin:0;padding:0;background:#fff;}',
    'iframe{border:0;width:' + w + 'px;height:' + h + 'px;display:block;}',
    '</style></head><body>',
    '<iframe id="f" src="' + innerPath + '"></iframe>',
    '</body></html>'].join('\n');
}

/**
 * RUN CHROME WITHOUT BLOCKING THE SERVER THAT IS SERVING IT.
 *
 * This replaced spawnSync, and the reason is worth keeping: spawnSync blocks Node's EVENT LOOP. The
 * page under test is served by an http.createServer IN THIS PROCESS, so while spawnSync waited, the
 * server could not answer a single request -- and Chrome sat there with nothing to load. The symptom
 * was total and silent: "requests served: 0", a zero-byte screenshot, and a browser that looked hung.
 * It survived a change of resolver rules, a change of virtual-time budget and a fresh profile, because
 * none of those was the problem.
 *
 * The CP2M-R1 runner used spawnSync safely only because it served pages from file:// and had no server
 * to starve. The moment a real shell required a real origin, spawnSync became unusable.
 */
function runChromeAsync(browser, args, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const child = cp.spawn(browser, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill(); } catch (e) {}
      resolve({ timedOut: true });
    }, timeoutMs);
    child.on('exit', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ timedOut: false, code });
    });
    child.on('error', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ timedOut: false, error: true });
    });
  });
}

function main() {
  const outDir = process.argv[2] || path.join(os.tmpdir(), 'km-cp2m-r2-map');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); return; }

  const port = 39700 + (process.pid % 200);
  const pages = {};
  SCENES.forEach(sc => RUNS.forEach(run => {
    pages['/__page-' + sc.id + '-' + run] = buildPage(port, run === 'c', sc.id + '-' + run);
    pages['/__frame-' + sc.id + '-' + run] = wrapperFor('/__page-' + sc.id + '-' + run, sc.w, sc.h);
  }));

  const held = Object.create(null);
  const reported = Object.create(null);
  const srv = startServer(pages, held, reported);
  srv.listen(port, '127.0.0.1', async () => {
    const shots = {};
    for (const sc of SCENES) for (const run of RUNS) {
      const key = sc.id + '-' + run;
      const png = path.join(outDir, 'map-' + key + '.png');
      const profile = path.join(os.tmpdir(), 'km-cp2m-r2-map-' + process.pid + '-' + key);
      /* NO --disable-gpu HERE, and no virtual time. SwiftShader is the software rasteriser that makes
         WebGL work headless; and a frozen clock would stop the globe's own animation frames, so the
         screenshot would be of a scene that was never allowed to draw. */
      const base = ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
        '--force-device-scale-factor=1', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--user-data-dir=' + profile,
        '--window-size=' + Math.max(sc.w, 560) + ',' + Math.max(sc.h, 240)];
      const url = 'http://127.0.0.1:' + port + '/__frame-' + key;
      /* ONE launch per run: the screenshot and the numbers must describe the SAME frame. Two launches
         would give the pixel comparison a second source of variation and quietly ruin the experiment. */
      await runChromeAsync(browser, base.concat(['--screenshot=' + png, url]), MAX_HOLD_MS + 25000);
      shots[key] = { png: fs.existsSync(png) ? png : null,
                     bytes: fs.existsSync(png) ? fs.statSync(png).size : 0,
                     measurements: reported[key] || null };
      process.stderr.write(key + ' ');
    }
    srv.close();
    process.stderr.write('\n');

    const scenes = SCENES.map(sc => {
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
        // Framing: the drawn content should fill a healthy share of the canvas and sit near its centre.
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

    const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
    const result = {
      ok: true, browser: path.basename(browser),
      capturedAt: new Date().toISOString().slice(0, 10),
      design: 'A and B are identical runs (the noise floor); C performs a real pointer drag (the effect).',
      sources: {
        'index.html': sha('index.html'),
        'assets/js/lib/km-globe.js': sha('assets/js/lib/km-globe.js'),
        'assets/js/pages/global-logistics-map.js': sha('assets/js/pages/global-logistics-map.js'),
        'assets/js/app.js': sha('assets/js/app.js'),
        'assets/tests/_cp2m-r2-map-runner.js': sha('assets/tests/_cp2m-r2-map-runner.js'),
        'assets/tests/_cp2m-r2-png.js': sha('assets/tests/_cp2m-r2-png.js')
      },
      shotsDir: outDir, scenes: scenes
    };
    fs.writeFileSync(path.join(outDir, 'map.json'), JSON.stringify(result, null, 1), 'utf8');
    console.log(JSON.stringify({ ok: true, outDir: outDir, scenes: scenes.map(s => s.scene) }));
  });
}

if (require.main === module) main();
module.exports = { SCENES, findBrowser, buildPage, fixtureShipments };
