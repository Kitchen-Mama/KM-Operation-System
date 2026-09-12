/**
 * ==================================================================================================
 * THE P1-B8C REPLAY CAPTURE — THE WIRE SHAPE, AND WHERE THE LIVE ONE WILL GO
 * ==================================================================================================
 *
 * READ THIS FIRST, BECAUSE THE LABEL IS THE POINT:
 *
 *     CAPTURE_KIND = 'DETERMINISTIC'   —  THIS IS NOT LIVE DATA.
 *
 * P1-B8C §3 asks for a read-only capture of the production workspace response, taken through the
 * existing readback. IT CANNOT BE TAKEN, and the reason is structural rather than incidental:
 *
 *   · The deployed HTTP endpoint answers FEATURE_DISABLED with `dbOpened:false, tablesRead:0`,
 *     because `PRODUCT_STRATEGY_ENABLED_` is false — which §2 forbids changing. So the wire cannot
 *     produce a populated workspace at all. `_p1b7f-exec-capture-r10.js` is the live proof of that.
 *   · The Apps Script editor path — `RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()` — legitimately
 *     reaches the pure builder around the HTTP gate, and it DOES call `ppwWorkspaceBuild_` for every
 *     site. But it reports only AGGREGATES: counts, class tallies, option values, currency facets and
 *     finding codes. `p1b3SitePass_` tallies `data.normalizedRows` and then discards them, on purpose:
 *     the file's own contract says "It never reports a price, a cost, a margin, a URL, a customer".
 *
 * So the rows a renderer needs — identity, the three prices, currency, image availability, status,
 * per-row data-quality — have never left the server, and the round reports
 * STOP_EXISTING_READBACK_INSUFFICIENT with the minimum augmentation named. See §3 of
 * docs/planning/P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md.
 *
 * --------------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS INSTEAD, AND WHY IT IS SHAPED LIKE THE WIRE AND NOT LIKE A FIXTURE
 *
 * §7 permits an existing deterministic fixture to cover UI states that live data cannot reach,
 * provided the result is never claimed as live evidence. This is that — but it is deliberately NOT
 * the preview fixture, and it is deliberately NOT in the canonical (post-adapter) shape.
 *
 * IT IS THE 72_ WIRE SHAPE, FIELD FOR FIELD, so that everything downstream of the socket is the
 * production chain: the accessor's validator, the pricing adapter, the live adapter, the selectors,
 * the board. A fixture in the canonical shape would skip the two layers most likely to be wrong —
 * which is exactly how P1-B7E's `RESPONSE_ACTION_MISMATCH` survived two rounds of green suites.
 *
 * AND IT IS THE DROP-IN POINT. When the augmented readback runs, its de-identified rows replace
 * `WORKSPACES` and `CAPTURE_KIND` becomes 'LIVE_READBACK'. Nothing else changes — not the replay
 * harness, not the suite, not the browser acceptance page. That is the deliverable this round can
 * honestly finish: the machine that consumes a live capture, proven on data that says what it is.
 *
 * NOT_A_FIXTURE_FALLBACK. Nothing in production reads this file; the suite asserts the load count is
 * zero, the same way P1-B8A asserted it for the prototype token shim.
 * ==================================================================================================
 */
'use strict';

var P1B8C_CAPTURE = (function () {
  var C = {};

  /** Flip to 'LIVE_READBACK' only when this file's rows came off the augmented readback. */
  C.CAPTURE_KIND = 'DETERMINISTIC';
  C.IS_LIVE = false;
  C.NOT_A_FIXTURE = false;           // it IS a stand-in, and says so rather than implying otherwise
  C.NOT_LOADED_BY_PRODUCTION = true;
  C.READ_ONLY_CAPTURE = true;
  /* The substitute every row with an image carries. It identifies nothing and is the same TYPE the
     server sends — a string.
     P1-B8C-R3 REMOVED ITS EXTENSION, AND THAT IS THE POINT OF THE FIELD. It used to be
     `_p1b8c-swatch.svg`, chosen when "not an absolute URL" was the whole of the unverified test. R3
     made the shared policy the authority, and under it a relative path that names an image file IS a
     drawable reference — which is the defect R3 exists to fix, and it would have made this
     de-identified capture claim a photograph it does not have, then 404 against the page. A redaction
     marker should look like a redaction marker: no extension, so the policy calls it what it is
     (OPAQUE_REFERENCE), which is the same shape `_p1b8c-r2-live-derived.js` already uses. */
  C.IMAGE_PLACEHOLDER = 'REDACTED_IMAGE_REFERENCE';
  C.IMAGE_CONTENT_IS_A_PLACEHOLDER = true;
  C.CONTRACT_VERSION = 2;            // the workspace schema version the accessor expects
  C.UNIVERSE_CONTRACT_VERSION = 1;

  /**
   * THE SITE MATRIX — §7's coverage, stated as data so the suite can count it rather than trust it.
   * Two companies, three countries, four marketplaces, and one site that is deliberately EMPTY.
   */
  C.SITES = [
    { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', currency: 'USD', rows: 26 },
    { company: 'Kitchen Mama', country: 'US', marketplace: 'Shopify', currency: 'USD', rows: 14 },
    { company: 'Kitchen Mama', country: 'DE', marketplace: 'Amazon', currency: 'EUR', rows: 11 },
    { company: 'Kitchen Mama', country: 'CA', marketplace: 'Amazon', currency: 'CAD', rows: 44 },
    { company: 'Cookware Co', country: 'US', marketplace: 'Target', currency: 'USD', rows: 9 },
    { company: 'Cookware Co', country: 'UK', marketplace: 'Amazon', currency: 'GBP', rows: 0 }
  ];

  /* Four categories, each with its own series ladder. Names are ordinary product vocabulary and
     identify nothing: §4 permits SKU / Series / Category / Company / Country / Marketplace because
     they are what the page exists to display. */
  C.CATEGORIES = ['Electric Can Opener', 'Silicone Spatula', 'Kitchen Shears', 'Jar Opener'];
  var SERIES_BY_CAT = {
    'Electric Can Opener': ['Can Opener', 'Can Opener Pro', 'Can Opener Mini'],
    'Silicone Spatula': ['Spatula', 'Spatula Heat'],
    'Kitchen Shears': ['Shears', 'Shears Heavy'],
    'Jar Opener': ['Jar Twist']
  };

  function siteKey(s) { return s.company + '|' + s.country + '|' + s.marketplace; }
  C.siteKey = siteKey;

  /**
   * A DETERMINISTIC PSEUDO-RANDOM STREAM. No Math.random anywhere: a capture that differs between
   * runs cannot be compared to the live one it is standing in for, and a screenshot taken from it
   * could not be re-taken.
   */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /**
   * ONE ROW, EXACTLY AS 72_ EMITS IT (`ppwNormalizedRow_`, lines 685-730).
   *
   * Every field 72_ publishes is present, including the ones this page never reads, because a
   * response that is missing a field the validator tolerates today is a response that stops being
   * representative the day the validator stops tolerating it.
   *
   * THE DE-IDENTIFIED FIELDS ARE NULL RATHER THAN ABSENT. `regional.product_url`,
   * `regional.marketplace_product_id` and `product_image`'s URL are the values §4 removes; a live
   * capture will carry them as null too, so the shape a test sees is the shape a test will keep
   * seeing.
   */
  function row(i, site, r) {
    var cat = C.CATEGORIES[i % C.CATEGORIES.length];
    var sers = SERIES_BY_CAT[cat];
    var series = sers[i % sers.length];
    var id = site.marketplace.slice(0, 3).toUpperCase() + '-' + site.country + '-' + (1000 + i);
    var base = 1499 + Math.floor(r() * 3600);          // cents, 14.99 .. 50.98
    var regular = Math.round(base / 100 * 100) / 100;

    /* THE SIX CASES §7 ASKS FOR, spread deterministically rather than sprinkled: every eighth row
       has no image, every seventh no MSRP, every ninth no floor price, every eleventh no price at
       all, every sixth a live promotion, every thirteenth an unresolvable identity. */
    var noImage = i % 8 === 3;
    var noMsrp = i % 7 === 5;
    var noFloor = i % 9 === 4;
    var noPrice = i % 11 === 7;
    var promo = i % 6 === 2;
    var ambiguous = i % 13 === 11;
    var inactive = i % 17 === 9;

    var missing = [];
    if (noImage) missing.push('IMAGE_SOURCE_MISSING');
    if (noPrice) missing.push('PRICE_MISSING');
    if (ambiguous) missing.push('REGIONAL_MATCH_AMBIGUOUS');

    var findings = [];
    if (ambiguous) {
      findings.push({ code: 'REGIONAL_MATCH_AMBIGUOUS', severity: 'stop',
        subject: 'MSKU:' + id, detail: 'more than one regional row matches this site sku' });
    }

    return {
      identity: 'MSKU:' + id,
      marketplace_sku_id: id,
      master_sku: 'KM' + (1000 + (i % 240)),
      site_sku: 'B0' + (100000 + i),
      product_name: series + ' ' + (i % 9 === 0 ? 'Compact' : (i % 3 === 0 ? 'Pro' : 'Classic')),
      category: cat,
      series: series,
      variant_group: series + '|' + (i % 3),
      variant_name: null,
      company: site.company,
      country: site.country,
      marketplace: site.marketplace,
      marketplace_sku_status: inactive ? 'phasing_out' : 'active',
      lifecycle: inactive ? 'Phasing Out' : 'Running in the Market',
      currency: site.currency,
      regular_price: noPrice ? null : regular,
      minimum_price: (noPrice || noFloor) ? null : Math.round((regular * 0.78) * 100) / 100,
      msrp: (noPrice || noMsrp) ? null : Math.round((regular * 1.22) * 100) / 100,
      /* THE IMAGE IS A STRING OR NULL, BECAUSE THAT IS WHAT THE SERVER SENDS.
         `72_` line 648: `var image = master ? (ppwStr_(master.image_url) || null) : null;` — a URL
         or null, and `product_image: image`. The first version of this capture invented an object
         `{available, source, url}`, which is what "image availability" sounds like it should be. The
         pricing adapter does `str(row.product_image)`, so that object would have become the string
         "[object Object]" and been treated as an image whose address was that. A capture that is not
         the wire shape tests a contract nobody ships, which is the one thing this file exists not to
         do.

         AND THIS IS WHERE §4 AND §9 GENUINELY COLLIDE. §4 says remove every URL; the image IS a URL.
         A capture with `null` there renders no photograph, so none of §9's image rules — no black
         centre dot, the picture sitting on its price, the picture near its label — can be exercised
         by any de-identified replay, live or not.

         AND THE COLLISION IS ABSOLUTE, NOT A MATTER OF DEGREE. `A.imageStateOf` calls a row
         VERIFIED_DB_MAPPING only when `product_image` is an ABSOLUTE http(s) URL, and the renderer
         draws a photograph only for that state — an unproven picture is not shown, which is one of
         the oldest rules on this page. So NO DE-IDENTIFIED CAPTURE CAN EVER RENDER A PRODUCT
         PHOTOGRAPH, live or deterministic. That is recorded as an evidence gap, not worked around.

         What the placeholder buys is the OTHER image state. `null` gives IMAGE_SOURCE_MISSING; a
         non-absolute string gives UNVERIFIED_SOURCE_REFERENCE. Both are states a real site reaches —
         a blank cell and a cell holding something that is not a fetchable address — and carrying
         both means the fallback marker, its code plate and its placement are exercised for two
         different reasons rather than one. The photograph path stays unexercised and is reported as
         such. */
      product_image: noImage ? null : C.IMAGE_PLACEHOLDER,
      regional: ambiguous ? null : {
        regional_detail_id: null,
        site_sku: 'B0' + (100000 + i),
        marketplace_product_id: null,
        product_url: null,
        packaging_regulation: null,
        language: site.country === 'DE' ? 'de-DE' : 'en-' + site.country
      },
      campaigns: promo && !noPrice ? [{
        campaign_id: null, name: 'Seasonal', status: 'active', line_status: 'active',
        deal_price: Math.round((regular * 0.85) * 100) / 100,
        start_date: '2026-09-01', end_date: '2026-09-30'
      }] : [],
      analysable: !noPrice && !ambiguous,
      source_status: [],
      missing_reasons: missing,
      findings: findings,
      provenance: {
        membership: 'marketplace_skus (company + country + marketplace)',
        master: 'sku_details by sku',
        regional: ambiguous ? null : 'sku_regional_details by sku + company + country + marketplace',
        pricing: noPrice ? null : 'pricing_list by marketplace_sku_id',
        campaigns: 'campaign_sku_lines by marketplace_sku_id -> campaigns by campaign_id',
        currency_authority: 'pricing_list.currency'
      }
    };
  }

  function rowsFor(site) {
    var r = rng(site.country.charCodeAt(0) * 7919 + site.marketplace.length * 104729 + site.rows);
    var out = [];
    for (var i = 0; i < site.rows; i++) out.push(row(i, site, r));
    return out;
  }

  /** The filterOptions block 72_ publishes, with the counts the board's menus read. */
  function filterOptions(rows) {
    function opts(key) {
      var seen = {};
      rows.forEach(function (x) {
        var v = x[key];
        if (v === null || v === undefined || v === '') return;
        if (!seen[v]) seen[v] = { value: v, siteSkuCount: 0, analysableSiteSkuCount: 0 };
        seen[v].siteSkuCount++;
        if (x.analysable) seen[v].analysableSiteSkuCount++;
      });
      return Object.keys(seen).sort().map(function (k) { return seen[k]; });
    }
    return { categories: opts('category'), series: opts('series') };
  }

  /** The workspace envelope for one site, exactly as the accessor will receive it off the wire. */
  C.workspaceEnvelope = function (site) {
    var rows = rowsFor(site);
    var analysable = rows.filter(function (x) { return x.analysable; }).length;
    var regionalMissing = rows.filter(function (x) { return x.regional === null; }).length;
    var pricingMissing = rows.filter(function (x) { return x.regular_price === null; }).length;
    var findings = [];
    rows.forEach(function (x) { x.findings.forEach(function (f) { findings.push(f); }); });
    var state = rows.length === 0 ? 'SOURCE_EMPTY' : 'READY';
    return {
      success: true,
      data: {
        sourceState: state,
        scope: { company: site.company, country: site.country, marketplace: site.marketplace },
        filtersApplied: { category: null, series: null, status: ['active', 'phasing_out'] },
        normalizedRows: rows,
        counts: {
          siteSkuCount: rows.length,
          analysableSiteSkuCount: analysable,
          regionalMissingCount: regionalMissing,
          pricingMissingCount: pricingMissing
        },
        filterOptions: filterOptions(rows),
        pagination: { total: rows.length, limit: 1000, nextCursor: null },
        membership: {
          identity_authority: 'marketplace_skus (company + country + marketplace)',
          in_scope_before_status_filter: rows.length,
          excluded_by_status: 0,
          status_distribution: { active: rows.length, phasing_out: 0 }
        },
        analysis_permitted: state === 'READY',
        findings: findings,
        refusals: [],
        schema: {
          contract_version: C.CONTRACT_VERSION,
          action: 'productPricing.workspace.get',
          build: 'P1B8C-REPLAY',
          read_at: '2026-09-12T00:00:00.000Z',
          read_at_is: 'WHEN_THE_SERVER_READ_THE_TABLES',
          source_modified_at: null,
          table: null
        }
      },
      meta: {
        apiVersion: '1', source: 'workspace', workspace: 'productPricing',
        build: 'P1B8C-REPLAY', read_only: true, db_writes: 0, cached: false,
        tablesRead: 4, dbOpened: true, refused: false,
        action: 'productPricing.workspace.get'
      },
      errors: []
    };
  };

  /** The site-universe envelope, built from the SAME site list the workspaces are built from. */
  C.universeEnvelope = function () {
    var companies = [], byCompany = {}, byCountry = {};
    var sites = C.SITES.map(function (s) {
      if (companies.indexOf(s.company) < 0) companies.push(s.company);
      var ck = s.company;
      byCompany[ck] = byCompany[ck] || [];
      if (byCompany[ck].indexOf(s.country) < 0) byCompany[ck].push(s.country);
      var mk = s.company + '|' + s.country;
      byCountry[mk] = byCountry[mk] || [];
      if (byCountry[mk].indexOf(s.marketplace) < 0) byCountry[mk].push(s.marketplace);
      return {
        company: s.company, country: s.country, marketplace: s.marketplace,
        marketplace_sku_count: s.rows, selectable: s.rows > 0,
        statuses: { active: s.rows, phasing_out: 0 }
      };
    });
    return {
      success: true,
      data: {
        sourceState: 'READY',
        sites: sites,
        site_count: sites.length,
        hierarchy: { companies: companies.sort(), countries_by_company: byCompany,
          marketplaces_by_country: byCountry },
        identity_authority: 'marketplace_skus (company + country + marketplace)',
        identity_normalization: 'trim and case-fold for comparison; the RAW value is what is published',
        excluded: { blank_company_rows: 0, blank_country_rows: 0, blank_marketplace_rows: 0,
          blank_identity_rows: 0, blank_marketplace_sku_id_rows: 0, unknown_status_rows: 0 },
        findings: [],
        refusals: [],
        completeness: { rows_examined: 104, capped: false, cap: 50000, is_whole_universe: true },
        schema: { contract_version: C.UNIVERSE_CONTRACT_VERSION,
          action: 'productPricing.siteUniverse.get', build: 'P1B8C-REPLAY',
          read_at: '2026-09-12T00:00:00.000Z', table: null }
      },
      meta: {
        apiVersion: '1', source: 'workspace', workspace: 'productPricing',
        build: 'P1B8C-REPLAY', read_only: true, db_writes: 0, cached: false,
        tablesRead: 1, dbOpened: true, refused: false,
        action: 'productPricing.siteUniverse.get'
      },
      errors: []
    };
  };

  /** Every workspace, keyed by site — the shape the augmented readback will fill. */
  C.workspaces = function () {
    var out = {};
    C.SITES.forEach(function (s) { out[siteKey(s)] = C.workspaceEnvelope(s); });
    return out;
  };

  /**
   * THE FINGERPRINT. A stable digest of the capture's content, so a screenshot, a suite run and a
   * report can all name the same bytes. Not a cryptographic hash: this is for identity, not secrecy.
   */
  C.fingerprint = function (value) {
    var s = JSON.stringify(value === undefined ? { u: C.universeEnvelope(), w: C.workspaces() } : value);
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      h1 = ((h1 ^ s.charCodeAt(i)) >>> 0) * 16777619 >>> 0;
      h2 = ((h2 + s.charCodeAt(i) * (i % 31 + 1)) >>> 0) * 2246822519 >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  };

  /**
   * THE FIELDS §4 REMOVES, as a list the suite runs rather than a paragraph it trusts. Any capture —
   * this one or the live one — is walked for these keys, and a non-null value is a failure.
   */
  C.MUST_BE_ABSENT_OR_NULL = ['product_url', 'regional_detail_id', 'marketplace_product_id',
    'spreadsheet_id', 'spreadsheetId', 'script_id', 'scriptId', 'deployment_id', 'deploymentId',
    'endpoint', 'url', 'token', 'email', 'actor', 'requestId', 'request_url', 'sheet_name',
    'sheetName', 'caller_probe'];

  return C;
}());

if (typeof module !== 'undefined' && module.exports) { module.exports = P1B8C_CAPTURE; }
if (typeof window !== 'undefined') { window.P1B8C_CAPTURE = P1B8C_CAPTURE; }
