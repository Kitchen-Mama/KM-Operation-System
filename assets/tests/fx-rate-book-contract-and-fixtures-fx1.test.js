// Kitchen Mama Operation System — FX1
// THE FX RATE BOOK CONTRACT, AND THE RULES IT REFUSES TO BREAK.
//
// Run: node assets/tests/fx-rate-book-contract-and-fixtures-fx1.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes, no browser, no production rate.
//
// WHAT IS BEING PREPARED. `pricing.fxReconcile` (73_) converts prices correctly today and refuses almost
// everything that should be refused — but it has nowhere to KEEP a rate. PRICING_DATABASE_MAPPING §10
// recorded "No separate FX DB table for MVP", so every run's rates are re-typed by a person. FX1 builds
// the missing half: a rate BOOK with an effective period, an active status, a version and a change
// record, which hands `pricing.fxReconcile` exactly the `rates: [...]` array it already accepts.
//
// NOTHING HERE CHANGES A WRITE PATH. 73_ stays the one writer of pricing_list, which is the invariant
// that makes its field-level ownership flags trustworthy. The contract under test produces an INPUT.
//
// AND NOTHING HERE IS CONNECTED. There is no routed action, no stored property and no page in the menu.
// FX1 is preparation, and the backend change list it exists to justify is in
// docs/planning/FX_RATE_BOOK_CONTRACT_FX1.md — which records that the change CANNOT LAND at the current
// GS ceiling, with the arithmetic.
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var FX = require('./_fx-rate-book-contract.js');
var FIX = require('./_fx-rate-book-fixtures.js');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }
function codes(r) { return (r.errors || []).map(function (e) { return e.code; }).sort(); }
function base(over) {
  var e = { base_currency: 'USD', quote_currency: 'CAD', rate: 1.35, source: 'example-reference',
    as_of: '2026-10-01', effective_from: '2026-10-01', effective_to: '', status: 'active', version: 1 };
  Object.keys(over || {}).forEach(function (k) { e[k] = over[k]; });
  return e;
}

// ===================================================================================================
section('A. the direction, and the identity');
// ===================================================================================================
ok(FX.validateEntry(base()).ok, 'A1  a complete USD>CAD entry validates');
eq(codes(FX.validateEntry(base({ base_currency: '', quote_currency: '' }))), ['FX_PAIR_INCOMPLETE'],
  'A2  a pair with no direction is refused');
// SAME CURRENCY IS FIXED AT 1 — the rule the round names first.
ok(FX.validateEntry(base({ quote_currency: 'USD', rate: 1 })).ok,
  'A3  USD>USD at exactly 1 is valid — the identity');
eq(codes(FX.validateEntry(base({ quote_currency: 'USD', rate: 1.02 }))), ['FX_IDENTITY_RATE_INVALID'],
  'A4  USD>USD at 1.02 is REFUSED — a 2% drift would silently reprice a whole domestic site');
var id = FX.resolveRate([], 'USD', 'USD', '2026-10-15');
ok(id.ok && id.identity === true && id.rate === 1,
  'A5  and the identity resolves to 1 with NO stored entry — it is what "the same currency" means', id);

// NEVER SILENTLY INVERT — the round names this explicitly, and 73_ froze the direction for it.
var onlyForward = [base({ effective_from: '2026-01-01' })];
var inv = FX.resolveRate(onlyForward, 'CAD', 'USD', '2026-10-15');
ok(!inv.ok, 'A6  a book holding USD>CAD does NOT answer CAD>USD');
eq(inv.reason, 'ONLY_INVERSE_EXISTS', 'A6a and says exactly why, rather than NOT_FOUND');
ok(/reciprocal/.test(inv.detail) && /plausible/.test(inv.detail),
  'A6b naming the hazard: a reciprocal produces a plausible wrong price, not an obvious one', inv.detail);
ok(FX.resolveRate(onlyForward, 'USD', 'CAD', '2026-10-15').rate === 1.35,
  'A7  while the direction it DOES hold answers normally — A6 is not a dead book');

// ===================================================================================================
section('B. a rate is a positive number, with a source and a date');
// ===================================================================================================
eq(codes(FX.validateEntry(base({ rate: 0 }))), ['FX_RATE_NOT_POSITIVE'],
  'B1  zero is refused — it would convert every price to nothing');
eq(codes(FX.validateEntry(base({ rate: -1.35 }))), ['FX_RATE_NOT_POSITIVE'], 'B2  and a negative is not a rate');
eq(codes(FX.validateEntry(base({ rate: 'abc' }))), ['FX_RATE_NOT_NUMERIC'], 'B3  nor is a word');
eq(codes(FX.validateEntry(base({ rate: '' }))), ['FX_RATE_NOT_NUMERIC'], 'B4  nor a blank');
eq(codes(FX.validateEntry(base({ source: '' }))), ['FX_SOURCE_REQUIRED'],
  'B5  a rate with no named source cannot be audited or reproduced');
eq(codes(FX.validateEntry(base({ as_of: '' }))), ['FX_AS_OF_REQUIRED'],
  'B6  and one with no as-of date cannot be told from a stale one');
eq(codes(FX.validateEntry(base({ as_of: '01/10/2026' }))), ['FX_AS_OF_REQUIRED'],
  'B6a which means YYYY-MM-DD, not whichever format the operator types');

// A CURRENCY THE CONVERTER CANNOT WRITE. 73_ fails a row closed as UNSUPPORTED_CURRENCY when its frozen
// precision contract does not know the currency, so maintaining such a rate would be maintaining
// something that can never be applied.
eq(codes(FX.validateEntry(base({ quote_currency: 'CHF' }))), ['FX_CURRENCY_UNSUPPORTED'],
  'B7  a currency outside the frozen precision contract is refused at ENTRY, not at conversion');
var G73 = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/73_api_v1_pricing_write.gs'), 'utf8');
FX.SUPPORTED_CURRENCIES.forEach(function (c) {
  ok(new RegExp('\\b' + c + ': \\d').test(G73),
    'B8 ' + c + ' is in 73_\'s PRICING_FX_DECIMALS_ — the lists agree by check, not by memory');
});
ok(!/\bCHF: \d/.test(G73), 'B8a and CHF genuinely is not, so B7 is not vacuous');

// ===================================================================================================
section('C. effective period and active status');
// ===================================================================================================
eq(codes(FX.validateEntry(base({ effective_from: '' }))), ['FX_EFFECTIVE_FROM_REQUIRED'],
  'C1  a rate with no start cannot be scheduled or superseded');
ok(FX.validateEntry(base({ effective_to: '' })).ok,
  'C2  an EMPTY effective_to is valid — open-ended is a state, not a missing field');
eq(codes(FX.validateEntry(base({ effective_to: 'soon' }))), ['FX_EFFECTIVE_TO_INVALID'],
  'C3  but a non-date one is refused');
eq(codes(FX.validateEntry(base({ effective_from: '2026-10-10', effective_to: '2026-10-01' }))),
  ['FX_EFFECTIVE_RANGE_INVERTED'], 'C4  and a period that ends before it starts');
eq(codes(FX.validateEntry(base({ status: '' }))), ['FX_STATUS_INVALID'],
  'C5  a BLANK status is not "active" — the page must say which, the same rule PRICING-R2 §10 applies to flags');
eq(codes(FX.validateEntry(base({ status: 'enabled' }))), ['FX_STATUS_INVALID'], 'C6  and neither is a synonym');

// RESOLUTION BY DATE, over the illustrative book: October and November hold different CAD rates.
var B = FIX.EXAMPLE_BOOK;
eq(FX.resolveRate(B, 'USD', 'CAD', '2026-10-15').rate, 1.35, 'C7  mid-October resolves the October rate');
eq(FX.resolveRate(B, 'USD', 'CAD', '2026-11-15').rate, 1.40, 'C8  mid-November resolves its successor');
eq(FX.resolveRate(B, 'USD', 'CAD', '2026-10-31').rate, 1.35, 'C9  the last day of a period is INSIDE it');
eq(FX.resolveRate(B, 'USD', 'CAD', '2026-11-01').rate, 1.40, 'C10 and the first day of the next is inside that');
eq(FX.resolveRate(B, 'USD', 'CAD', '2026-09-30').ok, false, 'C11 a day before any period has no rate');
eq(FX.resolveRate(B, 'USD', 'CAD', '2026-09-30').reason, 'NOT_FOUND', 'C11a and says so by name');
// INACTIVE IS NOT AVAILABLE, and that is the whole point of the status.
eq(FX.resolveRate(B, 'USD', 'GBP', '2026-10-15').ok, false,
  'C12 an INACTIVE rate is never resolved, even inside its period');
ok(B.some(function (e) { return e.quote_currency === 'GBP' && e.status === 'inactive'; }),
  'C12a and the row really is in the book — it is retired, not deleted, so the audit trail survives');

// TWO ACTIVE RATES COVERING ONE DAY IS A BROKEN BOOK, not a precedence puzzle.
var overlapping = [base({ effective_from: '2026-10-01', effective_to: '2026-10-31' }),
                   base({ rate: 1.36, effective_from: '2026-10-15', effective_to: '2026-11-15' })];
var vb = FX.validateBook(overlapping);
ok(!vb.ok && codes(vb).indexOf('FX_EFFECTIVE_PERIOD_OVERLAP') !== -1,
  'C13 the BOOK refuses two ACTIVE rates for one pair over the same day', codes(vb));
eq(FX.resolveRate(overlapping, 'USD', 'CAD', '2026-10-20').reason, 'AMBIGUOUS',
  'C14 and resolution refuses too, rather than taking the first row — position is not precedence');
ok(FX.validateBook(B).ok, 'C15 while the illustrative book itself is valid, so C13 is not vacuous');

// ===================================================================================================
section('D. version conflict and the change record');
// ===================================================================================================
var at = '2026-11-02T10:00:00Z';
var stale = FX.applyEdit(B, { base_currency: 'USD', quote_currency: 'CAD', effective_from: '2026-10-01',
  base_version: 2, rate: 1.37 }, 'ops', at);
ok(!stale.ok, 'D1  a save holding version 2 against a stored version 3 is REFUSED');
eq(stale.code, 'FX_VERSION_CONFLICT', 'D1a by name');
eq(stale.stored_version, 3, 'D1b and the refusal says what is actually stored');
ok(/Nothing was changed/.test(stale.detail), 'D1c and that nothing was changed', stale.detail);
eq(FX.resolveRate(B, 'USD', 'CAD', '2026-10-15').rate, 1.35,
  'D1d which is true: the book is untouched after the refusal');

var fresh = FX.applyEdit(B, { base_currency: 'USD', quote_currency: 'CAD', effective_from: '2026-10-01',
  base_version: 3, rate: 1.37, note: 'corrected' }, 'ops', at);
ok(fresh.ok, 'D2  a save holding the CURRENT version is accepted');
eq(FX.resolveRate(fresh.book, 'USD', 'CAD', '2026-10-15').rate, 1.37, 'D2a and the new rate resolves');
eq(fresh.change.to_version, 4, 'D2b the version advances');
eq(fresh.change.from_version, 3, 'D2c and the record keeps the one it came from');
eq(fresh.change.change_type, 'UPDATE', 'D3  the change is typed');
eq(fresh.change.fields, [{ field: 'rate', from: '1.35', to: '1.37' }],
  'D3a and records the field that moved WITH ITS OLD VALUE — a log that keeps only the new one cannot '
  + 'answer the question it is kept for');
eq(fresh.change.changed_by, 'ops', 'D3b who');
eq(fresh.change.changed_at, at, 'D3c and when, from the caller — never from a clock this code reads');

// A NEW PERIOD for an existing pair is a create, not an update.
var created = FX.applyEdit(B, { base_currency: 'USD', quote_currency: 'EUR', effective_from: '2026-12-01',
  rate: 0.92, source: 'example-reference', as_of: '2026-12-01', status: 'active' }, 'ops', at);
ok(created.ok, 'D4  a new effective period for an existing pair is accepted');
eq(created.change.change_type, 'CREATE', 'D4a as a CREATE');
eq(created.change.to_version, 1, 'D4b starting at version 1');
var ghost = FX.applyEdit(B, { base_currency: 'USD', quote_currency: 'AUD', effective_from: '2026-12-01',
  base_version: 7, rate: 1.5, source: 's', as_of: '2026-12-01', status: 'active' }, 'ops', at);
ok(!ghost.ok && ghost.code === 'FX_VERSION_CONFLICT',
  'D5  a save claiming a version for a row that does not exist is a conflict, not a create');
// An edit may not smuggle an invalid value past validation.
var bad = FX.applyEdit(B, { base_currency: 'USD', quote_currency: 'CAD', effective_from: '2026-10-01',
  base_version: 3, rate: 0 }, 'ops', at);
ok(!bad.ok && bad.code === 'FX_ENTRY_INVALID', 'D6  and an accepted version still cannot write a zero rate');

// ===================================================================================================
section('E. the handoff to pricing.fxReconcile');
// ===================================================================================================
var required = [
  { base_currency: 'USD', quote_currency: 'CAD' },
  { base_currency: 'USD', quote_currency: 'EUR' },
  { base_currency: 'USD', quote_currency: 'USD' }
];
var h = FX.buildReconcileRates(B, required, '2026-10-15');
ok(h.complete, 'E1  a book that covers every required pair produces a complete run', h.missing);
eq(h.rates.length, 2, 'E1a with one entry per NON-identity pair');
eq(Object.keys(h.rates[0]).sort(), ['as_of', 'base_currency', 'quote_currency', 'rate', 'source'],
  'E2  in exactly the shape 73_ already accepts — adopting this changes no write path');
ok(h.rates.every(function (r) { return r.source && r.as_of; }),
  'E2a and every entry carries the source and as-of forward, so the reconciliation records them per row');

var short = FX.buildReconcileRates(B, required.concat([{ base_currency: 'USD', quote_currency: 'GBP' }]), '2026-10-15');
ok(!short.complete, 'E3  a book with a hole produces an INCOMPLETE run');
eq(short.missing.length, 1, 'E3a naming the pair it cannot answer');
eq(short.missing[0].pair, 'USD>GBP', 'E3b by pair');
eq(short.rates.length, 2, 'E3c and the pairs it CAN answer are still assembled — a hole is not a total refusal');
// The operator has to see the hole BEFORE the run, because 73_ will skip exactly those rows.
ok(/MISSING_FX_RATE/.test(G73),
  'E4  73_ skips an unpriced pair as MISSING_FX_RATE, which is why E3 must be visible before the run, not after');
ok(/dry_run/.test(G73) && /DRY RUN IS THE DEFAULT/.test(G73),
  'E5  and a dry run is 73_\'s default, so the preview this depends on already exists');

// ===================================================================================================
section('F. the required pairs, and the initial data');
// ===================================================================================================
eq(FIX.EXPECTED_PAIRS.length, 5, 'F1  five non-identity pairs are expected from the ten-site universe');
eq(FIX.EXPECTED_PAIRS.map(function (p) { return p.quote_currency; }).sort(),
  ['AUD', 'CAD', 'EUR', 'GBP', 'JPY'], 'F1a AUD, CAD, EUR, GBP, JPY — one per non-US country');
ok(FIX.EXPECTED_PAIRS.every(function (p) { return FX.SUPPORTED_CURRENCIES.indexOf(p.quote_currency) !== -1; }),
  'F2  EVERY expected pair is already inside the frozen precision contract — no currency gap blocks FX1');
eq(FIX.EXPECTED_PAIRS.filter(function (p) { return p.quote_currency === 'JPY'; })[0].decimals, 0,
  'F3  and JPY is carried as a ZERO-decimal currency, which is where a converted price goes wrong quietly');
ok(FIX.IDENTITY_SITES.length >= 4, 'F4  the US sites are identities and need no stored rate', FIX.IDENTITY_SITES.length);

// THE TEMPLATE MUST NOT BE SHIPPABLE. It carries structure and the source field; it carries no number.
var tv = FX.validateBook(FIX.INITIAL_BOOK_TEMPLATE);
ok(!tv.ok, 'F5  the initial book TEMPLATE fails validation — by design, it is not a set of rates');
var tcodes = {};
tv.errors.forEach(function (e) { tcodes[e.code] = 1; });
eq(Object.keys(tcodes).sort(), ['FX_AS_OF_REQUIRED', 'FX_EFFECTIVE_FROM_REQUIRED', 'FX_RATE_NOT_NUMERIC'],
  'F5a and fails for exactly the three fields a PERSON has to supply: the rate, the date it was read, and when it starts');
eq(FIX.INITIAL_BOOK_TEMPLATE.length, 5, 'F6  with one template row per required pair');
ok(FIX.INITIAL_BOOK_TEMPLATE.every(function (r) { return r.source === 'TBD-OFFICIAL-SOURCE'; }),
  'F7  the SOURCE is a marked placeholder, not a guess — which provider is a commercial decision');
ok(!/\b1\.3[0-9]\b|\b0\.9[0-9]\b/.test(JSON.stringify(FIX.INITIAL_BOOK_TEMPLATE)),
  'F8  and no plausible-looking number appears anywhere in it, so it cannot be mistaken for a quotation');

// ===================================================================================================
section('G. what FX1 does NOT do — asserted, so the boundary is checkable');
// ===================================================================================================
function codeOnly(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
var CONTRACT = fs.readFileSync(path.join(__dirname, '_fx-rate-book-contract.js'), 'utf8');
var CODE = codeOnly(CONTRACT);
ok(!/SpreadsheetApp|getActiveSpreadsheet|appendRow|setValues/.test(CODE),
  'G1  the contract touches no spreadsheet — it cannot write a price or a table');
ok(!/Date\.now|new Date\(\)/.test(CODE),
  'G2  and reads no clock: every date decision takes `now` as a parameter, so it is reproducible');
ok(!/fetch|UrlFetchApp|XMLHttpRequest/.test(CODE),
  'G3  and fetches no rate from anywhere — there is no FX provider in this repository');
ok(/\/\/ .*PRICING_DATABASE_MAPPING .10/.test(CONTRACT) || /No separate FX DB table/.test(CONTRACT),
  'G3a while the PROSE names the mapping decision this round is answering, so G1-G3 are a boundary and not an absence');
var pagesDir = path.join(ROOT, 'assets/js/pages');
ok(fs.existsSync(path.join(pagesDir, 'fx-rate-book.js')), 'G4  the Administration page exists');
var IDX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// FX1-R4 (R55) — THE PAGE IS ROUTED NOW, and this assertion flips rather than being deleted. FX1 made it
// because the page named two actions that did not exist, so routing it would have shipped a surface that
// could only fail; R55 is the release that adds them. A routed page needs all four of these - a stylesheet
// the operator can see, a mount point to be injected into, a script tag to load the controller, and a menu
// entry to reach it - and three of four is a page that exists and cannot be opened.
ok(/assets\/css\/pages\/fx-rate-book\.css/.test(IDX), 'G5  the stylesheet is linked');
ok(/id="fx-rate-book-mount"/.test(IDX), 'G5a a mount point exists for the partial');
ok(/assets\/js\/pages\/fx-rate-book\.js/.test(IDX), 'G5b the controller is loaded');
ok(/showSection\('fx-rate-book'\)/.test(IDX), 'G5c and there is a menu entry that reaches it');
var APPJS = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
// BOTH maps. One decides what MOUNTS and the other what is VISIBLE; a section in only one of them either
// mounts into a hidden shell or is revealed with nothing in it.
eq((APPJS.match(/'fx-rate-book': 'fx-rate-book-section',/g) || []).length, 2,
  'G5d and app.js carries it in BOTH section maps');
var PAGEJS = fs.readFileSync(path.join(pagesDir, 'fx-rate-book.js'), 'utf8');
ok(/KM\.lifecycle\.register\('fx-rate-book-section'/.test(PAGEJS), 'G5e the controller registers a lifecycle');
// AND IT NAMES THE ACTIONS THE ROUTER ACTUALLY SERVES. The prototype named fx.rateBook.get / .save; the
// router serves fxRateBook.get / .save, so it could never have worked - which is the failure a page
// prepared ahead of its backend is most likely to carry and least likely to be caught carrying.
ok(/getFxRateBook|saveFxRateBook/.test(PAGEJS) && !/fx\.rateBook\./.test(PAGEJS),
  'G5f through the transport adapters, not through action names nothing serves');
var RTR = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/01_router.gs'), 'utf8');
ok(/'fxRateBook\.get'/.test(RTR) && /'fxRateBook\.save'/.test(RTR),
  'G5g and the router really serves both of them');
var DOC = path.join(ROOT, 'docs/planning/FX_RATE_BOOK_CONTRACT_FX1.md');
ok(fs.existsSync(DOC), 'G6  the backend/DB change list and the GS arithmetic are written down');
var D = fs.readFileSync(DOC, 'utf8');
ok(/4,630,000/.test(D) && /headroom/i.test(D),
  'G7  and the change list is costed against the ceiling rather than proposed without a number');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exitCode = 1;
