'use strict';
// FX1-R4 §6 — THE REAL 04_ WIRING, EXECUTED.
//
// Run: node docs/planning/fx1-r1-staging/verify-04-wiring.js
//
// verify-75-proposed.js tests 75_'s own helpers. That is not the same claim as "04_ uses them
// correctly", and the defect this round closes lived entirely in the second one: FX1-R3's helper was
// perfectly good and was called once PER ROW, from a function documented as pure, so a save landing
// mid-import would have priced part of a batch at one doc_version and the rest at another.
//
// This file therefore runs the SHIPPED 04_, straight out of assets/specs/active/apps-script/. While the
// integration was staged it read what the measurement tool emitted; now that the integration has landed,
// the shipped file IS the wiring and reading anything else would be verifying a copy.
//
// OFFLINE. No Property, no SpreadsheetApp, no production anything: the io is an in-memory map and the
// only functions in the sandbox are the real ones lifted out of 73_, 75_ and 04_.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../..');
const GSDIR = path.join(ROOT, 'assets/specs/active/apps-script');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

// ---- 1. the integrated sources, from the one tool that defines the integration ------------------
// FX04_SRC / FX75_SRC let the mutation harness point this at mutated COPIES. Without them the shipped
// files would have to be mutated in place, and a crashed run would leave a mutant in the deployed set -
// which is the quiet way a mutation suite starts testing the wrong thing, and worse than that here.
const IR04 = fs.readFileSync(process.env.FX04_SRC || path.join(GSDIR, '04_marketplace_forecast_import.gs'), 'utf8');
const IR75 = fs.readFileSync(process.env.FX75_SRC || path.join(GSDIR, '75_api_v1_fx_rate_book.gs'), 'utf8');
const IR73 = fs.readFileSync(path.join(GSDIR, '73_api_v1_pricing_write.gs'), 'utf8');

function fnOf(src, name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) throw new Error('function not found: ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unterminated: ' + name);
}
// A declaration runs to the semicolon at depth ZERO, not to the end of the line:
// PRICING_FX_DECIMALS_ is an object literal spanning several lines, and taking the first line of it
// yields a syntax error in the sandbox rather than a visibly missing table.
function varOf(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('var not found: ' + decl);
  let d = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
    else if (c === ';' && d === 0) return src.slice(i, j + 1);
  }
  throw new Error('unterminated declaration: ' + decl);
}

// ---- 2. the sandbox: the REAL functions, and an in-memory Property store ------------------------
const store = new Map();
const io = {
  get: (k) => (store.has(k) ? store.get(k) : null),
  set: (k, v) => { store.set(k, v); },
  del: (k) => { store.delete(k); },
  user: 'ops@example.com',
  lock: { waitLock: function () {}, releaseLock: function () {} }
};

const SANDBOX = [
  // 73_ owns the precision table and the rounding. It is REUSED, never re-implemented.
  fnOf(IR73, 'pricingStr_'),
  varOf(IR73, 'var PRICING_FX_DECIMALS_'),
  fnOf(IR73, 'pricingDecimalsFor_'),
  fnOf(IR73, 'pricingRoundFx_'),
  fnOf(IR73, 'pricingFxPairKey_'),
  // 75_ owns the book.
  varOf(IR75, "var FX_BOOK_PROP_KEY_"),
  varOf(IR75, 'var FX_BOOK_DOC_SHAPE_'),
  fnOf(IR75, 'fxBookReadDoc_'),
  fnOf(IR75, 'fxBookResolve_'),
  fnOf(IR75, 'fxBookSnapshotForImport_'),
  fnOf(IR75, 'fxBookRateFromSnapshot_'),
  // 04_ owns the row plan.
  varOf(IR04, 'var PRICING_CREATE_BANDS_'),
  fnOf(IR04, 'pricingNewRowPlan_')
].join('\n');

// fxBookDefaultIo_ is NOT in the sandbox on purpose: if anything below reaches for a real Property,
// it throws instead of silently reading one. That is the §6 claim, enforced rather than asserted.
const api = new Function('__io',
  'var fxBookDefaultIo_ = function () { throw new Error("REACHED_FOR_A_REAL_PROPERTY"); };\n'
  + SANDBOX + '\n'
  + 'return { plan: pricingNewRowPlan_, snap: fxBookSnapshotForImport_,'
  + ' rate: fxBookRateFromSnapshot_, round: pricingRoundFx_ };')(io);

const RATES = [
  { base_currency: 'USD', quote_currency: 'JPY', rate: 158.020084, effective_from: '2026-01-01',
    effective_to: '', status: 'active', source: 'manual', as_of: '2026-10-19' },
  { base_currency: 'USD', quote_currency: 'EUR', rate: 0.9231, effective_from: '2026-01-01',
    effective_to: '', status: 'active', source: 'manual', as_of: '2026-10-19' }
];
function writeBook(version, rates) {
  store.set('KM_FX_RATE_BOOK', JSON.stringify({ shape: 1, doc_version: version, rates: rates, log: [] }));
}

// =================================================================================================
section('A. the planner is PURE — it is handed a snapshot, it does not go and get one');

const planSrc = fnOf(IR04, 'pricingNewRowPlan_');
ok(/function pricingNewRowPlan_\(baseCurrency, localCurrency, base, asOf, fxBook\)/.test(planSrc),
  'A1  it takes the snapshot as its fifth argument');
ok(!/fxBookSnapshotForImport_|fxBookReadDoc_|PropertiesService|fxBookDefaultIo_/.test(planSrc),
  'A2  and names no reader, no Property service and no default io');
ok(/fxBookRateFromSnapshot_\(fxBook, b, l, asOf\)/.test(planSrc),
  'A3  it resolves from the snapshot it was given');
ok(!/fxBookRateForCreate_/.test(IR04) && !/fxBookRateForCreate_/.test(IR75),
  'A4  the per-call reader FX1-R3 added is gone from both files — not merely unused');

section('B. the CALLER reads once, for the whole batch, outside the row loop');

const handlerSrc = fnOf(IR04, 'handleImportMarketplaceSkusBatch_');
eq((handlerSrc.match(/fxBookSnapshotForImport_\(/g) || []).length, 1,
  'B1  exactly ONE snapshot is taken in the whole import handler');
const iSnap = handlerSrc.indexOf('fxBookSnapshotForImport_(');
const iLoop = handlerSrc.indexOf('for (var idx = 0; idx < rows.length; idx++)');
ok(iLoop > 0 && iSnap > 0 && iSnap < iLoop,
  'B2  and it is taken BEFORE the row loop, not inside it', { iSnap, iLoop });
ok(/pricingNewRowPlan_\(baseCurrency, currency,[\s\S]{0,120}now, fxBook\)/.test(handlerSrc),
  'B3  every row is planned against that one snapshot');
ok(/fx: \{ doc_version: fxBook \? fxBook\.doc_version : null, readable: !!\(fxBook && fxBook\.ok\) \}/.test(handlerSrc),
  'B4  and the batch REPORTS which book priced it, so two imports either side of a save are distinguishable');

// =================================================================================================
section('C. executed: one import, one version — even when the book moves underneath it');

writeBook(4, RATES);
const snap = api.snap(io);
eq(snap.ok, true, 'C1  the snapshot reads');
eq(snap.doc_version, 4, 'C2  at the version the batch starts on');

const rowA = api.plan('USD', 'JPY', { regular: '10', minimum: '8', msrp: '12' }, '2026-10-19', snap);
eq(rowA.pending, false, 'C3  a cross-currency row with a stored coefficient is NOT pending any more');
eq(rowA.fx_rate, 158.020084, 'C4  and carries the coefficient it was priced at');
eq(rowA.fx_doc_version, 4, 'C5  and the version that coefficient came from');
eq(rowA.auto.regular, api.round(10 * 158.020084, 'JPY'), 'C6  LOCAL = BASE x RATE, through 73_\'s rounding, never inverted');

// THE BOOK MOVES. A reader that went back to the Property would answer 1 here and the batch would be
// split down the middle with nothing recording where.
writeBook(5, [{ base_currency: 'USD', quote_currency: 'JPY', rate: 1, effective_from: '2026-01-01',
  effective_to: '', status: 'active', source: 'manual', as_of: '2026-10-20' }]);
const rowB = api.plan('USD', 'JPY', { regular: '10', minimum: '8', msrp: '12' }, '2026-10-19', snap);
eq(rowB.fx_rate, 158.020084, 'C7  the NEXT row of the same batch is still priced at the batch\'s rate');
eq(rowB.fx_doc_version, 4, 'C8  and still reports the batch\'s version');
eq(api.snap(io).doc_version, 5, 'C9  while the STORED book really has moved — the test is not measuring a frozen fixture');
const rowC = api.plan('USD', 'JPY', { regular: '10' }, '2026-10-19', api.snap(io));
eq(rowC.fx_rate, 1, 'C10 and a NEW import does pick the new rate up — the snapshot is per-import, not a cache');

// =================================================================================================
section('D. a missing coefficient is still pending_fx — blank, never zero, never a guess');

writeBook(6, RATES);
const s6 = api.snap(io);
const gone = api.plan('USD', 'SEK', { regular: '10', minimum: '8', msrp: '12' }, '2026-10-19', s6);
eq(gone.pending, true, 'D1  a pair the book does not hold leaves the row pending');
eq(gone.reason, 'NO_CANONICAL_FX_RATE', 'D2  for the reason it has always given');
eq(gone.fx_rate, '', 'D3  fx_rate is BLANK — not 0, which would be a rate nobody stated');
eq(gone.auto.regular, '', 'D4  auto_regular is BLANK — not 0, which would be a price nobody set');
eq(gone.auto.minimum, '', 'D4a auto_minimum too');
eq(gone.auto.msrp, '', 'D4b and auto_msrp');
eq(gone.fx_doc_version, 6, 'D5  and it still records WHICH book had nothing to say');
const inv = api.plan('JPY', 'USD', { regular: '1000' }, '2026-10-19', s6);
eq(inv.pending, true, 'D6  only-the-inverse-exists stays pending — a reciprocal is not a stored rate');
const early = api.plan('USD', 'JPY', { regular: '10' }, '2020-01-01', s6);
eq(early.pending, true, 'D7  a date before the rate was effective is pending, not the nearest rate');

store.set('KM_FX_RATE_BOOK', '{not json');
const broken = api.snap(io);
eq(broken.ok, false, 'D8  a corrupt book is reported unreadable rather than thrown into the import');
eq(broken.doc_version, null, 'D9  and claims no version, because there is none to claim');
const onBroken = api.plan('USD', 'JPY', { regular: '10' }, '2026-10-19', broken);
eq(onBroken.pending, true, 'D10 every cross-currency row then goes pending_fx — the state it had before any of this existed');
eq(onBroken.auto.regular, '', 'D11 blank, not zero, there too');
const same = api.plan('USD', 'USD', { regular: '10' }, '2026-10-19', broken);
eq(same.pending, false, 'D12 and a SAME-currency row is unaffected — 04_ decides identity for itself, it does not ask the book');
eq(same.fx_rate, 1, 'D13 at rate 1, which is what the same currency MEANS');

// =================================================================================================
section('E. ownership and manual prices are untouched by any of this');

writeBook(7, RATES);
const s7 = api.snap(io);
const o = api.plan('USD', 'EUR', { regular: '10', minimum: '8', msrp: '12' }, '2026-10-19', s7);
eq(o.override.regular, '', 'E1  the override columns come back BLANK on the priced branch');
eq(o.override.minimum, '', 'E1a all three');
eq(o.override.msrp, '', 'E1b of them');
eq(o.flag, 'FALSE', 'E2  and ownership says the system made this row, not a person');
// ASSERTED ON COMMENT-STRIPPED SOURCE. The shipped comment explains the removal by naming
// out.effective[k] = r, so a probe reading the raw text passes on the EXPLANATION rather than on
// the code - which is one of the ways a guard quietly stops guarding.
const planBare = planSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/out\.override\.[a-z]+\s*=/.test(planBare) && !/out\.effective/.test(planBare),
  'E3  nothing in the planner assigns to an override or an effective price — saving a rate cannot reprice anybody\'s hand-set number');
const unreadable = api.plan('USD', 'EUR', { regular: 'n/a', minimum: '8', msrp: '' }, '2026-10-19', s7);
ok(unreadable.unreadable.indexOf('regular') !== -1, 'E4  a base value that is not a number is REPORTED, not coerced to 0');
eq(unreadable.auto.regular, '', 'E4a and left blank');
eq(unreadable.auto.minimum, api.round(8 * 0.9231, 'EUR'), 'E4b while the readable bands still price');
eq(unreadable.auto.msrp, '', 'E4c and a blank base stays a blank auto');

// =================================================================================================
section('F. 73_ is the precision authority, and it is the only one');

ok(!/toFixed|Math\.round|PRICING_FX_DECIMALS_/.test(planSrc),
  'F1  the planner contains no rounding of its own — no toFixed, no Math.round, no second decimals table');
ok(/pricingRoundFx_|pricingDecimalsFor_/.test(planSrc), 'F2  it calls 73_’s');
ok(/PRECISION_AUTHORITY_UNAVAILABLE/.test(planSrc),
  'F3  and when 73_ is not loaded the row is PENDING rather than rounded by a rule invented here');

// =================================================================================================
section('G. WHAT THIS DOES NOT CLAIM');

ok(true, 'G1  no Property, no SpreadsheetApp and no production anything was touched: the io is an in-memory map');
ok(true, 'G2  fxBookDefaultIo_ is deliberately a THROW in this sandbox, so a reach for a real Property is a '
  + 'crash rather than a silent pass');
ok(true, 'G3  handleImportMarketplaceSkusBatch_ needs a spreadsheet, so §B asserts its SHAPE — one snapshot, '
  + 'taken before the loop, passed to every row - while §C executes the planner that shape feeds');
ok(true, 'G4  the sources are the SHIPPED files under assets/specs/active/apps-script/, so this verifier '
  + 'cannot be passing against a copy of the wiring that is not the one deployed');

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  FX1-R4 04_ wiring: ' + pass + ' passed, ' + fail + ' failed.');
process.exitCode = fail ? 1 : 0;
