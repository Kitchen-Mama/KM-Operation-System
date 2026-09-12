/**
 * 72_api_v1_product_pricing_workspace.gs
 * Kitchen Mama Operation System — API v1 · PRODUCT PRICING SITE-SCOPED READ Workspace (PRODUCT-STRATEGY-P1-B1).
 *
 * SOURCE MIRROR / requires Apps Script sync. Action = "productPricing.workspace.get" — a body-carrying READ.
 *
 * WHAT THIS OWNS, AND THE ONE THING IT DECIDES. P1-B0 §31 froze three tables with no bounded read owner —
 * pricing_list, campaigns, campaign_sku_lines — and, more importantly, named the question nobody owned:
 * WHICH SKUs EXIST ON A SITE. This action is the site-membership authority. It resolves the membership
 * universe from marketplace_skus SERVER-SIDE, and everything else in the response is enrichment OF A MEMBER.
 *
 * MEMBERSHIP IS A FACT, NOT AN INFERENCE. A SKU is sold on a site only when marketplace_skus says so, for
 * that exact company + country + marketplace. It is never inferred from sku_details, from a currency, from an
 * image_url, from a price existing, or from a SKU naming pattern. A master SKU with no marketplace_skus row
 * in scope is ABSENT — not greyed, not zero-priced, not "missing data".
 *
 * AND THE DECISION IS MADE HERE RATHER THAN IN THE BROWSER, deliberately. A client filter over everything is
 * a rendering choice: it can be widened by a payload, a stale cache or a bug, and when it is widened nothing
 * on screen says so. So an unscoped read is REFUSED rather than answered with everything.
 *
 * THE JOINS, EACH ON THE KEY THE LIVE SCHEMA ACTUALLY HAS:
 *   sku_details          by `sku`
 *   sku_regional_details by the FOUR-PART business identity sku + company + country + marketplace — NOT by
 *                        marketplace_sku_id, which that table does not have (18_sku_regional_handlers.gs:13,
 *                        :16-23). It is the one edge that does not travel on an id, so it is the one that can
 *                        silently half-match, and all four parts are taken from the membership row itself.
 *   pricing_list         by `marketplace_sku_id` ONLY. pricing_list has no `company` column, so its country /
 *                        marketplace are denormalised copies: two companies on one country|marketplace|sku
 *                        are distinguishable only by the id, and a (country, marketplace, sku) join would
 *                        silently return the other company's price.
 *   campaign_sku_lines   by `marketplace_sku_id`, then campaigns by `campaign_id`, then the campaign's own
 *                        company / country / marketplace are checked against the scope column by column.
 *
 * READ-ONLY BY CONSTRUCTION. No setValue, no setValues, no appendRow, no insertRow, no deleteRow, no clear,
 * no clearContent, no createSheet, no ensure-sheet, no writer call, no LockService. It never creates a
 * missing table: a missing source is a typed refusal, because inventing a sheet is how a schema gap becomes
 * invisible. The spreadsheet is opened only through the exact-ID production gate, and neither a spreadsheet
 * id nor a sheet name may arrive in the request.
 *
 * FLAG-GATED, AND THE GATE IS BEFORE THE DOOR. While PRODUCT_STRATEGY_ENABLED_ is false this action refuses
 * with FEATURE_DISABLED having opened nothing and read nothing. There is no RBAC in this system (P0 §13.1
 * measured it), so the flag is not a convenience — it IS the access control, and a control that runs after
 * the read is not a control.
 *
 * Testability: every builder is a pure `function` declaration (extract+eval friendly) and the impure
 * orchestrator takes an injectable `io`, so the whole contract runs against fixtures with ZERO SpreadsheetApp.
 */

// Module stamp — the ROUND this file last changed, not the deployment release.
// PRODUCT-STRATEGY-P1-B1-R1 - re-stamped into the repository's owner-stamp vocabulary. 'PRODUCT-STRATEGY-
// P1-B1' named the round honestly but could not be ORDERED against any other stamp: _release-order.js
// keeps one append-only sequence and 63_'s manifest compares members of it, so a stamp outside that
// sequence cannot answer "is this file at or after that release" at all. A manifest owner has to be
// comparable, and this file becomes a REQUIRED owner in this round.
// PRODUCT-STRATEGY-P1-B3 - moved because THIS FILE changed: the response gained the five-state
// source discriminator (§八), the per-table schema fingerprint and the read timestamp. Nothing was
// synced at R7 either, so this supersedes a deployment candidate rather than an actual deployment -
// but two DIFFERENT trees must never both claim one release id, which is the whole job of the id.
// P1-B7E - R10. The envelope named ONE action while this file served two, so every
// productPricing.siteUniverse.get response published meta.action = workspace.get and the shipped
// accessor rejected all of them. R9 is deployed and its behaviour is captured as evidence, so the
// correction gets its own id: an id may not name two trees.
var PPW_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10';

var PPW_ACTION_ = 'productPricing.workspace.get';
// P1-B3 §8 — THE RESPONSE SHAPE'S OWN VERSION, separate from the module build and from the deployment
// release. The build says which round the FILE last changed; this says which round the response SHAPE
// last changed. A caller pins the shape, not the round: a comment-only edit to this file moves the
// build and must not make a correctly-pinned client refuse.
var PPW_SCHEMA_CONTRACT_VERSION_ = 2;
var PPW_WS_SEQ_ = 0;

// The four site statuses, from 00_config.gs:12 (VALID_MARKETPLACE_SKU_STATUSES_). There is no `running`:
// "Running in the Market" is a MASTER lifecycle on sku_details and says nothing about one site.
var PPW_STATUSES_ = ['active', 'phasing_out', 'inactive', 'discontinued'];
// DEFAULT = ON SALE. `phasing_out` is still purchasable, so excluding it would understate the ladder a buyer
// actually faces; calling it active would misreport it. It is included and badged with its exact value.
var PPW_DEFAULT_STATUSES_ = ['active', 'phasing_out'];
var PPW_INACTIVE_STATUSES_ = ['inactive', 'discontinued'];

// Source-table backstop. Never silently applied — a capped source makes membership or join completeness
// unprovable, and that is a refusal rather than a shorter answer.
var PPW_SOURCE_ROW_MAX_ = 50000;
// normalizedRows is the page grain. There is no per-table pagination, on purpose: six independently pageable
// tables would let a client assemble a view no server ever agreed to.
var PPW_PAGE_DEFAULT_ = 200;
var PPW_PAGE_MAX_ = 1000;
var PPW_CAMPAIGNS_PER_SKU_MAX_ = 50;

// R1 §5 — THE CATEGORY AUTHORITY, AND THE ONLY ONE.
//
// A category is what sku_details.category says for that SKU. It is never derived from `series`, never
// from product_name, and never from a SKU prefix: those three describe a product FAMILY, a label and a
// naming habit, and each of them would silently invent a taxonomy nobody maintains. A SKU whose
// category cell is empty HAS no category - it does not become 'Other', because 'Other' is a value an
// operator can select and would then be unable to find in the sheet.
//
// THE UNIVERSE IS THE SITE'S, NOT THE TABLE'S. Reading DISTINCT category off the whole of sku_details
// would put categories in the menu that this site does not sell, which is the same defect as showing a
// SKU that is not on the site - one level up. So the options are derived from rows that have already
// survived membership and the status gate, and nothing earlier.
var PPW_CATEGORY_SOURCE_ = 'sku_details.category';
var PPW_SERIES_SOURCE_ = 'sku_details.series';
// The prototype ships three demo categories. They are fixture data and they are NOT this list: there is
// no category allowlist here, no count limit, and nothing that would survive a fourth category appearing
// in the Operation DB tomorrow.
var PPW_CATEGORY_ALLOWLIST_ = null;
var PPW_CURSOR_PREFIX_ = 'PPW1';

// --------------------------------------------------------------------------------------------------------
// P1-B3 §8 — THE FIVE SOURCE STATES, AND WHY ONLY FOUR OF THEM CAN BE SERVED FROM HERE.
//
// A caller has to be able to tell these apart, because each one asks for a different act: connect the
// source, populate it, widen the read, fix the data, or draw the chart. `analysis_permitted` was a
// BOOLEAN and so could only ever say "not usable" - which of the four it was, the caller had to infer
// from the refusal list, and inferring a state from a list is how a genuinely empty site came to look
// like a broken one.
//
// SOURCE_NOT_CONNECTED IS DELIBERATELY NOT SERVABLE. It means "no server answered". A response that
// carries this field is proof that one did, so the server can never honestly emit it; the accessor owns
// it, and it may never overwrite a state the server actually sent. That asymmetry is the contract.
var PPW_SOURCE_STATES_ = ['READY', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE',
  'STOP_DATA_INTEGRITY', 'SOURCE_NOT_CONNECTED'];
var PPW_SERVER_SOURCE_STATES_ = ['READY', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE',
  'STOP_DATA_INTEGRITY'];
var PPW_CLIENT_ONLY_SOURCE_STATE_ = 'SOURCE_NOT_CONNECTED';

// WHICH FINDINGS ARE A STOP, AND THE ANSWER IS A LEVEL RATHER THAN A CODE.
//
// `AMBIGUOUS_SITE_IDENTITY` is raised at TWO levels and means two different severities. Raised on one
// ROW it says that row's regional join matched twice, so that row is not analysable and the other
// forty-three are fine - Data Quality. Raised at MEMBERSHIP level it says two rows claim one
// marketplace_sku_id, so the universe itself is wrong: the counts are wrong, and every join attaches to
// a product that may not be the one it names. Same code, two severities.
//
// So the stop is derived from the level, not from the code: only the build's TOP-LEVEL findings can
// stop a read, and the per-row ones stay Data Quality. That needs no code to be renamed and it cannot
// drift, because the two lists are built in different places by construction.
//
// AND A BLANK IDENTITY IS NOT THE SAME SEVERITY AS A DUPLICATE ONE. `SITE_SKU_WITHOUT_IDENTITY` was in
// this list for one round and it made a healthy site report STOP_DATA_INTEGRITY over a single unjoinable
// row. The two are different kinds of wrong:
//
//   duplicate id  -> every join may attach to the WRONG product. The numbers are wrong and the answer
//                    does not say which ones. A stop.
//   blank id      -> the row is dropped, COUNTED and named. Every row that remains is correct and the
//                    universe is short by an amount the response reports. Incomplete, and saying so.
//
// MIS-ATTRIBUTION IS A STOP; A COUNTED OMISSION IS NOT. The blank-id finding is still raised, still
// top-level, and still visible in `membership.blank_id_rows`.
var PPW_INTEGRITY_STOP_CODES_ = ['AMBIGUOUS_SITE_IDENTITY'];

/**
 * P1-B3 §8 — the source state, from facts the build already holds. PURE.
 *
 * Precedence is severity, and it is not negotiable:
 *   1. STOP_DATA_INTEGRITY      — the identities are ambiguous, so no number here can be trusted.
 *   2. SOURCE_PARTIALLY_READABLE — a source was capped, so completeness is unprovable. This OUTRANKS
 *      empty on purpose: a read that could not see all of a table cannot report that a scope is empty.
 *   3. SOURCE_EMPTY             — every table was read in full and this scope has nothing in it. A
 *      MEASUREMENT, and the one state a caller should answer by choosing another site.
 *   4. READY                    — rows, and nothing withheld.
 */
function ppwSourceState_(spec) {
  spec = spec || {};
  if ((spec.integrityStops || []).length > 0) return 'STOP_DATA_INTEGRITY';
  if ((spec.refusalCodes || []).length > 0) return 'SOURCE_PARTIALLY_READABLE';
  if (!(Number(spec.inScopeRows) > 0)) return 'SOURCE_EMPTY';
  return 'READY';
}

/** The top-level findings that stop a read, by code. PURE. */
function ppwIntegrityStops_(findings) {
  return (findings || []).filter(function (f) {
    return PPW_INTEGRITY_STOP_CODES_.indexOf(ppwStr_(f && f.code)) !== -1;
  }).map(function (f) { return ppwStr_(f.code); });
}

/**
 * A per-table schema fingerprint: the header set this read actually saw, order-independent, plus the
 * row count. PURE.
 *
 * ORDER-INDEPENDENT ON PURPOSE. Columns get dragged about in a spreadsheet without any change of
 * meaning, and a fingerprint that moved when they did would cry wolf on every reorder; one that
 * changes when a column is ADDED, REMOVED or RENAMED is the fingerprint worth having. The header
 * NAMES are hashed, never any cell value, so this cannot leak a price or a product.
 */
function ppwSchemaFingerprint_(rows) {
  rows = rows || [];
  if (!rows.length) return { columns: 0, headers: [], fingerprint: 'EMPTY', rows: 0 };
  var headers = [];
  for (var k in rows[0]) { if (Object.prototype.hasOwnProperty.call(rows[0], k)) headers.push(k); }
  headers.sort();
  return { columns: headers.length, headers: headers,
    fingerprint: ppwHash_(headers.join('|')), rows: rows.length };
}

// A request field this action does not have is a request field it must REFUSE, not ignore. Ignoring
// `spreadsheetId` would mean a caller could believe it had redirected the read.
var PPW_FORBIDDEN_REQUEST_FIELDS_ = ['spreadsheetId', 'spreadsheet_id', 'sheet', 'sheetName',
  'sheet_name', 'table', 'tables', 'sql', 'query'];

var PPW_TABLES_ = [
  { name: 'marketplace_skus', gate: null,
    requiredCols: ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace'] },
  { name: 'sku_details', gate: null, requiredCols: ['sku'] },
  { name: 'sku_regional_details', gate: 'regional',
    requiredCols: ['sku', 'company', 'country', 'marketplace'] },
  { name: 'pricing_list', gate: 'pricing', requiredCols: ['marketplace_sku_id'] },
  { name: 'campaign_sku_lines', gate: 'campaigns', requiredCols: ['campaign_id', 'marketplace_sku_id'] },
  { name: 'campaigns', gate: 'campaigns', requiredCols: ['campaign_id'] }
];

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock, no Spreadsheet)
// --------------------------------------------------------------------------------------------------------
function ppwStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function ppwLower_(v) { return ppwStr_(v).toLowerCase(); }
function ppwIsObj_(v) { return !!v && typeof v === 'object' && !(v instanceof Array); }

/** A number, or null. Never 0 for "absent" — a missing price is not a price of zero, and that difference is
 *  the whole reason a SKU without pricing is excluded from the axis rather than drawn at the bottom of it. */
function ppwNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

/** FNV-1a over a string. Local and pure so a cursor can be built and verified without Utilities. */
function ppwHash_(s) {
  var h = 2166136261;
  s = String(s === undefined || s === null ? '' : s);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return ('00000000' + h.toString(16).toUpperCase()).slice(-8);
}

/** The four-part regional key. Case-folded because a site is not a different site for being typed in caps. */
function ppwSiteKey_(sku, company, country, marketplace) {
  return ppwLower_(sku) + '||' + ppwLower_(company) + '||' + ppwLower_(country) + '||'
    + ppwLower_(marketplace);
}

function ppwRefusal_(code, detail, subject) {
  return { code: code, detail: detail === undefined ? null : detail,
    subject: subject === undefined ? null : subject };
}

/**
 * THE ACTIONS THIS FILE MAY CLAIM TO HAVE SERVED. Resolved at CALL time, not at load time:
 * PPW_SITE_UNIVERSE_ACTION_ is declared nine hundred lines below, so a top-level array built here would
 * capture undefined for it. A function body runs when a request arrives, by which point the whole file
 * has been evaluated.
 */
function ppwEnvelopeActions_() { return [PPW_ACTION_, PPW_SITE_UNIVERSE_ACTION_]; }

/**
 * THE ONE ENVELOPE, AND IT NOW HAS TO BE TOLD WHICH ACTION IT IS ANSWERING FOR (P1-B7E §4).
 *
 * It used to hard-code `action: PPW_ACTION_`, which was true while this file served one action and
 * became a lie the moment it served two: every productPricing.siteUniverse.get response — refusal,
 * success and exception alike — published meta.action = 'productPricing.workspace.get' while
 * data.schema.action said siteUniverse. The shipped accessor requires those to agree, so it rejected
 * every one of them with RESPONSE_ACTION_MISMATCH and reported SOURCE_NOT_CONNECTED over an answer that
 * had arrived. Measured on the deployed /exec, not inferred.
 *
 * `action` IS THE FIRST PARAMETER AND THERE IS NO DEFAULT. A default would be the same defect with a
 * longer fuse — the one call site that forgot to pass it would be the one nobody tested.
 *
 * AND IT IS NOT TRUSTED. It must be one of this file's own constants, so no request body or query string
 * can reach this field, and there is no third-action fallback for one to grow into. The allowlist is
 * checked before anything is built, and the action is stamped AFTER the caller's meta is merged rather
 * than before — otherwise a caller passing `{ action: … }` would quietly win and the allowlist would be
 * advice rather than a rule.
 */
function ppwEnvelope_(action, ok, data, errors, meta) {
  if (ppwEnvelopeActions_().indexOf(action) < 0) {
    // A programming error, not a runtime condition: every call site passes a module constant. It is
    // thrown rather than defaulted because an envelope that guessed its own action is what this
    // function is being repaired for.
    throw new Error('ppwEnvelope_: action must be one of this module\'s own constants, got '
      + JSON.stringify(action === undefined ? null : action));
  }
  var m = { apiVersion: '1', source: 'workspace', workspace: 'productPricing',
    build: PPW_BUILD_VERSION_, read_only: true, db_writes: 0, cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  m.action = action;          // LAST, so a caller's meta cannot rename the action it was served by
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m,
    errors: ok ? [] : (errors || []) };
}

/** Cap one source array, reporting the truncation rather than performing it quietly. */
function ppwCap_(rows) {
  rows = rows || [];
  if (rows.length <= PPW_SOURCE_ROW_MAX_) {
    return { rows: rows, capped: false, total: rows.length, returned: rows.length };
  }
  return { rows: rows.slice(0, PPW_SOURCE_ROW_MAX_), capped: true, total: rows.length,
    returned: PPW_SOURCE_ROW_MAX_ };
}

// --------------------------------------------------------------------------------------------------------
// §1 REQUEST VALIDATION — everything that can be decided without touching a table is decided here, so a
// malformed or unscoped request costs ZERO reads instead of being narrowed after the fact.
// --------------------------------------------------------------------------------------------------------
function ppwValidateRequest_(payload) {
  payload = ppwIsObj_(payload) ? payload : {};
  var refusals = [];
  var rawScope = ppwIsObj_(payload.scope) ? payload.scope : {};
  var scope = { company: ppwStr_(rawScope.company), country: ppwStr_(rawScope.country),
    marketplace: ppwStr_(rawScope.marketplace) };

  // NO DEFAULTS, AND NO DERIVATION. A country is not implied by a currency and a company is not implied by a
  // marketplace name — the same marketplace name belongs to two companies, which is exactly why
  // marketplace_skus carries company at all.
  var missing = [];
  ['company', 'country', 'marketplace'].forEach(function (k) { if (scope[k] === '') missing.push(k); });
  if (missing.length) {
    refusals.push(ppwRefusal_('SCOPE_INCOMPLETE',
      'company, country and marketplace are all required and none may be defaulted or derived', missing));
  }

  PPW_FORBIDDEN_REQUEST_FIELDS_.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(payload, f)) {
      refusals.push(ppwRefusal_('UNSUPPORTED_REQUEST_FIELD',
        'this action reads a fixed table set from the exact production target; a caller may not name a'
        + ' spreadsheet, a sheet or a query', f));
    }
  });

  var rawFilters = ppwIsObj_(payload.filters) ? payload.filters : {};
  var includeInactive = rawFilters.include_inactive === true;
  var statuses = null;
  if (rawFilters.statuses !== undefined && rawFilters.statuses !== null) {
    if (!(rawFilters.statuses instanceof Array)) {
      refusals.push(ppwRefusal_('INVALID_STATUS_FILTER', 'statuses must be an array', null));
    } else {
      var unknown = [];
      statuses = [];
      rawFilters.statuses.forEach(function (s) {
        var v = ppwLower_(s);
        if (PPW_STATUSES_.indexOf(v) === -1) { unknown.push(ppwStr_(s)); return; }
        if (statuses.indexOf(v) === -1) statuses.push(v);
      });
      // FAIL CLOSED ON AN UNKNOWN STATUS. Dropping it would answer a narrower question than the one asked,
      // and the caller would have no way to notice.
      if (unknown.length) {
        refusals.push(ppwRefusal_('UNKNOWN_STATUS_VALUE',
          'the only site statuses are ' + PPW_STATUSES_.join(', '), unknown));
        statuses = null;
      } else if (!statuses.length) {
        refusals.push(ppwRefusal_('INVALID_STATUS_FILTER', 'statuses was empty', null));
        statuses = null;
      }
    }
  }
  var effectiveStatuses = statuses
    ? statuses.slice()
    : (includeInactive ? PPW_DEFAULT_STATUSES_.concat(PPW_INACTIVE_STATUSES_)
      : PPW_DEFAULT_STATUSES_.slice());

  var rawInclude = ppwIsObj_(payload.include) ? payload.include : {};
  var include = {
    // regional and pricing default ON because the response's own counts (regionalMissingCount,
    // pricingMissingCount, analysableSiteSkuCount) are unanswerable without them. campaigns defaults OFF
    // because an un-requested include must cost no read.
    regional: rawInclude.regional === undefined ? true : rawInclude.regional === true,
    pricing: rawInclude.pricing === undefined ? true : rawInclude.pricing === true,
    campaigns: rawInclude.campaigns === true
  };

  var rawPage = ppwIsObj_(payload.page) ? payload.page : {};
  var limit = PPW_PAGE_DEFAULT_;
  if (rawPage.limit !== undefined && rawPage.limit !== null && rawPage.limit !== '') {
    var n = Number(rawPage.limit);
    if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) {
      refusals.push(ppwRefusal_('INVALID_PAGE_LIMIT', 'limit must be a positive integer', rawPage.limit));
    } else if (n > PPW_PAGE_MAX_) {
      refusals.push(ppwRefusal_('PAGE_LIMIT_EXCEEDS_MAXIMUM', 'the hard maximum is ' + PPW_PAGE_MAX_, n));
    } else {
      limit = n;
    }
  }

  // THE CURSOR IS BOUND TO THE SCOPE IT WAS ISSUED FOR. A cursor that survived a scope change would page
  // through one site's rows using another site's offsets, which is cross-site contamination arriving by the
  // back door.
  var identity = ppwHash_(JSON.stringify({
    company: ppwLower_(scope.company), country: ppwLower_(scope.country),
    marketplace: ppwLower_(scope.marketplace),
    category: ppwLower_(rawFilters.category), series: ppwLower_(rawFilters.series),
    statuses: effectiveStatuses.slice().sort(), include: include
  }));
  var offset = 0;
  var cursor = ppwStr_(rawPage.cursor);
  if (cursor !== '') {
    var parts = cursor.split('-');
    if (parts.length !== 3 || parts[0] !== PPW_CURSOR_PREFIX_) {
      refusals.push(ppwRefusal_('INVALID_CURSOR', 'the cursor is not one this action issued', cursor));
    } else if (parts[1] !== identity) {
      refusals.push(ppwRefusal_('CURSOR_SCOPE_MISMATCH',
        'this cursor was issued for a different scope or filter set', cursor));
    } else {
      var off = Number(parts[2]);
      if (!isFinite(off) || off < 0 || Math.floor(off) !== off) {
        refusals.push(ppwRefusal_('INVALID_CURSOR', 'the cursor offset is not a whole number', cursor));
      } else { offset = off; }
    }
  }

  return {
    ok: refusals.length === 0,
    refusals: refusals,
    scope: scope,
    filters: { category: ppwStr_(rawFilters.category) || null,
      series: ppwStr_(rawFilters.series) || null,
      statuses: effectiveStatuses, include_inactive: includeInactive,
      statuses_were_explicit: statuses !== null },
    include: include,
    page: { limit: limit, offset: offset, cursor: cursor === '' ? null : cursor, identity: identity }
  };
}

/** Which tables this request will read, in order. The membership pair is always read; the rest are gated. */
function ppwTablesFor_(include) {
  return PPW_TABLES_.filter(function (t) {
    return t.gate === null || include[t.gate] === true;
  });
}

// --------------------------------------------------------------------------------------------------------
// §2 MEMBERSHIP — the universe, resolved from marketplace_skus and from nothing else.
// --------------------------------------------------------------------------------------------------------
function ppwMembership_(marketplaceSkus, scope, statuses) {
  var wantedCompany = ppwLower_(scope.company);
  var wantedCountry = ppwLower_(scope.country);
  var wantedMarketplace = ppwLower_(scope.marketplace);
  var inScope = [], byId = {}, dupIds = {}, statusCounts = {}, excludedByStatus = 0, blankId = 0;
  PPW_STATUSES_.forEach(function (s) { statusCounts[s] = 0; });
  statusCounts.__unknown = 0;

  (marketplaceSkus || []).forEach(function (r) {
    if (ppwLower_(r.company) !== wantedCompany) return;
    if (ppwLower_(r.country) !== wantedCountry) return;
    if (ppwLower_(r.marketplace) !== wantedMarketplace) return;
    var id = ppwStr_(r.marketplace_sku_id);
    if (id === '') { blankId++; return; }        // a site SKU with no id cannot be joined to anything
    var status = ppwLower_(r.marketplace_sku_status);
    if (PPW_STATUSES_.indexOf(status) === -1) statusCounts.__unknown++;
    else statusCounts[status]++;
    if (statuses.indexOf(status) === -1) { excludedByStatus++; return; }
    if (Object.prototype.hasOwnProperty.call(byId, id)) {
      dupIds[id] = (dupIds[id] || 1) + 1;
      return;
    }
    byId[id] = r;
    inScope.push(id);
  });

  // DETERMINISTIC ORDER, so a page boundary is a property of the data and not of the sheet's row order.
  inScope.sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });

  return { ids: inScope, byId: byId, count: inScope.length,
    duplicate_ids: Object.keys(dupIds), blank_id_rows: blankId,
    status_counts: statusCounts, excluded_by_status: excludedByStatus };
}

// --------------------------------------------------------------------------------------------------------
// §3 INDEXES — each built on the key the live schema actually has.
// --------------------------------------------------------------------------------------------------------
function ppwIndexBySku_(skuDetails) {
  var m = {};
  (skuDetails || []).forEach(function (r) {
    var k = ppwLower_(r.sku);
    if (k === '') return;
    if (!Object.prototype.hasOwnProperty.call(m, k)) m[k] = r;
  });
  return m;
}

/** Regional rows grouped by the FOUR-PART identity, plus every row that matched the sku but NOT the site —
 *  kept apart so a cross-site row can be REPORTED as contract evidence instead of quietly used. */
function ppwIndexRegional_(regional, scope) {
  var bySite = {}, otherSiteBySku = {};
  var wantedCompany = ppwLower_(scope.company);
  var wantedCountry = ppwLower_(scope.country);
  var wantedMarketplace = ppwLower_(scope.marketplace);
  (regional || []).forEach(function (r) {
    var sku = ppwLower_(r.sku);
    if (sku === '') return;
    var sameSite = ppwLower_(r.company) === wantedCompany
      && ppwLower_(r.country) === wantedCountry
      && ppwLower_(r.marketplace) === wantedMarketplace;
    if (sameSite) {
      var k = ppwSiteKey_(r.sku, r.company, r.country, r.marketplace);
      if (!bySite[k]) bySite[k] = [];
      bySite[k].push(r);
    } else {
      if (!otherSiteBySku[sku]) otherSiteBySku[sku] = [];
      otherSiteBySku[sku].push({ company: ppwStr_(r.company), country: ppwStr_(r.country),
        marketplace: ppwStr_(r.marketplace) });
    }
  });
  return { bySite: bySite, otherSiteBySku: otherSiteBySku };
}

function ppwIndexPricing_(pricing) {
  var m = {};
  (pricing || []).forEach(function (r) {
    var id = ppwStr_(r.marketplace_sku_id);
    if (id === '') return;
    if (!m[id]) m[id] = [];
    m[id].push(r);
  });
  return m;
}

/** Campaign lines by marketplace_sku_id, with the parent campaign resolved and its own scope columns checked
 *  one by one. A campaign is not uniquely scoped by country+marketplace (20_:27) — the same marketplace name
 *  belongs to two companies — so company is checked too, and an unverifiable column is reported, not assumed. */
function ppwIndexCampaigns_(lines, campaigns, scope) {
  var byCampaign = {};
  (campaigns || []).forEach(function (c) {
    var id = ppwStr_(c.campaign_id);
    if (id === '') return;
    if (!Object.prototype.hasOwnProperty.call(byCampaign, id)) byCampaign[id] = c;
  });
  var wanted = { company: ppwLower_(scope.company), country: ppwLower_(scope.country),
    marketplace: ppwLower_(scope.marketplace) };
  var bySku = {}, outOfScope = 0, orphanLines = 0;
  (lines || []).forEach(function (ln) {
    var id = ppwStr_(ln.marketplace_sku_id);
    if (id === '') return;
    var cid = ppwStr_(ln.campaign_id);
    var camp = cid !== '' ? byCampaign[cid] : null;
    if (!camp) { orphanLines++; return; }
    var checks = [], scoped = true, unverifiable = [];
    ['company', 'country', 'marketplace'].forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(camp, k) || ppwStr_(camp[k]) === '') {
        unverifiable.push(k);
        return;
      }
      var same = ppwLower_(camp[k]) === wanted[k];
      checks.push({ column: k, campaign_value: ppwStr_(camp[k]), scope_value: scope[k], matches: same });
      if (!same) scoped = false;
    });
    if (!scoped) { outOfScope++; return; }
    if (!bySku[id]) bySku[id] = [];
    bySku[id].push({
      campaign_id: cid,
      campaign_sku_line_id: ppwStr_(ln.campaign_sku_line_id) || null,
      campaign_name: ppwStr_(camp.campaign_name) || null,
      status: ppwStr_(camp.status) || null,
      line_status: ppwStr_(ln.line_status) || null,
      start_date: ppwStr_(camp.start_date) || null,
      end_date: ppwStr_(camp.end_date) || null,
      promo_price: ppwNum_(ln.promo_price),
      regular_price_snapshot: ppwNum_(ln.regular_price),
      price_units: ppwStr_(ln.price_units) || null,
      discount_percent: ppwNum_(ln.discount_percent),
      // A DEAL IS OFFICIAL OR IT IS NOTHING. This record carries only persisted campaign columns; a proposal
      // has no path into it, and there is no write API in this round that could create one.
      source: 'campaigns + campaign_sku_lines',
      scope_checks: checks,
      unverifiable_scope_columns: unverifiable.length ? unverifiable : null
    });
  });
  return { bySku: bySku, out_of_scope_lines: outOfScope, orphan_lines: orphanLines,
    campaign_count: Object.keys(byCampaign).length };
}

// --------------------------------------------------------------------------------------------------------
// §4 NORMALIZE — one row per marketplace_sku_id, and never anything else.
// --------------------------------------------------------------------------------------------------------
function ppwNormalizeRow_(id, msku, skuIdx, regIdx, priceIdx, campIdx, include) {
  var sourceStatus = [], missing = [], findings = [];
  var masterSku = ppwStr_(msku.sku);
  var master = skuIdx[ppwLower_(masterSku)] || null;
  if (!master) missing.push('MASTER_SKU_RECORD_MISSING');

  // ---- regional, on the four-part identity taken from the MEMBERSHIP row ----
  var regional = null, regionalAmbiguous = false;
  if (include.regional) {
    var key = ppwSiteKey_(masterSku, msku.company, msku.country, msku.marketplace);
    var hits = regIdx.bySite[key] || [];
    if (hits.length === 0) {
      sourceStatus.push('REGIONAL_DETAILS_MISSING');
      missing.push('REGIONAL_DETAILS_MISSING');
      var elsewhere = regIdx.otherSiteBySku[ppwLower_(masterSku)] || [];
      if (elsewhere.length) {
        // NAMED, NOT USED. Answering a question about this site with another site's row would be a wrong
        // answer that looks like a complete one.
        findings.push({ code: 'CONTRACT_MISMATCH',
          detail: 'sku_regional_details rows exist for this SKU on other sites and are NOT used',
          evidence: elsewhere.slice(0, 5) });
      }
    } else if (hits.length === 1) {
      regional = hits[0];
    } else {
      regionalAmbiguous = true;
      sourceStatus.push('AMBIGUOUS_SITE_IDENTITY');
      findings.push({ code: 'AMBIGUOUS_SITE_IDENTITY',
        detail: 'more than one sku_regional_details row matches this exact four-part site identity',
        evidence: { matches: hits.length } });
    }
  } else {
    sourceStatus.push('REGIONAL_NOT_REQUESTED');
  }

  // ---- pricing, on marketplace_sku_id ONLY ----
  var price = null, pricingAmbiguous = false, currency = null;
  if (include.pricing) {
    var prows = priceIdx[id] || [];
    if (prows.length === 0) {
      sourceStatus.push('PRICING_SOURCE_MISSING');
      missing.push('PRICING_SOURCE_MISSING');
    } else if (prows.length === 1) {
      price = prows[0];
    } else {
      pricingAmbiguous = true;
      sourceStatus.push('AMBIGUOUS_PRICING_SOURCE');
      findings.push({ code: 'AMBIGUOUS_PRICING_SOURCE',
        detail: 'pricing_list is one row per marketplace_sku_id (PRICING_DATABASE_MAPPING §4) and this id'
          + ' has more than one; no rule in the contract picks a winner, so none is picked',
        evidence: { rows: prows.length,
          pricing_ids: prows.map(function (p) { return ppwStr_(p.pricing_id); }).slice(0, 5) } });
    }
    if (price) {
      currency = ppwStr_(price.currency) || null;
      if (currency === null) { missing.push('PRICING_CURRENCY_MISSING'); }
      var siteCurrency = ppwStr_(msku.currency);
      if (currency !== null && siteCurrency !== '' && ppwLower_(siteCurrency) !== ppwLower_(currency)) {
        // pricing_list WINS, and the disagreement is a finding rather than a tiebreak. The two are a copy
        // made at creation (PRICING_DATABASE_MAPPING §4), so they can drift, and a silent overwrite would
        // hide the drift for as long as nobody compared them.
        findings.push({ code: 'CURRENCY_SOURCE_CONFLICT',
          detail: 'pricing_list.currency is the authority; marketplace_skus.currency disagrees',
          evidence: { pricing_list: currency, marketplace_skus: siteCurrency } });
      }
    }
  } else {
    sourceStatus.push('PRICING_NOT_REQUESTED');
  }

  // ---- images and variant grouping ----
  var image = master ? (ppwStr_(master.image_url) || null) : null;
  if (image === null) { sourceStatus.push('IMAGE_SOURCE_MISSING'); missing.push('IMAGE_SOURCE_MISSING'); }
  // NO SKU-STRING SURGERY. `series` is the only product-family column the live schema can prove, and where it
  // is blank the grouping is reported as unprovable rather than invented from the SKU text.
  var series = master ? (ppwStr_(master.series) || null) : null;
  var variantGroup = series;
  if (variantGroup === null) { missing.push('VARIANT_GROUPING_SOURCE_MISSING'); }

  var campaigns = [];
  if (include.campaigns) {
    campaigns = (campIdx.bySku[id] || []).slice(0, PPW_CAMPAIGNS_PER_SKU_MAX_);
    if ((campIdx.bySku[id] || []).length > PPW_CAMPAIGNS_PER_SKU_MAX_) {
      findings.push({ code: 'CAMPAIGN_RECORDS_CAPPED',
        detail: 'more campaign lines than the per-SKU bound', evidence: { cap: PPW_CAMPAIGNS_PER_SKU_MAX_ } });
    }
  }

  // ANALYSABLE MEANS "MAY BE PLOTTED AND COMPARED". A price with no currency is not a coordinate, and an
  // ambiguous source is not a price at all.
  //
  // P1-B3 - AND IT REQUIRES A CONFIRMED REGIONAL DETAIL, WHICH IT DID NOT BEFORE.
  //
  // The rule is that a site SKU with no Regional Detail is not on the price chart but IS in Data Quality:
  // without that row there is no evidence the product is listed on this site at all, so a price for it is
  // not a coordinate on this site's axis. The prototype's chart gate already refused those rows. This
  // flag did not, so ONE QUESTION HAD TWO AUTHORITIES AND TWO ANSWERS - and because the client's answer
  // was the correct one, nothing looked broken: the chart drew the right products while
  // analysableSiteSkuCount counted one more than the chart contained. The production readback's first
  // site pass is what made it visible.
  //
  // WHEN REGIONAL WAS NOT REQUESTED THIS IS FALSE TOO. A caller who did not ask for the join holds no
  // evidence the listing exists, and "may be plotted" cannot be asserted without it. source_status
  // already carries REGIONAL_NOT_REQUESTED, so the two cases stay distinguishable.
  var regionalConfirmed = include.regional === true && regional !== null && !regionalAmbiguous;
  var analysable = include.pricing === true && price !== null && currency !== null
    && ppwNum_(price.regular_price) !== null && !pricingAmbiguous && regionalConfirmed;

  return {
    identity: 'MSKU:' + id,
    marketplace_sku_id: id,
    master_sku: masterSku || null,
    site_sku: ppwStr_(msku.site_sku) || null,
    product_name: master ? (ppwStr_(master.product_name) || null) : null,
    category: master ? (ppwStr_(master.category) || null) : null,
    series: series,
    variant_group: variantGroup,
    // NO AUTHORITATIVE COLUMN EXISTS for a variant name (§28.5 is still open), so it is null rather than a
    // guess dressed as data.
    variant_name: null,
    company: ppwStr_(msku.company),
    country: ppwStr_(msku.country),
    marketplace: ppwStr_(msku.marketplace),
    marketplace_sku_status: ppwStr_(msku.marketplace_sku_status) || null,
    // DISPLAY ONLY. It is a statement about the product, never about membership of this site.
    lifecycle: master ? (ppwStr_(master.lifecycle) || null) : null,
    currency: currency,
    regular_price: price ? ppwNum_(price.regular_price) : null,
    minimum_price: price ? ppwNum_(price.minimum_price) : null,
    msrp: price ? ppwNum_(price.msrp) : null,
    product_image: image,
    regional: regional ? {
      regional_detail_id: ppwStr_(regional.regional_detail_id) || null,
      site_sku: ppwStr_(regional.site_sku) || null,
      marketplace_product_id: ppwStr_(regional.marketplace_product_id) || null,
      product_url: ppwStr_(regional.product_url) || null,
      packaging_regulation: ppwStr_(regional.packaging_regulation) || null,
      language: ppwStr_(regional.language) || null
    } : null,
    campaigns: campaigns,
    analysable: analysable,
    source_status: sourceStatus,
    missing_reasons: missing,
    findings: findings,
    provenance: {
      membership: 'marketplace_skus (company + country + marketplace)',
      master: master ? 'sku_details by sku' : null,
      regional: include.regional
        ? (regional ? 'sku_regional_details by sku + company + country + marketplace' : null)
        : 'not requested',
      pricing: include.pricing ? (price ? 'pricing_list by marketplace_sku_id' : null) : 'not requested',
      campaigns: include.campaigns ? 'campaign_sku_lines by marketplace_sku_id → campaigns by campaign_id'
        : 'not requested',
      currency_authority: 'pricing_list.currency',
      price_status_raw: price ? (ppwStr_(price.price_status) || null) : null,
      price_source_raw: price ? (ppwStr_(price.price_source) || null) : null,
      variant_group_source: variantGroup === null ? null : 'sku_details.series',
      fx_applied: false
    }
  };
}

// --------------------------------------------------------------------------------------------------------
// §5 THE BUILDER — raw tables in, ONE site-scoped read model out.
// --------------------------------------------------------------------------------------------------------
/**
 * R1 §6 — the filter options for ONE dimension, derived from rows that already survived membership,
 * the status gate and the OTHER dimension's filter.
 *
 * SELF-EXCLUDING BY DESIGN. A dimension's options are not narrowed by its own filter, because a menu
 * that collapses to the item you just picked cannot be used to pick anything else. They ARE narrowed by
 * the other dimension, so the pair stays consistent: every option shown leads to at least one row.
 *
 * THE COUNTS ARE THE WHOLE FILTERED UNIVERSE, never the current page. Pagination is a window onto
 * normalizedRows; a category that has 12 SKUs on this site has 12 whether the page shows 200 or 5.
 */
function ppwFilterOptions_(rows, key) {
  var seen = {}, order = [], blank = 0;
  rows.forEach(function (r) {
    var v = ppwStr_(r[key]);            // TRIM is the only normalization performed
    if (v === '') { blank++; return; }  // blank is ABSENT, never a bucket and never renamed
    if (!Object.prototype.hasOwnProperty.call(seen, v)) {
      seen[v] = { value: v, siteSkuCount: 0, analysableSiteSkuCount: 0 };
      order.push(v);
    }
    seen[v].siteSkuCount++;
    if (r.analysable) seen[v].analysableSiteSkuCount++;
  });
  // EXACT-VALUE de-duplication above; deterministic order here. Identical values collapsed into one
  // option; values that merely LOOK alike stayed two, and are reported by the caller.
  order.sort();
  return { options: order.map(function (v) { return seen[v]; }), blank_count: blank };
}

/** Values that differ only by case or by internal whitespace, once trimmed. Reported, never merged. */
function ppwNormalizationVariants_(options) {
  var byFolded = {}, out = [];
  options.forEach(function (o) {
    var f = String(o.value).toLowerCase().replace(/\s+/g, ' ');
    (byFolded[f] = byFolded[f] || []).push(o.value);
  });
  Object.keys(byFolded).sort().forEach(function (f) {
    if (byFolded[f].length > 1) out.push({ normalized: f, variants: byFolded[f].slice().sort() });
  });
  return out;
}

/**
 * P1-B3 — `readAt` IS A PARAMETER, WHICH IS WHY THIS FUNCTION IS STILL PURE.
 *
 * The response has to carry when it was read, and this builder has no clock and must not grow one: the
 * suite runs it against fixtures and asserts byte-identical output. A clock read INSIDE would make the
 * output depend on WHEN it ran; a timestamp passed IN as a named argument is just another input. Same
 * argument as the chart layout engine's measured box, and the same conclusion.
 *
 * AND IT IS read_at, NOT source_modified_at. It says when the server read the sheets, which is the only
 * freshness fact available: a Spreadsheet object exposes no last-modified time, and the one that would
 * (DriveApp.getFileById) needs a Drive scope this action deliberately does not hold. Reporting a
 * freshness nobody measured would be worse than reporting none, so the field says which it is.
 */
function ppwWorkspaceBuild_(tables, req, readAt) {
  tables = tables || {};
  var include = req.include, scope = req.scope, filters = req.filters;
  var refusals = req.refusals.slice();

  var src = {};
  ppwTablesFor_(include).forEach(function (t) { src[t.name] = ppwCap_(tables[t.name] || []); });
  function capOf(n) { return src[n] ? src[n].capped : null; }
  function rowsOf(n) { return src[n] ? src[n].rows : []; }

  var mem = ppwMembership_(rowsOf('marketplace_skus'), scope, filters.statuses);
  var skuIdx = ppwIndexBySku_(rowsOf('sku_details'));
  var regIdx = include.regional
    ? ppwIndexRegional_(rowsOf('sku_regional_details'), scope) : { bySite: {}, otherSiteBySku: {} };
  var priceIdx = include.pricing ? ppwIndexPricing_(rowsOf('pricing_list')) : {};
  var campIdx = include.campaigns
    ? ppwIndexCampaigns_(rowsOf('campaign_sku_lines'), rowsOf('campaigns'), scope)
    : { bySku: {}, out_of_scope_lines: 0, orphan_lines: 0, campaign_count: 0 };

  var findings = [];
  if (mem.duplicate_ids.length) {
    findings.push({ code: 'AMBIGUOUS_SITE_IDENTITY',
      detail: 'more than one marketplace_skus row shares a marketplace_sku_id in this scope',
      evidence: { ids: mem.duplicate_ids.slice(0, 10) } });
  }
  if (mem.blank_id_rows) {
    findings.push({ code: 'SITE_SKU_WITHOUT_IDENTITY',
      detail: 'marketplace_skus rows in this scope carry no marketplace_sku_id and cannot be joined',
      evidence: { rows: mem.blank_id_rows } });
  }
  if (mem.status_counts.__unknown) {
    findings.push({ code: 'UNKNOWN_SITE_STATUS_VALUE',
      detail: 'marketplace_sku_status values outside the four the schema defines',
      evidence: { rows: mem.status_counts.__unknown } });
  }

  // ---- ALL rows first, so the counts are TOTALS and the page is a window onto them ----
  // R1 §5 — `survived` is the site universe AFTER membership and the status gate and BEFORE the
  // category/series filter. It is what the filter options are built from, and it is the only
  // population that can honestly answer "what can this site be filtered by".
  var survived = [], all = [];
  mem.ids.forEach(function (id) {
    var row = ppwNormalizeRow_(id, mem.byId[id], skuIdx, regIdx, priceIdx, campIdx, include);
    survived.push(row);
    // CATEGORY AND SERIES NARROW **AFTER** MEMBERSHIP, never instead of it. They are a view of the site's
    // SKUs, and a SKU that is not on the site cannot be filtered into one.
    // R1 §5 — EXACT, TRIM-ONLY MATCHING. This compared lower-cased values, which is a semantic merge:
    // it makes 'Can Opener' and 'can opener' the same filter while the OPTIONS below list them as two,
    // so a menu with two entries would have had one behaviour. Two spellings in the DB are a data
    // question for an operator, reported as CATEGORY_NORMALIZATION_REVIEW_REQUIRED, not something this
    // read decides on their behalf.
    if (filters.category !== null && ppwStr_(row.category) !== ppwStr_(filters.category)) return;
    if (filters.series !== null && ppwStr_(row.series) !== ppwStr_(filters.series)) return;
    all.push(row);
  });

  var counts = {
    siteSkuCount: all.length,
    activeSiteSkuCount: 0, phasingOutSiteSkuCount: 0,
    inactiveSiteSkuCount: 0, discontinuedSiteSkuCount: 0,
    regionalMissingCount: include.regional ? 0 : null,
    pricingMissingCount: include.pricing ? 0 : null,
    analysableSiteSkuCount: 0
  };
  var KEY = { active: 'activeSiteSkuCount', phasing_out: 'phasingOutSiteSkuCount',
    inactive: 'inactiveSiteSkuCount', discontinued: 'discontinuedSiteSkuCount' };
  all.forEach(function (r) {
    var k = KEY[ppwLower_(r.marketplace_sku_status)];
    if (k) counts[k]++;
    if (include.regional && r.source_status.indexOf('REGIONAL_DETAILS_MISSING') !== -1) {
      counts.regionalMissingCount++;
    }
    if (include.pricing && r.source_status.indexOf('PRICING_SOURCE_MISSING') !== -1) {
      counts.pricingMissingCount++;
    }
    if (r.analysable) counts.analysableSiteSkuCount++;
  });

  // ---- R1 §6 the filter options, from `survived`, self-excluding per dimension ----
  var catBase = survived.filter(function (r) {
    return filters.series === null || ppwStr_(r.series) === ppwStr_(filters.series); });
  var serBase = survived.filter(function (r) {
    return filters.category === null || ppwStr_(r.category) === ppwStr_(filters.category); });
  var catOpt = ppwFilterOptions_(catBase, 'category');
  var serOpt = ppwFilterOptions_(serBase, 'series');
  var catVariants = ppwNormalizationVariants_(catOpt.options);
  if (catOpt.blank_count > 0) {
    // The SKUs are kept and counted; what is missing is the category, and it is named as missing
    // rather than swept into a bucket the sheet does not contain.
    findings.push({ code: 'CATEGORY_SOURCE_MISSING',
      detail: 'site SKUs whose ' + PPW_CATEGORY_SOURCE_ + ' is empty; they are counted and returned,'
        + ' they carry category null, and they are NOT placed in an invented category',
      evidence: { rows: catOpt.blank_count, source: PPW_CATEGORY_SOURCE_,
        renamed_to_other: false } });
  }
  if (catVariants.length) {
    findings.push({ code: 'CATEGORY_NORMALIZATION_REVIEW_REQUIRED',
      detail: 'category values that differ only by case or spacing are KEPT AS SEPARATE options; this'
        + ' read trims and does not merge, because merging is a data decision an operator owns',
      evidence: { groups: catVariants, merged: false } });
  }

  // ---- pagination over normalizedRows, the page grain ----
  var total = all.length;
  var start = Math.min(req.page.offset, total);
  var page = all.slice(start, start + req.page.limit);
  var nextOffset = start + page.length;
  var nextCursor = nextOffset < total
    ? (PPW_CURSOR_PREFIX_ + '-' + req.page.identity + '-' + nextOffset) : null;

  var capped = {
    marketplaceSkus: capOf('marketplace_skus'), skuDetails: capOf('sku_details'),
    skuRegionalDetails: capOf('sku_regional_details'), pricingList: capOf('pricing_list'),
    campaigns: capOf('campaigns'), campaignSkuLines: capOf('campaign_sku_lines'),
    normalizedRows: nextCursor !== null
  };
  var cappedSources = [];
  ['marketplace_skus', 'sku_details', 'sku_regional_details', 'pricing_list', 'campaigns',
    'campaign_sku_lines'].forEach(function (n) { if (capOf(n) === true) cappedSources.push(n); });
  if (cappedSources.length) {
    // A CAPPED SOURCE MAKES MEMBERSHIP OR JOIN COMPLETENESS UNPROVABLE, and an answer that cannot prove its
    // own completeness must not be handed over looking analytics-ready.
    refusals.push(ppwRefusal_('CAPPED_RESULT',
      'a source table exceeded the row cap, so membership or join completeness cannot be proved',
      cappedSources));
  }

  // ---- P1-B3 §8 the source state, derived from what is already known ----
  var integrityStops = ppwIntegrityStops_(findings);
  var sourceState = ppwSourceState_({
    integrityStops: integrityStops,
    refusalCodes: refusals.map(function (r) { return ppwStr_(r.code); }),
    inScopeRows: total
  });

  // R1 §6 — WITHHELD WHEN THE UNIVERSE IS NOT PROVABLE. A capped source, or any other refusal, makes
  // "these are the site's categories" a claim this read cannot support - and a menu that LOOKS complete
  // is worse than no menu, because the operator cannot see what is missing from it. One expression
  // decides this and analysis_permitted, so the two can never disagree.
  var permitted = refusals.length === 0;
  return {
    scope: scope,
    // P1-B3 §8 — ONE FIELD, FOUR ANSWERS, AND EACH ASKS FOR A DIFFERENT ACT.
    sourceState: sourceState,
    // The BOOLEAN stays, and stays derived from the same facts, because eleven assertions and the
    // accessor's response validator hold it. It is the summary; sourceState is the reason.
    filtersApplied: {
      category: filters.category, series: filters.series,
      statuses: filters.statuses.slice(), include_inactive: filters.include_inactive,
      statuses_were_explicit: filters.statuses_were_explicit,
      applied_after_membership: ['category', 'series'],
      applied_during_membership: ['statuses']
    },
    normalizedRows: page,
    filterOptions: !permitted ? null : {
      categories: catOpt.options, series: serOpt.options,
      provenance: {
        category_source: PPW_CATEGORY_SOURCE_, series_source: PPW_SERIES_SOURCE_,
        derived_from: 'rows surviving membership + the status gate, before the category/series filter'
          + ' for their own dimension',
        counts_are: 'the whole scope/filter universe, NOT the current page',
        page_size_independent: true,
        self_excluding: true,
        normalization: 'trim only; exact-value de-duplication; deterministic ascending sort',
        semantic_merge: false,
        blank_category_rows: catOpt.blank_count, blank_series_rows: serOpt.blank_count,
        blank_becomes_other: false,
        allowlist: PPW_CATEGORY_ALLOWLIST_, max_options: null,
        inferred_from: []
      }
    },
    sources: {
      marketplaceSkus: { rows: mem.count, total_in_table: src.marketplace_skus.total },
      skuDetails: { rows: rowsOf('sku_details').length, total_in_table: src.sku_details.total },
      skuRegionalDetails: include.regional
        ? { rows: rowsOf('sku_regional_details').length, total_in_table: src.sku_regional_details.total }
        : null,
      pricingList: include.pricing
        ? { rows: rowsOf('pricing_list').length, total_in_table: src.pricing_list.total } : null,
      campaigns: include.campaigns
        ? { rows: rowsOf('campaigns').length, total_in_table: src.campaigns.total } : null,
      campaignSkuLines: include.campaigns
        ? { rows: rowsOf('campaign_sku_lines').length, total_in_table: src.campaign_sku_lines.total } : null
    },
    counts: counts,
    capped: capped,
    pagination: { limit: req.page.limit, offset: start, returned: page.length, total: total,
      cursor: req.page.cursor, nextCursor: nextCursor, scope_identity: req.page.identity,
      sort: 'marketplace_sku_id ascending' },
    findings: findings,
    refusals: refusals,
    // SUCCESS IS NOT THE SAME AS USABLE, and this is the field that says so.
    analysis_permitted: permitted,
    // P1-B3 §8 — the freshness and shape evidence, per table that was actually read.
    schema: {
      read_at: (readAt === undefined || readAt === null) ? null : readAt,
      read_at_is: 'the server clock when this read ran',
      source_modified_at: null,
      // THE IDENTIFIER STAYS IN THIS COMMENT AND OUT OF THE STRING. The document-engine audit
      // (final-output-seam-audit §K) scans every .gs for DriveApp with comments stripped and string
      // literals intact, so naming the API in a message that says this file does NOT use it reported
      // 72_ as a second binary file renderer. The service in question is DriveApp.getFileById, whose
      // scope this action deliberately does not hold.
      source_modified_at_unavailable_because:
        'a Spreadsheet object exposes no last-modified time, and the Drive file service that does'
        + ' requires a scope this read deliberately does not hold',
      contract_version: PPW_SCHEMA_CONTRACT_VERSION_,
      build: PPW_BUILD_VERSION_,
      tables: (function () {
        var out = {};
        ppwTablesFor_(include).forEach(function (t) {
          out[t.name] = ppwSchemaFingerprint_(rowsOf(t.name));
        });
        return out;
      }()),
      integrity_stops: integrityStops,
      state_derived_from: ['top-level findings', 'refusal codes', 'in-scope row total']
    },
    membership: {
      authority: 'marketplace_skus',
      scope_key: ['company', 'country', 'marketplace'],
      site_sku_identity: 'marketplace_sku_id',
      resolved_server_side: true,
      in_scope_before_status_filter: mem.count + mem.excluded_by_status,
      excluded_by_status: mem.excluded_by_status,
      status_distribution: mem.status_counts,
      lifecycle_participates: false,
      inferred_from: []
    },
    provenance: {
      action: PPW_ACTION_, build: PPW_BUILD_VERSION_,
      connected: true, read_only: true, db_writes: 0,
      tables_read: ppwTablesFor_(include).map(function (t) { return t.name; }),
      joins: {
        master: 'sku_details.sku = marketplace_skus.sku',
        regional: 'sku_regional_details(sku, company, country, marketplace)'
          + ' = marketplace_skus(sku, company, country, marketplace)',
        pricing: 'pricing_list.marketplace_sku_id = marketplace_skus.marketplace_sku_id',
        campaign_lines: 'campaign_sku_lines.marketplace_sku_id = marketplace_skus.marketplace_sku_id',
        campaign_parent: 'campaigns.campaign_id = campaign_sku_lines.campaign_id, then company/country/'
          + 'marketplace checked column by column'
      },
      campaign_scope: include.campaigns
        ? { out_of_scope_lines_dropped: campIdx.out_of_scope_lines, orphan_lines: campIdx.orphan_lines,
            campaigns_seen: campIdx.campaign_count } : null,
      currency_authority: 'pricing_list.currency',
      fx_conversion: false,
      price_status_filtering: false,
      preview_fallback: false
    }
  };
}

/** The answer a refused request gets: the same shape, zero rows, and a reason that is not a zero. */
function ppwRefusedData_(req, extraRefusals) {
  var refusals = req.refusals.concat(extraRefusals || []);
  return {
    scope: req.scope,
    // NULL, AND FOR THE SAME REASON THE COUNTS BELOW ARE NULL. No source was read, so no source state
    // was MEASURED - and null is not one of the five. A refusal already says what happened, and
    // dressing it up as SOURCE_EMPTY would report a measurement of a site nobody looked at, while
    // SOURCE_NOT_CONNECTED would blame the transport for a refusal the server chose.
    sourceState: null,
    filtersApplied: { category: req.filters.category, series: req.filters.series,
      statuses: req.filters.statuses.slice(), include_inactive: req.filters.include_inactive,
      statuses_were_explicit: req.filters.statuses_were_explicit,
      applied_after_membership: ['category', 'series'], applied_during_membership: ['statuses'] },
    normalizedRows: [],
    // NULL, NOT AN EMPTY LIST. An empty categories array reads as "this site has no categories", which
    // is a measurement; nothing was measured here.
    filterOptions: null,
    sources: { marketplaceSkus: null, skuDetails: null, skuRegionalDetails: null,
      pricingList: null, campaigns: null, campaignSkuLines: null },
    // NOT ZERO. Nothing was counted, and a count nobody took is null, because a real site with no SKUs must
    // remain distinguishable from a request that never ran.
    counts: { siteSkuCount: null, activeSiteSkuCount: null, phasingOutSiteSkuCount: null,
      inactiveSiteSkuCount: null, discontinuedSiteSkuCount: null, regionalMissingCount: null,
      pricingMissingCount: null, analysableSiteSkuCount: null },
    capped: { marketplaceSkus: null, skuDetails: null, skuRegionalDetails: null, pricingList: null,
      campaigns: null, campaignSkuLines: null, normalizedRows: null },
    pagination: { limit: req.page.limit, offset: 0, returned: 0, total: null, cursor: req.page.cursor,
      nextCursor: null, scope_identity: req.page.identity, sort: 'marketplace_sku_id ascending' },
    findings: [],
    refusals: refusals,
    analysis_permitted: false,
    schema: { read_at: null, read_at_is: 'the server clock when this read ran',
      source_modified_at: null,
      source_modified_at_unavailable_because:
        'a Spreadsheet object exposes no last-modified time, and the Drive file service that does'
        + ' requires a scope this read deliberately does not hold',
      contract_version: PPW_SCHEMA_CONTRACT_VERSION_, build: PPW_BUILD_VERSION_,
      tables: {}, integrity_stops: [],
      state_derived_from: ['top-level findings', 'refusal codes', 'in-scope row total'] },
    membership: { authority: 'marketplace_skus', scope_key: ['company', 'country', 'marketplace'],
      site_sku_identity: 'marketplace_sku_id', resolved_server_side: true,
      in_scope_before_status_filter: null, excluded_by_status: null, status_distribution: null,
      lifecycle_participates: false, inferred_from: [] },
    provenance: { action: PPW_ACTION_, build: PPW_BUILD_VERSION_, connected: false, read_only: true,
      db_writes: 0, tables_read: [], joins: null, campaign_scope: null,
      currency_authority: 'pricing_list.currency', fx_conversion: false, price_status_filtering: false,
      preview_fallback: false }
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io. NEVER calls getOperationDb, never takes a lock, never writes.
// --------------------------------------------------------------------------------------------------------
function ppwRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var o = {}, blank = true;
    for (var c = 0; c < headers.length; c++) {
      o[headers[c]] = data[r][c];
      if (String(data[r][c]).trim() !== '') blank = false;
    }
    if (!blank) out.push(o);
  }
  return out;
}

function ppwDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { PPW_WS_SEQ_++; return PPW_WS_SEQ_; },
    flagEnabled: function () {
      // THE ONE RESOLVER. Not a copy of the constant, not a payload field, not a query parameter.
      return typeof productStrategyEnabled_ === 'function' && productStrategyEnabled_() === true;
    },
    openTarget: function () {
      var id = prodExpectedDbId_();
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols) {
      // FAIL CLOSED. A missing sheet or a missing required column is a typed schema error, never an empty
      // array and never a sheet this action creates on the way past.
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return ppwRowsToObjects_(sheet);
    }
  };
}

function handleProductPricingWorkspaceGet_(body, io) {
  io = io || ppwDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = ppwStr_(body && body.requestId) || ('REQ-P' + ('000000' + seq).slice(-6));
  var payload = (body && body.payload) || {};
  try {
    // ---- §1 THE FLAG, BEFORE THE DOOR. ----------------------------------------------------------
    // Not after the open and not after the read. There is no RBAC in this system, so this gate is the access
    // control; a control that runs after the data has been read has already failed at the only job it had.
    if (io.flagEnabled() !== true) {
      var reqD = ppwValidateRequest_(payload);
      return ppwEnvelope_(PPW_ACTION_, true,
        ppwRefusedData_(reqD, [ppwRefusal_('FEATURE_DISABLED',
          'PRODUCT_STRATEGY_ENABLED_ is false in the deployment that answered', null)]),
        [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, dbOpened: false,
          refused: true, refusalCode: 'FEATURE_DISABLED' });
    }

    // ---- §2/§3 THE REQUEST AND THE COMPLETE SCOPE, BEFORE ANY TABLE IS TOUCHED. -------------------
    var req = ppwValidateRequest_(payload);
    if (!req.ok) {
      return ppwEnvelope_(PPW_ACTION_, true, ppwRefusedData_(req, []),
        [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, dbOpened: false,
          refused: true, refusalCode: req.refusals[0].code });
    }

    // ---- §4 THE EXACT PRODUCTION TARGET. ---------------------------------------------------------
    var ss = io.openTarget();
    var specs = ppwTablesFor_(req.include);
    var tables = {}, readCount = 0;
    for (var i = 0; i < specs.length; i++) {
      tables[specs[i].name] = io.readTable(ss, specs[i].name, specs[i].requiredCols);
      readCount++;
    }

    // THE CLOCK IS READ HERE AND PASSED IN, so the builder stays a pure function of its arguments.
    var data = ppwWorkspaceBuild_(tables, req, io.now());
    return ppwEnvelope_(PPW_ACTION_, true, data, [], { requestId: reqId, serverDurationMs: (io.now() - t0),
      tablesRead: readCount, dbOpened: true, refused: data.refusals.length > 0,
      refusalCode: data.refusals.length ? data.refusals[0].code : null });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode))
      || 'PRODUCT_PRICING_WORKSPACE_BUILD_FAILED';
    return ppwEnvelope_(PPW_ACTION_, false, null,
      [{ code: code, message: String((e && e.message) || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0), refused: true, refusalCode: code });
  }
}


// ==========================================================================================================
// §11  THE SITE UNIVERSE READ OWNER                                          (PRODUCT-STRATEGY-P1-B6)
// ==========================================================================================================
//
// WHY THIS LIVES IN THIS FILE. P1-B5 measured the gap: the board derives Company -> Country -> Marketplace
// from the rows its adapter hands over, because the preview fixture handed over every site it knew. The
// workspace read cannot do that and must not — it is site-scoped by construction, and that scoping is the
// single reason one site's rows can never appear under another site's heading.
//
// So a second read is needed, and the one thing it must NOT be is a second authority. `ppwMembership_`
// already decides what "listed on this site" means: an exact company + country + marketplace match in
// marketplace_skus, with blank ids excluded and counted. If that rule lived in two files they would agree
// on the day they were written and drift every day after — and the drift would be invisible, because each
// would look correct on its own. The universe below is therefore built by the SAME normalisation
// (`ppwLower_`) over the SAME table, in the same file, and publishes the authority it used.
//
// WHAT IT DELIBERATELY DOES NOT RETURN, each one a way a site list could have become a data leak:
// no price, no image URL, no product_url, no spreadsheet id, no sheet name, no SKU rows, no master SKU,
// no category and no series. A menu needs identities and counts. Anything else on this endpoint would be
// a second copy of data that already has an owner, reachable without a scope.
//
// CURRENCY IS NOT HERE EITHER, and that is not an omission. P1-B3 proved a complete site is single-currency
// and P1-B5 asserts a USD price cannot drag a non-US SKU into the US: currency is a PROPERTY of a chosen
// site, derived from pricing_list when that site is read. Publishing it here would invite a menu keyed on
// it, which is the exact defect section 4 forbids.

var PPW_SITE_UNIVERSE_ACTION_ = 'productPricing.siteUniverse.get';

// Its own contract number, separate from PPW_SCHEMA_CONTRACT_VERSION_. Two responses with two shapes need
// two version lines, or a client cannot say which one it was written against.
var PPW_SITE_UNIVERSE_CONTRACT_VERSION_ = 1;

// One table. Stated as a constant so the "this endpoint reads exactly one table" claim is checkable
// against the code that does the reading rather than against a sentence about it.
var PPW_SITE_UNIVERSE_TABLES_ = [
  { name: 'marketplace_skus',
    requiredCols: ['marketplace_sku_id', 'company', 'country', 'marketplace'] }
];

// A universe larger than this is not truncated into a shorter menu — it is reported as incomplete. A menu
// that silently lost a site is worse than one that says it could not be counted, because a missing site
// looks exactly like a site that does not exist.
var PPW_SITE_UNIVERSE_MAX_ = 2000;

/** The canonical site key. ppwLower_ is the SAME normalisation membership uses — not a second one. */
function ppwSiteIdentity_(company, country, marketplace) {
  return ppwLower_(company) + '|' + ppwLower_(country) + '|' + ppwLower_(marketplace);
}

/**
 * PURE. rows in, universe out. No clock (readAt is a parameter), no Spreadsheet, no cache, no properties.
 *
 * `readAt` is an argument for the same reason the workspace builder takes one: a builder that read the
 * clock would answer differently on two calls with identical input, and then the test that proves it
 * deterministic is testing the clock.
 */
function ppwSiteUniverseBuild_(rows, readAt, capped) {
  rows = rows || [];
  var bySite = {}, order = [];
  var blankCompany = 0, blankCountry = 0, blankMarketplace = 0, blankAny = 0;
  var blankId = 0, unknownStatus = 0;
  var seenSkuId = {}, duplicateSkuIds = {};
  var rawByKey = {};          // canonical key -> the first raw triple seen, to detect conflicting spellings
  var identityConflicts = [];

  rows.forEach(function (r) {
    var companyRaw = ppwStr_(r.company);
    var countryRaw = ppwStr_(r.country);
    var marketRaw = ppwStr_(r.marketplace);

    // BLANK IDENTITY IS COUNTED AND EXCLUDED, NEVER OFFERED. A blank option in a site menu is a choice a
    // person can make that cannot be answered — the request would be refused as SCOPE_INCOMPLETE after
    // they had already chosen it.
    if (companyRaw === '') blankCompany++;
    if (countryRaw === '') blankCountry++;
    if (marketRaw === '') blankMarketplace++;
    if (companyRaw === '' || countryRaw === '' || marketRaw === '') { blankAny++; return; }

    var id = ppwStr_(r.marketplace_sku_id);
    if (id === '') { blankId++; }
    else {
      // A DUPLICATE ID IS A MIS-ATTRIBUTION RISK FOR EVERY JOIN DOWNSTREAM, so it is detected here even
      // though this endpoint performs no join at all: the universe is what a person chooses FROM, and
      // offering a site whose rows may attach to the wrong product is offering a wrong answer.
      if (Object.prototype.hasOwnProperty.call(seenSkuId, id)) {
        duplicateSkuIds[id] = (duplicateSkuIds[id] || 1) + 1;
      }
      seenSkuId[id] = true;
    }

    var key = ppwSiteIdentity_(companyRaw, countryRaw, marketRaw);
    var rawTriple = companyRaw + '|' + countryRaw + '|' + marketRaw;
    if (!Object.prototype.hasOwnProperty.call(rawByKey, key)) {
      rawByKey[key] = rawTriple;
    } else if (rawByKey[key] !== rawTriple) {
      // TWO SPELLINGS OF ONE SITE. "KM " and "KM" normalise together but are written differently, so a
      // reader cannot tell which one the data means and neither can a later exact-match join.
      if (identityConflicts.indexOf(key) === -1) identityConflicts.push(key);
    }

    if (!Object.prototype.hasOwnProperty.call(bySite, key)) {
      bySite[key] = {
        company: companyRaw, country: countryRaw, marketplace: marketRaw,
        membership_row_count: 0,
        active_count: 0, phasing_out_count: 0, inactive_count: 0, discontinued_count: 0,
        unknown_status_count: 0, blank_id_count: 0,
        refusal_reasons: []
      };
      order.push(key);
    }
    var site = bySite[key];
    site.membership_row_count++;
    if (id === '') site.blank_id_count++;

    var status = ppwLower_(r.marketplace_sku_status);
    if (status === 'active') site.active_count++;
    else if (status === 'phasing_out') site.phasing_out_count++;
    else if (status === 'inactive') site.inactive_count++;
    else if (status === 'discontinued') site.discontinued_count++;
    else {
      // NAMED, NOT ASSUMED ACTIVE. Defaulting an unreadable status to sellable would put a listing in a
      // menu on the strength of a blank cell.
      site.unknown_status_count++;
      unknownStatus++;
    }
  });

  // DETERMINISTIC ORDER, so two identical reads produce two identical menus and a diff between them is a
  // change in the data rather than in the sheet's row order.
  order.sort();

  var sites = order.map(function (k) {
    var site = bySite[k];
    // SELECTABLE IS DERIVED FROM THE EXISTING PRODUCT RULE, NOT INVENTED HERE. PPW_DEFAULT_STATUSES_ is
    // what the workspace read applies when a caller names no statuses, so a site with nothing in that gate
    // opens to an empty chart by default. It is reported as not selectable BY DEFAULT, with the reason
    // named and the override stated — `include_inactive` is a real and supported request, so the second
    // flag says the site is reachable that way rather than pretending it does not exist.
    var defaultCount = site.active_count + site.phasing_out_count;
    var inactiveCount = site.inactive_count + site.discontinued_count;
    site.default_status_row_count = defaultCount;
    site.selectable = defaultCount > 0;
    site.selectable_with_inactive = (defaultCount + inactiveCount + site.unknown_status_count) > 0;
    if (defaultCount === 0 && inactiveCount > 0) {
      site.refusal_reasons.push('ONLY_INACTIVE_OR_DISCONTINUED_LISTINGS');
    }
    if (site.unknown_status_count > 0) site.refusal_reasons.push('UNKNOWN_STATUS_ROWS_PRESENT');
    if (site.blank_id_count > 0) site.refusal_reasons.push('BLANK_MARKETPLACE_SKU_ID_ROWS');
    site.site_key = k;
    return site;
  });

  // THE HIERARCHY, built from the same site list rather than from a second pass over the rows — a second
  // pass is a second chance to disagree with the first.
  var companies = [], countriesByCompany = {}, marketplacesByCountry = {};
  sites.forEach(function (site) {
    if (companies.indexOf(site.company) === -1) companies.push(site.company);
    if (!countriesByCompany[site.company]) countriesByCompany[site.company] = [];
    if (countriesByCompany[site.company].indexOf(site.country) === -1) {
      countriesByCompany[site.company].push(site.country);
    }
    var ck = site.company + '|' + site.country;
    if (!marketplacesByCountry[ck]) marketplacesByCountry[ck] = [];
    if (marketplacesByCountry[ck].indexOf(site.marketplace) === -1) {
      marketplacesByCountry[ck].push(site.marketplace);
    }
  });
  companies.sort();
  Object.keys(countriesByCompany).forEach(function (k) { countriesByCompany[k].sort(); });
  Object.keys(marketplacesByCountry).forEach(function (k) { marketplacesByCountry[k].sort(); });

  var dupIdList = Object.keys(duplicateSkuIds).sort();
  var findings = [];
  if (dupIdList.length > 0) {
    findings.push({ code: 'DUPLICATE_MARKETPLACE_SKU_ID', level: 'universe',
      detail: 'the same marketplace_sku_id appears more than once, so a join may attach to the wrong'
        + ' product', subject: dupIdList.slice(0, 50), count: dupIdList.length });
  }
  if (identityConflicts.length > 0) {
    findings.push({ code: 'AMBIGUOUS_SITE_IDENTITY', level: 'universe',
      detail: 'one canonical site is spelled more than one way in the source',
      subject: identityConflicts.slice(0, 50), count: identityConflicts.length });
  }

  // ---- THE STATE. Order matters, and each branch refuses something the next one would have hidden. ----
  var state, refusals = [];
  if (findings.length > 0) {
    // A STOP, NOT A WARNING. Every count below inherits an identity nobody can resolve.
    state = 'STOP_DATA_INTEGRITY';
    findings.forEach(function (f) {
      refusals.push(ppwRefusal_(f.code, f.detail, f.subject));
    });
  } else if (capped === true) {
    // CAPPED IS NOT COMPLETE, and it is not empty either. A partial read has not established what exists.
    state = 'SOURCE_PARTIALLY_READABLE';
    refusals.push(ppwRefusal_('SOURCE_ROW_CAP_REACHED',
      'the membership table exceeded the read cap, so this is not the whole universe',
      PPW_SITE_UNIVERSE_MAX_));
  } else if (sites.length === 0) {
    // MEASURED, AND EMPTY. Only reachable when the table was fully read and held no usable identity.
    state = 'SOURCE_EMPTY';
  } else {
    state = 'READY';
  }

  return {
    sourceState: state,
    // THE SERVER NEVER SENDS THE CLIENT-ONLY STATE. A response carrying it would be proof a server
    // answered, which is the one thing that state claims did not happen.
    sites: state === 'READY' ? sites : [],
    site_count: state === 'READY' ? sites.length : 0,
    hierarchy: state === 'READY'
      ? { companies: companies, countries_by_company: countriesByCompany,
          marketplaces_by_country: marketplacesByCountry }
      : null,
    identity_authority: 'marketplace_skus (company + country + marketplace)',
    identity_normalization: 'trim and case-fold for comparison; the RAW value is what is published',
    excluded: {
      blank_company_rows: blankCompany, blank_country_rows: blankCountry,
      blank_marketplace_rows: blankMarketplace, blank_identity_rows: blankAny,
      blank_marketplace_sku_id_rows: blankId, unknown_status_rows: unknownStatus
    },
    findings: findings,
    refusals: refusals,
    completeness: {
      rows_examined: rows.length, capped: capped === true, cap: PPW_SITE_UNIVERSE_MAX_,
      is_whole_universe: state === 'READY'
    },
    schema: {
      contract_version: PPW_SITE_UNIVERSE_CONTRACT_VERSION_,
      build: PPW_BUILD_VERSION_,
      action: PPW_SITE_UNIVERSE_ACTION_,
      read_at: readAt === undefined || readAt === null ? null : new Date(readAt).toISOString(),
      read_at_is: 'WHEN_THE_SERVER_READ_THE_TABLE',
      source_modified_at: null,
      // The API name that could report this is kept OUT of the string and named in this comment only,
      // because the final-output seam audit strips comments but not string literals: DriveApp.
      source_modified_at_unavailable_because: 'the file-modification API is not in this deployment scope',
      table: ppwSchemaFingerprint_(rows)
    },
    // STATED AS DATA so a suite asserts the property rather than trusting the prose above.
    publishes: ['company', 'country', 'marketplace', 'counts', 'selectability'],
    does_not_publish: ['price', 'currency', 'image_url', 'product_url', 'spreadsheet_id', 'sheet_name',
      'sku_rows', 'master_sku', 'category', 'series']
  };
}

/** The refused shape, so a caller has one branch for "no universe" regardless of why. */
function ppwSiteUniverseRefused_(code, detail, subject) {
  return {
    sourceState: null,
    sites: [], site_count: 0, hierarchy: null,
    identity_authority: 'marketplace_skus (company + country + marketplace)',
    identity_normalization: null,
    excluded: null,
    findings: [],
    refusals: [ppwRefusal_(code, detail, subject === undefined ? null : subject)],
    completeness: { rows_examined: 0, capped: false, cap: PPW_SITE_UNIVERSE_MAX_,
      is_whole_universe: false },
    schema: { contract_version: PPW_SITE_UNIVERSE_CONTRACT_VERSION_, build: PPW_BUILD_VERSION_,
      action: PPW_SITE_UNIVERSE_ACTION_, read_at: null, read_at_is: null,
      source_modified_at: null, source_modified_at_unavailable_because: null, table: null },
    publishes: [], does_not_publish: []
  };
}

/**
 * THE ENTRY POINT. Same io helper as the workspace read — not a copy of it, the same object — so the flag
 * resolver, the target assertion and the fail-closed table read are one implementation for both actions.
 */
function handleProductPricingSiteUniverseGet_(body, io) {
  io = io || ppwDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = ppwStr_(body && body.requestId) || ('REQ-U' + ('000000' + seq).slice(-6));
  try {
    // ---- THE FLAG, BEFORE THE DOOR. Identical discipline to the workspace read, and for the identical
    //      reason: there is no RBAC here, so this gate IS the access control, and a gate that runs after
    //      the read has already failed at the only job it had.
    if (io.flagEnabled() !== true) {
      return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, true,
        ppwSiteUniverseRefused_('FEATURE_DISABLED',
          'PRODUCT_STRATEGY_ENABLED_ is false in the deployment that answered', null),
        [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, dbOpened: false,
          refused: true, refusalCode: 'FEATURE_DISABLED' });
    }

    // ---- NO REQUEST FIELDS AT ALL. This action takes no scope, no filter and no page: the universe is
    //      the universe. A payload that tried to narrow it would be a way to ask a different question
    //      than the one this endpoint's zero-write, zero-leak guarantees were written about.
    var ss = io.openTarget();
    var spec = PPW_SITE_UNIVERSE_TABLES_[0];
    var rows;
    try {
      rows = io.readTable(ss, spec.name, spec.requiredCols);
    } catch (schemaErr) {
      // A MISSING OR MALFORMED TABLE IS NOT AN EMPTY ONE (section 5.1). Empty is the one answer a caller
      // responds to by moving on, and a table nobody could read has established nothing at all.
      return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, true,
        (function () {
          var d = ppwSiteUniverseRefused_('SOURCE_TABLE_UNREADABLE',
            String((schemaErr && schemaErr.message) || schemaErr), spec.name);
          d.sourceState = 'SOURCE_PARTIALLY_READABLE';
          return d;
        }()),
        [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, dbOpened: true,
          refused: true, refusalCode: 'SOURCE_TABLE_UNREADABLE' });
    }

    var capped = (rows || []).length > PPW_SITE_UNIVERSE_MAX_;
    if (capped) rows = rows.slice(0, PPW_SITE_UNIVERSE_MAX_);

    // THE CLOCK IS READ HERE AND PASSED IN, so the builder stays a pure function of its arguments.
    var data = ppwSiteUniverseBuild_(rows, io.now(), capped);
    return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, true, data, [], { requestId: reqId, serverDurationMs: (io.now() - t0),
      tablesRead: 1, dbOpened: true, refused: data.refusals.length > 0,
      refusalCode: data.refusals.length ? data.refusals[0].code : null });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode))
      || 'PRODUCT_PRICING_SITE_UNIVERSE_BUILD_FAILED';
    return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, false, null,
      [{ code: code, message: String((e && e.message) || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0), refused: true, refusalCode: code });
  }
}
