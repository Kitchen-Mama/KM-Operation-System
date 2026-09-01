// F1-7N-FB-2A — Site Inventory explicit Search gate + Execution Plan draft DB persistence repair.
// Run: node assets/tests/inventory-search-gate-and-draft-persistence-f1-7n-fb-2a.test.js
//
// The search-gate and error-classification tests EXECUTE THE REAL SHIPPED FUNCTIONS, extracted from the
// shipped sources and evaluated against stubbed DOM / transport seams — never a mirrored copy. Request
// counting is therefore a real behavioural measurement of the shipped code, not an assertion about comments.
// No network call, no Apps Script execution, no DB or Drive write, no email, no Demo mutation.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var INV = read('js/pages/inventory-replenishment.js');
var API = read('js/api/operation-system-db-api.js');
var HTML = read('html/pages/inventory-replenishment.html');
var RTR = read('specs/active/apps-script/01_router.gs');
var G13 = read('specs/active/apps-script/13_procurement_handlers.gs');
var G16 = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G29 = read('specs/active/apps-script/29_production_safety_adapter.gs');
var G41 = read('specs/active/apps-script/41_shipping_allocation_schema_audit.gs');
var G63 = read('specs/active/apps-script/63_api_v1_system_health.gs');
var TEMPDOC = read('specs/active/apps-script/TEMP_document_diagnostics.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var RE_PRECEDERS_ = '(,=:[!&|?{};+-*%<>~^';
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) start = src.indexOf(name + ' = function');
  if (start < 0) throw new Error('missing fn ' + name);
  var i = src.indexOf('{', start), depth = 0, prev = '';
  for (; i < src.length; i++) {
    var c = src[i], n2 = src.substr(i, 2);
    if (n2 === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (n2 === '/*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { var q = c; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } prev = q; continue; }
    if (c === '/' && RE_PRECEDERS_.indexOf(prev) !== -1) { i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === '[') { for (i++; i < src.length && src[i] !== ']'; i++) { if (src[i] === '\\') i++; } continue; } if (src[i] === '/') break; } prev = '/'; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('unbalanced ' + name);
}
// Object/array-literal declarations. Skips // comments and quoted strings, then terminates on the ';' that
// follows the balanced literal — so braces inside a comment and a trailing comment cannot break it.
function extractVar(src, decl) {
  var start = src.indexOf(decl);
  if (start < 0) throw new Error('missing var ' + decl);
  var open = src.indexOf('{', start), bracket = src.indexOf('[', start);
  if (bracket !== -1 && (open === -1 || bracket < open)) open = bracket;
  var openCh = src[open], closeCh = openCh === '{' ? '}' : ']', depth = 0;
  for (var i = open; i < src.length; i++) {
    if (src.substr(i, 2) === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (src[i] === '"' || src[i] === "'") { var q = src[i]; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } continue; }
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) { depth--; if (!depth) { var j = src.indexOf(';', i); return src.slice(start, j + 1); } }
  }
  throw new Error('unbalanced ' + decl);
}
// Strip line comments. Every ABSENCE assertion below runs on this, because the comments deliberately NAME
// the symbols and wordings being asserted absent (that is what makes the source readable) and a naive scan
// would otherwise test the prose instead of the code.
function code(src) {
  return src.split('\n').map(function (l) {
    var q = null, out = '';
    for (var i = 0; i < l.length; i++) {
      var c = l[i];
      if (q) { out += c; if (c === '\\') { out += l[++i] || ''; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
      if (c === '/' && l[i + 1] === '/') break;
      out += c;
    }
    return out;
  }).join('\n');
}
function region(src, from, to) {
  var a = src.indexOf(from); if (a < 0) throw new Error('missing region start ' + from);
  var b = to ? src.indexOf(to, a) : -1;
  return src.slice(a, b < 0 ? src.length : b);
}
function ticks(n) {                       // drain n microtask turns
  var p = Promise.resolve();
  for (var i = 0; i < n; i++) p = p.then(function () {});
  return p;
}

// =======================================================================================================
section('A. preconditions — the audited defects really are in the shipped baseline');

ok(/function _irRecoTrigger\(\) \{[\s\S]*?loadInventoryGap_\(\);[\s\S]*?loadRecommendationWorkspace_\(\);/.test(INV),
  'A1. _irRecoTrigger issues BOTH the materialized-gap read and recommendation.workspace.get');
var scopeChanged = extractFn(INV, 'onReplenRecoScopeChanged');
ok(!/_irRecoTrigger\(\)/.test(scopeChanged),
  'A1. onReplenRecoScopeChanged no longer triggers those reads — a selector change loads nothing');
var recoInit = extractFn(INV, 'initReplenRecoContext');
ok(!/_irRecoTrigger\(\)/.test(recoInit), 'A1. and neither does the per-mount context init');
ok(/updateReplenRecoContext\(\);/.test(scopeChanged) && /updateReplenRecoContext\(\);/.test(recoInit),
  'A1. both still recompute the page-local context (the pure input recompute is preserved)');

ok(!/_irWorkspaceRefresh_\(\)\.then\(_irMountAfterLoad\)/.test(INV),
  'A2. the mount no longer reads the inventory workspace before any Search');
ok(/^\s*_irMountAfterLoad\(\);$/m.test(INV), 'A2. the mount runs the page wiring directly');
eq((INV.match(/_irMountAfterLoad\(\)/g) || []).length, 1, 'A2. exactly once — no duplicated page initializer');

ok(/function _kmClassifyBusinessError_[\s\S]*?return 'BUSINESS_COMMAND_ERROR';/.test(API),
  'A3. BUSINESS_COMMAND_ERROR is the CLIENT fallback for an unrecognised handler error string');
['ROUTE_INCOMPLETE_NEW_DRAFT', 'LEGACY_ROUTE_RECONCILIATION_REQUIRED', 'K2_ROUTE_RECONCILIATION_REQUIRED'].forEach(function (r) {
  ok(G16.indexOf(r) !== -1, 'A3. and 16_ really can answer with ' + r);
});
ok(/function procurementEnsureSheet_\(ss, name, headers\) \{\s*\n\s*return prodRequireSheet_\(ss, name, headers\);/.test(G13),
  'A4. procurementEnsureSheet_ is the VALIDATE-ONLY gate (it never creates in normal runtime)');
ok(/throw prodSchemaError_\('SCHEMA_NOT_PROVISIONED'/.test(G29) && /throw prodSchemaError_\(report\.schemaStatus/.test(G29),
  'A4. prodRequireSheet_ THROWS a deterministic PRODUCTION_SAFETY token with zero mutation');
ok(/new Error\('PRODUCTION_SAFETY:' \+ token/.test(G29), 'A4. and the token travels in err.message');
// F1-7N-FB-4E — the invariant is that `err.message` reaches the browser VERBATIM as the `error` field. The
// previous form additionally required the response object to END there, so adding the handler identity beside
// it (which is what lets a doPost answer be told apart from a doGet one) failed a test about the message.
ok(/\} catch \(err\) \{[\s\S]*?return jsonResponse_\(\{ success: false, error: err\.message[,\s}]/.test(RTR),
  'A4. the router surfaces that message verbatim — a schema refusal reaches the browser as an error STRING');
ok(!/error: String\(err\.message\)|error: 'An error occurred'|error: sysStr_\(err/.test(RTR),
  'A4. and it is never wrapped, replaced or generalised on the way out');
var upsertCore = extractFn(G16, 'sadUpsertDraftHeaderCore_');
ok(upsertCore.indexOf("procurementEnsureSheet_(ss, 'shipping_allocation_drafts'") !== -1,
  'A4. and the draft header upsert hits that gate before any payload logic runs');

// =======================================================================================================
section('C. the render gate — no rows can appear before a successful Search');

var renderFn = extractFn(INV, 'renderReplenishment');
ok(/!_irSearchApplied_\(\)\) \{ _irRenderSearchGate_\(\); return; \}/.test(renderFn),
  'C1. renderReplenishment returns the pre-search state whenever no Search has been applied');
ok(renderFn.indexOf('_irRenderSearchGate_') < renderFn.indexOf('const allData = getReplenishmentData()'),
  'C1. and the gate is evaluated BEFORE the data assembly');
ok(/_irSearch\.status === 'LOADING' \|\| _irSearch\.status === 'ERROR'/.test(renderFn),
  'C1. LOADING and ERROR are also mutually exclusive with rows');
var callers = (INV.match(/renderReplenishment\(\)/g) || []).length;
ok(callers > 5, 'C1. ' + callers + ' call sites exist — which is exactly why the gate lives INSIDE the function');
var velocity = extractFn(INV, '_irRecoRefreshVelocityCells_');
ok(/!_irSearchApplied_\(\)/.test(velocity),
  'C2. the async recommendation re-render (the surprise repaint) also refuses to paint pre-Search');

var gateFn = extractFn(INV, '_irRenderSearchGate_');
ok(/Select Country and Marketplace, then press Search\./.test(gateFn), 'C3. the pre-search empty state is explicit');
ok(/Searching…/.test(gateFn), 'C3. LOADING is a distinct state');
ok(/Search failed — no results were loaded/.test(gateFn), 'C3. ERROR is a distinct state');
ok(/role="alert"/.test(gateFn), 'C3. the error is announced to assistive technology');
ok(/onclick="searchReplenishment\(\)"/.test(gateFn), 'C3. and offers a Retry wired to the canonical Search');
ok(!/No data|No records/i.test(gateFn), 'C3. and never says "No data" before a successful Search');
ok(/No SKUs match the searched Country \/ Marketplace/.test(renderFn),
  'C3. EMPTY is a FOURTH distinct state, reachable only from a rendered (applied) Search');
ok(renderFn.indexOf("_irSearch.status = 'EMPTY'") > renderFn.indexOf('scrollBody.innerHTML = data.map'),
  'C3. evaluated after the row render, so an LTS change re-evaluates it too');

var cloud = extractFn(INV, '_getCloudReplenishmentData');
ok(/var _irScope = _irRenderScope_\(\);/.test(cloud), 'C4. the data assembly reads the APPLIED search scope');
ok(!/getElementById\('replenMarketplace'\)/.test(cloud) && !/getElementById\('replenCountry'\)/.test(cloud),
  'C4. and no longer reads the live Country/Marketplace selectors — Search is atomic');

ok(/<select id="replenLTSFilter" onchange="renderReplenishment\(\)">/.test(HTML),
  'C5. the LTS control re-renders locally — its canonical behaviour is preserved');
ok(/if \(ltsFilter === 'over90'\) rows = rows\.filter/.test(cloud),
  'C5. and is applied as a client-side .filter over the already-loaded rows (cloud path)');
ok(/if \(ltsFilter === 'over90'\) return expandData\.over90 > 0;/.test(INV),
  'C5. and likewise in the demo/legacy path — it is never a server query parameter');
var regFn = extractFn(INV, '_irEnsureRegistryLoaded_');
ok(!/ltsFilter/.test(code(regFn)) && !/ltsFilter/.test(code(extractFn(INV, 'searchReplenishment'))),
  'C5. no read path sends the LTS value to the server');
ok(/if \(_irRegistryPending\) return _irRegistryPending;/.test(regFn), 'C6. the registry load is single-flight');
// F1-7N-FB-3 §C — selector population is now a SEPARATE slim action, so it can never load the inventory table.
// F1-7N-FB-4C — STRENGTHENED. The registry's REQUEST, CACHE and single-flight latch moved into the ONE shared
// authority (KM.scopeRegistry) so the Site Inventory filter row and the "AI Plan — Inventory" modal can no longer
// be two consumers with two caches — which is exactly why the modal's Country list was blank while this page's
// was populated. The guarantee is unchanged and is now asserted at its new home by EXECUTING the shipped module,
// which is stronger than grepping for a call in a page function.
var SREG_ = require(require('path').join(__dirname, '..', 'js', 'core', 'scope-registry.js'));
ok(/reg\.ensureLoaded\(/.test(regFn) && /_irSharedRegistry_/.test(regFn),
  'C6. the selectors are fed through the ONE shared slim-registry authority');
ok(/getInventoryScopeRegistry/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'core', 'scope-registry.js'), 'utf8')),
  'C6b. and that authority reads the slim scope registry action — never a whole-DB read');
// this suite's code() is a per-LINE quote-aware stripper and does not remove a multi-line /* */ header, so the
// block comment is dropped explicitly before the check.
var SREG_SRC_ = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'core', 'scope-registry.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');
ok(!/getOperationDb|_opDbCache/.test(code(SREG_SRC_)),
  'C6c. with no broad-cache or whole-DB fallback in its CODE (comments stripped, so prose cannot satisfy or fail it)');
ok(!/_irWorkspaceRefresh_/.test(code(regFn)),
  'C6. and NEVER by the inventory workspace read — which is what used to put the TABLE into loading (defect B1)');
ok(!/_irRegion_|beginLoad/.test(code(regFn)),
  'C6. it never touches the inventory table load region');
ok(/_irRegistry\.status = 'ERROR'/.test(regFn) && /_irRegistry\.status = 'LOADING'/.test(regFn),
  'C6. it owns its OWN status, independent of the table state');
ok(!/_irBindRegistryLazyLoad_/.test(INV),
  'C6. and the superseded lazy-bind loader is gone — one selector-population authority, not two');

// =======================================================================================================
section('D. production never keeps a failed business write as canonical local data');

var flush = extractFn(INV, '_flushDraftDbPersist');
ok(/_irMarkRouteUnsaved_\(sku, err\)/.test(flush), 'D1. a failed save marks the route UNSAVED');
ok(!/kept local cache/.test(code(flush)), 'D1. and no longer claims the route was "kept locally"');
var showErr = extractFn(INV, '_irShowDraftSaveError');
ok(/Unsaved — database update failed/.test(showErr), 'D1. the UI labels it exactly "Unsaved — database update failed"');
ok(!/kept locally/.test(showErr), 'D1. the false-persistence wording is gone');
ok(/NOT saved to the database/.test(showErr), 'D1. and it states plainly that nothing was saved');
ok(!/kept locally/.test(code(INV)),
  'D1. and no code path anywhere on the page still says it (the only remaining mention is the comment quoting the defect)');

var persistFn = extractFn(INV, '_persistAllocationDraft');
ok(/snapshot\._unsavedRoutes/.test(persistFn), 'D2. the recovery cache carries the UNSAVED marks');
var restoreFn = extractFn(INV, '_restoreAllocationDraftFromSession');
ok(/_irUnsavedRoutes = \(parsed\._unsavedRoutes/.test(restoreFn),
  'D2. a reload restores those marks — it cannot promote a failed write into canonical state');
ok(/_irUnsavedRoutes = \{\};/.test(restoreFn), 'D2. while a successful DB hydrate voids them (the DB is the SSOT)');
ok(restoreFn.indexOf('_hydrateAllocationDraftFromDb(ctx)') < restoreFn.indexOf('sessionStorage.getItem'),
  'D2. and the DB hydrate is tried FIRST — after reload the row is built from DB data, not the previous object');

var submitFn = extractFn(INV, 'submitReplenishmentPlans');
ok(/_irHasUnsavedRoutes_\(\)/.test(submitFn), 'D3. Submit Plan checks for unsaved routes');
ok(/return;   \/\/ fail CLOSED/.test(submitFn), 'D3. and fails CLOSED');
ok(submitFn.indexOf('_irHasUnsavedRoutes_()') < submitFn.indexOf('submitAllocationDraftsToShippingPlans'),
  'D3. before any request is made');
ok(/Cannot Submit Plan/.test(submitFn) && /Unsaved: /.test(submitFn), 'D3. naming the routes that must be fixed first');
['isProductionWriteEligible', '_replenCanonicalSubmit'].forEach(function (s) {
  ok(submitFn.indexOf(s) !== -1, 'D4. the canonical Submit chain still runs through ' + s);
});
ok(/allocation_draft_ids: draftIds/.test(extractFn(INV, '_replenCanonicalSubmit')),
  'D4. Submit still sends only persisted allocation_draft_id(s) — never authored plan lines');
eq((INV.match(/submitAllocationDraftsToShippingPlans\(/g) || []).length, 1,
  'D4. exactly one Submit call site — no second Submit writer was introduced');

ok(/_irMarkRouteUnsaved_\('line:'/.test(extractFn(INV, '_cancelAllocationDraftLine')),
  'D5. a failed line soft-cancel (delete) is recorded, not swallowed');
ok(/_irMarkRouteUnsaved_\('draft:'/.test(extractFn(INV, '_cancelAllocationDraftHeader')),
  'D5. a failed header soft-cancel is recorded too');
var setItems = INV.match(/sessionStorage\.setItem\('[^']+'|sessionStorage\.setItem\(\w+/g) || [];
eq(setItems.length, 3, 'D6. exactly three storage writes remain on the page');
ok(/isDevLocalModeAllowed/.test(submitFn), 'D6. the local plan store is reachable only in explicit dev-local mode');
ok(/_IR_RECO_CACHE_KEY/.test(INV), 'D6. and the third is the recommendation READ cache, not a business write');

eval(extractFn(INV, '_irSaveAcknowledged_'));
eq(_irSaveAcknowledged_({ success: true, data: { allocation_draft_id: 'SADH-K2-AB12', created: true } }),
  { allocation_draft_id: 'SADH-K2-AB12', classification: 'created' }, 'D7. an INSERT ack returns the persisted id + created');
eq(_irSaveAcknowledged_({ success: true, data: { allocation_draft_id: 'SADH-K2-AB12', updated: true } }),
  { allocation_draft_id: 'SADH-K2-AB12', classification: 'updated' }, 'D7. an UPDATE ack reuses the SAME id — retry is idempotent');
eq(_irSaveAcknowledged_({ success: true, data: { created: true } }), null, 'D7. no primary key => NOT persisted');
eq(_irSaveAcknowledged_({ success: true, data: { allocation_draft_id: 'X' } }), null, 'D7. no created/updated classification => NOT persisted');
eq(_irSaveAcknowledged_({ success: true }), null, 'D7. a bare success flag is NOT proof of persistence');
eq(_irSaveAcknowledged_({ success: false }), null, 'D7. a failure is never an ack');
// F1-7N-FB-4B-ADDENDUM — STRENGTHENED. The ack requirement moved from the single-header flush into the
// per-route-group writer, so it is now enforced for EVERY header a multi-route save touches rather than for one.
// F1-7N-FB-4F-B6 — arity-tolerant: the writer took a fourth parameter this round and the assertion is about
// what the writer DOES, not about how many arguments it takes.
var groupWriter = (INV.match(/function _irPersistOneRouteGroup_\(sku, ctx, g[^)]*\)[\s\S]*?\n}/) || [''])[0];
ok(/_irSaveAcknowledged_\(hres\)/.test(groupWriter) && /PERSISTENCE_NOT_ACKNOWLEDGED/.test(groupWriter),
  'D7. EVERY route group requires the persistence ack and treats an unacknowledged response as a FAILED save');
ok(/_irPersistOneRouteGroup_\(sku, ctx, g[,)]/.test(flush),
  'D7. the save flow routes every group through that acknowledged writer');
ok(/_irClearRouteUnsaved_\(sku\)/.test(flush), 'D7. and only a fully acknowledged save clears the UNSAVED mark');

// FB-4D widened this response with the stored route_group_key + persisted_headers (§B3), so pin the FIELDS
// rather than the exact object literal - the guarantee is what the response CARRIES, not its punctuation.
ok(/allocation_draft_id: id, updated: true/.test(upsertCore), 'D8. the handler returns updated:true with the id');
ok(/route_group_key: sadK2GroupKey_\(updObj\)/.test(upsertCore), 'D8. plus the stored route group key (FB-4D)');
ok(/allocation_draft_id: id, created: true/.test(upsertCore), 'D8. and created:true with the id');
ok(/route_group_key: newGroupKey/.test(upsertCore), 'D8. and the new header reports its group key too (FB-4D)');
ok(/function sadK2DeterministicHeaderId_\(h\) \{ return 'SADH-K2-' \+ sadFnv1a_\(sadK2GroupKey_\(h\)\)/.test(G16),
  'D8. the header identity is a deterministic hash of the route dims — a retry cannot duplicate the row');

// =======================================================================================================
section('E. the typed inner reason is preserved and exposed — executing the real classifiers');

eval(extractVar(API, 'var KM_ALREADY_IN_TARGET_PATTERNS = ['));
eval(extractVar(API, 'var KM_CANONICAL_CODES = ['));
eval(extractFn(API, '_kmExtractCanonicalCode_'));
eval(extractFn(API, '_kmClassifyBusinessError_'));
eval(extractFn(API, '_kmZeroWriteProven_'));

eq(_kmExtractCanonicalCode_('ROUTE_INCOMPLETE_NEW_DRAFT — a new Draft requires a COMPLETE route (zero rows written)'),
  'ROUTE_INCOMPLETE_NEW_DRAFT', 'E1. ROUTE_INCOMPLETE_NEW_DRAFT is now named instead of flattened');
eq(_kmExtractCanonicalCode_('LEGACY_ROUTE_RECONCILIATION_REQUIRED — this existing Draft has an incomplete route'),
  'LEGACY_ROUTE_RECONCILIATION_REQUIRED', 'E1. LEGACY_ROUTE_RECONCILIATION_REQUIRED is now named');
eq(_kmExtractCanonicalCode_('K2_ROUTE_RECONCILIATION_REQUIRED — K2 identity mismatch'),
  'K2_ROUTE_RECONCILIATION_REQUIRED', 'E1. K2_ROUTE_RECONCILIATION_REQUIRED is now named');
eq(_kmExtractCanonicalCode_('PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH [shipping_allocation_drafts]'),
  'PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH', 'E1. a schema refusal keeps its exact token');
eq(_kmExtractCanonicalCode_('PRODUCTION_SAFETY:SCHEMA_NOT_PROVISIONED [shipping_allocation_drafts]'),
  'PRODUCTION_SAFETY:SCHEMA_NOT_PROVISIONED', 'E1. including a missing tab');
eq(_kmExtractCanonicalCode_('PRODUCTION_SAFETY:WRONG_SPREADSHEET_TARGET'),
  'PRODUCTION_SAFETY:WRONG_SPREADSHEET_TARGET', 'E1. and a wrong database target');
eq(_kmExtractCanonicalCode_('BLOCKED_CONFLICT — more than one Active Draft'), 'BLOCKED_CONFLICT',
  'E1. the pre-existing codes still classify unchanged');
eq(_kmClassifyBusinessError_('Plan is already submitted'), 'ALREADY_IN_TARGET_STATE',
  'E1. the idempotent-benign mapping is untouched');
eq(_kmClassifyBusinessError_('something nobody named'), 'BUSINESS_COMMAND_ERROR',
  'E1. and the fallback still exists for genuinely unknown reasons');

eq(_kmZeroWriteProven_('PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH [x]'), true, 'E2. a schema refusal is a proven zero-write');
eq(_kmZeroWriteProven_('ROUTE_INCOMPLETE_NEW_DRAFT — ... (zero rows written)'), true, 'E2. so is a documented pre-write gate');
eq(_kmZeroWriteProven_('Could not acquire lock; please retry.'), true, 'E2. so is an unavailable lock');
eq(_kmZeroWriteProven_('some other failure'), false, 'E2. an unqualified failure is NEVER claimed as zero-write');

eval(extractVar(INV, 'var IR_DRAFT_TYPED_REASONS_ = ['));
eval(extractFn(INV, '_irTypedReasonCode_'));
eval(extractFn(INV, '_irReasonIsPreWrite_'));
eval(extractFn(INV, '_irReasonRetryable_'));
eval(extractFn(INV, '_irReasonNextAction_'));
eval(extractFn(INV, '_irMakeDraftSaveError_'));

eq(_irTypedReasonCode_('BUSINESS_COMMAND_ERROR', 'PRODUCTION_SAFETY:MISSING_REQUIRED_HEADER [shipping_allocation_drafts]'),
  'PRODUCTION_SAFETY:MISSING_REQUIRED_HEADER', 'E3. the page recovers the schema token even from a generic code');
eq(_irTypedReasonCode_('BUSINESS_COMMAND_ERROR', 'Could not acquire lock; please retry.'), 'LOCK_UNAVAILABLE', 'E3. and a lock stage');
eq(_irTypedReasonCode_('BUSINESS_COMMAND_ERROR', 'Lock error: timeout'), 'LOCK_ERROR', 'E3. and a lock error');
eq(_irTypedReasonCode_('BUSINESS_COMMAND_ERROR', 'ROUTE_INCOMPLETE_NEW_DRAFT — ...'), 'ROUTE_INCOMPLETE_NEW_DRAFT', 'E3. and the handler tokens');
eq(_irTypedReasonCode_('PLAN_HEADER_INCOMPLETE', 'PLAN_HEADER_INCOMPLETE — route needs From + To + Method'),
  'PLAN_HEADER_INCOMPLETE', 'E3. an already-typed code passes through');
eq(_irTypedReasonCode_('SAVE_FAILED', 'nothing recognisable'), 'SAVE_FAILED', 'E3. and an unknown reason keeps its transport code');
eq(_irReasonRetryable_('BUSINESS_COMMAND_ERROR', 'PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH [x]'), false,
  'E4. a schema fault is reported as NOT retryable — it will not fix itself');
eq(_irReasonRetryable_('BUSINESS_COMMAND_ERROR', 'Could not acquire lock; please retry.'), true, 'E4. lock contention IS retryable');
eq(_irReasonRetryable_('BUSINESS_COMMAND_ERROR', 'K2_ROUTE_RECONCILIATION_REQUIRED — ...'), false,
  'E4. a reconciliation needs an explicit migration, so it is not retryable');
eq(_irReasonRetryable_('BUSINESS_COMMAND_ERROR', 'PLAN_HEADER_INCOMPLETE — ...'), true,
  'E4. an incomplete route IS retryable once the user completes it');
ok(/TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE/.test(_irReasonNextAction_('BUSINESS_COMMAND_ERROR', 'PRODUCTION_SAFETY:HEADER_MISSING [x]')),
  'E4. and the next action points at the read-only diagnostic that names the exact difference');
ok(/From \+ To \+ Method/.test(_irReasonNextAction_('BUSINESS_COMMAND_ERROR', 'ROUTE_INCOMPLETE_NEW_DRAFT — ...')),
  'E4. a route problem tells the user exactly which fields to complete');

var made = _irMakeDraftSaveError_(
  { code: 'BUSINESS_COMMAND_ERROR', message: 'PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH [shipping_allocation_drafts]',
    details: { command: 'upsertShippingAllocationDraft', zero_write: true } },
  'shipping_allocation_drafts', 'draft header upsert failed');
eq(made.structured.reasonCode, 'PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH', 'E5. the structured error carries the typed inner reason');
eq(made.structured.zeroWrite, 'true', 'E5. and the proven zero-write status');
eq(made.structured.retryable, false, 'E5. and retryability');
eq(made.structured.requestId, 'upsertShippingAllocationDraft', 'E5. and the request identity');
eq(made.structured.table, 'shipping_allocation_drafts', 'E5. and the affected table');
ok(made.structured.nextAction.length > 20, 'E5. and an actionable next step');
eq(made.structured.message, 'PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH [shipping_allocation_drafts]',
  'E5. the original server message is preserved verbatim');
var unknown = _irMakeDraftSaveError_({ code: 'BUSINESS_COMMAND_ERROR', message: 'totally unknown failure' }, 'shipping_allocation_drafts', 'x');
eq(unknown.structured.zeroWrite, 'unknown', 'E5. an unqualified failure never claims zero-write');
var missing = _irMakeDraftSaveError_({ code: 'BUSINESS_COMMAND_ERROR', message: 'PRODUCTION_SAFETY:MISSING_REQUIRED_HEADER [x]',
  details: { missing: ['recommended_last_mile_delivery', 'note'] } }, 'shipping_allocation_drafts', 'x');
eq(missing.structured.missingFields, 'recommended_last_mile_delivery, note', 'E5. and names the missing fields when the server supplies them');

['Reason:', 'Server message:', 'Affected table:', 'Missing/invalid fields:', 'Schema mismatch:', 'Request:', 'Rows written:', 'Retryable:'].forEach(function (f) {
  ok(showErr.indexOf(f) !== -1, 'E6. Technical Details exposes ' + f);
});
ok(/<details class="ir-save-error-detail"><summary>Technical details<\/summary>/.test(showErr), 'E6. collapsed by default');
eq((code(showErr).match(/ \+ s\.[a-zA-Z]+/g) || []).length, 0,
  'E6. NO structured field is interpolated unescaped');
ok((showErr.match(/esc\(s\./g) || []).length >= 8, 'E6. every exposed field goes through the escaper');
['getApiBaseUrl', 'SPREADSHEET', 'token', 'stack', 'DriveApp'].forEach(function (leak) {
  ok(code(showErr).indexOf(leak) === -1, 'E6. and never exposes ' + leak);
});

// =======================================================================================================
section('F. the read-only diagnostic — reuses the production evaluators, writes nothing');

ok(/function handleShippingAllocationDraftDiagnostic_\(body\)/.test(G63), 'F1. the diagnostic handler exists');
eq((G63.match(/function handleShippingAllocationDraftDiagnostic_\(/g) || []).length, 1, 'F1. exactly once');
ok(/function TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE\(\)/.test(G63), 'F1. with the required editor wrapper name');
ok(/if \(action === 'system\.shippingAllocationDraftDiagnostic'\) \{\s*\n\s*return handleShippingAllocationDraftDiagnostic_\(body\);/.test(RTR),
  'F1. routed on the deployed POST verb');
ok(/TEMP_SAD_DIAGNOSTIC_ALLOCATION_DRAFT_ID_ = 'PASTE_/.test(G63), 'F1. with a placeholder-controlled draft identity');
ok(/TEMP_SAD_DIAGNOSTIC_HEADER_ = \{/.test(G63) && /TEMP_SAD_DIAGNOSTIC_LINE_ = \{/.test(G63), 'F1. and a placeholder payload');

var diag = region(G63, 'F1-7N-FB-2A §F — READ-ONLY Execution Plan');
['prodRequireSheet_', 'sadHeaderRouteIsComplete_', 'sadResolveActiveDraftK2OrK3_', 'sadLegacyReconcileReason_',
 'sadLineIsComplete_', 'sadCanonDate_', 'auditShippingAllocationSchemaReadOnly', 'sysRouterReadiness_',
 'procurementFindRow_', 'sadReconcileMessage_'].forEach(function (f) {
  ok(diag.indexOf(f) !== -1, 'F2. it delegates to the production authority ' + f);
});
eq((G16.match(/function sadHeaderRouteIsComplete_\(/g) || []).length, 1, 'F2. sadHeaderRouteIsComplete_ is defined exactly once (16_)');
eq((G16.match(/function sadResolveActiveDraftK2OrK3_\(/g) || []).length, 1, 'F2. sadResolveActiveDraftK2OrK3_ exactly once (16_)');
eq((G41.match(/function auditShippingAllocationSchemaReadOnly\(/g) || []).length, 1, 'F2. the schema audit exactly once (41_)');
ok(!/'allocation_draft_id', 'planning_cycle', 'source_page'/.test(code(diag)),
  'F2. it never restates the 30-column header authority');
ok(/SHIPPING_ALLOCATION_DRAFTS_HEADERS_/.test(diag) && /SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_/.test(diag),
  'F2. it reads the running-stack header globals instead');

['procurementEnsureSheet_', 'procurementAppendByHeader_', 'appendRow', 'setValue', 'setValues', 'insertSheet',
 'deleteRow', 'deleteSheet', 'LockService', 'DriveApp', 'MailApp', 'GmailApp', 'PropertiesService',
 'prodMigrateCreateSheet_', 'prodMigrateAppendColumns_'].forEach(function (sym) {
  ok(code(diag).indexOf(sym) === -1, 'F3. the diagnostic never touches ' + sym);
});
ok(/getSheetByName|getDataRange|getRange|getLastColumn|getLastRow/.test(diag), 'F3. it performs reads only');
ok(/VALIDATE-ONLY/.test(G13), 'F3. and the schema gate it calls is validate-only by contract');
ok(!/round trip/i.test(code(diag)), 'F3. and no reported field claims a write/read round trip occurred');

['actions_all_available', 'schema_gate', 'schema_mode', 'payload_field_contract', 'route_complete',
 'source_destination_readiness', 'pk_readiness', 'idempotency', 'expected_classification',
 'expected_write_manifest', 'verdict', 'exact_blocking_reason', 'line_readiness'].forEach(function (f) {
  ok(diag.indexOf(f) !== -1, 'F4. the report includes ' + f);
});
ok(/FK_SOURCE_WAREHOUSE_NOT_FOUND/.test(diag) && /FK_DESTINATION_WAREHOUSE_NOT_FOUND/.test(diag), 'F4. with FK readiness');
ok(/ZERO_WRITE/.test(diag), 'F4. and a zero-write manifest whenever anything blocks');
ok(/'INSERT'|INSERT_OR_UPDATE/.test(diag) && /UPDATE/.test(diag), 'F4. and the expected insert/update classification');
['READ_ONLY = ', 'DB_WRITES = ', 'DRIVE_WRITES = ', 'STATUS_TRANSITIONS = ', 'EMAILS = ', 'DEMO_MUTATIONS = '].forEach(function (f) {
  ok(diag.indexOf("Logger.log('" + f) !== -1, 'F5. the wrapper logs the required footer line ' + f.trim());
});
ok(/read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0/.test(diag),
  'F5. and the response asserts the same counters');
eq((diag.match(/prodExpectedDbId_/g) || []).length, 1, 'F6. the configured db id is referenced exactly once');
ok(/SpreadsheetApp\.openById\(prodExpectedDbId_\(\)\)/.test(diag), 'F6. only to OPEN the database — never placed in the response');
ok(/DB_NOT_REACHABLE/.test(diag), 'F6. an unopenable DB is reported as a code, never a message that could carry the id');
ok(/TEMP_DOCUMENT_DIAGNOSE_PURCHASE_ORDER/.test(TEMPDOC) && /TEMP_DOCUMENT_DIAGNOSE_SHIPMENT/.test(TEMPDOC),
  'F7. the FB-1B document diagnostics are retained unchanged');

// =======================================================================================================
section('G. system.health covers the Execution Plan actions');

['upsertShippingAllocationDraft', 'upsertShippingAllocationDraftLines', 'getShippingAllocationDraftWorkspace',
 'cancelShippingAllocationDraft', 'submitAllocationDraftsToShippingPlans', 'system.shippingAllocationDraftDiagnostic'].forEach(function (a) {
  ok(new RegExp("action: '" + a.replace(/\./g, '\\.') + "'").test(G63), 'G1. health probes ' + a);
  ok(RTR.indexOf("action === '" + a + "'") !== -1, 'G1. and the router really registers ' + a);
});
['handleUpsertShippingAllocationDraft_', 'handleUpsertShippingAllocationDraftLines_',
 'handleGetShippingAllocationDraftWorkspace_', 'handleCancelShippingAllocationDraft_'].forEach(function (h) {
  eq((G16.match(new RegExp('function ' + h + '\\(', 'g')) || []).length, 1, 'G2. ' + h + ' is defined exactly once');
  ok(G63.indexOf(h) !== -1, 'G2. and health probes that exact symbol');
});
var routerReadiness = extractFn(G63, 'sysRouterReadiness_');
ok(/var present = sysHandlerPresent_\(a\.handler\);/.test(routerReadiness), 'G3. availability is probed BY SYMBOL, once per action');
ok(/typeof this\[name\] === 'function'/.test(extractFn(G63, 'sysHandlerPresent_')), 'G3. by a typeof check — never by invoking it');
ok(/'shipping_allocation_drafts', 'shipping_allocation_draft_lines',/.test(G63),
  'G4. and the two draft tables are covered by the schema readiness report');

// =======================================================================================================
section('H. request-count discipline (source-proven where execution is impossible)');

// start at the '//' so code() can strip the explanatory comment (it names the very symbol asserted absent)
var mountRegion = code(region(INV, '// F1-7N-FB-2A §B — THE mount fix', '});'));
ok(!/_irWorkspaceRefresh_\(\)/.test(mountRegion), 'H1. the mount performs no inventory workspace read');
ok(!/_irLoadCarrierPlanning_\(\)/.test(mountRegion), 'H1. and no carrier-catalog preload');
ok(/_irMountAfterLoad\(\);/.test(mountRegion), 'H1. it runs the page wiring and nothing else');
var applyFn = extractFn(INV, '_irApplySearch_');
ok(/_irLoadCarrierPlanning_\(\)/.test(applyFn), 'H1. the carrier preload moved to a confirmed Search');
eq((applyFn.match(/_irRecoTrigger\(\)/g) || []).length, 1, 'H2. exactly one scope-read trigger per confirmed Search');
eq((applyFn.match(/renderReplenishment\(\)/g) || []).length, 1, 'H2. and exactly one render');
eq((INV.match(/_irSearch\.applied = \{/g) || []).length, 1,
  'H3. _irSearch.applied is assigned in exactly ONE place — nothing else in the page can make data appear');
var searchFn = extractFn(INV, 'searchReplenishment');
ok(/if \(_irSearch\.inFlight\) return;/.test(searchFn), 'H4. single-flight guard against duplicate concurrent reads');
eq((searchFn.match(/mySeq !== _irSearch\.seq/g) || []).length, 2, 'H5. both the success and failure paths are sequence-guarded');
eq((searchFn.match(/lSeq !== _irSearch\.seq/g) || []).length, 2, 'H5. including the legacy branch');
ok(!/setTimeout|setInterval/.test(code(searchFn)) && !/searchReplenishment\(\)/.test(code(applyFn)),
  'H6. no self-retry and no timer — a failed Search cannot become a retry storm');

// =======================================================================================================
section('I. flow invariants — reload from DB, one Submit writer, no document/Drive/email side effects');

var hydrate = extractFn(INV, '_hydrateAllocationDraftFromDb');
['sku', 'planned_qty', 'note', 'source_warehouse_id', 'destination_warehouse_id', 'shipping_method',
 'last_mile_delivery', 'generation_type', 'allocation_draft_line_id'].forEach(function (f) {
  ok(hydrate.indexOf(f) !== -1, 'I1. the DB reload preserves ' + f);
});
ok(/lo\(d\.country\) === lo\(ctx\.country\)/.test(hydrate), 'I1. scoped by country + marketplace identity');
ok(/lo\(l\.lineStatus \|\| l\.line_status\) !== 'cancelled'/.test(hydrate), 'I1. excluding cancelled lines');
['handleSubmitAllocationDraftsToShippingPlans_', 'sadSubmitToShippingPlansCore_'].forEach(function (f) {
  eq((G16.match(new RegExp('function ' + f + '\\(', 'g')) || []).length, 1, 'I2. ' + f + ' still defined exactly once');
});
ok(/shippingPlanCommitFromLines_/.test(extractFn(G16, 'sadSubmitToShippingPlansCore_')),
  'I2. and still writes through the single shipping_plans authority');
['DriveApp', 'MailApp', 'GmailApp', 'generated_documents', 'document.retry'].forEach(function (sym) {
  ok(code(INV).indexOf(sym) === -1, 'I3. the Site Inventory page never references ' + sym);
});
ok(/if \(typeof _replenDemoOn === 'function' && _replenDemoOn\(\)\) \{\s*\n\s*renderReplenishment\(\);/.test(searchFn),
  'I4. Demo mode keeps its own search-free render path');
ok(/!\(typeof _replenDemoOn === 'function' && _replenDemoOn\(\)\) && !_irSearchApplied_\(\)/.test(renderFn),
  'I4. and the gate never applies to Demo');
ok(/_replenDemoOn\(\)\) return Promise\.resolve\(null\);/.test(regFn),
  'I4. the registry read is skipped entirely in Demo mode');

// =======================================================================================================
// B runs LAST because it is asynchronous: it EXECUTES the shipped Search against stubbed seams.
// =======================================================================================================
var wsReads = [], scopeReads = 0, carrierReads = 0, renderCalls = 0, gateRenders = [], staleRenders = 0, populateCalls = 0;
var alerts = [], selCountry = '', selMkt = '', selLts = '';
var _irReadModel = null, _irRegistryStatus = 'IDLE', _irRegistryPending = null;
var demoOn = false, replenCategoryTab = 'X', wsResolve = null, wsReject = null;

global.window = global.window || {};
global.document = {
  getElementById: function (id) {
    if (id === 'replenCountry') return { value: selCountry, addEventListener: function () {} };
    if (id === 'replenMarketplace') return { value: selMkt, addEventListener: function () {} };
    if (id === 'replenLTSFilter') return { value: selLts };
    return null;
  }
};
function alert(m) { alerts.push(String(m)); }
function _replenDemoOn() { return demoOn; }
function _irEffectiveWorkspace() { return true; }
function renderReplenishment() { renderCalls++; }
function _irRecoTrigger() { scopeReads++; }
function _irLoadCarrierPlanning_() { carrierReads++; }
function populateReplenFiltersFromRegistry() { populateCalls++; }
function _irRenderSearchGate_() { gateRenders.push(_irSearch.status); }
function _irRenderStaleNotice_() { staleRenders++; }
function _irWorkspaceRefresh_() {
  wsReads.push('inventoryReplenishment');
  return new Promise(function (res, rej) { wsResolve = res; wsReject = rej; });
}
function resetSeams() {
  wsReads = []; scopeReads = 0; carrierReads = 0; renderCalls = 0; gateRenders = []; staleRenders = 0;
  populateCalls = 0; alerts = []; _irReadModel = null; _irRegistryStatus = 'IDLE'; _irRegistryPending = null;
  _irSearch.applied = null; _irSearch.status = 'PRE_SEARCH'; _irSearch.seq = 0; _irSearch.inFlight = false;
  _irSearch.stale = false; _irSearch.error = null;
}
eval(extractVar(INV, 'var _irSearch = {'));
eval(extractFn(INV, '_irPendingFilters_'));
eval(extractFn(INV, '_irRenderScope_'));
eval(extractFn(INV, '_irSearchApplied_'));
eval(extractFn(INV, '_irFiltersDiffer_'));
eval(extractFn(INV, '_irMarkSearchStale_'));
// F1-7N-FB-3 §C — searchReplenishment now calls _irWorkspaceRefresh_ DIRECTLY (it no longer borrows the
// selector-registry loader), so the stub below is the exact seam the shipped Search uses.
eval(extractFn(INV, '_irApplySearch_'));
eval(extractFn(INV, 'searchReplenishment'));

(async function () {
  section('B. the Search gate — EXECUTING the real shipped functions');

  eq(_irSearch.applied, null, 'B0. the shipped initial state has NO applied filters');
  eq(_irSearch.status, 'PRE_SEARCH', 'B0. and starts in PRE_SEARCH');

  // ---- B1. initial load / selector changes issue ZERO requests ----------------------------------------
  resetSeams();
  eq(wsReads.length, 0, 'B1. initialising the page state performs no inventory workspace request');
  selCountry = 'US'; _irMarkSearchStale_();
  eq(wsReads.length, 0, 'B1. a Country change makes ZERO inventory workspace requests');
  eq(scopeReads, 0, 'B1. and ZERO scope reads (materialized gap / recommendation)');
  eq(renderCalls, 0, 'B1. and never repaints the table');
  selMkt = 'MKT-1'; _irMarkSearchStale_();
  eq(wsReads.length, 0, 'B1. a Marketplace change makes ZERO inventory workspace requests');
  eq(scopeReads, 0, 'B1. and ZERO scope reads');
  eq(renderCalls, 0, 'B1. and never repaints the table');

  // ---- B2. invalid filters block Search with no request -----------------------------------------------
  resetSeams(); selCountry = ''; selMkt = '';
  searchReplenishment();
  eq(wsReads.length, 0, 'B2. Search with neither filter issues no request');
  ok(/Country and Marketplace/.test(alerts[0] || ''), 'B2. and names both missing filters');
  resetSeams(); selCountry = ''; selMkt = 'MKT-1';
  searchReplenishment();
  eq(wsReads.length, 0, 'B2. Search without a Country issues no request');
  ok(/select a Country/.test(alerts[0] || ''), 'B2. naming the Country');
  resetSeams(); selCountry = 'US'; selMkt = '';
  searchReplenishment();
  eq(wsReads.length, 0, 'B2. Search without a Marketplace issues no request');
  ok(/select a Marketplace/.test(alerts[0] || ''), 'B2. naming the Marketplace');
  eq(_irSearch.applied, null, 'B2. and a blocked Search never applies filters');

  // ---- B3. one Search = exactly one request; filters apply only on success -----------------------------
  resetSeams(); selCountry = 'US'; selMkt = 'MKT-1';
  searchReplenishment();
  eq(wsReads.length, 1, 'B3. one Search click issues EXACTLY one inventory workspace request');
  eq(_irSearch.status, 'LOADING', 'B3. and shows an explicit loading state');
  eq(gateRenders[0], 'LOADING', 'B3. rendered as the loading state, not as rows');
  eq(_irSearch.applied, null, 'B3. filters are NOT applied while the read is in flight');
  searchReplenishment();
  eq(wsReads.length, 1, 'B3. a second click while in flight starts NO second concurrent read');
  wsResolve(null);
  await ticks(6);
  eq(_irSearch.applied, { country: 'US', marketplaceId: 'MKT-1' }, 'B3. the pending filters become APPLIED on success — atomically');
  eq(_irSearch.status, 'READY', 'B3. and the state is READY');
  eq(_irSearch.inFlight, false, 'B3. the single-flight latch is released');
  eq(renderCalls, 1, 'B3. rendering happens exactly once');
  eq(scopeReads, 1, 'B3. the scope reads belong to Search — one set per confirmed Search');
  eq(carrierReads, 1, 'B3. and the carrier catalog is preloaded here, not on mount');
  ok(populateCalls >= 1, 'B3. the filter registry is populated from the confirmed read');

  // ---- B4. a Search over an already-loaded read model costs ZERO further requests ----------------------
  var before = wsReads.length;
  _irReadModel = { getMarketplaces: [] };
  selCountry = 'DE'; selMkt = 'MKT-2';
  searchReplenishment();
  eq(wsReads.length, before, 'B4. a Search with the scope-independent read model loaded issues no new request');
  eq(_irSearch.applied, { country: 'DE', marketplaceId: 'MKT-2' }, 'B4. and still applies the new filters atomically');

  // ---- B5. a post-Search selector change marks stale and changes nothing else --------------------------
  var renders = renderCalls, reads = wsReads.length, scopes = scopeReads;
  selCountry = 'FR';
  _irMarkSearchStale_();
  eq(_irSearch.stale, true, 'B5. a post-Search selector change marks the displayed result STALE');
  eq(_irSearch.applied, { country: 'DE', marketplaceId: 'MKT-2' }, 'B5. the APPLIED filters are untouched until the next Search');
  eq(wsReads.length, reads, 'B5. with no request');
  eq(renderCalls, renders, 'B5. no repaint');
  eq(scopeReads, scopes, 'B5. and no scope read');
  eq(_irRenderScope_().country, 'DE', 'B5. the render scope still resolves to the APPLIED country');
  selLts = 'over90';
  eq(_irRenderScope_().ltsFilter, 'over90', 'B5. while the LTS filter is read live (client-side filter, never a server query)');
  selLts = '';

  // ---- B6. a stale response can never overwrite a newer Search -----------------------------------------
  resetSeams(); selCountry = 'US'; selMkt = 'MKT-1';
  searchReplenishment();
  var firstResolve = wsResolve;
  eq(wsReads.length, 1, 'B6. the first Search is in flight');
  _irSearch.inFlight = false;             // simulate the latch having cleared before the user searches again
  _irRegistryPending = null;
  selCountry = 'JP'; selMkt = 'MKT-9';
  searchReplenishment();
  eq(wsReads.length, 2, 'B6. a newer Search starts its own read');
  var secondResolve = wsResolve;
  firstResolve(null);                     // the OLDER response lands FIRST
  await ticks(6);
  eq(_irSearch.applied, null, 'B6. the STALE response is discarded — it applies nothing');
  secondResolve(null);
  await ticks(6);
  eq(_irSearch.applied, { country: 'JP', marketplaceId: 'MKT-9' }, 'B6. only the NEWEST Search applies its filters');

  // ---- B7. failure is actionable and distinct from empty ----------------------------------------------
  resetSeams(); selCountry = 'US'; selMkt = 'MKT-1';
  searchReplenishment();
  wsReject({ code: 'TRANSPORT_NON_JSON_RESPONSE', message: 'Non-JSON response from Web App' });
  await ticks(6);
  eq(_irSearch.status, 'ERROR', 'B7. a failed Search lands in a distinct ERROR state');
  eq(_irSearch.applied, null, 'B7. and applies NOTHING — the previously confirmed filters survive');
  eq(_irSearch.error.code, 'TRANSPORT_NON_JSON_RESPONSE', 'B7. preserving the transport reason');
  eq(renderCalls, 0, 'B7. and never renders rows');
  eq(gateRenders[gateRenders.length - 1], 'ERROR', 'B7. the error state is what is rendered');
  eq(wsReads.length, 1, 'B7. exactly one request — a failure never retries itself (no retry storm)');
  eq(_irSearch.inFlight, false, 'B7. and the latch is released so the user CAN retry');

  console.log('\n' + (fail ? 'FAILURES: ' + fail : 'ALL PASS') + '  (' + pass + ' assertions)');
  process.exit(fail ? 1 : 0);
})()['catch'](function (e) {
  console.error('FAIL async: ' + (e && e.stack || e));
  console.log('\nFAILURES: ' + (fail + 1) + '  (' + pass + ' assertions)');
  process.exit(1);
});
