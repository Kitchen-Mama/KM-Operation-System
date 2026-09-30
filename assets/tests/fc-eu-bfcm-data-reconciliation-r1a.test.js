// FC-EU-BFCM-DATA-RECONCILIATION-R1A — THE SELECTOR, AND THE PRICE.
//
// R1 produced a plan that could not run: it needed a campaign_id nobody had typed, and it left every
// commercial field blank because the graph cannot supply one. The operator's run answered
// `verdict = STOP, blocker = EMPTY_SELECTOR` — correct fail-closed behaviour, and unhelpful in one specific
// way: the system knew a campaign was broken and would not say which.
//
// R1A closes both halves.
//
//   THE SELECTOR is derived from the DAMAGE, not from memory. The finder lists every campaign holding an
//   orphaned event; the entry proceeds only when exactly one exists, and refuses to break a tie between two.
//
//   THE PRICE is derived by the authority that already owns it. regular_price comes from
//   pricingResolveEffective_ and promo_price is rounded by pricingRoundFx_ — both in 73_, both CALLED and
//   never copied, exactly as 72_ calls them. §C drives the census and 73_ over one fixture and requires
//   them to agree, which is the only thing that keeps "no second authority" from being a slogan.
//
// ONE FINDING THIS SUITE EXISTS TO RECORD (§E). There are TWO currency-precision tables in the repository
// and they disagree. `_evtDealPrecision` in fc-summary.js — which rounded every campaign line that exists
// today — and `PRICING_FX_DECIMALS_` in 73_, the frozen contract. They agree on USD/CAD/EUR/GBP/AUD/JPY/KRW
// and differ on TWD, and the client silently defaults an unknown currency to 2 decimals where 73_ refuses.
// The affected repair is EUR or GBP, where they agree, so this incident is unaffected — but a finding that
// is true and unrecorded is a finding that gets re-discovered, so §E drives both real tables.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. Fixtures and committed source only.
//
// Run: node assets/tests/fc-eu-bfcm-data-reconciliation-r1a.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var CENSUS = read('tools/apps-script-diagnostics/TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1.gs');
var ENTRY = read('tools/apps-script-diagnostics/TEMP_FC_EU_BFCM_RECONCILIATION_R1A_ENTRY.gs');
var G73 = read('specs/active/apps-script/73_api_v1_pricing_write.gs');
var G72 = read('specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
var G20 = read('specs/active/apps-script/20_campaign_write_handlers.gs');
var FCS = read('js/pages/fc-summary.js');
var API = read('js/api/operation-system-db-api.js');

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function mut(label, fn) {
  mutants++;
  var caught = false;
  try { caught = fn() === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// ---------------------------------------------------------------------------------------------------------
// THE WORLD. Read-only sheets: every write method throws, so "it wrote nothing" is a property of the run.
// ---------------------------------------------------------------------------------------------------------
var CAMP_H = ['campaign_id', 'company', 'marketplace_id', 'campaign_name', 'country', 'marketplace',
  'promotion_type', 'major_event_flag', 'event_flag', 'year', 'start_date', 'end_date'];
var LINE_H = ['campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'sku', 'promo_price',
  'regular_price', 'price_units', 'discount_percent', 'special_condition', 'lps', 'line_status', 'source',
  'created_by', 'created_at', 'updated_by', 'updated_at'];
var EVT_H = ['event_fc_id', 'campaign_id', 'campaign_sku_line_id', 'company', 'country', 'marketplace',
  'marketplace_id', 'scope_type', 'scope_id', 'sku', 'series', 'category', 'event_name',
  'event_period', 'event_start_date', 'event_end_date', 'event_month', 'year', 'fc_qty'];
var MSKU_H = ['marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'currency'];
var PRICE_H = ['pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'currency',
  'regular_price', 'auto_regular_price', 'regular_price_is_manual'];

function roSheet(headers, objRows, name, writeLog) {
  var grid = [headers.slice()].concat((objRows || []).map(function (o) {
    return headers.map(function (h) { return o[h] === undefined ? '' : o[h]; });
  }));
  function forbid(op) { return function () { writeLog.push(name + '.' + op); throw new Error('WRITE ATTEMPTED'); }; }
  return {
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; }, getLastColumn: function () { return headers.length; },
    getRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); },
      setValue: forbid('setValue'), setValues: forbid('setValues'), clear: forbid('clear') }; },
    appendRow: forbid('appendRow'), deleteRow: forbid('deleteRow'), insertRows: forbid('insertRows'),
    clear: forbid('clear'), clearContents: forbid('clearContents')
  };
}

function world(opts) {
  opts = opts || {};
  var writeLog = [], logs = [], sheets = {};
  sheets.campaigns = roSheet(CAMP_H, opts.campaigns || [], 'campaigns', writeLog);
  sheets.campaign_sku_lines = roSheet(LINE_H, opts.lines || [], 'campaign_sku_lines', writeLog);
  sheets.fc_special_events = roSheet(EVT_H, opts.events || [], 'fc_special_events', writeLog);
  sheets.marketplace_skus = roSheet(MSKU_H, opts.mskus || [], 'marketplace_skus', writeLog);
  sheets.pricing_list = roSheet(PRICE_H, opts.pricing || [], 'pricing_list', writeLog);

  var ss = { getSheetByName: function (n) { return sheets[n] || null; } };
  var sb = { console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    Math: Math, Date: Date, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    Boolean: Boolean, Error: Error, isFinite: isFinite,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } },
    Logger: { log: function (m) { logs.push(m); } } };
  vm.createContext(sb);
  if (!opts.noPricingResolver) vm.runInContext(G73, sb);
  vm.runInContext(opts.censusSrc || CENSUS, sb);
  if (!opts.noEntry) vm.runInContext(opts.entrySrc || ENTRY, sb);
  return { sb: sb, writeLog: writeLog, logs: logs };
}

/* The incident, built from parameters. `currency` is a parameter because §E is about currencies and the
   fixture must be able to move. */
function incident(seriesSizes, opts) {
  opts = opts || {};
  var CID = opts.campaignId || 'CMP-1';
  var cur = opts.currency || 'EUR';
  var price = opts.regularPrice === undefined ? 100 : opts.regularPrice;
  var events = [], mskus = [], pricing = [], n = 0;
  seriesSizes.forEach(function (size, si) {
    for (var k = 0; k < size; k++) {
      n++;
      var sku = 'SKU-' + n;
      events.push({ event_fc_id: 'EVT-' + n, campaign_id: CID, campaign_sku_line_id: 'CSL-' + n,
        company: 'CO', country: 'XX', marketplace: 'MP', marketplace_id: 'MID-1', scope_type: 'sku',
        scope_id: sku, sku: sku, series: 'SERIES-' + (si + 1), category: 'CAT', event_name: 'EVENT',
        year: 2026, fc_qty: 10 });
      mskus.push({ marketplace_sku_id: 'MSKU-' + n, marketplace_id: 'MID-1', sku: sku, company: 'CO',
        country: 'XX', marketplace: 'MP', site_sku: sku, currency: cur });
      pricing.push({ pricing_id: 'P-' + n, marketplace_sku_id: 'MSKU-' + n, sku: sku, country: 'XX',
        marketplace: 'MP', currency: cur, regular_price: price, auto_regular_price: 1 });
    }
  });
  return {
    campaigns: [{ campaign_id: CID, company: 'CO', marketplace_id: 'MID-1', campaign_name: 'NAME',
      country: 'XX', marketplace: 'MP', event_flag: 'FLAG', year: 2026,
      start_date: '2026-11-01', end_date: '2026-12-01' }],
    lines: opts.lines || [], events: events, mskus: mskus, pricing: pricing, campaignId: CID
  };
}

var OPERATOR_DISCOUNT = 20;               // §0, frozen by the operator
var OPERATOR_SERIES_SIZES = [4, 5];       // the operator's evidence; nothing downstream may know it

// =========================================================================================================
section('A. §1 — THE SELECTOR IS DERIVED FROM THE DAMAGE');
// =========================================================================================================
(function () {
  var w = world(incident(OPERATOR_SERIES_SIZES));
  var f = w.sb.TEMP_FC_RECONCILIATION_FIND_AFFECTED_CAMPAIGNS_R1A();
  eq(f.verdict, 'AFFECTED_CAMPAIGNS_FOUND', 'A1 the finder locates the incident with no selector supplied');
  eq(f.affected_campaign_ids, ['CMP-1'], 'A2 and names the campaign_id the census needs');
  eq(f.affected_campaign_count, 1, 'A3 exactly one campaign is affected');
  eq(f.emits_repair_plan, 'NO', 'A4 the finder emits NO repair plan — it is strictly less than a census');
  eq(f.emits_prices, 'NO', 'A5 and no prices');
  eq([f.production_rows_written, f.db_writes], [0, 0], 'A6 and it writes nothing');
  ok(w.writeLog.length === 0, 'A7 driven: not one write was attempted', w.writeLog);
  // The identity columns §11 asks for come back with it.
  var a = f.affected[0];
  eq([a.company, a.country, a.marketplace, a.event_flag, a.year],
    ['CO', 'XX', 'MP', 'FLAG', '2026'], 'A8 with the identity columns needed to recognise the incident');
  eq(Object.keys(a.series_breakdown).sort(), ['SERIES-1', 'SERIES-2'], 'A9 and the Series breakdown');
  eq([a.series_breakdown['SERIES-1'], a.series_breakdown['SERIES-2']], OPERATOR_SERIES_SIZES,
    'A10 whose sizes come from the graph, not from this suite');
})();

// A healthy graph is not an incident.
(function () {
  var fx = incident([2]);
  fx.lines = fx.events.map(function (e, i) {
    return { campaign_sku_line_id: e.campaign_sku_line_id, campaign_id: e.campaign_id,
      marketplace_sku_id: 'MSKU-' + (i + 1), sku: e.sku, line_status: 'active' };
  });
  var f = world(fx).sb.TEMP_FC_RECONCILIATION_FIND_AFFECTED_CAMPAIGNS_R1A();
  eq(f.verdict, 'NO_AFFECTED_CAMPAIGN', 'A11 a whole graph reports no affected campaign');
  eq(f.affected_campaign_ids, [], 'A12 and names none');
})();

// Two damaged campaigns is an operator decision, not a tie to break by ordering.
var TWO = (function () {
  var fx = incident([2]);
  fx.campaigns.push({ campaign_id: 'CMP-2', company: 'CO', marketplace_id: 'MID-1', campaign_name: 'OTHER',
    country: 'XX', marketplace: 'MP', event_flag: 'FLAG-2', year: 2026 });
  fx.events.push({ event_fc_id: 'EVT-Z', campaign_id: 'CMP-2', campaign_sku_line_id: 'CSL-Z',
    company: 'CO', country: 'XX', marketplace: 'MP', marketplace_id: 'MID-1', sku: 'SKU-Z',
    series: 'SERIES-9', event_name: 'EVENT-2', year: 2026 });
  return fx;
})();
(function () {
  var f = world(TWO).sb.TEMP_FC_RECONCILIATION_FIND_AFFECTED_CAMPAIGNS_R1A();
  eq(f.affected_campaign_count, 2, 'A13 two damaged campaigns are both reported');
  eq(f.affected_campaign_ids.sort(), ['CMP-1', 'CMP-2'], 'A14 by id');
})();

// =========================================================================================================
section('B. §2 — THE OPERATOR ENTRY FUNCTION');
// =========================================================================================================
(function () {
  var w = world(incident(OPERATOR_SERIES_SIZES));
  var r = w.sb.runFcEuBfcmReconciliationDryRun();       // zero arguments, as the Apps Script editor runs it
  eq(r.selector_strategy, 'DERIVED_FROM_ORPHANED_EVENTS', 'B1 the entry resolves the selector itself');
  eq(r.selector_uniquely_identifies_incident, 'YES', 'B2 and says the selector is unique');
  eq(r.entry_function_write_count, 0, 'B3 ENTRY_FUNCTION_WRITE_COUNT = 0');
  eq(r.production_rows_written, 0, 'B4 PRODUCTION_ROWS_WRITTEN = 0');
  eq(r.production_repair_execution_authorized, 'NO', 'B5 and repair is not authorized');
  ok(w.writeLog.length === 0, 'B6 driven: the whole entry path attempted zero writes', w.writeLog);
  eq(r.verdict, 'PLAN_READY', 'B7 and it produces a scoped plan rather than EMPTY_SELECTOR');
  eq(r.missing_line_count, OPERATOR_SERIES_SIZES[0] + OPERATOR_SERIES_SIZES[1],
    'B8 for the campaign the finder chose');
})();
(function () {
  var r = world(TWO).sb.runFcEuBfcmReconciliationDryRun();
  eq(r.verdict, 'STOP', 'B9 with two candidates the entry STOPS');
  eq(r.blocker, 'MULTIPLE_AFFECTED_CAMPAIGNS', 'B10 rather than choosing one by ordering');
  eq(r.affected_campaign_ids.sort(), ['CMP-1', 'CMP-2'], 'B11 and hands the operator both ids');
  eq(r.production_rows_written, 0, 'B12 a STOP still writes nothing');
})();
(function () {
  // The pin: one line, in the entry file, not in implementation code.
  var pinned = ENTRY.replace("var FCRC_R1A_CAMPAIGN_ID_ = '';", "var FCRC_R1A_CAMPAIGN_ID_ = 'CMP-2';");
  if (pinned === ENTRY) throw new Error('B13 anchor drifted');
  var r = world(Object.assign({}, TWO, { entrySrc: pinned })).sb.runFcEuBfcmReconciliationDryRun();
  eq(r.selector_strategy, 'OPERATOR_PINNED_CAMPAIGN_ID', 'B13 pinning one id scopes the census to it');
  eq(r.campaigns[0].campaign_id, 'CMP-2', 'B14 and only to it');
})();
(function () {
  var CE = code(ENTRY);
  ['appendRow', 'setValue', 'deleteRow', 'insertRow', 'clear', 'flush', 'DriveApp', 'MailApp',
    'PropertiesService', 'ScriptApp', 'LockService'].forEach(function (tok, i) {
    ok(CE.indexOf(tok) === -1, 'B15.' + (i + 1) + ' the entry file contains no `' + tok + '`');
  });
  ok(!/function\s+\w*[Rr]epair|function\s+\w*[Ee]xecute|handleUpsertCampaignSkuLines_/.test(CE),
    'B16 and defines no executor');
  ok(/function runFcEuBfcmReconciliationDryRun\(\)/.test(CE),
    'B17 the named entry point takes no arguments, so the editor can run it as-is');
})();

// =========================================================================================================
section('C. §3/§4 — THE PRICE COMES FROM 73_, AND IS NOT REIMPLEMENTED');
// =========================================================================================================
(function () {
  var w = world(incident([1]));
  var r = w.sb.runFcEuBfcmReconciliationDryRun();
  var row = r.repair_plan[0];

  // The census's answer, and 73_'s own answer, computed independently in the same context.
  var spec = w.sb.PRICING_FIELDS_.filter(function (f) { return f.field === 'regular_price'; })[0];
  var direct = w.sb.pricingResolveEffective_(
    { regular_price: 100, auto_regular_price: 1, regular_price_is_manual: '' }, spec);
  eq(row.regular_price, direct.value, 'C1 the census regular_price IS pricingResolveEffective_\'s answer');
  eq(row.regular_price_source, direct.source, 'C2 including the source band it resolved through');
  eq(row.promo_price, w.sb.pricingRoundFx_(direct.value * (1 - OPERATOR_DISCOUNT / 100), 'EUR'),
    'C3 and promo_price IS pricingRoundFx_\'s answer');
  eq([row.regular_price, row.discount_percent, row.promo_price, row.price_units],
    [100, 20, 80, 'EUR'], 'C4 100 at 20% is 80.00 in a two-decimal currency');
  eq(r.second_pricing_authority_created, 'NO', 'C5 SECOND_PRICING_AUTHORITY_CREATED = NO');
  eq(r.regular_price_authority, 'pricingResolveEffective_ (73_api_v1_pricing_write.gs)', 'C6 named');
  eq(r.currency_rounding_owner,
    'PRICING_FX_DECIMALS_ / pricingRoundFx_ (73_api_v1_pricing_write.gs)', 'C7 rounding owner named');
})();
(function () {
  // Not a claim — a census that had its own band logic would answer when 73_ is gone. It refuses.
  var w = world(Object.assign(incident([1]), { noPricingResolver: true }));
  var r = w.sb.runFcEuBfcmReconciliationDryRun();
  eq(r.pricing_resolver_present, 'NO', 'C8 with 73_ absent the census says so');
  eq(r.repair_plan[0].status, 'REFUSED_CONFLICT', 'C9 and REFUSES the row rather than pricing it locally');
  ok(r.repair_plan[0].conflicts.indexOf('PRICING_RESOLVER_UNAVAILABLE') > -1, 'C10 naming the absent owner');
  eq(r.ready_for_repair_count, 0, 'C11 so nothing is ready');
})();
(function () {
  var CC = code(CENSUS);
  ok(!/auto_regular_price/.test(CC.replace(/PRICING_FIELDS_/g, ' ')),
    'C12 the census never reads the auto band itself — it hands the row to the resolver');
  ok(!/regular_price_is_manual|PRICING_FX_DECIMALS_\s*=/.test(CC),
    'C13 and holds neither the authority flag logic nor a precision table of its own');
  ok(/pricingResolveEffective_\(/.test(CC) && /pricingRoundFx_\(/.test(CC),
    'C14 it CALLS both owners');
  // The same reuse 72_ makes, for the same stated reason.
  ok(/THE RULE LIVES IN 73_ AND IS CALLED, NEVER COPIED/.test(G72),
    'C15 which is the pattern 72_ already established and documented');
})();

// The band chain is 73_'s, not a preference invented here: an override beats auto.
(function () {
  var fx = incident([1]);
  fx.pricing[0].regular_price = '';            // no override
  fx.pricing[0].auto_regular_price = 250;      // auto answers
  var r = world(fx).sb.runFcEuBfcmReconciliationDryRun();
  eq([r.repair_plan[0].regular_price, r.repair_plan[0].regular_price_source], [250, 'AUTO'],
    'C16 a row priced through auto_* resolves, and reports AUTO');
  eq(r.repair_plan[0].promo_price, 200, 'C17 and the deal price follows from it');
})();
(function () {
  var fx = incident([1]);
  fx.pricing[0].regular_price = '';
  fx.pricing[0].auto_regular_price = '';
  var r = world(fx).sb.runFcEuBfcmReconciliationDryRun();
  eq(r.repair_plan[0].status, 'REFUSED_CONFLICT', 'C18 a SKU with no price at all is REFUSED');
  ok(r.repair_plan[0].conflicts.indexOf('REGULAR_PRICE_NOT_RESOLVED') > -1, 'C19 and named');
})();
(function () {
  var fx = incident([1], { regularPrice: 0 });
  var r = world(fx).sb.runFcEuBfcmReconciliationDryRun();
  eq(r.repair_plan[0].status, 'REFUSED_CONFLICT',
    'C20 a zero price is not a price — the page\'s own <= 0 guard, restated');
})();

// =========================================================================================================
section('D. §4 — THE DISCOUNT IS SUPPLIED, NOT ASSUMED');
// =========================================================================================================
(function () {
  var w = world(incident([1]));
  var r = w.sb.runFcEuBfcmReconciliationDryRun();
  eq(r.discount_percent_supplied, OPERATOR_DISCOUNT, 'D1 the frozen discount reaches the census');
  eq(r.discount_percent_authority, 'OPERATOR_FIXED', 'D2 DISCOUNT_PERCENT_AUTHORITY = OPERATOR_FIXED');
  ok(/var FCRC_R1A_DISCOUNT_PERCENT_ = 20;/.test(ENTRY),
    'D3 and it is declared once, in the ENTRY file, where an operator can read it');
  ok(code(CENSUS).indexOf('FCRC_R1A_DISCOUNT_PERCENT_') === -1,
    'D4 the census itself does not know it — it stays a general instrument');
})();
(function () {
  // Change the frozen value and every derived price moves with it. Nothing is baked in.
  var alt = ENTRY.replace('var FCRC_R1A_DISCOUNT_PERCENT_ = 20;', 'var FCRC_R1A_DISCOUNT_PERCENT_ = 35;');
  if (alt === ENTRY) throw new Error('D5 anchor drifted');
  var r = world(Object.assign(incident([1]), { entrySrc: alt })).sb.runFcEuBfcmReconciliationDryRun();
  eq([r.discount_percent_supplied, r.repair_plan[0].promo_price], [35, 65],
    'D5 a different frozen discount produces a different deal price, through the same owner');
})();

// =========================================================================================================
section('E. THE TWO PRECISION TABLES, AND WHERE THEY DISAGREE');
// =========================================================================================================
/* This is the finding of the round that is NOT about this incident. The campaign lines that exist today
   were rounded by the BUILDER's table; the repair rounds by 73_'s FROZEN one. Both are real, both are
   shipped, and they are not the same table. Driven from both real sources. */
var clientPrec = (function () {
  var m = /function _evtDealPrecision\(currency\) \{[\s\S]*?\n\}/.exec(FCS);
  if (!m) throw new Error('_evtDealPrecision not found');
  return new Function('return ' + m[0].replace('function _evtDealPrecision', 'function'))();
})();
var serverPrec = (function () {
  var sb = { String: String, Object: Object, Number: Number, Math: Math, isFinite: isFinite, RegExp: RegExp,
    Array: Array, Date: Date, JSON: JSON, parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN,
    Boolean: Boolean, console: console };
  vm.createContext(sb); vm.runInContext(G73, sb);
  return sb.pricingDecimalsFor_;
})();

var AGREE = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY', 'KRW'];
AGREE.forEach(function (c, i) {
  eq(clientPrec(c), serverPrec(c), 'E1.' + (i + 1) + ' ' + c + ' — both tables agree');
});
eq([clientPrec('TWD'), serverPrec('TWD')], [2, 0],
  'E2 TWD — the builder rounds to 2 decimals, the frozen contract stores 0. THEY DISAGREE.');
eq([clientPrec('VND'), serverPrec('VND')], [0, null],
  'E3 VND — the builder rounds to 0, the frozen contract does not know it and REFUSES');
eq([clientPrec('CLP'), serverPrec('CLP')], [0, null], 'E4 CLP — likewise');
eq([clientPrec('XYZ'), serverPrec('XYZ')], [2, null],
  'E5 an UNKNOWN currency — the builder silently defaults to 2, the frozen contract refuses');
// Which matters for this repair, and which does not.
var AFFECTED_CURRENCIES = ['EUR', 'GBP'];
ok(AFFECTED_CURRENCIES.every(function (c) { return clientPrec(c) === serverPrec(c); }),
  'E6 every currency an EU repair can use is one the two tables AGREE on — this incident is unaffected');
(function () {
  // And a currency outside the frozen contract is refused rather than rounded by a second rule.
  var r = world(incident([1], { currency: 'VND' })).sb.runFcEuBfcmReconciliationDryRun();
  eq(r.repair_plan[0].status, 'REFUSED_CONFLICT', 'E7 a VND row is REFUSED by the census');
  ok(r.repair_plan[0].conflicts.indexOf('CURRENCY_OUTSIDE_FROZEN_PRECISION_CONTRACT') > -1,
    'E8 naming the frozen contract as the reason', r.repair_plan[0].conflicts);
})();
(function () {
  var r = world(incident([1], { currency: 'JPY', regularPrice: 1000 })).sb.runFcEuBfcmReconciliationDryRun();
  eq([r.repair_plan[0].promo_price, r.repair_plan[0].price_units], [800, 'JPY'],
    'E9 a zero-decimal currency rounds to whole units — the table is doing real work');
})();

// =========================================================================================================
section('F. §5 — THE PRICE FIELDS ARE SNAPSHOTS, AND THE REPAIR SAYS SO');
// =========================================================================================================
(function () {
  // A: historical snapshot. Proven three ways rather than asserted.
  ok(/price_units = the currency snapshot of the SAME pricing_list row/.test(G20),
    'F1 20_ documents price_units as a SNAPSHOT of the row that supplied the prices');
  var norm = /function normalizeCampaignSkuLineRecord\(raw\)[\s\S]*?\n\}/.exec(API)[0];
  ok(/promoPrice: String\(r\.promo_price \|\| ''\)/.test(norm)
    && /regularPrice: String\(r\.regular_price \|\| ''\)/.test(norm),
    'F2 the read path returns the STORED values verbatim — nothing is recomputed on read');
  ok(!/resolveRegionalPricingContext|pricingResolveBand_/.test(norm),
    'F3 and consults no pricing authority while reading a saved line');
  // The writer stores what it was given; it does not derive.
  var upsert = /function handleUpsertCampaignSkuLines_\(body\)[\s\S]*?\n\}/.exec(G20)[0];
  ok(!/discount|1 - |\* 0\.8/.test(upsert.replace(/discount_percent/g, ' ')),
    'F4 and the writer derives nothing — it stores the numbers the caller computed');
})();
(function () {
  var w = world(incident([1]));
  var r = w.sb.runFcEuBfcmReconciliationDryRun();
  var m = r.repair_plan[0].field_matrix.filter(function (x) { return x.field === 'regular_price'; })[0];
  ok(/DERIVED/.test(m.source) && /pricingResolveEffective_/.test(m.source),
    'F5 the matrix calls the reconstructed price DERIVED, naming its owner', m.source);
  ok(!/RECOVERED|the snapshot the lost row held/.test(m.source),
    'F6 and never claims it is the value the lost row held');
})();

// =========================================================================================================
section('G. §6/§7/§8 — THE MATRIX, AND THE CARDINALITY IT IS BUILT FROM');
// =========================================================================================================
var REQUIRED_LINE_FIELDS = ['campaign_sku_line_id', 'campaign_id', 'sku', 'marketplace_sku_id',
  'promo_price', 'regular_price', 'price_units', 'discount_percent'];
(function () {
  var r = world(incident(OPERATOR_SERIES_SIZES)).sb.runFcEuBfcmReconciliationDryRun();
  var unresolved = [];
  r.repair_plan.forEach(function (p) {
    REQUIRED_LINE_FIELDS.forEach(function (f) {
      var m = p.field_matrix.filter(function (x) { return x.field === f; })[0];
      if (!m) { unresolved.push(p.campaign_sku_line_id + '/' + f + ':MISSING_FROM_MATRIX'); return; }
      if (m.deterministic !== 'YES') unresolved.push(p.campaign_sku_line_id + '/' + f);
    });
  });
  eq(unresolved, [], 'G1 UNRESOLVED_REQUIRED_FIELD_COUNT = 0 — every required field is determined');
  eq(r.waiting_operator_value_count, 0, 'G2 nothing waits on the operator');
  eq(r.refused_conflict_count, 0, 'G3 REFUSED_CONFLICT_COUNT = 0');
  eq(r.unknown_count, 0, 'G4 UNKNOWN_COUNT = 0');
  eq(r.ready_for_repair_count, r.missing_line_count, 'G5 every missing line is READY_FOR_REPAIR');

  // §7/§8 — derived, never stated.
  var total = OPERATOR_SERIES_SIZES[0] + OPERATOR_SERIES_SIZES[1];
  eq([r.current_campaign_count, r.current_line_count, r.expected_line_count,
    r.missing_line_count, r.orphan_event_count], [1, 0, total, total, total],
    'G6 the cardinality is derived from the graph the census read');
  eq(r.graph_classification, { MISSING_CAMPAIGN_SKU_LINE: total }, 'G7 and every event is one state');
})();
(function () {
  // The same code over a different incident. A hardcoded 9 would show here.
  var r = world(incident([3])).sb.runFcEuBfcmReconciliationDryRun();
  eq([r.missing_line_count, r.repair_plan.length], [3, 3], 'G8 a three-row incident derives three');
})();

// =========================================================================================================
section('H. §9/§10 — SAFETY GATES AND SCHEMA');
// =========================================================================================================
(function () {
  var r = world(incident(OPERATOR_SERIES_SIZES)).sb.runFcEuBfcmReconciliationDryRun();
  eq(r.new_line_id_mint_count, 0, 'H1 NEW_LINE_ID_MINT_COUNT = 0');
  eq([r.delete_campaign_count, r.delete_event_count, r.delete_valid_line_count], [0, 0, 0],
    'H2 nothing is deleted');
  ok(r.repair_plan.every(function (p) { return p.referenced_by_event_ids.length > 0; }),
    'H3 every missing line id is still referenced by an existing event');
  eq([r.new_table_required, r.new_columns_required, r.schema_extension_required, r.db_migration_required],
    ['NO', 'NONE', 'NO', 'NO'], 'H4 §10 — no schema change');
  eq(r.production_rows_written, 0, 'H5 PRODUCTION_ROWS_WRITTEN = 0');
  eq(r.production_repair_execution_authorized, 'NO', 'H6 and execution is not authorized');
})();

// =========================================================================================================
section('I. MUTANTS');
// =========================================================================================================
mut('M1 the census computes the deal price itself instead of calling 73_', function () {
  var src = CENSUS.replace('var v = pricingRoundFx_(regular * (1 - d / PERCENT_DENOMINATOR), currency);',
    'var v = Math.round(regular * (1 - d / PERCENT_DENOMINATOR) * 100) / 100;');
  if (src === CENSUS) throw new Error('M1 anchor drifted');
  // Caught where the two rules differ: a zero-decimal currency.
  var r = world(Object.assign(incident([1], { currency: 'JPY', regularPrice: 1001 }), { censusSrc: src }))
    .sb.runFcEuBfcmReconciliationDryRun();
  var good = world(incident([1], { currency: 'JPY', regularPrice: 1001 })).sb.runFcEuBfcmReconciliationDryRun();
  return r.repair_plan[0].promo_price !== good.repair_plan[0].promo_price;
});

mut('M2 an unknown currency is rounded anyway instead of refused', function () {
  var src = CENSUS.replace(
    "if (v === null) return { ok: false, value: null, reason: 'CURRENCY_OUTSIDE_FROZEN_PRECISION_CONTRACT' };",
    'if (v === null) v = regular * (1 - d / PERCENT_DENOMINATOR);');
  if (src === CENSUS) throw new Error('M2 anchor drifted');
  var r = world(Object.assign(incident([1], { currency: 'VND' }), { censusSrc: src }))
    .sb.runFcEuBfcmReconciliationDryRun();
  return r.repair_plan[0].status !== 'REFUSED_CONFLICT';
});

mut('M3 a zero or missing regular price is accepted', function () {
  var src = CENSUS.replace('if (r.value === null || !isFinite(n) || n <= 0) {', 'if (false) {');
  if (src === CENSUS) throw new Error('M3 anchor drifted');
  var r = world(Object.assign(incident([1], { regularPrice: 0 }), { censusSrc: src }))
    .sb.runFcEuBfcmReconciliationDryRun();
  return r.repair_plan[0].status !== 'REFUSED_CONFLICT';
});

mut('M4 the entry picks the first of several affected campaigns', function () {
  var src = ENTRY.replace('if (finder.affected_campaign_count > 1) {', 'if (false) {');
  if (src === ENTRY) throw new Error('M4 anchor drifted');
  var r = world(Object.assign({}, TWO, { entrySrc: src })).sb.runFcEuBfcmReconciliationDryRun();
  var good = world(TWO).sb.runFcEuBfcmReconciliationDryRun();
  return r.verdict !== 'STOP' && good.verdict === 'STOP';
});

mut('M5 the finder emits a repair plan', function () {
  var src = CENSUS.replace("emits_repair_plan: 'NO', emits_prices: 'NO',",
    "emits_repair_plan: 'YES', emits_prices: 'YES',");
  if (src === CENSUS) throw new Error('M5 anchor drifted');
  var f = world(Object.assign(incident([1]), { censusSrc: src }))
    .sb.TEMP_FC_RECONCILIATION_FIND_AFFECTED_CAMPAIGNS_R1A();
  return f.emits_repair_plan === 'YES';
});

mut('M6 the discount is baked into the census instead of supplied', function () {
  var src = CENSUS.replace("if (!isFinite(d)) return { ok: false, value: null, reason: 'DISCOUNT_PERCENT_NOT_SUPPLIED' };",
    'if (!isFinite(d)) d = 20;');
  if (src === CENSUS) throw new Error('M6 anchor drifted');
  var w = world(Object.assign(incident([1]), { censusSrc: src, noEntry: true }));
  var r = w.sb.TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1({ campaign_id: 'CMP-1' });   // no discount passed
  return r.repair_plan[0].promo_price === 80;
});

mut('M7 the entry writes a row', function () {
  var src = ENTRY.replace('var pinned = String(FCRC_R1A_CAMPAIGN_ID_ || \'\').trim();',
    "SpreadsheetApp.getActiveSpreadsheet().getSheetByName('campaign_sku_lines').appendRow([]);\n  var pinned = String(FCRC_R1A_CAMPAIGN_ID_ || '').trim();");
  if (src === ENTRY) throw new Error('M7 anchor drifted');
  var w = world(Object.assign(incident([1]), { entrySrc: src }));
  var threw = false;
  try { w.sb.runFcEuBfcmReconciliationDryRun(); } catch (e) { threw = true; }
  return threw && w.writeLog.length > 0;
});

// =========================================================================================================
section('SUMMARY');
// =========================================================================================================
console.log('');
console.log('SELECTOR_STRATEGY = DERIVED_FROM_ORPHANED_EVENTS   ENTRY_FUNCTION_WRITE_COUNT = 0');
console.log('REGULAR_PRICE_AUTHORITY = pricingResolveEffective_ (73_)   SECOND_PRICING_AUTHORITY_CREATED = NO');
console.log('PROMO_PRICE_DERIVATION_OWNER = pricingRoundFx_ (73_)   DISCOUNT_PERCENT_AUTHORITY = OPERATOR_FIXED');
console.log('CAMPAIGN_LINE_PRICE_SEMANTIC = HISTORICAL_SNAPSHOT   REPAIR_USES_CURRENT_CANONICAL_PRICE = YES');
console.log('TWO CURRENCY PRECISION TABLES EXIST AND DISAGREE ON TWD / VND / CLP / UNKNOWN (§E)');
console.log('PRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_REPAIR_EXECUTION_AUTHORIZED = NO');
console.log('');
console.log(pass + ' passed, ' + fail + ' failed, ' + mutants + ' mutants (' + survived + ' survived)');
process.exit(fail ? 1 : 0);
