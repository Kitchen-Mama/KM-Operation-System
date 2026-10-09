// S8-R4D-G0 — Amazon EU shared-inventory identity + amazon_inventory_snapshot blank-date contract.
// Deterministic Node tests of the ACTUAL SHIPPED decision logic. Pure Node (no DOM / network / DB).
// Run: node assets/tests/amazon-eu-shared-inventory-and-blank-date-s8-r4d-g0.test.js
//
// PART B (EU inventory) executes the shipped latestSnapshot/stockCard by source-slicing them out of
// the page IIFE (they are not exported to Node) and wiring the REAL window.IRCountry.
// PART A (blank date) executes the shipped importer row gate by source-slicing the runner's
// natural-key check together with the shipped amazonIsBlank_ / amazonKeyOf_ helpers.
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
  else { pass++; console.log('ok   ' + l); }
}

function readSrc(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/^﻿/, '');
}
// Slice a named function out of a CRLF/LF source at a known indent. Never reformats the body.
function sliceFn(src, name, indent) {
  var NL = src.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  var start = src.indexOf(indent + 'function ' + name + '(');
  if (start < 0) throw new Error('could not locate ' + name);
  var endMarker = NL + indent + '}' + NL;
  var end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error('could not close ' + name);
  return src.slice(start, end + endMarker.length);
}

// ============================================================ PART B — EU SHARED INVENTORY
console.log('\n-- PART B: Amazon EU shared inventory identity --');

var compat = require(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js'));
var IRCountry = compat.IRCountry;
global.window = { IRCountry: IRCountry };

var page = readSrc(path.join('js', 'pages', 'inventory-replenishment.js'));
var IR = (function () {
  var scopeSrc = [
    sliceFn(page, 'num', '  '),
    sliceFn(page, 'eq', '  '),
    sliceFn(page, 'ymd', '  '),
    sliceFn(page, '_irCountryMatch', '  '),
    sliceFn(page, 'latestSnapshot', '  '),
    sliceFn(page, 'stockCard', '  '),
    'return { latestSnapshot: latestSnapshot, stockCard: stockCard };'
  ].join('\n');
  return new Function('window', scopeSrc)(global.window);
})();

// Amazon Europe is ONE shared physical pool. The source Combined Sheet may carry EU + FR + DE + ES + IT
// rows for the SAME stock, so an EU site must read its own pool and must never roll the members up.
function invRow(country, qty) {
  return { sku: 'SKU-1', company: 'KM', country: country, marketplace: 'Amazon',
           snapshotDate: '2026-10-06', availableQty: qty, fcTransferQty: 0, fcProcessingQty: 0,
           customerOrderQty: 0, unfulfillableQty: 0 };
}
var euPool = [invRow('EU', 100), invRow('FR', 100), invRow('DE', 100), invRow('ES', 100), invRow('IT', 100)];
var euScope = { company: 'KM', country: 'EU', marketplace: 'Amazon', sku: 'SKU-1' };

var euStock = IR.stockCard(IR.latestSnapshot(euPool, euScope));
eq(euStock.available, 100, 'EUI-1: EU Current Stock = 100 (the EU pool), NOT 400 and NOT 500');
eq(euStock.available === 500, false, 'EUI-2: EU does NOT sum EU+FR+DE+ES+IT');
eq(euStock.available === 400, false, 'EUI-3: EU does NOT sum FR+DE+ES+IT');

// A country-specific context stays isolated in both directions.
eq(IR.stockCard(IR.latestSnapshot(euPool, { company: 'KM', country: 'FR', marketplace: 'Amazon', sku: 'SKU-1' })).available,
   100, 'EUI-4: FR site reads FR only');
eq(IR.latestSnapshot([invRow('FR', 100), invRow('DE', 100)], euScope),
   null, 'EUI-5: EU scope with no EU row -> null (never a member substitute)');
eq(IR.latestSnapshot([invRow('EU', 100)], { company: 'KM', country: 'FR', marketplace: 'Amazon', sku: 'SKU-1' }),
   null, 'EUI-6: FR scope never reads the EU pool row');

// The matching predicate itself: inventory is alias-only, sales is an aggregation domain.
eq(IRCountry.matches('FR', 'EU'), false, 'EUI-7: inventory match FR->EU = false');
eq(IRCountry.matches('GB', 'UK'), true, 'EUI-8: UK=GB same-market alias still holds for inventory');
eq(IRCountry.salesSourceSet('EU', 'Amazon').aggregate, true, 'EUI-9: Amazon EU SALES still aggregates');
eq(IRCountry.salesSourceSet('EU', 'Amazon').members.slice().sort(), ['DE', 'ES', 'FR', 'IT'],
   'EUI-10: EU sales members = IT+DE+ES+FR (deliberately different from inventory)');

// Structural guard: Current Stock reads ONE row, so summation is not reachable by any input.
eq(/function latestSnapshot[\s\S]*?best = r;[\s\S]*?return best;/.test(page), true,
   'EUI-11: latestSnapshot returns a single best row (no accumulator)');
eq(/NO EU aggregation here/.test(page), true, 'EUI-12: the single-market intent is stated at the call site');

// ============================================================ PART A — BLANK SOURCE DATE
console.log('\n-- PART A: amazon_inventory_snapshot blank source Date --');

var helpers = readSrc(path.join('specs', 'active', 'apps-script', '10_amazon_import_helpers.gs'));
var runner = readSrc(path.join('specs', 'active', 'apps-script', '07_amazon_import_runner.gs'));
var config = readSrc(path.join('specs', 'active', 'apps-script', '06_amazon_import_config.gs'));

var amazonIsBlank_ = new Function('return ' + helpers.match(/function amazonIsBlank_\([\s\S]*?\}/)[0])();
var amazonKeyOf_ = new Function('return ' + sliceFn(helpers, 'amazonKeyOf_', ''))();

// The shipped gate, transcribed from 07_amazon_import_runner.gs:306-314 and asserted against it below.
function shippedRowGate(cfg, dest) {
  for (var nk = 0; nk < cfg.naturalKey.length; nk++) {
    if (amazonIsBlank_(dest[cfg.naturalKey[nk]])) {
      return { skipped: true, reason: 'missing_required_value', field: cfg.naturalKey[nk] };
    }
  }
  return { skipped: false, key: amazonKeyOf_(cfg, dest) };
}
eq(/if \(amazonIsBlank_\(dest\[config\.naturalKey\[nk\]\]\)\) \{ keyMissing = true;/.test(runner), true,
   'BD-0a: the gate transcribed above is the shipped gate');
eq(/if \(keyMissing\) \{ ctx\.rowsError\+\+; continue; \}/.test(runner), true,
   'BD-0b: a key-missing row is counted as an error and SKIPPED (never written)');
eq(/if \(amazonIsBlank_\(dest\[dfName\]\)\) continue; \/\/ emptiness handled by natural-key check/.test(runner), true,
   'BD-0c: the date-field loop defers blankness to the natural-key check (blank is not invalid_date)');

var INV_KEY = ['snapshot_date', 'country', 'marketplace', 'sku'];
eq(/destinationSheetName: 'amazon_inventory_snapshot',[\s\S]*?naturalKey: \['snapshot_date', 'country', 'marketplace', 'sku'\]/.test(config),
   true, 'BD-1: shipped amazon_inventory_snapshot naturalKey includes snapshot_date');

var cfgInv = { naturalKey: INV_KEY };
var validRow = { snapshot_date: '2026-10-06', country: 'EU', marketplace: 'Amazon', sku: 'SKU-1', available_qty: 500 };
var blankDateRow = { snapshot_date: '', country: 'EU', marketplace: 'Amazon', sku: 'SKU-1', available_qty: 500 };

eq(shippedRowGate(cfgInv, validRow).skipped, false, 'BD-2: a dated inventory row imports');
eq(shippedRowGate(cfgInv, blankDateRow).skipped, true,
   'BD-3: TODAY a blank source Date DROPS an otherwise valid inventory row');
eq(shippedRowGate(cfgInv, blankDateRow).field, 'snapshot_date', 'BD-4: the dropped field is snapshot_date');

// The DESIRED contract, recorded as an executable expectation. It is NOT shipped — this test proves the
// relaxed key would admit the row, and that the identity fields still fail closed. Nothing is changed.
var cfgRelaxed = { naturalKey: ['country', 'marketplace', 'sku'] };
eq(shippedRowGate(cfgRelaxed, blankDateRow).skipped, false,
   'BD-5: DESIRED — country+marketplace+sku admits a blank-date inventory row');
eq(shippedRowGate(cfgRelaxed, { snapshot_date: '', country: '', marketplace: 'Amazon', sku: 'SKU-1' }).field,
   'country', 'BD-6: DESIRED — blank country still fails closed');
eq(shippedRowGate(cfgRelaxed, { snapshot_date: '', country: 'EU', marketplace: 'Amazon', sku: '' }).field,
   'sku', 'BD-7: DESIRED — blank sku still fails closed');

// Collision implication of the relaxed key, measured rather than asserted: the key is the in-batch dedup
// key, so two source rows for one country+sku on DIFFERENT dates would collapse to the first.
var twoDates = [
  { snapshot_date: '2026-10-05', country: 'EU', marketplace: 'Amazon', sku: 'SKU-1' },
  { snapshot_date: '2026-10-06', country: 'EU', marketplace: 'Amazon', sku: 'SKU-1' }
];
var keysNow = twoDates.map(function (r) { return amazonKeyOf_(cfgInv, r); });
var keysRelaxed = twoDates.map(function (r) { return amazonKeyOf_(cfgRelaxed, r); });
eq(keysNow[0] === keysNow[1], false, 'BD-8: today two dates are two distinct rows');
eq(keysRelaxed[0] === keysRelaxed[1], true,
   'BD-9: RISK — under the relaxed key two dates collide; only the FIRST survives');

// Why that risk is bounded for THIS table: it is a full snapshot rewrite, not a rolling upsert.
var invBlock = config.slice(config.indexOf("destinationSheetName: 'amazon_inventory_snapshot'"),
                            config.indexOf("destinationSheetName: 'amazon_inventory_health_snapshot'"));
eq(/writeMode: 'rolling_upsert'/.test(invBlock), false,
   'BD-10: amazon_inventory_snapshot has NO rolling_upsert -> full snapshot rewrite each run');
eq(/sh\.getRange\(2, 1, lastRow - 1, lastCol\)\.clearContent\(\)/.test(
   readSrc(path.join('specs', 'active', 'apps-script', '09_amazon_import_writer_logger.gs'))), true,
   'BD-11: the full-rewrite writer clears every data row before writing');

// The relaxation is scoped to inventory ONLY. Date-semantic datasets keep snapshot_date in the key.
eq(/destinationSheetName: 'amazon_daily_sales_snapshot'[\s\S]*?naturalKey: \['snapshot_date', 'country', 'marketplace', 'channel', 'sku'\]/.test(config),
   true, 'BD-12: amazon_daily_sales_snapshot keeps snapshot_date in its key (NOT relaxed)');
eq(/destinationSheetName: 'amazon_weekly_sales_snapshot'[\s\S]*?naturalKey: \['snapshot_week', 'country', 'marketplace', 'channel', 'sku'\]/.test(config),
   true, 'BD-13: amazon_weekly_sales_snapshot keeps snapshot_week in its key (NOT relaxed)');

if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS') + '  |  passed ' + pass + '  failed ' + fail);
process.exit(fail ? 1 : 0);
