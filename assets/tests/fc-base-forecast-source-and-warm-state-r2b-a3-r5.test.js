// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R5
// THE ROWS WERE LOADED. THE BUILDER WAS ASKING THE WRONG STORE.
//
// THREE DEFECTS THE OPERATOR FOUND ON THE PUBLISHED 5cbdd26 / R16 BUILD.
//
//   1  The Target Rule modal OPENED with its Save button already reading "Saving…". A3-R4 added that
//      label and hung it on the only signal the helper carried — `disabled` — but `disabled` answers
//      CAN this be saved, and the validation gate disables Save on every modal open and every scope
//      change. So the word appeared before the operator had touched anything, and stopped meaning
//      that a write was running. Two facts, one signal.
//
//   2  The Special Event Builder's Base FC column was STILL "—" in production, for CO1100 / BFCM /
//      2026-11-19, although those SKUs plainly showed a Regular FC on the table behind the modal.
//      A3-R4's unit proof was sound and its helper works; it reads a store nobody fills on that path.
//      R3-R1 moved the FC Summary primary render onto the scoped fcSummary workspace and explicitly
//      stopped loading the broad Operation DB for it, while the Builder's lazily-loaded broad-cache
//      table list — sku_details, marketplace_skus, campaigns, campaign_sku_lines,
//      pricing_list, fc_special_events — has never contained fc_regular_forecast, by design. The row
//      SHAPE was never the problem: both stores run the identical normalizer. The store was.
//
//   3  "Loading…" still returned on the first Special Next after a successful Special Event save.
//      A3-R4 made invalidation per PATH, which is correct and too coarse: a Special save reaches
//      campaigns, campaign_sku_lines and fc_special_events, and the reference tables on that
//      path — sku_details, marketplace_skus, pricing_list — were discarded with them.
//      (A3-R10 §14.4 later removed `marketplaces` from this list entirely: the bootstrap slice
//      owns those rows, so the Builder reads them from the page model and issues no getTable.)
//
// WHAT THIS SUITE IS FOR. §3 requires a fixture in the ACTUAL production read-model shape rather than
// simplified synthetic rows, and requires it to FAIL at 5cbdd26 and pass after the repair. Section C
// is that fixture: rows built by the real `normalizeFcRegularForecastRecord`, installed where the
// production read model keeps them, with the broad cache left empty exactly as the Special path
// leaves it. At 5cbdd26 every Base FC there resolves to null.
//
// Run: node assets/tests/fc-base-forecast-source-and-warm-state-r2b-a3-r5.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutants = [], survived = [];
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mutant(l, caught) {
  mutants.push(l);
  if (caught === true) { pass++; console.log('ok   ' + l + ' (caught)'); }
  else { survived.push(l); fail++; console.error('FAIL ' + l + ' — MUTANT SURVIVED'); }
}

var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = (src.slice(Math.max(0, i - 6), i) === 'async ') ? i - 6 : i;
  var d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
function varSrc(src, name) {
  var m = new RegExp('var ' + name + ' = [\\s\\S]*?;\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}

// =========================================================================================================
section('A. TARGET RULE SAVE — TWO QUESTIONS, TWO ANSWERS');
// =========================================================================================================
var TRENDER = fnSrc(FCS, '_fcRenderTargetSave_');
var TVALID = fnSrc(FCS, '_fcSetTargetSaveEnabled_');
var TBUSY = fnSrc(FCS, '_fcSetTargetSaveBusy_');

function tgtWorld(renderSrc) {
  var btn = { textContent: 'Save', disabled: false, dataset: {}, _attrs: {},
    setAttribute: function (k, v) { this._attrs[k] = v; }, removeAttribute: function (k) { delete this._attrs[k]; } };
  var sb = { document: { getElementById: function (id) { return id === 'fc-target-save-btn' ? btn : null; } } };
  vm.createContext(sb);
  vm.runInContext([varSrc(FCS, '_fcTargetSave_'), renderSrc || TRENDER, TVALID, TBUSY].join('\n'), sb);
  function state() { return [btn.textContent, btn.disabled, btn._attrs['aria-busy'] || null]; }
  return { btn: btn, sb: sb, state: state };
}

(function () {
  // 1. THE OPERATOR'S REPORT. The modal opens on a form that is incomplete by definition.
  var w = tgtWorld();
  w.sb._fcSetTargetSaveEnabled_(false);
  eq(w.state(), ['Save', true, null],
    'A1  modal opens invalid: Save is closed, the label still reads Save, nothing claims to be busy');

  // 2/3. validation-disabled, then valid idle — the label never moves for either.
  w.sb._fcSetTargetSaveEnabled_(true);
  eq(w.state(), ['Save', false, null], 'A2  valid idle: Save, open, not busy');
  w.sb._fcSetTargetSaveEnabled_(false);
  eq(w.state(), ['Save', true, null], 'A3  validation closes it again and STILL says Save');

  // 4/5. the write, and only the write, may say so.
  w.sb._fcSetTargetSaveEnabled_(true);
  w.sb._fcSetTargetSaveBusy_(true);
  eq(w.state(), ['Saving…', true, 'true'], 'A4  in flight: Saving… + disabled + aria-busy');
})();

(function () {
  // 6. a repeated click is one logical write, and must not capture "Saving…" as the idle label.
  var w = tgtWorld();
  w.sb._fcSetTargetSaveEnabled_(true);
  w.sb._fcSetTargetSaveBusy_(true);
  w.sb._fcSetTargetSaveBusy_(true);
  w.sb._fcSetTargetSaveBusy_(true);
  w.sb._fcSetTargetSaveBusy_(false);
  eq(w.state(), ['Save', false, null], 'A5  repeated in-flight calls still restore the ORIGINAL label');
  eq(w.btn.dataset.fcIdleLabel, 'Save', 'A5a and the captured idle label is the markup\'s, never the busy one');
})();

(function () {
  // 7. failure → idle label restored, and an invalid form stays closed rather than being forced open.
  var w = tgtWorld();
  w.sb._fcSetTargetSaveEnabled_(false);
  w.sb._fcSetTargetSaveBusy_(true);
  w.sb._fcSetTargetSaveBusy_(false);
  eq(w.state(), ['Save', true, null],
    'A6  a refusal returns the control to IDLE — the label, but not a validity it never checked');
})();

// 8. the wiring: which caller owns which fact.
var SAVE_TR = fnSrc(FCS, 'saveNewTargetRule');
ok(/_fcSetTargetSaveBusy_\(true\);/.test(SAVE_TR), 'A7  the SAVE path is what sets busy');
ok(/reenable: function \(\) \{ _fcSetTargetSaveBusy_\(false\); \}/.test(SAVE_TR),
  'A7a and the shared settle hands the control back to idle, not to "enabled"');
ok(/_fcSetTargetSaveBusy_\(false\);\s+\/\/ the write is over/.test(SAVE_TR),
  'A7b success clears busy too — it does not assert a validity the next open will decide');
var GATE = fnSrc(FCS, '_trApplyGate_');
ok(/_fcSetTargetSaveEnabled_\(!!g\.ok\)/.test(GATE) && GATE.indexOf('Busy') === -1,
  'A8  the VALIDATION gate drives validity only — it can no longer reach the busy label');
ok(TVALID.indexOf('Saving…') === -1,
  'A8a and the validity setter does not contain the word at all (the A3-R4 defect, closed at source)');
ok(/_fcWriteBegin_\('targetRule'\)/.test(FCS), 'A9  the single-flight latch is untouched — one logical write');

// =========================================================================================================
section('B. WHERE THE ROWS ACTUALLY LIVE — the store census that explains the live "—"');
// =========================================================================================================
var PREREQ = varSrc(FCS, '_FC_PREREQ_TABLES_');
/* R2-STABILITY §1/§2 — B0 INVERTS, AND THIS SUITE IS WHY IT COULD.

   A3-R5 taught the SPECIAL builder to read the forecast from the page accessor instead of the broad
   cache. It left the REGULAR builder asking `KM.DB.getFcRegularForecast()` directly, and so the broad
   prerequisite had to stay to serve it. Once those six call sites ask the page accessor too — which is
   this round — the broad read serves nobody: in Workspace mode the accessor returns the read model and
   never falls through, so the fetched rows went into a store nothing consults. That unused request is
   the REQUEST_TIMEOUT / getTable / fc_regular_forecast an operator hit on Regular -> Next.

   So B0 now asserts the opposite MEMBERSHIP for the opposite reason, and B0a keeps the claim that
   actually protects the operator: the rows are still reachable, from the one owner. */
ok(PREREQ.indexOf('fc_regular_forecast') === -1,
  'B0  the Regular path no longer loads the forecast table — nothing read what it fetched');
ok(/_fcGetRegularForecast\(\)/.test(fnSrc(FCS, '_regularPrefillManual')),
  'B0a  because the Regular Builder asks the page accessor, exactly as the Special one does');
(function () {
  var sb = { console: console }; vm.createContext(sb);
  vm.runInContext(PREREQ, sb);
  eq(sb._FC_PREREQ_TABLES_.event.indexOf('fc_regular_forecast'), -1,
    'B1  the SPECIAL path does not, and still must not — the Builder\'s broad-cache list is unchanged');
  // A3-R10 §14.4 — SIX, not seven. `marketplaces` is emitted by the bootstrap slice and adapted
  // through the same normalizer and filter as the broad cache, so fetching it again was a second
  // physical read for rows already in memory — and in production that read is the one that failed.
  // Asserted as MEMBERSHIP rather than a count: a length alone cannot say WHICH table left.
  eq(sb._FC_PREREQ_TABLES_.event.indexOf('marketplaces'), -1,
    'B1a  marketplaces is NOT a prerequisite — an authoritative read already owns it');
  ok(sb._FC_PREREQ_TABLES_.event.indexOf('marketplace_skus') !== -1,
    'B1b  but marketplace_skus IS, because no workspace read carries it');
  ok(sb._FC_PREREQ_TABLES_.event.length === 6, 'B1c  which leaves six');
})();
var GETREG = fnSrc(FCS, '_evtBaseFcForSku');
ok(/_fcGetRegularForecast\(\)/.test(GETREG),
  'B2  so the Builder asks the page\'s read-model-first accessor, which is where the rows are');
ok(!/var rows = \(window\.KM && window\.KM\.DB && window\.KM\.DB\.getFcRegularForecast\) \? window\.KM\.DB\.getFcRegularForecast\(\) : \[\];/.test(GETREG),
  'B2a and no longer the broad cache alone, which on the Special path is empty');
var ACC = fnSrc(FCS, '_fcGetRegularForecast');
ok(/_fcHas_\('fcRegularForecast'\)/.test(ACC) && /window\.KM\.DB\.getFcRegularForecast/.test(ACC),
  'B3  that accessor is workspace-first with the Legacy broad cache behind it — one answer, both modes');
ok(/normalizeFcRegularForecastRecord/.test(API.split('adaptFcSummaryWorkspace')[1] || ''),
  'B4  and both stores run the SAME canonical normalizer, so the shape was never the difference');

// the open path now settles the Base FC source as well as the tables
var BFSM = fnSrc(FCS, '_fcBaseFcSourceMissing_');
/* B5 INVERTS for the same reason, one layer down. Removing the broad read did not remove the Regular
   Builder's NEED for the forecast — it moved that need onto the regular slice, which is where the
   Special path's need already lived. Had this guard stayed keyed to 'event', a Regular Builder opened
   from the Event tab would have prefilled nothing and sat on "Loading existing forecast… please wait."
   forever: a worse failure than the timeout this round removed, because it offers nothing to act on. */
ok(BFSM.indexOf("!== 'event'") === -1,
  'B5  BOTH builders declare this dependency now — the guard describes the dependency, not one path');
ok(/_fcWorkspaceMode_\(\) && !_fcHas_\('fcRegularForecast'\)/.test(BFSM),
  'B5a missing means "workspace mode and the read model does not hold it" — absent is unread, not empty');
var ENSURE = fnSrc(FCS, '_fcEnsureBaseFcSource_');
ok(/_fcSliceFetch_\(FC_SLICE_\.REGULAR\)/.test(ENSURE),
  'B6  and it is satisfied through the EXISTING slice owner — no second fetcher, no new table list');
var PROCEED = fnSrc(FCS, 'proceedToFcMode');
ok(/if \(!_fcPrereqNeeded_\(selectedMode\) && !_fcBaseFcSourceMissing_\(selectedMode\)\)/.test(PROCEED),
  'B7  a builder only opens "warm" when BOTH of its sources are present');
ok(PROCEED.indexOf('_fcPrereqAndSources_(selectedMode)') !== -1,
  'B7a and the cold path awaits both before opening');
(function () {
  var sb = { console: console, Promise: Promise }; vm.createContext(sb);
  vm.runInContext([
    'var __sliced = [];',
    'var FC_SLICE_ = { BOOTSTRAP: "bootstrap", REGULAR: "regular", EVENTS: "events", RULES: "rules" };',
    'var __ws = true, __has = false;',
    'function _fcWorkspaceMode_() { return __ws; }',
    'function _fcHas_() { return __has; }',
    'function _fcSliceFetch_(n) { __sliced.push(n); return Promise.resolve(); }',
    fnSrc(FCS, '_fcPrereqPath_'), BFSM, ENSURE
  ].join('\n'), sb);
  eq(sb._fcBaseFcSourceMissing_('regular'), true,
    'B8  a Regular open with no forecast rows triggers this too, now that it reads the slice');
  eq(sb._fcBaseFcSourceMissing_('event'), true, 'B8a a Special open with no forecast rows does');
  vm.runInContext('__has = true;', sb);
  eq(sb._fcBaseFcSourceMissing_('event'), false, 'B8b and stops once the read model holds them');
  eq(sb._fcBaseFcSourceMissing_('regular'), false, 'B8c ... and so does the Regular path');
  vm.runInContext('__has = false; __ws = false;', sb);
  eq(sb._fcBaseFcSourceMissing_('regular'), false,
    'B8d LEGACY mode is inert — there is no workspace there to be authoritative about');
  vm.runInContext('__has = false; __ws = false;', sb);
  eq(sb._fcBaseFcSourceMissing_('event'), false,
    'B8c Legacy mode is inert here — it has no workspace to be authoritative about');
  vm.runInContext('__ws = true;', sb);
  // The stub records the request synchronously, so this is asserted here rather than in a .then()
  // that the summary below would never wait for.
  sb._fcEnsureBaseFcSource_('event');
  eq(sb.__sliced, ['regular'], 'B9  and the fetch it issues is exactly one regular slice');
  vm.runInContext('__has = true;', sb);
  sb._fcEnsureBaseFcSource_('event');
  eq(sb.__sliced, ['regular'], 'B9a and it issues NOTHING when the read model already holds the rows');
})();

// =========================================================================================================
section('C. BASE FC OVER THE PRODUCTION READ-MODEL SHAPE (fails at 5cbdd26)');
// =========================================================================================================
// Rows are built by the REAL normalizer, so every production-shape fact travels with them: `year` is a
// STRING, the twelve month columns are lower-case three-letter keys, and each is parseFloat(...)||0.
var NORM = (function () {
  var sb = { console: console, String: String, parseFloat: parseFloat };
  vm.createContext(sb);
  vm.runInContext(fnSrc(API, 'normalizeFcRegularForecastRecord'), sb);
  return sb.normalizeFcRegularForecastRecord;
})();

var RAW_ROWS = [
  // the operator's case: CO1100 family, ResUS / US / Amazon, 2026, November = 4200
  { forecast_id: 'FC-1', year: 2026, company: 'ResUS', country: 'US', marketplace: 'Amazon',
    sku: 'CO1100-R', category: 'Cookware', series: 'CO1100', nov: 4200, oct: 3100, dec: 5000 },
  // a genuine stored ZERO for November — a value, and not the same fact as "no row"
  { forecast_id: 'FC-2', year: 2026, company: 'ResUS', country: 'US', marketplace: 'Amazon',
    sku: 'CO1100-B', category: 'Cookware', series: 'CO1100', nov: 0, oct: 900 },
  // same SKU, DIFFERENT year — must not answer a 2026 event
  { forecast_id: 'FC-3', year: 2027, company: 'ResUS', country: 'US', marketplace: 'Amazon',
    sku: 'CO1100-R', category: 'Cookware', series: 'CO1100', nov: 9999 },
  // same SKU, DIFFERENT country — must not answer a US event
  { forecast_id: 'FC-4', year: 2026, company: 'ResUS', country: 'CA', marketplace: 'Amazon',
    sku: 'CO1100-R', category: 'Cookware', series: 'CO1100', nov: 7777 },
  // same SKU, DIFFERENT company
  { forecast_id: 'FC-5', year: 2026, company: 'OtherCo', country: 'US', marketplace: 'Amazon',
    sku: 'CO1100-R', category: 'Cookware', series: 'CO1100', nov: 6666 }
];
var MODEL_ROWS = RAW_ROWS.map(NORM);

ok(typeof MODEL_ROWS[0].year === 'string' && MODEL_ROWS[0].year === '2026',
  'C0  production shape: year is a STRING on the read model');
eq(MODEL_ROWS[0].nov, 4200, 'C0a and the month column is the lower-case three-letter key');

function baseWorld(opts) {
  opts = opts || {};
  var dom = {
    'event-start-date': { value: opts.start === undefined ? '2026-11-19' : opts.start },
    'event-target-year': { value: opts.targetYear === undefined ? '2026' : opts.targetYear },
    'event-assist-base-year': { value: opts.assistYear === undefined ? '' : opts.assistYear }
  };
  var sb = {
    console: console, String: String, Number: Number, isNaN: isNaN, Math: Math,
    parseInt: parseInt, parseFloat: parseFloat, Array: Array, Object: Object,
    document: { getElementById: function (id) { return dom[id] || null; } },
    // PRODUCTION, EXACTLY: the broad cache is EMPTY on the Special path — nothing ever loaded
    // fc_regular_forecast into it — while the workspace read model holds every row.
    window: { KM: { DB: { getFcRegularForecast: function () { return []; } } } }
  };
  vm.createContext(sb);
  vm.runInContext([
    varSrc(FCS, 'REG_MONTH_KEYS'),
    'var _fcReadModel = ' + JSON.stringify(opts.model === undefined ? { fcRegularForecast: MODEL_ROWS } : opts.model) + ';',
    'function _fcWorkspaceMode_() { return true; }',
    fnSrc(FCS, '_fcHas_'),
    fnSrc(FCS, '_fcGetRegularForecast'),
    'function _fcResolveMarketplaceKey(v) { return String(v == null ? "" : v).trim(); }',
    'function _evtSelectedSite() { return ' + JSON.stringify(
      opts.site || { company: 'ResUS', country: 'US', marketplace: 'Amazon' }) + '; }',
    fnSrc(FCS, '_evtEventMonthIdx'),
    opts.baseFcSrc || fnSrc(FCS, '_evtBaseFcForSku'),
    fnSrc(FCS, '_evtEventBaseFcForSku')
  ].join('\n'), sb);
  return sb;
}

(function () {
  var W = baseWorld();
  // 9 — THE ASSERTION THAT FAILS AT 5cbdd26: there the Builder reads the empty broad cache.
  eq(W._evtEventBaseFcForSku('CO1100-R'), 4200,
    'C1  the operator\'s case resolves its real Base FC from the production read model');
  eq(W._evtEventMonthIdx(), 10, 'C2  the event month comes from the start date — November is index 10');
  // 11 — zero is a value
  eq(W._evtEventBaseFcForSku('CO1100-B'), 0, 'C3  a stored ZERO stays 0 — it is not "no base forecast"');
  ok(W._evtEventBaseFcForSku('CO1100-B') !== null, 'C3a and is distinct from null at the type level');
  // 12 — missing stays missing
  eq(W._evtEventBaseFcForSku('CO9999-X'), null, 'C4  a SKU with no scoped row is null, never a fabricated 0');
  // 15 — year and scope filtering survive
  eq(W._evtBaseFcForSku('CO1100-R', 10, 2027), 9999, 'C5  the 2027 row is reachable when 2027 is asked for');
  eq(W._evtBaseFcForSku('CO1100-R', 10, 2028), null, 'C5a and a year with no row is null');
  eq(W._evtBaseFcForSku('CO1100-R', 9, 2026), 3100, 'C6  October reads October, not November');
  eq(W._evtBaseFcForSku('CO1100-R', 11, 2026), 5000, 'C6a December reads December');
})();

(function () {
  // 15 — the scope dimensions, one at a time
  eq(baseWorld({ site: { company: 'ResUS', country: 'CA', marketplace: 'Amazon' } })._evtEventBaseFcForSku('CO1100-R'),
    7777, 'C7  a CA event reads the CA row');
  eq(baseWorld({ site: { company: 'OtherCo', country: 'US', marketplace: 'Amazon' } })._evtEventBaseFcForSku('CO1100-R'),
    6666, 'C7a and another company reads its own');
  eq(baseWorld({ site: { company: 'ResUS', country: 'US', marketplace: 'Walmart' } })._evtEventBaseFcForSku('CO1100-R'),
    null, 'C7b a marketplace with no row is null, not the Amazon figure');
})();

(function () {
  // 13/14 — Single SKU, Build and Preview must not have three answers. They do not: all three reach
  // the same reader, and the group builder is pinned to it here.
  var BUILD = fnSrc(FCS, '_evtBuildGroups');
  // A3-R6 §7 — the wrapper Build calls is now the METHOD-AWARE owner: the three assist methods do not
  // share a baseline, and resolving the Regular forecast for all of them put a Base Campaign figure's
  // name over a Regular forecast's number. The rule this pinned is unchanged and still pinned: Build
  // resolves through ONE owner, and `!= null` keeps a previewed 0 from being re-resolved.
  ok(/baseFc: \(p && p\.baseFc != null\) \? p\.baseFc : _evtBuildBaselineForSku\(r\.sku\)/.test(BUILD),
    'C8  Build resolves through the one wrapper, and `!= null` keeps a previewed 0 from being re-resolved');
  var defs = (FCS.match(/function _evtBaseFcForSku\(/g) || []).length;
  eq(defs, 1, 'C8a the Regular-forecast lookup formula has exactly ONE implementation');
  var callers = (FCS.match(/[^n] _evtBaseFcForSku\(|return _evtBaseFcForSku\(/g) || []).length;
  ok(callers >= 2 && callers <= 5,
    'C8b and a small, named set of callers — no fourth copy of the filter', callers);
  var WRAP = fnSrc(FCS, '_evtEventBaseFcForSku');
  ok(/_evtEventMonthIdx\(\)/.test(WRAP) && /event-target-year/.test(WRAP),
    'C9  and the wrapper derives month and year the way the SAVE does — start date, then Target Year');
})();

(function () {
  // the year fallback the wrapper documents: no start date yet, Target Year still answers
  var W = baseWorld({ start: '' });
  eq(W._evtEventBaseFcForSku('CO1100-R'), null, 'C10  with no start date there is no event month, so null');
  var W2 = baseWorld({ start: '2026-11-19', targetYear: '2026' });
  eq(W2._evtEventBaseFcForSku('CO1100-R'), 4200, 'C10a with one, the year comes from the date itself');
})();

(function () {
  // unread is not empty: a read model that has never been given the slice must not answer 0
  var W = baseWorld({ model: {} });
  eq(W._evtEventBaseFcForSku('CO1100-R'), null,
    'C11  an UNREAD forecast slice answers null — which is what _fcBaseFcSourceMissing_ exists to prevent');
})();

// =========================================================================================================
section('D. POST-WRITE OWNERSHIP — what a Special save can and cannot have changed');
// =========================================================================================================
var SLICETBL = varSrc(FCS, '_FC_SLICE_PREREQ_TABLES_');
function resetWorld(resetSrc) {
  var sb = { console: console, Object: Object, Array: Array, String: String };
  vm.createContext(sb);
  vm.runInContext([
    PREREQ, SLICETBL,
    'var _fcSecondaryLoaded = true;',
    'var _fcPrereqLoadedPaths_ = {};',
    'var _fcPrereqLoadedTables_ = {};',
    fnSrc(FCS, '_fcSliceTables_'),
    fnSrc(FCS, '_fcPrereqMissing_'),
    // R2-STABILITY §4 — `_fcResetSecondaryCache` now consults the receipts before invalidating, so
    // its callee is lifted too. With no `KM.DB.reconcileCacheRow` in this sandbox it reconciles
    // nothing, which is the pre-round behaviour and is exactly what the assertions below expect.
    fnSrc(FCS, '_fcReconcileFromReceipts_'),
    resetSrc || fnSrc(FCS, '_fcResetSecondaryCache')
  ].join('\n'), sb);
  sb.__warmAll = function () {
    vm.runInContext('_fcPrereqLoadedPaths_ = { regular: true, event: true }; _fcPrereqLoadedTables_ = {};', sb);
    var all = {};
    Object.keys(sb._FC_PREREQ_TABLES_).forEach(function (p) {
      sb._FC_PREREQ_TABLES_[p].forEach(function (t) { all[t] = true; });
    });
    vm.runInContext('_fcPrereqLoadedTables_ = ' + JSON.stringify(all) + ';', sb);
  };
  sb.__warm = function () { return Object.keys(vm.runInContext('_fcPrereqLoadedTables_', sb)).sort(); };
  sb.__paths = function () { return Object.keys(vm.runInContext('_fcPrereqLoadedPaths_', sb)).sort(); };
  return sb;
}

var EVENT_TABLES = ['sku_details', 'marketplace_skus', 'campaigns',
  'campaign_sku_lines', 'pricing_list', 'fc_special_events'];
var CHANGED_BY_SPECIAL = ['campaigns', 'campaign_sku_lines', 'fc_special_events'];
var UNCHANGED_BY_SPECIAL = ['sku_details', 'marketplace_skus', 'pricing_list'];

(function () {
  var W = resetWorld();
  eq(W._FC_SLICE_PREREQ_TABLES_.events.slice().sort(), CHANGED_BY_SPECIAL.slice().sort(),
    'D1  the census: a Special Event save reaches exactly these three tables');
  eq(W._FC_PREREQ_TABLES_.event.slice().sort(), EVENT_TABLES.slice().sort(),
    'D1a and the Special path holds these six');
  // 16 — the four it cannot touch stay warm
  W.__warmAll();
  W._fcResetSecondaryCache('events');
  var warm = W.__warm();
  eq(UNCHANGED_BY_SPECIAL.filter(function (t) { return warm.indexOf(t) === -1; }), [],
    'D2  after a Special save the three reference tables it cannot change are STILL warm');
  eq(CHANGED_BY_SPECIAL.filter(function (t) { return warm.indexOf(t) !== -1; }), [],
    'D3  and the three it can change are not — nothing stale is presented as fresh');
})();

(function () {
  // 20 — the request count the operator actually pays on the next Special Next
  var W = resetWorld();
  W.__warmAll();
  eq(W._fcPrereqMissing_('event'), [], 'D4  a warm Special path asks for nothing');
  W._fcResetSecondaryCache('events');
  eq(W._fcPrereqMissing_('event').sort(), CHANGED_BY_SPECIAL.slice().sort(),
    'D5  after a Special save it asks for THREE tables, not all six');
  eq(W._fcPrereqMissing_('regular'), [],
    'D6  and the Regular builder, which holds none of them, still asks for nothing');
})();

(function () {
  // 22/28/29 — the other two write scopes, unchanged in kind and now finer in degree
  var W = resetWorld();
  W.__warmAll();
  W._fcResetSecondaryCache('rules');
  eq(W._fcPrereqMissing_('event'), [], 'D7  a TARGET RULE save still keeps the Special builder warm');
  eq(W._fcPrereqMissing_('regular'), [], 'D7a and the Regular builder warm — neither holds fc_target_rules');

  var W2 = resetWorld();
  W2.__warmAll();
  W2._fcResetSecondaryCache('regular');
  /* R2-STABILITY §1/§2 — a Regular save now invalidates NO builder prerequisite, because the forecast
     table is not one any more. That is not data going stale: the Regular Builder reads the forecast
     from the READ MODEL, and `_fcAfterWrite` re-fetches the regular SLICE after every Regular write.
     The freshness the operator depends on is owned by the slice; the broad-cache latch that used to
     stand in for it is simply no longer in the path. D8b states the thing that now carries the
     guarantee, so this pair cannot pass while the real refresh disappears. */
  eq(W2._fcPrereqMissing_('regular'), [],
    'D8  a REGULAR save leaves both builders warm — it invalidates no prerequisite of either');
  eq(W2._fcPrereqMissing_('event'), [], 'D8a and the Special builder likewise');
  ok(/_fcSliceFetch_\(_slice\)/.test(fnSrc(FCS, '_fcAfterWrite')),
    'D8b  and the forecast the Regular Builder actually reads is refreshed by the SLICE readback');

  var W3 = resetWorld();
  W3.__warmAll();
  W3._fcResetSecondaryCache({ slice: 'events', merged: true });
  eq(W3._fcPrereqMissing_('event').sort(), CHANGED_BY_SPECIAL.slice().sort(),
    'D9  the object form of the scope is read the same way as the bare string');
})();

(function () {
  // 23 — an unknown scope may never keep anything warm. "I do not know what this write touched" is
  // not a licence to reuse memory.
  var W = resetWorld();
  W.__warmAll();
  W._fcResetSecondaryCache(undefined);
  eq(W._fcPrereqMissing_('event').sort(), EVENT_TABLES.slice().sort(),
    'D10  an ABSENT scope invalidates everything');
  eq(W.__paths(), [], 'D10a including every path flag');
  var W2 = resetWorld();
  W2.__warmAll();
  W2._fcResetSecondaryCache('somethingNobodyDeclared');
  eq(W2._fcPrereqMissing_('event').sort(), EVENT_TABLES.slice().sort(),
    'D11  and so does an UNRECOGNISED one');
})();

(function () {
  // 17/18/19/21 — the changed data becomes authoritative by being RE-READ, not by being patched.
  // Nothing here invents an id, a row_version or a row: the three tables the server owns are dropped
  // and asked for again, which is the only way the frontend can hold what the server assigned.
  var RESET = fnSrc(FCS, '_fcResetSecondaryCache');
  ok(RESET.indexOf('delete _fcPrereqLoadedTables_[t]') !== -1,
    'D12  the reconciliation is a DROP of the changed tables');
  ok(!/row_version|event_fc_id|campaign_id\s*=/.test(RESET),
    'D12a it fabricates no id and no version — the server\'s answers are read back, never guessed');
  var LOADER = fnSrc(FCS, '_fcLoadPrerequisites_');
  ok(/var need = _fcPrereqMissing_\(p\)/.test(LOADER) && /rc\(need\)/.test(LOADER),
    'D13  and the reload asks for exactly the dropped tables');
  ok(/need\.forEach\(function \(t\) \{ _fcPrereqLoadedTables_\[t\] = true; \}\);/.test(LOADER),
    'D14  which are marked warm only on SUCCESS — a failed read leaves them missing');
  var onSuccessOnly = /onSuccess: function/.test(fnSrc(FCS, 'saveNewTargetRule'));
  ok(onSuccessOnly, 'D15  and the write path reconciles from onSuccess, so a failed write patches nothing');
})();

// =========================================================================================================
section('E. R16 / A3-R2 NON-REGRESSION');
// =========================================================================================================
var GS20 = read('assets/specs/active/apps-script/20_campaign_write_handlers.gs');
ok(/if \(headerIdentical\) \{/.test(GS20), 'E1  the R16 campaign-reuse branch is still there');
ok(GS20.indexOf('var expectedVersion') > GS20.indexOf('if (headerIdentical) {'),
  'E2  and is still classified BEFORE the version gate — a new SKU on an existing window still saves');
ok(/STALE_CAMPAIGN_VERSION/.test(GS20), 'E3  while a real header mutation is still refused');
ok(/_kmCanonicalWrite_/.test(API) && /kind: 'write'/.test(API),
  'E4  the A3-R2 canonical write transport is untouched');
ok(/STALE_CAMPAIGN_VERSION/.test(API) && /KM_CANONICAL_CODES/.test(API),
  'E5  and the A3-R4 typed refusal codes are still registered');
var SLICEFETCH = fnSrc(FCS, '_fcSliceFetch_');
ok(/if \(rec\.flight\) return rec\.flight;/.test(SLICEFETCH), 'E6  the selector is still single-flight');
var RETRY = fnSrc(FCS, '_fcRetryFailedSlices_');
ok(/var bad = _fcFailedSlices_\(\);/.test(RETRY), 'E7  Retry still asks which slices failed');
ok(/bad\.forEach\(function \(n\) \{\s*_fcSliceFetch_\(n\)/.test(RETRY),
  'E8  and still re-requests only those — SELECTOR_RETRY_BEHAVIOR = HEALTHY_RECOVERY');

// =========================================================================================================
section('F. MUTANTS');
// =========================================================================================================
mutant('M1 Saving… shown whenever the control is disabled (the A3-R4 live defect)', (function () {
  var faulted = TRENDER.replace('if (_fcTargetSave_.busy) {', 'if (b.disabled) {');
  if (faulted === TRENDER) throw new Error('M1 anchor drifted');
  var w = tgtWorld(faulted);
  w.sb._fcSetTargetSaveEnabled_(false);          // invalid form, no write anywhere near it
  return w.btn.textContent === 'Saving…';
})());

mutant('M2 the busy label removed entirely', (function () {
  var faulted = TRENDER.replace("b.textContent = 'Saving…';", '');
  if (faulted === TRENDER) throw new Error('M2 anchor drifted');
  var w = tgtWorld(faulted);
  w.sb._fcSetTargetSaveBusy_(true);
  return w.btn.textContent !== 'Saving…';
})());

mutant('M3 the Builder reads the broad cache again (production-shape conversion removed)', (function () {
  // R2-STABILITY §2 — the reader lost its dead broad-cache fallback, so the anchor moves with it. The
  // FAULT is exactly what it was: the Builder asks the broad cache, which on this path is empty.
  var faulted = GETREG.replace(
    'var rows = _fcGetRegularForecast();',
    'var rows = (window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];');
  if (faulted === GETREG) throw new Error('M3 anchor drifted');
  var W = baseWorld({ baseFcSrc: faulted });
  return W._evtEventBaseFcForSku('CO1100-R') === null;   // exactly the live symptom: "—"
})());

mutant('M4 a stored zero converted to null', (function () {
  var faulted = GETREG.replace("if (raw === '' || raw == null) return null;", 'if (!raw) return null;');
  if (faulted === GETREG) throw new Error('M4 anchor drifted');
  var W = baseWorld({ baseFcSrc: faulted });
  return W._evtEventBaseFcForSku('CO1100-B') !== 0;
})());

mutant('M5 the scope dropped during the lookup', (function () {
  var faulted = GETREG.replace(/\(!site\.country \|\| up\(r\.country\) === up\(site\.country\)\) &&/, 'true &&');
  if (faulted === GETREG) throw new Error('M5 anchor drifted');
  var W = baseWorld({ site: { company: 'ResUS', country: 'CA', marketplace: 'Amazon' } , baseFcSrc: faulted });
  return W._evtEventBaseFcForSku('CO1100-R') !== 7777;   // the US row now wins the filter
})());

mutant('M6 all seven prerequisites cleared after a Special write', (function () {
  var faulted = 'function _fcResetSecondaryCache(scope) { _fcSecondaryLoaded = false;'
    + ' _fcPrereqLoadedPaths_ = {}; _fcPrereqLoadedTables_ = {}; }';
  var W = resetWorld(faulted);
  W.__warmAll();
  W._fcResetSecondaryCache('events');
  // Derived from the declaration, not a literal: the claim is ALL of them, and a count written by hand
  // is exactly what stopped this mutant firing when the list lost a member.
  return W._fcPrereqMissing_('event').length === W._FC_PREREQ_TABLES_.event.length;
})());

mutant('M7 the CHANGED tables kept warm after a Special write', (function () {
  var RESET = fnSrc(FCS, '_fcResetSecondaryCache');
  // The invalidation line gained a receipt check, so the anchor follows it. The FAULT is identical:
  // the changed tables are never dropped, and a Special write leaves stale rows warm.
  var faulted = RESET.replace(
    'tables.forEach(function (t) { if (reconciled.indexOf(t) === -1) delete _fcPrereqLoadedTables_[t]; });', '');
  if (faulted === RESET) throw new Error('M7 anchor drifted');
  var W = resetWorld(faulted);
  W.__warmAll();
  W._fcResetSecondaryCache('events');
  return W._fcPrereqMissing_('event').length === 0;      // a stale row_version would survive the save
})());

mutant('M8 the scope ignored during reconciliation', (function () {
  var RESET = fnSrc(FCS, '_fcResetSecondaryCache');
  var faulted = RESET.replace(
    'var tables = (typeof slice === \'string\') ? _fcSliceTables_(slice) : null;',
    'var tables = _fcSliceTables_(\'events\');');
  if (faulted === RESET) throw new Error('M8 anchor drifted');
  var W = resetWorld(faulted);
  W.__warmAll();
  W._fcResetSecondaryCache('rules');                     // a Target Rule save must keep BOTH warm
  return W._fcPrereqMissing_('event').length !== 0;
})());

mutant('M9 a failed prerequisite read marked warm anyway', (function () {
  var LOADER = fnSrc(FCS, '_fcLoadPrerequisites_');
  // the success handler's marking moved into the function body, i.e. before the read settles
  var faulted = LOADER.replace('need.forEach(function (t) { _fcPrereqLoadedTables_[t] = true; });', '');
  if (faulted === LOADER) throw new Error('M9 anchor drifted');
  return faulted.indexOf('_fcPrereqLoadedTables_[t] = true') === -1;
})());

mutant('M10 the Special open no longer waits for its Base FC source', (function () {
  var faulted = PROCEED.replace(' && !_fcBaseFcSourceMissing_(selectedMode)', '');
  if (faulted === PROCEED) throw new Error('M10 anchor drifted');
  return !/_fcBaseFcSourceMissing_\(selectedMode\)\) \{/.test(faulted);
})());

mutant('M11 an unknown write scope keeps the builders warm', (function () {
  var RESET = fnSrc(FCS, '_fcResetSecondaryCache');
  var faulted = RESET.replace(
    'if (!tables) { _fcPrereqLoadedPaths_ = {}; _fcPrereqLoadedTables_ = {}; return; }',
    'if (!tables) { return; }');
  if (faulted === RESET) throw new Error('M11 anchor drifted');
  var W = resetWorld(faulted);
  W.__warmAll();
  W._fcResetSecondaryCache('somethingNobodyDeclared');
  return W._fcPrereqMissing_('event').length === 0;
})());

// =========================================================================================================
section('G. VACUITY — the unfaulted tree really does behave as the mutants assume');
// =========================================================================================================
(function () {
  var W = baseWorld();
  ok(W._evtEventBaseFcForSku('CO1100-R') === 4200 && W._evtEventBaseFcForSku('CO1100-B') === 0,
    'G1  the real reader really does resolve both a value and a zero, so M3/M4 can fail');
  var R = resetWorld();
  R.__warmAll();
  ok(R._fcPrereqMissing_('event').length === 0, 'G2  a warm path really is warm, so M6/M7/M11 can fail');
  R._fcResetSecondaryCache('events');
  ok(R._fcPrereqMissing_('event').length === 3, 'G2a and a Special save really does drop exactly three');
  var w = tgtWorld();
  w.sb._fcSetTargetSaveEnabled_(false);
  ok(w.btn.textContent === 'Save', 'G3  the real renderer really does stay idle when merely invalid, so M1 can fail');
})();

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail
  + ' failed, ' + mutants.length + ' mutants, ' + survived.length + ' survived');
console.log(new Array(101).join('='));
process.exit((fail === 0 && survived.length === 0) ? 0 : 1);
