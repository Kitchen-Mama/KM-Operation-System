/**
 * ==================================================================================================
 * PSB-DEMO-R3 CLOSE-OUT — THE R55 FINDINGS F-2 AND F-1, IN A REAL CHROME ON PRODUCTION'S RESPONSES.
 * ==================================================================================================
 *
 * The page is the production page (buildPage), fed at the socket by `_psb-demo-r3-capture.js` with the exact
 * bodies production returned on 2026-10-22 (ResTW CA, ResUS US Amazon, ResUS US Walmart).
 *
 *   F-2  ResUS / US / Amazon, Electric Can Opener, BFCM 2026 — the chart R55 P3 failed on. At 1920 / 1440 / 820:
 *        every printed label (axis, product, deal price, discount line, competitor header) lies inside its
 *        drawing and overlaps no other; the right-most column's deal label reads in full what the table reads
 *        (R55 saw "44.7" for 44.79), with its discount line beside it; the type stays >= 13px on screen.
 *        Then a competitor is entered (memory only), which puts the "Competitors · entered this session · not
 *        saved" header at the right edge — R55's P6 screenshot showed it cut — and the same checks repeat.
 *        The layout-only two-currency / long-name copy (PSB_R3_SYNTH) is checked the same way.
 *   F-1  the activity period reads as calendar days: no "GMT", no "Thu Nov 19 2026 …" anywhere; the menu,
 *        the note and the tooltip say 2026-11-19 to 2026-11-30; the days are the ones the record holds
 *        (read literally, never shifted through UTC), and the menu is in date order (Fall Prime, October,
 *        before BFCM, November).
 *   W    every request the page made is a read.
 *
 * MODES  node assets/tests/_psb-demo-r3c-runner.js <outDir> [before]
 *   `before` loads psb-board-ui.js, psb-selectors.js, psb-chart-layout.js and the stylesheet AS THEY WERE AT
 *   BASE_REF (the R3 commit chain's head), from git, as separate git-ignored copies. The checks this
 *   close-out adds are EXPECTED to fail there. Nothing shipped is ever written.
 * Writes <outDir>/r3c.json and PNGs. Exits non-zero on any failed check (after mode) or a missing Chrome.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
var RUN = require('./_p1b8c-visual-runner.js');
var BASE_REF = '2af8d156';
var SITE_CA = { company: 'ResTW', country: 'CA', marketplace: 'Amazon' };
var SITE_US = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var FALL_PRIME_CA = 'CMP-BEEB2104-9';
var BFCM_US = 'CMP-808C4BD5-7';
var WIDTHS = [1920, 1440, 820];
var BEFORE_FILES = {
  'assets/js/product-strategy/psb-board-ui.js': '_psb-r3c-before-ui.js',
  'assets/js/product-strategy/psb-selectors.js': '_psb-r3c-before-selectors.js',
  'assets/js/product-strategy/psb-chart-layout.js': '_psb-r3c-before-layout.js',
  'assets/css/product-strategy-board.css': '_psb-r3c-before.css'
};
var SOURCES = ['assets/js/product-strategy/psb-board-ui.js', 'assets/js/product-strategy/psb-selectors.js',
  'assets/js/product-strategy/psb-chart-layout.js', 'assets/css/product-strategy-board.css',
  'assets/tests/_psb-demo-r3-capture.js', 'assets/tests/_psb-demo-r3-prod-data.js', 'assets/tests/_psb-demo-r3c-runner.js'];

function sha(f) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}
function fileUrl(p) {
  return 'file:///' + path.resolve(p).replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23').replace(/\?/g, '%3F');
}
function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function cdp(wsUrl) {
  var ws = new WebSocket(wsUrl);
  var id = 0, pending = {};
  ws.onmessage = function (m) {
    var d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { var p = pending[d.id]; delete pending[d.id]; if (d.error) p.rej(new Error(JSON.stringify(d.error))); else p.res(d.result); }
  };
  var open = new Promise(function (res, rej) { ws.onopen = res; ws.onerror = rej; });
  function send(method, params) {
    return open.then(function () {
      return new Promise(function (res, rej) {
        var my = ++id;
        pending[my] = { res: res, rej: rej };
        ws.send(JSON.stringify({ id: my, method: method, params: params || {} }));
        setTimeout(function () { if (pending[my]) { delete pending[my]; rej(new Error('CDP timeout: ' + method)); } }, 30000);
      });
    });
  }
  return { send: send };
}

function buildHtml(mode, synthOn) {
  var html = RUN.buildPage({ view: 'category', activated: true, site: SITE_CA });
  var anchor = '<script src="assets/tests/_p1b8c-capture.js"></script>';
  if (html.indexOf(anchor) < 0) throw new Error('STOP: capture script tag not found');
  html = html.replace(anchor, (synthOn ? '<script>window.PSB_R3_SYNTH = true;</script>\n  ' : '') + anchor
    + '\n  <script src="assets/tests/_psb-demo-r3-prod-data.js"></script>'
    + '\n  <script src="assets/tests/_psb-demo-r3-capture.js"></script>');
  if (mode === 'before') {
    Object.keys(BEFORE_FILES).forEach(function (rel) {
      var copy = path.join(ROOT, 'assets', 'tests', BEFORE_FILES[rel]);
      fs.writeFileSync(copy, cp.execFileSync('git', ['show', BASE_REF + ':' + rel],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }), 'utf8');
      if (/\.css$/.test(rel)) {
        var re = /<link rel="stylesheet" href="assets\/css\/product-strategy-board\.css[^"]*">/;
        if (!re.test(html)) throw new Error('STOP: stylesheet tag not found');
        html = html.replace(re, '<link rel="stylesheet" href="assets/tests/' + BEFORE_FILES[rel] + '">');
      } else {
        var tag = '<script src="' + rel + '"></script>';
        if (html.split(tag).length !== 2) throw new Error('STOP: script tag not unique: ' + rel);
        html = html.replace(tag, '<script src="assets/tests/' + BEFORE_FILES[rel] + '"></script>');
      }
    });
  }
  var pageFile = path.join(ROOT, 'assets', 'tests', '_psb-r3c-page' + (synthOn ? '-synth' : '') + '.html');
  fs.writeFileSync(pageFile, html, 'utf8');
  return pageFile;
}

/* ---- in-page probes, as strings ---------------------------------------------------------------- */
/* Every printed label of every chart: its on-screen box and ON-SCREEN font size, then every overlapping pair
   and every label that leaves its drawing. The SVG clips at its own box, so "inside the box" is "fully seen". */
var LAYOUT_PROBE = '(function(){var out={charts:[]};Array.prototype.forEach.call(document.querySelectorAll("svg.chart"),function(s){'
  + 'var vb=s.viewBox.baseVal,sr=s.getBoundingClientRect(),scale=sr.width/vb.width;'
  + 'var sel=".ytick,.xlabel,.xsub,.mk-activity-label,.mk-activity-disc,.demo-comp-head,.axtitle,.demo-comp-label";'
  + 'var items=[];Array.prototype.forEach.call(s.querySelectorAll(sel),function(t){var txt=(t.textContent||"").trim();if(!txt)return;'
  + 'var b=t.getBoundingClientRect();if(!b.width)return;var cls=String(t.getAttribute("class")).split(" ")[0];'
  + 'items.push({cls:cls,txt:txt.slice(0,60),x:b.left,y:b.top,r:b.right,bo:b.bottom,px:Math.round(parseFloat(getComputedStyle(t).fontSize)*scale*100)/100});});'
  + 'var ov=[];for(var i=0;i<items.length;i++)for(var j=i+1;j<items.length;j++){var a=items[i],b=items[j];'
  + 'if(a.cls==="axtitle"||b.cls==="axtitle")continue;'
  + 'var w=Math.min(a.r,b.r)-Math.max(a.x,b.x),h=Math.min(a.bo,b.bo)-Math.max(a.y,b.y);if(w>1&&h>1)ov.push(a.cls+":"+a.txt+" x "+b.cls+":"+b.txt);}'
  + 'var clip=items.filter(function(t){return t.x<sr.left-0.5||t.r>sr.right+0.5||t.y<sr.top-0.5||t.bo>sr.bottom+0.5;}).map(function(t){return t.cls+":"+t.txt+" r="+Math.round(t.r)+" svgR="+Math.round(sr.right);});'
  + 'function min(c){var v=items.filter(function(t){return t.cls===c;}).map(function(t){return t.px;});return v.length?Math.min.apply(null,v):null;}'
  + 'var head=items.filter(function(t){return t.cls==="demo-comp-head";});'
  + 'out.charts.push({currency:s.getAttribute("data-currency"),density:s.getAttribute("data-density"),scale:Math.round(scale*1000)/1000,renderW:Math.round(sr.width),'
  + 'minPx:{ytick:min("ytick"),xlabel:min("xlabel"),deal:min("mk-activity-label"),disc:min("mk-activity-disc"),head:min("demo-comp-head")},'
  + 'head:head.map(function(t){return t.txt;}),labels:items.length,overlaps:ov,clipped:clip});});'
  + 'out.panels=document.querySelectorAll("section.panel").length;return out;})()';

/* The right-most product column that carries a deal label: what it prints, beside what the table says. */
var RIGHTMOST = '(function(){var s=document.querySelector("svg.chart");if(!s)return null;var sr=s.getBoundingClientRect();'
  + 'var best=null;Array.prototype.forEach.call(s.querySelectorAll(".col:not(.col-competitor)"),function(g){var l=g.querySelector(".mk-activity-label");if(!l)return;'
  + 'var b=g.getBoundingClientRect();if(!best||b.right>best.b.right)best={g:g,b:b,l:l};});if(!best)return null;'
  + 'var l=best.l,d=best.g.querySelector(".mk-activity-disc"),lb=l.getBoundingClientRect(),db=d?d.getBoundingClientRect():null;'
  + 'return {label:best.g.getAttribute("data-label"),reg:best.g.getAttribute("data-regular-c"),text:l.textContent,disc:d?d.textContent:null,'
  + 'flipped:l.getAttribute("data-flipped"),labelR:Math.round(lb.right),discR:db?Math.round(db.right):null,svgR:Math.round(sr.right),'
  + 'recordedC:best.g.querySelector(".mk-activity-group")?best.g.querySelector(".mk-activity-group").getAttribute("data-recorded-c"):null};})()';

var TABLE_ACT = '(function(){var t=document.getElementById("productTable");if(!t)return [];return Array.prototype.map.call(t.querySelectorAll("tbody tr"),function(r){'
  + 'var a=r.querySelector("td[data-activity-state]");return {label:r.getAttribute("data-label"),act:a?a.innerText.replace(/\\s+/g," ").trim():null,text:r.innerText.replace(/\\s+/g," ").slice(0,200)};});})()';

function main() {
  var out = process.argv[2];
  var mode = process.argv[3] === 'before' ? 'before' : 'after';
  if (!out) { console.error('usage: node _psb-demo-r3c-runner.js <outDir> [before]'); process.exit(2); }
  out = path.resolve(out);
  fs.mkdirSync(out, { recursive: true });
  var browser = RUN.findBrowser();
  if (!browser) { console.error('STOP: no Chrome found'); process.exit(3); }
  var ev = { round: 'PSB-DEMO-R3 close-out (F-2, F-1)', mode: mode, base_ref: BASE_REF, takenAt: new Date().toISOString(), browser: browser,
    data: 'production 2026-10-22 read-only bodies (docs/evidence/psb-demo-r3/production-read)', sources: {}, steps: [], checks: [] };
  SOURCES.forEach(function (f) { ev.sources[f] = sha(f); });
  var pageFile = buildHtml(mode, false);
  var synthFile = buildHtml(mode, true);

  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-demo-r3c-'));
  var chrome = cp.spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--window-size=1920,1200', 'about:blank'], { stdio: 'ignore' });
  var client = null;
  function check(name, ok, got) { ev.checks.push({ name: name, ok: !!ok, got: got === undefined ? null : got }); }
  function step(name, data) { ev.steps.push({ name: name, data: data === undefined ? null : data }); }
  function js(expr) {
    return client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).then(function (r) {
      if (r.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
      return r.result.value;
    });
  }
  function waitFor(expr, ms) {
    var t0 = Date.now();
    function loop() {
      return js(expr).then(function (v) {
        if (v) return v;
        if (Date.now() - t0 > (ms || 20000)) throw new Error('timed out waiting for ' + expr);
        return delay(100).then(loop);
      });
    }
    return loop();
  }
  function mouse(type, x, y, buttons) {
    return client.send('Input.dispatchMouseEvent', { type: type, x: x, y: y, button: 'left',
      buttons: buttons === undefined ? (type === 'mouseReleased' ? 0 : 1) : buttons, clickCount: 1 });
  }
  function centerOf(sel) {
    return js('(function(){var e=Array.prototype.filter.call(document.querySelectorAll(' + JSON.stringify(sel) + '),function(x){return x.getClientRects().length>0;})[0];'
      + 'if(!e)return null;e.scrollIntoView({block:"center",inline:"center"});var r=e.getBoundingClientRect();'
      + 'return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
  }
  function click(sel) {
    return centerOf(sel).then(function (c) {
      if (!c) throw new Error('no element ' + sel);
      return mouse('mouseMoved', c.x, c.y, 0).then(function () { return mouse('mousePressed', c.x, c.y); })
        .then(function () { return mouse('mouseReleased', c.x, c.y); }).then(function () { return delay(250); });
    });
  }
  function typeInto(sel, text) {
    return click(sel).then(function () {
      return js('(function(){var e=Array.prototype.filter.call(document.querySelectorAll(' + JSON.stringify(sel) + '),function(x){return x.getClientRects().length>0;})[0];e.focus();e.select&&e.select();return true;})()');
    }).then(function () { return client.send('Input.insertText', { text: text }); });
  }
  function shot(name) {
    return client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }).then(function (r) {
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.data, 'base64'));
    });
  }
  function scrollToChart() {
    return js('(function(){var s=document.querySelector("svg.chart");if(!s)return false;s.scrollIntoView({block:"start"});window.scrollBy(0,-90);'
      + 'var m=document.querySelector(".main-content");if(m){var t=s.getBoundingClientRect().top;m.scrollTop+=t-90;}return true;})()').then(function () { return delay(200); });
  }
  function settle() {
    return js('new Promise(function(res){var v=document.getElementById("view");if(!v)return res(true);var last=Date.now(),t0=last;'
      + 'var mo=new MutationObserver(function(){last=Date.now();});mo.observe(v,{childList:true,subtree:true});'
      + '(function tick(){var now=Date.now();if(now-last>=500){mo.disconnect();res(true);}else if(now-t0>6000){mo.disconnect();res(false);}else setTimeout(tick,50);})();})');
  }
  function setSel(id, v) {
    return js('(function(){var s=document.getElementById(' + JSON.stringify(id) + ');if(!s)return "NO SELECT";s.value=' + JSON.stringify(v)
      + ';if(s.value!==' + JSON.stringify(v) + ')return "NO OPTION";s.dispatchEvent(new Event("change",{bubbles:true}));return "OK";})()')
      .then(function (r) { return delay(400).then(function () { return r; }); });
  }
  function chooseSite(site) {
    return setSel('psbSiteCompany', site.company).then(function () { return setSel('psbSiteCountry', site.country); })
      .then(function () { return setSel('psbSiteMarketplace', site.marketplace); })
      .then(function () { return waitFor('!!document.querySelector("#view")', 20000); }).then(settle);
  }
  function chooseCategory(name) {
    return js('(function(){var b=Array.prototype.filter.call(document.querySelectorAll("#catBar button, .catbtn, .catmenu-item"),function(x){return x.getClientRects().length&&x.textContent.replace(/\\s+/g," ").trim().indexOf(' + JSON.stringify(name) + ')===0;})[0];'
      + 'if(b){b.click();return "direct";}var more=document.getElementById("catMore");if(more){more.click();return "menu";}return "none";})()')
      .then(function (how) {
        if (how !== 'menu') return how;
        return delay(200).then(function () {
          return js('(function(){var b=Array.prototype.filter.call(document.querySelectorAll(".catmenu-item"),function(x){return x.textContent.replace(/\\s+/g," ").trim().indexOf(' + JSON.stringify(name) + ')===0;})[0];if(!b)return "missing";b.click();return "menu";})()');
        });
      }).then(function (how) { return settle().then(function () { return how; }); });
  }
  function priceView(v) { return click('[data-demo-ctl="priceView-' + v + '"], [id^="priceView-' + v + '-"]').then(settle); }
  function activity(id) {
    return js('(function(){var s=document.querySelector(\'[id^="activitySelect-"]\');if(!s)return "NO SELECT";s.value=' + JSON.stringify(id) + ';s.dispatchEvent(new Event("change",{bubbles:true}));return s.value;})()')
      .then(function (r) { return settle().then(function () { return r; }); });
  }
  function C(cur, ctl) {
    var p = 'section.panel[data-currency="' + cur + '"] ';
    return p + '[data-demo-ctl="' + ctl + '"], ' + p + '[id^="' + ctl + '"]';
  }
  function addCompetitor(cur, name, price) {
    return click(C(cur, 'compAdd')).then(function () { return typeInto(C(cur, 'compName'), name); })
      .then(function () { return typeInto(C(cur, 'compPrice'), price); })
      .then(function () { return click(C(cur, 'compSave')); }).then(settle);
  }
  function layoutChecks(tag, lay) {
    lay.charts.forEach(function (c, i) {
      var nm = tag + ' chart ' + (i + 1) + ' (' + c.currency + ', ' + c.density + ', scale ' + c.scale + ')';
      check('F-2 ' + nm + ': no label leaves the drawing', c.clipped.length === 0, c.clipped.slice(0, 8));
      check('F-2 ' + nm + ': no two labels overlap', c.overlaps.length === 0, c.overlaps.slice(0, 8));
      if (c.minPx.deal !== null) check('F-2 ' + nm + ': deal prices stay >= 13px on screen', c.minPx.deal >= 13 - 0.05, c.minPx);
      if (c.minPx.disc !== null) check('F-2 ' + nm + ': discount lines stay >= 12px on screen', c.minPx.disc >= 12 - 0.05, c.minPx);
      if (c.minPx.head !== null) check('F-2 ' + nm + ': the competitor header stays >= 12px on screen', c.minPx.head >= 12 - 0.05, c.minPx);
    });
  }
  function rightmostChecks(tag, rm, rows) {
    step(tag + ' right-most deal label', rm);
    check('F-2 ' + tag + ': the right-most column has a deal label', !!rm, rm);
    if (!rm) return;
    /* One label can be several price nodes (CO5600 is two): the row is the one at THIS node's everyday price. */
    var reg = (Number(rm.reg) / 100).toFixed(2);
    var row = rows.filter(function (r) { return r.label === rm.label && r.act && r.text.indexOf(reg) >= 0; })[0];
    var tableNum = row && /(\d+\.\d\d)/.exec(row.act) ? /(\d+\.\d\d)/.exec(row.act)[1] : null;
    var chartNum = /^(\d+\.\d\d)/.exec(rm.text || '') ? /^(\d+\.\d\d)/.exec(rm.text)[1] : null;
    check('F-2 ' + tag + ': its deal label prints the full price the table prints (' + rm.label + ' at ' + reg + ')', chartNum !== null && chartNum === tableNum, { chart: rm.text, table: row && row.act });
    check('F-2 ' + tag + ': and the full recorded price (' + rm.recordedC + ' cents)', chartNum !== null && Math.round(Number(chartNum) * 100) === Number(rm.recordedC), { chart: rm.text, recordedC: rm.recordedC });
    check('F-2 ' + tag + ': its deal label and discount line end inside the drawing', rm.labelR <= rm.svgR && (rm.discR === null || rm.discR <= rm.svgR), rm);
    check('F-2 ' + tag + ': its discount line is printed', !!rm.disc && rm.disc.length > 0, rm.disc);
  }

  var portFile = path.join(profile, 'DevToolsActivePort');
  var t0 = Date.now();
  function waitPort() {
    if (fs.existsSync(portFile)) { var p = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]; if (p) return Promise.resolve(p); }
    if (Date.now() - t0 > 20000) return Promise.reject(new Error('Chrome did not open a DevTools port'));
    return delay(100).then(waitPort);
  }
  function load(file, width) {
    return client.send('Emulation.setDeviceMetricsOverride', { width: width, height: 1100, deviceScaleFactor: 1, mobile: false })
      .then(function () { return client.send('Page.navigate', { url: fileUrl(file) }); })
      .then(function () { return waitFor('window.__ready === true', 30000); })
      .then(function () { return js('window.__error'); })
      .then(function (err) { check('the production page mounted with no boot error (' + width + ')', err === null, err); })
      .then(function () { return waitFor('!!document.getElementById("psbSiteCompany")', 20000); });
  }

  var chain = waitPort().then(function (port) {
    return fetch('http://127.0.0.1:' + port + '/json/list').then(function (r) { return r.json(); });
  }).then(function (list) {
    client = cdp(list.filter(function (t) { return t.type === 'page'; })[0].webSocketDebuggerUrl);
    return client.send('Page.enable');
  }).then(function () { return client.send('Runtime.enable'); });

  /* ---- F-2: the R55 P3 chart at three widths, then with a competitor at its right edge ---- */
  WIDTHS.forEach(function (w) {
    chain = chain.then(function () { return load(pageFile, w); })
      .then(function () { return chooseSite(SITE_US); })
      .then(function () { return chooseCategory('Electric Can Opener'); })
      .then(function () { return priceView('activity'); })
      .then(function () { return activity(BFCM_US); })
      .then(scrollToChart)
      .then(function () { return js(LAYOUT_PROBE); })
      .then(function (lay) { step(w + ' BFCM layout', lay); layoutChecks(w + ' BFCM', lay); return Promise.all([js(RIGHTMOST), js(TABLE_ACT)]); })
      .then(function (r) { rightmostChecks(w + ' BFCM', r[0], r[1]); return shot(mode + '-' + w + '-F2-us-amazon-bfcm'); })
      .then(function () { return addCompetitor('USD', 'Rival Long Brand Name Opener Pro', '44.50'); })
      .then(scrollToChart)
      .then(function () { return js(LAYOUT_PROBE); })
      .then(function (lay) {
        step(w + ' BFCM + competitor layout', lay);
        check('F-2 ' + w + ': the competitor header is printed', lay.charts[0] && lay.charts[0].head.length === 1, lay.charts[0] && lay.charts[0].head);
        check('F-2 ' + w + ': the competitor header reads in full', lay.charts[0] && lay.charts[0].head.join(' ').replace(/\s+/g, ' ') === 'Competitors · entered this session · not saved', lay.charts[0] && lay.charts[0].head);
        layoutChecks(w + ' BFCM + competitor', lay);
        return Promise.all([js(RIGHTMOST), js(TABLE_ACT)]);
      })
      .then(function (r) { rightmostChecks(w + ' BFCM + competitor', r[0], r[1]); return shot(mode + '-' + w + '-F2-us-amazon-bfcm-competitor'); })
      /* Competitors are kept per price context (PSB-DEMO-R2), so the everyday view is given its own. */
      .then(function () { return priceView('everyday'); })
      .then(function () { return addCompetitor('USD', 'Rival Long Brand Name Opener Pro', '44.50'); })
      .then(scrollToChart)
      .then(function () { return js(LAYOUT_PROBE); })
      .then(function (lay) {
        step(w + ' everyday + competitor layout', lay);
        check('F-2 ' + w + ' everyday: the competitor header reads in full', lay.charts[0] && lay.charts[0].head.join(' ').replace(/\s+/g, ' ') === 'Competitors · entered this session · not saved', lay.charts[0] && lay.charts[0].head);
        layoutChecks(w + ' everyday + competitor', lay);
        return shot(mode + '-' + w + '-F2-us-amazon-everyday-competitor');
      });
  });

  /* ---- F-2 on the layout-only two-currency / long-name copy, activity view ---- */
  WIDTHS.forEach(function (w) {
    chain = chain.then(function () { return load(synthFile, w); })
      .then(function () { return chooseSite(SITE_CA); })
      .then(function () { return chooseCategory('Electric Can Opener'); })
      .then(function () { return priceView('activity'); })
      .then(function () { return activity(FALL_PRIME_CA); })
      .then(scrollToChart)
      .then(function () { return js(LAYOUT_PROBE); })
      .then(function (lay) {
        step('synth ' + w + ' activity layout', lay);
        check('SYNTH ' + w + ': two currency panels are drawn', lay.panels >= 2, lay.panels);
        layoutChecks('synth ' + w + ' activity', lay);
        return shot(mode + '-' + w + '-F2-synth-two-currencies-activity');
      });
  });

  /* ---- F-1: the activity period, as calendar days, on CA (Fall Prime) at 1440 ---- */
  chain = chain.then(function () { return load(pageFile, 1440); })
    .then(function () { return chooseSite(SITE_CA); })
    .then(function () { return chooseCategory('Electric Can Opener'); })
    .then(function () { return priceView('activity'); })
    .then(function () {
      return js('(function(){var s=document.querySelector(\'[id^="activitySelect-"]\');return s?Array.prototype.map.call(s.options,function(o){return {v:o.value,t:o.textContent};}):null;})()');
    })
    .then(function (opts) {
      step('F-1 activity menu', opts);
      var real = (opts || []).filter(function (o) { return o.v; });
      var fp = real.filter(function (o) { return o.v === FALL_PRIME_CA; })[0];
      var bf = real.filter(function (o) { return /BFCM/.test(o.t); })[0];
      check('F-1 menu: no option prints a raw date string', real.length > 0 && real.every(function (o) { return !/GMT|\d{2}:\d{2}:\d{2}|標準時間/.test(o.t); }), real);
      check('F-1 menu: Fall Prime 2026 reads 2026-10-06 to 2026-10-07', fp && /2026-10-06 to 2026-10-07/.test(fp.t), fp);
      check('F-1 menu: BFCM 2026 reads 2026-11-19 to 2026-11-30', bf && /2026-11-19 to 2026-11-30/.test(bf.t), bf);
      check('F-1 menu: in date order (Fall Prime, October, before BFCM, November)', fp && bf && real.indexOf(fp) < real.indexOf(bf), real.map(function (o) { return o.t; }));
      return activity(FALL_PRIME_CA);
    })
    .then(scrollToChart)
    .then(function () {
      return js('(function(){var g=Array.prototype.filter.call(document.querySelectorAll("svg.chart .col:not(.col-competitor)"),function(x){return x.getAttribute("data-label")==="CO1150"&&x.getAttribute("data-regular-c")==="4799";})[0];'
        + 'var h=g&&(g.querySelector(".mk-activity-group")||g.querySelector(".mk-reg-group"));var r=h?h.getBoundingClientRect():null;return r?{x:r.left+r.width/2,y:r.top+r.height/2}:null;})()');
    })
    .then(function (h) {
      return mouse('mouseMoved', h.x, h.y, 0).then(function () { return delay(300); })
        .then(function () { return js('(function(){var t=document.getElementById("tip");return t&&!t.hidden?t.innerText:null;})()'); });
    })
    .then(function (tip) {
      step('F-1 tooltip CO1150', tip);
      var line = (tip || '').split('\n').filter(function (l) { return /^Activity:/.test(l); })[0] || null;
      check('F-1 tooltip: the activity line reads Fall Prime 2026 2026-10-06 to 2026-10-07', !!line && /Fall Prime 2026.*2026-10-06 to 2026-10-07/.test(line), line);
      check('F-1 tooltip: no raw date string', !!tip && !/GMT|標準時間/.test(tip), tip);
      return shot(mode + '-1440-F1-ca-fallprime-tooltip');
    })
    .then(function () { return mouse('mouseMoved', 5, 5, 0); })
    .then(function () { return js('document.body.innerText'); })
    .then(function (t) {
      check('F-1 page: no raw date string anywhere on the board', !/GMT[+-]\d{4}|標準時間/.test(t || ''), (t || '').match(/.{0,40}GMT.{0,40}/));
      return shot(mode + '-1440-F1-ca-fallprime-menu');
    });

  /* ---- zero writes ---- */
  chain = chain.then(function () {
    return js('(window.__wire&&window.__wire.log)?window.__wire.log.map(function(x){return x.action;}):null');
  }).then(function (wire) {
    step('wire (last page)', wire);
    var reads = /\.get$|^system\.health$|^getClientCapabilities$|siteUniverse/;
    check('W zero writes: every request the page made is a read', Array.isArray(wire) && wire.every(function (a) { return reads.test(a); }), wire);
  });

  chain.then(function () {}, function (e) { check('the run completed without an exception', false, String(e && e.stack || e)); })
    .then(function () {
      var failed = ev.checks.filter(function (c) { return !c.ok; });
      ev.summary = { checks: ev.checks.length, failed: failed.length };
      fs.writeFileSync(path.join(out, 'r3c.json'), JSON.stringify(ev, null, 2));
      console.log('PSB-DEMO-R3 close-out [' + mode + '] ' + (ev.checks.length - failed.length) + '/' + ev.checks.length + ' checks');
      failed.forEach(function (c) { console.log('  FAIL ' + c.name + '  ' + JSON.stringify(c.got).slice(0, 300)); });
      try { chrome.kill(); } catch (e) {}
      if (mode === 'before') Object.keys(BEFORE_FILES).forEach(function (rel) { try { fs.unlinkSync(path.join(ROOT, 'assets', 'tests', BEFORE_FILES[rel])); } catch (e) {} });
      setTimeout(function () { process.exit(mode === 'after' && failed.length ? 1 : 0); }, 300);
    });
}

if (require.main === module) main();
