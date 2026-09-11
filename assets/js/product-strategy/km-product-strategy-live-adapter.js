/**
 * ================================================================================================================
 * KM · PRODUCT STRATEGY — THE LIVE SOURCE ADAPTER   (PRODUCT-STRATEGY-P1-B5 §4, §5, §6)
 * ================================================================================================================
 *
 * `PSB_CONTRACT.OperationDbProductStrategyDataAdapter` has existed since P0 as a DEFINED, DISABLED object that
 * returned SOURCE_NOT_CONNECTED and made no request, with a written reason: three of the six source tables had
 * no bounded read owner. P1-B1 built that owner (`productPricing.workspace.get`), P1-B3 froze its response at
 * schema contract version 2 and proved the package read-only against production. This file is the enabled
 * implementation of that reserved seam, and nothing else about the board changes to accept it.
 *
 * THE SEAM WAS ALREADY THERE, WHICH IS WHY THIS IS NOT A REWRITE. prototype.js says it out loud at boot:
 * "THE ONE PLACE AN ADAPTER IS CHOSEN. Everything above this line is adapter-agnostic." Nine references to the
 * preview fixture in a 4,600-line renderer, and eight of them are the fixture's own self-test. The integration
 * is a data-source swap.
 *
 * ------------------------------------------------------------------------------------------------------------
 * WHY `load()` IS SYNCHRONOUS OVER AN ASYNCHRONOUS READ, AND WHY THAT IS THE RIGHT WAY ROUND
 *
 * The contract's method is `load(filters) -> LoadResult`, called from inside a render. The accessor returns a
 * Promise. Something has to bridge them, and there are only two places to put the bridge:
 *
 *   · make `load()` async — every caller becomes async, the renderer learns about the network, and a chart can
 *     now be half-drawn while a second read is in flight; or
 *   · FETCH FIRST, THEN MOUNT. `fromResponse()` builds an adapter over one response that has already arrived.
 *
 * The second is chosen, and the reason is not convenience. An adapter that can answer differently on two calls
 * within one render is an adapter that can put one site's rows under another site's heading — the single bug
 * this whole feature was built to prevent. A snapshot cannot do that: `load()` is a pure function of the
 * response it was constructed with, it makes no request, and it returns the same LoadResult every time.
 *
 * `fetch()` is the thin async half, and it is the ONLY part of this file that touches the transport.
 *
 * ------------------------------------------------------------------------------------------------------------
 * FAIL CLOSED, AND WHAT THAT COSTS
 *
 * Exactly one state yields rows: READY. Every other state returns `rows: []` with the state named. That is
 * deliberately harsher than it needs to be for two of them, and §5 says so:
 *
 *   · SOURCE_PARTIALLY_READABLE means a read could not see all of a table. The rows it DID see are real, and
 *     showing them would be showing a price comparison drawn from part of a population, with no way for a
 *     reader to know which part. A partial answer to "which product is priced wrong" is not a partial answer —
 *     it is a confident wrong one, because the product that is missing is exactly the one nobody checks.
 *   · STOP_DATA_INTEGRITY means an identity is ambiguous, so a join may have attached to the wrong product.
 *     Every number downstream inherits that, including the ones that look fine.
 *
 * SCHEMA_CONTRACT_MISMATCH is this file's own addition to the stop list. `km-product-pricing-adapter` already
 * REPORTS a version it was not written against; it does not refuse, because a pure adapter's job is to say what
 * it saw. Refusing is a decision about what a person is allowed to be shown, and it belongs here, at the seam
 * that hands rows to a chart. A response shaped for a contract this code has never read may be missing a field
 * the selectors index into, and "mostly adapted" is how a wrong number reaches a price axis.
 *
 * CONTRACT_MISMATCH is checked, not assumed. The rows are validated against all 23 contract fields before they
 * are handed over, because `km-product-pricing-adapter` and `psb-selectors` were written against each other's
 * documentation rather than against each other, and a field that was renamed on one side would otherwise
 * surface as a blank column rather than as a refusal.
 *
 * ------------------------------------------------------------------------------------------------------------
 * WHAT THIS FILE WILL NOT DO
 *
 * There is NO fixture in it, no import of one, no branch that could reach one, and no string that names one.
 * A read that failed is a state to display. The preview fixture exists to demonstrate a layout with numbers
 * nobody will act on; reached through a failure path it becomes a meeting shown fiction, at the exact moment
 * when the people in the room have the least reason to doubt the screen.
 *
 * It also does not narrow, filter, sort, aggregate or complete anything. The server bounds the scope, the
 * pricing adapter closes the six shape gaps, and `psb-selectors` owns every derivation. This file maps one
 * vocabulary onto another and decides whether a chart may be drawn at all.
 * ================================================================================================================
 */
(function (root) {
  'use strict';

  var L = {};

  L.ID = 'OPERATION_DB';
  L.BUILD = 'PRODUCT-STRATEGY-P1-B5';

  /** The server's vocabulary (P1-B3, PPW_SOURCE_STATES_) — four servable plus the client-only one. */
  L.SERVER_SOURCE_STATES = ['READY', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY'];
  L.CLIENT_ONLY_SOURCE_STATE = 'SOURCE_NOT_CONNECTED';

  /** The LoadResult states this adapter can return. `OK` is the contract's word for "analysable". */
  L.LOAD_STATES = ['OK', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY',
    'SOURCE_NOT_CONNECTED', 'FEATURE_DISABLED', 'SCHEMA_CONTRACT_MISMATCH', 'CONTRACT_MISMATCH'];

  /**
   * THE UI MATRIX, AS DATA. §5 asks for one behaviour per state; stating it as a table means a test can
   * assert it and a renderer can read it, instead of both of them re-deriving it from prose.
   *
   * `may_analyse` is the only field a caller needs to decide whether to draw. `uses_fixture` is false on
   * every row and is present precisely so that its being false is checkable rather than merely true.
   */
  L.UX = {
    OK: { may_analyse: true, uses_fixture: false, severity: 'none',
      headline: 'Analysis available.' },
    SOURCE_EMPTY: { may_analyse: false, uses_fixture: false, severity: 'info',
      headline: 'No products are listed for this scope.',
      detail: 'The source was read and this site has nothing in it. That is a measurement, not a failure.' },
    SOURCE_PARTIALLY_READABLE: { may_analyse: false, uses_fixture: false, severity: 'stop',
      headline: 'Analysis stopped — part of the source could not be read.',
      detail: 'A price comparison drawn from part of a population is a confident wrong answer, because the'
        + ' product that is missing is the one nobody checks. The unreadable sources are named below.' },
    STOP_DATA_INTEGRITY: { may_analyse: false, uses_fixture: false, severity: 'stop',
      headline: 'Analysis stopped — an identity in the source is ambiguous.',
      detail: 'A join may have attached to the wrong product, so every number downstream inherits it,'
        + ' including the ones that look correct. The integrity findings are named below.' },
    SOURCE_NOT_CONNECTED: { may_analyse: false, uses_fixture: false, severity: 'stop',
      headline: 'Not connected to the Operation System database.',
      detail: 'No server answered. Nothing is shown in place of the data that was not read.' },
    FEATURE_DISABLED: { may_analyse: false, uses_fixture: false, severity: 'info',
      headline: 'Product Strategy is not enabled yet.',
      detail: 'The capability is off, so no request was sent.' },
    SCHEMA_CONTRACT_MISMATCH: { may_analyse: false, uses_fixture: false, severity: 'stop',
      headline: 'Analysis stopped — the response is a shape this build was not written against.',
      detail: 'Adapting it anyway would mean reading fields that may have moved, which is how a wrong'
        + ' number reaches a price axis.' },
    CONTRACT_MISMATCH: { may_analyse: false, uses_fixture: false, severity: 'stop',
      headline: 'Analysis stopped — the rows do not have the shape the board requires.',
      detail: 'Named fields are absent or null where the contract forbids it; the affected fields are listed.' }
  };

  function isObj(v) { return !!v && typeof v === 'object' && !(v instanceof Array); }
  function isArr(v) { return v instanceof Array; }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  function contractOf(deps) {
    var c = (deps && deps.contract) || root.PSB_CONTRACT;
    if (!c) throw new Error('PSB_CONTRACT is not loaded — psb-data-contract.js must precede this file');
    return c;
  }
  function pricingAdapterOf(deps) {
    var a = (deps && deps.pricingAdapter) || root.KM_PRODUCT_PRICING_ADAPTER;
    if (!a) throw new Error('KM_PRODUCT_PRICING_ADAPTER is not loaded');
    return a;
  }

  /** Every LoadResult leaves through here, so no branch can forget a field the contract names. */
  function result(state, rows, refusals, provenance, notice, appliedFilters, capped, fields, extra) {
    var out = {
      state: state,
      rows: rows,
      row_count: rows.length,
      fields: fields,
      refusals: refusals,
      provenance: provenance,
      notice: notice,
      applied_filters: appliedFilters,
      capped: capped === true
    };
    if (isObj(extra)) {
      Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    }
    return out;
  }

  /**
   * Map the pricing adapter's view of one response onto a LoadResult state.
   *
   * ORDER IS THE WHOLE RULE HERE. A response can be READY *and* carry a contract version this build has
   * never seen; it can be READY and carry rows that fail the shape check. The stop that is checked first
   * is the one reported, so the harshest, most structural reason wins — a reader told "the shape is wrong"
   * can act on it, where a reader told "0 products" goes looking for the products.
   */
  function stateOf(adapted, pricingAdapter, contract) {
    var refusals = [];

    // 1. The accessor's own refusal, which never reached a server.
    var firstRefusal = (isArr(adapted.refusals) && adapted.refusals.length)
      ? str(adapted.refusals[0].code) : '';
    if (firstRefusal === 'FEATURE_DISABLED') {
      return { state: 'FEATURE_DISABLED', refusals: adapted.refusals.slice() };
    }

    // 2. A shape this build was not written against. Checked BEFORE the source state, because a state
    //    read out of an unrecognised shape is not evidence about the source.
    var seen = adapted.provenance ? adapted.provenance.schema_contract_seen : null;
    if (seen !== null && seen !== undefined && seen !== pricingAdapter.EXPECTED_SCHEMA_CONTRACT_VERSION) {
      return { state: 'SCHEMA_CONTRACT_MISMATCH',
        refusals: [{ code: 'SCHEMA_CONTRACT_VERSION_MISMATCH',
          detail: 'expected ' + pricingAdapter.EXPECTED_SCHEMA_CONTRACT_VERSION + ', saw ' + seen,
          subject: seen }] };
    }

    // 3. The server's measured state. It is authoritative wherever it gave one.
    var st = str(adapted.sourceState);
    if (st === L.CLIENT_ONLY_SOURCE_STATE) {
      return { state: 'SOURCE_NOT_CONNECTED',
        refusals: isArr(adapted.refusals) ? adapted.refusals.slice() : [] };
    }
    if (st !== '' && L.SERVER_SOURCE_STATES.indexOf(st) < 0) {
      // A state nobody froze. Treated as a shape problem rather than believed.
      return { state: 'SCHEMA_CONTRACT_MISMATCH',
        refusals: [{ code: 'UNKNOWN_SOURCE_STATE', detail: 'the response carries a state this build'
          + ' does not know', subject: st }] };
    }
    if (st === '') {
      // No state at all: either an explicit null (the server refused before reading) or a response that
      // predates the contract. Both are "no measurement", and neither is an empty source.
      return { state: 'SOURCE_NOT_CONNECTED',
        refusals: (isArr(adapted.refusals) && adapted.refusals.length)
          ? adapted.refusals.slice()
          : [{ code: 'NO_SOURCE_STATE_MEASURED', detail: 'the response carries no sourceState',
            subject: null }] };
    }
    if (st !== 'READY') {
      return { state: st, refusals: isArr(adapted.refusals) ? adapted.refusals.slice() : [] };
    }

    // 4. READY, so the rows must actually have the shape the board indexes into.
    var check = contract.validateRows(adapted.rows);
    if (!check.ok) {
      check.mismatches.slice(0, 20).forEach(function (m) {
        refusals.push({ code: 'CONTRACT_MISMATCH', detail: 'row ' + m.index
          + ' missing [' + m.detail.missing_fields.join(', ') + ']'
          + ' null-violating [' + m.detail.null_violations.join(', ') + ']',
          subject: m.identity });
      });
      return { state: 'CONTRACT_MISMATCH', refusals: refusals };
    }
    return { state: 'OK', refusals: [] };
  }

  /**
   * BUILD AN ADAPTER OVER ONE RESPONSE THAT HAS ALREADY ARRIVED. Pure: no clock, no transport, no storage.
   *
   * `opts.asOf` is a parameter and is passed straight through to the pricing adapter, for the same reason
   * that one reads a measured box rather than the window: the effective promotion depends on the date, so
   * the date is an input and the same response on the same date gives the same rows forever.
   */
  L.fromResponse = function (response, opts) {
    opts = isObj(opts) ? opts : {};
    var contract = contractOf(opts);
    var pricingAdapter = pricingAdapterOf(opts);
    var fields = contract.FIELD_NAMES.slice();

    var adapted = pricingAdapter.adapt(response, { asOf: opts.asOf });
    var verdict = stateOf(adapted, pricingAdapter, contract);
    var ux = L.UX[verdict.state] || L.UX.SOURCE_NOT_CONNECTED;
    var rows = verdict.state === 'OK' ? adapted.rows : [];

    var provenance = {
      adapter: L.ID,
      build: L.BUILD,
      values_are: verdict.state === 'OK' ? 'LIVE' : 'NONE',
      connected: verdict.state !== 'SOURCE_NOT_CONNECTED' && verdict.state !== 'FEATURE_DISABLED',
      connected_to_db: verdict.state === 'OK',
      requests_made: opts.requestsMade === undefined ? 1 : opts.requestsMade,
      // NO FALLBACK EXISTS IN THIS FILE. Stated as data so a suite asserts the property, not the prose.
      fixture_fallback: false,
      preview_fallback: false,
      price_source: verdict.state === 'OK' ? 'OPERATION_SYSTEM_DATABASE' : 'NONE',
      /* P1-B7 — BOTH OF THESE ARE PRINTED, in one line of Advanced Details ("identity … · verified
         images …"). Without them that line said `undefined` twice: a panel that exists to say where
         the numbers came from, reporting that it did not know. The identity is not derived here and
         not guessed — it is the membership table the server read. The image count is a count of the
         rows in hand, and it is zero whenever there are no rows, which is the truthful answer for
         every state except OK. */
      identity_source: verdict.state === 'OK' ? 'OPERATION_SYSTEM_DATABASE' : 'NONE',
      images_verified: rows.filter(function (r) {
        return r && r.image_identity_status === 'VERIFIED_DB_MAPPING';
      }).length,
      source_state: adapted.sourceState === undefined ? null : adapted.sourceState,
      schema_contract_expected: pricingAdapter.EXPECTED_SCHEMA_CONTRACT_VERSION,
      schema_contract_seen: adapted.provenance ? adapted.provenance.schema_contract_seen : null,
      pricing_adapter: pricingAdapter.CONTRACT_ID,
      as_of: adapted.provenance ? adapted.provenance.asOf : null,
      schema: adapted.schema === undefined ? null : adapted.schema,
      scope: adapted.scope === undefined ? null : adapted.scope
    };

    var notice = ux.headline;

    return result(verdict.state, rows, verdict.refusals, provenance, notice,
      isArr(opts.appliedFilters) ? opts.appliedFilters.slice() : [],
      !!(adapted.pagination && adapted.pagination.has_more === true),
      fields,
      {
        // Carried through because the board's menus and its Data Quality ledger are the server's answers,
        // not this file's derivations. Withheld options stay null: null and [] are different facts.
        filterOptions: adapted.filterOptions === undefined ? null : adapted.filterOptions,
        counts: adapted.counts === undefined ? null : adapted.counts,
        findings: isArr(adapted.findings) ? adapted.findings.slice() : [],
        dataQuality: isArr(adapted.dataQuality) ? adapted.dataQuality.slice() : [],
        pagination: adapted.pagination === undefined ? null : adapted.pagination,
        may_analyse: ux.may_analyse === true,
        ux: ux
      });
  };

  /**
   * THE ADAPTER OBJECT THE BOARD MOUNTS, and the two methods it is asked for.
   *
   * `loadCanonical()` is the one the RENDERER calls — psb-board-ui.js `reload()`, and it has been since
   * P1-B2A moved the category menu out of the adapter and into the pipeline. This file used to say it
   * offered "the same interface as the preview one, so ADAPTER.load(filters) in the renderer does not
   * learn that anything changed", which named a method the renderer does not call; mounting the board on
   * a live adapter threw on its first render, for two rounds, because nothing ever mounted it.
   *
   * BOTH RETURN THE SAME SNAPSHOT, AND THAT IS CORRECT HERE RATHER THAN LAZY. In the preview fixture the
   * two differ because it holds every site: canonical is the universe, load(filters) is a view of it. The
   * server already scoped this response — productPricing.workspace.get is site-scoped BY CONSTRUCTION,
   * which is the single reason one site's rows can never appear under another site's heading — so the
   * canonical universe for this board IS the response. There is nothing left to narrow, and narrowing it
   * again here would be a second membership rule.
   */
  L.createFromResponse = function (response, opts) {
    var snapshot = L.fromResponse(response, opts);
    return {
      id: L.ID,
      enabled: true,
      /** Pure, and the SAME answer every call — see the note at the top about why that is the point. */
      loadCanonical: function () { return snapshot; },
      load: function () { return snapshot; },
      snapshot: snapshot
    };
  };

  /**
   * THE ONLY ASYNCHRONOUS FUNCTION HERE, and the only one that touches the transport.
   *
   * It never throws: an unreachable accessor is a STATE. A thrown exception at a data seam becomes a blank
   * page with a console message nobody reads, which is strictly worse than a sentence saying what happened.
   */
  L.fetch = function (params, opts) {
    opts = isObj(opts) ? opts : {};
    var accessor = opts.accessor
      || (root.KM && root.KM.productPricingWorkspace);
    if (!accessor || typeof accessor.get !== 'function') {
      return Promise.resolve(L.createFromResponse(
        { success: true, data: null, errors: [{ code: 'ACCESSOR_UNAVAILABLE' }] },
        { asOf: opts.asOf, requestsMade: 0, contract: opts.contract,
          pricingAdapter: opts.pricingAdapter }));
    }
    return Promise.resolve(accessor.get(params, { signal: opts.signal }))
      .then(function (env) {
        return L.createFromResponse(env, { asOf: opts.asOf, requestsMade: 1,
          contract: opts.contract, pricingAdapter: opts.pricingAdapter,
          appliedFilters: opts.appliedFilters });
      })
      .catch(function (e) {
        return L.createFromResponse(
          { success: false, errors: [{ code: 'SOURCE_NOT_CONNECTED',
            detail: String((e && e.message) || e) }] },
          { asOf: opts.asOf, requestsMade: 1, contract: opts.contract,
            pricingAdapter: opts.pricingAdapter });
      });
  };

  /** The boundary as data, the same discipline the pricing adapter and the layout engine publish. */
  L.CONTRACT = {
    // P1-B7 — the two methods the renderer and the page controller each call, named so a future
    // change to either side is a failing assertion rather than a TypeError on first render.
    board_entry_point: 'loadCanonical',
    page_entry_point: 'load',
    canonical_equals_load: true,
    id: L.ID,
    build: L.BUILD,
    implements: 'PSB_CONTRACT.ADAPTER_INTERFACE',
    replaces: 'PSB_CONTRACT.OperationDbProductStrategyDataAdapter (defined and disabled since P0)',
    load_is_synchronous: true,
    load_is_pure: true,
    reads_the_clock: false,
    as_of_is_a_parameter: true,
    fixture_fallback: false,
    only_state_yielding_rows: 'OK',
    stops_before_drawing: ['SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY',
      'SOURCE_NOT_CONNECTED', 'FEATURE_DISABLED', 'SCHEMA_CONTRACT_MISMATCH', 'CONTRACT_MISMATCH'],
    derives_nothing: 'every narrowing, grouping and finding belongs to psb-selectors.js',
    owns: 'the mapping from the server source-state vocabulary onto the board LoadResult vocabulary,'
      + ' and the decision whether a chart may be drawn at all'
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = L; }
  root.KM_PRODUCT_STRATEGY_LIVE_ADAPTER = L;
}(typeof globalThis !== 'undefined' ? globalThis : this));
