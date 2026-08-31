// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 01_router.gs — doGet / doPost action routing
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

// ========================================
// Kitchen Mama Operation System - Google Apps Script Web App
// Read + Write API for Google Sheet DB
// ========================================

/**
 * Main entry point for GET requests.
 * Supports actions: getOperationDb, getTable
 */
// F1-7N-FB-4D §E — deployment build stamp for the ROUTER. FB-4D changed nothing here; the stamp records the
// round that last changed it (F1-7N-FB-4C-R1, the POST_ONLY_ACTION_ON_GET terminal answer). The router is the
// one file whose staleness is invisible from the client: a stale router still answers every request, it just
// answers an older contract.
// F1-7N-FB-4E-R2 §3 — R2 CHANGED THIS FILE, so the stamp moves and the action contract moves with it.
// system.executionPlanDuplicateLineDiagnostic had a handler in 68_ and a docstring declaring it an action, and
// NO dispatch branch in any commit ever — so the handler was unreachable while the frontend required it.
// F1-7N-FB-4E-R4B-R3 §1 - THE STAMP FOLLOWS THE BEHAVIOUR. R4B-R2 changed this file's GET read dispatch (it
// double-wrapped a handler that already returned a TextOutput, so three read actions answered "{}"), and the
// stamp stayed at R4A1. checkDeploymentContract() therefore reported a build that no longer described the code
// it was running - the deployment was truthful about its ACTION CONTRACT and untruthful about its IDENTITY, and
// only the identity tells an operator whether the fix they are looking for is actually deployed.
var RTR_BUILD_VERSION_ = 'F1-7N-FB-4E-R4B-R3';

// =============================================================================================================
// F1-7N-FB-4E-R4A1 §3 — READ ACTIONS ARE SERVED ON GET, AND THIS IS WHY.
//
// MEASURED, NOT ASSUMED. An Apps Script /exec request is never answered at /exec: it is answered with a 302 to
// script.googleusercontent.com/macros/echo?user_content_key=..., and the browser follows that itself. The R4A1
// matrix executed every shape through this router behind that hop:
//
//   browser navigation GET          302 -> echo 200   handler ran    JSON success=true
//   fetch GET (getTable)            302 -> echo 200   handler ran    JSON success=true
//   repeated fetch GET from /exec   302 -> echo 200   5/5 success
//   fetch POST                      302 -> echo 404   NO handler     body LOST      -> HTTP_TRANSPORT_ERROR
//   fetch POST (echo resolves back) 302 -> doGet 200  handler ran    body LOST      -> REQUEST_METHOD_DOWNGRADED
//   direct GET to an echo target    no redirect, 404 — a googleusercontent URL is not a re-usable endpoint
//
// Both live failures are properties of a POST crossing that hop, and per the Fetch spec they are UNAVOIDABLE
// for a POST: a 302 following a POST is re-issued as a GET with the body dropped. A GET has nothing to lose --
// everything the router needs is already in the URL — which is exactly why the only reads this app has always
// sent as GET (getTable, getOperationDb) have never shown either failure, and why pasting the /exec URL into a
// browser has always worked.
//
// So reads are served on GET. This is NOT a workaround and NOT a second contract: the GET carries the SAME body
// it would have POSTed, in `km_body`, and dispatches to the SAME handler the POST entry point dispatches to — the
// table below holds function REFERENCES, so a handler cannot be renamed for one verb and not the other.
//
// WRITES ARE NOT IN THIS TABLE AND CANNOT BE. Every entry is a read whose zero-write behaviour is asserted
// BEHAVIOURALLY by the R4A1 suite: each action is executed against an instrumented spreadsheet whose write
// primitives record every call, and membership requires that count to be zero. A write reaching a GET would
// otherwise be replayable by a browser prefetch, a crawler or a history revisit, which is the one thing that
// must never become possible.
// =============================================================================================================

// The GET body cap. Google's practical URL ceiling is several kilobytes; this is set well below it so an
// oversized read FAILS CLOSED with a named reason instead of being silently truncated into a different request.
var RTR_GET_BODY_MAX_ = 4000;

function rtrGetReadHandlers_() {
  return {
    // Scoped page workspaces (read-only owners; the client's primary render reads)
    'skuDetails.workspace.get':                    handleSkuDetailsWorkspaceGet_,
    'weeklyShipping.workspace.get':                handleWeeklyShippingWorkspaceGet_,
    'fcSummary.workspace.get':                     handleFcSummaryWorkspaceGet_,
    'purchaseOrder.workspace.get':                 handlePurchaseOrderWorkspaceGet_,
    'requestOrder.workspace.get':                  handleRequestOrderWorkspaceGet_,
    'inventoryReplenishment.workspace.get':        handleInventoryReplenishmentWorkspaceGet_,
    'overseasStock.workspace.get':                 handleOverseasStockWorkspaceGet_,
    'shipment.workspace.get':                      handleShipmentWorkspaceGet_,
    'recommendation.workspace.get':                handleRecommendationWorkspaceGet_,
    // Scoped gap / composer reads
    'inventoryReplenishmentGap.get':               handleGetInventoryReplenishmentGap_,
    'orderPlanningGap.get':                        handleGetOrderPlanningGap_,
    'aiPlanFirstLayer.get':                        handleAiPlanFirstLayerGet_,
    'gapJob.status.get':                           handleGetGapJobStatus_,
    // Request Order read-backs and send-state reads (NO send, NO draft creation, NO conversion)
    'requestOrder.sendWorkset.get':                handleRequestOrderSendWorksetGet_,
    'requestOrder.send.status':                    handleRequestOrderSendStatus_,
    'requestOrderDraft.job.status':                handleGetRequestOrderDraftJobStatus_,
    'requestOrderDraft.getActive':                 handleGetActiveRequestOrderDraftReadback_,
    // Read-only diagnostics the pages consume
    'system.requestOrderSendDiagnosticStatus':     handleRequestOrderSendDiagnosticStatus_,
    'system.requestOrderSendReconcile':            handleRequestOrderSendReconcile_,
    'system.allocationDraftIdentityDiagnostic':    handleAllocationDraftIdentityDiagnostic_,
    // Config read (Script Properties; the UPDATE twin stays POST-only and is deliberately absent here)
    'automationSchedule.get':                      handleAutomationScheduleGet_
  };
}

function rtrGetReadActionList_() {
  var t = rtrGetReadHandlers_(), out = [];
  for (var k in t) { if (Object.prototype.hasOwnProperty.call(t, k)) out.push(k); }
  return out.sort();
}

// F1-7N-FB-4E-R4B-R2 §1 - THE READ TABLE'S HANDLERS DO NOT ALL RETURN THE SAME THING, AND THE DISPATCH
// ASSUMED THEY DID.
//
// R4A1 added the GET read table and dispatched it as `return jsonResponse_(handler(body))`. That is correct for
// the eighteen handlers that return a PLAIN ENVELOPE OBJECT - and wrong for the three that already return a
// ContentService TextOutput:
//
//     requestOrderDraft.getActive              (47_)  <- the Order Planning draft readback
//     system.requestOrderSendReconcile         (65_)
//     system.allocationDraftIdentityDiagnostic (67_)
//
// JSON.stringify(TextOutput) is "{}" - a TextOutput has no enumerable own properties - so those three answered
// every GET with the literal two-byte body {}. On the POST path the same handlers are returned DIRECTLY and are
// unaffected, which is exactly why this looked like a hydration defect rather than a transport one: every page
// still loaded (its workspace handler returns an object), and only the draft read came back empty. Measured
// end to end: 45 rows / 92 positive / 43 zero survive the readback filter and become 0 / 0 / 0 here.
//
// The dispatch now EMITS whatever the handler produced. A TextOutput is already a complete answer and is passed
// through untouched; a plain object is serialized. Nothing is double-wrapped, and a handler is free to return
// either - which is the property that was silently assumed and is now enforced at the one place it matters.
function rtrIsTextOutput_(v) {
  return !!(v && typeof v === 'object' && typeof v.getContent === 'function' && typeof v.setMimeType === 'function');
}
function rtrEmitHandlerResult_(v) {
  return rtrIsTextOutput_(v) ? v : jsonResponse_(v);
}

// Reconstruct the request body from the query string. Every failure here is TYPED and answers with zero reads:
// a malformed or oversized read must be a named refusal, never a partially-parsed request that runs anyway.
function rtrParseGetBody_(e, action) {
  var p = (e && e.parameter) ? e.parameter : {};
  var raw = (p.km_body === undefined || p.km_body === null) ? '' : String(p.km_body);
  function refuse(code, message, extra) {
    var out = { success: false, error: message, code: code, handler: 'doGet', received_method: 'GET',
      router_build: RTR_BUILD_VERSION_, attempted_action: action, zero_write: true, rows_read: 0,
      request_id: p.km_rid ? String(p.km_rid) : null,
      next_action: 'This is a client-side request-construction fault. Nothing was read. Retrying the same request cannot change it.' };
    if (extra) { for (var k in extra) out[k] = extra[k]; }
    return { error: out };
  }
  if (raw.length > RTR_GET_BODY_MAX_) {
    return refuse('READ_BODY_TOO_LARGE',
      'The read parameters exceed the GET body limit, so the request was refused without reading anything.',
      { body_bytes: raw.length, body_bytes_max: RTR_GET_BODY_MAX_ });
  }
  var body;
  if (raw === '') { body = {}; }
  else {
    try { body = JSON.parse(raw); }
    catch (err) { return refuse('READ_BODY_MALFORMED', 'The read parameters were not valid JSON, so nothing was read.'); }
  }
  if (!body || typeof body !== 'object' || Object.prototype.toString.call(body) === '[object Array]') {
    return refuse('READ_BODY_MALFORMED', 'The read parameters were not a JSON object, so nothing was read.');
  }
  // The action in the URL and the action in the body must agree. They are built from one value by the client, so
  // a disagreement is a construction fault — and answering it would mean serving an action nobody asked for.
  var bodyAction = (body.action === undefined || body.action === null) ? '' : String(body.action).trim();
  if (bodyAction !== '' && bodyAction !== action) {
    return refuse('READ_BODY_ACTION_MISMATCH',
      'The action in the URL and the action in the read parameters disagree, so nothing was read.',
      { body_action: bodyAction });
  }
  body.action = action;
  // The correlation id survives the URL exactly. It is the ONE identity field a GET read carries, and the
  // handlers echo it so the client can prove the answer belongs to the request it sent.
  if (!body.requestId && p.km_rid) body.requestId = String(p.km_rid);
  return { body: body };
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';

    // F1-7N-FB-4E-R4A1 §3 — ONE body for every GET read, parsed once and refused once if malformed.
    //
    // A GET read carries the body it would have POSTed in `km_body`. That is not only the new read table's
    // concern: system.health reads its probe list from the BODY, and while its branch looked only at the query
    // map, sending that read as a GET silently dropped the list and produced a confident "this deployment
    // predates the frontend" verdict about a deployment that was correct. So the parse happens HERE, above every
    // branch, and the merged form (query first, body last, so real arrays win over query strings) is what the
    // pre-existing GET branches receive — their previous `e.parameter` behaviour is preserved as the base.
    var _rtrGet = rtrParseGetBody_(e, action);
    if (_rtrGet.error) return jsonResponse_(_rtrGet.error);
    var _rtrGetBody = {};
    if (e && e.parameter) { for (var _pk in e.parameter) { if (Object.prototype.hasOwnProperty.call(e.parameter, _pk)) _rtrGetBody[_pk] = e.parameter[_pk]; } }
    for (var _bk in _rtrGet.body) { if (Object.prototype.hasOwnProperty.call(_rtrGet.body, _bk)) _rtrGetBody[_bk] = _rtrGet.body[_bk]; }

    if (action === 'getOperationDb') {
      return handleGetOperationDb_();
    }

    if (action === 'getTable') {
      var table = (e.parameter.table || '').trim();
      return handleGetTable_(table);
    }

    // F1-7N-FA-3C-R6E1-R1 — read-only client capability transport (single flag authority; see 03_).
    if (action === 'getClientCapabilities') {
      return handleGetClientCapabilities_();
    }

    // F1-7N-FB-2 §D — read-only production health. Routed on doGet AND doPost so the browser can probe the
    // deployment with either verb: a JSON answer here proves the deployment is reachable and that the DEPLOYED
    // code contains the actions the pages are about to call (a partial Apps Script sync is otherwise
    // indistinguishable from a transport fault). Returns no spreadsheet id, Drive id, token or row data.
    if (action === 'system.health') {
      // F1-7N-FB-4E §H — stamp the entry point so the answer can state WHICH handler served it as a fact
      // rather than the caller inferring it. system.health is routed on both verbs deliberately.
      // F1-7N-FB-4E-R4A1 — the MERGED body, so a GET read keeps its probe list (see the note above).
      var _hg = _rtrGetBody;
      _hg.__km_handler = 'doGet';
      return handleSystemHealth_(_hg);
    }

    // F1-7N-FB-3 §C — SLIM SCOPE REGISTRY (owner = 64_). One table, a six-column bounded projection: the only
    // thing Site Inventory needs to render its Country / Marketplace selectors. It exists so that populating a
    // dropdown no longer costs the 20-table inventoryReplenishment workspace read — which was also the read
    // that drove the inventory table's own load state, printing "Loading Inventory Replenishment…" while the
    // selectors were still unselected. Pure read: routed on BOTH verbs.
    if (action === 'inventoryScope.registry.get') {
      // F1-7N-FB-4E-R4A1 — the merged body, for the same reason: a scoped read must not lose its scope to the
      // verb it was sent with.
      return handleInventoryScopeRegistryGet_(_rtrGetBody);
    }

    // F1-7N-FB-4C-R1 §B/§D — NAME THE METHOD DOWNGRADE INSTEAD OF REPORTING AN ANONYMOUS MISSING PARAMETER.
    //
    // Every workspace read is sent as a POST, but an Apps Script /exec POST is answered with a 302 to
    // script.googleusercontent.com, and per the Fetch spec a 302 following a POST is re-issued as a GET WITH THE
    // BODY DROPPED. When that chain resolves back to /exec the request lands HERE, and this function used to
    // answer with a bare "Missing or invalid action parameter" — which the client could only report as a generic
    // backend error. That is the SKU Details / SKU Regional Details first-load failure.
    //
    // The client now also puts the action in the query string (transport.post), where a method downgrade cannot
    // remove it, so this branch can say exactly what happened and stay useful for an older client that does not.
    // Both answers keep the ORIGINAL message text as `error` — the client's unknown-action classifier and the
    // existing regression suites both key on it — and add the typed facts beside it.
    // F1-7N-FB-4E-R4A1 §3 — THE READ TABLE. Same handler, same body, one verb that survives the hop.
    var _rtrRead = rtrGetReadHandlers_();
    var _viaPost = !!(e && e.parameter && e.parameter.km_via === 'post');
    if (Object.prototype.hasOwnProperty.call(_rtrRead, action) && !_viaPost) {
      var _parsed = _rtrGet;
      // Stamp the entry point, as the other GET-routed reads already do, so an answer can state WHICH handler
      // served it as a fact rather than the caller inferring it from the verb.
      _parsed.body.__km_handler = 'doGet';
      // R4B-R2 §1 - EMIT, never re-wrap. See rtrEmitHandlerResult_ above for what re-wrapping cost.
      return rtrEmitHandlerResult_(_rtrRead[action](_parsed.body));
    }

    var attempted = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    var viaPost = !!(e && e.parameter && e.parameter.km_via === 'post');
    if (attempted || viaPost) {
      // F1-7N-FB-4E §L — THE CLIENT MUST NOT HAVE TO READ THIS PROSE TO KNOW WHAT HAPPENED.
      //
      // The client previously concluded "a POST was answered by doGet" by REGEX-MATCHING the sentence below,
      // which is unsound: any doGet answer carrying that sentence was labelled a method downgrade, and the
      // resulting message then asserted the action had been dropped even though the query string carried it.
      // §L allows the downgrade claim only on proof, so the three facts it still lacked are now stated
      // EXPLICITLY and machine-readably, beside the two that were already here:
      //   handler                 WHO answered (doGet), so a doPost answer can never be mistaken for one
      //   post_body_present       whether a body arrived at all — the fact that makes "the body was lost" true
      //   action_present_in_query whether the action survived the hop, so the client cannot claim it was lost
      // The `error` string is unchanged: existing classifiers and regression suites key on it.
      var _bodyPresent = !!(e && e.postData && typeof e.postData.contents === 'string' && e.postData.contents !== '');
      return jsonResponse_({
        success: false,
        error: 'Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or inventoryScope.registry.get',
        code: 'POST_ONLY_ACTION_ON_GET',
        received_method: 'GET',
        handler: 'doGet',
        router_build: RTR_BUILD_VERSION_,
        post_body_present: _bodyPresent,
        action_present_in_query: attempted !== '',
        attempted_action: attempted || null,
        request_id: (e && e.parameter && e.parameter.km_rid) ? String(e.parameter.km_rid) : null,
        client_transport_contract: (e && e.parameter && e.parameter.km_tc) ? String(e.parameter.km_tc) : null,
        sent_as_post: viaPost,
        zero_write: true,
        message: 'The action "' + (attempted || '(none)') + '" is served by doPost, but this request arrived as a GET. ' +
          'A POST answered by the GET handler means a redirect follow dropped the request body. Nothing was read or written.',
        next_action: 'Retry the read; if it repeats on every first load, hard-reload the page so the Apps Script session redirect is re-established.'
      });
    }
    // F1-7N-FB-4E §A/§L — even the ANONYMOUS answer names its handler and method. Without that the browser
    // cannot tell a doGet answer from a doPost answer, and "who answered" was the one thing it could not prove.
    return jsonResponse_({ success: false, error: 'Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or inventoryScope.registry.get',
      handler: 'doGet', received_method: 'GET', router_build: RTR_BUILD_VERSION_, zero_write: true });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message, handler: 'doGet', received_method: 'GET', router_build: RTR_BUILD_VERSION_ });
  }
}

/**
 * Main entry point for POST requests.
 * Supports actions: updateSkuLifecycle
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';

    // F1-7N-FA-3C-R6E1-R1 — read-only client capability transport (single flag authority; see 03_). The frontend
    // reads it via the canonical POST read runner (_kmGapRead_), so it is routed here as well as in doGet.
    if (action === 'getClientCapabilities') {
      return handleGetClientCapabilities_();
    }

    // F1-7N-FB-2 §D/§K — read-only health + Submit-to-Map flow readiness (zero writes, no Drive, no lock).
    if (action === 'system.health') {
      body.__km_handler = 'doPost';
      return handleSystemHealth_(body);
    }
    if (action === 'system.submitFlowDiagnostic') {
      return handleSubmitFlowDiagnostic_(body);
    }
    // F1-7N-FB-2A §F — read-only Execution Plan (shipping allocation draft) save readiness. It runs the SAME
    // production gates the write runs — the validate-only schema gate and the real draft-resolution authority —
    // and reports the exact token that would block the write, without writing a cell.
    if (action === 'system.shippingAllocationDraftDiagnostic') {
      return handleShippingAllocationDraftDiagnostic_(body);
    }
    // F1-7N-FB-4A §C — READ-ONLY Execution Plan identity CONFLICT diagnostic (owner = 68_). Answers, for one
    // exact route/business scope, which persisted row is in the way, which identity family it belongs to, which
    // business dimension makes it disagree, whether it already produced a Shipping Plan, and the safe idempotent
    // dispositions. It runs the REAL production authorities from 16_ and writes nothing.
    if (action === 'system.executionPlanConflictDiagnostic') {
      return jsonResponse_(handleExecutionPlanConflictDiagnostic_(body));
    }
    // F1-7N-FB-4A addendum §G — READ-ONLY Request Order Send diagnostic ownership + planning-cycle resolution
    // (owner = TEMP_request_order_send_diagnostics.gs). Routed so the WEBSITE can prove which file owns the TEMP
    // entrypoints and which cycle resolves, without anyone opening the Apps Script editor. Writes nothing.
    if (action === 'system.requestOrderSendDiagnosticStatus') {
      return jsonResponse_(handleRequestOrderSendDiagnosticStatus_(body));
    }
    // F1-7N-FB-3 §C — slim scope registry (see the doGet registration above for why it exists).
    // F1-7N-FB-4E-R2 §3 — READ-ONLY Execution Plan DUPLICATE-LINE diagnostic (owner = 68_).
    //
    // WHY THIS BRANCH DID NOT EXIST UNTIL NOW, STATED PLAINLY. handleExecutionPlanDuplicateLineDiagnostic_ has
    // been defined in 68_ since 83fc33f, that file documents it as the action
    // `system.executionPlanDuplicateLineDiagnostic`, and the frontend has required it in
    // KM_REQUIRED_DEPLOYED_ACTIONS_ since 88306ce — but it was never routed. Three artifacts asserted the
    // action existed and only the router disagreed, so the handler sat unreachable and the deployment-contract
    // probe reported a missing action that no publish could ever supply.
    //
    // It reports duplicate primary keys and PROPOSES a repair. It deletes nothing and writes nothing: the only
    // thing that can delete is TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP, which is editor-only, is NOT routed here,
    // and additionally requires TEMP_DUPFIX_MODE_ === 'COMMIT' plus a confirmation checksum covering the exact
    // rows. Exposing the REPORT does not expose the REPAIR.
    //
    // __km_handler is set for the same reason system.health sets it: so the answer states WHICH entry point
    // served it as a fact rather than the caller inferring it. 68_ also reads it as the "arrived over the
    // network" signal that makes an explicit scope mandatory, so an unscoped whole-table scan is refused here
    // while the editor path keeps its behaviour. Read-only, and it never writes, so it is routed on POST only
    // like its sibling diagnostic above.
    if (action === 'system.executionPlanDuplicateLineDiagnostic') {
      body.__km_handler = 'doPost';
      return jsonResponse_(handleExecutionPlanDuplicateLineDiagnostic_(body));
    }
    if (action === 'inventoryScope.registry.get') {
      return handleInventoryScopeRegistryGet_(body);
    }
    // F1-7N-FB-3 §E/§F/§K — read-only flow diagnostics (owner = 65_). Zero-configuration schema readiness for
    // the Execution Plan writer, Send Request readiness, and the composed two-vertical verdict. All read-only.
    if (action === 'system.shippingAllocationSchemaDiagnostic') {
      return handleShippingAllocationSchemaDiagnostic_(body);
    }
    if (action === 'system.requestOrderSendDiagnostic') {
      return handleRequestOrderSendDiagnostic_(body);
    }
    if (action === 'system.twoVerticalFlowsDiagnostic') {
      return handleTwoVerticalFlowsDiagnostic_(body);
    }
    // F1-7N-FB-3A §F — read-only reconciliation of an INTERRUPTED Send Request. A stopped saga is never
    // assumed to be a zero-write; this reports what actually landed and whether a retry is safe.
    if (action === 'system.requestOrderSendReconcile') {
      return handleRequestOrderSendReconcile_(body);
    }
    // F1-7N-FB-3B §E/§F — SEND REQUEST server orchestration + slim workset (owner = 66_).
    //   requestOrder.sendWorkset.get   READ-ONLY. Two tables, an include-gated slim projection. It exists so Send
    //     Request never depends on refreshing the 495-row AI-Plan payload (aiPlanFirstLayer.get reads ELEVEN tables).
    //   requestOrder.send.orchestrate  ONE client click -> ONE request -> ONE journaled, resumable saga. The workset
    //     is built SERVER-SIDE from the persisted allocation drafts, so the page's Country / Marketplace / Category /
    //     Risk / Show mode / SKU search / pagination controls cannot truncate a comprehensive business command: the
    //     handler accepts NO such parameter. The only business scope input is tier_scope (ALL / T1 / T2 / T3).
    //     Every mutation is delegated to an existing canonical writer (13_ create, 15_ submit) — no second writer.
    //     dry_run=true returns the frozen plan with zero writes; that is what the confirmation dialog is built from.
    if (action === 'requestOrder.sendWorkset.get') {
      return jsonResponse_(handleRequestOrderSendWorksetGet_(body));
    }
    if (action === 'requestOrder.send.orchestrate') {
      return jsonResponse_(handleRequestOrderSendOrchestrate_(body));
    }
    // F1-7N-FB-3C §D/§E — READ-ONLY journal status, so a page that RELOADS mid-Send can resume instead of
    // starting a second execution. Answers "what does the server think is happening, and may I continue?".
    if (action === 'requestOrder.send.status') {
      return jsonResponse_(handleRequestOrderSendStatus_(body));
    }
    // F1-7N-FB-3C §B — THE USER-AUTHORIZED DRAFT-CREATION BOUNDARY (owner = 15_). A deliberate user quantity
    // edit is now an authorized canonical draft-creation/update boundary, not only AI Plan. Find-or-create the
    // canonical Flat-V2 draft, persist the user quantity through the canonical locked writer, read it back and
    // return the persisted internal id. It NEVER mints a 'RAD-M-…' identity and never waits for Send.
    if (action === 'requestOrder.allocationDraft.ensureAndEdit') {
      return handleRequestOrderAllocationDraftEnsureAndEdit_(body);
    }
    // F1-7N-FB-3C §C — STRICTLY READ-ONLY reconciliation of non-canonical allocation-draft identities (the
    // retired 'RAD-M-…' rows). Reports, masks and PROPOSES an idempotent plan; it migrates nothing.
    if (action === 'system.allocationDraftIdentityDiagnostic') {
      return handleAllocationDraftIdentityDiagnostic_(body);
    }

    if (action === 'updateSkuLifecycle') {
      return handleUpdateSkuLifecycle_(body);
    }

    if (action === 'upsertSkuDetail') {
      return handleUpsertSkuDetail_(body);
    }

    if (action === 'upsertMarketplaceSku') {
      return handleUpsertMarketplaceSku_(body);
    }

    if (action === 'updateMarketplaceSkuModel') {
      return handleUpdateMarketplaceSkuModel_(body);
    }

    if (action === 'importMarketplaceSkusBatch') {
      return handleImportMarketplaceSkusBatch_(body);
    }

    if (action === 'upsertMarketplace') {
      return handleUpsertMarketplace_(body);
    }

    if (action === 'importFcRegularForecastBatch') {
      return handleImportFcRegularForecastBatch_(body);
    }

    if (action === 'importOverseasInventorySnapshotBatch') {
      return handleImportOverseasInventorySnapshotBatch_(body);
    }

    if (action === 'adjustOverseasInventory') {
      return handleAdjustOverseasInventory_(body);
    }

    if (action === 'runAmazonSnapshotImports') {
      return handleRunAmazonSnapshotImports_(body);
    }

    if (action === 'createShippingPlansBatch') {
      return handleCreateShippingPlansBatch_(body);
    }

    if (action === 'updateShippingPlanStatus') {
      return handleUpdateShippingPlanStatus_(body);
    }

    if (action === 'updateShippingPlanLineQty') {
      return handleUpdateShippingPlanLineQty_(body);
    }

    if (action === 'appendShippingPlanNote') {
      return handleAppendShippingPlanNote_(body);
    }

    if (action === 'completeShippingPlan') {
      return handleCompleteShippingPlan_(body);
    }

    // API v1 · Weekly Shipping Plan READ-ONLY Workspace (Phase API-2). A body-carrying READ (no write); owner =
    // 40_api_v1_weekly_workspace.gs. Reads only the Weekly tables (never getOperationDb). No business logic here.
    if (action === 'weeklyShipping.workspace.get') {
      return jsonResponse_(handleWeeklyShippingWorkspaceGet_(body));
    }

    // API v1 · Purchase Order READ-ONLY Workspace (Phase F1-7C). A body-carrying READ (no write); owner =
    // 50_api_v1_purchase_order_workspace.gs. Reads only the PO tables (never getOperationDb). The only projection is
    // the canonical read-model remaining_qty = max(0, completed - shipped); no FIFO / shipment / business write here.
    if (action === 'purchaseOrder.workspace.get') {
      return jsonResponse_(handlePurchaseOrderWorkspaceGet_(body));
    }

    // API v1 · Request Order READ-ONLY Workspace (Phase F1-7D). A body-carrying READ (no write); owner =
    // 51_api_v1_request_order_workspace.gs. Reads only the RO tables + the masters the Draft page consumes (never
    // getOperationDb). Composes persisted request_orders/request_order_lines ONLY — no Gap/Forecast/Recommendation,
    // no draft generation/persistence, no RO->PO conversion. No business logic here.
    if (action === 'requestOrder.workspace.get') {
      return jsonResponse_(handleRequestOrderWorkspaceGet_(body));
    }

    // API v1 · Shipment READ-ONLY Workspace (Phase F1-7F). A body-carrying READ (no write); owner =
    // 57_api_v1_shipment_workspace.gs. Reads only the Shipment table set (never getOperationDb); the On-the-Way MAP
    // tables (routes/events/locations/templates) are returned only when the include flag is set. Composes persisted
    // shipment facts ONLY — no FIFO, no allocation reconstruction, no PO shipped/receipt/factory-stock authority. No
    // business logic here.
    if (action === 'shipment.workspace.get') {
      return jsonResponse_(handleShipmentWorkspaceGet_(body));
    }

    // API v1 · FC Summary READ-ONLY Workspace (Phase F1-7G). A body-carrying READ (no write); owner =
    // 58_api_v1_fc_summary_workspace.gs. Reads only the FC Summary primary-render table set — fc_regular_forecast,
    // fc_special_events, fc_target_rules, marketplaces (never getOperationDb). Returns raw passthrough of the FULL FC
    // tables (the page's Year dropdown + non-cascading filter universes need the complete set; client keeps all
    // filtering/pagination). Emits ONLY raw persisted forecast rows — no Target% adjustment, no blending, no Gap/
    // Recommendation, and NOT the bounded 53_ raw-fact owner. No business logic here.
    if (action === 'fcSummary.workspace.get') {
      return jsonResponse_(handleFcSummaryWorkspaceGet_(body));
    }

    // API v1 · SKU Details READ-ONLY Workspace (Phase F1-7H). A body-carrying READ (no write); owner =
    // 59_api_v1_sku_details_workspace.gs. Reads only the SKU Details master/reference table set — sku_details,
    // tax_referral_rates, tax_rate_components (BASE); marketplace_skus, sku_regional_details (include.regional) — never
    // getOperationDb. Returns raw passthrough of the FULL tables (the pages' filter/lifecycle/country universes need the
    // complete set; client keeps all filtering/pagination). Authors NO write side effects — does NOT create sku_details/
    // marketplace_skus and does NOT initialize Factory Stock (that stays with master-SKU creation). No business logic here.
    // F1-7N-FB-4E-R3 §C — OVERSEAS STOCK scoped READ workspace (owner = 70_). Replaces the four-request
    // getTable fan-out the page mounted on: R3 §A measured that mount at FOUR requests, and on Apps Script each
    // request is a separate Web App execution, so four is four cold starts for one page. Read-only, no lock, no
    // write; routed on POST only, like the other body-carrying workspace reads.
    if (action === 'overseasStock.workspace.get') {
      return jsonResponse_(handleOverseasStockWorkspaceGet_(body));
    }
    if (action === 'skuDetails.workspace.get') {
      return jsonResponse_(handleSkuDetailsWorkspaceGet_(body));
    }

    // API v1 · Inventory Replenishment READ-ONLY Workspace (Phase F1-7I). A body-carrying READ (no write); owner =
    // 60_api_v1_inventory_replenishment_workspace.gs. Reads only the Inventory Replenishment primary-render table set
    // (the 19 tables the page's main-table assembly consumes) — never getOperationDb. Returns raw passthrough of the
    // FULL tables (the page derives scope + assembles per-SKU rows client-side; server-side narrowing would risk drift).
    // Authors NO Gap/Recommendation/allocation/FIFO/PO and creates NO Request Order (FLOW-A: Gap → Recommendation →
    // Shipping Plan → Shipment). Gap/Recommendation/allocation-draft stay on their existing separate scoped owners. No
    // business logic here.
    if (action === 'inventoryReplenishment.workspace.get') {
      return jsonResponse_(handleInventoryReplenishmentWorkspaceGet_(body));
    }

    // API v1 · AI-Plan Layer-1 RAW read owner (Phase F1-7E-PREREQ-1). A body-carrying READ (no write); owner =
    // 52_api_v1_open_po_remaining_owner.gs. Reads only purchase_orders + purchase_order_lines (never getOperationDb).
    // Exposes the RAW informational fact open_po_remaining_raw_qty per SKU (OPEN-PO statuses; persisted remaining_qty
    // preferred, else the current browser fallback). NOT the canonical PO remaining (50_) and NOT consumed by the AI
    // Plan yet (composed later in PREREQ-5). No business logic here.
    if (action === 'openPoRemaining.raw.get') {
      return jsonResponse_(handleOpenPoRemainingRawGet_(body));
    }

    // API v1 · AI-Plan Layer-1 RAW forecast read owner (Phase F1-7E-PREREQ-2). A body-carrying READ (no write); owner =
    // 53_api_v1_fc_summary_raw_owner.gs. Reads only fc_regular_forecast + fc_special_events (never getOperationDb).
    // Exposes basicFcRawT3Qty (raw fc_regular_forecast N+1..N+3 sum) + specialEventFcRawQty (raw fc_special_events
    // prep-month sum) per SKU, anchored on planning_cycle (NOT the clock). NO Target%, NO blending, NO Recommendation/
    // Gap; NOT the fcSummary workspace and NOT consumed by the AI Plan yet (composed later in PREREQ-5). No business
    // logic here.
    if (action === 'fcSummary.raw.get') {
      return jsonResponse_(handleFcSummaryRawGet_(body));
    }

    // API v1 · AI-Plan Layer-1 RAW inventory read owner (Phase F1-7E-PREREQ-3). A body-carrying READ (no write); owner =
    // 54_api_v1_raw_inventory_owner.gs. Reads only amazon_inventory_snapshot + overseas_inventory_snapshot +
    // factory_stock + warehouses (never getOperationDb). Exposes siteStockRawQty (latest snapshot) + overseasStockRawQty
    // (pooled) + factoryStockRawQty (shared per-SKU pool) — RAW pools, NO allocation, NOT the recommendation supply, and
    // NOT consumed by the AI Plan yet (composed later in PREREQ-5). No business logic here.
    if (action === 'rawInventory.get') {
      return jsonResponse_(handleRawInventoryGet_(body));
    }

    // API v1 · AI-Plan Layer-1 lead-time read owner (Phase F1-7E-PREREQ-4). A body-carrying READ (no write); owner =
    // 55_api_v1_lead_time_owner.gs. Reads only supplier_price_list (never getOperationDb). Exposes leadTimeDays per SKU
    // (active + latest effective_from; null when none/blank — EMPTY != ZERO). NOT a planning engine and NOT consumed by
    // the AI Plan yet (composed later in PREREQ-5). No business logic here.
    if (action === 'leadTime.raw.get') {
      return jsonResponse_(handleLeadTimeRawGet_(body));
    }

    // API v1 · AI-Plan first-layer COMPOSER (Phase F1-7E-PREREQ-5). A body-carrying READ (no write); owner =
    // 56_api_v1_ai_plan_first_layer.gs. Reads a TARGETED table set (never getOperationDb) and REUSES the 52_/53_/54_/55_
    // pure Layer-1 fact functions to return the SAME rows the browser _buildRequestOrderRowsFromDb() builds. NO new
    // formula, NO second engine; Layer-2 Gap/Recommendation stay on their existing scoped paths. No business logic here.
    if (action === 'aiPlanFirstLayer.get') {
      return jsonResponse_(handleAiPlanFirstLayerGet_(body));
    }

    // API v1 · Recommendation READ-ONLY Workspace (Phase F1-4B-A). A body-carrying READ (no write); owner =
    // 42_api_v1_recommendation_workspace.gs. Targeted canonical tables → KMPA → KMPS → resolver (never getOperationDb,
    // never writes/persists/creates a draft). No business logic here.
    if (action === 'recommendation.workspace.get') {
      return jsonResponse_(handleRecommendationWorkspaceGet_(body));
    }

    // F1-4B-FM5 · Materialized Gap batch recalculation (owner = 43_api_v1_gap_materialization.gs). ONE bounded
    // server batch per manual button: enumerate scopes → reuse the canonical recommendation calc per scope →
    // UPSERT the latest result into inventory_replenishment_gap / order_planning_gap. Writes ONLY those two
    // tables; no new formula; fails closed if the table/header is missing. No business logic here.
    if (action === 'inventoryReplenishmentGap.recalculate.all') {
      return jsonResponse_(handleRecalculateInventoryReplenishmentGapBatch_(body));
    }
    if (action === 'orderPlanningGap.recalculate.all') {
      return jsonResponse_(handleRecalculateOrderPlanningGapBatch_(body));
    }

    // F1-4B-FM5-R1 · Materialized Gap READ (page reads STORED result; NO calculation on expand). Bounded read of
    // inventory_replenishment_gap / order_planning_gap by company/country/marketplace(/sku). No business logic here.
    if (action === 'inventoryReplenishmentGap.get') {
      return jsonResponse_(handleGetInventoryReplenishmentGap_(body));
    }
    if (action === 'orderPlanningGap.get') {
      return jsonResponse_(handleGetOrderPlanningGap_(body));
    }

    // F1-4B-FM5-R4J · Backend-owned RESUMABLE gap materialization job (owner = 46_api_v1_gap_materialization_job.gs).
    // START = a quick write that acquires the script lock, freezes the calc context, enumerates scopes, records
    // Script-Property job state (cursor=0), schedules the first one-off continuation trigger, and returns
    // IMMEDIATELY (no calculation in the request). The backend then owns the job across self-re-arming triggers,
    // independent of the browser tab. STATUS is strictly READ-ONLY. No new formula, no DB schema. No business logic here.
    if (action === 'inventoryReplenishmentGap.job.start') {
      return jsonResponse_(handleStartInventoryReplenishmentGapJob_(body));
    }
    if (action === 'orderPlanningGap.job.start') {
      return jsonResponse_(handleStartOrderPlanningGapJob_(body));
    }
    if (action === 'gapJob.status.get') {
      return jsonResponse_(handleGetGapJobStatus_(body));
    }
    // F1-4B-FM5-R4J-LIVE4 — manual CANCEL (WRITE): terminal CANCELLED for the active product job; per-product isolated.
    if (action === 'inventoryReplenishmentGap.job.cancel') {
      return jsonResponse_(handleCancelInventoryReplenishmentGapJob_(body));
    }
    if (action === 'orderPlanningGap.job.cancel') {
      return jsonResponse_(handleCancelOrderPlanningGapJob_(body));
    }

    // Weekly Plan Layer-1 (Rationale) + Layer-2 (Carrier & Cost) + Combined Plan + Method Recommendation (2026-07-28).
    if (action === 'getShippingMethodCandidates') {   // Execution Plan recommendation + Weekly L1 cascade (read-only)
      return handleGetShippingMethodCandidates_(body);
    }
    // F1-7K-HOTFIX-ROUTER-CLOSURE-R1: the Weekly Plan Layer-1 (Rationale) / Layer-2 (Carrier & Cost) / Combined-Plan
    // actions — getWeeklyPlanRateCandidates, updateShippingPlanRationale, selectShippingPlanCarrier,
    // combineShippingPlans, uncombineShippingPlans — were dispatched here but their handlers were NEVER implemented in
    // the backend (ROUTER_HANDLER_CLOSURE failure: dispatch → undefined function → ReferenceError if ever called).
    // Audited: ZERO live frontend callers (the db-api _kmShippingPost_ stubs exist but are unwired). An action must not
    // be advertised/dispatched before its handler contract exists, so these five dispatches are REMOVED to make the
    // Apps Script source a clean deployable unit. NO business functionality was implemented or changed. If a caller is
    // ever wired, its POST now falls through to the unknown-action default and returns a clean fail-closed envelope
    // (surfaced as BACKEND_ERROR by the hardened foundation) instead of a runtime ReferenceError.

    if (action === 'createShipmentFromPlan') {
      return handleCreateShipmentFromPlan_(body);
    }

    // F1-5B-SHIP-R3A — generate/reconcile DRAFT PO→FIFO→shipment_line allocations (no shipped_qty mutation).
    if (action === 'generateShipmentLineAllocations') {
      return handleGenerateShipmentLineAllocations_(body);
    }

    if (action === 'updateShipment') {
      return handleUpdateShipment_(body);
    }

    // Confirm Shipment & Dispatch — single orchestration command (2026-07-24): finalize Formal Shipment
    // (in_transit) + snapshot shipment_routes + create initial shipment_event + deduct factory_stock,
    // atomically (lock + staged-write + rollback) and idempotently. See 22_shipment_dispatch_handlers.gs.
    if (action === 'confirmShipmentAndDispatch') {
      return handleConfirmShipmentAndDispatch_(body);
    }

    // F1-5C-EXPORT-R2B — canonical immutable final-output snapshot. finalize = idempotent post-dispatch
    // materialization (eligible from shipments.status=shipped onward — F1-7N-FB-1B §E; NOT inside the dispatch
    // transaction); get = the ONE frozen read owner (no re-resolve of masters). 34_shipment_final_output_handlers.gs.
    if (action === 'finalizeShipmentFinalOutput') {
      return handleFinalizeShipmentFinalOutput_(body);
    }
    if (action === 'getShipmentFinalOutput') {
      return handleGetShipmentFinalOutput_(body);
    }

    // F1-5C-EXPORT-R3A — render Shipping Detail / Packing List from the frozen R2B snapshot (presentation only;
    // no live-master read, no persisted generated document). See 35_shipment_document_renderer.gs.
    if (action === 'renderShipmentDocument') {
      return handleRenderShipmentDocument_(body);
    }

    // F1-5C-EXPORT-R3B — persisted document template / field-mapping / generated-document runtime. Renders via the
    // R3A renderer (snapshot only), resolves ONE active document_templates row, maps document_template_fields, and
    // idempotently upserts a generated_documents lifecycle record. See 36_document_template_handlers.gs.
    if (action === 'documentTemplate.list') {
      return handleDocumentTemplateList_(body);
    }
    if (action === 'documentTemplate.getFields') {
      return handleDocumentTemplateGetFields_(body);
    }
    if (action === 'shipmentDocument.generate') {
      return handleShipmentDocumentGenerate_(body);
    }
    if (action === 'shipmentDocument.get') {
      return handleShipmentDocumentGet_(body);
    }
    if (action === 'shipmentDocument.list') {
      return handleShipmentDocumentList_(body);
    }

    // F1-7N-FB-1B — the system-computed document runtime (39_document_runtime_service.gs). One canonical service
    // for the UI action, retry and any future API caller. `document.list` is the read path the Shipment and
    // Purchase Order workspaces project into their Document Panels; the two diagnostics are STRICTLY read-only
    // (zero writes, no Drive folder or file created) and exist to be run BEFORE a controlled live test.
    if (action === 'document.list') {
      return handleEntityDocumentList_(body);
    }
    if (action === 'document.get') {
      return handleGeneratedDocumentGet_(body);
    }
    if (action === 'document.retry') {
      return handleDocumentRetry_(body);
    }
    if (action === 'document.diagnostic.purchaseOrder') {
      return handlePoDocumentDiagnostic_(body);
    }
    if (action === 'document.diagnostic.shipment') {
      return handleShipmentDocumentDiagnostic_(body);
    }

    // Shipment Receipt + Route Progress (F1-SHIPMENT-RECEIPT-R1B). Receipt = cumulative write to the LIVE
    // shipment_lines.shipment_received_qty + backend-derived shipments.status; route advance = forward-only
    // current-point set on shipment_routes node statuses. See 31_shipment_receipt_route_handlers.gs.
    if (action === 'shipment.receipt.update') {
      return handleUpdateShipmentReceipt_(body);
    }
    if (action === 'shipment.route.advance') {
      return handleAdvanceShipmentRoutePoint_(body);
    }
    // F1-SHIPMENT-MAP-R10: bounded ETA-only writer (shipments.eta; never status/route/receipt).
    if (action === 'shipment.eta.update') {
      return handleUpdateShipmentEta_(body);
    }

    // Procurement Layer (Phase 1) — Request Order / Purchase Order.
    if (action === 'createRequestOrderDraft') {
      return handleCreateRequestOrderDraft_(body);
    }

    if (action === 'updateRequestOrderStatus') {
      return handleUpdateRequestOrderStatus_(body);
    }

    if (action === 'updateRequestOrderLineQty') {
      return handleUpdateRequestOrderLineQty_(body);
    }

    if (action === 'cancelRequestOrderTier') {
      return handleCancelRequestOrderTier_(body);
    }

    if (action === 'createPurchaseOrderFromRequest') {
      return handleCreatePurchaseOrderFromRequest_(body);
    }

    if (action === 'updatePurchaseOrderStatus') {
      return handleUpdatePurchaseOrderStatus_(body);
    }

    if (action === 'updatePurchaseOrderLine') {
      return handleUpdatePurchaseOrderLine_(body);
    }

    if (action === 'updatePurchaseOrderHeader') {
      return handleUpdatePurchaseOrderHeader_(body);
    }

    if (action === 'receivePurchaseOrderLines') {
      return handleReceivePurchaseOrderLines_(body);
    }

    // FC Summary write path (Phase 1) — Special Events + Target % Rules.
    if (action === 'upsertFcSpecialEvent') {
      return handleUpsertFcSpecialEvent_(body);
    }

    if (action === 'importFcSpecialEventsBatch') {
      return handleImportFcSpecialEventsBatch_(body);
    }

    if (action === 'deleteFcSpecialEvent') {
      return handleDeleteFcSpecialEvent_(body);
    }

    // event_fc_id maintenance — read-only audit + one-time manual backfill (never auto-run).
    if (action === 'auditFcSpecialEventIds') {
      return handleAuditFcSpecialEventIds_(body);
    }

    if (action === 'backfillFcSpecialEventIds') {
      return handleBackfillFcSpecialEventIds_(body);
    }

    if (action === 'upsertFcTargetRule') {
      return handleUpsertFcTargetRule_(body);
    }

    if (action === 'deleteFcTargetRule') {
      return handleDeleteFcTargetRule_(body);
    }

    // Campaign write path (Special Event Builder: campaigns → campaign_sku_lines → fc_special_events).
    if (action === 'upsertCampaign') {
      return handleUpsertCampaign_(body);
    }

    if (action === 'upsertCampaignSkuLines') {
      return handleUpsertCampaignSkuLines_(body);
    }

    if (action === 'upsertRequestOrderAllocationDraft') {
      return handleUpsertRequestOrderAllocationDraft_(body);
    }

    if (action === 'upsertRequestOrderAllocationDraftLines') {
      return handleUpsertRequestOrderAllocationDraftLines_(body);
    }

    if (action === 'submitRequestOrderAllocationDrafts') {
      return handleSubmitRequestOrderAllocationDrafts_(body);
    }

    // Inventory Replenishment second-layer Recommendation / Execution Plan drafts (16_).
    if (action === 'upsertShippingAllocationDraft') {
      return handleUpsertShippingAllocationDraft_(body);
    }

    if (action === 'upsertShippingAllocationDraftLines') {
      return handleUpsertShippingAllocationDraftLines_(body);
    }

    // F1-7N-FA-3C-R6F1 — ATOMIC Header + Lines write (one lock; validate-all-before-write; compensation/COMMITTED_
    // UNVERIFIED/fail-closed). Additive; the legacy two-call path above stays available.
    if (action === 'upsertShippingAllocationDraftAtomic') {
      return handleUpsertShippingAllocationDraftAtomic_(body);
    }

    if (action === 'submitShippingAllocationDrafts') {
      return handleSubmitShippingAllocationDrafts_(body);   // F1-7N-FA-4B DEPRECATED alias → canonical Submit authority
    }

    // F1-7N-FA-4B — the ONE canonical Inventory AI Plan Submit authority (allocation drafts → Weekly Shipping Plan).
    if (action === 'submitAllocationDraftsToShippingPlans') {
      return handleSubmitAllocationDraftsToShippingPlans_(body);
    }

    // F1-7N-FA-4B1(I) — strictly read-only Flow A schema/lineage preflight (marketplace physical/logical + lineage tables).
    if (action === 'flowASchemaLineagePreflight') {
      return handleFlowASchemaLineagePreflight_(body);
    }

    if (action === 'getShippingAllocationDraftWorkspace') {
      return handleGetShippingAllocationDraftWorkspace_(body);
    }

    if (action === 'cancelShippingAllocationDraft') {
      return handleCancelShippingAllocationDraft_(body);
    }

    if (action === 'upsertRequestOrderSiteConfirmations') {
      return handleUpsertRequestOrderSiteConfirmations_(body);
    }

    // Phase 2C Round 1G — LOCKED recommendation generation bridge: Plan Builder → Persistence Core → Persistence
    // Plan Builder → LockService keyed-delta repository apply. The ONLY recommendation persistence write that is
    // lock-enforced; delegates entirely to the generated bundle (90_generated_supply_planning_bundle.gs) via
    // 24_recommendation_orchestrator.gs. Source mirror / NOT deployed; guarded (fails closed if the bundle is
    // absent). Legacy 15_/16_ unlocked writers remain for compatibility (enforcement is a later round).
    if (action === 'generateRecommendationDraftLocked') {
      return handleGenerateRecommendationDraftLocked_(body);
    }

    // F1-4B-FM6-R4E2 — BACKEND-ONLY gap-backed MONTHLY_ORDER draft generation + active-draft read-back (47_). The
    // generation persists via the SAME locked writer (generateRecommendationDraftLocked) with recommended_qty sourced
    // VERBATIM from order_planning_gap.tN_suggested_qty (never KMSF/calculateGap). No frontend wiring / no Order
    // Allocation reroute / no Send Request change this round — these are the backend contract the next UI round calls.
    if (action === 'requestOrderDraft.generateFromGap') {
      return handleGenerateRequestOrderDraftFromGap_(body);
    }
    if (action === 'requestOrderDraft.getActive') {
      return handleGetActiveRequestOrderDraftReadback_(body);
    }

    // F1-7N-D-2b — WEEKLY AI PLAN live generation owner (61_). Harvests canonical facts → KMWHA → KMWRB
    // (company,country) batch → per-marketplace K3 shipping_allocation_drafts via the frozen orchestrator + C1
    // semantics. Generation universe = company+country (marketplace is readback context only). Persists ONLY the
    // shipping-allocation draft tables; no Request Order / PO / shipment; no inventory reservation.
    if (action === 'weeklyAiPlan.generate') {
      return handleGenerateWeeklyAiPlanDraft_(body);
    }

    // F1-4B-FM6-R4E2-B2 — REQUEST-DRIVEN resumable scope draft job (48_). ONE logical job for a scope-wide AI Plan:
    // START snapshots eligible READY-gap SKUs; the client polls CONTINUE (bounded slice each) until DONE; STATUS is
    // read-only; CANCEL is terminal (created drafts preserved). No time trigger / scheduler / browser fan-out. The
    // per-SKU authority is the SAME R4E2 locked persister (recommended_qty verbatim from order_planning_gap).
    // F1-7N-FA-3C-PRE2-R2 — the 48_ job handlers return a RAW gapBatchEnvelope_ object (same convention as the 46_
    // gap-job family); the router MUST serialize it through jsonResponse_ (ContentService.JSON) so the Web App emits
    // a CORS-readable response via the googleusercontent redirect. Returning the raw object made doPost emit a
    // non-ContentService HTML page with no Access-Control-Allow-Origin → the browser fetch CORS-rejected it and the
    // client surfaced HTTP_TRANSPORT_ERROR. Mirror the known-good orderPlanningGap.job.start dispatch above.
    if (action === 'requestOrderDraft.job.start') {
      return jsonResponse_(handleStartRequestOrderDraftJob_(body));
    }
    if (action === 'requestOrderDraft.job.continue') {
      return jsonResponse_(handleContinueRequestOrderDraftJob_(body));
    }
    if (action === 'requestOrderDraft.job.status') {
      return jsonResponse_(handleGetRequestOrderDraftJobStatus_(body));
    }
    if (action === 'requestOrderDraft.job.cancel') {
      return jsonResponse_(handleCancelRequestOrderDraftJob_(body));
    }

    // Phase 2C Round 1H — LOCKED user-decision-edit boundary (25_): edit planned_qty/order_qty/etc under
    // ScriptLock + terminal guard + optimistic token, separate from engine generation and from Submit.
    if (action === 'updateRecommendationDecisionLocked') {
      return handleUpdateRecommendationDecisionLocked_(body);
    }

    // Read-only concurrency-token getter for a Recommendation Draft (client obtains {draft_version,
    // userEditFingerprint} to send back on an edit write).
    if (action === 'getRecommendationDraftToken') {
      return handleGetRecommendationDraftToken_(body);
    }

    // One-time migration (2026-07-28): retire the display-label snapshot columns from shipping_plans /
    // shipments (shipping_method_label / customs_type_label / shipments_customs_type_label). Backfill-safe:
    // dry_run reports; live deletes only when every code cell is populated (else blocked_needs_review).
    if (action === 'retireShipmentLabelColumns') {
      return handleRetireShipmentLabelColumns_(body);
    }

    if (action === 'importCarrierRateCards') {
      return handleImportCarrierRateCards_(body);
    }

    // One-time manual carrier provisioning — 中外運 Sinotrans (CAR_SINOTRANS) CN→JP Air+Parcel. Idempotent.
    if (action === 'seedSinotransCarrier') {
      return handleSeedSinotransCarrier_(body);
    }

    if (action === 'upsertSkuRegionalDetail') {
      return handleUpsertSkuRegionalDetail_(body);
    }

    if (action === 'syncMarketplaceSkusToSkuRegionalDetails') {
      return handleSyncMarketplaceSkusToSkuRegionalDetails_(body);
    }

    if (action === 'upsertTaxReferralRate') {
      return handleUpsertTaxReferralRate_(body);
    }

    if (action === 'upsertTaxRateComponent') {
      return handleUpsertTaxRateComponent_(body);
    }

    if (action === 'adjustFactoryInventory') {
      return handleAdjustFactoryInventory_(body);
    }

    // F0-HOTFIX-FI1 — Factory Inventory Initial Stock Import (two thin actions; business logic in 21_).
    if (action === 'factoryInventory.import.validate') {
      return handleFactoryInventoryImportValidate_(body);
    }
    if (action === 'factoryInventory.import.commit') {
      return handleFactoryInventoryImportCommit_(body);
    }

    // ADMIN-AUTOMATION-R1 — Automation Schedule Settings (owner = 45_api_v1_automation_schedule.gs). Schedule config
    // lives in Script Properties (NOT the spreadsheet DB); UPDATE reconciles ONLY the owned time trigger via a strict
    // handler allowlist. No formula, no DB table, no calc. GET is read-only (opening the page mutates nothing).
    if (action === 'automationSchedule.get') {
      return jsonResponse_(handleAutomationScheduleGet_(body));
    }
    if (action === 'automationSchedule.update') {
      return jsonResponse_(handleAutomationScheduleUpdate_(body));
    }

    // F1-7N-D-2j / F1-7N-D-2k-R1 — Site Inventory Warehouse Allocation config (owner = 50_api_v1_warehouse_allocation_
    // config.gs). Scope-safe reconciliation of the SELF_FULFILLED demand-allocation for ONE (company,country,
    // marketplace); the RULE MODEL is the sole planning-membership authority. Persistence = the
    // KM_WAREHOUSE_ALLOCATION_CONFIG Script-Property blob (NOT a Sheet tab), so it survives without user-managed
    // sheet rows yet stays backend/scheduler-readable. Rejects FBA/execution warehouses; ratios each sum to 100%.
    // GET is read-only (opening the modal mutates nothing).
    if (action === 'warehouseAllocation.get') {
      return handleWarehouseAllocationConfigGet_(body);
    }
    if (action === 'replenishmentDemandAllocation.save') {
      return handleReplenishmentDemandAllocationSave_(body);
    }

    // F1-7N-TW-FACTORY-OPERATIONAL-CONFIG-R1 — TW factory OPERATIONAL POLICY booleans (owner = 62_api_v1_factory_
    // operation_config.gs). Two Phase-1 policies (TW New SKU Participation / TW General Allocation) persisted in the
    // KM_FACTORY_OPERATION_CONFIG Script-Property blob (NOT a Sheet tab), read headlessly by the monthly runtime /
    // scheduler / future SKU-init runtime. GET is read-only; SAVE writes ONLY the config blob (no inventory mutation).
    if (action === 'factoryOperationConfig.get') {
      return handleFactoryOperationConfigGet_(body);
    }
    if (action === 'factoryOperationConfig.save') {
      return handleFactoryOperationConfigSave_(body);
    }

    return jsonResponse_({ success: false, error: 'Invalid POST action. Supported: updateSkuLifecycle, upsertSkuDetail, upsertMarketplaceSku, updateMarketplaceSkuModel, importMarketplaceSkusBatch, upsertMarketplace, importFcRegularForecastBatch, importOverseasInventorySnapshotBatch, adjustOverseasInventory, adjustFactoryInventory, factoryInventory.import.validate, factoryInventory.import.commit, runAmazonSnapshotImports, createShippingPlansBatch, updateShippingPlanStatus, updateShippingPlanLineQty, appendShippingPlanNote, completeShippingPlan, createShipmentFromPlan, updateShipment, confirmShipmentAndDispatch, createRequestOrderDraft, updateRequestOrderStatus, updateRequestOrderLineQty, cancelRequestOrderTier, createPurchaseOrderFromRequest, updatePurchaseOrderStatus, updatePurchaseOrderLine, updatePurchaseOrderHeader, receivePurchaseOrderLines, upsertFcSpecialEvent, deleteFcSpecialEvent, upsertFcTargetRule, deleteFcTargetRule, upsertRequestOrderAllocationDraft, upsertRequestOrderAllocationDraftLines, submitRequestOrderAllocationDrafts, upsertRequestOrderSiteConfirmations, importCarrierRateCards, upsertSkuRegionalDetail, syncMarketplaceSkusToSkuRegionalDetails, upsertTaxReferralRate, upsertTaxRateComponent, getShippingAllocationDraftWorkspace, cancelShippingAllocationDraft, warehouseAllocation.get, replenishmentDemandAllocation.save, factoryOperationConfig.get, factoryOperationConfig.save',
      // F1-7N-FB-4E §L — stamped with the handler and method, so a doPost answer can NEVER be classified
      // as a method downgrade. This is the negative half of the proof and it was previously absent.
      handler: 'doPost', received_method: 'POST', router_build: RTR_BUILD_VERSION_,
      post_body_present: true, action_present_in_query: !!(e && e.parameter && e.parameter.action), zero_write: true });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message, handler: 'doPost', received_method: 'POST', router_build: RTR_BUILD_VERSION_ });
  }
}
