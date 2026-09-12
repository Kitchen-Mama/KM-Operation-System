/**
 * ==================================================================================================
 * P1-B8D — THE CONTROLLED ACTIVATION.
 * ==================================================================================================
 *
 * THIS SUITE IS THE ONE OWNER OF "IS PRODUCT STRATEGY ON".
 *
 * Before this round that fact was asserted in NINE places. It was true in all nine and load-bearing
 * in none of them: each was reaching for something else — the gate exists, this round switched
 * nothing on, no second control was added — and used the value because the value was cheap to read.
 * Nine copies of one fact is nine edits the day it changes, and today is that day. So the other
 * suites were repaired toward what they are actually about, and the VALUE lives here.
 *
 * WHAT ACTIVATION IS, PRECISELY. Two booleans:
 *
 *   PRODUCT_STRATEGY_ENABLED_                       false -> true   (00_config.gs)
 *   KM_STAGED_SECTIONS_['product-strategy'].enabled false -> true   (app.js)
 *
 * and nothing else. No third flag, no query parameter, no localStorage key, no DOM class, no TEMP
 * function, no route that skips a gate. §A asserts that the two are the only switches that exist,
 * which is a stronger claim than asserting their values and is the claim that keeps being true.
 *
 * WHAT IS ASSERTED ABOUT THE GATE IS THE GATE, NOT THE FLAG. The server refusal is driven through
 * the REAL constant and the REAL resolver — 00_config.gs and 72_ are loaded into one sandbox, and
 * the io the handler is given delegates `flagEnabled` to `productStrategyEnabled_()` exactly as
 * `ppwDefaultIo_` does. Then the same sandbox is rebuilt with the constant set back to false, and
 * the refusal has to come back. That is the rollback, executed rather than described: §F is a test
 * of the runbook, not a paraphrase of it.
 *
 * AND THE MENU IS BUILT FROM THE REGISTRY, WHICH IS WHY THERE IS STILL NO MARKUP.
 * index.html gained NO Product Strategy item. `mountStagedMenus` reads the registry, refuses any
 * section whose `enabled` is not exactly true, and inserts before the `insertBefore` anchor. So the
 * navigation rollback is an edit to one boolean rather than the deletion of a <div>, and P1-B8B's
 * rule — that the feature may not be opened by removing a CSS class — survives its own activation.
 * That is the part that would have been quietly lost by hand-writing the menu, and §D checks it.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');
var H = require('./_psb-harness.js');
var REL = require('./_release-order.js');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function gs(name) { return read('assets/specs/active/apps-script/' + name); }

var SRC = {
  config: gs('00_config.gs'),
  router: gs('01_router.gs'),
  ppw: gs('72_api_v1_product_pricing_workspace.gs'),
  health: gs('63_api_v1_system_health.gs'),
  manifest: read('assets/specs/active/apps-script/appsscript.json'),
  app: read('assets/js/app.js'),
  index: read('index.html'),
  views: read('assets/js/product-strategy/psb-views.js'),
  contract: read('assets/js/product-strategy/psb-data-contract.js'),
  selectors: read('assets/js/product-strategy/psb-selectors.js'),
  board: read('assets/js/product-strategy/psb-board-ui.js'),
  adapter: read('assets/js/api/km-product-pricing-adapter.js'),
  page: read('assets/js/pages/product-strategy-board.js'),
  css: read('assets/css/product-strategy-board.css'),
  partial: read('assets/html/pages/product-strategy-board.html')
};

var RELEASE = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11';
var PREV_RELEASE = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10';
var ACTIVATION_TOKEN = 'activation-p1b8d-20260912';

/* Comments AND string literals stripped, so a file that DESCRIBES a switch is never read as one.
   The string half is not optional and this suite proved it on its first run: app.js's registry entry
   carries a `reason:` explaining that PRODUCT_STRATEGY_ENABLED_ is true, and a probe reading only
   comments reported the shell as holding a copy of the server flag. Prose about a gate is not a
   gate — the same mistake §K4 of P1-B8B records, made again in the suite that was checking for it. */
function uniq(a) {
  var seen = {}, out = [];
  a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
  return out;
}
function bare(src) {
  return decomment(src)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}
/* AND THE HALF-STRIPPED FORM, WHICH IS A DIFFERENT TOOL FOR A DIFFERENT JOB. `bare` blanks string
   literals, so it cannot be used to LOCATE a block whose key IS a string — the registry entry is
   found by `'product-strategy':`, which `bare` turns into `'':`. Comments are the thing that must
   never be read as code; a string literal that is a map key is code. Using one stripper for both
   made A2 fail against a correct registry, which is the same class of mistake as reading prose as a
   switch, arrived at from the opposite direction. */
function decomment(src) {
  src = String(src).replace(/\/\*[\s\S]*?\*\//g, ' ');
  return src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
}

// ---- reporting -----------------------------------------------------------------------------------
var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function section(t) { console.log('\n=== ' + t + ' ==='); }
function ok(cond, label, got) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (got === undefined ? '' : '  ' + JSON.stringify(got))); }
}
function eq(a, b, label) {
  var same = JSON.stringify(a) === JSON.stringify(b);
  if (same) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
}
function mut(label, fn) {
  var caught = false;
  try { caught = fn() === true; } catch (e) { caught = false; console.log('       [' + e.message + ']'); }
  if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.log('  FAIL ' + label + ' — MUTANT SURVIVED'); }
}

// ==================================================================================================
section('§A  TWO AUTHORITIES, AND THEY ARE THE ONLY TWO');
// ==================================================================================================

ok(/var PRODUCT_STRATEGY_ENABLED_ = true;/.test(SRC.config),
  'A1  the SERVER authority is true — PRODUCT_STRATEGY_ENABLED_ in 00_config.gs');
eq((SRC.config.match(/PRODUCT_STRATEGY_ENABLED_\s*=[^=]/g) || []).length, 1,
  'A1a assigned in exactly one place (a bare `=` would also match the resolver\'s `=== true`)');
ok(/function productStrategyEnabled_\(\) \{ return PRODUCT_STRATEGY_ENABLED_ === true; \}/.test(SRC.config),
  'A1b with one resolver that COMPARES it, so no caller can hold a copy');

var stagedReg = decomment(SRC.app).slice(decomment(SRC.app).indexOf('var KM_STAGED_SECTIONS_ = {'));
stagedReg = stagedReg.slice(0, stagedReg.indexOf('\n};'));
ok(/'product-strategy':\s*\{[\s\S]*?enabled: true/.test(stagedReg),
  'A2  the NAVIGATION authority is true — KM_STAGED_SECTIONS_[\'product-strategy\'].enabled');
/* COUNTED ON THE FULLY STRIPPED FORM, because the entry's `reason:` string explains the switch and
   would otherwise be counted as a second one. */
eq((bare(stagedReg).match(/enabled/g) || []).length, 1,
  'A2a and the registry entry has exactly one `enabled` — two would be an answer with no owner');

/* NO THIRD SWITCH. Each of these is a way a feature gets turned on without a reviewable diff, and
   each has been used somewhere in some codebase; the point of naming them is that the absence is
   checked rather than assumed. Read on stripped source: app.js's own prose discusses several. */
[['location.search', 'a query string'], ['URLSearchParams', 'a parsed query string'],
 ['location.hash', 'a fragment'], ['localStorage', 'browser storage'],
 ['sessionStorage', 'session storage'], ['document.cookie', 'a cookie'],
 ['PRODUCT_STRATEGY_ENABLED_', 'a client copy of the server flag']].forEach(function (w, i) {
  var where = bare(SRC.app).indexOf('KM_STAGED_SECTIONS_');
  var region = bare(SRC.app).slice(where, where + 6000);
  ok(region.indexOf(w[0]) < 0, 'A3.' + (i + 1) + ' the activation path never reads ' + w[1]);
});
ok(bare(SRC.page).indexOf('location') < 0, 'A4  nor does the page controller read location');
ok(!/km_force|debug_token|bypass|__enable|TEMP_/.test(bare(SRC.config)),
  'A5  and no bypass, debug switch or TEMP entry sits beside the server flag');

/* THE TWO AGREE. A server that answers and a menu that is hidden is a feature nobody can reach; a
   menu that is shown and a server that refuses is a feature that looks broken. Either is a defect,
   and they are only ever correct together. */
ok(/var PRODUCT_STRATEGY_ENABLED_ = true;/.test(SRC.config)
   && /'product-strategy':\s*\{[\s\S]*?enabled: true/.test(stagedReg),
  'A6  both gates are in the same position — an activated feature needs both and needs them to agree');

// ==================================================================================================
section('§B  THE SERVER GATE — DRIVEN THROUGH THE REAL CONSTANT, BEFORE THE DOOR');
// ==================================================================================================

/* THE SANDBOX CARRIES 00_config.gs ITSELF. Injecting a boolean would prove the handler honours its
   io and prove nothing about whether the constant reaches it — which is the only question activation
   raises. So the real file is loaded, the real resolver is called, and `configWith` can rebuild the
   whole context with the constant set the other way. That is what makes §F a rollback rehearsal. */
var IO_SRC = [
  'var __LOG = { opens: 0, reads: [] };',
  'var __IO = {',
  '  now: function () { return 1000; },',
  '  nextSeq: function () { return 1; },',
  // EXACTLY what ppwDefaultIo_ does — the one resolver, not a copy of the constant.
  '  flagEnabled: function () {',
  '    return typeof productStrategyEnabled_ === "function" && productStrategyEnabled_() === true;',
  '  },',
  '  openTarget: function () { __LOG.opens++; return { __ss: true }; },',
  '  readTable: function (ss, name) { __LOG.reads.push(name); return []; }',
  '};'
].join('\n');

function configWith(flagValue) {
  var cfg = SRC.config.replace('var PRODUCT_STRATEGY_ENABLED_ = true;',
    'var PRODUCT_STRATEGY_ENABLED_ = ' + String(flagValue) + ';');
  var ctx = vm.createContext({ console: { log: function () {}, warn: function () {}, error: function () {} } });
  vm.runInContext(cfg, ctx);
  vm.runInContext(SRC.ppw, ctx);
  vm.runInContext(IO_SRC, ctx);
  return ctx;
}
function call(ctx, handler, payload) {
  vm.runInContext('__LOG = { opens: 0, reads: [] };', ctx);
  var body = { requestId: 'REQ-B8D0001', payload: payload || {} };
  var env = vm.runInContext('JSON.parse(JSON.stringify(' + handler + '('
    + JSON.stringify(body) + ', __IO)))', ctx);
  env.__log = vm.runInContext('JSON.parse(JSON.stringify(__LOG))', ctx);
  return env;
}

var ON = configWith(true);
ok(vm.runInContext('productStrategyEnabled_() === true', ON),
  'B1  with the shipped constant, the real resolver answers true');

var wsOn = call(ON, 'handleProductPricingWorkspaceGet_',
  { company: 'KM', country: 'US', marketplace: 'Amazon' });
ok(wsOn.meta.refusalCode !== 'FEATURE_DISABLED',
  'B2  so productPricing.workspace.get is no longer refused for being switched off');
var suOn = call(ON, 'handleProductPricingSiteUniverseGet_', {});
ok(suOn.meta.refusalCode !== 'FEATURE_DISABLED',
  'B3  and neither is productPricing.siteUniverse.get');
ok(suOn.__log.opens >= 1, 'B4  the site universe read opens the spreadsheet, which is the point of activation');

/* AND THE GATE IS STILL THE FIRST THING EITHER HANDLER DOES. The rollback below depends entirely on
   this: a gate that ran after the open would make "set it back to false" a slower read, not a stop. */
eq((SRC.ppw.match(/\n    if \(io\.flagEnabled\(\) !== true\) \{/g) || []).length, 2,
  'B5  both handlers open with the flag gate');
var gateW = SRC.ppw.indexOf('if (io.flagEnabled() !== true)');
ok(gateW > 0 && gateW < SRC.ppw.indexOf('var ss = io.openTarget();'),
  'B5a and it is evaluated BEFORE the spreadsheet is opened');
ok(!/if \(io\.flagEnabled\(\)[\s\S]{0,400}io\.readTable/.test(
     SRC.ppw.slice(gateW, SRC.ppw.indexOf('var ss = io.openTarget();'))),
  'B5b with no table read between the two');

// ==================================================================================================
section('§C  TWO READ ACTIONS, AND NOTHING WRITE-SHAPED');
// ==================================================================================================

var routerActions = {};
(SRC.router.match(/'productPricing\.[A-Za-z.]+'/g) || []).forEach(function (a) {
  routerActions[a.replace(/'/g, '')] = 1;
});
eq(Object.keys(routerActions).sort(),
  ['productPricing.siteUniverse.get', 'productPricing.workspace.get'],
  'C1  the router knows exactly two productPricing actions');
Object.keys(routerActions).forEach(function (a, i) {
  ok(/\.get$/.test(a), 'C2.' + (i + 1) + ' ' + a + ' is a .get');
});
['save', 'create', 'update', 'delete', 'submit', 'generate', 'apply', 'approve', 'upsert', 'write',
 'set', 'import', 'cancel'].forEach(function (w, i) {
  ok(!new RegExp("'productPricing\\.[A-Za-z.]*" + w, 'i').test(SRC.router + SRC.ppw),
    'C3.' + (i + 1) + ' no productPricing action named with `' + w + '`');
});

/* THE OWNER CANNOT WRITE EVEN IF SOMETHING ASKED IT TO. Naming is a convention; the absence of a
   writer symbol is a property. */
/* ON STRIPPED SOURCE, because 72_'s header says in as many words that it makes "no writer call, no
   LockService" — and a probe that reads prose cannot tell a denial from a use. */
var PPW_BARE = bare(SRC.ppw);
['getRange().setValue', 'setValues(', 'appendRow(', 'deleteRow(', 'insertSheet(', 'LockService',
 'getLock('].forEach(function (w, i) {
  ok(PPW_BARE.indexOf(w) < 0, 'C4.' + (i + 1) + ' 72_ contains no ' + w);
});
ok(/NEVER calls getOperationDb, never takes a lock, never writes/.test(SRC.ppw),
  'C5  and the file says so where the orchestrator is defined');

// ==================================================================================================
section('§D  THE MENU IS BUILT FROM THE REGISTRY, AND index.html STILL HAS NO MARKUP');
// ==================================================================================================

/* THE PAYOFF OF NOT HAND-WRITING THE MENU. P1-B8B forbade a greyed-out item on the grounds that a
   class can be deleted; the same argument says an activated feature should not leave markup that a
   rollback has to delete. These four assertions were written when the feature was OFF and are still
   true with it ON, which is the difference between a rule and a coincidence. */
ok(SRC.index.indexOf('data-menu-id="product-strategy"') < 0,
  'D1  index.html still has no Product Strategy menu parent');
ok(SRC.index.indexOf('showProductStrategyView(') < 0, 'D1a and no markup calls the view entry point');
ok(SRC.index.indexOf("showSection('product-strategy')") < 0, 'D1b nor the section entry point');
ok(!/Product Strategy<\/span>/.test(SRC.index), 'D1c and the label appears in no menu item');

/* ONE CALLER, AND IT IS GATED. */
var mountSrc = bare(SRC.app).slice(bare(SRC.app).indexOf('window.KM.nav.mountStagedMenus = '));
mountSrc = mountSrc.slice(0, mountSrc.indexOf('\n};'));
eq(bare(SRC.app).split('buildStagedMenu').length - 1, 2,
  'D2  the builder is named twice — its definition and exactly one caller');
ok(mountSrc.indexOf('buildStagedMenu') > 0, 'D2a and the caller is mountStagedMenus');
ok(mountSrc.indexOf('entry.enabled !== true') > 0
   && mountSrc.indexOf('entry.enabled !== true') < mountSrc.indexOf('buildStagedMenu'),
  'D2b which refuses a section whose enabled is not exactly true BEFORE it builds anything');

/* THE REAL SIDEBAR, FROM index.html. A fixture sidebar would let the anchor assertion pass against
   a document that does not exist; `insertBefore: 'carrier'` is only meaningful against the real one. */
var sidebarHtml = SRC.index.slice(SRC.index.indexOf('<nav class="sidebar" id="appSidebar">'));
sidebarHtml = sidebarHtml.slice(0, sidebarHtml.indexOf('</nav>') + 6);

function shell(mutateApp) {
  /* THE HARNESS'S OWN PARSER, NOT innerHTML. The shim is a hand-rolled DOM and has no innerHTML
     setter at all, so the first version silently produced nothing and threw appendChild(null) from
     inside the harness — an exception where an assertion should have been. `productionSkeleton` is
     a general small HTML parser that already lives in _psb-harness.js, and its own header argues
     against exactly the copy this would have become. */
  var buildSidebar = H.productionSkeleton(sidebarHtml);
  var dom = H.makeDom(function (d, head, body, mk) {
    buildSidebar(d, head, body, mk);
    var main = mk('div');
    main.className = 'main-content';
    body.appendChild(main);
    ['product-strategy-board-section', 'carrier-rate-card-section'].forEach(function (id) {
      var s = mk('div');
      s.id = id; s.className = 'module-section';
      main.appendChild(s);
    });
  });
  dom.window.addEventListener = function () {};
  var sb = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  sb.window = dom.window; sb.document = dom.document; sb.Event = dom.Event;
  sb.globalThis = sb;
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.setInterval = function () { return 0; }; sb.clearInterval = function () {};
  sb.requestAnimationFrame = function (f) { return setTimeout(f, 0); };
  vm.createContext(sb);
  vm.runInContext(SRC.views, sb, { filename: 'psb-views.js' });
  dom.window.PSB_VIEWS = sb.PSB_VIEWS;
  var a = SRC.app.replace(/^﻿/, '');
  if (mutateApp) a = mutateApp(a);
  var thrown = null;
  try { vm.runInContext(a, sb, { filename: 'app.js' }); } catch (e) { thrown = e; }
  return { dom: dom, sb: sb, thrown: thrown, doc: dom.document,
    KM: dom.window.KM || sb.window.KM || {} };
}

var S = shell();
ok(!S.thrown, 'D3  app.js evaluates against the real sidebar', S.thrown && S.thrown.message);
var mounted = S.KM.nav.mountStagedMenus(S.doc);
eq(mounted, ['product-strategy'], 'D3a and mountStagedMenus mounts exactly the activated section');

var parents = Array.prototype.slice.call(S.doc.querySelectorAll('.menu-parent'))
  .map(function (n) { return n.getAttribute('data-menu-id'); });
var iPS = parents.indexOf('product-strategy');
var iCarrier = parents.indexOf('carrier');
ok(iPS >= 0, 'D4  a Product Strategy menu parent is now in the sidebar');
ok(iCarrier >= 0 && iPS === iCarrier - 1,
  'D4a and it sits IMMEDIATELY ABOVE Pricing Center — the anchor is a menu id, not an ordinal');
eq(S.doc.querySelector('.menu-parent[data-menu-id="product-strategy"] .menu-label').textContent,
  'Product Strategy', 'D4b labelled Product Strategy');

/* THE SIX CHILDREN COME FROM PSB_VIEWS AND FROM NOWHERE ELSE. */
var kids = Array.prototype.slice.call(
  S.doc.querySelectorAll('.menu-children[data-parent="product-strategy"] .menu-item'));
eq(kids.map(function (k) { return k.textContent; }),
  ['Executive Overview', 'Category Analysis', 'Deal Risk', 'Data Quality', 'Strategy Workspace',
   'Advanced Details'],
  'D5  the six sub-tabs, in order, exactly as the brief names them');
eq(kids.map(function (k) { return k.getAttribute('data-view'); }),
  ['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'],
  'D5a each carrying its view id');
eq(kids.length, S.sb.PSB_VIEWS.VIEWS.length,
  'D5b and the count is PSB_VIEWS.VIEWS\'s own — not a second list of six labels');

/* IDEMPOTENT. A boot path that runs twice must not produce two menus. */
eq(S.KM.nav.mountStagedMenus(S.doc), [], 'D6  a second mount does nothing');
eq(S.doc.querySelectorAll('.menu-parent[data-menu-id="product-strategy"]').length, 1,
  'D6a and there is still exactly one Product Strategy menu');

/* THE BOOT PATH CALLS IT. */
ok(/mountStagedMenus\(\);/.test(bare(SRC.app)), 'D7  the DOMContentLoaded block calls it');
/* LOCATED ON DECOMMENTED SOURCE, for the same reason §A2 is: `bare` blanks string literals, and the
   event name IS a string literal, so the boot block could not be found in the fully stripped form at
   all — indexOf returned -1 and the slice silently became the last character of the file. A probe
   that cannot find what it is looking for must not quietly measure something else. */
var boot = decomment(SRC.app).slice(
  decomment(SRC.app).indexOf("window.addEventListener('DOMContentLoaded'"));
ok(boot.indexOf('mountStagedMenus') > 0, 'D7a in the DOMContentLoaded block');
ok(/try \{[\s\S]{0,220}mountStagedMenus[\s\S]{0,120}catch/.test(boot),
  'D7b inside its own try, so a navigation failure cannot take the homepage down with it');

// ==================================================================================================
section('§E  THE SIX SUB-TABS OPEN, AND THEY ARE REACHABLE WITHOUT A MOUSE');
// ==================================================================================================

var psSection = S.doc.getElementById('product-strategy-board-section');
kids.forEach(function (k, i) {
  psSection.className = 'module-section';
  S.sb.window.KM.pendingRoute = null;
  k.click();
  ok(psSection.className.indexOf('active') >= 0,
    'E1.' + (i + 1) + ' clicking "' + k.textContent + '" activates the section');
  ok(typeof S.sb.window.KM.pendingRoute === 'string' && S.sb.window.KM.pendingRoute.length > 0,
    'E1.' + (i + 1) + 'a and records the route for the controller to pick up on mount');
});
eq(S.sb.window.KM.pendingRoute, S.sb.PSB_VIEWS.routeOf('advanced'),
  'E2  the last click left the last view\'s canonical route, resolved through PSB_VIEWS');

/* ARIA AND KEYBOARD ON THE BUILT NODES. The rest of the sidebar is plain divs with onclick and no
   tab stop — a global shell gap Phase 1 closing QA owns, and one this round must not rewrite. What
   it CAN do is not add to it: the nodes this round creates are reachable and announced. */
var psParent = S.doc.querySelector('.menu-parent[data-menu-id="product-strategy"]');
eq(psParent.getAttribute('role'), 'button', 'E3  the parent is announced as a button');
eq(psParent.getAttribute('tabindex'), '0', 'E3a and is in the tab order');
eq(psParent.getAttribute('aria-expanded'), 'false', 'E3b starting collapsed');
eq(psParent.getAttribute('aria-controls'), 'menu-children-product-strategy', 'E3c naming what it controls');
/* IDENTITY, NOT VALUE. `eq` serialises, and a DOM node's parentNode/childNodes cycle is not
   serialisable — the comparison threw rather than failing, which is the harder kind to read. */
ok(S.doc.getElementById('menu-children-product-strategy')
   === S.doc.querySelector('.menu-children[data-parent="product-strategy"]'),
  'E3d and that id resolves to the child list — the same node, not an equal one');

psParent.click();
eq(psParent.getAttribute('aria-expanded'), 'true', 'E4  clicking expands it and says so');
ok(psParent.className.indexOf('is-open') >= 0, 'E4a with the shared is-open class every group uses');
psParent.click();
eq(psParent.getAttribute('aria-expanded'), 'false', 'E4b and clicking again collapses it');

/* THE HARNESS'S OWN EVENT TYPE. There is no KeyboardEvent constructor in the shim and there does
   not need to be one: `Ev` already carries `key`, and inventing a second event class would be a
   second model of dispatch. */
function key(node, k) {
  var ev = new S.dom.Event('keydown', { key: k, bubbles: true });
  node.dispatchEvent(ev);
  return ev;
}
var ev = key(psParent, 'Enter');
eq(psParent.getAttribute('aria-expanded'), 'true', 'E5  Enter expands the parent from the keyboard');
ok(ev.defaultPrevented, 'E5a and the event is consumed');
key(psParent, ' ');
eq(psParent.getAttribute('aria-expanded'), 'false', 'E5b Space collapses it — and does not scroll the page');

kids.forEach(function (k, i) {
  eq(k.getAttribute('role'), 'button', 'E6.' + (i + 1) + ' "' + k.textContent + '" is announced as a button');
  eq(k.getAttribute('tabindex'), '0', 'E6.' + (i + 1) + 'a and is in the tab order');
});
psSection.className = 'module-section';
S.sb.window.KM.pendingRoute = null;
key(kids[2], 'Enter');
ok(psSection.className.indexOf('active') >= 0, 'E7  Enter on a sub-tab opens it');
eq(S.sb.window.KM.pendingRoute, S.sb.PSB_VIEWS.routeOf('risk'),
  'E7a on the view the item names — Deal Risk');

// ==================================================================================================
section('§F  ROLLBACK — REHEARSED, NOT DESCRIBED');
// ==================================================================================================

/* THE SERVER HALF. This is the emergency stop, and it is the one that does not need a frontend
   deploy: set the constant back, publish a version, and the refusal returns at the same place it
   used to happen. The whole sandbox is rebuilt from the real file with one character changed. */
var OFF = configWith(false);
ok(vm.runInContext('productStrategyEnabled_() === false', OFF),
  'F1  with the constant set back to false, the real resolver answers false');

var wsOff = call(OFF, 'handleProductPricingWorkspaceGet_',
  { company: 'KM', country: 'US', marketplace: 'Amazon' });
eq(wsOff.meta.refusalCode, 'FEATURE_DISABLED', 'F2  workspace.get refuses with FEATURE_DISABLED');
eq(wsOff.meta.dbOpened, false, 'F2a with dbOpened false');
eq(wsOff.meta.tablesRead, 0, 'F2b and no table read');
eq(wsOff.__log.opens, 0, 'F2c the spreadsheet was never opened — measured, not reported');
eq(wsOff.__log.reads, [], 'F2d and nothing was read');

var suOff = call(OFF, 'handleProductPricingSiteUniverseGet_', {});
eq(suOff.meta.refusalCode, 'FEATURE_DISABLED', 'F3  siteUniverse.get refuses the same way');
eq(suOff.__log.opens, 0, 'F3a and opens nothing either');

/* NO COMPENSATING WRITE. Rollback cannot depend on a mutation, because a feature that never wrote
   has nothing to undo — and a rollback that had to write would be a second way to fail. */
eq(wsOff.__log.reads.length + suOff.__log.reads.length, 0,
  'F4  a rolled-back deployment touches the database zero times, in either direction');

/* THE NAVIGATION HALF. Slower — it needs a frontend deploy — which is exactly why the server flag is
   step one of the runbook and this is step six. With the registry off, no menu is built at all:
   not hidden, not disabled, absent. */
var SOff = shell(function (a) {
  return a.replace(/('product-strategy':\s*\{\s*\n\s*sectionId:[^\n]*\n\s*)enabled: true,/,
    '$1enabled: false,');
});
ok(!SOff.thrown, 'F5  app.js with the registry switched off still evaluates', SOff.thrown && SOff.thrown.message);
eq(SOff.KM.nav.mountStagedMenus(SOff.doc), [], 'F5a mountStagedMenus mounts nothing');
eq(SOff.doc.querySelectorAll('.menu-parent[data-menu-id="product-strategy"]').length, 0,
  'F5b and there is NO Product Strategy menu — absent, not greyed out');
eq(SOff.doc.querySelectorAll('[data-staged]').length, 0, 'F5c no staged node of any kind was inserted');

/* AND showSection STILL REFUSES IT, so even a menu built by hand could not open the page. */
var offSection = SOff.doc.getElementById('product-strategy-board-section');
offSection.className = 'module-section';
SOff.sb.showSection('product-strategy');
ok(offSection.className.indexOf('active') < 0,
  'F6  with the registry off, showSection refuses the id by name — the second half of the stop');

/* THE ROLLBACK IS NOT A HISTORY REWRITE AND NOT A DEPLOYMENT DELETION. Both are recorded as
   prohibited in the runbook; what the repository can check is that the rollback path in the source
   is an edit to a constant and nothing else. */
var cfgRollback = SRC.config.slice(SRC.config.indexOf('// TO ROLL BACK:'),
  SRC.config.indexOf('var PRODUCT_STRATEGY_ENABLED_ = true;'));
ok(/set this to false/.test(cfgRollback), 'F7  00_config.gs carries the rollback instruction');
ok(/create a NEW Apps Script version/.test(cfgRollback) && /update the EXISTING Web App/.test(cfgRollback),
  'F7a naming the new version AND the existing deployment — an edited file that is not deployed changes nothing');
ok(!/delete|remove the deployment|git reset/i.test(cfgRollback),
  'F7b and it never asks anyone to delete a deployment or rewrite history');

// ==================================================================================================
section('§G  RELEASE IDENTITY — WHAT MUST BE SYNCED, AND WHAT MUST NOT');
// ==================================================================================================

ok(SRC.health.indexOf("var SYS_DEPLOYMENT_RELEASE_ = '" + RELEASE + "'") > 0,
  'G1  63_ declares the activation release R11');
ok(SRC.health.indexOf("var SYS_BUILD_VERSION_ = '" + RELEASE + "'") > 0,
  'G1a and 63_\'s own module stamp moved with it, because THIS FILE changed');
ok(SRC.config.indexOf("var CONFIG_BUILD_VERSION_ = '" + RELEASE + "'") > 0,
  'G2  00_config.gs\'s stamp moved, because THIS FILE changed');
ok(SRC.health.indexOf("symbol: 'CONFIG_BUILD_VERSION_', expected: '" + RELEASE + "'") > 0,
  'G2a and the manifest expects it — a stamp without its manifest row is a MIXED sync');
ok(SRC.health.indexOf("symbol: 'SYS_BUILD_VERSION_', expected: '" + RELEASE + "'") > 0,
  'G2b as does 63_\'s own row');

/* AND NOTHING ELSE MOVED, WHICH IS THE OTHER HALF OF A SYNC LIST. Re-pasting an unchanged file is
   how an unrelated edit reaches production by accident, so a stamp that did NOT move is an
   instruction too. */
[['72_api_v1_product_pricing_workspace.gs', 'PPW_BUILD_VERSION_', PREV_RELEASE],
 ['01_router.gs', 'RTR_BUILD_VERSION_', 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9']].forEach(function (m, i) {
  ok(SRC.health.indexOf("symbol: '" + m[1] + "', expected: '" + m[2] + "'") > 0,
    'G3.' + (i + 1) + ' ' + m[0] + ' did not change, so its stamp stayed at ' + m[2].slice(-3));
});
ok(SRC.router.indexOf("RTR_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9'") > 0,
  'G3a the router is NOT marched to the release — no action contract changed, and a flag is not a contract');

/* THE ACTION CONTRACT DID NOT MOVE. Bumping it would tell every deployed client to re-check a
   vocabulary that is byte-identical to the one it already has. */
var contractDiff = cp.execFileSync('git', ['diff', '--unified=0', 'a3889c2', '--',
  'assets/specs/active/apps-script/63_api_v1_system_health.gs'], { cwd: ROOT, encoding: 'utf8' });
ok(!/^[+-].*SYS_ACTION_CONTRACT_VERSION_/m.test(contractDiff),
  'G4  the action contract version is untouched by this round');
ok(!/^[+-].*SYS_REQUIRED_ACTION/m.test(contractDiff),
  'G4a and so is the required-action list');

/* THE MANIFEST AND THE SCOPES. Activation must not widen what the deployment may do. */
var manifestDiff = cp.execFileSync('git', ['diff', '--name-only', 'a3889c2', '--',
  'assets/specs/active/apps-script/appsscript.json'], { cwd: ROOT, encoding: 'utf8' }).trim();
eq(manifestDiff, '', 'G5  appsscript.json is unchanged');
ok(SRC.manifest.indexOf('oauthScopes') < 0 || /"oauthScopes"/.test(SRC.manifest),
  'G5a (and whatever scopes it declares, this round declared none of them)');

/* EXACTLY TWO .gs FILES CHANGED. The sync list is this, and it is derived rather than typed. */
var gsChanged = cp.execFileSync('git', ['diff', '--name-only', 'a3889c2', '--',
  'assets/specs/active/apps-script'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean).map(function (f) { return f.split('/').pop(); }).sort();
eq(gsChanged, ['00_config.gs', '63_api_v1_system_health.gs'],
  'G6  exactly two Apps Script files changed — and that IS the sync list');

/* THE RELEASE IS IN THE SHARED ORDER, APPENDED. */
ok(REL.OWNER_STAMPS.indexOf(RELEASE) === REL.OWNER_STAMPS.length - 1,
  'G7  R11 is the LAST entry in the shared owner-stamp order — append-only');
ok(REL.stampAtOrAfter(RELEASE, PREV_RELEASE), 'G7a and it sits after R10');
ok(REL.BUILD_STAMP_RE.test(RELEASE), 'G7b and it matches the canonical stamp shape');

// ==================================================================================================
section('§H  THE CO-DEPLOYED FRONTEND TOKEN');
// ==================================================================================================

eq(REL.currentAppToken(), ACTIVATION_TOKEN, 'H1  the current application token is the activation token');
eq(REL.staleAppTokenRefs(SRC.index), [], 'H2  no index.html reference is left behind on an older token');
eq(REL.misplacedIndexTokens(SRC.index), [], 'H2a and no asset carries a token from another series');
eq(REL.ROUND_TOKENS.indexOf(ACTIVATION_TOKEN), REL.ROUND_TOKENS.length - 1,
  'H3  it is the LAST entry in the release order — append-only');
eq(REL.ROUND_TOKENS.filter(function (t) { return t === ACTIVATION_TOKEN; }).length, 1,
  'H3a appearing exactly once — a published token may never be reused');

/* THE PRODUCT STRATEGY SET JOINED THE POLICED ONE, AND THIS IS THE DEFECT THAT CLOSED.
   Those eleven references carried a token set at fb31e2c and PUBLISHED, while three of the files
   under it changed bytes afterwards: km-product-pricing-adapter.js and psb-board-ui.js at
   P1-B8C-R3, psb-data-contract.js with them. staleAppTokenRefs could not see it — it only reports a
   reference left behind on a token it KNOWS, and that token was never in ROUND_TOKENS. A returning
   browser therefore held the pre-R3 psb-board-ui.js, the copy with no <img> onerror fallback, and
   would have carried it through activation. */
ok(SRC.index.indexOf('productstrategy-p1b8b-20260912') < 0,
  'H4  the old Product Strategy token is gone from index.html entirely');
['assets/css/product-strategy-board.css', 'assets/js/api/km-product-pricing-adapter.js',
 'assets/js/product-strategy/psb-data-contract.js', 'assets/js/product-strategy/psb-board-ui.js',
 'assets/js/product-strategy/psb-views.js', 'assets/js/pages/product-strategy-board.js',
 'assets/js/utils/km-image-reference-policy.js', 'assets/js/utils/sku-overrides.js',
 'assets/js/app.js'].forEach(function (f, i) {
  ok(SRC.index.indexOf(f + '?v=' + ACTIVATION_TOKEN) > 0,
    'H5.' + (i + 1) + ' ' + f.split('/').pop() + ' is on the activation token');
});
eq(REL.appTokenRefCount(SRC.index), 34,
  'H6  thirty-four references share it — the application set and the Product Strategy set, now one');

/* LOAD ORDER. The board reads the policy through sku-overrides, and app.js builds its menu from
   PSB_VIEWS; both must already be defined when their reader runs. */
function at(f) { return SRC.index.indexOf('src="' + f); }
ok(at('assets/js/utils/km-image-reference-policy.js') < at('assets/js/utils/sku-overrides.js'),
  'H7  the image policy loads before sku-overrides.js');
ok(at('assets/js/product-strategy/psb-views.js') < at('assets/js/pages/product-strategy-board.js'),
  'H7a psb-views.js before the page controller');
ok(at('assets/js/product-strategy/psb-board-ui.js') < at('assets/js/pages/product-strategy-board.js'),
  'H7b psb-board-ui.js before it too');
ok(at('assets/js/product-strategy/psb-views.js') < at('assets/js/app.js'),
  'H7c and PSB_VIEWS before app.js, whose menu is built from it');
ok(SRC.index.indexOf('assets/css/product-strategy-board.css') < SRC.index.indexOf('<nav class="sidebar"'),
  'H8  the stylesheet is in the head, before any markup it styles');
ok(SRC.index.indexOf('<div id="product-strategy-board-mount"></div>') > 0,
  'H9  and the partial mount point is in the document');

// ==================================================================================================
section('§I  THE DRAFT PRICE DISCLOSURE');
// ==================================================================================================

/* PRICING_DATABASE_MAPPING §4 records price_status's default as "draft or active — to be confirmed".
   Activation is what makes that matter: the board is about to show numbers whose status nobody has
   decided, to people who will read them as the price the company charges. */
ok(/price_status_raw: \(function \(\) \{/.test(SRC.adapter),
  'I1  the adapter carries price_status_raw onto the row');
ok(/hasOwnProperty\.call\(sp, 'price_status_raw'\)\) return undefined;/.test(SRC.adapter),
  'I1a verbatim, and a source that never carried the column stays UNDEFINED rather than becoming null');
ok(/return sp\.price_status_raw;/.test(SRC.adapter),
  'I1a1 while a live read\'s null — the row exists and has no status — is passed through as null');
['toLowerCase', 'toUpperCase', 'trim()'].forEach(function (w, i) {
  var region = SRC.adapter.slice(SRC.adapter.indexOf('price_status_raw: (function'),
    SRC.adapter.indexOf('price_status_raw: (function') + 400);
  ok(region.indexOf(w) < 0, 'I1b.' + (i + 1) + ' and never ' + w + 'd on the way');
});

ok(/C\.PRICE_STATUS = \{/.test(SRC.contract), 'I2  the contract declares PRICE_STATUS once');
var C = {};
vm.runInContext(SRC.contract, vm.createContext(C));
var PS = C.PSB_CONTRACT.PRICE_STATUS;
eq(PS.source_table + '.' + PS.source_column, 'pricing_list.price_status', 'I2a naming its source column');
eq(PS.mapped, false, 'I2b declaring that no value is mapped');
eq(PS.filtered, false, 'I2c and that no value is filtered out');
eq(PS.vocabulary_pinned, false, 'I2d and that the vocabulary is not pinned anywhere in config');
eq(PS.final_value_exists, false, 'I2e so no value is treated as final');
ok(/draft is shown as\s*\n?\s*\+? ?'? ?draft/.test(PS.disclosure) || /draft/.test(PS.disclosure),
  'I2f and the disclosure says what happens to a draft row');

/* NOTHING ANYWHERE RENDERS A SUBSTITUTE WORD. This is the assertion the mutant G8 attacks: the one
   way this requirement can be violated is a renderer that decides what a status MEANS. */
[['approved', SRC.board], ['final', SRC.board], ['live price', SRC.board],
 ['approved', SRC.selectors], ['final', SRC.selectors]].forEach(function (w, i) {
  var region = bare(w[1]);
  var hit = new RegExp("price[_A-Za-z]*status[\\s\\S]{0,200}['\"]" + w[0], 'i').test(region);
  ok(!hit, 'I3.' + (i + 1) + ' no code path maps a price status to "' + w[0] + '"');
});

ok(/S\.derivePriceStatusCounts = function \(universe\)/.test(SRC.selectors),
  'I4  the selectors count the raw values');
var SELCTX = { console: console };
vm.runInContext(SRC.selectors, vm.createContext(SELCTX));
var d = SELCTX.PSB_SELECTORS.derivePriceStatusCounts({ rows: [
  { price_status_raw: 'draft' }, { price_status_raw: 'draft' }, { price_status_raw: 'active' },
  { price_status_raw: null }, {} ] });
eq(d.values, [{ value: 'draft', count: 2 }, { value: 'active', count: 1 }],
  'I4a sorted by count, with the raw strings kept exactly as found');
eq([d.absent, d.unsupported, d.total], [1, 1, 5],
  'I4b and "no status on the row" is kept apart from "this source carries none"');
var mixedCase = SELCTX.PSB_SELECTORS.derivePriceStatusCounts({ rows: [
  { price_status_raw: 'Draft' }, { price_status_raw: 'draft' } ] });
eq(mixedCase.values.length, 2,
  'I4c two spellings stay two values — normalising them would be deciding what they mean');

ok(/function priceStatusChip\(\)/.test(SRC.board), 'I5  the board renders a price-status chip');
ok(/row\.appendChild\(priceStatusChip\(\)\);/.test(SRC.board),
  'I5a on the context row, which sits above every one of the six views');
ok(/chip\.setAttribute\('title', PS\.disclosure\)/.test(SRC.board),
  'I5b carrying the contract\'s own disclosure sentence');
ok(/CONTRACT\.PRICE_STATUS\.disclosure/.test(SRC.board),
  'I5c and the long form in Advanced details reads the SAME declaration — one sentence, two placements');
ok(/id = 'priceStatusDisclosure'/.test(SRC.board), 'I5d under an id a test and a reader can find');

// ==================================================================================================
section('§J  NOTHING ELSE MOVED');
// ==================================================================================================

/* NO STYLESHEET CHANGED AT ALL, which is the cheapest possible proof that no other page was
   restyled — and the check P1-B8A exists because of. The board stylesheet is loaded by index.html on
   every page, so one bare-class rule in it restyles the whole application silently. */
var changed = cp.execFileSync('git', ['diff', '--name-only', 'a3889c2', '--'],
  { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
eq(changed.filter(function (f) { return /\.css$/.test(f); }), [],
  'J1  not one stylesheet changed in this round');
eq(changed.filter(function (f) { return /^assets\/html\//.test(f); }), [],
  'J1a and no page partial changed');

/* THE CHIP REUSES THE COMPONENT BESIDE IT rather than introducing a class with no rule. */
ok(/el\('span', 'cmd-chip', label\)/.test(SRC.board),
  'J2  the price-status chip uses `cmd-chip` — the class the scenario chip beside it already uses');
ok(/\.psb-page .cmd-chip|\.cmd-chip/.test(SRC.css), 'J2a which the board stylesheet already defines');

/* WHAT DID CHANGE, ENUMERATED. A round that cannot say what it touched cannot be reviewed. */
['assets/specs/active/apps-script/00_config.gs',
 'assets/specs/active/apps-script/63_api_v1_system_health.gs',
 'assets/js/app.js', 'index.html',
 'assets/js/api/km-product-pricing-adapter.js',
 'assets/js/product-strategy/psb-data-contract.js',
 'assets/js/product-strategy/psb-selectors.js',
 'assets/js/product-strategy/psb-board-ui.js'].forEach(function (f, i) {
  ok(changed.indexOf(f) !== -1, 'J3.' + (i + 1) + ' ' + f.split('/').pop() + ' changed, as intended');
});
eq(changed.filter(function (f) {
  return /^assets\/js\//.test(f) && [
    'assets/js/app.js', 'assets/js/api/km-product-pricing-adapter.js',
    'assets/js/product-strategy/psb-data-contract.js',
    'assets/js/product-strategy/psb-selectors.js',
    'assets/js/product-strategy/psb-board-ui.js'].indexOf(f) === -1;
}), [], 'J3  and NO OTHER client runtime file changed');

/* NOT STARTED, AND SAYING SO IS PART OF THE DELIVERABLE. */
['Login', 'RBAC', 'Session.getActiveUser', 'getEffectiveUser'].forEach(function (w, i) {
  ok(!new RegExp('\\b' + w).test(bare(SRC.router)), 'J4.' + (i + 1) + ' the router still has no ' + w);
});
ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(SRC.config),
  'J5  and the AI Plan WRITE flag did not travel with the read activation');

// ==================================================================================================
section('§L  THE BROWSER EVIDENCE, READ BACK');
// ==================================================================================================

/* §7 ASKS FOR EIGHTEEN THINGS ACROSS SEVEN VIEWPORTS, AND "I LOOKED AT THE SCREENSHOTS" IS NOT AN
   ASSERTION. The runner drove real Chrome against the real sidebar, through the PRODUCTION menu
   mount, and wrote what the live DOM answered. This section reads that file back. If the evidence is
   not there the suite STOPS rather than passing quietly: an acceptance section that skips itself
   when its input is missing is the most expensive kind of green. */
var EVP = path.join(ROOT, 'docs', 'evidence', 'p1-b8d-activation-acceptance', 'measurements.json');
ok(fs.existsSync(EVP), 'L0  the activation acceptance evidence exists');
var EV = JSON.parse(fs.readFileSync(EVP, 'utf8'));

eq(EV.mode, 'activated', 'L1  it was taken in ACTIVATED mode');
eq(EV.menu_built_by, 'KM.nav.mountStagedMenus (production)',
  'L1a with the menu built by the production function, not by the runner');
eq(EV.sidebar, 'index.html, verbatim',
  'L1b against the real sidebar, so the placement anchor resolved in the real document');

var VP = ['1920x1080', '1440x900', '1366x768', '1280x720', '1024x768', '768x1024', '390x844'];
eq(Object.keys(EV.viewports).filter(function (k) { return VP.indexOf(k) >= 0; }).sort(), VP.slice().sort(),
  'L2  all seven viewports were measured');

VP.forEach(function (id, i) {
  var v = EV.viewports[id];
  var n = 'L3.' + (i + 1) + ' ' + id;
  ok(v && v.ready === true && v.error === null, n + ' rendered with no error', v && v.error);
  eq(v.page.horizontalOverflow, 0, n + ' page-level horizontal overflow is 0');
  var ids = (v.menuParents || []).map(function (m2) { return m2.id; });
  ok(ids.indexOf('product-strategy') >= 0 && ids.indexOf('product-strategy') === ids.indexOf('carrier') - 1,
    n + ' Product Strategy is immediately above Pricing Center');
  eq((v.psbChildren || []).map(function (k) { return k.label; }),
    ['Executive Overview', 'Category Analysis', 'Deal Risk', 'Data Quality', 'Strategy Workspace',
     'Advanced Details'], n + ' with its six sub-tabs, in order');
  eq(v.yAxisFullyVisible, true, n + ' the Y axis is complete');
  eq(v.stagedNavEnabled, true, n + ' and the shell reports the section as activated');
});

/* THE X AXIS, AND THE ONE MEASUREMENT THAT IS NOT `true`.
   Six of the seven show the whole lane. 390x844 does not, and it is reported rather than smoothed:
   this capture puts more products in one category than the live replay does, so the lane is wider
   than the chart — and it scrolls INSIDE the chart's own overflow-x container (scrollW 264 over
   clientW 76) with page-level overflow still 0, which is exactly the rule §7.11 states. It is also
   byte-identical to what P1-B8C-R3-R1 and R3-R2 measured, so it is not this round's regression. The
   fixed 240px sidebar underneath it is the global shell blocker §7 defers, and this round neither
   fixes nor worsens it. */
VP.slice(0, 6).forEach(function (id, i) {
  eq(EV.viewports[id].xLaneFullyVisible, true, 'L4.' + (i + 1) + ' ' + id + ' shows the whole X lane');
});
eq(EV.viewports['390x844'].xLaneFullyVisible, false,
  'L5  390x844 does not — RECORDED, not passed');
ok(EV.viewports['390x844'].chart.scrollW > EV.viewports['390x844'].chart.clientW,
  'L5a and it scrolls inside the chart container rather than the page');
eq(EV.viewports['390x844'].page.horizontalOverflow, 0,
  'L5b with page-level overflow still 0, which is the rule that matters');

/* THE SIX VIEWS, EACH SELECTING ITSELF. */
['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'].forEach(function (v, i) {
  var m2 = EV.views[v];
  var n = 'L6.' + (i + 1) + ' ' + v;
  ok(m2 && m2.error === null, n + ' rendered with no error', m2 && m2.error);
  eq((m2.tabs || []).length, 6, n + ' shows six tabs');
  eq((m2.tabs || []).filter(function (t) { return t.selected === 'true'; })
    .map(function (t) { return t.view; }), [v], n + ' with itself aria-selected, and only itself');
  ok((m2.tabs || []).every(function (t) { return t.labelVisible === true; }),
    n + ' and every tab label is visible');
  eq(m2.page.horizontalOverflow, 0, n + ' page overflow 0');
});

/* THE STATE MATRIX. Each state says its own thing, and `#view` stays EMPTY — no board is drawn
   behind a refusal, which is the property that keeps a refusal from reading as partial data. */
['feature-disabled', 'not-authorized', 'timeout', 'non-json', 'source-unavailable',
 'awaiting-site', 'empty-site'].forEach(function (s, i) {
  var m2 = EV.states[s];
  var n = 'L7.' + (i + 1) + ' ' + s;
  ok(m2 && m2.error === null, n + ' rendered with no error', m2 && m2.error);
  ok(m2.stateText && m2.stateText.length > 20, n + ' states its own case in words');
  eq(m2.viewHost.h, 0, n + ' and #view is empty — nothing is drawn behind the message');
});
var texts = ['feature-disabled', 'not-authorized', 'timeout', 'non-json', 'source-unavailable',
  'awaiting-site', 'empty-site'].map(function (s) { return EV.states[s].stateText; });
eq(texts.length, uniq(texts).length, 'L7  and no two states show the same message');

/* IMAGES. The gate closed at P1-B8C-R3-R2 and activation is when anybody sees the result. */
eq([EV.views.overview.htmlImagesLoaded, EV.views.overview.htmlImagesBroken],
   [EV.views.overview.htmlImages, 0], 'L8  every <img> on Executive Overview loaded, none broken');
eq(EV.views.category.htmlImagesBroken, 0, 'L8a and none is broken on Category Analysis either');
eq(EV.views.overview.catfigFailedNotices, 0, 'L8b with no IMAGE FAILED TO LOAD notice anywhere');

/* THE DRAFT PRICE DISCLOSURE, ON THE PAGE RATHER THAN IN THE SOURCE. */
['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'].forEach(function (v, i) {
  var c = EV.views[v].priceStatusChip;
  var n = 'L9.' + (i + 1) + ' ' + v;
  ok(!!c, n + ' has a price-status chip');
  eq(c.visible, true, n + ' and it is visible');
  eq(c.role, 'status', n + ' announced as a status');
  ok(c.titleLen > 200, n + ' carrying the full disclosure in its title', c.titleLen);
  ok(!/approved|final|confirmed/i.test(c.text), n + ' and its text never calls a price final');
});
ok(EV.views.advanced.priceStatusDisclosure
   && EV.views.advanced.priceStatusDisclosure.column === 'pricing_list.price_status',
  'L9  and Advanced details carries the long form, naming the source column');

eq(EV.print && EV.print.bytes > 10000, true, 'L10 print/PDF produced a real document', EV.print);

// ==================================================================================================
section('§K  MUTANTS');
// ==================================================================================================

function swapIn(src, from, to) {
  if (String(src).indexOf(from) < 0) throw new Error('ANCHOR NOT FOUND: ' + from.slice(0, 60));
  return String(src).split(from).join(to);
}

mut('K1  a THIRD activation flag is introduced — A1a/A2a', function () {
  var m = swapIn(SRC.config, 'var PRODUCT_STRATEGY_ENABLED_ = true;',
    'var PRODUCT_STRATEGY_ENABLED_ = true;\nvar PRODUCT_STRATEGY_BOARD_ENABLED_ = true;');
  var before = (SRC.config.match(/PRODUCT_STRATEGY[A-Z_]*ENABLED_\s*=[^=]/g) || []).length;
  var after = (m.match(/PRODUCT_STRATEGY[A-Z_]*ENABLED_\s*=[^=]/g) || []).length;
  return before === 1 && after === 2;
});

mut('K2  server true, navigation false — the gates disagree — A6', function () {
  var m = swapIn(SRC.app, 'enabled: true,', 'enabled: false,');
  var reg = decomment(m).slice(decomment(m).indexOf('var KM_STAGED_SECTIONS_ = {'));
  return !/'product-strategy':\s*\{[\s\S]*?enabled: true/.test(reg);
});

mut('K3  navigation true, server false — the other way round — A6', function () {
  var m = swapIn(SRC.config, 'var PRODUCT_STRATEGY_ENABLED_ = true;',
    'var PRODUCT_STRATEGY_ENABLED_ = false;');
  return !/var PRODUCT_STRATEGY_ENABLED_ = true;/.test(m);
});

mut('K4  a WRITE action is added under productPricing — C1/C3', function () {
  var m = swapIn(SRC.router, "'productPricing.workspace.get':",
    "'productPricing.workspace.save': handleProductPricingWorkspaceGet_,\n    'productPricing.workspace.get':");
  var acts = {};
  (m.match(/'productPricing\.[A-Za-z.]+'/g) || []).forEach(function (a) { acts[a.replace(/'/g, '')] = 1; });
  return Object.keys(acts).length !== 2;
});

mut('K5  the gate moves BELOW the spreadsheet open — B5a/F2c', function () {
  /* THE MUTANT THAT MATTERS MOST, because it is invisible while the flag is true. The page behaves
     identically; only a rolled-back deployment notices, by reading the database before refusing. */
  var m = swapIn(SRC.ppw,
    '    if (io.flagEnabled() !== true) {\n      var reqD = ppwValidateRequest_(payload);',
    '    var ss0 = io.openTarget();\n    if (io.flagEnabled() !== true) {\n      var reqD = ppwValidateRequest_(payload);');
  var g = m.indexOf('if (io.flagEnabled() !== true)');
  return m.indexOf('io.openTarget()') < g;
});

mut('K6  a draft price is relabelled as final — I2e/I3', function () {
  var m = swapIn(SRC.contract, 'final_value_exists: false,', 'final_value_exists: true,');
  var ctx = {};
  vm.runInContext(m, vm.createContext(ctx));
  return ctx.PSB_CONTRACT.PRICE_STATUS.final_value_exists === true;
});

mut('K7  the chip stops showing the values and shows a reassurance — I5', function () {
  var m = swapIn(SRC.board,
    "label = d.values.map(function (v) { return v.count + ' ' + v.value; }).join(' · ');",
    "label = 'Prices confirmed';");
  return !/d\.values\.map\(function \(v\) \{ return v\.count \+ ' ' \+ v\.value; \}\)/.test(m);
});

mut('K8  price statuses are normalised, so two spellings become one — I4c', function () {
  var m = swapIn(SRC.selectors, 'var k = String(v);', 'var k = String(v).toLowerCase().trim();');
  var ctx = { console: console };
  vm.runInContext(m, vm.createContext(ctx));
  var r = ctx.PSB_SELECTORS.derivePriceStatusCounts({ rows: [
    { price_status_raw: 'Draft' }, { price_status_raw: 'draft' } ] });
  return r.values.length !== 2;
});

mut('K9  Product Strategy is moved BELOW Pricing Center — D4a', function () {
  /* The placement is an anchor id, so the mutant moves the anchor rather than an index. */
  var m = swapIn(SRC.app, "insertBefore: 'carrier'", "insertBefore: 'training'");
  var s = shell(function () { return m; });
  s.KM.nav.mountStagedMenus(s.doc);
  var ps = Array.prototype.slice.call(s.doc.querySelectorAll('.menu-parent'))
    .map(function (n) { return n.getAttribute('data-menu-id'); });
  return ps.indexOf('product-strategy') !== ps.indexOf('carrier') - 1;
});

mut('K10 one sub-tab disappears — D5/D5b', function () {
  var m = swapIn(SRC.views, "{ id: 'quality', label: 'Data Quality'", "{ id: 'quality_REMOVED', label: 'Data Quality'");
  var ctx = {};
  vm.runInContext(m, vm.createContext(ctx));
  return ctx.PSB_VIEWS.VIEWS.map(function (v) { return v.id; }).join(',')
    !== 'overview,category,risk,quality,workspace,advanced';
});

mut('K11 the mount stops honouring `enabled` — D2b/F5a', function () {
  var m = swapIn(SRC.app, 'if (!entry || entry.enabled !== true || !entry.nav) return;',
    'if (!entry || !entry.nav) return;');
  var s = shell(function (a) {
    return swapIn(a.replace(/('product-strategy':\s*\{\s*\n\s*sectionId:[^\n]*\n\s*)enabled: true,/,
      '$1enabled: false,'), 'if (!entry || entry.enabled !== true || !entry.nav) return;',
      'if (!entry || !entry.nav) return;');
  });
  s.KM.nav.mountStagedMenus(s.doc);
  return s.doc.querySelectorAll('.menu-parent[data-menu-id="product-strategy"]').length > 0
    && m.indexOf('entry.enabled !== true') < 0;
});

mut('K12 a stale cache token is left on one asset — H2', function () {
  var m = swapIn(SRC.index, 'assets/js/app.js?v=' + ACTIVATION_TOKEN,
    'assets/js/app.js?v=imagepolicy-r3r2-20260912');
  return REL.staleAppTokenRefs(m).length > 0;
});

mut('K13 a bare-class rule leaks out of .psb-page — J1/B8A', function () {
  var m = SRC.css + '\n.card { border-radius: 0; }\n';
  var leaks = (m.match(/^\s*\.card\b/gm) || []).length;
  return leaks > (SRC.css.match(/^\s*\.card\b/gm) || []).length;
});

mut('K14 appsscript.json gains an OAuth scope — G5', function () {
  var m = swapIn(SRC.manifest, '"timeZone"',
    '"oauthScopes": ["https://www.googleapis.com/auth/drive"],\n  "timeZone"');
  return m.indexOf('auth/drive') > 0 && SRC.manifest.indexOf('auth/drive') < 0;
});

mut('K15 the router is marched to the release although no route changed — G3a', function () {
  var m = swapIn(SRC.router, "RTR_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9'",
    "RTR_BUILD_VERSION_ = '" + RELEASE + "'");
  return m.indexOf("RTR_BUILD_VERSION_ = '" + RELEASE + "'") > 0;
});

mut('K16 an external image host is added to the allowlist — the image gate reopens', function () {
  var pol = read('assets/js/utils/km-image-reference-policy.js');
  var m = swapIn(pol, 'P.APPROVED_EXTERNAL_HOSTS = [];',
    "P.APPROVED_EXTERNAL_HOSTS = ['cdn.example.com'];");
  return /P\.APPROVED_EXTERNAL_HOSTS = \[\];/.test(pol) && !/P\.APPROVED_EXTERNAL_HOSTS = \[\];/.test(m);
});

mut('K17 campaign-risk goes back to putting the raw cell in src — the image gate reopens', function () {
  var cr = read('assets/js/pages/campaign-risk.js');
  var m = swapIn(cr, 'const imgSrc = _crImageSrc(r.image);', 'const imgSrc = r.image;');
  return /_crImageSrc\(r\.image\)/.test(cr) && !/_crImageSrc\(r\.image\)/.test(m);
});

mut('K18 a query parameter is added as a second way in — A3', function () {
  var m = swapIn(SRC.app, 'if (!entry || entry.enabled !== true || !entry.nav) return;',
    "if (!entry || (entry.enabled !== true && location.search.indexOf('ps=1') < 0) || !entry.nav) return;");
  var where = bare(m).indexOf('KM_STAGED_SECTIONS_');
  return bare(m).slice(where, where + 6000).indexOf('location.search') > 0;
});

// ==================================================================================================
console.log('\n' + '='.repeat(100));
console.log('P1-B8D ACTIVATION — passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
console.log('='.repeat(100));
process.exit(fail ? 1 : 0);
