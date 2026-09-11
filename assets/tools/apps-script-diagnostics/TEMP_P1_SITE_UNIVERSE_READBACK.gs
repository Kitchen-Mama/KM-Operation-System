/**
 * ==========================================================================================================
 * TEMP · P1-B6 SITE UNIVERSE READBACK — READ ONLY, ADMIN ENTRY, NO PARAMETERS
 * ==========================================================================================================
 *
 * RUN_P1_SITE_UNIVERSE_READBACK()
 *
 * Filed here and not in the runtime mirror for the reason the action-registry audit gave P1-B3: a one-off
 * admin census owns no action, no table and no schema, so it is not a runtime module. It has no router entry
 * and no web entry point. A person opens the editor and presses Run.
 *
 * ----------------------------------------------------------------------------------------------------------
 * WHAT IT PROVES, AND WHY EACH PROOF IS SHAPED THE WAY IT IS
 *
 * 1. THE GATE, BY CALLING THE REAL ENDPOINT AND EXPECTING TO BE REFUSED. It invokes
 *    handleProductPricingSiteUniverseGet_ with the flag as it actually is and asserts FEATURE_DISABLED,
 *    dbOpened false, tablesRead 0. It does NOT set the flag to true, not even briefly: a readback that
 *    flipped it would measure a pipeline that is not the deployed one and would leave a bypass behind.
 *    *A live refusal is stronger evidence than a census taken around the gate.*
 *
 * 2. THE UNIVERSE, BY HANDING REAL TABLES TO THE PRODUCTION BUILDER. It reads marketplace_skus through the
 *    SAME io helper the endpoint uses — ppwDefaultIo_().readTable, which fails closed on a missing sheet or
 *    column — and passes the rows to ppwSiteUniverseBuild_, the shipped pure function. It does not compute
 *    eligibility its own way. *A census that computes its answer separately measures a pipeline nobody
 *    ships,* and would agree with production exactly until the day it mattered.
 *
 * 3. ZERO WRITES, BY NOT HAVING A WRITER. There is no setValue, setValues, appendRow, insert, delete, clear,
 *    createSheet, CacheService, PropertiesService or DriveApp call in this file, and the repo-side suite
 *    asserts that against the source with comments AND string literals stripped. `writes: 0` below is a
 *    DECLARED zero backed by that call graph — it is labelled as declared, not dressed up as measured.
 *
 * ----------------------------------------------------------------------------------------------------------
 * WHAT IT WILL NOT PRINT. No spreadsheet id, no sheet name beyond the one table it reads, no price, no
 * currency, no image or product URL, no marketplace_sku_id, no master SKU, no category, no series, and no
 * row of any table. It prints site IDENTITIES and COUNTS. A diagnostic that dumps rows into an execution log
 * has moved production data somewhere with different access rules than production data has.
 * ==========================================================================================================
 */

var P1B6_CHUNK_CHARS_ = 7000;
var P1B6_BUILD_ = 'PRODUCT-STRATEGY-P1-B6';

/** FNV-1a, the same shape 72_ uses, so two fingerprints of one input agree across the two files. */
function p1b6Hash_(s) {
  var h = 2166136261;
  s = String(s === undefined || s === null ? '' : s);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16).toUpperCase()).slice(-8);
}

/** Emit a long report in chunks that can be told apart from a truncated one. */
function p1b6Emit_(label, obj) {
  var text = JSON.stringify(obj, null, 2);
  var fp = p1b6Hash_(text);
  var total = Math.ceil(text.length / P1B6_CHUNK_CHARS_) || 1;
  for (var i = 0; i < total; i++) {
    Logger.log(label + ' [' + (i + 1) + '/' + total + '] fp=' + fp + ' len=' + text.length + '\n'
      + text.slice(i * P1B6_CHUNK_CHARS_, (i + 1) * P1B6_CHUNK_CHARS_));
  }
  return { chunks: total, fingerprint: fp, length: text.length };
}

function RUN_P1_SITE_UNIVERSE_READBACK() {
  var out = {
    readback: 'P1_B6_SITE_UNIVERSE',
    build: P1B6_BUILD_,
    endpoint_build: (typeof PPW_BUILD_VERSION_ !== 'undefined') ? PPW_BUILD_VERSION_ : null,
    action: (typeof PPW_SITE_UNIVERSE_ACTION_ !== 'undefined') ? PPW_SITE_UNIVERSE_ACTION_ : null,
    contract_version: (typeof PPW_SITE_UNIVERSE_CONTRACT_VERSION_ !== 'undefined')
      ? PPW_SITE_UNIVERSE_CONTRACT_VERSION_ : null,

    // MEASURED vs DECLARED, labelled. rows_modified is a lastRow/lastColumn delta actually taken; the
    // writer counts are declared and backed by the call graph, and saying which is which is the point.
    read_only: true,
    writes: 0,                    // DECLARED — no writer exists in this file
    writer_calls: 0,              // DECLARED — asserted against the source by the repo suite
    sheets_created: 0,            // DECLARED
    rows_modified: null,          // MEASURED below
    zero_write_basis: { writes: 'DECLARED_NO_WRITER_IN_FILE', rows_modified: 'MEASURED_EXTENT_DELTA' },

    gate_proof: null,
    universe: null,
    completeness: null,
    evidence_gaps: [],
    verdict: null,
    next_action: null
  };

  try {
    // ---- PROOF 1. THE GATE, AT THE REAL ENDPOINT, WITH THE FLAG AS IT IS. ------------------------------
    var flagNow = (typeof productStrategyEnabled_ === 'function') ? productStrategyEnabled_() : null;
    var gateResp = handleProductPricingSiteUniverseGet_({ requestId: 'REQ-READBACK-GATE' });
    var gateMeta = (gateResp && gateResp.meta) || {};
    out.gate_proof = {
      feature_flag: flagNow,
      refusal_code: gateMeta.refusalCode === undefined ? null : gateMeta.refusalCode,
      db_opened: gateMeta.dbOpened === true,
      tables_read: gateMeta.tablesRead === undefined ? null : gateMeta.tablesRead,
      flag_was_modified_by_this_readback: false,
      proof_is: 'the real endpoint was called and refused; the flag was never written'
    };

    if (flagNow === true) {
      // NOT AN ERROR, BUT NOT THIS READBACK'S SITUATION EITHER. It exists to prove the gate refuses.
      out.evidence_gaps.push('FLAG_IS_ENABLED_SO_THE_REFUSAL_PROOF_IS_NOT_AVAILABLE');
    } else if (gateMeta.refusalCode !== 'FEATURE_DISABLED' || gateMeta.dbOpened === true
      || gateMeta.tablesRead !== 0) {
      out.verdict = 'STOP_GATE_DID_NOT_REFUSE';
      out.next_action = 'INVESTIGATE_THE_FEATURE_GATE_BEFORE_ANYTHING_ELSE';
      p1b6Emit_('P1B6_SITE_UNIVERSE_READBACK', out);
      return out;
    }

    // ---- PROOF 2. THE UNIVERSE, THROUGH THE SAME HELPER AND THE SHIPPED BUILDER. -----------------------
    var io = ppwDefaultIo_();
    var ss = io.openTarget();
    var sheet = ss.getSheetByName('marketplace_skus');
    var beforeRows = sheet ? sheet.getLastRow() : null;
    var beforeCols = sheet ? sheet.getLastColumn() : null;

    var spec = PPW_SITE_UNIVERSE_TABLES_[0];
    var rows = io.readTable(ss, spec.name, spec.requiredCols);
    var capped = rows.length > PPW_SITE_UNIVERSE_MAX_;
    if (capped) rows = rows.slice(0, PPW_SITE_UNIVERSE_MAX_);

    // THE SHIPPED PURE BUILDER. Not a second implementation of the same rules.
    var built = ppwSiteUniverseBuild_(rows, Date.now(), capped);

    var afterRows = sheet ? sheet.getLastRow() : null;
    var afterCols = sheet ? sheet.getLastColumn() : null;
    out.rows_modified = (beforeRows === afterRows && beforeCols === afterCols) ? 0 : -1;

    // IDENTITIES AND COUNTS ONLY. Every field copied here is named explicitly, so a future field added to
    // the builder cannot arrive in this log without somebody deciding it should.
    out.universe = {
      source_state: built.sourceState,
      site_count: built.site_count,
      identity_authority: built.identity_authority,
      sites: (built.sites || []).map(function (s) {
        return {
          company: s.company, country: s.country, marketplace: s.marketplace,
          membership_row_count: s.membership_row_count,
          active_count: s.active_count, phasing_out_count: s.phasing_out_count,
          inactive_count: s.inactive_count, discontinued_count: s.discontinued_count,
          unknown_status_count: s.unknown_status_count, blank_id_count: s.blank_id_count,
          selectable: s.selectable, selectable_with_inactive: s.selectable_with_inactive,
          refusal_reasons: s.refusal_reasons
        };
      }),
      companies: built.hierarchy ? built.hierarchy.companies : null,
      countries_by_company: built.hierarchy ? built.hierarchy.countries_by_company : null,
      marketplaces_by_country: built.hierarchy ? built.hierarchy.marketplaces_by_country : null,
      excluded: built.excluded,
      findings: built.findings,
      refusals: built.refusals,
      table_fingerprint: built.schema ? built.schema.table : null,
      read_at: built.schema ? built.schema.read_at : null,
      publishes: built.publishes,
      does_not_publish: built.does_not_publish
    };
    out.completeness = built.completeness;

    if (built.completeness && built.completeness.capped === true) {
      out.evidence_gaps.push('SOURCE_ROW_CAP_REACHED_SO_THIS_IS_NOT_THE_WHOLE_UNIVERSE');
    }
    if (built.schema && built.schema.source_modified_at === null) {
      out.evidence_gaps.push('SOURCE_MODIFIED_AT_NOT_MEASURABLE_IN_THIS_DEPLOYMENT_SCOPE');
    }

    if (built.sourceState === 'READY') {
      out.verdict = 'P1_B6_SITE_UNIVERSE_READY';
      out.next_action = 'RECORD_THE_UNIVERSE_AND_WIRE_THE_SCOPE_LADDER';
    } else if (built.sourceState === 'STOP_DATA_INTEGRITY') {
      out.verdict = 'STOP_SITE_UNIVERSE_DATA_INTEGRITY';
      out.next_action = 'RESOLVE_THE_NAMED_IDENTITY_FINDINGS_BEFORE_ANY_SITE_MENU_IS_SHOWN';
    } else {
      out.verdict = 'SITE_UNIVERSE_' + built.sourceState;
      out.next_action = 'REPAIR_THE_NAMED_SOURCE_CONDITION_AND_RERUN';
    }
  } catch (e) {
    out.verdict = 'STOP_READBACK_FAILED';
    out.next_action = 'READ_THE_ERROR_TOKEN';
    out.error = { token: String((e && (e.safetyToken || e.apiCode)) || 'UNCLASSIFIED'),
      message: String((e && e.message) || e) };
  }

  var emitted = p1b6Emit_('P1B6_SITE_UNIVERSE_READBACK', out);
  out.report_chunks = emitted.chunks;
  out.report_fingerprint = emitted.fingerprint;
  out.report_length = emitted.length;
  return out;
}
