// FC-ID-R1 — SPECIAL EVENT marketplace_id MISSING: root-cause regression contract.
//
// THE FINDING, IN ONE SENTENCE. The Marketplace(site) picker in the Special Event Builder is built from TWO
// sources — the `marketplaces` registry AND `fc_regular_forecast` — while `_evtResolveMarketplaceId` resolves
// the id from the registry ALONE, so any site that exists only in the forecast table is a perfectly normal,
// selectable option whose canonical id resolves to '' and is written blank.
//
// WHY IT IS TESTED THIS WAY. The operator's hypothesis was duplicate display labels ("Amazon" vs "KM Amazon").
// That is disproved here rather than asserted away: the option VALUE is `company|country|marketplace` and the
// resolver filters on all three, so the two never collide. Proving the real cause and disproving the
// suspected one are separate obligations and both are discharged below.
//
// The probes run the REAL page functions, lifted from the shipped source. A restatement of the logic would
// only prove that I can restate it.
//
// NO PRODUCTION WRITE. No sheet, no network, no DB. Fixtures only.
//
// Run: node assets/tests/fc-id-r1-special-event-marketplace-id.test.js

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

// Lift a named function out of the shipped page by brace matching. `new Function` evaluates in global scope,
// so the helpers it calls are published on `global` below — the real ones, lifted the same way.
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

// ---- the world the page reads ---------------------------------------------------------------------------
// CA / Amazon exists in fc_regular_forecast but NOT in the marketplaces registry. UK / Amazon exists in both.
// Everything else is identical between them, so the only variable is registry membership.
var MARKETPLACES = [
  { marketplaceId: 'MKT-UK-AMZ', company: 'ResUS', country: 'UK', marketplace: 'Amazon',
    marketplaceDisplayName: 'Amazon', status: 'active' },
  { marketplaceId: 'MKT-UK-KMAMZ', company: 'KM', country: 'UK', marketplace: 'Amazon',
    marketplaceDisplayName: 'KM Amazon', status: 'active' },
  { marketplaceId: 'MKT-US-AMZ', company: 'ResUS', country: 'US', marketplace: 'Amazon',
    marketplaceDisplayName: 'Amazon', status: 'active' }
];
var REGULAR_FC = [
  { company: 'ResUS', country: 'CA', marketplace: 'Amazon', sku: 'KM-1', year: 2026 },   // <- registry has no CA row
  { company: 'ResUS', country: 'UK', marketplace: 'Amazon', sku: 'KM-1', year: 2026 }
];

// A live-mode window: `KM` exists but carries no demo namespace, so the page's own demo switch reads falsy
// and `_fcRegularSiteOptions` takes the live branch. (Deliberately not naming the retired demo runtime —
// `demo-mode-retired-f1-small` D8 forbids a test file from mentioning it, and the point of that rule is that
// nothing references it, not that references are spelled cleverly enough to pass.)
global.window = { KM: {} };
global._fcGetMarketplaces = function () { return MARKETPLACES; };
global._fcGetRegularForecast = function () { return REGULAR_FC; };
global._fcResolveMarketplaceKey = extractFn(PAGE, '_fcResolveMarketplaceKey');
global._fcMarketplaceLabel = extractFn(PAGE, '_fcMarketplaceLabel');
global.fcRegularMock = [];

/* FC-ID-R2 — the mapping moved into `_evtMarketplaceIdentity_` and `_evtResolveMarketplaceId` is now the
   string face of it. The MECHANISM this suite proves is unchanged, so nothing below is rewritten; the lift
   simply follows the implementation. Readiness is stubbed TRUE here because this suite's subject is the
   LOOKUP (the picker offers a site the registry cannot answer for) — readiness is FC-ID-R1B's subject, and
   that suite lifts the real predicate. */
global.FC_ID_ = (function () { var m = /var FC_ID_ = (\{[\s\S]*?\});/.exec(PAGE); return eval('(' + m[1] + ')'); })();
global._fcRegistrySourceReady_ = function () { return true; };
global._evtMarketplaceIdentity_ = extractFn(PAGE, '_evtMarketplaceIdentity_');

var resolveMarketplaceId = extractFn(PAGE, '_evtResolveMarketplaceId');
var siteOptions = extractFn(PAGE, '_fcRegularSiteOptions');

// =========================================================================================================
section('A. the picker is wider than the registry — that is the defect');
// =========================================================================================================

var caOptions = siteOptions('CA');
eq(caOptions.length, 1, 'A1 CA offers exactly one Marketplace option');
eq(caOptions[0].value, 'ResUS|CA|Amazon', 'A2 its value is the full site identity company|country|marketplace');
eq(caOptions[0].label, 'Amazon',
  'A3 and it is LABELLED "Amazon" — indistinguishable from a registry-backed option');
ok(MARKETPLACES.filter(function (m) { return m.country === 'CA'; }).length === 0,
  'A4 yet the registry contains no CA row at all — the option came from fc_regular_forecast');

var ukOptions = siteOptions('UK');
eq(ukOptions.map(function (o) { return o.value; }).sort(), ['KM|UK|Amazon', 'ResUS|UK|Amazon'],
  'A5 UK offers both registry sites, kept distinct by company');

// =========================================================================================================
section('B. the id resolver consults the registry ALONE');
// =========================================================================================================

eq(resolveMarketplaceId({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' }), '',
  'B1 CASE A — CA / Amazon resolves to BLANK, which is what gets written');
eq(resolveMarketplaceId({ company: 'ResUS', country: 'UK', marketplace: 'Amazon' }), 'MKT-UK-AMZ',
  'B2 CASE B — UK / Amazon resolves normally. The control holds.');
eq(resolveMarketplaceId({ company: 'KM', country: 'UK', marketplace: 'Amazon' }), 'MKT-UK-KMAMZ',
  'B3 UK / KM Amazon resolves to its OWN id — company is part of the lookup');

// The same asymmetry stated as the one fact that differs between Case A and Case B.
ok(siteOptions('CA').length === 1 && resolveMarketplaceId({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' }) === '',
  'B4 FIRST_BOUNDARY_WHERE_CA_MARKETPLACE_ID_IS_LOST = _evtResolveMarketplaceId (selectable, unresolvable)');

// =========================================================================================================
section('C. the operator\'s hypothesis, tested and DISPROVED');
// =========================================================================================================

// "Amazon" and "KM Amazon" share a canonical marketplace key — and that is deliberate and harmless, because
// nothing keys on the name alone.
eq(global._fcResolveMarketplaceKey('KM Amazon'), 'Amazon',
  'C1 the display name "KM Amazon" maps to the canonical key "Amazon" — the names DO share a key');
var idsForUkAmazonKey = ukOptions.map(function (o) {
  var p = o.value.split('|');
  return resolveMarketplaceId({ company: p[0], country: p[1], marketplace: p[2] });
}).sort();
eq(idsForUkAmazonKey, ['MKT-UK-AMZ', 'MKT-UK-KMAMZ'],
  'C2 …and they still resolve to two DIFFERENT ids, because company disambiguates them');
ok(idsForUkAmazonKey[0] !== idsForUkAmazonKey[1],
  'C3 AMAZON_KM_AMAZON_COLLISION = NO — duplicate-style display naming is NOT the cause');

// If a CA registry row existed, CA would behave exactly like UK. That isolates the variable to master data.
var SAVED = MARKETPLACES.slice();
MARKETPLACES.push({ marketplaceId: 'MKT-CA-AMZ', company: 'ResUS', country: 'CA', marketplace: 'Amazon',
  marketplaceDisplayName: 'Amazon', status: 'active' });
eq(resolveMarketplaceId({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' }), 'MKT-CA-AMZ',
  'C4 add the missing registry row and CA resolves normally — the code path is not CA-specific');
MARKETPLACES.length = 0; SAVED.forEach(function (m) { MARKETPLACES.push(m); });
eq(resolveMarketplaceId({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' }), '',
  'C5 fixture restored');

// A company that does not match is the OTHER way to reach a blank, and it matters for the repair proposal:
// the registry row may exist under a different company than fc_regular_forecast carries.
eq(resolveMarketplaceId({ company: 'KM', country: 'US', marketplace: 'Amazon' }), '',
  'C6 a company mismatch against an existing country+marketplace row ALSO yields blank');

// =========================================================================================================
section('D. nothing downstream repairs it — client sends blank, server writes blank');
// =========================================================================================================

function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
var FCWC = code(FCW);

ok(/marketplace_id:\s*marketplaceId/.test(code(PAGE)),
  'D1 CLIENT_SENDS_MARKETPLACE_ID = YES — always as a property, blank or not');
/* FC-ID-R2 — SHARPENED, NOT WEAKENED. This asserted "14_ never opens the marketplaces registry", which was a
   sound PROXY for "the server does not derive an id" only while no read existed at all. R2 gives 14_ a read
   for the opposite purpose: it VALIDATES a claimed id against the registry and refuses a blank one. So the
   proxy has to be replaced by the invariant it stood for, or it would fail on a change that strengthens the
   very property it was defending. Derivation means going FROM the triple TO an id; that is what stays absent. */
ok(!/function\s+\w*[Rr]esolveMarketplaceId\w*\s*\(/.test(FCWC),
  'D2 SERVER_DERIVES_MARKETPLACE_ID = NO — 14_ declares no id resolver');
var VALSRC = (function () {
  var i = FCWC.indexOf('function fcSeValidateMarketplaceIdentity_');
  if (i < 0) return '';
  var j = FCWC.indexOf('\nfunction ', i + 10);
  return FCWC.slice(i, j < 0 ? FCWC.length : j);
})();
ok(VALSRC && !/\)\s*\[0\]/.test(VALSRC),
  'D2a and its validator indexes no lookup result — it verifies a claim rather than choosing a row');
ok(/idx\.byId\[fcSeMktUp_\(claimed\)\]/.test(FCWC),
  'D2b the only registry access is BY THE CLAIMED ID — a direction that can verify but cannot derive');
ok(/headers\.forEach\(function \(h\) \{ if \(body\.hasOwnProperty\(h\)\)/.test(FCWC.replace(/\s+/g, ' ')) ||
   /body\.hasOwnProperty\(h\)/.test(FCWC),
  'D3 the write copies whatever the body carries — a blank is written as a blank');
ok(/'company', 'country', 'marketplace', 'marketplace_id'/.test(FCW),
  'D4 marketplace_id is a real column in the canonical header, not an accident');

// BLANK_MARKETPLACE_ID_REACHABLE, stated as the exact reachable condition rather than as a yes.
ok(resolveMarketplaceId({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' }) === '' &&
   /marketplace_id:\s*marketplaceId/.test(code(PAGE)),
  'D5 BLANK_MARKETPLACE_ID_REACHABLE = YES — selected site absent from the registry, on both create and update');

// The blast radius, bounded: the business-key fallback SKIPS a blank rather than matching on it.
ok(/if \(mkid && iMkId !== -1 && fcEvtUp_\(r\[iMkId\]\) !== mkid\) continue;/.test(FCWC.replace(/\s+/g, ' ')),
  'D6 the business-key fallback guards on `mkid &&`, so a blank degrades the key rather than mis-matching');

// =========================================================================================================
section('E. mutation — each claim can actually fail');
// =========================================================================================================

mut('E1 the picker stops sourcing options from fc_regular_forecast', function () {
  var before = siteOptions('CA').length;
  var saved = global._fcGetRegularForecast;
  global._fcGetRegularForecast = function () { return []; };
  var after = siteOptions('CA').length;
  global._fcGetRegularForecast = saved;
  return before === 1 && after === 0;
});

/* FC-ID-R2 — re-anchored onto the filter's new home. The invariant is the one this suite always defended
   and the one FC-ID-R2 §10 requires: company and country are part of the identity comparison, and dropping
   either lets one site adopt another's canonical id. Only the anchor text moved. */
mut('E2 the resolver stops filtering on company', function () {
  var src = PAGE.replace('up(x.company) === up(site.company) && up(x.country) === up(site.country) &&',
    'up(x.country) === up(site.country) &&');
  if (src === PAGE) throw new Error('E2 anchor drifted');
  var mutated = extractFn(src, '_evtMarketplaceIdentity_');
  // With company ignored, KM/US/Amazon wrongly resolves to ResUS's US row.
  var m = mutated({ company: 'KM', country: 'US', marketplace: 'Amazon' });
  var real = _evtMarketplaceIdentity_({ company: 'KM', country: 'US', marketplace: 'Amazon' });
  return m.marketplaceId === 'MKT-US-AMZ' && m.state === FC_ID_.READY_UNIQUE &&
    real.marketplaceId === '' && real.state === FC_ID_.NO_MATCH;
});

mut('E3 the resolver stops filtering on country', function () {
  var src = PAGE.replace('up(x.company) === up(site.company) && up(x.country) === up(site.country) &&',
    'up(x.company) === up(site.company) &&');
  if (src === PAGE) throw new Error('E3 anchor drifted');
  var mutated = extractFn(src, '_evtMarketplaceIdentity_');
  /* THIS PROBE IS KILLED ON THE CLASSIFICATION, NOT ON THE ID, AND THAT IS THE POINT OF R2.
     Before R2 the mutant produced a WRONG id (`[0]` of two ResUS/Amazon rows). Now dropping country makes
     the lookup AMBIGUOUS, so both the real code and the mutant return a blank id and a string comparison
     could not tell them apart — exactly the collapse this round removed. The state does tell them apart:
     the real answer is "no such site" and the mutant's is "two sites match", which are different facts. */
  var m = mutated({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' });
  var real = _evtMarketplaceIdentity_({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' });
  return m.state === FC_ID_.AMBIGUOUS && m.matchCount === 2 &&
    real.state === FC_ID_.NO_MATCH && real.matchCount === 0 &&
    m.marketplaceId === '' && real.marketplaceId === '';
});

mut('E4 the site option loses its company component', function () {
  var src = PAGE.replace("value: company + '|' + ctry + '|' + mkt,", "value: ctry + '|' + mkt,");
  if (src === PAGE) throw new Error('E4 anchor drifted');
  var mutated = extractFn(src, '_fcRegularSiteOptions');
  var vals = mutated('UK').map(function (o) { return o.value; });
  // Amazon and KM Amazon would become indistinguishable to _evtSelectedSite's 3-part split.
  return vals.every(function (v) { return v.split('|').length === 2; }) &&
    ukOptions.every(function (o) { return o.value.split('|').length === 3; });
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('FC-ID-R1 SPECIAL EVENT marketplace_id — ' + pass + ' passed / ' + fail + ' failed');
console.log('mutants: ' + neg.caught + ' caught / ' + (neg.caught + neg.missed) + ' planted');
if (fail === 0) {
  console.log('ROOT_CAUSE = A — marketplace master data missing for the selected site');
  console.log('FIRST_BAD_BOUNDARY = _fcRegularSiteOptions offers a site _evtResolveMarketplaceId cannot resolve');
  console.log('AMAZON_KM_AMAZON_COLLISION = NO   CLIENT_SENDS_MARKETPLACE_ID = YES (blank)');
  console.log('SERVER_DERIVES_MARKETPLACE_ID = NO   BLANK_MARKETPLACE_ID_REACHABLE = YES');
  console.log('PRODUCTION_ROWS_WRITTEN = 0   S6_BEHAVIOR_CHANGED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
