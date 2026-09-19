// Kitchen Mama Operation System — FC-SUMMARY-R2B-A2-R1-F1
// THE MIGRATION ACTOR, AND THE OAUTH SCOPE THAT WAS NEVER GOING TO BE GRANTED
// Run: node assets/tests/fc-target-rules-migration-actor-r2b-a2-f1.test.js
//
// LOCAL / FAKE-ONLY. No live Spreadsheet, no network, no DB, no deployment. It extracts and runs the REAL
// active .gs source inside a vm whose Spreadsheet RECORDS every header write and whose Session object is a
// TRAP rather than a convenience.
//
// WHAT HAPPENED, AND WHY THE EXISTING SUITE COULD NOT HAVE CAUGHT IT.
// The live EXECUTE threw:
//
//     Specified permissions are not sufficient to call Session.getActiveUser.
//     Required permission: https://www.googleapis.com/auth/userinfo.email
//       TEMP_migrateFcTargetRulesHeader_  line 170
//       TEMP_R2BA2_EXECUTE_FcTargetRulesHeader  line 238
//
// 105 assertions passed against that same file the day before. They passed because the harness handed the
// code a Session object that ANSWERED — `getActiveUser: function () { return { getEmail: ... } }` — so the
// fixture modelled a permission the Apps Script project does not hold, and the one line that depended on it
// was the one line the fixture made impossible to fail. A stub that cannot fail is not a test of the thing
// it stubs; it is a decision that the thing always works.
//
// So the trap here does the opposite of a convenience stub: it COUNTS every touch and throws the real error.
// A passing run is therefore evidence of an absence — that no code path reached for an identity the project
// cannot prove — and absence is exactly what had to be established. Touch counts, not string scans: a
// grep for 'Session.' cannot tell a call from the comment explaining why there is no call, and this file
// deliberately contains several of the latter.
//
// WHY A CONSTANT IS THE RIGHT ANSWER AND A SCOPE IS NOT. `actor` is an audit field recording who authorized
// one schema change. Adding userinfo.email to appsscript.json would re-prompt every user for consent on the
// next deployment and permanently widen what the whole web app may do — a production authorization change,
// bought to fill in one string in a file that is deleted after it runs once.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var REPO = path.join(__dirname, '..', '..');
var ASD = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
var MIG_REL = 'assets/specs/active/apps-script/TEMP_migrate_fc_target_rules_header_r2ba2.gs';   // the path it occupied until R6
// The commit the live failure was produced from. Pinned by sha, not by HEAD: once the corrective commit
// lands, HEAD is the FIXED file, and section H must keep testing the one that actually failed.
var PRE_FIX_SHA = '5ec318a8c813afe16bcb69c6d61d649f296f360b';

function gs(rel) { return fs.readFileSync(path.join(ASD, rel), 'utf8'); }

// FC-SUMMARY-R2B-A2-R6 — THE HELPER IS RETIRED. It ran once, in production, and the columns it
// appended are there; an unrouted one-shot writer left lying in the deployment is a hazard with no
// remaining purpose. Its ACCEPTED SOURCE is frozen byte-for-byte as a fixture owned by this suite,
// pinned by SHA-256 in .gitattributes so an EOL rewrite on checkout cannot quietly break the seal.
//
// Everything this suite proved about the migration it still proves, against the same bytes. What it
// no longer does is REQUIRE the active runtime file to exist — which is the assertion that would have
// blocked the retirement while proving nothing about the migration.
var MIG_FIXTURE = path.join(__dirname, 'fixtures', 'TEMP_migrate_fc_target_rules_header_r2ba2.retired.gs.txt');
var MIG_SEAL = 'b2f9e0b628b58f455132bd9f501d4b5c72f0e7cf367d5ae655fbdfa973698a8d';
var MIG_ACTIVE = path.join(ASD, 'TEMP_migrate_fc_target_rules_header_r2ba2.gs');
function migSrc() {
  var b = fs.readFileSync(MIG_FIXTURE);
  var h = require('crypto').createHash('sha256').update(b).digest('hex');
  if (h !== MIG_SEAL) throw new Error('sealed migration fixture has been altered: ' + h);
  return b.toString('utf8');
}
function gsAt(sha, rel) {
  return cp.execSync('git show ' + sha + ':' + rel, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
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
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*[\\s\\S]*?;\\s*\\r?\\n').exec(src);
  if (!m) throw new Error('source var not found: ' + name);
  return m[0];
}
/**
 * The executable part of a .gs file: comments and string literals removed.
 *
 * A5 below asserts that the actor cannot arrive from a payload, a query string or localStorage. The
 * first version of that assertion scanned the raw file and failed — because the file CONTAINS those
 * words, in the comment explaining that the actor may not come from them. That is the exact mistake
 * this suite's preamble warns about one screen above: a grep cannot tell a call site from the prose
 * describing why there is no call site. So the scan is performed on code only.
 */
function codeOnly(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')       // line comments (not a protocol's //)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")       // single-quoted literals
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');     // double-quoted literals
}
function swap(src, a, b) {
  // The .gs corpus is CRLF; the anchors below are written LF. Match on a normalized copy so an anchor
  // cannot silently miss for a reason that has nothing to do with what it is testing.
  var n = src.replace(/\r\n/g, '\n');
  if (n.split(a).length - 1 !== 1) throw new Error('mutation anchor is not unique: ' + a.slice(0, 80));
  return n.split(a).join(b);
}

// =================================================================================================
// THE REVIEWED PLAN. These are the numbers the live DRY RUN produced and the numbers §2 froze.
// =================================================================================================
var LIVE_ROW1 = ['target_rule_id', 'scope', 'year', 'company', 'marketplace', 'country', 'category', 'series',
  'sku', 'jan_pct', 'feb_pct', 'mar_pct', 'apr_pct', 'may_pct', 'jun_pct', 'jul_pct', 'aug_pct', 'sep_pct',
  'oct_pct', 'nov_pct', 'dec_pct', 'status', 'priority', 'created_by', 'created_at', 'updated_by',
  'updated_at', 'note'];
var EXPECTED_APPEND = ['scope_type', 'scope_id', 'target_percentage'];
var AFTER = LIVE_ROW1.concat(EXPECTED_APPEND);
var OLD_HASH = 'fce90d5f';
var NEW_HASH = 'b7233849';
var REVIEWED_ACTOR = 'vic.zhou@shopkitchenmama.com';

// =================================================================================================
// FAKE SPREADSHEET — records header writes, refuses every structural call this migration must not make.
// =================================================================================================
function makeSheet(name, values) {
  var s = {
    __values: values, __headerWrites: [], __cellWrites: [], __appended: [], __deleted: [],
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
        setValue: function (v) { s.__cellWrites.push({ row: r, col: c, value: v }); values[r - 1][c - 1] = v; },
        setValues: function (vals) {
          if (r !== 1) throw new Error('RANGE_SETVALUES_OUTSIDE_HEADER');
          s.__headerWrites.push({ startCol: c, values: vals[0].slice() });
          for (var j = 0; j < vals[0].length; j++) values[0][(c - 1) + j] = vals[0][j];
        }
      };
    },
    appendRow: function (row) { s.__appended.push(row.slice()); values.push(row.slice()); },
    deleteRow: function (i) { s.__deleted.push(i); values.splice(i - 1, 1); },
    insertColumnsAfter: function () { throw new Error('INSERT_COLUMNS_ATTEMPTED'); },
    insertColumns: function () { throw new Error('INSERT_COLUMNS_ATTEMPTED'); }
  };
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
function db(header, rows) {
  var t = { fc_target_rules: [(header || LIVE_ROW1).slice()] };
  (rows || []).forEach(function (r) { t.fc_target_rules.push(r.slice()); });
  return t;
}

// =================================================================================================
// THE SESSION TRAP. Counts every touch and then fails exactly the way the deployed project failed.
//
// getScriptTimeZone is NOT trapped, deliberately: it needs no OAuth scope, twenty-odd files across this
// corpus call it, and trapping it would make this suite assert something untrue about the platform.
// =================================================================================================
function makeSessionTrap() {
  var touches = { getActiveUser: 0, getEffectiveUser: 0, getScriptTimeZone: 0 };
  function denied(which) {
    var e = new Error('Specified permissions are not sufficient to call Session.' + which
      + '. Required permission: https://www.googleapis.com/auth/userinfo.email');
    e.__scopeDenied = which;
    return e;
  }
  return {
    touches: touches,
    api: {
      getScriptTimeZone: function () { touches.getScriptTimeZone++; return 'Asia/Taipei'; },
      getActiveUser: function () { touches.getActiveUser++; throw denied('getActiveUser'); },
      getEffectiveUser: function () { touches.getEffectiveUser++; throw denied('getEffectiveUser'); }
    }
  };
}

var ADAPTER_FNS = ['prodSafetyBundle_', 'prodExpectedDbId_', 'prodSchemaError_', 'prodAssertDbTarget_',
  'prodMigrateAppendColumns_'];
var MIG_FNS = ['tgtR2ba2Required_', 'tgtR2ba2Str_', 'tgtR2ba2Snapshot_', 'TEMP_migrateFcTargetRulesHeader_',
  'TEMP_validateFcTargetRulesHeader_'];
var MIG_ENTRYPOINTS = ['TEMP_R2BA2_DRY_RUN_FcTargetRulesHeader', 'TEMP_R2BA2_EXECUTE_FcTargetRulesHeader',
  'TEMP_R2BA2_VALIDATE_FcTargetRulesHeader'];

/** A fresh context over the (optionally mutated) real sources, with a fresh Session trap. */
function build(opts) {
  opts = opts || {};
  var A = gs('29_production_safety_adapter.gs');
  var G14 = gs('14_fc_write_handlers.gs');
  var MIG = opts.migSource || migSrc();
  if (typeof opts.mutate === 'function') MIG = opts.mutate(MIG);
  // IN-MEMORY ONLY. The adapter is forbidden scope for this round's repository change; mutating a copy of
  // its source inside the vm is how a mutant proves the adapter's floor is load-bearing without touching it.
  if (typeof opts.mutateAdapter === 'function') A = opts.mutateAdapter(A);

  var pieces = [];
  ADAPTER_FNS.forEach(function (n) { pieces.push(extractFn(A, n)); });
  pieces.push(extractVar(G14, 'FC_TARGET_RULES_HEADERS_'));
  // The actor constant only exists in the FIXED file. Section H runs the pre-fix source, which has none.
  if (/var TEMP_R2BA2_MIGRATION_ACTOR_/.test(MIG)) {
    var actorVar = extractVar(MIG, 'TEMP_R2BA2_MIGRATION_ACTOR_');
    if (opts.actorOverride !== undefined) {
      actorVar = 'var TEMP_R2BA2_MIGRATION_ACTOR_ = ' + JSON.stringify(opts.actorOverride) + ';\n';
    }
    pieces.push(actorVar);
  }
  MIG_FNS.forEach(function (n) { pieces.push(extractFn(MIG, n)); });
  MIG_ENTRYPOINTS.forEach(function (n) { pieces.push(extractFn(MIG, n)); });

  var trap = makeSessionTrap();
  var logs = [];
  var ctx = {
    KMSAFE: require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-production-safety.js')),
    PRODUCTION_DB_SPREADSHEET_ID_: 'SS-DB',
    Logger: { log: function (m) { logs.push(String(m)); } },
    Utilities: { formatDate: function () { return '2026-09-18 12:00:00'; } },
    Session: trap.api,
    SpreadsheetApp: {
      getActiveSpreadsheet: function () { return ctx.__ss; },
      openById: function () { return ctx.__ss; }
    },
    __ss: null, console: console
  };
  vm.createContext(ctx);
  vm.runInContext(pieces.join('\n'), ctx, { filename: 'r2ba2-f1-sources.js' });
  ctx.__trap = trap;
  ctx.__logs = logs;
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
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 94 - n.length)).join('-')); }
function headerOf(ctx) { return ctx.__ss.__sheet('fc_target_rules').__values[0]; }
function writesOf(ctx) { return ctx.__ss.__sheet('fc_target_rules').__headerWrites; }

// =================================================================================================
section('A. THE ACTOR IS A REVIEWED CONSTANT IN THIS FILE, AND COMES FROM NOWHERE ELSE');
// =================================================================================================
var MIG_SRC = migSrc();

ok(/var TEMP_R2BA2_MIGRATION_ACTOR_ = '[^']+';/.test(MIG_SRC),
  'A1 the file declares one module-level actor constant with a non-empty literal value');
var declared = /var TEMP_R2BA2_MIGRATION_ACTOR_ = '([^']*)';/.exec(MIG_SRC)[1];
ok(declared.trim() !== '', 'A2 and it is not blank');
eq(declared, REVIEWED_ACTOR, 'A3 it is the reviewed value');

// It must never be reachable from outside. The proof is structural: only ONE assignment exists, it is a
// string literal, and nothing in the file reads a request, a payload or an argument for it.
eq((MIG_SRC.match(/TEMP_R2BA2_MIGRATION_ACTOR_\s*=/g) || []).length, 1,
  'A4 there is exactly ONE assignment to the constant — nothing can reassign it at runtime');
var MIG_CODE = codeOnly(MIG_SRC);
['payload', 'localStorage', 'e.parameter', 'request', 'query', 'body.actor', 'JSON.parse',
 'getActiveUser', 'getEffectiveUser'].forEach(function (src) {
  ok(MIG_CODE.indexOf(src) === -1,
    'A5 no CODE in the file mentions ' + src + ' — the actor has no path in from outside');
});
// ANTI-VACUITY for the stripper itself: it must not simply erase everything it is asked about.
ok(MIG_CODE.indexOf('TEMP_R2BA2_MIGRATION_ACTOR_') > -1,
  'A5b the stripper leaves real code intact — the constant is still visible to the scan');
ok(codeOnly('// getActiveUser\nvar x = 1;').indexOf('getActiveUser') === -1
  && codeOnly('// getActiveUser\nvar x = 1;').indexOf('var x') > -1,
  'A5c and it removes a commented-out mention while keeping the statement beside it');
ok(/actor: TEMP_R2BA2_MIGRATION_ACTOR_/.test(MIG_SRC),
  'A6 the DTO takes the constant directly, with no fallback expression to hide a second source');

// The repository's existing shape for exactly this situation — reused, not reinvented.
var DEMO = gs('TEMP_demo_shipping_shipment_map_seed_v2.gs');
ok(/var DEMO4A_ACTOR_ = '[^']+';/.test(DEMO),
  'A7 the repository already uses module-level fixed actor constants in USER-run TEMP files (DEMO4A_ACTOR_)');

// =================================================================================================
section('B. NO SESSION API IS CALLED — MEASURED BY TOUCH COUNT, NOT BY GREP');
// =================================================================================================
// §3.1 DRY_RUN
var c1 = build(); c1.__use(makeSs(db()));
var dry = c1.TEMP_R2BA2_DRY_RUN_FcTargetRulesHeader();
ok(/^DRY_RUN_OK/.test(dry.outcome), 'B1 DRY_RUN completes', dry.outcome);
eq(c1.__trap.touches.getActiveUser, 0, 'B2 §3.1/§3.4 DRY_RUN touched Session.getActiveUser 0 times');
eq(c1.__trap.touches.getEffectiveUser, 0, 'B3 §3.5 DRY_RUN touched Session.getEffectiveUser 0 times');

// §3.2 EXECUTE
var c2 = build(); c2.__use(makeSs(db()));
var exe = c2.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader();
ok(/^APPLIED_OK/.test(exe.outcome), 'B4 EXECUTE completes', exe.outcome);
eq(c2.__trap.touches.getActiveUser, 0, 'B5 §3.2/§3.4 EXECUTE touched Session.getActiveUser 0 times');
eq(c2.__trap.touches.getEffectiveUser, 0, 'B6 §3.5 EXECUTE touched Session.getEffectiveUser 0 times');

// §3.3 VALIDATE
var c3 = build(); c3.__use(makeSs(db(AFTER)));
var val = c3.TEMP_R2BA2_VALIDATE_FcTargetRulesHeader();
ok(/^CONTRACT_SATISFIED/.test(val.verdict), 'B7 VALIDATE completes', val.verdict);
eq(c3.__trap.touches.getActiveUser, 0, 'B8 §3.3/§3.4 VALIDATE touched Session.getActiveUser 0 times');
eq(c3.__trap.touches.getEffectiveUser, 0, 'B9 §3.5 VALIDATE touched Session.getEffectiveUser 0 times');

// ANTI-VACUITY. A trap that is never armed proves nothing, so prove the trap itself bites.
var armed = build();
var trapFired = null;
try { armed.Session.getActiveUser(); } catch (e) { trapFired = e; }
ok(trapFired !== null && trapFired.__scopeDenied === 'getActiveUser',
  'B10 the trap is real — touching getActiveUser throws the live permission error');
eq(armed.__trap.touches.getActiveUser, 1, 'B11 and the touch counter actually counts');

// No new OAuth scope was requested anywhere.
var APPSSCRIPT = (function () {
  var hits = [];
  ['appsscript.json', 'assets/specs/active/apps-script/appsscript.json'].forEach(function (p) {
    var full = path.join(REPO, p);
    if (fs.existsSync(full)) hits.push({ path: p, body: fs.readFileSync(full, 'utf8') });
  });
  return hits;
})();
APPSSCRIPT.forEach(function (f) {
  ok(f.body.indexOf('userinfo.email') === -1,
    'B12 ' + f.path + ' does not request userinfo.email');
});
ok(MIG_SRC.indexOf('oauthScopes') === -1 && MIG_SRC.indexOf('userinfo.email') === -1
  || /Required permission: https:\/\/www\.googleapis\.com\/auth\/userinfo\.email/.test(MIG_SRC),
  'B13 the only mention of userinfo.email in the migration file is the quoted failure it explains');

// =================================================================================================
section('C. THE ACTOR REACHES THE DTO AND THE EVIDENCE — §3.6');
// =================================================================================================
var c4 = build(); c4.__use(makeSs(db()));
var dryLogged = c4.TEMP_R2BA2_DRY_RUN_FcTargetRulesHeader();
eq(dryLogged.migrationActor, REVIEWED_ACTOR, 'C1 DRY_RUN evidence carries the actor');
ok(/reviewed module constant/.test(dryLogged.migrationActorSource),
  'C2 and names where it came from', dryLogged.migrationActorSource);
ok(c4.__logs.length > 0 && c4.__logs[0].indexOf(REVIEWED_ACTOR) > -1,
  'C3 the DRY_RUN Logger output contains the actor');

var c5 = build(); c5.__use(makeSs(db()));
var exeLogged = c5.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader();
eq(exeLogged.migrationActor, REVIEWED_ACTOR, 'C4 EXECUTE evidence carries the actor');
ok(c5.__logs.join('\n').indexOf(REVIEWED_ACTOR) > -1, 'C5 the EXECUTE Logger output contains the actor');

var c6 = build(); c6.__use(makeSs(db(AFTER)));
var valLogged = c6.TEMP_R2BA2_VALIDATE_FcTargetRulesHeader();
eq(valLogged.migrationActor, REVIEWED_ACTOR, 'C6 VALIDATE evidence carries the actor');
ok(c6.__logs.join('\n').indexOf(REVIEWED_ACTOR) > -1, 'C7 the VALIDATE Logger output contains the actor');

// The DTO itself. Observed by intercepting the adapter rather than by reading the source, so this is a
// statement about what the migration SENDS, not about what it appears to send.
var c7 = build(); c7.__use(makeSs(db()));
var seenDto = null;
var realAppend = c7.prodMigrateAppendColumns_;
c7.prodMigrateAppendColumns_ = function (sheet, names, auth) { seenDto = auth; return realAppend(sheet, names, auth); };
vm.runInContext('void 0;', c7);
c7.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader();
ok(seenDto !== null, 'C8 the migration reached the authorization adapter');
eq(seenDto && seenDto.actor, REVIEWED_ACTOR, 'C9 §3.6 the DTO actor is the reviewed constant');
eq(seenDto && seenDto.expectedOldHeaderHash, OLD_HASH, 'C10 §2 expectedOldHeaderHash is unchanged');
eq(seenDto && seenDto.expectedNewHeaderHash, NEW_HASH, 'C11 §2 expectedNewHeaderHash is unchanged');
eq(seenDto && seenDto.expectedSheetName, 'fc_target_rules', 'C12 §2 expectedSheetName is unchanged');
eq(seenDto && seenDto.expectedSpreadsheetId, 'SS-DB', 'C13 §2 expectedSpreadsheetId is the production target');
eq(seenDto && seenDto.migrationId, 'FC-SUMMARY-R2B-A2-R1-fc_target_rules-additive-header',
  'C14 §2 migrationId is unchanged');
ok(seenDto && String(seenDto.backupReference).indexOf('row1-verbatim-snapshot') === 0,
  'C15 §2 backupReference is unchanged');
eq(seenDto && seenDto.execute, true, 'C16 §2 execute is a real boolean true');
eq(c7.KMSAFE.MIGRATION_REQUIRED_FIELDS.filter(function (f) {
  return String(seenDto[f] === undefined ? '' : seenDto[f]).trim() === '' && f !== 'execute'; }), [],
  'C17 every required DTO field is present and non-blank');

// =================================================================================================
section('D. A BLANK ACTOR REFUSES BEFORE THE MUTATION — §3.7');
// =================================================================================================
var c8 = build({ actorOverride: '' }); c8.__use(makeSs(db()));
var blank = c8.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader();
ok(/^REFUSED_MIGRATION_ACTOR_MISSING/.test(blank.outcome),
  'D1 an empty actor constant refuses in the report shape', blank.outcome);
eq(blank.applied, false, 'D2 applied stays false');
eq(writesOf(c8).length, 0, 'D3 ZERO header writes — the refusal is before the mutation');
eq(headerOf(c8), LIVE_ROW1, 'D4 and the live header is untouched');
eq(c8.__trap.touches.getActiveUser, 0, 'D5 and it still reached for no Session identity');

var c9 = build({ actorOverride: '    ' }); c9.__use(makeSs(db()));
var ws = c9.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader();
ok(/^REFUSED_MIGRATION_ACTOR_MISSING/.test(ws.outcome), 'D6 a whitespace-only actor is blank too');
eq(writesOf(c9).length, 0, 'D7 and writes nothing');

// A DRY RUN is a read, so it does NOT refuse for a blank actor — it reports it. Refusing a read because
// the WRITE would be unauthorized would deny an operator the diagnosis they need to fix it.
var c10 = build({ actorOverride: '' }); c10.__use(makeSs(db()));
var dryBlank = c10.TEMP_R2BA2_DRY_RUN_FcTargetRulesHeader();
ok(/^DRY_RUN_OK/.test(dryBlank.outcome), 'D8 a DRY RUN still runs and still diagnoses', dryBlank.outcome);
eq(dryBlank.migrationActor, '', 'D9 and reports the actor as empty rather than hiding it');
eq(writesOf(c10).length, 0, 'D10 reading wrote nothing, as always');

// =================================================================================================
section('E. THE ADAPTER FLOOR HOLDS INDEPENDENTLY — §3.8');
// =================================================================================================
// Even if the helper's own guard were removed, an unauthorized DTO must not mutate. This calls the real
// adapter directly with a DTO the validator must reject, and measures the sheet afterwards.
var c11 = build();
var floorSs = makeSs(db()); c11.__use(floorSs);
var floorSheet = floorSs.__sheet('fc_target_rules');
var GOOD_DTO = { migrationId: 'M', expectedSpreadsheetId: 'SS-DB', expectedSheetName: 'fc_target_rules',
  expectedOldHeaderHash: OLD_HASH, expectedNewHeaderHash: NEW_HASH, backupReference: 'b', execute: true,
  actor: REVIEWED_ACTOR };
[['actor', ''], ['actor', null], ['actor', '   '], ['migrationId', ''], ['backupReference', '']].forEach(function (p) {
  var dto = {}; for (var k in GOOD_DTO) dto[k] = GOOD_DTO[k];
  dto[p[0]] = p[1];
  var threw = null;
  try { c11.prodMigrateAppendColumns_(floorSheet, EXPECTED_APPEND, dto); } catch (e) { threw = e; }
  ok(threw && threw.safetyToken === 'MIGRATION_AUTHORIZATION_REQUIRED',
    'E1 a DTO with ' + p[0] + ' = ' + JSON.stringify(p[1]) + ' is refused by the adapter',
    threw && threw.safetyToken);
});
eq(floorSheet.__headerWrites.length, 0, 'E2 and not one of those attempts wrote a header cell');
eq(floorSheet.__values[0], LIVE_ROW1, 'E3 the header is exactly as it started');
// ...and the same adapter DOES apply a well-formed DTO, so E1 is not passing for the wrong reason.
var appliedN = c11.prodMigrateAppendColumns_(floorSheet, EXPECTED_APPEND, GOOD_DTO);
eq(appliedN, 3, 'E4 a well-formed DTO appends three columns — the refusals above were about the DTO');
eq(floorSheet.__values[0], AFTER, 'E5 producing the reviewed header');

// =================================================================================================
section('F. THE CORRECTED EXECUTION — §3.10, §3.11, §3.12');
// =================================================================================================
var c12 = build(); c12.__use(makeSs(db()));
var run1 = c12.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader();
ok(/^APPLIED_OK/.test(run1.outcome), 'F1 §3.10 the corrected EXECUTE applies', run1.outcome);
eq(run1.applied, true, 'F2 applied = true');
eq(writesOf(c12).length, 1, 'F3 §3.10 exactly ONE header write occurred');
eq(writesOf(c12)[0].startCol, 29, 'F4 beginning at column 29 — strictly right of the live 28');
eq(writesOf(c12)[0].values, EXPECTED_APPEND, 'F5 writing only the three missing names');
eq(headerOf(c12), AFTER, 'F6 §2 the resulting header is the reviewed plan');
eq(headerOf(c12).length, 31, 'F7 31 columns');
eq(run1.postConditions.everyRequiredPresentExactlyOnce, true, 'F8 §2 post-condition: every required column once');
eq(run1.postConditions.noPreExistingHeaderMoved, true, 'F9 §2 post-condition: no pre-existing header moved');
eq(run1.postConditions.noDataRowFabricated, true, 'F10 §2 post-condition: no data row fabricated');
eq(run1.postConditions.hashMatchesPlan, true, 'F11 §2 post-condition: resulting hash matches the plan');
eq(c12.__ss.__sheet('fc_target_rules').__appended.length, 0, 'F12 no row was appended');
eq(c12.__ss.__sheet('fc_target_rules').__deleted.length, 0, 'F13 no row was deleted');
eq(c12.__ss.__sheet('fc_target_rules').__cellWrites.length, 0, 'F14 no data cell was written');

// §3.12 — the hashes are the reviewed ones, on the corrected file.
eq(run1.oldHeaderHash, OLD_HASH, 'F15 §3.12 oldHeaderHash is still ' + OLD_HASH);
eq(run1.newHeaderHash, NEW_HASH, 'F16 §3.12 newHeaderHash is still ' + NEW_HASH);
eq(run1.resultingColumnCount, 31, 'F17 §2 resultingColumnCount is still 31');
eq(run1.missingRequired, EXPECTED_APPEND, 'F18 §2 the missing set is still exactly the three');
eq(run1.actualColumnCount, 28, 'F19 §2 actualColumnCount is still 28');
eq(run1.dataRowCount, 0, 'F20 §2 dataRowCount is still 0');
eq(run1.duplicateHeaders, [], 'F21 §2 no duplicate headers');
eq(run1.blankHeaderIndexes, [], 'F22 §2 no blank headers');
// index placement, exactly as §2 froze it
var plan = {}; run1.columnPlan.forEach(function (p) { plan[p.column] = p.willSitAt; });
eq(plan.scope_type, 28, 'F23 §2 scope_type sits at index 28');
eq(plan.scope_id, 29, 'F24 §2 scope_id at 29');
eq(plan.target_percentage, 30, 'F25 §2 target_percentage at 30');
eq(plan.jan_pct, 9, 'F26 §2 jan_pct does not move');

// §3.11 — a second execution is a NO_OP
var run2 = c12.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader();
ok(/^NO_OP/.test(run2.outcome), 'F27 §3.11 a second EXECUTE is a NO_OP', run2.outcome);
eq(run2.applied, false, 'F28 and applies nothing');
eq(writesOf(c12).length, 1, 'F29 still exactly one header write in total');
eq(headerOf(c12), AFTER, 'F30 the header is unchanged — nothing duplicated');
eq(c12.__trap.touches.getActiveUser, 0, 'F31 across both runs, Session.getActiveUser was touched 0 times');

// The DRY RUN contract is unchanged by this fix — the live numbers still reproduce.
var c13 = build(); c13.__use(makeSs(db()));
var dry2 = c13.TEMP_R2BA2_DRY_RUN_FcTargetRulesHeader();
eq(dry2.oldHeaderHash, OLD_HASH, 'F32 DRY_RUN oldHeaderHash unchanged');
eq(dry2.newHeaderHash, NEW_HASH, 'F33 DRY_RUN newHeaderHash unchanged');
eq(dry2.resultingHeader, AFTER, 'F34 DRY_RUN resultingHeader unchanged');
eq(dry2.applied, false, 'F35 DRY_RUN applies nothing');
eq(writesOf(c13).length, 0, 'F36 DRY_RUN writes nothing');

// =================================================================================================
section('G. EVERY OTHER GATE STILL REFUSES — §2 says none of them may change');
// =================================================================================================
// The gates refuse in TWO shapes: this file's own guards return a report, and the shared safety adapter
// throws a typed token. Both are refusals and both must leave the sheet alone, so the helper records
// whichever happened rather than assuming one of them.
function refusalOf(tables, ssId) {
  var c = build(); c.__use(makeSs(tables, ssId));
  var r = null, threw = null;
  try { r = c.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader(); } catch (e) { threw = e; }
  return { outcome: r ? r.outcome : null, token: threw ? threw.safetyToken : null,
    threw: threw !== null, writes: writesOf(c).length, ctx: c };
}
var g1 = refusalOf({ fc_target_rules: [[]] });
ok(/^REFUSED_NO_HEADER_ROW/.test(g1.outcome), 'G1 an empty header row is still refused', g1.outcome);
eq(g1.writes, 0, 'G2 writing nothing');
var g3 = refusalOf(db(LIVE_ROW1.slice(0, 27).concat(['sku'])));
ok(/^REFUSED_AMBIGUOUS_HEADER/.test(g3.outcome), 'G3 a duplicate header is still refused', g3.outcome);
eq(g3.writes, 0, 'G4 writing nothing');
var g5 = refusalOf(db(LIVE_ROW1.slice(0, 5).concat(['']).concat(LIVE_ROW1.slice(6))));
ok(/^REFUSED_AMBIGUOUS_HEADER/.test(g5.outcome), 'G5 a blank header is still refused', g5.outcome);
eq(g5.writes, 0, 'G6 writing nothing');
var g7 = refusalOf(db(LIVE_ROW1, [LIVE_ROW1.map(function () { return 'x'; })]));
ok(/^REFUSED_UNEXPECTED_DATA_ROWS/.test(g7.outcome), 'G7 §2 the dataRowCount = 0 requirement still holds', g7.outcome);
eq(g7.writes, 0, 'G8 writing nothing');
var g9 = refusalOf(db(), 'SS-SOME-OTHER-BOOK');
ok(g9.token === 'WRONG_SPREADSHEET_TARGET',
  'G9 §2 the wrong spreadsheet is still refused by the production target gate', g9);
eq(g9.writes, 0, 'G9b and nothing was written to it');

// the re-read before mutation still exists and still refuses
var c14 = build(); c14.__use(makeSs(db()));
var realSnapshot = c14.tgtR2ba2Snapshot_;
var nth = 0;
vm.runInContext('void 0;', c14);
c14.tgtR2ba2Snapshot_ = function (sheet) {
  nth++;
  var s = realSnapshot(sheet);
  if (nth === 2) s.actual = s.actual.slice(0, 27);      // the header "moves" between snapshot and mutation
  return s;
};
// The extracted functions call the binding in the vm context, so re-run the migration body against the
// patched binding by re-evaluating the entrypoint's call through the context.
var movedOutcome = vm.runInContext('TEMP_migrateFcTargetRulesHeader_({ execute: true }).outcome', c14);
ok(/^REFUSED_HEADER_CHANGED_DURING_RUN/.test(movedOutcome),
  'G10 §2 the re-read immediately before mutation still refuses a header that moved', movedOutcome);
eq(writesOf(c14).length, 0, 'G11 and wrote nothing');

// =================================================================================================
section('H. THE EXECUTION THAT ACTUALLY FAILED WROTE NOTHING — §0 / §3.9');
// =================================================================================================
// The pre-fix source, recovered from the commit the live failure ran from, against the same trap. This is
// the claim FAILED_EXECUTE_HEADER_WRITES = 0 — established by running it, not by reading a screenshot.
var PRE_SRC = gsAt(PRE_FIX_SHA, MIG_REL);
ok(/actor: Session\.getActiveUser\(\)\.getEmail\(\)/.test(PRE_SRC),
  'H1 the pinned pre-fix source is the one that called Session.getActiveUser');

var h = build({ migSource: PRE_SRC });
var hSs = makeSs(db()); h.__use(hSs);
var hThrew = null;
try { h.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader(); } catch (e) { hThrew = e; }
ok(hThrew !== null, 'H2 the pre-fix EXECUTE throws, exactly as it did live');
ok(hThrew && hThrew.__scopeDenied === 'getActiveUser',
  'H3 and it throws on the missing userinfo.email scope', hThrew && hThrew.message);
eq(h.__trap.touches.getActiveUser, 1, 'H4 having touched Session.getActiveUser once');
eq(hSs.__sheet('fc_target_rules').__headerWrites.length, 0,
  'H5 §0/§3.9 FAILED_EXECUTE_HEADER_WRITES = 0 — the failed run wrote no header cell');
eq(hSs.__sheet('fc_target_rules').__values[0], LIVE_ROW1,
  'H6 the live header is byte-for-byte what it was before the failed run');
eq(hSs.__sheet('fc_target_rules').__appended.length, 0, 'H7 no row was appended by the failed run');
eq(hSs.__sheet('fc_target_rules').__deleted.length, 0, 'H8 no row was deleted by the failed run');
eq(hSs.__sheet('fc_target_rules').__cellWrites.length, 0, 'H9 no cell was written by the failed run');

// ORDERING, FROM THE SOURCE ITSELF. The throw is upstream of every mutating call, which is WHY H5 holds
// and would keep holding even if the trap were removed.
var preN = PRE_SRC.replace(/\r\n/g, '\n');
var iSession = preN.indexOf('Session.getActiveUser');
['prodMigrateAppendColumns_(sheet, missing, auth)', 'var confirm = tgtR2ba2Snapshot_(sheet);'].forEach(function (marker) {
  var at = preN.indexOf(marker);
  ok(at > iSession, 'H10 `' + marker.slice(0, 40) + '…` is AFTER the Session call, so it never ran');
});
ok(preN.indexOf('setValues') === -1 && preN.indexOf('setValue(') === -1,
  'H11 the migration file itself contains no setValue/setValues — the only mutation is inside the adapter');

// And the pre-fix DRY RUN was unaffected, which is why the live DRY RUN passed: it returns before the DTO.
var h2 = build({ migSource: PRE_SRC }); h2.__use(makeSs(db()));
var preDry = h2.TEMP_R2BA2_DRY_RUN_FcTargetRulesHeader();
ok(/^DRY_RUN_OK/.test(preDry.outcome), 'H12 the pre-fix DRY RUN succeeded — it returns before the DTO is built');
eq(h2.__trap.touches.getActiveUser, 0, 'H13 having never reached the Session call');
eq(preDry.oldHeaderHash, OLD_HASH, 'H14 and produced the same oldHeaderHash the live run reported');
eq(preDry.newHeaderHash, NEW_HASH, 'H15 and the same newHeaderHash');

// =================================================================================================
section('I. MUTANTS');
// =================================================================================================
var MUTANTS = [
  { id: 'M1', why: 'Session.getActiveUser is restored — the exact regression this round exists to prevent',
    mutate: function (src) {
      return swap(src, '    actor: TEMP_R2BA2_MIGRATION_ACTOR_\n',
        "    actor: Session.getActiveUser().getEmail() || 'fc-target-rules-migration'\n");
    },
    check: function () {
      var c = build({ mutate: MUTANTS[0].mutate });
      var ss = makeSs(db()); c.__use(ss);
      var threw = null;
      try { c.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader(); } catch (e) { threw = e; }
      // CAUGHT means: the touch counter observed it. That is the observation §3 asked for — and it also
      // still wrote nothing, which is the separate fact section H establishes.
      return c.__trap.touches.getActiveUser === 0 && threw === null;
    } },

  { id: 'M2', why: 'Session.getEffectiveUser is substituted instead — the plausible "fix" that fails the same way',
    mutate: function (src) {
      return swap(src, '    actor: TEMP_R2BA2_MIGRATION_ACTOR_\n',
        '    actor: Session.getEffectiveUser().getEmail()\n');
    },
    check: function () {
      var c = build({ mutate: MUTANTS[1].mutate });
      c.__use(makeSs(db()));
      var threw = null;
      try { c.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader(); } catch (e) { threw = e; }
      return c.__trap.touches.getEffectiveUser === 0 && threw === null;
    } },

  { id: 'M3', why: 'the actor constant is blanked and the guard removed — an unauthorized mutation proceeds',
    mutate: function (src) {
      var n = swap(src, "var TEMP_R2BA2_MIGRATION_ACTOR_ = 'vic.zhou@shopkitchenmama.com';",
        "var TEMP_R2BA2_MIGRATION_ACTOR_ = '';");
      return swap(n, "  if (tgtR2ba2Str_(TEMP_R2BA2_MIGRATION_ACTOR_) === '') {",
        '  if (false) {');
    },
    check: function () {
      var c = build({ mutate: MUTANTS[2].mutate });
      var ss = makeSs(db()); c.__use(ss);
      var threw = null;
      try { c.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader(); } catch (e) { threw = e; }
      // The adapter floor must still stop it. CAUGHT = it did, and nothing was written.
      return threw === null && ss.__sheet('fc_target_rules').__headerWrites.length > 0;
    } },

  { id: 'M4', why: 'the actor is taken from a caller argument — a value from outside this file reaches the DTO',
    mutate: function (src) {
      return swap(src, '    actor: TEMP_R2BA2_MIGRATION_ACTOR_\n',
        "    actor: (opts && opts.actor) || TEMP_R2BA2_MIGRATION_ACTOR_\n");
    },
    check: function () {
      var c = build({ mutate: MUTANTS[3].mutate });
      c.__use(makeSs(db()));
      var seen = null;
      var real = c.prodMigrateAppendColumns_;
      c.prodMigrateAppendColumns_ = function (sh, nm, auth) { seen = auth; return real(sh, nm, auth); };
      vm.runInContext('TEMP_migrateFcTargetRulesHeader_({ execute: true, actor: "someone-else@example.com" });', c);
      return seen && seen.actor === REVIEWED_ACTOR;      // must still be the constant
    } },

  { id: 'M5', why: 'the actor stops being reported, so the evidence no longer says who authorized the change',
    mutate: function (src) {
      return swap(src, '    migrationActor: tgtR2ba2Str_(TEMP_R2BA2_MIGRATION_ACTOR_),\n', '');
    },
    check: function () {
      var c = build({ mutate: MUTANTS[4].mutate });
      c.__use(makeSs(db()));
      var r = c.TEMP_R2BA2_DRY_RUN_FcTargetRulesHeader();
      return r.migrationActor === REVIEWED_ACTOR;
    } },

  // A BLANK ACTOR HAS TWO INDEPENDENT GUARDS, so it takes two mutants to test it honestly. This file's own
  // check is the first; validateMigrationAuthorization inside prodMigrateAppendColumns_ is the second, and
  // it throws before its setValues. Removing only the first changes no sheet at all — a real property, not
  // a test that failed to bite — so M6 asserts what the local guard actually buys: the operator gets a
  // REPORT in the Run log rather than a stack trace thrown past this helper.
  { id: 'M6', why: 'the local blank-actor guard is removed, so the refusal stops being this file\u0027s report',
    mutate: function (src) {
      return swap(src, "  if (tgtR2ba2Str_(TEMP_R2BA2_MIGRATION_ACTOR_) === '') {", '  if (false) {');
    },
    check: function () {
      var c = build({ mutate: MUTANTS[5].mutate, actorOverride: '' });
      var ss = makeSs(db()); c.__use(ss);
      var r = null, threw = null;
      try { r = c.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader(); } catch (e) { threw = e; }
      return threw === null && r !== null && /^REFUSED_MIGRATION_ACTOR_MISSING/.test(r.outcome)
        && ss.__sheet('fc_target_rules').__headerWrites.length === 0;
    } },

  { id: 'M7', why: 'BOTH blank-actor guards defeated — an unauthorized migration then really does write',
    mutate: function (src) {
      return swap(src, "  if (tgtR2ba2Str_(TEMP_R2BA2_MIGRATION_ACTOR_) === '') {", '  if (false) {');
    },
    mutateAdapter: function (src) {
      return swap(src, '  if (!auth.valid) throw prodSchemaError_(', '  if (false) throw prodSchemaError_(');
    },
    check: function () {
      var c = build({ mutate: MUTANTS[6].mutate, mutateAdapter: MUTANTS[6].mutateAdapter, actorOverride: '' });
      var ss = makeSs(db()); c.__use(ss);
      try { c.TEMP_R2BA2_EXECUTE_FcTargetRulesHeader(); } catch (e) { /* observed below */ }
      // CAUGHT when an unauthorized run managed to append. That is the floor proving it was load-bearing.
      return ss.__sheet('fc_target_rules').__headerWrites.length === 0;
    } }
];

var caught = 0, survived = [];
MUTANTS.forEach(function (m) {
  var stillCorrect;
  try { stillCorrect = m.check(); } catch (e) { stillCorrect = false; }
  // `check` returns TRUE when the correct behaviour still holds. A mutant is CAUGHT when it does not.
  if (stillCorrect === false) { caught++; console.log('ok   ' + m.id + '  ' + m.why + ' (caught)'); }
  else { survived.push(m.id); console.error('FAIL ' + m.id + '  SURVIVED — ' + m.why); }
});
ok(survived.length === 0, 'I1 every mutant was caught', survived);


// ================================================================================================
section('R. RETIREMENT — the helper is gone from the deployment, and still provable');
// ================================================================================================
// A one-shot writer that has already run is not an asset. It cannot be needed again (its second run
// is a documented NO_OP), it is unrouted so nothing calls it, and leaving it in the project keeps a
// direct header-mutating entrypoint one menu click away from a live sheet for no remaining benefit.
// What must survive is the PROOF, and the proof is the source — which is now sealed rather than live.

ok(!fs.existsSync(MIG_ACTIVE), 'R1  the active runtime helper is deleted from assets/specs/active/apps-script');
ok(fs.existsSync(MIG_FIXTURE), 'R2  its accepted source is frozen as a sealed fixture');
eq(require('crypto').createHash('sha256').update(fs.readFileSync(MIG_FIXTURE)).digest('hex'), MIG_SEAL,
  'R3  and the fixture is byte-for-byte the source that ran — the seal is the whole point of keeping it');

// The fixture must be the bytes git recorded for the active file at the commit before it was removed.
// Sealing a hash of whatever happens to be on disk would prove only that the file has not changed
// since I copied it; this ties it to history.
(function () {
  // The last commit that TOUCHED this path is the one that DELETED it, so the bytes live in its
  // parent. Written before the retirement was committed, this looked for them in the deletion commit
  // itself and passed against a working tree where the file was merely staged — the difference between
  // the tree and the commit, which is exactly what a sealed-history assertion must not be confused by.
  //
  // `~1` and not `^`: execSync goes through cmd.exe on Windows, where the caret is the ESCAPE
  // character, so `<sha>^:path` arrives at git as `<sha>:path` — the very commit that has no file.
  var last = cp.execSync('git log -n 1 --format=%H -- ' + JSON.stringify(MIG_REL), { cwd: REPO, encoding: 'utf8' }).trim();
  var hist = null, at = '';
  [last, last + '~1'].forEach(function (rev) {
    if (hist) return;
    try { hist = cp.execSync('git show ' + rev + ':' + MIG_REL, { cwd: REPO, encoding: 'buffer', maxBuffer: 1 << 26 }); at = rev; }
    catch (e) { /* not present at this revision */ }
  });
  ok(hist !== null, 'R4  git still carries the historical source, at the deletion commit or its parent', at || last);
  if (hist) {
    eq(require('crypto').createHash('sha256').update(hist).digest('hex'), MIG_SEAL,
      'R4a and the sealed fixture matches those committed bytes exactly');
  }
})();

// Nothing that is still deployed may expose the three Run functions. This reads every active .gs,
// not a list of them, so a copy of the helper under another name would be caught too.
(function () {
  var live = fs.readdirSync(ASD).filter(function (f) { return /\.gs$/.test(f); });
  var exposing = live.filter(function (f) {
    var src = fs.readFileSync(path.join(ASD, f), 'utf8');
    return MIG_ENTRYPOINTS.some(function (e) { return new RegExp('function\\s+' + e + '\\s*\\(').test(src); });
  });
  eq(exposing, [], 'R5  no active Apps Script file declares any migration entrypoint', exposing);
  ok(live.length > 0, 'R5a and the scan actually read the active sources', live.length + ' .gs files');
})();

// The entrypoints were never routed, and must not become routed by accident later.
(function () {
  var router = fs.readFileSync(path.join(ASD, '01_router.gs'), 'utf8');
  var routed = MIG_ENTRYPOINTS.filter(function (e) { return router.indexOf(e) !== -1; });
  eq(routed, [], 'R6  and the router exposes none of them', routed);
})();

console.log('\n' + new Array(101).join('=') );
console.log('FC TARGET RULES MIGRATION ACTOR (R2B-A2-R1-F1) — passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + caught + '  survived ' + survived.length);
console.log(new Array(101).join('=') );
process.exit(fail || survived.length ? 1 : 0);
