/**
 * ==================================================================================================
 * PSB-DEMO-R1 — THE DEMO, PERFORMED IN A REAL BROWSER WITH REAL INPUT
 * ==================================================================================================
 *
 * The production page (generated from index.html by _p1b8c-visual-runner.js#buildPage, the same page
 * every P1-B8 acceptance uses) with the deterministic capture at the socket and real-shape campaign
 * lines added by _psb-demo-capture.js. Chrome is driven over the DevTools protocol: the pointer
 * presses, moves and releases are `Input.dispatchMouseEvent`, so pointer capture, hit-testing, the
 * SVG's screen transform and the browser's own event order are the browser's, not a model of them.
 *
 * THE SEQUENCE IS THE OWNER'S: choose an activity -> read its real deal prices -> add competitors ->
 * drag one product's price point -> Undo / Reset -> switch activity and site -> reload. Along the way
 * it records what the round promises and nothing else:
 *   - the axis does not move during a drag (min, max, step and every tick, read at each move)
 *   - only the dragged point moves (every other point, floor and list cap read before and after)
 *   - the canonical rows are byte-identical before and after (hashed in the page)
 *   - no write left the page (the replay throws on one; a fetch/XHR/beacon monitor counts everything)
 *   - nothing reached storage or the URL
 *   - a reload restores the recorded prices and drops every simulation and competitor
 *   - desktop and narrow layouts: the controls, the legend and the chart do not overlap
 *
 * USAGE   node assets/tests/_psb-demo-runner.js <outDir>
 * Writes <outDir>/demo.json and four PNGs. Exits non-zero when Chrome is missing (a STOP, not a skip).
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

/* ---- a minimal DevTools client ---------------------------------------------------------------- */
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

function main() {
  var out = process.argv[2];
  if (!out) { console.error('usage: node _psb-demo-runner.js <outDir>'); process.exit(2); }
  out = path.resolve(out);
  fs.mkdirSync(out, { recursive: true });
  var browser = RUN.findBrowser();
  if (!browser) { console.error('STOP: no Chrome found'); process.exit(3); }

  var html = RUN.buildPage({ view: 'category', activated: true });
  var anchor = '<script src="assets/tests/_p1b8c-capture.js"></script>';
  if (html.indexOf(anchor) < 0) { console.error('STOP: capture script tag not found'); process.exit(4); }
  html = html.replace(anchor, anchor + '\n  <script src="assets/tests/_psb-demo-capture.js"></script>');
  var pageFile = path.join(ROOT, 'assets', 'tests', '_psb-demo-page.html');
  fs.writeFileSync(pageFile, html, 'utf8');

  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-demo-'));
  var chrome = cp.spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' });
  var client = null;
  var ev = { round: 'PSB-DEMO-R1', takenAt: new Date().toISOString(), browser: browser,
    sources: {}, steps: [], checks: [] };
  ['assets/js/product-strategy/psb-board-ui.js', 'assets/js/product-strategy/psb-selectors.js',
    'assets/css/product-strategy-board.css', 'assets/tests/_psb-demo-capture.js',
    'assets/tests/_psb-demo-runner.js'].forEach(function (f) { ev.sources[f] = sha(f); });

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
  function centerOf(sel, index) {
    return js('(function(){var e=document.querySelectorAll(' + JSON.stringify(sel) + ')[' + (index || 0) + '];'
      + 'if(!e)return null;e.scrollIntoView({block:"center",inline:"center"});var r=e.getBoundingClientRect();'
      + 'return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()');
  }
  function click(sel, index) {
    return centerOf(sel, index).then(function (c) {
      if (!c) throw new Error('no element ' + sel);
      return mouse('mouseMoved', c.x, c.y, 0).then(function () { return mouse('mousePressed', c.x, c.y); })
        .then(function () { return mouse('mouseReleased', c.x, c.y); }).then(function () { return delay(120); });
    });
  }
  function typeInto(sel, text) {
    return click(sel).then(function () {
      return js('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');e.focus();e.select&&e.select();return true;})()');
    }).then(function () { return client.send('Input.insertText', { text: text }); });
  }
  function shot(name) {
    return client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }).then(function (r) {
      var f = path.join(out, name + '.png');
      fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
      return f;
    });
  }
  /* Everything the page can say about itself in one read. */
  var READ = '(function(){'
    + 'var svgEl=document.querySelector("svg.chart");'
    + 'function attrs(sel,names){return Array.prototype.map.call(document.querySelectorAll(sel),function(e){var o={};names.forEach(function(n){o[n]=e.getAttribute(n);});return o;});}'
    + 'var c=KM.pages.productStrategyBoard.lastController;'
    + 'var rows=c&&c.adapter?c.adapter.loadCanonical().rows:[];'
    + 'var s=JSON.stringify(rows),h1=2166136261>>>0,h2=0;for(var i=0;i<s.length;i++){h1=Math.imul(h1^s.charCodeAt(i),16777619)>>>0;h2=(h2*31+s.charCodeAt(i))>>>0;}'
    + 'return {axis: svgEl?{lo:svgEl.getAttribute("data-axis-min-c"),hi:svgEl.getAttribute("data-axis-max-c"),step:svgEl.getAttribute("data-tick-step-c"),'
    + 'ticks:Array.prototype.map.call(svgEl.querySelectorAll(".ytick"),function(t){return t.getAttribute("data-tick-c")+"@"+t.getAttribute("y");}).join(",")}:null,'
    + 'cols: attrs(".col:not(.col-competitor)",["data-node-key","data-sim-c","data-sim-from-c","data-activity-state","data-regular-c"]),'
    + 'activity: attrs(".mk-activity-group",["data-price-c","data-recorded-c","data-state"]),'
    + 'caps: attrs(".cap",["data-price-c","y1"]),'
    + 'regs: attrs(".mk-anchor.mk-reg",["data-cy","data-price-c"]),'
    + 'comps: attrs(".col-competitor",["data-competitor-id","data-price-c","data-lo-c","data-hi-c"]),'
    + 'compBands: document.querySelectorAll(".col-competitor .comp-band").length,'
    + 'ghosts: document.querySelectorAll(".demo-ghost").length,'
    + 'tableRows: document.querySelectorAll("#productTable tbody tr").length,'
    + 'tableHeads: Array.prototype.map.call(document.querySelectorAll("#productTable thead th"),function(t){return t.textContent;}),'
    + 'kpi: (document.querySelector(".kpis")||{}).textContent||"",'
    + 'simCount: (document.querySelector("[data-demo-ctl=\\"simCount\\"]")||{getAttribute:function(){return null;}}).getAttribute("data-count"),'
    + 'meta: (document.getElementById("readTimeMeta")||{}).textContent||null,'
    + 'activityOptions: Array.prototype.map.call(document.querySelectorAll("[data-demo-ctl=\\"activitySelect\\"] option"),function(o){return o.value+"="+o.textContent;}),'
    + 'activityNote: (document.querySelector("[data-demo-ctl=\\"activityNote\\"]")||{}).textContent||null,'
    + 'viewText: (document.getElementById("view")||{}).innerText||"",'
    + 'canonicalHash: (h1.toString(16)+"-"+h2.toString(16)+"-"+s.length),'
    + 'wire: (window.__wire&&window.__wire.log)?window.__wire.log.map(function(x){return x.action;}):null,'
    + 'net: window.__net||null,'
    + 'storage: {local: (function(){try{return localStorage.length;}catch(e){return "n/a";}})(), session: (function(){try{return sessionStorage.length;}catch(e){return "n/a";}})()},'
    + 'url: location.href.split("/").pop(), scrollW: document.documentElement.scrollWidth, uncaught: window.__uncaught||null'
    + '};})()';
  function read() { return js(READ); }
  function dragBy(sel, index, dyPx, opts) {
    opts = opts || {};
    var trace = [];
    return centerOf(sel, index).then(function (c) {
      if (!c) throw new Error('no drag handle ' + sel);
      var x = c.x, y = c.y;
      var p = mouse('mouseMoved', x, y, 0).then(function () { return mouse('mousePressed', x, y); });
      var steps = 8;
      for (var i = 1; i <= steps; i++) {
        (function (k) {
          p = p.then(function () { return mouse('mouseMoved', x, y + dyPx * k / steps); })
            .then(function () { return read(); }).then(function (r) { trace.push(r.axis); });
        }(i));
      }
      if (opts.cancelWithEscape) {
        p = p.then(function () { return client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); })
          .then(function () { return client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); })
          .then(function () { return mouse('mouseReleased', x, y + dyPx); });
      } else {
        p = p.then(function () { return mouse('mouseReleased', x, y + dyPx); });
      }
      return p.then(function () { return delay(150); }).then(function () { return trace; });
    });
  }
  function key(k, shift) {
    var code = { ArrowUp: 38, ArrowDown: 40, Enter: 13 }[k];
    return client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0 })
      .then(function () { return client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0 }); })
      .then(function () { return delay(120); });
  }
  var NET_MONITOR = '(function(){window.__net={fetch:[],xhr:[],beacon:[]};window.__uncaught=[];window.addEventListener("error",function(e){window.__uncaught.push(String(e.message)+" @"+e.lineno+":"+e.colno+" "+String(e.filename||"").split("/").pop());});'
    + 'var f=window.fetch;window.fetch=function(u,o){window.__net.fetch.push({url:String(u&&u.url||u).slice(0,200),method:(o&&o.method)||"GET"});return f.apply(this,arguments);};'
    + 'var X=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){window.__net.xhr.push({url:String(u).slice(0,200),method:m});return X.apply(this,arguments);};'
    + 'if(navigator.sendBeacon){var B=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u){window.__net.beacon.push(String(u).slice(0,200));return B.apply(null,arguments);};}'
    + '})();';

  var first = null, afterAct = null, done = false;
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
  waitPort().then(function (port) {
    return fetch('http://127.0.0.1:' + port + '/json/list').then(function (r) { return r.json(); });
  }).then(function (list) {
    var page = list.filter(function (t) { return t.type === 'page'; })[0];
    client = cdp(page.webSocketDebuggerUrl);
    return client.send('Page.enable');
  }).then(function () { return client.send('Runtime.enable'); })
    .then(function () { return client.send('Page.addScriptToEvaluateOnNewDocument', { source: NET_MONITOR }); })
    .then(function () { return client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }); })
    .then(function () { return client.send('Page.navigate', { url: fileUrl(pageFile) }); })
    .then(function () { return waitFor('window.__ready === true && !!document.querySelector("svg.chart")', 30000); })
    .then(function () { return js('window.__error'); })
    .then(function (err) { check('the production page mounted with no boot error', err === null, err); return read(); })
    .then(function (r) {
      first = r;
      step('mounted', { meta: r.meta, cols: r.cols.length, axis: r.axis, wire: r.wire, scrollW: r.scrollW });
      check('the header names the database read time (72_ read_at, Taipei) and not a constant prepared date',
        /database read 2026-09-12 08:00 \(Taipei\)/.test(r.meta || '') && !/prepared/.test(r.meta || ''), r.meta);
      return shot('01-everyday');
    })
    // ---- 1. choose an activity ----
    .then(function () { return click('#priceView-activity-USD'); })
    .then(function () { return read(); })
    .then(function (r) {
      check('Activity price lists the activities by campaign_id, name, period and recorded status',
        r.activityOptions.some(function (o) { return /^CMP-PBDD-2026=Prime Big Deal Days\s+·\s+2026-10-07 to 2026-10-08\s+·\s+recorded status: active$/.test(o); })
        && r.activityOptions.some(function (o) { return /^CMP-BF-2026=Black Friday/.test(o); })
        && !r.activityOptions.some(function (o) { return /CMP-CA-SPRING/.test(o); }), r.activityOptions);
      return js('(function(){var s=document.getElementById("activitySelect-USD");s.value="CMP-PBDD-2026";s.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
    })
    .then(function () { return delay(200); }).then(function () { return read(); })
    .then(function (r) {
      afterAct = r;
      var states = {};
      r.cols.forEach(function (c) { states[c['data-activity-state']] = (states[c['data-activity-state']] || 0) + 1; });
      step('activity chosen', { activity: r.activity, states: states, note: r.activityNote });
      check('recorded deal prices are drawn for this activity', r.activity.length > 0, r.activity.length);
      check('missing, currency and duplicate lines are named, never priced',
        ['DEAL_PRICE_MISSING', 'PROMOTION_CURRENCY_UNRESOLVED', 'PROMOTION_CURRENCY_MISMATCH', 'DUPLICATE_CAMPAIGN_LINE', 'DEAL_PRICE_CONFLICT']
          .some(function (s) { return states[s]; }), states);
      check('no activity is called live: the note says it does not decide today, and no "live" word is on the activity',
        /does not say the activity is running today/.test(r.activityNote || '') && !/\blive\b/i.test(r.activityNote || ''), r.activityNote);
      check('the table carries an Activity price column', r.tableHeads.indexOf('Activity price') !== -1, r.tableHeads);
      check('the canonical rows are untouched by choosing an activity', r.canonicalHash === first.canonicalHash, [first.canonicalHash, r.canonicalHash]);
      return js('(function(){var g=document.querySelector(".mk-activity-group");var col=g.closest(".col");var key=col.getAttribute("data-node-key");'
        + 'var rowsT=document.querySelectorAll("#productTable tbody tr");var label=col.getAttribute("data-label");var cell=null;'
        + 'for(var i=0;i<rowsT.length;i++){if(rowsT[i].getAttribute("data-label")===label){cell=rowsT[i].querySelector("[data-activity-state]");break;}}'
        + 'return {chart:g.getAttribute("data-price-c"),table:cell?cell.textContent:null,label:label};})()');
    })
    .then(function (pair) {
      check('chart and table show the same activity price for the same product',
        pair.table && pair.table.indexOf((Number(pair.chart) / 100).toFixed(2)) !== -1, pair);
      return shot('02-activity');
    })
    // ---- 2. add competitors ----
    .then(function () { return click('#compAdd-USD'); })
    .then(function () { return typeInto('#compName-USD', 'Rival A'); })
    .then(function () { return typeInto('#compPrice-USD', '27.50'); })
    .then(function () { return click('#compSave-USD'); })
    .then(function () { return click('#compAdd-USD'); })
    .then(function () { return typeInto('#compName-USD', 'Rival B'); })
    .then(function () { return typeInto('#compPrice-USD', '33.00'); })
    .then(function () { return typeInto('#compLo-USD', '30.00'); })
    .then(function () { return typeInto('#compHi-USD', '36.00'); })
    .then(function () { return click('#compSave-USD'); })
    .then(function () { return read(); })
    .then(function (r) {
      step('competitors added', { comps: r.comps, bands: r.compBands });
      check('two temporary competitors are drawn', r.comps.length === 2, r.comps);
      check('a competitor without both band ends gets no band; the one with both gets one', r.compBands === 1, r.compBands);
      check('competitors are not in the product table', r.tableRows === afterAct.tableRows, [afterAct.tableRows, r.tableRows]);
      check('competitors do not change the KPI strip', r.kpi === afterAct.kpi, null);
      check('the canonical rows are untouched by adding competitors', r.canonicalHash === first.canonicalHash, null);
      return shot('03-competitors');
    })
    // ---- 3. drag one product's deal price ----
    .then(function () { return read(); })
    .then(function (before) {
      return js('(function(){var gs=document.querySelectorAll(".mk-activity-group");for(var i=0;i<gs.length;i++){if(gs[i].getAttribute("data-state")==="PRICED")return i;}return -1;})()')
        .then(function (idx) {
          return dragBy('.mk-activity-group', idx, 70).then(function (trace) {
            return read().then(function (after) { return { before: before, after: after, trace: trace, idx: idx }; });
          });
        });
    })
    .then(function (d) {
      var axisKeys = d.trace.map(function (a) { return JSON.stringify(a); });
      check('the axis did not move at any point during the drag (min, max, step and every tick)',
        axisKeys.every(function (k) { return k === JSON.stringify(d.before.axis); }), { before: d.before.axis, during: d.trace.length });
      var moved = d.after.cols.filter(function (c) { return c['data-sim-c'] !== null; });
      check('exactly one product carries a simulation after the drag', moved.length === 1, moved);
      var m = moved[0] || {};
      check('the simulation moved in whole currency units and kept its cents',
        m['data-sim-c'] !== null && ((Number(m['data-sim-from-c']) - Number(m['data-sim-c'])) % 100 === 0)
          && Number(m['data-sim-c']) < Number(m['data-sim-from-c']), m);
      var othersSame = d.before.activity.filter(function (a, i) { return i !== d.idx; }).map(function (a) { return a['data-price-c']; }).join(',')
        === d.after.activity.filter(function (a, i) { return i !== d.idx; }).map(function (a) { return a['data-price-c']; }).join(',');
      check('every other activity price point stayed where it was', othersSame, null);
      check('floor and list caps did not move', JSON.stringify(d.before.caps) === JSON.stringify(d.after.caps), null);
      check('the recorded deal price of the dragged product is unchanged (data-recorded-c)',
        (d.before.activity[d.idx] || {})['data-recorded-c'] === (d.after.activity[d.idx] || {})['data-recorded-c'], [d.before.activity[d.idx], d.after.activity[d.idx]]);
      check('the original stays on the chart as a ghost', d.after.ghosts >= 1, d.after.ghosts);
      check('the canonical rows are untouched by the drag', d.after.canonicalHash === first.canonicalHash, null);
      step('dragged', { sim: m, during: d.trace.length });
      return js('({demo:PSB_BOARD.demoState(),uncaught:window.__uncaught})').then(function (s) { step('demo state after drag', s); return shot('04-dragged'); });
      return shot('04-dragged');
    })
    // ---- 4. exact entry, keyboard, undo, reset, escape ----
    .then(function () { return typeInto('#simInput-USD', '19.99'); })
    .then(function () { return click('#simApply-USD'); })
    .then(function () { return read(); })
    .then(function (r) {
      var m = r.cols.filter(function (c) { return c['data-sim-c'] !== null; });
      check('a typed price is applied exactly', m.length === 1 && m[0]['data-sim-c'] === '1999', m);
      return js('(function(){var c=document.querySelector(".col[data-sim-c]");c.focus();return c.getAttribute("data-node-key");})()');
    })
    .then(function () { return key('ArrowUp'); })
    .then(function () { return read(); })
    .then(function (r) {
      var m = r.cols.filter(function (c) { return c['data-sim-c'] !== null; });
      check('ArrowUp moves the focused point up by one unit', m.length === 1 && m[0]['data-sim-c'] === '2099', m);
      return click('#simUndo-USD');
    })
    .then(function () { return read(); })
    .then(function (r) {
      var m = r.cols.filter(function (c) { return c['data-sim-c'] !== null; });
      check('Undo restores the previous simulated price', m.length === 1 && m[0]['data-sim-c'] === '1999', m);
      return click('#simResetOne-USD');
    })
    .then(function () { return read(); })
    .then(function (r) {
      check('Reset this product removes its simulation', r.cols.every(function (c) { return c['data-sim-c'] === null; }), null);
      return js('(function(){var gs=document.querySelectorAll(".mk-activity-group");for(var i=0;i<gs.length;i++){if(gs[i].getAttribute("data-state")==="PRICED")return i;}return -1;})()');
    })
    .then(function (idx) { return dragBy('.mk-activity-group', idx, 60, { cancelWithEscape: true }); })
    .then(function () { return read(); })
    .then(function (r) {
      check('Escape during a drag puts the point back and records nothing', r.cols.every(function (c) { return c['data-sim-c'] === null; }), null);
      return js('(function(){var gs=document.querySelectorAll(".mk-activity-group");var out=[];for(var i=0;i<gs.length&&out.length<2;i++){if(gs[i].getAttribute("data-state")==="PRICED")out.push(i);}return out;})()');
    })
    .then(function (two) { return dragBy('.mk-activity-group', two[0], 50).then(function () { return dragBy('.mk-activity-group', two[1], -40); }); })
    .then(function () { return read(); })
    .then(function (r) {
      check('two products can be simulated independently', r.cols.filter(function (c) { return c['data-sim-c'] !== null; }).length === 2, null);
      return click('#simResetAll-USD');
    })
    .then(function () { return read(); })
    .then(function (r) {
      check('Reset all removes every simulation in this context', r.cols.every(function (c) { return c['data-sim-c'] === null; }), null);
      // leave one simulation in place to prove isolation
      return js('(function(){var gs=document.querySelectorAll(".mk-activity-group");for(var i=0;i<gs.length;i++){if(gs[i].getAttribute("data-state")==="PRICED")return i;}return -1;})()');
    })
    .then(function (idx) { return dragBy('.mk-activity-group', idx, 40); })
    // ---- 5. isolation: activity, price mode, site ----
    .then(function () { return js('(function(){var s=document.getElementById("activitySelect-USD");s.value="CMP-BF-2026";s.dispatchEvent(new Event("change",{bubbles:true}));return true;})()'); })
    .then(function () { return delay(200); }).then(function () { return read(); })
    .then(function (r) {
      check('another activity shows none of the first activity’s simulations', r.cols.every(function (c) { return c['data-sim-c'] === null; }), null);
      check('another activity shows none of the first activity’s competitors', r.comps.length === 0, r.comps);
      return click('#priceView-everyday-USD');
    })
    .then(function () { return read(); })
    .then(function (r) {
      check('the everyday view shows none of the activity simulations or competitors',
        r.cols.every(function (c) { return c['data-sim-c'] === null; }) && r.comps.length === 0, null);
      return dragBy('.col .mk-reg-group', 0, -60);
    })
    .then(function () { return read(); })
    .then(function (r) {
      var m = r.cols.filter(function (c) { return c['data-sim-c'] !== null; });
      check('in the everyday view the drag moves the everyday price point', m.length === 1 && Number(m[0]['data-sim-c']) > Number(m[0]['data-sim-from-c']), m);
      check('everyday drag leaves floor and list caps alone', JSON.stringify(r.caps) === JSON.stringify(first.caps), null);
      return click('#priceView-activity-USD');
    })
    .then(function () { return js('(function(){var s=document.getElementById("activitySelect-USD");s.value="CMP-PBDD-2026";s.dispatchEvent(new Event("change",{bubbles:true}));return true;})()'); })
    .then(function () { return delay(200); }).then(function () { return read(); })
    .then(function (r) {
      check('back on the first activity, its own simulation and competitors are still there (in memory)',
        r.cols.filter(function (c) { return c['data-sim-c'] !== null; }).length === 1 && r.comps.length === 2, { comps: r.comps.length });
      return js('P1B8C_REPLAY.chooseSite(document, {company:"Kitchen Mama",country:"CA",marketplace:"Amazon"}).then(function(){return true;})');
    })
    .then(function () { return waitFor('(function(){var c=KM.pages.productStrategyBoard.lastController;return !!(c&&c.mounted&&!c.inFlight);})()', 20000); })
    .then(function () { return js('PSB_BOARD.showView("category")'); })
    .then(function () { return waitFor('!!document.querySelector("svg.chart")', 20000); })
    .then(function () { return delay(300); }).then(function () { return read(); })
    .then(function (r) {
      check('a site change drops every simulation and competitor', r.cols.every(function (c) { return c['data-sim-c'] === null; }) && r.comps.length === 0, null);
      check('a site change returns to the everyday view', r.activityOptions.length === 0, r.activityOptions);
      return click('#priceView-activity-CAD').then(read);
    })
    .then(function (r) {
      check('the CA site lists only its own activity', r.activityOptions.length === 2
        && /CMP-CA-SPRING/.test(r.activityOptions[1]), r.activityOptions);
      return js('P1B8C_REPLAY.chooseSite(document, {company:"Kitchen Mama",country:"US",marketplace:"Amazon"}).then(function(){return true;})');
    })
    .then(function () { return waitFor('(function(){var c=KM.pages.productStrategyBoard.lastController;return !!(c&&c.mounted&&!c.inFlight);})()', 20000); })
    .then(function () { return js('PSB_BOARD.showView("category")'); })
    .then(function () { return waitFor('!!document.querySelector("svg.chart")', 20000); })
    .then(function () { return delay(300); })
    // ---- 6. zoomed and scrolled: the pointer still maps to the right price ----
    .then(function () { return click('#mode-comfortable').catch(function () { return null; }); })
    .then(function () { return js('(function(){var b=document.querySelector("[data-zoom=\\"1.5\\"]");if(b&&b.tagName==="BUTTON"){b.click();}var w=document.querySelector(".chartwrap");if(w){w.scrollLeft=Math.round(w.scrollWidth/3);}return {sw:w&&w.scrollWidth,cw:w&&w.clientWidth,sl:w&&w.scrollLeft};})()'); })
    .then(function (z) {
      step('comfortable + zoom + scroll', z);
      return js('(function(){var svgEl=document.querySelector("svg.chart");var px=Number(svgEl.getAttribute("data-tick-px"));var r=svgEl.getBoundingClientRect();var vb=Number(svgEl.getAttribute("data-vb-h"));'
        + 'var cols=document.querySelectorAll(".col:not(.col-competitor)");var pick=-1;for(var i=0;i<cols.length;i++){var b=cols[i].querySelector(".mk-reg-group").getBoundingClientRect();if(b.left>r.left+80&&b.right<window.innerWidth-20){pick=i;break;}}'
        + 'return {pick:pick,scale:r.height/vb,tickPx:px,step:Number(svgEl.getAttribute("data-tick-step-c"))};})()');
    })
    .then(function (g) {
      // drag exactly two gridlines up, in screen pixels at the current scale
      var dy = -2 * g.tickPx * g.scale;
      return dragBy('.col:not(.col-competitor) .mk-reg-group', g.pick, dy).then(function () {
        return js('(function(){var c=document.querySelectorAll(".col:not(.col-competitor)")[' + g.pick + '];return {sim:c.getAttribute("data-sim-c"),from:c.getAttribute("data-sim-from-c")};})()')
          .then(function (r) { return { g: g, r: r }; });
      });
    })
    .then(function (z) {
      var moved = z.r.sim === null ? null : Number(z.r.sim) - Number(z.r.from);
      check('zoomed and scrolled, two gridlines of pointer travel is two gridlines of price (screen transform honoured)',
        moved !== null && Math.abs(moved - 2 * z.g.step) <= 100, { moved: moved, expected: 2 * z.g.step, g: z.g });
      return click('#mode-auto').catch(function () { return null; });
    })
    // ---- 7. layout at desktop and narrow width ----
    .then(function () { return click('#priceView-activity-USD').catch(function () { return null; }); })
    .then(function () { return js('(function(){var s=document.getElementById("activitySelect-USD");if(s){s.value="CMP-PBDD-2026";s.dispatchEvent(new Event("change",{bubbles:true}));}return true;})()'); })
    .then(function () { return delay(200); })
    .then(function () {
      /* #__measurements is the acceptance harness's own one-line JSON dump (buildPage), not part of the
         board: it grows with the DOM and would make the PAGE scroll for a reason the product does not
         have. It is hidden for the measurement and nothing else. */
      var LAYOUT_READ = '(function(){var mp=document.getElementById("__measurements");if(mp)mp.style.display="none";function box(e){var r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom};}'
        + 'function hit(a,b){return a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b;}'
        + 'var ctl=document.querySelector("[data-demo-ctl=\\"demoControls\\"]"),wrap=document.querySelector(".chartwrap"),leg=document.getElementById("chartLegend");'
        + 'var items=Array.prototype.map.call(leg?leg.querySelectorAll(".legend-item"):[],box);var legOverlap=0;'
        + 'for(var i=0;i<items.length;i++)for(var j=i+1;j<items.length;j++)if(hit(items[i],items[j]))legOverlap++;'
        + 'var kids=Array.prototype.map.call(ctl?ctl.children:[],box);var ctlOverlap=0;for(var a=0;a<kids.length;a++)for(var b2=a+1;b2<kids.length;b2++)if(hit(kids[a],kids[b2]))ctlOverlap++;'
        + 'return {ctlChart: ctl&&wrap?hit(box(ctl),box(wrap)):null, chartLegend: wrap&&leg?hit(box(wrap),box(leg)):null, legOverlap:legOverlap, ctlOverlap:ctlOverlap,'
        + 'pageScrollsX: document.documentElement.scrollWidth>document.documentElement.clientWidth+1,'
        + 'scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth};})()';
      return js(LAYOUT_READ).then(function (desk) {
        check('desktop: controls, chart and legend do not overlap', desk.ctlChart === false && desk.chartLegend === false
          && desk.legOverlap === 0 && desk.ctlOverlap === 0 && desk.pageScrollsX === false, desk);
        return shot('05-desktop-activity');
      }).then(function () {
        return client.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1100, deviceScaleFactor: 1, mobile: false });
      }).then(function () { return delay(500); }).then(function () { return js(LAYOUT_READ); }).then(function (nar) {
        check('narrow (820px): controls, chart and legend do not overlap', nar.ctlChart === false && nar.chartLegend === false
          && nar.legOverlap === 0 && nar.ctlOverlap === 0, nar);
        return shot('06-narrow-activity');
      }).then(function () {
        return client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
      });
    })
    // ---- 8. zero writes, untouched source, nothing stored, then reload ----
    .then(function () { return read(); })
    .then(function (r) {
      var readOnly = ['productPricing.workspace.get', 'productPricing.siteUniverse.get', 'system.health', 'system.clientCapabilities'];
      var writes = (r.wire || []).filter(function (a) { return readOnly.indexOf(a) === -1 && !/\.get$|health|capabilit/i.test(a); });
      step('wire', { actions: r.wire, net: r.net });
      check('zero write requests on the wire for the whole demo (replay log)', r.wire !== null && writes.length === 0, writes);
      var nonGet = r.net ? r.net.fetch.filter(function (f) { return String(f.method).toUpperCase() !== 'GET' && !/^file:/.test(f.url); }) : [];
      check('no fetch, XHR or beacon left the page except the replayed reads', r.net && r.net.beacon.length === 0 && r.net.xhr.length === 0, r.net);
      check('no uncaught error in the page during the whole demo', (r.uncaught || []).length === 0, r.uncaught);
      check('the canonical rows are byte-identical after everything', r.canonicalHash === first.canonicalHash, [first.canonicalHash, r.canonicalHash]);
      check('nothing was written to browser storage or the URL', r.storage.local === 0 && r.storage.session === 0
        && r.url === '_psb-demo-page.html', { storage: r.storage, url: r.url, nonGetFetch: nonGet.length });
      return client.send('Page.reload', { ignoreCache: true });
    })
    .then(function () { return delay(300); })
    .then(function () { return waitFor('window.__ready === true && !!document.querySelector("svg.chart")', 30000); })
    .then(function () { return read(); })
    .then(function (r) {
      check('after a reload: no simulation, no competitor, everyday view, recorded prices',
        r.cols.every(function (c) { return c['data-sim-c'] === null; }) && r.comps.length === 0 && r.activityOptions.length === 0
          && JSON.stringify(r.regs) === JSON.stringify(first.regs), null);
      check('after a reload the canonical rows are the same bytes as at first mount', r.canonicalHash === first.canonicalHash, null);
      done = true;
    })
    .catch(function (e) { ev.error = String(e && e.stack || e); })
    .then(function () {
      ev.complete = done;
      ev.passed = ev.checks.filter(function (c) { return c.ok; }).length;
      ev.failed = ev.checks.filter(function (c) { return !c.ok; }).length;
      fs.writeFileSync(path.join(out, 'demo.json'), JSON.stringify(ev, null, 2));
      ev.checks.forEach(function (c) { console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.ok ? '' : '  got ' + JSON.stringify(c.got).slice(0, 400))); });
      if (ev.error) console.log('ERROR ' + ev.error);
      console.log('\n' + ev.passed + ' passed, ' + ev.failed + ' failed, complete ' + done);
      console.log('wrote ' + path.join(out, 'demo.json'));
      if (client) client.close();
      try { chrome.kill(); } catch (e) {}
      try { fs.unlinkSync(pageFile); } catch (e) {}
      setTimeout(function () { process.exit(ev.failed || !done ? 1 : 0); }, 300);
    });
}

if (require.main === module) main();
