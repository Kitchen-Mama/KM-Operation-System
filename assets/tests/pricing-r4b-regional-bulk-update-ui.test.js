// Kitchen Mama Operation System — PRICING-R4B · REGIONAL DETAILS BULK UPDATE
// =============================================================================================================
// The pricing import contract was proven in PRICING-R4 and it was already wired. What was missing was a way
// to REACH it: the entry sat inside one SKU's Marketplace tab, and the template it produced covered every
// pricing row in the workspace rather than the target being looked at. So a "bulk update" meant downloading
// the whole price book to change four rows in one country.
//
// This round adds a page-level entry and a TARGET — one country, one marketplace — and the whole risk of it
// is that a scoped import becomes a second import contract that drifts from the first. It does not: every
// test below runs the SAME validateFile, the SAME template builder and the SAME pricing.update transport,
// with the new layer only ADDING refusals in front of them.
//
//   A  the category step: a list, so a second category is a row rather than a redesign
//   B  the target scopes, derived from the pricing rows that exist
//   C  country -> marketplace filtering
//   D  the currency notice, and where the currency is allowed to come from
//   E  the template is scoped to the target
//   F  currency mismatch, cross-target rows, and AUTO carrying a value
//   G  the preview is driven by the server receipt, not by a second opinion
//   H  preview before write, and one write path
//   I  base_*, auto_* and fx_* are not writable through any of it
//   J  the entry point exists and every class it emits has a CSS rule
//   K  mutants
//
// Run: node assets/tests/pricing-r4b-regional-bulk-update-ui.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var SRP = require('../js/pages/sku-regional-pricing.js');
var SRP_SRC = readN('assets/js/pages/sku-regional-pricing.js');
var PAGE = readN('assets/js/pages/sku-regional-details.js');
var HTML = readN('assets/html/pages/sku-regional-details.html');
var CSS = readN('assets/css/pages/sku-regional-details.css');

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

// ---- the fixture -------------------------------------------------------------------------------------
// Three targets, and the third exists to be REFUSED: its two rows disagree about currency, which is a data
// question nobody has settled and not something an import may pick a side in.
function pr(o) {
  var b = { pricingId: '', marketplaceSkuId: '', sku: '', siteSku: '', country: '', marketplace: '',
    currency: '', regularPrice: null, minimumPrice: null, msrp: null,
    autoRegularPrice: null, autoMinimumPrice: null, autoMsrp: null,
    regularPriceIsManual: null, minimumPriceIsManual: null, msrpIsManual: null,
    fxRate: null, fxRateDate: '', raw: {} };
  Object.keys(o).forEach(function (k) { b[k] = o[k]; });
  return b;
}
function ms(id, o) {
  var b = { marketplaceSkuId: id, sku: 'SKU-' + id, company: 'KM', country: '', marketplace: '', siteSku: 'S-' + id };
  Object.keys(o || {}).forEach(function (k) { b[k] = o[k]; });
  return b;
}

var PRICING = [
  pr({ pricingId: 'P1', marketplaceSkuId: 'M1', sku: 'CO1100-R', siteSku: 'SA1', country: 'CA', marketplace: 'amazon',
    currency: 'CAD', regularPrice: 44.99, minimumPrice: 39.99, msrp: 59.99,
    autoRegularPrice: 42.31, autoMinimumPrice: 39.99, autoMsrp: 56.44 }),
  pr({ pricingId: 'P2', marketplaceSkuId: 'M2', sku: 'CO1150-AG', siteSku: 'SA2', country: 'CA', marketplace: 'amazon',
    currency: 'CAD', regularPrice: 54.99, minimumPrice: 44.99, msrp: 64.99,
    autoRegularPrice: 52.31, autoMinimumPrice: 43.99, autoMsrp: 62.44 }),
  pr({ pricingId: 'P3', marketplaceSkuId: 'M3', sku: 'CO1100-R', siteSku: 'SU1', country: 'US', marketplace: 'amazon',
    currency: 'USD', regularPrice: 34.99, minimumPrice: 29.99, msrp: 39.99,
    autoRegularPrice: 29.99, autoMinimumPrice: 29.99, autoMsrp: 35 }),
  // JP/rakuten: two rows, two currencies. Not importable, on purpose.
  pr({ pricingId: 'P4', marketplaceSkuId: 'M4', sku: 'CO1100-R', siteSku: 'SJ1', country: 'JP', marketplace: 'rakuten',
    currency: 'JPY', regularPrice: 4736, minimumPrice: 4000, msrp: 5527,
    autoRegularPrice: 4736, autoMinimumPrice: 4000, autoMsrp: 5527 }),
  pr({ pricingId: 'P5', marketplaceSkuId: 'M5', sku: 'CO1150-AG', siteSku: 'SJ2', country: 'JP', marketplace: 'rakuten',
    currency: 'USD', regularPrice: 40, minimumPrice: 30, msrp: 45,
    autoRegularPrice: 40, autoMinimumPrice: 30, autoMsrp: 45 })
];
var MKT = [
  ms('M1', { country: 'CA', marketplace: 'amazon', siteSku: 'SA1', sku: 'CO1100-R' }),
  ms('M2', { country: 'CA', marketplace: 'amazon', siteSku: 'SA2', sku: 'CO1150-AG' }),
  ms('M3', { country: 'US', marketplace: 'amazon', siteSku: 'SU1', sku: 'CO1100-R' }),
  ms('M4', { country: 'JP', marketplace: 'rakuten', siteSku: 'SJ1', sku: 'CO1100-R' }),
  ms('M5', { country: 'JP', marketplace: 'rakuten', siteSku: 'SJ2', sku: 'CO1150-AG', company: 'KM2' })
];

var SCOPES = SRP.scopes(PRICING, MKT);
var CA = SRP.findScope(SCOPES, 'CA|amazon');
var US = SRP.findScope(SCOPES, 'US|amazon');
var JP = SRP.findScope(SCOPES, 'JP|rakuten');

/** Edit a downloaded template the way a person edits it in a spreadsheet: as a grid. */
function editTemplate(csv, edits) {
  var g = SRP.parseCsv(csv), h = g[0];
  var rows = g.slice(1).map(function (r) { var o = {}; h.forEach(function (c, i) { o[c] = r[i]; }); return o; });
  rows.forEach(function (o) {
    var e = edits[o.marketplace_sku_id];
    if (e) Object.keys(e).forEach(function (k) { o[k] = e[k]; });
  });
  return SRP.toCsv(h, rows);
}
function addRow(csv, o) {
  var g = SRP.parseCsv(csv), h = g[0];
  var rows = g.slice(1).map(function (r) { var x = {}; h.forEach(function (c, i) { x[c] = r[i]; }); return x; });
  rows.push(o);
  return SRP.toCsv(h, rows);
}

// =============================================================================================================
section('A · THE CATEGORY STEP — a list, so a second category is a row rather than a redesign');
// =============================================================================================================
{
  ok(/var SRD_UPDATE_CATEGORIES = \[/.test(PAGE), 'A1  categories are declared as a list');
  ok(/key: 'pricing', label: 'Pricing', available: true/.test(PAGE), 'A2  Pricing is the one available category');
  ok(/Update marketplace-level Regular Price, Minimum Price and MSRP\./.test(PAGE),
    'A3  with the description the spec names');
  ok(/Update Regional SKU Data/.test(PAGE), 'A4  the dialog is titled Update Regional SKU Data');
  // A future category is rendered DISABLED rather than hidden, so the step never looks like it grew a
  // feature the day one shipped.
  ok(/c\.available \? 'onclick[\s\S]{0,60}: 'disabled'/.test(PAGE), 'A5  an unavailable category renders disabled');
  ok(/srdBulkPickCategory/.test(PAGE), 'A6  and choosing one advances the step');
  // No future category is implemented, and none is half-declared either.
  var cats = PAGE.split('var SRD_UPDATE_CATEGORIES = [')[1].split('];')[0];
  eq((cats.match(/key: '/g) || []).length, 1, 'A7  exactly one category is declared — nothing is stubbed in');
}

// =============================================================================================================
section('B · THE TARGETS — derived from the pricing rows that exist, not from a list of marketplaces');
// =============================================================================================================
{
  eq(SCOPES.map(function (s) { return s.key; }), ['CA|amazon', 'JP|rakuten', 'US|amazon'],
    'B1  one target per country + marketplace that HAS pricing rows');
  eq([CA.country, CA.marketplace, CA.currency, CA.rowCount], ['CA', 'amazon', 'CAD', 2], 'B2  the CA target');
  eq(Object.keys(CA.ids).sort(), ['M1', 'M2'], 'B2a carrying exactly its own marketplace_sku_ids');
  eq([US.currency, US.rowCount], ['USD', 1], 'B3  the US target');

  // THE REFUSAL THAT MATTERS. Two currencies in one target is not a currency to choose between: writing the
  // minority rows in the majority's currency would be inventing a price.
  eq(JP.currency, null, 'B4  a target whose rows disagree about currency has NO currency');
  eq(JP.currencyList, ['JPY', 'USD'], 'B4a and both are reported rather than one being picked');
  eq(JP.companyList, ['KM', 'KM2'], 'B5  companies present in a target are listed, since pricing_list carries none');

  // A row with no country or no marketplace cannot be targeted at all, so it forms no target.
  var thin = SRP.scopes([pr({ marketplaceSkuId: 'MX', currency: 'USD' })], [ms('MX')]);
  eq(thin.length, 0, 'B6  a row with neither country nor marketplace produces no target');
}

// =============================================================================================================
section('C · COUNTRY -> MARKETPLACE FILTERING');
// =============================================================================================================
{
  eq(SRP.countriesOf(SCOPES), ['CA', 'JP', 'US'], 'C1  the country list is the countries that have targets');
  eq(SRP.scopesForCountry(SCOPES, 'CA').map(function (s) { return s.marketplace; }), ['amazon'],
    'C2  choosing a country narrows the marketplace list to that country');
  eq(SRP.scopesForCountry(SCOPES, 'ca').map(function (s) { return s.key; }), ['CA|amazon'],
    'C2a case-insensitively, because a country code typed by hand is not a promise about case');
  eq(SRP.scopesForCountry(SCOPES, 'DE'), [], 'C3  a country with no targets narrows to nothing');
  eq(SRP.findScope(SCOPES, 'NOPE|x'), null, 'C4  an unknown target key resolves to nothing, never to the first one');
}

// =============================================================================================================
section('D · THE CURRENCY NOTICE — and where the currency is allowed to come from');
// =============================================================================================================
{
  ok(/Pricing updates for this target use/.test(PAGE), 'D1  the notice states the target currency');
  ok(/must use/.test(PAGE) && /cannot be[\s\S]{0,40}changed through this import/.test(PAGE),
    'D2  and that an import may not change it');

  // NOT FROM THE BROWSER. A locale-derived currency would be right on the machine that wrote the code and
  // wrong on the operator's.
  eq((PAGE.match(/navigator\.language|toLocaleString|Intl\.NumberFormat/g) || []), [],
    'D3  the page derives no currency from the browser locale');

  // THE SOURCE IS pricing_list.currency, and that is the column the SERVER checks an uploaded line against
  // (73_ CURRENCY_MISMATCH compares the file to the ROW). A notice quoting any other source could tell an
  // operator to fill a file the writer then rejects.
  ok(/pricing_list\.currency/.test(SRP_SRC), 'D4  the module says which column the currency comes from');
  ok(/FILE_CURRENCY_NOT_TARGET/.test(SRP_SRC), 'D4a and refuses a file that would hit the server refusal');
  var scoped = SRP.scopes([pr({ marketplaceSkuId: 'M9', country: 'CA', marketplace: 'amazon', currency: 'cad' })],
    [ms('M9', { country: 'CA', marketplace: 'amazon' })]);
  eq(scoped[0].currency, 'CAD', 'D5  a lower-case currency cell is the same currency, not a second one');
}

// =============================================================================================================
section('E · THE TEMPLATE IS SCOPED TO THE TARGET');
// =============================================================================================================
{
  var csv = SRP.buildTemplateCsv(CA.rows, MKT);
  var g = SRP.parseCsv(csv);
  eq(g.length - 1, 2, 'E1  the template carries only the target\'s rows');
  eq(g.slice(1).map(function (r) { return r[0]; }).sort(), ['M1', 'M2'], 'E1a and they are the target\'s ids');
  ok(csv.indexOf('M3') === -1 && csv.indexOf('M4') === -1, 'E1b no row from another target appears');

  // Unedited, it asks for nothing — which is what makes the round trip safe to experiment with.
  var v = SRP.validateBulkFile(csv, CA);
  eq([v.ok, v.lines.length, v.lines.filter(SRP.lineTouches).length], [true, 2, 0],
    'E2  an unedited scoped template is valid and asks for nothing');

  // The current-pricing export is the rollback reference and states ownership per field.
  var cur = SRP.buildCurrentCsv(CA.rows, MKT);
  var ch = cur.split('\r\n')[0].split(',');
  ok(ch.indexOf('regular_price_owner') !== -1, 'E3  the reference export names the per-field owner');
  eq(cur.split('\r\n')[1].split(',')[ch.indexOf('regular_price_owner')], 'NOT_SET',
    'E3a and an unstated owner exports as NOT_SET, never as AUTO');
}

// =============================================================================================================
section('F · WHAT A SCOPED IMPORT REFUSES');
// =============================================================================================================
{
  var csv = SRP.buildTemplateCsv(CA.rows, MKT);

  var okFile = editTemplate(csv, { M1: { regular_price_mode: 'MANUAL', regular_price: '45.99' } });
  var v = SRP.validateBulkFile(okFile, CA);
  eq([v.ok, v.lines.filter(SRP.lineTouches).length], [true, 1], 'F1  a valid scoped edit passes');

  // CURRENCY. The cell exists so a person can see it; changing it is describing a different row.
  var badCur = editTemplate(csv, { M1: { currency: 'USD', regular_price_mode: 'MANUAL', regular_price: '45.99' } });
  var vc = SRP.validateBulkFile(badCur, CA);
  eq([vc.ok, vc.errors[0].code, vc.lines.length], [false, 'FILE_CURRENCY_NOT_TARGET', 0],
    'F2  a currency that disagrees with the target is refused, and the file offers nothing');
  // ITS OWN NAME, not the server's. The server's CURRENCY_MISMATCH means "the file disagrees with the ROW";
  // this means "the file disagrees with the TARGET the operator picked", which the server never asks about.
  // Sharing a code would make the browser look like a second answer to the server's question — and the R4
  // suite has a test (J19) that fails the moment the browser starts speaking the server's vocabulary.
  ok(!/CURRENCY_MISMATCH/.test(SRP_SRC), 'F2a  and the browser never emits the server\'s own refusal code');

  // A ROW FROM ANOTHER TARGET. Membership is decided by marketplace_sku_id, so pasting a US row into a CA
  // file is caught by its id — not by its country cell, which the import never reads.
  var cross = addRow(csv, { marketplace_sku_id: 'M3', master_sku: 'CO1100-R', site_sku: 'SU1', company: 'KM',
    country: 'CA', marketplace: 'amazon', currency: 'CAD',
    regular_price_mode: 'MANUAL', regular_price: '35.99',
    minimum_price_mode: 'NO_CHANGE', minimum_price: '', msrp_mode: 'NO_CHANGE', msrp: '' });
  var vx = SRP.validateBulkFile(cross, CA);
  eq([vx.ok, vx.errors[0].code, vx.errors[0].marketplace_sku_id], [false, 'ROW_OUTSIDE_TARGET', 'M3'],
    'F3  a row from another target is refused even when its country cell has been relabelled');

  // AUTO CARRYING A VALUE. The frozen contract DROPS it, which is safe; a scoped import can afford to say
  // the file contradicts itself instead. Both behaviours are asserted, because keeping the first intact is
  // the reason the second is allowed to exist.
  var autoVal = editTemplate(csv, { M1: { minimum_price_mode: 'AUTO', minimum_price: '999' } });
  var frozen = SRP.validateFile(autoVal);
  eq([frozen.ok, frozen.lines[0].minimum_price], [true, undefined],
    'F4  validateFile still DROPS a value beside AUTO — the frozen contract is untouched');
  var va = SRP.validateBulkFile(autoVal, CA);
  eq([va.ok, va.errors[0].code, va.errors[0].field], [false, 'AUTO_WITH_VALUE', 'minimum_price'],
    'F4a while the scoped import refuses the contradiction outright');
  ok(/line: g \+ 1/.test(SRP_SRC), 'F4b reported against the file line, which is what the operator edits');

  // A TARGET THAT CANNOT BE IMPORTED refuses before it looks at the file at all.
  var vj = SRP.validateBulkFile(csv, JP);
  eq([vj.ok, vj.errors[0].code], [false, 'TARGET_CURRENCY_AMBIGUOUS'],
    'F5  a target with two currencies refuses the upload rather than choosing one');
  ok(/JPY, USD/.test(vj.errors[0].detail), 'F5a naming both, so someone can go and settle it');
  var vn = SRP.validateBulkFile(csv, null);
  eq([vn.ok, vn.errors[0].code], [false, 'TARGET_NOT_SELECTED'], 'F6  and no target at all is refused too');

  // The FROZEN file rules still fire through the scoped gate — it adds refusals, it does not replace them.
  var manualBlank = editTemplate(csv, { M1: { regular_price_mode: 'MANUAL', regular_price: '' } });
  eq(SRP.validateBulkFile(manualBlank, CA).errors[0].code, 'MANUAL_PRICE_REQUIRED',
    'F7  MANUAL with a blank price is still refused — blank is not zero');
  var badMode = editTemplate(csv, { M1: { regular_price_mode: 'DELETE' } });
  eq(SRP.validateBulkFile(badMode, CA).errors[0].code, 'MODE_UNSUPPORTED', 'F7a and an unknown mode still is');
  var dupe = addRow(csv, { marketplace_sku_id: 'M1', regular_price_mode: 'NO_CHANGE', minimum_price_mode: 'NO_CHANGE', msrp_mode: 'NO_CHANGE' });
  eq(SRP.validateBulkFile(dupe, CA).errors[0].code, 'DUPLICATE_IDENTITY', 'F7b and a duplicated identity still is');
}

// =============================================================================================================
section('G · THE PREVIEW IS DRIVEN BY THE SERVER RECEIPT, NOT BY A SECOND OPINION');
// =============================================================================================================
{
  var lines = [
    { marketplace_sku_id: 'M1', currency: 'CAD', regular_price_mode: 'MANUAL', regular_price: '45.99',
      minimum_price_mode: 'AUTO', msrp_mode: 'NO_CHANGE' }
  ];
  // What a dry run returns: per row, per field, the mode and whether it would change.
  var receipt = [{ marketplace_sku_id: 'M1', pricing_id: 'P1', changed: true, fields: {
    regular_price: { mode: 'MANUAL', changed: true },
    minimum_price: { mode: 'AUTO', changed: true },
    msrp: { mode: 'NO_CHANGE', changed: false } } }];
  var rows = SRP.previewRows(receipt, lines, PRICING);
  eq(rows.length, 2, 'G1  only the fields the SERVER said would change are shown');
  eq(rows.map(function (r) { return r.field; }), ['regular_price', 'minimum_price'], 'G1a and NO_CHANGE is not one of them');

  eq([rows[0].current_value, rows[0].new_value], [44.99, 45.99], 'G2  MANUAL shows the current value and the supplied one');
  eq([rows[0].current_owner, rows[0].new_owner], ['UNKNOWN', 'MANUAL'], 'G2a UNKNOWN -> MANUAL');
  eq([rows[1].current_value, rows[1].new_value], [39.99, 39.99], 'G3  AUTO shows the restore coming from auto_*');
  eq([rows[1].current_owner, rows[1].new_owner], ['UNKNOWN', 'AUTO'], 'G3a UNKNOWN -> AUTO, with the price unmoved');
  eq([rows[0].sku, rows[0].site_sku], ['CO1100-R', 'SA1'], 'G4  each line names the SKU and the site SKU');

  // A ROW THE SERVER SAID WOULD NOT CHANGE IS NOT SHOWN, even though the file asked for something. The
  // browser does not get to decide it would have changed.
  var none = SRP.previewRows([{ marketplace_sku_id: 'M1', changed: false, fields: {
    regular_price: { mode: 'MANUAL', changed: false } } }], lines, PRICING);
  eq(none.length, 0, 'G5  an unchanged row contributes nothing to the preview');

  // The result counts are read off the WRITE receipt, for the same reason.
  eq(SRP.resultSummary(receipt), { rows_updated: 1, fields_updated: 2, manual_fields: 1, auto_fields: 1 },
    'G6  the result summary counts what the server reported, split by mode');
  eq(SRP.resultSummary([]), { rows_updated: 0, fields_updated: 0, manual_fields: 0, auto_fields: 0 },
    'G6a and an empty receipt summarises to zero rather than to nothing');
}

// =============================================================================================================
section('H · PREVIEW BEFORE WRITE, AND ONE WRITE PATH');
// =============================================================================================================
{
  ok(/dry_run: true/.test(PAGE), 'H1  the preview asks the server with dry_run');
  ok(/id=\\"srd-bulk-continue-btn\\"[\s\S]{0,160}disabled/.test(PAGE) || /continue-btn[\s\S]{0,200}changedRows > 0 \? '' : ' disabled'/.test(PAGE),
    'H2  Confirm Update is disabled until a preview has found something to change');
  ok(/b\.stage = 'confirm'/.test(PAGE), 'H3  and confirming goes through the confirmation step, not straight to the write');
  ok(/You are about to update/.test(PAGE) && /This may change pricing ownership between MANUAL and AUTO/.test(PAGE),
    'H4  which states the count, the target and what ownership may do');

  // ONE WRITE PATH. Two transports into pricing_list is how the field-level flags stop being trustworthy:
  // the invariant that nothing else writes a price would stop being checkable.
  // The five: single-row editor · per-SKU import preview + confirm · bulk preview + confirm.
  var calls = PAGE.match(/KM\.DB\.updatePricing\(/g) || [];
  eq(calls.length, 5, 'H5  all five pricing calls on this page go through KM.DB.updatePricing');
  eq((PAGE.match(/action:\s*'pricing\./g) || []), [], 'H5a the page never names a pricing action itself');
  eq((PAGE.match(/\bfetch\s*\(|XMLHttpRequest/g) || []), [], 'H5b and performs no transport of its own');
  ok(/lines: b\.lines/.test(PAGE), 'H6  the write sends the lines the preview validated, not the file re-read');

  // A TARGET CHANGE THROWS AWAY A PREVIEW. Otherwise a file validated against CA could be written to US.
  ok(/_srdBulkReset/.test(PAGE), 'H7  changing the target resets anything validated against the previous one');
  ok(/_srdBulk\.lines = null/.test(PAGE), 'H7a including the lines that were about to be written');
}

// =============================================================================================================
section('I · base_*, auto_* AND fx_* ARE NOT WRITABLE THROUGH ANY OF IT');
// =============================================================================================================
{
  eq(SRP.TEMPLATE_COLUMNS, ['marketplace_sku_id', 'master_sku', 'site_sku', 'company', 'country', 'marketplace',
    'currency', 'regular_price_mode', 'regular_price', 'minimum_price_mode', 'minimum_price', 'msrp_mode', 'msrp'],
    'I1  the update template has exactly the thirteen columns of the frozen contract');
  ['base_regular_price', 'base_minimum_price', 'base_msrp', 'auto_regular_price', 'auto_minimum_price',
   'auto_msrp', 'fx_rate', 'fx_rate_date'].forEach(function (c) {
    ok(SRP.TEMPLATE_COLUMNS.indexOf(c) === -1, 'I2  ' + c + ' is not an update-template column');
  });

  // Even when a file CARRIES those columns, nothing about them crosses into the payload.
  var csv = SRP.buildTemplateCsv(CA.rows, MKT);
  var g = SRP.parseCsv(csv);
  var h = g[0].concat(['base_regular_price', 'auto_regular_price', 'fx_rate']);
  var rows = g.slice(1).map(function (r) {
    var o = {}; g[0].forEach(function (c, i) { o[c] = r[i]; });
    o.base_regular_price = '1'; o.auto_regular_price = '2'; o.fx_rate = '3';
    if (o.marketplace_sku_id === 'M1') { o.regular_price_mode = 'MANUAL'; o.regular_price = '45.99'; }
    return o;
  });
  var v = SRP.validateBulkFile(SRP.toCsv(h, rows), CA);
  eq(v.ok, true, 'I3  a file carrying those columns is not rejected for carrying them');
  var touched = v.lines.filter(SRP.lineTouches);
  eq(Object.keys(touched[0]).sort(), ['currency', 'marketplace_sku_id', 'minimum_price_mode', 'msrp_mode',
    'regular_price', 'regular_price_mode'].sort(),
    'I3a but not one of them reaches the payload');

  // The reference export MAY show them — reading is not writing.
  var cur = SRP.buildCurrentCsv(CA.rows, MKT);
  ok(cur.indexOf('auto_regular_price') !== -1 && cur.indexOf('fx_rate') !== -1,
    'I4  the reference export may show auto and fx values, because reading them is not writing them');
}

// =============================================================================================================
section('J · THE ENTRY POINT EXISTS, AND EVERY CLASS IT EMITS HAS A RULE');
// =============================================================================================================
{
  ok(/id="srd-update-btn"/.test(HTML), 'J1  the page toolbar carries an Update button');
  ok(/onclick="srdOpenBulkUpdate\(\)"/.test(HTML), 'J1a wired to the bulk update entry point');
  ok(/window\.srdOpenBulkUpdate = srdOpenBulkUpdate;/.test(PAGE), 'J1b which is exported, so the inline handler resolves');
  ['srdCloseBulkUpdate', 'srdBulkPickCategory', 'srdBulkSetCountry', 'srdBulkSetMarketplace',
   'srdBulkDownloadCurrent', 'srdBulkDownloadTemplate', 'srdBulkPreview', 'srdBulkToConfirm',
   'srdBulkBackToPreview', 'srdBulkConfirm', 'srdBulkDownloadResult'].forEach(function (fn) {
    ok(new RegExp('window\\.' + fn + ' = ' + fn + ';').test(PAGE), 'J2  ' + fn + ' is exported');
    ok(new RegExp('onclick=\\\\"' + fn).test(PAGE) || new RegExp('onclick="' + fn).test(PAGE) ||
      new RegExp(fn + '\\(').test(PAGE), 'J2a  and reachable');
  });

  // A STATE CLASS WITH NO RULE renders as unstyled text. This stylesheet has shipped that before, so every
  // class the new markup emits is checked against it rather than assumed.
  ['srd-modal--wide', 'srd-bulk__cat', 'srd-bulk__cur', 'srd-bulk__target', 'srd-bulk__files',
   'srd-bulk__tbl', 'srd-bulk__confirm', 'srd-bulk__ok'].forEach(function (c) {
    ok(CSS.indexOf('.' + c + ' ') !== -1 || CSS.indexOf('.' + c + ',') !== -1 ||
      CSS.indexOf('.' + c + '{') !== -1 || CSS.indexOf('.' + c + ':') !== -1,
      'J3  .' + c + ' has a CSS rule');
  });
  ok(CSS.indexOf('#sku-regional-details-section .srd-bulk__cur') !== -1,
    'J3a and the new rules are scoped to the section, as every other rule here is');

  // The overlay is parented INSIDE the section for the same reason.
  ok(/\(el\('sku-regional-details-section'\) \|\| document\.body\)\.appendChild\(ov\)/.test(PAGE),
    'J4  the dialog is appended inside the section, not to <body>');

  // §9 — one vocabulary. The single-row editor and the bulk preview must not disagree about authority.
  ok(/SRP\.ownerLabel/.test(SRP_SRC) && /ownerLabel\(c\.current_owner\)/.test(PAGE),
    'J5  the bulk preview labels ownership with the same function the single-row editor uses');
  eq([SRP.ownerLabel('MANUAL'), SRP.ownerLabel('AUTO'), SRP.ownerLabel('UNKNOWN')], ['Manual', 'Auto', 'Not set'],
    'J5a and the three states are the three the editor shows');

  // Pricing stays regional. Master SKU Details gains nothing in this round.
  var MASTER = readN('assets/js/pages/sku-details.js');
  eq((MASTER.match(/updatePricing|pricing\.update|regular_price_mode/g) || []), [],
    'J6  Master SKU Details still has no pricing write of any kind');
}

// =============================================================================================================
section('K · MUTANTS');
// =============================================================================================================
// The probe returns TRUE when the mutant is CAUGHT: it asserts the BROKEN behaviour, never the correct one.
function srpMutant(label, from, to, probe) {
  if (SRP_SRC.indexOf(from) === -1) { fail++; console.error('FAIL ' + label + '   [anchor not found]'); return; }
  if (SRP_SRC.split(from).length - 1 !== 1) { fail++; console.error('FAIL ' + label + '   [anchor not unique]'); return; }
  var caught;
  try {
    var S = { console: console, Object: Object, Array: Array, String: String, Number: Number,
      Math: Math, JSON: JSON, isFinite: isFinite, RegExp: RegExp, module: { exports: {} } };
    vm.createContext(S);
    vm.runInContext(SRP_SRC.replace(from, to), S, { filename: 'srp.js' });
    caught = probe(S.module.exports);
  } catch (e) { caught = true; }
  if (caught) { mutCaught++; pass++; console.log('ok   ' + label + '  (mutant caught)'); }
  else { mutSurvived++; fail++; console.error('SURVIVED ' + label); }
}

// K1 — a target with two currencies picks one instead of refusing. Every row of the minority currency would
// then be validated, and written, against a currency nobody chose for it.
srpMutant('K1  an ambiguous target picks a currency instead of refusing',
  'sc.currency = sc.currencyList.length === 1 ? sc.currencyList[0] : null;',
  'sc.currency = sc.currencyList[0] || null;',
  function (P) { var s = P.findScope(P.scopes(PRICING, MKT), 'JP|rakuten'); return s.currency !== null; });

// K2 — scope membership starts trusting the file's country cell. A row pasted from another target with its
// country relabelled would then be accepted, and written.
srpMutant('K2  a row from another target is admitted by its country cell',
  'if (!scope.ids[id]) {',
  'if (false) {',
  function (P) {
    var csv = P.buildTemplateCsv(CA.rows, MKT);
    var g = P.parseCsv(csv), h = g[0];
    var rows = g.slice(1).map(function (r) { var o = {}; h.forEach(function (c, i) { o[c] = r[i]; }); return o; });
    rows.push({ marketplace_sku_id: 'M3', country: 'CA', marketplace: 'amazon', currency: 'CAD',
      regular_price_mode: 'MANUAL', regular_price: '35.99', minimum_price_mode: 'NO_CHANGE', msrp_mode: 'NO_CHANGE' });
    return P.validateBulkFile(P.toCsv(h, rows), CA).ok === true;
  });

// K3 — the currency check goes. The server would still refuse the file, but only after the operator had
// filled in a whole file in the wrong currency and pressed Confirm.
srpMutant('K3  a file in the wrong currency reaches the server',
  'if (cur && cur !== scope.currency) {',
  'if (false) {',
  function (P) {
    var csv = P.buildTemplateCsv(CA.rows, MKT);
    var g = P.parseCsv(csv), h = g[0];
    var rows = g.slice(1).map(function (r) { var o = {}; h.forEach(function (c, i) { o[c] = r[i]; }); return o; });
    rows[0].currency = 'USD'; rows[0].regular_price_mode = 'MANUAL'; rows[0].regular_price = '45.99';
    return P.validateBulkFile(P.toCsv(h, rows), CA).ok === true;
  });

// K4 — the preview stops reading the server receipt and shows whatever the file asked for. The browser
// becomes a second pricing authority, and the screen stops describing the write.
srpMutant('K4  the preview shows a field the server said would not change',
  'if (!f || !f.changed) return;\n                var view = row ?',
  'if (!f) return;\n                var view = row ?',
  function (P) {
    var rows = P.previewRows([{ marketplace_sku_id: 'M1', changed: true, fields: {
      msrp: { mode: 'NO_CHANGE', changed: false } } }],
      [{ marketplace_sku_id: 'M1' }], PRICING);
    return rows.length > 0;
  });

// K5 — AUTO's new value is read from the file instead of from auto_*. The preview would promise a number
// the writer will not write, which is worse than no preview.
srpMutant('K5  the preview shows AUTO restoring to the file value',
  "var newValue = f.mode === 'AUTO' ? view.auto : num(line[spec.key]);",
  'var newValue = num(line[spec.key]);',
  function (P) {
    var rows = P.previewRows([{ marketplace_sku_id: 'M1', changed: true, fields: {
      minimum_price: { mode: 'AUTO', changed: true } } }],
      [{ marketplace_sku_id: 'M1', minimum_price: '999' }], PRICING);
    return rows[0].new_value !== 39.99;
  });

// K6 — the result counts every changed field as manual. An operator reading the summary would believe a
// hand-back to the system had claimed the field for a person.
srpMutant('K6  the result summary counts an AUTO hand-back as a manual field',
  "if (f.mode === 'AUTO') out.auto_fields++; else out.manual_fields++;",
  'out.manual_fields++;',
  function (P) {
    var s = P.resultSummary([{ changed: true, fields: { minimum_price: { mode: 'AUTO', changed: true } } }]);
    return s.auto_fields !== 1;
  });

// =============================================================================================================
console.log('\n' + pass + ' passed / ' + fail + ' failed   ·   ' + (mutCaught + mutSurvived) + ' mutants, ' + mutSurvived + ' survived');
process.exit(fail === 0 ? 0 : 1);
