// FX1-R3 — APPLY THE INTEGRATION, MEASURE THE WHOLE LOAD SURFACE, WRITE THE PATCH, PUT IT BACK.
//
// The Owner approved a ceiling of 4,662,000 bytes and asked for the FULL surface measured, including the
// version and wiring costs, with the instruction to STOP AND REPORT if it exceeds — not to raise the
// number and not to delete unrelated modules.
//
// So the integration cannot simply be committed to find out. This script applies it to the working tree,
// measures the surface exactly as assets/tools/apps-script-audit/gs-load-surface-audit.js does (UTF-8
// bytes of every .gs under assets/specs/active/apps-script/, LF, which is how git stores them), writes
// the applied diff to fx1-r3-integration.patch, and then RESTORES the tree. It leaves nothing behind.
//
// Run:  node docs/planning/fx1-r1-staging/measure-fx1-r3-integration.js
//       node docs/planning/fx1-r1-staging/measure-fx1-r3-integration.js --keep    (apply and stop)
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const GSDIR = path.join(ROOT, 'assets/specs/active/apps-script');
const HERE = __dirname;
const KEEP = process.argv.indexOf('--keep') !== -1;
const CEILING = 4662000;

function read(p) { return fs.readFileSync(p, 'utf8'); }
function lfBytes(s) { return Buffer.byteLength(s.replace(/\r\n/g, '\n'), 'utf8'); }
function surface() {
  let bytes = 0, files = 0;
  fs.readdirSync(GSDIR).filter(f => /\.gs$/.test(f)).sort().forEach(f => {
    bytes += lfBytes(read(path.join(GSDIR, f))); files++;
  });
  return { files, bytes };
}
function sub(s, find, repl, what) {
  const n = s.split(find).length - 1;
  if (n !== 1) { throw new Error('anchor occurs ' + n + ' times: ' + what); }
  return s.replace(find, repl);
}

const before = surface();
const touched = ['01_router.gs', '63_api_v1_system_health.gs', '04_marketplace_forecast_import.gs'];
const saved = {};
touched.forEach(f => { saved[f] = read(path.join(GSDIR, f)); });
const NEWFILE = path.join(GSDIR, '75_api_v1_fx_rate_book.gs');

function restore() {
  touched.forEach(f => fs.writeFileSync(path.join(GSDIR, f), saved[f], 'utf8'));
  try { fs.unlinkSync(NEWFILE); } catch (e) {}
}

let result = null;
try {
  // ---- 75_: the staged proposal becomes the module ------------------------------------------------
  fs.writeFileSync(NEWFILE, read(path.join(HERE, '75_api_v1_fx_rate_book.gs.proposed')), 'utf8');

  // ---- 01_router: one GET, one POST, and the POST vocabulary --------------------------------------
  {
    const p = path.join(GSDIR, '01_router.gs');
    let s = read(p); const NL = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    s = sub(s, "    'pricing.write.status':                        handlePricingWriteStatus_,",
      [ "    'pricing.write.status':                        handlePricingWriteStatus_,",
        '    // FX1-R3 — the stored FX coefficients (owner = 75_). READ-ONLY and on the GET table because seeing',
        '    // the rates that price the catalogue is not the same permission as changing them: the answer carries',
        '    // may_edit so the page can tell the operator before they start, and the SAVE twin stays POST-only.',
        "    'fxRateBook.get':                              handleFxRateBookGet_," ].join(NL), 'GET table');
    s = sub(s, [ "    if (action === 'pricing.fxReconcile') {",
        '      return jsonResponse_(handlePricingFxReconcile_(body));', '    }' ].join(NL),
      [ "    if (action === 'pricing.fxReconcile') {",
        '      return jsonResponse_(handlePricingFxReconcile_(body));', '    }', '',
        '    // FX1-R3 — THE RATE BOOK WRITE (owner = 75_). It stores coefficients and NOTHING ELSE: no price',
        '    // moves here, and the only action that can move one is pricing.fxReconcile above, which is dry-run',
        '    // by default. POST only, authority fails closed, and the operator on the change record is the',
        '    // caller this deployment identified rather than a name the request supplied.',
        "    if (action === 'fxRateBook.save') {",
        '      return jsonResponse_(handleFxRateBookSave_(body));', '    }' ].join(NL), 'POST dispatch');
    s = sub(s, 'pricing.update, pricing.fxReconcile, upsertTaxReferralRate',
      'pricing.update, pricing.fxReconcile, fxRateBook.save, upsertTaxReferralRate', 'POST vocabulary');
    fs.writeFileSync(p, s, 'utf8');
  }

  // ---- 63_: required actions, the manifest row, two version numbers --------------------------------
  {
    const p = path.join(GSDIR, '63_api_v1_system_health.gs');
    let s = read(p); const NL = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    s = sub(s, 'var SYS_REQUIRED_ACTIONS_ = [',
      [ 'var SYS_REQUIRED_ACTIONS_ = [',
        '  // FX1-R3 — the FX rate book (owner = 75_). A deployment that has 73_ but not 75_ can reconcile only',
        '  // from rates typed into the request, and the Administration page would show an empty book that it',
        '  // cannot save. Named here so that is visible as a partial sync rather than as a page with no rates.',
        "  { action: 'fxRateBook.get', handler: 'handleFxRateBookGet_', used_by: 'FX Rate Book (Administration)' },",
        "  { action: 'fxRateBook.save', handler: 'handleFxRateBookSave_', used_by: 'FX Rate Book save' }," ].join(NL),
      'required actions');
    s = sub(s, "  { file: '74_api_v1_overseas_allocation_preview_job.gs',",
      [ "  { file: '75_api_v1_fx_rate_book.gs', symbol: 'FX_BOOK_BUILD_VERSION_', expected: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55', owns: 'the stored FX rate book: one Script Property holding rates and change history together so a half-written save cannot leave them disagreeing, a UTF-8 byte capacity guard measured BEFORE the write, strict typing of both the stored document and the request doc_version, a compare-and-swap on that version inside the script lock, a readback that refuses to report a save it cannot confirm, and a write authority that fails closed on an unidentifiable caller. It owns NO price formula and NO price: conversion and precision stay in 73_, and saving a rate moves nothing until a reconciliation runs' },",
        "  { file: '74_api_v1_overseas_allocation_preview_job.gs'," ].join(NL), 'manifest row');
    s = sub(s, 'var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 20;',
      [ "// FX1-R3: 20 -> 21. 01_router gained fxRateBook.get and fxRateBook.save, and this number's rule is",
        '// "bump whenever a router ACTION is added or removed". A deployment at 20 serves pricing.fxReconcile',
        '// but has nowhere to keep a rate, so the page can read and never save.',
        'var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 21;' ].join(NL), 'action contract version');
    s = sub(s, 'var SYS_REQUIRED_ACTION_LIST_VERSION_ = 16;',
      [ '// FX1-R3: 16 -> 17. SYS_REQUIRED_ACTIONS_ gained the two fxRateBook actions.',
        'var SYS_REQUIRED_ACTION_LIST_VERSION_ = 17;' ].join(NL), 'required action list version');
    fs.writeFileSync(p, s, 'utf8');
  }

  // ---- 04_: consult the book at creation; a missing coefficient still goes pending -----------------
  {
    const p = path.join(GSDIR, '04_marketplace_forecast_import.gs');
    let s = read(p); const NL = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    s = sub(s, [ '  // THE WHOLE POINT. A rate for this pair is not something this file is allowed to decide.',
        "  if (b !== l) { out.reason = 'NO_CANONICAL_FX_RATE'; return out; }" ].join(NL),
      [ '  // THE WHOLE POINT. A rate for this pair is not something this file is allowed to decide.',
        '  //',
        '  // FX1-R3 — IT IS STILL NOT, AND NOW THERE IS SOMEWHERE TO ASK. 75_ stores the coefficients, so a',
        '  // cross-currency row no longer has to be born blank merely because nothing had anywhere to keep a',
        '  // rate. What does NOT change is the answer when there is no coefficient: fx_rate, auto_* and the',
        '  // effective price stay BLANK and the row stays pending_fx. A blank auto is a visible gap; a zero is',
        '  // a commercial claim nobody made, and a fallback rate would be exactly the guess this contract was',
        '  // written to refuse. Saving a coefficient reprices nothing either — it only changes what the NEXT',
        '  // creation reads, and what a pricing.fxReconcile could later be asked to apply.',
        '  var fxRate = 1;',
        '  if (b !== l) {',
        "    fxRate = (typeof fxBookRateForCreate_ === 'function') ? fxBookRateForCreate_(b, l, asOf) : null;",
        "    if (!(typeof fxRate === 'number' && isFinite(fxRate) && fxRate > 0)) {",
        "      out.reason = 'NO_CANONICAL_FX_RATE'; return out;", '    }', '  }' ].join(NL),
      '04_ consult the book');
    s = sub(s, '  out.fx_rate = 1;', '  out.fx_rate = fxRate;', '04_ record the rate used');
    s = sub(s, '    var r = pricingRoundFx_(n, l);',
      '    var r = pricingRoundFx_(n * fxRate, l);   // LOCAL = BASE x RATE, 73_’s direction, never inverted',
      '04_ convert through the rate');
    fs.writeFileSync(p, s, 'utf8');
  }

  const after = surface();
  // The patch, so the wiring is reviewable without re-running this script.
  try {
    cp.execSync('git add -N assets/specs/active/apps-script/75_api_v1_fx_rate_book.gs', { cwd: ROOT });
    const diff = cp.execSync('git diff -- assets/specs/active/apps-script/',
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
    fs.writeFileSync(path.join(HERE, 'fx1-r3-integration.patch'), diff, 'utf8');
    cp.execSync('git reset -q assets/specs/active/apps-script/75_api_v1_fx_rate_book.gs', { cwd: ROOT });
  } catch (e) { console.log('(patch not written: ' + (e && e.message) + ')'); }

  const perFile = {};
  ['75_api_v1_fx_rate_book.gs'].concat(touched).forEach(f => {
    const now = lfBytes(read(path.join(GSDIR, f)));
    const was = saved[f] === undefined ? 0 : lfBytes(saved[f]);
    perFile[f] = now - was;
  });
  result = { before, after, perFile };
} finally {
  if (!KEEP) restore();
}

console.log('FX1-R3 — MEASURED GS LOAD SURFACE');
console.log('');
Object.keys(result.perFile).forEach(f => {
  console.log('  ' + f.padEnd(40) + (result.perFile[f] >= 0 ? '+' : '') + result.perFile[f]);
});
console.log('  ' + 'TOTAL'.padEnd(40) + '+' + (result.after.bytes - result.before.bytes));
console.log('');
console.log('  before   ' + result.before.files + ' files   ' + result.before.bytes + ' bytes');
console.log('  after    ' + result.after.files + ' files   ' + result.after.bytes + ' bytes');
console.log('  ceiling                   ' + CEILING + ' bytes (Owner-approved, FX1-R3)');
console.log('  ' + (result.after.bytes <= CEILING
  ? 'VERDICT  UNDER by ' + (CEILING - result.after.bytes) + ' bytes'
  : 'VERDICT  OVER by ' + (result.after.bytes - CEILING) + ' bytes — STOP AND REPORT'));
console.log('');
console.log('  working tree ' + (KEEP ? 'LEFT APPLIED (--keep)' : 'restored: ' + surface().bytes + ' bytes'));
process.exitCode = (result.after.bytes <= CEILING) ? 0 : 1;
