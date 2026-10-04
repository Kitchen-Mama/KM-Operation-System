// =============================================================================================================
// S8-R3B — READ-PATH FATIGUE ALLOWLIST
//
// This module is the only thing standing between a fatigue runner and Production. It is DENY BY DEFAULT: a
// request is dispatched if and only if `decide()` returns ok, and `decide()` recognises eleven actions.
//
// WHY AN ALLOWLIST AND NOT A BLOCKLIST. The operator's standing gate refuses an omitted table, not merely a
// named-forbidden one. A blocklist has the opposite failure mode — it approves everything nobody thought of —
// and the one action this round must never send (gapJob.status.get) is an action that LOOKS like every other
// read: it sits on the router's GET read table, it is named `.get`, and the client lists it among its reads.
// Nothing about its shape distinguishes it. Only a list of what WAS approved can refuse it.
//
// THE REQUEST BYTES ARE THE SHIPPED CLIENT'S BYTES. Every DTO below is transcribed from the resolver that
// builds it in `assets/js/api/km-api-foundation.js` (or `operation-system-db-api.js` for the two non-foundation
// paths), and the URL is built by the same rule as `km-transport.js` readQuery(). A fatigue measurement is only
// worth recording if the server did the work the page asks it to do; a hand-simplified payload measures a
// different, cheaper request and reports it as the page's cost.
//
// S8-R3B §11 — this module performs NO I/O. It decides, and it refuses. The runner does the dispatching.
// =============================================================================================================

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.KMS8R3B = api; }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ROUND = 'S8-R3B';
  var API_VERSION = '1';                 // km-api-foundation.js:38
  var TRANSPORT_CONTRACT_VERSION = 1;    // km-transport.js:50
  var READ_URL_MAX = 6000;               // km-transport.js — a read too large to send is refused, not truncated
  var GET_BODY_MAX = 4000;               // 01_router.gs RTR_GET_BODY_MAX_ — the server's own ceiling

  // ---------------------------------------------------------------------------------------------------------
  // THE FORBIDDEN SET. Named explicitly even though deny-by-default already refuses them, because a refusal
  // that can say WHICH rule it is enforcing is the one an operator can audit. `reason` is the operator's own
  // wording where they gave one.
  // ---------------------------------------------------------------------------------------------------------
  var FORBIDDEN_ACTIONS = {
    'gapJob.status.get':
      'S8-R3B precondition: NOT AUTHORIZED. Under a stale non-terminal job it persists STALLED, re-arms ' +
      'recovery, mutates ScriptApp triggers and continues gap processing, which upserts both gap tables.',
    'inventoryReplenishmentGap.recalculate.all':
      'gap write fatigue remains UNAUTHORIZED (standing gate rule 11).',
    'orderPlanningGap.recalculate.all':
      'gap write fatigue remains UNAUTHORIZED (standing gate rule 11).',
    'orderPlanningGap.job.start':  'starting a gap job is a write, and a job start is explicitly refused.',
    'inventoryReplenishmentGap.job.start': 'starting a gap job is a write, and a job start is explicitly refused.',
    'orderPlanningGap.get':
      'READ-ONLY, but NOT in the S8-R3A approved action set. Standing gate rule 1: a surface omitted from the ' +
      'approved preflight is not authorized. Adding it here would be the round widening its own scope.',
    'aiPlanFirstLayer.get':
      'READ-ONLY, but NOT in the S8-R3A approved action set — same refusal as orderPlanningGap.get.'
  };

  // ---------------------------------------------------------------------------------------------------------
  // THE APPROVED SET — eleven actions, each one named in the S8-R3A preflight §2 surface audit.
  //
  // `verb` is the verb the SHIPPED CLIENT uses, not a verb chosen here. S8-R4B-1 made that uniform: all
  // ELEVEN are now on the router's GET read table and the client sends every one of them as GET.
  // factoryStockGuard.get used to be the exception — POST, through _kmWeeklyCommand_ — although its handler
  // is read-only and returns zero_write:true. A POST cannot survive the /exec 302 (the redirect is re-issued
  // as a GET with the body dropped), which is the failure R3B reproduced twice in nine attempts.
  // ---------------------------------------------------------------------------------------------------------
  var APPROVED = {
    'fcSummary.workspace.get': {
      surface: 'FC Summary', surfaceNo: 1, owner: '58_', verb: 'GET', envelope: 'foundation',
      build: function () { return { include: { summary: true } }; }
    },
    'skuDetails.workspace.get': {
      surface: 'SKU Details / SKU Regional Details', surfaceNo: 2, owner: '59_', verb: 'GET', envelope: 'foundation',
      build: function () { return { include: { summary: true } }; }
    },
    'overseasStock.workspace.get': {
      surface: 'Overseas Inventory', surfaceNo: 5, owner: '70_', verb: 'GET', envelope: 'foundation',
      build: function () { return { include: { summary: true } }; }
    },
    'weeklyShipping.workspace.get': {
      surface: 'Weekly Shipping Plan', surfaceNo: 6, owner: '40_', verb: 'GET', envelope: 'foundation',
      build: function () {
        return {
          filters: {}, search: null,
          sort: [{ field: 'updated_at', direction: 'desc' }],
          page: { number: 1, size: 25 },
          include: { summary: true, plans: true, details: true, filterOptions: true }
        };
      }
    },
    'purchaseOrder.workspace.get': {
      surface: 'PO Overview', surfaceNo: 10, owner: '50_', verb: 'GET', envelope: 'foundation',
      build: function () {
        return {
          filters: {}, search: null,
          sort: [{ field: 'order_date', direction: 'desc' }],
          page: { number: 1, size: 2000 },
          include: { summary: true, orders: true, details: true, filterOptions: true }
        };
      }
    },
    'requestOrder.workspace.get': {
      surface: 'Request Order', surfaceNo: 7, owner: '51_', verb: 'GET', envelope: 'foundation',
      build: function () {
        return {
          filters: {}, search: null,
          sort: [{ field: 'created_at', direction: 'desc' }],
          page: { number: 1, size: 2000 },
          include: { summary: true, orders: true, details: true, filterOptions: true }
        };
      }
    },
    'shipment.workspace.get': {
      surface: 'Shipment Draft / Overview / On-the-Way Map', surfaceNo: 8, owner: '57_', verb: 'GET', envelope: 'foundation',
      build: function () {
        return {
          filters: {}, search: null,
          sort: [{ field: 'updated_at', direction: 'desc' }],
          page: { number: 1, size: 3000 },
          include: { summary: true, filterOptions: true }
        };
      }
    },
    'inventoryReplenishment.workspace.get': {
      surface: 'Site Inventory (primary read)', surfaceNo: 11, owner: '60_', verb: 'GET', envelope: 'foundation',
      build: function () { return { include: { summary: true } }; }
    },
    'recommendation.workspace.get': {
      surface: 'Site Inventory (recommendation read)', surfaceNo: 11, owner: '42_', verb: 'GET', envelope: 'foundation',
      // SCOPE-REQUIRED. 42_ refuses an unscoped request with VALIDATION_FAILED in ~1 ms:
      // "scope.company/country/marketplace are mandatory (no implicit first company/marketplace)". That is the
      // owner being correct, not a defect — the page only issues this read once a scope is selected — but a
      // fatigue run that sends nulls measures the VALIDATOR and reports it as the surface's cost.
      scopeRequired: true,
      build: function (ctx) {
        var sc = (ctx && ctx.scope) || {};
        return {
          scope: { company: sc.company || null, country: sc.country || null, marketplace: sc.marketplace || null,
                   sku: null, siteSku: null },
          filters: { lts: null, series: null, category: null, sku: null, siteSku: null },
          pagination: { page: 1, size: 100 },
          include: { diagnostics: true }
        };
      }
    },
    // The two non-foundation paths. Their DTO is NOT the apiVersion/payload/context envelope — _kmGapRead_ and
    // _kmWeeklyCommand_ each build their own, and copying the foundation shape here would send a request the
    // page never sends.
    'inventoryReplenishmentGap.get': {
      surface: 'Site Inventory (materialized gap read)', surfaceNo: 11, owner: '43_', verb: 'GET', envelope: 'gapRead',
      // SCOPE-REQUIRED. 43_ refuses an unscoped request with INVALID_SCOPE: "company + country + marketplace
      // required". The scope shape is the page's own — IRContext.toScopeRequest (inventory-replenishment.js:12661)
      // returns exactly those three keys and null when any is missing, so the read is never issued unscoped.
      scopeRequired: true,
      build: function (ctx) {
        var sc = (ctx && ctx.scope) || null;
        if (!sc || !sc.company || !sc.country || !sc.marketplace) return { scope: {} };
        return { scope: { company: sc.company, country: sc.country, marketplace: sc.marketplace } };
      }
    },
    // S8-R4B-1 — moved from POST/command to GET/gapReadFlat. It was the one approved read travelling on the
    // write verb; the exception is gone. R4A also corrected the surface: Factory Inventory never calls this
    // action, the Weekly Shipping Plan draft-card indicator is its only caller.
    'factoryStockGuard.get': {
      surface: 'Weekly Shipping Plan guard indicator', surfaceNo: 4, owner: '71_', verb: 'GET', envelope: 'gapReadFlat',
      // The shipped caller always passes a shipping_plan_id, and the id is what selects the PLAN branch
      // (fsgEvaluatePlanOverage_) over the no-plan branch. Carrying it here is what lets the fixture model
      // the request the product actually makes rather than a degenerate one.
      build: function (ctx) {
        var id = (ctx && ctx.shipping_plan_id) || null;
        return id ? { shipping_plan_id: id } : {};
      }
    }
  };

  // ---------------------------------------------------------------------------------------------------------
  // The 44 tables the operator approved for READ in S8-R3A §3. Nothing here authorizes a write: this list
  // exists so the surface verifier can prove that every table reachable from the eleven actions was named in
  // the preflight the operator actually approved.
  // ---------------------------------------------------------------------------------------------------------
  var APPROVED_TABLES = [
    // PROTECTED_MASTER — 22
    'sku_details', 'sku_regional_details', 'marketplace_skus', 'marketplaces', 'pricing_list',
    'fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'campaigns', 'campaign_sku_lines',
    'warehouses', 'logistics_locations', 'carriers', 'carrier_rate_cards', 'carrier_lead_times',
    'shipment_route_templates', 'shipment_route_template_nodes', 'tax_referral_rates', 'tax_rate_components',
    'amazon_inventory_snapshot', 'amazon_daily_sales_snapshot', 'amazon_weekly_sales_snapshot',
    // TEST_OWNED_TRANSACTION — 16
    'request_orders', 'request_order_lines', 'request_order_line_sources',
    'purchase_orders', 'purchase_order_lines', 'shipping_plans', 'shipping_plan_lines',
    'shipments', 'shipment_lines', 'shipment_events', 'shipment_routes',
    'shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'generated_documents',
    'overseas_inventory_movements', 'factory_stock_override_audit',
    // REBUILDABLE_OPERATIONAL_STATE — 2 (READ only this round; the §2 mutation authorization is not exercised)
    'factory_stock', 'overseas_inventory_snapshot',
    // READ_ONLY_DERIVED — 2 (operator-approved READ)
    'inventory_replenishment_gap', 'order_planning_gap',
    // UNAUTHORIZED_UNKNOWN — 2 (operator-approved bounded READ; NOT registered by this round)
    'supplier_price_list', 'amazon_inventory_health_snapshot'
  ];

  // Tables the operator granted bounded READ for without registering. Recorded separately so a later round
  // cannot mistake "we read it once under approval" for "it is in the registry".
  var BOUNDED_READ_NOT_REGISTERED = ['supplier_price_list', 'amazon_inventory_health_snapshot'];

  // ---------------------------------------------------------------------------------------------------------
  // Actions this round deliberately does NOT exercise, with the reason. An exclusion that is not written down
  // reads as an oversight later, and two of these are corrections to S8-R3A rather than choices.
  // ---------------------------------------------------------------------------------------------------------
  var EXCLUDED = {
    'rawInventory.get': 'ROUTED AND HANDLED BUT UNREACHABLE — no shipped frontend file references it. ' +
      'S8-R3A §2 attributed it to Factory Inventory; the page does not call it.',
    'openPoRemaining.raw.get': 'ROUTED AND HANDLED BUT UNREACHABLE — no shipped frontend file references it. ' +
      'S8-R3A §2 attributed it to PO Overview; the page does not call it.',
    'leadTime.raw.get': 'ROUTED AND HANDLED BUT UNREACHABLE — no shipped frontend file references it. ' +
      'It is one of the two readers of supplier_price_list named in S8-R3A §1.2.',
    'carrierLeadTime.upsert': 'A WRITE. Carrier Rate Card was already deferred to S8-R4 by S8-R3A §2.'
  };

  function isObj(v) { return !!v && typeof v === 'object' && Object.prototype.toString.call(v) !== '[object Array]'; }
  function str(v) { return (v === undefined || v === null) ? '' : String(v); }

  // The router's COMPLETE action vocabulary, pinned from 01_router.gs (the GET read table + the POST if-chain
  // + doGet's own branches). It exists for ONE job: deciding whether an arbitrary string pulled out of a
  // request URL is an application action at all.
  //
  // The CDP guard needs that, because A FORBIDDEN ACTION IS FORBIDDEN WHEREVER IT IS POINTED, not only when
  // it is aimed at the deployment host. A guard that asks "is this the application host?" first will wave the
  // same action through to any other address — which is not a hypothetical: the local interception proof
  // aimed gapJob.status.get at a sink on 127.0.0.1 and watched it arrive.
  //
  // Pinned rather than derived at runtime because this module also loads in a browser, where there is no .gs
  // file to read. The R4A suite re-derives it from the router and fails on any drift.
  var ROUTER_VOCABULARY = [
    'adjustFactoryInventory', 'adjustOverseasInventory', 'aiPlanFirstLayer.get', 'appendShippingPlanNote',
    'auditFcSpecialEventIds', 'automationSchedule.get', 'automationSchedule.update',
    'backfillFcSpecialEventIds', 'cancelRequestOrderTier', 'cancelShipmentDraft',
    'cancelShippingAllocationDraft', 'carrierLeadTime.duplicateCensus', 'carrierLeadTime.upsert',
    'completeShippingPlan', 'confirmShipmentAndDispatch', 'createPurchaseOrderFromRequest',
    'createRequestOrderDraft', 'createShipmentFromPlan', 'createShippingPlansBatch', 'deleteFcSpecialEvent',
    'deleteFcTargetRule', 'document.diagnostic.purchaseOrder', 'document.diagnostic.shipment',
    'document.get', 'document.list', 'document.retry', 'documentTemplate.getFields',
    'documentTemplate.list', 'factoryInventory.import.commit', 'factoryInventory.import.validate',
    'factoryOperationConfig.get', 'factoryOperationConfig.save', 'factoryStockGuard.get',
    'fcSummary.raw.get', 'fcSummary.workspace.get', 'finalizeShipmentFinalOutput',
    'flowASchemaLineagePreflight', 'gapJob.status.get', 'generateRecommendationDraftLocked',
    'generateShipmentLineAllocations', 'getClientCapabilities', 'getOperationDb',
    'getRecommendationDraftToken', 'getShipmentFinalOutput', 'getShippingAllocationDraftWorkspace',
    'getShippingMethodCandidates', 'getTable', 'importCarrierRateCards', 'importFcRegularForecastBatch',
    'importFcSpecialEventsBatch', 'importMarketplaceSkusBatch', 'importOverseasInventorySnapshotBatch',
    'inventoryReplenishment.workspace.get', 'inventoryReplenishmentGap.get',
    'inventoryReplenishmentGap.job.cancel', 'inventoryReplenishmentGap.job.start',
    'inventoryReplenishmentGap.recalculate.all', 'inventoryScope.registry.get', 'leadTime.raw.get',
    'openPoRemaining.raw.get', 'orderPlanningGap.get', 'orderPlanningGap.job.cancel',
    'orderPlanningGap.job.start', 'orderPlanningGap.recalculate.all', 'overseasStock.workspace.get',
    'pricing.fxReconcile', 'pricing.update', 'pricing.write.status', 'productPricing.siteUniverse.get',
    'productPricing.workspace.get', 'purchaseOrder.workspace.get', 'rawInventory.get',
    'receivePurchaseOrderLines', 'recommendation.workspace.get', 'renderShipmentDocument',
    'replenishmentDemandAllocation.save', 'requestOrder.allocationDraft.ensureAndEdit',
    'requestOrder.send.orchestrate', 'requestOrder.send.status', 'requestOrder.sendWorkset.get',
    'requestOrder.workspace.get', 'requestOrderDraft.generateFromGap', 'requestOrderDraft.getActive',
    'requestOrderDraft.job.cancel', 'requestOrderDraft.job.continue', 'requestOrderDraft.job.start',
    'requestOrderDraft.job.status', 'retireShipmentLabelColumns', 'runAmazonSnapshotImports',
    'seedSinotransCarrier', 'shipment.eta.update', 'shipment.receipt.update', 'shipment.route.advance',
    'shipment.workspace.get', 'shipmentDocument.generate', 'shipmentDocument.get', 'shipmentDocument.list',
    'skuDetails.workspace.get', 'submitAllocationDraftsToShippingPlans',
    'submitRequestOrderAllocationDrafts', 'submitShippingAllocationDrafts',
    'syncMarketplaceSkusToSkuRegionalDetails', 'system.allocationDraftIdentityDiagnostic',
    'system.executionPlanConflictDiagnostic', 'system.executionPlanDuplicateLineDiagnostic',
    'system.health', 'system.requestOrderSendDiagnostic', 'system.requestOrderSendDiagnosticStatus',
    'system.requestOrderSendReconcile', 'system.shippingAllocationDraftDiagnostic',
    'system.shippingAllocationSchemaDiagnostic', 'system.submitFlowDiagnostic',
    'system.twoVerticalFlowsDiagnostic', 'updateMarketplaceSkuModel', 'updatePurchaseOrderHeader',
    'updatePurchaseOrderLine', 'updatePurchaseOrderStatus', 'updateRecommendationDecisionLocked',
    'updateRequestOrderLineQty', 'updateRequestOrderStatus', 'updateShipment', 'updateShippingPlanLineQty',
    'updateShippingPlanStatus', 'updateSkuLifecycle', 'upsertCampaign', 'upsertCampaignSkuLines',
    'upsertFcSpecialEvent', 'upsertFcTargetRule', 'upsertMarketplace', 'upsertMarketplaceSku',
    'upsertRequestOrderAllocationDraft', 'upsertRequestOrderAllocationDraftLines',
    'upsertRequestOrderSiteConfirmations', 'upsertShippingAllocationDraft',
    'upsertShippingAllocationDraftAtomic', 'upsertShippingAllocationDraftLines', 'upsertSkuDetail',
    'upsertSkuRegionalDetail', 'upsertTaxRateComponent', 'upsertTaxReferralRate', 'warehouseAllocation.get',
    'weeklyAiPlan.generate', 'weeklyShipping.workspace.get'
  ];
  var _VOCAB = {};
  ROUTER_VOCABULARY.forEach(function (a) { _VOCAB[a] = 1; });
  function isKnownAction(a) {
    var s = str(a).trim();
    return s !== '' && (_VOCAB[s] === 1 ||
      Object.prototype.hasOwnProperty.call(APPROVED, s) ||
      Object.prototype.hasOwnProperty.call(FORBIDDEN_ACTIONS, s) ||
      Object.prototype.hasOwnProperty.call(EXCLUDED, s));
  }
  function approvedActions() { return Object.keys(APPROVED).sort(); }
  // The actions whose owner refuses an unscoped request. Exposed so a runner can label the sample rather than
  // average a 1 ms validation refusal into a surface's measured cost - which is how a round reports a defect
  // that is really its own missing parameter.
  function scopeRequiredActions() {
    return Object.keys(APPROVED).filter(function (a) { return APPROVED[a].scopeRequired === true; }).sort();
  }
  function surfaceOf(action) { return APPROVED[action] ? APPROVED[action].surface : null; }

  // ---------------------------------------------------------------------------------------------------------
  // THE DTO. Three envelope shapes, because the shipped client has three.
  // ---------------------------------------------------------------------------------------------------------
  function buildDto(action, requestId, ctx) {
    var spec = APPROVED[action];
    if (!spec) throw new Error('S8R3B_ACTION_NOT_APPROVED — ' + action);
    var payload = spec.build(ctx);
    if (spec.envelope === 'foundation') {
      // km-api-foundation.js buildRequestEnvelope / the per-resolver builders.
      return { apiVersion: API_VERSION, action: action, requestId: requestId, payload: payload, context: { actor: null, clientVersion: null } };
    }
    if (spec.envelope === 'gapRead') {
      // operation-system-db-api.js _kmGapRead_: dto = Object.assign({action}, {payload:{...}}) + requestId.
      return { action: action, payload: payload, requestId: requestId };
    }
    if (spec.envelope === 'gapReadFlat') {
      // The SAME dispatcher, called WITHOUT the payload wrapper — _kmGapRead_(action, payload) rather than
      // _kmGapRead_(action, {payload}). Its handler reads the fields at the top level of the body, so the
      // two shapes are not interchangeable: wrapping would put them where the handler never looks.
      return Object.assign({ action: action }, payload, { requestId: requestId });
    }
    // _kmWeeklyCommand_: body = Object.assign({action}, payload). No apiVersion, no context, no requestId field.
    return Object.assign({ action: action }, payload);
  }

  // km-transport.js readQuery() — the same rule, in the same order. The body JSON is omitted entirely when it
  // is '{}' , which is a real difference in bytes on the wire and therefore reproduced rather than tidied away.
  function readQuery(action, dto, requestId) {
    var qp = 'action=' + encodeURIComponent(action) + '&km_via=get&km_tc=' + TRANSPORT_CONTRACT_VERSION;
    if (requestId) qp += '&km_rid=' + encodeURIComponent(requestId);
    var payload = JSON.stringify(isObj(dto) ? dto : {});
    if (payload !== '{}') qp += '&km_body=' + encodeURIComponent(payload);
    return qp;
  }
  function postQuery(action, requestId) {
    var q = 'action=' + encodeURIComponent(action) + '&km_via=post&km_tc=' + TRANSPORT_CONTRACT_VERSION;
    if (requestId) q += '&km_rid=' + encodeURIComponent(requestId);
    return q;
  }

  // A request id that is valid to the client's own pattern (/^REQ-[A-Za-z0-9_-]{1,40}$/) and carries the round
  // in it, so an echo in any server-side diagnostic names the fatigue run rather than an anonymous read.
  // It deliberately does NOT contain the token S8T: that namespace is reserved for test DATA, the live census
  // proved it is currently unused, and a read has no business putting it anywhere.
  var _seq = 0;
  function nextRequestId() { _seq++; return 'REQ-S8R3B-' + ('0000' + _seq).slice(-4); }
  function resetSequence() { _seq = 0; }

  // ---------------------------------------------------------------------------------------------------------
  // THE GATE. Every dispatch goes through this and nothing else does.
  // ---------------------------------------------------------------------------------------------------------
  function decide(req) {
    req = req || {};
    var action = str(req.action).trim();
    var method = str(req.method).toUpperCase() || 'GET';
    var url = str(req.url);

    if (action === '') return refuse('NO_ACTION', 'A request with no action cannot be matched against the approved set.');
    if (Object.prototype.hasOwnProperty.call(FORBIDDEN_ACTIONS, action)) {
      return refuse('ACTION_FORBIDDEN', FORBIDDEN_ACTIONS[action], action);
    }
    if (!Object.prototype.hasOwnProperty.call(APPROVED, action)) {
      return refuse('ACTION_NOT_IN_APPROVED_SET',
        'Deny by default: this action is not one of the ' + approvedActions().length +
        ' approved in the S8-R3A preflight. Standing gate rule 1.', action);
    }
    var spec = APPROVED[action];
    if (method !== spec.verb) {
      return refuse('VERB_MISMATCH',
        'The shipped client sends ' + action + ' as ' + spec.verb + '. A fatigue run that changes the verb is ' +
        'measuring a different request and, on a POST, could reach a different dispatch chain.', action);
    }
    if (url !== '' && url.indexOf('https://script.google.com/macros/s/') !== 0) {
      return refuse('ENDPOINT_NOT_STABLE_EXEC',
        'Only the stable /macros/s/<deployment>/exec endpoint may be requested. A googleusercontent echo ' +
        'target is never a re-usable endpoint.', action);
    }
    if (url.length > READ_URL_MAX) {
      return refuse('READ_URL_TOO_LARGE', 'url_chars ' + url.length + ' > ' + READ_URL_MAX, action);
    }
    return { ok: true, code: 'DISPATCH_AUTHORIZED', action: action, verb: spec.verb, surface: spec.surface };
  }
  function refuse(code, reason, action) {
    return { ok: false, code: code, reason: reason, action: action || null, dispatched: false };
  }

  // Pull the action out of a URL or a POST body, so an interceptor can decide on a request it did not build.
  // Returns '' when it cannot tell — and '' is refused by decide(), which is the safe direction.
  function actionFromRequest(url, postData) {
    var u = str(url), m = /[?&]action=([^&]*)/.exec(u);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
    var b = str(postData);
    if (b !== '') {
      try { var o = JSON.parse(b); if (isObj(o) && o.action) return String(o.action); } catch (e) {}
    }
    return '';
  }

  // Build the complete request an approved action would send. Refuses through the same gate it protects, so
  // there is no path that constructs a request without being decided.
  function buildRequest(baseUrl, action, requestId, ctx) {
    var spec = APPROVED[action];
    if (!spec) return { decision: decide({ action: action, method: 'GET' }) };
    var rid = requestId || nextRequestId();
    var dto = buildDto(action, rid, ctx);
    var base = str(baseUrl);
    var sep = base.indexOf('?') < 0 ? '?' : '&';
    var url, body = null;
    if (spec.verb === 'GET') {
      url = base + sep + readQuery(action, dto, rid);
    } else {
      url = base + sep + postQuery(action, rid);
      body = JSON.stringify(dto);
    }
    var decision = decide({ action: action, method: spec.verb, url: url });
    return { decision: decision, url: url, method: spec.verb, body: body, dto: dto, requestId: rid, spec: spec };
  }

  return {
    ROUND: ROUND,
    API_VERSION: API_VERSION,
    TRANSPORT_CONTRACT_VERSION: TRANSPORT_CONTRACT_VERSION,
    READ_URL_MAX: READ_URL_MAX,
    GET_BODY_MAX: GET_BODY_MAX,
    APPROVED: APPROVED,
    FORBIDDEN_ACTIONS: FORBIDDEN_ACTIONS,
    EXCLUDED: EXCLUDED,
    APPROVED_TABLES: APPROVED_TABLES,
    BOUNDED_READ_NOT_REGISTERED: BOUNDED_READ_NOT_REGISTERED,
    approvedActions: approvedActions,
    ROUTER_VOCABULARY: ROUTER_VOCABULARY,
    isKnownAction: isKnownAction,
    scopeRequiredActions: scopeRequiredActions,
    surfaceOf: surfaceOf,
    buildDto: buildDto,
    readQuery: readQuery,
    postQuery: postQuery,
    nextRequestId: nextRequestId,
    resetSequence: resetSequence,
    decide: decide,
    actionFromRequest: actionFromRequest,
    buildRequest: buildRequest
  };
}));
