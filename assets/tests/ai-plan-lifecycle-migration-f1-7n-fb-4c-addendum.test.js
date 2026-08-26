// F1-7N-FB-4C-ADDENDUM-MIGRATION — hardened fail-closed gate · manual precedence · user-run schema migration.
//
// Proves the 20 §J claims. The behavioural ones EXECUTE the shipped functions: the activation gate, the manual
// precedence decision, the schema comparison, the lineage classification, the checksum, and the FULL migration
// COMMIT — the last of those against an in-memory fake Spreadsheet with a WRITE SPY, so "zero writes" is counted
// rather than asserted. Structural claims run against comment-stripped source so prose cannot satisfy them.
//
// Known regression baseline (pre-existing, unrelated): gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// NOT strict mode, deliberately: this suite EXECUTES the shipped Apps Script functions by eval-ing them at
// module scope, and a strict-mode eval keeps its `var` declarations to itself. Running the real code is worth
// more than the directive.
// Run: node assets/tests/ai-plan-lifecycle-migration-f1-7n-fb-4c-addendum.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), d = 0;
  for (; i < src.length; i++) { var c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1;
  while (' \t\r\n'.indexOf(src[i]) >= 0) i++;
  if (src[i] === '{' || src[i] === '[') {
    var open = src[i], close = open === '{' ? '}' : ']', d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
    return src.slice(m.index, j + 1) + ';';
  }
  return src.slice(m.index, src.indexOf(';', i) + 1);
}

var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var G69 = read('assets/specs/active/apps-script/69_api_v1_ai_plan_lifecycle.gs');
var GMIG = read('assets/specs/active/apps-script/TEMP_migrate_shipping_allocation_ai_lifecycle.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var SPEC = read('docs/planning/INVENTORY_AI_PLAN_DRAFT_LIFECYCLE.md');
var G16C = code(G16), G61C = code(G61), G69C = code(G69), GMIGC = code(GMIG);

// ============================================================ the shipped code, executed
// 16_ schema authority + helpers
eval(extractVar(G16, 'SHIPPING_ALLOCATION_DRAFTS_HEADERS_'));
eval(extractVar(G16, 'SAD_LIFECYCLE_TAIL_COLUMNS_'));
eval(extractVar(G16, 'SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_'));
eval(extractVar(G16, 'SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_'));
eval(extractVar(G16, 'SAD_STATUSES_'));
eval(extractVar(G16, 'SAD_LINE_STATUSES_'));
eval(extractVar(G16, 'SAD_TERMINAL_STATUSES_'));
eval(extractVar(G16, 'SAD_K2_GROUP_DIMENSIONS_'));
eval([ 'sadHeaderStatusValid_', 'sadLineStatusValid_', 'sadExactSchemaReason_', 'sadLifecycleTailState_',
  'sadK2GroupKey_', 'sadFnv1a_' ].map(function (f) { return extractFn(G16, f); }).join('\n'));

// 69_ lifecycle core
eval(['AIPL_AUDIT_COLUMNS_', 'AIPL_MIGRATION_VERSION_', 'AIPL_SCHEMA_NOT_READY_', 'AIPL_COLLISION_CODE_',
  'AIPL_SUPPRESSED_CODE_', 'AIPL_AI_GENERATION_TYPES_', 'AIPL_SOURCE_PAGE_', 'AIPL_PROTECTED_STATUSES_',
  'AIPL_EXPIRATION_REASON_'].map(function (v) { return extractVar(G69, v); }).join('\n'));
eval(['aiplStr_', 'aiplLo_', 'aiplErr_', 'aiplIsAiGenerated_', 'aiplSameScope_', 'aiplSchemaVersionOf_',
  'aiplReadActivationFacts_', 'aiplActivationGate_', 'aiplManualPrecedence_', 'aiplExpirationCandidates_'
].map(function (f) { return extractFn(G69, f); }).join('\n'));

// migration tool core
eval(['TEMP_AIMIG_BUILD_VERSION_', 'TEMP_AIMIG_TABLE_', 'TEMP_AIMIG_LINE_TABLE_'].map(function (v) { return extractVar(GMIG, v); }).join('\n'));
eval(['tmigStr_', 'tmigLo_', 'tmigHash_', 'tmigMask_', 'tmigCanonicalHeaders_', 'tmigRequiredHeaders_',
  'tmigTailColumns_', 'tmigOpenDb_', 'tmigReadTable_', 'tmigCompareSchema_', 'tmigRecomputeRunId_',
  'tmigIsAi_', 'tmigIsTerminal_', 'tmigIdentityKey_', 'tmigClassifyRows_', 'tmigChecksum_', 'tmigBuildPlan_',
  'TEMP_AI_LIFECYCLE_SCHEMA_DIAGNOSE', 'TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN',
  'TEMP_AI_LIFECYCLE_MIGRATE_COMMIT', 'TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE'].map(function (f) { return extractFn(GMIG, f); }).join('\n'));

// ============================================================ an in-memory Spreadsheet with a WRITE SPY
var SPY = { setValue: 0, setValues: 0, insertColumns: 0, log: [] };
function resetSpy() { SPY.setValue = 0; SPY.setValues = 0; SPY.insertColumns = 0; SPY.log = []; }
function totalWrites() { return SPY.setValue + SPY.setValues + SPY.insertColumns; }

function FakeSheet(name, grid) {
  this.name = name;
  this.grid = grid.map(function (r) { return r.slice(); });
  this.maxCols = Math.max.apply(null, grid.map(function (r) { return r.length; }));
}
FakeSheet.prototype._pad = function (cols) {
  var self = this;
  this.grid.forEach(function (r) { while (r.length < cols) r.push(''); });
  if (cols > self.maxCols) self.maxCols = cols;
};
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.grid.length; };
FakeSheet.prototype.getLastColumn = function () {
  var last = 0;
  this.grid.forEach(function (r) { for (var i = 0; i < r.length; i++) if (String(r[i]) !== '') last = Math.max(last, i + 1); });
  return last;
};
FakeSheet.prototype.getMaxColumns = function () { return this.maxCols; };
FakeSheet.prototype.insertColumnsAfter = function (after, n) { SPY.insertColumns++; this.maxCols += n; this._pad(this.maxCols); };
FakeSheet.prototype.getDataRange = function () {
  var self = this, cols = this.getLastColumn();
  return { getValues: function () { return self.grid.map(function (r) { return r.slice(0, cols); }); } };
};
FakeSheet.prototype.getRange = function (row, col, nr, nc) {
  var self = this;
  nr = nr || 1; nc = nc || 1;
  self._pad(col + nc - 1);
  return {
    getValues: function () {
      var out = [];
      for (var r = 0; r < nr; r++) {
        var line = [];
        for (var c = 0; c < nc; c++) { var gr = self.grid[row - 1 + r] || []; line.push(gr[col - 1 + c] === undefined ? '' : gr[col - 1 + c]); }
        out.push(line);
      }
      return out;
    },
    getValue: function () { var gr = self.grid[row - 1] || []; return gr[col - 1] === undefined ? '' : gr[col - 1]; },
    setValue: function (v) {
      SPY.setValue++; SPY.log.push({ op: 'setValue', sheet: self.name, row: row, col: col, value: String(v) });
      while (self.grid.length < row) self.grid.push(new Array(self.maxCols).fill(''));
      self._pad(col);
      self.grid[row - 1][col - 1] = v;
    },
    setValues: function (vv) {
      SPY.setValues++; SPY.log.push({ op: 'setValues', sheet: self.name, row: row, col: col });
      for (var r = 0; r < vv.length; r++) for (var c = 0; c < vv[r].length; c++) self.grid[row - 1 + r][col - 1 + c] = vv[r][c];
    }
  };
};

function FakeSS(sheets) { this.sheets = sheets; }
FakeSS.prototype.getSheetByName = function (n) { return this.sheets[n] || null; };
FakeSS.prototype.getId = function () { return 'FAKE-DB'; };

var CURRENT_SS = null;
global.SpreadsheetApp = {
  getActiveSpreadsheet: function () { return CURRENT_SS; },
  flush: function () {}
};
global.Logger = { log: function () {} };
var LOCK_GRANTED = true, LOCK_RELEASED = 0;
global.LockService = {
  getScriptLock: function () {
    return { tryLock: function () { return LOCK_GRANTED; }, releaseLock: function () { LOCK_RELEASED++; } };
  }
};
// The exact-id target guard is the frozen adapter; here it is a pass-through so the migration logic is what is
// under test. Its PRESENCE in the shipped tool is asserted structurally below.
global.prodAssertDbTarget_ = function () { return true; };

// ---- fixtures ---------------------------------------------------------------------------------------------
var H30 = SHIPPING_ALLOCATION_DRAFTS_HEADERS_.slice();
var H34 = SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_.slice();

function rowFor(o, headers) { return headers.map(function (h) { return o[h] === undefined ? '' : o[h]; }); }

// One AI row with a source-proven lineage (has calculation_run_id, no generation_run_id yet), one manual row with
// a user quantity, one already-expired row, and one AI row with NO calculation_run_id (unresolvable).
var AI_RESOLVABLE = { allocation_draft_id: 'SADH-K2-AAAA', planning_cycle: '2026-08', source_page: 'inventory_replenishment',
  company: 'KM', country: 'US', marketplace: 'Amazon', status: 'draft', generation_type: 'scheduled',
  calculation_run_id: 'GAPINV-777', recommended_source_warehouse_id: 'W1', recommended_destination_warehouse_id: 'W9',
  recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'DTD', recommendation_group_no: '1', note: '' };
var MANUAL_ROW = { allocation_draft_id: 'SADH-K2-BBBB', planning_cycle: '2026-08', source_page: 'inventory_replenishment',
  company: 'KM', country: 'US', marketplace: 'Amazon', status: 'draft', generation_type: 'user_created',
  calculation_run_id: '', recommended_source_warehouse_id: 'W1', recommended_destination_warehouse_id: 'W7',
  recommended_shipping_method: 'AIR', recommended_last_mile_delivery: 'DTD', recommendation_group_no: '1',
  note: 'operator: split shipment agreed with factory' };
var EXPIRED_ROW = { allocation_draft_id: 'SADH-K2-CCCC', planning_cycle: '2026-07', source_page: 'inventory_replenishment',
  company: 'KM', country: 'US', marketplace: 'Amazon', status: 'expired', generation_type: 'scheduled',
  calculation_run_id: 'GAPINV-111', recommended_source_warehouse_id: 'W1', recommended_destination_warehouse_id: 'W9',
  recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'DTD', recommendation_group_no: '1', note: '' };
var AI_UNRESOLVABLE = { allocation_draft_id: 'SADH-K2-DDDD', planning_cycle: '2026-08', source_page: 'inventory_replenishment',
  company: 'KM', country: 'TW', marketplace: 'Shopee', status: 'draft', generation_type: 'scheduled',
  calculation_run_id: '', recommended_source_warehouse_id: 'W2', recommended_destination_warehouse_id: 'W8',
  recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'DTD', recommendation_group_no: '1', note: '' };

function buildDb(headers, rows, lineHeaders) {
  var hGrid = [headers.slice()].concat(rows.map(function (r) { return rowFor(r, headers); }));
  var lGrid = [(lineHeaders || SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_).slice()];
  return new FakeSS({
    shipping_allocation_drafts: new FakeSheet('shipping_allocation_drafts', hGrid),
    shipping_allocation_draft_lines: new FakeSheet('shipping_allocation_draft_lines', lGrid)
  });
}

// ================================================================================================================
section('§A — the corrected fail-closed gate. Missing schema => the whole command refuses, zero writes.');
// ================================================================================================================
function facts(over) {
  var f = {
    header_table: { name: 'shipping_allocation_drafts', exists: true, headers: H34 },
    line_table: { name: 'shipping_allocation_draft_lines', exists: true, headers: SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ },
    tail: { missing: [], misplaced: [], complete: true },
    header_status_accepts_expired: true, line_status_accepts_expired: true,
    migration_version: AIPL_MIGRATION_VERSION_, expected_migration_version: AIPL_MIGRATION_VERSION_,
    generation_run_id: 'AIRUN-CURRENT', identity_collisions: []
  };
  for (var k in (over || {})) f[k] = over[k];
  return f;
}
var gReady = aiplActivationGate_(facts());
ok(gReady.ready === true, 'A1 a fully migrated schema with a run id activates');

// (1) missing ONE lifecycle column
var g1 = aiplActivationGate_(facts({ tail: { missing: ['expired_by_run_id'], misplaced: [], complete: false } }));
ok(g1.ready === false, 'J1 one missing lifecycle column refuses the run');
eq(g1.error.code, 'AI_PLAN_LIFECYCLE_SCHEMA_NOT_READY', 'J1 with the addendum code (not the FB-4C code)');
eq(g1.error.missing_columns, ['expired_by_run_id'], 'J1 naming the exact missing column');
eq(g1.error.zero_write, true, 'J1 zero_write:true');
eq([g1.error.created_headers, g1.error.created_lines, g1.error.expired_headers, g1.error.expired_lines], [0, 0, 0, 0],
  'J1 all four counters are 0');
eq(g1.error.expected_migration_version, AIPL_MIGRATION_VERSION_, 'J1 and the expected migration version');
ok(/TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN/.test(g1.error.next_action), 'J1 the next action names the exact tool to run');
AIPL_AUDIT_COLUMNS_.forEach(function (c) {
  var g = aiplActivationGate_(facts({ tail: { missing: [c], misplaced: [], complete: false } }));
  ok(g.ready === false && g.error.missing_columns.indexOf(c) !== -1, 'J1 refuses when ' + c + ' is the missing one');
});

// (2) the `expired` enum
var g2 = aiplActivationGate_(facts({ line_status_accepts_expired: false }));
ok(g2.ready === false, 'J2 a line_status authority that does not accept "expired" refuses the run');
ok(/line_status does not accept/.test(g2.error.invalid_status_authority.join('|')), 'J2 and says which authority');
eq(g2.error.zero_write, true, 'J2 zero_write:true');
var g2h = aiplActivationGate_(facts({ header_status_accepts_expired: false }));
ok(g2h.ready === false && /status does not accept/.test(g2h.error.invalid_status_authority.join('|')),
  'J2 likewise for the header status authority');
// executed against the SHIPPED validators, so this is the real enum
ok(sadHeaderStatusValid_('expired') === true, 'J2 the shipped header validator accepts "expired"');
ok(sadLineStatusValid_('expired') === true, 'J2 the shipped line validator accepts "expired"');
ok(sadLineStatusValid_('') === true, 'J2 a blank line status stays legal (most writers never set one)');
ok(sadLineStatusValid_('nonsense') === false, 'J2 and an unknown line status is rejected — the enum has teeth');
ok(sadHeaderStatusValid_('nonsense') === false, 'J2 as does the header enum');

// other gate conditions (§H)
ok(aiplActivationGate_(facts({ generation_run_id: '' })).ready === false, 'H a run without a generation_run_id may not proceed');
ok(aiplActivationGate_(facts({ migration_version: '' })).ready === false, 'H nor may a schema at no known version');
ok(aiplActivationGate_(facts({ migration_version: 'SOMETHING-ELSE' })).ready === false, 'H nor at the wrong version');
ok(aiplActivationGate_(facts({ header_table: { name: 'shipping_allocation_drafts', exists: false, headers: [] } })).ready === false,
  'H nor with the header table missing');
eq(aiplActivationGate_(facts({ header_table: { name: 'shipping_allocation_drafts', exists: false, headers: [] } })).error.missing_table,
  ['shipping_allocation_drafts'], 'H and the missing table is named');
var gDrift = aiplActivationGate_(facts({ tail: { missing: [], misplaced: [{ column: 'expired_at', expected_index: 31, actual_index: 12 }], complete: false } }));
ok(gDrift.ready === false && /HEADER_ORDER_DRIFT/.test(gDrift.error.blocking_reasons.join('|')),
  'J5 a lifecycle column in the WRONG POSITION is drift, not readiness');
var gColl = aiplActivationGate_(facts({ identity_collisions: [{ identity_key_hash: 'abc', row_count: 2 }] }));
ok(gColl.ready === false && /UNRESOLVED_ACTIVE_IDENTITY_COLLISION/.test(gColl.error.blocking_reasons.join('|')),
  'H an unresolved active identity collision blocks activation');

// ---- the gate is placed BEFORE the only write, structurally -----------------------------------------------
var gateIdx = G61C.indexOf('if (!gate.ready)');
var writeIdx = G61C.indexOf('handleUpsertShippingAllocationDraftAtomic_({ header: pl.header');
ok(gateIdx > 0 && writeIdx > gateIdx, 'A2 in 61_ the gate refusal precedes the ONLY draft write site');
eq((G61C.match(/handleUpsertShippingAllocationDraftAtomic_\(/g) || []).length, 1,
  'A2 and there is exactly ONE write site, so nothing can bypass the gate');
ok(/return jsonResponse_\(\{\s*success: false, zero_write: true,\s*errors: \[gate\.error\]/.test(G61C),
  'A2 the refusal RETURNS — it does not fall through to the write pass');
// Ordering is checked on the RAW source, because the PASS markers are comments (the stripped copy has no
// index for them) and because what matters is the order of the real statements in the shipped file.
var rawGate = G61.indexOf('if (!gate.ready)');
var rawWrite = G61.indexOf('handleUpsertShippingAllocationDraftAtomic_({ header: pl.header');
var pass1 = G61.indexOf('---- PASS 1:'), pass2 = G61.indexOf('---- PASS 2:');   // the section markers, which are unique
ok(pass1 > 0 && pass1 < rawGate, 'A3 the compute pass precedes the gate');
ok(pass2 > rawGate && pass2 < rawWrite, 'A3 and the write pass begins only after it');
var computeRegion = code(G61.slice(pass1, rawGate));
['handleUpsertShippingAllocationDraftAtomic_', 'setValue', 'appendRow', 'procurementAppendByHeader_'].forEach(function (w) {
  ok(computeRegion.indexOf(w) === -1, 'J1 the compute+gate region calls NO writer: ' + w);
});
// the FB-4C schema-gate placement is gone from the post-write path
ok(G61C.indexOf('AI_PLAN_LIFECYCLE_SCHEMA_EXTENSION_REQUIRED') === -1,
  'A4 the FB-4C post-write schema code no longer decides anything in the generation command');
ok(/BLOCKED_LIFECYCLE_MODULE_MISSING/.test(G61C),
  'A5 a MIXED DEPLOYMENT (lifecycle module absent) also refuses rather than writing');

// ================================================================================================================
section('§B — manual precedence, executed');
// ================================================================================================================
var keyOf = function (r) { return sadK2GroupKey_(r); };
var manualKey = sadK2GroupKey_(MANUAL_ROW);
var aiKey = sadK2GroupKey_(AI_RESOLVABLE);

// (10)(11) an active manual identity suppresses AI creation and never overwrites the quantity
var pMan = aiplManualPrecedence_([MANUAL_ROW], [{ identity_key: manualKey, recommendation: 900, persisted_user_qty: 400 }], keyOf);
eq(pMan[0].decision, 'SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT', 'J10 an active manual draft suppresses AI creation');
eq(pMan[0].created, false, 'J10 created:false');
eq(pMan[0].updated, false, 'J10 updated:false');
eq(pMan[0].blocks_run, false, 'J10 blocks_run:false — the run continues for other identities');
eq(pMan[0].persisted_user_qty, 400, 'J11 the persisted user quantity is REPORTED');
eq(pMan[0].current_recommendation, 900, 'J11 alongside the recommendation that was withheld');
eq(pMan[0].manual_identity.allocation_draft_id, 'SADH-K2-BBBB', 'J10 with the manual persisted identity');
eq(pMan[0].persisted_note, 'operator: split shipment agreed with factory', 'J8 the operator note is preserved and reported');
eq(pMan[0].persisted_route.recommended_shipping_method, 'AIR', 'J8 as is the operator route');
ok(pMan[0].requires_reconciliation === false, 'J10 suppression is normal behaviour, not a corruption report');

// the run continues for OTHER identities
var pMixed = aiplManualPrecedence_([MANUAL_ROW], [
  { identity_key: manualKey, recommendation: 900 },
  { identity_key: aiKey, recommendation: 500 }
], keyOf);
eq(pMixed.map(function (d) { return d.decision; }), ['SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT', 'PROCEED'],
  'J10 one suppressed identity does not stop the others');

// (13) historical manual + AI collision is REPORTED, never repaired
var collidingAi = JSON.parse(JSON.stringify(AI_RESOLVABLE));
['recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_shipping_method',
 'recommended_last_mile_delivery', 'recommendation_group_no', 'planning_cycle', 'company', 'country', 'marketplace'
].forEach(function (f) { collidingAi[f] = MANUAL_ROW[f]; });
collidingAi.allocation_draft_id = 'SADH-K2-BBBB-DUP';
var pColl = aiplManualPrecedence_([MANUAL_ROW, collidingAi], [{ identity_key: manualKey, recommendation: 900 }], keyOf);
eq(pColl[0].decision, 'ACTIVE_SOURCE_IDENTITY_COLLISION', 'J13 a historical manual+AI collision is reported');
eq(pColl[0].created, false, 'J13 and creates nothing');
eq(pColl[0].requires_reconciliation, true, 'J13 requiring reconciliation');
eq(pColl[0].rows.length, 2, 'J13 listing the exact rows');
eq(pColl[0].manual_rows.length, 1, 'J13 separated by provenance: the manual row');
eq(pColl[0].ai_rows.length, 1, 'J13 and the AI row');
ok(!/survivor/.test(JSON.stringify(pColl[0]).replace(/no survivor is guessed/, '')),
  'J13 no survivor is nominated anywhere in the decision');
eq(pColl[0].blocks_run, false, 'J13 it fails closed for THAT IDENTITY, not for the whole run');
// two active rows of the SAME provenance is also a collision the K2 contract forbids
var pDupAi = aiplManualPrecedence_([AI_RESOLVABLE, JSON.parse(JSON.stringify(AI_RESOLVABLE))], [{ identity_key: aiKey }], keyOf);
eq(pDupAi[0].decision, 'ACTIVE_SOURCE_IDENTITY_COLLISION', 'J13 two active AI rows on one identity likewise');

// a TERMINAL row holds no identity, so it must not suppress a fresh recommendation
var expiredAtManualKey = JSON.parse(JSON.stringify(MANUAL_ROW));
expiredAtManualKey.status = 'expired';
var pTerm = aiplManualPrecedence_([], [{ identity_key: manualKey }], keyOf);
eq(pTerm[0].decision, 'PROCEED', 'B a scope whose only row is terminal proceeds normally');

// (12) old AI + manual: the manual is preserved and the OLDER AI expires — only on a verified run
var ROWS = [MANUAL_ROW, AI_RESOLVABLE];
var expCand = aiplExpirationCandidates_(ROWS, { company: 'KM', country: 'US', marketplace: 'Amazon',
  planning_cycle: '2026-08', source_page: 'inventory_replenishment', generation_run_id: 'AIRUN-NEW', committed_ids: [] });
eq(expCand.expire.map(function (x) { return x.allocation_draft_id; }), ['SADH-K2-AAAA'],
  'J12 the older AI draft is the only expiration candidate');
ok(expCand.preserved.filter(function (p) { return p.allocation_draft_id === 'SADH-K2-BBBB' && p.reason === 'MANUAL_SOURCE'; }).length === 1,
  'J12 and the manual draft is preserved, with MANUAL_SOURCE recorded as the reason');
ok(/if \(runSucceeded\)/.test(G61C) && G61C.indexOf('if (runSucceeded)') > writeIdx,
  'J12 expiration is attempted only AFTER the write pass and only when the run succeeded');

// ================================================================================================================
section('§D — schema authority, append-only, and the order-independent write gate');
// ================================================================================================================
eq(SAD_LIFECYCLE_TAIL_COLUMNS_, ['generation_run_id', 'expired_at', 'expired_by_run_id', 'expiration_reason'],
  'D1 the canonical tail, in the one documented order');
eq(H30.length, 30, 'D1 the REQUIRED contract is still the frozen 30 columns');
eq(H34.length, 34, 'D1 and the canonical order is 34');
eq(H34.slice(0, 30), H30, 'D1 with the required 30 as an exact leading prefix — append-only');
eq(H34.slice(30), SAD_LIFECYCLE_TAIL_COLUMNS_, 'D1 and the tail exactly at indexes 30..33');
ok(SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.indexOf('line_status') !== -1,
  'D2 line_status ALREADY exists, so the migration adds no line column');
eq(GMIG.indexOf('line_status') !== -1 && /line_status_column_present/.test(GMIG), true,
  'D2 and the tool reports that fact rather than assuming it');
ok(!/columns_to_append.*line_status/.test(GMIGC), 'D2 line_status is never proposed as an addition');

// the write gate accepts BOTH states and nothing else — executed
function gateOn(headers) {
  var sh = new FakeSheet('shipping_allocation_drafts', [headers.slice()]);
  return sadExactSchemaReason_(sh, H34, SAD_LIFECYCLE_TAIL_COLUMNS_);
}
eq(gateOn(H30), '', 'D3 a PRE-migration sheet (30) passes the write gate');
eq(gateOn(H34), '', 'D3 a MIGRATED sheet (34) passes the write gate');
eq(gateOn(H30.concat(['generation_run_id'])), '', 'D3 as does a partially migrated sheet (31)');
ok(gateOn(H30.concat(['expired_at', 'generation_run_id'])) !== '', 'D3 but a tail in the WRONG ORDER fails');
ok(gateOn(H34.concat(['something_else'])) !== '', 'D3 an unknown extra column fails');
ok(gateOn(H30.slice(0, 29)) !== '', 'D3 a missing REQUIRED column fails');
var reordered = H30.slice(); var t = reordered[3]; reordered[3] = reordered[4]; reordered[4] = t;
ok(gateOn(reordered) !== '', 'D3 a reorder inside the required 30 fails');
// the line gate stays fully exact (no tail argument)
var lineSheet = new FakeSheet('lines', [SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.slice()]);
eq(sadExactSchemaReason_(lineSheet, SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_), '', 'D3 the LINE gate is unchanged and exact');
ok(sadExactSchemaReason_(new FakeSheet('lines', [SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.concat(['x'])]),
  SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_) !== '', 'D3 and it still rejects any extra line column');
ok(/sadExactSchemaReason_\(hSh, SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_, SAD_LIFECYCLE_TAIL_COLUMNS_\)/.test(G16C),
  'D3 the shipped header call passes the canonical list plus the optional tail');
ok(/sadExactSchemaReason_\(lSh, SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_\)/.test(G16C),
  'D3 and the shipped line call passes no tail');
// the REQUIRED list is what every ensure-sheet call still uses, which is what keeps writes working pre-migration
ok(G16C.indexOf("procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_)") !== -1,
  'D4 procurementEnsureSheet_ still validates against the frozen REQUIRED 30 (extras are allowed by this table)');
ok(G16C.indexOf("procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_)") === -1,
  'D4 and never against the canonical list — that would fail closed on an unmigrated sheet');

// tail state, executed
var tailPre = sadLifecycleTailState_(new FakeSheet('h', [H30.slice()]));
eq(tailPre.missing, SAD_LIFECYCLE_TAIL_COLUMNS_, 'D5 a pre-migration sheet reports all four columns missing');
eq(tailPre.complete, false, 'D5 and is not complete');
var tailPost = sadLifecycleTailState_(new FakeSheet('h', [H34.slice()]));
eq(tailPost.missing, [], 'D5 a migrated sheet reports none missing');
eq(tailPost.complete, true, 'D5 and is complete');
var mis = H30.slice(); mis.splice(5, 0, 'expired_at');
var tailMis = sadLifecycleTailState_(new FakeSheet('h', [mis]));
ok(tailMis.misplaced.length === 1 && tailMis.complete === false, 'D5 a lifecycle column in the wrong place is MISPLACED, not present');

// generation_run_id is actually persisted now
ok(/generation_run_id: String\(header\.generation_run_id \|\| ''\)\.trim\(\)/.test(G16C),
  'D6 the header INSERT now carries generation_run_id (FB-4C set it on the object but never wrote it)');
ok(/setCol\('generation_run_id'/.test(G16C), 'D6 and a REGENERATE stamps the run that updated the row');
eval(extractVar(G16, 'SAD_K2_HEADER_FP_'));
ok(SAD_K2_HEADER_FP_.indexOf('generation_run_id') === -1,
  'D6 while staying OUT of the REUSE fingerprint, so stamping it is never a false content change');

// ================================================================================================================
section('§E — lineage classification and source-proven backfill, executed');
// ================================================================================================================
// (6) source-proven backfill
var d = tmigRecomputeRunId_(AI_RESOLVABLE);
ok(d.ok === true, 'J6 a row carrying calculation_run_id has a derivable run id');
eq(d.source_columns, ['planning_cycle', 'company', 'country', 'marketplace', 'calculation_run_id'],
  'J6 and the source columns are named');
// it must equal what 61_ itself would mint from the same inputs — recomputed here with the shipped hash
var expectKey = 'AIPLAN-' + sadFnv1a_(['2026-08', 'KM', 'US', 'Amazon', 'GAPINV-777'].join('|')).toUpperCase();
eq(d.execution_key, expectKey, 'J6 the derived execution key equals the generator formula');
eq(d.generation_run_id, 'AIRUN-' + sadFnv1a_(expectKey).toUpperCase(), 'J6 and so does the derived run id');

// (7) timestamp-only lineage is REFUSED
var tsOnly = JSON.parse(JSON.stringify(AI_RESOLVABLE));
tsOnly.calculation_run_id = ''; tsOnly.calculated_at = '2026-08-01T00:00:00Z'; tsOnly.created_at = '2026-08-01T00:00:00Z';
var dTs = tmigRecomputeRunId_(tsOnly);
eq(dTs.ok, false, 'J7 a row with only timestamps has NO derivable lineage');
eq(dTs.reason, 'NO_CALCULATION_RUN_ID', 'J7 and the refusal names the missing authority');
['calculated_at', 'created_at', 'updated_at', 'source_data_as_of'].forEach(function (f) {
  ok(code(extractFn(GMIG, 'tmigRecomputeRunId_')).indexOf(f) === -1,
    'J7 the derivation never reads a timestamp column: ' + f);
});

// classification over the whole fixture set
var cls = tmigClassifyRows_([AI_RESOLVABLE, MANUAL_ROW, EXPIRED_ROW, AI_UNRESOLVABLE].map(function (r, i) {
  var c = JSON.parse(JSON.stringify(r)); c.__row = i + 2; return c;
}));
eq(cls.classes.AI_LINEAGE_RESOLVED, 1, 'E1 one AI row resolves');
eq(cls.classes.MANUAL_SOURCE, 1, 'E1 one manual row');
eq(cls.classes.TERMINAL, 1, 'E1 one terminal row');
eq(cls.classes.LEGACY_AI_LINEAGE_UNRESOLVED, 1, 'E1 one legacy AI row is unresolved');
eq(cls.backfills.length, 1, 'E2 exactly one backfill is proposed');
eq(cls.backfills[0].action, 'BACKFILL_GENERATION_RUN_ID', 'E2 and it is a lineage backfill');
ok(cls.backfills[0].value_mapping && cls.backfills[0].value_mapping.to_generation_run_id, 'E2 with the exact value mapping reported');
// (8) manual rows untouched
var manualRec = cls.rows.filter(function (r) { return r.classification === 'MANUAL_SOURCE'; })[0];
eq(manualRec.action, 'NO_WRITE', 'J8 the manual row is NO_WRITE');
// legacy unresolved: blank, reported, not expired, blocks its scope
var legacy = cls.rows.filter(function (r) { return r.classification === 'LEGACY_AI_LINEAGE_UNRESOLVED'; })[0];
eq(legacy.action, 'NO_WRITE', 'E3 an unresolved legacy AI row is left blank');
ok(legacy.blocks_scope && legacy.blocks_scope.marketplace === 'Shopee', 'E3 and names the scope it blocks');
// terminal/expired audit is never manufactured
var term = cls.rows.filter(function (r) { return r.classification === 'TERMINAL'; })[0];
ok(/no historical expiration timestamp is manufactured/.test(term.note || ''),
  'E4 an already-expired row with missing audit gets NO manufactured timestamp');
ok(GMIGC.indexOf('expired_at') !== -1 && !/kind: 'SET_CELL', column: 'expired_at'/.test(GMIGC),
  'E4 and the tool never proposes writing expired_at');
var writeCols = (GMIGC.match(/w\.column === '([a-z_]+)'/g) || []);
eq(writeCols, ["w.column === 'generation_run_id'"], 'E4 generation_run_id is the ONLY column the commit ever sets');

// ================================================================================================================
section('§F/§G — dry run, checksum and commit safety, executed against a fake DB with a write spy');
// ================================================================================================================
// (3) DRY RUN writes nothing
CURRENT_SS = buildDb(H30, [AI_RESOLVABLE, MANUAL_ROW, EXPIRED_ROW]);
resetSpy();
var dry = TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN();
eq(totalWrites(), 0, 'J3 the dry run performed ZERO writes (spy-counted)');
eq(dry.DB_WRITES, 0, 'J3 and reports DB_WRITES=0');
eq(dry.live_header_count, 30, 'F1 live header count');
eq(dry.expected_header_count, 34, 'F1 expected header count');
eq(dry.missing_columns, SAD_LIFECYCLE_TAIL_COLUMNS_, 'F1 missing columns');
eq(dry.extra_columns, [], 'F1 extra columns');
eq(dry.first_order_drift_index, -1, 'F1 first order-drift index is -1 — a pre-migration sheet has MISSING columns, not drifted ones');
eq(tmigCompareSchema_(H30).append_only_safe, true, 'F1 and that state is classified append-only safe');
var driftHeaders = H30.slice(); driftHeaders[4] = 'country_renamed';
eq(tmigCompareSchema_(driftHeaders).first_order_drift_index, 4, 'F1 a REAL reorder/rename reports its exact index');
eq(tmigCompareSchema_(driftHeaders).append_only_safe, false, 'F1 and is not append-only safe');
eq(tmigCompareSchema_(H34.concat(['stowaway'])).first_order_drift_index, 34, 'F1 an unknown trailing column drifts at its own index');
eq(dry.rows_scanned, 3, 'F1 rows scanned');
ok(dry.status_counts && dry.status_counts.draft === 2 && dry.status_counts.expired === 1, 'F1 status counts');
eq(dry.ai_lineage_resolved_count, 1, 'F1 AI lineage resolved count');
eq(dry.manual_count, 1, 'F1 manual count');
eq(dry.terminal_count, 1, 'F1 terminal count');
eq(dry.legacy_ai_lineage_unresolved_count, 0, 'F1 unresolved legacy AI count');
eq(dry.source_unknown_count, 0, 'F1 unknown source count');
eq(dry.identity_conflict_count, 0, 'F1 identity conflict count');
eq(dry.write_count, 5, 'F1 exact writes: 4 columns + 1 backfill');
eq(dry.columns_to_append, SAD_LIFECYCLE_TAIL_COLUMNS_, 'F1 columns to append, in canonical order');
ok(!!dry.confirmation_checksum && /^AIMIG-/.test(dry.confirmation_checksum), 'F1 a confirmation checksum');
eq(dry.migration_readiness, 'READY', 'F1 migration readiness');
eq(dry.blocking_reasons, [], 'F1 blocking reasons');
ok(!!dry.rollback_feasibility.structural, 'F1 rollback feasibility is stated');
ok(/append_only_safe/.test(JSON.stringify(dry)) || dry.append_only_safe === true, 'F1 append-only safety is reported');
// masking: no raw business id in the report, but deterministic
var dryJson = JSON.stringify(dry);
ok(dryJson.indexOf('GAPINV-777') === -1, 'F2 raw business ids are MASKED in the report');
ok(dryJson.indexOf('SADH-K2-AAAA') === -1, 'F2 including draft ids');
eq(tmigMask_('GAPINV-777'), tmigMask_('GAPINV-777'), 'F2 and the mask is deterministic');
ok(tmigMask_('GAPINV-777') !== tmigMask_('GAPINV-778'), 'F2 while still distinguishing different values');

// (4) wrong checksum → zero writes
resetSpy();
var badSum = TEMP_AI_LIFECYCLE_MIGRATE_COMMIT({ mode: 'COMMIT', checksum: 'AIMIG-DEADBEEF' });
eq(totalWrites(), 0, 'J4 a wrong checksum performed ZERO writes');
eq(badSum.committed, false, 'J4 and did not commit');
ok(/CHECKSUM_MISMATCH/.test(badSum.blocking_reasons.join('|')), 'J4 with a named checksum mismatch');
// no mode → refuses, and never reads Script Properties
resetSpy();
var noMode = TEMP_AI_LIFECYCLE_MIGRATE_COMMIT({ checksum: dry.confirmation_checksum });
eq(totalWrites(), 0, 'G1 a commit without mode:COMMIT performed ZERO writes');
ok(/MODE_REQUIRED/.test(noMode.blocking_reasons.join('|')), 'G1 and says a mode is required');
resetSpy();
var noSum = TEMP_AI_LIFECYCLE_MIGRATE_COMMIT({ mode: 'COMMIT' });
eq(totalWrites(), 0, 'G1 a commit without a checksum performed ZERO writes');
ok(/CHECKSUM_REQUIRED/.test(noSum.blocking_reasons.join('|')), 'G1 and says a checksum is required');
['getScriptProperties', 'getUserProperties', 'PropertiesService'].forEach(function (bad) {
  ok(GMIG.indexOf(bad) === -1, 'C1 no Script Property is read for confirmation: ' + bad);
});

// (5) header drift → zero writes
var drifted = H30.slice(); drifted[4] = 'country_renamed';
CURRENT_SS = buildDb(drifted, [AI_RESOLVABLE]);
resetSpy();
var driftDry = TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN();
eq(driftDry.migration_readiness, 'BLOCKED', 'J5 a drifted header is BLOCKED');
ok(/HEADER_NOT_APPEND_ONLY_SAFE/.test(driftDry.blocking_reasons.join('|')), 'J5 with the append-only refusal named');
var driftCommit = TEMP_AI_LIFECYCLE_MIGRATE_COMMIT({ mode: 'COMMIT', checksum: driftDry.confirmation_checksum });
eq(totalWrites(), 0, 'J5 and a commit on a drifted header performed ZERO writes');
eq(driftCommit.committed, false, 'J5 committed:false');
ok(/REFUSED/.test(driftCommit.blocking_reasons.join('|')), 'J5 refusing rather than reordering');
ok(GMIGC.indexOf('moveColumns') === -1 && GMIGC.indexOf('deleteColumn') === -1 && GMIGC.indexOf('sort(') === -1,
  'D7 the tool has no capability to reorder or drop a live column at all');

// ---- the successful commit ------------------------------------------------------------------------------
CURRENT_SS = buildDb(H30, [AI_RESOLVABLE, MANUAL_ROW, EXPIRED_ROW]);
var beforeGrid = JSON.parse(JSON.stringify(CURRENT_SS.getSheetByName('shipping_allocation_drafts').grid));
var freshDry = TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN();
resetSpy();
LOCK_RELEASED = 0;
var committed = TEMP_AI_LIFECYCLE_MIGRATE_COMMIT({ mode: 'COMMIT', checksum: freshDry.confirmation_checksum });
eq(committed.committed, true, 'G2 a matching checksum commits');
eq(committed.columns_added.map(function (c) { return c.column; }), SAD_LIFECYCLE_TAIL_COLUMNS_,
  'G2 adding exactly the four approved columns, in canonical order');
eq(committed.cells_written, 1, 'J6 and applying exactly the one source-proven backfill');
eq(LOCK_RELEASED, 1, 'G3 the lock is released in finally');
eq(committed.verification.header_exact_match, true, 'G4 the new header is read back and verified exact');
eq(committed.verification.preexisting_cell_mismatches, [], 'J9 every pre-existing cell is byte-equivalent');
ok(committed.verification.preexisting_cells_compared >= 90, 'J9 and the comparison actually covered the grid ('
  + committed.verification.preexisting_cells_compared + ' cells)');
eq(committed.verification.backfills_verified, committed.verification.backfills_expected, 'G4 backfills verified by read-back');
eq(committed.verification.migration_version_live, AIPL_MIGRATION_VERSION_, 'G4 and the live schema now reports the version');
// (12) journal before write
ok(committed.journal.length === 5, 'G5 every change was journalled (5 entries)');
ok(committed.journal.every(function (j) { return j.applied === true; }), 'G5 and each is marked applied');
ok(committed.journal.filter(function (j) { return j.kind === 'ADD_COLUMN'; }).length === 4, 'G5 four structural entries');
ok(committed.journal.filter(function (j) { return j.kind === 'SET_CELL'; }).length === 1, 'G5 one value entry');

// (8)(9) quantities / notes / routes / user flags byte-preserved — verified on the real grid
var afterSheet = CURRENT_SS.getSheetByName('shipping_allocation_drafts');
var afterHeaders = afterSheet.grid[0];
eq(afterHeaders.slice(0, 30), H30, 'J9 the first 30 live columns are untouched and in order');
eq(afterHeaders.slice(30, 34), SAD_LIFECYCLE_TAIL_COLUMNS_, 'J9 with the tail appended after them');
for (var r = 1; r < beforeGrid.length; r++) {
  eq(afterSheet.grid[r].slice(0, 30).map(String), beforeGrid[r].slice(0, 30).map(String),
    'J9 row ' + (r + 1) + ' pre-existing cells are byte-identical');
}
var noteCol = afterHeaders.indexOf('note');
eq(String(afterSheet.grid[2][noteCol]), 'operator: split shipment agreed with factory', 'J8 the operator note survives verbatim');
var runCol = afterHeaders.indexOf('generation_run_id');
eq(String(afterSheet.grid[2][runCol]), '', 'J8 and the MANUAL row gets NO generation_run_id');
eq(String(afterSheet.grid[1][runCol]), d.generation_run_id, 'J6 while the AI row gets its derived run id');
eq(String(afterSheet.grid[3][runCol]), '', 'E4 and the already-expired row is not backfilled');
var statusCol = afterHeaders.indexOf('status');
eq([String(afterSheet.grid[1][statusCol]), String(afterSheet.grid[2][statusCol]), String(afterSheet.grid[3][statusCol])],
  ['draft', 'draft', 'expired'], 'G6 no business status was changed by the migration');
// idempotent re-run
var reDry = TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN();
eq(reDry.migration_readiness, 'NOTHING_TO_DO', 'G7 a second dry run reports nothing left to do');
eq(reDry.write_count, 0, 'G7 with zero proposed writes');
// validate + activation
var val = TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE();
eq(val.header_exact_match, true, 'G8 VALIDATE confirms the exact header');
eq(val.migration_version_live, AIPL_MIGRATION_VERSION_, 'G8 and the live migration version');
eq(val.DB_WRITES, 0, 'G8 while writing nothing');
eq(val.activation_gate.ready, true, 'G8 and the PRODUCTION activation gate now reports READY');
eq(val.lifecycle_activated, true, 'G8 so the next real run is allowed to proceed');
ok(GMIGC.indexOf('aiplActivationGate_') !== -1,
  'G8 VALIDATE calls the production gate itself — validating with a private check would prove something else');
// and the SAME gate refuses again the moment a required column is taken away
CURRENT_SS = buildDb(H30, [AI_RESOLVABLE]);
var valPre = TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE();
eq(valPre.lifecycle_activated, false, 'G8 while an unmigrated schema is NOT activated');
eq(valPre.activation_gate.code, 'AI_PLAN_LIFECYCLE_SCHEMA_NOT_READY', 'G8 with the addendum refusal code');
eq(valPre.DB_WRITES, 0, 'G8 and VALIDATE never writes in either state');
CURRENT_SS = buildDb(H34, [AI_RESOLVABLE, MANUAL_ROW, EXPIRED_ROW]);

// legacy-unresolved row blocks activation for its scope
CURRENT_SS = buildDb(H34, [AI_UNRESOLVABLE]);
var valLegacy = TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE();
eq(valLegacy.legacy_ai_lineage_unresolved_count, 1, 'E5 an unresolved legacy AI row is still reported after migration');

// identity conflict blocks
var dupA = JSON.parse(JSON.stringify(AI_RESOLVABLE));
var dupB = JSON.parse(JSON.stringify(AI_RESOLVABLE)); dupB.allocation_draft_id = 'SADH-K2-AAAA-2';
CURRENT_SS = buildDb(H30, [dupA, dupB]);
resetSpy();
var dupDry = TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN();
eq(totalWrites(), 0, 'I1 a duplicate-identity database still writes nothing during a dry run');
eq(dupDry.identity_conflict_count, 1, 'I1 the collision is detected');
eq(dupDry.migration_readiness, 'BLOCKED', 'I1 and blocks the migration');
ok(/never picks a survivor/.test(dupDry.blocking_reasons.join('|')), 'I1 explicitly without nominating a survivor');
var dupCommit = TEMP_AI_LIFECYCLE_MIGRATE_COMMIT({ mode: 'COMMIT', checksum: dupDry.confirmation_checksum });
eq(totalWrites(), 0, 'I1 and a commit attempt writes nothing');
ok(dupCommit.committed === false, 'I1 committed:false');

// lock unavailable
CURRENT_SS = buildDb(H30, [AI_RESOLVABLE]);
var lockDry = TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN();
LOCK_GRANTED = false; resetSpy();
var lockRes = TEMP_AI_LIFECYCLE_MIGRATE_COMMIT({ mode: 'COMMIT', checksum: lockDry.confirmation_checksum });
eq(totalWrites(), 0, 'G9 an unavailable lock writes nothing');
ok(/LOCK_UNAVAILABLE/.test(lockRes.blocking_reasons.join('|')), 'G9 and says so');
LOCK_GRANTED = true;

// missing table
CURRENT_SS = new FakeSS({});
resetSpy();
var noTable = TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN();
eq(totalWrites(), 0, 'G10 a missing table writes nothing');
ok(/MISSING_TABLE/.test(noTable.blocking_reasons.join('|')), 'G10 and is reported as a blocking reason, not thrown');

// ================================================================================================================
section('§I/§J — scope isolation and the untouched neighbours');
// ================================================================================================================
// (16) other scopes untouched
CURRENT_SS = buildDb(H30, [AI_RESOLVABLE, AI_UNRESOLVABLE]);
var multiDry = TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN();
eq(multiDry.write_count, 5, 'J16 only the resolvable row is proposed for backfill (4 columns + 1 cell)');
eq(multiDry.legacy_ai_lineage_unresolved_count, 1, 'J16 the other scope is reported, not written');
// (17) multi-route: two routes for one SKU are two identities, and neither suppresses the other
var routeA = JSON.parse(JSON.stringify(AI_RESOLVABLE));
var routeB = JSON.parse(JSON.stringify(AI_RESOLVABLE));
routeB.allocation_draft_id = 'SADH-K2-AAAB'; routeB.recommended_destination_warehouse_id = 'W10';
ok(sadK2GroupKey_(routeA) !== sadK2GroupKey_(routeB), 'J17 two routes are two canonical identities');
var pRoutes = aiplManualPrecedence_([routeA, routeB],
  [{ identity_key: sadK2GroupKey_(routeA) }, { identity_key: sadK2GroupKey_(routeB) }], keyOf);
eq(pRoutes.map(function (x) { return x.decision; }), ['PROCEED', 'PROCEED'], 'J17 multi-route behaviour is intact');
var clsRoutes = tmigClassifyRows_([routeA, routeB].map(function (r, i) { var c = JSON.parse(JSON.stringify(r)); c.__row = i + 2; return c; }));
eq(clsRoutes.identity_conflicts.length, 0, 'J17 and two routes are NOT an identity conflict');
// (18) duplicate-PK guards remain
ok(G16C.indexOf('DUPLICATE_LINE_IDENTITY_IN_BATCH') !== -1, 'J18 the FB-4B duplicate-line guard is intact');
ok(G16C.indexOf('BLOCKED_CONFLICT') !== -1, 'J18 as is the multi-active-draft conflict guard');
ok(/sadPreflightLineBatch_/.test(G16C), 'J18 and the batch preflight');
// (14) same execution key stays idempotent
ok(/body\.execution_key \|\| body\.executionKey/.test(G61C), 'J14 an explicit execution key is still honoured');
ok(/var generationRunId = 'AIRUN-' \+ sadFnv1a_\(executionKey\)/.test(G61C), 'J14 and derives the run id deterministically from it');
// (15) zero-result run still valid
ok(/var zeroResult = \(jobStatus === 'NO_DEMAND'\)/.test(G61C), 'J15 NO_DEMAND is still a zero-result run');
ok(/var runSucceeded = zeroResult \|\| allSuppressed \|\| \(anyOk && !anyFail\)/.test(G61C), 'J15 and still a success');
// (I) the FB-4B cleanup tool is neither modified nor invoked
ok(GMIG.indexOf('TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP') === -1, 'I2 the migration never invokes the FB-4B cleanup tool');
ok(GMIG.indexOf('DUPFIX') === -1, 'I2 nor references its confirmed duplicate group');
['deleteRow', 'deleteRows', 'removeSheet', 'deleteColumn', 'moveColumns'].forEach(function (bad) {
  ok(GMIG.indexOf(bad) === -1, 'I2 and has no deletion/merge capability: ' + bad);
});
['DriveApp', 'MailApp', 'GmailApp', 'sendEmail'].forEach(function (bad) {
  ok(GMIG.indexOf(bad) === -1, 'G11 no Drive or email capability: ' + bad);
});
ok(GMIG.indexOf('prodAssertDbTarget_') !== -1, 'G12 the exact-id target guard runs before anything is read');

// (19) demo seed byte-unchanged is proven by the repo diff, and asserted here as a no-reference invariant
ok(GMIG.indexOf('TEMP_demo_shipping_shipment_map_seed') === -1 && GMIGC.indexOf('demo') === -1,
  'J19 the migration references no Demo seed at all');

// deployment manifest + spec
ok(/TEMP_AIMIG_BUILD_VERSION_/.test(G63) && /TEMP_migrate_shipping_allocation_ai_lifecycle\.gs/.test(G63),
  'K1 the migration owner is registered in the deployment-identity manifest');
ok(/AI_PLAN_LIFECYCLE_SCHEMA_NOT_READY/.test(SPEC), 'K2 the spec records the corrected refusal code');
ok(/fail-\*\*open\*\* with a footnote|fail-\*\*open\*\*/.test(SPEC), 'K2 and names the FB-4C behaviour as fail-open');
ok(/binding operator decision/.test(SPEC), 'K2 the manual-precedence rule is canonical');
ok(/SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT/.test(SPEC) && /ACTIVE_SOURCE_IDENTITY_COLLISION/.test(SPEC),
  'K2 with both outcome codes');
ok(/append-only and fixed/.test(SPEC), 'K2 and the append-only canonical column order');
ok(/order-independent/.test(SPEC), 'K2 plus the code-sync/migration ordering guarantee');
ok(/timestamp is never a lineage authority/.test(SPEC), 'K2 and the lineage rule');

// ================================================================================================================
console.log('\n' + '-'.repeat(40));
console.log('AI PLAN LIFECYCLE MIGRATION (FB-4C ADDENDUM): ' + pass + ' passed, ' + fail + ' failed');
console.log('-'.repeat(40));
if (fail) process.exit(1);
