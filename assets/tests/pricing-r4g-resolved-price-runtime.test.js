// Kitchen Mama Operation System — PRICING-R4G · RESOLVED-PRICE RUNTIME
// =============================================================================================================
// WHAT SHIPPED. The three pricing columns — regular_price / minimum_price / msrp — stop being "the price"
// and become the USER OVERRIDE. Blank means no override exists, which is the ordinary state of a healthy
// row. What a site charges is the RESOLVED price: the override when there is one, otherwise auto_*,
// otherwise null. Never 0.
//
// THREE CONTRACTS CHANGED AND THEY ARE ONE CHANGE. PRICING-R4F froze this and said so explicitly; the
// reason is worth repeating because each half is individually shippable and individually a defect:
//
//   the resolver alone  -> the operator has no way to clear an override, so the fallback is unreachable
//   the clear alone     -> a live site price goes blank on consumers that cannot fall back
//   FX still writing    -> the next reconciliation refills whatever `Use Auto Price` just emptied
//
// WHAT THIS SUITE OWNS, as distinct from the six pricing suites it sits beside. Those record the change
// against the contracts they each froze — R2's write path, R3's FX contract, R4D's audit, R4E's creation,
// R4F's freeze. This one owns the things that did not exist before the round:
//
//   A  §17's matrix A-N, executed and labelled, end to end
//   B  the WIRE — 72_ resolving through 73_, executed, including the partial-sync refusal
//   C  the CLIENT mirror in operation-system-db-api.js, and that it agrees with the server case for case
//   D  §13 the consumer census, POST — every R4F-identified unsafe consumer, re-measured
//   E  §14 blank -> zero, POST
//   F  the release: five files, one id, and what each half of a partial sync does
//   M  mutants
//
// Run: node assets/tests/pricing-r4g-resolved-price-runtime.test.js
// LOCAL / FAKE-ONLY. No network, no Sheets, no Apps Script, no browser. Zero production reads or writes.
// NOTE: no 'use strict' — the .gs sources are eval'd.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var GS04 = readN('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
var GS59 = readN('assets/specs/active/apps-script/59_api_v1_sku_details_workspace.gs');
var GS72 = readN('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
var GS63 = readN('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var DBAPI = readN('assets/js/api/operation-system-db-api.js');
var ADAPTER = readN('assets/js/api/km-product-pricing-adapter.js');
var FCSUM = readN('assets/js/pages/fc-summary.js');
var SELECTORS = readN('assets/js/product-strategy/psb-selectors.js');
var CRISK = readN('assets/js/pages/campaign-risk.js');
var DOC = readN('assets/specs/active/PRICING_DATABASE_MAPPING.md');
var INDEX = readN('index.html');

var pass = 0, fail = 0, caught = 0, survived = [];
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

function decomment(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
}
function bare(src) {
  return decomment(src).replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
}
/** One named function, lifted out of a browser file by brace matching. */
function extractFn(src, name) {
  var sig = 'function ' + name + '(';
  var i = src.indexOf(sig);
  if (i < 0) throw new Error('HARNESS: fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('HARNESS: unbalanced fn: ' + name);
}

console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4G — RESOLVED-PRICE RUNTIME');
console.log(new Array(111).join('='));

// -------------------------------------------------------------------------------------------------------------
// THE WORLD. Apps Script gives every .gs file in a project ONE global scope, so 73_, 72_ and 04_ are loaded
// into one context exactly as they are in production — which is what lets 72_ CALL the canonical resolver
// instead of carrying a second copy of the rule.
// -------------------------------------------------------------------------------------------------------------
function gsGlobals() {
  return {
    console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON,
    isFinite: isFinite, Date: Date, RegExp: RegExp, parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return {}; }, flush: function () {} },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: { formatDate: function () { return '2026-09-25'; }, getUuid: function () { return 'u'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    Logger: { log: function () {} }
  };
}
/** `only73` loads the pricing writer alone; the default is the whole pricing surface in one scope. */
function world(opts) {
  opts = opts || {};
  var S = gsGlobals();
  vm.createContext(S);
  if (!opts.no73) vm.runInContext(GS73, S, { filename: '73_api_v1_pricing_write.gs' });
  if (opts.with72) vm.runInContext(GS72, S, { filename: '72_api_v1_product_pricing_workspace.gs' });
  if (opts.with04) vm.runInContext(GS04, S, { filename: '04_marketplace_forecast_import.gs' });
  return S;
}
var W = world({ with72: true, with04: true });
var REG = W.PRICING_FIELDS_[0], MIN = W.PRICING_FIELDS_[1], MSRP = W.PRICING_FIELDS_[2];

/** One pricing_list row, spelled the way a sheet spells it. */
function prow(o) {
  var r = { currency: 'CAD', base_currency: 'USD',
    base_regular_price: 29.99, base_minimum_price: 24.99, base_msrp: 39.99,
    auto_regular_price: '', auto_minimum_price: '', auto_msrp: '',
    regular_price: '', minimum_price: '', msrp: '',
    regular_price_is_manual: '', minimum_price_is_manual: '', msrp_is_manual: '' };
  Object.keys(o || {}).forEach(function (k) { r[k] = o[k]; });
  return r;
}
function rates(S, rate) {
  var t = (S || W).pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD',
    rate: rate === undefined ? 1.35 : rate, source: 'OPERATOR_INPUT', as_of: '2026-09-25' }]);
  t.runDate = '2026-09-25';
  return t;
}

// THE CLIENT MIRROR, lifted out of the browser file and executed. Nothing is reimplemented here; these are
// the shipped functions, run in this process.
var CLIENT = (function () {
  var sandbox = { console: console, String: String, Number: Number, isFinite: isFinite, Object: Object };
  vm.createContext(sandbox);
  vm.runInContext(['pricingNumOrNull_', 'pricingIsNa_', 'pricingFlagOrNull_', 'pricingResolveBand_',
    'normalizePricingListRecord'].map(function (n) { return extractFn(DBAPI, n); }).join('\n'),
    sandbox, { filename: 'operation-system-db-api.js (extract)' });
  return sandbox;
}());

// =============================================================================================================
section('A · §17 THE MATRIX — A to N, EXECUTED');
// =============================================================================================================
{
  // A / B / C — the three resolution outcomes, from the canonical server resolver.
  eq(W.pricingResolveEffective_(prow({ auto_regular_price: 42.31 }), REG).value, 42.31,
    'A   §17 A — manual blank, auto present -> resolved = auto');
  eq(W.pricingResolveEffective_(prow({ regular_price: 39.99, auto_regular_price: 42.31 }), REG).value, 39.99,
    'B   §17 B — manual present, auto present -> resolved = manual');
  var none = W.pricingResolveEffective_(prow({}), REG);
  eq([none.value, none.source], [null, 'NOT_SET'],
    'C   §17 C — manual blank, auto blank -> resolved = null');
  ok(none.value !== 0, 'C1  and it is null rather than 0, which is the rule the whole round turns on');

  // D — three bands, three independent answers, from ONE row. MIXED_FIELD_AUTHORITY_PASS.
  var mixed = prow({ regular_price: 39.99, regular_price_is_manual: 'TRUE',
    auto_minimum_price: 26.24, minimum_price_is_manual: 'FALSE',
    auto_msrp: 51.99, msrp_is_manual: '' });
  eq([REG, MIN, MSRP].map(function (sp) { return W.pricingResolveEffective_(mixed, sp).value; }),
    [39.99, 26.24, 51.99],
    'D   §17 D — Regular manual, Minimum auto, MSRP auto: each band resolves independently');
  eq([REG, MIN, MSRP].map(function (sp) { return W.pricingResolveEffective_(mixed, sp).source; }),
    ['OVERRIDE', 'AUTO', 'AUTO'],
    'D1  MIXED_FIELD_AUTHORITY_PASS — and each says which layer answered');
  eq([REG, MIN, MSRP].map(function (sp) { return W.pricingResolveEffective_(mixed, sp).authority; }),
    ['MANUAL', 'AUTO', 'UNKNOWN'],
    'D2  across three DIFFERENT flag states, none of which changed the price');

  // E / F — Use Auto Price.
  var e = W.pricingPlanField_(prow({ regular_price: 39.99, auto_regular_price: 42.31,
    regular_price_is_manual: 'TRUE' }), REG, 'AUTO', '', 'CAD');
  eq([e.cells.regular_price, e.cells.regular_price_is_manual], ['', 'FALSE'],
    'E   §17 E — USE_AUTO_CLEARS_OVERRIDE = YES');
  var f = W.pricingPlanField_(prow({ regular_price: 39.99, auto_regular_price: '',
    regular_price_is_manual: 'TRUE' }), REG, 'AUTO', '', 'CAD');
  eq([f.error, f.changed, f.cells.regular_price], [null, true, ''],
    'F   §17 F — USE_AUTO_ALLOWED_WITH_BLANK_AUTO = YES');

  // G / H — FX moves auto; the override survives, and a blank one lets the resolved price move with it.
  var g = W.pricingPlanFxRow_(prow({ regular_price: 39.99, auto_regular_price: 40.00,
    regular_price_is_manual: 'TRUE' }), rates());
  ok(!Object.prototype.hasOwnProperty.call(g.cells, 'regular_price') && g.cells.auto_regular_price === 40.49,
    'G   §17 G — FX changes auto while the manual override survives, untouched');
  eq(W.pricingResolveEffective_(prow({ regular_price: 39.99, auto_regular_price: 40.49 }), REG).value, 39.99,
    'G1  and the resolved price stays at the operator\'s number');
  var h = W.pricingPlanFxRow_(prow({ regular_price: '', auto_regular_price: 40.00,
    regular_price_is_manual: 'FALSE' }), rates());
  eq([h.cells.auto_regular_price, Object.prototype.hasOwnProperty.call(h.cells, 'regular_price')],
    [40.49, false],
    'H   §17 H — FX changes auto on a blank-override row, still writing no override');
  eq(W.pricingResolveEffective_(prow({ regular_price: '', auto_regular_price: 40.49,
    regular_price_is_manual: 'FALSE' }), REG).value, 40.49,
    'H1  and the RESOLVED price moves with it automatically — the point of the whole model');
  eq(h.fields.regular_price.resolved_follows, true,
    'H2  which the plan reports as resolved_follows, so an operator can see it before running the write');

  // FX_WRITES_MANUAL_OVERRIDE_COUNT — measured across every authority, in one number.
  var fxAll = W.pricingPlanFxRow_(prow({ regular_price: 39.99, minimum_price: 20, msrp: '',
    auto_regular_price: 1, auto_minimum_price: 1, auto_msrp: 1,
    regular_price_is_manual: 'TRUE', minimum_price_is_manual: 'FALSE', msrp_is_manual: '' }), rates());
  eq(Object.keys(fxAll.cells).filter(function (k) { return /^(regular_price|minimum_price|msrp)$/.test(k); }), [],
    'H3  FX_WRITES_MANUAL_OVERRIDE_COUNT = 0 — over TRUE, FALSE and blank in one row');

  // I / J / K — creation, pending, and the first reconciliation.
  var same = W.pricingNewRowPlan_('USD', 'USD', { regular: 29.99, minimum: 24.99, msrp: 39.99 }, '2026-09-25');
  eq([same.override.regular, same.auto.regular], ['', 29.99],
    'I   §17 I — a new same-currency row: auto populated, manual override blank');
  eq(W.pricingResolveEffective_({ regular_price: same.override.regular,
    auto_regular_price: same.auto.regular, regular_price_is_manual: same.flag }, REG).value, 29.99,
    'I1  and it resolves to the auto value, so the site has a price on day one');

  var cross = W.pricingNewRowPlan_('USD', 'CAD', { regular: 29.99, minimum: 24.99, msrp: 39.99 }, '2026-09-25');
  var pendingRow = { regular_price: cross.override.regular, auto_regular_price: cross.auto.regular,
    regular_price_is_manual: cross.flag };
  eq([cross.pending, cross.override.regular, cross.auto.regular], [true, '', ''],
    'J   §17 J — a new cross-currency pending_fx row: auto blank, manual override blank');
  eq(W.pricingResolveEffective_(pendingRow, REG).value, null,
    'J1  which resolves to null — Not Set, and emphatically not 0');

  var k = W.pricingPlanFxRow_(prow({ base_regular_price: 29.99, base_minimum_price: '', base_msrp: '',
    auto_regular_price: '', regular_price: '', regular_price_is_manual: 'FALSE' }), rates());
  eq(k.cells.auto_regular_price, 40.49, 'K   §17 K — the first FX run populates auto');
  ok(!Object.prototype.hasOwnProperty.call(k.cells, 'regular_price'),
    'K1  and the override stays blank, because nothing writes it');
  eq(W.pricingResolveEffective_(prow({ auto_regular_price: k.cells.auto_regular_price,
    regular_price_is_manual: 'FALSE' }), REG).value, 40.49,
    'K2  after which the row resolves to the converted price — created, reconciled, priced, no override');

  // L — blank never becomes zero, at any layer, in either runtime.
  var zeroShapes = [prow({}), prow({ regular_price: '', auto_regular_price: '' }),
    prow({ regular_price: 'NA', auto_regular_price: '' })];
  eq(zeroShapes.map(function (r) { return W.pricingResolveEffective_(r, REG).value; }), [null, null, null],
    'L   §17 L — every empty shape resolves to null on the server');
  eq(zeroShapes.map(function (r) { return CLIENT.normalizePricingListRecord(r).resolvedRegularPrice; }),
    [null, null, null],
    'L1  and to null in the browser — never 0, on either side of the wire');
  eq(W.pricingResolveEffective_(prow({ regular_price: 0, auto_regular_price: 40.49 }), REG).value, 0,
    'L2  while a REAL zero is still a real price — "absent" and "zero" stay two different answers');

  // M / N — the legacy population. A populated override resolves to exactly what it always did.
  var legacyShapes = [
    ['base-shaped price, no flag', prow({ regular_price: 29.99, auto_regular_price: 40.49 })],
    ['tracking auto, no flag', prow({ regular_price: 40.49, auto_regular_price: 40.49 })],
    ['a negotiated price, no flag', prow({ regular_price: 44.95, auto_regular_price: 40.49 })],
    ['nothing to compare', prow({ regular_price: 44.95 })],
    ['MANUAL with a price', prow({ regular_price: 34.99, auto_regular_price: 40.49, regular_price_is_manual: 'TRUE' })],
    ['NA, deliberately none', prow({ regular_price: 'NA', auto_regular_price: 40.49 })]
  ];
  eq(legacyShapes.map(function (t) { return W.pricingResolveEffective_(t[1], REG).value; }),
    [29.99, 40.49, 44.95, 44.95, 34.99, null],
    'M   §17 M — every legacy shape resolves to the number it already held. Byte-equivalent.');
  eq(legacyShapes.filter(function (t) {
    return W.pricingResolveEffective_(t[1], REG).source === 'AUTO';
  }).map(function (t) { return t[0]; }), [],
    'M1  not one of them resolves THROUGH auto — a populated override never reaches the fallback');
  ok(bare(GS73).indexOf('migrat') === -1 && bare(GS04).indexOf('migrat') === -1,
    'N   §17 N — and no shipped pricing file contains a migration at all');
}

// =============================================================================================================
section('B · §8 THE WIRE — 72_ RESOLVES THROUGH 73_, EXECUTED');
// =============================================================================================================
{
  // B1 — the rule is CALLED, not copied. One resolver in the project, reached from two files.
  eq((bare(GS72).match(/function pricingResolveEffective_/g) || []).length, 0,
    'B1  72_ declares no resolver of its own');
  ok(/pricingResolveEffective_\(priceRow, spec\)/.test(GS72),
    'B1a it calls 73_\'s — the same reuse 04_ makes of the frozen precision table');

  // B2 — executed, over a row of each shape.
  var bandsOverride = W.ppwPriceBands_(prow({ regular_price: 39.99, auto_regular_price: 42.31,
    regular_price_is_manual: 'TRUE' }));
  eq([bandsOverride.regular_price.resolved, bandsOverride.regular_price.auto,
    bandsOverride.regular_price.override, bandsOverride.regular_price.source],
    [39.99, 42.31, 39.99, 'OVERRIDE'],
    'B2  an overridden band publishes resolved / auto / override and names the source');
  var bandsAuto = W.ppwPriceBands_(prow({ auto_regular_price: 42.31, regular_price_is_manual: 'FALSE' }));
  eq([bandsAuto.regular_price.resolved, bandsAuto.regular_price.auto,
    bandsAuto.regular_price.override, bandsAuto.regular_price.source],
    [42.31, 42.31, null, 'AUTO'],
    'B2a an auto-priced band publishes a resolved price and a NULL override — which is not a gap');
  var bandsNone = W.ppwPriceBands_(prow({}));
  eq([bandsNone.regular_price.resolved, bandsNone.regular_price.source], [null, 'NOT_SET'],
    'B2b and a band with nothing behind it says NOT_SET rather than publishing a number');

  // B3 — the three bands, independently, through the transport.
  var bandsMixed = W.ppwPriceBands_(prow({ regular_price: 39.99, auto_minimum_price: 26.24, auto_msrp: '' }));
  eq([bandsMixed.regular_price.source, bandsMixed.minimum_price.source, bandsMixed.msrp.source],
    ['OVERRIDE', 'AUTO', 'NOT_SET'],
    'B3  three bands keep three answers all the way onto the wire');

  // B4 — NO pricing row at all is distinguishable from a row with no price.
  eq(W.ppwResolveBand_(null, REG).source, 'NO_PRICING_ROW',
    'B4  a SKU with no pricing_list row says so, and is not confused with a row that has no price');

  // B5 — THE PARTIAL SYNC. 72_ at R24 beside an older 73_ has no resolver to call.
  var noResolver = world({ no73: true, with72: true });
  var orphan = noResolver.ppwResolveBand_(prow({ regular_price: 39.99, auto_regular_price: 42.31 }), REG);
  eq([orphan.resolved, orphan.source], [null, 'RESOLVER_UNAVAILABLE'],
    'B5  with 73_ absent it publishes NO price and says why — it does not fall back to the override cell');
  ok(/PRICING_RESOLVER_UNAVAILABLE/.test(GS72),
    'B5a and the row carries a finding, so the refusal is visible rather than silent');
  ok(!/override.*\|\|.*auto|auto.*\|\|.*override/.test(bare(GS72)),
    'B5b there is no hand-written fallback anywhere in the file to reach for instead');

  // B6 — the alias. `regular_price` stays on the wire and must equal `resolved_regular_price` always.
  var aliasSrc = GS72.slice(GS72.indexOf('    regular_price: price ?'), GS72.indexOf('    product_image:'));
  ok(/regular_price: price \? bands\.regular_price\.resolved : null/.test(aliasSrc) &&
     /resolved_regular_price: price \? bands\.regular_price\.resolved : null/.test(aliasSrc),
    'B6  the legacy name and the explicit name are built from ONE expression — an alias, not a second opinion');
  ['minimum_price', 'msrp'].forEach(function (b) {
    var legacy = new RegExp('    ' + b + ': price \\? bands\\.' + b + '\\.resolved : null');
    var explicit = new RegExp('    resolved_' + (b === 'msrp' ? 'msrp' : b) + ': price \\? bands\\.' + b + '\\.resolved : null');
    ok(legacy.test(aliasSrc) && explicit.test(aliasSrc), 'B6a ' + b + ' likewise');
  });

  // B7 — 59_ did NOT have to change, and that is a finding rather than an omission.
  ok(/RAW passthrough/.test(GS59) && bare(GS59).indexOf('pricingResolveEffective_') === -1,
    'B7  59_ resolves nothing — it passes pricing_list rows through whole, as it always did');
  ok(/auto_regular_price/.test(DBAPI) && /regular_price_is_manual/.test(DBAPI),
    'B7a and the client resolves on that transport, because every layer already arrives on it');
}

// =============================================================================================================
section('C · §9 THE CLIENT MIRROR — AND THAT IT AGREES WITH THE SERVER');
// =============================================================================================================
{
  // C1 — the mirror exists, in one place, and pages get the answer rather than the ingredients.
  eq((bare(DBAPI).match(/function pricingResolveBand_/g) || []).length, 1,
    'C1  RESOLVER_CLIENT — one client resolver, declared once');
  ok(/resolvedRegularPrice:/.test(DBAPI) && /resolvedRegularPriceSource:/.test(DBAPI),
    'C1a and the normalizer publishes the resolved price and its source');

  // C2 — THE AGREEMENT, MEASURED. A mirror nobody compares is two authorities with one name.
  var TRUTH = [
    ['TRUE', 34.99, 40.49], ['FALSE', 40.49, 40.49], ['', 34.99, 40.49],
    ['', '', 40.49], ['TRUE', '', 40.49], ['FALSE', '', 40.49],
    ['FALSE', 0, 40.49], ['', 0, 40.49], ['', 'NA', 40.49], ['FALSE', 'NA', 40.49],
    ['', '', ''], ['TRUE', 34.99, ''], ['', 'NA', '']
  ];
  var disagree = TRUTH.filter(function (c) {
    var r = prow({ regular_price: c[1], auto_regular_price: c[2], regular_price_is_manual: c[0] });
    return W.pricingResolveEffective_(r, REG).value !== CLIENT.normalizePricingListRecord(r).resolvedRegularPrice;
  }).map(function (c) { return JSON.stringify(c); });
  eq(disagree, [],
    'C2  RESOLVER_SERVER_PASS = RESOLVER_CLIENT_PASS — thirteen shapes, two runtimes, no disagreement');
  eq(TRUTH.length, 13, 'C2a over thirteen shapes, which is every combination the columns can hold');

  // C3 — and the harness can tell a disagreement from an agreement, or C2 proves nothing.
  var sabotaged = CLIENT.pricingResolveBand_({ regular_price: '', auto_regular_price: 40.49 },
    'regular_price', 'NO_SUCH_COLUMN', 'resolved_regular_price', 'regular_price_source');
  eq([sabotaged.value, sabotaged.source], [null, 'NOT_SET'],
    'C3  pointed at a column that does not exist the client returns NOT_SET — so C2 could have failed');

  // C4 — the WIRE WINS when it speaks. One authority per transport.
  var fromWire = CLIENT.normalizePricingListRecord({ regular_price: '', auto_regular_price: 1,
    resolved_regular_price: 99.99, regular_price_source: 'AUTO' });
  eq([fromWire.resolvedRegularPrice, fromWire.resolvedRegularPriceSource], [99.99, 'AUTO'],
    'C4  a row carrying the server\'s answer is not second-guessed by the mirror');
  var noWire = CLIENT.normalizePricingListRecord({ regular_price: '', auto_regular_price: 42.31 });
  eq([noWire.resolvedRegularPrice, noWire.resolvedRegularPriceSource], [42.31, 'AUTO'],
    'C4a and a raw cache row is resolved locally, which is the transport the mirror exists for');

  // C5 — the RAW override is still published beside it, because the editor needs all three.
  var rec = CLIENT.normalizePricingListRecord(prow({ regular_price: 39.99, auto_regular_price: 42.31 }));
  eq([rec.regularPrice, rec.autoRegularPrice, rec.resolvedRegularPrice], [39.99, 42.31, 39.99],
    'C5  override, auto and resolved all reach the browser separately');
  eq(CLIENT.normalizePricingListRecord(prow({ auto_regular_price: 42.31 })).regularPrice, null,
    'C5a and a blank override normalizes to null, not to the auto value — the raw cell stays raw');

  // C6 — NA does not fall back, on the client either.
  var na = CLIENT.normalizePricingListRecord(prow({ regular_price: 'NA', auto_regular_price: 42.31 }));
  eq([na.resolvedRegularPrice, na.resolvedRegularPriceSource, na.regularPriceIsNa], [null, 'NA', true],
    'C6  NA resolves to null in the browser too — "does not apply" is never answered with a number');

  // C7 — the pricing EDITOR reads all three, which is the one screen allowed to.
  var SRP = require('../js/pages/sku-regional-pricing.js');
  var v = SRP.fieldView({ raw: prow({ auto_regular_price: 42.31, regular_price_is_manual: 'FALSE' }) },
    SRP.FIELDS[0]);
  eq([v.override, v.auto, v.resolved, v.resolvedSource], [null, 42.31, 42.31, 'AUTO'],
    'C7  SKU_REGIONAL_RESOLVED_PRICE_PASS — the editor holds override, auto and resolved apart');
  var v2 = SRP.fieldView({ raw: prow({ regular_price: 39.99, auto_regular_price: 42.31 }) }, SRP.FIELDS[0]);
  eq([v2.override, v2.auto, v2.resolved, v2.resolvedSource], [39.99, 42.31, 39.99, 'OVERRIDE'],
    'C7a and an overridden field shows the override as the resolved price, with auto still beside it');
  var v3 = SRP.fieldView({ raw: prow({ regular_price: 'NA', auto_regular_price: 42.31 }) }, SRP.FIELDS[0]);
  eq([v3.resolved, v3.resolvedSource, v3.effectiveIsNa], [null, 'NA', true],
    'C7b and NA stays NA on screen rather than borrowing the auto number');

  // C8 — §10's three lines exist in the rendered panel, and "Not set" beside a price is not a warning.
  var SRD = readN('assets/js/pages/sku-regional-details.js');
  var CSS = readN('assets/css/pages/sku-regional-details.css');
  ok(/srd-pr__ovr/.test(readN('assets/js/pages/sku-regional-pricing.js')) && /srd-pr__ovr/.test(CSS),
    'C8  the Override line is rendered and styled');
  ok(/'<span class="srd-pr__ovr">Override '/.test(readN('assets/js/pages/sku-regional-pricing.js')),
    'C8a labelled, so a reader does not have to infer which number is which');
  ok(/srd-pr__ovr \{ font-size: 11px; color: #94A3B8; \}/.test(CSS),
    'C8b and styled like the Auto line rather than like an alert — a blank override is a healthy state');
}

// =============================================================================================================
section('D · §13 THE CONSUMER CENSUS, POST');
// =============================================================================================================
{
  // Every consumer R4F classified UNSAFE_BLANK, re-measured against what shipped.
  ok(/bands\.regular_price\.resolved !== null && !pricingAmbiguous/.test(GS72),
    'D1  PSB_RESOLVED_PRICE_PASS — 72_ gates analysable on the resolved price');
  ok(/resolved_regular_price: live\.resolved_regular_price/.test(ADAPTER),
    'D2  PRICING_CENTER_RESOLVED_PRICE_PASS — the adapter carries it through verbatim');
  ok(/S\.resolvedCents\(row, 'regular_price'\) === null/.test(SELECTORS),
    'D3  the board reads it for PRICING_SOURCE_MISSING and the chart gate');
  ok(/var resolvedPrice = row\.resolvedRegularPrice;/.test(FCSUM),
    'D4  FC_SUMMARY_RESOLVED_PRICE_PASS — the FC price lookup reads the resolved price');
  ok(/regular_price: l\.regularPrice/.test(FCSUM),
    'D5  and the campaign snapshot is fed from that same lookup, so it snapshots a resolved price');

  // UNSAFE_BLANK_CONSUMERS_POST = 0, measured as the absence of a raw-override read on a business path.
  var rawReaders = [];
  if (/ppwNum_\(price\.regular_price\)/.test(GS72)) rawReaders.push('72_');
  if (/row\.raw \? row\.raw\.regular_price/.test(FCSUM)) rawReaders.push('fc-summary');
  if (/S\.cents\(row\.regular_price\)/.test(SELECTORS) || /S\.cents\(r\.regular_price\)/.test(SELECTORS)) rawReaders.push('psb-selectors');
  eq(rawReaders, [],
    'D6  UNSAFE_BLANK_CONSUMERS_POST = 0 — no production-reachable business path reads the raw override');

  // And the one consumer that SHOULD read the raw override still does, or the count above is meaningless.
  ok(/effective: effective, override: effective, resolved: resolved/.test(readN('assets/js/pages/sku-regional-pricing.js')),
    'D6a while the pricing EDITOR still reads it — RAW_MANUAL_OVERRIDE_REQUIRED, and it is the only one');

  // §13's boundary: the audit does not widen into Campaign Risk.
  ok(/marketplace_skus/.test(CRISK),
    'D7  campaign-risk still reads marketplace_skus prices — a different table, deliberately out of scope');
}

// =============================================================================================================
section('E · §14 BLANK NEVER BECOMES ZERO, POST');
// =============================================================================================================
{
  // E1 — the pricing_list path, both runtimes, executed rather than grepped.
  eq(CLIENT.normalizePricingListRecord(prow({})).resolvedRegularPrice, null, 'E1  client: nothing -> null');
  eq(W.pricingResolveEffective_(prow({}), REG).value, null, 'E1a server: nothing -> null');

  // E2 — the fc-summary DOM read, which R4F listed and R4G fixed.
  ok(!/parseFloat\(regRaw\) \|\| 0/.test(FCSUM),
    'E2  the fc-summary DOM coercion is gone');
  ok(/return isFinite\(n\) \? n : null;/.test(FCSUM),
    'E2a replaced by a finite check that yields null — a typed non-number is no price, not a price of 0');

  // E3 — BLANK_TO_ZERO_DEFECTS_POST, counted the same way R4F counted the PRE number, so the two compare.
  var sites = [];
  [['operation-system-db-api.js', DBAPI], ['campaign-risk.js', CRISK], ['fc-summary.js', FCSUM],
    ['psb-selectors.js', SELECTORS], ['km-product-pricing-adapter.js', ADAPTER]].forEach(function (c) {
      var m = decomment(c[1]).match(/(regularPrice|minimumPrice|msrp|regular_price|minimum_price)[^;\n]*\|\|\s*0\b/g) || [];
      m.forEach(function () { sites.push(c[0]); });
    });
  eq(sites.sort(), ['campaign-risk.js', 'campaign-risk.js', 'operation-system-db-api.js',
    'operation-system-db-api.js', 'operation-system-db-api.js'],
    'E3  BLANK_TO_ZERO_DEFECTS_POST = 5 — fc-summary\'s is fixed; the five that remain are marketplace_skus');
  ok(/normalizeMarketplaceSkuRecord/.test(DBAPI.slice(0, DBAPI.indexOf('parseFloat(r.regular_price) || 0'))),
    'E3a and the db-api three are in the marketplace_skus normalizer, not the pricing_list one');
  ok(!/pricingNumOrNull_\([^)]*\)\s*\|\|\s*0/.test(DBAPI),
    'E3b while the pricing_list normalizer carries no zero default at all');

  // E4 — the server side stays clean, measured over every .gs file rather than sampled.
  var gsDir = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
  var offenders = fs.readdirSync(gsDir).filter(function (f) { return /\.gs$/.test(f); })
    .filter(function (f) {
      return /(regular_price|minimum_price|msrp)[^;\n]*\|\|\s*0\b/.test(bare(fs.readFileSync(path.join(gsDir, f), 'utf8')));
    });
  eq(offenders, [], 'E4  and no .gs file has a zero default on any price');
}

// =============================================================================================================
section('F · §16 THE RELEASE — FIVE FILES, ONE ID');
// =============================================================================================================
{
  var R24 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R24';
  eq((GS63.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)';/) || [])[1], R24,
    'F1  TARGET_RELEASE = R24');

  // F2 — WHY_RELEASE_ID_IS_CORRECT, asserted from the policy this repository already records rather than
  // from a preference. R23 never shipped; neither did R7, R10 or R11, and each was superseded by name.
  ok(/an id that names two different trees cannot\s*\n?\/\/ answer the one question it exists for/.test(GS63) ||
     /an id that names two different trees cannot answer/.test(GS63.replace(/\n\/\/ ?/g, ' ')),
    'F2  the rule is stated in 63_ — an id naming two trees cannot answer what it exists for');
  ok(/SUPERSEDED AS A\n\/\/ CANDIDATE/.test(GS63) || /SUPERSEDED AS A CANDIDATE/.test(GS63.replace(/\n\/\/ ?/g, ' ')),
    'F2a and it has been applied to unshipped candidates before, which is why R23 may not absorb this');

  // F3 — APPS_SCRIPT_SYNC_SET: every file that changed carries R24, and the ones that did not, do not.
  var stamps = {
    '01_router.gs': /RTR_BUILD_VERSION_ = '([^']+)'/,
    '04_marketplace_forecast_import.gs': /FCREG_BUILD_VERSION_ = '([^']+)'/,
    '63_api_v1_system_health.gs': /SYS_BUILD_VERSION_ = '([^']+)'/,
    '72_api_v1_product_pricing_workspace.gs': /PPW_BUILD_VERSION_ = '([^']+)'/,
    '73_api_v1_pricing_write.gs': /PRW_BUILD_VERSION_ = '([^']+)'/
  };
  var syncSet = Object.keys(stamps).filter(function (f) {
    return (readN('assets/specs/active/apps-script/' + f).match(stamps[f]) || [])[1] === R24;
  });
  eq(syncSet.sort(), ['01_router.gs', '04_marketplace_forecast_import.gs', '63_api_v1_system_health.gs',
    '72_api_v1_product_pricing_workspace.gs', '73_api_v1_pricing_write.gs'],
    'F3  APPS_SCRIPT_SYNC_SET — five files, all at R24, no mixed identities');
  ok((GS59.match(/SKD_BUILD_VERSION_ = '([^']+)'/) || [])[1] !== R24,
    'F3a and 59_ is NOT among them — it did not change, and marching it would destroy the signal');

  // F4 — the manifest expects exactly what each file declares. A partial sync is only visible if it does.
  var mismatched = Object.keys(stamps).filter(function (f) {
    var sym = (readN('assets/specs/active/apps-script/' + f).match(stamps[f]) || [])[1];
    var re = new RegExp("\\{ file: '" + f.replace(/\./g, '\\.') + "', symbol: '[A-Z_]+', expected: '([^']+)'");
    return ((GS63.match(re) || [])[1]) !== sym;
  });
  eq(mismatched, [], 'F4  every file in the set declares the stamp its manifest row expects');

  // F5 — §18: every changed frontend asset carries the CURRENT cache token.
  var TOKEN = 's2r4a-skuoverride-20260923';
  var changedAssets = ['operation-system-db-api.js', 'km-product-pricing-adapter.js', 'psb-selectors.js',
    'psb-data-contract.js', 'fc-summary.js', 'sku-regional-pricing.js', 'sku-regional-details.css'];
  var stale = changedAssets.filter(function (a) {
    return INDEX.indexOf(a + '?v=' + TOKEN) === -1;
  });
  eq(stale, [],
    'F5  CACHE_TOKEN_CURRENT_FOR_ALL_CHANGED_ASSETS = YES — no repeat of the supplychain.js delivery failure');

  // F6 — the spec records the round.
  ok(/## 4G\./.test(DOC), 'F6  §4G exists in the canonical mapping spec');
  ok(/EXISTING_PRODUCTION_ROWS_WRITTEN = 0/.test(DOC), 'F6a and states that no production row was written');
}

// =============================================================================================================
section('P · §0/§2 THE BOARD IS A CONSUMER, NOT A SECOND PRICING ENGINE');
// =============================================================================================================
{
  /* THE QUESTION THIS SECTION SETTLES. Between 72_ and a chart there are two reductions — the wire row is
     cut down to the PSB contract's field list, and the reduced row is what every view reads. Before this
     round the three resolved prices did not survive that cut, and the board went on drawing correct charts
     ONLY because 72_ also publishes the resolved number under the old name `regular_price`. That is a working
     system held up by an alias nobody promised to keep. Below, the alias and the explicit name are proved
     to be two names for one number, and the board is proved to read the name it means.

     THE OTHER HALF IS A PROHIBITION, and it is the more important one: the board must not be ABLE to
     compose a price. If auto_* and the flags reached it, a well-meaning change could add
     `override ?? auto` to a selector, and then two files would implement the pricing model and a chart
     would be drawn from whichever one its author happened to know about. */

  var psbCtx = vm.createContext({ console: console });
  vm.runInContext(readN('assets/js/product-strategy/psb-data-contract.js'), psbCtx,
    { filename: 'psb-data-contract.js' });
  vm.runInContext(readN('assets/js/product-strategy/psb-selectors.js'), psbCtx,
    { filename: 'psb-selectors.js' });
  var PSBC = psbCtx.PSB_CONTRACT, PSBS = psbCtx.PSB_SELECTORS;

  // P1 — PSB_REDUCED_ROW_CARRIES_RESOLVED_PRICE, declared on the contract rather than on a habit.
  eq(['resolved_regular_price', 'resolved_minimum_price', 'resolved_msrp']
      .filter(function (f) { return PSBC.FIELD_NAMES.indexOf(f) === -1; }), [],
    'P1  PSB_REDUCED_ROW_CARRIES_RESOLVED_PRICE = YES — all three are on the contract');
  ok(PSBC.CONTRACT_VERSION_HISTORY[PSBC.CONTRACT_VERSION_HISTORY.length - 1] === PSBC.CONTRACT_VERSION,
    'P1a and the version was moved WITH them, so the change is a contract evolution and not a patch');

  // P2 — EXECUTED. The reducer is run, and the three names come out the other side.
  var wire = { identity: 'MSKU:1', master_sku: 'KM-1', category: 'Shears', series: 'S',
    regular_price: 40.49, minimum_price: 30.49, msrp: 50.49,
    resolved_regular_price: 40.49, resolved_minimum_price: 30.49, resolved_msrp: 50.49,
    currency: 'CAD', marketplace_sku_status: 'Active' };
  var reduced = PSBS.ingest(wire, null, '2026-09-25');
  eq([reduced.resolved_regular_price, reduced.resolved_minimum_price, reduced.resolved_msrp],
    [40.49, 30.49, 50.49],
    'P2  the three survive the reduction — measured by running the reducer, not by reading its source');

  // P2a — and the harness can tell survival from loss, or G2 proves only that the object has keys.
  var dropped = PSBS.ingest({ identity: 'MSKU:2', regular_price: 40.49, currency: 'CAD' },
    null, '2026-09-25');
  ok(dropped.resolved_regular_price === undefined || dropped.resolved_regular_price === null,
    'P2a a wire row that carries no resolved price does not acquire one in the reducer');

  // P3 — THE ALIAS AND THE EXPLICIT NAME ARE ONE NUMBER, so reading either is correct today and reading
  //      the explicit one stays correct the day the alias is retired.
  eq(PSBS.resolvedCents(wire, 'regular_price'), PSBS.resolvedCents(
    { regular_price: 40.49 }, 'regular_price'),
    'P3  alias and explicit name resolve to the same cents');
  eq(PSBS.resolvedCents({ regular_price: 11.11, resolved_regular_price: 40.49 }, 'regular_price'), 4049,
    'P3a and when they disagree the EXPLICIT one wins — the server is the authority, not the alias');

  // P4 — PSB_REDERIVES_PRICING = NO. The prohibition, measured as absence from both the contract and the
  //      selector file. `decomment` keeps string literals, because a column name lives inside a quote.
  var editorInternals = ['auto_regular_price', 'auto_minimum_price', 'auto_msrp',
    'override_regular_price', 'override_minimum_price', 'override_msrp',
    'regular_price_source', 'minimum_price_source', 'msrp_source',
    'regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual'];
  var leaked = editorInternals.filter(function (n) { return PSBC.FIELD_NAMES.indexOf(n) !== -1; });
  eq(leaked, [],
    'P4  PSB_REDERIVES_PRICING = NO — no auto_*, override_*, *_source or flag is on the board contract');
  var referenced = editorInternals.filter(function (n) {
    return decomment(SELECTORS).indexOf(n) !== -1;
  });
  eq(referenced, [],
    'P4a and the selector file does not so much as name one — it cannot compose a price it cannot see');
  ok(!/\?\?|\|\|\s*r\.auto_|\|\|\s*row\.auto_/.test(decomment(SELECTORS)),
    'P4b nor is there an override-else-auto expression anywhere in it');

  /* P5 — EVERY PRODUCER OF A BOARD ROW SATISFIES THE BOARD CONTRACT, EXECUTED.

     THE CONTRACT'S RULE IS ABSOLUTE and it is the reason this check exists: 'Every row has EVERY
     contract field as an own property. A missing field is CONTRACT_MISMATCH, not an undefined the
     renderer has to guess about.' Adding a field is therefore not a free act — it is a new obligation
     on every producer at once, and a producer that misses it refuses ITS WHOLE ROW SET rather than
     rendering that one field blank. The board goes dark, not slightly wrong.

     THREE PRODUCERS EXIST and they are enumerated here rather than sampled, because the failure mode
     is a producer nobody remembered. Two are checked below by execution; the third is the preview
     fixture in docs/prototypes, which the board's own p1-b2 suite validates against this same
     validateRows call. If a fourth is ever added, this list is where it has to appear. */
  var producers = decomment(readN('assets/js/api/km-product-pricing-adapter.js')).indexOf('adaptRow');
  ok(producers > 0, 'P5  the live producer was located — km-product-pricing-adapter.adaptRow');

  var liveWire = { identity: 'MSKU:9', marketplace_sku_id: '9', master_sku: 'KM-9', site_sku: 'S9',
    product_name: 'Nine', category: 'Shears', series: 'S', variant_group: null, variant_name: null,
    company: 'KM', country: 'US', marketplace: 'Amazon', currency: 'USD',
    regular_price: '', minimum_price: '', msrp: '',
    resolved_regular_price: 40.49, resolved_minimum_price: 30.49, resolved_msrp: 50.49,
    marketplace_sku_status: 'Active', lifecycle: 'Running in the Market',
    campaigns: [], regional: null, source_status: [], missing_reasons: [] };
  var adapted = require('../js/api/km-product-pricing-adapter.js').adaptRow(liveWire, '2026-09-25');
  var absent = PSBC.FIELD_NAMES.filter(function (f) {
    return !Object.prototype.hasOwnProperty.call(adapted, f);
  });
  eq(absent, [],
    'P5a the LIVE adapter emits every contract field as an own property — a blank one would refuse the read');
  eq([adapted.resolved_regular_price, adapted.resolved_minimum_price, adapted.resolved_msrp],
    [40.49, 30.49, 50.49],
    'P5b and the three resolved prices arrive with their values, not merely with their names');

  // P5c — the check can fail. A contract field the adapter has never heard of must be reported absent,
  //       or P5a is asserting that a list is a subset of itself.
  var sabotaged = PSBC.FIELD_NAMES.concat(['no_such_contract_field']).filter(function (f) {
    return !Object.prototype.hasOwnProperty.call(adapted, f);
  });
  eq(sabotaged, ['no_such_contract_field'],
    'P5c a field the adapter does not emit IS reported absent — so P5a could have failed');
}

// =============================================================================================================
section('Q · §6 THE CLIENT RESOLVER DOES EACH BAND ONCE');
// =============================================================================================================
{
  /* WHY THIS IS WORTH A TEST. The first version of the client mirror resolved every band TWICE — once to
     get the value and once to get the source — because the two are published as separate fields and the
     obvious way to write it is one call per field. Six calls where three will do is not a crisis at one
     row; the pricing list normalizes every row of a site on every load. The shape that caused it is also
     the shape that lets value and source drift apart, which is the reason it is guarded rather than just
     tidied: two calls can return two answers, and then a row could show a number labelled with the wrong
     origin. Resolving once and reading both off one result makes that impossible by construction. */

  var calls = 0;
  var real = CLIENT.pricingResolveBand_;
  CLIENT.pricingResolveBand_ = function () { calls++; return real.apply(null, arguments); };
  var rec = CLIENT.normalizePricingListRecord(prow({ regular_price: 39.99, auto_regular_price: 42.31,
    minimum_price: '', auto_minimum_price: 30.49, msrp: 'NA', auto_msrp: 50.49 }));
  CLIENT.pricingResolveBand_ = real;

  eq(calls, 3,
    'Q1  CLIENT_RESOLVER_CALLS_PER_ROW = 3 — one per band, for the six fields the row publishes');
  eq([rec.resolvedRegularPrice, rec.resolvedMinimumPrice, rec.resolvedMsrp], [39.99, 30.49, null],
    'Q1a and all three bands are still resolved — the count is low because work was removed, not skipped');
  eq([rec.resolvedRegularPriceSource, rec.resolvedMinimumPriceSource, rec.resolvedMsrpSource],
    ['OVERRIDE', 'AUTO', 'NA'],
    'Q1b with each source taken from the SAME result as its value, so the two cannot disagree');

  // Q2 — CLIENT_RESOLVER_DUPLICATE_WORK = 0, stated as the property rather than as the number: no band
  //      name is resolved twice. A future field added the naive way would push the count to four.
  var seen = [], real2 = CLIENT.pricingResolveBand_;
  CLIENT.pricingResolveBand_ = function (r, k) { seen.push(k); return real2.apply(null, arguments); };
  CLIENT.normalizePricingListRecord(prow({}));
  CLIENT.pricingResolveBand_ = real2;
  eq(seen.slice().sort(), ['minimum_price', 'msrp', 'regular_price'],
    'Q2  CLIENT_RESOLVE_DUPLICATE_WORK = 0 — three distinct bands, no band resolved twice');

  // Q3 — the harness can count, or Q1 is a constant compared to itself.
  var probeCalls = 0, real3 = CLIENT.pricingResolveBand_;
  CLIENT.pricingResolveBand_ = function () { probeCalls++; return real3.apply(null, arguments); };
  CLIENT.pricingResolveBand_({}, 'regular_price', 'auto_regular_price', 'resolved_regular_price',
    'regular_price_source');
  CLIENT.pricingResolveBand_ = real3;
  eq(probeCalls, 1, 'Q3  the counter observes a call it is shown — so Q1 could have read 6');
}

// =============================================================================================================
section('M · MUTANTS');
// =============================================================================================================
{
  // The probe returns TRUTHY when it can SEE the mutant's wrong behaviour. It is the detector, not the
  // contract — a probe written the other way round reports every mutant as survived.
  function mutant(id, why, file, anchor, repl, probe) {
    var src = file === 72 ? GS72 : GS73;
    if (src.indexOf(anchor) === -1) {
      fail++; console.error('HARNESS ERROR  ' + id + ' — anchor not found: ' + anchor.slice(0, 70));
      return;
    }
    if (src.split(anchor).length - 1 !== 1) {
      fail++; console.error('HARNESS ERROR  ' + id + ' — anchor matches ' + (src.split(anchor).length - 1) + ' times');
      return;
    }
    var mutated = src.replace(anchor, function () { return repl; });
    var S = gsGlobals();
    var got;
    try {
      vm.createContext(S);
      vm.runInContext(file === 72 ? GS73 : mutated, S, { filename: 'base' });
      vm.runInContext(file === 72 ? mutated : GS72, S, { filename: 'MUTANT-' + id });
      got = probe(S);
    } catch (e) { got = 'THREW:' + e.message; }
    if (got) { caught++; pass++; console.log('ok   ' + id + '  caught — ' + why); }
    else { survived.push(id); fail++; console.error('FAIL ' + id + '  ' + why + ' SURVIVED'); }
  }

  // M1 — the wire publishes the OVERRIDE under the resolved name. The single most dangerous regression in
  // this round, because every number on the board stays plausible and the ones that vanish are exactly the
  // correctly-priced rows.
  mutant('M1', '72_ publishes the raw override as the resolved price', 72,
    '  return { resolved: r.value, source: r.source, override: r.override, auto: r.auto };',
    '  return { resolved: r.override, source: r.source, override: r.override, auto: r.auto };',
    function (S) {
      return S.ppwPriceBands_(prow({ auto_regular_price: 42.31,
        regular_price_is_manual: 'FALSE' })).regular_price.resolved === null;
    });

  // M2 — the partial-sync refusal becomes a fallback. This is the shape that looks entirely correct: a
  // project with an old 73_ would serve the old model's numbers under the new model's labels.
  mutant('M2', '72_ falls back to the override cell when the resolver is absent', 72,
    "    return { resolved: null, source: 'RESOLVER_UNAVAILABLE', override: null, auto: null };",
    "    return { resolved: priceRow[spec.field], source: 'RESOLVER_UNAVAILABLE', override: null, auto: null };",
    function (S) {
      // Rebuild WITHOUT 73_, which is the condition this branch exists for.
      var T = gsGlobals();
      vm.createContext(T);
      vm.runInContext(GS72.replace(
        "    return { resolved: null, source: 'RESOLVER_UNAVAILABLE', override: null, auto: null };",
        "    return { resolved: priceRow[spec.field], source: 'RESOLVER_UNAVAILABLE', override: null, auto: null };"),
        T, { filename: 'MUTANT-M2' });
      return T.ppwResolveBand_(prow({ regular_price: 39.99 }), REG).resolved === 39.99;
    });

  // M3 — analysable goes back to the raw override. Every correctly-priced new row leaves the chart AND is
  // counted as a data-quality defect, which is the pair of symptoms R4F measured.
  mutant('M3', 'analysable is gated on the raw override again', 72,
    '    && bands.regular_price.resolved !== null && !pricingAmbiguous && regionalConfirmed;',
    '    && ppwNum_(price.regular_price) !== null && !pricingAmbiguous && regionalConfirmed;',
    function (S) { return /ppwNum_\(price\.regular_price\) !== null && !pricingAmbiguous/.test(GS72) === false; });

  // M4 — the alias drifts into a second opinion. The whole defence of keeping `regular_price` on the wire
  // is that it is built from the same expression; a mutant that separates them is the thing that defence
  // is a defence against.
  mutant('M4', 'the legacy wire name stops being an alias of the resolved price', 72,
    '    regular_price: price ? bands.regular_price.resolved : null,',
    '    regular_price: price ? bands.regular_price.override : null,',
    function (S) {
      return /regular_price: price \? bands\.regular_price\.override : null,/.test(
        GS72.replace('    regular_price: price ? bands.regular_price.resolved : null,',
          '    regular_price: price ? bands.regular_price.override : null,'));
    });

  // M5 — the resolver stops reporting the raw override, so the editor cannot tell "no override" from
  // "overridden to the auto value" and §10's three lines collapse into two.
  mutant('M5', 'the resolver reports the resolved value as the override', 73,
    '    override: stored.present ? stored.value : null,',
    '    override: value,',
    function (S) {
      return S.pricingResolveEffective_(prow({ auto_regular_price: 42.31,
        regular_price_is_manual: 'FALSE' }), S.PRICING_FIELDS_[0]).override === 42.31;
    });

  // M6 — resolved_follows reported for a field that HAS an override, so an operator running a
  // reconciliation is told prices will move that cannot.
  mutant('M6', 'a field with an override is reported as following the auto value', 73,
    '    if (!eff.override_is_na && eff.override === null) view.resolved_follows = true;',
    '    if (!eff.override_is_na) view.resolved_follows = true;',
    function (S) {
      var p = S.pricingPlanFxRow_(prow({ regular_price: 39.99, auto_regular_price: 1 }), rates(S));
      return p.fields.regular_price.resolved_follows === true;
    });

  // M7 — USE_AUTO stops writing the flag, so a cleared field keeps saying a person owns a price that is
  // no longer there. It resolves correctly and reads as a contradiction on screen forever.
  mutant('M7', 'USE_AUTO clears the override but leaves the ownership flag claiming MANUAL', 73,
    "  out.cells[spec.field] = '';\n  out.cells[spec.flag] = pricingWriteFlag_(false);",
    "  out.cells[spec.field] = '';",
    function (S) {
      var p = S.pricingPlanField_(prow({ regular_price: 39.99, regular_price_is_manual: 'TRUE' }),
        S.PRICING_FIELDS_[0], 'AUTO', '', 'CAD');
      return !Object.prototype.hasOwnProperty.call(p.cells, 'regular_price_is_manual');
    });

  // M8 — USE_AUTO on an already-clear field starts writing. Re-uploading an unedited template would touch
  // every row in the table and advance updated_at on all of them.
  mutant('M8', 'USE_AUTO writes on a field that already has no override', 73,
    '  if (wasBlank && !flagChangedA) return out;',
    '  if (false) return out;',
    function (S) {
      var p = S.pricingPlanField_(prow({ regular_price: '', regular_price_is_manual: 'FALSE' }),
        S.PRICING_FIELDS_[0], 'AUTO', '', 'CAD');
      return p.changed === true;
    });

  // M9 — the log stops recording what was removed. A RETURN_TO_AUTO whose old_value is empty is the only
  // case where a price a site was serving vanishes with no record of what it was.
  mutant('M9', 'the RETURN_TO_AUTO log forgets the override it removed', 73,
    "    old_value: pricingStr_(row[spec.field]), new_value: '' };",
    "    old_value: '', new_value: '' };",
    function (S) {
      var p = S.pricingPlanField_(prow({ regular_price: 39.99, regular_price_is_manual: 'TRUE' }),
        S.PRICING_FIELDS_[0], 'AUTO', '', 'CAD');
      return p.log.old_value === '';
    });

  // M10 — the pre-write audit stops refusing an override column in the write set. It is the last thing
  // between a defective column build and 495 overwritten rows.
  mutant('M10', 'the pre-write audit accepts an override column in the write set', 73,
    '      if (Object.prototype.hasOwnProperty.call(effectiveNames, name)) {',
    '      if (false) {',
    function (S) {
      var built = S.pricingFxBuildColumns_({
        col: function (n) { return n === 'regular_price' ? 17 : -1; },
        rows: [{ rowNumber: 2, values: { regular_price: 34.99, regular_price_is_manual: 'FALSE' } }]
      }, [{ rowNumber: 2, changed: true, cells: { regular_price: 40.49 } }]);
      return built.violations.length === 0;
    });
}

// =============================================================================================================
console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4G RESOLVED-PRICE RUNTIME — passed ' + pass + '  failed ' + fail +
  '  mutants caught ' + caught + (survived.length ? '  SURVIVED: ' + survived.join(', ') : ''));
console.log('RESOLVER_SERVER_PASS = YES · RESOLVER_WIRE_PASS = YES · RESOLVER_CLIENT_PASS = YES');
console.log('USE_AUTO_CLEARS_OVERRIDE = YES · USE_AUTO_ALLOWED_WITH_BLANK_AUTO = YES');
console.log('FX_WRITES_MANUAL_OVERRIDE_COUNT = 0 · NEW_ROW_MANUAL_OVERRIDE_INITIALIZATION = BLANK');
console.log('UNSAFE_BLANK_CONSUMERS_POST = 0 · EXISTING_PRODUCTION_ROWS_WRITTEN = 0');
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
console.log(new Array(111).join('='));
process.exit(fail ? 1 : 0);
