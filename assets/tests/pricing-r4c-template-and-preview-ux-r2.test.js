// Kitchen Mama Operation System — PRICING-R4C-R2 · TEMPLATE AND PREVIEW UX
// =============================================================================================================
// The pricing bulk write was smoke-tested in production and works. What did not work was everything around
// it: a template whose action cells said NO_CHANGE / MANUAL / AUTO, and a preview that answered "one price
// changed" by printing a hundred rows.
//
// THE ONE RULE THIS ROUND IS BUILT ON: there are TWO vocabularies and the boundary between them is a
// function, not a convention. NO_CHANGE / MANUAL / AUTO is the write contract and does not move. No Change /
// Update Price / Use Auto Price is what a person reads and types. Every assertion here that names a word
// also names which side of that boundary it is on, because the failure this guards against is the two
// drifting apart — a template that ships a word the parser has never heard of.
//
//   A  §1/§9 the vocabulary boundary: label, internal value, and the export token that follows neither
//   B  §2/§3 the template: what an untouched one means, and that it pre-populates no price
//   C  §4    the action rules, including the misuse that started this round
//   D  §6/§7/§8 the preview: change-oriented, grouped by SKU, bounded
//   E  §10   large batches — 1/100, 25/100, 100/100, and errors beside valid changes
//   F  §11   the confirmation gate and its arithmetic
//   G  §0/§12/§14 no drift: the write contract, the DB fields and the canonical writer are untouched
//   H  mutants
//
// Run: node assets/tests/pricing-r4c-template-and-preview-ux-r2.test.js
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script, no browser. The page's render functions are
// EXTRACTED and executed against a string-only DOM, so "the preview renders 20 cards" is measured HTML
// rather than a claim about source.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var SRP = require('../js/pages/sku-regional-pricing.js');
var SRP_SRC = readN('assets/js/pages/sku-regional-pricing.js');
var PAGE = readN('assets/js/pages/sku-regional-details.js');
var CSS = readN('assets/css/pages/sku-regional-details.css');

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
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}
function count(hay, needle) { return hay.split(needle).length - 1; }

console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4C-R2 — TEMPLATE AND PREVIEW UX');
console.log(new Array(111).join('='));

// -------------------------------------------------------------------------------------------------------------
// THE RENDER WORLD. The page's pure HTML builders are lifted out by name and run against a string-only DOM.
//
// WHY EXTRACT RATHER THAN ASSERT ON SOURCE. "The preview shows only changed rows" is a statement about
// output, and a regex over the source can only say that the word `slice` appears somewhere near the word
// `groups`. The extraction is by brace matching from a named `function NAME(` so a renamed or deleted
// function is a LOUD failure rather than a silently skipped assertion.
// -------------------------------------------------------------------------------------------------------------
function extract(src, names) {
  return names.map(function (n) {
    var at = src.indexOf('function ' + n + '(');
    if (at === -1) throw new Error('EXTRACTION FAILED — function ' + n + ' is gone from sku-regional-details.js');
    var open = src.indexOf('{', at), depth = 0, i = open, inStr = null, prev = '';
    for (; i < src.length; i++) {
      var ch = src[i];
      if (inStr) {
        if (ch === inStr && prev !== '\\') inStr = null;
      } else if (ch === "'" || ch === '"') inStr = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) break; }
      prev = ch === '\\' && prev === '\\' ? '' : ch;
    }
    if (depth !== 0) throw new Error('EXTRACTION FAILED — unbalanced braces in ' + n);
    return src.slice(at, i + 1);
  }).join('\n\n');
}

var RENDER_FNS = ['_srdPriceTxt', '_srdBulkSummaryHtml', '_srdBulkCardHtml', '_srdBulkPreviewHtml',
  '_srdBulkHowToHtml', '_srdBulkErrs', 'srdBulkShowMore'];

function renderWorld() {
  var W = {
    console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON,
    isFinite: isFinite, Date: Date, RegExp: RegExp,
    _srdBulk: null,
    _srdPricingApi: function () { return SRP; },
    esc: SRP.esc,
    _srdBulkRender: function () { W.__renders++; },
    __renders: 0
  };
  vm.createContext(W);
  vm.runInContext(extract(PAGE, RENDER_FNS), W, { filename: 'sku-regional-details.render.js' });
  return W;
}

/** A pricing row shaped the way the page holds them. */
function prow(i, over) {
  var r = { pricingId: 'P' + i, marketplaceSkuId: 'M' + i, sku: 'CO' + (1000 + i) + '-R', siteSku: 'S' + i,
    country: 'US', marketplace: 'Amazon', currency: 'USD',
    regularPrice: 29.99, minimumPrice: 21.00, msrp: 35.00,
    autoRegularPrice: 29.99, autoMinimumPrice: 21.00, autoMsrp: 35.00,
    regularPriceIsManual: null, minimumPriceIsManual: null, msrpIsManual: null, raw: {} };
  return Object.assign(r, over || {});
}
function mrow(i) {
  return { marketplaceSkuId: 'M' + i, sku: 'CO' + (1000 + i) + '-R', company: 'KM', country: 'US',
    marketplace: 'Amazon', siteSku: 'S' + i };
}
function fleet(n) {
  var p = [], m = [];
  for (var i = 1; i <= n; i++) { p.push(prow(i)); m.push(mrow(i)); }
  return { pricing: p, mkt: m };
}

/** One dry-run receipt row, in the shape 73_ returns. */
function receipt(i, fields) {
  var f = { regular_price: { mode: 'NO_CHANGE', changed: false },
    minimum_price: { mode: 'NO_CHANGE', changed: false },
    msrp: { mode: 'NO_CHANGE', changed: false } };
  Object.keys(fields || {}).forEach(function (k) { f[k] = fields[k]; });
  var changed = Object.keys(f).some(function (k) { return f[k].changed; });
  return { marketplace_sku_id: 'M' + i, changed: changed, fields: f };
}

// =============================================================================================================
section('A · §1/§9 THE VOCABULARY BOUNDARY');
// =============================================================================================================
{
  // THE MAP, both ways. Display on the left, write contract on the right, and the right-hand side is the
  // one that reaches 73_.
  eq(SRP.ACTIONS.map(function (a) { return [a.label, a.value]; }),
    [['No Change', 'NO_CHANGE'], ['Update Price', 'MANUAL'], ['Use Auto Price', 'AUTO']],
    'A1  the three user-facing labels, each bound to its internal value');
  eq(SRP.MODES, ['NO_CHANGE', 'MANUAL', 'AUTO'], 'A2  and the internal contract is UNCHANGED — §0');
  eq(SRP.ACTIONS.map(function (a) { return a.value; }), SRP.MODES,
    'A2b the two lists are the same three values in the same order, so neither can gain a member alone');

  // BOTH SPELLINGS PARSE. A file downloaded before this round still uploads.
  eq(['No Change', 'NO_CHANGE', 'no change', ' no-change '].map(SRP.readAction),
    ['NO_CHANGE', 'NO_CHANGE', 'NO_CHANGE', 'NO_CHANGE'], 'A3  No Change and NO_CHANGE both read as NO_CHANGE');
  eq(['Update Price', 'MANUAL', 'update_price'].map(SRP.readAction), ['MANUAL', 'MANUAL', 'MANUAL'],
    'A3b Update Price and MANUAL both read as MANUAL');
  eq(['Use Auto Price', 'AUTO', 'use auto'].map(SRP.readAction), ['AUTO', 'AUTO', 'AUTO'],
    'A3c Use Auto Price and AUTO both read as AUTO');
  eq(SRP.readAction(''), 'NO_CHANGE', 'A4  §4 a BLANK action is No Change — never Update');
  eq([SRP.readAction('DELETE'), SRP.readAction('UPDATE'), SRP.readAction('29.99')], [null, null, null],
    'A5  and anything else is NOT an action — refused rather than ignored');

  // §1 — the word MANUAL must not be the thing an operator is asked to type or read.
  ok(SRP.actionLabel('MANUAL') === 'Update Price' && SRP.actionLabel('AUTO') === 'Use Auto Price',
    'A6  USER_FACING_MANUAL_REMOVED — the label for MANUAL is "Update Price"');
  ok(SRP.ACTIONS.every(function (a) { return !/MANUAL/i.test(a.label); }),
    'A6b no action label contains the word "manual" in any casing');

  // §9 — ownership wording on screen, and the export token that deliberately does not follow it.
  eq([SRP.ownerLabel('MANUAL'), SRP.ownerLabel('AUTO'), SRP.ownerLabel('UNKNOWN')],
    ['User Updated', 'Auto', 'Not Set'], 'A7  §9 the screen says Not Set / User Updated / Auto');
  eq([SRP.ownerCode('MANUAL'), SRP.ownerCode('AUTO'), SRP.ownerCode('UNKNOWN')],
    ['MANUAL', 'AUTO', 'NOT_SET'], 'A7b while the EXPORT keeps the machine token — two functions, not one');
  ok(bare(SRP_SRC).indexOf('ownerLabel(v.owner).toUpperCase()') === -1,
    'A7c and the export no longer derives its token from the display label, so wording cannot change a file');

  // The three-state ownership contract itself is untouched — §0.
  eq([SRP.owner(''), SRP.owner('TRUE'), SRP.owner('FALSE'), SRP.owner(true), SRP.owner(false)],
    ['UNKNOWN', 'MANUAL', 'AUTO', 'MANUAL', 'AUTO'],
    'A8  INTERNAL_AUTHORITY_CONTRACT_UNCHANGED — blank is still UNKNOWN, never FALSE');
}

// =============================================================================================================
section('B · §2/§3 THE TEMPLATE');
// =============================================================================================================
{
  var f = fleet(3);
  var csv = SRP.buildTemplateCsv(f.pricing, f.mkt);
  var lines = csv.split('\r\n');
  var head = lines[0].split(',');

  // §2 — the logical pair per field survives, and the action column comes FIRST so it is read first.
  eq(SRP.TEMPLATE_COLUMNS.slice(7),
    ['regular_price_mode', 'regular_price', 'minimum_price_mode', 'minimum_price', 'msrp_mode', 'msrp'],
    'B1  §2 the action/price pair is retained for all three fields, action before price');

  // §3 — ACTION = No Change, PRICE = blank, for every field of every row.
  var NC = SRP.actionLabel('NO_CHANGE');
  var bad = [];
  lines.slice(1).forEach(function (l, i) {
    var c = l.split(',');
    SRP.FIELDS.forEach(function (spec) {
      if (c[head.indexOf(spec.mode)] !== NC) bad.push('row ' + i + ' ' + spec.mode + '=' + c[head.indexOf(spec.mode)]);
      if (c[head.indexOf(spec.key)] !== '') bad.push('row ' + i + ' ' + spec.key + '=' + c[head.indexOf(spec.key)]);
    });
  });
  eq(bad, [], 'B2  NO_CHANGE_DEFAULT_PASS + BLANK_PRICE_DEFAULT_PASS — every action "No Change", every price blank');
  eq(csv.indexOf('NO_CHANGE'), -1, 'B3  TEMPLATE_ACTION_UX_PASS — the internal token appears nowhere in the file');
  eq(csv.indexOf('MANUAL'), -1, 'B3b nor does MANUAL — §1');

  // §3 — the effective prices are NOT pre-populated. The fixture's rows all carry 29.99 / 21.00 / 35.00.
  ok(csv.indexOf('29.99') === -1 && csv.indexOf('21') === -1 && csv.indexOf('35') === -1,
    'B4  §3 no current effective price is pre-populated into an editable price cell');

  // ... and the CURRENT prices have their own download, so the information is not lost, only separated.
  var cur = SRP.buildCurrentCsv(f.pricing, f.mkt);
  ok(cur.indexOf('29.99') !== -1, 'B4b the current prices live in Download Current Pricing instead');
  ok(cur.split('\r\n')[1].split(',')[cur.split('\r\n')[0].split(',').indexOf('regular_price_owner')] === 'NOT_SET',
    'B4c whose owner column keeps the machine token — §9 wording did not reach the file');

  // AN UNTOUCHED TEMPLATE MEANS NOTHING WILL CHANGE. Measured through the real validator.
  var v = SRP.validateFile(csv);
  eq([v.ok, v.lines.length, v.lines.filter(SRP.lineTouches).length], [true, 3, 0],
    'B5  an untouched template is valid and asks for ZERO changes');

  /* S3-R11 — B6/B6b RE-EXPRESSED, AND THE REASON IS AN OPERATOR DECISION RATHER THAN A PREFERENCE.
     PRICING-R4C-R2 §2 observed that CSV cannot carry dropdown validation and declined to build an
     XLSX path in that round. That restraint was real and it was ITS OWN; written as a ban on the
     string "xlsx" it became a claim that no later round may ever build one. S3-R11 §11 carries the
     operator's decision in as many words — PRIMARY_OPERATOR_TEMPLATE = XLSX, CSV = TECHNICAL /
     ADVANCED FALLBACK — so the thing this pin forbade is the thing the operator asked for.
     What is durable, and is what R4C-R2 actually cared about, is that the CSV path REMAINS: an
     operator whose browser cannot run the Excel export must still be able to get a template and
     upload one. That is asserted below, and it is a stronger claim than the ban was. */
  ok(/\.csv/.test(PAGE), 'B6  the CSV path is still reachable from the page');
  ok(/buildTemplateCsv/.test(PAGE) && /srdBulkDownloadTemplateCsv/.test(PAGE),
    'B6a and the CSV template is still built and still offered as the advanced action');
  ok(typeof SRP.buildTemplateCsv === 'function' && typeof SRP.validateBulkFile === 'function',
    'B6b the module still exposes the CSV builder and the text validator, unchanged in name');

  /* B6c — THE CLAIM SURVIVES; THE LINE IT WAS WRITTEN AGAINST DID NOT. "ONE import contract" was
     checked by looking for the exact call `SRP.validateFile(text)` inside the scoped gate. S3-R11
     moved the rules onto a GRID so an .xlsx and a .csv could meet the SAME rules — which is the
     single-contract property, held harder than before, not abandoned. So the invariant is asserted
     directly: the scoped gate delegates to the frozen validator, and both text entry points are
     compositions over the grid ones rather than second implementations. */
  ok(/var base = SRP\.validateGrid\(grid\);/.test(SRP_SRC),
    'B6c the scoped gate still DELEGATES to the frozen validator rather than reimplementing it');
  ok(/SRP\.validateFile = function \(text\) \{ return SRP\.validateGrid\(SRP\.parseCsv\(text\)\); \};/.test(SRP_SRC),
    'B6d and validateFile is exactly parse-then-validate — no second reading of the rules');
  ok(/SRP\.validateBulkFile = function \(text, scope\) \{ return SRP\.validateBulkGrid\(SRP\.parseCsv\(text\), scope\); \};/.test(SRP_SRC),
    'B6e as is validateBulkFile — so CSV and XLSX cannot drift apart');
}

// =============================================================================================================
section('C · §4 THE ACTION RULES — INCLUDING THE MISUSE THAT STARTED THIS ROUND');
// =============================================================================================================
{
  var f = fleet(2);
  var csv = SRP.buildTemplateCsv(f.pricing, f.mkt);
  var scope = SRP.scopes(f.pricing, f.mkt)[0];
  eq([scope.country, scope.marketplace, scope.currency], ['US', 'Amazon', 'USD'], 'C0  the fixture target resolves');

  var H = csv.split('\r\n')[0].split(',');
  /** Rewrite one cell of one data row and revalidate through the scoped gate. */
  function edit(cells) {
    var rows = csv.split('\r\n');
    var c = rows[1].split(',');
    Object.keys(cells).forEach(function (k) {
      var i = H.indexOf(k);
      if (i === -1) throw new Error('no such column ' + k);
      c[i] = cells[k];
    });
    rows[1] = c.join(',');
    return SRP.validateBulkFile(rows.join('\r\n'), scope);
  }
  function codes(r) { return r.errors.map(function (e) { return e.code; }); }

  // ---- UPDATE PRICE ----
  var good = edit({ regular_price_mode: 'Update Price', regular_price: '30.99' });
  eq([good.ok, good.lines[0].regular_price_mode, good.lines[0].regular_price], [true, 'MANUAL', '30.99'],
    'C1  "Update Price" + a number is accepted and reaches the writer as MANUAL');
  eq(codes(edit({ regular_price_mode: 'Update Price', regular_price: '' })), ['MANUAL_PRICE_REQUIRED'],
    'C2  Update Price with a BLANK price is refused — blank is not zero');
  eq(codes(edit({ regular_price_mode: 'Update Price', regular_price: 'thirty' })), ['PRICE_NOT_NUMERIC'],
    'C3  ... and a non-numeric price is refused');
  eq(codes(edit({ regular_price_mode: 'Update Price', regular_price: '-1' })), ['PRICE_NEGATIVE'],
    'C4  ... and a negative one');

  // ---- USE AUTO PRICE ----
  var auto = edit({ regular_price_mode: 'Use Auto Price' });
  eq([auto.ok, auto.lines[0].regular_price_mode, auto.lines[0].regular_price], [true, 'AUTO', undefined],
    'C5  "Use Auto Price" with a blank price is accepted and carries no value forward');
  eq(codes(edit({ regular_price_mode: 'Use Auto Price', regular_price: '30.99' })), ['AUTO_WITH_VALUE'],
    'C6  ... and a price BESIDE it is refused, not silently dropped');

  // ---- NO CHANGE, and the misuse §2 named ----
  var nochg = edit({});
  eq([nochg.ok, nochg.lines.filter(SRP.lineTouches).length], [true, 0], 'C7  "No Change" asks for nothing');
  eq(codes(edit({ regular_price: '30.99' })), ['NO_CHANGE_WITH_PRICE'],
    'C8  THE MISUSE: a price typed beside "No Change" is REFUSED rather than quietly ignored');
  eq(codes(edit({ regular_price_mode: '', regular_price: '30.99' })), ['NO_CHANGE_WITH_PRICE'],
    'C9  ... and so is a price typed after DELETING the action word — the natural mistake §2 describes');
  ok(/The action cell is blank, which means/.test(edit({ regular_price_mode: '', regular_price: '30.99' }).errors[0].detail),
    'C9b and the message says which of the two the operator probably meant');
  ok(/Update Price/.test(edit({ regular_price: '30.99' }).errors[0].detail),
    'C9c naming the action to choose, in the words the template uses');

  // §4 — an action is never INFERRED from the presence of a number.
  ok(edit({ regular_price: '30.99' }).lines.length === 0,
    'C10 §4 a numeric value never infers an action — the file is refused and offers NOTHING for writing');
  ok(bare(SRP_SRC).indexOf("mode = 'MANUAL'") === -1,
    'C10b and no code path anywhere promotes a line to MANUAL on its own');

  // An unrecognised word is still refused, and the refusal now names the words a person can type.
  var un = edit({ regular_price_mode: 'UPDATE' });
  eq(codes(un), ['MODE_UNSUPPORTED'], 'C11 an unsupported action is refused, never ignored');
  eq(un.errors[0].detail.indexOf('No Change / Update Price / Use Auto Price') > -1, true,
    'C11b and the refusal lists the three ACCEPTED words rather than the internal tokens');

  // §12 — NO_CHANGE preserves. Nothing in this round clears an effective price to mark a row unreviewed.
  ok(bare(SRP_SRC).indexOf('not reviewed') === -1 && !/clear(Effective|Price)/i.test(bare(SRP_SRC)),
    'C12 §12 nothing here clears an effective price to signal "not reviewed"');
}

// =============================================================================================================
section('D · §6/§7/§8 THE PREVIEW');
// =============================================================================================================
{
  var W = renderWorld();
  var f = fleet(100);

  // 100 rows uploaded, ONE of which changes anything. The §6 example, exactly.
  var lines = f.pricing.map(function (p, i) {
    var l = { marketplace_sku_id: 'M' + (i + 1), regular_price_mode: 'NO_CHANGE',
      minimum_price_mode: 'NO_CHANGE', msrp_mode: 'NO_CHANGE' };
    if (i === 0) { l.regular_price_mode = 'MANUAL'; l.regular_price = '30.99'; }
    return l;
  });
  var rec = { rows: f.pricing.map(function (p, i) {
    return i === 0 ? receipt(1, { regular_price: { mode: 'MANUAL', changed: true } }) : receipt(i + 1);
  }) };
  var parsed = { rowCount: 100, lines: lines, errors: [] };
  var rows = SRP.previewRows(rec.rows, lines, f.pricing);
  var sum = SRP.previewSummary(parsed, rec.rows, rows);

  eq([sum.rowsInFile, sum.rowsChanging, sum.rowsUnchanged, sum.rowsRejected, sum.errorCount],
    [100, 1, 99, 0, 0], 'D1  §6 100 rows processed · 1 changing · 99 unchanged · 0 errors');
  eq(sum.fieldChanges, 1, 'D1b and exactly one price change');
  eq(sum.byField, { regular_price: 1, minimum_price: 0, msrp: 0 }, 'D1c broken down per field');
  eq(sum.byAction, { MANUAL: 1, AUTO: 0 }, 'D1d and per action');

  W._srdBulk = { fileName: 'update.csv', scope: { country: 'US', marketplace: 'Amazon', currency: 'USD' },
    shown: 0, preview: { changedRows: 1, errors: [], summary: sum, groups: SRP.groupPreview(rows) } };
  var html = W._srdBulkPreviewHtml();

  // §7 — THE NINETY-NINE ARE COUNTED, NOT DRAWN.
  eq(count(html, 'srd-bulk__card"'), 1, 'D2  PREVIEW_CHANGE_ONLY_PASS — exactly ONE card is rendered for 100 rows');
  eq(count(html, 'srd-bulk__chg"'), 1, 'D2b and exactly one change line');
  ok(html.indexOf('99 unchanged') > -1, 'D3  the 99 unchanged rows appear as a COUNT in the summary');
  ok(html.indexOf('M2') === -1 && html.indexOf('CO1002-R') === -1,
    'D3b and no unchanged SKU appears in the list at all');
  ok(html.indexOf('100 rows processed') > -1, 'D3c with the file total stated above it');

  // §8 — ONE CARD PER SKU, THREE LINES, when one SKU changes three fields.
  var l3 = [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '30.99',
    minimum_price_mode: 'MANUAL', minimum_price: '22.00', msrp_mode: 'AUTO' }];
  var r3 = { rows: [receipt(1, {
    regular_price: { mode: 'MANUAL', changed: true },
    minimum_price: { mode: 'MANUAL', changed: true },
    msrp: { mode: 'AUTO', changed: true } })] };
  var rows3 = SRP.previewRows(r3.rows, l3, [f.pricing[0]]);
  eq(rows3.length, 3, 'D4  three changed fields produce three preview entries');
  var g3 = SRP.groupPreview(rows3);
  eq(g3.length, 1, 'D5  PREVIEW_GROUP_BY_SKU_PASS — which group into ONE SKU, not three SKU rows');
  eq(g3[0].changes.map(function (c) { return c.label; }), ['Regular Price', 'Minimum Price', 'MSRP'],
    'D5b with the three fields under it, in field order');

  W._srdBulk.preview = { changedRows: 1, errors: [],
    summary: SRP.previewSummary({ rowCount: 1, lines: l3, errors: [] }, r3.rows, rows3),
    groups: g3 };
  var h3 = W._srdBulkPreviewHtml();
  eq(count(h3, 'srd-bulk__card"'), 1, 'D6  one card in the HTML');
  eq(count(h3, 'srd-bulk__chg"'), 3, 'D6b carrying three change lines');
  eq(count(h3, 'CO1001-R'), 1, 'D6c and the SKU is printed ONCE, not once per field');

  // §8 — the value transition and the ownership transition, both on the line.
  ok(h3.indexOf('29.99') > -1 && h3.indexOf('30.99') > -1, 'D7  the line shows the old value and the new one');
  ok(h3.indexOf('Not Set') > -1 && h3.indexOf('User Updated') > -1,
    'D7b and the ownership transition in §9 wording');
  ok(h3.indexOf('MANUAL<') === -1, 'D7c with no "MANUAL" rendered as a value anywhere');
  ok(h3.indexOf('Use Auto Price') > -1, 'D7d and the action named in the template vocabulary');
  // A Use Auto Price line shows the STORED AUTO VALUE when the page holds one, because that is the number
  // the write will land on and a person comparing prices wants to see it. The word "Auto" is the fallback
  // for a field with no auto value yet — not a substitute for one that has it.
  ok(/<strong>35<\/strong>/.test(h3), 'D7e a Use Auto Price line shows the stored auto value it will restore');
  var noAuto = SRP.previewRows(r3.rows, l3, [Object.assign({}, f.pricing[0], { autoMsrp: null, raw: {} })]);
  W._srdBulk.preview = { changedRows: 1, errors: [],
    summary: SRP.previewSummary({ rowCount: 1, lines: l3, errors: [] }, r3.rows, noAuto),
    groups: SRP.groupPreview(noAuto) };
  ok(/<strong>Auto<\/strong>/.test(W._srdBulkPreviewHtml()),
    'D7f and reads "→ Auto" when there is no stored auto value to show — never a fabricated number');
  W._srdBulk.preview = { changedRows: 1, errors: [],
    summary: SRP.previewSummary({ rowCount: 1, lines: l3, errors: [] }, r3.rows, rows3), groups: g3 };

  // §7 — a valid file that asks for nothing is a SUMMARY, not an empty table.
  W._srdBulk.preview = { changedRows: 0, noop: true, errors: [], groups: [],
    summary: SRP.previewSummary({ rowCount: 100, lines: lines, errors: [] }, [], []) };
  var hn = W._srdBulkPreviewHtml();
  ok(hn.indexOf('No Change') > -1 && count(hn, 'srd-bulk__card"') === 0,
    'D8  a file of pure No Change renders zero cards and says so in the template vocabulary');
}

// =============================================================================================================
section('E · §10 LARGE BATCHES');
// =============================================================================================================
{
  var W = renderWorld();
  var f = fleet(100);
  W._srdBulk = { fileName: 'bulk.csv', scope: { country: 'US', marketplace: 'Amazon', currency: 'USD' },
    shown: 0, preview: null };

  /** n changed rows out of 100 parsed, one field each. */
  function scenario(n) {
    var lines = [], recRows = [];
    for (var i = 1; i <= 100; i++) {
      var ch = i <= n;
      lines.push({ marketplace_sku_id: 'M' + i,
        regular_price_mode: ch ? 'MANUAL' : 'NO_CHANGE', regular_price: ch ? '30.99' : undefined,
        minimum_price_mode: 'NO_CHANGE', msrp_mode: 'NO_CHANGE' });
      recRows.push(ch ? receipt(i, { regular_price: { mode: 'MANUAL', changed: true } }) : receipt(i));
    }
    var rows = SRP.previewRows(recRows, lines, f.pricing);
    return { parsed: { rowCount: 100, lines: lines, errors: [] }, recRows: recRows, rows: rows,
      summary: SRP.previewSummary({ rowCount: 100, lines: lines, errors: [] }, recRows, rows),
      groups: SRP.groupPreview(rows) };
  }

  [1, 25, 100].forEach(function (n) {
    var sc = scenario(n);
    eq([sc.summary.rowsChanging, sc.summary.rowsUnchanged], [n, 100 - n],
      'E1  ' + n + ' changed / 100 parsed — the counts are right');
    W._srdBulk.shown = 0;
    W._srdBulk.preview = { changedRows: n, errors: [], summary: sc.summary, groups: sc.groups };
    var html = W._srdBulkPreviewHtml();
    var cards = count(html, 'srd-bulk__card"');
    eq(cards, Math.min(n, SRP.PREVIEW_PAGE_SIZE),
      'E2  ' + n + ' changed — at most ' + SRP.PREVIEW_PAGE_SIZE + ' cards are BUILT (' + cards + ')');
    ok(html.length < 120000, 'E2b ' + n + ' changed — the rendered HTML stays small (' + html.length + ' bytes)');
  });

  // §7 — SHOW MORE. It pages an answer already in hand; the server is not asked a second time.
  var big = scenario(100);
  W._srdBulk.shown = 0;
  W._srdBulk.preview = { changedRows: 100, errors: [], summary: big.summary, groups: big.groups };
  var p1 = W._srdBulkPreviewHtml();
  ok(/Showing 20 of 100 changes/.test(p1), 'E3  "Showing 20 of 100 changes" — the label §7 asks for');
  ok(/20 of 100 SKUs/.test(p1), 'E3b naming SKUs as well, because a card is a SKU and a change is a field');
  ok(/srdBulkShowMore\(\)/.test(p1), 'E3c with a Show More control');

  var before = W.__renders;
  W.srdBulkShowMore();
  eq(W.__renders - before, 1, 'E4  Show More re-renders exactly once');
  eq(W._srdBulk.shown, 40, 'E4b advancing the cursor by one page');
  eq(count(W._srdBulkPreviewHtml(), 'srd-bulk__card"'), 40, 'E4c and forty cards are now built');
  W.srdBulkShowMore(); W.srdBulkShowMore(); W.srdBulkShowMore();
  var last = W._srdBulkPreviewHtml();
  eq(count(last, 'srd-bulk__card"'), 100, 'E5  paging to the end builds all one hundred');
  ok(/Showing all 100 changes/.test(last) && last.indexOf('srdBulkShowMore()') === -1,
    'E5b and the Show More control is gone once there is no more');

  // ONE REQUEST. Paging must never re-ask the server — the receipt is the answer already given.
  var showMore = extractOne('srdBulkShowMore');
  ok(showMore.indexOf('updatePricing') === -1 && showMore.indexOf('dry_run') === -1,
    'E6  PREVIEW_LARGE_BATCH_PASS — Show More sends no request; it re-renders a held receipt');

  // §10 — the list is bounded on screen as well as in the DOM, so Confirm cannot be pushed off the modal.
  ok(/\.srd-bulk__cards \{[^}]*max-height:[^}]*overflow-y: auto/.test(CSS),
    'E7  the card list has a bounded height with its own scroll');
  ok(/\.srd-bulk__cards \{[^}]*overflow-x: hidden/.test(CSS),
    'E7b and no horizontal scroll — §10');
  ok(/@media \(max-width: 720px\)[\s\S]*\.srd-bulk__chg \{ grid-template-columns: 1fr 1fr; \}/.test(CSS),
    'E7c the change line reflows at narrow widths instead of scrolling sideways');

  // §10 — ERRORS BESIDE VALID CHANGES. The frozen file contract is ALL-OR-NOTHING, so this is what that
  // combination actually is: a refusal that writes nothing and lists every reason.
  var f2 = fleet(100);
  var csv = SRP.buildTemplateCsv(f2.pricing, f2.mkt);
  var scope = SRP.scopes(f2.pricing, f2.mkt)[0];
  var rows = csv.split('\r\n');
  var H = rows[0].split(',');
  function setCell(rowIdx, col, val) { var c = rows[rowIdx].split(','); c[H.indexOf(col)] = val; rows[rowIdx] = c.join(','); }
  for (var i = 1; i <= 25; i++) { setCell(i, 'regular_price_mode', 'Update Price'); setCell(i, 'regular_price', '30.99'); }
  setCell(30, 'regular_price_mode', 'Update Price'); setCell(30, 'regular_price', '');        // no price
  setCell(31, 'regular_price_mode', 'Use Auto Price'); setCell(31, 'regular_price', '9.99');  // price beside auto
  setCell(32, 'regular_price', '9.99');                                                       // price, no action
  var mixed = SRP.validateBulkFile(rows.join('\r\n'), scope);
  eq(mixed.ok, false, 'E8  a file with 25 valid changes and 3 bad cells is REFUSED as a whole');
  eq(mixed.lines.length, 0, 'E8b offering ZERO lines for writing — no half-file reaches the server');
  eq(mixed.errors.map(function (e) { return e.code; }).sort(),
    ['AUTO_WITH_VALUE', 'MANUAL_PRICE_REQUIRED', 'NO_CHANGE_WITH_PRICE'],
    'E8c with all three reasons reported, each named');

  W._srdBulk.preview = { changedRows: 0, rejected: true, errors: mixed.errors, summary: null, groups: [] };
  var herr = W._srdBulkPreviewHtml();
  ok(herr.indexOf('Nothing was written') > -1, 'E9  PREVIEW_ERROR_VISIBILITY_PASS — the refusal says so first');
  ['MANUAL_PRICE_REQUIRED', 'AUTO_WITH_VALUE', 'NO_CHANGE_WITH_PRICE'].forEach(function (c) {
    ok(herr.indexOf(c) > -1, 'E9b every error code is visible in the rendered HTML — ' + c);
  });
  eq(count(herr, 'srd-bulk__card"'), 0, 'E9c and no change card competes with them');
}

function extractOne(name) { return extract(PAGE, [name]); }

// =============================================================================================================
section('F · §11 THE CONFIRMATION GATE');
// =============================================================================================================
{
  // The gate itself: Confirm is disabled until a preview has found something to change, and the write goes
  // through the confirmation stage rather than straight from Preview.
  ok(/id="srd-bulk-continue-btn"[\s\S]{0,140}b\.preview && b\.preview\.changedRows > 0 \? '' : ' disabled'/.test(PAGE),
    'F1  Confirm Update is disabled unless the preview found a change');
  ok(/b\.stage = 'confirm'/.test(PAGE) && /if \(!b \|\| !b\.preview \|\| !b\.preview\.changedRows\) return;/.test(PAGE),
    'F2  and reaching the confirmation requires a preview with changes');
  ok(/function srdBulkConfirm\(\)[\s\S]{0,300}b\.lines/.test(PAGE),
    'F3  the write sends the lines the PREVIEW validated, never the file re-read');

  // §11 — the arithmetic on the confirmation is the change count, per field and per action.
  var confirmSrc = PAGE.slice(PAGE.indexOf("if (b.stage === 'confirm')"), PAGE.indexOf("// scope / preview"));
  ok(confirmSrc.indexOf("sm.fieldChanges + ' price change'") > -1,
    'F4  FINAL_CONFIRM_SUMMARY_PASS — it leads with the number of price CHANGES');
  var confirmCode = bare(confirmSrc);
  ok(confirmCode.indexOf('rowsInFile') === -1 && confirmCode.indexOf('rowsChecked') === -1,
    'F4b and never with the row count of the file — §10 (measured on code, not on the comment explaining it)');
  ok(/sm\.byField\[spec\.key\]/.test(confirmSrc), 'F5  with a per-field breakdown: Regular / Minimum / MSRP');
  ok(/sm\.byAction\.MANUAL/.test(confirmSrc) && /sm\.byAction\.AUTO/.test(confirmSrc),
    'F5b and a per-action breakdown');
  ok(/actionLabel\('MANUAL'\)/.test(confirmSrc) && /actionLabel\('AUTO'\)/.test(confirmSrc),
    'F5c labelled with the words the template uses, not the internal tokens');
  ok(/<span>Errors<\/span>/.test(confirmSrc), 'F5d and the error count, which must be zero to get here');
  ok(/<span>Country<\/span>/.test(confirmSrc) && /<span>Currency<\/span>/.test(confirmSrc),
    'F6  with the target and currency restated before the last click');
  ok(confirmSrc.indexOf('between MANUAL and AUTO') === -1,
    'F7  §9 and the ownership sentence no longer shows the operator the word MANUAL');
  ok(/ownerLabel\('MANUAL'\)/.test(confirmSrc), 'F7b saying "User Updated" instead');

  // §5 — the instruction block, generated from the same list the parser reads.
  var W = renderWorld();
  W._srdBulk = { scope: { country: 'US', marketplace: 'Amazon', currency: 'USD' } };
  var how = W._srdBulkHowToHtml();
  SRP.ACTIONS.forEach(function (a) {
    ok(how.indexOf(a.label) > -1, 'F8  §5 the instruction block names "' + a.label + '"');
  });
  ok(how.indexOf('How to update prices') > -1, 'F8b under the heading §5 asks for');
  ok(how.indexOf('US') > -1 && how.indexOf('Amazon') > -1 && how.indexOf('USD') > -1,
    'F8c and states the target and the currency');
  ok(/All prices entered in this file must be in USD/.test(how),
    'F8d with the currency rule spelled out');
  ok(how.indexOf('NO_CHANGE') === -1 && how.indexOf('MANUAL') === -1,
    'F8e and no internal token reaches the operator');
  ok(/P\.ACTIONS\.map/.test(extractOne('_srdBulkHowToHtml')),
    'F9  it is GENERATED from SRP.ACTIONS, so the screen cannot drift from the parser');
  ok(W._srdBulkHowToHtml.call(null) === how, 'F9b and it is pure — same state, same HTML');
}

// =============================================================================================================
section('G · §0/§12/§14 NO DRIFT');
// =============================================================================================================
{
  // THE WRITE PATH. One canonical action, reused, with no second writer introduced.
  // Six call sites, and every one of them is the SAME action: the single-row editor's guard and its write,
  // the legacy per-SKU preview and confirm, and the bulk preview and confirm. What matters is not the
  // number but that no seventh NAME exists.
  eq((bare(PAGE).match(/KM\.DB\.updatePricing/g) || []).length, 6,
    'G1  every pricing write on this page goes through KM.DB.updatePricing');
  eq((bare(PAGE).match(/KM\.DB\.[a-zA-Z]*[Pp]ricing[a-zA-Z]*/g) || [])
      .filter(function (x, i, a) { return a.indexOf(x) === i; }),
    ['KM.DB.getPricingList', 'KM.DB.updatePricing'],
    'G1a and the page knows exactly two pricing API names — one READ and one WRITE, no second writer');
  ok(bare(PAGE).indexOf('PRICING_WRITE') === -1 && !/postPricing|writePricing|savePricing/.test(bare(PAGE)),
    'G1b PRICING_UPDATE_CONTRACT_UNCHANGED — no new pricing write path appears anywhere on the page');
  ok(/dry_run: true/.test(PAGE), 'G1c the preview is the SAME action with dry_run');
  ok(bare(PAGE).indexOf('pricing.fxReconcile') === -1 && bare(SRP_SRC).indexOf('pricing.fxReconcile') === -1,
    'G1d and nothing here touches the FX action');

  // NO BASE / AUTO / FX DRIFT. The upload contract carries none of those columns, and nothing writes them.
  SRP.FIELDS.forEach(function (spec) {
    ok(SRP.TEMPLATE_COLUMNS.indexOf(spec.base || ('base_' + spec.key)) === -1,
      'G2  NO_BASE_DRIFT — the update template has no ' + ('base_' + spec.key) + ' column');
    ok(SRP.TEMPLATE_COLUMNS.indexOf(spec.autoKey) === -1,
      'G2b NO_AUTO_DRIFT — nor ' + spec.autoKey);
  });
  ['fx_rate', 'fx_rate_date'].forEach(function (c) {
    ok(SRP.TEMPLATE_COLUMNS.indexOf(c) === -1, 'G2c NO_FX_DRIFT — nor ' + c);
  });
  // ... and an upload carrying them anyway contributes nothing: a line only ever holds identity, currency,
  // three modes and up to three prices.
  var f = fleet(1);
  var csv = SRP.buildTemplateCsv(f.pricing, f.mkt);
  var scope = SRP.scopes(f.pricing, f.mkt)[0];
  var smuggled = csv.split('\r\n');
  smuggled[0] += ',base_regular_price,auto_regular_price,fx_rate';
  smuggled[1] += ',1,2,3';
  var v = SRP.validateBulkFile(smuggled.join('\r\n'), scope);
  eq(v.ok, true, 'G3  a file carrying base/auto/fx columns still parses');
  eq(Object.keys(v.lines[0]).sort(),
    ['currency', 'marketplace_sku_id', 'minimum_price_mode', 'msrp_mode', 'regular_price_mode'],
    'G3b but NOTHING of them reaches the line — base_*, auto_* and fx_* are unwritable by construction');

  // NO DB DRIFT. The flag columns are named in the normalizer that reads them off the sheet; this module
  // BUILDS the name from the field key, which is why looking for the literal here proves nothing.
  var DBAPI = readN('assets/js/api/operation-system-db-api.js');
  ['regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual'].forEach(function (c) {
    ok(DBAPI.indexOf(c) > -1, 'G4  NO_DB_MIGRATION — the flag column ' + c + ' is unrenamed');
  });
  ok(/row\.raw\[spec\.key \+ '_is_manual'\]/.test(SRP_SRC),
    'G4a and this module still addresses them as <field>_is_manual, built from the field key');
  eq(SRP.FIELDS.map(function (s) { return s.key; }), ['regular_price', 'minimum_price', 'msrp'],
    'G4b and the three effective fields keep their names');

  // §12 — NO_CHANGE preserves the existing value. Proven through the real line builder rather than by prose.
  var keep = SRP.validateBulkFile(csv, scope);
  eq(keep.lines[0].regular_price, undefined,
    'G5  §12 a No Change line carries no price at all, so nothing can be blanked by uploading one');
  eq(SRP.lineTouches(keep.lines[0]), false, 'G5b and asks the writer for nothing');

  // THE RENDER FUNCTIONS THIS SUITE EXTRACTS MUST EXIST. A rename that slips past every other assertion
  // would make the extraction throw, which is the loud failure this names.
  RENDER_FNS.forEach(function (n) {
    ok(PAGE.indexOf('function ' + n + '(') > -1, 'G6  the extracted render function ' + n + ' exists');
  });
}

// =============================================================================================================
section('H · MUTANTS');
// =============================================================================================================
{
  function mutant(id, why, anchor, repl, probe) {
    if (SRP_SRC.indexOf(anchor) === -1) {
      fail++; console.error('HARNESS ERROR ' + id + ' — anchor not found: ' + anchor.slice(0, 70));
      return;
    }
    if (SRP_SRC.split(anchor).length - 1 !== 1) {
      fail++; console.error('HARNESS ERROR ' + id + ' — anchor is not unique');
      return;
    }
    var src = SRP_SRC.replace(anchor, function () { return repl; });
    var W = { module: { exports: {} }, console: console, window: undefined };
    W.global = W;
    var got;
    try {
      vm.createContext(W);
      vm.runInContext(src, W, { filename: 'mutant-' + id + '.js' });
      got = probe(W.module.exports || W.KM.SkuRegionalPricing);
    } catch (e) { got = true; }
    if (got) { caught++; pass++; console.log('ok   ' + id + '  ' + why + ' (caught)'); }
    else { survived.push(id); fail++; console.error('FAIL ' + id + '  ' + why + ' SURVIVED'); }
  }

  function scopeOf(M, f) { return M.scopes(f.pricing, f.mkt)[0]; }
  function editCsv(M, f, cells) {
    var csv = M.buildTemplateCsv(f.pricing, f.mkt);
    var rows = csv.split('\r\n'), H = rows[0].split(',');
    var c = rows[1].split(',');
    Object.keys(cells).forEach(function (k) { c[H.indexOf(k)] = cells[k]; });
    rows[1] = c.join(',');
    return M.validateBulkFile(rows.join('\r\n'), scopeOf(M, f));
  }

  // M1 — the template ships the internal token again. B3 stands in its way.
  mutant('M1', 'the template ships NO_CHANGE instead of the user-facing label',
    "        var nc = SRP.actionLabel('NO_CHANGE');",
    "        var nc = 'NO_CHANGE';",
    function (M) { return M.buildTemplateCsv(fleet(1).pricing, fleet(1).mkt).indexOf('NO_CHANGE') > -1; });

  // M2 — the template pre-fills today's price. B4 stands in its way, and this is the §3 failure exactly.
  mutant('M2', 'the template pre-populates the current effective price',
    '            c.regular_price_mode = nc; c.regular_price = \'\';',
    '            c.regular_price_mode = nc; c.regular_price = p.regularPrice;',
    function (M) { var f = fleet(1); return M.buildTemplateCsv(f.pricing, f.mkt).indexOf('29.99') > -1; });

  // M3 — a blank action becomes an update. §4 forbids it in as many words.
  mutant('M3', 'a blank action cell is read as MANUAL',
    "        if (s === '') return 'NO_CHANGE';",
    "        if (s === '') return 'MANUAL';",
    function (M) { return M.readAction('') !== 'NO_CHANGE'; });

  // M4 — a price beside No Change is silently dropped again. C8/C9 stand in its way.
  mutant('M4', 'a price typed beside No Change is ignored rather than refused',
    "                } else if (mode === 'NO_CHANGE') {",
    '                } else if (false) {',
    function (M) { return editCsv(M, fleet(1), { regular_price: '30.99' }).ok === true; });

  // M5 — AUTO smuggles a value. C6 stands in its way.
  mutant('M5', 'a price beside Use Auto Price is accepted',
    "                if (mode === 'AUTO') {",
    '                if (false) {',
    function (M) {
      return editCsv(M, fleet(1), { regular_price_mode: 'Use Auto Price', regular_price: '30.99' }).ok === true;
    });

  // M6 — the export token starts following the screen wording. A7b/B4c stand in its way, and this is the
  // regression that would rewrite a column in every downloaded file by changing one label.
  mutant('M6', 'the exported owner column follows the display label',
    "                c[spec.key + '_owner'] = SRP.ownerCode(v.owner);",
    "                c[spec.key + '_owner'] = SRP.ownerLabel(v.owner).toUpperCase().replace(' ', '_');",
    function (M) {
      // The probe must use a state where the two DIFFER: "Not Set" uppercases to NOT_SET, so an UNKNOWN row
      // looks identical under the mutation. A MANUAL row does not — "User Updated" becomes USER_UPDATED.
      var f = fleet(1);
      f.pricing[0].regularPriceIsManual = true;
      return M.buildCurrentCsv(f.pricing, f.mkt).indexOf('MANUAL') === -1;
    });

  // M7 — the preview stops being change-oriented. D2 stands in its way.
  mutant('M7', 'grouping emits a card for every row rather than for changed ones',
    '            var id = String(r.marketplace_sku_id || \'\').trim();\n            var g = byId[id];',
    '            var id = String(Math.random());\n            var g = byId[id];',
    function (M) {
      var rows = [{ marketplace_sku_id: 'M1', field: 'regular_price', label: 'Regular Price' },
        { marketplace_sku_id: 'M1', field: 'msrp', label: 'MSRP' }];
      return M.groupPreview(rows).length !== 1;
    });

  // M8 — the page size stops bounding anything. E2 stands in its way.
  mutant('M8', 'the preview page size is unbounded',
    '    SRP.PREVIEW_PAGE_SIZE = 20;',
    '    SRP.PREVIEW_PAGE_SIZE = 100000;',
    function (M) { return M.PREVIEW_PAGE_SIZE > 200; });

  // M9 — the summary counts rows instead of changes. D1b/F4 stand in its way.
  mutant('M9', 'the summary counts rows where it should count field changes',
    '            out.fieldChanges++;',
    '            out.fieldChanges = 1;',
    function (M) {
      var rows = [{ field: 'regular_price', mode: 'MANUAL' }, { field: 'msrp', mode: 'MANUAL' }];
      return M.previewSummary({ rowCount: 1, lines: [], errors: [] }, [], rows).fieldChanges !== 2;
    });

  // M10 — an unrecognised action word is quietly treated as No Change. C11 stands in its way, and this is
  // the one that loses an edit without telling anybody.
  mutant('M10', 'an unrecognised action word falls back to No Change',
    '        return null;\n    };\n\n    function esc(s)',
    "        return 'NO_CHANGE';\n    };\n\n    function esc(s)",
    function (M) { return M.readAction('DELETE') !== null; });
}

// =============================================================================================================
console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4C-R2 TEMPLATE AND PREVIEW UX — passed ' + pass + '  failed ' + fail +
  '  mutants caught ' + caught + (survived.length ? '  SURVIVED: ' + survived.join(', ') : ''));
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
console.log(new Array(111).join('='));
process.exit(fail ? 1 : 0);
