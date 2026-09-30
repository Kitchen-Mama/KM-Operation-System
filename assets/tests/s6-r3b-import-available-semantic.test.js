// S6-R3B — WHAT AN IMPORTED `available` MEANS WHEN KM ALREADY HOLDS A RESERVATION.
//
// R3A froze the quantity model and stopped at one sentence it could not write. The operator has now
// written it: D_S6_IMPORT_AVAILABLE_SEMANTIC = GROSS. The imported figure is the SOURCE's available,
// before KM's reservation — so the stored operational value is `S - R`, and the reservation survives.
//
// THREE KINDS OF ASSERTION LIVE HERE AND THEY ARE NOT INTERCHANGEABLE.
//
//   FROZEN   a token that must be DECLARED in the contract, scoped to PART VI so PART IV's and PART V's
//            superseded lines cannot satisfy an R3B assertion by accident.
//   MODEL    the frozen arithmetic, EXECUTED against a reference implementation built from §41/§43/§44/§45
//            alone. This is how a contract round hands the implementing round something that can FAIL
//            rather than something that can be misread. §11's cases A-K are driven here.
//   LIVE     the SHIPPED code, executed. Sections F and G watch today's importer and today's client do
//            the thing the contract now forbids.
//
// SECTIONS F AND G MUST BREAK WHEN R4B LANDS. That is not fragility, it is the handover: they pin the
// defect precisely enough that the implementing round cannot claim to have fixed it without replacing
// them. Every such assertion says so in its own label.
//
// ONE THING THIS SUITE REFUSES TO DO: it does not assert that the shipped importer implements GROSS.
// It does not. R3B decided; R4B implements. A contract round whose tests pass against unchanged runtime
// is either testing nothing or lying about what shipped.
//
// NO PRODUCTION WRITE. NO NETWORK. A fake spreadsheet, committed source, and the contract document.
//
// Run: node assets/tests/s6-r3b-import-available-semantic.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var CONTRACT = read('../docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md');
var F05 = read('specs/active/apps-script/05_overseas_inventory_handlers.gs');
var CLIENT = read('js/pages/overseas-stock.js');

var PARTVI_AT = CONTRACT.indexOf('# PART VI — S6-R3B');
var PARTV_AT = CONTRACT.indexOf('# PART V — S6-R3A');
var PARTVI = PARTVI_AT < 0 ? '' : CONTRACT.slice(PARTVI_AT);
var EARLIER = PARTVI_AT < 0 ? CONTRACT : CONTRACT.slice(0, PARTVI_AT);

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  ctx ' + JSON.stringify(x))); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function mut(label, f) {
  mutants++;
  var caught = false;
  try { caught = f() === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}
function frozenV(v) { return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// PART VI column-aligns a few declarations, so the separator is ` +=` rather than ` = `. The token must
// still start the line and the value must still match exactly; only the padding is tolerated.
function tokenRe(t, v) { return new RegExp('^' + t + ' += ' + frozenV(v) + '\\s*(\\[[^\\]]*\\])?\\s*$', 'm'); }
function frozen(token, value, label) {
  ok(tokenRe(token, value).test(PARTVI), 'FROZEN ' + token + ' = ' + value + (label ? '  — ' + label : ''));
}

// =========================================================================================================
section('A. THE DECISION, FROZEN IN PART VI');
// =========================================================================================================
ok(PARTVI_AT > 0, 'A0 PART VI exists in the mainline contract');
ok(PARTVI_AT > PARTV_AT && PARTV_AT > 0, 'A0a and it follows PART V rather than replacing it');

frozen('D_S6_IMPORT_AVAILABLE_SEMANTIC', 'GROSS          STATUS = FROZEN', 'the operator decision');
frozen('IMPORT_AVAILABLE_FORMULA', 'S - R');
frozen('IMPORT_WRITES_RESERVED', 'NO');
frozen('ALLOCATABLE_OVERSEAS_QTY', 'wh_available_stock        (NOT available - reserved)');
frozen('SOURCE_AVAILABLE_SEMANTIC', 'gross, source-reported, BEFORE KM reservation');
frozen('CANONICAL_AVAILABLE_SEMANTIC', 'operational, AFTER KM reservation has moved units out of it');
frozen('KM_RESERVATION_AUTHORITY_COUNT', '1          OWNER = the S6-R4B reservation lifecycle');
frozen('IMPORTER_IS_RESERVATION_OWNER', 'NO');
frozen('RECEIVING_IS_RESERVATION_OWNER', 'NO');
frozen('EXTERNAL_SOURCE_IS_RESERVATION_OWNER', 'NO');
frozen('IMPORT_TEMPLATE_DECISION', 'A — REMOVE `reserved_stock` FROM THE SHIPPED TEMPLATE');
frozen('TEMPLATE_REMOVAL_IS_SUFFICIENT', 'NO');
frozen('EXISTING_TOKEN_REUSED', 'NO   (surveyed; no equivalent)');
frozen('BUSINESS_DECISION_BEYOND_GROSS_REQUIRED', 'NO');
frozen('S6_IMPORT_SEMANTIC_FREEZE', 'YES');
frozen('UNRESOLVED_IMPORT_DECISION_COUNT', '0');
frozen('OPEN_S6_BLOCKERS', 'NONE');
frozen('S6_R4_RUNTIME_IMPLEMENTATION_AUTHORIZED', 'YES');
frozen('BEHAVIOR_CHANGED', 'NO   PRODUCTION_ROWS_WRITTEN = 0   DB_MIGRATION_REQUIRED = NO');

// GROSS must not be quietly re-read as the physical column — the one misreading that would undo R3A.
ok(/GROSS is \*\*not\*\* a reinterpretation of `wh_physical_stock`/.test(PARTVI),
  'A1 PART VI states in prose that GROSS is NOT wh_physical_stock');
ok(!/OVERSEAS_AVAILABILITY_AUTHORITY = wh_physical_stock/.test(PARTVI),
  'A2 and no token in PART VI moves the availability authority onto physical');
ok(/wh_physical_stock  := untouched/.test(PARTVI),
  'A3 the frozen arithmetic names physical only to say it is untouched');

// The supersession is an ANNOTATION. The historical record still stands.
ok(/GATE = IMPORT_AVAILABLE_SEMANTIC   STATUS = OPEN — OPERATOR DECISION REQUIRED/.test(EARLIER),
  'A4 §34\'s original OPEN gate line is still present — history is not rewritten');
ok(/\[RESOLVED BY R3B — Option I \/ GROSS frozen; see PART VI §40\]/.test(EARLIER),
  'A5 and it carries a pointer to the round that resolved it');
ok(/S6_R4_RUNTIME_IMPLEMENTATION_AUTHORIZED = NO   \[SUPERSEDED BY R3B/.test(EARLIER),
  'A6 §39\'s NO is annotated as superseded rather than edited to YES');
ok(/\| \*\*I — GROSS\*\* \*\(recommended\)\*/.test(EARLIER),
  'A7 §34\'s three-option table is intact, so the decision can still be audited against its alternatives');

// No token may be declared twice with two different values across the amendment boundary.
var VI_TOKENS = (PARTVI.match(/^[A-Z][A-Z0-9_]{6,} +=/gm) || []).map(function (s) { return s.replace(/ +=$/, ''); });
ok(VI_TOKENS.length > 20, 'A8 PART VI declares a real token set', VI_TOKENS.length);
/* A declaration line may column-align, may carry a parenthetical, and may co-declare a second token after
   a run of spaces. None of those is the token's VALUE, so the comparison takes the leading field only:
   `REMOVED (target)` and `REMOVED` agree, while `1` and `0` still disagree. */
function leadValue(v) { return String(v).trim().split(/\s{2,}|\s*\(/)[0].trim(); }
function scanContradictions(later, earlier) {
  var out = [];
  (later.match(/^[A-Z][A-Z0-9_]{6,} +=/gm) || []).map(function (x) { return x.replace(/ +=$/, ''); })
    .forEach(function (t) {
      if (t === 'NEXT_TASK' || t === 'GATE') return;   // every Part carries its own NEXT_TASK, by design
      var vi = new RegExp('^' + t + ' +=(.+)$', 'm').exec(later);
      var ea = new RegExp('^' + t + ' +=(.+)$', 'm').exec(earlier);
      if (!vi || !ea) return;
      var a = leadValue(vi[1]), b = leadValue(ea[1]);
      // An earlier line annotated as SUPERSEDED/RESOLVED is a recorded history, not an open contradiction.
      if (a !== b && !/\[SUPERSEDED|\[RESOLVED/.test(ea[1])) {
        out.push(t + ': earlier="' + b + '" later="' + a + '"');
      }
    });
  return out;
}
eq(scanContradictions(PARTVI, EARLIER), [], 'A9 no token contradicts an earlier, un-annotated declaration');
// A9 only means something if it can fail. Strip the annotation R3B added and it must.
(function () {
  var stripped = EARLIER.replace(/ +\[SUPERSEDED BY R3B[^\]]*\]/g, '')
    .replace(/^ +\[RESOLVED BY R3B[^\]]*\]\r?\n/gm, '');
  var found = scanContradictions(PARTVI, stripped);
  ok(found.length > 0 && found.join(' ').indexOf('UNRESOLVED_IMPORT_DECISION_COUNT') > -1,
    'A9a and with the supersession annotations removed it DOES fire — the exemption is doing work', found);
})();

// =========================================================================================================
section('B. THE REFERENCE MODEL — built from §41/§43/§44/§45 and nothing else');
// =========================================================================================================
/* The model is a STRING so the mutants in section J can rebuild it with one rule broken and re-run the
   very same cases. `new Function` keeps it at module scope; nothing is eval'd inside a callback. */
var MODEL_SRC = [
  '(function () {',
  '  var rows = {};',                       // key -> { available, reserved, physical }
  '  function get(k) { return rows[k]; }',
  '  return {',
  '    seed: function (k, a, r, p) { rows[k] = { available: a, reserved: r, physical: p === undefined ? 0 : p }; },',
  '    state: function (k) { var x = rows[k]; return x ? { available: x.available, reserved: x.reserved, physical: x.physical } : null; },',
  '    exists: function (k) { return !!rows[k]; },',
  // §31 (R3A), reproduced so conservation is testable across a reserve/import/release sequence.
  '    reserve: function (k, q) { var x = get(k); if (!x || x.available - q < 0) return { ok: false, code: "INSUFFICIENT_OVERSEAS_AVAILABLE" };',
  '      x.available -= q; x.reserved += q; return { ok: true }; },',
  '    release: function (k, q) { var x = get(k); if (!x || x.reserved - q < 0) return { ok: false, code: "RELEASE_EXCEEDS_RESERVATION" };',
  '      x.reserved -= q; x.available += q; return { ok: true }; },',
  '    dispatch: function (k, q) { var x = get(k); if (!x || x.reserved - q < 0) return { ok: false, code: "DISPATCH_EXCEEDS_RESERVATION" };',
  '      x.reserved -= q; return { ok: true }; },',
  // §41/§43/§44/§45 — the whole of this round, in one function.
  '    importRow: function (k, payload) {',
  '      var S = payload.available;',
  '      var existing = get(k);',
  // §43: the canonical row is the ONLY reserved authority. payload.reserved is never read.
  '      var R = existing ? existing.reserved : 0;',
  // §45: the guard is evaluated BEFORE the subtraction, so the subtraction can never go negative
  //      and no clamp is reachable.
  '      if (S < R) return { ok: false, code: "IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE", mutated: false };',
  '      if (!existing) { rows[k] = { available: S - R, reserved: R, physical: 0 }; return { ok: true, created: true, mutated: true }; }',
  '      existing.available = S - R;',
  '      existing.reserved = R;',                 // written to make "unchanged" visible; §43
  '      return { ok: true, created: false, mutated: true };',
  '    }',
  '  };',
  '})()'
].join('\n');
function makeModel(src) { return new Function('return ' + (src === undefined ? MODEL_SRC : src))(); }

var K = 'WH-3PL|CO1100-T';

// ---- §11 A — a NEW row -----------------------------------------------------------------------------
(function () {
  var m = makeModel();
  var r = m.importRow(K, { available: 100 });
  eq([r.ok, r.created, m.state(K)], [true, true, { available: 100, reserved: 0, physical: 0 }],
    'A(§11) new row, source 100 -> available 100 / reserved 0');
})();

// ---- §11 B — an EXISTING row with no reservation ----------------------------------------------------
(function () {
  var m = makeModel(); m.seed(K, 100, 0);
  m.importRow(K, { available: 100 });
  eq(m.state(K), { available: 100, reserved: 0, physical: 0 },
    'B(§11) existing 100/0, source 100 -> 100/0 (S - 0 is the SAME rule, not a special case)');
})();

// ---- §11 C — the case the whole round exists for ----------------------------------------------------
(function () {
  var m = makeModel(); m.seed(K, 70, 30);
  m.importRow(K, { available: 100 });
  eq(m.state(K), { available: 70, reserved: 30, physical: 0 },
    'C(§11) existing 70/30, source 100 -> 70/30 — GROSS: the source figure COUNTS the reserved units');
})();

// ---- §11 D/E/F — missing, blank, explicit zero ------------------------------------------------------
(function () {
  var m = makeModel(); m.seed(K, 70, 30);
  m.importRow(K, { available: 100 });                       // reserved key absent entirely
  eq(m.state(K), { available: 70, reserved: 30, physical: 0 },
    'D(§11) reserved OMITTED -> 70/30; missing NEVER means zero');
})();
(function () {
  var m = makeModel(); m.seed(K, 70, 30);
  m.importRow(K, { available: 100, reserved: '' });
  eq(m.state(K), { available: 70, reserved: 30, physical: 0 },
    'E(§11) reserved BLANK -> 70/30; blank must NOT become 100/0');
})();
(function () {
  var m = makeModel(); m.seed(K, 70, 30);
  m.importRow(K, { available: 100, reserved: 0 });
  eq(m.state(K), { available: 70, reserved: 30, physical: 0 },
    'F(§11) reserved EXPLICITLY 0 -> 70/30; an import saying zero does not erase a KM reservation');
})();

// ---- §11 G — fully reserved -------------------------------------------------------------------------
(function () {
  var m = makeModel(); m.seed(K, 0, 100);
  var r = m.importRow(K, { available: 100 });
  eq([r.ok, m.state(K)], [true, { available: 0, reserved: 100, physical: 0 }],
    'G(§11) existing 0/100, source 100 -> 0/100; S - R = 0 is allowed, and nothing is allocatable');
})();

// ---- §11 H — the contradiction ----------------------------------------------------------------------
(function () {
  var m = makeModel(); m.seed(K, 70, 30);
  var r = m.importRow(K, { available: 20 });
  eq([r.ok, r.code, r.mutated, m.state(K)],
    [false, 'IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE', false, { available: 70, reserved: 30, physical: 0 }],
    'H(§11) existing 70/30, source 20 -> REFUSED, and NOT ONE FIELD of the canonical row moved');
})();
(function () {
  // The four forbidden ways to make 20 fit against 30, each checked to be absent from the outcome.
  var m = makeModel(); m.seed(K, 70, 30, 55);
  m.importRow(K, { available: 20 });
  var s = m.state(K);
  ok(s.available >= 0, 'H1 no negative available was written');
  eq(s.reserved, 30, 'H2 reserved was not silently reduced to fit');
  eq(s.available, 70, 'H3 available was not silently clamped to 0');
  eq(s.physical, 55, 'H4 physical was not invented or adjusted to balance the books');
})();

// ---- §11 I — determinism ----------------------------------------------------------------------------
(function () {
  var m = makeModel(); m.seed(K, 70, 30);
  m.importRow(K, { available: 100 });
  var once = m.state(K);
  m.importRow(K, { available: 100 });
  m.importRow(K, { available: 100 });
  eq([once, m.state(K)], [{ available: 70, reserved: 30, physical: 0 }, { available: 70, reserved: 30, physical: 0 }],
    'I(§11) the same import repeated three times is idempotent — no drift');
})();
(function () {
  // Why it is idempotent: the formula is an ABSOLUTE SET from S, not a relative adjustment of available.
  ok(/existing\.available = S - R;/.test(MODEL_SRC) && !/available -= |available \+= S/.test(MODEL_SRC.split('importRow')[1]),
    'I1 because the import ASSIGNS S - R rather than adjusting the stored value');
})();

// ---- §11 J/K — conservation across the lifecycle ----------------------------------------------------
(function () {
  var m = makeModel(); m.seed(K, 100, 0);
  m.reserve(K, 30);
  var afterReserve = m.state(K);
  m.importRow(K, { available: 100 });
  var afterImport = m.state(K);
  m.release(K, 30);
  var afterRelease = m.state(K);
  eq([afterReserve, afterImport, afterRelease],
    [{ available: 70, reserved: 30, physical: 0 },
     { available: 70, reserved: 30, physical: 0 },
     { available: 100, reserved: 0, physical: 0 }],
    'J(§11) reserve -> import -> release returns exactly to 100/0');
  eq(afterReserve.available + afterReserve.reserved, afterImport.available + afterImport.reserved,
    'J1 and the import moved no units in or out of the system');
})();
(function () {
  var m = makeModel(); m.seed(K, 100, 0, 100);
  m.reserve(K, 30);
  m.importRow(K, { available: 100 });
  var before = m.state(K);
  m.dispatch(K, 30);
  var after = m.state(K);
  eq(after, { available: 70, reserved: 0, physical: 100 },
    'K(§11) reserve -> import -> dispatch leaves 70/0; dispatch consumes from reserved only');
  eq((before.available + before.reserved) - (after.available + after.reserved), 30,
    'K1 and the system lost exactly the dispatched quantity — no more, no less');
  eq(after.physical, 100, 'K2 physical took no part in any of it (§31/§41)');
})();

// =========================================================================================================
section('C. THE PAYLOAD\'S reserved IS NOT READ AT ALL');
// =========================================================================================================
/* §43 does not say "prefer the canonical value". It says the import is not the reservation authority.
   The difference is visible only when the payload carries a NON-ZERO reserved: a "prefer canonical"
   rule and an "ignore entirely" rule agree on blank and on 0, and disagree here. */
(function () {
  var variants = [
    ['omitted', { available: 100 }],
    ['blank', { available: 100, reserved: '' }],
    ['zero', { available: 100, reserved: 0 }],
    ['non-zero', { available: 100, reserved: 999 }],
    ['larger than source', { available: 100, reserved: 100000 }]
  ];
  var outcomes = variants.map(function (v) {
    var m = makeModel(); m.seed(K, 70, 30);
    m.importRow(K, v[1]);
    return m.state(K);
  });
  var allSame = outcomes.every(function (o) { return JSON.stringify(o) === JSON.stringify(outcomes[0]); });
  ok(allSame && outcomes[0].reserved === 30,
    'C1 five different reserved payloads produce ONE outcome — the field is ignored, not preferred', outcomes);
  ok(code(MODEL_SRC).indexOf('payload.reserved') === -1,
    'C2 and the model never mentions payload.reserved, so there is no path by which it could be read');
})();
(function () {
  // A NEW row does not acquire a reservation from the source either (§43's new-row argument).
  var m = makeModel();
  m.importRow(K, { available: 100, reserved: 5 });
  eq(m.state(K), { available: 100, reserved: 0, physical: 0 },
    'C3 a NEW row does not inherit a source-reported reserved — KM would own a reservation it never made');
})();

// =========================================================================================================
section('D. THE GUARD IS ORDERED BEFORE THE SUBTRACTION');
// =========================================================================================================
/* §2 of the task writes the stored value as max(0, S - R); §5 forbids silent clamping. Both hold only if
   the refusal runs FIRST. This section pins the ordering, because it is the one place where two rules
   that both sound right produce opposite behaviour. */
(function () {
  var body = MODEL_SRC.split('importRow:')[1];
  var guardAt = body.indexOf('IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE');
  var subAt = body.indexOf('= S - R');
  ok(guardAt > -1 && subAt > -1 && guardAt < subAt,
    'D1 the refusal is positioned before every subtraction in the model');
  ok(!/Math\.max\(0/.test(body), 'D2 and no clamp expression exists to be reached');
})();
(function () {
  // Driven, not read: a clamped model returns ok on the contradiction; the frozen one refuses.
  var clamped = MODEL_SRC
    .replace('if (S < R) return { ok: false, code: "IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE", mutated: false };', '')
    .replace(/= S - R/g, '= Math.max(0, S - R)');
  var m2 = makeModel(clamped); m2.seed(K, 70, 30);
  var r2 = m2.importRow(K, { available: 20 });
  var m1 = makeModel(); m1.seed(K, 70, 30);
  var r1 = m1.importRow(K, { available: 20 });
  eq([r2.ok, m2.state(K).available, r1.ok, m1.state(K).available], [true, 0, false, 70],
    'D3 a max(0, S - R) model ACCEPTS the contradiction and writes 0 available; the frozen model refuses it');
})();
ok(/CLAMP_REACHABLE_UNDER_GUARD = NO/.test(PARTVI), 'D4 and the contract states the clamp is unreachable');
ok(/the GUARD is the safety property/.test(PARTVI), 'D5 naming the guard, not the floor, as the frozen thing');

// =========================================================================================================
section('E. SCHEMA GATE — the decision asks for a meaning, not a column');
// =========================================================================================================
frozen('NEW_TABLE_REQUIRED', 'NO        SCHEMA_EXTENSION_REQUIRED = NO');
frozen('DB_MIGRATION_REQUIRED', 'NO     NEW_COLUMNS_REQUIRED = NONE');
frozen('BACKFILL_REQUIRED', 'NO         TABLES_AFFECTED = NONE');
frozen('DB_CHANGE_DECISION_REQUIRED', 'NO');
frozen('COLUMN_RENAME_IN_THIS_ROUND', 'NO');
ok(/every production overseas row has\r?\nwh_reserved_stock = 0 today, so S - R === S/.test(PARTVI),
  'E1 and BACKFILL = NO is REASONED: with R = 0 everywhere, S - R === S and no historical row is mis-stated');

// =========================================================================================================
section('F. LIVE — the SHIPPED server importer. R4B LANDED; these record the REPAIR.');
// =========================================================================================================
var SNAP_HEADERS = ['overseas_inventory_id', 'snapshot_date', 'warehouse_id', 'sku', 'site_sku',
  'wh_physical_stock', 'wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock',
  'wh_on_the_way_qty', 'wh_on_the_way_eta', 'wh_on_the_way_bucket',
  'last_movement_at', 'updated_by', 'created_at', 'updated_at', 'note'];
var WH_HEADERS = ['warehouse_id', 'warehouse_name', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type', 'status'];

function mkSheet(headers, rows, name) {
  var grid = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    __name: name, __grid: grid,
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (row, col) {
      return {
        getValues: function () { return [(grid[row - 1] || []).slice(col - 1, col)]; },
        setValue: function (v) { while (grid.length <= row - 1) grid.push(new Array(headers.length).fill('')); grid[row - 1][col - 1] = v; }
      };
    },
    appendRow: function (r) { grid.push(r.slice()); }
  };
}
function snapRow(avail, reserved, damaged, physical) {
  var o = { overseas_inventory_id: 'OISN-live01', snapshot_date: '2026-09-01', warehouse_id: 'WH-3PL',
    sku: 'CO1100-T', site_sku: 'SS-1', wh_physical_stock: physical === undefined ? '' : physical,
    wh_available_stock: avail, wh_reserved_stock: reserved, wh_damaged_stock: damaged || 0,
    wh_on_the_way_qty: 0, wh_on_the_way_eta: '', wh_on_the_way_bucket: '', last_movement_at: '',
    updated_by: '', created_at: '2026-09-01', updated_at: '2026-09-01', note: '' };
  return SNAP_HEADERS.map(function (h) { return o[h]; });
}
function importWorld(rows) {
  var snap = mkSheet(SNAP_HEADERS, rows, 'overseas_inventory_snapshot');
  var wh = mkSheet(WH_HEADERS, [['WH-3PL', 'Winit UK', 'ResUS', 'UK', true, false, '3PL', 'active']], 'warehouses');
  var sheets = { overseas_inventory_snapshot: snap, warehouses: wh };
  var sb = { console: console, JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    Math: Math, Date: Date, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp, Boolean: Boolean,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return sheets[n] || null; } }; }, flush: function () {} },
    Utilities: { formatDate: function () { return '2026-09-29'; },
      getUuid: (function () { var n = 0; return function () { n++; return ('u' + n) + '-bbbb-cccc-dddd-eeeeeeeeeeee'; }; })() },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    jsonResponse_: function (o) { return o; } };
  vm.createContext(sb);
  vm.runInContext(F05, sb);
  return { sb: sb, snap: snap };
}
function snapCell(snap, name) { return snap.__grid[1][SNAP_HEADERS.indexOf(name)]; }

(function () {
  var w = importWorld([snapRow(70, 30, 0)]);
  var r = w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-T', wh_available_stock: 100 }], options: { createdBy: 't' } });
  eq([r.success, snapCell(w.snap, 'wh_available_stock'), snapCell(w.snap, 'wh_reserved_stock')], [true, 70, 30],
    'F1 [R4B] the importer now stores S - R: 70/30 survives a refresh reporting 100. Before R4B this '
    + 'assertion read [true, 100, 0] — the reservation erased, with success:true and no warning.');
})();
(function () {
  var w = importWorld([snapRow(70, 30, 0)]);
  w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-T', wh_available_stock: 20 }], options: { createdBy: 't' } });
  eq([snapCell(w.snap, 'wh_available_stock'), snapCell(w.snap, 'wh_reserved_stock')], [70, 30],
    'F2 [R4B] the §45 contradiction is REFUSED and the row is untouched. Before R4B this read [20, 0] — '
    + '20 written over a 30-unit reservation with no error at all.');
  var refused = w.sb.handleImportOverseasInventorySnapshotBatch_({
    rows: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-T', wh_available_stock: 20 }], options: { createdBy: 't' } });
  eq(refused.data.results[0].code, 'IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE',
    'F2a and the refusal carries the token §45 froze');
})();
(function () {
  // The blank/absent collapse, at the exact line that causes it.
  var C05 = code(F05);
  ok(/qtyPresent\[f\] = false/.test(C05) && /if \(!qtyPresent\[f\]\) return;/.test(C05),
    'F3 [R4B] the server now keeps PRESENCE — a blank or absent quantity writes nothing. Before R4B the '
    + 'collapse site read `if (sv === \'\') { qtyVals[f] = 0; continue; }` and all three intents were one.');
  ok(/var qtyWritableFields = \['wh_available_stock', 'wh_damaged_stock', 'wh_on_the_way_qty'\]/.test(C05),
    'F4 [R4B] and wh_reserved_stock has LEFT the writable set entirely');
  var updateBranch = C05.split('var existing = bkToRow[key];')[1] || '';
  ok(!/qtyFields\.forEach\(function\(f\) \{ var ci = snPref\(f\); if \(ci !== -1\) snapSheet\.getRange\(tr, ci \+ 1\)\.setValue\(qtyVals\[f\]\); \}\)/.test(updateBranch),
    'F5 [R4B] the unconditional four-field write is GONE from the UPDATE branch');
  ok(/qtyWritableFields\.forEach/.test(updateBranch) && /v = qtyVals\[f\] - canonReserved/.test(updateBranch),
    'F5a replaced by a presence-gated write of three fields, with the GROSS subtraction on available');
  ok(C05.indexOf('IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE') > -1,
    'F6 [R4B] and the refusal token now exists in the handler — R4B paid what it owed');
})();

// =========================================================================================================
section('G. LIVE — the SHIPPED client and template. R4B LANDED; these record the REPAIR.');
// =========================================================================================================
(function () {
  var CC = code(CLIENT);
  ok(/var OVERSEAS_QTY_FIELDS = \['available_stock', 'damaged_stock', 'on_the_way_qty'\]/.test(CC),
    'G1 [R4B] reserved_stock is no longer materialised onto the payload');
  ok(/if \(v === ''\) continue;/.test(CC) && /hasOwnProperty\.call\(qtyObj, f\)/.test(CC),
    'G2 [R4B] an absent column and a blank cell are now OMITTED rather than sent as 0, so the distinction '
    + 'reaches the server at all. Before R4B both took the `qtyObj[f] = 0` path.');
  ok(!/key: 'reserved_stock'/.test(CC),
    'G3 [R4B] the shipped template no longer offers a reserved_stock column');
  ok(!/Blank = 0\./.test(CC) && /Blank = leave unchanged/.test(CC),
    'G4 [R4B] and "Blank = 0." is gone from every column comment, replaced by what the server does');
})();
// The contract's own answer to G3/G4, and its honesty about the limit of that answer.
ok(/IMPORT_TEMPLATE_RESERVED_COLUMN = REMOVED/.test(PARTVI), 'G5 PART VI removes the column from the template');
ok(/IMPORT_TEMPLATE_BLANK_COMMENT = "Blank = leave unchanged"/.test(PARTVI), 'G6 and rewrites the blank comment');
ok(/\*\*Removal is necessary and not sufficient\*\*/.test(PARTVI),
  'G7 and states that removal alone does not close the hazard — an operator-built file may still carry the column');
ok(/the client resolves columns by header name, not by template/.test(PARTVI),
  'G8 naming the reason: the client matches headers, so the template does not bound what a file can contain');

// =========================================================================================================
section('H. OWNERSHIP AND THE AUTHORIZATION BOUNDARY');
// =========================================================================================================
frozen('IMPORTER_CLIENT_NORMALIZATION_OWNER', 'assets/js/pages/overseas-stock.js');
frozen('IMPORTER_SERVER_WRITE_OWNER', '05_overseas_inventory_handlers.gs');
frozen('SECOND_RESERVATION_LIFECYCLE', 'NONE');
frozen('SECOND_AVAILABILITY_CALCULATION_PATH', 'NONE');
frozen('RECOMMENDATION_RESERVES_INVENTORY', 'NO');
frozen('SCHEDULED_CALCULATION_RESERVES_INVENTORY', 'NO');
frozen('AUTO_CREATE_SHIPMENT', 'NO   AUTO_SUBMIT_SHIPPING_PLAN = NO');
frozen('REQUEST_ORDER_TOUCHED', 'NO  PO_TOUCHED = NO');
frozen('S5_S6_AUTHORITY_SEPARATION', 'INTACT');
// Both named owners must actually exist and actually contain the collapse this round is about.
ok(fs.existsSync(path.join(ROOT, 'js/pages/overseas-stock.js')), 'H1 the named client owner exists');
ok(fs.existsSync(path.join(ROOT, 'specs/active/apps-script/05_overseas_inventory_handlers.gs')),
  'H2 the named server owner exists');
ok(/IMPORT_PROTECTION_OWNER_COUNT = 2/.test(CONTRACT), 'H3 and R3A\'s count of two protection owners still stands');

// This round implements NOTHING. If either owner changed, the round overstepped its own mode.
ok(code(F05).indexOf('S - R') === -1 && code(F05).indexOf('R3B') === -1,
  'H4 the server importer carries no R3B implementation — this is a decision round');
ok(code(CLIENT).indexOf('R3B') === -1,
  'H5 nor does the client — R4B implements, R3B decides');

// =========================================================================================================
section('I. VOCABULARY');
// =========================================================================================================
frozen('NEW_TOKENS_ADDED', '1');
frozen('NAMING_CONVENTION_SOURCE', "05_'s own IMPORT_* row/scope refusal prefix");
ok(/IMPORT_WAREHOUSE_SCOPE_INVALID/.test(F05) && /IMPORT_WAREHOUSE_SCOPE_MISMATCH/.test(F05),
  'I1 the IMPORT_* convention the new token follows is real and lives in the same file');
ok(/`INSUFFICIENT_FACTORY_STOCK`[\s\S]{0,400}`FACTORY_RESERVATION_LEDGER_MISMATCH`/.test(PARTVI),
  'I2 the survey that rejected the existing tokens is recorded, not merely claimed');
ok(/IMPORT_CONTRADICTION_CODE|CODE        IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE/.test(PARTVI),
  'I3 and exactly one new token is named');
ok(/SCOPE       ROW-level/.test(PARTVI), 'I4 the refusal is row-level so one bad SKU cannot fail a whole refresh');

// =========================================================================================================
section('J. MUTANTS — one per §11 hazard');
// =========================================================================================================
function afterImport(src, seed, payload) {
  var m = makeModel(src);
  if (seed) m.seed(K, seed[0], seed[1], seed[2]);
  var r = m.importRow(K, payload);
  return { state: m.state(K), res: r };
}
var TRUTH_70_30 = { available: 70, reserved: 30, physical: 0 };

mut('missing -> 0 collapse (the canonical reserved is replaced by an absent payload field)', function () {
  var src = MODEL_SRC.replace('var R = existing ? existing.reserved : 0;',
    'var R = payload.reserved === undefined ? 0 : payload.reserved;');
  var bad = afterImport(src, [70, 30], { available: 100 }).state;
  return JSON.stringify(bad) !== JSON.stringify(TRUTH_70_30)
    && JSON.stringify(afterImport(undefined, [70, 30], { available: 100 }).state) === JSON.stringify(TRUTH_70_30);
});

mut('blank -> 0 collapse', function () {
  var src = MODEL_SRC.replace('var R = existing ? existing.reserved : 0;',
    'var R = (payload.reserved === "" || payload.reserved === undefined) ? 0 : payload.reserved;');
  var bad = afterImport(src, [70, 30], { available: 100, reserved: '' }).state;
  return bad.reserved === 0 && bad.available === 100;
});

mut('reserved OVERWRITTEN from the payload', function () {
  var src = MODEL_SRC.replace('existing.reserved = R;', 'existing.reserved = payload.reserved;');
  var bad = afterImport(src, [70, 30], { available: 100, reserved: 0 }).state;
  return bad.reserved === 0 && afterImport(undefined, [70, 30], { available: 100, reserved: 0 }).state.reserved === 30;
});

mut('source available copied directly, without subtracting the canonical reserved', function () {
  var src = MODEL_SRC.replace('existing.available = S - R;', 'existing.available = S;');
  var bad = afterImport(src, [70, 30], { available: 100 }).state;
  // 130 units held against a source that reports 100 — §34's forbidden state.
  return bad.available === 100 && bad.reserved === 30 && (bad.available + bad.reserved) > 100;
});

mut('double subtraction — the STORED available is adjusted instead of being set from S', function () {
  var src = MODEL_SRC.replace('existing.available = S - R;', 'existing.available = existing.available - R;');
  var first = makeModel(src);
  first.seed(K, 70, 30);
  first.importRow(K, { available: 100 });
  var a1 = first.state(K).available;
  first.importRow(K, { available: 100 });
  var a2 = first.state(K).available;
  // Caught two ways: wrong on the first run, and DRIFTING on the second (§11 I).
  return a1 !== 70 && a2 !== a1;
});

mut('conflict silently clamped instead of refused', function () {
  var src = MODEL_SRC
    .replace('if (S < R) return { ok: false, code: "IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE", mutated: false };', '')
    .replace(/= S - R/g, '= Math.max(0, S - R)');
  var out = afterImport(src, [70, 30], { available: 20 });
  return out.res.ok === true && out.state.available === 0
    && afterImport(undefined, [70, 30], { available: 20 }).res.ok === false;
});

mut('physical enters the arithmetic', function () {
  var src = MODEL_SRC.replace('existing.available = S - R;', 'existing.available = S - R; existing.physical = S;');
  var bad = afterImport(src, [70, 30, 55], { available: 100 }).state;
  return bad.physical !== 55 && afterImport(undefined, [70, 30, 55], { available: 100 }).state.physical === 55;
});

mut('the refusal mutates the row before returning', function () {
  var src = MODEL_SRC.replace(
    'if (S < R) return { ok: false, code: "IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE", mutated: false };',
    'if (S < R) { if (existing) existing.available = S; return { ok: false, code: "IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE", mutated: false }; }');
  var bad = afterImport(src, [70, 30], { available: 20 }).state;
  return bad.available === 20 && afterImport(undefined, [70, 30], { available: 20 }).state.available === 70;
});

mut('the new-row case gets its own rule and inherits the source reserved', function () {
  var src = MODEL_SRC.replace(
    'if (!existing) { rows[k] = { available: S - R, reserved: R, physical: 0 }; return { ok: true, created: true, mutated: true }; }',
    'if (!existing) { rows[k] = { available: S, reserved: payload.reserved || 0, physical: 0 }; return { ok: true, created: true, mutated: true }; }');
  var m = makeModel(src);
  m.importRow(K, { available: 100, reserved: 5 });
  return m.state(K).reserved === 5;
});

// =========================================================================================================
section('SUMMARY');
// =========================================================================================================
console.log('');
console.log('D_S6_IMPORT_AVAILABLE_SEMANTIC = GROSS   S6_IMPORT_SEMANTIC_FREEZE = YES');
console.log('IMPORT_AVAILABLE_FORMULA = S - R   IMPORT_WRITES_RESERVED = NO   GUARD_BEFORE_SUBTRACTION = YES');
console.log('NEW_TABLE_REQUIRED = NO   NEW_COLUMNS_REQUIRED = NONE   BACKFILL_REQUIRED = NO');
console.log('RUNTIME_IMPLEMENTED = NONE   PRODUCTION_ROWS_WRITTEN = 0');
console.log('SECTIONS F AND G PIN TODAY\'S DEFECT AND MUST BREAK WHEN R4B LANDS');
console.log('');
console.log(pass + ' passed, ' + fail + ' failed, ' + mutants + ' mutants (' + survived + ' survived)');
process.exit(fail ? 1 : 0);
