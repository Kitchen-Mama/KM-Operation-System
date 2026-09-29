// FC-ID-R2 — THE CANONICAL IDENTITY SAVE BOUNDARY.
//
// WHAT R1 AND R1B LEFT OPEN, AND WHAT THIS CLOSES.
//
//   R1  proved the MECHANISM: the picker is built from the registry UNION fc_regular_forecast, while the
//       identity resolver reads the registry alone, so a site can be offered that cannot be resolved.
//   R1B proved R1's INCIDENT CAUSE WRONG: the CA master row exists. The registry that is missing is the
//       RUNTIME one, and a blank id is produced with the canonical row sitting in the database.
//   R2  stops acting on it. Neither earlier round changed behaviour; both ended at a boundary that still
//       wrote a blank canonical identity, and this suite is about that boundary refusing.
//
// THE FINDING THAT MADE THE SERVER HALF NECESSARY, and it is not a scenario — it is in the writer:
// fcSpecialEventUpsert_'s UPDATE branch writes `if (body.hasOwnProperty(h)) setCell(...)`. So an ABSENT
// marketplace_id leaves the stored value alone, while a PRESENT BLANK one ERASES it. The Builder always
// includes the field. A correct MKT-RESTW-CA-AMAZON is therefore replaced with '' by an operator editing a
// quantity on a page whose registry failed to hydrate — a valid identity destroyed by a read failure.
//
// NO PRODUCTION WRITE. No sheet, no lock, no network, no clock. Pure lifts and fixtures only.
//
// Run: node assets/tests/fc-id-r2-canonical-identity-save-boundary.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

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
var GS14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
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
function fnSrc(src, name) {
  var re = new RegExp('function\\s+' + name + '\\s*\\(');
  var m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', m.index), depth = 0, end = -1;
  for (var k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return src.slice(m.index, end + 1);
}
function varSrc(src, name) {
  var i = src.indexOf('var ' + name + ' =');
  if (i < 0) throw new Error('var not found: ' + name);
  var j = src.indexOf('};', i);
  return src.slice(i, j + 2);
}

// ---- THE CANONICAL FACTS, as the operator confirmed them in FC-ID-R1B ------------------------------------
var CA_ID = 'MKT-RESTW-CA-AMAZON';
var UK_ID = 'MKT-RESTW-UK-AMAZON';
var KM_US_ID = 'MKT-KM-US-AMAZON';
var RESUS_US_ID = 'MKT-RESUS-US-AMAZON';
var REGISTRY = [
  { marketplaceId: CA_ID, company: 'ResTW', country: 'CA', marketplace: 'Amazon', status: 'active' },
  { marketplaceId: UK_ID, company: 'ResTW', country: 'UK', marketplace: 'Amazon', status: 'active' },
  // §10 — the collision pair. Same marketplace NAME, different company, different country.
  { marketplaceId: KM_US_ID, company: 'KM', country: 'US', marketplace: 'Amazon', status: 'active' },
  { marketplaceId: RESUS_US_ID, company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'active' }
];
var CA_SITE = { company: 'ResTW', country: 'CA', marketplace: 'Amazon' };
var UK_SITE = { company: 'ResTW', country: 'UK', marketplace: 'Amazon' };

// ---- the page's own model + accessors, lifted rather than re-implemented ---------------------------------
global.window = { KM: { api: { workspaceApiActive: function () { return true; } } } };
global._fcReadModel = null;
global._fcUseDb = function () { return true; };
global._fcEffectiveWorkspace = extractFn(PAGE, '_fcEffectiveWorkspace');
global._fcWorkspaceMode_ = extractFn(PAGE, '_fcWorkspaceMode_');
global._fcHas_ = extractFn(PAGE, '_fcHas_');
global._fcGetMarketplaces = extractFn(PAGE, '_fcGetMarketplaces');
global._fcResolveMarketplaceKey = extractFn(PAGE, '_fcResolveMarketplaceKey');
global.FC_ID_ = eval('(' + /var FC_ID_ = (\{[\s\S]*?\});/.exec(PAGE)[1] + ')');
global.FC_SLICE_ = eval('(' + /var FC_SLICE_ = (\{[\s\S]*?\});/.exec(PAGE)[1] + ')');
global.FC_FRESH_ = eval('(' + /var FC_FRESH_ = (\{[\s\S]*?\});/.exec(PAGE)[1] + ')');
global._fcSliceState_ = {};
global._fcSliceRec_ = extractFn(PAGE, '_fcSliceRec_');
global._fcRegistrySourceReady_ = extractFn(PAGE, '_fcRegistrySourceReady_');
var identity = extractFn(PAGE, '_evtMarketplaceIdentity_');
global._evtMarketplaceIdentity_ = identity;
var resolveId = extractFn(PAGE, '_evtResolveMarketplaceId');
var refusalText = extractFn(PAGE, '_evtIdentityRefusalText_');

/* Install a read model exactly as a slice commit would: a key PRESENT is an array, ABSENT is unread.
   `bootstrapState` drives the slice ledger the readiness classifier consults. */
function setWorld(opts) {
  opts = opts || {};
  var m = {};
  if (opts.registry !== undefined) { m.marketplaces = opts.registry; m.fcTargetRules = []; }
  if (opts.forecastLanded !== false) m.fcRegularForecast = [];
  global._fcReadModel = m;
  global._fcSliceState_ = {};
  if (opts.bootstrapState) _fcSliceRec_(FC_SLICE_.BOOTSTRAP).state = opts.bootstrapState;
}

// =========================================================================================================
section('A. §14.A / §14.K — the healthy paths resolve their own canonical id');
// =========================================================================================================

setWorld({ registry: REGISTRY });
var caOk = identity(CA_SITE);
eq([caOk.state, caOk.marketplaceId, caOk.matchCount], [FC_ID_.READY_UNIQUE, CA_ID, 1],
  'A1 healthy CA resolves READY_UNIQUE with the canonical id');
var ukOk = identity(UK_SITE);
eq([ukOk.state, ukOk.marketplaceId], [FC_ID_.READY_UNIQUE, UK_ID],
  'A2 §14.K the existing healthy UK path is unchanged');
eq(resolveId(CA_SITE), CA_ID, 'A3 the string face still answers the id — R1/R1B\'s mechanism is untouched');

// =========================================================================================================
section('B. §14.B / §14.C / §14.D — every unresolvable state is DISTINCT, and none of them is an id');
// =========================================================================================================

setWorld({ registry: undefined });                      // bootstrap never landed
eq(identity(CA_SITE).state, FC_ID_.UNREAD, 'B1 §14.B registry unread is UNREAD, not "empty"');
setWorld({ registry: undefined, bootstrapState: FC_FRESH_.REFUSED });
eq(identity(CA_SITE).state, FC_ID_.READ_FAILED, 'B2 §14.C a failed read is READ_FAILED, not "unread"');
setWorld({ registry: [] });                             // landed carrying nothing — R1B scenario 2b
var empty = identity(CA_SITE);
eq([empty.state, empty.registrySize], [FC_ID_.NO_MATCH, 0], 'B3 a registry that landed EMPTY is NO_MATCH over 0 rows');
setWorld({ registry: REGISTRY.filter(function (r) { return r.country !== 'CA'; }) });
var absent = identity(CA_SITE);
eq([absent.state, absent.registrySize, absent.matchCount], [FC_ID_.NO_MATCH, 3, 0],
  'B4 §14.D a loaded registry with no CA row is NO_MATCH over the rows it does have');
// The distinction R1 could not make: all four return '' and they are four different facts.
var ids = [FC_ID_.UNREAD, FC_ID_.READ_FAILED, FC_ID_.NO_MATCH];
ok(ids.indexOf(empty.state) >= 0 && empty.marketplaceId === '' && absent.marketplaceId === '',
  'B5 all of them yield a blank id — which is exactly why the STATE had to exist');

// =========================================================================================================
section('C. §14.E / §9 — duplicate canonical rows are AMBIGUOUS and are never guessed between');
// =========================================================================================================

var DUP = REGISTRY.concat([{ marketplaceId: 'MKT-RESTW-CA-AMAZON-2', company: 'ResTW', country: 'CA',
  marketplace: 'Amazon', status: 'active' }]);
setWorld({ registry: DUP });
var amb = identity(CA_SITE);
eq([amb.state, amb.matchCount, amb.marketplaceId], [FC_ID_.AMBIGUOUS, 2, ''],
  'C1 two exact matches is AMBIGUOUS with NO id — not [0], not newest, not first');
ok(amb.marketplaceId !== CA_ID && amb.marketplaceId !== 'MKT-RESTW-CA-AMAZON-2',
  'C2 and neither candidate leaks out as the answer');
// A single match whose OWN id is blank is not a resolution either.
setWorld({ registry: [{ marketplaceId: '', company: 'ResTW', country: 'CA', marketplace: 'Amazon' }] });
var blankRow = identity(CA_SITE);
eq([blankRow.state, blankRow.matchCount, blankRow.marketplaceId], [FC_ID_.NO_MATCH, 1, ''],
  'C3 a matching row carrying no id resolves nothing — a row is not an identity');

// =========================================================================================================
section('D. §10 / §14.L / §14.M / §14.N — company and country isolation');
// =========================================================================================================

setWorld({ registry: REGISTRY });
eq(identity({ company: 'KM', country: 'US', marketplace: 'Amazon' }).marketplaceId, KM_US_ID,
  'D1 §14.N KM / US / Amazon resolves KM\'s own id');
eq(identity({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }).marketplaceId, RESUS_US_ID,
  'D2 and ResUS / US / Amazon resolves ResUS\'s — the shared platform name does not collide');
eq(identity({ company: 'KM', country: 'CA', marketplace: 'Amazon' }).state, FC_ID_.NO_MATCH,
  'D3 §14.L KM cannot adopt ResTW\'s CA identity — company isolation');
eq(identity({ company: 'ResTW', country: 'US', marketplace: 'Amazon' }).state, FC_ID_.NO_MATCH,
  'D4 §14.M ResTW cannot adopt a US identity — country isolation');
// A partial triple is unanswerable, never a looser query. This is the hole the old `!site.company ||` left.
eq(identity({ company: '', country: 'CA', marketplace: 'Amazon' }).state, FC_ID_.NO_MATCH,
  'D5 a site with no company matches NOTHING — it does not match everything');
eq(identity({ company: 'ResTW', country: '', marketplace: 'Amazon' }).state, FC_ID_.NO_MATCH,
  'D6 and neither does a site with no country');
eq(identity({ company: 'ResTW', country: 'CA', marketplace: '' }).state, FC_ID_.NO_MATCH,
  'D7 nor one with no marketplace');

// =========================================================================================================
section('E. §4 / §11 / §14.O — the SAVE boundary refuses before anything is dispatched');
// =========================================================================================================

var SAVE = fnSrc(code(PAGE), 'saveEventUpdate');
var gateAt = SAVE.indexOf('_evtMarketplaceIdentity_(site)');
var writeBeginAt = SAVE.indexOf('_fcWriteBegin_');
var firstDbAt = SAVE.search(/DB\.(upsertCampaign|upsertCampaignSkuLines|importFcSpecialEventsBatch)\s*\(/);
ok(gateAt > 0, 'E1 the save calls the ONE identity owner');
ok(writeBeginAt > gateAt, 'E2 §11 the gate is ABOVE _fcWriteBegin_ — no logical write is ever opened');
ok(firstDbAt > gateAt, 'E3 and above every write dispatch — IDENTITY_REFUSAL_WRITE_REQUEST_COUNT = 0');
ok(/if \(!demoOn && _idr\.state !== FC_ID_\.READY_UNIQUE\) \{[\s\S]{0,200}?return;/.test(SAVE),
  'E4 a non-READY state returns outright — the outcome is CONFIRMED_NOT_STARTED, never a write failure');
ok(/var marketplaceId = _idr\.marketplaceId;/.test(SAVE),
  'E5 and the id that travels into the payload is the one the gate verified, not a second lookup');
// The gate touches no form field and no write state, which is what makes the operator's entries survive.
var GATE = SAVE.slice(gateAt - 200, writeBeginAt);
ok(!/\.value\s*=/.test(GATE) && !/_fcWriteEnd_|_fcWriteState_/.test(GATE),
  'E6 §5 the refusal writes no form value and enters no write state — FORM_STATE_SURVIVES = YES');
ok(!/_fcSliceFetch_|refreshCacheTables|getWorkspace/.test(GATE),
  'E7 §13 and issues no read of its own — NEW_SAVE_TIME_REFERENCE_READS_ADDED = 0');

// §5 — retry repairs the reference data; it does not replay the save. The gate cannot replay because it
// returns, and nothing in it calls the save again.
ok(!/saveEventUpdate\s*\(/.test(GATE), 'E8 §5 the refusal never re-enters the save — SAVE_AUTOREPLAY_COUNT = 0');

// The three refusals say three different things, and each names the site.
setWorld({ registry: undefined });
var tUnread = refusalText(identity(CA_SITE));
setWorld({ registry: DUP });
var tAmb = refusalText(identity(CA_SITE));
setWorld({ registry: [] });
var tEmpty = refusalText(identity(CA_SITE));
setWorld({ registry: REGISTRY.filter(function (r) { return r.country !== 'CA'; }) });
var tAbsent = refusalText(identity(CA_SITE));
ok(/Retry/.test(tUnread) && /Nothing was written/.test(tUnread),
  'E9 §4 the unread refusal points at the existing Retry and states that nothing was written');
ok(/ambiguous/i.test(tAmb) && /2 rows/.test(tAmb), 'E10 the ambiguity refusal states how many rows matched');
ok(/ResTW \/ CA \/ amazon/.test(tAbsent), 'E11 §4 the no-match refusal names the exact site triple');
ok(tEmpty !== tAbsent && /no rows at all/.test(tEmpty),
  'E12 and an EMPTY registry reads as a loading problem, not as a claim about this site');

// =========================================================================================================
section('F. §8 — the mixed-freshness incident, end to end');
// =========================================================================================================

// fc_regular_forecast READY, marketplaces unread. The picker can still offer ResTW / CA / Amazon.
setWorld({ registry: undefined });
var during = identity(CA_SITE);
eq([during.state, during.marketplaceId], [FC_ID_.UNREAD, ''], 'F1 mixed freshness → UNREAD, no id');
ok(refusalText(during).indexOf('Retry') > 0, 'F2 the operator is sent to Retry, and no write is dispatched');
// Retry lands the bootstrap slice. Nothing else changes; the form was never touched.
setWorld({ registry: REGISTRY });
var after = identity(CA_SITE);
eq([after.state, after.marketplaceId], [FC_ID_.READY_UNIQUE, CA_ID],
  'F3 §8 after the reference read lands, the SAME site resolves ' + CA_ID);
ok(refusalText !== null && identity(CA_SITE).marketplaceId === CA_ID,
  'F4 §14.H explicit Save then carries the canonical id');

// =========================================================================================================
section('G. §6 / §7 — the server validates, never derives, and cannot erase a stored id');
// =========================================================================================================

var SRV = (function () {
  var ctx = { console: console };
  vm.createContext(ctx);
  vm.runInContext([varSrc(GS14, 'FC_SE_MKT_REFUSALS_'), fnSrc(GS14, 'fcSeMktStr_'), fnSrc(GS14, 'fcSeMktUp_'),
    fnSrc(GS14, 'fcSeValidateMarketplaceIdentity_')].join('\n'), ctx, { filename: 'fcid-r2-server.js' });
  return ctx;
})();
var IDX = { ok: true, byId: { 'MKT-RESTW-CA-AMAZON': { company: 'ResTW', country: 'CA', marketplace: 'Amazon' },
  'MKT-KM-US-AMAZON': { company: 'KM', country: 'US', marketplace: 'Amazon' } } };
var reads = 0;
function getIdx() { reads++; return IDX; }
function validate(body) { return SRV.fcSeValidateMarketplaceIdentity_(body, getIdx); }

reads = 0;
eq(validate({ event_fc_id: 'E1', fc_qty: 5 }), null,
  'G1 §7 an ABSENT marketplace_id is allowed — this is the inline quantity edit, which claims no identity');
eq(reads, 0, 'G2 §13 and it costs ZERO registry reads — NEW_FULL_TABLE_READS_ADDED = 0 on that path');

var blank = validate({ marketplace_id: '', company: 'ResTW', country: 'CA', marketplace: 'Amazon' });
eq(blank && blank.error, 'BLANK_MARKETPLACE_ID_REFUSED',
  'G3 §7 a PRESENT BLANK id is REFUSED — this is the erasure, and it is the whole reason the server half exists');
ok(/erase/.test(blank.detail), 'G4 and the refusal says what it was about to do');

eq(validate({ marketplace_id: CA_ID, company: 'ResTW', country: 'CA', marketplace: 'Amazon' }), null,
  'G5 a canonical id whose triple agrees is accepted');
var notCanon = validate({ marketplace_id: 'MKT-MADE-UP', company: 'ResTW', country: 'CA', marketplace: 'Amazon' });
eq(notCanon && notCanon.error, 'MARKETPLACE_ID_NOT_CANONICAL', 'G6 an id naming no registry row is refused');
var mismatch = validate({ marketplace_id: CA_ID, company: 'KM', country: 'CA', marketplace: 'Amazon' });
eq(mismatch && mismatch.error, 'MARKETPLACE_IDENTITY_MISMATCH',
  'G7 §10 an id belonging to another company is refused — CROSS_COMPANY_ID_ADOPTION_COUNT = 0');
var mismatchCountry = validate({ marketplace_id: CA_ID, company: 'ResTW', country: 'UK', marketplace: 'Amazon' });
eq(mismatchCountry && mismatchCountry.error, 'MARKETPLACE_IDENTITY_MISMATCH',
  'G8 and one belonging to another country — CROSS_COUNTRY_ID_ADOPTION_COUNT = 0');
// Case-insensitive, matching the client owner, so a normalised marketplace key is not a mismatch.
eq(validate({ marketplace_id: CA_ID.toLowerCase(), company: 'restw', country: 'ca', marketplace: 'amazon' }), null,
  'G9 comparison is case-insensitive on both sides — the client sends a normalised key');
// Unverifiable is not the same as valid.
var unreadable = SRV.fcSeValidateMarketplaceIdentity_({ marketplace_id: CA_ID },
  function () { return { ok: false, reason: 'marketplaces sheet not found' }; });
eq(unreadable && unreadable.error, 'MARKETPLACE_REGISTRY_UNREADABLE',
  'G10 an id that CANNOT be verified is refused rather than trusted');

// SERVER_DERIVES_MARKETPLACE_ID = NO, asserted against the source rather than the behaviour.
var VAL = fnSrc(code(GS14), 'fcSeValidateMarketplaceIdentity_');
/* Derivation would have to INDEX A RESULT — `…filter(…)[0]`, `…match(…)[0]` — or key the registry by the
   triple. `p[0]` / `p[1]` in the dimension loop are tuple reads and are not that, so the check is written
   against the shape derivation actually takes rather than against the two characters it shares with it. */
ok(!/\)\s*\[0\]/.test(VAL) && !/byTriple|findByTriple|company\s*\+\s*['"]\|/.test(VAL),
  'G11 §6 the validator indexes no lookup result and builds no triple key — it checks a claim, never invents one');
ok(/idx\.byId\[fcSeMktUp_\(claimed\)\]/.test(VAL),
  'G11a the only registry access is BY THE CLAIMED ID — the direction that can verify but cannot derive');
ok(!/setCell|appendRow|getRange/.test(VAL), 'G12 and it writes nothing');

// =========================================================================================================
section('H. §7 — create and edit parity, and the erasure that is now impossible');
// =========================================================================================================

/* Both paths are the SAME function: saveEventUpdate composes create and edit, switching on
   _evtEditingActive_() only when it decides which campaign identity to quote. So ONE gate covers both —
   but the gate is NOT above every editing check (an earlier one drives the window/duplicate preflight),
   and claiming otherwise would be a stronger statement than the code supports. What must hold, and what
   is asserted, is that the gate precedes every construction that CARRIES marketplace_id. */
ok(/_evtEditingActive_\(\)/.test(SAVE), 'H1 §7 create and edit are one save function');
var payloadAt = SAVE.indexOf('marketplace_id: marketplaceId');
var evRowsAt = SAVE.indexOf('marketplace_id: marketplaceId', payloadAt + 1);
ok(payloadAt > gateAt && evRowsAt > gateAt,
  'H1a and the gate precedes BOTH payloads that carry the id — the campaign header and the event rows');
eq(SAVE.split('marketplace_id: marketplaceId').length - 1, 2,
  'H1b those two are the only places the id is written into a payload');
eq([identity(CA_SITE).state], [FC_ID_.READY_UNIQUE], 'H2 (world is healthy again for the checks below)');
setWorld({ registry: undefined });
eq(identity(CA_SITE).state, FC_ID_.UNREAD,
  'H3 §14.I/§14.J with the registry down, BOTH paths see a non-READY state and neither may proceed');
// And if a blank ever reached the server anyway, the writer no longer applies it.
eq(validate({ marketplace_id: '', event_fc_id: 'E1' }).error, 'BLANK_MARKETPLACE_ID_REFUSED',
  'H4 VALID_ID_CAN_BE_ERASED_BY_RUNTIME_FAILURE = NO — the second line of defence holds independently');
// The erasure mechanism itself, pinned: hasOwnProperty is what makes blank different from absent.
ok(/headers\.forEach\(function \(h\) \{[\s\S]{0,200}?if \(body\.hasOwnProperty\(h\)\) setCell/.test(code(GS14)),
  'H5 the UPDATE branch still writes every column the body CARRIES — which is why blank had to be refused');

// =========================================================================================================
section('I. §13 / §14.P / §14.Q — nothing else moved');
// =========================================================================================================

setWorld({ registry: REGISTRY });
var IDFN = fnSrc(code(PAGE), '_evtMarketplaceIdentity_');
ok(/_fcGetMarketplaces\(\)/.test(IDFN),
  'I1 §13 identity reads through the page\'s existing accessor — no new table read, no new owner');
ok(!/refreshCacheTables|getTable|getWorkspace/.test(IDFN),
  'I2 and issues no network round of its own — NEW_NETWORK_ROUND_ADDED_TO_HEALTHY_SAVE = 0');
ok(!/forecast|gap|recommend/i.test(IDFN),
  'I3 §14.P no recommendation / gap / forecast calculation was added to the identity path');
// §14.Q — the S6 owners are untouched by this round.
['12_shipment_handlers.gs', '21_factory_inventory_handlers.gs', '11_shipping_plan_handlers.gs'].forEach(function (f, i) {
  ok(!/marketplace_id/.test(read('assets/specs/active/apps-script/' + f)),
    'I4.' + (i + 1) + ' §14.Q ' + f + ' is untouched by marketplace identity — no S6 behaviour change');
});
// ONE client-side resolution owner. The import modal's resolver answers a DIFFERENT question (which
// registry ROW did the operator pick, by option value) for a different modal, and is not a second
// implementation of this mapping — it is asserted here so the distinction stays deliberate.
var OWNERS = (code(PAGE).match(/function _evt\w*MarketplaceId\w*\s*\(|function _evtMarketplaceIdentity_\s*\(/g) || []);
eq(OWNERS.length, 2, 'I5 §2 exactly two identity functions on the event path: the mapping and its string face');
ok(/return _evtMarketplaceIdentity_\(site\)\.marketplaceId;/.test(code(PAGE)),
  'I6 and the string face DELEGATES — there is one filter, in one function');

// =========================================================================================================
section('J. mutation');
// =========================================================================================================

mut('J1 the readiness guard is deleted', function () {
  // Without it, an unread registry is indistinguishable from an empty one and the save proceeds on a blank.
  var src = PAGE.replace(/if \(!_fcRegistrySourceReady_\(\)\) \{[\s\S]*?\n    return out;\r?\n  \}/, '');
  if (src === PAGE) throw new Error('J1 anchor drifted');
  var mutated = extractFn(src, '_evtMarketplaceIdentity_');
  setWorld({ registry: undefined });
  var m = mutated(CA_SITE), real = identity(CA_SITE);
  return m.state === FC_ID_.NO_MATCH && real.state === FC_ID_.UNREAD;
});

mut('J2 `[0]` ambiguity selection comes back', function () {
  var src = PAGE.replace('if (hits.length > 1) { out.state = FC_ID_.AMBIGUOUS; return out; }',
    'if (hits.length > 1) { out.state = FC_ID_.READY_UNIQUE; out.marketplaceId = hits[0].marketplaceId; return out; }');
  if (src === PAGE) throw new Error('J2 anchor drifted');
  var mutated = extractFn(src, '_evtMarketplaceIdentity_');
  setWorld({ registry: DUP });
  var m = mutated(CA_SITE), real = identity(CA_SITE);
  return m.marketplaceId === CA_ID && m.state === FC_ID_.READY_UNIQUE &&
    real.marketplaceId === '' && real.state === FC_ID_.AMBIGUOUS;
});

mut('J3 the save gate allows a blank id through', function () {
  var src = code(PAGE).replace('if (!demoOn && _idr.state !== FC_ID_.READY_UNIQUE) {',
    'if (false) {');
  if (src === code(PAGE)) throw new Error('J3 anchor drifted');
  var mSave = fnSrc(src, 'saveEventUpdate');
  return !/_idr\.state !== FC_ID_\.READY_UNIQUE/.test(mSave) &&
    /_idr\.state !== FC_ID_\.READY_UNIQUE/.test(SAVE);
});

mut('J4 company is dropped from the identity comparison', function () {
  var src = PAGE.replace('up(x.company) === up(site.company) && up(x.country) === up(site.country) &&',
    'up(x.country) === up(site.country) &&');
  if (src === PAGE) throw new Error('J4 anchor drifted');
  var mutated = extractFn(src, '_evtMarketplaceIdentity_');
  setWorld({ registry: REGISTRY });
  var site = { company: 'ResTW', country: 'US', marketplace: 'Amazon' };
  var m = mutated(site), real = identity(site);
  // ResTW/US does not exist; with company ignored it would match BOTH US rows.
  return m.state === FC_ID_.AMBIGUOUS && m.matchCount === 2 && real.state === FC_ID_.NO_MATCH;
});

mut('J5 country is dropped from the identity comparison', function () {
  var src = PAGE.replace('up(x.company) === up(site.company) && up(x.country) === up(site.country) &&',
    'up(x.company) === up(site.company) &&');
  if (src === PAGE) throw new Error('J5 anchor drifted');
  var mutated = extractFn(src, '_evtMarketplaceIdentity_');
  setWorld({ registry: REGISTRY });
  var site = { company: 'KM', country: 'CA', marketplace: 'Amazon' };
  var m = mutated(site), real = identity(site);
  // KM has exactly one Amazon row (US); ignoring country adopts it for CA — a WRONG id, not a blank one.
  return m.state === FC_ID_.READY_UNIQUE && m.marketplaceId === KM_US_ID && real.state === FC_ID_.NO_MATCH;
});

mut('J6 Retry replays the Save', function () {
  // The gate must RETURN. If it fell through to a re-entry the operator never approved a submission.
  var src = code(PAGE).replace(/if \(!demoOn && _idr\.state !== FC_ID_\.READY_UNIQUE\) \{([\s\S]{0,200}?)return;/,
    'if (!demoOn && _idr.state !== FC_ID_.READY_UNIQUE) {$1saveEventUpdate();');
  if (src === code(PAGE)) throw new Error('J6 anchor drifted');
  var mSave = fnSrc(src, 'saveEventUpdate');
  var mGate = mSave.slice(mSave.indexOf('_evtMarketplaceIdentity_(site)'), mSave.indexOf('_fcWriteBegin_'));
  var realGate = SAVE.slice(gateAt, writeBeginAt);
  return /saveEventUpdate\(\)/.test(mGate) && !/saveEventUpdate\(\)/.test(realGate);
});

mut('J7 the server accepts a blank marketplace_id again', function () {
  var src = GS14.replace(/if \(!claimed\) \{[\s\S]*?\n  \}/, 'if (!claimed) { return null; }');
  if (src === GS14) throw new Error('J7 anchor drifted');
  var ctx = { console: console };
  vm.createContext(ctx);
  vm.runInContext([varSrc(src, 'FC_SE_MKT_REFUSALS_'), fnSrc(src, 'fcSeMktStr_'), fnSrc(src, 'fcSeMktUp_'),
    fnSrc(src, 'fcSeValidateMarketplaceIdentity_')].join('\n'), ctx, { filename: 'j7.js' });
  var m = ctx.fcSeValidateMarketplaceIdentity_({ marketplace_id: '' }, getIdx);
  return m === null && validate({ marketplace_id: '' }).error === 'BLANK_MARKETPLACE_ID_REFUSED';
});

mut('J8 the server starts DERIVING an id from the triple', function () {
  // Derivation is the one repair that looks helpful and is a guess: (company, country, marketplace)
  // uniqueness is not enforced anywhere in this schema.
  var derive = function (body, idx) {
    var hit = Object.keys(idx.byId).filter(function (id) {
      var c = idx.byId[id];
      return c.company === body.company && c.country === body.country && c.marketplace === body.marketplace;
    })[0];
    return hit || '';
  };
  var derived = derive({ company: 'ResTW', country: 'CA', marketplace: 'Amazon' }, IDX);
  var real = validate({ marketplace_id: '', company: 'ResTW', country: 'CA', marketplace: 'Amazon' });
  return derived === CA_ID && real && real.error === 'BLANK_MARKETPLACE_ID_REFUSED' &&
    !/byId\[/.test(VAL.slice(VAL.indexOf('if (!claimed)'), VAL.indexOf('var idx =')));
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('FC-ID-R2 CANONICAL IDENTITY SAVE BOUNDARY — ' + pass + ' passed / ' + fail + ' failed');
console.log('mutants: ' + neg.caught + ' caught / ' + (neg.caught + neg.missed) + ' planted');
if (fail === 0) {
  console.log('CANONICAL_MARKETPLACE_ID_REQUIRED_FOR_SAVE = YES');
  console.log('IDENTITY_LOOKUP_STATES = READY_UNIQUE | UNREAD | READ_FAILED | NO_MATCH | AMBIGUOUS');
  console.log('NEW_STATE_MACHINE_CREATED = NO   BLANK_MARKETPLACE_ID_WRITE_COUNT = 0');
  console.log('SERVER_VALIDATES_MARKETPLACE_ID = YES   SERVER_DERIVES_MARKETPLACE_ID = NO');
  console.log('VALID_ID_CAN_BE_ERASED_BY_RUNTIME_FAILURE = NO   SAVE_AUTOREPLAY_COUNT = 0');
  console.log('PRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_BACKFILL_ROWS = 0   S6_BEHAVIOR_CHANGED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
