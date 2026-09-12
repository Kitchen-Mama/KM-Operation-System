/**
 * ================================================================================================================
 * KM · PRODUCT PRICING — THE ONE PRODUCTION ADAPTER   (PRODUCT-STRATEGY-P1-B3 §6)
 * ================================================================================================================
 *
 * `productPricing.workspace.get` answers in the LIVE schema's shape. The Product Strategy Board's selectors
 * read a different shape, inherited from the preview fixture. Something has to translate, and §6 is explicit
 * about what that something must be: ONE adapter, not one conversion per page.
 *
 * WHY ONE, AND WHY IT MATTERS MORE THAN IT SOUNDS. Six fields differ. If each page converts them itself,
 * then a page that forgets `image_identity_status` renders a broken <img>, a page that forgets the
 * `source_status` collision marks every row "not recognised", and a page that maps `campaigns[]` its own way
 * shows a different promotion from the page beside it. Each of those is a bug you can only find by opening
 * two pages and comparing them — which is to say, one nobody finds. A single adapter makes all six a
 * property of the system rather than of whoever wrote the newest page.
 *
 * ------------------------------------------------------------------------------------------------------------
 * THE SIX SHAPE GAPS THIS FILE CLOSES, AND WHAT EACH ONE ACTUALLY WAS
 *
 * 1. `source_status` IS ONE NAME FOR TWO THINGS. The fixture's `source_status` is the site status STRING
 *    (`active` / `phasing_out` / …). The live response uses the same name for an ARRAY of diagnostic codes
 *    and carries the status under `marketplace_sku_status`. Feed the live shape to the selectors unchanged
 *    and `statusStateOf` answers SITE_STATUS_SHAPE_UNEXPECTED for every row — which reads to an operator as
 *    "the data is broken" when the data is fine and the FIELD NAME collided. So: `source_status` becomes the
 *    status value, and the codes keep their own name. Nothing is dropped; one of them is renamed.
 *
 * 2. PROMOTION IS A JOIN, NOT A COLUMN. The fixture has `official_deal_price/start/end`. Live has
 *    `campaigns[]` — every campaign line that touches this site SKU, in scope, with dates. The *currently
 *    effective* one has to be DERIVED, the dates have to survive, and when two campaigns are effective at
 *    once nothing is picked: that is ambiguity, and picking the first would be a coin toss reported as a
 *    fact. Evidence is kept either way.
 *
 * 3. VARIANT GROUPING HAS AN AUTHORITY AND IT IS `series`. There is no `variant_group` column in the live
 *    schema; §28.4 measured that. `series` is the only product-family column the schema can prove.
 *
 * 4. `variant_name` IS NULL IN LIVE DATA AND STAYS NULL. No colour is invented from a SKU suffix, a product
 *    name or a series label. The grouping falls back to the master SKU — which is what the selectors already
 *    do for an ungrouped row — and the absence is reported as Data Quality rather than filled in.
 *
 * 5. AN IMAGE HAS THREE STATES, NOT TWO. "No image" and "a value that will not load" are different facts
 *    with different fixes, and the selectors only render on `VERIFIED_DB_MAPPING`. A bare filename or a
 *    Drive id in `image_url` is not a URL a browser can fetch; calling it verified paints a broken image
 *    where the marker plate should be.
 *
 * 6. IDENTITY IS `MSKU:<marketplace_sku_id>`. The fixture's `MSK-<country>-<marketplace>-<sku>` is a string
 *    composed from three attributes, so it changes when a listing moves marketplace and collides whenever
 *    two companies share one. It must never reach production, and this file refuses to emit it.
 *
 * ------------------------------------------------------------------------------------------------------------
 * PURE. No clock, no `Date.now()`, no storage, no transport, no DOM. `asOf` is a PARAMETER: the effective
 * promotion depends on the date, so the date is an input and the same response plus the same date gives the
 * same rows every time. A clock read in here would make a campaign that expired at midnight into a test
 * that fails once a day, and the argument is exactly the one the chart layout engine makes about a measured
 * box.
 *
 * NO FIXTURE FALLBACK. Ever. There is no branch in this file that produces a row from anything but the
 * response it was handed. A read that failed is a state to display, not a gap to fill with demo data.
 * ================================================================================================================
 */
(function (root) {
  'use strict';

  var A = {};

  A.CONTRACT_ID = 'KM_PRODUCT_PRICING_ADAPTER_V1';
  // The response shape this adapter understands. 72_ publishes the same number in
  // `data.schema.contract_version`; a mismatch is reported, never guessed around.
  A.EXPECTED_SCHEMA_CONTRACT_VERSION = 2;

  A.SOURCE_STATES = ['READY', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY',
    'SOURCE_NOT_CONNECTED'];
  // The one state a server answer can never carry, because a field that arrived proves a server answered.
  A.CLIENT_ONLY_SOURCE_STATE = 'SOURCE_NOT_CONNECTED';

  A.IMAGE_STATES = ['VERIFIED_DB_MAPPING', 'UNVERIFIED_SOURCE_REFERENCE', 'IMAGE_SOURCE_MISSING'];

  // A campaign counts as live only from a status the campaign table actually uses. `paused` and `ended`
  // exist and are not promotions; an unknown value is reported rather than assumed either way.
  A.CAMPAIGN_LIVE_STATUSES = ['active', 'running', 'live'];
  A.CAMPAIGN_DEAD_STATUSES = ['paused', 'ended', 'cancelled', 'draft', 'expired'];

  /* THE ONE IMAGE AUTHORITY, REACHED THE SAME WAY IN A BROWSER AND IN NODE. In the browser
     sku-overrides.js's policy file is loaded first and publishes the global; under Node the module is
     required. Never re-implemented here — a copy of a rule is a second rule that has not drifted YET. */
  function imagePolicy() {
    if (root.KM_IMAGE_REFERENCE_POLICY) return root.KM_IMAGE_REFERENCE_POLICY;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try { return require('../utils/km-image-reference-policy.js'); } catch (e) { return null; }
    }
    return null;
  }

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function lower(v) { return str(v).toLowerCase(); }
  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isObj(v) { return !!v && typeof v === 'object' && !isArr(v); }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /**
   * An ISO calendar day, or null. Deliberately strict: the selectors compare these as STRINGS
   * (`start <= today && today <= end`), which is correct for `YYYY-MM-DD` and silently wrong for anything
   * else. `1/3/2026` compares as less than `2026-01-01`, so a loose parse here would make a finished
   * campaign look live. A value that is not an ISO day is reported, not coerced.
   */
  function isoDay(v) {
    var s = str(v);
    if (s === '') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // A Date or a datetime string is accepted only when its ISO day is unambiguous.
    if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);
    return null;
  }

  A.isoDay = isoDay;

  /**
   * §6.5 — WHICH OF THE THREE IMAGE STATES THIS ROW IS IN.
   *
   * `VERIFIED_DB_MAPPING` means the identity link came from the database: the URL was on that SKU's own
   * `sku_details` row, and it is an absolute http(s) URL a browser can fetch. It does NOT claim anybody
   * looked at the picture — which is why the state is named after the mapping and not after the image.
   */
  /* P1-B8C-R3 — THE CANONICAL POLICY, NOT A SECOND OPINION ABOUT THE SAME COLUMN.
     This used to read `/^https?:\/\//` and decide for itself. SKU Details, resolving the very same
     `sku_details.image_url`, decided differently — it renders a repo-relative path, because a browser
     resolves one against the page — and P1-B8C-R2 measured the result on production data: sixty live
     rows, VERIFIED_DB_MAPPING reached ZERO times, every product a fallback marker, while the same rows
     show their photograph on SKU Details. The board now asks what that page asks.
     ONE CALLER-VISIBLE CONSEQUENCE, DELIBERATE: an absolute url on an UNAPPROVED host is no longer
     VERIFIED_DB_MAPPING. `https://` proves a scheme, not a mapping the operator sanctioned. */
  A.imageStateOf = function (row) {
    var v = str(row && row.product_image);
    if (v === '') return 'IMAGE_SOURCE_MISSING';
    var P = imagePolicy();
    // FAIL CLOSED. No policy means no established mapping; it must never mean "fall back to a regex".
    if (!P) return 'UNVERIFIED_SOURCE_REFERENCE';
    if (!P.classify(v).accepted) return 'UNVERIFIED_SOURCE_REFERENCE';
    // No master row means no row the URL could have come from, so the mapping is not established.
    var miss = (row && row.missing_reasons) || [];
    if (miss.indexOf('MASTER_SKU_RECORD_MISSING') !== -1) return 'UNVERIFIED_SOURCE_REFERENCE';
    return 'VERIFIED_DB_MAPPING';
  };

  /* The renderable address for a row whose mapping IS established — the policy's own output, so the
     http:// -> https:// upgrade reaches the board instead of stopping at SKU Details. */
  A.imageUrlOf = function (row) {
    if (A.imageStateOf(row) !== 'VERIFIED_DB_MAPPING') return null;
    var P = imagePolicy();
    return (P && P.classify(str(row && row.product_image)).url) || null;
  };

  /**
   * §6.2 — THE CURRENTLY EFFECTIVE PROMOTION, OR NONE, AND NEVER A GUESS.
   *
   * A campaign line is effective when its campaign status is live, its dates bracket `asOf`, and it has a
   * promo price. Everything that fails is kept as evidence with the reason, because "why is there no deal
   * showing" is a question an operator asks about a campaign they can see in the sheet.
   *
   * TWO EFFECTIVE CAMPAIGNS IS AMBIGUITY, NOT A TIE-BREAK. No rule in the contract ranks them — not the
   * lower price, not the later start, not the sheet order — so none is applied and the row reports
   * AMBIGUOUS_EFFECTIVE_PROMOTION with both. A promotion chosen by a rule nobody agreed is a number an
   * operator cannot reproduce.
   */
  A.effectivePromotion = function (campaigns, asOf) {
    var day = isoDay(asOf);
    var out = { effective: null, candidates: [], rejected: [], ambiguous: false, asOf: day,
      undated: 0, unknown_status: 0 };
    if (!isArr(campaigns) || !campaigns.length) return out;
    if (day === null) {
      // WITHOUT A DATE THERE IS NO "CURRENTLY". The campaigns are passed through as evidence and nothing
      // is declared effective — silently treating "no date" as "today" would be a clock in a pure function.
      out.rejected = campaigns.map(function (c) {
        return { campaign_id: str(c.campaign_id) || null, reason: 'NO_AS_OF_DATE_SUPPLIED' };
      });
      return out;
    }
    campaigns.forEach(function (c) {
      var id = str(c.campaign_id) || null;
      var st = lower(c.status);
      var price = num(c.promo_price);
      var s = isoDay(c.start_date), e = isoDay(c.end_date);
      function reject(reason, extra) {
        var r = { campaign_id: id, reason: reason, status: str(c.status) || null,
          start_date: s, end_date: e, promo_price: price };
        if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k]; } }
        out.rejected.push(r);
      }
      if (A.CAMPAIGN_DEAD_STATUSES.indexOf(st) !== -1) { reject('CAMPAIGN_NOT_LIVE'); return; }
      if (A.CAMPAIGN_LIVE_STATUSES.indexOf(st) === -1) {
        // AN UNKNOWN STATUS IS NOT A LIVE ONE. Counted so the vocabulary drift is visible rather than
        // absorbed as "no promotion".
        out.unknown_status++;
        reject('CAMPAIGN_STATUS_NOT_RECOGNISED');
        return;
      }
      if (s === null || e === null) {
        out.undated++;
        reject('CAMPAIGN_PERIOD_NOT_AN_ISO_DAY',
          { raw_start: str(c.start_date) || null, raw_end: str(c.end_date) || null });
        return;
      }
      if (price === null) { reject('NO_PROMO_PRICE_ON_THE_LINE'); return; }
      if (day < s) { reject('CAMPAIGN_HAS_NOT_STARTED'); return; }
      if (day > e) { reject('CAMPAIGN_HAS_ENDED'); return; }
      out.candidates.push({ campaign_id: id, campaign_name: str(c.campaign_name) || null,
        promo_price: price, start_date: s, end_date: e,
        discount_percent: num(c.discount_percent),
        regular_price_snapshot: num(c.regular_price_snapshot),
        line_status: str(c.line_status) || null, source: str(c.source) || null });
    });
    if (out.candidates.length === 1) { out.effective = out.candidates[0]; }
    else if (out.candidates.length > 1) { out.ambiguous = true; }
    return out;
  };

  /**
   * ONE live row -> ONE canonical row in the shape the selectors read.
   *
   * Every live field is carried through under its own name as well, so nothing is lost by translating and
   * a later page does not have to re-fetch to see what the server actually said.
   */
  A.adaptRow = function (live, asOf) {
    var dq = [];
    var codes = isArr(live.source_status) ? live.source_status.slice() : [];

    // ---- 1. the source_status collision --------------------------------------------------------
    var siteStatus = str(live.marketplace_sku_status) || null;
    if (siteStatus === null) dq.push('SITE_STATUS_MISSING');

    // ---- 6. identity -------------------------------------------------------------------------
    var id = str(live.marketplace_sku_id);
    var identity = str(live.identity) || (id !== '' ? 'MSKU:' + id : '');
    if (identity === '') dq.push('SITE_SKU_WITHOUT_IDENTITY');

    // ---- 3 + 4. grouping and the variant name -------------------------------------------------
    var series = str(live.series) || null;
    var variantGroup = series;      // the ONLY authority the live schema can prove
    if (variantGroup === null) dq.push('VARIANT_GROUPING_SOURCE_MISSING');
    // NULL, NOT A GUESS. §6.4 — no colour is composed from a sku suffix, a product name or a series label.
    var variantName = null;
    if (str(live.variant_name) !== '') {
      // If production ever grows an authoritative column, it is used verbatim and the gap closes itself.
      variantName = str(live.variant_name);
    } else {
      dq.push('VARIANT_NAME_SOURCE_MISSING');
    }

    // ---- 5. the image ------------------------------------------------------------------------
    var imageState = A.imageStateOf(live);
    if (imageState !== 'VERIFIED_DB_MAPPING') dq.push(imageState);

    // ---- 2. the promotion -------------------------------------------------------------------
    var promo = A.effectivePromotion(live.campaigns, asOf);
    if (promo.ambiguous) dq.push('AMBIGUOUS_EFFECTIVE_PROMOTION');

    var row = {
      // ---- identity ----
      identity: identity,
      marketplace_sku_id: id || null,
      master_sku: str(live.master_sku) || null,
      site_sku: str(live.site_sku) || null,
      product_name: str(live.product_name) || null,

      // ---- taxonomy ----
      category: str(live.category) || null,
      series: series,
      variant_group: variantGroup,
      variant_name: variantName,

      // ---- site ----
      company: str(live.company) || null,
      country: str(live.country) || null,
      marketplace: str(live.marketplace) || null,

      // ---- THE RENAMED FIELD. One value, and the array keeps its own name below. ----
      source_status: siteStatus,
      marketplace_sku_status: siteStatus,
      source_status_codes: codes,
      lifecycle_status: str(live.lifecycle) || null,

      // ---- prices, verbatim. `msrp` IS the list price — one band, two words in its name. ----
      currency: str(live.currency) || null,
      regular_price: live.regular_price === undefined ? null : live.regular_price,
      minimum_price: live.minimum_price === undefined ? null : live.minimum_price,
      msrp: live.msrp === undefined ? null : live.msrp,

      // ---- the derived promotion, in the three fields the selectors read ----
      official_deal_price: promo.effective ? promo.effective.promo_price : null,
      official_deal_start: promo.effective ? promo.effective.start_date : null,
      official_deal_end: promo.effective ? promo.effective.end_date : null,

      /* ---- the image, and why ----
         P1-B8C-R3: when the mapping IS established this carries the address the POLICY resolved, not
         the raw cell. The only difference the policy can make to an accepted value is the http:// ->
         https:// mixed-content upgrade, and psb-selectors puts this field straight into `<img src>` —
         so carrying the raw cell here is what kept that upgrade stranded on SKU Details. A value that
         was NOT accepted travels unchanged, because `image_identity_status` already refuses it and
         the original is what an operator needs to see in order to fix the row. */
      product_image: (imageState === 'VERIFIED_DB_MAPPING'
        ? A.imageUrlOf(live)
        : (str(live.product_image) || null)),
      image_identity_status: imageState,

      // ---- regional detail, passed through unchanged ----
      regional: live.regional === undefined ? null : live.regional,

      // ---- what the server said, kept ----
      analysable: live.analysable === true,
      missing_reasons: (live.missing_reasons || []).slice(),
      findings: (live.findings || []).slice(),
      campaigns: isArr(live.campaigns) ? live.campaigns.slice() : [],

      data_quality: dq,
      provenance: {
        adapter: A.CONTRACT_ID,
        adapted_from: 'productPricing.workspace.get',
        // THERE IS NO PROPOSED PRICE IN THE LIVE SCHEMA, and this says so rather than leaving the
        // selectors to read `undefined` and draw a band at zero.
        proposed_scenario_price: null,
        proposed_scenario_price_source: null,
        variant_group_source: variantGroup === null ? null : 'sku_details.series',
        variant_name_source: variantName === null ? null : 'live column',
        image_source: str(live.product_image) === '' ? null : 'sku_details.image_url (master row)',
        image_state: imageState,
        // The verdict in the policy's own vocabulary, so "why is there no picture" is answerable
        // from the row rather than by re-running the classifier.
        image_reference_kind: (function () {
          var P = imagePolicy();
          return P ? P.classify(str(live.product_image)).kind : 'IMAGE_POLICY_NOT_LOADED';
        }()),
        image_reference_reason: (function () {
          var P = imagePolicy();
          return P ? P.classify(str(live.product_image)).reason : 'IMAGE_POLICY_NOT_LOADED';
        }()),
        promotion_source: 'campaigns[] + campaign_sku_lines, resolved against asOf',
        promotion_as_of: promo.asOf,
        promotion_candidates: promo.candidates,
        promotion_rejected: promo.rejected,
        promotion_ambiguous: promo.ambiguous,
        server_provenance: live.provenance === undefined ? null : live.provenance,
        fixture_fallback: false
      }
    };
    return row;
  };

  /**
   * ONE response -> the canonical row set plus the state, the menus and the ledger.
   *
   * `response` is the ENVELOPE from the accessor (`{success, data, meta, errors}`) or an accessor refusal.
   * Nothing here throws on a shape it does not recognise: an unreadable answer is a STATE, and a thrown
   * exception in an adapter becomes a blank page with a console message nobody sees.
   */
  A.adapt = function (response, opts) {
    opts = isObj(opts) ? opts : {};
    var asOf = isoDay(opts.asOf);
    var out = {
      sourceState: null, rows: [], filterOptions: null, counts: null, pagination: null,
      refusals: [], findings: [], dataQuality: [], schema: null, scope: null,
      provenance: { adapter: A.CONTRACT_ID, asOf: asOf, fixture_fallback: false,
        schema_contract_expected: A.EXPECTED_SCHEMA_CONTRACT_VERSION, schema_contract_seen: null,
        schema_contract_matches: null }
    };

    if (!isObj(response)) {
      out.sourceState = A.CLIENT_ONLY_SOURCE_STATE;
      out.refusals = [{ code: 'RESPONSE_NOT_AN_OBJECT', detail: null, subject: null }];
      return out;
    }
    /* P1-B8B - WHO WROTE THIS ANSWER, CARRIED FORWARD.
       `meta.refused` is set by the accessor on a refusal IT built, and only there: an envelope that
       came off the wire does not have it. Downstream that is the difference between a state this side
       is entitled to report about the request - offline, timed out, refused for access - and the same
       words arriving from a server, which would be a server claiming something only the client can
       know. The live adapter checks it before honouring one of those codes. */
    out.provenance.refused = !!(isObj(response.meta) && response.meta.refused === true);
    // An accessor refusal (its own shape) carries no `data`, and SOURCE_NOT_CONNECTED is the accessor's to
    // give. It is passed through: this adapter never invents that state and never overwrites a server one.
    var d = response.data;
    if (response.success !== true || !isObj(d)) {
      var code = null;
      if (isArr(response.errors) && response.errors.length) code = str(response.errors[0].code) || null;
      if (isObj(response.refusal)) code = str(response.refusal.code) || code;
      out.sourceState = A.CLIENT_ONLY_SOURCE_STATE;
      out.refusals = [{ code: code || 'SERVER_REPORTED_FAILURE', detail: null, subject: null }];
      return out;
    }

    out.scope = d.scope === undefined ? null : d.scope;
    out.refusals = isArr(d.refusals) ? d.refusals.slice() : [];
    out.findings = isArr(d.findings) ? d.findings.slice() : [];
    out.counts = d.counts === undefined ? null : d.counts;
    out.pagination = d.pagination === undefined ? null : d.pagination;
    out.filterOptions = d.filterOptions === undefined ? null : d.filterOptions;
    out.schema = d.schema === undefined ? null : d.schema;

    var seen = (isObj(d.schema) && d.schema.contract_version !== undefined)
      ? d.schema.contract_version : null;
    out.provenance.schema_contract_seen = seen;
    out.provenance.schema_contract_matches = seen === A.EXPECTED_SCHEMA_CONTRACT_VERSION;
    if (seen !== null && seen !== A.EXPECTED_SCHEMA_CONTRACT_VERSION) {
      // REPORTED, NOT WORKED AROUND. A shape this adapter has not been written against may be missing a
      // field it reads, and quietly adapting it anyway is how a wrong number reaches a chart.
      out.dataQuality.push({ code: 'SCHEMA_CONTRACT_VERSION_MISMATCH',
        detail: 'the response shape is not the one this adapter was written against',
        evidence: { expected: A.EXPECTED_SCHEMA_CONTRACT_VERSION, seen: seen } });
    }

    // THE SERVER'S STATE WINS WHEREVER IT GAVE ONE.
    var st = str(d.sourceState);
    if (st !== '') {
      out.sourceState = st;
      if (st === A.CLIENT_ONLY_SOURCE_STATE) {
        // A server cannot honestly send this. Reported as a contract breach rather than believed.
        out.dataQuality.push({ code: 'SERVER_SENT_A_CLIENT_ONLY_STATE',
          detail: 'SOURCE_NOT_CONNECTED means no server answered, and one did', evidence: { seen: st } });
      }
    } else if (d.sourceState === null) {
      // An explicit null: the server refused before reading, so no state was MEASURED. The refusal says why.
      out.sourceState = null;
    } else {
      // A response with no such field at all predates the state contract.
      out.dataQuality.push({ code: 'RESPONSE_CARRIES_NO_SOURCE_STATE',
        detail: 'this response predates the five-state contract', evidence: null });
    }

    var live = isArr(d.normalizedRows) ? d.normalizedRows : [];
    out.rows = live.map(function (r) { return A.adaptRow(isObj(r) ? r : {}, asOf); });

    // The ledger is per code with the rows that carry it — a count on its own cannot be acted on.
    var byCode = {};
    out.rows.forEach(function (r) {
      r.data_quality.forEach(function (c) {
        if (!byCode[c]) byCode[c] = [];
        if (byCode[c].length < 50) byCode[c].push(r.identity);
      });
    });
    Object.keys(byCode).sort().forEach(function (c) {
      out.dataQuality.push({ code: c, detail: null, evidence: { rows: byCode[c] } });
    });

    return out;
  };

  /** The reusable boundary, as data — the same discipline the chart layout engine publishes. */
  A.CONTRACT = {
    id: A.CONTRACT_ID,
    one_adapter_per_system: true,
    per_page_conversion_permitted: false,
    pure: true,
    reads_the_clock: false,
    as_of_is_a_parameter: true,
    fixture_fallback: false,
    server_state_is_authoritative: true,
    client_may_only_add: A.CLIENT_ONLY_SOURCE_STATE,
    closes_shape_gaps: ['source_status', 'promotion', 'variant_group', 'variant_name', 'image_identity',
      'identity'],
    image_authority: 'KM_IMAGE_REFERENCE_POLICY_V1 — shared with SKU Details; this file owns no image rule',
    applies_to: 'productPricing.workspace.get responses; no page has adopted it yet'
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = A; }
  root.KM_PRODUCT_PRICING_ADAPTER = A;
}(typeof globalThis !== 'undefined' ? globalThis : this));
