// HOTFIX A2 — Amazon Daily Sales historical duplicate DRY-RUN analyzer tests.
// Verifies the PURE analyzer in assets/js/core/amazon-daily-sales-dedup.js:
//  (1) its date normalization is BYTE-COMPATIBLE with the ACTUAL importer
//      amazonNormalizeDate_ (extracted+eval'd from 10_amazon_import_helpers.gs — not a re-impl);
//  (2) duplicate-group classification (IDENTICAL / METADATA_ONLY / CONFLICTING / INVALID_KEY);
//  (3) last-wins winner = later input-row order (mirrors importer 09_ line 128-129);
//  (4) auto-eligible vs review-required vs blocked counts;
//  (5) deterministic before/after projected row counts;
//  (6) mixed Date/string representation of one day merges into one key;
//  (7) source_row_hash audit; (8) CONFLICTING facts are NOT auto-cleaned;
//  (9) the dry-run plan keep/remove set (never applied).
// Run: node assets/tests/amazon-daily-sales-dedup.test.js

var fs = require('fs');
var path = require('path');
var DD = require('../js/core/amazon-daily-sales-dedup.js');

// ---- extract the REAL importer date normalizer for byte-compat proof --------
function readGs(name) { return fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', name), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('source function not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced braces: ' + name);
}
// Fake Utilities.formatDate that uses the SAME en-CA/tz rendering the analyzer uses,
// so any residual difference must come from the ALGORITHM (regex/branch), not tz math.
var Utilities = {
  formatDate: function (date, tz, fmt) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
};
var GS10 = readGs('10_amazon_import_helpers.gs');
eval(extractFn(GS10, 'amazonPad2_'));
eval(extractFn(GS10, 'amazonNormalizeDate_'));

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

function taipeiDate(y, m, d) { return new Date(Date.UTC(y, m - 1, d) - 8 * 3600 * 1000); }

// ===========================================================================
console.log('\n-- N. Date normalization byte-compatible with importer amazonNormalizeDate_ --');
var samples = ['2026-07-30', '2026/7/5', '2026-07-30T00:00:00', 'not-a-date', '', '2026-13-40'];
for (var s = 0; s < samples.length; s++) {
  var mine = DD.normalizeSnapshotDate(samples[s], 'Asia/Taipei');
  var theirs = amazonNormalizeDate_(samples[s]);
  eq({ ok: mine.ok, value: mine.value }, { ok: theirs.ok, value: theirs.value }, 'N string "' + samples[s] + '" matches importer');
}
var dMine = DD.normalizeSnapshotDate(taipeiDate(2026, 7, 30), 'Asia/Taipei');
var dTheirs = amazonNormalizeDate_(taipeiDate(2026, 7, 30));
eq({ ok: dMine.ok, value: dMine.value }, { ok: dTheirs.ok, value: dTheirs.value }, 'N Date object matches importer');
eq(DD.normalizeSnapshotDate(taipeiDate(2026, 7, 30)).value, DD.normalizeSnapshotDate('2026-07-30').value, 'N Date and string collapse to identical value');

// ===========================================================================
var HEADER = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'currency', 'sales_units', 'sales_amount', 'total_orders', 'source_row_hash', 'sync_batch_id', 'synced_at', 'updated_at'];
function row(date, sku, units, amount, orders, hash, batch, synced) {
  return [date, 'US', 'Amazon', 'Amazon', sku, 'USD', units, amount, orders, hash, batch, synced, synced];
}

console.log('\n-- C. Duplicate-group classification --');
// IDENTICAL_FACTS: exact same facts AND metadata.
var A = DD.analyzeAmazonDailySalesDuplicates({ headers: HEADER, rows: [
  row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H1', 'B1', '2026-07-31 16:00:00'),
  row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H1', 'B1', '2026-07-31 16:00:00')
] });
eq({ dup: A.duplicateGroupCount, extra: A.duplicateExtraRowCount, ident: A.identicalFactGroups, meta: A.metadataOnlyGroups, conf: A.conflictingFactGroups }, { dup: 1, extra: 1, ident: 1, meta: 0, conf: 0 }, 'C1 identical facts+metadata → IDENTICAL_FACTS');
eq({ auto: A.autoEligibleGroups, proj: A.projectedOutputRows }, { auto: 1, proj: 1 }, 'C1b auto-eligible, projects to 1 row');

// METADATA_ONLY: same facts, different sync metadata + mixed Date/string date representation.
var M = DD.analyzeAmazonDailySalesDuplicates({ headers: HEADER, rows: [
  row(taipeiDate(2026, 7, 30), 'CO1100-R', 5, 50, 3, 'H1', 'B1', '2026-07-31 16:00:00'),
  row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H2', 'B2', '2026-08-01 16:00:00')
] });
eq({ dup: M.duplicateGroupCount, meta: M.metadataOnlyGroups, ident: M.identicalFactGroups, auto: M.autoEligibleGroups }, { dup: 1, meta: 1, ident: 0, auto: 1 }, 'C2 same facts, diff metadata, mixed Date/string → METADATA_ONLY (auto-eligible)');
ok(M.groups[0].winnerSheetRow === 3, 'C2b winner = later row (sheet row 3, last-wins)');

// CONFLICTING_FACTS: sales_units differ → review required, NOT auto-cleaned.
var K = DD.analyzeAmazonDailySalesDuplicates({ headers: HEADER, rows: [
  row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H1', 'B1', '2026-07-31 16:00:00'),
  row('2026-07-30', 'CO1100-R', 9, 90, 6, 'H2', 'B2', '2026-08-01 16:00:00')
] });
eq({ conf: K.conflictingFactGroups, review: K.reviewRequiredGroups, auto: K.autoEligibleGroups, proj: K.projectedOutputRows }, { conf: 1, review: 1, auto: 0, proj: 2 }, 'C3 conflicting facts → REVIEW_REQUIRED, both rows RETAINED (not auto-cleaned)');
ok(K.groups[0].businessFactDiffs.length >= 1, 'C3b conflicting business-field diffs reported');

// INVALID_KEY: blank sku and bad date.
var I = DD.analyzeAmazonDailySalesDuplicates({ headers: HEADER, rows: [
  row('2026-07-30', '', 5, 50, 3, 'H1', 'B1', 't'),
  row('garbage', 'CO1100-R', 5, 50, 3, 'H2', 'B2', 't')
] });
eq({ invalid: I.invalidKeyRows, blocked: I.blockedGroups, dup: I.duplicateGroupCount, proj: I.projectedOutputRows }, { invalid: 2, blocked: 2, dup: 0, proj: 2 }, 'C4 blank-sku + bad-date → INVALID_KEY (blocked, retained, never deduped)');

console.log('\n-- W. Winner rule = later input-row order (last-wins) --');
var W = DD.analyzeAmazonDailySalesDuplicates({ headers: HEADER, rows: [
  row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H1', 'B1', 'early'),
  row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H2', 'B2', 'mid'),
  row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H3', 'B3', 'late')
] });
eq({ winnerIdx: W.groups[0].winnerIndex, remove: W.groups[0].proposedRemoveIndexes, maxPerKey: W.maxRowsPerKey }, { winnerIdx: 2, remove: [0, 1], maxPerKey: 3 }, 'W1 3-row group → keep last (index 2), remove [0,1]');

console.log('\n-- H. source_row_hash audit --');
eq({ allSame: A.groups[0].sourceRowHash.allSame }, { allSame: true }, 'H1 identical group → same source_row_hash (append-duplicate evidence)');
eq({ distinctCount: M.groups[0].sourceRowHash.distinctCount, allSame: M.groups[0].sourceRowHash.allSame }, { distinctCount: 2, allSame: false }, 'H2 metadata-only group → differing hashes surfaced');

console.log('\n-- P. Dry-run plan (pure, never applied) --');
var plan = DD.buildAmazonDailySalesDedupPlan({ headers: HEADER, rows: [
  row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H1', 'B1', 'a'),   // dup pair (auto)
  row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H1', 'B1', 'a'),
  row('2026-07-29', 'CO2200-B', 9, 90, 6, 'H2', 'B2', 'b'),   // conflicting pair (review)
  row('2026-07-29', 'CO2200-B', 8, 80, 5, 'H3', 'B3', 'c'),
  row('2026-07-28', 'CO3300-X', 1, 10, 1, 'H4', 'B4', 'd')    // unique
] });
eq({ applied: plan.applied, keep: plan.keepIndexes, remove: plan.removeIndexes, proj: plan.projectedOutputRows, review: plan.requiresManualReview }, { applied: false, keep: [1, 2, 3, 4], remove: [0], proj: 4, review: true }, 'P1 plan removes ONLY the auto-eligible EARLIER row (last-wins keeps index 1); conflicting pair retained; requiresManualReview flagged');

console.log('\n-- E. Empty / no-duplicate inputs --');
var Z = DD.analyzeAmazonDailySalesDuplicates({ headers: HEADER, rows: [] });
eq({ total: Z.totalInputRows, dup: Z.duplicateGroupCount, proj: Z.projectedOutputRows, range: Z.affectedDateRange }, { total: 0, dup: 0, proj: 0, range: null }, 'E1 empty input → zero groups, null range');
var U = DD.analyzeAmazonDailySalesDuplicates({ headers: HEADER, rows: [row('2026-07-30', 'CO1100-R', 5, 50, 3, 'H1', 'B1', 't')] });
eq({ dup: U.duplicateGroupCount, unique: U.uniqueKeyCount, proj: U.projectedOutputRows }, { dup: 0, unique: 1, proj: 1 }, 'E2 single unique row → no duplicates');

console.log('\n-- D. Determinism (JSON-safe, repeatable, no Sheet objects) --');
var r1 = JSON.stringify(DD.analyzeAmazonDailySalesDuplicates({ headers: HEADER, rows: [row('2026-07-30','CO1100-R',5,50,3,'H1','B1','t'), row('2026-07-30','CO1100-R',5,50,3,'H1','B1','t')] }));
var r2 = JSON.stringify(DD.analyzeAmazonDailySalesDuplicates({ headers: HEADER, rows: [row('2026-07-30','CO1100-R',5,50,3,'H1','B1','t'), row('2026-07-30','CO1100-R',5,50,3,'H1','B1','t')] }));
ok(r1 === r2, 'D1 identical input → byte-identical JSON output (deterministic)');
ok(r1.indexOf('getRange') < 0 && r1.indexOf('[object') < 0, 'D2 output contains no Sheet/Range objects');

console.log('\n-- T. Authorized derived-field numeric tolerance (HOTFIX A3-PREP §7, opt-in) --');
// buy_box_percentage "$100.00" vs "100": currency-format only, core identical.
function bboxRow(sku, bbox, units) { // header order: ...,unit_session_percentage,buy_box_percentage,...
  return ['2026-07-30', 'US', 'Amazon', 'Amazon', sku, 'USD', units, units * 10, units, 'H', 'B', 't', 't'];
}
// Extend header to carry the two derived fields explicitly.
var HDR2 = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'currency', 'sales_units', 'sales_amount', 'unit_session_percentage', 'buy_box_percentage', 'source_row_hash', 'sync_batch_id', 'synced_at'];
function drow(sku, units, usp, bbox, hash, batch) {
  return ['2026-07-30', 'US', 'Amazon', 'Amazon', sku, 'USD', units, units * 10, usp, bbox, hash, batch, 't'];
}
// OFF (default): $-format vs plain → CONFLICTING.
var TOFF = DD.analyzeAmazonDailySalesDuplicates({ headers: HDR2, rows: [drow('CO1100-R', 5, '33.33', '$100.00', 'H1', 'B1'), drow('CO1100-R', 5, '33', '100', 'H1', 'B2')] });
eq({ conf: TOFF.conflictingFactGroups, review: TOFF.reviewRequiredGroups, auth: TOFF.authorizedDerivedFormatGroups }, { conf: 1, review: 1, auth: 0 }, 'T1 tolerance OFF → derived-field diff stays CONFLICTING (A2 behaviour preserved)');
// ON: same rows → AUTO (METADATA_ONLY), authorized-derived-format group counted.
var TON = DD.analyzeAmazonDailySalesDuplicates({ headers: HDR2, rows: [drow('CO1100-R', 5, '33.33', '$100.00', 'H1', 'B1'), drow('CO1100-R', 5, '33', '100', 'H1', 'B2')], tolerantDerivedFields: true });
eq({ conf: TON.conflictingFactGroups, meta: TON.metadataOnlyGroups, auto: TON.autoEligibleGroups, review: TON.reviewRequiredGroups, auth: TON.authorizedDerivedFormatGroups, applied: TON.tolerantDerivedFieldsApplied }, { conf: 0, meta: 1, auto: 1, review: 0, auth: 1, applied: ['buy_box_percentage', 'unit_session_percentage'] }, 'T2 tolerance ON → derived-field-only diff becomes AUTO_ELIGIBLE (authorized)');
ok(TON.groups[0].toleranceApplied === true, 'T2b group flagged toleranceApplied');
// Core measure difference is NEVER tolerated, even with tolerance ON.
var TCORE = DD.analyzeAmazonDailySalesDuplicates({ headers: HDR2, rows: [drow('CO1100-R', 5, '33', '100', 'H1', 'B1'), drow('CO1100-R', 9, '33', '100', 'H2', 'B2')], tolerantDerivedFields: true });
eq({ conf: TCORE.conflictingFactGroups, review: TCORE.reviewRequiredGroups }, { conf: 1, review: 1 }, 'T3 core sales_units difference stays CONFLICTING despite tolerance');
// Non-numeric derived value → strict fallback → CONFLICTING even with tolerance ON.
var TNAN = DD.analyzeAmazonDailySalesDuplicates({ headers: HDR2, rows: [drow('CO1100-R', 5, 'N/A', '100', 'H1', 'B1'), drow('CO1100-R', 5, '33', '100', 'H1', 'B2')], tolerantDerivedFields: true });
eq({ conf: TNAN.conflictingFactGroups }, { conf: 1 }, 'T4 non-numeric derived value → strict fallback → CONFLICTING (not silently tolerated)');
// A caller CANNOT make a core field tolerant.
var TGUARD = DD.analyzeAmazonDailySalesDuplicates({ headers: HDR2, rows: [drow('CO1100-R', 5, '33', '100', 'H1', 'B1'), drow('CO1100-R', 9, '33', '100', 'H2', 'B2')], tolerantDerivedFields: ['sales_units'] });
eq({ conf: TGUARD.conflictingFactGroups, applied: TGUARD.tolerantDerivedFieldsApplied }, { conf: 1, applied: [] }, 'T5 core field cannot be forced tolerant (guard ignores it)');

if (fail === 0) console.log('\nAll Amazon daily-sales dedup dry-run assertions passed (' + pass + ' assertions)');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
