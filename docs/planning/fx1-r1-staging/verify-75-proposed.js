// FX1-R2 — proof that the STAGED 75_ proposal actually runs, against the REAL 73_ helpers it claims to
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
const STUBS = `
var __props = {};
var PropertiesService = { getScriptProperties: function () { return {
  getProperty: function (k) { return Object.prototype.hasOwnProperty.call(__props, k) ? __props[k] : null; },
  setProperty: function (k, v) { __props[k] = String(v); }
}; } };
var __activeUser = '';
var Session = { getActiveUser: function () { return { getEmail: function () { return __activeUser; } }; } };
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
  fxBookReadDoc_: fxBookReadDoc_, fxBookByteLen_: fxBookByteLen_, fxBookCommit_: fxBookCommit_,
  fxBookAuthority_: fxBookAuthority_,
  setLock: function (v) { __lockGranted = v; }, releases: function () { return __lockReleased; },
  props: function () { return __props; }, reset: function () { __props = {}; }
};`)();

// ---- tiny assert --------------------------------------------------------------------------------------
let pass = 0, fail = 0;
function ok(cond, label, extra) { if (cond) { pass++; } else { fail++; console.log('  FAIL  ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); } }
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function codes(r) { return (r.errors || []).map(e => e.code); }

// A store with NO configuration at all — used by the authority counter-examples.
function bare() {
  let store = {};
  return { get: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
           set: (k, v) => { store[k] = String(v); }, raw: () => store, user: () => '' };
}
// The ordinary store the behavioural sections use: an explicitly OPEN deployment, which is one of the two
// configurations the authority accepts. Every section that is not ABOUT authority uses this, so a change
// in the authority model cannot silently turn those sections green by refusing before they run.
function mem() {
  const io = bare();
  io.set('KM_FX_RATE_BOOK_EDITORS', '*');
  return io;
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
  ok(r.success, 'first save onto an empty book succeeds', codes(r));
  eq(r.data.doc_version, 1, 'doc_version advances to 1');

  const before = io.get('KM_FX_RATE_BOOK');
  r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: [] } }, io);
  ok(!r.success && codes(r).indexOf('FX_VERSION_CONFLICT') >= 0, 'a stale doc_version is refused');
  eq(r.errors[0].stored_doc_version, 1, 'the refusal hands back the stored version');
  eq(io.get('KM_FX_RATE_BOOK'), before, 'NOTHING was written on a version conflict');

  r = api.handleFxRateBookSave_({ payload: { rates: ACTIVE } }, io);
  ok(!r.success && codes(r).indexOf('FX_DOC_VERSION_REQUIRED') >= 0, 'a save with no doc_version is refused outright');
  r = api.handleFxRateBookSave_({ payload: { doc_version: 1.5, rates: ACTIVE } }, io);
  ok(!r.success && codes(r).indexOf('FX_DOC_VERSION_REQUIRED') >= 0, 'a FRACTIONAL doc_version is refused too');
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
  const log = api.fxBookReadDoc_(io).log;
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
  const log = api.fxBookReadDoc_(io).log;
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
  const keysBefore = Object.keys(io.raw()).sort();
  api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_by: 'o', changed_at: 't' } }, io);
  const added = Object.keys(io.raw()).sort().filter(k => keysBefore.indexOf(k) === -1);
  eq(added.length, 1, 'a save adds exactly ONE property: ' + JSON.stringify(added));
  eq(added[0], 'KM_FX_RATE_BOOK', 'and it is the book itself');
}

// ---- 14. GET is read-only ------------------------------------------------------------------------------------------
{
  const io = mem();
  const r = api.handleFxRateBookGet_({}, io);
  ok(r.success, 'GET on an empty book succeeds');
  eq(r.data.doc_version, 0, 'and reports version 0');
  eq(Object.keys(io.raw()).length, 1, 'opening the page wrote NOTHING (only the pre-set config key is present)');
  ok(r.data.supported_currencies.length === 8, 'the supported list comes from the frozen precision contract');
  ok(r.data.capacity && r.data.capacity.limit_bytes > 0, 'and the page is told the capacity it is working within');
}

// ===================================================================================================
// FX1-R2 — THE FOUR THINGS THE FIRST DRAFT LEFT OPEN, each as a counter-example.
// ===================================================================================================

// ---- 15. STRUCTURE AND VERSION ARE VALIDATED, NOT ASSUMED ------------------------------------------
{
  const cases = [
    ['[]',                                   'a JSON ARRAY is not a rate book'],
    ['"a string"',                           'a JSON string is not a rate book'],
    ['{"doc_version":1,"rates":[]}',         'a document with no shape marker is refused'],
    ['{"shape":0,"doc_version":1,"rates":[]}', 'shape 0 is refused'],
    ['{"shape":1,"doc_version":"2","rates":[]}', 'a doc_version that is a STRING is refused'],
    ['{"shape":1,"doc_version":1.5,"rates":[]}', 'a fractional doc_version is refused'],
    ['{"shape":1,"doc_version":-1,"rates":[]}', 'a negative doc_version is refused'],
    ['{"shape":1,"doc_version":1,"rates":{}}', 'rates as an OBJECT is refused'],
    ['{"shape":1,"doc_version":1}',           'a document with no rates at all is refused'],
    ['{"shape":1,"doc_version":1,"rates":"[]"}', 'rates as a STRING is refused']
  ];
  cases.forEach(([raw, label]) => {
    const io = mem(); io.set('KM_FX_RATE_BOOK', raw);
    let threw = null;
    try { api.fxBookReadDoc_(io); } catch (e) { threw = String(e.message || e); }
    ok(threw !== null, 'structure: ' + label, threw);
  });
  // A FUTURE SHAPE IS REFUSED RATHER THAN DOWNGRADED.
  {
    const io = mem(); io.set('KM_FX_RATE_BOOK', '{"shape":99,"doc_version":3,"rates":[],"newField":1}');
    let threw = null;
    try { api.fxBookReadDoc_(io); } catch (e) { threw = String(e.message || e); }
    ok(threw && /FX_BOOK_SHAPE_FUTURE/.test(threw), 'structure: a book written by a NEWER build is refused, not silently downgraded', threw);
    const before = io.get('KM_FX_RATE_BOOK');
    const r = api.handleFxRateBookSave_({ payload: { doc_version: 3, rates: ACTIVE } }, io);
    ok(!r.success, 'structure: and a save against it fails');
    eq(io.get('KM_FX_RATE_BOOK'), before, 'structure: and does NOT overwrite the newer document');
  }
  // An ABSENT property is a legitimate empty book, not a structural fault.
  {
    const io = mem();
    const d = api.fxBookReadDoc_(io);
    eq(d.doc_version, 0, 'structure: an absent property reads as version 0');
    eq(d.rates.length, 0, 'structure: with no rates');
    eq(d.absent, true, 'structure: and says it was absent rather than empty-by-content');
  }
}

// ---- 16. THE UTF-8 CAPACITY GUARD -------------------------------------------------------------------
{
  // The unit matters. .length counts UTF-16 units; the platform counts bytes.
  eq(api.fxBookByteLen_('abc'), 3, 'bytes: ASCII is one byte per character');
  eq(api.fxBookByteLen_('é'), 2, 'bytes: a Latin-1 accent is TWO bytes');
  eq(api.fxBookByteLen_('—'), 3, 'bytes: an em dash is THREE bytes');
  eq(api.fxBookByteLen_('中文'), 6, 'bytes: CJK is three bytes per character');
  eq(api.fxBookByteLen_('😀'), 4, 'bytes: an emoji is ONE four-byte code point, not two three-byte ones');
  ok(api.fxBookByteLen_('é—中') > 'é—中'.length,
     'bytes: and the byte count EXCEEDS the character count for non-ASCII — the bug this guard exists for');

  // A book that does not fit is refused, and nothing is written.
  {
    const io = mem();
    api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_by: 'o', changed_at: 't' } }, io);
    const before = io.get('KM_FX_RATE_BOOK');
    const huge = ACTIVE.map((r, i) => Object.assign({}, r, {
      effective_from: '2027-' + String((i % 12) + 1).padStart(2, '0') + '-01',
      note: '中'.repeat(4000)            // 12,000 bytes of perfectly valid note
    }));
    const r = api.handleFxRateBookSave_({ payload: { doc_version: 1, rates: huge, changed_by: 'o', changed_at: 't' } }, io);
    ok(!r.success, 'capacity: an oversized book is refused');
    eq(codes(r)[0], 'FX_BOOK_TOO_LARGE', 'capacity: by a NAMED refusal, not a platform exception');
    ok(r.errors[0].bytes > r.errors[0].limit, 'capacity: and it reports the measurement',
       { bytes: r.errors[0].bytes, limit: r.errors[0].limit });
    eq(io.get('KM_FX_RATE_BOOK'), before, 'capacity: NOTHING was written — not a truncated book');
    // and the refusal is about BYTES, not characters: the same note in ASCII fits.
    const ascii = ACTIVE.map((r2, i) => Object.assign({}, r2, {
      effective_from: '2027-' + String((i % 12) + 1).padStart(2, '0') + '-01', note: 'x'.repeat(200) }));
    const r2 = api.handleFxRateBookSave_({ payload: { doc_version: 1, rates: ascii, changed_by: 'o', changed_at: 't' } }, io);
    ok(r2.success, 'capacity: a book of the same SHAPE in ASCII fits', codes(r2));
  }
  // The log sheds its oldest records before the rates are refused, and says so.
  {
    const io = mem();
    let v = 0;
    api.handleFxRateBookSave_({ payload: { doc_version: v++, rates: ACTIVE, changed_by: 'o', changed_at: 't0' } }, io);
    let trimmedSeen = 0;
    for (let i = 0; i < 25; i++) {
      const edited = ACTIVE.map(r => r.quote_currency === 'CAD'
        ? Object.assign({}, r, { rate: 1.4 + i / 1000, note: 'churn ' + 'y'.repeat(120) }) : r);
      const res = api.handleFxRateBookSave_({ payload: { doc_version: v, rates: edited, changed_by: 'ops', changed_at: 't' + i } }, io);
      if (!res.success) { ok(false, 'capacity: churn save ' + i + ' failed', codes(res)); break; }
      v = res.data.doc_version;
      trimmedSeen += res.data.log_trimmed || 0;
      ok(res.data.bytes <= res.data.limit, 'capacity: every committed document is within the cap', res.data.bytes);
    }
    const fin = api.fxBookReadDoc_(io);
    ok(fin.log.length <= 50, 'capacity: the log stays bounded', fin.log.length);
    ok(fin.rates.length === ACTIVE.length, 'capacity: and the RATES are never the thing that gets dropped');
  }
}

// ---- 17. ONE ATOMIC COMMIT: the rates and the history cannot disagree -------------------------------
{
  const io = mem();
  api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_by: 'ops', changed_at: 't1' } }, io);
  eq(Object.keys(io.raw()).filter(k => k !== 'KM_FX_RATE_BOOK_EDITORS').length, 1, 'atomic: a save touches exactly ONE property beyond its own config');
  ok(io.get('KM_FX_RATE_BOOK') !== null, 'atomic: and it is the book itself');
  const doc = JSON.parse(io.get('KM_FX_RATE_BOOK'));
  ok(Array.isArray(doc.log), 'atomic: the change log travels INSIDE the book document');
  ok(doc.log.length > 0, 'atomic: and it was written by the same commit as the rates');
  eq(doc.doc_version, 1, 'atomic: at the same version');

  // A FAILING WRITE LEAVES BOTH UNCHANGED — there is no half state to recover from.
  const before = io.get('KM_FX_RATE_BOOK');
  const io2 = { get: io.get, set: () => { throw new Error('PROPERTY_WRITE_FAILED'); }, raw: io.raw, user: io.user };
  const r = api.handleFxRateBookSave_({ payload: { doc_version: 1, rates: ACTIVE.slice(0, 2), changed_by: 'ops', changed_at: 't2' } }, io2);
  ok(!r.success, 'atomic: a failing property write is reported as a failure');
  eq(io.get('KM_FX_RATE_BOOK'), before, 'atomic: and the stored book is byte-identical to before');
  const after = JSON.parse(io.get('KM_FX_RATE_BOOK'));
  eq(after.rates.length, ACTIVE.length, 'atomic: the rates did not move');
  eq(after.log.length, doc.log.length, 'atomic: and neither did the history — no orphan record');

  // A COMMIT THAT DOES NOT READ BACK IS NOT REPORTED AS SUCCESS.
  const ioLying = (function () {
    let store = JSON.parse(JSON.stringify(io.raw()));
    return { get: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
             set: () => {},                       // accepts the write and silently keeps the old value
             raw: () => store, user: () => 'ops@example.com' };
  })();
  const r3 = api.handleFxRateBookSave_({ payload: { doc_version: 1, rates: ACTIVE.slice(0, 3), changed_by: 'ops', changed_at: 't3' } }, ioLying);
  ok(!r3.success, 'atomic: a write that silently did not take is NOT reported as success');
  eq(codes(r3)[0], 'FX_COMMIT_NOT_CONFIRMED', 'atomic: it is named, so the operator knows to re-apply');
}

// ---- 18. THE WRITE AUTHORITY FAILS CLOSED -----------------------------------------------------------
{
  // No allowlist configured at all -> refuse.
  {
    const io = bare();
    const r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE } }, io);
    ok(!r.success, 'authority: with NO allowlist configured, a save is refused');
    eq(codes(r)[0], 'FX_AUTHORITY_NOT_CONFIGURED', 'authority: and says the allowlist is missing');
    eq(io.get('KM_FX_RATE_BOOK'), null, 'authority: nothing was written');
  }
  // Allowlist configured, caller UNIDENTIFIABLE -> refuse. This is the deployment mode where
  // Session.getActiveUser() returns ''; treating it as authorised would make the allowlist decorative.
  {
    const io = bare(); io.set('KM_FX_RATE_BOOK_EDITORS', 'ops@example.com');
    io.user = () => '';
    const r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE } }, io);
    ok(!r.success, 'authority: an UNIDENTIFIABLE caller is refused, not assumed');
    eq(codes(r)[0], 'FX_AUTHORITY_UNVERIFIABLE', 'authority: and the reason names the deployment limit');
    eq(io.get('KM_FX_RATE_BOOK'), null, 'authority: nothing was written');
  }
  // Allowlist configured, caller NOT on it -> refuse.
  {
    const io = bare(); io.set('KM_FX_RATE_BOOK_EDITORS', 'ops@example.com');
    io.user = () => 'someone.else@example.com';
    const r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE } }, io);
    ok(!r.success, 'authority: a caller outside the allowlist is refused');
    eq(codes(r)[0], 'FX_NOT_AUTHORIZED', 'authority: by name');
    eq(io.get('KM_FX_RATE_BOOK'), null, 'authority: nothing was written');
  }
  // Allowlist configured, caller ON it -> allowed, case-insensitively.
  {
    const io = bare(); io.set('KM_FX_RATE_BOOK_EDITORS', ' Ops@Example.com , other@example.com ');
    io.user = () => 'ops@example.com';
    const r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_at: 't' } }, io);
    ok(r.success, 'authority: a listed caller may save', codes(r));
    eq(r.data.authority, 'ALLOWLIST', 'authority: and the model is reported');
    const doc = JSON.parse(io.get('KM_FX_RATE_BOOK'));
    eq(doc.log[0].by, 'ops@example.com', 'authority: the change record attributes the IDENTIFIED caller');
  }
  // The documented escape: an explicit '*' recorded in configuration.
  {
    const io = bare(); io.set('KM_FX_RATE_BOOK_EDITORS', '*');
    io.user = () => '';
    const r = api.handleFxRateBookSave_({ payload: { doc_version: 0, rates: ACTIVE, changed_by: 'ops', changed_at: 't' } }, io);
    ok(r.success, 'authority: an explicitly OPEN deployment is allowed', codes(r));
    eq(r.data.authority, 'OPEN_BY_CONFIGURATION', 'authority: and is recorded as a decision, not a default');
  }
  // READ is never gated on write authority.
  {
    const io = bare();
    api.handleFxRateBookSave_ && io.set('KM_FX_RATE_BOOK', JSON.stringify({ shape: 1, doc_version: 1, rates: ACTIVE, log: [] }));
    const g = api.handleFxRateBookGet_({}, io);
    ok(g.success, 'authority: a caller who may not SAVE can still READ the rates');
    eq(g.data.may_edit, false, 'authority: and is told plainly that they may not edit');
    eq(g.data.authority_reason, 'FX_AUTHORITY_NOT_CONFIGURED', 'authority: with the reason, before they start editing');
    eq(g.data.rates.length, ACTIVE.length, 'authority: and the rates are all there');
  }
}

console.log('');
console.log('FX1-R2 staged-proposal verification: ' + pass + ' passed, ' + fail + ' failed.');
process.exitCode = fail ? 1 : 0;
