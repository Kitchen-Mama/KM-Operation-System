// =================================================================================================================
// S3-R10 — A WRITE THAT COMMITTED, REPORTED AS "NOTHING WAS WRITTEN".
//
// THE DEFECT, IN ONE SENTENCE. A pricing bulk update committed to pricing_list, the browser lost the response
// on the Apps Script redirect hop, and the UI said "Write refused. Nothing was written. API returned 404."
//
// Every part of that sentence except the 404 was a guess. `if (!resp.ok) throw 'API returned ' + status` is a
// statement about the browser's journey being reported as a statement about the database's contents, and those
// are different facts with different owners. The client had no way to tell them apart, so it asserted the one
// that happened to be reachable.
//
// WHAT MAKES THE OUTCOME DECIDABLE. Three things, and none of them is a retry:
//
//   1. A LOGICAL WRITE IDENTITY, minted once per user-confirmed write and unchanged across verification.
//   2. A COMMIT RECEIPT, written by the server AFTER pricing_list, AFTER pricing_change_log, after the flush
//      and still inside the lock — so a receipt cannot exist unless the mutation landed.
//   3. A STRICTLY READ-ONLY STATUS LOOKUP keyed by that identity, which the client calls INSTEAD of resending.
//
// WHY NOT A NEW TABLE. This repository already solved this shape once, for Request Order Send (66_): an
// identity, a journal in Script Properties, and a read-only status action. Reusing it costs no migration and
// no retention policy, and §18 exempts a pricing-local receipt built on existing canonical infrastructure.
//
// THE THREE THINGS THIS SUITE IS MOST CAREFUL ABOUT.
//
// · OUTCOME_UNKNOWN IS NOT REJECTION (§1). Section D drives a commit whose response is then replaced by a
//   redirect 404 and requires that the UI never claims a zero-write. Collapsing C into B is the entire bug.
// · ABSENCE IS ONLY EVIDENCE WHILE THE EVIDENCE WOULD STILL BE THERE. A receipt proves a commit at any age,
//   so the reader does NOT expire it; the TTL is a cleanup horizon, and the status answer reports how long
//   absence can be trusted rather than asserting it. The first draft of this round had that backwards and
//   would have answered "not committed" about a real commit from the previous day.
// · THE IDENTITY MUST NOT COLLIDE. `_kmNextWriteRequestId_()` is per-session and sequential — REQ-W000001 in
//   every tab — so using it as an idempotency key would let one operator's first write of the day be answered
//   from another operator's receipt and silently never applied. Section F asserts it is not used.
//
// WRITE_AUTOREPLAY_ADDED = NO, asserted by execution in section E rather than by intention.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const GS73 = read('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
const GS01 = read('assets/specs/active/apps-script/01_router.gs');
const GS63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
const DBAPI = read('assets/js/api/operation-system-db-api.js');
const PAGE = read('assets/js/pages/sku-regional-details.js');

// -----------------------------------------------------------------------------------------------------------
// A pricing world: the real 73_ executed against fake sheets and a fake Script Properties store.
// -----------------------------------------------------------------------------------------------------------
const PRICE_HEADER = ['pricing_id', 'marketplace_sku_id', 'currency',
  'base_regular_price', 'auto_regular_price', 'regular_price', 'regular_price_is_manual',
  'base_minimum_price', 'auto_minimum_price', 'minimum_price', 'minimum_price_is_manual',
  'base_msrp', 'auto_msrp', 'msrp', 'msrp_is_manual', 'price_source', 'updated_by', 'updated_at'];
const LOG_HEADER = ['log_id', 'pricing_id', 'field_name', 'old_value', 'new_value',
  'change_type', 'changed_by', 'changed_at', 'change_reason'];

function fakeSheet(name, grid) {
  const g = grid.map((r) => r.slice());
  const api = {
    __name: name, __grid: g,
    getLastRow: () => g.length,
    getLastColumn: () => (g[0] || []).length,
    getDataRange: () => ({ getValues: () => g.map((r) => r.slice()) }),
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        const rows = [];
        for (let i = 0; i < (nr || 1); i++) {
          const row = [];
          for (let j = 0; j < (nc || 1); j++) row.push((g[r - 1 + i] || [])[c - 1 + j]);
          rows.push(row);
        }
        return rows;
      },
      setValue: (v) => { while (g.length < r) g.push(new Array((g[0] || []).length).fill('')); g[r - 1][c - 1] = v; },
      setValues: (vals) => {
        vals.forEach((row, i) => {
          while (g.length < r + i) g.push(new Array((g[0] || []).length).fill(''));
          row.forEach((v, j) => { g[r - 1 + i][c - 1 + j] = v; });
        });
      }
    })
  };
  return api;
}

function pricingWorld(opts) {
  opts = opts || {};
  const priceSheet = fakeSheet('pricing_list', [PRICE_HEADER,
    ['P1', 'M1', 'USD', '10', '12', '12', 'FALSE', '5', '6', '6', 'FALSE', '20', '24', '24', 'FALSE', 'AUTO', '', ''],
    ['P2', 'M2', 'USD', '30', '36', '36', 'FALSE', '15', '18', '18', 'FALSE', '60', '72', '72', 'FALSE', 'AUTO', '', '']]);
  const logSheet = fakeSheet('pricing_change_log', [LOG_HEADER]);
  const props = opts.props || { __store: {} };
  if (!props.getProperty) {
    props.getProperty = (k) => (Object.prototype.hasOwnProperty.call(props.__store, k) ? props.__store[k] : null);
    props.setProperty = (k, v) => { if (opts.propsWriteThrows) throw new Error('quota'); props.__store[k] = String(v); };
  }
  let uuid = 0;
  const S = {
    console: console, Object, Array, String, Number, Math, JSON, isFinite, Date,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ __ss: true }), flush: () => { S.__flushed = true; } },
    Session: { getScriptTimeZone: () => 'UTC' },
    Utilities: { formatDate: () => '2026-09-26 00:00:00', getUuid: () => { uuid++; return 'uuid-' + uuid + '-0000000000'; } },
    LockService: { getScriptLock: () => ({ tryLock: () => opts.lockFails !== true, releaseLock: () => {} }) },
    PropertiesService: opts.noProps ? undefined : { getScriptProperties: () => props },
    prodRequireSheet_: (ss, name) => (name === 'pricing_list' ? priceSheet : logSheet),
    prodRequireColumns_: () => true,
    __price: priceSheet, __log: logSheet, __props: props, __flushed: false
  };
  vm.createContext(S);
  vm.runInContext(GS73, S, { filename: '73_api_v1_pricing_write.gs' });
  return S;
}

const LINE = { marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '11' };

// ===========================================================================================================
section('A — THE RECEIPT: written only after the commit, and only for a real write');
// ===========================================================================================================
{
  const W = pricingWorld();
  const env = W.handlePricingUpdate_({ write_id: 'PRW-A1', changed_by: 'alice',
    change_reason: 'negotiated', lines: [LINE] });
  ok(env.success, 'A1 the write succeeds', env.error);
  eq(env.data.written, 1, 'A1a one row written');
  eq(env.data.committed, true, 'A2 the envelope states committed');
  eq(env.data.write_id, 'PRW-A1', 'A2a and carries the write id back');
  eq(env.data.receipt_stored, true, 'A2b and says the receipt was stored');

  const raw = W.__props.__store['PRW_RCPT_PRW-A1'];
  ok(!!raw, 'A3 a receipt exists under the write id');
  const r = JSON.parse(raw);
  eq(r.committed, true, 'A3a it records committed');
  eq(r.written, 1, 'A3b with the affected row count');
  eq(r.logged, 1, 'A3c and the change-log count');
  eq(r.pricing_ids, ['P1'], 'A3d and the canonical entity identifiers');
  ok(!!r.committed_at, 'A3e and when');

  // §5 — the receipt may not exist without the mutation. Proven by ORDER, not by assertion: the sheet already
  // holds the new value at the moment the receipt is written.
  eq(W.__price.__grid[1][5], 11, 'A4 pricing_list carries the new regular_price');
  eq(W.__log.__grid.length, 2, 'A4a and pricing_change_log has the audit row');
  eq(W.__flushed, true, 'A4b and the flush happened');
}
{
  const W = pricingWorld();
  const env = W.handlePricingUpdate_({ write_id: 'PRW-DRY', dry_run: true, lines: [LINE] });
  ok(env.success && env.data.dry_run === true, 'A5 a dry run succeeds as a preview');
  eq(Object.keys(W.__props.__store).length, 0,
    'A5a and writes NO receipt — a preview that left a receipt would make a later verification claim a commit '
    + 'that never happened');
  eq(W.__price.__grid[1][5], '12', 'A5b and changes nothing');
}
{
  // A receipt store that refuses must NOT fail a write that already committed.
  const W = pricingWorld({ propsWriteThrows: true });
  const env = W.handlePricingUpdate_({ write_id: 'PRW-NOSTORE', lines: [LINE] });
  ok(env.success, 'A6 the write still succeeds when the receipt store refuses');
  eq(env.data.receipt_stored, false, 'A6a and says so honestly rather than claiming a receipt it does not have');
  eq(W.__price.__grid[1][5], 11, 'A6b the mutation is the truth; the receipt is only evidence of it');
}

// ===========================================================================================================
section('B — THE STATUS LOOKUP: read-only, and careful about absence');
// ===========================================================================================================
{
  const W = pricingWorld();
  W.handlePricingUpdate_({ write_id: 'PRW-B1', lines: [LINE] });

  const hit = W.handlePricingWriteStatus_({ payload: { write_id: 'PRW-B1' } });
  ok(hit.success, 'B1 the status lookup answers');
  eq(hit.data.status, 'COMMITTED', 'B1a COMMITTED for a write that landed');
  eq(hit.data.zero_write, true, 'B1b and declares itself a zero-write');
  eq(hit.data.written, 1, 'B1c carrying the receipt figures');

  const miss = W.handlePricingWriteStatus_({ payload: { write_id: 'PRW-NEVER' } });
  eq(miss.data.status, 'NOT_COMMITTED', 'B2 NOT_COMMITTED when no receipt exists');
  ok(typeof miss.data.authoritative_within_ms === 'number',
    'B2a and it says HOW LONG that absence can be trusted, rather than asserting it forever');

  const bad = W.handlePricingWriteStatus_({ payload: {} });
  ok(!bad.success, 'B3 a lookup with no write id is refused');

  // The sheets must be untouched by a status call.
  const before = JSON.stringify(W.__price.__grid);
  W.handlePricingWriteStatus_({ payload: { write_id: 'PRW-B1' } });
  eq(JSON.stringify(W.__price.__grid), before, 'B4 a status call mutates nothing');
}
{
  const W = pricingWorld({ noProps: true });
  const res = W.handlePricingWriteStatus_({ payload: { write_id: 'PRW-X' } });
  eq(res.data.status, 'UNKNOWN', 'B5 an unavailable receipt store answers UNKNOWN');
  eq(res.data.reason, 'RECEIPT_STORE_UNAVAILABLE', 'B5a naming why');
  ok(String(res.data.next_action).indexOf('resubmit') > 0,
    'B5b and gives the operator a safe action rather than a verdict it cannot support');
}
{
  // A receipt proves a commit at ANY age. The reader must not expire it into a false "not committed".
  const W = pricingWorld();
  W.__props.__store['PRW_RCPT_PRW-OLD'] = JSON.stringify({
    write_id: 'PRW-OLD', committed: true, committed_at: '2026-09-01 00:00:00',
    committed_at_ms: Date.now() - (100 * 86400000), written: 1, logged: 1, pricing_ids: ['P1'] });
  const res = W.handlePricingWriteStatus_({ payload: { write_id: 'PRW-OLD' } });
  eq(res.data.status, 'COMMITTED',
    'B6 a 100-day-old receipt still reports COMMITTED — the TTL is a cleanup horizon, not an expiry of truth');
}

// ===========================================================================================================
section('C — §7 IDEMPOTENCY: the same logical write twice');
// ===========================================================================================================
{
  const W = pricingWorld();
  const first = W.handlePricingUpdate_({ write_id: 'PRW-C1', changed_by: 'alice', lines: [LINE] });
  eq(first.data.written, 1, 'C1 the first arrival writes');
  const logRowsAfterFirst = W.__log.__grid.length;

  const second = W.handlePricingUpdate_({ write_id: 'PRW-C1', changed_by: 'alice', lines: [LINE] });
  ok(second.success, 'C2 the second arrival of the SAME write id succeeds');
  eq(second.data.replayed, true, 'C2a and is marked as a replay rather than a fresh write');
  eq(second.data.committed, true, 'C2b reporting the commit that really happened');
  eq(second.data.written, 1, 'C2c with the ORIGINAL row count, not zero');

  eq(W.__log.__grid.length, logRowsAfterFirst,
    'C3 NO duplicate pricing_change_log row — DUPLICATE_SAME_WRITE_ID_EFFECT = no duplicate business event');
  eq(W.__price.__grid[1][5], 11, 'C3a and pricing_list is unchanged by the replay');

  // A DIFFERENT write id for the same intent is a different logical write and is allowed to act.
  const W2 = pricingWorld();
  W2.handlePricingUpdate_({ write_id: 'PRW-D1', lines: [LINE] });
  const n1 = W2.__log.__grid.length;
  W2.handlePricingUpdate_({ write_id: 'PRW-D2', lines: [{ marketplace_sku_id: 'M1', regular_price_mode: 'MANUAL', regular_price: '13' }] });
  ok(W2.__log.__grid.length > n1, 'C4 a DIFFERENT write id is a different write and does act');
  eq(W2.__price.__grid[1][5], 13, 'C4a landing the second value');

  // Replay must not depend on the payload still matching — the receipt is the authority.
  const W3 = pricingWorld();
  W3.handlePricingUpdate_({ write_id: 'PRW-C9', lines: [LINE] });
  const before = JSON.stringify(W3.__price.__grid);
  const rep = W3.handlePricingUpdate_({ write_id: 'PRW-C9',
    lines: [{ marketplace_sku_id: 'M2', regular_price_mode: 'MANUAL', regular_price: '99' }] });
  eq(rep.data.replayed, true, 'C5 a replayed write id is answered from the receipt');
  eq(JSON.stringify(W3.__price.__grid), before,
    'C5a and mutates nothing, even when the resent payload differs — one write id, one mutation');

  const W4 = pricingWorld();
  W4.handlePricingUpdate_({ write_id: 'PRW-C10', dry_run: true, lines: [LINE] });
  const real = W4.handlePricingUpdate_({ write_id: 'PRW-C10', lines: [LINE] });
  eq(real.data.written, 1,
    'C6 a dry run does not consume the write id — the preview must not make the real write look like a replay');
}

// ===========================================================================================================
section('D — §12 THE CLIENT: the four outcomes, driven end to end');
// ===========================================================================================================

/* The real client functions, sliced out and executed. Everything they depend on is injected, so what runs here
   is the shipped code rather than a description of it. */
function clientWorld(opts) {
  opts = opts || {};
  const start = DBAPI.indexOf('window.KM.DB.updatePricing = async function(payload) {');
  const end = DBAPI.indexOf('\nwindow.KM.DB.getFcRegularForecast');
  if (start < 0 || end < 0 || end <= start) throw new Error('HARNESS: could not slice the pricing write path');
  const src = DBAPI.slice(start, end);

  const calls = { fetches: [], statusReads: [], postWrite: 0 };
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, Date, Error, Promise, isFinite,
    crypto: opts.noCrypto ? undefined : { randomUUID: () => 'uuid-' + (++ctx.__n) },
    __n: 0,
    OP_DB_API_BASE_URL: 'https://script.google.com/macros/s/X/exec',
    isOperationDbApiConfigured: () => true,
    _kmWriterPostWrite_: async () => { calls.postWrite += 1; },
    _kmFetchBounded_: async (url, init) => {
      calls.fetches.push({ url, body: JSON.parse(init.body), method: init.method });
      return opts.dispatch(calls.fetches.length, JSON.parse(init.body));
    },
    _kmClassifyAnswer_: (action, kind, resp, text) => {
      if (resp.__lost) {
        return { ok: false, legacyCode: 'HTTP_NOT_FOUND', typed: { code: 'REDIRECT_TARGET_NOT_FOUND' }, wire: {} };
      }
      return { ok: true, typed: {}, wire: {} };
    },
    _kmTypedTransportMessage_: () => 'The API redirect target had already expired.',
    _kmGapRead_: async (action, payload) => {
      calls.statusReads.push({ action, payload });
      return opts.status ? opts.status(payload.payload.write_id) : { success: false };
    },
    window: { KM: { DB: { getApiBaseUrl: () => 'https://script.google.com/macros/s/X/exec' } } }
  };
  ctx.window.KM.DB.getPricingWriteStatus = null;   // replaced by the sliced source
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'db-api-pricing-slice.js' });
  return { ctx, calls, updatePricing: ctx.window.KM.DB.updatePricing };
}

const COMMITTED_RESP = { __lost: false, text: async () => JSON.stringify({ success: true,
  data: { written: 1, logged: 1, rows: [{ pricing_id: 'P1' }], committed: true } }) };
const LOST_RESP = { __lost: true, text: async () => '<html>404</html>' };
const REJECT_RESP = { __lost: false, text: async () => JSON.stringify({ success: false,
  error: 'VALIDATION_FAILED', detail: '1 problem(s). ZERO rows were written.', data: { errors: [{ line: 1 }] } }) };

(async function D() {
  // ---- §12 A — the write commits, the response is lost, verification finds the receipt -------------------
  {
    const W = clientWorld({
      dispatch: () => LOST_RESP,
      status: (id) => ({ success: true, data: { data: { status: 'COMMITTED', write_id: id, written: 1 } } })
    });
    let result = null, threw = null;
    try { result = await W.updatePricing({ changed_by: 't', lines: [LINE] }); } catch (e) { threw = e; }
    ok(!threw, 'D1 §12A a committed write whose response was lost resolves as SUCCESS', threw && threw.message);
    eq(result && result.write_outcome, 'CONFIRMED_COMMITTED', 'D1a final outcome CONFIRMED_COMMITTED');
    eq(result && result.recovered, true, 'D1b marked as recovered by verification rather than by the response');
    eq(W.calls.fetches.length, 1, 'D1c EXACTLY ONE write was dispatched — no replay');
    eq(W.calls.statusReads.length, 1, 'D1d and exactly one read-only verification');
    eq(W.calls.statusReads[0].action, 'pricing.write.status', 'D1e through the read-only status action');
  }

  // ---- §12 B — the write never committed and verification says so ---------------------------------------
  {
    const W = clientWorld({
      dispatch: () => LOST_RESP,
      status: (id) => ({ success: true, data: { data: { status: 'NOT_COMMITTED', write_id: id } } })
    });
    let threw = null;
    try { await W.updatePricing({ changed_by: 't', lines: [LINE] }); } catch (e) { threw = e; }
    ok(!!threw, 'D2 §12B a write that did not commit is reported as a failure');
    eq(threw.write_outcome, 'CONFIRMED_REJECTED', 'D2a CONFIRMED_REJECTED');
    eq(threw.zero_write, true, 'D2b and only here is a zero-write claimed');
    eq(threw.verified, true, 'D2c because verification established it, not because the transport failed');
    eq(W.calls.fetches.length, 1, 'D2d still exactly one dispatch');
  }

  // ---- §12 C — the outcome cannot be determined ---------------------------------------------------------
  {
    const W = clientWorld({ dispatch: () => LOST_RESP, status: () => ({ success: false }) });
    let threw = null;
    try { await W.updatePricing({ changed_by: 't', lines: [LINE] }); } catch (e) { threw = e; }
    ok(!!threw, 'D3 §12C an undeterminable outcome is not presented as success');
    eq(threw.write_outcome, 'OUTCOME_UNKNOWN', 'D3a it stays OUTCOME_UNKNOWN');
    eq(threw.zero_write, false,
      'D3b and explicitly does NOT claim a zero-write — this is the whole defect, asserted');
    ok(!!threw.write_id, 'D3c carrying the write id, so the operator has a reference to check');
    eq(W.calls.fetches.length, 1, 'D3d and still no replay');
  }
  {
    // verification that THROWS must also stay UNKNOWN
    const W = clientWorld({ dispatch: () => LOST_RESP, status: () => { throw new Error('offline'); } });
    let threw = null;
    try { await W.updatePricing({ changed_by: 't', lines: [LINE] }); } catch (e) { threw = e; }
    eq(threw.write_outcome, 'OUTCOME_UNKNOWN', 'D4 verification that itself fails leaves the outcome UNKNOWN');
    eq(W.calls.fetches.length, 1, 'D4a and does not trigger a retry of the write');
  }

  // ---- §12 D — the server rejects before mutating --------------------------------------------------------
  {
    const W = clientWorld({ dispatch: () => REJECT_RESP, status: () => ({ success: true, data: { data: { status: 'NOT_COMMITTED' } } }) });
    let threw = null;
    try { await W.updatePricing({ changed_by: 't', lines: [LINE] }); } catch (e) { threw = e; }
    eq(threw.write_outcome, 'CONFIRMED_REJECTED', 'D5 §12D an authoritative server rejection is CONFIRMED_REJECTED');
    eq(threw.zero_write, true, 'D5a a real zero-write');
    eq(threw.error_code, 'VALIDATION_FAILED', 'D5b carrying the server code');
    ok(Array.isArray(threw.errors) && threw.errors.length === 1, 'D5c and the per-line problems');
    eq(W.calls.statusReads.length, 0,
      'D5d NO verification read — the server already answered, so asking again would be noise');
  }

  // ---- the happy path still works ------------------------------------------------------------------------
  {
    const W = clientWorld({ dispatch: () => COMMITTED_RESP });
    const r = await W.updatePricing({ changed_by: 't', lines: [LINE] });
    eq(r.write_outcome, 'CONFIRMED_COMMITTED', 'D6 a normal successful write is CONFIRMED_COMMITTED');
    eq(W.calls.statusReads.length, 0, 'D6a with no verification needed');
    eq(W.calls.postWrite, 1, 'D6b and the post-write refresh still runs');
    ok(!!W.calls.fetches[0].body.write_id, 'D6c the write carried a write_id');
  }

  // ---- a dry run is a preview, and must not mint or consume an identity -----------------------------------
  {
    const W = clientWorld({ dispatch: () => COMMITTED_RESP });
    await W.updatePricing({ dry_run: true, lines: [LINE] });
    eq(W.calls.fetches[0].body.write_id, undefined, 'D7 a dry run carries NO write id');
    eq(W.calls.postWrite, 0, 'D7a and triggers no post-write refresh');
  }

  // ===========================================================================================================
  section('E — §10 NO AUTO REPLAY, AND §4 IDENTITY STABILITY');
  // ===========================================================================================================
  {
    // Every failure mode, and in none of them may a second mutation be dispatched.
    const modes = [
      ['lost response + committed', () => LOST_RESP, (id) => ({ success: true, data: { data: { status: 'COMMITTED', write_id: id } } })],
      ['lost response + not committed', () => LOST_RESP, () => ({ success: true, data: { data: { status: 'NOT_COMMITTED' } } })],
      ['lost response + unknown', () => LOST_RESP, () => ({ success: true, data: { data: { status: 'UNKNOWN' } } })],
      ['server rejection', () => REJECT_RESP, () => ({ success: true, data: { data: { status: 'NOT_COMMITTED' } } })]
    ];
    for (const [label, dispatch, status] of modes) {
      const W = clientWorld({ dispatch, status });
      try { await W.updatePricing({ changed_by: 't', lines: [LINE] }); } catch (e) { /* expected */ }
      eq(W.calls.fetches.length, 1, 'E1 ' + label + ' — exactly ONE write dispatched');
      ok(W.calls.fetches.every((f) => f.body.action === 'pricing.update'), 'E1a ' + label + ' — and it was the write, once');
    }
  }
  {
    // §4 — the identity must not be regenerated during verification.
    const W = clientWorld({
      dispatch: () => LOST_RESP,
      status: (id) => ({ success: true, data: { data: { status: 'COMMITTED', write_id: id } } })
    });
    await W.updatePricing({ changed_by: 't', lines: [LINE] });
    const sent = W.calls.fetches[0].body.write_id;
    const verified = W.calls.statusReads[0].payload.payload.write_id;
    eq(verified, sent, 'E2 verification asks about the SAME write id that was dispatched');
    ok(/^PRW-/.test(sent), 'E2a and the identity is namespaced to pricing');
  }
  {
    // Two writes must never share an identity, with or without crypto.randomUUID. Measured inside ONE world,
    // because that is what a session is: rebuilding the world per write would reset the stub and measure the
    // harness instead of the code. (The first draft did exactly that and reported 1 distinct id from 50.)
    for (const noCrypto of [false, true]) {
      const W = clientWorld({ dispatch: () => COMMITTED_RESP, noCrypto });
      for (let i = 0; i < 50; i++) await W.updatePricing({ changed_by: 't', lines: [LINE] });
      const ids = new Set(W.calls.fetches.map((f) => f.body.write_id));
      eq(ids.size, 50,
        'E3 50 writes in one session produce 50 distinct ids (crypto.randomUUID '
        + (noCrypto ? 'absent' : 'present') + ')');
    }
  }

  // ===========================================================================================================
  section('F — SOURCE OBLIGATIONS: what must remain true');
  // ===========================================================================================================
  {
    const slice = DBAPI.slice(DBAPI.indexOf('window.KM.DB.updatePricing'), DBAPI.indexOf('\nwindow.KM.DB.getFcRegularForecast'));
    // Comments stripped first: this code EXPLAINS why the session counter is unsuitable, so a naive substring
    // search finds the explanation and calls it a use. What is forbidden is the call, not the discussion.
    const code = slice.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    ok(code.indexOf('_kmNextWriteRequestId_') < 0,
      'F1 the session-sequential correlation id is NOT used as the idempotency key — it collides across tabs, '
      + 'which would answer one operator\'s write from another\'s receipt');
    ok(slice.indexOf("throw new Error('API returned '") < 0,
      'F2 the raw "API returned <status>" throw is gone — that sentence was a claim about the browser reported '
      + 'as a claim about the database');
    ok(/_kmFetchBounded_\(/.test(slice), 'F3 the write is dispatched through the BOUNDED transport');
    ok(!/updatePricing[\s\S]{0,4000}?attempt\s*\(|retryWrite/.test(slice), 'F4 there is no write retry loop');

    // The status action is a READ everywhere it is declared.
    ok(/'pricing\.write\.status': 1/.test(DBAPI), 'F5 pricing.write.status is on the client GET read registry');
    ok(!/'pricing\.update': 1/.test(DBAPI), 'F5a and pricing.update is NOT — a write never joins the read table');
    ok(/'pricing\.write\.status':\s+handlePricingWriteStatus_/.test(GS01),
      'F6 the router routes it to the read-only handler');
    ok(/action === 'pricing\.write\.status'/.test(GS01), 'F6a and dispatches it');
    ok(/\{ action: 'pricing\.write\.status', handler: 'handlePricingWriteStatus_'/.test(GS63),
      'F7 and it is declared in the health manifest');

    // §5 — receipt strictly after the mutations.
    const fn = GS73.slice(GS73.indexOf('function handlePricingUpdate_'));
    const body = fn.slice(0, fn.indexOf('\nfunction '));
    const iFlush = body.indexOf('SpreadsheetApp.flush()');
    const iReceipt = body.indexOf('prwReceiptWrite_');
    const iLog = body.indexOf('logSheet.getRange(logSheet.getLastRow()');
    ok(iLog > 0 && iFlush > iLog && iReceipt > iFlush,
      'F8 the receipt is written AFTER the change-log write and AFTER the flush — it cannot exist without '
      + 'the mutation it attests to', { log: iLog, flush: iFlush, receipt: iReceipt });
    ok(body.indexOf('lock.releaseLock') > iReceipt, 'F8a and still inside the lock');

    // §9 — the UI may not claim a zero-write it does not know.
    ok(/_srdWriteFailureHtml_/.test(PAGE), 'F9 the page routes write failures through one truthfulness helper');
    const helper = PAGE.slice(PAGE.indexOf('function _srdWriteFailureHtml_'), PAGE.indexOf('function srdBulkConfirm'));
    ok(/OUTCOME_UNKNOWN/.test(helper), 'F9a which branches on OUTCOME_UNKNOWN');
    ok(helper.indexOf('Nothing was written') > 0 && /couldn/i.test(helper),
      'F9b keeping "Nothing was written" for the rejected case and a non-committal wording for the unknown one');
    ok(/Do not submit this update again/.test(helper),
      'F9c and tells the operator not to resubmit — the one action that turns uncertainty into damage');
    eq((PAGE.match(/Write refused\. <strong>Nothing was written\./g) || []).length, 0,
      'F10 no post-dispatch surface still asserts a zero-write unconditionally');
  }

  // ===========================================================================================================
  section('G — §13 THE PRICING AUTHORITY MODEL IS UNTOUCHED');
  // ===========================================================================================================
  {
    const W = pricingWorld();
    // Update Price: the selected field becomes a manual override; the others stay where they were.
    W.handlePricingUpdate_({ write_id: 'PRW-G1', lines: [{ marketplace_sku_id: 'M1',
      regular_price_mode: 'MANUAL', regular_price: '11' }] });
    const row = W.__price.__grid[1];
    eq(row[5], 11, 'G1 regular_price takes the manual value');
    eq(row[6], 'TRUE', 'G1a and is flagged manual');
    eq(row[9], '6', 'G2 minimum_price is UNTOUCHED');
    eq(row[10], 'FALSE', 'G2a and its flag is untouched');
    eq(row[13], '24', 'G2b msrp is untouched');
    eq(row[3], '10', 'G3 base_regular_price is not writeable and did not move');
    eq(row[4], '12', 'G3a auto_regular_price is not writeable and did not move');

    // Use Auto: the override clears and the resolved value falls back to auto.
    const W2 = pricingWorld();
    W2.handlePricingUpdate_({ write_id: 'PRW-G2', lines: [{ marketplace_sku_id: 'M1',
      regular_price_mode: 'MANUAL', regular_price: '11' }] });
    W2.handlePricingUpdate_({ write_id: 'PRW-G3', lines: [{ marketplace_sku_id: 'M1',
      regular_price_mode: 'AUTO' }] });
    eq(W2.__price.__grid[1][6], 'FALSE', 'G4 Use Auto clears the manual flag');
    // The resolved cell is CLEARED, not overwritten with the auto number: auto_regular_price stays the
    // source and the read path falls back to it. (Established behaviour — pricing-r2 D10, RETURN_TO_AUTO.)
    eq(String(W2.__price.__grid[1][5]), '',
      'G4a and the resolved override is cleared so auto_regular_price becomes the source again');
    eq(String(W2.__price.__grid[1][4]), '12', 'G4b while the auto value itself is untouched');
  }

  // ===========================================================================================================
  section('J — MUTANTS');
  // ===========================================================================================================
  {
    let killed = 0, survived = 0, harness = 0;

    function worldFrom(src, opts) {
      opts = opts || {};
      const priceSheet = fakeSheet('pricing_list', [PRICE_HEADER,
        ['P1', 'M1', 'USD', '10', '12', '12', 'FALSE', '5', '6', '6', 'FALSE', '20', '24', '24', 'FALSE', 'AUTO', '', ''],
        ['P2', 'M2', 'USD', '30', '36', '36', 'FALSE', '15', '18', '18', 'FALSE', '60', '72', '72', 'FALSE', 'AUTO', '', '']]);
      const logSheet = fakeSheet('pricing_change_log', [LOG_HEADER]);
      const props = { __store: {} };
      props.getProperty = (k) => (Object.prototype.hasOwnProperty.call(props.__store, k) ? props.__store[k] : null);
      props.setProperty = (k, v) => {
        if (opts.propsWriteThrows) throw new Error('quota');
        props.__store[k] = String(v);
      };
      let uuid = 0;
      const S = {
        console, Object, Array, String, Number, Math, JSON, isFinite, Date,
        SpreadsheetApp: { getActiveSpreadsheet: () => ({}), flush: () => { S.__flushed = true; } },
        Session: { getScriptTimeZone: () => 'UTC' },
        Utilities: { formatDate: () => '2026-09-26 00:00:00', getUuid: () => 'uuid-' + (++uuid) + '-0000000000' },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
        PropertiesService: opts.noProps ? undefined : { getScriptProperties: () => props },
        prodRequireSheet_: (ss, name) => (name === 'pricing_list' ? priceSheet : logSheet),
        prodRequireColumns_: () => true,
        __price: priceSheet, __log: logSheet, __props: props, __flushed: false
      };
      vm.createContext(S);
      vm.runInContext(src, S, { filename: 'mutant.gs' });
      return S;
    }

    /* Each probe returns TRUTHY when it OBSERVES THE MUTANT'S WRONG BEHAVIOUR. A missing anchor is a loud
       HARNESS ERROR, never a silent SURVIVED. */
    function mutate(label, from, to, probe, opts) {
      if (GS73.indexOf(from) < 0) {
        harness++; console.log('  HARNESS ERROR ' + label + ' \u2014 anchor not found: ' + JSON.stringify(from.slice(0, 60)));
        return;
      }
      let observed = false;
      try { observed = probe(worldFrom(GS73.replace(from, to), opts)); }
      catch (e) { observed = true; }
      if (observed) { killed++; console.log('  ok   ' + label + ' KILLED'); }
      else { survived++; console.log('  FAIL ' + label + ' SURVIVED'); }
    }

    // J1 — the idempotency guard is removed, so the same logical write mutates twice.
    mutate('J1 the replay guard is removed', 'if (writeId && !dryRun) {', 'if (false) {', (S) => {
      S.handlePricingUpdate_({ write_id: 'X', lines: [LINE] });
      const n = S.__log.__grid.length;
      S.handlePricingUpdate_({ write_id: 'X',
        lines: [{ marketplace_sku_id: 'M2', regular_price_mode: 'MANUAL', regular_price: '31' }] });
      return S.__log.__grid.length > n;
    });

    // J2 — a PREVIEW leaves a receipt, so a later verification would report a commit that never happened.
    mutate('J2 a dry run stores a receipt',
      '  if (dryRun) {\r\n    return prwEnvelope_(true, { dry_run: true,',
      '  if (dryRun) {\r\n    prwReceiptWrite_(writeId, { write_id: writeId, committed: true });\r\n    return prwEnvelope_(true, { dry_run: true,',
      (S) => {
        S.handlePricingUpdate_({ write_id: 'DRY', dry_run: true, lines: [LINE] });
        return Object.keys(S.__props.__store).length > 0;
      });

    // J3 — the reader expires a genuine receipt, turning a real commit into "not committed".
    mutate('J3 an old receipt is expired into NOT_COMMITTED',
      '  return r;\r\n}\r\nfunction prwReceiptWrite_',
      '  if (r && r.committed_at_ms && (Date.now() - Number(r.committed_at_ms)) > PRW_RECEIPT_TTL_MS_) return null;\r\n  return r;\r\n}\r\nfunction prwReceiptWrite_',
      (S) => {
        S.__props.__store['PRW_RCPT_OLD'] = JSON.stringify({ write_id: 'OLD', committed: true,
          committed_at_ms: Date.now() - (100 * 86400000), written: 1 });
        return S.handlePricingWriteStatus_({ payload: { write_id: 'OLD' } }).data.status !== 'COMMITTED';
      });

    // J4 — an unavailable receipt store answers NOT_COMMITTED instead of UNKNOWN. This is the original
    // defect wearing a different hat: a confident zero-write claim the server cannot support.
    mutate('J4 an unavailable store claims NOT_COMMITTED',
      "    return prwEnvelope_(true, { status: 'UNKNOWN', write_id: writeId, zero_write: true,",
      "    return prwEnvelope_(true, { status: 'NOT_COMMITTED', write_id: writeId, zero_write: true,",
      (S) => S.handlePricingWriteStatus_({ payload: { write_id: 'ANY' } }).data.status !== 'UNKNOWN',
      { noProps: true });

    // J5 — the envelope claims a receipt it does not have. A client that trusts `receipt_stored: true`
    // would later read an absent receipt as proof of no commit, which is the original defect returning by the
    // back door. (The mutation first written here threw while EVALUATING the receipt argument, so it never
    // reached the write and created no defect at all — it survived for being inert, not for being safe.)
    mutate('J5 the envelope claims a receipt that was never stored',
      'receiptStored = prwReceiptWrite_(writeId, {',
      'receiptStored = true; prwReceiptWrite_(writeId, {',
      (S) => {
        const env = S.handlePricingUpdate_({ write_id: 'F1', lines: [LINE] });
        return env.success && env.data.receipt_stored === true
          && S.handlePricingWriteStatus_({ payload: { write_id: 'F1' } }).data.status !== 'COMMITTED';
      }, { propsWriteThrows: true });

    // J6 — the replay answer reports zero rows, so a duplicate arrival looks like a no-op to the caller.
    mutate('J6 a replay reports written: 0',
      '        written: prior.written, logged: prior.logged, validated: prior.validated,',
      '        written: 0, logged: 0, validated: prior.validated,',
      (S) => {
        S.handlePricingUpdate_({ write_id: 'R1', lines: [LINE] });
        return S.handlePricingUpdate_({ write_id: 'R1', lines: [LINE] }).data.written !== 1;
      });

    pass += killed; fail += survived + harness;
    console.log('  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harness + ' harness errors');
  }

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
  console.log('WRITE_AUTOREPLAY_ADDED = NO · OUTCOME_UNKNOWN != REJECTED · DUPLICATE_WRITE_ID = NO DUPLICATE MUTATION');
  process.exit(fail === 0 ? 0 : 1);
}()).catch((e) => { console.log('HARNESS ERROR ' + (e && e.stack || e)); process.exit(1); });
