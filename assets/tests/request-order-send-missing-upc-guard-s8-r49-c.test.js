// =============================================================================================================
// S8-R49-C/D · THE §14 REQUEST ORDER SEND CARTON-CONFIGURATION GATE
// -------------------------------------------------------------------------------------------------------------
// THE CONTRACT. Four frozen documents say the same thing, and they do not conflict:
//   §14   "Missing units_per_carton (CANONICAL v4.1): no silent default (never 1, 12, or any other number) …
//          and Send Request is blocked until the carton configuration is fixed."
//   §17   "units_per_carton required for carton rounding — missing → Suggested Order Qty = Calculation Blocked
//          / Manual Review Required and Send Request blocked (no silent default), §14/§34."
//   §37   "Missing units_per_carton still blocks the system Suggested calculation and Send (§14)."
//   REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC §12.13 — same rule, and the other half of it: "Send is NOT blocked
//          merely because order_qty is not a full-carton multiple." A PARTIAL CARTON IS ALLOWED.
//
// WHAT THIS FILE IS. R49-C ran these same nine cases against the shipped path and found the Send half of the
// rule simply absent: a missing, zero or non-numeric units_per_carton was sendable on BOTH sides, and a direct
// backend call persisted a request_order_lines row carrying an EMPTY units_per_carton. That round committed the
// REPRODUCTION and stopped before production, because a business-runtime repair needed authorization.
//
// R49-D implements the guard, and this suite flips with it. SG13/SG14 were deliberately written to FAIL the day
// it landed, with a message saying to invert them — mutant M1 proved they would. They are now inverted, and the
// file is an ACCEPTANCE suite rather than a reproduction. The history is kept in this header on purpose: the
// value of SG13/SG14 was that they were falsifiable, and a reader should be able to see that they were falsified
// by the fix rather than quietly rewritten.
//
// Everything is executed against the SHIPPED 66_ pure core. Nothing here re-implements the workset builder.
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
// R49C_G66_OVERRIDE lets the mutant harness substitute a mutated COPY. Absent the env var this is byte-for-byte
// the shipped file.
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
  const sku = o.sku || 'S1';
  const r = {
    request_allocation_draft_id: o.id
      || ('RD::MONTHLY_ORDER::2026-08::company=KM|country=US|draft_purpose=regular|marketplace=Amazon|sku=' + sku),
    planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'Amazon',
    sku: sku, status: 'site_confirmed', draft_version: 1,
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
const SKU_DETAILS = [{ sku: 'S1', series: 'ALPHA', units_per_carton: PC_UPC },
                     { sku: 'S2', series: 'ALPHA', units_per_carton: PC_UPC }];
const IDX = rosSeriesIndex_(SKU_DETAILS);
function buildWs(rows) {
  return rosBuildWorkset_(rows, { planning_cycle: '2026-08', tier_scope: 'ALL',
    series_by_sku: IDX.series, units_per_carton_by_sku: IDX.upc });
}
// One probe per case. Returns the observable facts, never a verdict.
function probe(row) {
  const ws = buildWs([row]);
  const conflicts = ws.blocking_conflicts;
  return {
    sendable: ws.rows.length,
    upcEmitted: ws.rows.length ? ws.rows[0].units_per_carton : '(no row)',
    qty: ws.rows.length ? ws.rows[0].order_qty : null,
    blocking: conflicts.length,
    codes: conflicts.map(function (c) { return c.code; }),
    first: conflicts[0] || null,
    // every typed exclusion that actually fired, so a SILENT DROP could never be mistaken for a refusal
    firedExclusions: Object.keys(ws.excluded).filter(function (k) { return ws.excluded[k] > 0 && k !== 'tier_absent'; })
  };
}

// =============================================================================================================
section('A — a VALID units_per_carton still sends, and §37 partial cartons still pass');

const c1 = probe(draftRow({ sku: 'S1', tiers: { T1: { qty: PC_FULL, rec: PC_FULL } } }));
eq([c1.sendable, c1.upcEmitted, c1.blocking], [1, PC_UPC, 0],
   'SG1 acceptance 1 — valid UPC 40 with a FULL-carton 160 is sendable and carries its UPC');

const c2 = probe(draftRow({ sku: 'S1', tiers: { T1: { qty: PC_QTY, rec: PC_FULL } } }));
eq([c2.sendable, c2.qty, c2.blocking], [1, PC_QTY, 0],
   'SG2 acceptance 2 — valid UPC 40 with a PARTIAL-carton 137 is ALLOWED through Send (§37/§12.13)');
ok(c2.qty !== PC_FULL,
   'SG3 acceptance 3 — and 137 is preserved EXACTLY; the guard did not re-round it to the 160 full carton');

// =============================================================================================================
section('B — every unusable carton size BLOCKS the Send (§14)');
// rosQty_ maps blank and non-numeric to null and keeps a negative as a negative, so one predicate covers all
// four shapes. Each case asserts the refusal AND that nothing was silently dropped instead.

function blockedCase(label, row, assertionId, acceptanceNo) {
  const p = probe(row);
  eq([p.blocking, p.codes, p.sendable, p.firedExclusions], [1, ['MISSING_UNITS_PER_CARTON'], 0, []],
     assertionId + ' acceptance ' + acceptanceNo + ' — ' + label + ' is BLOCKED by one '
     + 'MISSING_UNITS_PER_CARTON conflict, is not sendable, and fired NO exclusion counter '
     + '(a refusal, never a silent drop)');
  return p;
}

const b4 = blockedCase('a MISSING units_per_carton', draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY } } }), 'SG4', 4);
blockedCase('a ZERO units_per_carton', draftRow({ sku: 'SNOUPC', upc: 0, tiers: { T1: { qty: PC_QTY } } }), 'SG5', 5);
blockedCase('a NEGATIVE units_per_carton', draftRow({ sku: 'SNOUPC', upc: -40, tiers: { T1: { qty: PC_QTY } } }), 'SG6', 6);
blockedCase('a NON-NUMERIC units_per_carton', draftRow({ sku: 'SNOUPC', upc: 'N/A', tiers: { T1: { qty: PC_QTY } } }), 'SG7', 7);
blockedCase('a MISSING UPC with a MANUALLY entered quantity',
  draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY, userEdited: true } } }), 'SG8', 8);
blockedCase('a MISSING UPC carrying a PRIOR recommendation',
  draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY, rec: PC_FULL } } }), 'SG9', 9);

// The conflict has to be actionable: who, which line, and what was actually read.
var B4 = b4.first || {};
eq([B4.sku, B4.request_bucket, B4.order_qty, B4.company, B4.marketplace],
   ['SNOUPC', 'T1', PC_QTY, 'KM', 'Amazon'],
   'SG10 the conflict preserves LINE IDENTITY — sku, bucket, quantity, company and marketplace');
ok(String(B4.request_allocation_draft_id || '').indexOf('SNOUPC') !== -1 && !!B4.natural_key,
   'SG11 and its draft id + natural key, so the offending row can be found without guessing');
eq([B4.units_per_carton_raw, B4.units_per_carton_effective], ['', null],
   'SG12 and it reports what was READ rather than a substituted value — no default was invented');

// A row with NO positive in-scope quantity must never block an unrelated Send.
const dormant = probe(draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: 0 } } }));
eq([dormant.blocking, dormant.sendable], [0, 0],
   'SG13 a DORMANT row (no positive quantity) with a blank carton size blocks nothing — the gate is scoped '
   + 'to lines that would actually be sent');

// =============================================================================================================
section('C — PREVIEW and EXECUTE both refuse, and the direct backend call writes NOTHING');

const props = {};
function fixtureIo(rows, sharedProps) {
  const store = { orders: [], orderLines: [], orderSources: [] };
  let writes = 0;
  const p = sharedProps || {};
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
      writes++;
      const id = 'RO-' + writes;
      (body.lines || []).forEach(function (l, li) {
        const lineId = 'ROL-' + writes + '-' + li;
        store.orderLines.push({ request_order_line_id: lineId, request_order_id: id, sku: l.sku,
          series: l.series, company: l.company, request_bucket: l.request_bucket,
          request_month: l.request_month, requested_qty: Number(l.requested_qty),
          approved_qty: Number(l.requested_qty), units_per_carton: l.units_per_carton });
        store.orderSources.push({ request_order_line_source_id: 'ROLS-' + writes + '-' + li,
          request_order_line_id: lineId, request_order_id: id, sku: l.sku, company: l.company,
          country: l.country, marketplace: l.marketplace, tier_type: l.request_bucket,
          source_month: l.request_month, request_allocation_draft_id: l.request_allocation_draft_id,
          requested_qty: Number(l.requested_qty), approved_qty: Number(l.requested_qty) });
      });
      let totalQty = 0; const skus = {};
      store.orderLines.forEach(function (l) {
        if (l.request_order_id === id) { totalQty += Number(l.requested_qty); skus[String(l.sku).toUpperCase()] = 1; }
      });
      store.orders.push({ request_order_id: id, request_order_no: 'REQ-' + writes,
        total_qty: totalQty, total_sku: Object.keys(skus).length });
      return { success: true, data: { request_order_id: id, request_order_no: 'REQ-' + writes,
        reused: false, execution_key: 'K' + writes } };
    },
    submitAllocationDrafts: function () { return { success: true, data: { submitted: 1 } }; },
    propGet: function (k) { return p[k] === undefined ? null : p[k]; },
    propSet: function (k, v) { p[k] = v; },
    propDel: function (k) { delete p[k]; },
    propDelete: function (k) { delete p[k]; },
    lock: function () { return { waitLock: function () { return true; }, releaseLock: function () {} }; },
    withCasLock: function (fn) { return { locked: true, value: fn() }; }
  };
  io._lines = function () { return store.orderLines; };
  io._orders = function () { return store.orders; };
  io._writes = function () { return writes; };
  return io;
}
function payloadFor(sku, qty) {
  return { tier_scope: 'ALL', planning_cycle: '2026-08', actor: 'direct-backend-caller',
    intents: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: sku,
      tiers: { T1: { order_qty: qty, month: '2026-09' } } }] };
}

// Case 10 — a RELOADED draft: the row comes back out of persistence, as a page refresh would deliver it.
const io10 = fixtureIo([draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY } } })], props);
const basePayload = payloadFor('SNOUPC', PC_QTY);
const pv = handleRequestOrderSendOrchestrate_({ payload: Object.assign({ mode: 'preview' }, basePayload) }, io10);
eq([pv.success, (pv.errors || []).map(function (e) { return e.code; })],
   [false, ['MISSING_UNITS_PER_CARTON']],
   'SG14 acceptance 10 — PREVIEW over a RELOADED missing-UPC draft is REFUSED, named by its own rule');
ok(!(pv.data || {}).confirm_with_checksum,
   'SG15 and no frozen checksum is handed back — the operator is never offered a confirmable plan for it');

// Case 11 — THE BYPASS THAT R49-C FOUND. No browser is involved: this is the server action posted directly.
const ex = handleRequestOrderSendOrchestrate_(
  { payload: Object.assign({ mode: 'execute', confirmed_checksum: 'ROSCHK-ANYTHING' }, basePayload) }, io10);
eq([ex.success, (ex.errors || []).map(function (e) { return e.code; })],
   [false, ['MISSING_UNITS_PER_CARTON']],
   'SG16 acceptance 11 — a DIRECT backend EXECUTE is refused too; preview is not the only gate');
eq([io10._writes(), io10._lines().length, io10._orders().length], [0, 0, 0],
   'SG17 acceptance 11 — and ZERO writes occurred. R49-C recorded a persisted request_order_lines row with an '
   + 'EMPTY units_per_carton here; that row is no longer created.');
eq(ex.meta.zero_write, true,
   'SG18 the refusal is reported as a zero-write outcome, so no reconciliation is implied');

// The operator must be told what to do. A refusal nobody can act on is a different defect.
const det = ((pv.errors || [])[0] || {}).details || {};
ok(/units_per_carton/.test(String(det.next_action)) && /sku_details/.test(String(det.next_action)),
   'SG19 the refusal names the field AND the authority to fix it (sku_details)');
ok(/PARTIAL-carton quantity is allowed/i.test(String(det.next_action)),
   'SG20 and it says explicitly that a partial carton was NOT the reason, so §37 is not mistaken for this gate');
eq(det.conflict_codes, ['MISSING_UNITS_PER_CARTON'],
   'SG21 the machine-readable code set is reported for the caller');

// =============================================================================================================
section('D — a MIXED workset refuses as a WHOLE (no unauthorized partial Send)');

const mixedRows = [
  draftRow({ sku: 'S1', tiers: { T1: { qty: PC_FULL, rec: PC_FULL } } }),      // perfectly valid
  draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY } } })         // no carton size
];
const wsMixed = buildWs(mixedRows);
eq([wsMixed.blocking_conflicts.length, wsMixed.blocking_conflicts.map(function (c) { return c.code; })],
   [1, ['MISSING_UNITS_PER_CARTON']], 'SG22 the mixed workset raises exactly one carton conflict');
eq(wsMixed.rows.length, 1,
   'SG23 the VALID row is still built (the guard withholds the offending line, it does not poison the workset)');

const ioMixed = fixtureIo(mixedRows, {});
const mixPv = handleRequestOrderSendOrchestrate_(
  { payload: Object.assign({ mode: 'preview' }, payloadFor('S1', PC_FULL)) }, ioMixed);
eq([mixPv.success, (mixPv.errors || []).map(function (e) { return e.code; })],
   [false, ['MISSING_UNITS_PER_CARTON']],
   'SG24 acceptance 12 — but the ORCHESTRATION refuses the whole Send, not just the bad line');
const mixEx = handleRequestOrderSendOrchestrate_(
  { payload: Object.assign({ mode: 'execute', confirmed_checksum: 'X' }, payloadFor('S1', PC_FULL)) }, ioMixed);
eq([mixEx.success, ioMixed._writes(), ioMixed._lines().length], [false, 0, 0],
   'SG25 acceptance 16 — and the VALID line is NOT committed on its own; a partial Send the operator never '
   + 'approved is exactly what §H fail-closed exists to prevent');

// =============================================================================================================
section('E — the duplicate-identity gate is unchanged, and the two rules are never confused');

// Two canonical ids for ONE business scope (company/country/marketplace/sku). Both carry a VALID carton size,
// so only the §H duplicate rule can fire.
const dupRows = [
  draftRow({ sku: 'S2', id: 'RD::MONTHLY_ORDER::2026-08::company=KM|country=US|draft_purpose=regular|marketplace=Amazon|sku=S2', tiers: { T1: { qty: 80 } } }),
  draftRow({ sku: 'S2', id: 'RAD-M-LEGACY-0001', tiers: { T1: { qty: 120 } } })
];
const wsDup = buildWs(dupRows);
eq([wsDup.blocking_conflicts.length, (wsDup.blocking_conflicts[0] || {}).code],
   [1, 'DUPLICATE_BUSINESS_IDENTITY'],
   'SG26 acceptance 13 — two ids for one business scope is still a DUPLICATE_BUSINESS_IDENTITY conflict');
const ioDup = fixtureIo(dupRows, {});
const dupRes = handleRequestOrderSendOrchestrate_(
  { payload: Object.assign({ mode: 'preview' }, payloadFor('S2', 80)) }, ioDup);
eq([dupRes.success, (dupRes.errors || []).map(function (e) { return e.code; })],
   [false, ['DUPLICATE_BUSINESS_IDENTITY']],
   'SG27 acceptance 13 — and the orchestration still reports exactly that code (unchanged contract)');
ok(/allocation-draft identity diagnostic/.test(String((((dupRes.errors || [])[0] || {}).details || {}).next_action)),
   'SG28 with its original next_action — the duplicate path was not rewritten by the new producer');

// THE MISLABEL THAT THE OLD CODE WOULD HAVE PRODUCED. Before R49-D the handler hardcoded
// DUPLICATE_BUSINESS_IDENTITY for ANY blocking conflict, so a missing carton size would have sent the operator
// to the duplicate-draft diagnostic. These two assertions exist to keep that from coming back.
ok(((pv.errors || [])[0] || {}).code !== 'DUPLICATE_BUSINESS_IDENTITY',
   'SG29 a missing carton size is NOT reported as a duplicate business identity');
ok(!/allocation-draft identity diagnostic/.test(String(det.next_action)),
   'SG30 and the operator is not sent to the duplicate-draft diagnostic for a carton problem');

// =============================================================================================================
section('F — a VALID Send still works end to end, and its retry is still idempotent');

const validRows = [draftRow({ sku: 'S1', tiers: { T1: { qty: PC_QTY, rec: PC_FULL } } })];
const ioOk = fixtureIo(validRows, {});
const okPv = handleRequestOrderSendOrchestrate_(
  { payload: Object.assign({ mode: 'preview' }, payloadFor('S1', PC_QTY)) }, ioOk);
ok(okPv.success === true && (okPv.data || {}).status === 'PREVIEW',
   'SG31 a valid partial-carton Send still PREVIEWS successfully with the guard installed');
const okChecksum = String((okPv.data || {}).confirm_with_checksum || '');
ok(okChecksum !== '', 'SG32 and still freezes a confirmable checksum');
const okEx = handleRequestOrderSendOrchestrate_(
  { payload: Object.assign({ mode: 'execute', confirmed_checksum: okChecksum }, payloadFor('S1', PC_QTY)) }, ioOk);
ok(okEx.success === true && Number((okEx.data || {}).writes_performed) === 1,
   'SG33 acceptance 14 — and still EXECUTES, performing its one write');
var OK0 = ioOk._lines()[0] || {};
eq([ioOk._lines().length, OK0.requested_qty, OK0.units_per_carton],
   [1, PC_QTY, PC_UPC],
   'SG34 the committed line carries the exact partial quantity 137 and its real carton size 40');

const okRetry = handleRequestOrderSendOrchestrate_(
  { payload: Object.assign({ mode: 'execute', confirmed_checksum: okChecksum }, payloadFor('S1', PC_QTY)) }, ioOk);
ok(okRetry.success === true && (okRetry.data || {}).status === 'ALREADY_COMPLETED',
   'SG35 acceptance 14 — a RETRY of the same Send replays as ALREADY_COMPLETED');
eq([ioOk._lines().length, ioOk._orders().length], [1, 1],
   'SG36 and creates no duplicate Request Order or line — idempotency is unaffected by the guard');

// =============================================================================================================
section('G — no silent default, and the guard lives where the contract says');

ok(B4.units_per_carton_effective !== 1 && B4.units_per_carton_effective !== 12,
   'SG37 acceptance 15 — no silent default of 1 or 12 is substituted anywhere in the refusal');
const wsCode = code(extractFn(G66, 'rosBuildWorkset_'));
ok(/MISSING_UNITS_PER_CARTON/.test(wsCode),
   'SG38 the gate is in the SERVER workset builder — the authority, not the browser');
ok(!/upc\s*=\s*(1|12)\b/.test(wsCode),
   'SG39 and the builder never assigns a literal carton size (structural, comments stripped)');

const SEND = RO.slice(RO.indexOf('async function handleSendRequest()'), RO.indexOf('function _roSendPlanningCycle_'));
ok(SEND.length > 500, 'SG40 the shipped handleSendRequest body was located for inspection (fail-closed)');
ok(/_roSendOrchestrationErrorMessage_\(pv/.test(SEND),
   'SG41 the browser routes a refused PREVIEW through its orchestration error renderer, so the new conflict '
   + 'reaches the operator rather than being swallowed');

// =============================================================================================================
const MISSING_UPC_BLOCKED = probe(draftRow({ sku: 'SNOUPC', upc: '', tiers: { T1: { qty: PC_QTY } } })).blocking > 0
  && probe(draftRow({ sku: 'SNOUPC', upc: 0, tiers: { T1: { qty: PC_QTY } } })).blocking > 0
  && probe(draftRow({ sku: 'SNOUPC', upc: 'N/A', tiers: { T1: { qty: PC_QTY } } })).blocking > 0;
console.log('\n----------------------------------------');
console.log('SEND_GUARD_MEASURED: missing_upc_send_blocked=' + MISSING_UPC_BLOCKED);
console.log('§37 SEND CLAUSE: ' + (MISSING_UPC_BLOCKED ? 'CLOSED — §14 Send block IMPLEMENTED' : 'OPEN'));
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('REQUEST ORDER SEND CARTON GATE (S8-R49-D): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
