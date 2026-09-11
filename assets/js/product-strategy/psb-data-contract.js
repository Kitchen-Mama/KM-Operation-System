/* ==================================================================================================
   PRODUCT STRATEGY BOARD — ProductStrategyDataContract          P0-R3, non-runtime prototype
   ==================================================================================================

   THIS FILE IS THE CONTRACT, NOT THE DATA. It says where every field a strategy screen needs WOULD
   come from in the Operation System database, which fields have no source at all, and what an adapter
   must return. It reads nothing and calls nothing.

   Every `source_table` / `source_column` below is quoted from a shipped source file at a cited line.
   The audit that produced them is design freeze section 23; the field table here is section 24.
   Nothing is inferred from a field NAME: a column that could not be found in shipped code is a GAP,
   and a GAP is never filled from a neighbouring column that happens to look similar.

   TWO WORDS THAT ARE NOT INTERCHANGEABLE, and the whole file depends on the difference:
     ABSENT VALUE  — the column exists and this row's cell is empty.        -> SOURCE_MISSING
     ABSENT COLUMN — no table in the database has this field at all.        -> GAP
   The first is a data question and can be fixed by typing. The second is a schema question and needs
   a decision. Reporting one as the other is how a board comes to promise something nobody can supply.
   ================================================================================================== */

(function (global) {
  'use strict';

  var C = {};

  C.CONTRACT_NAME = 'ProductStrategyDataContract';
  C.CONTRACT_VERSION = 'P1-B2';
  /* P1-B2 changed three things and nothing else: `regional` was appended, and `category` and `series`
     became nullable on READ. See the two notes below and REGIONAL, at the bottom of this section. */
  C.CONTRACT_VERSION_HISTORY = ['P0-R3', 'P0-R3-R2', 'P1-B2'];
  C.AUDIT_SECTION = 'PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md section 23 (source audit) + 24 (this contract)';

  /* ------------------------------------------------------------------------------------------------
     THE SIX CANONICAL SOURCE TABLES, with the shipped declaration that defines each one's columns.
     ------------------------------------------------------------------------------------------------ */
  C.SOURCE_TABLES = [
    { table: 'sku_details', grain: 'one row per MASTER sku',
      primary_key: 'sku',
      column_authority: 'assets/js/pages/sku-details.js:2369 (export/import schema, 43 columns)',
      write_gate: 'assets/specs/active/apps-script/04_marketplace_forecast_import.gs:150'
        + ' requires sku, category, series, selling_price, minimum_price, msrp before any write',
      editable_fields: 'assets/specs/active/apps-script/03_master_data_handlers.gs:125'
        + ' (SKU_DETAILS_UPSERT_FIELDS_)' },
    { table: 'marketplace_skus', grain: 'one row per sku + company + country + marketplace',
      primary_key: 'marketplace_sku_id',
      column_authority: 'assets/specs/active/apps-script/04_marketplace_forecast_import.gs:151'
        + ' (requiredHeaders.marketplace_skus, 14 columns)' },
    { table: 'sku_regional_details', grain: 'sku + company + country + marketplace',
      primary_key: 'regional_detail_id',
      column_authority: 'assets/specs/active/apps-script/18_sku_regional_handlers.gs:17'
        + ' (SKU_REGIONAL_DETAILS_HEADERS_, 16 columns)',
      note: 'The file states its own exclusions at 18_:16 — NO hscode/duty/declared-value, and'
        + ' NO status/note/marketplace_sku_id. There is therefore no regional status column.' },
    { table: 'pricing_list', grain: 'one row per marketplace_sku_id',
      primary_key: 'pricing_id',
      column_authority: 'assets/specs/active/apps-script/04_marketplace_forecast_import.gs:152'
        + ' (requiredHeaders.pricing_list, 27 columns)',
      note: 'HAS NO company COLUMN. Two companies on the same country|marketplace|sku can be told'
        + ' apart ONLY by marketplace_sku_id, so every price lookup must join through it.' },
    { table: 'campaigns', grain: 'company|country|marketplace|campaign_name|year',
      primary_key: 'campaign_id',
      column_authority: 'assets/specs/active/apps-script/20_campaign_write_handlers.gs:28'
        + ' (CAMPAIGNS_HEADERS_, 25 columns)',
      business_key: 'assets/specs/active/apps-script/20_campaign_write_handlers.gs:49' },
    { table: 'campaign_sku_lines', grain: 'one row per campaign_id + marketplace_sku_id',
      primary_key: 'campaign_sku_line_id',
      column_authority: 'assets/specs/active/apps-script/20_campaign_write_handlers.gs:40'
        + ' (CAMPAIGN_SKU_LINES_HEADERS_, 16 columns)',
      note: 'promo_price is the ONLY authoritative deal price (20_:36). price_units is a display'
        + ' currency snapshot and the file itself refuses to let it be an FX rate (20_:37-39).' }
  ];

  /* ------------------------------------------------------------------------------------------------
     THE JOIN. One path, stated once, because a second path would be a second answer.
     ------------------------------------------------------------------------------------------------ */
  C.JOIN_PATH = {
    grain: 'ONE CONTRACT ROW = ONE OPERATIONAL SITE SKU = one marketplace_skus row',
    steps: [
      'sku_details.sku  ->  marketplace_skus.sku            (1 master : N sites)',
      'marketplace_skus (sku, company, country, marketplace) -> marketplace_sku_id   [the site identity]',
      'marketplace_sku_id  ->  pricing_list.marketplace_sku_id                        (1 : 1)',
      'marketplace_sku_id  ->  campaign_sku_lines.marketplace_sku_id                  (1 : N deal lines)',
      'campaign_sku_lines.campaign_id  ->  campaigns.campaign_id                      (period + status)',
      'sku_details.sku + (company, country, marketplace) -> sku_regional_details      (same grain, 18_:13)'
    ],
    forbidden: 'Joining pricing_list on (country, marketplace, sku) is AMBIGUOUS and must never be'
      + ' implemented: pricing_list has no company column, so that key cannot separate two companies'
      + ' operating the same site sku.'
  };

  /* ------------------------------------------------------------------------------------------------
     THE FIELD TABLE. This is the contract.
     `api_today` answers: can a bounded, shipped read action supply this today?
     `needs_p1b1` answers: does the next round have to build a read owner (or a column) for it?
     ------------------------------------------------------------------------------------------------ */
  C.FIELDS = [
    { field: 'identity', source_table: 'marketplace_skus', source_column: 'marketplace_sku_id',
      join_key: 'the site identity itself', nullable: false, on_missing: 'CONTRACT_MISMATCH',
      api_today: 'skuDetails.workspace.get with include.regional', needs_p1b1: false,
      note: 'The one stable key for a contract row. Not company|country|marketplace|sku: that quadruple'
        + ' identifies the same thing but is not what pricing_list joins on.' },

    { field: 'master_sku', source_table: 'sku_details', source_column: 'sku',
      join_key: 'sku_details.sku = marketplace_skus.sku', nullable: false,
      on_missing: 'CONTRACT_MISMATCH',
      api_today: 'skuDetails.workspace.get (base table)', needs_p1b1: false },

    { field: 'site_sku', source_table: 'marketplace_skus', source_column: 'site_sku',
      join_key: 'same row as identity', nullable: true, on_missing: 'SOURCE_MISSING',
      api_today: 'skuDetails.workspace.get with include.regional', needs_p1b1: false,
      note: 'The listing code on the site. It is NOT the master sku and the two must not be conflated;'
        + ' sku_regional_details carries its own copy of the same value at the same grain.' },

    /* P0-R3-R2 — CATEGORY IS THE FIRST SCOPE, NOT A FILTER AMONG OTHERS. A price ladder is an
       argument about products a buyer would consider instead of one another, and an electric can
       opener is not an alternative to a spatula. Putting two categories on one axis does not make a
       wider ladder, it makes a meaningless one: every gap, overlap and cannibalisation it produces
       is measured between things that do not compete. The column is real — `category` is in the
       43-column export schema at sku-details.js:2369 — so this is a scope the database can actually
       enforce, and P1-B1 must bound the read by it server-side rather than filter after the fact. */
    { field: 'category', source_table: 'sku_details', source_column: 'category',
      join_key: 'sku_details.sku', nullable: true, on_missing: 'CATEGORY_SOURCE_MISSING',
      api_today: 'skuDetails.workspace.get (base table)', needs_p1b1: false,
      note: 'Two categories never share a price axis, and no gap, overlap or cannibalisation may be'
        + ' computed across one. A cross-category view is cards and a table, never a shared Y axis.',
      p1b2_note: 'NULLABLE ON READ, corrected in P1-B2. The pre-write header gate (04_:150) requires a'
        + ' category before a WRITE, which is not the same as every existing row having one — and the'
        + ' frozen rule (design freeze 33.6) is that a blank category keeps the SKU, returns'
        + ' category: null, is reported as CATEGORY_SOURCE_MISSING, and is NEVER renamed "Other". A'
        + ' contract that called that a CONTRACT_MISMATCH would force the renderer to choose between'
        + ' dropping the row and inventing a bucket for it, which are the two outcomes the rule exists'
        + ' to forbid. It is a Data Quality finding, not a malformed row.' },

    { field: 'product_name', source_table: 'sku_details', source_column: 'product_name',
      join_key: 'sku_details.sku', nullable: false, on_missing: 'SOURCE_MISSING',
      api_today: 'skuDetails.workspace.get (base table)', needs_p1b1: false,
      note: 'Required by the IMPORT contract (sku-details.js:2371) but NOT by the pre-write header'
        + ' gate (04_:150), so a row can exist without one. Hence nullable on read.' },

    { field: 'series', source_table: 'sku_details', source_column: 'series',
      join_key: 'sku_details.sku', nullable: true, on_missing: 'SOURCE_MISSING',
      p1b2_note: 'NULLABLE ON READ, for the same reason as category: 72_ already reports a blank series'
        + ' as VARIANT_GROUPING_SOURCE_MISSING and renders the row ungrouped rather than dropping it.',
      api_today: 'skuDetails.workspace.get (base table)', needs_p1b1: false,
      note: 'THE ONLY grouping column that exists in the database. It groups a SERIES, not a model:'
        + ' see VARIANT_GROUPING below for why that is not enough to merge colours.' },

    { field: 'variant_group', source_table: null, source_column: null,
      join_key: null, nullable: true, on_missing: 'VARIANT_GROUPING_SOURCE_MISSING',
      api_today: false, needs_p1b1: true, gap: true,
      note: 'GAP. No parent_sku, model, variant_group or colour column exists in ANY of the six tables'
        + ' — searched across assets/specs/active/apps-script/*.gs. Must not be derived by truncating'
        + ' a sku string: CO1150-R and CO1150-T sharing a prefix is a naming habit, not a declared'
        + ' relationship, and a habit that is right 95% of the time merges the other 5% wrongly and'
        + ' silently.' },

    { field: 'variant_name', source_table: null, source_column: null,
      join_key: null, nullable: true, on_missing: 'VARIANT_GROUPING_SOURCE_MISSING',
      api_today: false, needs_p1b1: true, gap: true,
      note: 'GAP, same search. The colour/finish a variant represents is not recorded anywhere.' },

    { field: 'company', source_table: 'marketplace_skus', source_column: 'company',
      join_key: 'part of the site grain', nullable: false, on_missing: 'CONTRACT_MISMATCH',
      api_today: 'skuDetails.workspace.get with include.regional', needs_p1b1: false,
      note: 'Present here and ABSENT from pricing_list — the asymmetry that forces the join path.' },

    { field: 'country', source_table: 'marketplace_skus', source_column: 'country',
      join_key: 'part of the site grain', nullable: false, on_missing: 'CONTRACT_MISMATCH',
      api_today: 'skuDetails.workspace.get with include.regional', needs_p1b1: false },

    { field: 'marketplace', source_table: 'marketplace_skus', source_column: 'marketplace',
      join_key: 'part of the site grain', nullable: false, on_missing: 'CONTRACT_MISMATCH',
      api_today: 'skuDetails.workspace.get with include.regional', needs_p1b1: false },

    { field: 'currency', source_table: 'pricing_list', source_column: 'currency',
      join_key: 'pricing_list.marketplace_sku_id = identity', nullable: false,
      on_missing: 'SOURCE_MISSING',
      api_today: false, needs_p1b1: true,
      note: 'TWO CURRENCY COLUMNS EXIST — marketplace_skus.currency and pricing_list.currency. The'
        + ' price row wins, because it is the currency OF THESE NUMBERS. Reading the other one would'
        + ' let a panel be labelled in a currency its prices are not in.' },

    { field: 'regular_price', source_table: 'pricing_list', source_column: 'regular_price',
      join_key: 'pricing_list.marketplace_sku_id = identity', nullable: true,
      on_missing: 'SOURCE_MISSING',
      api_today: false, needs_p1b1: true,
      note: 'THE BAND BASIS (decision D-2). Never back-filled from sku_details.selling_price, which is'
        + ' a master base input rather than a site-effective price. A substituted point renders'
        + ' identically to a measured one.' },

    { field: 'minimum_price', source_table: 'pricing_list', source_column: 'minimum_price',
      join_key: 'pricing_list.marketplace_sku_id = identity', nullable: true,
      on_missing: 'SOURCE_MISSING',
      api_today: false, needs_p1b1: true,
      note: 'sku_details.minimum_price also exists and is a DIFFERENT number: the master floor, not the'
        + ' site floor. Not a fallback.' },

    { field: 'msrp', source_table: 'pricing_list', source_column: 'msrp',
      join_key: 'pricing_list.marketplace_sku_id = identity', nullable: true,
      on_missing: 'SOURCE_MISSING',
      api_today: false, needs_p1b1: true,
      note: 'sku_details.msrp likewise exists at master grain. Same refusal.' },

    { field: 'official_deal_price', source_table: 'campaign_sku_lines', source_column: 'promo_price',
      join_key: 'campaign_sku_lines.marketplace_sku_id = identity', nullable: true,
      on_missing: 'SOURCE_MISSING',
      api_today: false, needs_p1b1: true,
      note: 'The ONLY authoritative deal price (20_:36). A board-owned proposal is a different field'
        + ' and is never written here.' },

    { field: 'official_deal_start', source_table: 'campaigns', source_column: 'start_date',
      join_key: 'campaign_sku_lines.campaign_id = campaigns.campaign_id', nullable: true,
      on_missing: 'SOURCE_MISSING',
      api_today: false, needs_p1b1: true,
      note: 'The period lives on the CAMPAIGN, not on the line. A promo_price with no resolvable'
        + ' campaign window is a price with no validity and must not be shown as a live deal.' },

    { field: 'official_deal_end', source_table: 'campaigns', source_column: 'end_date',
      join_key: 'campaign_sku_lines.campaign_id = campaigns.campaign_id', nullable: true,
      on_missing: 'SOURCE_MISSING',
      api_today: false, needs_p1b1: true },

    { field: 'product_image', source_table: 'sku_details', source_column: 'image_url',
      join_key: 'sku_details.sku', nullable: true, on_missing: 'IMAGE_SOURCE_MISSING',
      api_today: 'skuDetails.workspace.get (base table, raw passthrough)', needs_p1b1: false,
      note: 'The column is REAL: it is in the 43-column export schema (sku-details.js:2369) and in the'
        + ' editable field allowlist (03_:132). The client already maps it — operation-system-db-api.js'
        + ' :184 sets image = String(r.image_url || \'\') — and sku-overrides.js classifies it as'
        + ' PRESENT / ABSENT with reason NO_IMAGE_URL_ON_RECORD. This contract reuses that'
        + ' CLASSIFICATION and not its browser-storage override branch.' },

    { field: 'lifecycle_status', source_table: 'sku_details', source_column: 'lifecycle',
      join_key: 'sku_details.sku', nullable: false, on_missing: 'SOURCE_MISSING',
      api_today: 'skuDetails.workspace.get (base table)', needs_p1b1: false,
      vocabulary: ['Upcoming SKU', 'Running in the Market', 'Phasing Out', 'Closure', 'Other'],
      vocabulary_authority: 'assets/specs/active/apps-script/00_config.gs:9 VALID_LIFECYCLES_' },

    { field: 'source_status', source_table: 'marketplace_skus', source_column: 'marketplace_sku_status',
      join_key: 'the site grain', nullable: false, on_missing: 'SOURCE_MISSING',
      api_today: 'skuDetails.workspace.get with include.regional', needs_p1b1: false,
      vocabulary: ['active', 'phasing_out', 'inactive', 'discontinued'],
      vocabulary_authority: 'assets/specs/active/apps-script/00_config.gs:12'
        + ' VALID_MARKETPLACE_SKU_STATUSES_',
      note: 'THE SITE STATUS LIVES HERE, not in sku_regional_details, which has no status column at'
        + ' all (18_:16). Five different statuses exist across the six tables and they are not'
        + ' interchangeable: lifecycle (master), marketplace_sku_status (site), pricing_list'
        + '.price_status (the price row), campaign_sku_lines.line_status (the deal line) and'
        + ' campaigns.status (the campaign).' },

    { field: 'missing_reasons', source_table: null, source_column: null,
      join_key: null, nullable: false, on_missing: 'CONTRACT_MISMATCH',
      api_today: 'derived by the adapter', needs_p1b1: false, derived: true,
      note: 'An ARRAY, always present, empty when nothing is missing. A field rather than a silence,'
        + ' because "no reasons were given" and "nothing is missing" are different states.' },

    { field: 'provenance', source_table: null, source_column: null,
      join_key: null, nullable: false, on_missing: 'CONTRACT_MISMATCH',
      api_today: 'derived by the adapter', needs_p1b1: false, derived: true,
      note: 'Which adapter produced the row and what its values ARE — PREVIEW or OPERATION_DB. Every'
        + ' row carries it, so a screen can never render a preview number without being able to say'
        + ' that it is one.' }
  ];

  /* P1-B2 — THE REGIONAL RECORD, PRESENT OR HONESTLY ABSENT.

     A SEPARATE TABLE, SO IT CAN BE MISSING WITHOUT THE LISTING BEING MISSING. `null` here means
     sku_regional_details has no row for this exact four-part identity (sku + company + country +
     marketplace). It does NOT mean the SKU is not sold on this site: membership is marketplace_skus and
     only marketplace_skus (design freeze 31.5). So a null is three outcomes at once and none of them is
     removal — the row stays in the universe, it is reported as Data Quality, and it is kept off the
     price chart until somebody supplies the record.

     THE FIELD IS AN OBJECT OR NULL, never a flattened prefix. The live read returns exactly this shape
     (72_ ppwNormalizeRow_), so the live adapter hands it over without translation. */
  C.FIELDS.push({ field: 'regional', source_table: 'sku_regional_details',
    source_column: 'the row itself, as an object',
    join_key: 'sku + company + country + marketplace', nullable: true,
    on_missing: 'REGIONAL_DETAILS_MISSING',
    api_today: 'productPricing.workspace.get with include.regional', needs_p1b1: false,
    note: 'Absent is a value. It is never read as "not sold here" and never as "sold everywhere".' });

  /* P0-R3-R2 — HOW THE IMAGE WAS PROVED, CARRIED BESIDE THE IMAGE. product_image says WHAT to
     draw; this says WHY it may be drawn, and it travels with the row so a renderer never has to
     guess and a reader can always ask. */
  C.FIELDS.push({ field: 'image_identity_status', source_table: 'derived',
    source_column: 'derived from the image evidence audit',
    join_key: 'the row itself', nullable: false, on_missing: 'CONTRACT_MISMATCH',
    api_today: 'derived', needs_p1b1: false,
    note: 'VERIFIED_DB_MAPPING when an authoritative record names that exact file and the file'
      + ' exists; IMAGE_SOURCE_MISSING otherwise. Never inferred from a filename.' });

  C.FIELD_NAMES = C.FIELDS.map(function (f) { return f.field; });
  C.GAP_FIELDS = C.FIELDS.filter(function (f) { return f.gap === true; })
    .map(function (f) { return f.field; });
  C.FIELDS_NEEDING_P1B1 = C.FIELDS.filter(function (f) { return f.needs_p1b1 === true; })
    .map(function (f) { return f.field; });
  C.FIELDS_AVAILABLE_TODAY = C.FIELDS.filter(function (f) {
    return typeof f.api_today === 'string' && f.api_today.indexOf('skuDetails.workspace.get') === 0;
  }).map(function (f) { return f.field; });

  C.fieldSpec = function (name) {
    var hit = null;
    C.FIELDS.forEach(function (f) { if (f.field === name) hit = f; });
    return hit;
  };

  /* ------------------------------------------------------------------------------------------------
     WHAT EXISTS TODAY, AND WHAT DOES NOT. Measured, not assumed — see design freeze section 23.8.
     ------------------------------------------------------------------------------------------------ */
  C.API_OWNERSHIP = {
    bounded_owner_exists: [
      { tables: ['sku_details', 'tax_referral_rates', 'tax_rate_components'],
        action: 'skuDetails.workspace.get',
        owner: 'assets/specs/active/apps-script/59_api_v1_sku_details_workspace.gs:46',
        bounds: 'row cap SKD_WS_ROW_MAX_ = 50000, and truncation is REPORTED via capped.* — never silent',
        shape: 'raw passthrough of each source row' },
      { tables: ['marketplace_skus', 'sku_regional_details'],
        action: 'skuDetails.workspace.get with include.regional',
        owner: 'assets/specs/active/apps-script/59_api_v1_sku_details_workspace.gs:50-51',
        bounds: 'same cap; include-gated so an un-requested table costs no read (59_:164)',
        shape: 'raw passthrough' }
    ],
    no_bounded_owner: [
      { table: 'pricing_list',
        reachable_only_by: ['getOperationDb (44 tabs, 03_:31)', 'getTable?table=pricing_list (03_:52)'],
        why_that_is_not_an_owner: 'getOperationDb reads 44 tabs to answer one question and decision D-5'
          + ' forbids it in P1. getTable returns a WHOLE tab with no scope, no bounds, no pagination'
          + ' and no cap — 03_:66 is readSheetAsObjects_ then filterRows_ and nothing else.' },
      { table: 'campaigns',
        reachable_only_by: ['getOperationDb', 'getTable?table=campaigns'],
        why_that_is_not_an_owner: 'Same. The router has campaign WRITE actions only — upsertCampaign'
          + ' and upsertCampaignSkuLines (01_router.gs:857-864). There is no campaign read action.' },
      { table: 'campaign_sku_lines',
        reachable_only_by: ['getOperationDb', 'getTable?table=campaign_sku_lines'],
        why_that_is_not_an_owner: 'Same as campaigns.' }
    ],
    no_owner_at_all: [
      { thing: 'product_strategy_boards / _elements / _revisions',
        state: 'The tables do not exist. Proposed in design freeze section 6; nothing is created here.' }
    ]
  };

  /* ------------------------------------------------------------------------------------------------
     THE VARIANT GROUPING CONTRACT.
     ------------------------------------------------------------------------------------------------ */
  C.VARIANT_GROUPING = {
    authority_field: 'variant_group',
    authority_state: 'GAP — no column in the six canonical tables can prove it',
    derivation_forbidden: 'A variant_group is NEVER derived from the sku string. Truncating at a dash'
      + ' would merge on a naming habit, and the merge would be invisible once made.',
    merge_rule: 'Two contract rows merge into ONE product node only when BOTH hold: (1) they carry the'
      + ' SAME non-empty variant_group, and (2) all four prices — regular_price, minimum_price, msrp'
      + ' and official_deal_price — are equal to the cent.',
    split_rule: 'Any difference in any one of those four prices makes a DISTINCT PRICE VARIANT, which'
      + ' is plotted as its own column. A price band is a statement about price; two prices cannot'
      + ' share one position on a price axis.',
    ungrouped_rule: 'A row with no variant_group is rendered ALONE and labelled'
      + ' VARIANT_GROUPING_SOURCE_MISSING. It is never merged with anything, not even with a row it'
      + ' obviously belongs to.',
    representative_rule: 'A merged node shows ONE image, from the member whose image identity is'
      + ' provable. It shows the member count and lists every merged sku, so the merge is legible'
      + ' rather than a number that hides its members.'
  };

  /* ------------------------------------------------------------------------------------------------
     THE IMAGE POLICY. Four ordered sources, and the refusals are the point.
     ------------------------------------------------------------------------------------------------ */
  /* ------------------------------------------------------------------------------------------------
     P0-R3-R1 — A FILENAME PROVES THE FILE'S NAME. THAT IS ALL IT PROVES.

     P0-R3 admitted two sources: sku_details.image_url, and a local repo file whose name IS the sku
     AND whose sku identity is corroborated by a shipped reference elsewhere. The second rule is
     RETRACTED, because it does not test what it claims to test. Corroborating that CO1100-R is a real
     sku is a fact about the SKU. It says nothing about whether the bytes in CO1100-R.jpg are a
     photograph of that product — and a wrong photograph on an executive price board looks exactly
     like a right one.

     WHAT WAS RE-AUDITED, AND WHAT WAS FOUND. Nothing in the repository binds any file under
     assets/img/products/ to any sku: no reference to the directory in any tracked file of any type,
     no manifest beside the images, no import fixture carrying an image_url value, and no shipped
     renderer that resolves a sku to a local path. The one sku-to-image mechanism that exists,
     getSkuImageOverride in sku-overrides.js, reads localStorage — a per-browser store a person types
     into, not a repository artifact — and resolveSkuImageUrl beside it upgrades http:// to https://,
     which is a pipeline expecting REMOTE URLs from the sheet. So all seven local copies were
     reclassified UNVERIFIED and removed, and the preview ships ZERO product images.
     ------------------------------------------------------------------------------------------------ */
  C.IMAGE_POLICY = {
    authority: 'sku_details.image_url',
    order: ['1. sku_details.image_url — the authoritative column, classified PRESENT / ABSENT the way'
      + ' sku-overrides.js classifySkuImageSource does, reason NO_IMAGE_URL_ON_RECORD.',
      '2. Nothing else.'],
    /* Kept on the record rather than deleted: a rule that was wrong is worth being able to find. */
    retracted_in_p0_r3_r1: {
      rule: 'A local repo file whose name IS the sku AND whose sku identity is corroborated by a'
        + ' shipped reference elsewhere in the repo.',
      why: 'It corroborates the SKU, not the IMAGE. The evidence and the claim are about different'
        + ' things, and a wrong photograph is indistinguishable from a right one on the page.'
    },
    /* What counts. P0-R3-R1 found nothing in the REPOSITORY meeting A-D, which is still true.
       P0-R3-R2 adds E, because the repository was never the only possible witness: the operator can
       read the database. */
    evidence_accepted: {
      A: 'sku_details data, or a controlled fixture source, whose image_url for that sku names that'
        + ' exact file.',
      B: 'A shipped mapping file recording master sku -> exact local image path.',
      C: 'A shipped renderer or importer carrying a traceable sku -> exact image asset mapping.',
      D: 'Any other repo content that directly proves this exact file belongs to this exact sku.',
      E: 'OPERATOR_ASSERTED_DB_RECORD — the operator reports, sku by sku, the image_url the live'
        + ' sku_details row carries, AND the named file exists in the repo at that exact path with'
        + ' exact case and extension. The assertion supplies the binding; the file check supplies'
        + ' the existence. Neither half is sufficient alone, and the mapping is per-sku: nothing is'
        + ' extended to a sku the operator did not name.'
    },
    /* P0-R3-R2 — THE SEVEN, ONE BY ONE, AND NOT ONE MORE. Every entry here was named individually
       by the operator as the image_url on that sku_details row, and every target was then checked
       to exist at that exact path. The list is data rather than prose so a test can walk it, and it
       is CLOSED: a sku absent from it has no image, however plausibly a file is named after it.
       CO2600-R.jpg and CO5600-R.jpg both exist in the repo and neither is used, because the
       operator named CO2600-B and CO5600-RB — which is exactly the substitution this table exists
       to prevent. */
    verified_mappings: {
      'CO1100-R': 'assets/img/products/CO1100-R.jpg',
      'CO1150-R': 'assets/img/products/CO1150-R.jpg',
      'CO2600-B': 'assets/img/products/CO2600-B.jpg',
      'CO5600-RB': 'assets/img/products/CO5600-RB.jpg',
      'SP3120-R': 'assets/img/products/SP3120-R.jpg',
      'SP3410-R': 'assets/img/products/SP3410-R.jpg',
      'MO5600-R': 'assets/img/products/MO5600-R.jpg'
    },
    verified_mapping_basis: 'OPERATOR_ASSERTED_DB_RECORD + EXACT_REPO_FILE_EXISTS',
    verified_mapping_caveat: 'The IMAGE identity is drawn from the live database. Every PRICE,'
      + ' promotion, campaign date and finding on the page remains demonstration data.',
    not_evidence: [
      'The filename contains the sku.',
      'The sku appears in tests.',
      'The sku appears in mock data.',
      'The images look alike.',
      'The directory is called products.',
      'It looks reasonable to a person.',
      'A hash matches — that proves the copy, not the subject.'
    ],
    /* THE THREE STATES A RENDERER MAY BE IN, AND NO FOURTH. */
    states: {
      PRESENT: 'sku_details.image_url carried a value and the image loaded.',
      IMAGE_SOURCE_MISSING: 'No authoritative image source for this row.',
      IMAGE_LOAD_FAILED: 'An authoritative URL was supplied and the browser could not load it.'
    },
    on_missing: 'IMAGE_SOURCE_MISSING — stated in words, report-grade, in the slot the image would'
      + ' have occupied. The card keeps its full size; no broken-image icon, no invented outline.',
    on_load_failure: 'IMAGE_LOAD_FAILED — stated in words in the same slot. The failure is REPORTED,'
      + ' never swapped for something that loads.',
    /* FROZEN FOR P1-B1. These are the answers the live renderer must give, and they are properties
       of this object so a test can check them rather than a comment so a reader can hope. */
    fallback_to_local_file: false,
    fallback_to_another_sku_image: false,
    placeholder_may_read_as_a_product_photo: false,
    network_image_loading_in_this_round: false,
    /* Seven, one per verified mapping. Not eight, and not a family: a mapping is per-sku. */
    local_copies_in_preview: 7,
    may_derive_path_from_sku: false,
    may_extend_a_mapping_to_a_sibling_sku: false,
    refused: [
      'Downloading any image from the network.',
      'Using a visually similar image of a different sku.',
      'Using a local file whose sku identity cannot be proved (a name is not a proof).',
      'Extending one verified mapping to another sku — CO2600-R is not CO2600-B.',
      'Composing a path from a sku code plus a directory plus an extension.',
      'Falling back to a same-named local file when image_url is empty or fails.',
      'Rendering a placeholder in a way that reads as a product photo.'
    ]
  };

  /* ------------------------------------------------------------------------------------------------
     THE ADAPTER SEAM.
     ------------------------------------------------------------------------------------------------ */
  C.REFUSAL = {
    SOURCE_NOT_CONNECTED: 'No connection to the Operation System database was attempted or exists.',
    SOURCE_MISSING: 'A column exists and this row has no value in it.',
    PARTIAL_DATA: 'Some rows or some fields resolved and others did not; both counts are reported.',
    CONTRACT_MISMATCH: 'A row does not have the shape ProductStrategyDataContract requires.',
    MIXED_CURRENCY_REFUSED: 'Rows in more than one currency were asked to share one price axis.'
  };
  C.REFUSAL_STATES = Object.keys(C.REFUSAL);

  /* P0-R3-R2 — THE SCOPE LADDER. Category is the outermost ring and everything else narrows
     inside it. An adapter that accepted these in any other order could be asked for two categories
     at once, and the answer would be a row set no chart may draw. */
  C.SCOPE_ORDER = ['category', 'company', 'country', 'marketplace', 'currency', 'series'];
  C.CATEGORY_AUTHORITY = {
    source: 'sku_details.category',
    shipped_at: 'sku-details.js:2369 (43-column export schema)',
    is_first_scope: true,
    cross_category_price_axis: false,
    cross_category_findings: false,
    cross_category_view: 'cards and a table, never a shared price axis',
    p1b1: 'filters.category MUST be bounded server-side. Mixing categories client-side and then'
      + ' running the analysis over the mixture produces findings between products that do not'
      + ' compete, which is worse than no finding at all.'
  };

  C.ADAPTER_INTERFACE = {
    method: 'load(filters) -> LoadResult',
    filters: ['series', 'company', 'country', 'marketplace', 'search'],
    filters_note: 'A filter that an adapter cannot apply at the source must be reported as'
      + ' applied_at: "client", never silently ignored.',
    result_shape: ['state', 'rows', 'row_count', 'fields', 'refusals', 'provenance', 'notice',
      'applied_filters', 'capped'],
    rules: [
      'Every row has EVERY contract field as an own property. A missing field is CONTRACT_MISMATCH,'
        + ' not an undefined the renderer has to guess about.',
      'A null value is a value: it means the source had nothing, and missing_reasons says which.',
      'The adapter never computes a price, never substitutes one field for another, and never'
        + ' invents a deal, an image, a margin or a current selling price.',
      'state is one of the refusal states or OK.'
    ]
  };

  /* Shape-check a row against the contract. Returns the field names that are absent, and the ones
     whose value violates their nullability. This is what makes CONTRACT_MISMATCH decidable rather
     than a feeling. */
  C.validateRow = function (row) {
    var missingFields = [], nullViolations = [];
    if (!row || typeof row !== 'object') return { ok: false, missing_fields: C.FIELD_NAMES.slice(),
      null_violations: [], reason: 'NOT_AN_OBJECT' };
    C.FIELDS.forEach(function (f) {
      if (!Object.prototype.hasOwnProperty.call(row, f.field)) { missingFields.push(f.field); return; }
      var v = row[f.field];
      var empty = (v === null || v === undefined || v === '');
      if (empty && f.nullable === false) nullViolations.push(f.field);
    });
    return { ok: missingFields.length === 0 && nullViolations.length === 0,
      missing_fields: missingFields, null_violations: nullViolations, reason: null };
  };

  C.validateRows = function (rows) {
    var bad = [];
    (rows || []).forEach(function (r, i) {
      var v = C.validateRow(r);
      if (!v.ok) bad.push({ index: i, identity: (r && r.identity) || null, detail: v });
    });
    return { ok: bad.length === 0, mismatches: bad, checked: (rows || []).length };
  };

  /* ------------------------------------------------------------------------------------------------
     THE OPERATION DB ADAPTER — DEFINED, AND DELIBERATELY NOT WIRED.
     It carries the interface, the response contract and the refusal it must return until a bounded
     read owner exists. It performs NO request of any kind: there is no client accessor reference and
     no transport call in this object, and the suite checks that on the source text.
     ------------------------------------------------------------------------------------------------ */
  C.OperationDbProductStrategyDataAdapter = {
    id: 'OPERATION_DB',
    enabled: false,
    enabled_reason: 'Three of the six source tables have no bounded read owner (see API_OWNERSHIP).'
      + ' Enabling this before P1-B1 would mean reading them through the 44-tab legacy path, which'
      + ' decision D-5 refuses.',
    requires: {
      new_read_owner_for: ['pricing_list', 'campaigns', 'campaign_sku_lines'],
      reuses_existing: ['skuDetails.workspace.get (include.regional)'],
      must_not_create: 'A SECOND read authority for sku_details / marketplace_skus /'
        + ' sku_regional_details. Those already have one and two owners of one resource disagree.'
    },
    load: function () {
      return {
        state: 'SOURCE_NOT_CONNECTED',
        rows: [], row_count: 0,
        fields: C.FIELD_NAMES.slice(),
        refusals: [{ state: 'SOURCE_NOT_CONNECTED',
          detail: 'This adapter is defined and disabled. It made no request.' }],
        provenance: { adapter: 'OPERATION_DB', values_are: 'NONE', connected: false,
          requests_made: 0 },
        notice: 'Not connected to the Operation System Database.',
        applied_filters: [], capped: false
      };
    }
  };

  C.adapterIsDisabled = function (a) {
    return !!a && a.enabled === false && a.load().state === 'SOURCE_NOT_CONNECTED'
      && a.load().rows.length === 0 && a.load().provenance.requests_made === 0;
  };

  global.PSB_CONTRACT = C;
})(this);
