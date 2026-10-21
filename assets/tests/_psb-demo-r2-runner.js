/**
 * ==================================================================================================
 * PSB-DEMO-R2 — TWO BOUNDARIES, PERFORMED IN A REAL BROWSER: CURRENCY ISOLATION AND THE DRAG LIFECYCLE
 * ==================================================================================================
 *
 * The same production page as PSB-DEMO-R1 (buildPage, the capture at the socket, real-shape campaign
 * lines), plus `_psb-demo-r2-capture.js`, which gives one site and one category a USD panel AND a EUR
 * panel. Chrome is driven over the DevTools protocol with real pointer and key events.
 *
 * PART 1 — CURRENCY. A competitor entered in the USD panel must never appear in the EUR panel, nor move
 * the EUR axis, through add, edit, delete and an activity switch. Every control id on the page must be
 * unique, and a control in one panel must act on that panel only.
 *
 * PART 2 — THE DRAG LIFECYCLE. Press and move a price point WITHOUT releasing, then
 *   (a) leave the page (the host's onUnmount, the call KM.lifecycle makes), and come back;
 *   (b) switch the price context the drag belongs to;
 *   (c) rebuild the chart (a zoom change).
 * After each: no drag is left behind, no readout, no pointer capture, the document's keydown listeners
 * are back to their count before the press, an Escape reaches the rest of the page un-prevented, the
 * release commits nothing — and the next ordinary drag still works and still commits. A completed
 * simulation keeps the lifecycle it always had (it survives leave/return in memory).
 *
 * USAGE   node assets/tests/_psb-demo-r2-runner.js <outDir>
 * Writes <outDir>/demo-r2.json and PNGs. Exits non-zero on any failed check or a missing Chrome.
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

function sha(f) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}
function fileUrl(p) {
  return 'file:///' + path.resolve(p).replace(/\\/g, '/').replace(/ /g, '%20')
    .replace(/#/g, '%23').replace(/\?/g, '%3F');
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
        setTimeout(function () { if (pending[my]) { delete pending[my]; rej(new Error('CDP timeout: ' + method)); } }, 20000);
      });
    });
  }
  return { send: send, close: function () { try { ws.close(); } catch (e) {} } };
}

var SOURCES = ['assets/js/product-strategy/psb-board-ui.js', 'assets/js/product-strategy/psb-selectors.js',
  'assets/css/product-strategy-board.css', 'assets/tests/_psb-demo-capture.js',
  'assets/tests/_psb-demo-r2-capture.js', 'assets/tests/_psb-demo-r2-runner.js'];

/* Each removes ONE piece of the R2 fix. A mutant is caught when at least one check fails. */
var MUTANTS = {
  PREFIX: { why: 'the counter-example: the UI exactly as it was before PSB-DEMO-R2 (c0f0f6fa)', gitRef: 'c0f0f6fa' },
  M1: { why: 'the competitor key drops the currency again',
    find: "return demoSiteKey() + '|' + (category || '') + '|' + (currency || '') + '|' + demoPriceCtx();",
    repl: "return demoSiteKey() + '|' + (category || '') + '|' + demoPriceCtx();" },
  M2: { why: 'the open form is shown in every panel',
    find: "var formHere = DEMO.compFormOpen && DEMO.compFormCur === CUR;", repl: "var formHere = DEMO.compFormOpen;" },
  M3: { why: 'control ids no longer name their panel',
    find: "function cid(node, role) { node.id = role + '-' + CUR;", repl: "function cid(node, role) { node.id = role;" },
  M4: { why: 'the cancel forgets to remove the drag keydown listener',
    find: "if (d.onKey) { try { document.removeEventListener('keydown', d.onKey, true); } catch (e) {} }", repl: "" },
  M5: { why: 'leaving the page does not end the drag',
    find: "demoCancelDrag();   // PSB-DEMO-R2 — leaving mid-drag leaves no listener, capture or readout behind", repl: "" },
  M6: { why: 'a chart rebuild does not end the drag',
    find: "demoCancelDrag();   // PSB-DEMO-R2 — the chart a drag was on is about to be rebuilt", repl: "" }
};
module.exports = { MUTANTS: MUTANTS };

function main() {
  var out = process.argv[2];
  if (!out) { console.error('usage: node _psb-demo-r2-runner.js <outDir>'); process.exit(2); }
  out = path.resolve(out);
  fs.mkdirSync(out, { recursive: true });
  var browser = RUN.findBrowser();
  if (!browser) { console.error('STOP: no Chrome found'); process.exit(3); }

  var ev = { round: 'PSB-DEMO-R2', takenAt: new Date().toISOString(), browser: browser,
    sources: {}, steps: [], checks: [] };
  SOURCES.forEach(function (f) { ev.sources[f] = sha(f); });
  var html = RUN.buildPage({ view: 'category', activated: true });
  var anchor = '<script src="assets/tests/_p1b8c-capture.js"></script>';
  if (html.indexOf(anchor) < 0) { console.error('STOP: capture script tag not found'); process.exit(4); }
  html = html.replace(anchor, anchor + '\n  <script src="assets/tests/_psb-demo-capture.js"></script>'
    + '\n  <script src="assets/tests/_psb-demo-r2-capture.js"></script>');
  /* MUTATION MODE. PSB_R2_MUTANT=<id> loads a MUTATED COPY of psb-board-ui.js in place of the real one.
     The shipped source is never written: the copy is a separate, git-ignored file, removed after the run. */
  var MUT = process.env.PSB_R2_MUTANT || '';
  var mutFile = null;
  if (MUT) {
    var M = MUTANTS[MUT];
    if (!M) { console.error('STOP: unknown mutant ' + MUT); process.exit(5); }
    mutFile = path.join(ROOT, 'assets', 'tests', '_psb-r2-mutant-ui.js');
    if (M.gitRef) {
      /* PREFIX — the whole UI as it was before this round, read from git, never checked out. */
      fs.writeFileSync(mutFile, cp.execFileSync('git', ['show', M.gitRef + ':assets/js/product-strategy/psb-board-ui.js'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }), 'utf8');
    } else {
      var uiSrc = fs.readFileSync(path.join(ROOT, 'assets/js/product-strategy/psb-board-ui.js'), 'utf8').replace(/\r\n/g, '\n');
      if (uiSrc.split(M.find).length !== 2) { console.error('STOP: mutant anchor not unique: ' + MUT); process.exit(6); }
      fs.writeFileSync(mutFile, uiSrc.replace(M.find, M.repl), 'utf8');
    }
    var tag = '<script src="assets/js/product-strategy/psb-board-ui.js">';
    if (html.split(tag).length !== 2) { console.error('STOP: ui script tag not found'); process.exit(7); }
    html = html.replace(tag, '<script src="assets/tests/_psb-r2-mutant-ui.js">');
    ev.mutant = MUT;
    ev.mutantWhy = M.why;
    ev.mutantSourceSha = crypto.createHash('sha256').update(fs.readFileSync(mutFile, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
  }
  var pageFile = path.join(ROOT, 'assets', 'tests', '_psb-demo-r2-page.html');
  fs.writeFileSync(pageFile, html, 'utf8');

  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-demo-r2-'));
  var chrome = cp.spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' });
  var client = null;

  function check(name, ok, got) { ev.checks.push({ name: name, ok: !!ok, got: got === undefined ? null : got }); }
  function step(name, data) { ev.steps.push({ name: name, data: data === undefined ? null : data }); }
  function js(expr) {
    return client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
      .then(function (r) {
        if (r.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
        return r.result.value;
      });
  }
  function waitFor(expr, ms) {
    var t0 = Date.now();
    function loop() {
      return js(expr).then(function (v) {
        if (v) return v;
        if (Date.now() - t0 > (ms || 15000)) throw new Error('timed out waiting for ' + expr);
        return delay(100).then(loop);
      });
    }
    return loop();
  }
  function mouse(type, x, y, buttons) {
    return client.send('Input.dispatchMouseEvent', { type: type, x: x, y: y, button: 'left',
      buttons: buttons === undefined ? (type === 'mouseReleased' ? 0 : 1) : buttons, clickCount: 1 });
  }
  function escKey() {
    return client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      .then(function () { return client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); })
      .then(function () { return delay(120); });
  }
  /* A control inside ONE panel: the R2 role attribute, or the R1 id, scoped to the panel either way. */
  function P(cur, ctl) {
    var p = 'section.panel[data-currency="' + cur + '"] ';
    return p + '[data-demo-ctl="' + ctl + '"], ' + p + '#' + ctl;
  }
  function centerOf(sel, index) {
    return js('(function(){var e=document.querySelectorAll(' + JSON.stringify(sel) + ')[' + (index || 0) + '];'
      + 'if(!e)return null;e.scrollIntoView({block:"center",inline:"center"});var r=e.getBoundingClientRect();'
      + 'return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()');
  }
  function click(sel, index) {
    return centerOf(sel, index).then(function (c) {
      if (!c) throw new Error('no element ' + sel);
      return mouse('mouseMoved', c.x, c.y, 0).then(function () { return mouse('mousePressed', c.x, c.y); })
        .then(function () { return mouse('mouseReleased', c.x, c.y); }).then(function () { return delay(150); });
    });
  }
  function typeInto(sel, text) {
    return click(sel).then(function () {
      return js('(function(){var e=document.querySelectorAll(' + JSON.stringify(sel) + ')[0];e.focus();e.select&&e.select();return true;})()');
    }).then(function () { return client.send('Input.insertText', { text: text }); });
  }
  function shot(name) {
    return client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }).then(function (r) {
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.data, 'base64'));
    });
  }
  /* The listeners actually attached to document and window, by the browser's own account. */
  function listeners() {
    function on(expr) {
      return client.send('Runtime.evaluate', { expression: expr }).then(function (r) {
        return client.send('DOMDebugger.getEventListeners', { objectId: r.result.objectId, depth: 0, objectGroup: 'r2-listeners' });
      }).then(function (l) {
        var o = { keydown: 0, keydownCapture: 0, pointer: 0, keydownWho: [] };
        l.listeners.forEach(function (x) {
          if (x.type === 'keydown') {
            o.keydown++; if (x.useCapture) o.keydownCapture++;
            o.keydownWho.push((x.useCapture ? 'capture ' : 'bubble ') + 'script ' + x.scriptId + ':' + x.lineNumber + ' '
              + String((x.handler && x.handler.description) || '').replace(/\s+/g, ' ').slice(0, 90));
          }
          if (/^pointer/.test(x.type)) o.pointer++;
        });
        return o;
      });
    }
    return Promise.all([on('document'), on('window')]).then(function (a) { return { document: a[0], window: a[1] }; });
  }
  var PANEL_READ = function (cur) {
    return '(function(){var p=document.querySelector(\'section.panel[data-currency="' + cur + '"]\');if(!p)return null;'
      + 'var s=p.querySelector("svg.chart");'
      + 'function attrs(sel,names){return Array.prototype.map.call(p.querySelectorAll(sel),function(e){var o={};names.forEach(function(n){o[n]=e.getAttribute(n);});return o;});}'
      + 'return {axis:s?{lo:s.getAttribute("data-axis-min-c"),hi:s.getAttribute("data-axis-max-c"),step:s.getAttribute("data-tick-step-c"),'
      + 'ticks:Array.prototype.map.call(s.querySelectorAll(".ytick"),function(t){return t.getAttribute("data-tick-c");}).join(",")}:null,'
      + 'comps:attrs(".col-competitor",["data-competitor-id","data-price-c","data-currency"]),'
      + 'chips:attrs(".demo-chip",["data-competitor-id"]),'
      + 'form:!!p.querySelector(\'[data-demo-ctl="compForm"], #compForm\'),'
      + 'sims:attrs(".col[data-sim-c]",["data-node-key","data-sim-c"]),'
      + 'cols:p.querySelectorAll(".col:not(.col-competitor)").length};})()';
  };
  var PAGE_READ = '(function(){var v=document.getElementById("view");var seen={},dup=[];'
    + 'var dseen={},ddup=[];Array.prototype.forEach.call(document.querySelectorAll("[id]"),function(e){if(seen[e.id]){if(dup.indexOf(e.id)<0)dup.push(e.id);}seen[e.id]=1;});Array.prototype.forEach.call(document.querySelectorAll(".demo-ctl [id], .demo-ctl[id]"),function(e){if(dseen[e.id]){if(ddup.indexOf(e.id)<0)ddup.push(e.id);}dseen[e.id]=1;});'
    + 'var c=KM.pages.productStrategyBoard.lastController;var rows=c&&c.adapter?c.adapter.loadCanonical().rows:[];'
    + 'var s=JSON.stringify(rows),h1=2166136261>>>0,h2=0;for(var i=0;i<s.length;i++){h1=Math.imul(h1^s.charCodeAt(i),16777619)>>>0;h2=(h2*31+s.charCodeAt(i))>>>0;}'
    + 'return {dupIds:ddup, chartControlDupIds:dup.filter(function(i){return ddup.indexOf(i)<0;}), panels:Array.prototype.map.call(document.querySelectorAll("section.panel"),function(p){return p.getAttribute("data-currency");}),'
    + 'dragging:document.querySelectorAll("[data-dragging]").length, readouts:document.querySelectorAll(".demo-readout").length,'
    + 'demo:(window.PSB_BOARD&&PSB_BOARD.demoState)?PSB_BOARD.demoState():null,'
    + 'esc:window.__esc, sentinel:window.__sentinel, canonicalHash:(h1.toString(16)+"-"+h2.toString(16)+"-"+s.length),'
    + 'wire:(window.__wire&&window.__wire.log)?window.__wire.log.map(function(x){return x.action;}):null, net:window.__net||null,'
    + 'storage:{local:(function(){try{return localStorage.length;}catch(e){return "n/a";}})(),session:(function(){try{return sessionStorage.length;}catch(e){return "n/a";}})()},'
    + 'url:location.href.split("/").pop(), uncaught:window.__uncaught||null};})()';
  function readPanels() {
    return Promise.all([js(PANEL_READ('USD')), js(PANEL_READ('EUR')), js(PAGE_READ)])
      .then(function (a) { return { USD: a[0], EUR: a[1], page: a[2] }; });
  }
  /* Press a price point and move it, WITHOUT releasing. Returns where the pointer is. */
  function pressAndMove(sel, index, dyPx) {
    return centerOf(sel, index).then(function (c) {
      if (!c) throw new Error('no drag handle ' + sel);
      var p = mouse('mouseMoved', c.x, c.y, 0).then(function () { return mouse('mousePressed', c.x, c.y); });
      for (var i = 1; i <= 4; i++) {
        (function (k) { p = p.then(function () { return mouse('mouseMoved', c.x, c.y + dyPx * k / 4); }); }(i));
      }
      return p.then(function () { return delay(120); }).then(function () { return { x: c.x, y: c.y + dyPx }; });
    });
  }
  /* Same wait as the R1 runner (see there): before a drag whose COMMIT is asserted, the chart must have
     stopped rebuilding for 500 ms, so a late repaint cannot end it. The interrupted-drag cases do not
     wait: there a rebuild ending the drag is the point. Never settling is a failure, not a skip. */
  function settle() {
    return js('new Promise(function(res){var v=document.getElementById("view");var last=Date.now(),t0=last;'
      + 'var mo=new MutationObserver(function(){last=Date.now();});mo.observe(v,{childList:true});'
      + '(function tick(){var now=Date.now();if(now-last>=500){mo.disconnect();res(true);}else if(now-t0>5000){mo.disconnect();res(false);}else setTimeout(tick,50);})();})')
      .then(function (q) { if (!q) throw new Error('the chart never stopped rebuilding (5 s) before a drag'); });
  }
  function fullDrag(sel, index, dyPx) {
    return settle().then(function () { return pressAndMove(sel, index, dyPx); }).then(function (at) {
      return mouse('mouseReleased', at.x, at.y).then(function () { return delay(200); });
    });
  }
  function simsIn(demo) {
    var n = 0;
    Object.keys((demo && demo.sims) || {}).forEach(function (k) { n += Object.keys(demo.sims[k]).length; });
    return n;
  }
  var NET_MONITOR = '(function(){window.__net={fetch:[],xhr:[],beacon:[]};window.__uncaught=[];window.addEventListener("error",function(e){window.__uncaught.push(String(e.message)+" @"+e.lineno+":"+e.colno+" "+String(e.filename||"").split("/").pop());});'
    + 'var f=window.fetch;window.fetch=function(u,o){window.__net.fetch.push({url:String(u&&u.url||u).slice(0,200),method:(o&&o.method)||"GET"});return f.apply(this,arguments);};'
    + 'var X=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){window.__net.xhr.push({url:String(u).slice(0,200),method:m});return X.apply(this,arguments);};'
    + 'if(navigator.sendBeacon){var B=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u){window.__net.beacon.push(String(u).slice(0,200));return B.apply(null,arguments);};}'
    /* THE REST OF THE PAGE: another component's capture listener on document, registered first, and a
       bubbling listener on window that records whether an Escape arrived and whether anything prevented it. */
    + 'window.__sentinel=0;document.addEventListener("keydown",function(e){if(e.key==="Escape")window.__sentinel++;},true);'
    + 'window.__esc=[];window.addEventListener("keydown",function(e){if(e.key==="Escape")window.__esc.push({prevented:e.defaultPrevented});});'
    + '})();';

  var USD_PT = 'section.panel[data-currency="USD"] .col:not(.col-competitor) .mk-reg-group';
  var first = null, done = false, base = null;
  var portFile = path.join(profile, 'DevToolsActivePort');
  var t0 = Date.now();
  function waitPort() {
    if (fs.existsSync(portFile)) {
      var p = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
      if (p) return Promise.resolve(p);
    }
    if (Date.now() - t0 > 20000) return Promise.reject(new Error('Chrome did not open a DevTools port'));
    return delay(100).then(waitPort);
  }
  function waitBoard() {
    return waitFor('!!document.querySelector(\'section.panel[data-currency="USD"] svg.chart\') && !!document.querySelector(\'section.panel[data-currency="EUR"] svg.chart\')', 30000)
      .then(function () { return delay(250); });
  }
  /* After an interrupted drag: everything the drag owned is gone, and the page is as it was before it. */
  function afterInterrupt(label, before) {
    return readPanels().then(function (r) {
      return listeners().then(function (l) {
        check(label + ': no drag is left behind (state, attribute, readout)',
          r.page.demo && r.page.demo.dragging === false && r.page.dragging === 0 && r.page.readouts === 0,
          { dragging: r.page.demo && r.page.demo.dragging, attr: r.page.dragging, readouts: r.page.readouts });
        check(label + ': the document keydown listeners are back to their count before the press',
          l.document.keydown === before.document.keydown && l.window.keydown === before.window.keydown, { before: before, after: l });
        return l;
      });
    }).then(function () {
      return js('window.__esc.length').then(function (n0) {
        return js('window.__sentinel').then(function (s0) {
          return escKey().then(function () { return js('({esc:window.__esc.slice(' + n0 + '),sentinel:window.__sentinel})'); })
            .then(function (e) {
              check(label + ': the next Escape reaches the page and nothing prevents it',
                e.esc.length === 1 && e.esc[0].prevented === false, e.esc);
              check(label + ': another component’s document capture listener still fires', e.sentinel === s0 + 1, [s0, e.sentinel]);
            });
        });
      });
    });
  }

  waitPort().then(function (port) {
    return fetch('http://127.0.0.1:' + port + '/json/list').then(function (r) { return r.json(); });
  }).then(function (list) {
    var page = list.filter(function (t) { return t.type === 'page'; })[0];
    client = cdp(page.webSocketDebuggerUrl);
    return client.send('Page.enable');
  }).then(function () { return client.send('Runtime.enable'); })
    .then(function () { return client.send('DOM.enable'); })
    .then(function () { return client.send('Page.addScriptToEvaluateOnNewDocument', { source: NET_MONITOR }); })
    .then(function () { return client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }); })
    .then(function () { return client.send('Page.navigate', { url: fileUrl(pageFile) }); })
    .then(function () { return waitFor('window.__ready === true && !!document.querySelector("svg.chart")', 30000); })
    .then(function () { return js('window.__error'); })
    .then(function (err) {
      check('the production page mounted with no boot error', err === null, err);
      return waitBoard();
    })
    .then(readPanels)
    .then(function (r) {
      first = r;
      step('mounted', { panels: r.page.panels, usdAxis: r.USD.axis, eurAxis: r.EUR.axis, dupIds: r.page.dupIds,
        preexistingChartControlDupIds: r.page.chartControlDupIds });
      check('one site and one category draw a USD panel and a EUR panel', r.USD && r.EUR && r.USD.cols > 0 && r.EUR.cols > 0, r.page.panels);
      check('every demo control id is unique (two panels do not share a control id)', r.page.dupIds.length === 0, r.page.dupIds);
      return shot('r2-01-two-panels');
    })
    // ================================ PART 1 — CURRENCY ================================
    .then(function () { return click(P('USD', 'compAdd')); })
    .then(readPanels)
    .then(function (r) {
      check('Add competitor in the USD panel opens a form in the USD panel only', r.USD.form === true && r.EUR.form === false, { usd: r.USD.form, eur: r.EUR.form });
      return typeInto(P('USD', 'compName'), 'Rival U');
    })
    .then(function () { return typeInto(P('USD', 'compPrice'), '27.50'); })
    .then(function () { return click(P('USD', 'compSave')); })
    .then(readPanels)
    .then(function (r) {
      step('USD competitor added', { usd: r.USD.comps, eur: r.EUR.comps, demo: r.page.demo && r.page.demo.competitors });
      check('add: the USD competitor is drawn in the USD panel', r.USD.comps.length === 1 && r.USD.comps[0]['data-price-c'] === '2750', r.USD.comps);
      check('add: the EUR panel shows no competitor and no chip', r.EUR.comps.length === 0 && r.EUR.chips.length === 0, { comps: r.EUR.comps, chips: r.EUR.chips });
      check('add: the EUR axis did not move', JSON.stringify(r.EUR.axis) === JSON.stringify(first.EUR.axis), { before: first.EUR.axis, after: r.EUR.axis });
      var comps = (r.page.demo && r.page.demo.competitors) || {};
      var keys = Object.keys(comps);
      check('add: the competitor is filed under a key that names its currency, and carries that currency',
        keys.length === 1 && /\|USD(\||$)/.test(keys[0]) && comps[keys[0]].every(function (c) { return c.currency === 'USD'; }), comps);
      return click(P('USD', 'competitorList') + ' [data-action="edit"], section.panel[data-currency="USD"] .demo-chip [data-action="edit"]');
    })
    .then(readPanels)
    .then(function (r) {
      check('Edit in the USD panel opens the form in the USD panel only', r.USD.form === true && r.EUR.form === false, { usd: r.USD.form, eur: r.EUR.form });
      return typeInto(P('USD', 'compPrice'), '5.00');
    })
    .then(function () { return click(P('USD', 'compSave')); })
    .then(readPanels)
    .then(function (r) {
      check('edit: the USD competitor moved to 5.00 in the USD panel', r.USD.comps.length === 1 && r.USD.comps[0]['data-price-c'] === '500', r.USD.comps);
      check('edit: the EUR panel still shows no competitor and its axis did not move',
        r.EUR.comps.length === 0 && JSON.stringify(r.EUR.axis) === JSON.stringify(first.EUR.axis), { comps: r.EUR.comps, axis: r.EUR.axis });
      return click('section.panel[data-currency="USD"] .demo-chip [data-action="delete"]');
    })
    .then(readPanels)
    .then(function (r) {
      check('delete: the USD competitor is gone', r.USD.comps.length === 0 && r.USD.chips.length === 0, r.USD.comps);
      check('delete: the EUR panel and axis are as they were', r.EUR.comps.length === 0 && JSON.stringify(r.EUR.axis) === JSON.stringify(first.EUR.axis), r.EUR.axis);
      return click(P('USD', 'compAdd'));
    })
    .then(function () { return typeInto(P('USD', 'compName'), 'Rival U'); })
    .then(function () { return typeInto(P('USD', 'compPrice'), '27.50'); })
    .then(function () { return click(P('USD', 'compSave')); })
    .then(function () { return click(P('USD', 'priceView-activity')); })
    .then(function () {
      return js('(function(){var s=document.querySelectorAll(' + JSON.stringify(P('USD', 'activitySelect')) + ')[0];s.value="CMP-PBDD-2026";s.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
    })
    .then(function () { return delay(250); })
    .then(readPanels)
    .then(function (r) {
      base = r;
      check('activity: both panels follow the one price view', r.page.demo && r.page.demo.priceView === 'activity' && r.page.demo.activityId === 'CMP-PBDD-2026', r.page.demo && r.page.demo.priceView);
      check('activity: no everyday competitor in either panel', r.USD.comps.length === 0 && r.EUR.comps.length === 0, null);
      return click(P('EUR', 'compAdd'));
    })
    .then(readPanels)
    .then(function (r) {
      check('Add competitor in the EUR panel opens a form in the EUR panel only', r.EUR.form === true && r.USD.form === false, { usd: r.USD.form, eur: r.EUR.form });
      return typeInto(P('EUR', 'compName'), 'Rival E');
    })
    .then(function () { return typeInto(P('EUR', 'compPrice'), '9.00'); })
    .then(function () { return click(P('EUR', 'compSave')); })
    .then(readPanels)
    .then(function (r) {
      check('activity: the EUR competitor is in the EUR panel only', r.EUR.comps.length === 1 && r.USD.comps.length === 0, { eur: r.EUR.comps, usd: r.USD.comps });
      check('activity: the USD axis did not move for a EUR competitor', JSON.stringify(r.USD.axis) === JSON.stringify(base.USD.axis), { before: base.USD.axis, after: r.USD.axis });
      return click(P('EUR', 'priceView-everyday'));
    })
    .then(readPanels)
    .then(function (r) {
      check('back to everyday: USD has its competitor, EUR has none', r.USD.comps.length === 1 && r.EUR.comps.length === 0, { usd: r.USD.comps, eur: r.EUR.comps });
      check('back to everyday: the EUR axis is the one it started with', JSON.stringify(r.EUR.axis) === JSON.stringify(first.EUR.axis), r.EUR.axis);
      check('every demo control id is still unique with forms and chips on screen', r.page.dupIds.length === 0, r.page.dupIds);
      return shot('r2-02-currency-isolated');
    })
    .then(function () { return click('section.panel[data-currency="USD"] .demo-chip [data-action="delete"]'); })
    // ================================ PART 2 — THE DRAG LIFECYCLE ================================
    .then(function () { return fullDrag(USD_PT, 1, -60); })
    .then(readPanels)
    .then(function (r) {
      check('a completed drag commits one simulation (the lifecycle it always had)', simsIn(r.page.demo) === 1, r.page.demo && r.page.demo.sims);
      return listeners();
    })
    .then(function (l0) {
      step('listeners at rest', l0);
      // ---- (a) leave the page mid-drag, and come back ----
      return pressAndMove(USD_PT, 0, 50).then(function (at) {
        return js('PSB_BOARD.demoState().dragging').then(function (dragging) {
          return listeners().then(function (lDuring) {
            check('mid-drag: a drag is under way before leaving', dragging === true, dragging);
            step('listeners during the drag', lDuring);
            return js('(function(){KM.pages.productStrategyBoard.onUnmount();return true;})()');
          });
        }).then(function () { return delay(250); })
          .then(function () { return afterInterrupt('left mid-drag', l0); })
          .then(function () { return mouse('mouseReleased', at.x, at.y); })
          .then(function () { return delay(150); });
      }).then(function () {
        return js('(function(){KM.pages.productStrategyBoard.onMount();return true;})()');
      }).then(waitBoard).then(readPanels).then(function (r) {
        check('returned: the release while away committed nothing, and the completed simulation is still there',
          simsIn(r.page.demo) === 1 && r.page.demo.dragging === false, r.page.demo && r.page.demo.sims);
        check('returned: no uncaught error from the interrupted drag', (r.page.uncaught || []).length === 0, r.page.uncaught);
        /* A NEW REST BASELINE FOR THE NEW MOUNT. boot() registers its own two document keydown listeners
           (popover close, fullscreen exit) on every mount and never removes them — pre-existing since
           2026-09-09, not part of the drag, and out of this round. It is recorded here by name so it is
           neither hidden in a drag check nor mistaken for one. */
        return listeners().then(function (lRest) {
          step('PRE-EXISTING (not this round): document keydown listeners after one leave/return',
            { before: l0.document.keydown, after: lRest.document.keydown, who: lRest.document.keydownWho });
          check('returned: the drag left no capture listener behind across leave/return',
            lRest.document.keydownCapture === l0.document.keydownCapture, { before: l0.document, after: lRest.document });
          return fullDrag(USD_PT, 0, 50).then(readPanels).then(function (r2) {
            check('returned: an ordinary drag works again and commits', simsIn(r2.page.demo) === 2, r2.page.demo && r2.page.demo.sims);
            return listeners();
          }).then(function (l) {
            check('returned: after that drag the listeners are back at rest',
              l.document.keydown === lRest.document.keydown && l.document.keydownCapture === lRest.document.keydownCapture, { rest: lRest, now: l });
            return lRest;
          });
        });
      });
    })
    .then(function (l0) {
      // ---- (b) switch the price context mid-drag ----
      return pressAndMove(USD_PT, 2, 40).then(function (at) {
        return js('(function(){var b=document.querySelectorAll(' + JSON.stringify(P('USD', 'priceView-activity')) + ')[0];b.click();return true;})()')
          .then(function () { return delay(250); })
          .then(function () { return afterInterrupt('context switched mid-drag', l0); })
          .then(function () { return mouse('mouseReleased', at.x, at.y); })
          .then(function () { return delay(150); });
      }).then(readPanels).then(function (r) {
        check('context switched: the release committed nothing in either context', simsIn(r.page.demo) === 2, r.page.demo && r.page.demo.sims);
        return click(P('USD', 'priceView-everyday'));
      }).then(function () { return fullDrag(USD_PT, 2, 40); }).then(readPanels).then(function (r) {
        check('context switched: back in everyday, an ordinary drag works and commits', simsIn(r.page.demo) === 3, r.page.demo && r.page.demo.sims);
        return l0;
      });
    })
    .then(function (l0) {
      // ---- (c) the chart is rebuilt mid-drag ----
      return pressAndMove(USD_PT, 3, 40).then(function (at) {
        return js('(function(){var b=document.querySelector(\'button[data-zoom="1.5"]\')||document.querySelector("#mode-comfortable");if(b)b.click();return !!b;})()')
          .then(function (hit) { step('rebuild trigger found', hit); return delay(300); })
          .then(function () { return afterInterrupt('chart rebuilt mid-drag', l0); })
          .then(function () { return mouse('mouseReleased', at.x, at.y); })
          .then(function () { return delay(150); });
      }).then(readPanels).then(function (r) {
        check('rebuilt: the release committed nothing', simsIn(r.page.demo) === 3, r.page.demo && r.page.demo.sims);
        return js('(function(){var b=document.querySelector(\'button[data-zoom="1"]\')||document.querySelector("#mode-auto");if(b)b.click();return true;})()');
      }).then(function () { return delay(250); }).then(function () { return fullDrag(USD_PT, 3, 40); }).then(readPanels).then(function (r) {
        check('rebuilt: an ordinary drag works and commits', simsIn(r.page.demo) === 4, r.page.demo && r.page.demo.sims);
        // Escape during a normal drag still cancels it (R1's promise), and is still consumed while dragging.
        return pressAndMove(USD_PT, 4, 40).then(function (at) {
          return js('window.__esc.length').then(function (n0) {
            return escKey().then(function () { return js('({esc:window.__esc.slice(' + n0 + '),d:PSB_BOARD.demoState().dragging})'); })
              .then(function (e) {
                check('during a drag Escape still cancels it, and is consumed by the drag', e.d === false && e.esc.length === 0, e);
                return mouse('mouseReleased', at.x, at.y);
              });
          });
        });
      }).then(function () { return delay(150); }).then(readPanels).then(function (r) {
        check('the Escape-cancelled drag committed nothing', simsIn(r.page.demo) === 4, r.page.demo && r.page.demo.sims);
        return shot('r2-03-after-lifecycle');
      });
    })
    // ================================ ZERO WRITES, RELOAD ================================
    .then(readPanels)
    .then(function (r) {
      var writes = (r.page.wire || []).filter(function (a) { return !/\.get$|health|capabilit/i.test(a); });
      step('wire', { actions: r.page.wire, net: r.page.net });
      check('zero write requests on the wire (replay log)', r.page.wire !== null && writes.length === 0, writes);
      check('no XHR or beacon left the page', r.page.net && r.page.net.xhr.length === 0 && r.page.net.beacon.length === 0, r.page.net);
      check('no uncaught error during the whole run', (r.page.uncaught || []).length === 0, r.page.uncaught);
      check('the canonical rows are byte-identical after everything', r.page.canonicalHash === first.page.canonicalHash, [first.page.canonicalHash, r.page.canonicalHash]);
      check('nothing was written to browser storage or the URL', r.page.storage.local === 0 && r.page.storage.session === 0
        && r.page.url === '_psb-demo-r2-page.html', { storage: r.page.storage, url: r.page.url });
      return client.send('Page.reload', { ignoreCache: true });
    })
    .then(function () { return delay(300); })
    .then(function () { return waitFor('window.__ready === true && !!document.querySelector("svg.chart")', 30000); })
    .then(waitBoard)
    .then(readPanels)
    .then(function (r) {
      check('after a reload: no simulation, no competitor, both axes as first drawn',
        simsIn(r.page.demo) === 0 && r.USD.comps.length === 0 && r.EUR.comps.length === 0
          && JSON.stringify(r.USD.axis) === JSON.stringify(first.USD.axis) && JSON.stringify(r.EUR.axis) === JSON.stringify(first.EUR.axis), null);
      done = true;
    })
    .catch(function (e) { ev.error = String(e && e.stack || e); })
    .then(function () {
      ev.complete = done;
      ev.passed = ev.checks.filter(function (c) { return c.ok; }).length;
      ev.failed = ev.checks.filter(function (c) { return !c.ok; }).length;
      fs.writeFileSync(path.join(out, MUT ? ('mutant-' + MUT + '.json') : 'demo-r2.json'), JSON.stringify(ev, null, 2));
      ev.checks.forEach(function (c) { console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.ok ? '' : '  got ' + JSON.stringify(c.got).slice(0, 400))); });
      if (ev.error) console.log('ERROR ' + ev.error);
      console.log('\n' + ev.passed + ' passed, ' + ev.failed + ' failed, complete ' + done);
      console.log('wrote ' + path.join(out, 'demo-r2.json'));
      if (client) client.close();
      try { chrome.kill(); } catch (e) {}
      try { fs.unlinkSync(pageFile); } catch (e) {}
      if (mutFile) { try { fs.unlinkSync(mutFile); } catch (e) {} }
      setTimeout(function () { process.exit(ev.failed || !done ? 1 : 0); }, 300);
    });
}

if (require.main === module) main();
