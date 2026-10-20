// FX1-R4 — MUTATION PROOF FOR THE STAGED 75_ PROPOSAL **AND** FOR THE 04_ WIRING.
//
// verify-75-proposed.js passing says the proposal behaves. It does not say the suite would NOTICE if it
// stopped. Each mutation below puts one of the guards back the way it was — these are not invented
// breakages, they are the EXACT previous state of the line — and the suite must refuse the result.
//
// FX1-R2 ran its mutants by hand and they left nothing behind, so the claim "5 of 5 caught" was not
// re-runnable by anyone, including the next round. This file is the durable version of that claim.
//
// Run:  node docs/planning/fx1-r1-staging/mutants-fx1-r4.js
// It writes mutated COPIES to a temp directory and runs the verifiers against each; the SHIPPED files
// are never modified, and both runs prove that rather than asserting it.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const GSDIR = path.resolve(HERE, '../../../assets/specs/active/apps-script');
const SRC = path.join(GSDIR, '75_api_v1_fx_rate_book.gs');
const VERIFY = path.join(HERE, 'verify-75-fx-rate-book.js');
const ORIGINAL = fs.readFileSync(SRC, 'utf8');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fx75-mutants-'));

// Each mutant: [id, what it restores, find, replace]. `find` must occur EXACTLY once, so a mutation
// that no longer applies is reported as a stale mutant rather than silently passing.
const MUTANTS = [
  ['M1', 'the loose Number() coercion on the REQUEST doc_version',
    "  if (typeof payload.doc_version !== 'number' || !isFinite(payload.doc_version)\r\n      || payload.doc_version < 0 || Math.floor(payload.doc_version) !== payload.doc_version) {",
    "  var __coerced = Number(payload.doc_version);\r\n  if (!isFinite(__coerced) || __coerced < 0 || Math.floor(__coerced) !== __coerced) {"],

  ['M2', 'the request-supplied audit operator',
    '    var who = auth.user;',
    "    var who = pricingStr_(payload.changed_by) || auth.user || 'unknown';"],

  ['M3', 'the request-supplied timestamp',
    '    var records = fxBookChangeRecords_(current.rates, incoming, who, fxBookNowIso_());',
    '    var records = fxBookChangeRecords_(current.rates, incoming, who, pricingStr_(payload.changed_at));'],

  ['M4', 'the wildcard escape hatch',
    "  var real = list.filter(function (s) { return s !== '*'; });\r\n  if (real.length === 0 && list.indexOf('*') !== -1) {\r\n    return { ok: false, code: 'FX_AUTHORITY_WILDCARD_REFUSED', model: 'ALLOWLIST',",
    "  var real = list;\r\n  if (list.indexOf('*') !== -1) return { ok: true, model: 'OPEN_BY_CONFIGURATION', user: null };\r\n  if (false) {\r\n    return { ok: false, code: 'FX_AUTHORITY_WILDCARD_REFUSED', model: 'ALLOWLIST',"],

  ['M5', 'the request as a parameter of the authority decision',
    'function fxBookAuthority_(io) {',
    'function fxBookAuthority_(io, body) {\r\n  if (body && body.role === \'admin\') return { ok: true, model: \'ALLOWLIST\', user: \'admin\' };'],

  // The R2 guards, re-proved here so this file is the whole mutation claim rather than only the new part.
  ['M6', 'the loose typing of the STORED doc_version',
    "  if (typeof dv !== 'number' || !isFinite(dv) || Math.floor(dv) !== dv || dv < 0) {",
    '  var dvn = Number(dv);\r\n  if (!isFinite(dvn) || dvn < 0 || Math.floor(dvn) !== dvn) {'],

  ['M7', 'the UTF-8 capacity guard (byte length back to character length)',
    'function fxBookByteLen_(s) {',
    'function fxBookByteLen_(s) {\r\n  return String(s == null ? \'\' : s).length;'],

  ['M8', 'the commit readback',
    '    var saved = fxBookReadDoc_(io);\r\n    if (saved.doc_version !== current.doc_version + 1) {',
    '    var saved = fxBookReadDoc_(io);\r\n    if (false) {'],

  ['M10', 'a fallback rate at SKU creation instead of pending_fx',
    '  if (!r || r.ok !== true) return null;',
    '  if (!r || r.ok !== true) return 1;'],

  // FX1-R4 §6 — the snapshot. M11 is the one that matters: without the ok check a book nobody
  // could parse answers 1 for identity, which is a rate invented out of a parse failure.
  ['M11', 'an unreadable snapshot answering as if it were an empty one',
    '  if (!snap || snap.ok !== true) return null;',
    '  if (!snap) return null;'],

  ['M12', 'the snapshot swallowing a corrupt book as version 0 instead of reporting it unreadable',
    "    return { ok: false, rates: [], doc_version: null, absent: false,",
    "    return { ok: true, rates: [], doc_version: 0, absent: true,"],

  ['M9', 'the compare-and-swap on the stored version',
    '    if (current.doc_version !== expected) {',
    '    if (false) {']
];

// ---- THE SECOND TARGET: the 04_ WIRING -------------------------------------------------------
//
// FX1-R3 proved 75_ and stopped there, which is exactly where the R4 defect lived: the helper was
// correct and the CALL was per-row. These mutants put the wiring back the way it was and the wiring
// verifier must refuse each one. They are applied to the INTEGRATED sources that
// measure-fx1-r4-integration.js emits, so they mutate what is actually measured rather than a copy.
const WIRING = path.join(HERE, 'verify-04-wiring.js');
const EMIT04 = fs.mkdtempSync(path.join(os.tmpdir(), 'fx04-mutants-'));
const SRC04 = path.join(GSDIR, '04_marketplace_forecast_import.gs');
const O04 = fs.readFileSync(SRC04, 'utf8');

const WIRING_MUTANTS = [
  ['W1', 'the per-ROW Property read FX1-R3 shipped',
    "    fxRate = (typeof fxBookRateFromSnapshot_ === 'function') ? fxBookRateFromSnapshot_(fxBook, b, l, asOf) : null;",
    "    fxRate = (typeof fxBookSnapshotForImport_ === 'function') ? fxBookRateFromSnapshot_(fxBookSnapshotForImport_(), b, l, asOf) : null;"],

  ['W2', 'the planner reaching for the book itself instead of being handed one',
    'function pricingNewRowPlan_(baseCurrency, localCurrency, base, asOf, fxBook) {',
    "function pricingNewRowPlan_(baseCurrency, localCurrency, base, asOf, fxBook) {\r\n  fxBook = fxBookSnapshotForImport_();"],

  ['W3', 'a zero price where there is no coefficient',
    "      out.reason = 'NO_CANONICAL_FX_RATE'; return out;\r\n    }\r\n  }",
    "      fxRate = 0;\r\n    }\r\n  }"],

  ['W4', 'the batch forgetting which book priced it',
    "  out.fx_doc_version = (fxBook && typeof fxBook.doc_version === 'number') ? fxBook.doc_version : null;",
    "  out.fx_doc_version = null;"],

  ['W5', 'the inverted conversion - LOCAL = BASE / RATE instead of x RATE',
    '    var r = pricingRoundFx_(n * fxRate, l);',
    '    var r = pricingRoundFx_(n / fxRate, l);']
];

let applied = 0, caught = 0, missed = [];
MUTANTS.forEach(function (m) {
  const [id, what, find, repl] = m;
  const occurrences = ORIGINAL.split(find).length - 1;
  if (occurrences !== 1) {
    missed.push(id + ' STALE (anchor occurs ' + occurrences + ' times): ' + what);
    console.log(id + '  STALE   ' + what);
    return;
  }
  applied++;
  const file = path.join(TMP, id + '.gs');
  fs.writeFileSync(file, ORIGINAL.replace(find, repl), 'utf8');
  let failed = false, out = '';
  try {
    out = execFileSync(process.execPath, [VERIFY],
      { cwd: path.resolve(HERE, '../../..'), encoding: 'utf8',
        env: Object.assign({}, process.env, { FX75_SRC: file }) });
  } catch (e) {
    failed = true;                       // non-zero exit = the suite refused the mutant
    out = String((e && e.stdout) || '');
  }
  const summary = (out.split(/\r?\n/).filter(l => /passed,/.test(l)).pop() || '').trim();
  if (failed) { caught++; console.log(id + '  caught  ' + what + '   [' + summary + ']'); }
  else { missed.push(id + ' SURVIVED: ' + what); console.log(id + '  SURVIVED  ' + what + '   [' + summary + ']'); }
});

WIRING_MUTANTS.forEach(function (m) {
  const [id, what, find, repl] = m;
  const occurrences = O04.split(find).length - 1;
  if (occurrences !== 1) {
    missed.push(id + ' STALE (anchor occurs ' + occurrences + ' times): ' + what);
    console.log(id + '  STALE   ' + what);
    return;
  }
  applied++;
  const file = path.join(EMIT04, id + '-04.gs');
  fs.writeFileSync(file, O04.replace(find, repl), 'utf8');
  let failed = false, out = '';
  try {
    out = execFileSync(process.execPath, [WIRING],
      { cwd: path.resolve(HERE, '../../..'), encoding: 'utf8',
        env: Object.assign({}, process.env, { FX04_SRC: file }) });
  } catch (e) { failed = true; out = String((e && e.stdout) || ''); }
  const summary = (out.split(/\r?\n/).filter(l => /passed,/.test(l)).pop() || '').trim();
  if (failed) { caught++; console.log(id + '  caught  ' + what + '   [' + summary + ']'); }
  else { missed.push(id + ' SURVIVED: ' + what); console.log(id + '  SURVIVED  ' + what + '   [' + summary + ']'); }
});

console.log('');
console.log('mutants applied: ' + applied + '   caught: ' + caught + '   missed: ' + missed.length);
missed.forEach(function (m) { console.log('  ' + m); });
// The staged file was never written to; prove it rather than assert it.
const after = fs.readFileSync(SRC, 'utf8');
const after04 = fs.readFileSync(SRC04, 'utf8');
console.log('shipped 04_ unchanged: ' + (after04 === O04));
console.log('shipped 75_ unchanged: ' + (after === ORIGINAL));
process.exitCode = (missed.length || after !== ORIGINAL || after04 !== O04) ? 1 : 0;
