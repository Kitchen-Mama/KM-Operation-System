// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R7
// THE GROUP BUILDER NEVER ASKED WHETHER THE EVENT ALREADY EXISTED
//
// THREE LIVE FAILURES ON THE PUBLISHED 2836d2a / R17 BUILD.
//
//   A  Updating an already persisted Special Event failed at stage 3 with
//      STALE_SPECIAL_EVENT_VERSION. `_evtBuildGroups` composed each card row out of sku_details and
//      pricing_list and nothing else — no event_fc_id, no campaign_sku_line_id, no row_version — so
//      the save sent a VERSIONLESS payload for a row the server could still resolve by business key.
//      14_'s gate then did exactly what it says: a save that would change a stored event while
//      quoting no version is refused, "because the builder composes a versionless save only when its
//      read model held no match". On the single-row path that premise is true. On the group path it
//      never was, so every group-card edit looked like a stale writer to a server that was right.
//
//   C  The same omission is why no persisted Event FC was ever shown: nothing in the group builder
//      had looked fc_special_events up at all.
//
//   B  Stage 2 could fail with an HTML 404 — the Apps Script /exec 302 target is single-use and
//      expires. The shared transport already tells that apart from a business 404
//      (REDIRECT_TARGET_NOT_FOUND) and never stores the redirect URL, so a fresh attempt necessarily
//      restarts from the stable /exec. What was missing is that a WRITE may never replay.
//
// PLUS a product-safety requirement: the window IS the event's identity, and the campaign header
// carrying it is shared by every SKU in that window, so changing the dates on a loaded event may not
// silently repoint it.
//
// Run: node assets/tests/fc-base-event-fc-and-window-guard-r2b-a3-r7.test.js
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
var GS20 = read('assets/specs/active/apps-script/20_campaign_write_handlers.gs');
var HTML = read('assets/html/pages/fc-summary.html');
var CSS = read('assets/css/pages/fc-overview.css');

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

// =========================================================================================================
// THE BUILDER WORLD — real page functions over a controlled persisted model.
// =========================================================================================================
// Two SKUs on one BFCM window, one of them with a persisted ZERO, plus the SAME SKU on a DIFFERENT
// window so §5's "different windows stay distinct" has something real to distinguish.
var EV_BFCM_CO1100 = { event_fc_id: 'EFC-1100', campaign_id: 'CMP-BFCM26', campaign_sku_line_id: 'CSL-1100',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MKT-1', scope_type: 'sku',
  scope_id: 'CO1100-R', sku: 'CO1100-R', series: 'CO1100', category: 'Cookware', event_name: 'BFCM',
  event_period: '2026-11-19~2026-11-30', event_start_date: '2026-11-19', event_end_date: '2026-11-30',
  event_month: '11', year: '2026', fc_qty: 4200, note: '' };
var EV_BFCM_CO1150 = { event_fc_id: 'EFC-1150', campaign_id: 'CMP-BFCM26', campaign_sku_line_id: 'CSL-1150',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MKT-1', scope_type: 'sku',
  scope_id: 'CO1150-B', sku: 'CO1150-B', series: 'CO1150', category: 'Cookware', event_name: 'BFCM',
  event_period: '2026-11-19~2026-11-30', event_start_date: '2026-11-19', event_end_date: '2026-11-30',
  event_month: '11', year: '2026', fc_qty: 0, note: '' };
var EV_PRIME_CO1100 = { event_fc_id: 'EFC-1100P', campaign_id: 'CMP-PRIME26', campaign_sku_line_id: 'CSL-1100P',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MKT-1', scope_type: 'sku',
  scope_id: 'CO1100-R', sku: 'CO1100-R', series: 'CO1100', category: 'Cookware', event_name: 'Prime Day',
  event_period: '2026-07-15~2026-07-16', event_start_date: '2026-07-15', event_end_date: '2026-07-16',
  event_month: '7', year: '2026', fc_qty: 999, note: '' };

function builderWorld(opts) {
  opts = opts || {};
  var events = (opts.events === undefined) ? [EV_BFCM_CO1100, EV_BFCM_CO1150, EV_PRIME_CO1100] : opts.events;
  var dom = {
    'event-start-date': { value: opts.start === undefined ? '2026-11-19' : opts.start },
    'event-end-date': { value: opts.end === undefined ? '2026-11-30' : opts.end },
    'event-name-input': { value: opts.eventName === undefined ? 'BFCM' : opts.eventName },
    'event-target-year': { value: opts.year === undefined ? '2026' : opts.year }
  };
  var sb = {
    console: console, String: String, Number: Number, Object: Object, Array: Array, JSON: JSON,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, Math: Math,
    document: { getElementById: function (id) { return dom[id] || null; } },
    __dom: dom
  };
  vm.createContext(sb);
  vm.runInContext([
    varSrc(FCS, '_SE_FP_FIELDS_'), varSrc(FCS, '_SE_FP_NUMERIC_'),
    fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'), fnSrc(FCS, '_seFingerprint_'),
    'function _fcResolveMarketplaceKey(v) { return String(v == null ? "" : v).trim(); }',
    'function _evtSelectedSite() { return ' + JSON.stringify(
      opts.site || { company: 'ResUS', country: 'US', marketplace: 'Amazon' }) + '; }',
    'var __events = ' + JSON.stringify((events || []).map(function (r) {
      return { raw: r, campaignId: r.campaign_id, sku: r.sku, company: r.company, country: r.country,
        marketplace: r.marketplace, eventStartDate: r.event_start_date, eventEndDate: r.event_end_date,
        event: r.event_name, year: r.year, eventFcId: r.event_fc_id,
        campaignSkuLineId: r.campaign_sku_line_id, fcQty: parseFloat(r.fc_qty) || 0 };
    })) + ';',
    'function _evtBuilderEventRows_() { return ' + (events === null ? 'null' : '__events') + '; }',
    'var _evtEditing_ = ' + JSON.stringify(opts.editing || null) + ';',
    fnSrc(FCS, '_evtEditingActive_'),
    fnSrc(FCS, '_evtExistingEvents_'),
    opts.groupSrc || fnSrc(FCS, '_evtBaseEventGroup_'),
    opts.forSkuSrc || fnSrc(FCS, '_evtBaseEventForSku')
  ].join('\n'), sb);
  return sb;
}

// =========================================================================================================
section('A. THE PERSISTED EVENT IS RESOLVED, WITH ITS IDS AND ITS VERSION');
// =========================================================================================================
(function () {
  // §14.1 / §14.7 — the CO1100 event arrives complete.
  var W = builderWorld();
  var be = W._evtBaseEventForSku('CO1100-R');
  ok(!!be, 'A1  the group builder now resolves the persisted event for a SKU');
  eq(be.eventFcId, 'EFC-1100', 'A1a carrying its canonical event_fc_id');
  eq(be.campaignSkuLineId, 'CSL-1100', 'A1b and its campaign_sku_line_id');
  ok(!!be.rowVersion, 'A1c and a row_version token');
  eq(be.baseEventFc, 4200, 'A1d and the persisted fc_qty as Base Event FC');
})();

(function () {
  // The version is the SAME fingerprint the single-row path and the server both compute.
  var W = builderWorld();
  var mine = W._evtBaseEventForSku('CO1100-R').rowVersion;
  var direct = W._seFingerprint_(EV_BFCM_CO1100);
  eq(mine, direct, 'A2  the version is _seFingerprint_ of the persisted row — one authority, not a copy');
  var FPF = varSrc(FCS, '_SE_FP_FIELDS_');
  ok(FPF.indexOf('event_start_date') === -1 && FPF.indexOf('event_end_date') === -1,
    'A2a and the window columns are still OUT of the token, as A3-R1 settled');
})();

// §14.3 / §14.6 — the three fields reach the payload, which is the whole of the stale-version fix.
var SAVE = fnSrc(FCS, 'saveEventUpdate');
ok(/eventFcId: gr\.eventFcId \|\| '', campaignSkuLineId: gr\.campaignSkuLineId \|\| '',/.test(SAVE),
  'A3  the GROUP-card save now carries the ids it resolved');
ok(/rowVersion: gr\.rowVersion \|\| ''/.test(SAVE), 'A3a and the row_version');
ok(/var rid = _evtSingleRowIdentity_\(r\);/.test(SAVE)
  && /eventFcId: rid\.eventFcId, campaignSkuLineId: rid\.campaignSkuLineId, rowVersion: rid\.rowVersion/.test(SAVE),
  'A3b the single-row path carries one too — A3-R8 §3 re-resolves it against the stated window');
ok(/if \(l\.eventFcId\) evPayload\.event_fc_id = l\.eventFcId;/.test(SAVE)
  && /if \(l\.rowVersion\) evPayload\.expected_row_version = l\.rowVersion;/.test(SAVE),
  'A4  and both reach the stage-3 payload through the one existing line');
var BUILD = fnSrc(FCS, '_evtBuildGroups');
ok(/var be = _evtBaseEventForSku\(r\.sku\);/.test(BUILD), 'A5  Build resolves it per row');
ok(/eventFcId: be \? be\.eventFcId : ''/.test(BUILD) && /rowVersion: be \? be\.rowVersion : ''/.test(BUILD),
  'A5a and the row carries it');
ok(!/eventFcId: p \? p\.eventFcId/.test(BUILD) && !/rowVersion: p \? p\.rowVersion/.test(BUILD),
  'A5b §11 — server truth is RE-RESOLVED on every rebuild, never inherited from the previous row');

// §14.4 — the server gate that made this visible is untouched.
ok(/if \(!expectedVersion\) \{/.test(GS14) && /STALE_SPECIAL_EVENT_VERSION/.test(GS14),
  'A6  a versionless mutation is still refused by the server');
ok(/if \(expectedVersion !== prior\.fingerprint\) \{/.test(GS14),
  'A7  and so is a genuinely stale one — a concurrent editor is still protected');
// §14.2 / §14.5
ok(/fcSeFingerprint_\(incoming\) === prior\.fingerprint/.test(GS14),
  'A8  unchanged still writes nothing, not even updated_at');
ok(/row_version: after \? after\.row_version : ''/.test(GS14),
  'A9  and a successful update returns the NEW authoritative version');

// =========================================================================================================
section('B. BASE EVENT FC IS ITS OWN QUANTITY');
// =========================================================================================================
(function () {
  // §14.8 / §14.9 — each SKU gets its own, on the same campaign.
  var W = builderWorld();
  eq(W._evtBaseEventForSku('CO1150-B').baseEventFc, 0,
    'B1  §14.11 a persisted ZERO is 0 — the same campaign, a different SKU, its own value');
  eq(W._evtBaseEventForSku('CO1150-B').eventFcId, 'EFC-1150', 'B1a with its own event id');
  ok(W._evtBaseEventForSku('CO1150-B').baseEventFc !== null, 'B1b and 0 is not null');
  eq(W._evtBaseEventForSku('CO1100-R').baseEventFc, 4200, 'B2  while CO1100 keeps its own 4200');
})();

(function () {
  // §14.10 — the SAME SKU in a DIFFERENT window is a different event.
  var bfcm = builderWorld();
  var prime = builderWorld({ start: '2026-07-15', end: '2026-07-16', eventName: 'Prime Day' });
  eq(bfcm._evtBaseEventForSku('CO1100-R').baseEventFc, 4200, 'B3  the BFCM window resolves 4200');
  eq(prime._evtBaseEventForSku('CO1100-R').baseEventFc, 999, 'B3a the Prime Day window resolves 999');
  ok(bfcm._evtBaseEventForSku('CO1100-R').eventFcId !== prime._evtBaseEventForSku('CO1100-R').eventFcId,
    'B3b and they are different rows, not one row read twice');
  eq(prime._evtBaseEventForSku('CO1150-B'), null,
    'B3c CO1150 has no Prime Day event, so it resolves nothing there');
})();

(function () {
  // §14.12 — missing stays missing, and unread is not empty.
  eq(builderWorld()._evtBaseEventForSku('CO9999-X'), null, 'B4  a SKU with no persisted event is null');
  eq(builderWorld({ events: [] })._evtBaseEventForSku('CO1100-R'), null, 'B4a an empty model is null');
  eq(builderWorld({ events: null })._evtBaseEventForSku('CO1100-R'), null,
    'B4b and an UNREAD model is null, not a fabricated 0');
  eq(builderWorld({ start: '', end: '' })._evtBaseEventForSku('CO1100-R'), null,
    'B5  with no window typed there is no event to be current for');
  eq(builderWorld({ start: '2026-11-19', end: '2026-11-25' })._evtBaseEventForSku('CO1100-R'), null,
    'B5a and a window that matches nothing resolves nothing — never the nearest row');
})();

(function () {
  // §5 — the match is by scope + window, never by campaign name.
  var other = builderWorld({ site: { company: 'KM', country: 'US', marketplace: 'Amazon' } });
  eq(other._evtBaseEventForSku('CO1100-R'), null, 'B6  another company does not read ResUS\'s event');
  var otherYear = builderWorld({ year: '2027' });
  eq(otherYear._evtBaseEventForSku('CO1100-R'), null, 'B6a nor does another target year');
  var GRP = fnSrc(FCS, '_evtBaseEventGroup_');
  ok(!/campaign_name|campaignName/.test(GRP), 'B7  and the group is not matched by campaign name');
  ok(/_evtExistingEvents_\(\)/.test(GRP),
    'B7a it reuses the picker\'s own resolver — one owner for "which persisted events are these"');
})();

(function () {
  // an EDITING session is pinned to the campaign it loaded, not re-matched by the form's dates
  var W = builderWorld({ editing: { campaignId: 'CMP-PRIME26', startDate: '2026-07-15', endDate: '2026-07-16' } });
  eq(W._evtBaseEventForSku('CO1100-R').baseEventFc, 999,
    'B8  while editing, the loaded campaign decides — not whatever the date boxes now say');
})();

// §4 — the UI keeps the two apart.
var RENDER = fnSrc(FCS, '_evtRenderGroupCards');
ok(/>Base Event FC</.test(RENDER), 'B9  the card has its own Base Event FC column');
ok(/_evtBaselineLabel_\(\)/.test(RENDER), 'B9a beside the per-method computational baseline, still present');
ok(/r\.baseEventFc == null \? '—' : r\.baseEventFc\.toLocaleString\(\)/.test(RENDER),
  'B9b rendering a stored 0 as 0 and an absent event as an em dash');
ok(/grid-template-columns: minmax\(90px,1\.6fr\) 0\.8fr 0\.7fr 0\.9fr 0\.9fr 0\.9fr 1fr 0\.8fr 12px/.test(CSS),
  'B10 and the grid carries nine columns, so the new one is not laid over the old');
var FORSKU = fnSrc(FCS, '_evtBaseEventForSku');
ok(!/fc_regular_forecast|_evtBaseFcForSku|_evtEventBaseFcForSku/.test(FORSKU),
  'B11 Base Event FC is never computed from the Regular forecast');

// =========================================================================================================
section('C. THE WINDOW IS THE IDENTITY');
// =========================================================================================================
function gateWorld(opts) {
  opts = opts || {};
  var dom = {
    'event-start-date': { value: opts.start || '' },
    'event-end-date': { value: opts.end || '' },
    'event-window-confirm': { checked: !!opts.confirmed }
  };
  var shown = [];
  var sb = {
    console: console, String: String, Object: Object, Array: Array,
    document: { getElementById: function (id) { return dom[id] || null; } },
    alert: function (t) { shown.push(t); },
    __shown: function () { return shown; }
  };
  vm.createContext(sb);
  vm.runInContext([
    fnSrc(FCS, '_trStrTok_'),
    'var _evtEditing_ = ' + JSON.stringify(opts.editing || null) + ';',
    'var _evtGroups = [];',
    'function _evtSetEditingChrome_() {}',
    'function _evtBuildGroups() {}',
    fnSrc(FCS, '_evtEditingActive_'),
    fnSrc(FCS, '_evtWindowConfirmEl_'), fnSrc(FCS, '_evtWindowConfirmChecked_'),
    // A3-R10 §10.2 — _evtSetEditingChrome_ and _evtClearEditing_ now delegate the period controls
    // to one owner, so that owner and the two helpers it reads travel with them.
    fnSrc(FCS, '_evtFmtDay_'), fnSrc(FCS, '_evtSavedWindowText_'), fnSrc(FCS, '_evtSyncPeriodUi_'),
    fnSrc(FCS, '_evtWindowChanged_'), fnSrc(FCS, '_evtWindowEditActive_'),
    fnSrc(FCS, '_evtWindowKey_'),
    opts.gateSrc || fnSrc(FCS, '_evtWindowChangeGate_'),
    fnSrc(FCS, '_evtClearWindowChangeNotice_'),
    fnSrc(FCS, '_evtShowWindowChangeNotice_'),
    fnSrc(FCS, '_evtRestoreLoadedWindow_'),
    fnSrc(FCS, '_evtRestoreLoadedWindow_')
  ].join('\n'), sb);
  return sb;
}
var LOADED = { campaignId: 'CMP-BFCM26', startDate: '2026-11-19', endDate: '2026-11-30' };

(function () {
  // §14.13 — unchanged dates are an ordinary edit.
  var W = gateWorld({ editing: LOADED, start: '2026-11-19', end: '2026-11-30' });
  eq(W._evtWindowChangeGate_('2026-11-19', '2026-11-30').blocked, false,
    'C1  an unchanged window does not block the save');
  // and a NEW event (nothing loaded) is never gated
  var N = gateWorld({ editing: null, start: '2026-11-19', end: '2026-11-30' });
  eq(N._evtWindowChangeGate_('2026-12-01', '2026-12-05').blocked, false,
    'C1a composing a NEW event is never gated — there is no identity to change');
})();

(function () {
  // §14.14 / §14.15 / §14.16 — a changed window blocks, types itself, and states both windows.
  var W = gateWorld({ editing: LOADED, start: '2026-11-20', end: '2026-11-30' });
  var g = W._evtWindowChangeGate_('2026-11-20', '2026-11-30');
  eq(g.blocked, true, 'C2  a changed window BLOCKS the first save');
  eq(g.code, 'EVENT_WINDOW_CHANGE_REQUIRES_CONFIRMATION', 'C2a with the typed code');
  eq([g.oldStart, g.oldEnd, g.newStart, g.newEnd], ['2026-11-19', '2026-11-30', '2026-11-20', '2026-11-30'],
    'C2b carrying BOTH windows');
  eq(W._evtWindowChangeGate_('2026-11-19', '2026-11-29').blocked, true, 'C2c an end-date change blocks too');
})();

// §14.14 — and the gate runs before anything is written.
ok(/var _winGate = _evtWindowChangeGate_\(eventStartDate, eventEndDate\);/.test(SAVE),
  'C3  the save consults the gate');
ok(/if \(_winGate\.blocked\) \{ _evtShowWindowChangeNotice_\(_winGate\); return; \}/.test(SAVE),
  'C3a and returns on a block');
ok(SAVE.indexOf('_winGate.blocked') < SAVE.indexOf('DB.upsertCampaign('),
  'C4  BEFORE stage 1 — no campaign, no line and no event write can precede the confirmation');
ok(SAVE.indexOf('_winGate.blocked') < SAVE.indexOf('DB.upsertCampaignSkuLines('),
  'C4a and before stage 2');
ok(SAVE.indexOf('_winGate.blocked') < SAVE.indexOf('DB.upsertFcSpecialEvent('),
  'C4b and before stage 3');

(function () {
  // §14.17 / §14.18 — neither offered action mutates a shared header.
  var W = gateWorld({ editing: LOADED, start: '2026-11-20', end: '2026-11-30' });
  W._evtRestoreLoadedWindow_();
  eq([W.document.getElementById('event-start-date').value, W.document.getElementById('event-end-date').value],
    ['2026-11-19', '2026-11-30'], 'C5  Restore puts the SAVED window back');
  eq(W._evtWindowChangeGate_('2026-11-19', '2026-11-30').blocked, false, 'C5a and the save is ordinary again');

  // A3-R9: the second action is no longer 'detach and create a second event' — that event may not
  // exist — it is the confirmation that lets THIS event move. The loaded event is KEPT, which is the
  // whole difference: its ids travel with it.
  var D = gateWorld({ editing: LOADED, start: '2026-11-20', end: '2026-11-30', confirmed: true });
  eq(D._evtWindowChangeGate_('2026-11-20', '2026-11-30').blocked, false,
    'C6  a CONFIRMED period change proceeds');
  eq(vm.runInContext('_evtEditing_ && _evtEditing_.campaignId', D), 'CMP-BFCM26',
    'C6a and the loaded event is KEPT — the same event moves, a second one is never created');
  eq(D._evtWindowEditActive_('2026-11-20', '2026-11-30'), true,
    'C6b which is what tells stage 1 to resolve the header for the NEW window instead of repointing');
  eq(D._evtWindowEditActive_('2026-11-19', '2026-11-30'), false,
    'C6c while an unchanged window is an ordinary edit, confirmation or not');
})();

(function () {
  // the acknowledgement is for ONE change, not a standing permission
  var W = gateWorld({ editing: LOADED, start: '2026-11-20', end: '2026-11-30', confirmed: true });
  eq(W._evtWindowChangeGate_('2026-11-20', '2026-11-30').blocked, false,
    'C7  the confirmed change proceeds');
  W.document.getElementById('event-window-confirm').checked = false;
  eq(W._evtWindowChangeGate_('2026-11-20', '2026-11-30').blocked, true,
    'C7a and blocks again the moment the confirmation is withdrawn — it is not standing permission');
  var CLR = fnSrc(FCS, '_evtClearEditing_');
  ok(/_evtWindowConfirmEl_\(\); if \(_wcb\) _wcb\.checked = false;/.test(CLR),
    'C7b and loading or clearing an event drops it');
  var RST = fnSrc(FCS, '_evtRestoreLoadedWindow_');
  ok(/cb\.checked = false/.test(RST),
    'C7c as does restoring the saved period — no tick is left armed behind an abandoned change');
})();

// §14.19 — the move itself is NOT implemented, and the schema says why.
ok(/'campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'sku'/.test(GS20),
  'C8  campaign_sku_lines carries NO window of its own');
var LINE_HEADERS = varSrc(GS20, 'CAMPAIGN_SKU_LINES_HEADERS_');
ok(LINE_HEADERS.indexOf('start_date') === -1 && LINE_HEADERS.indexOf('end_date') === -1,
  'C8a so the window lives only on the SHARED campaign header and on the event row');
ok(varSrc(GS14, 'FC_SPECIAL_EVENTS_HEADERS_').indexOf('event_start_date') !== -1,
  'C8b the event row does carry its own window, which is why a per-SKU move LOOKS possible');
ok(/never silently repointed/.test(GS20),
  'C9  and the server already refuses to repoint a campaign\'s window — CAMPAIGN_IDENTITY_MISMATCH');
// A3-R9 — the decision C10 reported has been taken, and the answer is reassignment. What C10 was
// really guarding is unchanged and is asserted directly: the move must never quote the loaded
// campaign_id, because that header is the OLD window's and may be shared.
ok(/if \(_evtEditingActive_\(\) && !_winEdit\) \{/.test(SAVE),
  'C10 a confirmed period change does NOT quote the loaded campaign_id — the shared header is never repointed');
ok(/campaignPayload\.campaign_id = _evtEditing_\.campaignId;/.test(SAVE),
  'C10a while an ordinary edit still names it, so the reuse contract is untouched');
ok(/event-window-change-notice/.test(HTML), 'C11 the notice has a host in the markup');

// =========================================================================================================
section('D. THE EXPIRED DELIVERY HOP');
// =========================================================================================================
var CW = fnSrc(API, '_kmCanonicalWrite_');
// §14.20 / §14.23
ok(/REDIRECT_TARGET_NOT_FOUND/.test(CW), 'D1  the write dispatcher recognises the typed delivery fault');
var TRANSPORT_SRC = read('assets/js/api/km-transport.js');
ok(TRANSPORT_SRC.indexOf('ENDPOINT_CLASS.USERCONTENT_REDIRECT') !== -1
  && TRANSPORT_SRC.indexOf('It is single-use and expires, so it can never be used as configuration.') !== -1,
  'D2  and the transport still refuses to store a googleusercontent URL as an endpoint');
ok(/A googleusercontent target is never stored/.test(TRANSPORT_SRC),
  'D2a so a fresh attempt necessarily restarts from the stable /exec — the expired URL cannot be reused');
// §14.22
ok(/for \(var attempt = 1; attempt <= 2; attempt\+\+\)/.test(CW), 'D3  at most two attempts');
ok(/attempt >= 2\) break;/.test(CW), 'D3a and the limiter, not the loop bound, is what stops it');
// §14.24 — the gate is narrow in BOTH directions
ok(/var provenNeverRan = det\.zero_write === true/.test(CW),
  'D4  the proven-never-ran gate is unchanged and still requires zero_write');
ok(/lostDelivery = !!res && res\.code === 'REDIRECT_TARGET_NOT_FOUND'/.test(CW),
  'D5  the new gate is a SEPARATE condition — a dead hop is indeterminate, not a proven zero write');
ok(/REPLAY_SAFE_ON_LOST_DELIVERY_ = \['upsertCampaign', 'upsertCampaignSkuLines',/.test(CW),
  'D6  and it is allowed only for actions idempotent by a key the client already supplies');
(function () {
  var m = /REPLAY_SAFE_ON_LOST_DELIVERY_ = \[([\s\S]*?)\]/.exec(CW);
  var list = (m ? m[1] : '').split(',').map(function (s) { return s.trim().replace(/'/g, ''); }).filter(Boolean);
  eq(list.sort(), ['importFcSpecialEventsBatch', 'upsertCampaign', 'upsertCampaignSkuLines', 'upsertFcSpecialEvent'],
    'D6a exactly the three save stages and the batch form of stage 3');
  eq(list.indexOf('deleteFcSpecialEvent'), -1, 'D6b a DELETE is deliberately not replayed');
})();
ok(!/STALE|DUPLICATE|NOT_FOUND'|business/.test((/var REPLAY_SAFE_ON_LOST_DELIVERY_[\s\S]*?break;/.exec(CW) || [''])[0].replace('REDIRECT_TARGET_NOT_FOUND', '')),
  'D7  §14.24 no business refusal token appears in the retry gate');

// §14.25 / §14.26 — partial commit. The three stages are sequenced and idempotent by design.
ok(/_fcEbCommitted_\.push\('campaigns'\)/.test(SAVE) && /_fcEbStage_ = 'stage 2/.test(SAVE),
  'D8  §14.25 the save records what stage 1 committed before stage 2 runs');
ok(SAVE.indexOf("_fcEbCommitted_.push('campaign_sku_lines')") < SAVE.indexOf('DB.upsertFcSpecialEvent('),
  'D9  §14.10/§14.26 stage 3 never runs before stage 2 has returned');
ok(/if \(!campaignId\) throw new Error\('campaign_id was not returned by the campaigns writer\.'\)/.test(SAVE),
  'D10 and a stage-1 answer without an id stops the sequence rather than inventing one');
ok(/if \(headerIdentical\) \{/.test(GS20),
  'D11 §14.25 a re-run of stage 1 REUSES the campaign — a retry cannot duplicate the header');
ok(/if \(!lineId\) lineId = campaignLineFindByKey_\(sheet, campaignId, l\.marketplace_sku_id, sku\);/.test(GS20),
  'D12 and stage 2 resolves an existing line by its business key — a retry cannot duplicate a line');
ok(/if \(targetRow === -1\) targetRow = fcSpecialEventFindRowByKey_\(s, body\);/.test(GS14),
  'D13 as does stage 3 — which is what makes ONE replay of a lost delivery safe at all');

// =========================================================================================================
section('E. NON-REGRESSION');
// =========================================================================================================
ok(/function campaignResolveOrTerminal_\(/.test(GS20) && !/LockService/.test(fnSrc(GS20, 'campaignResolveOrTerminal_')),
  'E1  §14.27 the R17 lock repair is intact — classify still runs unlocked');
ok(/if \(headerIdentical\) \{/.test(GS20), 'E2  §14.28 campaign reuse preserved');
var TR = fnSrc(FCS, '_fcRenderTargetSave_');
ok(/b\.disabled = _fcTargetSave_\.busy \|\| !_fcTargetSave_\.valid;/.test(TR),
  'E3  §14.29 the Target Rule valid/busy split is preserved');
(function () {
  var sb = { console: console, Object: Object, Array: Array, String: String };
  vm.createContext(sb);
  vm.runInContext([
    varSrc(FCS, '_FC_PREREQ_TABLES_'), varSrc(FCS, '_FC_SLICE_PREREQ_TABLES_'),
    'var _fcSecondaryLoaded = true;', 'var _fcPrereqLoadedPaths_ = {};', 'var _fcPrereqLoadedTables_ = {};',
    fnSrc(FCS, '_fcSliceTables_'), fnSrc(FCS, '_fcPrereqMissing_'), fnSrc(FCS, '_fcResetSecondaryCache')
  ].join('\n'), sb);
  var all = {};
  Object.keys(sb._FC_PREREQ_TABLES_).forEach(function (p) {
    sb._FC_PREREQ_TABLES_[p].forEach(function (t) { all[t] = true; }); });
  vm.runInContext('_fcPrereqLoadedTables_ = ' + JSON.stringify(all) + ';', sb);
  eq(sb._fcPrereqMissing_('regular'), [], 'E4  §14.30 warm Regular still issues 0 requests');
  eq(sb._fcPrereqMissing_('event'), [], 'E5  §14.31 warm Special still issues 0 requests');
})();
ok(/kind: 'write'/.test(CW) && /requestId: _kmNextWriteRequestId_\(\)/.test(CW),
  'E6  §14.32 the canonical write transport is preserved');
ok(/bits\.push\('Table: ' \+ _tbl\)/.test(fnSrc(FCS, '_fcErrDetail_')),
  'E7  §14.33 the A3-R6 timeout line still names the table');
ok(/var KM_READ_TIMEOUT_MS_ = 45000;/.test(API) && /var KM_WRITE_TIMEOUT_MS_ = 90000;/.test(API),
  'E7a and no timeout was increased this round');

// =========================================================================================================
section('F. MUTANTS');
// =========================================================================================================
mutant('M1 the group save drops the row_version again (the A3-R7 defect)', (function () {
  var faulted = SAVE.replace("          rowVersion: gr.rowVersion || '' });", "          rowVersion: '' });");
  if (faulted === SAVE) throw new Error('M1 anchor drifted');
  return !/rowVersion: gr\.rowVersion/.test(faulted);
})());

mutant('M2 Build stops resolving the persisted event', (function () {
  var faulted = BUILD.replace('    var be = _evtBaseEventForSku(r.sku);', '    var be = null;');
  if (faulted === BUILD) throw new Error('M2 anchor drifted');
  var W = builderWorld();
  vm.runInContext('function _evtBaseEventForSku() { return null; }', W);
  return W._evtBaseEventForSku('CO1100-R') === null;
})());

mutant('M3 a persisted zero read as missing', (function () {
  var faulted = FORSKU.replace(
    "  var qty = (q === undefined || q === null || q === '') ? null : Number(q);",
    '  var qty = q ? Number(q) : null;');
  if (faulted === FORSKU) throw new Error('M3 anchor drifted');
  var W = builderWorld({ forSkuSrc: faulted });
  return W._evtBaseEventForSku('CO1150-B').baseEventFc !== 0;
})());

mutant('M4 the window is dropped from the base-event match', (function () {
  var GRP = fnSrc(FCS, '_evtBaseEventGroup_');
  var faulted = GRP.replace(
    "    if (_trStrTok_(g.startDate) !== sd || _trStrTok_(g.endDate) !== ed) return false;", '');
  if (faulted === GRP) throw new Error('M4 anchor drifted');
  var W = builderWorld({ start: '2026-11-19', end: '2026-11-30', eventName: '', groupSrc: faulted });
  var be = W._evtBaseEventForSku('CO1100-R');
  return !be || be.baseEventFc !== 4200;  // July's row now answers a November question
})());

mutant('M5 Base Event FC computed from the Regular forecast', (function () {
  var faulted = FORSKU.replace('    baseEventFc: qty', '    baseEventFc: _evtEventBaseFcForSku(sku)');
  if (faulted === FORSKU) throw new Error('M5 anchor drifted');
  return /_evtEventBaseFcForSku/.test(faulted) && !/baseEventFc: qty/.test(faulted);
})());

mutant('M6 server truth inherited from the previous card instead of re-resolved', (function () {
  var faulted = BUILD.replace("      rowVersion: be ? be.rowVersion : '',",
    "      rowVersion: p ? p.rowVersion : '',");
  if (faulted === BUILD) throw new Error('M6 anchor drifted');
  return /rowVersion: p \? p\.rowVersion/.test(faulted);
})());

mutant('M7 a changed window no longer blocks', (function () {
  var G = fnSrc(FCS, '_evtWindowChangeGate_');
  var faulted = G.replace("  if (!_evtWindowChanged_(startDate, endDate)) return { blocked: false, code: '' };",
    "  return { blocked: false, code: '' };");
  if (faulted === G) throw new Error('M7 anchor drifted');
  var W = gateWorld({ editing: LOADED, gateSrc: faulted });
  return W._evtWindowChangeGate_('2026-12-01', '2026-12-05').blocked === false;
})());

mutant('M8 the gate runs after stage 1', (function () {
  var faulted = SAVE.replace('  if (_winGate.blocked) { _evtShowWindowChangeNotice_(_winGate); return; }', '');
  if (faulted === SAVE) throw new Error('M8 anchor drifted');
  return faulted.indexOf('_winGate.blocked') === -1;
})());

mutant('M9 the confirmation becomes a standing permission', (function () {
  // The A3-R7 fault was an acknowledgement that outlived its one change. Its A3-R9 equivalent is a
  // gate that stops asking the control at all — then every changed period proceeds unconfirmed,
  // which is the same defect through the same hole.
  var G = fnSrc(FCS, '_evtWindowChangeGate_');
  var faulted = G.replace("  if (_evtWindowConfirmChecked_()) return { blocked: false, code: 'CONFIRMED' };",
    "  return { blocked: false, code: 'CONFIRMED' };");
  if (faulted === G) throw new Error('M9 anchor drifted');
  var W = gateWorld({ editing: LOADED, gateSrc: faulted, confirmed: false });
  return W._evtWindowChangeGate_('2026-12-01', '2026-12-05').blocked === false;
})());

mutant('M10 any write action replays on a lost delivery hop', (function () {
  var faulted = CW.replace(/var REPLAY_SAFE_ON_LOST_DELIVERY_ = \[[\s\S]*?\];/,
    'var REPLAY_SAFE_ON_LOST_DELIVERY_ = null;').replace(
    "            && REPLAY_SAFE_ON_LOST_DELIVERY_.indexOf(action) !== -1;", ';');
  if (faulted === CW) throw new Error('M10 anchor drifted');
  return !/REPLAY_SAFE_ON_LOST_DELIVERY_\.indexOf\(action\)/.test(faulted);
})());

mutant('M11 the lost-delivery retry folded into the proven-zero-write gate', (function () {
  var faulted = CW.replace("var provenNeverRan = det.zero_write === true && res && RETRY_ONLY_ON_.indexOf(res.code) !== -1;",
    "var provenNeverRan = res && (RETRY_ONLY_ON_.indexOf(res.code) !== -1 || res.code === 'REDIRECT_TARGET_NOT_FOUND');");
  if (faulted === CW) throw new Error('M11 anchor drifted');
  return !/var provenNeverRan = det\.zero_write === true/.test(faulted);
})());

mutant('M12 a business refusal added to the replay list', (function () {
  var faulted = CW.replace("var REPLAY_SAFE_ON_LOST_DELIVERY_ = ['upsertCampaign', 'upsertCampaignSkuLines',",
    "var REPLAY_SAFE_ON_LOST_DELIVERY_ = ['upsertFcTargetRule', 'deleteFcSpecialEvent', 'upsertCampaign', 'upsertCampaignSkuLines',");
  if (faulted === CW) throw new Error('M12 anchor drifted');
  var m = /REPLAY_SAFE_ON_LOST_DELIVERY_ = \[([\s\S]*?)\]/.exec(faulted);
  return /deleteFcSpecialEvent/.test(m ? m[1] : '');
})());

// =========================================================================================================
section('G. VACUITY — the unfaulted tree really does behave as the mutants assume');
// =========================================================================================================
(function () {
  var W = builderWorld();
  ok(W._evtBaseEventForSku('CO1100-R').baseEventFc === 4200
    && W._evtBaseEventForSku('CO1150-B').baseEventFc === 0,
    'G1  the real reader really does resolve a value and a zero, so M3/M5 can fail');
  var P = builderWorld({ start: '2026-07-15', end: '2026-07-16', eventName: 'Prime Day' });
  ok(P._evtBaseEventForSku('CO1100-R').baseEventFc === 999,
    'G2  and really does key on the window, so M4 can fail');
  var W2 = gateWorld({ editing: LOADED });
  ok(W2._evtWindowChangeGate_('2026-12-01', '2026-12-05').blocked === true,
    'G3  the real gate really does block, so M7/M9 can fail');
  ok(/REPLAY_SAFE_ON_LOST_DELIVERY_\.indexOf\(action\)/.test(CW),
    'G4  the real dispatcher really does consult the allowlist, so M10 can fail');
})();

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail
  + ' failed, ' + mutants.length + ' mutants, ' + survived.length + ' survived');
console.log(new Array(101).join('='));
process.exit((fail === 0 && survived.length === 0) ? 0 : 1);
