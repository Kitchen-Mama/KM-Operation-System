'use strict';
// Offline policy tests: actual 11_/12_/17_ functions, in-memory sheets, no network or production writes.
// The source mirror's old 17_ lacks the later tax/quote helpers: labelled tax-only fixtures below.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../specs/active/apps-script');
const writes = [];
let book, serial = 0;
const ctx = { console, Utilities: {
  getUuid: () => (++serial).toString(16).padStart(32, '0').split('').reverse().join(''),
  DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(text).digest()),
  formatDate: () => '2026-11-24 12:00:00'
}, Session: { getScriptTimeZone: () => 'Asia/Taipei' },
SpreadsheetApp: { getActiveSpreadsheet: () => book, flush() {} },
LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
PropertiesService: { getScriptProperties: () => ({ setProperty() {}, deleteProperty() {} }) }
};
vm.createContext(ctx);
for (const name of ['36_document_template_handlers.gs', '17_carrier_handlers.gs', '12_shipment_handlers.gs', '11_shipping_plan_handlers.gs']) {
  vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), ctx, { filename: name });
}
Object.assign(ctx, {
  jsonResponse_: x => x,
  shippingPlanToday_: () => '2026-11-24', shippingPlanTimestamp_: () => '2026-11-24 12:00:00',
  prodRequireSheet_: (ss, name) => { const sh = ss.getSheetByName(name); assert.ok(sh, name); return sh; },
  prodRequireColumns_: (sh, names) => names.forEach(n => assert.ok(sh.headers.includes(n), n)),
  // Stock checks and token encoding are outside this pricing-policy fixture.
  wdlCheckStock_: () => {}, editP1Gate15f2_: () => null,
  editTok_: x => x, editTokSame_: (a, b) => a === b ? 'SAME' : 'DIFF',
  editNextStamp_: (_, old) => `${old[0] || 'v'}+`, editTokWritten15f2_: x => x,
  // Tax fixture: included duty is known zero; all other treatments remain unknown.
  shippingTaxQuote_: (_, lines, treatment, country, day, options) => ({
    known: treatment === 'included_in_rate', amount: treatment === 'included_in_rate' ? 0 : '',
    currency: options.freightCurrency, reason: treatment === 'included_in_rate' ? '' : 'CARD_DUTY_TREATMENT_UNKNOWN'
  }),
  shippingTaxNumber_: x => x === '' || x == null || !Number.isFinite(Number(x)) ? null : Number(x),
  shippingQuoteComplete_: q => !!q.rateCardId && q.estimatedFreightCost !== '' && q.estimatedDuty !== '',
  shipOriginCountry1g_: (ss, id) => (ctx.shippingPlanReadObjects_(ss.getSheetByName('warehouses')).find(w => w.warehouse_id === id) || {}).country || '',
  shipLt1g_: () => ({ state: 'UNKNOWN' })
});
class Sheet {
  constructor(name, headers, objects = []) {
    this.name = name; this.headers = Array.from(headers);
    this.rows = [this.headers, ...objects.map(o => this.headers.map(k => o[k] == null ? '' : o[k]))];
  }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.headers.length; }
  getDataRange() { return this.getRange(1, 1, this.rows.length, this.headers.length); }
  getRange(r, c, nr = 1, nc = 1) {
    return {
      getValues: () => this.rows.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)),
      setValue: v => { writes.push([this.name, r, this.headers[c - 1], v]); this.rows[r - 1][c - 1] = v; },
      setValues: vals => vals.forEach((row, i) => row.forEach((v, j) => this.getRange(r + i, c + j).setValue(v)))
    };
  }
  appendRow(row) { writes.push([this.name, 'append']); this.rows.push(Array.from(row)); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
}
const card = (tier, extra = {}) => Object.assign({
  rate_card_id: `R${tier}`, carrier_id: 'C1', origin_country: 'CN', destination_country: 'US',
  marketplace: '', shipping_method: 'sea', shipping_method_label: 'Sea', last_mile_delivery: 'ups',
  charge_type: 'weight', charge_unit: 'kg', weight_tier: tier, weight_tier_unit: 'kg',
  dim_divisor: 6000, min_box_weight: 10, min_box_weight_unit: 'kg',
  currency: 'USD', unit_rate: 5 - tier / 100, customs_type: 'self_customs', battery_type: 'no_battery',
  import_duty_treatment: 'included_in_rate', status: 'active', effective_from: '2026-01-01', effective_to: ''
}, extra);
const plan = extra => Object.assign({ shipping_plan_id: 'P', company: 'KM', country: 'US', marketplace: 'Amazon',
  source_warehouse_id: 'CN', ship_from: 'CN', shipping_method: 'sea', last_mile_delivery: 'ups', customs_type: 'self_customs',
  carrier_id: 'C1', status: 'draft', updated_at: 'v1', carrier_rate_type: 'weight' }, extra);
const line = (weight, extra = {}) => Object.assign({ shipping_plan_line_id: 'L', shipping_plan_id: 'P', sku: 'SKU',
  requested_qty: weight, approved_qty: weight, units_per_carton: 10, plan_carton_qty: weight / 10,
  gross_weight: weight, cbm: weight / 1000, updated_at: 'v1' }, extra);
function setup(cards = [20, 50, 100, 200].map(t => card(t)), p = plan(), ls = [line(100)]) {
  const sheets = {};
  const add = (name, objects, headers) => sheets[name] = new Sheet(name,
    headers || Array.from(new Set(objects.flatMap(o => Object.keys(o)))), objects);
  add('shipping_plans', [p], Array.from(new Set([...ctx.SHIPPING_PLANS_HEADERS_, 'estimated_duty_currency'])));
  add('shipping_plan_lines', ls, ctx.SHIPPING_PLAN_LINES_HEADERS_);
  add('carrier_rate_cards', cards);
  add('carriers', [{ carrier_id: 'C1', carrier_name: 'Carrier One', status: 'active' }, { carrier_id: 'C2', carrier_name: 'Carrier Two', status: 'active' }]);
  add('warehouses', [{ warehouse_id: 'CN', warehouse_code: 'CN', warehouse_name: 'CN Factory', country: 'CN' },
    { warehouse_id: 'US', warehouse_code: 'US', warehouse_name: 'US Warehouse', country: 'US' }]);
  add('sku_details', [{ sku: 'SKU', battery_type: 'no_battery', units_per_carton: 10, carton_weight: 10,
    carton_length: 10, carton_width: 10, carton_height: 10, carton_dimension_unit: 'cm', item_weight: 1 }]);
  add('marketplace_skus', [{ sku: 'SKU', country: 'US', marketplace: 'Amazon', company: 'KM', site_sku: 'SKU' }]);
  book = { getSheetByName: n => sheets[n] || null, getSpreadsheetTimeZone: () => 'Asia/Taipei' };
  writes.length = 0; return sheets;
}
const ids = cards => Array.from(cards, c => c.rate_card_id).sort();
let pass = 0;
function test(name, fn) { fn(); pass++; console.log(`PASS ${name}`); }
test('country service estimate uses representative destination without writing plan destination', () => {
  setup([card(100, { destination_warehouse_code: 'ONT8', destination_city: 'LA', destination_postal_code_start: '80000', destination_postal_code_end: '89999' })]);
  const p = plan(), lane = ctx.spRcLaneCards_(book, p, [line(100)], '2026-11-24');
  assert.equal(lane.estimate_only, true); assert.equal(lane.cards.length, 1);
  const quote = ctx.spRcQuote_(book, p, lane.cards[0], [line(100)], ctx.spRcTotals_([line(100)]), '2026-11-24', lane.origin, lane);
  assert.equal(quote.rateCardId, 'R100'); assert.equal(quote.estimatedFreightCost, 400); assert.equal(p.destination_warehouse_id, undefined); assert.equal(writes.length, 0);
  const options = ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' }); assert.equal(options.estimate_only, true); assert.equal(options.options[0].estimate_basis, 'COUNTRY_SERVICE');
});
test('concrete plan and Shipment Draft still reject wrong destination card', () => {
  setup([card(100, { destination_warehouse_code: 'ONT8' })]);
  const lane = ctx.spRcLaneCards_(book, plan({ destination_warehouse_id: 'US' }), [line(100)], '2026-11-24');
  assert.equal(lane.estimate_only, false); assert.equal(lane.cards.length, 0);
  const q = ctx.shipmentExactRateAndCost_(book, { originCountry: 'CN', planRateCardId: 'R100', carrierId: 'C1', country: 'US', shippingMethod: 'sea', lastMile: 'ups', destinationWarehouseCode: 'OTHER', quoteDate: '2026-11-24', grossWeightKg: 100, cartons: 10, totalQty: 100, lines: [{ sku: 'SKU' }] });
  assert.equal(q.rateCardId, ''); assert.equal(writes.length, 0);
});
test('100 physical kg: only 100 tier; dim 6000 and min box 10 do not hide rates', () => {
  setup(); assert.deepEqual(ids(ctx.spRcLaneCards_(book, plan(), [line(100)], '2026-11-24').cards), ['R100']);
});
test('min-box 12 also stays visible and kg/lb thresholds retain their common ladder', () => {
  setup([card(20, { min_box_weight: 12 }), card(100, { min_box_weight: 12 })]);
  assert.deepEqual(ids(ctx.spRcLaneCards_(book, plan(), [line(100)], '2026-11-24').cards), ['R100']);
  const cards = [card(20), card(100, { weight_tier: 220.462, weight_tier_unit: 'lb' })];
  assert.deepEqual(ids(ctx.spRcApplicableTiers_(cards, { gw: 100 })), ['R100']);
});
test('50/99/10/unknown kg never select a higher threshold', () => {
  setup();
  for (const [weight, expected] of [[50, ['R50']], [99, ['R50']], [10, []], ['', []], ['bad', []]]) {
    assert.deepEqual(ids(ctx.spRcLaneCards_(book, plan(), [line(weight)], '2026-11-24').cards), expected);
  }
});
test('distinct carrier, method, last-mile, currency, customs, battery, and lane/terms remain separate', () => {
  const variants = [{ carrier_id: 'C2' }, { shipping_method: 'air' }, { last_mile_delivery: 'truck' }, { currency: 'CNY' },
    { customs_type: 'third_party_customs' }, { battery_type: 'alkaline_battery' }, { destination_city: 'LA' },
    { min_box_weight: 12 }, { dim_divisor: 5000 }, { import_duty_treatment: 'excluded_in_rate' }];
  const cards = [card(20), card(100), ...variants.map((v, i) => card(20, Object.assign({ rate_card_id: `V${i}` }, v)))];
  assert.equal(ctx.spRcApplicableTiers_(cards, { gw: 100 }).length, 11);
});
test('inactive, expired, wrong battery/destination/customs cards cannot suppress a valid tier', () => {
  setup([card(20), card(100, { status: 'inactive' }), card(100, { effective_to: '2025-01-01' }),
    card(100, { destination_country: 'CA' }), card(100, { battery_type: 'lithium_battery' }),
    card(100, { customs_type: 'third_party_customs' })]);
  assert.deepEqual(ids(ctx.spRcLaneCards_(book, plan(), [line(100)], '2026-11-24').cards), ['R20']);
});
test('unknown one-line weight poisons total; numeric zero remains known', () => {
  assert.equal(ctx.spRcTotals_([line(100), line('')]).gw, '');
  assert.equal(ctx.spRcTotals_([line(0)]).gw, 0);
  assert.equal(ctx.spRcTotals_([]).gw, '');
});
test('read options exposes only applicable tier and metadata, with zero writes', () => {
  setup(); const answer = ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' });
  assert.equal(answer.success, true); assert.deepEqual(ids(answer.options), ['R100']);
  assert.equal(answer.options[0].weight_tier, 100); assert.equal(answer.options[0].quote.freight, 400);
  assert.equal(writes.length, 0);
});
test('select API rejects obsolete lower and above-weight cards before any mutation', () => {
  const sheets = setup();
  for (const id of ['R20', 'R50', 'R200']) {
    const rc = ctx.shippingReadRateCards_(book).find(c => c.rate_card_id === id);
    const answer = ctx.handleShippingPlanSelectRateCard_({ shipping_plan_id: 'P', rate_card_id: id,
      rate_card_version: ctx.shipRateCardVersion_(rc), expected_current_carrier_id: 'C1', expected_updated_at: 'v1' });
    assert.equal(answer.code, 'RATE_CARD_NOT_APPLICABLE'); assert.equal(writes.length, 0);
  }
  assert.equal(sheets.shipping_plans.rows.length, 2);
});
test('10 kg plan cannot save the 20 kg minimum card, zero writes and customs unchanged', () => {
  const sheets = setup(undefined, plan(), [line(10)]);
  const rc = ctx.shippingReadRateCards_(book).find(c => c.rate_card_id === 'R20');
  const answer = ctx.handleShippingPlanSelectRateCard_({ shipping_plan_id: 'P', rate_card_id: 'R20',
    rate_card_version: ctx.shipRateCardVersion_(rc), expected_current_carrier_id: 'C1', expected_updated_at: 'v1' });
  assert.equal(answer.code, 'RATE_CARD_NOT_APPLICABLE'); assert.equal(writes.length, 0);
  assert.equal(ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0].customs_type, 'self_customs');
});
test('selected eligible card still prices and verifies with existing server contract', () => {
  setup(); const rc = ctx.shippingReadRateCards_(book).find(c => c.rate_card_id === 'R100');
  const answer = ctx.handleShippingPlanSelectRateCard_({ shipping_plan_id: 'P', rate_card_id: 'R100',
    rate_card_version: ctx.shipRateCardVersion_(rc), expected_current_carrier_id: 'C1', expected_updated_at: 'v1' });
  assert.equal(answer.success, true); assert.equal(answer.estimated_freight_cost, 400);
});
test('quote uses supplied lane once, rather than rerunning matching for each option', () => {
  setup(); const lane = ctx.spRcLaneCards_(book, plan(), [line(100)], '2026-11-24');
  const original = ctx.spRcLaneCards_; ctx.spRcLaneCards_ = () => { throw new Error('repeated lane match'); };
  try { assert.equal(ctx.spRcQuote_(book, plan(), lane.cards[0], [line(100)], ctx.spRcTotals_([line(100)]), '2026-11-24', 'CN', lane).estimatedFreightCost, 400); }
  finally { ctx.spRcLaneCards_ = original; }
});
test('unique service defaults, but not customs or guessed prices; no writes during derivation', () => {
  setup(); const q = ctx.shippingPlanRoughQuote_(book, plan({ carrier_id: '', customs_type: '' }), [{ sku: 'SKU', requested_qty: 100 }], '2026-11-24');
  assert.equal(q.carrier_id, 'C1'); assert.equal(q.shipping_method, 'sea'); assert.equal(q.last_mile_delivery, 'ups');
  assert.equal(q.customs_type, ''); assert.equal(q.estimated_total_cost, ''); assert.equal(writes.length, 0);
});
test('ambiguous carriers/services or mismatched plan method/last-mile never default', () => {
  for (const extra of [{ carrier_id: 'C2' }, { last_mile_delivery: 'truck' }]) {
    setup([card(100), card(100, Object.assign({ rate_card_id: 'OTHER' }, extra))]);
    const q = ctx.shippingPlanRoughQuote_(book, plan({ carrier_id: '', last_mile_delivery: '' }), [{ sku: 'SKU', requested_qty: 100 }], '2026-11-24');
    assert.equal(q.carrier_id, '');
  }
  setup();
  for (const p of [plan({ carrier_id: '', shipping_method: 'air' }), plan({ carrier_id: '', last_mile_delivery: 'truck' })]) {
    assert.equal(ctx.shippingPlanRoughQuote_(book, p, [{ sku: 'SKU', requested_qty: 100 }], '2026-11-24').carrier_id, '');
  }
});
test('country-only plan uses a stable representative quote within its chosen service', () => {
  setup([card(100), card(100, { rate_card_id: 'CNY', currency: 'CNY' })]);
  const q = ctx.shippingPlanRoughQuote_(book, plan({ carrier_id: '' }), [{ sku: 'SKU', requested_qty: 100 }], '2026-11-24');
  assert.equal(q.carrier_id, 'C1'); assert.equal(q.customs_type, 'self_customs');
  assert.equal(q.estimated_total_cost, 400); assert.equal(q.carrier_unit_rate, 4);
});
test('different-method carriers do not prevent a unique matching service; inactive carriers never default', () => {
  setup([card(100), card(100, { rate_card_id: 'AIR', carrier_id: 'C2', shipping_method: 'air' })]);
  assert.equal(ctx.shippingPlanRoughQuote_(book, plan({ carrier_id: '' }), [{ sku: 'SKU', requested_qty: 100 }], '2026-11-24').carrier_id, 'C1');
  const sheets = setup(); sheets.carriers.rows[1][sheets.carriers.headers.indexOf('status')] = 'inactive';
  assert.equal(ctx.shippingPlanRoughQuote_(book, plan({ carrier_id: '' }), [{ sku: 'SKU', requested_qty: 100 }], '2026-11-24').carrier_id, '');
});
test('actual batch creation persists unique service inside the existing append transaction, customs blank', () => {
  const sheets = setup(); sheets.shipping_plans.rows.splice(1); sheets.shipping_plan_lines.rows.splice(1);
  const result = ctx.shippingPlanCommitFromLines_(book, [{ sku: 'SKU', requested_qty: 100, company: 'KM', country: 'US', marketplace: 'Amazon',
    ship_from: 'CN', source_warehouse_id: 'CN', shipping_method: 'sea', last_mile_delivery: 'ups' }], {});
  assert.equal(result.success, true);
  const saved = ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0];
  assert.equal(saved.carrier_id, 'C1'); assert.equal(saved.shipping_method, 'sea'); assert.equal(saved.last_mile_delivery, 'ups');
  assert.equal(saved.customs_type, ''); assert.equal(saved.estimated_freight_cost, '');
});
test('quantity update reprices across tiers; below minimum clears stale costs, never changes customs', () => {
  const sheets = setup();
  for (const [qty, tier, cost] of [[50, 'R50', 225], [100, 'R100', 400], [10, '', '']]) {
    const result = ctx.spUpdateLineQtyCore_({ shipping_plan_id: 'P', lines: [{ shipping_plan_line_id: 'L', approved_qty: qty }] });
    assert.equal(result.success, true); assert.equal(result.data.repriced_plans[0].rate_card_id, tier);
    const saved = ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0];
    assert.equal(saved.estimated_freight_cost, cost); assert.equal(saved.customs_type, 'self_customs');
    assert.notEqual(saved.carrier_rate_type.indexOf('PENDING_SELECTION:'), 0);
  }
});
test('interrupted quantity write leaves an explicit pending quote, not a stale valid price', () => {
  const sheets = setup(); const original = sheets.shipping_plan_lines.getRange.bind(sheets.shipping_plan_lines);
  sheets.shipping_plan_lines.getRange = (r, c, ...rest) => {
    const range = original(r, c, ...rest);
    if (sheets.shipping_plan_lines.headers[c - 1] === 'approved_qty') range.setValue = () => { throw Error('injected write interruption'); };
    return range;
  };
  assert.throws(() => ctx.spUpdateLineQtyCore_({ shipping_plan_id: 'P', lines: [{ shipping_plan_line_id: 'L', approved_qty: 50 }] }), /injected write interruption/);
  assert.equal(ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0].carrier_rate_type, 'PENDING_SELECTION:QUANTITY');
  assert.equal(ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' }).current.state, 'PENDING');
});
test('unpriced service stays available even when no eligible weight tier exists', () => {
  setup(undefined, plan({ carrier_unit_rate: '', estimated_freight_cost: '' }), [line(10)]);
  const result = ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' });
  assert.equal(result.success, true); assert.equal(result.options.length, 1);
  assert.equal(result.options[0].service_only, true); assert.equal(result.options[0].quote.priced, false);
});
test('historical weight tiers do not invalidate a unique current equivalent quote', () => {
  setup([card(50, { unit_rate: 4 }), card(100, { unit_rate: 4 })], plan({ carrier_unit_rate: 4, currency: 'USD', estimated_total_cost: 400,
    estimated_freight_cost: 400, estimated_duty: 0, estimated_duty_currency: 'USD', estimated_customs_fee: 0 }));
  const p = ctx.shippingPlanReadObjects_(book.getSheetByName('shipping_plans'))[0];
  const option = { ...card(100, { unit_rate: 4 }), quote: { priced: true, total: 400, currency: 'USD', freight: 400, duty: 0, duty_currency: 'USD', customs_fee: 0 } };
  const verified = ctx.spRcWk1CardCheck_(book, p, [option], 'CN');
  assert.equal(verified.status, 'CURRENT_EQUIVALENT');
  assert.equal(verified.rate_card_id, '', 'must not invent the original card identity');
  assert.equal(ctx.spRcWk1CardCheck_(book, p, [option, { ...option, rate_card_id: 'DUP' }], 'CN').status, 'AMBIGUOUS');
  assert.equal(ctx.spRcWk1CardCheck_(book, p, [{ ...option, quote: { priced: true, total: 401, currency: 'USD' } }], 'CN').cost_reproduced, false);
  for (const patch of [{ freight: 390, duty: 10 }, { duty_currency: 'CNY' }, { customs_fee: '' }]) {
    assert.equal(ctx.spRcWk1CardCheck_(book, p, [{ ...option, quote: { ...option.quote, ...patch } }], 'CN').cost_reproduced, false,
      'same total cannot validate different or unknown component costs/currencies');
  }
  const splitPlan = { ...p, estimated_total_cost: '', estimated_duty: 10, estimated_duty_currency: 'CNY' };
  const splitQuote = { ...option, quote: { ...option.quote, split_currency: true, total: '', duty: 10, duty_currency: 'CNY' } };
  assert.equal(ctx.spRcWk1CardCheck_(book, splitPlan, [splitQuote], 'CN').cost_reproduced, true);
  assert.equal(ctx.spRcWk1CardCheck_(book, splitPlan, [{ ...splitQuote, quote: { ...splitQuote.quote, freight: 399 } }], 'CN').cost_reproduced, false);
  const selected = ctx.shippingReadRateCards_(book).find(c => c.rate_card_id === 'R100');
  assert.equal(ctx.handleShippingPlanSelectRateCard_({ shipping_plan_id: 'P', rate_card_id: 'R100',
    rate_card_version: ctx.shipRateCardVersion_(selected), expected_current_carrier_id: 'C1', expected_updated_at: 'v1' }).success, true);
  const readback = ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' });
  assert.equal(readback.current.state, 'PRICED');
  assert.equal(readback.current.card_check.status, 'CURRENT_EQUIVALENT');
});
test('wildcard defaults/options/select/readback preserve parcel or blank, pricing keeps original card axes', () => {
  const engine = ctx.shipmentExactRateAndCost_, leadTime = ctx.shipLt1g_, calls = [];
  ctx.shipmentExactRateAndCost_ = (ss, input) => { calls.push({ id: input.planRateCardId, last: input.lastMile }); return engine(ss, input); };
  ctx.shipLt1g_ = (ss, carrier, method, last) => ({ state: 'READY', queried_last_mile: last });
  try {
    for (const intended of ['parcel', '']) {
      calls.length = 0;
      const sheets = setup([card(100, { last_mile_delivery: '' })], plan({ last_mile_delivery: intended }));
      const rough = ctx.shippingPlanRoughQuote_(book, plan({ carrier_id: '', last_mile_delivery: intended }), [{ sku: 'SKU', requested_qty: 100 }], '2026-11-24');
      assert.equal(rough.carrier_id, 'C1'); assert.equal(rough.last_mile_delivery, intended);
      const options = ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' });
      assert.equal(options.options.length, 1); assert.equal(options.options[0].last_mile_delivery, intended);
      assert.equal(options.options[0].lead_time.queried_last_mile, intended); assert.equal(writes.length, 0);
      const chosen = options.options[0];
      const selected = ctx.handleShippingPlanSelectRateCard_({ shipping_plan_id: 'P', rate_card_id: chosen.rate_card_id,
        rate_card_version: chosen.rate_card_version, expected_current_carrier_id: 'C1', expected_updated_at: 'v1' });
      assert.equal(selected.success, true); assert.equal(selected.last_mile_delivery, intended);
      const readback = ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' });
      assert.equal(readback.current.state, 'PRICED'); assert.equal(readback.current.last_mile_delivery, intended);
      assert.equal(readback.options[0].last_mile_delivery, readback.current.last_mile_delivery, 'Review exact-pair restoration');
      assert.equal(ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0].last_mile_delivery, intended);
      assert.equal(ctx.shippingReadRateCards_(book)[0].last_mile_delivery, '', 'card axis is never rewritten');
      assert.ok(calls.length > 0 && calls.every(c => c.id === 'R100' && c.last === ''), 'engine receives original ID and blank axis');
    }
  } finally { ctx.shipmentExactRateAndCost_ = engine; ctx.shipLt1g_ = leadTime; }
});

test('wildcard customs-only and quantity tier repricing preserve the intended last mile', () => {
  for (const intended of ['parcel', '']) {
    const cards = [20, 50, 100].flatMap(t => [card(t, { last_mile_delivery: '' }),
      card(t, { rate_card_id: 'FORMAL-' + t, last_mile_delivery: '', customs_type: 'formal_customs' })]);
    const sheets = setup(cards, plan({ last_mile_delivery: intended }));
    const changed = ctx.handleShippingPlanSelectRateCard_({ shipping_plan_id: 'P', customs_only: true,
      customs_type: 'formal_customs', expected_current_carrier_id: 'C1', expected_updated_at: 'v1' });
    assert.equal(changed.success, true); assert.equal(changed.priced, true); assert.equal(changed.last_mile_delivery, intended);
    assert.equal(changed.rate_card_id, 'FORMAL-100');
    for (const [qty, expected] of [[50, 225], [100, 400]]) {
      const result = ctx.spUpdateLineQtyCore_({ shipping_plan_id: 'P', lines: [{ shipping_plan_line_id: 'L', approved_qty: qty }] });
      assert.equal(result.success, true); assert.equal(result.data.repriced_plans[0].priced, true);
      assert.equal(result.data.repriced_plans[0].rate_card_id, 'FORMAL-' + qty);
      const saved = ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0];
      assert.equal(saved.last_mile_delivery, intended); assert.equal(saved.customs_type, 'formal_customs');
      assert.equal(saved.estimated_freight_cost, expected);
      assert.equal(ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' }).current.state, 'PRICED');
    }
  }
});

test('wildcard and explicit cards deduplicate one service but preserve multiple price choices', () => {
  setup([card(100, { rate_card_id: 'EXPLICIT', last_mile_delivery: 'parcel', unit_rate: 6 }), card(100, { last_mile_delivery: '' })], plan({ last_mile_delivery: 'parcel' }));
  const p = plan({ last_mile_delivery: 'parcel' }), lane = ctx.spRcLaneCards_(book, p, [line(100)], '2026-11-24');
  assert.equal(ctx.spRcUniqueService_(book, p, lane.cards).last_mile_delivery, 'parcel');
  assert.equal(ctx.spRcPricingSnapshot_(book, p, [line(100)], '2026-11-24', lane).unpriced_reason, 'CARD_CHOICE_REQUIRED');
  assert.equal(ctx.spRcServices15_(book, p, [line(100)], lane, '2026-11-24').length, 1);
  const options = ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' }).options;
  assert.deepEqual(ids(options), ['EXPLICIT', 'R100']); assert.ok(options.every(o => o.last_mile_delivery === 'parcel'));
  const unchosen = ctx.handleShippingPlanSelectRateCard_({ shipping_plan_id: 'P', customs_only: true,
    customs_type: 'self_customs', expected_current_carrier_id: 'C1', expected_updated_at: 'v1' });
  assert.equal(unchosen.priced, false); assert.equal(unchosen.unpriced_reason, 'CARD_CHOICE_REQUIRED');
  const wildcard = options.find(o => o.rate_card_id === 'R100');
  const selected = ctx.handleShippingPlanSelectRateCard_({ shipping_plan_id: 'P', rate_card_id: wildcard.rate_card_id,
    rate_card_version: wildcard.rate_card_version, expected_current_carrier_id: 'C1', expected_updated_at: unchosen.updated_at });
  assert.equal(selected.success, true); assert.equal(selected.estimated_freight_cost, 400, 'chosen wildcard ID, not first explicit card');
  assert.equal(selected.last_mile_delivery, 'parcel');
});

test('explicit mismatches do not match; wildcard services do not invent a last mile or carrier', () => {
  setup([card(100, { last_mile_delivery: 'truck' })], plan({ last_mile_delivery: 'parcel' }));
  const p = plan({ last_mile_delivery: 'parcel' }), lane = ctx.spRcLaneCards_(book, p, [line(100)], '2026-11-24');
  assert.equal(ctx.spRcUniqueService_(book, p, lane.cards), null);
  assert.equal(ctx.spRcPricingSnapshot_(book, p, [line(100)], '2026-11-24', lane).unpriced_reason, 'NO_APPLICABLE_CARD');
  assert.equal(ctx.spRcServiceAllowed15_(book, p, [line(100)], lane, '2026-11-24', 'C1', 'sea', 'parcel'), false);
  const wildcard = card(100, { last_mile_delivery: '' });
  assert.equal(ctx.spRcUniqueService_(book, p, [wildcard, { ...wildcard, carrier_id: 'C2' }]), null);
  assert.equal(ctx.spRcUniqueService_(book, plan({ last_mile_delivery: '' }), [wildcard, card(100, { last_mile_delivery: 'parcel' })]), null);
  setup([wildcard], p);
  const newLane = ctx.spRcLaneCards_(book, p, [line(100)], '2026-11-24');
  assert.equal(ctx.spRcServiceAllowed15_(book, p, [line(100)], newLane, '2026-11-24', 'C1', 'sea', 'truck'), true, 'explicit requested value covered by wildcard');
});
test('actual creation preserves unknown carton weights and never prices their zero tier; measured zero remains valid', () => {
  for (const weight of ['', 'invalid', '12kg', -1, 0]) {
    const sheets = setup([card(0)]);
    sheets.sku_details.rows[1][sheets.sku_details.headers.indexOf('carton_weight')] = weight;
    sheets.shipping_plans.rows.splice(1); sheets.shipping_plan_lines.rows.splice(1);
    const result = ctx.shippingPlanCommitFromLines_(book, [{ sku: 'SKU', requested_qty: 100, company: 'KM', country: 'US', marketplace: 'Amazon',
      ship_from: 'CN', source_warehouse_id: 'CN', shipping_method: 'sea', last_mile_delivery: 'ups', carrier_id: 'C1', customs_type: 'self_customs' }], {});
    assert.equal(result.success, true);
    const saved = ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0], savedLine = ctx.shippingPlanReadObjects_(sheets.shipping_plan_lines)[0];
    assert.equal(ctx.shippingPlanSkuLogisticsMap_(book).SKU.cartonWeight, weight === 0 ? 0 : '', 'map preserves unknown, not zero');
    assert.equal(savedLine.gross_weight, weight === 0 ? 0 : '');
    assert.equal(saved.estimated_freight_cost, weight === 0 ? 0 : '');
    const options = ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: saved.shipping_plan_id });
    assert.equal(options.options.some(o => o.rate_card_id === 'R0' && o.quote.priced), weight === 0, 'only measured zero is eligible');
  }
});

test('actual quantity repricing clears stale costs when carton weight becomes blank, invalid, or negative', () => {
  for (const weight of ['', 'invalid', '12kg', -1]) {
    const sheets = setup([card(0)], plan({ carrier_unit_rate: 5, estimated_freight_cost: 500, estimated_total_cost: 500 }));
    sheets.sku_details.rows[1][sheets.sku_details.headers.indexOf('carton_weight')] = weight;
    const result = ctx.spUpdateLineQtyCore_({ shipping_plan_id: 'P', lines: [{ shipping_plan_line_id: 'L', approved_qty: 50 }] });
    assert.equal(result.success, true); assert.equal(result.data.repriced_plans[0].priced, false);
    assert.equal(result.data.repriced_plans[0].unpriced_reason, 'NO_APPLICABLE_CARD');
    assert.equal(ctx.shippingPlanReadObjects_(sheets.shipping_plan_lines)[0].gross_weight, '');
    const saved = ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0];
    assert.equal(saved.estimated_freight_cost, ''); assert.equal(saved.estimated_total_cost, '');
    assert.equal(ctx.handleShippingPlanRateCardOptions_({ shipping_plan_id: 'P' }).options.some(o => o.rate_card_id && o.quote.priced), false);
  }
});

test('positive quantity with missing UPC keeps gross unknown during actual creation and quantity update', () => {
  let sheets = setup([card(0)]);
  sheets.sku_details.rows[1][sheets.sku_details.headers.indexOf('units_per_carton')] = '';
  sheets.shipping_plans.rows.splice(1); sheets.shipping_plan_lines.rows.splice(1);
  const created = ctx.shippingPlanCommitFromLines_(book, [{ sku: 'SKU', requested_qty: 100, company: 'KM', country: 'US', marketplace: 'Amazon',
    ship_from: 'CN', source_warehouse_id: 'CN', shipping_method: 'sea', last_mile_delivery: 'ups', carrier_id: 'C1', customs_type: 'self_customs' }], {});
  assert.equal(created.success, true);
  assert.equal(ctx.shippingPlanReadObjects_(sheets.shipping_plan_lines)[0].gross_weight, '');
  assert.equal(ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0].estimated_freight_cost, '');
  sheets = setup([card(0)], plan({ estimated_freight_cost: 500 }), [line(100, { units_per_carton: '' })]);
  sheets.sku_details.rows[1][sheets.sku_details.headers.indexOf('units_per_carton')] = '';
  const updated = ctx.spUpdateLineQtyCore_({ shipping_plan_id: 'P', lines: [{ shipping_plan_line_id: 'L', approved_qty: 50 }] });
  assert.equal(updated.success, true); assert.equal(updated.data.repriced_plans[0].priced, false);
  assert.equal(ctx.shippingPlanReadObjects_(sheets.shipping_plan_lines)[0].gross_weight, '');
  assert.equal(ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0].estimated_freight_cost, '');
  const logi = { cartonWeight: 10, cartonDimUnit: 'cm', cartonL: 10, cartonW: 10, cartonH: 10, itemWeight: 1 };
  for (const cartons of ['', undefined, null, 'invalid', -1, 0]) assert.equal(ctx.shippingPlanLineLogistics_(logi, 100, cartons).gross_weight, '');
  assert.equal(ctx.shippingPlanLineLogistics_({ ...logi, cartonWeight: 0 }, 100, 10).gross_weight, 0);
  assert.equal(ctx.shippingPlanLineLogistics_(logi, 0, 0).gross_weight, 0);
});
console.log(`PASS ${pass} pricing-policy tests (offline)`);
