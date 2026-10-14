// =============================================================================================================
// S8-B3-R3-CP2M-R4-R1 — AN UNREADABLE PRIORITY IS NOT AN EMPTY ONE, ALL THE WAY DOWN
// -------------------------------------------------------------------------------------------------------------
// CP2M-R4 found, by capturing the real page rather than by reading the code, that an unparseable
// `allocation_priority` never reaches the browser as INVALID: the shipped reader normalises it to `null`, so
// the Site Priority page draws it as **Missing** and offers it a first set. That was recorded (D-S8-B3-36)
// and deliberately not fixed, because changing it means changing the reader's contract.
//
// WHICH LEAVES ONE QUESTION THAT MATTERS MORE THAN THE DISPLAY: if the page believes a cell is empty and
// sends a compare-and-set saying so, DOES THE SERVER OVERWRITE THE UNREADABLE VALUE?
//
// It must not. A cell holding `7abc` is a row somebody has to look at; silently replacing it with 90 because
// a normaliser three layers up could not parse it would destroy the only evidence that anything was wrong.
//
// SO THIS RUNS BOTH REAL IMPLEMENTATIONS, NOT A DESCRIPTION OF THEM. The browser-side normaliser is sliced
// out of `operation-system-db-api.js`, the server-side classifier out of `03_master_data_handlers.gs`, and
// the page's own `classify` is the shipped export. The chain is walked end to end for each raw cell value:
//
//     raw cell -> normaliser -> page.classify -> CAS state the page would send -> server classify -> verdict
//
// AND THE SECOND FINDING IS THE REASON THE UI TEXT CHANGED. Because the page has no way to say "I expect an
// INVALID value" — the contract allows only SET and MISSING — EVERY save against such a row is refused, by
// the editor exactly as by the drag. Telling the operator to "fix it with Edit" sends them to a control that
// cannot succeed.
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

// -------------------------------------------------------------------------------------------------------------
// THE THREE REAL IMPLEMENTATIONS, sliced out of the shipped files.
// -------------------------------------------------------------------------------------------------------------
function slice(src, startNeedle, rel) {
  const i = src.indexOf(startNeedle);
  if (i < 0) throw new Error('could not locate ' + startNeedle + ' in ' + rel);
  // Brace-match from the first { after the signature.
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(i, k + 1);
}

const API_SRC = read('assets/js/api/operation-system-db-api.js');
const GS_SRC = read('assets/specs/active/apps-script/03_master_data_handlers.gs');

// 1. THE BROWSER-SIDE READER. The whole normaliser, executed, not a re-implementation of its two lines.
const normSrc = slice(API_SRC, 'function normalizeMarketplaceRecord(raw)', 'operation-system-db-api.js');
const normalizeMarketplaceRecord = new Function(normSrc + '; return normalizeMarketplaceRecord;')();

// 2. THE SERVER-SIDE CLASSIFIER, out of the Apps Script file.
const clsSrc = slice(GS_SRC, 'function mpClassifyPriority_(v)', '03_master_data_handlers.gs');
const mpClassifyPriority_ = new Function(clsSrc + '; return mpClassifyPriority_;')();

// 3. THE PAGE'S OWN SEMANTICS, from its shipped export.
const PAGE_SRC = read('assets/js/pages/site-priority.js');
function loadPage() {
  const win = { KM: { lifecycle: { register() {} }, DB: {}, referenceCache: {} } };
  const doc = { addEventListener() {}, getElementById() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; } };
  new Function('window', 'document', 'console', 'CSS', 'KM', PAGE_SRC)(
    win, doc, { warn() {}, log() {} }, null, win.KM);
  return win.KM.sitePriority;
}
const P = loadPage();

// THE CAS STATE THE PAGE WOULD SEND, taken from the one line in the page that decides it, so this cannot
// drift from the shipped payload builder.
const CODE = PAGE_SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(/expected_allocation_priority_state: \(before\.state === 'SET'\) \? 'SET' : 'MISSING'/.test(CODE),
  'S0 the page sends SET only for a SET reading, and MISSING for everything else');
const casStateFor = (pageState) => (pageState === 'SET' ? 'SET' : 'MISSING');

// -------------------------------------------------------------------------------------------------------------
section('A. the slices are the real code, not a paraphrase');

ok(typeof normalizeMarketplaceRecord === 'function', 'A1 the shipped normaliser was sliced out and runs');
ok(typeof mpClassifyPriority_ === 'function', 'A2 the shipped server classifier too');
ok(normSrc.indexOf('isFinite(apNum)') !== -1, 'A3 the slice contains the normaliser’s own finiteness test');
ok(clsSrc.indexOf("state: 'INVALID'") !== -1, 'A4 and the classifier its INVALID branch');
ok(typeof P.classify === 'function', 'A5 and the page exports its §45.A reading');

// -------------------------------------------------------------------------------------------------------------
section('B. THE WHOLE CHAIN, for every shape a cell can hold');

// `verdict` reproduces gate 5 of mpSetAllocationPriorityLocked_ exactly: MISSING must meet MISSING, and SET
// must meet the same number. Anything else is PRIORITY_CHANGED, which the handler returns BEFORE its first
// setter — the file marks that line "EVERYTHING ABOVE THIS LINE IS PROVABLY ZERO-WRITE".
function verdict(casState, casExpected, storedCell) {
  const cur = mpClassifyPriority_(storedCell);
  if (casState === 'MISSING') {
    return cur.state !== 'MISSING' ? { refuse: 'PRIORITY_CHANGED', stored: cur.state } : { refuse: null };
  }
  if (cur.state !== 'SET' || Number(cur.value) !== Number(casExpected)) {
    return { refuse: 'PRIORITY_CHANGED', stored: cur.state };
  }
  return { refuse: null };
}

const CASES = [
  { cell: '7abc',     name: 'unparseable text' },
  { cell: 'high',     name: 'a word' },
  { cell: '1,000',    name: 'a thousands separator' },
  { cell: '-5',       name: 'a negative as text' },
  { cell: -5,         name: 'a negative number' },
  { cell: 'Infinity', name: 'a non-finite literal' },
  { cell: '',         name: 'a genuinely empty cell' },
  { cell: '  ',       name: 'whitespace only' },
  { cell: 0,          name: 'an explicit 0' },
  { cell: '0',        name: 'an explicit 0 as text' },
  { cell: 80,         name: 'an ordinary weight' }
];

const table = [];
CASES.forEach(function (c) {
  const normalized = normalizeMarketplaceRecord({
    marketplace_id: 'M1', company: 'KM', country: 'US', marketplace: 'Amazon',
    allocation_priority: c.cell
  });
  const pageRead = P.classify(normalized.allocationPriority);
  const cas = casStateFor(pageRead.state);
  const v = verdict(cas, pageRead.value, c.cell);
  table.push({ cell: JSON.stringify(c.cell), name: c.name, normalized: normalized.allocationPriority,
    page: pageRead.state, cas: cas, serverSees: mpClassifyPriority_(c.cell).state, refuse: v.refuse });
});
console.log('   cell            normalised  page      sends     server    verdict');
table.forEach(r => console.log('   ' + String(r.cell).padEnd(14) + ' '
  + String(r.normalized).padEnd(11) + ' ' + r.page.padEnd(9) + ' ' + r.cas.padEnd(9) + ' '
  + r.serverSees.padEnd(9) + ' ' + (r.refuse || 'WRITE')));

// -------------------------------------------------------------------------------------------------------------
section('C. THE CLAIM: an unreadable cell is never overwritten');

// Any case the SERVER reads as INVALID must be refused, whatever the page believed. This is the data-loss
// question, and it is asked of every shape rather than of the one that happened to be noticed.
const serverInvalid = table.filter(r => r.serverSees === 'INVALID');
ok(serverInvalid.length >= 4, 'C1 several shapes reach the server as INVALID', serverInvalid.length);
serverInvalid.forEach(function (r) {
  eq(r.refuse, 'PRIORITY_CHANGED', 'C2 ' + r.name + ' (' + r.cell + ') is REFUSED, not overwritten');
});
// And the refusal happens on the zero-write side of the handler.
ok(/EVERYTHING ABOVE THIS LINE IS PROVABLY ZERO-WRITE/.test(GS_SRC),
  'C3 the handler marks where its zero-write guarantee ends');
const zeroWriteAt = GS_SRC.indexOf('EVERYTHING ABOVE THIS LINE IS PROVABLY ZERO-WRITE');
const casAt = GS_SRC.indexOf("if (casState === 'MISSING')");
const firstSetter = GS_SRC.indexOf('.setValue(newValue)');
ok(casAt > 0 && zeroWriteAt > casAt, 'C4 and the compare-and-set is ABOVE that line');
ok(firstSetter > zeroWriteAt, 'C5 while the first setter is below it');

// -------------------------------------------------------------------------------------------------------------
section('D. THE SECOND FINDING: the page cannot express INVALID, so Edit cannot fix it either');

// There is no third CAS state. The page therefore sends MISSING for an INVALID reading — which the handler
// correctly refuses — so EVERY save against such a row fails, from the editor exactly as from the drag.
const invalidThroughPage = table.filter(r => r.page !== 'SET' && r.serverSees === 'INVALID');
ok(invalidThroughPage.length >= 4, 'D1 the page sends MISSING for rows the server calls INVALID',
  invalidThroughPage.map(r => r.cell));
invalidThroughPage.forEach(function (r) {
  eq(r.cas, 'MISSING', 'D2 ' + r.cell + ' is sent as MISSING');
  eq(r.refuse, 'PRIORITY_CHANGED', 'D2a and refused');
});
ok(!/expected_allocation_priority_state[^\n]*INVALID/.test(CODE),
  'D3 the page has no INVALID state to send');
ok(!/'INVALID'/.test((/expected_allocation_priority_state:[^\n]*/.exec(CODE) || [''])[0]),
  'D3a and the contract offers only SET and MISSING');

// SO THE UI MUST NOT SEND THE OPERATOR TO A CONTROL THAT CANNOT SUCCEED. The CP2M-R4 text said
// "Fix it with Edit first", which is advice to use a button whose save is refused every time.
const uiStrings = PAGE_SRC;
ok(!/cannot be read as a priority[\s\S]{0,120}Fix it with Edit/.test(uiStrings),
  'D4 the INVALID row no longer tells the operator to fix it with Edit');
// EVERY operator-facing mention, not just the first one: there are two (the disabled handle and the
// refusal from beginLift) and both have to point somewhere that can actually work.
var mentions = uiStrings.split('cannot be read as a priority').slice(1);
ok(mentions.length >= 2, 'D5 both operator-facing messages were found', mentions.length);
mentions.forEach(function (m, i) {
  ok(/spreadsheet/i.test(m.slice(0, 700)),
    'D5.' + i + ' message ' + (i + 1) + ' points at where the value can actually be corrected');
  ok(!/Fix it with Edit/.test(m.slice(0, 700)),
    'D5.' + i + 'a and does not send the operator to a control whose save is always refused');
});

// -------------------------------------------------------------------------------------------------------------
section('E. what is NOT changed');

// The reader's contract stays exactly as it is this round (D-S8-B3-36): the finding is recorded and the
// normalisation is left alone, because changing it is a contract change this round is not authorised to make.
ok(/\(apNum !== null && isFinite\(apNum\)\) \? apNum : null/.test(API_SRC),
  'E1 the reader still normalises an unparseable priority to null');
ok(/A NEGATIVE value is preserved, not clamped and not nulled/.test(API_SRC),
  'E2 and still preserves a negative on purpose');
eq(normalizeMarketplaceRecord({ allocation_priority: '7abc' }).allocationPriority, null,
  'E3 so text still arrives as null');
eq(normalizeMarketplaceRecord({ allocation_priority: -5 }).allocationPriority, -5,
  'E4 while a negative still arrives as itself');
eq(P.classify(null).state, 'MISSING', 'E5 and the page still reads null as MISSING');
eq(P.classify(-5).state, 'INVALID', 'E6 and a negative as INVALID');

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('INVALID PRIORITY FAIL-CLOSED (S8-B3-R3-CP2M-R4-R1): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
