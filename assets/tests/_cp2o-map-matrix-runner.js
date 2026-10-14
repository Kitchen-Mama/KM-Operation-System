// =============================================================================================================
// S8-B3-R3-CP2O-R1 — MAP: THE MINIMUM MATRIX THAT CAN ATTRIBUTE THE DESKTOP FAILURE
// -------------------------------------------------------------------------------------------------------------
// `map-canvas-acceptance` reports NO_CANVAS_BOX for its 1280x800 desktop scene while 390x844 passes. CP2O
// recorded that, proved it was not caused by the token rotation, and stopped there. That left four different
// explanations alive at once, and they need different remedies:
//
//   FIXTURE / SELECTOR   the canvas exists and the measuring script is not finding it
//   SCHEDULING           the canvas exists LATER than the measurement, or earlier and is torn down
//   WEBGL CONTEXT        no context, or a context lost after creation
//   HOST DETACH          the host left the document (what CP2M-R4-R1 measured and fixed for refresh)
//
// THIS RUNNER SAMPLES ALL FOUR AT ONCE, from the page's OWN diagnostic plus the pixel runner's OWN selector
// path, over a fixed 2x2 matrix:
//
//       tree:   main (65eb95b5, the MAIN checkout)  x  candidate (this sandbox)
//       height: 1280x800 (the failing scene)        x  1280x900 (the lifecycle runner's, which passes)
//
// Four cells, one pass, no re-runs. A cell that fails is RECORDED as a failure; nothing here retries until a
// green result appears, and nothing here changes a wait, a selector or the engine.
//
// It serves each tree from ITS OWN ROOT, so "main" really is main's bytes rather than this tree with two
// files swapped. The MAIN checkout is READ ONLY here: the server only reads files from it.
//
//   node assets/tests/_cp2o-map-matrix-runner.js [outFile]
// A helper, not a suite: the leading underscore keeps the sweep from executing it.
// =============================================================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const MAP = require('./_cp2m-r2-map-runner.js');
const FIXR3 = require('./_cp2m-r3-fixtures.js');

const SANDBOX = path.join(__dirname, '..', '..');
const MAIN = path.join(SANDBOX, '..', 'Operation System');   // the MAIN checkout, a sibling of this worktree
const OUT = process.argv[2] || path.join(SANDBOX, 'docs', 'evidence', 'cp2o-map-matrix', 'matrix.json');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

/* THE PROBE. It asks the page's own diagnostic AND, separately, walks the pixel runner's selector path, so a
   disagreement between the two IS the answer: the diagnostic looks inside `state.globeHost`, the pixel runner
   queries the SECTION for canvases and takes the largest box. */
const PROBE = `
(function(){
  var T = [], FATAL = null;
  window.onerror = function(m, src, line, col){ if (!FATAL) FATAL = String(m) + ' @' + line + ':' + col; };
  function now(){ return Math.round((window.performance && performance.now) ? performance.now() : Date.now()); }
  function pixelRunnerView(){
    // EXACTLY what _cp2m-r2-map-runner.js's measure script does to find the canvas.
    var sec = document.getElementById('global-logistics-map-section');
    if (!sec) return { sectionFound: false, canvasCount: 0, box: null };
    var list = sec.querySelectorAll('canvas');
    var best = null;
    for (var i = 0; i < list.length; i++){
      var r = list[i].getBoundingClientRect();
      if (!best || r.width * r.height > best.getBoundingClientRect().width * best.getBoundingClientRect().height) best = list[i];
    }
    var b = best ? best.getBoundingClientRect() : null;
    return {
      sectionFound: true,
      sectionActive: !!(sec.classList && sec.classList.contains('active')),
      canvasCount: list.length,
      box: b ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : null,
      ariaLabel: best ? (best.getAttribute('aria-label') || null) : null,
      backing: best ? { w: best.width, h: best.height } : null
    };
  }
  function webglProbe(){
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return { supported: false, renderer: null };
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return { supported: true, renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown' };
    } catch (e) { return { supported: false, renderer: 'probe-threw:' + String(e && e.message) }; }
  }
  function snap(tag){
    var d;
    try { d = (window.KM && window.KM.glmDiag) ? window.KM.glmDiag() : { noDiag: true }; }
    catch (e) { d = { diagError: String(e && e.message) }; }
    d.tag = tag; d.t = now();
    d.pixelView = pixelRunnerView();
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
  function sampleFor(tag, ms, step, done){
    var t0 = Date.now(), i = 0;
    (function tick(){
      snap(tag + '-' + (i++));
      if (Date.now() - t0 >= ms) return done();
      setTimeout(tick, step);
    }());
  }
  function finish(){
    var out = { ok: !FATAL, fatal: FATAL, webgl: webglProbe(),
      viewport: { w: window.innerWidth, h: window.innerHeight }, timeline: T };
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/__measure?id=' + encodeURIComponent(window.__CAP_ID), true);
      xhr.send(JSON.stringify(out));
    } catch (e) {}
  }
  var hold = document.createElement('img');
  hold.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';
  hold.src = '/__hold?id=' + encodeURIComponent(window.__CAP_ID);
  document.body.appendChild(hold);
  setTimeout(function(){
    try {
      snap('boot');
      T[T.length - 1].navHow = nav('global-logistics-map');
      sampleFor('map', 8000, 150, function(){ snap('settled'); finish(); });
    } catch (e) { FATAL = 'go(): ' + String(e && e.message); finish(); }
  }, 700);
  setTimeout(function(){ if (T.length) finish(); }, 25000);
}());
`;

function buildPageFrom(root, port, capId) {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
  html = html.replace('</body>', '<script>' + PROBE + '</script>\n</body>');
  return html;
}

function serverFor(root, pages, held, results) {
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
      const release = () => { try { res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
        res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')); } catch (e) {} };
      const timer = setTimeout(() => { if (held[id]) { delete held[id]; release(); } }, 40000);
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
        const send = (o) => res.end(JSON.stringify(MAP.withCorrelation(o, action, rid)));
        if (action === 'getClientCapabilities') { send({ success: true, data: { product_strategy_enabled: true } }); return; }
        if (action === 'shipment.workspace.get') { send({ success: true, data: FIXR3.shipmentWorkspace(8) }); return; }
        if (action === 'getTable') { send({ success: true, data: { rows: [] } }); return; }
        send({ success: true, data: { rows: [], shipments: [], items: [], marketplaces: [], countries: [] } });
      });
      return;
    }
    if (pages[p]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(pages[p]); return; }
    const abs = path.join(root, p.replace(/^\/+/, ''));
    if (!abs.startsWith(root)) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
}

function runCell(browser, treeName, root, h) {
  return new Promise((resolve) => {
    const pages = {}, held = {}, results = {};
    const srv = serverFor(root, pages, held, results);
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port;
      const capId = treeName + '-' + h;
      pages['/m.html'] = buildPageFrom(root, port, capId);
      pages['/wrap.html'] = MAP.wrapperFor('/m.html', 1280, h);
      const udd = path.join(path.dirname(OUT), '.chrome-profile-' + capId);
      const args = ['--headless=new', '--disable-gpu-sandbox', '--no-sandbox', '--no-first-run',
        '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--user-data-dir=' + udd, '--window-size=1280,' + h,
        'http://127.0.0.1:' + port + '/wrap.html'];
      await MAP.runChromeAsync(browser, args, 90000);
      srv.close();

      const r = results[capId] || { ok: false, reason: 'NO_RESULT' };
      const tl = r.timeline || [];
      const last = tl.length ? tl[tl.length - 1] : {};
      const withCanvasDiag = tl.filter(s => s.canvasPresent).length;
      const withCanvasPixel = tl.filter(s => s.pixelView && s.pixelView.canvasCount > 0).length;
      const boxed = tl.filter(s => s.pixelView && s.pixelView.box && s.pixelView.box.w >= 2 && s.pixelView.box.h >= 2);
      const disagree = tl.filter(s => !!s.canvasPresent !== !!(s.pixelView && s.pixelView.canvasCount > 0)).length;
      r.cell = { tree: treeName, viewport: '1280x' + h };
      r.summary = {
        samples: tl.length,
        webglSupported: r.webgl ? r.webgl.supported : null,
        webglRenderer: r.webgl ? r.webgl.renderer : null,
        // DIAGNOSTIC view (inside state.globeHost) vs PIXEL-RUNNER view (querySelectorAll on the section).
        samplesCanvasByDiag: withCanvasDiag,
        samplesCanvasByPixelSelector: withCanvasPixel,
        samplesWhereTheTwoDisagree: disagree,
        firstBoxedSampleAt: boxed.length ? boxed[0].t : null,
        lastBoxedSampleAt: boxed.length ? boxed[boxed.length - 1].t : null,
        everBoxed: boxed.length > 0,
        boxedAtEnd: !!(last.pixelView && last.pixelView.box && last.pixelView.box.w >= 2),
        finalBox: (last.pixelView && last.pixelView.box) || null,
        samplesHostDetached: tl.filter(s => s.hostExists && !s.hostInDocument).length,
        globeCreates: last.globeCreates == null ? null : last.globeCreates,
        globeDestroys: last.globeDestroys == null ? null : last.globeDestroys,
        contextLost: last.contextLost == null ? null : last.contextLost,
        globeError: last.globeError || '',
        globeAlive: !!last.globeAlive,
        renders: last.renders == null ? null : last.renders,
        attaches: last.attaches == null ? null : last.attaches,
        detaches: last.detaches == null ? null : last.detaches,
        navGen: last.navGen == null ? null : last.navGen,
        staleMountsBlocked: last.staleMountsBlocked == null ? null : last.staleMountsBlocked,
        loadingAtEnd: !!last.loading,
        sectionActiveAtEnd: !!(last.pixelView && last.pixelView.sectionActive),
        fatal: r.fatal || null
      };
      resolve(r);
    });
  });
}

async function main() {
  const browser = MAP.findBrowser();
  if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); return; }
  if (!fs.existsSync(path.join(MAIN, 'index.html'))) {
    console.log(JSON.stringify({ ok: false, reason: 'MAIN_TREE_NOT_FOUND', main: MAIN })); return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const sha = (root, rel) => {
    try {
      return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel), 'utf8')
        .replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
    } catch (e) { return null; }
  };
  const MAP_FILES = ['assets/js/pages/global-logistics-map.js', 'assets/js/lib/km-globe.js',
    'assets/css/pages/global-logistics-map.css', 'index.html', 'assets/js/app.js'];

  const out = {
    capturedAt: new Date().toISOString().slice(0, 10),
    trees: {
      main: { root: 'MAIN checkout', sources: {} },
      candidate: { root: 'sandbox worktree', sources: {} }
    },
    cells: {}
  };
  MAP_FILES.forEach(f => { out.trees.main.sources[f] = sha(MAIN, f); out.trees.candidate.sources[f] = sha(SANDBOX, f); });

  // THE FIXED MATRIX. Four cells, one pass each, in a stated order. No cell is repeated.
  const CELLS = [['main', MAIN, 800], ['main', MAIN, 900], ['candidate', SANDBOX, 800], ['candidate', SANDBOX, 900]];
  for (const [name, root, h] of CELLS) {
    const r = await runCell(browser, name, root, h);
    out.cells[name + '-' + h] = r;
    console.log(name + '-' + h + '  ' + JSON.stringify({
      everBoxed: r.summary.everBoxed, boxedAtEnd: r.summary.boxedAtEnd,
      diagCanvas: r.summary.samplesCanvasByDiag, pixelCanvas: r.summary.samplesCanvasByPixelSelector,
      disagree: r.summary.samplesWhereTheTwoDisagree,
      creates: r.summary.globeCreates, destroys: r.summary.globeDestroys,
      ctxLost: r.summary.contextLost, detached: r.summary.samplesHostDetached,
      err: r.summary.globeError ? r.summary.globeError.slice(0, 40) : ''
    }));
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ ok: true, outFile: OUT }));
}

main();
