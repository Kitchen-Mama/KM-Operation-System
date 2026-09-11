/* ==================================================================================================
   PRODUCT STRATEGY BOARD — PREVIEW FIXTURE + PreviewProductStrategyDataAdapter    P0-R3-R2
   ==================================================================================================

   EVERY PRICE IN THIS FILE IS INVENTED. No price, floor, list price, promotion or campaign date here
   came from the Kitchen Mama Operation System database. Nothing in this file reads anything.

   WHAT IS REAL, AND IT IS NOW THREE THINGS:

     THE SKU CODES        every one appears in shipped code, shipped tests, or both.
     THE CATEGORIES       every category string here is a value of sku_details.category, which is a
                          real column (sku-details.js:2369). HOW MANY THERE ARE IS NOT REAL AND IS NOT
                          A CONTRACT: P1-B2 added a fourth and a fifth on other sites precisely so the
                          count on screen can be seen to follow the data. The US Amazon site still has
                          three; US Walmart has four plus one blank; DE and UK have two each. A live
                          site may have one or forty, and the menu is whatever that site sells.
     SEVEN PRODUCT IMAGES each one named sku by sku by the operator as the image_url on that
                          sku_details row, and each target checked to exist at that exact path with
                          exact case and extension. Seven mappings, seven files, no eighth.

   AND THE THING THAT MUST NOT BE CONFUSED WITH THEM: using a real photograph does not make a price
   real. Every row carries price_source: 'PREVIEW_DEMONSTRATION' and connected_to_db: false, and the
   banner says so on every screen. An image proves which product it is. It proves nothing about what
   the product costs.

   WHY THE FIXTURE IS A SEPARATE FILE. A renderer that can see the fixture will eventually reach into
   it, and the reach will be invisible until the day the data comes from somewhere else. prototype.js
   is given an ADAPTER and never this object.
   ================================================================================================== */

(function (global) {
  'use strict';

  var C = global.PSB_CONTRACT;
  var F = {};

  F.NOTICE = 'Preview data — not connected to Operation System Database';
  F.VALUES_ARE = 'PREVIEW';
  F.PRICE_SOURCE = 'PREVIEW_DEMONSTRATION';
  F.IDENTITY_SOURCE = 'USER_PROVIDED_DB_EVIDENCE';

  /* THE ONLY IMAGES THIS FIXTURE MAY NAME. Read from the contract, not restated here: one table, one
     authority. A sku absent from it gets no picture, whatever a file in the repo is called. */
  var VERIFIED = C.IMAGE_POLICY.verified_mappings;
  function verifiedImage(sku) {
    /* The contract stores the ORIGINAL repo path, which is what P1-B1 will receive from image_url.
       The prototype ships its own byte-identical copy beside index.html, so the preview points at
       that — and it is still keyed by an exact sku that appears in the table, never composed. */
    if (!Object.prototype.hasOwnProperty.call(VERIFIED, sku)) return null;
    return 'images/' + sku + '.jpg';
  }

  /* ------------------------------------------------------------------------------------------------
     THE MODELS. One entry per priced node. `group` is the variant_group the real schema does not yet
     have (contract GAP), supplied here so the grouping rule has something to demonstrate on; a row
     given none stays ungrouped and says so.

     `image_sku` names WHICH member of the group carries the verified photograph. It must be one of
     this node's own colours — a representative image belongs to the grouping it represents, so a
     price-split sibling does not inherit it.
     ------------------------------------------------------------------------------------------------ */
  var MODELS = [
    /* ===================== ELECTRIC CAN OPENER ===================== */
    { cat: 'Electric Can Opener', series: 'Can Opener',
      group: 'CO1105', name: 'Compact Electric Can Opener', image_sku: null,
      colours: [['CO1105-O', 'Ivory'], ['CO1105-Z', 'Charcoal']],
      regular: '21.99', min: '17.99', msrp: '26.99',
      /* A PROMOTION PRICE WITH NO DATES. Neither live nor a risk — a data-quality finding. */
      deal: '18.99', deal_start: null, deal_end: null, campaign: 'Holiday Bundle' },

    { cat: 'Electric Can Opener', series: 'Can Opener',
      group: 'CO1100', name: 'Auto Can Opener', image_sku: 'CO1100-R',
      colours: [['CO1100-R', 'Red'], ['CO1100-S', 'Silver'], ['CO1100-T', 'Teal'],
        ['CO1100-W', 'White']],
      regular: '24.99', min: '19.99', msrp: '29.99',
      /* AN EXPIRED CAMPAIGN. A window that has closed is not a live deal. */
      deal: '21.99', deal_start: '2026-04-01', deal_end: '2026-04-30',
      campaign: 'Spring Clearance' },

    { cat: 'Electric Can Opener', series: 'Can Opener',
      group: 'CO1150', name: 'Auto Can Opener Max', image_sku: 'CO1150-R',
      colours: [['CO1150-R', 'Red'], ['CO1150-AG', 'Sage'], ['CO1150-XR', 'Crimson']],
      regular: '32.99', min: '26.99', msrp: '39.99',
      deal: '24.99', deal_start: '2026-09-01', deal_end: '2026-09-30',
      campaign: 'September Kitchen Event' },

    /* THE SAME variant_group, ONE DIFFERENT PRICE — a separate node, and it does NOT inherit
       CO1150-R's photograph, because that image represents the grouping it belongs to. */
    { cat: 'Electric Can Opener', series: 'Can Opener',
      group: 'CO1150', name: 'Auto Can Opener Max', image_sku: null,
      colours: [['CO1150-MB', 'Matte Black']],
      regular: '34.99', min: '26.99', msrp: '39.99' },

    { cat: 'Electric Can Opener', series: 'Can Opener',
      group: 'CO2600', name: 'Kitchen Multi-Tool Opener', image_sku: 'CO2600-B',
      colours: [['CO2600-B', 'Black'], ['CO2600-M', 'Mint'], ['CO2600-T', 'Teal'],
        ['CO2600-W', 'White']],
      regular: '44.99', min: '35.99', msrp: '54.99',
      proposed: '34.99' },

    { cat: 'Electric Can Opener', series: 'Can Opener',
      group: 'CO5600', name: 'Prep Station Pro', image_sku: 'CO5600-RB',
      colours: [['CO5600-RB', 'Red / Black'], ['CO5600-Q', 'Quartz'], ['CO5600-W', 'White'],
        ['CO5600-Z', 'Charcoal']],
      regular: '59.99', min: '47.99', msrp: '69.99',
      deal: '43.99', deal_start: '2026-09-05', deal_end: '2026-10-05',
      campaign: 'Autumn Table Event' },

    /* NO variant_group AT ALL — the refusal case. Rendered alone, never merged. */
    { cat: 'Electric Can Opener', series: 'Can Opener',
      group: null, name: 'Slim Can Opener', image_sku: null, model_hint: 'CO1201',
      colours: [['CO1201-MW', 'Matte White']],
      regular: '74.99', min: '59.99', msrp: '84.99' },

    /* NO PRICE ROW AT ALL. Listed, never plotted, never back-filled. */
    /* PHASING OUT, AND THEREFORE STILL ON SALE. Present by default. It also still has no price row,
       so it remains listed and unplotted for that separate reason. */
    { cat: 'Electric Can Opener', series: 'Can Opener', status: 'phasing_out',
      group: 'CO0560', name: 'Classic Can Opener', image_sku: null,
      colours: [['CO0560', null]],
      regular: null, min: '15.99', msrp: '22.99' },

    /* ===================== MANUAL CAN OPENER ===================== */
    { cat: 'Manual Can Opener', series: 'Can Opener', us_only: true,
      group: 'MO5600', name: 'Manual Safety Can Opener', image_sku: 'MO5600-R',
      colours: [['MO5600-R', 'Red'], ['MO5600-B', 'Black'], ['MO5600-M', 'Mint'],
        ['MO5600-T', 'Teal']],
      regular: '19.99', min: '15.99', msrp: '24.99' },

    /* INACTIVE ON ITS SITE. Excluded by the status gate by default, and returned by it under
       include_inactive — which is what makes the gate a gate rather than a deletion. */
    { cat: 'Manual Can Opener', series: 'Can Opener', us_only: true, status: 'inactive',
      group: 'MO5600', name: 'Manual Safety Can Opener', image_sku: null,
      colours: [['MO5600-W', 'White']],
      regular: '22.99', min: '17.99', msrp: '27.99' },

    /* ===================== SILICONE SPATULA ===================== */
    { cat: 'Silicone Spatula', series: 'Spatula', us_only: true,
      group: 'SP3120', name: 'Silicone Spatula Slim', image_sku: 'SP3120-R',
      colours: [['SP3120-R', 'Red'], ['SP3120-B', 'Black'], ['SP3120-M', 'Mint'],
        ['SP3120-T', 'Teal'], ['SP3120-Y', 'Sunflower']],
      regular: '14.99', min: '11.99', msrp: '18.99' },

    { cat: 'Silicone Spatula', series: 'Spatula', us_only: true,
      group: 'SP3210', name: 'Silicone Spatula Wide', image_sku: null,
      colours: [['SP3210-R', 'Red'], ['SP3210-B', 'Black'], ['SP3210-Y', 'Sunflower']],
      regular: '19.99', min: '15.99', msrp: '24.99' },

    { cat: 'Silicone Spatula', series: 'Spatula', us_only: true,
      group: 'SP3410', name: 'Silicone Spatula Pro', image_sku: 'SP3410-R',
      colours: [['SP3410-R', 'Red'], ['SP3410-B', 'Black'], ['SP3410-M', 'Mint'],
        ['SP3410-T', 'Teal'], ['SP3410-Y', 'Sunflower']],
      regular: '24.99', min: '19.99', msrp: '29.99',
      proposed: '14.99' },

    /* ===================== P1-B2 — THE SITE-SHAPE CASES =====================
       Each of these exists to make one wrong answer visible. None of them is on US Amazon, so the
       home site's demonstration is unchanged and the count there is still the three it always was.  */

    /* SOLD ABROAD AND NOT AT HOME. The one case the old fixture could not express, and the whole of
       "US must not show what the US does not sell": a US page that offers this is reading the master
       table or the currency instead of the site's own membership rows. */
    { cat: 'Milk Frother', series: 'Frother',
      group: 'MF8800', name: 'Milk Frother Compact', image_sku: null,
      colours: [['MF8800-B', 'Black'], ['MF8800-W', 'White']],
      regular: '39.99', min: '31.99', msrp: '49.99' },

    /* A FOURTH CATEGORY. On US Walmart, so the number on screen is four somewhere and three elsewhere,
       and neither number is in any source file as a literal. */
    { cat: 'Electric Kettle', series: 'Kettle',
      group: 'KT7700', name: 'Electric Kettle 1.7L', image_sku: null,
      colours: [['KT7700-S', 'Steel'], ['KT7700-B', 'Black']],
      regular: '54.99', min: '43.99', msrp: '64.99' },

    /* A FIFTH CATEGORY, AND THE ONE WITH NO REGIONAL RECORD (see REGIONAL_ABSENT). It stays in the
       universe because marketplace_skus lists it; it is reported as Data Quality; and it is kept off
       the price chart. Three outcomes, not one. */
    { cat: 'Kitchen Shears', series: 'Shears',
      group: 'KS6600', name: 'Kitchen Shears Pro', image_sku: null,
      colours: [['KS6600-R', 'Red']],
      regular: '29.99', min: '23.99', msrp: '34.99' },

    /* DIFFERS FROM 'Silicone Spatula' ONLY IN CASE. Trimmed, KEPT AS TWO, and reported for review.
       Folding these two would make one menu entry behave as two products' worth of rows, and deciding
       that two business categories are one is a data decision an operator owns. */
    { cat: 'silicone spatula', series: 'Spatula',
      group: 'SP9200', name: 'Silicone Spatula Duo', image_sku: null,
      colours: [['SP9200-M', 'Mint']],
      regular: '17.99', min: '14.99', msrp: '21.99' },

    /* NO CATEGORY AT ALL. Kept, listed, shown as Unmapped / Needs Review, counted in Data Quality —
       and NEVER renamed "Other", because a bucket somebody invented looks exactly like a decision
       somebody made. */
    { cat: '', series: '',
      group: 'XX9100', name: 'Unfiled Kitchen Gadget', image_sku: null,
      colours: [['XX9100-N', null]],
      regular: '12.99', min: '9.99', msrp: '15.99' },

    { cat: 'Silicone Spatula', series: 'Spatula', us_only: true,
      group: 'SP5020', name: 'Silicone Spatula Set', image_sku: null,
      colours: [['SP5020-B', 'Black'], ['SP5020-M', 'Mint'], ['SP5020-T', 'Teal'],
        ['SP5020-Y', 'Sunflower']],
      regular: '34.99', min: '27.99', msrp: '42.99',
      deal: '27.99', deal_start: '2026-09-01', deal_end: '2026-09-30',
      campaign: 'September Kitchen Event' }
  ];

  /* ------------------------------------------------------------------------------------------------
     THE SITES. FOUR, and the fourth one is the point.

     P1-B2 added `Kitchen Mama | US | Walmart`: the SAME country as the home site and a DIFFERENT
     marketplace, so the site identity is genuinely three-part rather than two-part-plus-a-label. It
     carries its own site_sku shape, which is what makes a mixed-up identity visible instead of merely
     possible — a page that keyed on the master sku would show one product where there are two listings.

     `exclude` is new as well. Before it, "on the home site" and "on every site" were the same flag, so
     no product could be sold abroad and not at home — and a US page that cannot possibly omit anything
     cannot demonstrate that it omits the right things.
     ------------------------------------------------------------------------------------------------ */
  var SITES = [
    { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', currency: 'USD', all: true,
      exclude: ['MF8800', 'SP9200', 'XX9100', 'KS6600'], site_sku_shape: 'COUNTRY' },
    { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart', currency: 'USD',
      only: ['SP3120', 'SP3410', 'KT7700', 'SP9200', 'XX9100', 'KS6600'], factor: 1.04,
      site_sku_shape: 'WMT' },
    { company: 'Kitchen Mama', country: 'DE', marketplace: 'Amazon', currency: 'EUR',
      only: ['CO1100', 'CO1150', 'MF8800'], factor: 0.92, site_sku_shape: 'COUNTRY' },
    { company: 'Kitchen Mama', country: 'UK', marketplace: 'Amazon', currency: 'GBP',
      only: ['CO1100', 'MF8800'], factor: 0.86, site_sku_shape: 'COUNTRY' }
  ];

  /* ------------------------------------------------------------------------------------------------
     sku_regional_details, AS A SEPARATE TABLE, WHICH IS WHY IT CAN BE ABSENT.

     Keyed on the four-part identity the live read uses: sku + company + country + marketplace
     (72_ ppwSiteKey_). A site listing with no row here is NOT a product that is not sold — it is a
     product whose regional record we do not have, and the two must not look the same. `KS6600` on US
     Walmart is deliberately absent so there is something to prove that on.
     ------------------------------------------------------------------------------------------------ */
  var REGIONAL_ABSENT = { 'KS6600|Kitchen Mama|US|Walmart': true };

  function regionalFor(group, sku, site, siteSku) {
    if (REGIONAL_ABSENT[group + '|' + site.company + '|' + site.country + '|' + site.marketplace]) {
      return null;
    }
    return {
      regional_detail_id: 'RGD-' + site.country + '-' + site.marketplace.slice(0, 3).toUpperCase()
        + '-' + sku,
      site_sku: siteSku,
      marketplace_product_id: 'MPID-' + site.country + '-' + sku,
      product_url: null,
      packaging_regulation: site.country === 'DE' ? 'VerpackG' : null,
      language: site.country === 'US' ? 'en-US' : (site.country === 'UK' ? 'en-GB' : 'de-DE')
    };
  }

  /* The site listing status, carried by the MODEL and defaulting to active. The vocabulary is the
     shipped one (00_config.gs VALID_MARKETPLACE_SKU_STATUSES_, and data-contract.js already maps the
     contract's source_status onto marketplace_skus.marketplace_sku_status).

     TWO NON-DEFAULTS EXIST ON PURPOSE, and they are the two halves of the gate. One model is INACTIVE,
     because "nothing was excluded" is not evidence that a gate works. Another is PHASING_OUT, because a
     gate that excludes everything unusual is just as wrong: a product being phased out is still on sale
     and must still appear. A gate is only demonstrated by one of each. */
  function statusFor(model) { return model.status || 'active'; }

  /* The site sku. TWO SHAPES, because two marketplaces name the same product differently and a board
     that assumed one shape would silently merge two listings into one row. */
  function siteSkuFor(sku, site) {
    return site.site_sku_shape === 'WMT' ? ('WMT-' + sku) : (sku + '-' + site.country);
  }

  /* A site price is a DIFFERENT INVENTED NUMBER, not a converted one. `factor` shapes plausible
     demonstration figures; it is not an exchange rate and nothing on the page ever converts. */
  function sitePrice(v, factor) {
    if (v === null || v === undefined) return null;
    if (!factor) return v;
    return (Math.round(Number(v) * factor * 100) / 100).toFixed(2);
  }

  function rowsFor() {
    var rows = [];
    MODELS.forEach(function (m, mi) {
      SITES.forEach(function (site) {
        /* THE MEMBERSHIP GATE OF THE FIXTURE, and it is the fixture's ONLY membership gate. A model is
           on a site because this decides so — never because it has a price, never because the currency
           matches, and never because sku_details knows about it. */
        /* `us_only` MEANS THE COUNTRY, NOT THE HOME SITE. It used to be `!site.all`, which was the
           same thing only while the US had exactly one marketplace. Adding US Walmart made the two
           readings diverge, and the old one silently withheld every US-only product from the second US
           site — a defect that looked like "Walmart does not sell spatulas". */
        if (m.us_only && site.country !== 'US') return;
        if (site.only && site.only.indexOf(m.group) < 0) return;
        if (site.exclude && site.exclude.indexOf(m.group) >= 0) return;
        var f = site.factor;
        var regular = sitePrice(m.regular, f), min = sitePrice(m.min, f);
        var msrp = sitePrice(m.msrp, f), deal = sitePrice(m.deal, f);
        var proposed = sitePrice(m.proposed, f);
        m.colours.forEach(function (c, ci) {
          var sku = c[0], colour = c[1];
          var img = m.image_sku === sku ? verifiedImage(sku) : null;
          var verified = !!img;
          var siteSku = siteSkuFor(sku, site);
          var status = statusFor(m);
          var regional = regionalFor(m.group, sku, site, siteSku);
          var missing = [];
          if (regular === null) missing.push('SOURCE_MISSING:regular_price');
          if (!m.group) missing.push('VARIANT_GROUPING_SOURCE_MISSING');
          if (regional === null) missing.push('REGIONAL_DETAILS_MISSING');
          if (!m.cat) missing.push('CATEGORY_SOURCE_MISSING');
          if (!m.series) missing.push('VARIANT_GROUPING_SOURCE_MISSING');
          /* Only the member that carries the verified mapping has an image; the others are absent
             by design, and the NODE resolves its representative from its own members. */
          if (!verified) missing.push('IMAGE_SOURCE_MISSING');
          rows.push({
            /* THE IDENTITY IS THE SITE LISTING, not the master sku. It carries the marketplace as well
               as the country, because the same product on two marketplaces of one country is two
               listings — and an identity that omitted the marketplace would merge them. */
            identity: 'MSK-' + site.country + '-' + site.marketplace.slice(0, 3).toUpperCase()
              + '-' + sku,
            master_sku: sku,
            site_sku: siteSku,
            category: m.cat || null,
            product_name: m.name,
            series: m.series || null,
            variant_group: m.group ? (m.group + '|' + mi) : null,
            variant_name: colour,
            company: site.company, country: site.country, marketplace: site.marketplace,
            currency: site.currency,
            regular_price: regular, minimum_price: min, msrp: msrp,
            official_deal_price: deal === undefined ? null : deal,
            official_deal_start: m.deal_start === undefined ? null : m.deal_start,
            official_deal_end: m.deal_end === undefined ? null : m.deal_end,
            product_image: img,
            image_identity_status: verified ? 'VERIFIED_DB_MAPPING' : 'IMAGE_SOURCE_MISSING',
            lifecycle_status: 'Running in the Market',
            /* THE SITE STATUS. data-contract.js maps this contract field onto
               marketplace_skus.marketplace_sku_status, and it is the ONLY field carrying it — the
               selector reads exactly this one, so there is nothing here that can disagree with it. */
            source_status: status,
            regional: regional,
            missing_reasons: missing,
            provenance: {
              adapter: 'PREVIEW',
              values_are: 'PREVIEW',
              /* THE TWO HALVES, KEPT APART ON EVERY ROW. */
              identity_source: F.IDENTITY_SOURCE,
              price_source: F.PRICE_SOURCE,
              connected_to_db: false,
              image_identity_verified: verified,
              sku_code_basis: 'a real sku code used by shipped code and shipped tests',
              category_basis: 'a value of sku_details.category, the shipped category column',
              image_basis: verified
                ? 'OPERATOR_ASSERTED_DB_RECORD + EXACT_REPO_FILE_EXISTS :: '
                  + C.IMAGE_POLICY.verified_mappings[sku]
                : (ci === 0 && m.image_sku === null
                  ? 'NO_VERIFIED_DB_IMAGE_MAPPING_FOR_THIS_PRODUCT'
                  : 'NO_VERIFIED_DB_IMAGE_MAPPING_FOR_THIS_SKU'),
              representative_image_sku: m.image_sku || null,
              variant_group_basis: m.group
                ? 'FIXTURE-SUPPLIED — the real schema has no variant_group column (contract GAP)'
                : 'ABSENT — rendered ungrouped, never merged',
              campaign_name: (m.campaign || null),
              site_membership_basis: 'marketplace_skus (company + country + marketplace) — the fixture'
                + ' membership gate in rowsFor(), and nothing else decides it',
              regional_basis: regional === null
                ? 'REGIONAL_DETAILS_MISSING — no sku_regional_details row for this four-part identity.'
                  + ' The listing is still real: membership did not depend on this table.'
                : 'sku_regional_details by sku + company + country + marketplace',
              category_state: m.cat ? 'PRESENT' : 'CATEGORY_SOURCE_MISSING',
              proposed_scenario_price: proposed === undefined ? null : proposed,
              proposed_is_board_owned: (proposed !== undefined && proposed !== null)
            }
          });
        });
      });
    });
    return rows;
  }

  var ALL_ROWS = rowsFor();

  /* ------------------------------------------------------------------------------------------------
     THERE IS NO F.CATEGORIES ANY MORE, AND ITS ABSENCE IS THE FIX.

     It used to be exactly this:

         F.CATEGORIES = distinct category over ALL_ROWS, across every site, computed once at load.

     which is how the menu came to offer categories the selected country does not sell: DE and UK sell
     one category each and the menu offered three, so picking one of the other two produced an empty
     category card on a site that has no such products. The list is not corrected here, it is DELETED —
     a site-derived menu that still has a cross-site list within reach has a fallback, and a fallback is
     where the next round's version of this defect will live.

     The menu now comes from PSB_SELECTORS.deriveCategoryOptions over the eligible universe of ONE site,
     and there is nowhere else to get one.
     ------------------------------------------------------------------------------------------------ */

  /* ------------------------------------------------------------------------------------------------
     THE PREVIEW ADAPTER. Same interface the Operation DB adapter will implement; makes no request.
     Filtering happens HERE, on the adapter side of the seam, because that is where P1-B1 will bound
     it — category server-side, not a client sieve over a mixed row set.
     ------------------------------------------------------------------------------------------------ */
  F.PreviewProductStrategyDataAdapter = {
    id: 'PREVIEW',
    enabled: true,

    /* THE CANONICAL UNIVERSE, UNFILTERED, handed over exactly once per render. The pipeline needs the
       whole set because eligibility is its FIRST stage: a caller given pre-filtered rows cannot tell
       whether a SKU is missing because the site does not sell it or because a sieve removed it. */
    loadCanonical: function () {
      return {
        state: 'PARTIAL_DATA',
        rows: ALL_ROWS.slice(),
        row_count: ALL_ROWS.length,
        fields: C.FIELD_NAMES.slice(),
        capped: false,
        notice: F.NOTICE,
        provenance: { adapter: 'PREVIEW', connected: false, connected_to_db: false,
          requests_made: 0, values_are: 'PREVIEW', identity_source: F.IDENTITY_SOURCE,
          price_source: F.PRICE_SOURCE, membership_authority: 'marketplace_skus', fx_applied: false,
          images_verified: ALL_ROWS.filter(function (r) {
            return r.image_identity_status === 'VERIFIED_DB_MAPPING'; }).length }
      };
    },

    /* THE CONTRACT'S load(filters), AND IT NO LONGER CONTAINS A MEMBERSHIP RULE OF ITS OWN.
       It used to be one flat sieve in which the three site dimensions were three clauses among six,
       which is how the site scope came to be applied at the same moment as the category — and a menu
       cannot be built from rows that have already been narrowed by the menu. Membership now comes from
       PSB_SELECTORS.getEligibleProductUniverse and the remaining dimensions from applyDimensionFilters,
       so this adapter and the board reach the same answer because they run the same code.

       RESOLVED AT CALL TIME, not at load time, so this file has no ordering dependency on selectors.js
       and an absent pipeline is a NAMED refusal rather than a silently unfiltered row set. */
    load: function (filters) {
      filters = filters || {};
      var SEL = global.PSB_SELECTORS;
      if (!SEL) {
        return { state: 'CONTRACT_MISMATCH', rows: [], row_count: 0, fields: C.FIELD_NAMES.slice(),
          applied_filters: filters, capped: false, notice: F.NOTICE,
          refusals: { CONTRACT_MISMATCH: 'PSB_SELECTORS is not loaded, so membership cannot be'
            + ' resolved. No rows are returned: an unfiltered set would look like an answer.' },
          provenance: { adapter: 'PREVIEW', connected: false, connected_to_db: false,
            requests_made: 0, values_are: 'PREVIEW', identity_source: F.IDENTITY_SOURCE,
            price_source: F.PRICE_SOURCE, images_verified: 0,
            image_evidence_class: 'E — OPERATOR_ASSERTED_DB_RECORD + EXACT_REPO_FILE_EXISTS' } };
      }
      var universe = SEL.getEligibleProductUniverse({
        rows: ALL_ROWS, site: filters, includeInactive: filters.includeInactive === true });
      var rows = SEL.applyDimensionFilters(universe.rows, filters);
      var verifiedCount = 0;
      rows.forEach(function (r) { if (r.image_identity_status === 'VERIFIED_DB_MAPPING') verifiedCount++; });
      return {
        state: 'PARTIAL_DATA',
        rows: rows,
        row_count: rows.length,
        fields: C.FIELD_NAMES.slice(),
        applied_filters: filters,
        capped: false,
        notice: F.NOTICE,
        eligibility: { order: universe.order, membership_authority: universe.membership_authority,
          counts: universe.counts, dataQuality: universe.dataQuality,
          regional_detail_decides_membership: universe.regional_detail_decides_membership,
          currency_decides_membership: universe.currency_decides_membership },
        refusals: {
          SOURCE_NOT_CONNECTED: 'No connection to the Operation System database was attempted.',
          SOURCE_MISSING: 'Rows carry SOURCE_MISSING where a preview value was deliberately absent.',
          PARTIAL_DATA: 'Identity is real; every price is a demonstration figure.'
        },
        provenance: {
          adapter: 'PREVIEW',
          connected: false,
          connected_to_db: false,
          requests_made: 0,
          values_are: 'PREVIEW',
          identity_source: F.IDENTITY_SOURCE,
          price_source: F.PRICE_SOURCE,
          images_verified: verifiedCount,
          image_evidence_class: 'E — OPERATOR_ASSERTED_DB_RECORD + EXACT_REPO_FILE_EXISTS'
        }
      };
    }
  };


  /* ==================================================================================================
     THE STRESS FIXTURE — A DENSITY TEST, AND IT SAYS SO ON EVERY ROW.

     P1-B2A. The visual review was done on four sites and a handful of products, which is the shape
     that makes a filter bar look fine and a chart look roomy. The layout questions this round is
     answering — does the filter area still fit, do the category chips still make sense, does the chart
     stay readable — only have answers at scale, so here is the scale:

         8 countries · 10 site identities · 12 categories · 15 series · 44 products on one chart

     IT IS GENERATED AND DETERMINISTIC. No Math.random anywhere: a fixture that differs between runs is
     not a fixture, and an assertion about "40 products" would then be an assertion about luck. Every
     price here is arithmetic on an index.

     IT IS NOT DATA. `values_are: 'PREVIEW'`, `connected_to_db: false`, and every provenance block says
     STRESS_FIXTURE_GENERATED. Nothing in it came from the Operation System database, and nothing in
     this round claims otherwise — the live universe is measured in P1-B3.
     ================================================================================================== */
  var STRESS_SITES = [
    { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', currency: 'USD' },
    { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart', currency: 'USD' },
    { company: 'Kitchen Mama', country: 'CA', marketplace: 'Amazon', currency: 'CAD' },
    { company: 'Kitchen Mama', country: 'UK', marketplace: 'Amazon', currency: 'GBP' },
    { company: 'Kitchen Mama', country: 'DE', marketplace: 'Amazon', currency: 'EUR' },
    { company: 'Kitchen Mama', country: 'FR', marketplace: 'Amazon', currency: 'EUR' },
    { company: 'Kitchen Mama', country: 'IT', marketplace: 'Amazon', currency: 'EUR' },
    { company: 'Kitchen Mama', country: 'ES', marketplace: 'Amazon', currency: 'EUR' },
    { company: 'Kitchen Mama', country: 'JP', marketplace: 'Amazon', currency: 'JPY' },
    { company: 'Kitchen Mama', country: 'JP', marketplace: 'Rakuten', currency: 'JPY' }
  ];
  var STRESS_CATEGORIES = ['Electric Can Opener', 'Manual Can Opener', 'Silicone Spatula',
    'Electric Kettle', 'Kitchen Shears', 'Milk Frother', 'Cutting Board', 'Mixing Bowl',
    'Measuring Set', 'Pepper Mill', 'Storage Container', 'Vegetable Peeler'];
  var STRESS_SERIES = ['Can Opener', 'Spatula', 'Kettle', 'Shears', 'Frother', 'Board', 'Bowl',
    'Measure', 'Mill', 'Storage', 'Peeler', 'Prep', 'Serve', 'Bake', 'Clean'];
  /* THE WIDE ONE. 44 products in a single category on a single site, each at its own price, so the
     chart has to place 44 columns and 44 labels on one axis. */
  var STRESS_WIDE_CATEGORY = 'Electric Can Opener';
  var STRESS_WIDE_COUNT = 44;

  function stressRows() {
    var rows = [];
    function push(site, cat, seriesName, idx, priceC) {
      var sku = 'ST' + String(1000 + idx);
      var siteSku = site.marketplace === 'Walmart' ? ('WMT-' + sku)
        : (site.marketplace === 'Rakuten' ? ('RKT-' + sku) : (sku + '-' + site.country));
      var regular = (priceC / 100).toFixed(2);
      rows.push({
        identity: 'STR-' + site.country + '-' + site.marketplace.slice(0, 3).toUpperCase()
          + '-' + sku,
        master_sku: sku,
        site_sku: siteSku,
        category: cat,
        product_name: cat + ' ' + (idx % 90 + 10),
        series: seriesName,
        /* A THIRD OF THEM CARRY A LONG NAME ON PURPOSE. A density test whose every label is six
           characters proves the columns fit and nothing about the text in them; a real catalogue
           has names that do not fit, and the chart has to shorten those without letting one run
           into the next. */
        variant_group: (idx % 3 === 0)
          ? (sku + ' ' + String(seriesName).replace(/\s+/g, '-')) : sku,
        variant_name: null,
        company: site.company, country: site.country, marketplace: site.marketplace,
        currency: site.currency,
        regular_price: regular,
        minimum_price: (priceC * 0.8 / 100).toFixed(2),
        msrp: (priceC * 1.2 / 100).toFixed(2),
        official_deal_price: (idx % 7 === 0) ? (priceC * 0.75 / 100).toFixed(2) : null,
        official_deal_start: (idx % 7 === 0) ? '2026-09-01' : null,
        official_deal_end: (idx % 7 === 0) ? '2026-09-30' : null,
        product_image: null,
        lifecycle_status: 'Running in the Market',
        source_status: 'active',
        regional: {
          regional_detail_id: 'RGD-ST-' + site.country + '-' + sku,
          site_sku: siteSku, marketplace_product_id: 'MPID-' + sku,
          product_url: null, packaging_regulation: null, language: null
        },
        missing_reasons: ['IMAGE_SOURCE_MISSING'],
        image_identity_status: 'IMAGE_SOURCE_MISSING',
        provenance: {
          adapter: 'PREVIEW', values_are: 'PREVIEW', connected_to_db: false,
          identity_source: 'STRESS_FIXTURE_GENERATED', price_source: 'STRESS_FIXTURE_GENERATED',
          sku_code_basis: 'GENERATED for a density test — this code exists nowhere else',
          category_basis: 'GENERATED', category_state: 'PRESENT',
          site_membership_basis: 'GENERATED stress fixture membership',
          regional_basis: 'GENERATED',
          image_basis: 'NO_VERIFIED_DB_IMAGE_MAPPING_FOR_THIS_SKU',
          representative_image_sku: null,
          variant_group_basis: 'GENERATED — one product per group, so nothing is merged',
          campaign_name: (idx % 7 === 0) ? 'Generated Event' : null,
          proposed_scenario_price: (idx % 11 === 0) ? (priceC * 0.7 / 100).toFixed(2) : null,
          proposed_is_board_owned: (idx % 11 === 0)
        }
      });
    }

    var n = 0;
    STRESS_SITES.forEach(function (site, si) {
      STRESS_CATEGORIES.forEach(function (cat, ci) {
        /* The wide category on the home site carries the 44; everywhere else three products, which is
           enough to keep every site, category and series reachable without a fixture nobody can load. */
        var isWide = (si === 0 && cat === STRESS_WIDE_CATEGORY);
        var count = isWide ? STRESS_WIDE_COUNT : 3;
        for (var k = 0; k < count; k++) {
          n++;
          var seriesName = STRESS_SERIES[(ci + k) % STRESS_SERIES.length];
          /* DISTINCT PRICES, SPREAD OVER A REAL RANGE, so 44 columns are 44 positions and the axis has
             something to compress. Arithmetic on the index — never random. */
          var priceC = 900 + ((ci * 7 + k * 5 + si * 3) % 120) * 65;
          push(site, cat, seriesName, n, priceC);
        }
      });
    });
    return rows;
  }

  var STRESS_ROWS = stressRows();
  F.STRESS_ROWS = STRESS_ROWS;
  F.STRESS_SHAPE = {
    countries: STRESS_SITES.filter(function (s, i, a) {
      return a.map(function (x) { return x.country; }).indexOf(s.country) === i; }).length,
    site_identities: STRESS_SITES.length,
    categories: STRESS_CATEGORIES.length,
    series: STRESS_SERIES.length,
    widest_chart: STRESS_WIDE_COUNT,
    rows: STRESS_ROWS.length,
    generated: true,
    is_database_data: false
  };

  /* Same interface, same refusals, same delegation to the one membership implementation. */
  F.StressProductStrategyDataAdapter = {
    id: 'STRESS',
    enabled: true,
    loadCanonical: function () {
      return {
        state: 'PARTIAL_DATA',
        rows: STRESS_ROWS.slice(),
        row_count: STRESS_ROWS.length,
        fields: C.FIELD_NAMES.slice(),
        capped: false,
        notice: 'Generated stress fixture — a density test, not data from any database',
        provenance: { adapter: 'STRESS', connected: false, connected_to_db: false,
          requests_made: 0, values_are: 'PREVIEW',
          identity_source: 'STRESS_FIXTURE_GENERATED', price_source: 'STRESS_FIXTURE_GENERATED',
          membership_authority: 'the generated fixture', fx_applied: false, images_verified: 0 }
      };
    },
    load: function (filters) {
      var SEL = global.PSB_SELECTORS;
      var u = SEL.getEligibleProductUniverse({ rows: STRESS_ROWS, site: filters || {},
        includeInactive: (filters || {}).includeInactive === true });
      var rows = SEL.applyDimensionFilters(u.rows, filters || {});
      return { state: 'PARTIAL_DATA', rows: rows, row_count: rows.length,
        fields: C.FIELD_NAMES.slice(), applied_filters: filters || {}, capped: false,
        notice: 'Generated stress fixture', refusals: {},
        provenance: { adapter: 'STRESS', connected: false, connected_to_db: false,
          requests_made: 0, values_are: 'PREVIEW', images_verified: 0 } };
    }
  };

  global.PSB_PREVIEW = F;
}(this));
