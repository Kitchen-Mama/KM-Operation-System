'use strict';

// Offline regression: execute the shipped GS mappers, slice writer and real supply engines.
// Run: node --test assets/tests/inventory-gap-ongoing-warning.test.cjs
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const gs = name => fs.readFileSync(path.join(__dirname, '../specs/active/apps-script', name), 'utf8');
const core = new Function([
  gs('90_generated_supply_planning_bundle.gs'),
  gs('42_api_v1_recommendation_workspace.gs'),
  gs('43_api_v1_gap_materialization.gs'),
  'return { inv: gapInvMapFromLines_, op: gapOpMapFromLines_, slice: gapProcessScopeSlice_,',
  '  headers: INV_GAP_HEADERS_, envelope: gapBatchEnvelope_, ongoing: KMOOR.projectOngoingIncomingForSku,',
  '  unaccounted: recoWsOngoingUnaccounted_, horizons: recoWsBuildHorizons_ };'
].join('\n'))();
const scope = { company: 'KM', country: 'US', marketplace: 'Amazon' };
const sku = 'GAP-SKU';
const date = '2026-11-24';
const months = ['2026-12', '2027-01', '2027-02', '2027-03'];
const po = {
  purchase_order_line_id: 'POL-MISSING-DATE', purchase_order_id: 'PO-FIXTURE',
  company: scope.company, sku, supplier_warehouse_id: 'FACTORY',
  ordered_qty: 100, completed_qty: 20, shipped_qty: 0, requested_qty: 100,
  request_order_line_id: 'ROL-FIXTURE', expected_completion_date: ''
};
const beforePo = JSON.stringify(po);
const ongoing = core.ongoing({
  masterSku: sku, company: scope.company, purchaseOrderLines: [po], months,
  requestOrderLineSources: [{ request_order_line_id: 'ROL-FIXTURE', ...scope, site_sku: 'SITE-SKU', requested_qty: 100 }],
  monthlySiteFcFacts: [{ ...scope, siteSku: 'SITE-SKU', siteFcBasis: 100 }]
});
const excluded = core.unaccounted([po], scope.company, sku, ongoing, null, '');
const admission = { complete: false, excluded };
const incoming = Object.values(ongoing.byReceiver).flat();
const horizons = core.horizons({ calculationDate: date }, [], [], [], { sku }, scope, sku,
  20, incoming, 10, null, 'sales_driven', 2);
function line(overrides = {}) {
  return {
    sku, blocked: false, ongoingAdmission: admission, horizons,
    monthlyProjection: months.map((month, i) => ({ tier: 'T' + (i + 1), month, remainingGapQty: 30, suggestedOrderQty: 30 })),
    ...overrides
  };
}
const map = lines => core.inv(lines, scope, sku, date);
const quantities = row => core.headers.filter(k => /_(gap|suggested)_qty$/.test(k)).map(k => row[k]);
function blocked(lines, reason) {
  const row = map(lines);
  assert.equal(row.calculation_status, 'BLOCKED');
  assert.equal(row.note, reason);
  assert.ok(quantities(row).every(q => q === null), 'blocked quantities remain unknown, not zero');
}

test('success and failure envelopes identify the updated gap handler for deployment audit', () => {
  for (const env of [core.envelope(true, {}), core.envelope(false, null, 'FIXTURE_ERROR', 'fixture')]) {
    assert.equal(env.meta.gapMaterializationHandlerVersion, 'inventory-ongoing-warning-20261124');
  }
});

test('real ongoing engine excludes undated future PO supply; no fabricated date or mutation', () => {
  assert.ok(ongoing.issues.some(x => x.code === 'ONGOING_ORDER_ETA_UNRESOLVED'));
  assert.equal(incoming.length, 0);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].code, 'ONGOING_ETA_UNRESOLVED');
  assert.equal(excluded[0].qty, 80);
  assert.equal(JSON.stringify(po), beforePo);
  assert.equal(po.expected_completion_date, '');
  assert.equal(horizons.length, 4);
});

test('Inventory materializes real current-stock horizons as READY with excluded-quantity warning', () => {
  const input = line(), before = JSON.stringify(input);
  const row = map([input]);
  const baseline = map([line({ ongoingAdmission: null })]);
  assert.equal(row.calculation_status, 'READY');
  assert.deepEqual(quantities(row), quantities(baseline));
  assert.deepEqual(quantities(row), horizons.flatMap(h => [h.gapQty, h.suggestedOrderQty]));
  assert.match(row.note, /WARNING.*ONGOING_INCOMPLETE/);
  assert.match(row.note, /80 unaccounted/);
  assert.match(row.note, /ONGOING_ETA_UNRESOLVED POL-MISSING-DATE/);
  assert.match(row.note, /excluded ongoing quantity not counted/);
  assert.match(row.note, /overstated/);
  assert.equal(JSON.stringify(input), before);
});

test('zero shortage stays numeric zero and warns; absent or complete admission adds no warning', () => {
  const zeros = horizons.map(h => ({ ...h, gapQty: 0, suggestedOrderQty: 0 }));
  const row = map([line({ horizons: zeros })]);
  assert.equal(row.calculation_status, 'READY');
  assert.ok(quantities(row).every(q => q === 0));
  assert.match(row.note, /^No shortage.*WARNING.*ONGOING_INCOMPLETE/);
  for (const ongoingAdmission of [null, { complete: true, excluded: [] }]) {
    assert.doesNotMatch(map([line({ ongoingAdmission })]).note, /ONGOING_INCOMPLETE|WARNING/);
  }
});

test('multi-line aggregation remains independent; repeated warnings are not duplicated', () => {
  const row = map([line(), line()]);
  assert.equal(row.calculation_status, 'READY');
  assert.deepEqual(quantities(row), quantities(map([line()])).map(q => q * 2));
  assert.equal((row.note.match(/ONGOING_INCOMPLETE/g) || []).length, 1);
});

test('ongoing warning preserves existing Inventory flags and sanitizes source identifiers', () => {
  const row = map([line({
    ongoingAdmission: { complete: false, excluded: [{ ...excluded[0], line: 'POL|X\nCALC D=FAKE' }] },
    inventoryShareUnknown: [{ warehouseId: 'WH-1', reason: 'RATIO_UNKNOWN' }],
    incomingDateSources: [{ shipmentId: 'SHIP-1', dateSource: 'ETA_MISSING' }]
  })]);
  assert.equal(row.calculation_status, 'READY');
  assert.match(row.note, /WARNING.*ONGOING_INCOMPLETE/);
  assert.match(row.note, /WAREHOUSE_SHARE_UNKNOWN \(not counted\): WH-1=RATIO_UNKNOWN/);
  assert.match(row.note, /SHIPPED_ETA_MISSING \(not counted\): SHIP-1/);
  assert.doesNotMatch(row.note, /POL\|X|\n|CALC D=FAKE/);
});

test('Inventory still blocks explicit upstream reasons, including when another line only warns', () => {
  for (const reason of ['SPECIAL_EVENT_INVALID: BAD_DATE', 'PLANNED_SHIPMENT_ETA_MISSING: SHIP-1',
    'SHIPMENT_DUPLICATE_CONFLICT: SHIP-1', 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED']) {
    blocked([line(), line({ blocked: true, blockedReason: reason })], reason);
  }
  blocked([line({ blocked: true, blockedReason: '' })], 'BLOCKED');
  blocked([], 'RECOMMENDATION_LINE_NOT_FOUND');
});

test('Inventory still blocks missing horizons, sales basis, missing windows and invalid numeric values', () => {
  blocked([line({ horizons: null })], 'HORIZONS_NOT_AVAILABLE');
  blocked([line({ horizons: [], horizonsBlockedReason: 'SALES_BASIS_UNAVAILABLE' })], 'SALES_BASIS_UNAVAILABLE');
  blocked([line({ horizons: horizons.slice(0, 3) })], 'HORIZON_WINDOW_MISSING:D90');
  for (const field of ['gapQty', 'suggestedOrderQty']) {
    for (const bad of [null, undefined, NaN, Infinity, '0']) {
      blocked([line({ horizons: horizons.map(h => h.windowCode === 'D90' ? { ...h, [field]: bad } : h) })],
        'HORIZON_WINDOW_MISSING:D90');
    }
  }
});

test('Order Planning retains ONGOING_INCOMPLETE protection and null quantities', () => {
  const row = core.op([line()], scope, sku, '2026-11');
  assert.equal(row.calculation_status, 'BLOCKED');
  assert.match(row.note, /^ONGOING_INCOMPLETE: 1 PO line\(s\), 80 unaccounted/);
  assert.equal(row.t1_gap_qty, null);
  assert.equal(row.t4_suggested_qty, null);
  assert.equal(core.op([line({ ongoingAdmission: null })], scope, sku, '2026-11').calculation_status, 'READY');
});

test('warning distinguishes unknown quantity and filters draft/residual exclusions', () => {
  const row = map([line({ ongoingAdmission: { complete: false, excluded: [
    ...excluded, { code: 'ONGOING_RUNTIME_FAILED', line: 'POL-UNREADABLE', qty: null },
    { code: 'ONGOING_PO_DRAFT', line: 'DRAFT', qty: 1000 },
    { code: 'ONGOING_UNALLOCATED_RESIDUAL', line: '(SKU)', qty: 2000 }
  ] } })]);
  assert.equal(row.calculation_status, 'READY');
  assert.match(row.note, /2 PO line\(s\), 80 unaccounted \+ 1 unreadable/);
  assert.doesNotMatch(row.note, /1000|2000|ONGOING_PO_DRAFT|ONGOING_UNALLOCATED_RESIDUAL/);
});

test('real Inventory slice persists warning and calculation identity without counting it as blocked', () => {
  const rows = [];
  const sheet = {
    getLastColumn: () => core.headers.length,
    getLastRow: () => rows.length + 1,
    getRange: r => ({ getValues: () => r === 1 ? [core.headers] : rows,
      setValues: values => { rows[r - 2] = values[0].slice(); } }),
    appendRow: row => rows.push(row.slice())
  };
  const io = {
    now: () => new Date('2026-11-24T00:00:00Z'), tz: () => 'Asia/Taipei', openTarget: () => ({}),
    workspaceGet: () => ({ success: true, meta: { calculationDate: date }, data: { lines: [line()] } })
  };
  const cfg = { product: 'INVENTORY', map: core.inv };
  const acc = core.slice([scope], io, sheet, cfg, 'GAP-INV-FIXTURE');
  assert.deepEqual([acc.written, acc.ready, acc.blocked, acc.errors], [1, 1, 0, 0]);
  const saved = Object.fromEntries(core.headers.map((key, i) => [key, rows[0][i]]));
  assert.equal(saved.calculation_status, 'READY');
  assert.deepEqual(quantities(saved), quantities(map([line()])));
  assert.match(saved.note, /WARNING.*ONGOING_INCOMPLETE/);
  assert.match(saved.note, /CALC D=2026-11-24 .* RUN=GAP-INV-FIXTURE$/);
  assert.equal(acc.blockedReasons, undefined);
  core.slice([scope], io, sheet, cfg, 'GAP-INV-FIXTURE-RETRY');
  assert.equal(rows.length, 1, 'same business key updates, never duplicates');
});
