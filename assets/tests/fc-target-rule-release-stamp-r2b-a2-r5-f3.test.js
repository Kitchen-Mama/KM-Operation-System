// Kitchen Mama Operation System — FC-SUMMARY-R2B-A2-R5-F3
// THE RELEASE THAT NAMES THE TARGET RULE UNIFICATION
// Run: node assets/tests/fc-target-rule-release-stamp-r2b-a2-r5-f3.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime.
//
// WHY THIS SUITE EXISTS. F2 unified five disagreeing Target Rule resolvers into one, and left a hole it
// could not close by itself: 13_procurement_handlers.gs changed while still declaring the stamp of a round
// it no longer belongs to. The standing E4 check said so and was right to. But rotating that stamp cascades
// — 63_ carries 13_'s manifest row, so editing the row edits 63_, so 63_'s own stamp must move, so the
// deployment release must move, and 20 suites read the release. That is a release decision, not a typo fix,
// and F3 is the round that takes it: R12 names the whole consumer unification.
//
// WHAT MAKES THIS DANGEROUS AND THEREFORE WORTH A SUITE. Every file in this release answers every action it
// answered before, both before and after the change. No action is added, no action removed, no request or
// response shape differs. A half-copied sync of R12 returns SUCCESS from every endpoint and a DIFFERENT
// forecast number. The module manifest is the only instrument that can see it, so the manifest itself has
// to be correct — and "correct" here means four separate things that this suite keeps apart:
//
//   1. every owner that CHANGED declares the new round      (else a stale copy looks current)
//   2. every owner that did NOT change keeps its old stamp  (else the manifest detects nothing, ever)
//   3. the manifest EXPECTS exactly what each file declares (else the check is a lie on day one)
//   4. the order in the shared ledger is append-only        (else every "at or after" floor silently moves)
//
// THE ONE DESIGN DECISION WORTH DEFENDING. 90_generated_supply_planning_bundle.gs is BUILT, not written, so
// it gets no hand-typed build stamp. Its manifest identity is KM_BUNDLE_CONTENT_HASH_, emitted by the
// builder and derived from the module contents. A typed stamp on a generated file is wrong twice: someone
// must remember to edit it in the builder every round, and it can be typed to look current without the
// bytes moving — which is the single failure the manifest exists to prevent. A content hash cannot be
// advanced without a real change and cannot fail to advance when one happens.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var REPO = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var RO = require('./_release-order.js');

// R2B-A2-R5-F5 — DERIVED, NOT RESTATED. The first draft pinned R12 as a literal and listed the four
// files that carried it. Both were true of R12 and neither is a rule: R13 repairs the Target Rule
// WRITER and moves exactly TWO owners (14_ and 63_), because 13_ and 90_ did not change. A suite that
// demands every owner share the release would have forced two unchanged files onto the sync list to
// stay green — which is precisely the lie the module manifest exists to prevent.
//
// So the release is read from 63_, its predecessor is read from the shared ledger, and the owner set
// is read from git. What is asserted is the RELATIONSHIP between them, which does not expire.
var HEALTH_FOR_RELEASE = read(GS + '63_api_v1_system_health.gs');
var RELEASE = (HEALTH_FOR_RELEASE.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)';/) || [])[1] || '';
var _relIdx = RO.OWNER_STAMPS.indexOf(RELEASE);
var PREV_RELEASE = _relIdx > 0 ? RO.OWNER_STAMPS[_relIdx - 1] : '';
// The floor: R12 named the resolver unification and was cut. Nothing may go back below it.
var RELEASE_FLOOR = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R12';

// THE TREE THIS RELEASE WAS PREPARED AGAINST. Three checks below ask "what did this release change?",
// and the first draft asked it of HEAD — which is correct for exactly as long as the work is uncommitted
// and becomes a comparison of the release against ITSELF the moment it is committed (it duly reported
// that zero tokens were added and the manifest grew by zero rows). A commit id is the stable way to name
// a tree, and this one never moves: cd3fd8f is F2, the consumer unification this release exists to name.
// R14 — FC-SUMMARY-R3-R1 moves the base to 07c23fd, the commit the R13 release was accepted at in
// production. The base tracks the release this suite is describing, because "what did THIS release
// change?" is meaningless against the tree of the release before last.
// R15 — FC-SUMMARY-R2B-A3-R1 moves the base to 74aca0b, the commit the R14 release was accepted at in
// production (58_ and 63_ synced, 131/131 backend gate, Pages converged on the same sha).
// R16 — FC-SUMMARY-R2B-A3-R4 moves the base to a91cb8e, the commit the R15 release was accepted at in
// production (14_, 20_ and 63_ synced by the user, live health reported R15 uniform).
// R18 — FC-SUMMARY-R2B-A3-R9 moves the base to 2836d2a. NOTE THE WORDING CHANGE, because the claim is
// weaker than the ones above and saying so is the point: 2836d2a is the commit R17's source landed at
// and the current tip of origin/main; this suite has NO evidence that R17 was accepted in production,
// and does not assert it. What makes 2836d2a the right base anyway is a property of the two rounds
// between it and here: A3-R7 and A3-R8 changed NO .gs file at all, so the Apps Script diff from this
// base is exactly and only what R18 changed — which is the one thing the base is for.
// B1-PERF — the base moves to 2d84a68, the commit A3-R10 landed at and the current tip of
// origin/main. The same wording caveat as R18 applies and is worth repeating: this suite has no
// evidence about what production accepted, it asserts only what the Apps Script diff from this base
// contains. What makes 2d84a68 right is that A3-R10 changed NO .gs file, so the diff from here is
// exactly and only what B1-PERF changed.
// PRICING-R2 — the base moves to b280b8d, the commit S2-R4B landed at and the current tip of this
// branch. The same wording caveat every entry above carries applies and is worth repeating: this suite
// has no evidence about what production accepted, it asserts only what the Apps Script diff from this
// base contains. What makes b280b8d right is that S2-R4B changed NO .gs file at all, so the diff from
// here is exactly and only what R21 changed.
var BASE = 'b280b8d';   // R21 starts here: the tree after the shipping-history / FC warm-race round

// The files THIS release syncs, and the ONE reason each is on the list. A file on the sync list for no
// stated reason is how an unrelated edit reaches production by accident — so the set is declared here
// and checked against git below, rather than being read off git and believed.
var RELEASE_OWNERS = {
  '73_api_v1_pricing_write.gs':
    'NEW FILE. The canonical pricing write — the only writer of pricing_list and the only writer of '
    + 'pricing_change_log. It adds the field-level manual price authority the schema could not express: '
    + 'price_source is ONE value for a WHOLE ROW, so a row whose Regular was negotiated and whose MSRP '
    + 'has only ever been the converted base price had no honest value to put there. The three '
    + '*_is_manual flags answer it per field, and a BLANK flag is a third state (UNKNOWN) rather than '
    + 'false — every row alive today has one, and reading those as false would classify the entire '
    + 'price book as overwritable in a single deployment with no operator ever asked',
  '01_router.gs':
    'the pricing.update dispatch. A project holding the R9 copy answers every action it knows and '
    + 'simply does not route this one, so every price save returns an invalid-action refusal while '
    + '73_ sits present and healthy beside it',
  '59_api_v1_sku_details_workspace.gs':
    'pricing_list joins the INCLUDE-GATED tables as include.pricing, so the SKU Regional price panel is '
    + 'served by the read that page already performs rather than by a second request or by the broad '
    + 'Operation DB cache it deliberately stopped using. Un-requested the table costs a caller nothing',
  '63_api_v1_system_health.gs':
    'the R21 release identity, its own stamp, 73_\'s new manifest row, 59_\'s and 01_\'s expected '
    + 'stamps, the pricing.update registry entry, and the action-contract bump that entry requires'
};
// Owners that carry an EARLIER release and must keep it. Each is here because it did not change, and
// marching any of them to the current release would destroy the manifest's only useful signal.
//
// 14_ JOINED THIS LIST AT R14, AND THAT IS THE POINT. It was R13's owner; reading a Target Rule is not
// writing one, and the read owner changing gives nobody licence to march the write handler along. A file
// that moves out of RELEASE_OWNERS and into RELEASE_UNMOVED is a release doing its job.
// 58_ JOINED THIS LIST AT R15, and 14_ left it — the exact swap R14's comment predicted. Reading an
// event is not writing one, so the read owner keeps the release it changed in while the two write
// handlers move.
// 14_ JOINED THIS LIST AT R16. It was an R15 owner; R16 changes only how the CAMPAIGN handler classifies
// a resolved row, and no fc_special_events or fc_target_rules handler was touched. Marching 14_ to R16
// would erase the one fact its stamp carries: the round in which it last actually changed.
// 14_ LEFT AGAIN AT R18 AND 20_ TOOK ITS PLACE — the third such swap this suite has recorded, and each
// one is the ledger working. R18 adds the authoritative uniqueness refusal inside 14_ and touches no
// campaign handler, so 20_ keeps R17, the round IT last changed.
var RELEASE_UNMOVED = {
  // 14_ LEFT AGAIN AT R19, and this time nothing took its place — 04_ JOINED. B1-PERF hardens the
  // REGULAR forecast writer, which lives in 04_; no fc_special_events or fc_target_rules handler was
  // touched, so 14_ keeps R18, the round its uniqueness refusal landed in.
  //
  // 04_ JOINED THIS LIST AT R20 AND 20_ LEFT IT — the fourth such swap the ledger has recorded, and the
  // symmetry is exact: R19 batched the REGULAR forecast writer in 04_ and left the campaign line writer
  // alone; R20 batches the campaign line writer in 20_ and touches no regular-forecast handler. Marching
  // 04_ to R20 would erase the one fact its stamp carries.
  // 20_ JOINS THIS LIST AT R21 AND 01_ LEAVES IT — the fifth such swap the ledger has recorded. R20
  // batched the campaign line writer in 20_ and routed nothing; R21 routes a new action in 01_ and
  // touches no campaign handler. Marching 20_ to R21 would erase the one fact its stamp carries, and a
  // project holding the R17 copy of it still cannot save a 90-SKU Special Event — which is exactly what
  // its stamp must keep saying.
  '20_campaign_write_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R20',
  '04_marketplace_forecast_import.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R19',
  '14_fc_write_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R18',
  '58_api_v1_fc_summary_workspace.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R14',
  '13_procurement_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R12',
  '00_config.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11',
  // 72_ is the pricing READ owner and does NOT move: R21 adds a WRITER, and a writer is not a reader.
  // Its response still publishes the same effective prices from the same three fields.
  '72_api_v1_product_pricing_workspace.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10'
};

var HEALTH = read(GS + '63_api_v1_system_health.gs');
var PROC = read(GS + '13_procurement_handlers.gs');
var WRITE = read(GS + '14_fc_write_handlers.gs');
var REGWRITE = read(GS + '04_marketplace_forecast_import.gs');
var WSREAD = read(GS + '58_api_v1_fc_summary_workspace.gs');
var CAMPWRITE = read(GS + '20_campaign_write_handlers.gs');
var BUNDLE = read(GS + '90_generated_supply_planning_bundle.gs');
var CONFIG = read(GS + '00_config.gs');
var ROUTER = read(GS + '01_router.gs');

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 100 - n.length)).join('-')); }

function declares(src, symbol) {
  var m = new RegExp('var\\s+' + symbol + "\\s*=\\s*'([^']*)'").exec(src);
  return m ? m[1] : null;
}
function manifestRows(src) {
  var out = [], re = /\{ file: '([^']+)', symbol: '([A-Z_]+)', expected: '([^']+)'/g, m;
  while ((m = re.exec(src)) !== null) out.push({ file: m[1], symbol: m[2], expected: m[3] });
  return out;
}
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  var i = src.indexOf('(', start), p = 0;
  for (; i < src.length; i++) { if (src[i] === '(') p++; else if (src[i] === ')') { p--; if (p === 0) { i++; break; } } }
  var b = src.indexOf('{', i), d = 0;
  for (i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}
function extractArray(src, name) {
  var start = src.indexOf('var ' + name + ' = [');
  if (start < 0) throw new Error('array not found: ' + name);
  var i = src.indexOf('[', start), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '[') d++;
    else if (src[i] === ']') { d--; if (d === 0) return src.slice(start, i + 2); }
  }
  throw new Error('unbalanced brackets: ' + name);
}

// ================================================================================================
// THE EXECUTED MANIFEST. 63_'s own sysModuleBuildStamps_ is lifted out and run against a sandbox in
// which each owner's declared stamp is whatever that owner's FILE actually says — so "the deployment
// reports itself synced" is executed rather than asserted about. `overrides` simulates a project that
// was copied a file at a time: a value replaces a declaration, and null deletes it outright.
// ================================================================================================
var MANIFEST_SRC = extractArray(HEALTH, 'SYS_MODULE_BUILD_STAMPS_');
var FN_SRC = extractFn(HEALTH, 'sysGlobalValue_') + '\n'
           + extractFn(HEALTH, 'sysRuntimeAuthorityChecks_') + '\n'
           + extractFn(HEALTH, 'sysModuleBuildStamps_');

function runManifest(overrides) {
  overrides = overrides || {};
  var rows = manifestRows(HEALTH);
  var decls = [];
  var declaredBy = {};
  rows.forEach(function (r) {
    var p = path.join(REPO, GS + r.file);
    var v;
    if (Object.prototype.hasOwnProperty.call(overrides, r.symbol)) { v = overrides[r.symbol]; }
    else if (!fs.existsSync(p)) { v = null; }
    else { v = declares(fs.readFileSync(p, 'utf8'), r.symbol); }
    if (v !== null && v !== undefined) { declaredBy[r.symbol] = v; }
  });
  Object.keys(declaredBy).forEach(function (s) {
    decls.push('var ' + s + ' = ' + JSON.stringify(declaredBy[s]) + ';');
  });
  var ctx = vm.createContext({ console: console });
  var release = overrides.__RELEASE__ !== undefined ? overrides.__RELEASE__ : declares(HEALTH, 'SYS_DEPLOYMENT_RELEASE_');
  var script = decls.join('\n') + '\n'
    + 'var SYS_DEPLOYMENT_RELEASE_ = ' + JSON.stringify(release) + ';\n'
    + MANIFEST_SRC + '\n' + FN_SRC + '\n'
    + 'sysModuleBuildStamps_();';
  return vm.runInContext(script, ctx);
}

// ================================================================================================
section('A. THE RELEASE TOKEN IS DERIVED FROM THE LEDGER, NOT INVENTED');
// ================================================================================================
ok(RELEASE !== '', 'A1  63_ declares a release (' + RELEASE + ')');
ok(RO.stampAtOrAfter(RELEASE, RELEASE_FLOOR),
  'A1a and it is at or after R12, the resolver-unification release, which was cut');
ok(RO.BUILD_STAMP_RE.test(RELEASE), 'A2  and it matches the canonical stamp shape');
ok(RO.OWNER_STAMPS.indexOf(RELEASE) !== -1, 'A3  and it is in the shared owner-stamp order at all');
eq(RO.OWNER_STAMPS[RO.OWNER_STAMPS.length - 1], RELEASE,
  'A4  APPENDED — the declared release is the newest entry, so the end of the list is also its',
  RO.OWNER_STAMPS.slice(-3));
eq(RO.OWNER_STAMPS.indexOf(RELEASE), RO.OWNER_STAMPS.indexOf(PREV_RELEASE) + 1,
  'A5  and it sits immediately after its predecessor (' + PREV_RELEASE + ') — nothing spliced between');
ok(RO.stampAtOrAfter(RELEASE, PREV_RELEASE), 'A6  so every floor written against R11 admits R12');
ok(!RO.stampAtOrAfter(PREV_RELEASE, RELEASE), 'A6a while a floor written against R12 rejects R11');
// The token is the next in ITS OWN series, not a new naming family invented for this round.
ok(/^F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R\d+$/.test(RELEASE) && /^F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R\d+$/.test(PREV_RELEASE)
  && Number(RELEASE.split('-R').pop()) === Number(PREV_RELEASE.split('-R').pop()) + 1,
  'A7  the release is the NEXT token in its own R6-R7 series — the same family, mechanically continued',
  PREV_RELEASE + ' -> ' + RELEASE);

// ================================================================================================
section('B. EVERY OWNER THAT CHANGED DECLARES THE NEW ROUND');
// ================================================================================================
eq(declares(PROC, 'PROC_BUILD_VERSION_'), RELEASE_UNMOVED['13_procurement_handlers.gs'],
  'B1  13_ still declares the round IT last changed in — it did not change in this release');
// The DEFINITION, not any mention: the stamp comment above deliberately names the deleted function so a
// reader can find out what happened, and a bare substring search reads that explanation as the thing.
ok(!/function\s+procurementTargetRuleResolver_/.test(PROC),
  'B1a and the matcher it used to own really is gone, so the stamp is not decoration');
ok(/KMPD\.resolveTargetRule/.test(PROC),
  'B1b and what replaced it is a call to the shared resolver, not a second private copy');
// R16 — 14_ KEEPS ITS OWN ROUND. It was an R15 owner; R16 changes only how 20_ classifies a resolved
// campaign row, and no handler in 14_ was touched. Asserting it declares the RELEASE would march a stamp
// that exists precisely to record the round its file last changed.
// R20 — 20_ IS the release. It changed, and 04_ — which WAS R19's owner — keeps R19.
eq(declares(REGWRITE, 'FCREG_BUILD_VERSION_'), RELEASE_UNMOVED['04_marketplace_forecast_import.gs'],
  'B2  04_ keeps R19, the round IT last changed — R20 touched no regular-forecast handler');
eq(declares(WRITE, 'FCW_BUILD_VERSION_'), RELEASE_UNMOVED['14_fc_write_handlers.gs'],
  'B2-0 while 14_ keeps R18, the round IT last changed — no event or rule handler was touched');
ok(/LockService\.getScriptLock\(\)/.test(REGWRITE) && /fcRegContiguousRuns_/.test(REGWRITE),
  'B2-0a and the change 04_\'s stamp claims is really in the file — the lock and the bounded runs');
// Scoped to the HANDLER, not the file: 04_ also holds handleImportMarketplaceSkusBatch_, which B1
// did not touch and which still writes the way it always did. Asserting over the whole file would be
// asserting something this release never claimed — and it FAILED that way first.
var REGHANDLER = REGWRITE.slice(REGWRITE.indexOf('function handleImportFcRegularForecastBatch_'));
ok(REGHANDLER.length > 500, 'B2-0b0 the Regular handler is locatable inside 04_');
ok(!/\.setValue\(/.test(REGHANDLER) && !/\.appendRow\(/.test(REGHANDLER),
  'B2-0b with the per-cell and per-row mutations it replaced gone from THAT handler');
// PRICING-R2 — 20_ LEAVES THE RELEASE and keeps R20, the round it last changed. Its batched-writer
// properties below stay exactly as they are: they are what R20 bought, and they must keep holding.
eq(declares(CAMPWRITE, 'CAMPAIGN_BUILD_VERSION_'), RELEASE_UNMOVED['20_campaign_write_handlers.gs'],
  'B2-2 while 20_ stays on R20, the round its batched campaign_sku_lines writer landed in');
// And the change its stamp claims is really in the file, on the same test B2-0a/B2-0b apply to 04_:
// the per-line whole-sheet re-read is gone and a full-width range write is there in its place.
var CAMPHANDLER = CAMPWRITE.slice(CAMPWRITE.indexOf('function handleUpsertCampaignSkuLines_'));
ok(CAMPHANDLER.length > 500, 'B2-2a the campaign line handler is locatable inside 20_');
ok(!/campaignLineIndexRows_\(fcWriteReadSheet_\(sheet\)\)/.test(CAMPHANDLER),
  'B2-2b with the per-line whole-sheet re-read gone from THAT handler');
ok(!/fcWriteUpsert_\(/.test(CAMPHANDLER) && /\.setValues\(/.test(CAMPHANDLER),
  'B2-2c and the per-line upsert replaced by range writes');
ok(/FC_SE_UNIQUENESS_FIELDS_/.test(WRITE) && /DUPLICATE_SPECIAL_EVENT_IDENTITY/.test(WRITE),
  'B2-3 and R18\'s change is still in 14_, so the stamp it KEEPS is not decoration either');
// The mirror image, and the reason B2 could be rewritten rather than deleted: the READ owner is
// untouched by a write-path release, so it must still declare the release it DID change in.
eq(declares(WSREAD, 'FCSWS_BUILD_VERSION_'), RELEASE_UNMOVED['58_api_v1_fc_summary_workspace.gs'],
  'B2a 58_ keeps R14 — writing an event is not reading one, and a release may not march it along');
ok(/FC_SE_FINGERPRINT_FIELDS_/.test(WRITE) && /STALE_SPECIAL_EVENT_VERSION/.test(WRITE),
  'B2b and the change 14_\'s stamp claims is really in the file — the event token and its refusal');
ok(/CAMPAIGN_KEY_FIELDS_/.test(CAMPWRITE) && /start_date/.test(CAMPWRITE),
  'B2c and 20_\'s — the window-based campaign key');
ok(/FCS_SLICE_SPECS_/.test(WSREAD) && /fcsReadTableOnce_/.test(WSREAD),
  'B2d while R14\'s change is still in 58_, so its unmoved stamp is still earned');
eq(declares(HEALTH, 'SYS_BUILD_VERSION_'), RELEASE,
  'B3  63_\'s own module stamp moved, because 63_ itself changed');
ok(/expected_row_version/.test(WRITE),
  'B3a 14_\'s R13 stale-write gate is still in the file — an unmoved stamp must still be earned');
eq(declares(BUNDLE, 'KM_BUNDLE_CONTENT_HASH_'),
  (BUNDLE.match(/^\/\/ bundle_sha256 = ([0-9a-f]{64})$/m) || [])[1],
  'B4  90_\'s content hash is the hash the builder printed in its own header — one value, two places, derived');
ok(/^[0-9a-f]{64}$/.test(declares(BUNDLE, 'KM_BUNDLE_CONTENT_HASH_') || ''),
  'B4a and it is a real sha256, not a stamp wearing a hash\'s name');

// The generated file is GENERATED. If the builder and the committed bundle disagree, the hash in the
// manifest is describing a file nobody can reproduce.
(function () {
  var out = '';
  try {
    out = cp.execFileSync('node', ['assets/tools/build-apps-script-bundle.js', '--check'],
      { cwd: REPO, encoding: 'utf8' });
  } catch (e) { out = 'FAILED: ' + String((e && e.stdout) || e); }
  ok(/up to date/.test(out), 'B5  the committed 90_ is byte-reproducible from the approved builder', out.trim());
})();
ok(/KM_BUNDLE_CONTENT_HASH_/.test(read('assets/tools/build-apps-script-bundle.js')),
  'B5a and the hash constant is EMITTED BY THE BUILDER — never hand-added to the generated file');
ok(/var KM_BUNDLE_CONTENT_HASH_ = '/.test(BUNDLE),
  'B5b single-quoted, because every manifest reader matches var NAME = \'...\' and a double-quoted '
  + 'value would make those checks find nothing and pass VACUOUSLY');

// ================================================================================================
section('C. EVERY OWNER THAT DID NOT CHANGE KEEPS ITS OLD STAMP');
// ================================================================================================
// This is the half that makes the manifest worth having. A stamp marched to the release to look current
// destroys the only signal that can distinguish a synced file from an unsynced one.
// PREV_RELEASE is the release BEFORE this one, which is not the same thing as the round a given
// file last changed in — and conflating them is the very mistake this suite was rewritten to stop.
eq(declares(CONFIG, 'CONFIG_BUILD_VERSION_'), RELEASE_UNMOVED['00_config.gs'],
  'C1  00_config.gs stays on the round it last changed in, not on the latest release');
// PRICING-R2 — R21 IS a vocabulary round, so this inverts: the router MOVED, because pricing.update
// was routed. A router that gained an action and kept its stamp is the one partial sync the manifest
// could not otherwise report — the deployment answers every action it knows and silently lacks one.
eq(declares(ROUTER, 'RTR_BUILD_VERSION_'), RELEASE,
  'C2  01_router.gs IS the release — an action was routed, so its stamp moved with it');
var atRelease = manifestRows(HEALTH).filter(function (r) { return r.expected === RELEASE; })
  .map(function (r) { return r.file; }).sort();
eq(atRelease, Object.keys(RELEASE_OWNERS).sort(),
  'C3  EXACTLY the owners this release changed expect the release — no unrelated file was marched to it');
Object.keys(RELEASE_UNMOVED).forEach(function (f, i) {
  var row = manifestRows(HEALTH).filter(function (r) { return r.file === f; })[0];
  eq(row ? row.expected : '(no row)', RELEASE_UNMOVED[f],
    'C3.' + (i + 1) + ' ' + f + ' stays on the round it last changed in');
});

// ================================================================================================
section('D. THE MANIFEST EXPECTS WHAT EACH FILE DECLARES');
// ================================================================================================
(function () {
  var rows = manifestRows(HEALTH), checked = 0, bad = [];
  rows.forEach(function (r) {
    var p = path.join(REPO, GS + r.file);
    if (!fs.existsSync(p)) return;                       // optional one-shot migration owners
    var d = declares(fs.readFileSync(p, 'utf8'), r.symbol);
    if (d === null) { bad.push(r.file + ' declares no ' + r.symbol); return; }
    checked++;
    if (d !== r.expected) bad.push(r.file + ' declares ' + d + ', manifest expects ' + r.expected);
  });
  eq(bad, [], 'D1  every manifest row matches the build its own file declares');
  ok(checked >= 18, 'D2  and enough rows were really compared (' + checked + ')');
})();
// A row per changed owner, or the partial sync it is meant to catch has nowhere to be reported.
Object.keys(RELEASE_OWNERS).forEach(function (f, i) {
  ok(manifestRows(HEALTH).some(function (r) { return r.file === f; }),
    'D3.' + (i + 1) + ' ' + f + ' HAS a manifest row — ' + RELEASE_OWNERS[f]);
});

// ================================================================================================
section('E. EXECUTED — THE FULLY SYNCED PROJECT REPORTS ITSELF SYNCED');
// ================================================================================================
var H = runManifest();
eq(H.deployment_build, RELEASE, 'E1  the executed manifest publishes the RELEASE as build_id');
eq(H.absent_modules, [], 'E2  no required owner is absent');
eq(H.stale_modules, [], 'E3  and none is stale');
ok(H.modules.some(function (m) { return m.file === '14_fc_write_handlers.gs' && m.matches_expected; }),
  'E4  14_ is reported present and current through its new symbol');
ok(H.modules.some(function (m) {
  return m.file === '90_generated_supply_planning_bundle.gs' && m.matches_expected;
}), 'E5  and 90_ through its content hash');

// ================================================================================================
section('F. EXECUTED — EVERY WAY THIS SYNC CAN GO HALF-DONE IS NAMED');
// ================================================================================================
// F1 is the exact state F2 left behind and F3 exists to end: new source in the repository, an old copy
// of 13_ in the project. Before this release there was no stamp difference to see it by.
var oldProc = runManifest({ PROC_BUILD_VERSION_: 'F1-7N-FC-1A-R1' });
ok(oldProc.stale_modules.join('|').indexOf('13_procurement_handlers.gs') !== -1,
  'F1  an OLD deployed 13_ beside the new manifest is reported STALE', oldProc.stale_modules);
ok(oldProc.stale_modules.join('|').indexOf('F1-7N-FC-1A-R1') !== -1,
  'F1a and the report names the build the project actually carries, not just that something is wrong');

// R18 — the file whose OLD copy must be rejected is the one this release changed, which is now 14_.
// PREV_RELEASE is R17, and R17 is 20_'s CORRECT stamp, so asking the question of 20_ would assert that
// a correctly-synced project is stale. The rule is unchanged: a project holding the previous release's
// copy of the file this release changed is reported STALE, and here that project keeps accepting the
// duplicate event R18 exists to refuse.
// R20 — the file whose OLD copy must be rejected is 20_. PREV_RELEASE is R19, which is 04_'s CORRECT
// stamp, so asking the question of 04_ would assert that a correctly-synced project is stale. This is
// the same rotation the R18 and R19 comments above record, and it matters more here than usual: a
// project still holding the R17 copy of 20_ cannot save a 90-SKU Special Event at all, so 'stale' is
// the difference between a working page and a stage-2 failure.
// R21 — the file whose OLD copy must be rejected is 01_. 73_ is a NEW file, so there is no old copy of
// it to present and its absence is caught by the manifest's missing-owner path instead; the router is
// the one R21 owner that a project can hold a WORKING earlier version of. That is the dangerous case:
// an R9 router answers everything it knew and routes nothing new, so a price save fails with an
// invalid-action refusal while every other probe reports a healthy deployment.
var oldRouter = runManifest({ RTR_BUILD_VERSION_: PREV_RELEASE });
ok(oldRouter.stale_modules.join('|').indexOf('01_router.gs') !== -1,
  'F2  an OLD 01_ identity is rejected where this release requires the new one', oldRouter.stale_modules);
var noCamp = runManifest({ CAMPAIGN_BUILD_VERSION_: null });
ok((noCamp.stale_modules.join('|') + noCamp.absent_modules.join('|')).indexOf('20_campaign_write_handlers.gs') !== -1,
  'F2a and a project carrying NO 20_ stamp is reported too', noCamp);
// And the mirror: 04_ carrying R19 is CORRECT now, not stale, which is the half that stops a release
// from reporting a properly-synced project as broken.
var okReg = runManifest({ FCREG_BUILD_VERSION_: RELEASE_UNMOVED['04_marketplace_forecast_import.gs'] });
ok(okReg.stale_modules.join('|').indexOf('04_marketplace_forecast_import.gs') === -1,
  'F2b while 04_ at R19 is correct — the round it last changed, not the latest release', okReg.stale_modules);
// THE FAILURE MODE THIS ROW WAS ADDED FOR. Until R15, 20_ had no stamp at all: a project holding last
// round's copy keys campaigns by NAME, so two event windows in one year merge into a single row and
// the earlier one is overwritten — and health reported a clean bill, because no action was added.
var noCamp = runManifest({ CAMPAIGN_BUILD_VERSION_: null });
eq(noCamp.absent_modules, ['20_campaign_write_handlers.gs'],
  'F2a a project that never received 20_ reports it ABSENT — the signal that did not exist before R15');

var noWrite = runManifest({ FCW_BUILD_VERSION_: null });
eq(noWrite.absent_modules, ['14_fc_write_handlers.gs'],
  'F3  a project that never received 14_ at all reports it ABSENT — a stronger signal than stale, and the '
  + 'reason the symbol is new rather than backdated');

var oldBundle = runManifest({ KM_BUNDLE_CONTENT_HASH_: '0'.repeat(64) });
ok(oldBundle.stale_modules.join('|').indexOf('90_generated_supply_planning_bundle.gs') !== -1,
  'F4  a bundle whose CONTENT differs is stale — and it cannot be talked out of that by editing a stamp');

var noBundle = runManifest({ KM_BUNDLE_CONTENT_HASH_: null });
eq(noBundle.absent_modules, ['90_generated_supply_planning_bundle.gs'],
  'F5  and a project with no bundle at all is named, which matters because its absence is QUIET: 13_ '
  + 'guards on typeof and returns null, and a null target is a SKIPPED month, not an error');

var missingAll = runManifest({
  PROC_BUILD_VERSION_: null, FCW_BUILD_VERSION_: null, KM_BUNDLE_CONTENT_HASH_: null
});
eq(missingAll.absent_modules.sort(),
  ['13_procurement_handlers.gs', '14_fc_write_handlers.gs', '90_generated_supply_planning_bundle.gs'].sort(),
  'F6  each missing owner is reported independently — one fault does not mask the next two');

// ================================================================================================
section('G. THE SHARED LEDGER IS POSITIONAL, AND THAT IS LOAD-BEARING');
// ================================================================================================
// stampAtOrAfter compares INDEXES. Every "at or after round X" floor in this repository is therefore a
// claim about POSITION, and a token placed anywhere but the end silently redefines all of them. This is
// not hypothetical: appending an older-series name at the end during F2 made one file outrank every
// other owner and broke eleven suites at once.
(function () {
  var order = RO.OWNER_STAMPS.slice();
  function atOrAfter(list, s, f) {
    var i = list.indexOf(s), j = list.indexOf(f);
    return i !== -1 && j !== -1 && i >= j;
  }
  eq(atOrAfter(order, RELEASE, PREV_RELEASE), true, 'G1  as committed, R12 is at or after R11');

  var swapped = order.slice();
  var a = swapped.indexOf(PREV_RELEASE), b = swapped.indexOf(RELEASE);
  swapped[a] = RELEASE; swapped[b] = PREV_RELEASE;
  eq(atOrAfter(swapped, RELEASE, PREV_RELEASE), false,
    'G2  SWAPPING the two releases breaks that floor — the order is contractual, not cosmetic');

  var spliced = order.slice(0, a).concat([RELEASE]).concat(order.slice(a));
  eq(atOrAfter(spliced, PREV_RELEASE, RELEASE), true,
    'G3  INSERTING R12 before R11 inverts the ledger: R11 would now read as the LATER release');
  eq(atOrAfter(order, PREV_RELEASE, RELEASE), false,
    'G3a which is the opposite of what the committed order says, so the wrong position is detectable');

  // The list is append-only in the strict sense: R12 is the ONLY difference from the previous round.
  var prior = cp.execFileSync('git', ['show', BASE + ':assets/tests/_release-order.js'],
    { cwd: REPO, encoding: 'utf8' });
  // EVALUATED, not scraped. The array carries multi-line comments between its entries, and a bare
  // /'[^']+'/g over the source collects prose out of those comments as if it were a release token.
  var priorList = vm.runInNewContext(extractArray(prior, 'OWNER_STAMPS') + '\nOWNER_STAMPS;');
  eq(order.slice(0, priorList.length), priorList,
    'G4  every stamp that existed before is unchanged, in place — nothing removed, nothing reordered');
  // A3-R6 — G5 asked how many tokens had been added since the frozen BASE commit, which answers 'one'
  // for exactly one round and then drifts: R16 and R17 have both landed since a91cb8e, both legitimately.
  // The rule it exists to enforce is about THIS round — a release adds one token, never two — so it is now
  // asked of the previous commit instead of the frozen base. G4 above keeps the append-only check against
  // BASE, where a fixed historical anchor is exactly right.
  var prevCommit = cp.execFileSync('git', ['show', 'HEAD:assets/tests/_release-order.js'],
    { cwd: REPO, encoding: 'utf8' });
  var prevList = vm.runInNewContext(extractArray(prevCommit, 'OWNER_STAMPS') + '\nOWNER_STAMPS;');
  eq(order.slice(0, prevList.length), prevList,
    'G5  every stamp in the previous commit is unchanged, in place');
  ok(order.length - prevList.length <= 1,
    'G5a and this round added at most one token — a release is one stamp, never two',
    order.slice(prevList.length));
})();

// ================================================================================================
section('H. THIS ROUND CHANGED THE VOCABULARY, AND SAYS SO IN EXACTLY THE RIGHT PLACES');
// ================================================================================================
// PRICING-R2 — INVERTED, and the inversion is the point. Every release in this series until now changed
// a NUMBER through an action that already existed, and bumping the contract would have told every
// deployed client to re-check a vocabulary byte-identical to the one it already held. R21 is the first
// that genuinely adds one: pricing.update did not exist, a project that predates it cannot serve it at
// all, and the SKU Regional price editor fails closed against it rather than writing through some other
// path. So the two action numbers MUST move — by exactly one each, which is what "one action was added"
// looks like — while the TRANSPORT contract must still not move, because no envelope field changed.
function num(src, sym) { return (src.match(new RegExp('var ' + sym + ' = (\\d+);')) || [])[1]; }
var priorHealth = cp.execFileSync('git', ['show', BASE + ':' + GS + '63_api_v1_system_health.gs'],
  { cwd: REPO, encoding: 'utf8' });
eq(num(HEALTH, 'SYS_TRANSPORT_CONTRACT_VERSION_'), num(priorHealth, 'SYS_TRANSPORT_CONTRACT_VERSION_'),
  'H1  SYS_TRANSPORT_CONTRACT_VERSION_ is untouched — no envelope field moved');
eq(Number(num(HEALTH, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_'))
   - Number(num(priorHealth, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_')), 1,
  'H2  SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ moved by exactly one — one action was added');
eq(Number(num(HEALTH, 'SYS_REQUIRED_ACTION_LIST_VERSION_'))
   - Number(num(priorHealth, 'SYS_REQUIRED_ACTION_LIST_VERSION_')), 1,
  'H3  SYS_REQUIRED_ACTION_LIST_VERSION_ moved by exactly one — the registry gained one entry');
// And the registry really did grow by that one row, so the number describes the list rather than being
// a number somebody typed.
function regCount(src) { return ((/var SYS_REQUIRED_ACTIONS_ = \[[\s\S]*?\n\];/.exec(src) || [''])[0]
  .match(/action: '/g) || []).length; }
eq(regCount(HEALTH) - regCount(priorHealth), 1, 'H3a and SYS_REQUIRED_ACTIONS_ itself grew by exactly one row');
ok(/\{ action: 'pricing\.update', handler: 'handlePricingUpdate_'/.test(HEALTH), 'H3b which is pricing.update');
// ASKED OF GIT, not by comparing bytes. The stored blob is line-ending normalised and the working copy
// is not, so a direct byte compare reports a difference that does not exist. `git diff --name-only`
// answers the actual question and prints nothing when the answer is no.
// R21 — ALSO INVERTED. The router MUST differ from the base, because an action was routed; and it must
// be a DECLARED owner, because an undeclared router change is how an action reaches production without
// anyone putting the file on a sync list.
ok(cp.execFileSync('git', ['diff', '--name-only', BASE, '--', GS + '01_router.gs'],
  { cwd: REPO, encoding: 'utf8' }).trim() !== '',
  'H4  01_router.gs DID change this release — an action was routed');
ok(Object.keys(RELEASE_OWNERS).indexOf('01_router.gs') !== -1,
  'H4a and it is a declared release owner, so it reaches the operator\'s sync list');
// R14 is the first release in this series to change manifest MEMBERSHIP, so the old assertion — that
// membership never moves — is no longer true and is not the right thing to assert. What must hold is
// that membership moved by EXACTLY the row this release declares, which is the stricter statement.
var priorFiles = manifestRows(priorHealth).map(function (r) { return r.file; });
var nowFiles = manifestRows(HEALTH).map(function (r) { return r.file; });
// R16 adds no OWNER — 20_ already joined the manifest at R15, and this release changes what it does,
// not which files are probed. Membership must therefore move by exactly nothing.
// R19 ADDED AN OWNER — 04_ had no row and no stamp, so the manifest could not tell a synced Regular
// writer from a stale one. R20 adds NONE: 20_ has held a manifest row since R15, and this release
// changes what that file does, not which files are probed. Membership must move by exactly nothing,
// which is the same assertion in the other direction and is still the strict one.
// R21 DECLARES ONE: 73_ is a new owner file, and a routed WRITE action whose handler file is not in
// the manifest is the worst partial sync there is — the save appears to do nothing and no probe can say
// why. Membership must move by exactly that row and no other.
eq(nowFiles.filter(function (f) { return priorFiles.indexOf(f) === -1; }), ['73_api_v1_pricing_write.gs'],
  'H5  the manifest gained EXACTLY the row this release declares');
eq(priorFiles.filter(function (f) { return nowFiles.indexOf(f) === -1; }), [],
  'H5a and lost none — a release adds an owner, it never quietly drops one');

// ================================================================================================
section('I. THE SYNC LIST IS EXACTLY THE DECLARED OWNERS');
// ================================================================================================
(function () {
  // FC-SUMMARY-R2B-A2-R6 — A DELETION IS NOT A COPY, AND THIS CHECK IS ABOUT THE COPY LIST.
  //
  // This asked git which Apps Script paths differ from the base and required the answer to be
  // exactly the four release owners. R6 retires the one-shot fc_target_rules header migration by
  // DELETING it, which makes a fifth path differ — and the check failed while describing a tree
  // that is correct.
  //
  // Widening the expected set would have been the wrong repair: it would let a deleted file and a
  // pasted file sit in one list, when the operator does two different things with them. The diff is
  // partitioned by status instead. What must be COPIED is still exactly the four owners; what must
  // be DELETED is named separately and just as strictly, because an unexplained deletion is as much
  // of a ride-along as an unexplained edit.
  var status = cp.execFileSync('git', ['diff', '--name-status', BASE, '--', GS],
    { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    .map(function (l) { var p = l.split(/\s+/); return { st: p[0].charAt(0), file: p[p.length - 1].replace(GS, '') }; });
  var copy = status.filter(function (r) { return r.st !== 'D'; }).map(function (r) { return r.file; }).sort();
  var gone = status.filter(function (r) { return r.st === 'D'; }).map(function (r) { return r.file; }).sort();

  eq(copy, Object.keys(RELEASE_OWNERS).sort(),
    'I1  exactly the declared release owners are to be COPIED — no Apps Script file rode along');
  eq(gone, [],
    'I1a and NOTHING is to be deleted — the one-shot helper was retired in R2B-A2-R6, before this base');
  // The retired file carried no build stamp and owned no manifest row, which is why removing it
  // moves no release identity. If it ever had, this would have to rotate the release too.
  ok(Object.keys(RELEASE_OWNERS).indexOf('TEMP_migrate_fc_target_rules_header_r2ba2.gs') === -1,
    'I1b the retired file is still not a release owner, and is no longer in the project at all');
})();

// ================================================================================================
section('J. MUTATION — each guard above is load-bearing');
// ================================================================================================
var mutants = [], survived = [];
function mutant(id, label, predicate) {
  mutants.push(id);
  var held;
  try { held = !!predicate(); } catch (e) { held = false; }
  if (held) { console.log('  caught: ' + id + '  ' + label); }
  else { survived.push(id); console.error('SURVIVED: ' + id + '  ' + label); }
}

mutant('M1', 'a marched 00_config stamp is indistinguishable from a synced one', function () {
  return runManifest({ CONFIG_BUILD_VERSION_: RELEASE }).stale_modules.length > 0;
});
mutant('M2', '13_ left on its pre-F2 stamp', function () {
  return runManifest({ PROC_BUILD_VERSION_: 'F1-7N-FC-1A-R1' }).stale_modules.length > 0;
});
mutant('M3', '14_ never copied into the project', function () {
  return runManifest({ FCW_BUILD_VERSION_: null }).absent_modules.length > 0;
});
mutant('M4', 'the bundle regenerated from different modules', function () {
  return runManifest({ KM_BUNDLE_CONTENT_HASH_: 'deadbeef'.repeat(8) }).stale_modules.length > 0;
});
mutant('M5', 'a release that is not in the shared ledger at all', function () {
  return RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R99') === -1
      && !RO.stampAtOrAfter('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R99', PREV_RELEASE);
});
mutant('M5a', 'an unchanged owner marched to the current release', function () {
  // 13_ did not change. If its manifest expectation were bumped to the release to look tidy, the
  // manifest could no longer tell a project missing 13_ from one that has it.
  var faked = HEALTH.replace(
    "symbol: 'PROC_BUILD_VERSION_', expected: '" + RELEASE_UNMOVED['13_procurement_handlers.gs'] + "'",
    "symbol: 'PROC_BUILD_VERSION_', expected: '" + RELEASE + "'");
  if (faked === HEALTH) return false;
  var row = manifestRows(faked).filter(function (r) { return r.file === '13_procurement_handlers.gs'; })[0];
  return row && row.expected !== declares(PROC, 'PROC_BUILD_VERSION_');
});
mutant('M6', 'a malformed release string', function () {
  return !RO.BUILD_STAMP_RE.test('R12') && !RO.BUILD_STAMP_RE.test('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-r12');
});
// Aimed at the row THIS release moves. It used to aim at 14_, which worked only while 14_'s row carried
// the release; at R14 it carries R13 by right, so the anchor vanished and the mutant reported a survival
// that was really a missing premise. The vacuity audit caught it, which is what the audit is for.
mutant('M7', 'the manifest expecting a build no file declares', function () {
  // Re-anchored at R21 onto RTR_BUILD_VERSION_, for the reason this mutant's own comment has given at
  // every previous rotation: the anchor has to be a row that EXPECTS THE RELEASE, and at R21 that is
  // 01_'s row — 20_ has gone back to holding R20, the round it last changed. An anchor left on a row
  // that no longer expects the release matches nothing and injects nothing, which is the one
  // mutation-testing failure that reports the wrong colour; the drift guard below is what turns a
  // missed rotation into an error instead of a green tick.
  var faked = HEALTH.replace(
    "symbol: 'RTR_BUILD_VERSION_', expected: '" + RELEASE + "'",
    "symbol: 'RTR_BUILD_VERSION_', expected: '" + PREV_RELEASE + "'");
  if (faked === HEALTH) throw new Error('M7 anchor drifted — the mutant would inject no fault');
  var row = manifestRows(faked).filter(function (r) { return r.symbol === 'RTR_BUILD_VERSION_'; })[0];
  return !!row && declares(ROUTER, 'RTR_BUILD_VERSION_') !== row.expected;
});
mutant('M8', 'a double-quoted bundle hash, which makes every reader pass vacuously', function () {
  var faked = BUNDLE.replace(/var KM_BUNDLE_CONTENT_HASH_ = '([^']*)';/, 'var KM_BUNDLE_CONTENT_HASH_ = "$1";');
  return declares(faked, 'KM_BUNDLE_CONTENT_HASH_') === null;
});
mutant('M9', '90_ given a hand-typed stamp instead of its content hash', function () {
  // The defence is that the value must equal the hash the BUILDER printed, so a typed one cannot agree.
  var faked = BUNDLE.replace(/var KM_BUNDLE_CONTENT_HASH_ = '[^']*';/,
    "var KM_BUNDLE_CONTENT_HASH_ = '" + RELEASE + "';");
  return declares(faked, 'KM_BUNDLE_CONTENT_HASH_')
      !== (faked.match(/^\/\/ bundle_sha256 = ([0-9a-f]{64})$/m) || [])[1];
});
mutant('M10', 'the release token spliced into the middle of the ledger', function () {
  // Build the wrong ledger from the list as it stood BEFORE this round, so the splice is the only
  // difference. Checking the last element alone would not catch it: appending correctly AND splicing
  // a duplicate leaves R12 at the end either way. What the wrong position actually does is INVERT the
  // order, and that is what has to be visible.
  var order = RO.OWNER_STAMPS.slice();
  var without = order.filter(function (t) { return t !== RELEASE; });
  var a = without.indexOf(PREV_RELEASE);
  var spliced = without.slice(0, a).concat([RELEASE]).concat(without.slice(a));
  function at(list, s2, f) { var i = list.indexOf(s2), j = list.indexOf(f); return i !== -1 && j !== -1 && i >= j; }
  return at(spliced, PREV_RELEASE, RELEASE) && !at(order, PREV_RELEASE, RELEASE);
});
mutant('M11', 'a changed owner with no manifest row anywhere', function () {
  var stripped = HEALTH.replace(/\n[^\n]*\{ file: '14_fc_write_handlers\.gs'[^\n]*\n/, '\n');
  return !manifestRows(stripped).some(function (r) { return r.file === '14_fc_write_handlers.gs'; });
});
// PRICING-R2 — INVERTED WITH THE ROUND, AND MADE INTO AN ACTUAL MUTANT. It read the tree and returned
// true when the contract had NOT moved, which was the fault worth catching while every release in this
// series changed a number rather than a vocabulary. R21 adds pricing.update, so the contract MUST move
// and the old predicate reported a correct release as a survivor.
//
// The fault now is the opposite and is worse: a release that adds an action and FORGETS to bump the
// contract. Every deployed browser then accepts a deployment that cannot serve the action it is about
// to call, and the failure surfaces as a save that silently does nothing rather than as a version
// refusal. So the mutant SIMULATES that — it reverts the number to the base's value — and the rule H2
// states is what rejects it.
mutant('M12', 'a release that adds an action and forgets to bump the action contract', function () {
  var prior = num(priorHealth, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_');
  var faked = HEALTH.replace(
    'var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = ' + num(HEALTH, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_') + ';',
    'var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = ' + prior + ';');
  if (faked === HEALTH) throw new Error('M12 anchor drifted — the mutant would inject no fault');
  return Number(num(faked, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_')) - Number(prior) !== 1;
});

// Vacuity — every mutant predicate must be FALSE against the unmutated tree, or it proves nothing.
var vacuous = [];
[['M1', function () { return runManifest().stale_modules.length === 0; }],
 ['M2', function () { return runManifest().stale_modules.length === 0; }],
 ['M3', function () { return runManifest().absent_modules.length === 0; }],
 ['M4', function () { return runManifest().stale_modules.length === 0; }],
 ['M5', function () { return RO.stampAtOrAfter(RELEASE, PREV_RELEASE); }],
 ['M6', function () { return RO.BUILD_STAMP_RE.test(RELEASE); }],
 ['M7', function () { return declares(ROUTER, 'RTR_BUILD_VERSION_') === RELEASE; }],
 ['M8', function () { return declares(BUNDLE, 'KM_BUNDLE_CONTENT_HASH_') !== null; }],
 ['M9', function () { return declares(BUNDLE, 'KM_BUNDLE_CONTENT_HASH_')
     === (BUNDLE.match(/^\/\/ bundle_sha256 = ([0-9a-f]{64})$/m) || [])[1]; }],
 ['M5a', function () { var row = manifestRows(HEALTH).filter(function (r) { return r.file === '13_procurement_handlers.gs'; })[0];
     return !!row && row.expected === declares(PROC, 'PROC_BUILD_VERSION_'); }],
 ['M10', function () { return RO.OWNER_STAMPS[RO.OWNER_STAMPS.length - 1] === RELEASE
     && RO.stampAtOrAfter(RELEASE, PREV_RELEASE); }],
 ['M11', function () { return manifestRows(HEALTH).some(function (r) { return r.file === '14_fc_write_handlers.gs'; }); }],
 // M12's predicate must be FALSE against the unmutated tree: the real contract DID move by one.
 ['M12', function () {
   return Number(num(HEALTH, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_'))
        - Number(num(priorHealth, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_')) === 1;
 }]
].forEach(function (p) {
  var held; try { held = !!p[1](); } catch (e) { held = false; }
  if (!held) vacuous.push(p[0]);
});
eq(vacuous, [], 'J1  every mutant predicate is checked against a tree where the fault is absent', vacuous);

// Positive control — the executed harness really runs 63_'s own code and really can report a fault.
ok(runManifest({ PROC_BUILD_VERSION_: 'SOMETHING-ELSE' }).stale_modules.length === 1,
  'J2  positive control — the manifest executed here reports exactly the one fault injected');

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + survived.length + ' survived, '
  + (vacuous.length === 0 ? 'vacuity clean' : 'VACUOUS: ' + vacuous.join(',')));
console.log(new Array(101).join('='));
process.exit(fail === 0 && survived.length === 0 ? 0 : 1);
