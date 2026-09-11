/**
 * ================================================================================================================
 * KM · PRODUCT STRATEGY — THE SITE UNIVERSE, CLIENT SIDE            (PRODUCT-STRATEGY-P1-B6 §5, §7)
 * ================================================================================================================
 *
 * P1-B5 recorded the gap this closes: the board derives Company -> Country -> Marketplace from the rows its
 * adapter hands over, because the preview fixture handed over every site it knew. `productPricing.workspace.get`
 * is site-scoped BY CONSTRUCTION and cannot publish the set of sites to choose from — that scoping is the single
 * reason one site's rows can never appear under another site's heading, so it is not a limitation to route
 * around.
 *
 * This module turns one `productPricing.siteUniverse.get` response into the three menus, and decides what a
 * scope becomes when an upper tier changes. It is PURE: no transport, no clock, no storage, no DOM. The async
 * half — and the staleness rule that goes with it — lives in the page controller.
 *
 * ------------------------------------------------------------------------------------------------------------
 * WHY NARROWING IS A FUNCTION AND NOT A RENDER-TIME FILTER
 *
 * P1-B4 found this defect in the prototype and fixed it there: the menus read the whole fixture, so Country
 * listed every country whatever Company was chosen, and an invalid selection was cleared AFTER it had been
 * made. That is a repair where a constraint belongs, and the menu was offering journeys that end in an empty
 * chart. The same rule applies here with a sharper edge, because now an invalid journey ends in a REQUEST:
 * choosing a marketplace that does not exist for the chosen country would send a scope the server must refuse.
 *
 * So `narrow` answers one question — given a universe and what a person has picked, what is the scope now —
 * and it clears downstream values that the new upstream value does not offer. It never clears upward: choosing
 * a marketplace must not revise the country that produced it.
 *
 * ------------------------------------------------------------------------------------------------------------
 * ONE OPTION IS A FACT, NOT A CHOICE (§7). A tier with exactly one value is resolved to it and reported as
 * context rather than as a menu. A dropdown with one item is a control that cannot do anything, and it reads
 * as a decision still to be made. Note what this is NOT: it is not an auto-selection of the FIRST of several.
 * `autoResolved` names the tiers where it happened so a renderer can show them as text and a test can tell the
 * two apart.
 *
 * NO FIXTURE, NO DEFAULT, NO GUESS. There is no site list in this file. An empty universe produces an empty
 * menu and a state, never a demonstration site — and `selectable` comes from the server, which derived it from
 * the status gate the workspace read actually applies.
 * ================================================================================================================
 */
(function (root) {
  'use strict';

  var U = {};

  U.BUILD = 'PRODUCT-STRATEGY-P1-B6';
  U.EXPECTED_CONTRACT_VERSION = 1;
  U.TIERS = ['company', 'country', 'marketplace'];

  /**
   * TWO VOCABULARIES, NAMED SEPARATELY, BECAUSE THEY ARE NOT THE SAME LIST.
   *
   * The SERVER says `READY`; this module says `OK`. Everything else they share. Folding them into one
   * list was this file's first bug: `READY` was absent from it, so every healthy response failed the
   * "is this a state I know?" test and was reported as a shape problem — the code was right about
   * mapping READY to OK a few lines later and never got there.
   */
  U.SERVER_STATES = ['READY', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY'];

  /** The states THIS module reports. `OK` is the only one that yields sites. */
  U.STATES = ['OK', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY',
    'SOURCE_NOT_CONNECTED', 'FEATURE_DISABLED', 'SCHEMA_CONTRACT_MISMATCH'];

  U.UX = {
    OK: { may_choose: true, severity: 'none', headline: 'Choose a site.' },
    SOURCE_EMPTY: { may_choose: false, severity: 'info',
      headline: 'No sites are listed.',
      detail: 'The membership table was read and holds no usable site identity. That is a measurement,'
        + ' not a failure — and nothing is shown in place of it.' },
    SOURCE_PARTIALLY_READABLE: { may_choose: false, severity: 'stop',
      headline: 'The site list could not be read completely.',
      detail: 'A partial list is indistinguishable from a shorter one, and a site missing from a menu'
        + ' looks exactly like a site that does not exist.' },
    STOP_DATA_INTEGRITY: { may_choose: false, severity: 'stop',
      headline: 'The site list cannot be trusted — an identity in the source is ambiguous.',
      detail: 'A duplicate listing id or one site spelled two ways means a later join may attach to the'
        + ' wrong product, so every count that follows inherits it.' },
    SOURCE_NOT_CONNECTED: { may_choose: false, severity: 'stop',
      headline: 'Not connected to the Operation System database.',
      detail: 'No server answered. Nothing is shown in place of the list that was not read.' },
    FEATURE_DISABLED: { may_choose: false, severity: 'info',
      headline: 'Product Strategy is not enabled yet.',
      detail: 'The capability is off, so no request was sent.' },
    SCHEMA_CONTRACT_MISMATCH: { may_choose: false, severity: 'stop',
      headline: 'The site list is a shape this build was not written against.',
      detail: 'Reading it anyway would mean trusting fields that may have moved.' }
  };

  function isObj(v) { return !!v && typeof v === 'object' && !(v instanceof Array); }
  function isArr(v) { return v instanceof Array; }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  /** One response -> the universe a menu can be built from, or a state and no sites. */
  U.adapt = function (response) {
    var out = {
      state: null, sites: [], hierarchy: null, refusals: [], findings: [],
      completeness: null, schema: null,
      provenance: { module: U.BUILD, fixture_fallback: false,
        contract_expected: U.EXPECTED_CONTRACT_VERSION, contract_seen: null }
    };

    if (!isObj(response)) {
      out.state = 'SOURCE_NOT_CONNECTED';
      out.refusals = [{ code: 'RESPONSE_NOT_AN_OBJECT', detail: null, subject: null }];
      return out;
    }
    var d = response.data;
    if (response.success !== true || !isObj(d)) {
      out.state = 'SOURCE_NOT_CONNECTED';
      out.refusals = [{ code: 'SERVER_REPORTED_FAILURE', detail: null, subject: null }];
      return out;
    }

    out.refusals = isArr(d.refusals) ? d.refusals.slice() : [];
    out.findings = isArr(d.findings) ? d.findings.slice() : [];
    out.completeness = d.completeness === undefined ? null : d.completeness;
    out.schema = d.schema === undefined ? null : d.schema;

    var first = out.refusals.length ? str(out.refusals[0].code) : '';
    if (first === 'FEATURE_DISABLED') { out.state = 'FEATURE_DISABLED'; return out; }

    var seen = (isObj(d.schema) && d.schema.contract_version !== undefined)
      ? d.schema.contract_version : null;
    out.provenance.contract_seen = seen;
    // CHECKED BEFORE THE STATE, because a state read out of an unrecognised shape is not evidence.
    if (seen !== null && seen !== U.EXPECTED_CONTRACT_VERSION) {
      out.state = 'SCHEMA_CONTRACT_MISMATCH';
      return out;
    }

    var st = str(d.sourceState);
    if (st === 'SOURCE_NOT_CONNECTED') {
      // A server cannot honestly send this; the accessor already refuses such a response, and this is
      // the second wall rather than the first.
      out.state = 'SOURCE_NOT_CONNECTED';
      out.refusals.push({ code: 'SERVER_SENT_A_CLIENT_ONLY_STATE', detail: null, subject: st });
      return out;
    }
    // An explicit null, or no field at all: the server refused before reading, so nothing was MEASURED.
    // That is not an empty source — empty is the one answer a caller responds to by moving on.
    if (st === '') { out.state = 'SOURCE_NOT_CONNECTED'; return out; }
    // A state nobody froze is a shape problem, not a state. Believing it would mean trusting a
    // vocabulary this build has never read.
    if (U.SERVER_STATES.indexOf(st) < 0) { out.state = 'SCHEMA_CONTRACT_MISMATCH'; return out; }
    if (st !== 'READY') { out.state = st; return out; }

    out.state = 'OK';
    out.sites = (isArr(d.sites) ? d.sites : []).slice();
    out.hierarchy = isObj(d.hierarchy) ? d.hierarchy : null;
    return out;
  };

  /** The companies offered. Ordering is the server's; this file never re-sorts a published order. */
  U.companies = function (universe) {
    if (!universe || universe.state !== 'OK' || !universe.hierarchy) return [];
    return (universe.hierarchy.companies || []).slice();
  };

  U.countriesFor = function (universe, company) {
    if (!universe || universe.state !== 'OK' || !universe.hierarchy) return [];
    var m = universe.hierarchy.countries_by_company || {};
    return (m[str(company)] || []).slice();
  };

  U.marketplacesFor = function (universe, company, country) {
    if (!universe || universe.state !== 'OK' || !universe.hierarchy) return [];
    var m = universe.hierarchy.marketplaces_by_country || {};
    return (m[str(company) + '|' + str(country)] || []).slice();
  };

  /** The site record for a complete scope, or null. `selectable` is the server's answer, not ours. */
  U.siteFor = function (universe, scope) {
    if (!universe || universe.state !== 'OK' || !isObj(scope)) return null;
    var found = null;
    universe.sites.forEach(function (s) {
      if (str(s.company) === str(scope.company) && str(s.country) === str(scope.country)
        && str(s.marketplace) === str(scope.marketplace)) found = s;
    });
    return found;
  };

  /**
   * GIVEN A UNIVERSE AND A PARTIAL CHOICE, WHAT IS THE SCOPE NOW.
   *
   * Downstream values that the new upstream value does not offer are DROPPED, and the dropped tiers are
   * named. That naming matters: a renderer that knows Marketplace was cleared can say so, where one that
   * only sees a blank field looks like it lost the value on its own.
   *
   * It never revises upward. Choosing a marketplace must not change the country that produced the list
   * it was chosen from — a control that edits its own input is a control nobody can predict.
   */
  U.narrow = function (universe, desired) {
    desired = isObj(desired) ? desired : {};
    var scope = { company: null, country: null, marketplace: null };
    var options = { company: [], country: [], marketplace: [] };
    var cleared = [];
    var autoResolved = [];

    options.company = U.companies(universe);
    var wantCompany = str(desired.company);
    if (wantCompany !== '' && options.company.indexOf(wantCompany) >= 0) {
      scope.company = wantCompany;
    } else {
      if (wantCompany !== '') cleared.push('company');
      // ONE OPTION IS A FACT. Not "the first of several" — exactly one, or nothing is chosen for them.
      if (options.company.length === 1) {
        scope.company = options.company[0];
        autoResolved.push('company');
      }
    }

    if (scope.company !== null) {
      options.country = U.countriesFor(universe, scope.company);
      var wantCountry = str(desired.country);
      if (wantCountry !== '' && options.country.indexOf(wantCountry) >= 0) {
        scope.country = wantCountry;
      } else {
        if (wantCountry !== '') cleared.push('country');
        if (options.country.length === 1) {
          scope.country = options.country[0];
          autoResolved.push('country');
        }
      }
    } else if (str(desired.country) !== '') {
      cleared.push('country');
    }

    if (scope.company !== null && scope.country !== null) {
      options.marketplace = U.marketplacesFor(universe, scope.company, scope.country);
      var wantMarket = str(desired.marketplace);
      if (wantMarket !== '' && options.marketplace.indexOf(wantMarket) >= 0) {
        scope.marketplace = wantMarket;
      } else {
        if (wantMarket !== '') cleared.push('marketplace');
        if (options.marketplace.length === 1) {
          scope.marketplace = options.marketplace[0];
          autoResolved.push('marketplace');
        }
      }
    } else if (str(desired.marketplace) !== '') {
      cleared.push('marketplace');
    }

    var complete = scope.company !== null && scope.country !== null && scope.marketplace !== null;
    return {
      scope: scope,
      options: options,
      cleared: cleared,
      autoResolved: autoResolved,
      // A tier a person cannot change is context, not a control (§7).
      isContext: {
        company: options.company.length === 1,
        country: scope.company !== null && options.country.length === 1,
        marketplace: scope.country !== null && options.marketplace.length === 1
      },
      complete: complete,
      site: complete ? U.siteFor(universe, scope) : null
    };
  };

  /** Did the site change between two scopes? Used to decide what a switch must clear (§8). */
  U.sameSite = function (a, b) {
    if (!isObj(a) || !isObj(b)) return false;
    return str(a.company) === str(b.company) && str(a.country) === str(b.country)
      && str(a.marketplace) === str(b.marketplace);
  };

  U.CONTRACT = {
    build: U.BUILD,
    pure: true,
    reads_the_clock: false,
    fixture_fallback: false,
    site_list_in_this_file: false,
    derives_universe_from_workspace_response: false,
    narrows_downstream_only: true,
    single_option_becomes_context: true,
    auto_selects_first_of_several: false,
    ordering_authority: 'the server; this file never re-sorts a published order',
    selectability_authority: 'the server, derived from the default status gate'
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = U; }
  root.KM_PRODUCT_STRATEGY_SITE_UNIVERSE = U;
}(typeof globalThis !== 'undefined' ? globalThis : this));
