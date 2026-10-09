// =============================================================================================================
// S8-R49-C · C1 — DOES THE SHIPPED SEND PATH BLOCK A MISSING units_per_carton?
// -------------------------------------------------------------------------------------------------------------
// THE CONTRACT BEING TESTED. SUPPLY_PLANNING_CALCULATION_RULES.md states the rule three times:
//   §14   "Missing units_per_carton (CANONICAL v4.1): no silent default (never 1, 12, or any other number) …
//          and Send Request is blocked until the carton configuration is fixed."
//   §17   "units_per_carton required for carton rounding — missing → Suggested Order Qty = Calculation Blocked
//          / Manual Review Required and Send Request blocked (no silent default), §14/§34."
//   §37   "Missing units_per_carton still blocks the system Suggested calculation and Send (§14)."
//
// The SUGGESTED half is already proven elsewhere: Golden #31 executes it, and the calculation core throws on a
// missing/zero UPC rather than defaulting (supply-planning-calculations.js, 90_ bundle §14/§31). R48-S recorded
// the SEND half as unproven, and R49-B left it as the single OPEN §37 sub-clause. This suite settles it by
// EXECUTING the shipped Send path rather than reading it.
//
// ►►► RESULT: THE SEND HALF IS NOT IMPLEMENTED. A missing, zero or non-numeric units_per_carton is NOT blocked —
// ►►► not by the browser and not by the server. A direct backend call writes a real Request Order line carrying
// ►►► an EMPTY units_per_carton. This suite is therefore a REPRODUCTION of an OPEN gap, not an acceptance of it.
//
// WHY IT STILL PASSES GREEN. It asserts what the shipped code ACTUALLY DOES today, so the gap is measured,
// attributable and regression-locked instead of being re-litigated from prose every round. The two assertions
// that pin the defect (SG13/SG14) are written so that THE DAY THE GUARD LANDS THEY FAIL, with a message saying
// exactly that and telling the next reader to invert them and close the §37 Send clause. A green run here means
// "the gap is still exactly where R49-C found it", never "Send is safe".
//
// NO PRODUCTION CODE IS MODIFIED BY THIS ROUND. The §14 repair is a business-runtime change and was STOPPED for
// authorization per the C1 STOP rule; the proposed smallest server-side fix is in the R49-C report.
// =============================================================================================================
// NOTE: deliberately NOT strict mode — the suite EXECUTES the shipped .gs functions via eval(), and in strict
// mode an eval-scoped function declaration would not reach this module scope.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { pass++; } else { fail++; console.log('FAIL ' + msg + '  got ' + A + ' want ' + B); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

const ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\r\n').join('\n'); }
function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1'); }
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  let i = src.indexOf(sig);
  if (i < 0) throw new Error('FAIL-CLOSED: fn not found: ' + name);
  const start = i; let depth = 0, started = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('FAIL-CLOSED: unbalanced fn: ' + name);
}
function extractVar(src, decl) {
  let i = src.indexOf(decl);
  if (i < 0) throw new Error('FAIL-CLOSED: var not found: ' + decl);
  const start = i; let depth = 0, seen = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[' || ch === '{') { depth++; seen = true; }
    else if (ch === ']' || ch === '}') { depth--; if (seen && depth === 0) return src.slice(start, i + 2); }
  }
  throw new Error('FAIL-CLOSED: unbalanced var: ' + decl);
}
function slice(src, a, b) { const i = src.indexOf(a); const j = src.indexOf(b, i + 1); return src.slice(i, j); }

// ---- the SHIPPED server Send path, loaded and executed (never mirrored) --------------------------------------
// Allow an injected source so the mutant harness can prove this suite reacts to a guard landing. Absent the
// env var this is byte-for-byte the shipped file.
const G66 = process.env.R49C_G66_OVERRIDE
  ? fs.readFileSync(process.env.R49C_G66_OVERRIDE, 'utf8').split('\r\n').join('\n')
  : read('specs/active/apps-script/66_api_v1_request_order_send.gs');
const RO = read('js/pages/request-order.js');

eval(slice(G66, 'var ROS_BUILD_VERSION_ =', '// __ROS_PURE_START__'));
eval(slice(G66, '// __ROS_PURE_START__', '// __ROS_PURE_END__'));
eval(extractFn(G66, 'rosBuildEnvelope_'));
eval(extractFn(G66, 'rosSeriesIndex_'));
eval(extractFn(G66, 'rosUnwrap_'));
eval(extractFn(G66, 'rosJournalWrite_'));
eval(extractFn(G66, 'rosJournalRead_'));
eval(extractFn(G66, 'rosOwnershipTransact_'));
eval(extractFn(G66, 'rosOwnershipRelease_'));
eval(extractFn(G66, 'rosCountsOf_'));
eval(extractVar(G66, 'var ROS_SLIM_DRAFT_PROJECTION_ = ['));
eval(extractVar(G66, 'var ROS_SLIM_FORBIDDEN_INCLUDES_ = ['));
eval(extractFn(G66, 'rosResolveIncludes_'));
eval(extractFn(G66, 'rosProjectSlimDraft_'));
eval(extractFn(G66, 'rosCurrentRunAuthority_'));
eval(extractFn(G66, 'handleRequestOrderSendOrchestrate_'));

// ---- fixtures: the live flat-V2 draft shape ------------------------------------------------------------------
// S1 carries a canonical UPC. SNOUPC is ABSENT from sku_details entirely — the real missing-UPC shape, since the
// §14 UPC authority is "the canonical SKU master mapping (sku_details) only".
const PC_UPC = 40, PC_QTY = 137, PC_FULL = 160;
function draftRow(o) {
  o = o || {};
  const r = {
    request_allocation_draft_id: 'RD::MONTHLY_ORDER::2026-08::company=KM|country=US|draft_purpose=regular|marketplace=Amazon|sku=' + (o.sku || 'S1'),
    planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'Amazon',
    sku: o.sku || 'S1', status: 'site_confirmed', draft_version: 1,
    units_per_carton: o.upc === undefined ? PC_UPC : o.upc, updated_at: '2026-08-20 10:00'
  };
  ['T1', 'T2', 'T3'].forEach(function (t) {
    const p = t.toLowerCase() + '_';
    const cell = (o.tiers || {})[t];
    r[p + 'month'] = cell ? '2026-09' : '';
    r[p + 'recommended_qty'] = cell && cell.rec !== undefined ? cell.rec : '';
    r[p + 'order_qty'] = cell && cell.qty !== undefined ? cell.qty : '';
    r[p + 'status'] = cell ? 'draft' : '';
    r[p + 'user_edited'] = cell && cell.userEdited ? 'true' : '';
  });
  return r;
}
const SKU_DETAILS = [{ sku: 'S1', series: 'ALPHA', units_per_carton: PC_UPC }];
const IDX = rosSeriesIndex_(SKU_DETAILS);
function buildWs(rows) {
  return rosBuildWorkset_(rows, { planning_cycle: '2026-08', tier_scope: 'ALL',
    series_by_sku: IDX.series, units_per_carton_by_sku: IDX.upc });
}
// One probe per case. Returns the observable facts, never a verdict.
function probe(row) {
  const ws = buildWs([row]);
  return {
    sendable: ws.rows.length,
    upcEmitted: ws.rows.length ? ws.rows[0].units_per_carton : '(no row)',
    qty: ws.rows.length ? ws.rows[0].order_qty : null,
    blocking: ws.blocking_conflicts.length,
    // every typed exclusion that actually fired, so a silent drop could not be mistaken for a block
    firedExclusions: Object.keys(ws.excluded).filter(function (k) { return ws.excluded[k] > 0 && k !== 'tier_absent'; })
  };
}

// =============================================================================================================
section('C1 cases 1-2 — a VALID units_per_carton (the contract-correct half)');

const c1 = probe(draftRow({ sku: 'S1', tiers: { T1: { qty: PC_FULL, rec: PC_FULL } } }));
eq([c1.sendable, c1.upcEmitted, c1.blocking], [1, PC_UPC, 0],
   'SG1 case 1 — valid UPC 40 with a FULL-carton 160 is sendable and carries its UPC');

const c2 = probe(draftRow({ sku: 'S1', tiers: { T1: { qty: PC_QTY, rec: PC_FULL } } }));
eq([c2.sendable, c2.qty, c2.blocking], [1, PC_QTY, 0],
   'SG2 case 2 — valid UPC 40 with a PARTIAL-carton 137 is ALLOWED through Send (§37), not re-rounded');
ok(c2.qty !== PC_FULL,
   'SG3 and the partial quantity is specifically NOT restored to the 160 full carton at the Send seam');

// =============================================================================================================
section('C1 cases 3-7 — a MISSING / ZERO / NON-NUMERIC units_per_carton  [GAP-OPEN]');
// §14 requires each of these to BLOCK Send. None of them does. Each assertion below records the ACTUAL shipped
// behaviour; the contract each one violates is named in its own message.

const c3 = probe(draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY } } }));
eq([c3.sendable, c3.upcEmitted, c3.blocking, c3.firedExclusions], [1, '', 0, []],
   'SG4 GAP-OPEN case 3 — a MISSING UPC is sendable, emits an EMPTY units_per_carton, raises no blocking '
   + 'conflict and fires no exclusion (§14 requires Send to be blocked)');

const c4 = probe(draftRow({ sku: 'SNOUPC', upc: 0, tiers: { T1: { qty: PC_QTY } } }));
eq([c4.sendable, c4.upcEmitted, c4.blocking], [1, 0, 0],
   'SG5 GAP-OPEN case 4 — a ZERO UPC is sendable and emits 0 (§14: zero is not a carton size)');

const c5 = probe(draftRow({ sku: 'SNOUPC', upc: 'N/A', tiers: { T1: { qty: PC_QTY } } }));
eq([c5.sendable, c5.upcEmitted, c5.blocking], [1, '', 0],
   'SG6 GAP-OPEN case 5 — a NON-NUMERIC UPC is sendable; it is coerced to blank, not refused');

const c6 = probe(draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY, userEdited: true } } }));
eq([c6.sendable, c6.blocking], [1, 0],
   'SG7 GAP-OPEN case 6 — a MISSING UPC with a MANUALLY entered quantity is sendable');

const c7 = probe(draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY, rec: PC_FULL } } }));
eq([c7.sendable, c7.blocking], [1, 0],
   'SG8 GAP-OPEN case 7 — a MISSING UPC carrying a PRIOR recommendation is sendable');

// The quantity is never silently defaulted, which matters: the defect is a missing REFUSAL, not a fabricated
// carton size. §14 forbids both, and only one of them is actually happening.
ok(c3.upcEmitted !== 1 && c3.upcEmitted !== 12 && c4.upcEmitted !== 1 && c4.upcEmitted !== 12,
   'SG9 no silent default of 1 or 12 is substituted at the Send seam — the half of §14 that IS honoured');

// =============================================================================================================
section('C1 cases 8-9 — the FULL orchestration, reloaded from persistence, called with NO frontend');

let writeCalls = 0;
const props = {};
function fixtureIo(rows) {
  const store = { orders: [], orderLines: [], orderSources: [] };
  const io = {
    now: (function () { let t = 1000; return function () { t += 10; return t; }; })(),
    openDb: function () { return {}; },
    readTable: function (ss, name) {
      if (name === 'request_order_allocation_drafts') return rows;
      if (name === 'sku_details') return SKU_DETAILS;
      if (name === 'request_orders') return store.orders;
      if (name === 'request_order_lines') return store.orderLines;
      if (name === 'request_order_line_sources') return store.orderSources;
      return [];
    },
    createRequestOrderDraft: function (body) {
      writeCalls++;
      const id = 'RO-' + writeCalls;
      (body.lines || []).forEach(function (l, li) {
        const lineId = 'ROL-' + writeCalls + '-' + li;
        store.orderLines.push({ request_order_line_id: lineId, request_order_id: id, sku: l.sku,
          series: l.series, company: l.company, request_bucket: l.request_bucket,
          request_month: l.request_month, requested_qty: Number(l.requested_qty),
          approved_qty: Number(l.requested_qty), units_per_carton: l.units_per_carton });
        store.orderSources.push({ request_order_line_source_id: 'ROLS-' + writeCalls + '-' + li,
          request_order_line_id: lineId, request_order_id: id, sku: l.sku, company: l.company,
          country: l.country, marketplace: l.marketplace, tier_type: l.request_bucket,
          source_month: l.request_month, request_allocation_draft_id: l.request_allocation_draft_id,
          requested_qty: Number(l.requested_qty), approved_qty: Number(l.requested_qty) });
      });
      let totalQty = 0; const skus = {};
      store.orderLines.forEach(function (l) {
        if (l.request_order_id === id) { totalQty += Number(l.requested_qty); skus[String(l.sku).toUpperCase()] = 1; }
      });
      store.orders.push({ request_order_id: id, request_order_no: 'REQ-' + writeCalls,
        total_qty: totalQty, total_sku: Object.keys(skus).length });
      return { success: true, data: { request_order_id: id, request_order_no: 'REQ-' + writeCalls,
        reused: false, execution_key: 'K' + writeCalls } };
    },
    submitAllocationDrafts: function () { return { success: true, data: { submitted: 1 } }; },
    propGet: function (k) { return props[k] === undefined ? null : props[k]; },
    propSet: function (k, v) { props[k] = v; },
    propDel: function (k) { delete props[k]; },
    propDelete: function (k) { delete props[k]; },
    lock: function () { return { waitLock: function () { return true; }, releaseLock: function () {} }; },
    withCasLock: function (fn) { return { locked: true, value: fn() }; }
  };
  io._lines = function () { return store.orderLines; };
  return io;
}

// Case 8 — a RELOADED draft: the row comes back out of persistence, exactly as a page refresh would deliver it.
const persisted = [draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY } } })];
const io8 = fixtureIo(JSON.parse(JSON.stringify(persisted)));
const basePayload = { tier_scope: 'ALL', planning_cycle: '2026-08', actor: 'direct-backend-caller',
  intents: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SNOUPC',
    tiers: { T1: { order_qty: PC_QTY, month: '2026-09' } } }] };

const pv = handleRequestOrderSendOrchestrate_({ payload: Object.assign({ mode: 'preview' }, basePayload) }, io8);
ok(pv && pv.success === true && (pv.data || {}).status === 'PREVIEW',
   'SG10 GAP-OPEN case 8 — PREVIEW over a RELOADED missing-UPC draft SUCCEEDS (it should refuse)');
eq(Number((((pv.data || {}).counts) || {}).positive_selected_tier_allocations), 1,
   'SG11 the reloaded missing-UPC draft is counted as a sendable Request Order line');
const checksum = String((pv.data || {}).confirm_with_checksum || '');
ok(checksum !== '',
   'SG12 and the server hands back a frozen checksum, so the user is offered a confirmable plan for it');

// Case 9 — THE BYPASS ITSELF. No browser is involved: this is the server action a caller can post directly.
// The frontend has no gate either (SG15/SG16), so there is nothing here for a direct call to bypass.
const ex = handleRequestOrderSendOrchestrate_(
  { payload: Object.assign({ mode: 'execute', confirmed_checksum: checksum }, basePayload) }, io8);
const linesWritten = io8._lines();

// ►►► THE TWO ASSERTIONS THAT PIN THE DEFECT. When the §14 Send guard lands, BOTH of these FAIL — that is their
// ►►► purpose. Their failure is the signal to invert them and close the §37 Send clause; it is not a regression.
ok(ex && ex.success === true && Number((ex.data || {}).writes_performed) === 1,
   'SG13 GAP-OPEN case 9 — a DIRECT backend Send with a missing UPC SUCCEEDS and performs a real write. '
   + 'IF THIS FAILS, the §14 Send guard has landed: invert SG13/SG14 and close the §37 Send clause.');
eq([linesWritten.length, linesWritten.length ? linesWritten[0].units_per_carton : null,
    linesWritten.length ? linesWritten[0].requested_qty : null], [1, '', PC_QTY],
   'SG14 GAP-OPEN — and a real request_order_lines row is persisted carrying an EMPTY units_per_carton. '
   + 'IF THIS FAILS, the guard has landed: invert SG13/SG14 and close the §37 Send clause.');

// =============================================================================================================
section('C1 — WHERE the guard is absent (structural, comments stripped)');
// Absence assertions run against CODE with comments removed, so prose describing the rule can never satisfy them.

const wsCode = code(extractFn(G66, 'rosBuildWorkset_'));
ok(wsCode.indexOf('units_per_carton') !== -1,
   'SG15 the server workset builder DOES read units_per_carton (so the field is available to a guard)');
ok(!/MISSING_UNITS_PER_CARTON|UNITS_PER_CARTON_REQUIRED|UNITS_PER_CARTON_UNAVAILABLE/.test(code(G66)),
   'SG16 but 66_ contains no missing-UPC refusal code of any kind — the server has no such gate to bypass');
ok(/blocking_conflicts/.test(wsCode) && /DUPLICATE_BUSINESS_IDENTITY/.test(code(G66)),
   'SG17 the fail-closed seam a guard would use ALREADY EXISTS (blocking_conflicts, as used by §H) — '
   + 'the proposed fix adds a second producer to it rather than a new refusal path');

const SEND = RO.slice(RO.indexOf('async function handleSendRequest()'), RO.indexOf('function _roSendPlanningCycle_'));
ok(SEND.length > 500, 'SG18 the shipped handleSendRequest body was located for inspection (fail-closed)');
ok(/parseFloat\(item\.boxSize\)/.test(SEND),
   'SG19 the browser DOES read the UPC during Send (item.boxSize)');
ok(!/return[^\n]*\bupc\b/.test(code(SEND)) && !/upc\s*(===?|<=?)\s*0[^\n]*\breturn\b/.test(code(SEND)),
   'SG20 but it never refuses on it — the UPC feeds only the partial-carton COUNTER, so the browser has no '
   + 'gate either; a direct backend call is not even needed to reach the gap');

// =============================================================================================================
// The measured verdict, derived from the probes above rather than restated by hand.
//
// IT COUNTS ONLY AN ACTUAL REFUSAL. An earlier draft of this line also accepted "no sendable row" as blocked,
// and mutant M2 (a missing UPC silently EXCLUDED instead of refused) made it print CLOSED. Those are different
// outcomes and the weaker one is arguably worse: a silent drop sends a PARTIAL Send the operator approved the
// full version of. SG4 already separates them per-case; the verdict now does too.
const MISSING_UPC_BLOCKED = c3.blocking > 0 && c4.blocking > 0 && c5.blocking > 0;
const MISSING_UPC_SILENTLY_DROPPED = !MISSING_UPC_BLOCKED
  && (c3.sendable === 0 || c4.sendable === 0 || c5.sendable === 0);
console.log('\n----------------------------------------');
console.log('SEND_GUARD_MEASURED: missing_upc_send_blocked=' + MISSING_UPC_BLOCKED);
console.log('§37 SEND CLAUSE: ' + (MISSING_UPC_BLOCKED ? 'CLOSED' : 'OPEN — §14 Send block NOT IMPLEMENTED'));
if (MISSING_UPC_SILENTLY_DROPPED) {
  console.log('WARNING: a missing UPC is being SILENTLY EXCLUDED, not refused. §14 requires Send to be '
    + 'BLOCKED; a silent drop ships a partial Send the operator never approved.');
}
if (!MISSING_UPC_BLOCKED) {
  console.log('GAP: missing/zero/non-numeric units_per_carton passes Send on BOTH sides (browser + server).');
  console.log('     Repair is a business-runtime change and was STOPPED for authorization (R49-C C1 STOP rule).');
}
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('REQUEST ORDER SEND MISSING-UPC GUARD (S8-R49-C): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
