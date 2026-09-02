// F1-7N-FB-4F-B1 — ROUTE IDENTITY + APPEND-ONLY SCHEMA CONTRACT.
//
// FB-4F-A proved the live refusal is a SCHEMA fact and stopped. B1 closes the contract; B2 appends the columns; a
// later round reconciles the legacy row. Three operations, never one.
//
// THE ROUND FOUND A LIVE DEFECT ON THE WAY IN, and it was not in the schema. The Execution Plan's lead-time
// mapper was a prefix ladder testing 'sea express' (a SPACE) before 'sea', so the canonical enum 'sea_express'
// (an UNDERSCORE) missed the first and matched the second: measured, 'sea_express' -> 'Sea'. Every Expected
// Arrival shown for an express-ocean route was computed from the REGULAR ocean lead time. A silently wrong date
// on a planning screen is worse than a blank one, and it is exactly the startsWith('sea') family fallback the
// round was told to hunt.
//
// AND THE IDENTITY GAP CANNOT BE CLOSED IN PLACE. K2's ten dimensions carry no destination marketplace, so a
// marketplace route and a destination-less route key identically. Appending a dimension to sadK2GroupKey_ would
// change the joined string for EVERY row — including the ones whose new field is blank — so every SADH-K2-* id
// would regenerate and every existing header would be re-keyed. That is a silent bulk migration disguised as a
// refactor. K2 is left byte-identical and K4, in its own file, is the versioned successor.
//
// WHY ITS OWN FILE: written into 16_shipping_allocation_handlers.gs first, the repository refused twice, and both
// refusals were right. (1) action-registry-...-fb-4e-r2 asserts BY NAME that the ALLOCATION WRITER is UNCHANGED
// since R1. (2) Bumping SAD_BUILD_VERSION_ to declare the change put the project into DEPLOYMENT_PARTIAL_SYNC,
// because 63_api_v1_system_health.gs pins each owner's expected stamp against the DEPLOYED build — and B1 does
// not deploy. So the contract lives in 69_api_v1_route_identity_contract.gs: new, unrouted, unmanifested.
//
// Run: node assets/tests/route-identity-and-schema-contract-f1-7n-fb-4f-b1.test.js

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
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readGs(f) { return fs.readFileSync(path.join(GS, f), 'utf8'); }
// Comments are prose. A name mentioned in a comment must never satisfy a check about a name USED.
function code(src) {
    return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}

var SAD = readGs('16_shipping_allocation_handlers.gs');
var SAD_C = code(SAD);
var RIC = readGs('69_api_v1_route_identity_contract.gs');
var RIC_C = code(RIC);
var IR = read('assets/js/pages/inventory-replenishment.js');
var TEMP_FILE = 'TEMP_legacy_allocation_draft_reconcile_diagnose.gs';

// ---- lifting the shipped authorities out and RUNNING them --------------------------------------------------
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
// The K2 authority from 16_ and the B1 contract from 69_, composed exactly as Apps Script composes them: one
// global scope, so 69_ calls 16_'s sadFnv1a_ rather than carrying a second hash.
function sadContext(sadOverride, ricOverride) {
    var src = sadOverride || SAD, ric = ricOverride || RIC;
    var sb = { String: String, Object: Object, Math: Math, isNaN: isNaN, console: console };
    sb.globalThis = sb;
    var ctx = vm.createContext(sb);
    vm.runInContext([
        extractFn('sadFnv1a_', src),
        decl(/var SAD_K2_GROUP_DIMENSIONS_ = \[[\s\S]*?\];/, src, 'K2 dims'),
        extractFn('sadK2GroupKey_', src),
        extractFn('sadK2DeterministicHeaderId_', src),
        extractFn('sadDestinationIdentity_', src),
        extractFn('sadHeaderRouteIsComplete_', src),
        decl(/var RIC_CANONICAL_SERVICES_ = \[[^\]]*\];/, ric, 'services'),
        decl(/var RIC_SERVICE_LABELS_ = \{[\s\S]*?\n\};/, ric, 'labels'),
        extractFn('ricCanonicalService_', ric),
        decl(/var RIC_DESTINATION_TYPES_ = \[[^\]]*\];/, ric, 'dest types'),
        extractFn('ricDestinationIdentity_', ric),
        decl(/var RIC_K4_GROUP_DIMENSIONS_ = \[[\s\S]*?\];/, ric, 'K4 dims'),
        extractFn('ricK4GroupKey_', ric),
        extractFn('ricK4DeterministicHeaderId_', ric),
        decl(/var RIC_SCHEMA_REFUSALS_ = \{[\s\S]*?\n\};/, ric, 'refusals'),
        decl(/var RIC_B2_REQUIRED_COLUMNS_ = \{[\s\S]*?\n\};/, ric, 'b2 columns'),
        extractFn('ricRoutePersistability_', ric)
    ].join('\n'), ctx);
    function call(expr, a, b, c) { sb.__a = a; sb.__b = b; sb.__c = c; return vm.runInContext(expr, ctx); }
    return {
        k2: function (h) { return call('sadK2GroupKey_(__a)', h); },
        k2id: function (h) { return call('sadK2DeterministicHeaderId_(__a)', h); },
        k4: function (h) { return call('ricK4GroupKey_(__a)', h); },
        k4id: function (h) { return call('ricK4DeterministicHeaderId_(__a)', h); },
        svc: function (v) { return call('ricCanonicalService_(__a)', v); },
        dest: function (h) { return call('ricDestinationIdentity_(__a)', h); },
        complete: function (h) { return call('sadHeaderRouteIsComplete_(__a)', h); },
        persist: function (h, hn, ln) { return call('ricRoutePersistability_(__a, __b, __c)', h, hn, ln); },
        k2dims: function () { return vm.runInContext('SAD_K2_GROUP_DIMENSIONS_', ctx); },
        k4dims: function () { return vm.runInContext('RIC_K4_GROUP_DIMENSIONS_', ctx); }
    };
}
var S = sadContext();

// The frontend lead-time mapper, executed.
function leadKeyContext(srcOverride) {
    var src = srcOverride || IR;
    var sb = { String: String, Object: Object };
    sb.globalThis = sb;
    var ctx = vm.createContext(sb);
    vm.runInContext([
        decl(/var IR_SERVICE_TO_LEAD_KEY_ = \{[\s\S]*?\n\};/, src, 'service map'),
        decl(/var IR_LABEL_TO_LEAD_KEY_ = \{[\s\S]*?\n\};/, src, 'label map'),
        extractFn('_irMethodToLeadKey', src)
    ].join('\n'), ctx);
    return function (v) { sb.__v = v; return vm.runInContext('_irMethodToLeadKey(__v)', ctx); };
}
var leadKey = leadKeyContext();

// The live FB-4F-A target.
var TARGET = {
    planning_cycle: '2026-W36', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    source_page: 'inventory_replenishment', recommended_source_warehouse_id: 'WH-CN-YOUXIN',
    recommended_destination_warehouse_id: '', destination_marketplace: 'Amazon',
    recommended_shipping_method: 'sea_express', recommended_last_mile_delivery: 'truck',
    recommendation_group_no: ''
};
function withPatch(base, patch) {
    var o = {}, k;
    for (k in base) if (base.hasOwnProperty(k)) o[k] = base[k];
    for (k in patch) if (patch.hasOwnProperty(k)) o[k] = patch[k];
    return o;
}
var LIVE_30 = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
    'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
    'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
    'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery',
    'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version',
    'created_by', 'created_at', 'updated_by', 'updated_at',
    'submitted_by', 'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'];

// ================================================================================================================
section('§A/§F — sea is not sea_express, at every boundary that decides money or a date');
// ================================================================================================================
['air', 'sea', 'sea_express', 'rail', 'truck'].forEach(function (v) {
    eq(S.svc(v), v, 'A1 ' + v + ' is canonical and survives unchanged');
});
ok(S.svc('sea') !== S.svc('sea_express'), 'A2 sea and sea_express are never the same value');
eq(S.svc('美森海卡'), 'sea_express', 'A3 美森海卡 resolves to sea_express');
eq(S.svc('快船'), 'sea_express', 'A3b 快船 resolves to sea_express');
eq(S.svc('普船'), 'sea', 'A3c 普船 resolves to sea');
eq(S.svc('Sea Express'), 'sea_express', 'A3d the English display label resolves to sea_express');
ok(S.svc('美森海卡') !== 'sea', 'A3e and 美森海卡 is NEVER sea');
['seafood', 'sea-express', 'seaexpress', 'ocean', 'SEA_EXPRESS_PLUS', 'expresssea', 's', 'se', '', null]
    .forEach(function (v) {
        eq(S.svc(v), '', 'A4 ' + JSON.stringify(v) + ' is refused rather than approximated');
    });
(function () {
    // THE BAN IS ON THE PREFIX FORM, NOT ON indexOf ITSELF: `RIC_CANONICAL_SERVICES_.indexOf(t) !== -1` is ARRAY
    // MEMBERSHIP and exactly the right exact test. The dangerous shape is a STRING prefix, `indexOf(...) === 0`.
    var f = code(extractFn('ricCanonicalService_', RIC));
    ok(!/\.indexOf\([^)]*\)\s*===\s*0/.test(f), 'A5 the service resolver contains no prefix comparison');
    ok(!/startsWith/.test(f), 'A5b and no startsWith');
    ['slice(', 'substr', 'split(', 'replace('].forEach(function (bad) {
        ok(f.indexOf(bad) === -1, 'A5c nor any ' + bad + ' — it never takes a service apart');
    });
    ok(/hasOwnProperty/.test(f), 'A5d it is an exact table lookup');
    ok(/RIC_CANONICAL_SERVICES_\.indexOf\(t\) !== -1/.test(f), 'A5e whose membership test is array containment');
})();
// THE LEAD-TIME BOUNDARY, WHICH IS WHERE THE LIVE DEFECT WAS.
eq(leadKey('sea'), 'Sea', 'A6 sea maps to the Sea lead-time row');
eq(leadKey('sea_express'), 'Sea Express', 'A6b sea_express maps to Sea Express — this returned "Sea" before B1');
ok(leadKey('sea') !== leadKey('sea_express'), 'A6c so the two services never share a lead time');
eq(leadKey('美森海卡'), 'Sea Express', 'A6d and the display label reaches the express row');
eq(leadKey('air'), 'Air', 'A6e air is unaffected');
['rail', 'truck', 'seafood', 'sea-express', 'ocean'].forEach(function (v) {
    eq(leadKey(v), '', 'A7 ' + JSON.stringify(v) + ' has no lead-time mapping and borrows nobody else\'s');
});
(function () {
    var f = code(extractFn('_irMethodToLeadKey', IR));
    ok(!/indexOf\([^)]*\)\s*===\s*0/.test(f), 'A8 the lead-time mapper has no prefix test');
    ok(/hasOwnProperty/.test(f), 'A8b it is an exact table lookup');
})();
// WAS THE LIVE `sea` ROW GENUINELY SEA, OR A LOSSY CONVERSION? Determined by code, not interpretation.
(function () {
    var writers = SAD_C.split(/\r?\n/).filter(function (l) {
        return /recommended_shipping_method/.test(l) && /(=|:)/.test(l);
    });
    ok(writers.length > 0, 'A9 the handler assigns recommended_shipping_method (' + writers.length + ' site(s))');
    eq(writers.filter(function (l) {
        return /startsWith|indexOf\(['"]sea|split\(['"]_|replace\(['"]_express/.test(l);
    }), [], 'A9b and NO assignment of it applies a prefix, split or family transform');
    ok(leadKey('sea_express') === 'Sea Express',
        'A9c so the persisted `sea` row is a genuine sea REQUEST — the lossy conversion was in the ETA path');
})();

// ================================================================================================================
section('§C — destination identity: WAREHOUSE or MARKETPLACE, exclusively');
// ================================================================================================================
eq(S.dest({ recommended_destination_warehouse_id: 'WH-US-1' }).type, 'WAREHOUSE', 'C1 a warehouse id is a WAREHOUSE destination');
eq(S.dest({ destination_marketplace: 'Amazon' }).type, 'MARKETPLACE', 'C2 a marketplace is a MARKETPLACE destination');
eq(S.dest({ destination_marketplace: 'Amazon' }).id, 'amazon', 'C2b whose canonical id is trimmed and lowercased');
eq(S.dest({ destination_marketplace: '  AMAZON  ' }).id, 'amazon', 'C2c so display spelling cannot mint a second identity');
ok(S.k4({ destination_marketplace: 'Amazon' }) !== S.k4({ recommended_destination_warehouse_id: 'Amazon' }),
    'C3 a marketplace named Amazon and a warehouse id "Amazon" are DIFFERENT identities');
eq(S.dest({}).ok, false, 'C4 a route with neither destination is not a route');
eq(S.dest({}).code, 'ROUTE_DESTINATION_MISSING', 'C4b and says which way it failed');
eq(S.dest({ recommended_destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' }).ok, false,
    'C5 a route carrying BOTH identities is refused');
eq(S.dest({ recommended_destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' }).code,
    'ROUTE_DESTINATION_AMBIGUOUS', 'C5b as ambiguous, not silently preferring one');
ok(!/label|display|\bui\b|text/i.test(code(extractFn('ricDestinationIdentity_', RIC))),
    'C6 the resolver reads no label, display or UI field — hydration reads the type from the DATA');
eq(S.complete(TARGET), true, 'C7 the live target IS route-complete once the marketplace is present');
eq(S.complete(withPatch(TARGET, { destination_marketplace: '' })), false, 'C7b and is not, without it');

// ================================================================================================================
section('§E — the versioned identity, and the existing K2 ids it must not disturb');
// ================================================================================================================
eq(S.k2dims(), ['planning_cycle', 'company', 'country', 'marketplace', 'source_page',
    'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
    'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no'],
    'E1 the ten K2 dimensions are unchanged, in the frozen order');
(function () {
    var h = { planning_cycle: '2026-W36', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        recommended_source_warehouse_id: 'WH-CN-YOUXIN', recommended_destination_warehouse_id: 'WH-US-1',
        recommended_shipping_method: 'sea', recommended_last_mile_delivery: 'truck', recommendation_group_no: '' };
    eq(S.k2(h), '2026-w36|resus|us|amazon|inventory_replenishment|wh-cn-youxin|wh-us-1|sea|truck|',
        'E2 the K2 key is the ten dimensions, trimmed, lowercased, pipe-joined');
    var id = S.k2id(h);
    ok(/^SADH-K2-[0-9A-F]+$/.test(id), 'E2b and its deterministic id has the K2 shape (' + id + ')');
    // THE ASSERTION THAT MAKES THE ROUND SAFE: the new dimensions do not move any existing K2 id.
    eq(S.k2id(withPatch(h, { destination_marketplace: 'Amazon' })), id,
        'E3 adding destination_marketplace does NOT move the K2 id — no re-key of any existing header');
    eq(S.k2id(withPatch(h, { expected_arrival: '2026-10-16' })), id, 'E3b nor does an expected arrival');
    eq(S.k2id(withPatch(h, { planned_qty: 800 })), id, 'E3c nor a quantity');
    eq(S.k2id(withPatch(h, { note: 'anything' })), id, 'E3d nor a note');
})();
eq(S.k4dims().length, 11, 'E4 K4 has eleven dimensions');
['destination_type', 'destination_identity', 'recommended_shipping_method_canonical'].forEach(function (d) {
    ok(S.k4dims().indexOf(d) !== -1, 'E4b including ' + d);
});
ok(/^SADH-K4-[0-9A-F]+$/.test(S.k4id(TARGET)), 'E5 a K4 id is prefixed SADH-K4- (' + S.k4id(TARGET) + ')');
ok(S.k4id(TARGET).indexOf('SADH-K2-') !== 0, 'E5b and never SADH-K2-');
ok(S.k4id(withPatch(TARGET, { recommended_shipping_method: 'sea' })) !==
   S.k4id(withPatch(TARGET, { recommended_shipping_method: 'sea_express' })),
    'E6 sea and sea_express produce DIFFERENT K4 identities');
eq(S.k4id(withPatch(TARGET, { recommended_shipping_method: '美森海卡' })),
   S.k4id(withPatch(TARGET, { recommended_shipping_method: 'sea_express' })),
    'E6b while a display label of the same service is the SAME identity, not a second route');
ok(S.k4id(TARGET) !== S.k4id(withPatch(TARGET, { destination_marketplace: 'Walmart' })),
    'E7 a different marketplace is a different identity');
ok(S.k4id(TARGET) !== S.k4id(withPatch(TARGET, { destination_marketplace: '', recommended_destination_warehouse_id: 'WH-US-1' })),
    'E7b and a warehouse destination differs from a marketplace one');
eq(S.k4id(withPatch(TARGET, { destination_marketplace: '  amazon ' })), S.k4id(TARGET),
    'E7c while spelling and case are NOT a new identity');
[['expected_arrival', '2026-10-16'], ['expected_arrival', '2027-01-01'], ['planned_qty', 400], ['planned_qty', 800],
 ['note', 'hello'], ['updated_at', '2026-08-31T00:00:00Z'], ['created_at', 'x'], ['draft_version', 9]]
    .forEach(function (p) {
        var o = {}; o[p[0]] = p[1];
        eq(S.k4id(withPatch(TARGET, o)), S.k4id(TARGET), 'E8 ' + p[0] + ' does not change the route identity');
    });
eq(S.k4id(withPatch(TARGET, {})), S.k4id(TARGET), 'E9 identical dimensions are the same identity, deterministically');
ok(RIC_C.indexOf('SADH-K4-') !== -1, 'E10 the K4 prefix exists where the id is minted');
eq((RIC_C.match(/SADH-K4-/g) || []).length, 1, 'E10b once, in 69_ and nowhere else');
ok(SAD_C.indexOf('SADH-K4-') === -1, 'E10c and the allocation writer knows nothing about it');
ok(!/function sadFnv1a_/.test(RIC), 'E11 69_ reuses 16_\'s hash rather than carrying a second one');

// ================================================================================================================
section('§D/§G — typed refusals: nothing is silently dropped, and no request grows the schema');
// ================================================================================================================
eq(LIVE_30.length, 30, 'D0 the live header schema is the 30 columns FB-4F-A measured');
ok(LIVE_30.indexOf('destination_marketplace') === -1, 'D0b and destination_marketplace is NOT among them');
ok(LIVE_30.indexOf('expected_arrival') === -1, 'D0c nor expected_arrival');
(function () {
    var m = /var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = \[([\s\S]*?)\];/.exec(SAD);
    ok(!!m, 'D0d the handler declares the header schema');
    eq((m[1].match(/'[a-z_]+'/g) || []).map(function (x) { return x.replace(/'/g, ''); }), LIVE_30,
        'D0e and it is byte-for-byte those 30 columns — B1 appended none');
})();
(function () {
    var r = S.persist(TARGET, LIVE_30, ['sku', 'planned_qty']);
    eq(r.persistable, false, 'D1 the live target is NOT persistable against the current schema');
    eq(r.zero_write, true, 'D1b and the refusal is a zero-write refusal');
    ok(r.refusals.map(function (x) { return x.code; }).indexOf('ROUTE_IDENTITY_NOT_PERSISTABLE') !== -1,
        'D1c ROUTE_IDENTITY_NOT_PERSISTABLE for the marketplace');
    var m = r.refusals.filter(function (x) { return x.column === 'destination_marketplace'; })[0];
    ok(!!m, 'D2 the refusal names the missing column');
    eq(m.schema_code, 'ALLOCATION_DRAFT_SCHEMA_COLUMN_ABSENT', 'D2b with the schema-absent code');
    eq(m.supplied, 'Amazon', 'D2c and echoes the value that would otherwise have been dropped');
    eq(m.table, 'shipping_allocation_drafts', 'D2d and the table it belongs to');
})();
(function () {
    var r = S.persist(withPatch(TARGET, { expected_arrival: '2026-10-16' }),
        LIVE_30.concat(['destination_marketplace']), ['sku', 'planned_qty']);
    var e = r.refusals.filter(function (x) { return x.code === 'EXPECTED_ARRIVAL_NOT_PERSISTABLE'; })[0];
    ok(!!e, 'D3 an expected arrival with no line column refuses');
    eq(e.table, 'shipping_allocation_draft_lines', 'D3b naming the LINE table — the canonical owner');
    eq(e.column, 'expected_arrival', 'D3c and the canonical column name, not expected_arrival_date');
})();
(function () {
    var r = S.persist(withPatch(TARGET, { expected_arrival: '2026-10-16' }),
        LIVE_30.concat(['destination_marketplace']), ['sku', 'planned_qty', 'expected_arrival']);
    eq(r.persistable, true, 'D4 once B2 appends both columns the SAME route is persistable');
    eq(r.refusals, [], 'D4b with no refusals at all');
})();
(function () {
    var r = S.persist(withPatch(TARGET, { recommended_shipping_method: 'seafood' }),
        LIVE_30.concat(['destination_marketplace']), ['sku', 'expected_arrival']);
    eq(r.persistable, false, 'D5 a non-canonical service is refused');
    ok(r.refusals.some(function (x) { return x.schema_code === 'SERVICE_NOT_CANONICAL'; }),
        'D5b with SERVICE_NOT_CANONICAL rather than a coercion to sea');
})();
(function () {
    var f = code(extractFn('ricRoutePersistability_', RIC));
    ['getSheet', 'insertColumn', 'appendRow', 'setValue', 'getRange', 'SpreadsheetApp', 'ensureSchema',
     'ensureColumns', 'createSheet', 'insertSheet'].forEach(function (bad) {
        ok(f.indexOf(bad) === -1, 'D6 the persistability guard calls no ' + bad);
    });
    eq(JSON.stringify(S.persist(TARGET, LIVE_30, [])), JSON.stringify(S.persist(TARGET, LIVE_30, [])),
        'D6b it is pure — same input, same answer');
})();
eq(S.persist(withPatch(TARGET, { destination_marketplace: '', recommended_destination_warehouse_id: 'WH-US-1' }),
    LIVE_30, ['sku']).persistable, true, 'D7 a warehouse route needs neither new column and is persistable today');
eq(S.persist({ recommended_source_warehouse_id: 'WH-CN-YOUXIN', recommended_destination_warehouse_id: '',
    recommended_shipping_method: 'sea' }, LIVE_30, ['sku']).persistable, true,
    'D8 the legacy sea row reads without refusal — B1 does not make old rows unreadable');

// ================================================================================================================
section('§L — the quantities B1 must not touch');
// ================================================================================================================
(function () {
    var k = code(extractFn('ricK4GroupKey_', RIC));
    ok(!/planned_qty|quantity|\bqty\b/i.test(k), 'L1 the identity key reads no quantity field at all');
    eq(S.k4id(withPatch(TARGET, { planned_qty: 800 })), S.k4id(withPatch(TARGET, { planned_qty: 400 })),
        'L2 800 and 400 on the same route are ONE identity, not a before/after pair');
    ok(!/planned_qty\s*=\s*(400|800)/.test(SAD_C), 'L3 the handler assigns neither 400 nor 800 as a literal');
    ok(!/\b(400|800)\b/.test(RIC_C), 'L3b and the contract file contains neither quantity');
})();

// ================================================================================================================
section('§H — the TEMP diagnostic left the deploy directory, and the guard came back');
// ================================================================================================================
ok(!fs.existsSync(path.join(GS, TEMP_FILE)), 'H1 the diagnostic is NOT in assets/specs/active/apps-script/');
ok(fs.existsSync(path.join(TOOLS_DIAG, TEMP_FILE)), 'H1b it is in assets/tools/apps-script-diagnostics/');
(function () {
    var src = fs.readFileSync(path.join(TOOLS_DIAG, TEMP_FILE), 'utf8');
    ok(/tempFb4faDiagnose_/.test(src), 'H2 and it is the same diagnostic — its entry point is intact');
    var ROUTER = readGs('01_router.gs');
    ok(ROUTER.indexOf('tempFb4faDiagnose_') === -1, 'H3 nothing in the router dispatches to it');
    ok(ROUTER.indexOf(TEMP_FILE) === -1, 'H3b and the router does not name the file');
    ok(readGs('63_api_v1_system_health.gs').indexOf('tempFb4faDiagnose_') === -1, 'H3c it is in no action registry');
})();
(function () {
    var G = read('assets/tests/action-registry-and-router-completeness-f1-7n-fb-4e-r2.test.js');
    ok(G.indexOf(TEMP_FILE) === -1, 'H4 the owner guard does NOT list the relocated diagnostic');
    ok(G.indexOf("startsWith('TEMP_") === -1 && G.indexOf('/^TEMP_') === -1,
        'H4b and ignores no TEMP_ pattern broadly');
    ok(/GS_OWNED_SINCE_R1/.test(G), 'H4c the owned-set mechanism is still there');
    ok(G.indexOf("'TEMP_order_planning_draft_readback_diagnose.gs'") !== -1,
        'H4d and the other round\'s own diagnostic is still owned, untouched by B1');
})();
(function () {
    var still = fs.readdirSync(GS).filter(function (f) { return f.indexOf('TEMP_') === 0; });
    ok(still.length >= 1, 'H5 other TEMP_ files remain in the deploy directory (' + still.length + ') — not B1\'s scope');
    ok(still.indexOf(TEMP_FILE) === -1, 'H5b and this one is not among them');
})();

// ================================================================================================================
section('§K — the contract versions B1 must not raise, and the stamp it must not move');
// ================================================================================================================
(function () {
    var HEALTH = readGs('63_api_v1_system_health.gs');
    eq((/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/.exec(HEALTH) || [])[1], '10', 'K1 action contract still 10');
    eq((/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/.exec(HEALTH) || [])[1], '1', 'K1b transport contract still 1');
    eq((/var SYS_API_CONTRACT_VERSION_ = '(\d+)';/.exec(HEALTH) || [])[1], '1', 'K1c API contract still 1');
    // THE ALLOCATION WRITER'S STAMP IS DELIBERATELY UNMOVED. §K says to bump the stamps of permanent Apps Script
    // files that change AND that B1 must not deploy; those collide, and the repository resolved it. Bumping
    // SAD_BUILD_VERSION_ was TRIED and put the project into DEPLOYMENT_PARTIAL_SYNC, because
    // 63_api_v1_system_health.gs pins each owner's expected stamp against the DEPLOYED build — a stamp asserts
    // "the deployed copy is not this one", true only once a round has synced the file. Four deployment-contract
    // suites said so. So stamp and manifest move together in B2, and B1 leaves 16_ alone entirely.
    // F1-7N-FB-4F-B3 - RESTATED, AND THE RESTATEMENT IS STRONGER THAN WHAT IT REPLACES.
    //
    // B1 asserted three literals about its own moment: the writer's stamp had not moved, 69_ carried the B1
    // stamp, and 69_ had no manifest entry. All three were true OF B1 and all three are equalities with "now",
    // so B3 - the round that syncs 69_ and teaches the writer the columns - made them fail while describing the
    // correct state. The durable statement is the CONTRACT they were standing in for: every owner declares
    // exactly what the deployment manifest expects of it. A stamp nobody expects and an expectation no file
    // declares are the two halves of a partial sync, and this catches both, in either direction, forever.
    function manifestExpects(file) {
        var re = new RegExp("\\{ file: '" + file.replace(/\./g, '\\.') + "',[^}]*expected: '([^']+)'");
        return (HEALTH.match(re) || [])[1] || '';
    }
    function declares(src, sym) { return (src.match(new RegExp('var ' + sym + " = '([^']+)';")) || [])[1] || ''; }
    eq(declares(SAD, 'SAD_BUILD_VERSION_'), manifestExpects('16_shipping_allocation_handlers.gs'),
        'K2 the allocation writer declares exactly what the deployment manifest expects');
    eq(declares(RIC, 'RIC_BUILD_VERSION_'), manifestExpects('69_api_v1_route_identity_contract.gs'),
        'K2b and so does the route-identity contract, now that it is a synchronized owner');
    ok(!!manifestExpects('69_api_v1_route_identity_contract.gs'),
        'K2c 69_ IS manifested — B1 left it inert, B3 wires it and registers it in the same round');
    var ROUTER = readGs('01_router.gs');
    ['ricK4', 'ricRoutePersistability', 'ricCanonicalService', '69_api_v1_route_identity_contract']
        .forEach(function (sym) { ok(ROUTER.indexOf(sym) === -1, 'K3 ' + sym + ' is not routed — B1 adds no action'); });
})();

// ================================================================================================================
section('§J negative tests — each guard is made to BITE');
// ================================================================================================================
var neg = { caught: 0, missed: 0 };
function mutate(label, baseline, mutated) {
    var b;
    try { b = baseline(); } catch (e) { b = 'THREW: ' + e.message; }
    if (b !== true) { fail++; console.error('FAIL negative ' + label + ' — BASELINE NOT CLEAN: ' + b); return; }
    var caught;
    try { caught = mutated() !== true; } catch (e) { caught = true; }
    if (caught) { neg.caught++; pass++; console.log('  caught: ' + label); }
    else { neg.missed++; fail++; console.error('FAIL negative ' + label + ' — MUTATION NOT CAUGHT'); }
}
// A MUTATION THAT CHANGED NOTHING IS NOT A PASSING TEST, IT IS AN ABSENT ONE. Six mutations in an earlier draft
// were regexes written against CRLF while 69_ is LF: they matched nothing, the "mutant" WAS the original, and
// every one reported as NOT CAUGHT. The lesson is not "fix the regex" — it is that a mutation must PROVE it
// mutated. swap() asserts the anchor exists AND that the result differs, so a silent no-op throws instead.
function swap(src, from, to) {
    if (src.indexOf(from) === -1) throw new Error('mutation anchor absent: ' + from.slice(0, 60));
    var out = src.split(from).join(to);
    if (out === src) throw new Error('mutation changed nothing: ' + from.slice(0, 60));
    return out;
}
function servicesDistinct(ricSrc) {
    var T = sadContext(null, ricSrc);
    return T.svc('sea') === 'sea' && T.svc('sea_express') === 'sea_express' && T.svc('美森海卡') === 'sea_express';
}
function identityDistinct(ricSrc) {
    var T = sadContext(null, ricSrc);
    return T.k4id(withPatch(TARGET, { recommended_shipping_method: 'sea' })) !==
           T.k4id(withPatch(TARGET, { recommended_shipping_method: 'sea_express' }));
}

// N1 — sea_express collapsed into sea. An earlier draft rewrote only the LABEL table and was NOT caught, because
// the canonical ARRAY is checked first and 'sea_express' is in it: the mutation was defeated by the code's own
// layering rather than by any assertion, so it proved nothing. A real collapse must do both.
mutate('N1 sea_express collapsed to sea',
    function () { return servicesDistinct(); },
    function () {
        var m = swap(RIC, "'air', 'sea', 'sea_express', 'rail', 'truck'", "'air', 'sea', 'rail', 'truck'");
        m = swap(m, "'sea express': 'sea_express', 'sea_express': 'sea_express'", "'sea express': 'sea', 'sea_express': 'sea'");
        m = swap(m, "'快船': 'sea_express', '美森海卡': 'sea_express'", "'快船': 'sea', '美森海卡': 'sea'");
        return servicesDistinct(m);
    });
mutate('N1b the two services collapsed into one identity',
    function () { return identityDistinct(); },
    function () {
        return identityDistinct(swap(RIC, 'ricCanonicalService_(h.recommended_shipping_method != null',
            "'sea', 0 && ricCanonicalService_(h.recommended_shipping_method != null"));
    });
mutate('N2 a prefix family fallback in the service resolver',
    function () { return S.svc('seafood') === '' && S.svc('sea-express') === ''; },
    function () {
        var T = sadContext(null, swap(RIC, "  return '';", "  if (t.indexOf('sea') === 0) return 'sea';\n  return '';"));
        return T.svc('seafood') === '' && T.svc('sea-express') === '';
    });
mutate('N3 a prefix family lead-time fallback',
    function () { return leadKey('sea_express') === 'Sea Express' && leadKey('seafood') === ''; },
    function () {
        var lk = leadKeyContext(swap(IR, "    if (!m) return '';",
            "    if (!m) return '';\r\n    if (m.indexOf('sea') === 0) return 'Sea';"));
        return lk('sea_express') === 'Sea Express' && lk('seafood') === '';
    });
mutate('N4 the destination marketplace omitted from identity',
    function () { return S.k4id(TARGET) !== S.k4id(withPatch(TARGET, { destination_marketplace: 'Walmart' })); },
    function () {
        var T = sadContext(null, swap(RIC, 's(dest.type), s(dest.id),', 's(dest.type), "",'));
        return T.k4id(TARGET) !== T.k4id(withPatch(TARGET, { destination_marketplace: 'Walmart' }));
    });
mutate('N5 a marketplace encoded as a warehouse id',
    function () {
        return S.dest({ recommended_destination_warehouse_id: 'Amazon' }).type === 'WAREHOUSE' &&
               S.dest({ destination_marketplace: 'Amazon' }).type === 'MARKETPLACE';
    },
    function () {
        var T = sadContext(null, swap(RIC, "if (mkt) return { type: 'MARKETPLACE'", "if (mkt) return { type: 'WAREHOUSE'"));
        return T.dest({ destination_marketplace: 'Amazon' }).type === 'MARKETPLACE';
    });
mutate('N6 the expected arrival included in identity',
    function () { return S.k4id(withPatch(TARGET, { expected_arrival: '2026-10-16' })) === S.k4id(TARGET); },
    function () {
        var T = sadContext(null, swap(RIC, "s(h.recommendation_group_no)].join('|');",
            "s(h.recommendation_group_no), s(h.expected_arrival)].join('|');"));
        return T.k4id(withPatch(TARGET, { expected_arrival: '2026-10-16' })) === T.k4id(TARGET);
    });
mutate('N7 the quantity included in identity',
    function () { return S.k4id(withPatch(TARGET, { planned_qty: 400 })) === S.k4id(withPatch(TARGET, { planned_qty: 800 })); },
    function () {
        var T = sadContext(null, swap(RIC, "s(h.recommendation_group_no)].join('|');",
            "s(h.recommendation_group_no), s(h.planned_qty)].join('|');"));
        return T.k4id(withPatch(TARGET, { planned_qty: 400 })) === T.k4id(withPatch(TARGET, { planned_qty: 800 }));
    });
// N8 — K2 lives in 16_, so THIS mutation targets the allocation writer's source rather than the contract's.
mutate('N8 an existing K2 header re-keyed',
    function () {
        var h = { company: 'ResUS', country: 'US', marketplace: 'Amazon', recommended_shipping_method: 'sea' };
        return S.k2id(h) === S.k2id(withPatch(h, { destination_marketplace: 'Amazon' }));
    },
    function () {
        var T = sadContext(swap(SAD, "    s(h.recommendation_group_no)].join('|');",
            "    s(h.recommendation_group_no), s(h.destination_marketplace)].join('|');"), null);
        var h = { company: 'ResUS', country: 'US', marketplace: 'Amazon', recommended_shipping_method: 'sea' };
        return T.k2id(h) === T.k2id(withPatch(h, { destination_marketplace: 'Amazon' }));
    });
mutate('N9 a supplied value silently dropped when its column is absent',
    function () { return S.persist(TARGET, LIVE_30, []).persistable === false; },
    function () {
        var T = sadContext(null, swap(RIC,
            "if (s(header.destination_marketplace) && !have['destination_marketplace']) {", 'if (false) {'));
        return T.persist(TARGET, LIVE_30, []).persistable === false;
    });
mutate('N10 both destination identities allowed on one route',
    function () { return S.dest({ recommended_destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' }).ok === false; },
    function () {
        var T = sadContext(null, swap(RIC,
            "if (wid && mkt) return { type: '', id: '', ok: false, code: 'ROUTE_DESTINATION_AMBIGUOUS' };", ''));
        return T.dest({ recommended_destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' }).ok === false;
    });
mutate('N11 a schema-ensure helper reachable from the request path',
    function () { return code(extractFn('ricRoutePersistability_', RIC)).indexOf('ensureSchema') === -1; },
    function () {
        var m = swap(RIC, 'function ricRoutePersistability_(header, headerNames, lineFieldNames) {',
            'function ricRoutePersistability_(header, headerNames, lineFieldNames) {\n  ensureSchema_();');
        return code(extractFn('ricRoutePersistability_', m)).indexOf('ensureSchema') === -1;
    });
mutate('N12 LEGACY_ROUTE_RECONCILIATION_REQUIRED weakened',
    function () { return (SAD.match(/LEGACY_ROUTE_RECONCILIATION_REQUIRED/g) || []).length >= 6; },
    function () {
        var m = swap(SAD, 'LEGACY_ROUTE_RECONCILIATION_REQUIRED', 'RECONCILE_OK');
        return (m.match(/LEGACY_ROUTE_RECONCILIATION_REQUIRED/g) || []).length >= 6;
    });
mutate('N13 the owner guard broadly ignoring TEMP files',
    function () {
        var G = read('assets/tests/action-registry-and-router-completeness-f1-7n-fb-4e-r2.test.js');
        return G.indexOf("startsWith('TEMP_") === -1 && G.indexOf('/^TEMP_') === -1;
    },
    function () {
        var G = swap(read('assets/tests/action-registry-and-router-completeness-f1-7n-fb-4e-r2.test.js'),
            'var gsUnexpected = gsList.filter(function (f) { return !GS_OWNED_SINCE_R1[f]; });',
            "var gsUnexpected = gsList.filter(function (f) { return !GS_OWNED_SINCE_R1[f] && !f.startsWith('TEMP_'); });");
        return G.indexOf("startsWith('TEMP_") === -1 && G.indexOf('/^TEMP_') === -1;
    });
mutate('N14 the diagnostic moved back into the deploy directory',
    function () { return !fs.existsSync(path.join(GS, TEMP_FILE)); },
    function () { return !fs.existsSync(path.join(TOOLS_DIAG, TEMP_FILE)); });
// N15 — THE CONTRACT REIMPLEMENTED INSIDE THE WRITER.
//
// B1 asserted the writer did not so much as MENTION the contract, which was the right statement for a round
// forbidden to touch it. B3 is the round that wires it: 16_ now CALLS ricK4GroupKey_ and ricRoutePersistability_,
// so "never mentions" has become false while nothing it protected has changed.
//
// What it was really defending is that there is ONE implementation of each identity rule. A second copy of a
// hash is a second answer waiting to disagree, and the copy would drift first - so the durable rule is that the
// writer may CALL the contract and must never DEFINE it. That is what this now mutates against.
mutate('N15 the route-identity contract reimplemented inside the allocation writer',
    function () {
        return !/function\s+ric[A-Za-z0-9_]*\s*\(/.test(SAD) && !/var\s+RIC_[A-Z0-9_]*\s*=/.test(SAD) &&
            SAD.indexOf('ricK4GroupKey_') !== -1;           // and it really does call it, or the check is vacuous
    },
    function () {
        var m = swap(SAD, 'function sadK2GroupKey_(h) {',
            'function ricK4GroupKey_(h) { return ""; }\nfunction sadK2GroupKey_(h) {');
        return !/function\s+ric[A-Za-z0-9_]*\s*\(/.test(m) && !/var\s+RIC_[A-Z0-9_]*\s*=/.test(m) &&
            m.indexOf('ricK4GroupKey_') !== -1;
    });

console.log('\n  negative tests: ' + neg.caught + ' caught, ' + neg.missed + ' missed');

// ================================================================================================================
console.log('\n' + '-'.repeat(40));
console.log('ROUTE IDENTITY + SCHEMA CONTRACT (FB-4F-B1): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
