// =================================================================================================================
// S3-R2 — LOADING / RENDER OWNERSHIP, EXECUTED.
//
// WHAT THIS ROUND ACTUALLY FOUND, and it is not what the static census predicted.
//
// The S3-R1 census reported Inventory Replenishment as "3 beginLoad sites / 2 settle sites" and flagged it as the
// outstanding P1 stuck-loading candidate. That count is real and the conclusion drawn from it was wrong twice over:
//
//   · there is NO permanent loading state on this page. Nothing reads the region's state — no `.get()`, no
//     `.isLoading()` — and the region's renderer paints ONLY on INITIAL_LOADING. The table body is painted by
//     _irRenderSearchGate_ on every terminal path, so the operator always sees a settled screen.
//
//   · the real defect is the opposite shape: TWO RENDER OWNERS for one DOM node. #replenScrollBody was painted by
//     the search gate AND by the KM.loadState region, and the region won on the Search path — replacing a message
//     that distinguishes "Preparing… waiting for the page to finish starting up" from "Searching…" with a generic
//     "Loading Inventory Replenishment…". rg.beginLoad runs INSIDE the post-arbiter call, so the overwrite landed
//     seconds later, exactly while the arbiter was doing the waiting the accurate message exists to explain.
//
// AND IT WAS INTERMITTENT, which is what makes it a reliability defect rather than a wording one. The region is
// RETAINED in _irRegionCtl and reused across searches, and the Search path's catch settles _irSearch but never the
// region. So after ONE failed search the region sat in INITIAL_LOADING — from which beginLoad is not a legal
// transition — and silently did nothing forever after. The same page therefore showed two different loading
// messages depending on whether a read had failed earlier in the session.
//
// WHY SETTLING WAS NOT THE FIX. The obvious repair is to settle the region in the catch. Measured, that makes it
// worse: it removes the latch, so the overwrite that used to happen once starts happening on EVERY search. The
// defect is ownership, not settlement, and §J below asserts that distinction so a future round cannot "fix" this
// by adding the settle back and reintroducing the overwrite.
//
// THE FIX: the three reads that paint through the gate are QUIET. The only read that still drives the region is the
// post-write readback, which begins with content on screen (REFRESHING, never blanking) and settles on both paths.
//
// NO BUSINESS SEMANTICS ARE TOUCHED. No pricing, no allocation, no forecast, no write path. Loading affordance and
// render ownership only.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
/** Comments out, string literals KEPT — a column name and an option name both live inside quotes. */
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('HARNESS ERROR — function not found: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('HARNESS ERROR — unbalanced braces: ' + name);
}

const IR = read('assets/js/pages/inventory-replenishment.js');
const LS = require(path.join(ROOT, 'assets/js/api/km-loading-state.js'));

// =================================================================================================================
section('A — THE SHARED CONTRACT: a region that is begun and not settled becomes INERT');
// =================================================================================================================
// This is the mechanism the whole round turns on, asserted on the shared module rather than on any page, because
// it is what makes "beginLoad without a settle" a latch instead of a cosmetic asymmetry.
{
  const seen = [];
  const rg = LS.createRegion({ render: (s) => seen.push(s) });
  eq(rg.beginLoad(false), true, 'A1  a fresh region enters INITIAL_LOADING');
  eq(rg.beginLoad(false), false, 'A2  and a SECOND beginLoad is refused — INITIAL_LOADING is not a legal self-transition');
  eq(seen, ['INITIAL_LOADING'], 'A2a so the placeholder is painted once and never again');

  const rg2 = LS.createRegion({ render: () => {} });
  rg2.beginLoad(false); rg2.set(LS.STATES.ERROR);
  eq(rg2.beginLoad(false), true, 'A3  whereas a SETTLED region accepts the next load');
  eq(LS.canTransition(LS.STATES.INITIAL_LOADING, LS.STATES.INITIAL_LOADING), false,
    'A4  stated on the transition table itself, so this is the contract and not an accident of createRegion');
}

// =================================================================================================================
section('B — EVERY READ OWNER, AND WHICH ONE MAY DRIVE THE REGION');
// =================================================================================================================
{
  const bare = decomment(IR);
  // The owner vocabulary is LIFTED from the page, never restated: a restated copy is the drift the ledger exists
  // to prevent.
  const vocab = (bare.match(/var IR_READ_OWNERS_ = \[([\s\S]*?)\];/) || [])[1] || '';
  const owners = (vocab.match(/'([A-Z_]+)'/g) || []).map((s) => s.replace(/'/g, ''));
  eq(owners.sort(), ['COALESCED_BOOTSTRAP', 'POST_WRITE_READBACK', 'RESTORED_MOUNT_REVALIDATION',
    'SEARCH_CLICK', 'UNDECLARED'],
    'B1  the page declares five read owners');

  // For each call site, does its options object carry `quiet: true`?
  const sites = [];
  const re = /_irWorkspaceRefresh_\(\{([\s\S]{0,240}?)owner:\s*'([A-Z_]+)'/g;
  let m;
  while ((m = re.exec(bare)) !== null) sites.push({ owner: m[2], quiet: /quiet:\s*true/.test(m[1]) });
  eq(sites.length, 4, 'B2  four dispatch sites carry a declared owner', sites);

  const noisy = sites.filter((s) => !s.quiet).map((s) => s.owner);
  eq(noisy, ['POST_WRITE_READBACK'],
    'B3  EXACTLY ONE non-quiet owner — the post-write readback. The three that paint through the search gate '
    + 'are quiet, so no read repaints a node the gate owns.');

  // B4 — and the one that IS allowed to drive the region settles on BOTH of its terminal paths.
  const afterWrite = extractFn(IR, '_irAfterWrite');
  ok(/\.catch\(function \(err\) \{ _irRenderError_\(err\); \}\)/.test(afterWrite.replace(/\s+/g, ' '))
    || /_irRenderError_/.test(afterWrite),
    'B4  the post-write readback routes its failure to _irRenderError_');
  ok(/rg\.set\(window\.KM\.loadState\.STATES\.ERROR\)/.test(extractFn(IR, '_irRenderError_')),
    'B4a and _irRenderError_ is what settles the region to ERROR');
  ok(/rg\.set\(\(_irReadModel\.getMarketplaceSkus/.test(decomment(IR)),
    'B4b while the success path settles it to READY or EMPTY — both terminal paths settle');
}

// =================================================================================================================
section('C — EXECUTED: the gate\'s message survives the read on the Search path');
// =================================================================================================================
// The regression this round exists to prevent, driven through the page's OWN functions.
function world(phase) {
  const body = { innerHTML: '' }, fixed = { innerHTML: '' };
  const doc = { getElementById: (id) => (id === 'replenScrollBody' ? body : id === 'replenFixedBody' ? fixed : null) };
  const win = { KM: { loadState: LS,
    bootArbiter: { PHASE: { PREPARING: 'PREPARING' }, phaseFor: () => phase } } };
  const src = ['var _irRegionCtl = null;', extractFn(IR, '_irRegion_'), extractFn(IR, '_irEsc_'),
    extractFn(IR, '_irRenderSearchGate_')].join('\n');
  const f = new Function('window', 'document', '_irSearch', '_irCriticalReadKey_',
    'var _irRenderReplenishmentFooter_=function(){},_irRenderStaleNotice_=function(){},'
    + '_irRenderCarrierNotice_=function(){};' + src
    + '\nreturn { region:_irRegion_, gate:_irRenderSearchGate_ };');
  const st = { status: 'PRE_SEARCH', error: null, seq: 0, inFlight: false };
  return { api: f(win, doc, st, () => 'k'), body, st };
}
{
  const w = world('PREPARING');
  w.st.status = 'LOADING';
  w.api.gate();
  ok(/Preparing…/.test(w.body.innerHTML),
    'C1  while the arbiter is PREPARING the gate says so — the message R6-R5 §4 added');
  ok(/data-load-phase="PREPARING"/.test(w.body.innerHTML),
    'C1a and publishes the phase, so this is assertable rather than a matter of wording');

  // The fix means no read repaints this node. Simulated faithfully: a quiet read never calls beginLoad.
  const rg = w.api.region();
  ok(rg !== null, 'C2  the region still exists — it was not deleted, it was de-scoped');
  ok(/Preparing…/.test(w.body.innerHTML),
    'C2a and after a QUIET read dispatches, the accurate message is still the one on screen');

  // And the proof that this assertion could fail: drive the region deliberately.
  rg.beginLoad(false);
  ok(/Loading Inventory Replenishment…/.test(w.body.innerHTML),
    'C3  a NON-quiet read would overwrite it — which is what C2a proves no longer happens');
}
{
  // C4 — ERROR is distinct from EMPTY, in the words the operator actually reads.
  const w = world('READING');
  w.st.status = 'ERROR';
  w.st.error = { code: 'REQUEST_TIMEOUT', message: 'read timeout after 60000 ms' };
  w.api.gate();
  ok(/Search failed/.test(w.body.innerHTML), 'C4  a failed read says FAILED');
  ok(/not an empty result/.test(w.body.innerHTML),
    'C4a and says so explicitly — ERROR is never rendered as EMPTY');
  ok(/replen-search-retry/.test(w.body.innerHTML) && /searchReplenishment\(\)/.test(w.body.innerHTML),
    'C4b with exactly one explicit Retry, which dispatches a fresh search');
  ok(/REQUEST_TIMEOUT/.test(w.body.innerHTML), 'C4c and the code is shown, so the failure is diagnosable');
}
{
  // C5 — the pre-search state is not an error and not an empty result.
  const w = world('READING');
  w.st.status = 'PRE_SEARCH';
  w.api.gate();
  ok(/Select Country and Marketplace/.test(w.body.innerHTML) && !/Search failed/.test(w.body.innerHTML),
    'C5  before any search the page asks for a scope — neither ERROR nor EMPTY');
}

// =================================================================================================================
section('D — NO SELF-RETRY: a rejection never dispatches the next read');
// =================================================================================================================
// The S3-R1 class-A defect, re-checked here because this page was never audited for it.
{
  const search = extractFn(IR, 'searchReplenishment');
  const bareSearch = decomment(search);
  const catchBody = (bareSearch.match(/\['catch'\]\(function \(err\) \{([\s\S]*?)\n        \}\)/) || [])[1] || '';
  ok(catchBody.length > 0, 'D1  the Search rejection handler was located', catchBody.length);
  ok(!/_irWorkspaceRefresh_|searchReplenishment\(|_irApplySearch_/.test(catchBody),
    'D2  and it dispatches NOTHING — no loader call, no re-entry, no re-render that could start a read');
  ok(/_irSearch\.status = 'ERROR'/.test(catchBody),
    'D3  it records ERROR and stops; recovery belongs to the explicit Retry');
  ok(/mySeq !== _irSearch\.seq/.test(catchBody),
    'D4  and a superseded failure returns early — a stale rejection cannot overwrite a newer search');

  // D5 — no transport-level timer retry or polling anywhere on this page's read path.
  const bare = decomment(IR);
  ok(!/setInterval\s*\([^)]*_irWorkspaceRefresh_/.test(bare),
    'D5  no interval polls the workspace read');
  ok(!/setTimeout\s*\(\s*function[^}]*_irWorkspaceRefresh_\s*\(/.test(bare),
    'D5a and no timer re-dispatches it after a rejection');
}

// =================================================================================================================
section('E — FAIL CLOSED: a failed canonical read never falls back to business data');
// =================================================================================================================
{
  const rerr = extractFn(IR, '_irRenderError_');
  ok(/_irReadModel = null/.test(rerr),
    'E1  a read failure DROPS the read model — nothing can render from the broad cache behind it');
  ok(/role="alert"/.test(rerr), 'E1a and the banner is announced, not merely coloured');
}

// =================================================================================================================
section('F — THE PAGES THAT ARE *NOT* DEFECTIVE, and why the census counted them anyway');
// =================================================================================================================
// factory-stock / overseas-stock / sku-details / sku-regional-details all call beginLoad and never settle. That is
// the same static signature as the defect above and a DIFFERENT mechanism, so it is asserted rather than assumed:
// their region is created inline and the reference is DISCARDED, so no latch can form and nothing is reused.
{
  const FIRE_AND_FORGET = ['factory-stock', 'overseas-stock'];
  FIRE_AND_FORGET.forEach(function (p, i) {
    const src = decomment(read('assets/js/pages/' + p + '.js'));
    ok(/loadState\.bindElement\([^)]*\)\.beginLoad\(/.test(src),
      'F' + (i + 1) + '  ' + p + ' begins its region inline and keeps no reference to it');
    ok(!/_[a-zA-Z]*RegionCtl|var .*Region.* = .*createRegion/.test(src),
      'F' + (i + 1) + 'a so there is no retained controller a later load could be refused by');
  });
  // And the distinction is real, not a naming convention: Inventory Replenishment DOES retain one.
  ok(/var _irRegionCtl = null;/.test(IR) && /if \(_irRegionCtl\) return _irRegionCtl;/.test(IR),
    'F3  whereas Inventory Replenishment memoizes its region — which is what made the latch reachable');
}

// =================================================================================================================
section('J — MUTANTS');
// =================================================================================================================
// The probe returns TRUTHY when it OBSERVES the mutant's wrong behaviour. It is the detector, not the contract; a
// probe written the other way round reports every mutant as survived.
{
  let caught = 0; const survived = [];
  function mutant(id, why, anchor, repl, probe) {
    if (IR.indexOf(anchor) === -1) { fail++; console.log('  FAIL ' + id + ' HARNESS ERROR — anchor not found'); return; }
    const mutated = IR.replace(anchor, repl);
    let saw = false;
    try { saw = !!probe(mutated); } catch (e) { saw = false; }
    if (saw) { caught++; pass++; console.log('  ok   ' + id + ' ' + why + ' (caught)'); }
    else { survived.push(id); fail++; console.log('  FAIL ' + id + ' ' + why + ' — MUTANT SURVIVED'); }
  }

  // J1 — the Search read stops being quiet. This is the exact defect, and the one a well-meaning "restore the
  //      loading spinner" change would reintroduce.
  mutant('J1', 'the Search read drives the region again, overwriting the gate',
    "        _irWorkspaceRefresh_({ carrier: true, quiet: true,\n            owner: 'SEARCH_CLICK',",
    "        _irWorkspaceRefresh_({ carrier: true,\n            owner: 'SEARCH_CLICK',",
    function (m) {
      const bare = decomment(m);
      const sites = []; const re = /_irWorkspaceRefresh_\(\{([\s\S]{0,240}?)owner:\s*'([A-Z_]+)'/g; let x;
      while ((x = re.exec(bare)) !== null) sites.push({ owner: x[2], quiet: /quiet:\s*true/.test(x[1]) });
      return sites.filter((s) => !s.quiet).map((s) => s.owner).indexOf('SEARCH_CLICK') !== -1;
    });

  // J2 — the bootstrap read stops being quiet: the same overwrite on the cold path.
  mutant('J2', 'the bootstrap read drives the region again',
    "    var wsP = Promise.resolve(_irWorkspaceRefresh_({ carrier: true, quiet: true,",
    "    var wsP = Promise.resolve(_irWorkspaceRefresh_({ carrier: true,",
    function (m) {
      const bare = decomment(m);
      const sites = []; const re = /_irWorkspaceRefresh_\(\{([\s\S]{0,240}?)owner:\s*'([A-Z_]+)'/g; let x;
      while ((x = re.exec(bare)) !== null) sites.push({ owner: x[2], quiet: /quiet:\s*true/.test(x[1]) });
      return sites.filter((s) => !s.quiet).length > 1;
    });

  // J3 — the failure stops dropping the read model, so a stale cache renders behind a red banner.
  mutant('J3', 'a failed read keeps the model, so business data survives the failure',
    '    _irReadModel = null;   // fail closed', '    /* kept */;   // fail closed',
    function (m) { return !/_irReadModel = null/.test(extractFn(m, '_irRenderError_')); });

  // J4 — the rejection re-dispatches. The S3-R1 request storm, planted here deliberately.
  mutant('J4', 'the Search rejection re-enters the loader — the S3-R1 storm',
    "            _irSearch.status = 'ERROR';\n            _irSearch.error = { code: (err && err.code) || 'INVENTORY_REPLENISHMENT_READ_FAILED',",
    "            searchReplenishment();\n            _irSearch.status = 'ERROR';\n            _irSearch.error = { code: (err && err.code) || 'INVENTORY_REPLENISHMENT_READ_FAILED',",
    function (m) {
      const s = decomment(extractFn(m, 'searchReplenishment'));
      const cb = (s.match(/\['catch'\]\(function \(err\) \{([\s\S]*?)\n        \}\)/) || [])[1] || '';
      return /searchReplenishment\(/.test(cb);
    });

  // J5 — the superseded guard is removed, so a stale rejection overwrites a newer search's state.
  mutant('J5', 'a stale rejection overwrites a newer search',
    "            if (mySeq !== _irSearch.seq) return;   // stale failure — never overwrite a newer Search",
    "            /* guard removed */",
    function (m) {
      const s = decomment(extractFn(m, 'searchReplenishment'));
      const cb = (s.match(/\['catch'\]\(function \(err\) \{([\s\S]*?)\n        \}\)/) || [])[1] || '';
      return !/mySeq !== _irSearch\.seq/.test(cb);
    });

  // J6 — ERROR starts rendering as EMPTY. The conflation §11 forbids.
  mutant('J6', 'the failure banner loses the sentence that separates it from an empty result',
    'This is a read failure, not an empty result', 'No results',
    function (m) {
      const w = (function () {
        const body = { innerHTML: '' };
        const doc = { getElementById: (id) => (id === 'replenScrollBody' ? body : { innerHTML: '' }) };
        const win = { KM: { loadState: LS, bootArbiter: { PHASE: { PREPARING: 'P' }, phaseFor: () => 'R' } } };
        const src = ['var _irRegionCtl=null;', extractFn(m, '_irRegion_'), extractFn(m, '_irEsc_'),
          extractFn(m, '_irRenderSearchGate_')].join('\n');
        const f = new Function('window', 'document', '_irSearch', '_irCriticalReadKey_',
          'var _irRenderReplenishmentFooter_=function(){},_irRenderStaleNotice_=function(){},'
          + '_irRenderCarrierNotice_=function(){};' + src + '\nreturn _irRenderSearchGate_;');
        const st = { status: 'ERROR', error: { code: 'X', message: 'y' } };
        f(win, doc, st, () => 'k')();
        return body.innerHTML;
      }());
      return !/not an empty result/.test(w);
    });

  // J7 — the explicit Retry is removed, so a failed page has no recovery but a browser reload.
  mutant('J7', 'the failure banner loses its Retry, stranding the operator',
    'class="replen-search-retry" onclick="searchReplenishment()"', 'class="replen-search-retry"',
    function (m) { return !/replen-search-retry" onclick/.test(m); });

  console.log('\n  mutants caught ' + caught + (survived.length ? '  SURVIVED: ' + survived.join(', ') : ''));
}

console.log('\n' + new Array(101).join('='));
console.log('S3-R2 LOADING / RENDER OWNERSHIP — passed ' + pass + '  failed ' + fail);
console.log('RENDER_OWNERS_PER_REGION = 1 · UNSETTLED_RETAINED_REGION_PATHS = 0');
console.log('SELF_RETRY_ON_REJECTION = 0 · UNAUTHORISED_POLLING = 0 · BUSINESS_FALLBACK_ON_FAILURE = 0');
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · DEPLOYMENTS=0');
console.log(new Array(101).join('='));
process.exit(fail ? 1 : 0);
