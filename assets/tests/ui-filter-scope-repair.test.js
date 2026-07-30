// UI Runtime Small Repair — Revised Filter Scope: SOURCE-CONTRACT tests for the two repairs that are
// deterministically verifiable from source (Carrier Rate Card icon removal; Shipment Overview
// Shipping-Method-before-SKU order). Pure Node source-scan.
//
// IMPORTANT: these are SOURCE-CONTRACT tests, NOT Browser Runtime acceptance. They prove the source
// markup/CSS contract only; they do NOT prove rendered pixels, Tab focus traversal, or visual result.
// Browser acceptance (getBoundingClientRect / computed style / screenshots) remains REQUIRED and PENDING.
//
// Run: node assets/tests/ui-filter-scope-repair.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; console.log('ok   ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

console.log('\n-- Repair H: Carrier Rate Card — All-dates calendar icon removed --');
var crcCss = read('css/pages/carrier-rate-card.css');
var crcHtml = read('html/pages/carrier-rate-card.html');
var crcJs = read('js/pages/carrier-rate-card.js');
ok(!/\.crc-date-trigger::before\s*\{[^}]*content\s*:\s*'📅'/.test(crcCss), 'H1: no ::before calendar glyph on .crc-date-trigger');
ok(!/content\s*:\s*'📅'/.test(crcCss), 'H2: the 📅 glyph is gone from carrier-rate-card.css entirely');
ok(/id="crcDateTriggerText"[^>]*>All dates<|>All dates</.test(crcHtml), 'H3: "All dates" text still present in the trigger');
ok(/crcOpenDateModal/.test(crcHtml) && /function crcOpenDateModal|crcOpenDateModal\s*=/.test(crcJs), 'H4: date filter handler crcOpenDateModal still wired (date filtering intact)');
ok(/crcDateClear/.test(crcJs), 'H5: date Clear handler still present (date filter behaviour unchanged)');

console.log('\n-- Repair B (order): Shipment Overview — Shipping Method precedes SKU (post Round 3 migration) --');
// Round 3 migrated Country/Method to KM.ui.multiFilter mounts; the Round 1 Method-before-SKU order is kept.
var shHtml = read('html/pages/shipping-history.html');
var idxMethodMount = shHtml.indexOf('id="sh-f-method-mount"');
var idxSkuGroup = shHtml.indexOf('filter-group--sku');
ok(idxMethodMount !== -1 && idxSkuGroup !== -1, 'B1: both Shipping Method mount and SKU group exist');
ok(idxMethodMount < idxSkuGroup, 'B2: Shipping Method appears BEFORE the SKU group in DOM (→ Tab order preserved)');
// Country + Method are now shared-component mounts (single owner), not native sh-dropdown panels.
ok(/id="sh-f-method-mount"/.test(shHtml) && /id="sh-f-country-mount"/.test(shHtml), 'B3: Country + Method are shared-component mounts (keys unchanged)');
ok(!/data-filter="method"/.test(shHtml) && !/data-filter="country"/.test(shHtml), 'B3b: old sh-dropdown data-filter panels removed (single owner)');
// Options are now derived from live runtime data — the old HARDCODED Method options must be GONE.
['Air Freight', 'Sea Freight', 'AGL Ship', 'Private Ship', 'Express'].forEach(function (v) {
  ok(shHtml.indexOf('value="' + v + '"') === -1, 'B4: hardcoded Shipping Method option removed (runtime-derived now) — ' + v);
});
ok(/class="filter-group filter-group--sku"[\s\S]*?placeholder="Search SKU\.\.\."/.test(shHtml), 'B5: SKU free-text control preserved (still an input, not converted)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS') + ' (' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
