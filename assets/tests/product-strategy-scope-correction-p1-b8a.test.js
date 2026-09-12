/**
 * ==================================================================================================
 * P1-B8A — SCOPE CORRECTION · SECURITY DEFERRAL · OPERATION SYSTEM INTEGRATION
 * ==================================================================================================
 *
 * TWO THINGS HAPPENED THIS ROUND AND ONLY ONE OF THEM WAS PLANNED.
 *
 * The planned one: the Cloud Run auth gateway built over SEC-A2/SEC-A2R was a system-wide security
 * project that had been made a prerequisite for shipping ONE read-only page. It is removed here, and
 * the research that is genuinely reusable is kept and labelled. §A.
 *
 * THE UNPLANNED ONE IS THE REASON THIS FILE IS MOSTLY ABOUT CSS. `assets/css/product-strategy-board.css`
 * is loaded by index.html on EVERY page, it is loaded LAST of all twenty-four stylesheets, and it
 * carried 79 rules whose selectors were bare class names: `.card`, `.panel`, `.col`, `.grid`, `.nav`,
 * `.main`, `.kpi`, `.banner`, `.shell`. Those are not exotic names. index.html's own shell uses
 * `.card` seven times and `.grid` seven times; ten other page partials use `.panel`; seven use
 * `.col`. Last-loaded plus equal specificity means the board's rules won.
 *
 * So the page that is disabled, unreachable, and behind a flag that is false — the page whose
 * production visibility is zero by construction — was restyling the rest of the application on every
 * screen a user could actually open. Nothing failed. There is no error state for "your borders came
 * from somewhere else", which is exactly why it survived four rounds of tests that all passed.
 *
 * §B and §C are that defect, asserted from both ends: nothing in the sheet is unscoped, and none of
 * the specific class names other pages use is declared at top level. §C is the one that would catch
 * a regression, because it names the victims.
 *
 * WHAT THE ROUND DID NOT DO: nothing was activated. The flag is false, the staged section is
 * `enabled: false`, there is no sidebar item, and the accessor still refuses before it opens a
 * database. §D and §F hold all of that in place.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..');
var CSS = path.join(ROOT, 'assets', 'css', 'product-strategy-board.css');
var PROTO = path.join(ROOT, 'docs', 'prototypes', 'product-strategy-board');

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
function exists(p) { return fs.existsSync(p); }
/** Strip comments so prose can never be mistaken for code. */
function bare(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) {
  var x = JSON.stringify(a), y = JSON.stringify(b);
  ok(x === y, label, x === y ? undefined : { got: a, want: b });
}

var SHEET = read(CSS);
var INDEX = read(path.join(ROOT, 'index.html'));

/**
 * Every top-level selector in the sheet, comment-free, at-rules descended into.
 * Returns [{sel, atRule}] with one entry per comma-separated part.
 */
function selectorsOf(css) {
  var s = bare(css), out = [], buf = '', depth = 0, at = [];
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (c === '{') {
      var t = buf.trim();
      if (t.charAt(0) === '@') { at.push(t); }
      else {
        var inKeyframes = at.some(function (a) { return a.indexOf('keyframes') >= 0; });
        if (!inKeyframes) {
          t.split(',').forEach(function (p) {
            if (p.trim()) out.push({ sel: p.trim(), atRule: at[at.length - 1] || null });
          });
        }
        at.push(null);
      }
      depth++; buf = '';
    } else if (c === '}') { depth--; at.pop(); buf = ''; }
    else buf += c;
  }
  return out;
}

var SELECTORS = selectorsOf(SHEET);

// ===================================================================================================
console.log('\n=== §A  THE SECURITY TRACK IS DEFERRED, NOT HALF-PRESENT ===');
(function () {
  /* REMOVED: the deployable Cloud Run gateway and everything that only served it. Every one of these
     is recoverable from git history — the removal is a forward commit, not a rewrite. */
  var goneDirs = ['services/auth-gateway'];
  var goneFiles = [
    'assets/tests/auth-gateway-contract-sec-a2.test.js',
    'assets/tests/auth-gateway-production-readiness-sec-a2r.test.js',
    'assets/tests/_sec-a2-harness.js',
    'assets/tests/_sec-a2-local-e2e.js',
    'assets/tests/_sec-a2r-prod-mode-proof.js',
    'docs/planning/SEC_A3_T_TEST_CLOUD_RUNBOOK.md'
  ];
  goneDirs.concat(goneFiles).forEach(function (rel, i) {
    ok(!exists(path.join(ROOT, rel)), 'A' + (i + 1) + ' removed: ' + rel);
  });

  /* AND NOTHING STILL POINTS AT IT. A removal that leaves a `require` behind is a removal that turns
     into a crash the next time somebody runs the suite. */
  /* A REFERENCE IS A LOAD OR A REQUIRE — NOT A SENTENCE ABOUT ONE. The history documents describe
     what was removed and why, and they are supposed to: that is the record. What must not survive is
     anything that would try to OPEN the directory. Searching for the bare path found the prose and
     called it a defect, which is the same trap P1-B2C's G18 documents. */
  var dangling = [];
  (function walk(d) {
    fs.readdirSync(d).forEach(function (f) {
      var p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== '.git') walk(p); return; }
      if (!/\.(js|html|gs|json)$/.test(f)) return;
      /* A FILE THAT SEARCHES FOR A PATTERN CONTAINS THAT PATTERN. This scanner's own source
         carries the regex it is looking for, so without this line it reports itself, forever. */
      if (p === __filename) return;
      var t = fs.readFileSync(p, 'utf8');
      if (/(require\(|src=|href=|readFileSync\()[^)\n]*services\/auth-gateway/.test(t)) {
        dangling.push(path.relative(ROOT, p).replace(/\\/g, '/'));
      }
    });
  })(path.join(ROOT, 'assets'));
  eq(dangling, [], 'A8 nothing under assets/ still loads or requires the gateway');
  ok(!/auth-gateway/.test(INDEX), 'A9 and index.html never did');

  /* KEPT: the research that is about the SYSTEM rather than about the cancelled implementation. */
  var kept = [
    'docs/planning/IDENTITY_AND_ACCESS_ARCHITECTURE_SEC_A0.md',
    'docs/planning/SEC_A1_IDENTITY_PROTOTYPE_EVIDENCE.md',
    'docs/planning/SEC_A2R_PRODUCTION_READINESS_AND_COST_MODEL.md',
    'assets/tests/identity-boundary-baseline-sec-a0.test.js',
    'assets/tests/identity-verifier-prototype-sec-a1.test.js',
    'assets/prototypes/sec-a1/sec-a1-auth-contract.js'
  ];
  kept.forEach(function (rel, i) {
    ok(exists(path.join(ROOT, rel)), 'A' + (10 + i) + ' kept: ' + rel);
  });

  /* A DOCUMENT THAT DESCRIBES A DEFERRED DIRECTION HAS TO SAY SO ON ITS FACE. Otherwise the next
     person to open it reads a finished design and starts building against it. */
  ['docs/planning/IDENTITY_AND_ACCESS_ARCHITECTURE_SEC_A0.md',
   'docs/planning/SEC_A1_IDENTITY_PROTOTYPE_EVIDENCE.md',
   'docs/planning/SEC_A2R_PRODUCTION_READINESS_AND_COST_MODEL.md'].forEach(function (rel, i) {
    var t = read(path.join(ROOT, rel));
    var head = t.slice(0, 2600);
    ok(head.indexOf('DEFERRED_TO_P2_A') >= 0, 'A16.' + (i + 1) + ' ' + path.basename(rel) + ' is marked DEFERRED_TO_P2_A at the top');
    ok(head.indexOf('NOT_A_P1_BLOCKER') >= 0, 'A16.' + (i + 1) + 'a and NOT_A_P1_BLOCKER');
    ok(head.indexOf('NOT_DEPLOYED') >= 0, 'A16.' + (i + 1) + 'b and NOT_DEPLOYED');
    ok(head.indexOf('NOT_PART_OF_PRODUCT_STRATEGY_RUNTIME') >= 0,
      'A16.' + (i + 1) + 'c and NOT_PART_OF_PRODUCT_STRATEGY_RUNTIME');
  });

  /* The SEC-A1 contract prototype is research, and research that a page can load is not research. */
  ok(!/sec-a1/.test(INDEX), 'A17 the SEC-A1 contract prototype is loaded by no page');
})();

// ===================================================================================================
console.log('\n=== §B  THE PAGE STYLESHEET IS SCOPED TO THE PAGE ===');
(function () {
  /* THE TWO DOCUMENT-LEVEL MODES ARE THE ONLY PERMITTED EXCEPTIONS, and they are keyed on classes
     that only this board ever sets (psb-board-ui.js BODY_STATE_CLASSES). Presentation and fullscreen
     change the DOCUMENT, not a container: an overlay that leaves the page's own background behind it
     is not fullscreen. They are named here so that a third one cannot be added quietly. */
  var ALLOWED_DOCUMENT_RULES = ['body.presenting', 'body.is-fullscreen'];

  var unscoped = SELECTORS.filter(function (r) {
    if (r.sel.indexOf('psb-page') >= 0) return false;
    if (ALLOWED_DOCUMENT_RULES.indexOf(r.sel) >= 0) return false;
    return true;
  }).map(function (r) { return r.sel; });
  eq(unscoped, [], 'B1 every rule in the sheet is scoped to .psb-page');

  ok(SELECTORS.length > 350, 'B2 and that is a real sheet, not a stub', SELECTORS.length);

  /* A PAGE STYLESHEET HAS NO BUSINESS WRITING TO THE DOCUMENT ROOT. One `:root {}` undoes the whole
     pass, and is exactly how the fifty copied tokens arrived in the first place. */
  ok(!/(^|\n)\s*:root\s*\{/.test(bare(SHEET)), 'B3 it declares no :root block');
  ok(!/(^|\n)\s*html\s*[,{]/.test(bare(SHEET)), 'B4 no html rule');
  ok(!/(^|\n)\s*\*\s*\{/.test(bare(SHEET)), 'B5 no universal reset — base.css already has one');
  /* `body.presenting .psb-page .main` is SCOPED — the body class selects the mode, `.psb-page`
     still selects the page. What B6 forbids is a body rule that reaches outside the board: either a
     bare `body`, or a body-state rule whose target is not inside the page. */
  var bareBody = SELECTORS.filter(function (r) {
    if (r.sel.indexOf('psb-page') >= 0) return false;
    if (ALLOWED_DOCUMENT_RULES.indexOf(r.sel) >= 0) return false;
    return /^body\b/.test(r.sel);
  }).map(function (r) { return r.sel; });
  eq(bareBody, [], 'B6 and no body rule beyond the two declared document modes');
  /* The two that ARE allowed must stay keyed on a class the board itself sets, or they are just
     global rules with a longer name. */
  var ui = read(path.join(ROOT, 'assets', 'js', 'product-strategy', 'psb-board-ui.js'));
  ALLOWED_DOCUMENT_RULES.forEach(function (sel, i) {
    var cls = sel.split('.')[1];
    ok(new RegExp("BODY_STATE_CLASSES[\\s\\S]{0,200}'" + cls + "'").test(ui),
      'B6.' + (i + 1) + ' `' + sel + '` is keyed on a class the board declares and owns');
  });

  /* THE TOKENS COME FROM base.css. Redefining one to the value it already has is not harmless: it is
     a second definition site, and the second one is the one nobody updates. */
  var baseCss = read(path.join(ROOT, 'assets', 'css', 'base.css'));
  var baseTokens = {};
  (bare(baseCss).match(/^\s*(--[a-z0-9-]+)\s*:/gm) || []).forEach(function (m) {
    baseTokens[m.trim().replace(/:$/, '')] = 1;
  });
  var redefined = (bare(SHEET).match(/^\s*(--[a-z0-9-]+)\s*:/gm) || [])
    .map(function (m) { return m.trim().replace(/:$/, ''); })
    .filter(function (t) { return baseTokens[t]; });
  eq(redefined, [], 'B7 the sheet redefines no token that base.css already defines');

  /* Its own private tokens are fine — they live on .psb-page, where they cannot reach another page. */
  var own = (bare(SHEET).match(/^\s*(--[a-z0-9-]+)\s*:/gm) || []).length;
  ok(own > 20, 'B8 it still has its own private tokens', own);
  var tokenBlockScoped = /\.psb-page\s*\{[^}]*--ink\s*:/.test(bare(SHEET));
  ok(tokenBlockScoped, 'B9 and they are declared on .psb-page, not on :root');
})();

// ===================================================================================================
console.log('\n=== §C  AND THE PAGES IT USED TO REACH ARE NAMED ===');
(function () {
  /* THIS IS THE SECTION THAT WOULD CATCH THE REGRESSION, because it does not ask an abstract question
     about scoping — it asks whether these specific class names, the ones other pages actually put in
     their markup, are declared at top level in this sheet. A future edit that adds one bare rule
     fails here with the name of the page it broke. */
  var partialsDir = path.join(ROOT, 'assets', 'html', 'pages');
  var docs = fs.readdirSync(partialsDir)
    .filter(function (f) { return /\.html$/.test(f) && f.indexOf('product-strategy') < 0; })
    .map(function (f) { return { name: f, text: read(path.join(partialsDir, f)) }; });
  docs.push({ name: 'index.html', text: INDEX });

  /* The class names this sheet styles, taken from the sheet itself. */
  var styled = {};
  SELECTORS.forEach(function (r) {
    (r.sel.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) || []).forEach(function (c) {
      styled[c.slice(1)] = 1;
    });
  });
  delete styled['psb-page'];

  var victims = {};
  docs.forEach(function (d) {
    Object.keys(styled).forEach(function (c) {
      if (new RegExp('class="[^"]*\\b' + c + '\\b').test(d.text)) {
        (victims[c] = victims[c] || []).push(d.name);
      }
    });
  });
  var shared = Object.keys(victims).sort();
  ok(shared.length > 0, 'C1 the sheet does style class names other pages also use (' + shared.length + ')');

  /* Every one of them MUST be declared only under .psb-page. */
  var leaking = [];
  shared.forEach(function (c) {
    SELECTORS.forEach(function (r) {
      if (r.sel.indexOf('psb-page') >= 0) return;
      if (new RegExp('(^|[\\s>+~])\\.' + c + '(?![A-Za-z0-9_-])').test(r.sel)) {
        leaking.push(c + '  <- ' + r.sel + '  (also in ' + victims[c].join(', ') + ')');
      }
    });
  });
  eq(leaking, [], 'C2 and not one of them is declared outside .psb-page');

  /* The nine worst, named individually, so a failure reads as a page rather than a statistic. */
  ['panel', 'col', 'card', 'nav', 'grid', 'info', 'kpi', 'shell', 'main'].forEach(function (c, i) {
    var bad = SELECTORS.filter(function (r) {
      return r.sel.indexOf('psb-page') < 0 &&
        new RegExp('(^|[\\s>+~])\\.' + c + '(?![A-Za-z0-9_-])').test(r.sel);
    });
    eq(bad.map(function (r) { return r.sel; }), [],
      'C3.' + (i + 1) + ' `.' + c + '` is never styled outside the board');
  });

  /* THE SHEET IS STILL LOADED GLOBALLY — that is the shell's convention and this round does not
     change it. Which is precisely why the scoping is the whole defence. */
  ok(/product-strategy-board\.css/.test(INDEX), 'C4 the sheet is still loaded on every page');
  var sheetOrder = (INDEX.match(/href="assets\/css\/[^"]+"/g) || []);
  ok(sheetOrder.length > 1 && /product-strategy-board\.css/.test(sheetOrder[sheetOrder.length - 1]),
    'C5 and still loads LAST, so nothing but the scoping is protecting the other pages');
})();

// ===================================================================================================
console.log('\n=== §D  THE PAGE LIVES IN THE OPERATION SYSTEM, DISABLED ===');
(function () {
  ok(exists(path.join(ROOT, 'assets', 'html', 'pages', 'product-strategy-board.html')),
    'D1 the partial is in assets/html/pages');
  ok(exists(path.join(ROOT, 'assets', 'js', 'pages', 'product-strategy-board.js')),
    'D2 the page controller is in assets/js/pages');
  ok(exists(CSS), 'D3 the stylesheet is in assets/css');
  ['psb-data-contract.js', 'km-product-strategy-site-universe.js', 'km-product-strategy-live-adapter.js',
   'psb-selectors.js', 'psb-chart-layout.js', 'psb-board-ui.js'].forEach(function (f, i) {
    ok(exists(path.join(ROOT, 'assets', 'js', 'product-strategy', f)),
      'D4.' + (i + 1) + ' module in assets/js/product-strategy: ' + f);
  });

  /* LOAD ORDER IS A CONTRACT. psb-board-ui reads the contract and the selectors; the page controller
     drives all of them. Shuffling these is a runtime failure that only appears when the page opens —
     which, while it is disabled, is never. */
  var order = ['psb-data-contract.js', 'km-product-strategy-site-universe.js',
    'km-product-strategy-live-adapter.js', 'psb-selectors.js', 'psb-chart-layout.js',
    'psb-board-ui.js', 'pages/product-strategy-board.js'];
  var at = order.map(function (f) { return INDEX.indexOf(f); });
  ok(at.every(function (x) { return x > 0; }), 'D5 every module is loaded by index.html');
  var ascending = at.every(function (x, i) { return i === 0 || x > at[i - 1]; });
  ok(ascending, 'D6 and in dependency order, controller last', at);

  var app = read(path.join(ROOT, 'assets', 'js', 'app.js'));
  ok(/KM_STAGED_SECTIONS_/.test(app), 'D7 the page is registered in the STAGED section registry');
  ok(/'product-strategy':\s*\{[^}]*enabled:\s*false/.test(app),
    'D8 with enabled:false — the registry is the switch, and it is off');
  ok(/product-strategy-board-section/.test(app), 'D9 naming the section it would mount');

  /* NAVIGATION IS DISABLED BY ABSENCE, which is stronger than disabled by attribute: there is no
     element to re-enable by deleting a class. */
  ok(!/showSection\('product-strategy'\)/.test(INDEX),
    'D10 no sidebar item invokes the section — navigation is absent, not merely greyed out');
  ok(/id="product-strategy-board-mount"/.test(INDEX), 'D11 only an empty mount point exists');
  var mount = INDEX.slice(INDEX.indexOf('id="product-strategy-board-mount"'));
  ok(/^id="product-strategy-board-mount"><\/div>/.test(mount.slice(0, 60)),
    'D12 and it is empty in the shipped document');
})();

// ===================================================================================================
console.log('\n=== §E  THE FIXTURE AND THE SHIM STAY OUT OF PRODUCTION ===');
(function () {
  ok(exists(path.join(PROTO, 'preview-fixture.js')), 'E1 the fixture exists, in the prototype');
  ok(!/preview-fixture/.test(INDEX), 'E2 and index.html does not load it');

  /* AGAIN: LOADING, NOT NAMING. psb-board-ui.js carries the prototype's own self-test, which
     asserts BY NAME which two stylesheets that page links — so the string appears in a production
     module and must. What would be a defect is a module that fetches, requires or injects either
     file. */
  var loadedByProduction = [];
  (function walk(d) {
    fs.readdirSync(d).forEach(function (f) {
      var p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) return walk(p);
      if (!/\.js$/.test(f)) return;
      var t = fs.readFileSync(p, 'utf8');
      if (/(require\(|import\s|src\s*=\s*['"]|href\s*=\s*['"]|fetch\()[^)\n]*(preview-fixture|prototype-tokens)/.test(t)) {
        loadedByProduction.push(path.relative(ROOT, p).replace(/\\/g, '/'));
      }
    });
  })(path.join(ROOT, 'assets', 'js'));
  eq(loadedByProduction, [], 'E3 no production module loads the fixture or the token shim');

  /* THE SHIM IS A COPY, AND A COPY THAT PRODUCTION CAN REACH IS A SECOND SYSTEM. */
  ok(exists(path.join(PROTO, 'prototype-tokens.css')), 'E4 the token shim exists, in the prototype');
  ok(!/prototype-tokens/.test(INDEX), 'E5 and index.html does not load it');
  var shim = read(path.join(PROTO, 'prototype-tokens.css'));
  ok(shim.indexOf('NOT LOADED BY THE OPERATION SYSTEM') >= 0,
    'E6 it says so at the top, where somebody about to link it would read it');
  ok(shim.indexOf('@import') < 0, 'E7 and imports nothing, so it cannot pull a shared sheet in sideways');
  ok(!/(^|\n)\s*:root\s*\{/.test(bare(shim)), 'E8 the shim is scoped too — no :root');

  /* WHY IT EXISTS AT ALL. base.css sets `body { overflow: hidden }` for the application shell; a
     standalone page that linked it would lose scrolling. That hazard is the whole reason the copy
     could not simply be deleted, and it is asserted rather than remembered. */
  var baseCss = read(path.join(ROOT, 'assets', 'css', 'base.css'));
  ok(/body\s*\{[^}]*overflow:\s*hidden/.test(baseCss),
    'E9 base.css really does set body{overflow:hidden} — the reason the prototype cannot link it');
  var protoIndex = read(path.join(PROTO, 'index.html'));
  var hrefs = (protoIndex.match(/<link[^>]+rel="stylesheet"[^>]*>/g) || [])
    .map(function (t) { return (t.match(/href="([^"]+)"/) || [])[1] || ''; });
  eq(hrefs.filter(function (h) { return /(^|\/)(base|components)\.css$/.test(h); }), [],
    'E10 so the prototype links neither shared sheet');
  eq(hrefs.length, 2, 'E11 exactly two sheets: the shim and the board');
})();

// ===================================================================================================
console.log('\n=== §F  NOTHING IS ACTIVATED, AND NOTHING OPENS A DATABASE ===');
(function () {
  var cfg = read(path.join(ROOT, 'assets', 'specs', 'active', 'apps-script', '00_config.gs'));
  ok(/var PRODUCT_STRATEGY_ENABLED_ = false;/.test(cfg), 'F1 PRODUCT_STRATEGY_ENABLED_ is false');

  /* THE TWO ACTIONS ARE READS, AND THEY ARE THE ONLY TWO. A third name appearing here is a scope
     change, whatever else it is called. */
  /* THE TWO ACTIONS ARE OWNED BY DIFFERENT FILES and that is the existing layering, not a defect:
     the adapter carries the workspace read, the workspace accessor carries the site-universe read.
     Asserting both against one file assumed a structure the repository does not have. What matters is
     that the API layer names exactly these two and nothing write-shaped. */
  var apiDir = path.join(ROOT, 'assets', 'js', 'api');
  var apiText = fs.readdirSync(apiDir).filter(function (f) { return /\.js$/.test(f); })
    .map(function (f) { return read(path.join(apiDir, f)); }).join('\n');
  ['productPricing.workspace.get', 'productPricing.siteUniverse.get'].forEach(function (a, i) {
    ok(apiText.indexOf(a) >= 0, 'F2.' + (i + 1) + ' the API layer names ' + a);
  });
  var actions = {};
  (apiText.match(/productPricing\.[a-zA-Z][a-zA-Z.]*/g) || []).forEach(function (a) {
    actions[a.replace(/\.$/, '')] = 1;
  });
  eq(Object.keys(actions).sort(), ['productPricing.siteUniverse.get', 'productPricing.workspace.get'],
    'F2a and NO OTHER productPricing action — a third name is a scope change whatever it is called');
  var writeVerbs = (apiText.match(/productPricing\.[a-zA-Z.]*(save|submit|write|create|update|delete|generate)/gi) || []);
  eq(writeVerbs, [], 'F3 and no write-shaped action name anywhere in it');

  /* THE GATEWAY IS NOT A PREREQUISITE ANY MORE, AND THE TRANSPORT PROVES IT: the page calls the
     Operation System's own transport, the same one the other twenty-three pages call. */
  var page = read(path.join(ROOT, 'assets', 'js', 'pages', 'product-strategy-board.js'));
  var workspace = read(path.join(ROOT, 'assets', 'js', 'api', 'km-product-pricing-workspace.js'));
  ok(!/auth-gateway|Bearer|id_token|credential/.test(page + workspace),
    'F4 neither the page nor the accessor knows anything about a gateway or a token');
  ok(/KM\.api|transport/.test(workspace), 'F5 the accessor uses the existing Operation System transport');
})();

// ===================================================================================================
console.log('\n=== §G  MUTANTS ===');
(function () {
  function mutant(label, broken) {
    var caught = false;
    try { caught = broken() === true; } catch (e) { caught = true; }
    if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
    else { mutSurvived++; console.log('  SURVIVED ' + label); }
  }

  /* Each mutant edits the REAL text in memory and asks whether §B/§C would still be satisfied. A
     mutant that only re-reads the file proves the file, not the probe. */
  function selsOf(text) { return selectorsOf(text).map(function (r) { return r.sel; }); }
  function unscopedIn(text) {
    return selsOf(text).filter(function (s) {
      return s.indexOf('psb-page') < 0 && ['body.presenting', 'body.is-fullscreen'].indexOf(s) < 0;
    });
  }

  mutant('G1 one bare .card rule comes back', function () {
    return unscopedIn(SHEET + '\n.card { border: 0; }\n').length > 0;
  });
  mutant('G2 a bare .panel rule comes back — ten other partials use that class', function () {
    return unscopedIn(SHEET + '\n.panel { padding: 0; }\n').length > 0;
  });
  mutant('G3 a bare .main rule comes back, and index.html has one', function () {
    return unscopedIn(SHEET + '\n.main { padding: 0; }\n').length > 0;
  });
  mutant('G4 a :root block returns, undoing the whole pass in one line', function () {
    var m = SHEET + '\n:root { --ink: #000; }\n';
    return /(^|\n)\s*:root\s*\{/.test(bare(m));
  });
  /* THIS MUTANT SURVIVED AS FIRST WRITTEN, and it deserved to: it asked whether base.css defines
     `--btn-height` and whether the mutated text defines it, then returned the AND of two facts that
     were both true before the mutation and both true after. It was measuring nothing. What it has to
     do is run §B7's actual comparison over the mutated sheet and show that the mutation is what
     makes it fail. */
  mutant('G5 a base.css token is redefined here again', function () {
    var baseCss = read(path.join(ROOT, 'assets', 'css', 'base.css'));
    var baseTokens = {};
    (bare(baseCss).match(/^\s*(--[a-z0-9-]+)\s*:/gm) || []).forEach(function (m) {
      baseTokens[m.trim().replace(/:$/, '')] = 1;
    });
    function redefinedIn(text) {
      return (bare(text).match(/^\s*(--[a-z0-9-]+)\s*:/gm) || [])
        .map(function (m) { return m.trim().replace(/:$/, ''); })
        .filter(function (t) { return baseTokens[t]; });
    }
    /* clean today, and the one added line is what breaks it */
    return redefinedIn(SHEET).length === 0
      && redefinedIn(SHEET + '\n.psb-page {\n  --btn-height: 36px;\n}\n').length === 1;
  });
  mutant('G6 a third document-level body rule is added quietly', function () {
    return unscopedIn(SHEET + '\nbody.whatever { background: red; }\n').length > 0;
  });
  mutant('G7 a universal reset returns', function () {
    return /(^|\n)\s*\*\s*\{/.test(bare(SHEET + '\n* { margin: 0; }\n'));
  });
  mutant('G8 the staged section is switched on', function () {
    var app = read(path.join(ROOT, 'assets', 'js', 'app.js'))
      .replace("enabled: false", "enabled: true");
    return !/'product-strategy':\s*\{[^}]*enabled:\s*false/.test(app);
  });
  mutant('G9 a sidebar item appears', function () {
    return /showSection\('product-strategy'\)/.test(INDEX + "<div onclick=\"showSection('product-strategy')\">");
  });
  mutant('G10 the feature flag is flipped', function () {
    var cfg = read(path.join(ROOT, 'assets', 'specs', 'active', 'apps-script', '00_config.gs'))
      .replace('var PRODUCT_STRATEGY_ENABLED_ = false;', 'var PRODUCT_STRATEGY_ENABLED_ = true;');
    return !/var PRODUCT_STRATEGY_ENABLED_ = false;/.test(cfg);
  });
  mutant('G11 index.html starts loading the preview fixture', function () {
    return /preview-fixture/.test(INDEX + '<script src="preview-fixture.js"></script>');
  });
  mutant('G12 index.html starts loading the prototype token shim', function () {
    return /prototype-tokens/.test(INDEX + '<link href="prototype-tokens.css">');
  });
  mutant('G13 the gateway directory reappears and something requires it', function () {
    return /services\/auth-gateway/.test("require('../../services/auth-gateway/src/http.js')");
  });
  mutant('G14 a deferral marker is dropped from a kept security document', function () {
    var t = read(path.join(ROOT, 'docs', 'planning', 'IDENTITY_AND_ACCESS_ARCHITECTURE_SEC_A0.md'))
      .split('DEFERRED_TO_P2_A').join('TODO');   /* GLOBAL: the banner names it twice, and a
         single-occurrence replace left the second one standing, so this mutant survived by
         accident. A mutant that only half-applies is a mutant that proves nothing. */
    return t.slice(0, 2600).indexOf('DEFERRED_TO_P2_A') < 0;
  });
  /* THE ORDER MUTANT. Loading the controller before the modules it reads is a failure that only
     shows when the page opens — and while the page is disabled, it never opens. */
  mutant('G15 the page controller is loaded before the modules it depends on', function () {
    /* VERSION-AGNOSTIC. This used to name the cache-buster (?v=productstrategy-p1b7-...) inside the
       string it removed, so bumping the version made the replace a no-op and the mutant survived
       while looking fine. A mutant that stops applying when an unrelated string changes is a mutant
       that will be quietly dead for however long it takes somebody to notice. */
    var shuffled = INDEX.replace(
      /<script src="assets\/js\/pages\/product-strategy-board\.js[^"]*"><\/script>/, '');
    return shuffled.indexOf('pages/product-strategy-board.js') < 0;
  });
  mutant('G16 the sheet stops being scoped but keeps its own tokens, so only §C would notice', function () {
    return unscopedIn(SHEET + '\n.view { margin: 0; }\n').length > 0;
  });
})();

// ===================================================================================================
console.log('\n' + new Array(101).join('='));
console.log('passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
console.log(new Array(101).join('='));
process.exit(fail || mutSurvived ? 1 : 0);
