// F1-7N-FB-4F-B4 — TWO-COLUMN APPEND MIGRATION TOOLING.
//
// B3 taught the runtime both columns before they exist. B4 is the tool that finally appends them — exactly two
// blank header cells, and nothing else:
//
//     shipping_allocation_drafts!AI1      = destination_marketplace   (index 34, column 35)
//     shipping_allocation_draft_lines!AE1 = expected_arrival          (index 30, column 31)
//
// THIS SUITE EXECUTES THE MIGRATION. Nothing here describes the tool — it runs the real
// TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN() and TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT() against an
// in-memory spreadsheet and inspects the CELLS afterwards. The schema rules come from the shipped runtime
// authority in 16_shipping_allocation_handlers.gs, loaded whole, because a tool that carries its own copy of
// the schema is a tool that can disagree with production.
//
// Run: node assets/tests/allocation-two-column-append-migration-f1-7n-fb-4f-b4.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var GS = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
var TOOLS_MIG = path.join(ROOT, 'assets', 'tools', 'apps-script-migrations');
var TOOLS_DIAG = path.join(ROOT, 'assets', 'tools', 'apps-script-diagnostics');
var TOOL_FILE = 'TEMP_shipping_allocation_schema_b4_append.gs';

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
    var A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// Every source is normalized to LF on the way in. This repository mixes line endings and core.autocrlf rewrites
// the working copy on checkout, so an anchor written with a bare \n matches NOTHING on a machine that checked
// the file out the other way — the defect that silently disarmed six of B1's mutation tests.
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }
function readGs(f) { return lf(fs.readFileSync(path.join(GS, f), 'utf8')); }

// A mutation that changed nothing is not a passing test, it is an absent one.
function swap(src, from, to) {
    if (src.indexOf(from) === -1) throw new Error('mutation anchor ABSENT: ' + from.slice(0, 80));
    var out = src.split(from).join(to);
    if (out === src) throw new Error('mutation changed NOTHING: ' + from.slice(0, 80));
    return out;
}

var SAD = readGs('16_shipping_allocation_handlers.gs');
var HEALTH = readGs('63_api_v1_system_health.gs');
var ROUTER = readGs('01_router.gs');
var TOOL = lf(fs.readFileSync(path.join(TOOLS_MIG, TOOL_FILE), 'utf8'));

// ==============================================================================================================
// THE IN-MEMORY SPREADSHEET — the only thing simulated. It is WRITABLE, because the whole point of this suite
// is to run the writer and then look at the cells.
// ==============================================================================================================
function makeEnv(toolSrc, opts) {
    opts = opts || {};
    var SHEETS = {};
    var events = { logs: [], lockTries: 0, flushes: 0, released: 0 };
    var sandbox = {
        String: String, Object: Object, Math: Math, Number: Number, JSON: JSON, Array: Array, Date: Date,
        isNaN: isNaN, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat, RegExp: RegExp,
        Boolean: Boolean, Error: Error, console: console
    };
    sandbox.globalThis = sandbox;

    function FakeSheet(name, grid) {
        this.name = name;
        this.grid = grid.map(function (r) { return r.slice(); });
        this.maxCols = this.grid.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
        this.pad();
        this.failSetValueAt = null;   // 'r,c' -> throw
        this.silentSetValueAt = null; // 'r,c' -> accept and discard, so the read-back must catch it
    }
    FakeSheet.prototype.pad = function () {
        var self = this;
        this.grid.forEach(function (r) { while (r.length < self.maxCols) r.push(''); });
    };
    FakeSheet.prototype.getName = function () { return this.name; };
    FakeSheet.prototype.getMaxColumns = function () { return this.maxCols; };
    FakeSheet.prototype.getLastRow = function () { return this.grid.length; };
    FakeSheet.prototype.getLastColumn = function () { return this.maxCols; };
    FakeSheet.prototype.insertColumnsAfter = function (after, n) {
        this.maxCols = Math.max(this.maxCols, after + n);
        this.pad();
    };
    FakeSheet.prototype.getDataRange = function () {
        var self = this;
        return { getValues: function () { return self.grid.map(function (r) { return r.slice(); }); } };
    };
    FakeSheet.prototype.getRange = function (row, col, nr, nc) {
        var self = this;
        return {
            getValues: function () {
                var out = [];
                for (var i = 0; i < (nr || 1); i++) {
                    var line = [];
                    for (var j = 0; j < (nc || 1); j++) {
                        var r = self.grid[row - 1 + i] || [];
                        line.push(r[col - 1 + j] === undefined ? '' : r[col - 1 + j]);
                    }
                    out.push(line);
                }
                return out;
            },
            getValue: function () {
                var r = self.grid[row - 1] || [];
                return r[col - 1] === undefined ? '' : r[col - 1];
            },
            setValue: function (v) {
                var key = row + ',' + col;
                if (self.failSetValueAt === key) throw new Error('simulated write failure at ' + key);
                if (self.silentSetValueAt === key) return;             // accepted, discarded
                while (self.grid.length < row) self.grid.push(new Array(self.maxCols).join(',').split(','));
                self.maxCols = Math.max(self.maxCols, col);
                self.pad();
                self.grid[row - 1][col - 1] = v;
            }
        };
    };

    sandbox.SpreadsheetApp = {
        openById: function (id) {
            if (id !== 'DB-EXPECTED') throw new Error('wrong spreadsheet id: ' + id);
            return { getSheetByName: function (n) { return SHEETS[n] || null; } };
        },
        getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return SHEETS[n] || null; } }; },
        flush: function () { events.flushes++; }
    };
    sandbox.LockService = {
        getScriptLock: function () {
            return {
                tryLock: function () {
                    events.lockTries++;
                    if (typeof opts.onLock === 'function') opts.onLock(SHEETS, events);
                    return opts.lockFails ? false : true;
                },
                releaseLock: function () { events.released++; }
            };
        }
    };
    sandbox.Logger = {
        log: function (m) {
            events.logs.push(String(m));
            if (typeof opts.onLog === 'function') opts.onLog(String(m));
        }
    };
    sandbox.Utilities = { getUuid: function () { return 'UUID000000000000'; } };
    sandbox.Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
    sandbox.prodExpectedDbId_ = function () { return 'DB-EXPECTED'; };
    sandbox.prodRequireSheet_ = function (ss, name) { return SHEETS[name]; };
    sandbox.procurementTimestamp_ = function () { return '2026-09-01 09:00:00'; };
    sandbox.procurementNum_ = function (v) { var n = Number(v); return isFinite(n) ? n : ''; };
    sandbox.jsonResponse_ = function (o) { return o; };

    var ctx = vm.createContext(sandbox);
    vm.runInContext([opts.sadSrc || SAD, toolSrc || TOOL].join('\n'), ctx);

    var env = {
        ctx: ctx, sandbox: sandbox, SHEETS: SHEETS, events: events, FakeSheet: FakeSheet,
        get: function (n) { return vm.runInContext(n, ctx); },
        mountGrid: function (name, grid) { SHEETS[name] = new FakeSheet(name, grid); return SHEETS[name]; },
        dry: function () { return vm.runInContext('TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN()', ctx); },
        commit: function () { return vm.runInContext('TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT()', ctx); },
        setReviewed: function (v) { sandbox.__rv = v; vm.runInContext('TEMP_B4_REVIEWED_CHECKSUM_ = __rv;', ctx); },
        // The header row AS EVERY READER IN THIS STACK SEES IT: trailing blanks are Google Sheets' empty grid,
        // not schema. Comparing the raw padded row would test the fake spreadsheet instead of the migration.
        headers: function (name) {
            var h = SHEETS[name].grid[0].map(function (v) { return String(v === undefined || v === null ? '' : v).trim(); });
            while (h.length && h[h.length - 1] === '') h.pop();
            return h;
        },
        gridOf: function (name) { return SHEETS[name].grid.map(function (r) { return r.slice(); }); }
    };
    // A pre-B3 fixture deliberately has no FULL authority, so these must not throw on the way in.
    function maybe(n) { try { return env.get(n); } catch (e) { return null; } }
    env.HDR = maybe('SHIPPING_ALLOCATION_DRAFTS_HEADERS_');
    env.CANON = maybe('SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_');
    env.FULL = maybe('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_');
    env.LHDR = maybe('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_');
    env.LFULL = maybe('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_');
    return env;
}

// --------------------------------------------------------------------------------------------------- fixtures

// The recorded live shape: 4 draft rows, 6 line rows, planned_qty totalling 1020, every line FK-matched, and
// TWO DISTINCT SEA SERVICES so that "sea did not become sea_express" is a claim about real data.
var DRAFT_IDS = ['SADH-K2-aaa1', 'SADH-K2-bbb2', 'SADH-K3-ccc3', 'SADH-K2-ddd4'];
var SERVICES = ['sea', 'sea_express', 'sea', 'air'];
var LINE_SPEC = [
    { id: 'SADL-1', fk: 0, qty: 200 }, { id: 'SADL-2', fk: 0, qty: 180 },
    { id: 'SADL-3', fk: 1, qty: 150 }, { id: 'SADL-4', fk: 2, qty: 170 },
    { id: 'SADL-5', fk: 3, qty: 160 }, { id: 'SADL-6', fk: 3, qty: 160 }
];

function draftGrid(headers) {
    var g = [headers.slice()];
    DRAFT_IDS.forEach(function (id, i) {
        var r = headers.map(function (h) {
            // Deliberately populated with EVERY plausible backfill temptation, so that "no backfill source is
            // consulted" is proven by the columns staying blank rather than by reading the source.
            if (h === 'allocation_draft_id') return id;
            if (h === 'marketplace') return 'Amazon';
            if (h === 'recommended_shipping_method') return SERVICES[i];
            if (h === 'recommended_destination_warehouse_code_snapshot') return 'US-AMZ-ONT8';
            if (h === 'recommended_destination_warehouse_id') return 'WH-000' + (i + 1);
            if (h === 'status') return 'draft';
            if (h === 'created_at' || h === 'updated_at') return '2026-08-20 10:00:00';
            if (h === 'note') return 'ETA discussed as 2026-10-16';
            return '';
        });
        g.push(r);
    });
    return g;
}
function lineGrid(headers) {
    var g = [headers.slice()];
    LINE_SPEC.forEach(function (s) {
        g.push(headers.map(function (h) {
            if (h === 'allocation_draft_line_id') return s.id;
            if (h === 'allocation_draft_id') return DRAFT_IDS[s.fk];
            if (h === 'planned_qty') return s.qty;
            if (h === 'sku') return 'SKU-' + s.id;
            if (h === 'line_status') return 'draft';
            if (h === 'required_by_date') return '2026-11-01';
            return '';
        }));
    });
    return g;
}

// Mount a chosen stage. `dh`/`lh` are the header rows to use.
function mount(env, dh, lh) {
    env.mountGrid('shipping_allocation_drafts', draftGrid(dh));
    env.mountGrid('shipping_allocation_draft_lines', lineGrid(lh));
}
function fresh(opts, dh, lh) {
    var env = makeEnv(opts && opts.toolSrc, opts || {});
    mount(env, dh || env.CANON, lh || env.LHDR);
    return env;
}

var E0 = makeEnv();
var HDR = E0.HDR, CANON = E0.CANON, FULL = E0.FULL, LHDR = E0.LHDR, LFULL = E0.LFULL;
// F1-7N-FB-4G-A2-R3 - THE STATE THIS MIGRATION PRODUCES, named once.
//
// B4 appends destination_marketplace at 34 and stops there. Until A2-R3 that was also the last column of the
// canonical authority, so `FULL` and "the finished header" were the same array and the suite used FULL for
// both. A2-R3 appends create_idempotency_key at 35 (its own helper's job), so they are now different, and a
// fixture built from FULL represents a sheet this migration never produces.
var POST = FULL ? FULL.slice(0, 35) : FULL;

// The recorded live fingerprints, and the fingerprints the append must produce. These are not decoration: they
// are the values the F1-7N-FB-4F-B4 plan was reviewed against, and the commit must land on them exactly.
var REC = {
    drafts_pre: 'sf:3e83e85c', lines_pre: 'sf:2226df13',
    drafts_post: 'sf:870364de', lines_post: 'sf:122f48c3'
};

function reasons(r) { return (r.blocking_reasons || []).join(' ~ '); }
function has(r, token) { return reasons(r).indexOf(token) !== -1; }

// ==============================================================================================================
section('A — the shape of the tool, and where it is allowed to live');
// ==============================================================================================================
// Test 28 — outside the active Apps Script deployment directory. A migration helper that sits in the deployment
// owner directory is a helper that gets deployed, and this one is meant to be pasted, run and removed.
ok(fs.existsSync(path.join(TOOLS_MIG, TOOL_FILE)), 'A1 [test 28] the helper exists in assets/tools/apps-script-migrations/');
ok(!fs.existsSync(path.join(GS, TOOL_FILE)), 'A2 [test 28] and NOT in assets/specs/active/apps-script/');
(function () {
    // Nothing in the deployment directory may reference it, in either direction.
    var leaked = fs.readdirSync(GS).filter(function (f) {
        if (!/\.gs$/.test(f)) return false;
        var s = lf(fs.readFileSync(path.join(GS, f), 'utf8'));
        return s.indexOf('TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_') !== -1 || s.indexOf('tb4BuildPlan_') !== -1;
    });
    eq(leaked, [], 'A3 [test 28] no deployed file references the B4 helper');
})();
// Both public entry points must be callable from the Run selector, which cannot pass arguments.
ok(/function TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN\(\)/.test(TOOL), 'A4 DRY RUN takes no arguments');
ok(/function TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT\(\)/.test(TOOL), 'A5 COMMIT takes no arguments');
// Test 13 (source half) — the SHIPPED file must have the reviewed checksum blank. A file committed with a live
// checksum already pasted in is a file that commits on first run.
ok(/var TEMP_B4_REVIEWED_CHECKSUM_ = '';/.test(TOOL), 'A6 [test 13] the shipped constant is blank');
// The confirmation must not be reachable any other way.
ok(TOOL.indexOf('PropertiesService') === -1, 'A7 no Script Property confirmation — a persisted one outlives its intent');
ok(TOOL.indexOf('TEMP_B4_REVIEWED_CHECKSUM_ ||') === -1, 'A8 no loose fallback for the checksum');
// The operation-specific prefix, distinct from B2's review checksum.
ok(/var TEMP_B4_CHECKSUM_PREFIX_ = 'fb4b4-1';/.test(TOOL), 'A9 the checksum prefix is operation-specific');
ok(TOOL.indexOf("'fb4fb2-1'") === -1, 'A10 and B2\'s prefix is never adopted as this operation\'s');

// ==============================================================================================================
section('B — [tests 1, 27] the recorded 34/30 state proposes exactly two header cells');
// ==============================================================================================================
(function () {
    var env = fresh();
    var d = env.dry();
    eq(d.mode, 'DRY_RUN (READ-ONLY)', 'B1 mode');
    eq(d.read_only, true, 'B2 read-only');
    eq(d.decision, 'MECHANICALLY_SAFE_TO_APPEND', 'B3 [test 1] mechanically safe');
    eq(d.blocking_reasons, [], 'B4 nothing blocking');
    eq(d.proposed_writes.map(function (w) { return w.cell + ' = ' + w.value; }), [
        'shipping_allocation_drafts!AI1 = destination_marketplace',
        'shipping_allocation_draft_lines!AE1 = expected_arrival'
    ], 'B5 [test 1] EXACTLY the two expected cells, and no other');
    eq(d.proposed_writes.length, 2, 'B6 [test 1] two writes');
    eq(d.proposed_writes.map(function (w) { return w.at_index0; }), [34, 30], 'B7 at indexes 34 and 30');
    eq([d.DB_WRITES, d.COLUMNS_APPENDED, d.ROWS_CHANGED], [0, 0, 0], 'B8 DRY RUN wrote nothing');
    // Both table names, header counts, row counts, ordered headers.
    eq(d.tables.map(function (t) { return t.table; }),
        ['shipping_allocation_drafts', 'shipping_allocation_draft_lines'], 'B9 both tables named');
    eq(d.tables.map(function (t) { return t.current_header_count; }), [34, 30], 'B10 current header counts');
    eq(d.tables.map(function (t) { return t.current_row_count; }), [4, 6], 'B11 current row counts');
    eq(d.tables[0].current_headers_ordered, CANON, 'B12 the ordered header row is reported in full');
    eq(d.tables.map(function (t) { return t.expected_post_count; }), [35, 31], 'B13 expected post counts');
    // PRE and proposed POST fingerprints, against the values this plan was reviewed with.
    eq(d.tables.map(function (t) { return t.fingerprint_pre; }), [REC.drafts_pre, REC.lines_pre], 'B14 PRE fingerprints are the recorded live ones');
    eq(d.tables.map(function (t) { return t.fingerprint_post_proposed; }), [REC.drafts_post, REC.lines_post], 'B15 proposed POST fingerprints are the expected ones');
    // Structural cleanliness.
    eq(d.tables.map(function (t) { return t.duplicate_columns.length; }), [0, 0], 'B16 no duplicates');
    eq(d.tables.map(function (t) { return t.case_insensitive_collisions.length; }), [0, 0], 'B17 no case collisions');
    eq(d.tables.map(function (t) { return t.blank_header_indexes; }), [[], []], 'B18 no blank headers');
    eq(d.tables.map(function (t) { return t.first_order_drift_index; }), [-1, -1], 'B19 no order drift');
    // Test 27 — the runtime gate accepts 34/30 now and 35/31 after.
    eq(d.tables.map(function (t) { return t.runtime_gate_before; }), ['ACCEPTED', 'ACCEPTED'], 'B20 [test 27] the runtime gate accepts 34/30 BEFORE');
    eq(d.tables.map(function (t) { return t.runtime_gate_after_proposed; }), ['ACCEPTED', 'ACCEPTED'], 'B21 [test 27] and accepts 35/31 AFTER');
    // The checksum exists, is operation-scoped, and is NOT B2's.
    ok(/^fb4b4-1:[0-9a-f]{8}$/.test(d.confirmation_checksum), 'B22 a well-formed operation-specific checksum');
    ok(d.confirmation_checksum !== 'fb4fb2-1:42a1b1ed', 'B23 and it is not the B2 review checksum');
    eq(d.reviewed_checksum_constant, '(blank — COMMIT will refuse)', 'B24 the blank constant is reported honestly');
    // The recorded comparison, all true against the reviewed state.
    var rc = d.recorded_comparison;
    ok(rc.drafts_fingerprint_matches_recorded && rc.lines_fingerprint_matches_recorded, 'B25 PRE matches the recorded live state');
    ok(rc.drafts_post_matches_expected && rc.lines_post_matches_expected, 'B26 POST matches the expected blank-column state');
    ok(rc.planned_qty_total_matches_recorded && rc.matched_lines_matches_recorded && rc.orphan_lines_matches_recorded,
        'B27 and the quantity/FK census matches 1020 / 6 / 0');
    // Test 26 — the backfill section states zero, and names what it refuses to read.
    eq(d.backfill.rows_to_populate, 0, 'B28 [test 26] zero rows to populate');
    eq(d.backfill.values_written_below_row_1, 0, 'B29 [test 26] zero values below row 1');
    ok(d.backfill.forbidden_sources_none_of_which_are_consulted.indexOf('carrier lead time') !== -1,
        'B30 [test 26] and the forbidden sources are named');
    // The DRY RUN really is read-only: the grids are byte-identical afterwards.
    var env2 = fresh();
    var before = [env2.gridOf('shipping_allocation_drafts'), env2.gridOf('shipping_allocation_draft_lines')];
    env2.dry();
    eq([env2.gridOf('shipping_allocation_drafts'), env2.gridOf('shipping_allocation_draft_lines')], before,
        'B31 the DRY RUN left both grids byte-identical');
})();

// ==============================================================================================================
section('C — [tests 2, 19, 21, 22, 23, 24, 25] the COMMIT, and what it is forbidden to disturb');
// ==============================================================================================================
(function () {
    var env = fresh();
    var d = env.dry();
    var beforeDrafts = env.gridOf('shipping_allocation_drafts');
    var beforeLines = env.gridOf('shipping_allocation_draft_lines');
    env.setReviewed(d.confirmation_checksum);
    var c = env.commit();

    eq(c.state, 'COMMITTED', 'C1 committed');
    eq(c.committed, true, 'C2 committed flag');
    eq(c.blocking_reasons, [], 'C3 nothing blocking');
    eq(c.DB_WRITES, 2, 'C4 exactly two writes');
    eq(c.COLUMNS_APPENDED, 2, 'C5 exactly two columns appended');
    eq(c.ROWS_CHANGED, 0, 'C6 [test 21] zero rows changed');
    eq(c.writes_applied.map(function (w) { return w.cell; }),
        ['shipping_allocation_drafts!AI1', 'shipping_allocation_draft_lines!AE1'], 'C7 the exact two cells');

    // Test 2 — the final state is 35/31, in the canonical order.
    // F1-7N-FB-4G-A2-R3 — compared against the PREFIX this migration produces, not the whole authority. B4
    // appends destination_marketplace at 34 and stops; create_idempotency_key at 35 is the A2-R3 helper's job,
    // so the authority is now longer than anything this tool creates.
    eq(env.headers('shipping_allocation_drafts'), POST,
      'C8 [test 2] the drafts header is exactly the 35-column state THIS migration produces');
    eq(env.headers('shipping_allocation_draft_lines'), LFULL, 'C9 [test 2] the lines header is exactly the 31-column authority');
    eq(env.headers('shipping_allocation_drafts')[34], 'destination_marketplace', 'C10 destination_marketplace at index 34');
    eq(env.headers('shipping_allocation_draft_lines')[30], 'expected_arrival', 'C11 expected_arrival at index 30');
    // It follows the four lifecycle columns, in order.
    eq(env.headers('shipping_allocation_drafts').slice(30, 35),
        ['generation_run_id', 'expired_at', 'expired_by_run_id', 'expiration_reason', 'destination_marketplace'],
        'C12 and it follows the complete lifecycle tail');

    // Test 19 — the commit verifies the final fingerprints against the expected blank-column values.
    eq(c.verification.tables.map(function (t) { return t.fingerprint_after; }), [REC.drafts_post, REC.lines_post],
        'C13 [test 19] the final fingerprints are the expected ones');
    eq(c.verification.tables.map(function (t) { return t.fingerprint_after_matches_expected; }), [true, true],
        'C14 [test 19] and the commit checked that itself');
    eq(c.verification.tables.map(function (t) { return t.header_order_exact; }), [true, true], 'C15 exact final header order');
    eq(c.verification.tables.map(function (t) { return t.runtime_gate_after; }), ['ACCEPTED', 'ACCEPTED'],
        'C16 [test 27] and the runtime gate accepts both final schemas');

    // Test 21 — every pre-existing cell is byte-identical.
    ok(c.verification.preexisting_cells_compared >= (4 * 34 + 6 * 30), 'C17 [test 21] every pre-existing cell was compared (' + c.verification.preexisting_cells_compared + ')');
    eq(c.verification.preexisting_cell_mismatches, [], 'C18 [test 21] and none of them moved');
    var afterD = env.gridOf('shipping_allocation_drafts'), afterL = env.gridOf('shipping_allocation_draft_lines');
    eq(afterD.slice(1).map(function (r) { return r.slice(0, 34); }), beforeDrafts.slice(1),
        'C19 [test 21] the draft rows are byte-identical over the pre-migration range');
    eq(afterL.slice(1).map(function (r) { return r.slice(0, 30); }), beforeLines.slice(1),
        'C20 [test 21] and so are the line rows');

    // Test 22 — every cell below each new header is blank.
    eq(c.verification.new_column_non_blank_cells, [], 'C21 [test 22] the commit found no non-blank new cell');
    eq(afterD.slice(1).map(function (r) { return r[34]; }), ['', '', '', ''], 'C22 [test 22] destination_marketplace is blank on all 4 headers');
    eq(afterL.slice(1).map(function (r) { return r[30]; }), ['', '', '', '', '', ''], 'C23 [test 22] expected_arrival is blank on all 6 lines');

    // Tests 23, 24 — quantity, ids and FKs.
    eq(c.verification.census_after.planned_qty_total, 1020, 'C24 [test 23] planned_qty total is still 1020');
    eq(c.verification.census_after.matched_lines, 6, 'C25 [test 24] 6 matched lines');
    eq(c.verification.census_after.orphan_lines, 0, 'C26 [test 24] 0 orphans');
    eq(c.verification.census_after.id_and_fk_digest, c.verification.census_before.id_and_fk_digest,
        'C27 [test 24] and not one id or FK reference changed');
    eq(c.verification.census_unchanged, true, 'C28 the whole census is unchanged');

    // Test 25 — sea and sea_express are still two different services.
    var svc = c.verification.census_after.service_counts;
    eq(svc.sea, 2, 'C29 [test 25] two `sea` rows');
    eq(svc.sea_express, 1, 'C30 [test 25] one `sea_express` row, still spelled that way');
    eq(svc, c.verification.census_before.service_counts, 'C31 [test 25] and no service value moved at all');
    var methodIx = FULL.indexOf('recommended_shipping_method');
    eq(afterD.slice(1).map(function (r) { return r[methodIx]; }), ['sea', 'sea_express', 'sea', 'air'],
        'C32 [test 25] read straight from the cells: sea never became sea_express');

    // The journal recorded intent BEFORE the writes, in order.
    eq(c.journal.map(function (j) { return j.cell; }),
        ['shipping_allocation_drafts!AI1', 'shipping_allocation_draft_lines!AE1'], 'C33 the journal names both cells in order');
    eq(c.journal.map(function (j) { return [j.applied, j.verified]; }), [[true, true], [true, true]], 'C34 both applied and verified');
    ok(env.events.logs.some(function (m) { return m.indexOf('B4 JOURNAL (intent, before any write)') === 0; }),
        'C35 and the intent was journalled before anything was applied');
    eq(env.events.released >= 1, true, 'C36 the lock was released');
})();

// ==============================================================================================================
section('D — [tests 3, 4, 5, 20] idempotency and the two partial states');
// ==============================================================================================================
(function () {
    // Test 3 / 20 — replay against a fully migrated database.
    var env = fresh({}, POST, LFULL);
    var d = env.dry();
    eq(d.decision, 'NOTHING_TO_DO', 'D1 [test 3] DRY RUN reports NOTHING_TO_DO');
    eq(d.proposed_writes, [], 'D2 [test 3] and proposes nothing');
    eq(d.blocking_reasons, [], 'D3 with no blocking reason — this is a clean finished state, not a refusal');
    var beforeD = env.gridOf('shipping_allocation_drafts'), beforeL = env.gridOf('shipping_allocation_draft_lines');
    env.setReviewed('fb4b4-1:deadbeef');   // a stale checksum must not turn a no-op into a write
    var c = env.commit();
    eq(c.DB_WRITES, 0, 'D4 [test 20] COMMIT replay writes nothing');
    eq(c.COLUMNS_APPENDED, 0, 'D5 [test 20] no column appended');
    eq(c.ROWS_CHANGED, 0, 'D6 [test 20] no row modified');
    ok(has(c, 'NOTHING_TO_DO'), 'D7 [test 3] and says so');
    eq(env.headers('shipping_allocation_drafts').filter(function (h) { return h === 'destination_marketplace'; }).length, 1,
        'D8 [test 3] no duplicate column was created');
    eq(env.headers('shipping_allocation_draft_lines').filter(function (h) { return h === 'expected_arrival'; }).length, 1,
        'D9 [test 3] nor on the line table');
    eq([env.gridOf('shipping_allocation_drafts'), env.gridOf('shipping_allocation_draft_lines')], [beforeD, beforeL],
        'D10 [test 20] and both grids are byte-identical');

    // Test 4 — only the header target present.
    var e2 = fresh({}, POST, LHDR);
    var d2 = e2.dry();
    eq(d2.decision, 'MECHANICALLY_SAFE_TO_APPEND', 'D11 [test 4] header done, line outstanding: still safe');
    eq(d2.proposed_writes.map(function (w) { return w.cell; }), ['shipping_allocation_draft_lines!AE1'],
        'D12 [test 4] EXACTLY the one remaining cell');
    eq(d2.tables[0].state, 'ALREADY_PRESENT', 'D13 [test 4] and the header table is recognised as done');
    e2.setReviewed(d2.confirmation_checksum);
    var c2 = e2.commit();
    eq([c2.state, c2.DB_WRITES], ['COMMITTED', 1], 'D14 [test 4] the partial commit writes exactly one cell');
    eq(e2.headers('shipping_allocation_draft_lines'), LFULL, 'D15 [test 4] and finishes the line table');
    eq(e2.headers('shipping_allocation_drafts'), POST, 'D16 [test 4] leaving the header table untouched');

    // Test 5 — only the line target present.
    var e3 = fresh({}, CANON, LFULL);
    var d3 = e3.dry();
    eq(d3.decision, 'MECHANICALLY_SAFE_TO_APPEND', 'D17 [test 5] line done, header outstanding: still safe');
    eq(d3.proposed_writes.map(function (w) { return w.cell; }), ['shipping_allocation_drafts!AI1'],
        'D18 [test 5] EXACTLY the one remaining cell');
    eq(d3.tables[1].state, 'ALREADY_PRESENT', 'D19 [test 5] and the line table is recognised as done');
    e3.setReviewed(d3.confirmation_checksum);
    var c3 = e3.commit();
    eq([c3.state, c3.DB_WRITES], ['COMMITTED', 1], 'D20 [test 5] the partial commit writes exactly one cell');
    eq(e3.headers('shipping_allocation_drafts'), POST, 'D21 [test 5] and finishes the header table');

    // A partial plan and a full plan must not share a checksum — the write plan is part of what is authorised.
    var full = fresh().dry().confirmation_checksum;
    ok(full !== d2.confirmation_checksum && full !== d3.confirmation_checksum && d2.confirmation_checksum !== d3.confirmation_checksum,
        'D22 the three plan shapes each have their own checksum');
})();

// ==============================================================================================================
section('E — [tests 6, 7, 8, 9, 10, 11, 12] the mandatory refusals, each by its own typed reason');
// ==============================================================================================================
function refuseCase(label, dh, lh, token, testNo) {
    var env = fresh({}, dh, lh);
    var beforeD = env.gridOf('shipping_allocation_drafts'), beforeL = env.gridOf('shipping_allocation_draft_lines');
    var d = env.dry();
    eq(d.decision, 'STOP', 'E:' + label + ' [test ' + testNo + '] DRY RUN stops');
    ok(has(d, token), 'E:' + label + ' [test ' + testNo + '] and names it: ' + token + (has(d, token) ? '' : '  (got: ' + reasons(d) + ')'));
    eq(d.proposed_writes, [], 'E:' + label + ' proposes no write');
    // and the COMMIT refuses with zero writes even when handed a plausible checksum
    env.setReviewed('fb4b4-1:00000000');
    var c = env.commit();
    eq([c.committed, c.DB_WRITES, c.COLUMNS_APPENDED, c.ROWS_CHANGED], [false, 0, 0, 0], 'E:' + label + ' COMMIT refuses with ZERO writes');
    eq([env.gridOf('shipping_allocation_drafts'), env.gridOf('shipping_allocation_draft_lines')], [beforeD, beforeL],
        'E:' + label + ' and both grids are untouched');
}
// Test 6 — destination_marketplace at the wrong index. This is the exact shape B2 measured as fatal.
refuseCase('wrong-header-index', HDR.concat(['destination_marketplace']).concat(FULL.slice(30, 34)), LHDR,
    'TARGET_AT_WRONG_INDEX:destination_marketplace@30_EXPECTED_34', 6);
// Test 7 — expected_arrival at the wrong index.
refuseCase('wrong-line-index', CANON, LHDR.slice(0, 29).concat(['expected_arrival']).concat([LHDR[29]]),
    'TARGET_AT_WRONG_INDEX:expected_arrival@29_EXPECTED_30', 7);
// Test 8 — the lifecycle tail is incomplete, so index 34 does not exist yet.
refuseCase('lifecycle-tail-missing', HDR.concat(['generation_run_id', 'expired_at', 'expired_by_run_id']), LHDR,
    'LIFECYCLE_TAIL_INCOMPLETE:MISSING_expiration_reason', 8);
// Test 9 — a duplicate target column.
refuseCase('duplicate-target', CANON.concat(['destination_marketplace', 'destination_marketplace']), LHDR,
    'DUPLICATE_COLUMN:destination_marketplace@34_AND_35', 9);
// Test 10 — a case-insensitive collision on the target name.
refuseCase('case-collision', CANON.concat(['destination_marketplace', 'Destination_Marketplace']), LHDR,
    'CASE_INSENSITIVE_COLLISION:', 10);
// Test 11 — an unknown extra column. The COUNT stays 34, so only the positional rule can catch this one.
refuseCase('unknown-extra', CANON.slice(0, 33).concat(['expiration_reason_v2']), LHDR,
    'ORDER_DRIFT_AT_INDEX:33_IS_expiration_reason_v2_EXPECTED_expiration_reason', 11);
// Test 12 — a blank intervening header.
refuseCase('blank-intervening', CANON.slice(0, 20).concat(['']).concat(CANON.slice(21)), LHDR,
    'BLANK_HEADER_AT_INDEX:20', 12);
// And the sheets themselves must exist.
(function () {
    var env = fresh();
    delete env.SHEETS['shipping_allocation_draft_lines'];
    var d = env.dry();
    eq(d.decision, 'STOP', 'E:missing-sheet DRY RUN stops');
    ok(has(d, 'SHEET_MISSING:shipping_allocation_draft_lines'), 'E:missing-sheet names the missing table');
})();

// ==============================================================================================================
section('F — [tests 13, 14, 15] the checksum, which is the whole confirmation');
// ==============================================================================================================
(function () {
    // Test 13 — blank constant.
    var env = fresh();
    var before = [env.gridOf('shipping_allocation_drafts'), env.gridOf('shipping_allocation_draft_lines')];
    var c = env.commit();                                        // constant left exactly as shipped
    eq(c.committed, false, 'F1 [test 13] a blank reviewed checksum refuses');
    eq([c.DB_WRITES, c.COLUMNS_APPENDED], [0, 0], 'F2 [test 13] with zero writes');
    ok(has(c, 'REVIEWED_CHECKSUM_REQUIRED'), 'F3 [test 13] and says why');
    eq([env.gridOf('shipping_allocation_drafts'), env.gridOf('shipping_allocation_draft_lines')], before, 'F4 [test 13] grids untouched');
    // It refuses before it even opens the database.
    eq(env.events.lockTries, 0, 'F5 [test 13] no lock was taken');

    // Test 14 — a wrong checksum.
    var e2 = fresh();
    var d2 = e2.dry();
    var wrong = d2.confirmation_checksum.replace(/.$/, function (ch) { return ch === 'a' ? 'b' : 'a'; });
    ok(wrong !== d2.confirmation_checksum, 'F6 [test 14] the wrong checksum really differs');
    e2.setReviewed(wrong);
    var c2 = e2.commit();
    eq(c2.committed, false, 'F7 [test 14] refused');
    eq([c2.DB_WRITES, c2.COLUMNS_APPENDED, c2.ROWS_CHANGED], [0, 0, 0], 'F8 [test 14] zero writes');
    ok(has(c2, 'CHECKSUM_MISMATCH'), 'F9 [test 14] and names the mismatch');
    eq(c2.live_checksum, d2.confirmation_checksum, 'F10 [test 14] reporting the live value so it can be re-reviewed');
    eq(e2.events.lockTries, 0, 'F11 [test 14] the mismatch is caught BEFORE the lock is taken');
    eq(e2.headers('shipping_allocation_drafts').length, 34, 'F12 [test 14] the header is untouched');

    // A checksum from another operation — B2's review checksum is the realistic mistake.
    var e3 = fresh();
    e3.setReviewed('fb4fb2-1:42a1b1ed');
    var c3 = e3.commit();
    eq([c3.committed, c3.DB_WRITES], [false, 0], 'F13 B2\'s review checksum authorises nothing here');
    ok(has(c3, 'REVIEWED_CHECKSUM_FROM_ANOTHER_OPERATION'), 'F14 and it is refused by name, not by luck');

    // Test 15 — the schema drifts between the confirmation and the lock. The lock callback moves the sheet.
    var e4 = fresh();
    var d4 = e4.dry();
    var drifted = makeEnv(null, {
        onLock: function (SHEETS) {
            // Another writer appends a column of its own in the instant before the lock is granted.
            var sh = SHEETS['shipping_allocation_drafts'];
            sh.maxCols = 35; sh.pad(); sh.grid[0][34] = 'someone_elses_column';
        }
    });
    mount(drifted, CANON, LHDR);
    var d4b = drifted.dry();
    eq(d4b.confirmation_checksum, d4.confirmation_checksum, 'F15 [test 15] the pre-lock plan is the reviewed one');
    drifted.setReviewed(d4b.confirmation_checksum);
    var c4 = drifted.commit();
    eq(c4.committed, false, 'F16 [test 15] drift after the lock refuses');
    eq([c4.DB_WRITES, c4.COLUMNS_APPENDED, c4.ROWS_CHANGED], [0, 0, 0], 'F17 [test 15] with zero writes');
    ok(has(c4, 'UNDER_LOCK'), 'F18 [test 15] and says the drift happened under the lock');
    eq(drifted.events.lockTries >= 1, true, 'F19 [test 15] the lock had in fact been taken');
    eq(drifted.events.released >= 1, true, 'F20 [test 15] and released again');

    // The DRY RUN's own two reads must agree, or it refuses to print a plan at all.
    var e5 = makeEnv();
    mount(e5, CANON, LHDR);
    var n = 0;
    var sh5 = e5.SHEETS['shipping_allocation_drafts'];
    var realGetDataRange = sh5.getDataRange.bind(sh5);
    sh5.getDataRange = function () {
        n++;
        // Move the header row only once the first full plan has been built.
        if (n > 1) { sh5.maxCols = 35; sh5.pad(); sh5.grid[0][34] = 'moved_underneath_us'; }
        return realGetDataRange();
    };
    var d5 = e5.dry();
    eq(d5.decision, 'STOP', 'F21 a header row that moves between the DRY RUN\'s two reads is a refusal');
    ok(has(d5, 'LIVE_SCHEMA_CHANGED'), 'F22 and it is named');
    ok(n >= 2, 'F23 the drafts table really was read more than once (' + n + ')');
})();

// ==============================================================================================================
section('G — [tests 16, 17, 18] journal failure, and writes that do not land');
// ==============================================================================================================
(function () {
    // Test 16 — the journal cannot be recorded, so nothing is applied. An unjournalled structural change is
    // exactly the thing there is no automatic rollback for.
    var env = makeEnv(null, {
        onLog: function (m) { if (m.indexOf('B4 JOURNAL') === 0) throw new Error('log sink unavailable'); }
    });
    mount(env, CANON, LHDR);
    var d = env.dry();
    env.setReviewed(d.confirmation_checksum);
    var c = env.commit();
    eq(c.committed, false, 'G1 [test 16] a journal failure refuses');
    eq([c.DB_WRITES, c.COLUMNS_APPENDED], [0, 0], 'G2 [test 16] with NO schema write');
    ok(has(c, 'JOURNAL_WRITE_FAILED'), 'G3 [test 16] and names the cause');
    eq(env.headers('shipping_allocation_drafts').length, 34, 'G4 [test 16] the header row is untouched');
    eq(env.headers('shipping_allocation_draft_lines').length, 30, 'G5 [test 16] and so is the line header');
    eq(env.events.released >= 1, true, 'G6 [test 16] the lock was still released');

    // Test 17 — the FIRST write throws. The second must not be attempted.
    var e2 = fresh();
    var d2 = e2.dry();
    e2.SHEETS['shipping_allocation_drafts'].failSetValueAt = '1,35';
    e2.setReviewed(d2.confirmation_checksum);
    var c2 = e2.commit();
    eq(c2.state, 'FAILED', 'G7 [test 17] a first-write failure is reported as FAILED');
    eq(c2.committed, false, 'G8 [test 17] never as success');
    eq([c2.DB_WRITES, c2.COLUMNS_APPENDED], [0, 0], 'G9 [test 17] nothing counted as written');
    ok(has(c2, 'WRITE_FAILED:shipping_allocation_drafts!AI1'), 'G10 [test 17] the failing cell is named');
    eq(c2.journal.map(function (j) { return [j.cell, j.applied, j.verified]; }),
        [['shipping_allocation_drafts!AI1', false, false], ['shipping_allocation_draft_lines!AE1', false, false]],
        'G11 [test 17] and the journal shows exactly what was and was not applied');
    eq(e2.headers('shipping_allocation_draft_lines').length, 30,
        'G12 [test 17] the SECOND write was not attempted — a write on top of an unverified failure makes two problems');
    ok(has(c2, 'NO automatic rollback'), 'G13 [test 17] and no rollback was invented');

    // Test 17b — the first write is ACCEPTED but does not land. Only a read-back catches this.
    var e3 = fresh();
    var d3 = e3.dry();
    e3.SHEETS['shipping_allocation_drafts'].silentSetValueAt = '1,35';
    e3.setReviewed(d3.confirmation_checksum);
    var c3 = e3.commit();
    eq(c3.committed, false, 'G14 [test 17] a silently-discarded write is caught');
    ok(has(c3, 'WRITE_VERIFICATION_FAILED:shipping_allocation_drafts!AI1'), 'G15 [test 17] by reading the cell back');
    eq(c3.journal[0].applied, true, 'G16 [test 17] the journal records that it was attempted');
    eq(c3.journal[0].verified, false, 'G17 [test 17] and that it did not verify');
    eq(e3.headers('shipping_allocation_draft_lines').length, 30, 'G18 [test 17] the second write was not attempted');

    // Test 18 — the SECOND write fails. The first stands, and the result is not a success.
    var e4 = fresh();
    var d4 = e4.dry();
    e4.SHEETS['shipping_allocation_draft_lines'].failSetValueAt = '1,31';
    e4.setReviewed(d4.confirmation_checksum);
    var c4 = e4.commit();
    eq(c4.state, 'FAILED', 'G19 [test 18] a second-write failure is FAILED');
    eq(c4.committed, false, 'G20 [test 18] NO false success');
    eq([c4.DB_WRITES, c4.COLUMNS_APPENDED], [1, 1], 'G21 [test 18] exactly one column is reported as appended');
    ok(has(c4, 'WRITE_FAILED:shipping_allocation_draft_lines!AE1'), 'G22 [test 18] the failing cell is named');
    ok(has(c4, 'PARTIAL_OR_NO_STRUCTURAL_CHANGE'), 'G23 [test 18] and the partial state is stated plainly');
    eq(c4.journal.map(function (j) { return j.verified; }), [true, false], 'G24 [test 18] the journal separates the two');
    eq(e4.headers('shipping_allocation_drafts').length, 35, 'G25 [test 18] the first append really did land');
    eq(e4.headers('shipping_allocation_draft_lines').length, 30, 'G26 [test 18] and the second really did not');
    // No data row was touched by the partial failure.
    eq(e4.gridOf('shipping_allocation_drafts').slice(1).map(function (r) { return r[34]; }), ['', '', '', ''],
        'G27 [test 18] and no data cell was written under the column that did land');

    // A lock that cannot be acquired is a refusal, not a wait.
    var e5 = makeEnv(null, { lockFails: true });
    mount(e5, CANON, LHDR);
    var d5 = e5.dry();
    e5.setReviewed(d5.confirmation_checksum);
    var c5 = e5.commit();
    eq([c5.committed, c5.DB_WRITES], [false, 0], 'G28 an unavailable lock writes nothing');
    ok(has(c5, 'LOCK_UNAVAILABLE'), 'G29 and is named');
})();

// ==============================================================================================================
section('H — [test 26] no backfill source is consulted, proven by what stays blank');
// ==============================================================================================================
(function () {
    // The fixture rows are loaded with every temptation: a marketplace scope of "Amazon", a destination
    // warehouse code snapshot, warehouse ids, created/updated timestamps, a shipping method, and a note
    // literally containing the attempted 2026-10-16 date. If ANY of them were consulted, a value would appear.
    var env = fresh();
    var d = env.dry();
    env.setReviewed(d.confirmation_checksum);
    env.events.lastCommit = env.commit();
    var D = env.gridOf('shipping_allocation_drafts'), L = env.gridOf('shipping_allocation_draft_lines');
    eq(D.slice(1).map(function (r) { return r[34]; }), ['', '', '', ''], 'H1 [test 26] "Amazon" was in every row and destination_marketplace is still blank');
    eq(L.slice(1).map(function (r) { return r[30]; }), ['', '', '', '', '', ''], 'H2 [test 26] "2026-10-16" was in the notes and expected_arrival is still blank');
    // The only two values ever written are the two literal column names. Read from the JOURNAL, which records
    // every intended write before it happens, rather than from the log text — the log also carries the tool's
    // own vocabulary of forbidden sources, so scanning it for "2026-10-16" would match the refusal list and
    // pass for the wrong reason.
    var c = env.events.lastCommit;
    eq(c.journal.map(function (j) { return j.value; }), ['destination_marketplace', 'expected_arrival'],
        'H3 [test 26] the journal shows the only two values ever written are the column names themselves');
    eq(c.journal.filter(function (j) { return j.row !== 1; }), [], 'H4 [test 26] and not one of them is below row 1');
    // And a value that somehow reached the plan would be refused before the lock.
    var mutated = swap(TOOL, "a1: spec.table + '!' + spec.frozen_a1, column: spec.column, value: spec.column,",
        "a1: spec.table + '!' + spec.frozen_a1, column: spec.column, value: 'Amazon',");
    var e2 = makeEnv(mutated); mount(e2, CANON, LHDR);
    var d2 = e2.dry();
    eq(d2.decision, 'STOP', 'H5 [test 26] a plan whose value is not the column name is refused');
    ok(has(d2, 'WRITE_VALUE_IS_NOT_THE_COLUMN_NAME'), 'H6 [test 26] by name');
    // A plan that reached below row 1 would be refused too.
    var mutated2 = swap(TOOL, "kind: 'ADD_COLUMN', table: spec.table, row: 1, col: spec.frozen_index0 + 1,",
        "kind: 'ADD_COLUMN', table: spec.table, row: 2, col: spec.frozen_index0 + 1,");
    var e3 = makeEnv(mutated2); mount(e3, CANON, LHDR);
    var d3 = e3.dry();
    eq(d3.decision, 'STOP', 'H7 [test 26] a plan containing a data-row cell is refused');
    ok(has(d3, 'DATA_ROW_WRITE_IN_PLAN'), 'H8 [test 26] by name, before any lock is taken');
    e3.setReviewed('fb4b4-1:00000000');
    var c3 = e3.commit();
    eq([c3.committed, c3.DB_WRITES], [false, 0], 'H9 [test 26] and the COMMIT writes nothing');
})();

// ==============================================================================================================
section('I — the ordering guard: this tool cannot run before the B3 sync');
// ==============================================================================================================
(function () {
    // B2 measured that appending either column before the runtime knows it makes every allocation read and
    // write fail closed. The tool's only defence against being pasted into a stale project is that it has NO
    // local copy of the authority — so remove the B3 symbols and it must stop rather than guess.
    var preB3 = SAD
        .replace(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ =[\s\S]*?;\n/, 'var __removed_hfull_ = 1;\n')
        .replace(/var SAD_HEADER_OPTIONAL_TAIL_COLUMNS_ =[\s\S]*?;\n/, 'var __removed_htail_ = 1;\n')
        .replace(/var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ =[\s\S]*?;\n/, 'var __removed_lfull_ = 1;\n')
        .replace(/var SAD_LINE_ETA_TAIL_COLUMNS_ = \[[^\]]*\];\n/, 'var __removed_ltail_ = 1;\n');
    ok(preB3 !== SAD, 'I1 the pre-B3 fixture really differs from the shipped source');
    ok(preB3.indexOf('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ =') === -1, 'I2 and the B3 authority really is gone');

    var env = makeEnv(null, { sadSrc: preB3 });
    mount(env, CANON, LHDR);
    var d = env.dry();
    eq(d.decision, 'STOP', 'I3 pasted into a project that has not been synced to B3, the tool STOPS');
    ok(has(d, 'AUTHORITY_NOT_LOADED'), 'I4 naming the missing authority');
    ok(has(d, 'F1-7N-FB-4F-B3'), 'I5 and the sync it is waiting for');
    eq(d.proposed_writes, [], 'I6 it proposes nothing');
    env.setReviewed('fb4b4-1:00000000');
    var c = env.commit();
    eq([c.committed, c.DB_WRITES, c.COLUMNS_APPENDED], [false, 0, 0], 'I7 and the COMMIT appends nothing');
    eq(env.headers('shipping_allocation_drafts').length, 34, 'I8 the live header is untouched');

    // There is no hardcoded fallback list anywhere in the tool that could substitute for the authority.
    ok(TOOL.indexOf("'allocation_draft_id', 'planning_cycle'") === -1, 'I9 the tool carries no copy of the header schema');
    ok(TOOL.indexOf("'allocation_draft_line_id', 'allocation_draft_id'") === -1, 'I10 nor of the line schema');
    ok(TOOL.indexOf("['generation_run_id', 'expired_at'") === -1, 'I11 nor of the lifecycle tail');

    // The frozen decision must agree with the authority, and say so if it ever stops agreeing.
    var moved = swap(TOOL, 'frozen_index0: 34,', 'frozen_index0: 33,');
    var e2 = makeEnv(moved); mount(e2, CANON, LHDR);
    var d2 = e2.dry();
    eq(d2.decision, 'STOP', 'I12 a frozen index that disagrees with the authority is a refusal');
    ok(has(d2, 'SPEC_DISAGREES_WITH_AUTHORITY'), 'I13 named as a spec disagreement, not a data problem');
    var movedA1 = swap(TOOL, "frozen_a1: 'AE1',", "frozen_a1: 'AD1',");
    var e3 = makeEnv(movedA1); mount(e3, CANON, LHDR);
    ok(has(e3.dry(), 'SPEC_DISAGREES_WITH_AUTHORITY'), 'I14 and so is an A1 reference that no longer matches the index');
})();

// ==============================================================================================================
section('J — [test 29] no routed action, no deployment contract, no owner build moved');
// ==============================================================================================================
(function () {
    // F1-7N-FC-1A-R1 — at-or-after (B4 added no router action; R1 adds one).
ok(Number((HEALTH.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]) >= 10,
  'J1 [test 29] action contract is at or after 10 (B4 added no router action)');
    // F1-7N-FB-4G-A2-R3 - RESTATED to a floor (see the B3 suite for the reasoning).
    ok(Number((HEALTH.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1]) >= 9,
      'J2 [test 29] required-action list version is at or after 9');
    eq((HEALTH.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/) || [])[1], '1', 'J3 [test 29] transport contract stays 1');
    // B4 changes no deployed file, so every owner build stamp stays exactly where B3 left it.
    // F1-7N-FB-4F-B6 — RESTATED. B4 shipped no deployed-source change, so "unmoved" was the right OBSERVATION
    // and the wrong ASSERTION: it pinned the value B4 happened to see, and the next round that legitimately
    // changed 16_ failed it. What B4 needed to prove is that B4 ITSELF did not move it, and the durable form of
    // that is a FLOOR — the stamp is at or after the round B4 requires to be synced, never before it.
    var _j4 = (SAD.match(/var SAD_BUILD_VERSION_ = '([^']+)';/) || [])[1];
    // F1-7N-FB-4G-A0-R1 — the stamp order moved to _release-order.js (four suites held their own copy).
    var _j4Order = require(require('path').join(__dirname, '_release-order.js')).OWNER_STAMPS;
    ok(_j4Order.indexOf(_j4) !== -1 && _j4Order.indexOf(_j4) >= _j4Order.indexOf('F1-7N-FB-4F-B3'),
        'J4 [test 29] the allocation owner build is at or after the B3 sync B4 depends on (' + _j4 + ')');
// F1-7N-FC-1A-R1 — derived from the manifest.
var _j5Expect = ((HEALTH.match(/\{ file: '01_router\.gs',[^}]*expected: '([^']+)'/) || [])[1]) || '(none)';
eq((ROUTER.match(/var RTR_BUILD_VERSION_ = '([^']+)'/) || [])[1], _j5Expect,
  'J5 [test 29] the router declares exactly the build its manifest expects (' + _j5Expect + ')');
    // The tool is not in the deployment manifest, because it is not deployed.
    ok(HEALTH.indexOf(TOOL_FILE) === -1, 'J6 [test 29] the helper is not a manifested deployment owner');
    // And it adds no action or route.
    ['TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN', 'TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT', 'tb4BuildPlan_']
        .forEach(function (sym) { ok(ROUTER.indexOf(sym) === -1, 'J7 ' + sym + ' is not routed'); });
    // Production runtime code must not call a schema-append helper during an ordinary request.
    ok(SAD.indexOf('insertColumnsAfter') === -1, 'J8 the allocation handler never appends a column during a request');
    // The B2 diagnostic stays read-only and is untouched by this round.
    var B2 = lf(fs.readFileSync(path.join(TOOLS_DIAG, 'TEMP_shipping_allocation_schema_b2_dry_run.gs'), 'utf8'));
    ok(B2.indexOf('setValue') === -1, 'J9 and the B2 diagnostic is still incapable of writing');
})();

// ==============================================================================================================
section('K — [test 30] mutation tests: every guard is load-bearing');
// ==============================================================================================================
// Each mutation must (a) actually change the source — `swap` throws otherwise — and (b) be CAUGHT by the check
// that owns it. Each probe attacks the POINT OF DETECTION and asserts the specific typed reason, so a mutation
// is not let off by a neighbouring guard that happens to answer the same question a different way.
var MUTATIONS = [
    {
        name: 'M1 blank reviewed checksum accepted',
        from: "  if (reviewed === '') {", to: '  if (false) {',
        probe: function (env) {
            mount(env, CANON, LHDR);
            var c = env.commit();                     // constant left blank
            // The blank case must be refused BY NAME. The prefix guard below would also reject '', so asserting
            // only "zero writes" would let this mutation through on a neighbour's answer.
            return c.DB_WRITES === 0 && has(c, 'REVIEWED_CHECKSUM_REQUIRED');
        }
    },
    {
        name: 'M2 pre-lock checksum comparison neutered',
        from: '  if (pre.confirmation_checksum !== reviewed) {', to: '  if (false) {',
        probe: function (env) {
            mount(env, CANON, LHDR);
            env.setReviewed('fb4b4-1:00000000');
            var c = env.commit();
            // The under-lock recheck would also refuse this, so the thing that must be true is that the
            // mismatch was caught WITHOUT EVER TAKING THE LOCK — which is what the pre-lock comparison buys.
            return c.DB_WRITES === 0 && env.events.lockTries === 0 && has(c, 'CHECKSUM_MISMATCH');
        }
    },
    {
        name: 'M3 under-lock recheck neutered',
        from: '    if (post.confirmation_checksum !== reviewed) {', to: '    if (false) {',
        probe: function (env, tool) {
            // The drift must leave the plan STILL VALID, or the `REFUSED_UNDER_LOCK` branch answers instead and
            // the recheck is never exercised. Another writer inserting a draft LINE does exactly that: the
            // schema is untouched and appendable, but the row count and census — and so the checksum — moved.
            var e = makeEnv(tool, {
                onLock: function (SHEETS) {
                    var sh = SHEETS['shipping_allocation_draft_lines'];
                    var row = new Array(sh.maxCols).join('.').split('.').map(function () { return ''; });
                    row[0] = 'SADL-7'; row[1] = DRAFT_IDS[0]; row[LHDR.indexOf('planned_qty')] = 40;
                    sh.grid.push(row);
                }
            });
            mount(e, CANON, LHDR);
            var d = e.dry();
            e.setReviewed(d.confirmation_checksum);
            var c = e.commit();
            return c.committed === false && c.DB_WRITES === 0 && has(c, 'CHECKSUM_MISMATCH_UNDER_LOCK');
        }
    },
    {
        name: 'M4 journal failure no longer blocks',
        from: '    if (!journalOk) {', to: '    if (false) {',
        probe: function (env, tool) {
            var e = makeEnv(tool, { onLog: function (m) { if (m.indexOf('B4 JOURNAL') === 0) throw new Error('sink down'); } });
            mount(e, CANON, LHDR);
            var d = e.dry();
            e.setReviewed(d.confirmation_checksum);
            var c = e.commit();
            return c.DB_WRITES === 0 && e.headers('shipping_allocation_drafts').length === 34;
        }
    },
    {
        name: 'M5 the write loop no longer stops at the first failure',
        from: "          failed = 'WRITE_VERIFICATION_FAILED:' + w.a1 + '_READ_BACK_' + (readBack || '(blank)') + '_EXPECTED_' + w.value;\n          break;",
        to: "          failed = 'WRITE_VERIFICATION_FAILED:' + w.a1 + '_READ_BACK_' + (readBack || '(blank)') + '_EXPECTED_' + w.value;",
        probe: function (env, tool) {
            var e = makeEnv(tool); mount(e, CANON, LHDR);
            var d = e.dry();
            e.SHEETS['shipping_allocation_drafts'].silentSetValueAt = '1,35';
            e.setReviewed(d.confirmation_checksum);
            e.commit();
            // the SECOND write must not have been attempted on top of an unverified first
            return e.headers('shipping_allocation_draft_lines').length === 30;
        }
    },
    {
        name: 'M6 committed no longer requires byte-equivalent data rows',
        from: '      verify.preexisting_cell_mismatches.length === 0 &&', to: '      true &&',
        probe: function (env, tool) {
            var e = makeEnv(tool); mount(e, CANON, LHDR);
            var d = e.dry();
            // a write that also disturbs a data cell must never be reported as committed
            var sh = e.SHEETS['shipping_allocation_drafts'];
            var realGetRange = sh.getRange.bind(sh);
            sh.getRange = function (r, c, nr, nc) {
                var range = realGetRange(r, c, nr, nc);
                if (r === 1 && c === 35 && !nr) {
                    var realSet = range.setValue;
                    range.setValue = function (v) { realSet(v); sh.grid[1][5] = 'TAMPERED'; };
                }
                return range;
            };
            e.setReviewed(d.confirmation_checksum);
            var c2 = e.commit();
            return c2.committed === false;
        }
    },
    {
        name: 'M7 committed no longer requires the new column to be blank',
        from: '      verify.new_column_non_blank_cells.length === 0 &&', to: '      true &&',
        probe: function (env, tool) {
            var e = makeEnv(tool); mount(e, CANON, LHDR);
            var d = e.dry();
            var sh = e.SHEETS['shipping_allocation_drafts'];
            var realGetRange = sh.getRange.bind(sh);
            sh.getRange = function (r, c, nr, nc) {
                var range = realGetRange(r, c, nr, nc);
                if (r === 1 && c === 35 && !nr) {
                    var realSet = range.setValue;
                    range.setValue = function (v) { realSet(v); sh.grid[1][34] = 'Amazon'; };
                }
                return range;
            };
            e.setReviewed(d.confirmation_checksum);
            var c2 = e.commit();
            return c2.committed === false;
        }
    },
    {
        name: 'M8 committed no longer requires the quantity/FK census to be unchanged',
        from: '      verify.census_unchanged === true;', to: '      true;',
        probe: function (env, tool) {
            var e = makeEnv(tool); mount(e, CANON, LHDR);
            var d = e.dry();
            var sh = e.SHEETS['shipping_allocation_drafts'];
            var lines = e.SHEETS['shipping_allocation_draft_lines'];
            var realGetRange = sh.getRange.bind(sh);
            sh.getRange = function (r, c, nr, nc) {
                var range = realGetRange(r, c, nr, nc);
                if (r === 1 && c === 35 && !nr) {
                    var realSet = range.setValue;
                    // APPEND a line rather than editing one. Editing an existing cell would also trip the
                    // byte-equivalence check, and the mutation would be "caught" by a guard it never touched.
                    // A row appended past the snapshot range is invisible to every check EXCEPT the census.
                    range.setValue = function (v) {
                        realSet(v);
                        var row = lines.grid[0].map(function () { return ''; });
                        row[0] = 'SADL-99'; row[1] = DRAFT_IDS[0]; row[LHDR.indexOf('planned_qty')] = 777;
                        lines.grid.push(row);
                    };
                }
                return range;
            };
            e.setReviewed(d.confirmation_checksum);
            var c2 = e.commit();
            return c2.committed === false && c2.verification.preexisting_cell_mismatches.length === 0 &&
                c2.verification.census_unchanged === false;
        }
    },
    {
        name: 'M9 duplicate detection removed',
        from: "    out.blocking.push('DUPLICATE_COLUMN:' + d.column + '@' + d.first_index + '_AND_' + d.repeat_index);",
        to: '    void d;',
        probe: function (env) {
            mount(env, CANON.concat(['destination_marketplace', 'destination_marketplace']), LHDR);
            return has(env.dry(), 'DUPLICATE_COLUMN:destination_marketplace@34_AND_35');
        }
    },
    {
        name: 'M10 case-insensitive collision detection removed',
        from: "    out.blocking.push('CASE_INSENSITIVE_COLLISION:' + c.first + '@' + c.first_index + '_VS_' + c.second + '@' + c.second_index);",
        to: '    void c;',
        probe: function (env) {
            mount(env, CANON.concat(['destination_marketplace', 'Destination_Marketplace']), LHDR);
            return has(env.dry(), 'CASE_INSENSITIVE_COLLISION:');
        }
    },
    {
        name: 'M11 blank intervening header detection removed',
        from: "  t.blank_indexes.forEach(function (i) { out.blocking.push('BLANK_HEADER_AT_INDEX:' + i); });",
        to: '  void t.blank_indexes;',
        probe: function (env) {
            mount(env, CANON.slice(0, 20).concat(['']).concat(CANON.slice(21)), LHDR);
            return has(env.dry(), 'BLANK_HEADER_AT_INDEX:20');
        }
    },
    {
        name: 'M12 the target-position check removed',
        from: "    out.blocking.push('TARGET_AT_WRONG_INDEX:' + spec.column + '@' + at + '_EXPECTED_' + spec.frozen_index0);",
        to: '    void at;',
        probe: function (env) {
            mount(env, HDR.concat(['destination_marketplace']).concat(FULL.slice(30, 34)), LHDR);
            return has(env.dry(), 'TARGET_AT_WRONG_INDEX:destination_marketplace@30_EXPECTED_34');
        }
    },
    {
        name: 'M13 the positional order comparison removed',
        from: "      out.blocking.push('ORDER_DRIFT_AT_INDEX:' + i + '_IS_' + (t.headers[i] || '(blank)') +\n        '_EXPECTED_' + (spec.full_authority[i] || '(nothing — beyond the authority)'));",
        to: '      void i;',
        probe: function (env) {
            mount(env, CANON.slice(0, 33).concat(['expiration_reason_v2']), LHDR);
            return has(env.dry(), 'ORDER_DRIFT_AT_INDEX:33_IS_expiration_reason_v2_EXPECTED_expiration_reason');
        }
    },
    {
        name: 'M14 the lifecycle-tail completeness check removed',
        from: "    if (at === -1) out.blocking.push('LIFECYCLE_TAIL_INCOMPLETE:MISSING_' + c);",
        to: '    if (at === -1) { void c; }',
        probe: function (env) {
            mount(env, HDR.concat(['generation_run_id', 'expired_at', 'expired_by_run_id']), LHDR);
            return has(env.dry(), 'LIFECYCLE_TAIL_INCOMPLETE:MISSING_expiration_reason');
        }
    },
    {
        name: 'M15 the data-row assertion on the write plan removed',
        from: "    if (w.row !== 1) plan.blocking_reasons.push('DATA_ROW_WRITE_IN_PLAN:' + w.a1);",
        to: '    void w.row;',
        probe: function (env, tool) {
            // inject a real data-row write, then check the guard is what catches it
            var t2 = swap(tool, "kind: 'ADD_COLUMN', table: spec.table, row: 1, col: spec.frozen_index0 + 1,",
                "kind: 'ADD_COLUMN', table: spec.table, row: 2, col: spec.frozen_index0 + 1,");
            var e = makeEnv(t2); mount(e, CANON, LHDR);
            return has(e.dry(), 'DATA_ROW_WRITE_IN_PLAN');
        }
    },
    {
        name: 'M16 the authority gate no longer requires the B3 symbols',
        from: "  need('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_', typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ !== 'undefined');",
        to: '  need(\'SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_\', true);',
        probe: function (env, tool) {
            var preB3 = SAD.replace(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ =[\s\S]*?;\n/, 'var __gone_ = 1;\n');
            var e = makeEnv(tool, { sadSrc: preB3 });
            mount(e, CANON, LHDR);
            return has(e.dry(), 'AUTHORITY_NOT_LOADED');
        }
    },
    {
        name: 'M17 the operation-prefix guard removed',
        from: '  if (reviewed.indexOf(TEMP_B4_CHECKSUM_PREFIX_ + \':\') !== 0) {', to: '  if (false) {',
        probe: function (env) {
            mount(env, CANON, LHDR);
            env.setReviewed('fb4fb2-1:42a1b1ed');
            return has(env.commit(), 'REVIEWED_CHECKSUM_FROM_ANOTHER_OPERATION');
        }
    }
];

(function () {
    // BASELINE: every probe must hold against the SHIPPED tool. A probe that is already false is testing
    // nothing, and would report its mutation as "caught" for the wrong reason.
    MUTATIONS.forEach(function (m) {
        var env = makeEnv();
        var held = false;
        try { held = m.probe(env, TOOL) === true; } catch (e) { held = false; console.error('  baseline threw: ' + e.message); }
        ok(held, 'K-baseline ' + m.name + ' — the probe holds on the shipped tool');
    });

    var caught = 0;
    MUTATIONS.forEach(function (m) {
        var mutated;
        try { mutated = swap(TOOL, m.from, m.to); }
        catch (e) { ok(false, 'K ' + m.name + ' — ' + e.message); return; }
        ok(mutated !== TOOL, 'K ' + m.name + ' — the mutation really changed the source');
        var survived;
        try {
            var env = makeEnv(mutated);
            survived = m.probe(env, mutated) === true;
        } catch (e) {
            survived = false;   // a mutation that makes the tool throw is also caught
        }
        if (!survived) caught++;
        ok(!survived, 'K ' + m.name + ' — CAUGHT');
    });
    eq(caught, MUTATIONS.length, 'K-total all ' + MUTATIONS.length + ' mutations caught');
})();

// ==============================================================================================================
section('L — the recorded live state, and the two fingerprints this migration must produce');
// ==============================================================================================================
(function () {
    // These four values are the contract with the live database. They are computed here from the repository's
    // own authority through the tool's own fingerprint function, so if either ever moves, this suite says so
    // before a migration does.
    var env = fresh();
    var d = env.dry();
    eq(d.tables[0].fingerprint_pre, 'sf:3e83e85c', 'L1 the live drafts header is the canonical 34');
    eq(d.tables[1].fingerprint_pre, 'sf:2226df13', 'L2 the live lines header is the canonical 30');
    eq(d.tables[0].fingerprint_post_proposed, 'sf:870364de', 'L3 and the append produces the expected 35');
    eq(d.tables[1].fingerprint_post_proposed, 'sf:122f48c3', 'L4 and the expected 31');
    // The fingerprint is order-sensitive, which is the only reason it is worth computing.
    var swapped = CANON.slice(); var t = swapped[3]; swapped[3] = swapped[4]; swapped[4] = t;
    var e2 = fresh({}, swapped, LHDR);
    var d2 = e2.dry();
    ok(d2.tables[0].fingerprint_pre !== 'sf:3e83e85c', 'L5 reordering two columns moves the fingerprint');
    eq(d2.decision, 'STOP', 'L6 and a reordered header is refused');
    // A1 references are derived, not asserted by hand.
    eq(env.get("tb4ColLetter_(35)"), 'AI', 'L7 column 35 is AI');
    eq(env.get("tb4ColLetter_(31)"), 'AE', 'L8 column 31 is AE');
    eq(env.get("tb4ColLetter_(1)"), 'A', 'L9 column 1 is A');
    eq(env.get("tb4ColLetter_(26)"), 'Z', 'L10 column 26 is Z');
    eq(env.get("tb4ColLetter_(27)"), 'AA', 'L11 column 27 is AA');
})();

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
