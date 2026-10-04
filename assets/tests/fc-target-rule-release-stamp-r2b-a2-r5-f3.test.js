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
// PRICING-R3 — the base moves to fa73717, the tip this round starts from. The same caveat every entry
// above carries applies: this suite has no evidence about what production accepted, only what the Apps
// Script diff from this base contains. What makes fa73717 right is the same property that made b280b8d
// right — it changed NO .gs file (it is a test-only correction to the load-surface audit), so the diff
// from here is exactly and only what R22 changed.
// S3-R10 — BASE MOVES, because this file audits ONE release and the tree has had another.
// Anchored at fa73717 it compared the working tree against a point two releases back, so `git diff BASE`
// reported R24's owners (04_, 72_) alongside R25's and called a correct tree wrong. The anchor is the
// maintenance this suite has always needed; its ledger below records five previous carries.
var BASE = 'e583057';   // R25 starts here: the tree after S3-R8's transport budget fix

// The files THIS release syncs, and the ONE reason each is on the list. A file on the sync list for no
// stated reason is how an unrelated edit reaches production by accident — so the set is declared here
// and checked against git below, rather than being read off git and believed.
// S5-R4 — GENERATED OWNERS: copied, but never stamped.
//
// A generated artifact is identified by its CONTENT HASH, not by a hand-typed stamp, so it can never appear
// in C3's "rows whose expected === RELEASE" — putting it in RELEASE_OWNERS fixes I1 and breaks C3. It is a
// third kind of member and gets its own list, the same way this suite already partitioned DELETED paths out
// of the copy list rather than widening the expected set. I1 checks COPY, so it checks both lists; C3 checks
// STAMPS, so it checks only the stamped one.
// S7-R2A — STAMPLESS OWNERS: copied, and stamped by nobody.
//
// The FOURTH kind of member, and it arrives by the same argument the third did. 57_ changed this release and
// must be pasted, but it declares no build symbol at all — 63_'s manifest proves it by probing the CALLER's
// symbol, the way it already does for 16_ and 31_. So it can never appear in C3's "rows whose expected ===
// RELEASE", and putting it in RELEASE_OWNERS would fix I1 and break C3 for precisely the reason recorded
// above. Minting a stamp for it to satisfy this ledger would overturn a standing design decision from inside
// a round whose whole subject is a read projection.
//
// I1 checks COPY, so it checks this list. C3 checks STAMPS, so it does not.
var STAMPLESS_OWNERS = {
  // S7-R3 — 17_ JOINS. It declares no build symbol, exactly like 57_, so it is copied and stamped by
  // nobody. R39 gives it the carrier_lead_times maintenance owner: a routable lane needs BOTH a rate card
  // and a lead time, rate cards have been application-maintainable since the Rate Card round, and lead
  // times could only be typed into the sheet — 61_ said so in the runtime. Without this file copied the
  // router would dispatch carrierLeadTime.upsert to a handler that does not exist, so it must travel with
  // 01_ or the action answers with a reference error rather than a refusal.
  '17_carrier_handlers.gs':
    'THE CARRIER HANDLERS. R39 adds handleUpsertCarrierLeadTime_ (the ONE application write owner for '
    + 'carrier_lead_times, with the duplicate-effective-lane guard) and handleCarrierLeadTimeDuplicateCensus_ '
    + '(read-only). The guard resolves through KMRA\'s own canonicalMethodKey / normalizeLeadTime rather than '
    + 'reimplementing them, so it cannot drift from the leadDays resolution it protects. No schema change: '
    + 'the live 11 columns are unchanged and no status column was invented.',
  '57_api_v1_shipment_workspace.gs':
    'THE SHIPMENT READ WORKSPACE. R38 adds the carriers master to its BASE table set and returns it raw, so '
    + 'the Shipment Draft, the Confirm summary and the On-the-Way Map can resolve carrier_id to a name. '
    + 'Without this file copied, those surfaces receive no carriers key at all — which the browser reads as '
    + 'UNREAD and renders as the bare id, i.e. exactly the behaviour this release set out to fix, failing '
    + 'quietly rather than loudly. It authors no business logic and no action was added, so the router and '
    + 'the action-contract version are untouched.'
};

var GENERATED_OWNERS = {
  '90_generated_supply_planning_bundle.gs':
    'THE GENERATED SHARED CORE. S5-R4 added the recommendation ACTION + reason derivation to KMREC, and this '
    + 'bundle carries every assets/js/core module VERBATIM for the Apps Script runtime — so the SCHEDULED '
    + 'generation path would call the OLD derivation until it is copied, which is exactly the manual/scheduled '
    + 'drift the slice forbids. Byte-reproducible from the approved builder (B5/H9); its identity is '
    + 'KM_BUNDLE_CONTENT_HASH_, declared in 63_ — which is why 63_ moves with it.'
};

// S7-R4 - THE PRODUCTION DELETE SET. Files that left assets/specs/active/apps-script/ since BASE and must
// therefore be checked for - and removed from - the Production Apps Script project at the cumulative
// release. A copy list alone cannot express this: pasting the new files leaves the old ones sitting in
// the project, compiled on every execution, including a demo seed that writes and clears six business
// tables.
var PRODUCTION_DELETE_SET_CANDIDATE = [
  'TEMP_demo_shipping_shipment_map_seed_v2.gs',
  'TEMP_document_diagnostics.gs',
  'TEMP_draft_migration_diagnostic.gs',
  'TEMP_migrate_request_order_draft_v2.gs',
  'TEMP_migrate_shipping_allocation_ai_lifecycle.gs',
  'TEMP_order_planning_draft_readback_diagnose.gs',
  'TEMP_request_order_send_diagnostics.gs'
];

var RELEASE_OWNERS = {
  // S3-R10 — THE RELEASE SET IS REPLACED, NOT APPENDED TO, AND THAT IS WHAT C3 IS FOR.
  //
  // RELEASE_OWNERS names the files THIS release changed. A file that did not change keeps the older stamp it
  // earned, which is the whole reason a stamp is per-module rather than a copy of the release id.
  //
  // S5-R6 — AND IT FORCED THE PARTITION BELOW. R25 was the last release cut against a SHIPPED tree. R26
  // onward have accumulated on top of it unshipped, so "what must be copied" (everything that differs from
  // BASE) and "what changed THIS release" stopped being the same set. RELEASE_CARRIED is that second half.
  //
  // S6-R4B — THE THIRTEENTH SWAP, and the first that touches no FC file at all. R32 changed the event write
  // path, the campaign line writer and the FC Summary read workspace; R33 changes the OVERSEAS INVENTORY
  // LIFECYCLE and the two shipment handlers that call it. 14_, 20_ and 58_ therefore leave and keep the R32
  // stamp they earned — marching them to R33 would erase the one fact a per-module stamp carries.
  // S7-R2A — THE EIGHTEENTH SWAP, and the smallest owner set this ledger has carried: 63_ alone.
  //
  // 22_ LEAVES OWNERSHIP AT R38 and keeps the R37 it earned one release ago. R38 is a READ round: 57_ gains
  // the carriers master so three shipment surfaces can name a carrier instead of printing its id. The
  // dispatcher was not touched, and marching its stamp would erase the one fact it carries — that
  // DECLARED_SOURCE_ONLY landed in R37.
  //
  // 57_ IS THE FILE THIS ROUND CHANGED AND IT IS NOT HERE, which is not an omission. It declares no build
  // symbol; 63_'s manifest proves it by probing the CALLER's symbol instead, and this map is keyed by files
  // that carry a stamp. The release moves because 57_ is sync-visible; the stamp moves on the manifest that
  // records it.
  //
  // 90_ does NOT move: no core module changed, so the bundle is not rebuilt and its content hash is the same
  // bytes it was at R36.
  // S7-R3 — THE NINETEENTH SWAP, and the first ROUTER change since R25. A fourteen-release gap is exactly
  // the jump a per-module stamp exists to be able to express; marching 01_ along with every release since
  // would have erased the fact that its routing table had not moved in fourteen rounds.
  // S7-R4 - THE TWENTIETH SWAP, and the first release in this ledger whose runtime change is a CORRECTED
  // SENTENCE. 01_ LEAVES OWNERSHIP AT R40 after exactly one release and keeps the R39 it earned. R40 adds
  // no action, so the action-contract version stays 18 and the browser's pin stays 18.
  //
  // The round moved seven non-runtime TEMP tools OUT of assets/specs/active/apps-script/. That is a
  // repository-layout change and alters no deployed byte - which is why 63_ is the ONLY owner here, and
  // also why it is an owner at all.
  // S8-R4B-1 - THE TWENTY-FIRST SWAP, and the ledger moving in the OTHER direction one release later.
  // 01_ RE-ENTERS OWNERSHIP AT R41 after exactly one release carried at R39. R40's entry above argued that
  // marching the router to R40 would erase the fact its routing table had not moved in fourteen releases
  // and then moved exactly once; R41 does not march it, it RECORDS a routing-table change that actually
  // happened - factoryStockGuard.get leaves the POST write chain for the GET read table. The two entries
  // are the same rule applied to opposite facts, which is the only evidence that it is a rule and not a
  // habit.
  //
  // 71_ OWNS THE FACTORY GUARD HANDLER AND IS NOT HERE. The handler did not change; only the verb that
  // reaches it did. Stamping an unchanged owner to make a release look complete is the exact failure C3
  // exists to catch, and it would be this round committing it.
  //
  // 90_ does NOT move: no core module changed, so the bundle is not rebuilt and its content hash is the
  // bytes it was at R36.
  '01_router.gs':
    'THE ROUTER. R41 adds factoryStockGuard.get to rtrGetReadHandlers_, the LAST approved read in the system '
    + 'that still travelled on POST - and a POST cannot survive the /exec 302 to script.googleusercontent.com, '
    + 'because the redirect drops the body. The POST branch is KEPT: every GET-routed read in this file is '
    + 'reachable from both tables, so removing it would be the exception, not the cleanup. NO ACTION WAS '
    + 'ADDED OR REMOVED - factoryStockGuard.get already existed on the POST chain - so the action-contract '
    + 'version stays at 18 and the browser pin stays at 18. A transport reclassification is not a contract '
    + 'change.',
  '63_api_v1_system_health.gs':
    'THE MANIFEST. R41 moves the release, its own build, and the ROUTER ROW IT CARRIES - which is the '
    + 'whole reason those are separate constants: 01_ changed, so its expected stamp moves, and this file '
    + 'moves because it is where that stamp is written down. The action-contract version stays 18 and '
    + 'SYS_REQUIRED_ACTION_LIST_VERSION_ stays 14: no action was added or removed, and no page gained a '
    + 'mount dependency. 90_ is not rebuilt - no core module changed. WHAT R40 CHANGED HERE IS STILL TRUE '
    + 'AND IS KEPT RATHER THAN OVERWRITTEN: '
    + 'R40 moves TWO values and no behaviour: the release, and its own build. 01_\'s expected '
    + 'stamp stays at R39 because 01_ did not change - which is the entire reason those are separate '
    + 'constants. The action-contract version stays 18: no router action was added or removed, and '
    + 'bumping it to look current is the self-reference this file\'s own header warns about. '
    + 'SYS_REQUIRED_ACTION_LIST_VERSION_ stays 14 for the same reason - no page gained a mount dependency. '
    + 'WHAT CHANGED IS A COMMENT, AND IT IS LOAD-BEARING. This manifest justified an OPTIONAL row for the '
    + 'AI-lifecycle migration by saying it "has a row because it lives in that folder". S7-R4 moved that '
    + 'file to assets/tools/apps-script-migrations/ and the row stayed, so the stated rule now predicts '
    + 'the opposite of what this file does. The real reason was always the one given four lines above the '
    + 'row - absence is ACTIONABLE, because 69_ refuses until the columns exist and that tool is the only '
    + 'supported way to add them. A manifest that mis-states its own admission rule is the comment-versus-'
    + 'assertion drift S7-R2B1 was convened to repair, so it is repaired rather than carried. 90_\'s '
    + 'content hash is untouched - no core module changed.',
};

// Owners that must be COPIED but whose stamp belongs to an EARLIER unshipped release. Each entry is the
// round that file last actually changed, verified against git rather than assumed: `git log <BASE>..HEAD`
// on both paths names the R25 pricing-receipt commit and then two releases that edited nothing but the
// stamp line. Those two marches are undone in this round — a stamp that is advanced to keep a gate green
// reports the round a release was cut in, not the round the file changed in, and then it can no longer
// distinguish a synced copy from a stale one, which is the single thing it is for.
var RELEASE_CARRIED = {
  // S7-R4 - THE TWENTIETH SWAP. 01_ LEFT OWNERSHIP AT R40 after ONE release as an owner and kept R39, the
  // round its routing table actually changed in. R40 moved no action and no handler; it was a deploy-
  // surface round whose only runtime edit was a corrected comment in 63_. Marching the router to R40 would
  // have erased the fact the R39 entry was written to preserve - that 01_ had not moved in fourteen
  // releases, and then moved exactly once.
  //
  // S8-R4B-1 - AND 01_ LEFT THIS LIST AGAIN AT R41, after exactly one release carried here. It is in
  // RELEASE_OWNERS above because R41 changes its routing table for real. The R40 paragraph is kept rather
  // than deleted: it records WHY the router was held at R39 through a release that did not touch it, and
  // that reason is what makes R41's promotion evidence rather than drift.
  // S7-R2A — THE EIGHTEENTH SWAP. 22_ LEAVES OWNERSHIP AT R38 after one release as an owner and keeps R37,
  // the round DECLARED_SOURCE_ONLY actually landed in. R38 changes a read projection and no handler.
  '22_shipment_dispatch_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R37',
  // S6-R7A — THE SIXTEENTH SWAP. 05_ and 21_ LEAVE OWNERSHIP AT R36 after one release as owners. R36 is a
  // snapshot-freshness round inside the generated bundle; it touches no handler, no vocabulary and no stored
  // row, so marching either stamp would report the release this was cut in rather than the round the file
  // changed in — and R35 is the round they changed in.
  '05_overseas_inventory_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R35',
  '21_factory_inventory_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R35',
  // S6-R6 — THE FIFTEENTH SWAP. 11_ and 12_ LEAVE OWNERSHIP AT R35 and keep the R34 they earned; 05_ comes
  // BACK into ownership after one release out, and 21_ enters it for the first time since FC-1A-R1. A file
  // moving out and back within two releases is the ledger doing its job in both directions.
  '11_shipping_plan_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R34',
  '12_shipment_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R34',
  // S6-R5 — THE FOURTEENTH SWAP. 05_ and 22_ LEAVE OWNERSHIP AT R34 and keep the R33 they earned. R34 is a
  // shipping-PLAN round: it changes the plan status owner and the shipment existence probe that owner asks.
  // Neither the overseas inventory lifecycle nor the dispatch consume was touched, and marching them to R34
  // would report the release this was cut in rather than the round the files changed in. 11_ enters
  // ownership from R5-R1, which is a nine-release gap and exactly the kind of jump a per-module stamp is
  // supposed to be able to express.
  //
  // 22_ LEFT THIS LIST AT R37 and is an OWNER again — the seventeenth swap, after four releases carried
  // here. The ledger working in both directions over four releases is the strongest evidence there is that
  // these stamps are not being marched to keep a gate green.
  // S6-R4B — 14_, 20_ and 58_ LEAVE OWNERSHIP AT R33 and keep R32, the release they actually changed in.
  // R33 is an overseas-inventory and shipping round; it touches no FC file. Marching their stamps forward
  // would report the round a release was cut in rather than the round the file changed in, which is the one
  // thing a per-module stamp is for.
  '14_fc_write_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R32',
  '20_campaign_write_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R32',
  '58_api_v1_fc_summary_workspace.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R32',
  // 47_ JOINS AT R30 — the tenth swap. FC-ID-R2 changes 14_ and, through the manifest, 63_; it does not
  // touch the recommendation generator, so 47_ keeps R29, the release it actually changed in. Marching
  // it to R30 would erase the one fact its stamp carries, which is what C3 exists to catch.
  '47_api_v1_recommendation_generation.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R29',
  // 14_ LEFT AGAIN AT R32 and is an OWNER once more — the twelfth swap. It was carried at R31 because a
  // read-workspace round has no business moving a write handler's stamp; R32 changes the write handler
  // itself, so the stamp moves with the code that moved. This is the ledger working in both directions
  // within two releases, which is the strongest evidence that the stamps are not being marched.
  // S7-R3 — 01_ LEFT THIS LIST AT R39 and is an OWNER again, after fourteen releases carried here. That is
  // the longest carry in this ledger, and the ledger releasing it only when the file actually changed is
  // the strongest evidence there is that these stamps are not marched to keep a gate green.
  '73_api_v1_pricing_write.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R25'
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
  // 04_ AND 72_ JOIN THIS LIST AT R25, AND 73_/01_/63_ LEAVE IT — the sixth such swap, and the symmetry is
  // the same one the entries below record. R24 changed the pricing_list creation contract in 04_ and the
  // site-scoped workspace read in 72_; R25 changes the pricing WRITE path and the route and manifest that
  // carry it, and touches neither of those files. Marching 04_ or 72_ to R25 would erase the one fact
  // their stamps carry, which is the fault C3 exists to catch.
  '04_marketplace_forecast_import.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R24',
  '72_api_v1_product_pricing_workspace.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R24',
  // 14_ LEFT AGAIN AT R19, and this time nothing took its place — 04_ JOINED. B1-PERF hardens the
  // REGULAR forecast writer, which lives in 04_; no fc_special_events or fc_target_rules handler was
  // touched, so 14_ keeps R18, the round its uniqueness refusal landed in.
  //
  // 04_ JOINED THIS LIST AT R20 AND 20_ LEFT IT — the fourth such swap the ledger has recorded, and the
  // symmetry is exact: R19 batched the REGULAR forecast writer in 04_ and left the campaign line writer
  // alone; R20 batches the campaign line writer in 20_ and touches no regular-forecast handler. Marching
  // 04_ to R20 would erase the one fact its stamp carries.
  // 20_ LEFT THIS LIST AGAIN AT R32, its first move since R20 — the twelfth swap. R32 puts the campaign
  // line writer under the ScriptLock stage 1 has held since R17, so the stamp moves with the code. The
  // historical note below records why it sat here for eleven releases.
  // 20_ JOINED THIS LIST AT R21 AND 01_ LEFT IT — the fifth such swap the ledger has recorded. R20
  // batched the campaign line writer in 20_ and routed nothing; R21 routes a new action in 01_ and
  // touches no campaign handler. Marching 20_ to R21 would erase the one fact its stamp carries, and a
  // project holding the R17 copy of it still cannot save a 90-SKU Special Event — which is exactly what
  // its stamp must keep saying.
  // 04_ LEFT THIS LIST AT R22 — the seventh swap, and the first caused by a DEFECT rather than by a new
  // surface. It held R19 because R19 hardened the regular-forecast writer and nothing since had touched it;
  // PRICING-R4E changes what it writes into a NEW pricing_list row, which is a different responsibility in
  // the same file. Its stamp moves because the file genuinely changed — the one thing a stamp is for.
  //
  // 59_ JOINS THIS LIST AT R22 AND NOTHING TOOK ITS PLACE — the sixth swap this ledger has recorded, and
  // this one is a file LEAVING the owners set without a replacement, which is the shape of a round that
  // deepens an existing surface instead of widening it. R21 gave 59_ the include.pricing gate; R22 changes
  // what the auto_* values CONTAIN and not which table any reader asks for, so 59_ keeps R21 — the round
  // it last actually changed — and marching it to R22 would erase that.
  '59_api_v1_sku_details_workspace.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R21',
  // 14_ LEFT THIS LIST AT R29 AND JOINED RELEASE_OWNERS — the ninth swap, and nothing took its place.
  // FC-ID-R2 adds the canonical marketplace-identity validation to the fc_special_events write path, which
  // is 14_'s own surface, so its stamp moves to the round it actually changed in. It joins the CURRENT
  // unshipped release rather than minting a new one: R26 onward have accumulated unshipped, and cutting a
  // fresh id would march 01_, 47_, 63_, 73_ and 90_ to a release none of them changed in.
  // 58_ LEFT THIS LIST AT R31 AND JOINED RELEASE_OWNERS — the eleventh swap. It held R14 from the round
  // the slice mechanism landed, through every write-path release since, on the rule that reading is not
  // writing. R31 is the round that finally changes the READ owner: the scoped pricing projection is a new
  // slice on its own action, so its stamp moves to the round it actually changed in.
  '13_procurement_handlers.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R12',
  '00_config.gs': 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11',
  // 72_ LEFT THIS LIST AT R24 — the eighth swap, and the one the previous three entries were building
  // towards without knowing it. It stayed at R10 through R21 ("a writer is not a reader") and through R22
  // ("the reconciliation changes what those fields CONTAIN, not which field is read"). Both were correct
  // and both rested on the same premise: that the field this file publishes still means what it meant.
  // PRICING-R4G is the round that broke the premise. regular_price is now a USER OVERRIDE, so publishing
  // it under a business name publishes the wrong concept, and a read owner whose field changed MEANING has
  // changed as surely as one whose field changed name.
  //
  // NOTHING TOOK ITS PLACE, and 59_ above is why that is worth saying. 59_ is the OTHER pricing read
  // transport and it did NOT have to move: it is a raw passthrough that already carried base_*, auto_* and
  // the flags, so the client resolves on that transport with the file untouched. Two read owners, one
  // round, and only the one that reshaped its payload is on the sync list.
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
// R20 — 20_ IS the release. It changed, and 04_ — which WAS R19's owner — kept R19.
// R22 — 04_ MOVES. PRICING-R4E changes what it writes into a NEW pricing_list row, which is a different
// responsibility living in the same file, so the stamp advances because the file genuinely changed. That is
// the one thing a stamp is for, and it is why B2a below insists the new claim is really in the file.
/* S6-R4B — THE PARTITION HAS THREE PARTS, AND THE EXPECTATION NOW READS ALL THREE.
 *
 * `RELEASE_OWNERS[f] ? RELEASE : null` was right while the only alternative to ownership was UNMOVED. It is
 * not: a file can be CARRIED — changed in an earlier unshipped release, still awaiting copy — and a carried
 * file keeps the stamp it earned rather than having none. Reading only the first list made every assertion
 * below fail the moment its file was carried, which is what happened to 14_, 20_ and 58_ at R33. */
function expectedStampFor_(file) {
  if (RELEASE_OWNERS[file]) return RELEASE;
  if (RELEASE_CARRIED[file]) return RELEASE_CARRIED[file];
  return RELEASE_UNMOVED[file] || null;
}

// S3-R10 — 04_ is no longer an owner, so it must keep R24 rather than follow the release. The claim below
// is unchanged in meaning: the file's stamp names the round the file last changed in.
eq(declares(REGWRITE, 'FCREG_BUILD_VERSION_'), RELEASE_UNMOVED['04_marketplace_forecast_import.gs'],
  'B2  04_ keeps R24 — PRICING-R4E changed the pricing_list creation contract it owns, and R25 did not');
ok(/function pricingNewRowPlan_\(/.test(REGWRITE) && /NO_CANONICAL_FX_RATE/.test(REGWRITE),
  'B2a and the change its stamp claims is really in the file — the creation planner and its fail-closed reason');
ok(!/fxRate = 1;/.test(REGWRITE),
  'B2b with the unconditional rate-1 seed it replaced gone, so the stamp is not decoration');
// FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R2 — 14_ IS AN OWNER AGAIN. It was carried at R31 because a
// read-workspace round has no business moving a write handler's stamp; R32 changes the write handler
// itself. The assertion reads whichever list the file is in, which is exactly why it was written against
// the partition and not against a literal — it has now followed 14_ across three releases running.
eq(declares(WRITE, 'FCW_BUILD_VERSION_'), expectedStampFor_('14_fc_write_handlers.gs'),
  'B2-0 14_ keeps the round its referential-integrity gate landed in — R33 is an overseas round and must not march it');
ok(/DANGLING_CAMPAIGN_SKU_LINE_REFERENCE/.test(WRITE) && /CAMPAIGN_SKU_LINE_CAMPAIGN_MISMATCH/.test(WRITE),
  'B2-0c and the change its stamp claims is really in the file — the two refusals the gate emits');
ok(/function fcSeValidateMarketplaceIdentity_\(/.test(WRITE) && /BLANK_MARKETPLACE_ID_REFUSED/.test(WRITE),
  'B2-0a and the change its stamp claims is really in the file — the validator and its blank refusal');
ok(!/fcSeValidateMarketplaceIdentity_[\s\S]{0,400}?byId\[[^\]]*\]\[0\]/.test(WRITE),
  'B2-0b and it validates rather than deriving — no "take the first matching row" anywhere in it');
ok(/LockService\.getScriptLock\(\)/.test(REGWRITE) && /fcRegContiguousRuns_/.test(REGWRITE),
  'B2-0a and the change 04_\'s stamp claims is really in the file — the lock and the bounded runs');
// Scoped to the HANDLER, not the file: 04_ also holds handleImportMarketplaceSkusBatch_, which B1
// did not touch and which still writes the way it always did. Asserting over the whole file would be
// asserting something this release never claimed — and it FAILED that way first.
var REGHANDLER = REGWRITE.slice(REGWRITE.indexOf('function handleImportFcRegularForecastBatch_'));
ok(REGHANDLER.length > 500, 'B2-0b0 the Regular handler is locatable inside 04_');
ok(!/\.setValue\(/.test(REGHANDLER) && !/\.appendRow\(/.test(REGHANDLER),
  'B2-0b with the per-cell and per-row mutations it replaced gone from THAT handler');
// FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R2 — 20_ RETURNS AT R32, its first move since R20. Everything R20
// bought stays exactly as it was: the lock is added AROUND the batched writer, not inside it, so the one
// authoritative read and the coalesced ranges below are untouched.
eq(declares(CAMPWRITE, 'CAMPAIGN_BUILD_VERSION_'), expectedStampFor_('20_campaign_write_handlers.gs'),
  'B2-2 20_ keeps the round its line writer got the lock stage 1 already had');
ok(/CAMPAIGN_SKU_LINE_LOCK_TIMEOUT/.test(CAMPWRITE),
  'B2-2a and the change its stamp claims is really in the file — the typed lock refusal');
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
// untouched by a write-path release, so it must still declare the release it DID change in. At R33 it is
// untouched by an OVERSEAS release for the same reason, so it is carried at R32 and the partition says so.
eq(declares(WSREAD, 'FCSWS_BUILD_VERSION_'), expectedStampFor_('58_api_v1_fc_summary_workspace.gs'),
  'B2a 58_ keeps the release that changed the FC Summary READ workspace it owns');
// And the change its stamp claims is really in the file, on the same test B2-0a/B2-0b apply to 14_ and 04_.
ok(/function fcsPricingProject_\(/.test(WSREAD) && /pricing: \{ reads: \['pricing_list', 'marketplace_skus'\]/.test(WSREAD),
  'B2a-1 and the change its stamp claims is really in the file — the projection and its scoped slice spec');
// PROJECTS, NEVER RESOLVES. The three resolution-input columns appear in 58_ exactly where the projection
// NAMES them — once each, inside FCS_PRICING_FIELDS_ — and nowhere else. A second mention would be a second
// opinion: the moment this file compares an override against an auto value it has become a pricing
// authority, and there is exactly one of those in the tree.
// COMMENTS ARE NOT CODE, and this count is the reason to say so out loud: the projection's own comment
// explains why resolved_regular_price must not be invented as a key, so the raw file names that column
// twice and the file resolves nothing either time. Counting prose as implementation is the same error
// class this repo has caught in the other direction — a declaration read as an execution.
var _WSCODE = WSREAD.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
var _priceMentions = (_WSCODE.match(/auto_regular_price|resolved_regular_price|regular_price_source/g) || []).length;
ok(_priceMentions === 3 && !/pricingResolveBand_|resolvedRegularPrice/.test(_WSCODE),
  'B2a-2 and it PROJECTS rather than RESOLVES — each resolution input named once, in the field list, and no resolver', _priceMentions);
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
// S5-R6 — DERIVED, NOT RESTATED, for the same reason the release itself is read from 63_ rather than pinned.
// This said "the router IS the release", which was true of R21 because R21 routed an action. Three releases
// later it was still demanding it, and the only way to stay green was to march a file that had not changed —
// so a gate written to catch marched stamps was the thing requiring one. What must hold is that the router
// declares the round IT last changed and that the manifest expects the same value, whichever round that is.
// S7-R3 — the round it last changed in IS this release now: R39 adds carrierLeadTime.upsert and
// carrierLeadTime.duplicateCensus, the first router change since R25. The claim is unchanged — the router
// declares the round IT last changed — and that round is no longer an earlier one.
// S7-R4 - AND NOW IT IS AN EARLIER ONE AGAIN. R40 changes no routing; 01_ moves to RELEASE_CARRIED at
// R39. Leaving this pinned to RELEASE would demand exactly the marched stamp the paragraph above says
// this gate was rewritten to stop requiring, one release after it was narrowed. The claim is read from
// the ledger instead, so it holds in both states and discriminates in both: an owner must declare THIS
// release, a carried file must declare the earlier one the ledger names for it.
var ROUTER_DECLARED_EXPECT = Object.prototype.hasOwnProperty.call(RELEASE_OWNERS, '01_router.gs')
  ? RELEASE : RELEASE_CARRIED['01_router.gs'];
ok(!!ROUTER_DECLARED_EXPECT, 'C2a the ledger declares the router somewhere - owned or carried');
eq(declares(ROUTER, 'RTR_BUILD_VERSION_'), ROUTER_DECLARED_EXPECT,
  'C2  01_router.gs declares the round it last changed in, which the ledger names');
Object.keys(RELEASE_CARRIED).forEach(function (f, i) {
  var row = manifestRows(HEALTH).filter(function (r) { return r.file === f; })[0];
  eq(row ? row.expected : '(no row)', RELEASE_CARRIED[f],
    'C2.' + (i + 1) + ' ' + f + ' is carried from an earlier unshipped release and the manifest says so');
});
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
// S5-R6: the old copy to present is the stamp this file carried BEFORE the round it last changed.
// S7-R3: that is now R25 — the stamp the router carried for the fourteen releases before R39 changed it.
// A project still holding an R25 router routes nothing this release added, which is precisely the
// dangerous case: it answers every older action and refuses carrierLeadTime.upsert as invalid, while every
// other probe reports a healthy deployment.
var ROUTER_PRIOR_STAMP = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R25';
var oldRouter = runManifest({ RTR_BUILD_VERSION_: ROUTER_PRIOR_STAMP });
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
// S3-R10 — EXACT AGAIN, and correct again, because BASE now points at this release's base. The first repair
// attempted here loosened this to ">= 1" to survive a stale anchor; that treated the symptom. With BASE moved
// the sharp assertion is the true one.
//
// S7-R3 — THE SPAN NOW HOLDS TWO ACTION-ADDING RELEASES, so the true delta is 2, and it stays EXACT rather
// than being loosened to ">= 1" for exactly the reason recorded above. The unit is one bump per RELEASE that
// changes the action set, not one per action — 63_'s own history says so (FB-4E-R2 moved the list version by
// one for four new entries). R25..R38 contributed one: pricing.write.status. R39 contributes the second:
// carrierLeadTime.upsert and carrierLeadTime.duplicateCensus, together, one bump.
var ACTION_ADDING_RELEASES_SINCE_BASE = 2;
eq(Number(num(HEALTH, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_'))
   - Number(num(priorHealth, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_')), ACTION_ADDING_RELEASES_SINCE_BASE,
  'H2  SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ moved once per action-adding release in this span');
// R22 — INVERTED AGAIN, AND IN THE OPPOSITE DIRECTION FROM R21. R21 was the first release in this series
// to add a route AND a page dependency, so both numbers moved together. R22 adds a route that NO PAGE
// CALLS: pricing.fxReconcile is an operator reconciliation. So the two numbers must now DISAGREE, and that
// disagreement is the assertion — the action contract moves because a route was added, and the required
// -action list does not, because that list is the actions pages depend on and no page gained one.
//
// The pair is checked together on purpose. Moving the list version without growing the list would be a
// number somebody typed; growing the list without moving the version would break 63_'s own stated rule.
function regCount(src) { return ((/var SYS_REQUIRED_ACTIONS_ = \[[\s\S]*?\n\];/.exec(src) || [''])[0]
  .match(/action: '/g) || []).length; }
var _listMoved = Number(num(HEALTH, 'SYS_REQUIRED_ACTION_LIST_VERSION_'))
   - Number(num(priorHealth, 'SYS_REQUIRED_ACTION_LIST_VERSION_'));
var _listGrew = regCount(HEALTH) - regCount(priorHealth);
eq(_listMoved, _listGrew,
  'H3  SYS_REQUIRED_ACTION_LIST_VERSION_ moves exactly as far as SYS_REQUIRED_ACTIONS_ grows — neither is a number somebody typed');
// S3-R10 — this release grew the registry by ONE, and unlike pricing.fxReconcile before it the new action is
// one a PAGE calls: SKU Regional Details asks pricing.write.status whenever a pricing write loses its
// response. H3 above already ties the version move to the registry growth, so this states which way it went.
eq(_listGrew, 1, 'H3a and this release grew it by ONE: a page depends on the route it added');
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
// S7-R4 - the property this always meant is REACHES THE SYNC LIST, which its own message says. Owner and
// carried are two ways onto that list; R40 carries the router, and reading only RELEASE_OWNERS would have
// reported an unsynced router while the operator's list contained it.
ok(Object.keys(RELEASE_OWNERS).concat(Object.keys(RELEASE_CARRIED)).indexOf('01_router.gs') !== -1,
  'H4a and it is DECLARED - owned or carried - so it still reaches the operator\'s sync list; an '
  + 'undeclared router change is how an action reaches production with nobody putting the file on a list');
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
// R22 DECLARES NONE, and that is the assertion rather than a weaker version of it. 73_ has held a manifest
// row since R21; this release gives that same file a SECOND ACTION, which changes what the file does and
// not which files are probed. Membership must move by exactly nothing — the same strict statement in the
// other direction, and the one that would catch a new owner file arriving undeclared.
// R33 DECLARES ONE: 05_ enters the manifest for the first time. Until this round it owned an importer and
// an adjustment handler, both of which either work or visibly do not; it now owns the overseas reservation
// lifecycle, which 12_ and 22_ call BY NAME — so an old 05_ beside a new 12_ throws inside a journalled
// transaction, and a file with no manifest row cannot be reported as stale. Membership must move by exactly
// that row and no other, which is the same strict statement R21 made when 73_ arrived.
eq(nowFiles.filter(function (f) { return priorFiles.indexOf(f) === -1; }), ['05_overseas_inventory_handlers.gs'],
  'H5  the manifest gained EXACTLY the rows this release declares — 05_, and only 05_');
eq(priorFiles.filter(function (f) { return nowFiles.indexOf(f) === -1; }), [],
  'H5a and lost none either — a probe silently dropped is a partial sync nobody can see');
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

  // S5-R6 / S7-R2A: FOUR kinds of member, one copy list — changed this release, carried from an earlier
  // unshipped one, generated, and changed-but-stampless. All four are pasted; only the first expects the
  // current release.
  eq(copy, Object.keys(RELEASE_OWNERS).concat(Object.keys(RELEASE_CARRIED))
    .concat(Object.keys(GENERATED_OWNERS)).concat(Object.keys(STAMPLESS_OWNERS)).sort(),
    'I1  exactly the declared release owners are to be COPIED — no Apps Script file rode along');
  // S7-R4 - THERE IS NOW A DELETE SET, AND IT IS DECLARED RATHER THAN DISCOVERED.
  //
  // This read `eq(gone, [])` because nothing had left the folder since BASE. Seven files left it in R40,
  // and the honest repair is NOT to widen the expectation to whatever git reports - that turns the guard
  // into a mirror. The names are declared, exactly as the copy list is, so an EIGHTH file leaving the
  // folder is still a failure.
  //
  // WHAT THE OPERATOR DOES WITH THIS LIST IS NOT 'nothing'. Removing a file from the repository does not
  // remove it from the Apps Script project. SLIM-R1's live typeof probe found all seven ABSENT from the
  // deployment - 31 corroborating symbol probes, plus the live manifest independently reporting the
  // lifecycle migration in absent_optional_modules - so the expected result of checking is that there is
  // nothing to delete. That is a prediction from evidence, not a licence to skip the check: the probe can
  // only ask about names it already knows, and a file pasted in by hand would never have appeared in it.
  eq(gone, PRODUCTION_DELETE_SET_CANDIDATE,
    'I1a and exactly the declared non-runtime tools are to be DELETED from the folder - relocated to '
    + 'assets/tools/, not destroyed, and every one is still readable at its new path');
  // The retired file carried no build stamp and owned no manifest row, which is why removing it
  // moves no release identity. If it ever had, this would have to rotate the release too.
  ok(Object.keys(RELEASE_OWNERS).indexOf('TEMP_migrate_fc_target_rules_header_r2ba2.gs') === -1,
    'I1b the retired file is still not a release owner, and is no longer in the project at all');
})();

// ================================================================================================
section('K. THE RELEASE IS WRITTEN DOWN WHERE GOVERNANCE LOOKS FOR IT');
// ================================================================================================
// S8-R4B-1A. A release that exists only as a string in two .gs files is a release nobody can review.
// CLAUDE.md names DEPLOYMENT_RELEASE_LOG.md as a governance owner and DEPLOYMENT_RELEASE_GOVERNANCE.md
// calls it the append-only ledger, so the HEAD release must have an entry there.
//
// THE BACKLOG IS NOT THIS ROUND'S TO INVENT, AND IT IS BIGGER THAN IT LOOKS. Measured when this
// section was written: of the releases at or after the R12 floor, only R12 and R13 have an entry.
// R14 THROUGH R40 - twenty-seven consecutive releases - were cut without one. That is a standing
// governance gap, discovered here rather than created here, and backfilling twenty-seven entries
// from their stamps alone would be INVENTING the record rather than keeping it: this round has no
// evidence about what those rounds intended.
//
// So the gap is FROZEN as a census instead of being papered over. K1 holds the line that matters
// going forward - the HEAD release is written down - and K1a pins the backlog exactly, so a
// twenty-eighth unlogged release (a future round cutting without logging) fails here loudly rather
// than joining a gap nobody is counting.
var RELEASE_LOG = read('docs/planning/DEPLOYMENT_RELEASE_LOG.md');
ok(RELEASE_LOG.indexOf(RELEASE) !== -1,
  'K1  the HEAD release has an entry in DEPLOYMENT_RELEASE_LOG.md', RELEASE);
var UNLOGGED = RO.OWNER_STAMPS.filter(function (t) {
  return RO.stampAtOrAfter(t, RELEASE_FLOOR) && RELEASE_LOG.indexOf(t) === -1;
});
var UNLOGGED_BACKLOG = [];
for (var _u = 14; _u <= 40; _u++) { UNLOGGED_BACKLOG.push('F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R' + _u); }
eq(UNLOGGED, UNLOGGED_BACKLOG,
  'K1a the unlogged backlog is EXACTLY R14..R40, the twenty-seven releases cut before this check '
  + 'existed - a twenty-eighth means a release was cut this round without being written down');
ok(UNLOGGED.indexOf(RELEASE) === -1,
  'K1a1 and the HEAD release is not among them, which is the half of K1a that will still be true '
  + 'after the backlog is someday paid down');
ok(/NOT DEPLOYED/.test(RELEASE_LOG.slice(RELEASE_LOG.indexOf(RELEASE))),
  'K1b the HEAD entry records that it has NOT been deployed - the ledger may not claim a deployment '
  + 'that nobody performed');

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
  // S5-R6 — rotated onto 63_'s own row, for the reason this comment gives at every rotation: the anchor has
  // to be a row that EXPECTS THE RELEASE, and at R28 that is 63_'s alone. The router has gone back to R25.
  var faked = HEALTH.replace(
    "symbol: 'SYS_BUILD_VERSION_', expected: '" + RELEASE + "'",
    "symbol: 'SYS_BUILD_VERSION_', expected: '" + PREV_RELEASE + "'");
  if (faked === HEALTH) throw new Error('M7 anchor drifted — the mutant would inject no fault');
  var row = manifestRows(faked).filter(function (r) { return r.symbol === 'SYS_BUILD_VERSION_'; })[0];
  return !!row && declares(HEALTH, 'SYS_BUILD_VERSION_') !== row.expected;
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
  return Number(num(faked, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_')) - Number(prior) !== ACTION_ADDING_RELEASES_SINCE_BASE;
});
mutant('M13', 'the router changes but is left out of the release owner set', function () {
  // The fault: 01_ is edited, its stamp is rotated, and the ledger still calls it CARRIED. C3 reads
  // the owner set, so a router that expects the release while sitting in RELEASE_CARRIED is exactly
  // the half-done cut this round started from.
  var owners = Object.keys(RELEASE_OWNERS).filter(function (f) { return f !== '01_router.gs'; });
  var atRel = manifestRows(HEALTH).filter(function (r) { return r.expected === RELEASE; })
    .map(function (r) { return r.file; }).sort();
  return JSON.stringify(atRel) !== JSON.stringify(owners.sort());
});
mutant('M14', 'R40 history rewritten so the router looks like it was an owner all along', function () {
  // The fault this round was told NOT to commit: making the past describe the present. R40's owner
  // set is 63_ alone. If 01_ were retro-fitted into it, the one fact the R39/R40 entries exist to
  // preserve - that the router did not change in R40 - would be gone, and H2 in the deploy-surface
  // suite would have nothing left to be a historical invariant ABOUT.
  var r40 = cp.execFileSync('git', ['diff', '--name-only', '085c2fd', 'ff8246e'],
    { cwd: REPO, encoding: 'utf8' }).trim().split(String.fromCharCode(10)).filter(Boolean)
    .filter(function (f) { return f.indexOf(GS) === 0 && f.indexOf('/TEMP_') === -1; });
  // git is the witness, and it does not agree with the rewritten claim.
  return r40.indexOf(GS + '01_router.gs') === -1 && r40.length === 1;
});
mutant('M15', 'the release is cut in the source but never written into the governance ledger',
function () {
  var stripped = RELEASE_LOG.split(RELEASE).join('R-NOT-LOGGED');
  return stripped.indexOf(RELEASE) === -1 && RELEASE_LOG.indexOf(RELEASE) !== -1;
});

// Vacuity — every mutant predicate must be FALSE against the unmutated tree, or it proves nothing.
var vacuous = [];
[['M1', function () { return runManifest().stale_modules.length === 0; }],
 ['M2', function () { return runManifest().stale_modules.length === 0; }],
 ['M3', function () { return runManifest().absent_modules.length === 0; }],
 ['M4', function () { return runManifest().stale_modules.length === 0; }],
 ['M5', function () { return RO.stampAtOrAfter(RELEASE, PREV_RELEASE); }],
 ['M6', function () { return RO.BUILD_STAMP_RE.test(RELEASE); }],
 ['M7', function () { return declares(HEALTH, 'SYS_BUILD_VERSION_') === RELEASE; }],
 ['M8', function () { return declares(BUNDLE, 'KM_BUNDLE_CONTENT_HASH_') !== null; }],
 ['M9', function () { return declares(BUNDLE, 'KM_BUNDLE_CONTENT_HASH_')
     === (BUNDLE.match(/^\/\/ bundle_sha256 = ([0-9a-f]{64})$/m) || [])[1]; }],
 ['M5a', function () { var row = manifestRows(HEALTH).filter(function (r) { return r.file === '13_procurement_handlers.gs'; })[0];
     return !!row && row.expected === declares(PROC, 'PROC_BUILD_VERSION_'); }],
 ['M10', function () { return RO.OWNER_STAMPS[RO.OWNER_STAMPS.length - 1] === RELEASE
     && RO.stampAtOrAfter(RELEASE, PREV_RELEASE); }],
 ['M11', function () { return manifestRows(HEALTH).some(function (r) { return r.file === '14_fc_write_handlers.gs'; }); }],
 ['M13', function () {
   var atRel = manifestRows(HEALTH).filter(function (r) { return r.expected === RELEASE; })
     .map(function (r) { return r.file; }).sort();
   return JSON.stringify(atRel) === JSON.stringify(Object.keys(RELEASE_OWNERS).sort());
 }],
 ['M14', function () { return Object.prototype.hasOwnProperty.call(RELEASE_OWNERS, '01_router.gs'); }],
 ['M15', function () { return RELEASE_LOG.indexOf(RELEASE) !== -1; }],
 // M12's predicate must be FALSE against the unmutated tree: the real contract DID move, once per
 // action-adding release in this span.
 ['M12', function () {
   return Number(num(HEALTH, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_'))
        - Number(num(priorHealth, 'SYS_DEPLOYED_ACTION_CONTRACT_VERSION_')) === ACTION_ADDING_RELEASES_SINCE_BASE;
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
