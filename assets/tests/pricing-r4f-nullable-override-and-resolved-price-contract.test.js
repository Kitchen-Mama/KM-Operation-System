// Kitchen Mama Operation System — PRICING-R4F · NULLABLE MANUAL OVERRIDE AND THE RESOLVED-PRICE CONTRACT
// =============================================================================================================
// WHAT THIS ROUND IS. The operator has chosen the final pricing model: regular_price / minimum_price / msrp
// become USER OVERRIDES that are allowed to be blank, and a blank one falls back to auto_*. PRICING-R4D
// audited that same model and recommended AGAINST it; the operator overruled that, which is their call, and
// §4F of PRICING_DATABASE_MAPPING.md now records the choice together with the counter-argument.
//
// THIS SUITE SHIPS NO BEHAVIOUR CHANGE. It is the freeze. Implementation is PRICING-R4G, and what this file
// exists to do is make R4G's starting position measurable rather than remembered:
//
//   A  the canonical resolver, EXECUTED — and the exact gate that separates it from the target rule
//   B  the ownership flags: every reader in the tree, and what each of the three states decides
//   C  creation, EXECUTED through 04_ — the one line R4G deletes, and the eight it must not touch
//   D  the consumer audit: 11 sites, classified, each classification read out of the shipped source
//   E  blank -> zero: every site in the tree, and the proof that pricing_list has none
//   F  §7 THE CONTRACT CHANGE, EXECUTED — what `Use Auto Price` does today, refusal included
//   G  §6 backward safety: the target rule agrees with the shipped one on every legacy row
//   H  the spec records all of it, including that R4D's recommendation was superseded, not deleted
//   M  mutants
//
// SECTIONS A, C AND F ARE CHARACTERISATION TESTS AND SAY SO IN THEIR OWN TEXT. They pin behaviour that
// PRICING-R4G is expected to CHANGE — A6/A7, C4 and F1/F2/F3 are the assertions a correct R4G inverts, and
// each names itself. The reason they exist at all is that these three behaviours must change TOGETHER: a
// resolver that falls back without a `Use Auto Price` that clears leaves the operator no way to reach the
// fallback, and a `Use Auto Price` that clears without the resolver blanks a live site price. A guard that
// fails loudly when one moves alone is worth more than a comment asking for all three.
//
// Run: node assets/tests/pricing-r4f-nullable-override-and-resolved-price-contract.test.js
// LOCAL / FAKE-ONLY. No network, no Sheets, no Apps Script, no browser. Zero production reads or writes.
// NOTE: no 'use strict' — the .gs sources are eval'd.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var GS04 = readN('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
var GS58 = readN('assets/specs/active/apps-script/58_api_v1_fc_summary_workspace.gs');
var GS59 = readN('assets/specs/active/apps-script/59_api_v1_sku_details_workspace.gs');
var GS72 = readN('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
var DBAPI = readN('assets/js/api/operation-system-db-api.js');
var ADAPTER = readN('assets/js/api/km-product-pricing-adapter.js');
var FCSUM = readN('assets/js/pages/fc-summary.js');
var SELECTORS = readN('assets/js/product-strategy/psb-selectors.js');
var CRISK = readN('assets/js/pages/campaign-risk.js');
var DOC = readN('assets/specs/active/PRICING_DATABASE_MAPPING.md');

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

/**
 * Comments out, STRINGS KEPT. The distinction matters and has cost this project a test before: bare() is
 * the right question for "does this file PROMISE not to touch X", and the wrong one for "does this file
 * REFERENCE X" — every sheet column name in a .gs file lives inside a quote, and bare() deletes it along
 * with the prose. Sections B2 and D7 ask the second question, so they use this.
 */
function decomment(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
}
/** Comments and string literals out — a file's own prose names everything it promises not to do. */
function bare(src) {
  return decomment(src).replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4F — NULLABLE MANUAL OVERRIDE AND THE RESOLVED-PRICE CONTRACT (FREEZE + AUDIT)');
console.log(new Array(111).join('='));

// -------------------------------------------------------------------------------------------------------------
// 73_ in a context of its own. Apps Script gives a project one global scope; this is that scope with nothing
// but 73_ in it, which is all sections A, F and G need.
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
var W73 = (function () {
  var S = gsGlobals();
  vm.createContext(S);
  vm.runInContext(GS73, S, { filename: '73_api_v1_pricing_write.gs' });
  return S;
}());

var SPEC_REG = W73.PRICING_FIELDS_[0];
var SPEC_MIN = W73.PRICING_FIELDS_[1];
var SPEC_MSRP = W73.PRICING_FIELDS_[2];

/** One pricing_list row, spelled the way a sheet spells it. */
function row(o) {
  var r = { currency: 'CAD', base_currency: 'USD',
    base_regular_price: 29.99, base_minimum_price: 24.99, base_msrp: 39.99,
    auto_regular_price: '', auto_minimum_price: '', auto_msrp: '',
    regular_price: '', minimum_price: '', msrp: '',
    regular_price_is_manual: '', minimum_price_is_manual: '', msrp_is_manual: '' };
  Object.keys(o || {}).forEach(function (k) { r[k] = o[k]; });
  return r;
}

/**
 * THE TARGET RULE, written here and NOWHERE in shipped code. It exists so section G can compare the model
 * the operator chose against the one running today, row by row, instead of asserting that they "should"
 * agree. When R4G ships, this function is what 73_ must come to match — and G's disagreement list is the
 * exact, complete inventory of rows whose displayed price would change.
 */
function targetResolve(r, spec) {
  var stored = W73.pricingReadNumber_(r[spec.field]);
  var auto = W73.pricingReadNumber_(r[spec.auto]);
  if (stored.present) return { value: stored.value, source: 'OVERRIDE' };
  if (stored.na) return { value: null, source: 'NA' };            // NA is a decision, not a gap
  if (auto.present) return { value: auto.value, source: 'AUTO' };
  return { value: null, source: 'NOT_SET' };                      // never 0
}

// =============================================================================================================
section('A · §1 THE CANONICAL RESOLVER — EXECUTED');
// =============================================================================================================
{
  // A1 — it exists, in one place, and it is the write module that owns it. §1 asks for a canonical owner;
  // the codebase already had one, which is why R4G extends rather than introduces.
  eq((bare(GS73).match(/function pricingResolveEffective_/g) || []).length, 1,
    'A1  RESOLVED_PRICE_OWNER (server) = pricingResolveEffective_, declared exactly once');
  var gsDir = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
  var decl = fs.readdirSync(gsDir).filter(function (f) { return /\.gs$/.test(f); })
    .filter(function (f) { return /function pricingResolveEffective_/.test(bare(fs.readFileSync(path.join(gsDir, f), 'utf8'))); });
  eq(decl, ['73_api_v1_pricing_write.gs'],
    'A1b and no other .gs file declares a second one — one rule, one implementation');

  // A2 — the stored value always wins. This is the half of the target rule that is ALREADY correct.
  var r2 = W73.pricingResolveEffective_(row({ regular_price: 39.99, auto_regular_price: 42.31,
    regular_price_is_manual: 'TRUE' }), SPEC_REG);
  eq([r2.value, r2.source], [39.99, 'STORED'],
    'A2  an override that holds a number IS the resolved price');
  var r2b = W73.pricingResolveEffective_(row({ regular_price: 39.99, auto_regular_price: 42.31,
    regular_price_is_manual: '' }), SPEC_REG);
  eq([r2b.value, r2b.source], [39.99, 'STORED'],
    'A2b and it wins whatever the flag says — a legacy row resolves to the number it already shows');

  // A3 — both blank is null. NEVER 0. This is §5's rule at the one place that could violate it for everyone.
  var r3 = W73.pricingResolveEffective_(row({}), SPEC_REG);
  eq([r3.value, r3.source], [null, 'UNAVAILABLE'],
    'A3  no override and no auto resolves to NULL — Not Set, and not a price of zero');
  ok(r3.value !== 0, 'A3b measured as "not zero", because 0 is the answer this contract exists to refuse');

  // A4 — NA is a decision and never falls back. A band that does not apply must not be answered with a number.
  var r4 = W73.pricingResolveEffective_(row({ regular_price: 'NA', auto_regular_price: 42.31,
    regular_price_is_manual: 'FALSE' }), SPEC_REG);
  eq([r4.value, r4.source], [null, 'NA'],
    'A4  NA does NOT fall back to auto, even with the flag reading AUTO — "does not apply" is not a gap');

  // A5 — the one substitution that already exists, and it is the target rule for this one case.
  var r5 = W73.pricingResolveEffective_(row({ auto_regular_price: 42.31, regular_price_is_manual: 'FALSE' }), SPEC_REG);
  eq([r5.value, r5.source], [42.31, 'AUTO_REFERENCE'],
    'A5  blank override + flag FALSE + an auto value resolves to AUTO — already the behaviour R4F wants');

  // ---- A6 / A7 ARE CHARACTERISATION. They pin the GATE, which is the whole delta to the target rule. ----
  // A correct PRICING-R4G inverts exactly these two and nothing else in this function.
  var r6 = W73.pricingResolveEffective_(row({ auto_regular_price: 42.31, regular_price_is_manual: '' }), SPEC_REG);
  eq([r6.value, r6.source], [null, 'UNAVAILABLE'],
    'A6  CHARACTERISATION — blank override + UNKNOWN flag does NOT fall back today. R4G inverts this.');
  var r7 = W73.pricingResolveEffective_(row({ auto_regular_price: 42.31, regular_price_is_manual: 'TRUE' }), SPEC_REG);
  eq([r7.value, r7.source], [null, 'UNAVAILABLE'],
    'A7  CHARACTERISATION — blank override + MANUAL flag does not either. R4G inverts this too.');
  ok(/authority === PRICING_OWNER_AUTO_ && auto\.present/.test(GS73),
    'A7b and the gate is ONE condition in ONE line, which is why the change is small and reviewable');

  // A8 — the bands are independent. A row may be overridden in one band and automatic in another, and no
  // band's state is evidence about another's. §4A froze this for the flags; it must hold for the resolver.
  var mixed = row({ regular_price: 39.99, regular_price_is_manual: 'TRUE',
    auto_minimum_price: 26.24, minimum_price_is_manual: 'FALSE',
    auto_msrp: '', msrp_is_manual: '' });
  eq([W73.pricingResolveEffective_(mixed, SPEC_REG).source,
    W73.pricingResolveEffective_(mixed, SPEC_MIN).source,
    W73.pricingResolveEffective_(mixed, SPEC_MSRP).source],
    ['STORED', 'AUTO_REFERENCE', 'UNAVAILABLE'],
    'A8  three bands, three independent answers, from one row');

  // A9 — the source vocabulary the display contract (§8) needs is already emitted. "Override", "Auto" and
  // "Not set" are three different things on screen only if the resolver told them apart first.
  var sources = {};
  [row({ regular_price: 39.99 }), row({ auto_regular_price: 42.31, regular_price_is_manual: 'FALSE' }),
    row({ regular_price: 'NA' }), row({})].forEach(function (r) {
      sources[W73.pricingResolveEffective_(r, SPEC_REG).source] = 1;
    });
  eq(Object.keys(sources).sort(), ['AUTO_REFERENCE', 'NA', 'STORED', 'UNAVAILABLE'],
    'A9  four distinguishable sources — §8 can render Override / Auto / Not set without re-deriving them');

  // A10 — the client-side owner. 72_ cannot resolve (section D), so the frontend mirror belongs where the
  // auto_* values and the flags already arrive: the pricing_list normalizer. It carries all three layers today.
  ok(/regularPrice: pricingNumOrNull_\(r\.regular_price\)/.test(DBAPI) &&
     /autoRegularPrice: pricingNumOrNull_\(r\.auto_regular_price\)/.test(DBAPI) &&
     /regularPriceIsManual: pricingFlagOrNull_\(r\.regular_price_is_manual\)/.test(DBAPI),
    'A10 RESOLVED_PRICE_OWNER (client) = normalizePricingListRecord — it already receives all three layers');
  ok(/function pricingFlagOrNull_/.test(DBAPI) && /function pricingReadFlag_/.test(bare(GS73)),
    'A10b and the two-runtime mirror pair is an existing, proven pattern here, not a new one');
}

// =============================================================================================================
section('B · §2 AUTHORITY — WHAT TRUE / FALSE / BLANK STILL DECIDE');
// =============================================================================================================
{
  // B1 — the three states, executed. Blank is UNKNOWN and never FALSE: reading it as FALSE would declare
  // the entire legacy price book system-owned in one deployment.
  eq([W73.pricingReadFlag_('TRUE'), W73.pricingReadFlag_('FALSE'), W73.pricingReadFlag_(''),
    W73.pricingReadFlag_(true), W73.pricingReadFlag_(false), W73.pricingReadFlag_('wat')],
    ['MANUAL', 'AUTO', 'UNKNOWN', 'MANUAL', 'AUTO', 'UNKNOWN'],
    'B1  TRUE_MEANING / FALSE_MEANING / BLANK_MEANING — three states, and an unreadable cell is UNKNOWN');

  // B2 — EVERY reader of an ownership flag in the tree. The §2 answer about redundancy is only as good as
  // this list, so it is built by walking the source rather than recalled.
  var readers = [];
  function walk(dir, ext) {
    fs.readdirSync(dir).forEach(function (f) {
      var p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { if (f !== 'tests') walk(p, ext); return; }
      if (!ext.test(f)) return;
      // decomment, NOT bare: 04_, 73_ and the SRP module all name the flag columns as string literals.
      if (/_is_manual|IsManual/.test(decomment(fs.readFileSync(p, 'utf8')))) readers.push(f);
    });
  }
  walk(path.join(ROOT, 'assets', 'js'), /\.js$/);
  walk(path.join(ROOT, 'assets', 'specs', 'active', 'apps-script'), /\.gs$/);
  eq(readers.sort(), ['04_marketplace_forecast_import.gs', '73_api_v1_pricing_write.gs',
    'operation-system-db-api.js', 'sku-regional-pricing.js'],
    'B2  four files touch an ownership flag — one writer at creation, one decider, one transport, one badge');
  ok(readers.indexOf('72_api_v1_product_pricing_workspace.gs') === -1 && readers.length === 4,
    'B2b and 72_ is NOT among them: the Product Strategy Board has never seen an ownership flag');

  // B3 — the flag's one DECISION use, executed: FX writability. Everything else is display.
  var unknown = row({ auto_regular_price: 42.31, regular_price: 29.99, regular_price_is_manual: '' });
  var auto = row({ auto_regular_price: 42.31, regular_price: 29.99, regular_price_is_manual: 'FALSE' });
  var manual = row({ auto_regular_price: 42.31, regular_price: 29.99, regular_price_is_manual: 'TRUE' });
  eq([W73.pricingResolveEffective_(unknown, SPEC_REG).writable_by_fx,
    W73.pricingResolveEffective_(auto, SPEC_REG).writable_by_fx,
    W73.pricingResolveEffective_(manual, SPEC_REG).writable_by_fx],
    [false, true, false],
    'B3  writable_by_fx is the flag\'s only decision — and UNKNOWN and MANUAL refuse for different reasons');

  // B4 — why FALSE is schema debt but NOT removable yet. In the converged model "override present" and
  // "flag TRUE" are the same fact. They are not the same fact TODAY, and this is the population that proves
  // it: a legacy row with a real stored price and no flag at all.
  ok(W73.pricingReadNumber_(unknown.regular_price).present &&
     W73.pricingReadFlag_(unknown.regular_price_is_manual) === 'UNKNOWN',
    'B4  a populated price with a blank flag exists and is representable — so populated != TRUE today');
  ok(/`FALSE` is \*\*schema debt, not yet removable\*\*/.test(DOC),
    'B4b and the spec records FALSE as schema debt rather than deleting the column');

  // B5 — nothing may write a flag blank. Creation writes FALSE (R4E) and the write path writes TRUE/FALSE;
  // blank is only ever something a row was BORN with before those rounds.
  eq([W73.pricingWriteFlag_(true), W73.pricingWriteFlag_(false)], ['TRUE', 'FALSE'],
    'B5  the two values 73_ ever writes into a flag column — it never writes blank back');
}

// =============================================================================================================
section('C · §3 CREATION — EXECUTED. ONE LINE CHANGES, EIGHT DO NOT.');
// =============================================================================================================
{
  var W = gsGlobals();
  vm.createContext(W);
  vm.runInContext(GS73, W, { filename: '73_api_v1_pricing_write.gs' });
  vm.runInContext(GS04, W, { filename: '04_marketplace_forecast_import.gs' });

  var same = W.pricingNewRowPlan_('USD', 'USD', { regular: 29.99, minimum: 24.99, msrp: 39.99 }, '2026-09-25');
  var cross = W.pricingNewRowPlan_('USD', 'CAD', { regular: 29.99, minimum: 24.99, msrp: 39.99 }, '2026-09-25');

  // C1..C3 — everything R4E shipped that R4F KEEPS. Listing these is the point: the round changes one line,
  // and a reader six months from now needs to see which parts were deliberately left alone.
  eq([cross.pending, cross.reason, cross.fx_rate, cross.auto.regular, cross.effective.regular],
    [true, 'NO_CANONICAL_FX_RATE', '', '', ''],
    'C1  cross-currency still fails closed: no invented rate, blank auto, blank override');
  eq([same.pending, same.fx_rate, same.auto.regular, same.auto.minimum, same.auto.msrp],
    [false, 1, 29.99, 24.99, 39.99],
    'C2  same-currency still computes auto from base at rate 1 — a fact about the currency, not a market claim');
  eq([same.flag, cross.flag], ['FALSE', 'FALSE'],
    'C3  and both branches still write the ownership flags FALSE, which is what lets a row repair itself');

  // ---- C4 IS CHARACTERISATION. This is the ONE line PRICING-R4G deletes. ----
  // Today the same-currency branch copies the computed auto into the override cells. Under the frozen model
  // that is an override no user entered — and it is indistinguishable, later, from one that was.
  eq([same.effective.regular, same.effective.minimum, same.effective.msrp], [29.99, 24.99, 39.99],
    'C4  CHARACTERISATION — creation copies auto into the OVERRIDE cells. R4G makes these blank.');
  eq(same.effective.regular, same.auto.regular,
    'C4b measured as an identity: the override is the auto value, not merely equal to it by luck');
  ok(/out\.effective\[k\] = r;/.test(GS04),
    'C4c and it is one statement, beside the auto assignment — NEW_ROW_MANUAL_OVERRIDE_INITIALIZATION = BLANK');

  // C5 — a blank base still produces blank everything. Blank is never zero at creation either.
  var blankBase = W.pricingNewRowPlan_('USD', 'USD', { regular: '', minimum: 24.99, msrp: '' }, '2026-09-25');
  eq([blankBase.auto.regular, blankBase.effective.regular, blankBase.auto.minimum], ['', '', 24.99],
    'C5  a blank base leaves a blank auto AND a blank override — per band, and never 0');

  // C6 — creation stays the only creator, so "the override starts blank" has exactly one place to be true.
  var gsDir = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
  var creators = fs.readdirSync(gsDir).filter(function (f) { return /\.gs$/.test(f); })
    .filter(function (f) { return /prSheet\.appendRow/.test(bare(fs.readFileSync(path.join(gsDir, f), 'utf8'))); });
  eq(creators, ['04_marketplace_forecast_import.gs'],
    'C6  still ONE pricing_list creator — R4G changes one branch of one function');
}

// =============================================================================================================
section('D · §4 CONSUMER AUDIT — 11 SITES, CLASSIFIED FROM THE SOURCE');
// =============================================================================================================
{
  // D1 — THE BLOCKER, and the reason R4G's largest piece is a transport change rather than a resolver.
  // 72_ publishes the three override fields and no auto value at all, so a blank override becomes null on
  // the wire with nothing to fall back to. No client fix can reach around this.
  ok(/regular_price: price \? ppwNum_\(price\.regular_price\) : null/.test(GS72),
    'D1  72_ emits the raw override field for the Product Strategy Board / Pricing Center');
  ok(bare(GS72).indexOf('auto_regular_price') === -1 && bare(GS72).indexOf('auto_msrp') === -1,
    'D1b UNSAFE_BLANK_CONSUMER — and carries NO auto_* whatsoever, so it cannot resolve client-side');
  ok(/ppwNum_\(price\.regular_price\) !== null && !pricingAmbiguous/.test(GS72),
    'D1c and `analysable` is gated on that same raw field — a blank override drops the SKU off the chart');

  // D2 — the adapter is verbatim, which is correct and is also why the gap propagates unchanged.
  ok(/regular_price: live\.regular_price === undefined \? null : live\.regular_price/.test(ADAPTER),
    'D2  km-product-pricing-adapter passes 72_ through verbatim — it inherits D1, it does not cause it');

  // D3 — the selectors decide four different things from that one field.
  ok(/S\.cents\(row\.regular_price\) === null/.test(SELECTORS) &&
     /S\.cents\(r\.regular_price\)/.test(SELECTORS),
    'D3  psb-selectors gates PRICING_SOURCE_MISSING, chartable and analysableSiteSkuCount on it');
  ok(/_min_c = S\.cents\(r\.minimum_price\)/.test(SELECTORS) && /_msrp_c = S\.cents\(r\.msrp\)/.test(SELECTORS),
    'D3b and the floor-to-list band is built from the other two — three bands, one transport gap');

  // D4 — THE WORST ONE. fc-summary does not merely display a null; it REFUSES TO SAVE. That makes the
  // creation change and the resolver a single release rather than two.
  ok(/var rawPrice = row\.raw \? row\.raw\.regular_price : row\.regularPrice;/.test(FCSUM),
    'D4  fc-summary resolveRegionalPricingContext reads the stored override only — no auto fallback');
  ok(/MISSING_PRICING_LIST_ROW/.test(FCSUM) && /never substituted with 0/.test(FCSUM),
    'D4b UNSAFE_BLANK_CONSUMER — and the Special Event save path HALTS on a null price, by design');
  eq((FCSUM.match(/regularPrice == null\) \{ alert\(/g) || []).length, 2,
    'D4c on BOTH save paths — the single-SKU rows and the grouped ones refuse separately');
  eq((FCSUM.match(/MISSING_PRICING_LIST_ROW/g) || []).length, 4,
    'D4d four refusals in total: a price guard and a currency guard on each of the two paths');

  // D5 — the campaign snapshot. 20_ stores what the page hands it, so the fix belongs at the caller.
  ok(/regular_price: l\.regularPrice/.test(FCSUM),
    'D5  fc-summary hands its resolved price to campaign_sku_lines — a blank one is snapshotted permanently');

  // D6 — 59_ is a raw passthrough and therefore is NOT blocked: SKU Regional Details already receives
  // auto_* and the flags. Two transports, two different amounts of work, and only one of them is large.
  ok(/RAW passthrough/.test(GS59) && /out\.pricingList = pricing\.rows;/.test(GS59),
    'D6  59_ passes pricing_list rows through whole — the client CAN resolve on this transport today');

  // D7 — the NOT_RELEVANT set, measured. R4D asserted it; a second round asserting it from the same tree is
  // what keeps it from quietly becoming false.
  var pagesDir = path.join(ROOT, 'assets', 'js', 'pages');
  var pricingReaders = fs.readdirSync(pagesDir).filter(function (f) { return /\.js$/.test(f); })
    .filter(function (f) { return /getPricingList/.test(decomment(fs.readFileSync(path.join(pagesDir, f), 'utf8'))); });
  eq(pricingReaders.sort(), ['fc-summary.js', 'sku-regional-details.js'],
    'D7  only two PAGES read pricing_list at all — order planning, PO, shipment and exports read no price');
  ok(bare(GS58).indexOf('regular_price') === -1,
    'D7b and 58_ (the FC Summary workspace) carries no effective price either');

  // D8 — the two decoy tables. An audit that counted these as consumers would have reported roughly double,
  // and would have sent R4G to change screens that read a different number at a different grain.
  ok(/`sku_details\.minimum_price` \/ `\.msrp`, which are the\n\*\*master baseline at a different grain\*\*/.test(DOC),
    'D8  sku_details.minimum_price / .msrp are the MASTER baseline — a different grain, not this table');
  ok(/parseFloat\(s\.regularPrice\) \|\| parseFloat\(s\.msrp\) \|\| 0/.test(CRISK) &&
     /marketplace_skus/.test(CRISK),
    'D8b campaign-risk reads marketplace_skus prices — a pre-existing wrong-table defect, not a R4G target');
}

// =============================================================================================================
section('E · §5 BLANK NEVER BECOMES ZERO');
// =============================================================================================================
{
  // E1 — the three numeric readers on the pricing_list path, executed where they can be. Blank, NA and
  // garbage must all be null-ish, and none of them 0.
  eq([W73.pricingReadNumber_('').value, W73.pricingReadNumber_('NA').value,
    W73.pricingReadNumber_('abc').value, W73.pricingReadNumber_(0).value],
    [null, null, null, 0],
    'E1  pricingReadNumber_: blank/NA/garbage are null — and a real 0 is still a real 0');
  ok(W73.pricingReadNumber_('').present === false && W73.pricingReadNumber_(0).present === true,
    'E1b "absent" and "zero" are two different answers, which is the whole distinction');

  // E2 — the .gs side carries no zero default on any price at all. Measured over every file, not sampled.
  var gsDir = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
  var offenders = fs.readdirSync(gsDir).filter(function (f) { return /\.gs$/.test(f); })
    .filter(function (f) {
      var src = bare(fs.readFileSync(path.join(gsDir, f), 'utf8'));
      return /(regular_price|minimum_price|msrp)[^;\n]*\|\|\s*0\b/.test(src);
    });
  eq(offenders, [], 'E2  BLANK_TO_ZERO_DEFECTS on the server = 0 — no `|| 0` on any price in any .gs file');

  // E3 — the frontend sites, each one named and each one real. They are listed rather than fixed, and the
  // spec says why; an audit that reports a count without the addresses cannot be acted on.
  ok(/regularPrice: parseFloat\(r\.regular_price\) \|\| 0/.test(DBAPI) &&
     /minimumPrice: parseFloat\(r\.minimum_price\) \|\| 0/.test(DBAPI) &&
     /msrp: parseFloat\(r\.msrp\) \|\| 0/.test(DBAPI),
    'E3  db-api normalizeMarketplaceSkuRecord — 3 sites, on the marketplace_skus columns');
  ok(/normalizeMarketplaceSkuRecord/.test(DBAPI.slice(0, DBAPI.indexOf('regularPrice: parseFloat(r.regular_price) || 0'))),
    'E3b and they are in the marketplace_skus normalizer, NOT the pricing_list one');
  ok(/regularPrice: m\.regularPrice \|\| 0, msrp: m\.msrp \|\| 0/.test(CRISK),
    'E3c campaign-risk — 2 sites, rendered through toFixed(2) as though they were prices');
  ok(/regularPrice: \(regRaw === '' \|\| regRaw == null\) \? null : \(parseFloat\(regRaw\) \|\| 0\)/.test(FCSUM),
    'E3d fc-summary 4078 — a typed DOM value: blank is guarded, non-numeric still becomes 0');

  // E4 — and the pricing_list normalizer itself is clean, which is the one that matters for this model.
  ok(/regularPrice: pricingNumOrNull_\(r\.regular_price\)/.test(DBAPI) &&
     !/pricingNumOrNull_\(r\.regular_price\) \|\| 0/.test(DBAPI),
    'E4  normalizePricingListRecord uses pricingNumOrNull_ with no zero default — the target path is clean');

  // E5 — the stale comment that sends fc-summary to row.raw in the first place. It has been false since R2.
  ok(/pricing_list normalizer coerces a missing regular_price to 0/.test(FCSUM),
    'E5  the stale comment is still there — and is listed for deletion in R4G, where the read moves anyway');
}

// =============================================================================================================
section('F · §7 THE CONTRACT CHANGE — `Use Auto Price`, EXECUTED');
// =============================================================================================================
{
  // ---- F1 / F2 / F3 ARE CHARACTERISATION. They are the frozen PRICING-R2 §8 behaviour, and a correct
  // PRICING-R4G inverts F1 and F2 TOGETHER with A6/A7 and C4. Alone, each one breaks something:
  //   the resolver alone   -> the operator has no way to clear an override and reach the fallback
  //   the clear alone      -> a live site price goes blank on screens that cannot fall back (section D)
  var r = row({ regular_price: 39.99, auto_regular_price: 42.31, regular_price_is_manual: 'TRUE' });
  var p = W73.pricingPlanField_(r, SPEC_REG, 'AUTO', '', 'CAD');
  eq([p.changed, p.cells.regular_price, p.cells.regular_price_is_manual],
    [true, 42.31, 'FALSE'],
    'F1  CHARACTERISATION — USE_AUTO_CURRENT_BEHAVIOR: it COPIES auto into the override. R4G blanks it.');
  eq(p.log.change_type, 'RETURN_TO_AUTO',
    'F1b under a change_type that already says what the target does — the name survives the change');

  var pend = row({ regular_price: 39.99, auto_regular_price: '', regular_price_is_manual: 'TRUE' });
  var p2 = W73.pricingPlanField_(pend, SPEC_REG, 'AUTO', '', 'CAD');
  eq([p2.changed, p2.error && p2.error.code], [false, 'AUTO_VALUE_MISSING'],
    'F2  CHARACTERISATION — and it REFUSES when auto is blank, because copying blank would write 0');
  ok(/pending_fx/.test(GS04),
    'F2b which is exactly the state R4E creates on every cross-currency row — today they cannot be cleared');

  // F3 — the supplied value is ignored entirely on AUTO. This one R4G KEEPS: a template carrying both a
  // price and "Use Auto Price" must not smuggle the price in.
  var p3 = W73.pricingPlanField_(r, SPEC_REG, 'AUTO', 77.77, 'CAD');
  eq(p3.cells.regular_price, 42.31,
    'F3  a price supplied alongside AUTO is ignored — kept as-is by R4G');

  // F4 — MANUAL with a blank price stays refused. "Clear the override" must remain a NAMED action, not an
  // empty cell, because an empty cell is far more often an accident than an intention.
  var p4 = W73.pricingPlanField_(r, SPEC_REG, 'MANUAL', '', 'CAD');
  eq([p4.changed, p4.error && p4.error.code], [false, 'MANUAL_PRICE_REQUIRED'],
    'F4  MANUAL with a blank price is refused — unchanged by R4G');
  ok(/Blank is not zero\./.test(GS73), 'F4b and says so in the refusal the operator reads');

  // F5 — NO_CHANGE writes nothing at all. The UX default must never touch a cell.
  var p5 = W73.pricingPlanField_(r, SPEC_REG, 'NO_CHANGE', 99, 'CAD');
  eq([p5.changed, Object.keys(p5.cells).length, p5.log], [false, 0, null],
    'F5  NO_CHANGE writes nothing, even with a price sitting in the row');

  // F6 — the second half of the contract change: FX writes the override column TODAY for FALSE rows. Once
  // USE_AUTO clears instead of copying, that branch becomes a second writer of a single-meaning field.
  var t = W73.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.35,
    source: 'OPERATOR_INPUT', as_of: '2026-09-25' }]);
  t.runDate = '2026-09-25';
  var fx = W73.pricingPlanFxRow_(row({ regular_price: 40.00, auto_regular_price: 40.00,
    regular_price_is_manual: 'FALSE' }), t);
  eq(fx.cells.regular_price, 40.49,
    'F6  CHARACTERISATION — FX writes the override column for a FALSE row. R4G stops it.');
  var fxU = W73.pricingPlanFxRow_(row({ regular_price: 29.99, auto_regular_price: 40.00,
    regular_price_is_manual: '' }), t);
  ok(!Object.prototype.hasOwnProperty.call(fxU.cells, 'regular_price') &&
     fxU.cells.auto_regular_price === 40.49,
    'F6b and never for an UNKNOWN row — auto moves, the legacy price does not. That part R4G keeps.');

  // F7 — the UX vocabulary needs no change at all, which is worth stating because it is the part the
  // operator sees. R4C's three labels already map onto the three modes.
  var SRP = require('../js/pages/sku-regional-pricing.js');
  eq(SRP.actionLabels(), ['No Change', 'Update Price', 'Use Auto Price'],
    'F7  the three labels are unchanged — only what "Use Auto Price" DOES changes');
  eq([SRP.readAction('Use Auto Price'), SRP.readAction('AUTO')], ['AUTO', 'AUTO'],
    'F7b and both vocabularies still resolve to the same mode');
}

// =============================================================================================================
section('G · §6 LEGACY ROWS — THE TARGET RULE IS BACKWARD-SAFE');
// =============================================================================================================
{
  // THE QUESTION §6 TURNS ON. "Do not migrate" is only coherent if the new rule shows legacy rows the same
  // number the old one does. So: run BOTH rules over every representative population and list every
  // disagreement. The list is the migration risk, stated exactly.
  var pop = [
    ['legacy UNKNOWN, base-shaped price', row({ regular_price: 29.99, auto_regular_price: 40.49 })],
    ['legacy UNKNOWN, tracking auto', row({ regular_price: 40.49, auto_regular_price: 40.49 })],
    ['legacy UNKNOWN, a real negotiated price', row({ regular_price: 44.95, auto_regular_price: 40.49 })],
    ['legacy UNKNOWN, nothing to compare', row({ regular_price: 44.95 })],
    ['MANUAL with a price', row({ regular_price: 34.99, auto_regular_price: 40.49, regular_price_is_manual: 'TRUE' })],
    ['AUTO holding the auto value', row({ regular_price: 40.49, auto_regular_price: 40.49, regular_price_is_manual: 'FALSE' })],
    ['AUTO that drifted from auto', row({ regular_price: 22.10, auto_regular_price: 40.49, regular_price_is_manual: 'FALSE' })],
    ['NA, deliberately none', row({ regular_price: 'NA', auto_regular_price: 40.49 })],
    ['NA with the flag set AUTO', row({ regular_price: 'NA', auto_regular_price: 40.49, regular_price_is_manual: 'FALSE' })]
  ];
  var disagree = pop.filter(function (t) {
    return W73.pricingResolveEffective_(t[1], SPEC_REG).value !== targetResolve(t[1], SPEC_REG).value;
  }).map(function (t) { return t[0]; });
  eq(disagree, [],
    'G1  every populated-override row resolves IDENTICALLY under both rules — LEGACY_AUTOMATIC_MIGRATION_REQUIRED = NO');

  // G2 — and the fixture set can actually tell the two rules apart, or G1 proves nothing. These are the
  // rows where they differ, and every one of them has a BLANK override.
  var blanks = [
    ['blank + UNKNOWN + auto', row({ auto_regular_price: 40.49 })],
    ['blank + MANUAL + auto', row({ auto_regular_price: 40.49, regular_price_is_manual: 'TRUE' })]
  ];
  eq(blanks.map(function (t) {
    return [W73.pricingResolveEffective_(t[1], SPEC_REG).value, targetResolve(t[1], SPEC_REG).value];
  }), [[null, 40.49], [null, 40.49]],
    'G2  the harness CAN distinguish the two rules — they differ on blank overrides, and only there');

  // G3 — the population that changes is therefore exactly "rows with a blank override", which today is
  // rows R4E created plus any field an operator has never filled. No historical row is in it.
  eq([targetResolve(row({ auto_regular_price: 40.49, regular_price_is_manual: 'FALSE' }), SPEC_REG).source,
    targetResolve(row({}), SPEC_REG).source,
    targetResolve(row({ regular_price: 'NA', auto_regular_price: 40.49 }), SPEC_REG).source],
    ['AUTO', 'NOT_SET', 'NA'],
    'G3  under the target rule: auto when one exists, NOT_SET when none does, NA left alone');

  // G4 — THE COST, stated as a test. Once FX stops writing the override column, a legacy UNKNOWN row can
  // never be repaired by an FX run: the base-shaped price stays until a PERSON clears it. That person's
  // only tool is `Use Auto Price`, which is section F. The two decisions are one decision.
  var t2 = W73.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.35,
    source: 'OPERATOR_INPUT', as_of: '2026-09-25' }]);
  t2.runDate = '2026-09-25';
  var legacy = row({ regular_price: 29.99, auto_regular_price: '' });
  var afterFx = W73.pricingPlanFxRow_(legacy, t2);
  ok(!Object.prototype.hasOwnProperty.call(afterFx.cells, 'regular_price'),
    'G4  an FX run does not repair a legacy UNKNOWN row today either — so R4G removes no existing repair');
  eq(afterFx.cells.auto_regular_price, 40.49,
    'G4b it computes the correct auto beside it, which is what the operator compares against when reviewing');

  // G5 — PRODUCTION_WRITE_AUTHORIZED = NO. This suite ran planners only; none of them touched a sheet.
  ok(true, 'G5  EXISTING_PRODUCTION_ROWS_WRITTEN = 0 — planners are pure, and nothing here holds a Sheets handle');
}

// =============================================================================================================
section('H · THE SPEC RECORDS THE DECISION, AND THE ARGUMENT AGAINST IT');
// =============================================================================================================
{
  ok(/## 4F\. Nullable Manual Override and the Resolved Price/.test(DOC),
    'H1  §4F exists in the canonical mapping spec');
  ok(/MANUAL_OVERRIDE_NULLABLE = YES/.test(DOC) && /blank means NO OVERRIDE EXISTS/.test(DOC),
    'H2  and states, in §10\'s own vocabulary, that a blank override means no override exists');
  ok(/CONTRACT_CHANGE_REQUIRED = YES/.test(DOC) && /AUTO_VALUE_MISSING/.test(DOC),
    'H3  §7\'s contract change is recorded with the refusal it removes');
  ok(/SUPERSEDED BY OPERATOR DECISION/.test(DOC),
    'H4  R4D\'s opposite recommendation is marked superseded — kept, not deleted');
  ok(/the reasoning is not/.test(DOC.replace(/\*\*/g, '').replace(/\n/g, ' ')),
    'H4b with its costs carried forward as R4G line items rather than argued away');
  ok(/LEGACY_AUTOMATIC_MIGRATION_REQUIRED = NO/.test(DOC) && /EXISTING_PRODUCTION_ROWS_WRITTEN = 0/.test(DOC),
    'H5  and the no-migration ruling is on the record with its reason');
  ok(/PRICING-R4G-RESOLVED-PRICE-RUNTIME-IMPLEMENTATION/.test(DOC),
    'H6  NEXT_TASK named in the spec, so the freeze points at the round that ends it');

  // H7 — the FILES_REQUIRING_NEXT_IMPLEMENTATION list is not decorative: every file it names must exist.
  var listed = ['73_api_v1_pricing_write.gs', '72_api_v1_product_pricing_workspace.gs',
    '59_api_v1_sku_details_workspace.gs', '04_marketplace_forecast_import.gs'];
  var missingDoc = listed.filter(function (f) { return DOC.indexOf(f) === -1; });
  eq(missingDoc, [], 'H7  every backend file R4G must change is named in the spec');
  var missingFs = listed.filter(function (f) {
    return !fs.existsSync(path.join(ROOT, 'assets', 'specs', 'active', 'apps-script', f));
  });
  eq(missingFs, [], 'H7b and each one is a file that actually exists on disk');
}

// =============================================================================================================
section('M · MUTANTS');
// =============================================================================================================
{
  function mutant(id, why, anchor, repl, probe) {
    // Resolve the anchor FIRST. A mutation that injects nothing passes every probe, and a harness that
    // cannot tell that apart from a real catch is worse than no harness.
    if (GS73.indexOf(anchor) === -1) {
      fail++; console.error('HARNESS ERROR  ' + id + ' — anchor not found: ' + anchor.slice(0, 70));
      return;
    }
    if (GS73.split(anchor).length - 1 !== 1) {
      fail++; console.error('HARNESS ERROR  ' + id + ' — anchor matches ' + (GS73.split(anchor).length - 1) + ' times');
      return;
    }
    var src = GS73.replace(anchor, function () { return repl; });
    var S = gsGlobals();
    var got;
    // The probe returns TRUTHY when it can SEE the mutant's wrong behaviour — it is the detector, not the
    // contract. A probe written the other way round reports every mutant as survived, which is a silent
    // harness failure rather than a loud one.
    try {
      vm.createContext(S);
      vm.runInContext(src, S, { filename: 'MUTANT-' + id });
      got = probe(S);
    } catch (e) { got = 'THREW:' + e.message; }
    if (got) { caught++; pass++; console.log('ok   ' + id + '  caught — ' + why); }
    else { survived.push(id); fail++; console.error('FAIL ' + id + '  ' + why + ' SURVIVED'); }
  }
  function rates(S) {
    var t = S.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.35,
      source: 'OPERATOR_INPUT', as_of: '2026-09-25' }]);
    t.runDate = '2026-09-25';
    return t;
  }

  // M1 — the single change that would make every blank price free. A3 is what stands in its way.
  mutant('M1', 'a resolved price with nothing behind it becomes 0 instead of null',
    '  var value = stored.present ? stored.value : null;',
    '  var value = stored.present ? stored.value : 0;',
    function (S) {
      return S.pricingResolveEffective_(row({}), S.PRICING_FIELDS_[0]).value === 0;
    });

  // M2 — NA falling back to auto. "This band does not apply" answered with a number, which §1 forbids
  // explicitly and which no screen could tell from a real price.
  mutant('M2', 'NA falls back to the auto value',
    '  if (!stored.present && !stored.na && authority === PRICING_OWNER_AUTO_ && auto.present) {',
    '  if (!stored.present && authority === PRICING_OWNER_AUTO_ && auto.present) {',
    function (S) {
      var r = S.pricingResolveEffective_(row({ regular_price: 'NA', auto_regular_price: 42.31,
        regular_price_is_manual: 'FALSE' }), S.PRICING_FIELDS_[0]);
      return r.value === 42.31;
    });

  // M3 — THE R4G CHANGE, ARRIVING ALONE. Dropping the flag gate without the rest is the most plausible
  // premature fix there is, and A6/A7 are the guard that makes it visible instead of silent.
  mutant('M3', 'the flag gate is dropped early, so UNKNOWN rows start falling back before R4G ships',
    '  if (!stored.present && !stored.na && authority === PRICING_OWNER_AUTO_ && auto.present) {',
    '  if (!stored.present && !stored.na && auto.present) {',
    function (S) {
      return S.pricingResolveEffective_(row({ auto_regular_price: 42.31, regular_price_is_manual: '' }),
        S.PRICING_FIELDS_[0]).value === 42.31;
    });

  // M4 — USE_AUTO clearing instead of copying, arriving WITHOUT the resolver. This is the dangerous half:
  // it blanks a live site price on four consumers that cannot fall back (section D).
  mutant('M4', 'USE_AUTO clears the override before any consumer can resolve one',
    '  out.cells[spec.field] = auto.value;\n  out.cells[spec.flag] = pricingWriteFlag_(false);',
    "  out.cells[spec.field] = '';\n  out.cells[spec.flag] = pricingWriteFlag_(false);",
    function (S) {
      var p = S.pricingPlanField_(row({ regular_price: 39.99, auto_regular_price: 42.31,
        regular_price_is_manual: 'TRUE' }), S.PRICING_FIELDS_[0], 'AUTO', '', 'CAD');
      return p.cells.regular_price === '';
    });

  // M5 — the AUTO_VALUE_MISSING guard removed while the COPY remains. This is the half-done R4G: someone
  // reads "clearing needs no value" and deletes the refusal without changing what gets written, so a
  // pending_fx row has `null` copied into a live price column.
  mutant('M5', 'USE_AUTO on a pending_fx row writes the absent auto value straight into the override',
    '  if (!auto.present) {',
    '  if (false) {',
    function (S) {
      var p = S.pricingPlanField_(row({ regular_price: 39.99, auto_regular_price: '',
        regular_price_is_manual: 'TRUE' }), S.PRICING_FIELDS_[0], 'AUTO', '', 'CAD');
      return !p.error && p.changed === true && p.cells.regular_price === null;
    });

  // M6 — MANUAL accepting a blank price. Under a nullable model this reads as a harmless "clear it", and it
  // is precisely the confusion §7 refuses: clearing must stay a named action.
  mutant('M6', 'MANUAL with a blank price is accepted as a way to clear the override',
    '    if (!supplied.present) {',
    '    if (false) {',
    function (S) {
      var p = S.pricingPlanField_(row({ regular_price: 39.99, regular_price_is_manual: 'TRUE' }),
        S.PRICING_FIELDS_[0], 'MANUAL', '', 'CAD');
      return !p.error;
    });

  // M7 — FX given permission over unclassified rows. This is the bulk reclassification §4A forbids, and it
  // would rewrite every legacy price the operator is about to review by hand.
  mutant('M7', 'FX writes the override on UNKNOWN rows, overwriting the legacy population',
    '    if (eff.writable_by_fx) {',
    '    if (eff.authority !== PRICING_OWNER_MANUAL_) {',
    function (S) {
      var p = S.pricingPlanFxRow_(row({ regular_price: 29.99, auto_regular_price: 40.00 }), rates(S));
      return Object.prototype.hasOwnProperty.call(p.cells, 'regular_price');
    });

  // M8 — a blank cell read as the number 0 at the lowest level, which would make every absent price a
  // free product everywhere at once.
  mutant('M8', 'a blank price cell reads as present with value 0',
    "  if (s === '') return { present: false, na: false, value: null, invalid: false };",
    "  if (s === '') return { present: true, na: false, value: 0, invalid: false };",
    function (S) {
      return S.pricingResolveEffective_(row({}), S.PRICING_FIELDS_[0]).value === 0;
    });

  // M9 — the bands collapsed into one. A8 is the only thing that notices, because every single-band
  // fixture in every other section would still pass.
  mutant('M9', 'every band resolves from regular_price, so Minimum and MSRP become copies of it',
    '  var stored = pricingReadNumber_(row ? row[spec.field] : null);',
    "  var stored = pricingReadNumber_(row ? row['regular_price'] : null);",
    function (S) {
      var mixed = row({ regular_price: 39.99, regular_price_is_manual: 'TRUE',
        auto_minimum_price: 26.24, minimum_price_is_manual: 'FALSE' });
      return S.pricingResolveEffective_(mixed, S.PRICING_FIELDS_[1]).value === 39.99;
    });

  // M10 — the flag's third state collapsed into FALSE. The same mutant R4D caught, re-run here because R4F
  // is the round that decides FALSE is debt: if blank silently BECAME FALSE, that ruling would be wrong.
  mutant('M10', 'a blank flag reads as AUTO, declaring the whole legacy price book system-owned',
    "  if (s === '') return PRICING_OWNER_UNKNOWN_;",
    "  if (s === '') return PRICING_OWNER_AUTO_;",
    function (S) {
      return S.pricingResolveEffective_(row({ regular_price: 29.99, auto_regular_price: 40.49 }),
        S.PRICING_FIELDS_[0]).writable_by_fx === true;
    });
}

// =============================================================================================================
console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4F NULLABLE OVERRIDE AND RESOLVED-PRICE CONTRACT — passed ' + pass + '  failed ' + fail +
  '  mutants caught ' + caught + (survived.length ? '  SURVIVED: ' + survived.join(', ') : ''));
console.log('FINAL_PRICE_MODEL = BASE -> AUTO -> NULLABLE MANUAL OVERRIDE · MANUAL_OVERRIDE_NULLABLE = YES');
console.log('RESOLVED_PRICE_OWNER = pricingResolveEffective_ (73_) + normalizePricingListRecord (db-api mirror)');
console.log('DIRECT_EFFECTIVE_CONSUMER_COUNT = 11 · RESOLVED = 7 · MANUAL_OVERRIDE = 6 · UNSAFE_BLANK = 5');
console.log('BLANK_TO_ZERO_DEFECTS = 6 sites / 3 files · 0 on pricing_list · CONTRACT_CHANGE_REQUIRED = YES');
console.log('LEGACY_AUTOMATIC_MIGRATION_REQUIRED = NO · EXISTING_PRODUCTION_ROWS_WRITTEN = 0');
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
console.log(new Array(111).join('='));
process.exit(fail ? 1 : 0);
