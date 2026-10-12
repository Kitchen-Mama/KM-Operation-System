// =============================================================================================================
// S8-B3-R3-CP2I — THE BOUNDED allocation_priority WRITE CONTRACT (R52)
// -------------------------------------------------------------------------------------------------------------
// WHAT THIS SUITE IS FOR. R52 replaces a priority save that went through `upsertMarketplace` — raw case-sensitive
// matching, an APPEND on no match, five unrelated columns written unconditionally, a silent skip when the column
// was absent, and no compare-and-set — with one bounded action that can only update one already-identified row.
// Every one of those failure modes is a test below, and every one of them RUNS THE SHIPPED CODE: the handler is
// loaded out of 03_master_data_handlers.gs and executed against an in-memory Apps Script, and the client wrapper
// is loaded out of operation-system-db-api.js and executed against an in-memory edge. Nothing here re-implements
// the logic it is checking, because a test that paraphrases its subject is measuring fiction — which is the
// lesson the whole CP2 sequence was taught by a green read-back that had never asked the server anything.
//
// THE FAKE IS A FAKE, AND SAYS SO. SpreadsheetApp / LockService / Utilities / Session are substituted; the
// serializer under test is the REAL jsonResponse_ lifted from 02_core_sheet_db.gs, and the canonical country
// owner is the REAL KMCID module. The substitutions are the platform, never the behaviour being asserted.
// =============================================================================================================
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + label); } }
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var GS_03 = read('assets/specs/active/apps-script/03_master_data_handlers.gs');
var GS_01 = read('assets/specs/active/apps-script/01_router.gs');
var GS_63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var PAGE = read('assets/js/pages/site-priority.js');
var CORE_KMCID = path.join(ROOT, 'assets', 'js', 'core', 'supply-planning-country-identity.js');

// The REAL serializer, lifted from its owner so this suite cannot drift from it.
var JSON_RESPONSE_SRC = (function () {
    var src = read('assets/specs/active/apps-script/02_core_sheet_db.gs');
    var m = /function jsonResponse_\(payload\) \{[\s\S]*?\n\}/.exec(src);
    if (!m) throw new Error('jsonResponse_ not found in 02_core_sheet_db.gs');
    return m[0];
})();

// =============================================================================================================
// THE IN-MEMORY APPS SCRIPT
// =============================================================================================================
var HEADERS = ['marketplace_id', 'company', 'country', 'marketplace', 'marketplace_display_name',
    'marketplace_alias', 'fulfillment_model', 'allocation_priority', 'currency', 'status',
    'created_by', 'created_at', 'updated_by', 'updated_at', 'note'];

function row(id, company, country, marketplace, priority, extra) {
    var r = new Array(HEADERS.length).fill('');
    r[0] = id; r[1] = company; r[2] = country; r[3] = marketplace;
    r[4] = marketplace; r[5] = marketplace; r[6] = 'platform_fulfilled';
    r[7] = (priority === undefined) ? '' : priority;
    r[8] = 'USD'; r[9] = 'active'; r[12] = 'seed'; r[13] = '2026-01-01';
    if (extra) { for (var k in extra) { if (HEADERS.indexOf(k) !== -1) r[HEADERS.indexOf(k)] = extra[k]; } }
    return r;
}

/**
 * opts.headers      — override the header row (to delete a column)
 * opts.failSetValue — 1-based index of the setValue call that throws (fault injection)
 * opts.failFlush    — true: SpreadsheetApp.flush() throws
 * opts.lockFails    — true: tryLock returns false
 * opts.noKmcid      — true: KMCID is absent from the global scope
 * opts.missingSheet — true: getSheetByName returns null
 */
function makeAppsScript(rows, opts) {
    opts = opts || {};
    var headers = opts.headers || HEADERS;
    var grid = [headers.slice()].concat(rows.map(function (r) { return r.slice(); }));
    // `lockTries` counts ATTEMPTS and `lockAcquired` counts SUCCESSES, and the distinction is not pedantry:
    // a refused tryLock must NOT be followed by releaseLock — releasing a lock you do not hold is how one
    // handler frees another handler's critical section. So the balance invariant below is releases ===
    // ACQUISITIONS, never releases === attempts.
    var log = { setValues: [], appends: [], flushes: 0, lockTries: 0, lockAcquired: 0, lockReleases: 0, locked: false };
    var setCount = 0;

    var sheet = {
        getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
        getRange: function (r, c) {
            return { setValue: function (v) {
                setCount++;
                if (opts.failSetValue === setCount) throw new Error('INJECTED setValue failure #' + setCount);
                log.setValues.push({ row: r, col: c, header: headers[c - 1], value: v });
                grid[r - 1][c - 1] = v;
            } };
        },
        appendRow: function (arr) { log.appends.push(arr.slice()); grid.push(arr.slice()); }
    };

    var sandbox = {
        console: { log: function () {}, warn: function () {} },
        JSON: JSON, Math: Math, Date: Date, String: String, Number: Number, Boolean: Boolean,
        Array: Array, Object: Object, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
        parseInt: parseInt, parseFloat: parseFloat,
        SpreadsheetApp: {
            getActiveSpreadsheet: function () {
                return { getSheetByName: function (n) { return (opts.missingSheet || n !== 'marketplaces') ? null : sheet; } };
            },
            flush: function () { if (opts.failFlush) throw new Error('INJECTED flush failure'); log.flushes++; }
        },
        LockService: {
            getScriptLock: function () {
                return {
                    tryLock: function () {
                        log.lockTries++;
                        if (opts.lockFails) return false;          // refused: the caller must NOT release
                        // A lock that is already held by this script would be a harness bug, and a harness bug
                        // that silently permits re-entry would hide exactly the defect this suite checks for.
                        if (log.locked) throw new Error('HARNESS: re-entrant tryLock while already held');
                        log.locked = true;
                        log.lockAcquired++;
                        return true;
                    },
                    releaseLock: function () { log.lockReleases++; log.locked = false; }
                };
            }
        },
        Utilities: { formatDate: function () { return '2026-10-12'; } },
        Session: { getScriptTimeZone: function () { return 'UTC'; } },
        ContentService: {
            MimeType: { JSON: 'application/json' },
            createTextOutput: function (t) { return { _t: t, setMimeType: function () { return this; } }; }
        },
        Logger: { log: function () {} }
    };
    if (!opts.noKmcid) sandbox.KMCID = require(CORE_KMCID);
    sandbox.globalThis = sandbox;

    var ctx = vm.createContext(sandbox);
    vm.runInContext(JSON_RESPONSE_SRC, ctx, { filename: '02_core_sheet_db.gs' });
    vm.runInContext(GS_03, ctx, { filename: '03_master_data_handlers.gs' });

    return {
        ctx: ctx, log: log, grid: grid, headers: headers,
        setPriority: function (body) { return JSON.parse(ctx.handleSetMarketplaceAllocationPriority_(body)._t); },
        upsert: function (body) { return JSON.parse(ctx.handleUpsertMarketplace_(body)._t); },
        cell: function (rowIdx, header) { return grid[rowIdx + 1][headers.indexOf(header)]; },
        snapshot: function () { return JSON.stringify(grid); }
    };
}

function baseRows() {
    return [
        row('MKT-KM-US-AMAZON', 'KM', 'US', 'Amazon', 50),
        row('MKT-KM-GB-AMAZON', 'KM', 'GB', 'Amazon', 60),
        row('MKT-KM-DE-AMAZON', 'KM', 'DE', 'Amazon', ''),      // MISSING priority
        row('MKT-OT-US-AMAZON', 'OtherCo', 'US', 'Amazon', 70)
    ];
}
function okPayload(extra) {
    var p = { company: 'KM', country: 'US', marketplace: 'Amazon',
        expected_marketplace_id: 'MKT-KM-US-AMAZON', allocation_priority: 90,
        expected_allocation_priority_state: 'SET', expected_allocation_priority: 50,
        updated_by: 'site-priority-page' };
    if (extra) { for (var k in extra) p[k] = extra[k]; }
    return p;
}

// =============================================================================================================
section('A. The handler, EXECUTED — the happy path and what it is forbidden to disturb');
// =============================================================================================================
(function () {
    var a = makeAppsScript(baseRows());
    var before = a.snapshot();
    var r = a.setPriority(okPayload());

    eq(r.success, true, 'A1 a well-formed compare-and-set commits');
    eq(r.data.allocation_priority, 90, 'A1a and reports the value it wrote');
    eq(r.data.marketplace_id, 'MKT-KM-US-AMAZON', 'A1b naming the row it wrote to');
    eq(r.data.canonical_country, 'US', 'A1c and the canonical identity it resolved');
    eq(a.cell(0, 'allocation_priority'), 90, 'A2 the stored cell now holds 90');

    // T5 / P-6 — EXACTLY THREE COLUMNS. This is the assertion that replaces the echo payload: the old writer
    // touched display name, currency, status and alias on every save, so a priority edit could silently
    // reactivate a disabled marketplace or auto-fill a blank alias.
    var touched = a.log.setValues.map(function (s) { return s.header; }).sort();
    eq(touched.join(','), 'allocation_priority,updated_at,updated_by',
        'A3 exactly three columns are written, and they are the three the contract names');
    eq(a.log.setValues.filter(function (s) { return s.row !== 2; }).length, 0,
        'A3a every write lands on the ONE matched row');
    eq(a.log.appends.length, 0, 'A4 nothing is appended');
    eq(a.cell(1, 'allocation_priority'), 60, 'A4a the GB row is untouched');
    eq(a.cell(3, 'allocation_priority'), 70, 'A4b and so is the other company');
    eq(a.cell(0, 'status'), 'active', 'A5 status is not rewritten');
    eq(a.cell(0, 'currency'), 'USD', 'A5a nor currency');
    eq(a.cell(0, 'marketplace_display_name'), 'Amazon', 'A5b nor the display name');
    eq(a.cell(0, 'marketplace_alias'), 'Amazon', 'A5c nor the alias');
    eq(a.cell(0, 'updated_by'), 'site-priority-page', 'A6 updated_by records the actor');
    eq(a.cell(0, 'updated_at'), '2026-10-12', 'A6a and updated_at is stamped');

    // ORDER MATTERS AND IS ASSERTED: the business value first, so a death mid-write leaves a recoverable
    // inconsistency rather than an audit stamp for a change that never happened.
    eq(a.log.setValues[0].header, 'allocation_priority', 'A7 the priority is written FIRST, before the audit fields');
    ok(a.log.flushes >= 1, 'A8 the write is flushed BEFORE the success is returned');
    ok(before !== a.snapshot(), 'A9 (non-vacuity) the sheet really did change');
    eq(a.log.lockReleases, a.log.lockAcquired, 'A10 the lock is released exactly as often as it was ACQUIRED');
    eq(a.log.locked, false, 'A10a and is not held after the call returns');
})();

// =============================================================================================================
section('B. Canonical identity, collisions and targets — nothing is ever created or merged');
// =============================================================================================================
(function () {
    // T1 — UK and GB are ONE marketplace under canonical identity. Neither row may be written.
    var rows = baseRows();
    rows.push(row('MKT-KM-UK-AMAZON', 'KM', 'UK', 'Amazon', 80));
    var a = makeAppsScript(rows);
    var before = a.snapshot();
    var r = a.setPriority(okPayload({ country: 'GB', expected_marketplace_id: 'MKT-KM-GB-AMAZON',
        expected_allocation_priority: 60 }));
    eq(r.success, false, 'B1 UK + GB for one company/marketplace is refused');
    eq(r.code, 'IDENTITY_COLLISION', 'B1a as a canonical identity collision');
    eq(r.zero_write, true, 'B1b and it proves it wrote nothing');
    eq(a.snapshot(), before, 'B1c the sheet is byte-identical afterwards');
    eq(a.log.appends.length, 0, 'B1d nothing was appended');
    eq(a.log.setValues.length, 0, 'B1e nothing was merged or renumbered');
    ok((r.conflicting_country_values || []).join(',').indexOf('UK') !== -1,
        'B1f and the refusal names the raw spellings so an operator can resolve it');

    // T2 — the canonical identity owner is ABSENT. This must fail CLOSED.
    var b = makeAppsScript(rows, { noKmcid: true });
    var rb = b.setPriority(okPayload());
    eq(rb.success, false, 'B2 a deployment without the canonical identity owner refuses');
    eq(rb.code, 'CANONICAL_IDENTITY_UNAVAILABLE', 'B2a naming the missing owner');
    eq(rb.zero_write, true, 'B2b having written nothing');
    eq(b.log.lockTries, 0, 'B2c and without even taking the lock — the check is cheaper than the lock');

    // T3 — no match. The old writer APPENDED here. This one refuses.
    var c = makeAppsScript(baseRows());
    var cbefore = c.snapshot();
    var rc = c.setPriority(okPayload({ marketplace: 'Walmart', expected_marketplace_id: 'MKT-KM-US-WALMART' }));
    eq(rc.success, false, 'B3 an unmatched target is refused');
    eq(rc.code, 'TARGET_NOT_FOUND', 'B3a as TARGET_NOT_FOUND');
    eq(c.log.appends.length, 0, 'B3b and NOTHING IS APPENDED — the behaviour this action exists to remove');
    eq(c.snapshot(), cbefore, 'B3c the sheet is unchanged');

    // Company and marketplace stay RAW and case-sensitive — folding them would merge rows the database keeps apart.
    var d = makeAppsScript(baseRows());
    eq(d.setPriority(okPayload({ company: 'km' })).code, 'TARGET_NOT_FOUND',
        'B4 company is compared case-sensitively, exactly as the sheet does');
    eq(d.setPriority(okPayload({ marketplace: 'amazon' })).code, 'TARGET_NOT_FOUND',
        'B4a and so is marketplace');

    // A genuine duplicate of the SAME raw identity.
    var dup = baseRows();
    dup.push(row('MKT-KM-US-AMAZON-2', 'KM', 'US', 'Amazon', 55));
    var e = makeAppsScript(dup);
    var ebefore = e.snapshot();
    var re = e.setPriority(okPayload());
    eq(re.success, false, 'B5 two rows with the identical raw identity are refused');
    ok(re.code === 'DUPLICATE_TARGET' || re.code === 'IDENTITY_COLLISION',
        'B5a as a duplicate/collision rather than a silent pick-the-first');
    eq(e.snapshot(), ebefore, 'B5b with the sheet unchanged');

    // T4 — marketplace_id guards.
    var f = makeAppsScript(baseRows());
    var rf = f.setPriority(okPayload({ expected_marketplace_id: 'MKT-SOMETHING-ELSE' }));
    eq(rf.success, false, 'B6 a marketplace_id that does not match the stored row is refused');
    eq(rf.code, 'TARGET_CHANGED', 'B6a as TARGET_CHANGED');
    eq(f.log.setValues.length, 0, 'B6b writing nothing');

    var noid = baseRows(); noid[0][0] = '';
    var g = makeAppsScript(noid);
    var rg = g.setPriority(okPayload());
    eq(rg.success, false, 'B7 a row carrying NO marketplace_id is refused');
    eq(rg.code, 'TARGET_IDENTITY_UNVERIFIABLE',
        'B7a the guard refuses rather than disabling itself when its input is missing');
})();

// =============================================================================================================
section('C. Compare-and-set — mandatory, three-state, and never folds MISSING into 0');
// =============================================================================================================
(function () {
    // T8 — there is NO unguarded write path.
    var a = makeAppsScript(baseRows());
    var p = okPayload(); delete p.expected_allocation_priority_state; delete p.expected_allocation_priority;
    var r = a.setPriority(p);
    eq(r.success, false, 'C1 a save with no CAS state is refused');
    eq(r.code, 'CAS_REQUIRED', 'C1a as CAS_REQUIRED — "mandatory" means there is no path without it');
    eq(a.log.setValues.length, 0, 'C1b nothing written');
    eq(a.setPriority(okPayload({ expected_allocation_priority_state: 'MAYBE' })).code, 'CAS_REQUIRED',
        'C1c an unrecognised state is refused too, never treated as absent');
    var p2 = okPayload(); delete p2.expected_allocation_priority;
    eq(a.setPriority(p2).code, 'CAS_REQUIRED', 'C1d SET without a number is refused');
    eq(a.setPriority(okPayload({ expected_allocation_priority: '' })).code, 'CAS_REQUIRED',
        'C1e and a blank expected value is NOT a valid SET');

    // T6 — the stale-client case this whole round exists for.
    var b = makeAppsScript(baseRows());
    var rb = b.setPriority(okPayload({ expected_allocation_priority: 40 }));   // sheet holds 50
    eq(rb.success, false, 'C2 a stale expected value is refused');
    eq(rb.code, 'PRIORITY_CHANGED', 'C2a as PRIORITY_CHANGED');
    eq(rb.stored_value, 50, 'C2b reporting what is actually stored');
    eq(rb.zero_write, true, 'C2c with proof that nothing was written');
    eq(b.cell(0, 'allocation_priority'), 50, 'C2d and the stored value is intact');

    // T7 — MISSING vs 0 vs whitespace, in BOTH directions.
    var c = makeAppsScript(baseRows());
    var rc = c.setPriority({ company: 'KM', country: 'DE', marketplace: 'Amazon',
        expected_marketplace_id: 'MKT-KM-DE-AMAZON', allocation_priority: 10,
        expected_allocation_priority_state: 'MISSING' });
    eq(rc.success, true, 'C3 MISSING -> a value commits when the cell really is empty');
    eq(c.cell(2, 'allocation_priority'), 10, 'C3a and stores it');

    var d = makeAppsScript(baseRows());
    var rd = d.setPriority(okPayload({ expected_allocation_priority_state: 'MISSING',
        expected_allocation_priority: undefined }));
    eq(rd.success, false, 'C4 expecting MISSING against a cell holding 50 is refused');
    eq(rd.code, 'PRIORITY_CHANGED', 'C4a as PRIORITY_CHANGED');
    eq(rd.stored_state, 'SET', 'C4b naming what it found instead');

    // WHITESPACE IS MISSING, NOT ZERO. Number(' ') is 0, and that coercion is the §45.A defect.
    var ws = baseRows(); ws[0][7] = '   ';
    var e = makeAppsScript(ws);
    eq(e.setPriority(okPayload({ expected_allocation_priority_state: 'MISSING' })).success, true,
        'C5 a whitespace-only cell is MISSING');
    var e2 = makeAppsScript(ws);
    eq(e2.setPriority(okPayload({ expected_allocation_priority: 0 })).code, 'PRIORITY_CHANGED',
        'C5a and is NOT equal to an expected 0 — Number(\' \') === 0 is exactly the coercion refused here');

    // T9 — a VALID ZERO, in both roles.
    var z = baseRows(); z[0][7] = 0;
    var f = makeAppsScript(z);
    eq(f.setPriority(okPayload({ expected_allocation_priority: 0, allocation_priority: 5 })).success, true,
        'C6 a stored 0 satisfies an expected 0 — 0 is a valid lowest weight, not an absence');
    var g = makeAppsScript(z);
    eq(g.setPriority(okPayload({ expected_allocation_priority_state: 'MISSING' })).code, 'PRIORITY_CHANGED',
        'C6a while a stored 0 does NOT satisfy MISSING');
    var h = makeAppsScript(baseRows());
    eq(h.setPriority(okPayload({ allocation_priority: 0 })).success, true, 'C7 and 0 may be WRITTEN');
    eq(h.cell(0, 'allocation_priority'), 0, 'C7a landing as a real 0');

    // An INVALID stored value is its own state and is never silently overwritten.
    var bad = baseRows(); bad[0][7] = '7abc';
    var i = makeAppsScript(bad);
    eq(i.setPriority(okPayload({ expected_allocation_priority_state: 'MISSING' })).code, 'PRIORITY_CHANGED',
        'C8 an unreadable stored value does not satisfy MISSING — it is not an empty cell');
    eq(i.cell(0, 'allocation_priority'), '7abc', 'C8a and the evidence of the bad row survives');

    // T10 — the value being written.
    var j = makeAppsScript(baseRows());
    [-1, 'abc', '', '  ', null, undefined, Infinity, NaN, '1,000'].forEach(function (bv, n) {
        var pv = okPayload(); pv.allocation_priority = bv;
        var rv = j.setPriority(pv);
        eq(rv.success, false, 'C9.' + n + ' an invalid priority (' + JSON.stringify(bv) + ') is refused');
    });
    eq(j.log.setValues.length, 0, 'C9a and none of them wrote anything');
    eq(j.cell(0, 'allocation_priority'), 50, 'C9b the stored value is untouched throughout');
})();

// =============================================================================================================
section('D. Schema, lock and fault injection — zero-write is EVIDENCE, never a default');
// =============================================================================================================
(function () {
    // T11 — the column this action exists to write is absent. The old writer SKIPPED SILENTLY and reported success.
    var noCol = HEADERS.filter(function (h) { return h !== 'allocation_priority'; });
    var rows = baseRows().map(function (r) {
        var o = []; HEADERS.forEach(function (h, i) { if (h !== 'allocation_priority') o.push(r[i]); }); return o;
    });
    var a = makeAppsScript(rows, { headers: noCol });
    var r = a.setPriority(okPayload());
    eq(r.success, false, 'D1 a missing allocation_priority column is a REFUSAL');
    eq(r.code, 'SCHEMA_MISSING_COLUMN', 'D1a named as a schema fault, never a silent skip');
    eq(r.zero_write, true, 'D1b with zero-write proof');

    var noId = HEADERS.filter(function (h) { return h !== 'marketplace_id'; });
    var rows2 = baseRows().map(function (rr) {
        var o = []; HEADERS.forEach(function (h, i) { if (h !== 'marketplace_id') o.push(rr[i]); }); return o;
    });
    eq(makeAppsScript(rows2, { headers: noId }).setPriority(okPayload()).code, 'SCHEMA_MISSING_COLUMN',
        'D2 and so is a missing marketplace_id column');

    // T16 — the lock.
    var b = makeAppsScript(baseRows(), { lockFails: true });
    var rb = b.setPriority(okPayload());
    eq(rb.success, false, 'D3 a contended lock refuses');
    eq(rb.code, 'LOCK_UNAVAILABLE', 'D3a as LOCK_UNAVAILABLE');
    eq(rb.zero_write, true, 'D3b having written nothing');
    eq(b.log.setValues.length, 0, 'D3c and really not having written');
    ok(b.log.lockTries >= 1, 'D3d it really did attempt the lock');
    eq(b.log.lockReleases, 0, 'D3e and does NOT release a lock it never acquired');

    // LOCK RELEASE ON EVERY EXIT — success, each refusal class, and a thrown write.
    var exits = [
        ['success', okPayload(), {}],
        ['target not found', okPayload({ marketplace: 'Nope' }), {}],
        ['identity mismatch', okPayload({ expected_marketplace_id: 'X' }), {}],
        ['CAS mismatch', okPayload({ expected_allocation_priority: 1 }), {}],
        ['schema fault', okPayload(), { headers: HEADERS.filter(function (h) { return h !== 'allocation_priority'; }) }],
        ['write throws', okPayload(), { failSetValue: 1 }],
        ['flush throws', okPayload(), { failFlush: true }]
    ];
    exits.forEach(function (t) {
        var h = t[2].headers;
        var rws = h ? baseRows().map(function (rr) {
            var o = []; HEADERS.forEach(function (hh, i) { if (h.indexOf(hh) !== -1) o.push(rr[i]); }); return o;
        }) : baseRows();
        var m = makeAppsScript(rws, t[2]);
        m.setPriority(t[1]);
        eq(m.log.locked, false, 'D4 the lock is released after: ' + t[0]);
        eq(m.log.lockReleases, m.log.lockAcquired, 'D4a releases match acquisitions after: ' + t[0]);
    });

    // T17 — FAILURE AT EACH WRITE STEP. Once a setter has begun, zero-write may NOT be claimed.
    [1, 2, 3].forEach(function (n) {
        var m = makeAppsScript(baseRows(), { failSetValue: n });
        var rr = m.setPriority(okPayload());
        eq(rr.success, false, 'D5.' + n + ' a failure at setValue #' + n + ' is not a success');
        eq(rr.code, 'WRITE_OUTCOME_UNKNOWN', 'D5.' + n + 'a and is classified as UNKNOWN');
        eq(rr.zero_write, false, 'D5.' + n + 'b and explicitly does NOT claim zero-write');
    });
    var fl = makeAppsScript(baseRows(), { failFlush: true });
    var rfl = fl.setPriority(okPayload());
    eq(rfl.success, false, 'D6 a failed flush is not a success');
    eq(rfl.zero_write, false, 'D6a and does not claim zero-write — the cells were already set');
    eq(fl.cell(0, 'allocation_priority'), 90, 'D6b (non-vacuity) the value really had been written by then');

    // A partial write leaves a NAMED inconsistency rather than a silent one.
    var pw = makeAppsScript(baseRows(), { failSetValue: 2 });
    pw.setPriority(okPayload());
    eq(pw.cell(0, 'allocation_priority'), 90, 'D7 the priority landed...');
    eq(pw.cell(0, 'updated_by'), 'seed', 'D7a ...while the audit stamp did not — the inconsistency is real');

    // The sheet itself being absent.
    eq(makeAppsScript(baseRows(), { missingSheet: true }).setPriority(okPayload()).code, 'SHEET_NOT_FOUND',
        'D8 a missing marketplaces sheet is a named refusal');
})();

// =============================================================================================================
section('E. The legacy writer — the priority door is CLOSED, Add Marketplace is not');
// =============================================================================================================
(function () {
    var base = { company: 'KM', country: 'US', marketplace: 'Amazon', currency: 'USD' };

    // THE BYPASS. Every shape of the field, including the ones a half-built payload arrives in.
    [90, 0, '', null, '0', -5, 'abc'].forEach(function (v, n) {
        var a = makeAppsScript(baseRows());
        var before = a.snapshot();
        var p = {}; for (var k in base) p[k] = base[k];
        p.allocation_priority = v;
        var r = a.upsert(p);
        eq(r.success, false, 'E1.' + n + ' upsertMarketplace refuses a payload carrying allocation_priority=' + JSON.stringify(v));
        eq(r.code, 'PRIORITY_WRITE_NOT_SUPPORTED_HERE', 'E1.' + n + 'a with a named refusal');
        eq(r.zero_write, true, 'E1.' + n + 'b and zero-write proof');
        eq(a.snapshot(), before, 'E1.' + n + 'c the sheet is unchanged');
        eq(a.log.lockTries, 0, 'E1.' + n + 'd and the refusal costs no lock');
    });
    eq(makeAppsScript(baseRows()).upsert((function () {
        var p = {}; for (var k in base) p[k] = base[k]; p.allocation_priority = undefined; return p;
    })()).code, 'PRIORITY_WRITE_NOT_SUPPORTED_HERE',
        'E2 even an explicit undefined is refused — the KEY is what says the caller meant to set a priority');

    // T15 — NORMAL Add Marketplace is untouched. Update path.
    var b = makeAppsScript(baseRows());
    var rb = b.upsert({ company: 'KM', country: 'US', marketplace: 'Amazon', currency: 'EUR',
        marketplace_display_name: 'Amazon US', status: 'active', updated_by: 'add-marketplace' });
    eq(rb.success, true, 'E3 an ordinary update still succeeds');
    eq(rb.data.status, 'updated', 'E3a as an update');
    eq(b.cell(0, 'currency'), 'EUR', 'E3b writing the fields it has always written');
    eq(b.cell(0, 'marketplace_display_name'), 'Amazon US', 'E3c including the display name');
    eq(b.cell(0, 'allocation_priority'), 50, 'E4 AND LEAVING THE PRIORITY ALONE');
    eq(b.log.setValues.filter(function (s) { return s.header === 'allocation_priority'; }).length, 0,
        'E4a never touching that column at all');
    eq(b.log.lockReleases, b.log.lockAcquired, 'E5 the legacy writer now takes and releases the shared lock');
    ok(b.log.lockAcquired >= 1, 'E5a and really does take it');

    // Create path.
    var c = makeAppsScript(baseRows());
    var rc = c.upsert({ company: 'KM', country: 'FR', marketplace: 'Amazon', currency: 'EUR',
        updated_by: 'add-marketplace' });
    eq(rc.success, true, 'E6 an ordinary create still succeeds');
    eq(rc.data.status, 'created', 'E6a as a create');
    eq(c.log.appends.length, 1, 'E6b appending exactly one row');
    eq(c.log.appends[0][HEADERS.indexOf('allocation_priority')], '',
        'E6c with a BLANK priority — a new marketplace is unranked, never 0');

    // The legacy writer refuses on a contended lock too, which is its one new behaviour.
    var d = makeAppsScript(baseRows(), { lockFails: true });
    var rd = d.upsert({ company: 'KM', country: 'US', marketplace: 'Amazon', currency: 'USD' });
    eq(rd.success, false, 'E7 Add Marketplace now refuses while another write holds the lock');
    eq(rd.code, 'LOCK_UNAVAILABLE', 'E7a as LOCK_UNAVAILABLE');
    eq(rd.zero_write, true, 'E7b having written nothing');
    eq(d.log.appends.length, 0, 'E7c and appended nothing');
})();

// =============================================================================================================
section('F. Bounded stress + fault injection — invariants hold across randomized runs');
// =============================================================================================================
(function () {
    // A deterministic PRNG: a stress run that cannot be replayed is an anecdote.
    var seed = 20261012;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    function pick(a) { return a[Math.floor(rnd() * a.length) % a.length]; }

    var RUNS = 240;
    var violations = [];
    var outcomes = {};
    var committed = 0;

    for (var n = 0; n < RUNS; n++) {
        var rows = baseRows();
        // Occasionally introduce the structural hazards.
        if (rnd() < 0.15) rows.push(row('MKT-KM-UK-AMAZON', 'KM', 'UK', 'Amazon', 80));      // canonical collision
        if (rnd() < 0.10) rows.push(row('MKT-DUP', 'KM', 'US', 'Amazon', 55));               // raw duplicate
        if (rnd() < 0.10) rows[0][0] = '';                                                    // no marketplace_id
        if (rnd() < 0.12) rows[0][7] = pick(['', '   ', '7abc', -3, 0]);                      // odd stored value

        var opts = {};
        if (rnd() < 0.12) opts.failSetValue = 1 + Math.floor(rnd() * 3);
        if (rnd() < 0.06) opts.failFlush = true;
        if (rnd() < 0.08) opts.lockFails = true;
        if (rnd() < 0.05) opts.noKmcid = true;

        var p = okPayload({
            allocation_priority: pick([0, 1, 50, 90, 1000, -1, 'x', '']),
            expected_allocation_priority: pick([50, 0, 40, '']),
            expected_allocation_priority_state: pick(['SET', 'MISSING', 'SET', 'SET']),
            country: pick(['US', 'US', 'US', 'GB', 'us']),
            expected_marketplace_id: pick(['MKT-KM-US-AMAZON', 'MKT-KM-US-AMAZON', 'WRONG'])
        });

        var a = makeAppsScript(rows, opts);
        var before = a.snapshot();
        var r;
        try { r = a.setPriority(p); }
        catch (e) { violations.push('run ' + n + ': handler THREW out of the router boundary: ' + e.message); continue; }

        outcomes[r.success ? 'success' : (r.code || 'nocode')] = (outcomes[r.success ? 'success' : (r.code || 'nocode')] || 0) + 1;

        // INVARIANT 1 — the lock is always released.
        if (a.log.locked) violations.push('run ' + n + ': lock still held after ' + (r.code || 'success'));
        if (a.log.lockReleases !== a.log.lockAcquired) violations.push('run ' + n + ': lock acquire/release imbalance');
        if (a.log.lockReleases > a.log.lockAcquired) violations.push('run ' + n + ': released a lock it never held');
        // INVARIANT 2 — nothing is EVER appended by this action.
        if (a.log.appends.length) violations.push('run ' + n + ': appended a row');
        // INVARIANT 3 — only the three contract columns are ever written.
        a.log.setValues.forEach(function (sv) {
            if (['allocation_priority', 'updated_by', 'updated_at'].indexOf(sv.header) === -1) {
                violations.push('run ' + n + ': wrote forbidden column ' + sv.header);
            }
        });
        // INVARIANT 4 — a zero_write:true claim must be TRUE.
        if (r.zero_write === true && before !== a.snapshot()) {
            violations.push('run ' + n + ': claimed zero_write but the sheet changed');
        }
        // INVARIANT 5 — a refusal never reports success, and a success always names the row and value.
        if (r.success) {
            committed++;
            if (!r.data || !r.data.marketplace_id) violations.push('run ' + n + ': success without a row identity');
            if (a.log.flushes < 1) violations.push('run ' + n + ': success without a flush');
            if (Number(a.cell(0, 'allocation_priority')) !== Number(p.allocation_priority)) {
                violations.push('run ' + n + ': success but the stored value is not the requested one');
            }
        } else if (r.code === undefined) {
            violations.push('run ' + n + ': a refusal with no code');
        }
        // INVARIANT 6 — rows belonging to other scopes are never collateral.
        if (String(a.cell(3, 'allocation_priority')) !== '70') violations.push('run ' + n + ': another company was modified');
    }

    eq(violations.length, 0, 'F1 ' + RUNS + ' randomized runs violated no invariant'
        + (violations.length ? ' — first: ' + violations[0] : ''));
    ok(committed > 0, 'F2 (non-vacuity) some runs actually committed — the stress is not all refusals  [' + committed + '/' + RUNS + ']');
    ok(Object.keys(outcomes).length >= 5,
        'F3 (non-vacuity) the stress exercised at least five distinct outcomes  [' + Object.keys(outcomes).join(' ') + ']');
    ok((outcomes.WRITE_OUTCOME_UNKNOWN || 0) > 0, 'F4 (non-vacuity) including injected mid-write failures');
})();

// =============================================================================================================
section('G. The client wrapper, EXECUTED — the pre-write gate and the four outcomes');
// =============================================================================================================
function makeClient(opts) {
    opts = opts || {};
    var log = { fetches: [], gateCalls: 0 };
    var store = {};
    var sb = {
        console: { log: function () {}, warn: function () {}, error: function () {} },
        JSON: JSON, Math: Math, Date: Date, Promise: Promise, Array: Array, Object: Object,
        String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
        Set: Set, Map: Map, WeakMap: WeakMap, isFinite: isFinite, isNaN: isNaN,
        parseInt: parseInt, parseFloat: parseFloat,
        encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
        setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {}, clearInterval: function () {},
        AbortController: AbortController, performance: { now: function () { return 0; } },
        localStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
            setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
        document: { addEventListener: function () {}, removeEventListener: function () {}, readyState: 'complete',
            getElementById: function () { return null; }, querySelector: function () { return null; },
            querySelectorAll: function () { return []; },
            createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} }, appendChild: function () {} }; } },
        fetch: function (u, i) {
            log.fetches.push({ url: u, body: i && i.body });
            if (opts.netThrows) { var e = new Error('socket hang up'); e.kmTimeout = !!opts.timeout; return Promise.reject(e); }
            var body = opts.responseBody !== undefined ? opts.responseBody : JSON.stringify({ success: true, data: { marketplace_id: 'MKT-KM-US-AMAZON', allocation_priority: 90 } });
            return Promise.resolve({ ok: opts.httpOk === false ? false : true, status: opts.status || 200,
                url: String(u), redirected: false,
                headers: { get: function (h) { return /content-type/i.test(h) ? (opts.contentType || 'application/json') : null; } },
                text: function () { return Promise.resolve(body); } });
        }
    };
    sb.window = { location: { origin: 'https://example.invalid', hash: '' },
        addEventListener: function () {}, removeEventListener: function () {} };
    sb.globalThis = sb; sb.self = sb;
    var ctx = vm.createContext(sb);
    vm.runInContext(DBAPI, ctx, { filename: 'operation-system-db-api.js' });
    // The gate is the SHIPPED function unless a test replaces it; replacing it is how the deployment verdicts
    // are driven without standing up a whole fake system.health answer.
    var realGate = sb.window.KM.DB.checkPageDeploymentContract;
    sb.window.KM.DB.checkPageDeploymentContract = function (pageKey) {
        log.gateCalls++;
        if (opts.gate === 'throw') return Promise.reject(new Error('probe exploded'));
        if (opts.gate) return Promise.resolve(opts.gate);
        return Promise.resolve({ ok: true, code: 'DEPLOYMENT_CONTRACT_OK', page: pageKey });
    };
    sb.window.KM.referenceCache = { invalidated: [], invalidate: function (k) { this.invalidated.push(k); } };
    return { sb: sb, DB: sb.window.KM.DB, log: log, realGate: realGate,
        cache: sb.window.KM.referenceCache };
}

var GOOD = { company: 'KM', country: 'US', marketplace: 'Amazon',
    expected_marketplace_id: 'MKT-KM-US-AMAZON', allocation_priority: 90,
    expected_allocation_priority_state: 'SET', expected_allocation_priority: 50 };

(function () {
    var done = [];

    function step(name, fn) { done.push(fn().catch(function (e) { fail++; console.log('FAIL ' + name + ' threw: ' + e.message); })); }

    step('G-happy', function () {
        var c = makeClient();
        return c.DB.setMarketplaceAllocationPriority(GOOD).then(function (r) {
            eq(r.outcome, 'CONFIRMED_COMMITTED', 'G1 a success answer is CONFIRMED_COMMITTED');
            eq(c.cache.invalidated.join(','), 'marketplaces',
                'G1a and invalidates exactly ONE reference key — this page\'s own resource');
            eq(c.log.fetches.length, 1, 'G1b with exactly one request dispatched');
            var sent = JSON.parse(c.log.fetches[0].body);
            eq(sent.action, 'marketplace.allocationPriority.set', 'G1c carrying the dedicated action');
            eq(sent.expected_allocation_priority_state, 'SET', 'G1d and the compare-and-set');
        });
    });

    // T12 / T13 — the pre-write gate. The request must NEVER be dispatched.
    step('G-gate', function () {
        var c = makeClient({ gate: { ok: false, code: 'DEPLOYMENT_CONTRACT_MISMATCH',
            message: 'missing action', missing: ['marketplace.allocationPriority.set'] } });
        return c.DB.setMarketplaceAllocationPriority(GOOD).then(function (r) {
            eq(r.outcome, 'CONFIRMED_NOT_STARTED', 'G2 an old or partial backend refuses BEFORE the write');
            eq(r.code, 'DEPLOYMENT_CONTRACT_MISMATCH', 'G2a naming the deployment, not the data');
            eq(c.log.fetches.length, 0, 'G2b AND NOTHING IS DISPATCHED');
            eq(c.cache.invalidated.length, 0, 'G2c and no cache key is disturbed');
        });
    });
    step('G-gate-throws', function () {
        var c = makeClient({ gate: 'throw' });
        return c.DB.setMarketplaceAllocationPriority(GOOD).then(function (r) {
            eq(r.outcome, 'CONFIRMED_NOT_STARTED', 'G3 an unverifiable deployment does not get a write');
            eq(c.log.fetches.length, 0, 'G3a nothing dispatched');
        });
    });

    // The client-side CAS guard: no build of this client dispatches a priority write without one.
    step('G-cas', function () {
        var c = makeClient();
        var p = {}; for (var k in GOOD) p[k] = GOOD[k];
        delete p.expected_allocation_priority_state;
        return c.DB.setMarketplaceAllocationPriority(p).then(function (r) {
            eq(r.outcome, 'CONFIRMED_NOT_STARTED', 'G4 a payload with no CAS state is not sent');
            eq(r.code, 'CAS_REQUIRED', 'G4a named as CAS_REQUIRED');
            eq(c.log.fetches.length, 0, 'G4b and never reaches the network');
            eq(c.log.gateCalls, 0, 'G4c it is refused before even probing — a request that cannot succeed costs nothing');
        });
    });
    step('G-noid', function () {
        var c = makeClient();
        var p = {}; for (var k in GOOD) p[k] = GOOD[k];
        p.expected_marketplace_id = '';
        return c.DB.setMarketplaceAllocationPriority(p).then(function (r) {
            eq(r.code, 'TARGET_IDENTITY_UNVERIFIABLE', 'G5 a payload with no target identity is not sent');
            eq(c.log.fetches.length, 0, 'G5a and never reaches the network');
        });
    });

    // THE ZERO-WRITE RULE — the heart of this wrapper.
    step('G-rejected', function () {
        var c = makeClient({ responseBody: JSON.stringify({ success: false, code: 'PRIORITY_CHANGED',
            zero_write: true, error: 'stale' }) });
        return c.DB.setMarketplaceAllocationPriority(GOOD).then(function (r) {
            eq(r.outcome, 'CONFIRMED_REJECTED', 'G6 success:false WITH zero_write proof is a refusal');
            eq(r.code, 'PRIORITY_CHANGED', 'G6a carrying the handler\'s own code');
            eq(c.cache.invalidated.length, 0, 'G6b and a refusal invalidates nothing');
        });
    });
    step('G-generic', function () {
        // EXACTLY what 01_router.gs's doPost catch returns: success:false, an error string, and NO zero_write.
        var c = makeClient({ responseBody: JSON.stringify({ success: false, error: 'Cannot read properties of null',
            handler: 'doPost', received_method: 'POST' }) });
        return c.DB.setMarketplaceAllocationPriority(GOOD).then(function (r) {
            eq(r.outcome, 'OUTCOME_UNKNOWN',
                'G7 a generic router exception WITHOUT zero-write proof is UNKNOWN, never a refusal');
            ok(/did not prove/i.test(r.message), 'G7a and says why it cannot be called a refusal');
            eq(c.cache.invalidated.length, 0, 'G7b nothing invalidated');
        });
    });
    step('G-unknown-action', function () {
        var c = makeClient({ responseBody: JSON.stringify({ success: false, zero_write: true,
            error: 'Invalid POST action. Supported: updateSkuLifecycle, upsertSkuDetail' }) });
        return c.DB.setMarketplaceAllocationPriority(GOOD).then(function (r) {
            eq(r.outcome, 'CONFIRMED_NOT_STARTED',
                'G8 a router unknown-action answer is a DEPLOYMENT fact, not a business rejection');
            eq(r.code, 'DEPLOYMENT_CONTRACT_MISMATCH', 'G8a named as such');
        });
    });
    step('G-timeout', function () {
        var c = makeClient({ netThrows: true, timeout: true });
        return c.DB.setMarketplaceAllocationPriority(GOOD).then(function (r) {
            eq(r.outcome, 'OUTCOME_UNKNOWN', 'G9 a lost answer is UNKNOWN — the server may have committed');
            eq(c.log.fetches.length, 1, 'G9a exactly one request was sent');
            eq(c.cache.invalidated.length, 0, 'G9b and nothing is invalidated on an unknown outcome');
        });
    });
    step('G-nonjson', function () {
        var c = makeClient({ responseBody: '<html>404</html>', contentType: 'text/html' });
        return c.DB.setMarketplaceAllocationPriority(GOOD).then(function (r) {
            eq(r.outcome, 'OUTCOME_UNKNOWN', 'G10 an HTML answer proves nothing about the spreadsheet');
        });
    });

    module.exports = Promise.all(done);
})();

// =============================================================================================================
section('H. Wiring and source contracts — the registry, the versions and the absent fallback');
// =============================================================================================================
(function () {
    // T14 — all five places the action has to appear.
    ok(/if \(action === 'marketplace\.allocationPriority\.set'\)/.test(GS_01), 'H1 the router dispatches the action');
    ok(/handleSetMarketplaceAllocationPriority_\(body\)/.test(GS_01), 'H1a to the named handler');
    var supported = /Invalid POST action\. Supported: ([^']+)'/.exec(GS_01);
    ok(!!supported, 'H2 the router has its terminal Supported string');
    ok(supported && supported[1].indexOf('marketplace.allocationPriority.set') !== -1,
        'H2a and that string actually lists the new action');
    ok(/\{ action: 'marketplace\.allocationPriority\.set', handler: 'handleSetMarketplaceAllocationPriority_'/.test(GS_63),
        'H3 the required-actions registry names it');
    ok(/\{ action: 'upsertMarketplace', handler: 'handleUpsertMarketplace_'/.test(GS_63),
        'H3a and upsertMarketplace, whose omission was itself the F1-7N-FB-4E-R2 defect');
    ok(/function handleSetMarketplaceAllocationPriority_/.test(GS_03),
        'H4 and the handler symbol the probe resolves actually exists');

    var contract = Number(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/.exec(GS_63)[1]);
    var listv = Number(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/.exec(GS_63)[1]);
    var pin = Number(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/.exec(DBAPI)[1]);
    eq(contract, 20, 'H5 the action contract moved to 20 — one new route, one bump');
    // SIXTEEN, BY TWO. The release-stamp gate asserts this number moves EXACTLY as far as the registry
    // grows, so two new rows move it twice. Nothing pins its absolute value; it exists to distinguish an
    // answer computed from an OLD list from one computed from the current list, which a step of two does
    // exactly as well as a step of one.
    eq(listv, 16, 'H5a and the required-action list to 16 — two new entries, two increments');
    eq(pin, contract, 'H5b the client pin is EQUAL to the deployment contract, derived not restated');

    // The module build stamp and its manifest row.
    var stamp = /var MD_BUILD_VERSION_ = '([^']+)';/.exec(GS_03);
    ok(!!stamp, 'H6 03_ now carries a module build stamp');
    ok(new RegExp("\\{ file: '03_master_data_handlers\\.gs', symbol: 'MD_BUILD_VERSION_', expected: '"
        + stamp[1] + "'").test(GS_63), 'H6a and the manifest expects exactly what the file declares');
    var rtr = /var RTR_BUILD_VERSION_ = '([^']+)';/.exec(GS_01)[1];
    ok(new RegExp("\\{ file: '01_router\\.gs', symbol: 'RTR_BUILD_VERSION_', expected: '" + rtr + "'").test(GS_63),
        'H6b and the router manifest row agrees with the router');
    eq(stamp[1], rtr, 'H6c both files changed this round, so both declare the same round');

    // NO FALLBACK. This is a behavioural contract expressed in source, because the whole point of the
    // dedicated action is defeated by one `catch` that reaches for the old writer.
    ok(/setMarketplaceAllocationPriority/.test(PAGE), 'H7 the page calls the bounded writer');
    eq((PAGE.match(/db\.upsertMarketplace|KM\.DB\.upsertMarketplace/g) || []).length, 0,
        'H7a and NEVER calls upsertMarketplace — not as a fallback, not anywhere');
    ok(/will not fall back/i.test(PAGE), 'H7b and says so where an operator meets it');
    ok(/expected_allocation_priority_state/.test(PAGE), 'H8 the page sends the compare-and-set state');
    ok(/expected_marketplace_id/.test(PAGE), 'H8a and the target identity');

    // The legacy refusal, in the shipped source.
    ok(/Object\.prototype\.hasOwnProperty\.call\(body, 'allocation_priority'\)/.test(GS_03),
        'H9 the legacy writer tests for the KEY, not for a truthy value');
    ok(/PRIORITY_WRITE_NOT_SUPPORTED_HERE/.test(GS_03), 'H9a and refuses with a named code');
    // The column write really is gone from the legacy paths.
    var legacyBody = GS_03.slice(GS_03.indexOf('function upsertMarketplaceLocked_'),
        GS_03.indexOf('function handleReplenishmentDemandAllocationSave_'));
    eq(/setValue\(allocationPriority\)/.test(legacyBody), false,
        'H10 the legacy update path no longer writes the priority column');
    eq(/newRow\[col\('allocation_priority'\)\]/.test(legacyBody), false,
        'H10a and neither does the legacy create path');

    // Both writers share the lock.
    eq((GS_03.match(/LockService\.getScriptLock\(\)/g) || []).length >= 3, true,
        'H11 both marketplace writers take a script lock (alongside the pre-existing allocation saver)');
    ok(/tryLock\(MARKETPLACE_WRITE_LOCK_MS_\)/.test(GS_03), 'H11a on the shared named budget');
    eq((GS_03.match(/tryLock\(MARKETPLACE_WRITE_LOCK_MS_\)/g) || []).length, 2,
        'H11b exactly twice — one per marketplace writer');

    // CP2E protections must survive this round.
    ok(/_readGen/.test(PAGE) && /_saveGen/.test(PAGE) && /_mountGen/.test(PAGE),
        'H12 the CP2D/CP2E generation guards are still present');
    ok(/_mounted = false/.test(PAGE), 'H12a and the unmount retirement');
    ok(/liveSave\(\)/.test(PAGE), 'H12b and a superseded save still cannot write the banner');

    // The token rotation stays in its own family.
    var RO = read('assets/tests/_release-order.js');
    var tok = /var ROUND_TOKENS = \[([\s\S]*?)\];/.exec(RO)[1];
    var last = (tok.match(/'([^']+)'/g) || []).pop().replace(/'/g, '');
    var idx = read('index.html');
    ok(idx.indexOf('operation-system-db-api.js?v=' + last) !== -1,
        'H13 the changed API file is served under the CURRENT application token');
    ok(read('assets/js/app.js').indexOf('site-priority.js?v=' + last) !== -1,
        'H13a and so is the changed page file');
    ok(idx.indexOf('site-priority.css?v=' + last) !== -1, 'H13b and the changed stylesheet');
    var irSeries = /var IR_CSS_TOKEN_SERIES = \[([\s\S]*?)\];/.exec(RO)[1];
    eq(irSeries.indexOf(last), -1, 'H14 the new application token did NOT leak into the IR CSS family');
    var mapSeries = /var MAP_TOKEN_SERIES = \[([\s\S]*?)\];/.exec(RO)[1];
    eq(mapSeries.indexOf(last), -1, 'H14a nor into the map family');
})();


// =============================================================================================================
section('I. Two stale clients, and an old frontend meeting a new backend');
// =============================================================================================================
(function () {
    // THE RACE THE COMPARE-AND-SET EXISTS FOR, PLAYED OUT IN FULL.
    // Two operators open Site Priority. Both read 50. Operator A saves 90 and succeeds. Operator B, still
    // holding the page that said 50, saves 20. Before R52 B's save would have succeeded and A's decision would
    // have vanished with no trace anywhere. Now B is refused and told to Refresh.
    var a = makeAppsScript(baseRows());
    var clientA = { expected: 50 }, clientB = { expected: 50 };   // both read the same row

    var rA = a.setPriority(okPayload({ allocation_priority: 90, expected_allocation_priority: clientA.expected }));
    eq(rA.success, true, 'I1 the first operator\u2019s save commits');
    eq(a.cell(0, 'allocation_priority'), 90, 'I1a and lands');

    var rB = a.setPriority(okPayload({ allocation_priority: 20, expected_allocation_priority: clientB.expected }));
    eq(rB.success, false, 'I2 the second operator, still holding the pre-save page, is REFUSED');
    eq(rB.code, 'PRIORITY_CHANGED', 'I2a as PRIORITY_CHANGED');
    eq(rB.stored_value, 90, 'I2b and is told what the value actually is now');
    eq(a.cell(0, 'allocation_priority'), 90, 'I3 the first operator\u2019s decision SURVIVES');
    eq(rB.zero_write, true, 'I3a and the refusal proves it wrote nothing');

    // After a Refresh, B\u2019s save goes through \u2014 the gate is staleness, not a lock-out.
    var rB2 = a.setPriority(okPayload({ allocation_priority: 20, expected_allocation_priority: 90 }));
    eq(rB2.success, true, 'I4 and once B refreshes, the same save succeeds');
    eq(a.cell(0, 'allocation_priority'), 20, 'I4a landing normally');

    // The same race where the stale client believed the cell was EMPTY.
    var b = makeAppsScript(baseRows());
    eq(b.setPriority({ company: 'KM', country: 'DE', marketplace: 'Amazon',
        expected_marketplace_id: 'MKT-KM-DE-AMAZON', allocation_priority: 5,
        expected_allocation_priority_state: 'MISSING' }).success, true, 'I5 a MISSING-expectation save commits once');
    eq(b.setPriority({ company: 'KM', country: 'DE', marketplace: 'Amazon',
        expected_marketplace_id: 'MKT-KM-DE-AMAZON', allocation_priority: 7,
        expected_allocation_priority_state: 'MISSING' }).code, 'PRIORITY_CHANGED',
        'I5a and the SECOND client still expecting MISSING is refused');
    eq(b.cell(2, 'allocation_priority'), 5, 'I5b leaving the first value intact');

    // AN OLD FRONTEND MEETING AN R52 BACKEND. An R51 browser saves a priority the only way it knows: through
    // upsertMarketplace, with the echo payload. The backend must refuse it rather than take the unguarded path.
    var c = makeAppsScript(baseRows());
    var before = c.snapshot();
    var r51Payload = { company: 'KM', country: 'US', marketplace: 'Amazon', currency: 'USD',
        status: 'active', marketplace_display_name: 'Amazon', allocation_priority: 99,
        fulfillment_model: 'platform_fulfilled', updated_by: 'site-priority-page' };
    var rc = c.upsert(r51Payload);
    eq(rc.success, false, 'I6 an R51 frontend\u2019s priority save is REFUSED by an R52 backend');
    eq(rc.code, 'PRIORITY_WRITE_NOT_SUPPORTED_HERE', 'I6a with a code that names what to use instead');
    eq(rc.required_action, 'marketplace.allocationPriority.set', 'I6b and names it explicitly');
    eq(c.snapshot(), before, 'I7 and NOTHING in the sheet moved \u2014 not the priority, not the echoed fields');
    eq(c.cell(0, 'allocation_priority'), 50, 'I7a the stored priority is untouched');

    // The old frontend\u2019s NON-priority saves keep working, which is what makes this a refusal and not a break.
    var d = makeAppsScript(baseRows());
    var rd = d.upsert({ company: 'KM', country: 'US', marketplace: 'Amazon', currency: 'USD',
        status: 'disabled', updated_by: 'add-marketplace' });
    eq(rd.success, true, 'I8 the same old frontend can still disable a marketplace');
    eq(d.cell(0, 'status'), 'disabled', 'I8a which still writes');
    eq(d.cell(0, 'allocation_priority'), 50, 'I8b without disturbing the priority');
})();

// =============================================================================================================
Promise.resolve(module.exports).then(function () {
    console.log('\n----------------------------------------');
    console.log('MARKETPLACE PRIORITY WRITE CONTRACT (S8-B3-R3-CP2I): ' + pass + ' passed, ' + fail + ' failed');
    if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
    if (fail > 0) process.exit(1);
});
