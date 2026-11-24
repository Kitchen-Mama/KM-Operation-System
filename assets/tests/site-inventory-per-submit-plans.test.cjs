'use strict';
// Real 11_/16_ writers and 12_ consolidation, synthetic sheets only. No network or GAS service connection.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { extract } = require('./ad4/extract.cjs');
const dir = path.join(__dirname, '../specs/active/apps-script');
const source = name => fs.readFileSync(path.join(dir, name), 'utf8');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
class Sheet {
  constructor(headers, rows = []) { this.data = [Array.from(headers)]; this.writes = 0; rows.forEach(r => this.append(r)); this.writes = 0; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data[0].length; }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(r, c, nr = 1, nc = 1) {
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => this.data[r + i - 1]?.[c + j - 1] ?? '')),
      getValue: () => this.data[r - 1]?.[c - 1] ?? '',
      setValue: v => { this.writes++; this.data[r - 1][c - 1] = v; },
      setValues: rows => { this.writes++; rows.forEach((row, i) => row.forEach((v, j) => { this.data[r + i - 1][c + j - 1] = v; })); }
    };
  }
  append(row) { this.writes++; this.data.push(this.data[0].map(k => row[k] ?? '')); }
  deleteRow(r) { this.writes++; this.data.splice(r - 1, 1); }
  objects() { return this.data.slice(1).map(row => Object.fromEntries(this.data[0].map((k, i) => [k, row[i]]))); }
  set(idField, id, key, value) { const i = this.data.findIndex((row, n) => n && row[this.data[0].indexOf(idField)] === id); assert(i > 0); this.getRange(i + 1, this.data[0].indexOf(key) + 1).setValue(value); }
}
function harness() {
  let serial = 0;
  const c = { console, Proxy, Number, Date, Utilities: { getUuid: () => (++serial).toString(16).padStart(10, '0') + '-0000-0000-0000-000000000000' } };
  vm.createContext(c);
  for (const f of ['11_shipping_plan_handlers.gs', '16_shipping_allocation_handlers.gs', '69_api_v1_route_identity_contract.gs']) vm.runInContext(source(f), c, { filename: f });
  const load = (f, names) => vm.runInContext(extract(source(f), n => names.includes(n), n => names.includes(n)).map(x => x.text).join('\n'), c);
  load('13_procurement_handlers.gs', ['procurementFindRow_']);
  load('12_shipment_handlers.gs', ['sc13Str_', 'sc13Fail_', 'sc13One_', 'sc13Set_', 'sc13Key_', 'sc13Prepare_', 'sc13MergeLocked_', 'sc13Verify_', 'sc13Source_', 'sc13Link_', 'sc13LineRemoved_', 'sc13AssertReady_', 'sc13Pending_', 'xcdMergeKey_', 'xcdDestIdentity_', 'xcoSourceV2_', 'xcoSourceV2Check_', 'xcoSig_', 'XCO_SIG_FIELDS_']);
  c.Utilities.DigestAlgorithm = { SHA_256: 'sha256' }; c.Utilities.Charset = { UTF_8: 'utf8' };
  c.Utilities.computeDigest = (alg, text) => Array.from(crypto.createHash(alg).update(text).digest());
  const sheets = {
    shipping_plans: new Sheet(c.SHIPPING_PLANS_HEADERS_), shipping_plan_lines: new Sheet(c.SHIPPING_PLAN_LINES_HEADERS_),
    shipping_allocation_drafts: new Sheet([...c.SHIPPING_ALLOCATION_DRAFTS_HEADERS_, 'destination_marketplace']),
    shipping_allocation_draft_lines: new Sheet(c.SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_)
  };
  const ss = { getSheetByName: n => sheets[n] || null };
  const props = {};
  c.SpreadsheetApp = { flush() {}, getActiveSpreadsheet: () => ss };
  c.PropertiesService = { getScriptProperties: () => ({ setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) };
  c.shippingPlanEnsureSheet_ = c.procurementEnsureSheet_ = c.prodRequireSheet_ = (s, n) => { assert(sheets[n], n); return sheets[n]; };
  c.prodRequireColumns_ = c.sheetEnsureColumns_ = () => {};
  c.shipWriteReadStage_ = s => ({ ss: s, real: s, close() {} });
  c.shippingPlanUpcMap_ = () => ({ SKU: 40 }); c.shippingPlanCompanyMaps_ = c.shippingPlanSkuLogisticsMap_ = c.shippingPlanSiteSkuMap_ = () => ({});
  c.shippingPlanResolveCompany_ = (m, country, marketplace, sku, company) => ({ ok: true, company });
  c.shippingPlanSiteSkuFor_ = () => 'SITE'; c.shippingPlanTimestamp_ = c.procurementTimestamp_ = () => '2026-11-24 12:00:00'; c.shippingPlanToday_ = () => '2026-11-24';
  c.shippingPlanLineLogistics_ = () => ({ carton_cbm: 0.1, cbm: 0.2, gross_weight: 10, net_weight: 8 });
  c.shippingPlanAppendByHeader_ = (sheet, row) => sheet.append(row);
  // Quote/availability authorities are test boundaries, owned by other agents.
  c.shippingPlanRoughQuote_ = (s, meta) => ({ carrier_id: meta.carrier_id || '', customs_type: meta.customs_type || '', carrier_unit_rate: '', carrier_rate_type: '', import_duty_treatment: '', estimated_freight_cost: '', estimated_duty: '', estimated_customs_fee: '', estimated_total_cost: '', currency: '' });
  c.sadAiPlanSubmitGate16_ = () => ({ ok: true, aiDraftIds: [] }); c.sadAiPlanSiteBlockGate16_ = c.sadAiPlanSiteBlockRecheck16_ = () => ({ ok: true });
  c.sadPlatformDestinationRefusal16_ = c.sadDestTypeRefusal16_ = () => null; c.sadOverseasPrecheck16_ = () => []; c.sadAttachSiteSnapshot_ = () => {};
  function addDraft(id, overrides = {}) {
    const header = { allocation_draft_id: id, company: 'KM', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment', status: 'draft', generation_type: 'user_created', created_by: 'Owner', created_at: '2026-11-24', draft_version: '1', recommended_source_warehouse_id: 'SOURCE', recommended_source_warehouse_code_snapshot: 'FACTORY', recommended_destination_warehouse_id: 'DEST', recommended_destination_warehouse_code_snapshot: 'FBA', recommended_shipping_method: 'sea', recommended_last_mile_delivery: 'parcel', ...overrides };
    sheets.shipping_allocation_drafts.append(header);
    sheets.shipping_allocation_draft_lines.append({ allocation_draft_id: id, allocation_draft_line_id: 'L-' + id, sku: 'SKU', site_sku: 'SITE', planned_qty: 80, units_per_carton: 40, line_status: 'draft' });
    return header;
  }
  const submit = (ids, key) => c.sadSubmitToShippingPlansCore_(ss, { execution_key: key, expected_versions: Object.fromEntries(ids.map(id => [id, '1'])) }, ids);
  const commit = (lines, key) => c.shippingPlanCommitFromLines_(ss, lines, { providedKey: key });
  return { c, sheets, ss, addDraft, submit, commit, writes: () => Object.values(sheets).reduce((n, s) => n + s.writes, 0) };
}
function line(overrides = {}) { return { company: 'KM', country: 'US', marketplace: 'Amazon', ship_from: 'FACTORY', source_warehouse_id: 'SOURCE', destination: 'FBA', destination_warehouse_id: 'DEST', shipping_method: 'sea', last_mile_delivery: 'parcel', sku: 'SKU', site_sku: 'SITE', requested_qty: 80, units_per_carton: 40, source_reason: 'allocation_draft:H|cyc:cycle1|line:L', planning_cycle: 'cycle1', ...overrides }; }

function enableRealServiceDefault(h) {
  const c = h.c;
  // No quote/default stubs: execute the actual card matcher, service resolver and pricing snapshot.
  for (const f of ['36_document_template_handlers.gs', '17_carrier_handlers.gs', '12_shipment_handlers.gs']) vm.runInContext(source(f), c, { filename: f });
  vm.runInContext(extract(source('11_shipping_plan_handlers.gs'), n => n === 'shippingPlanRoughQuote_', () => false)[0].text, c);
  const add = (name, rows) => { h.sheets[name] = new Sheet([...new Set(rows.flatMap(r => Object.keys(r)))], rows); };
  add('warehouses', [{ warehouse_id: 'SOURCE', warehouse_code: 'FACTORY', country: 'CN' }, { warehouse_id: 'DEST', warehouse_code: 'FBA', country: 'US' }]);
  add('sku_details', [{ sku: 'SKU', battery_type: 'no_battery', units_per_carton: 40 }]);
  add('carriers', [{ carrier_id: 'C1', carrier_name: 'Carrier One', status: 'active' }]);
  add('carrier_rate_cards', [{ rate_card_id: 'R1', carrier_id: 'C1', origin_country: 'CN', destination_country: 'US', marketplace: '', shipping_method: 'sea', shipping_method_label: 'Sea', last_mile_delivery: 'parcel', charge_type: 'weight', charge_unit: 'kg', weight_tier: 1, weight_tier_unit: 'kg', currency: 'USD', unit_rate: 4, customs_type: 'self_customs', battery_type: 'no_battery', import_duty_treatment: 'included_in_rate', status: 'active', effective_from: '2026-01-01', effective_to: '' }]);
}

test('real unique-service default can converge raw groups; identical same-key retry must still be zero-write REUSED', () => {
  const h = harness(); enableRealServiceDefault(h);
  const lines = [line({ carrier_id: '', source_reason: 'allocation_draft:HA|cyc:cycle1|line:LA' }), line({ carrier_id: 'C1', source_reason: 'allocation_draft:HB|cyc:cycle1|line:LB' })];
  const first = h.commit(lines, 'DEFAULT-COLLISION'); assert.equal(first.success, true, JSON.stringify(first)); assert.equal(first.data.plan_count, 2);
  const saved = h.sheets.shipping_plans.objects();
  assert.deepEqual(saved.map(p => p.carrier_id), ['C1', 'C1'], 'real rough quote defaults blank carrier to the unique C1 service');
  const { shipping_plan_id: idA, ...a } = saved[0], { shipping_plan_id: idB, ...b } = saved[1];
  for (const key of ['company', 'country', 'source_warehouse_id', 'destination_warehouse_id', 'shipping_method', 'last_mile_delivery', 'customs_type', 'carrier_id']) assert.equal(a[key], b[key], key);
  const w = h.writes(), before = JSON.stringify(h.sheets.shipping_plans.data);
  const retry = h.commit(lines, 'DEFAULT-COLLISION');
  console.log('REAL_DEFAULT_COLLISION ' + JSON.stringify({ first: first.data.outcome, carriers: saved.map(p => p.carrier_id), retry: retry.data?.outcome || retry.code, additional_writes: h.writes() - w }));
  assert.equal(retry.data?.outcome, 'REUSED', JSON.stringify(retry)); assert.equal(h.writes(), w); assert.equal(JSON.stringify(h.sheets.shipping_plans.data), before);
  assert.equal(h.commit(lines.slice().reverse(), 'DEFAULT-COLLISION').data.outcome, 'REUSED'); assert.equal(h.writes(), w);
  assert.equal(h.commit(lines.map(l => ({ ...l, requested_qty: 120 })), 'DEFAULT-COLLISION').code, 'DUPLICATE_CONFLICT'); assert.equal(h.writes(), w);
  const storedLines = h.sheets.shipping_plan_lines.objects(), fp = h.c.shippingPlanCanonicalFingerprint_(saved, storedLines);
  assert.equal(h.c.shippingPlanClassifyBatch_(saved, storedLines, 'DEFAULT-COLLISION', fp, storedLines.length + 1).state, 'DUPLICATE_CONFLICT', 'matching fingerprint alone cannot bypass line-count mismatch');
  const incomplete = storedLines.map(l => { const row = { ...l }; delete row.snapshot_fc_context; return row; });
  assert.equal(h.c.shippingPlanClassifyBatch_(saved, incomplete, 'DEFAULT-COLLISION', fp, storedLines.length).state, 'RECONCILIATION_REQUIRED', 'schema-incomplete rows must not bypass completeness checks');
  const next = h.commit(lines, 'DEFAULT-COLLISION-NEXT'); assert.equal(next.data.outcome, 'CREATED'); assert.equal(h.sheets.shipping_plans.objects().length, 4);
  assert.equal(JSON.stringify(h.sheets.shipping_plans.data.slice(0, 3)), before, 'different Submit must not append or mutate old cards');
});

test('real default-converged groups still reject unexpected duplicate header, duplicate line and partial content', () => {
  for (const corrupt of ['header', 'line', 'partial']) {
    const h = harness(); enableRealServiceDefault(h);
    const lines = [line({ carrier_id: '' }), line({ carrier_id: 'C1', source_reason: 'allocation_draft:H2|cyc:cycle1|line:L2' })];
    assert.equal(h.commit(lines, 'ONE').data.outcome, 'CREATED');
    if (corrupt === 'header') h.sheets.shipping_plans.append({ ...h.sheets.shipping_plans.objects()[0], shipping_plan_id: 'EXTRA-PLAN' });
    if (corrupt === 'line') h.sheets.shipping_plan_lines.append({ ...h.sheets.shipping_plan_lines.objects()[0], shipping_plan_line_id: 'EXTRA-LINE' });
    if (corrupt === 'partial') h.sheets.shipping_plan_lines.data.splice(1, 1);
    const w = h.writes(), retry = h.commit(lines, 'ONE'); assert.equal(retry.code, corrupt === 'partial' ? 'SUBMIT_EXECUTION_DUPLICATE_CONFLICT' : 'DUPLICATE_CONFLICT', corrupt + ': ' + JSON.stringify(retry)); assert.equal(h.writes(), w);
  }
});

test('new Submit keys create independent cards; exact retry/double-click/response loss is zero-write', () => {
  const h = harness(); h.addDraft('H1');
  const first = h.submit(['H1'], 'ROUND1'); assert.equal(first.success, true, JSON.stringify(first));
  const before = JSON.stringify(h.sheets.shipping_plans.data), writes = h.writes();
  for (let i = 0; i < 2; i++) { const retry = h.submit(['H1'], 'ROUND1'); assert.equal(retry.data.outcome, 'REUSED', JSON.stringify(retry)); }
  assert.equal(h.writes(), writes);
  h.addDraft('H2'); const wrongKeyWrites = h.writes();
  assert.equal(h.submit(['H2'], 'ROUND1').code, 'SUBMIT_EXECUTION_DUPLICATE_CONFLICT'); assert.equal(h.writes(), wrongKeyWrites);
  assert.equal(h.sheets.shipping_allocation_drafts.objects().find(d => d.allocation_draft_id === 'H2').status, 'draft');
  const next = h.submit(['H2'], 'ROUND2'); assert.equal(next.success, true, JSON.stringify(next));
  assert.notEqual(next.data.plans[0], first.data.plans[0]); assert.equal(h.sheets.shipping_plans.objects().length, 2);
  assert.equal(JSON.stringify(h.sheets.shipping_plans.data.slice(0, 2)), before);
  const planLines = h.sheets.shipping_plan_lines.objects(); assert.equal(planLines.length, 2);
  assert(planLines[0].source_reason.includes('allocation_draft:H1')); assert(planLines[1].source_reason.includes('allocation_draft:H2'));
  const w = h.writes(); assert.equal(h.submit(['H1'], 'ROUND3').code, 'CONFLICT'); assert.equal(h.writes(), w);
  h.addDraft('H3'); const third = h.submit(['H3'], 'ROUND3'); assert.equal(third.data.outcome, 'CREATED');
  const w3 = h.writes(); assert.equal(h.submit(['H3'], 'ROUND3').data.outcome, 'REUSED'); assert.equal(h.writes(), w3);
  assert.equal(new Set(h.sheets.shipping_plans.objects().map(p => p.shipping_plan_id)).size, 3);
  assert.deepEqual(h.sheets.shipping_plans.objects().map(p => p.submit_batch_id), ['ROUND1', 'ROUND2', 'ROUND3']);
});

test('same-batch compatible routes share one card and retain both draft lineages', () => {
  const h = harness(); h.addDraft('H1'); h.addDraft('H2');
  const r = h.submit(['H1', 'H2'], 'ONE'); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(r.data.plan_count, 1); assert.equal(r.data.line_count, 2);
  assert.equal(h.sheets.shipping_plan_lines.objects().length, 2); assert.equal(h.submit(['H2', 'H1'], 'ONE').data.outcome, 'REUSED');
});

test('same-route cards split by last-mile, warehouses, carrier, customs and planning cycle replay cleanly in reversed order', () => {
  for (const patch of [{ last_mile_delivery: 'truck' }, { source_warehouse_id: 'SOURCE2' }, { destination_warehouse_id: 'DEST2' }, { carrier_id: 'C2' }, { customs_type: 'DDU' }, { planning_cycle: 'cycle2', source_reason: 'allocation_draft:H2|cyc:cycle2|line:L2' }]) {
    const h = harness(), lines = [line(), line(patch)]; const r = h.commit(lines, 'ONE'); assert.equal(r.data.plan_count, 2, JSON.stringify(patch));
    const w = h.writes(), retry = h.commit(lines.slice().reverse(), 'ONE'); assert.equal(retry.data.outcome, 'REUSED', JSON.stringify(retry)); assert.equal(h.writes(), w);
  }
});

test('retry with changed quantity conflicts and partial persisted batch never appends', () => {
  const h = harness(); h.commit([line()], 'ONE'); const w = h.writes();
  assert.equal(h.commit([line({ requested_qty: 120 })], 'ONE').code, 'SUBMIT_EXECUTION_DUPLICATE_CONFLICT'); assert.equal(h.writes(), w);
  h.sheets.shipping_plan_lines.data.splice(1); const w2 = h.writes();
  assert.equal(h.commit([line()], 'ONE').code, 'COMMITTED_UNVERIFIED'); assert.equal(h.writes(), w2); assert.equal(h.sheets.shipping_plans.objects().length, 1);
});

test('corrupt duplicate route within one batch remains fail-closed', () => {
  const h = harness(); h.commit([line()], 'ONE'); const p = h.sheets.shipping_plans.objects()[0]; h.sheets.shipping_plans.append({ ...p, shipping_plan_id: 'DUPLICATE' });
  h.sheets.shipping_plan_lines.append({ ...h.sheets.shipping_plan_lines.objects()[0], shipping_plan_id: 'DUPLICATE', shipping_plan_line_id: 'DUPLICATE-LINE' });
  const w = h.writes(); assert.equal(h.commit([line()], 'ONE').code, 'DUPLICATE_CONFLICT'); assert.equal(h.writes(), w);
});

test('legacy rows recompute compatibly; tie-break is necessary only for reordered same-display-route groups', () => {
  const h = harness(), c = h.c;
  const projector = extract(source('11_shipping_plan_handlers.gs'), n => n === 'shippingPlanProjectBatch_', () => false)[0].text;
  vm.runInContext(projector.replace('function shippingPlanProjectBatch_', 'function oldProject_').replace(/if \(ka === kb\) \{ ka = JSON.stringify\(a\); kb = JSON.stringify\(b\); \}/g, ''), c);
  const current = c.shippingPlanProjectBatch_;
  const oldFp = (plans, lines) => { c.shippingPlanProjectBatch_ = c.oldProject_; try { return c.shippingPlanCanonicalFingerprint_(plans, lines); } finally { c.shippingPlanProjectBatch_ = current; } };
  h.commit([line()], 'LEGACY');
  let plans = h.sheets.shipping_plans.objects(), lines = h.sheets.shipping_plan_lines.objects();
  assert.equal(oldFp(plans, lines), c.shippingPlanCanonicalFingerprint_(plans, lines), 'single-group legacy fingerprint is unchanged');
  const second = { ...plans[0], shipping_plan_id: 'LEGACY2', customs_type: 'DDP' };
  const secondLine = { ...lines[0], shipping_plan_id: 'LEGACY2', shipping_plan_line_id: 'LEGACY-L2' };
  plans = [...plans, second]; lines = [...lines, secondLine];
  assert.notEqual(oldFp(plans, lines), oldFp(plans.slice().reverse(), lines), 'old comparator creates a false conflict on reordered customs groups');
  const fp = c.shippingPlanCanonicalFingerprint_(plans.slice().reverse(), lines.slice().reverse());
  assert.equal(c.shippingPlanClassifyBatch_(plans, lines, 'LEGACY', fp, 2).state, 'REUSED', 'old persisted insertion order needs no migration or stored hash rewrite');
});

test('existing completion reset and stale binding maps cannot turn the next new route into an old-header update', () => {
  const main = fs.readFileSync(path.join(__dirname, '../js/pages/inventory-replenishment.js'), 'utf8');
  const names = ['_irKeepUnsubmittedRoutesDw2_', '_irStampRouteGroupIds_', '_irPersistOneRouteGroup_'];
  const old = { sku: 'SKU', client_route_instance_id: 'OLD-INSTANCE', allocation_draft_id: 'OLD-H', allocation_draft_line_id: 'OLD-L' };
  const ctx = { company: 'KM', country: 'US', marketplace: 'Amazon' };
  let captured, persists = 0; const sentinel = new Error('CAPTURED_BEFORE_ANY_WRITE');
  const c = { console, window: { KM: {}, IRDraft: { buildDraftHeaderPayload: payload => { captured = payload; throw sentinel; } } }, document: { getElementById: () => null },
    replenAllocationDraft: { bySku: { SKU: [old] }, allocationDraftId: 'OLD-H', allocationDraftIds: ['OLD-H'], submitExecutionKey: 'OLD-SUBMIT' },
    _irTerminalDraftIds_: { 'OLD-H': 'submitted' }, _irLineDraftOf_: { 'OLD-L': 'OLD-H' }, _irDraftVer11_: { 'OLD-H': '4' },
    _persistAllocationDraft: () => { persists++; }, _irMaxVer11_: (a, b) => b };
  vm.createContext(c); vm.runInContext(extract(main, n => names.includes(n), () => false).map(x => x.text).join('\n'), c);
  c._irKeepUnsubmittedRoutesDw2_(['OLD-H']); assert.equal(c.replenAllocationDraft.submitExecutionKey, undefined); assert.equal(c.replenAllocationDraft.allocationDraftId, ''); assert.equal(c.replenAllocationDraft.allocationDraftIds.length, 0); assert.equal(Object.keys(c.replenAllocationDraft.bySku).length, 0); assert(persists);
  const fresh = { sku: 'SKU', client_route_instance_id: 'NEW-INSTANCE', allocation_draft_line_id: 'SADL-LOCAL-NEW' };
  c.replenAllocationDraft.bySku.SKU = [fresh];
  c._irStampRouteGroupIds_('SKU', { routes: [old], groupKey: 'same-route' }, 'OLD-H', '4', ctx);
  assert.equal(fresh.allocation_draft_id, undefined, 'late acknowledgement for the old instance must not bind the fresh row');
  assert.throws(() => c._irPersistOneRouteGroup_('SKU', ctx, { routes: [fresh], header: {}, groupKey: 'same-route' }), e => e === sentinel);
  assert.equal(captured.intent, 'CREATE_NEW_ROUTE'); assert.equal(captured.allocation_draft_id, undefined); assert.equal(captured.create_idempotency_key, 'NEW-INSTANCE');
  c._irStampRouteGroupIds_('SKU', { routes: [fresh], groupKey: 'same-route' }, 'NEW-H', '1', ctx);
  assert.equal(fresh.allocation_draft_id, 'NEW-H');
});

test('K2 and K4 submitted historical identities allow a fresh round; active round reuses its new identity', () => {
  for (const k4Ready of [false, true]) {
    const h = harness(), header = h.addDraft('TEMP'), sh = h.sheets.shipping_allocation_drafts; sh.data.splice(1); h.sheets.shipping_allocation_draft_lines.data.splice(1);
    const id = k4Ready ? h.c.ricK4DeterministicHeaderId_(header) : h.c.sadK2DeterministicHeaderId_(header);
    sh.append({ ...header, allocation_draft_id: id, status: 'submitted' });
    const historic = JSON.stringify(sh.data), r = h.c.sadResolveActiveDraftK2OrK3_(sh, header, { k4Ready });
    assert.equal(r.status, 'CREATE', JSON.stringify(r)); assert.notEqual(r.id, id); assert(r.id); assert.equal(JSON.stringify(sh.data), historic);
    sh.append({ ...header, allocation_draft_id: r.id });
    const retry = h.c.sadResolveActiveDraftK2OrK3_(sh, header, { k4Ready }); assert.equal(retry.status, 'REUSE'); assert.equal(retry.id, r.id);
  }
});

test('cancelled and expired identity guards are not relaxed', () => {
  for (const status of ['cancelled', 'expired']) {
    const h = harness(), header = h.addDraft('TEMP'), sh = h.sheets.shipping_allocation_drafts; sh.data.splice(1);
    const id = h.c.sadK2DeterministicHeaderId_(header); sh.append({ ...header, allocation_draft_id: id, status });
    const r = h.c.sadResolveActiveDraftK2OrK3_(sh, header, {}); assert.equal(r.id, id); assert.equal(sh.objects()[0].status, status);
  }
});

test('three complete submit rounds on the exact same K2/K4 route acquire fresh header IDs and never mutate historical plans', () => {
  for (const k4Ready of [false, true]) {
    const h = harness(), header = h.addDraft('TEMP'); h.sheets.shipping_allocation_drafts.data.splice(1); h.sheets.shipping_allocation_draft_lines.data.splice(1);
    let id = k4Ready ? h.c.ricK4DeterministicHeaderId_(header) : h.c.sadK2DeterministicHeaderId_(header);
    const ids = [], plans = [];
    for (let round = 1; round <= 3; round++) {
      if (round > 1) { const resolved = h.c.sadResolveActiveDraftK2OrK3_(h.sheets.shipping_allocation_drafts, header, { k4Ready }); assert.equal(resolved.status, 'CREATE'); id = resolved.id; }
      assert(!ids.includes(id)); ids.push(id); h.addDraft(id);
      const previousPlans = JSON.stringify(h.sheets.shipping_plans.data);
      const r = h.submit([id], 'K' + k4Ready + '-ROUND' + round); assert.equal(r.data.outcome, 'CREATED', JSON.stringify(r)); plans.push(r.data.plans[0]);
      assert.equal(JSON.stringify(h.sheets.shipping_plans.data.slice(0, round)), previousPlans);
      const w = h.writes(); assert.equal(h.submit([id], 'K' + k4Ready + '-ROUND' + round).data.outcome, 'REUSED'); assert.equal(h.writes(), w);
    }
    assert.equal(new Set(plans).size, 3); assert(h.sheets.shipping_allocation_drafts.objects().every(d => d.status === 'submitted'));
  }
});

test('physical merge key ignores Submit batch, cycle and recommendation group; customs still separates', () => {
  const h = harness(), c = h.c, p = { ...line(), carrier_id: 'C1', customs_type: 'DDP', import_duty_treatment: 'prepaid', submit_batch_id: 'ROUND2', recommendation_group_no: 'G2' };
  const s = { ...p, shipments_customs_type: 'DDP', submit_batch_id: 'ROUND1', planning_cycle: 'yesterday', recommendation_group_no: 'G1' };
  for (const policy of [{ mode: 'SAME_COMPANY' }, { mode: 'CROSS_COMPANY' }]) {
    assert.equal(c.xcdMergeKey_(p, true, policy, null), c.xcdMergeKey_(s, false, policy, null));
    assert.notEqual(c.xcdMergeKey_({ ...p, customs_type: 'DDU' }, true, policy, null), c.xcdMergeKey_(s, false, policy, null));
  }
  for (const field of ['carrier_id', 'shipping_method', 'last_mile_delivery', 'source_warehouse_id', 'destination_warehouse_id', 'import_duty_treatment']) assert.notEqual(c.sc13Key_({ ...p, [field]: 'OTHER' }, true), c.sc13Key_(s, false), field);
});

test('later approval actually merges separate Submit batches after customs edit, preserving links and signed line lineage', () => {
  const h = harness(), c = h.c; h.addDraft('H1'); h.addDraft('H2');
  const id1 = h.submit(['H1'], 'ROUND1').data.plans[0], id2 = h.submit(['H2'], 'ROUND2').data.plans[0];
  for (const id of [id1, id2]) for (const [k, v] of Object.entries({ status: 'approved', carrier_id: 'C1', customs_type: id === id1 ? 'DDP' : 'DDU', import_duty_treatment: 'prepaid' })) h.sheets.shipping_plans.set('shipping_plan_id', id, k, v);
  const ship = { shipment_id: 'SHIP1', shipment_no: 'S1', shipping_plan_id: id1, company: 'KM', status: 'draft', source_warehouse_id: 'SOURCE', destination_warehouse_id: 'DEST', country: 'US', carrier_id: 'C1', shipping_method: 'sea', last_mile_delivery: 'parcel', shipments_customs_type: 'DDP', import_duty_treatment: 'prepaid', shipment_total_qty: 80, note: '', updated_at: 'before', updated_by: 'Owner', shipment_total_cartons: 2, shipment_total_cbm: 0.2, shipment_total_gross_weight: 10, shipment_total_net_weight: 8, rate_card_id: '', rate_card_version: '', estimated_freight_cost: '', estimated_duty: '', estimated_customs_fee: '', estimated_total_cost: '', estimated_unit_cost: '' };
  h.sheets.shipments = new Sheet(Object.keys(ship), [ship]);
  h.sheets.shipment_plan_links = new Sheet(['shipment_plan_link_id', 'shipment_id', 'shipping_plan_id'], [{ shipment_plan_link_id: 'LINK1', shipment_id: 'SHIP1', shipping_plan_id: id1 }]);
  c.SC13_LINK_HEADERS_ = ['shipment_plan_link_id', 'shipment_id', 'shipping_plan_id'];
  c.sc13Read_ = (ss, name) => ({ sheet: h.sheets[name], headers: h.sheets[name].data[0], rows: h.sheets[name].objects().map((r, i) => ({ ...r, __row: i + 2 })) });
  c.sc13LinkForPlan_ = (ss, pid) => h.sheets.shipment_plan_links.objects().find(r => r.shipping_plan_id === pid)?.shipment_id || '';
  c.sc13LinkIds_ = (ss, sid) => h.sheets.shipment_plan_links.objects().filter(r => r.shipment_id === sid).map(r => r.shipping_plan_id);
  c.xcoMergeDestCheck_ = () => {};
  const firstLine = h.sheets.shipping_plan_lines.objects().find(l => l.shipping_plan_id === id1);
  const oldLine = { shipment_line_id: 'SHL1', shipment_id: 'SHIP1', shipping_plan_line_id: firstLine.shipping_plan_line_id, sku: 'SKU', shipment_qty: 80, shipment_carton_qty: 2, units_per_carton: 40, shipment_carton_cbm: 0.2, gross_weight: 10, net_weight: 8, created_at: 'before', updated_at: 'before', note: '' };
  h.sheets.shipment_lines = new Sheet(Object.keys(oldLine), [oldLine]);
  h.sheets.shipping_plans.set('shipping_plan_id', id1, 'transferred_shipment_id', 'SHIP1');
  assert.equal(c.sc13Prepare_(h.ss, id2, { mode: 'SAME_COMPANY' }).handled, false, 'different customs must not merge');
  h.sheets.shipping_plans.set('shipping_plan_id', id2, 'customs_type', 'DDP');
  const prepared = c.sc13Prepare_(h.ss, id2, { mode: 'SAME_COMPANY' }); assert.equal(prepared.handled, true); assert.equal(prepared.ship.shipment_id, 'SHIP1'); assert.equal(prepared.plan.submit_batch_id, 'ROUND2');
  assert.equal(prepared.incoming.length, 1); assert(prepared.incoming[0].source_reason.includes('allocation_draft:H2'));
  const held = { 'SOURCE||SKU': 80 };
  h.sheets.factory_stock = new Sheet(['sku']); h.sheets.factory_stock_movements = new Sheet(['sku']);
  c.shipmentSourceDomain_ = () => 'FACTORY'; c.SHIPMENT_DOMAIN_OVERSEAS_ = 'OVERSEAS';
  c.shipmentDomainHeld_ = () => ({ ...held }); c.shipmentReservationBooks_ = () => ({ verdict: 'RECONCILED' }); c.shipmentDomainAvailable_ = () => ({ available: 1000 });
  c.shipmentDomainAcquire_ = (domain, tables, request) => { held['SOURCE||' + request.sku] = request.qty; };
  c.csdCountRowsFor_ = () => 0; c.csdEventExists_ = c.csdMovementExists_ = () => false;
  c.shipmentTimestamp_ = () => '2026-11-24 14:00:00'; c.shipmentToday_ = () => '2026-11-24'; c.editNextStamp_ = now => now;
  c.shipmentAppendByHeader_ = (sheet, row) => sheet.append(row);
  const merged = c.sc13MergeLocked_(h.ss, prepared, 'Owner'); assert.equal(merged.consolidated, true, JSON.stringify(merged));
  assert.equal(h.sheets.shipments.objects().length, 1); assert.equal(h.sheets.shipments.objects()[0].shipment_total_qty, 160);
  assert.deepEqual(h.sheets.shipment_plan_links.objects().map(l => l.shipping_plan_id), [id1, id2]);
  assert.equal(h.sheets.shipment_lines.objects().length, 2); assert.equal(held['SOURCE||SKU'], 160);
  for (const l of h.sheets.shipment_lines.objects()) {
    const marker = JSON.parse(decodeURIComponent(l.note.match(/\[SC13_SOURCE:([^\]]+)\]/)[1]));
    assert.equal(marker.v, 2); assert(marker.sig); assert.equal(marker.plan_line_id, l.shipping_plan_line_id);
    assert.equal(c.sc13Source_(h.ss, l, h.sheets.shipments.objects()[0]).plan_id, marker.plan_id);
  }
  assert.equal(h.sheets.shipping_plans.objects().find(p => p.shipping_plan_id === id2).transferred_shipment_id, 'SHIP1');
  assert.equal(h.sheets.shipping_plans.objects()[0].submit_batch_id, 'ROUND1');
});

console.log('PER_SUBMIT_PLANS_PASS ' + passed + ' live_business_writes=0');
