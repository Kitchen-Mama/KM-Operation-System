// Kitchen Mama Operation System — R5A-P0 live AI Plan planning-cycle boundary — F1-7N-FA-3C-DRAFT-MODEL-R5A.
// Run: node assets/tests/request-order-ai-plan-cycle-boundary-f1-7n-fa-3c-r5a.test.js
// Reproduces the live P0 with REAL production functions and proves the two owning-boundary fixes:
//   (A) batch cycle transport — 48_ enumerateEligible must NOT r4e2Str_(Date); it normalizes via
//       recGenProjectCalendarMonth_ → canonical 2026-08 (a stringified Date threaded as opts.planningCycle is the
//       exact cause of PLANNING_CYCLE_INVALID: 99, even with correct R4C 47_).
//   (B) flat readback — a BLANK planningCycle (the frontend sends none) is a scope-level readback, NOT an error; a
//       NON-blank malformed cycle is still rejected; persistence (loadActiveFlat) stays strict.

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS47 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '47_api_v1_recommendation_generation.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS48 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '48_api_v1_request_order_draft_job.gs'), 'utf8').replace(/\r\n/g, '\n');
var AUG1_TAIPEI = new Date('2026-07-31T16:00:00.000Z');   // 2026-08-01 00:00 Asia/Taipei

function fmt(d, tz, f) { var off = (tz === 'Asia/Taipei') ? 8 : 0; var t = new Date(d.getTime() + off * 3600000); return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2); }
var sb = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; } }; } }, Utilities: { formatDate: fmt }, Logger: { log: function () {} }, console: console };
vm.createContext(sb); vm.runInContext(GS47, sb, { filename: '47_.gs' });

function readyGapRow(sku, calcMonth) { return { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: sku, calculation_status: 'READY', calculated_at: '2026-08-01', calculation_month: calcMonth, t1_month: '2026-08', t2_month: '2026-09', t3_month: '2026-10', t1_suggested_qty: 100, t2_suggested_qty: 50, t3_suggested_qty: 0, t1_gap_qty: 100, t2_gap_qty: 50, t3_gap_qty: 0 }; }
var scope = { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP5120-R' };

// ==========================================================================
section('A. REPRODUCE the live failure: a stringified Date threaded as opts.planningCycle → PLANNING_CYCLE_INVALID');
var stringifiedDate = sb.r4e2Str_(AUG1_TAIPEI);   // exactly what the OLD 48_ enumerateEligible produced (r4e2Str_(Date))
ok(!/^\d{4}-\d{1,2}$/.test(stringifiedDate), 'r4e2Str_(Date) is a localized Date string, not YYYY-MM: ' + JSON.stringify(stringifiedDate));
var repro = sb.recGenBuildGapDraftBody_(scope, readyGapRow('SP5120-R', AUG1_TAIPEI), 10, { planningCycle: stringifiedDate });
eq([repro.ok, repro.reason], [false, 'PLANNING_CYCLE_INVALID'], 'stringified-Date opts.planningCycle → recGenBuildGapDraftBody_ rejects (reproduces the 99-not-ready cause, even with R4C 47_)');

section('A. FIX: 48_ normalizes the gap Date to canonical 2026-08 via recGenProjectCalendarMonth_ (never r4e2Str_)');
var canon = sb.recGenProjectCalendarMonth_(AUG1_TAIPEI, 'Asia/Taipei');
eq([canon.ok, canon.cycle], [true, '2026-08'], 'recGenProjectCalendarMonth_(Date, Asia/Taipei) → 2026-08 (the value 48_ now threads)');
ok(canon.cycle !== '2026-07', 'never the UTC-July slice');
var fixed = sb.recGenBuildGapDraftBody_(scope, readyGapRow('SP5120-R', AUG1_TAIPEI), 10, { planningCycle: '2026-08' });
eq([fixed.ok, fixed.body.planningCycle], [true, '2026-08'], 'canonical opts.planningCycle → generation body carries 2026-08 (writer receives 2026-08)');
var noCycle = sb.recGenBuildGapDraftBody_(scope, readyGapRow('SP5120-R', AUG1_TAIPEI), 10, {});
eq([noCycle.ok, noCycle.body.planningCycle], [true, '2026-08'], 'empty opts.planningCycle → per-SKU gap Date fallback also → 2026-08');
// 99 valid rows are NOT all rejected: three distinct gap rows each normalize to 2026-08 (no global-value dependence)
['A-SKU', 'B-SKU', 'C-SKU'].forEach(function (s) { var b = sb.recGenBuildGapDraftBody_({ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: s }, readyGapRow(s, AUG1_TAIPEI), 10, { planningCycle: '2026-08' }); ok(b.ok && b.body.planningCycle === '2026-08', 'valid row ' + s + ' processes to 2026-08 (not rejected)'); });

section('A. SOURCE: 48_ enumerateEligible uses recGenProjectCalendarMonth_ and does NOT r4e2Str_ the calculation_month cycle');
ok(/recGenProjectCalendarMonth_\(eligible\[0\]\.row\.calculation_month/.test(GS48), '48_ normalizes calculation_month via recGenProjectCalendarMonth_');
ok(!/planningCycle:\s*eligible\.length\s*\?\s*r4e2Str_\(eligible\[0\]\.row\.calculation_month\)/.test(GS48), '48_ no longer r4e2Str_-stringifies the gap Date into the cycle');

// ==========================================================================
section('B. FLAT READBACK: a BLANK cycle is a scope-level readback (frontend sends none), NOT INVALID_PLANNING_CYCLE');
var HDR = KMRDV2P.HEADER_TABLE;
function flatRow(id, sku, status, cyc) { var o = {}; KMRDV2.V2_HEADERS.forEach(function (h) { o[h] = ''; }); o.request_allocation_draft_id = id; o.planning_cycle = cyc; o.company = 'ResUS'; o.country = 'US'; o.marketplace = 'Amazon'; o.sku = sku; o.draft_purpose = 'regular'; o.status = status; o.draft_version = 1; o.t1_order_qty = 100; o.t1_recommended_qty = 100; o.t1_status = 'draft'; return KMRDV2.V2_HEADERS.map(function (h) { return o[h]; }); }
var flatRows = [flatRow('RAD-72ABD506-3', 'CO5600-R', 'draft', '2026-08'), flatRow('RAD-17DC0322-0', 'CO5600-W', 'draft', '2026-08'), flatRow('RD-SP', 'SP5120-R', 'draft', '2026-08'), flatRow('RAD-KMW', 'CO1200-O', 'submitted', '2026-08')];
sb.rprBuildSheetSet_ = function () { var set = {}; set[HDR] = { headers: KMRDV2.V2_HEADERS.slice(), rows: flatRows }; return { set: set }; };
var scope3 = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var rbBlank = sb.recGenFlatReadback_({}, scope3, '', '');   // no sku, no cycle — the exact frontend getActive shape
eq(rbBlank.success, true, 'blank-cycle scope readback → success:true (NOT INVALID_PLANNING_CYCLE)');
eq(rbBlank.data.status, 'SCOPE_READBACK', 'blank-cycle → SCOPE_READBACK');
eq(rbBlank.data.total, 3, 'returns the 3 ACTIVE ResUS/US/Amazon drafts (submitted excluded from active total)');
ok(rbBlank.data.drafts.every(function (d) { return d.planningCycle === '2026-08'; }), 'readback drafts carry canonical 2026-08 (string, camelCase DTO)');

section('B. malformed NON-blank cycle stays fail-closed; canonical cycle works; one-SKU works');
var rbBad = sb.recGenFlatReadback_({}, scope3, '', 'RECO-2026-08');
eq([rbBad.success, rbBad.error], [false, 'INVALID_PLANNING_CYCLE'], 'a NON-blank malformed cycle (RECO-2026-08) is still rejected');
var rbCanon = sb.recGenFlatReadback_({}, scope3, '', '2026-08');
eq([rbCanon.success, rbCanon.data.total], [true, 3], 'canonical 2026-08 → 3 active drafts');
var rbOne = sb.recGenFlatReadback_({}, scope3, 'CO5600-R', '');
eq([rbOne.success, rbOne.data.status], [true, 'ACTIVE_DRAFT_FOUND'], 'one-SKU + blank cycle → ACTIVE_DRAFT_FOUND');

// ==========================================================================
section('C. CORE: read path tolerates blank cycle; WRITE path (loadActiveFlat) stays strict + reuses, no duplicate');
function set1(rows) { var s = {}; s[HDR] = { headers: KMRDV2.V2_HEADERS.slice(), rows: rows }; return s; }
var coreSet = set1(flatRows);
// readActiveFlatForScope: blank cycle → all active for scope (no throw); malformed → throws; canonical → filtered
eq(KMRDV2P.readActiveFlatForScope(coreSet, { planningCycle: '', businessScope: scope3 }).length, 3, 'readActiveFlatForScope blank cycle → 3 active (no throw)');
eq(KMRDV2P.readActiveFlatForScope(coreSet, { planningCycle: '2026-08', businessScope: scope3 }).length, 3, 'readActiveFlatForScope 2026-08 → 3');
eq(KMRDV2P.readActiveFlatForScope(coreSet, { planningCycle: '2026-09', businessScope: scope3 }).length, 0, 'readActiveFlatForScope 2026-09 → 0 (cycle filter still applies when supplied)');
var threw = false; try { KMRDV2P.readActiveFlatForScope(coreSet, { planningCycle: 'RECO-2026-08', businessScope: scope3 }); } catch (e) { threw = /INVALID_PLANNING_CYCLE/.test(e.message); }
ok(threw, 'readActiveFlatForScope a malformed NON-blank cycle still throws (caller reports INVALID)');
// WRITE path unchanged: loadActiveFlat requires an exact cycle and reuses the one active row; a duplicate → BLOCKED_CONFLICT
var reuse = KMRDV2P.loadActiveFlat(coreSet, { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-08', businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO5600-R', draft_purpose: 'regular' } });
eq(reuse.status, 'REUSE', 'loadActiveFlat exact scope+cycle → REUSE (six-active reuse preserved)');
var wrongCycle = KMRDV2P.loadActiveFlat(coreSet, { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-09', businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO5600-R', draft_purpose: 'regular' } });
eq(wrongCycle.status, 'CREATE', 'loadActiveFlat still exact on cycle (2026-09 ≠ 2026-08 → CREATE, no false reuse)');
var dup = set1(flatRows.concat([flatRow('RAD-DUP', 'CO5600-R', 'draft', '2026-08')]));
eq(KMRDV2P.loadActiveFlat(dup, { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-08', businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO5600-R', draft_purpose: 'regular' } }).status, 'BLOCKED_CONFLICT', 'duplicate complete active scope → BLOCKED_CONFLICT (no silent dup)');

section('C. no Draft-Line dependency: readback + core read the flat header table ONLY');
ok(!/request_order_allocation_draft_lines/.test(GS47.split('function recGenFlatReadback_')[1].split('\nfunction ')[0]), 'recGenFlatReadback_ never references the Draft-Line table');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R5A AI PLAN CYCLE BOUNDARY (F1-7N-FA-3C-R5A): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
