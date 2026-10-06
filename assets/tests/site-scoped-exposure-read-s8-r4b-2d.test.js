// S8-R4B-2D — THE SITE-SCOPED EXPOSURE READ.
//
// R4B-2B gave the exposure layer a per-Site cache and R4B-2C proved what that cache was holding: the request
// carried NO scope, so every Site was served every Site's rows and then told to keep them under its own key.
// The cache was per-Site. The DATA was not. This round closes that, and the three claims it has to earn are:
//
//   1. THE SITE REACHES THE SERVER AT ALL. The request DTO is a WHITELIST — a field it does not name is
//      discarded before the request is built, which is exactly how R4 shipped a recentWindow nobody received.
//      An incomplete scope is FORWARDED rather than dropped, because dropping it would turn a caller's bug
//      into an all-site read that looks precisely like a correct one.
//   2. THE SERVER PROJECTION IS A REACHABILITY CLOSURE, NOT SIX ROW FILTERS. Filtering `shipments` on its own
//      marketplace deletes exactly the merged MULTI headers the lineage machinery exists to attribute, and
//      `shipping_plan_lines.marketplace` is the line's REAL marketplace — the shipped client deliberately
//      attributes a line to its PARENT PLAN. Either shortcut loses quantity silently.
//   3. NOTHING R4B-2B EARNED IS SPENT. Thirteen first-layer tables, one request per Site, zero per expand,
//      zero prefetch, and NOT_LOADED still never renders as a zero.
//
// Run: node assets/tests/site-scoped-exposure-read-s8-r4b-2d.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED (got ' + JSON.stringify(r) + ')'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var FOUND = read('assets/js/api/km-api-foundation.js');
var G60 = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var REGISTRY = read('assets/js/core/method-registry.js');

var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
var NL = PAGE.indexOf(CR + LF) >= 0 ? (CR + LF) : LF;

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = src.match(new RegExp('var ' + name + ' = (?:\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\});'));
  // SIR_WS_ROW_MAX_ is a scalar. A list-or-object-only matcher would have thrown on it, which is a harness
  // bug rather than a finding.
  if (!m) m = src.match(new RegExp('var ' + name + ' = [^;\\n]+;'));
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
function liftList(src, name) { return new Function(extractVar(src, name) + NL + 'return ' + name + ';')(); }
// A mutation that does not apply THROWS, so a probe can never report a passing grade for an assertion it
// never made.
function mutateFn(src, name, find, replace) {
  function fix(t) { return String(t).split(CR + LF).join(LF).split(LF).join(NL); }
  find = fix(find); replace = fix(replace);
  var body = extractFn(src, name);
  if (body.indexOf(find) === -1) throw new Error('mutation target absent in ' + name + ': ' + find.slice(0, 70));
  return src.replace(body, body.replace(find, replace));
}
function stripComments(t) {
  var NLC = String.fromCharCode(10);
  return String(t).replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(new RegExp('(^|[^:])\\/\\/[^' + NLC + ']*', 'g'), '$1 ');
}

// ----------------------------------------------------------------------------------------------------------
// THE SERVER, EXECUTED. Not grepped: the closure is the claim, so the shipped bytes run against fixtures.
// ----------------------------------------------------------------------------------------------------------
var G60_HELPERS = ['sirWsStr_', 'sirCap_', 'sirWsRecentWindow_', 'sirWsOnlyList_', 'sirWsOnlySet_',
  'sirWsSiteScope_', 'sirWsScopeApplicable_', 'sirWsSiteScopeClosure_', 'sirWorkspaceBuild_', 'sirBuildEnvelope_',
  'handleInventoryReplenishmentWorkspaceGet_',
  'sirWsIsB1Table_', 'sirWsColumnLetter_', 'sirWsPadRows_', 'sirWsSerialToDate_', 'sirWsApplyDateMap_',
  'sirWsClassifySheetsError_', 'sirWsIsTransientClass_', 'sirWsB1Error_'];
// S8-R4D-E2 - this suite REASSEMBLES the handler from a named list rather than running the file, so a new
// helper the handler calls must be listed here or the rebuilt function throws ReferenceError and every
// assertion below reports a refused read instead of the fault. The list is the price of the precision: it
// builds exactly the handler under test and nothing else.
var G60_VARS = ['SIR_WS_ROW_MAX_', 'SIR_WORKSPACE_TABLES_', 'SIR_WS_RECENT_WINDOW_', 'SIR_EXPOSURE_TABLES_',
  'SIR_SITE_SCOPE_FIELDS_', 'SIR_B1_TABLES_', 'SIR_B1_DATE_MAP_VERSION_', 'SIR_B1_DATE_MAP_',
  'SIR_B1_NON_DATE_TRAPS_', 'SIR_B1_FALLBACK_CLASSES_', 'SIR_B1_MAX_FALLBACK_'];
function server(src) {
  src = src || G60;
  var parts = G60_VARS.map(function (v) { return extractVar(src, v); })
    .concat(["var SIR_WS_SEQ_ = 0; var SIR_BUILD_VERSION_ = 'TEST';"])
    .concat(G60_HELPERS.map(function (f) { return extractFn(src, f); }));
  return new Function(parts.join(NL) + NL
    + 'return { build: sirWorkspaceBuild_, closure: sirWsSiteScopeClosure_, scope: sirWsSiteScope_,'
    + ' applicable: sirWsScopeApplicable_, handle: handleInventoryReplenishmentWorkspaceGet_ };')();
}
var SRV = server();

// ----------------------------------------------------------------------------------------------------------
// THREE REAL SITES AND ONE MERGED SHIPMENT. Raw snake_case, exactly as a sheet row arrives.
//
//   A = ResUS | US | Amazon      B = ResTW | CA | Amazon      C = ResTW | JP | Amazon   (never visited)
//
// SH-MULTI is the case that decides the design: one merged header carrying a line for A and a line for B,
// each reaching its real site through frozen shipping_plan_line lineage. A header filter deletes it.
// ----------------------------------------------------------------------------------------------------------
var A = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var B = { company: 'ResTW', country: 'CA', marketplace: 'Amazon' };
var C = { company: 'ResTW', country: 'JP', marketplace: 'Amazon' };

var TABLES = {
  shipping_plans: [
    { shipping_plan_id: 'P-A', company: 'ResUS', country: 'US', marketplace: 'Amazon' },
    { shipping_plan_id: 'P-B', company: 'ResTW', country: 'CA', marketplace: 'Amazon' },
    { shipping_plan_id: 'P-C', company: 'ResTW', country: 'JP', marketplace: 'Amazon' }
  ],
  shipping_plan_lines: [
    // PL-A2's OWN marketplace is JP. Its PLAN is A. The client attributes it to the PLAN, and so must this.
    { shipping_plan_line_id: 'PL-A1', shipping_plan_id: 'P-A', sku: 'SKU1', marketplace: 'Amazon' },
    { shipping_plan_line_id: 'PL-A2', shipping_plan_id: 'P-A', sku: 'SKU2', marketplace: 'JP-Amazon' },
    { shipping_plan_line_id: 'PL-B1', shipping_plan_id: 'P-B', sku: 'SKU1', marketplace: 'Amazon' },
    { shipping_plan_line_id: 'PL-C1', shipping_plan_id: 'P-C', sku: 'SKU1', marketplace: 'Amazon' }
  ],
  shipments: [
    { shipment_id: 'SH-A', company: 'ResUS', country: 'US', marketplace: 'Amazon' },
    { shipment_id: 'SH-B', company: 'ResTW', country: 'CA', marketplace: 'Amazon' },
    { shipment_id: 'SH-C', company: 'ResTW', country: 'JP', marketplace: 'Amazon' },
    { shipment_id: 'SH-MULTI', company: 'ResUS', country: 'US', marketplace: 'MULTI' }
  ],
  shipment_lines: [
    { shipment_line_id: 'SL-A1', shipment_id: 'SH-A', sku: 'SKU1', shipping_plan_line_id: 'PL-A1' },
    { shipment_line_id: 'SL-A2', shipment_id: 'SH-A', sku: 'SKU9', shipping_plan_line_id: '' },  // blank -> header A
    { shipment_line_id: 'SL-B1', shipment_id: 'SH-B', sku: 'SKU1', shipping_plan_line_id: 'PL-B1' },
    { shipment_line_id: 'SL-C1', shipment_id: 'SH-C', sku: 'SKU1', shipping_plan_line_id: 'PL-C1' },
    { shipment_line_id: 'SL-M-A', shipment_id: 'SH-MULTI', sku: 'SKU2', shipping_plan_line_id: 'PL-A2' },
    { shipment_line_id: 'SL-M-B', shipment_id: 'SH-MULTI', sku: 'SKU3', shipping_plan_line_id: 'PL-B1' },
    // PRESENT but unresolvable: the plan line does not exist. Fails closed on BOTH sides — never header.
    { shipment_line_id: 'SL-M-X', shipment_id: 'SH-MULTI', sku: 'SKU4', shipping_plan_line_id: 'PL-GONE' }
  ],
  shipping_allocation_drafts: [
    { allocation_draft_id: 'D-A', company: 'ResUS', country: 'US', marketplace: 'Amazon' },
    { allocation_draft_id: 'D-A2', company: '', country: 'US', marketplace: 'Amazon' },   // blank company: client admits it
    { allocation_draft_id: 'D-B', company: 'ResTW', country: 'CA', marketplace: 'Amazon' },
    { allocation_draft_id: 'D-C', company: 'ResTW', country: 'JP', marketplace: 'Amazon' }
  ],
  shipping_allocation_draft_lines: [
    { allocation_draft_line_id: 'DL-A1', allocation_draft_id: 'D-A', sku: 'SKU1' },
    { allocation_draft_line_id: 'DL-A2', allocation_draft_id: 'D-A2', sku: 'SKU1' },
    { allocation_draft_line_id: 'DL-B1', allocation_draft_id: 'D-B', sku: 'SKU1' },
    { allocation_draft_line_id: 'DL-C1', allocation_draft_id: 'D-C', sku: 'SKU1' }
  ]
};
var EXPOSURE6 = liftList(G60, 'SIR_EXPOSURE_TABLES_');
function ids(rows, k) { return (rows || []).map(function (r) { return r[k]; }).sort(); }
function closureFor(site, src) { return (src || SRV).closure(TABLES, site); }

// ================================================================================================================
section('A — the DTO whitelist: the field reaches the server, or the round does not exist');
// ================================================================================================================
var buildDTO = new Function('API_VERSION', 'isObj', 'makeRequestId',
  extractFn(FOUND, 'buildInventoryReplenishmentRequestDTO') + NL + 'return buildInventoryReplenishmentRequestDTO;')(
  '1', function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); }, function () { return 'REQ-TEST'; });

var dtoA = buildDTO({ recentWindow: true, only: EXPOSURE6.slice(), siteScope: A });
eq(dtoA.payload.siteScope, A, 'A1  SITE_SCOPE_DTO_PRESERVED = YES — the three fields survive the whitelist');
eq(dtoA.action, 'inventoryReplenishment.workspace.get', 'A1a on the action that already existed — no new action');
eq(dtoA.payload.only, EXPOSURE6, 'A1b beside the exposure-only `only` list');
eq(Object.keys(buildDTO({ siteScope: { company: ' ResUS ', country: 'US', marketplace: 'Amazon', sku: 'SKU1', rowIndex: 4 } })
  .payload.siteScope).sort(), ['company', 'country', 'marketplace'],
  'A2  and NOTHING else travels — sku and rowIndex are not scope, and a pass-through would give the whitelist away');
eq(buildDTO({ siteScope: { company: '  ResUS  ', country: ' US', marketplace: 'Amazon ' } }).payload.siteScope, A,
  'A2a the three are normalised (String + trim) through the existing DTO convention');
// THE ONE THAT MATTERS: an incomplete scope must not quietly become an all-site read.
eq(buildDTO({ siteScope: { company: 'ResUS', country: 'US' } }).payload.siteScope,
  { company: 'ResUS', country: 'US', marketplace: '' },
  'A3  INCOMPLETE_SCOPE_WIDENS_TO_GLOBAL = NO — a blank field is FORWARDED, so 60_ can refuse it by name');
ok(buildDTO({ siteScope: 'ResUS|US|Amazon' }).payload.siteScope !== undefined,
  'A3a and so is a MALFORMED one — a typeof gate here would silently issue the all-site read');
ok(buildDTO({ recentWindow: true, only: ['shipments'] }).payload.siteScope === undefined,
  'A4  while a caller that asks for no scope sends none — the unscoped request is byte-for-byte what it was');

// ================================================================================================================
section('B — the page asks for ONE site, and cannot ask for a seventh table to find out which');
// ================================================================================================================
var ENSURE = extractFn(PAGE, '_irEnsureExposureLoaded_');
ok(/var payload = \{ recentWindow: true, only: IR_EXPOSURE_TABLES_\.slice\(\), siteScope: site \};/.test(ENSURE),
  'B1  the exposure request carries recentWindow, the exposure-only `only`, and the site');
var SITEFN = extractFn(PAGE, '_irExposureSite_');
ok(/company:/.test(SITEFN) && /country:/.test(SITEFN) && /marketplace:/.test(SITEFN),
  'B2  EXPOSURE_REQUEST_SCOPE_FIELDS = company + country + marketplace');
ok(!/marketplaceId\s*:/.test(stripComments(SITEFN)),
  'B2a and NOT marketplace_id — none of the six tables stores it, so scoping on it would cost a SEVENTH sheet');
ok(/_irExposureByScope\[k\]/.test(extractFn(PAGE, '_irExposureActiveEntry_'))
  && /a\.marketplaceId\]\.join\('\|'\)/.test(extractFn(PAGE, '_irExposureScopeKey_')),
  'B2b CACHE_KEY_FIELDS still end in marketplace_id — a map key and a request identity may differ by design');
ok(/if \(!site\) \{/.test(ENSURE) && /IR_EXPOSURE_SCOPE_INCOMPLETE/.test(ENSURE),
  'B3  a site the master cannot name issues NO request and settles FAILED — never an unscoped read');
eq(liftList(PAGE, 'IR_EXPOSURE_TABLES_').filter(function (t) { return t === 'marketplaces'; }), [],
  'B4  SEVENTH_TABLE_READ_COUNT = 0 — `marketplaces` is a FIRST-layer table and is not re-read here');
eq(liftList(PAGE, 'IR_EXPOSURE_TABLES_').length, 6, 'B5  EXPOSURE_READ_TABLE_COUNT = 6');

// ================================================================================================================
section('C — the closure: Site A gets Site A, and the merged header survives');
// ================================================================================================================
var outA = closureFor(A), outB = closureFor(B);

eq(ids(outA.shipping_plans, 'shipping_plan_id'), ['P-A'], 'C1  P  — only this site\'s plans');
eq(ids(outA.shipping_plan_lines, 'shipping_plan_line_id'), ['PL-A1', 'PL-A2'],
  'C2  PL — their lines, INCLUDING PL-A2 whose own marketplace is JP: the PLAN is the receiver authority');
eq(ids(outA.shipment_lines, 'shipment_line_id'), ['SL-A1', 'SL-A2', 'SL-M-A'],
  'C3  SL — frozen lineage into A, plus the BLANK-lineage line whose header is A');
eq(ids(outA.shipments, 'shipment_id'), ['SH-A', 'SH-MULTI'],
  'C4  MULTI_HEADER_PRESERVED = YES — SH-MULTI is reached through its line, which a header filter would delete');
eq(ids(outA.shipping_allocation_drafts, 'allocation_draft_id'), ['D-A', 'D-A2'],
  'C5  D  — this site\'s drafts, including the blank-company row the client itself admits');
eq(ids(outA.shipping_allocation_draft_lines, 'allocation_draft_line_id'), ['DL-A1', 'DL-A2'],
  'C6  DL — their lines, by allocation_draft_id');

eq(ids(outB.shipments, 'shipment_id'), ['SH-B', 'SH-MULTI'],
  'C7  and Site B reaches the SAME merged header through ITS line — one header, two sites, no double count');
eq(ids(outB.shipment_lines, 'shipment_line_id'), ['SL-B1', 'SL-M-B'], 'C7a with only B\'s lines inside it');
eq(ids(outB.shipping_plans, 'shipping_plan_id'), ['P-B'], 'C7b and only B\'s plans');

// AMBIGUOUS LINEAGE FAILS CLOSED — on both sides, and never falls back to the header.
ok(ids(outA.shipment_lines, 'shipment_line_id').indexOf('SL-M-X') === -1
  && ids(outB.shipment_lines, 'shipment_line_id').indexOf('SL-M-X') === -1,
  'C8  AMBIGUOUS_LINEAGE_FAIL_CLOSED = YES — a dangling plan-line id reaches NO site, not the header\'s');
ok(ids(outA.shipment_lines, 'shipment_line_id').indexOf('SL-A2') !== -1,
  'C9  while a BLANK lineage keeps the documented header fallback');

// ---- the leak census, which is the operator's actual requirement
var CSITE = closureFor(C);
function leaked(out, bad) {
  var n = 0;
  EXPOSURE6.forEach(function (t) {
    (out[t] || []).forEach(function (r) {
      var v = JSON.stringify(r);
      bad.forEach(function (idv) { if (v.indexOf('"' + idv + '"') !== -1) n++; });
    });
  });
  return n;
}
eq(leaked(outA, ['P-B', 'PL-B1', 'SH-B', 'SL-B1', 'D-B', 'DL-B1']), 0, 'C10 SITE_B_TO_A_ROW_LEAK_COUNT = 0');
eq(leaked(outB, ['P-A', 'PL-A1', 'PL-A2', 'SH-A', 'SL-A1', 'SL-A2', 'D-A', 'DL-A1']), 0,
  'C11 SITE_A_TO_B_ROW_LEAK_COUNT = 0');
eq(leaked(outA, ['P-C', 'PL-C1', 'SH-C', 'SL-C1', 'D-C', 'DL-C1'])
   + leaked(outB, ['P-C', 'PL-C1', 'SH-C', 'SL-C1', 'D-C', 'DL-C1']), 0,
  'C12 CROSS_SITE_ROW_LEAK_COUNT = 0 — the UNVISITED Site C appears in neither response');
ok(ids(CSITE.shipments, 'shipment_id').indexOf('SH-C') !== -1,
  'C12a and C is not simply empty — it has its own rows, which is what makes C12 evidence');

// ---- two sites with the same (empty) truth are allowed to look identical
var EMPTY_SITE = { company: 'ResXX', country: 'DE', marketplace: 'Amazon' };
var e1 = closureFor(EMPTY_SITE), e2 = closureFor({ company: 'ResYY', country: 'FR', marketplace: 'Amazon' });
eq(JSON.stringify(e1) === JSON.stringify(e2), true,
  'C13 two sites that legitimately hold nothing return the SAME bytes — §8 forbids demanding unequal hashes');
eq(e1.shipments.length + e1.shipment_lines.length + e1.shipping_plans.length, 0, 'C13a and that answer is genuinely empty');

// ================================================================================================================
section('D — fail closed, before a sheet is opened');
// ================================================================================================================
function io_(tables, track) {
  return {
    now: (function () { var n = 0; return function () { return ++n; }; })(),
    nextSeq: function () { return 1; },
    openTarget: function () { track.opened++; return {}; },
    readTable: function (ss, name) { track.reads.push(name); return tables[name] || []; }
  };
}
function call(payload, src) {
  var track = { opened: 0, reads: [] };
  var env = (src || SRV).handle({ payload: payload, requestId: 'REQ-T' }, io_(TABLES, track));
  return { env: env, track: track };
}

var okRun = call({ recentWindow: true, only: EXPOSURE6.slice(), siteScope: A });
eq(okRun.env.success, true, 'D1  a COMPLETE scope on an exposure-only request is accepted');
eq(okRun.track.reads.slice().sort(), EXPOSURE6.slice().sort(), 'D1a and reads exactly the six — no seventh table');
eq(okRun.env.meta.siteScopeRequested, A, 'D1b meta echoes what was ASKED for');
ok(okRun.env.meta.siteScopeApplied && okRun.env.meta.siteScopeApplied.shipments.dropped > 0,
  'D1c and what was APPLIED, per table — a reduction nobody can see is indistinguishable from data loss');
eq(ids(okRun.env.data.shipments, 'shipment_id'), ['SH-A', 'SH-MULTI'], 'D1d the envelope carries the scoped rows');

var bad = call({ recentWindow: true, only: EXPOSURE6.slice(), siteScope: { company: 'ResUS', country: 'US', marketplace: '' } });
eq(bad.env.success, false, 'D2  an INCOMPLETE scope is REFUSED');
eq(bad.env.errors[0].code, 'INVENTORY_REPLENISHMENT_SITE_SCOPE_INCOMPLETE', 'D2a with a typed, classifiable code');
eq(bad.env.errors[0].details.missing, ['marketplace'], 'D2b that names the missing field rather than hinting at it');
eq(bad.track.opened, 0, 'D2c and the spreadsheet is never opened — a refusal costs zero sheet reads');
eq(bad.track.reads, [], 'D2d INCOMPLETE_SCOPE_WIDENS_TO_GLOBAL = NO — not one row of any site was read');

var notApp = call({ recentWindow: true, only: ['marketplaces', 'sku_details'], siteScope: A });
eq(notApp.env.success, false, 'D3  a scope on a NON-exposure request is refused, not ignored');
eq(notApp.env.errors[0].code, 'INVENTORY_REPLENISHMENT_SITE_SCOPE_NOT_APPLICABLE',
  'D3a because ignoring a scope IS widening it');

// The BUILDER refuses independently of the orchestrator. Two gates, and no mutant removes two things.
var threw = null;
try { SRV.build(TABLES, { only: EXPOSURE6.slice(), siteScope: { company: 'ResUS', country: '', marketplace: 'Amazon' } }); }
catch (e) { threw = e; }
ok(threw && threw.apiCode === 'INVENTORY_REPLENISHMENT_SITE_SCOPE_INCOMPLETE',
  'D4  and the pure builder refuses on its own — the fail-closed is in BOTH layers');

// ================================================================================================================
section('E — what did NOT change');
// ================================================================================================================
// §5 — the generic `only` contract keeps its meaning for every caller that is not the exposure read.
var unscoped = call({ recentWindow: true, only: ['marketplaces', 'sku_details'] });
eq(unscoped.env.success, true, 'E1  an UNSCOPED `only` request is unchanged');
eq(unscoped.track.reads.slice().sort(), ['marketplaces', 'sku_details'], 'E1a and still honours its table list');
eq(unscoped.env.meta.siteScopeRequested, null, 'E1b reporting no scope, because it asked for none');
var carrier = call({ only: ['carrier_lead_times', 'carrier_rate_cards'], include: { carrierPlanning: true } });
eq(carrier.env.success, true, 'E1c and so is the carrier-catalogue caller — the third of the three');
// The census, so the count is asserted rather than claimed.
var ONLY_CALLERS = (PAGE.match(/only: IR_[A-Z_]+\.slice\(\)/g) || []).length
  + (REGISTRY.match(/only: \['carrier_lead_times', 'carrier_rate_cards'\]/g) || []).length;
eq(ONLY_CALLERS, 3, 'E2  THREE shipped callers of the `only` contract');
// Read the first-layer payload LITERAL, not the whole file. `siteScope` is also a pre-existing local
// variable name in the forecast and factory-availability helpers, so a file-wide match would have been
// satisfied before this round began - which is a test that cannot fail, wearing a passing grade.
var _firstPayload = /var _wsPayload = \{[^}]*\};/.exec(PAGE)[0];
ok(/only: IR_FIRST_LAYER_TABLES_\.slice\(\)/.test(_firstPayload) && !/siteScope/.test(_firstPayload),
  'E2a the FIRST-LAYER request did NOT gain a scope merely because the exposure request did', _firstPayload);
var _expPayload = /var payload = \{ recentWindow: true, only: IR_EXPOSURE_TABLES_[^}]*\};/.exec(PAGE)[0];
ok(/siteScope: site/.test(_expPayload),
  'E2a1 while the EXPOSURE request did — the two payloads are read separately, so neither stands in for '
  + 'the other', _expPayload);
ok(!/siteScope/.test(REGISTRY), 'E2b nor did the carrier catalogue');
eq(ONLY_CALLERS - 1, 2, 'E2c UNRELATED_CALLER_BEHAVIOR_DRIFT_COUNT = 0 — two unscoped callers, both unchanged');

eq(liftList(PAGE, 'IR_FIRST_LAYER_TABLES_').length, 13, 'E3  FIRST_LAYER_TABLE_COUNT = 13');
eq(liftList(PAGE, 'IR_FIRST_LAYER_TABLES_').filter(function (t) { return EXPOSURE6.indexOf(t) !== -1; }), [],
  'E3a and the two layers are still disjoint — no exposure table crept back into the first read');
eq(liftList(G60, 'SIR_EXPOSURE_TABLES_').slice().sort(), liftList(PAGE, 'IR_EXPOSURE_TABLES_').slice().sort(),
  'E3b the server\'s exposure family and the browser\'s are the SAME six — one list, two copies, checked');

// §9 — the client filter is the SECOND boundary now, and removing it was never part of this round.
var DRAFTFN = extractFn(PAGE, '_shippingDraftLinesFor');
ok(/lo\(d\.country\) === lo\(scope\.country\)/.test(DRAFTFN) && /lo\(d\.marketplace\) === lo\(scope\.marketplace\)/.test(DRAFTFN),
  'E4  CLIENT_SCOPE_DEFENSE = YES — the draft scope filter is retained verbatim');
ok(/lineRecv\[ln\.shippingPlanLineId\]/.test(extractFn(PAGE, '_irBuildShipmentRemainingByReceiver')),
  'E4a and so is the lineage attribution the server closure was derived FROM');
ok(/planById\[pl\.shippingPlanId\]/.test(extractFn(PAGE, '_irBuildExposureIndexes_')),
  'E4b which reads the PARENT PLAN, never the line\'s own marketplace — the same rule on both sides');

// §12/§13 — this is a read projection. No write payload may have learned about it.
// The REAL write-payload constructors this page owns, named because §13 names the flows: the Replenishment
// Submit, its canonical commit, the Shipping-Allocation draft payload, the Execution Plan editor that seeds
// the quantities, and the approved-quantity authority. If the deferred exposure model were ever a required
// INPUT to any of them, a read optimisation would have become a business-decision change.
var WRITE_FNS = ['submitReplenishmentPlans', '_replenCanonicalSubmit', '_replenDarBuildPayload',
  'initializeShippingAllocation', '_irSuggestedQtyState_'];
var EXPOSURE_SYMBOLS = ['_irExposureByScope', 'getShipments', 'getShipmentLines', 'getShippingPlans',
  'getShippingPlanLines'];
// A FUNCTION, not a one-off loop, so a mutant can run the SAME detector over mutated source. A census that
// only ever reads the shipped file proves the file is clean and says nothing about the census.
function writePayloadExposureDeps(src) {
  var found = [];
  WRITE_FNS.forEach(function (fn) {
    var body;
    try { body = stripComments(extractFn(src, fn)); } catch (e) { return; }
    EXPOSURE_SYMBOLS.forEach(function (sym) { if (body.indexOf(sym) !== -1) found.push(fn + ':' + sym); });
  });
  return found;
}
eq(writePayloadExposureDeps(PAGE), [], 'E5  EXPOSURE_DEPENDENCY_IN_WRITE_PAYLOAD_COUNT = 0');
eq(WRITE_FNS.filter(function (f) { try { return extractFn(PAGE, f).length > 100; } catch (e) { return false; } }).length,
  WRITE_FNS.length,
  'E5z and every one of them was really located — a census over nothing is not a census');
ok(!/siteScope/.test(stripComments(extractFn(PAGE, '_irSuggestedQtyState_'))),
  'E5a and the approved-quantity authority does not know this round happened');

// §14 — zero writes, from the file that would have to contain them.
['sirWsSiteScope_', 'sirWsSiteScopeClosure_', 'sirWsScopeApplicable_', 'sirWorkspaceBuild_'].forEach(function (fn, i) {
  ok(!/(appendRow|setValue|setValues|deleteRow|insertRow|deleteSheet|insertSheet)/.test(stripComments(extractFn(G60, fn))),
    'E6.' + (i + 1) + ' ' + fn + ' writes nothing — WRITE_TABLE_COUNT = 0, SCHEMA_CHANGES = 0');
});

// PURITY — four suites lift sirWorkspaceBuild_ ALONE, one of them with THREE symbols in scope. An unscoped
// call must therefore never reach a scope helper. This is the regression that killed all four once before.
var thin = new Function('SIR_WORKSPACE_TABLES_', 'sirCap_', 'SIR_WS_ROW_MAX_',
  extractFn(G60, 'sirWorkspaceBuild_') + NL + 'return sirWorkspaceBuild_;')(
  liftList(G60, 'SIR_WORKSPACE_TABLES_'),
  new Function(extractVar(G60, 'SIR_WS_ROW_MAX_') + NL + extractFn(G60, 'sirCap_') + NL + 'return sirCap_;')(),
  new Function(extractVar(G60, 'SIR_WS_ROW_MAX_') + NL + 'return SIR_WS_ROW_MAX_;')());
var thinOut = thin({ shipments: TABLES.shipments }, {});
eq(thinOut.counts.shipments, 4,
  'E7  an UNSCOPED build still runs with nothing but its R4-era helpers in scope — the scope path is guarded, not called');

// §18 — no action was added, so nothing about the action contract moves.
eq((G60.match(/action: 'inventoryReplenishment\.workspace\.get'/g) || []).length, 1,
  'E8  NEW_ACTION_REQUIRED = NO — the scope is an optional payload field on the existing action');
ok(/SYS_DEPLOYED_ACTION_CONTRACT_VERSION_/.test(G63),
  'E8a ACTION_CONTRACT_VERSION_CHANGE_REQUIRED = NO — 63_ bumps it when an ACTION is added or removed, and none was');

// ================================================================================================================
section('F — mutants: every guard above is load-bearing');
// ================================================================================================================
function closureOf(src) { return server(src).closure; }

mut('M1  the DTO drops siteScope again (the exact R4 defect, one field later)', function () {
  var m = mutateFn(FOUND, 'buildInventoryReplenishmentRequestDTO',
    'payload.siteScope = { company: _ssf(\'company\'), country: _ssf(\'country\'), marketplace: _ssf(\'marketplace\') };',
    'void 0;');
  var f = new Function('API_VERSION', 'isObj', 'makeRequestId',
    extractFn(m, 'buildInventoryReplenishmentRequestDTO') + NL + 'return buildInventoryReplenishmentRequestDTO;')(
    '1', function (o) { return !!o && typeof o === 'object'; }, function () { return 'R'; });
  return f({ siteScope: A }).payload.siteScope === undefined;
});
['company', 'country', 'marketplace'].forEach(function (f, i) {
  mut('M' + (2 + i) + '  the DTO drops `' + f + '` from the scope', function () {
    var m = mutateFn(FOUND, 'buildInventoryReplenishmentRequestDTO',
      f + ': _ssf(\'' + f + '\')', f + ': \'\'');
    var g = new Function('API_VERSION', 'isObj', 'makeRequestId',
      extractFn(m, 'buildInventoryReplenishmentRequestDTO') + NL + 'return buildInventoryReplenishmentRequestDTO;')(
      '1', function (o) { return !!o && typeof o === 'object'; }, function () { return 'R'; });
    return g({ siteScope: A }).payload.siteScope[f] === '';
  });
});
mut('M5  an incomplete scope widens to every site instead of refusing', function () {
  // The REALISTIC widening bug: both layers decide an unusable scope is the same thing as no scope, and
  // quietly read everything. It is the one failure that is invisible from the browser, because every extra
  // row looks exactly like real data.
  var m = mutateFn(G60, 'handleInventoryReplenishmentWorkspaceGet_',
    'if (scopeChk && !scopeChk.ok) {', 'if (false) {');
  m = mutateFn(m, 'sirWorkspaceBuild_',
    'var _scopeAsked = (payload.siteScope !== undefined && payload.siteScope !== null);',
    'var _scopeAsked = false;');
  var r;
  try {
    r = call({ only: EXPOSURE6.slice(), siteScope: { company: 'ResUS', country: 'US', marketplace: '' } }, server(m));
  } catch (e) { return false; }
  // Widened: it SUCCEEDED and served a site it was never asked for.
  return r.env.success === true && ids(r.env.data.shipments, 'shipment_id').indexOf('SH-C') !== -1;
});
mut('M6  a simple header filter replaces the lineage closure', function () {
  var m = mutateFn(G60, 'sirWsSiteScopeClosure_',
    'if (keepHdr[id(s2.shipment_id)] || isScope(s2.company, s2.country, s2.marketplace)) shipments.push(srcS[n]);',
    'if (isScope(s2.company, s2.country, s2.marketplace)) shipments.push(srcS[n]);');
  return ids(closureOf(m)(TABLES, A).shipments, 'shipment_id').indexOf('SH-MULTI') === -1;
});
mut('M7  the MULTI header is dropped by filtering shipments on their own marketplace', function () {
  var m = mutateFn(G60, 'sirWsSiteScopeClosure_',
    'var lineage = id(ln.shipping_plan_line_id);',
    'var lineage = "";');
  // Every line now falls back to its header; SH-MULTI is not a specific receiver, so A loses SL-M-A.
  return ids(closureOf(m)(TABLES, A).shipment_lines, 'shipment_line_id').indexOf('SL-M-A') === -1;
});
mut('M8  shipping_plan_lines.marketplace becomes the scope authority', function () {
  var m = mutateFn(G60, 'sirWsSiteScopeClosure_',
    'if (!planIds[id(pl.shipping_plan_id)]) continue;',
    'if (lo(pl.marketplace) !== S_MK) continue;');
  // PL-A2 belongs to plan A but its OWN marketplace is JP-Amazon — the line, and its shipment line, vanish.
  var o = closureOf(m)(TABLES, A);
  return ids(o.shipping_plan_lines, 'shipping_plan_line_id').indexOf('PL-A2') === -1;
});
mut('M9  a present-but-dangling lineage falls back to the header instead of failing closed', function () {
  var m = mutateFn(G60, 'sirWsSiteScopeClosure_',
    'keep = planLineIds[lineage] === true;          // not ours, or dangling -> dropped, never fallen back',
    'keep = planLineIds[lineage] === true || (!!hdrById[id(ln.shipment_id)] && isScope(hdrById[id(ln.shipment_id)].company, hdrById[id(ln.shipment_id)].country, hdrById[id(ln.shipment_id)].marketplace));');
  // SH-MULTI is not specific, so this mutant is caught on the ORDINARY header instead: SL-C1 into A? No —
  // the visible effect is that a C-lineage line on an A header would be admitted. Build that case.
  var T2 = JSON.parse(JSON.stringify(TABLES));
  T2.shipment_lines.push({ shipment_line_id: 'SL-A-X', shipment_id: 'SH-A', sku: 'SKU8', shipping_plan_line_id: 'PL-C1' });
  var shipped = ids(SRV.closure(T2, A).shipment_lines, 'shipment_line_id').indexOf('SL-A-X') === -1;
  var mutated = ids(closureOf(m)(T2, A).shipment_lines, 'shipment_line_id').indexOf('SL-A-X') !== -1;
  return shipped && mutated;
});
mut('M10 a seventh table (marketplaces) is pulled into the exposure family', function () {
  var m = G60.replace(extractVar(G60, 'SIR_EXPOSURE_TABLES_'),
    "var SIR_EXPOSURE_TABLES_ = ['shipments', 'shipment_lines', 'shipping_plans', 'shipping_plan_lines', "
    + "'shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'marketplaces'];");
  return liftList(m, 'SIR_EXPOSURE_TABLES_').length === 7;
});
mut('M11 a Site A row leaks into the Site B response', function () {
  var m = mutateFn(G60, 'sirWsSiteScopeClosure_',
    'if (!isScope(p.company, p.country, p.marketplace)) continue;',
    'if (!isScope(p.company, p.country, p.marketplace) && lo(p.country) !== "us") continue;');
  var o = closureOf(m)(TABLES, B);
  return ids(o.shipping_plans, 'shipping_plan_id').indexOf('P-A') !== -1;
});
mut('M12 the client secondary scope guard is removed', function () {
  var m = mutateFn(PAGE, '_shippingDraftLinesFor',
    'return lo(d.country) === lo(scope.country) && lo(d.marketplace) === lo(scope.marketplace) &&',
    'return true &&');
  return !/lo\(d\.country\) === lo\(scope\.country\)/.test(extractFn(m, '_shippingDraftLinesFor'));
});
mut('M13 a per-SKU request is introduced (the N+1 the cache exists to prevent)', function () {
  var m = mutateFn(PAGE, '_irExposureSite_',
    'return { company: co, country: cy, marketplace: mk };',
    'return { company: co, country: cy, marketplace: mk, sku: (typeof currentExpandedRow !== "undefined" ? currentExpandedRow : "") };');
  return /sku:/.test(extractFn(m, '_irExposureSite_'));
});
mut('M14 the site switch globally clears the cache (US -> CA -> US costs a second US read)', function () {
  var m = mutateFn(PAGE, '_irInvalidateActiveExposure_',
    'return _irInvalidateExposureForKey_(_irExposureScopeKey_());',
    '_irExposureByScope = {}; return true;');
  return /_irExposureByScope = \{\}/.test(extractFn(m, '_irInvalidateActiveExposure_'));
});
mut('M15 the first layer re-adds the exposure tables', function () {
  var six = liftList(PAGE, 'IR_EXPOSURE_TABLES_');
  var m = PAGE.replace(extractVar(PAGE, 'IR_FIRST_LAYER_TABLES_'),
    'var IR_FIRST_LAYER_TABLES_ = ' + JSON.stringify(liftList(PAGE, 'IR_FIRST_LAYER_TABLES_').concat(six)) + ';');
  return liftList(m, 'IR_FIRST_LAYER_TABLES_').length === 19;
});
mut('M16 the write payload begins depending on exposure state', function () {
  // A REAL edit to a REAL write path, scored by the REAL detector: the Execution Plan editor starts reading
  // the lazy exposure map, which is how a read projection silently becomes a write input.
  var m = mutateFn(PAGE, 'initializeShippingAllocation',
    'function initializeShippingAllocation(',
    'function initializeShippingAllocation(');
  m = m.replace(extractFn(PAGE, 'initializeShippingAllocation'),
    extractFn(PAGE, 'initializeShippingAllocation').replace('{', '{' + NL + '    var _leak = _irExposureByScope;'));
  var before = writePayloadExposureDeps(PAGE).length;
  var after = writePayloadExposureDeps(m);
  return before === 0 && after.indexOf('initializeShippingAllocation:_irExposureByScope') !== -1;
});
mut('M17 the scope applicability gate is removed, so a scope rides an unrelated `only`', function () {
  var m = mutateFn(G60, 'handleInventoryReplenishmentWorkspaceGet_',
    'if (scopeChk && scopeChk.ok && !sirWsScopeApplicable_(sirWsOnlyList_(payload))) {', 'if (false) {');
  m = mutateFn(m, 'sirWorkspaceBuild_', 'if (!sirWsScopeApplicable_(onlyList)) {', 'if (false) {');
  var r = call({ only: ['marketplaces', 'sku_details'], siteScope: A }, server(m));
  return r.env.success === true;
});

// ================================================================================================================
section('G — vacuity: every mutation target exists exactly once in the shipped source');
// ================================================================================================================
[['km-api-foundation.js', FOUND, 'buildInventoryReplenishmentRequestDTO',
  "payload.siteScope = { company: _ssf('company'), country: _ssf('country'), marketplace: _ssf('marketplace') };"],
 ['60_.gs', G60, 'handleInventoryReplenishmentWorkspaceGet_', 'if (scopeChk && !scopeChk.ok) {'],
 ['60_.gs', G60, 'sirWorkspaceBuild_', 'if (!_sc || !_sc.ok) {'],
 ['60_.gs', G60, 'sirWsSiteScopeClosure_', 'var lineage = id(ln.shipping_plan_line_id);'],
 ['60_.gs', G60, 'sirWsSiteScopeClosure_', 'if (!planIds[id(pl.shipping_plan_id)]) continue;'],
 ['inventory-replenishment.js', PAGE, '_shippingDraftLinesFor', 'lo(d.country) === lo(scope.country)'],
 ['inventory-replenishment.js', PAGE, '_irExposureSite_', 'return { company: co, country: cy, marketplace: mk };']
].forEach(function (row, i) {
  var body = extractFn(row[1], row[2]);
  var n = body.split(row[3].split(LF).join(NL)).length - 1;
  eq(n, 1, 'G' + (i + 1) + ' ' + row[0] + ' · ' + row[2] + ' — target present exactly once');
});

// ================================================================================================================
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
process.exitCode = fail ? 1 : 0;
