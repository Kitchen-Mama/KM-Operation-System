// F1-7N-FA-4B — FLOW A: Inventory AI Plan Submit authority (allocation drafts → Weekly Shipping Plan).
// Run: node assets/tests/inventory-ai-plan-submit-authority-f1-7n-fa-4b.test.js
// Proves the canonical server-owned Submit: re-reads persisted drafts (never trusts frontend lines), one writer
// authority (shippingPlanCommitFromLines_), idempotency (REUSED/CONFLICT via the real classifier), typed lock
// contention, readback-verified draft transition, no shipment creation, deprecated compatibility wrappers, and the
// shipping_plan_lines.marketplace schema conclusion (H).

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('F1-7N-FA-4B FLOW-A SUBMIT AUTHORITY: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
function arrTokens(literal) { var body = literal.replace(/\[([\s\S]*)\]/, '$1').replace(/\/\/[^\n]*/g, ''); var out = [], re = /'([^']+)'/g, x; while ((x = re.exec(body))) out.push(x[1]); return out; }

var G11 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '11_shipping_plan_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G01 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '01_router.gs'), 'utf8').replace(/\r\n/g, '\n');
var IR = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'inventory-replenishment.js'), 'utf8').replace(/\r\n/g, '\n');
var API = fs.readFileSync(path.join(ROOT, 'js', 'api', 'operation-system-db-api.js'), 'utf8').replace(/\r\n/g, '\n');

// ---- load the REAL pure idempotency chain from 11_ (behavioral coverage of REUSED / CONFLICT) --------------------
var LOAD = [];
LOAD.push(G11.match(/var SHIPPING_PLAN_FINGERPRINT_VERSION_ = [^\n]*;/)[0]);
['SP_HDR_FP_STR_', 'SP_HDR_FP_NUM_', 'SP_LINE_FP_STR_', 'SP_LINE_FP_NUM_'].forEach(function (n) { LOAD.push(G11.match(new RegExp('var ' + n + ' = \\[[\\s\\S]*?\\];'))[0]); });
['shippingPlanFpStr_', 'shippingPlanFpNum_', 'shippingPlanFnv_', 'shippingPlanHdrSortKey_', 'shippingPlanLineSortKey_', 'shippingPlanProjectBatch_', 'shippingPlanCanonicalFingerprint_', 'shippingPlanLinesSchemaComplete_', 'shippingPlanClassifyBatch_'].forEach(function (n) { LOAD.push(extractFn(G11, n)); });
eval(LOAD.join('\n'));

// a complete (schema-complete) persisted line carries every canonical fingerprint field.
function completeLine(planId, sku, qty, mk) {
  var o = { shipping_plan_id: planId, sku: sku, requested_qty: qty, approved_qty: qty };
  SP_LINE_FP_STR_.forEach(function (f) { if (o[f] === undefined) o[f] = (f === 'marketplace' ? (mk || 'Amazon') : (f === 'sku' ? sku : '')); });
  SP_LINE_FP_NUM_.forEach(function (f) { if (o[f] === undefined) o[f] = (f === 'requested_qty' || f === 'approved_qty') ? qty : 0; });
  return o;
}
function planHeader(planId, key) { return { shipping_plan_id: planId, submit_batch_id: key, company: 'KM', country: 'US', marketplace: 'Amazon', ship_from: 'CN', destination: 'US', shipping_method: 'SEA' }; }

// ============================================================ 6/7 — REUSED (zero write) / CONFLICT via the real classifier
section('6/7. idempotency: same payload → REUSED (zero write); changed payload → CONFLICT');
var KEY = 'SADSUB-ABC123';
var persistedPlans = [planHeader('SP-1', KEY)];
var persistedLines = [completeLine('SP-1', 'KM-001', 100, 'Amazon'), completeLine('SP-1', 'KM-002', 50, 'Amazon')];
var incomingFp = shippingPlanCanonicalFingerprint_(persistedPlans, persistedLines);
var clsReuse = shippingPlanClassifyBatch_(persistedPlans, persistedLines, KEY, incomingFp, 2);
eq(clsReuse.state, 'REUSED', '6. identical execution key + identical canonical fingerprint → REUSED (zero new rows)');
var changedFp = shippingPlanCanonicalFingerprint_(persistedPlans, [completeLine('SP-1', 'KM-001', 999, 'Amazon'), completeLine('SP-1', 'KM-002', 50, 'Amazon')]);
eq(shippingPlanClassifyBatch_(persistedPlans, persistedLines, KEY, changedFp, 2).state, 'CONFLICT', '7. same key + a changed qty → CONFLICT (zero write)');
eq(shippingPlanClassifyBatch_([], [], KEY, incomingFp, 2).state, 'CREATE', '6. unknown key → CREATE (first submit writes exactly one batch)');
eq(shippingPlanClassifyBatch_(persistedPlans, [], KEY, incomingFp, 2).state, 'COMMITTED_UNVERIFIED', '7. header present but zero lines while payload has lines → COMMITTED_UNVERIFIED (no blind retry)');
// schema-incomplete persisted line (pre-migration) → never a false REUSE
var incompleteLine = { shipping_plan_id: 'SP-1', sku: 'KM-001', requested_qty: 100 };
eq(shippingPlanClassifyBatch_(persistedPlans, [incompleteLine], KEY, incomingFp, 2).state, 'RECONCILIATION_REQUIRED', '7. schema-incomplete persisted lines → RECONCILIATION_REQUIRED (never a false REUSE)');

// ============================================================ 1/2/3 — server re-reads drafts; never trusts frontend lines
section('1/2/3. canonical Submit re-reads persisted drafts (never frontend-authored lines)');
var core = extractFn(G16, 'sadSubmitToShippingPlansCore_');
ok(/sadReadLinesForDraft_\(lSh, id\)/.test(core) && /sadRowToObject_\(hSh, found\.row\)/.test(core) && /procurementFindRow_\(hSh, 'allocation_draft_id', id\)/.test(core), '2. backend re-reads shipping_allocation_drafts + _lines server-side');
ok(!/body\.lines/.test(core) && !/body\.planLines/.test(core), '3. the canonical Submit core never reads frontend-authored plan lines (only allocation_draft_ids)');
ok(/shippingPlanCommitFromLines_\(ss, submitLines, \{ source:/.test(core) && /submitLines\.push\(/.test(core), '1. it DERIVES the shipping-plan lines server-side from the drafts and delegates to the ONE writer');
ok(/allocation_draft_ids/.test(extractFn(G16, 'handleSubmitAllocationDraftsToShippingPlans_')), '1. the public authority takes allocation_draft_ids (selection), not lines');

// ============================================================ 4/5 — route authority (K2 logical marketplace) vs incomplete
section('4/5. route completeness (K2-aware) gates Submit');
var routeOk = extractFn(G16, 'sadHeaderRouteIsComplete_');
ok(/destination_marketplace/.test(routeOk), '4. K2 logical destination: a marketplace destination (blank warehouse) is route-complete');
ok(/ROUTE_INCOMPLETE/.test(core) && /sadHeaderRouteIsComplete_\(header\)/.test(core), '5. an incomplete route blocks Submit (ROUTE_INCOMPLETE, zero write)');
ok(/destination_type: destWhId \? 'warehouse' : 'marketplace'/.test(core), '4. line destination_type resolves to marketplace when no destination warehouse (K2 logical destination)');

// ============================================================ 8 — typed lock contention (never generic)
section('8. lock contention is typed');
var pub = extractFn(G16, 'handleSubmitAllocationDraftsToShippingPlans_');
ok(/tryLock\(30000\)/.test(pub) && /IN_PROGRESS_SAME_EXECUTION_KEY/.test(pub) && !/SEND_FAILED/.test(pub), '8. lock contention → IN_PROGRESS_SAME_EXECUTION_KEY (never generic SEND_FAILED / blind retry)');

// ============================================================ 9 — downstream failure leaves draft unsubmitted
section('9. downstream failure → draft remains unsubmitted');
ok(/if \(!commit\.success\)[\s\S]{0,220}drafts_unsubmitted[\s\S]{0,40}return commit/.test(core), '9. a failed shipping_plans commit returns BEFORE the draft→submitted transition (drafts stay unsubmitted)');
ok(core.indexOf("setCol('status', 'submitted')") > core.indexOf('shippingPlanCommitFromLines_'), '9. the draft→submitted transition happens only AFTER the plan commit');
ok(/SUBMIT_DRAFT_TRANSITION_UNVERIFIED/.test(core) && /SpreadsheetApp\.flush\(\)/.test(core), '9. draft transition is readback-verified (typed SUBMIT_DRAFT_TRANSITION_UNVERIFIED, never COMMITTED_UNVERIFIED terminal)');

// ============================================================ 10 — no Shipment creation at Submit
section('10. Submit creates no Shipment');
ok(!/createShipment|createShipmentFromApprovedPlan_|shipment_lines|confirmShipmentAndDispatch/.test(core), '10. the canonical Submit core creates no shipment (Shipping Plan → Shipment is a later boundary)');
ok(!/createShipment|shipment_lines/.test(extractFn(G11, 'shippingPlanCommitFromLines_')), '10. the shipping_plans writer core creates no shipment');

// ============================================================ 11/12 — one authority: orphan stub + createShippingPlansBatch subordinated
section('11/12. exactly one Submit authority (wrappers delegate/refuse)');
var orphan = extractFn(G16, 'handleSubmitShippingAllocationDrafts_');
ok(/handleSubmitAllocationDraftsToShippingPlans_\(/.test(orphan) && !/setCol\('status', 'submitted'\)/.test(orphan), '11. the orphan status-only Submit stub is retired → deprecated alias delegating to the canonical authority');
var wrapper = extractFn(G11, 'handleCreateShippingPlansBatch_');
ok(/handleSubmitAllocationDraftsToShippingPlans_\(body\)/.test(wrapper) && /SUBMIT_ROUTE_DEPRECATED/.test(wrapper), '12. createShippingPlansBatch is a deprecated wrapper: delegates on allocation_draft_ids, refuses legacy frontend lines');
ok((G11.match(/function shippingPlanCommitFromLines_\(/g) || []).length === 1, '12. exactly ONE shipping_plans writer core (no duplicate writer logic)');
ok(/submitAllocationDraftsToShippingPlans/.test(G01) && /handleSubmitAllocationDraftsToShippingPlans_\(body\)/.test(G01), 'G. the canonical action is routed (one canonical API route per mutation)');

// ============================================================ 13/H — shipping_plan_lines.marketplace schema authority
section('13/H. shipping_plan_lines.marketplace authority');
var LINES = arrTokens(G11.match(/var SHIPPING_PLAN_LINES_HEADERS_ = \[[\s\S]*?\];/)[0]);
var PLANS = arrTokens(G11.match(/var SHIPPING_PLANS_HEADERS_ = \[[\s\S]*?\];/)[0]);
ok(LINES.indexOf('marketplace') !== -1, 'H. production authority: shipping_plan_lines carries marketplace (each line keeps its REAL marketplace; a MULTI plan header cannot recover it via FK)');
ok(PLANS.indexOf('marketplace') !== -1, 'H. shipping_plans header carries marketplace (MULTI when the plan spans >=2 marketplaces)');
ok(/marketplace: h\.marketplace/.test(core), '13. the canonical Submit derives each line marketplace from the source allocation-draft header (single-marketplace scope)');
ok(/headerMarketplace = distinctMk\.length === 1 \? distinctMk\[0\] : \(distinctMk\.length >= 2 \? 'MULTI'/.test(G11), 'H. header marketplace derivation (MULTI marker) is unchanged — no DB column added/removed');

// ============================================================ frontend single-flight (C) — staged
section('C. frontend single-flight (staged)');
ok(/_replenSubmitInFlight\[execKey\]/.test(IR) && /return _replenSubmitInFlight\[execKey\]/.test(IR), 'C. one in-flight Promise per execution key (a second click shares it — no second mutation)');
ok(/submitAllocationDraftsToShippingPlans\(/.test(IR) && !/createShippingPlansBatch\(\{/.test(IR), 'C. the Submit calls the canonical action; the old createShippingPlansBatch line-trusting call is removed');
ok(/allocation_draft_ids: draftIds/.test(IR) && /_replenActiveAllocationDraftIds\(\)/.test(IR), 'C. the frontend sends only allocation_draft_id(s) (never authored plan lines)');
ok(/IN_PROGRESS_SAME_EXECUTION_KEY/.test(IR) && /CONFLICT/.test(IR) && /_clearAllocationDraft\(\)/.test(IR), 'C. terminal handling: REUSED/CREATED clears draft; CONFLICT → refresh/review; IN_PROGRESS → readback (no blind retry)');
ok(/window\.KM\.DB\.submitAllocationDraftsToShippingPlans = async function/.test(API) && /action: 'submitAllocationDraftsToShippingPlans'/.test(API), 'G. the API client exposes the canonical method returning the full typed envelope');

done();
