/**
 * TEMP_FC_EU_BFCM_RECONCILIATION_R1A_ENTRY.gs — FC-EU-BFCM-DATA-RECONCILIATION-R1A §2
 * PASTE · RUN · REMOVE. READ-ONLY. IT WRITES NOTHING.
 * ================================================================================================================
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE CENSUS
 * -----------------------------------------------
 * The census is a general instrument: it knows how to classify a graph and price a reconstruction, and it knows
 * nothing about THIS incident. Its own test suite enforces that — the only numeric literals in it are index
 * arithmetic and one named percent denominator, so no cardinality and no commercial value can be written there.
 *
 * This file is the opposite: it holds the two things the operator froze for this one repair, in one place, where
 * they can be read and changed without touching implementation code.
 *
 * HOW TO RUN
 * ----------
 *   1. Paste BOTH files into the Apps Script project bound to the production database:
 *        TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1.gs   (the census + the finder)
 *        TEMP_FC_EU_BFCM_RECONCILIATION_R1A_ENTRY.gs    (this file)
 *   2. In the function picker choose  runFcEuBfcmReconciliationDryRun  and press Run.
 *      It takes no arguments. Nothing needs editing first.
 *   3. Read the returned object (and the Logger output).
 *   4. DELETE both files from the project. Neither is part of the deployment.
 *
 * 73_api_v1_pricing_write.gs must be present in the project, because the prices are resolved BY it and are
 * never recomputed here. If it is absent every row is refused with PRICING_RESOLVER_UNAVAILABLE rather than
 * priced by a rule nobody reviewed.
 *
 * WHAT IT DOES ABOUT THE SELECTOR
 * -------------------------------
 * The operator's first run answered `verdict = STOP, blocker = EMPTY_SELECTOR`, which is correct fail-closed
 * behaviour and unhelpful in one specific way: the system knew a campaign was broken and would not say which.
 * So this entry resolves the selector from the DAMAGE:
 *
 *     the finder lists every campaign holding an orphaned event
 *       exactly one  -> that is the incident; the census runs scoped to its campaign_id
 *       none         -> the graph is already whole; nothing to plan
 *       more than one-> STOP, and list them. Choosing between real candidates is the operator's call, and
 *                       pinning one is a one-line edit to FCRC_R1A_CAMPAIGN_ID_ below.
 *
 * This is not an unrestricted all-campaign census. The finder emits campaign ids and counts; the census that
 * follows is scoped to one id.
 *
 * READ-ONLY
 * ---------
 * ENTRY_FUNCTION_WRITE_COUNT = 0. There is no appendRow, setValue, deleteRow, insertRow, clear, flush, Drive,
 * MailApp, property or trigger mutation in this file, and it calls exactly two functions, both of which are
 * read-only censuses. No executor is provided, here or anywhere: production repair is NOT authorized.
 */

// ---- THE TWO OPERATOR-FROZEN VALUES FOR THIS INCIDENT ----------------------------------------------------

/** §0 — frozen by the operator for the affected EU BFCM repair. */
var FCRC_R1A_DISCOUNT_PERCENT_ = 20;

/**
 * §1 — leave BLANK to resolve the campaign from the graph (the normal path). Set it to a campaign_id only
 * when the finder reports more than one affected campaign and the operator has chosen which to reconcile.
 */
var FCRC_R1A_CAMPAIGN_ID_ = '';

// ---------------------------------------------------------------------------------------------------------

/**
 * THE ONE FUNCTION THE OPERATOR SELECTS IN THE APPS SCRIPT EDITOR.
 * Takes no arguments. Writes nothing. Returns the scoped dry-run report, or a STOP explaining what is needed.
 */
function runFcEuBfcmReconciliationDryRun() {
  if (typeof TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1 !== 'function'
    || typeof TEMP_FC_RECONCILIATION_FIND_AFFECTED_CAMPAIGNS_R1A !== 'function') {
    var missing = { task: 'FC-EU-BFCM-DATA-RECONCILIATION-R1A', verdict: 'STOP',
      blocker: 'CENSUS_NOT_IN_PROJECT',
      detail: 'Paste TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1.gs into this project as well.',
      production_rows_written: 0, db_writes: 0 };
    Logger.log(JSON.stringify(missing, null, 2));
    return missing;
  }

  var pinned = String(FCRC_R1A_CAMPAIGN_ID_ || '').trim();
  var chosen = pinned;
  var finder = null;

  if (!chosen) {
    finder = TEMP_FC_RECONCILIATION_FIND_AFFECTED_CAMPAIGNS_R1A();
    if (finder.verdict === 'STOP') return finder;

    if (finder.affected_campaign_count === 0) {
      var whole = { task: 'FC-EU-BFCM-DATA-RECONCILIATION-R1A', verdict: 'NO_AFFECTED_CAMPAIGN',
        detail: 'No campaign currently holds an event whose campaign_sku_line is missing. '
          + 'Either the graph is already whole, or this is not the project bound to the affected database.',
        campaigns_scanned: finder.campaigns_scanned,
        production_rows_written: 0, db_writes: 0 };
      Logger.log(JSON.stringify(whole, null, 2));
      return whole;
    }

    if (finder.affected_campaign_count > 1) {
      // More than one real candidate is an operator decision, not a tie to be broken by ordering.
      var many = { task: 'FC-EU-BFCM-DATA-RECONCILIATION-R1A', verdict: 'STOP',
        blocker: 'MULTIPLE_AFFECTED_CAMPAIGNS',
        detail: 'Set FCRC_R1A_CAMPAIGN_ID_ at the top of this file to the campaign_id to reconcile, '
          + 'then run again. Run once per campaign; do not widen the selector.',
        affected_campaign_ids: finder.affected_campaign_ids,
        affected: finder.affected,
        production_rows_written: 0, db_writes: 0 };
      Logger.log(JSON.stringify(many, null, 2));
      return many;
    }

    chosen = finder.affected_campaign_ids[0];
  }

  var report = TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1({
    campaign_id: chosen,
    discount_percent: FCRC_R1A_DISCOUNT_PERCENT_
  });

  report.selector_strategy = pinned ? 'OPERATOR_PINNED_CAMPAIGN_ID' : 'DERIVED_FROM_ORPHANED_EVENTS';
  report.selector_uniquely_identifies_incident =
    pinned ? 'YES' : (finder && finder.affected_campaign_count === 1 ? 'YES' : 'NO');
  report.finder = finder ? {
    campaigns_scanned: finder.campaigns_scanned,
    affected_campaign_count: finder.affected_campaign_count,
    affected_campaign_ids: finder.affected_campaign_ids
  } : null;
  report.entry_function_write_count = 0;
  report.production_repair_execution_authorized = 'NO';

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * OPTIONAL — the finder on its own, for an operator who wants to see the candidates before anything is scoped.
 * Also read-only. Selecting it in the editor is harmless.
 */
function listFcReconciliationAffectedCampaigns() {
  return TEMP_FC_RECONCILIATION_FIND_AFFECTED_CAMPAIGNS_R1A();
}
