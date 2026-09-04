// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1 — SCHEDULE-AWARE SNAPSHOT + NON-BLOCKING CAPABILITY + SINGLE-SCOPE GUARD
// ----------------------------------------------------------------------------------------------------------------
// "IS THIS SNAPSHOT CURRENT?" IS A QUESTION ABOUT THE SCHEDULE, AND R4 ANSWERED IT WITH A CALENDAR.
//
// R4 compared each materialized row's calculation_date to today in Asia/Taipei and called any difference STALE.
// The Inventory Gap materialization is a DAILY 13:30 automation, so that rule declared the entire database
// stale every morning — and at 10:41 on 2026-09-04 it refused a complete, successful 2026-09-03 snapshot, the
// newest thing that had ever existed, three hours before today's run was even due.
//
// The replacement asks three questions and only the last is about dates: where are we in today's schedule, is
// what we hold internally consistent, and does its lineage match the plan. Before the run is due, the latest
// complete run IS current. While it is in flight, it is STILL current, because a half-written today is not a
// better answer than a finished yesterday. Once the run is overdue or has failed, the very same snapshot is
// refused with a typed code — which is exactly what an age tolerance could never express.
//
// TWO OTHER THINGS THIS ROUND FIXES. A 45-second capability failure resolving late could overwrite a later
// success with fail-safe defaults, silently flipping the runtime posture minutes after the page looked
// settled. And the global AI Plan flag was the only switch on the writer, so the first controlled single-SKU
// trial and a 495-scope production write were the same gesture.
//
// Run: node assets/tests/schedule-aware-snapshot-and-scope-guard-f1-7n-fc-1b-e3-r4-a2-r1.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
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
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function ops(src) {
  return code(src).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function swap(src, find, repl) {
  var re = new RegExp(String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));
  if (!re.test(src)) throw new Error('swap anchor not found: ' + String(find).slice(0, 90));
  return String(src).replace(re, repl);
}

var KMSNF = require(path.join(ROOT, 'assets/js/core/supply-planning-snapshot-freshness.js'));
var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var G45 = read('assets/specs/active/apps-script/45_api_v1_automation_schedule.gs');
var G43 = read('assets/specs/active/apps-script/43_api_v1_gap_materialization.gs');
var CFG = read('assets/specs/active/apps-script/00_config.gs');
var HLTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var TRANSPORT = read('assets/js/api/km-transport.js');
var BUILDER = read('assets/tools/build-apps-script-bundle.js');
var BUNDLE = read('assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var TEMP = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs');
var INDEX = read('index.html');
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));

var TZ = 480;
function at(ymd, hhmm) { var p = ymd.split('-'), t = hhmm.split(':');
  return Date.UTC(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]) - TZ * 60000; }
var SCH = { hour: 13, minute: 30 };
function snap(date, over) {
  return Object.assign({ date: date, status: 'READY', rowCount: 1, planningCycle: 'RECO-' + date.slice(0, 7) }, over || {});
}
function assess(over) {
  return KMSNF.assess(Object.assign({ utcOffsetMinutes: TZ, schedule: SCH, expectedPlanningCycle: 'RECO-2026-09' }, over));
}

// ================================================================================================================
section('§2 — THE SCHEDULE TOPOLOGY, read from the code that owns it');
// ================================================================================================================
ok(/AUTOMATION_TZ_ = 'Asia\/Taipei'/.test(G45), 'T1  the automation timezone authority is Asia/Taipei');
ok(/GAP_CALC_UTC_OFFSET_MIN_ = 480/.test(G43), 'T1a and the calc context uses the fixed +8 offset (Taiwan has no DST)');
var invJob = /\{ key: 'inventoryGap'[\s\S]{0,400}?defaults: \{ enabled: (\w+), frequency: '(\w+)', hour: (\d+), minute: (\d+) \}/.exec(G45);
ok(!!invJob, 'T2  the Inventory Gap materialization is a declared automation');
eq([invJob[2], +invJob[3], +invJob[4]], ['DAILY', 13, 30], 'T2a DAILY at 13:30 Asia/Taipei');
ok(/handler: 'runDailyInventoryGapMaterialization'/.test(G45), 'T2b with a named handler');
var impJob = /\{ key: 'amazonImport'[\s\S]{0,400}?hour: (\d+), minute: (\d+)/.exec(G45);
eq([+impJob[1], +impJob[2]], [12, 30], 'T3  its prerequisite source import runs first, at 12:30');
ok(/INV_GAP_TABLE_ = 'inventory_replenishment_gap'/.test(G43), 'T4  43_ is the stage that WRITES the snapshot table');
// The claim that matters for the live case.
ok(10 * 60 + 41 < 13 * 60 + 30, 'T5  10:41 is BEFORE 13:30 — at that hour today\'s chain has not started');
// No run_id column: this is why completeness has to be inferred from agreement.
ok(!/'run_id'/.test(/var INV_GAP_HEADERS_ = \[[\s\S]*?\];/.exec(G43)[0]),
  'T6  §6 the table carries NO run_id column, so "which run wrote this" is not readable off a row');
ok(/latest-state UPSERT by business key/.test(G43),
  'T6a and 43_ upserts row by row — there is no atomic publication, which is what PARTIAL_SNAPSHOT_BLOCKED exists for');

// ================================================================================================================
section('§3 — THE FRESHNESS AUTHORITY, executed');
// ================================================================================================================
var live = assess({ nowMs: at('2026-09-04', '10:41'), snapshotDates: [snap('2026-09-03')] });
eq(live.state, 'CURRENT_PRE_SCHEDULE', 'S1  §12.1 the LIVE case: 10:41, latest snapshot 2026-09-03');
eq([live.ok, live.acceptedDate], [true, '2026-09-03'], 'S1a the previous complete run is ACCEPTED, not stale');
ok(/scheduled for 13:30 and it is 10:41/.test(live.reason), 'S1b and the reason names the schedule, not an age');
eq(assess({ nowMs: at('2026-09-04', '14:00'), snapshotDates: [snap('2026-09-03')] }).state,
  'CURRENT_DURING_REFRESH', 'S2  §12.2 while the run is due/in flight, the last COMPLETE run is still the authority');
eq(assess({ nowMs: at('2026-09-04', '13:45'), snapshotDates: [snap('2026-09-04')] }).state,
  'CURRENT_AFTER_REFRESH', 'S3  §12.3 once today completes, today is selected');
eq(assess({ nowMs: at('2026-09-04', '17:46'), snapshotDates: [snap('2026-09-03')] }).state,
  'REFRESH_OVERDUE', 'S4  §12.4 past the completion window with nothing for today, it BLOCKS');
ok(!assess({ nowMs: at('2026-09-04', '17:46'), snapshotDates: [snap('2026-09-03')] }).ok,
  'S4a — and the SAME snapshot that was accepted at 10:41 is now refused');
eq(assess({ nowMs: at('2026-09-04', '10:41'), snapshotDates: [snap('2026-09-03')],
    jobState: { status: 'FAILED', runId: 'GAP-INV-X', startedAtDate: '2026-09-04' } }).state,
  'REFRESH_FAILED', 'S5  §12.5 a job that FAILED today blocks, even before the scheduled hour');
eq(assess({ nowMs: at('2026-09-04', '10:41'), snapshotDates: [snap('2026-09-03')],
    jobState: { status: 'FAILED', runId: 'GAP-INV-Y', startedAtDate: '2026-09-03' } }).state,
  'CURRENT_PRE_SCHEDULE', 'S5a but YESTERDAY\'s failure is not today\'s — it does not block');
eq(assess({ nowMs: at('2026-09-04', '10:41'), snapshotDates: [snap('2026-09-03'), snap('2026-09-04')] }).state,
  'PARTIAL_SNAPSHOT_BLOCKED', 'S6  §12.6 two calculation dates in one scope is a run caught mid-write');
ok(!assess({ nowMs: at('2026-09-04', '02:00'), snapshotDates: [snap('2026-09-03'), snap('2026-09-04')] }).ok,
  'S6a and being pre-schedule does NOT rescue it — consistency is checked before the clock');
eq(assess({ nowMs: at('2026-09-04', '10:41'), snapshotDates: [snap('2026-08-20')] }).state,
  'LINEAGE_MISMATCH', 'S8  §12.8 a snapshot from another planning cycle blocks');
eq(assess({ nowMs: at('2026-09-04', '10:41'), snapshotDates: [snap('2026-09-05')] }).state,
  'LINEAGE_MISMATCH', 'S8a a FUTURE-dated snapshot is wrong, not fresh');
eq(assess({ nowMs: at('2026-09-04', '10:41'), snapshotDates: [] }).state,
  'NO_COMPLETE_SNAPSHOT', 'S9  §12.9 nothing at any date blocks');
eq(assess({ nowMs: at('2026-09-04', '10:41'), snapshotDates: [snap('2026-09-03', { status: 'BLOCKED' })] }).state,
  'NO_COMPLETE_SNAPSHOT', 'S9a a snapshot whose only row is BLOCKED is not a complete one');
// §12.7 the Taiwan clock, at the boundary.
eq(assess({ nowMs: at('2026-09-04', '13:29'), snapshotDates: [snap('2026-09-03')] }).state,
  'CURRENT_PRE_SCHEDULE', 'S7  §12.7 13:29 Asia/Taipei is still pre-schedule...');
eq(assess({ nowMs: at('2026-09-04', '13:30'), snapshotDates: [snap('2026-09-03')] }).state,
  'CURRENT_DURING_REFRESH', 'S7a ...and 13:30 is not');
eq(KMSNF.businessNow(at('2026-09-04', '00:30'), TZ).ymd, '2026-09-04',
  'S7b 00:30 Taipei is 2026-09-04 there and 16:30 the previous day in UTC — the business day is the one used');
// THE CLOCK IS THE SERVER'S.
eq(KMSNF.assess({ utcOffsetMinutes: TZ, schedule: SCH, snapshotDates: [snap('2026-09-03')] }).state,
  'SCHEDULE_UNRESOLVED', 'S10 a missing clock is refused — this module never reads one');
ok(!/Date\.now\(\)|new Date\(\)/.test(ops(read('assets/js/core/supply-planning-snapshot-freshness.js'))),
  'S10a and there is no clock read anywhere in it, so a browser clock cannot become a planning authority');
eq(KMSNF.assess({ nowMs: at('2026-09-04', '10:41'), utcOffsetMinutes: TZ, snapshotDates: [snap('2026-09-03')] }).state,
  'SCHEDULE_UNRESOLVED', 'S11 and an unresolved schedule is refused rather than assumed');
// It is NOT an age tolerance and NOT "yesterday is always fine".
ok(!/tolerance|maxAgeMs|ageMs|36 ?\* ?60|hoursOld/i.test(ops(read('assets/js/core/supply-planning-snapshot-freshness.js'))),
  'S12 there is no age tolerance in the module — the schedule is the whole rule');
ok(assess({ nowMs: at('2026-09-04', '10:41'), snapshotDates: [snap('2026-09-03')] }).ok
  && !assess({ nowMs: at('2026-09-04', '18:00'), snapshotDates: [snap('2026-09-03')] }).ok,
  'S12a the SAME date is accepted at one hour and refused at another — an age rule could not do that');

// ================================================================================================================
section('§4 — THE PRODUCTION GATE, executed against the live evidence');
// ================================================================================================================
function gsCtx(nowMs) {
  var sb = { console: console, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object,
    Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, Error: Error,
    RegExp: RegExp, Boolean: Boolean, TypeError: TypeError };
  sb.Date = function (v) { return v === undefined ? new (Function.prototype.bind.call(Date, null, nowMs))() : new Date(v); };
  sb.Date.now = function () { return nowMs; };
  sb.Date.UTC = Date.UTC; sb.Date.prototype = Date.prototype;
  sb.PropertiesService = { getScriptProperties: function () { return { getProperty: function () { return null; } }; } };
  sb.global = sb;
  var c = vm.createContext(sb);
  ['90_generated_supply_planning_bundle.gs', '00_config.gs', '45_api_v1_automation_schedule.gs',
   '43_api_v1_gap_materialization.gs', '61_api_v1_weekly_ai_plan.gs'].forEach(function (f) {
    try { vm.runInContext(read('assets/specs/active/apps-script/' + f), c, { filename: f }); }
    catch (e) { console.log('LOAD ' + f + ': ' + e.message); }
  });
  vm.runInContext('var gapReadObjects_ = function (ss, name) { return (ss.__rows && ss.__rows[name]) || []; };', c);
  return c;
}
var GH = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_date',
  'd18_gap_qty', 'd18_suggested_qty', 'd30_gap_qty', 'd30_suggested_qty', 'd45_gap_qty', 'd45_suggested_qty',
  'd90_gap_qty', 'd90_suggested_qty', 'note', 'calculated_at', 'updated_at'];
function grow(over) {
  return Object.assign({ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R',
    calculation_status: 'READY', calculation_date: '2026-09-03',
    d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 0, d30_suggested_qty: 120,
    d45_gap_qty: 0, d45_suggested_qty: 300, d90_gap_qty: 520, d90_suggested_qty: 520,
    note: '', calculated_at: '2026-09-03 17:05:11', updated_at: '2026-09-03 17:05:11' }, over || {});
}
function mkSS(rows) {
  var sh = { getLastRow: function () { return rows.length + 1; }, getLastColumn: function () { return GH.length; },
    getRange: function () { return { getValues: function () { return [GH]; } }; } };
  var ss = { getSheetByName: function (n) { return n === 'inventory_replenishment_gap' ? sh : null; } };
  ss.__rows = { inventory_replenishment_gap: rows };
  return ss;
}
var SCOPE = { company: 'ResUS', country: 'US', planningCycle: 'RECO-2026-09' };
var SITE = { marketplace: 'Amazon', sku: 'CO1100-R', cumulativeGapByWindow: { D30: 999, D90: 999 } };
function canon(nowMs, rows) {
  var c = gsCtx(nowMs);
  var snapshot = vm.runInContext('weeklyAiPlanCanonicalDemand_', c)(mkSS(rows), SCOPE, '2026-09-04');
  var accept = snapshot.ok
    ? vm.runInContext('weeklyAiPlanAcceptCanonicalDemand_', c)(snapshot, SITE, SCOPE, '2026-09-04', null) : null;
  return { snapshot: snapshot, accept: accept };
}
var L = canon(at('2026-09-04', '10:41'), [grow()]);
eq(L.snapshot.freshnessState, 'CURRENT_PRE_SCHEDULE', 'P1  §12.37 10:41 becomes CURRENT_PRE_SCHEDULE in PRODUCTION code');
eq(L.snapshot.acceptedDate, '2026-09-03', 'P1a §12.38 the accepted snapshot is 2026-09-03');
eq(L.snapshot.schedule.source, 'EFFECTIVE_CONFIG', 'P1b and the schedule came from the deployment\'s own config');
eq([L.snapshot.schedule.hour, L.snapshot.schedule.minute], [13, 30], 'P1c resolved to 13:30');
eq(L.accept.ok, true, 'P2  the site is ACCEPTED — where R4 answered CANONICAL_DEMAND_STALE');
eq(L.accept.suggestedByWindow, { D30: 120, D90: 520 }, 'P2a with the SNAPSHOT quantity (520), not the live 999');
eq(L.accept.lineage.freshness_state, 'CURRENT_PRE_SCHEDULE', 'P3  the lineage carries WHY that run was current...');
eq(L.accept.lineage.accepted_snapshot_date, '2026-09-03', 'P3a ...and which run it was');
eq(L.accept.lineage.calculation_date, '2026-09-03', 'P3b agreeing with the row');
// The date comparison that caused it is GONE.
ok(!/CANONICAL_DEMAND_STALE/.test(G61), 'P4  CANONICAL_DEMAND_STALE no longer exists in 61_');
ok(!/rec\.calculation_date !== calcDate/.test(G61), 'P4a and the today-comparison it was built on is gone with it');
// The blocks that must survive.
eq(canon(at('2026-09-04', '10:41'), [grow(), grow({ calculation_date: '2026-09-04', d90_suggested_qty: 460 })]).snapshot.freshnessState,
  'PARTIAL_SNAPSHOT_BLOCKED', 'P5  mixed dates still block in production code');
eq(canon(at('2026-09-04', '17:46'), [grow()]).snapshot.freshnessState, 'REFRESH_OVERDUE', 'P6  overdue still blocks');
eq(canon(at('2026-09-04', '10:41'), [grow({ calculation_date: '2026-08-20' })]).snapshot.freshnessState,
  'LINEAGE_MISMATCH', 'P7  a foreign cycle still blocks');
eq(canon(at('2026-09-04', '10:41'), []).snapshot.freshnessState, 'NO_COMPLETE_SNAPSHOT', 'P8  nothing still blocks');

// ================================================================================================================
section('§9 — THE SINGLE-SCOPE ACTIVATION GUARD');
// ================================================================================================================
var C0 = gsCtx(at('2026-09-04', '10:41'));
var scopeEnabled = vm.runInContext('inventoryAiPlanScopeEnabled_', C0);
var allowlist = vm.runInContext('inventoryAiPlanActivationAllowlist_', C0);
eq(vm.runInContext('inventoryAiPlanDbGenerationEnabled_', C0)(), false, 'G0  §12.21 the flag is FALSE this round');
eq(allowlist(), [{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' }],
  'G1  the allowlist names exactly one scope');
eq(scopeEnabled('ResUS', 'US', 'Amazon', 'CO1100-R'), true, 'G2  §12.23 the exact scope is enabled');
[['ResUS', 'US', 'Amazon', 'CO1150-R', 'another sku'],
 ['ResUS', 'US', 'Walmart', 'CO1100-R', 'another marketplace'],
 ['ResUS', 'CA', 'Amazon', 'CO1100-R', 'another country'],
 ['KM', 'US', 'Amazon', 'CO1100-R', 'another company'],
 ['ResUS', 'US', 'Amazon', 'CO1100-R2', 'a sku PREFIXED by an enabled one'],
 ['resus', 'us', 'amazon', 'co1100-r', 'a case-folded near-match']].forEach(function (c, i) {
  eq(scopeEnabled(c[0], c[1], c[2], c[3]), false, 'G3.' + (i + 1) + ' §12.22 refused: ' + c[4]);
});
[['ResUS', 'US', 'ALL_SITES', 'CO1100-R'], ['ResUS', 'US', 'all', 'CO1100-R'],
 ['ResUS', 'US', 'Amazon', 'ALL'], ['ResUS', 'US', 'Amazon', '']].forEach(function (c, i) {
  eq(scopeEnabled(c[0], c[1], c[2], c[3]), false, 'G4.' + (i + 1) + ' §12.24 ALL_SITES / empty can never be enabled');
});
// §12.25 — the client cannot override it.
var gateSrc = extractFn(CFG, 'inventoryAiPlanScopeEnabled_');
ok(!/body|payload|request|params|e\.parameter|properties/i.test(ops(gateSrc)),
  'G5  §12.25 the guard reads NOTHING from a request — it is server config, and a payload cannot widen it');
ok(!/indexOf\(|startsWith|slice\(/.test(ops(gateSrc).replace(/list\[i\]/g, '')),
  'G5a and it matches EXACTLY — no prefix, no wildcard, no partial');
ok(/AI_PLAN_SCOPE_NOT_ENABLED/.test(G61), 'G6  61_ refuses a run with nothing allowlisted...');
ok(/AI_PLAN_SCOPE_NOT_ENABLED[\s\S]{0,700}db_writes: 0/.test(G61), 'G6a ...reporting zero writes');
ok(/if \(flagTrue\) \{[\s\S]{0,3000}AI_PLAN_SCOPE_NOT_ENABLED/.test(G61),
  'G6b and the gate is inside the FLAG-TRUE branch — it is the second condition, not a replacement for the first');
ok(/AI_PLAN_SCOPE_GUARD_UNAVAILABLE/.test(G61),
  'G7  a deployment MISSING the guard refuses to generate rather than running unguarded');
// The gate is at the WRITER, not the harvest — a census must still see everything.
ok(!/inventoryAiPlanScopeEnabled_/.test(extractFn(G61, 'weeklyAiPlanEnumerateSites_')),
  'G8  the harvest is NOT gated — a census, a dry run and a readiness report still see every scope');
ok(!/inventoryAiPlanScopeEnabled_/.test(extractFn(G61, 'weeklyAiPlanCanonicalDemand_')),
  'G8a nor is the snapshot read');

// ================================================================================================================
section('§7 — CAPABILITY IS NEGOTIATION, NOT A GATE');
// ================================================================================================================
var applyFn = extractFn(DBAPI, '_kmApplyClientCapabilities_');
ok(/window\.KM\.DB\.applyClientCapabilities\(\);/.test(read('assets/js/app.js')),
  'C1  §12.14 the bootstrap fires it WITHOUT awaiting — the page is never gated on it');
ok(!/await window\.KM\.DB\.applyClientCapabilities/.test(read('assets/js/app.js')),
  'C1a there is no await anywhere on that call');
ok(/caps null → fail-safe defaults applied|caps null/.test(applyFn), 'C2  a failure applies FAIL-SAFE defaults');
ok(/_kmCapAppliedSeq_ > mySeq/.test(applyFn), 'C3  §12.17 a LATE answer is compared against what is already applied');
ok(/late failure[\s\S]{0,120}DISCARDED/.test(applyFn),
  'C3a and a late FAILURE is discarded when a newer backend answer is already applied');
ok(/_kmCapAppliedFromBackend_/.test(applyFn),
  'C3b the asymmetry is explicit: a newer success always wins, a failure only fills a vacuum');
ok(/issuedIdentity !== nowIdentity/.test(applyFn),
  'C4  §12.18 an answer that spans a DEPLOYMENT CHANGE is discarded, not applied to the new build');
ok(/__kmDeploymentIdentity/.test(DBAPI), 'C4a and the deployment identity is published where it is established');
ok(/if \(!d\) return null;/.test(extractFn(DBAPI, '_kmCapDeploymentIdentity_')),
  'C4b an UNKNOWN identity is null, so it never compares equal to a known one');
ok(!/setTimeout|retry|attempt\s*\+\+/i.test(ops(applyFn)), 'C5  §12.19 no blind retry was added');
ok(!/45000|60000|timeoutMs\s*=/.test(ops(applyFn)), 'C5a and no timeout was raised');
// §12.15/16/20 — the transport's own redirect discipline, which already held.
ok(/A REDIRECT RESPONSE URL IS NEVER PROMOTED/.test(TRANSPORT), 'C6  §12.16 a redirect URL is never promoted to authority');
ok(/script\\\.googleusercontent\\\.com\$\/i\.test\(host\)/.test(TRANSPORT) || /googleusercontent/.test(TRANSPORT),
  'C6a the googleusercontent echo host is recognised and rejected');
ok(/<redacted>/.test(TRANSPORT), 'C7  §12.20 the user_content_key is redacted in diagnostics');
ok(/getEndpointClassification/.test(DBAPI) && /API_ENDPOINT_CONFIGURATION_INVALID/.test(DBAPI),
  'C8  §12.15 a non-/exec endpoint is refused LOCALLY, before any request');
// Capability is not the inventory read's authority.
ok(!/getClientCapabilities/.test(ops(extractFn(read('assets/js/pages/inventory-replenishment.js'), '_irWorkspaceRefresh_'))),
  'C9  the inventory read does not consult capabilities — a capability failure cannot block it');

// ================================================================================================================
section('§6/§13 — the bundle, and the duplicate global that was emitted silently');
// ================================================================================================================
// RESTATED (F1-7N-FC-1B-E3-R4-A2-R1-R1): the ELEVENTH round to pin its own literal as "the current one", and
// mine again. A2-R1-R1 added canonicalDate to this module and moved its version, which is exactly what a
// version is FOR. The durable claim is that the module identifies itself and belongs to this line — not that
// the string never changes.
ok(/^f1-7n-fc-1b-e3-r4-a2-r1[a-z0-9-]*-snapshot-freshness$/.test(KMSNF._version),
  'B1  the freshness module declares a version on this line (' + KMSNF._version + ')');
eq(typeof KMSNF.assess, 'function', 'B1a and still exposes the freshness verdict');
ok(BUNDLE.indexOf(KMSNF._version) !== -1, 'B1a and the bundle was rebuilt at exactly it');
ok(/var KMSNF = __kmModules/.test(BUNDLE), 'B2  it is exposed as KMSNF...');
ok(/var KMSF = __kmModules\["supply-planning-source-facts"\]/.test(BUNDLE),
  'B2a ...and KMSF still belongs to supply-planning-source-facts, which it has owned all along');
eq((BUNDLE.match(/^var KMSF = __kmModules/gm) || []).length, 1, 'B2b declared exactly ONCE');
ok(/DUPLICATE_BUNDLE_GLOBAL/.test(BUILDER),
  'B3  the builder now REFUSES a duplicate global — this round emitted one and nothing objected');
(function dupGuard() {
  // Execute the guard rather than describing it.
  var globals = [['KMA', 'mod-a'], ['KMB', 'mod-b'], ['KMA', 'mod-c']];
  var seen = {}, threw = null;
  try {
    globals.forEach(function (g) {
      if (seen[g[0]]) throw new Error('DUPLICATE_BUNDLE_GLOBAL: ' + g[0]);
      seen[g[0]] = g[1];
    });
  } catch (e) { threw = e.message; }
  ok(/DUPLICATE_BUNDLE_GLOBAL: KMA/.test(threw || ''), 'B3a and the check it performs does catch one');
})();

// ================================================================================================================
section('§5 — THE CENSUS: schedule in the headline, and it never STOPs merely for being early');
// ================================================================================================================
var wrap = extractFn(TEMP, 'RUN_E3_CENSUS_RESUS_US_AMAZON_CO1100R');
['server_business_time', 'gap_schedule', 'gap_job_state', 'planning_cycle', 'read_only', 'flag_effective',
 'activation_allowlist', 'scope_in_allowlist', 'db_writes', 'writer_constructed'].forEach(function (f, i) {
  ok(wrap.indexOf("'" + f + "'") !== -1, 'E1.' + (i + 1) + ' the headline prints ' + f);
});
['freshness_state', 'accepted_snapshot_date', 'accepted_snapshot_run', 'snapshot_distinct_dates',
 'forecast_normalization'].forEach(function (f, i) {
  ok(wrap.indexOf("'" + f + "'") !== -1, 'E2.' + (i + 1) + ' and the result reports ' + f);
});
ok(wrap.indexOf("CENSUS_log_('scope'") < wrap.indexOf('TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3({'),
  'E3  the headline is printed BEFORE any read');
ok(/FIXED_SCOPE_ALTERED/.test(wrap), 'E4  and it still stops before harvest on an altered scope');
ok(!/(appendRow|setValue|setValues)/.test(ops(wrap)), 'E5  §12.41 the wrapper writes nothing');
ok(/KMSNF/.test(TEMP), 'E6  the census reads the SAME freshness authority production uses — no second rule set');

// ================================================================================================================
section('§1 — the forecast contract, unchanged');
// ================================================================================================================
var FCN = read('assets/js/core/supply-planning-forecast-normalization.js');
['DEFAULT_ZERO_MISSING_YEAR', 'DEFAULT_ZERO_BLANK_MONTH', 'EXPLICIT_ZERO'].forEach(function (c, i) {
  ok(FCN.indexOf(c) !== -1, 'F1.' + (i + 1) + ' §12.10-12 ' + c + ' still resolves to 0');
});
['REQUEST_TIMEOUT', 'TRANSPORT_FAILURE', 'TABLE_MISSING', 'REQUIRED_HEADER_MISSING',
 'SCOPE_IDENTITY_INCOMPLETE', 'INVALID_NUMERIC_VALUE', 'DUPLICATE_CONFLICTING_ROWS', 'READ_OUTCOME_UNKNOWN']
  .forEach(function (c, i) { ok(FCN.indexOf(c) !== -1, 'F2.' + (i + 1) + ' §12.13 ' + c + ' still BLOCKS'); });
ok(/KMFCN\.normalizeWindow/.test(G61), 'F3  and 61_ still reads the forecast through it');

// ================================================================================================================
section('§A — deployment identity');
// ================================================================================================================
var wap = (G61.match(/WAP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var sys = (HLTH.match(/SYS_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var cfgB = (CFG.match(/CONFIG_BUILD_VERSION_ = '([^']+)'/) || [])[1];
[['61_api_v1_weekly_ai_plan.gs', wap], ['63_api_v1_system_health.gs', sys],
 ['00_config.gs', cfgB]].forEach(function (pair, i) {
  var exp = (HLTH.match(new RegExp("\\{ file: '" + pair[0].replace(/\./g, '\\.') + "',[^}]*expected: '([^']+)'")) || [])[1];
  eq(pair[1], exp, 'A1.' + (i + 1) + ' ' + pair[0] + ' declares exactly what its manifest expects (' + pair[1] + ')');
});
ok(RO.stampAtOrAfter(wap, 'F1-7N-FC-1B-E3-R4-A1'), 'A2  61_ moved this round, because its freshness rule changed');
ok(RO.BUILD_STAMP_RE.test('F1-7N-FC-1B-E3-R4-A2-R1'), 'A2a and the shared stamp validator accepts the stamp');

// ================================================================================================================
section('§K — release identity');
// ================================================================================================================
eq(RO.currentAppToken(), 'fc1be3r4a2r1-schedaware-20260904', 'K1  this round mints a NEW application token');
ok(RO.tokenIndex(RO.currentAppToken()) > RO.tokenIndex('fc1be3r4a1-livecontract-20260904'),
  'K1a strictly after R4-A1\'s, which was PUBLISHED (origin/main carries 6266169)');
eq(RO.staleAppTokenRefs(INDEX).join(' | '), '', 'K2  nothing is left behind on a superseded token');
var IX = RO.parseIndexTokens(INDEX);
eq(IX['assets/js/api/operation-system-db-api.js'], RO.currentAppToken(),
  'K3  the db-api carries it — a cached copy still lets a late failure overwrite a later success');
ok(RO.stampAtOrAfter('F1-7N-FC-1B-E3-R4-A2-R1', 'F1-7N-FC-1B-E3-R4-A1'), 'K4  the owner stamp is recorded, after R4-A1\'s');

// ================================================================================================================
section('§H — the boundary this round must not have crossed');
// ================================================================================================================
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false/.test(CFG), 'H1  the AI Plan flag is still FALSE');
ok(/TEMP_FCROLL_DRY_RUN\s*=\s*true/.test(read('assets/tools/apps-script-diagnostics/TEMP_FC_REGULAR_FORECAST_YEAR_ROLLOVER_2027.gs')),
  'H2  §12.10 the rollover runner is still DRY_RUN');
['weeklyAiPlanCanonicalDemand_', 'weeklyAiPlanGapSchedule_', 'weeklyAiPlanGapJobState_'].forEach(function (fn, i) {
  ok(!/(appendRow|setValue|setValues|deleteRow|insertRow)/.test(ops(extractFn(G61, fn))),
    'H3.' + (i + 1) + ' ' + fn + ' writes nothing');
});
ok(!/(appendRow|setValue|setValues)/.test(ops(read('assets/js/core/supply-planning-snapshot-freshness.js'))),
  'H4  and the freshness module is pure');
ok(!/manual.?refresh|forceRefresh|triggerGapJob/i.test(ops(extractFn(G61, 'weeklyAiPlanCanonicalDemand_'))),
  'H5  no manual refresh was introduced — being early is not something to fix by starting the job');

// ================================================================================================================
section('MUTATIONS');
// ================================================================================================================
var KMSNF_SRC = read('assets/js/core/supply-planning-snapshot-freshness.js');
function loadKmsnf(src) {
  var m = { exports: {} };
  new Function('module', 'globalThis', src)(m, {});
  return m.exports;
}
mut('N1  date equality becomes the freshness rule again (the R4 defect)', function () {
  var m = swap(KMSNF_SRC, "    if (now.minuteOfDay < startMin) {", "    if (false) {");
  m = swap(m, "    if (now.minuteOfDay < overdueMin) {", "    if (false) {");
  var K = loadKmsnf(m);
  return K.assess({ nowMs: at('2026-09-04', '10:41'), utcOffsetMinutes: TZ, schedule: SCH,
    expectedPlanningCycle: 'RECO-2026-09', snapshotDates: [snap('2026-09-03')] }).state === 'REFRESH_OVERDUE';
});
mut('N2  the pre-schedule window is removed, so yesterday is rejected all morning', function () {
  var m = swap(KMSNF_SRC, "    if (now.minuteOfDay < startMin) {", "    if (false) {");
  var K = loadKmsnf(m);
  return K.assess({ nowMs: at('2026-09-04', '02:00'), utcOffsetMinutes: TZ, schedule: SCH,
    expectedPlanningCycle: 'RECO-2026-09', snapshotDates: [snap('2026-09-03')] }).state !== 'CURRENT_PRE_SCHEDULE';
});
mut('N3  a MIXED snapshot is accepted', function () {
  var m = swap(KMSNF_SRC, "    if (out.detail.distinctDates.length > 1) {", "    if (false) {");
  var K = loadKmsnf(m);
  return K.assess({ nowMs: at('2026-09-04', '10:41'), utcOffsetMinutes: TZ, schedule: SCH,
    expectedPlanningCycle: 'RECO-2026-09', snapshotDates: [snap('2026-09-03'), snap('2026-09-04')] }).ok === true;
});
mut('N4  a PARTIAL run is adopted because the consistency check runs AFTER the clock', function () {
  // Move the mixed-date guard behind the schedule branches: pre-schedule would then accept a mid-write scope.
  var m = swap(KMSNF_SRC, "    if (out.detail.distinctDates.length > 1) {", "    if (out.detail.distinctDates.length > 99) {");
  var K = loadKmsnf(m);
  var r = K.assess({ nowMs: at('2026-09-04', '02:00'), utcOffsetMinutes: TZ, schedule: SCH,
    expectedPlanningCycle: 'RECO-2026-09', snapshotDates: [snap('2026-09-03'), snap('2026-09-04')] });
  return r.ok === true;
});
mut('N5  today\'s FAILED run no longer blocks the previous snapshot', function () {
  var m = swap(KMSNF_SRC, "    if (jobFailed && jobStartedToday) {", "    if (false) {");
  var K = loadKmsnf(m);
  return K.assess({ nowMs: at('2026-09-04', '10:41'), utcOffsetMinutes: TZ, schedule: SCH,
    expectedPlanningCycle: 'RECO-2026-09', snapshotDates: [snap('2026-09-03')],
    jobState: { status: 'FAILED', startedAtDate: '2026-09-04' } }).ok === true;
});
mut('N6  the overdue window is removed, so a failed day silently keeps yesterday forever', function () {
  var m = swap(KMSNF_SRC, "    out.state = STATES.REFRESH_OVERDUE;", "    out.state = STATES.CURRENT_DURING_REFRESH; out.ok = true; out.acceptedDate = only.date;");
  var K = loadKmsnf(m);
  return K.assess({ nowMs: at('2026-09-04', '23:59'), utcOffsetMinutes: TZ, schedule: SCH,
    expectedPlanningCycle: 'RECO-2026-09', snapshotDates: [snap('2026-09-03')] }).ok === true;
});
mut('N7  the module reads its own clock instead of being given one', function () {
  var m = swap(KMSNF_SRC, "    if (!isInt(input.nowMs)) {", "    if (false) { input.nowMs = Date.now();");
  return /!isInt\(input\.nowMs\)/.test(KMSNF_SRC) && !/!isInt\(input\.nowMs\)/.test(m);
});
mut('N8  a stale-lineage snapshot from another cycle is accepted', function () {
  var m = swap(KMSNF_SRC, "    if (wantCycle && haveCycle && wantCycle !== haveCycle) {", "    if (false) {");
  var K = loadKmsnf(m);
  return K.assess({ nowMs: at('2026-09-04', '10:41'), utcOffsetMinutes: TZ, schedule: SCH,
    expectedPlanningCycle: 'RECO-2026-09', snapshotDates: [snap('2026-08-20')] }).ok === true;
});
mut('N9  the scope allowlist can be widened from a request', function () {
  var m = swap(CFG, "  if (!c || !k || !m || !s) return false;", "  if (!c || !k || !m || !s) return true;");
  var c2 = vm.createContext({ String: String, RegExp: RegExp, console: console });
  vm.runInContext(m, c2, { filename: '00m' });
  return vm.runInContext('inventoryAiPlanScopeEnabled_', c2)('', '', '', '') === true;
});
mut('N10 ALL_SITES becomes reachable through the allowlist', function () {
  var m = swap(CFG, "  if (/^all(_sites)?$/i.test(m) || /^all(_sites)?$/i.test(s)) return false;   // ALL_SITES can never be enabled", "");
  return /ALL_SITES can never be enabled/.test(CFG) && !/ALL_SITES can never be enabled/.test(m);
});
mut('N11 the writer gate is removed, so flag=true writes every scope', function () {
  var m = swap(G61, "  if (flagTrue) {", "  if (false) {");
  return /if \(flagTrue\) \{[\s\S]{0,200}_gateOn/.test(G61) && !/if \(flagTrue\) \{[\s\S]{0,200}_gateOn/.test(m);
});
mut('N12 a deployment MISSING the guard generates unguarded instead of refusing', function () {
  var m = swap(G61, "    if (!_gateOn) {", "    if (false) {");
  return /if \(!_gateOn\) \{/.test(G61) && !/if \(!_gateOn\) \{/.test(m);
});
mut('N13 a late capability failure overwrites a later success again', function () {
  var m = swap(DBAPI, "    if (!caps && _kmCapAppliedFromBackend_ && _kmCapAppliedSeq_ > mySeq) {", "    if (false) {");
  return /!caps && _kmCapAppliedFromBackend_ && _kmCapAppliedSeq_ > mySeq/.test(DBAPI)
    && !/!caps && _kmCapAppliedFromBackend_ && _kmCapAppliedSeq_ > mySeq/.test(m);
});
mut('N14 a capability answer spanning a deployment change is applied to the new build', function () {
  var m = swap(DBAPI, "    if (issuedIdentity !== null && nowIdentity !== null && issuedIdentity !== nowIdentity) {", "    if (false) {");
  return /issuedIdentity !== nowIdentity/.test(DBAPI) && !/issuedIdentity !== nowIdentity/.test(m);
});
mut('N15 the AI Plan flag is turned on', function () {
  var m = swap(CFG, 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false', 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true');
  return /ENABLED_ = false/.test(CFG) && /ENABLED_ = true/.test(m);
});
mut('N16 the rollover migration is armed', function () {
  var R = read('assets/tools/apps-script-diagnostics/TEMP_FC_REGULAR_FORECAST_YEAR_ROLLOVER_2027.gs');
  var m = swap(R, 'TEMP_FCROLL_DRY_RUN = true', 'TEMP_FCROLL_DRY_RUN = false');
  return /DRY_RUN = true/.test(R) && /DRY_RUN = false/.test(m);
});
mut('N17 the census loses the schedule from its headline', function () {
  var m = swap(TEMP, "  CENSUS_log_('gap_schedule', sched);", "");
  return /CENSUS_log_\('gap_schedule'/.test(TEMP) && !/CENSUS_log_\('gap_schedule'/.test(m);
});
mut('N18 an asset is left behind on a superseded token', function () {
  var m = swap(INDEX, 'operation-system-db-api.js?v=' + RO.currentAppToken(),
    'operation-system-db-api.js?v=fc1be3r4a1-livecontract-20260904');
  return RO.staleAppTokenRefs(INDEX).length === 0 && RO.staleAppTokenRefs(m).length > 0;
});

console.log('\n----------------------------------------');
console.log('SCHEDULE-AWARE SNAPSHOT + SCOPE GUARD (F1-7N-FC-1B-E3-R4-A2-R1): ' + pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
process.exit(fail ? 1 : 0);
