// Kitchen Mama Operation System - S8-B3-R3-CP2V-R2
// THE EDGES OF THE BATCH CANONICAL READ, AND WHAT THE OLD READER PROMISED AT EACH OF THEM
//
// Run: node assets/tests/ir-canonical-batch-read-boundaries-s8-b3-r3-cp2v-r2.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes. Fixtures are synthetic.
//
// WHY THIS EXISTS. CP2V-R1 replaced twenty-one SpreadsheetApp range reads with two remote calls and proved
// the happy paths equivalent. Equivalence on the happy path is the easy half. A transport swap is dangerous
// exactly where the two transports DISAGREE ABOUT NOTHING:
//
//   getDataRange()                      batchGet
//   ------------------------------      ---------------------------------------------------
//   pads every row to the rectangle     omits trailing empty cells, per row
//   a Date is a Date                    a Date is a serial number, identical to any number
//   an empty sheet is [[]]              an empty range has no `values` KEY at all
//   one call, one shape                 one entry per range, and an entry can be malformed
//
// Each of those is a way to turn a business table into a slightly different business table in silence. So
// this file asserts the OLD reader's promises - snapshots keys, issue vocabulary, Date identity, blank-row
// handling - against the new one, and it asserts them with a comparison that can actually see a Date
// (JSON.stringify renders one as a string, so a Date and its own ISO text compare EQUAL under it; §C1 pins
// that this file does not make that mistake).
//
// SECTIONS
//   A  snapshots / issues semantics at the empty edges (no rows, header-only, blank header, formula '')
//   B  a malformed valueRange is a NAMED REFUSAL, never an empty table
//   C  Date type and time value survive, in a fixed-offset zone AND a DST zone
//   D  the `only` contract: absent, empty, unknown key, subset
//   E  equivalence that asserts the EXPECTED answer first, so two blocked paths cannot pass as one
//   F  the 43_ injected pre-read still wins and costs no extra read

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var BUNDLE = read('assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var H42 = read('assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var H60 = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');

var passed = 0, failed = 0;
function ok(c, m, d) {
  if (c) { passed++; console.log('ok   ' + m); }
  else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       ' + d)); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// ===========================================================================================================
// A comparison that can see a Date.
//
// JSON.stringify(new Date(0)) === '"1970-01-01T00:00:00.000Z"', so under JSON a Date and the STRING of that
// date are the same value - which is precisely the confusion a serial-number transport can introduce. This
// walker compares constructor class first, then Date by getTime(), and reports the path of the first
// difference so a failure names the column rather than dumping two blobs.
// ===========================================================================================================
function kindOf(v) {
  if (v === null) return 'null';
  if (v instanceof Date) return 'Date';
  if (Array.isArray(v)) return 'Array';
  return typeof v;
}
function deepDiff(a, b, p) {
  p = p || '$';
  var ka = kindOf(a), kb = kindOf(b);
  if (ka !== kb) return p + ': kind ' + ka + ' vs ' + kb + '  (' + String(a) + ' vs ' + String(b) + ')';
  if (ka === 'Date') {
    if (a.getTime() !== b.getTime()) return p + ': Date ' + a.toISOString() + ' vs ' + b.toISOString();
    return null;
  }
  if (ka === 'number') {
    if (a !== b && !(isNaN(a) && isNaN(b))) return p + ': number ' + a + ' vs ' + b;
    return null;
  }
  if (ka === 'Array') {
    if (a.length !== b.length) return p + ': length ' + a.length + ' vs ' + b.length;
    for (var i = 0; i < a.length; i++) { var d = deepDiff(a[i], b[i], p + '[' + i + ']'); if (d) return d; }
    return null;
  }
  if (ka === 'object') {
    var kk = Object.keys(a).sort(), kj = Object.keys(b).sort();
    if (kk.join('|') !== kj.join('|')) return p + ': keys [' + kk.join(',') + '] vs [' + kj.join(',') + ']';
    for (var j = 0; j < kk.length; j++) { var d2 = deepDiff(a[kk[j]], b[kk[j]], p + '.' + kk[j]); if (d2) return d2; }
    return null;
  }
  return a === b ? null : (p + ': ' + String(a) + ' vs ' + String(b));
}

// ===========================================================================================================
// Two timezones, because the conversion has two routes and only one of them is the reference.
//
// Asia/Taipei has no DST, so sirWsTzYearOffset_ proves the offset constant and the GUARDED pure-arithmetic
// route runs. America/Los_Angeles does, so the guard fails and every cell falls back to the reference
// sirWsSerialToDate_. A test that only ever used one zone would exercise one route and claim both.
// ===========================================================================================================
var ZONES = {
  'Asia/Taipei': function () { return 8 * 3600000; },
  'America/Los_Angeles': function (instantMs) {
    // 2026 US rules, resolved at UTC instants so the function is total and deterministic.
    var dstStart = Date.UTC(2026, 2, 8, 10), dstEnd = Date.UTC(2026, 10, 1, 9);
    return (instantMs >= dstStart && instantMs < dstEnd) ? -7 * 3600000 : -8 * 3600000;
  }
};
function offsetAt(tz, instantMs) {
  if (tz === 'UTC') return 0;
  return ZONES[tz](instantMs);
}
function two(n) { return (n < 10 ? '0' : '') + n; }
var Utilities = {
  formatDate: function (d, tz, fmt) {
    var w = new Date(d.getTime() + offsetAt(tz, d.getTime()));
    return w.getUTCFullYear() + '-' + two(w.getUTCMonth() + 1) + '-' + two(w.getUTCDate()) + ' '
      + two(w.getUTCHours()) + ':' + two(w.getUTCMinutes()) + ':' + two(w.getUTCSeconds());
  },
  parseDate: function (s, tz, fmt) {
    var wall = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10),
      +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19));
    // Resolve the wall time by trying the zone's own offsets and keeping the self-consistent one.
    var cands = [wall - offsetAt(tz, wall + 12 * 3600000), wall - offsetAt(tz, wall - 12 * 3600000)];
    for (var i = 0; i < cands.length; i++) {
      if (wall - offsetAt(tz, cands[i]) === cands[i]) return new Date(cands[i]);
    }
    return new Date(cands[0]);
  }
};
var EPOCH = Date.UTC(1899, 11, 30);
// The exact inverse of sirWsSerialToDate_: what Sheets would put on the wire for this Date in this zone.
function dateToSerial(d, tz) { return (d.getTime() + offsetAt(tz, d.getTime()) - EPOCH) / 86400000; }

// ===========================================================================================================
// Fixture plumbing.
// ===========================================================================================================
function T(headers, rows) { return { headers: headers, rows: rows }; }
var CO = 'KM', CN = 'US', MK = 'Amazon';

function baseTables(tz, o) {
  o = o || {};
  var country = o.country || CN, mkt = o.marketplace || MK, model = o.model || 'sales_driven';
  var mktFm = o.mktFm || 'platform_fulfilled';
  var skus = o.skus || [['CO1', 'S1', '']];
  function D(y, m, day, hh) { var guess = Date.UTC(y, m - 1, day, hh || 0); return new Date(guess - offsetAt(tz, guess)); }
  var CREATED = D(2026, 3, 4, 9), UPDATED = D(2026, 7, 1, 18);
  var daily = [];
  // `salesCountries` lets a scope's sales rows be keyed by something other than the scope's own country,
  // which is the whole shape of an EU roll-up: the REGION is the planning scope, the MEMBER markets are
  // what the snapshot actually holds. Default is the scope country, so every existing case is unchanged.
  var salesCountries = o.salesCountries || [country];
  for (var m = 8; m <= 9; m++) {
    var last = (m === 8) ? 31 : 29;
    for (var d = 1; d <= last; d++) {
      for (var s = 0; s < skus.length; s++) {
        var units = (o.zeroDays && d % 7 === 0) ? 0 : 10;
        for (var q = 0; q < salesCountries.length; q++) {
          daily.push([D(2026, m, d), salesCountries[q], 'Amazon.com', skus[s][0], 'USD', units,
            units * 19.9, 0, units, 5, 9, mkt, D(2026, m, d, 6), CREATED, UPDATED]);
        }
      }
    }
  }
  var FCH = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id', 'created_at', 'updated_at'];
  var fc = [];
  for (var i = 0; i < skus.length; i++) {
    fc.push([CO, country, mkt, skus[i][0], 2026, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000,
      3000, 3000, 'FC-' + skus[i][0] + '-26', CREATED, UPDATED]);
    fc.push([CO, country, mkt, skus[i][0], 2027, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000,
      3000, 3000, 'FC-' + skus[i][0] + '-27', CREATED, UPDATED]);
  }
  var t = {
    sku_details: T(['sku', 'units_per_carton', 'created_at', 'updated_at'],
      skus.map(function (r) { return [r[0], 40, CREATED, UPDATED]; })),
    marketplace_skus: T(['company', 'country', 'marketplace', 'sku', 'site_sku', 'fulfillment_model',
      'replenishment_model', 'marketplace_sku_id', 'launch_date', 'created_at', 'updated_at'],
      skus.map(function (r) { return [CO, country, mkt, r[0], r[1], r[2], model, 'MSKU-' + r[0], D(2025, 5, 2), CREATED, UPDATED]; })),
    warehouses: T(['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type',
      'created_at', 'updated_at'], [['WH-A', CO, country, 'TRUE', 'FALSE', '3PL', CREATED, UPDATED]]),
    marketplaces: T(['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status',
      'allocation_priority', 'created_at', 'updated_at'], [['MP1', CO, country, mkt, mktFm, 'active', 10, CREATED, UPDATED]]),
    fc_regular_forecast: T(FCH, fc),
    // event_month holds the NUMBER 11 in a column whose NAME ends in _month: a name heuristic would convert
    // it to 1900-01-10 and destroy every FC window. It must stay the number 11.
    fc_special_events: T(['company', 'country', 'marketplace', 'sku', 'event_month', 'event_start_date',
      'event_end_date', 'event_period', 'uplift_units', 'created_at', 'updated_at'],
      o.events || [[CO, country, mkt, 'CO1', 11, D(2026, 11, 20), D(2026, 11, 30), 'BFCM', 500, CREATED, UPDATED]]),
    amazon_inventory_snapshot: T(['country', 'marketplace', 'sku', 'available_qty', 'snapshot_date', 'synced_at',
      'created_at', 'updated_at'],
      skus.map(function (r) { return [country, mkt, r[0], 5000, D(2026, 9, 29), D(2026, 9, 29, 7), CREATED, UPDATED]; })),
    overseas_inventory_snapshot: T(['company', 'country', 'warehouse_id', 'sku', 'qty', 'snapshot_date',
      'wh_on_the_way_eta', 'last_movement_at', 'created_at', 'updated_at'],
      [[CO, country, 'WH-A', 'CO1', 100, '', '', '', CREATED, UPDATED]]),
    factory_stock: T(['company', 'sku', 'qty', 'last_transaction_at', 'created_at', 'updated_at'],
      [[CO, 'CO1', 500, D(2026, 6, 6), CREATED, UPDATED]]),
    replenishment_demand_allocation_rules: T(['allocation_rule_id', 'company', 'country', 'marketplace',
      'destination_warehouse_id', 'forecast_allocation_ratio', 'sales_allocation_ratio', 'status'],
      [['R1', CO, country, mkt, 'WH-A', 1, 1, 'active']]),
    fc_target_rules: T(['company', 'country', 'marketplace', 'sku', 'target_pct', 'created_at', 'updated_at'],
      [[CO, country, mkt, 'CO1', 100, CREATED, UPDATED]]),
    amazon_daily_sales_snapshot: T(['snapshot_date', 'country', 'channel', 'sku', 'currency', 'sales_units',
      'sales_amount', 'return_units', 'total_orders', 'session', 'page_view', 'marketplace', 'synced_at',
      'created_at', 'updated_at'], daily),
    // snapshot_week holds the STRING '2026-09-21~2026-09-27'. A value heuristic would see a date-shaped
    // thing; it is not a date and must not become one.
    amazon_weekly_sales_snapshot: T(['snapshot_month', 'week_start_date', 'week_end_date', 'snapshot_week',
      'country', 'channel', 'sku', 'sales_units_7d', 'marketplace', 'synced_at', 'created_at', 'updated_at'],
      o.weekly || [[D(2026, 9, 1), D(2026, 9, 21), D(2026, 9, 27), '2026-09-21~2026-09-27', country,
        'Amazon.com', 'CO1', 70, mkt, D(2026, 9, 28), CREATED, UPDATED]]),
    campaigns: T(['campaign_id', 'company', 'country', 'marketplace', 'status', 'start_date', 'end_date'],
      o.campaigns || []),
    campaign_sku_lines: T(['campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'sku'], o.campaignLines || []),
    purchase_order_lines: T(['po_line_id', 'po_id', 'sku', 'ordered_qty', 'completed_qty',
      'expected_completion_date', 'company'], o.po || []),
    request_order_line_sources: T(['source_id', 'request_order_line_id', 'company', 'country', 'marketplace', 'sku'],
      o.ros || []),
    shipping_plans: T(['shipping_plan_id', 'company', 'country', 'marketplace', 'status'], []),
    shipments: T(['shipment_id', 'shipping_plan_id', 'company', 'status', 'eta'], []),
    shipment_lines: T(['shipment_line_id', 'shipment_id', 'sku', 'qty'], []),
    shipping_plan_lines: T(['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'qty', 'destination_warehouse_id'], [])
  };
  if (o.dropSheets) o.dropSheets.forEach(function (n) { delete t[n]; });
  if (o.emptySheets) o.emptySheets.forEach(function (n) { if (t[n]) { t[n] = { headers: [], rows: [], empty: true }; } });
  if (o.mutate) o.mutate(t, D);
  return t;
}

function makeSs(tables, tz, stats) {
  return {
    getId: function () { return 'FAKE-ID'; },
    getName: function () { return 'FAKE'; },
    getSpreadsheetTimeZone: function () { return tz; },
    getSheetByName: function (name) {
      var t = tables[name];
      if (!t) return null;
      var values = t.empty ? [] : [t.headers].concat(t.rows);
      return {
        getLastRow: function () { return values.length; },
        getLastColumn: function () { return values.length ? values[0].length : 0; },
        getDataRange: function () {
          stats.sheetReads++;
          return { getValues: function () { return values.map(function (r) { return r.slice(); }); } };
        }
      };
    }
  };
}

// The fake advanced service. It reproduces the two properties that make batchGet dangerous, and it can be
// told to MANGLE its own response so §B has something real to refuse.
function makeSheets(tables, tz, stats, mangle, mangleMeta) {
  return {
    Spreadsheets: {
      get: function () {
        stats.remoteCalls++;
        var out = [];
        Object.keys(tables).forEach(function (n) {
          var t = tables[n], w = t.empty ? 1 : t.headers.length;
          if (!t.empty) t.rows.forEach(function (r) { if (r.length > w) w = r.length; });
          out.push({ properties: { title: n, gridProperties: { columnCount: w } } });
        });
        var meta = { sheets: out };
        return mangleMeta ? mangleMeta(meta) : meta;
      },
      Values: {
        batchGet: function (id, opt) {
          stats.remoteCalls++;
          var vr = opt.ranges.map(function (range) {
            var name = range.slice(1, range.indexOf("'!")).replace(/''/g, "'");
            var t = tables[name];
            if (!t) throw new Error('range not found: ' + range);
            if (t.empty) return {};
            var rows = [t.headers].concat(t.rows).map(function (r) {
              var c = r.map(function (v) { return (v instanceof Date) ? dateToSerial(v, tz) : v; });
              // trailing EMPTIES are omitted - '' and null, never 0
              while (c.length && (c[c.length - 1] === '' || c[c.length - 1] === null || c[c.length - 1] === undefined)) c.pop();
              return c;
            });
            while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
            return rows.length ? { values: rows } : {};
          });
          var resp = { valueRanges: vr };
          return mangle ? mangle(resp, opt) : resp;
        }
      }
    }
  };
}

function makeEnv(sheetsImpl, extraGlobals) {
  var names = ['console', 'Utilities', 'Sheets', 'warehouseAllocationSnapshot_'];
  var vals = [console, Utilities, sheetsImpl, (extraGlobals && extraGlobals.warehouseAllocationSnapshot_) || undefined];
  var src = BUNDLE + '\n' + H60 + '\n' + H42 + '\n'
    + 'return { handle: handleRecommendationWorkspaceGet_, KMPS: KMPS,'
    + '  canonical: (typeof recoWsCanonicalRead_ === "function" ? recoWsCanonicalRead_ : null),'
    + '  split: (typeof recoWsCanonSplit_ === "function" ? recoWsCanonSplit_ : null),'
    + '  defaultIo: recommendationWorkspaceDefaultIo_ };';
  return Function.apply(null, names.concat([src])).apply(null, vals);
}

// One canonical read, by whichever transport. Returns { snapshots, issues } or the thrown error.
var ZERO = function () { return 0; };

// Which canonical tables actually travel by batch. A boundary test aimed at a table that is NOT batched
// compares the per-sheet reader with itself and passes for the wrong reason - the first draft of section A
// did exactly that with `campaigns`, so the membership is now asserted rather than assumed.
var BATCHED_SHEETS = (function () {
  var E = makeEnv(undefined);
  return (E.split ? E.split().batch : []).map(function (e) { return e.sheet; });
})();
function assertBatched(sheet, label) {
  ok(BATCHED_SHEETS.indexOf(sheet) !== -1,
    label + ' [vacuity guard] "' + sheet + '" really is carried by the batch transport',
    'batched: ' + BATCHED_SHEETS.join(', '));
}

function readVia(mode, tables, tz, opts) {
  opts = opts || {};
  var stats = { sheetReads: 0, remoteCalls: 0 };
  var sheetsImpl = (mode === 'batch') ? makeSheets(tables, tz, stats, opts.mangle, opts.mangleMeta) : undefined;
  var E = makeEnv(sheetsImpl, opts.globals);
  var ss = makeSs(tables, tz, stats);
  var out = null, thrown = null;
  try {
    out = (mode === 'batch') ? E.canonical(ss, ZERO) : E.KMPS.readCanonicalSnapshots(ss, opts.config || null);
  } catch (e) { thrown = e; }
  return { out: out, thrown: thrown, stats: stats, E: E };
}

function runHandler(mode, tables, tz, opts) {
  opts = opts || {};
  var stats = { sheetReads: 0, remoteCalls: 0 };
  var sheetsImpl = (mode === 'batch') ? makeSheets(tables, tz, stats, opts.mangle, opts.mangleMeta) : undefined;
  var E = makeEnv(sheetsImpl, opts.globals);
  var ss = makeSs(tables, tz, stats);
  var io = {
    now: function () { return 0; }, nextSeq: function () { return 1; },
    configMonth: function () { return '2026-09'; }, configDate: function () { return '2026-09-29'; },
    openTarget: function () { return ss; }
  };
  if (mode === 'batch') io.readCanonicalSnapshots = function (s) { return E.canonical(s, ZERO); };
  if (opts.injectPreRead) io.readCanonicalSnapshots = opts.injectPreRead(E, ss, stats);
  var body = { requestId: 'BND', payload: { scope: { company: CO, country: opts.country || CN,
    marketplace: opts.marketplace || MK }, pagination: { page: 1, size: 500 } } };
  var env = null, thrown = null;
  try { env = E.handle(body, io); } catch (e) { thrown = String((e && e.message) || e); }
  return { env: env, thrown: thrown, stats: stats };
}
function linesOf(r) { return (r.env && r.env.data && r.env.data.lines) || []; }

// `meta.canonicalRead` is a DIAGNOSTIC: it names the transport, so of course it differs between transports.
// Comparing it would make every equivalence case fail for the one reason that is supposed to differ, and
// deleting it from the response would remove the only way production can tell which path ran. So business
// equivalence is asserted on the response WITHOUT it, and the diagnostic is asserted separately in §G.
function businessView(env) {
  if (!env) return env;
  var c = JSON.parse(JSON.stringify(env, function (k, v) { return v instanceof Date ? { __d: v.getTime() } : v; }),
    function (k, v) { return (v && typeof v === 'object' && typeof v.__d === 'number') ? new Date(v.__d) : v; });
  if (c.meta) delete c.meta.canonicalRead;
  return c;
}
function errsOf(r) { return (r.env && r.env.errors) || []; }

var TZ = 'Asia/Taipei';

// ===========================================================================================================
section('A  snapshots / issues semantics at the empty edges');
// ===========================================================================================================
// The table under test is fc_target_rules: it is in 60_'s proven date map, so it travels by batch and the
// two sides of every comparison below are genuinely two different transports.
var A_TBL = 'fc_target_rules', A_KEY = 'fcTargetRules';
assertBatched(A_TBL, 'A0');

// A1 - a sheet with NO rows at all. The old reader reports MISSING_SNAPSHOT and puts no key in snapshots.
// "No key" and "a key holding an empty table" are different answers to a consumer, and the difference is the
// whole reason the issue vocabulary exists.
(function () {
  var tz = TZ;
  var tbl = baseTables(tz, { emptySheets: [A_TBL] });
  var a = readVia('persheet', tbl, tz);
  var b = readVia('batch', tbl, tz);
  var issA = (a.out.issues || []).filter(function (i) { return i.sourceType === A_KEY; });
  var issB = (b.out.issues || []).filter(function (i) { return i.sourceType === A_KEY; });
  ok(issA.length === 1 && issA[0].reason === 'MISSING_SNAPSHOT', 'A1 old reader: no-row sheet -> MISSING_SNAPSHOT',
    JSON.stringify(issA));
  ok(!(A_KEY in a.out.snapshots), 'A1 old reader: no-row sheet contributes NO snapshots key');
  ok(deepDiff(issB, issA) === null, 'A1 batch reader: same issue, same reason', String(deepDiff(issB, issA)));
  ok(!(A_KEY in b.out.snapshots), 'A1 batch reader: no-row sheet contributes NO snapshots key');
})();

// A2 - a sheet that exists and holds ONLY a header row. That is a real, present, empty table: the key must
// exist with zero rows, and NO issue is raised. Collapsing it into A1 would turn "nothing to report" into
// "source missing" and fail a scope closed that should simply have been empty.
(function () {
  var tz = TZ;
  var tbl = baseTables(tz, {});
  tbl[A_TBL] = T(['company', 'country', 'marketplace', 'sku', 'target_pct', 'created_at', 'updated_at'], []);
  var a = readVia('persheet', tbl, tz), b = readVia('batch', tbl, tz);
  ok(a.out.snapshots[A_KEY] && a.out.snapshots[A_KEY].rows.length === 0,
    'A2 old reader: header-only sheet -> key present, zero rows');
  ok((a.out.issues || []).filter(function (i) { return i.sourceType === A_KEY; }).length === 0,
    'A2 old reader: header-only sheet raises NO issue');
  ok(deepDiff(b.out.snapshots[A_KEY], a.out.snapshots[A_KEY]) === null,
    'A2 batch reader: identical header-only snapshot',
    String(deepDiff(b.out.snapshots[A_KEY], a.out.snapshots[A_KEY])));
  ok((b.out.issues || []).filter(function (i) { return i.sourceType === A_KEY; }).length === 0,
    'A2 batch reader: header-only sheet raises NO issue');
})();

// A3 - a BLANK header row above real data. The old reader yields headers of '' and keeps the rows; nothing
// about that is good data, but it is the data, and a transport may not quietly improve it.
(function () {
  var tz = TZ;
  var tbl = baseTables(tz, {});
  tbl[A_TBL] = T(['', '', ''], [['KM', 'US', 'Amazon']]);
  var a = readVia('persheet', tbl, tz), b = readVia('batch', tbl, tz);
  var d = deepDiff(b.out.snapshots[A_KEY], a.out.snapshots[A_KEY]);
  ok(a.out.snapshots[A_KEY].headers.join('|') === '||', 'A3 old reader: blank header row -> ["","",""]',
    JSON.stringify(a.out.snapshots[A_KEY].headers));
  ok(d === null, 'A3 batch reader: identical blank-header snapshot', String(d));
})();

// A4 - a formula that returns the EMPTY STRING. Mid-row it is a value; at the end of a row it is
// indistinguishable from a blank cell on the wire and must be padded back.
(function () {
  var tz = TZ;
  var tbl = baseTables(tz, {});
  tbl[A_TBL] = T(['company', 'note', 'tail'], [['KM', '', ''], ['KM', 'x', '']]);
  var a = readVia('persheet', tbl, tz), b = readVia('batch', tbl, tz);
  var d = deepDiff(b.out.snapshots[A_KEY], a.out.snapshots[A_KEY]);
  ok(d === null, 'A4 formula-empty cells survive as "" in every column position', String(d));
})();

// A5 - a trailing row that is entirely empty. getDataRange() keeps it (the sheet says it has content);
// batchGet drops it. The rectangle therefore CAN differ, and the test records which happened rather than
// assuming; what must not differ is the answer the handler gives.
(function () {
  var tz = TZ;
  var tbl = baseTables(tz, {});
  tbl[A_TBL] = T(['company', 'country', 'marketplace', 'sku', 'target_pct', 'created_at', 'updated_at'],
    [['KM', 'US', 'Amazon', 'CO1', 100, '', ''], ['', '', '', '', '', '', '']]);
  var a = readVia('persheet', tbl, tz), b = readVia('batch', tbl, tz);
  var ra = a.out.snapshots[A_KEY].rows.length, rb = b.out.snapshots[A_KEY].rows.length;
  var ha = runHandler('persheet', tbl, tz), hb = runHandler('batch', tbl, tz);
  var d = deepDiff(businessView(hb.env), businessView(ha.env));
  ok(d === null, 'A5 trailing all-blank row: HANDLER output identical', String(d));
  ok(true, 'A5 [recorded] per-sheet rows=' + ra + ', batch rows=' + rb
    + (ra === rb ? ' (rectangles agree)' : ' (batch drops trailing all-blank rows; business answer unchanged)'));
})();

// ===========================================================================================================
section('B  a malformed valueRange is a NAMED REFUSAL, never an empty table');
// ===========================================================================================================
// The count check already catches a SHORT response. The dangerous case is the RIGHT NUMBER of entries with a
// broken one among them: `(vr && vr.values) || null` turns that into "no values", which is the same branch as
// a legitimately empty range - so a malformed response would silently become an empty business table.
function mangleAt(i, fn) {
  return function (resp) { resp.valueRanges[i] = fn(resp.valueRanges[i]); return resp; };
}
var MALFORMED = [
  ['B1 null entry', mangleAt(0, function () { return null; })],
  ['B2 values is a string', mangleAt(1, function () { return { values: 'nonsense' }; })],
  ['B3 values is an object', mangleAt(2, function () { return { values: { 0: ['a'] } }; })],
  ['B4 a row is not an array', mangleAt(3, function (v) { var c = { values: (v.values || [['h']]).slice() }; c.values[1] = 'not-a-row'; return c; })],
  ['B5 a row is null', mangleAt(4, function (v) { var c = { values: (v.values || [['h']]).slice() }; c.values[1] = null; return c; })]
];
MALFORMED.forEach(function (m) {
  var tz = TZ, tbl = baseTables(tz, {});
  var r = readVia('batch', tbl, tz, { mangle: m[1] });
  var refused = !!r.thrown;
  var named = refused && !!(r.thrown.apiCode || r.thrown.safetyToken || r.thrown.validationCode);
  ok(refused, m[0] + ' -> refused (not silently an empty table)',
    refused ? '' : 'returned ' + JSON.stringify(Object.keys((r.out && r.out.snapshots) || {}).length) + ' tables');
  ok(named, m[0] + ' -> refusal carries a NAMED code',
    refused ? ('code=' + (r.thrown.apiCode || r.thrown.safetyToken || r.thrown.validationCode || '(none)')
      + ' msg=' + String(r.thrown.message).slice(0, 60)) : '(not refused)');
});
// And the refusal must survive the real handler rather than being swallowed into INTERNAL_ERROR.
(function () {
  var tz = TZ, tbl = baseTables(tz, {});
  var h = runHandler('batch', tbl, tz, { mangle: mangleAt(0, function () { return null; }) });
  var errs = errsOf(h);
  var code = errs.length ? errs[0].code : '(none)';
  ok(errs.length > 0 && code !== 'INTERNAL_ERROR',
    'B6 the refusal reaches the handler envelope under its own name, not INTERNAL_ERROR', 'code=' + code);
  ok(!(h.env && h.env.success === true), 'B7 the handler does NOT answer success on a malformed read');
})();

// ===========================================================================================================
section('C  Date type and time value survive both conversion routes');
// ===========================================================================================================
// C1 - the instrument first. If deepDiff could not tell a Date from its own ISO text, every other assertion
// in this section would be worthless.
(function () {
  var d = new Date(Date.UTC(2026, 8, 29, 4, 0, 0));
  ok(deepDiff(d, d.toISOString()) !== null, 'C1 deepDiff distinguishes a Date from its ISO string');
  ok(deepDiff(d, new Date(d.getTime() + 1000)) !== null, 'C1 deepDiff distinguishes Dates one second apart');
  ok(deepDiff(d, new Date(d.getTime())) === null, 'C1 deepDiff accepts equal Dates');
  ok(JSON.stringify(d) === JSON.stringify(d.toISOString()),
    'C1 (and JSON.stringify genuinely cannot - which is why it is not used here)');
})();

Object.keys(ZONES).forEach(function (tz) {
  var tbl = baseTables(tz, {});
  var a = readVia('persheet', tbl, tz), b = readVia('batch', tbl, tz);
  var d = deepDiff(b.out.snapshots, a.out.snapshots);
  ok(d === null, 'C2 [' + tz + '] every snapshot cell identical, Dates by value and by type', String(d));

  // the two traps, pinned by value rather than by absence of a diff
  var ev = b.out.snapshots.fcSpecialEvents;
  var iMonth = ev.headers.indexOf('event_month');
  ok(ev.rows[0][iMonth] === 11, 'C3 [' + tz + '] fc_special_events.event_month stays the NUMBER 11',
    'got ' + kindOf(ev.rows[0][iMonth]) + ' ' + String(ev.rows[0][iMonth]));
  var wk = b.out.snapshots.amazonWeeklySalesSnapshot;
  var iWk = wk.headers.indexOf('snapshot_week');
  ok(wk.rows[0][iWk] === '2026-09-21~2026-09-27',
    'C3 [' + tz + '] amazon_weekly_sales_snapshot.snapshot_week stays a STRING',
    'got ' + kindOf(wk.rows[0][iWk]) + ' ' + String(wk.rows[0][iWk]));
  var iStart = ev.headers.indexOf('event_start_date');
  ok(ev.rows[0][iStart] instanceof Date, 'C4 [' + tz + '] a declared date column IS a Date after the batch read',
    'got ' + kindOf(ev.rows[0][iStart]));
});

// C5 - the DST zone must actually have taken the reference route, otherwise C2 proved one route twice.
(function () {
  var tz = 'America/Los_Angeles';
  var jan = Date.UTC(2026, 0, 15, 12), jul = Date.UTC(2026, 6, 15, 12);
  ok(offsetAt(tz, jan) !== offsetAt(tz, jul),
    'C5 the DST zone really does change offset within 2026 (so the constant-offset guard must fail there)');
})();

// ===========================================================================================================
section('D  the `only` contract');
// ===========================================================================================================
(function () {
  var tz = TZ, tbl = baseTables(tz, {});
  var E = makeEnv(undefined);
  var all = E.KMPS.tablesFor(null);
  ok(all.length === 21, 'D1 only ABSENT -> the whole registry, 21 entries', 'got ' + all.length);

  var subset = E.KMPS.tablesFor({ only: ['marketplaces', 'skuDetails'] });
  ok(subset.length === 2 && subset[0].key === 'skuDetails' && subset[1].key === 'marketplaces',
    'D2 only SUBSET -> exactly those, in REGISTRY order (not caller order)',
    JSON.stringify(subset.map(function (e) { return e.key; })));

  var empty = E.KMPS.tablesFor({ only: [] });
  ok(empty.length === 0, 'D3 only EMPTY SET -> reads nothing (an explicit request for no tables)',
    'got ' + empty.length);

  // D4 is the one that matters. A caller that misspells a key must not quietly get a read that is missing a
  // source it believes it asked for - that is a silent wrong answer, which is worse than a loud failure.
  var threw = null, got = null;
  try { got = E.KMPS.tablesFor({ only: ['marketplaces', 'markeplaces'] }); } catch (e) { threw = e; }
  ok(threw !== null, 'D4 only with an UNKNOWN key -> refused, never silently dropped',
    threw ? '' : 'returned ' + JSON.stringify((got || []).map(function (e) { return e.key; })));
  ok(threw && /markeplaces/.test(String(threw.message)), 'D4 the refusal names the offending key',
    threw ? String(threw.message).slice(0, 90) : '(did not throw)');

  var r = readVia('persheet', tbl, tz, { config: { only: ['marketplaces'] } });
  ok(Object.keys(r.out.snapshots).length === 1 && r.out.snapshots.marketplaces,
    'D5 readCanonicalSnapshots honours only: one table read',
    JSON.stringify(Object.keys(r.out.snapshots)));
  ok(r.stats.sheetReads === 1, 'D5 and exactly one sheet was actually touched', 'reads=' + r.stats.sheetReads);
})();

// ===========================================================================================================
section('E  equivalence that asserts the EXPECTED answer first');
// ===========================================================================================================
// Two paths that are both BLOCKED for the same reason are equal and prove nothing. So every case below
// states what the baseline must produce - success or a named refusal, and a real number - and only then
// compares the transports.
var WAS = function (tables, tz, opts) { return runHandler('persheet', tables, tz, opts); };
var NOW = function (tables, tz, opts) { return runHandler('batch', tables, tz, opts); };

// Every case states what the baseline must ANSWER before the transports are compared. A case whose
// expectation is only "the two agree" is satisfied by two identical failures, and two identical failures
// are what a broken read produces - so the expectation is a real number, or a named refusal, or both.
var E_CASES = [
  { name: 'E1 sales_driven US', o: {},
    expect: { unblocked: true, avg: 10 } },
  { name: 'E2 forecast_driven US', o: { model: 'forecast_driven' },
    expect: { unblocked: true, avg: 10 } },
  // The WAREHOUSE lane resolves a real run-rate and is then REFUSED for a different, named reason: this
  // fixture carries no required-by date. Both halves are asserted, because asserting only the refusal
  // would let a transport that destroyed the sales basis pass.
  { name: 'E3 WAREHOUSE lane', o: { mktFm: 'self_fulfilled' },
    expect: { avg: 10, everyBlockedReason: 'MISSING_REQUIRED_BY_DATE' } },
  // EU as a SCOPE is not a country: the run-rate source cannot be identified for it and the column
  // fail-closes by name rather than inventing a rate. That is the shipped behaviour, so it is the
  // expectation - and E4b proves the European path can still produce a real number when the scope is a
  // member market, so E4a is not quietly accepting a broken read.
  { name: 'E4a EU scope refuses by name', o: { country: 'EU' },
    expect: { unblocked: true, avg: null, basisQualityError: 'SALES_BASIS_UNAVAILABLE' } },
  { name: 'E4b European member market resolves', o: { country: 'DE' },
    expect: { unblocked: true, avg: 10, basisQualityError: null } },
  { name: 'E5 legitimate zero selling days', o: { zeroDays: true },
    expect: { unblocked: true, avgNot: null } },
  { name: 'E6 hybrid: blank SKU model is REFUSED', o: { mktFm: 'hybrid',
      skus: [['CO1', 'S1', 'platform_fulfilled'], ['CO3', 'S3', '']] },
    expect: { someBlockedReason: 'DESTINATION_AUTHORITY_UNRESOLVED' } },
  { name: 'E7 no marketplaces row is REFUSED', o: { dropSheets: ['marketplaces'] },
    expect: { someBlockedReason: 'DESTINATION_AUTHORITY_UNRESOLVED' } }
];

function checkExpect(la, x) {
  var bad = [];
  if (!la.length) { bad.push('baseline produced NO lines'); return bad; }
  var avgs = la.map(function (l) { return l.horizonBasis ? l.horizonBasis.avgSalesPerDay : undefined; });
  var errs = la.map(function (l) { return l.horizonBasis ? l.horizonBasis.basisQualityError : undefined; });
  if (x.unblocked === true && la.some(function (l) { return l.blocked; })) {
    bad.push('expected every line unblocked, got ' + JSON.stringify(la.map(function (l) { return l.blockedReason; })));
  }
  if (x.avg !== undefined && avgs.some(function (v) { return v !== x.avg; })) {
    bad.push('expected avgSalesPerDay=' + x.avg + ', got ' + JSON.stringify(avgs));
  }
  if (x.avgNot !== undefined && avgs.some(function (v) { return v === x.avgNot; })) {
    bad.push('expected a real avg, got ' + JSON.stringify(avgs));
  }
  if (x.basisQualityError !== undefined && errs.some(function (v) { return v !== x.basisQualityError; })) {
    bad.push('expected basisQualityError=' + JSON.stringify(x.basisQualityError) + ', got ' + JSON.stringify(errs));
  }
  if (x.everyBlockedReason && la.some(function (l) { return l.blockedReason !== x.everyBlockedReason; })) {
    bad.push('expected every line blocked with ' + x.everyBlockedReason
      + ', got ' + JSON.stringify(la.map(function (l) { return l.blockedReason; })));
  }
  if (x.someBlockedReason && !la.some(function (l) { return l.blockedReason === x.someBlockedReason; })) {
    bad.push('expected some line blocked with ' + x.someBlockedReason
      + ', got ' + JSON.stringify(la.map(function (l) { return l.blockedReason; })));
  }
  return bad;
}

E_CASES.forEach(function (c) {
  var tz = TZ, tbl = baseTables(tz, c.o);
  var a = WAS(tbl, tz, c.o);
  var bad = checkExpect(linesOf(a), c.expect);
  ok(bad.length === 0, c.name + ' - baseline produces the EXPECTED answer', bad.join('; '));
  if (bad.length) return;
  var b = NOW(tbl, tz, c.o);
  var d = deepDiff(businessView(b.env), businessView(a.env));
  ok(d === null, c.name + ' - batch transport returns the identical business answer', String(d));
  // and the batch really did batch, otherwise the comparison above compared one transport with itself
  var m = b.env && b.env.meta && b.env.meta.canonicalRead;
  ok(m && m.mode === 'BATCH' && m.remoteCalls === 2,
    c.name + ' - [vacuity guard] the second run really used the batch transport',
    JSON.stringify(m && { mode: m.mode, remoteCalls: m.remoteCalls }));
});

// E8/E9 - production has 50_ loaded, so the allocation-rule snapshot is REPLACED by the Script-Property
// blob. Skipping that sheet read is only safe under exactly that condition, so both conditions are run.
(function () {
  var tz = TZ, tbl = baseTables(tz, { mktFm: 'self_fulfilled' });
  var blob = function () {
    return { headers: ['allocation_rule_id', 'company', 'country', 'marketplace', 'destination_warehouse_id',
      'forecast_allocation_ratio', 'sales_allocation_ratio', 'status', 'effective_from', 'effective_to'],
      rows: [['R1', CO, CN, MK, 'WH-A', 1, 1, 'active', '', '']] };
  };
  var withOverride = { globals: { warehouseAllocationSnapshot_: blob }, mktFm: 'self_fulfilled' };
  var a = runHandler('persheet', tbl, tz, withOverride);
  var b = runHandler('batch', tbl, tz, withOverride);
  var la = linesOf(a);
  ok(la.length > 0 && la.every(function (l) { return l.horizonBasis && l.horizonBasis.avgSalesPerDay === 10; }),
    'E8 with 50_ override: baseline produces lines carrying a real run-rate',
    'lines=' + la.length + ' avg=' + JSON.stringify(la.map(function (l) { return l.horizonBasis && l.horizonBasis.avgSalesPerDay; })));

  // The ONE intentional difference, asserted rather than tolerated: the retired allocation-rule Sheet is
  // not read when the config blob is going to replace it, so the diagnostic count is one lower. It is a
  // count of what was read, so reporting 21 here would be the inaccurate answer.
  var ta = a.env.meta.tablesRead, tb = b.env.meta.tablesRead;
  ok(ta === 21 && tb === 20, 'E8 tablesRead 21 -> 20: the retired allocation-rule sheet is not read',
    'per-sheet=' + ta + ' batch=' + tb);
  var va = businessView(a.env), vb = businessView(b.env);
  delete va.meta.tablesRead; delete vb.meta.tablesRead;
  ok(deepDiff(vb, va) === null, 'E8 with 50_ override: everything else identical', String(deepDiff(vb, va)));

  var a2 = runHandler('persheet', tbl, tz, { mktFm: 'self_fulfilled' });
  var b2 = runHandler('batch', tbl, tz, { mktFm: 'self_fulfilled' });
  ok(b2.env.meta.tablesRead === 21,
    'E9 without 50_ override: the sheet IS read, because nothing will replace it', 'tablesRead=' + b2.env.meta.tablesRead);
  ok(deepDiff(businessView(b2.env), businessView(a2.env)) === null,
    'E9 without 50_ override: transports identical',
    String(deepDiff(businessView(b2.env), businessView(a2.env))));
})();

// ===========================================================================================================
section('F  the 43_ injected pre-read still wins');
// ===========================================================================================================
(function () {
  var tz = TZ, tbl = baseTables(tz, {});
  var calls = { pre: 0 };
  var r = runHandler('batch', tbl, tz, {
    injectPreRead: function (E, ss) {
      return function (s) { calls.pre++; return E.KMPS.readCanonicalSnapshots(s, null); };
    }
  });
  ok(calls.pre === 1, 'F1 an injected io.readCanonicalSnapshots is used, exactly once', 'calls=' + calls.pre);
  ok(r.stats.remoteCalls === 0, 'F2 the injected pre-read makes NO advanced-service call',
    'remoteCalls=' + r.stats.remoteCalls);
  var base = runHandler('persheet', tbl, tz);
  ok(deepDiff(r.env, base.env) === null, 'F3 and its answer is unchanged', String(deepDiff(r.env, base.env)));
})();


// ===========================================================================================================
section('G  bounded diagnostics: which transport ran, and what it cost');
// ===========================================================================================================
(function () {
  var tz = TZ, tbl = baseTables(tz, {});

  var b = runHandler('batch', tbl, tz);
  var m = b.env.meta.canonicalRead;
  ok(!!m, 'G1 the response carries a canonicalRead block');
  ok(m.mode === 'BATCH', 'G1 mode names the transport', 'mode=' + m.mode);
  ok(m.remoteCalls === 2, 'G1 two remote calls, not twenty-one', 'remoteCalls=' + m.remoteCalls);
  ok(m.perSheetReads === 9, 'G1 the nine undeclared tables still go per sheet', 'perSheetReads=' + m.perSheetReads);
  ok(m.fallback === null, 'G1 no fallback on the happy path');

  // BOUNDED: a fixed key set that does not grow with the registry. A diagnostic that grows per table is a
  // log, and a log does not belong in every response.
  var keys = Object.keys(m).sort().join(',');
  ok(keys === 'afterReadMs,fallback,mode,normalizeMs,notBatchedReason,perSheetReads,readMs,remoteCalls,tables',
    'G2 the diagnostic has a FIXED, bounded key set', keys);
  ok(typeof m.readMs === 'number' && typeof m.normalizeMs === 'number' && typeof m.afterReadMs === 'number',
    'G2 read / normalize / after-read are reported separately',
    JSON.stringify({ readMs: m.readMs, normalizeMs: m.normalizeMs, afterReadMs: m.afterReadMs }));
  // CP2V-R3 - the name is the assertion. `afterReadMs` is serverDurationMs minus the canonical read, and it
  // contains every other I/O the handler performs - Script Property lookups, openTarget, the allocation
  // config blob - so a key called computeMs would invite a reader to blame the calculation for a cost that
  // may be another read entirely.
  ok(!('computeMs' in m), 'G2 and nothing in it claims to be pure computation time');
  ok(m.notBatchedReason === null, 'G2 a BATCH read has no not-batched reason', JSON.stringify(m.notBatchedReason));

  // PER_SHEET is named too, so "never batched" is visible in production instead of merely slow.
  var p = runHandler('persheet', tbl, tz);
  ok(p.env.meta.canonicalRead.mode === 'INJECTED' || p.env.meta.canonicalRead.mode === 'PER_SHEET',
    'G3 a non-batch read is named rather than left blank', 'mode=' + p.env.meta.canonicalRead.mode);

  // G3a - WHY it did not batch, which is the difference between a report and an instruction. Each of these
  // is a different repair, and from outside they used to look identical.
  var WHY = [
    ['no advanced service', function () { return makeEnv(undefined); }, 'ADVANCED_SHEETS_SERVICE_UNAVAILABLE'],
    ['spreadsheet has no timezone', function () { return makeEnv(makeSheets(tbl, tz, { sheetReads: 0, remoteCalls: 0 })); }, 'SPREADSHEET_TIMEZONE_UNAVAILABLE']
  ];
  (function () {
    var st = { sheetReads: 0, remoteCalls: 0 };
    var r1 = makeEnv(undefined).canonical(makeSs(tbl, tz, st), ZERO);
    ok(r1.profile.mode === 'PER_SHEET' && r1.profile.notBatchedReason === 'ADVANCED_SHEETS_SERVICE_UNAVAILABLE',
      'G3a no advanced service -> PER_SHEET names that prerequisite',
      JSON.stringify({ mode: r1.profile.mode, why: r1.profile.notBatchedReason }));

    // A spreadsheet that cannot report its timezone: the serial conversion has no provable zone, so the
    // batch is declined rather than guessed at.
    var st2 = { sheetReads: 0, remoteCalls: 0 };
    var ssNoTz = makeSs(tbl, tz, st2);
    ssNoTz.getSpreadsheetTimeZone = function () { return null; };
    var r2 = makeEnv(makeSheets(tbl, tz, st2)).canonical(ssNoTz, ZERO);
    ok(r2.profile.mode === 'PER_SHEET' && r2.profile.notBatchedReason === 'SPREADSHEET_TIMEZONE_UNAVAILABLE',
      'G3a no spreadsheet timezone -> PER_SHEET names THAT prerequisite instead',
      JSON.stringify({ mode: r2.profile.mode, why: r2.profile.notBatchedReason }));
    ok(Object.keys(r2.snapshots).length === 21, 'G3a and it still answers, from the full read',
      'tables=' + Object.keys(r2.snapshots).length);
  })();

  // G3b - an INJECTED pre-read is not a failure to batch, and says so distinctly.
  (function () {
    var inj = runHandler('batch', tbl, tz, {
      injectPreRead: function (E, ss) { return function (x) { return E.KMPS.readCanonicalSnapshots(x, null); }; }
    });
    var mi = inj.env.meta.canonicalRead;
    ok(mi.mode === 'INJECTED' && mi.notBatchedReason === 'PRE_READ_INJECTED',
      'G3b an injected pre-read is reported as INJECTED, not as a failed batch',
      JSON.stringify({ mode: mi.mode, why: mi.notBatchedReason }));
  })();

  // FALLBACK is never silent, and its cost is reported as cost.
  var quota = function () { throw new Error('Service invoked too many times: quota exceeded'); };
  var E = makeEnv({ Spreadsheets: { get: quota, Values: { batchGet: quota } } });
  var ss = makeSs(tbl, tz, { sheetReads: 0, remoteCalls: 0 });
  var r = E.canonical(ss, ZERO);
  ok(r.profile.mode === 'FALLBACK', 'G4 a transient fault reports mode=FALLBACK', 'mode=' + r.profile.mode);
  ok(r.profile.fallback && r.profile.fallback.reason === 'SHEETS_QUOTA_EXCEEDED',
    'G4 and names the reason', JSON.stringify(r.profile.fallback));
  ok(Object.keys(r.snapshots).length === 21, 'G4 and still answers, from the full read',
    'tables=' + Object.keys(r.snapshots).length);
  ok(r.profile.fallback.count === 1 && r.profile.fallback.max === 1,
    'G5 the fallback is COUNTED and CAPPED', JSON.stringify(r.profile.fallback));
  ok(Object.prototype.hasOwnProperty.call(r.profile.fallback, 'batchMsWasted'),
    'G5 and the wasted batch attempt is reported as cost - a fallback request is SLOWER than the old path');

  // The cap holds: a second transient fault in the same execution refuses instead of paying twice again.
  var r2 = null, t2 = null;
  try { r2 = E.canonical(makeSs(tbl, tz, { sheetReads: 0, remoteCalls: 0 }), ZERO); } catch (e) { t2 = e; }
  ok(t2 && t2.apiCode === 'CANONICAL_BATCH_FALLBACK_EXHAUSTED',
    'G6 a SECOND fallback in one execution is refused by name, not paid for again',
    t2 ? ('code=' + t2.apiCode) : 'did not throw');
})();


// ===========================================================================================================
section('H  a malformed METADATA reply is a named refusal, not twelve missing tables');
// ===========================================================================================================
// THE FAULT THIS SECTION EXISTS FOR. Call 1 answers one question - which sheets exist, and how wide. The
// reader turned that answer into a `present` map and then treated any table absent from it as
// SOURCE_NOT_AVAILABLE. So a reply that could not be READ produced the same result as a reply that said the
// sheet is GONE: twelve canonical tables reported missing, the handler continuing on the other nine, and a
// business answer computed from a source list nobody could vouch for. "I could not read the catalogue" and
// "the catalogue says this is not there" are different facts and only the second is a finding.
var META_FAULTS = [
  ['H1 meta is null', function () { return null; }],
  ['H2 meta has no sheets key', function () { return {}; }],
  ['H3 meta.sheets is null', function () { return { sheets: null }; }],
  ['H4 meta.sheets is not an array', function () { return { sheets: { 0: { properties: { title: 'x' } } } }; }],
  ['H5 meta.sheets is empty', function () { return { sheets: [] }; }],
  ['H6 an entry is null', function (m) { var c = { sheets: m.sheets.slice() }; c.sheets[0] = null; return c; }],
  ['H7 an entry has no properties', function (m) { var c = { sheets: m.sheets.slice() }; c.sheets[1] = {}; return c; }],
  ['H8 an entry has a blank title', function (m) {
    var c = { sheets: m.sheets.slice() };
    c.sheets[2] = { properties: { title: '', gridProperties: { columnCount: 3 } } };
    return c; }]
];
META_FAULTS.forEach(function (f) {
  var tz = TZ, tbl = baseTables(tz, {});
  var r = readVia('batch', tbl, tz, { mangleMeta: f[1] });
  var refused = !!r.thrown;
  var named = refused && !!(r.thrown.apiCode || r.thrown.safetyToken);
  var missingCount = refused ? null
    : (r.out.issues || []).filter(function (i) { return i.reason === 'SOURCE_NOT_AVAILABLE'; }).length;
  ok(refused, f[0] + ' -> refused',
    refused ? '' : 'NOT refused; reported ' + missingCount + ' tables as SOURCE_NOT_AVAILABLE');
  ok(named, f[0] + ' -> carries a NAMED code',
    refused ? ('code=' + (r.thrown.apiCode || r.thrown.safetyToken)) : '(not refused)');
});

// H9 - NON-VACUITY, and it is the assertion that keeps H1..H8 honest. A WELL-FORMED catalogue that simply
// does not list an optional sheet must still produce SOURCE_NOT_AVAILABLE for exactly that sheet. Without
// this, "refuse on anything unexpected" would pass H1..H8 while destroying the ability to report a genuinely
// absent table.
(function () {
  var tz = TZ, tbl = baseTables(tz, {});
  var dropped = 'fc_target_rules';
  assertBatched(dropped, 'H9');
  var r = readVia('batch', tbl, tz, {
    mangleMeta: function (m) {
      return { sheets: m.sheets.filter(function (e) { return e.properties.title !== dropped; }) };
    }
  });
  ok(!r.thrown, 'H9 a well-formed catalogue missing ONE optional sheet does not refuse',
    r.thrown ? String(r.thrown.message).slice(0, 70) : '');
  var iss = r.thrown ? [] : (r.out.issues || []).filter(function (i) { return i.sourceType === 'fcTargetRules'; });
  ok(iss.length === 1 && iss[0].reason === 'SOURCE_NOT_AVAILABLE',
    'H9 and reports exactly that sheet as SOURCE_NOT_AVAILABLE', JSON.stringify(iss));
  var others = r.thrown ? [] : (r.out.issues || []).filter(function (i) { return i.reason === 'SOURCE_NOT_AVAILABLE'; });
  ok(others.length === 1, 'H9 and does NOT condemn the other eleven batched tables', 'count=' + others.length);
})();

// H10 - and the refusal survives the real handler under its own name.
(function () {
  var tz = TZ, tbl = baseTables(tz, {});
  var h = runHandler('batch', tbl, tz, { mangleMeta: function () { return { sheets: null }; } });
  var errs = errsOf(h);
  ok(errs.length > 0 && errs[0].code !== 'INTERNAL_ERROR',
    'H10 the metadata refusal reaches the envelope under its own name', 'code=' + (errs[0] && errs[0].code));
  ok(!(h.env && h.env.success === true), 'H10 and the handler does not answer success');
})();

// ===========================================================================================================
section('I  a sheet with USED ROWS but nothing in them keeps the old reader\'s answer');
// ===========================================================================================================
// getDataRange() on a sheet whose only row is blank returns [['','','']] - a PRESENT table with blank headers
// and no data rows, raising NO issue. batchGet returns no `values` for the same sheet, which is also what a
// sheet with NO used rows looks like. Collapsing the two turns a present-but-empty table into a MISSING one,
// and MISSING is a source issue a consumer can fail closed on.
(function () {
  var tz = TZ, A_TBL = 'fc_target_rules', A_KEY = 'fcTargetRules';
  assertBatched(A_TBL, 'I0');

  // I1 - the header row exists and every cell in it is blank. No data rows.
  var t1 = baseTables(tz, {});
  t1[A_TBL] = T(['', '', ''], []);
  var a1 = readVia('persheet', t1, tz), b1 = readVia('batch', t1, tz);
  ok(a1.out.snapshots[A_KEY] !== undefined,
    'I1 old reader: a used-but-blank row is a PRESENT table', JSON.stringify(a1.out.snapshots[A_KEY]));
  ok((a1.out.issues || []).filter(function (i) { return i.sourceType === A_KEY; }).length === 0,
    'I1 old reader: and raises NO issue');
  var d1 = deepDiff(b1.out.snapshots[A_KEY], a1.out.snapshots[A_KEY]);
  ok(d1 === null, 'I1 batch reader: identical snapshot', String(d1));
  var bi1 = (b1.out.issues || []).filter(function (i) { return i.sourceType === A_KEY; });
  ok(bi1.length === 0, 'I1 batch reader: and raises NO issue either', JSON.stringify(bi1));

  // I2 - the same shape produced by a FORMULA returning the empty string: the cell holds '', the sheet
  // counts the row as used, and the wire cannot tell it from a blank.
  var t2 = baseTables(tz, {});
  t2[A_TBL] = T(['', ''], [['', '']]);
  var a2 = readVia('persheet', t2, tz), b2 = readVia('batch', t2, tz);
  var d2 = deepDiff(b2.out.snapshots[A_KEY], a2.out.snapshots[A_KEY]);
  ok(d2 === null, 'I2 a formula-empty header AND a formula-empty data row survive identically', String(d2));

  // I3 - and a sheet with genuinely NO used rows is still MISSING_SNAPSHOT. The repair must not convert
  // every empty table into a present one; that would be the same collapse in the other direction.
  var t3 = baseTables(tz, { emptySheets: [A_TBL] });
  var a3 = readVia('persheet', t3, tz), b3 = readVia('batch', t3, tz);
  var ia3 = (a3.out.issues || []).filter(function (i) { return i.sourceType === A_KEY; });
  var ib3 = (b3.out.issues || []).filter(function (i) { return i.sourceType === A_KEY; });
  ok(ia3.length === 1 && ia3[0].reason === 'MISSING_SNAPSHOT', 'I3 old reader: no used rows -> MISSING_SNAPSHOT');
  ok(deepDiff(ib3, ia3) === null, 'I3 batch reader: same', String(deepDiff(ib3, ia3)));
  ok(b3.out.snapshots[A_KEY] === undefined, 'I3 and still contributes no snapshots key');

  // I4 - THE PROBE IS BOUNDED. The repair is allowed to touch a sheet that came back empty; it is NOT
  // allowed to become a per-table read, which would hand back the twenty-one-sheet cost it just removed.
  var tz4 = TZ, t4 = baseTables(tz4, {});
  var st4 = { sheetReads: 0, remoteCalls: 0 };
  var E4 = makeEnv(makeSheets(t4, tz4, st4), undefined);
  E4.canonical(makeSs(t4, tz4, st4), ZERO);
  ok(st4.remoteCalls === 2, 'I4 a healthy read still costs exactly two remote calls', 'remote=' + st4.remoteCalls);
  ok(st4.sheetReads === 9, 'I4 and exactly nine per-sheet reads - the probe adds NONE when nothing is empty',
    'sheetReads=' + st4.sheetReads);

  var t5 = baseTables(tz4, {});
  t5[A_TBL] = T(['', ''], []);
  var st5 = { sheetReads: 0, remoteCalls: 0 };
  var E5 = makeEnv(makeSheets(t5, tz4, st5), undefined);
  E5.canonical(makeSs(t5, tz4, st5), ZERO);
  ok(st5.sheetReads === 10, 'I4 one blank-but-used table costs exactly ONE extra read, not twelve',
    'sheetReads=' + st5.sheetReads);
})();

// ===========================================================================================================
section('J  the EU ROLL-UP succeeds, and the roll-up is what is compared');
// ===========================================================================================================
// EU is a planning REGION, not a country: KMCID.sourceCountriesForScope('EU','Amazon') is IT+DE+ES+FR and
// the sales snapshot is keyed by MEMBER. §E4a pins the refusal when no member rows exist and §E4b pins a
// single member market, but neither of those exercises the AGGREGATION - which is the one thing an EU scope
// does that no other scope does, and therefore the one thing a transport change could break unnoticed.
(function () {
  var tz = TZ;
  var MEMBERS = ['IT', 'DE', 'ES', 'FR'];
  var euOpts = { country: 'EU', salesCountries: MEMBERS };
  var tbl = baseTables(tz, euOpts);

  var a = runHandler('persheet', tbl, tz, euOpts);
  var la = linesOf(a);
  ok(la.length > 0, 'J1 EU scope produces lines', 'lines=' + la.length);
  var hb = la[0] && la[0].horizonBasis;
  ok(hb && hb.basisQualityError === null,
    'J1 and the basis RESOLVES - this is the success case, not the refusal one',
    JSON.stringify(hb && hb.basisQualityError));
  // Each of four members contributes 10 units a day, so the region's run-rate is their SUM.
  ok(hb && hb.avgSalesPerDay === 40,
    'J2 the EU rate is the SUM over IT+DE+ES+FR (4 x 10), not one member and not an average of members',
    JSON.stringify(hb && hb.avgSalesPerDay));

  // NON-VACUITY: one member alone must give 10. Without this, a transport that silently dropped three
  // members could still satisfy J2 if the fixture happened to carry four times the units on one row.
  var one = { country: 'EU', salesCountries: ['DE'] };
  var aOne = runHandler('persheet', baseTables(tz, one), tz, one);
  var hbOne = linesOf(aOne)[0] && linesOf(aOne)[0].horizonBasis;
  ok(hbOne && hbOne.avgSalesPerDay === 10,
    'J2 (non-vacuity) a single member inside the EU scope gives 10, so 40 really is the aggregate',
    JSON.stringify(hbOne && hbOne.avgSalesPerDay));

  // J3 - and the transports agree on the AGGREGATED answer.
  var b = runHandler('batch', tbl, tz, euOpts);
  ok(deepDiff(businessView(b.env), businessView(a.env)) === null,
    'J3 batch transport returns the identical EU roll-up',
    String(deepDiff(businessView(b.env), businessView(a.env))));
  var m = b.env && b.env.meta && b.env.meta.canonicalRead;
  ok(m && m.mode === 'BATCH', 'J3 [vacuity guard] and it really used the batch transport',
    JSON.stringify(m && m.mode));

  // J4 - a member market OUTSIDE the set must not leak into the region's rate.
  var withOutsider = { country: 'EU', salesCountries: MEMBERS.concat(['US']) };
  var aOut = runHandler('persheet', baseTables(tz, withOutsider), tz, withOutsider);
  var hbOut = linesOf(aOut)[0] && linesOf(aOut)[0].horizonBasis;
  ok(hbOut && hbOut.avgSalesPerDay === 40,
    'J4 a US row does not join the EU roll-up - membership is the filter, not presence',
    JSON.stringify(hbOut && hbOut.avgSalesPerDay));
  var bOut = runHandler('batch', baseTables(tz, withOutsider), tz, withOutsider);
  ok(deepDiff(businessView(bOut.env), businessView(aOut.env)) === null,
    'J4 and the transports agree on that too',
    String(deepDiff(businessView(bOut.env), businessView(aOut.env))));
})();

console.log('\n----------------------------------------');
console.log('IR CANONICAL BATCH READ BOUNDARIES (S8-B3-R3-CP2V-R2): ' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
