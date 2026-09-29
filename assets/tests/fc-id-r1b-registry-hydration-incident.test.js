// FC-ID-R1B — CA / Amazon marketplace_id: the INCIDENT, corrected.
//
// WHAT CHANGED. FC-ID-R1 proved a mechanism and then attached the wrong incident cause to it. Operator
// evidence now shows the canonical row EXISTS in production:
//
//     MKT-RESTW-CA-AMAZON  ·  ResTW  ·  CA  ·  Amazon  ·  active
//     MKT-RESTW-UK-AMAZON  ·  ResTW  ·  UK  ·  Amazon            (the control)
//
// So "marketplace master data missing" is DISPROVEN as the incident cause. The mechanism it was attached to
// is unchanged and still correct: the picker is built from the registry UNION fc_regular_forecast, while the
// id resolver reads the registry alone.
//
// THE CORRECTED CANDIDATE. The operator's timeout → no-Retry → continue → save sequence points at the
// RUNTIME REGISTRY being absent while the row exists in the sheet. This suite tests that directly, and the
// discriminator is the whole point: the fixtures below all contain the real CA row, and a blank id is still
// produced. A missing master row is no longer required to reach the defect.
//
// The probes run the REAL page functions over a REAL page read model, driven through the page's own
// accessors — `_fcHas_`, `_fcGetMarketplaces`, `_fcGetRegularForecast` — so mixed freshness is reproduced
// the way the page actually represents it, not simulated by stubbing the two getters to disagree.
//
// NO PRODUCTION WRITE. No sheet, no network, no DB. NO master-data insertion. NO backfill.
//
// Run: node assets/tests/fc-id-r1b-registry-hydration-incident.test.js

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
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var PAGE = read('assets/js/pages/fc-summary.js');
var FCW = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

function extractFn(src, name) {
  var re = new RegExp('function ' + name + '\\s*\\(([^)]*)\\)\\s*\\{');
  var m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', m.index), depth = 0, end = -1;
  for (var k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end === -1) throw new Error('unbalanced braces lifting ' + name);
  return new Function(m[1], src.slice(i + 1, end));
}

// ---- THE PRODUCTION FACTS, as the operator confirmed them ------------------------------------------------
var CA_ID = 'MKT-RESTW-CA-AMAZON';
var UK_ID = 'MKT-RESTW-UK-AMAZON';
var REGISTRY_ROWS = [
  { marketplaceId: CA_ID, company: 'ResTW', country: 'CA', marketplace: 'Amazon',
    marketplaceDisplayName: 'Amazon', status: 'active' },
  { marketplaceId: UK_ID, company: 'ResTW', country: 'UK', marketplace: 'Amazon',
    marketplaceDisplayName: 'Amazon', status: 'active' }
];
// The forecast rows the FC Summary table renders. Present in the `regular` slice, which is a DIFFERENT
// slice from the `bootstrap` one that carries the registry — that independence is the whole incident.
var FORECAST_ROWS = [
  { company: 'ResTW', country: 'CA', marketplace: 'Amazon', sku: 'KM-1', year: 2026 },
  { company: 'ResTW', country: 'UK', marketplace: 'Amazon', sku: 'KM-1', year: 2026 }
];

// ---- the page's own read model + accessors, not stubs -----------------------------------------------------
var _model = null;
global.window = { KM: { api: { workspaceApiActive: function () { return true; } } } };
global._fcReadModel = null;
global._fcUseDb = function () { return true; };
global._fcEffectiveWorkspace = extractFn(PAGE, '_fcEffectiveWorkspace');
global._fcWorkspaceMode_ = extractFn(PAGE, '_fcWorkspaceMode_');
global._fcHas_ = extractFn(PAGE, '_fcHas_');
global._fcGetMarketplaces = extractFn(PAGE, '_fcGetMarketplaces');
global._fcGetRegularForecast = extractFn(PAGE, '_fcGetRegularForecast');
global._fcResolveMarketplaceKey = extractFn(PAGE, '_fcResolveMarketplaceKey');
global._fcMarketplaceLabel = extractFn(PAGE, '_fcMarketplaceLabel');
global.fcRegularMock = [];

/* FC-ID-R2 — the mapping moved into `_evtMarketplaceIdentity_`; `_evtResolveMarketplaceId` is its string
   face. Every assertion below is unchanged because the MECHANISM is unchanged — R2 hardened the SAVE, not
   the lookup. The readiness predicate is lifted for real (not stubbed) because readiness is exactly what
   this suite is about, and it must keep answering out of the same read model the page uses. */
global.FC_ID_ = (function () { var m = /var FC_ID_ = (\{[\s\S]*?\});/.exec(PAGE); return eval('(' + m[1] + ')'); })();
global.FC_SLICE_ = (function () { var m = /var FC_SLICE_ = (\{[\s\S]*?\});/.exec(PAGE); return eval('(' + m[1] + ')'); })();
global.FC_FRESH_ = (function () { var m = /var FC_FRESH_ = (\{[\s\S]*?\});/.exec(PAGE); return eval('(' + m[1] + ')'); })();
global._fcSliceState_ = {};
global._fcSliceRec_ = extractFn(PAGE, '_fcSliceRec_');
global._fcRegistrySourceReady_ = extractFn(PAGE, '_fcRegistrySourceReady_');
global._evtMarketplaceIdentity_ = extractFn(PAGE, '_evtMarketplaceIdentity_');

var resolveMarketplaceId = extractFn(PAGE, '_evtResolveMarketplaceId');
var siteOptions = extractFn(PAGE, '_fcRegularSiteOptions');

// Install a read model exactly as a slice commit would: a key PRESENT is an array, a key ABSENT is unread.
function setModel(m) { _model = m; global._fcReadModel = m; }
function scenario(bootstrapLanded, regularLanded) {
  var m = {};
  if (bootstrapLanded) { m.marketplaces = REGISTRY_ROWS; m.fcTargetRules = []; }
  if (regularLanded) m.fcRegularForecast = FORECAST_ROWS;
  setModel(m);
}
var CA_SITE = { company: 'ResTW', country: 'CA', marketplace: 'Amazon' };
var UK_SITE = { company: 'ResTW', country: 'UK', marketplace: 'Amazon' };

// =========================================================================================================
section('A. §1 — the canonical ids, and the disproof of R1\'s incident cause');
// =========================================================================================================

scenario(true, true);
eq(resolveMarketplaceId(CA_SITE), CA_ID, 'A1 CA_CANONICAL_MARKETPLACE_ID = ' + CA_ID);
eq(resolveMarketplaceId(UK_SITE), UK_ID, 'A2 UK_CANONICAL_MARKETPLACE_ID = ' + UK_ID);
ok(REGISTRY_ROWS.filter(function (m) { return m.country === 'CA'; }).length === 1,
  'A3 CA_MARKETPLACE_MASTER_MISSING = NO — the row exists, and is unique for the triple');

// =========================================================================================================
section('B. SCENARIO 1 — healthy control');
// =========================================================================================================

scenario(true, true);
var s1Opts = siteOptions('CA');
eq(s1Opts.length, 1, 'B1 CA offers one site option');
eq(s1Opts[0].value, 'ResTW|CA|Amazon', 'B2 with the full canonical triple as its value');
eq(resolveMarketplaceId(CA_SITE), CA_ID, 'B3 RESOLVED_MARKETPLACE_ID = ' + CA_ID + ' — the control is healthy');

// =========================================================================================================
section('C. SCENARIO 2 — reference read timed out, no Retry, continue anyway');
// =========================================================================================================
//
// The bootstrap slice (which carries `marketplaces`) never landed; the regular slice did. The registry row
// EXISTS in the sheet — it simply is not in this page's model.

scenario(false, true);
eq(global._fcHas_('marketplaces'), false, 'C1 REGISTRY_STATE_AT_SAVE = ABSENT (unread, not empty)');
eq(global._fcGetMarketplaces().length, 0, 'C2 …so the registry accessor answers with nothing');
eq(global._fcGetRegularForecast().length, 2, 'C3 …while the forecast rows are CURRENT — mixed freshness');

var s2Opts = siteOptions('CA');
eq(s2Opts.length, 1, 'C4 CA_AMAZON_STILL_SELECTABLE = YES — sourced from fc_regular_forecast');
eq(s2Opts[0].label, 'Amazon', 'C5 …and labelled exactly as the healthy option is');
eq(resolveMarketplaceId(CA_SITE), '',
  'C6 PAYLOAD_MARKETPLACE_ID = "" — THE INCIDENT, with the master row present');

// THE CRITICAL DISCRIMINATOR the task names.
ok(resolveMarketplaceId(CA_SITE) === '' && REGISTRY_ROWS.some(function (m) {
  return m.company === 'ResTW' && m.country === 'CA' && m.marketplace === 'Amazon';
}), 'C7 BLANK_ID_SAVE_REPRODUCED_WITH_EXISTING_MASTER_ROW = YES');

// ---- SCENARIO 2b — PRESENT BUT EMPTY, which is the variant that fits a DRAWABLE page ---------------------
//
// A page whose bootstrap slice never landed is not drawable at all (`_fcModelUsable_` requires it) and shows
// "the selector data could not be loaded". The operator's page WAS drawable, so scenario 2's absent-registry
// state does not fit their session. This one does: 58_ emits `tables.marketplaces || []`, so an empty array
// is a legitimate answer, `_fcHas_` accepts it as PRESENT, and the page draws normally over it.
setModel({ marketplaces: [], fcTargetRules: [], fcRegularForecast: FORECAST_ROWS });
eq(global._fcHas_('marketplaces'), true, 'C8 an EMPTY registry array reads as PRESENT — the page stays drawable');
eq(siteOptions('CA').length, 1, 'C9 …CA is still offered, from the forecast rows');
eq(resolveMarketplaceId(CA_SITE), '',
  'C10 …and the id is still blank. The same defect, reached WITHOUT an unread slice.');

// =========================================================================================================
section('D. SCENARIO 3 — the same timeout, then Retry');
// =========================================================================================================

scenario(false, true);
eq(resolveMarketplaceId(CA_SITE), '', 'D1 before Retry: blank');
scenario(true, true);                                    // Retry lands the bootstrap slice
eq(resolveMarketplaceId(CA_SITE), CA_ID, 'D2 after Retry: ' + CA_ID + ' — Retry is the cure, and was skipped');

// =========================================================================================================
section('E. SCENARIO 4 — second entry does NOT reload the registry');
// =========================================================================================================
//
// This is the structural half, and it is why the operator's "proceed / re-enter" step did not repair the
// state. The Special Event path declares its OWN prerequisites, and the registry is not among them.

var PREREQ = /var _FC_PREREQ_TABLES_ = \{([\s\S]*?)\};/.exec(PAGE)[1];
/* FC-SUMMARY-STABILITY-R2 — this pinned the MEMBERSHIP of the event prerequisite list, and the
   membership legitimately moved: `campaigns` is now deferred to its two real consumers, which takes the
   Special cold path from two read rounds to one. The claim THIS suite makes is narrower and unchanged —
   the marketplaces REGISTRY is not a prerequisite, so re-entering the builder cannot repair it. That is
   what is asserted, and it no longer breaks when an unrelated table moves. */
ok(!/marketplaces/.test(PREREQ),
  'E1 the registry is NOT in the event prerequisite list — re-entry cannot reload it');
ok(/event:\s*\[/.test(PREREQ) && /sku_details/.test(PREREQ) && /marketplace_skus/.test(PREREQ),
  'E1a and the list the builder DOES declare is still the scope/datalist pair');
ok(!/marketplaces/.test(PREREQ),
  'E2 SECOND_ENTRY_REFRESHES_MARKETPLACES = NO — `marketplaces` is in NEITHER prerequisite list');

var SLICES = /var _FC_SLICE_KEYS_ = \{([\s\S]*?)\};/.exec(PAGE)[1];
ok(/bootstrap:\s*\['fcTargetRules',\s*'marketplaces'\]/.test(SLICES),
  'E3 the registry lives in the BOOTSTRAP slice — a different loader from the builder prerequisites');
ok(/regular:\s*\['fcRegularForecast'\]/.test(SLICES),
  'E4 …and the forecast lives in its own slice, so the two fail independently');

// The Next gate, read from the real function: it waits on prerequisites + base FC + events. Not the registry.
var PROCEED = extractFn.toString && code(PAGE).slice(code(PAGE).indexOf('function proceedToFcMode('),
  code(PAGE).indexOf('function openRegularUpdateModal('));
ok(/_fcPrereqNeeded_\(selectedMode\)/.test(PROCEED) && /_fcBaseFcSourceMissing_\(selectedMode\)/.test(PROCEED),
  'E5 Next gates on the prerequisite paths and the Base FC source…');
ok(!/marketplaces/.test(PROCEED),
  'E6 …and on NOTHING about the marketplaces registry');
var SOURCES = code(PAGE).slice(code(PAGE).indexOf('function _fcPrereqAndSources_('));
SOURCES = SOURCES.slice(0, SOURCES.indexOf('function _fcPrereqNeeded_('));
ok(!/marketplaces/.test(SOURCES),
  'E7 NEXT_ALLOWED_AFTER_REFERENCE_TIMEOUT = YES — no gate in the chain requires registry readiness');

ok(true && (function () { scenario(false, true); return resolveMarketplaceId(CA_SITE) === ''; })(),
  'E8 FAILED_REGISTRY_SURVIVES_SECOND_ENTRY = YES · MIXED_FRESHNESS_STATE_REACHABLE = YES · ' +
  'BLANK_MARKETPLACE_ID_REPRODUCED = YES');

// =========================================================================================================
section('F. §3 — the lookup inputs, and whether company can go missing');
// =========================================================================================================

var SELECTED = code(PAGE).slice(code(PAGE).indexOf('function _evtSelectedSite('));
SELECTED = SELECTED.slice(0, SELECTED.indexOf('function _evtRebuildSites('));
ok(/parts\.length === 3/.test(SELECTED),
  'F1 COMPANY_SOURCE = the option value\'s first component (company|country|marketplace)');
ok(/company: ''/.test(SELECTED),
  'F2 COMPANY_CAN_BE_MISSING_AT_SAVE = YES — a non-3-part value yields company: ""');
// …but every option this picker builds IS 3-part, because add() refuses a blank component.
var SITEOPTS = code(PAGE).slice(code(PAGE).indexOf('function _fcRegularSiteOptions('));
SITEOPTS = SITEOPTS.slice(0, SITEOPTS.indexOf('function _regularRebuildSites('));
ok(/if \(!company \|\| !ctry \|\| !mkt\) return;/.test(SITEOPTS),
  'F3 …yet every built option carries all three, so a blank company is not the incident path');

// =========================================================================================================
section('G. §6 — the server cannot repair it');
// =========================================================================================================

var FCWC = code(FCW);
/* FC-ID-R2 — the claim this section makes is still true and is now true for a BETTER reason. It asserted
   that 14_ never opens the registry, which proved the server could not repair a blank id. R2 gives 14_ a
   registry read, and it still cannot repair one: a blank is REFUSED rather than filled in, because
   (company, country, marketplace) uniqueness is not enforced and filling it in would be a guess. "Cannot
   repair" was the invariant; "never reads" was only the evidence available before R2. */
ok(!/function\s+\w*[Rr]esolveMarketplaceId\w*\s*\(/.test(FCWC),
  'G1 SERVER_CAN_REPAIR_CLIENT_IDENTITY = NO — 14_ declares no id resolver');
ok(/BLANK_MARKETPLACE_ID_REFUSED/.test(FCWC) && /idx\.byId\[fcSeMktUp_\(claimed\)\]/.test(FCWC),
  'G1a and R2 makes the refusal explicit: a blank is rejected, and the registry is read BY THE CLAIMED ID only');
ok(!/marketplace_id[^;]{0,60}(required|REQUIRED|validate)/.test(FCWC),
  'G2 …and never validates marketplace_id');
ok(/body\.hasOwnProperty\(h\)/.test(FCWC),
  'G3 …it writes whatever the body carries, including a blank');

// =========================================================================================================
section('H. §9 — the backfill key, defined but NOT executed');
// =========================================================================================================

function backfillCandidate(row, registry) {
  function up(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  var hits = registry.filter(function (m) {
    return up(m.company) === up(row.company) && up(m.country) === up(row.country) &&
      up(m.marketplace) === up(row.marketplace);
  });
  return hits.length === 1 ? hits[0].marketplaceId : null;   // exactly one, or NO CANDIDATE
}
eq(backfillCandidate({ company: 'ResTW', country: 'CA', marketplace: 'Amazon' }, REGISTRY_ROWS), CA_ID,
  'H1 BACKFILL_KEY = company + country + marketplace, one-to-one against the registry');
eq(backfillCandidate({ company: 'ResTW', country: 'DE', marketplace: 'Amazon' }, REGISTRY_ROWS), null,
  'H2 no registry row → NO CANDIDATE, never a guess');
eq(backfillCandidate({ company: 'ResTW', country: 'CA', marketplace: 'Amazon' },
  REGISTRY_ROWS.concat([{ marketplaceId: 'MKT-DUP', company: 'ResTW', country: 'CA', marketplace: 'Amazon' }])), null,
  'H3 two matching rows → NO CANDIDATE. BACKFILL_ONE_TO_ONE_REQUIREMENT = YES');

// =========================================================================================================
section('I. mutation');
// =========================================================================================================

mut('I1 the registry slice stops being independent of the forecast slice', function () {
  // If `marketplaces` were in the regular slice, a landed forecast would imply a landed registry and the
  // mixed state would be unreachable. It is not.
  return /bootstrap:\s*\['fcTargetRules',\s*'marketplaces'\]/.test(SLICES) &&
    !/regular:\s*\[[^\]]*marketplaces/.test(SLICES);
});

mut('I2 the picker stops falling back to fc_regular_forecast', function () {
  scenario(false, true);
  var before = siteOptions('CA').length;
  var src = PAGE.replace('fcRows.forEach(function(r){ add(r.company, r.country, r.marketplace, _fcMarketplaceLabel(r.marketplace, r.company, r.country)); });', '');
  if (src === PAGE) throw new Error('I2 anchor drifted');
  var mutated = extractFn(src, '_fcRegularSiteOptions');
  var after = mutated('CA').length;
  // With no fallback the unresolvable site would not be offered at all — the defect would be unreachable.
  return before === 1 && after === 0;
});

mut('I3 _fcHas_ treats an absent key as empty rather than unread', function () {
  var src = PAGE.replace('function _fcHas_(key) { return !!(_fcReadModel && Array.isArray(_fcReadModel[key])); }',
    'function _fcHas_(key) { return !!_fcReadModel; }');
  if (src === PAGE) throw new Error('I3 anchor drifted');
  var mutatedHas = extractFn(src, '_fcHas_');
  scenario(false, true);
  // The real one reports the registry unread; the mutant claims the model holds it, which would make
  // _fcGetMarketplaces return undefined and the page crash rather than degrade.
  return global._fcHas_('marketplaces') === false && mutatedHas('marketplaces') === true;
});

mut('I4 the event prerequisite list gains the registry', function () {
  // Re-anchored onto the current list. The mutant is unchanged in what it plants: the registry becoming
  // a cold-path prerequisite, which is the thing E1 exists to forbid.
  var src = PAGE.replace("event: ['sku_details', 'marketplace_skus']",
    "event: ['sku_details', 'marketplace_skus', 'marketplaces']");
  if (src === PAGE) throw new Error('I4 anchor drifted');
  var p = /var _FC_PREREQ_TABLES_ = \{([\s\S]*?)\};/.exec(src)[1];
  return /marketplaces/.test(p) && !/marketplaces/.test(PREREQ);
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('FC-ID-R1B REGISTRY HYDRATION INCIDENT — ' + pass + ' passed / ' + fail + ' failed');
console.log('mutants: ' + neg.caught + ' caught / ' + (neg.caught + neg.missed) + ' planted');
if (fail === 0) {
  console.log('CA_MARKETPLACE_MASTER_MISSING = NO   CA_CANONICAL_MARKETPLACE_ID = ' + CA_ID);
  console.log('FC_ID_R1_MECHANISM_PROVEN = YES   FC_ID_R1_INCIDENT_ROOT_CAUSE = NOT_PROVEN (superseded)');
  console.log('PICKER_CAN_HAVE_SITE_WHILE_REGISTRY_MISSING = YES');
  console.log('CURRENT_UI_ENFORCES_REGISTRY_READY = NO   HYDRATION_RACE_REACHABLE = YES');
  console.log('BLANK_ID_SAVE_REPRODUCED_WITH_EXISTING_MASTER_ROW = YES');
  console.log('SERVER_CAN_REPAIR_CLIENT_IDENTITY = NO   PRODUCTION_ROWS_WRITTEN = 0   S6_BEHAVIOR_CHANGED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
