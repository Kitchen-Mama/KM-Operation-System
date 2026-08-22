// Kitchen Mama Operation System — R5C1 exact-41 live cycle repair tooling — F1-7N-FA-3C-DRAFT-MODEL-R5C1.
// Run: node assets/tests/request-order-draft-cycle-repair-exact41-f1-7n-fa-3c-r5c1.test.js
// Exercises the REAL TEMP_R5C1_* tooling against a mutable Google-Sheets coercion model + a real SHA-256 (via
// Node crypto behind Utilities.computeDigest). Proves the frozen 41-ID cohort + checksum, every HALT gate, a
// zero-write dry run, an EXECUTE that changes ONLY the 41 planning_cycle cells (string:67 / 2026-08:67, ids + the
// other 52 fields + Draft Lines untouched), post-repair validation, and idempotent ALREADY_REPAIRED on a re-run.

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GSTEMP = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var V2 = KMRDV2.V2_HEADERS, CANON = 'request_order_allocation_drafts', LINES = 'request_order_allocation_draft_lines';
var CY = 'planning_cycle', ID = 'request_allocation_draft_id';
var OFFENDER_ISO = '2026-07-31T16:00:00.000Z';
var NODE_CHECKSUM;   // computed from the sandbox frozen list once loaded

// ---- mutable coercion-model sheet: a General cell coerces "2026-08"→Date; "@" stores the string byte-verbatim ----
function makeSheet(name, headers, rows2d, honor) {
  honor = honor !== false;
  var grid = [headers.map(function (h) { return { v: h, fmt: 'General' }; })];
  (rows2d || []).forEach(function (row) { grid.push(row.map(function (v) { return { v: v, fmt: 'General' }; })); });
  var track = { setValuesCalls: 0, formatCalls: 0, writeCols: {}, formatCols: {} };
  function ensure(r, c) { while (grid.length <= r) grid.push([]); while (grid[r].length <= c) grid[r].push({ v: '', fmt: 'General' }); }
  function coerce(v, fmt) { if (honor && fmt === '@') return v; if (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) return new Date(v + '-01T00:00:00.000Z'); return v; }
  function range(r1, c1, nr, nc) {
    return { getValues: function () { var o = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) { ensure(r1 - 1 + i, c1 - 1 + j); row.push(grid[r1 - 1 + i][c1 - 1 + j].v); } o.push(row); } return o; },
      setValues: function (vals) { track.setValuesCalls++; for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) { ensure(r1 - 1 + i, c1 - 1 + j); track.writeCols[c1 - 1 + j] = 1; var cell = grid[r1 - 1 + i][c1 - 1 + j]; cell.v = coerce(vals[i][j], cell.fmt); } },
      setNumberFormat: function (fmt) { track.formatCalls++; for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) { ensure(r1 - 1 + i, c1 - 1 + j); grid[r1 - 1 + i][c1 - 1 + j].fmt = fmt; track.formatCols[c1 - 1 + j] = 1; } } };
  }
  return { getName: function () { return name; }, getDataRange: function () { return range(1, 1, grid.length, headers.length); },
    getLastRow: function () { return grid.length; }, getLastColumn: function () { return headers.length; },
    getRange: function (r, c, nr, nc) { return range(r, c, nr || 1, nc || 1); }, _track: track };
}
function objToArr(o) { return V2.map(function (h) { return o[h] !== undefined ? o[h] : ''; }); }
function canonRow(i) {
  var mkt = i < 18 ? 'Amazon' : (i < 21 ? 'Shopify' : 'Walmart');   // 18 / 3 / 5 = 26
  var status = i < 20 ? 'submitted' : 'draft';                       // 20 submitted / 6 draft
  var o = {}; V2.forEach(function (h) { o[h] = ''; });
  o[ID] = 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=' + mkt + '|sku=MIG-' + i;
  o[CY] = '2026-08'; o.company = 'ResUS'; o.country = 'US'; o.marketplace = mkt; o.sku = 'MIG-' + i; o.draft_purpose = 'regular';
  o.status = status; o.generation_type = 'ai_plan'; o.created_at = '2026-08-10T00:00:00.000Z'; o.updated_at = '2026-08-10T00:00:00.000Z'; o.draft_version = 1;
  return objToArr(o);
}
function offenderRow(dsb, id, cycleVal, overrides) {
  var p = dsb.TEMP_r5c1ParseId_(id), s = p.scope, o = {}; V2.forEach(function (h) { o[h] = ''; });
  o[ID] = id; o[CY] = cycleVal; o.company = s.company; o.country = s.country; o.marketplace = s.marketplace; o.sku = s.sku; o.draft_purpose = s.draft_purpose;
  o.status = 'draft'; o.generation_type = 'ai_plan'; o.created_at = '2026-08-22T10:18:00.000Z'; o.updated_at = '2026-08-22T10:18:00.000Z'; o.draft_version = 1;
  overrides && Object.keys(overrides).forEach(function (k) { o[k] = overrides[k]; });
  return objToArr(o);
}

// one shared sandbox (the TEMP_R5C1_* functions are stateless; swap the active spreadsheet per scenario)
var dsb = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, requestOrderDraftV2FlatCutoverEnabled_: function () { return true; }, PRODUCTION_DB_SPREADSHEET_ID_: 'SS-LIVE',
  __hold: { ss: null }, SpreadsheetApp: { getActiveSpreadsheet: function () { return dsb.__hold.ss; }, flush: function () {} },
  Utilities: { computeDigest: function (a, str) { var h = crypto.createHash('sha256').update(String(str), 'utf8').digest(); var out = []; for (var i = 0; i < h.length; i++) out.push(h[i] > 127 ? h[i] - 256 : h[i]); return out; }, DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }, formatDate: function () { return '2026-08'; } },
  Logger: { log: function () {} }, console: console };
vm.createContext(dsb); vm.runInContext(GSTEMP, dsb, { filename: 'TEMP.gs' });
var FROZEN = dsb.TEMP_R5C1_FROZEN_IDS_;
NODE_CHECKSUM = crypto.createHash('sha256').update(FROZEN.slice().sort().join('\n'), 'utf8').digest('hex');

// build a live-DB spreadsheet mock. offenderCycles: array parallel to FROZEN (Date or "2026-08"); opts to perturb.
function buildDb(offenderCycles, opts) {
  opts = opts || {};
  var canon = []; for (var i = 0; i < (opts.canonCount === undefined ? 26 : opts.canonCount); i++) canon.push(canonRow(i));
  var offs = [];
  FROZEN.forEach(function (id, k) { if (opts.dropIndex === k) return; offs.push(offenderRow(dsb, id, offenderCycles[k], opts.rowOverride && opts.rowOverride(k))); });
  if (opts.duplicateIndex !== undefined) offs.push(offenderRow(dsb, FROZEN[opts.duplicateIndex], offenderCycles[opts.duplicateIndex]));
  if (opts.extraOffender) offs.push(offenderRow(dsb, 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=NOT-FROZEN', new Date(OFFENDER_ISO)));
  if (opts.collisionRow) { var cr = canon.length ? canon.pop() : null; canon.push(offenderRow(dsb, FROZEN[0], '2026-08').map(function (v) { return v; })); }   // a string-cycle row colliding with offender[0] scope
  var all = canon.concat(offs);
  var draftLineRows = []; for (var L = 0; L < (opts.lineCount === undefined ? 65 : opts.lineCount); L++) draftLineRows.push(['L' + L]);
  var sheets = {}; sheets[CANON] = makeSheet(CANON, opts.headers || V2, all, opts.honor); sheets[LINES] = makeSheet(LINES, ['request_allocation_line_id'], draftLineRows);
  var ss = { getId: function () { return opts.wrongTarget ? 'SS-OTHER' : 'SS-LIVE'; }, getName: function () { return 'KM Ops DB'; }, getSheetByName: function (n) { return sheets[n] || null; } };
  dsb.__hold.ss = ss; return { ss: ss, sheets: sheets };
}
function allDates() { return FROZEN.map(function () { return new Date(OFFENDER_ISO); }); }
function allStrings() { return FROZEN.map(function () { return '2026-08'; }); }

// ==========================================================================
section('1. exact 41-ID cohort + deterministic SHA-256 checksum');
eq(FROZEN.length, 41, '1. frozen cohort is exactly 41 IDs');
eq(dsb.TEMP_r5c1Checksum_(), NODE_CHECKSUM, '1. Apps Script SHA-256 == Node crypto SHA-256 over sorted IDs joined by \\n');
ok(/^[0-9a-f]{64}$/.test(NODE_CHECKSUM), '1. checksum is a 64-hex SHA-256: ' + NODE_CHECKSUM);

section('8. DRY RUN on the fresh incident state → READY_TO_EXECUTE, ZERO writes');
var dbFresh = buildDb(allDates());
var dry = dsb.TEMP_R5C1_DRY_RUN_REPAIR_DRAFT_CYCLES();
eq([dry.mode, dry.verdict, dry.ok], ['DRY_RUN', 'READY_TO_EXECUTE', true], '8. dry run READY_TO_EXECUTE');
eq(dry.pending_count, 41, '8. 41 pending offenders identified');
eq(dry.would_write_count, 41, '8. would write 41 cells');
eq(dry.R5C1_CHECKSUM, NODE_CHECKSUM, '8. dry run reports the frozen checksum');
eq([dbFresh.sheets[CANON]._track.setValuesCalls, dbFresh.sheets[CANON]._track.formatCalls], [0, 0], '8. DRY RUN wrote/formatted ZERO cells');

section('2-7. every pre-execution safety gate HALTs (write nothing)');
function haltTok(opts, cycles) { buildDb(cycles || allDates(), opts); var r = dsb.TEMP_R5C1_DRY_RUN_REPAIR_DRAFT_CYCLES(); return r; }
ok(haltTok({ dropIndex: 3 }).failing_gates.indexOf('all_frozen_present') !== -1, '2. a MISSING frozen ID → HALT (all_frozen_present)');
ok(haltTok({ duplicateIndex: 3 }).failing_gates.indexOf('no_frozen_duplicate') !== -1, '2. a DUPLICATE frozen ID → HALT (no_frozen_duplicate)');
ok(haltTok({ extraOffender: true }).failing_gates.indexOf('no_unexpected_offender') !== -1, '3. an unexpected noncanonical (Date) row → HALT (no_unexpected_offender)');
ok(haltTok({ collisionRow: true }).failing_gates.indexOf('projected_duplicate_zero') !== -1, '4. a projected active duplicate → HALT (projected_duplicate_zero)');
ok(haltTok({ rowOverride: function (k) { return k === 0 ? { sku: 'WRONG-SKU' } : null; } }).failing_gates.indexOf('id_scope_agreement') !== -1, '5. ID/scope disagreement → HALT (id_scope_agreement)');
var wrongIso = allDates(); wrongIso[0] = new Date('2026-06-30T16:00:00.000Z');
var isoHalt = haltTok({}, wrongIso);
ok(isoHalt.halt === 'R5C1_PRE_EXECUTION_GATE_FAILED' && isoHalt.pending_gates.pending_iso_exact === false, '6. wrong offender Date ISO → HALT (pending_iso_exact)');
ok(haltTok({ lineCount: 64 }).failing_gates.indexOf('draft_lines_65') !== -1, '7. wrong Draft-Line count → HALT (draft_lines_65)');
ok(haltTok({ canonCount: 25 }).failing_gates.indexOf('canonical_row_count_67') !== -1, '7. wrong canonical row count → HALT (canonical_row_count_67)');
ok(haltTok({ wrongTarget: true }).failing_gates.indexOf('target_match') !== -1, 'wrong Spreadsheet target → HALT (target_match)');

section('9-13. EXECUTE repairs ONLY the 41 planning_cycle cells; full before/after invariants');
var db = buildDb(allDates());
var ex = dsb.TEMP_R5C1_EXECUTE_REPAIR_DRAFT_CYCLES();
eq([ex.mode, ex.verdict, ex.ok], ['EXECUTE', 'REPAIR_EXECUTED_VERIFIED', true], '9. EXECUTE verified');
eq(ex.writes, 41, '9. exactly 41 cells written');
eq([db.sheets[CANON]._track.setValuesCalls, db.sheets[CANON]._track.formatCalls], [41, 41], '9. exactly 41 setValues + 41 setNumberFormat calls on the drafts tab');
eq(Object.keys(db.sheets[CANON]._track.writeCols), [String(V2.indexOf(CY))], '9. every write targeted ONLY the planning_cycle column');
eq(Object.keys(db.sheets[CANON]._track.formatCols), [String(V2.indexOf(CY))], '9. every "@" format targeted ONLY the planning_cycle column');
eq(ex.before_after_proofs.every_change_is_planning_cycle, true, '10. every changed cell is planning_cycle (no id/audit/other-field change)');
eq(ex.non_cycle_changes, [], '10. zero non-cycle field changes');
eq(ex.total_cell_changes, 41, '10. exactly 41 cells changed in total');
eq([ex.after_cycle_type_distribution, ex.after_cycle_value_distribution], [{ string: 67 }, { '2026-08': 67 }], '11. post-repair cycle types string:67 and values 2026-08:67');
eq(db.sheets[LINES]._track.setValuesCalls + db.sheets[LINES]._track.formatCalls, 0, '12. Draft Lines received ZERO writes/formatting');
eq([ex.after_status_distribution.submitted, ex.after_status_distribution.draft], [20, 47], '13. status distribution {submitted:20, draft:47}');
eq([ex.after_marketplace_distribution.Amazon, ex.after_marketplace_distribution.Shopify, ex.after_marketplace_distribution.Walmart], [59, 3, 5], '13. marketplace {Amazon:59, Shopify:3, Walmart:5}');
eq(ex.after_purpose_distribution.regular, 67, '13. purpose regular:67');
eq(ex.before_after_proofs.id_set_identical && ex.before_after_proofs.row_count_67 && ex.before_after_proofs.no_projected_duplicate, true, '13. id set identical, 67 rows, no projected duplicate');
eq(ex.R5C1_CHECKSUM, NODE_CHECKSUM, 'EXECUTE reports the same checksum');

section('13(validate). VALIDATE (read-only) → REPAIR_VALIDATED on the repaired state');
var val = dsb.TEMP_R5C1_VALIDATE_REPAIRED_DRAFT_CYCLES();
eq([val.mode, val.verdict, val.ok], ['VALIDATE', 'REPAIR_VALIDATED', true], '13. validation passes');
eq(val.R5C1_CHECKSUM, NODE_CHECKSUM, '13. validate reports the same checksum (cross-run equality)');
eq(val.R5C1_ZERO_WRITE_CONFIRMED, 'YES', '13. validate is read-only');

section('14. idempotency — a second EXECUTE on the repaired state is zero-write ALREADY_REPAIRED');
var reFmt = db.sheets[CANON]._track.formatCalls, reSet = db.sheets[CANON]._track.setValuesCalls;
var ex2 = dsb.TEMP_R5C1_EXECUTE_REPAIR_DRAFT_CYCLES();
eq([ex2.repair_status, ex2.writes], ['ALREADY_REPAIRED', 0], '14. second EXECUTE → ALREADY_REPAIRED, zero writes');
eq([db.sheets[CANON]._track.formatCalls - reFmt, db.sheets[CANON]._track.setValuesCalls - reSet], [0, 0], '14. no additional cell writes on the idempotent re-run');

section('PARTIAL — a strict subset already repaired → PARTIAL_REPAIR_DETECTED, repairs only the remainder');
var mixed = allDates(); mixed[0] = '2026-08'; mixed[5] = '2026-08';   // 2 already repaired, 39 pending
var dbP = buildDb(mixed);
var dryP = dsb.TEMP_R5C1_DRY_RUN_REPAIR_DRAFT_CYCLES();
eq([dryP.repair_status, dryP.pending_count, dryP.repaired_count], ['PARTIAL_REPAIR_DETECTED', 39, 2], 'partial state detected (39 pending / 2 repaired)');
var exP = dsb.TEMP_R5C1_EXECUTE_REPAIR_DRAFT_CYCLES();
eq([exP.repair_status, exP.writes, exP.before_after_proofs.every_change_is_planning_cycle], ['PARTIAL_REPAIR_DETECTED', 39, true], 'partial EXECUTE repairs only the 39 remaining cells');
eq(dbP.sheets[CANON]._track.formatCalls, 39, 'partial EXECUTE formatted exactly 39 cells');

section('ALREADY_REPAIRED — a fully-clean state needs no work');
buildDb(allStrings());
var clean = dsb.TEMP_R5C1_DRY_RUN_REPAIR_DRAFT_CYCLES();
eq([clean.repair_status, clean.pending_count, clean.verdict], ['ALREADY_REPAIRED', 0, 'ALREADY_REPAIRED'], 'a fully-repaired table → ALREADY_REPAIRED (zero pending)');

section('SOURCE — read-only entrypoints; the write boundary is planning_cycle only');
ok(/function TEMP_R5C1_DRY_RUN_REPAIR_DRAFT_CYCLES\(\)/.test(GSTEMP) && /function TEMP_R5C1_EXECUTE_REPAIR_DRAFT_CYCLES\(\)/.test(GSTEMP) && /function TEMP_R5C1_VALIDATE_REPAIRED_DRAFT_CYCLES\(\)/.test(GSTEMP), 'all three public entrypoints exist');
ok(!/appendRow|insertSheet|deleteRow|deleteSheet|\.setName\(|\.clear\(/.test(GSTEMP.split('F1-7N-FA-3C-DRAFT-MODEL-R5C1')[1] || ''), 'R5C1 tooling never appends/inserts/deletes/renames/clears rows or tabs');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R5C1 EXACT-41 CYCLE REPAIR (F1-7N-FA-3C-R5C1): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
