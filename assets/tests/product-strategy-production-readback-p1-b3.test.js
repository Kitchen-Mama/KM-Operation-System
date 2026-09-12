// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B3
// The read-only production readback, the live universe census, and the ONE production adapter.
//
// THE ONE THING THIS ROUND DECIDES is whether a package may be handed to a person to paste into a
// production Apps Script project. So the suite is built around the ways "read-only" can be true in the
// comment and false in the code, and around the ways a census can measure a pipeline nobody ships.
//
// THE WRITE PROOF IS STRUCTURAL, NOT AN ASSERTION. The fake spreadsheet below has NO writer methods on it
// at all — no setValue, no appendRow, no insertSheet. A readback that tried to write does not fail an
// assertion, it throws TypeError, and §B would go red with the name of the method it reached for. A test
// that asserts `writes === 0` against a counter the code under test increments is a test of the counter.
//
// Run: node assets/tests/product-strategy-production-readback-p1-b3.test.js

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
// A THROWING MUTANT IS NOT A CAUGHT ONE. `f()` must return true; an exception (an anchor that no longer
// matches, most often) counts as SURVIVED, because a green light for a rule nobody checked is the exact
// failure this project has now met three times.
function mut(label, f) {
  var caught = false, why = null;
  try { caught = f() === true; } catch (e) { caught = false; why = String(e && e.message || e); }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else {
    mutSurvived++; fail++;
    console.error('FAIL ' + label + ' — MUTANT SURVIVED' + (why ? ' [threw: ' + why + ']' : ''));
  }
}
function section(t) {
  console.log('\n=== ' + t + ' ===');
}
/* LINE ENDINGS ARE NORMALISED AT THE READ, AND THAT IS THE WHOLE FIX.
 *
 * Checked out fresh, `core.autocrlf=true` gives every .gs CRLF. Every multi-line `swap()` anchor below
 * is written with \n, so on a REAL checkout not one of them matches: swap throws and the mutant is
 * reported by whatever polarity the suite uses. Measured at the previous commit from a detached
 * worktree, this defect was already hiding three surviving mutants in the P1-B1 suite — green only in a
 * working tree where an earlier patch happened to leave 72_ as LF.
 *
 * The fix belongs HERE rather than in the anchors: CRLF anchors would break in an LF worktree and on any
 * Linux checkout, which is the same bug with the sign flipped. Normalising changes nothing about what is
 * executed — these sources run in a vm, where line endings are not semantics. */
function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8').replace(/\r\n/g, '\n');
}

/** Comments AND string literals out. A file's own disclaimers name every API it promises not to use, so a
 *  scan that counted them would be measuring the promise instead of the code. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

var GS = 'assets/specs/active/apps-script/';
var F72 = GS + '72_api_v1_product_pricing_workspace.gs';
// NOT under GS: the readback is an admin census, not a runtime owner. See §A11d.
var DIAG = 'assets/tools/apps-script-diagnostics/';
var FRB = DIAG + 'TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs';
var F00 = GS + '00_config.gs', F01 = GS + '01_router.gs', F63 = GS + '63_api_v1_system_health.gs';
var F29 = GS + '29_production_safety_adapter.gs';
var FAD = 'assets/js/api/km-product-pricing-adapter.js';
var FACC = 'assets/js/api/km-product-pricing-workspace.js';

var SRC72 = read(F72), SRCRB = read(FRB), SRC00 = read(F00), SRC01 = read(F01), SRC63 = read(F63);
var SRC29 = read(F29), SRCAD = read(FAD), SRCACC = read(FACC);
var ADAPTER = require(path.join(__dirname, '..', '..', FAD));
// P1-B8C-R3: the adapter's image rule is the shared policy. The module object is the one the
// adapter itself resolves, so declaring a host here is the same declaration production would make.
var IMG_POLICY = require(path.join(__dirname, '..', 'js/utils/km-image-reference-policy.js'));
/* The fixture's image host, DECLARED ONCE AND BEFORE THE FIRST ROW IS ADAPTED. The policy ships with
   an empty external allowlist, and `g1` is adapted at the top of §E — a declaration made further down
   the file would arrive after the value it is supposed to govern. */
IMG_POLICY.APPROVED_EXTERNAL_HOSTS = ['img'];

console.log('=== PRODUCT-STRATEGY-P1-B3 — production readback · universe census · adapter freeze ===');

// ===================================================================================================
section('SECTION A  §2 THE PACKAGE IS READ-ONLY, PROVED BY CALL GRAPH AND NOT BY ITS OWN COMMENTS');
// ===================================================================================================
/*
 * The four sync-visible files plus the readback. Every identifier CALLED in each one that is not defined
 * in it is enumerated, with comments and string literals stripped FIRST — so the paragraph in 72_ that
 * lists every writer it promises not to use cannot satisfy the check that reads 72_.
 */
var BUILTIN = ('String Number Boolean Array Object Math JSON Date RegExp Error isNaN isFinite parseInt '
  + 'parseFloat encodeURIComponent decodeURIComponent push pop shift unshift slice splice map filter '
  + 'forEach reduce sort join split indexOf lastIndexOf substring substr replace trim toLowerCase '
  + 'toUpperCase charAt charCodeAt concat keys values hasOwnProperty toFixed toString valueOf test exec '
  + 'match now getTime stringify parse floor ceil round abs min max pow sqrt isArray if for while switch '
  + 'return function catch try else do new delete void padStart repeat some every find sign toISOString '
  + 'apply call bind length setTimeout reverse fromCharCode Infinity typeof instanceof in').split(' ');

function externalCalls(src) {
  var s = bare(src);
  var defined = {};
  (s.match(/function\s+([A-Za-z0-9_$]+)\s*\(/g) || []).forEach(function (m) {
    defined[m.replace(/function\s+/, '').replace(/\s*\($/, '')] = 1;
  });
  (s.match(/(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*function/g) || []).forEach(function (m) {
    defined[m.split(/\s+/)[1]] = 1;
  });
  var out = {}, re = /(^|[^.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g, m;
  while ((m = re.exec(s)) !== null) {
    var n = m[2];
    if (defined[n] || BUILTIN.indexOf(n) !== -1) continue;
    out[n] = 1;
  }
  return Object.keys(out).sort();
}
/** Every `Service.method(` in a file, so a Google API call cannot hide behind a helper name. */
function serviceCalls(src) {
  var s = bare(src), out = {};
  (s.match(/\b[A-Z][A-Za-z0-9_$]*\.[A-Za-z0-9_$]+\s*\(/g) || []).forEach(function (m) {
    out[m.replace(/\s*\($/, '')] = 1;
  });
  return Object.keys(out).sort();
}

// A1 — the writer vocabulary, in the CODE of each package file.
/* The writer vocabulary. `Range.sort()` and `Range.removeDuplicates()` ARE writers, but `.sort(` is
 * also how every array in both files is ordered and this scan cannot tell a Range from an Array — it
 * flagged `headers.sort()` as a write. So `sort` is NOT in this list, and that is a KNOWN BLIND SPOT
 * stated rather than a gap left looking like coverage: a Range.sort() would pass §A and be caught in
 * §B instead, where the fake Sheet has no sort method to call. */
var WRITERS = ['setValue', 'setValues', 'appendRow', 'insertRow', 'insertRows', 'insertSheet',
  'insertColumn', 'insertColumns', 'deleteRow', 'deleteRows', 'deleteColumn', 'deleteSheet',
  'clearContent', 'clearContents', 'setFormula', 'setBackground', 'setNote', 'copyTo', 'setName',
  'moveTo', 'createSheet', 'setFrozenRows', 'removeDuplicates'];
[[F72, SRC72], [FRB, SRCRB], [F00, SRC00], [F01, SRC01], [F63, SRC63]].forEach(function (p, i) {
  var b = bare(p[1]);
  var hits = WRITERS.filter(function (w) { return new RegExp('\\.' + w + '\\s*\\(').test(b); });
  // 01_router and 63_ are shared files that legitimately route and report for the whole system; the two
  // files this round OWNS must be clean, and for the shared two the assertion is scoped to the round's
  // own additions in §A2 rather than to the whole file.
  if (p[0] === F72 || p[0] === FRB) {
    eq(hits, [], 'A1.' + (i + 1) + ' ' + p[0].split('/').pop() + ' calls no writer method', hits);
  }
});

// A2 — nothing this round ADDED to a shared file is a writer.
var cp = require('child_process');
function git(c) {
  try { return cp.execSync('git ' + c, { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }); }
  catch (e) { return null; }
}
var addedLines = git('diff c139943 -- ' + GS + ' ' + FAD);
ok(addedLines !== null, 'A2  the round\'s own diff is MEASURED from git, not remembered');
if (addedLines !== null) {
  var added = String(addedLines).split('\n').filter(function (l) {
    return l.charAt(0) === '+' && l.charAt(1) !== '+';
  }).join('\n');
  var addedBare = bare(added);
  var badAdds = WRITERS.filter(function (w) { return new RegExp('\\.' + w + '\\s*\\(').test(addedBare); });
  eq(badAdds, [], 'A2a and not one added line calls a writer method', badAdds);
  ok(!/getOperationDb/.test(addedBare), 'A2b nor getOperationDb');
  ok(!/LockService|CacheService|PropertiesService/.test(addedBare),
    'A2c nor a lock, a cache or a properties store');
  ok(!/UrlFetchApp|MailApp|GmailApp|DriveApp|ScriptApp|newTrigger/.test(addedBare),
    'A2d nor fetch, mail, Drive or a trigger');
}

// A3 — 72_'s complete external surface, named. A new name appearing here is a review event.
eq(externalCalls(SRC72),
  ['prodAssertDbTarget_', 'prodExpectedDbId_', 'prodRequireColumns_', 'prodRequireSheet_',
    'productStrategyEnabled_'],
  'A3  72_ calls exactly five functions it does not define');
eq(serviceCalls(SRC72).filter(function (s) { return /^(SpreadsheetApp|DriveApp|Utilities|Logger)\./.test(s); }),
  ['SpreadsheetApp.openById'],
  'A3a and exactly one Google service method: openById');

// A4 — the readback's surface. Everything it reuses is 72_'s own read path.
var rbExt = externalCalls(SRCRB);
eq(rbExt,
  ['handleProductPricingWorkspaceGet_', 'ppwRowsToObjects_', 'ppwSchemaFingerprint_',
    'ppwValidateRequest_', 'ppwWorkspaceBuild_', 'prodAssertDbTarget_', 'prodExpectedDbId_',
    'productStrategyEnabled_'],
  'A4  the readback calls only the shipped read path and the shared safety helpers', rbExt);
eq(serviceCalls(SRCRB).filter(function (s) {
  return /^(SpreadsheetApp|DriveApp|Utilities|ScriptApp|CacheService|PropertiesService)\./.test(s);
}), ['SpreadsheetApp.openById'],
  'A4a and one Google service method, the same one');

// A5 — THE SHARED SAFETY ADAPTER **CAN** WRITE, AND THE READ PATH DOES NOT CALL THE HALF THAT DOES.
//
// 29_ is not a read-only file and asserting that it is would be false: prodMigrateCreateSheet_ holds
// insertSheet and a header write, prodMigrateAppendColumns_ holds setValues. Both are migration-only and
// both demand a Migration authorization. The claim worth proving is therefore not "this file cannot
// write" but "nothing on the read path reaches the two functions that can" — which is checkable, and
// which a whole-file scan would have hidden by failing for the wrong reason.
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
var READ_HELPERS = ['prodAssertDbTarget_', 'prodExpectedDbId_', 'prodRequireSheet_',
  'prodRequireColumns_', 'prodSchemaError_', 'prodSafetyBundle_'];
var MIGRATION_WRITERS = ['prodMigrateCreateSheet_', 'prodMigrateAppendColumns_'];
var bare29 = bare(SRC29);
READ_HELPERS.forEach(function (n, i) {
  var body = fnBody(bare29, n);
  ok(body !== null, 'A5.' + (i + 1) + ' ' + n + ' is present in 29_');
  var w = WRITERS.filter(function (x) { return new RegExp('\\.' + x + '\\s*\\(').test(body || ''); });
  eq(w, [], 'A5.' + (i + 1) + 'a and calls no writer', w);
});
// The migration half EXISTS — asserted, so this test fails if someone deletes it and the pair above
// silently becomes a claim about a file with no writers in it at all.
MIGRATION_WRITERS.forEach(function (n, i) {
  var body = fnBody(bare29, n);
  ok(body !== null, 'A5b.' + (i + 1) + ' ' + n + ' exists');
  var w = WRITERS.filter(function (x) { return new RegExp('\\.' + x + '\\s*\\(').test(body || ''); });
  ok(w.length > 0, 'A5b.' + (i + 1) + 'a and it IS a writer — so the scope of A5 is real', w);
  ok(/migrationAuth|validateMigrationAuthorization/.test(body || ''),
    'A5b.' + (i + 1) + 'b gated on a Migration authorization');
  // AND IT IS NOT REACHABLE FROM THE READ PATH.
  ok(bare(SRC72).indexOf(n) === -1, 'A5b.' + (i + 1) + 'c and 72_ never calls it');
  ok(bare(SRCRB).indexOf(n) === -1, 'A5b.' + (i + 1) + 'd nor does the readback');
});

// A6 — §2.3/§2.4: no sheet is created and no schema is altered.
ok(!/getSheetByName\([^)]*\)\s*\|\|/.test(bare(SRC72)),
  'A6  72_ has no "get sheet or create it" idiom');
ok(/SCHEMA_NOT_PROVISIONED/.test(SRC29) || /SCHEMA_NOT_PROVISIONED/.test(SRC72),
  'A6a a missing sheet is a typed refusal');
ok(!/insertSheet|ensureSheet|ensure_sheet/.test(bare(SRC72) + bare(SRCRB)),
  'A6b and nothing in either file provisions one');

// A7 — §2.5: no Cache/Properties used as business data.
ok(!/CacheService|PropertiesService/.test(bare(SRC72) + bare(SRCRB)),
  'A7  neither file stores business data in Cache or Properties');

// A8 — §2.6: no Generate/Submit/Gap/backfill reachable from the read.
['handleWeeklyAiPlanGenerate', 'handleShippingPlanSubmit', 'GapMaterialization', 'backfill',
  'handleGenerate', 'materializeGap'].forEach(function (n, i) {
  ok(bare(SRC72).indexOf(n) === -1 && bare(SRCRB).indexOf(n) === -1,
    'A8.' + (i + 1) + ' neither file can reach ' + n);
});

// A9 — §2.7: the business-state tables are not named anywhere in the read path.
['factory_stock', 'allocation_draft', 'shipping_plans', 'shipping_plan_lines', 'shipments',
  'shipment_lines'].forEach(function (t, i) {
  var hit = SRC72.indexOf("'" + t + "'") !== -1 || SRCRB.indexOf("'" + t + "'") !== -1;
  ok(!hit, 'A9.' + (i + 1) + ' ' + t + ' is not a table either file reads');
});

// A10 — §2.8/§2.9: the flag is false, and the router exposes no UI because of it.
ok(/var PRODUCT_STRATEGY_ENABLED_ = false;/.test(SRC00),
  'A10  PRODUCT_STRATEGY_ENABLED_ is false in the config of record');
ok(/'productPricing\.workspace\.get':\s+handleProductPricingWorkspaceGet_/.test(SRC01),
  'A10a the router dispatches the action to 72_ (so a partial sync is a named failure)');
var expected = (SRC63.match(/KM_EXPECTED_ACTION_CONTRACT_VERSION_/) || []).length;
ok(/SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 14;/.test(SRC63),
  'A10b the deployment declares action contract 14 — P1-B6 added productPricing.siteUniverse.get');
// §2.9 — no PAGE calls it, so no unauthorised UI can appear from a flag that is false.
var pages = fs.readdirSync(path.join(__dirname, '..', '..')).filter(function (f) { return /\.html$/.test(f); });
var callers = pages.filter(function (f) {
  return read(f).indexOf('productPricing.workspace.get') !== -1
    || read(f).indexOf('km-product-pricing-adapter.js') !== -1;
});
/* A10c RESTATED AT P1-B7 §4. It asserted `[]` — no root document loads the adapter — which was the
   form of "a false flag cannot produce UI" available before the page was installed. The shell loads
   it now, so the assertion names WHICH document, and a second one is still a failure. The rule it
   protects has not moved: what stops unauthorised UI is the server flag and the staged section, and
   neither of those is "nothing loads the file". */
eq(callers, ['index.html'],
  'A10c the adapter is loaded by exactly one root document — the Operation System shell', callers);
ok(read('index.html').indexOf("showSection('product-strategy") === -1,
  'A10c1 and that document cannot switch to the section: no menu item, no call');

// A11 — §2.10: the readback is reachable ONLY from the editor. No action name, no router row.
ok(SRC01.indexOf('RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK') === -1,
  'A11  the readback is in no router table');
ok(!/function\s+doGet|function\s+doPost/.test(SRCRB),
  'A11a and defines no web entry point of its own');
var rbFns = (SRCRB.match(/^function\s+([A-Za-z0-9_$]+)/gm) || []).map(function (m) {
  return m.replace(/^function\s+/, '');
});
/* A11b RESTATED AT P1-B8C-R1. It asserted `['RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK']` — one
   entry point — which was the form of "every way into this file is accounted for" available while
   there was one. The USER authorised a second, RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE, and the
   assertion NAMES BOTH rather than being relaxed to a count: a third appearing is still a failure,
   and the rule it protects — no unenumerated entry point — is stronger with two than it was with one.
   Neither is in a router table (A11), and neither defines a web entry point (A11a). */
eq(rbFns.filter(function (n) { return /^RUN_/.test(n); }).sort(),
  ['RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK', 'RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE'],
  'A11b exactly two RUN_ entry points exist, and both are named here',
  rbFns.filter(function (n) { return /^RUN_/.test(n); }));
ok(SRC01.indexOf('RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE') === -1,
  'A11b1 and the second one is in no router table either');
ok(/function RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE\(\)/.test(SRCRB),
  'A11b2 and takes no parameters, the same way');
// A11d — AND IT IS FILED WITH THE OTHER CENSUSES, NOT AMONG THE RUNTIME OWNERS. Every .gs in the
// runtime mirror is audited as a named owner with the reason it was touched; a one-off admin census
// owns no action, no table and no schema. It is still synced — this is where it is KEPT.
ok(fs.existsSync(path.join(__dirname, '..', '..', FRB)),
  'A11d the readback lives in assets/tools/apps-script-diagnostics/');
ok(!fs.existsSync(path.join(__dirname, '..', '..', GS,
  'TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs')),
  'A11e and not in the runtime-owner mirror');
ok(fs.readdirSync(path.join(__dirname, '..', '..', DIAG)).length > 10,
  'A11f alongside the other read-only censuses');
ok(/function RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK\(\)/.test(SRCRB),
  'A11c and it takes NO parameters — there is nothing for a caller to widen');

// ===================================================================================================
section('SECTION B  §3 THE READBACK RUNS, AND THE WRITER API IS NOT EVEN PRESENT');
// ===================================================================================================
/*
 * A synthetic production DB, and a Spreadsheet fake with a read-only surface and nothing else. Every
 * method the readback is permitted is on it; no writer is. So "the write API is unreachable" is proved by
 * the absence of the method rather than by a counter the code under test maintains.
 */
function DB(over) {
  var d = {
    sku_details: [
      { sku: 'SP-01', product_name: 'Silicone Spatula', category: 'Spatula', series: 'Pro',
        image_url: 'https://img/sp01.jpg', lifecycle: 'Running in the Market' },
      { sku: 'SP-02', product_name: 'Spatula Mini', category: 'Spatula', series: 'Pro',
        image_url: 'sp02.jpg', lifecycle: 'Running in the Market' },
      { sku: 'CO-01', product_name: 'Can Opener', category: 'Can Opener', series: 'Classic',
        image_url: 'https://img/co01.jpg', lifecycle: 'Running in the Market' },
      // A CASE-ONLY SPELLING of an existing category. §7 must PROPOSE and never merge.
      { sku: 'CO-02', product_name: 'Can Opener Two', category: 'can opener', series: '',
        image_url: '', lifecycle: '' },
      { sku: 'ZZ-99', product_name: 'Unlisted', category: '', series: 'Classic', image_url: '' }
    ],
    marketplace_skus: [
      { marketplace_sku_id: 'MS1', sku: 'SP-01', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B001', marketplace_sku_status: 'active', currency: 'USD' },
      { marketplace_sku_id: 'MS2', sku: 'SP-02', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B002', marketplace_sku_status: 'active', currency: 'USD' },
      { marketplace_sku_id: 'MS3', sku: 'CO-01', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B003', marketplace_sku_status: 'inactive', currency: 'USD' },
      { marketplace_sku_id: 'MS4', sku: 'CO-02', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B004', marketplace_sku_status: 'active', currency: 'USD' },
      // Another COUNTRY, priced in USD — the population P1 needs to be provable at all.
      { marketplace_sku_id: 'MS5', sku: 'SP-01', company: 'KM', country: 'CA', marketplace: 'Amazon',
        site_sku: 'B005', marketplace_sku_status: 'active', currency: 'USD' },
      // Another COMPANY on the same marketplace name.
      { marketplace_sku_id: 'MS6', sku: 'CO-01', company: 'KMJ', country: 'JP', marketplace: 'Amazon',
        site_sku: 'B006', marketplace_sku_status: 'active', currency: 'JPY' },
      // A site row with NO identity — cannot be joined to anything.
      { marketplace_sku_id: '', sku: 'ZZ-99', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B007', marketplace_sku_status: 'active', currency: 'USD' }
    ],
    sku_regional_details: [
      { regional_detail_id: 'R1', sku: 'SP-01', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B001', product_url: 'https://a/1', status: 'complete' },
      { regional_detail_id: 'R2', sku: 'SP-02', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B002', status: 'complete' },
      { regional_detail_id: 'R3', sku: 'CO-01', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B003', status: 'complete' },
      { regional_detail_id: 'R4', sku: 'SP-01', company: 'KM', country: 'CA', marketplace: 'Amazon',
        site_sku: 'B005', status: 'complete' },
      { regional_detail_id: 'R5', sku: 'CO-01', company: 'KMJ', country: 'JP', marketplace: 'Amazon',
        site_sku: 'B006', status: 'complete' },
      // ORPHAN: a Regional Detail for a master SKU the catalogue does not have.
      { regional_detail_id: 'R9', sku: 'GONE-01', company: 'KM', country: 'US', marketplace: 'Amazon',
        site_sku: 'B099', status: 'complete' }
      // NOTE: MS4 (CO-02 on KM/US/Amazon) has NO regional row — the missing-Regional case.
    ],
    pricing_list: [
      { pricing_id: 'P1', marketplace_sku_id: 'MS1', currency: 'USD', regular_price: 12.99,
        minimum_price: 9.99, msrp: 15.99, price_status: 'approved' },
      { pricing_id: 'P2', marketplace_sku_id: 'MS2', currency: 'USD', regular_price: 10.49,
        minimum_price: 8.49, msrp: 12.99 },
      { pricing_id: 'P3', marketplace_sku_id: 'MS3', currency: 'USD', regular_price: 24.99,
        minimum_price: 19.99, msrp: 29.99 },
      { pricing_id: 'P4', marketplace_sku_id: 'MS4', currency: 'USD', regular_price: 11.0,
        minimum_price: '', msrp: '' },
      { pricing_id: 'P5', marketplace_sku_id: 'MS5', currency: 'USD', regular_price: 16.99,
        minimum_price: 12.99, msrp: 19.99 },
      { pricing_id: 'P6', marketplace_sku_id: 'MS6', currency: 'JPY', regular_price: 2480,
        minimum_price: 1980, msrp: 2980 },
      // ORPHAN price: an id no marketplace_skus row owns.
      { pricing_id: 'P9', marketplace_sku_id: 'MS-GONE', currency: 'USD', regular_price: 5.0 }
    ],
    campaigns: [
      { campaign_id: 'C1', campaign_name: 'Autumn', status: 'active', company: 'KM', country: 'US',
        marketplace: 'Amazon', start_date: '2026-09-01', end_date: '2026-09-30' },
      { campaign_id: 'C2', campaign_name: 'Ended', status: 'ended', company: 'KM', country: 'US',
        marketplace: 'Amazon', start_date: '2026-07-01', end_date: '2026-07-31' }
    ],
    campaign_sku_lines: [
      { campaign_sku_line_id: 'L1', campaign_id: 'C1', marketplace_sku_id: 'MS1', promo_price: 9.99,
        regular_price: 12.99, discount_percent: 23 },
      { campaign_sku_line_id: 'L2', campaign_id: 'C2', marketplace_sku_id: 'MS1', promo_price: 8.99 }
    ]
  };
  Object.keys(over || {}).forEach(function (k) {
    if (over[k] === null) { delete d[k]; } else { d[k] = over[k]; }
  });
  return d;
}

/* A REAL EMPTY SHEET STILL HAS ITS HEADER ROW, and the first version of this fake did not: building the
 * headers from the rows meant a table with zero rows had zero columns, which 72_ correctly reports as
 * HEADER_MISSING. So the SOURCE_EMPTY case was never reached and §C3 was testing the wrong refusal. The
 * headers are declared per table, so "no rows" and "no header" stay two different states. */
var HEADERS = {
  sku_details: ['sku', 'product_name', 'category', 'series', 'image_url', 'lifecycle'],
  marketplace_skus: ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku',
    'marketplace_sku_status', 'currency'],
  sku_regional_details: ['regional_detail_id', 'sku', 'company', 'country', 'marketplace', 'site_sku',
    'product_url', 'status'],
  pricing_list: ['pricing_id', 'marketplace_sku_id', 'currency', 'regular_price', 'minimum_price',
    'msrp', 'price_status'],
  campaigns: ['campaign_id', 'campaign_name', 'status', 'company', 'country', 'marketplace',
    'start_date', 'end_date'],
  campaign_sku_lines: ['campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'promo_price',
    'regular_price', 'discount_percent']
};

/** A read-only Sheet. The writer methods are ABSENT, not stubbed. */
function fakeSheet(name, rows, log) {
  var headers = (HEADERS[name] || []).slice();
  (rows || []).forEach(function (r) {
    Object.keys(r).forEach(function (k) { if (headers.indexOf(k) === -1) headers.push(k); });
  });
  var grid = [headers].concat((rows || []).map(function (r) {
    return headers.map(function (h) { return r[h] === undefined ? '' : r[h]; });
  }));
  return {
    getName: function () { log.push(name + '.getName'); return name; },
    getLastRow: function () { log.push(name + '.getLastRow'); return grid.length; },
    getLastColumn: function () { log.push(name + '.getLastColumn'); return headers.length; },
    getDataRange: function () {
      log.push(name + '.getDataRange');
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
  Object.keys(db).forEach(function (n) { sheets[n] = fakeSheet(n, db[n], log); });
  var ss = {
    getId: function () { return DB_ID; },
    getSheetByName: function (n) { log.push('ss.getSheetByName:' + n); return sheets[n] || null; }
  };
  ctx.SpreadsheetApp = {
    openById: function (id) {
      log.push('SpreadsheetApp.openById');
      if (opts.wrongTarget) return { getId: function () { return 'SOMETHING-ELSE'; },
        getSheetByName: function () { return null; } };
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
  vm.runInContext('var PRODUCT_STRATEGY_ENABLED_ = '
    + (opts.flag === true ? 'true' : 'false') + ';', ctx);
  vm.runInContext('function productStrategyEnabled_() { return PRODUCT_STRATEGY_ENABLED_ === true; }', ctx);
  vm.runInContext('var SYS_DEPLOYMENT_RELEASE_ = "REL"; var RTR_BUILD_VERSION_ = "RTR";'
    + ' var CONFIG_BUILD_VERSION_ = "CFG";', ctx);
  vm.runInContext(SRC29, ctx);
  vm.runInContext(SRC72, ctx);
  vm.runInContext(SRCRB, ctx);
  ctx.__log = log;
  return ctx;
}
function runReadback(db, opts) {
  var ctx = ctxFor(db || DB(), opts);
  var r = vm.runInContext(
    'JSON.parse(JSON.stringify(RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()))', ctx);
  r.__log = ctx.__log.slice();
  return r;
}

var R = runReadback();

ok(R.verdict !== 'STOP_READBACK_FAILED',
  'B0  the readback completes against a synthetic production DB', R.error || null);
eq(R.read_only, true, 'B1  read_only = true');
eq(R.writes, 0, 'B2  writes = 0');
eq(R.writer_calls, 0, 'B3  writer_calls = 0');
ok(/DECLARED/.test(R.writer_calls_is),
  'B3a and it says out loud that this one is DECLARED, proved by call graph elsewhere');
eq(R.sheets_created, 0, 'B4  sheets_created = 0');
eq(R.rows_modified, 0, 'B5  rows_modified = 0 — and this one is MEASURED');
ok(/MEASURED/.test(R.rows_modified_is), 'B5a and it says which of the two it is');
eq(R.feature_flag, false, 'B6  feature_flag = false');
eq(R.endpoint, 'productPricing.workspace.get', 'B7  the endpoint is named');
eq(R.schema_contract_version, 2, 'B7a with the response-shape contract version');
ok(/^F1-7N-/.test(R.handler_build), 'B7b and the handler build', R.handler_build);
ok(R.build === 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R8',
  'B7c the readback declares the round it belongs to', R.build);

// B8 — THE WRITE SURFACE WAS NEVER TOUCHED, measured from what the fake recorded.
var methods = {};
R.__log.forEach(function (l) { methods[l.split(':')[0]] = 1; });
var touched = Object.keys(methods).map(function (m) { return m.replace(/^[a-z_]+\./i, ''); });
var uniq = {};
touched.forEach(function (t) { uniq[t] = 1; });
var used = Object.keys(uniq).sort();
eq(used.filter(function (u) { return WRITERS.indexOf(u) !== -1; }), [],
  'B8  not one writer method appears in the recorded call log', used);
ok(used.indexOf('getDataRange') !== -1 && used.indexOf('getLastRow') !== -1,
  'B8a while the read methods it needs do', used);

// B9 — THE LIVE GATE PROOF. The real endpoint refused, having opened nothing.
eq(R.gate_proof.refusal_code, 'FEATURE_DISABLED', 'B9  the deployed action refuses while the flag is false');
eq(R.gate_proof.db_opened, false, 'B9a and had not opened the spreadsheet when it did');
eq(R.gate_proof.tables_read, 0, 'B9b nor read a table');
eq(R.gate_proof.flag_was_injected, false, 'B9c and the readback did not inject a flag to get there');
eq(R.gate_proof.source_state, null, 'B9d a refusal measures no source state, so it reports null');

// B10 — the report is chunked, and every chunk can be checked for completeness.
ok(R.emitted.chunks >= 1, 'B10  the report is emitted in chunks');
ok(/^FP[0-9a-f]{8}$/.test(R.emitted.fingerprint), 'B10a with a fingerprint of the whole');
ok(R.emitted.chars > 0, 'B10b and the total length, so a missing chunk is detectable');

// B11 — a wrong spreadsheet is refused by token, and the id never appears in the output.
var RW = runReadback(DB(), { wrongTarget: true });
eq(RW.verdict, 'STOP_READBACK_FAILED', 'B11  a wrong target stops the readback');
eq(RW.error.token, 'WRONG_SPREADSHEET_TARGET', 'B11a with the safety token');
ok(JSON.stringify(RW).indexOf(DB_ID) === -1,
  'B11b and no spreadsheet id is anywhere in the report');
ok(JSON.stringify(R).indexOf(DB_ID) === -1, 'B11c nor in a successful one');

// B12 — §3 forbids unnecessary sensitive data. No price value reaches the report.
var blob = JSON.stringify(R);
['12.99', '10.49', '24.99', '15.99', '2480'].forEach(function (v, i) {
  ok(blob.indexOf(v) === -1, 'B12.' + (i + 1) + ' the price ' + v + ' is not in the report');
});
ok(blob.indexOf('https://img/sp01.jpg') === -1, 'B12a nor an image URL');
ok(blob.indexOf('https://a/1') === -1, 'B12b nor a product URL');

// ===================================================================================================
section('SECTION C  §4 THE UNIVERSE IS MEASURED, AND ABSENT IS NOT EMPTY');
// ===================================================================================================

// C1 — the four core tables plus the two campaign tables, each with present/readable/fingerprint.
eq(Object.keys(R.source_tables).sort(),
  ['campaign_sku_lines', 'campaigns', 'marketplace_skus', 'pricing_list', 'sku_details',
    'sku_regional_details'],
  'C1  every source table is reported');
['sku_details', 'marketplace_skus', 'sku_regional_details', 'pricing_list'].forEach(function (t, i) {
  eq([R.source_tables[t].present, R.source_tables[t].readable], [true, true],
    'C1.' + (i + 1) + ' ' + t + ' present and readable');
  // ppwHash_ is FNV-1a, eight uppercase hex digits. The 'FP' prefix belongs to the readback's OWN
  // report fingerprint (p1b3Hash_), which is a different function for a different purpose.
  ok(/^[0-9A-F]{8}$/.test(R.source_tables[t].fingerprint),
    'C1.' + (i + 1) + 'a with a schema fingerprint', R.source_tables[t].fingerprint);
  ok(R.source_tables[t].headers.length > 0, 'C1.' + (i + 1) + 'b and its header names');
});

// C2 — AN ABSENT TABLE IS NOT AN EMPTY ONE. The single most important distinction in §4.
var Rabsent = runReadback(DB({ pricing_list: null }));
eq([Rabsent.source_tables.pricing_list.present, Rabsent.source_tables.pricing_list.readable],
  [false, false], 'C2  a missing sheet reports present:false');
eq(Rabsent.source_tables.pricing_list.reason, 'SCHEMA_NOT_PROVISIONED',
  'C2a with a typed reason, not an empty array');
eq(Rabsent.verdict, 'SOURCE_PARTIALLY_READABLE',
  'C2b and the verdict is NOT a pass');
eq(Rabsent.next_action, 'PROVISION_OR_REPAIR_THE_NAMED_TABLES_THEN_RERUN',
  'C2c the next action names the repair');
ok((Rabsent.evidence_gaps || []).some(function (g) { return g.code === 'SOURCE_TABLE_NOT_READABLE'; }),
  'C2d and the evidence gap is recorded');

// C3 — AN EMPTY TABLE IS A MEASUREMENT. Present, readable, zero rows.
var Rempty = runReadback(DB({ marketplace_skus: [] }));
eq([Rempty.source_tables.marketplace_skus.present, Rempty.source_tables.marketplace_skus.readable],
  [true, true], 'C3  an empty sheet with a header row is present and readable');
eq(Rempty.source_tables.marketplace_skus.row_count, 0, 'C3a with zero rows');
eq(Rempty.verdict, 'SOURCE_EMPTY', 'C3b and the verdict is SOURCE_EMPTY, not partially readable');
eq(Rempty.next_action, 'POPULATE_MARKETPLACE_SKUS_THEN_RERUN', 'C3c naming what to populate');

// C4 — sku_details: distinct raw categories and series, with blanks counted separately.
var SD = R.census.sku_details;
eq(SD.distinct_raw_category, ['Can Opener', 'Spatula', 'can opener'],
  'C4  every distinct RAW category value, unmerged and sorted');
eq(SD.blank_category_rows, 1, 'C4a with the blank rows counted apart');
eq(SD.distinct_series, ['Classic', 'Pro'], 'C4b and the distinct series');
eq(SD.blank_series_rows, 1, 'C4c with its own blank count');

// C5 — marketplace_skus: the site identities, statuses, duplicates and blanks.
var MS = R.census.marketplace_skus;
// THREE, not four: the identity-less row is ALSO KM/US/Amazon, so it adds a row to a site that
// already exists rather than a site of its own.
eq(MS.site_count, 3, 'C5  three distinct company/country/marketplace identities');
eq(MS.status_counts.active, 6, 'C5a the active count includes the identity-less row');
eq(MS.status_counts.inactive, 1, 'C5b the inactive count');
eq(MS.blank_identity_rows, 1, 'C5c the site row with no marketplace_sku_id is counted');
eq(MS.duplicate_identity_total, 0, 'C5d and there are no duplicate identities here');

// C6 — regional: canonical identity, orphans, missing site_sku.
var RG = R.census.sku_regional_details;
eq(RG.canonical_identity, ['sku', 'company', 'country', 'marketplace'],
  'C6  the canonical identity is the four-part one');
eq(RG.orphan_master_sku, ['gone-01'], 'C6a the orphan Regional Detail is named');
eq(RG.duplicate_canonical_identity_total, 0, 'C6b no duplicate four-part identity');

// C7 — pricing: identity, orphans, missing values, currency coverage.
var PL = R.census.pricing_list;
eq(PL.identity, 'marketplace_sku_id', 'C7  pricing is keyed on marketplace_sku_id');
eq(PL.orphan_price_identity, ['MS-GONE'], 'C7a the orphan price row is named');
eq(PL.missing_value_counts.msrp, 2, 'C7b missing msrp rows are counted');
eq(PL.msrp_is_the_list_price, true, 'C7c and msrp IS the list price — one band, two words');
eq(Object.keys(PL.currency_coverage).sort(), ['JPY', 'USD'], 'C7d currency coverage');

// C8 — the hierarchy, in full.
eq(Object.keys(R.hierarchy).sort(), ['KM', 'KMJ'], 'C8  Company level');
eq(Object.keys(R.hierarchy.KM).sort(), ['CA', 'US'], 'C8a Country level under KM');
eq(R.hierarchy.KM.US.map(function (m) { return m.marketplace; }), ['Amazon'],
  'C8b Marketplace level under KM/US');
eq(R.hierarchy.KMJ.JP.map(function (m) { return m.marketplace; }), ['Amazon'],
  'C8c and the OTHER company on the same marketplace name is its own site');

// C9 — no "first N and claim complete": the site pass reports its own cap.
eq(R.sites_capped, false, 'C9  the site pass was not capped here');
eq(R.sites.length, 3, 'C9a and every site was classified');
ok(/P1B3_SITE_MAX_/.test(SRCRB) && /SITE_PASS_CAPPED/.test(SRCRB),
  'C9b and a cap would be reported as a cap rather than counted as a pass');

// C10 — §7.6: no fixed category ceiling anywhere.
eq(SD.category_allowlist, null, 'C10  there is no category allowlist');
eq(SD.category_max, null, 'C10a and no maximum number of categories');
var many = [];
for (var i = 0; i < 40; i++) {
  many.push({ sku: 'X' + i, category: 'Cat' + i, series: 'S' + i, image_url: '' });
}
var Rmany = runReadback(DB({ sku_details: DB().sku_details.concat(many) }));
eq(Rmany.census.sku_details.distinct_category_count, 43,
  'C10b forty-three categories are all reported, with no code change');

// ===================================================================================================
section('SECTION D  §5 SITE ELIGIBILITY, THROUGH THE SHIPPED BUILDER');
// ===================================================================================================

function siteOf(rep, company, country, marketplace) {
  var hit = null;
  rep.sites.forEach(function (s) {
    if (s.site.company === company && s.site.country === country
      && s.site.marketplace === marketplace) hit = s;
  });
  return hit;
}
var US = siteOf(R, 'KM', 'US', 'Amazon');
ok(US !== null && US.ok === true, 'D0  the KM/US/Amazon site was classified');

// D1 — the six classes are ALL present, including the zeroes.
eq(Object.keys(US.classes).sort(),
  ['DATA_QUALITY_ONLY', 'ELIGIBLE_AND_CHARTABLE', 'ELIGIBLE_PRICE_MISSING',
    'ELIGIBLE_REGIONAL_MISSING', 'EXCLUDED_BY_STATUS', 'ORPHAN_OR_INVALID_IDENTITY'],
  'D1  all six classes are reported, a zero class included');

// D2 — the actual classification of the fixture site.
//   MS1 SP-01 active, regional R1, price P1  -> chartable
//   MS2 SP-02 active, regional R2, price P2  -> chartable
//   MS4 CO-02 active, NO regional, price P4  -> regional missing
//   MS3 CO-01 INACTIVE                        -> excluded by status (never becomes a row)
eq(US.classes.ELIGIBLE_AND_CHARTABLE, 2, 'D2  two site SKUs are chartable');
eq(US.classes.ELIGIBLE_REGIONAL_MISSING, 1, 'D2a one is eligible with no Regional Detail');
eq(US.classes.EXCLUDED_BY_STATUS, 1, 'D2b one is excluded by status');
eq(US.eligible_sku_count, 3, 'D2c so the site universe is three, not four');
eq(US.analysable_sku_count, 2, 'D2d and only two may be plotted');

// D3 — the missing-Regional row is OFF the chart and IN Data Quality.
eq(US.regional_missing, 1, 'D3  the missing Regional Detail is counted');
ok(US.analysable_sku_count < US.eligible_sku_count,
  'D3a and eligibility is not chartability');

// D4 — the site's own menu, from the builder.
// 'Can Opener' IS NOT OFFERED, and that is the assertion. CO-01 is the only SKU carrying it on this
// site and it is inactive, so it never survives the status gate — a menu that still offered the value
// would lead to an empty chart. 'can opener' (the case variant, on the active CO-02) IS offered, and
// the two remain separate because nothing merges them.
eq(US.category_options.map(function (o) { return o.value; }).sort(), ['Spatula', 'can opener'],
  'D4  the category menu is this site\'s SURVIVING rows — the inactive SKU\'s category is not offered');
ok(US.category_options.every(function (o) { return o.siteSkuCount > 0; }),
  'D4a and every option leads to at least one row', US.category_options);
ok(US.category_options.some(function (o) {
  return o.value === 'can opener' && o.analysableSiteSkuCount === 0; }),
  'D4b while an option whose only SKU is unplottable says so in its own count',
  US.category_options);

// D5 — a master SKU is NOT on every site. SP-01 is on US and CA; CO-02 only on US.
var CA = siteOf(R, 'KM', 'CA', 'Amazon');
eq(CA.eligible_sku_count, 1, 'D5  the CA site has one SKU, not the whole catalogue');
eq(CA.category_options.map(function (o) { return o.value; }), ['Spatula'],
  'D5a and its menu is only what it sells');

// D6 — the other COMPANY on the same marketplace name is a different site.
var JP = siteOf(R, 'KMJ', 'JP', 'Amazon');
eq(JP.eligible_sku_count, 1, 'D6  KMJ/JP/Amazon is its own universe');
eq(JP.currency_facets, ['JPY'], 'D6a in its own currency');
eq(US.currency_facets, ['USD'], 'D6b while the US site is USD');

// D7 — NO SCOPE LEAK. Every returned row says the site it was asked about.
R.sites.forEach(function (s, i) {
  if (!s.ok) return;
  eq(s.scope_leak_total, 0,
    'D7.' + (i + 1) + ' no row returned for ' + s.site.country + ' belongs to another site',
    s.scope_leak_rows);
});

// D8 — CROSS-CURRENCY ISOLATION. Every site is single-currency and no total crosses one.
R.sites.forEach(function (s, i) {
  if (!s.ok) return;
  eq(s.single_currency, true, 'D8.' + (i + 1) + ' ' + s.site.country + ' is a single currency');
});
eq(R.census.pricing_list.cross_currency_site_total, 0,
  'D8a and no site has pricing rows in two currencies');

// D9 — the seven proofs are all present and none FAILED.
var byId = {};
R.proofs.forEach(function (p) { byId[p.id] = p; });
eq(Object.keys(byId).sort(), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'],
  'D9  all seven §5 proofs are answered');
eq(R.proofs.filter(function (p) { return p.verdict === 'FAIL'; }), [],
  'D9a and not one of them FAILED');
eq(byId.P1.verdict, 'PASS', 'D9b USD does not leak a non-US SKU into US');
ok(byId.P1.evidence.usd_priced_rows_in_other_countries > 0,
  'D9c and the proof had a population at risk, so PASS means something', byId.P1.evidence);
eq(byId.P2.verdict, 'PASS', 'D9d a master SKU does not imply every site');
eq(byId.P6.evidence.fx_conversion, false, 'D9e no FX conversion is performed');

// D10 — NOT_PROVABLE IS A REAL ANSWER. Remove the USD-elsewhere population and P1 must say so.
var Rone = runReadback(DB({
  marketplace_skus: DB().marketplace_skus.filter(function (r) { return r.country !== 'CA'; })
    .map(function (r) { return r.country === 'JP' ? r : r; })
}));
var p1one = null;
Rone.proofs.forEach(function (p) { if (p.id === 'P1') p1one = p; });
eq(p1one.verdict, 'NOT_PROVABLE',
  'D10  with no USD row outside the US, P1 reports NOT_PROVABLE rather than PASS');
ok(/nothing that could have leaked/.test(p1one.evidence.not_provable_reason),
  'D10a and says why the evidence is absent');
ok((Rone.evidence_gaps || []).some(function (g) { return g.code === 'PROOF_NOT_PROVABLE'; }),
  'D10b which is recorded as an evidence gap');

// ===================================================================================================
section('SECTION E  §6 THE SIX ADAPTER SHAPE GAPS');
// ===================================================================================================

function liveRow(over) {
  var r = { marketplace_sku_id: 'MS1', identity: 'MSKU:MS1', master_sku: 'SP-01', site_sku: 'B001',
    product_name: 'Silicone Spatula', category: 'Spatula', series: 'Pro', variant_name: null,
    company: 'KM', country: 'US', marketplace: 'Amazon', marketplace_sku_status: 'active',
    lifecycle: 'Running in the Market', currency: 'USD', regular_price: 12.99, minimum_price: 9.99,
    msrp: 15.99, product_image: 'https://img/sp01.jpg', regional: { regional_detail_id: 'R1' },
    campaigns: [], analysable: true, source_status: [], missing_reasons: [], findings: [],
    provenance: { currency_authority: 'pricing_list.currency' } };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
function envOf(rows, over) {
  var d = { sourceState: 'READY', scope: { company: 'KM', country: 'US', marketplace: 'Amazon' },
    normalizedRows: rows, refusals: [], findings: [], counts: { siteSkuCount: rows.length },
    pagination: { total: rows.length, nextCursor: null },
    filterOptions: { categories: [{ value: 'Spatula', count: rows.length }], series: [] },
    schema: { contract_version: 2, read_at: 1700000000000 }, analysis_permitted: true };
  Object.keys(over || {}).forEach(function (k) { d[k] = over[k]; });
  return { success: true, data: d, meta: {}, errors: [] };
}
var ASOF = '2026-09-11';

// --- gap 1: source_status ---------------------------------------------------------------------
var g1 = ADAPTER.adaptRow(liveRow({ source_status: ['REGIONAL_DETAILS_MISSING', 'IMAGE_SOURCE_MISSING'] }), ASOF);
eq(g1.source_status, 'active', 'E1  source_status carries the site STATUS after adapting');
eq(g1.source_status_codes, ['REGIONAL_DETAILS_MISSING', 'IMAGE_SOURCE_MISSING'],
  'E1a and the live diagnostic array keeps its own name');
eq(g1.marketplace_sku_status, 'active', 'E1b the live field is still there too');
ok(Object.prototype.toString.call(g1.source_status) === '[object String]',
  'E1c so nothing downstream sees an array where a string belongs');

// THE COLLISION IS REAL — the un-adapted shape would break every row. This is the assertion that says
// the adapter is necessary rather than tidy.
var selCtx = vm.createContext({ console: console });
vm.runInContext(read('assets/js/product-strategy/psb-selectors.js'), selCtx);
var S = selCtx.PSB_SELECTORS;
eq(S.statusStateOf(liveRow({ source_status: ['X'] }), S.PERMITTED_STATUSES),
  'SITE_STATUS_SHAPE_UNEXPECTED',
  'E1d the RAW live row is refused by name — the collision is not hypothetical');
eq(S.statusStateOf(g1, S.PERMITTED_STATUSES), 'PERMITTED',
  'E1e and the adapted row is accepted');

// --- gap 2: promotion ------------------------------------------------------------------------
var camps = [
  { campaign_id: 'C1', campaign_name: 'Autumn', status: 'active', start_date: '2026-09-01',
    end_date: '2026-09-30', promo_price: 9.99, discount_percent: 23 },
  { campaign_id: 'C2', campaign_name: 'Summer', status: 'ended', start_date: '2026-07-01',
    end_date: '2026-07-31', promo_price: 8.99 }
];
var g2 = ADAPTER.adaptRow(liveRow({ campaigns: camps }), ASOF);
eq(g2.official_deal_price, 9.99, 'E2  the effective campaign becomes official_deal_price');
eq([g2.official_deal_start, g2.official_deal_end], ['2026-09-01', '2026-09-30'],
  'E2a and the dates survive');
eq(g2.provenance.promotion_rejected.map(function (r) { return r.reason; }), ['CAMPAIGN_NOT_LIVE'],
  'E2b while the ended one is kept as evidence with its reason');
ok(g2.campaigns.length === 2, 'E2c and the raw campaigns array is not discarded');

// A campaign outside the window is not effective, and the row shows no deal.
var g2b = ADAPTER.adaptRow(liveRow({ campaigns: camps }), '2026-10-05');
eq(g2b.official_deal_price, null, 'E2d after the end date there is no deal');
eq(g2b.provenance.promotion_rejected.map(function (r) { return r.reason; }).sort(),
  ['CAMPAIGN_HAS_ENDED', 'CAMPAIGN_NOT_LIVE'], 'E2e and the reason is the date, named');

// TWO effective campaigns is ambiguity and NOTHING is picked.
var g2c = ADAPTER.adaptRow(liveRow({ campaigns: [camps[0],
  { campaign_id: 'C3', status: 'active', start_date: '2026-09-05', end_date: '2026-09-20',
    promo_price: 8.49 }] }), ASOF);
eq(g2c.official_deal_price, null, 'E2f two effective campaigns pick NEITHER');
ok(g2c.data_quality.indexOf('AMBIGUOUS_EFFECTIVE_PROMOTION') !== -1,
  'E2g and the ambiguity is reported');
eq(g2c.provenance.promotion_candidates.length, 2, 'E2h with both candidates kept');

// A non-ISO date is reported, never coerced — the selectors compare these as strings.
var g2d = ADAPTER.adaptRow(liveRow({ campaigns: [{ campaign_id: 'C4', status: 'active',
  start_date: '1/3/2026', end_date: '31/3/2026', promo_price: 7.0 }] }), ASOF);
eq(g2d.official_deal_price, null, 'E2i a non-ISO campaign period yields no deal');
eq(g2d.provenance.promotion_rejected[0].reason, 'CAMPAIGN_PERIOD_NOT_AN_ISO_DAY',
  'E2j and says exactly that, rather than comparing "1/3/2026" as a date');

// NO asOf MEANS NO "CURRENTLY". A clock in a pure function is refused.
var g2e = ADAPTER.adaptRow(liveRow({ campaigns: camps }), null);
eq(g2e.official_deal_price, null, 'E2k without an asOf date nothing is declared effective');
eq(g2e.provenance.promotion_rejected[0].reason, 'NO_AS_OF_DATE_SUPPLIED', 'E2l and it says why');

// --- gap 3 + 4: variant grouping and the variant name ----------------------------------------
eq(g1.variant_group, 'Pro', 'E3  variant_group comes from series');
eq(g1.provenance.variant_group_source, 'sku_details.series', 'E3a and the source is named');
ok(bare(SRCAD).indexOf('variant_group') !== -1, 'E3b the adapter is the only place that maps it');
var g4 = ADAPTER.adaptRow(liveRow({ variant_name: null }), ASOF);
eq(g4.variant_name, null, 'E4  variant_name stays null — no colour is invented');
ok(g4.data_quality.indexOf('VARIANT_NAME_SOURCE_MISSING') !== -1,
  'E4a and the absence is Data Quality, not a blank filled in');
var g4b = ADAPTER.adaptRow(liveRow({ series: '' }), ASOF);
eq(g4b.variant_group, null, 'E4b a blank series means no grouping');
ok(g4b.data_quality.indexOf('VARIANT_GROUPING_SOURCE_MISSING') !== -1, 'E4c reported as such');
// THE REAL SELECTOR, not a fallback expression that answers 'SP-01' whether or not the function is
// there. `labelOf` is the label and `groupNodes` is the grouping, and an ungrouped row must become its
// OWN node — otherwise every series-less product on the site merges into one marker.
eq(S.labelOf(g4b), 'SP-01',
  'E4d the selectors label an ungrouped row with its master SKU');
var twoUngrouped = [ADAPTER.adaptRow(liveRow({ series: '', marketplace_sku_id: 'MSa',
  identity: 'MSKU:MSa' }), ASOF),
  ADAPTER.adaptRow(liveRow({ series: '', marketplace_sku_id: 'MSb', identity: 'MSKU:MSb',
    master_sku: 'SP-02' }), ASOF)];
twoUngrouped.forEach(function (r) { r._regular_c = 1299; r._min_c = 999; r._msrp_c = 1599; r._deal_c = null; });
eq(S.groupNodes(twoUngrouped).length, 2,
  'E4e and two series-less products stay TWO nodes rather than merging into one');

// --- gap 5: image evidence -------------------------------------------------------------------
/* P1-B8C-R3 — THE FIXTURE'S HOST IS DECLARED, AND E5a NOW USES A REFERENCE THAT IS ACTUALLY REFUSED.
   This section's rows carry `https://img/...`, and the shared policy ships with an EMPTY external
   allowlist, so `img` has to be declared or E5 would fail for a reason that has nothing to do with
   image evidence. And `sp02.jpg` is no longer the example of an unverifiable reference: P1-B8C-R2
   measured that production's `sku_details.image_url` IS a relative path, which SKU Details renders,
   so calling it unverified was the defect R3 fixed. The state still has to be reachable, so E5a now
   uses what genuinely cannot be drawn — an opaque id with no filename in it. */
eq(g1.image_identity_status, 'VERIFIED_DB_MAPPING', 'E5  an absolute URL on the SKU\'s own row is verified');
eq(ADAPTER.adaptRow(liveRow({ product_image: 'sp02.jpg' }), ASOF).image_identity_status,
  'VERIFIED_DB_MAPPING', 'E5a0 a same-origin asset path IS verified — R3, and what production holds');
eq(ADAPTER.adaptRow(liveRow({ product_image: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456' }),
  ASOF).image_identity_status,
  'UNVERIFIED_SOURCE_REFERENCE', 'E5a an opaque id is UNVERIFIED, not verified');
eq(ADAPTER.adaptRow(liveRow({ product_image: 'https://unapproved.example.com/x.jpg' }),
  ASOF).image_identity_status,
  'UNVERIFIED_SOURCE_REFERENCE', 'E5a1 and an absolute url on an undeclared host is too');
eq(ADAPTER.adaptRow(liveRow({ product_image: '' }), ASOF).image_identity_status,
  'IMAGE_SOURCE_MISSING', 'E5b and nothing at all is MISSING — three states, not two');
eq(ADAPTER.adaptRow(liveRow({ product_image: 'https://img/x.jpg',
  missing_reasons: ['MASTER_SKU_RECORD_MISSING'] }), ASOF).image_identity_status,
  'UNVERIFIED_SOURCE_REFERENCE',
  'E5c with no master row there is no row the URL came from, so the mapping is not established');
// THE RENDER RULE, asserted against the selectors' own expression rather than restated here.
ok(/image_identity_status === 'VERIFIED_DB_MAPPING'/.test(read(
  'assets/js/product-strategy/psb-selectors.js')),
  'E5d the selectors render an image ONLY on the verified state');

// --- gap 6: identity -------------------------------------------------------------------------
eq(g1.identity, 'MSKU:MS1', 'E6  identity is MSKU:<marketplace_sku_id>');
eq(ADAPTER.adaptRow(liveRow({ identity: '', marketplace_sku_id: 'MS9' }), ASOF).identity, 'MSKU:MS9',
  'E6a and is composed from the id when the server omitted it');
ok(!/MSK-/.test(bare(SRCAD)), 'E6b the fixture identity form appears nowhere in the adapter');
var g6 = ADAPTER.adaptRow(liveRow({ identity: '', marketplace_sku_id: '' }), ASOF);
eq(g6.identity, '', 'E6c a row with no id gets no invented identity');
ok(g6.data_quality.indexOf('SITE_SKU_WITHOUT_IDENTITY') !== -1, 'E6d and is reported');

// --- ONE adapter, not one per page -----------------------------------------------------------
var jsDir = path.join(__dirname, '..', 'js', 'api');
var apiFiles = fs.readdirSync(jsDir).filter(function (f) { return /\.js$/.test(f); });
var mappers = apiFiles.filter(function (f) {
  var b = bare(fs.readFileSync(path.join(jsDir, f), 'utf8'));
  return /official_deal_price/.test(b) && f !== 'km-product-pricing-adapter.js';
});
eq(mappers, [], 'E7  no other file in assets/js/api maps the promotion fields', mappers);
eq(ADAPTER.CONTRACT.one_adapter_per_system, true, 'E7a and the contract says one adapter');
eq(ADAPTER.CONTRACT.per_page_conversion_permitted, false, 'E7b per-page conversion is refused');

// --- PURE: no clock, no storage, no transport -------------------------------------------------
var badAdapter = bare(SRCAD);
['Date.now', 'new Date', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest',
  'google.script.run', 'document.'].forEach(function (t, i) {
  ok(badAdapter.indexOf(t) === -1, 'E8.' + (i + 1) + ' the adapter never uses ' + t);
});
eq(ADAPTER.CONTRACT.reads_the_clock, false, 'E8a and the contract declares it');
// DETERMINISM, twice over.
var d1 = JSON.stringify(ADAPTER.adapt(envOf([liveRow({ campaigns: camps })]), { asOf: ASOF }));
var d2 = JSON.stringify(ADAPTER.adapt(envOf([liveRow({ campaigns: camps })]), { asOf: ASOF }));
ok(d1 === d2, 'E8b the same response and the same date give byte-identical rows');

// --- NO FIXTURE FALLBACK ----------------------------------------------------------------------
['preview', 'fixture', 'PreviewProductStrategy', 'demo'].forEach(function (t, i) {
  var b = badAdapter.toLowerCase();
  ok(b.indexOf(t.toLowerCase()) === -1 || /fixture_fallback/.test(badAdapter),
    'E9.' + (i + 1) + ' the adapter has no ' + t + ' path');
});
eq(ADAPTER.CONTRACT.fixture_fallback, false, 'E9a and declares no fixture fallback');
eq(ADAPTER.adapt(envOf([liveRow()]), { asOf: ASOF }).provenance.fixture_fallback, false,
  'E9b which every adapted response repeats');
// An empty answer produces ZERO rows, never a demo row.
eq(ADAPTER.adapt(envOf([], { sourceState: 'SOURCE_EMPTY', counts: { siteSkuCount: 0 } }),
  { asOf: ASOF }).rows.length, 0, 'E9c an empty scope adapts to zero rows');

// ===================================================================================================
section('SECTION F  §7 CATEGORY AND ALIAS — PROPOSED, NEVER APPLIED');
// ===================================================================================================
eq(SD.category_alias_candidates,
  [{ normalized: 'can opener', spellings: ['Can Opener', 'can opener'], merged: false }],
  'F1  a case-only difference is reported as a CANDIDATE');
eq(SD.alias_table_changed, false, 'F1a and nothing was merged');
ok(SD.distinct_raw_category.indexOf('Can Opener') !== -1
  && SD.distinct_raw_category.indexOf('can opener') !== -1,
  'F1b both spellings remain distinct options');
ok((R.evidence_gaps || []).some(function (g) { return g.code === 'CATEGORY_ALIAS_APPROVAL_REQUIRED'; }),
  'F2  the approval is recorded as an evidence gap an operator owns');
// §7.5 — blank becomes a review bucket, never a silent category.
ok(/Unmapped \/ Needs Review/.test(SRCRB) || SD.blank_category_rows === 1,
  'F3  blank categories are counted rather than renamed');
eq(SD.blank_category_rows, 1, 'F3a exactly one row has no category');
ok(!/'Other'/.test(bare(SRC72)) || /renamed_to_other: false/.test(SRC72),
  'F3b and 72_ declares it does not invent an "Other" bucket');
// §7.2 — the read does NOT merge on case.
var lowered = ADAPTER.adapt(envOf([liveRow({ category: 'spatula' }), liveRow({ category: 'Spatula' })]),
  { asOf: ASOF });
eq(lowered.rows.map(function (r) { return r.category; }), ['spatula', 'Spatula'],
  'F4  the adapter does not case-fold a category either');

// ===================================================================================================
section('SECTION G  §8 THE CONTRACT, AND THE FIVE STATES');
// ===================================================================================================

// G1 — the five states exist as a named set, and only four are servable.
var L72 = vm.createContext({ console: console });
vm.runInContext(SRC72, L72);
eq(L72.PPW_SOURCE_STATES_,
  ['READY', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY', 'SOURCE_NOT_CONNECTED'],
  'G1  the five states §8 requires');
eq(L72.PPW_SERVER_SOURCE_STATES_,
  ['READY', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY'],
  'G1a and the four a server may send');
eq(L72.PPW_CLIENT_ONLY_SOURCE_STATE_, 'SOURCE_NOT_CONNECTED',
  'G1b SOURCE_NOT_CONNECTED is the accessor\'s alone');
eq(ADAPTER.SOURCE_STATES, L72.PPW_SOURCE_STATES_,
  'G1c and the adapter holds the identical list');

// G2 — the derivation is PURE and its precedence is severity.
var st = L72.ppwSourceState_;
eq(st({ integrityStops: ['AMBIGUOUS_SITE_IDENTITY'], refusalCodes: ['CAPPED_RESULT'], inScopeRows: 0 }),
  'STOP_DATA_INTEGRITY', 'G2  integrity outranks everything');
eq(st({ integrityStops: [], refusalCodes: ['CAPPED_RESULT'], inScopeRows: 0 }),
  'SOURCE_PARTIALLY_READABLE',
  'G2a a capped source outranks empty — a read that saw part of a table cannot call a scope empty');
eq(st({ integrityStops: [], refusalCodes: [], inScopeRows: 0 }), 'SOURCE_EMPTY',
  'G2b zero rows from a complete read IS a measurement');
eq(st({ integrityStops: [], refusalCodes: [], inScopeRows: 3 }), 'READY', 'G2c and rows are READY');
eq(st({}), 'SOURCE_EMPTY', 'G2d an absent count is not READY');

// G3 — SOURCE_EMPTY AND SOURCE_NOT_CONNECTED ARE NOT THE SAME ANSWER. §10's headline case.
var Eempty = ADAPTER.adapt(envOf([], { sourceState: 'SOURCE_EMPTY', counts: { siteSkuCount: 0 } }),
  { asOf: ASOF });
eq(Eempty.sourceState, 'SOURCE_EMPTY', 'G3  a real empty scope reports SOURCE_EMPTY');
eq(Eempty.rows.length, 0, 'G3a with zero rows');
var Enone = ADAPTER.adapt({ success: false, errors: [{ code: 'SOURCE_NOT_CONNECTED' }] }, { asOf: ASOF });
eq(Enone.sourceState, 'SOURCE_NOT_CONNECTED', 'G3b a failed read reports SOURCE_NOT_CONNECTED');
ok(Eempty.sourceState !== Enone.sourceState,
  'G3c and the two are DIFFERENT states — an operator can tell "nothing here" from "no answer"');
eq(ADAPTER.adapt(null, {}).sourceState, 'SOURCE_NOT_CONNECTED',
  'G3d as is a non-object answer');

// G4 — a server that sends the client-only state is a contract breach, reported not believed.
var Ebad = ADAPTER.adapt(envOf([], { sourceState: 'SOURCE_NOT_CONNECTED' }), { asOf: ASOF });
ok(Ebad.dataQuality.some(function (q) { return q.code === 'SERVER_SENT_A_CLIENT_ONLY_STATE'; }),
  'G4  a server answer claiming SOURCE_NOT_CONNECTED is reported as a breach');

// G5 — a refusal MEASURES no state, so it reports null rather than pretending.
var L = vm.createContext({ console: console });
vm.runInContext(SRC72, L);
var refused = vm.runInContext('ppwRefusedData_(ppwValidateRequest_({}), [])', L);
eq(refused.sourceState, null, 'G5  a refused request reports sourceState null');
eq(refused.counts.siteSkuCount, null, 'G5a for exactly the reason the counts are null');
eq(refused.filterOptions, null, 'G5b and the menus are withheld, not emptied');
eq(ADAPTER.adapt(envOf([], { sourceState: null, refusals: [{ code: 'SCOPE_INCOMPLETE' }] }),
  { asOf: ASOF }).sourceState, null, 'G5c which the adapter passes through unchanged');

// G6 — the schema block: read_at, the contract version, per-table fingerprints.
var built = vm.runInContext('ppwWorkspaceBuild_(' + JSON.stringify({
  marketplace_skus: DB().marketplace_skus, sku_details: DB().sku_details,
  sku_regional_details: DB().sku_regional_details, pricing_list: DB().pricing_list,
  campaigns: DB().campaigns, campaign_sku_lines: DB().campaign_sku_lines
}) + ', ppwValidateRequest_(' + JSON.stringify({
  scope: { company: 'KM', country: 'US', marketplace: 'Amazon' },
  include: { regional: true, pricing: true, campaigns: true }
}) + '), 1700000000000)', L);
eq(built.sourceState, 'READY', 'G6  the build reports READY for a populated scope');
eq(built.schema.read_at, 1700000000000, 'G6a and carries the read timestamp it was given');
ok(/server clock/.test(built.schema.read_at_is), 'G6b saying what the timestamp IS');
eq(built.schema.source_modified_at, null, 'G6c source_modified_at is null');
// AIMED AT THE REASON, NOT AT THE IDENTIFIER. The API name deliberately lives in a comment rather than
// in this string: the document-engine audit scans every .gs for DriveApp with comments stripped, so
// naming it here to say 72_ does not use it made that audit report 72_ as a second file renderer.
ok(/no last-modified time/.test(built.schema.source_modified_at_unavailable_because)
  && /scope/.test(built.schema.source_modified_at_unavailable_because),
  'G6d and says exactly why it cannot be measured, rather than reporting a freshness nobody took',
  built.schema.source_modified_at_unavailable_because);
ok(!/DriveApp/.test(built.schema.source_modified_at_unavailable_because),
  'G6d2 without naming the API in a string, which is how a guard reads an absence as a presence');
eq(built.schema.contract_version, 2, 'G6e the response-shape contract version');
eq(Object.keys(built.schema.tables).sort(),
  ['campaign_sku_lines', 'campaigns', 'marketplace_skus', 'pricing_list', 'sku_details',
    'sku_regional_details'],
  'G6f with a fingerprint per table that was read');
ok(/^[0-9A-F]{8}$/.test(built.schema.tables.sku_details.fingerprint),
  'G6g each one a fingerprint of the HEADER NAMES', built.schema.tables.sku_details);
eq(built.schema.tables.sku_details.headers.indexOf('image_url') !== -1, true,
  'G6g2 which are NAMES, so a reader can see what the read actually saw');

// G6h — THE FINGERPRINT IS ORDER-INDEPENDENT, and changes when a column does.
var fp = L.ppwSchemaFingerprint_;
eq(fp([{ a: 1, b: 2 }]).fingerprint, fp([{ b: 2, a: 1 }]).fingerprint,
  'G6h dragging a column sideways does not change the fingerprint');
ok(fp([{ a: 1, b: 2 }]).fingerprint !== fp([{ a: 1, c: 2 }]).fingerprint,
  'G6i renaming one does');
eq(fp([]).fingerprint, 'EMPTY', 'G6j and an empty table says EMPTY rather than hashing nothing');

// G7 — THE BUILDER IS STILL PURE. `readAt` is an argument, so the same inputs give the same answer.
var pureSrc = bare(SRC72);
var buildFn = pureSrc.slice(pureSrc.indexOf('function ppwWorkspaceBuild_'));
buildFn = buildFn.slice(0, buildFn.indexOf('\nfunction '));
['Date.now', 'new Date', 'Math.random', 'SpreadsheetApp', 'Utilities.', 'Session.'].forEach(function (t, i) {
  ok(buildFn.indexOf(t) === -1, 'G7.' + (i + 1) + ' the builder never uses ' + t);
});
var twice = [];
for (var gi = 0; gi < 3; gi++) {
  twice.push(JSON.stringify(vm.runInContext('ppwWorkspaceBuild_(' + JSON.stringify({
    marketplace_skus: DB().marketplace_skus, sku_details: DB().sku_details,
    sku_regional_details: DB().sku_regional_details, pricing_list: DB().pricing_list
  }) + ', ppwValidateRequest_(' + JSON.stringify({
    scope: { company: 'KM', country: 'US', marketplace: 'Amazon' }
  }) + '), 1700000000000)', L)));
}
ok(twice[0] === twice[1] && twice[1] === twice[2],
  'G7a and three runs with the same arguments are byte-identical');

// G8 — STOP_DATA_INTEGRITY comes from the MEMBERSHIP level, not from a row-level code of the same name.
var dupDb = DB();
dupDb.marketplace_skus = dupDb.marketplace_skus.concat([
  { marketplace_sku_id: 'MS1', sku: 'CO-01', company: 'KM', country: 'US', marketplace: 'Amazon',
    site_sku: 'BDUP', marketplace_sku_status: 'active', currency: 'USD' }]);
var dupBuilt = vm.runInContext('ppwWorkspaceBuild_(' + JSON.stringify({
  marketplace_skus: dupDb.marketplace_skus, sku_details: dupDb.sku_details,
  sku_regional_details: dupDb.sku_regional_details, pricing_list: dupDb.pricing_list
}) + ', ppwValidateRequest_(' + JSON.stringify({
  scope: { company: 'KM', country: 'US', marketplace: 'Amazon' }
}) + '), 1)', L);
eq(dupBuilt.sourceState, 'STOP_DATA_INTEGRITY',
  'G8  two rows claiming one marketplace_sku_id is a STOP, not a row-level note');
eq(dupBuilt.schema.integrity_stops, ['AMBIGUOUS_SITE_IDENTITY'], 'G8a and the code is named');
// ONE CODE, NOT TWO. `SITE_SKU_WITHOUT_IDENTITY` was in this set for one round and made a healthy site
// report STOP_DATA_INTEGRITY over a single unjoinable row: a blank id is DROPPED, COUNTED and named, so
// every row that remains is correct and the universe is short by an amount the answer reports. A
// duplicate id is different in kind — the joins may attach to the wrong product and nothing says which.
// MIS-ATTRIBUTION IS A STOP; A COUNTED OMISSION IS NOT.
eq(L.PPW_INTEGRITY_STOP_CODES_, ['AMBIGUOUS_SITE_IDENTITY'],
  'G8b the stop set is the one membership-level code that MIS-ATTRIBUTES');
eq(built.sourceState, 'READY',
  'G8b2 so a site with one identity-less row is READY, not stopped');
ok((built.findings || []).some(function (f) { return f.code === 'SITE_SKU_WITHOUT_IDENTITY'; }),
  'G8b3 while the omission is still reported as a top-level finding');
eq(built.membership.in_scope_before_status_filter, 4,
  'G8b4 and the row that could not be joined is still visible in the membership counts');
// THE SAME CODE AT ROW LEVEL IS **NOT** A STOP — the level is the severity, not the name.
var ambigRegional = DB();
ambigRegional.sku_regional_details = ambigRegional.sku_regional_details.concat([
  { regional_detail_id: 'R1b', sku: 'SP-01', company: 'KM', country: 'US', marketplace: 'Amazon',
    site_sku: 'B001', status: 'complete' }]);
var arBuilt = vm.runInContext('ppwWorkspaceBuild_(' + JSON.stringify({
  marketplace_skus: ambigRegional.marketplace_skus, sku_details: ambigRegional.sku_details,
  sku_regional_details: ambigRegional.sku_regional_details, pricing_list: ambigRegional.pricing_list
}) + ', ppwValidateRequest_(' + JSON.stringify({
  scope: { company: 'KM', country: 'US', marketplace: 'Amazon' }
}) + '), 1)', L);
eq(arBuilt.sourceState, 'READY',
  'G8c an ambiguous REGIONAL match on one row leaves the read READY — one row is not the universe');
ok(arBuilt.normalizedRows.some(function (r) {
  return (r.source_status || []).indexOf('AMBIGUOUS_SITE_IDENTITY') !== -1; }),
  'G8d while that row still carries the code and is not analysable');
ok(arBuilt.normalizedRows.every(function (r) {
  return (r.source_status || []).indexOf('AMBIGUOUS_SITE_IDENTITY') === -1 || r.analysable === false; }),
  'G8e — so the same code means "this row" in one place and "this read" in the other, by LEVEL');

// G9 — the frozen request/response surface, field by field.
['scope', 'filtersApplied', 'normalizedRows', 'filterOptions', 'sources', 'counts', 'capped',
  'pagination', 'findings', 'refusals', 'analysis_permitted', 'membership', 'provenance', 'schema',
  'sourceState'].forEach(function (k, i) {
  ok(Object.prototype.hasOwnProperty.call(built, k), 'G9.' + (i + 1) + ' response carries ' + k);
});
eq(Object.prototype.hasOwnProperty.call(refused, 'schema'), true,
  'G9a and a refusal carries the same keys, so a caller has one shape');
eq(Object.keys(built).sort(), Object.keys(refused).sort(),
  'G9b the success and refusal shapes are identical key sets');
// PAGINATION / CHUNKING
eq(built.pagination.sort, 'marketplace_sku_id ascending', 'G9c pagination declares its order');
ok(Object.prototype.hasOwnProperty.call(built.pagination, 'nextCursor'), 'G9d and its cursor');
eq(built.provenance.preview_fallback, false, 'G9e production declares no preview fallback');
eq(built.provenance.fx_conversion, false, 'G9f and no FX conversion');

// G10 — the accessor still owns SOURCE_NOT_CONNECTED and has no fixture path.
ok(/SOURCE_NOT_CONNECTED/.test(SRCACC), 'G10  the accessor emits SOURCE_NOT_CONNECTED');
// AIMED AT IDENTIFIERS, NOT AT THE WORD. The accessor's only occurrences of "preview" are
// `preview_fallback: false` and `previewFallback: false` — two DECLARATIONS that there is no such path,
// which a scan for the word reads as evidence of the thing it denies.
['PreviewProductStrategy', 'previewFixture', 'PREVIEW_FIXTURE', 'loadPreview', 'FIXTURE_ROWS']
  .forEach(function (n, i) {
    ok(bare(SRCACC).indexOf(n) === -1, 'G10a.' + (i + 1) + ' the accessor has no ' + n);
  });
ok(/preview_fallback: false/.test(SRCACC), 'G10b and declares preview_fallback false');

// ===================================================================================================
section('SECTION H  §10 THE SELECTORS DIGEST THE ADAPTER, AND THE SCENARIO STAYS IN MEMORY');
// ===================================================================================================
var liveSet = [
  liveRow({ marketplace_sku_id: 'MS1', identity: 'MSKU:MS1', campaigns: camps }),
  liveRow({ marketplace_sku_id: 'MS2', identity: 'MSKU:MS2', master_sku: 'SP-02',
    product_image: 'sp02.jpg', regional: null, missing_reasons: ['REGIONAL_DETAILS_MISSING'],
    source_status: ['REGIONAL_DETAILS_MISSING'], analysable: false }),
  liveRow({ marketplace_sku_id: 'MS3', identity: 'MSKU:MS3', master_sku: 'CO-01',
    category: 'Can Opener', series: 'Classic', marketplace_sku_status: 'inactive' }),
  liveRow({ marketplace_sku_id: 'MS4', identity: 'MSKU:MS4', master_sku: 'CO-02',
    regular_price: null, minimum_price: null, msrp: null, currency: null,
    missing_reasons: ['PRICING_SOURCE_MISSING'], source_status: ['PRICING_SOURCE_MISSING'],
    analysable: false })
];
var AD = ADAPTER.adapt(envOf(liveSet), { asOf: ASOF });
eq(AD.rows.length, 4, 'H1  four live rows adapt to four canonical rows');
var uni = S.getEligibleProductUniverse({ rows: AD.rows,
  site: { company: 'KM', country: 'US', marketplace: 'Amazon' } });
eq(uni.rows.length, 3, 'H2  the selectors accept them and the status gate excludes one');
eq(uni.excluded.map(function (e) { return e.reason; }), ['EXCLUDED_BY_STATUS'],
  'H2a for the right reason — NOT a shape complaint');
eq(uni.excluded.filter(function (e) { return /SHAPE/.test(String(e.reason)); }), [],
  'H2b no row is refused for its SHAPE, which is the whole point of §6.1');
// The chart gate, per row.
eq(AD.rows.map(function (r) { return S.chartRefusalsFor(r); }),
  [[], ['REGIONAL_DETAILS_MISSING'], [], ['PRICING_SOURCE_MISSING']],
  'H3  and each row\'s chart refusals are the live ones');
// The image: only the verified one renders.
var canon = AD.rows.map(function (r) {
  return (r.image_identity_status === 'VERIFIED_DB_MAPPING' && r.product_image) ? r.product_image : null;
});
eq(canon[0], 'https://img/sp01.jpg', 'H4  the verified image renders');
/* P1-B8C-R3, VISIBLE AT THE EXACT BOUNDARY THAT USED TO DROP IT. MS2 carries `sp02.jpg`, the shape
   production's `sku_details.image_url` actually holds, and this line is the selectors' own expression
   for "which image may be drawn". It used to evaluate to null while SKU Details rendered the same
   value; it now renders. THE PLATE IS STILL DRAWN FOR A ROW THAT HAS NO VERIFIED MAPPING — H4b keeps
   that state covered, because a fix that made everything drawable would pass H4a too. */
eq(canon[1], 'sp02.jpg', 'H4a and so does a same-origin asset path — the R3 correction, at the seam');
var noMap = ADAPTER.adapt(envOf([liveRow({ marketplace_sku_id: 'MSX', identity: 'MSKU:MSX',
  product_image: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456' })]), { asOf: ASOF }).rows[0];
eq((noMap.image_identity_status === 'VERIFIED_DB_MAPPING' && noMap.product_image) || null, null,
  'H4b while a reference with no verified mapping still draws the plate instead of a broken img');

// H5 — §10: the scenario overlay is still front-end memory only. No write path exists.
var protoSrc = read('assets/js/product-strategy/psb-board-ui.js');
ok(!/google\.script\.run/.test(bare(protoSrc)), 'H5  the prototype makes no server call');
ok(!/scenario.*\.save\(|saveScenario|persistScenario/.test(bare(protoSrc)),
  'H5a and no scenario is persisted anywhere');
ok(/SIMULATED_IN_MEMORY/.test(read('assets/js/product-strategy/psb-selectors.js')),
  'H5b the selectors label simulated values as in-memory');
ok(!/scenario/i.test(bare(SRC72).replace(/proposed_scenario_price/g, '')),
  'H5c and 72_ has no scenario concept at all — there is nothing to write to');
eq(built.provenance.price_status_filtering, false, 'H5d nor does it filter on price status');

// H6 — RESTATED AT P1-B7 §4/§7. "Nothing changed for a user" used to rest on the adapter being loaded
// by no page. It is loaded now, and the claim rests on the two gates instead: the section is declared
// staged with enabled false, and PRODUCT_STRATEGY_ENABLED_ is false, so the page is installed and
// cannot be opened. Absence was never the rule; it was the cheapest available proxy for it.
eq(callers, ['index.html'], 'H6  the adapter is loaded by the shell and by nothing else', callers);
ok(/'product-strategy':\s*\{[^}]*enabled:\s*false/.test(read('assets/js/app.js')),
  'H6a and the shell declares that section staged OFF, so no user can reach it');
eq(ADAPTER.CONTRACT.applies_to, 'productPricing.workspace.get responses; no page has adopted it yet',
  'H6a which the contract states in its own applies_to');

// ===================================================================================================
console.log('\n=== MUTANTS ===');
// ===================================================================================================
function swapIn(src, a, b) {
  var n = src.split(a).length - 1;
  if (n !== 1) throw new Error('anchor count ' + n + ' :: ' + a.slice(0, 70));
  return src.split(a).join(b);
}
/** Re-run the readback against a MUTATED 72_ or readback source. */
function withSrc(which, a, b) {
  var m72 = SRC72, mrb = SRCRB;
  if (which === '72') m72 = swapIn(SRC72, a, b); else mrb = swapIn(SRCRB, a, b);
  var log = [];
  var ctx = vm.createContext({ console: console });
  var db = DB(), sheets = {};
  Object.keys(db).forEach(function (n) { sheets[n] = fakeSheet(n, db[n], log); });
  var ss = { getId: function () { return DB_ID; },
    getSheetByName: function (n) { return sheets[n] || null; } };
  ctx.SpreadsheetApp = { openById: function () { return ss; } };
  ctx.Logger = { log: function () {} };
  ctx.KMSAFE = { assertExpectedSpreadsheetId: function () { return true; },
    classifySchemaMismatch: function (s) { return { valid: true, schemaStatus: 'OK' }; },
    validateMigrationAuthorization: function () { return { authorized: false }; } };
  vm.runInContext('var PRODUCTION_DB_SPREADSHEET_ID_ = ' + JSON.stringify(DB_ID) + ';', ctx);
  vm.runInContext('var PRODUCT_STRATEGY_ENABLED_ = false;'
    + ' function productStrategyEnabled_() { return PRODUCT_STRATEGY_ENABLED_ === true; }', ctx);
  vm.runInContext(SRC29, ctx);
  vm.runInContext(m72, ctx);
  vm.runInContext(mrb, ctx);
  return vm.runInContext('JSON.parse(JSON.stringify(RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()))', ctx);
}
/** A mutated adapter, loaded fresh. */
function withAdapter(a, b) {
  var src = swapIn(SRCAD, a, b);
  /* P1-B8C-R3 — THE SANDBOX HAS TO CARRY THE POLICY, OR EVERY IMAGE MUTANT SURVIVES FOR FREE.
     imageStateOf asks KM_IMAGE_REFERENCE_POLICY and FAILS CLOSED when it is absent. An empty context
     has no global and no `require`, so the unmutated AND the mutated adapter would both answer
     UNVERIFIED — the mutant would survive while proving only that this helper forgot a script tag.
     index.html loads the policy before the adapter; so does this. */
  var ctx = vm.createContext({ console: console, module: { exports: {} },
    KM_IMAGE_REFERENCE_POLICY: IMG_POLICY });
  vm.runInContext(src, ctx);
  return ctx.KM_PRODUCT_PRICING_ADAPTER;
}

mut('M1 the source state stops outranking empty with a capped source, so a half-read scope reports EMPTY',
  function () {
    // WHY THIS ORDER IS THE WHOLE POINT. A read that could not see all of a table has not established
    // that a scope is empty, and SOURCE_EMPTY is the one state an operator answers by moving on.
    var ctx = vm.createContext({ console: console });
    vm.runInContext(swapIn(SRC72,
      "  if ((spec.refusalCodes || []).length > 0) return 'SOURCE_PARTIALLY_READABLE';\n"
      + "  if (!(Number(spec.inScopeRows) > 0)) return 'SOURCE_EMPTY';",
      "  if (!(Number(spec.inScopeRows) > 0)) return 'SOURCE_EMPTY';\n"
      + "  if ((spec.refusalCodes || []).length > 0) return 'SOURCE_PARTIALLY_READABLE';"), ctx);
    var spec = { integrityStops: [], refusalCodes: ['CAPPED_RESULT'], inScopeRows: 0 };
    return L72.ppwSourceState_(spec) === 'SOURCE_PARTIALLY_READABLE'
      && ctx.ppwSourceState_(spec) === 'SOURCE_EMPTY';
  });

mut('M2 a row-level ambiguity is promoted to a whole-read STOP, so one bad join blanks the chart',
  function () {
    // The level IS the severity. Deriving the stop from the ROWS instead of the top-level findings makes
    // a single duplicated regional row stop a read that forty-three good products depend on.
    var ctx = vm.createContext({ console: console });
    vm.runInContext(swapIn(SRC72,
      '  var integrityStops = ppwIntegrityStops_(findings);',
      '  var integrityStops = ppwIntegrityStops_(findings.concat('
      + 'all.reduce(function (acc, r) { return acc.concat(r.findings || []); }, [])));'), ctx);
    function run(c) {
      return vm.runInContext('ppwWorkspaceBuild_(' + JSON.stringify({
        marketplace_skus: ambigRegional.marketplace_skus, sku_details: ambigRegional.sku_details,
        sku_regional_details: ambigRegional.sku_regional_details, pricing_list: ambigRegional.pricing_list
      }) + ', ppwValidateRequest_(' + JSON.stringify({
        scope: { company: 'KM', country: 'US', marketplace: 'Amazon' }
      }) + '), 1).sourceState', c);
    }
    return run(L) === 'READY' && run(ctx) === 'STOP_DATA_INTEGRITY';
  });

mut('M3 the schema fingerprint becomes order-dependent, so dragging a column cries wolf', function () {
  var ctx = vm.createContext({ console: console });
  vm.runInContext(swapIn(SRC72, '  headers.sort();\n  return { columns: headers.length,',
    '  return { columns: headers.length,'), ctx);
  var a = [{ a: 1, b: 2 }], b = [{ b: 2, a: 1 }];
  return L.ppwSchemaFingerprint_(a).fingerprint === L.ppwSchemaFingerprint_(b).fingerprint
    && ctx.ppwSchemaFingerprint_(a).fingerprint !== ctx.ppwSchemaFingerprint_(b).fingerprint;
});

mut('M4 the builder reads the clock instead of taking it, and stops being pure', function () {
  var ctx = vm.createContext({ console: console });
  vm.runInContext(swapIn(SRC72,
    "      read_at: (readAt === undefined || readAt === null) ? null : readAt,",
    "      read_at: Date.now(),"), ctx);
  function once(c) {
    return vm.runInContext('ppwWorkspaceBuild_(' + JSON.stringify({
      marketplace_skus: DB().marketplace_skus, sku_details: DB().sku_details
    }) + ', ppwValidateRequest_(' + JSON.stringify({
      scope: { company: 'KM', country: 'US', marketplace: 'Amazon' },
      include: { regional: false, pricing: false }
    }) + '), 1700000000000).schema.read_at', c);
  }
  // Clean: the argument, every time. Mutant: a clock, so it is not the number it was handed.
  return once(L) === 1700000000000 && once(ctx) !== 1700000000000;
});

mut('M5 the readback injects a flag so it can read through the gate', function () {
  // THE DEFENCE IS THE ABSENCE OF AN INJECTION. A readback that flips the flag proves nothing about the
  // deployed gate, and leaves a bypass in the project for good.
  var r = withSrc('rb',
    "    var gate = handleProductPricingWorkspaceGet_({\n"
    + "      requestId: 'REQ-READBACK-GATE',\n"
    + "      payload: { scope: { company: 'KM', country: 'US', marketplace: 'Amazon' } }\n"
    + "    });",
    "    var gate = handleProductPricingWorkspaceGet_({\n"
    + "      requestId: 'REQ-READBACK-GATE',\n"
    + "      payload: { scope: { company: 'KM', country: 'US', marketplace: 'Amazon' } }\n"
    + "    }, (function () { var io = ppwDefaultIo_();"
    + " io.flagEnabled = function () { return true; }; return io; }()));");
  return R.gate_proof.refusal_code === 'FEATURE_DISABLED'
    && r.gate_proof.refusal_code !== 'FEATURE_DISABLED';
});

mut('M6 an absent source table is read as an empty one, so a missing sheet looks like a quiet site',
  function () {
    var r = withSrc('rb', "  if (!sheet) { out.reason = 'SCHEMA_NOT_PROVISIONED'; return out; }",
      "  if (!sheet) { out.readable = true; return out; }");
    function verdictWithout(rep) { return rep.verdict; }
    var cleanAbsent = Rabsent.verdict;
    // Mutant, same DB minus pricing_list: it now claims readable and the verdict stops naming the repair.
    var m72 = SRC72, mrb = swapIn(SRCRB,
      "  if (!sheet) { out.reason = 'SCHEMA_NOT_PROVISIONED'; return out; }",
      "  if (!sheet) { out.readable = true; return out; }");
    var ctx = vm.createContext({ console: console });
    var db = DB({ pricing_list: null }), sheets = {}, log = [];
    Object.keys(db).forEach(function (n) { sheets[n] = fakeSheet(n, db[n], log); });
    ctx.SpreadsheetApp = { openById: function () {
      return { getId: function () { return DB_ID; },
        getSheetByName: function (n) { return sheets[n] || null; } }; } };
    ctx.Logger = { log: function () {} };
    ctx.KMSAFE = { assertExpectedSpreadsheetId: function () { return true; },
      classifySchemaMismatch: function () { return { valid: true, schemaStatus: 'OK' }; },
      validateMigrationAuthorization: function () { return { authorized: false }; } };
    vm.runInContext('var PRODUCTION_DB_SPREADSHEET_ID_ = ' + JSON.stringify(DB_ID) + ';', ctx);
    vm.runInContext('var PRODUCT_STRATEGY_ENABLED_ = false;'
      + ' function productStrategyEnabled_() { return false; }', ctx);
    vm.runInContext(SRC29, ctx); vm.runInContext(m72, ctx); vm.runInContext(mrb, ctx);
    var bad = vm.runInContext(
      'JSON.parse(JSON.stringify(RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()))', ctx);
    return cleanAbsent === 'SOURCE_PARTIALLY_READABLE' && bad.verdict !== 'SOURCE_PARTIALLY_READABLE';
  });

mut('M7 the census merges category spellings that differ only by case', function () {
  var r = withSrc('rb', "    var k = p1b3Lower_(v).replace(/\\s+/g, ' ');",
    "    var k = p1b3Str_(v);");
  // Clean: two spellings, one candidate group. Mutant: no candidate at all, so the operator is never asked.
  return SD.category_alias_candidates.length === 1
    && r.census.sku_details.category_alias_candidates.length === 0;
});

mut('M8 the readback classifies eligibility itself instead of asking the shipped builder', function () {
  // A CENSUS THAT RE-DECIDES ELIGIBILITY MEASURES A PIPELINE NOBODY SHIPS. Replacing the builder's own
  // verdict with a local guess still produces plausible numbers — which is exactly why it must not.
  var r = withSrc('rb', '  if (row && row.analysable === true) return \'ELIGIBLE_AND_CHARTABLE\';',
    '  if (row && row.regular_price !== null) return \'ELIGIBLE_AND_CHARTABLE\';');
  var us = null, usm = null;
  R.sites.forEach(function (s) { if (s.site.country === 'US') us = s; });
  r.sites.forEach(function (s) { if (s.site.country === 'US') usm = s; });
  // The missing-regional row HAS a price, so a price-based guess calls it chartable. It is not.
  return us.classes.ELIGIBLE_AND_CHARTABLE === 2 && usm.classes.ELIGIBLE_AND_CHARTABLE === 3;
});

mut('M9 the adapter keeps the live array in source_status, so every row reads as bad data', function () {
  var A2 = withAdapter("    var siteStatus = str(live.marketplace_sku_status) || null;",
    "    var siteStatus = live.source_status;");
  var r = A2.adaptRow(liveRow({ source_status: ['X'] }), ASOF);
  return S.statusStateOf(g1, S.PERMITTED_STATUSES) === 'PERMITTED'
    && S.statusStateOf(r, S.PERMITTED_STATUSES) === 'SITE_STATUS_SHAPE_UNEXPECTED';
});

mut('M10 two effective campaigns are resolved by taking the first', function () {
  var A2 = withAdapter("    if (out.candidates.length === 1) { out.effective = out.candidates[0]; }\n"
    + "    else if (out.candidates.length > 1) { out.ambiguous = true; }",
    "    if (out.candidates.length >= 1) { out.effective = out.candidates[0]; }");
  var two = [camps[0], { campaign_id: 'C3', status: 'active', start_date: '2026-09-05',
    end_date: '2026-09-20', promo_price: 8.49 }];
  return ADAPTER.adaptRow(liveRow({ campaigns: two }), ASOF).official_deal_price === null
    && A2.adaptRow(liveRow({ campaigns: two }), ASOF).official_deal_price === 9.99;
});

mut('M11 an unfetchable reference is called a verified image, and the chart paints a broken one',
  function () {
    /* THE ANCHOR MOVED BECAUSE THE RULE MOVED. This used to delete imageStateOf's own
       `/^https?:\/\//` line; P1-B8C-R3 deleted that line for real and put the decision in the shared
       policy, so the mutant now removes the CALL to it. The substitution is "accept whatever the row
       carried", which is precisely what SKU Details did before R3 and what let a Drive id reach an
       `<img src>`. */
    var A2 = withAdapter("    if (!P.classify(v).accepted) return 'UNVERIFIED_SOURCE_REFERENCE';", "");
    var OPAQUE = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456';
    return ADAPTER.adaptRow(liveRow({ product_image: OPAQUE }), ASOF).image_identity_status
      === 'UNVERIFIED_SOURCE_REFERENCE'
      && A2.adaptRow(liveRow({ product_image: OPAQUE }), ASOF).image_identity_status
      === 'VERIFIED_DB_MAPPING';
  });

mut('M12 a non-ISO campaign date is compared anyway, so a finished promotion looks live', function () {
  // '1/3/2026' < '2026-09-11' as a STRING, which is how the selectors compare these — so a loose parse
  // makes a campaign that ended in March look like today's deal.
  var A2 = withAdapter("    if (/^\\d{4}-\\d{2}-\\d{2}[T ]/.test(s)) return s.slice(0, 10);\n    return null;",
    "    if (/^\\d{4}-\\d{2}-\\d{2}[T ]/.test(s)) return s.slice(0, 10);\n    return s;");
  var c = [{ campaign_id: 'C4', status: 'active', start_date: '1/3/2026', end_date: '31/3/2026',
    promo_price: 7.0 }];
  return ADAPTER.adaptRow(liveRow({ campaigns: c }), ASOF).official_deal_price === null
    && A2.adaptRow(liveRow({ campaigns: c }), ASOF).official_deal_price === 7.0;
});

mut('M13 the adapter reads the clock, so "currently effective" depends on when the test runs', function () {
  var A2 = withAdapter("    var day = isoDay(asOf);",
    "    var day = isoDay(asOf) || new Date().toISOString().slice(0, 10);");
  // Clean: no date in, nothing effective. Mutant: today, so the answer changes with the calendar.
  return ADAPTER.effectivePromotion(camps, null).effective === null
    && A2.effectivePromotion([{ campaign_id: 'C9', status: 'active', start_date: '2000-01-01',
      end_date: '2099-12-31', promo_price: 1 }], null).effective !== null;
});

mut('M14 the adapter invents a variant name from the product name', function () {
  var A2 = withAdapter("      dq.push('VARIANT_NAME_SOURCE_MISSING');",
    "      variantName = str(live.product_name).split(' ').pop(); dq.push('VARIANT_NAME_DERIVED');");
  return ADAPTER.adaptRow(liveRow(), ASOF).variant_name === null
    && A2.adaptRow(liveRow(), ASOF).variant_name === 'Spatula';
});

mut('M15 the adapter overwrites the server state with SOURCE_NOT_CONNECTED', function () {
  var A2 = withAdapter("    var st = str(d.sourceState);\n    if (st !== '') {",
    "    var st = '';\n    if (st !== '') {");
  return ADAPTER.adapt(envOf([], { sourceState: 'SOURCE_EMPTY' }), {}).sourceState === 'SOURCE_EMPTY'
    && A2.adapt(envOf([], { sourceState: 'SOURCE_EMPTY' }), {}).sourceState !== 'SOURCE_EMPTY';
});

mut('M16 a refusal is dressed up as an empty source', function () {
  var ctx = vm.createContext({ console: console });
  vm.runInContext(swapIn(SRC72, '    sourceState: null,\n    filtersApplied: { category: req.filters.category,',
    "    sourceState: 'SOURCE_EMPTY',\n    filtersApplied: { category: req.filters.category,"), ctx);
  var a = vm.runInContext('ppwRefusedData_(ppwValidateRequest_({}), []).sourceState', L);
  var b = vm.runInContext('ppwRefusedData_(ppwValidateRequest_({}), []).sourceState', ctx);
  return a === null && b === 'SOURCE_EMPTY';
});

mut('M17 the readback reports a source freshness it never measured', function () {
  var ctx = vm.createContext({ console: console });
  // THE ANCHOR HAS TO BE UNIQUE: this block appears twice, once in the build and once in the refused
  // answer. Only the build has `read_at` taken from the argument, so that line disambiguates it.
  vm.runInContext(swapIn(SRC72,
    "      read_at: (readAt === undefined || readAt === null) ? null : readAt,\n"
    + "      read_at_is: 'the server clock when this read ran',\n"
    + '      source_modified_at: null,',
    "      read_at: (readAt === undefined || readAt === null) ? null : readAt,\n"
    + "      read_at_is: 'the server clock when this read ran',\n"
    + '      source_modified_at: readAt,'), ctx);
  function f(c) {
    return vm.runInContext('ppwWorkspaceBuild_(' + JSON.stringify({
      marketplace_skus: DB().marketplace_skus, sku_details: DB().sku_details
    }) + ', ppwValidateRequest_(' + JSON.stringify({
      scope: { company: 'KM', country: 'US', marketplace: 'Amazon' },
      include: { regional: false, pricing: false }
    }) + '), 42).schema.source_modified_at', c);
  }
  return f(L) === null && f(ctx) === 42;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
process.exit(fail ? 1 : 0);
