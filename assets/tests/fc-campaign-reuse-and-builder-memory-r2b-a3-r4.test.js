// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R4
// A CAMPAIGN THAT EXISTS IS NOT AN EVENT THAT EXISTS — AND A WARM BUILDER STAYS WARM
//
// FIVE DEFECTS THE OPERATOR FOUND ON THE PUBLISHED 118f63f BUILD. Four were real; one was not.
//
//   C  Adding CO1150 to the BFCM 2026 window the CO1100 family already used answered
//      "STALE_CAMPAIGN_VERSION ... refused at stage 1 — campaigns". One campaign header owns MANY
//      campaign_sku_lines and MANY fc_special_events, so this is the commonest legitimate operation
//      there is. A3-R1 put the version gate ahead of the unchanged comparison, so ANY versionless save
//      that resolved to an existing row was refused — including one that would have written nothing.
//   C′ That refusal reached the operator as "Reason: READ_FAILED", because the A3-R1 tokens were added
//      to _kmZeroWriteProven_ and never to KM_CANONICAL_CODES: a WRITE refusal wearing a READ label.
//   B  The Builder's Base FC column was always "—". `_evtBuildGroups()` only ever inherited a previous
//      row's value, so on a fresh Build it was null — while the same SKUs showed a Regular FC on the
//      table behind the modal. The canonical lookup existed and was simply never called.
//   E  "Loading…" on every Next. `_fcResetSecondaryCache()` cleared BOTH builder paths after EVERY FC
//      write, so saving a Target % Rule discarded the seven tables the Special Event builder held —
//      tables a fc_target_rules write cannot touch.
//   D  Target Rule Save disabled its button but never said "Saving…". Duplicate writes were already
//      impossible; the missing part was the only one a sighted operator can see.
//   A  The selector's "could not be loaded / Retry" is NOT a defect: the retry is scoped to the failed
//      slice and single-flight. It is the documented transport residual. Asserted here so that stays true.
//
// Run: node assets/tests/fc-campaign-reuse-and-builder-memory-r2b-a3-r4.test.js
// NOTE: no 'use strict' — extracted browser/Apps Script fns are eval'd into a sandbox (F1-7H convention).

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
var GS20 = read('assets/specs/active/apps-script/20_campaign_write_handlers.gs');
var GS14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
var GS63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var RO = require('./_release-order.js');   // the append-only release ledger, for order questions

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
// THE SERVER — a real fake sheet, and the real handler over it.
// =========================================================================================================
var CAMPAIGN_ROW = {
  campaign_id: 'CMP-BFCM26', company: 'ResUS', country: 'US', marketplace: 'Amazon',
  marketplace_id: 'MKT-RESUS-US-AMAZON', campaign_name: 'BFCM 2026', promotion_type: 'BFCM',
  event_flag: 'BFCM', major_event_flag: 'BFCM', year: 2026, duration: '', status: 'active',
  start_date: '2026-11-19', end_date: '2026-11-30', updated_at: '2026-09-20T00:00:00.000Z'
};
// The sheet is a 2-D grid with the header row at index 0, because that is what fcWriteReadSheet_ hands
// the handler — an object-shaped fake would let the real index builder pass for a reason the sheet
// does not have.
function serverWorld(rows, overrides) {
  var HEADERS = Object.keys(CAMPAIGN_ROW);
  var grid = [HEADERS.slice()];
  (rows || []).forEach(function (r) { grid.push(HEADERS.map(function (h) { return r[h] === undefined ? '' : r[h]; })); });
  function rowObjects() {
    return grid.slice(1).map(function (r) {
      var o = {}; HEADERS.forEach(function (h, i) { o[h] = r[i]; }); return o;
    });
  }
  var writes = [];
  var responses = [];
  var lockTries = [], lockReleases = [];
  var sheet = { __grid: grid };
  var sb = {
    console: console, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array,
    Math: Math, Date: Date, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, RegExp: RegExp,
    CAMPAIGNS_HEADERS_: HEADERS, FC_SCHEMA_BY_NAME_: {},
    LockService: { getScriptLock: function () {
      return { tryLock: function () { lockTries.push(Date.now()); return true; },
               releaseLock: function () { lockReleases.push(Date.now()); } };
    } },
    SpreadsheetApp: { getActiveSpreadsheet: function () {
      return { __ss: true, getSheetByName: function (n) { return n === 'campaigns' ? sheet : null; } };
    } },
    Utilities: { getUuid: function () { return 'NEWUUID0123456789'; } },
    jsonResponse_: function (o) { responses.push(o); return o; },
    fcWriteEnsureSheet_: function () { return sheet; },
    fcWriteEnsureColumns_: function () {},
    fcWriteReadSheet_: function () {
      return { headers: HEADERS, rows: grid, col: function (n) { return HEADERS.indexOf(n); } };
    },
    fcWriteUpsert_: function (ss, name, hdrs, keyCol, id, body) {
      writes.push({ id: id, body: body });
      var idCol = HEADERS.indexOf(keyCol);
      for (var i = 1; i < grid.length; i++) {
        if (String(grid[i][idCol]) === String(id)) {
          Object.keys(body).forEach(function (k) { var c = HEADERS.indexOf(k); if (c !== -1) grid[i][c] = body[k]; });
          return { id: id, created: false };
        }
      }
      var fresh = HEADERS.map(function (h) { return body[h] === undefined ? '' : body[h]; });
      fresh[idCol] = id; grid.push(fresh);
      return { id: id, created: true };
    },
    __writes: function () { return writes; },
    __lockTries: function () { return lockTries.length; },
    __lockReleases: function () { return lockReleases.length; },
    __rows: function () { return rowObjects(); },
    __last: function () { return responses[responses.length - 1]; }
  };
  vm.createContext(sb);
  var parts = [
    varSrc(GS20, 'CAMPAIGN_KEY_FIELDS_'), varSrc(GS20, 'CAMPAIGN_LOCK_MS_'),
    varSrc(GS20, 'CAMPAIGN_FINGERPRINT_FIELDS_'), varSrc(GS20, 'CAMPAIGN_FINGERPRINT_NUMERIC_'),
    fnSrc(GS20, 'campaignDateKey_'), fnSrc(GS20, 'campaignUpper_'), fnSrc(GS20, 'campaignNum_'),
    fnSrc(GS20, 'campaignKeyOf_'), fnSrc(GS20, 'campaignFingerprint_'), fnSrc(GS20, 'campaignIndexRows_'),
    fnSrc(GS20, 'campaignReceiptFor_'), fnSrc(GS20, 'campaignFindByKey_'),
    // A3-R6 — the classifier is now its own function, called by both passes, and the readiness probe
    // decides whether the unlocked pass may run at all.
    fnSrc(GS20, 'campaignSheetReady_'),
    (overrides && overrides.resolver) || fnSrc(GS20, 'campaignResolveOrTerminal_'),
    (overrides && overrides.handler) || fnSrc(GS20, 'handleUpsertCampaign_')
  ];
  vm.runInContext(parts.join('\n'), sb, { filename: 'gs20.js' });
  return sb;
}
function payloadFor(over) {
  return Object.assign({
    campaign_name: 'BFCM 2026', company: 'ResUS', marketplace_id: 'MKT-RESUS-US-AMAZON',
    country: 'US', marketplace: 'Amazon', promotion_type: 'BFCM', event_flag: 'BFCM',
    major_event_flag: 'BFCM', year: 2026, start_date: '2026-11-19', end_date: '2026-11-30',
    status: 'active', source: 'fc_summary_builder'
  }, over || {});
}

section('A. CAMPAIGN SERVER CONTRACT — resolve, or update under the version gate');

(function () {   // 1 — new campaign
  var S = serverWorld([]);
  var r = S.handleUpsertCampaign_(payloadFor({ start_date: '2027-11-24', end_date: '2027-11-30', year: 2027 }));
  ok(r.success === true, 'A1  a genuinely new window creates a campaign');
  eq(r.data.created, true, 'A1a created = true');
  eq(S.__writes().length, 1, 'A1b and exactly one write happened');
})();

(function () {   // 2/3 — THE OPERATOR'S CASE: existing header, identical fields, NO version
  var S = serverWorld([CAMPAIGN_ROW]);
  var before = JSON.stringify(S.__rows());
  var r = S.handleUpsertCampaign_(payloadFor());     // no expected_row_version at all
  ok(r.success === true, 'A2  an existing window + identical header + NO version SUCCEEDS (the operator\'s case)',
    r.success ? '' : r.error);
  eq(r.data.campaign_id, 'CMP-BFCM26', 'A2a and resolves the SAME campaign_id');
  eq([r.data.created, r.data.updated, r.data.unchanged, r.data.reused], [false, false, true, true],
    'A3  created=false updated=false unchanged=true reused=true');
  eq(S.__writes().length, 0, 'A3a DB writes = 0');
  eq(JSON.stringify(S.__rows()), before, 'A3b the stored row is byte-identical — updated_at did not advance');
  ok(!!r.data.row_version, 'A3c and the CURRENT server version is returned for stage 2 to use');
})();

(function () {   // 4 — real mutation, no version → refuse
  var S = serverWorld([CAMPAIGN_ROW]);
  var before = JSON.stringify(S.__rows());
  var r = S.handleUpsertCampaign_(payloadFor({ campaign_name: 'BFCM 2026 RENAMED' }));
  eq(r.success, false, 'A4  a REAL header mutation with no version still REFUSES');
  eq(r.error, 'STALE_CAMPAIGN_VERSION', 'A4a with the same typed token as before');
  eq(S.__writes().length, 0, 'A4b and writes nothing');
  eq(JSON.stringify(S.__rows()), before, 'A4c the row is untouched');
  ok(/would CHANGE its stored header/.test(r.detail), 'A4d and the detail says WHY it is a mutation', r.detail);
})();

(function () {   // 5 — real mutation, stale version → refuse
  var S = serverWorld([CAMPAIGN_ROW]);
  var r = S.handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED', expected_row_version: 'not-the-version' }));
  eq(r.success, false, 'A5  a real mutation with a STALE version still refuses');
  eq(r.error, 'STALE_CAMPAIGN_VERSION', 'A5a typed');
  eq(S.__writes().length, 0, 'A5b zero write');
})();

(function () {   // 6 — real mutation, fresh version → succeeds
  var S = serverWorld([CAMPAIGN_ROW]);
  var probe = S.handleUpsertCampaign_(payloadFor());          // resolve to learn the version
  var v = probe.data.row_version;
  var r = S.handleUpsertCampaign_(payloadFor({ campaign_name: 'BFCM 2026 RENAMED', expected_row_version: v }));
  ok(r.success === true, 'A6  a real mutation with a FRESH version succeeds', r.success ? '' : r.error);
  eq(S.__writes().length, 1, 'A6a and writes exactly once');
  eq(S.__rows()[0].campaign_name, 'BFCM 2026 RENAMED', 'A6b with the new value stored');
})();

(function () {   // 9 — a different window is a different campaign
  var S = serverWorld([CAMPAIGN_ROW]);
  var r = S.handleUpsertCampaign_(payloadFor({ start_date: '2026-12-10', end_date: '2026-12-14' }));
  ok(r.success === true, 'A7  a DIFFERENT window does not reuse the wrong campaign');
  eq(r.data.created, true, 'A7a it creates its own');
  ok(r.data.campaign_id !== 'CMP-BFCM26', 'A7b under a different campaign_id');
  eq(S.__rows().length, 2, 'A7c and both windows now exist');
})();

(function () {   // 6 — campaign_name is not identity
  var S = serverWorld([CAMPAIGN_ROW]);
  var r = S.handleUpsertCampaign_(payloadFor({ campaign_name: 'BFCM 2026', expected_row_version: '' }));
  eq(r.data.campaign_id, 'CMP-BFCM26', 'A8  the same window resolves by WINDOW, not by name');
  var S2 = serverWorld([CAMPAIGN_ROW]);
  var r2 = S2.handleUpsertCampaign_(payloadFor({ promotion_type: 'PRIME', event_flag: 'PRIME' }));
  eq(r2.data.created, true, 'A9  a different promotion type in the same window is a different campaign');
})();

section('B. EXISTING CAMPAIGN + NEW SKU, END TO END (the operator scenario)');
(function () {
  var S = serverWorld([CAMPAIGN_ROW]);
  var campaignsBefore = S.__rows().length;
  var stage1 = S.handleUpsertCampaign_(payloadFor());          // CO1150 save, header untouched
  eq(stage1.success, true, 'B1  stage 1 resolves the existing BFCM header');
  eq(stage1.data.campaign_id, 'CMP-BFCM26', 'B2  reusing the same campaign_id for the new SKU');
  eq(S.__rows().length - campaignsBefore, 0, 'B3  CAMPAIGN_COUNT_DELTA = 0 — a new SKU adds no header');
  eq(S.__writes().length, 0, 'B4  and stage 1 wrote nothing at all');
  ok(stage1.data.campaign_id && stage1.data.row_version,
    'B5  stage 2 receives both the id and the current version it needs');
})();

section('C. TYPED WRITE ERRORS — a write refusal never wears a read failure\'s label');
var CODES = (/var KM_CANONICAL_CODES = \[[\s\S]*?\];/.exec(API) || [])[0];
ok(!!CODES, 'C0  the canonical code registry is present');
// the census is taken from the HANDLERS, so a token they stop emitting is not silently kept here
var emitted = {};
[GS20, GS14].forEach(function (g) {
  (g.match(/error: '[A-Z_]+'/g) || []).forEach(function (m) { emitted[m.slice(8, -1)] = 1; });
});
var A3_TOKENS = Object.keys(emitted).filter(function (t) { return /^(STALE_|DUPLICATE_|CAMPAIGN_|SPECIAL_EVENT_|TARGET_RULE_)/.test(t); }).sort();
ok(A3_TOKENS.length >= 7, 'C1  the handlers emit a census-able set of typed refusals', A3_TOKENS.length);
A3_TOKENS.forEach(function (t, i) {
  ok(CODES.indexOf("'" + t + "'") > -1, 'C2.' + i + ' ' + t + ' is registered as a canonical code');
});
(function () {
  var sb = { String: String, RegExp: RegExp };
  vm.createContext(sb);
  vm.runInContext(varSrc(API, 'KM_CANONICAL_CODES') + '\n' + fnSrc(API, '_kmExtractCanonicalCode_'), sb);
  eq(sb._kmExtractCanonicalCode_('STALE_CAMPAIGN_VERSION'), 'STALE_CAMPAIGN_VERSION',
    'C3  a bare typed refusal extracts its own code');
  eq(sb._kmExtractCanonicalCode_('STALE_CAMPAIGN_VERSION — zero rows written.'), 'STALE_CAMPAIGN_VERSION',
    'C4  and still does with the zero-write marker A3-R2 appends');
  eq(sb._kmExtractCanonicalCode_('some prose nobody registered'), '',
    'C5  an UNREGISTERED message still returns nothing — the fallback stays honest, it is not guessed at');
})();
ok(/'READ_FAILED'/.test(FCS), 'C6  the READ_FAILED fallback still exists for genuine read failures');

section('D. BASE FC AT BUILD TIME');
ok(/function _evtEventBaseFcForSku\(/.test(FCS), 'D0  the single event-month Base FC owner exists');
// A3-R6 §7 — Build now resolves through the METHOD-AWARE owner, because the three assist methods
// do not share a baseline: Growth's is another campaign's event FC, Adjust's is a Regular forecast
// month, Manual has none. The rule pinned here is unchanged — Build RESOLVES rather than merely
// inheriting a previous row's value.
ok(/baseFc: \(p && p\.baseFc != null\) \? p\.baseFc : _evtBuildBaselineForSku\(r\.sku\)/.test(FCS),
  'D1  Build RESOLVES Base FC instead of only inheriting a previous row');
ok(/_evtBaseFcForSku\(sku, monthIdx, year\)/.test(fnSrc(FCS, '_evtEventBaseFcForSku')),
  'D2  and it delegates to the EXISTING canonical fc_regular_forecast reader — no second formula');
ok(/_evtEventMonthIdx\(\)/.test(fnSrc(FCS, '_evtEventBaseFcForSku')),
  'D3  using the same event-month derivation the SAVE uses');
(function () {
  // drive the real lookup over a real row set
  var rowsFor = function (v) {
    return [{ sku: 'CO1150-R', year: 2026, company: 'ResUS', country: 'US', marketplace: 'Amazon',
              nov: v }];
  };
  function world(rows, year, start) {
    var els = { 'event-target-year': { value: String(year) }, 'event-start-date': { value: start },
                'event-assist-base-year': { value: '' } };
    var sb = { document: { getElementById: function (id) { return els[id] || null; } },
      window: { KM: { DB: { getFcRegularForecast: function () { return rows; } } } },
      console: console, String: String, Number: Number, Object: Object, Array: Array, Math: Math,
      isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, JSON: JSON };
    vm.createContext(sb);
    vm.runInContext([
      varSrc(FCS, 'REG_MONTH_KEYS'),
      'function _fcResolveMarketplaceKey(v) { return String(v == null ? "" : v).trim(); }',
      'function _evtSelectedSite() { return { company: "ResUS", country: "US", marketplace: "Amazon" }; }',
      fnSrc(FCS, '_evtEventMonthIdx'), fnSrc(FCS, '_evtBaseFcForSku'), fnSrc(FCS, '_evtEventBaseFcForSku')
    ].join('\n'), sb);
    return sb;
  }
  eq(world(rowsFor(4200), 2026, '2026-11-19')._evtEventBaseFcForSku('CO1150-R'), 4200,
    'D4  a Regular FC of 4200 for the event month resolves exactly');
  eq(world(rowsFor(0), 2026, '2026-11-19')._evtEventBaseFcForSku('CO1150-R'), 0,
    'D5  a stored ZERO stays 0 — it is a value, not a missing row');
  eq(world(rowsFor(''), 2026, '2026-11-19')._evtEventBaseFcForSku('CO1150-R'), null,
    'D6  a genuinely blank month is null → "No Base FC"');
  eq(world([], 2026, '2026-11-19')._evtEventBaseFcForSku('CO1150-R'), null,
    'D7  and so is an absent row');
  eq(world(rowsFor(4200), 2026, '2026-12-10')._evtEventBaseFcForSku('CO1150-R'), null,
    'D8  a December window reads December, not November — the month is scoped');
  var otherYear = [{ sku: 'CO1150-R', year: 2027, company: 'ResUS', country: 'US', marketplace: 'Amazon', nov: 9999 }];
  eq(world(otherYear, 2026, '2026-11-19')._evtEventBaseFcForSku('CO1150-R'), null,
    'D9  and the YEAR is scoped — 2027 rows do not answer a 2026 event');
  var otherSite = [{ sku: 'CO1150-R', year: 2026, company: 'ResUS', country: 'CA', marketplace: 'Amazon', nov: 7777 }];
  eq(world(otherSite, 2026, '2026-11-19')._evtEventBaseFcForSku('CO1150-R'), null,
    'D10 and the SITE is scoped — a CA row does not answer a US event');
})();

section('E. SCOPED PREREQUISITE INVALIDATION');
var RESET = fnSrc(FCS, '_fcResetSecondaryCache');
ok(/function _fcResetSecondaryCache\(scope\)/.test(RESET), 'E0  the reset now receives the write scope');
(function () {
  var sb = { console: console, Object: Object, Array: Array, String: String };
  vm.createContext(sb);
  vm.runInContext([
    varSrc(FCS, '_FC_PREREQ_TABLES_'), varSrc(FCS, '_FC_SLICE_PREREQ_TABLES_'),
    'var _fcSecondaryLoaded = true;', 'var _fcPrereqLoadedPaths_ = {};',
    // A3-R5 §5 — the reset now also drops the CHANGED TABLES, so the record it drops them from has to
    // travel into the sandbox with it. A sibling var does not come along with fnSrc.
    'var _fcPrereqLoadedTables_ = {};',
    fnSrc(FCS, '_fcSliceTables_'), RESET
  ].join('\n'), sb);
  function warm() { vm.runInContext('_fcPrereqLoadedPaths_ = { regular: true, event: true };', sb); }
  function paths() { return Object.keys(vm.runInContext('_fcPrereqLoadedPaths_', sb)).sort(); }

  warm(); sb._fcResetSecondaryCache('rules');
  eq(paths(), ['event', 'regular'], 'E1  a TARGET RULE save keeps BOTH builder paths warm (the operator\'s case)');
  warm(); sb._fcResetSecondaryCache({ slice: 'rules', merged: true });
  eq(paths(), ['event', 'regular'], 'E2  and so does the object form the rule path actually passes');
  warm(); sb._fcResetSecondaryCache('regular');
  eq(paths(), ['event'], 'E3  a REGULAR write clears only the Regular path');
  warm(); sb._fcResetSecondaryCache('events');
  eq(paths(), ['regular'], 'E4  an EVENTS write clears only the Special path');
  warm(); sb._fcResetSecondaryCache(undefined);
  eq(paths(), [], 'E5  an UNKNOWN scope clears everything — not knowing is never answered by staying warm');
  warm(); sb._fcResetSecondaryCache('somethingNew');
  eq(paths(), [], 'E6  and so is an unrecognised slice');
})();
// the matrix is DERIVED from the existing declaration, not restated
ok(/_FC_PREREQ_TABLES_\[p\]\.some/.test(RESET),
  'E7  affected paths are derived from _FC_PREREQ_TABLES_ — no second list of what a path holds');

section('F. WARM NEXT ISSUES NO REQUEST, AND SHOWS NO LOADING');
var PROCEED = fnSrc(FCS, 'proceedToFcMode');
// A3-R5 §3 — the warm test gained a second question. 'Warm' used to mean only that the builder's
// broad-cache tables were loaded; the Special builder also reads fc_regular_forecast for its Base FC
// column, and a session that never opened the Regular tab holds no such rows. Opening 'warm' on that
// state is what produced an all-'—' Base FC column in production. The RULE is unchanged and is what
// is pinned: a path with nothing left to fetch opens directly, before any busy state is set.
ok(/if \(!_fcPrereqNeeded_\(selectedMode\) && !_fcBaseFcSourceMissing_\(selectedMode\)\) \{[\s\S]*?_fcOpenBuilder_\(selectedMode\); return;/.test(PROCEED),
  'F1  a warm path opens the builder directly — before any busy state is set');
var busyAt = PROCEED.indexOf('_fcSetNextBusy_(true)');
var warmAt = PROCEED.indexOf('_fcOpenBuilder_(selectedMode); return;');
ok(warmAt > -1 && busyAt > warmAt, 'F2  and the Loading state is set AFTER that early return, so a warm Next never shows it');
(function () {
  var sb = { console: console, Object: Object };
  vm.createContext(sb);
  vm.runInContext([
    'var _fcPrereqLoadedPaths_ = {};',
    'function _fcEffectiveWorkspace() { return true; }',
    fnSrc(FCS, '_fcPrereqPath_'), fnSrc(FCS, '_fcPrereqNeeded_')
  ].join('\n'), sb);
  eq(sb._fcPrereqNeeded_('regular'), true, 'F3  cold Regular needs a load');
  vm.runInContext('_fcPrereqLoadedPaths_ = { regular: true };', sb);
  eq(sb._fcPrereqNeeded_('regular'), false, 'F4  warm Regular needs none — 0 logical requests');
  eq(sb._fcPrereqNeeded_('event'), true, 'F5  and the OTHER path is judged separately');
})();
ok(/if \(_fcPrereqLoadedPaths_\[p\]\) return Promise\.resolve\(\);/.test(fnSrc(FCS, '_fcLoadPrerequisites_')),
  'F6  and the loader itself short-circuits a warm path without a request');

section('G. TARGET RULE SAVE FEEDBACK — AND WHAT IT IS ALLOWED TO SAY');
/* A3-R5 §1 — RE-EXPRESSED, AND STRICTLY STRONGER THAN WHAT IT REPLACES.
 *
 * A3-R4 hung this feedback on the one signal the helper carried, `disabled`, and these assertions
 * pinned that spelling. Production then showed what the spelling cost: the validation gate disables
 * Save on every modal open and every scope change, so the Target Rule modal OPENED saying 'Saving…'
 * with no write anywhere near it. The rule these were written to protect — an operator can see that a
 * slow save is running — is kept exactly, and the live defect adds its converse: ONLY a write in
 * flight may say so. Nothing here has been relaxed; a state that was previously unasserted is now
 * asserted. */
var TRENDER = fnSrc(FCS, '_fcRenderTargetSave_');
var TVALID = fnSrc(FCS, '_fcSetTargetSaveEnabled_');
var TBUSY = fnSrc(FCS, '_fcSetTargetSaveBusy_');
ok(/b\.textContent = 'Saving…';/.test(TRENDER), 'G1  the button says Saving… while the write is in flight');
ok(/b\.disabled = _fcTargetSave_\.busy \|\| !_fcTargetSave_\.valid;/.test(TRENDER),
  'G2  and is disabled — by the write OR by an invalid form, which are now two separate reasons');
ok(/dataset\.fcIdleLabel = b\.textContent/.test(TRENDER),
  'G3  the original label is captured FROM THE BUTTON — no second copy of the word to drift');
ok(/b\.textContent = \(b\.dataset && b\.dataset\.fcIdleLabel\) \|\| 'Save'/.test(TRENDER),
  'G4  and restored on the way back up');
ok(/_fcTargetSave_\.valid = !!on/.test(TVALID) && TVALID.indexOf('Saving…') === -1,
  'G4a the VALIDITY setter cannot write the busy label — this is the A3-R4 defect, closed at the source');
ok(/_fcTargetSave_\.busy = !!on/.test(TBUSY), 'G4b and the BUSY setter is the only one that can');
ok(/_fcWriteBegin_\('targetRule'\)/.test(FCS), 'G5  the single-flight latch that makes a duplicate write impossible is kept');
function tgtWorld() {
  var btn = { textContent: 'Save', disabled: false, dataset: {}, _attrs: {},
    setAttribute: function (k, v) { this._attrs[k] = v; }, removeAttribute: function (k) { delete this._attrs[k]; } };
  var sb = { document: { getElementById: function () { return btn; } } };
  vm.createContext(sb);
  vm.runInContext([varSrc(FCS, '_fcTargetSave_'), TRENDER, TVALID, TBUSY].join('\n'), sb);
  return { btn: btn, sb: sb };
}
(function () {
  var w = tgtWorld();
  // THE OPERATOR'S LIVE REPORT, DIRECTLY: the modal opens on a form that is incomplete by definition.
  w.sb._fcSetTargetSaveEnabled_(false);
  eq([w.btn.textContent, w.btn.disabled, w.btn._attrs['aria-busy'] || null], ['Save', true, null],
    'G6  modal open / invalid: closed, but the label still reads Save and nothing claims to be busy');
  w.sb._fcSetTargetSaveEnabled_(true);
  eq([w.btn.textContent, w.btn.disabled], ['Save', false], 'G6a valid and idle: Save, open');
  w.sb._fcSetTargetSaveBusy_(true);
  eq([w.btn.textContent, w.btn.disabled, w.btn._attrs['aria-busy']], ['Saving…', true, 'true'],
    'G6b in flight: Saving… + disabled + aria-busy');
  w.sb._fcSetTargetSaveBusy_(true);        // a repeated click must not capture "Saving…" as the label
  w.sb._fcSetTargetSaveBusy_(false);
  eq([w.btn.textContent, w.btn.disabled], ['Save', false],
    'G7  restored to the ORIGINAL label even after a repeated in-flight call');
  var w2 = tgtWorld();
  w2.sb._fcSetTargetSaveEnabled_(false);
  w2.sb._fcSetTargetSaveBusy_(true);
  w2.sb._fcSetTargetSaveBusy_(false);      // the refusal path: settle hands the control back
  eq([w2.btn.textContent, w2.btn.disabled], ['Save', true],
    'G7a a failure returns it to IDLE — the label, but not a validity it never checked');
})();

section('H. SELECTOR RETRY IS HEALTHY RECOVERY (no change, asserted so it stays true)');
var SLICEFETCH = fnSrc(FCS, '_fcSliceFetch_');
ok(/if \(rec\.flight\) return rec\.flight;/.test(SLICEFETCH), 'H1  _fcSliceFetch_ is single-flight');
var RETRY = fnSrc(FCS, '_fcRetryFailedSlices_');
ok(/var bad = _fcFailedSlices_\(\);/.test(RETRY), 'H2  Retry asks which slices failed');
ok(/bad\.forEach\(function \(n\) \{\s*_fcSliceFetch_\(n\)/.test(RETRY),
  'H3  and re-requests ONLY those — an unrelated slice is not re-fetched');
ok(!/getWorkspace\([^)]*\)[\s\S]{0,80}getWorkspace\(/.test(RETRY), 'H4  one request per failed slice, not two');

section('I. A3-R2 / A3-R3 CONTRACTS PRESERVED');
['upsertCampaign', 'upsertCampaignSkuLines', 'upsertFcSpecialEvent'].forEach(function (a, i) {
  ok(new RegExp("_kmCanonicalWrite_\\('" + a + "'").test(API), 'I' + (i + 1) + '  ' + a + ' still uses the canonical write transport');
});
ok(/RETRY_ONLY_ON_ = \['REQUEST_METHOD_DOWNGRADED', 'RESPONSE_CORRELATION_UNPROVEN'\]/.test(API),
  'I4  one evidence-gated transport retry only');
ok(!/window\.KM\.DB\.upsertCampaign[\s\S]{0,400}?await fetch\(/.test(API), 'I5  no raw fetch regression');
ok(/id="event-target-year" onchange="_evtPopulateExistingSelect\(\)"/.test(read('assets/html/pages/fc-summary.html')),
  'I6  the A3-R3 year binding survives');
ok(/CAMPAIGN_KEY_FIELDS_\s*=\s*\['company', 'country', 'marketplace', 'promotion_type', 'event_flag',\n\s*'start_date', 'end_date'\]/.test(GS20),
  'I7  HEADER_IDENTITY_KEY unchanged');
ok(GS14.indexOf('STALE_SPECIAL_EVENT_VERSION') > -1, 'I8  the special-event stale guard is untouched');
// A3-R6 — these pinned the release as the LITERAL R16, which is the one thing a release is guaranteed
// to change: R17 moved it for the campaign-lock repair. What A3-R4 needed to know is that ITS OWN
// change shipped, i.e. that the release is at or after R16 and that 20_ — the file A3-R4 changed — is
// stamped with the current release rather than lagging it. Both are asked of the ledger now, so a
// later round moves them without editing this line.
var _rel = (/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/.exec(GS63) || [])[1];
var _c20 = (/var CAMPAIGN_BUILD_VERSION_ = '([^']+)'/.exec(GS20) || [])[1];
ok(RO.stampAtOrAfter(_rel, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R16'),
  'I9  the release is at or after R16, the round this campaign-reuse contract shipped in', _rel);
eq(_c20, _rel, 'I10 and 20_ carries the current release — it has changed in every round since');
eq((/var FCW_BUILD_VERSION_ = '([^']+)'/.exec(GS14) || [])[1], 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R15',
  'I11 while 14_ stays at the round it last changed');

section('J. MUTANTS');

var RESOLVER_SRC = fnSrc(GS20, 'campaignResolveOrTerminal_');
function faultResolver(from, to) {
  var out = (from instanceof RegExp) ? RESOLVER_SRC.replace(from, to) : RESOLVER_SRC.split(from).join(to);
  if (out === RESOLVER_SRC) throw new Error('mutant anchor drifted: ' + from);
  return out;
}

mutant('M1 version gate moved back in front of the reuse comparison', (function () {
  // the A3-R1 order: refuse a versionless save the moment a row is resolved
  var S = serverWorld([CAMPAIGN_ROW], { resolver: faultResolver('if (headerIdentical) {', 'if (false) {') });
  var r = S.handleUpsertCampaign_(payloadFor());
  return r.success === false && r.error === 'STALE_CAMPAIGN_VERSION';
})());

mutant('M2 header mutation allowed without a version', (function () {
  var S = serverWorld([CAMPAIGN_ROW], { resolver: faultResolver(
    'var headerIdentical = campaignFingerprint_(incoming) === matched.fingerprint;',
    'var headerIdentical = true;') });
  var r = S.handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED' }));
  return r.success === true;        // caught: a mutation slipped through with no version
})());

mutant('M3 reuse writes the row anyway', (function () {
  var S = serverWorld([CAMPAIGN_ROW], { resolver: faultResolver(
    /    if \(headerIdentical\) \{[\s\S]*?\n    \}\n/, '') });
  S.handleUpsertCampaign_(payloadFor());
  return S.__writes().length > 0 || (S.__last() && S.__last().success === false);
})());

mutant('M4 Base FC lookup removed from Build', (function () {
  return !/baseFc: \(p && p\.baseFc != null\) \? p\.baseFc : _evtEventBaseFcForSku\(r\.sku\)/
    .test(FCS.replace('baseFc: (p && p.baseFc != null) ? p.baseFc : _evtEventBaseFcForSku(r.sku)', 'baseFc: p ? p.baseFc : null'));
})());

mutant('M5 a valid Base FC of zero turned into null', (function () {
  var faulted = fnSrc(FCS, '_evtBaseFcForSku').replace("if (raw === '' || raw == null) return null;", 'if (!raw) return null;');
  var els = { 'event-target-year': { value: '2026' }, 'event-start-date': { value: '2026-11-19' },
              'event-assist-base-year': { value: '' } };
  var sb = { document: { getElementById: function (id) { return els[id] || null; } },
    window: { KM: { DB: { getFcRegularForecast: function () {
      return [{ sku: 'CO1150-R', year: 2026, company: 'ResUS', country: 'US', marketplace: 'Amazon', nov: 0 }]; } } } },
    String: String, Number: Number, Object: Object, Array: Array, Math: Math, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, console: console };
  vm.createContext(sb);
  vm.runInContext([varSrc(FCS, 'REG_MONTH_KEYS'),
    'function _fcResolveMarketplaceKey(v) { return String(v == null ? "" : v).trim(); }',
    'function _evtSelectedSite() { return { company: "ResUS", country: "US", marketplace: "Amazon" }; }',
    fnSrc(FCS, '_evtEventMonthIdx'), faulted, fnSrc(FCS, '_evtEventBaseFcForSku')].join('\n'), sb);
  return sb._evtEventBaseFcForSku('CO1150-R') !== 0;
})());

mutant('M6 a typed campaign code removed from the registry', (function () {
  var faulted = CODES.replace("'STALE_CAMPAIGN_VERSION', ", '');
  if (faulted === CODES) throw new Error('M6 anchor drifted');
  var sb = { String: String, RegExp: RegExp };
  vm.createContext(sb);
  vm.runInContext(faulted + '\n' + fnSrc(API, '_kmExtractCanonicalCode_'), sb);
  return sb._kmExtractCanonicalCode_('STALE_CAMPAIGN_VERSION') !== 'STALE_CAMPAIGN_VERSION';
})());

mutant('M7 both prerequisite paths cleared after every write', (function () {
  var faulted = 'function _fcResetSecondaryCache(scope) { _fcSecondaryLoaded = false; _fcPrereqLoadedPaths_ = {}; }';
  var sb = { console: console, Object: Object, Array: Array, String: String };
  vm.createContext(sb);
  vm.runInContext([varSrc(FCS, '_FC_PREREQ_TABLES_'), varSrc(FCS, '_FC_SLICE_PREREQ_TABLES_'),
    'var _fcSecondaryLoaded = true;', 'var _fcPrereqLoadedPaths_ = { regular: true, event: true };',
    fnSrc(FCS, '_fcSliceTables_'), faulted].join('\n'), sb);
  sb._fcResetSecondaryCache('rules');
  return Object.keys(vm.runInContext('_fcPrereqLoadedPaths_', sb)).length === 0;
})());

mutant('M8 an AFFECTED path kept warm', (function () {
  var faulted = fnSrc(FCS, '_fcResetSecondaryCache').replace('if (holds) delete _fcPrereqLoadedPaths_[p];', '');
  var sb = { console: console, Object: Object, Array: Array, String: String };
  vm.createContext(sb);
  vm.runInContext([varSrc(FCS, '_FC_PREREQ_TABLES_'), varSrc(FCS, '_FC_SLICE_PREREQ_TABLES_'),
    'var _fcSecondaryLoaded = true;', 'var _fcPrereqLoadedPaths_ = { regular: true, event: true };',
    'var _fcPrereqLoadedTables_ = {};',
    fnSrc(FCS, '_fcSliceTables_'), faulted].join('\n'), sb);
  sb._fcResetSecondaryCache('events');
  return Object.keys(vm.runInContext('_fcPrereqLoadedPaths_', sb)).indexOf('event') !== -1;
})());

mutant('M9 Saving… state removed', (function () {
  var faulted = TRENDER.replace("b.textContent = 'Saving…';", '');
  if (faulted === TRENDER) throw new Error('M9 anchor drifted');
  var btn = { textContent: 'Save', disabled: false, dataset: {}, _attrs: {},
    setAttribute: function (k, v) { this._attrs[k] = v; }, removeAttribute: function (k) { delete this._attrs[k]; } };
  var sb = { document: { getElementById: function () { return btn; } } };
  vm.createContext(sb);
  vm.runInContext([varSrc(FCS, '_fcTargetSave_'), faulted, TVALID, TBUSY].join('\n'), sb);
  sb._fcSetTargetSaveBusy_(true);
  return btn.textContent !== 'Saving…';
})());

mutant('M9a Saving… shown whenever the control is disabled (the A3-R4 live defect)', (function () {
  var faulted = TRENDER.replace('if (_fcTargetSave_.busy) {', 'if (b.disabled) {');
  if (faulted === TRENDER) throw new Error('M9a anchor drifted');
  var btn = { textContent: 'Save', disabled: false, dataset: {}, _attrs: {},
    setAttribute: function (k, v) { this._attrs[k] = v; }, removeAttribute: function (k) { delete this._attrs[k]; } };
  var sb = { document: { getElementById: function () { return btn; } } };
  vm.createContext(sb);
  vm.runInContext([varSrc(FCS, '_fcTargetSave_'), faulted, TVALID, TBUSY].join('\n'), sb);
  sb._fcSetTargetSaveEnabled_(false);      // invalid form, no write anywhere
  return btn.textContent === 'Saving…';    // the faulted build claims a save is running: caught
})());

mutant('M10 warm Next always shows Loading', (function () {
  var faulted = PROCEED.replace(
    /if \(!_fcPrereqNeeded_\(selectedMode\) && !_fcBaseFcSourceMissing_\(selectedMode\)\) \{[\s\S]*?_fcOpenBuilder_\(selectedMode\); return;\s*\}/, '');
  if (faulted === PROCEED) throw new Error('M10 anchor drifted');
  return faulted.indexOf('_fcOpenBuilder_(selectedMode); return;') === -1;
})());

mutant('M11 campaign existence treated as event duplicate', (function () {
  // reuse must return success; a mutant that answers DUPLICATE for a resolvable header is caught
  var S = serverWorld([CAMPAIGN_ROW], { resolver: faultResolver('    if (headerIdentical) {',
    "    if (headerIdentical) {\n      return { terminal: true, response: jsonResponse_({ success: false, error: 'DUPLICATE_CAMPAIGN_IDENTITY' }) };\n    }\n    if (false) {") });
  var r = S.handleUpsertCampaign_(payloadFor());
  return r.success === false;
})());

section('K. VACUITY — the unfaulted tree really does behave as the mutants assume');
(function () {
  var S = serverWorld([CAMPAIGN_ROW]);
  var r = S.handleUpsertCampaign_(payloadFor());
  ok(r.success === true && S.__writes().length === 0,
    'K1  reuse really does succeed with zero writes, so M1/M3/M11 can fail');
  var S2 = serverWorld([CAMPAIGN_ROW]);
  var r2 = S2.handleUpsertCampaign_(payloadFor({ campaign_name: 'RENAMED' }));
  ok(r2.success === false, 'K2  and a real mutation really is refused, so M2 can fail');
})();

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail
  + ' failed, ' + mutants.length + ' mutants, ' + survived.length + ' survived');
console.log(new Array(101).join('='));
process.exit((fail === 0 && survived.length === 0) ? 0 : 1);
