// Kitchen Mama Operation System — S8-B3-R3-FCB1
// THE REGULAR FORECAST BUILDER'S BASE PERIOD IS DERIVED FROM THE TARGET, OR IT IS A SECOND OPINION.
//
// "Adjust From Previous Month Forecast" means one thing: the month before the Target. The builder
// rendered that as two EDITABLE fields seeded with a default, so the sentence the method describes and
// the value it actually uses were allowed to disagree, and nothing anywhere noticed. Three defects,
// all of them the same defect at different distances from the user:
//
//   DERIVATION   Based Year / Based Month were a `<input type=number>` and a `<select>`. They were
//                seeded from Target and then left open, so "previous month" was a suggestion.
//
//   STALENESS    `regular-target-year` carried NO change handler at all, and `regular-target-month`
//                carried one that re-seeded the base fields and did NOT clear the preview. So an
//                operator could Preview Jan, switch the Target to Feb, and Save with the button still
//                lit — writing the Jan the preview captured while the form on screen said Feb. The
//                write was self-consistent and the screen was not.
//
//   TRUST        Even with the fields locked, `_regularBuildPreview` read the month back OUT of the
//                DOM. A locked input is a presentation choice; it is not a source of truth, and the
//                one value that must not be guessable is the one the preview is about to write.
//
// §D pins what must NOT move: "Apply Growth Rate" is named `actual` internally and that name has
// never meant actual SALES. Its basis is fc_regular_forecast and the FCB1 historical-sales work must
// not quietly re-point it.
//
// Run: node assets/tests/fc-regular-builder-derived-base-period-s8-b3-r3-fcb1.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into module scope (F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0;
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

var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read('assets/js/pages/fc-summary.js');
var HTML = read('assets/html/pages/fc-summary.html');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var d = 0, started = false, start = i;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
// The builder modal's markup slice, so a selector assertion cannot accidentally match another modal.
var MODAL = (function () {
  var i = HTML.indexOf('id="fc-regular-update-modal"');
  var j = HTML.indexOf('id="fc-add-event-modal"');
  if (i < 0 || j < 0 || j < i) throw new Error('builder modal slice not found');
  return HTML.slice(i, j);
})();

// ---------------------------------------------------------------------------------------------------
section('A  the base period is DERIVED, and the fields that show it are not editable');
// ---------------------------------------------------------------------------------------------------
// The derivation is a pure function or it is not an authority. Driving it through the DOM would test
// the seeding, which is the thing that was never the problem.
ok(FCS.indexOf('function _regularDerivedBasePeriod_(') !== -1,
  'A1  a single named owner derives the base period from the Target');
eval(fnSrc(FCS, '_regularDerivedBasePeriod_'));

eq(_regularDerivedBasePeriod_(2026, 5), { year: 2026, month: 4 }, 'A2  June 2026 -> May 2026');
eq(_regularDerivedBasePeriod_(2026, 0), { year: 2025, month: 11 }, 'A3  January rolls back across the year boundary to the previous December');
eq(_regularDerivedBasePeriod_(2026, 11), { year: 2026, month: 10 }, 'A4  December 2026 -> November 2026');

// A non-numeric or absent Target has no previous month. Returning a plausible one would be the same
// class of guess the round removes - it would silently pick a period nobody chose.
eq(_regularDerivedBasePeriod_(NaN, 5), null, 'A5  no Target Year -> no derived period, NOT a guessed one');
eq(_regularDerivedBasePeriod_(2026, NaN), null, 'A6  no Target Month -> no derived period');

// --- the displayed fields are locked -----------------------------------------------------------
var basedYearTag = /<input[^>]*id="regular-based-year"[^>]*>/.exec(MODAL);
var basedMonthTag = /<select[^>]*id="regular-based-month"[^>]*>/.exec(MODAL);
ok(basedYearTag && /\b(readonly|disabled)\b/.test(basedYearTag[0]),
  'A7  Based Year is readonly/disabled - a derived value the operator may edit is not derived',
  basedYearTag && basedYearTag[0]);
ok(basedMonthTag && /\bdisabled\b/.test(basedMonthTag[0]),
  'A8  Based Month is disabled', basedMonthTag && basedMonthTag[0]);

// The Apply Growth Rate base fields are a DIFFERENT contract: the operator chooses that period, and
// locking them would be this round over-applying its own rule.
var baseYearTag = /<input[^>]*id="regular-base-year"[^>]*>/.exec(MODAL);
ok(baseYearTag && !/\b(readonly|disabled)\b/.test(baseYearTag[0]),
  'A9  Apply Growth Rate Base Year stays EDITABLE - that period is a choice, not a derivation');

// ---------------------------------------------------------------------------------------------------
section('B  changing the Target invalidates the preview and disables Save');
// ---------------------------------------------------------------------------------------------------
// Save reads the period captured in `_regularPreview`, so a stale preview does not write the wrong
// month - it writes the month the operator can no longer see. That is worse, not better.
ok(FCS.indexOf('function onRegularTargetChange(') !== -1,
  'B1  one handler owns "the Target moved"');

var targetYearTag = /<input[^>]*id="regular-target-year"[^>]*>/.exec(MODAL);
var targetMonthTag = /<select[^>]*id="regular-target-month"[^>]*>/.exec(MODAL);
ok(targetYearTag && /on(input|change)="onRegularTargetChange\(\)"/.test(targetYearTag[0]),
  'B2  Target Year is wired to it - it carried NO handler at all before',
  targetYearTag && targetYearTag[0]);
ok(targetMonthTag && /onchange="onRegularTargetChange\(\)"/.test(targetMonthTag[0]),
  'B3  Target Month is wired to it, not to the re-seeder alone',
  targetMonthTag && targetMonthTag[0]);

var handler = fnSrc(FCS, 'onRegularTargetChange');
ok(/_regularSyncBasedFromTarget\(\)/.test(handler), 'B4  it re-derives the base period');
ok(/_regularClearPreview\(\)/.test(handler), 'B5  AND it drops the preview that is now about another month');
ok(/_setRegularSaveEnabled\(false\)/.test(fnSrc(FCS, '_regularClearPreview')),
  'B6  and dropping the preview is what disables Save');

// --- executed, not just wired ------------------------------------------------------------------
(function () {
  var els = {};
  function el(v) { return { value: v, style: {}, innerHTML: '', textContent: '', disabled: false }; }
  els['regular-target-year'] = el('2026');
  els['regular-target-month'] = el('0');
  els['regular-based-year'] = el('');
  els['regular-based-month'] = el('');
  els['regular-preview'] = el('');
  els['regular-affected-count'] = el('');
  var box = { document: { getElementById: function (id) { return els[id] || null; } },
    console: console, _regularPreview: { rows: [1] }, saveEnabled: true };
  var ctx = vm.createContext(box);
  vm.runInContext('function _setRegularSaveEnabled(on){ saveEnabled = !!on; }', ctx);
  vm.runInContext('function _setRegularManualHelp(){}', ctx);
  vm.runInContext(fnSrc(FCS, '_regularDerivedBasePeriod_'), ctx);
  vm.runInContext(fnSrc(FCS, '_regularSyncBasedFromTarget'), ctx);
  vm.runInContext(fnSrc(FCS, '_regularClearPreview'), ctx);
  vm.runInContext(fnSrc(FCS, 'onRegularTargetChange'), ctx);

  vm.runInContext('onRegularTargetChange()', ctx);
  eq([els['regular-based-year'].value, String(els['regular-based-month'].value)], ['2025', '11'],
    'B7  Target Jan 2026 -> the fields show Dec 2025, derived not typed');
  eq(box._regularPreview, null, 'B8  the stale preview is gone');
  eq(box.saveEnabled, false, 'B9  and Save is disabled');

  els['regular-target-month'].value = '6';
  box._regularPreview = { rows: [1] }; box.saveEnabled = true;
  vm.runInContext('onRegularTargetChange()', ctx);
  eq([els['regular-based-year'].value, String(els['regular-based-month'].value)], ['2026', '5'],
    'B10 moving the Target to Jul 2026 re-derives Jun 2026');
  eq(box.saveEnabled, false, 'B11 and invalidates again - every move, not only the first');
})();

// ---------------------------------------------------------------------------------------------------
section('C  the preview derives the period ITSELF - a locked field is not a source of truth');
// ---------------------------------------------------------------------------------------------------
// This is the assertion that matters. Everything in A and B is presentation: a disabled attribute is
// removed with one devtools click, and a field left over from a previous open still carries its old
// value. The preview is what the Save writes, so the preview must not be able to read a period that
// disagrees with the Target on screen.
(function () {
  var els = {};
  function el(v) { return { value: v, style: {}, innerHTML: '', textContent: '', querySelectorAll: function () { return []; } }; }
  els['regular-target-year'] = el('2026');
  els['regular-target-month'] = el('5');          // Target = Jun 2026, so the base period is May 2026
  els['regular-based-year'] = el('2019');         // TAMPERED - a period nobody chose
  els['regular-based-month'] = el('0');           // TAMPERED - January
  els['regular-update-method'] = el('prevMonth');
  els['regular-growth-rate'] = el('10');
  els['regular-preview'] = el('');
  els['regular-affected-count'] = el('');

  var FC_ROWS = [
    // May 2026 = 100 (the derived base). Jan 2019 = 7777 (the tampered one). They must be tellable apart.
    { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1', year: 2026,
      jan: 0, feb: 0, mar: 0, apr: 0, may: 100, jun: 50, jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0 },
    { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1', year: 2019,
      jan: 7777, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0 }
  ];

  var box = { document: { getElementById: function (id) { return els[id] || null; } }, console: console,
    _regularPreview: null, REG_MONTH_KEYS: ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
    FC_ROWS: FC_ROWS, saveEnabled: false, rendered: 0 };
  var ctx = vm.createContext(box);
  vm.runInContext('function _regularCloseAllMs(){}', ctx);
  vm.runInContext('function _regularRenderPreview(){ rendered++; }', ctx);
  vm.runInContext('function _setRegularSaveEnabled(on){ saveEnabled = !!on; }', ctx);
  vm.runInContext('function _setRegularManualHelp(){}', ctx);
  vm.runInContext('function _regularClearPreview(){ _regularPreview = null; saveEnabled = false; }', ctx);
  vm.runInContext('function _regularMode(){ return "single"; }', ctx);
  vm.runInContext('function _regularSelectedSite(){ return { company: "KM", country: "US", marketplace: "Amazon" }; }', ctx);
  vm.runInContext('function _regularCandidateSkus(){ return [{ sku: "SKU-1", category: "C", series: "S", company: "KM" }]; }', ctx);
  vm.runInContext('function _regularFcRows(){ return FC_ROWS; }', ctx);
  vm.runInContext(fnSrc(FCS, '_regularFindFc'), ctx);
  vm.runInContext(fnSrc(FCS, '_regularExistingMonths'), ctx);
  vm.runInContext(fnSrc(FCS, '_regularDerivedBasePeriod_'), ctx);
  vm.runInContext(fnSrc(FCS, '_regularBuildPreview'), ctx);

  vm.runInContext('_regularBuildPreview()', ctx);
  var P = box._regularPreview;
  ok(P && P.rows && P.rows.length === 1, 'C1  the preview built');
  // May 2026 = 100, +10% = 110. The tampered Jan 2019 = 7777 would give 8555.
  eq(P && P.rows[0].newQty, 110,
    'C2  the New value comes from the DERIVED May 2026, not the tampered Based fields');
  ok(!(P && P.rows[0].newQty === 8555),
    'C3  specifically: the 2019 row the DOM pointed at did not reach the arithmetic');
  eq([P && P.targetYear, P && P.targetMonth], [2026, 5], 'C4  and the preview records the Target it was built for');

  // The preview must also record WHICH period it used, or the operator is asked to check a number
  // against a period that is only implied.
  eq([P && P.baseYear, P && P.baseMonth], [2026, 4],
    'C5  the period used is recorded on the preview, so Save and the operator see the same one');

  // A Target with no month cannot derive a base period, and must refuse rather than fall back.
  box._regularPreview = null;
  els['regular-target-month'].value = '';
  vm.runInContext('_regularBuildPreview()', ctx);
  eq(box._regularPreview, null, 'C6  an unusable Target builds NO preview - it does not reach for the fields');
})();

// ---------------------------------------------------------------------------------------------------
section('D  what this round must NOT move');
// ---------------------------------------------------------------------------------------------------
// `actual` is the internal value behind the label "Apply Growth Rate". It has never meant actual
// SALES: its basis is the existing fc_regular_forecast row for the chosen Base Year + Base Month.
// FCB1 is adding historical-sales reading to this page, which is exactly when a name like `actual`
// becomes an invitation.
var preview = fnSrc(FCS, '_regularBuildPreview');
ok(/_regularFcRows\(\)/.test(preview), 'D1  the builder preview reads the Regular Forecast rows');
ok(!/DailySales|WeeklySales|amazon_daily|amazon_weekly/i.test(preview),
  'D2  and NO sales snapshot reaches the Apply Growth Rate / prevMonth arithmetic');
ok(/method === 'actual'/.test(preview) && /regular-base-year/.test(preview),
  'D3  `actual` still takes its period from the operator-chosen Base Year/Month');
var fcRows = fnSrc(FCS, '_regularFcRows');
ok(/_fcGetRegularForecast\(\)/.test(fcRows) && !/Sales/i.test(fcRows),
  'D4  and _regularFcRows is still the fc_regular_forecast owner alone');

// The single-month write contract is untouched: only the Target month changes.
var save = fnSrc(FCS, 'saveRegularUpdate');
ok(/row\[monthKey\] = newQty/.test(save), 'D5  Save still replaces exactly one month');
ok(/P\.targetYear/.test(save) && /P\.targetMonth/.test(save),
  'D6  and still writes the period captured in the preview, which B is what makes safe');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail === 0 ? 0 : 1;
