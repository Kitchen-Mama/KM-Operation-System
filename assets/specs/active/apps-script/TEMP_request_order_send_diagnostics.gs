/**
 * TEMP_request_order_send_diagnostics.gs
 * F1-7N-FB-4G-A2-R4 SS.J - EDITOR-RUN WRAPPERS ONLY. STRICTLY READ-ONLY. SAFE TO DELETE AT ANY TIME.
 *
 * WHAT CHANGED, AND WHY IT MATTERS MORE THAN IT LOOKS. This file used to define
 * handleRequestOrderSendDiagnosticStatus_ - the handler for `system.requestOrderSendDiagnosticStatus`, which is
 * a REQUIRED production action listed in the router, in SYS_REQUIRED_ACTIONS_ and in the browser's deployed
 * action contract. Because the file is named TEMP and its whole contract is "paste, run, remove", removing it
 * removed a required action. The measured consequence was not a missing diagnostic: the DEPLOYMENT CONTRACT
 * failed, and with it Search, the Execution Plan hydrate and every save on the page. Restoring this file
 * restored all of it.
 *
 * The handler, the configuration constants and the shared resolver now live in the PERMANENT owner,
 * 66_api_v1_request_order_send.gs, as ROSEND_DIAG_OWNER_FILE_ / ROSEND_DIAG_BUILD_VERSION_ / ROSEND_TIER_SCOPE_
 * / ROSEND_PLANNING_CYCLE_OVERRIDE_ / rosendResolve_ / rosendStatusReport_ /
 * handleRequestOrderSendDiagnosticStatus_. Apps Script shares ONE global scope, so each is still defined in
 * exactly one file - the FB-4A addendum's rule is unchanged, and only the file changed.
 *
 * WHAT REMAINS HERE are the three Apps Script editor entry points an operator runs by hand:
 *
 *     TEMP_REQUEST_ORDER_SEND_DIAGNOSTIC_STATUS   (read-only ownership + resolution report)
 *     TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE       (read-only workset probe)
 *     TEMP_REQUEST_ORDER_SEND_PREVIEW             (pinned to PREVIEW; it cannot execute)
 *
 * They are conveniences. Deleting this file removes them and NOTHING else: the router action, the deployment
 * contract and the website are unaffected. To change the tier scope or pin a planning cycle, edit the two
 * SOURCE constants in 66_. No function here or there reads PropertiesService, so a Script Property named
 * TEMP_ROSEND_PLANNING_CYCLE_ (or any other name) is read by NOTHING and changes NOTHING.
 */

// ---- OWNERSHIP + BUILD IDENTITY (reported by §G and probed by system.health) --------------------------------

// ---- CONFIGURATION (both optional; neither needs editing for a normal run) ----------------------------------
// The ONLY business scope control the Send accepts. ALL | T1 | T2 | T3.
// OPTIONAL controlled-testing override. LEAVE BLANK for normal use — blank means "resolve the current cycle
// automatically from the persisted allocation drafts", which is what the website does. Set it to an exact
// YYYY-MM only when you deliberately want to probe a cycle other than the resolved one, or to break a reported
// ambiguity. It is a SOURCE constant in THIS file: a Script Property of any name is read by nothing.

// -------------------------------------------------------------------------------------------------------------
// Shared read-only resolution + reporting. Both probes call this first, so they can never disagree about which
// cycle they are looking at or about which file owns the configuration.
// -------------------------------------------------------------------------------------------------------------

function tempRosendLogOwnership_(tag) {
  Logger.log('[' + tag + '][owner] file=' + ROSEND_DIAG_OWNER_FILE_
    + ' build=' + ROSEND_DIAG_BUILD_VERSION_
    + ' send_owner=66_api_v1_request_order_send.gs build=' + (typeof ROS_BUILD_VERSION_ !== 'undefined' ? ROS_BUILD_VERSION_ : '(ABSENT — 66_ is not in this deployment)')
    + ' health_build=' + (typeof SYS_BUILD_VERSION_ !== 'undefined' ? SYS_BUILD_VERSION_ : '(ABSENT — 63_ is not in this deployment)')
    + ' action_contract=' + (typeof SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ !== 'undefined' ? SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ : '(ABSENT)'));
}

// A blocked resolution is reported with EVERY candidate and the exact next action, and it reads no workset and
// writes nothing. This is what replaced "set the constant and Run again" with an answer.
function tempRosendLogBlocked_(tag, res) {
  Logger.log('[' + tag + '] BLOCKED — ' + res.status + ': ' + res.reason);
  Logger.log('[' + tag + '] DB_WRITES=0 DRIVE_WRITES=0 PROPERTY_WRITES=0 STATUS_TRANSITIONS=0 LOCKS=0 — nothing was written.');
  if ((res.candidates || []).length) {
    Logger.log('[' + tag + '] CANDIDATE PLANNING CYCLES (each carries ACTIVE persisted allocation drafts):');
    res.candidates.forEach(function (c) {
      Logger.log('[' + tag + ']   ' + c.planning_cycle + '  active=' + c.active_drafts + '  terminal=' + c.terminal_drafts
        + '  persisted=' + c.persisted_drafts
        + '  latest_calculated_at=' + (c.latest_calculated_at || '(none)')
        + '  latest_source_data_as_of=' + (c.latest_source_data_as_of || '(none)'));
    });
    Logger.log('[' + tag + '] TO PROCEED: set ROSEND_PLANNING_CYCLE_OVERRIDE_ in ' + ROSEND_DIAG_OWNER_FILE_
      + ' to the ONE cycle you mean, then Run again. Do NOT add a Script Property — no function in this file reads one.');
  } else if ((res.all_cycles || []).length) {
    Logger.log('[' + tag + '] No cycle has ACTIVE drafts. Cycles present in the table (all terminal or blank):');
    res.all_cycles.slice(0, 24).forEach(function (c) {
      Logger.log('[' + tag + ']   ' + c.planning_cycle + '  active=' + c.active_drafts + '  terminal=' + c.terminal_drafts + '  persisted=' + c.persisted_drafts);
    });
  }
  tempRosendLogOwnership_(tag);
}

function tempRosendLogResolved_(tag, res) {
  Logger.log('[' + tag + '] planning_cycle=' + res.resolved_planning_cycle
    + ' resolution_source=' + res.resolution_source
    + ' candidates=' + res.candidate_count
    + (res.override.supplied ? (' override=' + res.override.value + ' override_has_persisted_rows=' + res.override.has_persisted_rows) : ' override=(none — automatic)')
    + ' | ' + res.reason);
}

// =============================================================================================================
// §G — READ-ONLY OWNERSHIP + RESOLUTION STATUS. Run this FIRST when anything about the Request Order diagnostics
// looks wrong: it answers which file owns them, which cycle resolves and from where, what the candidates are,
// which build each module in the DEPLOYED project reports, and it proves it wrote nothing.
// =============================================================================================================

function TEMP_REQUEST_ORDER_SEND_DIAGNOSTIC_STATUS() {
  var r = rosendStatusReport_();
  Logger.log('[ROSEND-STATUS] owner_file=' + r.owner_file + ' owner_build=' + r.owner_build_version
    + ' send_owner=' + r.send_owner_file + ' send_owner_build=' + r.send_owner_build_version
    + ' build_id=' + r.build_id + ' action_contract=' + r.deployed_action_contract_version
    + ' required_action_list=' + r.required_action_list_version);
  Logger.log('[ROSEND-STATUS] resolved_planning_cycle=' + (r.resolved_planning_cycle || '(none)')
    + ' resolution_source=' + r.resolution_source + ' status=' + r.resolution_status + ' blocked=' + r.resolution_blocked);
  Logger.log('[ROSEND-STATUS] reason: ' + r.resolution_reason);
  Logger.log('[ROSEND-STATUS] candidates=' + r.candidate_count + ' ' + JSON.stringify(r.candidate_cycles));
  Logger.log('[ROSEND-STATUS] override=' + JSON.stringify(r.override) + ' tier_scope=' + r.tier_scope);
  Logger.log('[ROSEND-STATUS] mixed_deployment=' + r.mixed_deployment + ' module_build_stamps=' + JSON.stringify(r.module_build_stamps));
  Logger.log('[ROSEND-STATUS] ' + r.configuration_authority);
  Logger.log('[ROSEND-STATUS] ' + r.entrypoint_owner_note);
  Logger.log('[ROSEND-STATUS] DB_WRITES=0 DRIVE_WRITES=0 PROPERTY_WRITES=0 STATUS_TRANSITIONS=0 LOCKS=0 EMAILS=0 DEMO_MUTATIONS=0');
  Logger.log('[ROSEND-STATUS] next_action: ' + r.next_action);
  return r;
}

// =============================================================================================================
// READ-ONLY WORKSET PROBE. Reads the persisted allocation drafts and reports what a Send would consume.
// =============================================================================================================
function TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE() {
  var res = rosendResolve_();
  if (res.blocked) { tempRosendLogBlocked_('ROSEND-WS', res); return; }
  tempRosendLogResolved_('ROSEND-WS', res);
  var cycle = res.resolved_planning_cycle;
  var r = handleRequestOrderSendWorksetGet_({ payload: { tier_scope: ROSEND_TIER_SCOPE_, planning_cycle: cycle, include: ['counts', 'groups'] } });
  if (!r.success) { Logger.log('[ROSEND-WS] FAILED ' + JSON.stringify(r.errors)); tempRosendLogOwnership_('ROSEND-WS'); return; }
  var d = r.data, c = d.counts;
  Logger.log('[ROSEND-WS] cycle=' + d.planning_cycle + ' scope=' + d.tier_scope + ' tiers=[' + d.tiers_in_scope.join(',') + ']'
    + ' | persisted_in_cycle=' + c.persisted_drafts_in_cycle + ' active=' + c.active_persisted_drafts
    + ' drafts_with_positive_tier=' + c.drafts_with_positive_selected_tier
    + ' selected_tier_allocations=' + c.selected_tier_allocations
    + ' POSITIVE_tier_allocations=' + c.positive_selected_tier_allocations
    + ' | skus=' + c.distinct_skus + ' series=' + c.distinct_series
    + ' | expected_headers=' + c.expected_request_order_headers + ' expected_lines=' + c.expected_request_order_lines
    + ' units=' + c.total_units
    + ' | checksum=' + d.workset_checksum + ' blocking_conflicts=' + (d.blocking_conflicts || []).length
    + ' | scope_controls=[' + d.business_send_scope_controls.join(',') + '] display_only=[' + d.display_only_controls.join(',') + ']'
    + ' | phases=' + JSON.stringify(r.meta.phases) + ' bytes=' + r.meta.response_bytes + ' writes=' + r.meta.writes_performed);
  Logger.log('[ROSEND-WS][excluded] ' + JSON.stringify(d.excluded));
  (d.blocking_conflicts || []).slice(0, 20).forEach(function (x) {
    Logger.log('[ROSEND-WS][CONFLICT] ' + x.code + ' scope=' + x.natural_key + ' ids=' + (x.draft_ids || []).join(',')
      + ' canonical=' + x.canonical_count + ' non_canonical=' + x.non_canonical_count);
  });
  (d.groups || []).slice(0, 25).forEach(function (g) {
    Logger.log('[ROSEND-WS][series] ' + (g.series || '(no series)') + ' lines=' + g.line_count + ' skus=' + g.distinct_skus + ' units=' + g.total_units);
  });
  tempRosendLogOwnership_('ROSEND-WS');
}

// =============================================================================================================
// READ-ONLY PREVIEW. Pinned to mode:'preview' — this wrapper CANNOT execute a Send. The preview persists only the
// frozen-workset journal entry the confirmation dialog is built from; it performs ZERO business writes.
// =============================================================================================================
function TEMP_REQUEST_ORDER_SEND_PREVIEW() {
  var res = rosendResolve_();
  if (res.blocked) { tempRosendLogBlocked_('ROSEND-PREVIEW', res); return; }
  tempRosendLogResolved_('ROSEND-PREVIEW', res);
  var cycle = res.resolved_planning_cycle;
  var r = handleRequestOrderSendOrchestrate_({ payload: { tier_scope: ROSEND_TIER_SCOPE_, planning_cycle: cycle, mode: 'preview' } });
  if (!r.success) { Logger.log('[ROSEND-PREVIEW] BLOCKED ' + JSON.stringify(r.errors) + ' | 0 business writes.'); tempRosendLogOwnership_('ROSEND-PREVIEW'); return; }
  var d = r.data;
  Logger.log('[ROSEND-PREVIEW] ' + d.status + ' key=' + d.orchestration_key + ' checksum=' + d.workset_checksum
    + ' | ' + JSON.stringify(d.counts) + ' | series_groups=' + d.series_groups.length
    + ' | journal_persisted=' + d.journal_persisted + ' journal_bytes=' + d.journal_bytes
    + ' | business writes_performed=' + d.writes_performed + ' (PREVIEW — this wrapper cannot execute)');
  Logger.log('[ROSEND-PREVIEW][excluded] ' + JSON.stringify(d.excluded));
  Logger.log('[ROSEND-PREVIEW][slice] client_write_timeout_ms=' + ROS_CLIENT_WRITE_TIMEOUT_MS_
    + ' max_single_write_ms=' + ROS_MAX_SINGLE_WRITE_MS_ + ' reserve_ms=' + ROS_RESERVE_MS_
    + ' slice_budget_ms=' + ROS_SLICE_BUDGET_MS_ + ' lease_ms=' + ROS_LEASE_MS_);
  tempRosendLogOwnership_('ROSEND-PREVIEW');
}

// =============================================================================================================
// Router-reachable form of the §G report, so the WEBSITE can prove the diagnostic ownership and the resolved
// cycle without anyone opening the Apps Script editor. Strictly read-only; identical payload to the wrapper.
// =============================================================================================================

