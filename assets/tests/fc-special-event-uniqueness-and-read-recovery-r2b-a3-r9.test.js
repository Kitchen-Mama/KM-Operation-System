// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R9
// ONE EVENT FLAG, ONE TARGET YEAR, ONE SCOPED SKU = ONE EVENT
//
// Live operator smoke after A3-R8 found five production-only gaps. Two of them are the same product
// question asked twice:
//
//   B  A New Event could create a second event for a SKU that already had one, just by choosing a
//      different window — because A3-R8 had frozen "a different window is a different event".
//   E  And the dates of a saved event were DISABLED, so the only way to correct a period was to
//      create that second event. The rule and the missing control produced each other.
//
// The product owner's ruling settles both: for a scoped SKU, one event flag in one target year is
// ONE logical event, whatever its dates. Creating a second is refused — in the browser so the
// operator hears it early, and in 14_ because a browser is not an authority. Editing the period of
// the existing event is allowed, behind an explicit confirmation, and moves that event by
// REASSIGNMENT: the shared campaign header is never mutated, so no sibling SKU travels with it.
//
//   A  Existing-event editing was capped at 8 SKUs — an authoring limit applied to storage.
//   C  getTable could fail REDIRECT_TARGET_NOT_FOUND / EXPIRED_USERCONTENT_REDIRECT.
//   D  getTable could fail REQUEST_TIMEOUT.
//
// Run: node assets/tests/fc-special-event-uniqueness-and-read-recovery-r2b-a3-r9.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutants = [], survived = [];
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mutant(l, caught) {
  mutants.push(l);
  if (caught === true) { pass++; console.log('ok   ' + l + ' (caught)'); }
  else { survived.push(l); fail++; console.error('FAIL ' + l + ' — MUTANT SURVIVED'); }
}
var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');
var GS14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
var HTML = read('assets/html/pages/fc-summary.html');
var SPEC = read('docs/planning/FC_SUMMARY_SPEC.md');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = (src.slice(Math.max(0, i - 6), i) === 'async ') ? i - 6 : i;
  var d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
function varSrc(src, name) {
  var m = new RegExp('var ' + name + ' = [\\s\\S]*?;\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
function faulted(src, from, to, label) {
  var out = src.split(from).join(to);
  if (out === src) throw new Error(label + ' anchor drifted — the mutant would inject nothing');
  return out;
}

// One SKU with a BFCM 2026 event, a sibling on the same campaign, and the same SKU under a DIFFERENT
// flag and a DIFFERENT year — so "blocked" and "allowed" both have something real to be about.
function ev(o) {
  var base = { event_fc_id: 'EFC-X', campaign_id: 'CMP-X', campaign_sku_line_id: 'CSL-X',
    company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MKT-1',
    scope_type: 'sku', scope_id: 'CO1100-R', sku: 'CO1100-R', series: 'CO1100', category: 'Cookware',
    event_name: 'BFCM', event_period: '', event_start_date: '2026-11-19', event_end_date: '2026-11-30',
    event_month: '11', year: '2026', fc_qty: 4200, note: '' };
  Object.keys(o || {}).forEach(function (k) { base[k] = o[k]; });
  return base;
}
var E_BFCM_1100 = ev({ event_fc_id: 'EFC-1100', campaign_id: 'CMP-BFCM26', campaign_sku_line_id: 'CSL-1100' });
var E_BFCM_1150 = ev({ event_fc_id: 'EFC-1150', campaign_id: 'CMP-BFCM26', campaign_sku_line_id: 'CSL-1150',
  sku: 'CO1150-B', scope_id: 'CO1150-B', series: 'CO1150', fc_qty: 800 });
var E_PRIME_1100 = ev({ event_fc_id: 'EFC-1100P', campaign_id: 'CMP-PRIME26', campaign_sku_line_id: 'CSL-1100P',
  event_name: 'Prime Day', event_start_date: '2026-07-15', event_end_date: '2026-07-16',
  event_month: '7', fc_qty: 999 });
var E_BFCM27_1100 = ev({ event_fc_id: 'EFC-1100-27', campaign_id: 'CMP-BFCM27', campaign_sku_line_id: 'CSL-1100-27',
  event_start_date: '2027-11-25', event_end_date: '2027-11-29', year: '2027', fc_qty: 1 });
var ALL = [E_BFCM_1100, E_BFCM_1150, E_PRIME_1100, E_BFCM27_1100];

// =========================================================================================================
section('A. THE UNIQUENESS KEY, AND WHAT IT DOES NOT CONTAIN');
// =========================================================================================================
function keyWorld(opts) {
  opts = opts || {};
  var events = (opts.events === undefined) ? ALL : opts.events;
  var sb = {
    console: console, String: String, Number: Number, Object: Object, Array: Array, JSON: JSON,
    parseFloat: parseFloat, isNaN: isNaN
  };
  vm.createContext(sb);
  vm.runInContext([
    fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'),
    'function _fcResolveMarketplaceKey(v) { return String(v == null ? "" : v).trim(); }',
    'var __events = ' + JSON.stringify((events || []).map(function (r) {
      return { raw: r, campaignId: r.campaign_id, sku: r.sku, company: r.company, country: r.country,
        marketplace: r.marketplace, eventStartDate: r.event_start_date, eventEndDate: r.event_end_date,
        event: r.event_name, year: r.year, eventFcId: r.event_fc_id,
        campaignSkuLineId: r.campaign_sku_line_id };
    })) + ';',
    'function _evtBuilderEventRows_() { return ' + (events === null ? 'null' : '__events') + '; }',
    opts.keySrc || fnSrc(FCS, '_evtUniquenessKey_'),
    opts.dupSrc || fnSrc(FCS, '_evtDuplicateConflicts_'),
    fnSrc(FCS, '_evtDuplicateRefusalText_')
  ].join('\n'), sb);
  return sb;
}
var CTX = { company: 'ResUS', country: 'US', marketplace: 'Amazon', eventFlag: 'BFCM', year: 2026 };

(function () {
  var W = keyWorld();
  var k = W._evtUniquenessKey_('ResUS', 'US', 'Amazon', 'CO1100-R', 'BFCM', 2026);
  ok(k.indexOf('2026-11-19') === -1 && k.indexOf('2026-11-30') === -1,
    'A1  the key carries NO date — that is the whole ruling', k);
  eq(k, W._evtUniquenessKey_('resus', ' us ', 'Amazon', 'co1100-r', 'bfcm', '2026'),
    'A2  and it is case- and whitespace-insensitive, so a typed scope matches a stored one');
  ok(k !== W._evtUniquenessKey_('ResUS', 'US', 'Walmart', 'CO1100-R', 'BFCM', 2026),
    'A3  marketplace IS in the key — KM Amazon and KM Walmart are separate events');
})();

// Tests 1-7 of §10: which authored SKUs are blocked and which are allowed.
(function () {
  var W = keyWorld();
  function hits(skus, ctx) { return W._evtDuplicateConflicts_(skus, ctx || CTX).map(function (h) { return h.sku; }); }
  eq(hits(['CO9999-Z']), [], 'B1  a SKU with no event at all is allowed (§10.1)');
  eq(hits(['CO1100-R']), ['CO1100-R'], 'B2  the same SKU + flag + year is blocked — same window (§10.2)');
  eq(hits(['CO1100-R'], { company: 'ResUS', country: 'US', marketplace: 'Amazon', eventFlag: 'BFCM', year: 2026 }),
    ['CO1100-R'], 'B3  and blocked whatever window the operator types (§10.3/10.4/10.5)');
  eq(hits(['CO1100-R'], { company: 'ResUS', country: 'US', marketplace: 'Amazon', eventFlag: 'Spring Sale', year: 2026 }),
    [], 'B6  a DIFFERENT event flag is a different event — allowed (§10.6)');
  eq(hits(['CO1100-R'], { company: 'ResUS', country: 'US', marketplace: 'Amazon', eventFlag: 'Prime Day', year: 2026 }),
    ['CO1100-R'], 'B6a while a flag this SKU DOES hold is blocked — the key is per flag, not per SKU');
  eq(hits(['CO1100-R'], { company: 'ResUS', country: 'US', marketplace: 'Amazon', eventFlag: 'BFCM', year: 2028 }),
    [], 'B7  a different target year is a different event — allowed (§10.7)');
  eq(hits(['CO1100-R'], { company: 'ResUS', country: 'US', marketplace: 'Amazon', eventFlag: 'BFCM', year: 2027 }),
    ['CO1100-R'], 'B7a while the year that DOES hold one is still blocked');
  eq(hits(['CO1100-R'], { company: 'KM', country: 'US', marketplace: 'Amazon', eventFlag: 'BFCM', year: 2026 }),
    [], 'B7b and another company is another site — KM and ResUS never collide');
})();

(function () {
  // §10.9 — one conflict in a multi-SKU authoring fails the WHOLE save. Never a partial save.
  var W = keyWorld();
  var hits = W._evtDuplicateConflicts_(['CO9999-Z', 'CO1100-R', 'CO1150-B'], CTX);
  eq(hits.map(function (h) { return h.sku; }).sort(), ['CO1100-R', 'CO1150-B'],
    'B9  every conflicting SKU is listed, not just the first');
  var txt = W._evtDuplicateRefusalText_(hits, CTX);
  ok(/CO1100-R/.test(txt) && /CO1150-B/.test(txt) && /2026-11-19/.test(txt),
    'B9a and the refusal names each one with the window it already occupies', txt);
  ok(/Nothing was written/.test(txt), 'B9b and states plainly that nothing was written');
  var SAVE = fnSrc(FCS, 'saveEventUpdate');
  ok(/if \(_dupHits\.length\) \{ alert\(_evtDuplicateRefusalText_\(_dupHits, _dupCtx\)\); return; \}/.test(SAVE),
    'B9c the save returns on ANY conflict — conflicting rows are never skipped so the rest can save');
  ok(!/_dupHits\s*\.\s*filter|_dupHits\s*\.\s*slice/.test(SAVE),
    'B9c1 and it never narrows the conflict set — a partial save of an authored set is a different set');
  // BASE-EVENT-FC-READINESS §C/§E — the third outcome, which used to fall through to the server.
  ok(/if \(_dupHits === null\) \{/.test(SAVE),
    'B9c2 an UNREADABLE event model refuses HERE, rather than walking into a predictable stage-1 refusal');
  ok(SAVE.indexOf('_dupHits === null') < SAVE.indexOf('_dupHits.length'),
    'B9c3 and it is decided BEFORE the conflict count, because null has no length to read');
  ok(SAVE.indexOf('_evtDuplicateConflicts_') < SAVE.indexOf('DB.upsertCampaign'),
    'B9d and it runs BEFORE stage 1, so a blocked save writes nothing at any table');
  ok(/if \(!_evtEditingActive_\(\)\) \{/.test(SAVE.slice(SAVE.indexOf('A3-R9 §2'))),
    'B9e while an EXISTING event is exempt — it addresses the row it loaded');
})();

(function () {
  // An unread model is not an empty one. Reporting "no conflicts" from a model that could not be read
  // would be the browser asserting something it does not know.
  var W = keyWorld({ events: null });
  eq(W._evtDuplicateConflicts_(['CO1100-R'], CTX), null,
    'B10 an UNREAD read model yields null — never a clean preflight');
})();

// =========================================================================================================
section('C. THE SERVER IS THE AUTHORITY (§10.8, §10.10)');
// =========================================================================================================
var UFIELDS = varSrc(GS14, 'FC_SE_UNIQUENESS_FIELDS_');
eq(UFIELDS.match(/'[a-z_]+'/g).map(function (s) { return s.slice(1, -1); }),
  ['company', 'country', 'marketplace', 'sku', 'event_name', 'year'],
  'C1  14_ keys uniqueness on the SAME six fields the client does');
ok(UFIELDS.indexOf('event_start_date') === -1 && UFIELDS.indexOf('event_end_date') === -1,
  'C1a and on no date — client and server agree on what an event IS');
var UP = fnSrc(GS14, 'fcSpecialEventUpsert_');
ok(UP.indexOf('fcSeUniquenessConflict_(s, body, targetRow)') !== -1,
  'C2  the gate runs inside the canonical upsert, so BOTH the single and batch actions inherit it');
ok(UP.indexOf('var seConflict') < UP.indexOf('// CREATE'),
  'C3  before the create branch — a refused duplicate never appends');
ok(/DUPLICATE_SPECIAL_EVENT_IDENTITY/.test(UP) && /Nothing was written/.test(UP),
  'C4  and it is a typed, zero-write refusal');
var CONF = fnSrc(GS14, 'fcSeUniquenessConflict_');
ok(/if \(selfRow > 0 && rowNo === selfRow\) continue;/.test(CONF),
  'C5  an UPDATE excludes its own row — editing an event is not colliding with it');
ok(/if \(want\.split\('\|'\)\.some\(function \(p\) \{ return p === ''; \}\)\) return null;/.test(CONF),
  'C6  an incomplete key proves nothing and refuses nothing');
ok(/'DUPLICATE_SPECIAL_EVENT_IDENTITY'/.test(API),
  'C7  the code is registered canonically, so the UI shows the refusal and not READ_FAILED');
ok(/both pass the scan before either appends/.test(GS14) && /remaining race/.test(GS14),
  'C8  and the residual race a scan cannot close is stated in the file, not hidden');
ok(/adding one is a migration/.test(GS14),
  'C8a naming why it is a scan — closing it fully needs a schema change this round did not make');

// A live model of the gate: two rows, one key, and the second one refused.
(function () {
  var sb = { console: console, String: String, Object: Object, Array: Array };
  vm.createContext(sb);
  vm.runInContext([fnSrc(GS14, 'fcEvtUp_'), varSrc(GS14, 'FC_SE_UNIQUENESS_FIELDS_'),
    fnSrc(GS14, 'fcSeUniquenessKey_'), fnSrc(GS14, 'fcSeUniquenessConflict_')].join('\n'), sb);
  var cols = ['event_fc_id', 'company', 'country', 'marketplace', 'sku', 'event_name', 'year',
    'event_start_date', 'event_end_date', 'campaign_id'];
  var s = {
    rows: [cols,
      ['EFC-1100', 'ResUS', 'US', 'Amazon', 'CO1100-R', 'BFCM', '2026', '2026-11-19', '2026-11-30', 'CMP-BFCM26']],
    col: function (n) { return cols.indexOf(n); }
  };
  var body = { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R',
    event_name: 'BFCM', year: '2026' };
  var hit = sb.fcSeUniquenessConflict_(s, body, -1);
  ok(!!hit && hit.event_fc_id === 'EFC-1100',
    'C9  §10.8 — a save the browser believed was new is caught by the server anyway');
  eq(hit.event_start_date, '2026-11-19', 'C9a and it reports the window the stored event occupies');
  eq(sb.fcSeUniquenessConflict_(s, body, 2), null,
    'C10 §10.10 — the row updating ITSELF is not a conflict');
  eq(sb.fcSeUniquenessConflict_(s, { company: 'ResUS', country: 'US', marketplace: 'Amazon',
    sku: 'CO1100-R', event_name: 'BFCM', year: '2027' }, -1), null,
    'C11 and a different year passes, so the guard is a key and not a blanket');
  eq(sb.fcSeUniquenessConflict_(s, { company: 'ResUS', country: 'US', marketplace: 'Amazon',
    sku: 'CO1100-R', event_name: '', year: '2026' }, -1), null,
    'C12 while an incomplete key refuses nothing');
})();

// =========================================================================================================
section('D. THE EXISTING-EVENT SKU CAP (§10.11-10.14)');
// =========================================================================================================
function capWorld(editing) {
  var sb = { console: console, Infinity: Infinity };
  vm.createContext(sb);
  vm.runInContext([
    'var _evtEditing_ = ' + JSON.stringify(editing || null) + ';',
    fnSrc(FCS, '_evtEditingActive_'), varSrc(FCS, 'EVT_MAX_ROWS'), fnSrc(FCS, '_evtRowCap_')
  ].join('\n'), sb);
  return sb;
}
eq(capWorld(null)._evtRowCap_(), 8, 'D1  §10.14 — NEW EVENT single-SKU authoring keeps MAX 8');
eq(capWorld({ campaignId: 'CMP-BFCM26' })._evtRowCap_(), Infinity,
  'D2  §10.12/10.13 — an EXISTING event has no authoring cap, so 13 or 20 rows all load');
var ADD = fnSrc(FCS, '_evtAddSingleRow');
ok(/wrap\.children\.length >= _evtRowCap_\(\)/.test(ADD),
  'D3  the add-row guard consults the cap, not the constant');
var SAVE2 = fnSrc(FCS, 'saveEventUpdate');
ok(/rows\.length > _evtRowCap_\(\)/.test(SAVE2),
  'D4  and so does the save — an existing 20-SKU event is never refused for being what it is');
ok(!/rows\.length > EVT_MAX_ROWS/.test(SAVE2) && !/children\.length >= EVT_MAX_ROWS/.test(FCS),
  'D5  no path still compares against the bare constant — truncation has one owner, not four');
var CHROME = fnSrc(FCS, '_evtSetEditingChrome_');
ok(/if \(addBtn && on\) \{ addBtn\.disabled = false/.test(CHROME),
  'D6  and the add-row button is re-enabled when an existing event loads past the cap');

// =========================================================================================================
section('E. THE PERIOD IS EDITABLE, BEHIND A CONFIRMATION (§10.15-10.22)');
// =========================================================================================================
ok(/id="event-window-confirm"/.test(HTML) && /id="event-window-confirm-row"/.test(HTML),
  'E1  the confirmation control exists in the markup');
ok(/<input type="date" id="event-start-date"/.test(HTML),
  'E1a and the period inputs are ordinary date fields');
ok(/\['event-country', 'event-marketplace', 'event-target-year', 'event-name-input'\]\.forEach/.test(CHROME),
  'E2  scope, flag and year stay disabled while editing — they ARE the uniqueness key');
ok(/\['event-start-date', 'event-end-date'\]\.forEach\(function \(id\) \{\n    var el = document\.getElementById\(id\); if \(el\) \{ el\.disabled = false; \}/.test(CHROME),
  'E2a while the period is explicitly ENABLED — §0 FAIL E, closed');
// A3-R10 §10.2 — the chrome no longer owns this. Both period rows are owned by _evtSyncPeriodUi_,
// derived from (editing, confirmed), which is what stopped a saved event offering a tick above
// dates it was not showing. Same rule, asserted where it now lives.
var PERIODUI = fnSrc(FCS, '_evtSyncPeriodUi_');
ok(/confirmRow\.hidden = !editing;/.test(PERIODUI),
  'E2b and the confirmation is shown only while an event is loaded');
ok(/periodRow\.style\.display = showDates \? '' : 'none';/.test(PERIODUI)
   && /var showDates = !editing \|\| confirmed;/.test(PERIODUI),
  'E2b1 and the dates follow the mode: always on a new event, only when confirmed on a saved one');
ok(/_evtSyncPeriodUi_\(\);/.test(CHROME),
  'E2b2 with the chrome delegating to that one owner rather than keeping a second copy');
ok(/if \(cb && !on\) cb\.checked = false;/.test(CHROME),
  'E2c and cleared when none is');

var GATE = fnSrc(FCS, '_evtWindowChangeGate_');
ok(/if \(!_evtWindowChanged_\(startDate, endDate\)\) return \{ blocked: false, code: '' \};/.test(GATE),
  'E3  §10.15 — unchanged dates never need the confirmation');
ok(/if \(_evtWindowConfirmChecked_\(\)\) return \{ blocked: false, code: 'CONFIRMED' \};/.test(GATE),
  'E4  §10.19 — a ticked confirmation lets the change through');
ok(/EVENT_WINDOW_CHANGE_REQUIRES_CONFIRMATION/.test(GATE) && /oldStart:|from:/.test(GATE),
  'E5  §10.16-10.18 — otherwise it blocks, naming both windows');
ok(SAVE2.indexOf('_evtWindowChangeGate_') < SAVE2.indexOf('DB.upsertCampaign'),
  'E6  and it runs before stage 1, so a blocked save writes nothing');

// The move contract itself — asserted at the seam that carries it.
ok(/if \(_evtEditingActive_\(\) && !_winEdit\) \{/.test(SAVE2),
  'E7  §10.19 — a confirmed move does NOT quote the loaded campaign_id');
ok(/campaignPayload\.campaign_id = _evtEditing_\.campaignId;/.test(SAVE2),
  'E7a while an ordinary edit still does, so the A3-R4 reuse contract is untouched');
var IDS = fnSrc(FCS, '_evtSingleRowIdentity_');
ok(/if \(_evtEditingActive_\(\)\) \{[\s\S]{0,200}eventFcId: r\.eventFcId/.test(IDS),
  'E8  §10.22 — a loaded row keeps its event_fc_id and line id through the move');
ok(!/_evtDetachAsNewEvent_/.test(FCS),
  'E9  §10.21 — "save the new window as a second event" is GONE, not merely unreachable');
var NOTICE = fnSrc(FCS, '_evtShowWindowChangeNotice_');
// A3-R10 §9 — the notice names the control BY ITS ACTUAL LABEL, read out of the markup rather than
// repeated here. A literal in this file would let the button and the sentence describing it drift,
// which is the same defect the shared retry-label guard exists to catch.
var CBLABEL = (/<input type="checkbox" id="event-window-confirm"[^>]*>\s*<span>([^<]+)<\/span>/
  .exec(HTML) || [])[1];
ok(!!CBLABEL, 'E9a0 the confirmation control carries a visible label');
ok(NOTICE.indexOf(CBLABEL) !== -1 && !/as its own event/.test(NOTICE),
  'E9a and the notice points at that control instead of offering that second event');
ok(/Keep /.test(NOTICE), 'E9b while abandoning the change is still one click');
// THE COPY, NOT THE COMMENTARY. The rule is about what the OPERATOR reads, and a comment recording
// why the old wording was wrong necessarily names the words it removed — which is not a violation.
// Comments are stripped so the assertion tests the sentence rather than the file around it.
var NOTICE_COPY = NOTICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
ok(!/campaign|forecast id|identity/i.test(NOTICE_COPY),
  'E9c and it says none of that in write-path vocabulary');

// =========================================================================================================
section('F. READ TRANSPORT — THE EXPIRED DELIVERY HOP (§10.23-10.26)');
// =========================================================================================================
var GT = fnSrc(API, 'getOperationDbTableFromSheet');
ok(/_kmGetTableOnce_/.test(GT), 'F1  getTable now has a recovery wrapper around one bounded attempt');
ok(/if \(code !== 'REDIRECT_TARGET_NOT_FOUND'\) throw e;/.test(GT),
  'F2  §10.25 — every other typed failure is rethrown untouched, timeout included');
eq((GT.match(/_kmGetTableOnce_\(tableName\)/g) || []).length, 2,
  'F3  §10.23/10.26 — exactly ONE extra attempt, never a loop');
var ONCE = fnSrc(API, '_kmGetTableOnce_');
ok(/OP_DB_API_BASE_URL \+ '\?action=getTable/.test(ONCE),
  'F4  and the URL is rebuilt from the stable /exec every time');
ok(!/googleusercontent/.test(ONCE),
  'F5  §10.26 — the expired target is never stored and so can never be retried');
ok(/REDIRECT_TARGET_NOT_FOUND/.test(read('assets/js/api/km-transport.js')),
  'F6  the typing this depends on is still the shared transport\'s, not a second copy');

// Behavioural: a world where the first attempt dies of an expired hop and the second succeeds.
function tableWorld(outcomes) {
  var calls = [];
  var sb = { console: console, String: String, Object: Object, Error: Error, Promise: Promise,
    Date: Date, JSON: JSON, encodeURIComponent: encodeURIComponent };
  sb.OP_DB_API_BASE_URL = 'https://script.google.com/macros/s/AK/exec';
  sb.isOperationDbApiConfigured = function () { return true; };
  sb._kmReportSample_ = function () {};
  sb.__calls = calls;
  sb._kmGetTableOnce_ = function (name) {
    calls.push(name);
    var o = outcomes.shift();
    if (o === 'ok') return Promise.resolve([{ row: 1 }]);
    var e = new Error(o);
    e.kmTransport = { code: o };
    return Promise.reject(e);
  };
  vm.createContext(sb);
  vm.runInContext(fnSrc(API, 'getOperationDbTableFromSheet'), sb);
  return sb;
}

// =========================================================================================================
section('G. READ TRANSPORT — TIMEOUT STAYS THE OPERATOR\'S (§10.27-10.32)');
// =========================================================================================================
ok(/code: \(netErr && netErr\.kmTimeout\) \? 'REQUEST_TIMEOUT' : 'HTTP_TRANSPORT_ERROR'/.test(ONCE),
  'G1  §10.27 — a timeout is still typed REQUEST_TIMEOUT');
ok(/retryable: true, action: 'getTable'/.test(ONCE),
  'G1a and still marked retryable, so the Retry control stays offered');
var PREREQ = fnSrc(FCS, '_fcPrereqRetryable_');
ok(/_FC_NONRETRYABLE_PREREQ_\[code\]/.test(PREREQ),
  'G2  §8 — the prerequisite loader classifies by typed CODE, never by message text');
ok(/return true;   \/\/ an unclassified failure/.test(PREREQ),
  'G2a and an unclassified failure is worth one operator-driven retry, not a dead end');
var NONRETRY = varSrc(FCS, '_FC_NONRETRYABLE_PREREQ_');
ok(/DEPLOYMENT_CONTRACT_MISMATCH/.test(NONRETRY) && !/REQUEST_TIMEOUT/.test(NONRETRY),
  'G2b a contract fault is permanent; a timeout is not');
var LOADER = fnSrc(FCS, '_fcLoadPrerequisites_');
ok(/_fcPrereqState_ = _fcPrereqRetryable_\(err\) \? FC_PREREQ_\.REFUSED : FC_PREREQ_\.FAILED_PERMANENT;/.test(LOADER),
  'G3  §8 — the two failures are distinct states, so a Builder one click from working says so');
ok(/_fcPrereqLastError_ = null;/.test(LOADER),
  'G4  §10.30 — success CLEARS the previous failure');
eq((LOADER.match(/_fcPrereqLastError_ = null;/g) || []).length, 2,
  'G4a on both success paths — the fetch that succeeded and the one that found everything warm');
ok(/_fcPrereqFlightByPath_\[p\] = null;/.test(LOADER),
  'G5  §10.28 — the latch is released on failure, so Retry issues exactly ONE new request');

// §10.31 — is the warm workspace slice reusable for the Builder's prerequisites?
(function () {
  var MODEL_KEYS = varSrc(FCS, '_FC_MODEL_KEYS_');
  ok(MODEL_KEYS.indexOf('marketplaceSkus') === -1,
    'G6  §10.31 — marketplace_skus is NOT in the fcSummary workspace, so the Builder read is REQUIRED');
  var PRE = varSrc(FCS, '_FC_PREREQ_TABLES_');
  ok(/marketplace_skus/.test(PRE), 'G6a and the prerequisite list still asks for it');
  // A3-R10 §14.4 — THIS ITEM IS CLOSED, and the assertion is inverted rather than removed: the
  // duplicate it recorded is now the thing forbidden. `marketplaces` is emitted by the bootstrap
  // slice and adapted through the same normalizer and filter as the broad cache, so a second
  // physical getTable for it read rows already in memory — and in production that read is the one
  // that failed, presenting as a dead Builder on the first Next.
  ok(MODEL_KEYS.indexOf('marketplaces') !== -1, 'G7  marketplaces IS in the workspace model');
  ok(!/'marketplaces'/.test(PRE),
    'G7a so it is NOT a builder prerequisite — zero physical getTable reads for it');
  // ONE remaining direct call, inside _fcGetMarketplaces itself, which is the Legacy fallback.
  eq((FCS.match(/window\.KM\.DB\.getMarketplaces\(\)/g) || []).length, 1,
    'G7b because every builder call site now asks the page accessor instead');
  ok(/function _fcGetMarketplaces\(\) \{\n  if \(_fcHas_\('marketplaces'\)\)/.test(FCS),
    'G7c and that accessor is read-model-first, so no second cache authority was created');
})();

// =========================================================================================================
section('H. REGRESSION — WHAT LIVE SMOKE ALREADY PASSED (§10.33-10.40)');
// =========================================================================================================
ok(/headerIdentical/.test(read('assets/specs/active/apps-script/20_campaign_write_handlers.gs')),
  'H1  §10.34 — the campaign REUSE contract is untouched');
ok(/reused: true/.test(read('assets/specs/active/apps-script/20_campaign_write_handlers.gs')),
  'H1a and an identical header still writes nothing');
ok(/STALE_SPECIAL_EVENT_VERSION/.test(UP) && /expectedVersion !== prior\.fingerprint/.test(UP),
  'H2  §10.35 — the stale-version gate is untouched');
ok(/unchanged: true/.test(UP), 'H3  §10.36 — an unchanged existing event still writes nothing');
ok(/function _evtBaseEventForSku/.test(FCS) && /baseEventFc: qty/.test(FCS),
  'H4  §10.37/10.38 — Base Event FC still reads the persisted value, zero included');
ok(/REPLAY_SAFE_ON_LOST_DELIVERY_/.test(API) && /attempt >= 2/.test(API),
  'H5  §10.39/10.40 — the A3-R2 write transport and its one-shot write recovery are unchanged');
ok(/maxRetries = \(kind === 'write'\) \? 0/.test(read('assets/js/api/km-transport.js')),
  'H5a a write is still never auto-retried by the shared transport');

// =========================================================================================================
section('M. MUTANTS');
// =========================================================================================================
var DUP = fnSrc(FCS, '_evtDuplicateConflicts_');
var KEY = fnSrc(FCS, '_evtUniquenessKey_');

mutant('M1  the window put back into the uniqueness comparison', (function () {
  // Exactly the A3-R8 rule this round removes: a stored event at a DIFFERENT window stops counting,
  // so the operator gets their second event back by typing new dates.
  var f = faulted(DUP, '    if (!Object.prototype.hasOwnProperty.call(want, k)) return;',
    "    if (!Object.prototype.hasOwnProperty.call(want, k)) return;\n    if (_trStrTok_(raw.event_start_date) !== '2099-01-01') return;", 'M1');
  var W = keyWorld({ dupSrc: f });
  return W._evtDuplicateConflicts_(['CO1100-R'], CTX).length === 0;
})() === true);

mutant('M2  the preflight reporting an unread model as clean', (function () {
  var f = faulted(DUP, '  if (!Array.isArray(rows)) return null;', '  if (!Array.isArray(rows)) return [];', 'M2');
  var W = keyWorld({ events: null, dupSrc: f });
  return JSON.stringify(W._evtDuplicateConflicts_(['CO1100-R'], CTX)) === '[]';
})() === true);

mutant('M3  the preflight stopping at the first conflict', (function () {
  var f = faulted(DUP, '    hits.push({ sku: want[k],', '    if (hits.length) return;\n    hits.push({ sku: want[k],', 'M3');
  var W = keyWorld({ dupSrc: f });
  return W._evtDuplicateConflicts_(['CO1100-R', 'CO1150-B'], CTX).length < 2;
})() === true);

mutant('M4  the server gate moved AFTER the create branch', (function () {
  var f = faulted(UP, '  var seConflict = fcSeUniquenessConflict_(s, body, targetRow);', '', 'M4');
  return f.indexOf('var seConflict') === -1;
})() === true);

mutant('M5  the server gate conflicting with its own row', (function () {
  var f = faulted(CONF, '    if (selfRow > 0 && rowNo === selfRow) continue;', '', 'M5');
  var sb = { console: console, String: String, Object: Object, Array: Array };
  vm.createContext(sb);
  vm.runInContext([fnSrc(GS14, 'fcEvtUp_'), varSrc(GS14, 'FC_SE_UNIQUENESS_FIELDS_'),
    fnSrc(GS14, 'fcSeUniquenessKey_'), f].join('\n'), sb);
  var cols = ['event_fc_id', 'company', 'country', 'marketplace', 'sku', 'event_name', 'year',
    'event_start_date', 'event_end_date', 'campaign_id'];
  var s = { rows: [cols, ['EFC-1100', 'ResUS', 'US', 'Amazon', 'CO1100-R', 'BFCM', '2026', 'a', 'b', 'c']],
    col: function (n) { return cols.indexOf(n); } };
  // Updating its own row must be allowed; the faulted gate refuses it, which breaks every edit.
  return sb.fcSeUniquenessConflict_(s, { company: 'ResUS', country: 'US', marketplace: 'Amazon',
    sku: 'CO1100-R', event_name: 'BFCM', year: '2026' }, 2) !== null;
})() === true);

mutant('M6  the server keying uniqueness on the window too', (function () {
  var f = faulted(varSrc(GS14, 'FC_SE_UNIQUENESS_FIELDS_'),
    "'event_name', 'year']", "'event_name', 'year', 'event_start_date']", 'M6');
  return /event_start_date/.test(f);
})() === true);

mutant('M7  the existing-event cap falling back to 8', (function () {
  var f = faulted(fnSrc(FCS, '_evtRowCap_'),
    'return _evtEditingActive_() ? Infinity : EVT_MAX_ROWS;', 'return EVT_MAX_ROWS;', 'M7');
  var sb = { console: console, Infinity: Infinity };
  vm.createContext(sb);
  vm.runInContext(['var _evtEditing_ = { campaignId: "CMP-BFCM26" };', fnSrc(FCS, '_evtEditingActive_'),
    varSrc(FCS, 'EVT_MAX_ROWS'), f].join('\n'), sb);
  return sb._evtRowCap_() === 8;
})() === true);

mutant('M8  the period fields disabled again while editing', (function () {
  var f = faulted(CHROME, "  ['event-start-date', 'event-end-date'].forEach(function (id) {\n    var el = document.getElementById(id); if (el) { el.disabled = false; }\n  });", '', 'M8');
  return !/'event-start-date', 'event-end-date'\]\.forEach/.test(f);
})() === true);

mutant('M9  a confirmed move quoting the loaded campaign_id', (function () {
  var f = faulted(SAVE2, '  if (_evtEditingActive_() && !_winEdit) {', '  if (_evtEditingActive_()) {', 'M9');
  return !/&& !_winEdit/.test(f);
})() === true);

mutant('M10 the read recovery retrying a timeout too', (function () {
  var f = faulted(GT, "    if (code !== 'REDIRECT_TARGET_NOT_FOUND') throw e;", '', 'M10');
  return !/code !== 'REDIRECT_TARGET_NOT_FOUND'/.test(f);
})() === true);

mutant('M11 the read recovery becoming a loop', (function () {
  var f = faulted(GT, '        return await _kmGetTableOnce_(tableName);',
    '        for (;;) { try { return await _kmGetTableOnce_(tableName); } catch (e3) {} }', 'M11');
  return /for \(;;\)/.test(f);
})() === true);

mutant('M12 a transient prerequisite failure classified as permanent', (function () {
  var f = faulted(fnSrc(FCS, '_fcPrereqRetryable_'), '  return true;   // an unclassified failure',
    '  return false;   // an unclassified failure', 'M12');
  var sb = { console: console };
  vm.createContext(sb);
  vm.runInContext([varSrc(FCS, '_FC_NONRETRYABLE_PREREQ_'), 'var String = globalThis.String;', f].join('\n'), sb);
  return sb._fcPrereqRetryable_({ code: 'READ_FAILED' }) === false;
})() === true);

mutant('M13 the new refusal left out of the canonical code registry', (function () {
  var f = faulted(API, "'STALE_SPECIAL_EVENT_VERSION', 'SPECIAL_EVENT_NOT_FOUND', 'DUPLICATE_SPECIAL_EVENT_IDENTITY',",
    "'STALE_SPECIAL_EVENT_VERSION', 'SPECIAL_EVENT_NOT_FOUND',", 'M13');
  var CODES = (/var KM_CANONICAL_CODES = \[[\s\S]*?\];/.exec(f) || [])[0] || '';
  return CODES.indexOf('DUPLICATE_SPECIAL_EVENT_IDENTITY') === -1;
})() === true);

// =========================================================================================================
section('V. VACUITY — the unfaulted tree behaves as the mutants assume');
// =========================================================================================================
(function () {
  var W = keyWorld();
  ok(W._evtDuplicateConflicts_(['CO1100-R'], CTX).length === 1,
    'V1  the real preflight really does catch one conflict, so M1 can fail');
  ok(W._evtDuplicateConflicts_(['CO1100-R', 'CO1150-B'], CTX).length === 2,
    'V2  and really does report both, so M3 can fail');
  ok(keyWorld({ events: null })._evtDuplicateConflicts_(['CO1100-R'], CTX) === null,
    'V3  and really does return null when unread, so M2 can fail');
  ok(capWorld({ campaignId: 'X' })._evtRowCap_() === Infinity,
    'V4  the real cap really is uncapped while editing, so M7 can fail');
  ok(/code !== 'REDIRECT_TARGET_NOT_FOUND'/.test(GT),
    'V5  the real recovery really does test the code, so M10 can fail');
  var sb = { console: console };
  vm.createContext(sb);
  vm.runInContext([varSrc(FCS, '_FC_NONRETRYABLE_PREREQ_'), 'var String = globalThis.String;',
    fnSrc(FCS, '_fcPrereqRetryable_')].join('\n'), sb);
  ok(sb._fcPrereqRetryable_({ code: 'READ_FAILED' }) === true,
    'V6  an unclassified failure really is retryable, so M12 can fail');
})();

async function main() {
  section('F(b). THE RECOVERY, EXERCISED');
  var W = tableWorld(['REDIRECT_TARGET_NOT_FOUND', 'ok']);
  var rows = await W.getOperationDbTableFromSheet('campaign_sku_lines');
  eq(W.__calls, ['campaign_sku_lines', 'campaign_sku_lines'],
    'F7  §10.23/10.24 — an expired hop is followed by exactly one fresh attempt');
  eq(rows, [{ row: 1 }], 'F7a and the Builder gets its data, with no reload and no navigation');

  var F = tableWorld(['REDIRECT_TARGET_NOT_FOUND', 'REDIRECT_TARGET_NOT_FOUND']);
  var err = null;
  try { await F.getOperationDbTableFromSheet('campaign_sku_lines'); } catch (e) { err = e; }
  ok(!!err && err.kmTransport.code === 'REDIRECT_TARGET_NOT_FOUND',
    'F8  §10.25 — when the fresh attempt fails too, the TYPED failure is preserved');
  eq(F.__calls.length, 2, 'F8a and there is no third attempt');

  var T = tableWorld(['REQUEST_TIMEOUT']);
  var terr = null;
  try { await T.getOperationDbTableFromSheet('marketplace_skus'); } catch (e) { terr = e; }
  ok(!!terr && terr.kmTransport.code === 'REQUEST_TIMEOUT',
    'F9  §10.27 — a timeout is NOT auto-retried; it stays the operator\'s explicit Retry');
  eq(T.__calls.length, 1, 'F9a exactly one request, and the bound is not doubled behind their back');

  var S = tableWorld(['ok']);
  await S.getOperationDbTableFromSheet('marketplaces');
  eq(S.__calls.length, 1, 'F10 and a healthy read is still one request — the wrapper costs nothing');
}

main().then(function () {
  console.log('\n' + new Array(101).join('='));
  console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail
    + ' failed, ' + mutants.length + ' mutants, ' + survived.length + ' survived');
  console.log(new Array(101).join('='));
  process.exit((fail === 0 && survived.length === 0) ? 0 : 1);
}, function (e) { console.error(e && e.stack || e); process.exit(1); });
