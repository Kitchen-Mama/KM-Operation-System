// F1-7N-FB-4G-A0 — CO1100-R LIVE HYDRATION CLOSURE.
//
// THE FROZEN PRODUCTION SHAPE this round acts on (real allocation header/line rows supplied by the operator —
// never a fixture invented here, and never the older B5 fixture):
//   H1 SAD-C787D1B1-D   ResUS/US/Amazon  draft  sea_express  src WH-TW-CN-FACTORY-YOUXIN  dest BLANK  0 lines
//   H2 SAD-27976058-2   ResUS/US/Amazon  draft  air          src WH-TW-CN-FACTORY-YOUXIN  dest BLANK  0 lines
//   H3 SADH-K2-7F15DD7D ResTW/JP/Amazon  draft  air                                        dest BLANK  5 lines / 220
//   H4 SADH-K2-E7AF9242 ResUS/US/Amazon  draft  sea          src WH-TW-CN-FACTORY-YOUXIN  snapshot CN侑鑫
//        dest warehouse BLANK · destination_marketplace BLANK · legacy destination snapshot 'Amazon'
//        one line SADL-K2-16F4E4F9 · sku CO1100-R · site_sku BLANK · planned_qty 800 · recommended_qty BLANK
//        line source_warehouse_id BLANK · line source snapshot BLANK · line_status BLANK · expected_arrival BLANK
//
// THE FINDING, stated once. The shipped hydrate was never wrong. Given the rows it produces H4 exactly — 800,
// the header's source inherited by the blank line, a blank destination that stays blank and carries
// DESTINATION_CONFIRMATION_REQUIRED. It produced nothing because it read `window.KM.DB.
// getShippingAllocationDrafts()`, which returns `_opDbCache.shippingAllocationDrafts`, and NOTHING can fill
// that slice: the deployed `getOperationDb` does not list the two draft tables in its validTabs, and neither
// does `getTable` — so the refreshCacheTables() that ran immediately before the hydrate was REFUSED on both
// names ("Invalid table name"), its rejection was swallowed, and the hydrate read []. Meanwhile the very
// Search that called it had already fetched both tables through inventoryReplenishment.workspace.get.
//
// Run: node assets/tests/co1100r-live-hydration-closure-f1-7n-fb-4g-a0.test.js

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
// A mutation probe returns TRUE when it DETECTED the mutant. A THROW is a broken probe, never a detection —
// B6-R1's M7 threw a ReferenceError and was scored as a pass while proving nothing at all.
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) {
    neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    return;
  }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// Structural claims are made against COMMENT-STRIPPED source: B5 learned that a file's own prose satisfies a
// substring search, and this file's prose quotes the very code it is asserting about.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var G03 = read('assets/specs/active/apps-script/03_master_data_handlers.gs');
var G60 = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var INDEX = read('index.html');
var PAGEC = code(PAGE), DBAPIC = code(DBAPI), G03C = code(G03), G60C = code(G60);
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1;
  while (' \t\r\n'.indexOf(src[i]) >= 0) i++;
  if (src[i] === '{' || src[i] === '[') {
    var open = src[i], close = open === '{' ? '}' : ']', d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
    return src.slice(m.index, j + 1) + ';';
  }
  return src.slice(m.index, src.indexOf(';', i) + 1);
}

// ================================================================================================================
// THE FROZEN FIXTURE. Declared ONCE. No assertion below may restate a value that is not here.
// ================================================================================================================
var US = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var YOUXIN = 'WH-TW-CN-FACTORY-YOUXIN';
var H1 = { allocation_draft_id: 'SAD-C787D1B1-D', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
  recommended_shipping_method: 'sea_express', recommended_source_warehouse_id: YOUXIN,
  recommended_destination_warehouse_id: '', destination_marketplace: '', planning_cycle: '' };
var H2 = { allocation_draft_id: 'SAD-27976058-2', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
  recommended_shipping_method: 'air', recommended_source_warehouse_id: YOUXIN,
  recommended_destination_warehouse_id: '', destination_marketplace: '', planning_cycle: '' };
var H3 = { allocation_draft_id: 'SADH-K2-7F15DD7D', company: 'ResTW', country: 'JP', marketplace: 'Amazon', status: 'draft',
  recommended_shipping_method: 'air', recommended_source_warehouse_id: YOUXIN,
  recommended_destination_warehouse_id: '', destination_marketplace: '', planning_cycle: '' };
var H4 = { allocation_draft_id: 'SADH-K2-E7AF9242', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'draft',
  recommended_shipping_method: 'sea', recommended_source_warehouse_id: YOUXIN,
  recommended_source_warehouse_snapshot: 'CN侑鑫',
  recommended_destination_warehouse_id: '', destination_marketplace: '',
  // The legacy destination SNAPSHOT. A display string a previous round left behind — never a canonical
  // destination, and this suite exists partly to keep it from becoming one.
  destination_snapshot: 'Amazon', planning_cycle: '' };
var L4 = { allocation_draft_line_id: 'SADL-K2-16F4E4F9', allocation_draft_id: 'SADH-K2-E7AF9242',
  sku: 'CO1100-R', site_sku: '', planned_qty: 800, recommended_qty: '',
  source_warehouse_id: '', source_warehouse_snapshot: '', line_status: '', expected_arrival: '' };
var LINES_H3 = [];
for (var _i = 1; _i <= 5; _i++) LINES_H3.push({ allocation_draft_line_id: 'SADL-K2-JP' + _i,
  allocation_draft_id: 'SADH-K2-7F15DD7D', sku: 'JP-SKU-' + _i, site_sku: '', planned_qty: 44,
  recommended_qty: '', source_warehouse_id: '', line_status: '', expected_arrival: '' });

var RAW_HEADERS = [H1, H2, H3, H4];
var RAW_LINES = [L4].concat(LINES_H3);

// The two SHIPPED db-api normalizers, executed — this is the real §D.4 boundary, not a hand-written mimic.
var NORMS = {};
(function () {
  eval(extractFn(DBAPI, 'normalizeShippingAllocationDraftRecord'));
  eval(extractFn(DBAPI, 'normalizeShippingAllocationDraftLineRecord'));
  NORMS.header = normalizeShippingAllocationDraftRecord;
  NORMS.line = normalizeShippingAllocationDraftLineRecord;
})();

// ================================================================================================================
// THE HYDRATE HARNESS. The SHIPPED _hydrateAllocationDraftFromDb, lifted and RUN. `sourceMode` decides which of
// the two sources holds the rows, which is the entire subject of this round.
// ================================================================================================================
var COMPAT = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
function runHydrate(opts) {
  opts = opts || {};
  var headers = opts.headers || RAW_HEADERS;
  var lines = opts.lines || RAW_LINES;
  var ctx = opts.ctx || US;
  var readModel = null;
  if (opts.sourceMode === 'WORKSPACE') {
    readModel = {
      getShippingAllocationDrafts: headers.map(NORMS.header),
      getShippingAllocationDraftLines: lines.map(NORMS.line)
    };
  }
  var broad = (opts.sourceMode === 'LEGACY')
    ? { drafts: headers.map(NORMS.header), lines: lines.map(NORMS.line) }
    : { drafts: [], lines: [] };   // PRODUCTION TODAY: the broad cache is empty and cannot be filled

  var sandbox = {
    window: {
      IRWarehouse: COMPAT.IRWarehouse, IRDraft: COMPAT.IRDraft,
      KM: { DB: {
        getShippingAllocationDrafts: function () { return broad.drafts; },
        getShippingAllocationDraftLines: function () { return broad.lines; }
      } }
    },
    sessionStorage: { setItem: function () {}, getItem: function () { return null; }, removeItem: function () {} },
    console: { warn: function () {}, log: function () {}, error: function () {} },
    _irReadModel: readModel
  };
  var src = [
    extractVar(PAGE, 'IR_ISO_DATE_RE_'),
    extractFn(PAGE, '_irCanonicalDateOrBlank_'),
    extractFn(PAGE, '_irWsGet'),
    'var _replenHydrateToken = 0;',
    'var replenAllocationDraft = { context: {}, targetDays: "", bySku: {} };',
    'function _irRenderDuplicateCorruptionBanner_() {}',
    'function _persistAllocationDraft() { persisted++; }',
    'var persisted = 0;',
    extractFn(PAGE, '_hydrateAllocationDraftFromDb'),
    'RESULT = { ok: _hydrateAllocationDraftFromDb(CTX), draft: replenAllocationDraft, persisted: persisted };'
  ].join(String.fromCharCode(10));
  var f = new Function('window', 'sessionStorage', 'console', '_irReadModel', 'CTX',
    'var RESULT;' + src + 'return RESULT;');
  return f(sandbox.window, sandbox.sessionStorage, sandbox.console, sandbox._irReadModel, ctx);
}

// ================================================================================================================
section('A · §C — THE PRODUCTION BROWSER TOKEN CHECK, AND IT IS NOT VACUOUS');
// ================================================================================================================
// A readback that "checks the token" by looking for the token it was told to expect proves nothing. The expected
// values are DERIVED from the shipped index.html here, and the check names the one file that is deliberately on a
// DIFFERENT token family — a reviewer who assumed all three share one token would report a false failure.
var TOKEN = RO.currentAppToken();
// F1-7N-FB-4G-A0-R1 - RESTATED, and this is the FIFTH round in which this exact shape has broken. A0 wrote
// it as an equality with the present after restating B6-R1 H6 for precisely that reason, which is how a
// pattern survives being named. What A0 established is a FLOOR: A0 minted its own token rather than reusing
// B6-R1's, and no later round may sit behind that point in the release order.
ok(RO.tokenAtOrAfter(TOKEN, 'fb4ga0-livehydration-20260902'), 'A1  A0 minted its own app token, and the release order has not moved behind it');
var idxTokens = RO.parseIndexTokens ? RO.parseIndexTokens(INDEX) : null;
function refToken(file) {
  var m = new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([A-Za-z0-9._-]+)').exec(INDEX);
  return m ? m[1] : '';
}
eq(refToken('assets/js/pages/inventory-replenishment.js'), TOKEN, 'A2  inventory-replenishment.js carries this round\'s token');
eq(refToken('assets/js/utils/inventory-compat.js'), TOKEN, 'A3  inventory-compat.js carries this round\'s token');
var cssTok = refToken('assets/css/pages/inventory-replenishment.css');
ok(cssTok && cssTok !== TOKEN, 'A4  the stylesheet is on its OWN token family — the readback must expect ' + cssTok + ', not the app token');
ok(INDEX.indexOf('fb4fb6r1-etasnapshot-20260901') === -1, 'A5  no reference is left on the previous round\'s token');
// RESTATED (F1-7N-FC-1A-R1-HF1): this was `=== 18`. The count is not the property — "rotated TOGETHER"
// is — and the literal made a round that covers one more asset look like a half-updated deployment. Now
// derived: no entry is left behind on a superseded application token. See _release-order.js staleAppTokenRefs.
eq(RO.staleAppTokenRefs(INDEX).join(' | '), '',
  'A6  the co-deployed references moved together (' + RO.appTokenRefCount(INDEX) + ' refs on ' + TOKEN + ')');
ok(RO.tokenAtOrAfter(TOKEN, 'fb4fb6r1-etasnapshot-20260901'), 'A7  the release order places this round AFTER B6-R1');
// The check must be capable of FAILING. If the shipped page were still on the previous token, A2 must break.
mut('A8  [mutation] a stale inventory-replenishment.js token is detected', function () {
  var stale = INDEX.replace('assets/js/pages/inventory-replenishment.js?v=' + TOKEN,
                            'assets/js/pages/inventory-replenishment.js?v=fb4fb6r1-etasnapshot-20260901');
  var m = /assets\/js\/pages\/inventory-replenishment\.js\?v=([A-Za-z0-9._-]+)/.exec(stale);
  return !!m && m[1] !== TOKEN;
});

// ================================================================================================================
section('B · §D — EVERY HYDRATION BOUNDARY, BY EXECUTION');
// ================================================================================================================

// ---- §D.1/§D.2/§D.3 · the SHEET READER and the two server whitelists ------------------------------------------
// This is the boundary the rows never crossed, and it is a source fact, not an inference.
var getTableTabs = (G03C.match(/function handleGetTable_\([\s\S]*?var validTabs = \[([\s\S]*?)\];/) || ['', ''])[1];
var getDbTabs = (G03C.match(/function handleGetOperationDb_\([\s\S]*?var validTabs = \[([\s\S]*?)\];/) || ['', ''])[1];
ok(getTableTabs.length > 100, 'B1  handleGetTable_ validTabs located in the shipped handler');
ok(getTableTabs.indexOf('shipping_allocation_drafts') === -1,
  'B2  §D.1 getTable REFUSES shipping_allocation_drafts — it is not in validTabs');
ok(getTableTabs.indexOf('shipping_allocation_draft_lines') === -1,
  'B3  §D.1 getTable REFUSES shipping_allocation_draft_lines — it is not in validTabs');
ok(getDbTabs.indexOf('shipping_allocation_drafts') === -1 && getDbTabs.indexOf('shipping_allocation_draft_lines') === -1,
  'B4  §D.1 getOperationDb does not carry them either — the broad cache slice has NO writer at all');
ok(/return jsonResponse_\(\{ success: false, error: 'Invalid table name/.test(G03C),
  'B5  a refused table name comes back as success:false — which the client turns into a THROW, not empty rows');
ok(/if \(!json\.success\)/.test(DBAPIC) && /BACKEND_BUSINESS_REJECTION/.test(DBAPIC),
  'B6  getOperationDbTableFromSheet raises BACKEND_BUSINESS_REJECTION on success:false');

// ---- §D.4 · the API RESPONSE that DOES carry the rows ----------------------------------------------------------
ok(/\{ name: 'shipping_allocation_drafts',\s+requiredCols: \[\], optional: true \}/.test(G60C),
  'B7  §D.4 the IR workspace serves shipping_allocation_drafts');
ok(/\{ name: 'shipping_allocation_draft_lines',\s+requiredCols: \[\], optional: true \}/.test(G60C),
  'B8  §D.4 the IR workspace serves shipping_allocation_draft_lines');
ok(!/\{ name: 'shipping_allocation_drafts',[^}]*include:/.test(G60C),
  'B9  §D.4 they are in the BASE payload — no include gate, so every Search already fetches them');
// Execute the shipped pure builder: the rows really do come out the other side.
(function () {
  var wsSrc = [extractVar(G60, 'SIR_WS_ROW_MAX_'), extractVar(G60, 'SIR_WORKSPACE_TABLES_'),
    extractFn(G60, 'sirCap_'), extractFn(G60, 'sirWorkspaceBuild_'),
    'OUT = sirWorkspaceBuild_(T, {});'].join(String.fromCharCode(10));
  var out = (new Function('T', 'var OUT;' + wsSrc + 'return OUT;'))(
    { shipping_allocation_drafts: RAW_HEADERS, shipping_allocation_draft_lines: RAW_LINES });
  eq(out.counts.shipping_allocation_drafts, 4, 'B10 §D.4 the shipped workspace builder returns all FOUR headers');
  eq(out.counts.shipping_allocation_draft_lines, 6, 'B11 §D.4 and all SIX lines');
  eq(out.shipping_allocation_drafts[3].allocation_draft_id, 'SADH-K2-E7AF9242', 'B12 §D.4 H4 is present, verbatim');
  eq(out.shipping_allocation_draft_lines[0].planned_qty, 800, 'B13 §D.4 and its line arrives carrying 800');
})();
ok(/getShippingAllocationDrafts: \(data\.shipping_allocation_drafts \|\| \[\]\)/.test(
     (DBAPIC.match(/adaptInventoryReplenishmentWorkspace = function[\s\S]*?\n\};/) || [''])[0]),
  'B14 §D.4 the client adapter already normalises them into the read model under the getter name');

// ---- §D.5 · the station / scope boundary + §D.6 the hydrate itself ---------------------------------------------
var BEFORE = runHydrate({ sourceMode: 'BROAD_EMPTY' });
eq(BEFORE.ok, false, 'B15 §D.6 BEFORE — reading the broad cache the hydrate returns FALSE (production today)');
eq(Object.keys(BEFORE.draft.bySku || {}), [], 'B16 §D.6 BEFORE — bySku is empty, so H4 is ABSENT with no typed reason');
eq(BEFORE.persisted, 0, 'B17 §D.6 BEFORE — and it persists nothing, so there is not even a stale trace');

var AFTER = runHydrate({ sourceMode: 'WORKSPACE' });
eq(AFTER.ok, true, 'B18 §D.6 AFTER — reading the workspace read model the hydrate succeeds');
eq((AFTER.draft.allocationDraftIds || []).slice().sort(),
   ['SAD-27976058-2', 'SAD-C787D1B1-D', 'SADH-K2-E7AF9242'],
   'B19 §D.5 the station boundary admits the THREE US/Amazon headers and no other');
ok((AFTER.draft.allocationDraftIds || []).indexOf('SADH-K2-7F15DD7D') === -1,
  'B20 §D.5 H3 (ResTW/JP) is excluded by scope — typed reason: country/marketplace mismatch');
eq(Object.keys(AFTER.draft.bySku), ['CO1100-R'], 'B21 §D.9 bySku holds exactly one SKU key, and it is the canonical sku');

var R4 = AFTER.draft.bySku['CO1100-R'];
eq(R4.length, 1, 'B22 §D.10 route grouping yields exactly ONE persisted route for CO1100-R');
var r = R4[0];
eq(r.allocation_draft_id, 'SADH-K2-E7AF9242', 'B23 H4 header ID is carried, not regenerated');
eq(r.allocation_draft_line_id, 'SADL-K2-16F4E4F9', 'B24 H4 line ID is carried, not regenerated');
eq(r.sku, 'CO1100-R', 'B25 sku');
eq(r.site_sku, '', 'B26 site_sku stays blank — it is not invented');
eq(r.source_warehouse_id, YOUXIN, 'B27 source warehouse (inherited from the header — the line\'s is blank)');
eq(r.shipping_method, 'sea', 'B28 method is sea');
eq(r.planned_qty, 800, 'B29 planned_qty 800');
eq(r.qty, 800, 'B30 and the render quantity is the same 800');
eq(r.destination_state, 'DESTINATION_CONFIRMATION_REQUIRED', 'B31 destination state is the typed confirmation requirement');

// ================================================================================================================
section('C · §E — THE TWELVE CANDIDATE CAUSES, EACH TESTED');
// ================================================================================================================
// E1 — hydration not called after Search. It IS called; B6 closed this and the call must stay.
var applySrc = (PAGEC.match(/function _irApplySearch_\([\s\S]*?\n\}/) || [''])[0];
ok(/_irHydrateDraftForAppliedScope_\(\)/.test(applySrc), 'C1  §E.1 REJECTED — _irApplySearch_ does call the hydrate');
ok(applySrc.indexOf('_irSearch.applied =') < applySrc.indexOf('_irHydrateDraftForAppliedScope_'),
  'C2  §E.1 and it is called AFTER the applied scope is assigned, so the scope is populated');
// E2 — browser running pre-B6 code. Covered by section A; the token check is the only proof of this and it is
// non-vacuous. Recorded here so the candidate is not silently dropped.
ok(TOKEN === RO.currentAppToken() && refToken('assets/js/pages/inventory-replenishment.js') === TOKEN,
  'C3  §E.2 addressed by the §C token readback — a stale browser is detectable, not assumed');
// E3/E4 — header has a source warehouse, the line does not.
eq(r.source_warehouse_id, YOUXIN, 'C4  §E.3 CONFIRMED SHAPE, NOT A CAUSE — the blank line source inherits the header');
ok(/source_warehouse_id: lineSrc \|\| hFrom/.test(PAGEC), 'C5  §E.4 REJECTED — the hydrator never REQUIRES line.source_warehouse_id');
var noLineSrc = runHydrate({ sourceMode: 'WORKSPACE', lines: [L4] });
eq(noLineSrc.draft.bySku['CO1100-R'][0].source_warehouse_id, YOUXIN, 'C6  §E.4 proven by execution, not by reading');
// E5 — blank site_sku.
ok(/var sku = raw\.sku;/.test(PAGEC), 'C7  §E.5 REJECTED — the line is keyed by canonical `sku`');
eq(r.sku, 'CO1100-R', 'C8  §E.5 a blank site_sku does not prevent the match');
// E6 — blank line_status treated as inactive.
ok(/lo\(l\.lineStatus \|\| l\.line_status\) !== 'cancelled'/.test(PAGEC),
  'C9  §E.6 REJECTED — the line filter excludes ONLY `cancelled`, so blank is legacy-active');
// The hydrate reports success whenever an ACTIVE HEADER exists, so `ok` is blind to a dropped LINE — which is
// precisely the silence this whole round is about. Assert the ROUTE.
var cancelled = runHydrate({ sourceMode: 'WORKSPACE', lines: [Object.assign({}, L4, { line_status: 'cancelled' })] });
eq((cancelled.draft.bySku['CO1100-R'] || []).length, 0, 'C10 §E.6 and a genuinely cancelled line IS dropped — the rule is not vacuous');
// E7 — planning_cycle.
ok(!/lo\(d\.planning_cycle\)/.test(PAGEC) && !/planningCycle\s*===/.test(PAGEC),
  'C11 §E.7 REJECTED — the hydrate does not filter on planning_cycle at all');
// E8 — blank destination dropping the route.
eq(r.destination_warehouse_id, '', 'C12 §E.8 REJECTED — a blank destination stays blank');
eq(r.destination_marketplace, '', 'C13 §E.8 and no marketplace is invented for it');
ok(!!r, 'C14 §E.8 and the route SURVIVES with a typed confirmation state instead of being dropped');
// E9 — bySku keyed by site_sku.
eq(Object.keys(AFTER.draft.bySku), ['CO1100-R'], 'C15 §E.9 REJECTED — the key is the canonical sku');
// E10/E11/E12 — covered in section E (rendering) and F below.
// AND THE CAUSE. Both of these must hold, or the diagnosis is not proven.
eq(BEFORE.ok, false, 'C16 THE CAUSE — the same fixture in the broad cache hydrates NOTHING');
eq(AFTER.ok, true,  'C17 THE CAUSE — the same fixture in the read model hydrates H4');
ok(/var drafts = _irWsGet\('getShippingAllocationDrafts'\)/.test(PAGEC),
  'C18 THE FIX — the hydrate now reads the read-model-first accessor every other read on this page uses');
ok(/var lines = _irWsGet\('getShippingAllocationDraftLines'\)/.test(PAGEC), 'C19 THE FIX — and the same for the lines');
ok(!/var drafts = window\.KM\.DB\.getShippingAllocationDrafts\(\)/.test(PAGEC),
  'C20 THE FIX — it no longer reads the slice that has no writer');
ok(/if \(_irReadModel\) return _irReadModel\[name\] \|\| \[\];/.test(PAGEC),
  'C21 and _irWsGet still falls back to the broad getter in Legacy mode — BEFORE == AFTER there');
var LEGACY = runHydrate({ sourceMode: 'LEGACY' });
eq(LEGACY.ok, true, 'C22 Legacy mode (no read model) still hydrates from the broad getter, unchanged');
eq(LEGACY.draft.bySku['CO1100-R'][0].planned_qty, 800, 'C23 with the same 800');

// ================================================================================================================
section('D · §F — HYDRATION PRECEDENCE AND THE COMPATIBILITY RULES');
// ================================================================================================================
eq(r.allocation_draft_id, H4.allocation_draft_id, 'D1  header-owned: allocation_draft_id');
eq(AFTER.draft.context, US, 'D2  header-owned: the scope the rows were hydrated for');
eq(r.shipping_method, 'sea', 'D3  header-owned: shipping method');
eq(r.last_mile_delivery, '', 'D4  header-owned: last mile (blank here, and blank is preserved)');
eq(r.generation_type, 'user_created', 'D5  header-owned: generation type');
eq(r.allocation_draft_line_id, L4.allocation_draft_line_id, 'D6  line-owned: allocation_draft_line_id');
eq(r.expected_arrival, '', 'D7  line-owned: expected_arrival — blank stays blank (B6-R1 §D.7)');
eq(r.recommended_qty, null, 'D8  line-owned: a blank recommended_qty is null, never a fabricated 0');
// §F.1/§F.2 — inheritance is DISPLAY ONLY.
ok(/source_warehouse_id: lineSrc \|\| hFrom,\s+\/\//.test(PAGE) || /lineSrc \|\| hFrom/.test(PAGEC),
  'D9  §F.1 the inheritance exists');
eq(runHydrate({ sourceMode: 'WORKSPACE' }).persisted <= 1, true, 'D10 §F.7 the hydrate performs no DB write of any kind');
ok(!/\b(upsertShippingAllocationDraft|saveShippingAllocationDraft)\b/.test(
     (PAGEC.match(/function _hydrateAllocationDraftFromDb[\s\S]*?\n\}\nwindow\._hydrateAllocationDraftFromDb/) || [''])[0]),
  'D11 §F.7 no writer is reachable from inside the hydrate');
// §F.6 — the legacy destination snapshot must not be promoted.
ok(String(JSON.stringify(r)).indexOf('Amazon') === -1,
  'D12 §F.6 the legacy destination snapshot "Amazon" appears NOWHERE in the hydrated route');
eq(r.destination_token, '', 'D13 §F.6 and no marketplace destination token was minted for it');
// §F.5
eq(r.destination_state, 'DESTINATION_CONFIRMATION_REQUIRED', 'D14 §F.5 a missing destination becomes a typed state');
// §F.8/§F.9
eq(r.planned_qty, 800, 'D15 §F.9 H4 planned_qty is conserved exactly');
eq([r.allocation_draft_id, r.allocation_draft_line_id], ['SADH-K2-E7AF9242', 'SADL-K2-16F4E4F9'],
  'D16 §F.8 no ID is regenerated');

// ================================================================================================================
section('E · §G — RENDERING, WITH THE SHIPPED initializeShippingAllocation');
// ================================================================================================================
// The default editor branch versus the persisted branch is the §G.5 question, and it is answered by RUNNING the
// shipped selector rather than by reading it.
function runInit(opts) {
  opts = opts || {};
  var rendered = [];
  var src = [
    extractFn(PAGE, '_allocationDraftRowsFor'),
    extractFn(PAGE, '_replenCtxEq'),
    extractFn(PAGE, 'initializeShippingAllocation'),
    'OUT = (function () { initializeShippingAllocation(SKU, SKUDATA); return rendered; })();'
  ].join(String.fromCharCode(10));
  var f = new Function('SKU', 'SKUDATA', 'replenAllocationDraft', '_replenCtx', 'document', 'rendered',
    '_renderExecutionRoute', 'updateShippingAllocationTotal', '_irLoadCarrierPlanning_',
    '_irSuggestedQtyNumber_',
    'var OUT;' + src + 'return OUT;');
  return f(opts.sku || 'CO1100-R', opts.skuData || { sku: 'CO1100-R', suggestedQty: 0 },
    opts.draft || AFTER.draft, function () { return opts.ctx || US; },
    { getElementById: function () { return {}; } }, rendered,
    function (sku, route) { rendered.push({ sku: sku, route: route }); },
    function () {}, undefined, opts.suggested);
}
var renderedUS = runInit({});
eq(renderedUS.length, 1, 'E1  §G.1 H4 renders exactly ONCE');
eq(renderedUS[0].route.allocation_draft_id, 'SADH-K2-E7AF9242', 'E2  §G.1 and it is H4, under its stored header id');
eq(renderedUS[0].route.qty, 800, 'E3  §G.1 with Qty 800');
eq(renderedUS[0].route.source_warehouse_id, YOUXIN, 'E4  §G.1 From = the header source warehouse');
eq(renderedUS[0].route.destination_token, '', 'E5  §G.7 To is blank until explicit confirmation');
ok(renderedUS[0].route.destination_state === 'DESTINATION_CONFIRMATION_REQUIRED', 'E6  §G.6 and it says so, in a typed field');
// §G.5 — the default editor must never replace it.
ok(!(renderedUS.length === 1 && renderedUS[0].route.qty === 0 && !renderedUS[0].route.allocation_draft_id),
  'E7  §G.5 the default Add Route editor did NOT replace H4');
// §G.2/§G.3 — zero-line and out-of-scope headers contribute no rows at all.
eq(Object.keys(AFTER.draft.bySku).length, 1, 'E8  §G.2 H1 and H2 have no lines and therefore no route rows');
var jpDraft = runHydrate({ sourceMode: 'WORKSPACE', ctx: { company: 'ResTW', country: 'JP', marketplace: 'Amazon' } });
eq(Object.keys(jpDraft.draft.bySku).sort(), ['JP-SKU-1', 'JP-SKU-2', 'JP-SKU-3', 'JP-SKU-4', 'JP-SKU-5'],
  'E9  §G.3 H3 renders in ITS OWN scope — it is separated, not discarded');
ok(Object.keys(AFTER.draft.bySku).indexOf('JP-SKU-1') === -1, 'E10 §G.3 and never in US/Amazon');
// §G.8/§G.9 — the method labels are untouched.
// §G.9 names three labels, and they do NOT all live in the same place — a test that pretended they did would
// pass for the wrong reason. '美森海卡' is a display label the PAGE itself maps; '空派' and '普船海卡' are
// operator-maintained carrier DATA (carrier_rate_cards.shipping_method_label), which no shipped source spells.
ok(/'空運': 'Air', '普船': 'Sea', '快船': 'Sea Express', '美森海卡': 'Sea Express'/.test(PAGEC),
  'E11 §G.9 the page display-label table is byte-identical, including 美森海卡 → Sea Express');
ok(PAGE.indexOf('空派') === -1 && PAGE.indexOf('普船海卡') === -1 &&
   read('assets/js/utils/inventory-compat.js').indexOf('空派') === -1 &&
   read('assets/js/utils/inventory-compat.js').indexOf('普船海卡') === -1,
  'E12 §G.9 空派 and 普船海卡 are operator DATA, spelled in no shipped source — so no source change can rename them');
// F1-7N-FB-4G-A0-R1 — RESTATED. A0 asserted its diff mentioned no label AT ALL, which was true of A0 and is
// the wrong test: A0-R1 legitimately ADDS the canonical service table — a byte-identical mirror of 69_
// RIC_SERVICE_LABELS_, which contains 普船 and 美森海卡. Adding the server's own mapping is not a rename. What
// §G.9 protects is that no existing label spelling is REMOVED or changed, so that is what is measured now.
var DIFF = cp.execSync('git diff HEAD -- assets/js assets/css index.html', { cwd: ROOT }).toString();
ok(!/^[-].*(空運|普船|快船|美森海卡|空派|普船海卡)/m.test(DIFF),
  'E13 §G.9 and this round removes or renames no method label');
ok(/'sea_express': 'Sea Express'/.test(PAGEC) && /'sea': 'Sea'/.test(PAGEC), 'E14 §G.8 canonical method mapping is unchanged');
// §E.11 — a repeated Search must not duplicate routes or listeners.
var twice = runHydrate({ sourceMode: 'WORKSPACE' });
eq(twice.draft.bySku['CO1100-R'].length, 1, 'E15 §E.11/§J.13 a repeated hydrate yields ONE route, not two');
ok(/if \(_irDraftHydrateInFlight\)/.test(PAGEC), 'E16 §J.13 and the trigger is single-flight');
ok(/if \(_irDraftHydrateScopeKey !== key\) return done\(false\);/.test(PAGEC),
  'E17 §J.13 a superseded Search cannot paint an older station\'s routes');

// ================================================================================================================
section('F · §H — STATUS AND CONFLICT');
// ================================================================================================================
eq(AFTER.ok, true, 'F1  §H.1 status=draft makes an active route ELIGIBLE for hydration');
eq((AFTER.draft.allocationDraftIds || []).length, 3, 'F2  §H.2 three same-scope draft headers coexist — draft alone is no conflict');
ok(!/BLOCKED_CONFLICT/.test((PAGEC.match(/function _hydrateAllocationDraftFromDb[\s\S]*?\nwindow\._hydrate/) || [''])[0]),
  'F3  §H.2 the hydrate raises no conflict of its own — readback and identity resolution are different questions');
eq(jpDraft.ok, true, 'F4  §H.3 scope separates H3 cleanly in both directions');
eq(AFTER.draft.bySku['CO1100-R'][0].shipping_method, 'sea', 'F5  §H.4 service separates H1/H2/H4 — the rendered route is the sea one');
eq(Object.keys(AFTER.draft.bySku).length, 1, 'F6  §H.5 zero-line H1/H2 do not participate in route rendering');
// §H.6 — but they must still be reachable for identity adoption. The K2 rival scan reads ACTIVE headers, not lines.
ok(/legacyRivals = activeRows\.filter/.test(code(G16)), 'F7  §H.6 the server\'s adoption scan is over active HEADERS, so H1/H2 remain eligible');
// §H.7 — terminal statuses unchanged.
var submitted = runHydrate({ sourceMode: 'WORKSPACE', headers: [Object.assign({}, H4, { status: 'submitted' })] });
eq(submitted.ok, false, 'F8  §H.7 a submitted header is still excluded from hydration');
var cancelledH = runHydrate({ sourceMode: 'WORKSPACE', headers: [Object.assign({}, H4, { status: 'cancelled' })] });
eq(cancelledH.ok, false, 'F9  §H.7 and so is a cancelled one');
ok(/lo\(d\.status\) !== 'cancelled' && lo\(d\.status\) !== 'submitted'/.test(PAGEC),
  'F10 §H.7 the terminal-status rule is exactly the one that shipped — not widened');
// §H.8 — a missing destination blocks WRITE, never READBACK.
eq(AFTER.ok, true, 'F11 §H.8 a destination-less route reads back fine');
ok(/_irRoutesMissingDestination_/.test(PAGEC), 'F12 §H.8 and Save/Submit is what a missing destination blocks');

// ================================================================================================================
section('G · §I — CO1100-T: SUGGESTED QTY 2120 AND EXECUTION PLAN QTY 0');
// ================================================================================================================
// The two numbers were read from two different sources for one quantity. PROVEN, not asserted.
function suggestedFor(opts) {
  var src = [
    extractFn(PAGE, '_irUseMaterializedGapRead'),
    extractFn(PAGE, '_irMatNum'),
    extractFn(PAGE, '_irAggregateActionableRecommendedQty'),
    extractFn(PAGE, '_irSuggestedQtyState_'),
    extractFn(PAGE, '_irSuggestedQtyNumber_'),
    extractFn(PAGE, '_irSuggestedCellHtml'),
    'OUT = { state: _irSuggestedQtyState_(ITEM), num: _irSuggestedQtyNumber_(ITEM), html: _irSuggestedCellHtml(ITEM) };'
  ].join(String.fromCharCode(10));
  var f = new Function('ITEM', 'window', '_irMatState', '_irRecommendationWorkspaceEnabled', '_irRecoLinesForSku',
    'var OUT;' + src + 'return OUT;');
  return f(opts.item, { KM_FLAGS: opts.flags || {} }, opts.mat || { status: 'IDLE', bySku: {} },
    function () { return true; }, function () { return null; });
}
var CO_T = { sku: 'CO1100-T', suggestedQty: 0 };
var matReady = { status: 'READY', bySku: { 'CO1100-T': { calculation_status: 'READY', d90_suggested_qty: 2120 } } };
var g = suggestedFor({ item: CO_T, mat: matReady });
eq(g.state.state, 'READY', 'G1  the top cell\'s authority is the MATERIALIZED gap row');
eq(g.state.value, 2120, 'G2  and its value for CO1100-T is 2120');
ok(g.html.indexOf('2120') !== -1, 'G3  which is what the Suggested Qty cell prints');
eq(CO_T.suggestedQty, 0, 'G4  THE CAUSE — the legacy per-row field the editor read is 0; the materialized read never fills it');
eq(g.num, 2120, 'G5  THE FIX — the editor now seeds from the SAME authority the cell prints');
ok(/_irSuggestedQtyNumber_\(skuData\)/.test(PAGEC), 'G6  and it is wired into the default-editor branch');
ok(!/var suggested = parseInt\(skuData\.suggestedQty\) \|\| 0;/.test(PAGEC), 'G7  the two-source split is gone');
// AND THE HONESTY RULES — no state may become a fabricated number.
eq(suggestedFor({ item: CO_T, mat: { status: 'LOADING', bySku: {} } }).num, 0, 'G8  PENDING seeds 0 — never a guess');
ok(suggestedFor({ item: CO_T, mat: { status: 'LOADING', bySku: {} } }).html.indexOf('…') !== -1, 'G9  and the cell still prints "…"');
var blocked = { status: 'READY', bySku: { 'CO1100-T': { calculation_status: 'BLOCKED', d90_suggested_qty: 2120 } } };
eq(suggestedFor({ item: CO_T, mat: blocked }).num, 0, 'G10 BLOCKED seeds 0 — a blocked recommendation is not a quantity');
ok(suggestedFor({ item: CO_T, mat: blocked }).html.indexOf('—') !== -1, 'G11 and the cell still prints an honest em dash');
var zero = { status: 'READY', bySku: { 'CO1100-T': { calculation_status: 'READY', d90_suggested_qty: 0 } } };
eq(suggestedFor({ item: CO_T, mat: zero }).state.state, 'READY', 'G12 a valid canonical 0 is READY, not NONE');
ok(suggestedFor({ item: CO_T, mat: zero }).html.indexOf('>0<') !== -1, 'G13 and prints as 0 — the FM3a rule is intact');
// §I — it must not save, and it must not touch H4.
ok(/This is a default preview[\s\S]{0,400}?captured into the Working Draft only once the PM edits it/.test(PAGE),
  'G14 §I the seeded editor is still a PREVIEW that writes nothing');
eq(renderedUS.length, 1, 'G15 §I and the CO1100-T question changed nothing about H4');

// ================================================================================================================
section('H · DEPLOYMENT IDENTITY');
// ================================================================================================================
// F1-7N-FC-1A-R1 — at-or-after: this round added no router action, but R1 does.
ok(Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]) >= 10,
  'H1  action contract is at or after 10 (this round added no router action)');
// F1-7N-FB-4G-A2-R3 - RESTATED to a floor: an equality forbids every later round from adding an action.
ok(Number((G63.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1]) >= 9,
  'H2  required-action-list is at or after 9');
eq((G63.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/) || [])[1], '1', 'H3  transport contract still 1');
// F1-7N-FB-4G-A0-R1 — RESTATED. These measured the WORKING TREE for a claim about A0's OWN COMMIT, so any
// later round that legitimately touches Apps Script broke them — and A0-R1 does, because the writer the page
// actually calls never carried destination_marketplace. The fact A0 established is fixed and checkable: A0's
// commit changed no Apps Script file. It is anchored to A0's own diff now, where it stays true forever.
var A0_DIFF = (function () {
  try { return cp.execSync('git diff --name-only 82da01c 60e5ef3', { cwd: ROOT }).toString(); }
  catch (e) { return null; }   // shallow clone / rewritten history — reported below rather than passed silently
})();
ok(A0_DIFF !== null, 'H4  A0\'s own commit range is resolvable (82da01c→60e5ef3)');
ok(A0_DIFF !== null && A0_DIFF.indexOf('apps-script') === -1,
  'H5  ZERO Apps Script files changed BY A0 — measured from A0\'s own diff, not from the working tree');
ok(/'inventoryReplenishment'[\s\S]{0,400}?'shipping_allocation_drafts'/.test(read('assets/js/api/km-api-foundation.js')),
  'H6  the workspace registration that makes the read model the right source is already in place');

// ================================================================================================================
section('I · MUTATIONS — every one verified by actually applying it');
// ================================================================================================================
// EVERY hydrate mutant is anchored INSIDE _hydrateAllocationDraftFromDb. M8's first draft used a whole-file
// PAGE.replace() and its pattern matched a DIFFERENT function — one that spells the same filter with `scope`
// instead of `ctx` — so it mutated code the hydrate never runs and reported a survival that meant nothing. A
// mutation that does not apply is a BROKEN PROBE, so this throws rather than returning false.
function mutateHydrate(find, replace) {
  var orig = extractFn(PAGE, '_hydrateAllocationDraftFromDb');
  var m = (find instanceof RegExp) ? orig.replace(find, replace) : orig.split(find).join(replace);
  if (m === orig) throw new Error('mutation did not apply inside _hydrateAllocationDraftFromDb: ' + find);
  return PAGE.replace(orig, m);
}
// M1 — the hydrate goes back to the broad cache. This is the defect this round fixes; it must fail loudly.
mut('M1  hydrate reading the broad cache is detected', function () {
  var before = runHydrate({ sourceMode: 'BROAD_EMPTY' });
  var after = runHydrate({ sourceMode: 'WORKSPACE' });
  return before.ok === false && after.ok === true;
});
// M2 — the line filter treats a blank line_status as inactive.
// The hydrate returns TRUE whenever an ACTIVE HEADER exists, so `ok` cannot see this mutant at all — the
// route silently vanishes while the function still reports success. That is exactly the failure mode this
// round is about, so the probe has to attack the point of DETECTION: the rendered route.
mut('M2  blank line_status treated as inactive is detected', function () {
  var out = runHydrateWith(mutateHydrate("lo(l.lineStatus || l.line_status) !== 'cancelled'",
                                         "lo(l.lineStatus || l.line_status) === 'active'"));
  return out.ok === true && !(out.draft.bySku['CO1100-R'] || []).length;
});
// M3 — the hydrate requires a line-level source warehouse.
mut('M3  requiring line.source_warehouse_id is detected', function () {
  var out = runHydrateWith(mutateHydrate('source_warehouse_id: lineSrc || hFrom,', 'source_warehouse_id: lineSrc,'));
  return out.ok === true && out.draft.bySku['CO1100-R'][0].source_warehouse_id === '';
});
// M4 — bySku keyed by site_sku.
mut('M4  keying bySku by site_sku is detected', function () {
  var out = runHydrateWith(mutateHydrate('var sku = raw.sku;', 'var sku = raw.site_sku;'));
  return Object.keys(out.draft.bySku || {}).indexOf('CO1100-R') === -1;
});
// M5 — a blank destination drops the whole route.
mut('M5  dropping a destination-less route is detected', function () {
  var out = runHydrateWith(mutateHydrate('if (!sku) return;',
    'if (!sku) return; if (!hDest.warehouse_id && !hDest.marketplace) return;'));
  return out.ok === true && !(out.draft.bySku['CO1100-R'] || []).length;
});
// M6 — the legacy 'Amazon' snapshot promoted to a canonical destination.
mut('M6  promoting the legacy Amazon snapshot is detected', function () {
  var out = runHydrateWith(mutateHydrate("var hMkt = hstr('destination_marketplace', 'destinationMarketplace');",
    "var hMkt = hstr('destination_marketplace', 'destinationMarketplace') || hstr('destination_snapshot', 'destinationSnapshot');"));
  return out.draft.bySku['CO1100-R'][0].destination_marketplace === 'Amazon';
});
// M7 — planned_qty summed across duplicate physical rows instead of disclosed.
mut('M7  summing duplicate physical rows is detected', function () {
  var dupes = [L4, Object.assign({}, L4)];
  var out = runHydrate({ sourceMode: 'WORKSPACE', headers: [H4], lines: dupes });
  return out.draft.bySku['CO1100-R'].length === 1 && out.draft.bySku['CO1100-R'][0].planned_qty === 800;
});
// M8 — scope separation removed, so JP bleeds into US. Removing ONLY the country/marketplace test is an
// EQUIVALENT mutant: H3 is ResTW, so the company test still excludes it and nothing changes. The mutant has to
// remove the whole scope predicate, which is what a real "we relaxed the filter" regression would look like.
mut('M8  losing the scope filter is detected', function () {
  var out = runHydrateWith(mutateHydrate(/return lo\(d\.country\)[\s\S]{0,240}?lo\(d\.status\) !== 'cancelled'/,
    "return lo(d.status) !== 'cancelled'"));
  return Object.keys(out.draft.bySku).indexOf('JP-SKU-1') !== -1;
});
// M9 — the default editor seeded from a fabricated number while the recommendation is still pending.
mut('M9  seeding a quantity from a PENDING state is detected', function () {
  var pending = suggestedFor({ item: CO_T, mat: { status: 'LOADING', bySku: {} } });
  return pending.num === 0 && pending.state.state === 'PENDING';
});
// M10 — the terminal-status guard widened to admit a submitted header.
mut('M10 admitting a submitted header is detected', function () {
  var out = runHydrateWith(mutateHydrate("lo(d.status) !== 'cancelled' && lo(d.status) !== 'submitted'",
    "lo(d.status) !== 'cancelled'"), { headers: [Object.assign({}, H4, { status: 'submitted' })] });
  return out.ok === true;
});

// Re-run the hydrate against a MUTATED copy of the page source. Same harness, different bytes.
function runHydrateWith(mutatedPage, opts) {
  opts = opts || {};
  var headers = opts.headers || RAW_HEADERS, lines = opts.lines || RAW_LINES;
  var readModel = { getShippingAllocationDrafts: headers.map(NORMS.header), getShippingAllocationDraftLines: lines.map(NORMS.line) };
  var src = [
    extractVar(mutatedPage, 'IR_ISO_DATE_RE_'),
    extractFn(mutatedPage, '_irCanonicalDateOrBlank_'),
    extractFn(mutatedPage, '_irWsGet'),
    'var _replenHydrateToken = 0;',
    'var replenAllocationDraft = { context: {}, targetDays: "", bySku: {} };',
    'function _irRenderDuplicateCorruptionBanner_() {}',
    'function _persistAllocationDraft() {}',
    extractFn(mutatedPage, '_hydrateAllocationDraftFromDb'),
    'RESULT = { ok: _hydrateAllocationDraftFromDb(CTX), draft: replenAllocationDraft };'
  ].join(String.fromCharCode(10));
  var f = new Function('window', 'sessionStorage', 'console', '_irReadModel', 'CTX', 'var RESULT;' + src + 'return RESULT;');
  return f({ IRWarehouse: COMPAT.IRWarehouse, IRDraft: COMPAT.IRDraft, KM: { DB: {
      getShippingAllocationDrafts: function () { return []; }, getShippingAllocationDraftLines: function () { return []; } } } },
    { setItem: function () {}, getItem: function () { return null; }, removeItem: function () {} },
    { warn: function () {}, log: function () {}, error: function () {} }, readModel, opts.ctx || US);
}

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed, mutations ' +
  neg.caught + ' caught / ' + neg.missed + ' missed');
process.exit(fail ? 1 : 0);
