// F1-7N-FB-4F-B2 — APPEND-ONLY SCHEMA DRY-RUN TOOLING.
//
// THE ROUND'S FINDING, AND IT INVERTS B1'S STATED ORDERING.
//
// B1's completion report said B2 would go: schema append -> Apps Script sync -> frontend. That is backwards, and
// the repository can prove it without touching the live sheet. 16_shipping_allocation_handlers.gs gates every
// allocation read and write on sadExactSchemaReason_, which is POSITIONAL and EXACT: the header table validates
// against the 34-column canonical order with the 4-column lifecycle tail optional (so a live count of 30..34 is
// accepted), and the LINE table validates against 30 columns with NO optional tail at all.
//
// So for every reachable live state, appending either proposed column while the owner file is unchanged makes
// every allocation read and write fail closed:
//
//     header live 30 -> COL30_IS_destination_marketplace_EXPECTED_generation_run_id
//     header live 34 -> COL_COUNT_35_EXPECTED_30_TO_34
//     line   live 30 -> COL_COUNT_31_EXPECTED_30
//
// A blank column is not inert against a positional gate. The Execution Plan would stop saving entirely. This
// suite proves the refusal for EVERY live header length in 30..34 by asking the shipped gate itself, so the
// conclusion does not depend on running anything against production.
//
// AND THE TWO QUEUED MIGRATIONS ARE NOT INDEPENDENT. TEMP_migrate_shipping_allocation_ai_lifecycle.gs appends
// the lifecycle tail at FROZEN indexes 30..33 and requires the live header to be an exact prefix of its own
// canonical order with no unknown extra column. destination_marketplace can therefore only ever occupy index 34,
// which means the lifecycle tail must be physically present FIRST — appending at index 30 instead would refuse
// that migration permanently. The ordering is a constraint, not a preference.
//
// ZERO WRITE IS PROVEN BY EXECUTION, NOT ONLY BY GREP. The dry run is executed against a spreadsheet stub whose
// every method other than getSheetByName / getDataRange / getValues THROWS. A source scan can only prove a name
// is absent; the stub proves nothing was attempted.
//
// Run: node assets/tests/allocation-schema-b2-dry-run-f1-7n-fb-4f-b2.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var GS = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
var TOOLS_DIAG = path.join(ROOT, 'assets', 'tools', 'apps-script-diagnostics');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
// EVERY SOURCE IS NORMALIZED TO LF ON THE WAY IN, and that is a guard rather than a tidy-up. This repository
// mixes line endings (16_ is CRLF, 69_ is LF) and core.autocrlf rewrites the working copy on checkout, so an
// anchor written with a bare \n silently matches NOTHING on a machine that checked the file out the other way.
// B1 lost six mutation tests to exactly that: they matched nothing, the "mutant" WAS the original, and every one
// reported as NOT CAUGHT. Normalizing at the load point retires the whole class instead of one instance.
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }
function read(rel) { return lf(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function readGs(f) { return lf(fs.readFileSync(path.join(GS, f), 'utf8')); }
function readDiag(f) { return lf(fs.readFileSync(path.join(TOOLS_DIAG, f), 'utf8')); }

// Comments are prose and strings are messages. A name that appears in either has not been CALLED.
function stripComments(src) {
    return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}
function code(src) {
    return stripComments(src)
        .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

var B2_FILE = 'TEMP_shipping_allocation_schema_b2_dry_run.gs';
var B2 = readDiag(B2_FILE);
var B2_C = code(B2);
var SAD = readGs('16_shipping_allocation_handlers.gs');
var RIC = readGs('69_api_v1_route_identity_contract.gs');
var EPC = readGs('68_api_v1_execution_plan_conflict_diagnostic.gs');
var IR = read('assets/js/pages/inventory-replenishment.js');
var PLAN_DOC = read('docs/planning/LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md');

// ---- lifting the shipped authorities out and RUNNING them ---------------------------------------------------
function extractFn(name, src) {
    var i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('not found: function ' + name);
    var d = 0, st = false;
    for (var j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; st = true; }
        else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
    throw new Error('unbalanced: ' + name);
}
function decl(re, src, label) {
    var m = re.exec(src);
    if (!m) throw new Error('declaration not found: ' + label);
    return m[0];
}

// A MUTATION THAT CHANGED NOTHING IS NOT A PASSING TEST, IT IS AN ABSENT ONE. B1 learned this the expensive way:
// six mutations were regexes written against the wrong line endings, matched nothing, and every one reported as
// NOT CAUGHT while the "mutant" was byte-identical to the original. swap() asserts the anchor exists AND that the
// result differs, so a silent no-op throws instead of masquerading as a missed guard.
function swap(src, from, to) {
    if (src.indexOf(from) === -1) throw new Error('mutation anchor absent: ' + from.slice(0, 70));
    var out = src.split(from).join(to);
    if (out === src) throw new Error('mutation changed nothing: ' + from.slice(0, 70));
    return out;
}

// ==============================================================================================================
// THE SPREADSHEET STUB. Read-only BY CONSTRUCTION: anything but the three read methods throws, so "no write" is
// proven by what the code DID, not by what its source spells.
// ==============================================================================================================
var READ_ONLY_SHEET_API = { getDataRange: 1, getName: 1 };
var READ_ONLY_SS_API = { getSheetByName: 1, getName: 1, getId: 1 };

function guard(target, allow, label, touched) {
    return new Proxy(target, {
        get: function (t, prop) {
            if (typeof prop === 'symbol') return t[prop];
            if (allow[prop]) { touched.push(label + '.' + prop); return t[prop]; }
            throw new Error('MUTATION_OR_UNEXPECTED_ACCESS: ' + label + '.' + String(prop));
        },
        set: function () { throw new Error('MUTATION_ATTEMPT: assignment on ' + label); }
    });
}

function gridFrom(cols, objs) {
    var g = [cols.slice()];
    (objs || []).forEach(function (o) {
        g.push(cols.map(function (c) { return o.hasOwnProperty(c) ? o[c] : ''; }));
    });
    return g;
}

// tables: { sheetName: grid } — a grid is [[headerRow], [row], ...]. A name absent from the map is a MISSING
// sheet, which is exactly the state the fail-closed rules must stop on.
function fakeSpreadsheet(tables, touched) {
    var raw = {
        getName: function () { return 'stub'; },
        getId: function () { return 'stub-id'; },
        getSheetByName: function (n) {
            if (!tables.hasOwnProperty(n)) return null;
            var grid = tables[n];
            var sheetRaw = {
                getName: function () { return n; },
                getDataRange: function () {
                    return guard({
                        getValues: function () { return grid.map(function (r) { return r.slice(); }); }
                    }, { getValues: 1 }, n + '.range', touched);
                }
            };
            return guard(sheetRaw, READ_ONLY_SHEET_API, 'sheet:' + n, touched);
        }
    };
    return guard(raw, READ_ONLY_SS_API, 'ss', touched);
}

// ==============================================================================================================
// THE CONTEXT. The B2 diagnostic verbatim, composed with the real authorities exactly as Apps Script composes
// them: one global scope. Nothing is reimplemented — the write gate, the hash, the masking and the whole B1
// contract are the shipped code.
// ==============================================================================================================
function b2Context(opts) {
    opts = opts || {};
    var sadSrc = opts.sad || SAD, ricSrc = opts.ric || RIC, b2Src = opts.b2 || B2, epcSrc = opts.epc || EPC;
    var touched = [];
    var logLines = [];
    var sb = {
        String: String, Object: Object, Math: Math, Number: Number, JSON: JSON,
        isNaN: isNaN, isFinite: isFinite, Array: Array, console: console, Error: Error,
        RegExp: RegExp, Boolean: Boolean, parseInt: parseInt, parseFloat: parseFloat
    };
    // A FIXED clock. A dry run must be comparable to the previous dry run, and a timestamp is the one field
    // guaranteed to differ for reasons that are not findings.
    sb.Date = function () { return { toISOString: function () { return '2026-08-31T00:00:00.000Z'; } }; };
    sb.Logger = { log: function (s) { logLines.push(String(s)); } };
    sb.globalThis = sb;

    var ctx = vm.createContext(sb);
    vm.runInContext([
        // --- 16_ : the schema authority and the POSITIONAL write gate -------------------------------------
        decl(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = \[[\s\S]*?\n\];/, sadSrc, 'drafts headers'),
        decl(/var SAD_LIFECYCLE_TAIL_COLUMNS_ = \[[^\]]*\];/, sadSrc, 'lifecycle tail'),
        decl(/var SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_ =[\s\S]*?;/, sadSrc, 'canonical'),
        decl(/var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ = \[[\s\S]*?\n\];/, sadSrc, 'line headers'),
        decl(/var SAD_K2_GROUP_DIMENSIONS_ = \[[\s\S]*?\];/, sadSrc, 'K2 dims'),
        extractFn('sadFnv1a_', sadSrc),
        extractFn('sadExactSchemaReason_', sadSrc),
        extractFn('sadLifecycleTailState_', sadSrc),
        extractFn('sadK2GroupKey_', sadSrc),
        extractFn('sadK2DeterministicHeaderId_', sadSrc),
        extractFn('sadHeaderRouteIsComplete_', sadSrc),
        // --- 68_ : the hash and the masking ---------------------------------------------------------------
        extractFn('epcStr_', epcSrc),
        extractFn('epcFnv1a_', epcSrc),
        extractFn('epcMaskId_', epcSrc),
        extractFn('epcIdRef_', epcSrc),
        extractFn('epcIdentityFamily_', epcSrc),
        // --- 69_ : the frozen B1 contract, whole ----------------------------------------------------------
        ricSrc,
        // --- the B2 diagnostic, whole --------------------------------------------------------------------
        b2Src
    ].join('\n'), ctx);

    var api = {
        touched: touched, logLines: logLines, ctx: ctx, sb: sb,
        call: function (expr, a, b, c) { sb.__a = a; sb.__b = b; sb.__c = c; return vm.runInContext(expr, ctx); },
        get: function (name) { return vm.runInContext(name, ctx); },
        // Point the diagnostic at a stub database.
        mount: function (tables) {
            sb.SpreadsheetApp = { openById: function () { return fakeSpreadsheet(tables, touched); } };
            sb.prodExpectedDbId_ = function () { return 'stub-id'; };
        },
        unmountDb: function () {
            sb.SpreadsheetApp = { openById: function () { throw new Error('unreachable'); } };
            sb.prodExpectedDbId_ = function () { return 'stub-id'; };
        },
        run: function () { return vm.runInContext('TEMP_shippingAllocationSchemaB2DryRun_()', ctx); },
        runPublic: function () { return vm.runInContext('TEMP_SHIPPING_ALLOCATION_SCHEMA_B2_DRY_RUN()', ctx); }
    };
    return api;
}

var T = b2Context();
var HDR = T.get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_');
var TAIL = T.get('SAD_LIFECYCLE_TAIL_COLUMNS_');
var CANON = T.get('SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_');
var LHDR = T.get('SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_');
var DRAFTS = 'shipping_allocation_drafts';
var LINES = 'shipping_allocation_draft_lines';

// A realistic legacy header: the FB-4F row — blank destination warehouse, marketplace scope Amazon, service sea.
var LEGACY_HEADER = {
    allocation_draft_id: 'SAD-US-AMAZON-0001', planning_cycle: '2026-10', source_page: 'inventory_replenishment',
    company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
    recommended_source_warehouse_id: 'WH-CN-YX', recommended_destination_warehouse_id: '',
    recommended_source_warehouse_code_snapshot: 'CNYX', recommended_destination_warehouse_code_snapshot: '',
    recommendation_group_no: '1', recommended_shipping_method: 'sea', recommended_last_mile_delivery: '',
    draft_version: '1', note: ''
};
var LEGACY_LINE = {
    allocation_draft_line_id: 'SADL-0001', allocation_draft_id: 'SAD-US-AMAZON-0001', sku: 'CO1100-R',
    window_code: '2026-W42', planned_qty: 800, recommended_qty: 800, line_status: 'active', route_no: '1'
};

// THE POST-B3 OWNER FILE, SIMULATED. Today every append is refused by the positional write gate, so every
// non-schema STOP is masked by STOP_SCHEMA_COLLISION - correctly, because an unsound schema makes every later
// claim unsound. To test the rules that live BEHIND that gate, the owner file must first learn the two columns,
// which is exactly what B3 will do: destination_marketplace joins the optional header tail, and expected_arrival
// joins the line contract. Nothing here is written to the repository; it is a hypothesis under test.
function futureSad(opt) {
    opt = opt || {};
    var m = SAD, before;
    if (opt.header !== false) {
        before = m;
        m = m.replace(/(var SAD_LIFECYCLE_TAIL_COLUMNS_ = \[[^\]]*)\]/,
            "$1, 'destination_marketplace']");
        if (m === before) throw new Error('futureSad: lifecycle tail anchor absent');
    }
    if (opt.line !== false) {
        before = m;
        m = m.replace(/('updated_at')(\r?\n\];\r?\n\r?\nfunction sadExactSchemaReason_)/, "$1, 'expected_arrival'$2");
        if (m === before) {
            // Fall back to the line-headers array by name, whichever way its tail is spelled.
            var i = m.indexOf('var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ = [');
            if (i < 0) throw new Error('futureSad: line header array absent');
            var j = m.indexOf('];', i);
            if (j < 0) throw new Error('futureSad: line header array unterminated');
            m = m.slice(0, j) + ", 'expected_arrival'\n" + m.slice(j);
        }
    }
    return m;
}
// The live sheets that MATCH that future authority: header 35, line 31, both exact.
function futureTables(opt) {
    opt = opt || {};
    var t = {};
    t[DRAFTS] = gridFrom(HDR.concat(TAIL).concat(['destination_marketplace']), opt.headerRows || [LEGACY_HEADER]);
    t[LINES] = gridFrom(LHDR.concat(['expected_arrival']), opt.lineRows || [LEGACY_LINE]);
    return t;
}

function tables(opt) {
    opt = opt || {};
    var hCols = opt.headerCols || HDR.slice();
    var lCols = opt.lineCols || LHDR.slice();
    var t = {};
    if (!opt.omitDrafts) t[DRAFTS] = gridFrom(hCols, opt.headerRows || [LEGACY_HEADER]);
    if (!opt.omitLines) t[LINES] = gridFrom(lCols, opt.lineRows || [LEGACY_LINE]);
    return t;
}

// ==============================================================================================================
section('A — the file, its placement, and the absence of an execute path');
// ==============================================================================================================
ok(fs.existsSync(path.join(TOOLS_DIAG, B2_FILE)), 'A1 the diagnostic lives under assets/tools/apps-script-diagnostics/');
ok(!fs.existsSync(path.join(GS, B2_FILE)),
    'A2 and NOT in the active Apps Script deployment owner directory — a read-only tool in the deploy directory is, to any mechanical check, an active runtime file');

// The task suggested TEMP_shippingAllocationSchemaB2DryRun_(). A trailing underscore is Apps Script's PRIVATE
// convention and such functions are not offered in the editor's Run selector, so the suggested name is the core
// and a runnable public wrapper exists beside it — the shape FB-4F-A already proved in this project.
ok(/function TEMP_shippingAllocationSchemaB2DryRun_\(\)/.test(B2), 'A3 the core carries the exact name the task specified');
ok(/function TEMP_SHIPPING_ALLOCATION_SCHEMA_B2_DRY_RUN\(\)/.test(B2),
    'A4 and a PUBLIC runnable wrapper exists, because a trailing underscore cannot be selected in the Run menu');
var publicFns = (B2.match(/^function\s+([A-Za-z0-9_]+)/gm) || [])
    .map(function (x) { return x.replace(/^function\s+/, ''); })
    .filter(function (f) { return !/_$/.test(f); });
eq(publicFns, ['TEMP_SHIPPING_ALLOCATION_SCHEMA_B2_DRY_RUN'], 'A5 exactly ONE public entry point, so nothing else is reachable from the editor');

// Test 21 — no sheet mutation call, asserted against comment- AND string-stripped source.
var MUTATORS = ['setValue', 'setValues', 'appendRow', 'insertColumn', 'insertColumnsAfter', 'insertRows',
    'deleteRow', 'deleteColumn', 'insertSheet', 'createSheet', 'LockService', 'getLock', 'PropertiesService',
    'DriveApp', 'MailApp', 'GmailApp', 'procurementEnsureSheet_', 'prodRequireSheet_', 'ensureSchema',
    'ensureColumns', 'clearContent', 'setNumberFormat', 'setFormula', 'removeSheet', 'copyTo'];
MUTATORS.forEach(function (m) {
    ok(B2_C.indexOf(m) === -1, 'A6 [test 21] no mutation call in code: ' + m);
});
ok(B2_C.indexOf('COMMIT') === -1, 'A7 no COMMIT token in code — there is no commit mode, not even a disabled one');
ok(!/function\s+TEMP_[A-Za-z0-9_]*COMMIT/i.test(B2), 'A8 and no commit function of any spelling');
ok(!/\beval\s*\(/.test(B2_C), 'A9 no eval — the dependency list is written out one typeof at a time');
// getRange is a READ, but a whole-tab read is the only access this tool needs; forbidding it keeps the surface
// minimal and lets the stub prove the point by throwing.
ok(B2_C.indexOf('getRange') === -1, 'A10 reads whole tabs only — no getRange, so no cell surface is opened at all');

// ==============================================================================================================
section('B — the schema authority, measured (not restated)');
// ==============================================================================================================
eq(HDR.length, 30, 'B1 the header REQUIRED contract is 30 columns');
eq(TAIL.length, 4, 'B2 the lifecycle tail is 4 columns');
eq(CANON.length, 34, 'B3 so the header CANONICAL order is 34');
eq(CANON.slice(30), TAIL, 'B4 and the tail occupies indexes 30..33, frozen');
eq(LHDR.length, 30, 'B5 the line contract is 30 columns');
ok(HDR.indexOf('destination_marketplace') === -1, 'B6 destination_marketplace is absent from the live header contract — the FB-4F-A refusal');
ok(CANON.indexOf('destination_marketplace') === -1, 'B7 and absent from the canonical order the write gate validates against');
ok(LHDR.indexOf('expected_arrival') === -1, 'B8 expected_arrival is absent from the line contract');

// The proposed columns must come from the B1 contract, not from a second opinion in this file.
var RICCOLS = T.get('RIC_B2_REQUIRED_COLUMNS_');
eq(Object.keys(RICCOLS).sort(), ['destination_marketplace', 'expected_arrival'], 'B9 the B1 contract names exactly these two columns');
eq(RICCOLS.destination_marketplace.table, DRAFTS, 'B10 destination_marketplace belongs to the HEADER table');
eq(RICCOLS.expected_arrival.table, LINES, 'B11 expected_arrival belongs to the LINE table — not the header, and not spelled expected_arrival_date');
var proposed = T.get('TEMP_FB4FB2_PROPOSED_');
eq(proposed.map(function (p) { return p.key + '@' + p.table; }),
    ['destination_marketplace@' + DRAFTS, 'expected_arrival@' + LINES],
    'B12 and the dry run proposes exactly the contract\'s two columns, on the contract\'s two tables');
eq(proposed[1].identity_dimension, false, 'B13 expected_arrival is NOT an identity dimension');
eq(proposed[0].identity_dimension, true, 'B14 destination_marketplace IS');

// ==============================================================================================================
section('C — THE FINDING: the positional write gate refuses the append for EVERY reachable live state');
// ==============================================================================================================
// Asked of the PRODUCTION gate through a read-only header stub, not answered by a local copy of the rule.
function gate(headerRow, authority, tail) {
    T.sb.__h = headerRow; T.sb.__a2 = authority; T.sb.__t = tail || [];
    return vm.runInContext('sadExactSchemaReason_(tb2HeaderProbe_(__h), __a2, __t)', T.ctx);
}
// Every live header length the gate accepts today: 30 (no tail) .. 34 (full tail).
for (var n = 30; n <= 34; n++) {
    var live = CANON.slice(0, n);
    eq(gate(live, CANON, TAIL), '', 'C1 live header of ' + n + ' columns is accepted today');
    var after = live.concat(['destination_marketplace']);
    var verdict = gate(after, CANON, TAIL);
    ok(verdict !== '', 'C2 appending destination_marketplace to a ' + n + '-column live header is REFUSED by the gate -> ' + verdict);
}
// The two named refusals, spelled out, because a reader should see the actual failure text.
eq(gate(CANON.slice(0, 30).concat(['destination_marketplace']), CANON, TAIL),
    'COL30_IS_destination_marketplace_EXPECTED_generation_run_id',
    'C3 at live 30 the column lands where the FROZEN lifecycle order says generation_run_id belongs');
eq(gate(CANON.concat(['destination_marketplace']), CANON, TAIL),
    'COL_COUNT_35_EXPECTED_30_TO_34',
    'C4 at live 34 the column simply exceeds the authority');
// The LINE table is stricter still: its gate is called with NO optional tail, so the count must be exactly 30.
eq(gate(LHDR, LHDR, []), '', 'C5 the line table is exact at 30 today');
eq(gate(LHDR.concat(['expected_arrival']), LHDR, []),
    'COL_COUNT_31_EXPECTED_30',
    'C6 and appending expected_arrival is refused outright — the line gate has no optional-tail mechanism at all');
// The consequence, stated as the assertion it is: a blank column is NOT inert here.
ok(true, 'C7 so a blank append with the owner file unchanged stops EVERY allocation read and write — code first, then schema');

// The plan document must carry the correction rather than leaving B1's ordering standing.
ok(/code first, then schema|CODE FIRST/i.test(PLAN_DOC), 'C8 the planning document records the corrected ordering');
ok(PLAN_DOC.indexOf('COL_COUNT_31_EXPECTED_30') !== -1, 'C9 and quotes the measured line-table refusal');

// ==============================================================================================================
section('D — the ordering constraint between two queued migrations');
// ==============================================================================================================
ok(fs.existsSync(path.join(GS, 'TEMP_migrate_shipping_allocation_ai_lifecycle.gs')),
    'D1 a second append-only migration against the same table exists and is queued');
// Its own safety rule: the live header must be an exact prefix of ITS canonical order with no unknown extra.
var AIMIG = readGs('TEMP_migrate_shipping_allocation_ai_lifecycle.gs');
ok(/append_only_safe|appendOnly/.test(AIMIG), 'D2 and it gates on an exact-prefix append-only check');
ok(/!extra\.length/.test(AIMIG), 'D3 which refuses ANY unknown extra column');
// So appending destination_marketplace at index 30 would permanently block it.
ok(true, 'D4 therefore destination_marketplace can only occupy index 34, and the lifecycle tail must land FIRST');
var mounted = b2Context();
mounted.mount(tables({ headerCols: HDR.slice() }));      // live 30 => lifecycle tail OUTSTANDING
var r30 = mounted.run();
eq(r30.sections['1b_ordering_precondition'].lifecycle_tail_complete, false,
    'D5 the dry run reports the lifecycle tail as outstanding on a 30-column sheet');
ok(r30.blocking.join(' ').indexOf('LIFECYCLE_TAIL_OUTSTANDING') !== -1, 'D6 and names it as a blocking precondition');
eq(r30.sections['1b_ordering_precondition'].b1_report_ordering_was_wrong, true,
    'D7 and states plainly that B1\'s reported ordering was wrong');

// ==============================================================================================================
section('E — [tests 1-6] the six schema states, each answered');
// ==============================================================================================================
// Test 1 — both columns absent: an exact append proposal at the CANONICAL index, and zero writes.
var c1 = b2Context(); c1.mount(tables()); var R1 = c1.run();
var h1 = R1.sections['1_schema'].tables[0], l1 = R1.sections['1_schema'].tables[1];
eq(h1.target_present, false, 'E1 [test 1] destination_marketplace absent from the live header');
eq(l1.target_present, false, 'E2 [test 1] expected_arrival absent from the live line table');
eq(h1.proposed_append_index, 34, 'E3 [test 1] the header proposal is index 34 — the canonical position AFTER the frozen lifecycle tail, not one past the live end');
eq(l1.proposed_append_index, 30, 'E4 [test 1] the line proposal is index 30');
eq(h1.proposed_append_column_1based, 35, 'E5 [test 1] reported as a 1-based column for the operator');
eq(R1.COLUMNS_APPENDED, 0, 'E6 [test 1] COLUMNS_APPENDED = 0');
eq(R1.ROWS_CHANGED, 0, 'E7 [test 1] ROWS_CHANGED = 0');
eq(R1.DB_WRITES, 0, 'E8 [test 1] DB_WRITES = 0');
eq(R1.readOnly, true, 'E9 [test 1] readOnly = true');
eq(h1.append_only_mechanically_safe, false, 'E10 [test 1] and the append is NOT declared mechanically safe, because the gate refuses it');

// Test 2 — the header column already present: no duplicate proposal, no mutation.
var hWith = HDR.concat(TAIL).concat(['destination_marketplace']);
var c2 = b2Context(); c2.mount(tables({ headerCols: hWith })); var R2 = c2.run();
var h2 = R2.sections['1_schema'].tables[0];
eq(h2.target_present, true, 'E11 [test 2] the existing header column is detected');
eq(h2.target_index, 34, 'E12 [test 2] with its exact position reported');
eq(h2.target_exact_spelling, 'destination_marketplace', 'E13 [test 2] and its exact spelling');
eq(h2.proposed_append_index, -1, 'E14 [test 2] no duplicate is proposed');
ok(/already exists/.test(h2.note || ''), 'E15 [test 2] and it is not mutated');
eq(h2.fingerprint_after.digest, h2.fingerprint_before.digest, 'E16 [test 2] before/after fingerprints are identical, because nothing is proposed');

// Test 3 — the line column already present.
var lWith = LHDR.concat(['expected_arrival']);
var c3 = b2Context(); c3.mount(tables({ lineCols: lWith })); var R3 = c3.run();
var l3 = R3.sections['1_schema'].tables[1];
eq(l3.target_present, true, 'E17 [test 3] the existing line column is detected');
eq(l3.target_index, 30, 'E18 [test 3] at its exact position');
eq(l3.proposed_append_index, -1, 'E19 [test 3] and no duplicate is proposed');

// Test 4 — a case-insensitive collision must STOP.
var hCi = HDR.concat(TAIL).concat(['Destination_Marketplace']);
var c4 = b2Context(); c4.mount(tables({ headerCols: hCi })); var R4 = c4.run();
var h4 = R4.sections['1_schema'].tables[0];
eq(h4.target_present, false, 'E20 [test 4] a differently-cased twin is NOT treated as the target');
eq(h4.target_ci_variant_present, true, 'E21 [test 4] it is reported as a collision');
eq(h4.target_ci_variant, 'Destination_Marketplace', 'E22 [test 4] naming the exact spelling found');
eq(R4.decision, 'STOP_SCHEMA_COLLISION', 'E23 [test 4] and the decision is STOP_SCHEMA_COLLISION');
eq(R4.schemaAppendSafe, false, 'E24 [test 4] schemaAppendSafe = false');

// Test 5 — a duplicate header must STOP. The shared name-keyed reader would silently lose the earlier column.
var hDup = HDR.slice(); hDup.push('country');
var c5 = b2Context(); c5.mount(tables({ headerCols: hDup })); var R5 = c5.run();
var h5 = R5.sections['1_schema'].tables[0];
eq(h5.duplicate_headers.length, 1, 'E25 [test 5] the duplicate is detected on the RAW header row');
eq(h5.duplicate_headers[0].column, 'country', 'E26 [test 5] and named');
eq(R5.decision, 'STOP_SCHEMA_COLLISION', 'E27 [test 5] decision STOP_SCHEMA_COLLISION');

// Test 6 — a missing sheet must STOP.
var c6 = b2Context(); c6.mount(tables({ omitLines: true })); var R6 = c6.run();
var l6 = R6.sections['1_schema'].tables[1];
eq(l6.sheet_present, false, 'E28 [test 6] the missing sheet is reported as absent');
ok(l6.blocking.join(' ').indexOf('SHEET_MISSING') !== -1, 'E29 [test 6] with a named blocking reason');
eq(R6.decision, 'STOP_SCHEMA_COLLISION', 'E30 [test 6] decision STOP_SCHEMA_COLLISION');

// ==============================================================================================================
section('F — [tests 7-11] sea is not sea_express, and identity holds the line');
// ==============================================================================================================
function svc(v) { T.sb.__v = v; return vm.runInContext('ricCanonicalService_(__v)', T.ctx); }
function k4id(h) { T.sb.__h2 = h; return vm.runInContext('ricK4DeterministicHeaderId_(__h2)', T.ctx); }
function withPatch(base, patch) {
    var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; });
    Object.keys(patch).forEach(function (k) { o[k] = patch[k]; });
    return o;
}
eq(svc('sea'), 'sea', 'F1 [test 7] an existing sea value remains sea');
eq(svc('sea_express'), 'sea_express', 'F2 [test 8] an existing sea_express value remains sea_express');
ok(svc('sea') !== svc('sea_express'), 'F3 [test 9] sea !== sea_express');
var SEA = withPatch(LEGACY_HEADER, { recommended_shipping_method: 'sea', destination_marketplace: 'Amazon' });
var SEAX = withPatch(SEA, { recommended_shipping_method: 'sea_express' });
ok(k4id(SEA) !== k4id(SEAX), 'F4 [test 9] and they generate DISTINCT K4 identities');
// Neither ever falls back to the other, in either direction, and no family match exists.
eq(svc('seafood'), '', 'F5 no prefix family fallback: seafood is refused, not read as sea');
eq(svc('sea-express'), '', 'F6 sea-express (a hyphen) is refused rather than mapped');
eq(svc('ocean'), '', 'F7 and a transport MODE is not a service');
eq(svc('美森海卡'), 'sea_express', 'F8 an exact display label resolves — the same route, not a second one');
eq(svc('普船'), 'sea', 'F9 and the regular-ocean label resolves to sea');
// Test 10 — an ETA change must not move the identity. It is structurally impossible: expected_arrival is a LINE
// field and K4 is a HEADER key, so this asserts the guarantee rather than a remembered policy.
eq(k4id(withPatch(SEA, { expected_arrival: '2026-10-16' })), k4id(SEA), 'F10 [test 10] changing the ETA does not change the K4 identity');
eq(k4id(withPatch(SEA, { expected_arrival: '2027-01-01' })), k4id(SEA), 'F11 [test 10] nor does a different ETA');
// Test 11 — quantity is not identity.
eq(k4id(withPatch(SEA, { planned_qty: 400 })), k4id(withPatch(SEA, { planned_qty: 800 })), 'F12 [test 11] 400 and 800 on the same route are ONE identity');
var K4DIMS = T.get('RIC_K4_GROUP_DIMENSIONS_');
ok(K4DIMS.indexOf('expected_arrival') === -1, 'F13 expected_arrival is not a K4 dimension');
ok(K4DIMS.indexOf('planned_qty') === -1, 'F14 nor is planned_qty');
ok(K4DIMS.indexOf('note') === -1 && K4DIMS.indexOf('draft_version') === -1, 'F15 nor notes or the draft version');

// The census reports the two services as two populations and rewrites neither.
var cS = b2Context();
cS.mount(tables({ headerRows: [
    withPatch(LEGACY_HEADER, { allocation_draft_id: 'SAD-1', recommended_shipping_method: 'sea' }),
    withPatch(LEGACY_HEADER, { allocation_draft_id: 'SAD-2', recommended_shipping_method: 'sea_express' }),
    withPatch(LEGACY_HEADER, { allocation_draft_id: 'SAD-3', recommended_shipping_method: 'lorry' }),
    withPatch(LEGACY_HEADER, { allocation_draft_id: 'SAD-4', recommended_shipping_method: '' })
] }));
var RS = cS.run();
var sc = RS.sections['4_service'];
eq(sc.persisted_by_canonical_service.sea, 1, 'F16 the sea population is reported on its own');
eq(sc.persisted_by_canonical_service.sea_express, 1, 'F17 and the sea_express population separately');
eq(sc.persisted_by_canonical_service['(noncanonical)'], 1, 'F18 a noncanonical value is classified as such, never mapped to a neighbour');
eq(sc.blank_service_rows, 1, 'F19 and blanks are counted rather than guessed');
eq(sc.values_rewritten, 0, 'F20 no service value is rewritten');
eq(sc.distinctness_proof.distinct, true, 'F21 the distinctness proof is computed live from the contract');
eq(sc.distinctness_proof.no_family_fallback, true, 'F22 and confirms no family fallback exists');

// ==============================================================================================================
section('G — [tests 12-14, 18] destination: exactly one owner, and never a fake warehouse');
// ==============================================================================================================
function dest(h) { T.sb.__h3 = h; return vm.runInContext('ricDestinationIdentity_(__h3)', T.ctx); }
eq(dest({ recommended_destination_warehouse_id: 'WH-1' }).type, 'WAREHOUSE', 'G1 [test 12] a warehouse destination is a WAREHOUSE');
eq(dest({ destination_marketplace: 'Amazon' }).type, 'MARKETPLACE', 'G2 [test 12] a marketplace destination is a MARKETPLACE');
ok(dest({ recommended_destination_warehouse_id: 'WH-1' }).id !== dest({ destination_marketplace: 'WH-1' }).id ||
    dest({ recommended_destination_warehouse_id: 'WH-1' }).type !== dest({ destination_marketplace: 'WH-1' }).type,
    'G3 [test 12] the two destination kinds are distinct identities even for the same token');
var both = dest({ recommended_destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' });
eq(both.ok, false, 'G4 [test 13] both populated is refused');
eq(both.code, 'ROUTE_DESTINATION_AMBIGUOUS', 'G5 [test 13] with the typed code ROUTE_DESTINATION_AMBIGUOUS');
var neither = dest({});
eq(neither.ok, false, 'G6 [test 14] neither populated is refused');
eq(neither.code, 'ROUTE_DESTINATION_MISSING', 'G7 [test 14] with the typed code ROUTE_DESTINATION_MISSING');
// Test 18 — no fake warehouse id is manufactured anywhere.
eq(dest({ destination_marketplace: 'Amazon' }).type, 'MARKETPLACE', 'G8 [test 18] Amazon resolves as a marketplace, never as a warehouse');
ok(B2_C.indexOf('FBA') === -1, 'G9 [test 18] and the diagnostic mints no warehouse-shaped token of its own');
// A both-populated legacy row drives the typed STOP end to end.
var cA = b2Context();
cA.mount(tables({
    headerCols: HDR.concat(TAIL).concat(['destination_marketplace']),
    headerRows: [withPatch(LEGACY_HEADER, { recommended_destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' })]
}));
var RA = cA.run();
eq(RA.sections['2_destination'].counts.both, 1, 'G10 [test 13] the both-populated row is counted');
eq(RA.sections['2_destination'].ambiguous_legacy_rows.length, 1, 'G11 [test 13] and listed as ambiguous');
// AND THE SCHEMA COLLISION DOMINATES, which is correct rather than a shortcoming: on today's owner file a
// 35-column header already fails the positional gate, and an unsound schema makes every claim about the rows
// inside it unsound. The ambiguity STOP is therefore reachable only once the schema is sound.
eq(RA.decision, 'STOP_SCHEMA_COLLISION',
    'G12 [test 13] today the schema collision dominates - an unsound schema is answered before its contents are');
var cA2 = b2Context({ sad: futureSad() });
cA2.mount(futureTables({ headerRows: [withPatch(LEGACY_HEADER,
    { recommended_destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' })] }));
var RA2 = cA2.run();
eq(RA2.sections['1_schema'].tables[0].gate_verdict_current, '(exact)', 'G13 with the post-B3 owner file the live header is exact');
eq(RA2.sections['1_schema'].tables[1].gate_verdict_current, '(exact)', 'G14 and so is the line table');
eq(RA2.decision, 'STOP_AMBIGUOUS_DESTINATION', 'G15 [test 13] and THEN the typed STOP_AMBIGUOUS_DESTINATION is reached');

// ==============================================================================================================
section('H — [test 17] the header marketplace scope does not authorize a destination backfill');
// ==============================================================================================================
var cH = b2Context(); cH.mount(tables()); var RH = cH.run();
var dc = RH.sections['2_destination'];
eq(dc.counts.neither, 1, 'H1 the FB-4F legacy row has NEITHER destination populated');
eq(dc.backfill_candidate_count, 0, 'H2 [test 17] and it produces NO backfill candidate, though its scope marketplace is Amazon');
eq(dc.must_remain_blocked_count, 1, 'H3 [test 17] it is reported as must-remain-blocked instead');
eq(dc.must_remain_blocked[0].evidence.scope_marketplace, 'Amazon', 'H4 the scope marketplace is shown as evidence EXAMINED');
eq(dc.must_remain_blocked[0].evidence.persisted_destination_field, '(none)', 'H5 alongside the fact that no persisted destination field exists');
ok(/unfinished route/.test(dc.must_remain_blocked[0].reason),
    'H6 [test 17] with the reason stated: a blank destination is equally consistent with a route the user never finished');
eq(RH.destinationBackfillSafe, false, 'H7 [test 17] destinationBackfillSafe = false');
eq(dc.backfill_performed, false, 'H8 and no backfill was performed');
eq(dc.rows_changed, 0, 'H9 with zero rows changed');
['UI labels', 'display text', 'warehouse code snapshots', 'page filters'].forEach(function (x) {
    ok(dc.excluded_evidence_sources.indexOf(x) !== -1, 'H10 excluded evidence source recorded: ' + x);
});
ok(dc.excluded_evidence_sources.join('|').indexOf('scope marketplace on its own') !== -1,
    'H11 and the header scope marketplace is itself on the excluded list');

// ==============================================================================================================
section('I — [tests 15, 16] the ETA that must stay blank, and why the client value is not evidence');
// ==============================================================================================================
var ec = RH.sections['3_expected_arrival'];
eq(ec.exact_persisted_source_exists, false, 'I1 [test 15] no persisted expected_arrival column exists');
eq(ec.rows_with_persisted_eta, 0, 'I2 [test 15] so no row has a persisted ETA');
eq(ec.must_remain_blank_count, 1, 'I3 [test 15] and the line is reported as must-remain-blank');
eq(RH.expectedArrivalBackfillSafe, false, 'I4 [test 15] expectedArrivalBackfillSafe = false');
eq(ec.backfill_performed, false, 'I5 no ETA backfill was performed');
// Test 16 — the client's value is DOM text derived from a carrier lead time. Measured in the frontend, not assumed.
ok(/querySelector\(\s*'\[data-field="expected_arrival"\]'\s*\)/.test(IR),
    'I6 [test 16] the client reads expected_arrival out of the rendered DOM cell');
ok(/var expectedArrival = etaEl \? String\(etaEl\.textContent/.test(IR),
    'I7 [test 16] as textContent — so the payload is UI-CALCULATED text, not a persisted fact');
var joined = ec.excluded_derivations.join(' | ');
['carrier lead time', 'shipping method', 'the current date', 'creation timestamp'].forEach(function (x) {
    ok(joined.indexOf(x) !== -1, 'I8 [test 16] excluded ETA derivation recorded: ' + x);
});
ok(joined.indexOf('UI-calculated') !== -1, 'I9 [test 16] including the UI-calculated Expected Arrival');
ok(joined.indexOf('2026-10-16') !== -1, 'I10 [test 16] and the attempted 2026-10-16 payload by name');
ok(joined.indexOf('WRONG service') !== -1,
    'I11 [test 16] noting it was computed from the WRONG service lead time until B1 fixed the mapper — backfilling it would persist a wrong date as authoritative');
// A nearby planning date is the most tempting wrong answer, so it is enumerated and excluded rather than ignored.
var cN = b2Context();
cN.mount(tables({ lineRows: [withPatch(LEGACY_LINE, { required_by_date: '2026-10-20', window_end_date: '2026-10-25' })] }));
var RN = cN.run();
eq(RN.sections['3_expected_arrival'].ambiguous_candidates.length, 1, 'I12 a line with nearby planning dates is flagged AMBIGUOUS');
ok(/NOT_AN_ARRIVAL_FACT/.test(RN.sections['3_expected_arrival'].ambiguous_candidates[0].reason),
    'I13 with the reason that a planning window bound is not a carrier arrival');
eq(RN.expectedArrivalBackfillSafe, false, 'I14 and it still does not authorize a backfill');

// ==============================================================================================================
section('J — [tests 19, 20] quantity conservation and the foreign keys');
// ==============================================================================================================
var fq = RH.sections['6_fk_and_quantity'];
eq(fq.planned_qty_total_before, 800, 'J1 [test 19] the current planned_qty total is read: 800');
eq(fq.planned_qty_total_proposed_after, 800, 'J2 [test 19] and the proposed total is IDENTICAL');
eq(fq.conserved, true, 'J3 [test 19] conservation holds, because this round transforms nothing');
eq(fq.rows_written, 0, 'J4 [test 20] rows_written = 0');
eq(fq.fks_changed, 0, 'J5 [test 20] fks_changed = 0');
eq(fq.matched_lines, 1, 'J6 the line matches its parent header');
eq(fq.orphan_line_count, 0, 'J7 with no orphans');
// An unknown quantity is NOT zero — conservation must fail closed rather than sum a hole.
var cU = b2Context();
cU.mount(tables({ lineRows: [withPatch(LEGACY_LINE, { planned_qty: '' })] }));
var RU = cU.run();
eq(RU.sections['6_fk_and_quantity'].quantity_unknown_lines, 1, 'J8 a blank planned_qty is counted as UNKNOWN');
eq(RU.sections['6_fk_and_quantity'].conserved, false, 'J9 and conservation fails closed — unknown is not zero');
ok(/CANNOT_CONSERVE/.test(RU.sections['6_fk_and_quantity'].conservation_verdict), 'J10 with a named verdict');
// The 400 must never be manufactured, and the 800 must never move.
var tgt = RH.sections['4_service'].live_target.rows[0];
eq(tgt.current_quantity_total, 800, 'J11 the live target reports the persisted 800');
eq(tgt.attempted_quantity, 400, 'J12 and the attempted 400 as EVIDENCE only');
// TWO FACTS THAT MUST NOT BE CONFLATED. The persisted row is a `sea` route with no destination; the attempted
// request was a `sea_express` route to Amazon. Service and destination are BOTH K4 dimensions, so those are two
// DIFFERENT routes - and a reconciliation must not rewrite the sea row into a sea_express one, because the
// express route has never existed. Quantity is the separate matter: it is not a dimension at all, so a quantity
// difference ALONE would be one identity calling for an update.
eq(tgt.same_identity, false,
    'J13 the attempted route is NOT the persisted route - a differing service and destination make a different identity');
ok(/DIFFERENT ROUTE/.test(tgt.identity_statement),
    'J13b and the output says so, so no migration can read it as "the same route with new values"');
eq(k4id(withPatch(SEA, { planned_qty: 400 })), k4id(withPatch(SEA, { planned_qty: 800 })),
    'J13c while a quantity difference alone leaves the identity untouched');
ok(/NEITHER QUANTITY WAS CHANGED AND NEITHER WAS CREATED/.test(tgt.quantity_statement), 'J14 stated explicitly in the output');
eq(tgt.persisted_service_canonical, 'sea', 'J15 the persisted service is genuinely sea');
eq(tgt.attempted_service_canonical, 'sea_express', 'J16 the attempted service was sea_express');
eq(tgt.same_service, false, 'J17 they are NOT the same service, and neither is normalized into the other');

// ==============================================================================================================
section('K — [tests 22, 23, 24] the checksum, and repeatability');
// ==============================================================================================================
// Test 22 — stable input, stable checksum.
var k1 = b2Context(); k1.mount(tables()); var KA = k1.run();
var k2 = b2Context(); k2.mount(tables()); var KB = k2.run();
ok(!!KA.live_schema_checksum, 'K1 a checksum is produced');
eq(KA.live_schema_checksum, KB.live_schema_checksum, 'K2 [test 22] stable input produces a stable checksum');
ok(/^fb4fb2-1:/.test(KA.live_schema_checksum), 'K3 with a versioned prefix, so a later format change cannot be mistaken for the same value');
// Test 23 — header-order drift changes the checksum.
var drift = HDR.slice(); var t0 = drift[3]; drift[3] = drift[4]; drift[4] = t0;
var k3 = b2Context(); k3.mount(tables({ headerCols: drift })); var KC = k3.run();
ok(KC.live_schema_checksum !== KA.live_schema_checksum,
    'K4 [test 23] reordering two columns changes the checksum — order matters because every positional reader depends on it');
// And the fingerprint itself is order-sensitive, tested directly.
function fp(cols) { T.sb.__c2 = cols; return vm.runInContext('tb2SchemaFingerprint_(__c2)', T.ctx).digest; }
ok(fp(['a', 'b']) !== fp(['b', 'a']), 'K5 [test 23] the schema fingerprint is order-sensitive by construction');
eq(fp(['a', 'b']), fp(['a', 'b']), 'K6 and deterministic');
// Test 24 — repeated dry runs are identical and write nothing.
function withoutTimestamp(o) { var c = JSON.parse(JSON.stringify(o)); delete c.timestamp; return c; }
eq(withoutTimestamp(KA), withoutTimestamp(KB), 'K7 [test 24] two dry runs over the same data produce identical results');
var k4c = b2Context(); k4c.mount(tables());
var X1 = k4c.run(), X2 = k4c.run(), X3 = k4c.run();
eq(withoutTimestamp(X2), withoutTimestamp(X1), 'K8 [test 24] and repeating within one context is idempotent');
eq(withoutTimestamp(X3), withoutTimestamp(X1), 'K9 [test 24] three times over');
eq([X1.DB_WRITES, X2.DB_WRITES, X3.DB_WRITES], [0, 0, 0], 'K10 [test 24] with zero writes each time');
eq(KA.checksum_scope.indexOf('NOT authorization') !== -1, true,
    'K11 the checksum states its own limit: blank columns only, never a backfill, a K4 id or a reconciliation');
// Determinism refusal path exists.
ok(B2.indexOf('CHECKSUM_NOT_DETERMINISTIC') !== -1, 'K12 and a non-deterministic checksum is a named refusal');
ok(B2.indexOf('LIVE_SCHEMA_CHANGED_DURING_DIAGNOSTIC') !== -1, 'K13 as is a schema that moves mid-run');

// ==============================================================================================================
section('L — [test 20] zero write, proven by EXECUTION');
// ==============================================================================================================
// The stub throws on any access outside getSheetByName / getDataRange / getValues. If the dry run had attempted
// a single write, an insert, a lock or even a getRange, these runs would have thrown instead of returning.
var zc = b2Context(); zc.mount(tables());
var threw = null;
try { zc.run(); } catch (e) { threw = e; }
eq(threw, null, 'L1 [test 20] the dry run completes against a stub that throws on ANY non-read access');
var kinds = {};
zc.touched.forEach(function (t) { kinds[t.split('.').pop()] = 1; });
eq(Object.keys(kinds).sort(), ['getDataRange', 'getSheetByName', 'getValues'],
    'L2 [test 20] and the ONLY methods it touched were the three read methods');
// The public wrapper too — the path the operator actually runs.
var zp = b2Context(); zp.mount(tables());
var threwPub = null;
try { zp.runPublic(); } catch (e) { threwPub = e; }
eq(threwPub, null, 'L3 [test 20] the public entry point is equally read-only');
ok(zp.logLines.length > 0, 'L4 and it emits a bounded log rather than one oversized blob');
ok(zp.logLines.join('\n').indexOf('NO COLUMN WAS APPENDED') !== -1, 'L5 ending with the explicit zero-write statement');
ok(zp.logLines.join('\n').indexOf('B1_ORDERING_CORRECTION') !== -1, 'L6 and surfacing the ordering correction where the operator will see it');

// The authority gate: with the B1 contract absent the honest answer is a refusal, not a verdict.
var na = b2Context();
na.sb.ricK4GroupKey_ = undefined;
vm.runInContext('ricK4GroupKey_ = undefined;', na.ctx);
na.mount(tables());
var RNA = na.run();
ok(RNA.refused && RNA.refused.code === 'AUTHORITY_NOT_LOADED', 'L7 an absent authority produces a named refusal');
ok(RNA.refused.missing.indexOf('ricK4GroupKey_') !== -1, 'L8 naming exactly what is missing');
eq(RNA.schemaAppendSafe, false, 'L9 and no readiness is declared');
// An unreachable database likewise.
var nd = b2Context(); nd.unmountDb();
var RND = nd.run();
ok(RND.refused && RND.refused.code === 'DB_NOT_REACHABLE', 'L10 an unreachable database is a named refusal too');

// ==============================================================================================================
section('M — the five decisions are separate, and all five are false today');
// ==============================================================================================================
eq(RH.schemaAppendSafe, false, 'M1 schemaAppendSafe = false');
eq(RH.destinationBackfillSafe, false, 'M2 destinationBackfillSafe = false');
eq(RH.expectedArrivalBackfillSafe, false, 'M3 expectedArrivalBackfillSafe = false');
eq(RH.k4MigrationSafe, false, 'M4 k4MigrationSafe = false');
eq(RH.runtimeWiringReady, false, 'M5 runtimeWiringReady = false');
ok(/never means a backfill is safe/.test(RH.decision_scope),
    'M6 and READY_FOR_REVIEWED_SCHEMA_APPEND is explicitly scoped to blank columns only');
// Every typed verdict the task allows must exist in the source.
['READY_FOR_REVIEWED_SCHEMA_APPEND', 'SCHEMA_ALREADY_PRESENT_AND_VALID', 'STOP_SCHEMA_COLLISION',
    'STOP_AMBIGUOUS_DESTINATION', 'STOP_UNPERSISTED_EXPECTED_ARRIVAL', 'STOP_IDENTITY_COLLISION',
    'STOP_UNSAFE_LEGACY_STATE'].forEach(function (v) {
    ok(B2.indexOf(v) !== -1, 'M7 typed verdict present: ' + v);
});
// AND IT IS REACHED, not merely present. The state that reaches it is the one a migration would be tempted by:
// the schema is sound, the column exists, every row is BLANK, and a date was asked for. There is nothing to
// carry forward, so the only way to fill it would be to invent it.
var cE = b2Context({ sad: futureSad() });
cE.mount(futureTables());                       // the line column exists and is blank
var RE = cE.run();
eq(RE.sections['1_schema'].tables[0].gate_verdict_current, '(exact)', 'M7b the header schema is sound in this state');
eq(RE.sections['1_schema'].tables[1].gate_verdict_current, '(exact)', 'M7c and so is the line schema');
eq(RE.sections['3_expected_arrival'].attempted_expected_arrival_present, true, 'M7d an arrival date was asked for');
eq(RE.sections['3_expected_arrival'].rows_with_persisted_eta, 0, 'M7e and no row holds one to justify it');
eq(RE.decision, 'STOP_UNPERSISTED_EXPECTED_ARRIVAL', 'M7f so the typed STOP_UNPERSISTED_EXPECTED_ARRIVAL is reached');
eq(RE.expectedArrivalBackfillSafe, false, 'M7g with expectedArrivalBackfillSafe false');

// SCHEMA_ALREADY_PRESENT_AND_VALID is reachable too - the state B3 is trying to arrive at.
var cV = b2Context({ sad: futureSad() });
cV.mount(futureTables({ lineRows: [withPatch(LEGACY_LINE, { expected_arrival: '2026-10-16' })] }));
var RV = cV.run();
eq(RV.sections['1_schema'].tables[0].target_present, true, 'M7h both columns present in the post-B3 state');
eq(RV.sections['1_schema'].tables[1].target_present, true, 'M7i including the line column');
eq(RV.sections['3_expected_arrival'].rows_with_persisted_eta, 1, 'M7j and a row that actually holds an arrival date');
eq(RV.decision, 'SCHEMA_ALREADY_PRESENT_AND_VALID', 'M7k so the verdict is SCHEMA_ALREADY_PRESENT_AND_VALID');
eq(RV.schemaAppendSafe, true, 'M7l with schemaAppendSafe true, because there is nothing left to append');
eq(RV.k4MigrationSafe, false, 'M7m while k4MigrationSafe stays FALSE - a sound schema is not an authorized migration');
eq(RV.runtimeWiringReady, false, 'M7n and runtimeWiringReady stays false');

// The K4 preview is a preview and says so.
var kp = RH.sections['5_k4_preview'];
eq(kp.preview_only, true, 'M8 the K4 section is a preview');
eq([kp.rows_written, kp.ids_rewritten, kp.headers_created, kp.lines_moved, kp.quantities_changed, kp.fks_changed],
    [0, 0, 0, 0, 0, 0], 'M9 with nothing written, rewritten, created, moved or changed');
eq(kp.migration_journaled, false, 'M10 and no migration journaled as completed');
eq(kp.mechanically_safe_for_migration, false, 'M11 and it is not declared mechanically safe');
// A K4 collision is detected and typed.
var cC = b2Context();
cC.mount(tables({
    headerCols: HDR.concat(TAIL).concat(['destination_marketplace']),
    headerRows: [
        withPatch(LEGACY_HEADER, { allocation_draft_id: 'SAD-A', destination_marketplace: 'Amazon' }),
        withPatch(LEGACY_HEADER, { allocation_draft_id: 'SAD-B', destination_marketplace: 'amazon' })
    ]
}));
var RC = cC.run();
eq(RC.sections['5_k4_preview'].natural_key_collision_count, 1,
    'M12 two headers whose marketplace differs only by case collapse to ONE K4 identity, and that is reported');
ok(/must decide which\s*header survives|which header survives/.test(
    RC.sections['5_k4_preview'].natural_key_collisions[0].reason),
    'M13 with the consequence named: a later reconciliation must be told which record survives');

// ==============================================================================================================
section('N — negative tests: every fail-closed rule, and every mutation proves it mutated');
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
function runWith(b2src, tbl) {
    var c = b2Context({ b2: b2src });
    c.mount(tbl || tables());
    return c.run();
}

// THE FIRST THREE MUTATIONS WERE DEFEATED BY CODE LAYERING, and that is worth recording rather than quietly
// fixing. Each originally attacked the aggregated `decision`, where the answer is already STOP_SCHEMA_COLLISION
// for an unrelated and correct reason - the positional gate rejects those fabricated header rows anyway. So the
// guard under test could be deleted outright and the suite still went green. A mutation has to attack the point
// of DETECTION, where nothing else is standing in front of it.
//
// N1 — duplicate headers no longer detected. The consequence is concrete: the shared name-keyed reader would
// silently lose the earlier column, so a schema claim would be made about data that was never read.
mutate('N1 duplicate headers no longer detected',
    function () {
        var h = runWith(null, tables({ headerCols: hDup })).sections['1_schema'].tables[0];
        return h.duplicate_headers.length === 1 && h.duplicate_headers[0].column === 'country' &&
            h.blocking.join(' ').indexOf('DUPLICATE_HEADER') !== -1;
    },
    function () {
        var m = swap(B2, 'if (seen[h] !== undefined) dup.push({ column: h, first_index: seen[h], repeat_index: i });',
            'if (false) dup.push({ column: h, first_index: seen[h], repeat_index: i });');
        var h = runWith(m, tables({ headerCols: hDup })).sections['1_schema'].tables[0];
        return h.duplicate_headers.length === 1 && h.blocking.join(' ').indexOf('DUPLICATE_HEADER') !== -1;
    });
// N2 — a differently-cased twin accepted as the target, which would create two columns for one field.
mutate('N2 a differently-cased twin accepted as the target column',
    function () {
        var h = runWith(null, tables({ headerCols: hCi })).sections['1_schema'].tables[0];
        return h.target_ci_variant_present === true && h.target_present === false &&
            h.blocking.join(' ').indexOf('CI_TARGET_COLLISION') !== -1;
    },
    function () {
        var m = swap(B2, 'if (t.headers[i].toLowerCase() === lc) {', 'if (false) {');
        var h = runWith(m, tables({ headerCols: hCi })).sections['1_schema'].tables[0];
        return h.target_ci_variant_present === true && h.blocking.join(' ').indexOf('CI_TARGET_COLLISION') !== -1;
    });
// N3 — a missing sheet no longer named. Without this the run would report a zero-column schema as a finding
// about the schema rather than as an absent table.
mutate('N3 a missing sheet no longer named',
    function () {
        var l = runWith(null, tables({ omitLines: true })).sections['1_schema'].tables[1];
        return l.sheet_present === false && l.blocking.join(' ').indexOf('SHEET_MISSING') !== -1;
    },
    function () {
        var m = swap(B2, "  if (!t.present) { out.blocking.push('SHEET_MISSING: ' + t.name); return out; }",
            '  if (!t.present) { return out; }');
        var l = runWith(m, tables({ omitLines: true })).sections['1_schema'].tables[1];
        return l.sheet_present === false && l.blocking.join(' ').indexOf('SHEET_MISSING') !== -1;
    });
// N4 — THE ROUND'S CENTRAL GUARD: the write gate's refusal of the proposed header ignored.
mutate('N4 the write gate refusal of the proposed append ignored',
    function () { var r = runWith(null); return r.schemaAppendSafe === false && r.decision === 'STOP_SCHEMA_COLLISION'; },
    function () {
        var m = swap(B2,
            "function gateRejects(c) { return !!c.gate_verdict_after_append && c.gate_verdict_after_append !== '(exact)'; }",
            'function gateRejects(c) { return false; }');
        m = swap(m, "var gateOk = out.gate_verdict_after_append === '(exact)';", 'var gateOk = true;');
        m = swap(m, 'if (tail && !tail.complete) {', 'if (false) {');
        m = swap(m, '!!(tail && !tail.complete);', 'false;');
        m = swap(m, "out.blocking.push('AUTHORITY_DOES_NOT_KNOW_COLUMN", "0 && out.blocking.push('AUTHORITY_DOES_NOT_KNOW_COLUMN");
        var r = runWith(m);
        return r.schemaAppendSafe === false && r.decision === 'STOP_SCHEMA_COLLISION';
    });
// N5 — the ordering precondition between the two queued migrations dropped.
mutate('N5 the lifecycle-tail ordering precondition dropped',
    function () { return runWith(null).blocking.join(' ').indexOf('LIFECYCLE_TAIL_OUTSTANDING') !== -1; },
    function () {
        var m = swap(B2, 'if (tail && !tail.complete) {', 'if (false) {');
        return runWith(m).blocking.join(' ').indexOf('LIFECYCLE_TAIL_OUTSTANDING') !== -1;
    });
// N6 — a destination backfill authorized by the header scope marketplace alone.
mutate('N6 the header scope marketplace promoted into a destination backfill',
    function () { var r = runWith(null); return r.destinationBackfillSafe === false && r.sections['2_destination'].backfill_candidate_count === 0; },
    function () {
        var m = swap(B2,
            "      blocked.push({ id_ref: ref, status: tb2Str_(h.status), active: active, evidence: evidence,",
            "      if (evidence.scope_marketplace) { backfill_candidates.push({ id_ref: ref, from: 'scope' }); }\n" +
            "      blocked.push({ id_ref: ref, status: tb2Str_(h.status), active: active, evidence: evidence,");
        var r = runWith(m);
        return r.destinationBackfillSafe === false && r.sections['2_destination'].backfill_candidate_count === 0;
    });
// N7 — an ETA reconstructed from a nearby planning date.
mutate('N7 an ETA backfilled from a nearby planning date',
    function () {
        var r = runWith(null, tables({ lineRows: [withPatch(LEGACY_LINE, { required_by_date: '2026-10-20' })] }));
        return r.expectedArrivalBackfillSafe === false;
    },
    function () {
        var m = swap(B2,
            "  out.expectedArrivalBackfillSafe = d3.exact_persisted_source_exists && d3.ambiguous_candidates.length === 0 &&\n    d3.rows_with_persisted_eta > 0;",
            '  out.expectedArrivalBackfillSafe = d3.ambiguous_candidates.length > 0;');
        var r = runWith(m, tables({ lineRows: [withPatch(LEGACY_LINE, { required_by_date: '2026-10-20' })] }));
        return r.expectedArrivalBackfillSafe === false;
    });
// N8 — the checksum made order-insensitive, so a reordered schema would reuse an old authorization.
mutate('N8 the checksum made order-insensitive',
    function () {
        var a = runWith(null).live_schema_checksum;
        var b = runWith(null, tables({ headerCols: drift })).live_schema_checksum;
        return !!a && a !== b;
    },
    function () {
        var m = swap(B2,
            "  return { count: h.length, ordered: h.slice(), digest: 'sf:' + tb2Hash_(h.length + '' + h.join('')) };",
            "  return { count: h.length, ordered: h.slice(), digest: 'sf:' + tb2Hash_(h.slice().sort().join('')) };");
        var a = runWith(m).live_schema_checksum;
        var b = runWith(m, tables({ headerCols: drift })).live_schema_checksum;
        return !!a && a !== b;
    });
// N9 — the mid-run schema-stability re-read removed. The FIRST version of this test asserted a regex against
// string-stripped source, where the literal it searched for had already been replaced by '' - so the baseline
// could never hold. The rule is behavioural, so the test is too: a sheet whose header row MOVES between the
// first and second read must refuse, because every verdict above it describes a sheet that no longer exists.
function shiftingTables(touched) {
    var hCols = HDR.slice(), n = 0;
    var t = {};
    t[LINES] = gridFrom(LHDR, [LEGACY_LINE]);
    // The drafts grid answers differently on the LAST read, which is the stability re-read.
    Object.defineProperty(t, DRAFTS, {
        enumerable: true, configurable: true,
        get: function () {
            n++;
            // The drafts tab is fetched exactly twice: the first read, then the stability re-read.
            var cols = n >= 2 ? hCols.slice(0, 29) : hCols.slice();
            return gridFrom(cols, [LEGACY_HEADER]);
        }
    });
    return t;
}
mutate('N9 the mid-run schema-stability re-read removed',
    function () {
        var c = b2Context(); c.mount(shiftingTables());
        var r = c.run();
        return !!r.refused && r.refused.code === 'LIVE_SCHEMA_CHANGED_DURING_DIAGNOSTIC';
    },
    function () {
        var m = swap(B2, '  if (!stable) {', '  if (false) {');
        var c = b2Context({ b2: m }); c.mount(shiftingTables());
        var r = c.run();
        return !!r.refused && r.refused.code === 'LIVE_SCHEMA_CHANGED_DURING_DIAGNOSTIC';
    });
// N10 — an unknown quantity treated as zero, so conservation passes over a hole.
mutate('N10 an unknown quantity treated as zero',
    function () {
        return runWith(null, tables({ lineRows: [withPatch(LEGACY_LINE, { planned_qty: '' })] }))
            .sections['6_fk_and_quantity'].conserved === false;
    },
    function () {
        var m = swap(B2, "  if (s === '') return null;", "  if (s === '') return 0;");
        return runWith(m, tables({ lineRows: [withPatch(LEGACY_LINE, { planned_qty: '' })] }))
            .sections['6_fk_and_quantity'].conserved === false;
    });
// N11 — a contested identity ignored.
mutate('N11 a contested identity ignored',
    function () {
        var c = b2Context();
        c.mount(tables({
            headerCols: HDR.concat(TAIL).concat(['destination_marketplace']),
            headerRows: [
                withPatch(LEGACY_HEADER, { allocation_draft_id: 'SADH-K2-DEADBEEF', destination_marketplace: 'Amazon' }),
                withPatch(LEGACY_HEADER, { allocation_draft_id: 'SAD-LEGACY-1', destination_marketplace: 'Amazon' })
            ]
        }));
        return c.run().sections['5_k4_preview'].contested_identity_count > 0;
    },
    function () {
        var m = swap(B2, '    if (fams.length > 1) {', '    if (false) {');
        var c = b2Context({ b2: m });
        c.mount(tables({
            headerCols: HDR.concat(TAIL).concat(['destination_marketplace']),
            headerRows: [
                withPatch(LEGACY_HEADER, { allocation_draft_id: 'SADH-K2-DEADBEEF', destination_marketplace: 'Amazon' }),
                withPatch(LEGACY_HEADER, { allocation_draft_id: 'SAD-LEGACY-1', destination_marketplace: 'Amazon' })
            ]
        }));
        return c.run().sections['5_k4_preview'].contested_identity_count > 0;
    });
// N12 — a write introduced into the diagnostic at all.
mutate('N12 a sheet write introduced into the diagnostic',
    function () { return MUTATORS.every(function (x) { return code(B2).indexOf(x) === -1; }); },
    function () {
        var m = swap(B2, '  var H = tb2ReadTable_(ss, TEMP_FB4FB2_DRAFTS_);',
            '  ss.getSheetByName(TEMP_FB4FB2_DRAFTS_).appendRow([1]);\n  var H = tb2ReadTable_(ss, TEMP_FB4FB2_DRAFTS_);');
        return MUTATORS.every(function (x) { return code(m).indexOf(x) === -1; });
    });
// N13 — and the STUB would catch it even if the scan did not. This is the execution half of the same guard.
mutate('N13 a sheet write attempted at runtime',
    function () { var c = b2Context(); c.mount(tables()); var t = null; try { c.run(); } catch (e) { t = e; } return t === null; },
    function () {
        var m = swap(B2, '  var H = tb2ReadTable_(ss, TEMP_FB4FB2_DRAFTS_);',
            '  ss.getSheetByName(TEMP_FB4FB2_DRAFTS_).appendRow([1]);\n  var H = tb2ReadTable_(ss, TEMP_FB4FB2_DRAFTS_);');
        var c = b2Context({ b2: m }); c.mount(tables());
        var t = null; try { c.run(); } catch (e) { t = e; }
        return t === null;
    });
// N14 — sea_express collapsed into sea in the contract this round consumes.
mutate('N14 sea_express collapsed into sea',
    function () { return svc('sea') !== svc('sea_express'); },
    function () {
        var m = swap(RIC, "'air', 'sea', 'sea_express', 'rail', 'truck'", "'air', 'sea', 'rail', 'truck'");
        m = swap(m, "'sea express': 'sea_express', 'sea_express': 'sea_express'", "'sea express': 'sea', 'sea_express': 'sea'");
        m = swap(m, "'快船': 'sea_express', '美森海卡': 'sea_express'", "'快船': 'sea', '美森海卡': 'sea'");
        var c = b2Context({ ric: m });
        c.sb.__v = 'sea'; var a = vm.runInContext('ricCanonicalService_(__v)', c.ctx);
        c.sb.__v = 'sea_express'; var b = vm.runInContext('ricCanonicalService_(__v)', c.ctx);
        return a !== b;
    });
// N15 — the diagnostic moved into the active deployment owner directory.
mutate('N15 the diagnostic placed in the Apps Script deploy directory',
    function () { return !fs.existsSync(path.join(GS, B2_FILE)); },
    function () { return !fs.existsSync(path.join(TOOLS_DIAG, B2_FILE)); });

// ==============================================================================================================
section('O — the round changed nothing it was told not to change');
// ==============================================================================================================
// F1-7N-FB-4F-B3 - RESTATED. O1/O3/O4 asserted three literals about B2's own moment: the writer's stamp had
// not moved, 69_ carried the B1 stamp, and 69_ was unmanifested. All three were true OF B2, and all three are
// equalities with "now" - so B3, the round that acts on B2's own finding by teaching the runtime the columns
// and syncing the contract, made them fail while describing exactly the state B2 asked for.
//
// The durable statement is the contract they stood in for: every owner declares exactly what the deployment
// manifest expects of it. A stamp nobody expects and an expectation no file declares are the two halves of a
// partial sync, and this catches both, in either direction, for good.
(function () {
    var HEALTH = readGs('63_api_v1_system_health.gs');
    function manifestExpects(file) {
        return (HEALTH.match(new RegExp("\\{ file: '" + file.replace(/\./g, '\\.') + "',[^}]*expected: '([^']+)'")) || [])[1] || '';
    }
    function declares(src, sym) { return (src.match(new RegExp('var ' + sym + " = '([^']+)';")) || [])[1] || ''; }
    eq(declares(SAD, 'SAD_BUILD_VERSION_'), manifestExpects('16_shipping_allocation_handlers.gs'),
        'O1 the allocation writer declares exactly what the deployment manifest expects');
    eq(declares(RIC, 'RIC_BUILD_VERSION_'), manifestExpects('69_api_v1_route_identity_contract.gs'),
        'O3 and so does the route-identity contract, now a synchronized owner');
    ok(!!manifestExpects('69_api_v1_route_identity_contract.gs'),
        'O4 69_ IS manifested — B2 refused to do it before the runtime was compatible; B3 did both together');
})();

// O2 WAS VACUOUS, AND THAT IS WORTH RECORDING RATHER THAN QUIETLY DELETING. It read
//     SAD.indexOf('destination_marketplace') === -1 || code(SAD).indexOf("'destination_marketplace'") === -1
// and code() replaces every string literal with '' - so the right-hand side was TRUE no matter what the writer
// contained, and the whole assertion could never fail. It was green in B2 for the wrong reason.
//
// What it should have said is the property that still matters now that the writer HAS learned the column: the
// diagnostic is not a deployed owner, and it is not routed. Those are the facts that keep it a paste-run-remove
// tool rather than something the deployment depends on.
ok(readGs('63_api_v1_system_health.gs').indexOf(B2_FILE) === -1,
    'O2 the dry-run diagnostic has NO deployment-manifest entry — it is paste-run-remove, not an owner');
ok(SAD.indexOf('destination_marketplace') !== -1,
    'O2b while the WRITER has learned the column, which is exactly what B3 was for');
ok(readGs('63_api_v1_system_health.gs').indexOf(B2_FILE) === -1,
    'O5 and the new diagnostic has none either: it is a paste-run-remove tool, not a deployed owner');
var RTR = readGs('01_router.gs');
ok(RTR.indexOf('tb2') === -1 && RTR.indexOf('SCHEMA_B2_DRY_RUN') === -1, 'O6 nothing is routed');
ok(RTR.indexOf('ricK4') === -1, 'O7 and K4 is still not activated anywhere in the router');
// LEGACY_ROUTE_RECONCILIATION_REQUIRED must not be weakened.
ok((SAD.match(/LEGACY_ROUTE_RECONCILIATION_REQUIRED/g) || []).length >= 6,
    'O8 LEGACY_ROUTE_RECONCILIATION_REQUIRED is intact');
// The FB-4F-A diagnostic stays where B1 moved it.
ok(fs.existsSync(path.join(TOOLS_DIAG, 'TEMP_legacy_allocation_draft_reconcile_diagnose.gs')),
    'O9 the FB-4F-A diagnostic remains in the tooling directory');
// The runbook the operator needs must exist, including the two-file paste.
ok(/F1-7N-FB-4F-B2/.test(PLAN_DOC), 'O10 the planning document carries the B2 section');
ok(PLAN_DOC.indexOf('TEMP_SHIPPING_ALLOCATION_SCHEMA_B2_DRY_RUN') !== -1, 'O11 naming the exact function to run');
ok(PLAN_DOC.indexOf('69_api_v1_route_identity_contract.gs') !== -1,
    'O12 and the contract file that must be pasted alongside it, because 69_ is unsynced by design');
ok(/remove both|remove the two|delete both/i.test(PLAN_DOC), 'O13 with the removal step stated');

// ==============================================================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
console.log('negative tests: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
process.exit(fail === 0 ? 0 : 1);
