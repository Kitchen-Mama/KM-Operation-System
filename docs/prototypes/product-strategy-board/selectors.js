/* ==================================================================================================
   PRODUCT STRATEGY BOARD — THE SELECTOR PIPELINE.  P1-B2.

   ONE PLACE WHERE DATA BECOMES A MODEL. Every view goes through this file, in this order:

       canonical rows
         -> site identity                    deriveSiteIdentity
         -> site eligibility                 getEligibleProductUniverse
         -> category / series options        deriveCategoryOptions / deriveSeriesOptions
         -> dimension filters                applyDimensionFilters
         -> in-memory scenario overlay       applyScenarioPriceOverlay
         -> derived metrics                  derivePriceArchitecture
         -> render                           prototype.js, and nothing else

   WHY IT IS A FILE AND NOT A HABIT. Before this round the order lived in prototype.js as a sequence of
   calls, the site filter was one clause of a flat sieve inside the adapter, and the category menu was a
   list the adapter had computed ONCE over every site it knew about. Three views therefore had three
   chances to narrow differently, and one of them did: the menu offered categories the selected country
   does not sell. An order of operations written down in one function cannot disagree with itself; an
   order each caller reproduces can.

   PURE, AND THAT IS LOAD-BEARING. No DOM, no storage, no network, no clock, no random, and no mutation
   of an input. Every function returns a new value — which is what lets a node suite drive the whole
   pipeline with no browser, and what lets a scenario be discarded by forgetting one object.

   IT NEVER WRITES. There is no upsert, no save, no submit, no export and no persistence of any kind in
   this file. The scenario overlay exists precisely so that a simulated price has nowhere to go.
   ================================================================================================== */

(function (global) {
  'use strict';

  var C = global.PSB_CONTRACT;
  var S = {};

  S.MODULE = 'PSB_SELECTORS';
  S.VERSION = 'P1-B2';
  S.ALL = 'ALL';

  /* ------------------------------------------------------------------------------------------------
     0  MONEY. Integer cents everywhere; no float arithmetic reaches a comparison.
     ------------------------------------------------------------------------------------------------ */
  S.cents = function (v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    return Math.round(n * 100);
  };
  S.fromCents = function (c) {
    return c === null || c === undefined ? null : (c / 100).toFixed(2);
  };
  S.money = function (c, cur) {
    return c === null ? '—' : S.fromCents(c) + (cur ? ' ' + cur : '');
  };

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function isAll(v) { return str(v) === '' || str(v) === S.ALL; }
  S.str = str;
  S.isAll = isAll;

  /* ------------------------------------------------------------------------------------------------
     1  SITE IDENTITY.

     A site is company + country + marketplace, all three. The four-part identity the live read uses
     (72_ ppwSiteKey_) is that plus the sku; membership of a SITE is decided on the three.

     AN INCOMPLETE SELECTION IS NOT A SITE, and this says so rather than quietly treating a blank as a
     wildcard. The aggregate mode is allowed — a person may look across countries — but it is a
     DIFFERENT state, with its two consequences attached here, at the source, instead of remembered by
     each view: prices are never pooled across currencies, and a scenario may not be opened, because a
     simulated price not attached to one site is a number in no currency.
     ------------------------------------------------------------------------------------------------ */
  S.SITE_DIMENSIONS = ['company', 'country', 'marketplace'];
  S.SITE_COMPLETE = 'COMPLETE_SITE';
  S.SITE_AGGREGATE = 'AGGREGATE_ACROSS_SITES';

  S.deriveSiteIdentity = function (sel) {
    sel = sel || {};
    var company = str(sel.company) || S.ALL;
    var country = str(sel.country) || S.ALL;
    var marketplace = str(sel.marketplace) || S.ALL;
    var aggregate = [];
    if (isAll(company)) aggregate.push('company');
    if (isAll(country)) aggregate.push('country');
    if (isAll(marketplace)) aggregate.push('marketplace');
    var complete = aggregate.length === 0;
    return {
      company: company,
      country: country,
      marketplace: marketplace,
      complete: complete,
      state: complete ? S.SITE_COMPLETE : S.SITE_AGGREGATE,
      aggregate_dimensions: aggregate,
      /* The scope key exists ONLY for a complete site. A key with an ALL inside it would look like an
         identity and would index a scenario under something that is not one. */
      key: complete ? (company + '|' + country + '|' + marketplace) : null,
      /* PUBLISHED AS FALSE, ALWAYS, so a reader can check it instead of trusting a paragraph. One axis
         per currency is the rule in every state; the aggregate mode does not relax it. */
      price_axis_shared: false,
      scenario_permitted: complete,
      scenario_refusal: complete ? null : 'SCENARIO_REQUIRES_A_COMPLETE_SITE_IDENTITY'
    };
  };

  /* ------------------------------------------------------------------------------------------------
     2  ELIGIBILITY — WHICH SKUs THIS SITE ACTUALLY HAS.

     THE ORDER IS THE POINT, and it is the live read's order (design freeze 33.6, 72_ ppwMembership_):

       site identity -> membership -> status gate -> master join -> regional detail

     MEMBERSHIP IS A ROW IN marketplace_skus AND NOTHING ELSE. Not a master SKU in sku_details, not a
     price in USD, not a currency that looks American. A master record is a product the company owns; it
     is not a listing. Deciding the US universe from sku_details would put every product the company has
     ever created on the US page, and a USD price would decide it for the same reason a passport decides
     which country somebody is standing in.

     REGIONAL DETAIL DOES NOT DECIDE MEMBERSHIP. If marketplace_skus says the SKU is on this site then it
     is on this site; a missing sku_regional_details row is a gap in the description, not evidence of
     absence (design freeze 31.5). So the row stays in the universe, is reported as Data Quality, and is
     kept OFF the price chart by default — three separate outcomes, because collapsing them would make
     "we cannot describe this listing" indistinguishable from "it is not sold here" or from "all is well".
     ------------------------------------------------------------------------------------------------ */
  S.PERMITTED_STATUSES = ['active', 'phasing_out'];
  S.INACTIVE_STATUSES = ['inactive', 'discontinued'];
  S.KNOWN_STATUSES = S.PERMITTED_STATUSES.concat(S.INACTIVE_STATUSES);

  S.ELIGIBILITY_ORDER = [
    'complete or aggregate site identity',
    'marketplace_skus membership on company + country + marketplace',
    'marketplace_sku_status gate',
    'sku_details join by master sku',
    'sku_regional_details presence, which is reported and never used as membership'
  ];

  S.MEMBERSHIP_AUTHORITY = 'marketplace_skus (company + country + marketplace)';
  S.CATEGORY_AUTHORITY = 'sku_details.category';
  S.SERIES_AUTHORITY = 'sku_details.series';

  /** Does one canonical row belong to the selected site? A dimension set to ALL does not constrain. */
  S.rowIsOnSite = function (row, site) {
    if (!isAll(site.company) && str(row.company) !== str(site.company)) return false;
    if (!isAll(site.country) && str(row.country) !== str(site.country)) return false;
    if (!isAll(site.marketplace) && str(row.marketplace) !== str(site.marketplace)) return false;
    return true;
  };

  /**
   * THE SITE STATUS COLUMN, AND ONLY ONE FIELD CARRIES IT.
   *
   * The contract's `source_status` IS `marketplace_skus.marketplace_sku_status` (data-contract.js, and
   * the vocabulary is 00_config.gs VALID_MARKETPLACE_SKU_STATUSES_). Adding a second field holding the
   * same value would be redundancy that can disagree, so this reads that one.
   *
   * THE ARRAY CASE IS A NAMED REFUSAL, NOT A MISREAD. The live response (72_ ppwNormalizeRow_) uses the
   * name `source_status` for something else entirely — an ARRAY of state codes — and carries the status
   * value under `marketplace_sku_status`. Feeding that shape in here would make every row
   * "not recognised", which reads as bad data rather than as the wrong field. So the shape is checked
   * and the collision is reported by name: this is the assertion that will catch the adapter swap.
   */
  S.STATUS_FIELD = 'source_status';
  S.statusStateOf = function (row, permitted) {
    var v = row[S.STATUS_FIELD];
    if (Object.prototype.toString.call(v) === '[object Array]') return 'SITE_STATUS_SHAPE_UNEXPECTED';
    var raw = str(v).toLowerCase();
    if (raw === '') return 'SITE_STATUS_MISSING';
    if (S.KNOWN_STATUSES.indexOf(raw) < 0) return 'SITE_STATUS_NOT_RECOGNISED';
    return permitted.indexOf(raw) >= 0 ? 'PERMITTED' : 'EXCLUDED_BY_STATUS';
  };

  S.regionalStateOf = function (row) {
    if (row.regional === null || row.regional === undefined) return 'REGIONAL_DETAILS_MISSING';
    return 'PRESENT';
  };

  /**
   * MAY THIS ROW GO ON A PRICE AXIS? ONE RULE, AND BOTH CALLERS ASK IT RATHER THAN AGREEING WITH IT.
   *
   * The first version computed this inside getEligibleProductUniverse and published a `chartRows` list
   * that nothing downstream read — so the universe knew the Kitchen Shears listing was unplottable and
   * the chart drew it anyway. A gate whose answer is stored beside the pipeline instead of inside it is
   * not a gate. Now the universe and `ingest` call the same function, so the answer cannot differ.
   *
   * CHARTABILITY IS DECIDED ON THE CANONICAL PRICE, NEVER ON A SIMULATED ONE. A scenario must not be
   * able to give a coordinate to a product that has no price on record: that would not be a
   * simulation, it would be an invention.
   */
  S.chartRefusalsFor = function (row) {
    var out = [];
    if (S.cents(row.regular_price) === null) out.push('PRICING_SOURCE_MISSING');
    if (S.regionalStateOf(row) === 'REGIONAL_DETAILS_MISSING') out.push('REGIONAL_DETAILS_MISSING');
    return out;
  };

  S.getEligibleProductUniverse = function (spec) {
    spec = spec || {};
    var rows = spec.rows || [];
    var site = (spec.site && spec.site.state) ? spec.site : S.deriveSiteIdentity(spec.site || spec);
    var permitted = spec.includeInactive === true
      ? S.PERMITTED_STATUSES.concat(S.INACTIVE_STATUSES)
      : S.PERMITTED_STATUSES.slice();

    var eligible = [], chartable = [], excluded = [];
    var dq = {
      regional_details_missing: [],
      category_source_missing: [],
      status_missing_or_unrecognised: [],
      price_source_missing: [],
      master_record_missing: []
    };
    var afterSite = 0, afterStatus = 0;
    var flags = {};

    rows.forEach(function (row) {
      var id = str(row.identity) || str(row.site_sku) || str(row.master_sku);
      if (!S.rowIsOnSite(row, site)) {
        excluded.push({ identity: id, reason: 'NOT_LISTED_ON_THIS_SITE',
          site: str(row.company) + '|' + str(row.country) + '|' + str(row.marketplace) });
        return;
      }
      afterSite++;

      var st = S.statusStateOf(row, permitted);
      if (st === 'EXCLUDED_BY_STATUS') {
        excluded.push({ identity: id, reason: 'EXCLUDED_BY_STATUS',
          status: str(row.marketplace_sku_status) });
        return;
      }
      if (st === 'SITE_STATUS_MISSING' || st === 'SITE_STATUS_NOT_RECOGNISED'
        || st === 'SITE_STATUS_SHAPE_UNEXPECTED') {
        /* NOT DEFAULTED TO SELLABLE. An unreadable status is a question, and a question answered "yes"
           would put a SKU on the page on the strength of a blank cell. */
        excluded.push({ identity: id, reason: st, status: str(row.marketplace_sku_status) });
        dq.status_missing_or_unrecognised.push(id);
        return;
      }
      afterStatus++;

      var regional = S.regionalStateOf(row);
      var categoryMissing = str(row.category) === '';
      var noPrice = S.cents(row.regular_price) === null;
      var masterMissing = (row.missing_reasons || []).indexOf('MASTER_SKU_RECORD_MISSING') >= 0;

      if (regional === 'REGIONAL_DETAILS_MISSING') dq.regional_details_missing.push(id);
      if (categoryMissing) dq.category_source_missing.push(id);
      if (noPrice) dq.price_source_missing.push(id);
      if (masterMissing) dq.master_record_missing.push(id);

      /* CHARTABLE IS NARROWER THAN ELIGIBLE, and the two reasons differ in kind: a row with no everyday
         price has no coordinate, and a row with no regional record is a listing we cannot yet describe.
         Both are on the page; neither is plotted. The rule is S.chartRefusalsFor, which `ingest` also
         calls — so what the ledger reports and what the axis draws are the same decision. */
      var chartRefusals = S.chartRefusalsFor(row);

      flags[id] = {
        identity: id,
        site_membership: 'SITE_LISTED',
        membership_authority: S.MEMBERSHIP_AUTHORITY,
        status_state: st,
        regional_state: regional,
        category_state: categoryMissing ? 'CATEGORY_SOURCE_MISSING' : 'PRESENT',
        chartable: chartRefusals.length === 0,
        chart_refusals: chartRefusals
      };
      eligible.push(row);
      if (chartRefusals.length === 0) chartable.push(row);
    });

    dq.total = dq.regional_details_missing.length + dq.category_source_missing.length
      + dq.status_missing_or_unrecognised.length + dq.price_source_missing.length
      + dq.master_record_missing.length;

    return {
      state: 'ELIGIBLE_UNIVERSE',
      site: site,
      order: S.ELIGIBILITY_ORDER.slice(),
      membership_authority: S.MEMBERSHIP_AUTHORITY,
      permitted_statuses: permitted,
      include_inactive: spec.includeInactive === true,
      rows: eligible,
      chartRows: chartable,
      excluded: excluded,
      flagsByIdentity: flags,
      dataQuality: dq,
      counts: {
        canonical: rows.length,
        after_site: afterSite,
        after_status: afterStatus,
        eligible: eligible.length,
        chartable: chartable.length,
        excluded: excluded.length
      },
      /* Stated so no view has to infer it: regional presence never removed a row from `rows`. */
      regional_detail_decides_membership: false,
      currency_decides_membership: false,
      master_table_decides_membership: false
    };
  };

  /* ------------------------------------------------------------------------------------------------
     3  THE DIMENSION MENUS, DERIVED FROM THE ELIGIBLE UNIVERSE.

     The rules are the live read's (72_ ppwFilterOptions_ / ppwNormalizationVariants_), implemented once
     here so the prototype and the live page cannot answer differently:

       - trim is the ONLY normalization. Case and internal spacing are NOT folded, because folding is a
         semantic merge and merging two business categories is a data decision an operator owns.
       - values differing only by case or spacing are KEPT AS TWO and REPORTED.
       - blank is ABSENT from the menu, never a bucket, and never renamed "Other". The SKU is kept.
       - exact-value de-duplication, then a deterministic ascending sort. Never source order.
       - NO allowlist and NO maximum. Both are published as null so a reader can check.
       - counts are over the whole eligible universe, never the current page.
       - self-excluding: a dimension's options are not narrowed by its own filter, or a menu would
         collapse to the item just picked and could no longer be used to pick anything else.
     ------------------------------------------------------------------------------------------------ */
  S.CATEGORY_ALLOWLIST = null;
  S.CATEGORY_MAX_OPTIONS = null;
  S.UNMAPPED_LABEL = 'Unmapped / Needs Review';

  function optionsFor(rows, key, flags) {
    var seen = {}, order = [], blank = 0, blankIds = [];
    rows.forEach(function (r) {
      var v = str(r[key]);
      if (v === '') {
        blank++;
        blankIds.push(str(r.identity));
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(seen, v)) {
        seen[v] = { value: v, siteSkuCount: 0, analysableSiteSkuCount: 0 };
        order.push(v);
      }
      seen[v].siteSkuCount++;
      var f = flags ? flags[str(r.identity)] : null;
      if (f ? f.chartable : S.cents(r.regular_price) !== null) seen[v].analysableSiteSkuCount++;
    });
    order.sort();
    return {
      options: order.map(function (v) { return seen[v]; }),
      blank_count: blank,
      blank_identities: blankIds
    };
  }
  S.optionsFor = optionsFor;

  /** Values that differ only by case or internal whitespace once trimmed. Reported, never merged. */
  S.normalizationVariants = function (options) {
    var byFolded = {}, out = [];
    (options || []).forEach(function (o) {
      var f = String(o.value).toLowerCase().replace(/\s+/g, ' ');
      (byFolded[f] = byFolded[f] || []).push(o.value);
    });
    Object.keys(byFolded).sort().forEach(function (f) {
      if (byFolded[f].length > 1) out.push({ normalized: f, variants: byFolded[f].slice().sort() });
    });
    return out;
  };

  /**
   * Alias normalization — the ONLY merge permitted, and only for pairs an operator has declared.
   * Trim and case-fold are applied to the LOOKUP, never to the vocabulary: an alias table maps a known
   * raw value onto a known canonical value. An unrecognised value is returned unchanged, because the
   * alternative — folding it into the nearest thing — is how a taxonomy nobody maintains gets invented.
   */
  S.ALIASES = {};
  S.canonicalCategory = function (raw, aliases) {
    var table = aliases || S.ALIASES;
    var v = str(raw);
    if (v === '') return null;
    var hit = table[v.toLowerCase().replace(/\s+/g, ' ')];
    return hit === undefined ? v : hit;
  };

  S.deriveCategoryOptions = function (universe, otherFilters) {
    var rows = universe.rows || [];
    var series = otherFilters && !isAll(otherFilters.series) ? str(otherFilters.series) : null;
    /* SELF-EXCLUDING: narrowed by the OTHER dimension, never by category itself. */
    var pool = series === null ? rows : rows.filter(function (r) { return str(r.series) === series; });
    var built = optionsFor(pool, 'category', universe.flagsByIdentity);
    return {
      options: built.options,
      blank_count: built.blank_count,
      blank_identities: built.blank_identities,
      normalization_review: S.normalizationVariants(built.options),
      allowlist: S.CATEGORY_ALLOWLIST,
      max_options: S.CATEGORY_MAX_OPTIONS,
      source: S.CATEGORY_AUTHORITY,
      derived_from: 'the eligible universe of this site',
      normalization: 'trim only',
      semantic_merge: false,
      blank_becomes_other: false,
      counts_are: 'the whole eligible universe of this site, never the current page',
      self_excluding: true,
      narrowed_by: series === null ? [] : ['series']
    };
  };

  S.deriveSeriesOptions = function (universe, otherFilters) {
    var rows = universe.rows || [];
    var cat = otherFilters && !isAll(otherFilters.category) ? str(otherFilters.category) : null;
    var pool = cat === null ? rows : rows.filter(function (r) { return str(r.category) === cat; });
    var built = optionsFor(pool, 'series', universe.flagsByIdentity);
    return {
      options: built.options,
      blank_count: built.blank_count,
      blank_identities: built.blank_identities,
      normalization_review: S.normalizationVariants(built.options),
      allowlist: null,
      max_options: null,
      source: S.SERIES_AUTHORITY,
      derived_from: 'the eligible universe of this site',
      self_excluding: true,
      narrowed_by: cat === null ? [] : ['category']
    };
  };

  /** Any simple dimension's values, over the eligible universe. Used for currency and marketplace. */
  S.deriveDimensionValues = function (universe, key) {
    var seen = {}, out = [];
    (universe.rows || []).forEach(function (r) {
      var v = str(r[key]);
      if (v === '' || seen[v]) return;
      seen[v] = 1;
      out.push(v);
    });
    return out.sort();
  };

  /* ------------------------------------------------------------------------------------------------
     4  DIMENSION FILTERS. Applied AFTER eligibility, never instead of it.
     ------------------------------------------------------------------------------------------------ */
  S.applyDimensionFilters = function (rows, filters) {
    filters = filters || {};
    return (rows || []).filter(function (r) {
      if (!isAll(filters.category) && str(r.category) !== str(filters.category)) return false;
      if (!isAll(filters.series) && str(r.series) !== str(filters.series)) return false;
      if (!isAll(filters.currency) && str(r.currency) !== str(filters.currency)) return false;
      if (filters.search) {
        var q = String(filters.search).toLowerCase();
        var hay = [r.master_sku, r.site_sku, r.product_name, r.category, r.series]
          .map(function (x) { return String(x === null || x === undefined ? '' : x).toLowerCase(); })
          .join(' ');
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  };

  /* ------------------------------------------------------------------------------------------------
     5  THE SCENARIO OVERLAY — A MEETING, NOT A DECISION.

     WHERE IT LIVES. One plain object, handed in and handed back:

         overrides[siteIdentityKey][series][priceField] = value

     and nothing else anywhere. No localStorage, no sessionStorage, no IndexedDB, no cookie, no URL, no
     DB, no Sheet, no API. A browser reload constructs a new empty object and the simulation is gone —
     which is the requirement, not a limitation: a price somebody tried out in a meeting must not
     survive the meeting by accident.

     WHY IT IS KEYED BY SITE IDENTITY FIRST. A price is a number in a currency, and the currency is the
     site's. A scenario keyed by series alone would apply 14.99 to a USD ladder and a EUR ladder at
     once, which is the same defect as a shared price axis one level up.

     WHY THE DEFAULT FIELD IS THE PROPOSED PRICE. `proposed_scenario_price` is board-owned and already
     means "a number somebody suggested" — nothing downstream mistakes it for a price the company
     charges. An everyday-price simulation is offered too, because the brief allows it, but it is a
     SEPARATE overlay field and it never replaces `regular_price` on the canonical row: the original is
     kept beside it, on the view row, so the two can be shown together.
     ------------------------------------------------------------------------------------------------ */
  S.SCENARIO_FIELDS = ['proposed_scenario_price', 'everyday_scenario_price'];
  S.SCENARIO_DEFAULT_FIELD = 'proposed_scenario_price';
  S.SCENARIO_MODES = ['ABSOLUTE', 'PERCENT', 'DELTA'];

  /**
   * WHY A SERIES OVERRIDE HAS A MODE, AND WHY ONE COMBINATION IS REFUSED.
   *
   * The first version of this took one number per series and assigned it to every member. Run against
   * the Spatula series it turned a four-rung ladder - 14.99 / 19.99 / 24.99 / 34.99 - into four products
   * at 9.99, and every gap and every cannibalisation finding went to zero. That is not a price
   * simulation; it is the deletion of the structure the board exists to show.
   *
   *   ABSOLUTE  one number for the whole series. CORRECT for a promotion - a series-wide deal price
   *             genuinely IS one number - and refused for the everyday price at series scope, because
   *             an everyday ladder collapsed to a single point is not a scenario anybody meant to ask.
   *   PERCENT   each member moves by a percentage of its OWN price. The ladder moves and keeps its
   *             shape, which is what "what if we drop this series 15%" actually means.
   *   DELTA     each member moves by the same signed amount of money.
   *
   * The refusal is returned as a value rather than enforced by a comment, so a caller can show it.
   */
  S.SCENARIO_MODE_DEFAULTS = {
    proposed_scenario_price: 'ABSOLUTE',
    everyday_scenario_price: 'PERCENT'
  };
  S.scenarioModeRefusal = function (field, mode) {
    if (S.SCENARIO_FIELDS.indexOf(field) < 0) return 'SCENARIO_FIELD_NOT_SIMULATABLE';
    if (S.SCENARIO_MODES.indexOf(mode) < 0) return 'SCENARIO_MODE_UNKNOWN';
    if (field === 'everyday_scenario_price' && mode === 'ABSOLUTE') {
      return 'EVERYDAY_ABSOLUTE_AT_SERIES_SCOPE_WOULD_FLATTEN_THE_LADDER';
    }
    return null;
  };

  /** Signed money to cents. S.cents is for prices, which are never negative; a DELTA is. */
  S.signedCents = function (v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    return Math.round(n * 100);
  };

  /**
   * One override applied to one canonical value. Returns null when there is nothing to adjust - a
   * percentage of a price that does not exist is not zero, it is unanswerable - and null when the
   * result would not be a price: a simulated 0.00 or a negative figure is a typo, not a strategy.
   */
  S.resolveScenarioValue = function (spec, canonicalC) {
    if (!spec) return null;
    var mode = str(spec.mode) || 'ABSOLUTE';
    if (mode === 'ABSOLUTE') {
      var abs = S.cents(spec.value);
      return (abs === null || abs <= 0) ? null : abs;
    }
    if (canonicalC === null || canonicalC === undefined) return null;
    var out = null;
    if (mode === 'PERCENT') {
      var pct = Number(spec.value);
      if (!isFinite(pct)) return null;
      out = Math.round(canonicalC * (1 + pct / 100));
    } else if (mode === 'DELTA') {
      var d = S.signedCents(spec.value);
      if (d === null) return null;
      out = canonicalC + d;
    } else {
      return null;
    }
    return out <= 0 ? null : out;
  };
  S.SCENARIO_LABEL = 'Scenario';
  S.SCENARIO_UNSAVED_LABEL = 'Scenario · Unsaved';
  S.SCENARIO_STORAGE = 'IN_MEMORY_ONLY';
  S.SCENARIO_SURVIVES_RELOAD = false;

  /** The site's scenario key, or null. A scenario cannot be keyed by an incomplete identity. */
  S.scenarioSiteKey = function (site) {
    var s = (site && site.state) ? site : S.deriveSiteIdentity(site);
    return s.complete ? s.key : null;
  };

  function cloneOverrides(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (siteKey) {
      out[siteKey] = {};
      Object.keys(o[siteKey] || {}).forEach(function (series) {
        var f = {};
        Object.keys(o[siteKey][series] || {}).forEach(function (k) { f[k] = o[siteKey][series][k]; });
        out[siteKey][series] = f;
      });
    });
    return out;
  }
  S.cloneScenarioOverrides = cloneOverrides;

  /**
   * Set one override. Returns a NEW overrides object; the one passed in is never touched, so a caller
   * that wants the previous state still has it.
   *
   * A blank or unparseable value REMOVES the override rather than storing a null that would read as a
   * deliberate simulation of "no price".
   */
  S.setScenarioOverride = function (overrides, spec) {
    spec = spec || {};
    var next = cloneOverrides(overrides);
    var key = S.scenarioSiteKey(spec.site);
    var series = str(spec.series);
    var field = str(spec.field) || S.SCENARIO_DEFAULT_FIELD;
    var mode = str(spec.mode) || S.SCENARIO_MODE_DEFAULTS[field] || 'ABSOLUTE';
    /* NOTHING IS STORED ON A REFUSED COMBINATION, and the previous state is handed back unchanged: a
       refused edit must not half-apply. */
    if (key === null || series === '') return next;
    if (S.scenarioModeRefusal(field, mode) !== null) return next;

    /* A BLANK VALUE CLEARS THE OVERRIDE. Storing a null would read as somebody deliberately simulating
       "no price", which is a different statement from having no simulation at all. */
    var raw = spec.value;
    var blank = (raw === null || raw === undefined || str(raw) === '');
    var probe = blank ? null : S.resolveScenarioValue({ mode: mode, value: raw }, 10000);
    if (blank || probe === null) {
      if (next[key] && next[key][series]) {
        delete next[key][series][field];
        if (Object.keys(next[key][series]).length === 0) delete next[key][series];
        if (Object.keys(next[key]).length === 0) delete next[key];
      }
      return next;
    }
    next[key] = next[key] || {};
    next[key][series] = next[key][series] || {};
    next[key][series][field] = { mode: mode, value: str(raw) };
    return next;
  };

  /**
   * The three resets, and each one is a different question:
   *   'series'  this Series on this site
   *   'site'    every Series on this site, and no other site
   *   'all'     every scenario anywhere
   * `scope` is required and unrecognised values reset NOTHING — a typo must not clear the board.
   */
  S.RESET_SCOPES = ['series', 'site', 'all'];
  S.resetScenarioOverrides = function (overrides, spec) {
    spec = spec || {};
    var scope = str(spec.scope);
    if (scope === 'all') return {};
    var next = cloneOverrides(overrides);
    var key = S.scenarioSiteKey(spec.site);
    if (key === null) return next;
    if (scope === 'site') {
      delete next[key];
      return next;
    }
    if (scope === 'series') {
      var series = str(spec.series);
      if (series !== '' && next[key]) {
        delete next[key][series];
        if (Object.keys(next[key]).length === 0) delete next[key];
      }
      return next;
    }
    return next;
  };

  S.scenarioCount = function (overrides) {
    var n = 0;
    Object.keys(overrides || {}).forEach(function (k) {
      Object.keys(overrides[k] || {}).forEach(function (s) {
        n += Object.keys(overrides[k][s] || {}).length;
      });
    });
    return n;
  };

  S.scenarioActiveForSite = function (overrides, site) {
    var key = S.scenarioSiteKey(site);
    if (key === null) return false;
    return !!(overrides && overrides[key] && Object.keys(overrides[key]).length > 0);
  };

  S.scenarioForRow = function (overrides, site, row) {
    var key = S.scenarioSiteKey(site);
    if (key === null || !overrides || !overrides[key]) return null;
    var series = str(row.series);
    if (series === '') return null;
    var f = overrides[key][series];
    return (f && Object.keys(f).length) ? f : null;
  };

  /* ------------------------------------------------------------------------------------------------
     6  INGEST — canonical row to view row, with the overlay applied HERE and nowhere else.

     THE OVERLAY IS APPLIED AT THE ONE POINT WHERE CENTS ARE COMPUTED. Every downstream consumer — the
     axis, the steps, the gap findings, the comparison table, the category summary — reads `_regular_c`
     and `_proposed_c`, so a simulated price is reflected everywhere by construction rather than by each
     view remembering to ask. The canonical values are kept beside them, under `_canonical`, so the
     original is always available to show next to the simulated one.

     THE INPUT ROW IS NOT MUTATED. A new object is built from the contract's own field list.
     ------------------------------------------------------------------------------------------------ */
  S.PREVIEW_TODAY = '2026-09-10';

  S.withinPeriod = function (r, today) {
    if (!r.official_deal_start || !r.official_deal_end) return false;
    var t = today || S.PREVIEW_TODAY;
    return String(r.official_deal_start) <= t && t <= String(r.official_deal_end);
  };

  S.ingest = function (r, scenario, today) {
    var o = {};
    (C && C.FIELD_NAMES ? C.FIELD_NAMES : Object.keys(r)).forEach(function (k) { o[k] = r[k]; });
    /* `regional` is the one field P1-B2 appended to the contract, and it travels explicitly because
       the Data Quality views and the chartable gate are built from it. The site status is NOT copied
       here: it is `source_status`, already in the frozen field list, already carried by the loop above. */
    o.regional = r.regional === undefined ? null : r.regional;

    var canonicalRegular = S.cents(r.regular_price);
    var canonicalProposed = S.cents(r.provenance && r.provenance.proposed_scenario_price);

    /* RESOLVED PER ROW, AGAINST THAT ROW'S OWN CANONICAL VALUE. A PERCENT override therefore moves
       each rung of the ladder by its own amount and the shape survives; only ABSOLUTE assigns one number
       to every member, and only the promotion field is allowed to do that. */
    var everydayOverride = scenario
      ? S.resolveScenarioValue(scenario.everyday_scenario_price, canonicalRegular) : null;
    var proposedOverride = scenario
      ? S.resolveScenarioValue(scenario.proposed_scenario_price, canonicalProposed) : null;

    o._regular_c = everydayOverride === null ? canonicalRegular : everydayOverride;
    o._proposed_c = proposedOverride === null ? canonicalProposed : proposedOverride;
    o._min_c = S.cents(r.minimum_price);
    o._msrp_c = S.cents(r.msrp);
    o._deal_c = S.cents(r.official_deal_price);
    o._deal_period_ok = !!(r.official_deal_start && r.official_deal_end);
    o._deal_live = o._deal_c !== null && o._deal_period_ok && S.withinPeriod(r, today);
    o._chart_refusals = S.chartRefusalsFor(r);
    o._plottable = o._chart_refusals.length === 0;

    /* THE CANONICAL VALUES, KEPT. "原始價格需保留並可比較" — and a simulated figure that erased the
       real one would make the comparison the whole feature exists for impossible. */
    o._canonical = {
      regular_c: canonicalRegular,
      proposed_c: canonicalProposed,
      regular_price: r.regular_price === undefined ? null : r.regular_price
    };
    var fields = {};
    if (everydayOverride !== null) {
      fields.everyday_scenario_price = { from: canonicalRegular, to: everydayOverride,
        mode: str(scenario.everyday_scenario_price.mode) || 'PERCENT',
        input: str(scenario.everyday_scenario_price.value) };
    }
    if (proposedOverride !== null) {
      fields.proposed_scenario_price = { from: canonicalProposed, to: proposedOverride,
        mode: str(scenario.proposed_scenario_price.mode) || 'ABSOLUTE',
        input: str(scenario.proposed_scenario_price.value) };
    }
    var names = Object.keys(fields);
    o._scenario = {
      active: names.length > 0,
      fields: fields,
      field_names: names,
      series: str(r.series) || null,
      label: names.length > 0 ? S.SCENARIO_UNSAVED_LABEL : null,
      values_are: names.length > 0 ? 'SIMULATED_IN_MEMORY' : 'SOURCE'
    };

    /* THE VALUE ON THE ROW, VERBATIM, AND ONLY WHEN THE ROW SAYS IT IS VERIFIED. No path composes one
       here from a sku, a directory or an extension. */
    o._image = (r.image_identity_status === 'VERIFIED_DB_MAPPING' && r.product_image)
      ? r.product_image : null;
    return o;
  };

  /**
   * The overlay stage, as a stage. Canonical rows in, view rows out, scenario applied per row from the
   * row's OWN series and the site's own key — so a scenario can never leak onto another site's ladder.
   */
  S.applyScenarioPriceOverlay = function (rows, overrides, site, today) {
    return (rows || []).map(function (r) {
      return S.ingest(r, S.scenarioForRow(overrides, site, r), today);
    });
  };

  /* ------------------------------------------------------------------------------------------------
     7  VARIANT GROUPING — the contract's rule, implemented exactly and nowhere relaxed.

     Merge ONLY on a shared non-empty variant_group AND an identical price signature. Never on a sku
     prefix: a shared prefix is a naming habit, and a habit that is right most of the time merges the
     rest wrongly and silently. Category is part of the key as well — two categories cannot share a node
     any more than they can share an axis.
     ------------------------------------------------------------------------------------------------ */
  S.priceSignature = function (r) {
    return [r._regular_c, r._min_c, r._msrp_c, r._deal_c].join('/');
  };

  S.labelOf = function (r) {
    if (!r.variant_group) return r.master_sku;
    return String(r.variant_group).split('|')[0];
  };

  S.groupNodes = function (rows) {
    var byKey = {}, order = [], nodes = [];
    (rows || []).forEach(function (r) {
      var grouped = !!r.variant_group;
      var key = grouped
        ? ('G|' + r.category + '|' + r.currency + '|' + r.variant_group + '|' + S.priceSignature(r))
        : ('U|' + r.identity);
      if (!byKey[key]) { byKey[key] = { key: key, members: [], grouped: grouped }; order.push(key); }
      byKey[key].members.push(r);
    });
    order.forEach(function (k) {
      var g = byKey[k], first = g.members[0];
      /* THE REPRESENTATIVE IMAGE COMES FROM THIS NODE'S OWN MEMBERS. A price-split sibling shares a
         variant_group and is a DIFFERENT node, so it does not inherit the photograph. */
      var withImage = null;
      g.members.forEach(function (m) { if (!withImage && m._image) withImage = m; });
      var reasons = {};
      g.members.forEach(function (m) {
        (m.missing_reasons || []).forEach(function (x) { reasons[x] = true; });
      });
      /* A node is a scenario node if ANY member carries one. Members of a node share a price signature,
         so in practice they share the overlay too — but the check is over the members rather than the
         first one, because "the first row happened to be the one without it" is not a reason to drop a
         badge that tells a reader the number is simulated. */
      var scen = null;
      g.members.forEach(function (m) { if (!scen && m._scenario && m._scenario.active) scen = m._scenario; });
      nodes.push({
        key: k,
        grouped: g.grouped,
        grouping_state: g.grouped ? 'GROUPED_BY_VARIANT_GROUP' : 'VARIANT_GROUPING_SOURCE_MISSING',
        label: S.labelOf(first),
        product_name: first.product_name,
        category: first.category,
        series: first.series,
        currency: first.currency,
        company: first.company, country: first.country, marketplace: first.marketplace,
        members: g.members,
        variant_count: g.members.length,
        skus: g.members.map(function (m) { return m.master_sku; }),
        grouped_skus: g.members.map(function (m) { return m.master_sku; }),
        site_skus: g.members.map(function (m) { return m.site_sku; }),
        representative_sku: withImage ? withImage.master_sku : first.master_sku,
        representative_image_sku: withImage ? withImage.master_sku : null,
        variant_names: g.members.map(function (m) { return m.variant_name; })
          .filter(function (x) { return !!x; }),
        image: withImage ? withImage._image : null,
        image_state: withImage ? 'VERIFIED_DB_MAPPING' : 'IMAGE_SOURCE_MISSING',
        image_basis: (withImage || first).provenance.image_basis,
        _regular_c: first._regular_c, _min_c: first._min_c, _msrp_c: first._msrp_c,
        _deal_c: first._deal_c, _proposed_c: first._proposed_c,
        _deal_live: first._deal_live, _deal_period_ok: first._deal_period_ok,
        _canonical: first._canonical,
        _scenario: scen || first._scenario,
        deal_start: first.official_deal_start, deal_end: first.official_deal_end,
        campaign: first.provenance.campaign_name,
        lifecycle_status: first.lifecycle_status, source_status: first.source_status,
        regional: first.regional,
        missing_reasons: Object.keys(reasons),
        _chart_refusals: first._chart_refusals,
        _plottable: first._plottable
      });
    });
    return nodes;
  };

  /* ------------------------------------------------------------------------------------------------
     8  CURRENCY PANELS. One panel per currency, one axis each, no rate applied anywhere.
     ------------------------------------------------------------------------------------------------ */
  S.splitByCurrency = function (nodes) {
    var by = {}, order = [];
    (nodes || []).forEach(function (n) {
      var c = n.currency || 'UNKNOWN';
      if (!by[c]) { by[c] = []; order.push(c); }
      by[c].push(n);
    });
    return order.sort().map(function (c) {
      var all = by[c];
      return {
        currency: c,
        plotted: all.filter(function (n) { return n._plottable; })
          .sort(function (a, b) { return a._regular_c - b._regular_c; }),
        notPlotted: all.filter(function (n) { return !n._plottable; })
      };
    });
  };

  /* ------------------------------------------------------------------------------------------------
     9  THE ANALYSIS ENGINE.
     Four classes, and the boundary rules differ ON PURPOSE:
       gap             strictly greater than the threshold  ( > )
       overlap         more than a single shared point      ( lo < hi )
       cannibalisation inclusive                            ( <= )
     A step exactly equal to the threshold is not a gap. Two intervals that meet at one point do not
     overlap — and that same touch IS a cannibalisation, because discounting to exactly the price below
     is the thing the risk is about.

     EVERY PAIR IS INSIDE ONE PANEL, AND EVERY PANEL IS INSIDE ONE CATEGORY. There is no code path that
     compares two categories, because there is no meaning to compare.
     ------------------------------------------------------------------------------------------------ */
  S.CLASS = { OPP: 'OPPORTUNITY', WATCH: 'WATCH', RISK: 'RISK', DQ: 'DATA QUALITY' };

  S.sellInterval = function (n) {
    var lo = n._regular_c, drivers = [];
    if (n._deal_live && n._deal_c !== null && n._deal_c < lo) { lo = n._deal_c; drivers.push('LIVE'); }
    if (n._proposed_c !== null && n._proposed_c < lo) { lo = n._proposed_c; drivers.push('PROPOSED'); }
    return { lo: lo, hi: n._regular_c, drivers: drivers };
  };
  S.liveOnlyInterval = function (n) {
    var lo = n._regular_c;
    if (n._deal_live && n._deal_c !== null && n._deal_c < lo) lo = n._deal_c;
    return { lo: lo, hi: n._regular_c };
  };

  S.analyse = function (panel, thrC) {
    var CLASS = S.CLASS, money = S.money;
    var ns = panel.plotted, out = [];
    var cur = panel.currency;
    var cat = (ns[0] || panel.notPlotted[0] || {}).category || null;

    /* OPPORTUNITY — a step in the ladder wider than the threshold. */
    for (var i = 1; i < ns.length; i++) {
      var d = ns[i]._regular_c - ns[i - 1]._regular_c;
      if (d > thrC) {
        out.push({ cls: CLASS.OPP, kind: 'PRICE_GAP', currency: cur, category: cat,
          a: ns[i - 1], b: ns[i], distance_c: d, threshold_c: thrC,
          headline: 'Open price step of ' + money(d, cur) + ' between '
            + ns[i - 1].label + ' and ' + ns[i].label,
          detail: 'No product sits between ' + money(ns[i - 1]._regular_c, cur) + ' and '
            + money(ns[i]._regular_c, cur) + '. Threshold in use: ' + money(thrC, cur) + '.',
          proposal_driven: false,
          scenario_driven: !!((ns[i - 1]._scenario && ns[i - 1]._scenario.active)
            || (ns[i]._scenario && ns[i]._scenario.active)) });
      }
    }

    /* WATCH — two products whose sell-price intervals share more than a single point. */
    for (var a = 0; a < ns.length; a++) {
      for (var b = a + 1; b < ns.length; b++) {
        var A = S.sellInterval(ns[a]), B = S.sellInterval(ns[b]);
        var lo = Math.max(A.lo, B.lo), hi = Math.min(A.hi, B.hi);
        if (lo < hi) {
          var LA = S.liveOnlyInterval(ns[a]), LB = S.liveOnlyInterval(ns[b]);
          var loL = Math.max(LA.lo, LB.lo), hiL = Math.min(LA.hi, LB.hi);
          var causedByProposal = !(loL < hiL);
          out.push({ cls: CLASS.WATCH, kind: 'PRICE_BAND_OVERLAP', currency: cur, category: cat,
            a: ns[a], b: ns[b], lo_c: lo, hi_c: hi,
            headline: ns[a].label + ' and ' + ns[b].label + ' sell into the same '
              + money(hi - lo, cur) + ' window',
            detail: 'Shared window ' + money(lo, cur) + ' to ' + money(hi, cur) + '.',
            proposal_driven: causedByProposal,
            scenario_driven: !!((ns[a]._scenario && ns[a]._scenario.active)
              || (ns[b]._scenario && ns[b]._scenario.active)) });
        }
      }
    }

    /* RISK — a higher-priced product discounting to or below a lower-priced product's normal price. */
    for (var x = 0; x < ns.length; x++) {
      for (var y = 0; y < x; y++) {
        (function (hiN, loN) {
          if (hiN._regular_c <= loN._regular_c) return;
          var offers = [];
          if (hiN._deal_c !== null && hiN._deal_live) {
            offers.push({ price_c: hiN._deal_c, basis: 'LIVE', label: 'live promotion' });
          }
          if (hiN._proposed_c !== null) {
            offers.push({ price_c: hiN._proposed_c, basis: 'PROPOSED', label: 'proposed scenario' });
          }
          offers.forEach(function (of) {
            if (of.price_c <= loN._regular_c) {
              out.push({ cls: CLASS.RISK, kind: 'DEAL_CANNIBALIZATION', currency: cur, category: cat,
                a: hiN, b: loN, offer_c: of.price_c, basis: of.basis,
                headline: hiN.label + ' at ' + money(of.price_c, cur) + ' meets or undercuts '
                  + loN.label + ' at ' + money(loN._regular_c, cur),
                detail: 'The ' + of.label + ' on ' + hiN.label + ' reaches '
                  + money(of.price_c, cur) + ', at or below the everyday price of ' + loN.label + '.',
                proposal_driven: of.basis === 'PROPOSED',
                scenario_driven: !!((hiN._scenario && hiN._scenario.active)
                  || (loN._scenario && loN._scenario.active)) });
            }
          });
        })(ns[x], ns[y]);
      }
    }

    /* DATA QUALITY — everything the sources could not supply. */
    panel.notPlotted.forEach(function (n) {
      var why = (n.missing_reasons || []).indexOf('REGIONAL_DETAILS_MISSING') >= 0
        ? 'REGIONAL_DETAILS_MISSING' : 'NO_PRICE';
      out.push({ cls: CLASS.DQ, kind: why, currency: cur, category: cat, a: n,
        headline: why === 'REGIONAL_DETAILS_MISSING'
          ? n.label + ' has no regional record for this site'
          : n.label + ' has no everyday price on record',
        detail: why === 'REGIONAL_DETAILS_MISSING'
          ? 'marketplace_skus lists it on this site, so it is kept. sku_regional_details has no row'
            + ' for this exact four-part identity, so it is deliberately not plotted and it is NOT'
            + ' assumed to be sold everywhere.'
          : 'It is listed and deliberately not plotted. No stand-in price is used.',
        proposal_driven: false, scenario_driven: false });
    });
    /* ONE FINDING PER REASON, NOT ONE PER PRODUCT (P0-R3-R1). A reader needs the count, the reason and
       the list — once. */
    var byImgReason = {}, imgOrder = [];
    panel.plotted.concat(panel.notPlotted).forEach(function (n) {
      if (n.image_state === 'VERIFIED_DB_MAPPING') return;
      var why2 = String(n.image_basis || 'IMAGE_SOURCE_MISSING');
      if (!byImgReason[why2]) { byImgReason[why2] = []; imgOrder.push(why2); }
      byImgReason[why2].push(n);
    });
    imgOrder.forEach(function (why2) {
      var ns2 = byImgReason[why2];
      out.push({ cls: CLASS.DQ, kind: 'IMAGE_SOURCE_MISSING', currency: cur, category: cat, a: ns2[0],
        headline: ns2.length + (ns2.length === 1 ? ' product has' : ' products have')
          + ' no verified product photograph',
        detail: 'No authoritative record names an image file for '
          + (ns2.length === 1 ? 'it' : 'them') + ', so nothing is shown in the slot rather than a'
          + ' picture that cannot be proved to be that product. Reason on record: ' + why2
          + '. Affected: ' + ns2.map(function (x) { return x.label; }).join(' · ') + '.',
        proposal_driven: false, scenario_driven: false });
    });
    panel.plotted.concat(panel.notPlotted).forEach(function (n) {
      if (n.grouping_state !== 'GROUPED_BY_VARIANT_GROUP') {
        out.push({ cls: CLASS.DQ, kind: 'VARIANT_GROUPING_SOURCE_MISSING', currency: cur,
          category: cat, a: n,
          headline: n.label + ' cannot be grouped with its colour variants',
          detail: 'Nothing on record proves which products are variants of it, so it stands alone.',
          proposal_driven: false, scenario_driven: false });
      }
      if (n._deal_c !== null && !n._deal_period_ok) {
        out.push({ cls: CLASS.DQ, kind: 'DEAL_PERIOD_MISSING', currency: cur, category: cat, a: n,
          headline: n.label + ' has a promotion price with no dates',
          detail: 'Without a start and an end it is not treated as live and carries no risk finding.',
          proposal_driven: false, scenario_driven: false });
      }
      if (String(n.category || '') === '') {
        out.push({ cls: CLASS.DQ, kind: 'CATEGORY_SOURCE_MISSING', currency: cur, category: cat, a: n,
          headline: n.label + ' has no category on record',
          detail: 'sku_details.category is blank for it. It is kept and shown as '
            + S.UNMAPPED_LABEL + ', and it is never renamed "Other": inventing a bucket would make a'
            + ' missing value look like a decision somebody made.',
          proposal_driven: false, scenario_driven: false });
      }
    });
    return out;
  };

  S.tierOf = function (panel, node) {
    var n = panel.plotted.length;
    if (n <= 1) return 'only';
    var i = panel.plotted.indexOf(node);
    if (i < 0) return null;
    if (i < Math.ceil(n / 3)) return 'entry';
    if (i >= n - Math.ceil(n / 3)) return 'premium';
    return 'core';
  };

  /* ------------------------------------------------------------------------------------------------
     10  THE PRICE ARCHITECTURE, and THE WHOLE PIPELINE IN ONE CALL.
     ------------------------------------------------------------------------------------------------ */
  S.derivePriceArchitecture = function (viewRows, thresholdC) {
    var nodes = S.groupNodes(viewRows);
    var panels = S.splitByCurrency(nodes);
    var findings = [];
    panels.forEach(function (p) { findings = findings.concat(S.analyse(p, thresholdC)); });
    return {
      nodes: nodes,
      panels: panels,
      findings: findings,
      currencies: panels.map(function (p) { return p.currency; }),
      /* MORE THAN ONE CURRENCY IS MORE THAN ONE AXIS. Never a conversion, never a pooled range. */
      price_axis_per_currency: true,
      fx_applied: false,
      scenario_nodes: nodes.filter(function (n) { return n._scenario && n._scenario.active; })
        .map(function (n) { return n.label; })
    };
  };

  /**
   * THE PIPELINE. The only function a view should need, and the reason no view re-implements a stage.
   */
  S.deriveBoardModel = function (spec) {
    spec = spec || {};
    var site = S.deriveSiteIdentity(spec.selection || {});
    var universe = S.getEligibleProductUniverse({
      rows: spec.rows || [],
      site: site,
      includeInactive: spec.includeInactive === true
    });
    var filters = spec.filters || {};
    var categoryOptions = S.deriveCategoryOptions(universe, filters);
    var seriesOptions = S.deriveSeriesOptions(universe, filters);
    var filtered = S.applyDimensionFilters(universe.rows, filters);
    var viewRows = S.applyScenarioPriceOverlay(filtered, spec.overrides || {}, site, spec.today);
    var thr = spec.thresholdC === undefined ? 800 : spec.thresholdC;
    var arch = S.derivePriceArchitecture(viewRows, thr);
    return {
      site: site,
      universe: universe,
      categoryOptions: categoryOptions,
      seriesOptions: seriesOptions,
      filters: filters,
      rows: viewRows,
      architecture: arch,
      threshold_c: thr,
      scenario: {
        permitted: site.scenario_permitted,
        refusal: site.scenario_refusal,
        active: S.scenarioActiveForSite(spec.overrides, site),
        override_count: S.scenarioCount(spec.overrides),
        storage: S.SCENARIO_STORAGE,
        survives_reload: S.SCENARIO_SURVIVES_RELOAD
      },
      pipeline: ['deriveSiteIdentity', 'getEligibleProductUniverse', 'deriveCategoryOptions',
        'applyDimensionFilters', 'applyScenarioPriceOverlay', 'derivePriceArchitecture']
    };
  };

  global.PSB_SELECTORS = S;
}(this));
