/**
 * ==================================================================================================
 * PSB-DEMO-R3 — READABILITY, THE ACTIVITY DISCOUNT, WHO IS IN AN ACTIVITY, AND NO PHASING OUT.
 * PERFORMED IN A REAL CHROME ON PRODUCTION'S OWN RESPONSES OF 2026-10-22.
 * ==================================================================================================
 *
 * The page is the production page (buildPage), fed at the socket by `_psb-demo-r3-capture.js`, which
 * serves the exact bodies production returned that morning (ResTW CA, ResUS US Amazon, ResUS US Walmart).
 *
 *   A  at 1920 / 1440 / 820, in the everyday and the activity view: the axis numbers and product labels
 *      are printed at >= 14px ON SCREEN (computed size x the SVG's own scale), no two labels overlap, no
 *      label leaves the drawing, and a drag commits the price under the pointer (no coordinate offset).
 *   B  the discount: "38.39 · 20% off" from the line snapshot; it follows a drag (during and after), a
 *      typed price, the keyboard, Undo and Reset, and the snapshot never moves.
 *   C  ResTW CA · Fall Prime · CO1150 at 47.99: the participants are CO1150-XR and CO1150-ZW, the
 *      photograph is a participant's, and nothing names Burgundy Mist (CO1150-BM) as taking part.
 *   D  Phasing Out is gone: CO2100 keeps only its selling colours (its former photograph CO2100-P is gone),
 *      ResUS Walmart's all-Phasing-Out GM1100 — and with it the whole Grinders category — disappears.
 *   SYNTH (layout only, named as such): a EUR copy of the category with long names — two panels, long labels.
 *
 * MODES  node assets/tests/_psb-demo-r3-runner.js <outDir> [before]
 *   `before` loads psb-board-ui.js, psb-selectors.js, psb-chart-layout.js and the stylesheet AS THEY WERE AT
 *   BASE_REF, from git, as separate git-ignored copies. Nothing shipped is ever written. It photographs and
 *   measures the same screens, and the checks that this round adds are EXPECTED to fail there.
 * Writes <outDir>/r3.json and PNGs. Exits non-zero on any failed check (after mode) or a missing Chrome.
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
var BASE_REF = '70778e82';
var SITE_CA = { company: 'ResTW', country: 'CA', marketplace: 'Amazon' };
var FALL_PRIME_CA = 'CMP-BEEB2104-9';
var BFCM_US = 'CMP-808C4BD5-7';
var WIDTHS = [1920, 1440, 820];
var BEFORE_FILES = {
  'assets/js/product-strategy/psb-board-ui.js': '_psb-r3-before-ui.js',
  'assets/js/product-strategy/psb-selectors.js': '_psb-r3-before-selectors.js',
  'assets/js/product-strategy/psb-chart-layout.js': '_psb-r3-before-layout.js',
  'assets/css/product-strategy-board.css': '_psb-r3-before.css'
};
var SOURCES = ['assets/js/product-strategy/psb-board-ui.js', 'assets/js/product-strategy/psb-selectors.js',
  'assets/js/product-strategy/psb-chart-layout.js', 'assets/css/product-strategy-board.css',
  'assets/tests/_psb-demo-r3-capture.js', 'assets/tests/_psb-demo-r3-prod-data.js', 'assets/tests/_psb-demo-r3-runner.js'];

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
  var pageFile = path.join(ROOT, 'assets', 'tests', '_psb-demo-r3-page' + (synthOn ? '-synth' : '') + '.html');
  fs.writeFileSync(pageFile, html, 'utf8');
  return pageFile;
}

/* ---- in-page probes, as strings ---------------------------------------------------------------- */
/* Every printed label of every chart: its on-screen box and its ON-SCREEN font size (computed px times the
   SVG's own scale), then every pair of labels that overlap and every label that leaves its drawing. */
var LAYOUT_PROBE = '(function(){var out={charts:[]};Array.prototype.forEach.call(document.querySelectorAll("svg.chart"),function(s){'
  + 'var vb=s.viewBox.baseVal,sr=s.getBoundingClientRect(),scale=sr.width/vb.width;'
  + 'var sel=".ytick,.xlabel,.xsub,.mk-activity-label,.mk-activity-disc,.demo-comp-head,.axtitle";'
  + 'var items=[];Array.prototype.forEach.call(s.querySelectorAll(sel),function(t){var txt=(t.textContent||"").trim();if(!txt)return;'
  + 'var b=t.getBoundingClientRect();if(!b.width)return;var cls=String(t.getAttribute("class")).split(" ")[0];'
  + 'items.push({cls:cls,txt:txt.slice(0,40),x:b.left,y:b.top,r:b.right,bo:b.bottom,px:Math.round(parseFloat(getComputedStyle(t).fontSize)*scale*100)/100,fill:getComputedStyle(t).fill});});'
  + 'var ov=[];for(var i=0;i<items.length;i++)for(var j=i+1;j<items.length;j++){var a=items[i],b=items[j];'
  + 'if(a.cls==="axtitle"||b.cls==="axtitle")continue;'
  + 'var w=Math.min(a.r,b.r)-Math.max(a.x,b.x),h=Math.min(a.bo,b.bo)-Math.max(a.y,b.y);if(w>1&&h>1)ov.push(a.cls+":"+a.txt+" x "+b.cls+":"+b.txt);}'
  + 'var clip=items.filter(function(t){return t.x<sr.left-0.5||t.r>sr.right+0.5||t.y<sr.top-0.5||t.bo>sr.bottom+0.5;}).map(function(t){return t.cls+":"+t.txt+" r="+Math.round(t.r)+" svgR="+Math.round(sr.right);});'
  + 'function min(c){var v=items.filter(function(t){return t.cls===c;}).map(function(t){return t.px;});return v.length?Math.min.apply(null,v):null;}'
  + 'out.charts.push({currency:s.getAttribute("data-currency"),density:s.getAttribute("data-density"),scale:Math.round(scale*1000)/1000,vbW:vb.width,renderW:Math.round(sr.width),'
  + 'minPx:{ytick:min("ytick"),xlabel:min("xlabel"),xsub:min("xsub"),deal:min("mk-activity-label"),disc:min("mk-activity-disc")},'
  + 'ytickFill:(items.filter(function(t){return t.cls==="ytick";})[0]||{}).fill||null,'
  + 'labels:items.length,overlaps:ov,clipped:clip,printedX:items.filter(function(t){return t.cls==="xlabel";}).length});});'
  + 'out.panels=document.querySelectorAll("section.panel").length;return out;})()';

/* One node by its label and everyday price, in the first chart that has it. */
function NODE(label, regC) {
  return '(function(){var g=Array.prototype.filter.call(document.querySelectorAll("svg.chart .col:not(.col-competitor)"),function(x){'
    + 'return x.getAttribute("data-label")===' + JSON.stringify(label) + '&&x.getAttribute("data-regular-c")===' + JSON.stringify(String(regC)) + ';})[0];'
    + 'if(!g)return null;var img=g.querySelector("image.mk-img");var lab=g.querySelector(".mk-activity-label"),dis=g.querySelector(".mk-activity-disc");'
    + 'var h=g.querySelector(".mk-activity-group")||g.querySelector(".mk-reg-group");var r=h?h.getBoundingClientRect():null;'
    + 'return {key:g.getAttribute("data-node-key"),state:g.getAttribute("data-activity-state"),basis:g.getAttribute("data-activity-image-basis"),'
    + 'participants:g.getAttribute("data-activity-participants"),image:img?img.getAttribute("href"):null,'
    + 'label:lab?lab.textContent:null,disc:dis?dis.textContent:null,discState:dis?dis.getAttribute("data-discount-state"):null,'
    + 'sim:g.getAttribute("data-sim-c"),handle:r?{x:r.left+r.width/2,y:r.top+r.height/2}:null};})()';
}
var TABLE_ROWS = '(function(){var t=document.getElementById("productTable");if(!t)return [];return Array.prototype.map.call(t.querySelectorAll("tbody tr"),function(r){'
  + 'var im=r.querySelector("img.tfig-img");var a=r.querySelector("td[data-activity-state]");var p=r.querySelector(".tpart");var d=r.querySelector(".tdisc");'
  + 'return {label:r.getAttribute("data-label"),text:r.innerText.replace(/\\s+/g," ").slice(0,260),image:im?im.getAttribute("src"):null,'
  + 'participants:p?p.getAttribute("data-participants"):null,disc:d?d.textContent:null,act:a?a.getAttribute("data-activity-state"):null};});})()';

function main() {
  var out = process.argv[2];
  var mode = process.argv[3] === 'before' ? 'before' : 'after';
  if (!out) { console.error('usage: node _psb-demo-r3-runner.js <outDir> [before]'); process.exit(2); }
  out = path.resolve(out);
  fs.mkdirSync(out, { recursive: true });
  var browser = RUN.findBrowser();
  if (!browser) { console.error('STOP: no Chrome found'); process.exit(3); }
  var ev = { round: 'PSB-DEMO-R3', mode: mode, base_ref: BASE_REF, takenAt: new Date().toISOString(), browser: browser,
    data: 'production 2026-10-22 read-only bodies (docs/evidence/psb-demo-r3/production-read)', sources: {}, steps: [], checks: [] };
  SOURCES.forEach(function (f) { ev.sources[f] = sha(f); });
  var pageFile = buildHtml(mode, false);
  var synthFile = buildHtml(mode, true);

  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-demo-r3-'));
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
  function key(k, code, kc) {
    return client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code, windowsVirtualKeyCode: kc })
      .then(function () { return client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: kc }); })
      .then(function () { return delay(200); });
  }
  function centerOf(sel, index) {
    return js('(function(){var e=Array.prototype.filter.call(document.querySelectorAll(' + JSON.stringify(sel) + '),function(x){return x.getClientRects().length>0;})[' + (index || 0) + '];'
      + 'if(!e)return null;e.scrollIntoView({block:"center",inline:"center"});var r=e.getBoundingClientRect();'
      + 'return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
  }
  function click(sel, index) {
    return centerOf(sel, index).then(function (c) {
      if (!c) throw new Error('no element ' + sel);
      return mouse('mouseMoved', c.x, c.y, 0).then(function () { return mouse('mousePressed', c.x, c.y); })
        .then(function () { return mouse('mouseReleased', c.x, c.y); }).then(function () { return delay(250); });
    });
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
  function layoutChecks(tag, lay) {
    var A = mode === 'after';
    lay.charts.forEach(function (c, i) {
      var nm = tag + ' chart ' + (i + 1) + ' (' + c.currency + ', ' + c.density + ', scale ' + c.scale + ')';
      check('A ' + nm + ': Y axis numbers are >= 14px on screen', c.minPx.ytick !== null && c.minPx.ytick >= 14 - 0.05, c.minPx);
      check('A ' + nm + ': product labels are >= 14px on screen', c.minPx.xlabel !== null && c.minPx.xlabel >= 14 - 0.05, c.minPx);
      check('A ' + nm + ': no two labels overlap', c.overlaps.length === 0, c.overlaps.slice(0, 8));
      check('A ' + nm + ': no label leaves the drawing', c.clipped.length === 0, c.clipped.slice(0, 8));
      if (c.minPx.deal !== null) check('A ' + nm + ': activity prices are >= 13px on screen', c.minPx.deal >= 13 - 0.05, c.minPx);
    });
    return A;
  }
  /* A drag of dy px commits the price the pointer is on: start + dy converted by the axis, to the step. */
  function dragOffsetCheck(tag, label, regC) {
    var before;
    return settle().then(function () { return js(NODE(label, regC)); }).then(function (n) {
      before = n;
      return js('(function(){var s=document.querySelector("svg.chart");var r=s.getBoundingClientRect();var vb=s.viewBox.baseVal;'
        + 'return {lo:+s.getAttribute("data-axis-min-c"),hi:+s.getAttribute("data-axis-max-c"),h:+s.getAttribute("data-plot-h"),scale:r.height/vb.height};})()');
    }).then(function (ax) {
      var dy = -40;
      var perPx = (ax.hi - ax.lo) / (ax.h * ax.scale);
      var expect = Math.round((-dy * perPx) / 100) * 100;
      var p = mouse('mouseMoved', before.handle.x, before.handle.y, 0).then(function () { return mouse('mousePressed', before.handle.x, before.handle.y); });
      for (var i = 1; i <= 4; i++) { (function (k) { p = p.then(function () { return mouse('mouseMoved', before.handle.x, before.handle.y + dy * k / 4); }); }(i)); }
      return p.then(function () { return delay(120); }).then(function () { return mouse('mouseReleased', before.handle.x, before.handle.y + dy); })
        .then(function () { return delay(300); }).then(function () { return js(NODE(label, regC)); })
        .then(function (n) {
          var got = n && n.sim ? (+n.sim - regC) : null;
          check('A ' + tag + ': a 40px drag commits the price under the pointer (no coordinate offset)', got !== null && Math.abs(got - expect) <= 100, { expectDeltaC: expect, gotDeltaC: got });
          return click('[data-demo-ctl="simResetAll"]').catch(function () { return null; });
        });
    });
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

  /* ---- A + C at three widths ---- */
  WIDTHS.forEach(function (w) {
    chain = chain.then(function () { return load(pageFile, w); })
      .then(function () { return chooseSite(SITE_CA); })
      .then(function () { return chooseCategory('Electric Can Opener'); })
      .then(function (how) { step(w + ' category', how); return scrollToChart(); })
      .then(function () { return js(LAYOUT_PROBE); })
      .then(function (lay) { step(w + ' everyday layout', lay); layoutChecks(w + ' everyday', lay); return shot(mode + '-' + w + '-everyday'); })
      .then(function () { return dragOffsetCheck(w + ' everyday', 'CO1150', 4799); })
      .then(function () { return priceView('activity'); })
      .then(function () { return activity(FALL_PRIME_CA); })
      .then(function () { return scrollToChart(); })
      .then(function () { return js(LAYOUT_PROBE); })
      .then(function (lay) { step(w + ' activity layout', lay); layoutChecks(w + ' activity', lay); return shot(mode + '-' + w + '-activity'); })
      .then(function () { return js(NODE('CO1150', 4799)); })
      .then(function (n) {
        step(w + ' CO1150 47.99 in Fall Prime', n);
        check('C ' + w + ': CO1150 at 47.99 is partly in Fall Prime', n && n.state === 'PRICED_PARTIAL', n && n.state);
        check('C ' + w + ': its participants are exactly CO1150-XR and CO1150-ZW', n && n.participants === 'CO1150-XR,CO1150-ZW', n && n.participants);
        check('C ' + w + ': its photograph is a participant’s (CO1150-XR), not Burgundy Mist', n && /CO1150-XR\.jpg$/.test(n.image || ''), n && n.image);
        check('B ' + w + ': its label reads 38.39 * over "20% off"', n && n.label === '38.39 *' && n.disc === '20% off', n && [n.label, n.disc]);
      });
  });

  /* ---- B + C at 1440: tooltip, table, the discount following every way the price can change ---- */
  chain = chain.then(function () { return load(pageFile, 1440); })
    .then(function () { return chooseSite(SITE_CA); })
    .then(function () { return chooseCategory('Electric Can Opener'); })
    .then(function () { return priceView('activity'); })
    .then(function () { return activity(FALL_PRIME_CA); })
    .then(scrollToChart)
    .then(function () { return js(NODE('CO1150', 4799)); })
    .then(function (n) {
      return mouse('mouseMoved', n.handle.x, n.handle.y, 0).then(function () { return delay(300); })
        .then(function () { return js('(function(){var t=document.getElementById("tip");return t&&!t.hidden?t.innerText:null;})()'); })
        .then(function (tip) {
          step('tooltip CO1150 47.99', tip);
          check('C tooltip: lists the participants by SKU', /In this activity: CO1150-XR, CO1150-ZW/.test(tip || ''), tip);
          check('C tooltip: lists the colours not priced in it, BM among them', /Not priced in this activity: .*CO1150-BM/.test(tip || ''), tip);
          check('C tooltip: the photograph line names a participant', /Photograph: CO1150-XR \(a variant in this activity/.test(tip || ''), tip);
          check('C tooltip: the head is a participant, not Burgendy Mist', tip && !/Burgendy Mist\)  \(CO1150\)/.test(tip.split('\n')[0]), tip && tip.split('\n')[0]);
          check('B tooltip: "Discount 20% off (original 47.99 CAD …snapshot)"', /Discount 20% off  \(original 47\.99 CAD/.test(tip || ''), tip);
          return shot(mode + '-1440-activity-tooltip-CO1150');
        })
        .then(function () { return mouse('mouseMoved', 5, 5, 0); });
    })
    .then(function () { return js(TABLE_ROWS); })
    .then(function (rows) {
      step('table rows (Fall Prime)', rows);
      var r = rows.filter(function (x) { return x.participants === 'CO1150-XR,CO1150-ZW'; })[0];
      check('C table: the CO1150 47.99 row lists XR and ZW as participants', !!r, rows.map(function (x) { return x.participants; }));
      check('C table: that row’s photograph and representative are a participant’s', r && /CO1150-XR\.jpg$/.test(r.image || '') && /CO1150-XR/.test(r.text) && !/CO1150-BM/.test(r.text), r);
      check('B table: that row reads 20% off', r && r.disc === '20% off', r && r.disc);
    })
    /* B — drag the deal price down: during the drag and after, the label and the percentage follow. */
    .then(settle)
    .then(function () { return js(NODE('CO1150', 4799)); })
    .then(function (n) {
      var p = mouse('mouseMoved', n.handle.x, n.handle.y, 0).then(function () { return mouse('mousePressed', n.handle.x, n.handle.y); });
      for (var i = 1; i <= 4; i++) { (function (k) { p = p.then(function () { return mouse('mouseMoved', n.handle.x, n.handle.y + 60 * k / 4); }); }(i)); }
      return p.then(function () { return delay(150); })
        .then(function () { return js('(function(){var g=document.querySelector(".mk-activity-group[data-dragging=\\"true\\"]");var ro=document.querySelector(".demo-readout");'
          + 'return {label:g&&g.querySelector(".mk-activity-label")?g.querySelector(".mk-activity-label").textContent:null,disc:g&&g.querySelector(".mk-activity-disc")?g.querySelector(".mk-activity-disc").textContent:null,readout:ro?ro.textContent:null};})()'); })
        .then(function (mid) {
          step('mid-drag', mid);
          var m = /^(\d+\.\d\d)/.exec(mid.label || '');
          var shownC = m ? Math.round(parseFloat(m[1]) * 100) : null;
          var want = shownC === null ? null : (Math.round(((4799 - shownC) * 1000) / 4799) / 10);
          check('B during the drag the label shows the new price, below 38.39', shownC !== null && shownC < 3839, mid);
          check('B during the drag the percentage is recomputed on the 47.99 snapshot', want !== null && mid.disc === (Math.round(want * 10) % 10 === 0 ? String(Math.round(want)) : want.toFixed(1)) + '% off', { mid: mid, want: want });
          check('B the drag readout carries the same percentage', mid.readout && mid.disc && mid.readout.indexOf(mid.disc) >= 0, mid.readout);
          return shot(mode + '-1440-activity-mid-drag').then(function () { return mouse('mouseReleased', n.handle.x, n.handle.y + 60); });
        });
    })
    .then(function () { return delay(400); })
    .then(function () { return js(NODE('CO1150', 4799)); })
    .then(function (n) {
      step('after drag', n);
      var sc = n && n.sim ? +n.sim : null;
      var want = sc === null ? null : Math.round(((4799 - sc) * 1000) / 4799) / 10;
      check('B after the drag the simulated price and its percentage agree', sc !== null && n.disc === (Math.round(want * 10) % 10 === 0 ? String(Math.round(want)) : want.toFixed(1)) + '% off', { sim: sc, disc: n && n.disc });
      return js(TABLE_ROWS);
    })
    .then(function (rows) {
      var r = rows.filter(function (x) { return x.participants === 'CO1150-XR,CO1150-ZW'; })[0];
      check('B the table’s recorded column still reads 20% off (the record did not change)', r && r.disc === '20% off', r && r.disc);
      check('B the table’s simulated column shows the simulated percentage', r && /\d+\.\d\d CAD [\d.]+% off SIMULATED/i.test(r.text), r && r.text);
    })
    /* type an exact price: 35.99 on a 47.99 snapshot is 25% off */
    .then(function () { return js('(function(){var g=Array.prototype.filter.call(document.querySelectorAll("svg.chart .col"),function(x){return x.getAttribute("data-label")==="CO1150"&&x.getAttribute("data-regular-c")==="4799";})[0];g.focus();return true;})()'); })
    .then(function () { return key('Enter', 'Enter', 13); })
    .then(function () { return js('(function(){var i=document.querySelector(\'[data-demo-ctl="simInput"]\');if(!i)return false;i.focus();i.select();return true;})()'); })
    .then(function (okIn) {
      check('B the editor opens for the selected product', okIn === true, okIn);
      return client.send('Input.insertText', { text: '35.99' });
    })
    .then(function () { return key('Enter', 'Enter', 13); })
    .then(function () { return js(NODE('CO1150', 4799)); })
    .then(function (n) {
      check('B typed 35.99: label 35.99 *, 25% off on the 47.99 snapshot', n && n.label === '35.99 *' && n.disc === '25% off', n && [n.label, n.disc]);
      return js('(function(){var g=Array.prototype.filter.call(document.querySelectorAll("svg.chart .col"),function(x){return x.getAttribute("data-label")==="CO1150"&&x.getAttribute("data-regular-c")==="4799";})[0];g.focus();return true;})()');
    })
    .then(function () { return key('ArrowDown', 'ArrowDown', 40); })
    .then(function () { return js(NODE('CO1150', 4799)); })
    .then(function (n) {
      check('B keyboard down one unit: 34.99 *, 27.1% off', n && n.label === '34.99 *' && n.disc === '27.1% off', n && [n.label, n.disc]);
      return click('[data-demo-ctl="simUndo"]');
    })
    .then(function () { return js(NODE('CO1150', 4799)); })
    .then(function (n) {
      check('B Undo: back to 35.99 *, 25% off', n && n.label === '35.99 *' && n.disc === '25% off', n && [n.label, n.disc]);
      return click('[data-demo-ctl="simResetAll"]');
    })
    .then(function () { return js(NODE('CO1150', 4799)); })
    .then(function (n) {
      check('B Reset all: back to the record, 38.39 *, 20% off', n && n.label === '38.39 *' && n.disc === '20% off' && !n.sim, n && [n.label, n.disc, n.sim]);
      return shot(mode + '-1440-activity-after-reset');
    })
    /* D — ResUS US Amazon: CO2100 without its Phasing Out colours; BFCM is now complete for it. */
    .then(function () { return priceView('everyday'); })
    .then(function () { return chooseSite({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }); })
    .then(function () { return chooseCategory('Electric Can Opener'); })
    .then(scrollToChart)
    .then(function () {
      return js('(function(){var t=document.body.innerText;var lst=(t.match(/(\\d+) listings · (\\d+) with a price to plot/)||[]);'
        + 'var c=Array.prototype.filter.call(document.querySelectorAll("svg.chart .col:not(.col-competitor)"),function(x){return x.getAttribute("data-label")==="CO2100";}).map(function(g){var im=g.querySelector("image.mk-img");return {reg:g.getAttribute("data-regular-c"),img:im?im.getAttribute("href"):null,aria:g.getAttribute("aria-label")};});'
        + 'return {listings:lst[1]?+lst[1]:null,plotted:lst[2]?+lst[2]:null,co2100:c,pageHasPhasingSku:/CO2100-P\\b|CO2100-R1\\b|CO2100-T\\b/.test(t)};})()');
    })
    .then(function (d) {
      step('D ResUS Amazon', d);
      check('D ResUS Amazon: 97 listings (100 less the three Phasing Out)', d.listings === 97, d.listings);
      check('D no Phasing Out SKU is named anywhere on the page', d.pageHasPhasingSku === false, d.pageHasPhasingSku);
      return js(TABLE_ROWS);
    })
    .then(function (rows) {
      /* The Phasing Out CO2100-P and the selling CO2102-P share one image FILE, so the file cannot tell them
         apart; the representative SKU can. */
      var r = rows.filter(function (x) { return x.label === 'CO2100' && /34\.99 USD/.test(x.text); })[0];
      step('D CO2100 34.99 row', r);
      check('D CO2100 at 34.99: 3 colours, represented by the selling CO2102-P (it was the Phasing Out CO2100-P)',
        r && / CO2102-P 3 /.test(r.text) && !/CO2100-P/.test(r.text), r && r.text);
      return shot(mode + '-1440-D-resus-amazon-everyday');
    })
    .then(function () { return priceView('activity'); })
    .then(function () { return activity(BFCM_US); })
    .then(function () { return js(TABLE_ROWS); })
    .then(function (rows) {
      var r = rows.filter(function (x) { return x.label === 'CO2100' && /34\.99/.test(x.text); })[0];
      step('D CO2100 in BFCM', r);
      check('D BFCM: CO2100 is complete (no "some variants") once the Phasing Out colours are gone', r && r.act === 'PRICED' && !/SOME VARIANTS|some variants/.test(r.text), r);
      return shot(mode + '-1440-D-resus-amazon-bfcm');
    })
    .then(function () { return priceView('everyday'); })
    .then(function () { return chooseSite({ company: 'ResUS', country: 'US', marketplace: 'Walmart' }); })
    .then(function () {
      return js('(function(){var t=document.body.innerText;var cats=Array.prototype.map.call(document.querySelectorAll("#catBar button, .catmenu-item"),function(x){return x.textContent.replace(/\\s+/g," ").trim();});'
        + 'var lst=(t.match(/(\\d+) listings/)||[]);return {listings:lst[1]?+lst[1]:null,cats:cats,gm1100:/GM1100/.test(t),grinders:/Grinders/.test(t)};})()');
    })
    .then(function (d) {
      step('D ResUS Walmart', d);
      check('D ResUS Walmart: 15 listings (18 less GM1100’s three colours)', d.listings === 15, d.listings);
      check('D GM1100 is nowhere on the page, and neither is the Grinders category it alone made up', d.gm1100 === false && d.grinders === false, d);
      return shot(mode + '-1440-D-resus-walmart');
    })
    /* D — the exclusion is STATED on Data Quality, and an unreadable lifecycle has its own named row. */
    .then(function () { return click('#nav-quality, [data-view="quality"]').catch(function () { return null; }); })
    .then(settle)
    .then(function () {
      return js('(function(){var p=document.getElementById("dqPhasingOut");var b=document.querySelector(\'#dqBuckets .dqrow[data-bucket="lifecycle_missing_or_unrecognised"]\');'
        + 'return {note:p?p.textContent:null,count:p?p.getAttribute("data-count"):null,bucket:b?b.getAttribute("data-count"):null};})()');
    })
    .then(function (q) {
      step('D Data Quality (ResUS Walmart)', q);
      check('D Data Quality states 3 Phasing Out SKUs excluded on ResUS Walmart', q && q.count === '3', q);
      check('D Data Quality has a named lifecycle row (0 here: every production lifecycle is readable)', q && q.bucket === '0', q);
      return shot(mode + '-1440-D-resus-walmart-data-quality');
    });

  /* ---- SYNTH: two currency panels and long labels, layout only ---- */
  WIDTHS.forEach(function (w) {
    chain = chain.then(function () { return load(synthFile, w); })
      .then(function () { return chooseSite(SITE_CA); })
      .then(function () { return chooseCategory('Electric Can Opener'); })
      .then(scrollToChart)
      .then(function () { return js(LAYOUT_PROBE); })
      .then(function (lay) {
        step('synth ' + w, lay);
        check('SYNTH ' + w + ': two currency panels are drawn', lay.panels >= 2, lay.panels);
        layoutChecks('synth ' + w, lay);
        return shot(mode + '-' + w + '-synth-two-currencies-long-labels');
      });
  });

  /* ---- zero writes: the replay logs every request; nothing write-shaped may appear ---- */
  chain = chain.then(function () {
    return js('(window.__wire&&window.__wire.log)?window.__wire.log.map(function(x){return x.action;}):null');
  }).then(function (wire) {
    step('wire (last page)', wire);
    var reads = /\.get$|^system\.health$|^getClientCapabilities$|siteUniverse/;
    check('zero writes: every request the page made is a read', Array.isArray(wire) && wire.every(function (a) { return reads.test(a); }), wire);
  });

  chain.then(function () {}, function (e) { check('the run completed without an exception', false, String(e && e.stack || e)); })
    .then(function () {
      var failed = ev.checks.filter(function (c) { return !c.ok; });
      ev.summary = { checks: ev.checks.length, failed: failed.length };
      fs.writeFileSync(path.join(out, 'r3.json'), JSON.stringify(ev, null, 2));
      console.log('PSB-DEMO-R3 [' + mode + '] ' + (ev.checks.length - failed.length) + '/' + ev.checks.length + ' checks');
      failed.forEach(function (c) { console.log('  FAIL ' + c.name + '  ' + JSON.stringify(c.got).slice(0, 300)); });
      try { chrome.kill(); } catch (e) {}
      if (mode === 'before') Object.keys(BEFORE_FILES).forEach(function (rel) { try { fs.unlinkSync(path.join(ROOT, 'assets', 'tests', BEFORE_FILES[rel])); } catch (e) {} });
      setTimeout(function () { process.exit(mode === 'after' && failed.length ? 1 : 0); }, 300);
    });
}

if (require.main === module) main();
