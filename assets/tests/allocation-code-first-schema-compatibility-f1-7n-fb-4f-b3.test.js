// F1-7N-FB-4F-B3 — CODE-FIRST SCHEMA COMPATIBILITY.
//
// B2 measured, against this repository's own write gate, that appending either new column BEFORE the runtime
// knows about it makes EVERY allocation read and write fail closed. The header gate is positional and exact, so
// a column the authority has never heard of is not an inert blank — it is a mismatch at an index:
//
//     header live 30 + destination_marketplace -> COL30_IS_destination_marketplace_EXPECTED_generation_run_id
//     header live 34 + destination_marketplace -> COL_COUNT_35_EXPECTED_30_TO_34
//     line   live 30 + expected_arrival        -> COL_COUNT_31_EXPECTED_30
//
// B3 is the answer: the authority learns both columns as OPTIONAL tail entries, which makes a pre-append sheet
// and a post-append sheet BOTH exact and leaves the append and the sync order-independent afterwards. Code
// first, then schema.
//
// THIS SUITE EXECUTES THE SHIPPED WRITER. Nothing here describes the runtime — it runs sadAtomicUpsertCore_ from
// 16_shipping_allocation_handlers.gs against an in-memory spreadsheet at each of the three schema stages the
// deployment will actually pass through (30/30 now, 34/30 after the lifecycle tail, 35/31 after both appends)
// and checks what ends up in the cells. The identity rules come from 69_api_v1_route_identity_contract.gs,
// loaded whole, because a second implementation of an identity rule is a second answer waiting to disagree.
//
// Run: node assets/tests/allocation-code-first-schema-compatibility-f1-7n-fb-4f-b3.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var GS = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
var TOOLS_DIAG = path.join(ROOT, 'assets', 'tools', 'apps-script-diagnostics');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

// Every source is normalized to LF on the way in. This repository mixes line endings and core.autocrlf rewrites
// the working copy on checkout, so an anchor written with a bare \n matches NOTHING on a machine that checked
// the file out the other way — the defect that silently disarmed six of B1's mutation tests.
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }
function read(rel) { return lf(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function readGs(f) { return lf(fs.readFileSync(path.join(GS, f), 'utf8')); }
function stripComments(src) {
    return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}
function code(src) {
    return stripComments(src).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}
function swap(src, from, to) {
    if (src.indexOf(from) === -1) throw new Error('mutation anchor absent: ' + from.slice(0, 70));
    var out = src.split(from).join(to);
    if (out === src) throw new Error('mutation changed nothing: ' + from.slice(0, 70));
    return out;
}

var SAD = readGs('16_shipping_allocation_handlers.gs');
var RIC = readGs('69_api_v1_route_identity_contract.gs');
var G13 = readGs('13_procurement_handlers.gs');
var HEALTH = readGs('63_api_v1_system_health.gs');
var ROUTER = readGs('01_router.gs');
var SADC = code(SAD);

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

// ==============================================================================================================
// THE IN-MEMORY SPREADSHEET — the ONLY thing simulated. Every rule under test runs from the shipped source.
// ==============================================================================================================
function makeEnv(sadSrc, ricSrc) {
    var SHEETS = {};
    var sandbox = {
        String: String, Object: Object, Math: Math, Number: Number, JSON: JSON, Array: Array, Date: Date,
        isNaN: isNaN, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat, RegExp: RegExp,
        Boolean: Boolean, Error: Error, console: console
    };
    sandbox.globalThis = sandbox;

    function FakeSheet(headers) { this.rows = [headers.slice()]; this.name = ''; }
    FakeSheet.prototype.getName = function () { return this.name; };
    FakeSheet.prototype.getLastColumn = function () { return this.rows[0].length; };
    FakeSheet.prototype.getLastRow = function () { return this.rows.length; };
    FakeSheet.prototype.getMaxColumns = function () { return this.rows[0].length; };
    FakeSheet.prototype.getDataRange = function () {
        var self = this;
        return { getValues: function () { return self.rows.map(function (r) { return r.slice(); }); } };
    };
    FakeSheet.prototype.appendRow = function (r) {
        var row = r.slice();
        while (row.length < this.rows[0].length) row.push('');
        this.rows.push(row);
    };
    FakeSheet.prototype.getRange = function (row, col, nr, nc) {
        var self = this;
        return {
            getValues: function () {
                var out = [];
                for (var i = 0; i < (nr || 1); i++) {
                    var line = [];
                    for (var j = 0; j < (nc || 1); j++) line.push(self.rows[row - 1 + i][col - 1 + j]);
                    out.push(line);
                }
                return out;
            },
            getValue: function () { return self.rows[row - 1][col - 1]; },
            setValue: function (v) { self.rows[row - 1][col - 1] = v; }
        };
    };

    sandbox.SpreadsheetApp = {
        getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return SHEETS[n] || null; } }; }
    };
    sandbox.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
    sandbox.Utilities = { getUuid: function () { return 'UUID000000000000'; } };
    sandbox.Session = { getScriptTimeZone: function () { return 'Asia/Taipei'; } };
    sandbox.__now = '2026-09-01 09:00:00';
    sandbox.procurementTimestamp_ = function () { return sandbox.__now; };
    sandbox.prodRequireSheet_ = function (ss, name) { return SHEETS[name]; };
    sandbox.procurementNum_ = function (v) { var n = Number(v); return isFinite(n) ? n : ''; };
    sandbox.jsonResponse_ = function (o) { return o; };

    var ctx = vm.createContext(sandbox);
    vm.runInContext([
        extractFn(G13, 'procurementEnsureSheet_'),
        extractFn(G13, 'procurementAppendByHeader_'),
        extractFn(G13, 'procurementFindRow_'),
        ricSrc || RIC,
        sadSrc || SAD
    ].join('\n'), ctx);

    var env = {
        ctx: ctx, sandbox: sandbox, SHEETS: SHEETS, FakeSheet: FakeSheet,
        get: function (n) { return vm.runInContext(n, ctx); },
        call: function (expr, a, b, c) { sandbox.__a = a; sandbox.__b = b; sandbox.__c = c; return vm.runInContext(expr, ctx); }
    };
    env.HDR = env.get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_');
    env.TAIL = env.get('SAD_LIFECYCLE_TAIL_COLUMNS_');
    env.ROUTE_TAIL = env.get('SAD_ROUTE_IDENTITY_TAIL_COLUMNS_');
    env.FULL = env.get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_');
    env.LHDR = env.get('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_');
    env.LFULL = env.get('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_');

    // Mount the two sheets at a chosen schema STAGE.
    env.mount = function (headerCols, lineCols) {
        var h = new FakeSheet(headerCols); h.name = 'shipping_allocation_drafts';
        var l = new FakeSheet(lineCols); l.name = 'shipping_allocation_draft_lines';
        SHEETS['shipping_allocation_drafts'] = h;
        SHEETS['shipping_allocation_draft_lines'] = l;
    };
    env.stage30 = function () { env.mount(env.HDR, env.LHDR); };                       // today
    env.stage34 = function () { env.mount(env.FULL.slice(0, 34), env.LHDR); };         // lifecycle tail only
    env.stage35 = function () { env.mount(env.FULL, env.LFULL); };                     // both appends done
    env.save = function (body) { sandbox.__body = body; return vm.runInContext('sadAtomicUpsertCore_(__body)', ctx); };
    env.headerObjs = function () {
        var sh = SHEETS['shipping_allocation_drafts'], h = sh.rows[0];
        return sh.rows.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { if (k) o[k] = r[i]; }); return o; });
    };
    env.lineObjs = function () {
        var sh = SHEETS['shipping_allocation_draft_lines'], h = sh.rows[0];
        return sh.rows.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { if (k) o[k] = r[i]; }); return o; });
    };
    env.gate = function (headers, authority, tail) {
        sandbox.__hh = headers; sandbox.__aa = authority; sandbox.__tt = tail || [];
        return vm.runInContext('sadExactSchemaReason_({ getDataRange: function () { return { getValues: function () { return [__hh]; } }; } }, __aa, __tt)', ctx);
    };
    return env;
}

var E = makeEnv();
var HDR = E.HDR, TAIL = E.TAIL, FULL = E.FULL, LHDR = E.LHDR, LFULL = E.LFULL;

// A complete WAREHOUSE-destination route — persistable at every stage.
function whRoute(over) {
    var h = {
        planning_cycle: '2026-10', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        source_page: 'inventory_replenishment', recommended_source_warehouse_id: 'WH-CN-YX',
        recommended_destination_warehouse_id: 'WH-AMZLGS', recommended_shipping_method: 'sea',
        recommended_last_mile_delivery: '', recommendation_group_no: '1', created_by: 'test'
    };
    Object.keys(over || {}).forEach(function (k) { h[k] = over[k]; });
    return h;
}
// A complete MARKETPLACE-destination route — the one the live schema could not hold.
function mktRoute(over) {
    return whRoute(Object.assign({ recommended_destination_warehouse_id: '', destination_marketplace: 'Amazon' }, over || {}));
}
function oneLine(over) {
    var l = { sku: 'CO1100-R', window_code: '2026-W42', planned_qty: 800, recommended_qty: 800 };
    Object.keys(over || {}).forEach(function (k) { l[k] = over[k]; });
    return l;
}

// ==============================================================================================================
section('A — [tests 1-8] the schema acceptance matrix, asked of the production gate');
// ==============================================================================================================
eq(HDR.length, 30, 'A0 the required header contract is still 30');
eq(FULL.length, 35, 'A0 the full header authority is 35');
eq(FULL.slice(30), TAIL.concat(['destination_marketplace']), 'A0 tail order: lifecycle 30..33, then destination_marketplace at 34');
eq(LHDR.length, 30, 'A0 the required line contract is still 30');
eq(LFULL.length, 31, 'A0 the full line authority is 31');
eq(LFULL[30], 'expected_arrival', 'A0 with expected_arrival at index 30');

// Test 1 + 2 + 3 — every canonical prefix from 30 to 35 is accepted, and only in canonical order.
for (var n = 30; n <= 35; n++) {
    eq(E.gate(FULL.slice(0, n), FULL, FULL.slice(30)), '', 'A1 [tests 1-3] a canonical prefix of ' + n + ' columns is ACCEPTED');
}
// Test 4 — destination_marketplace at index 30 is refused: that is the lifecycle tail's frozen position.
eq(E.gate(HDR.concat(['destination_marketplace']), FULL, FULL.slice(30)),
    'COL30_IS_destination_marketplace_EXPECTED_generation_run_id',
    'A2 [test 4] destination_marketplace at index 30 is REFUSED — index 30 belongs to generation_run_id');
// Lifecycle fields out of order.
var swapped = FULL.slice(0, 34); var t0 = swapped[31]; swapped[31] = swapped[32]; swapped[32] = t0;
ok(E.gate(swapped, FULL, FULL.slice(30)) !== '', 'A3 lifecycle fields out of order are REFUSED');
// Test 5 — an unknown column.
ok(E.gate(HDR.concat(['surprise']), FULL, FULL.slice(30)) !== '', 'A4 [test 5] an unknown header column is REFUSED');
ok(E.gate(FULL.concat(['surprise']), FULL, FULL.slice(30)) !== '', 'A4 [test 5] and so is a 36th column');
// Test 6 — a duplicate and a case variant.
ok(E.gate(HDR.slice(0, 29).concat(['country']), FULL, FULL.slice(30)) !== '', 'A5 [test 6] a duplicate column is REFUSED');
ok(E.gate(FULL.slice(0, 34).concat(['Destination_Marketplace']), FULL, FULL.slice(30)) !== '',
    'A5 [test 6] a case-insensitive collision is REFUSED — the gate compares exactly');
// A blank intervening header.
ok(E.gate(HDR.concat(['', 'expired_at']), FULL, FULL.slice(30)) !== '', 'A6 a blank intervening header is REFUSED');
// Test 7 + 8 — the line table.
eq(E.gate(LHDR, LFULL, LFULL.slice(30)), '', 'A7 [test 7] the current 30-column line schema is ACCEPTED');
eq(E.gate(LFULL, LFULL, LFULL.slice(30)), '', 'A8 [test 8] the final 31-column line schema is ACCEPTED');
ok(E.gate(LHDR.concat(['eta']), LFULL, LFULL.slice(30)) !== '',
    'A8 [test 8] but only when column 30 is exactly expected_arrival');
ok(E.gate(LFULL.concat(['x']), LFULL, LFULL.slice(30)) !== '', 'A8 [test 8] and never a 32nd column');
// And the shipped call sites use these authorities, not a private copy.
ok(/sadExactSchemaReason_\(hSh, SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_, SAD_HEADER_OPTIONAL_TAIL_COLUMNS_\)/.test(SADC),
    'A9 the shipped header gate call uses the full authority');
ok(/sadExactSchemaReason_\(lSh, SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_, SAD_LINE_ETA_TAIL_COLUMNS_\)/.test(SADC),
    'A9 and the shipped line gate call uses its own optional tail');

// ==============================================================================================================
section('B — [tests 9-12] before the columns exist, today\'s behaviour is preserved and nothing is dropped');
// ==============================================================================================================
(function () {
    var e = makeEnv(); e.stage30();
    // Test 9 — the current 30/30 schema keeps working exactly as it does now.
    var r = e.save({ header: whRoute(), lines: [oneLine()] });
    eq(r.success, true, 'B1 [test 9] a warehouse route still saves on the live 30/30 schema');
    eq(e.headerObjs().length, 1, 'B2 [test 9] one header row');
    eq(e.lineObjs().length, 1, 'B3 [test 9] one line row');
    var id30 = e.headerObjs()[0].allocation_draft_id;
    ok(/^SADH-K2-/.test(id30), 'B4 [test 9] and it keys under K2, because K4 has nowhere to store its destination (' + id30 + ')');

    // Test 10 — a marketplace route is REFUSED with a typed reason, and writes nothing.
    var before = e.headerObjs().length;
    var m = e.save({ header: mktRoute(), lines: [oneLine()] });
    eq(m.success, false, 'B5 [test 10] a marketplace route is refused before the column exists');
    eq(m.error, 'ROUTE_IDENTITY_NOT_PERSISTABLE', 'B6 [test 10] with the typed refusal ROUTE_IDENTITY_NOT_PERSISTABLE');
    eq(m.zero_write, true, 'B7 [test 10] zero_write');
    eq(m.data.schema_code, 'ALLOCATION_DRAFT_SCHEMA_COLUMN_ABSENT', 'B8 [test 10] naming the absent column as the cause');
    eq(m.data.column, 'destination_marketplace', 'B9 [test 10] and naming the column');
    eq(e.headerObjs().length, before, 'B10 [test 10] and no row was written');

    // Test 11 — an ETA on a line is refused for the same reason, against the LINE schema.
    var t = e.save({ header: whRoute({ recommendation_group_no: '2' }), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
    eq(t.success, false, 'B11 [test 11] a line ETA is refused before the line column exists');
    eq(t.error, 'EXPECTED_ARRIVAL_NOT_PERSISTABLE', 'B12 [test 11] with the typed refusal EXPECTED_ARRIVAL_NOT_PERSISTABLE');
    eq(t.data.table, 'shipping_allocation_draft_lines', 'B13 [test 11] against the LINE table, because the ETA is line-owned');
    eq(t.data.lines_supplying_it, 1, 'B14 [test 11] counting the lines that supplied it');
    eq(e.headerObjs().length, before, 'B15 [test 11] and still nothing written');

    // Test 12 — the value is never silently discarded. The refusal echoes what would have been lost.
    eq(m.data.supplied, 'Amazon', 'B16 [test 12] the refused marketplace value is echoed, not dropped in silence');

    // LEGACY_ROUTE_RECONCILIATION_REQUIRED stays fail-closed.
    ok((SAD.match(/LEGACY_ROUTE_RECONCILIATION_REQUIRED/g) || []).length >= 6, 'B17 the legacy refusal is intact');
})();

// ==============================================================================================================
section('C — [test 13] the lifecycle-only state (34 header / 30 line) is fully functional');
// ==============================================================================================================
(function () {
    var e = makeEnv(); e.stage34();
    var r = e.save({ header: whRoute(), lines: [oneLine()] });
    eq(r.success, true, 'C1 [test 13] a warehouse route saves on a 34-column header');
    eq(e.headerObjs().length, 1, 'C2 [test 13] one header row');
    eq(e.lineObjs()[0].planned_qty, 800, 'C3 [test 13] with its line and quantity intact');
    // The lifecycle columns exist and are written / left blank exactly as the lifecycle contract says.
    var h = e.headerObjs()[0];
    eq(h.expired_at, '', 'C4 [test 13] a new row is not expired');
    ok('generation_run_id' in h, 'C5 [test 13] and the lifecycle provenance column is present');
    // Still no marketplace and no ETA.
    eq(e.save({ header: mktRoute({ recommendation_group_no: '9' }), lines: [oneLine()] }).error,
        'ROUTE_IDENTITY_NOT_PERSISTABLE', 'C6 [test 13] a marketplace route is still refused at 34 columns');
    eq(e.save({ header: whRoute({ recommendation_group_no: '8' }), lines: [oneLine({ expected_arrival: '2026-10-16' })] }).error,
        'EXPECTED_ARRIVAL_NOT_PERSISTABLE', 'C7 [test 13] and a line ETA is still refused while the line table is 30');
})();

// ==============================================================================================================
section('D — [tests 14-15] with both columns present, both fields persist and hydrate');
// ==============================================================================================================
var D = makeEnv(); D.stage35();
(function () {
    var r = D.save({ header: mktRoute(), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
    eq(r.success, true, 'D1 [test 14] a marketplace route now saves');
    var h = D.headerObjs()[0];
    eq(h.destination_marketplace, 'Amazon', 'D2 [test 14] destination_marketplace is PERSISTED on the header');
    eq(h.recommended_destination_warehouse_id, '', 'D3 [test 14] and no warehouse id was manufactured for it');
    var l = D.lineObjs()[0];
    eq(l.expected_arrival, '2026-10-16', 'D4 [test 15] expected_arrival is PERSISTED on the LINE');
    ok(!('expected_arrival' in h), 'D5 [test 15] and NOT on the header — it is line-owned');

    // Hydration reads the live header row, so both come back without a second mapping to keep in step.
    var hyd = D.call('sadRowToObject_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("shipping_allocation_drafts"), 2)');
    eq(hyd.destination_marketplace, 'Amazon', 'D6 [test 14] and it HYDRATES on reload');
    var hydL = D.call('sadReadLinesForDraft_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("shipping_allocation_draft_lines"), __a)', h.allocation_draft_id);
    eq(hydL[0].expected_arrival, '2026-10-16', 'D7 [test 15] the line ETA hydrates too');

    // K4 is the identity for a newly persistable route.
    ok(/^SADH-K4-/.test(h.allocation_draft_id), 'D8 a newly persistable marketplace route keys under K4 (' + h.allocation_draft_id + ')');
})();

// ==============================================================================================================
section('E — [tests 16-21] identity: what moves it, what must never move it');
// ==============================================================================================================
function k4id(h) { return D.call('ricK4DeterministicHeaderId_(__a)', h); }
function svc(v) { return D.call('ricCanonicalService_(__a)', v); }
function dest(h) { return D.call('ricDestinationIdentity_(__a)', h); }
// Test 18 + 19 — sea is not sea_express, in either direction, with no family fallback.
eq(svc('sea'), 'sea', 'E1 [test 19] an existing sea value remains sea');
eq(svc('sea_express'), 'sea_express', 'E2 [test 18] and sea_express remains sea_express');
ok(svc('sea') !== svc('sea_express'), 'E3 [test 18] sea !== sea_express');
ok(k4id(mktRoute({ recommended_shipping_method: 'sea' })) !== k4id(mktRoute({ recommended_shipping_method: 'sea_express' })),
    'E4 [test 18] and they produce DISTINCT K4 identities');
eq(svc('seafood'), '', 'E5 no prefix family fallback — seafood is refused, never read as sea');
eq(svc('sea-express'), '', 'E6 nor a hyphen variant');
eq(svc('ocean'), '', 'E7 nor a transport mode');
eq(svc('普船'), 'sea', 'E8 the exact regular-ocean label resolves to sea');
eq(svc('美森海卡'), 'sea_express', 'E9 and the exact express labels to sea_express');
eq(svc('快船'), 'sea_express', 'E10 both of them');
// Test 16 + 17 — the ETA and the quantity are not identity.
eq(k4id(mktRoute({ expected_arrival: '2026-10-16' })), k4id(mktRoute()), 'E11 [test 16] an ETA does not change the K4 identity');
eq(k4id(mktRoute({ planned_qty: 400 })), k4id(mktRoute({ planned_qty: 800 })), 'E12 [test 17] nor does the quantity');
eq(k4id(mktRoute({ note: 'x', draft_version: '9', updated_at: 'z' })), k4id(mktRoute()), 'E13 nor notes, versions or timestamps');
var K4DIMS = D.get('RIC_K4_GROUP_DIMENSIONS_');
eq(K4DIMS, ['planning_cycle', 'company', 'country', 'marketplace', 'source_page', 'recommended_source_warehouse_id',
    'destination_type', 'destination_identity', 'recommended_shipping_method_canonical',
    'recommended_last_mile_delivery', 'recommendation_group_no'], 'E14 the K4 dimensions are exactly the eleven named');

// Test 20 + 21 — an existing K2 id is neither regenerated nor re-keyed when the schema grows underneath it.
(function () {
    var e = makeEnv();
    e.stage30();
    var first = e.save({ header: whRoute(), lines: [oneLine()] });
    var storedId = e.headerObjs()[0].allocation_draft_id;
    ok(/^SADH-K2-/.test(storedId), 'E15 [test 20] a row created before the append carries a K2 id');
    var storedLineId = e.lineObjs()[0].allocation_draft_line_id;

    // Now the columns are appended underneath it — the sheet grows, the rows do not move.
    var hSheet = e.SHEETS['shipping_allocation_drafts'], lSheet = e.SHEETS['shipping_allocation_draft_lines'];
    hSheet.rows[0] = FULL.slice();
    hSheet.rows.forEach(function (r, i) { if (i) { while (r.length < 35) r.push(''); } });
    lSheet.rows[0] = LFULL.slice();
    lSheet.rows.forEach(function (r, i) { if (i) { while (r.length < 31) r.push(''); } });

    // The SAME route replays. K4 is ready now, and the stored row's own destination resolves, so K4 adopts it.
    var again = e.save({ header: whRoute(), lines: [oneLine()] });
    eq(e.headerObjs().length, 1, 'E16 [test 21] the replay creates NO second header');
    eq(e.headerObjs()[0].allocation_draft_id, storedId, 'E17 [test 20] and the existing K2 id is UNCHANGED — never re-keyed');
    eq(e.lineObjs().length, 1, 'E18 [test 21] no second line either');
    eq(e.lineObjs()[0].allocation_draft_line_id, storedLineId, 'E19 [test 21] and the line keeps its own id');
    eq(again.data && again.data.outcome, 'REUSED', 'E20 [test 22] the identical replay is a REUSE, not a write');
    eq(again.reused, true, 'E21 [test 22] reported as reused');
})();

// ==============================================================================================================
section('F — [tests 22-23] replay is idempotent; a genuinely different route is a different header');
// ==============================================================================================================
(function () {
    var e = makeEnv(); e.stage35();
    var a = e.save({ header: mktRoute(), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
    eq(a.success, true, 'F1 the marketplace route saves');
    var id1 = e.headerObjs()[0].allocation_draft_id;
    // Test 22 — the same K4 request replays with zero duplicates.
    var b = e.save({ header: mktRoute(), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
    eq(e.headerObjs().length, 1, 'F2 [test 22] a replay of the same K4 route creates zero duplicate headers');
    eq(e.lineObjs().length, 1, 'F3 [test 22] and zero duplicate lines');
    eq(b.reused, true, 'F4 [test 22] it is a REUSE');
    // Test 23 — sea_express to the same marketplace is a DIFFERENT route and gets its own header.
    var c = e.save({ header: mktRoute({ recommended_shipping_method: 'sea_express' }), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
    eq(c.success, true, 'F5 [test 23] the express-ocean route saves');
    eq(e.headerObjs().length, 2, 'F6 [test 23] as a SECOND header — sea and sea_express are two services and two identities');
    var ids = e.headerObjs().map(function (h) { return h.allocation_draft_id; });
    ok(ids[0] !== ids[1], 'F7 [test 23] with distinct ids');
    eq(e.headerObjs()[0].recommended_shipping_method, 'sea', 'F8 and the FIRST row still says sea — it was never rewritten');
    // A different destination is likewise a different route.
    var d = e.save({ header: mktRoute({ destination_marketplace: 'Walmart' }), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
    eq(e.headerObjs().length, 3, 'F9 [test 23] a different marketplace destination is a third header');

    // An ETA change updates the SAME line under the SAME header — never a new route.
    var before = e.headerObjs().length;
    var eRes = e.save({ header: mktRoute(), lines: [oneLine({ expected_arrival: '2026-12-25' })] });
    eq(e.headerObjs().length, before, 'F10 [test 16] changing the ETA creates no header');
    var mine = e.lineObjs().filter(function (l) { return l.allocation_draft_id === id1; });
    eq(mine.length, 1, 'F11 [test 16] and no second line');
    eq(mine[0].expected_arrival, '2026-12-25', 'F12 [test 16] the SAME line now carries the new ETA');
})();

// ==============================================================================================================
section('G — [tests 24-26] the destination is exactly one thing, and a contest is blocked');
// ==============================================================================================================
(function () {
    var e = makeEnv(); e.stage35();
    // Test 24 — both destination fields populated.
    var both = e.save({ header: mktRoute({ recommended_destination_warehouse_id: 'WH-AMZLGS' }), lines: [oneLine()] });
    eq(both.success, false, 'G1 [test 24] both destination fields is refused');
    eq(both.data.schema_code, 'ROUTE_DESTINATION_AMBIGUOUS', 'G2 [test 24] with the typed code ROUTE_DESTINATION_AMBIGUOUS');
    eq(both.zero_write, true, 'G3 [test 24] and zero_write');
    eq(e.headerObjs().length, 0, 'G4 [test 24] nothing written');
    // Test 25 — neither populated.
    eq(dest({}).code, 'ROUTE_DESTINATION_MISSING', 'G5 [test 25] neither destination gives ROUTE_DESTINATION_MISSING');
    var none = e.save({ header: whRoute({ recommended_destination_warehouse_id: '' }), lines: [oneLine()] });
    eq(none.success, false, 'G6 [test 25] and the writer refuses a route with no destination');
    eq(e.headerObjs().length, 0, 'G7 [test 25] still nothing written');
    // No fake warehouse id is ever manufactured.
    eq(dest({ destination_marketplace: 'Amazon' }).type, 'MARKETPLACE', 'G8 Amazon resolves as a MARKETPLACE, never a warehouse');
    ok(SADC.indexOf('FBA') === -1, 'G9 and the writer mints no warehouse-shaped token of its own');
    // The marketplace identity compares trimmed and case-insensitively, while the row keeps its reviewed casing.
    eq(dest({ destination_marketplace: '  AMAZON ' }).id, 'amazon', 'G10 marketplace identity is trimmed and lower-cased');
    eq(k4id(mktRoute({ destination_marketplace: ' amazon ' })), k4id(mktRoute({ destination_marketplace: 'Amazon' })),
        'G11 so spelling cannot mint a second identity for one marketplace');
})();

// Test 26 — a REAL contested identity: an active legacy row that K2 claims but K4 cannot tell apart.
(function () {
    var e = makeEnv(); e.stage35();
    // A row whose K2 dims equal the request's but whose destination is BLANK — the live FB-4F row exactly.
    var legacy = whRoute({ recommended_destination_warehouse_id: '', recommended_shipping_method: 'sea' });
    var sh = e.SHEETS['shipping_allocation_drafts'];
    var row = FULL.map(function (c) { return legacy[c] != null ? legacy[c] : ''; });
    row[FULL.indexOf('allocation_draft_id')] = 'SADH-K2-LEGACY01';
    row[FULL.indexOf('status')] = 'draft';
    sh.rows.push(row);

    var r = e.save({ header: mktRoute({ recommended_shipping_method: 'sea' }), lines: [oneLine()] });
    eq(r.success, false, 'G12 [test 26] a route the legacy row claims under K2 but differs from under K4 is BLOCKED');
    eq(r.data.reason, 'K4_IDENTITY_RECONCILIATION_REQUIRED', 'G13 [test 26] with its own typed reason');
    eq(e.headerObjs().length, 1, 'G14 [test 26] no second header is created beside it');
    eq(e.headerObjs()[0].allocation_draft_id, 'SADH-K2-LEGACY01', 'G15 [test 26] and the legacy row is untouched');
    eq(e.headerObjs()[0].destination_marketplace, '', 'G16 [test 26] never migrated in place');
    ok(/its own words|migrate a legacy row in place/.test(r.error), 'G17 [test 26] and the message says why');
})();

// A genuine K4 contest: two active rows already keying to one K4 group.
(function () {
    var e = makeEnv(); e.stage35();
    var sh = e.SHEETS['shipping_allocation_drafts'];
    ['SADH-K4-A', 'SADH-K4-B'].forEach(function (id) {
        var row = FULL.map(function (c) { var v = mktRoute()[c]; return v != null ? v : ''; });
        row[FULL.indexOf('allocation_draft_id')] = id;
        row[FULL.indexOf('status')] = 'draft';
        sh.rows.push(row);
    });
    var r = e.save({ header: mktRoute(), lines: [oneLine()] });
    eq(r.success, false, 'G18 [test 26] two active headers for one K4 group is a CONFLICT');
    ok(/BLOCKED_CONFLICT/.test(r.error), 'G19 [test 26] reported as BLOCKED_CONFLICT');
    eq(e.headerObjs().length, 2, 'G20 [test 26] and neither is touched');
})();

// ==============================================================================================================
section('H — [test 27] the runtime never mutates the schema');
// ==============================================================================================================
var SCHEMA_MUTATORS = ['insertColumn', 'insertColumns', 'insertColumnsAfter', 'appendColumn', 'ensureColumns',
    'insertSheet', 'createSheet', 'deleteColumn', 'setColumnWidth'];
SCHEMA_MUTATORS.forEach(function (m) {
    ok(SADC.indexOf(m) === -1, 'H1 [test 27] the allocation writer contains no ' + m);
});
ok(code(RIC).indexOf('getSheet') === -1 && code(RIC).indexOf('SpreadsheetApp') === -1,
    'H2 [test 27] and the route-identity contract touches no sheet at all');
// The persistability predicate is PURE — given the schema, never fetching it.
(function () {
    var body = code(extractFn(RIC, 'ricRoutePersistability_'));
    ['getSheet', 'insertColumn', 'appendRow', 'setValue', 'getRange', 'SpreadsheetApp', 'ensureSchema',
        'ensureColumns', 'createSheet', 'insertSheet'].forEach(function (n) {
        ok(body.indexOf(n) === -1, 'H3 [test 27] ricRoutePersistability_ does not call ' + n);
    });
})();
// Executed proof: a save on the 30/30 stage leaves the header row exactly 30 wide.
(function () {
    var e = makeEnv(); e.stage30();
    e.save({ header: whRoute(), lines: [oneLine()] });
    eq(e.SHEETS['shipping_allocation_drafts'].rows[0].length, 30, 'H4 [test 27] a save did not widen the header row');
    eq(e.SHEETS['shipping_allocation_draft_lines'].rows[0].length, 30, 'H5 [test 27] nor the line row');
    eq(e.SHEETS['shipping_allocation_drafts'].rows[0].join('|'), HDR.join('|'), 'H6 [test 27] and did not reorder it');
})();

// ==============================================================================================================
section('I — [tests 28-29] the deployment manifest is internally consistent, and the contract is unchanged');
// ==============================================================================================================
function manifestExpects(file) {
    return (HEALTH.match(new RegExp("\\{ file: '" + file.replace(/\./g, '\\.') + "',[^}]*expected: '([^']+)'")) || [])[1] || '';
}
function declares(src, sym) { return (src.match(new RegExp('var ' + sym + " = '([^']+)';")) || [])[1] || ''; }
eq(declares(SAD, 'SAD_BUILD_VERSION_'), 'F1-7N-FB-4F-B3', 'I1 the allocation owner build is F1-7N-FB-4F-B3');
eq(manifestExpects('16_shipping_allocation_handlers.gs'), 'F1-7N-FB-4F-B3', 'I2 [test 28] and the manifest expects exactly that');
eq(declares(RIC, 'RIC_BUILD_VERSION_'), manifestExpects('69_api_v1_route_identity_contract.gs'),
    'I3 [test 28] 69_ declares exactly what the manifest expects of it');
ok(!!manifestExpects('69_api_v1_route_identity_contract.gs'), 'I4 [test 28] and it HAS a manifest entry — it is a synchronized owner now');
ok(HEALTH.indexOf("symbol: 'RIC_BUILD_VERSION_'") !== -1, 'I5 [test 28] probed through its own symbol');
// Every manifest entry must match what its file really declares, or the check is a lie on day one.
(function () {
    var re = /\{ file: '([^']+)', symbol: '([^']+)', expected: '([^']+)'/g, m, checked = 0;
    while ((m = re.exec(HEALTH))) {
        var p = path.join(GS, m[1]);
        if (!fs.existsSync(p)) continue;
        var d = declares(lf(fs.readFileSync(p, 'utf8')), m[2]);
        if (!d) continue;
        checked++;
        eq(d, m[3], 'I6 [test 28] ' + m[1] + ' declares what the manifest expects');
    }
    ok(checked >= 10, 'I7 [test 28] and enough entries were actually checked (' + checked + ')');
})();
// Test 29 — the contract counts are untouched. Read the constants, never the prose.
eq((HEALTH.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1], '10', 'I8 [test 29] action contract stays 10');
// "REQUIRED LIST 9" IS A VERSION, NOT A COUNT, and the first two drafts of this line got that wrong in two
// different ways: counting quoted strings inside an array of OBJECTS gave 120 (every action, handler and
// used_by label), and counting the entries gave 40. Both are the right number for the wrong question - the
// list may legitimately grow, and what must not move without a deliberate decision is
// SYS_REQUIRED_ACTION_LIST_VERSION_, which is what every other suite in this repository actually pins.
eq((HEALTH.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1], '9',
  'I9 [test 29] the required-action list VERSION stays 9');
eq((HEALTH.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/) || [])[1], '1', 'I10 [test 29] transport contract stays 1');
// No route was created merely to expose a pure helper.
['ricK4', 'ricRoutePersistability', 'ricCanonicalService', 'sadK4ResolveActiveDraft', 'sadSchemaRefusal']
    .forEach(function (sym) { ok(ROUTER.indexOf(sym) === -1, 'I11 ' + sym + ' is NOT routed — B3 adds no action'); });
eq(declares(ROUTER, 'RTR_BUILD_VERSION_'), 'F1-7N-FB-4E-R4B-R3', 'I12 and the router build is untouched, because its behaviour is');

// ==============================================================================================================
section('J — [test 30] the B2 dry run still reproduces the recorded LIVE result');
// ==============================================================================================================
(function () {
    // The live run of 2026-08-31 recorded these against the real database. They must survive B3, because B3
    // appended nothing: the fingerprints are of the LIVE header rows and the decision is about the live state.
    var LIVE = { header_fp: 'sf:d910d16a', line_fp: 'sf:2226df13', checksum: 'fb4fb2-1:846e7989',
        decision: 'STOP_SCHEMA_COLLISION', header_rows: 4, line_rows: 6 };
    var B2SRC = lf(fs.readFileSync(path.join(TOOLS_DIAG, 'TEMP_shipping_allocation_schema_b2_dry_run.gs'), 'utf8'));
    var EPC = readGs('68_api_v1_execution_plan_conflict_diagnostic.gs');
    var sb = {
        String: String, Object: Object, Math: Math, Number: Number, JSON: JSON, Array: Array,
        isNaN: isNaN, isFinite: isFinite, console: console, Error: Error, RegExp: RegExp,
        Boolean: Boolean, parseInt: parseInt, parseFloat: parseFloat
    };
    sb.Date = function () { return { toISOString: function () { return 'fixed'; } }; };
    sb.Logger = { log: function () {} };
    sb.globalThis = sb;
    var ctx = vm.createContext(sb);
    vm.runInContext([
        extractFn(SAD, 'sadFnv1a_'),
        (SAD.match(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = \[[\s\S]*?\n\];/) || [])[0],
        (SAD.match(/var SAD_LIFECYCLE_TAIL_COLUMNS_ = \[[^\]]*\];/) || [])[0],
        (SAD.match(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ =[\s\S]*?;/) || [])[0],
        (SAD.match(/var SAD_ROUTE_IDENTITY_TAIL_COLUMNS_ = \[[^\]]*\];/) || [])[0],
        (SAD.match(/var SAD_HEADER_OPTIONAL_TAIL_COLUMNS_ =[\s\S]*?;/) || [])[0],
        (SAD.match(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ =[\s\S]*?;/) || [])[0],
        (SAD.match(/var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ = \[[\s\S]*?\n\];/) || [])[0],
        (SAD.match(/var SAD_LINE_ETA_TAIL_COLUMNS_ = \[[^\]]*\];/) || [])[0],
        (SAD.match(/var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ =[\s\S]*?;/) || [])[0],
        (SAD.match(/var SAD_K2_GROUP_DIMENSIONS_ = \[[\s\S]*?\];/) || [])[0],
        extractFn(SAD, 'sadExactSchemaReason_'), extractFn(SAD, 'sadLifecycleTailState_'),
        extractFn(SAD, 'sadK2GroupKey_'), extractFn(SAD, 'sadK2DeterministicHeaderId_'),
        extractFn(SAD, 'sadHeaderRouteIsComplete_'),
        extractFn(EPC, 'epcStr_'), extractFn(EPC, 'epcFnv1a_'), extractFn(EPC, 'epcMaskId_'),
        extractFn(EPC, 'epcIdRef_'), extractFn(EPC, 'epcIdentityFamily_'),
        RIC, B2SRC
    ].join('\n'), ctx);

    function grid(cols, n) {
        var g = [cols.slice()];
        for (var i = 0; i < n; i++) { var r = cols.map(function () { return ''; }); r[0] = 'ID-' + i; g.push(r); }
        return g;
    }
    var tables = {
        'shipping_allocation_drafts': grid(HDR, LIVE.header_rows),
        'shipping_allocation_draft_lines': grid(LHDR, LIVE.line_rows)
    };
    sb.prodExpectedDbId_ = function () { return 'x'; };
    sb.SpreadsheetApp = {
        openById: function () {
            return { getSheetByName: function (n) {
                if (!tables[n]) return null;
                var g = tables[n];
                return { getDataRange: function () { return { getValues: function () { return g.map(function (r) { return r.slice(); }); } }; } };
            } };
        }
    };
    var r = vm.runInContext('TEMP_shippingAllocationSchemaB2DryRun_()', ctx);
    eq(r.sections['1_schema'].tables[0].fingerprint_before.digest, LIVE.header_fp, 'J1 [test 30] the live header fingerprint reproduces');
    eq(r.sections['1_schema'].tables[1].fingerprint_before.digest, LIVE.line_fp, 'J2 [test 30] the live line fingerprint reproduces');
    eq(r.live_schema_checksum, LIVE.checksum, 'J3 [test 30] the live checksum reproduces');
    eq(r.decision, LIVE.decision, 'J4 [test 30] and the live decision is still STOP_SCHEMA_COLLISION');
    // What B3 DID change: the authority now knows both columns, so that is no longer a blocking reason, and
    // the LINE append has become mechanically safe. The header still waits on the lifecycle tail.
    ok(r.blocking.join(' ').indexOf('AUTHORITY_DOES_NOT_KNOW_COLUMN') === -1,
        'J5 the authority now knows both columns, so that blocking reason is gone');
    eq(r.sections['1_schema'].tables[1].append_only_mechanically_safe, true,
        'J6 and the LINE append is now mechanically safe — which is exactly what B3 was for');
    ok(r.blocking.join(' ').indexOf('LIFECYCLE_TAIL_OUTSTANDING') !== -1,
        'J7 while the header still waits for the lifecycle tail, which B3 did not run');
    eq(r.COLUMNS_APPENDED, 0, 'J8 [test 30] and the dry run still appends nothing');
})();

// ==============================================================================================================
section('K — [test 31] the lifecycle migration is still compatible and still idempotent');
// ==============================================================================================================
(function () {
    var CANON = E.get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_');
    eq(CANON.length, 34, 'K1 [test 31] the lifecycle migration\'s canonical target is still exactly 34');
    eq(CANON.slice(30).join('|'), TAIL.join('|'), 'K2 [test 31] ending with the lifecycle tail at 30..33');
    ok(CANON.indexOf('destination_marketplace') === -1,
        'K3 [test 31] and NOT carrying destination_marketplace — the lifecycle tool must never append the route column');
    // Its own append-only check, run on the shapes it will actually meet.
    var AIMIG = readGs('TEMP_migrate_shipping_allocation_ai_lifecycle.gs');
    ok(/tmigCanonicalHeaders_/.test(AIMIG), 'K4 [test 31] the migration reads the canonical list through its own accessor');
    var sb = { String: String, Object: Object, Math: Math, Number: Number, Array: Array, console: console };
    sb.globalThis = sb;
    var c = vm.createContext(sb);
    vm.runInContext([
        'var SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ = ' + JSON.stringify(CANON) + ';',
        'var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = ' + JSON.stringify(HDR) + ';',
        'var SAD_LIFECYCLE_TAIL_COLUMNS_ = ' + JSON.stringify(TAIL) + ';',
        extractFn(AIMIG, 'tmigStr_'), extractFn(AIMIG, 'tmigCanonicalHeaders_'),
        extractFn(AIMIG, 'tmigRequiredHeaders_'), extractFn(AIMIG, 'tmigTailColumns_'),
        extractFn(AIMIG, 'tmigCompareSchema_')
    ].join('\n'), c);
    function cmp(live) { sb.__l = live; return vm.runInContext('tmigCompareSchema_(__l)', c); }
    var at30 = cmp(HDR);
    eq(at30.append_only_safe, true, 'K5 [test 31] on the live 30-column header the migration is still append-only safe');
    eq(at30.columns_to_append.join('|'), TAIL.join('|'),
        'K6 [test 31] and appends EXACTLY the four lifecycle columns — not the route column');
    var at34 = cmp(CANON);
    eq(at34.exact_match, true, 'K7 [test 31] after it has run, the schema is an exact match');
    eq(at34.columns_to_append.length, 0, 'K8 [test 31] and re-running appends nothing — idempotent');
})();

// ==============================================================================================================
section('L — [test 32] negative tests: every fail-closed rule, and every mutation proves it mutated');
// ==============================================================================================================
var neg = { caught: 0, missed: 0 };
function mutate(label, baseline, mutant) {
    var b, m;
    try { b = baseline(); } catch (e) { b = 'THREW:' + e.message; }
    if (b !== true) { fail++; console.error('FAIL ' + label + ' — BASELINE did not hold: ' + b); return; }
    try { m = mutant(); } catch (e) { m = 'THREW'; }
    if (m === true) { neg.missed++; fail++; console.error('FAIL ' + label + ' — mutation NOT CAUGHT'); }
    else { neg.caught++; pass++; console.log('  caught: ' + label); }
}
function savedWith(sadSrc, stage, body) {
    var e = makeEnv(sadSrc);
    if (stage === 30) e.stage30(); else if (stage === 34) e.stage34(); else e.stage35();
    var r = e.save(body);
    return { res: r, headers: e.headerObjs(), lines: e.lineObjs(), env: e };
}

// L1 — the typed refusal removed: a marketplace with no column is silently dropped again.
mutate('L1 a supplied marketplace silently dropped when its column is absent',
    function () {
        var o = savedWith(null, 30, { header: mktRoute(), lines: [oneLine()] });
        return o.res.success === false && o.res.error === 'ROUTE_IDENTITY_NOT_PERSISTABLE' && o.headers.length === 0;
    },
    function () {
        var m = swap(SAD, '  var schemaRefusal = sadSchemaRefusal_(header, body.lines || [], hNames, lNames);',
            '  var schemaRefusal = null;');
        var o = savedWith(m, 30, { header: mktRoute(), lines: [oneLine()] });
        return o.res.success === false && o.res.error === 'ROUTE_IDENTITY_NOT_PERSISTABLE' && o.headers.length === 0;
    });
// L2 — the ETA refusal removed.
mutate('L2 a supplied line ETA silently dropped when its column is absent',
    function () {
        var o = savedWith(null, 30, { header: whRoute(), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
        return o.res.error === 'EXPECTED_ARRIVAL_NOT_PERSISTABLE' && o.headers.length === 0;
    },
    function () {
        var m = swap(SAD, "  if (etaLines && !sadHasColumn_(lineNames, 'expected_arrival')) {", '  if (false) {');
        var o = savedWith(m, 30, { header: whRoute(), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
        return o.res.error === 'EXPECTED_ARRIVAL_NOT_PERSISTABLE' && o.headers.length === 0;
    });
// L3 — K4 activated without the column, so an identity is minted that cannot be stored.
mutate('L3 K4 activated before its destination column exists',
    function () {
        var o = savedWith(null, 30, { header: whRoute(), lines: [oneLine()] });
        return /^SADH-K2-/.test(o.headers[0].allocation_draft_id);
    },
    function () {
        var m = swap(SAD, "  return sadHasColumn_(headerNames, 'destination_marketplace') &&", '  return true &&');
        var o = savedWith(m, 30, { header: whRoute(), lines: [oneLine()] });
        return /^SADH-K2-/.test(o.headers[0].allocation_draft_id);
    });
// L4 — the route-identity tail placed at index 30, which would refuse the queued lifecycle migration forever.
mutate('L4 destination_marketplace placed before the lifecycle tail',
    function () {
        var full = E.get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_');
        return full[30] === 'generation_run_id' && full[34] === 'destination_marketplace';
    },
    function () {
        var m = swap(SAD, 'var SAD_HEADER_OPTIONAL_TAIL_COLUMNS_ = SAD_LIFECYCLE_TAIL_COLUMNS_.concat(SAD_ROUTE_IDENTITY_TAIL_COLUMNS_);',
            'var SAD_HEADER_OPTIONAL_TAIL_COLUMNS_ = SAD_ROUTE_IDENTITY_TAIL_COLUMNS_.concat(SAD_LIFECYCLE_TAIL_COLUMNS_);');
        var full = makeEnv(m).get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_');
        return full[30] === 'generation_run_id' && full[34] === 'destination_marketplace';
    });
// L5 — the lifecycle canonical widened in place, so the LIFECYCLE migration would append the route column.
mutate('L5 the lifecycle migration widened to append the route-identity column',
    function () { return E.get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_').length === 34; },
    function () {
        var m = swap(SAD, 'var SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ =\n  SHIPPING_ALLOCATION_DRAFTS_HEADERS_.concat(SAD_LIFECYCLE_TAIL_COLUMNS_);',
            'var SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ =\n  SHIPPING_ALLOCATION_DRAFTS_HEADERS_.concat(SAD_LIFECYCLE_TAIL_COLUMNS_).concat([\'destination_marketplace\']);');
        return makeEnv(m).get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_').length === 34;
    });
// L6 — K2 extended with the new dimension, which re-keys every existing header.
mutate('L6 the K2 group key extended, re-keying every existing header',
    function () {
        var before = E.call('sadK2DeterministicHeaderId_(__a)', whRoute());
        var after = E.call('sadK2DeterministicHeaderId_(__a)', whRoute({ destination_marketplace: 'Amazon' }));
        return before === after;
    },
    function () {
        var m = swap(SAD, "    s(h.recommendation_group_no)].join('|');\n}\n// Deterministic K2 Header id",
            "    s(h.recommendation_group_no), s(h.destination_marketplace)].join('|');\n}\n// Deterministic K2 Header id");
        var e2 = makeEnv(m);
        return e2.call('sadK2DeterministicHeaderId_(__a)', whRoute()) ===
            e2.call('sadK2DeterministicHeaderId_(__a)', whRoute({ destination_marketplace: 'Amazon' }));
    });
// L7 — the destination XOR dropped, so a route may carry two destinations at once.
mutate('L7 both destination identities allowed on one route',
    function () {
        var o = savedWith(null, 35, { header: mktRoute({ recommended_destination_warehouse_id: 'WH-1' }), lines: [oneLine()] });
        return o.res.success === false && o.headers.length === 0;
    },
    function () {
        var m = swap(RIC, "  if (wid && mkt) return { type: '', id: '', ok: false, code: 'ROUTE_DESTINATION_AMBIGUOUS' };", '');
        var e2 = makeEnv(null, m); e2.stage35();
        var r = e2.save({ header: mktRoute({ recommended_destination_warehouse_id: 'WH-1' }), lines: [oneLine()] });
        return r.success === false && e2.headerObjs().length === 0;
    });
// L8 — sea and sea_express collapsed into one identity.
mutate('L8 sea_express collapsed into sea',
    function () { return svc('sea') !== svc('sea_express'); },
    function () {
        var m = swap(RIC, "'air', 'sea', 'sea_express', 'rail', 'truck'", "'air', 'sea', 'rail', 'truck'");
        m = swap(m, "'sea express': 'sea_express', 'sea_express': 'sea_express'", "'sea express': 'sea', 'sea_express': 'sea'");
        m = swap(m, "'快船': 'sea_express', '美森海卡': 'sea_express'", "'快船': 'sea', '美森海卡': 'sea'");
        var e2 = makeEnv(null, m);
        return e2.call('ricCanonicalService_(__a)', 'sea') !== e2.call('ricCanonicalService_(__a)', 'sea_express');
    });
// L9 — the legacy K4 contest allowed through, migrating a legacy row in place.
mutate('L9 a legacy row adopted and migrated in place',
    function () {
        var e2 = makeEnv(); e2.stage35();
        var sh = e2.SHEETS['shipping_allocation_drafts'];
        var legacy = whRoute({ recommended_destination_warehouse_id: '' });
        var row = FULL.map(function (c) { return legacy[c] != null ? legacy[c] : ''; });
        row[FULL.indexOf('allocation_draft_id')] = 'SADH-K2-LEGACY01';
        row[FULL.indexOf('status')] = 'draft';
        sh.rows.push(row);
        var r = e2.save({ header: mktRoute(), lines: [oneLine()] });
        return r.success === false && e2.headerObjs()[0].destination_marketplace === '';
    },
    function () {
        var m = swap(SAD, "        return { status: 'BLOCK', reason: 'K4_IDENTITY_RECONCILIATION_REQUIRED', id: (rivalK2.allocation_draft_id || ''),\n          conflictIds: rivalK2.conflictIds || [], k2: true, k4: true };",
            "        return { status: 'REUSE', id: rivalK2.allocation_draft_id, conflictIds: [], k2: true, k4: true };");
        var e2 = makeEnv(m); e2.stage35();
        var sh = e2.SHEETS['shipping_allocation_drafts'];
        var legacy = whRoute({ recommended_destination_warehouse_id: '' });
        var row = FULL.map(function (c) { return legacy[c] != null ? legacy[c] : ''; });
        row[FULL.indexOf('allocation_draft_id')] = 'SADH-K2-LEGACY01';
        row[FULL.indexOf('status')] = 'draft';
        sh.rows.push(row);
        var r = e2.save({ header: mktRoute(), lines: [oneLine()] });
        return r.success === false && e2.headerObjs()[0].destination_marketplace === '';
    });
// L10 — the line writer copying through the REQUIRED list again, so the ETA is dropped after the append.
mutate('L10 the line writer drops the ETA even when its column exists',
    function () {
        var o = savedWith(null, 35, { header: mktRoute(), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
        return o.lines[0].expected_arrival === '2026-10-16';
    },
    function () {
        var m = swap(SAD, '        SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_.forEach(function (h) { if (h in rowObj) return;',
            '        SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.forEach(function (h) { if (h in rowObj) return;');
        var o = savedWith(m, 35, { header: mktRoute(), lines: [oneLine({ expected_arrival: '2026-10-16' })] });
        return o.lines[0].expected_arrival === '2026-10-16';
    });
// L11 — the header writer dropping destination_marketplace after the append.
mutate('L11 the header writer drops the marketplace even when its column exists',
    function () {
        var o = savedWith(null, 35, { header: mktRoute(), lines: [oneLine()] });
        return o.headers[0].destination_marketplace === 'Amazon';
    },
    function () {
        var m = swap(SAD, "      destination_marketplace: String(header.destination_marketplace || '').trim(),", '');
        var o = savedWith(m, 35, { header: mktRoute(), lines: [oneLine()] });
        return o.headers[0].destination_marketplace === 'Amazon';
    });
// L12 — the gate reverted to the narrow authority, which refuses the very schema B3 exists to accept.
mutate('L12 the write gate reverted to the pre-B3 authority',
    function () { return E.gate(FULL, FULL, FULL.slice(30)) === ''; },
    function () {
        var m = swap(SAD, 'var hR = sadExactSchemaReason_(hSh, SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_, SAD_HEADER_OPTIONAL_TAIL_COLUMNS_);',
            'var hR = sadExactSchemaReason_(hSh, SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_, SAD_LIFECYCLE_TAIL_COLUMNS_);');
        var o = savedWith(m, 35, { header: mktRoute(), lines: [oneLine()] });
        return o.res.success === true;
    });
// L13 — a schema-mutating call introduced into the writer.
mutate('L13 a schema-creating call introduced into the runtime',
    function () { return SCHEMA_MUTATORS.every(function (x) { return code(SAD).indexOf(x) === -1; }); },
    function () {
        var m = swap(SAD, '  var hNames = sadLiveHeaderNames_(hSh), lNames = sadLiveHeaderNames_(lSh);',
            '  hSh.insertColumnsAfter(hSh.getMaxColumns(), 1);\n  var hNames = sadLiveHeaderNames_(hSh), lNames = sadLiveHeaderNames_(lSh);');
        return SCHEMA_MUTATORS.every(function (x) { return code(m).indexOf(x) === -1; });
    });
// L14 — the manifest and the file disagreeing, which is a partial sync waiting to happen.
mutate('L14 the manifest expectation drifting from what the file declares',
    function () { return declares(SAD, 'SAD_BUILD_VERSION_') === manifestExpects('16_shipping_allocation_handlers.gs'); },
    function () {
        var m = swap(HEALTH, "{ file: '16_shipping_allocation_handlers.gs', symbol: 'SAD_BUILD_VERSION_', expected: 'F1-7N-FB-4F-B3'",
            "{ file: '16_shipping_allocation_handlers.gs', symbol: 'SAD_BUILD_VERSION_', expected: 'F1-7N-FB-4D'");
        var exp = (m.match(/\{ file: '16_shipping_allocation_handlers\.gs',[^}]*expected: '([^']+)'/) || [])[1];
        return declares(SAD, 'SAD_BUILD_VERSION_') === exp;
    });
// L15 — a K4 duplicate allowed: the replay creating a second header.
mutate('L15 a K4 replay creating a second header',
    function () {
        var e2 = makeEnv(); e2.stage35();
        e2.save({ header: mktRoute(), lines: [oneLine()] });
        e2.save({ header: mktRoute(), lines: [oneLine()] });
        return e2.headerObjs().length === 1;
    },
    function () {
        var m = swap(SAD, "      if (r4.status === 'REUSE') return { status: 'REUSE', id: r4.allocation_draft_id, conflictIds: [], k2: true, k4: true };",
            '');
        var e2 = makeEnv(m); e2.stage35();
        e2.save({ header: mktRoute(), lines: [oneLine()] });
        e2.save({ header: mktRoute(), lines: [oneLine()] });
        return e2.headerObjs().length === 1;
    });

// ==============================================================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
console.log('negative tests: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
process.exit(fail === 0 ? 0 : 1);
