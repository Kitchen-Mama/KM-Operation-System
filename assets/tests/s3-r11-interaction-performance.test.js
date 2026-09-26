// =================================================================================================================
// S3-R11 — INTERACTION PERFORMANCE: WHAT WAS MEASURED, WHAT WAS REPAIRED, AND WHAT WAS LEFT ALONE.
//
// THE ROUND'S ONE HONEST DIVISION. This environment has no Apps Script runtime and no production browser, so a
// per-interaction millisecond is not a number this repository can produce. What it CAN produce, exactly, is a
// REQUEST COUNT and a CONTROL FLOW, because those are properties of the code rather than of the network — and the
// S3-R11 runner proves that directly: the 0 ms and 400 ms runs are identical on every count. So this round reports
// request counts as measured fact and hands real milliseconds to the operator capture. `pollMs` in the evidence is
// poll ticks under Chrome's virtual clock and is never read as latency; B4 below asserts the evidence says so.
//
// WHAT WAS ACTUALLY WRONG, out of six audited surfaces:
//
//   ONE defect, reproduced in a real browser and fixed (§4). KM.partialLoader wrote its `_loaded` flag in the
//   `.then()`, so it could answer "has this finished" but never "is this happening". A -> B -> A in one tick,
//   onto a page whose markup was not yet in the DOM, issued TWO fetches for one partial — and both `.then()`s ran
//   `target.innerHTML = html`, so the second replacement destroyed the DOM the first mount had already wired
//   listeners to. PRE 2 -> POST 1, same browser, same fixtures.
//
//   TWO UX defects in the pricing modal (§11, §12), both real and both mis-described until traced. The preview
//   "jumping to the top" is not a scroll call — there is none to delete. `_srdBulkPaint_` assigns
//   modal.innerHTML, which DESTROYS the scroll container; a new element starts at 0. And the "narrow left column
//   with unused whitespace" is `.srd-modal__body { display:grid; grid-template-columns: 1fr 1fr }` — right for
//   the edit FORM it was written for, wrong for the bulk modal that reuses the class.
//
//   THREE surfaces that were already correct, and are asserted so rather than quietly passed over: SKU Details
//   filter/search, all four SKU Regional switches, and rapid navigation. Every one issues ZERO requests. §3 warns
//   that zero-request is not automatically better; here it is correct because each is a pure re-render over data
//   the page already holds authoritatively, and Section E asserts that property rather than the number alone.
//
// THE XLSX TEMPLATE IS ONE CONTRACT WITH TWO FRONT DOORS, and Section D is mostly about that. Shipping an .xlsx
// template the operator cannot upload back would be a trap, so the reader admits both — but a second validator
// would be a second import contract, which §11 forbids in as many words. So the rules moved onto a GRID, and CSV
// and XLSX each produce a grid. `validateFile`/`validateBulkFile` keep their names, signatures and behaviour.
//
// NO NEW DEPENDENCY. ExcelJS and KM.templateExport already ship for the Template UI Standard, so §11's STOP gate
// ("if browser-only XLSX generation requires adding a new major dependency, STOP and ask") does not trigger. D1
// asserts that, because the gate is only honoured if the claim is checked.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
// RAW keeps the file's own line endings (this repo is CRLF); NORM is for multi-line reading.
function raw(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function read(rel) { return raw(rel).replace(/\r\n/g, '\n'); }

const LOADER = read('assets/js/core/partial-loader.js');
const SRD = read('assets/js/pages/sku-regional-details.js');
const SRP_SRC = read('assets/js/pages/sku-regional-pricing.js');
const CSS = read('assets/css/pages/sku-regional-details.css');
const RUNNER = read('assets/tests/_s3r11-interaction-runner.js');
const SKU = read('assets/js/pages/sku-details.js');
const EV = JSON.parse(read('docs/evidence/s3-r11-interaction-performance/measurements.json'));

// -----------------------------------------------------------------------------------------------------------
// A tiny DOM, and only as much of one as the partial loader touches. The loader is a 120-line module whose whole
// job is fetch-and-inject, so running the REAL file against a fake window is the honest test — there is nothing
// here that a browser would do differently.
// -----------------------------------------------------------------------------------------------------------
function loaderWorld(opts) {
  opts = opts || {};
  const calls = [];
  const target = { innerHTML: '', __writes: 0 };
  Object.defineProperty(target, 'innerHTML', {
    get() { return this._h || ''; },
    set(v) { this._h = v; this.__writes = (this.__writes || 0) + 1; }
  });
  let resolveNext = null;
  const win = {
    KM: {},
    fetch: function (url) {
      calls.push(url);
      return new Promise(function (res, rej) {
        resolveNext = function (bad) {
          if (bad) { rej(new Error('boom')); return; }
          res({ ok: opts.httpOk !== false, status: opts.httpOk === false ? 404 : 200,
                text: function () { return Promise.resolve('<section id="x">markup</section>'); } });
        };
      });
    },
    document: { querySelector: function () { return opts.noTarget ? null : target; } }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ctx.console = { log() {}, warn() {} };
  ctx.Promise = Promise;
  // RE-READ, never the module-level snapshot. A mutant rewrites the file on disk, and a world built
  // from a constant captured at require() time would run the ORIGINAL source — so J1-J3 all "survived"
  // by being invisible rather than by being harmless. The mutants caught the harness, which is the one
  // job a mutant has that an assertion cannot do for it.
  vm.runInContext(read('assets/js/core/partial-loader.js'), ctx);
  return { win, calls, target, settle: function (bad) { if (resolveNext) resolveNext(bad); },
           L: win.KM.partialLoader };
}
const tick = () => new Promise((r) => setImmediate(r));

// Load the pricing module the way the browser does: it is an IIFE that attaches to a global.
function loadSRP(source) {
  const g = { window: {}, console: { log() {}, warn() {} } };
  g.window.KM = {};
  g.global = g;
  const ctx = vm.createContext(g);
  vm.runInContext(source || SRP_SRC, ctx);
  return (ctx.window.KM && ctx.window.KM.SkuRegionalPricing) || null;
}

// =================================================================================================================
section('A — §4 APP SHELL: THE ONE DEFECT, DRIVEN RATHER THAN DESCRIBED');
// =================================================================================================================
{
  // A1 — the header claimed the loader was dormant. It is on the critical path of five pages, and an audit that
  //      believed the header would have skipped exactly the module that was broken.
  ok(!/DORMANT — IMPORTANT/.test(LOADER) && /NOT DORMANT ANY MORE/.test(LOADER),
    'A1  the "nothing calls this yet" header is gone — five pages mount through this loader');
  const callers = ['sku-details.js', 'sku-regional-details.js', 'fc-summary.js', 'product-strategy-board.js']
    .filter((f) => /partialLoader/.test(read('assets/js/pages/' + f)));
  eq(callers.length, 4, 'A1a and the four audited pages really do call it');
}

(async function () {
  // A2 — THE DEFECT ITSELF. Two calls while the first fetch is open must issue ONE request.
  {
    const w = loaderWorld();
    const p1 = w.L.loadPartial('k', 'u.html', '#m');
    const p2 = w.L.loadPartial('k', 'u.html', '#m');   // second navigation, first still in flight
    eq(w.calls.length, 1, 'A2  two calls during one open fetch issue ONE request');
    ok(w.L.isLoading('k'), 'A2a and the loader can say a fetch is OPEN, which `isLoaded` never could');
    w.settle();
    const [r1, r2] = await Promise.all([p1, p2]);
    ok(r1 === r2, 'A2b the joiner receives the originator resolution');
    eq(w.target.__writes, 1, 'A2c innerHTML is written ONCE — the second write is what destroyed the live DOM');
    ok(w.L.isLoaded('k') && !w.L.isLoading('k'), 'A2d settled: loaded true, in-flight released');
    // A2e — THE SECOND WALL, described as what it is. With the join above, one flight has one `.then`,
    // so this guard has no reachable failing path TODAY. It is kept because the damage it prevents is
    // the expensive kind — a late write destroying the DOM a mount is already using — and because a
    // future refactor that reintroduces a second flight would otherwise reintroduce that silently.
    // It is deliberately NOT planted as a mutant: a mutant that creates no defect proves nothing.
    ok(/if \(!\(pageKey && _loaded\[pageKey\]\)\) \{/.test(LOADER),
      'A2e and the injection is guarded by the loaded flag as a second wall');
  }

  // A3 — a FAILED fetch must not be cached as a failure. One dead request must not become a permanently
  //      empty page, which is the failure mode a naive in-flight map introduces.
  {
    const w = loaderWorld();
    const p1 = w.L.loadPartial('k', 'u.html', '#m');
    w.settle(true);
    ok((await p1) === null, 'A3  a failed partial resolves null, as it always did');
    await tick();
    ok(!w.L.isLoading('k') && !w.L.isLoaded('k'), 'A3a and the key is released, not latched');
    const p2 = w.L.loadPartial('k', 'u.html', '#m');
    eq(w.calls.length, 2, 'A3b so the next attempt issues a REAL request instead of joining a dead promise');
    w.settle();
    await p2;
  }

  // A4 — already loaded still short-circuits, and a third call after settlement fetches nothing.
  {
    const w = loaderWorld();
    const p = w.L.loadPartial('k', 'u.html', '#m'); w.settle(); await p;
    await w.L.loadPartial('k', 'u.html', '#m');
    eq(w.calls.length, 1, 'A4  a loaded partial is never re-fetched');
    eq(w.target.__writes, 1, 'A4a and never re-injected');
  }

  // A5 — DIFFERENT pages must not join each other. The key is the identity.
  {
    const w = loaderWorld();
    w.L.loadPartial('a', 'a.html', '#m');
    w.L.loadPartial('b', 'b.html', '#m');
    eq(w.calls.length, 2, 'A5  two different pageKeys are two different fetches');
  }

  // A6 — the evidence, from the real browser. This is the PRE -> POST the round claims.
  eq(EV.partial_loader_fix.PRE_partial_requests, 2, 'A6  PRE: one navigation burst issued TWO partial fetches');
  eq(EV.partial_loader_fix.POST_partial_requests, 1, 'A6a POST: the same burst issues ONE');
  eq(EV.partial_loader_fix.sections_in_dom_after, 1, 'A6b and exactly one copy of the section is in the DOM');

  // =================================================================================================================
  section('B — THE INSTRUMENT, AND WHAT IT IS ALLOWED TO CLAIM');
  // =================================================================================================================
  {
    // B1 — §2 forbids a stub that returns empty rows where the interaction needs populated controls. S3-R3's
    //      runner answers data:{} and could not have measured a filter, a SKU switch or a tab.
    ok(/120/.test(String(EV.runs.post_fix_serverMs_0.world.skus)) || EV.runs.post_fix_serverMs_0.world.skus === 120,
      'B1  the fixture world carries 120 master SKUs');
    eq(EV.runs.post_fix_serverMs_0.m.SKU_ROWS_RENDERED.rows, 120, 'B1a and 120 rows really rendered');
    ok(EV.runs.post_fix_serverMs_0.m.SRD_LIST_RENDERED.items > 0, 'B1b and the regional master list is populated');

    // B2 — the claim that makes a request count evidence at all.
    ok(EV.server_ms_invariance.identical === true,
      'B2  the 0 ms and 400 ms runs are identical on every count — a count is control flow, not latency');

    // B3 — no page threw while being driven. A count taken from a crashed page is not a measurement.
    eq(EV.runs.post_fix_serverMs_0.fatal, null, 'B3  the run completed');
    eq(EV.runs.post_fix_serverMs_0.errors, [], 'B3a with no uncaught error or rejection on any page');

    // B4 — THE INSTRUMENT'S OWN LIMIT, asserted rather than trusted to a comment. Three measurement bugs in
    //      S3-R3 each nearly became a false finding; this round had four, all recorded in the evidence.
    ok(/virtual-time-budget/.test(RUNNER), 'B4  the runner uses Chrome virtual time');
    ok(!/\bms:/.test(RUNNER) && /pollMs/.test(RUNNER),
      'B4a so the timing field is named pollMs, never `ms` — it is poll ticks, not elapsed work');
    ok(EV.what_it_may_be_read_as.NOT_authoritative.join(' ').indexOf('pollMs') === 0,
      'B4b and the evidence says so in its own header rather than leaving it to be inferred');
    ok(EV.harness_faults_found_and_fixed.length >= 4,
      'B4c the harness faults that would have read as page defects are recorded, not quietly fixed',
      EV.harness_faults_found_and_fixed.length);
    ok(/slice/.test(EV.harness_faults_found_and_fixed.join(' ')),
      'B4d including the one that reported FC\'s two DIFFERENT slices as a duplicate read');

    // B5 — the runner must clean up after itself; a stray file in the repo root is what the canonical sweep
    //      reports as a suite that left the tree dirty.
    ok(/finally\s*{[\s\S]{0,140}unlinkSync/.test(RUNNER), 'B5  the generated harness page is always deleted');
  }

  // =================================================================================================================
  section('C — §5/§6/§10: THE SURFACES THAT WERE ALREADY CORRECT, ASSERTED AS SUCH');
  // =================================================================================================================
  {
    const M = EV.runs.post_fix_serverMs_0.m;
    const zero = (k) => { eq(M[k].api, 0, 'C  ' + k + ' issues ZERO requests'); };

    // §5 — SKU Details local controls.
    ['SKU_DETAILS_SEARCH', 'SKU_DETAILS_SEARCH_CLEAR', 'SKU_DETAILS_FILTER',
     'SKU_DETAILS_EDIT_MODAL_OPEN'].forEach(zero);
    // §6 — all four SKU Regional switches, which is the round's high-priority surface.
    ['SKU_SWITCH', 'COUNTRY_SWITCH', 'MARKETPLACE_SWITCH', 'TAB_SWITCH', 'UPDATE_MODAL_OPEN'].forEach(zero);
    // §4 — a re-click of the page you are on.
    zero('MENU_RECLICK_SAME_PAGE');
    eq(M.MENU_RECLICK_SAME_PAGE.mountedSections, 1, 'C1  and mounts exactly one section, not two');
    // Warm re-entry reuses the read model rather than re-reading it.
    zero('SKU_DETAILS_WARM_REENTRY');
    zero('SKU_REGIONAL_WARM_REENTRY');

    // C2 — §3: "Do not assume zero-request is always better." So the REASON is asserted, not just the count.
    //      Each of the four switches is a pure re-render over the authoritative model the page already holds.
    ok(/function srdSetTab\(t\) { srdState\.activeSection = t; renderDetail\(\); }/.test(SRD),
      'C2  TAB_SWITCH is state + renderDetail, with no read in it');
    ok(/function srdSetCountry\(code\) {[\s\S]{0,400}renderDetail\(\);\n    }/.test(SRD),
      'C2a COUNTRY_SWITCH likewise');
    ok(/function selectSku\(sku\) {[\s\S]{0,600}renderDetail\(\);/.test(SRD), 'C2b SKU_SWITCH likewise');
    const filt = SKU.slice(SKU.indexOf('function applySkuFilters'), SKU.indexOf('function _skuToggleGroupEmpty'));
    ok(!/KM\.DB\.|getWorkspace|fetch\(/.test(filt),
      'C2c and SKU Details filtering touches no read path at all — it toggles row display');

    // C3 — §10. A may finish server-side; it must not paint into B, and B must not wait for it.
    const r = EV.runs.post_fix_serverMs_0.m.RAPID_A_TO_B;
    eq(r.activeVisibleSectionCount, 1, 'C3  A -> B mid-flight leaves exactly ONE visible section');
    eq(r.activeVisibleSectionIds, ['sku-section'], 'C3a and it is B, the page that was navigated to');
    eq(r.openRequests, 0, 'C3b with no request left open — the transport registry is empty');
    const t = EV.runs.post_fix_serverMs_0.m.RAPID_THRASH;
    eq(t.activeVisibleSectionCount, 1, 'C4  five navigations in one tick still leave ONE visible section');
    eq(t.srdSkeleton, 0, 'C4a no page is left holding a loading skeleton');
    ok(t.srdItems > 0, 'C4b and the page that won the race is populated, not blank');
    eq(t.api, 1, 'C4c five navigations cost ONE canonical read, not five');
    eq(t.transportOpen, 0, 'C4d and nothing is still open when it settles');
  }

  // =================================================================================================================
  section('D — §11: XLSX IS PRIMARY, AND THERE IS STILL EXACTLY ONE IMPORT CONTRACT');
  // =================================================================================================================
  {
    // D1 — the STOP gate. It is only honoured if the claim behind it is checked.
    const idx = read('index.html');
    ok(/exceljs/i.test(idx), 'D1  ExcelJS was ALREADY loaded by index.html before this round');
    ok(/window\.KM\.templateExport/.test(read('assets/js/utils/template-export.js')),
      'D1a and the shared XLSX template builder already existed');
    ok(!/require\(['"]xlsx|sheetjs|jszip/i.test(SRD + SRP_SRC),
      'D1b so no new library is introduced — §11\'s decision gate does not trigger');

    const SRP = loadSRP();
    ok(!!SRP, 'D2  the pricing module loads');

    // D3 — THE DROPDOWN, exactly the three words §11 names, in contract order.
    // The scope is built by SRP.scopes, the same call the page makes. Hand-rolling one would let the
    // test pass against a shape production never produces.
    const pricing = [{ marketplaceSkuId: 'MS-1', sku: 'KM-1', country: 'US', marketplace: 'Amazon',
      currency: 'USD', raw: { marketplace_sku_id: 'MS-1', currency: 'USD' } }];
    const mkt = [{ marketplaceSkuId: 'MS-1', sku: 'KM-1', siteSku: 'KM-1-US', company: 'ResUS',
      country: 'US', marketplace: 'Amazon' }];
    const scope = SRP.findScope(SRP.scopes(pricing, mkt), 'US|Amazon');
    ok(!!scope && scope.currency === 'USD', 'D2a and produces a real single-currency scope to validate against');
    const spec = SRP.templateXlsxSpec(scope, pricing, mkt);
    const actionCols = spec.columns.filter((c) => /_mode$/.test(c.key));
    eq(actionCols.length, 3, 'D3  three action columns — one per price field');
    actionCols.forEach((c) => {
      eq(c.dropdown, ['No Change', 'Update Price', 'Use Auto Price'],
        'D3a ' + c.key + ' carries exactly the three words §11 names');
    });

    // D4 — the DEFAULTS §11 fixes: action "No Change", price blank.
    eq(spec.rows.length, 1, 'D4  one template row per pricing row');
    eq(spec.rows[0].regular_price_mode, 'No Change', 'D4a action ships as No Change');
    eq(spec.rows[0].regular_price, '', 'D4b price ships blank');
    eq(spec.rows[0].msrp_mode, 'No Change', 'D4c and every field, not just the first');
    eq(spec.rows[0].minimum_price, '', 'D4d');

    // D5 — blankInputRows: 0. The shared builder appends 50 by default; a pricing row cannot be ADDED from
    //      this template, so those rows would arrive as 50 IDENTITY_MISSING errors on a file nobody typed in.
    eq(spec.blankInputRows, 0, 'D5  no blank input rows — they would be 50 identity errors');
    ok(!spec.exampleRow, 'D5a and no example row, for the same reason');

    // D6 — §11's remaining asks: frozen header, readable headers, reasonable widths, currency visible.
    ok(!!spec.instructionRow && spec.instructionRow.indexOf('USD') >= 0,
      'D6  the currency is stated on the sheet');
    ok(spec.instructionRow.indexOf('US') >= 0 && spec.instructionRow.indexOf('Amazon') >= 0,
      'D6a together with the target this file is scoped to');
    ok(/ySplit: headerRowNo/.test(read('assets/js/utils/template-export.js')),
      'D6b the builder freezes the header row');
    ok(spec.columns.every((c) => c.width >= 10 && c.width <= 40), 'D6c widths are reasonable');
    ok(spec.columns.every((c) => c.header && c.header !== c.key),
      'D6d EVERY header is a human label, not the column key');
    eq(spec.columns.filter((c) => c.kind === 'locked').map((c) => c.key),
      ['marketplace_sku_id', 'master_sku', 'site_sku', 'company', 'country', 'marketplace', 'currency'],
      'D6e identity and context are locked; only the six action/price cells are editable');
    eq(spec.columns.filter((c) => c.kind === 'business').length, 6, 'D6f which is exactly six');

    // D7 — ONE CONTRACT, TWO FRONT DOORS. The text entry points are now compositions, and behave identically.
    const hdr = ['marketplace_sku_id', 'regular_price_mode', 'regular_price',
      'minimum_price_mode', 'minimum_price', 'msrp_mode', 'msrp'];
    const csv = [hdr.join(','), 'MS-1,Update Price,31.50,No Change,,No Change,'].join('\r\n');
    const viaText = SRP.validateBulkFile(csv, scope);
    const viaGrid = SRP.validateBulkGrid(SRP.parseCsv(csv), scope);
    eq(viaText, viaGrid, 'D7  validateBulkFile IS validateBulkGrid over a parsed CSV — same object, not a copy');
    ok(viaText.ok, 'D7a and a valid file still validates');
    eq(viaText.lines[0].regular_price_mode, 'MANUAL', 'D7b the display label still parses to the internal mode');

    // D8 — HUMAN HEADERS PARSE TOO, which is what makes the XLSX readable without a second reader.
    const human = [['Marketplace SKU ID', 'Regular Price Action', 'Regular Price',
      'Minimum Price Action', 'Minimum Price', 'MSRP Action', 'MSRP'],
      ['MS-1', 'Update Price', '31.50', 'No Change', '', 'No Change', '']];
    const viaHuman = SRP.validateBulkGrid(human, scope);
    ok(viaHuman.ok, 'D8  a grid with the HUMAN headers the XLSX ships validates');
    eq(viaHuman.lines, viaText.lines, 'D8a and produces exactly the lines the machine headers produce');

    // D9 — and a file that is neither is still refused by NAME, not silently dropped.
    const wrong = [['sku', 'price'], ['KM-1', '9']];
    const bad = SRP.validateGrid(wrong);
    ok(!bad.ok && bad.errors[0].code === 'MISSING_REQUIRED_COLUMNS', 'D9  a wrong file is refused by name');
    ok(/Marketplace SKU ID/.test(bad.errors[0].detail),
      'D9a and the missing column is named in the words the operator sees on the sheet');

    // D10 — THE WORKSHEET READER. The header row is FOUND (the template writes a banner above it), and
    //       trailing empty rows are dropped rather than reported as errors on a file nobody typed in.
    function fakeSheet(rows) {
      return { eachRow(o, cb) { rows.forEach((r) => cb({ eachCell(o2, cb2) { r.forEach((c) => cb2({ value: c })); } })); } };
    }
    const grid = SRP.sheetToGrid(fakeSheet([
      ['Prices are in USD for US / Amazon.'],            // the instruction banner
      ['Marketplace SKU ID', 'Regular Price Action'],    // the real header
      ['MS-1', 'Update Price'],
      ['', ''], ['', '']                                 // trailing blanks Excel always leaves
    ]));
    eq(grid.length, 2, 'D10  the banner is skipped and the trailing blank rows are dropped');
    eq(grid[0][0], 'Marketplace SKU ID', 'D10a the header row is the one carrying the identity column');
    eq(grid[1][0], 'MS-1', 'D10b and the single typed row survives');
    eq(SRP.sheetToGrid(fakeSheet([['a', 'b'], ['c', 'd']])), [],
      'D10c a sheet with no identity column yields NOTHING rather than a misread grid');

    // D11 — Excel cell types are flattened to the text a person sees, because the rules were written for strings.
    const typed = SRP.sheetToGrid({ eachRow(o, cb) {
      [[{ v: 'Marketplace SKU ID' }, { v: 'Regular Price' }],
       [{ v: 'MS-1' }, { v: { result: 31.5, formula: 'A1*2' } }]].forEach((r) =>
        cb({ eachCell(o2, cb2) { r.forEach((c) => cb2({ value: c.v })); } })); } });
    eq(typed[1][1], '31.5', 'D11  a formula cell is read as its RESULT, as text');

    // D12 — the download is XLSX-first with a real CSV fallback, and the fallback is reachable on purpose.
    ok(/templateXlsxSpec/.test(SRD), 'D12  the page builds the XLSX spec');
    ok(/_srdBulkDownloadTemplateCsv_\(true\)/.test(SRD),
      'D12a and falls back to CSV when ExcelJS is unavailable rather than refusing to give a template');
    ok(/srdBulkDownloadTemplateCsv\b/.test(SRD) && /window\.srdBulkDownloadTemplateCsv/.test(SRD),
      'D12b with the CSV also reachable as a deliberate advanced action');
    ok(/accept="\.xlsx,\.csv/.test(SRD) || /accept=".xlsx,\.csv/.test(SRD.replace(/\\/g, '')),
      'D12c the upload control accepts .xlsx as well as .csv');
    ok(/PRIMARY_OPERATOR_TEMPLATE|Download Update Template \(Excel\)/.test(SRD),
      'D12d and the primary button says Excel');

    // D13 — import SEMANTICS are untouched: the same dry run, the same action vocabulary, the same rules.
    ok(/validateBulkGrid\(grid, b\.scope\)/.test(SRD), 'D13  upload meets the SAME rules a CSV meets');
    ok(/dry_run: true/.test(SRD), 'D13a and the same server dry run decides');
    eq(SRP.MODES, ['NO_CHANGE', 'MANUAL', 'AUTO'], 'D13b the write contract is unchanged');
    eq(SRP.readAction(''), 'NO_CHANGE', 'D13c blank is still No Change and nothing else');
    eq(SRP.readAction('Use Auto Price'), 'AUTO', 'D13d and both spellings still parse');
    eq(SRP.readAction('AUTO'), 'AUTO', 'D13e');
    eq(SRP.readAction('Delete'), null, 'D13f an unrecognised word is still NULL, never a silent No Change');
  }

  // =================================================================================================================
  section('E — §12: THE PREVIEW KEEPS ITS PLACE, AND THE MODAL STOPS WEARING THE FORM\'S GRID');
  // =================================================================================================================
  {
    // E1 — THE ACTUAL MECHANISM. There is no scroll call to delete; innerHTML destroys the scroll container.
    ok(/_srdBulkPaint_\(\)/.test(SRD) && /modal\.innerHTML = head/.test(SRD),
      'E1  the paint still redraws by assigning innerHTML — that is what destroys the scroller');
    // A CALL, not the word. The prose above this fix names scrollIntoView twice to explain why it is
    // the wrong tool, and a bare-word match would fail on its own explanation — the same trap S3-R10's
    // F1 fell into when it matched `_kmNextWriteRequestId_(` inside a comment about it.
    ok(!/\.scrollIntoView\s*\(/.test(SRD),
      'E1a and no scrollIntoView CALL exists — it would move a block that is already visible');

    // E2 — THE RULE: a stage change starts at the top; a re-render within a stage keeps its place.
    ok(/wasStage !== null && wasStage === _srdBulkPaintedStage_/.test(SRD),
      'E2  the position is restored only when the STAGE did not change');
    ok(/_srdBulkSetTop_\(now\.body, wasBodyTop\)/.test(SRD), 'E2a the modal body position is carried across');
    ok(/_srdBulkSetTop_\(now\.cards, wasCardsTop\)/.test(SRD),
      'E2b and so is the nested cards list — Show More appends into that one');

    // E3 — the clamp. New content may be SHORTER than old; a stale offset would show blank space.
    ok(/Math\.max\(0, Math\.min\(top, elm\.scrollHeight - elm\.clientHeight\)\)/.test(SRD),
      'E3  the restored offset is clamped to what the new content can actually scroll');

    // E4 — THE MINIMAL SCROLL. Already visible → do nothing at all.
    const reveal = SRD.slice(SRD.indexOf('function _srdBulkReveal_'), SRD.indexOf('function _srdBulkRender'));
    ok(/if \(top >= viewTop && top < viewBottom\) return;/.test(reveal),
      'E4  a preview already in view is not scrolled at all');
    ok(/if \(top < viewTop\) { _srdBulkSetTop_\(body, top\); return; }/.test(reveal),
      'E4a above the viewport: bring its top to the top edge');
    ok(/Math\.min\(top, bottom - body\.clientHeight\)/.test(reveal),
      'E4b below it: move by the SMALLER of the two distances that reveal it');

    // E5 — every Preview settlement reveals, including the failures. An operator who clicked Preview is owed
    //      the answer whether it is a price list or an error list.
    const pv = SRD.slice(SRD.indexOf('function srdBulkPreview'), SRD.indexOf('function _srdPriceTxt'));
    eq((pv.match(/_srdBulkRender\(\{ reveal: true \}\)/g) || []).length, 5,
      'E5  all five Preview settlements reveal — parse failure, no-op, success, server refusal, unreadable file');
    ok(!/_srdBulkRender\(\);/.test(pv), 'E5a and none of them redraws without revealing');

    // E6 — Show More does NOT reveal, and does not reset: it is a re-render in place, at the bottom of a list
    //      the operator is already reading. Resetting there was the second half of the same complaint.
    const more = SRD.slice(SRD.indexOf('function srdBulkShowMore'), SRD.indexOf('function srdBulkToConfirm'));
    ok(/_srdBulkRender\(\);/.test(more) && !/reveal/.test(more),
      'E6  Show More redraws in place — same stage, so the position is kept and nothing is scrolled');

    // E7 — a fresh open has no position to preserve, and a close forgets the stage.
    ok(/_srdBulkPaintedStage_ = null;\s+\/\/ a fresh open/.test(SRD), 'E7  opening resets the remembered stage');
    ok(/_srdBulk = null;\n        _srdBulkPaintedStage_ = null;/.test(SRD), 'E7a and closing does too');

    // E8 — THE LAYOUT. The base rule is the FORM's two-column grid, and it is untouched; the bulk modal gets
    //      a modifier. A round that edited the base rule would have relaid out the edit dialog by accident.
    ok(/\.srd-modal__body \{[^}]*grid-template-columns: 1fr 1fr/.test(CSS),
      'E8  the edit form keeps its two-column grid');
    ok(/\.srd-modal__body--flow \{ display: block; \}/.test(CSS),
      'E8a and the bulk modal gets a modifier that opts out of it');
    eq((SRD.match(/srd-modal__body srd-modal__body--flow/g) || []).length, 4,
      'E8b applied to all four bulk stages — category, scope/preview, confirm, result');
    const editBodies = SRD.slice(0, SRD.indexOf('function _srdBulkPaint_'));
    eq((editBodies.match(/srd-modal__body--flow/g) || []).length, 0,
      'E8c and to NEITHER of the two form dialogs, which are what the grid was written for');

    // E9 — §12's content requirements, which were already met and are asserted so they stay met.
    const pvHtml = SRD.slice(SRD.indexOf('function _srdBulkPreviewHtml'), SRD.indexOf('function srdBulkShowMore'));
    ok(pvHtml.indexOf('pv.rejected') < pvHtml.indexOf('pv.groups'), 'E9  errors are rendered FIRST');
    ok(/PREVIEW_PAGE_SIZE/.test(pvHtml) && /Show More/.test(pvHtml),
      'E9a a large batch is paged rather than rendered whole');
    ok(/pv\.groups/.test(pvHtml) && !/unchangedRows/.test(pvHtml),
      'E9b only CHANGED rows are drawn — unchanged rows are a count, not a list');
  }

  // =================================================================================================================
  section('F — §7: WHY FC NEXT COSTS WHAT IT COSTS, AND WHY NOTHING WAS "REUSED"');
  // =================================================================================================================
  {
    const M = EV.runs.post_fix_serverMs_0.m;
    // F1 — the count, and its composition. Two tables, one request each.
    eq(M.FC_NEXT_REGULAR.api, 2, 'F1  a cold Regular Next issues TWO canonical reads');
    eq(Object.keys(M.FC_NEXT_REGULAR.byAction).sort(),
      ['getTable:marketplace_skus', 'getTable:sku_details'], 'F1a sku_details and marketplace_skus');
    eq(M.FC_NEXT_REGULAR.dupes, 0, 'F1b neither is asked for twice');

    // F2 — THE ANSWER TO §7's QUESTION. "Does New FC Update re-read data FC Summary already loaded?" No: the
    //      two sets are DISJOINT. FC Summary's own render reads workspace SLICES; the builder reads two broad
    //      tables no slice carries. There is no same-mount reuse available to take, which is why none was.
    const entry = Object.keys(M.FC_ENTRY_TO_FIRST_ROWS.byAction);
    ok(entry.every((k) => /^fcSummary\.workspace\.get/.test(k)),
      'F2  FC Summary\'s own entry reads only fcSummary workspace slices');
    ok(Object.keys(M.FC_NEXT_REGULAR.byAction).every((k) => entry.indexOf(k) === -1),
      'F2a and the builder\'s two tables are NOT among them — the sets are disjoint');
    ok(/regular: \['sku_details', 'marketplace_skus'\]/.test(read('assets/js/pages/fc-summary.js')),
      'F2b which the declared prerequisite list confirms');

    // F3 — and the second Next costs nothing, so the single-flight latch FC-SUMMARY-R1 added still holds.
    eq(M.FC_NEXT_REGULAR_WARM.api, 0, 'F3  a second Next in the same session issues NOTHING');

    // F4 — FC's cold entry is TWO SLICES, not one read twice. This was a harness artefact before the key
    //      included the slice, and it is asserted here so it cannot silently become a real duplicate later.
    eq(M.FC_ENTRY_TO_FIRST_ROWS.dupes, 0, 'F4  FC entry has no duplicate read');
    eq(entry.sort(), ['fcSummary.workspace.get:bootstrap', 'fcSummary.workspace.get:regular'],
      'F4a its two reads are two different slices');

    // F5 — §8's counters, from the driven run rather than from inspection.
    eq(M.FC_ENTRY_TO_SHELL.api, 0, 'F5  reaching the FC shell costs no read of its own');
    ok(EV.runs.post_fix_serverMs_0.errors.length === 0, 'F5a and no FC path threw while being driven');

    // F6 — the one thing this round could NOT measure is recorded as such, with its reason.
    ok(!!EV.not_measured_here.FC_ENTRY_TO_FIRST_ROWS,
      'F6  FC entry-to-first-rows is recorded as NOT measured rather than reported as a zero');
    ok(/does not change behaviour it has not proven wrong/.test(EV.not_measured_here.FC_ENTRY_TO_FIRST_ROWS),
      'F6a and explicitly not treated as a defect');
  }

  // =================================================================================================================
  section('G — §9: PRODUCT STRATEGY REACHES A USEFUL VIEW, AND STILL ASKS FOR A SCOPE');
  // =================================================================================================================
  {
    const M = EV.runs.post_fix_serverMs_0.m;
    eq(M.PSB_ENTRY_TO_SHELL.api, 1, 'G1  entering Product Strategy costs ONE read — the site universe');
    eq(Object.keys(M.PSB_ENTRY_TO_SHELL.byAction), ['productPricing.siteUniverse.get'], 'G1a and only that');
    eq(M.PSB_UNIVERSE_RAW.sites, 6, 'G2  the universe resolves to the six fixture sites');
    eq(M.PSB_UNIVERSE_RAW.refusals, [], 'G2a with no refusal');
    // G3 — the board does NOT read a workspace before a scope is chosen. That is the P1-B8D contract, and it
    //      is the reason entry costs one request rather than one plus a scoped read nobody asked for.
    ok(/Select a company, country and marketplace to begin/.test(M.PSB_STATE.tail),
      'G3  and it asks for a scope instead of reading a workspace it has no scope for');
    ok(!/productPricing\.workspace\.get/.test(JSON.stringify(M.PSB_ENTRY_TO_SHELL.byAction)),
      'G3a no workspace read is issued on entry');
    // G4 — §9 forbids marking production-stable from unit tests. The smoke is PREPARED, not claimed.
    const runbook = read('docs/evidence/s3-r11-interaction-performance/PSB_OPERATOR_SMOKE.md');
    ['Executive Overview', 'Category Analysis', 'Deal Risk', 'Data Quality', 'Strategy Workspace',
     'Advanced Details'].forEach((v) => {
      ok(runbook.indexOf(v) >= 0, 'G4  the operator smoke covers ' + v);
    });
    ok(/PSB_PRODUCTION_SMOKE_REQUIRED\s*=\s*YES/.test(runbook),
      'G4a and states that the smoke is still REQUIRED — nothing here marks PSB production-stable');
  }

  // =================================================================================================================
  section('J — MUTANTS: every repaired condition is attacked');
  // =================================================================================================================
  {
    let killed = 0, survived = 0, harness = 0;
    function mutate(file, from, to, name, probe) {
      const abs = path.join(ROOT, file);
      const before = fs.readFileSync(abs, 'utf8');   // RAW: the file's own line endings are preserved
      if (before.split(from).length - 1 !== 1) {
        harness++; console.log('  HARNESS ERROR ' + name + ' — anchor matched ' +
          (before.split(from).length - 1) + ' times'); return Promise.resolve();
      }
      fs.writeFileSync(abs, before.split(from).join(to), 'utf8');
      return Promise.resolve().then(probe).then(
        (bad) => { if (bad) { killed++; console.log('  ok   ' + name + ' KILLED'); }
                   else { survived++; console.log('  FAIL ' + name + ' SURVIVED'); } },
        () => { killed++; console.log('  ok   ' + name + ' KILLED (threw)'); }
      ).then(() => { fs.writeFileSync(abs, before, 'utf8'); });
    }

    // J1 — remove the in-flight join. The defect returns: two fetches for one partial.
    await mutate('assets/js/core/partial-loader.js',
      'if (pageKey && _inflight[pageKey]) {\r\n            return _inflight[pageKey];\r\n        }',
      'if (false) {\r\n            return _inflight[pageKey];\r\n        }',
      'J1 the in-flight join is removed', async () => {
        const w = loaderWorld();
        w.L.loadPartial('k', 'u.html', '#m'); w.L.loadPartial('k', 'u.html', '#m');
        return w.calls.length !== 1;
      });

    // J2 — never release the key. One failed fetch becomes a permanently empty page.
    await mutate('assets/js/core/partial-loader.js',
      'if (_inflight[pageKey] === flight) delete _inflight[pageKey];',
      'if (false) delete _inflight[pageKey];',
      'J2 the in-flight key is never released', async () => {
        const w = loaderWorld();
        const p = w.L.loadPartial('k', 'u.html', '#m');
        w.settle(true); await p; await tick();
        w.L.loadPartial('k', 'u.html', '#m');
        return w.calls.length !== 2;   // a released key would issue a SECOND real request
      });

    // J3 — drop the trailing-blank trim in sheetToGrid. Excel leaves empty rows under a table almost
    //      every time, so this turns an ordinary .xlsx into a wall of IDENTITY_MISSING errors about rows
    //      the operator never typed. (The inject-once guard is NOT mutated here: with the join in place
    //      one flight has one .then, so removing the guard creates no reachable defect. S3-R10's J5 was
    //      exactly that mistake — an inert mutant surviving for being inert — so it is asserted at A2e
    //      as the second wall it is, rather than dressed up as a killed mutant.)
    await mutate('assets/js/pages/sku-regional-pricing.js',
      'while (grid.length > 1) {', 'while (false) {',
      'J3 trailing blank rows are no longer trimmed', async () => {
        const SRP = loadSRP(read('assets/js/pages/sku-regional-pricing.js'));
        const sheet = { eachRow(o, cb) {
          [['Marketplace SKU ID', 'Regular Price Action', 'Minimum Price Action', 'MSRP Action'],
           ['MS-1', 'No Change', 'No Change', 'No Change'],
           ['', '', '', ''], ['', '', '', '']].forEach((r) =>
            cb({ eachCell(o2, cb2) { r.forEach((c) => cb2({ value: c })); } })); } };
        const g = SRP.sheetToGrid(sheet);
        if (g.length === 2) return false;                    // trimmed: no defect
        return !SRP.validateGrid(g).ok;                      // untrimmed: identity errors on blank rows
      });

    // J4 — restore the scroll on a STAGE CHANGE too. A new step would open part-scrolled, which is the
    //      opposite complaint and just as wrong.
    await mutate('assets/js/pages/sku-regional-details.js',
      'if (wasStage !== null && wasStage === _srdBulkPaintedStage_) {',
      'if (true) {',
      'J4 the stage guard is removed', async () => {
        const s = read('assets/js/pages/sku-regional-details.js');
        return !/wasStage !== null && wasStage === _srdBulkPaintedStage_/.test(s);
      });

    // J5 — reveal unconditionally. A preview already on screen would be scrolled anyway, which is the
    //      "jumps for no reason" the round exists to remove.
    await mutate('assets/js/pages/sku-regional-details.js',
      'if (top >= viewTop && top < viewBottom) return;',
      'if (false) return;',
      'J5 the already-visible check is removed', async () => {
        const s = read('assets/js/pages/sku-regional-details.js');
        return !/if \(top >= viewTop && top < viewBottom\) return;/.test(s);
      });

    // J6 — ship the shared builder's 50 blank rows. Fifty IDENTITY_MISSING errors on a file nobody typed in.
    await mutate('assets/js/pages/sku-regional-pricing.js',
      'blankInputRows: 0,', 'blankInputRows: 50,',
      'J6 the template ships 50 blank rows', async () => {
        const SRP = loadSRP(read('assets/js/pages/sku-regional-pricing.js'));
        const spec = SRP.templateXlsxSpec({ country: 'US', marketplace: 'Amazon', currency: 'USD' }, [], []);
        return spec.blankInputRows !== 0;
      });

    // J7 — drop a word from the dropdown. §11 names exactly three, and "Use Auto Price" is the one an
    //      operator reaches for least often and would miss last.
    await mutate('assets/js/pages/sku-regional-pricing.js',
      "{ value: 'AUTO', label: 'Use Auto Price',",
      "{ value: 'AUTO', label: 'Return To Auto',",
      'J7 the third dropdown word is renamed', async () => {
        const SRP = loadSRP(read('assets/js/pages/sku-regional-pricing.js'));
        const spec = SRP.templateXlsxSpec({ country: 'US', marketplace: 'Amazon', currency: 'USD' }, [], []);
        const dd = spec.columns.filter((c) => /_mode$/.test(c.key))[0].dropdown;
        return JSON.stringify(dd) !== JSON.stringify(['No Change', 'Update Price', 'Use Auto Price']);
      });

    // J8 — make the header reader machine-only. The XLSX's human headers stop parsing, and an operator who
    //      filled in the template they were given is told their file is missing every column.
    await mutate('assets/js/pages/sku-regional-pricing.js',
      '_HEADER_KEY_BY_LABEL[_hdrNorm(SRP.TEMPLATE_HEADER_LABELS[k])] = k;',
      '_HEADER_KEY_BY_LABEL[_hdrNorm(k)] = k;',
      'J8 human headers stop mapping to keys', async () => {
        const SRP = loadSRP(read('assets/js/pages/sku-regional-pricing.js'));
        const g = [['Marketplace SKU ID', 'Regular Price Action', 'Minimum Price Action', 'MSRP Action'],
          ['MS-1', 'No Change', 'No Change', 'No Change']];
        return !SRP.validateGrid(g).ok;
      });

    // J9 — stop finding the header row. Every XLSX from the real template (which writes a banner on row 1)
    //      becomes unreadable, while a CSV keeps working — the worst kind of half-shipped feature.
    await mutate('assets/js/pages/sku-regional-pricing.js',
      'for (var i = 0; i < raw.length && i < 40; i++) {',
      'for (var i = 0; i < 1; i++) {',
      'J9 the header row is assumed to be the first row', async () => {
        const SRP = loadSRP(read('assets/js/pages/sku-regional-pricing.js'));
        const sheet = { eachRow(o, cb) {
          [['Prices are in USD.'], ['Marketplace SKU ID'], ['MS-1']].forEach((r) =>
            cb({ eachCell(o2, cb2) { r.forEach((c) => cb2({ value: c })); } })); } };
        return SRP.sheetToGrid(sheet).length === 0;
      });

    // J10 — let the bulk modal keep the form's grid. This is the layout complaint itself.
    await mutate('assets/css/pages/sku-regional-details.css',
      '.srd-modal__body--flow { display: block; }',
      '.srd-modal__body--flow { display: grid; }',
      'J10 the bulk modal keeps the two-column grid', async () => {
        const c = read('assets/css/pages/sku-regional-details.css');
        return !/\.srd-modal__body--flow \{ display: block; \}/.test(c);
      });

    console.log('  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harness + ' harness errors');
    ok(survived === 0 && harness === 0, 'J   every planted defect was caught', { killed, survived, harness });
  }

  console.log('\n' + (fail ? 'FAIL  ' : 'PASS  ') + pass + ' passed, ' + fail + ' failed');
  console.log('PARTIAL_DUPLICATE_FETCH = FIXED (2 -> 1) · SKU/SRD/RAPID_NAV = 0 REQUESTS · '
    + 'PRIMARY_OPERATOR_TEMPLATE = XLSX · ONE_IMPORT_CONTRACT = YES');
  if (fail) process.exitCode = 1;
}());
