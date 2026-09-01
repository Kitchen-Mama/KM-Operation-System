// F1-7N-FB-4F-B5 — POST-SCHEMA LEGACY IDENTITY DIAGNOSTIC.
//
// B4 appended the two columns. They are BLANK on every existing row, and that is the question: now that there is
// somewhere to put a route destination, what ARE the four live headers, and what happens if someone saves the
// route the operator has been trying to save?
//
// THIS SUITE EXECUTES BOTH SIDES OF THE BOUNDARY. The server half runs the real
// TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN() against an in-memory spreadsheet built to the exact
// recorded 35/31 live shape. The client half runs the SHIPPED page functions — _hydrateAllocationDraftFromDb,
// _isRouteComplete, _execToOptionsHtml — extracted from assets/js/pages/inventory-replenishment.js, so the
// "blank route row" verdict is measured rather than reasoned about.
//
// Run: node assets/tests/allocation-post-schema-identity-f1-7n-fb-4f-b5.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var GS = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
var TOOLS_DIAG = path.join(ROOT, 'assets', 'tools', 'apps-script-diagnostics');
var TOOLS_MIG = path.join(ROOT, 'assets', 'tools', 'apps-script-migrations');
var TOOL_FILE = 'TEMP_shipping_allocation_post_schema_identity_b5_dry_run.gs';

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
    var A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// LF-normalised on the way in: this repository mixes line endings and core.autocrlf rewrites the working copy,
// so an anchor written with a bare \n matches nothing on a machine that checked the file out the other way.
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }
function readGs(f) { return lf(fs.readFileSync(path.join(GS, f), 'utf8')); }
function swap(src, from, to) {
    if (src.indexOf(from) === -1) throw new Error('mutation anchor ABSENT: ' + from.slice(0, 80));
    var out = src.split(from).join(to);
    if (out === src) throw new Error('mutation changed NOTHING: ' + from.slice(0, 80));
    return out;
}
// Comments are PROSE. This file's own header deliberately NAMES the mutators it cannot reach ("setValue,
// appendRow, insertColumnsAfter ... are UNREACHABLE"), so a scan for those names must look at CODE — otherwise
// the documentation would fail the very test that proves the documentation true.
function stripComments(src) {
    return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}
function extractFn(src, name) {
    var start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('not found: ' + name);
    var i = src.indexOf('{', start), depth = 0;
    for (; i < src.length; i++) {
        var ch = src[i];
        if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    throw new Error('unbalanced: ' + name);
}

var SAD = readGs('16_shipping_allocation_handlers.gs');
var RIC = readGs('69_api_v1_route_identity_contract.gs');
var HEALTH = readGs('63_api_v1_system_health.gs');
var ROUTER = readGs('01_router.gs');
var TOOL = lf(fs.readFileSync(path.join(TOOLS_DIAG, TOOL_FILE), 'utf8'));
var TOOL_CODE = stripComments(TOOL);
var PAGE = lf(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'pages', 'inventory-replenishment.js'), 'utf8'));

// ==============================================================================================================
// SERVER HARNESS — a READ-ONLY in-memory spreadsheet. Any write attempt throws, so a diagnostic that tried to
// write would fail the suite rather than quietly succeed.
// ==============================================================================================================
function makeEnv(toolSrc, opts) {
    opts = opts || {};
    var SHEETS = {};
    var events = { logs: [], writeAttempts: [], reads: 0 };
    var sandbox = {
        String: String, Object: Object, Math: Math, Number: Number, JSON: JSON, Array: Array, Date: Date,
        isNaN: isNaN, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat, RegExp: RegExp,
        Boolean: Boolean, Error: Error, console: console
    };
    sandbox.globalThis = sandbox;

    function FakeSheet(name, grid) {
        this.name = name;
        this.grid = grid.map(function (r) { return r.slice(); });
    }
    FakeSheet.prototype.getDataRange = function () {
        var self = this;
        return { getValues: function () { events.reads++; return self.grid.map(function (r) { return r.slice(); }); } };
    };
    // Every mutator is present and LOUD. A silent absence would let a write attempt look like a missing method.
    ['setValue', 'setValues', 'appendRow', 'insertColumnsAfter', 'insertRowsAfter', 'deleteRow', 'deleteColumn',
        'clear', 'clearContents', 'getRange', 'getMaxColumns'].forEach(function (m) {
            FakeSheet.prototype[m] = function () {
                events.writeAttempts.push(m);
                throw new Error('READ_ONLY_VIOLATION: ' + m + ' was called on ' + this.name);
            };
        });

    sandbox.SpreadsheetApp = {
        openById: function (id) {
            if (id !== 'DB-EXPECTED') throw new Error('wrong spreadsheet id: ' + id);
            return { getSheetByName: function (n) { return SHEETS[n] || null; } };
        },
        getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return SHEETS[n] || null; } }; },
        flush: function () { events.writeAttempts.push('flush'); throw new Error('READ_ONLY_VIOLATION: flush'); }
    };
    sandbox.LockService = { getScriptLock: function () { throw new Error('READ_ONLY_VIOLATION: a lock is only ever taken to write'); } };
    sandbox.Logger = { log: function (m) { events.logs.push(String(m)); } };
    sandbox.Utilities = { getUuid: function () { return 'UUID000000000000'; } };
    sandbox.Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
    sandbox.prodExpectedDbId_ = function () { return 'DB-EXPECTED'; };
    sandbox.prodRequireSheet_ = function (ss, n) { return SHEETS[n]; };
    sandbox.procurementEnsureSheet_ = function () { throw new Error('ENSURE_HELPER_CALLED — a diagnostic must never create or grow a sheet'); };
    sandbox.procurementTimestamp_ = function () { return '2026-09-01 09:00:00'; };
    sandbox.procurementNum_ = function (v) { var n = Number(v); return isFinite(n) ? n : ''; };
    sandbox.jsonResponse_ = function (o) { return o; };

    var ctx = vm.createContext(sandbox);
    vm.runInContext([opts.sadSrc || SAD, opts.ricSrc || RIC, toolSrc || TOOL].join('\n'), ctx);

    var env = {
        ctx: ctx, sandbox: sandbox, SHEETS: SHEETS, events: events,
        get: function (n) { try { return vm.runInContext(n, ctx); } catch (e) { return null; } },
        mount: function (name, grid) { SHEETS[name] = new FakeSheet(name, grid); return SHEETS[name]; },
        run: function () { return vm.runInContext('TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN()', ctx); },
        summary: function () { return vm.runInContext('TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_SUMMARY()', ctx); },
        // Only the compact lines, in emission order - the full dry run's single pretty-printed blob never
        // carries this prefix, so the two views cannot be confused for one another.
        compact: function () {
            return events.logs.filter(function (m) { return m.indexOf('[FB4FB5S] ') === 0; })
                .map(function (m) { return m.slice('[FB4FB5S] '.length); });
        }
    };
    env.HDR = env.get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_');
    env.FULL = env.get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_');
    env.LFULL = env.get('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_');
    return env;
}

var E0 = makeEnv();
var FULL = E0.FULL, LFULL = E0.LFULL;

// --------------------------------------------------------------------------------------------------- fixtures

// THE RECORDED LIVE SHAPE. Four headers, six lines, 1020 units, no orphans — and the target row deliberately
// carries the live defect: a `sea` service, planned_qty 800, and NO destination of any kind, while its plan
// SCOPE marketplace says Amazon. That gap is the entire subject of this round.
var FX = {
    headers: [
        { id: 'SADH-K2-E7AF9242', cycle: '2026-W36', company: 'ResUS', country: 'US', marketplace: 'Amazon',
            status: 'draft', src: 'WH-CN-01', dst: '', method: 'sea', lastMile: 'standard', group: '1' },
        { id: 'SADH-K2-BB110022', cycle: '2026-W36', company: 'ResUS', country: 'US', marketplace: 'Walmart',
            status: 'draft', src: 'WH-CN-01', dst: 'WH-US-3PL-7', method: 'sea', lastMile: 'standard', group: '1' },
        { id: 'SADH-K2-CC220033', cycle: '2026-W36', company: 'ResTW', country: 'JP', marketplace: 'Amazon',
            status: 'draft', src: 'WH-TW-02', dst: 'WH-JP-3PL-1', method: 'air', lastMile: 'standard', group: '1' },
        { id: 'SADH-K3-DD330044', cycle: '2026-W35', company: 'ResUS', country: 'US', marketplace: 'Amazon',
            status: 'submitted', src: 'WH-CN-01', dst: '', method: 'sea_express', lastMile: 'standard', group: '2' }
    ],
    lines: [
        { id: 'SADL-K2-16F4E4F9', fk: 'SADH-K2-E7AF9242', sku: 'CO1100-R', qty: 800 },
        { id: 'SADL-K2-22222222', fk: 'SADH-K2-BB110022', sku: 'CO1100-R', qty: 60 },
        { id: 'SADL-K2-33333333', fk: 'SADH-K2-BB110022', sku: 'CO2200-B', qty: 40 },
        { id: 'SADL-K2-44444444', fk: 'SADH-K2-CC220033', sku: 'CO1100-R', qty: 50 },
        { id: 'SADL-K2-55555555', fk: 'SADH-K2-CC220033', sku: 'CO3300-G', qty: 30 },
        { id: 'SADL-K3-66666666', fk: 'SADH-K3-DD330044', sku: 'CO1100-R', qty: 40 }
    ]
};
// 800 + 60 + 40 + 50 + 30 + 40 = 1020

// A fixture shaped after the PARTIAL live evidence of the first B5 production run (F1-7N-FB-4F-B5-R1). It is
// STILL A FIXTURE - the live run was truncated before the fourth header, the target analysis and the verdict,
// and nothing here may be reported as a live fact. What it buys is the shape the offline fixture above does not
// have: headers with NO destination of any kind AND line_count = 0, which is precisely the row a census is most
// likely to drop. The fourth live header is NOT represented, because it has not been observed.
var FX_LIVE_SHAPED = [
    { id: 'SADH-K2-AAAA1111', cycle: '2026-W36', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        status: 'draft', src: 'WH-CN-01', dst: '', method: 'sea_express', lastMile: 'standard', group: '1' },
    { id: 'SADH-K2-BBBB2222', cycle: '2026-W36', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        status: 'draft', src: 'WH-CN-01', dst: '', method: 'air', lastMile: 'standard', group: '1' },
    { id: 'SADH-K2-CCCC3333', cycle: '2026-W36', company: 'ResTW', country: 'JP', marketplace: 'Amazon',
        status: 'draft', src: 'WH-TW-02', dst: '', method: 'air', lastMile: 'standard', group: '1' }
];
var FX_LIVE_SHAPED_LINES = [
    { id: 'SADL-K2-L1', fk: 'SADH-K2-CCCC3333', sku: 'CO1100-R', qty: 60 },
    { id: 'SADL-K2-L2', fk: 'SADH-K2-CCCC3333', sku: 'CO2200-B', qty: 50 },
    { id: 'SADL-K2-L3', fk: 'SADH-K2-CCCC3333', sku: 'CO3300-G', qty: 40 },
    { id: 'SADL-K2-L4', fk: 'SADH-K2-CCCC3333', sku: 'CO4400-Y', qty: 40 },
    { id: 'SADL-K2-L5', fk: 'SADH-K2-CCCC3333', sku: 'CO5500-P', qty: 30 }
];   // 60+50+40+40+30 = 220

function headerGrid(cols, headers) {
    var g = [cols.slice()];
    (headers || FX.headers).forEach(function (h) {
        g.push(cols.map(function (c) {
            switch (c) {
                case 'allocation_draft_id': return h.id;
                case 'planning_cycle': return h.cycle;
                case 'company': return h.company;
                case 'country': return h.country;
                case 'marketplace': return h.marketplace;
                case 'source_page': return 'inventory_replenishment';
                case 'status': return h.status;
                case 'recommended_source_warehouse_id': return h.src;
                case 'recommended_destination_warehouse_id': return h.dst;
                case 'recommended_destination_warehouse_code_snapshot': return h.dst ? 'US-3PL-ONT' : '';
                case 'recommended_shipping_method': return h.method;
                case 'recommended_last_mile_delivery': return h.lastMile;
                case 'recommendation_group_no': return h.group;
                case 'destination_marketplace': return h.destMkt || '';
                case 'generation_type': return 'user_created';
                case 'created_at': case 'updated_at': return '2026-08-20 11:18:11';
                case 'note': return 'operator note';
                default: return '';
            }
        }));
    });
    return g;
}
function lineGrid(cols, lines) {
    var g = [cols.slice()];
    (lines || FX.lines).forEach(function (l) {
        g.push(cols.map(function (c) {
            switch (c) {
                case 'allocation_draft_line_id': return l.id;
                case 'allocation_draft_id': return l.fk;
                case 'sku': return l.sku;
                case 'site_sku': return l.sku + '-US';
                case 'window_code': return 'W36';
                case 'planned_qty': return l.qty;
                case 'line_status': return 'draft';
                case 'expected_arrival': return l.eta || '';
                default: return '';
            }
        }));
    });
    return g;
}
var PLAN_COLS = ['shipping_plan_id', 'company', 'country', 'marketplace', 'status', 'submit_batch_id'];
var PLAN_LINE_COLS = ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'requested_qty', 'source_reason'];

function mountAll(env, opts) {
    opts = opts || {};
    env.mount('shipping_allocation_drafts', headerGrid(opts.hCols || FULL, opts.headers));
    env.mount('shipping_allocation_draft_lines', lineGrid(opts.lCols || LFULL, opts.lines));
    env.mount('shipping_plans', opts.planGrid || [PLAN_COLS.slice(), ['SP-1', 'ResUS', 'US', 'Amazon', 'submitted', 'EXEC-1']]);
    env.mount('shipping_plan_lines', opts.planLineGrid || [PLAN_LINE_COLS.slice(), ['SPL-1', 'SP-1', 'CO1100-R', 40, 'pm_adjustment']]);
    return env;
}
function fresh(opts) { var e = makeEnv((opts || {}).toolSrc, opts || {}); mountAll(e, opts || {}); return e; }

function hdrOf(r, maskedTail) {
    return (r.headers || []).filter(function (h) { return h.allocation_draft_id.indexOf(maskedTail) === 1; })[0] || null;
}

// ==============================================================================================================
section('A — shape: read-only by construction, no commit, no route, right directory');
// ==============================================================================================================
ok(fs.existsSync(path.join(TOOLS_DIAG, TOOL_FILE)), 'A1 the diagnostic exists in assets/tools/apps-script-diagnostics/');
ok(!fs.existsSync(path.join(GS, TOOL_FILE)), 'A2 and NOT in the active deployment directory');
// Test 21 — no COMMIT or execute path.
ok(/function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN\(\)/.test(TOOL), 'A3 [test 21] the entry point takes no arguments');
// R1 — a SECOND public entry point exists now, and it is the compact VIEW of the same report. What must stay
// true is that every public entry point is read-only and none of them is a writer.
eq(TOOL.match(/^function TEMP_[A-Z0-9_]+\(/gm) || [],
    ['function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN(',
     'function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_SUMMARY('],
    'A4 [test 21] exactly TWO public entry points, both read-only views of one builder');
['COMMIT', 'mode:', 'execute'].forEach(function (t) {
    ok(TOOL.indexOf('function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_' + t) === -1, 'A5 [test 21] no ' + t + ' entry point');
});
// Test 20 — no mutation method is even mentioned in the source, and the façade exposes one capability.
['setValue', 'setValues', 'appendRow', 'insertColumnsAfter', 'insertRowsAfter', 'deleteRow', 'deleteColumn',
    'clearContents', 'flush', 'procurementEnsureSheet_', 'procurementAppendByHeader_', 'LockService',
    'PropertiesService'].forEach(function (m) {
        ok(TOOL_CODE.indexOf(m) === -1, 'A6 [test 20] no CODE path can reach ' + m);
    });
ok(/getDataRange: function \(\) \{[\s\S]{0,200}getValues/.test(TOOL), 'A7 [test 20] the read-only façade exposes getDataRange().getValues() only');
// No fallback copy of the K4 authority.
// A DEFINITION, not a mention: `typeof ricK4GroupKey_ === 'function'` CONTAINS the substring
// "ricK4GroupKey_ =", and the first draft of this line failed on exactly that.
['ricK4GroupKey_', 'ricDestinationIdentity_', 'ricCanonicalService_', 'sadK2GroupKey_', 'ricK4DeterministicHeaderId_']
    .forEach(function (n) {
        ok(TOOL_CODE.indexOf('function ' + n) === -1, 'A8 the tool defines no copy of ' + n);
        ok(!(new RegExp('\\b' + n + '\\s*=[^=]').test(TOOL_CODE)), 'A8 nor reassigns ' + n);
    });
// Test 29-equivalent — no action or route registration.
['TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN', 'tb5ClassifyHeader_'].forEach(function (s) {
    ok(ROUTER.indexOf(s) === -1, 'A9 ' + s + ' is not routed');
});
ok(HEALTH.indexOf(TOOL_FILE) === -1, 'A10 and it is not a manifested deployment owner');

// ==============================================================================================================
section('B — [tests 1, 2, 3, 4, 22] the recorded 35/31 state, read exactly once per table');
// ==============================================================================================================
(function () {
    var env = fresh();
    var r = env.run();
    eq(r.mode, 'DRY_RUN (READ-ONLY)', 'B1 mode');
    eq([r.read_only, r.has_commit_mode], [true, false], 'B2 read-only, no commit mode');
    eq([r.DB_WRITES, r.ROWS_CHANGED, r.COLUMNS_APPENDED, r.IDS_CREATED, r.BACKFILLS], [0, 0, 0, 0, 0], 'B3 every counter is zero');
    eq(env.events.writeAttempts, [], 'B4 [test 20] not one mutation method was called');
    // Test 1 — the exact schema.
    eq([r.schema.drafts.header_count, r.schema.lines.header_count], [35, 31], 'B5 [test 1] 35 / 31 columns');
    eq([r.schema.drafts.fingerprint, r.schema.lines.fingerprint], ['sf:870364de', 'sf:122f48c3'], 'B6 [test 1] the recorded fingerprints');
    eq([r.schema.drafts.fingerprint_matches_recorded, r.schema.lines.fingerprint_matches_recorded], [true, true], 'B7 [test 1] and the tool checked that itself');
    eq([r.schema.drafts.runtime_gate, r.schema.lines.runtime_gate], ['ACCEPTED', 'ACCEPTED'], 'B8 [test 1] both runtime gates accept');
    eq([r.schema.drafts.destination_marketplace_column_present, r.schema.lines.expected_arrival_column_present], [true, true],
        'B9 [test 1] both new columns sit at their canonical indexes');
    eq(r.schema.schema_ready, true, 'B10 schemaReady');
    // Tests 2, 3, 4.
    eq([r.schema.drafts.row_count, r.schema.lines.row_count], [4, 6], 'B11 [test 2] four headers, six lines');
    eq(r.headers.length, 4, 'B12 [test 2] four headers classified');
    eq(r.quantity_and_fk.planned_qty_before, 1020, 'B13 [test 3] planned_qty total 1020');
    eq(r.quantity_and_fk.planned_qty_proposed, 1020, 'B14 [test 3] and nothing is proposed to change it');
    eq(r.quantity_and_fk.quantity_conserved, true, 'B15 [test 3] quantity conserved');
    eq([r.quantity_and_fk.matched_lines, r.quantity_and_fk.orphans], [6, 0], 'B16 [test 4] 6 matched, 0 orphans');
    eq(r.quantity_and_fk.matches_recorded, true, 'B17 the census matches the recorded live state');
    // The four tables, each with a stated reason, and no more.
    eq(r.tables_read.map(function (t) { return t.table; }),
        ['shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'shipping_plans', 'shipping_plan_lines'],
        'B18 exactly four tables read');
    ok(r.tables_read.every(function (t) { return t.why && t.why.length > 20; }), 'B19 and every one states why');
    // Test 22 — repeated runs are identical and zero-write.
    var again = fresh().run();
    eq(JSON.stringify(again), JSON.stringify(r), 'B20 [test 22] a repeated run is byte-identical');
    eq(again.checksum, r.checksum, 'B21 [test 22] same checksum');
    var e3 = fresh(); e3.run(); e3.run(); e3.run();
    eq(e3.events.writeAttempts, [], 'B22 [test 22] three runs, zero write attempts');
})();

// ==============================================================================================================
section('C — [tests 5, 6, 11] the four headers, classified');
// ==============================================================================================================
(function () {
    var r = fresh().run();
    var byFam = {};
    r.headers.forEach(function (h) { byFam[h.allocation_draft_id] = h; });
    var target = r.headers[0], walmart = r.headers[1], jp = r.headers[2], submitted = r.headers[3];

    // Test 5 — a blank destination stays unclassifiable. Its plan scope says Amazon; that changes nothing.
    eq(target.destination_marketplace, '(blank)', 'C1 [test 5] the target header stores no destination marketplace');
    eq(target.destination_warehouse_id, '(blank)', 'C2 [test 5] nor a destination warehouse');
    eq(target.destination_identity.ok, false, 'C3 [test 5] so it has no destination identity');
    eq(target.destination_identity.code, 'ROUTE_DESTINATION_MISSING', 'C4 [test 5] named exactly');
    eq(target.k4_classifiable, false, 'C5 [test 5] and therefore no K4 identity');
    eq(target.k4_group_key_hash, null, 'C6 [test 5] no K4 key is computed for it');
    // Test 6 — the scope marketplace is NOT promoted.
    eq(target.scope.marketplace, 'Amazon', 'C7 [test 6] its PLAN SCOPE marketplace is Amazon');
    ok(target.destination_marketplace !== 'Amazon', 'C8 [test 6] and that did NOT become its route destination');
    eq(target.evidence_rank, 'PERSISTED_LEGACY', 'C9 [test 6] ranked as legacy, never as canonical');
    eq(target.decision, 'SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE', 'C10 [test 5] adoptable only on an explicit user save');
    ok(target.decision_why.indexOf('No automated backfill') !== -1, 'C11 [test 6] and it says no automated backfill is authorised');
    eq(target.explicit_user_input_required, true, 'C12 explicit user input required');

    // A header that DOES name its destination is canonical and retainable.
    eq(walmart.destination_identity.ok, true, 'C13 the Walmart route has a destination identity');
    eq(walmart.destination_identity.type, 'WAREHOUSE', 'C14 of type WAREHOUSE');
    eq(walmart.k4_classifiable, true, 'C15 so it is K4-classifiable');
    eq(walmart.decision, 'SAFE_TO_RETAIN_AS_IS', 'C16 and safe to retain as is');
    eq(walmart.evidence_rank, 'PERSISTED_CANONICAL', 'C17 ranked canonical');
    ok(walmart.k4_proposed_id_is_a_proposal_only === true, 'C18 its K4 id is labelled a PROPOSAL, never a stored fact');
    eq(jp.decision, 'SAFE_TO_RETAIN_AS_IS', 'C19 so is the JP route');
    // The submitted header is terminal — reported, not active.
    eq(submitted.active, false, 'C20 the submitted header is not active');
    eq(submitted.status, 'submitted', 'C21 and says so');

    // Test 11 — no stored id is regenerated. The tool reports the deterministic id as a COMPARISON only.
    eq(r.headers.every(function (h) { return h.stored_id_can_be_retained; }), true, 'C22 [test 11] every stored id can be retained');
    eq(r.quantity_and_fk.retaining_current_ids_required, true, 'C23 [test 11] and retaining them is required');
    ok(r.quantity_and_fk.retaining_current_ids_why.indexOf('orphan every line') !== -1,
        'C24 [test 11] because lines are the only stored FK consumer');
    ok(TOOL_CODE.indexOf('setValue') === -1, 'C25 [test 11] and no code path could rewrite an id anyway');
    // Every header carries exactly one typed decision from the allowed set.
    var ALLOWED = ['SAFE_TO_RETAIN_AS_IS', 'SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE', 'USER_CONFIRMATION_REQUIRED',
        'CONTESTED_IDENTITY_BLOCKED', 'UNCLASSIFIABLE_ROUTE_DESTINATION_MISSING', 'DOWNSTREAM_REFERENCE_BLOCKED'];
    ok(r.headers.every(function (h) { return ALLOWED.indexOf(h.decision) !== -1; }), 'C26 every decision is from the typed set');
    eq(r.headers.length, 4, 'C27 and every header got exactly one');
    // Ids are masked.
    ok(r.headers.every(function (h) { return h.allocation_draft_id.indexOf('…') === 0 && h.allocation_draft_id.indexOf('#') > 0; }),
        'C28 every id is masked but deterministic');
})();

// ==============================================================================================================
section('D — [tests 7, 8, 9, 10] the target: persisted sea/800 versus attempted sea_express/Amazon/400');
// ==============================================================================================================
(function () {
    var r = fresh().run();
    var t = r.target;
    eq(t.target, 'ResUS / US / Amazon / CO1100-R', 'D1 the target route');
    // Persisted evidence.
    eq(t.persisted_route.service_canonical, 'sea', 'D2 persisted service is sea');
    eq(t.persisted_route.planned_qty_total, 800, 'D3 [test 9] persisted planned_qty is 800');
    eq(t.persisted_route.destination_identity.ok, false, 'D4 persisted destination is unresolvable');
    eq(t.persisted_route.destination_marketplace_cell, '(blank)', 'D5 the new column is blank on it');
    eq(t.persisted_route.evidence_rank, 'PERSISTED_LEGACY', 'D6 ranked PERSISTED_LEGACY');
    // Attempted evidence — never promoted.
    eq(t.attempted_route.evidence_rank, 'USER_ATTEMPT_EVIDENCE_ONLY', 'D7 the attempted route is evidence only');
    eq(t.attempted_route.persisted_anywhere, false, 'D8 [test 10] and is persisted nowhere');
    // Test 8 — sea is not sea_express.
    eq(t.proofs.sea_is_not_sea_express, true, 'D9 [test 8] sea !== sea_express, through the canonical resolver');
    eq(t.proofs.both_are_canonical_services, true, 'D10 [test 8] and both ARE canonical services — this is not a typo');
    eq(t.proofs.not_the_same_route_identity, true, 'D11 persisted and attempted are not the same route identity');
    eq(t.proofs.k2_keys_differ, true, 'D12 their K2 keys differ');
    eq(t.proofs.persisted_has_no_k4_identity, true, 'D13 and the persisted row has no K4 identity at all');
    // Tests 9, 10, 7 — nothing is changed, created or backfilled.
    eq(t.proofs.persisted_qty_unchanged, 800, 'D14 [test 9] 800 is reported, not changed');
    eq(t.proofs.attempted_qty_not_created, true, 'D15 [test 10] 400 is not created');
    eq(t.proofs.attempted_eta_not_backfilled, true, 'D16 [test 7] 2026-10-16 is not backfilled');
    eq(t.persisted_route.expected_arrival_cells, ['(blank)'], 'D17 [test 7] the line ETA cell is still blank');
    ok(t.proofs.scope_marketplace_does_not_repair_the_route.indexOf('Scope is a PLAN axis') !== -1,
        'D18 [test 6] Amazon scope alone does not repair the persisted sea route');
    eq(t.proofs.attempted_route_must_not_adopt_the_persisted_row, true, 'D19 the attempted route must not adopt the persisted row');

    // ---- THE FUTURE-SAVE SIMULATION, through the SHIPPED resolver ------------------------------------------
    var sim = t.future_save_simulation;
    eq(sim.zero_write, true, 'D20 the simulation writes nothing');
    // A DIFFERENT service is a DIFFERENT route: it may be created beside the legacy row.
    eq(sim.attempted_sea_express_amazon.verdict, 'CREATE_DISTINCT_K4_HEADER',
        'D21 saving sea_express + Amazon CREATES a distinct K4 header');
    eq(sim.attempted_sea_express_amazon.k4_status, 'CREATE', 'D22 the shipped K4 resolver says CREATE');
    eq(sim.attempted_sea_express_amazon.unclassifiable_rivals_matching_by_k2, [],
        'D23 and no unclassifiable row is claimed by K2 for it — because sea_express is not sea');
    eq(sim.attempted_sea_express_amazon.persistable.persistable, true, 'D24 and it is persistable now the columns exist');
    // The SAME service with Amazon supplied is the legacy row itself — refused for reconciliation.
    eq(sim.same_sea_route_with_amazon_supplied.verdict, 'K4_IDENTITY_RECONCILIATION_REQUIRED',
        'D25 supplying Amazon on the SAME sea route triggers K4_IDENTITY_RECONCILIATION_REQUIRED');
    eq(sim.same_sea_route_with_amazon_supplied.unclassifiable_rivals_matching_by_k2.length, 1,
        'D26 because exactly one unclassifiable row is claimed by K2 for it');
    ok(sim.reading_note.indexOf('difference IS the safety property') !== -1, 'D27 and the tool explains why the two differ');
})();

// ==============================================================================================================
section('E — [tests 12, 13, 14] simulated user input, collisions, downstream references');
// ==============================================================================================================
(function () {
    // Test 12 — an explicit user destination can be simulated WITHOUT writing. Proven by the fact that the
    // simulation runs against the live rows and the sheet is byte-identical afterwards.
    var env = fresh();
    var before = JSON.stringify(env.SHEETS['shipping_allocation_drafts'].grid);
    var r = env.run();
    eq(JSON.stringify(env.SHEETS['shipping_allocation_drafts'].grid), before, 'E1 [test 12] the sheet is byte-identical after the simulation');
    ok(r.target.future_save_simulation.attempted_sea_express_amazon.k4_key_hash, 'E2 [test 12] yet a K4 key was computed for the supplied destination');
    eq(env.events.writeAttempts, [], 'E3 [test 12] with zero write attempts');

    // Test 13 — a collision blocks adoption. Two active headers claiming ONE shipment group.
    var twin = FX.headers.slice();
    twin.push({ id: 'SADH-K2-EEEE5555', cycle: '2026-W36', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        status: 'draft', src: 'WH-CN-01', dst: '', method: 'sea', lastMile: 'standard', group: '1' });
    var e2 = fresh({ headers: twin });
    var r2 = e2.run();
    var contested = r2.headers.filter(function (h) { return h.contested_identity; });
    eq(contested.length, 2, 'E4 [test 13] both rivals are marked contested');
    eq(contested.map(function (h) { return h.decision; }), ['CONTESTED_IDENTITY_BLOCKED', 'CONTESTED_IDENTITY_BLOCKED'],
        'E5 [test 13] and both are BLOCKED, not silently merged');
    eq(r2.verdict, 'STOP_CONTESTED_IDENTITY', 'E6 [test 13] the global verdict stops');
    eq(r2.readiness.legacyAdoptionReady, false, 'E7 [test 13] adoption is not ready');
    eq(r2.readiness.submitReady, false, 'E8 [test 13] nor submit');

    // Test 14 — a downstream FK reference blocks re-keying. Give shipping_plan_lines a lineage column that
    // names an allocation header, which the 16_ contract says must not exist.
    var e3 = fresh({
        planLineGrid: [['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'allocation_draft_id'],
            ['SPL-1', 'SP-1', 'CO1100-R', 'SADH-K2-E7AF9242']]
    });
    var r3 = e3.run();
    eq(r3.downstream.any_stored_allocation_fk, true, 'E9 [test 14] the stored FK is detected');
    eq(r3.downstream.references.length, 1, 'E10 [test 14] and named');
    var blocked = r3.headers.filter(function (h) { return h.decision === 'DOWNSTREAM_REFERENCE_BLOCKED'; });
    eq(blocked.length, 1, 'E11 [test 14] exactly the referenced header is blocked');
    eq(blocked[0].stored_id_can_be_retained, false, 'E12 [test 14] its id cannot be freely re-keyed');
    eq(r3.verdict, 'STOP_DOWNSTREAM_REFERENCE_RISK', 'E13 [test 14] and the global verdict stops');

    // The BASELINE is the opposite, and that is the measured contract: no plan table stores an allocation FK.
    eq(r.downstream.any_stored_allocation_fk, false, 'E14 in the real shape, no downstream row stores an allocation id');
    eq(r.downstream.tables.map(function (t) { return t.stores_allocation_fk; }), [false, false],
        'E15 neither shipping_plans nor shipping_plan_lines has such a column');
    ok(r.downstream.contract_note.indexOf('prohibited') !== -1, 'E16 and 16_ says a lineage column is prohibited');
    ok(r.quantity_and_fk.submit_idempotency_binding.indexOf('submit_batch_id') !== -1,
        'E17 submit idempotency binds on the execution key, not on an allocation id');
})();

// ==============================================================================================================
section('F — [tests 15, 19] the server hydration boundaries, measured');
// ==============================================================================================================
(function () {
    var r = fresh().run();
    var b = r.hydration.boundaries;
    eq(b.map(function (x) { return x.boundary; }),
        ['1_sheet_rows', '2_active_station_scope', '3_route_identity', '4_client_route_model'],
        'F1 [test 15] four measured boundaries');
    // Every boundary reports the full census.
    ok(b.every(function (x) {
        return typeof x.header_count === 'number' && typeof x.line_count === 'number' &&
            typeof x.quantity_total === 'number' && typeof x.accepted === 'number' &&
            typeof x.dropped === 'number' && Array.isArray(x.drop_reasons);
    }), 'F2 [test 15] each reports headers, lines, quantity, accepted, dropped and reasons');
    eq(b[0].header_count, 4, 'F3 boundary 1: four sheet rows');
    eq(b[0].quantity_total, 1020, 'F4 boundary 1: 1020 units');
    // Boundary 2 — the submitted header and the two out-of-scope headers drop, each with an exact reason.
    eq(b[1].header_count, 1, 'F5 boundary 2: one header survives the ResUS/US/Amazon station scope');
    eq(b[1].dropped, 3, 'F6 [test 17] three headers drop');
    eq(b[1].drop_reasons.map(function (d) { return d.reason; }).sort(),
        ['OUT_OF_STATION_SCOPE', 'OUT_OF_STATION_SCOPE', 'TERMINAL_STATUS:submitted'],
        'F7 [test 17] and every drop has an exact typed reason');
    eq(b[1].quantity_total, 800, 'F8 boundary 2: 800 units in scope');
    // Boundary 3 — the surviving header is RETURNED without a destination identity. Not dropped: returned.
    eq(b[2].dropped, 0, 'F9 boundary 3 drops nothing');
    eq(b[2].route_identity_complete, 0, 'F10 but zero of the in-scope headers can name their destination');
    eq(b[2].drop_reasons[0].reason, 'ROUTE_DESTINATION_MISSING', 'F11 [test 17] with the exact reason');
    ok(b[2].drop_reasons[0].note.indexOf('RETURNED, not dropped') !== -1,
        'F12 and the tool is explicit that the API hands this row to the client anyway');
    // Boundary 4 — the client route model, and the value the page invents.
    var row = b[3].rows[0];
    eq(row.planned_qty_total, 800, 'F13 the client model carries 800');
    eq(row.persisted_destination_marketplace, '(blank)', 'F14 with a blank persisted destination');
    eq(row.client_would_synthesise_destination_marketplace, true, 'F15 so the page WOULD synthesise one');
    eq(row.synthesised_value_source, 'ctx.marketplace (PLAN SCOPE)', 'F16 from the plan scope');
    eq(row.synthesised_value_rank, 'UI_DERIVED_NOT_AUTHORITATIVE', 'F17 [test 6] ranked UI_DERIVED_NOT_AUTHORITATIVE');
    eq(row.client_would_emit_destination_token, false, 'F18 and it emits no MARKETPLACE_DESTINATION token');
    // Test 19 — quantity is never silently lost across a boundary.
    eq(b[1].quantity_total, b[2].quantity_total, 'F19 [test 19] boundary 2 → 3 conserves quantity');
    eq(b[2].quantity_total, b[3].quantity_total, 'F20 [test 19] boundary 3 → 4 conserves quantity');
    eq(r.hydration.quantity_conserved_across_boundaries, true, 'F21 [test 19] and the tool asserts it');
    eq(r.hydration.headers_returned_without_destination_identity, 1, 'F22 one header is returned with no destination identity');
})();

// ==============================================================================================================
section('G — [tests 16, 18] the CLIENT boundary, by executing the shipped page functions');
// ==============================================================================================================
// Nothing here describes the page. _hydrateAllocationDraftFromDb, _isRouteComplete and _execToOptionsHtml are
// extracted from assets/js/pages/inventory-replenishment.js and RUN, so the blank-route verdict is measured.
function clientEnv() {
    var sb = {
        String: String, Object: Object, Number: Number, Math: Math, JSON: JSON, Array: Array, Date: Date,
        isNaN: isNaN, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat, Boolean: Boolean,
        RegExp: RegExp, Error: Error, console: { warn: function () {}, log: function () {} }
    };
    sb.window = sb; sb.globalThis = sb;
    sb.replenAllocationDraft = { context: null, bySku: {}, targetDays: '' };
    sb._persistAllocationDraft = function () {};
    sb._irRenderDuplicateCorruptionBanner_ = function () {};
    sb.KM = { DB: {} };
    var ctx = vm.createContext(sb);
    vm.runInContext([
        'var _replenHydrateToken = 0;',
        extractFn(PAGE, '_hydrateAllocationDraftFromDb'),
        extractFn(PAGE, '_isRouteComplete'),
        extractFn(PAGE, '_execToOptionsHtml'),
        extractFn(PAGE, '_execWhOption'),
        extractFn(PAGE, '_execEsc'),
        extractFn(PAGE, '_execNameCounts'),
        extractFn(PAGE, '_execNameKey'),
        extractFn(PAGE, '_execEq'),
        extractFn(PAGE, '_execResolveIdByName')
    ].join('\n'), ctx);
    return { ctx: ctx, sb: sb, run: function (e) { return vm.runInContext(e, ctx); } };
}
(function () {
    var C = clientEnv();
    // Feed the adapter cache the SAME normalized shape the real normalizer emits for the live target row.
    C.sb.KM.DB.getShippingAllocationDrafts = function () {
        return [{ allocationDraftId: 'SADH-K2-E7AF9242', company: 'ResUS', country: 'US', marketplace: 'Amazon',
            status: 'draft',
            raw: { allocation_draft_id: 'SADH-K2-E7AF9242', company: 'ResUS', country: 'US', marketplace: 'Amazon',
                status: 'draft', recommended_source_warehouse_id: 'WH-CN-01',
                recommended_destination_warehouse_id: '',           // the live blank destination
                destination_marketplace: '',                        // the NEW column, still blank
                recommended_shipping_method: 'sea', recommended_last_mile_delivery: 'standard',
                generation_type: 'user_created' } }];
    };
    C.sb.KM.DB.getShippingAllocationDraftLines = function () {
        return [{ allocationDraftId: 'SADH-K2-E7AF9242', lineStatus: 'draft',
            raw: { allocation_draft_line_id: 'SADL-K2-16F4E4F9', allocation_draft_id: 'SADH-K2-E7AF9242',
                sku: 'CO1100-R', site_sku: 'CO1100-R-US', window_code: 'W36', planned_qty: 800,
                expected_arrival: '' } }];
    };
    var hydrated = C.run('_hydrateAllocationDraftFromDb({ country: "US", marketplace: "Amazon", company: "ResUS" })');
    eq(hydrated, true, 'G1 [test 16] the shipped hydrate ACCEPTS the row — it is not dropped');
    var rows = C.run('replenAllocationDraft.bySku["CO1100-R"]');
    eq(rows.length, 1, 'G2 [test 16] exactly one route row is produced');
    eq(rows[0].planned_qty, 800, 'G3 [test 16, 19] carrying the persisted 800 — no quantity is lost at this boundary');
    // THE SYNTHESIS, measured.
    eq(rows[0].destination_marketplace, 'Amazon', 'G4 [test 6] the page SYNTHESISES Amazon…');
    eq(rows[0].destination_type, 'MARKETPLACE_DESTINATION', 'G5 [test 6] …and a MARKETPLACE_DESTINATION type…');
    eq(rows[0].destination_warehouse_id, '', 'G6 …while the persisted destination is blank');
    ok(!('destination' in rows[0]) || !rows[0].destination, 'G7 and it emits NO destination display name');
    // The completeness gate therefore passes on a synthesised value.
    eq(C.run('_isRouteComplete(replenAllocationDraft.bySku["CO1100-R"][0])'), true,
        'G8 [test 18] so the client completeness gate PASSES — on a value the database does not hold');
    // Test 18 — the blank default editor is a DIFFERENT thing, and distinguishable.
    eq(C.run('_isRouteComplete({ ship_from: "", destination: "", shipping_method: "", qty: 0 })'), false,
        'G9 [test 18] the blank default Add Route editor is NOT complete');
    // ---- THE RENDER: why the To cell is blank even though the row hydrated -------------------------------
    C.sb.__cand = [
        { warehouseId: 'WH-US-3PL-7', warehouseName: 'US 3PL', warehouseCode: 'US-3PL-ONT', country: 'US' },
        { logicalDestination: true, token: 'MARKETPLACE_DESTINATION:Amazon', country: 'US' }
    ];
    // _renderExecutionRoute computes: toSelId = route.destination_warehouse_id || _execResolveIdByName(cand.to, route.destination)
    var toSelId = C.run('(replenAllocationDraft.bySku["CO1100-R"][0].destination_warehouse_id || ' +
        '_execResolveIdByName(__cand, replenAllocationDraft.bySku["CO1100-R"][0].destination))');
    eq(toSelId, '', 'G10 [test 18] the To selection id resolves to EMPTY for a hydrated marketplace route');
    var html = C.run('_execToOptionsHtml(__cand, ' + JSON.stringify(toSelId) + ', true)');
    ok(html.indexOf('>Amazon</option>') !== -1, 'G11 the Amazon logical option IS offered');
    ok(html.indexOf('selected>Amazon</option>') === -1, 'G12 [test 18] but it is NOT selected — the To cell renders blank');
    ok(/<option value="">To…<\/option>/.test(html), 'G13 [test 18] the placeholder "To…" is what the operator sees');
    // And it WOULD select correctly if the token were supplied — proving the gap is the missing token, not the option list.
    var html2 = C.run('_execToOptionsHtml(__cand, "MARKETPLACE_DESTINATION:Amazon", true)');
    ok(html2.indexOf('selected>Amazon</option>') !== -1, 'G14 [test 18] supplying the token DOES select Amazon');
    // The save path emits the token; the hydrate path does not. That asymmetry is the defect.
    ok(PAGE.indexOf("destination_marketplace: isLogicalAmazon ? 'Amazon' : ''") !== -1,
        'G15 [test 18] _saveAllocationDomFromDom writes the logical destination…');
    ok(PAGE.indexOf("destination_marketplace: hTo ? '' : (ctx.marketplace || '')") !== -1,
        'G16 [test 18] …but the hydrate re-derives it from scope and emits no token — the round trip is asymmetric');
})();

// ==============================================================================================================
section('H — the six readiness booleans and the one global verdict');
// ==============================================================================================================
(function () {
    var r = fresh().run();
    var R = r.readiness;
    eq(Object.keys(R).sort(), ['existingRouteHydrationReady', 'legacyAdoptionReady', 'newDistinctRouteSaveReady',
        'runtimeAuthorityReady', 'schemaReady', 'submitReady'], 'H1 exactly six booleans');
    ok(Object.keys(R).every(function (k) { return typeof R[k] === 'boolean'; }), 'H2 all booleans, none collapsed');
    eq(R.schemaReady, true, 'H3 schemaReady — the columns exist and both gates accept');
    eq(R.runtimeAuthorityReady, true, 'H4 runtimeAuthorityReady');
    eq(R.existingRouteHydrationReady, false, 'H5 existingRouteHydrationReady is FALSE — the route cannot name its own destination');
    eq(R.newDistinctRouteSaveReady, true, 'H6 newDistinctRouteSaveReady — a sea_express route can be created safely');
    eq(R.legacyAdoptionReady, true, 'H7 legacyAdoptionReady — on an explicit user save, with no collision');
    eq(R.submitReady, false, 'H8 submitReady is FALSE while an active header has no route identity');
    var VERDICTS = ['READY_FOR_CONTROLLED_UI_SAVE_TEST', 'READY_FOR_REVIEWED_USER-CONFIRMATION_PLAN',
        'STOP_CONTESTED_IDENTITY', 'STOP_HYDRATION_CONTRACT_DEFECT', 'STOP_DOWNSTREAM_REFERENCE_RISK',
        'STOP_UNCLASSIFIABLE_LEGACY_STATE'];
    ok(VERDICTS.indexOf(r.verdict) !== -1, 'H9 the verdict is from the typed set');
    eq(r.verdict, 'READY_FOR_REVIEWED_USER-CONFIRMATION_PLAN', 'H10 and it is the user-confirmation plan');
    ok(r.blocking_reasons.join(' ').indexOf('UI_DERIVED_NOT_AUTHORITATIVE') !== -1,
        'H11 naming the synthesised scope marketplace as the reason hydration is not ready');

    // A fully repaired world flips exactly the booleans it should — and nothing else.
    var repaired = FX.headers.map(function (h) {
        return h.id === 'SADH-K2-E7AF9242' ? JSON.parse(JSON.stringify(h)) : h;
    });
    repaired[0].destMkt = 'Amazon';
    var r2 = fresh({ headers: repaired }).run();
    eq(r2.readiness.existingRouteHydrationReady, true, 'H12 with the destination persisted, hydration is ready');
    eq(r2.readiness.submitReady, true, 'H13 and submit is ready');
    eq(r2.verdict, 'READY_FOR_CONTROLLED_UI_SAVE_TEST', 'H14 and the verdict becomes the controlled UI save test');
    eq(r2.headers[0].decision, 'SAFE_TO_RETAIN_AS_IS', 'H15 the target header becomes retainable as is');
    eq(r2.headers[0].k4_classifiable, true, 'H16 and K4-classifiable');
    eq(r2.quantity_and_fk.planned_qty_before, 1020, 'H17 with the quantity still 1020');
})();

// ==============================================================================================================
section('I — the authority gate, and the evidence vocabulary');
// ==============================================================================================================
(function () {
    // Without the B3/K4 authority the tool classifies NOTHING rather than guessing.
    var preB3 = RIC.replace(/function ricK4GroupKey_\(h\) \{[\s\S]*?\n\}/, 'var __gone_ = 1;');
    ok(preB3 !== RIC, 'I1 the pre-B3 fixture really differs');
    var env = makeEnv(null, { ricSrc: preB3 });
    mountAll(env);
    var r = env.run();
    ok((r.blocking_reasons || []).join(' ').indexOf('AUTHORITY_NOT_LOADED') !== -1, 'I2 AUTHORITY_NOT_LOADED');
    eq(r.headers, [], 'I3 and nothing is classified');
    eq(r.readiness.runtimeAuthorityReady, false, 'I4 runtimeAuthorityReady is false');
    eq(r.verdict, 'STOP_UNCLASSIFIABLE_LEGACY_STATE', 'I5 with a STOP verdict');
    eq(env.events.writeAttempts, [], 'I6 and still zero write attempts');

    var full = fresh().run();
    eq(full.evidence_ranks, ['PERSISTED_CANONICAL', 'PERSISTED_LEGACY', 'DOWNSTREAM_AUTHORITATIVE_REFERENCE',
        'USER_ATTEMPT_EVIDENCE_ONLY', 'UI_DERIVED_NOT_AUTHORITATIVE', 'NO_EVIDENCE'], 'I7 the six evidence ranks, in order');
    ok(full.never_promoted_into_persisted_identity.length >= 10, 'I8 and the never-promoted list is stated');
    ok(full.never_promoted_into_persisted_identity[0].indexOf('ctx.marketplace') !== -1,
        'I9 naming the exact line of shipped client code that synthesises a destination');
})();

// ==============================================================================================================
section('J — [test 23] mutation tests: every guard is load-bearing');
// ==============================================================================================================
var MUTATIONS = [
    {
        name: 'M1 the authority gate no longer requires the K4 key function',
        from: "  need('ricK4GroupKey_', typeof ricK4GroupKey_ === 'function');", to: "  need('ricK4GroupKey_', true);",
        probe: function (tool) {
            var preB3 = RIC.replace(/function ricK4GroupKey_\(h\) \{[\s\S]*?\n\}/, 'var __gone_ = 1;');
            var e = makeEnv(tool, { ricSrc: preB3 }); mountAll(e);
            var r = e.run();
            return (r.blocking_reasons || []).join(' ').indexOf('AUTHORITY_NOT_LOADED') !== -1;
        }
    },
    {
        name: 'M2 an unresolvable destination is treated as classifiable',
        from: '  var classifiable = dest.ok === true;', to: '  var classifiable = true;',
        probe: function (tool) {
            var e = makeEnv(tool); mountAll(e);
            var r = e.run();
            return r.headers[0].k4_classifiable === false && r.readiness.existingRouteHydrationReady === false;
        }
    },
    {
        name: 'M3 the scope marketplace is promoted into the route destination',
        from: '    destination_marketplace: tb5Str_(h.destination_marketplace) || \'(blank)\',',
        to: '    destination_marketplace: tb5Str_(h.destination_marketplace) || tb5Str_(h.marketplace) || \'(blank)\',',
        probe: function (tool) {
            var e = makeEnv(tool); mountAll(e);
            var r = e.run();
            return r.headers[0].destination_marketplace === '(blank)';
        }
    },
    {
        name: 'M4 the contested-identity check is removed',
        from: '  } else if (k2Rivals.length || k4Rivals.length) {', to: '  } else if (false) {',
        probe: function (tool) {
            var twin = FX.headers.concat([{ id: 'SADH-K2-EEEE5555', cycle: '2026-W36', company: 'ResUS', country: 'US',
                marketplace: 'Amazon', status: 'draft', src: 'WH-CN-01', dst: '', method: 'sea', lastMile: 'standard', group: '1' }]);
            var e = makeEnv(tool); mountAll(e, { headers: twin });
            var r = e.run();
            return r.verdict === 'STOP_CONTESTED_IDENTITY' &&
                r.headers.filter(function (h) { return h.decision === 'CONTESTED_IDENTITY_BLOCKED'; }).length === 2;
        }
    },
    {
        name: 'M5 the downstream-reference check is removed',
        from: '  if (refs.length) {', to: '  if (false) {',
        probe: function (tool) {
            var e = makeEnv(tool);
            mountAll(e, { planLineGrid: [['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'allocation_draft_id'],
                ['SPL-1', 'SP-1', 'CO1100-R', 'SADH-K2-E7AF9242']] });
            var r = e.run();
            return r.verdict === 'STOP_DOWNSTREAM_REFERENCE_RISK' &&
                r.headers.filter(function (h) { return h.decision === 'DOWNSTREAM_REFERENCE_BLOCKED'; }).length === 1;
        }
    },
    {
        name: 'M6 the B3 rival rule stops restricting rivals to unclassifiable rows',
        from: '    var legacyRivals = (activeRows || []).filter(function (r) { return !ricDestinationIdentity_(r).ok; });',
        to: '    var legacyRivals = (activeRows || []).slice();',
        probe: function (tool) {
            // The rival must be a row K4 CAN classify that nonetheless shares the attempted route's K2 key.
            // K2 has no destination-marketplace dimension, so a Walmart-destination sea_express row on the same
            // scope/source/group collides in K2 and NOT in K4 — exactly the case the B3 restriction exists for.
            var rivals = FX.headers.concat([{ id: 'SADH-K4-77778888', cycle: '2026-W36', company: 'ResUS',
                country: 'US', marketplace: 'Amazon', status: 'draft', src: 'WH-CN-01', dst: '',
                destMkt: 'Walmart', method: 'sea_express', lastMile: 'standard', group: '1' }]);
            var e = makeEnv(tool); mountAll(e, { headers: rivals });
            var r = e.run();
            // A different route must still be creatable beside it.
            return r.target.future_save_simulation.attempted_sea_express_amazon.verdict === 'CREATE_DISTINCT_K4_HEADER';
        }
    },
    {
        name: 'M7 existingRouteHydrationReady stops requiring a persisted destination',
        from: '    existingRouteHydrationReady: unclassifiable.length === 0,', to: '    existingRouteHydrationReady: true,',
        probe: function (tool) {
            var e = makeEnv(tool); mountAll(e);
            var r = e.run();
            return r.readiness.existingRouteHydrationReady === false;
        }
    },
    {
        name: 'M8 submitReady stops requiring zero orphans',
        from: '      out.quantity_and_fk.orphans === 0 && out.quantity_and_fk.duplicate_line_identities.length === 0 &&',
        to: '      true &&',
        probe: function (tool) {
            var orphaned = FX.lines.concat([{ id: 'SADL-K2-99999999', fk: 'SADH-GONE-0000', sku: 'CO1100-R', qty: 0 }]);
            var repaired = JSON.parse(JSON.stringify(FX.headers));
            repaired[0].destMkt = 'Amazon';
            var e = makeEnv(tool); mountAll(e, { headers: repaired, lines: orphaned });
            var r = e.run();
            return r.quantity_and_fk.orphans === 1 && r.readiness.submitReady === false;
        }
    },
    {
        name: 'M9 the terminal-status filter is removed from the hydration boundary',
        from: '    if (SAD_TERMINAL_STATUSES_[tb5Lc_(h.status)]) { dropped2.push({ id: tb5Mask_(h.allocation_draft_id), reason: \'TERMINAL_STATUS:\' + tb5Str_(h.status) }); return false; }',
        to: '    if (false) { return false; }',
        probe: function (tool) {
            var e = makeEnv(tool); mountAll(e);
            var r = e.run();
            var b2 = r.hydration.boundaries[1];
            return b2.header_count === 1 &&
                b2.drop_reasons.some(function (d) { return d.reason === 'TERMINAL_STATUS:submitted'; });
        }
    },
    {
        name: 'M10 the quantity census stops rejecting blank cells as unknown',
        from: '  if (s === \'\') return null;                       // blank is UNKNOWN, never zero',
        to: '  if (s === \'\') return 0;',
        probe: function (tool) {
            var holed = JSON.parse(JSON.stringify(FX.lines));
            holed[0].qty = '';
            var e = makeEnv(tool); mountAll(e, { lines: holed });
            var r = e.run();
            return r.quantity_and_fk.planned_qty_unknown_cells === 1;
        }
    },
    {
        name: 'M11 the attempted route is allowed to be reported as persisted',
        from: '      persisted_anywhere: false,', to: '      persisted_anywhere: true,',
        probe: function (tool) {
            var e = makeEnv(tool); mountAll(e);
            return e.run().target.attempted_route.persisted_anywhere === false;
        }
    },
    {
        name: 'M12 the ETA backfill proof stops reading the actual cells',
        from: '    attempted_eta_not_backfilled: mine.every(function (l) { return tb5Str_(l.expected_arrival) === \'\'; }),',
        to: '    attempted_eta_not_backfilled: true,',
        probe: function (tool) {
            var withEta = JSON.parse(JSON.stringify(FX.lines));
            withEta[0].eta = '2026-10-16';
            var e = makeEnv(tool); mountAll(e, { lines: withEta });
            // A live sheet that already carried the attempted ETA must NOT be reported as "not backfilled".
            return e.run().target.proofs.attempted_eta_not_backfilled === false;
        }
    },
    {
        // The finding this whole round turns on: the page INVENTS a destination when the header stores none.
        // (The read-only façade is deliberately NOT mutation-tested — the tool never writes with or without it,
        // so no behavioural probe can tell the two apart. Its guarantee is structural and A7 asserts it.)
        name: 'M13 the client-synthesis detection is switched off',
        from: '      client_would_synthesise_destination_marketplace: !hTo,',
        to: '      client_would_synthesise_destination_marketplace: false,',
        probe: function (tool) {
            var e = makeEnv(tool); mountAll(e);
            var row = e.run().hydration.boundaries[3].rows[0];
            return row.client_would_synthesise_destination_marketplace === true &&
                row.synthesised_value_rank === 'UI_DERIVED_NOT_AUTHORITATIVE';
        }
    },
    {
        name: 'M14 the K4 proposal stops being labelled a proposal',
        from: '    k4_proposed_id_is_a_proposal_only: true,', to: '    k4_proposed_id_is_a_proposal_only: false,',
        probe: function (tool) {
            var e = makeEnv(tool); mountAll(e);
            return e.run().headers.every(function (h) { return h.k4_proposed_id_is_a_proposal_only === true; });
        }
    },
    {
        // Bypassing the canonicaliser on the two FIXED target strings is undetectable, because 'sea' and
        // 'sea_express' are already canonical. Attack it where the DATA varies instead: a stored service the
        // authority refuses must not be treated as keyable just because it is a non-empty string.
        name: 'M15 the stored service is no longer put through the canonical authority',
        from: '  var svcCanon = ricCanonicalService_(svcRaw);', to: '  var svcCanon = svcRaw;',
        probe: function (tool) {
            var bogus = JSON.parse(JSON.stringify(FX.headers));
            bogus[1].method = 'seafood';            // a neighbour of 'sea' that must NEVER resolve to it
            var e = makeEnv(tool); mountAll(e, { headers: bogus });
            var h = e.run().headers[1];
            return h.shipping_service_canonical === '(NOT CANONICAL)' &&
                h.decision === 'USER_CONFIRMATION_REQUIRED';
        }
    },
    {
        // And the positive half of the same rule: an exact alias DOES resolve, and only exactly.
        name: 'M16 the canonical service lookup accepts a non-exact spelling',
        from: '  var svcCanon = ricCanonicalService_(svcRaw);', to: "  var svcCanon = ricCanonicalService_(svcRaw) || (String(svcRaw).indexOf('sea') === 0 ? 'sea' : '');",
        probe: function (tool) {
            var aliased = JSON.parse(JSON.stringify(FX.headers));
            aliased[1].method = 'seafood';
            var e = makeEnv(tool); mountAll(e, { headers: aliased });
            var h = e.run().headers[1];
            return h.shipping_service_canonical === '(NOT CANONICAL)';
        }
    }
];

(function () {
    // BASELINE — every probe must hold on the SHIPPED tool. A probe that is already false tests nothing.
    MUTATIONS.forEach(function (m) {
        var held = false;
        try { held = m.probe(TOOL) === true; } catch (e) { held = false; console.error('  baseline threw: ' + e.message); }
        ok(held, 'J-baseline ' + m.name + ' — the probe holds on the shipped tool');
    });
    var caught = 0;
    MUTATIONS.forEach(function (m) {
        var mutated;
        try { mutated = swap(TOOL, m.from, m.to); }
        catch (e) { ok(false, 'J ' + m.name + ' — ' + e.message); return; }
        ok(mutated !== TOOL, 'J ' + m.name + ' — the mutation really changed the source');
        var survived;
        try { survived = m.probe(mutated) === true; } catch (e) { survived = false; }
        if (!survived) caught++;
        ok(!survived, 'J ' + m.name + ' — CAUGHT');
    });
    eq(caught, MUTATIONS.length, 'J-total all ' + MUTATIONS.length + ' mutations caught');
})();

// ==============================================================================================================
section('K — the neighbours this round must not have disturbed');
// ==============================================================================================================
(function () {
    eq((HEALTH.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1], '10', 'K1 action contract stays 10');
    eq((HEALTH.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1], '9', 'K2 required-action list version stays 9');
    eq((HEALTH.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/) || [])[1], '1', 'K3 transport contract stays 1');
    eq((SAD.match(/var SAD_BUILD_VERSION_ = '([^']+)';/) || [])[1], 'F1-7N-FB-4F-B3', 'K4 the allocation owner build is unmoved');
    eq((RIC.match(/var RIC_BUILD_VERSION_ = '([^']+)';/) || [])[1], 'F1-7N-FB-4F-B3', 'K5 the identity contract build is unmoved');
    eq((ROUTER.match(/var RTR_BUILD_VERSION_ = '([^']+)';/) || [])[1], 'F1-7N-FB-4E-R4B-R3', 'K6 the router build is unmoved');
    // The B4 migration helper is untouched and still the only thing that can write a column.
    var B4 = lf(fs.readFileSync(path.join(TOOLS_MIG, 'TEMP_shipping_allocation_schema_b4_append.gs'), 'utf8'));
    ok(/var TEMP_B4_REVIEWED_CHECKSUM_ = '';/.test(B4), 'K7 the B4 helper still ships with a blank reviewed checksum');
    // No frontend change in this round.
    ok(PAGE.indexOf('tb5') === -1, 'K8 the page carries no B5 symbol — no frontend change');
    // Production runtime never appends a column during a request.
    ok(SAD.indexOf('insertColumnsAfter') === -1, 'K9 the allocation handler never appends a column during a request');
})();

// ==============================================================================================================
section('L — [R1] the COMPACT view: one builder, two renderings');
// ==============================================================================================================
(function () {
    var env = fresh();
    var full = env.run();
    var env2 = fresh();
    var sum = env2.summary();

    // Test 1 — the SAME report. Not a similar one, not a subset: the identical object.
    eq(JSON.stringify(sum), JSON.stringify(full), 'L1 [test 1] SUMMARY returns exactly the report the DRY RUN returns');
    ok(/function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN\(\) \{\s*\n\s*var out = tb5BuildReport_\(\);/.test(TOOL),
        'L2 [test 1] the full dry run calls the core builder');
    ok(/function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_SUMMARY\(\) \{\s*\n\s*var out = tb5BuildReport_\(\);/.test(TOOL),
        'L3 [test 1] and so does the summary');
    eq((TOOL_CODE.match(/tb5BuildReport_\(\)/g) || []).length, 3, 'L4 [test 1] one definition, two call sites');

    // Test 2 — the compact view FORMATS. It owns no rule.
    var emit = TOOL.slice(TOOL.indexOf('function tb5EmitCompact_'), TOOL.indexOf('function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_SUMMARY'));
    var emitCode = stripComments(emit);
    ['ricK4GroupKey_', 'ricDestinationIdentity_', 'ricCanonicalService_', 'sadK2GroupKey_', 'sadK4ResolveActiveDraft_',
        'tb5ClassifyHeader_', 'tb5TargetAnalysis_', 'tb5HydrationTrace_', 'tb5QuantityAndFk_', 'tb5ReadTable_',
        'SpreadsheetApp'].forEach(function (f) {
        ok(emitCode.indexOf(f) === -1, 'L5 [test 2] the compact view never calls ' + f);
    });
    // It also decides nothing: no decision or verdict token is authored here.
    ['SAFE_TO_RETAIN_AS_IS', 'SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE', 'CONTESTED_IDENTITY_BLOCKED',
        'READY_FOR_CONTROLLED_UI_SAVE_TEST', 'STOP_CONTESTED_IDENTITY', 'K4_IDENTITY_RECONCILIATION_REQUIRED']
        .forEach(function (v) { ok(emit.indexOf(v) === -1, 'L6 [test 2] and never authors the token ' + v); });

    // Test 4 — one HEADER line per header, numbered, and the count is the report's own.
    var lines = env2.compact();
    var hLines = lines.filter(function (m) { return /^H\d+\//.test(m); });
    eq(hLines.length, sum.headers.length, 'L7 [test 4] one H-line per header (' + hLines.length + ')');
    eq((lines.filter(function (m) { return m.indexOf('HEADERS total=') === 0; })[0] || ''),
        'HEADERS total=' + sum.headers.length, 'L8 [test 4] and the declared total matches');
    hLines.forEach(function (m, i) {
        ok(m.indexOf('H' + (i + 1) + '/' + sum.headers.length + ' ') === 0, 'L9 [test 4] H' + (i + 1) + ' is ordinal ' + (i + 1) + ' of ' + sum.headers.length);
    });

    // Test 5 — all six readiness booleans, on one line, none omitted.
    var rdy = lines.filter(function (m) { return m.indexOf('READY ') === 0; })[0] || '';
    ['schemaReady', 'runtimeAuthorityReady', 'existingRouteHydrationReady', 'newDistinctRouteSaveReady',
        'legacyAdoptionReady', 'submitReady'].forEach(function (k) {
        ok(new RegExp('\\b' + k + '=[YN?]').test(rdy), 'L10 [test 5] READY carries ' + k);
    });
    eq(Object.keys(sum.readiness).length, 6, 'L11 [test 5] and the report has exactly six');

    // Test 6 — the verdict and the footer are their own lines, and they are LAST.
    var vIdx = lines.map(function (m, i) { return m.indexOf('VERDICT ') === 0 ? i : -1; }).filter(function (i) { return i >= 0; });
    eq(vIdx.length, 1, 'L12 [test 6] exactly one VERDICT line');
    ok(lines[vIdx[0]].indexOf('VERDICT ' + sum.verdict) === 0, 'L13 [test 6] carrying the report verdict');
    eq(lines[lines.length - 1], 'DB_WRITES=0 · ROWS_CHANGED=0 · BACKFILLS=0 · IDS_CREATED=0 · K4_IDS_CREATED=0',
        'L14 [test 6] and the FOOTER is the very last line');
    ok(vIdx[0] === lines.length - 2, 'L15 [test 6] with the verdict immediately before it');
    // Sized so a transcript shows them: every line is short, and the whole emission is small.
    var total = lines.join('\n').length;
    ok(lines.every(function (m) { return m.length <= 400; }), 'L16 [test 6] every compact line is <= 400 chars');
    ok(total < 8000, 'L17 [test 6] the whole compact emission is under 8KB (' + total + ')');
    // The full report, by contrast, is what gets cut off — which is why this view exists.
    ok(JSON.stringify(full, null, 2).length > total * 3,
        'L18 [test 6] the full pretty-printed report is far larger (' + JSON.stringify(full, null, 2).length + ')');

    // Test 7 — no large arrays, no line ids, no natural keys, no raw rows.
    var blob = lines.join('\n');
    (sum.headers[0].line_ids || []).forEach(function (id) {
        ok(blob.indexOf(id) === -1, 'L19 [test 7] no line id leaks into the compact view');
    });
    ['line_natural_keys', 'current_headers_ordered', 'never_promoted', 'evidence_ranks', 'tables_read', 'note_ref']
        .forEach(function (k) { ok(blob.indexOf(k) === -1, 'L20 [test 7] no ' + k + ' array in the compact view'); });
    ok(blob.indexOf('site_sku') === -1, 'L21 [test 7] and no natural-key field names');

    // Test 9 / 10 — the guarantees the full dry run already had are unchanged by the second entry point.
    eq(env2.events.writeAttempts, [], 'L22 [test 9] the summary made no mutation call');
    eq([sum.DB_WRITES, sum.ROWS_CHANGED, sum.BACKFILLS, sum.IDS_CREATED], [0, 0, 0, 0], 'L23 [test 10] every counter is zero');
    eq(TOOL.match(/^function TEMP_[A-Z0-9_]+\(/gm) || [],
        ['function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN(',
         'function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_SUMMARY('],
        'L24 [test 10] exactly two public entry points, both read-only');
    ok(/function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_SUMMARY\(\)/.test(TOOL), 'L25 [test 10] the summary takes no arguments');
    ['LockService', 'PropertiesService', 'setValue', 'appendRow', 'COMMIT'].forEach(function (m) {
        ok(TOOL_CODE.indexOf(m) === -1, 'L26 [test 10] still no ' + m + ' anywhere in the code');
    });

    // ONE snapshot per call: the drafts table is read the same number of times either way.
    var e3 = fresh(); e3.run(); var readsFull = e3.events.reads;
    var e4 = fresh(); e4.summary(); var readsSum = e4.events.reads;
    eq(readsSum, readsFull, 'L27 the summary reads the live snapshot exactly as many times as the dry run');
})();

// ==============================================================================================================
section('M — [R1, tests 3, 8] a header with NO lines is still a header, and nothing live is hardcoded');
// ==============================================================================================================
(function () {
    // The shape the first live run actually showed: destinations blank, and two headers with line_count = 0.
    var env = fresh({ headers: FX_LIVE_SHAPED, lines: FX_LIVE_SHAPED_LINES });
    var r = env.summary();
    var lines = env.compact();
    var hLines = lines.filter(function (m) { return /^H\d+\//.test(m); });

    eq(r.headers.length, 3, 'M1 three headers in this shape');
    eq(hLines.length, 3, 'M2 [test 3] and three H-lines — none dropped');
    eq(r.headers.map(function (h) { return h.line_count; }), [0, 0, 5], 'M3 two of them have NO lines');
    // Test 3 — the zero-line headers are emitted, with their zero stated.
    ok(hLines[0].indexOf('lines=0') !== -1, 'M4 [test 3] H1 reports lines=0 rather than being skipped');
    ok(hLines[1].indexOf('lines=0') !== -1, 'M5 [test 3] H2 reports lines=0 rather than being skipped');
    ok(hLines[2].indexOf('lines=5') !== -1 && hLines[2].indexOf('qty=220') !== -1, 'M6 H3 reports its 5 lines and 220 units');
    // Every header line carries the full field set the compact contract requires.
    ['id=', 'fam=', 'st=', 'active=', 'scope=', 'dest=', 'svc=', 'lines=', 'qty=', 'dsref=', 'k2match=',
        'k4able=', 'contested=', 'needsUser=', ' -> '].forEach(function (f) {
        ok(hLines.every(function (m) { return m.indexOf(f) !== -1; }), 'M7 every H-line carries ' + f);
    });
    // A blank destination is REPORTED as unclassifiable, from the authority, not guessed.
    ok(hLines.every(function (m) { return m.indexOf('k4able=N') !== -1; }), 'M8 all three are K4-unclassifiable — no destination stored');
    ok(hLines.every(function (m) { return m.indexOf('ROUTE_DESTINATION_MISSING') !== -1; }), 'M9 named by the contract code');

    // Test 8 — nothing live is hardcoded. Change the data, the output changes with it.
    var alt = JSON.parse(JSON.stringify(FX_LIVE_SHAPED));
    alt[0].method = 'sea';
    alt[0].destMkt = 'Amazon';
    var env2 = fresh({ headers: alt, lines: FX_LIVE_SHAPED_LINES });
    env2.summary();
    var alt1 = env2.compact().filter(function (m) { return /^H1\//.test(m); })[0];
    ok(alt1.indexOf('svc=sea ') !== -1, 'M10 [test 8] the service in the output follows the data');
    ok(alt1.indexOf('k4able=Y') !== -1, 'M11 [test 8] and so does classifiability');
    ok(alt1.indexOf('MARKETPLACE') !== -1, 'M12 [test 8] and the destination type');
    // The formatter contains no live literal at all.
    var emit = TOOL.slice(TOOL.indexOf('function tb5EmitCompact_'), TOOL.indexOf('function TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_SUMMARY'));
    // Identities, scopes, SKUs and outcome RANKS must be read off the report, never authored here. (Numeric
    // constants are deliberately NOT on this list - a truncation length is not a live measurement, and that the
    // numbers follow the data is proven above by changing the data, which is the stronger test.)
    // Look at the formatter's STRING LITERALS, not at its source text. `sim.attempted_sea_express_amazon`
    // is a property of the report being read; a quoted 'sea_express' would be a value being authored.
    // The first draft of this line could not tell those apart and failed on the property name.
    var emitLiterals = (emit.match(/'[^']*'/g) || []).join(' | ');
    ['SADH-', 'SADL-', 'ResUS', 'ResTW', 'Walmart', 'CO1100', 'sea_express', 'PERSISTED_CANONICAL',
        'PERSISTED_LEGACY', 'USER_ATTEMPT_EVIDENCE_ONLY', 'ROUTE_DESTINATION_MISSING', 'MARKETPLACE_DESTINATION:']
        .forEach(function (v) {
            ok(emitLiterals.indexOf(v) === -1, 'M13 [test 8] the formatter authors no live value: ' + v);
        });
    // 'Amazon' appears only as the scope the CLIENT synthesises from, read off the report, never as a fact.
    ok(emit.indexOf("'Amazon'") === -1, 'M14 [test 8] not even a marketplace literal');

    // Quantity is carried through untouched.
    eq(r.quantity_and_fk.planned_qty_before, 220, 'M15 the census follows the fixture, not a constant');
    eq(r.quantity_and_fk.orphans, 0, 'M16 no orphans in this shape');
})();

// ==============================================================================================================
section('N — [R1, test 11] the planning doc separates fixture from live evidence');
// ==============================================================================================================
(function () {
    var DOC = lf(fs.readFileSync(path.join(ROOT, 'docs', 'planning',
        'LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md'), 'utf8'));
    ok(/B5\.9/.test(DOC), 'N1 [test 11] the correction section exists');
    ok(/CORRECTION/i.test(DOC), 'N2 [test 11] and is labelled a correction');
    // The three evidence classes are named and kept apart.
    ['offline fixture', 'user-reported', 'live runtime'].forEach(function (k) {
        ok(new RegExp(k, 'i').test(DOC), 'N3 [test 11] the doc names the "' + k + '" evidence class');
    });
    // The retracted claims are named as retracted, not silently deleted.
    ok(/Walmart/.test(DOC), 'N4 [test 11] the Walmart row is still discussed…');
    var b59 = DOC.slice(DOC.indexOf('## B5.9'));
    ok(/fixture/i.test(b59) && /Walmart/.test(b59), 'N5 [test 11] …and B5.9 says it was a FIXTURE row, not live');
    ok(/not been observed|fourth|truncat/i.test(b59), 'N6 [test 11] the unobserved fourth header is declared, not guessed');
    // No authorization creeps in.
    ok(!/authoris(e|ed) (a )?(destination )?backfill|proceed with the backfill/i.test(b59),
        'N7 [test 11] and nothing in the correction authorises a backfill');
})();

// ==============================================================================================================
section('O — [R1, test 12] mutation tests for the compact view');
// ==============================================================================================================
(function () {
    var MUT = [
        {
            name: 'O-M1 a header with no lines is skipped',
            from: '  hs.forEach(function (h, i) {\n    var di = h.destination_identity || {};',
            to: '  hs.forEach(function (h, i) {\n    if (!h.line_count) return;\n    var di = h.destination_identity || {};',
            probe: function (tool) {
                var e = makeEnv(tool); mountAll(e, { headers: FX_LIVE_SHAPED, lines: FX_LIVE_SHAPED_LINES });
                var r = e.summary();
                return e.compact().filter(function (m) { return /^H\d+\//.test(m); }).length === r.headers.length;
            }
        },
        {
            name: 'O-M2 the last header is dropped',
            from: '  var hs = r.headers || [];',
            to: '  var hs = (r.headers || []).slice(0, -1);',
            probe: function (tool) {
                var e = makeEnv(tool); mountAll(e);
                var r = e.summary();
                var h = e.compact().filter(function (m) { return /^H\d+\//.test(m); });
                return h.length === r.headers.length && r.headers.length === 4;
            }
        },
        {
            name: 'O-M3 one readiness boolean is omitted',
            from: "    ' legacyAdoptionReady=' + tb5B_(rd.legacyAdoptionReady) +\n",
            to: '',
            probe: function (tool) {
                var e = makeEnv(tool); mountAll(e);
                e.summary();
                var rdy = e.compact().filter(function (m) { return m.indexOf('READY ') === 0; })[0] || '';
                return ['schemaReady', 'runtimeAuthorityReady', 'existingRouteHydrationReady',
                    'newDistinctRouteSaveReady', 'legacyAdoptionReady', 'submitReady']
                    .every(function (k) { return new RegExp('\\b' + k + '=[YN?]').test(rdy); });
            }
        },
        {
            name: 'O-M4 the summary classifies rows its own way instead of reading the report',
            from: "      ' svc=' + tb5V_(h.shipping_service_canonical) +",
            to: "      ' svc=' + tb5V_(h.shipping_service_raw) +",
            probe: function (tool) {
                // A stored service the authority REFUSES must not be printed as if it were canonical.
                var bogus = JSON.parse(JSON.stringify(FX_LIVE_SHAPED));
                bogus[0].method = 'seafood';
                var e = makeEnv(tool); mountAll(e, { headers: bogus, lines: FX_LIVE_SHAPED_LINES });
                e.summary();
                var h1 = e.compact().filter(function (m) { return /^H1\//.test(m); })[0] || '';
                return h1.indexOf('svc=(NOT CANONICAL)') !== -1;
            }
        },
        {
            name: 'O-M5 a live value is hardcoded into the logger',
            from: "  tb5Line_('VERDICT ' + tb5V_(r.verdict) + ' checksum=' + tb5V_(r.checksum));",
            to: "  tb5Line_('VERDICT READY_FOR_REVIEWED_USER-CONFIRMATION_PLAN checksum=' + tb5V_(r.checksum));",
            probe: function (tool) {
                // Repair every header, and the verdict must MOVE with the data.
                var repaired = JSON.parse(JSON.stringify(FX_LIVE_SHAPED));
                repaired.forEach(function (h) { h.destMkt = 'Amazon'; });
                var e = makeEnv(tool); mountAll(e, { headers: repaired, lines: FX_LIVE_SHAPED_LINES });
                var r = e.summary();
                var v = e.compact().filter(function (m) { return m.indexOf('VERDICT ') === 0; })[0] || '';
                return v.indexOf('VERDICT ' + r.verdict) === 0 && r.verdict === 'READY_FOR_CONTROLLED_UI_SAVE_TEST';
            }
        },
        {
            name: 'O-M6 the footer loses DB_WRITES=0',
            from: "  tb5Line_('DB_WRITES=0 · ROWS_CHANGED=0 · BACKFILLS=0 · IDS_CREATED=0 · K4_IDS_CREATED=0');",
            to: "  tb5Line_('ROWS_CHANGED=0 · BACKFILLS=0 · IDS_CREATED=0 · K4_IDS_CREATED=0');",
            probe: function (tool) {
                var e = makeEnv(tool); mountAll(e);
                e.summary();
                var lines = e.compact();
                return lines[lines.length - 1] === 'DB_WRITES=0 · ROWS_CHANGED=0 · BACKFILLS=0 · IDS_CREATED=0 · K4_IDS_CREATED=0';
            }
        },
        {
            name: 'O-M7 the attempted route is printed as a persisted fact',
            from: "    ' rank=' + tb5V_(a.evidence_rank) + ' persisted_anywhere=' + tb5B_(a.persisted_anywhere));",
            to: "    ' rank=PERSISTED_CANONICAL persisted_anywhere=Y');",
            probe: function (tool) {
                var e = makeEnv(tool); mountAll(e);
                var r = e.summary();
                var t = e.compact().filter(function (m) { return m.indexOf('TARGET attempted ') === 0; })[0] || '';
                return t.indexOf('rank=USER_ATTEMPT_EVIDENCE_ONLY') !== -1 &&
                    t.indexOf('persisted_anywhere=N') !== -1 &&
                    r.target.attempted_route.persisted_anywhere === false;
            }
        }
    ];

    var caught = 0;
    MUT.forEach(function (m) {
        var held = false;
        try { held = m.probe(TOOL) === true; } catch (e) { held = false; console.error('  baseline threw: ' + e.message); }
        ok(held, 'O-baseline ' + m.name + ' — the probe holds on the shipped tool');
        var mutated;
        try { mutated = swap(TOOL, m.from, m.to); }
        catch (e) { ok(false, 'O ' + m.name + ' — ' + e.message); return; }
        ok(mutated !== TOOL, 'O ' + m.name + ' — the mutation really changed the source');
        var survived;
        try { survived = m.probe(mutated) === true; } catch (e) { survived = false; }
        if (!survived) caught++;
        ok(!survived, 'O ' + m.name + ' — CAUGHT');
    });
    eq(caught, MUT.length, 'O-total all ' + MUT.length + ' compact-view mutations caught');
})();

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
