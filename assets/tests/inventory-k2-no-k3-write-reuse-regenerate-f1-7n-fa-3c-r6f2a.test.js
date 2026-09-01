// R6F2A — no-new-K3-write boundary + REUSE/REGENERATE/CONFLICT + user-edit ownership + dry-assembly preflight + freeze.
// F1-7N-FA-3C-DRAFT-MODEL-R6F2A. Run: node assets/tests/inventory-k2-no-k3-write-reuse-regenerate-f1-7n-fa-3c-r6f2a.test.js
var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6F2A NO-K3 + REUSE/REGEN + OWNERSHIP + DRY-PREFLIGHT: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extractFn(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing fn ' + name); var i = src.indexOf('{', s), d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
var G16 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '16_shipping_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var G61 = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', '61_api_v1_weekly_ai_plan.gs'), 'utf8').replace(/\r\n/g, '\n');
var TEMP = fs.readFileSync(path.join(ROOT, 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');

// bring the pure 16_ helpers into scope
// F1-7N-FB-4C — the shipped guards now read the named terminal-status sets (which gained `expired`), so
// the eval list has to carry them. No assertion below changes.
eval(G16.match(/var SAD_STATUSES_ = \{[\s\S]*?\};/)[0]);
eval(G16.match(/var SAD_TERMINAL_STATUSES_ = \{[\s\S]*?\};/)[0]);
eval(G16.match(/var SAD_TERMINAL_LINE_STATUSES_ = \{[\s\S]*?\};/)[0]);
eval(G16.match(/var SAD_RECOMMENDATION_FIELDS_ = \[[\s\S]*?\];/)[0]);
eval(G16.match(/var SAD_K2_HEADER_FP_ = \[[\s\S]*?\];/)[0]);
eval(G16.match(/var SAD_K2_LINE_FP_ = \[[\s\S]*?\];/)[0]);
eval(['sadFnv1a_', 'sadK2GroupKey_', 'sadK2DeterministicHeaderId_', 'sadK2ResolveActiveDraft_', 'sadHeaderRouteIsComplete_',
  'sadReadActiveHeaderRows_', 'sadResolveActiveDraft_', 'sadResolveActiveDraftK2OrK3_', 'sadRowToObject_', 'sadLegacyReconcileReason_',
  'sadFpVal_', 'sadK2PayloadFingerprint_', 'sadRegenerateLinePatch_']
  .map(function (n) { return extractFn(G16, n); }).join('\n'));

var HDR = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no'];
function sheet(rows) { var data = [HDR].concat(rows.map(function (o) { return HDR.map(function (h) { return o[h] == null ? '' : o[h]; }); })); return { getDataRange: function () { return { getValues: function () { return data; } }; }, getLastColumn: function () { return HDR.length; }, getRange: function (r, c, nr, nc) { return { getValues: function () { return [data[r - 1]]; } }; } }; }

// ============================================================ A — NO NEW K3 WRITES
section('A. route-incomplete new Draft never creates K3');
var routeComplete = { planning_cycle: 'C', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv', recommended_source_warehouse_id: 'WH-CN', recommended_destination_warehouse_id: 'WH-US', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1' };
var routeIncomplete = { planning_cycle: 'C', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv' };
eq(sadResolveActiveDraftK2OrK3_(sheet([]), routeComplete).status, 'CREATE', 'A1. route-complete + no active → K2 CREATE');
eq(sadResolveActiveDraftK2OrK3_(sheet([]), routeIncomplete).status, 'BLOCK', 'A2. route-incomplete + no active → BLOCK (never K3 CREATE)');
eq(sadResolveActiveDraftK2OrK3_(sheet([]), routeIncomplete).reason, 'ROUTE_INCOMPLETE_NEW_DRAFT', 'A2. typed reason ROUTE_INCOMPLETE_NEW_DRAFT');
// existing active K3-scope row + route-incomplete request → LEGACY_ROUTE_RECONCILIATION_REQUIRED
var legacyRow = { allocation_draft_id: 'LEG1', status: 'draft', planning_cycle: 'C', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv' };
var legRes = sadResolveActiveDraftK2OrK3_(sheet([legacyRow]), routeIncomplete);
eq([legRes.status, legRes.reason], ['BLOCK', 'LEGACY_ROUTE_RECONCILIATION_REQUIRED'], 'A3. route-incomplete matching an existing legacy row → LEGACY_ROUTE_RECONCILIATION_REQUIRED');
eq(sadResolveActiveDraftK2OrK3_(sheet([legacyRow]), routeIncomplete, { allowLegacyReconcile: true }).status, 'REUSE', 'A4. explicit USER migration (allowLegacyReconcile) → REUSE the legacy row');
// sadLegacyReconcileReason_ for an existing route-incomplete row by explicit id
eq(sadLegacyReconcileReason_(sheet([legacyRow]), { row: 2, col: function () { return 0; } }, false), 'LEGACY_ROUTE_RECONCILIATION_REQUIRED', 'A5. editing an existing route-incomplete row is fail-closed');
eq(sadLegacyReconcileReason_(sheet([{ allocation_draft_id: 'X', status: 'draft', planning_cycle: 'C', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv', recommended_source_warehouse_id: 'WH-CN', recommended_destination_warehouse_id: 'WH-US', recommended_shipping_method: 'SEA' }]), { row: 2, col: function () { return 0; } }, false), '', 'A5. a route-complete existing row edits normally');

section('A. cores handle BLOCK + legacy guard; K3 callers classified');
var atomicCore = extractFn(G16, 'sadAtomicUpsertCore_');
// F1-7N-FB-4F-B3 - the atomic core used to choose between exactly two sentences with an inline ternary, so the
// reason literal lived in the core itself. B3 adds a third BLOCK reason, and a third case in a two-way ternary
// would have been described as the second one - a new failure wearing an old failure's explanation. The message
// moved into sadResolveBlockMessage_, so the assertion follows it: the core still fails closed on BLOCK, and
// the reason still has words of its own.
ok(/res\.status === 'BLOCK'/.test(atomicCore), 'A6. atomic core fails closed on BLOCK');
ok(/sadResolveBlockMessage_\(res\.reason\)/.test(atomicCore), 'A6. and reports the reason\'s own message');
ok(/ROUTE_INCOMPLETE_NEW_DRAFT/.test(extractFn(G16, 'sadResolveBlockMessage_')),
  'A6. route-incomplete new draft still has its own words');
// F1-7N-FB-4A §D — STRICTLY STRONGER: both cores must hand the guard the REQUEST HEADER. Without it the guard can
// only ask "does this row's id still hash to itself?", which the writer's own permitted route edit makes false and
// which then bricks the row forever. The 3-argument form is exactly the defect, so it is now a FAILING shape.
ok(/sadLegacyReconcileReason_\(hSh, found, allowReconcile, header \|\| null\)/.test(atomicCore),
  'A6. atomic core applies the legacy-reconcile guard WITH the request header');
var manualCore = extractFn(G16, 'sadUpsertDraftHeaderCore_');
ok(/res\.status === 'BLOCK'/.test(manualCore) && /sadLegacyReconcileReason_\(sh, found, allowReconcile, body \|\| null\)/.test(manualCore),
  'A7. manual core fails closed on BLOCK + applies the legacy guard WITH the request header');
// the two remaining direct K3 callers are read-only / existing-row-only (never CREATE)
ok(/function handleGetShippingAllocationDraftWorkspace_[\s\S]*?sadResolveActiveDraft_/.test(G16), 'A8. readback caller = READ_ONLY_COMPATIBILITY');
ok(/function handleCancelShippingAllocationDraft_[\s\S]*?sadResolveActiveDraft_/.test(G16), 'A8. cancel caller = EXISTING_ROW_ONLY (soft-cancel; never CREATE)');

// ============================================================ B — REUSE / REGENERATE
section('B. payload fingerprint (REUSE=equal / REGENERATE=changed)');
var hA = { status: 'draft', recommended_source_warehouse_id: 'WH-CN', recommended_destination_warehouse_id: 'WH-US', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA', recommendation_group_no: '1' };
var lA = [{ sku: 'A', site_sku: 'A-US', window_code: 'W1', recommended_qty: 10, planned_qty: 10, source_warehouse_id: 'WH-CN' }];
var fp1 = sadK2PayloadFingerprint_(hA, lA);
ok(/^k2fp-[0-9A-F]{8}$/.test(fp1), 'B1. fingerprint shape');
eq(fp1, sadK2PayloadFingerprint_(JSON.parse(JSON.stringify(hA)), JSON.parse(JSON.stringify(lA))), 'B1. equal payload → equal fingerprint (REUSE)');
var lA2 = [{ sku: 'A', site_sku: 'A-US', window_code: 'W1', recommended_qty: 25, planned_qty: 25, source_warehouse_id: 'WH-CN' }];
ok(fp1 !== sadK2PayloadFingerprint_(hA, lA2), 'B1. changed recommended_qty → different fingerprint (REGENERATE)');
// fingerprint ignores server ids / audit / draft_version
var lAaudit = [{ sku: 'A', site_sku: 'A-US', window_code: 'W1', recommended_qty: 10, planned_qty: 10, source_warehouse_id: 'WH-CN', allocation_draft_line_id: 'SADL-XYZ', created_at: 'x', updated_at: 'y' }];
eq(sadK2PayloadFingerprint_(hA, lAaudit), fp1, 'B1. fingerprint excludes ids/audit (draft_version not in it)');
ok(/outcome = 'REGENERATE'/.test(atomicCore) && /nextVersion = String\(\(parseInt\(priorVersion, 10\) \|\| 1\) \+ 1\)/.test(atomicCore), 'B2. REGENERATE increments draft_version exactly once');
ok(/priorFp === incFp[\s\S]{0,200}outcome: 'REUSED'[\s\S]{0,80}zero_write: true/.test(atomicCore), 'B2. equal fingerprint → REUSED, zero writes');
ok(/STALE_OPTIMISTIC_TOKEN/.test(atomicCore) && /expected_draft_version/.test(atomicCore), 'B3. stale optimistic token → CONFLICT');
ok(/'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of'/.test(atomicCore), 'B2. REGENERATE adopts new calc evidence');

// ============================================================ C — user-edit ownership
section('C. sadRegenerateLinePatch_ ownership rule');
// non-overridden line (planned == prior recommended, no override_reason) → planned follows new recommendation
var pA = sadRegenerateLinePatch_({ recommended_qty: 10, planned_qty: 10, override_reason: '', note: 'AI note' }, { recommended_qty: 22, note: '' });
eq(pA.planned_qty, '22', 'C1. non-overridden planned_qty follows the new recommended_qty');
eq(pA.recommended_qty, '22', 'C1. recommended_qty (system-owned) adopts the new value');
ok(!('note' in pA), 'C2. note is USER-owned → NOT overwritten by regeneration (never restores an old AI note)');
// overridden via override_reason → planned preserved
var pB = sadRegenerateLinePatch_({ recommended_qty: 10, planned_qty: 10, override_reason: 'USER_EDITED_QTY' }, { recommended_qty: 22 });
ok(!('planned_qty' in pB), 'C3. override_reason nonblank → planned_qty PRESERVED (not touched)');
// overridden via planned != prior recommended → planned preserved
var pC = sadRegenerateLinePatch_({ recommended_qty: 10, planned_qty: 7, override_reason: '' }, { recommended_qty: 22 });
ok(!('planned_qty' in pC), 'C3. planned_qty differs from prior recommended → treated as user-owned, PRESERVED');
ok(/outcome === 'REGENERATE'[\s\S]{0,300}sadRegenerateLinePatch_/.test(atomicCore), 'C4. atomic core applies the ownership patch on REGENERATE (not a blind overwrite)');
ok(/line_status[\s\S]{0,120}(submitted|cancelled|superseded)[\s\S]{0,80}skipped\+\+/.test(atomicCore) || /'submitted', 'cancelled', 'superseded'/.test(atomicCore), 'C5. terminal/cancelled lines are never regenerated (skipped)');

// ============================================================ G — multi-group atomic truthfulness (61_)
section('G. per-group outcome + truthful partial job status');
var genK2 = extractFn(G61, 'weeklyAiPlanGenerateK2_');
ok(/per_group_outcome_counts/.test(genK2) && /job_status/.test(genK2), 'G1. reports per-group outcome counts + a job status');
// F1-7N-FB-4C — STRENGTHENED. The rule "a partial commit is never whole-job success" is unchanged and is still
// asserted below; what was ADDED is the one other legitimate success: a run that successfully computed ZERO
// recommendations. That is a real answer about the world, and §E requires it to still supersede the previous
// plan — so the assertion now pins BOTH halves instead of a single expression that could not express them.
// G2 STRENGTHENED AGAIN by F1-7N-FB-4C-ADDENDUM-MIGRATION §B. The rule "a partial commit is never whole-job
// success" is still the point and is still asserted. What is ADDED is the third legitimate success: a run whose
// every proposed identity was already held by a binding manual Execution Plan wrote nothing and was RIGHT to.
// All three halves are pinned, so no future edit can quietly add a fourth.
ok(/var runSucceeded = zeroResult \|\| allSuppressed \|\| \(anyOk && !anyFail\)/.test(genK2),
  'G2. whole-job success requires every group committed — or a genuine zero-result run — or an all-suppressed run');
ok(/var allSuppressed = \(jobStatus === 'ALL_SUPPRESSED_BY_MANUAL'\)/.test(genK2),
  'G2. all-suppressed is its own classified status, not a silent NO_DEMAND');
ok(/anyFail \? \(anyOk \? 'PARTIAL' : 'FAILED'\) : 'COMPLETED'/.test(genK2),
  'G2. and a partial commit is still neither');
ok(/var zeroResult = \(jobStatus === 'NO_DEMAND'\)/.test(genK2),
  'G2b. and a zero-result run is exactly NO_DEMAND — never ALL_BLOCKED, PARTIAL or FAILED');
ok(/success: runSucceeded/.test(genK2), 'G2c. the envelope reports exactly that decision');
ok(/anyFail = true/.test(genK2) && /'PARTIAL'/.test(genK2), 'G2d. a partial commit is still tracked and reported as PARTIAL');
ok(/anyFail \? \(anyOk \? 'PARTIAL' : 'FAILED'\) : 'COMPLETED'/.test(genK2), 'G2. truthful PARTIAL when only some groups commit');
ok(/atomicity_note/.test(genK2) && /NOT a single all-or-nothing transaction across groups/.test(genK2), 'G3. documents truthful per-group (not cross-group transaction) atomicity');
ok(/REUSED[\s\S]{0,200}deterministic identity[\s\S]{0,80}never duplicates|retry[\s\S]{0,120}REUSEs committed groups/.test(genK2), 'G4. retry reuses committed groups by deterministic identity (no duplicate)');

// ============================================================ D — dry-assembly preflight (source contract)
section('D. PREFLIGHT runs the live dry assembly + scoped verdict; read-only; R6F2A alias + FREEZE present');
var dry = extractFn(TEMP, 'TEMP_r6f2aDryAssembly_');
ok(/KMWRB\.buildWeeklySourceLines/.test(dry) && /weeklyAiPlanK2AllocatedLines_/.test(dry) && /KMWRR\.buildK2GenerationPlan/.test(dry), 'D1. dry assembly runs the REAL chain');
ok(dry.indexOf('handleUpsertShippingAllocationDraftAtomic_') < 0 && dry.indexOf('.setValue(') < 0 && dry.indexOf('appendRow(') < 0, 'D2. dry assembly NEVER writes (no atomic endpoint, no setValue/appendRow)');
ok(/blocked_by_reason/.test(dry) && /fully_routed_lines/.test(dry) && /cost_not_comparable_count/.test(dry) && /over_allocation_count/.test(dry) && /projected_CREATE/.test(dry), 'D3. dry assembly produces the route-coverage + projected CREATE/REUSE/CONFLICT metrics');
// R6F2E1 — the public preflight is a thin quiet-capable delegator; the calculation body lives in the core.
var pre = extractFn(TEMP, 'TEMP_r6f2ePreflightCore_');
ok(/TEMP_r6f2aDryAssembly_\(\)/.test(pre), 'D4. PREFLIGHT calls the dry assembly');
ok(/READY_FOR_SCOPED_CONTROLLED_INVENTORY_AI_PLAN/.test(pre) && /dryGlobalClean/.test(pre), 'D5. scoped READY vs global READY vs HALT (gated on real route coverage)');
ok(/function TEMP_R6F2A_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY\(\)/.test(TEMP), 'D6. R6F2A preflight alias present');
var frz = extractFn(TEMP, 'TEMP_r6f2eFreezeCore_');
ok(frz.indexOf('handleUpsertShippingAllocationDraftAtomic_') < 0 && frz.indexOf('.setValue(') < 0 && /expected_header_id/.test(frz) && /scope_checksum/.test(frz) && /expected_line_ids/.test(frz), 'D7. FREEZE is read-only + captures expected K2 ids + deltas + checksum');

// ============================================================ F — empty headers untouched
section('F. empty-header classifier unchanged (still K2-aware, read-only) — no cancel/repair added');
ok(/function TEMP_r6f2ClassifyEmptyHeadersK2_/.test(TEMP) && /NOT_SAFE/.test(TEMP), 'F1. K2 classifier retains NOT_SAFE');
ok(!/deleteRow|deleteRows/.test(extractFn(TEMP, 'TEMP_r6f2aDryAssembly_')), 'F2. dry assembly never deletes/cancels a header');

done();
