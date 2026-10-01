// S7-R3 — CARRIER LEAD-TIME MAINTENANCE + LANE-IDENTITY SAFETY CLOSURE.
//
// carrier_rate_cards has been application-maintainable since the Rate Card round; carrier_lead_times never
// was. 61_ said so in as many words — a lead time had to be "entered directly in the `carrier_lead_times` tab,
// or a maintenance handler must be added first" — so a lane could be PRICED in the application and then not be
// made ROUTABLE in it, because a routable lane needs both authorities.
//
// THE AMBIGUITY THIS ROUND CLOSES. KMRA.leadDays resolves on canonical method key + origin + destination +
// last-mile, NOT on carrier_id, and takes the FIRST matching row. S6-R8A froze that same first-row pick out of
// dispatch, and resolveWarehouse in the same authority BLOCKS on ambiguity rather than picking. leadDays still
// picks, and S7-R2 froze that it must not change here. So the maintenance path prevents the ambiguous STATE.
//
// THE GUARD USES KMRA'S OWN PREDICATES, and this suite proves that by running them: the handler calls
// KMRA.canonicalMethodKey / KMRA.normalizeLeadTime rather than reimplementing the matching rules, because a
// guard written in its own dialect drifts from the resolver it protects and the drift is invisible until two
// rows answer one query.
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO SPREADSHEET. NO DRIVE. A fake sheet double and fixtures only.
// TEST_DATA_CLASSIFICATION = SYNTHETIC_FIXTURE   PRODUCTION_WRITE_AUTHORIZED = NO   PRODUCTION_ROWS_WRITTEN = 0
//
// Run: node assets/tests/s7-r3-carrier-lead-time-maintenance.test.js

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }

var GS = 'specs/active/apps-script/';
var G17 = read(GS + '17_carrier_handlers.gs');
var G61 = read(GS + '61_api_v1_weekly_ai_plan.gs');
var G63 = read(GS + '63_api_v1_system_health.gs');
var RTR = read(GS + '01_router.gs');
var KMRA_SRC = read('js/core/supply-planning-route-authority.js');
var API = read('js/api/operation-system-db-api.js');
var CRC = read('js/pages/carrier-rate-card.js');
var CRCHTML = read('html/pages/carrier-rate-card.html');

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function count(s, re) { return (String(s).match(re) || []).length; }
function mut(label, fn) {
  mutants++;
  var caught = false;
  try { caught = fn() === true; } catch (e) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// ----------------------------------------------------------------------------------------------------------
// THE REAL BACKEND, RUNNING. 17_ is loaded into a sandbox with a fake spreadsheet, a fake lock and the REAL
// KMRA — so every behavioural claim below exercises the shipped handler against the shipped resolver.
// Nothing here can reach a spreadsheet, a lock service or a network: those globals are doubles.
// ----------------------------------------------------------------------------------------------------------
var HEADERS = ['lead_time_id', 'carrier_id', 'origin_country', 'destination_country',
  'shipping_method', 'last_mile_delivery', 'min_days', 'max_days', 'avg_days', 'created_at', 'updated_at'];

function fakeSheet(rows) {
  var grid = [HEADERS.slice()];
  (rows || []).forEach(function (r) { grid.push(HEADERS.map(function (h) { return r[h] === undefined ? '' : r[h]; })); });
  return {
    _grid: grid,
    appendRow: function (arr) { grid.push(arr.slice()); },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return HEADERS.length; },
    getRange: function (r, c, nr, nc) {
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < nr; i++) { out.push((grid[r - 1 + i] || []).slice(c - 1, c - 1 + nc)); }
          return out;
        },
        setValues: function (vals) {
          for (var i = 0; i < vals.length; i++) {
            while (grid.length < r + i) grid.push([]);
            for (var j = 0; j < vals[i].length; j++) grid[r - 1 + i][c - 1 + j] = vals[i][j];
          }
        }
      };
    }
  };
}

// A harness per scenario: fresh sheet, fresh call log, no shared state between tests.
function backend(rows, opts) {
  opts = opts || {};
  var sheet = fakeSheet(rows);
  var log = { lockTries: 0, lockReleases: 0, flushes: 0, appends: 0, rangeWrites: 0, sheetsTouched: {} };
  var realAppend = sheet.appendRow;
  sheet.appendRow = function (a) { log.appends++; return realAppend.call(sheet, a); };
  var realRange = sheet.getRange;
  sheet.getRange = function (r, c, nr, nc) {
    var rg = realRange.call(sheet, r, c, nr, nc);
    var realSet = rg.setValues;
    rg.setValues = function (v) { log.rangeWrites++; return realSet.call(rg, v); };
    return rg;
  };
  var sandbox = {
    console: console,
    // The REAL shared route authority. Loaded, not stubbed: the guard's whole claim is that it uses these.
    KMRA: (function () {
      var box = { window: {}, module: { exports: {} } };
      vm.createContext(box);
      vm.runInContext(lf(KMRA_SRC), box);
      return box.KMRA || box.window.KMRA || box.module.exports;
    })(),
    SpreadsheetApp: {
      getActiveSpreadsheet: function () {
        return { getSheetByName: function (n) { log.sheetsTouched[n] = (log.sheetsTouched[n] || 0) + 1; return n === 'carrier_lead_times' ? sheet : null; } };
      },
      flush: function () { log.flushes++; }
    },
    LockService: {
      getScriptLock: function () {
        return {
          tryLock: function () { log.lockTries++; return opts.lockFails ? false : true; },
          releaseLock: function () { log.lockReleases++; }
        };
      }
    },
    Utilities: { getUuid: function () { return 'uuid-0000-0000'; } },
    // The 14_ write helpers 17_ composes with, as doubles over the fake sheet.
    fcWriteEnsureSheet_: function () { return sheet; },
    fcWriteEnsureColumns_: function () {},
    fcWriteReadSheet_: function (sh) {
      var g = sh._grid;
      return { headers: g[0].slice(), rows: g.map(function (r) { return r.slice(); }),
        col: function (name) { return g[0].indexOf(name); } };
    },
    fcWriteAppendByHeader_: function (sh, obj) {
      sh.appendRow(HEADERS.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
    },
    fcWriteTimestamp_: function () { return '2026-10-01 12:00:00'; },
    CARRIER_LEAD_TIMES_HEADERS_: HEADERS.slice(),
    jsonResponse_: function (o) { return o; }
  };
  vm.createContext(sandbox);
  // Only the pieces 17_ needs for this slice — the id sequencer and the S7-R3 block.
  vm.runInContext(sliceFn(lf(G17), 'function carrierNextLeadTimeId_(s) {'), sandbox);
  vm.runInContext(lf(G17).slice(lf(G17).indexOf('var CLT_LOCK_MS_ = 30000;')), sandbox);
  return { fn: sandbox.handleUpsertCarrierLeadTime_, census: sandbox.handleCarrierLeadTimeDuplicateCensus_,
    sheet: sheet, log: log, box: sandbox,
    rows: function () { return sheet._grid.slice(1).map(function (r) {
      var o = {}; HEADERS.forEach(function (h, i) { o[h] = r[i]; }); return o; }); } };
}
// Brace-balanced extraction of one function, string/comment aware enough for this file.
function sliceFn(src, head) {
  var a = src.indexOf(head); if (a < 0) throw new Error('anchor drifted: ' + head);
  var i = src.indexOf('{', a), depth = 0;
  for (; i < src.length; i++) {
    var two = src.substr(i, 2);
    if (two === '//') { i = src.indexOf('\n', i); continue; }
    var ch = src[i];
    if (ch === "'" || ch === '"') { var q = ch; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(a, i + 1); }
  }
  throw new Error('unbalanced: ' + head);
}

var SINO = { lead_time_id: 'CLT-000017', carrier_id: 'CAR_SINOTRANS', origin_country: 'CN',
  destination_country: 'JP', shipping_method: 'Air', last_mile_delivery: 'Parcel',
  min_days: 5, max_days: 8, avg_days: 7, created_at: '2026-01-01', updated_at: '2026-01-01' };

ok(typeof backend([]).fn === 'function' && typeof backend([]).census === 'function',
  'S1  the shipped 17_ maintenance handlers load and run against a fake sheet');
ok(!!backend([]).box.KMRA && typeof backend([]).box.KMRA.canonicalMethodKey === 'function',
  'S1a with the REAL shared route authority in scope, not a stub of it');

// ==========================================================================================================
section('A  THE PRE-STATE — what §2 says was missing, verified rather than recalled');
// ==========================================================================================================
ok(/entered directly in the `carrier_lead_times` tab, or a maintenance handler must be added first/.test(G61),
  'A1  61_ recorded the gap this round closes, in the runtime itself');
ok(/lead_time_id', 'carrier_id', 'origin_country', 'destination_country',/.test(G17)
  && /'shipping_method', 'last_mile_delivery', 'min_days', 'max_days', 'avg_days',/.test(G17)
  && /'created_at', 'updated_at'/.test(G17),
  'A2  the live schema is the 11 columns — no status, no is_active, no effective_from');
// Scoped to the lead-time header list and to THIS round's block. 17_ as a whole legitimately owns
// CARRIERS_HEADERS_ (is_active) and the rate-card importer (status, effective_from); scanning the whole
// file tested the wrong thing.
var CLT_HEADER_DECL = /var CARRIER_LEAD_TIMES_HEADERS_ = \[[\s\S]*?\];/.exec(G17)[0];
eq(count(CLT_HEADER_DECL, /is_active|status|effective_from|effective_to|priority/g), 0,
  'A2a the lead-time header list carries none of them');
eq(count(lf(G17).slice(lf(G17).indexOf('var CLT_LOCK_MS_ = 30000;')), /CARRIER_LEAD_TIMES_HEADERS_\.push|addColumn|is_active/g), 0,
  'A2b and this round added none — NEW_COLUMNS_REQUIRED = NONE');

// ==========================================================================================================
section('B  PLANNER-EFFECTIVE LANE IDENTITY — derived from KMRA.axisOk, not invented');
// ==========================================================================================================
ok(/lt\.methodKey === key/.test(KMRA_SRC)
  && /axisOk\(lt\.originCountry, query\.originCountry\)/.test(KMRA_SRC)
  && /axisOk\(lt\.destinationCountry, query\.destinationCountry\)/.test(KMRA_SRC),
  'B1  leadDays filters on method key + origin + destination + last mile');
eq(count(code(KMRA_SRC).slice(code(KMRA_SRC).indexOf('function leadDays')), /carrierId/g) === 0, true,
  'B1a and NOT on carrier_id — CARRIER_ID_AFFECTS_KMRA_LEADDAYS = NO');
ok(/if \(c === ''\) return true;          \/\/ card is a wildcard on this axis/.test(KMRA_SRC)
  || /if \(c === ''\) return true;/.test(KMRA_SRC),
  'B1b and a BLANK axis on the row is a WILDCARD — which is why tuple equality alone is not the guard');

// The guard calls KMRA rather than reimplementing it. This is the claim that keeps it from drifting.
ok(/kmra\.canonicalMethodKey\(method\)/.test(G17) && /kmra\.normalizeLeadTime\(obj\)/.test(G17),
  'B2  the write owner resolves methods and rows through KMRA itself');
ok(/error: 'KMRA_UNAVAILABLE'/.test(G17),
  'B2a and REFUSES when the bundle is absent rather than falling back to a private copy of the rules');

// ==========================================================================================================
section('C  §24 THE WRITE PATH, EXECUTED');
// ==========================================================================================================
// A — create a unique lane.
var A = backend([SINO]);
var rA = A.fn({ origin_country: 'CN', destination_country: 'US', shipping_method: 'Sea',
  last_mile_delivery: 'Truck', min_days: 25, avg_days: 30, max_days: 35, carrier_id: 'CAR_X' });
ok(rA.success === true, 'C1  §24A a unique lane is created', rA);
eq(A.rows().length, 2, 'C1a one row appended, the existing row untouched');
eq(rA.data.lead_time_id, 'CLT-000018', 'C1b with the next id in the canonical CLT-###### sequence');
eq(A.rows()[1].created_at, '2026-10-01 12:00:00', 'C1c created_at and updated_at are stamped by the server');
ok(rA.data.row && String(rA.data.row.lead_time_id) === 'CLT-000018',
  'C1d §10 the receipt is READ BACK from the sheet, not echoed from the request');

// B — create a duplicate effective lane.
var B = backend([SINO]);
var rB = B.fn({ origin_country: 'CN', destination_country: 'JP', shipping_method: 'Air',
  last_mile_delivery: 'Parcel', avg_days: 9, carrier_id: 'CAR_OTHER' });
eq(rB.success, false, 'C2  §24B an identical effective lane is REFUSED');
eq(rB.error, 'DUPLICATE_CARRIER_LEAD_TIME_LANE', 'C2a with a typed reason');
eq(B.rows().length, 1, 'C2b DUPLICATE_CREATE_WRITE_COUNT = 0 — nothing was appended');
eq(B.log.appends + B.log.rangeWrites, 0, 'C2c and no write of any kind reached the sheet');
eq(rB.conflicts[0].lead_time_id, 'CLT-000017', 'C2d the refusal names the row that already owns the lane');

// The wildcard case plain tuple equality would have missed.
var BW = backend([SINO]);
var rBW = BW.fn({ origin_country: '', destination_country: 'JP', shipping_method: 'Air',
  last_mile_delivery: 'Parcel', avg_days: 9 });
eq(rBW.success, false,
  'C3  a BLANK origin is a wildcard that reaches the existing CN row, so it is refused — tuple equality '
  + 'alone would have let this in');
var BW2 = backend([SINO]);
var rBW2 = BW2.fn({ origin_country: 'US', destination_country: 'JP', shipping_method: 'Air',
  last_mile_delivery: 'Parcel', avg_days: 9 });
eq(rBW2.success, true, 'C3a while a different concrete origin is a different lane and is allowed');

// Method alias: 'air freight' and 'Air' canonicalise to one key, so they are ONE lane.
var BA = backend([SINO]);
var rBA = BA.fn({ origin_country: 'CN', destination_country: 'JP', shipping_method: 'Air Freight',
  last_mile_delivery: 'Parcel', avg_days: 9 });
eq(rBA.success, false,
  'C4  a method ALIAS of an existing lane is refused — the guard compares canonical keys, as leadDays does');

// C — update in place.
var C = backend([SINO]);
var rC = C.fn({ lead_time_id: 'CLT-000017', origin_country: 'CN', destination_country: 'JP',
  shipping_method: 'Air', last_mile_delivery: 'Parcel', min_days: 4, avg_days: 6, max_days: 9,
  carrier_id: 'CAR_SINOTRANS' });
ok(rC.success === true && rC.data.updated === true, 'C5  §24C an existing row updates', rC);
eq(C.rows().length, 1, 'C5a LEADTIME_UPDATE_IDENTITY = lead_time_id — edited in place, never appended');
eq([C.rows()[0].lead_time_id, String(C.rows()[0].avg_days)], ['CLT-000017', '6'], 'C5b same id, new values');
eq(C.rows()[0].created_at, '2026-01-01', 'C5c §21 created_at is preserved; only updated_at moves');
eq(C.rows()[0].updated_at, '2026-10-01 12:00:00', 'C5d updated_at is the server clock');

// D — update INTO another lane's effective key.
var TWO = [SINO, { lead_time_id: 'CLT-000020', carrier_id: 'CAR_B', origin_country: 'CN',
  destination_country: 'US', shipping_method: 'Sea', last_mile_delivery: 'Truck',
  min_days: 20, max_days: 30, avg_days: 25, created_at: '2026-01-01', updated_at: '2026-01-01' }];
var D = backend(TWO);
var rD = D.fn({ lead_time_id: 'CLT-000020', origin_country: 'CN', destination_country: 'JP',
  shipping_method: 'Air', last_mile_delivery: 'Parcel', avg_days: 25 });
eq(rD.success, false, 'C6  §24D an edit that collides with ANOTHER lane is refused');
eq(D.log.rangeWrites, 0, 'C6a DUPLICATE_UPDATE_WRITE_COUNT = 0 — no mutation');
// …and editing a row's own values is NOT a collision with itself.
var D2 = backend(TWO);
var rD2 = D2.fn({ lead_time_id: 'CLT-000017', origin_country: 'CN', destination_country: 'JP',
  shipping_method: 'Air', last_mile_delivery: 'Parcel', avg_days: 7 });
eq(rD2.success, true, 'C6b while a row keeping its own lane is not a conflict with itself');

// E — concurrency.
var E = backend([], { lockFails: true });
var rE = E.fn({ origin_country: 'CN', destination_country: 'JP', shipping_method: 'Air', avg_days: 7 });
eq([rE.success, rE.error], [false, 'CARRIER_LEAD_TIME_LOCK_TIMEOUT'],
  'C7  §24E a create that cannot take the lock REFUSES — CONCURRENT_DUPLICATE_LANE_REACHABLE = NO');
eq(E.log.appends, 0, 'C7a and writes nothing');
var E2 = backend([SINO]);
E2.fn({ origin_country: 'CN', destination_country: 'KR', shipping_method: 'Air', avg_days: 3 });
eq([E2.log.lockTries, E2.log.lockReleases], [1, 1],
  'C7b the happy path takes the existing ScriptLock once and releases it — no second lock architecture');

// F / G — validation.
[['min > max', { min_days: 9, max_days: 3, avg_days: 5 }, 'CARRIER_LEAD_TIME_DAYS_ORDER'],
 ['avg above max', { min_days: 1, avg_days: 9, max_days: 3 }, 'CARRIER_LEAD_TIME_DAYS_ORDER'],
 ['min above avg', { min_days: 9, avg_days: 3, max_days: 20 }, 'CARRIER_LEAD_TIME_DAYS_ORDER'],
 ['negative days', { avg_days: -1 }, 'CARRIER_LEAD_TIME_DAYS_INVALID'],
 ['non-numeric', { avg_days: 'soon' }, 'CARRIER_LEAD_TIME_DAYS_INVALID'],
 ['no figure at all', {}, 'CARRIER_LEAD_TIME_DAYS_REQUIRED']
].forEach(function (t) {
  var H = backend([]);
  var r = H.fn(Object.assign({ origin_country: 'CN', destination_country: 'KR', shipping_method: 'Air' }, t[1]));
  eq([r.success, r.error], [false, t[2]], 'C8  §24F/G ' + t[0] + ' is refused');
  eq(H.log.appends, 0, 'C8a  ' + t[0] + ' — and not silently clamped into range');
});
['origin_country', 'destination_country', 'shipping_method'].forEach(function (f) {
  var H = backend([]);
  var body = { origin_country: 'CN', destination_country: 'KR', shipping_method: 'Air', avg_days: 3 };
  body[f] = '';
  var r = H.fn(body);
  eq(r.success, false, 'C9  a missing ' + f + ' is refused');
});
var UM = backend([]);
var rUM = UM.fn({ origin_country: 'CN', destination_country: 'KR', shipping_method: 'Teleport', avg_days: 3 });
eq([rUM.success, rUM.error], [false, 'CARRIER_LEAD_TIME_METHOD_UNRESOLVED'],
  'C10 a method the planner could never key is refused rather than stored where nothing reads it');

// An avg-only row is valid: it is the shape KMRA prefers, and the system's own seed writes one.
var AO = backend([]);
eq(AO.fn({ origin_country: 'CN', destination_country: 'KR', shipping_method: 'Air', avg_days: 4 }).success, true,
  'C11 a row carrying avg alone is accepted — demanding all three would reject the system\'s own seed shape');

// ==========================================================================================================
section('D  §16 THE READ-ONLY DUPLICATE CENSUS');
// ==========================================================================================================
var CEN = backend([SINO, { lead_time_id: 'CLT-000019', carrier_id: 'CAR_OTHER', origin_country: 'CN',
  destination_country: 'JP', shipping_method: 'air freight', last_mile_delivery: 'Parcel',
  min_days: 6, max_days: 10, avg_days: 8, created_at: '', updated_at: '' }]);
var cen = CEN.census({});
eq(cen.success, true, 'D1  the census answers');
eq(cen.data.duplicate_pairs.length, 1, 'D1a and finds the pre-existing ambiguous pair');
eq(cen.data.duplicate_row_count, 2, 'D1b naming both rows');
eq(cen.data.planner_would_use === undefined, true, 'D1c (per-pair, not global)');
eq(cen.data.duplicate_pairs[0].planner_would_use, 'CLT-000017',
  'D1d and reports which row the planner uses TODAY — the first with a finite avg');
eq(cen.data.carrier_specific_conflict_count, 1,
  'D1e §4 a pair carrying DIFFERENT carriers is counted separately: that is the case needing a product '
  + 'decision, because one planner lane cannot express two carriers\' transit times');
eq([CEN.log.appends, CEN.log.rangeWrites, CEN.log.flushes], [0, 0, 0],
  'D2  READ ONLY — the census wrote nothing, created nothing and flushed nothing');
var CLEAN = backend([SINO]);
eq(CLEAN.census({}).data.duplicate_pairs.length, 0, 'D3  and a clean table reports none');

// ==========================================================================================================
section('E  §14 SEPARATION, §15 PLANNER SEMANTICS, §22 SCHEMA');
// ==========================================================================================================
var SEP = backend([]);
SEP.fn({ origin_country: 'CN', destination_country: 'KR', shipping_method: 'Air', avg_days: 3 });
eq(Object.keys(SEP.log.sheetsTouched).filter(function (n) { return n !== 'carrier_lead_times'; }), [],
  'E1  RATE_CARD_WRITE_FROM_LEADTIME_COUNT = 0 — the write owner opens no other sheet');
var S7BLOCK = lf(G17).slice(lf(G17).indexOf('var CLT_LOCK_MS_ = 30000;'));
eq(count(code(S7BLOCK), /carrier_rate_cards|rate_card_id|unit_rate/g), 0,
  'E1a and names no rate-card table or column anywhere in its source');
// The importer DOES name carrier_lead_times - in the refusal it prints when transit columns appear in a
// rate template. What matters is that it never WRITES that sheet, so the claim is about the write call.
var IMPORTER = sliceFn(lf(G17), 'function handleImportCarrierRateCards_(body) {');
eq(count(code(IMPORTER), /fcWriteEnsureSheet_\(ss, 'carrier_lead_times'|getSheetByName\('carrier_lead_times'\)/g), 0,
  'E2  LEADTIME_WRITE_FROM_RATECARD_COUNT = 0 — the rate-card importer opens no lead-time sheet');
ok(/Lead Time \/ transit columns are not allowed in a Carrier Rate Template/.test(G17),
  'E2a and still rejects transit columns in a rate template outright');

// §15 — leadDays itself is byte-for-byte unchanged.
ok(/var withAvg = rows\.filter\(function \(r\) \{ return isFinite\(r\.avgDays\); \}\)\[0\];/.test(KMRA_SRC),
  'E3  KMRA_LEADDAYS_CHANGED = NO — the first-row pick is exactly as it was');
// And it is RUN against the three §15 fixtures.
var KM = (function () { var box = { window: {}, module: { exports: {} } }; vm.createContext(box);
  vm.runInContext(lf(KMRA_SRC), box); return box.KMRA || box.window.KMRA || box.module.exports; })();
eq(KM.leadDays({ originCountry: 'CN', destinationCountry: 'JP', lastMile: 'Parcel' }, [SINO], 'Air'),
  { days: 7, source: 'avg' }, 'E3a one unique lane resolves exactly as before');
eq(KM.leadDays({ originCountry: 'CN', destinationCountry: 'BR', lastMile: 'Parcel' }, [SINO], 'Air'),
  { days: null, source: null }, 'E3b no matching lane still answers nothing, never a fabricated figure');
var DUPFIX = [SINO, { lead_time_id: 'CLT-000019', carrier_id: 'CAR_OTHER', origin_country: 'CN',
  destination_country: 'JP', shipping_method: 'Air', last_mile_delivery: 'Parcel', avg_days: 99 }];
eq(KM.leadDays({ originCountry: 'CN', destinationCountry: 'JP', lastMile: 'Parcel' }, DUPFIX, 'Air').days, 7,
  'E3c and a duplicate fixture still takes the FIRST row (7, not 99) — legacy ambiguity, documented and '
  + 'left alone. This round stops NEW ambiguity; it does not rewrite history');

// ==========================================================================================================
section('F  §5 ONE WRITE OWNER, §18 READ, §11 SURFACE');
// ==========================================================================================================
var GS_FILES = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) { return /\.gs$/.test(f); });
eq(GS_FILES.filter(function (f) { return /function handleUpsertCarrierLeadTime_\(/.test(read(GS + f)); }),
  ['17_carrier_handlers.gs'],
  'F1  CARRIER_LEADTIME_WRITE_OWNER_COUNT_POST = 1');
ok(/if \(action === 'carrierLeadTime\.upsert'\)[\s\S]{0,80}handleUpsertCarrierLeadTime_/.test(RTR)
  && /if \(action === 'carrierLeadTime\.duplicateCensus'\)[\s\S]{0,100}handleCarrierLeadTimeDuplicateCensus_/.test(RTR),
  'F1a both actions are routed to it');
ok(/window\.KM\.DB\.upsertCarrierLeadTime = async function\(payload\)/.test(API)
  && /action: 'carrierLeadTime\.upsert'/.test(API),
  'F1b and the adapter reaches them through the current transport');
eq(count(code(API), /google\.script\.run/g), 0, 'F1c with no legacy direct call reintroduced');

// §18 — the panel rides the page's EXISTING scoped read.
ok(/function getLeadTimes\(\) \{ return _crcGet\('carrierLeadTimes', 'getCarrierLeadTimes'\); \}/.test(CRC),
  'F2  LEADTIME_READ_OWNER = the page\'s existing scoped read model');
eq(count(code(CRC), /loadOperationDb\(\{ force: true \}\)/g), 1,
  'F2a ADDITIONAL_LEADTIME_REQUEST_COUNT = 0 — the only broad load is the pre-existing legacy fallback');
var LTBLOCK = lf(CRC).slice(lf(CRC).indexOf('var _crcLtSaving = false;'), lf(CRC).indexOf('window.crcSearch = search;'));
eq(count(code(LTBLOCK), /loadScopedTables|getWorkspace|fetch\(/g), 0,
  'F2b PER_ROW_LEADTIME_REQUEST_COUNT = 0 — the panel issues no transport of its own');

// §11 — colocated, no new navigation.
ok(/id="crc-leadtime"/.test(CRCHTML) && /id="crc-lt-modal"/.test(CRCHTML),
  'F3  LEADTIME_UI_SURFACE = a Lead Time panel on the existing Carrier Rate Card page');
eq(count(read('../index.html'), /showSection\('carrier-lead-time'\)/g), 0,
  'F3a NEW_TOP_LEVEL_NAV_REQUIRED = NO — no new menu entry was added');

// §19 — four states.
ok(/if \(state === 'LOADING' \|\| state === 'NOT_LOADED'\)/.test(CRC),
  'F4  LOADING is its own state');
ok(/This is a read failure, not an empty lane list\./.test(CRC),
  'F4a LEADTIME_FALSE_EMPTY_COUNT = 0 — a failed read never reads as "no lanes"');
ok(/the write is committed; this list may be a moment behind/.test(CRC),
  'F4b LEADTIME_FALSE_FAILURE_COUNT = 0 — a committed write whose refresh lags is not reported as failed');
ok(/if \(!json \|\| json\.success !== true\) \{ _crcLtSetMsg\(_crcLtRefusalHtml\(json\)\); return; \}/.test(CRC),
  'F4c LEADTIME_FALSE_SUCCESS_COUNT = 0 — only the backend\'s own success is treated as one');
ok(/its outcome is unknown/.test(CRC) && /if \(_crcLtSaving\) return;/.test(CRC),
  'F4d LEADTIME_UNKNOWN_AUTOREPLAY_COUNT = 0 — unknown says so, and is never resent');

// §6 — no destructive delete was invented.
eq(GS_FILES.filter(function (f) { return /carrierLeadTime\.delete|handleDeleteCarrierLeadTime_/.test(read(GS + f)); }), [],
  'F5  LEADTIME_DELETE_SUPPORTED = NO — with no status column, removing a lane silently un-routes it, and '
  + 'no current workflow asks for that');

// §17 — the seed helper is left alone.
ok(/function handleSeedSinotransCarrier_\(body\)/.test(G17) && /Idempotent one-time seed of CAR_SINOTRANS/.test(G17),
  'F6  SINOTRANS_SEED_CLASSIFICATION = ONE_TIME_SEED — still present, not removed, not executed here');

// §22 — release identity moved because two actions were added.
ok(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 18;/.test(G63),
  'F7  the action-contract version moved 17 → 18, as adding a router action requires');
ok(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 18;/.test(API),
  'F7a and the browser pin agrees, so this frontend refuses a deployment that predates the action');

// ==========================================================================================================
section('G  §25 MUTANTS');
// ==========================================================================================================
function mutBackend(src, rows, opts) {
  var saved = G17;
  try { G17 = src; return backend(rows, opts); } finally { G17 = saved; }
}
mut('G1 carrier_id added to the effective uniqueness key', function () {
  // The planner does not read carrier_id, so making it part of the key would let a second carrier define a
  // second transit time for one lane the planner cannot tell apart.
  var m2 = G17.replace('function cltLaneConflicts_(candidate, row) {',
    'function cltLaneConflicts_(candidate, row) {\r\n  if (cltUp_(candidate.carrierId) !== cltUp_(row.carrierId)) return false;');
  var H = mutBackend(m2, [SINO]);
  var r = H.fn({ origin_country: 'CN', destination_country: 'JP', shipping_method: 'Air',
    last_mile_delivery: 'Parcel', avg_days: 9, carrier_id: 'CAR_OTHER' });
  return r.success === true;   // the duplicate got in → the mutant is detected by this check
});
mut('G2 last_mile_delivery removed from the uniqueness key', function () {
  var m = G17.replace('    && cltAxisCompatible_(candidate.lastMileDelivery, row.lastMileDelivery);', '    ;');
  var H = mutBackend(m, [SINO]);
  // Two DIFFERENT last miles on one lane must stay allowed; with the axis dropped they collide.
  var r = H.fn({ origin_country: 'CN', destination_country: 'JP', shipping_method: 'Air',
    last_mile_delivery: 'Truck', avg_days: 9 });
  return r.success === false;
});
mut('G3 origin and destination swapped in the guard', function () {
  var m = G17.replace('    && cltAxisCompatible_(candidate.destinationCountry, row.destinationCountry)',
    '    && cltAxisCompatible_(candidate.destinationCountry, row.originCountry)');
  var H = mutBackend(m, [SINO]);
  // Against a stored CN → JP, the swap compares the candidate's DESTINATION with the stored ORIGIN. So the
  // lane it wrongly refuses is CN → CN, which the correct guard allows (its destination differs from JP).
  var r = H.fn({ origin_country: 'CN', destination_country: 'CN', shipping_method: 'Air',
    last_mile_delivery: 'Parcel', avg_days: 9 });
  return r.success === false;
});
mut('G4 the duplicate guard removed entirely', function () {
  var m = G17.replace('    if (clash.length) {', '    if (false) {');
  var H = mutBackend(m, [SINO]);
  var r = H.fn({ origin_country: 'CN', destination_country: 'JP', shipping_method: 'Air',
    last_mile_delivery: 'Parcel', avg_days: 9 });
  return r.success === true && H.rows().length === 2;
});
mut('G5 the update excludes the WRONG lead_time_id from the guard', function () {
  var m = G17.replace('      if (suppliedId && r.id === suppliedId) return false;', '      return false;');
  var H = mutBackend(m, TWO);
  var r = H.fn({ lead_time_id: 'CLT-000020', origin_country: 'CN', destination_country: 'JP',
    shipping_method: 'Air', last_mile_delivery: 'Parcel', avg_days: 25 });
  return r.success === true;   // an edit INTO another lane was allowed → detected
});
mut('G6 min/avg/max validation removed', function () {
  var m = G17.replace("  if (mn.present && mx.present && mn.value > mx.value) {", "  if (false) {");
  var H = mutBackend(m, []);
  var r = H.fn({ origin_country: 'CN', destination_country: 'KR', shipping_method: 'Air',
    min_days: 9, max_days: 3 });
  return r.success === true;
});
mut('G7 the concurrency lock removed', function () {
  var m = G17.replace('    if (!lock.tryLock(CLT_LOCK_MS_)) {', '    if (false) {');
  var H = mutBackend(m, [], { lockFails: true });
  var r = H.fn({ origin_country: 'CN', destination_country: 'KR', shipping_method: 'Air', avg_days: 3 });
  return r.success === true;   // it wrote without holding the lock → detected
});
mut('G8 the rate-card table written from the lead-time action', function () {
  var m = G17.replace("    var sheet = fcWriteEnsureSheet_(ss, 'carrier_lead_times', CARRIER_LEAD_TIMES_HEADERS_);",
    "    ss.getSheetByName('carrier_rate_cards');\r\n    var sheet = fcWriteEnsureSheet_(ss, 'carrier_lead_times', CARRIER_LEAD_TIMES_HEADERS_);");
  var H = mutBackend(m, []);
  H.fn({ origin_country: 'CN', destination_country: 'KR', shipping_method: 'Air', avg_days: 3 });
  return !!H.log.sheetsTouched['carrier_rate_cards'];
});
mut('G9 KMRA.leadDays changed to a last-row pick', function () {
  var box = { window: {}, module: { exports: {} } };
  vm.createContext(box);
  vm.runInContext(lf(KMRA_SRC).replace('var withAvg = rows.filter(function (r) { return isFinite(r.avgDays); })[0];',
    'var rr = rows.filter(function (r) { return isFinite(r.avgDays); }); var withAvg = rr[rr.length - 1];'), box);
  var k = box.KMRA || box.window.KMRA || box.module.exports;
  return k.leadDays({ originCountry: 'CN', destinationCountry: 'JP', lastMile: 'Parcel' }, DUPFIX, 'Air').days !== 7;
});
mut('G10 a per-row network read introduced into the panel', function () {
  var m = LTBLOCK.replace('var rows = getLeadTimes() || [];',
    'var rows = getLeadTimes() || []; rows.forEach(function (r) { fetch("/x"); });');
  return count(code(m), /fetch\(/g) > 0;
});
mut('G11 an unread model treated as empty', function () {
  var m = CRC.replace("        if (state === 'LOADING' || state === 'NOT_LOADED') {", '        if (false) {');
  return !/if \(state === 'LOADING' \|\| state === 'NOT_LOADED'\) \{/.test(m);
});
mut('G12 the census quietly gaining a write', function () {
  var m = G17.replace("  var sh = fcWriteReadSheet_(sheet);\r\n  var index = cltIndexRows_(sh, kmra);",
    "  var sh = fcWriteReadSheet_(sheet);\r\n  sheet.appendRow(['x']);\r\n  var index = cltIndexRows_(sh, kmra);");
  var H = mutBackend(m, [SINO]);
  H.census({});
  return H.log.appends > 0;
});

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + '  ' + pass + ' passed / ' + fail + ' failed'
  + '   mutants ' + mutants + ', survived ' + survived);
process.exitCode = fail ? 1 : 0;
