/* ==================================================================================================
   PRODUCT STRATEGY BOARD — PREVIEW FIXTURE + PreviewProductStrategyDataAdapter    P0-R3-R2
   ==================================================================================================

   EVERY PRICE IN THIS FILE IS INVENTED. No price, floor, list price, promotion or campaign date here
   came from the Kitchen Mama Operation System database. Nothing in this file reads anything.

   WHAT IS REAL, AND IT IS NOW THREE THINGS:

     THE SKU CODES        every one appears in shipped code, shipped tests, or both.
     THE CATEGORIES       Electric Can Opener / Manual Can Opener / Silicone Spatula are values of
                          sku_details.category, which is a real column (sku-details.js:2369).
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
    { cat: 'Electric Can Opener', series: 'Can Opener',
      group: 'CO0560', name: 'Classic Can Opener', image_sku: null,
      colours: [['CO0560', null]],
      regular: null, min: '15.99', msrp: '22.99' },

    /* ===================== MANUAL CAN OPENER ===================== */
    { cat: 'Manual Can Opener', series: 'Can Opener', us_only: true,
      group: 'MO5600', name: 'Manual Safety Can Opener', image_sku: 'MO5600-R',
      colours: [['MO5600-R', 'Red'], ['MO5600-B', 'Black'], ['MO5600-M', 'Mint'],
        ['MO5600-T', 'Teal']],
      regular: '19.99', min: '15.99', msrp: '24.99' },

    { cat: 'Manual Can Opener', series: 'Can Opener', us_only: true,
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

    { cat: 'Silicone Spatula', series: 'Spatula', us_only: true,
      group: 'SP5020', name: 'Silicone Spatula Set', image_sku: null,
      colours: [['SP5020-B', 'Black'], ['SP5020-M', 'Mint'], ['SP5020-T', 'Teal'],
        ['SP5020-Y', 'Sunflower']],
      regular: '34.99', min: '27.99', msrp: '42.99',
      deal: '27.99', deal_start: '2026-09-01', deal_end: '2026-09-30',
      campaign: 'September Kitchen Event' }
  ];

  /* Sites. Electric Can Opener is listed on three; the other two categories on the home site only,
     which is also a demonstration: a category with one currency still gets its own axis. */
  var SITES = [
    { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', currency: 'USD', all: true },
    { company: 'Kitchen Mama', country: 'DE', marketplace: 'Amazon', currency: 'EUR',
      only: ['CO1100', 'CO1150'], factor: 0.92 },
    { company: 'Kitchen Mama', country: 'UK', marketplace: 'Amazon', currency: 'GBP',
      only: ['CO1100'], factor: 0.86 }
  ];

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
        if (m.us_only && !site.all) return;
        if (site.only && site.only.indexOf(m.group) < 0) return;
        var f = site.factor;
        var regular = sitePrice(m.regular, f), min = sitePrice(m.min, f);
        var msrp = sitePrice(m.msrp, f), deal = sitePrice(m.deal, f);
        var proposed = sitePrice(m.proposed, f);
        m.colours.forEach(function (c, ci) {
          var sku = c[0], colour = c[1];
          var img = m.image_sku === sku ? verifiedImage(sku) : null;
          var verified = !!img;
          var missing = [];
          if (regular === null) missing.push('SOURCE_MISSING:regular_price');
          if (!m.group) missing.push('VARIANT_GROUPING_SOURCE_MISSING');
          /* Only the member that carries the verified mapping has an image; the others are absent
             by design, and the NODE resolves its representative from its own members. */
          if (!verified) missing.push('IMAGE_SOURCE_MISSING');
          rows.push({
            identity: 'MSK-' + site.country + '-' + sku,
            master_sku: sku,
            site_sku: sku + '-' + site.country,
            category: m.cat,
            product_name: m.name,
            series: m.series,
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
            source_status: 'active',
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

  F.CATEGORIES = (function () {
    var seen = {}, out = [];
    ALL_ROWS.forEach(function (r) { if (!seen[r.category]) { seen[r.category] = 1; out.push(r.category); } });
    return out.sort();
  })();

  /* ------------------------------------------------------------------------------------------------
     THE PREVIEW ADAPTER. Same interface the Operation DB adapter will implement; makes no request.
     Filtering happens HERE, on the adapter side of the seam, because that is where P1-B1 will bound
     it — category server-side, not a client sieve over a mixed row set.
     ------------------------------------------------------------------------------------------------ */
  F.PreviewProductStrategyDataAdapter = {
    id: 'PREVIEW',
    enabled: true,
    categories: F.CATEGORIES.slice(),
    load: function (filters) {
      filters = filters || {};
      var rows = ALL_ROWS.filter(function (r) {
        if (filters.category && filters.category !== 'ALL' && r.category !== filters.category) {
          return false;
        }
        if (filters.company && filters.company !== 'ALL' && r.company !== filters.company) return false;
        if (filters.country && filters.country !== 'ALL' && r.country !== filters.country) return false;
        if (filters.marketplace && filters.marketplace !== 'ALL'
          && r.marketplace !== filters.marketplace) return false;
        if (filters.currency && filters.currency !== 'ALL' && r.currency !== filters.currency) return false;
        if (filters.series && filters.series !== 'ALL' && r.series !== filters.series) return false;
        return true;
      });
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

  global.PSB_PREVIEW = F;
}(this));
