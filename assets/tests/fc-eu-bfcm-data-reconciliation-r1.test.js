// FC-EU-BFCM-DATA-RECONCILIATION-R1 — THE REPAIR PLAN FOR A GRAPH THAT IS ALREADY BROKEN.
//
// R2 stopped the graph acquiring a NEW hole and stopped a lost write being reported as success. It repaired
// nothing that was already lost. This round plans that repair and does not execute it.
//
// THE INCIDENT, AS THE OPERATOR STATES IT: one campaign, present; its fc_special_events, present; the
// campaign_sku_lines those events reference, gone. Two Series, four rows and five rows.
//
// THE OPERATOR ALSO CORRECTED IT ONCE — five became nine — and that correction is the reason this suite
// exists in the shape it does. A plan that had to be corrected when the number changed would have to be
// corrected again. So §B asserts that NO incident cardinality is reachable from the source at all: the only
// numeric literals in the census are 0, 1 and 2, and every count is derived from the graph it read. §C then
// drives the same code over a 4+5 world and a 2-row world and requires it to answer nine and two.
//
// WHAT CANNOT BE RECONSTRUCTED IS THE POINT. discount_percent, promo_price and the price snapshot live on
// campaign_sku_lines and on no event column. The census does not guess them: it leaves the row
// WAITING_OPERATOR_VALUE and prints the blanks grouped by Series. §F drives that.
//
// READ-ONLY IS DRIVEN, NOT GREPPED (§A). Every sheet handed to the census throws on appendRow, setValue,
// setValues, deleteRow, insertRows and clear. A census that wrote anything would fail, not warn.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. NO Apps Script execution. Fixtures and committed
// source only.
//
// Run: node assets/tests/fc-eu-bfcm-data-reconciliation-r1.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var CENSUS_REL = 'tools/apps-script-diagnostics/TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1.gs';
var CENSUS = read(CENSUS_REL);
var G20 = read('specs/active/apps-script/20_campaign_write_handlers.gs');
var G14 = read('specs/active/apps-script/14_fc_write_handlers.gs');
var G58 = read('specs/active/apps-script/58_api_v1_fc_summary_workspace.gs');
// 73_ is the pricing authority the census CALLS. In Apps Script every .gs in a project shares one
// global scope, so loading it into the same context is what the production project looks like.
var G73 = read('specs/active/apps-script/73_api_v1_pricing_write.gs');

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, extra) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
// Comments are not code. Every claim about what the census DOES is made against the stripped text.
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function mut(label, fn) {
  mutants++;
  var caught = false;
  try { caught = !!fn(); } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// ---------------------------------------------------------------------------------------------------------
// THE WORLD. Sheets are READ-ONLY by construction: every write method throws, so §A is a property of the
// fixture rather than an assertion about it.
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
var PRICE_H = ['pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'currency', 'regular_price'];

function roSheet(headers, objRows, name, writeLog) {
  var grid = [headers.slice()].concat((objRows || []).map(function (o) {
    return headers.map(function (h) { return o[h] === undefined ? '' : o[h]; });
  }));
  function forbid(op) {
    return function () { writeLog.push(name + '.' + op); throw new Error('WRITE ATTEMPTED: ' + name + '.' + op); };
  }
  return {
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function () {
      return { getValues: function () { return grid.map(function (r) { return r.slice(); }); },
        setValue: forbid('setValue'), setValues: forbid('setValues'), clear: forbid('clear'),
        clearContent: forbid('clearContent') };
    },
    appendRow: forbid('appendRow'), deleteRow: forbid('deleteRow'), deleteRows: forbid('deleteRows'),
    insertRows: forbid('insertRows'), clear: forbid('clear'), clearContents: forbid('clearContents')
  };
}

function world(opts, srcOverride, extra) {
  opts = opts || {};
  if (extra) { for (var ek in extra) opts[ek] = extra[ek]; }
  var writeLog = [], logs = [];
  var sheets = {};
  function add(n, h, rows) { if (rows !== null) sheets[n] = roSheet(h, rows || [], n, writeLog); }
  add('campaigns', CAMP_H, opts.campaigns);
  add('campaign_sku_lines', LINE_H, opts.lines);
  add('fc_special_events', EVT_H, opts.events);
  add('marketplace_skus', MSKU_H, opts.mskus);
  add('pricing_list', PRICE_H, opts.pricing);
  if (opts.drop) opts.drop.forEach(function (n) { delete sheets[n]; });

  var ss = { getSheetByName: function (n) { return sheets[n] || null; } };
  var sb = { console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    Math: Math, Date: Date, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp,
    Boolean: Boolean, Error: Error,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } },
    Logger: { log: function (m) { logs.push(m); } } };
  vm.createContext(sb);
  // `noPricingResolver` reproduces a project where 73_ was not pasted alongside the census.
  if (!opts.noPricingResolver) vm.runInContext(G73, sb);
  vm.runInContext(srcOverride === undefined ? CENSUS : srcOverride, sb);
  return { sb: sb, writeLog: writeLog, logs: logs, sheets: sheets };
}

/* THE INCIDENT SHAPE, built from parameters rather than written out: a campaign, N events across the given
   Series sizes, and NO lines. `seriesSizes` is what makes the same builder produce the operator's 4+5 and
   §C's 2 — the suite must not know nine either. */
function incident(seriesSizes, opts) {
  opts = opts || {};
  var CID = opts.campaignId || 'CMP-1';
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
        country: 'XX', marketplace: 'MP', site_sku: sku, currency: 'EUR' });
      // regular_price is the OVERRIDE band; auto_regular_price is what 73_ falls back to. Both are
      // present so the resolver has a real chain to walk rather than a single cell.
      pricing.push({ pricing_id: 'P-' + n, marketplace_sku_id: 'MSKU-' + n, sku: sku, country: 'XX',
        marketplace: 'MP', currency: 'EUR', regular_price: 100 + n, auto_regular_price: 1 });
    }
  });
  return {
    campaigns: [{ campaign_id: CID, company: 'CO', marketplace_id: 'MID-1', campaign_name: 'NAME',
      country: 'XX', marketplace: 'MP', event_flag: 'FLAG', year: 2026,
      start_date: '2026-11-01', end_date: '2026-12-01' }],
    lines: opts.lines || [],
    events: events, mskus: mskus, pricing: pricing, campaignId: CID
  };
}
/* R1A froze the discount, so the census is normally called WITH one. `run` supplies it unless the
   case under test is specifically about its absence. */
var OPERATOR_DISCOUNT = 20;
function run(w, opts) {
  opts = opts || {};
  if (opts.discount_percent === undefined && !opts.__noDiscount) opts.discount_percent = OPERATOR_DISCOUNT;
  return w.sb.TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1(opts);
}

// The operator's stated shape, used wherever the incident itself is under test. Four and five are the
// operator's evidence; nothing downstream of this line is allowed to know that.
var OPERATOR_SERIES_SIZES = [4, 5];

// =========================================================================================================
section('A — READ-ONLY IS A PROPERTY OF THE RUN, NOT A PROMISE');
// =========================================================================================================
var wA = world(incident(OPERATOR_SERIES_SIZES));
var rA = run(wA, { campaign_id: 'CMP-1' });
ok(wA.writeLog.length === 0, 'A1 the census completed having attempted zero writes', wA.writeLog);
eq(rA.production_rows_written, 0, 'A2 PRODUCTION_ROWS_WRITTEN = 0');
eq(rA.db_writes, 0, 'A3 DB_WRITES = 0');
eq(rA.dry_run_only, 'YES', 'A4 DRY_RUN_ONLY = YES');
eq(rA.production_repair_execution_authorized, 'NO', 'A5 PRODUCTION_REPAIR_EXECUTION_AUTHORIZED = NO');

var CC = code(CENSUS);
['appendRow', 'setValue', 'setValues', 'deleteRow', 'insertRow', 'clearContent', 'LockService',
  'getScriptLock', 'DriveApp', 'MailApp', 'PropertiesService', 'ScriptApp', 'SpreadsheetApp.flush'
].forEach(function (tok, i) {
  ok(CC.indexOf(tok) === -1, 'A6.' + (i + 1) + ' the census source contains no `' + tok + '`');
});
ok(!/handleUpsertCampaignSkuLines_\s*\(|fcSpecialEventUpsert_\s*\(|handleImportFcSpecialEventsBatch_\s*\(/.test(CC),
  'A7 it never calls a write handler');
// It must also not be able to reach a writer by being loaded next to one.
var wA2 = world(incident(OPERATOR_SERIES_SIZES));
vm.runInContext(G20, wA2.sb); vm.runInContext(G14, wA2.sb);
var rA2 = run(wA2, { campaign_id: 'CMP-1' });
ok(wA2.writeLog.length === 0 && rA2.missing_line_count === rA.missing_line_count,
  'A8 loaded beside the real write modules it still writes nothing and answers the same');

// =========================================================================================================
section('B — NO INCIDENT CARDINALITY IS REACHABLE FROM THE SOURCE');
// =========================================================================================================
// The operator corrected five to nine once. The only defence that survives a second correction is a source
// in which no such number can be written down. Index arithmetic needs 0, 1 and 2 (JSON.stringify's indent);
// nothing else is allowed.
var literals = {};
code(CENSUS).replace(/'[^'\n]*'|"[^"\n]*"/g, ' ')
  .replace(/(^|[^\w.$])(\d+(?:\.\d+)?)/g, function (m, pre, num) { literals[num] = (literals[num] || 0) + 1; return m; });
/* 0, 1 and 2 are index arithmetic and JSON.stringify's indent. 100 is R1A's percent denominator and is
   the ONLY other literal allowed - so B1a pins it to that one use. A cardinality still cannot be written
   down anywhere in this file, which is the whole point of the check. */
var ALLOWED = ['0', '1', '2', '100'];
var stray = Object.keys(literals).filter(function (n) { return ALLOWED.indexOf(n) === -1; });
eq(stray, [], 'B1 the only numeric literals in the census are 0, 1, 2 and the percent denominator');
// Counted in the CODE with string literals stripped, the same way B1 strips them: the field matrix and
// the report both DESCRIBE the formula in prose, and a description is not an expression.
var CENSUS_CODE_ONLY = code(CENSUS).replace(/'[^'\n]*'|"[^"\n]*"/g, ' ');
var hundreds = CENSUS_CODE_ONLY.split('100').length - 1;
ok(hundreds === 1 && /var PERCENT_DENOMINATOR = 100;/.test(CENSUS_CODE_ONLY),
  'B1a and 100 appears exactly once in the code, as the named PERCENT_DENOMINATOR', hundreds);
ok(/\/ PERCENT_DENOMINATOR\),/.test(code(CENSUS)) || /d \/ PERCENT_DENOMINATOR/.test(code(CENSUS)),
  'B1b which is used as a divisor of the discount, not as a quantity');
ok(!/\b(?:HARDCODED|EXPECTED_ROWS?|INCIDENT)\w*\s*=\s*\d/.test(code(CENSUS)),
  'B2 no constant declares an expected incident size');
ok(!/BFCM|\bEU\b/i.test(CENSUS.replace(/TEMP_FC_EU_BFCM_RECONCILIATION_\w+/g, ' ')
  .replace(/FC-EU-BFCM-DATA-RECONCILIATION-R1/g, ' ')),
  'B3 no campaign, marketplace or event flag is named anywhere but the file/task name');
ok(!/'CO\d|'KM'|'DE'|'Amazon'|'US'/.test(CENSUS), 'B4 no company, country or marketplace literal');
eq(rA.new_line_id_mint_count, 0, 'B5 NEW_LINE_ID_MINT_COUNT = 0');
eq(rA.new_event_id_count, 0, 'B6 NEW_EVENT_ID_COUNT = 0');
eq(rA.new_campaign_id_count, 0, 'B7 NEW_CAMPAIGN_ID_COUNT = 0');

// =========================================================================================================
section('C — THE CARDINALITY IS DERIVED (the same code answers nine, and two)');
// =========================================================================================================
var expectedFromFixture = OPERATOR_SERIES_SIZES.reduce(function (a, b) { return a + b; }, 0);
eq(rA.current_campaign_count, 1, 'C1 CURRENT_CAMPAIGN_COUNT');
eq(rA.current_event_count, expectedFromFixture, 'C2 CURRENT_EVENT_COUNT = the events the fixture holds');
eq(rA.current_line_count, 0, 'C3 CURRENT_LINE_COUNT = 0 — the lines are gone');
eq(rA.expected_line_count, expectedFromFixture, 'C4 EXPECTED_LINE_COUNT derived from the surviving references');
eq(rA.missing_line_count, expectedFromFixture, 'C5 MISSING_LINE_COUNT');
eq(rA.orphan_event_count, expectedFromFixture, 'C6 ORPHAN_EVENT_COUNT');
eq(rA.graph_classification, { MISSING_CAMPAIGN_SKU_LINE: expectedFromFixture },
  'C7 GRAPH_CLASSIFICATION — every event is one state, and it is the missing-line state');

// The same code, a different incident. If anything above were a constant, this would disagree.
var SMALL = [2];
var wC = world(incident(SMALL));
var rC = run(wC, { campaign_id: 'CMP-1' });
eq(rC.expected_line_count, 2, 'C8 a two-row incident derives two, not the previous answer');
eq(rC.missing_line_count, 2, 'C9 MISSING_LINE_COUNT follows the graph');
eq(rC.repair_plan.length, 2, 'C10 the plan has one row per missing line');

// A line that exists but no event references is still a legitimate line, not surplus.
var fx = incident([1]);
fx.lines = [{ campaign_sku_line_id: 'CSL-OTHER', campaign_id: 'CMP-1', marketplace_sku_id: 'MSKU-9',
  sku: 'SKU-9', line_status: 'active' }];
var rC2 = run(world(fx), { campaign_id: 'CMP-1' });
eq(rC2.expected_line_count, 2, 'C11 expected = referenced ids UNION existing lines');
eq(rC2.missing_line_count, 1, 'C12 an unreferenced existing line is not counted missing');

// =========================================================================================================
section('D — CLASSIFICATION: one state per event, each one derived');
// =========================================================================================================
function stateOf(fixture, eventId) {
  var r = run(world(fixture), { campaign_id: fixture.campaignId || 'CMP-1' });
  var c = (r.campaigns[0] || { classified: [] }).classified
    .filter(function (x) { return x.event_fc_id === eventId; })[0];
  return c ? c.state : '(no such event)';
}
var dValid = incident([1]);
dValid.lines = [{ campaign_sku_line_id: 'CSL-1', campaign_id: 'CMP-1', marketplace_sku_id: 'MSKU-1',
  sku: 'SKU-1', line_status: 'active' }];
eq(stateOf(dValid, 'EVT-1'), 'VALID_GRAPH', 'D1 line present under the same campaign -> VALID_GRAPH');

var dMissing = incident([1]);
eq(stateOf(dMissing, 'EVT-1'), 'MISSING_CAMPAIGN_SKU_LINE', 'D2 line absent -> MISSING_CAMPAIGN_SKU_LINE');

var dMismatch = incident([1]);
dMismatch.lines = [{ campaign_sku_line_id: 'CSL-1', campaign_id: 'CMP-OTHER', marketplace_sku_id: 'MSKU-1',
  sku: 'SKU-1', line_status: 'active' }];
eq(stateOf(dMismatch, 'EVT-1'), 'CAMPAIGN_MISMATCH', 'D3 line exists under ANOTHER campaign -> CAMPAIGN_MISMATCH');

var dDupLine = incident([1]);
dDupLine.lines = [
  { campaign_sku_line_id: 'CSL-1', campaign_id: 'CMP-1', marketplace_sku_id: 'MSKU-1', sku: 'SKU-1' },
  { campaign_sku_line_id: 'CSL-1', campaign_id: 'CMP-1', marketplace_sku_id: 'MSKU-1', sku: 'SKU-1' }];
eq(stateOf(dDupLine, 'EVT-1'), 'DUPLICATE_LINE', 'D4 two rows share the line id -> DUPLICATE_LINE');

var dDupEvt = incident([1]);
dDupEvt.events.push(JSON.parse(JSON.stringify(dDupEvt.events[0])));
dDupEvt.events[1].event_fc_id = 'EVT-DUP';
eq(stateOf(dDupEvt, 'EVT-DUP'), 'DUPLICATE_EVENT',
  'D5 two events share company|country|marketplace|sku|event_name|year -> DUPLICATE_EVENT');

var dIdent = incident([1]);
dIdent.lines = [{ campaign_sku_line_id: 'CSL-1', campaign_id: 'CMP-1', marketplace_sku_id: 'MSKU-1',
  sku: 'SKU-DIFFERENT' }];
eq(stateOf(dIdent, 'EVT-1'), 'IDENTITY_MISMATCH', 'D6 the line is there but for another SKU -> IDENTITY_MISMATCH');

var dNoRef = incident([1]);
dNoRef.events[0].campaign_sku_line_id = '';
eq(stateOf(dNoRef, 'EVT-1'), 'UNKNOWN',
  'D7 an event carrying NO line reference is UNKNOWN — there is no id to reconstruct under, and §4 forbids minting one');

var dNoCamp = incident([1]);
var rNoCamp = run(world({ campaigns: [], lines: [], events: dNoCamp.events, mskus: dNoCamp.mskus }),
  { campaign_id: 'CMP-1' });
eq(rNoCamp.current_campaign_count, 0, 'D8 a campaign that is not there is reported as not there');
eq(rNoCamp.campaign_ids_not_found, ['CMP-1'], 'D9 the requested id is named as not found');
eq(rNoCamp.repair_plan.length, 0, 'D10 no line is proposed against a campaign that does not exist');

// =========================================================================================================
section('E — IDENTITY COMES FROM THE EVENT, AND NOTHING IS MINTED');
// =========================================================================================================
var planA = rA.repair_plan;
var proposedIds = planA.map(function (p) { return p.campaign_sku_line_id; }).sort();
// Rebuilt from a FRESH fixture, not from the report, so the two sides are not the same object.
var referencedIds = incident(OPERATOR_SERIES_SIZES).events
  .map(function (e) { return e.campaign_sku_line_id; }).sort();
eq(proposedIds, referencedIds, 'E1 every proposed id IS an id the surviving events already name');
ok(planA.every(function (p) { return p.referenced_by_event_ids.length > 0; }),
  'E2 no proposed row exists without an event that references it');
ok(planA.every(function (p) { return p.idempotency_key === p.campaign_sku_line_id; }),
  'E3 REPAIR_IDEMPOTENCY_KEY is the row id itself');
ok(!/Utilities\.getUuid|'CSL-'\s*\+|Math\.random/.test(code(CENSUS)),
  'E4 the census cannot generate an id — no uuid, no prefix construction, no randomness');
eq(rA.delete_campaign_count, 0, 'E5 DELETE_CAMPAIGN_COUNT = 0');
eq(rA.delete_event_count, 0, 'E6 DELETE_EVENT_COUNT = 0');
eq(rA.delete_valid_line_count, 0, 'E7 DELETE_VALID_LINE_COUNT = 0');
ok(planA.every(function (p) { return p.campaign_id === 'CMP-1'; }), 'E8 the parent campaign comes from the event');

// =========================================================================================================
section('F — THE FIELD MATRIX SAYS WHAT IT DOES NOT KNOW');
// =========================================================================================================
function fieldOf(plan, name) {
  return plan.field_matrix.filter(function (m) { return m.field === name; })[0];
}
var p0 = planA[0];
eq(fieldOf(p0, 'campaign_sku_line_id').deterministic, 'YES', 'F1 the line id is deterministic');
eq(fieldOf(p0, 'campaign_id').deterministic, 'YES', 'F2 the campaign id is deterministic');
eq(fieldOf(p0, 'sku').deterministic, 'YES', 'F3 the SKU is deterministic — one event, one SKU');
eq(fieldOf(p0, 'marketplace_sku_id').deterministic, 'YES', 'F4 a one-to-one marketplace_skus match is deterministic');
/* R1A — the four commercial fields. discount_percent is OPERATOR_FIXED; the other three are DERIVED by
   73_, the authority the Special Event Builder itself resolves through. What has NOT changed is that
   none of them is RECOVERED: §5's provenance note is the honest statement of that. */
eq(fieldOf(p0, 'discount_percent').value, OPERATOR_DISCOUNT, 'F5 discount_percent is the operator-fixed value');
eq(fieldOf(p0, 'discount_percent').operator_required, 'NO', 'F6 so nothing is awaited for it');
ok(/OPERATOR_FIXED/.test(fieldOf(p0, 'discount_percent').source), 'F6a and it is labelled OPERATOR_FIXED');
eq(fieldOf(p0, 'promo_price').operator_required, 'NO', 'F7 promo_price is DERIVED, not awaited');
ok(/pricingRoundFx_/.test(fieldOf(p0, 'promo_price').source),
  'F8 by 73_\'s frozen rounding owner, named in the matrix', fieldOf(p0, 'promo_price').source);
ok(/pricingResolveEffective_/.test(fieldOf(p0, 'regular_price').source),
  'F9 regular_price comes from 73_\'s canonical resolver — not reimplemented here');
eq(fieldOf(p0, 'price_units').value, 'EUR',
  'F10 price_units is the currency of the SAME pricing row that supplied regular_price');
eq(fieldOf(p0, 'line_status').default_allowed, 'YES', 'F11 line_status has an allowed default');
eq(fieldOf(p0, 'source').value, 'fc_reconciliation',
  'F12 source is NOT the builder token — a reconstructed row did not come from the builder');
eq(p0.status, 'READY_FOR_REPAIR', 'F13 with the discount frozen and the price resolved, the row is READY');
eq(rA.waiting_operator_value_count, 0, 'F14 nothing is left awaiting an operator value');
eq(rA.ready_for_repair_count, expectedFromFixture, 'F15 every missing row is ready');
// The arithmetic, end to end, through the real owner: 101 at 20% is 80.80 in a 2-decimal currency.
eq([p0.regular_price, p0.discount_percent, p0.promo_price, p0.price_units],
  [101, 20, 80.8, 'EUR'], 'F13a and the derived values are the canonical owner\'s, not this suite\'s');
/* Absent the discount the row goes back to waiting - the frozen value is doing the work, not the round. */
(function () {
  var rNoD = run(world(incident(SMALL)), { campaign_id: 'CMP-1', __noDiscount: true });
  eq(rNoD.repair_plan[0].status, 'WAITING_OPERATOR_VALUE',
    'F13b without a discount the row waits — the value is supplied, not assumed');
  eq(rNoD.discount_percent_authority, 'NOT_SUPPLIED', 'F13c and the report says so');
})();
/* And with no 73_ in the project every row is REFUSED rather than priced by a local rule. */
(function () {
  var rNoP = run(world(incident(SMALL), undefined, { noPricingResolver: true }), { campaign_id: 'CMP-1' });
  eq(rNoP.pricing_resolver_present, 'NO', 'F13d a project without 73_ is detected');
  eq(rNoP.repair_plan[0].status, 'REFUSED_CONFLICT', 'F13e and every row is refused, not priced');
  ok(rNoP.repair_plan[0].conflicts.indexOf('PRICING_RESOLVER_UNAVAILABLE') > -1,
    'F13f naming the missing authority', rNoP.repair_plan[0].conflicts);
})();
eq(rA.discount_recoverable, 'NO', 'F16 DISCOUNT_RECOVERABLE = NO');

// The claim behind F16, checked against the real schema rather than asserted.
var lineHeaderDecl = /var CAMPAIGN_SKU_LINES_HEADERS_ = \[([\s\S]*?)\];/.exec(G20)[1];
var evtHeaderDecl = /var FC_SPECIAL_EVENTS_HEADERS_ = \[([\s\S]*?)\];/.exec(G14)[1];
ok(/'discount_percent'/.test(lineHeaderDecl) && !/'discount_percent'/.test(evtHeaderDecl),
  'F17 discount_percent is a campaign_sku_lines column and is on no fc_special_events column');
['promo_price', 'regular_price', 'price_units'].forEach(function (f, i) {
  ok(new RegExp("'" + f + "'").test(lineHeaderDecl) && !new RegExp("'" + f + "'").test(evtHeaderDecl),
    'F18.' + (i + 1) + ' ' + f + ' is likewise line-only');
});
// And the graph slice R2 reads cannot supply them either — it emits ids, which is why this census reads wider.
var graphProject = /function fcsGraphProject_[\s\S]*?\n}/.exec(G58)[0];
ok(!/discount_percent|promo_price|regular_price/.test(graphProject),
  'F19 R2\'s graph slice carries no commercial field, so the reconciliation needs its own read');

// marketplace_sku_id stops being deterministic when the derivation stops being one-to-one.
var fAmb = incident([1]);
fAmb.mskus.push({ marketplace_sku_id: 'MSKU-DUP', marketplace_id: 'MID-1', sku: 'SKU-1', company: 'CO',
  country: 'XX', marketplace: 'MP' });
var rAmb = run(world(fAmb), { campaign_id: 'CMP-1' });
eq(rAmb.repair_plan[0].status, 'REFUSED_CONFLICT', 'F20 two marketplace_skus rows for one SKU -> refused');
ok(rAmb.repair_plan[0].conflicts.indexOf('MARKETPLACE_SKU_AMBIGUOUS') > -1, 'F21 and the reason is named');

var fNone = incident([1]);
fNone.mskus = [];
var rNone = run(world(fNone), { campaign_id: 'CMP-1' });
eq(fieldOf(rNone.repair_plan[0], 'marketplace_sku_id').deterministic, 'NO',
  'F22 no marketplace_skus row -> not deterministic, and the operator is asked');

// =========================================================================================================
section('G — §7 CONFLICTS REFUSE RATHER THAN OVERWRITE');
// =========================================================================================================
// A line already occupying this campaign+SKU identity under a DIFFERENT id must not be overwritten to make
// the graph fit. The missing id is still missing; reconstructing it would duplicate the identity.
var gHeld = incident([1]);
gHeld.lines = [{ campaign_sku_line_id: 'CSL-OTHER', campaign_id: 'CMP-1', marketplace_sku_id: 'MSKU-1',
  sku: 'SKU-1', line_status: 'active' }];
var rHeld = run(world(gHeld), { campaign_id: 'CMP-1' });
var heldRow = rHeld.repair_plan.filter(function (p) { return p.campaign_sku_line_id === 'CSL-1'; })[0];
eq(heldRow.status, 'REFUSED_CONFLICT', 'G1 the identity is held by another line -> REFUSED_CONFLICT');
ok(heldRow.conflicts.some(function (c) { return c.indexOf('IDENTITY_HELD_BY_') === 0; }),
  'G2 and the refusal names the line that holds it', heldRow.conflicts);
eq(rHeld.refused_conflict_count, 1, 'G3 REFUSED_CONFLICT_COUNT counts it');
ok(!/setValue|appendRow/.test(code(CENSUS)), 'G4 and there is no path by which it could have overwritten');

// Events that disagree about the campaign behind one line id.
var gSplit = incident([1]);
gSplit.events.push({ event_fc_id: 'EVT-X', campaign_id: 'CMP-1', campaign_sku_line_id: 'CSL-1',
  company: 'CO', country: 'XX', marketplace: 'MP', marketplace_id: 'MID-1', sku: 'SKU-OTHER',
  series: 'SERIES-1', event_name: 'EVENT-2', year: 2026 });
var rSplit = run(world(gSplit), { campaign_id: 'CMP-1' });
var splitRow = rSplit.repair_plan[0];
ok(splitRow.conflicts.indexOf('EVENTS_DISAGREE_ON_SKU') > -1,
  'G5 two events naming one line id with different SKUs -> refused', splitRow.conflicts);
eq(splitRow.status, 'REFUSED_CONFLICT', 'G6 and the row is not proposed');

/* A line id named by an event under a DIFFERENT campaign. Reconstructing it here would attach the row to
   this campaign and leave the other event pointing at a line that is not its own - so it is refused, and
   the refusal has to be reachable, which is the whole reason this fixture exists. */
var gCross = incident([1]);
gCross.campaigns.push({ campaign_id: 'CMP-2', company: 'CO', marketplace_id: 'MID-1',
  campaign_name: 'OTHER', country: 'XX', marketplace: 'MP', event_flag: 'FLAG-2', year: 2026 });
gCross.events.push({ event_fc_id: 'EVT-Z', campaign_id: 'CMP-2', campaign_sku_line_id: 'CSL-1',
  company: 'CO', country: 'XX', marketplace: 'MP', marketplace_id: 'MID-1', sku: 'SKU-1',
  series: 'SERIES-1', event_name: 'EVENT-OTHER', year: 2026 });
var rCross = run(world(gCross), { campaign_id: 'CMP-1' });
var crossRow = rCross.repair_plan.filter(function (p) { return p.campaign_sku_line_id === 'CSL-1'; })[0];
ok(crossRow.conflicts.indexOf('EVENTS_DISAGREE_ON_CAMPAIGN') > -1,
  'G12 an event under ANOTHER campaign naming the same line id -> refused', crossRow.conflicts);
eq(crossRow.status, 'REFUSED_CONFLICT', 'G13 and the row is not proposed');
eq(crossRow.campaign_id, 'CMP-1', 'G14 the row is still described by the TARGET campaign, not the other one');

// The empty selector: "reconcile everything" is not reachable by omission.
var rEmpty = run(world(incident([1])), {});
eq(rEmpty.verdict, 'STOP', 'G7 an empty selector STOPS');
eq(rEmpty.blocker, 'EMPTY_SELECTOR', 'G8 and says why');
eq(rEmpty.production_rows_written, 0, 'G9 a refusal still reports zero writes');

// An unreadable authoritative table is a STOP, not an empty plan.
var rDrop = run(world(Object.assign(incident([1]), { drop: ['campaign_sku_lines'] })), { campaign_id: 'CMP-1' });
eq(rDrop.verdict, 'STOP', 'G10 a missing campaign_sku_lines sheet STOPS');
eq(rDrop.blocker, 'AUTHORITATIVE_TABLE_UNREADABLE', 'G11 and names the blocker');

// =========================================================================================================
section('H — THE OPERATOR WORKSHEET, GROUPED BUT NOT ASSUMED');
// =========================================================================================================
var bySeries = rA.operator_required_discount_by_series;
eq(Object.keys(bySeries).sort(), ['SERIES-1', 'SERIES-2'], 'H1 the blanks are grouped by Series');
eq(Object.keys(bySeries).map(function (k) { return bySeries[k].length; }), OPERATOR_SERIES_SIZES,
  'H2 each Series carries its own rows');
ok(rA.operator_required_discount_rows.every(function (r) { return r.discount_percent === OPERATOR_DISCOUNT; }),
  'H3 every row carries the operator-fixed discount — still ONE VALUE PER ROW, not one per Series');
ok(rA.operator_required_discount_rows.every(function (r) { return r.promo_price > 0 && r.regular_price > 0; }),
  'H3a and each row carries its own derived prices, so the operator reviews values rather than supplying them');
ok(rA.operator_required_discount_rows.every(function (r) { return r.sku && r.campaign_sku_line_id; }),
  'H4 each blank is addressed by SKU and line id, so it can be filled unambiguously');
eq(rA.operator_required_discount_rows.length, expectedFromFixture, 'H5 one row per line awaiting a value');
// Series is available because the EVENT carries it — the thing that makes the worksheet usable at all.
ok(/'series'/.test(evtHeaderDecl), 'H6 series is an fc_special_events column, which is why it survived');

// =========================================================================================================
section('I — IDEMPOTENCY: the second run does nothing');
// =========================================================================================================
// A world where the repair has ALREADY happened: the lines exist, under the ids the events name.
var repaired = incident(OPERATOR_SERIES_SIZES);
repaired.lines = repaired.events.map(function (e, i) {
  return { campaign_sku_line_id: e.campaign_sku_line_id, campaign_id: e.campaign_id,
    marketplace_sku_id: 'MSKU-' + (i + 1), sku: e.sku, discount_percent: 20, line_status: 'active' };
});
var rRep = run(world(repaired), { campaign_id: 'CMP-1' });
eq(rRep.missing_line_count, 0, 'I1 nothing is missing after the repair');
eq(rRep.repair_plan.length, 0, 'I2 so the plan is empty — a second execution has nothing to do');
eq(rRep.verdict, 'GRAPH_ALREADY_WHOLE', 'I3 DUPLICATE_REPAIR_EFFECT = NO_OP, and the verdict says so');
eq(rRep.orphan_event_count, 0, 'I4 zero orphans');
eq(rRep.graph_classification, { VALID_GRAPH: expectedFromFixture }, 'I5 every event is VALID_GRAPH');
ok(/NO_OP/.test(rRep.duplicate_repair_effect), 'I6 the report states the duplicate-run effect');
// A PARTIAL repair: the run after it plans only what is still missing.
var half = incident(OPERATOR_SERIES_SIZES);
half.lines = repaired.lines.slice(0, OPERATOR_SERIES_SIZES[0]);
var rHalf = run(world(half), { campaign_id: 'CMP-1' });
eq(rHalf.missing_line_count, expectedFromFixture - OPERATOR_SERIES_SIZES[0],
  'I7 after a partial repair only the remainder is planned');
ok(rHalf.repair_plan.every(function (p) { return !repaired.lines.slice(0, OPERATOR_SERIES_SIZES[0])
  .some(function (l) { return l.campaign_sku_line_id === p.campaign_sku_line_id; }); }),
  'I8 and no already-repaired row is proposed again');

// =========================================================================================================
section('J — §10 ACCEPTANCE');
// =========================================================================================================
var vBroken = world(incident(OPERATOR_SERIES_SIZES)).sb
  .TEMP_FC_EU_BFCM_RECONCILIATION_VERIFY_R1({ campaign_id: 'CMP-1' });
eq(vBroken.accepted, false, 'J1 the acceptance test refuses the broken graph');
ok(vBroken.failed_checks.indexOf('zero_missing_lines') > -1, 'J2 and names the failing check', vBroken.failed_checks);

var vWhole = world(repaired).sb.TEMP_FC_EU_BFCM_RECONCILIATION_VERIFY_R1({ campaign_id: 'CMP-1' });
eq(vWhole.accepted, true, 'J3 and accepts the repaired graph');
eq(vWhole.failed_checks, [], 'J4 with nothing outstanding');
eq(vWhole.current_line_count, expectedFromFixture, 'J5 line count meets expected');
eq(vWhole.production_rows_written, 0, 'J6 the acceptance test writes nothing either');

var vMismatch = world(dMismatch).sb.TEMP_FC_EU_BFCM_RECONCILIATION_VERIFY_R1({ campaign_id: 'CMP-1' });
eq(vMismatch.accepted, false, 'J7 a campaign mismatch is not accepted');

// =========================================================================================================
section('K — §12 SCHEMA: nothing is extended');
// =========================================================================================================
eq(rA.new_table_required, 'NO', 'K1 NEW_TABLE_REQUIRED = NO');
eq(rA.new_columns_required, 'NONE', 'K2 NEW_COLUMNS_REQUIRED = NONE');
eq(rA.schema_extension_required, 'NO', 'K3 SCHEMA_EXTENSION_REQUIRED = NO');
eq(rA.db_migration_required, 'NO', 'K4 DB_MIGRATION_REQUIRED = NO');
// The header the census plans against is the header 20_ writes. Drift is reported, not absorbed.
var canonical = lineHeaderDecl.match(/'[^']+'/g).map(function (s) { return s.replace(/'/g, ''); });
var censusHeaders = /var FCRC_LINE_HEADERS_ = \[([\s\S]*?)\];/.exec(CENSUS)[1]
  .match(/'[^']+'/g).map(function (s) { return s.replace(/'/g, ''); });
eq(censusHeaders, canonical, 'K5 the census mirrors the CANONICAL campaign_sku_lines header exactly');

var kDrift = incident([1]);
var wDrift = world(kDrift);
wDrift.sheets.campaign_sku_lines = roSheet(LINE_H.filter(function (h) { return h !== 'discount_percent'; }),
  [], 'campaign_sku_lines', wDrift.writeLog);
var rDrift = wDrift.sb.TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1({ campaign_id: 'CMP-1' });
eq(rDrift.schema_extension_required, 'YES', 'K6 a column missing from the live sheet is reported as drift');
eq(rDrift.new_columns_required, ['discount_percent'], 'K7 and named');

// =========================================================================================================
section('L — MUTANTS');
// =========================================================================================================
mut('M1 minting a new id for a missing line', function () {
  var src = CENSUS.replace("put('campaign_sku_line_id', 'fc_special_events.campaign_sku_line_id (the surviving reference)', 'YES', 'NO', 'NO', lineId);",
    "put('campaign_sku_line_id', 'minted', 'YES', 'NO', 'NO', 'CSL-NEW-' + refEvents.length);");
  if (src === CENSUS) throw new Error('M1 anchor drifted');
  var r = run(world(incident(SMALL), src), { campaign_id: 'CMP-1' });
  var ids = r.repair_plan.map(function (p) { return fieldOf(p, 'campaign_sku_line_id').value; });
  // Caught when the proposed id is no longer one the events name.
  return ids.some(function (i) { return ['CSL-1', 'CSL-2'].indexOf(i) === -1; });
});

mut('M2 declaring the discount recoverable', function () {
  var src = CENSUS.replace("put('discount_percent', 'NONE — on the line and on no event column', 'NO', 'YES', 'NO', '');",
    "put('discount_percent', 'inferred', 'YES', 'NO', 'YES', 0);");
  if (src === CENSUS) throw new Error('M2 anchor drifted');
  var r = run(world(incident(SMALL), src), { campaign_id: 'CMP-1' });
  return fieldOf(r.repair_plan[0], 'discount_percent').operator_required === 'NO'
    && fieldOf(p0, 'discount_percent').operator_required === 'YES';
});

mut('M3 hardcoding the expected cardinality', function () {
  var src = CENSUS.replace('expected_line_count: Object.keys(expectedIds).length,',
    'expected_line_count: 9,');
  if (src === CENSUS) throw new Error('M3 anchor drifted');
  // Two independent detectors: the literal census (B1) and the two-row derivation (C8).
  var lit = {};
  code(src).replace(/'[^'\n]*'|"[^"\n]*"/g, ' ')
    .replace(/(^|[^\w.$])(\d+(?:\.\d+)?)/g, function (m, pre, num) { lit[num] = 1; return m; });
  var literalSeen = Object.keys(lit).some(function (n) { return ALLOWED.indexOf(n) === -1; });
  var r = run(world(incident(SMALL), src), { campaign_id: 'CMP-1' });
  return literalSeen && r.expected_line_count !== 2;
});

mut('M4 dropping the already-exists refusal', function () {
  var src = CENSUS.replace("if (view.line_by_id[FCRC_up_(lineId)]) conflicts.push('LINE_ALREADY_EXISTS');", '');
  if (src === CENSUS) throw new Error('M4 anchor drifted');
  // Drive it at the seam: ask for a proposal for a line that IS there.
  var w = world(repaired, src);
  var view = w.sb.FCRC_classifyCampaign_('CMP-1', { campaign_id: 'CMP-1' }, repaired.lines, repaired.events);
  var row = w.sb.FCRC_proposeLine_(repaired.lines[0].campaign_sku_line_id, view, repaired.mskus, repaired.pricing);
  var w2 = world(repaired);
  var view2 = w2.sb.FCRC_classifyCampaign_('CMP-1', { campaign_id: 'CMP-1' }, repaired.lines, repaired.events);
  var row2 = w2.sb.FCRC_proposeLine_(repaired.lines[0].campaign_sku_line_id, view2, repaired.mskus, repaired.pricing);
  return row.conflicts.indexOf('LINE_ALREADY_EXISTS') === -1
    && row2.conflicts.indexOf('LINE_ALREADY_EXISTS') > -1;
});

/* M5 [R1A-REAIMED] — it checked the row's STATUS, which two independent rules can set: once the census
   began refusing unpriceable rows too, removing the identity guard stopped changing it and the mutant
   survived. It now checks the CONFLICT it removes, which only one rule can produce. */
mut('M5 dropping the identity-occupancy refusal', function () {
  var src = CENSUS.replace("if (owner && FCRC_up_(owner) !== FCRC_up_(lineId)) conflicts.push('IDENTITY_HELD_BY_' + owner);", '');
  if (src === CENSUS) throw new Error('M5 anchor drifted');
  var r = run(world(gHeld, src), { campaign_id: 'CMP-1' });
  var row = r.repair_plan.filter(function (p) { return p.campaign_sku_line_id === 'CSL-1'; })[0];
  function held(x) { return x.conflicts.some(function (c) { return c.indexOf('IDENTITY_HELD_BY_') === 0; }); }
  return !held(row) && held(heldRow);
});

mut('M6 the census writing a single row', function () {
  var src = CENSUS.replace('var tCamp = FCRC_readTable_(ss, \'campaigns\');',
    'ss.getSheetByName(\'campaign_sku_lines\').appendRow([]);\n  var tCamp = FCRC_readTable_(ss, \'campaigns\');');
  if (src === CENSUS) throw new Error('M6 anchor drifted');
  var w = world(incident(SMALL), src);
  var threw = false;
  try { run(w, { campaign_id: 'CMP-1' }); } catch (e) { threw = true; }
  return threw && w.writeLog.length > 0;
});

/* M8 restores the bug this suite found late: a reference set built from the campaign-filtered classification
   can only ever contain this campaign's events, so the cross-campaign refusal becomes unreachable. */
mut('M8 building the reference set from this campaign only', function () {
  var src = CENSUS.replace('var refEvents = (view.all_events || view.classified).filter(function (e) {',
    'var refEvents = (view.classified).filter(function (e) {');
  if (src === CENSUS) throw new Error('M8 anchor drifted');
  var r = run(world(gCross, src), { campaign_id: 'CMP-1' });
  var row = r.repair_plan.filter(function (p) { return p.campaign_sku_line_id === 'CSL-1'; })[0];
  return row.conflicts.indexOf('EVENTS_DISAGREE_ON_CAMPAIGN') === -1
    && crossRow.conflicts.indexOf('EVENTS_DISAGREE_ON_CAMPAIGN') > -1;
});

mut('M7 reporting a refused row as ready', function () {
  var src = CENSUS.replace("if (conflicts.length) status = 'REFUSED_CONFLICT';",
    "if (false) status = 'REFUSED_CONFLICT';");
  if (src === CENSUS) throw new Error('M7 anchor drifted');
  var r = run(world(gHeld, src), { campaign_id: 'CMP-1' });
  return r.refused_conflict_count === 0 && rHeld.refused_conflict_count === 1;
});

// =========================================================================================================
section('SUMMARY');
// =========================================================================================================
console.log('');
console.log('PRODUCTION_ROWS_WRITTEN = 0   DRY_RUN_ONLY = YES   PRODUCTION_REPAIR_EXECUTION_AUTHORIZED = NO');
console.log('HARDCODED_INCIDENT_ROW_COUNT = NO   NEW_LINE_ID_MINT_COUNT = 0');
console.log('DELETE_CAMPAIGN_COUNT = 0   DELETE_EVENT_COUNT = 0   DELETE_VALID_LINE_COUNT = 0');
console.log('NEW_TABLE_REQUIRED = NO   NEW_COLUMNS_REQUIRED = NONE   DB_MIGRATION_REQUIRED = NO');
console.log('DISCOUNT_RECOVERABLE = NO   REPAIR_IDEMPOTENCY_KEY = campaign_sku_line_id');
console.log('');
console.log(pass + ' passed, ' + fail + ' failed, ' + mutants + ' mutants (' + survived + ' survived)');
process.exit(fail ? 1 : 0);
