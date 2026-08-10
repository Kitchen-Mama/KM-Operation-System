// Kitchen Mama Operation System — Add SKU: ASIN required ONLY for Amazon marketplaces.
// Run: node assets/tests/add-sku-asin-amazon-rule.test.js
// -----------------------------------------------------------------------------
// Amazon marketplace → ASIN required; non-Amazon → optional. ONE canonical owner (isReplenAmazonMarketplace)
// drives the label "*", the input required state, AND the submit validation. No DB/schema change, no fabricated
// placeholder ASIN, no unrelated Add-SKU rule change. Pure-helper unit tests + source-scan for shared ownership.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/inventory-replenishment.js');
var HTML = read('html/pages/inventory-replenishment.html');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Extract the canonical detection owner and evaluate it in isolation (pure; no DOM).
var m = JS.match(/function isReplenAmazonMarketplace\(marketplaceToken\) \{[\s\S]*?\n\}/);
ok(!!m, 'owner isReplenAmazonMarketplace is defined');
var isAmazon = m ? (new Function('return (' + m[0] + ')'))() : function () { return false; };

// Slice the submit + change-handler + updater bodies for the wiring assertions.
var saveFn = JS.slice(JS.indexOf('function saveReplenSku'), JS.indexOf('function saveReplenSku') + 4000);
var updater = JS.slice(JS.indexOf('function updateReplenAsinRequirement'), JS.indexOf('function updateReplenAsinRequirement') + 700);
var onChange = JS.slice(JS.indexOf('function onReplenAddMarketplaceChange'), JS.indexOf('function onReplenAddMarketplaceChange') + 2000);

section('Amazon marketplaces → ASIN REQUIRED (A1–A3)');
ok(isAmazon('AMAZON_US') === true, 'A1 Amazon US → required');
ok(isAmazon('AMAZON_CA') === true, 'A2 Amazon CA → required');
ok(isAmazon('AMAZON_UK') === true, 'A3 Amazon UK → required');
ok(isAmazon('Amazon') === true, 'A4 literal "Amazon" → required');

section('Non-Amazon marketplaces → ASIN OPTIONAL (N1–N3)');
ok(isAmazon('KM Walmart') === false, 'N1 KM Walmart → optional');
ok(isAmazon('Walmart') === false, 'N2 Walmart → optional');
ok(isAmazon('WALMART_US') === false, 'N3a WALMART_US → optional');
ok(isAmazon('') === false && isAmazon(null) === false, 'N3b empty/blank marketplace → optional (no selection)');
ok(isAmazon('AMAZONIA_BR') === false, 'N3c "AMAZONIA…" is NOT Amazon (platform-prefix boundary, not substring)');

section('Submit validation is Amazon-gated by the SAME owner (A2/A3 blocked · N1–N3 pass)');
ok(/if \(isReplenAmazonMarketplace\(marketplace\) && !marketplaceProductId\)/.test(saveFn), 'V1 submit blocks empty ASIN ONLY when the marketplace is Amazon');
ok(!/if \(!marketplaceProductId\) \{ alert/.test(saveFn), 'V2 the old unconditional "ASIN required" gate is removed (non-Amazon empty ASIN can submit)');
// simulate the submit gate outcome with the real owner
function blocked(mp, asin) { return isAmazon(mp) && !String(asin || '').trim(); }
ok(blocked('AMAZON_US', '') === true, 'A2 Amazon US + empty ASIN → BLOCKED');
ok(blocked('AMAZON_UK', '') === true, 'A3 Amazon UK + empty ASIN → BLOCKED');
ok(blocked('AMAZON_US', 'B0ABC12345') === false, 'A1 Amazon US + ASIN present → PASS');
ok(blocked('KM Walmart', '') === false, 'N1 KM Walmart + empty ASIN → PASS');
ok(blocked('KM Walmart', 'WMT-123') === false, 'N2 KM Walmart + ASIN present → PASS');
ok(blocked('WALMART_US', '') === false, 'N3 non-Amazon + empty ASIN → PASS');

section('UI required indicator shares the SAME owner + updates on marketplace switch (S1/S2/S4)');
ok(/label\.textContent = amazon \? 'ASIN \*' : 'ASIN'/.test(updater), 'S1/S2 label toggles "ASIN *" (Amazon) / "ASIN" (non-Amazon)');
ok(/var amazon = isReplenAmazonMarketplace\(marketplaceToken\)/.test(updater), 'S4 the required indicator is driven by the SAME owner as submit (isReplenAmazonMarketplace)');
ok(/setAttribute\('required', 'required'\)/.test(updater) && /removeAttribute\('required'\)/.test(updater), 'S4b the input DOM required state follows the same rule');
ok(/updateReplenAsinRequirement\(marketplaceToken\)/.test(onChange), 'S-switch marketplace change immediately re-applies the ASIN rule');

section('Do NOT clear the ASIN value on switch (S3); no fabricated placeholder; no schema change (S5/S6)');
ok(!/replen-add-asin'\)\.value\s*=|input\.value\s*=/.test(updater), 'S3 updater NEVER writes the ASIN input value (existing value preserved on marketplace switch)');
var saveFnCode = saveFn.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/'N\/A'|'NONE'|'UNKNOWN'|marketplaceProductId\s*=\s*['"]-['"]/.test(saveFnCode), 'S5a no fabricated placeholder ASIN ("N/A"/"NONE"/"-"/"UNKNOWN") in the submit code');
ok(/marketplace_product_id: marketplaceProductId/.test(JS), 'S5b payload sends the existing marketplace_product_id (blank contract preserved) — no new field, no schema change');
ok(/if \(!productUrl\) \{ alert\('Product URL is required/.test(saveFn) && /if \(!sku\) \{ alert\('SKU is required/.test(saveFn), 'S6 unrelated Add-SKU rules (SKU / Product URL required) are unchanged');

section('HTML — the label carries a stable id for the rule to toggle');
ok(/<label id="replen-add-asin-label">ASIN<\/label>/.test(HTML), 'H1 ASIN label has id replen-add-asin-label (default "ASIN"; JS sets "*" for Amazon on selection)');

console.log('\n----------------------------------------');
console.log('ADD SKU · ASIN AMAZON-ONLY RULE: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
