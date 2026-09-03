// SHARED RELEASE ORDER — F1-7N-FB-4E-R4B-R3.
//
// NOT a test. Four suites each kept their own hand-copied list of release tokens and their own regex for a
// build stamp, and every round had to append the same line to all of them — which is why four suites failed
// R4B-R3 for a reason that had nothing to do with what they test. A list maintained in four places is not a
// contract; it is four chances to disagree. The order lives here once.
//
// APPEND-ONLY. A round adds its token at the END. Nothing is ever removed or reordered: the whole point of the
// list is that "at or after round X" is answerable, and rewriting history would make an older suite's floor
// mean something different than it did when it was written.
'use strict';

var ROUND_TOKENS = [
  'donenotice-20260811',
  'fb4e-transport-20260826',
  'fb4c-scope-registry-20260826',
  'fb4er1-contract-probe-20260827',
  'fb4er2-action-registry-20260827',
  'fb4er3-lifecycle-20260827',
  'fb4er4a-correlation-20260827',
  'fb4er4a1-readtransport-20260827',
  'fb4er4b-readback-20260831',
  'fb4er4br1-authority-20260831',
  'fb4er4br2-hydrationjoin-20260831',
  'fb4er4br3-liveclosure-20260831',
  // F1-7N-SKU-DETAILS-DISPLAY-INIT-R1 - SKU Details Display column initialization. sku-details.js changed, and
  // it sits in BOTH co-deployed sets the FB-4D and FB-4E suites police, so the whole application set rotates
  // together. A token that moves for one member and not the others can still ship a half-updated page.
  'skudisplayinit-20260901',
  // F1-7N-FB-4F-B6 - Legacy route explicit confirmation + hydration repair. inventory-replenishment.js and
  // inventory-compat.js both changed, and they are co-deployed with the API/transport files in this same set:
  // a page that hydrates a persisted destination against an api layer from a different round is exactly the
  // half-updated deployment the shared token exists to make impossible.
  'fb4fb6-legacyroute-20260901',
  // F1-7N-FB-4F-B6-R1 - Expected Arrival structured-value closure. A NEW token rather than a reuse of B6's,
  // and the reason is a fact rather than a preference: B6 is already on origin/main (its commit 60afa6e was
  // pushed), so its bytes have left the repository and any build serving them has handed browsers
  // `?v=fb4fb6-legacyroute-20260901`. Reusing that token would leave every one of those browsers on the B6
  // copy of inventory-replenishment.js forever, which is precisely the half-updated deployment the shared
  // token exists to prevent. A token may only be reused while nothing carrying it has been published.
  'fb4fb6r1-etasnapshot-20260901',
  // F1-7N-FB-4G-A0 - CO1100-R live hydration closure. B6-R1 is on origin/main (82da01c was pushed), so by the
  // rule recorded above its token has been published and cannot be reused. This round changes the SOURCE the
  // Execution Plan hydrate reads, so a browser left on the previous copy would keep reading a cache the server
  // never fills and would keep showing a default editor for a route that exists in the database.
  'fb4ga0-livehydration-20260902',
  // F1-7N-FB-4G-A0-R1 - destination XOR + persisted method selection. A0 is on origin/main (60e5ef3 was
  // pushed), so by the rule above its token has been published and cannot be reused. This round changes both
  // inventory-replenishment.js and inventory-compat.js, and a browser holding one file from each round would
  // have a page whose Method picker calls an identity helper the shared module does not yet export.
  'fb4ga0r1-destxor-20260902',
  // F1-7N-FB-4G-A0-R2 - server canonical destination completeness. A0-R1 is on origin/main (1f91d3b was
  // pushed), so by the rule above its token has been published. This round changes CLIENT code, not just
  // tests: isRouteComplete, routeHeaderFields and the page gates all stopped accepting a route that carries
  // two contradictory destinations, so a browser left on the old copy would keep sending one.
  'fb4ga0r2-destauthority-20260902',
  // F1-7N-FB-4G-A1 - Recommendation Summary + Execution Plan atomic reveal. A0-R2 is on origin/main
  // (6b49320 was pushed), so by the rule above its token has been published and cannot be reused. This
  // round changes inventory-replenishment.js and inventory-compat.js together: the page now asks a reveal
  // owner that only the shared module exports, so a browser holding one file from each round would expand a
  // SKU into a decision area that never leaves its skeleton.
  'fb4ga1-atomicreveal-20260902',
  // F1-7N-FB-4G-A1-R1 - panel-local planning readiness + the duplicate workspace read removed. A1 is on
  // origin/main (c9517ec was pushed), so by the rule above its token has been published and cannot be
  // reused. This round changes inventory-replenishment.js, inventory-compat.js AND core/method-registry.js
  // together: the page seeds the registry through a method the previous registry copy does not have, and a
  // browser holding any one of the three from the older round would either issue the duplicate workspace
  // read again or fail to seed at all.
  'fb4ga1r1-panelready-20260902',
  // F1-7N-FB-4G-A2 - Submit Plan preflight, one dirty owner and a confirmation. A1-R1 is on origin/main
  // (418971a was pushed), so by the rule above its token has been published and cannot be reused. This round
  // changes inventory-replenishment.js and inventory-compat.js together: the page asks a preflight owner that
  // only the shared module exports, so a browser holding one file from each round would either lose the
  // unsaved-change guard or lose the confirmation that precedes every submit request.
  'fb4ga2-submitpreflight-20260902',
  // F1-7N-FB-4G-A2-R1 + A2-R2 ship as ONE frontend release. A2-R1 rewrote the Submit chain so it never saves,
  // and A2-R2 rewrote how a route write declares itself (intent, stable route instance identity, event-scoped
  // persistence). inventory-replenishment.js and inventory-compat.js change together in both: the page sends an
  // intent only the shared module's payload builder emits, and asks a preflight owner only that module exports.
  // A browser holding one file from each round would either save a route with no declared intent - which the
  // A2-R2 server refuses with zero writes - or lose the confirmation that precedes every submit request.
  'fb4ga2r2-routeintent-20260902',
  // F1-7N-FB-4G-A2-R3. Three browser files move together and none of them works with an older sibling:
  // inventory-replenishment.js now issues ONE atomic route write, operation-system-db-api.js is where that
  // action's adapter lives (there was none before, so the page could not call it at all), and
  // inventory-compat.js emits the intent + create_idempotency_key the atomic writer requires. A browser
  // holding a mixed set would either call an adapter that does not exist, or send a create with no
  // idempotency key - which the A2-R3 server refuses with zero writes.
  'fb4ga2r3-atomicroute-20260902',
  // F1-7N-FB-4G-A2-R3-R1. The A2-R3 client could not acknowledge the atomic writer's own success envelope,
  // so every route save reported OUTCOME UNKNOWN while the row was in fact written, and the version it
  // failed to adopt made every later edit STALE_OPTIMISTIC_TOKEN. The page, the transport adapter and 16_
  // move together: an older page against this server still cannot read the header classification.
  'fb4ga2r3r1-savefix-20260903',
  // F1-7N-FB-4G-A2-R4. The Execution Plan collector and the transport adapter move together: an older page
  // still erases a route's identity the moment an edit leaves it briefly incomplete, and an older adapter
  // still pins a symbol that now lives in a different file.
  'fb4ga2r4-stableentity-20260903',
  // F1-7N-FB-4G-A3. The Submit preflight and its one pure predicate move together: an older page still
  // lets a visibly incomplete route be dropped from the plan in silence, and an older predicate cannot
  // count the Weekly Shipping Plans the confirmation now promises.
  'fb4ga3-submitreadiness-20260903'
];

// The newest entry is the current APPLICATION token, by construction rather than by restatement - the same
// treatment currentMapToken() already gives the map series, and for the same reason. Four suites had pinned the
// literal `fb4er4br3-liveclosure-20260831` with a count of 18; every one of them meant "a MAP round must not
// move the application token", and every one of them would have failed the first time an APPLICATION round
// legitimately moved it. That is the equality-with-now this file exists to end.
function currentAppToken() { return ROUND_TOKENS[ROUND_TOKENS.length - 1]; }

// ---------------------------------------------------------------------------------------------------------
// THE MAP TOKEN SERIES — added in TEXTURE-3-R6, and the reason is the same failure one round later.
//
// R5 replaced "the co-deployed map set shares ONE token" with a DERIVED rule: a map file whose source carries
// this round's marker must carry this round's token, and one that does not must not. That rule was right, and
// it still rotted immediately — because "this round" was written into three suites as the literal strings
// `TEXTURE-3-R5` and `map-texture3-r5-20260831`. The moment R6 rotated two files, all three suites failed while
// describing the correct state.
//
// A rule that has to be edited in three places every round is the four-way duplication this file was created to
// end, wearing a different hat. So the series lives here, APPEND-ONLY, and the current round is DERIVED from its
// last entry — including the source marker, which is reconstructed from the token rather than restated. A round
// now appends ONE line here and nothing else moves.
// ---------------------------------------------------------------------------------------------------------
var MAP_TOKEN_SERIES = [
  'map-zh-hant-20260826',
  'map-texture3-r2-20260826',
  'map-texture3-r3-20260826',
  'map-texture3-r4-20260827',
  'map-texture3-r5-20260831',
  'map-texture3-r6-20260831',
  'map-texture3-r8-20260831',
  'map-labelmode-r9-20260831',
  'map-labelcopy-r9a-20260831'
];

// The newest entry is the current round's token, by construction rather than by restatement.
function currentMapToken() { return MAP_TOKEN_SERIES[MAP_TOKEN_SERIES.length - 1]; }

// ---------------------------------------------------------------------------------------------------------
// THE MAP BROWSER FILE INVENTORY — added in TEXTURE-3-R8, and the reason is the R6 lesson one level further in.
//
// R6 moved "which round is current" here because three suites each kept their own copy and all three broke the
// moment a round rotated a file. That worked. What R6 left behind was the OTHER half of the same rule: the SET
// of files the rule applies to was still a hand-maintained list inside each suite.
//
// R8 is the first round to change a map browser file that was in neither list — global-logistics-map.js, the
// page that owns the lazy ADM1 loader. The derived rule then reported, correctly and uselessly, that no map
// file carried this round's marker: 3 assertions across 2 suites failed while describing a true state, because
// the inventory they measured was incomplete rather than because anything was wrong.
//
// So the inventory lives here as well. A round that touches a map browser file now appends nothing at all; a
// round that introduces one appends ONE line here and no suite changes.
// ---------------------------------------------------------------------------------------------------------
// TEXTURE-3-R9 — the map page's STYLESHEET joins the inventory. R8 added the page because R8 was the round that
// changed it; R9 is the round that changes its CSS, and a stylesheet a browser caches is exactly as capable of
// serving a stale segmented control as a script is of serving stale behaviour.
var MAP_BROWSER_FILES = [
  'assets/js/data/geo-names-zh-hant.js',
  'assets/js/data/geo-display-aliases-zh-tw.js',
  'assets/js/data/geo-admin1-display-names-zh-tw.js',
  'assets/js/core/geo-name-resolver.js',
  'assets/js/lib/km-geo-topology.js',
  'assets/js/lib/km-globe.js',
  'assets/js/pages/global-logistics-map.js',
  'assets/css/pages/global-logistics-map.css'
];

// The in-source marker that identifies work done in a given round, derived FROM the token so the two cannot
// disagree: 'map-texture3-r6-20260831' -> 'TEXTURE-3-R6'. The pre-texture3 tokens have no marker of this shape,
// which is correct — they predate the convention — and return ''.
//
// TEXTURE-3-R9 — THE FAMILY SEGMENT IS NOT THE MARKER. This pattern was pinned to the literal `texture3`, and
// R9's token is `map-labelmode-r9-20260831` — a different family on the same round series. The old pattern
// returned '' for it, and an EMPTY marker is worse than a wrong one: every caller does
// `new RegExp(currentMapRoundMarker())`, and `new RegExp('')` matches every file, so every map file would have
// been judged "changed this round" and required to carry the R9 token. A rule that silently becomes universal is
// the failure mode this derivation exists to prevent, so the family is now any segment and the ROUND is what is
// captured. The marker prefix stays TEXTURE-3 because that is the line these rounds belong to, whatever a given
// round's token is named after.
//
// The empty case is still reachable for a genuinely pre-convention token, so callers that build a RegExp from it
// must not be handed ''. currentMapRoundMarkerRe() below is the guarded way to ask.
function mapRoundMarker(token) {
  var m = /^map-[a-z0-9]+-(r\d+[a-z]?\d*)-/.exec(String(token || ''));
  return m ? ('TEXTURE-3-' + m[1].toUpperCase()) : '';
}
function currentMapRoundMarker() { return mapRoundMarker(currentMapToken()); }
// The guarded form. Returns a RegExp that matches the current round's marker, or — if the current token carries
// no derivable round — one that matches NOTHING, rather than the everything-matching /(?:)/ that `new RegExp('')`
// would hand back. A suite asking "did this file change this round?" must get 'no' from a broken derivation, not
// 'yes' for every file in the tree.
function currentMapRoundMarkerRe() {
  var m = currentMapRoundMarker();
  return m ? new RegExp(m) : /(?!)/;
}
function isMapToken(t) { return MAP_TOKEN_SERIES.indexOf(String(t)) !== -1; }
function mapTokenIndex(t) { return MAP_TOKEN_SERIES.indexOf(String(t)); }
// THE FLOOR COMPARISON, and the reason a round's suite needs it. Four rounds running, a round's own suite has
// asserted "this file carries MY token" as an equality — and then the next round legitimately moved the file
// and the assertion failed while describing a correct state. R5 broke R4's, R6 broke R5's, R8 broke R6's, R9
// broke R6's and R8's.
//
// The durable statement is not an equality with "now". It is a FLOOR: a file whose content moved in round N must
// never be served from a token OLDER than N. That still catches the defect the equality was written for — a
// round that changed a file and forgot to rotate it — and it stays true forever afterwards, because later rounds
// only ever move the token forward.
function mapTokenAtOrAfter(t, floorToken) {
  var i = mapTokenIndex(t), f = mapTokenIndex(floorToken);
  return i !== -1 && f !== -1 && i >= f;
}
// index.html versions BOTH <script src> and <link href>, and until R9 every consumer of this file parsed only
// the script tags — written out separately in each suite. R9 puts a stylesheet under the same token discipline,
// so the parser becomes shared rather than copied a third time.
function parseIndexTokens(indexHtml) {
  var out = {}, m;
  var reScript = /<script[^>]*\ssrc="([^"?]+)(?:\?v=([^"]*))?"/g;
  while ((m = reScript.exec(String(indexHtml)))) { if (!(m[1] in out)) out[m[1]] = m[2] === undefined ? null : m[2]; }
  var reLink = /<link[^>]*\shref="([^"?]+)(?:\?v=([^"]*))?"/g;
  while ((m = reLink.exec(String(indexHtml)))) { if (!(m[1] in out)) out[m[1]] = m[2] === undefined ? null : m[2]; }
  return out;
}

// The CANONICAL SHAPE of an Apps Script owner build stamp. The project stamps revisions of revisions
// (F1-7N-FB-4E-R4B-R3 is the third revision of the second revision of round 4E), so the revision segment
// repeats. A pattern that admitted only ONE revision segment rejected a legitimate stamp the moment a round
// needed a second one — which is exactly what happened in R4B-R3.
var BUILD_STAMP_RE = /^F1-7N-[A-Z]+-\d+[A-Z](?:-R\d+[A-Z]?\d*)*$/;

// F1-7N-FB-4G-A0-R1 — THE 16_ OWNER-STAMP ORDER, and it lives HERE because it was living in four places.
// B3, B4, B5 and FB-4F-A each carried their own copy of this array to answer "is the allocation owner build at
// or after round X". A0-R1 moved the stamp and broke all four in one step — the exact failure a duplicated
// constant exists to produce. Append-only; a round that moves SAD_BUILD_VERSION_ adds one line here and
// nowhere else.
var OWNER_STAMPS = ['F1-7N-FB-4D', 'F1-7N-FB-4F-B1', 'F1-7N-FB-4F-B3', 'F1-7N-FB-4F-B6', 'F1-7N-FB-4G-A0-R1', 'F1-7N-FB-4G-A0-R2', 'F1-7N-FB-4G-A2', 'F1-7N-FB-4G-A2-R2', 'F1-7N-FB-4G-A2-R3', 'F1-7N-FB-4G-A2-R3-R1', 'F1-7N-FB-4G-A2-R4', 'F1-7N-FB-4G-A3'];
// True when `stamp` is a known owner stamp at or after `floor` in that order.
function stampAtOrAfter(stamp, floor) {
  var i = OWNER_STAMPS.indexOf(String(stamp)), f = OWNER_STAMPS.indexOf(String(floor));
  return i !== -1 && f !== -1 && i >= f;
}

// Index of a token in the release order; -1 when unknown (a typo, or a token that was never released).
function tokenIndex(t) { return ROUND_TOKENS.indexOf(String(t)); }
// True when `t` is a known token at or after `floorToken` in the release order.
function tokenAtOrAfter(t, floorToken) {
  var i = tokenIndex(t), f = tokenIndex(floorToken);
  return i !== -1 && f !== -1 && i >= f;
}

module.exports = {
  ROUND_TOKENS: ROUND_TOKENS,
  MAP_TOKEN_SERIES: MAP_TOKEN_SERIES,
  MAP_BROWSER_FILES: MAP_BROWSER_FILES,
  currentAppToken: currentAppToken,
  currentMapToken: currentMapToken,
  currentMapRoundMarker: currentMapRoundMarker,
  currentMapRoundMarkerRe: currentMapRoundMarkerRe,
  mapRoundMarker: mapRoundMarker,
  isMapToken: isMapToken,
  mapTokenIndex: mapTokenIndex,
  mapTokenAtOrAfter: mapTokenAtOrAfter,
  parseIndexTokens: parseIndexTokens,
  BUILD_STAMP_RE: BUILD_STAMP_RE,
  tokenIndex: tokenIndex,
  tokenAtOrAfter: tokenAtOrAfter,
  OWNER_STAMPS: OWNER_STAMPS,
  stampAtOrAfter: stampAtOrAfter
};
