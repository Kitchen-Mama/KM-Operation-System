// FC-SUMMARY-STABILITY-R2 — THE COLD PATH, AND THE ONE TABLE THAT WAS COSTING A WHOLE ROUND.
//
// WHAT R1 LEFT AND WHAT THIS CLOSES.
//
// R1 root-caused FC-1 / FC-3 / FC-4 and repaired only FC-5. Its FC-1 finding was "an extra sequential round
// on the Special path, and a dependency blocking modal OPEN while needed only at a later interaction". This
// round acts on it, and the arithmetic is the whole argument:
//
//   `_kmReadTablesBounded_` issues ONE request PER TABLE at `KM_SCOPED_READ_CONCURRENCY_` lanes.
//   That knob is 2. So 2 tables = 1 round and 3 tables = 2 rounds.
//
// The Special path declared three tables. The third — `campaigns` — has exactly two consumers, and neither
// runs on open: the Base Campaign selector (Event Assist, `method === 'growth'` only) and existing-event
// rehydration (which already deferred `campaign_sku_lines` at the same boundary). Deferring it takes the
// Special cold path from two serial 45s budgets to one.
//
// WHAT THIS SUITE DELIBERATELY ALSO ASSERTS: the seals it must not break. FC-5's "LOADING is not EMPTY" and
// FC-ID-R2's identity save boundary are both re-checked here, because a latency round is exactly the kind of
// round that quietly trades a guarantee for a request.
//
// NO PRODUCTION WRITE. Source text, declared constants and lifted pure functions only.
//
// Run: node assets/tests/fc-summary-stability-r2-cold-path.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var PAGE = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');
// Comments are not code.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function fnSrc(src, name) {
  var m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', m.index), d = 0, e = -1;
  for (var k = i; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) { e = k; break; } }
  }
  return src.slice(m.index, e + 1);
}
function listOf(blockSrc, name) {
  var m = new RegExp(name + ":\\s*\\[([^\\]]*)\\]").exec(blockSrc);
  return m ? (m[1].match(/'[^']+'/g) || []).map(function (q) { return q.replace(/'/g, ''); }) : [];
}

var PREREQ = /var _FC_PREREQ_TABLES_ = \{([\s\S]*?)\};/.exec(PAGE)[1];
var DEFERRED = /var _FC_DEFERRED_TABLES_ = \{([\s\S]*?)\};/.exec(PAGE)[1];
var REG = listOf(PREREQ, 'regular');
var EVT = listOf(PREREQ, 'event');
var LANES = parseInt(/var KM_SCOPED_READ_CONCURRENCY_ = (\d+);/.exec(API)[1], 10);
var TIMEOUT = parseInt(/var KM_READ_TIMEOUT_MS_ = (\d+);/.exec(API)[1], 10);
function rounds(n) { return Math.ceil(n / Math.max(1, LANES)); }

// =========================================================================================================
section('A. §3/§16 — the Special cold path is one round, and the arithmetic says why');
// =========================================================================================================

eq(LANES, 2, 'A1 the lane pool is still 2 — this round did not widen it');
eq(TIMEOUT, 45000, 'A2 §12 and the read budget is still 45s — the path was repaired, not the timeout');
eq(REG.slice().sort(), ['marketplace_skus', 'sku_details'], 'A3 the Regular cold set is the scope/datalist pair');
eq(EVT.slice().sort(), ['marketplace_skus', 'sku_details'], 'A4 and the Special cold set is now the SAME pair');
eq([REG.length, rounds(REG.length)], [2, 1], 'A5 REGULAR: 2 blocking table requests, 1 round (unchanged)');
eq([EVT.length, rounds(EVT.length)], [2, 1], 'A6 SPECIAL: 2 blocking table requests, 1 round — was 3 and 2');
// The claim that matters, stated as the arithmetic rather than as a count: a third table is a second round.
eq(rounds(3), 2, 'A7 and a THIRD table would be a second serial 45s budget — which is what campaigns cost');
eq(EVT.indexOf('campaigns'), -1, 'A8 §4 campaigns is no longer a Special cold-path prerequisite');

// =========================================================================================================
section('B. §2/§4 — campaigns is deferred to its two real consumers, and both gate on it');
// =========================================================================================================

ok(/campaigns:\s*'campaigns'/.test(DEFERRED), 'B1 campaigns is DECLARED in the deferred table set');
eq(listOf('x:[]', 'x'), [], 'B1a (list parser sanity — an empty declaration reads as empty, not as absent)');

var BASE = fnSrc(code(PAGE), '_evtPopulateBaseCampaigns');
ok(/_fcDeferredPending_\(_FC_DEFERRED_TABLES_\.campaigns\)/.test(BASE),
  'B2 the Base Campaign selector gates on campaigns being pending');
ok(/_fcEnsureDeferredTable_\(_FC_DEFERRED_TABLES_\.campaigns\)/.test(BASE),
  'B3 and is the consumer that buys it');
var HYD = fnSrc(code(PAGE), '_evtHydrateExisting_');
ok(/_FC_DEFERRED_TABLES_\.campaigns/.test(HYD) && /_FC_DEFERRED_TABLES_\.lines/.test(HYD),
  'B4 existing-event hydration waits for campaigns AND lines at the same boundary');
ok(/Promise\.all\(/.test(HYD),
  'B5 and awaits them TOGETHER — two serial subsection waits would move the cost, not remove it');

// §4's real question: is either consumer reachable on OPEN? The selector is called from exactly one place.
// CALLS only — the declaration `function _evtPopulateBaseCampaigns()` matches the bare name too, and
// counting it would report a third caller that does not exist.
var CALLERS = (code(PAGE).match(/(^|[^\w])_evtPopulateBaseCampaigns\(\)/gm) || [])
  .filter(function (m) { return !/function\s*$/.test(m.slice(0, -'_evtPopulateBaseCampaigns()'.length)); }).length
  - (/function _evtPopulateBaseCampaigns\(\)/.test(code(PAGE)) ? 1 : 0);
eq(CALLERS, 2, 'B6 the selector has exactly two call sites — the method handler and its own re-entry');
ok(/if \(method === 'growth'\) _evtPopulateBaseCampaigns\(\);/.test(code(PAGE)),
  'B7 §4 and the outer one fires ONLY on the growth method — never on modal open');
// The re-entry must be guarded, or a failed read could loop.
ok(/_evtAssistMethod\(\) === 'growth'/.test(BASE),
  'B8 the re-entry re-checks the method rather than closing over it — one re-entry, never a loop');

// =========================================================================================================
section('C. §17 — FC-5 is not traded away for a request');
// =========================================================================================================

var GATE = fnSrc(code(PAGE), '_fcTableGate_');
ok(/FC_FRESH_\.REFUSED/.test(GATE) && /ERROR_NO_MODEL/.test(GATE),
  'C1 the FC-5 table gate still distinguishes a refused read from an empty one');
ok(/Loading/.test(GATE), 'C2 and still renders LOADING rather than "No data found" for an unread slice');
ok(/_fcRegularSourceReady_|_fcEventSourceReady_/.test(GATE),
  'C3 asked of the readiness owners, not of the row count');
// The new selector branch obeys the same rule: it says what is true while it waits.
ok(/Loading campaigns/.test(BASE) && !/no matching campaign[\s\S]{0,120}Loading/.test(BASE),
  'C4 §17 the campaigns selector says LOADING while unread — never "(no matching campaign)"');
ok(/could not be read/.test(BASE),
  'C5 and a failed campaigns read disables the control with its reason, not with a false absence');

// =========================================================================================================
section('D. §11 — FC-ID-R2 identity boundary is untouched');
// =========================================================================================================

var SAVE = fnSrc(code(PAGE), 'saveEventUpdate');
ok(/_evtMarketplaceIdentity_\(site\)/.test(SAVE), 'D1 the save still resolves identity through the ONE owner');
ok(/_idr\.state !== FC_ID_\.READY_UNIQUE/.test(SAVE),
  'D2 and still refuses every non-READY_UNIQUE state — BLANK_MARKETPLACE_ID_WRITE_COUNT = 0');
ok(SAVE.indexOf('_evtMarketplaceIdentity_(site)') < SAVE.indexOf('_fcWriteBegin_'),
  'D3 with the gate still ABOVE _fcWriteBegin_ — the refusal is still CONFIRMED_NOT_STARTED');
// marketplaces must NOT have been dragged onto the cold path to make identity cheaper.
ok(PREREQ.indexOf('marketplaces') < 0,
  'D4 §11 and the registry was NOT added to the cold path — identity stays a save-boundary concern');

// =========================================================================================================
section('E. §7/§8 — pricing isolation, which was already correct and must stay so');
// =========================================================================================================

var RETRY = fnSrc(code(PAGE), '_evtOnPricingRetry_');
ok(/_fcEnsureDeferredTable_\(_FC_DEFERRED_TABLES_\.pricing\)/.test(RETRY),
  'E1 §8 Retry asks for pricing ALONE — PRICING_RETRY_REQUEST_COUNT = 1');
['sku_details', 'marketplace_skus', 'campaigns', 'fc_special_events'].forEach(function (t, i) {
  ok(RETRY.indexOf(t) < 0, 'E2.' + (i + 1) + ' and never re-reads ' + t + ' — no sibling is discarded');
});
var REQ = fnSrc(code(PAGE), '_evtRequestPricing_');
ok(/_fcDeferredFlight_\[_FC_DEFERRED_TABLES_\.pricing\]/.test(REQ),
  'E3 §14 the row-level request is single-flight — DUPLICATE_PRICING_REQUEST_COUNT = 0');
var APPLY = fnSrc(code(PAGE), '_evtApplyRowPricing');
ok(/priceState = 'pending'/.test(APPLY) && /priceState = 'missing_price'/.test(APPLY),
  'E4 §7 PENDING and MISSING are distinct row states — an unread price is never a false zero');
ok(/The price list is not loaded/.test(code(PAGE)),
  'E5 and a Save while pricing is pending is refused rather than saved against a blank');

// =========================================================================================================
section('F. §9/§10 — the post-save path cools tables, not paths, and poisons nothing');
// =========================================================================================================

var RESET = fnSrc(code(PAGE), '_fcResetSecondaryCache');
ok(/_fcSliceTables_\(slice\)/.test(RESET) && /if \(!tables\)/.test(RESET),
  'F1 §9 an unknown write scope still invalidates everything — fail-closed is preserved');
ok(/_fcReconcileFromReceipts_/.test(RESET),
  'F2 and a table the receipt proved current is kept, not re-read');
var WARM = fnSrc(code(PAGE), '_fcPostWriteWarm_');
ok(/_fcDeferredEverUsed_\[t\]/.test(WARM),
  'F3 §9 the warm-up still holds deferred tables this session has actually used — campaigns included');
ok(/return Promise\.resolve\(\[\]\)/.test(WARM),
  'F4 and warms nothing when there is nothing held — a session that never used them buys nothing');
// The disjointness that makes FC-3 cheap: no FC write scope touches a builder prerequisite.
var SLICEP = /var _FC_SLICE_PREREQ_TABLES_ = \{([\s\S]*?)\};/.exec(PAGE)[1];
var changed = {};
['regular', 'events', 'rules'].forEach(function (sl) { listOf(SLICEP, sl).forEach(function (t) { changed[t] = 1; }); });
eq(REG.concat(EVT).filter(function (t) { return changed[t]; }), [],
  'F5 §9 NO write scope changes a builder prerequisite — so a save cannot cool the cold path');

// =========================================================================================================
section('G. mutation');
// =========================================================================================================

mut('G1 campaigns is moved back onto the Special cold path', function () {
  var src = PAGE.replace("event: ['sku_details', 'marketplace_skus']",
    "event: ['sku_details', 'marketplace_skus', 'campaigns']");
  if (src === PAGE) throw new Error('G1 anchor drifted');
  var p = /var _FC_PREREQ_TABLES_ = \{([\s\S]*?)\};/.exec(src)[1];
  var e = listOf(p, 'event');
  // The mutant is caught on the ROUND COUNT, which is the thing that actually costs the operator.
  return e.length === 3 && rounds(e.length) === 2 && rounds(EVT.length) === 1;
});

mut('G2 the read timeout is raised instead of the path repaired', function () {
  var src = API.replace('var KM_READ_TIMEOUT_MS_ = 45000;', 'var KM_READ_TIMEOUT_MS_ = 120000;');
  if (src === API) throw new Error('G2 anchor drifted');
  var t = parseInt(/var KM_READ_TIMEOUT_MS_ = (\d+);/.exec(src)[1], 10);
  return t === 120000 && TIMEOUT === 45000;
});

mut('G3 the lane pool is widened instead', function () {
  var src = API.replace('var KM_SCOPED_READ_CONCURRENCY_ = 2;', 'var KM_SCOPED_READ_CONCURRENCY_ = 8;');
  if (src === API) throw new Error('G3 anchor drifted');
  return parseInt(/var KM_SCOPED_READ_CONCURRENCY_ = (\d+);/.exec(src)[1], 10) === 8 && LANES === 2;
});

mut('G4 pricing Retry reloads its siblings', function () {
  var faked = RETRY.replace('_fcEnsureDeferredTable_(_FC_DEFERRED_TABLES_.pricing)',
    "window.KM.DB.refreshCacheTables(['pricing_list', 'sku_details', 'marketplace_skus'])");
  if (faked === RETRY) throw new Error('G4 anchor drifted');
  return /sku_details/.test(faked) && RETRY.indexOf('sku_details') < 0;
});

mut('G5 the identity guard is weakened to let a blank through', function () {
  var src = code(PAGE).replace('_idr.state !== FC_ID_.READY_UNIQUE', '_idr.state === null');
  if (src === code(PAGE)) throw new Error('G5 anchor drifted');
  var s2 = fnSrc(src, 'saveEventUpdate');
  return !/_idr\.state !== FC_ID_\.READY_UNIQUE/.test(s2) && /_idr\.state !== FC_ID_\.READY_UNIQUE/.test(SAVE);
});

mut('G6 an unread slice renders as empty again', function () {
  var faked = GATE.replace(/return \{ kind: 'LOADING'[\s\S]*?\};/, 'return null;');
  if (faked === GATE) throw new Error('G6 anchor drifted');
  return !/LOADING/.test(faked) && /LOADING/.test(GATE);
});

mut('G7 the campaigns selector reports an absence while still loading', function () {
  var faked = BASE.replace(/if \(_fcDeferredPending_\(_FC_DEFERRED_TABLES_\.campaigns\)\)[\s\S]*?\n  \}/, '');
  if (faked === BASE) throw new Error('G7 anchor drifted');
  // Without the gate the function falls straight through to the empty-list branch, which states
  // '(no matching campaign with FC data)' — a claim about the DATA made before it was read.
  return !/Loading campaigns/.test(faked) && /Loading campaigns/.test(BASE) &&
    /no matching campaign with FC data/.test(faked);
});

mut('G8 hydration stops waiting for campaigns and reads it unread', function () {
  var faked = HYD.replace(/_FC_DEFERRED_TABLES_\.campaigns/, "'__none__'");
  if (faked === HYD) throw new Error('G8 anchor drifted');
  return !/_FC_DEFERRED_TABLES_\.campaigns/.test(faked) && /_FC_DEFERRED_TABLES_\.campaigns/.test(HYD);
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('FC-SUMMARY-STABILITY-R2 COLD PATH — ' + pass + ' passed / ' + fail + ' failed');
console.log('mutants: ' + neg.caught + ' caught / ' + (neg.caught + neg.missed) + ' planted');
if (fail === 0) {
  console.log('SPECIAL_COLD_BLOCKING_TABLE_REQUESTS 3 -> 2   SPECIAL_COLD_ROUNDS 2 -> 1');
  console.log('REGULAR_COLD unchanged at 2 requests / 1 round');
  console.log('READ_TIMEOUT_MS unchanged at ' + TIMEOUT + '   LANES unchanged at ' + LANES);
  console.log('FC5_SEAL_HELD = YES   FC_ID_R2_SEAL_HELD = YES   BLANK_MARKETPLACE_ID_WRITE_COUNT = 0');
  console.log('PRODUCTION_ROWS_WRITTEN = 0   FORECAST_FORMULA_CHANGED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
