// Kitchen Mama Operation System — FX1-R4-R1
// THE ADMINISTRATION PAGE'S ROUND TRIP, AND THE COEFFICIENT IT SAVES REACHING A PRICING_LIST ROW.
//
// Run: node assets/tests/fx-rate-book-roundtrip-and-wiring-fx1-r4-r1.test.js
//
// LOCAL / OFFLINE. No network, no Property, no spreadsheet, no production anything. §A-§G read browser
// captures that were taken against an in-memory store; §H-§K execute the SHIPPED 04_ handler against an
// in-memory spreadsheet, in this process.
//
// WHY THIS SUITE EXISTS. FX1-R4 shipped the FX Rate Book page with 234 assertions on 75_, 49 on the 04_
// wiring and 17 mutants, and every one of them passed while the page could not save a non-empty book at
// all. Both ENDS were verified; the SEAM was not. Everything below is about the seam:
//
//   1. the page never sent the per-row `version` 75_ requires, so every save of a non-empty book was
//      refused — one FX_VERSION_INVALID per row. An EMPTY book saved perfectly, because `rates: []` has
//      no entries to validate, which is exactly why nothing noticed;
//   2. and the refusal it produced contained the word VERSION, which the page's conflict test matched
//      on a substring — so the operator was told a colleague had saved over them, every time, and sent
//      away to reload instead of toward the field at fault;
//   3. a SUCCESSFUL save answers in a different shape from a GET, and the page adopted it as though the
//      fields a save does not carry had come back EMPTY — so success cleared the currency list, blanked
//      the capacity meter and revoked may_edit, and the reward for saving was a read-only page claiming
//      an authority failure that had not happened;
//   4. the change log read changed_at / changed_by / old_rate / new_rate, none of which 75_ has ever
//      emitted, so every cell of every entry was blank.
//
// THE COUNTER-EXAMPLES ARE REAL CODE, NOT SYNTHETIC MUTANTS. before.json was taken against the page as
// FX1-R4 shipped it, and masked.json against that page with ONLY the row-version repair applied — which
// is what it takes to see defects 3 and 4 at all, because a save that is always refused can never reach
// them. A mutation harness would have had to invent those two states; they are the states the code was
// actually in.
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var GSDIR = path.join(ROOT, 'assets/specs/active/apps-script');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var EVDIR = path.join(ROOT, 'docs/evidence/fx1-r4r1-roundtrip');
function cap(n) { return JSON.parse(fs.readFileSync(path.join(EVDIR, n + '.json'), 'utf8')); }
var BEFORE = cap('before'), MASKED = cap('masked'), AFTER = cap('after'), RO = cap('unidentified');
function phases(c) { var m = {}; ((c.result && c.result.phases) || []).forEach(function (p) { m[p.label] = p; }); return m; }
var B = phases(BEFORE), M = phases(MASKED), A = phases(AFTER), R = phases(RO);
function saves(c) { return (c.serverCalls || []).filter(function (x) { return x.action === 'fxRateBook.save'; }); }

// ===================================================================================================
section('A. the three captures are the SAME experiment run against three states of one file');
// ===================================================================================================
var RUNNER = 'assets/tests/_fx1-r4r1-roundtrip-runner.js';
var PAGE = 'assets/js/pages/fx-rate-book.js';
eq([BEFORE.sources[RUNNER], MASKED.sources[RUNNER], AFTER.sources[RUNNER], RO.sources[RUNNER]]
    .filter(function (h) { return h === AFTER.sources[RUNNER]; }).length, 4,
  'A1  all four captures were driven by the same harness');
ok(AFTER.sources[RUNNER] && AFTER.sources[RUNNER].length === 16,
  'A1a and the harness hash is a real hash, not an absent field comparing equal to itself', AFTER.sources[RUNNER]);
ok(BEFORE.sources[PAGE] !== MASKED.sources[PAGE] && MASKED.sources[PAGE] !== AFTER.sources[PAGE]
   && BEFORE.sources[PAGE] !== AFTER.sources[PAGE],
  'A2  and against three DIFFERENT versions of the page — otherwise the comparison is of one thing to itself');
eq(AFTER.sources[PAGE], require('crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, PAGE))).digest('hex').slice(0, 16),
  'A3  the AFTER capture was taken against the page as it stands in this tree');
eq(RO.sources[PAGE], AFTER.sources[PAGE], 'A3a and so was the unidentified-caller capture');
eq(AFTER.sources['assets/js/api/operation-system-db-api.js'], require('crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, 'assets/js/api/operation-system-db-api.js'))).digest('hex').slice(0, 16),
  'A4  and against the adapter as it stands');
eq([BEFORE.result.fatal, MASKED.result.fatal, AFTER.result.fatal, RO.result.fatal], [null, null, null, null],
  'A5  none of the four runs died partway — a capture that stopped early proves nothing about what follows');

// ===================================================================================================
section('B. BEFORE — a non-empty book could not be saved AT ALL, and the server says why');
// ===================================================================================================
var bSaves = saves(BEFORE);
ok(bSaves.length >= 3, 'B1  the before run attempted at least three saves', bSaves.length);
eq(bSaves.filter(function (s) { return s.ok; }).length, 0,
  'B2  and not one of them was accepted');
ok(bSaves.slice(0, 3).every(function (s) { return (s.sentRowVersions || []).every(function (v) { return v === '<<missing>>'; }); }),
  'B3  every row reached the server with NO version field — the server\'s own record of the request',
  bSaves.map(function (s) { return s.sentRowVersions; }));
ok(bSaves[0].errorCodes.filter(function (c) { return c === 'FX_VERSION_INVALID'; }).length === bSaves[0].sentRowCount,
  'B4  and 75_ refused it once per row, which is what a missing REQUIRED field looks like',
  bSaves[0].errorCodes);
// THE BOOK WAS NEVER TOUCHED. "Refused" has to mean nothing was written, not merely that a message was shown.
eq(BEFORE.finalStored.rates.length, BEFORE.seed.rates,
  'B5  the stored book still holds exactly the seeded rows');
eq(B['reloaded'].stateRows, BEFORE.seed.rates,
  'B6  and a reload brings back the seeded book, so the operator\'s work was lost in full');
ok(B['opened'].stateVersions.every(function (v) { return v === '<<missing>>'; }),
  'B7  the version was lost on the way IN, not on the way out — the page never held one to send',
  B['opened'].stateVersions);

// ===================================================================================================
section('C. BEFORE — and the page blamed a colleague for its own missing field');
// ===================================================================================================
ok(/somebody else saved/i.test(String(B['saved-1'].domSaveState)),
  'C1  a plain FX_VERSION_INVALID was announced as a competing editor', B['saved-1'].domSaveState);
eq(B['saved-1'].warnCodes, ['FX_VERSION_INVALID'],
  'C1a while the code on screen was the one that contradicts that message');
ok(/somebody else saved/i.test(String(B['conflict'].domSaveState)),
  'C2  the SAME sentence is correct for a real conflict — which is why the substring test looked right');
eq(B['conflict'].warnCodes, ['FX_VERSION_CONFLICT'],
  'C2a and a real conflict really did occur in the before run, staged server-side');
// THE ONE THAT WAS ALREADY RIGHT. A non-VERSION refusal kept its own reason even before this round, and
// saying otherwise would be claiming a fix for something that was not broken.
ok(!/somebody else saved/i.test(String(B['invalid-not-conflict'].domSaveState)),
  'C3  a non-VERSION validation refusal was NOT mis-announced even before the fix — the defect was the '
  + 'substring, not the whole classification');

// ===================================================================================================
section('D. MASKED — with the version repaired and nothing else, saving works and BREAKS the page');
// ===================================================================================================
// This capture exists because defects 3 and 4 are UNREACHABLE while defect 1 stands: a save that is
// always refused never produces a success envelope to mis-adopt and never writes a log entry to render.
var mSaves = saves(MASKED);
ok(mSaves.length >= 1 && mSaves[0].ok,
  'D1  the row-version repair alone makes a non-empty book savable', mSaves[0] && mSaves[0].errorCodes);
eq(mSaves[0].sentRowVersions, [2, 1],
  'D1a and the versions it sends are the ones the server stored, not invented ones');
ok(M['opened'].mayEdit === true && M['saved-1'].mayEdit === false,
  'D2  and the moment it succeeds the page revokes its own edit rights');
ok(M['opened'].currencies > 0 && M['saved-1'].currencies === 0,
  'D3  the supported-currency list is emptied by success',
  [M['opened'].currencies, M['saved-1'].currencies]);
ok(M['opened'].capacityState && M['saved-1'].capacityState === null,
  'D4  the capacity meter is blanked by success',
  [M['opened'].capacityState, M['saved-1'].capacityState]);
ok(M['saved-1'].domSaveDisabled === true && M['saved-1'].domAuthorityVisible === true,
  'D5  and the read-only band appears, naming an authority failure that did not happen');
ok(!M['continued'], 'D6  so "continue editing after a save" is not merely awkward — it is unreachable');
// THE LOG, RENDERED FROM FIELDS THAT DO NOT EXIST.
ok(M['reloaded'].domLogRows > 0, 'D7  a change record did reach the page');
ok((M['reloaded'].domLogFirstRow || []).filter(function (c) { return c === ''; }).length >= 2,
  'D8  and it rendered with blank cells where WHEN and WHO belong', M['reloaded'].domLogFirstRow);
ok((M['reloaded'].domLogFirstRow || []).filter(function (c) { return c === '—'; }).length >= 2,
  'D9  with the two value columns showing the placeholder for "nothing here"', M['reloaded'].domLogFirstRow);

// ===================================================================================================
section('E. AFTER — save, keep editing, save again, reload, remove, save');
// ===================================================================================================
var aSaves = saves(AFTER);
ok(aSaves.length >= 3 && aSaves.slice(0, 3).every(function (s) { return s.ok; }),
  'E1  three consecutive saves from ONE page load were all accepted',
  aSaves.map(function (s) { return [s.ok, s.errorCodes]; }));
eq([A['opened'].docVersion, A['saved-1'].docVersion, A['saved-2'].docVersion, A['saved-3'].docVersion],
  [3, 4, 5, 6], 'E2  and the version advanced once per save, with no reload in between');
eq([A['opened'].stateRows, A['continued'].stateRows, A['saved-2'].stateRows, A['saved-3'].stateRows],
  [2, 3, 3, 2], 'E3  two rows, a pair added, saved, then a pair removed and saved');
// THE THREE THINGS A SUCCESSFUL SAVE USED TO DESTROY.
ok(A['saved-1'].mayEdit && A['saved-2'].mayEdit && A['saved-3'].mayEdit,
  'E4  may_edit survives every success — a save that worked is proof of permission, not a reason to withdraw it');
eq([A['opened'].currencies, A['saved-1'].currencies, A['saved-2'].currencies],
  [8, 8, 8], 'E5  the currency list is untouched by a save answer that does not carry one');
ok(A['saved-1'].domSaveDisabled === false && A['saved-1'].domAuthorityVisible === false,
  'E6  the editor stays live and no read-only band appears');
// THE CAPACITY METER IS UPDATED, NOT MERELY PRESERVED — the stored size really did change.
var capN = function (p) { return Number(String(p.capacityState).split('/')[0]); };
ok(capN(A['saved-1']) > capN(A['opened']) && capN(A['saved-2']) > capN(A['saved-1']),
  'E7  and the capacity meter MOVES with each save, read from the bytes the commit measured',
  [A['opened'].capacityState, A['saved-1'].capacityState, A['saved-2'].capacityState]);
// THE RELOAD: what the server really holds, as opposed to what the page believes.
eq(A['reloaded'].stateRows, 3, 'E8  a reload finds the three rows the page saved');
eq(String(A['reloaded'].domRateValue), '159.5', 'E9  including the edited rate, which survived the round trip');
eq(A['reloaded'].stateVersions, [2, 1, 1],
  'E10 and each row carries a version: the two that came back, and 1 for the pair just added');
eq(AFTER.finalStored.rates.length, 2, 'E11 the store ends holding the two rows the last save left');

// ===================================================================================================
section('F. AFTER — the change log says who, when, and what moved, for all three kinds');
// ===================================================================================================
eq(AFTER.finalStored.log.map(function (l) { return l.change; }), ['EDITED', 'EDITED', 'ADDED', 'REMOVED'],
  'F1  the stored history covers an edit, an addition and a removal');
var top = A['saved-3'].domLogFirstRow || [];
eq(top.length, 5, 'F2  the newest entry renders five columns');
ok(top.every(function (c) { return c !== '' && c !== null && c !== undefined; }),
  'F3  none of them blank — which is the whole of what was wrong before', top);
eq(top[3], 'REMOVED', 'F4  the newest entry is the removal that was just saved');
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/.test(top[0]),
  'F5  WHEN is the server instant, rendered unambiguously rather than in a browser-local guess', top[0]);
// NOT `eq`, WHICH WOULD PRINT IT. The sweep's secret scanner refuses a suite whose OUTPUT carries an
// address, and it is right to: a fixture identity in a regression log is still an address in a log, and
// a scanner that made an exception for addresses it judged harmless would be making that judgement on
// every future one too. The comparison is unchanged; only the reporting is masked.
function maskAddr(v) { return String(v == null ? '' : v).replace(/^(.)[^@]*@(.).*$/, '$1***@$2***'); }
ok(top[1] === AFTER.identity && /@/.test(String(AFTER.identity)),
  'F6  WHO is the identity the SERVER established for this caller',
  [maskAddr(top[1]), maskAddr(AFTER.identity)]);
ok(/USD>/.test(top[2]), 'F7  and the pair it happened to is named', top[2]);
var edited = (A['saved-3'].domLogCells || []).filter(function (c) { return c[3] === 'EDITED'; });
ok(edited.length >= 2, 'F8  the edits are rendered too', edited.length);
ok(edited.some(function (c) { return /rate\s+158\.02\s*→\s*159\.5/.test(c[4]); }),
  'F9  an EDIT shows the field, the value it had and the value it has — the question a log is kept for',
  edited.map(function (c) { return c[4]; }));
var added = (A['saved-3'].domLogCells || []).filter(function (c) { return c[3] === 'ADDED'; });
ok(added.length >= 1 && /rate/.test(added[0][4]) && /status/.test(added[0][4]),
  'F10 and an ADDED pair shows what it was created with', added[0] && added[0][4]);

// ===================================================================================================
section('G. AFTER — a conflict is named by its own code, and nothing else is');
// ===================================================================================================
eq(A['conflict'].warnCodes, ['FX_VERSION_CONFLICT'],
  'G1  a save against a book somebody else moved is refused as a conflict');
ok(/somebody else saved/i.test(String(A['conflict'].domSaveState)),
  'G2  and THAT is the one case the competing-editor sentence belongs to');
eq(AFTER.competingSaves, 1, 'G2a staged server-side, so the page could not have known it was coming');
ok(A['invalid-not-conflict'].warnCodes.indexOf('FX_EFFECTIVE_RANGE_INVERTED') !== -1,
  'G3  a validation refusal keeps its own reason', A['invalid-not-conflict'].warnCodes);
ok(!/somebody else saved/i.test(String(A['invalid-not-conflict'].domSaveState)),
  'G4  and is not announced as a competing editor');
ok(A['invalid-not-conflict'].warnCodes.length >= 2,
  'G5  every problem the server reported is shown, not only the first — a book with four bad rows must '
  + 'not report one and leave the rest to be found by saving again',
  A['invalid-not-conflict'].warnCodes);

// ===================================================================================================
section('H. an UNIDENTIFIABLE caller: read-only, said out loud, and zero requests');
// ===================================================================================================
eq(R['opened'].mayEdit, false, 'H1  a deployment that cannot name its caller does not get edit rights');
eq(R['opened'].authorityReason, 'FX_AUTHORITY_UNVERIFIABLE',
  'H2  and the refusal is named rather than shown as a dead button');
ok(/Read-only/i.test(String(R['opened'].domAuthorityText)) && /FX_AUTHORITY_UNVERIFIABLE/.test(String(R['opened'].domAuthorityText)),
  'H2a the band quotes the server\'s own code', R['opened'].domAuthorityText);
eq([R['opened'].domSaveDisabled, R['opened'].domAddDisabled, R['opened'].domRemoveButtons],
  [true, true, 0], 'H3  save, add and remove are all unavailable');
eq(saves(RO).length, 0,
  'H4  and no save request reached the server at all — the refusal is not merely a message after one');
eq(RO.finalStored.doc_version, 3, 'H5  the stored book never moved from the seed');
// READING IS NOT GATED ON WRITING, and that is a decision rather than an oversight.
ok(R['opened'].domRows > 0 && R['opened'].currencies > 0,
  'H6  the rates are still shown: seeing what prices the catalogue is not the same permission as changing it');

// ===================================================================================================
section('I. the shipped page, read as source — the four repairs are in the file, not only in a capture');
// ===================================================================================================
var PAGESRC = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
var PAGECODE = PAGESRC.split(/\r?\n/).filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n');
ok(/function legalVersion\(/.test(PAGECODE) && /function workingRow\(/.test(PAGECODE),
  'I1  a row builder and a version rule exist as named functions');
ok(/Object\.keys\(e \|\| \{\}\)\.forEach/.test(PAGECODE),
  'I2  and the builder carries EVERY stored field, not only the columns this editor draws');
ok(/status: 'active', version: 1/.test(PAGECODE), 'I3  a new row is born with a legal version');
ok(/_state\.rates = _state\.serverRates\.map\(workingRow\)/.test(PAGECODE)
   && /rows\.map\(workingRow\)/.test(PAGECODE),
  'I4  the stored rows AND the prepared draft both go through it — the draft file carries versions too, '
  + 'and rebuilding it from the drawn columns made the starting set unsavable for the same reason');
ok(/String\(e && e\.code\) === 'FX_VERSION_CONFLICT'/.test(PAGECODE),
  'I5  the conflict test compares the whole code');
ok(!/\/VERSION\/i\.test/.test(PAGECODE),
  'I6  and the substring test that also matched FX_VERSION_INVALID is gone');
ok(/function adopt\(data, opts\)/.test(PAGECODE) && /var fresh = !!\(opts && opts\.fresh\)/.test(PAGECODE),
  'I7  adopt() distinguishes the answer that establishes the page from the one that updates it');
ok(/adopt\(res\.data \|\| \{\}, \{ fresh: true \}\)/.test(PAGECODE),
  'I8  the GET is the fresh one');
ok(/data\.may_edit !== undefined/.test(PAGECODE) && /data\.supported_currencies !== undefined/.test(PAGECODE),
  'I9  and a field a SAVE does not carry is left alone rather than read as empty');
ok(/r\.at/.test(PAGECODE) && /r\.by/.test(PAGECODE) && /r\.fields/.test(PAGECODE) && /r\.change/.test(PAGECODE),
  'I10 the change log reads the fields 75_ emits');
ok(!/changed_at|changed_by|old_rate|new_rate/.test(PAGECODE),
  'I11 and none of the four it does not');
// THE PAGE STILL DECIDES NOTHING. Every repair above is about carrying the server's answer faithfully;
// none of them is a rule moving into the browser, and that boundary is the reason 75_ can be trusted.
ok(!/pricingBuildRateTable_|fxBookResolve_|FX_PERIOD_OVERLAP|pricingDecimalsFor_/.test(PAGECODE),
  'I12 and no validation rule has moved into the browser alongside them');

// ===================================================================================================
section('J. the SHIPPED 04_ handler, executed — the coefficient the page saved prices a new SKU');
// ===================================================================================================
// verify-04-wiring.js executes the row PLANNER. This runs the whole handler, with an in-memory
// spreadsheet, because "the planner computes the right number" and "a pricing_list row is written with
// it" are different claims and only the second one is what an operator sees.
function fnOf(src, name) {
  var i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) throw new Error('fn not found: ' + name);
  var d = 0, st = false;
  for (var j = i; j < src.length; j++) {
    var c = src[j];
    if (c === '{') { d++; st = true; } else if (c === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unterminated ' + name);
}
function varOf(src, decl) {
  var i = src.indexOf(decl);
  if (i < 0) throw new Error('var not found: ' + decl);
  var d = 0;
  for (var j = i; j < src.length; j++) {
    var c = src[j];
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
    else if (c === ';' && d === 0) return src.slice(i, j + 1);
  }
  throw new Error('unterminated declaration ' + decl);
}
var IR04 = fs.readFileSync(path.join(GSDIR, '04_marketplace_forecast_import.gs'), 'utf8');
var IR75 = fs.readFileSync(path.join(GSDIR, '75_api_v1_fx_rate_book.gs'), 'utf8');
var IR73 = fs.readFileSync(path.join(GSDIR, '73_api_v1_pricing_write.gs'), 'utf8');

// THE FIXTURE'S HEADERS ARE THE HANDLER'S OWN REQUIREMENT LIST, lifted out of the shipped source. Hard
// coding them would let a schema change pass here and fail in production — a fixture that cannot drift
// is worth more than one that is easy to read.
var REQ = new Function('return (' + varOf(IR04, 'var requiredHeaders = ')
  .replace(/^var requiredHeaders = /, '').replace(/;$/, '') + ');')();
var EXTRA = { sku_details: ['base_currency', 'asin'],
  marketplace_skus: ['fulfillment_model', 'created_by', 'updated_by'],
  pricing_list: [], fc_regular_forecast: [] };
var HEADERS = {};
Object.keys(REQ).forEach(function (k) { HEADERS[k] = REQ[k].concat(EXTRA[k] || []); });
HEADERS.marketplaces = ['marketplace_id', 'company', 'country', 'marketplace', 'currency', 'status'];

function makeSheet(name, rows) {
  var grid = rows.map(function (r) { return r.slice(); });
  var api = {
    __name: name, __grid: grid, __appends: [], __writes: [],
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return (grid[0] || []).length; },
    getRange: function (r, c, nr, nc) {
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < (nr || 1); i++) { var row = grid[r - 1 + i] || []; out.push(row.slice(c - 1, c - 1 + (nc || 1))); }
          return out;
        },
        setValue: function (v) { while (grid.length < r) grid.push([]); grid[r - 1][c - 1] = v; api.__writes.push({ sheet: name, r: r, c: c, v: v }); },
        setValues: function (vals) {
          vals.forEach(function (rowv, i) {
            while (grid.length < r + i) grid.push([]);
            rowv.forEach(function (v, k) { grid[r - 1 + i][c - 1 + k] = v; });
          });
          api.__writes.push({ sheet: name, r: r, c: c, bulk: vals.length });
        }
      };
    },
    appendRow: function (arr) { grid.push(arr.slice()); api.__appends.push(arr.slice()); }
  };
  return api;
}
function makeSS(extra) {
  var sheets = {};
  Object.keys(HEADERS).forEach(function (n) {
    sheets[n] = makeSheet(n, [HEADERS[n].slice()].concat((extra && extra[n]) || []));
  });
  return { getSheetByName: function (n) { return sheets[n] || null; }, __sheets: sheets };
}
// TWO NAMED STUBS, AND WHAT THEY CANNOT AFFECT. skuRegionalLookup_ answers "no regional override" (the
// fixture has no sku_regional_details row, which is the ordinary case) and skuRegionalSyncIdentity_ is
// already wrapped in a try/catch by the handler. Neither touches pricing_list, so neither can move a
// number this section asserts on — and K4 checks they were called, so they are not silently unreachable.
function build(ss, props) {
  var SANDBOX = [
    fnOf(IR73, 'pricingStr_'), varOf(IR73, 'var PRICING_FX_DECIMALS_'), fnOf(IR73, 'pricingDecimalsFor_'),
    fnOf(IR73, 'pricingRoundFx_'), fnOf(IR73, 'pricingFxPairKey_'),
    varOf(IR75, 'var FX_BOOK_PROP_KEY_'), varOf(IR75, 'var FX_BOOK_DOC_SHAPE_'),
    fnOf(IR75, 'fxBookReadDoc_'), fnOf(IR75, 'fxBookResolve_'),
    fnOf(IR75, 'fxBookSnapshotForImport_'), fnOf(IR75, 'fxBookRateFromSnapshot_'), fnOf(IR75, 'fxBookDefaultIo_'),
    varOf(IR04, 'var PRICING_CREATE_PENDING_STATUS_'), varOf(IR04, 'var PRICING_CREATE_BANDS_'),
    fnOf(IR04, 'pricingNewRowPlan_'),
    fnOf(IR04, 'handleImportMarketplaceSkusBatch_')
  ].join('\n');
  var PRELUDE = [
    'var __calls = [], __uuid = 0;',
    'var SpreadsheetApp = { getActiveSpreadsheet: function () { return __ss; } };',
    'var Utilities = { formatDate: function () { return __today; },',
    '  getUuid: function () { __uuid++; return "uuid" + __uuid + "-0000-0000-0000-000000000000"; } };',
    'var Session = { getScriptTimeZone: function () { return "UTC"; } };',
    'var PropertiesService = { getScriptProperties: function () { return {',
    '  getProperty: function (k) { return Object.prototype.hasOwnProperty.call(__props, k) ? __props[k] : null; },',
    '  setProperty: function (k, v) { __props[k] = String(v); } }; } };',
    'function jsonResponse_(o) { return o; }',
    'function skuRegionalLookup_() { __calls.push("skuRegionalLookup_"); return null; }',
    'function skuRegionalSyncIdentity_() { __calls.push("skuRegionalSyncIdentity_"); }'
  ].join('\n');
  return new Function('__ss', '__props', '__today', PRELUDE + '\n' + SANDBOX
    + '\nreturn { handler: handleImportMarketplaceSkusBatch_, calls: function () { return __calls; } };')(ss, props, '2026-10-20');
}
function prRow(ss, n) {
  var r = ss.__sheets.pricing_list.__appends[n || 0], o = {};
  if (!r) return null;
  HEADERS.pricing_list.forEach(function (h, i) { o[h] = r[i]; });
  return o;
}

// THE BOOK IS THE ONE THE ROUND TRIP ACTUALLY LEFT BEHIND. Not a fixture written beside it — the exact
// bytes the Administration page committed to the store in after.json, parsed here and handed to 04_'s
// Property reader unmodified. That is what makes "the coefficient the page saved" a chain rather than
// two similar numbers sitting next to each other.
var SAVED_BOOK = JSON.parse(AFTER.finalStoredRaw);
var SAVED_EUR = SAVED_BOOK.rates.filter(function (r) { return r.quote_currency === 'EUR'; })[0];
ok(!!SAVED_EUR, 'J1  the pair the operator ADDED on the page is in the stored book', SAVED_BOOK.rates.map(function (r) { return r.quote_currency; }));
eq(SAVED_EUR.rate, 0.92, 'J1a at the coefficient they typed');
eq(SAVED_EUR.version, 1, 'J1b carrying the per-row version the page supplied for a new pair');

function runImport(book, rows, extraSheets) {
  var props = {};
  if (book) props.KM_FX_RATE_BOOK = JSON.stringify(book);
  var ss = makeSS(Object.assign({
    sku_details: [['KM-FX-1', 'cat', 'ser', 100, 80, 120, 'USD', '']],
    marketplaces: [['MP-DE-AMZ', 'KM', 'DE', 'Amazon', 'EUR', 'active'],
                   ['MP-JP-AMZ', 'KM', 'JP', 'Amazon', 'JPY', 'active']]
  }, extraSheets || {}));
  var api = build(ss, props);
  var res = api.handler({ rows: rows, options: { createdBy: 'fx1-r4-r1' } });
  return { res: res, ss: ss, props: props, calls: api.calls() };
}
var EUR_ROW = { sku: 'KM-FX-1', company: 'KM', country: 'DE', marketplace: 'Amazon',
  site_sku: 'DE-KM-FX-1', currency: 'EUR' };

var J = runImport(SAVED_BOOK, [EUR_ROW]);
eq(J.res.success, true, 'J2  the real handler ran and created the SKU', J.res.error);
eq(J.res.data.fx.doc_version, SAVED_BOOK.doc_version,
  'J3  and reported the book version the whole batch was priced at');
var row = prRow(J.ss);
eq(row.fx_rate, 0.92, 'J4  the pricing_list row carries the coefficient the page saved');
eq(row.base_regular_price, 100, 'J5  with the base price from sku_details');
eq(row.auto_regular_price, 92, 'J6  and the local price is base x rate at EUR precision — 100 x 0.92');
eq(row.auto_minimum_price, 73.6, 'J6a the minimum follows the same rate');
eq(row.auto_msrp, 110.4, 'J6b and so does the MSRP');
eq(row.currency, 'EUR', 'J7  in the site currency');
eq(row.base_currency, 'USD', 'J7a against the master row\'s base currency');
ok(!/pending_fx/.test(String(row.note || '')), 'J8  and the row is NOT pending_fx — it has a rate', row.note);
eq(row.price_status, 'draft', 'J9  created as a DRAFT: a coefficient arriving does not publish a price');

// ===================================================================================================
section('K. the rules that must hold while it does that');
// ===================================================================================================
// NO COEFFICIENT -> PENDING, NEVER ZERO. A blank price an operator can see is recoverable; a zero that
// looks like a price is not.
var noJpy = { shape: 1, doc_version: SAVED_BOOK.doc_version, log: [],
  rates: SAVED_BOOK.rates.filter(function (r) { return r.quote_currency === 'EUR'; }) };
var K = runImport(noJpy, [{ sku: 'KM-FX-1', company: 'KM', country: 'JP', marketplace: 'Amazon',
  site_sku: 'JP-KM-FX-1', currency: 'JPY' }]);
eq(K.res.success, true, 'K1  a pair the book does not hold does not fail the import');
var kr = prRow(K.ss);
eq([kr.fx_rate, kr.auto_regular_price, kr.auto_minimum_price, kr.auto_msrp], ['', '', '', ''],
  'K2  the rate and every derived price are BLANK');
eq(kr.price_status, 'pending_fx',
  'K2a the row is STATUSED pending_fx — a state the next reconciliation can find, not a note somebody '
  + 'has to read');
ok(/No FX rate exists for USD>JPY/.test(String(kr.note)) && /intentionally blank/.test(String(kr.note)),
  'K2b and the note names the missing pair and says the blanks are deliberate', kr.note);
eq(K.res.data.results[0].pricing_pending_fx, 'NO_CANONICAL_FX_RATE',
  'K2c while the caller is told the REASON in the response, rather than having to parse prose');
ok([kr.fx_rate, kr.auto_regular_price, kr.auto_msrp].every(function (v) { return v !== 0 && v !== '0'; }),
  'K3  nothing anywhere is zero — a zero price is a price, and nobody stated one');
eq(kr.base_regular_price, 100, 'K3a while the BASE price is still recorded, so a reconciliation has something to work from');

// THE BOOK IS UNREADABLE — a different thing from a pair being absent, and it must not stop a SKU existing.
var corrupt = runImport(null, [EUR_ROW]);
corrupt.props.KM_FX_RATE_BOOK = '{not json';
var corrupt2 = (function () {
  var props = { KM_FX_RATE_BOOK: '{not json' };
  var ss = makeSS({ sku_details: [['KM-FX-1', 'cat', 'ser', 100, 80, 120, 'USD', '']],
    marketplaces: [['MP-DE-AMZ', 'KM', 'DE', 'Amazon', 'EUR', 'active']] });
  var api = build(ss, props);
  return { res: api.handler({ rows: [EUR_ROW], options: { createdBy: 'fx1-r4-r1' } }), ss: ss };
}());
eq(corrupt2.res.success, true, 'K4  a corrupt rate book does not fail the import');
eq(corrupt2.res.data.fx.readable, false, 'K4a it is reported unreadable rather than reported as empty');
eq(prRow(corrupt2.ss).price_status, 'pending_fx', 'K4b and the row goes pending_fx');
// WHERE THE TWO CASES ARE TOLD APART, AND WHERE THEY ARE NOT. The ROW's reason is NO_CANONICAL_FX_RATE
// in both — a corrupt book and a book without this pair leave the same blank, and from the row's point
// of view that is the same fact. The difference is a property of the BOOK, not of a row, so it is
// reported once per batch: `readable` is false for the corrupt book and true for the one that simply
// does not hold USD>JPY. Asserting both is what keeps that from being read as an oversight.
eq(corrupt2.res.data.results[0].pricing_pending_fx, 'NO_CANONICAL_FX_RATE',
  'K4c the ROW reports the same blank either way, because from the row it is the same blank');
eq([corrupt2.res.data.fx.readable, K.res.data.fx.readable], [false, true],
  'K4d and the BATCH distinguishes them — one is a configuration fault to fix on the Administration '
  + 'page, the other is an ordinary pair nobody has entered yet');
eq(corrupt2.res.data.fx.doc_version, null,
  'K4e an unreadable book reports no version, rather than a 0 that would read as "the empty book"');
// AND A PRICED ROW CARRIES ITS PROVENANCE. The version a row was priced at is written into the note, so
// a price can be traced to the book that produced it without re-deriving anything.
ok(new RegExp('rate book v' + SAVED_BOOK.doc_version).test(String(row.note)),
  'K4f a priced row records WHICH version of the book priced it', row.note);

// THE WHOLE BATCH AT ONE VERSION. A save landing mid-import must not split a batch.
var moving = (function () {
  var props = { KM_FX_RATE_BOOK: JSON.stringify(SAVED_BOOK) };
  var ss = makeSS({ sku_details: [['KM-FX-1', 'cat', 'ser', 100, 80, 120, 'USD', ''],
                                  ['KM-FX-2', 'cat', 'ser', 200, 160, 240, 'USD', '']],
    marketplaces: [['MP-DE-AMZ', 'KM', 'DE', 'Amazon', 'EUR', 'active']] });
  var api = build(ss, props);
  // The property is replaced while the handler is NOT running; the claim is that the snapshot taken at
  // the top of the batch is what every row resolves from, so a reader that went back to storage would
  // have to be caught by a read DURING the run. appendRow is the per-row event, so the swap rides on it.
  var swapped = false;
  var prSheet = ss.__sheets.pricing_list;
  var realAppend = prSheet.appendRow;
  prSheet.appendRow = function (arr) {
    realAppend.call(prSheet, arr);
    if (!swapped) {
      swapped = true;
      props.KM_FX_RATE_BOOK = JSON.stringify({ shape: 1, doc_version: 99, log: [],
        rates: [{ base_currency: 'USD', quote_currency: 'EUR', rate: 9.99, source: 'competing',
          as_of: '2026-10-20', effective_from: '2026-10-20', effective_to: '', status: 'active', version: 1 }] });
    }
  };
  var res = api.handler({ rows: [EUR_ROW,
    { sku: 'KM-FX-2', company: 'KM', country: 'DE', marketplace: 'Amazon', site_sku: 'DE-KM-FX-2', currency: 'EUR' }],
    options: { createdBy: 'fx1-r4-r1' } });
  return { res: res, ss: ss, swapped: swapped };
}());
eq(moving.swapped, true, 'K5  the book really was replaced partway through the batch');
eq(moving.res.data.fx.doc_version, SAVED_BOOK.doc_version,
  'K5a and the batch still reports the ONE version it started with, not 99');
eq([prRow(moving.ss, 0).fx_rate, prRow(moving.ss, 1).fx_rate], [0.92, 0.92],
  'K6  both rows priced at the same coefficient — the row after the swap did not pick up 9.99');
eq(prRow(moving.ss, 1).auto_regular_price, 184,
  'K6a 200 x 0.92, not 200 x 9.99: a batch split down the middle is the defect FX1-R4 closed and this '
  + 'is the executed proof it stayed closed');

// OWNERSHIP: AN EXISTING PRICED ROW IS NOT REPRICED. Saving a coefficient changes what the NEXT creation
// reads; it can never move a price a person set by hand.
var existing = (function () {
  var props = { KM_FX_RATE_BOOK: JSON.stringify(SAVED_BOOK) };
  var prExisting = [];
  HEADERS.pricing_list.forEach(function (h) {
    var v = '';
    if (h === 'pricing_id') v = 'PRC-EXISTING';
    if (h === 'marketplace_sku_id') v = 'MPSKU-DE-AMA-KM-FX-1';
    if (h === 'sku') v = 'KM-FX-1';
    if (h === 'country') v = 'DE';
    if (h === 'marketplace') v = 'Amazon';
    if (h === 'currency') v = 'EUR';
    if (h === 'base_currency') v = 'USD';
    if (h === 'fx_rate') v = 0.5;
    if (h === 'regular_price') v = 49.99;
    if (h === 'auto_regular_price') v = 50;
    if (h === 'price_source') v = 'manual';
    if (h === 'price_status') v = 'published';
    prExisting.push(v);
  });
  var mpExisting = [];
  HEADERS.marketplace_skus.forEach(function (h) {
    var v = '';
    if (h === 'marketplace_sku_id') v = 'MPSKU-DE-AMA-KM-FX-1';
    if (h === 'sku') v = 'KM-FX-1';
    if (h === 'company') v = 'KM';
    if (h === 'country') v = 'DE';
    if (h === 'marketplace') v = 'Amazon';
    if (h === 'currency') v = 'EUR';
    if (h === 'site_sku') v = 'DE-KM-FX-1';
    mpExisting.push(v);
  });
  var ss = makeSS({ sku_details: [['KM-FX-1', 'cat', 'ser', 100, 80, 120, 'USD', '']],
    marketplaces: [['MP-DE-AMZ', 'KM', 'DE', 'Amazon', 'EUR', 'active']],
    marketplace_skus: [mpExisting], pricing_list: [prExisting] });
  var api = build(ss, props);
  var res = api.handler({ rows: [EUR_ROW], options: { createdBy: 'fx1-r4-r1' } });
  return { res: res, ss: ss };
}());
eq(existing.ss.__sheets.pricing_list.__appends.length, 0,
  'K7  an import over an existing marketplace_sku adds no pricing_list row');
var prWrites = existing.ss.__sheets.pricing_list.__writes;
var prCol = function (n) { return HEADERS.pricing_list.indexOf(n) + 1; };
var priceCols = ['fx_rate', 'regular_price', 'minimum_price', 'msrp', 'auto_regular_price',
  'auto_minimum_price', 'auto_msrp', 'base_regular_price', 'price_source', 'price_status'].map(prCol);
eq(prWrites.filter(function (w) { return priceCols.indexOf(w.c) !== -1; }).length, 0,
  'K8  and writes NO price column of the row that is already there — ownership is not negotiable, and a '
  + 'rate book arriving is not a reason to move a price somebody set',
  prWrites.map(function (w) { return HEADERS.pricing_list[w.c - 1]; }));
eq(existing.ss.__sheets.pricing_list.__grid[1][prCol('regular_price') - 1], 49.99,
  'K8a the manual price is still exactly what it was');
ok(J.calls.indexOf('skuRegionalLookup_') !== -1,
  'K9  the two named stubs really are on the executed path, so they are not quietly unreachable', J.calls);

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exitCode = 1;
