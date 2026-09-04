// R6F2G7A — compact, non-truncated true-zero-write authority; explicit EXCLUDED / OPTIONAL_PRESERVE / REQUIRED_OR_STRICT
// field classes (no wildcard blank-preserve). F1-7N-FA-3C-DRAFT-MODEL-R6F2G7A.
// Run: node assets/tests/inventory-k2-compact-semantic-authority-f1-7n-fa-3c-r6f2g7a.test.js
//
// A tightens the blank-incoming contract: a stored-nonblank REQUIRED authority that the incoming omits is a blocking
// MISSING_REQUIRED_INCOMING_FIELD (not a silent preserve); only the fields KMWRR structurally omits AND the writer
// preserves-on-omit are OPTIONAL_PRESERVE; only status/line_status are EXCLUDED. B adds a single compact authority log
// (counts + short distinct field lists only). The authorization can never depend on a truncated Logger entry.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6F2G7A COMPACT-AUTHORITY: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
var G16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');

var LOAD = [];
['SAD_K2_HEADER_FP_', 'SAD_K2_LINE_FP_', 'SAD_K2_FP_DATE_FIELDS_', 'SAD_K2_FP_NUMERIC_FIELDS_', 'SAD_K2_SEM_CONTRACT_', 'SAD_K2_SEM_EXCLUDED_LIFECYCLE_', 'SAD_K2_SEM_OPTIONAL_PRESERVE_'].forEach(function (n) { LOAD.push(G16.match(new RegExp('var ' + n + ' = [\\[{\'][\\s\\S]*?[\\]}\'];'))[0]); });
['sadFnv1a_', 'sadCanonDate_', 'sadFpNorm_', 'sadK2SemFieldClass_', 'sadK2LineIdentity_', 'sadK2SemFieldVerdict_', 'sadK2SemFieldEqual_', 'sadK2SemanticPayloadEqual_'].forEach(function (n) { LOAD.push(extractFn(G16, n)); });
['TEMP_r5bHash_', 'TEMP_r6f2g7SemChecksum_', 'TEMP_r6f2g7aExcludedExactStatusLineStatus_', 'TEMP_r6f2g7aAuthoritySummary_'].forEach(function (n) { LOAD.push(extractFn(TEMP, n)); });
eval(LOAD.join('\n'));

function D(iso) { return new Date(iso); }
// the exact live-shaped payload (stored: Sheets Date cells + numbers + lifecycle; incoming: KMWRR shape — no status /
// line_status, date STRINGS, and structurally OMITS the evidence snapshots + header code snapshots + line route_no).
function liveStored() { return { header: { status: 'draft', recommended_source_warehouse_id: 'WH-TW', recommended_destination_warehouse_id: '', recommended_source_warehouse_code_snapshot: '', recommended_destination_warehouse_code_snapshot: '', recommendation_group_no: 1, recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA' }, lines: [{ sku: 'KM-001', site_sku: 'B00AAA111', window_code: 'W1', window_start_date: D('2026-08-23T00:00:00+08:00'), window_end_date: D('2026-08-30T00:00:00+08:00'), required_by_date: D('2026-09-01T00:00:00+08:00'), recommended_qty: 100, planned_qty: 100, source_warehouse_id: 'WH-TW', source_warehouse_code_snapshot: 'TW1', units_per_carton: 20, route_no: '', line_status: 'active', regular_demand_snapshot: 12.5, calculated_gap_qty: 100, destination_stock_snapshot: 0 }] }; }
function liveIncoming() { return { header: { recommended_source_warehouse_id: 'WH-TW', recommended_destination_warehouse_id: '', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1' }, lines: [{ sku: 'KM-001', site_sku: 'B00AAA111', window_code: 'W1', window_start_date: '2026-08-23', window_end_date: '2026-08-30', required_by_date: '2026-09-01', recommended_qty: 100, planned_qty: 100, source_warehouse_id: 'WH-TW', source_warehouse_code_snapshot: 'TW1', units_per_carton: 20 }] }; }

// ============================================================ 1 — stored nonblank REQUIRED field + incoming blank refuses
section('1. required stored-nonblank + incoming blank → refuses');
eq(sadK2SemFieldVerdict_('recommended_qty', 100, '').category, 'MISSING_REQUIRED_INCOMING_FIELD', '1. required recommended_qty stored 100 + incoming blank → MISSING_REQUIRED_INCOMING_FIELD');
eq(sadK2SemFieldEqual_('recommended_qty', 100, ''), false, '1. → NOT equal (never a silent preserve)');
eq(sadK2SemFieldEqual_('source_warehouse_id', 'WH-TW', ''), false, '1. required warehouse authority stored + incoming blank → NOT equal');
eq(sadK2SemFieldVerdict_('destination_stock_snapshot', 0, '').category, 'OPTIONAL_PRESERVE_OMITTED', '1. by contrast a PROVEN optional-preserve snapshot omitted → OPTIONAL_PRESERVE_OMITTED (equal)');

// ============================================================ 2 — both blank passes
section('2. both blank → equal');
eq(sadK2SemFieldVerdict_('recommended_qty', '', '').category, 'BOTH_BLANK', '2. required both-blank → BOTH_BLANK');
eq(sadK2SemFieldEqual_('recommended_qty', '', ''), true, '2. required both-blank → equal');
eq(sadK2SemFieldEqual_('destination_stock_snapshot', null, undefined), true, '2. optional both-blank → equal');

// ============================================================ 3 — zero/false are real nonblank values
section('3. zero/false ≠ blank');
eq(sadK2SemFieldEqual_('recommended_qty', 0, '0'), true, '3. 0 vs "0" → equal (both nonblank)');
eq(sadK2SemFieldEqual_('recommended_qty', '', '0'), false, '3. blank vs provided 0 → NOT equal (blank≠zero)');
eq(sadK2SemFieldEqual_('recommendation_flags', '', 'false'), false, '3. blank vs provided "false" → NOT equal (blank≠false)');
eq(sadK2SemFieldVerdict_('recommended_qty', 0, '').category, 'MISSING_REQUIRED_INCOMING_FIELD', '3. stored 0 (nonblank) + incoming omitted required → MISSING_REQUIRED (0 is not blank)');

// ============================================================ 4 — only status/line_status excluded by default
section('4. exactly status + line_status excluded');
eq(Object.keys(SAD_K2_SEM_EXCLUDED_LIFECYCLE_).sort(), ['line_status', 'status'], '4. EXCLUDED_LIFECYCLE = exactly status + line_status');
eq(TEMP_r6f2g7aExcludedExactStatusLineStatus_(), true, '4. excluded-exact proof helper true');
eq(sadK2SemFieldClass_('status'), 'EXCLUDED_LIFECYCLE', '4. status → EXCLUDED_LIFECYCLE');
eq(sadK2SemFieldClass_('line_status'), 'EXCLUDED_LIFECYCLE', '4. line_status → EXCLUDED_LIFECYCLE');
eq(sadK2SemFieldClass_('recommended_qty'), 'REQUIRED_OR_STRICT', '4. recommended_qty → REQUIRED_OR_STRICT (not excluded)');
eq(sadK2SemFieldClass_('sku'), 'REQUIRED_OR_STRICT', '4. sku identity → REQUIRED_OR_STRICT');
eq(sadK2SemFieldClass_('recommended_shipping_method'), 'REQUIRED_OR_STRICT', '4. method authority → REQUIRED_OR_STRICT');
eq(sadK2SemFieldClass_('destination_stock_snapshot'), 'OPTIONAL_PRESERVE', '4. evidence snapshot → OPTIONAL_PRESERVE (proven from the writer contract)');
eq(sadK2SemFieldClass_('recommended_source_warehouse_code_snapshot'), 'OPTIONAL_PRESERVE', '4. header code snapshot (KMWRR never emits) → OPTIONAL_PRESERVE');

// ============================================================ 5 — unknown / unparseable refuses
section('5. unparseable → refuses');
eq(sadK2SemFieldVerdict_('recommended_qty', 100, 'abc').category, 'UNKNOWN_UNPARSEABLE', '5. numeric field, incoming non-numeric → UNKNOWN_UNPARSEABLE');
eq(sadK2SemFieldEqual_('recommended_qty', 100, 'abc'), false, '5. → NOT equal (fail closed)');
eq(sadK2SemFieldVerdict_('window_start_date', D('2026-08-23T00:00:00+08:00'), 'not-a-date').category, 'UNKNOWN_UNPARSEABLE', '5. date field, incoming unparseable → UNKNOWN_UNPARSEABLE');

// ============================================================ 6 — compact output below the Apps Script logging limit
section('6. compact, non-truncated');
var envelope = TEMP_r6f2g7aAuthoritySummary_(liveStored(), liveIncoming());
var wrapped = { tool: 'TEMP_R6F2G7A_SUMMARIZE_TRUE_ZERO_WRITE_AUTHORITY', mode: 'x', comparator_contract: envelope.comparator_contract, frozen_scope_validated: true, exact_five_line_membership: true, may_run_reuse_verifier: envelope.may_run_reuse_verifier_local, verdict: 'TRUE_ZERO_WRITE_REUSE_AUTHORIZED', R6F2G7A_ZERO_WRITE_CONFIRMED: 'YES' };
Object.keys(envelope).forEach(function (k) { wrapped[k] = envelope[k]; });
var compactLen = JSON.stringify(wrapped).length;
ok(compactLen < 8192, '6. compact primary log < 8192 bytes (actual ' + compactLen + ')');
// no full per-field arrays: the envelope carries counts + DISTINCT field-name lists only, never one entry per FP field
ok(!envelope.hasOwnProperty('header_field_diff') && !envelope.hasOwnProperty('line_field_diff') && !envelope.hasOwnProperty('fields'), '6. no full per-field diff arrays in the compact envelope');
ok(envelope.stored_nonblank_incoming_omitted_fields.length <= SAD_K2_LINE_FP_.length && envelope.true_business_difference_fields.length <= SAD_K2_LINE_FP_.length, '6. blocking lists are distinct-field-name (bounded), not per-line arrays');
// the GAS entrypoint emits ONE primary compact log line + reads only the envelope
var entry = extractFn(TEMP, 'TEMP_R6F2G7A_SUMMARIZE_TRUE_ZERO_WRITE_AUTHORITY');
ok((entry.match(/Logger\.log\('R6F2G7A_SUMMARY /g) || []).length >= 1 && !/JSON\.stringify\(out, null, 2\)/.test(entry), '6. entrypoint logs the compact envelope (no pretty-printed multi-KB dump)');
ok(/ONE_COMPACT_PRIMARY_LOG_ENTRY/.test(entry), '6. entrypoint declares the compact one-log output contract');

// ============================================================ 7 — live-shaped fixture → all-zero blocking counts
section('7. live-shaped fixture authorizes');
eq(envelope.semantic_checksums_equal, true, '7. required-strict semantic checksums equal');
eq(envelope.stored_nonblank_incoming_omitted_business_count, 0, '7. zero required fields omitted');
eq(envelope.missing_required_incoming_count, 0, '7. zero missing-required');
eq(envelope.unknown_unparseable_count, 0, '7. zero unparseable');
eq(envelope.true_business_difference_count, 0, '7. zero true-business differences');
eq(envelope.normalized_diff_count, 0, '7. zero normalized diffs');
eq(envelope.exact_line_membership, true, '7. exact line membership');
eq(envelope.excluded_exactly_status_and_line_status, true, '7. excluded exactly status + line_status');
eq(envelope.predicted_production_outcome, 'REUSED', '7. predicted REUSED');
eq(envelope.may_run_reuse_verifier_local, true, '7. local may-run gate true (all blocking counts zero)');
ok(envelope.optional_preserve_omitted_count >= 1, '7. the omitted evidence snapshot(s) surface as OPTIONAL_PRESERVE_OMITTED (non-blocking, transparent)');
ok(envelope.optional_preserve_fields.indexOf('destination_stock_snapshot') !== -1 && envelope.optional_preserve_fields.indexOf('route_no') !== -1, '7. optional-preserve whitelist is explicit + populated');

// ============================================================ 8 — may_run cannot be true when any blocking count is nonzero
section('8. any blocking count → may_run false');
// (a) a required field omitted with a stored nonblank value
var storedA = liveStored(); var incA = liveIncoming(); delete incA.lines[0].recommended_qty;
var envA = TEMP_r6f2g7aAuthoritySummary_(storedA, incA);
ok(envA.missing_required_incoming_count >= 1 && envA.may_run_reuse_verifier_local === false, '8a. missing required recommended_qty → may_run false');
// (b) a genuine business difference
var storedB = liveStored(); var incB = liveIncoming(); incB.lines[0].planned_qty = 150;
var envB = TEMP_r6f2g7aAuthoritySummary_(storedB, incB);
ok(envB.true_business_difference_count >= 1 && envB.may_run_reuse_verifier_local === false, '8b. planned_qty 100→150 → true-business diff → may_run false');
// (c) an unparseable incoming
var storedC = liveStored(); var incC = liveIncoming(); incC.lines[0].units_per_carton = 'twenty';
var envC = TEMP_r6f2g7aAuthoritySummary_(storedC, incC);
ok(envC.unknown_unparseable_count >= 1 && envC.may_run_reuse_verifier_local === false, '8c. unparseable units_per_carton → may_run false');
// (d) membership drift (extra distinct-identity line)
var storedD = liveStored(); var incD = liveIncoming(); incD.lines.push({ sku: 'KM-002', site_sku: 'B00BBB', window_code: 'W1', recommended_qty: 5, planned_qty: 5 });
var envD = TEMP_r6f2g7aAuthoritySummary_(storedD, incD);
ok(envD.exact_line_membership === false && envD.may_run_reuse_verifier_local === false, '8d. extra line → membership false → may_run false');
// (e) a nonblank OPTIONAL_PRESERVE field that genuinely differs still blocks (only OMISSION is a no-op)
var storedE = liveStored(); var incE = liveIncoming(); incE.lines[0].destination_stock_snapshot = 5;
var envE = TEMP_r6f2g7aAuthoritySummary_(storedE, incE);
ok(envE.true_business_difference_count >= 1 && envE.may_run_reuse_verifier_local === false, '8e. optional field PROVIDED with a different value (0→5) → real change → may_run false');

// ============================================================ 9 — exact retry still returns before every write (source-fact)
section('9. atomic REUSE returns before any mutation');
var core = extractFn(G16, 'sadSchemaGenerationColumns_') + '\n' + extractFn(G16, 'sadSupportedSchemaVersions_') + '\n' + extractFn(G16, 'sadAiK2IntentEvidence_', 'sadResolveHeaderSchema_') + '\n' + extractFn(G16, 'sadDraftsSchemaReason_') + '\n' + extractFn(G16, 'sadAtomicUpsertCore_');
var reuseIdx = core.indexOf('reused: true'), regenIdx = core.indexOf("outcome = 'REGENERATE'"), uaIdx = core.indexOf("setCol('updated_at'");
ok(/priorFp === incFp \|\| sadK2SemanticPayloadEqual_\(/.test(core), '9. atomic REUSE gate uses sadK2SemanticPayloadEqual_ (the R6F2G7A comparator)');
ok(reuseIdx !== -1 && reuseIdx < regenIdx && (uaIdx === -1 || reuseIdx < uaIdx), '9. zero-write REUSE return precedes REGENERATE + any updated_at write');
ok(/SEMANTIC_EQUIVALENT@' \+ SAD_K2_SEM_CONTRACT_/.test(core), '9. reuse_basis carries the semantic contract version');
ok(/R6F2G7A-SEM-V3/.test(G16), '9. contract bumped to R6F2G7A-SEM-V3');

// ============================================================ 10 — read-only entrypoint makes no mutation
section('10. entrypoint read-only');
ok(!/\.setValue\(|\.setValues\(|\.appendRow\(|\.deleteRow\(|\.setProperty\(|\.clearContent\(/.test(entry), '10. summarize entrypoint makes no write call');
ok(/R6F2G7A_ZERO_WRITE_CONFIRMED/.test(entry) && /no atomic-writer call/.test(entry), '10. entrypoint declares zero-write');

done();
