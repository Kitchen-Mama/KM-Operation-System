// R6F2G6 — TRUE zero-write REUSE: resolve the REGENERATED-vs-REUSED contradiction + prove a physical no-op.
// F1-7N-FA-3C-DRAFT-MODEL-R6F2G6. Run: node assets/tests/inventory-k2-true-zero-write-reuse-f1-7n-fa-3c-r6f2g6.test.js
//
// ROOT CAUSE proven here: the REUSE-vs-REGENERATE fingerprint sadK2PayloadFingerprint_ compares sadFpVal_
// (plain String().trim()). A persisted DATE field (window_start_date/…) read back as a Date object stringifies to a JS
// date string while the incoming KMWRR value is 'yyyy-MM-dd' → priorFp !== incFp → the atomic writer took REGENERATE
// (physical in-place setValue on header route/lineage + draft_version++ + every line updated_at) at row delta 0/0.
// FIX: sadK2SemanticPayloadEqual_ re-compares the SAME FP fields through a representation-robust normalizer so a
// coercion-only difference is a true no-op (REUSE, zero write); a genuine value change still REGENERATEs. The verifier
// now returns REUSED only when every group outcome is REUSED AND the before/after CONTENT checksum is byte-equal.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6F2G6 TRUE-ZERO-WRITE-REUSE: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
var G16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');

var LOAD = [];
['SAD_K2_HEADER_FP_', 'SAD_K2_LINE_FP_', 'SAD_K2_FP_DATE_FIELDS_', 'SAD_K2_FP_NUMERIC_FIELDS_'].forEach(function (n) { LOAD.push(G16.match(new RegExp('var ' + n + ' = [\\[{][\\s\\S]*?[\\]}];'))[0]); });
['sadFnv1a_', 'sadFpVal_', 'sadK2PayloadFingerprint_', 'sadCanonDate_', 'sadFpNorm_', 'sadK2SemanticPayloadEqual_'].forEach(function (n) { LOAD.push(extractFn(G16, n)); });
LOAD.push(extractFn(TEMP, 'TEMP_r6f2gReuseVerdict_'));
eval(LOAD.join('\n'));

// ============================================================ A — root cause + fix (semantic equality)
section('A. root cause: Date/number coercion in the REUSE fingerprint');
// canonical date normalization (Asia/Taipei) — a Date object and its yyyy-MM-dd string canonicalize equal, no day shift
eq(sadCanonDate_(new Date('2026-08-23T00:00:00+08:00')), '2026-08-23', 'A1. a Taipei-midnight Date → 2026-08-23 (no day shift)');
eq(sadCanonDate_('2026-08-23'), '2026-08-23', 'A1. a yyyy-MM-dd string → 2026-08-23');
eq(sadCanonDate_(''), '', 'A1. blank → blank');
eq(sadFpNorm_('recommended_qty', 100), sadFpNorm_('recommended_qty', '100'), 'A2. numeric field: number 100 == string "100"');
eq(sadFpNorm_('recommended_qty', 100.0), '100', 'A2. numeric field: 100.0 → "100"');
eq(sadFpNorm_('sku', 'A '), 'A', 'A2. text field: trimmed');
// the exact defect fixture: stored line carries a Date for window_start_date; incoming carries the string
var hdr = { status: 'draft', recommended_source_warehouse_id: 'WH-TW', recommended_destination_warehouse_id: '', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1' };
var storedLines = [{ sku: 'S1', site_sku: 'S1-JP', window_code: 'W1', window_start_date: new Date('2026-08-23T00:00:00+08:00'), required_by_date: new Date('2026-09-01T00:00:00+08:00'), recommended_qty: 100, planned_qty: 100, source_warehouse_id: 'WH-TW' }];
var incLines = [{ sku: 'S1', site_sku: 'S1-JP', window_code: 'W1', window_start_date: '2026-08-23', required_by_date: '2026-09-01', recommended_qty: 100, planned_qty: 100, source_warehouse_id: 'WH-TW' }];
var incHdr = JSON.parse(JSON.stringify(hdr));
ok(sadK2PayloadFingerprint_(hdr, storedLines) !== sadK2PayloadFingerprint_(incHdr, incLines), 'A3. RAW fingerprints DIFFER (Date cell vs string) — this is why the live run REGENERATED');
ok(sadK2SemanticPayloadEqual_(hdr, storedLines, incHdr, incLines) === true, 'A4. FIX: sadK2SemanticPayloadEqual_ recognises the payload as a true no-op → REUSE (zero write)');

// ============================================================ B — atomic core routes representation-equiv → REUSE (before any write)
section('B. atomic core REUSE early-return precedes every mutation');
var core = extractFn(G16, 'sadAtomicUpsertCore_');
ok(/priorFp === incFp \|\| sadK2SemanticPayloadEqual_\(priorHeaderObj, priorLines, header, lines\)/.test(core), 'B1. REUSE condition = raw-fingerprint-equal OR semantic-equivalent');
var reuseIdx = core.indexOf("reused: true");
var regenIdx = core.indexOf("outcome = 'REGENERATE'");
var updatedAtIdx = core.indexOf("setCol('updated_at'");
ok(reuseIdx !== -1 && regenIdx !== -1 && reuseIdx < regenIdx, 'B2. the zero-write REUSE return precedes the REGENERATE branch');
ok(updatedAtIdx === -1 || reuseIdx < updatedAtIdx, 'B3. the REUSE return precedes any updated_at write (no audit-field change on REUSE)');
ok(/zero_write: true/.test(core.slice(reuseIdx - 200, reuseIdx + 200)), 'B3. the REUSE return is stamped zero_write:true');

// ============================================================ C — legitimate change still REGENERATEs (MANUAL_REGENERATE preserved)
section('C. genuine change is NOT collapsed');
var changedQty = [{ sku: 'S1', site_sku: 'S1-JP', window_code: 'W1', window_start_date: '2026-08-23', required_by_date: '2026-09-01', recommended_qty: 100, planned_qty: 150, source_warehouse_id: 'WH-TW' }];
ok(sadK2SemanticPayloadEqual_(hdr, storedLines, incHdr, changedQty) === false, 'C1. a genuine planned_qty change (100→150) is NOT semantic-equal → REGENERATE (MANUAL_REGENERATE preserved)');
var changedSku = [{ sku: 'S2', site_sku: 'S1-JP', window_code: 'W1', window_start_date: '2026-08-23', required_by_date: '2026-09-01', recommended_qty: 100, planned_qty: 100, source_warehouse_id: 'WH-TW' }];
ok(sadK2SemanticPayloadEqual_(hdr, storedLines, incHdr, changedSku) === false, 'C2. a changed SKU is not semantic-equal → does not reuse');
var changedDate = [{ sku: 'S1', site_sku: 'S1-JP', window_code: 'W1', window_start_date: '2026-08-24', required_by_date: '2026-09-01', recommended_qty: 100, planned_qty: 100, source_warehouse_id: 'WH-TW' }];
ok(sadK2SemanticPayloadEqual_(hdr, storedLines, incHdr, changedDate) === false, 'C3. a genuinely different date (23→24) is not collapsed');
var changedHdr = JSON.parse(JSON.stringify(hdr)); changedHdr.recommended_shipping_method = 'AIR';
ok(sadK2SemanticPayloadEqual_(hdr, storedLines, changedHdr, incLines) === false, 'C4. a changed header route field is not semantic-equal');
// line-count change is not equal
ok(sadK2SemanticPayloadEqual_(hdr, storedLines, incHdr, incLines.concat(incLines)) === false, 'C5. a different line count is not semantic-equal');

// ============================================================ D — fail-closed verifier verdict (never row-count alone)
section('D. verifier: REUSED only when every group outcome REUSED + content checksum unchanged');
eq(TEMP_r6f2gReuseVerdict_(true, { REUSED: 1 }, true, true, true).verdict, 'REUSED', 'D1. success + {REUSED} + delta0 + dup0 + content-same → REUSED');
eq(TEMP_r6f2gReuseVerdict_(true, { REGENERATED: 1 }, true, true, true).verdict, 'REUSE_UNVERIFIED', 'D2. REGENERATED + delta0 + content-same → REUSE_UNVERIFIED (cannot be REUSED)');
eq(TEMP_r6f2gReuseVerdict_(true, { REGENERATED: 1 }, true, true, true).reason, 'NON_REUSE_GROUP_OUTCOME', 'D2. reason = NON_REUSE_GROUP_OUTCOME');
eq(TEMP_r6f2gReuseVerdict_(true, { CREATED: 1 }, true, true, true).verdict, 'REUSE_UNVERIFIED', 'D3. CREATED + delta0 → REUSE_UNVERIFIED');
eq(TEMP_r6f2gReuseVerdict_(true, { UPDATED: 1 }, true, true, true).verdict, 'REUSE_UNVERIFIED', 'D3. UPDATED + delta0 → REUSE_UNVERIFIED');
eq(TEMP_r6f2gReuseVerdict_(true, { REUSED: 1 }, true, true, false).reason, 'CONTENT_CHECKSUM_CHANGED_IN_PLACE_WRITE', 'D4. REUSED outcome but content checksum changed (in-place write) → REUSE_UNVERIFIED');
eq(TEMP_r6f2gReuseVerdict_(true, {}, true, true, true).verdict, 'REUSE_UNVERIFIED', 'D5. empty per-group outcome → REUSE_UNVERIFIED (never vacuously REUSED)');
eq(TEMP_r6f2gReuseVerdict_(false, { REUSED: 1 }, true, true, true).verdict, 'REUSE_UNVERIFIED', 'D6. generation not success → REUSE_UNVERIFIED');
eq(TEMP_r6f2gReuseVerdict_(true, { REUSED: 1 }, false, true, true).reason, 'ROW_DELTA_NONZERO', 'D7. nonzero row delta → REUSE_UNVERIFIED');

// ============================================================ E — verifier + content-checksum + diagnostic (source-facts)
section('E. verifier wiring + content checksum + diagnostic');
var verifier = extractFn(TEMP, 'TEMP_R6F2F_VERIFY_FROZEN_INVENTORY_AI_PLAN_REUSE');
ok(/TEMP_r6f2gContentChecksum_\(token\)/.test(verifier) && /before_content_checksum/.test(verifier) && /after_content_checksum/.test(verifier), 'E1. verifier captures before/after CONTENT checksums');
ok(/TEMP_r6f2gReuseVerdict_\(/.test(verifier) && /content_checksum_unchanged/.test(verifier), 'E1. verifier verdict uses the fail-closed helper + content-checksum gate');
ok(!/var reused = !!\(gen\.resp && gen\.resp\.success && \(post\.db_header_rows/.test(verifier), 'E2. the old row-count-only verdict is removed');
var cc = extractFn(TEMP, 'TEMP_r6f2gContentChecksum_');
ok(/updated_at/.test(cc) && /draft_version/.test(cc) && /TEMP_r5bHash_/.test(cc), 'E3. content checksum includes updated_at + draft_version (detects in-place rewrite)');
var diag = extractFn(TEMP, 'TEMP_R6F2G6_DIAGNOSE_TRUE_ZERO_WRITE_REUSE');
ok(/STRICTLY READ-ONLY/.test(diag) && /content_checksums/.test(diag) && /lineage_values/.test(diag) && /audit_fields/.test(diag), 'E4. diagnostic reports validation + content checksums + lineage + audit');
ok(/regenerated_branch_physical_writes/.test(diag) && /TRUE_REUSE_ALREADY_NO_WRITE/.test(diag) && /REGENERATED_IN_PLACE_WRITE_POSSIBLE/.test(diag), 'E4. diagnostic proves REGENERATE writes + classifies (never infers zero-write from row counts)');
ok(/R6F2G6_ZERO_WRITE_CONFIRMED/.test(diag) && !/\.setValue\(|\.setValues\(|\.appendRow\(|\.deleteRow\(|\.setProperty\(|\.clear\(/.test(diag), 'E4. diagnostic makes no actual mutation call (read-only)');

// ============================================================ F — generic/legacy unchanged; fingerprint intact
section('F. generic + legacy behavior unchanged');
ok(/function sadK2PayloadFingerprint_/.test(G16) && /sadFnv1a_\(h \+ '\|\|' \+ ls\.join\('\|\|'\)\)/.test(G16), 'F1. the raw payload fingerprint formula is unchanged');
// equal payloads still reuse via the fast path (fingerprint equal)
ok(sadK2PayloadFingerprint_(hdr, incLines) === sadK2PayloadFingerprint_(incHdr, JSON.parse(JSON.stringify(incLines))), 'F2. identical string payload → equal fingerprint (fast-path REUSE preserved)');
// the semantic gate only ADDS a reuse case: whenever raw fp equal, semantic must also be equal (never forces regenerate)
ok(sadK2SemanticPayloadEqual_(incHdr, incLines, incHdr, JSON.parse(JSON.stringify(incLines))) === true, 'F3. semantic equality never contradicts a raw-equal payload');
// non-K2 manual header path is untouched (no semantic gate wired there)
var mano = extractFn(G16, 'sadUpsertDraftHeaderCore_');
ok(!/sadK2SemanticPayloadEqual_/.test(mano), 'F4. the generic/manual header core is unchanged (narrow fix — K2 atomic path only)');

done();
