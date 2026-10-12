/**
 * ==================================================================================================
 * S8-B3-R3-CP2M-R1 — THE VIEWPORT ACCEPTANCE RUNNER (Site Priority)
 * ==================================================================================================
 *
 * CP2M implemented company grouping and a responsive layout and could only call them "implemented,
 * pending visual verification", because a CSS breakpoint asserted from source proves the RULE exists,
 * never that the PAGE renders. This drives Chrome at the five approved widths and asks the live DOM
 * the questions a stylesheet cannot answer: does the page scroll sideways, is any control too small
 * to hit with a thumb, is any text clipped, did the company bands actually render.
 *
 * THE CASCADE IS THE REAL ONE. Every <link rel="stylesheet"> is read out of index.html IN ORDER, so
 * the rules under test compete with the same twenty-odd stylesheets they compete with in production.
 * An acceptance page with one stylesheet would prove nothing about the cascade that ships.
 *
 * THE RENDER IS THE REAL ONE. The shipped partial supplies the markup and the shipped
 * site-priority.js supplies the rendering, entered through `window.initSitePriorityPage` — the same
 * entry the lifecycle mount uses. Only the DATA is substituted: a fixture of rows, in memory, so the
 * page has something to draw. No network, no backend, no Production.
 *
 * NOT A BUSINESS TEST. It photographs and measures. Save paths, the write contract and §45.A are
 * covered by the node suites and are not re-litigated here.
 *
 * USAGE:  node assets/tests/_cp2m-r1-viewport-runner.js [outDir]  -> prints one JSON blob
 * A helper, not a suite: the leading underscore keeps the sweep from executing it.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
function findBrowser() { for (const b of BROWSERS) { if (fs.existsSync(b)) return b; } return null; }

/* One private profile per process: a shared default profile contends on its lock and produced a
   systematic every-third-run boot failure in the s4-r3 runner. */
const PROFILE = path.join(os.tmpdir(), 'km-cp2m-r1-' + process.pid);

const VIEWPORTS = [
  { id: '360', w: 360, h: 780, touch: true },
  { id: '390', w: 390, h: 844, touch: true },
  { id: '768', w: 768, h: 1024, touch: true },
  { id: '1280', w: 1280, h: 800, touch: false },
  { id: '1920', w: 1920, h: 1080, touch: false }
];

/* Deliberately awkward fixture: two companies so the grouping is visible, a long marketplace name so
   truncation shows, a MISSING row, an explicit 0 and a duplicate weight. */
const FIXTURE = [
  { company: 'KitchenMama', country: 'US', marketplace: 'Amazon', allocationPriority: 100, currency: 'USD', status: 'active', marketplaceId: 'M1' },
  { company: 'KitchenMama', country: 'GB', marketplace: 'Amazon Marketplace Europe', allocationPriority: 80, currency: 'GBP', status: 'active', marketplaceId: 'M2' },
  { company: 'KitchenMama', country: 'DE', marketplace: 'Amazon', allocationPriority: 80, currency: 'EUR', status: 'active', marketplaceId: 'M3' },
  { company: 'KitchenMama', country: 'JP', marketplace: 'Rakuten', allocationPriority: 0, currency: 'JPY', status: 'active', marketplaceId: 'M4' },
  { company: 'KitchenMama', country: 'CA', marketplace: 'Walmart', allocationPriority: null, currency: 'CAD', status: 'active', marketplaceId: 'M5' },
  { company: 'ResourceUS', country: 'US', marketplace: 'Amazon', allocationPriority: 50, currency: 'USD', status: 'active', marketplaceId: 'M6' },
  { company: 'ResourceUS', country: 'US', marketplace: 'eBay', allocationPriority: '7abc', currency: 'USD', status: 'active', marketplaceId: 'M7' }
];

function cssLinks() {
  const html = read('index.html');
  const out = [];
  const re = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const h = /href=["']([^"']+)["']/i.exec(m[0]);
    if (h && !/^https?:/i.test(h[1])) out.push(h[1]);
  }
  return out;
}

function sectionMarkup() {
  // The shipped partial, minus its HTML comments, is the markup the page really renders into.
  return read('assets/html/pages/site-priority.html').replace(/<!--[\s\S]*?-->/g, '');
}

function buildPage(vp) {
  const links = cssLinks().map(h => '  <link rel="stylesheet" href="' + h + '">').join('\n');
  const partial = sectionMarkup();
  const sp = read('assets/js/pages/site-priority.js');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${links}
<style>
  html,body{margin:0;padding:0;}
  /* The real shell chrome, by structure, so the content width the page is handed is the real one. */
  .app-layout{display:block;}
  nav.sidebar{display:none;}         /* the sidebar is collapsed on phones and irrelevant to this page */
  .main-content{margin-left:0;}
  @media (min-width: 1024px){ nav.sidebar{display:block;position:fixed;left:0;top:0;width:240px;height:100%;}
                              .main-content{margin-left:240px;} }
  #site-priority-section{display:block !important;}
</style>
</head><body>
<div class="app-layout">
  <nav class="sidebar"></nav>
  <div class="main-content"><div class="content-area">
    <div id="site-priority-mount">${partial}</div>
  </div></div>
</div>
<script>
// ---- the minimum KM surface site-priority.js reaches for, with the DATA substituted ----------------
window.KM = window.KM || {};
window.KM.lifecycle = { register: function(){}, commitGuard: function(){ return true; },
                        currentEpoch: function(){ return 1; }, isCurrent: function(){ return true; },
                        listenerScope: function(){ return { on: function(t,ty,h,o){ t.addEventListener(ty,h,o); return true; } }; } };
var FIXTURE = ${JSON.stringify(FIXTURE)};
window.KM.referenceCache = {
  get: function(key, loader){ return Promise.resolve(FIXTURE); },
  invalidate: function(){}, invalidateMany: function(){}, clear: function(){}
};
window.KM.DB = {
  getMarketplaceReference: function(){ return Promise.resolve(FIXTURE); },
  setMarketplaceAllocationPriority: function(){ return Promise.resolve({ outcome: 'CONFIRMED_NOT_STARTED', code: 'TEST' }); },
  checkPageDeploymentContract: function(){ return Promise.resolve({ ok: true, code: 'DEPLOYMENT_CONTRACT_OK' }); }
};
</script>
<script>${sp}</script>
<script>
(function(){
  function go(){
    try { if (window.initSitePriorityPage) window.initSitePriorityPage(); } catch(e){}
    setTimeout(measure, 450);
  }
  function measure(){
    // THE VIEWPORT IS WHATEVER THIS DOCUMENT ACTUALLY HAS. Assuming the requested width is how the first
    // run of this runner reported 84 overflowing elements at '360px' while the real viewport was 500px --
    // headless Chrome would not shrink the WINDOW below its minimum, so the page was never narrow at all.
    var vw = document.documentElement.clientWidth;
    var de = document.documentElement, b = document.body;
    var sec = document.getElementById('site-priority-section');
    function boxes(sel, root){
      return Array.prototype.slice.call((root||document).querySelectorAll(sel)).map(function(e){
        var r = e.getBoundingClientRect(); var cs = getComputedStyle(e);
        return { w: Math.round(r.width), h: Math.round(r.height),
                 right: Math.round(r.right), left: Math.round(r.left),
                 fs: parseFloat(cs.fontSize)||0, display: cs.display,
                 clipped: e.scrollWidth > e.clientWidth + 1,
                 text: String(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40) };
      });
    }
    var all = Array.prototype.slice.call(document.querySelectorAll('#site-priority-section *'));
    /* The narrow layout hides the <thead> with the visually-hidden pattern (absolute + clip), which takes it
       OUT OF FLOW but leaves its cells their natural width. Their rects therefore extend past the viewport
       while being invisible and unable to scroll the page -- counting them as overflow would report a defect
       that does not exist. They are excluded BY NAME and counted separately rather than silently dropped. */
    function inHiddenHead(e){
      for (var p = e; p && p !== document.body; p = p.parentElement) {
        if (p.tagName === 'THEAD') {
          var cs = getComputedStyle(p);
          if (cs.position === 'absolute' && String(cs.clip || '').indexOf('rect(0') === 0) return true;
        }
      }
      return false;
    }
    var rawOver = all.filter(function(e){
      var r = e.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1;
    });
    var hiddenHeadOver = rawOver.filter(inHiddenHead).length;
    var overflowing = rawOver.filter(function(e){ return !inHiddenHead(e); }).map(function(e){
      var r = e.getBoundingClientRect();
      return { tag: e.tagName.toLowerCase(), cls: String(e.className||'').slice(0,40),
               right: Math.round(r.right), over: Math.round(r.right - vw) };
    });
    var buttons = boxes('#site-priority-section .sp-btn');
    var selects = boxes('#site-priority-section .sp-select');
    var groups  = boxes('#site-priority-section .sp-group__cell');
    var rows    = boxes('#site-priority-section tr[data-sp-row]');
    var cells   = boxes('#site-priority-section tr[data-sp-row] td');
    var out = {
      viewport: vw, requestedViewport: ${vp.w},
      docScrollWidth: de.scrollWidth, docClientWidth: de.clientWidth,
      bodyScrollWidth: b.scrollWidth,
      horizontalOverflow: de.scrollWidth > de.clientWidth + 1,
      sectionPresent: !!sec,
      sectionScrollWidth: sec ? sec.scrollWidth : 0,
      sectionClientWidth: sec ? sec.clientWidth : 0,
      overflowingCount: overflowing.length,
      hiddenHeadOverflow: hiddenHeadOver,
      overflowing: overflowing.slice(0, 8),
      groupCount: groups.length,
      groupTexts: groups.map(function(g){ return g.text; }),
      rowCount: rows.length,
      cellDisplay: cells.length ? cells[0].display : null,
      minButtonH: buttons.length ? Math.min.apply(null, buttons.map(function(x){ return x.h; })) : null,
      minButtonW: buttons.length ? Math.min.apply(null, buttons.map(function(x){ return x.w; })) : null,
      buttonCount: buttons.length,
      minSelectH: selects.length ? Math.min.apply(null, selects.map(function(x){ return x.h; })) : null,
      minFontSize: cells.length ? Math.min.apply(null, cells.map(function(x){ return x.fs; })) : null,
      clippedCells: cells.filter(function(c){ return c.clipped; }).length,
      // Vertical scrolling must remain possible on a phone; a page pinned to the viewport height with
      // content below the fold is unreachable with a thumb.
      verticallyScrollable: de.scrollHeight > de.clientHeight,
      scrollHeight: de.scrollHeight, clientHeight: de.clientHeight
    };
    var pre = document.createElement('pre');
    pre.id = '__measurements'; pre.style.display = 'none';
    pre.textContent = JSON.stringify(out);
    document.body.appendChild(pre);
    document.documentElement.setAttribute('data-measured','1');
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(go, 60);
  else document.addEventListener('DOMContentLoaded', function(){ setTimeout(go, 60); });
}());
</script>
</body></html>`;
}

function fileUrl(p) {
  return 'file:///' + path.resolve(p).replace(/\\/g, '/').replace(/ /g, '%20')
    .replace(/#/g, '%23').replace(/\?/g, '%3F');
}

function baseArgs(extra) {
  return ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--user-data-dir=' + PROFILE, '--virtual-time-budget=12000'].concat(extra);
}

function runChrome(browser, args) {
  const r = cp.spawnSync(browser, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 96 * 1024 * 1024 });
  return { out: r.stdout || '', err: r.stderr || '', status: r.status };
}

/* The FRAME is the viewport; the WINDOW only has to be big enough to hold it. This is the same device the
   P1-B8C runner uses, and for the same measured reason: headless Chrome will not shrink its window below a
   minimum width, so --window-size=360 silently yields a 500px viewport. */
function wrapperFor(innerFile, w, h) {
  return ['<!doctype html><html><head><meta charset="utf-8"><style>',
    'html,body{margin:0;padding:0;background:#fff;}',
    'iframe{border:0;width:' + w + 'px;height:' + h + 'px;display:block;}',
    '</style></head><body>',
    '<iframe id="f" src="' + path.basename(innerFile) + '"></iframe>',
    '<script>(function poll(){',
    '  var f=document.getElementById("f");',
    '  var d=null; try{ d=f.contentDocument; }catch(e){}',
    '  if(!d || !d.documentElement || d.documentElement.getAttribute("data-measured")!=="1"){',
    '    return setTimeout(poll,60);',
    '  }',
    '  var pre=document.createElement("pre"); pre.id="__measurements";',
    '  pre.textContent=d.getElementById("__measurements").textContent;',
    '  pre.style.display="none";',
    '  document.body.appendChild(pre);',
    '  document.documentElement.setAttribute("data-measured","1");',
    '}());<\/script></body></html>'].join('\n');
}

function shoot(browser, outDir, vp) {
  // THE PAGE MUST LIVE AT THE REPO ROOT. Every href in index.html is relative, so a page written to an
  // out-dir elsewhere silently resolves NONE of them -- the first run of this runner reported a table
  // layout at 360px for exactly that reason, which looked like a CSS defect and was a harness defect.
  const pageFile = path.join(ROOT, '_cp2m-r1-page-' + vp.id + '.html');
  fs.writeFileSync(pageFile, buildPage(vp), 'utf8');
  const png = path.join(outDir, 'site-priority-' + vp.id + '.png');
  const wrapFile = path.join(ROOT, '_cp2m-r1-frame-' + vp.id + '.html');
  fs.writeFileSync(wrapFile, wrapperFor(pageFile, vp.w, vp.h), 'utf8');
  const winW = Math.max(vp.w, 560), winH = Math.max(vp.h, 240);

  runChrome(browser, baseArgs(['--window-size=' + winW + ',' + winH, '--screenshot=' + png, fileUrl(wrapFile)]));
  const dom = runChrome(browser, baseArgs(['--window-size=' + winW + ',' + winH, '--dump-dom', fileUrl(wrapFile)]));

  let measurements = null;
  const m = /<pre id="__measurements"[^>]*>([\s\S]*?)<\/pre>/.exec(dom.out);
  if (m) {
    try {
      measurements = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    } catch (e) { measurements = { parseError: String(e.message) }; }
  }
  try { fs.unlinkSync(pageFile); } catch (e) {}
  try { fs.unlinkSync(wrapFile); } catch (e) {}
  return {
    id: vp.id, width: vp.w, height: vp.h, touch: vp.touch,
    png: fs.existsSync(png) ? png : null,
    pngBytes: fs.existsSync(png) ? fs.statSync(png).size : 0,
    measurements: measurements
  };
}

function main() {
  const outDir = process.argv[2] || path.join(os.tmpdir(), 'km-cp2m-r1-shots');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); return; }
  const results = VIEWPORTS.map(vp => shoot(browser, outDir, vp));
  // A FRESHNESS HASH, so a later edit cannot leave this evidence quietly describing a page that no longer
  // exists. The suite recomputes these and REFUSES stale measurements rather than asserting on them — the
  // S4-R1 failure mode of a conclusion outliving the thing it was measured on.
  const crypto = require('crypto');
  const sha = (rel) => crypto.createHash('sha256')
    .update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
  console.log(JSON.stringify({
    ok: true, browser: path.basename(browser),
    capturedAt: new Date().toISOString().slice(0, 10),
    fixtureRows: FIXTURE.length,
    sources: {
      'assets/css/pages/site-priority.css': sha('assets/css/pages/site-priority.css'),
      'assets/js/pages/site-priority.js': sha('assets/js/pages/site-priority.js'),
      'assets/html/pages/site-priority.html': sha('assets/html/pages/site-priority.html')
    },
    shotsDir: outDir,
    results: results.map(r => ({
      id: r.id, width: r.width, height: r.height, touch: r.touch,
      pngBytes: r.pngBytes, png: r.png ? path.basename(r.png) : null,
      measurements: r.measurements
    }))
  }, null, 1));
}

if (require.main === module) main();
module.exports = { VIEWPORTS, FIXTURE, findBrowser, shoot };
