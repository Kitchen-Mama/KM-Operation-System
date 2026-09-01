/**
 * 69_api_v1_route_identity_contract.gs
 *
 * F1-7N-FB-4F-B1 — ROUTE IDENTITY + APPEND-ONLY SCHEMA CONTRACT.
 * FROZEN, DETERMINISTIC MACHINERY. NOT ROUTED — and, since B3, LIVE-WIRED.
 *
 * F1-7N-FB-4F-B3 — THIS FILE IS NOW A SYNCHRONIZED OWNER. B1 landed it inert: unrouted, unmanifested, called
 * by nothing, because a contract round must not deploy. B3 is the round that makes the runtime compatible with
 * the columns these rules describe, so 16_shipping_allocation_handlers.gs now CALLS ricRoutePersistability_,
 * ricDestinationIdentity_, ricK4GroupKey_ and ricK4DeterministicHeaderId_ rather than reimplementing them, and
 * this file gains its entry in 63_api_v1_system_health.gs's build manifest. It is still NOT ROUTED: it exposes
 * no action and no verb, and B3 adds neither. A pure identity helper does not need a route to be reachable -
 * Apps Script shares one global scope - and creating one merely to expose it would add an action contract this
 * round has no business changing.
 *
 * THE RULES THEMSELVES ARE UNCHANGED. Not one predicate, dimension, label or refusal code below moved in B3.
 * The K4 key is the same eleven dimensions in the same order, sea and sea_express remain two services and two
 * identities, and the destination stays an exclusive choice between a warehouse and a marketplace. Only the
 * file's STATUS changed, which is why the build stamp moves and nothing else does.
 *
 * WHY THIS IS A SEPARATE FILE, WHICH IS THE FIRST DECISION OF THE ROUND.
 *
 * The obvious home for these functions is 16_shipping_allocation_handlers.gs, next to the K2 contract they
 * extend. They were written there first, and the repository refused — correctly. Two guards fired:
 *
 *   1. `action-registry-and-router-completeness-f1-7n-fb-4e-r2` asserts, by name, that
 *      `16_shipping_allocation_handlers.gs (the allocation writer this diagnostic reports on) is UNCHANGED
 *      since the R1 commit`. That is a deliberate protection of the one file that writes allocation drafts, and
 *      B1 is a CONTRACT round that must not touch the live writer.
 *
 *   2. Bumping SAD_BUILD_VERSION_ to declare the change put the whole project into DEPLOYMENT_PARTIAL_SYNC:
 *      63_api_v1_system_health.gs pins each owner file's expected stamp against the deployment build, so
 *      changing a stamp announces "this file is not the one that is deployed". That detector exists to make a
 *      half-finished sync a NAMED fact, and it was telling the truth — B1 does not deploy. A stamp and its
 *      manifest entry must move together, in the round that actually syncs the file. That round is B2.
 *
 * So the machinery lives here: a new file, not routed, calling into nothing. In B1 it was also called by
 * nothing and carried no manifest entry; B3 is the round that wires it and manifests it, in the same step that
 * teaches the writer the new columns. It still changes no action contract and no verb.
 *
 * B2 was expected to do that and did not, for a reason worth keeping: B2 measured that appending a column
 * BEFORE the runtime knows it makes every allocation read and write fail closed, because the header write gate
 * is positional and exact. So the order is code first, then schema - which puts the sync in B3, ahead of any
 * append, rather than alongside one.
 *
 * DEPENDENCY: sadFnv1a_ from 16_shipping_allocation_handlers.gs. Apps Script shares one global scope across
 * files, so the hash authority is reused rather than copied — a second implementation of a hash is a second
 * answer waiting to disagree.
 *
 * NOT ROUTED, and that is asserted: no doGet/doPost entry, no action name, no registry symbol.
 */

var RIC_BUILD_VERSION_ = 'F1-7N-FB-4F-B3';

// ================================================================================================================
// §B — THE CANONICAL SERVICE. sea != sea_express, and that is a price and a date, not a preference.
// ================================================================================================================
// Regular ocean (普船) and express ocean (快船, incl. 美森海卡) are separate services with separate rate cards and
// separate lead times. B1 found one live place where the distinction was already being lost — the Execution
// Plan's lead-time mapper collapsed sea_express to Sea by prefix, so every express-ocean ETA was computed from
// the regular-ocean transit days — and this file exists partly so that the rule has one home.
//
// The OWNER of the exact service on shipping_allocation_drafts is the existing `recommended_shipping_method`
// column, and NO second column is added. Two frozen documents settle that:
//   · CARRIER_AND_ROUTE_SPEC.md §4.5 — transit_type is the canonical main-mode enum on the CARRIER tables.
//   · SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md §164 — "If the existing DB keeps the
//     column name recommended_shipping_method, do not also create a duplicate recommended_transit_type column."
var RIC_CANONICAL_SERVICES_ = ['air', 'sea', 'sea_express', 'rail', 'truck'];

// Display spellings a carrier import or a picker may legitimately carry, mapped EXACTLY. There is deliberately
// no prefix, family or transport-mode entry: 'sea' must never answer for 'sea_express', in either direction.
var RIC_SERVICE_LABELS_ = {
  'air': 'air', 'sea': 'sea', 'sea express': 'sea_express', 'sea_express': 'sea_express',
  'rail': 'rail', 'truck': 'truck',
  '空運': 'air', '普船': 'sea', '快船': 'sea_express', '美森海卡': 'sea_express'
};

// Canonical service from any accepted spelling. Returns '' for anything unrecognised — NEVER a neighbouring
// service, never a family, never a mode. A caller that receives '' must REFUSE, not substitute.
function ricCanonicalService_(v) {
  var t = String(v == null ? '' : v).trim().toLowerCase();
  if (!t) return '';
  if (RIC_CANONICAL_SERVICES_.indexOf(t) !== -1) return t;
  if (RIC_SERVICE_LABELS_.hasOwnProperty(t)) return RIC_SERVICE_LABELS_[t];
  return '';
}

// ================================================================================================================
// §C — DESTINATION IDENTITY: WAREHOUSE or MARKETPLACE, exclusively.
// ================================================================================================================
// `Amazon` is a marketplace and must never be written into a warehouse-id column. A route carrying BOTH
// identities, or NEITHER while claiming to be complete, is not a route.
//
// NO `destination_type` COLUMN IS PROPOSED, and that is a decision rather than an omission. The type is
// DERIVABLE from which of the two mutually exclusive fields is populated. A third column that can disagree with
// the other two is a contradiction waiting to be persisted — and §C says not to add one for convenience.
// Hydration therefore reads the type from the DATA and never from a UI label: this function touches no label,
// display or text field at all.
var RIC_DESTINATION_TYPES_ = ['WAREHOUSE', 'MARKETPLACE'];

function ricDestinationIdentity_(h) {
  h = h || {};
  function s(v) { return String(v == null ? '' : v).trim(); }
  var wid = s(h.recommended_destination_warehouse_id) || s(h.destination_warehouse_id);
  var mkt = s(h.destination_marketplace);
  if (wid && mkt) return { type: '', id: '', ok: false, code: 'ROUTE_DESTINATION_AMBIGUOUS' };
  if (wid) return { type: 'WAREHOUSE', id: wid, ok: true, code: '' };
  // Trimmed and lower-cased, so display spelling cannot mint a second identity for one marketplace.
  if (mkt) return { type: 'MARKETPLACE', id: mkt.toLowerCase(), ok: true, code: '' };
  return { type: '', id: '', ok: false, code: 'ROUTE_DESTINATION_MISSING' };
}

// ================================================================================================================
// §E — THE VERSIONED KEY, AND WHY IT CANNOT BE K2
// ================================================================================================================
// K2's ten dimensions carry no destination marketplace, so a marketplace route and a destination-less route
// produce the SAME key today. That is the identity half of the FB-4F-A refusal, and it is real.
//
// But the fix cannot be to add a dimension to sadK2GroupKey_. Appending a field changes the joined string for
// EVERY row — including the thousands whose new field is blank — so every SADH-K2-* id would regenerate
// differently and every existing header would be re-keyed. §E forbids that, and it would be a silent bulk
// migration wearing the clothes of a refactor.
//
// So sadK2GroupKey_ is left BYTE-IDENTICAL and K4 is the successor. K4, not K3: `K3` is the LANDED live scope
// that sadResolveActiveDraftK2OrK3_ already resolves against, so the name is taken. The number is a version,
// not a ranking.
//
// K4 = K2's ten dimensions in the same frozen order, minus the raw destination-warehouse dimension, plus:
//     destination_type            DERIVED — WAREHOUSE | MARKETPLACE
//     destination_identity        the warehouse id, or the trimmed+lowercased marketplace
// and with the service passed through ricCanonicalService_, so a display label and its enum cannot become two
// identities for one service, while sea and sea_express remain two identities for two services.
//
// NOT IN THE KEY, DELIBERATELY: quantity, expected arrival, notes, audit timestamps, draft version. Changing
// only the ETA must UPDATE the same route — and the SCHEMA SHAPE already guarantees it, because expected
// arrival is a LINE field in the canonical model (DATABASE_RELATIONSHIP_MAP §360) while route identity is a
// HEADER key. A line attribute cannot reach a header key. That is stronger than a rule someone has to remember.
var RIC_K4_GROUP_DIMENSIONS_ = ['planning_cycle', 'company', 'country', 'marketplace', 'source_page',
  'recommended_source_warehouse_id', 'destination_type', 'destination_identity',
  'recommended_shipping_method_canonical', 'recommended_last_mile_delivery', 'recommendation_group_no'];

function ricK4GroupKey_(h) {
  h = h || {};
  function s(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function pick(canon, alias) { var a = h[canon]; if (a == null || a === '') a = h[alias]; return s(a); }
  var dest = ricDestinationIdentity_(h);
  return [s(h.planning_cycle), s(h.company), s(h.country), s(h.marketplace),
    s(h.source_page || 'inventory_replenishment'),
    pick('recommended_source_warehouse_id', 'source_warehouse_id'),
    s(dest.type), s(dest.id),
    ricCanonicalService_(h.recommended_shipping_method != null && h.recommended_shipping_method !== ''
      ? h.recommended_shipping_method : h.shipping_method),
    pick('recommended_last_mile_delivery', 'last_mile_delivery'),
    s(h.recommendation_group_no)].join('|');
}

// SADH-K4-<upper FNV1a hex>. A DIFFERENT PREFIX ON PURPOSE: a K4 id can never be misread as a K2 id, so no
// resolver, log line or operator can confuse the two generations, and a mixed-generation sheet stays legible.
// sadFnv1a_ is reused from 16_shipping_allocation_handlers.gs rather than reimplemented — one hash, one answer.
function ricK4DeterministicHeaderId_(h) { return 'SADH-K4-' + sadFnv1a_(ricK4GroupKey_(h)).toUpperCase(); }

// ================================================================================================================
// §D/§G — TYPED REFUSALS. Nothing is silently dropped, and no request can grow the schema.
// ================================================================================================================
// A runtime handed a value it cannot persist must SAY SO. Dropping it silently is exactly how the live sheet
// came to hold a route with a blank destination and a `sea` method for a request that said Amazon and
// sea_express: the write SUCCEEDED and the truth did not survive it.
var RIC_SCHEMA_REFUSALS_ = {
  COLUMN_ABSENT: 'ALLOCATION_DRAFT_SCHEMA_COLUMN_ABSENT',
  ROUTE_IDENTITY: 'ROUTE_IDENTITY_NOT_PERSISTABLE',
  EXPECTED_ARRIVAL: 'EXPECTED_ARRIVAL_NOT_PERSISTABLE'
};

// The append-only columns B2 will add, and the value each one is the only home for. `expected_arrival` sits on
// the LINE table and is spelled exactly as the canonical model already spells it — NOT `expected_arrival_date`.
var RIC_B2_REQUIRED_COLUMNS_ = {
  destination_marketplace: { table: 'shipping_allocation_drafts', refusal: 'ROUTE_IDENTITY' },
  expected_arrival: { table: 'shipping_allocation_draft_lines', refusal: 'EXPECTED_ARRIVAL' }
};

// A PURE PREDICATE over a header and the sheet's ACTUAL header names. It reads no sheet, appends no column,
// creates nothing, and calls no schema-ensure helper — a production request must never be able to grow the
// schema, so the function that decides "can this be persisted?" is given the schema rather than fetching it.
function ricRoutePersistability_(header, headerNames, lineFieldNames) {
  header = header || {};
  var have = {}, haveLine = {}, i;
  for (i = 0; i < (headerNames || []).length; i++) have[String(headerNames[i]).trim()] = true;
  for (i = 0; i < (lineFieldNames || []).length; i++) haveLine[String(lineFieldNames[i]).trim()] = true;
  function s(v) { return String(v == null ? '' : v).trim(); }
  var refusals = [];

  // A marketplace destination was supplied and there is nowhere to put it.
  if (s(header.destination_marketplace) && !have['destination_marketplace']) {
    refusals.push({ code: RIC_SCHEMA_REFUSALS_.ROUTE_IDENTITY, column: 'destination_marketplace',
      table: 'shipping_allocation_drafts', supplied: s(header.destination_marketplace),
      schema_code: RIC_SCHEMA_REFUSALS_.COLUMN_ABSENT });
  }
  // An expected arrival was supplied and there is nowhere to put it.
  if (s(header.expected_arrival) && !haveLine['expected_arrival']) {
    refusals.push({ code: RIC_SCHEMA_REFUSALS_.EXPECTED_ARRIVAL, column: 'expected_arrival',
      table: 'shipping_allocation_draft_lines', supplied: s(header.expected_arrival),
      schema_code: RIC_SCHEMA_REFUSALS_.COLUMN_ABSENT });
  }
  // A service that is not one of the five must not be persisted as if it were.
  var svcRaw = s(header.recommended_shipping_method) || s(header.shipping_method);
  if (svcRaw && !ricCanonicalService_(svcRaw)) {
    refusals.push({ code: RIC_SCHEMA_REFUSALS_.ROUTE_IDENTITY, column: 'recommended_shipping_method',
      table: 'shipping_allocation_drafts', supplied: svcRaw, schema_code: 'SERVICE_NOT_CANONICAL' });
  }
  // Both destination identities at once is a contradiction, not a preference to resolve.
  var dest = ricDestinationIdentity_(header);
  if (!dest.ok && dest.code === 'ROUTE_DESTINATION_AMBIGUOUS') {
    refusals.push({ code: RIC_SCHEMA_REFUSALS_.ROUTE_IDENTITY, column: 'destination',
      table: 'shipping_allocation_drafts', supplied: 'both', schema_code: dest.code });
  }
  return { persistable: refusals.length === 0, refusals: refusals, zero_write: refusals.length > 0 };
}
