// =============================================================================================================
// S8-R4A — THE FROZEN 16-ACTION ALLOWLIST
//
// R4A measures whole PAGES, so the allowlist has to cover what a page actually dispatches rather than what a
// harness chooses to send. That is five actions more than S8-R3B's eleven, and the operator approved exactly
// those five — no more, and none added during execution.
//
// IT COMPOSES R3B RATHER THAN REPLACING IT. The eleven scoped reads keep their frozen specs, their DTO
// fidelity and their verb checks in KMS8R3B; this module answers for the five additions and delegates
// everything else. Two reasons, and the second is the one that matters:
//
//   1. S8-R3B's suite asserts its approved set is EXACTLY eleven. Mutating that module to add five would have
//      broken a passing safety assertion, and the correct response to that assertion is never to loosen it.
//   2. A second opinion about which actions are approved is the exact failure this whole design is built to
//      prevent. There is one `decide` for the eleven and one for the five, and the five are listed here in
//      full, so no action is approved by two authorities that could disagree.
//
// THE FIVE ARE NOT SCOPED READS. getOperationDb reads 44 tabs in a single execution; getTable reads one tab
// per request and is the application's largest source of request-count amplification. They are approved for
// MEASUREMENT, not endorsed — the preflight's §15 names the whole-database read as the leading suspect for the
// page-level time S8-R3B could not account for.
// =============================================================================================================

(function (root, factory) {
  var api = factory(typeof require === 'function' ? require('./s8-r3b-read-allowlist.js') : root.KMS8R3B);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.KMS8R4A_ACTIONS = api; }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (R3B) {
  'use strict';

  var ROUND = 'S8-R4A';

  function str(v) { return (v === undefined || v === null) ? '' : String(v); }

  // ---------------------------------------------------------------------------------------------------------
  // The five additions. `verbs` is a LIST because the shipped client does not always use one verb for one
  // action: system.health is deliberately routed on both, and is dispatched both ways by different callers.
  // Pinning a single verb for it would refuse a request the application legitimately makes.
  // ---------------------------------------------------------------------------------------------------------
  var ADDITIONAL = {
    'getOperationDb': {
      verbs: ['GET'], owner: '03_', handler: 'handleGetOperationDb_',
      tables: 44, surfaces: 'SKU Regional · Weekly Shipping Plan · Shipment Overview · Shipment Draft · PO Overview · Carrier Rate Card',
      why: 'a MOUNT read on six of the eleven surfaces. Excluding it would mean not measuring those pages at all.'
    },
    'getTable': {
      verbs: ['GET'], owner: '03_', handler: 'handleGetTable_',
      tables: 1, surfaces: 'Factory Inventory · Overseas Inventory (legacy) · Carrier Rate Card · Site Inventory',
      why: 'one request per table name, and therefore the largest single source of request amplification.'
    },
    'getClientCapabilities': {
      verbs: ['GET'], owner: '03_', handler: 'handleGetClientCapabilities_',
      tables: 0, surfaces: 'every session, before any route',
      why: 'fires at DOMContentLoaded. Blocking it would change boot timing, so every cold measurement would be a measurement of the guard.'
    },
    'inventoryScope.registry.get': {
      verbs: ['GET'], owner: '64_', handler: 'handleInventoryScopeRegistryGet_',
      tables: 1, surfaces: 'Site Inventory',
      why: 'one of the four requests in the cold-boot race the boot arbiter exists to resolve.'
    },
    'system.health': {
      verbs: ['GET', 'POST'], owner: '63_', handler: 'handleSystemHealth_',
      tables: 0, surfaces: 'any page that runs the deployment-contract check',
      why: 'conditional. Under deny-by-default an unapproved request is aborted, which would turn a normal deployment check into a visible error and contaminate CONSOLE_ERROR_COUNT.'
    }
  };

  // Every one of the five was read as CODE — handler body sliced by brace depth, comments and string literals
  // stripped, every named helper followed one level down — and carries no write primitive. Recorded as data so
  // the suite can assert the claim is still the one being made.
  var ZERO_WRITE_PROOF = {
    method: 'handler body sliced by brace depth; comments AND string literals stripped; named helpers followed one level',
    primitives_searched: ['setValue(', 'setValues(', 'appendRow(', 'insertRowAfter(', 'insertSheet(', 'deleteRow(',
      'deleteSheet(', 'clearContent', 'clearContents', 'setProperty(', 'deleteProperty(', 'DriveApp',
      'MailApp', 'newTrigger(', 'deleteTrigger(', 'LockService'],
    result: 'NONE found, direct or one level down, for any of the five'
  };

  // The seven tables that reach R4A only because the whole-database read reaches them. Approved READ for this
  // round; NOT registered. Recorded so a later round cannot mistake one for the other.
  var ROUND_ONLY_READ_TABLES = ['product_features', 'sku_handbook_summaries', 'pricing_change_log',
    'factory_stock_movements', 'request_order_allocation_drafts', 'request_order_allocation_draft_lines',
    'request_order_site_confirmations'];
  var STILL_UNAUTHORIZED_UNKNOWN = ['product_features', 'sku_handbook_summaries',
    'supplier_price_list', 'amazon_inventory_health_snapshot'];

  function approvedActions() {
    return R3B.approvedActions().concat(Object.keys(ADDITIONAL)).sort();
  }

  function refuse(code, reason, action) {
    return { ok: false, code: code, reason: reason, action: action || null, dispatched: false };
  }

  // ---------------------------------------------------------------------------------------------------------
  // decide(req) — the five first, then R3B for everything else.
  //
  // The FORBIDDEN set is consulted BEFORE the additions, not after. If a name ever appeared in both, the
  // refusal has to win; ordering it this way means that is true by construction rather than by nobody ever
  // making the mistake.
  // ---------------------------------------------------------------------------------------------------------
  function decide(req) {
    req = req || {};
    var action = str(req.action).trim();
    var method = str(req.method).toUpperCase() || 'GET';
    var url = str(req.url);

    if (action === '') return refuse('NO_ACTION', 'A request with no action cannot be matched against the approved set.');
    if (Object.prototype.hasOwnProperty.call(R3B.FORBIDDEN_ACTIONS, action)) {
      return refuse('ACTION_FORBIDDEN', R3B.FORBIDDEN_ACTIONS[action], action);
    }
    if (!Object.prototype.hasOwnProperty.call(ADDITIONAL, action)) {
      return R3B.decide(req);               // the eleven, with their own verb and DTO contracts
    }

    var spec = ADDITIONAL[action];
    if (spec.verbs.indexOf(method) === -1) {
      return refuse('VERB_NOT_APPROVED',
        action + ' is approved on ' + spec.verbs.join('/') + '; this request used ' + method + '.', action);
    }
    if (url !== '' && url.indexOf('https://script.google.com/macros/s/') !== 0) {
      return refuse('ENDPOINT_NOT_STABLE_EXEC',
        'Only the stable /macros/s/<deployment>/exec endpoint may be requested.', action);
    }
    return { ok: true, code: 'DISPATCH_AUTHORIZED', action: action, verb: method,
             surface: spec.surfaces, additional: true };
  }

  // An action is "known" if the ROUTER routes it. Delegated to R3B so the vocabulary has one owner — the CDP
  // guard needs this to refuse a forbidden action aimed at a host that is not the deployment.
  function isKnownAction(a) { return R3B.isKnownAction(a); }
  function actionFromRequest(url, postData) { return R3B.actionFromRequest(url, postData); }

  return {
    ROUND: ROUND,
    ADDITIONAL: ADDITIONAL,
    ADDITIONAL_COUNT: Object.keys(ADDITIONAL).length,
    ZERO_WRITE_PROOF: ZERO_WRITE_PROOF,
    ROUND_ONLY_READ_TABLES: ROUND_ONLY_READ_TABLES,
    STILL_UNAUTHORIZED_UNKNOWN: STILL_UNAUTHORIZED_UNKNOWN,
    FORBIDDEN_ACTIONS: R3B.FORBIDDEN_ACTIONS,
    approvedActions: approvedActions,
    decide: decide,
    isKnownAction: isKnownAction,
    actionFromRequest: actionFromRequest
  };
}));
