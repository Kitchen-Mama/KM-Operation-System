// =================================================================================================================
// S3-R13 — THE TWO TABLES THE SPECIAL BUILDER BOUGHT BEFORE IT COULD POSSIBLY NEED THEM.
//
// R12 measured, by execution rather than by reading the source, that opening the Special Event builder fetches
// `campaign_sku_lines` and `pricing_list` and calls NEITHER getter. It stopped there, because moving them is a
// Critical / Secondary / Lazy split and §11 reserved that for the operator. The operator has now decided it.
//
// SO THIS ROUND MOVES TWO READS, AND MOVING A READ IS NOT THE HARD PART. The hard part is that a page which used
// to hold a table unconditionally now has a third state for every cell that reads it — loaded, absent, and NOT
// YET — and the third one is easy to render as the second. A price cell that says "Missing Regular Price" when
// pricing_list is merely unread is a false empty whose correct-looking remedy (go and set a price) is wasted
// work on a price that already exists. A hydrate that runs over an empty campaign_sku_lines puts a saved event
// on screen with its discounts silently gone, one click from Save. Sections C and D are about exactly that, and
// both are measured in a real browser rather than argued.
//
// WHAT THE ROUND ALSO FOUND, and did not go looking for:
//
//   · THE HARNESS HAD BEEN READING AN EMPTY WORLD SINCE R11. `_kmGetTableOnce_` returns `json.data.rows`; the
//     fixture answered `{ data: { <table>: rows } }`. Every getTable in R11 and R12 resolved to a SUCCESSFUL
//     read of an EMPTY table. Request counts are unaffected — a count is a property of control flow — so those
//     rounds' findings stand; but nothing that reads broad-cache ROWS had ever actually been exercised, which
//     is precisely what this round defers. Section F seals the fixture so it cannot regress.
//
//   · `_evtPopulateBaseCampaigns` STILL ASKED THE BROAD CACHE for fc_special_events after R12 moved it to the
//     scoped events slice, so in workspace mode the Apply Growth Rate baseline silently had no candidates. The
//     harness could not see it because of the fault above. Section E.
//
//   · A PRICING PREVIEW CALLED A TRANSPORT FAILURE A DATABASE REJECTION. R10 sealed the WRITE path's four
//     outcomes; the DRY RUN path was left on `rejected()`, so a redirect-404 during a preview produced
//     CONFIRMED_REJECTED and printed "The database rejected the file. Nothing was written." — the operator's
//     screenshot, reproduced from the shipped source in section G before it was changed.
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
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }

const FC = () => read('assets/js/pages/fc-summary.js');
const HTML = () => read('assets/html/pages/fc-summary.html');
const SRD = () => read('assets/js/pages/sku-regional-details.js');
const DBAPI = () => read('assets/js/api/operation-system-db-api.js');
const RUNNER = () => read('assets/tests/_s3r11-interaction-runner.js');
const EV = JSON.parse(read('docs/evidence/s3-r13-fc-special-deferred/measurements.json'));
const R0 = EV.runs.serverMs0;
const R400 = EV.runs.serverMs400;

function extract(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('no such function: ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

/* THE DEFERRED LOADER, EXECUTED. Its five functions are pure decisions over injected dependencies, so running
   the REAL source against controlled inputs says more than matching its text — and it is what lets the mutants
   below attack behaviour rather than spelling. */
function deferWorld(src, deps) {
  const calls = [];
  const sandbox = {
    Promise, Object, JSON, console,
    _fcPrereqLoadedTables_: Object.assign({}, deps.loaded || {}),
    _fcPrereqInflightTables_: deps.inflight || {},
    _fcEffectiveWorkspace: () => deps.workspace !== false,
    _fcInflightFor_: (tables) => {
      const out = [];
      (tables || []).forEach((t) => { const f = sandbox._fcPrereqInflightTables_[t]; if (f && out.indexOf(f) === -1) out.push(f); });
      return out;
    },
    _fcMarkTablesInflight_: (tables, flight) => { (tables || []).forEach((t) => { sandbox._fcPrereqInflightTables_[t] = flight; }); },
    _fcReleaseTablesInflight_: (tables, flight) => {
      (tables || []).forEach((t) => { if (sandbox._fcPrereqInflightTables_[t] === flight) delete sandbox._fcPrereqInflightTables_[t]; });
    },
    window: { KM: { DB: deps.noRc ? {} : { refreshCacheTables: (names) => { calls.push(names.slice()); return deps.fetch ? deps.fetch(names) : Promise.resolve(); } } } }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src.slice(src.indexOf('var _FC_DEFERRED_TABLES_'), src.indexOf('/* ALL prerequisites of an OPEN')), ctx);
  return { ctx, calls, sandbox };
}

(async function () {

// =================================================================================================================
section('A — §1/§2 THE CRITICAL LIST IS NOW WHAT THE FIRST USABLE UI READS');
// =================================================================================================================
{
  const src = FC();
  const block = src.slice(src.indexOf('var _FC_PREREQ_TABLES_'), src.indexOf('// The union'));
  const event = /event: \[([\s\S]*?)\]/.exec(block)[1].replace(/'/g, '').replace(/\s+/g, ' ')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const regular = /regular: \[([^\]]*)\]/.exec(block)[1].replace(/'/g, '').split(',').map((s) => s.trim());

  /* FC-SUMMARY-STABILITY-R2 — TWO, and the third is the point of that round. `_kmReadTablesBounded_`
     issues one request per table at 2 lanes, so a third table is a SECOND serial 45s budget before the
     modal opens. What the builder genuinely reads to draw itself is the scope/datalist pair; campaigns
     is read by the Base Campaign selector and by existing-event rehydration, neither of which runs on
     open. The claim is stated as the two tables by name rather than as a count, because a count is what
     this line had to be edited for three rounds running. */
  eq(event, ['sku_details', 'marketplace_skus'],
    'A1  the Special path declares the tables opening the builder genuinely reads');
  ok(event.indexOf('campaign_sku_lines') === -1 && event.indexOf('pricing_list') === -1,
    'A1a and neither deferred table is on it');
  eq(regular, ['sku_details', 'marketplace_skus'],
    'A2  §6 — the REGULAR path is untouched, which is the regression this round most had to avoid');

  /* A3 — FC-SUMMARY-STABILITY-R2 CORRECTS THIS LINE, AND THIS LINE IS WHY THE DEFECT SURVIVED.
     It asserted that campaigns stays on the cold path 'because _evtPopulateBaseCampaigns fills a control
     while the builder opens'. That function is called from exactly one place — the Event Assist method
     handler, and only on `method === 'growth'`. It does not run on open, and never did. The source
     comment justifying the cold-path membership said the same thing, so the test and the code agreed
     with each other and neither agreed with the runtime.
     What is asserted now is the real rule: campaigns is deferred, and the deferral is anchored at the
     consumers that actually read it — which is also what stops this being a 'defer everything' round. */
  ok(/function _evtPopulateBaseCampaigns\(\)/.test(src) && event.indexOf('campaigns') === -1,
    'A3  campaigns is DEFERRED — its selector runs on the growth method, never on open');
  ok(/if \(method === 'growth'\) _evtPopulateBaseCampaigns\(\);/.test(src),
    'A3a and that is provable from its ONE outer call site');
  ok(/_fcDeferredPending_\(_FC_DEFERRED_TABLES_\.campaigns\)/.test(src),
    'A3b with the selector itself gating on the deferred table — the consumer buys it');

  // A4 — the deferred tables are DECLARED, not scattered as string literals at their call sites.
  // FC-SUMMARY-STABILITY-R2 — three of them now. Membership is checked per table so the next addition
  // does not have to rewrite the line, only extend the list it is checked against.
  ok(/var _FC_DEFERRED_TABLES_ = \{[^}]*\};/.test(src),
    'A4  the deferred tables are declared in one place');
  ['campaign_sku_lines', 'pricing_list', 'campaigns'].forEach(function (t, i) {
    ok(new RegExp("var _FC_DEFERRED_TABLES_ = \\{[^}]*'" + t + "'").test(src),
      'A4.' + (i + 1) + ' and ' + t + ' is one of them');
  });
  ok(!/_fcEnsureDeferredTable_\('campaign_sku_lines'\)/.test(src) && !/_fcEnsureDeferredTable_\('pricing_list'\)/.test(src),
    'A4a and every consumer names them through that declaration, never by raw string');
}

// =================================================================================================================
section('B — §3/§4 THE LOADER, EXECUTED: one request, joined, latched, released');
// =================================================================================================================
{
  const src = FC();

  // B1 — a table that is already current costs nothing at all.
  {
    const W = deferWorld(src, { loaded: { pricing_list: true } });
    await W.ctx._fcEnsureDeferredTable_('pricing_list');
    eq(W.calls.length, 0, 'B1  a current table issues no request');
  }
  // B2 — a missing table buys exactly ONE read, for exactly that table.
  {
    const W = deferWorld(src, {});
    await W.ctx._fcEnsureDeferredTable_('pricing_list');
    eq(W.calls, [['pricing_list']], 'B2  a missing table buys one read, naming only itself');
    eq(W.sandbox._fcPrereqLoadedTables_.pricing_list, true, 'B2a and is latched in the page’s one freshness record');
  }
  // B3 — SAME-MOUNT IN-FLIGHT SHARING (§3). Three consumers, one request.
  {
    let release;
    const W = deferWorld(src, { fetch: () => new Promise((r) => { release = r; }) });
    const a = W.ctx._fcEnsureDeferredTable_('campaign_sku_lines');
    const b = W.ctx._fcEnsureDeferredTable_('campaign_sku_lines');
    const c = W.ctx._fcEnsureDeferredTable_('campaign_sku_lines');
    eq(W.calls.length, 1, 'B3  three overlapping consumers issue ONE request');
    release();
    await Promise.all([a, b, c]);
    eq(W.calls.length, 1, 'B3a and still one after they all settle');
    /* TWO WALLS, NOT ONE, which is why the obvious mutant on the first is inert (see J1). The latch
       answers a repeat consumer of THIS loader; the shared in-flight index answers a consumer that
       came through a different owner entirely — a prerequisite load or a post-write warm. Removing
       either alone changes no behaviour, and that is a property worth stating rather than discovering
       again from a mutant that survives. */
    ok(!!W.sandbox._fcPrereqInflightTables_.campaign_sku_lines === false,
      'B3b and the index entry is released once the flight settles — nothing is retained');
  }
  // B4 — THE LATCH IS RELEASED ON FAILURE, so Retry issues a new request rather than re-awaiting a dead promise.
  {
    let n = 0;
    const W = deferWorld(src, { fetch: () => { n++; return Promise.reject(new Error('boom')); } });
    let threw = null;
    try { await W.ctx._fcEnsureDeferredTable_('pricing_list'); } catch (e) { threw = e; }
    ok(threw, 'B4  a failed deferred read REJECTS — nothing is swallowed');
    try { await W.ctx._fcEnsureDeferredTable_('pricing_list'); } catch (e) {}
    eq(n, 2, 'B4a and the retry issues a NEW request, not a re-await of the rejected one');
    ok(!W.sandbox._fcPrereqLoadedTables_.pricing_list, 'B4b a failed read latches nothing');
    ok(!W.sandbox._fcPrereqInflightTables_.pricing_list,
      'B4c and releases the in-flight index — a table left marked in flight is a permanent Loading, not a duplicate read');
  }
  // B5 — A TABLE SOMEONE ELSE IS ALREADY FETCHING IS JOINED, not asked for again.
  {
    let release, joined = new Promise((r) => { release = r; });
    const W = deferWorld(src, { inflight: { pricing_list: joined } });
    const p = W.ctx._fcEnsureDeferredTable_('pricing_list');
    eq(W.calls.length, 0, 'B5  a table already in flight elsewhere is joined, not re-requested');
    W.sandbox._fcPrereqLoadedTables_.pricing_list = true;   // the other flight delivered it
    release();
    await p;
    eq(W.calls.length, 0, 'B5a and when that flight lands, nothing further is asked');
  }
  // B6 — A JOINED FLIGHT THAT DIES IS NOT THIS CALLER'S FAILURE TO INHERIT: it asks once, itself.
  {
    let reject, joined = new Promise((r, j) => { reject = j; });
    joined.catch(() => {});
    const W = deferWorld(src, { inflight: { pricing_list: joined } });
    const p = W.ctx._fcEnsureDeferredTable_('pricing_list');
    reject(new Error('the other flight died'));
    await p;
    eq(W.calls, [['pricing_list']], 'B6  a joined flight that fails leads to exactly one fresh request');
  }
  // B7 — LEGACY MODE IS INERT. The broad cache is loaded wholesale there and the latch record is never
  //      populated, so a check against it would pend forever on data that is already present.
  {
    const W = deferWorld(src, { workspace: false });
    await W.ctx._fcEnsureDeferredTable_('pricing_list');
    eq(W.calls.length, 0, 'B7  deferral is inert in Legacy mode — no request, no pending state');
    ok(W.ctx._fcDeferredPending_('pricing_list') === false,
      'B7a and nothing is ever reported as PENDING there, so the cells behave exactly as before');
  }
  // B8 — the ensure is TOTAL: an unconfigured page degrades rather than hanging.
  {
    const W = deferWorld(src, { noRc: true });
    await W.ctx._fcEnsureDeferredTable_('pricing_list');
    ok(true, 'B8  an unconfigured page resolves rather than hanging');
  }
}

// =================================================================================================================
section('C — §2/§6 THE INITIAL PATH, MEASURED IN A REAL BROWSER');
// =================================================================================================================
{
  const pre = EV.special_initial_path;
  eq(pre.SPECIAL_INITIAL_REQUEST_COUNT_PRE, 4, 'C1  R12 measured the shipped Special open at FOUR requests');
  eq(R0.FC_NEXT_SPECIAL.api, 2, 'C1a and R13 measures it at TWO');
  eq(pre.SPECIAL_INITIAL_ROUNDS_PRE, 2, 'C2  R12 measured TWO sequential read rounds');
  eq(R0.FC_NEXT_SPECIAL.rounds, 1, 'C2a and R13 measures ONE');

  eq(Object.keys(R0.FC_NEXT_SPECIAL.byAction).sort(),
    ['fcSummary.workspace.get:events', 'getTable:campaigns'],
    'C3  and the two requests are exactly campaigns + the scoped events slice');

  eq(R0.FC_NEXT_SPECIAL.getters.getCampaignSkuLines, 0,
    'C4  §2 SPECIAL_INITIAL_CAMPAIGN_LINES_REQUESTS = 0 — the getter is not even reached');
  eq(R0.FC_NEXT_SPECIAL.getters.getPricingList, 0,
    'C4a §2 SPECIAL_INITIAL_PRICING_LIST_REQUESTS = 0');
  ok(!('getTable:campaign_sku_lines' in R0.FC_NEXT_SPECIAL.byAction)
    && !('getTable:pricing_list' in R0.FC_NEXT_SPECIAL.byAction),
    'C4b and neither table is fetched during the open');

  /* C5 — WHAT IS PRESERVED, so this reads as a deferral and not a deletion. The three BROAD-CACHE
     readers are still called on open. getFcSpecialEvents is now ZERO and that is the E5 repair, not a
     loss: after it, the builder reads events through `_evtBuilderEventRows_` and the scoped model,
     which never touches the broad getter. The events ARE read — the picker below is the proof, and it
     is a better one, because a getter call count cannot tell a populated answer from an empty one. */
  ok(R0.FC_NEXT_SPECIAL.getters.getSkuDetails > 0
    && R0.FC_NEXT_SPECIAL.getters.getMarketplaceSkus > 0
    && R0.FC_NEXT_SPECIAL.getters.getCampaigns > 0,
    'C5  §2 the three broad-cache critical readers are still reached on open', R0.FC_NEXT_SPECIAL.getters);
  eq(R0.FC_NEXT_SPECIAL.getters.getFcSpecialEvents, 0,
    'C5a and the broad events getter is NOT — the scoped model answers that one now');
  ok(R0.SPECIAL_EXISTING_PICKER.options > 1 && !R0.SPECIAL_EXISTING_PICKER.unreadable,
    'C5b which the picker proves by being populated and readable', R0.SPECIAL_EXISTING_PICKER);

  // C6 — §6 THE WARM PATH STAYS AT ZERO. The deferral must not turn a reopen into a re-read.
  eq(R0.FC_NEXT_SPECIAL_WARM.api, 0, 'C6  §6 a warm Special reopen issues ZERO requests');
  eq(R0.FC_NEXT_REGULAR.api, 2, 'C7  §6 the Regular cold path is unchanged at two requests');
  eq(R0.FC_NEXT_REGULAR.rounds, 1, 'C7a and one round');
  eq(R0.FC_NEXT_REGULAR_WARM.api, 0, 'C7b and warm Regular is still zero');

  // C8 — LATENCY-INDEPENDENT. Identical at 0 ms and 400 ms is what makes these control-flow facts.
  eq(R400.FC_NEXT_SPECIAL.api, R0.FC_NEXT_SPECIAL.api, 'C8  the same at serverMs 400 — a control-flow property');
  eq(R400.FC_NEXT_SPECIAL.rounds, R0.FC_NEXT_SPECIAL.rounds, 'C8a rounds too');
  eq(R400.FC_NEXT_REGULAR.api, R0.FC_NEXT_REGULAR.api, 'C8b and the Regular path likewise');
}

// =================================================================================================================
section('D — §3/§4/§5 THE BOUNDARIES AND THEIR FAILURES, MEASURED');
// =================================================================================================================
{
  // ---- PRICING ---------------------------------------------------------------------------------------------
  eq(R0.PRICING_PENDING_IMMEDIATE.api, 1,
    'D1  §4 PRICING_REQUEST_COUNT_AT_BOUNDARY = 1 — a SKU typed into a row buys exactly one read');
  eq(Object.keys(R0.PRICING_PENDING_IMMEDIATE.byAction), ['getTable:pricing_list'],
    'D1a and it is that table and no other');
  eq(R0.PRICING_PENDING_IMMEDIATE.cells[0].state, 'pending',
    'D2  §5 the cell reads PENDING before the read settles');
  ok(/Loading/i.test(R0.PRICING_PENDING_IMMEDIATE.cells[0].placeholder || ''),
    'D2a and says so, rather than showing a blank of unknown meaning');
  ok(!/Missing/i.test(R0.PRICING_PENDING_IMMEDIATE.cells[0].placeholder || ''),
    'D2b FALSE_EMPTY_COUNT = 0 — "not loaded yet" is never rendered as "has no price"');

  // D3 — the failure is scoped. Everything here comes from the CRITICAL load.
  const PF = R0.PRICING_FAILURE_ISOLATION;
  eq(PF.host.state, 'refused', 'D3  §5 a failed pricing read raises a refusal in its own subsection');
  ok(PF.host.hasRetry, 'D3a with a Retry on it');
  eq(PF.linesHost.hidden, true, 'D3b and the OTHER deferred subsection is untouched');
  eq(PF.baseUi.modalOpen, true, 'D4  §5 SPECIAL_BASE_UI_REMAINS_RENDERED — the modal is still open');
  ok(PF.baseUi.skuDatalist > 0, 'D4a the scoped SKU list is still populated');
  ok(PF.baseUi.existingOptions > 1, 'D4b the existing-event picker still has its events');
  ok(PF.baseUi.scopeCountry && PF.baseUi.eventFlag && PF.baseUi.startDate,
    'D4c and scope, event flag and window are all still there');
  eq(PF.baseUi.permanentLoading, 0, 'D5  §5 PERMANENT_LOADING_COUNT = 0');
  eq(PF.openRequests, 0, 'D5a and no request is left open');

  // D6 — Retry: ONE request, and the column fills in.
  eq(R0.PRICING_RETRY.api, 1, 'D6  §5 Retry issues exactly one request');
  eq(R0.PRICING_RETRY.host.hidden, true, 'D6a and clears its own surface');
  eq(R0.PRICING_RETRY.cells[0].state, 'ok', 'D6b and the price resolves');
  ok(R0.PRICING_RETRY.cells[0].value && R0.PRICING_RETRY.cells[0].currency,
    'D6c with a real price and a real currency, from pricing_list', R0.PRICING_RETRY.cells[0]);

  // D7 — NO DUPLICATE. A second row asks the same question and pays nothing.
  eq(R0.PRICING_SECOND_ROW.api, 0, 'D7  §4 a second SKU row issues no further request');
  ok(R0.PRICING_SECOND_ROW.cells.length >= 2 && R0.PRICING_SECOND_ROW.cells.every((c) => c.state === 'ok'),
    'D7a and every row is priced', R0.PRICING_SECOND_ROW.cells);

  // ---- CAMPAIGN LINES --------------------------------------------------------------------------------------
  ok(R0.LINES_PICKED.campaignId, 'D8  §3 an existing event was actually selected', R0.LINES_PICKED);
  const LF = R0.LINES_FAILURE_ISOLATION;
  eq(LF.api, 1, 'D9  §3 CAMPAIGN_LINES_REQUEST_COUNT_AT_BOUNDARY = 1');
  eq(Object.keys(LF.byAction), ['getTable:campaign_sku_lines'], 'D9a and it is that table');
  eq(LF.host.state, 'refused', 'D10 §5 a failed lines read refuses in the picker’s own subsection');
  ok(LF.host.hasRetry, 'D10a with a Retry');
  eq(LF.pricingHost.hidden, true, 'D10b and the pricing subsection is untouched');
  eq(LF.hydrated, false,
    'D11 §5 FALSE_EMPTY_COUNT = 0 — the event is NOT hydrated from an empty table, which would drop its discounts silently');
  eq(LF.editingBannerShown, false, 'D11a and the form does not claim to be editing a saved event');
  eq(LF.baseUi.modalOpen, true, 'D12 §5 the builder is still open and usable');
  eq(LF.baseUi.permanentLoading, 0, 'D12a PERMANENT_LOADING_COUNT = 0');
  eq(LF.openRequests, 0, 'D12b and no request is left open');

  eq(R0.LINES_RETRY.api, 1, 'D13 §3 Retry issues exactly one request');
  eq(R0.LINES_RETRY.hydrated, true, 'D13a and the saved event opens');
  eq(R0.LINES_RETRY.editingBannerShown, true, 'D13b and the form says it is editing one');
  ok(R0.LINES_RETRY.rows.length >= 1 && R0.LINES_RETRY.rows.every((r) => r.deal && r.disc),
    'D13c every hydrated row carries BOTH its deal price and its discount — the deferred table really arrived',
    R0.LINES_RETRY.rows);

  eq(R0.LINES_SECOND_PICK.api, 0, 'D14 §3 picking a second saved event issues no further request');
  eq(R0.LINES_SECOND_PICK.hydrated, true, 'D14a and still hydrates');

  // D15 — the same at 400 ms.
  eq(R400.PRICING_RETRY.api, R0.PRICING_RETRY.api, 'D15 the boundary costs are identical at serverMs 400');
  eq(R400.LINES_RETRY.api, R0.LINES_RETRY.api, 'D15a both of them');
  eq(R400.PRICING_SECOND_ROW.api, 0, 'D15b and the no-duplicate rule holds there too');
}

// =================================================================================================================
section('E — THE CONSUMERS, AND THE GUARD AT EACH ONE');
// =================================================================================================================
{
  const src = FC();

  // E1 — THE GUARD IS AT THE CONSUMER, not at the control that leads to it. A guard in the picker's change
  //      handler could be walked around by any future second caller of the hydrate.
  const hyd = extract(src, '_evtHydrateExisting_');
  ok(hyd.indexOf('_fcDeferredPending_(_FC_DEFERRED_TABLES_.lines)') < hyd.indexOf('_evtCampaignLineRows_()'),
    'E1  _evtHydrateExisting_ refuses to run before it reads campaign_sku_lines, not after');
  ok(/var sel = document\.getElementById\('event-existing-select'\)/.test(hyd),
    'E1a and its continuation re-reads the picker, so a mind changed mid-flight lands on the right event');

  const row = extract(src, '_evtApplyRowPricing');
  // E2 — SCOPE IS ANSWERED BEFORE PRICING IS AWAITED. marketplace_skus is critical and loaded, so an
  //      out-of-scope SKU is still told so immediately; only the PRICE waits.
  ok(row.indexOf("priceState = 'out_of_scope'") < row.indexOf('_fcDeferredPending_'),
    'E2  an out-of-scope SKU is refused before the price is deferred');
  ok(row.indexOf('_fcDeferredPending_') < row.indexOf("priceState = 'missing_price'"),
    'E2a and PENDING is decided BEFORE missing_price, which is what keeps the false empty out');

  // E3 — THE GROUP BUILD waits for the whole table, because it aggregates currencies across every scoped SKU.
  const grp = extract(src, '_evtBuildGroups');
  ok(grp.indexOf('_fcDeferredPending_(_FC_DEFERRED_TABLES_.pricing)') < grp.indexOf('_evtCandidateRows()'),
    'E3  _evtBuildGroups waits for pricing before composing a single card');
  ok(/_evtShowSubsectionLoading_\(EVT_PRICING_HOST_/.test(grp), 'E3a and says so in the same scoped surface');

  // E4 — THE SAVE GATE. A pending price may never be written, and may never be reported as a missing one.
  const save = src.slice(src.indexOf('// ---- Collect + validate SKU lines from the active mode ----'));
  ok(save.indexOf("r.priceState === 'pending'") < save.indexOf("r.priceState === 'missing_price'"),
    'E4  the save gate checks PENDING before MISSING_PRICING_LIST_ROW');
  ok(/price list has not finished loading/.test(save),
    'E4a and says the list has not loaded — never that the database has no price for this SKU');
  ok(/if \(_fcDeferredPending_\(_FC_DEFERRED_TABLES_\.pricing\)\) \{ alert\('The price list is not loaded/.test(save),
    'E4b the group-card branch has its own gate, for a write that invalidated pricing after the build');

  // E5 — R12's REGRESSION, FOUND BY THIS ROUND'S FIXTURE FIX. `_evtPopulateBaseCampaigns` asked the broad
  //      cache for events after R12 moved them to the slice, so in workspace mode the baseline had no
  //      candidates — and reported that as "(no matching campaign with FC data)", a claim about the DATA.
  const bc = extract(src, '_evtPopulateBaseCampaigns');
  ok(/var events = _evtBuilderEventRows_\(\);/.test(bc),
    'E5  _evtPopulateBaseCampaigns reads events through the same owner the rest of the builder uses');
  ok(!/getFcSpecialEvents/.test(bc), 'E5a and no longer reaches into the broad cache behind it');
  ok(/if \(!Array\.isArray\(events\)\)/.test(bc) && /could not be read/.test(bc),
    'E5b UNREAD IS NOT EMPTY — an unreadable model disables the control and says so');
  ok(R0.SPECIAL_SKU_FIXTURE.baseUi.baseCampaigns > 1,
    'E5c and the Base Campaign dropdown is measured with real candidates in it',
    R0.SPECIAL_SKU_FIXTURE.baseUi.baseCampaigns);

  // E6 — THE TWO HOSTS EXIST IN THE MARKUP, and nothing else was moved to make room for them.
  const html = HTML();
  ok(/id="event-existing-refusal"/.test(html), 'E6  the campaign-lines surface exists in the markup');
  ok(/id="event-pricing-refusal"/.test(html), 'E6a and the pricing surface');
  ok(/id="event-existing-refusal"[\s\S]{0,200}hidden/.test(html) && /id="event-pricing-refusal"[\s\S]{0,200}hidden/.test(html),
    'E6b both start hidden — a surface that is visible when nothing is wrong is noise');
  ok(html.indexOf('id="event-pricing-refusal"') < html.indexOf('id="event-mode-single"'),
    'E6c and the pricing surface sits above BOTH builder modes, because both read that table');

  // E7 — POST-WRITE WARM. R2-STABILITY's guarantee is kept for a deferred table this session has used.
  const warm = extract(src, '_fcPostWriteWarm_');
  ok(/_fcDeferredEverUsed_\[t\]/.test(warm),
    'E7  a deferred table THIS SESSION has used is still re-warmed inside the save flow');
  ok(!/_fcDeferredEverUsed_ = \{\};[\s\S]{0,400}delete _fcDeferredEverUsed_/.test(src),
    'E7a and that record is not cleared by an invalidation — a write cannot make it untrue that the operator uses it');
  const ensure = extract(src, '_fcEnsureDeferredTable_');
  ok(ensure.indexOf('_fcDeferredEverUsed_[t] = true;') < ensure.indexOf('_fcDeferralActive_'),
    'E7b it is set when the CONSUMER is reached, so a session that never opens one buys nothing');
}

// =================================================================================================================
section('F — §9 THE SKU REGIONAL COLD-ENTRY MATRIX');
// =================================================================================================================
{
  eq(R0.SKU_REGIONAL_ENTRY_TO_FIRST_MASTER_LIST.api, 1, 'F1  A — a cold entry issues ONE read');
  eq(R0.SKU_REGIONAL_ENTRY_TO_FIRST_MASTER_LIST.rounds, 1, 'F1a in one round');
  eq(R0.SKU_REGIONAL_ENTRY_TO_FIRST_MASTER_LIST.dupes, 0, 'F1b with no duplicate');

  eq(R0.SRD_TIMEOUT_REFUSAL.refusalShown, true, 'F2  B — a read stalled past its budget raises a NAMED refusal');
  ok(/REQUEST_TIMEOUT/.test(R0.SRD_TIMEOUT_REFUSAL.refusalText || ''),
    'F2a §9 FIRST_TIMEOUT_UI_TRUTHFUL = YES — it names the classification');
  // F2 above already reads the Retry out of the refusal's innerHTML; the TEXT is capped at 140
  // characters and the button sits past it, so asking this field for it would be asking the wrong one.
  ok(R0.SRD_TIMEOUT_REFUSAL.refusalShown === true && /action skuDetails\.workspace\.get/.test(R0.SRD_TIMEOUT_REFUSAL.refusalText || ''),
    'F2b and names the ACTION that failed, not merely that something did');
  eq(R0.SRD_TIMEOUT_REFUSAL.stillSkeleton, 0, 'F2c §9 PERMANENT_LOADING_COUNT = 0');
  eq(R0.SRD_TIMEOUT_REFUSAL.itemsRendered, 0,
    'F2d and NOTHING is rendered — a failed read never paints rows it does not have');
  eq(R0.SRD_TIMEOUT_REFUSAL.openRequests, 0, 'F2e §9 STALE_RESPONSE_COMMIT_COUNT = 0 — no request is left open');

  eq(R0.SRD_TIMEOUT_RECOVERY.api, 1, 'F3  C/E — §9 RETRY_REQUEST_COUNT = 1, on a page holding no stale model');
  eq(R0.SRD_TIMEOUT_RECOVERY.itemsRendered, 50, 'F3a §9 RETRY_RECOVERY_PASS = YES');
  eq(R0.SRD_TIMEOUT_RECOVERY.stillSkeleton, 0, 'F3b and the skeleton is gone');

  eq(R0.SRD_LEAVE_REENTER.api, 0, 'F4  D — leaving mid-read and returning issues no SECOND read');
  eq(R0.SRD_LEAVE_REENTER.itemsRendered, 50, 'F4a and the page is whole');
  eq(R0.SRD_LEAVE_REENTER.activeVisibleSectionCount, 1, 'F4b with exactly one visible section');

  eq(R0.SRD_REENTER_AFTER_FAILURE.api, 1,
    'F5  E-prime — the OTHER way out of a failure: navigate away and back, one read, recovered');
  eq(R0.SRD_REENTER_AFTER_FAILURE.itemsRendered, 50, 'F5a and the page is whole');
  eq(R0.SRD_REENTER_AFTER_FAILURE.stillSkeleton, 0, 'F5b with no skeleton left behind');

  // F6 — THE SEAM. Recorded, bounded, and NOT claimed as a production defect.
  eq(R0.SRD_INVALIDATE_SEAM_STUCK.api, 0,
    'F6  the window.srdInvalidate seam leaves a mount that issues no read');
  eq(R0.SRD_INVALIDATE_SEAM_STUCK.retryOffered, false, 'F6a and offers no Retry');
  eq(R0.SRD_INVALIDATE_SEAM_RETRY.api, 1, 'F6b an explicit srdRetry() recovers it in one read');
  {
    const hits = [];
    ['assets/js', 'assets/html'].forEach(function walk(dir) {
      const abs = path.join(ROOT, dir);
      fs.readdirSync(abs, { withFileTypes: true }).forEach((d) => {
        if (d.isDirectory()) walk(path.join(dir, d.name));
        else if (/\.(js|html)$/.test(d.name) && /srdInvalidate/.test(read(path.join(dir, d.name)))) hits.push(path.join(dir, d.name).replace(/\\/g, '/'));
      });
    });
    eq(hits, ['assets/js/pages/sku-regional-details.js'],
      'F6c THE SEAM HAS NO CALLER in shipped code — which is why F6 is recorded as debt and not repaired here');
  }
}

// =================================================================================================================
section('G — §7/§8 A PREVIEW THAT CALLED A LOST CONNECTION A DATABASE REJECTION');
// =================================================================================================================
{
  const api = DBAPI();

  // G1 — THE FOURTH STATE EXISTS, and it is the one §7 permits to claim zero-write.
  ok(/function notStarted\(code, detail\)/.test(api), 'G1  the dry-run path has its own outcome constructor');
  ok(/e\.write_outcome = 'CONFIRMED_NOT_STARTED';/.test(api), 'G1a which is CONFIRMED_NOT_STARTED');
  ok(/e\.write_id = null;/.test(api.slice(api.indexOf('function notStarted'), api.indexOf('function rejected'))),
    'G1b carrying NO write id — a dry run mints none, and inventing one would make it look replayable');

  // G2 — EVERY DRY-RUN TRANSPORT BRANCH uses it, and the one SERVER answer does not.
  const body = api.slice(api.indexOf('window.KM.DB.updatePricing = async function'), api.indexOf('var _KM_PRICING_WRITE_SEQ_'));
  const dryThrows = (body.match(/if \(dryRun\) throw (\w+)/g) || []).map((m) => m.split(' ').pop());
  eq(dryThrows.filter((t) => t === 'notStarted').length, dryThrows.length,
    'G2  every dry-run transport failure is CONFIRMED_NOT_STARTED', dryThrows);
  ok(dryThrows.length === 3, 'G2a all three of them — network, classified answer, unreadable answer', dryThrows);
  ok(/if \(!json\.success\) \{[\s\S]{0,400}throw rejected\(/.test(body),
    'G2b and a server that ANSWERED and said no is still CONFIRMED_REJECTED — that one is authoritative');

  // G3 — THE WRITE PATH IS UNTOUCHED. R10's seal is not weakened by fixing its sibling.
  ok(/return await settle\(unknown\(cls\.typed && cls\.typed\.code/.test(body),
    'G3  a real write whose answer is lost is still OUTCOME_UNKNOWN and still verified');
  ok(/e\.zero_write = false;/.test(body.slice(body.indexOf('function unknown'))),
    'G3a and still refuses to claim zero-write');

  // G4 — THE RENDERER. Two branches, and no third one that cannot happen.
  const srd = SRD();
  ok(/function _srdPreviewFailureHtml_\(err\)/.test(srd), 'G4  the preview has its own failure renderer');
  const pf = extract(srd, '_srdPreviewFailureHtml_');
  ok(/CONFIRMED_NOT_STARTED/.test(pf), 'G4a which branches on CONFIRMED_NOT_STARTED');
  ok(/connection problem/.test(pf) && /has not been checked/.test(pf),
    'G4b and says the file has not been judged — a connection problem, not a bad file');
  ok(!/OUTCOME_UNKNOWN/.test(pf),
    'G4c with NO unreachable OUTCOME_UNKNOWN branch — a dry run cannot produce one');

  // G5 — NEITHER preview surface still prints the old sentence for a transport failure.
  ok(!/The database rejected the file\. <strong>Nothing was written\.<\/strong> ' \+\s*esc\(err/.test(srd),
    'G5  the CSV import preview no longer prints it straight from the error');
  ok(!/\? 'The database rejected the file\./.test(srd),
    'G5a nor does the bulk modal template');
  ok((srd.match(/_srdPreviewFailureHtml_\(/g) || []).length >= 3,
    'G5b both call sites go through the one renderer');
  ok(/outcome: \(err && err\.write_outcome\) \|\| '',/.test(srd),
    'G5c and the outcome travels with the message — dropping it is what let one template answer for both');

  // G6 — THE WRITE renderer is untouched, and still separate.
  ok(/function _srdWriteFailureHtml_\(err\)/.test(srd) && /OUTCOME_UNKNOWN/.test(extract(srd, '_srdWriteFailureHtml_')),
    'G6  the WRITE renderer keeps R10’s OUTCOME_UNKNOWN box');
  ok(/Do not submit this update again/.test(srd), 'G6a including the instruction that matters there');
  ok(!/Do not submit this update again/.test(pf),
    'G6b and the PREVIEW never prints it — there is no write to warn about');

  // G7 — §8 WRITE_AUTOREPLAY_ADDED = NO. Nothing in this round resends anything.
  ok(!/updatePricing\([\s\S]{0,200}retry/i.test(body.slice(body.indexOf('async function settle'))),
    'G7  §8 WRITE_AUTOREPLAY_ADDED = NO — nothing here resends a write');
  ok(/The only thing dispatched here is a READ/.test(api),
    'G7a and the verification path is still read-only by its own statement');
}

// =================================================================================================================
section('H — THE HARNESS, AND THE TWO FAULTS IT WAS HIDING');
// =================================================================================================================
{
  const r = RUNNER();
  ok(/var o = \{ rows: _rows \}; o\[t\] = _rows;/.test(r),
    'H1  the getTable fixture answers `rows`, which is the only field _kmGetTableOnce_ reads');
  ok(/return \(json\.data && json\.data\.rows\) \|\| \[\];/.test(DBAPI()),
    'H1a and that IS what it reads — the two are checked against each other, not assumed');
  ok(/campaigns: campaigns, campaign_sku_lines: campaignLines/.test(r),
    'H2  campaigns and campaign_sku_lines carry rows — an empty deferred table and an unread one must differ');
  ok(/event_start_date: yr \+ "-07-01"/.test(r) && /fc_qty: 100 \+ _ei/.test(r),
    'H3  the event rows use the canonical field names the normalizer actually reads');
  // The probe is stored as QUOTED LINES, so these two never appear as adjacent text; what matters is
  // that the event fixture is built by iterating both axes rather than hard-coding one site.
  ok(/W\.countries\.forEach\(function \(co\) \{/.test(r) && /W\.marketplaces\.forEach\(function \(mk\) \{/.test(r)
    && /country: co, marketplace: mk/.test(r),
    'H4  and cover every scope the builder can open on');
  ok(/_YRS = \[String\(_Y0\), String\(_Y0 \+ 1\)\]/.test(r),
    'H4a in BOTH years it can default to — fcTargetYear is next year, which is what hid them');
  ok(/action === P\.stallOnce \|\| key === P\.stallOnce/.test(r),
    'H5  a stall can name a TABLE, not only an action — every deferred read here is a getTable');

  eq(EV.harness_faults_found_and_fixed.length, 3, 'H6  all three harness faults are recorded, not quietly fixed');
  ok(/EVERY getTable in this harness resolved to \[\]/.test(EV.harness_faults_found_and_fixed[0]),
    'H6a including the one that had been hiding since R11');
  ok(/Request counts were unaffected/.test(EV.harness_faults_found_and_fixed[0]),
    'H6b and what it did NOT invalidate is stated, rather than left for the reader to wonder about');

  // H7 — the picker really had events in it, which is what makes section D's hydrate meaningful.
  ok(R0.SPECIAL_EXISTING_PICKER.options > 1 && !R0.SPECIAL_EXISTING_PICKER.unreadable,
    'H7  the existing-event picker is readable AND non-empty', R0.SPECIAL_EXISTING_PICKER);
  ok(R0.SPECIAL_SKU_FIXTURE.baseUi.mskus > 0,
    'H7a and the broad cache genuinely carries rows now', R0.SPECIAL_SKU_FIXTURE.baseUi.mskus);
}

// =================================================================================================================
section('J — MUTANTS');
// =================================================================================================================
{
  let killed = 0, survived = 0, harness = 0;
  async function mutate(file, from, to, name, probe) {
    const abs = path.join(ROOT, file);
    const before = fs.readFileSync(abs, 'utf8');
    if (before.split(from).length - 1 !== 1) {
      harness++; console.log('  HARNESS ERROR ' + name + ' — anchor matched '
        + (before.split(from).length - 1) + ' times'); return;
    }
    fs.writeFileSync(abs, before.split(from).join(to), 'utf8');
    try {
      const bad = await probe();
      if (bad) { killed++; console.log('  ok   ' + name + ' KILLED'); }
      else { survived++; console.log('  FAIL ' + name + ' SURVIVED'); }
    } catch (e) { killed++; console.log('  ok   ' + name + ' KILLED (threw)'); }
    finally { fs.writeFileSync(abs, before, 'utf8'); }
  }

  /* J1 — THE TABLE IS NOT PUBLISHED IN THE SHARED IN-FLIGHT INDEX.
     This is the mutant that replaced the obvious one. Removing `_fcDeferredFlight_`'s latch is INERT:
     the index catches the second consumer one line later, so no reachable defect exists and a mutant
     that kills nothing proves nothing (the S3-R10 J5 precedent). Removing the REGISTRATION is not
     inert — it is what lets a prerequisite load, a post-write warm and a deferred read recognise each
     other's reads, and without it the same table is bought twice by two different owners. */
  await mutate('assets/js/pages/fc-summary.js',
    '  _fcMarkTablesInflight_([t], flight);',
    '  if (false) _fcMarkTablesInflight_([t], flight);',
    'J1 the deferred read is not published in the shared in-flight index', async () => {
      let release;
      const W = deferWorld(FC(), { fetch: () => new Promise((r) => { release = r; }) });
      W.ctx._fcEnsureDeferredTable_('pricing_list');
      return !W.sandbox._fcPrereqInflightTables_.pricing_list;
    });

  // J2 — the already-current check is removed: a table the page holds is re-read on every interaction.
  await mutate('assets/js/pages/fc-summary.js',
    '  if (_fcPrereqLoadedTables_[t]) return Promise.resolve();',
    '  if (false) return Promise.resolve();',
    'J2 the already-current check is removed', async () => {
      const W = deferWorld(FC(), { loaded: { pricing_list: true } });
      await W.ctx._fcEnsureDeferredTable_('pricing_list');
      return W.calls.length > 0;
    });

  // J3 — the failure does not release the in-flight index: Retry re-awaits a dead promise forever.
  // SINGLE-LINE ANCHOR. The tree is CRLF, so an anchor carrying \n matches nothing and reports a
  // HARNESS ERROR instead of a result — the trap S3-R8 and S3-R12 both hit.
  await mutate('assets/js/pages/fc-summary.js',
    '    _fcDeferredError_[t] = err || null;',
    '    _fcMarkTablesInflight_([t], flight); _fcDeferredError_[t] = err || null;',
    'J3 a failed read leaves its table marked in flight', async () => {
      const W = deferWorld(FC(), { fetch: () => Promise.reject(new Error('boom')) });
      try { await W.ctx._fcEnsureDeferredTable_('pricing_list'); } catch (e) {}
      return !!W.sandbox._fcPrereqInflightTables_.pricing_list;
    });

  // J4 — the workspace gate is removed: Legacy mode starts reporting PENDING for data it already holds.
  await mutate('assets/js/pages/fc-summary.js',
    '  return _fcEffectiveWorkspace() &&',
    '  return true &&',
    'J4 the workspace gate on deferral is removed', async () => {
      const W = deferWorld(FC(), { workspace: false });
      return W.ctx._fcDeferredPending_('pricing_list') === true;
    });

  // J5 — PENDING is rendered as MISSING. The false empty, planted directly.
  await mutate('assets/js/pages/fc-summary.js',
    "    row.dataset.priceState = 'pending';",
    "    row.dataset.priceState = 'missing_price';",
    'J5 a not-yet-loaded price is labelled missing', async () => {
      const row = extract(FC(), '_evtApplyRowPricing');
      const i = row.indexOf('_fcDeferredPending_');
      return !/priceState = 'pending'/.test(row.slice(i, i + 400));
    });

  // J6 — the save gate loses its PENDING branch, so a row with no price yet is written as if it had none.
  await mutate('assets/js/pages/fc-summary.js',
    "      if (r.priceState === 'pending') { alert('Row ' + (i + 1)",
    "      if (false) { alert('Row ' + (i + 1)",
    'J6 the save gate stops refusing a pending price', async () => {
      const src = FC();
      const save = src.slice(src.indexOf('// ---- Collect + validate SKU lines from the active mode ----'));
      return save.indexOf("r.priceState === 'pending'") === -1;
    });

  // J7 — the hydrate guard is removed: a saved event opens over an empty campaign_sku_lines and its
  //      discounts vanish without a word. This is the defect §5 calls FALSE_EMPTY.
  await mutate('assets/js/pages/fc-summary.js',
    // FC-SUMMARY-STABILITY-R2 — re-aimed. The hydrate now waits for lines AND campaigns through one
    // list gate, so the anchor is the GATE rather than one of the tables it covers. Same defect planted:
    // the saved event opens over an unread table and its discounts vanish without a word.
    '  if (_hydNeed.length) {',
    '  if (false) {',
    'J7 the hydrate runs without its table', async () => {
      const hyd = extract(FC(), '_evtHydrateExisting_');
      return !/if \(_hydNeed\.length\)/.test(hyd);
    });

  // J8 — the dry-run classifier goes back to `rejected`, which is the operator's screenshot exactly.
  await mutate('assets/js/api/operation-system-db-api.js',
    '        if (dryRun) throw notStarted(cls.typed && cls.typed.code,',
    '        if (dryRun) throw rejected(cls.legacyCode,',
    'J8 a redirect-404 preview is called a rejection again', async () => {
      const api = DBAPI();
      const body = api.slice(api.indexOf('window.KM.DB.updatePricing = async function'), api.indexOf('var _KM_PRICING_WRITE_SEQ_'));
      const dryThrows = (body.match(/if \(dryRun\) throw (\w+)/g) || []).map((m) => m.split(' ').pop());
      return dryThrows.indexOf('rejected') !== -1;
    });

  // J9 — the renderer stops distinguishing them, so the honest classification is thrown away at the last step.
  await mutate('assets/js/pages/sku-regional-details.js',
    "        if (err && err.write_outcome === 'CONFIRMED_NOT_STARTED') {",
    '        if (false) {',
    'J9 the preview renderer ignores the outcome', async () => {
      const pf = extract(SRD(), '_srdPreviewFailureHtml_');
      return !/CONFIRMED_NOT_STARTED/.test(pf);
    });

  // J10 — the Base Campaign source goes back to the broad cache: R12's regression, restored.
  await mutate('assets/js/pages/fc-summary.js',
    '  var events = _evtBuilderEventRows_();',
    '  var events = (window.KM && window.KM.DB && window.KM.DB.getFcSpecialEvents) ? window.KM.DB.getFcSpecialEvents() : [];',
    'J10 the Base Campaign baseline reads the broad cache again', async () => {
      const bc = extract(FC(), '_evtPopulateBaseCampaigns');
      return /getFcSpecialEvents/.test(bc);
    });

  console.log('  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harness + ' harness errors');
  ok(survived === 0 && harness === 0, 'J   every planted defect was caught', { killed, survived, harness });
}

console.log('\n' + (fail ? 'FAIL  ' : 'PASS  ') + pass + ' passed, ' + fail + ' failed');
console.log('SPECIAL_INITIAL = 2 REQUESTS / 1 ROUND (was 4 / 2) · DEFERRED = campaign_sku_lines + pricing_list · '
  + 'FALSE_EMPTY = 0 · PERMANENT_LOADING = 0 · REDIRECT_404_PREVIEW = CONFIRMED_NOT_STARTED · WRITE_AUTOREPLAY_ADDED = NO');
if (fail) process.exitCode = 1;
}());
