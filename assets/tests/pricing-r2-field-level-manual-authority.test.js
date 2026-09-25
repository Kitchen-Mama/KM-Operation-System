// Kitchen Mama Operation System — PRICING-R2 · FIELD-LEVEL MANUAL PRICE AUTHORITY
// =============================================================================================================
// THE ONE THING THIS ROUND DECIDES is who owns a price, per FIELD, and the whole suite is built around the
// ways that decision can be got wrong: guessed from a row-level column, guessed from a blank cell, guessed
// from a price that merely differs from the converted one, or quietly made by a default. Every one of those
// is a test here and a mutant below.
//
//   A  the schema and the model: three columns, three states, and price_source demoted rather than reused
//   B  the three-state flag, agreed between the server and the browser, spelling by spelling
//   C  §12 number safety: blank, NA, 0 and a typo stop being the same number
//   D  per-field planning: MANUAL / USE AUTO / NO_CHANGE, independent, and what is refused rather than guessed
//   E  §9 batch atomicity: one bad line writes nothing, and the handler proves it by executing
//   F  §3 the audit: typed change_type, written only for a change that happened
//   G  §11 the frozen FX precision, and that it never rounds an operator's number
//   H  §2/§13 the effective-price contract and every consumer: unchanged, proven by source
//   I  §4 SKU Details: base_* is NOT a sku_details field, so nothing was invented there
//   J  §8 the template round trip, and that a blank cell is NO_CHANGE rather than AUTO or delete
//   K  §10 the census: counting only, one implementation, and zero ambiguous rows written
//   L  the wiring: route, registry, manifest, contract versions, client pin, release order, cache token
//   O  PRICING-R4: the WHOLE chain, browser template -> file -> server -> sheet -> audit
//   M  mutants
//
// Run: node assets/tests/pricing-r2-field-level-manual-authority.test.js
// NOTE: no 'use strict' — the .gs source is eval'd.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
var GS73_RAW = read('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
var GS01 = readN('assets/specs/active/apps-script/01_router.gs');
var GS59 = readN('assets/specs/active/apps-script/59_api_v1_sku_details_workspace.gs');
var GS63 = readN('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var GS03 = readN('assets/specs/active/apps-script/03_master_data_handlers.gs');
var GS04 = readN('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
var DBAPI = readN('assets/js/api/operation-system-db-api.js');
var PAGE = readN('assets/js/pages/sku-regional-details.js');
var SRP_SRC = readN('assets/js/pages/sku-regional-pricing.js');
var DOC = readN('assets/specs/active/PRICING_DATABASE_MAPPING.md');
var INDEX = read('index.html');
var RELORD = require('./_release-order.js');
var SRP = require('../js/pages/sku-regional-pricing.js');

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(c, l, d) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }

/** Comments AND string literals out: a file's own prose names everything it promises not to do. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

// -------------------------------------------------------------------------------------------------------------
// THE SANDBOX. The shipped .gs is EXECUTED, with the Apps Script surfaces it touches stubbed by hand, so the
// handler's atomicity is measured on the real handler rather than asserted about its source.
// -------------------------------------------------------------------------------------------------------------
function fakeSheet(name, grid) {
  var g = grid.map(function (r) { return r.slice(); });
  var S = {
    __grid: g,
    getName: function () { return name; },
    getLastRow: function () { return g.length; },
    getLastColumn: function () { return g.length ? g[0].length : 0; },
    getDataRange: function () { return { getValues: function () { return g.map(function (r) { return r.slice(); }); } }; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push((g[r - 1 + i] || [])[c - 1 + j]); out.push(row); }
          return out;
        },
        getValue: function () { return (g[r - 1] || [])[c - 1]; },
        setValue: function (v) { while (g.length < r) g.push([]); g[r - 1][c - 1] = v; S.__writes++; },
        setValues: function (vals) {
          for (var i = 0; i < vals.length; i++) {
            while (g.length < r + i) g.push(new Array(g[0].length).fill(''));
            for (var j = 0; j < vals[i].length; j++) g[r - 1 + i][c - 1 + j] = vals[i][j];
          }
          S.__writes += vals.length;
        }
      };
    },
    __writes: 0
  };
  return S;
}

var PRICING_HEADER = ['pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'site_sku',
  'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp',
  'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
  'regular_price', 'minimum_price', 'msrp',
  'regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual',
  'price_source', 'price_status', 'created_by', 'created_at', 'updated_by', 'updated_at', 'note'];
var LOG_HEADER = ['log_id', 'pricing_id', 'field_name', 'old_value', 'new_value', 'change_type', 'changed_by', 'changed_at', 'change_reason'];

/** A pricing row as a grid row, from a { column: value } object. */
function priceRow(o) { return PRICING_HEADER.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; }); }

// The pricing_list every project holds BEFORE the operator migration: no ownership columns at all.
var LEGACY_PRICING_HEADER = PRICING_HEADER.filter(function (h) { return !/_is_manual$/.test(h); });
var LEGACY_ROW = LEGACY_PRICING_HEADER.map(function (h) {
  return ({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD', regular_price: 10, auto_regular_price: 9 })[h] || '';
});

function makeWorld(src, opts) {
  opts = opts || {};
  var header = opts.legacyPriceHeader ? LEGACY_PRICING_HEADER : PRICING_HEADER;
  var priceSheet = fakeSheet('pricing_list', [header].concat(opts.rows || []));
  var logSheet = fakeSheet('pricing_change_log', [LOG_HEADER]);
  var uuid = 0;
  var S = {
    console: console,
    Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON, isFinite: isFinite, Date: Date,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return { __ss: true }; }, flush: function () { S.__flushed = true; } },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: {
      formatDate: function () { return '2026-09-23 00:00:00'; },
      getUuid: function () { uuid++; return 'uuid-' + uuid + '-0000000000'; }
    },
    LockService: { getScriptLock: function () { return { tryLock: function () { return opts.lockFails !== true; }, releaseLock: function () {} }; } },
    prodRequireSheet_: function (ss, name) {
      if (opts.schemaThrows) { var e = new Error('PRODUCTION_SAFETY:MISSING_REQUIRED_HEADER [' + name + ']'); e.safetyToken = 'MISSING_REQUIRED_HEADER'; throw e; }
      return name === 'pricing_list' ? priceSheet : logSheet;
    },
    prodRequireColumns_: function (sheet, cols) {
      if (opts.columnsThrow) { var e = new Error('PRODUCTION_SAFETY:MISSING_REQUIRED_HEADER'); e.safetyToken = 'MISSING_REQUIRED_HEADER'; throw e; }
      var live = sheet.__grid[0].map(String);
      var missing = cols.filter(function (c) { return live.indexOf(c) === -1; });
      if (missing.length) { var e2 = new Error('PRODUCTION_SAFETY:MISSING_REQUIRED_HEADER'); e2.safetyToken = 'MISSING_REQUIRED_HEADER'; throw e2; }
      return true;
    },
    __price: priceSheet, __log: logSheet, __flushed: false
  };
  vm.createContext(S);
  vm.runInContext(src, S, { filename: '73_api_v1_pricing_write.gs' });
  return S;
}

var W = makeWorld(GS73);

// =============================================================================================================
section('A · THE MODEL — three columns, three states, and price_source demoted rather than reused');
// =============================================================================================================
{
  eq(W.PRICING_MANUAL_FLAG_COLUMNS_, ['regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual'],
    'A1  the three field-level ownership columns exist and are named per field');
  eq(W.PRICING_FIELDS_.map(function (s) { return [s.field, s.auto, s.flag]; }),
    [['regular_price', 'auto_regular_price', 'regular_price_is_manual'],
     ['minimum_price', 'auto_minimum_price', 'minimum_price_is_manual'],
     ['msrp', 'auto_msrp', 'msrp_is_manual']],
    'A2  each price field names its own auto value and its own flag — one correspondence, written once');

  // The canonical header carries them, so a provisioned sheet is provably the one the writer expects.
  W.PRICING_MANUAL_FLAG_COLUMNS_.forEach(function (c) {
    ok(W.PRICING_LIST_HEADERS_.indexOf(c) !== -1, 'A3  PRICING_LIST_HEADERS_ carries ' + c);
  });
  ok(W.PRICING_CHANGE_LOG_HEADERS_.indexOf('change_type') !== -1,
    'A4  pricing_change_log carries change_type');
  eq(W.PRICING_CHANGE_TYPES_, ['MANUAL_SET', 'RETURN_TO_AUTO', 'AUTO_FX_REFRESH'],
    'A5  and the three typed changes §3 requires');

  // THE NEGATIVE THAT MAKES FIELD-LEVEL THE ONLY AVAILABLE ANSWER: a single row-level flag is refused as a
  // substitute, and price_source — the row-level column that already existed — is never read for ownership.
  // Comments and string literals out, so this measures the CODE rather than the header's own disclaimer
  // or the column name sitting in PRICING_LIST_HEADERS_.
  var code = bare(GS73);
  var psHits = code.match(/price_source/g) || [];
  eq(psHits.length, 1, 'A6  price_source appears exactly ONCE in the executable source');
  ok(/res\.cells\.price_source = legacy;/.test(code),
    'A6b and that one occurrence is a WRITE derived from the flags — it is never read to decide anything');
  ok(/DESCRIPTIVE ONLY/.test(GS73), 'A6c the file says in prose that it is descriptive only');
  ok(/ONE value for a WHOLE ROW/.test(GS73), 'A7  the file records WHY a row-level flag cannot answer this');
  ok(/BLANK[\s\S]{0,120}NOBODY HAS SAID/.test(GS73), 'A8  and that a blank flag is UNKNOWN rather than false');

  // The spec says the same thing, so the schema is documented rather than only implemented.
  ok(/regular_price_is_manual/.test(DOC) && /minimum_price_is_manual/.test(DOC) && /msrp_is_manual/.test(DOC),
    'A9  PRICING_DATABASE_MAPPING documents the three columns');
  ok(/NOBODY HAS SAID/.test(DOC), 'A10 and documents blank as UNKNOWN');
  ok(/LEGACY \/ DESCRIPTIVE ONLY/.test(DOC), 'A11 and demotes price_source in the mapping table');
}

// =============================================================================================================
section('B · THE THREE-STATE FLAG — the server and the browser agree, spelling by spelling');
// =============================================================================================================
{
  var cases = [
    ['', 'UNKNOWN'], ['   ', 'UNKNOWN'], ['maybe', 'UNKNOWN'],
    ['TRUE', 'MANUAL'], ['true', 'MANUAL'], ['1', 'MANUAL'], ['YES', 'MANUAL'], ['MANUAL', 'MANUAL'],
    ['FALSE', 'AUTO'], ['false', 'AUTO'], ['0', 'AUTO'], ['NO', 'AUTO'], ['AUTO', 'AUTO']
  ];
  var serverOut = cases.map(function (c) { return W.pricingReadFlag_(c[0]); });
  var clientOut = cases.map(function (c) { return SRP.owner(c[0]); });
  eq(serverOut, cases.map(function (c) { return c[1]; }), 'B1  the server reads every spelling as its state');
  eq(clientOut, serverOut, 'B2  and the browser reads every one of them identically');

  // Spreadsheet checkboxes arrive as real booleans, not strings.
  eq([W.pricingReadFlag_(true), W.pricingReadFlag_(false)], ['MANUAL', 'AUTO'], 'B3  a checkbox boolean is read too');
  eq([SRP.owner(true), SRP.owner(false)], ['MANUAL', 'AUTO'], 'B3b and the browser agrees');

  // THE ONE THAT MATTERS: undefined — a sheet that has no such column at all — is UNKNOWN, not AUTO.
  eq(W.pricingReadFlag_(undefined), 'UNKNOWN', 'B4  an ABSENT column is UNKNOWN, never AUTO');
  eq(SRP.owner(undefined), 'UNKNOWN', 'B4b and the browser agrees');

  // And the writer only ever writes the two DECIDED states back. It never writes blank.
  eq([W.pricingWriteFlag_(true), W.pricingWriteFlag_(false)], ['TRUE', 'FALSE'], 'B5  the writer writes TRUE / FALSE');
}

// =============================================================================================================
section('C · §12 NUMBER SAFETY — blank, NA, zero and a typo stop being the same number');
// =============================================================================================================
{
  var r = W.pricingReadNumber_;
  eq([r('').present, r('').value, r('').na], [false, null, false], 'C1  blank: not present, null, not NA');
  eq([r('NA').present, r('NA').value, r('NA').na], [false, null, true], 'C2  NA: not present, null, and NA is recorded');
  eq([r('N/A').na, r('n/a').na], [true, true], 'C2b either spelling');
  eq([r('0').present, r('0').value], [true, 0], 'C3  zero IS a price, and is present');
  eq([r(0).present, r(0).value], [true, 0], 'C3b including as a real number');
  eq([r('abc').present, r('abc').invalid], [false, true], 'C4  a typo is invalid, never a price');
  eq(r('12.34').value, 12.34, 'C5  a number is a number');

  // The browser's normalizer answers the same question with the same answers.
  eq([SRP.num(''), SRP.num('NA'), SRP.num('0'), SRP.num('abc'), SRP.num('12.34')], [null, null, 0, null, 12.34],
    'C6  and the browser normalizer gives null / null / 0 / null / 12.34');

  // The shipped normalizer no longer collapses them. `parseFloat(x) || 0` is gone from every pricing field.
  var norm = DBAPI.slice(DBAPI.indexOf('function normalizePricingListRecord'));
  norm = norm.slice(0, norm.indexOf('function normalizePricingChangeLogRecord'));
  eq((norm.match(/parseFloat\([^)]*\)\s*\|\|\s*0/g) || []), [],
    'C7  normalizePricingListRecord holds no `parseFloat(...) || 0` at all');
  ['regular_price', 'minimum_price', 'msrp', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
   'base_regular_price', 'base_minimum_price', 'base_msrp', 'fx_rate'].forEach(function (f) {
    ok(new RegExp('pricingNumOrNull_\\(r\\.' + f + '\\)').test(norm), 'C8  ' + f + ' goes through pricingNumOrNull_');
  });
  ok(/regularPriceIsManual: pricingFlagOrNull_/.test(norm) && /msrpIsManual: pricingFlagOrNull_/.test(norm),
    'C9  and the three flags are carried as three states, not booleans');
  ok(/changeType: String\(r\.change_type/.test(DBAPI), 'C10 the change log carries change_type');
}

// =============================================================================================================
section('D · PER-FIELD PLANNING — independent, and what is refused rather than guessed');
// =============================================================================================================
{
  var SPEC = W.PRICING_FIELDS_[0];   // regular_price
  function row(o) { var base = { currency: 'USD' }; for (var k in o) base[k] = o[k]; return base; }

  // --- NO_CHANGE ---
  var p = W.pricingPlanField_(row({ regular_price: 10, auto_regular_price: 9 }), SPEC, 'NO_CHANGE', '', 'USD');
  eq([p.changed, p.error, Object.keys(p.cells).length], [false, null, 0], 'D1  NO_CHANGE writes nothing and refuses nothing');

  // --- MANUAL ---
  p = W.pricingPlanField_(row({ regular_price: 10, auto_regular_price: 9 }), SPEC, 'MANUAL', '12.50', 'USD');
  eq([p.changed, p.cells.regular_price, p.cells.regular_price_is_manual], [true, 12.5, 'TRUE'], 'D2  MANUAL sets the value AND takes ownership');
  eq([p.log.change_type, p.log.old_value, p.log.new_value], ['MANUAL_SET', '10', '12.5'], 'D2b and logs MANUAL_SET with both values');

  // Zero IS a price, and a person may set one deliberately.
  p = W.pricingPlanField_(row({ regular_price: 10, auto_regular_price: 9 }), SPEC, 'MANUAL', '0', 'USD');
  eq([p.changed, p.cells.regular_price], [true, 0], 'D3  MANUAL 0 is accepted — zero is a price');

  // Blank and NA are NOT prices, and neither is a negative one.
  p = W.pricingPlanField_(row({ regular_price: 10 }), SPEC, 'MANUAL', '', 'USD');
  eq([p.changed, p.error.code], [false, 'MANUAL_PRICE_REQUIRED'], 'D4  MANUAL with a blank price is REFUSED, not read as 0');
  p = W.pricingPlanField_(row({ regular_price: 10 }), SPEC, 'MANUAL', 'NA', 'USD');
  eq([p.changed, p.error.code], [false, 'MANUAL_PRICE_REQUIRED'], 'D5  MANUAL with NA is REFUSED — NA is not a price');
  p = W.pricingPlanField_(row({ regular_price: 10 }), SPEC, 'MANUAL', '-1', 'USD');
  eq(p.error.code, 'PRICE_NEGATIVE', 'D6  a negative price is refused');
  p = W.pricingPlanField_(row({ regular_price: 10 }), SPEC, 'MANUAL', 'ten', 'USD');
  eq(p.error.code, 'PRICE_NOT_NUMERIC', 'D7  a typo is refused rather than becoming 0');

  // Already exactly this, owned by exactly this person → no write and no log entry.
  p = W.pricingPlanField_(row({ regular_price: 12.5, regular_price_is_manual: 'TRUE' }), SPEC, 'MANUAL', '12.50', 'USD');
  eq([p.changed, p.log], [false, null], 'D8  re-saving the same manual value writes nothing and logs nothing');
  // But an unchanged VALUE whose OWNERSHIP is still unknown is a real change — it is the claim being made.
  p = W.pricingPlanField_(row({ regular_price: 12.5 }), SPEC, 'MANUAL', '12.50', 'USD');
  eq([p.changed, p.cells.regular_price_is_manual], [true, 'TRUE'], 'D9  the same value with no recorded owner DOES write the ownership');

  // --- AUTO. PRICING-R4G REVERSED WHAT THIS DOES, and D10-D14 are the assertions that record it. ---
  //
  // It used to COPY auto_* into the override and refuse when auto_* was blank. Both were right under the
  // stored-effective model — copying WAS returning to auto, and copying a blank would have written 0. Under
  // the nullable-override model both are wrong: the copy is what FREEZES the price against every later FX
  // run, and the refusal blocks the only repair a pending_fx row has. It now CLEARS.
  p = W.pricingPlanField_(row({ regular_price: 12.5, auto_regular_price: 9.99, regular_price_is_manual: 'TRUE' }), SPEC, 'AUTO', '', 'USD');
  eq([p.changed, p.cells.regular_price, p.cells.regular_price_is_manual, p.log.change_type],
    [true, '', 'FALSE', 'RETURN_TO_AUTO'], 'D10 USE AUTO CLEARS the override and hands ownership back');
  eq([p.log.old_value, p.log.new_value], ['12.5', ''],
    'D10a and the log records the price that was REMOVED — the only trace of what the site was serving');

  // §8 — AUTO IGNORES a supplied value. A file carrying both must not smuggle the price in.
  p = W.pricingPlanField_(row({ regular_price: 12.5, auto_regular_price: 9.99 }), SPEC, 'AUTO', '999', 'USD');
  eq(p.cells.regular_price, '', 'D11 AUTO ignores any supplied manual value entirely');

  // PRICING-R4G §4 — AND IT IS ALLOWED WITH NO AUTO VALUE AT ALL. "There is no auto value yet" is a reason
  // to clear the override, not a reason to refuse: the row then resolves by itself when the first rate lands.
  p = W.pricingPlanField_(row({ regular_price: 12.5, auto_regular_price: '' }), SPEC, 'AUTO', '', 'USD');
  eq([p.changed, p.error, p.cells.regular_price], [true, null, ''],
    'D12 USE AUTO with a blank auto value CLEARS — it is the repair for a pending_fx row');
  p = W.pricingPlanField_(row({ regular_price: 12.5, auto_regular_price: 'NA' }), SPEC, 'AUTO', '', 'USD');
  eq([p.changed, p.error], [true, null], 'D13 and an NA auto is no obstacle either');
  p = W.pricingPlanField_(row({ regular_price: 12.5, auto_regular_price: 0 }), SPEC, 'AUTO', '', 'USD');
  eq([p.changed, p.cells.regular_price], [true, ''], 'D14 a real auto value of 0 changes nothing here — the override is cleared, not copied');

  // AND IT IS IDEMPOTENT. A field already clear and already owned by the system writes nothing at all, so
  // re-uploading a template nobody edited does not touch a cell or advance updated_at.
  p = W.pricingPlanField_(row({ regular_price: '', auto_regular_price: 9.99, regular_price_is_manual: 'FALSE' }), SPEC, 'AUTO', '', 'USD');
  eq([p.changed, Object.keys(p.cells).length, p.log], [false, 0, null],
    'D14a USE AUTO on a field that already has no override writes nothing');

  // --- INDEPENDENCE (§1/§6). Setting Regular must leave Minimum and MSRP exactly as they were. ---
  var full = { currency: 'USD', regular_price: 10, minimum_price: 8, msrp: 12,
    auto_regular_price: 9, auto_minimum_price: 7, auto_msrp: 11,
    minimum_price_is_manual: 'TRUE' };
  var plan = W.pricingPlanRow_(full, { marketplace_sku_id: 'MS1', regular_price_mode: 'MANUAL', regular_price: '15' });
  eq(plan.ok, true, 'D15 a one-field edit plans cleanly');
  eq(Object.keys(plan.cells).sort(), ['regular_price', 'regular_price_is_manual'],
    'D16 and touches ONLY that field and its own flag');
  // The legacy descriptor stays SILENT here, and deliberately: msrp_is_manual is still unstated on this
  // row, so there is no honest row-level summary to write. It appears only once every field is decided.
  var decided = { currency: 'USD', regular_price: 10, minimum_price: 8, msrp: 12,
    auto_regular_price: 9, auto_minimum_price: 7, auto_msrp: 11,
    minimum_price_is_manual: 'TRUE', msrp_is_manual: 'TRUE' };
  var plan2 = W.pricingPlanRow_(decided, { marketplace_sku_id: 'MS1', regular_price_mode: 'MANUAL', regular_price: '15' });
  eq(plan2.cells.price_source, 'manual_override',
    'D16b once every field is decided, the legacy descriptor is brought into step');
  eq(plan.logs.length, 1, 'D17 one field changed, one audit entry');
  eq([plan.fields.minimum_price.mode, plan.fields.msrp.mode], ['NO_CHANGE', 'NO_CHANGE'],
    'D18 the untouched fields are NO_CHANGE — a blank mode is not AUTO');

  // Three independent states on one row is valid and expected (§1's own example).
  var mixed = { currency: 'USD', regular_price: 10, minimum_price: 8, msrp: 12,
    regular_price_is_manual: 'TRUE', minimum_price_is_manual: 'FALSE', msrp_is_manual: 'TRUE',
    auto_regular_price: 9, auto_minimum_price: 8, auto_msrp: 11 };
  eq(W.PRICING_FIELDS_.map(function (s) { return W.pricingReadFlag_(mixed[s.flag]); }),
    ['MANUAL', 'AUTO', 'MANUAL'], 'D19 TRUE / FALSE / TRUE on one row is a valid, readable combination');

  // --- the legacy descriptor: kept in step, and SILENT when it cannot be honest ---
  eq(W.pricingDeriveLegacySource_({ regular_price_is_manual: 'MANUAL', minimum_price_is_manual: 'AUTO', msrp_is_manual: 'MANUAL' }),
    'manual_override', 'D20 any manual, none unknown → manual_override');
  eq(W.pricingDeriveLegacySource_({ regular_price_is_manual: 'AUTO', minimum_price_is_manual: 'AUTO', msrp_is_manual: 'AUTO' }),
    'auto_fx', 'D21 all auto → auto_fx');
  eq(W.pricingDeriveLegacySource_({ regular_price_is_manual: 'MANUAL', minimum_price_is_manual: 'UNKNOWN', msrp_is_manual: 'AUTO' }),
    null, 'D22 any UNKNOWN → it says NOTHING rather than something wrong');

  // --- currency ---
  var cm = W.pricingPlanRow_({ currency: 'USD', regular_price: 1 }, { marketplace_sku_id: 'M', currency: 'CAD', regular_price_mode: 'MANUAL', regular_price: '2' });
  eq([cm.ok, cm.errors[0].code], [false, 'CURRENCY_MISMATCH'], 'D23 a file currency that disagrees with the row is refused, never reconciled');
  var cmiss = W.pricingPlanRow_({ currency: '', regular_price: 1 }, { marketplace_sku_id: 'M', regular_price_mode: 'MANUAL', regular_price: '2' });
  eq([cmiss.ok, cmiss.errors[0].code], [false, 'CURRENCY_MISSING'], 'D24 and a row with no currency at all is refused');

  // --- an unsupported mode is refused, never ignored: ignoring it would silently drop an edit ---
  var bm = W.pricingPlanRow_({ currency: 'USD' }, { marketplace_sku_id: 'M', regular_price_mode: 'DELETE' });
  eq([bm.ok, bm.errors[0].code], [false, 'MODE_UNSUPPORTED'], 'D25 an unrecognised mode is REFUSED, not ignored');
}

// =============================================================================================================
section('E · §9 BATCH ATOMICITY — one bad line writes nothing, proven by executing the handler');
// =============================================================================================================
{
  var ix = { M1: { rowNumber: 2, values: { pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD', regular_price: 10, auto_regular_price: 9 } } };

  var b = W.pricingPlanBatch_([{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' }], ix);
  eq([b.ok, b.plans.length, b.changed_rows], [true, 1, 1], 'E1  a clean batch plans one changed row');

  b = W.pricingPlanBatch_([
    { marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' },
    { marketplace_sku_id: 'NOPE', regular_price_mode: 'MANUAL', regular_price: '11' }], ix);
  eq([b.ok, b.plans.length, b.changed_rows, b.errors[0].code], [false, 0, 0, 'UNKNOWN_MARKETPLACE_SKU_ID'],
    'E2  ONE unknown id discards the WHOLE plan — the good line is not written either');

  b = W.pricingPlanBatch_([
    { marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' },
    { marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '12' }], ix);
  eq([b.ok, b.errors[0].code], [false, 'DUPLICATE_IDENTITY'], 'E3  the same identity twice is refused — both cannot be final');

  b = W.pricingPlanBatch_([{ regular_price_mode: 'MANUAL', regular_price: '11' }], ix);
  eq([b.ok, b.errors[0].code], [false, 'IDENTITY_MISSING'], 'E4  a line with no marketplace_sku_id is refused');

  b = W.pricingPlanBatch_([], ix);
  eq([b.ok, b.errors[0].code], [false, 'NO_LINES'], 'E5  an empty batch is refused rather than reported as success');

  var many = [];
  for (var i = 0; i <= W.PRW_MAX_LINES_; i++) many.push({ marketplace_sku_id: 'M' + i, regular_price_mode: 'NO_CHANGE' });
  b = W.pricingPlanBatch_(many, ix);
  eq([b.ok, b.errors[0].code], [false, 'BATCH_TOO_LARGE'], 'E6  a batch past the ceiling is refused — one request may not rewrite the price book');

  // ---- EXECUTED: the handler, against a fake sheet, counting physical writes. ----
  function run(body, opts) {
    var w = makeWorld(GS73, Object.assign({ rows: [
      priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', sku: 'SKU-A', currency: 'USD', regular_price: 10, auto_regular_price: 9, minimum_price: 8, auto_minimum_price: 8, msrp: 12, auto_msrp: 11 }),
      priceRow({ pricing_id: 'P2', marketplace_sku_id: 'M2', sku: 'SKU-B', currency: 'JPY', regular_price: 1000, auto_regular_price: 990 })
    ] }, opts || {}));
    return { env: w.handlePricingUpdate_(body), w: w };
  }

  var r1 = run({ changed_by: 'tester', lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' }] });
  eq([r1.env.success, r1.env.data.written, r1.env.data.logged], [true, 1, 1], 'E7  EXECUTED: one row written, one audit entry');
  eq(r1.w.__price.__grid[1][PRICING_HEADER.indexOf('regular_price')], 11, 'E7b and the effective price now holds 11');
  eq(r1.w.__price.__grid[1][PRICING_HEADER.indexOf('regular_price_is_manual')], 'TRUE', 'E7c with ownership recorded');
  eq(r1.w.__price.__grid[1][PRICING_HEADER.indexOf('minimum_price')], 8, 'E7d and the untouched field is untouched');
  eq(r1.w.__price.__grid[1][PRICING_HEADER.indexOf('minimum_price_is_manual')], '', 'E7e including its ownership, which stays UNSTATED');

  var r2 = run({ changed_by: 'tester', lines: [
    { marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' },
    { marketplace_sku_id: 'M2', regular_price_mode: 'MANUAL', regular_price: 'oops' }] });
  eq([r2.env.success, r2.env.error, r2.env.data.written], [false, 'VALIDATION_FAILED', 0], 'E8  EXECUTED: a bad second line refuses the batch');
  eq(r2.w.__price.__writes, 0, 'E8b and ZERO physical writes reached the sheet');
  eq(r2.w.__log.__writes, 0, 'E8c and nothing was logged either');
  eq(r2.w.__price.__grid[1][PRICING_HEADER.indexOf('regular_price')], 10, 'E8d the good line\'s row still holds its original price');

  // A DRY RUN is the same validation and the same plan, with no writes at all (§9's preview).
  var r3 = run({ dry_run: true, lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' }] });
  eq([r3.env.success, r3.env.data.dry_run, r3.env.data.written, r3.env.data.changed_rows], [true, true, 0, 1],
    'E9  EXECUTED: a dry run reports the change it WOULD make');
  eq(r3.w.__price.__writes, 0, 'E9b and writes nothing');
  eq(r3.env.data.rows[0].fields.regular_price.mode, 'MANUAL', 'E9c the receipt names the mode per field');

  // The receipt is the PLAN, not an echo: a line that changes nothing says so.
  var r4 = run({ lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '10' }] });
  eq([r4.env.data.rows[0].changed, r4.env.data.written], [true, 1],
    'E10 a same-value save with UNSTATED ownership still writes — the claim is the change');
  var r5 = run({ lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'NO_CHANGE' }] });
  eq([r5.env.data.rows[0].changed, r5.env.data.written, r5.env.data.unchanged_rows], [false, 0, 1],
    'E11 and a NO_CHANGE line writes nothing at all');

  // SCHEMA FIRST. Until the operator has provisioned the columns, nothing is written and the token says why.
  var r6 = run({ lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' }] }, { columnsThrow: true });
  eq([r6.env.success, r6.env.error, r6.env.data.written], [false, 'MISSING_REQUIRED_HEADER', 0],
    'E12 an unprovisioned schema refuses with the safety token and writes nothing');
  eq(r6.w.__price.__writes, 0, 'E12b zero physical writes');

  // THE PRE-MIGRATION SHEET, which is the state every project is in until the operator provisions the
  // columns. It is refused by the column guard specifically, with nothing written.
  var pre = makeWorld(GS73, { legacyPriceHeader: true, rows: [LEGACY_ROW] });
  var envPre = pre.handlePricingUpdate_({ lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' }] });
  eq([envPre.success, envPre.error, envPre.data.written], [false, 'MISSING_REQUIRED_HEADER', 0],
    'E12c a pricing_list WITHOUT the three flag columns is refused — the migration is the gate');
  eq(pre.__price.__writes, 0, 'E12d and zero physical writes reached the legacy sheet');

  // A LOCK IT CANNOT TAKE IS A REFUSAL, never a write that races another one.
  var r7 = run({ lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' }] }, { lockFails: true });
  eq([r7.env.success, r7.env.error, r7.env.data.written], [false, 'PRICING_LOCK_TIMEOUT', 0], 'E13 a contended lock refuses and writes nothing');
}

// =============================================================================================================
section('F · §3 THE AUDIT — typed, and written only for a change that actually happened');
// =============================================================================================================
{
  var w = makeWorld(GS73, { rows: [priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD',
    regular_price: 10, auto_regular_price: 9, minimum_price: 8, auto_minimum_price: 8, minimum_price_is_manual: 'TRUE' })] });
  var env = w.handlePricingUpdate_({ changed_by: 'alice', change_reason: 'negotiated',
    lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11', minimum_price_mode: 'AUTO' }] });
  eq([env.success, env.data.written, env.data.logged], [true, 1, 2], 'F1  one row, two fields changed, two audit entries');

  var rows = w.__log.__grid.slice(1);
  var col = function (n) { return LOG_HEADER.indexOf(n); };
  var byField = {};
  rows.forEach(function (r) { byField[r[col('field_name')]] = r; });
  eq(byField.regular_price[col('change_type')], 'MANUAL_SET', 'F2  a manual set is typed MANUAL_SET');
  eq(byField.minimum_price[col('change_type')], 'RETURN_TO_AUTO', 'F3  a hand-back is typed RETURN_TO_AUTO');
  eq([byField.regular_price[col('old_value')], byField.regular_price[col('new_value')]], ['10', '11'], 'F4  both values are recorded');
  eq(byField.regular_price[col('pricing_id')], 'P1', 'F5  keyed on the pricing row identity');
  eq(byField.regular_price[col('changed_by')], 'alice', 'F6  and on who did it');
  eq(byField.regular_price[col('change_reason')], 'negotiated', 'F7  free text is kept as free text, beside the typed value');
  ok(/^PCL-/.test(byField.regular_price[col('log_id')]), 'F8  each entry has its own id');

  // A no-op writes no history. An audit that records non-events cannot be read.
  var w2 = makeWorld(GS73, { rows: [priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD', regular_price: 10, regular_price_is_manual: 'TRUE' })] });
  var env2 = w2.handlePricingUpdate_({ lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '10' }] });
  eq([env2.data.written, env2.data.logged], [0, 0], 'F9  a change that changes nothing writes no history');

  // §3 — ownership is NEVER inferred by scanning the log. The writer reads the flag columns, not this table.
  var code = bare(GS73);
  ok(!/pricing_change_log[\s\S]{0,200}getDataRange/.test(code), 'F10 the writer never READS the change log to decide anything');
  ok(/never runtime authority|NOT runtime authority|audit history/i.test(DOC), 'F11 and the spec says the log is history, not authority');
}

// =============================================================================================================
section('G · §11 THE FROZEN FX PRECISION — and it never rounds an operator\'s number');
// =============================================================================================================
{
  eq(W.PRICING_FX_DECIMALS_, { USD: 2, CAD: 2, EUR: 2, GBP: 2, AUD: 2, JPY: 0, KRW: 0, TWD: 0 },
    'G1  the eight currencies are frozen exactly as §11 specifies');
  eq([W.pricingDecimalsFor_('usd'), W.pricingDecimalsFor_('JPY'), W.pricingDecimalsFor_('MXN')], [2, 0, null],
    'G2  case-insensitive, and an unlisted currency is null rather than a guessed 2');

  eq([W.pricingRoundFx_(12.3456, 'USD'), W.pricingRoundFx_(1234.56, 'JPY')], [12.35, 1235],
    'G3  conversion rounds to the currency\'s decimals');
  eq(W.pricingRoundFx_(12.3456, 'MXN'), null, 'G4  and refuses to round a currency it has no contract for');

  // NO PSYCHOLOGICAL PRICING. A .99 rule hidden in a conversion is a commercial claim nobody approved.
  eq([W.pricingRoundFx_(10.0, 'USD'), W.pricingRoundFx_(10.004, 'USD'), W.pricingRoundFx_(20, 'USD')], [10, 10, 20],
    'G5  10 converts to 10 — no .99, no .95, no nudge');
  var code = bare(GS73);
  ok(!/0\.99|0\.95|\.99\b|\.95\b/.test(code), 'G6  and no such constant exists anywhere in the writer');

  // A MANUAL price is never rounded. It is refused, so the person retypes it rather than being corrected.
  var SPEC = W.PRICING_FIELDS_[0];
  var p = W.pricingPlanField_({ currency: 'JPY', regular_price: 1000 }, SPEC, 'MANUAL', '1234.56', 'JPY');
  eq([p.changed, p.error.code], [false, 'PRICE_PRECISION_UNSUPPORTED'], 'G7  a JPY price with decimals is REFUSED, not rounded');
  ok(/Nothing was rounded/.test(p.error.detail), 'G7b and the refusal says so');
  p = W.pricingPlanField_({ currency: 'JPY', regular_price: 1000 }, SPEC, 'MANUAL', '1235', 'JPY');
  eq([p.changed, p.cells.regular_price], [true, 1235], 'G8  a whole-yen price is accepted verbatim');
  p = W.pricingPlanField_({ currency: 'USD', regular_price: 10 }, SPEC, 'MANUAL', '12.34', 'USD');
  eq(p.cells.regular_price, 12.34, 'G9  and two USD decimals are accepted verbatim');

  // An unlisted currency constrains nothing rather than blocking the operator out of their own price.
  p = W.pricingPlanField_({ currency: 'MXN', regular_price: 10 }, SPEC, 'MANUAL', '12.3456', 'MXN');
  eq([p.changed, p.cells.regular_price], [true, 12.3456], 'G10 an unlisted currency is not precision-constrained');

  ok(/USD, CAD, EUR, GBP, AUD \| 2/.test(DOC) && /JPY, KRW, TWD \| 0/.test(DOC), 'G11 and the contract is documented');
}

// =============================================================================================================
section('H · §2/§13 THE EFFECTIVE-PRICE CONTRACT — and where PRICING-R4G moved it');
// =============================================================================================================
{
  // WHAT R2 ASSERTED HERE, AND WHY IT NO LONGER HOLDS. R2's claim was that its round changed the WRITE
  // path and left every reader alone — checkable as a negative: no consumer mentioned auto_* or a flag.
  // That was true for three releases. PRICING-R4G is the round that had to break it, because the three
  // columns those consumers read stopped being the price and became the user OVERRIDE. A reader still
  // reading them reads the wrong concept, and reads it silently.
  //
  // The negative is KEPT for the consumers that genuinely still do not care, because that set shrinking by
  // accident is exactly what this check is for.
  var UNCHANGED_CONSUMERS = {
    'assets/js/api/km-product-pricing-workspace.js': 'Product Strategy pricing accessor',
    'assets/specs/active/apps-script/20_campaign_write_handlers.gs': 'the campaign snapshot writer'
  };
  Object.keys(UNCHANGED_CONSUMERS).forEach(function (f) {
    var src = readN(f);
    ok(!/auto_regular_price|auto_minimum_price|auto_msrp/.test(src),
      'H1  ' + UNCHANGED_CONSUMERS[f] + ' reads no auto_* field');
    ok(!/_is_manual/.test(src),
      'H2  ' + UNCHANGED_CONSUMERS[f] + ' does not resolve ownership to find out what something costs');
  });

  // THE THREE THAT MOVED, each naming what it moved to.
  var _fc = readN('assets/js/pages/fc-summary.js');
  ok(/resolvedRegularPrice/.test(_fc) && !/row\.raw \? row\.raw\.regular_price : row\.regularPrice/.test(_fc),
    'H3  PRICING-R4G — FC Summary reads the RESOLVED price, not the raw override cell');
  var _ad = readN('assets/js/api/km-product-pricing-adapter.js');
  ok(/resolved_regular_price/.test(_ad) && /auto_regular_price/.test(_ad) && /override_regular_price/.test(_ad),
    'H3a the Product Strategy adapter carries resolved / auto / override, verbatim from 72_');
  ok(/pricingResolveEffective_/.test(readN('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs')),
    'H3b and 72_ resolves through 73_ rather than publishing the override cell as a price');

  // 72_ MOVED. The stamp is READ from the manifest rather than pinned to a literal, so this line stops
  // needing an edit every time the release advances for reasons of its own — the property it guards is
  // that the file and its manifest row agree, which is what a partial sync breaks.
  var _ppwExpected = (readN('assets/specs/active/apps-script/63_api_v1_system_health.gs')
    .match(/\{ file: '72_api_v1_product_pricing_workspace\.gs', symbol: 'PPW_BUILD_VERSION_', expected: '([^']+)'/) || [])[1];
  ok(_ppwExpected && new RegExp("PPW_BUILD_VERSION_ = '" + _ppwExpected + "'")
      .test(readN('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs')),
    'H4  the pricing READ owner declares the stamp its manifest row expects');
  ok(_ppwExpected !== 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10',
    'H4a and it is no longer R10 — a writer is not a reader, but a reader whose FIELD CHANGED MEANING is');

  // The contract is written down, so a later round cannot re-derive it from the code by accident.
  ok(/effective-price contract is UNCHANGED/i.test(DOC), 'H5  and the mapping spec freezes it');
  ok(/No consumer reads `auto_\*`/.test(DOC), 'H6  including that no consumer reads auto_*');

  // §13 — nothing in this round performs an FX migration or a bulk overwrite.
  var code = bare(GS73);
  ok(!/UrlFetchApp|fetch\(/.test(code), 'H7  the writer fetches no FX rate — that is PRICING-R3');
  ok(!/forEach[\s\S]{0,200}setValue\([\s\S]{0,40}auto_/.test(code), 'H8  and computes no auto_* value');
}

// =============================================================================================================
section('I · §4 SKU DETAILS — base_* is NOT a sku_details field, so nothing was invented there');
// =============================================================================================================
{
  // THE AUDIT §4 ASKED FOR. sku_details' editable column list is the authority on what that table owns.
  var m = /'minimum_price', 'msrp', 'selling_price', 'base_currency', 'pm', 'image_url'/.exec(GS03);
  ok(!!m, 'I1  sku_details\' editable column list is where the master baseline is declared');
  ok(!/base_regular_price|base_minimum_price|base_msrp/.test(GS03),
    'I2  and it contains NO base_regular_price / base_minimum_price / base_msrp — they are not sku_details fields');

  // They live on pricing_list, per row, which is why §4 said not to invent them on the master.
  ok(/pricing_list: \['pricing_id'[\s\S]*?'base_regular_price', 'base_minimum_price', 'base_msrp'/.test(GS04),
    'I3  base_* belongs to pricing_list, one row per marketplace_sku_id');

  // So this round adds NO pricing to the Master SKU editor.
  var skuPage = readN('assets/js/pages/sku-details.js');
  ok(!/regular_price_is_manual|pricing\.update|updatePricing/.test(skuPage),
    'I4  the Master SKU editor gained no site-local pricing and no pricing writer');
  ok(/base_currency/.test(skuPage), 'I5  while its existing base-currency baseline is untouched');
}

// =============================================================================================================
section('J · §8 THE TEMPLATE — a blank cell is NO_CHANGE, and a round trip changes nothing');
// =============================================================================================================
{
  eq(SRP.TEMPLATE_COLUMNS, ['marketplace_sku_id', 'master_sku', 'site_sku', 'company', 'country', 'marketplace', 'currency',
    'regular_price_mode', 'regular_price', 'minimum_price_mode', 'minimum_price', 'msrp_mode', 'msrp'],
    'J1  human-readable context, then the canonical identity, then one mode + one value per price');
  eq(SRP.MODES, ['NO_CHANGE', 'MANUAL', 'AUTO'], 'J2  the three modes §8 specifies');

  var pricing = [
    { pricingId: 'P1', marketplaceSkuId: 'M1', sku: 'SKU-A', siteSku: 'SA', country: 'US', marketplace: 'amazon',
      currency: 'USD', regularPrice: 10, minimumPrice: 8, msrp: 12, autoRegularPrice: 9, autoMinimumPrice: 8, autoMsrp: 11,
      regularPriceIsManual: true, minimumPriceIsManual: null, msrpIsManual: false, fxRate: 1, fxRateDate: '2026-09-01', raw: {} }
  ];
  var mkt = [{ marketplaceSkuId: 'M1', sku: 'SKU-A', company: 'KM', country: 'US', marketplace: 'amazon', siteSku: 'SA' }];

  // THE ROUND TRIP. Download the template, upload it unedited, and nothing is asked for.
  var csv = SRP.buildTemplateCsv(pricing, mkt);
  var v = SRP.validateFile(csv);
  eq([v.ok, v.lines.length], [true, 1], 'J3  an unedited template is valid');
  eq(v.lines.filter(SRP.lineTouches).length, 0, 'J4  and asks for NOTHING — every mode ships as No Change');

  // THE ANCHOR THE FIXTURES BELOW EDIT, taken from the module rather than spelled out. PRICING-R4C-R2 §1
  // changed the word the template SHIPS, and a hard-coded token turned three of these refusal tests into
  // no-ops: the replace matched nothing, the untouched file was valid, and "valid" was the wrong answer to
  // a question about a refusal. So the anchor is derived, and it is PROVEN to exist before anything uses it.
  var NC = SRP.actionLabel('NO_CHANGE');
  var TRIPLE = NC + ',,' + NC + ',,' + NC + ',';
  ok(csv.indexOf(TRIPLE) !== -1, 'J4b the fixture anchor is present in the template — these tests can fail');

  // A BLANK mode cell is NO_CHANGE. Not delete. Not AUTO.
  var blanked = csv.split(NC).join('');
  var vb = SRP.validateFile(blanked);
  eq([vb.ok, vb.lines[0].regular_price_mode, vb.lines.filter(SRP.lineTouches).length], [true, 'NO_CHANGE', 0],
    'J5  a BLANK mode cell reads as NO_CHANGE and asks for nothing');

  // AUTO drops a supplied value, at the file boundary as well as at the writer.
  var withAuto = csv.replace(TRIPLE, 'AUTO,999,' + NC + ',,' + NC + ',');
  var va = SRP.validateFile(withAuto);
  eq([va.ok, va.lines[0].regular_price_mode, va.lines[0].regular_price], [true, 'AUTO', undefined],
    'J6  AUTO carries no value forward — a price cannot ride in behind it');

  // FILE-shaped refusals. Each of these fails the WHOLE file (§9).
  function bad(mut) { return SRP.validateFile(csv.replace(mut[0], mut[1])); }
  var r;
  r = SRP.validateFile('nope,at,all\n1,2,3');
  eq([r.ok, r.errors[0].code], [false, 'MISSING_REQUIRED_COLUMNS'], 'J7  a file without the required columns is refused');
  r = bad([TRIPLE, 'MANUAL,,' + NC + ',,' + NC + ',']);
  eq([r.ok, r.errors[0].code, r.lines.length], [false, 'MANUAL_PRICE_REQUIRED', 0], 'J8  MANUAL with a blank price is refused — blank is not zero');
  r = bad([TRIPLE, 'MANUAL,abc,' + NC + ',,' + NC + ',']);
  eq([r.ok, r.errors[0].code], [false, 'PRICE_NOT_NUMERIC'], 'J9  a non-numeric manual price is refused');
  r = bad([TRIPLE, 'MANUAL,-5,' + NC + ',,' + NC + ',']);
  eq([r.ok, r.errors[0].code], [false, 'PRICE_NEGATIVE'], 'J10 a negative manual price is refused');
  r = bad([TRIPLE, 'DELETE,,' + NC + ',,' + NC + ',']);
  eq([r.ok, r.errors[0].code], [false, 'MODE_UNSUPPORTED'], 'J11 an unsupported mode is refused, never ignored');
  r = SRP.validateFile(csv + '\r\n' + csv.split(/\r?\n/)[1]);
  eq([r.ok, r.errors[0].code], [false, 'DUPLICATE_IDENTITY'], 'J12 the same identity twice inside the file is refused');
  r = SRP.validateFile(csv.split(/\r?\n/).map(function (l, i) { return i === 1 ? l.replace(/^M1/, '') : l; }).join('\r\n'));
  eq([r.ok, r.errors[0].code], [false, 'IDENTITY_MISSING'], 'J13 and a line with no identity is refused');

  // §9 — a rejected file offers NOTHING for writing, so a confirm cannot reach the server with half of it.
  ok(r.lines.length === 0, 'J14 a rejected file yields zero writable lines');

  // The CURRENT-pricing export states ownership per field, including the state that is not a state yet.
  var cur = SRP.buildCurrentCsv(pricing, mkt);
  var head = cur.split('\r\n')[0].split(',');
  ['regular_price_owner', 'minimum_price_owner', 'msrp_owner'].forEach(function (c) {
    ok(head.indexOf(c) !== -1, 'J15 the current-pricing export names ' + c);
  });
  var line = cur.split('\r\n')[1].split(',');
  eq(line[head.indexOf('regular_price_owner')], 'MANUAL', 'J16 a manual field exports as MANUAL');
  eq(line[head.indexOf('msrp_owner')], 'AUTO', 'J17 a system field exports as AUTO');
  eq(line[head.indexOf('minimum_price_owner')], 'NOT_SET', 'J18 and an unstated one exports as NOT_SET — never as AUTO');

  // The boundary is deliberate: the FILE is checked here, the DATABASE is checked by the server.
  ok(!/UNKNOWN_MARKETPLACE_SKU_ID|CURRENCY_MISMATCH|AUTO_VALUE_MISSING/.test(SRP_SRC),
    'J19 the browser does NOT re-decide the database facts — one pricing authority, not two');
  ok(/dry_run: true/.test(PAGE), 'J20 it asks the server for them on a dry run instead');
}

// =============================================================================================================
section('K · §10 THE CENSUS — counting only, one implementation, zero ambiguous rows written');
// =============================================================================================================
{
  function row(o) { o.raw = o.raw || {}; return o; }
  var rows = [
    // all three flags stated
    row({ regularPriceIsManual: true, minimumPriceIsManual: false, msrpIsManual: false,
      regularPrice: 11, minimumPrice: 8, msrp: 11, autoRegularPrice: 9, autoMinimumPrice: 8, autoMsrp: 11 }),
    // nothing stated, every field already equal to auto → provably auto, because saying so moves no money
    row({ regularPrice: 9, minimumPrice: 8, msrp: 11, autoRegularPrice: 9, autoMinimumPrice: 8, autoMsrp: 11 }),
    // nothing stated and Regular DIVERGES → ambiguous, deliberately NOT counted as manual
    row({ regularPrice: 15, minimumPrice: 8, msrp: 11, autoRegularPrice: 9, autoMinimumPrice: 8, autoMsrp: 11 })
  ];
  var c = SRP.census(rows);
  eq(c.total_rows, 3, 'K1  every row is counted');
  eq(c.manual_provable_rows, 1, 'K2  a row is manual-provable only when a flag SAYS so');
  eq(c.auto_provable_rows, 1, 'K3  a row is auto-provable when every field is stated or already equals auto');
  eq(c.ambiguous_rows, 1, 'K4  and the row with an unexplained divergence stays AMBIGUOUS');
  eq(c.by_field.regular_price, { auto_provable: 1, manual_provable: 1, ambiguous: 1 }, 'K5  counted per field, not per row');

  // THE LOAD-BEARING NEGATIVE. Divergence is not evidence of a person. An auto value refreshed after the
  // effective one was last written diverges in exactly the same way, and guessing would latch the guess in.
  eq(SRP.censusField(rows[2], SRP.FIELDS[0]), 'AMBIGUOUS',
    'K6  a price that merely DIFFERS from auto is never classified as manual');

  // ONE implementation. The server does not carry a second copy that could disagree with the screen.
  ok(!/function pricingCensus_|function pricingCensusField_/.test(GS73),
    'K7  the census exists in exactly one place — the screen that displays it');
  ok(/census[\s\S]{0,400}sku-regional-pricing\.js/.test(GS73), 'K7b and the writer says where it went');

  // AMBIGUOUS_LEGACY_ROWS_WRITTEN = 0, and it is structural rather than a count: there is no code path that
  // writes a flag without an explicit per-field mode, and no mode defaults to anything but NO_CHANGE.
  var code = bare(GS73);
  var flagWrites = code.match(/cells\[spec\.flag\]\s*=[^=]/g) || [];
  eq(flagWrites.length, 2, 'K8  a flag is written in exactly two places — the MANUAL branch and the AUTO branch');
  var w = makeWorld(GS73, { rows: [priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD', regular_price: 10, auto_regular_price: 9 })] });
  var env = w.handlePricingUpdate_({ lines: [{ marketplace_sku_id: 'M1' }] });   // no modes at all
  eq([env.success, env.data.written], [true, 0], 'K9  a line naming NO mode writes nothing');
  eq(w.__price.__grid[1][PRICING_HEADER.indexOf('regular_price_is_manual')], '',
    'K10 and the ambiguous row is left ambiguous — no default classified it');
  eq(w.__price.__writes, 0, 'K11 zero physical writes, so AMBIGUOUS_LEGACY_ROWS_WRITTEN is 0 by construction');
}

// =============================================================================================================
section('L · THE WIRING — route, registry, manifest, contract versions, pin, release order, cache token');
// =============================================================================================================
{
  // PRICING-R3 — R21 BECOMES A FLOOR WHERE IT WAS AN EQUALITY. R3 moved 73_, 01_ and 63_ to R22, and this
  // section was never really about the number: it is about PRICING-R2's wiring still being present and
  // still being honestly declared. A stamp may only move FORWARD, so "at or after R21" is the claim that
  // survives a later round without letting one quietly roll a stamp back.
  var R21 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R21';
  function declaredIn(src, sym) { return (src.match(new RegExp("var " + sym + " = '([^']+)'")) || [])[1]; }
  function manifestAgrees(sym, value) { return GS63.indexOf("symbol: '" + sym + "', expected: '" + value + "'") > 0; }

  ok(/if \(action === 'pricing\.update'\) \{\s*\n\s*return jsonResponse_\(handlePricingUpdate_\(body\)\);/.test(GS01),
    'L1  the router dispatches pricing.update to the handler');
  // POST ONLY. A write must not be reachable by a URL someone can paste into a browser.
  //
  // MEASURED ON CODE, NOT ON PROSE. The first draft scanned the raw text above the write section, and the
  // router's own stamp comment — "R9 -> R21. This file gained the pricing.update dispatch" — sits at the
  // top of the file, so the assertion matched its own explanation of the thing it was looking for. With
  // comments and string literals out, what is left is the dispatch itself.
  var _routerCode = bare(GS01);
  eq((_routerCode.match(/handlePricingUpdate_/g) || []).length, 1,
    'L2  the router CALLS the pricing handler exactly once — one dispatch, not a GET copy and a POST copy');
  // And that one dispatch is in the POST half: the GET read table is a literal map of action -> handler,
  // and this handler is not in it.
  ok(!/'pricing\.update':/.test(GS01), 'L2a it is not in the GET read table');

  ok(/\{ action: 'pricing\.update', handler: 'handlePricingUpdate_'/.test(GS63), 'L3  it is in SYS_REQUIRED_ACTIONS_');
  ok(GS63.indexOf("file: '73_api_v1_pricing_write.gs', symbol: 'PRW_BUILD_VERSION_'") > 0,
    'L4  73_ is a REQUIRED manifest owner from its first release');
  ok(RELORD.stampAtOrAfter((/symbol: 'PRW_BUILD_VERSION_', expected: '([^']+)'/.exec(GS63) || [])[1], R21),
    'L4a and the round it is expected at is R21 or later — a stamp never moves backwards');
  ok(!/73_api_v1_pricing_write\.gs'[^}]*optional: true/.test(GS63), 'L5  and deliberately not optional');
  // THE PROPERTY A STAMP EXISTS FOR: the file and the manifest tell the same story, so a half-finished
  // sync stays visible. That is what "declares the stamp the manifest expects" always meant; the R21
  // literal was only how it happened to be spelled in the round that introduced the file.
  var _prw = declaredIn(GS73, 'PRW_BUILD_VERSION_');
  ok(!!_prw && manifestAgrees('PRW_BUILD_VERSION_', _prw),
    'L6  73_ declares exactly what the manifest expects (' + _prw + ')');
  ok(RELORD.stampAtOrAfter(_prw, R21), 'L6a at or after the round that created it');

  var contract = Number(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(GS63)[1]);
  var listVer = Number(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+)/.exec(GS63)[1]);
  var pin = Number(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(DBAPI)[1]);
  // A FLOOR, because the contract may only RISE. PRICING-R2's claim was that it moved for a real reason —
  // pricing.update was genuinely new vocabulary — and the evidence for that is the action sitting in the
  // registry at a contract of at least 15, not the contract being exactly 15 forever.
  ok(contract >= 15, 'L7  the action contract is at or above the version that introduced pricing.update', contract);
  ok(GS63.indexOf("{ action: 'pricing.update', handler: 'handlePricingUpdate_'") > 0,
    'L7a because the action it was raised for is still in the registry');
  eq(listVer, 13, 'L8  and the required-action list version is the one pricing.update was added at');

  // L9 IS UNCHANGED, AND DELIBERATELY SO. PRICING-R3 tested this line: it added a backend action no page
  // calls, and leaving the pin behind looked reasonable. It is not how this repository works — eight suites
  // assert these two are EQUAL, one of them in the words "neither side may drift alone" — so the pin moved
  // with the contract and this assertion stands exactly as PRICING-R2 wrote it.
  eq(pin, contract, 'L9  the client pin AGREES with the deployment contract');
  ok(pin > 14, 'L10 and was RAISED from the pre-PRICING-R2 pin, never lowered');

  var _rel = declaredIn(GS63, 'SYS_DEPLOYMENT_RELEASE_');
  ok(RELORD.stampAtOrAfter(_rel, R21), 'L11 the release is R21 or later', _rel);
  var _sys = declaredIn(GS63, 'SYS_BUILD_VERSION_');
  ok(RELORD.stampAtOrAfter(_sys, R21) && manifestAgrees('SYS_BUILD_VERSION_', _sys),
    'L12 63_\'s own stamp moved with it and still agrees with its manifest row', _sys);
  // APPEND-ONLY is the property, not "last". R21 keeps its place while later rounds are added after it,
  // and stampAtOrAfter compares INDEXES — so a reordering would silently change what every floor in this
  // repository means.
  ok(RELORD.OWNER_STAMPS.indexOf(R21) !== -1, 'L13 R21 is still IN the release order');
  ok(RELORD.OWNER_STAMPS.indexOf(R21) === RELORD.OWNER_STAMPS.lastIndexOf(R21), 'L14 exactly once');
  ok(RELORD.OWNER_STAMPS.indexOf(_rel) >= RELORD.OWNER_STAMPS.indexOf(R21),
    'L14a and the current release sorts at or after it — the order is appended to, never rewritten');

  // 59_ moved because it changed. A read owner that gained a table is a partial-sync an action list cannot see.
  // 59_ genuinely did NOT move in PRICING-R3 — it gained nothing — so its stamp legitimately stays at R21,
  // and this equality is worth KEEPING rather than converting. A module stamp records the round its file
  // last CHANGED; marching it to the current release is the exact defect this repository already names.
  var _skd = declaredIn(GS59, 'SKD_BUILD_VERSION_');
  eq(_skd, R21, 'L15 59_ still records R21 — the round it last changed, not the current release');
  ok(manifestAgrees('SKD_BUILD_VERSION_', _skd), 'L16 and the manifest expects exactly that');
  ok(/\{ name: 'pricing_list', requiredCols: \[\], optional: true, include: 'pricing' \}/.test(GS59),
    'L17 pricing_list is include-gated and missing-safe — un-requested it costs nothing');

  // The page reads it on the call already in flight, and never fetches by hand.
  ok(/include: \{ regional: true, pricing: true \}/.test(PAGE), 'L18 the page asks for it on its existing read');
  eq((PAGE.match(/\bfetch\s*\(/g) || []), [], 'L19 and the page contains no raw fetch — writes go through KM.DB');
  ok(/window\.KM\.DB\.updatePricing/.test(PAGE), 'L20 it calls the canonical writer');
  ok(/window\.KM\.DB\.updatePricing = async function/.test(DBAPI), 'L21 which is defined in the API module');
  ok(/action: 'pricing\.update'/.test(DBAPI), 'L22 and addresses the one canonical action');
  eq((SRP_SRC.match(/\bfetch\s*\(|XMLHttpRequest/g) || []), [], 'L23 the pricing module performs no transport of its own at all');

  // The cache token. index.html must name bytes no browser can already be holding.
  eq(RELORD.staleAppTokenRefs(INDEX), [], 'L24 no asset is left behind on an older application token');
  eq(RELORD.misplacedIndexTokens(INDEX), [], 'L25 and no token is on the wrong file');
  var toks = RELORD.parseIndexTokens(INDEX);
  eq(toks['assets/js/pages/sku-regional-pricing.js'], RELORD.currentAppToken(), 'L26 the new module is on the current token');
  eq(toks['assets/js/pages/sku-regional-details.js'], RELORD.currentAppToken(), 'L27 and the changed page was rotated onto it');
  eq(toks['assets/js/api/operation-system-db-api.js'], RELORD.currentAppToken(), 'L28 as was the changed API module');
  ok(INDEX.indexOf('sku-regional-pricing.js') < INDEX.indexOf('sku-regional-details.js'),
    'L29 and the module loads BEFORE the page that calls it');

  // pricing_change_log was already a known table; nothing had to be invented to log into it.
  ok(/'pricing_change_log'/.test(GS03), 'L30 pricing_change_log was already a declared table');
}

// =============================================================================================================
section('N · THE SCREEN — three states are three badges, and every class has a rule');
// =============================================================================================================
{
  var CSS = readN('assets/css/pages/sku-regional-details.css');
  // A STATE CLASS WITH NO RULE renders as unstyled text, which is how a three-state badge quietly becomes
  // one state on screen while the data underneath is still three. This repository has met exactly that
  // before — four .psb-state classes shipped with zero declarations — so every class the pricing markup
  // emits is checked against the stylesheet rather than assumed.
  ['srd-pricing', 'srd-pr__head', 'srd-pr__row', 'srd-pr__lbl', 'srd-pr__val', 'srd-pr__eff', 'srd-pr__auto',
   'srd-pr__note', 'srd-own', 'srd-own--manual', 'srd-own--auto', 'srd-own--unknown',
   'srd-modal__sec', 'srd-pe', 'srd-pe__ctx', 'srd-pe__row', 'srd-pe__lbl', 'srd-errs'].forEach(function (c) {
    ok(CSS.indexOf('.' + c + ' ') !== -1 || CSS.indexOf('.' + c + ',') !== -1 || CSS.indexOf('.' + c + '{') !== -1,
      'N1  .' + c + ' has a CSS rule');
  });
  // Every one of those rules is scoped to the page section, like the rest of this stylesheet.
  ok(CSS.indexOf('#sku-regional-details-section .srd-own--unknown') !== -1,
    'N1b and the new rules are scoped to the section, as every other rule here is');

  // THE THREE BADGES MUST NOT LOOK THE SAME, or the distinction is decorative. "Not set" especially must
  // not read like "Auto": that is the exact confusion the three-state model exists to prevent.
  function ruleFor(c) {
    var at = CSS.indexOf('#sku-regional-details-section .' + c + ' {');
    if (at === -1) return '';
    return CSS.slice(at, CSS.indexOf('}', at));
  }
  var rAuto = ruleFor('srd-own--auto'), rUnk = ruleFor('srd-own--unknown'), rMan = ruleFor('srd-own--manual');
  ok(rAuto && rUnk && rMan, 'N2  all three badge states carry their own declarations');
  ok(rAuto.split('{')[1] !== rUnk.split('{')[1] && rUnk.split('{')[1] !== rMan.split('{')[1]
     && rAuto.split('{')[1] !== rMan.split('{')[1],
    'N3  and no two of the three are styled identically');

  // THE DIALOG IS PARENTED INSIDE THE SECTION, because every rule in this stylesheet is scoped to it.
  // Appended to <body> the markup would still be correct and would render as an unstyled full-screen block.
  ok(PAGE.indexOf("(el('sku-regional-details-section') || document.body).appendChild(ov)") !== -1,
    'N4  the import dialog is appended inside the page section, not to <body>');
  ok(PAGE.indexOf("ov.className = 'srd-modal-overlay'") !== -1,
    'N5  and uses the overlay class this page actually defines (one dash, not two)');

  // The stylesheet CHANGED, so its URL must change. It sat on the BASELINE token, whose bytes have been
  // served since the beginning — the one case where reuse is never licensed.
  var cssTok = RELORD.parseIndexTokens(INDEX)['assets/css/pages/sku-regional-details.css'];
  eq(cssTok, RELORD.currentAppToken(), 'N6  and the changed stylesheet was rotated off the baseline token');
}

// =============================================================================================================
section('O · PRICING-R4 — THE WHOLE CHAIN, BROWSER TEMPLATE TO SHEET TO AUDIT');
// =============================================================================================================
// Every part of this flow is tested above and the SEAM between the parts is not: section J stops at the
// file, section E starts from hand-written lines. Nothing has ever taken what the browser actually writes
// into a CSV, read it back with the real parser, and handed the result to the real handler. A key renamed
// on one side of that seam passes both suites and breaks every import.
//
// The rows here are the production shape AFTER PRICING-R3: auto_* current, every ownership flag blank.
{
  var R4_MKT = [
    { marketplaceSkuId: 'M1', sku: 'CO1100-R', company: 'KM', country: 'CA', marketplace: 'amazon', siteSku: 'SA1' },
    { marketplaceSkuId: 'M2', sku: 'CO1150-AG', company: 'KM', country: 'US', marketplace: 'amazon', siteSku: 'SA2' },
    { marketplaceSkuId: 'M3', sku: 'CO1200-B', company: 'KM', country: 'US', marketplace: 'amazon', siteSku: 'SA3' }
  ];

  // M1 is the interesting one: its minimum_price ALREADY equals auto_minimum_price, so USE AUTO on that
  // field changes the ownership without moving the price a customer sees. That is the only shape of AUTO
  // smoke that is safe to run against a live marketplace, and it needs to be provably distinguishable.
  function r4SheetRows() {
    return [
      priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', sku: 'CO1100-R', country: 'CA', marketplace: 'amazon',
        site_sku: 'SA1', currency: 'CAD', base_currency: 'USD',
        base_regular_price: 29.99, base_minimum_price: 24, base_msrp: 35,
        fx_rate: 1.41095, fx_rate_date: '2026-09-24',
        auto_regular_price: 42.31, auto_minimum_price: 33.86, auto_msrp: 49.38,
        regular_price: 44.99, minimum_price: 33.86, msrp: 49.38 }),
      priceRow({ pricing_id: 'P2', marketplace_sku_id: 'M2', sku: 'CO1150-AG', country: 'US', marketplace: 'amazon',
        site_sku: 'SA2', currency: 'USD', base_currency: 'USD',
        base_regular_price: 31.99, base_minimum_price: 26, base_msrp: 40,
        fx_rate: 1, fx_rate_date: '2026-09-24',
        auto_regular_price: 31.99, auto_minimum_price: 26, auto_msrp: 40,
        regular_price: 34.99, minimum_price: 26, msrp: 40 }),
      priceRow({ pricing_id: 'P3', marketplace_sku_id: 'M3', sku: 'CO1200-B', country: 'US', marketplace: 'amazon',
        site_sku: 'SA3', currency: 'USD', base_currency: 'USD',
        base_regular_price: 19.99, base_minimum_price: 15, base_msrp: 24,
        fx_rate: 1, fx_rate_date: '2026-09-24',
        auto_regular_price: 19.99, auto_minimum_price: 15, auto_msrp: 24,
        regular_price: 22.99, minimum_price: 15, msrp: 24 })
    ];
  }

  // The same three rows as the BROWSER holds them, which is what the template is built from.
  var R4_CC = [
    { pricingId: 'P1', marketplaceSkuId: 'M1', sku: 'CO1100-R', siteSku: 'SA1', country: 'CA', marketplace: 'amazon',
      currency: 'CAD', regularPrice: 44.99, minimumPrice: 33.86, msrp: 49.38,
      autoRegularPrice: 42.31, autoMinimumPrice: 33.86, autoMsrp: 49.38,
      regularPriceIsManual: null, minimumPriceIsManual: null, msrpIsManual: null,
      fxRate: 1.41095, fxRateDate: '2026-09-24', raw: {} },
    { pricingId: 'P2', marketplaceSkuId: 'M2', sku: 'CO1150-AG', siteSku: 'SA2', country: 'US', marketplace: 'amazon',
      currency: 'USD', regularPrice: 34.99, minimumPrice: 26, msrp: 40,
      autoRegularPrice: 31.99, autoMinimumPrice: 26, autoMsrp: 40,
      regularPriceIsManual: null, minimumPriceIsManual: null, msrpIsManual: null,
      fxRate: 1, fxRateDate: '2026-09-24', raw: {} },
    { pricingId: 'P3', marketplaceSkuId: 'M3', sku: 'CO1200-B', siteSku: 'SA3', country: 'US', marketplace: 'amazon',
      currency: 'USD', regularPrice: 22.99, minimumPrice: 15, msrp: 24,
      autoRegularPrice: 19.99, autoMinimumPrice: 15, autoMsrp: 24,
      regularPriceIsManual: null, minimumPriceIsManual: null, msrpIsManual: null,
      fxRate: 1, fxRateDate: '2026-09-24', raw: {} }
  ];

  // A person edits the downloaded file in a spreadsheet. Editing it as a GRID rather than by string
  // surgery is what they actually do, and it still goes out through the real CSV writer and back in
  // through the real parser.
  function editTemplate(csv, edits, P) {
    P = P || SRP;
    var g = P.parseCsv(csv), h = g[0];
    var rows = g.slice(1).map(function (r) {
      var o = {}; h.forEach(function (c, i) { o[c] = r[i]; }); return o;
    });
    rows.forEach(function (o) {
      var e = edits[o.marketplace_sku_id];
      if (e) Object.keys(e).forEach(function (k) { o[k] = e[k]; });
    });
    return P.toCsv(h, rows);
  }

  // The columns an import must never touch. base_* is PRICING-R2's canonical source layer and auto_* is
  // PRICING-R3's system reference; a manual price is neither, and an import that moved one would make the
  // next FX run disagree with the prices it is supposed to be reconciling.
  var R4_UNTOUCHABLE = ['base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp',
    'auto_regular_price', 'auto_minimum_price', 'auto_msrp', 'fx_rate', 'fx_rate_date'];
  function untouchableSnapshot(w) {
    return w.__price.__grid.slice(1).map(function (r) {
      return R4_UNTOUCHABLE.map(function (c) { return String(r[PRICING_HEADER.indexOf(c)]); }).join(String.fromCharCode(124));
    }).join(' // ');
  }
  function cellOf(w, rowIx, name) { return w.__price.__grid[rowIx][PRICING_HEADER.indexOf(name)]; }

  // ---- the template, as downloaded ----------------------------------------------------------------
  var csv0 = SRP.buildTemplateCsv(R4_CC, R4_MKT);
  var v0 = SRP.validateFile(csv0);
  eq([v0.ok, v0.lines.length, v0.lines.filter(SRP.lineTouches).length], [true, 3, 0],
    'O1  the downloaded template validates and asks for nothing');

  // ---- the edit a person makes: three smoke rows, one per field, plus a mixed row -------------------
  //
  //   M1  regular MANUAL 45.99   ·  minimum AUTO  ·  msrp NO_CHANGE      <- the mixed row (§3)
  //   M2  msrp MANUAL 41.50, everything else untouched
  //   M3  minimum MANUAL 16.50, everything else untouched
  var edited = editTemplate(csv0, {
    M1: { regular_price_mode: 'MANUAL', regular_price: '45.99', minimum_price_mode: 'AUTO' },
    M2: { msrp_mode: 'MANUAL', msrp: '41.50' },
    M3: { minimum_price_mode: 'MANUAL', minimum_price: '16.50' }
  });
  var v1 = SRP.validateFile(edited);
  eq([v1.ok, v1.errors.length], [true, 0], 'O2  the edited file passes file-shaped validation');
  var touched = v1.lines.filter(SRP.lineTouches);
  eq(touched.length, 3, 'O2a and three rows ask for something');

  // THE SEAM. Every key the server reads must be a key the browser wrote, and this is the only place the
  // two vocabularies meet.
  eq(Object.keys(touched[0]).sort(), ['currency', 'marketplace_sku_id', 'minimum_price_mode', 'msrp_mode',
    'regular_price', 'regular_price_mode'].sort(),
    'O3  a MANUAL+AUTO+NO_CHANGE line carries exactly the keys the server reads');
  ok(touched[0].minimum_price === undefined, 'O3a  and AUTO carries no value across the seam');

  // ---- PREVIEW: the same code path, writing nothing --------------------------------------------------
  var wPrev = makeWorld(GS73, { rows: r4SheetRows() });
  var envPrev = wPrev.handlePricingUpdate_({ dry_run: true, changed_by: 'smoke',
    change_reason: 'Price template import (preview)', lines: touched });
  eq([envPrev.success, envPrev.data.dry_run, envPrev.data.written, envPrev.data.changed_rows],
    [true, true, 0, 3], 'O4  the preview plans all three rows and writes nothing');
  eq(wPrev.__price.__writes, 0, 'O4a  zero physical writes');
  eq(wPrev.__log.__writes, 0, 'O4b  and nothing logged');
  eq([envPrev.data.rows[0].fields.regular_price.mode, envPrev.data.rows[0].fields.minimum_price.mode,
    envPrev.data.rows[0].fields.msrp.mode], ['MANUAL', 'AUTO', 'NO_CHANGE'],
    'O4c  and the receipt names all three modes of the mixed row');

  // ---- WRITE ----------------------------------------------------------------------------------------
  var w = makeWorld(GS73, { rows: r4SheetRows() });
  var before = untouchableSnapshot(w);
  var env = w.handlePricingUpdate_({ changed_by: 'smoke', change_reason: 'PRICING-R4 smoke', lines: touched });
  eq([env.success, env.data.written, env.data.changed_rows], [true, 3, 3], 'O5  three rows written');

  // §3 THE MIXED ROW. One row, three different answers, and the third answer is silence.
  eq(cellOf(w, 1, 'regular_price'), 45.99, 'O6  MANUAL wrote the regular price');
  eq(cellOf(w, 1, 'regular_price_is_manual'), 'TRUE', 'O6a  and took ownership of it');
  eq(cellOf(w, 1, 'minimum_price'), '', 'O6b  PRICING-R4G — AUTO CLEARED the minimum override; the row resolves through auto_minimum_price now');
  eq(cellOf(w, 1, 'minimum_price_is_manual'), 'FALSE', 'O6c  and handed that field to the system');
  eq(cellOf(w, 1, 'msrp'), 49.38, 'O6d  NO_CHANGE left the MSRP exactly as it was');
  eq(cellOf(w, 1, 'msrp_is_manual'), '', 'O6e  and its ownership is still UNSTATED — not classified by a neighbour');

  // The other two rows moved one field each and nothing else.
  eq([cellOf(w, 2, 'msrp'), cellOf(w, 2, 'msrp_is_manual')], [41.5, 'TRUE'], 'O7  the MSRP-only row');
  eq([cellOf(w, 2, 'regular_price'), cellOf(w, 2, 'regular_price_is_manual')], [34.99, ''],
    'O7a  with its regular price and its unstated ownership both intact');
  eq([cellOf(w, 3, 'minimum_price'), cellOf(w, 3, 'minimum_price_is_manual')], [16.5, 'TRUE'], 'O7b  the minimum-only row');
  eq([cellOf(w, 3, 'msrp'), cellOf(w, 3, 'msrp_is_manual')], [24, ''], 'O7c  likewise untouched elsewhere');

  // §8 — NOT ONE base_* OR auto_* CELL MOVED. Compared over the whole sheet rather than per row, because
  // a manual import that wrote an auto value would most likely write it on a row nobody was looking at.
  eq(untouchableSnapshot(w), before, 'O8  no base_*, auto_*, fx_rate or fx_rate_date cell changed anywhere');

  // §6 — ONE AUDIT ENTRY PER FIELD THAT ACTUALLY CHANGED, and none for the field that did not.
  var logs = w.__log.__grid.slice(1);
  eq([env.data.logged, logs.length], [4, 4], 'O9  four field changes, four audit entries');
  var lc = function (n) { return LOG_HEADER.indexOf(n); };
  var seenLog = logs.map(function (r) { return r[lc('pricing_id')] + ':' + r[lc('field_name')] + ':' + r[lc('change_type')]; }).sort();
  eq(seenLog, ['P1:minimum_price:RETURN_TO_AUTO', 'P1:regular_price:MANUAL_SET',
    'P2:msrp:MANUAL_SET', 'P3:minimum_price:MANUAL_SET'],
    'O9a  each typed by what happened, and the NO_CHANGE field has no entry at all');

  // STILL THE SAFEST POSSIBLE AUTO SMOKE AGAINST A LIVE SITE, and it stayed safe through the contract
  // change. M1's minimum override already equalled its auto value, so clearing it changes what is STORED
  // and not what the site charges: the resolver answers 33.86 before and after. The audit row is the only
  // record of the removal, which is why old_value must still carry the number that was there.
  var retAuto = logs.filter(function (r) { return r[lc('change_type')] === 'RETURN_TO_AUTO'; })[0];
  eq([retAuto[lc('old_value')], retAuto[lc('new_value')]], ['33.86', ''],
    'O10 the hand-back records the override that was REMOVED, and an empty new value');

  // ---- THE CONTEXT COLUMNS ARE CONTEXT ---------------------------------------------------------------
  // master_sku / site_sku / company / country / marketplace exist so a person can see which row they are
  // editing. If any of them could select the row, a stale download would write to the wrong site.
  var relabelled = editTemplate(csv0, {
    M1: { master_sku: 'CO9999-X', site_sku: 'WRONG', company: 'OTHER', country: 'JP', marketplace: 'rakuten',
      regular_price_mode: 'MANUAL', regular_price: '45.99' }
  });
  var v2 = SRP.validateFile(relabelled);
  var t2 = v2.lines.filter(SRP.lineTouches);
  eq([v2.ok, t2.length, t2[0].marketplace_sku_id], [true, 1, 'M1'], 'O11 a relabelled row is still addressed by marketplace_sku_id');
  ok(t2[0].master_sku === undefined && t2[0].site_sku === undefined && t2[0].company === undefined,
    'O11a and none of the context columns crosses the seam at all');
  var w2 = makeWorld(GS73, { rows: r4SheetRows() });
  var env2 = w2.handlePricingUpdate_({ changed_by: 'smoke', lines: t2 });
  eq([env2.data.written, cellOf(w2, 1, 'regular_price')], [1, 45.99], 'O11b and the write lands on M1 regardless');

  // ---- REVERSIBILITY, AND ITS LIMIT ------------------------------------------------------------------
  // THE VALUE IS REVERSIBLE. THE OWNERSHIP IS NOT. pricingWriteFlag_ returns TRUE or FALSE and there is no
  // third word, so nothing in this action can return a flag to blank. An operator smoke leaves the row
  // classified, and that is a property of the smoke rather than an accident of it.
  var wRev = makeWorld(GS73, { rows: r4SheetRows() });
  wRev.handlePricingUpdate_({ changed_by: 'smoke', lines: [{ marketplace_sku_id: 'M3', currency: 'USD',
    regular_price_mode: 'MANUAL', regular_price: '25.99' }] });
  eq([cellOf(wRev, 3, 'regular_price'), cellOf(wRev, 3, 'regular_price_is_manual')], [25.99, 'TRUE'],
    'O12 the smoke sets a manual price');
  var envBack = wRev.handlePricingUpdate_({ changed_by: 'smoke', lines: [{ marketplace_sku_id: 'M3', currency: 'USD',
    regular_price_mode: 'MANUAL', regular_price: '22.99' }] });
  eq([envBack.data.written, cellOf(wRev, 3, 'regular_price')], [1, 22.99],
    'O12a and the original value is restorable exactly');
  eq(cellOf(wRev, 3, 'regular_price_is_manual'), 'TRUE',
    'O12b but the flag stays TRUE — the rollback restores the price, not the silence');
  eq(W.pricingWriteFlag_(true) + '/' + W.pricingWriteFlag_(false), 'TRUE/FALSE',
    'O12c because the writer has exactly two words and blank is not one of them');
  ok(!/cells\[spec\.flag\]\s*=\s*''/.test(bare(GS73)),
    'O12d and no branch writes an empty flag, so UNKNOWN is unreachable from here');

  // ---- THE WRITE SET, ACROSS EVERY MODE --------------------------------------------------------------
  // The per-field planner may only ever name the effective field, its own flag, and the legacy descriptor.
  // Checked over every mode against a row that HAS a value in every column, so a leak has something to
  // leak: a planner reading auto_* to write it back would look correct on a row where auto_* was blank.
  var ALLOWED = {};
  W.PRICING_FIELDS_.forEach(function (sp) { ALLOWED[sp.field] = 1; ALLOWED[sp.flag] = 1; });
  ALLOWED.price_source = 1;
  var leaked = [];
  ['NO_CHANGE', 'MANUAL', 'AUTO'].forEach(function (mode) {
    W.PRICING_FIELDS_.forEach(function (sp) {
      var full = { currency: 'USD', regular_price: 10, minimum_price: 8, msrp: 12,
        auto_regular_price: 9, auto_minimum_price: 7, auto_msrp: 11,
        base_regular_price: 5, base_minimum_price: 4, base_msrp: 6, base_currency: 'USD',
        fx_rate: 1, fx_rate_date: '2026-09-24' };
      var line = { marketplace_sku_id: 'M' };
      line[sp.mode] = mode;
      if (mode === 'MANUAL') line[sp.field] = '99';
      var pl = W.pricingPlanRow_(full, line);
      Object.keys(pl.cells).forEach(function (k) { if (!ALLOWED[k]) leaked.push(mode + ':' + sp.field + ':' + k); });
    });
  });
  eq(leaked, [], 'O13 no mode, on any field, ever names a base_*, auto_* or fx column in its write set');
}


// =============================================================================================================
section('M · MUTANTS — every fault is one a person could plausibly write');
// =============================================================================================================
function nl(src, t) { return src.indexOf('\r\n') !== -1 ? t.split('\n').join('\r\n') : t; }
function faulted(src, from, to, tag) {
  var a = nl(src, from), b = nl(src, to);
  if (src.indexOf(a) === -1) throw new Error(tag + ' anchor drifted — the mutant would inject nothing');
  return src.split(a).join(b);
}
function mut(label, from, to, probe) {
  var caught = false;
  try {
    var src = faulted(GS73, from, to, label);
    if (src === GS73) throw new Error(label + ' changed nothing');
    caught = probe(makeWorld(src)) === true;
  } catch (e) {
    if (/anchor drifted|changed nothing/.test(e.message)) { fail++; console.error('FAIL ' + label + ' — ' + e.message); return; }
    caught = true;   // a mutant that makes the module throw is caught
  }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

// M1 — the defect this whole round exists to prevent: reading a blank flag as FALSE.
mut('M1  a blank ownership flag is read as AUTO instead of UNKNOWN',
  "  if (s === '') return PRICING_OWNER_UNKNOWN_;",
  "  if (s === '') return PRICING_OWNER_AUTO_;",
  function (w) { return w.pricingReadFlag_('') !== 'UNKNOWN'; });

// M2 — PRICING-R4G TURNED THIS GUARD AROUND. It protected "USE AUTO must refuse when auto is blank",
// which was right while the action wrote a value. It clears now and needs no value, so the danger moved:
// the mutant is USE AUTO going back to COPYING, which re-freezes the price against every later FX run and
// re-breaks the one repair a pending_fx row has.
mut('M2  USE AUTO copies auto into the override instead of clearing it',
  "  out.cells[spec.field] = '';",
  "  out.cells[spec.field] = pricingReadNumber_(row[spec.auto]).value;",
  function (w) {
    var p = w.pricingPlanField_({ currency: 'USD', regular_price: 12, auto_regular_price: 9.99 }, w.PRICING_FIELDS_[0], 'AUTO', '', 'USD');
    return p.cells.regular_price === 9.99;
  });

// M3 — MANUAL accepts a blank price, which publishes a free product.
mut('M3  MANUAL accepts a blank price',
  "    if (!supplied.present) {",
  "    if (false) {",
  function (w) {
    var p = w.pricingPlanField_({ currency: 'USD', regular_price: 12 }, w.PRICING_FIELDS_[0], 'MANUAL', '', 'USD');
    return p.error === null;
  });

// M4 — a blank mode is read as AUTO. §8's exact prohibition.
mut('M4  a blank mode cell is read as AUTO rather than NO_CHANGE',
  "  if (s === '') return 'NO_CHANGE';",
  "  if (s === '') return 'AUTO';",
  function (w) { return w.pricingReadMode_('') !== 'NO_CHANGE'; });

// M5 — an unsupported mode is silently ignored, which drops an operator's edit without a word.
mut('M5  an unrecognised mode is ignored instead of refused',
  "  return PRICING_MODES_.indexOf(s) === -1 ? null : s;",
  "  return PRICING_MODES_.indexOf(s) === -1 ? 'NO_CHANGE' : s;",
  function (w) {
    var r = w.pricingPlanRow_({ currency: 'USD' }, { marketplace_sku_id: 'M', regular_price_mode: 'DELETE' });
    return r.ok === true;
  });

// M6 — the batch keeps the good lines when one is bad: a half-applied price file.
mut('M6  a failed batch still offers its valid lines for writing',
  "  if (!out.ok) { out.plans = []; out.changed_rows = 0; out.unchanged_rows = 0; }",
  "  // atomicity removed",
  function (w) {
    var ix = { M1: { rowNumber: 2, values: { pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD', regular_price: 10 } } };
    var b = w.pricingPlanBatch_([{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' },
      { marketplace_sku_id: 'NOPE', regular_price_mode: 'MANUAL', regular_price: '1' }], ix);
    return b.plans.length > 0;
  });

// M7 — the handler writes anyway after validation failed.
mut('M7  the handler proceeds to write after a failed validation',
  "  if (!plan.ok) {\n    return prwEnvelope_(false,",
  "  if (false) {\n    return prwEnvelope_(false,",
  // The probe is the SUCCESS REPORT, not the write count. Atomicity already emptied the plan, so removing
  // this guard writes nothing — it reports a refused batch as written, which is the worse of the two: the
  // operator is told their prices landed and has no reason to look.
  function (w) {
    var ww = makeWorld(faulted(GS73, "  if (!plan.ok) {\n    return prwEnvelope_(false,", "  if (false) {\n    return prwEnvelope_(false,", 'M7'),
      { rows: [priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD', regular_price: 10, auto_regular_price: 9 })] });
    var env = ww.handlePricingUpdate_({ lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: 'oops' }] });
    return env.success === true;
  });

// M8 — a duplicate identity inside one batch is accepted, so two answers both claim to be final.
mut('M8  the same identity twice in one batch is accepted',
  "    if (seen[key]) {",
  "    if (false) {",
  function (w) {
    var ix = { M1: { rowNumber: 2, values: { pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD', regular_price: 10 } } };
    var b = w.pricingPlanBatch_([{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' },
      { marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '12' }], ix);
    return b.ok === true;
  });

// M9 — a manual price is ROUNDED to the currency's precision instead of refused. Silent correction of money.
mut('M9  a manual price is rounded to fit the currency instead of refused',
  "    if (pricingExceedsPrecision_(supplied.value, currency)) {",
  "    if (false) { supplied.value = pricingRoundFx_(supplied.value, currency);",
  function (w) {
    var p = w.pricingPlanField_({ currency: 'JPY', regular_price: 1000 }, w.PRICING_FIELDS_[0], 'MANUAL', '1234.56', 'JPY');
    return p.error === null;
  });

// M10 — NA is read as a number, which is the §6 hazard from the previous round's audit.
mut('M10 NA is read as a price rather than as "deliberately none"',
  "  if (s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return { present: false, na: true, value: null, invalid: false };",
  "  if (s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return { present: true, na: true, value: 0, invalid: false };",
  function (w) { return w.pricingReadNumber_('NA').present === true; });

// M11 — the flags stop being independent: one edit marks the whole row.
mut('M11 one field\'s edit marks every field manual',
  "    if (p.cells[spec.flag] !== undefined) {",
  "    PRICING_FIELDS_.forEach(function (o) { res.cells[o.flag] = 'TRUE'; });\n    if (p.cells[spec.flag] !== undefined) {",
  function (w) {
    var r = w.pricingPlanRow_({ currency: 'USD', regular_price: 10, minimum_price: 8, msrp: 12 },
      { marketplace_sku_id: 'M', regular_price_mode: 'MANUAL', regular_price: '15' });
    return r.cells.minimum_price_is_manual !== undefined;
  });

// M12 — the legacy row-level descriptor starts claiming something when a field is still unknown.
mut('M12 price_source is written even when a field\'s ownership is unstated',
  "  return null;   // mixed with an unknown, or nothing decided — say nothing rather than something wrong",
  "  return 'auto_fx';",
  function (w) {
    return w.pricingDeriveLegacySource_({ regular_price_is_manual: 'MANUAL', minimum_price_is_manual: 'UNKNOWN', msrp_is_manual: 'AUTO' }) !== null;
  });

// M13 — the audit is written for a change that did not happen, making the log uncountable.
mut('M13 an unchanged field still writes an audit entry',
  "    if (!effChanged && !flagChanged) return out;   // already exactly this, owned by exactly this person",
  "    // no-op detection removed",
  function (w) {
    var p = w.pricingPlanField_({ currency: 'USD', regular_price: 12.5, regular_price_is_manual: 'TRUE' }, w.PRICING_FIELDS_[0], 'MANUAL', '12.50', 'USD');
    return p.log !== null;
  });

// M14 — a schema failure is swallowed and the write proceeds against an unprovisioned sheet.
//
// AN EARLIER DRAFT OF THIS MUTANT SURVIVED, and the reason is worth keeping: the handler guards TWO sheets,
// and blanket-failing every column check let the CHANGE-LOG guard refuse on the pricing sheet's behalf. The
// mutant described the right defect and was caught by the wrong guard. It is now driven against a world
// where only the pricing flags are missing — the exact state every project is in before the migration runs,
// and the one case where this guard is the only thing standing between a legacy sheet and a write.
mut('M14 an unprovisioned schema no longer stops the write',
  "    prodRequireColumns_(priceSheet, PRICING_MANUAL_FLAG_COLUMNS_);",
  "    try { prodRequireColumns_(priceSheet, PRICING_MANUAL_FLAG_COLUMNS_); } catch (ig) {}",
  function (w) {
    var ww = makeWorld(faulted(GS73, "    prodRequireColumns_(priceSheet, PRICING_MANUAL_FLAG_COLUMNS_);",
      "    try { prodRequireColumns_(priceSheet, PRICING_MANUAL_FLAG_COLUMNS_); } catch (ig) {}", 'M14'),
      { legacyPriceHeader: true, rows: [LEGACY_ROW] });
    var env = ww.handlePricingUpdate_({ lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' }] });
    return env.success === true;
  });

// M15 — a dry run writes. The preview stops being a preview.
mut('M15 a dry run reaches the write path',
  "  if (dryRun) {",
  "  if (false) {",
  function (w) {
    var ww = makeWorld(faulted(GS73, "  if (dryRun) {", "  if (false) {", 'M15'),
      { rows: [priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'USD', regular_price: 10, auto_regular_price: 9 })] });
    ww.handlePricingUpdate_({ dry_run: true, lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' }] });
    return ww.__price.__writes > 0;
  });

// M16 — a row is addressed by master SKU, so the write lands on whichever site the sheet listed first.
mut('M16 a pricing row is addressed by master SKU instead of marketplace_sku_id',
  "function pricingLineKey_(line) { return pricingStr_(line && line.marketplace_sku_id); }",
  "function pricingLineKey_(line) { return pricingStr_((line && line.marketplace_sku_id) || (line && line.master_sku)); }",
  function (w) { return w.pricingLineKey_({ master_sku: 'SKU-A' }) !== ''; });

// M17 — the manual writer also writes back auto_*. Nothing visible breaks: the value written is the one
// already there. It breaks the NEXT FX run, which compares its computed reference against a column a
// price editor has been quietly maintaining.
mut('M17 a manual-path write names an auto_* column in its write set',
  "  out.cells[spec.field] = '';",
  "  out.cells[spec.field] = ''; out.cells[spec.auto] = pricingReadNumber_(row[spec.auto]).value;",
  function (w) {
    var pl = w.pricingPlanRow_({ currency: 'USD', regular_price: 12.5, auto_regular_price: 9.99 },
      { marketplace_sku_id: 'M', regular_price_mode: 'AUTO' });
    return pl.cells.auto_regular_price !== undefined;
  });

// M18 — NO_CHANGE classifies the field as AUTO. This is the whole round's hazard wearing the one mode
// that is supposed to be silence: uploading an UNEDITED template would classify the entire price book.
mut('M18 NO_CHANGE writes an ownership flag instead of nothing',
  "  if (mode === 'NO_CHANGE') return out;",
  "  if (mode === 'NO_CHANGE') { out.changed = true; out.cells[spec.flag] = pricingWriteFlag_(false); return out; }",
  function (w) {
    var pl = w.pricingPlanRow_({ currency: 'USD', regular_price: 10, minimum_price: 8, msrp: 12 },
      { marketplace_sku_id: 'M' });
    return Object.keys(pl.cells).length > 0;
  });

// M19 — THE SEAM ITSELF, mutated on the BROWSER side. The file validates, the preview looks right, and
// the value never crosses into the payload. Only a test that runs the real parser into the real handler
// can see it; section J would pass and section E would pass.
function srpFaulted(from, to, tag) {
  if (SRP_SRC.indexOf(from) === -1) throw new Error('anchor drifted :: ' + tag);
  var S = { console: console, Object: Object, Array: Array, String: String, Number: Number,
    Math: Math, JSON: JSON, isFinite: isFinite, RegExp: RegExp, module: { exports: {} } };
  vm.createContext(S);
  vm.runInContext(SRP_SRC.replace(from, to), S, { filename: 'sku-regional-pricing.js' });
  return S.module.exports;
}
{
  var label = 'M19 the browser drops a MANUAL price on its way into the payload';
  var caught = false;
  try {
    var P = srpFaulted('line[spec.key] = val;', '/* the value never reaches the line */;', 'M19');
    var mkt = [{ marketplaceSkuId: 'M1', sku: 'S', company: 'KM', country: 'US', marketplace: 'amazon', siteSku: 'SA' }];
    var cc = [{ pricingId: 'P1', marketplaceSkuId: 'M1', sku: 'S', siteSku: 'SA', country: 'US',
      marketplace: 'amazon', currency: 'USD', regularPrice: 10, autoRegularPrice: 9, raw: {} }];
    var g = P.parseCsv(P.buildTemplateCsv(cc, mkt)), h = g[0];
    var o = {}; h.forEach(function (c, i) { o[c] = g[1][i]; });
    o.regular_price_mode = 'MANUAL'; o.regular_price = '11';
    var vv = P.validateFile(P.toCsv(h, [o]));
    // The file still passes — that is the point of the mutant.
    var ww = makeWorld(GS73, { rows: [priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1',
      currency: 'USD', regular_price: 10, auto_regular_price: 9 })] });
    var ee = ww.handlePricingUpdate_({ changed_by: 't', lines: vv.lines.filter(P.lineTouches) });
    caught = ee.success === false || ww.__price.__writes === 0;
  } catch (e) {
    if (/anchor drifted/.test(e.message)) { fail++; console.error('FAIL ' + label + ' — ' + e.message); }
    else caught = true;
  }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

// =============================================================================================================
console.log('\n' + pass + ' passed / ' + fail + ' failed   ·   ' + (mutCaught + mutSurvived) + ' mutants, ' + mutSurvived + ' survived');
process.exit(fail === 0 ? 0 : 1);
