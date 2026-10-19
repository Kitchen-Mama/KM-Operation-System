// FX1-R1 — proof that the STAGED 75_ proposal actually runs, against the REAL 73_ helpers it claims to
// reuse, and that the DRAFT initialisation data passes the real validator.
//
// Deliberately NOT under assets/tests/: this proposal is not approved, so it must not join the 686-suite
// registry nor force a full regression. Run it directly:
//     node docs/planning/fx1-r1-staging/verify-75-proposed.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const SRC73 = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/73_api_v1_pricing_write.gs'), 'utf8');
const PROPOSED = fs.readFileSync(path.join(__dirname, '75_api_v1_fx_rate_book.gs.proposed'), 'utf8');
const DRAFT = JSON.parse(fs.readFileSync(path.join(__dirname, 'fx-rate-book-initial-draft.json'), 'utf8'));

// ---- pull the named declarations out of 73_ with a balanced-brace scan -------------------------------
function extract(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('not found in 73_: ' + header);
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1) + (header.startsWith('var') ? ';' : ''); }
  }
  throw new Error('unbalanced: ' + header);
}

const REUSED = [
  'var PRICING_FX_DECIMALS_ = {',
  'function pricingStr_(',
  'function pricingReadNumber_(',
  'function pricingDecimalsFor_(',
  'function pricingFxPairKey_(',
  'function pricingBuildRateTable_('
].map(h => extract(SRC73, h)).join('\n\n');

// ---- Apps Script stubs --------------------------------------------------------------------------------
let LOCK_GRANTED = true;
const STUBS = `
var __props = {};
var PropertiesService = { getScriptProperties: function () { return {
  getProperty: function (k) { return Object.prototype.hasOwnProperty.call(__props, k) ? __props[k] : null; },
  setProperty: function (k, v) { __props[k] = String(v); }
}; } };
var __lockGranted = true, __lockReleased = 0;
var LockService = { getScriptLock: function () { return {
  tryLock: function () { return __lockGranted; },
  releaseLock: function () { __lockReleased++; }
}; } };
`;

const api = new Function(STUBS + '\n' + REUSED + '\n' + PROPOSED + '\n' + `
return {
  handleFxRateBookGet_: handleFxRateBookGet_, handleFxRateBookSave_: handleFxRateBookSave_,
  fxBookResolve_: fxBookResolve_, fxBookValidate_: fxBookValidate_,
  fxBookRatesForReconcile_: fxBookRatesForReconcile_, fxBookChangeRecords_: fxBookChangeRecords_,
  fxBookReadDoc_: fxBookReadDoc_,
  setLock: function (v) { __lockGranted = v; }, releases: function () { return __lockReleased; },
  props: function () { return __props; }, reset: function () { __props = {}; }
};`)();

// ---- tiny assert --------------------------------------------------------------------------------------
let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log('  FAIL  ' + label); } }
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function codes(r) { return (r.errors || []).map(e => e.code); }

function mem() {
  let store = {};
  return { get: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
           set: (k, v) => { store[k] = String(v); }, raw: () => store };
}

const ACTIVE = DRAFT.rates;

// ---- 1. the DRAFT data is COMPLETE and VALID (this is what separates it from FX1's template) ----------
{
  const v = api.fxBookValidate_(ACTIVE);
  ok(v.ok, 'DRAFT initialisation data passes the real validator: ' + JSON.stringify(codes(v)));
  eq(ACTIVE.length, 5, 'DRAFT covers five pairs');
  ok(ACTIVE.every(r => Number(r.rate) > 0), 'every DRAFT rate is positive');
  ok(ACTIVE.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.as_of)), 'every DRAFT row carries an as_of date');
  ok(ACTIVE.every(r => /ECB/.test(r.source) && /derived/.test(r.source)), 'every DRAFT row names its source AND says it is derived');
  ok(ACTIVE.every(r => r.status === 'active' && r.version === 1), 'every DRAFT row is explicitly active with a version');
}

// ---- 2. derivation arithmetic is reproducible from the recorded legs ----------------------------------
{
  const legs = DRAFT._source.legs_as_published, eurusd = legs['EUR>USD'];
  const want = { AUD: legs['EUR>AUD'] / eurusd, CAD: legs['EUR>CAD'] / eurusd,
                 EUR: 1 / eurusd, GBP: legs['EUR>GBP'] / eurusd, JPY: legs['EUR>JPY'] / eurusd };
  ACTIVE.forEach(r => {
    const got = Number(r.rate), exp = Number(want[r.quote_currency].toFixed(6));
    ok(Math.abs(got - exp) < 1e-9, 'USD>' + r.quote_currency + ' reproduces from the published legs (got ' + got + ', recompute ' + exp + ')');
  });
}

// ---- 3. identity, and never inverting ------------------------------------------------------------------
{
  const r = api.fxBookResolve_(ACTIVE, 'USD', 'USD', '2026-10-20');
  ok(r.ok && r.rate === 1 && r.identity, 'same currency resolves to exactly 1 with no stored entry');
  const inv = api.fxBookResolve_(ACTIVE, 'CAD', 'USD', '2026-10-20');
  ok(!inv.ok && inv.code === 'FX_ONLY_INVERSE_EXISTS', 'CAD>USD is refused as ONLY_INVERSE_EXISTS, never reciprocated');
  const miss = api.fxBookResolve_(ACTIVE, 'USD', 'KRW', '2026-10-20');
  ok(!miss.ok && miss.code === 'FX_RATE_NOT_FOUND', 'an uncovered pair is NOT_FOUND, not zero');
  const early = api.fxBookResolve_(ACTIVE, 'USD', 'CAD', '2026-10-01');
  ok(!early.ok, 'a date before effective_from resolves to nothing rather than the nearest rate');
}

// ---- 4. overlap is refused ------------------------------------------------------------------------------
{
  const dup = ACTIVE.concat([Object.assign({}, ACTIVE[1], { rate: 1.9, effective_from: '2026-10-25' })]);
  const v = api.fxBookValidate_(dup);
  ok(!v.ok && codes(v).indexOf('FX_PERIOD_OVERLAP') >= 0, 'two active rates covering one day is a refused book');
  const amb = api.fxBookResolve_(dup, 'USD', 'CAD', '2026-10-26');
  ok(!amb.ok && amb.code === 'FX_AMBIGUOUS', 'resolution refuses an ambiguous book rather than taking the first row');
}

// ---- 5. the rules inherited from 73_ still bite ---------------------------------------------------------
{
  const bad = [Object.assign({}, ACTIVE[0], { rate: 0 })];
  ok(codes(api.fxBookValidate_(bad)).indexOf('FX_RATE_NOT_POSITIVE') >= 0, 'zero rate refused (inherited from 73_)');
  const noSrc = [Object.assign({}, ACTIVE[0], { source: '' })];
  ok(codes(api.fxBookValidate_(noSrc)).indexOf('FX_SOURCE_REQUIRED') >= 0, 'sourceless rate refused (inherited from 73_)');
  const ident = [Object.assign({}, ACTIVE[0], { quote_currency: 'USD', rate: 1.02 })];
  ok(codes(api.fxBookValidate_(ident)).indexOf('FX_IDENTITY_RATE_INVALID') >= 0, 'USD>USD at 1.02 refused (inherited from 73_)');
  const unsup = [Object.assign({}, ACTIVE[0], { quote_currency: 'CHF' })];
  ok(codes(api.fxBookValidate_(unsup)).indexOf('FX_CURRENCY_UNSUPPORTED') >= 0, 'a currency outside the frozen precision contract is refused');
  const blank = [Object.assign({}, ACTIVE[0], { status: '' })];
  ok(codes(api.fxBookValidate_(blank)).indexOf('FX_STATUS_INVALID') >= 0, 'a BLANK status is not "active"');
}

// ---- 6. version check inside the lock, and nothing written on conflict -----------------------------------
{
  const io = mem();
  let r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_by: 'ops', changed_at: '2026-10-19T00:00:00Z' } }, io);
  ok(r.success, 'first save onto an empty book succeeds');
  eq(r.data.doc_version, 1, 'doc_version advances to 1');

  const before = io.get('KM_FX_RATE_BOOK');
  r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: [] } }, io);
  ok(!r.success && codes(r).indexOf('FX_VERSION_CONFLICT') >= 0, 'a stale doc_version is refused');
  eq(r.errors[0].stored_doc_version, 1, 'the refusal hands back the stored version');
  eq(io.get('KM_FX_RATE_BOOK'), before, 'NOTHING was written on a version conflict');

  r = api.handleFxRateBookSave_({ payload: { rates: ACTIVE } }, io);
  ok(!r.success && codes(r).indexOf('FX_DOC_VERSION_REQUIRED') >= 0, 'a save with no doc_version is refused outright');
}

// ---- 7. an invalid book writes ZERO rates ----------------------------------------------------------------
{
  const io = mem();
  api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_by: 'ops', changed_at: 't' } }, io);
  const before = io.get('KM_FX_RATE_BOOK');
  const r = api.handleFxRateBookSave_({ payload: { doc_version: 1, rates: [Object.assign({}, ACTIVE[0], { rate: -5 })] } }, io);
  ok(!r.success && codes(r).indexOf('FX_BOOK_INVALID') >= 0, 'an invalid book is refused');
  eq(io.get('KM_FX_RATE_BOOK'), before, 'ZERO rates written when validation fails');
}

// ---- 8. lock unavailable -> nothing written ---------------------------------------------------------------
{
  const io = mem();
  api.setLock(false);
  const r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE } }, io);
  api.setLock(true);
  ok(!r.success && codes(r).indexOf('LOCK_UNAVAILABLE') >= 0, 'a contended save refuses rather than racing');
  eq(io.get('KM_FX_RATE_BOOK'), null, 'nothing written when the lock was not granted');
}

// ---- 9. the change record carries the OLD value -------------------------------------------------------------
{
  const io = mem();
  api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_by: 'ops', changed_at: 't1' } }, io);
  const edited = ACTIVE.map(r => r.quote_currency === 'CAD' ? Object.assign({}, r, { rate: 1.5 }) : r);
  api.handleFxRateBookSave_({ payload: { doc_version: 1, rates: edited, changed_by: 'vic', changed_at: 't2' } }, io);
  const log = JSON.parse(io.get('KM_FX_RATE_BOOK_LOG'));
  const edit = log.filter(e => e.change === 'EDITED');
  eq(edit.length, 1, 'exactly one EDITED record');
  const f = edit[0].fields[0];
  eq(f.field, 'rate', 'the moved field is named');
  eq(f.from, '1.416067', 'the OLD value is kept');
  eq(f.to, '1.5', 'the new value is kept');
  eq(edit[0].by, 'vic', 'who made the change is kept');
}

// ---- 10. retiring a rate keeps it; removing it is recorded ----------------------------------------------------
{
  const io = mem();
  api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_by: 'ops', changed_at: 't1' } }, io);
  const dropped = ACTIVE.filter(r => r.quote_currency !== 'JPY');
  api.handleFxRateBookSave_({ payload: { doc_version: 1, rates: dropped, changed_by: 'ops', changed_at: 't2' } }, io);
  const log = JSON.parse(io.get('KM_FX_RATE_BOOK_LOG'));
  const rm = log.filter(e => e.change === 'REMOVED');
  eq(rm.length, 1, 'removal is recorded');
  eq(rm[0].from.rate, 158.020084, 'the removed rate is kept in the record');
}

// ---- 11. the array handed to 73_, and the gaps NAMED ------------------------------------------------------------
{
  const out = api.fxBookRatesForReconcile_(ACTIVE, ['USD>CAD', 'USD>JPY', 'USD>USD', 'USD>KRW'], '2026-10-20');
  eq(out.rates.length, 2, 'identity contributes no entry; two real pairs resolved');
  ok(out.rates.every(r => 'base_currency' in r && 'quote_currency' in r && 'rate' in r && 'source' in r && 'as_of' in r),
     'each entry is exactly the shape pricingBuildRateTable_ accepts');
  eq(out.missing.length, 1, 'the uncovered pair is NAMED, not silently dropped');
  eq(out.missing[0].pair, 'USD>KRW', 'and named by pair');
  const table = new Function(REUSED + '\nreturn pricingBuildRateTable_;')()(out.rates);
  ok(table.ok, "73_'s own validator accepts the array the book produced: " + JSON.stringify(table.errors));
}

// ---- 12. a corrupt property is not an empty book --------------------------------------------------------------
{
  const io = mem();
  io.set('KM_FX_RATE_BOOK', '{not json');
  const r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE } }, io);
  ok(!r.success, 'a corrupt book refuses the save');
  eq(io.get('KM_FX_RATE_BOOK'), '{not json', 'and does not overwrite what it could not read');
}

// ---- 13. saving a rate writes NO price ---------------------------------------------------------------------------
{
  ok(!/pricing_list|pricingWrite|getSheetByName|appendRow|setValue/.test(PROPOSED),
     'the proposal contains no sheet write, no pricing_list reference and no price mutation at all');
  ok(!/auto_regular_price|regular_price|minimum_price|msrp/.test(PROPOSED),
     'the proposal never names a price column, so it cannot overwrite a manual price or an ownership flag');
  const io = mem();
  api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_by: 'o', changed_at: 't' } }, io);
  const keys = Object.keys(io.raw()).sort();
  ok(keys.length === 2 && keys[0] === 'KM_FX_RATE_BOOK' && keys[1] === 'KM_FX_RATE_BOOK_LOG',
     'a save touches exactly two properties and nothing else: ' + JSON.stringify(keys));
}

// ---- 14. GET is read-only ------------------------------------------------------------------------------------------
{
  const io = mem();
  const r = api.handleFxRateBookGet_({}, io);
  ok(r.success, 'GET on an empty book succeeds');
  eq(r.data.doc_version, 0, 'and reports version 0');
  eq(Object.keys(io.raw()).length, 0, 'opening the page wrote NOTHING');
  ok(r.data.supported_currencies.length === 8, 'the supported list comes from the frozen precision contract');
}

console.log('\nFX1-R1 staged-proposal verification: ' + pass + ' passed, ' + fail + ' failed.');
process.exitCode = fail ? 1 : 0;
