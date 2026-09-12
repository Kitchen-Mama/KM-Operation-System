// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B8C-R1
// The minimal live row-shape readback: one new editor-only function, read-only, no activation.
//
// WHY A SECOND ENTRY POINT EXISTS AT ALL. P1-B8C stopped with STOP_EXISTING_READBACK_INSUFFICIENT: the
// census reaches the shipped builder and then discards every row, because P1-B3's contract was "counts,
// never values" and that contract was RIGHT for the question P1-B3 asked. It is the wrong shape for the
// question P1-B8C asks — WHAT EXACTLY WOULD BE DRAWN — and a renderer cannot draw a price axis from a
// count. The USER authorised one function in the existing diagnostic file. This suite is the fence
// around it.
//
// THE FENCE IS BUILT AROUND THREE WAYS THIS COULD GO WRONG, not around whether it runs:
//
//   1. IT COULD BECOME A BYPASS. A diagnostic that reads the flag, registers an action, gains a
//      parameter or acquires an HTTP path is no longer a diagnostic. §A and §I prove the new function's
//      whole CALL CLOSURE — through 72_ and 29_, not just its own body — reaches neither the flag
//      resolver nor the HTTP handler, and that no protected production file mentions it.
//   2. IT COULD PUBLISH SOMETHING. §G walks the finished report for forbidden KEYS and for the secret
//      VALUE SHAPES that survive a rename, and proves the refusal is FAIL-CLOSED: a violation discards
//      the whole report rather than trimming it, and the refusal carries the path and the rule and
//      never the value.
//   3. IT COULD BE THE FIRST SIXTY ROWS WEARING A SAMPLE'S NAME. §D is the one that caught a real
//      defect: the first spread pass computed `stride = floor(n / remaining)`, which is 1 whenever the
//      universe is under twice the cap, and the "sample" was the head of the order. It looked right
//      because the order is an id sort rather than the sheet's.
//
// THE WRITE PROOF IS STRUCTURAL. The fake spreadsheet below has NO writer methods on it at all. A
// readback that tried to write does not fail an assertion, it throws TypeError with the name of the
// method it reached for.
//
// Run: node assets/tests/product-strategy-row-shape-sample-p1-b8c-r1.test.js

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;

function ok(c, l, d) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); }
}
function eq(a, e, l, d) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else {
    fail++;
    console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A
      + (d === undefined ? '' : '\n  ctx ' + JSON.stringify(d)));
  }
}
/* A THROWING MUTANT IS NOT A CAUGHT ONE. `f()` must return true; an exception — an anchor that no longer
 * matches, most often — counts as SURVIVED, because a green light for a rule nobody checked is the exact
 * failure this project keeps meeting. (P1-B8C's own mut() compared a Promise to === true and reported
 * six survivors that were one harness defect; everything here is synchronous, and it stays that way.) */
function mut(label, f) {
  var caught = false, why = null;
  try { caught = f() === true; } catch (e) { caught = false; why = String((e && e.message) || e); }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else {
    mutSurvived++; fail++;
    console.error('FAIL ' + label + ' — MUTANT SURVIVED' + (why ? ' [threw: ' + why + ']' : ''));
  }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// Line endings normalised at the read — every multi-line anchor below is written with \n, and a fresh
// checkout with core.autocrlf=true would otherwise match none of them.
function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8').replace(/\r\n/g, '\n');
}
/** Comments AND string literals out. A file's own disclaimers name every API it promises not to use. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

var GS = 'assets/specs/active/apps-script/';
var DIAG = 'assets/tools/apps-script-diagnostics/';
var FRB = DIAG + 'TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs';
var F72 = GS + '72_api_v1_product_pricing_workspace.gs';
var F29 = GS + '29_production_safety_adapter.gs';
var F00 = GS + '00_config.gs', F01 = GS + '01_router.gs';
var FMAN = 'docs/planning/P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md';

var SRCRB = read(FRB), SRC72 = read(F72), SRC29 = read(F29), SRC00 = read(F00), SRC01 = read(F01);
var SRCMAN = read(FMAN);

var FN = 'RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE';
var CENSUS = 'RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK';

var WRITERS = ['setValue', 'setValues', 'appendRow', 'insertRow', 'insertRows', 'insertSheet',
  'insertColumn', 'insertColumns', 'deleteRow', 'deleteRows', 'deleteColumn', 'deleteSheet',
  'clearContent', 'clearContents', 'setFormula', 'setBackground', 'setNote', 'copyTo', 'setName',
  'moveTo', 'createSheet', 'setFrozenRows', 'removeDuplicates'];

console.log('=== PRODUCT-STRATEGY-P1-B8C-R1 — minimal live row-shape readback · read-only · no activation ===');

// ---------------------------------------------------------------------------------------------------
// Source tools shared by several sections.
// ---------------------------------------------------------------------------------------------------
/** The whole text of one function, by brace matching, so a scan can be scoped to a body. */
function fnBody(src, name) {
  var i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  var depth = 0, started = false;
  for (var j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}
var BUILTIN = ('String Number Boolean Array Object Math JSON Date RegExp Error isNaN isFinite parseInt '
  + 'parseFloat encodeURIComponent decodeURIComponent push pop shift unshift slice splice map filter '
  + 'forEach reduce sort join split indexOf lastIndexOf substring substr replace trim toLowerCase '
  + 'toUpperCase charAt charCodeAt concat keys values hasOwnProperty toFixed toString valueOf test exec '
  + 'match now getTime stringify parse floor ceil round abs min max pow sqrt isArray if for while switch '
  + 'return function catch try else do new delete void padStart repeat some every find sign toISOString '
  + 'apply call bind length setTimeout reverse fromCharCode Infinity typeof instanceof in').split(' ');

/** Every identifier CALLED inside one function body, comments and string literals stripped first. */
function callsIn(body) {
  var s = bare(body), out = {}, re = /(^|[^.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g, m;
  while ((m = re.exec(s)) !== null) {
    var n = m[2];
    if (BUILTIN.indexOf(n) !== -1) continue;
    out[n] = 1;
  }
  return Object.keys(out).sort();
}
/**
 * THE TRANSITIVE CALL CLOSURE, and it is the only form of this proof that is worth anything.
 *
 * "the new function does not mention the flag" is a claim about one body. "nothing the new function can
 * reach mentions the flag" is a claim about the program, and it is the one that would fail if somebody
 * later taught a shared helper to consult it.
 */
function closureOf(sources, root) {
  var all = sources.join('\n');
  var seen = {}, queue = [root], order = [];
  while (queue.length) {
    var n = queue.shift();
    if (seen[n]) continue;
    seen[n] = 1; order.push(n);
    var body = fnBody(all, n);
    if (!body) continue;
    callsIn(body).forEach(function (c) { if (!seen[c]) queue.push(c); });
  }
  return order.sort();
}

// ===================================================================================================
section('SECTION A  §0/§3 ONE NEW FUNCTION, NO PARAMETERS, AND NOTHING ELSE GREW');
// ===================================================================================================

ok(/function RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE\(\)/.test(SRCRB),
  'A1  the function exists and takes NO parameters — there is nothing for a caller to widen');
var occurrences = (SRCRB.match(new RegExp('function\\s+' + FN + '\\s*\\(', 'g')) || []).length;
eq(occurrences, 1, 'A1a and it is defined exactly once');

// A2 — TWO ENTRY POINTS NOW, AND BOTH ARE NAMED. The old assertion said "exactly one"; it is re-pointed
// rather than deleted, because the rule it protects is "every RUN_ in this file is accounted for", and
// that rule is stronger with two than it was with one.
var rbFns = (SRCRB.match(/^function\s+([A-Za-z0-9_$]+)/gm) || []).map(function (m) {
  return m.replace(/^function\s+/, '');
});
eq(rbFns.filter(function (n) { return /^RUN_/.test(n); }).sort(), [FN, CENSUS].sort(),
  'A2  exactly two RUN_ entry points exist, and both are named here',
  rbFns.filter(function (n) { return /^RUN_/.test(n); }));

ok(!/function\s+doGet|function\s+doPost/.test(SRCRB),
  'A3  the file still defines no web entry point of its own');

// A4 — §2: IT IS IN NO ROUTER TABLE AND OWNS NO ACTION NAME.
ok(SRC01.indexOf(FN) === -1, 'A4  the sample is in no router table');
ok(SRC01.indexOf('rowShapeSample') === -1 && SRC01.indexOf('row_shape_sample') === -1,
  'A4a and no action name resembling it was registered');
var ppActions = (SRC01.match(/'productPricing\.[A-Za-z.]+':/g) || []).sort();
eq(ppActions, ["'productPricing.siteUniverse.get':", "'productPricing.workspace.get':"],
  'A4b the productPricing action table is still exactly the two reads it was', ppActions);

// A5 — §3: THE SHIPPED BUILDER, NOT A SECOND ONE.
var body = fnBody(SRCRB, FN);
ok(body !== null, 'A5  the function body is found');
ok(/ppwWorkspaceBuild_\(tables, req, report\.read_at\)/.test(body),
  'A5a it calls ppwWorkspaceBuild_ — the builder that serves the page');
ok(/ppwValidateRequest_\(payload\)/.test(body),
  'A5b through the shipped request validator, so an invalid scope is refused the same way');
ok(/p1b3ReadTable_\(ss, n\)/.test(body),
  'A5c and reuses the census\'s own table reader');
// THE MANIFEST NAMED A HELPER THAT DOES NOT EXIST. It proposed `p1b3ReadTables_` (plural); the file has
// `p1b3ReadTable_`, singular, called once per table. Asserted so the document and the code agree.
ok(SRCRB.indexOf('function p1b3ReadTables_') === -1,
  'A5d there is no p1b3ReadTables_ — the plural helper the proposal named never existed');
/* A5e READ THE CORRECTION AS THE DEFECT — the G18 trap, for the seventh time in this project.
   The probe asserted the manifest does not contain `p1b3ReadTables_` anywhere. The corrected manifest
   contains it in the SENTENCE THAT CORRECTS IT: "The proposal wrote `p1b3ReadTables_`, plural. No such
   helper exists". A scan of a whole document cannot tell a rule from a sentence about a rule, so the
   probe is bounded to the line that states the reuse. */
var reuseLine = /It reuses `([A-Za-z0-9_]+)` and `ppwWorkspaceBuild_`/.exec(SRCMAN);
ok(!!reuseLine, 'A5e the manifest states which reader the sample reuses');
eq(reuseLine && reuseLine[1], 'p1b3ReadTable_',
  'A5e1 and it is the singular helper that exists', reuseLine && reuseLine[1]);
ok(/No such helper exists/.test(SRCMAN),
  'A5e2 with the plural name it originally proposed marked as never having existed');

// A6 — NO SECOND BUILDER. The one thing a diagnostic must never do is re-decide eligibility its own way.
/* THE FIRST VERSION OF THIS PROBE READ `===` AS AN ASSIGNMENT. `/analysable\s*=/` matched three
   COMPARISONS — `row.analysable === true` in the census's classifier, in the trait list and in the
   reducer — and reported the file as re-deriving a verdict it only reads. The excluded `[^=]` is the
   whole difference between an assignment and a comparison. */
var rowBuilders = (bare(SRCRB).match(/\banalysable\s*=[^=]/g) || []).length;
eq(rowBuilders, 0, 'A6  the file ASSIGNS `analysable` nowhere — it only reads the builder\'s verdict',
  (bare(SRCRB).match(/.{0,40}\banalysable\s*=[^=].{0,20}/g) || []));
ok((SRCRB.match(/row\.analysable === true/g) || []).length > 0,
  'A6b while it does READ the builder\'s verdict, which is what makes A6 a real scope');
ok(SRCRB.indexOf('regionalConfirmed') === -1 && SRCRB.indexOf('pricingAmbiguous') === -1,
  'A6a nor does it re-derive any of the builder\'s intermediate decisions');

// A7 — the row cap is a named constant, and it is 60.
ok(/var P1B8C_ROW_SAMPLE_MAX_ = 60;/.test(SRCRB), 'A7  P1B8C_ROW_SAMPLE_MAX_ = 60');
var capUses = (bare(SRCRB).match(/P1B8C_ROW_SAMPLE_MAX_/g) || []).length;
ok(capUses >= 2, 'A7a and the constant is what the code uses, not a repeated literal', capUses);

// ===================================================================================================
section('SECTION B  §7 THE CALL CLOSURE REACHES NO FLAG, NO HANDLER AND NO WRITER');
// ===================================================================================================

var CLOSURE = closureOf([SRCRB, SRC72, SRC29], FN);
ok(CLOSURE.indexOf('ppwWorkspaceBuild_') !== -1, 'B1  the closure does reach the shipped builder');
ok(CLOSURE.indexOf('ppwNormalizeRow_') !== -1, 'B1a and through it the shipped row normaliser');

[['productStrategyEnabled_', 'the feature flag resolver'],
 ['handleProductPricingWorkspaceGet_', 'the HTTP handler'],
 ['handleProductPricingSiteUniverseGet_', 'the other HTTP handler'],
 ['prodMigrateCreateSheet_', 'the migration sheet creator'],
 ['prodMigrateAppendColumns_', 'the migration column writer'],
 ['getOperationDb', 'the shared DB opener']].forEach(function (p, i) {
  ok(CLOSURE.indexOf(p[0]) === -1,
    'B2.' + (i + 1) + ' NOTHING the sample can reach calls ' + p[0] + ' — ' + p[1]);
});

// B3 — AND THE CENSUS STILL DOES REACH THE HANDLER, so B2 is a real scope and not a claim about a
// program with no handler in it.
var CENSUS_CLOSURE = closureOf([SRCRB, SRC72, SRC29], CENSUS);
ok(CENSUS_CLOSURE.indexOf('handleProductPricingWorkspaceGet_') !== -1,
  'B3  the census DOES reach the handler — the two entry points really do differ here');
ok(CENSUS_CLOSURE.indexOf('productStrategyEnabled_') !== -1,
  'B3a and it DOES read the flag, to report it; the sample does not read it at all');

// B4 — no writer, no lock, no properties, no cache, no Drive, no fetch, anywhere in the closure.
var closureBodies = CLOSURE.map(function (n) {
  return fnBody([SRCRB, SRC72, SRC29].join('\n'), n) || '';
}).join('\n');
var bareClosure = bare(closureBodies);
var hits = WRITERS.filter(function (w) { return new RegExp('\\.' + w + '\\s*\\(').test(bareClosure); });
eq(hits, [], 'B4  not one writer method appears anywhere in the sample\'s call closure', hits);
['LockService', 'PropertiesService', 'CacheService', 'DriveApp', 'UrlFetchApp', 'MailApp',
  'ScriptApp'].forEach(function (s, i) {
  ok(bareClosure.indexOf(s) === -1, 'B4.' + (i + 1) + ' nor ' + s);
});
ok(!/\.createTrigger|newTrigger/.test(bareClosure), 'B4a nor a trigger');

// B5 — §3: no Generate / Submit / Gap Job / Migration / Backfill is reachable.
['handleWeeklyAiPlanGenerate', 'handleShippingPlanSubmit', 'GapMaterialization', 'backfill',
  'materializeGap', 'handleMigrate'].forEach(function (n, i) {
  ok(bareClosure.indexOf(n) === -1, 'B5.' + (i + 1) + ' ' + n + ' is not reachable from the sample');
});

// B6 — the body itself never names the flag, in any form.
ok(body.indexOf('PRODUCT_STRATEGY_ENABLED_') === -1,
  'B6  the body never names the flag constant');
ok(body.indexOf('productStrategyEnabled_') === -1,
  'B6a nor its resolver — flag_read is DECLARED false and the source agrees');
var flagAssign = (bare(SRCRB).match(/PRODUCT_STRATEGY_ENABLED_\s*=/g) || []).length;
eq(flagAssign, 0, 'B6b and the whole file makes zero assignments to the flag');

// ===================================================================================================
section('SECTION C  §3 IT RUNS, AND THE WRITE API IS NOT EVEN PRESENT ON THE FAKE');
// ===================================================================================================
/*
 * A synthetic production DB with every §6 state in it ON PURPOSE, and a Spreadsheet fake whose writer
 * methods are ABSENT rather than stubbed.
 */
var HEADERS = {
  sku_details: ['sku', 'product_name', 'category', 'series', 'image_url', 'lifecycle'],
  marketplace_skus: ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku',
    'marketplace_sku_status', 'currency'],
  sku_regional_details: ['regional_detail_id', 'sku', 'company', 'country', 'marketplace', 'site_sku',
    'product_url', 'marketplace_product_id', 'language', 'status'],
  pricing_list: ['pricing_id', 'marketplace_sku_id', 'currency', 'regular_price', 'minimum_price',
    'msrp', 'price_status', 'price_source'],
  campaigns: ['campaign_id', 'campaign_name', 'status', 'company', 'country', 'marketplace',
    'start_date', 'end_date'],
  campaign_sku_lines: ['campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'promo_price',
    'regular_price', 'discount_percent', 'price_units', 'line_status']
};
// THE URLS AND THE MARKETPLACE PRODUCT IDS ARE IN THE SOURCE ON PURPOSE. A redaction proof against data
// that never contained the thing being redacted proves nothing at all.
function DB() {
  return {
    sku_details: [
      { sku: 'SP-01', product_name: 'Silicone Spatula', category: 'Spatula', series: 'Pro',
        image_url: 'https://images.example.com/sp01.jpg', lifecycle: 'Running in the Market' },
      // An image cell holding something that is not a fetchable address — the UNVERIFIED state.
      { sku: 'SP-02', product_name: 'Spatula Mini', category: 'Spatula', series: 'Pro',
        image_url: 'sp02.jpg', lifecycle: 'Running in the Market' },
      { sku: 'CO-01', product_name: 'Can Opener', category: 'Can Opener', series: 'Classic',
        image_url: 'https://images.example.com/co01.jpg', lifecycle: 'Running in the Market' },
      // No image at all, and no series — two different blanks.
      { sku: 'CO-02', product_name: 'Can Opener Two', category: 'Can Opener', series: '',
        image_url: '', lifecycle: '' },
      { sku: 'WH-01', product_name: 'Whisk', category: 'Whisk', series: 'Classic',
        image_url: 'https://images.example.com/wh01.jpg', lifecycle: 'Running in the Market' }
    ],
    marketplace_skus: [
      { marketplace_sku_id: 'MS1', sku: 'SP-01', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B001', marketplace_sku_status: 'active', currency: 'USD' },
      { marketplace_sku_id: 'MS2', sku: 'SP-02', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B002', marketplace_sku_status: 'active', currency: 'USD' },
      // phasing_out — the non-active state that the DEFAULT status filter still admits.
      { marketplace_sku_id: 'MS3', sku: 'CO-01', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B003', marketplace_sku_status: 'phasing_out', currency: 'USD' },
      { marketplace_sku_id: 'MS4', sku: 'CO-02', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B004', marketplace_sku_status: 'active', currency: 'USD' },
      { marketplace_sku_id: 'MS7', sku: 'WH-01', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B008', marketplace_sku_status: 'active', currency: 'USD' },
      { marketplace_sku_id: 'MS5', sku: 'SP-01', company: 'KM', country: 'CA', marketplace: 'Amazon',
        site_sku: 'B005', marketplace_sku_status: 'active', currency: 'CAD' },
      { marketplace_sku_id: 'MS6', sku: 'CO-01', company: 'KMJ', country: 'JP', marketplace: 'Rakuten',
        site_sku: 'B006', marketplace_sku_status: 'active', currency: 'JPY' }
    ],
    sku_regional_details: [
      { regional_detail_id: 'RD-0001', sku: 'SP-01', company: 'KM', country: 'US',
        marketplace: 'Amazon', site_sku: 'B001', product_url: 'https://shop.example.com/p/1',
        marketplace_product_id: 'ASIN00000001', language: 'en', status: 'complete' },
      { regional_detail_id: 'RD-0002', sku: 'SP-02', company: 'KM', country: 'US',
        marketplace: 'Amazon', site_sku: 'B002', product_url: 'https://shop.example.com/p/2',
        marketplace_product_id: 'ASIN00000002', language: 'en', status: 'complete' },
      { regional_detail_id: 'RD-0003', sku: 'CO-01', company: 'KM', country: 'US',
        marketplace: 'Amazon', site_sku: 'B003', language: 'en', status: 'complete' },
      { regional_detail_id: 'RD-0007', sku: 'WH-01', company: 'KM', country: 'US',
        marketplace: 'Amazon', site_sku: 'B008', language: 'en', status: 'complete' },
      { regional_detail_id: 'RD-0004', sku: 'SP-01', company: 'KM', country: 'CA',
        marketplace: 'Amazon', site_sku: 'B005', language: 'en', status: 'complete' },
      { regional_detail_id: 'RD-0005', sku: 'CO-01', company: 'KMJ', country: 'JP',
        marketplace: 'Rakuten', site_sku: 'B006', language: 'ja', status: 'complete' }
      // MS4 (CO-02 on KM/US/Amazon) has NO regional row — the REGIONAL_DETAILS_MISSING case.
    ],
    pricing_list: [
      { pricing_id: 'PL-01', marketplace_sku_id: 'MS1', currency: 'USD', regular_price: 12.99,
        minimum_price: 9.99, msrp: 15.99, price_status: 'approved', price_source: 'manual' },
      { pricing_id: 'PL-02', marketplace_sku_id: 'MS2', currency: 'USD', regular_price: 10.49,
        minimum_price: 8.49, msrp: '' },
      { pricing_id: 'PL-03', marketplace_sku_id: 'MS3', currency: 'USD', regular_price: 24.99,
        minimum_price: '', msrp: 29.99 },
      { pricing_id: 'PL-04', marketplace_sku_id: 'MS4', currency: 'USD', regular_price: 11.0,
        minimum_price: '', msrp: '' },
      { pricing_id: 'PL-05', marketplace_sku_id: 'MS5', currency: 'CAD', regular_price: 16.99,
        minimum_price: 12.99, msrp: 19.99 },
      { pricing_id: 'PL-06', marketplace_sku_id: 'MS6', currency: 'JPY', regular_price: 2480,
        minimum_price: 1980, msrp: 2980 }
      // MS7 (WH-01) has NO price row at all — the PRICING_SOURCE_MISSING case.
    ],
    campaigns: [
      { campaign_id: 'CMP-1', campaign_name: 'Autumn Kitchen Event', status: 'active', company: 'KM',
        country: 'US', marketplace: 'Amazon', start_date: '2026-09-01', end_date: '2026-09-30' }
    ],
    campaign_sku_lines: [
      { campaign_sku_line_id: 'CL-1', campaign_id: 'CMP-1', marketplace_sku_id: 'MS1',
        promo_price: 9.99, regular_price: 12.99, discount_percent: 23, price_units: 'USD',
        line_status: 'active' }
    ]
  };
}
/* `grow` MAKES THE SHEET APPEND A ROW MID-RUN. Without it, `rows_modified: 0` is a number nothing
   could have moved, and a test of a constant is a test of nothing. With it, the before/after shape
   delta has something to find — which is what makes C6 and K15 real. */
function fakeSheet(name, rows, log, grow) {
  var headers = (HEADERS[name] || []).slice();
  (rows || []).forEach(function (r) {
    Object.keys(r).forEach(function (k) { if (headers.indexOf(k) === -1) headers.push(k); });
  });
  var grid = [headers].concat((rows || []).map(function (r) {
    return headers.map(function (h) { return r[h] === undefined ? '' : r[h]; });
  }));
  var wasRead = false;
  return {
    getName: function () { log.push(name + '.getName'); return name; },
    getLastRow: function () {
      log.push(name + '.getLastRow');
      return grid.length + (grow && wasRead ? 1 : 0);
    },
    getLastColumn: function () { log.push(name + '.getLastColumn'); return headers.length; },
    getDataRange: function () {
      log.push(name + '.getDataRange');
      wasRead = true;
      return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } };
    },
    getRange: function (r, c, nr, nc) {
      log.push(name + '.getRange');
      return { getValues: function () {
        var out = [];
        for (var i = 0; i < (nr || 1); i++) {
          var row = [];
          for (var j = 0; j < (nc || 1); j++) {
            var g = grid[r - 1 + i];
            row.push(g ? (g[c - 1 + j] === undefined ? '' : g[c - 1 + j]) : '');
          }
          out.push(row);
        }
        return out;
      } };
    }
  };
}
var DB_ID = 'SPREADSHEET-ID-UNDER-TEST';
function ctxFor(db, opts) {
  opts = opts || {};
  var log = [];
  var ctx = vm.createContext({ console: console });
  var sheets = {};
  Object.keys(db).forEach(function (n) {
    sheets[n] = fakeSheet(n, db[n], log, opts.grow === true && n === 'pricing_list');
  });
  var ss = {
    getId: function () { return DB_ID; },
    getSheetByName: function (n) { log.push('ss.getSheetByName:' + n); return sheets[n] || null; }
  };
  ctx.SpreadsheetApp = {
    openById: function () {
      log.push('SpreadsheetApp.openById');
      if (opts.wrongTarget) {
        return { getId: function () { return 'SOMETHING-ELSE'; }, getSheetByName: function () { return null; } };
      }
      return ss;
    }
  };
  ctx.Logger = { log: function (s) { log.push('Logger.log'); (ctx.__logged = ctx.__logged || []).push(s); } };
  ctx.KMSAFE = {
    assertExpectedSpreadsheetId: function (s, exp) {
      if (String(s.getId()) !== String(exp)) throw new Error('WRONG_SPREADSHEET_TARGET');
      return true;
    },
    classifySchemaMismatch: function (spec) {
      return { valid: true, schemaStatus: 'OK', actualHeaders: spec.actualHeaders };
    },
    validateMigrationAuthorization: function () { return { authorized: false }; }
  };
  vm.runInContext('var PRODUCTION_DB_SPREADSHEET_ID_ = ' + JSON.stringify(DB_ID) + ';', ctx);
  vm.runInContext('var PRODUCT_STRATEGY_ENABLED_ = false;', ctx);
  vm.runInContext('function productStrategyEnabled_() { return PRODUCT_STRATEGY_ENABLED_ === true; }', ctx);
  vm.runInContext('var SYS_DEPLOYMENT_RELEASE_ = "REL"; var RTR_BUILD_VERSION_ = "RTR";'
    + ' var CONFIG_BUILD_VERSION_ = "CFG";', ctx);
  vm.runInContext(SRC29, ctx);
  vm.runInContext(SRC72, ctx);
  vm.runInContext(opts.src || SRCRB, ctx);
  ctx.__log = log;
  return ctx;
}
function runSample(db, opts) {
  var ctx = ctxFor(db || DB(), opts);
  var r = vm.runInContext('JSON.parse(JSON.stringify(' + FN + '()))', ctx);
  r.__log = ctx.__log.slice();
  r.__logged = (ctx.__logged || []).slice();
  return r;
}
/** The same DB, plus `extra` bulk rows on KM/US/Amazon, to exercise the cap. */
function bulkDB(extra) {
  var d = DB();
  for (var i = 0; i < extra; i++) {
    var n = ('000' + i).slice(-3);
    d.sku_details.push({ sku: 'BK-' + n, product_name: 'Bulk ' + n, category: 'Spatula',
      series: 'Pro', image_url: 'https://images.example.com/bk' + n + '.jpg',
      lifecycle: 'Running in the Market' });
    d.marketplace_skus.push({ marketplace_sku_id: 'MB-' + n, sku: 'BK-' + n, company: 'KM',
      country: 'US', marketplace: 'Amazon', site_sku: 'BB' + n, marketplace_sku_status: 'active',
      currency: 'USD' });
    d.sku_regional_details.push({ regional_detail_id: 'RD-B' + n, sku: 'BK-' + n, company: 'KM',
      country: 'US', marketplace: 'Amazon', site_sku: 'BB' + n, language: 'en', status: 'complete' });
    d.pricing_list.push({ pricing_id: 'PL-B' + n, marketplace_sku_id: 'MB-' + n, currency: 'USD',
      regular_price: 5 + i, minimum_price: 3 + i, msrp: 9 + i });
  }
  return d;
}

var R = runSample();

eq(R.verdict, 'SAMPLE_TAKEN', 'C0  the sample completes against a synthetic production DB', R.error || null);
eq(R.read_only, true, 'C1  read_only = true');
eq(R.writes, 0, 'C2  writes = 0');
eq(R.writer_calls, 0, 'C3  writer_calls = 0');
eq(R.sheets_created, 0, 'C4  sheets_created = 0');
eq(R.drive_writes, 0, 'C5  drive_writes = 0');
eq(R.db_writes, 0, 'C5a db_writes = 0');
eq(R.rows_modified, 0, 'C6  rows_modified = 0 — and this one is MEASURED, before and after');
// C6a — AND THE MEASUREMENT HAS SOMETHING TO FIND. A sheet that grows a row between the two shape
// reads is caught, named, and stops the run. Without this, `rows_modified: 0` is a constant.
var RG = runSample(DB(), { grow: true });
eq(RG.verdict, 'STOP_SOURCE_SHAPE_CHANGED_DURING_READ',
  'C6a a table that grows mid-run stops the sample', RG.rows_modified);
ok(RG.rows_modified !== 0 && RG.rows_modified[0].table === 'pricing_list',
  'C6b naming the table that moved', RG.rows_modified);
eq(R.flag_modified, false, 'C7  flag_modified = false');
eq(R.flag_read, false, 'C7a flag_read = false — and §B proves the closure agrees');
eq(R.deployment_created, false, 'C8  deployment_created = false');
eq(R.version_created, false, 'C8a version_created = false');
eq(R.http_endpoint_called, false, 'C8b http_endpoint_called = false');
// WHICH ZEROES ARE MEASURED AND WHICH ARE DECLARED, said in the output. A zero that looks measured and
// is not is the thing this project keeps finding at the bottom of a false green.
eq(R.counters_that_are_measured, ['rows_modified'], 'C9  the report says which counter is MEASURED');
ok(R.counters_that_are_declared.indexOf('writer_calls') !== -1,
  'C9a and which are DECLARED, writer_calls among them');
ok(/call graph/.test(R.counters_declared_proof), 'C9b naming where the declared ones are proved');

// C10 — the write surface was never touched, measured from what the fake recorded.
var seen = {};
R.__log.forEach(function (l) { seen[l.split(':')[0].replace(/^[A-Za-z_]+\./, '')] = 1; });
var used = Object.keys(seen).sort();
eq(used.filter(function (u) { return WRITERS.indexOf(u) !== -1; }), [],
  'C10  not one writer method appears in the recorded call log', used);
ok(used.indexOf('getDataRange') !== -1, 'C10a while the read method it needs does');

// C11 — a wrong spreadsheet stops it, and the id is never in the output.
/* C11 — AND THE ERROR PATH MUST SURVIVE ITS OWN SCAN.
   The first version of the sample copied the census's idiom, `error.token`. `token` is a FORBIDDEN
   KEY, because that is what a credential is called — so every failure of this function refused itself
   as STOP_P1_B8C_SAMPLE_REDACTION_FAILED and discarded the real error with the report. The one path
   that exists to explain a failure was the one path guaranteed to be refused. The field is
   `safety_token` now, and this assertion is the one that would have caught it. */
var RW = runSample(DB(), { wrongTarget: true });
eq(RW.verdict, 'STOP_SAMPLE_FAILED',
  'C11  a wrong target stops the sample — AND IS NOT SWALLOWED BY THE REDACTION SCAN', RW.violations);
eq(RW.error.safety_token, 'WRONG_SPREADSHEET_TARGET', 'C11a with the safety token');
ok(!Object.prototype.hasOwnProperty.call(RW.error, 'token'),
  'C11a1 under a name the forbidden-key list does not claim');
ok(SRCRB.indexOf('P1B8C_FORBIDDEN_KEYS_') !== -1
  && /'token'/.test(SRCRB.slice(SRCRB.indexOf('var P1B8C_FORBIDDEN_KEYS_'),
    SRCRB.indexOf('var P1B8C_SECRET_SHAPES_'))),
  'C11a2 while `token` stays forbidden — the collision was resolved in the sample, not in the list');
ok(JSON.stringify(RW).indexOf(DB_ID) === -1, 'C11b and no spreadsheet id anywhere in the report');
ok(JSON.stringify(R).indexOf(DB_ID) === -1, 'C11c nor in a successful one');

// C12 — it says what it is, in the output, so a paste can never be mistaken for a fixture.
eq(R.capture_kind, 'LIVE_READBACK', 'C12  capture_kind = LIVE_READBACK');
eq(R.is_live, true, 'C12a is_live = true');
eq(R.not_a_fixture, true, 'C12b not_a_fixture = true');
eq(R.builder_is_the_shipped_one, true, 'C12c and it names the builder it used');
eq(R.builder, 'ppwWorkspaceBuild_', 'C12d by name');
eq(R.action, 'productPricing.workspace.get', 'C12e the ACTION NAME is reported — a contract string');
ok(JSON.stringify(R).indexOf('script.google.com') === -1,
  'C12f and no deployment URL is anywhere near it');

// ===================================================================================================
section('SECTION D  §6 DETERMINISTIC, COVERAGE-FIRST SELECTION — AND NOT THE FIRST SIXTY');
// ===================================================================================================

var RB = runSample(bulkDB(100));
function siteOf(rep, country) {
  return rep.sites.filter(function (s) { return s.ok && s.site.country === country; })[0];
}
var US = siteOf(RB, 'US');
ok(!!US, 'D0  the large site is present');
eq(US.cap, 60, 'D1  the site reports the cap it was held to');
eq(US.sampled_rows, 60, 'D1a and it sampled exactly that many');
eq(US.universe_rows, 105, 'D1b out of a universe it also reports');
eq(US.omitted_rows, 45, 'D1c with the omitted count stated rather than implied');
eq(US.capped, true, 'D1d and `capped` true — a window is never handed over as a whole');

// D2 — THE DEFECT THIS SECTION EXISTS FOR. The sample must not be the head of the order.
var ids = US.rows.map(function (r) { return r.marketplace_sku_id; });
var universeIds = bulkDB(100).marketplace_skus
  .filter(function (r) { return r.country === 'US'; })
  .map(function (r) { return r.marketplace_sku_id; }).sort();
eq(universeIds.length, 105, 'D2  the universe under test really is larger than the cap');
ok(JSON.stringify(ids) !== JSON.stringify(universeIds.slice(0, 60)),
  'D2a THE SAMPLE IS NOT THE FIRST SIXTY OF THE ORDER — the stride defect, asserted');
ok(ids.indexOf(universeIds[universeIds.length - 1]) !== -1,
  'D2b and the LAST row of the universe is in it, which a head never contains');
/* D2c IS THE MEASUREMENT THAT SEPARATES A SPREAD FROM A HEAD, and it is a number rather than a
   spot check. With the rank-based spread, 31 of the 60 sampled rows come from the second half of the
   105-row universe. With the stride defect restored it is 8. A quarter is the line; anything at or
   below it is a sample that lives in the front of the order. */
var sampledIdx = ids.map(function (x) { return universeIds.indexOf(x); });
var farHalf = sampledIdx.filter(function (i) { return i >= Math.floor(universeIds.length / 2); }).length;
ok(farHalf >= Math.ceil(ids.length / 4),
  'D2c at least a quarter of the sample comes from the FAR HALF of the universe',
  { far_half: farHalf, sampled: ids.length, universe: universeIds.length });

// D3 — deterministic: the same source gives the same sample, twice, byte for byte.
var RB2 = runSample(bulkDB(100));
eq(siteOf(RB2, 'US').rows.map(function (r) { return r.marketplace_sku_id; }), ids,
  'D3  the selection is deterministic across runs');
/* D3a FINGERPRINTED THE CLOCK. The report carries `read_at`, `duration_ms` and the builder's own
   `schema.read_at`, all of which are a wall clock and none of which is the selection. Two runs a
   millisecond apart fingerprint differently and always will. What determinism means here is that the
   SELECTION and the MEASUREMENTS are identical, so those are what is compared. */
function withoutClock(rep) {
  var c = JSON.parse(JSON.stringify(rep));
  delete c.read_at; delete c.duration_ms; delete c.emitted; delete c.__log; delete c.__logged;
  (c.sites || []).forEach(function (s) { if (s.schema) delete s.schema.read_at; });
  return c;
}
eq(withoutClock(RB2), withoutClock(RB),
  'D3a and the whole report — selection, coverage and counts — is identical once the clock is removed');
ok(RB.read_at > 0 && RB.emitted.full_report_length > 0,
  'D3a1 while the clock and the length are still reported, because a reader needs them');
eq(R.selection_rule.random, false, 'D3b the rule declares itself not random');
eq(R.selection_rule.first_n, false, 'D3c and not first-n');
eq(R.selection_rule.deterministic, true, 'D3d and deterministic');
eq(R.selection_rule.order, 'marketplace_sku_id ascending',
  'D3e ordered by the row\'s own identity, so sorting the sheet cannot move it');

// D4 — coverage runs FIRST, and the pass counts say so.
ok(US.selected_by_pass.coverage > 0, 'D4  rows were taken by the coverage pass', US.selected_by_pass);
eq(US.traits_not_sampled, [], 'D4a and no state on the site was left unrepresented', US.traits_not_sampled);

// D5 — RAREST FIRST IS THE RULE, AND HERE IS WHY IT MATTERS. One hundred identical bulk rows crowd the
// site; the four original rows carry every rare state. A cap-bounded sample that did not prefer rare
// traits would drop them.
['MS3', 'MS4', 'MS7'].forEach(function (id, i) {
  ok(ids.indexOf(id) !== -1,
    'D5.' + (i + 1) + ' the rare row ' + id + ' survived the cap — rarest-trait-first, working');
});

// D6 — a site smaller than the cap is not capped, and says so.
var CA = siteOf(R, 'CA');
eq(CA.capped, false, 'D6  a small site reports capped = false');
eq(CA.omitted_rows, 0, 'D6a and omits nothing');

// ===================================================================================================
section('SECTION E  §6 COVERAGE IS REPORTED, AND A STATE PRODUCTION LACKS IS A GAP, NEVER A FIXTURE');
// ===================================================================================================

var binaryDims = R.coverage.binary.map(function (b) { return b.dimension; }).sort();
eq(binaryDims, ['analysable', 'data_quality', 'minimum_price', 'msrp', 'product_image', 'promotion',
  'regular_price', 'status'],
  'E1  every §6 binary dimension is reported', binaryDims);
var catDims = R.coverage.categorical.map(function (c) { return c.dimension; }).sort();
eq(catDims, ['category', 'company', 'country', 'currency', 'marketplace', 'series'],
  'E2  and every §6 categorical dimension', catDims);

// E3 — each binary dimension reports the universe count AND the sample count for BOTH values, so
// "covered" is a derived word with the numbers beside it.
R.coverage.binary.forEach(function (b, i) {
  ok(b.universe_counts.length === 2 && b.sample_counts.length === 2,
    'E3.' + (i + 1) + ' ' + b.dimension + ' reports both values in both populations');
});
var uncovered = R.coverage.binary.filter(function (b) { return !b.covered; });
eq(uncovered, [], 'E4  the synthetic universe covers every binary state', uncovered.map(function (b) {
  return b.dimension; }));

// E5 — A STATE PRODUCTION DOES NOT HAVE IS NAMED AND NOT MANUFACTURED.
var noPromo = DB();
noPromo.campaigns = [];
noPromo.campaign_sku_lines = [];
var RNP = runSample(noPromo);
var gap = RNP.evidence_gaps.filter(function (g) {
  return g.code === 'STATE_ABSENT_FROM_PRODUCTION' && g.evidence.dimension === 'promotion';
})[0];
ok(!!gap, 'E5  a universe with no promotion at all reports STATE_ABSENT_FROM_PRODUCTION',
  RNP.evidence_gaps.map(function (g) { return g.code + ':' + JSON.stringify(g.evidence); }));
eq(gap.evidence.values, ['present'], 'E5a naming which value is missing');
ok(/NOTHING\n?\s*WAS MANUFACTURED|NOTHING WAS MANUFACTURED/.test(gap.detail.replace(/\s+/g, ' '))
  || /NOTHING WAS MANUFACTURED/.test(gap.detail),
  'E5b and saying, in the output, that nothing was invented to fill it', gap.detail);
ok(/deterministic fixture/.test(gap.detail) && /label it as one/.test(gap.detail),
  'E5c while pointing at the fixture as the labelled alternative');
var promoDim = RNP.coverage.binary.filter(function (b) { return b.dimension === 'promotion'; })[0];
eq(promoDim.covered, false, 'E5d and the dimension is reported UNCOVERED rather than quietly passing');

// E6 — a single-valued dimension is a gap too: a difference across it cannot be shown from live data.
var oneMarket = R.evidence_gaps.filter(function (g) {
  return g.code === 'DIMENSION_HAS_ONE_VALUE_IN_PRODUCTION';
});
eq(oneMarket, [], 'E6  this universe has more than one value on every categorical dimension', oneMarket);
var flat = DB();
flat.marketplace_skus = flat.marketplace_skus.filter(function (r) { return r.company === 'KM'; });
flat.marketplace_skus.forEach(function (r) { r.country = 'US'; r.marketplace = 'Amazon'; });
var RF = runSample(flat);
ok(RF.evidence_gaps.some(function (g) {
  return g.code === 'DIMENSION_HAS_ONE_VALUE_IN_PRODUCTION' && g.evidence.dimension === 'country';
}), 'E6a and a universe with one country says so, rather than reporting the dimension covered');

// E7 — the universe totals are reported next to the sampled totals.
ok(R.universe.total_rows_across_sampled_sites >= R.universe.total_rows_sampled,
  'E7  the universe total is reported beside the sampled total', R.universe);
eq(R.universe.omitted_rows,
  R.universe.total_rows_across_sampled_sites - R.universe.total_rows_sampled,
  'E7a and the omitted count is their difference, stated');
eq(RB.universe.omitted_rows, 45, 'E7b which is non-zero when the cap bites', RB.universe);

// E8 — the per-site envelope the ACCESSOR validates travels with the rows.
['sourceState', 'analysis_permitted', 'counts', 'membership', 'filtersApplied', 'filterOptions',
  'pagination', 'schema'].forEach(function (k, i) {
  ok(Object.prototype.hasOwnProperty.call(US, k),
    'E8.' + (i + 1) + ' the site carries the envelope field ' + k);
});
ok(US.schema.contract_version === 2, 'E8a with the schema contract version the accessor checks');

// ===================================================================================================
section('SECTION F  §4 THE REDUCED ROW IS AN ALLOWLIST, AND THE NAMES ARE THE BUILDER\'S OWN');
// ===================================================================================================

// THE WIRE SHAPE, MEASURED. The builder is run in the sandbox and its row keys are read off the result,
// so "the sample does not invent a second vocabulary" is checked against the real output rather than
// against a list somebody typed here.
var ctxW = ctxFor(DB());
var wireKeys = vm.runInContext(
  'var __req = ppwValidateRequest_({ scope: { company: "KM", country: "US", marketplace: "Amazon" },'
  + ' include: { regional: true, pricing: true, campaigns: true }, page: { limit: 50 } });'
  + 'var __ss = p1b3OpenTarget_();'
  + 'var __t = {};'
  + '["sku_details","marketplace_skus","sku_regional_details","pricing_list","campaigns",'
  + '"campaign_sku_lines"].forEach(function (n) { __t[n] = p1b3ReadTable_(__ss, n).rows; });'
  + 'var __d = ppwWorkspaceBuild_(__t, __req, Date.now());'
  + 'JSON.parse(JSON.stringify(Object.keys(__d.normalizedRows[0]).sort()))', ctxW);
ok(wireKeys.length > 20, 'F0  the shipped builder\'s row keys were read from a real build', wireKeys.length);

var sampleKeys = Object.keys(US.rows[0]).sort();
var DROPPED = ['product_image', 'regional'];
var DERIVED = ['product_image_present', 'product_image_is_absolute_url', 'regional_present',
  'regional_language', 'campaign_count'];
var expectedKeys = wireKeys.filter(function (k) { return DROPPED.indexOf(k) === -1; })
  .concat(DERIVED).sort();
eq(sampleKeys, expectedKeys,
  'F1  the reduced row is exactly (the wire shape − the dropped fields) + the named derived ones',
  { only_in_sample: sampleKeys.filter(function (k) { return expectedKeys.indexOf(k) === -1; }),
    only_expected: expectedKeys.filter(function (k) { return sampleKeys.indexOf(k) === -1; }) });

// F2 — NO SECOND VOCABULARY. The two renames that read better and are forbidden.
ok(sampleKeys.indexOf('msrp') !== -1 && sampleKeys.indexOf('list_price') === -1,
  'F2  `msrp` was not renamed to list_price');
var camp = US.rows.filter(function (r) { return r.campaign_count > 0; })[0];
ok(!!camp, 'F2a a row with a campaign line is in the sample');
ok(Object.prototype.hasOwnProperty.call(camp.campaigns[0], 'promo_price')
  && !Object.prototype.hasOwnProperty.call(camp.campaigns[0], 'official_deal_price'),
  'F2b and `promo_price` was not renamed to official_deal_price',
  Object.keys(camp.campaigns[0]));

// F3 — THE PRICES ARE THERE, because that is the entire authorised relaxation.
var priced = US.rows.filter(function (r) { return r.regular_price !== null; });
ok(priced.length > 0, 'F3  prices are published — the one clause §0 relaxed');
ok(typeof priced[0].regular_price === 'number', 'F3a as numbers, the builder\'s own type');
ok(US.rows.some(function (r) { return r.minimum_price === null; }),
  'F3b and a missing minimum price is null, not absent and not zero');
ok(US.rows.some(function (r) { return r.msrp === null; }), 'F3c likewise a missing msrp');

// F4 — THE IMAGE IS TWO FACTS AND NEVER AN ADDRESS.
ok(sampleKeys.indexOf('product_image') === -1, 'F4  the image URL field is gone');
var imgAbs = US.rows.filter(function (r) { return r.product_image_is_absolute_url === true; });
var imgRel = US.rows.filter(function (r) {
  return r.product_image_present === true && r.product_image_is_absolute_url === false; });
var imgNone = US.rows.filter(function (r) { return r.product_image_present === false; });
ok(imgAbs.length > 0, 'F4a rows with an absolute-URL image are distinguishable');
ok(imgRel.length > 0, 'F4b from rows whose image cell holds something that is not an address');
ok(imgNone.length > 0, 'F4c from rows with no image at all');
/* AND THAT IS EXACTLY ENOUGH TO DERIVE THE RENDERER'S STATE. `A.imageStateOf` uses three inputs: blank,
   absolute http(s), and MASTER_SKU_RECORD_MISSING among the missing reasons. The third travels in
   `missing_reasons`, so the three states are reconstructable without the URL and without this file
   re-implementing a client function. */
ok(sampleKeys.indexOf('missing_reasons') !== -1,
  'F4d with missing_reasons alongside, which completes imageStateOf\'s three inputs');
var ADAPTER = require(path.join(__dirname, '..', '..', 'assets/js/api/km-product-pricing-adapter.js'));
eq(ADAPTER.imageStateOf({ product_image: '', missing_reasons: [] }), 'IMAGE_SOURCE_MISSING',
  'F4e and the client rule those two booleans stand in for is the one shipped: blank -> missing');
eq(ADAPTER.imageStateOf({ product_image: 'sp02.jpg', missing_reasons: [] }),
  'UNVERIFIED_SOURCE_REFERENCE', 'F4f not-an-address -> unverified');
eq(ADAPTER.imageStateOf({ product_image: 'https://x/y.jpg', missing_reasons: [] }),
  'VERIFIED_DB_MAPPING', 'F4g absolute -> verified');
eq(ADAPTER.imageStateOf({ product_image: 'https://x/y.jpg',
  missing_reasons: ['MASTER_SKU_RECORD_MISSING'] }), 'UNVERIFIED_SOURCE_REFERENCE',
  'F4h and the third input is the one missing_reasons carries');

// F5 — THE REGIONAL JOIN IS A BOOLEAN. Every field on it is a locator or is not needed.
ok(sampleKeys.indexOf('regional') === -1, 'F5  the regional sub-object is dropped whole');
ok(US.rows.some(function (r) { return r.regional_present === true; })
  && US.rows.some(function (r) { return r.regional_present === false; }),
  'F5a while both sides of the join are still distinguishable');

// F6 — findings keep their code and their prose, and lose their evidence.
var withFinding = [].concat.apply([], R.sites.map(function (s) { return s.ok ? s.rows : []; }))
  .filter(function (r) { return r.findings.length > 0 || r.missing_reasons.length > 0; });
ok(withFinding.length > 0, 'F6  data-quality rows are in the sample');
[].concat.apply([], withFinding.map(function (r) { return r.findings; })).forEach(function (f) {
  ok(!Object.prototype.hasOwnProperty.call(f, 'evidence'),
    'F6a and a finding carries no `evidence` — that is where the row\'s own values live');
});

// F7 — A NEW COLUMN CANNOT RIDE ALONG. The reducer names every field; nothing is copied wholesale.
var withExtra = DB();
withExtra.sku_details.forEach(function (r) { r.internal_cost_usd = 3.21; r.buyer_email = 'a@b.com'; });
var RX = runSample(withExtra);
var blobX = JSON.stringify(RX);
ok(RX.verdict === 'SAMPLE_TAKEN', 'F7  a source table with unexpected columns still samples cleanly');
ok(blobX.indexOf('3.21') === -1, 'F7a and an unknown cost column does not reach the report');
ok(blobX.indexOf('a@b.com') === -1, 'F7b nor an unknown email column');
ok(blobX.indexOf('internal_cost_usd') !== -1,
  'F7c though the schema fingerprint still NAMES it, so a new column is visible as a column');

// ===================================================================================================
section('SECTION G  §5 REDACTION: FORBIDDEN KEYS, SECRET SHAPES, AND A FAIL-CLOSED REFUSAL');
// ===================================================================================================

var blob = JSON.stringify(R);
eq(R.redaction.passed, true, 'G0  the clean run passes the scan');
eq(R.redaction.violations, [], 'G0a with no violations');
eq(R.redaction.scanned, true, 'G0b and it says the scan ran');

// G1 — THE VALUES THAT WERE REALLY IN THE SOURCE ARE REALLY NOT IN THE REPORT.
[['https://images.example.com/sp01.jpg', 'an image URL'],
 ['https://shop.example.com/p/1', 'a product URL'],
 ['ASIN00000001', 'a marketplace product id'],
 ['RD-0001', 'a regional detail id'],
 ['PL-01', 'a pricing row id'],
 ['CMP-1', 'a campaign id'],
 ['CL-1', 'a campaign line id'],
 ['Autumn Kitchen Event', 'a campaign name']].forEach(function (p, i) {
  ok(blob.indexOf(p[0]) === -1, 'G1.' + (i + 1) + ' ' + p[1] + ' is not in the report');
});
ok(blob.indexOf('https://') === -1, 'G1a not one absolute URL is anywhere in the report');

// G2 — and the things that ARE meant to be there, are.
ok(blob.indexOf('12.99') !== -1, 'G2  the authorised prices ARE there');
ok(blob.indexOf('B001') !== -1, 'G2a and the site sku, which §4 allows by name');
ok(blob.indexOf('SP-01') !== -1, 'G2b and the master sku');

// G3 — FAIL-CLOSED, and it fires on a value that arrives through the DATA rather than through the code.
var leaky = DB();
leaky.sku_details[0].product_name = 'Silicone Spatula (ops@example.com)';
var RL = runSample(leaky);
eq(RL.verdict, 'STOP_P1_B8C_SAMPLE_REDACTION_FAILED', 'G3  an email in a product name refuses the run');
eq(RL.report_emitted, false, 'G3a and nothing was emitted');
ok(RL.sites === undefined, 'G3b THE WHOLE REPORT IS DISCARDED — not trimmed, not partially handed over');
ok(RL.violation_count > 0, 'G3c the violation count is reported');
eq(RL.violations[0].rule, 'VALUE_SHAPE', 'G3d with the rule that fired');
eq(RL.violations[0].code, 'EMAIL_ADDRESS', 'G3e and its name');
ok(/product_name/.test(RL.violations[0].path), 'G3f and the PATH to it', RL.violations[0].path);
ok(JSON.stringify(RL).indexOf('ops@example.com') === -1,
  'G3g AND THE VALUE ITSELF IS NOT IN THE REFUSAL — a redaction failure that prints what leaked has'
  + ' leaked it into the log it was written to protect');
ok(Object.prototype.hasOwnProperty.call(RL.violations[0], 'value_length')
  && !Object.prototype.hasOwnProperty.call(RL.violations[0], 'value'),
  'G3h the length is reported instead, which is enough to find it and not enough to read it');

// G4 — the other shapes, each fired through the data.
[['product_name', 'See https://vendor.example.com/x', 'ABSOLUTE_URL'],
 ['product_name', 'Widget AKfycbw0NkQ1exampleexample', 'APPS_SCRIPT_EXEC_ID'],
 ['product_name', 'Sheet 1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789Az', 'GOOGLE_FILE_ID_SHAPE'],
 ['product_name', 'Tok ' + 'aB3' + 'xY9zQ7wE2rT5yU8iO1pA4sD6fG0hJ2kL5zXcVbNm', 'OPAQUE_TOKEN']]
  .forEach(function (p, i) {
    var d = DB();
    d.sku_details[0][p[0]] = p[1];
    var rr = runSample(d);
    eq(rr.verdict, 'STOP_P1_B8C_SAMPLE_REDACTION_FAILED',
      'G4.' + (i + 1) + ' ' + p[2] + ' refuses the run');
    ok((rr.violations || []).some(function (v) { return v.code === p[2]; }),
      'G4.' + (i + 1) + 'a and is named as the rule that fired',
      (rr.violations || []).map(function (v) { return v.code; }));
  });

// G5 — A FORBIDDEN KEY IS CAUGHT TOO, and the check is on keys rather than on serialised text.
var scanKeys = vm.runInContext(
  'JSON.parse(JSON.stringify(p1b8cScan_({ a: { product_url: 1 } }, "$", [], [])))', ctxFor(DB()));
eq(scanKeys.length, 1, 'G5  a forbidden key is a violation on its own', scanKeys);
eq(scanKeys[0].rule, 'FORBIDDEN_KEY', 'G5a reported as FORBIDDEN_KEY');
eq(scanKeys[0].code, 'product_url', 'G5b naming the key');
eq(scanKeys[0].path, '$.a.product_url', 'G5c with its path');

// G6 — THE FORBIDDEN-KEY LIST IS REAL, tested one key at a time rather than trusted as a constant.
var ctxG = ctxFor(DB());
['spreadsheet_id', 'script_id', 'deployment_id', 'endpoint', 'url', 'image_url', 'email', 'token',
  'authorization', 'cost', 'margin', 'customer', 'supplier', 'marketplace_product_id',
  'regional_detail_id'].forEach(function (k, i) {
  var v = vm.runInContext('JSON.parse(JSON.stringify(p1b8cScan_('
    + JSON.stringify({ x: 1 }).replace('"x":1', JSON.stringify(k) + ':1') + ', "$", [], [])))', ctxG);
  eq(v.length, 1, 'G6.' + (i + 1) + ' the key `' + k + '` is refused', v);
});

// G7 — AND THE RULE THAT REFUSED THE REPORT'S OWN VOCABULARY IS FIXED, not dodged.
var opaque = vm.runInContext(
  'JSON.parse(JSON.stringify(['
  + ' p1b8cHasOpaqueRun_("RETURN_EVERY_CHUNK_TO_THE_P1_B8C_R2_ROUND"),'
  + ' p1b8cHasOpaqueRun_("product-strategy-row-shape-sample-p1-b8c-r1-test-js"),'
  + ' p1b8cHasOpaqueRun_("aB3xY9zQ7wE2rT5yU8iO1pA4sD6fG0hJ2kL5zXcVbNm"),'
  + ' p1b8cHasOpaqueRun_("short")]))', ctxG);
eq(opaque, [false, false, true, false],
  'G7  a SCREAMING_SNAKE verdict name and a kebab filename are not opaque tokens; a mixed-case run is',
  opaque);
ok(/refused this file's own first report/.test(SRCRB),
  'G7a and the file records WHY the first version of that rule was wrong');

// G8 — the scan is the last thing before the emit, and it is not optional.
var order = body.indexOf('p1b8cScan_');
var emitAt = body.indexOf('p1b8cEmit_');
ok(order > 0 && emitAt > order,
  'G8  the scan runs BEFORE anything is emitted', { scan: order, emit: emitAt });
ok(/report\.redaction\.passed = violations\.length === 0;/.test(body),
  'G8a and `passed` is derived from the violations rather than declared');

// ===================================================================================================
section('SECTION H  §3 THE CHUNKED EMIT CARRIES ALL FOUR FIELDS ON EVERY CHUNK');
// ===================================================================================================

var chunks = RB.__logged;
ok(chunks.length >= 2, 'H0  a large report is emitted in more than one chunk', chunks.length);
eq(chunks.length, RB.emitted.chunk_count, 'H0a and the count it declares is the count it wrote');
var heads = chunks.map(function (c) { return String(c).split('\n')[0]; });
heads.forEach(function (h, i) {
  ok(/chunk_index=\d+/.test(h), 'H1.' + (i + 1) + 'a chunk ' + (i + 1) + ' carries chunk_index');
  ok(/chunk_count=\d+/.test(h), 'H1.' + (i + 1) + 'b and chunk_count');
  ok(/full_report_fingerprint=FP[0-9a-f]{8}/.test(h),
    'H1.' + (i + 1) + 'c and full_report_fingerprint');
  ok(/full_report_length=\d+/.test(h), 'H1.' + (i + 1) + 'd and full_report_length');
});
var fps = {};
heads.forEach(function (h) { fps[/full_report_fingerprint=(FP[0-9a-f]{8})/.exec(h)[1]] = 1; });
eq(Object.keys(fps).length, 1, 'H2  every chunk carries the SAME fingerprint of the whole', Object.keys(fps));
var idxs = heads.map(function (h) { return Number(/chunk_index=(\d+)/.exec(h)[1]); });
eq(idxs, idxs.map(function (_, i) { return i + 1; }),
  'H2a and the indices run 1..n, so a missing chunk is detectable', idxs);

// H3 — the chunks really do reassemble into the report that was returned.
var joined = chunks.map(function (c) { return String(c).split('\n').slice(1).join('\n'); }).join('');
var declaredLen = Number(/full_report_length=(\d+)/.exec(heads[0])[1]);
eq(joined.length, declaredLen, 'H3  the concatenated chunks are exactly the declared length');
var reparsed = null;
try { reparsed = JSON.parse(joined); } catch (e) { reparsed = null; }
ok(reparsed !== null, 'H3a and they parse as JSON');
eq(reparsed && reparsed.verdict, 'SAMPLE_TAKEN', 'H3b carrying the verdict');
eq(reparsed && reparsed.universe.total_rows_sampled, RB.universe.total_rows_sampled,
  'H3c and the same numbers the return value has');

// H4 — the refusal path is chunked too, so a refusal cannot be half-pasted either.
var refusalHead = String(RL.__logged[0]).split('\n')[0];
ok(/chunk_index=1 chunk_count=1/.test(refusalHead),
  'H4  the redaction refusal is emitted as one complete chunk', refusalHead);
ok(/full_report_fingerprint=FP[0-9a-f]{8}/.test(refusalHead), 'H4a with its own fingerprint');

// ===================================================================================================
section('SECTION I  §7 ZERO WRITE, ZERO ROUTER, ZERO FLAG, ZERO PROTECTED-FILE CHANGE');
// ===================================================================================================

// I1 — the protected runtime files are untouched in the ways that matter.
ok(/var PRODUCT_STRATEGY_ENABLED_ = false;/.test(SRC00),
  'I1  PRODUCT_STRATEGY_ENABLED_ is still false in the config of record');
// THE SAME `===` MISTAKE A6 MADE. `/PRODUCT_STRATEGY_ENABLED_\s*=/` also matches the resolver's
// `PRODUCT_STRATEGY_ENABLED_ === true`, so the config looked as though it declared the flag twice.
var flagDecls = (SRC00.match(/PRODUCT_STRATEGY_ENABLED_\s*=[^=]/g) || []).length;
eq(flagDecls, 1, 'I1a assigned in exactly one place',
  (SRC00.match(/.{0,30}PRODUCT_STRATEGY_ENABLED_\s*=[^=].{0,15}/g) || []));
ok(/PRODUCT_STRATEGY_ENABLED_ === true/.test(SRC00),
  'I1a1 while the resolver still COMPARES it, which is what made the first probe wrong');
ok(/'productPricing\.workspace\.get':\s+handleProductPricingWorkspaceGet_/.test(SRC01),
  'I1b the router still dispatches the workspace read to 72_');
[[F72, SRC72], [F00, SRC00], [F01, SRC01], [F29, SRC29]].forEach(function (p, i) {
  ok(p[1].indexOf(FN) === -1,
    'I2.' + (i + 1) + ' ' + p[0].split('/').pop() + ' does not mention the sample');
});
ok(!fs.existsSync(path.join(__dirname, '..', '..', GS,
  'TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs')),
  'I3  and the diagnostic is still NOT in the runtime-owner mirror');

// I4 — THE SAMPLE EXISTS IN EXACTLY ONE FILE IN THE REPOSITORY'S SHIPPED SOURCE.
function walk(dir, out) {
  fs.readdirSync(dir).forEach(function (f) {
    var p = path.join(dir, f);
    var st = fs.statSync(p);
    if (st.isDirectory()) { if (f !== 'node_modules' && f !== '.git') walk(p, out); }
    else if (/\.(gs|js|html)$/.test(f)) out.push(p);
  });
  return out;
}
var ROOT = path.join(__dirname, '..', '..');
var sourceFiles = walk(path.join(ROOT, 'assets'), []).concat(
  fs.readdirSync(ROOT).filter(function (f) { return /\.html$/.test(f); })
    .map(function (f) { return path.join(ROOT, f); }));
var mentions = sourceFiles.filter(function (p) {
  return fs.readFileSync(p, 'utf8').indexOf(FN) !== -1;
}).map(function (p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }).sort();
/* THE THREE SUITES THAT MAY NAME IT, AND NOTHING ELSE. This suite, because it is its fence; the
   P1-B3 suite, because A11b enumerates every RUN_ entry point in the file; and the P1-B8C suite,
   because its A16 records that the file grew a second contract. A FOURTH FILE NAMING IT IS A FAILURE —
   in particular any file under assets/specs/active/apps-script/, assets/js/ or any page. */
eq(mentions, [FRB,
  'assets/tests/product-strategy-row-shape-sample-p1-b8c-r1.test.js',
  'assets/tests/product-strategy-production-readback-p1-b3.test.js',
  'assets/tests/product-strategy-replay-acceptance-p1-b8c.test.js'].sort(),
  'I4  the sample is named by the diagnostic and by three suites, and by nothing else', mentions);
eq(mentions.filter(function (m) { return m.indexOf('assets/tests/') !== 0 && m !== FRB; }), [],
  'I4a and not one of them is shipped source', mentions);

// I4b — AND NOT ONE OF THIS ROUND'S OWN IDENTIFIERS IS ANYWHERE IN THE RUNTIME MIRROR. `P1B8C` is the
// prefix on every constant and helper the round added, so a single scan covers the cap, the forbidden
// key list, the shape rules, the selector and the reducer at once.
var mirror = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) { return /\.gs$/.test(f); });
ok(mirror.length > 10, 'I4b the runtime mirror is found', mirror.length);
eq(mirror.filter(function (f) {
  return fs.readFileSync(path.join(ROOT, GS, f), 'utf8').indexOf('P1B8C') !== -1;
}), [], 'I4b1 and no runtime owner file carries one of this round\'s identifiers');
ok(fs.readFileSync(path.join(ROOT, GS, 'appsscript.json'), 'utf8').indexOf('P1B8C') === -1,
  'I4b2 nor the manifest — no scope, no library, no trigger was added');

// I5 — no page can reach it.
var pages = fs.readdirSync(ROOT).filter(function (f) { return /\.html$/.test(f); });
eq(pages.filter(function (f) { return read(f).indexOf('ROW_SHAPE_SAMPLE') !== -1; }), [],
  'I5  no root document mentions the sample');
eq(pages.filter(function (f) { return read(f).indexOf('TEMP_P1_PRODUCT_STRATEGY') !== -1; }), [],
  'I5a nor the diagnostic file at all');

// I6 — DECLARED COUNTERS MATCH THE SOURCE, so the report's own zeroes are checked against the code.
eq((bare(body).match(/UrlFetchApp|DriveApp|LockService|PropertiesService|CacheService/g) || []), [],
  'I6  the body names no service that could write, lock or persist');
ok(!/SpreadsheetApp\.create|\.insertSheet\(/.test(bare(SRCRB)),
  'I6a and the file creates no spreadsheet and no sheet');

// ===================================================================================================
section('SECTION J  THE ROUND\'S DOCUMENTS SAY THE SAME THING THE CODE DOES');
// ===================================================================================================

ok(/RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE/.test(SRCMAN),
  'J1  the manifest names the function the USER must run');
ok(/P1B8C_ROW_SAMPLE_MAX_ = 60/.test(SRCMAN), 'J2  and the bound, matching the constant');
// J3 — THE PROPOSAL SAID {available, source, url}; THE CODE SHIPS TWO BOOLEANS. The document was
// corrected rather than left to disagree quietly, which is how a manifest becomes fiction.
/* J3 SPRANG THE SAME TRAP. The corrected manifest QUOTES the object it no longer proposes, in the
   paragraph that explains why. The claim worth checking is about the TABLE — the part a reader
   implements from — so the probe is bounded to the table rows of §1.3. */
var s13 = SRCMAN.slice(SRCMAN.indexOf('### 1.3'), SRCMAN.indexOf('### 1.4'));
var tableRows = s13.split('\n').filter(function (l) { return /^\|/.test(l); });
ok(tableRows.length >= 6, 'J3  the §1.3 reduction table is found', tableRows.length);
eq(tableRows.filter(function (l) { return l.indexOf('{available:boolean') !== -1; }), [],
  'J3a no table row proposes an image object the code does not build');
eq(tableRows.filter(function (l) { return l.indexOf('official_deal_price') !== -1; }), [],
  'J3b nor the rename §4 forbids');
ok(tableRows.some(function (l) {
  return l.indexOf('product_image_present') !== -1 && l.indexOf('product_image_is_absolute_url') !== -1;
}), 'J3c and the image row names the two booleans that were built instead');
ok(tableRows.some(function (l) { return l.indexOf('promo_price') !== -1; }),
  'J3d and the campaign row uses the builder\'s own field name');
ok(/IMPLEMENTED AT P1-B8C-R1/.test(SRCMAN),
  'J4  and the section says it is no longer a proposal');
// J5 — THE THREE DEFECTS THE ROUND FOUND ARE IN THE DOCUMENT, because a defect that is only in a
// commit message is a defect nobody will find again.
[['refused the report\'s own vocabulary', 'the scan refusing its own constants'],
 ['error.safety_token', 'the token key collision'],
 ['stride = floor(n / remaining)', 'the head-of-the-order sample']].forEach(function (q, i) {
  ok(SRCMAN.indexOf(q[0]) !== -1, 'J5.' + (i + 1) + ' the manifest records ' + q[1]);
});

// ===================================================================================================
section('SECTION K  MUTANTS');
// ===================================================================================================
/*
 * Each mutant changes ONE thing in the diagnostic source, re-runs the section's own comparison, and must
 * make it fail. A mutant that measures what its own substitution preserved is worse than no mutant,
 * because the count claims something was checked.
 */
function swapIn(src, a, b) {
  if (src.indexOf(a) === -1) throw new Error('ANCHOR NOT FOUND: ' + a.slice(0, 70));
  return src.split(a).join(b);
}
function withSrc(a, b) { return { src: swapIn(SRCRB, a, b) }; }

mut('K1  the cap is raised — the sample stops reporting itself as capped', function () {
  var m = runSample(bulkDB(100), withSrc('var P1B8C_ROW_SAMPLE_MAX_ = 60;',
    'var P1B8C_ROW_SAMPLE_MAX_ = 600;'));
  var s = siteOf(m, 'US');
  return s.cap !== 60 || s.sampled_rows !== 60 || s.capped !== true;
});

mut('K2  the spread pass goes back to stride — D2c sees the sample collapse to the front', function () {
  var m = runSample(bulkDB(100), withSrc(
    '      var at = Math.floor(k * n / remaining);',
    '      var at = k;'));
  var s = siteOf(m, 'US');
  var got = s.rows.map(function (r) { return r.marketplace_sku_id; });
  var uni = bulkDB(100).marketplace_skus.filter(function (r) { return r.country === 'US'; })
    .map(function (r) { return r.marketplace_sku_id; }).sort();
  /* THE FIRST VERSION OF THIS DETECTOR ASKED FOR EXACT EQUALITY WITH `uni.slice(0, 60)` AND SURVIVED.
     The coverage pass runs first and its four rows are wherever the rare traits are, so the mutant's
     sample is the front of the order PLUS those four — never exactly the head. The detector has to be
     D2c's own measurement, which is the one that describes the defect rather than one instance of it. */
  var idx = got.map(function (x) { return uni.indexOf(x); });
  var far = idx.filter(function (i) { return i >= Math.floor(uni.length / 2); }).length;
  return far < Math.ceil(got.length / 4);
});

mut('K3  coverage stops running first — a rare row is crowded out by the cap', function () {
  var m = runSample(bulkDB(100), withSrc(
    '  traitNames.forEach(function (tr) {\n    if (count >= cap) return;',
    '  traitNames.forEach(function (tr) {\n    if (count >= cap || true) return;'));
  var s = siteOf(m, 'US');
  var got = s.rows.map(function (r) { return r.marketplace_sku_id; });
  return ['MS3', 'MS4', 'MS7'].some(function (id) { return got.indexOf(id) === -1; })
    || s.traits_not_sampled.length > 0;
});

mut('K4  rarest-first becomes commonest-first — coverage is no longer guaranteed', function () {
  var m = runSample(bulkDB(100), withSrc(
    '    var d = traitRows[a].length - traitRows[b].length;',
    '    var d = traitRows[b].length - traitRows[a].length;'));
  var s = siteOf(m, 'US');
  var before = siteOf(RB, 'US').rows.map(function (r) { return r.marketplace_sku_id; });
  var after = s.rows.map(function (r) { return r.marketplace_sku_id; });
  // D3's own comparison: the selection must have MOVED, and the pass counts must differ.
  return JSON.stringify(before) !== JSON.stringify(after)
    || s.selected_by_pass.coverage !== siteOf(RB, 'US').selected_by_pass.coverage;
});

mut('K5  the image URL is published again — G1a finds an absolute URL', function () {
  var m = runSample(DB(), withSrc(
    '    product_image_present: img !== \'\',',
    '    product_image: img, product_image_present: img !== \'\','));
  // EITHER the scan refuses it (which is the design) OR the URL is in the report. Both are a catch;
  // what must NOT happen is a clean report with a URL quietly inside it.
  if (m.verdict === 'STOP_P1_B8C_SAMPLE_REDACTION_FAILED') {
    return (m.violations || []).some(function (v) { return v.code === 'ABSOLUTE_URL'; });
  }
  return JSON.stringify(m).indexOf('https://') !== -1;
});

mut('K6  the regional sub-object is copied wholesale — G1 finds the product URL', function () {
  var m = runSample(DB(), withSrc(
    '    regional_present: row.regional !== null && row.regional !== undefined,',
    '    regional: row.regional, regional_present: row.regional !== null && row.regional !== undefined,'));
  if (m.verdict === 'STOP_P1_B8C_SAMPLE_REDACTION_FAILED') {
    return (m.violations || []).some(function (v) {
      return v.code === 'ABSOLUTE_URL' || v.rule === 'FORBIDDEN_KEY';
    });
  }
  return JSON.stringify(m).indexOf('https://shop.example.com') !== -1;
});

mut('K7  the scan becomes advisory — the refusal no longer discards the report', function () {
  var m = runSample((function () {
    var d = DB();
    d.sku_details[0].product_name = 'Silicone Spatula (ops@example.com)';
    return d;
  }()), withSrc('  if (violations.length) {', '  if (false) {'));
  // G3b'S OWN COMPARISON: the whole report must no longer be discarded.
  return m.verdict !== 'STOP_P1_B8C_SAMPLE_REDACTION_FAILED' && m.sites !== undefined;
});

mut('K8  the refusal prints the value it caught — G3g', function () {
  var m = runSample((function () {
    var d = DB();
    d.sku_details[0].product_name = 'Silicone Spatula (ops@example.com)';
    return d;
  }()), withSrc(
    '        out.push({ path: path, rule: \'VALUE_SHAPE\', code: rule.code, value_length: value.length });',
    '        out.push({ path: path, rule: \'VALUE_SHAPE\', code: rule.code, value_length: value.length,'
    + ' value: value });'));
  return JSON.stringify(m).indexOf('ops@example.com') !== -1;
});

mut('K9  the opaque-token rule drops its mixed-case test — the report refuses its own vocabulary',
  function () {
    var m = runSample(DB(), withSrc(
      '    if (/[a-z]/.test(runs[i]) && /[A-Z]/.test(runs[i])) return true;',
      '    if (runs[i].length >= 40) return true;'));
    // G7'S OWN FAILURE MODE, reproduced: a clean run is refused for its own constant names.
    return m.verdict === 'STOP_P1_B8C_SAMPLE_REDACTION_FAILED'
      && (m.violations || []).some(function (v) { return v.code === 'OPAQUE_TOKEN'; });
  });

mut('K10  the sample stops using the shipped builder — F1 sees the wire shape drift', function () {
  var m = runSample(DB(), withSrc(
    '      var data = ppwWorkspaceBuild_(tables, req, report.read_at);',
    '      var data = { normalizedRows: [], sourceState: null, counts: {}, membership: {},'
    + ' filtersApplied: {}, filterOptions: null, pagination: {}, schema: {}, findings: [],'
    + ' refusals: [], analysis_permitted: false };'));
  // F1's comparison cannot be made at all when there are no rows — which is itself the catch.
  var s = siteOf(m, 'US');
  return !s || s.rows.length === 0 || m.universe.total_rows_sampled === 0;
});

mut('K11  a forbidden key is quietly dropped from the list — G5 stops flagging it', function () {
  var ctxM = ctxFor(DB(), withSrc("'web_app_url', 'url', 'product_url', 'image_url',",
    "'web_app_url', 'url', 'image_url',"));
  var v = vm.runInContext(
    'JSON.parse(JSON.stringify(p1b8cScan_({ a: { product_url: 1 } }, "$", [], [])))', ctxM);
  // G5'S OWN COMPARISON: the key that was a violation must have stopped being one.
  return v.length === 0;
});

mut('K12  the chunk header loses its fingerprint — H1c and H2', function () {
  var m = runSample(bulkDB(100), withSrc(
    "      + ' full_report_fingerprint=' + fp",
    "      + ' '"));
  var hs = m.__logged.map(function (c) { return String(c).split('\n')[0]; });
  return hs.some(function (h) { return !/full_report_fingerprint=FP[0-9a-f]{8}/.test(h); });
});

mut('K13  `capped` is hard-coded false — D1d', function () {
  var m = runSample(bulkDB(100), withSrc(
    '    capped: order.length > idx.length,', '    capped: false,'));
  return siteOf(m, 'US').capped !== true;
});

mut('K14  a state absent from production is silently reported as covered — E5', function () {
  var d = DB(); d.campaigns = []; d.campaign_sku_lines = [];
  var m = runSample(d, withSrc(
    '        covered: missingInUniverse.length === 0 && missingInSample.length === 0 });',
    '        covered: true });'));
  var dim = m.coverage.binary.filter(function (b) { return b.dimension === 'promotion'; })[0];
  return dim.covered === true;
});

mut('K15  rows_modified becomes a declared zero — C6a stops catching the growing sheet', function () {
  var opts = withSrc('    report.rows_modified = moved.length === 0 ? 0 : moved;',
    '    report.rows_modified = 0;');
  opts.grow = true;
  var m = runSample(DB(), opts);
  // C6a'S OWN COMPARISON, against a source that really does change under the read.
  return m.verdict !== 'STOP_SOURCE_SHAPE_CHANGED_DURING_READ' && m.rows_modified === 0;
});

mut('K16  the scan stops walking arrays — a leak inside a row list is missed', function () {
  var d = DB();
  d.sku_details[0].product_name = 'Silicone Spatula (ops@example.com)';
  var m = runSample(d, withSrc(
    '  if (value instanceof Array) {\n    for (var i = 0; i < value.length; i++)'
    + ' p1b8cScan_(value[i], path + \'[\' + i + \']\', out, seen);\n    return out;\n  }',
    '  if (value instanceof Array) { return out; }'));
  // G3'S OWN COMPARISON: the report that must be refused is no longer refused.
  return m.verdict !== 'STOP_P1_B8C_SAMPLE_REDACTION_FAILED';
});

mut('K17  the error path goes back to `error.token` — C11 is swallowed again', function () {
  var m = runSample(DB(), (function () {
    var o = withSrc('    report.error = { safety_token: p1b3Str_(e && (e.safetyToken || e.apiCode))'
      + ' || null,', '    report.error = { token: p1b3Str_(e && (e.safetyToken || e.apiCode)) || null,');
    o.wrongTarget = true;
    return o;
  }()));
  // C11'S OWN COMPARISON: the failure no longer reports itself as a failure.
  return m.verdict === 'STOP_P1_B8C_SAMPLE_REDACTION_FAILED';
});

// ===================================================================================================
console.log('\n=== P1-B8C-R1 ROW SHAPE SAMPLE ==='
  + '\npassed   ' + pass + '\nfailed   ' + fail
  + '\nmutants  ' + (mutCaught + mutSurvived) + ' (caught ' + mutCaught
  + ', survived ' + mutSurvived + ')');
if (fail > 0) process.exit(1);
