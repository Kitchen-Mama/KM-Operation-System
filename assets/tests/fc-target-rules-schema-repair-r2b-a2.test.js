// Kitchen Mama Operation System — FC-SUMMARY-R2B-A2-R1
// TARGET RULE ADDITIVE SCHEMA REPAIR, NAME-BASED GATE AND DELETE-PATH SAFETY
// Run: node assets/tests/fc-target-rules-schema-repair-r2b-a2.test.js
//
// LOCAL / FAKE-ONLY. No live Spreadsheet, no network, no DB. Extracts and runs the REAL active .gs source —
// the shared safety adapter (29_), the FC write helpers (14_) and the migration tool
// (TEMP_migrate_fc_target_rules_header_r2ba2.gs) — inside a vm context whose Spreadsheet RECORDS every write.
//
// THE FAULT THIS LOCKS SHUT, AND WHY IT IS NOT THE ONE R2B-A REPAIRED.
// Special Event was refused with HEADER_ORDER_MISMATCH: every required column was present, just out of order,
// and the repair was to stop requiring the order. Target Rule was refused with HEADER_MISSING, which is a
// different sentence: three REQUIRED columns are genuinely ABSENT from the live sheet —
//
//     scope_type          (the live sheet carries a legacy `scope` instead)
//     scope_id
//     target_percentage
//
// Order tolerance cannot conjure a column that is not there, and because the writer resolves cells by LIVE
// header name, relaxing the gate alone would not misplace those values — it would silently DROP them. This
// suite proves both of those statements against the real code before proving the additive repair fixes it.
//
// THE LIVE ROW 1 BELOW IS EVIDENCE, NOT INVENTION. It was supplied by the operator from the bound Operation DB
// spreadsheet after this project established that no deployed read can expose the header row of a table with
// zero data rows.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var KMSAFE_PATH = path.join(__dirname, '..', 'js', 'core', 'supply-planning-production-safety.js');
function gs(rel) { return fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', rel), 'utf8'); }

// FC-SUMMARY-R2B-A2-R6 — the migration helper is RETIRED from the active deployment. Its accepted
// source is sealed as a fixture (SHA-256 pinned), so every assertion below still runs against the
// exact bytes that ran in production, and none of them depends on a one-shot writer still being
// deployed. Dry-run planning, additive-only append, header stability, idempotent NO_OP, the actor
// source, zero fabricated rows, the old/new header hashes and append positions 28/29/30 are all
// unchanged — only where the text comes from has changed.
var MIG_FIXTURE = path.join(__dirname, 'fixtures', 'TEMP_migrate_fc_target_rules_header_r2ba2.retired.gs.txt');
var MIG_SEAL = 'b2f9e0b628b58f455132bd9f501d4b5c72f0e7cf367d5ae655fbdfa973698a8d';
function migSrc() {
  var b = fs.readFileSync(MIG_FIXTURE);
  var h = require('crypto').createHash('sha256').update(b).digest('hex');
  if (h !== MIG_SEAL) throw new Error('sealed migration fixture has been altered: ' + h);
  return b.toString('utf8');
}

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('source function not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces extracting: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*[\\s\\S]*?;\\s*\\n').exec(src);
  if (!m) throw new Error('source var not found: ' + name);
  return m[0];
}

// =================================================================================================
// THE LIVE fc_target_rules ROW 1 (operator-supplied, FC-SUMMARY-R2B-A2)
// =================================================================================================
var LIVE_ROW1 = ['target_rule_id', 'scope', 'year', 'company', 'marketplace', 'country', 'category', 'series',
  'sku', 'jan_pct', 'feb_pct', 'mar_pct', 'apr_pct', 'may_pct', 'jun_pct', 'jul_pct', 'aug_pct', 'sep_pct',
  'oct_pct', 'nov_pct', 'dec_pct', 'status', 'priority', 'created_by', 'created_at', 'updated_by',
  'updated_at', 'note'];

// The three columns the additive migration must append, in contract order.
var EXPECTED_MISSING = ['scope_type', 'scope_id', 'target_percentage'];
// The three live columns that are outside the canonical contract and must be LEFT ALONE.
var EXPECTED_EXTRA = ['scope', 'status', 'priority'];

// =================================================================================================
// FAKE SPREADSHEET — records writes, refuses anything structural that this round must never perform.
// =================================================================================================
function makeSheet(name, values) {
  var appended = [], setCells = [], headerWrites = [], rangeWrites = [];
  var s = {
    getName: function () { return name; },
    getLastRow: function () { return values.length === 1 && values[0].length === 0 ? 0 : values.length; },
    getLastColumn: function () { return values[0] ? values[0].length : 0; },
    getDataRange: function () { return { getValues: function () { return values.map(function (r) { return r.slice(); }); } }; },
    getRange: function (r, c, nr, nc) {
      var rows = nr === undefined ? 1 : nr, cols = nc === undefined ? 1 : nc, out = [];
      for (var i = 0; i < rows; i++) {
        var row = [];
        for (var j = 0; j < cols; j++) { var rr = (r - 1) + i, cc = (c - 1) + j; row.push(values[rr] ? values[rr][cc] : ''); }
        out.push(row);
      }
      return {
        getValues: function () { return out.map(function (x) { return x.slice(); }); },
        setValue: function (v) {
          if (r === 1) throw new Error('HEADER_CELL_WRITE_ATTEMPTED');
          setCells.push({ row: r, col: c, header: values[0][c - 1], value: v });
          while (values.length < r) values.push(new Array(values[0].length).fill(''));
          values[r - 1][c - 1] = v;
        },
        setValues: function (vals) {
          if (r === 1) {
            // the migration appends header cells to the RIGHT of the existing header, never over it
            headerWrites.push({ startCol: c, values: vals[0].slice() });
            for (var j = 0; j < vals[0].length; j++) values[0][(c - 1) + j] = vals[0][j];
            return;
          }
          // R2B-A2-R5-F2 — a BODY-ROW range write. This used to throw, because the only setValues this file
          // performed was the migration's header append. The Target Rule update now writes the whole row in
          // ONE call instead of ~28 single-cell setValue calls, so an interruption cannot leave a row
          // half-written with a new marketplace and an old percentage. The header rule above is unchanged.
          rangeWrites.push({ row: r, startCol: c, values: vals[0].slice() });
          while (values.length < r) values.push(new Array(values[0].length).fill(''));
          for (var k = 0; k < vals[0].length; k++) values[r - 1][(c - 1) + k] = vals[0][k];
        }
      };
    },
    appendRow: function (row) { appended.push(row.slice()); values.push(row.slice()); },
    deleteRow: function (i) { values.splice(i - 1, 1); s.__deleted.push(i); },
    insertColumnsAfter: function () { throw new Error('INSERT_COLUMNS_ATTEMPTED'); }
  };
  s.__appended = appended; s.__setCells = setCells; s.__headerWrites = headerWrites; s.__rangeWrites = rangeWrites;
  s.__values = values; s.__deleted = [];
  return s;
}
function makeSs(tables, id) {
  var sheets = {};
  Object.keys(tables).forEach(function (n) { sheets[n] = makeSheet(n, tables[n].map(function (r) { return r.slice(); })); });
  return {
    getId: function () { return id === undefined ? 'SS-DB' : id; },
    getSheetByName: function (n) { return Object.prototype.hasOwnProperty.call(sheets, n) ? sheets[n] : null; },
    insertSheet: function () { throw new Error('INSERT_SHEET_ATTEMPTED'); },
    __sheet: function (n) { return sheets[n]; }
  };
}

// =================================================================================================
// BUILD — a fresh context over the (optionally mutated) real sources.
// =================================================================================================
var ADAPTER_FNS = ['prodSafetyBundle_', 'prodExpectedDbId_', 'prodSchemaError_', 'prodAssertDbTarget_',
  'prodRequireSheet_', 'prodRequireColumns_', 'prodMigrateAppendColumns_'];
// R2B-A2-R5-F2 — the Target Rule write got its own identity-aware handler (canonical business key,
// LockService, duplicate and identity-mismatch refusals), so its constants and helpers join the sandbox.
var G14_VARS = ['FC_SPECIAL_EVENTS_HEADERS_', 'FC_TARGET_RULES_HEADERS_', 'FC_SCHEMA_ORDERED_',
  'FC_SCHEMA_BY_NAME_', 'FC_SCHEMA_BY_NAME_TABLES_',
  'FC_TR_SCOPE_TYPES_', 'FC_TR_RETIRED_IDENTITY_', 'FC_TR_KEY_FIELDS_', 'FC_TR_LOCK_MS_',
  // R2B-A2-R5-F5 — the version token's field lists.
  'FC_TR_MONTH_KEYS_', 'FC_TR_FINGERPRINT_FIELDS_', 'FC_TR_FINGERPRINT_NUMERIC_'];
var G14_FNS = ['fcWriteSchemaByNameApproved_', 'fcWriteTimestamp_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_',
  'fcWriteReadSheet_', 'fcWriteAppendByHeader_', 'fcWriteUpsert_', 'fcWriteDelete_',
  'fcTrStr_', 'fcTrUp_', 'fcTrScopeType_', 'fcTrIdentityUsable_', 'fcTrBusinessKey_',
  'fcTrScopeDimension_', 'fcTrValidateBody_', 'fcTrIndexRows_',
  // R2B-A2-R5-F5 — the stale-write gate and the saved-row receipt.
  'fcTrNum_', 'fcTrFingerprint_', 'fcTrReceiptFor_',
  'handleUpsertFcTargetRule_', 'handleDeleteFcTargetRule_'];
var MIG_FNS = ['tgtR2ba2Required_', 'tgtR2ba2Str_', 'tgtR2ba2Snapshot_', 'TEMP_migrateFcTargetRulesHeader_',
  'TEMP_validateFcTargetRulesHeader_'];

function build(mutate) {
  var A = gs('29_production_safety_adapter.gs');
  var G14 = gs('14_fc_write_handlers.gs');
  var MIG = migSrc();
  if (typeof mutate === 'function') { var m = mutate({ a: A, g14: G14, mig: MIG }); A = m.a; G14 = m.g14; MIG = m.mig; }

  var pieces = [];
  ADAPTER_FNS.forEach(function (n) { pieces.push(extractFn(A, n)); });
  G14_VARS.forEach(function (n) { pieces.push(extractVar(G14, n)); });
  G14_FNS.forEach(function (n) { pieces.push(extractFn(G14, n)); });
  // FC-SUMMARY-R2B-A2-R1-F1 — the reviewed migration actor constant. It replaced a Session.getActiveUser()
  // call that needed an OAuth scope this project does not hold, so it must be extracted alongside the
  // functions that read it or they resolve against nothing.
  pieces.push(extractVar(MIG, 'TEMP_R2BA2_MIGRATION_ACTOR_'));
  MIG_FNS.forEach(function (n) { pieces.push(extractFn(MIG, n)); });

  var uuid = 0;
  var ctx = {
    KMSAFE: require(KMSAFE_PATH),
    PRODUCTION_DB_SPREADSHEET_ID_: 'SS-DB',
    Logger: { log: function () {} },
    // The Target Rule write takes a script lock so two concurrent creates cannot both read "no match"
    // and both append. The fake grants it; a suite that wants contention sets lockBusy.
    LockService: { getScriptLock: function () { return {
      tryLock: function () { return !ctx.__lockBusy; }, releaseLock: function () {} }; } },
    Utilities: { getUuid: function () { uuid++; return ('abcdef01234567890000000000000000' + uuid).slice(-32); },
      formatDate: function () { return '2026-09-18 12:00:00'; } },
    // FC-SUMMARY-R2B-A2-R1-F1 — THE STUB THAT MADE A REAL DEFECT UNTESTABLE, REPLACED BY A TRAP.
    //
    // This previously returned a working `getActiveUser`, and 105 assertions passed against a file whose
    // live EXECUTE then threw on exactly that call:
    //
    //     Specified permissions are not sufficient to call Session.getActiveUser.
    //     Required permission: https://www.googleapis.com/auth/userinfo.email
    //
    // The Apps Script project does not hold that OAuth scope and deliberately will not request it, so a
    // stub that answered was asserting a capability the platform does not grant. getScriptTimeZone stays
    // real because it genuinely needs no scope; the two identity calls now fail the way production fails.
    // Full coverage of the repair lives in fc-target-rules-migration-actor-r2b-a2-f1.test.js.
    Session: { getScriptTimeZone: function () { return 'UTC'; },
      getActiveUser: function () {
        throw new Error('Specified permissions are not sufficient to call Session.getActiveUser. '
          + 'Required permission: https://www.googleapis.com/auth/userinfo.email');
      },
      getEffectiveUser: function () {
        throw new Error('Specified permissions are not sufficient to call Session.getEffectiveUser. '
          + 'Required permission: https://www.googleapis.com/auth/userinfo.email');
      } },
    jsonResponse_: function (o) { return o; },
    SpreadsheetApp: {
      getActiveSpreadsheet: function () { return ctx.__ss; },
      openById: function () { return ctx.__ss; },
      flush: function () {}
    },
    __ss: null, console: console
  };
  vm.createContext(ctx);
  vm.runInContext(pieces.join('\n'), ctx, { filename: 'fc-r2ba2-sources.js' });
  ctx.__use = function (ss) { ctx.__ss = ss; };
  return ctx;
}

// =================================================================================================
var pass = 0, fail = 0;
function ok(c, l, d) { if (c) pass++; else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) pass++; else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function token(fn, want, l) {
  try { fn(); fail++; console.error('FAIL  ' + l + ' — no refusal raised'); }
  catch (e) { if (e && e.safetyToken === want) pass++; else { fail++; console.error('FAIL  ' + l + ' — token "' + (e && e.safetyToken) + '" != "' + want + '"'); } }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 94 - n.length)).join('-')); }

var CTX = build(null);
var REQ = CTX.FC_TARGET_RULES_HEADERS_;
function db(header, rows) {
  var t = { fc_target_rules: [(header || LIVE_ROW1).slice()] };
  (rows || []).forEach(function (r) { t.fc_target_rules.push(r.slice()); });
  return t;
}

// =================================================================================================
section('A. THE LIVE HEADER — exactly what is wrong with it');
// =================================================================================================
eq(LIVE_ROW1.length, 28, 'A1 the live header carries 28 columns');
eq(REQ.length, 28, 'A2 the canonical contract also requires 28 — the counts coincide and prove nothing');
var missing = REQ.filter(function (h) { return LIVE_ROW1.indexOf(h) === -1; });
var extra = LIVE_ROW1.filter(function (h) { return REQ.indexOf(h) === -1; });
eq(missing, EXPECTED_MISSING, 'A3 three REQUIRED columns are genuinely absent');
eq(extra, EXPECTED_EXTRA, 'A4 and three live columns sit outside the contract');
eq(LIVE_ROW1.filter(function (h, i) { return LIVE_ROW1.indexOf(h) !== i; }), [], 'A5 no duplicate header');
eq(LIVE_ROW1.filter(function (h) { return h === ''; }), [], 'A6 no blank header');
ok(LIVE_ROW1.indexOf('scope') === 1 && LIVE_ROW1.indexOf('scope_type') === -1,
  'A7 `scope` is a legacy column with a DIFFERENT name from `scope_type` — not a reordering of it');

// The observed live refusal, reproduced through the real gate.
token(function () { CTX.prodRequireSheet_(makeSs(db()), 'fc_target_rules', REQ); },
  'HEADER_MISSING', 'A8 the ordered gate reproduces the operator\'s exact token');
try { CTX.prodRequireSheet_(makeSs(db()), 'fc_target_rules', REQ); }
catch (e) { eq(e.message, 'PRODUCTION_SAFETY:HEADER_MISSING [fc_target_rules]',
  'A9 including the exact message string that was reported'); }

// =================================================================================================
section('B. THE R2B-A REPAIR ALONE CANNOT FIX THIS — and would be dangerous if it could');
// =================================================================================================
ok(CTX.FC_SCHEMA_BY_NAME_TABLES_.indexOf('fc_target_rules') > -1,
  'B1 fc_target_rules IS now in the approved name-based set');
token(function () { CTX.fcWriteEnsureSheet_(makeSs(db()), 'fc_target_rules', REQ, CTX.FC_SCHEMA_BY_NAME_); },
  'MISSING_REQUIRED_HEADER',
  'B2 …and the presence gate STILL refuses, because order tolerance cannot conjure an absent column');
// That refusal is the second lock: membership alone never opens the write.
(function () {
  var ss = makeSs(db()); CTX.__use(ss);
  // R2B-A2-R5-F2 — a COMPLETE identity, so the schema gate is what refuses. With an incomplete one the
  // body validator refuses first (TARGET_RULE_IDENTITY_INCOMPLETE) and this assertion would be testing
  // the validator rather than the header gate it is named for.
  var res = CTX.handleUpsertFcTargetRule_({ scope_type: 'sku', scope_id: 'CO1100-R', sku: 'CO1100-R',
    company: 'ResUS', country: 'US', marketplace: 'Amazon', year: 2026, jan_pct: 91 });
  ok(res && res.success === false && /MISSING_REQUIRED_HEADER/.test(String(res.error)),
    'B3 a Target Rule save is refused with the REAL cause named, not a misleading order complaint', res && res.error);
  eq(ss.__sheet('fc_target_rules').__appended.length, 0, 'B4 and it is a zero write');
  eq(ss.__sheet('fc_target_rules').__setCells.length, 0, 'B5 no cell touched either');
})();
// And the reason the columns must actually exist: a name-based writer DROPS what it cannot place.
(function () {
  var ss = makeSs(db());
  var sheet = ss.__sheet('fc_target_rules');
  CTX.fcWriteAppendByHeader_(sheet, { target_rule_id: 'T1', scope_type: 'sku', scope_id: 'CO1100-R',
    target_percentage: 80, jan_pct: 91 });
  var row = sheet.__appended[0];
  eq(row[LIVE_ROW1.indexOf('jan_pct')], 91, 'B6 a column that EXISTS receives its value');
  var landed = {}; LIVE_ROW1.forEach(function (h, i) { if (row[i] !== '') landed[h] = row[i]; });
  ok(landed.scope_type === undefined && landed.scope_id === undefined && landed.target_percentage === undefined,
    'B7 the three ABSENT columns are not misplaced — their values VANISH, which is why the gate must hold', landed);
})();

// =================================================================================================
section('C. DRY RUN — reads only, and says exactly what it would do');
// =================================================================================================
(function () {
  var ss = makeSs(db()); CTX.__use(ss);
  var r = CTX.TEMP_migrateFcTargetRulesHeader_({ execute: false });
  eq(r.mode, 'DRY_RUN', 'C1 the default/explicit dry run is a DRY_RUN');
  eq(r.row1Verbatim, LIVE_ROW1, 'C2 it records row 1 VERBATIM before anything else');
  eq(r.missingRequired, EXPECTED_MISSING, 'C3 it names exactly the three missing required columns');
  eq(r.extraBeyondContract, EXPECTED_EXTRA, 'C4 and the three extras it will leave alone');
  eq(r.dataRowCount, 0, 'C5 it proves the data-row count');
  eq(r.resultingColumnCount, 31, 'C6 the resulting header would be 31 columns');
  eq(r.resultingHeader.slice(0, 28), LIVE_ROW1, 'C7 with the live 28 unchanged and in place');
  eq(r.resultingHeader.slice(28), EXPECTED_MISSING, 'C8 and the three appended at the right edge');
  eq(r.applied, false, 'C9 applied = false');
  eq(ss.__sheet('fc_target_rules').__headerWrites.length, 0, 'C10 NOTHING was written');
  eq(ss.__sheet('fc_target_rules').__values[0], LIVE_ROW1, 'C11 the live header is untouched');
  ok(r.oldHeaderHash && r.newHeaderHash && r.oldHeaderHash !== r.newHeaderHash,
    'C12 both header hashes are computed and differ');
  var plan = {}; r.columnPlan.forEach(function (p) { plan[p.column] = p.willSitAt; });
  eq(plan.scope_type, 28, 'C13 the plan places scope_type at index 28');
  eq(plan.target_percentage, 30, 'C14 and target_percentage at 30');
  eq(plan.jan_pct, 9, 'C15 while jan_pct stays exactly where it already lives');
})();

// =================================================================================================
section('D. EXECUTE — appends once, verifies its own post-conditions, and is idempotent');
// =================================================================================================
var AFTER = LIVE_ROW1.concat(EXPECTED_MISSING);
(function () {
  var ss = makeSs(db()); CTX.__use(ss);
  var r = CTX.TEMP_migrateFcTargetRulesHeader_({ execute: true });
  var sheet = ss.__sheet('fc_target_rules');
  eq(r.applied, true, 'D1 the migration applied');
  ok(/^APPLIED_OK/.test(r.outcome), 'D2 with every post-condition verified', r.outcome);
  eq(sheet.__values[0], AFTER, 'D3 the header is now the live 28 plus the three appended');
  eq(r.postConditions.noPreExistingHeaderMoved, true, 'D4 no pre-existing header moved');
  eq(r.postConditions.everyRequiredPresentExactlyOnce, true, 'D5 every required column present exactly once');
  eq(r.postConditions.noDataRowFabricated, true, 'D6 no data row was fabricated');
  eq(r.postConditions.hashMatchesPlan, true, 'D7 the resulting header hashes to the planned value');
  eq(sheet.__appended.length, 0, 'D8 no row was appended');
  eq(sheet.__deleted, [], 'D9 no row was deleted');
  eq(sheet.__headerWrites.length, 1, 'D10 exactly ONE header write occurred');
  eq(sheet.__headerWrites[0].startCol, 29, 'D11 and it began at column 29 — strictly to the right of the live 28');
  eq(sheet.__headerWrites[0].values, EXPECTED_MISSING, 'D12 writing only the three missing names');

  // idempotence — the second run must be a NO_OP, not a second append
  var r2 = CTX.TEMP_migrateFcTargetRulesHeader_({ execute: true });
  ok(/^NO_OP/.test(r2.outcome), 'D13 a SECOND execute is a NO_OP', r2.outcome);
  eq(r2.applied, false, 'D14 it applies nothing');
  eq(sheet.__headerWrites.length, 1, 'D15 and performs no further header write');
  eq(sheet.__values[0], AFTER, 'D16 the header is unchanged — no duplicated column');

  // the independent validator agrees
  var v = CTX.TEMP_validateFcTargetRulesHeader_();
  ok(/^CONTRACT_SATISFIED/.test(v.verdict), 'D17 the read-only validator confirms the contract', v.verdict);
  eq(v.missingRequired, [], 'D18 nothing required is missing');
  eq(v.requiredAppearingMoreThanOnce, [], 'D19 nothing required appears twice');
  eq(v.extraBeyondContract, EXPECTED_EXTRA, 'D20 the three legacy extras survive untouched');
})();

// The migration refuses the states it was not authorized for.
(function () {
  var ss = makeSs(db(LIVE_ROW1, [['T1'].concat(new Array(27).fill(''))])); CTX.__use(ss);
  var r = CTX.TEMP_migrateFcTargetRulesHeader_({ execute: true });
  ok(/^REFUSED_UNEXPECTED_DATA_ROWS/.test(r.outcome), 'D21 a populated table is refused, not assumed equivalent', r.outcome);
  eq(ss.__sheet('fc_target_rules').__headerWrites.length, 0, 'D22 and nothing is written');
})();
(function () {
  var ss = makeSs({ fc_target_rules: [[]] }); CTX.__use(ss);
  var r = CTX.TEMP_migrateFcTargetRulesHeader_({ execute: true });
  ok(/^REFUSED_NO_HEADER_ROW/.test(r.outcome), 'D23 an empty header row is a PROVISIONING decision, and is refused', r.outcome);
})();
(function () {
  var dup = LIVE_ROW1.concat(['sku']);
  var ss = makeSs(db(dup)); CTX.__use(ss);
  var r = CTX.TEMP_migrateFcTargetRulesHeader_({ execute: true });
  ok(/^REFUSED_AMBIGUOUS_HEADER/.test(r.outcome), 'D24 a duplicate header is refused — identity is ambiguous', r.outcome);
  eq(ss.__sheet('fc_target_rules').__headerWrites.length, 0, 'D25 with nothing written');
})();
(function () {
  var blank = LIVE_ROW1.slice(); blank.splice(5, 0, '');
  var ss = makeSs(db(blank)); CTX.__use(ss);
  var r = CTX.TEMP_migrateFcTargetRulesHeader_({ execute: true });
  ok(/^REFUSED_AMBIGUOUS_HEADER/.test(r.outcome), 'D26 a blank header is refused too', r.outcome);
})();
(function () {
  var ss = makeSs(db(), 'SS-WRONG'); CTX.__use(ss);
  var threw = null;
  try { CTX.TEMP_migrateFcTargetRulesHeader_({ execute: true }); } catch (e) { threw = e; }
  ok(threw && threw.safetyToken === 'WRONG_SPREADSHEET_TARGET', 'D27 the wrong database is refused before anything else');
})();

// =================================================================================================
section('E. AFTER THE REPAIR — the write works, and every month lands under its own column');
// =================================================================================================
function repairedDb() { return { fc_target_rules: [AFTER.slice()] }; }
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
var MONTH_VALUES = [91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102];
(function () {
  var ss = makeSs(repairedDb()); CTX.__use(ss);
  var body = { company: 'ResUS', country: 'US', marketplace: 'Amazon', scope_type: 'series', scope_id: 'CO1100',
    year: 2026, category: 'Electric Can Opener', series: 'CO1100', sku: '', target_percentage: 88,
    note: 'R2BA2 ACCEPTANCE', actor: 'r2ba2-test' };
  MONTHS.forEach(function (m, i) { body[m + '_pct'] = MONTH_VALUES[i]; });

  var res = CTX.handleUpsertFcTargetRule_(body);
  ok(res && res.success === true, 'E1 the Target Rule save now succeeds', res && res.error);
  var sheet = ss.__sheet('fc_target_rules');
  eq(sheet.__appended.length, 1, 'E2 exactly one row was appended');
  var row = sheet.__appended[0];
  eq(row.length, AFTER.length, 'E3 the row is exactly as wide as the repaired header');

  // THE assertion this whole round exists for: twelve distinct values, twelve named columns.
  var placed = {};
  MONTHS.forEach(function (m) { placed[m + '_pct'] = row[AFTER.indexOf(m + '_pct')]; });
  var want = {}; MONTHS.forEach(function (m, i) { want[m + '_pct'] = MONTH_VALUES[i]; });
  eq(placed, want, 'E4 all TWELVE monthly percentages land under their own month columns');

  eq(row[AFTER.indexOf('target_percentage')], 88, 'E5 target_percentage lands in the NEWLY APPENDED column');
  eq(row[AFTER.indexOf('scope_type')], 'SERIES', 'E6 scope_type lands in its newly appended column, canonicalised UPPERCASE (R5-F2)');
  eq(row[AFTER.indexOf('scope_id')], 'CO1100', 'E7 scope_id likewise');
  eq(row[AFTER.indexOf('scope')], '', 'E8 the legacy `scope` column is left UNWRITTEN — one authority, not two');
  eq(row[AFTER.indexOf('status')], '', 'E9 the extra `status` column is not invented');
  eq(row[AFTER.indexOf('priority')], '', 'E10 nor `priority`');
  eq(row[AFTER.indexOf('year')], 2026, 'E11 year lands at its LIVE index 2, not the contract index 6');
  eq(row[AFTER.indexOf('company')], 'ResUS', 'E12 company at live index 3, not contract index 1');
  eq(row[AFTER.indexOf('country')], 'US', 'E13 country at live index 5');
  eq(row[AFTER.indexOf('marketplace')], 'Amazon', 'E14 marketplace at live index 4');
  eq(row[AFTER.indexOf('series')], 'CO1100', 'E15 series');
  eq(row[AFTER.indexOf('category')], 'Electric Can Opener', 'E16 category');
  eq(row[AFTER.indexOf('note')], 'R2BA2 ACCEPTANCE', 'E17 note at live index 27');
  eq(row[AFTER.indexOf('created_by')], 'r2ba2-test', 'E18 created_by populated');
  eq(row[AFTER.indexOf('created_at')], '2026-09-18 12:00:00', 'E19 created_at populated');
  eq(row[AFTER.indexOf('updated_by')], 'r2ba2-test', 'E20 updated_by populated');
  eq(row[AFTER.indexOf('updated_at')], '2026-09-18 12:00:00', 'E21 updated_at populated');
  ok(/^fc_target_rules-/.test(row[AFTER.indexOf('target_rule_id')]) || row[AFTER.indexOf('target_rule_id')] !== '',
    'E22 target_rule_id is non-blank');
})();

// The same id updates in place rather than duplicating.
(function () {
  var ss = makeSs(repairedDb()); CTX.__use(ss);
  var body = { scope_type: 'series', scope_id: 'CO1100', company: 'ResUS', country: 'US',
    marketplace: 'Amazon', year: 2026, target_percentage: 88, actor: 't' };
  var first = CTX.handleUpsertFcTargetRule_(body);
  var id = first.data.id;
  var sheet = ss.__sheet('fc_target_rules');
  eq(sheet.__appended.length, 1, 'E23 the first save appends one row');
  // R2B-A2-R5-F5 — an update now carries the version it was composed against. The claim here is
  // unchanged (same id updates in place, no duplicate); it simply has to be asked for honestly now.
  var stored = CTX.fcTrIndexRows_(CTX.fcWriteReadSheet_(sheet)).filter(function (r) { return r.id === id; })[0];
  var noVersion = CTX.handleUpsertFcTargetRule_(Object.assign({}, body, { target_rule_id: id, target_percentage: 55 }));
  ok(noVersion.success === false && noVersion.error === 'TARGET_RULE_VERSION_REQUIRED',
    'E23a an update with no expected version is refused outright', noVersion);
  var second = CTX.handleUpsertFcTargetRule_(Object.assign({}, body,
    { target_rule_id: id, target_percentage: 77, expected_row_version: stored.fingerprint }));
  ok(second.success === true && second.data.created === false, 'E24 the same target_rule_id UPDATES in place', second);
  eq(sheet.__appended.length, 1, 'E25 no second row was appended — no duplicate');
  eq(sheet.__values[1][AFTER.indexOf('target_percentage')], 77, 'E26 and the value was actually updated');
  eq(sheet.__values[1][AFTER.indexOf('created_by')], 't', 'E27 created_by preserved on update');
})();

// =================================================================================================
section('F. THE DELETE PATH IS NO LONGER THE LAXER DOOR');
// =================================================================================================
(function () {
  // Before R2B-A2 this reached deleteRow with no schema validation at all.
  var ss = makeSs(db()); CTX.__use(ss);   // the UNREPAIRED header
  var res = CTX.handleDeleteFcTargetRule_({ target_rule_id: 'T1' });
  ok(res && res.success === false && /MISSING_REQUIRED_HEADER/.test(String(res.error)),
    'F1 a delete against the UNREPAIRED header returns a typed refusal envelope — the same shape the '
    + 'Target Rule SAVE returns, so neither door is the laxer one', res && res.error);
  // the gate refuses before any deleteRow could run
  var threw = null;
  try { CTX.fcWriteDelete_(makeSs(db()), 'fc_target_rules', 'target_rule_id', 'T1', REQ, CTX.FC_SCHEMA_BY_NAME_); }
  catch (e) { threw = e; }
  ok(threw && threw.safetyToken === 'MISSING_REQUIRED_HEADER',
    'F2 a delete against the UNREPAIRED header is refused by the same gate as the write', threw && threw.message);
  eq(ss.__sheet('fc_target_rules').__deleted, [], 'F3 and no row was deleted');
})();
(function () {
  var ss = makeSs({ fc_target_rules: [AFTER.slice(), ['T1'].concat(new Array(AFTER.length - 1).fill(''))] });
  var r = CTX.fcWriteDelete_(ss, 'fc_target_rules', 'target_rule_id', 'T1', REQ, CTX.FC_SCHEMA_BY_NAME_);
  eq(r.deleted, true, 'F4 against a REPAIRED header a real delete proceeds');
  eq(ss.__sheet('fc_target_rules').__deleted, [2], 'F5 removing exactly the matching row');
})();
(function () {
  var ss = makeSs({ fc_target_rules: [AFTER.slice()] });
  var r = CTX.fcWriteDelete_(ss, 'fc_target_rules', 'target_rule_id', 'NOPE', REQ, CTX.FC_SCHEMA_BY_NAME_);
  eq(r.deleted, false, 'F6 an id that is not there is not deleted');
  eq(r.reason, 'not_found', 'F7 and reports not_found');
  eq(ss.__sheet('fc_target_rules').__deleted, [], 'F8 which is a ZERO-WRITE outcome, as before');
})();
(function () {
  var ss = makeSs({ other: [['x']] });
  var r = CTX.fcWriteDelete_(ss, 'fc_target_rules', 'target_rule_id', 'T1', REQ, CTX.FC_SCHEMA_BY_NAME_);
  eq(r.reason, 'sheet_not_found', 'F9 an absent tab stays the soft outcome it has always been');
})();
(function () {
  var dup = AFTER.concat(['sku']);
  token(function () { CTX.fcWriteDelete_(makeSs({ fc_target_rules: [dup] }), 'fc_target_rules',
    'target_rule_id', 'T1', REQ, CTX.FC_SCHEMA_BY_NAME_); },
    'HEADER_DUPLICATE', 'F10 a duplicate header refuses the delete — a positional deleteRow on an ambiguous '
    + 'header is exactly the unrecoverable case');
  var blank = AFTER.slice(); blank.splice(3, 0, '');
  token(function () { CTX.fcWriteDelete_(makeSs({ fc_target_rules: [blank] }), 'fc_target_rules',
    'target_rule_id', 'T1', REQ, CTX.FC_SCHEMA_BY_NAME_); },
    'HEADER_BLANK', 'F11 and so does a blank header');
})();

// =================================================================================================
section('G. SCOPE — nothing else moved');
// =================================================================================================
eq(CTX.FC_SCHEMA_BY_NAME_TABLES_.slice().sort(),
  ['campaign_sku_lines', 'campaigns', 'fc_special_events', 'fc_target_rules'],
  'G1 the approved set is exactly four tables');
(function () {
  var MOV = ['movement_id', 'sku', 'qty'];
  var ss = makeSs({ factory_stock_movements: [['sku', 'movement_id', 'qty']] });
  token(function () { CTX.fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV); },
    'HEADER_ORDER_MISMATCH', 'G2 an unapproved table still gets the ORDERED gate');
  token(function () { CTX.fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV, CTX.FC_SCHEMA_BY_NAME_); },
    'HEADER_ORDER_MISMATCH', 'G3 and cannot opt itself in');
})();
eq(CTX.fcWriteSchemaByNameApproved_('fc_target_rules', undefined), false,
  'G4 fc_target_rules with no explicit opt-in still gets ORDERED');
eq(CTX.fcWriteSchemaByNameApproved_('fc_target_rules', CTX.FC_SCHEMA_BY_NAME_), true, 'G5 both locks, and only then');
(function () {
  function codeOnly(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''); }
  var src = codeOnly(gs('14_fc_write_handlers.gs'));
  var writes = src.match(/getRange\([^)]*\)\s*\.\s*setValues?\s*\(/g) || [];
  // R2B-A2-R5-F2 — a FULL-WIDTH row write is exempt, and only that. What G6 forbids is resolving a column
  // from a literal OFFSET: `getRange(row, 5)` assumes column 5 holds some field. `getRange(row, 1, 1, width)`
  // assumes nothing — it rewrites the entire row, and the values were placed into that array BY HEADER NAME
  // beforehand. Writing the row in one call is what stops an interruption leaving it half-updated.
  var lit = writes.filter(function (w) {
    var args = w.slice(w.indexOf('(') + 1, w.indexOf(')')).split(',');
    if (!(args.length >= 2 && /^\s*\d+\s*$/.test(args[1]))) return false;
    var fullRow = args.length === 4 && /^\s*1\s*$/.test(args[1]) && /^\s*1\s*$/.test(args[2])
      && !/^\s*\d+\s*$/.test(args[3]);
    return !fullRow;
  });
  eq(lit, [], 'G6 no write in 14_ resolves its column from a literal index');
  ok(writes.length > 0, 'G7 and write sites exist, so G6 is not vacuous');
  var mig = codeOnly(migSrc());
  ok(!/insertSheet|deleteColumn|deleteRow|setName|moveTo/.test(mig),
    'G8 the migration tool contains no sheet create, column delete, row delete, rename or move');
  ok(!/action ===|router/i.test(mig), 'G9 and is not routed — the Run dropdown is the only way in');
})();

// =================================================================================================
section('H. MUTANTS');
// =================================================================================================
function swap(src, a, b) {
  var n = src.split(a).length - 1;
  if (n !== 1) throw new Error('mutation anchor hit ' + n + ' time(s): ' + a.slice(0, 70));
  return src.split(a).join(b);
}
var mutants = [
  { id: 'M1', why: 'fc_target_rules omitted from the approved list',
    mutate: function (s) { return { a: s.a, mig: s.mig,
      g14: swap(s.g14, "'fc_special_events', 'fc_target_rules'];", "'fc_special_events'];") }; },
    check: function (c) {
      var ss = makeSs({ fc_target_rules: [AFTER.slice()] }); c.__use(ss);
      var r = c.handleUpsertFcTargetRule_({ scope_type: 'series', scope_id: 'CO1100', jan_pct: 91, actor: 't' });
      return r && r.success === true;                      // correct behaviour = the save works
    } },

  { id: 'M2', why: 'a missing monthly column is accepted instead of refused',
    mutate: function (s) { return { a: s.a, mig: s.mig, g14: s.g14 }; },
    mutateAdapter: function (a) { return swap(a, '  if (missing.length) throw prodSchemaError_', '  if (false) throw prodSchemaError_'); },
    check: function (c) {
      var noJan = AFTER.filter(function (h) { return h !== 'jan_pct'; });
      try { c.fcWriteEnsureSheet_(makeSs({ fc_target_rules: [noJan] }), 'fc_target_rules', c.FC_TARGET_RULES_HEADERS_,
        c.FC_SCHEMA_BY_NAME_); return false; }
      catch (e) { return e.safetyToken === 'MISSING_REQUIRED_HEADER'; }
    } },

  { id: 'M3', why: 'a duplicate header is accepted',
    mutate: function (s) { return s; },
    mutateCore: function (core) { return core.replace(
      'else if (duplicateHeaders.length) schemaStatus = SCHEMA_STATUS.HEADER_DUPLICATE;', ''); },
    check: function (c) {
      try { c.fcWriteEnsureSheet_(makeSs({ fc_target_rules: [AFTER.concat(['sku'])] }), 'fc_target_rules',
        c.FC_TARGET_RULES_HEADERS_, c.FC_SCHEMA_BY_NAME_); return false; }
      catch (e) { return e.safetyToken === 'HEADER_DUPLICATE'; }
    } },

  { id: 'M4', why: 'a blank header is accepted',
    mutate: function (s) { return s; },
    mutateCore: function (core) { return core.replace(
      'else if (blankHeaderIndexes.length) schemaStatus = SCHEMA_STATUS.HEADER_BLANK;', ''); },
    check: function (c) {
      var blank = AFTER.slice(); blank.splice(3, 0, '');
      try { c.fcWriteEnsureSheet_(makeSs({ fc_target_rules: [blank] }), 'fc_target_rules',
        c.FC_TARGET_RULES_HEADERS_, c.FC_SCHEMA_BY_NAME_); return false; }
      catch (e) { return e.safetyToken === 'HEADER_BLANK'; }
    } },

  { id: 'M5', why: 'a numeric-position write is introduced into the append writer',
    mutate: function (s) { return { a: s.a, mig: s.mig,
      g14: swap(s.g14, "    if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) {\n      row[i] = obj[headers[i]];",
        "    if (obj.hasOwnProperty(FC_TARGET_RULES_HEADERS_[i]) && obj[FC_TARGET_RULES_HEADERS_[i]] !== undefined && obj[FC_TARGET_RULES_HEADERS_[i]] !== null) {\n      row[i] = obj[FC_TARGET_RULES_HEADERS_[i]];") }; },
    check: function (c) {
      var ss = makeSs({ fc_target_rules: [AFTER.slice()] }); c.__use(ss);
      var body = { scope_type: 'series', scope_id: 'CO1100', actor: 't' };
      MONTHS.forEach(function (m, i) { body[m + '_pct'] = MONTH_VALUES[i]; });
      c.handleUpsertFcTargetRule_(body);
      var row = ss.__sheet('fc_target_rules').__appended[0];
      return MONTHS.every(function (m, i) { return row[AFTER.indexOf(m + '_pct')] === MONTH_VALUES[i]; });
    } },

  { id: 'M6', why: 'the global allowlist is accidentally expanded to every table',
    mutate: function (s) { return { a: s.a, mig: s.mig,
      g14: swap(s.g14, 'if (fcWriteSchemaByNameApproved_(name, mode)) {', 'if (true) {') }; },
    check: function (c) {
      try { c.fcWriteEnsureSheet_(makeSs({ factory_stock_movements: [['sku', 'movement_id', 'qty']] }),
        'factory_stock_movements', ['movement_id', 'sku', 'qty']); return false; }
      catch (e) { return e.safetyToken === 'HEADER_ORDER_MISMATCH'; }
    } },

  // IDEMPOTENCE HAS TWO INDEPENDENT GUARDS, so it takes two mutants to test it honestly. The migration's own
  // NO_OP early return is the first; prodMigrateAppendColumns_ re-deriving the missing set from the LIVE
  // header is the second. Removing only the first changes no header at all — which is a real property worth
  // knowing, not a test that failed to bite.
  { id: 'M7', why: 'the NO_OP guard is removed, so a rerun stops reporting itself as a no-op',
    mutate: function (s) { return { a: s.a, g14: s.g14,
      mig: swap(s.mig, "  if (!missing.length) {\n    report.outcome = 'NO_OP",
        "  if (false) {\n    report.outcome = 'NO_OP") }; },
    check: function (c) {
      var ss = makeSs(db()); c.__use(ss);
      c.TEMP_migrateFcTargetRulesHeader_({ execute: true });
      var r2 = c.TEMP_migrateFcTargetRulesHeader_({ execute: true });
      return /^NO_OP/.test(r2.outcome) && r2.applied === false;
    } },

  { id: 'M7b', why: 'ALL THREE idempotence guards defeated — the appended headers then really do duplicate',
    mutate: function (s) { return { g14: s.g14,
      mig: swap(swap(s.mig, "  if (!missing.length) {\n    report.outcome = 'NO_OP",
          "  if (false) {\n    report.outcome = 'NO_OP"),
        "  var missing = required.filter(function (h) { return !have[h]; });",
        "  var missing = ['scope_type', 'scope_id', 'target_percentage'];"),
      a: swap(s.a, "names.forEach(function (h) { if (h && live.indexOf(h) === -1 && missing.indexOf(h) === -1) missing.push(h); });",
        "names.forEach(function (h) { if (h) missing.push(h); });") }; },
    check: function (c) {
      var ss = makeSs(db()); c.__use(ss);
      c.TEMP_migrateFcTargetRulesHeader_({ execute: true });
      c.TEMP_migrateFcTargetRulesHeader_({ execute: true });
      var h = ss.__sheet('fc_target_rules').__values[0];
      return JSON.stringify(h) === JSON.stringify(AFTER);    // unchanged after a second run
    } },

  { id: 'M8', why: 'the delete path loses its gate and can deleteRow on an unvalidated header',
    mutate: function (s) { return { a: s.a, mig: s.mig,
      g14: swap(s.g14, '  var sheet = fcWriteEnsureSheet_(ss, sheetName, headers || [], mode);\n  if (headers && headers.length) fcWriteEnsureColumns_(sheet, headers);',
        '  var sheet = ss.getSheetByName(sheetName);') }; },
    check: function (c) {
      try { c.fcWriteDelete_(makeSs({ fc_target_rules: [AFTER.concat(['sku'])] }), 'fc_target_rules',
        'target_rule_id', 'T1', c.FC_TARGET_RULES_HEADERS_, c.FC_SCHEMA_BY_NAME_); return false; }
      catch (e) { return e.safetyToken === 'HEADER_DUPLICATE'; }
    } },

  { id: 'M9', why: 'the migration stops verifying that no pre-existing header moved',
    mutate: function (s) { return { a: s.a, g14: s.g14,
      mig: swap(s.mig, '    noPreExistingHeaderMoved: snap.actual.every(function (h, i) { return after.actual[i] === h; }),',
        '    noPreExistingHeaderMoved: true,') }; },
    check: function (c) {
      var src = migSrc();
      void src;
      var ss = makeSs(db()); c.__use(ss);
      var r = c.TEMP_migrateFcTargetRulesHeader_({ execute: true });
      // the post-condition must be COMPUTED, not asserted: prove it reacts to a real move
      var ss2 = makeSs(db()); c.__use(ss2);
      var sheet2 = ss2.__sheet('fc_target_rules');
      var realSetValues = sheet2.getRange;
      sheet2.getRange = function (rr, cc, nr, nc) {
        var rg = realSetValues.call(sheet2, rr, cc, nr, nc);
        var orig = rg.setValues;
        rg.setValues = function (v) { orig.call(rg, v); sheet2.__values[0][0] = 'MOVED'; };
        return rg;
      };
      var r2 = c.TEMP_migrateFcTargetRulesHeader_({ execute: true });
      return r.postConditions.noPreExistingHeaderMoved === true && r2.postConditions.noPreExistingHeaderMoved === false;
    } }
];

function buildMutant(m) {
  if (!m.mutateCore && !m.mutateAdapter) return build(m.mutate);
  var ctx;
  if (m.mutateCore) {
    var tmp = path.join(require('os').tmpdir(), 'km-r2ba2-core-' + m.id + '.js');
    fs.writeFileSync(tmp, m.mutateCore(fs.readFileSync(KMSAFE_PATH, 'utf8')), 'utf8');
    delete require.cache[require.resolve(tmp)];
    var patched = require(tmp);
    ctx = build(m.mutate);
    ctx.KMSAFE = patched;
    try { fs.unlinkSync(tmp); } catch (e) {}
  } else {
    ctx = build(function (s) { var t = m.mutate(s); return { a: m.mutateAdapter(t.a), g14: t.g14, mig: t.mig }; });
  }
  return ctx;
}

var caught = 0, survived = 0;
mutants.forEach(function (m) {
  var held;
  try { held = m.check(buildMutant(m)); } catch (e) { held = false; }
  if (held) { survived++; console.error('SURVIVED  ' + m.id + '  ' + m.why); }
  else { caught++; console.log('ok   ' + m.id + '  ' + m.why + ' (caught)'); }
});

// =================================================================================================
console.log('\n' + new Array(101).join('='));
console.log('FC TARGET RULES SCHEMA REPAIR (R2B-A2) — passed ' + pass + '  failed ' + fail +
  '  |  mutants caught ' + caught + '  survived ' + survived);
console.log(new Array(101).join('='));
process.exit((fail === 0 && survived === 0) ? 0 : 1);
