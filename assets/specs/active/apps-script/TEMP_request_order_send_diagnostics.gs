/**
 * TEMP_request_order_send_diagnostics.gs
 * F1-7N-FB-4A ADDENDUM §C/§D/§F/§G — THE SINGLE CANONICAL OWNER of every Request Order Send DIAGNOSTIC
 * entrypoint and its configuration. STRICTLY READ-ONLY.
 *
 * WHY THIS FILE EXISTS. Every .gs file in an Apps Script project shares ONE global scope. A TEMP entrypoint or a
 * configuration constant defined in two files is therefore NOT a harmless duplicate: whichever file loads last
 * silently wins, and an operator editing the other copy changes nothing while appearing to change something.
 * That is exactly the confusion this addendum ends — so these symbols live here, and nowhere else:
 *
 *     TEMP_ROSEND_PLANNING_CYCLE_OVERRIDE_        (optional, controlled-testing override)
 *     TEMP_ROSEND_TIER_SCOPE_                     (ALL | T1 | T2 | T3)
 *     TEMP_REQUEST_ORDER_SEND_DIAGNOSTIC_STATUS   (§G — read-only ownership + resolution report)
 *     TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE       (read-only workset probe)
 *     TEMP_REQUEST_ORDER_SEND_PREVIEW             (pinned to PREVIEW; it cannot execute)
 *
 * They are DELIBERATELY NOT in 66_api_v1_request_order_send.gs (which owns the PRODUCTION Send: the workset
 * builder, the orchestration, the journal and the planning-cycle authority), and DELIBERATELY NOT in
 * TEMP_demo_shipping_shipment_map_seed_v2.gs — the Demo seed owns Demo data and nothing else; a Request Order
 * diagnostic placed there would couple two unrelated subsystems and put the seed's checksum contract at risk.
 * A regression test asserts ZERO ROSEND symbols in the Demo seed and EXACTLY ONE definition of each symbol above.
 *
 * NO MANUAL SOURCE EDIT IS REQUIRED. The planning cycle resolves AUTOMATICALLY, read-only, from the SAME
 * persisted authority the website uses (the ACTIVE rows of request_order_allocation_drafts — mirroring
 * request-order.js `_roSendPlanningCycle_`). The override constant below is optional and exists only for a
 * controlled test.
 *
 * NO SCRIPT PROPERTY IS AN AUTHORITY HERE. PropertiesService is never read by any function in this file. A
 * Script Property named TEMP_ROSEND_PLANNING_CYCLE_ (or anything else) is read by nothing and changes nothing —
 * the §G status report says so explicitly, so the mistake cannot be made silently twice.
 *
 * ZERO WRITE, STRUCTURALLY: no appendRow, setValue, setValues, insertSheet, deleteRow, sheet-ensure, LockService,
 * PropertiesService, DriveApp or MailApp; and the only orchestration call is pinned to mode:'preview'. There is
 * deliberately no editor wrapper that performs a live Send — a business write belongs to the page, under a
 * confirmation the operator has read.
 */

// ---- OWNERSHIP + BUILD IDENTITY (reported by §G and probed by system.health) --------------------------------
var TEMP_ROSEND_DIAG_OWNER_FILE_ = 'TEMP_request_order_send_diagnostics.gs';
var TEMP_ROSEND_DIAG_BUILD_VERSION_ = 'F1-7N-FB-4A';

// ---- CONFIGURATION (both optional; neither needs editing for a normal run) ----------------------------------
// The ONLY business scope control the Send accepts. ALL | T1 | T2 | T3.
var TEMP_ROSEND_TIER_SCOPE_ = 'ALL';
// OPTIONAL controlled-testing override. LEAVE BLANK for normal use — blank means "resolve the current cycle
// automatically from the persisted allocation drafts", which is what the website does. Set it to an exact
// YYYY-MM only when you deliberately want to probe a cycle other than the resolved one, or to break a reported
// ambiguity. It is a SOURCE constant in THIS file: a Script Property of any name is read by nothing.
var TEMP_ROSEND_PLANNING_CYCLE_OVERRIDE_ = '';

// -------------------------------------------------------------------------------------------------------------
// Shared read-only resolution + reporting. Both probes call this first, so they can never disagree about which
// cycle they are looking at or about which file owns the configuration.
// -------------------------------------------------------------------------------------------------------------
function tempRosendResolve_() {
  return rosReadResolvedPlanningCycle_(TEMP_ROSEND_PLANNING_CYCLE_OVERRIDE_);
}

function tempRosendLogOwnership_(tag) {
  Logger.log('[' + tag + '][owner] file=' + TEMP_ROSEND_DIAG_OWNER_FILE_
    + ' build=' + TEMP_ROSEND_DIAG_BUILD_VERSION_
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
    Logger.log('[' + tag + '] TO PROCEED: set TEMP_ROSEND_PLANNING_CYCLE_OVERRIDE_ in ' + TEMP_ROSEND_DIAG_OWNER_FILE_
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
function tempRosendStatusReport_() {
  var res = tempRosendResolve_();
  var modules = (typeof sysModuleBuildStamps_ === 'function') ? sysModuleBuildStamps_() : null;
  return {
    read_only: true,
    DB_WRITES: 0, DRIVE_WRITES: 0, PROPERTY_WRITES: 0, STATUS_TRANSITIONS: 0, LOCKS_TAKEN: 0, EMAILS: 0, DEMO_MUTATIONS: 0,

    owner_file: TEMP_ROSEND_DIAG_OWNER_FILE_,
    owner_build_version: TEMP_ROSEND_DIAG_BUILD_VERSION_,
    send_owner_file: '66_api_v1_request_order_send.gs',
    send_owner_build_version: (typeof ROS_BUILD_VERSION_ !== 'undefined') ? ROS_BUILD_VERSION_ : null,
    build_id: (typeof SYS_BUILD_VERSION_ !== 'undefined') ? SYS_BUILD_VERSION_ : null,
    deployed_action_contract_version: (typeof SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ !== 'undefined') ? SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ : null,
    required_action_list_version: (typeof SYS_REQUIRED_ACTION_LIST_VERSION_ !== 'undefined') ? SYS_REQUIRED_ACTION_LIST_VERSION_ : null,
    module_build_stamps: modules ? modules.modules : null,
    mixed_deployment: modules ? modules.mixed_deployment : null,

    resolved_planning_cycle: res.resolved_planning_cycle,
    resolution_source: res.resolution_source,
    resolution_status: res.status,
    resolution_blocked: res.blocked,
    resolution_reason: res.reason,
    candidate_count: res.candidate_count,
    candidate_cycles: res.candidates,
    all_cycles_in_table: res.all_cycles,
    override: res.override,
    tier_scope: TEMP_ROSEND_TIER_SCOPE_,

    configuration_authority: 'The ONLY configuration authority is the pair of SOURCE constants in ' + TEMP_ROSEND_DIAG_OWNER_FILE_
      + ' (TEMP_ROSEND_PLANNING_CYCLE_OVERRIDE_, TEMP_ROSEND_TIER_SCOPE_). No function in that file reads PropertiesService, '
      + 'so a Script Property named TEMP_ROSEND_PLANNING_CYCLE_ (or any other name) is read by NOTHING and changes NOTHING. '
      + 'If one was created by mistake it is inert; deleting it is optional and changes no behaviour.',
    entrypoint_owner_note: 'TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE, TEMP_REQUEST_ORDER_SEND_PREVIEW and TEMP_REQUEST_ORDER_SEND_DIAGNOSTIC_STATUS '
      + 'are defined ONLY in ' + TEMP_ROSEND_DIAG_OWNER_FILE_ + '. They are not in 66_, not in TEMP_document_diagnostics.gs and not in the Demo seed.',
    next_action: res.blocked
      ? ('BLOCKED (' + res.status + '). ' + res.reason)
      : ('Ready. TEMP_REQUEST_ORDER_SEND_WORKSET_PROBE and TEMP_REQUEST_ORDER_SEND_PREVIEW will run against planning_cycle=' + res.resolved_planning_cycle + '.')
  };
}

function TEMP_REQUEST_ORDER_SEND_DIAGNOSTIC_STATUS() {
  var r = tempRosendStatusReport_();
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
  var res = tempRosendResolve_();
  if (res.blocked) { tempRosendLogBlocked_('ROSEND-WS', res); return; }
  tempRosendLogResolved_('ROSEND-WS', res);
  var cycle = res.resolved_planning_cycle;
  var r = handleRequestOrderSendWorksetGet_({ payload: { tier_scope: TEMP_ROSEND_TIER_SCOPE_, planning_cycle: cycle, include: ['counts', 'groups'] } });
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
  var res = tempRosendResolve_();
  if (res.blocked) { tempRosendLogBlocked_('ROSEND-PREVIEW', res); return; }
  tempRosendLogResolved_('ROSEND-PREVIEW', res);
  var cycle = res.resolved_planning_cycle;
  var r = handleRequestOrderSendOrchestrate_({ payload: { tier_scope: TEMP_ROSEND_TIER_SCOPE_, planning_cycle: cycle, mode: 'preview' } });
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
function handleRequestOrderSendDiagnosticStatus_(body) {
  return {
    success: true,
    data: tempRosendStatusReport_(),
    errors: [],
    meta: { apiVersion: '1', action: 'system.requestOrderSendDiagnosticStatus',
      build: TEMP_ROSEND_DIAG_BUILD_VERSION_, read_only: true,
      db_writes: 0, drive_writes: 0, property_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0 }
  };
}
