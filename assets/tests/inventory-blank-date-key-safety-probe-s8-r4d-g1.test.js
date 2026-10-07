// S8-R4D-G1 — the blank-date key-safety probe, proven ZERO-WRITE and proven to measure with the
// SHIPPED predicates rather than with copies of them.
//
// The probe reaches Production data, so its own gates run here rather than nowhere. It is EXECUTED
// against a fake SpreadsheetApp with synthetic source rows — a probe that is only read, not run,
// is a probe whose counting has never been checked.
//
// Run: node assets/tests/inventory-blank-date-key-safety-probe-s8-r4d-g1.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var PROBE_REL = 'assets/tools/apps-script-diagnostics/TEMP_S8_R4D_G1_INVENTORY_BLANK_DATE_KEY_SAFETY.gs';
var GS = 'assets/specs/active/apps-script/';
var pass = 0, fail = 0;
function ok(c, m, d) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.error('FAIL ' + m + (d ? '\n   ' + d : '')); } }
function eq(a, b, m) { var A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m, A === B ? '' : 'expected ' + B + '\n   actual   ' + A); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, ''); }
function section(t) { console.log('\n================ ' + t + ' ================\n'); }

var PROBE = read(PROBE_REL);
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]\/\/.*$/gm, ' ');
}
var PROBE_CODE = stripComments(PROBE);

// ---------------------------------------------------------------------------------------------------
section('P — ZERO WRITE, AND IT IS THE CANONICAL LIST');
// ---------------------------------------------------------------------------------------------------
// The same list every other Production-reaching probe in this repo is held to. Copied, not re-chosen,
// so this probe cannot be held to a weaker standard than the ones before it.
var WRITE_PRIMS = ['setValue', 'setValues', 'appendRow', 'insertRow', 'insertRows', 'deleteRow',
  'deleteRows', 'insertSheet', 'deleteSheet', 'clearContents', 'clear(', 'setFormula', 'setBackground',
  'PropertiesService', 'CacheService', 'DriveApp', 'MailApp', 'GmailApp', 'ScriptApp.newTrigger',
  'Sheets.Spreadsheets.Values.update', 'Sheets.Spreadsheets.Values.append',
  'Sheets.Spreadsheets.batchUpdate'];
eq(WRITE_PRIMS.filter(function (w) { return PROBE_CODE.indexOf(w) !== -1; }), [],
  'P1  WRITE_PRIMITIVE_COUNT = 0 — no sheet write, property, cache, drive, mail or trigger primitive');
ok(/PASTE\s*[·.|-]\s*RUN\s*[·.|-]\s*REPORT\s*[·.|-]\s*REMOVE/i.test(PROBE),
  'P2  the header declares PASTE / RUN / REPORT / REMOVE — it says what it is, in the file itself');
// `sort(` alone also matches an in-memory Array sort of the sampled date list, which mutates nothing
// on a sheet. The pattern names the SHEET receiver, so the gate keeps its meaning rather than its
// wording — and P3a pins the one sort that is legitimately there.
ok(!/\bsetNumberFormat|\bsetFontWeight|\b(sh|sheet|range)\.sort\(|\bhideSheet|\bactivate\(/.test(PROBE_CODE),
  'P3  no formatting, sheet-sorting or sheet-state mutation either — reading is the whole behaviour');
ok(/dl\.sort\(\)/.test(PROBE_CODE),
  'P3a the only sort is an in-memory Array sort of the sampled date list');
eq((PROBE_CODE.match(/getDataRange\(\)/g) || []).length, 1,
  'P4  exactly ONE range read, and it is a read');

// ---------------------------------------------------------------------------------------------------
section('Q — IT MEASURES WITH THE SHIPPED PREDICATES, NOT WITH COPIES');
// ---------------------------------------------------------------------------------------------------
// The D2 benchmark validated headers with its own local copy of the rules and therefore proved only
// that it agreed with itself. This probe must CALL the shipped helpers and must REFUSE without them.
ok(!/function\s+amazonIsBlank_/.test(PROBE) && !/function\s+amazonNormalizeDate_/.test(PROBE),
  'Q1  the probe does not DEFINE the importer predicates — a local copy would measure this file');
ok(/amazonIsBlank_\(/.test(PROBE_CODE) && /amazonNormalizeDate_\(/.test(PROBE_CODE),
  'Q2  it calls them');
ok(!/var IMPORT_CONFIGS\s*=/.test(PROBE) && /IMPORT_CONFIGS\[/.test(PROBE_CODE),
  'Q3  and it reads the SHIPPED IMPORT_CONFIGS rather than hard-coding a source id');
ok(/sourceId/.test(PROBE_CODE) && !/1B2oO9pOwVkLHpPo8utR1De6d50CK8jgntwuVgK_uNPE/.test(PROBE),
  'Q3a no spreadsheet id is literal in the probe — if the config moves, the probe follows it');

// ---------------------------------------------------------------------------------------------------
section('R — EXECUTED: THE REFUSAL');
// ---------------------------------------------------------------------------------------------------
var LOGS = [];
function baseSandbox() {
  var sb = {
    console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number,
    Object: Object, Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat,
    parseInt: parseInt, Error: Error, RegExp: RegExp, Boolean: Boolean,
    Logger: { log: function (m) { LOGS.push(String(m)); } }
  };
  sb.global = sb;
  return sb;
}
(function () {
  var c = vm.createContext(baseSandbox());
  vm.runInContext(PROBE, c, { filename: 'probe' });
  var out = vm.runInContext('s8r4dG1Report', c)();
  ok(out.refusals.length === 1 && /SHIPPED_DEPENDENCY_MISSING/.test(out.refusals[0]),
    'R1  with the importer absent the probe REFUSES — it does not quietly measure with a fallback',
    JSON.stringify(out.refusals));
  ok(out.inventory === null && out.health === null,
    'R1a and it reports no numbers at all, rather than numbers it cannot stand behind');
})();

// ---------------------------------------------------------------------------------------------------
section('S — EXECUTED: THE COUNTING, AGAINST A FAKE SOURCE');
// ---------------------------------------------------------------------------------------------------
// The SHIPPED helpers and the SHIPPED config, sliced out of the deployed files — so the fixture
// exercises the real natural key and the real blank predicate.
var helpers = read(GS + '10_amazon_import_helpers.gs');
var cfgSrc = read(GS + '06_amazon_import_config.gs');
function sliceDecl(src, startsWith) {
  var s = src.replace(/\r\n/g, '\n');
  var i = s.indexOf(startsWith);
  if (i < 0) throw new Error('not found: ' + startsWith);
  var j = s.indexOf('\n];', i);
  if (j < 0) throw new Error('unterminated: ' + startsWith);
  return s.slice(i, j + 3);
}
var IMPORT_CONFIGS_SRC = sliceDecl(cfgSrc, 'var IMPORT_CONFIGS = [');
var BLANK_SRC = helpers.replace(/\r\n/g, '\n').match(/function amazonIsBlank_\([\s\S]*?\}/)[0];
// amazonNormalizeDate_ calls amazonPad2_, so the slice carries it too. A missing transitive helper
// throws on the first real date — a FIXTURE fault that would look exactly like a probe fault.
var PAD2_SRC = helpers.replace(/\r\n/g, '\n').match(/function amazonPad2_\([\s\S]*?\}/)[0];
var NORMDATE_SRC = (function () {
  var s = helpers.replace(/\r\n/g, '\n');
  var i = s.indexOf('function amazonNormalizeDate_(');
  var j = s.indexOf('\n}\n', i);
  return s.slice(i, j + 3);
})();

// A fake source workbook. Values only — the probe may read and nothing else.
function makeSheetApp(byId) {
  return {
    openById: function (id) {
      var tabs = byId[id];
      if (!tabs) return null;
      return {
        getSheetByName: function (n) {
          var values = tabs[n];
          if (!values) return null;
          return { getDataRange: function () { return { getValues: function () { return values; } }; } };
        }
      };
    }
  };
}
function runProbe(byId) {
  var sb = baseSandbox();
  sb.Utilities = { formatDate: function (d, tz, p) {
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  } };
  sb.SpreadsheetApp = makeSheetApp(byId);
  var c = vm.createContext(sb);
  vm.runInContext(IMPORT_CONFIGS_SRC, c, { filename: 'cfg' });
  vm.runInContext(BLANK_SRC, c, { filename: 'blank' });
  vm.runInContext(PAD2_SRC, c, { filename: 'pad2' });
  vm.runInContext(NORMDATE_SRC, c, { filename: 'normdate' });
  vm.runInContext(PROBE, c, { filename: 'probe' });
  return vm.runInContext('s8r4dG1Report', c)();
}
// Read the real source ids out of the real config, so the fixture is keyed the way the probe looks.
var CFGS = (function () { var c = vm.createContext({}); vm.runInContext(IMPORT_CONFIGS_SRC, c); return vm.runInContext('IMPORT_CONFIGS', c); })();
function cfgOf(n) { return CFGS.filter(function (x) { return x.destinationSheetName === n; })[0]; }
var INV = cfgOf('amazon_inventory_snapshot'), HEALTH = cfgOf('amazon_inventory_health_snapshot');
ok(!!INV && !!HEALTH, 'S0  both shipped configs resolve from the deployed file');

// The source carries a Marketplace column that the fieldMap does NOT name. It must be ignored: the
// destination marketplace comes from fixedValues, so it cannot vary and is not a grouping dimension.
var HDR = ['Date', 'Country', 'SKU', 'Marketplace', 'Available'];
function row(d, c, s, m, a) { return [d, c, s, m, a]; }
var SRC_CLEAN = [HDR,
  row('2026-10-06', 'US', 'SKU-1', 'Amazon', 10),
  row('2026-10-06', 'EU', 'SKU-1', 'Amazon', 20),
  row('2026-10-06', 'US', 'SKU-2', 'NotAmazon', 30),   // a different Marketplace value, same identity shape
  row('', 'US', 'SKU-3', 'Amazon', 40),                // blank date, otherwise complete
  row('', '', 'SKU-4', 'Amazon', 50),                  // blank date AND blank country
  ['', '', '', '', '']                                 // an entirely blank padded row
];
var byId = {};
byId[INV.sourceId] = {}; byId[INV.sourceId][INV.sourceSheetName] = SRC_CLEAN;
byId[HEALTH.sourceId] = {}; byId[HEALTH.sourceId][HEALTH.sourceSheetName] = [HDR];
var R = runProbe(byId);
var inv = R.inventory;
eq(R.refusals, [], 'S1  with the importer present the probe runs');
eq(inv.effective_grouping, ['country', 'sku'],
  'S2  the grouping is country + sku — marketplace is config-fixed and is NOT a grouping dimension');
eq(inv.key_fields_from_fixed_values, ['marketplace'],
  'S2a and the probe SAYS marketplace came from fixedValues rather than leaving it implied');
eq(inv.key_fields_unresolved, [], 'S2b every natural-key field resolved to a source or a fixed value');
eq(inv.SOURCE_ROW_COUNT, 5, 'S3  the entirely blank padded row is not counted as a source row');
eq(inv.LOGICAL_IDENTITY_COUNT, 5, 'S3a five distinct country+sku identities');
eq(inv.IDENTITIES_WITH_GT1_DISTINCT_DATES, 0, 'S4  no identity carries two dates in the clean fixture');
eq(inv.MAX_DISTINCT_DATES_PER_IDENTITY, 1, 'S4a max distinct dates = 1');
eq(inv.IDENTITIES_WITH_0_DATE_VALUES, 2, 'S4b the two blank-date identities have ZERO date values');
eq(inv.BLANK_DATE_ROW_COUNT, 2, 'S5  two blank-date rows');
eq(inv.BLANK_DATE_ROWS_OTHERWISE_IMPORTABLE, 1,
  'S5a exactly one of them is otherwise importable — the blank-country row is NOT');
eq(inv.BLANK_DATE_ROWS_WITH_VALID_COUNTRY, 1, 'S5b and the country count agrees');
eq(inv.BLANK_DATE_ROWS_WITH_VALID_SKU, 2, 'S5c both blank-date rows do carry a SKU');

// THE COLLISION CASE — the whole decision gate rests on this count being right.
var SRC_COLLIDE = [HDR,
  row('2026-10-05', 'US', 'SKU-1', 'Amazon', 10),
  row('2026-10-06', 'US', 'SKU-1', 'Amazon', 11),      // same identity, DIFFERENT date
  row('2026-10-06', 'US', 'SKU-1', 'Amazon', 12),      // same identity, SAME date -> not a new distinct
  row('2026-10-06', 'EU', 'SKU-9', 'Amazon', 20)
];
var byId2 = {};
byId2[INV.sourceId] = {}; byId2[INV.sourceId][INV.sourceSheetName] = SRC_COLLIDE;
byId2[HEALTH.sourceId] = {}; byId2[HEALTH.sourceId][HEALTH.sourceSheetName] = [HDR];
var inv2 = runProbe(byId2).inventory;
eq(inv2.IDENTITIES_WITH_GT1_DISTINCT_DATES, 1, 'S6  a two-date identity is COUNTED — the gate can fire');
eq(inv2.MAX_DISTINCT_DATES_PER_IDENTITY, 2, 'S6a and the max is 2, not 3 — a repeated date is not distinct');
eq(inv2.IDENTITIES_WITH_1_DISTINCT_DATE, 1, 'S6b the other identity is clean');
eq(inv2.COLLISION_SAMPLE.length, 1, 'S6c one sample is returned');
eq(inv2.COLLISION_SAMPLE[0].dates, ['2026-10-05', '2026-10-06'], 'S6d naming the dates that collide');

// ---------------------------------------------------------------------------------------------------
section('T — IT DOES NOT DUMP THE SOURCE');
// ---------------------------------------------------------------------------------------------------
var blob = JSON.stringify(inv) + JSON.stringify(inv2);
ok(blob.indexOf('"10"') === -1 && blob.indexOf(':10,') === -1 && blob.indexOf('"Available"') !== -1,
  'T1  quantity VALUES are absent while the header NAME is reported — names are schema, values are data');
ok(!/\b(11|12|20|30|40|50)\b/.test(JSON.stringify(inv2.COLLISION_SAMPLE)),
  'T1a and no quantity reaches the collision sample');
ok(inv.source_header_names.indexOf('Date') !== -1 && inv.source_header_names.length === 5,
  'T2  header names are returned so the mapping can be checked, and nothing else from row 1');
ok(/G1_SAMPLE_MAX_/.test(PROBE_CODE) && /sample\.length < G1_SAMPLE_MAX_/.test(PROBE_CODE),
  'T3  the collision sample is BOUNDED in code, not by hoping the data is small');

// ---------------------------------------------------------------------------------------------------
section('U — THE CONTRACT THIS ROUND MAY NOT CHANGE');
// ---------------------------------------------------------------------------------------------------
var cfgText = cfgSrc.replace(/\r\n/g, '\n');
ok(/destinationSheetName: 'amazon_inventory_snapshot',[\s\S]*?naturalKey: \['snapshot_date', 'country', 'marketplace', 'sku'\]/.test(cfgText),
  'U1  amazon_inventory_snapshot STILL carries snapshot_date in its natural key — G1 measures, it does not change');
ok(/destinationSheetName: 'amazon_inventory_health_snapshot',[\s\S]*?naturalKey: \['snapshot_date', 'country', 'marketplace', 'sku'\]/.test(cfgText),
  'U1a and so does amazon_inventory_health_snapshot');
var runner = read(GS + '07_amazon_import_runner.gs');
ok(/if \(keyMissing\) \{ ctx\.rowsError\+\+; continue; \}/.test(runner),
  'U2  the blank-natural-key row is still SKIPPED — the importer runtime is untouched');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
