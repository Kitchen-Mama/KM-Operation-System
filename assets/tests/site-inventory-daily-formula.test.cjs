'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const HP = require('../js/core/supply-planning-horizon-projection');
const PD = require('../js/core/supply-planning-planning-demand');
const CAL = require('../js/core/supply-planning-site-calendar');
let checks = 0;
function eq(a, b) { assert.deepEqual(a, b); checks++; }
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b); checks++; }
const event = { company: 'C', country: 'US', marketplace: 'Amazon', sku: 'SKU', event_start_date: '2026-11-19', event_end_date: '2026-11-30', fc_qty: 240 };
const site = { company: 'C', country: 'US', marketplace: 'Amazon' };
const calcDate = '2026-11-24';
const selling = PD.scopedSpecialEventSellingDays([event], site, 'SKU', calcDate);
eq(selling.map(e => [e.totalDays, e.remainingDays, e.dailyQty, e.remainingQty]), [[12, 6, 20, 120]]);
eq(PD.eventSellingWindow('2026-11-19', '2026-11-30', 240, '2026-11-25').remainingQty, 100);
eq(PD.eventSellingWindow('2026-11-19', '2026-11-30', 240, '2026-11-30').remainingQty, 0);
eq(PD.eventSellingWindow('2026-11-19', '2026-11-30', 240, '2026-11-18').remainingQty, 240);
eq(PD.eventSellingWindow('2024-02-28', '2024-03-01', 100, '2024-02-28').remainingDays, 2);
eq(PD.scopedSpecialEventSellingDays([event], { ...site, company: 'OTHER' }, 'SKU', calcDate), []);
assert.throws(() => PD.eventSellingWindow('2026-02-30', '2026-03-02', 10, calcDate)); checks++;
near(PD.eventSellingWindow('2026-11-19', '2026-11-30', 100, calcDate).remainingQty, 50);
const instant = Date.parse('2026-11-25T00:30:00Z');
eq(CAL.localDate(instant, 'US'), '2026-11-24');
eq(CAL.localDate(instant, 'EU'), '2026-11-25');
eq(CAL.localDate(instant, 'UK'), CAL.localDate(instant, 'GB'));
eq(CAL.localDate(Date.parse('2026-07-01T07:30:00Z'), 'US'), '2026-07-01');
eq(CAL.localDate(Date.parse('2026-12-01T07:30:00Z'), 'US'), '2026-11-30');
assert.throws(() => CAL.localDate(instant, 'UNKNOWN')); checks++;
function input(overrides = {}) { return { calculationDate: calcDate, demandMode: 'sales_driven', avgSalesPerDay: 10,
  openingSupplyQty: 100, incomingEvents: [], unitsPerCarton: 40, specialEventTiming: 'selling_days', specialEventDemands: [], ...overrides }; }
function project(overrides) { const r = HP.projectHorizons(input(overrides)); eq(r.ready, true); return r.horizons; }
eq(project().map(h => h.gapQty), [80, 200, 350, 800]);
eq(project({ specialEventDemands: selling }).map(h => h.demandQty), [300, 420, 570, 1020]);
eq(project({ specialEventDemands: selling }).map(h => h.gapQty), [200, 320, 470, 920]);
// A late arrival cannot retroactively cover the four days already short. It does cover later demand.
const dated = project({ incomingEvents: [{ incomingId: 'SHIP-LINE-1', eta: '2026-12-09', qty: 100 }] });
eq(dated.map(h => h.incomingAddedQty), [100, 100, 100, 100]);
eq(dated.map(h => h.gapQty), [40, 100, 250, 700]);
eq(dated.map(h => h.suggestedOrderQty), [40, 120, 280, 720]);
const day19 = project({ openingSupplyQty: 0, incomingEvents: [{ incomingId: 'L', eta: '2026-12-13', qty: 1000 }] });
eq(day19.map(h => h.incomingAddedQty), [0, 1000, 1000, 1000]);
eq(day19.map(h => h.gapQty), [180, 180, 180, 180]);
const sameDay = project({ openingSupplyQty: 0, incomingEvents: [{ incomingId: 'L', eta: '2026-11-25', qty: 180 }] });
eq(sameDay[0].gapQty, 0);
eq(HP.projectHorizons(input({ openingSupplyQty: null })).ready, false);
// Neither the one-decimal displayed Avg nor integer daily rounding is an input to the calculation.
const precise = project({ avgSalesPerDay: 10 / 3, openingSupplyQty: 0 });
eq(precise.map(h => h.demandQty), [60, 100, 150, 300]);
const forecast = project({ calculationDate: '2026-01-25', demandMode: 'forecast_driven', openingSupplyQty: 100,
  regularFcByMonth: { '2026-01': 310, '2026-02': 560, '2026-03': 310, '2026-04': 300 } });
// Six January days at 10, 12 February days at 20, then stock 100 deducted once.
eq(forecast[0].demandQty, 300); eq(forecast[0].gapQty, 200);
eq(forecast[1].demandQty, 540); eq(forecast[1].gapQty, 440);
const missing = project({ demandMode: 'forecast_driven', regularFcByMonth: {} });
eq(missing.map(h => h.gapQty), [null, null, null, null]);
const half = project({ calculationDate: '2026-11-15', demandMode: 'forecast_driven', openingSupplyQty: 0,
  regularFcByMonth: { '2026-11': 1, '2026-12': 0, '2027-01': 0, '2027-02': 0 } });
eq(half.map(h => h.gapQty), [1,1,1,1]);
eq(project({ avgSalesPerDay: 0.4999/18, openingSupplyQty: 0 })[0].gapQty, 0);
const BUNDLE = fs.readFileSync(path.join(root, 'specs/active/apps-script/90_generated_supply_planning_bundle.gs'), 'utf8');
const HANDLER = fs.readFileSync(path.join(root, 'specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8');
const MAT = fs.readFileSync(path.join(root, 'specs/active/apps-script/43_api_v1_gap_materialization.gs'), 'utf8');
const utilities = { formatDate(date, tz, pattern) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const day = p.year + '-' + p.month + '-' + p.day;
  return pattern === 'yyyy-MM-dd' ? day : day + ' ' + p.hour + ':' + p.minute + ':' + p.second;
} };
const H = new Function('Utilities', BUNDLE + '\n' + HANDLER + '\n' + MAT + '\nreturn { handle: handleRecommendationWorkspaceGet_, build: recoWsBuildHorizons_, source: recoWsShipmentLineCandidates_, ctx: recoWsSiteInventoryContext_, runContext: gapCalcResolveContext_, materialIO: gapMaterializationDefaultIo_, slice: gapProcessScopeSlice_, mapper: gapInvMapFromLines_, headers: INV_GAP_HEADERS_, KMHP: KMHP, KMPD: KMPD };')(utilities);
eq(H.KMPD.eventSellingWindow('2026-11-19', '2026-11-30', 240, calcDate), PD.eventSellingWindow('2026-11-19', '2026-11-30', 240, calcDate));
eq(H.KMHP.projectHorizons(input({ specialEventDemands: selling })), HP.projectHorizons(input({ specialEventDemands: selling })));
eq(H.runContext('INVENTORY', instant).instantMs, instant);
eq(H.ctx(H.runContext('INVENTORY', instant), { country: 'US' }).calculationDate, '2026-11-24');
eq(H.ctx(H.runContext('INVENTORY', instant), { country: 'EU' }).calculationDate, '2026-11-25');
const old = PD.scopedSpecialEventPreps([event], site, 'SKU', calcDate);
eq(old[0].qty, 240); eq(old[0].prepDate, '2026-10-05');
// All site countries use the exact same stock / ETA / event projection, never a site-specific gap formula.
for (const country of ['US', 'CA', 'UK', 'GB', 'EU', 'JP', 'AU']) {
  const scope = { ...site, country };
  const events = [{ ...event, country }];
  const rate = H.build({ calculationDate: calcDate, siteInventoryDaily: true }, [], [], events, {}, scope, 'SKU', 100, [], 40, scope, 'sales_driven', 10);
  eq(rate.map(h => h.gapQty), [200, 320, 470, 920]);
}
const SLS = require('../js/core/supply-planning-shipment-line-source');
const DR = require('../js/core/supply-planning-destination-runtime');
const historical = { shipment_id: 'SH', ...site, status: 'in_transit', eta: '2026-11-25',
  record_origin: 'IMPORT_HISTORICAL', opening_supply_mode: 'DISPLAY_ONLY' };
const shipLine = { shipment_line_id: 'SL', shipment_id: 'SH', sku: 'SKU', shipment_qty: 130, shipment_received_qty: 30 };
const sourceInput = { shipments: [historical], shipmentLines: [shipLine] };
const before = JSON.stringify(sourceInput);
eq(SLS.buildShipmentLineCandidates(sourceInput).candidates.length, 0);
const inventorySource = SLS.buildShipmentLineCandidates({ ...sourceInput, includeDisplayOnlyOpening: true });
eq(inventorySource.candidates.length, 1);
eq(inventorySource.candidates[0].candidate.quantityRemaining, 100);
eq(JSON.stringify(sourceInput), before);
const authority = [{ marketplace_id: 'MP', ...site, status: 'active', fulfillment_model: 'platform_fulfilled' }];
function qualify(line = shipLine, shipment = historical) {
  const source = SLS.buildShipmentLineCandidates({ shipments: [shipment], shipmentLines: [line], includeDisplayOnlyOpening: true });
  return DR.resolveMarketplaceQualifiedIncoming({ candidates: source.candidates.map(SLS.toMarketplaceIncomingCandidate), marketplaces: authority,
    scope: { ...site, marketplaceId: 'MP' }, requiredByDate: '2027-02-22' });
}
eq(qualify().confirmedQualifiedIncomingQty, 100);
eq(qualify({ ...shipLine, shipment_received_qty: 130 }).confirmedQualifiedIncomingQty, 0);
eq(qualify(shipLine, { ...historical, status: 'received' }).confirmedQualifiedIncomingQty, 0);
eq(qualify(shipLine, { ...historical, eta: '' }).confirmedQualifiedIncomingQty, 0);
eq(qualify(shipLine, { ...historical, opening_supply_mode: 'PENDING:BATCH' }).confirmedQualifiedIncomingQty, 0);
eq(qualify(shipLine, { ...historical, company: 'OTHER' }).confirmedQualifiedIncomingQty, 0);
// End-to-end actual 42_ workspace: imported remaining qty enters daily horizons, not the stock fact.
const FC = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const fcRows = [2026, 2027].map(year => ['C', 'US', 'Amazon', 'SKU', year, 310, year === 2026 ? 280 : 280, 310, 300, 310, 300, 310, 310, 300, 310, 300, 310]);
const tables = {
  marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku', 'replenishment_model'], rows: [['C', 'US', 'Amazon', 'SKU', 'SITE-SKU', 'forecast_driven']] },
  marketplaces: { headers: Object.keys(authority[0]), rows: [Object.values(authority[0])] },
  sku_details: { headers: ['sku', 'units_per_carton'], rows: [['SKU', 40]] },
  fc_regular_forecast: { headers: FC, rows: fcRows },
  fc_special_events: { headers: Object.keys(event), rows: [Object.values(event)] },
  amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty', 'fc_transfer_qty', 'fc_processing_qty', 'inbound_qty'], rows: [['US', 'Amazon', 'SKU', 70, 20, 10, 99999]] },
  shipments: { headers: Object.keys(historical), rows: [Object.values(historical)] },
  shipment_lines: { headers: Object.keys(shipLine), rows: [Object.values(shipLine)] }
};
let writes = 0;
const ss = { getSheetByName(name) { const t = tables[name]; if (!t) return null; const values = [t.headers, ...t.rows];
  return { getLastRow: () => values.length, getDataRange: () => ({ getValues: () => values }),
    getRange() { writes++; throw Error('unexpected write'); }, appendRow() { writes++; throw Error('unexpected write'); } }; } };
const io = { now: () => instant, nextSeq: () => 1, configDate: () => calcDate, configMonth: () => '2026-11', openTarget: () => ss,
  inventoryContextForScope: () => ({ calculationDate: calcDate, calculationMonth: '2026-11', planningCycle: 'RECO-2026-11', timezone: CAL.timeZone('US') }) };
const body = { requestId: 'SITE-DAILY-FIXTURE', payload: { scope: site, pagination: { page: 1, size: 100 } } };
const result = H.handle(body, io);
assert.equal(result.success, true, JSON.stringify(result.errors)); checks++;
const line = result.data.lines[0];
eq(line.currentStockQty, 100);
eq(line.horizonBasis.horizonOpeningQty, 100);
eq(line.horizons.map(h => h.incomingAddedQty), [100, 100, 100, 100]);
eq(line.horizons.map(h => h.demandQty), [300, 420, 570, 1020]);
eq(line.horizons.map(h => h.gapQty), [100, 220, 370, 820]);
eq(result.meta.siteTimeZone, 'America/Los_Angeles');
eq(result.meta.horizonFormula, 'SITE_DAILY_V2');
eq(writes, 0);
// Forecast is independent of Avg availability, including self-fulfilled/non-Amazon site scopes.
for (const marketplace of ['Shopify','Walmart','KM Walmart','Target','Target Plus','EBay']) {
  const scope = { ...site, marketplace };
  const fc = fcRows.map(row => Object.fromEntries(FC.map((k,i) => [k, k === 'marketplace' ? marketplace : row[i]])));
  const hz = H.build({ calculationDate: calcDate, siteInventoryDaily: true }, fc, [], [{ ...event, marketplace }], {}, scope,
    'SKU', 100, [{ incomingId: 'L', eta: '2026-11-25', qty: 100 }], 40, { destinationType: 'WAREHOUSE', ...scope }, 'forecast_driven', null);
  eq(hz.map(h => h.gapQty), [100,220,370,820]);
}
const inventoryIO = H.materialIO(H.runContext('INVENTORY', instant));
const inventoryEnvelope = inventoryIO.workspaceGet(body, ss);
eq(inventoryEnvelope.meta.calculationDate, calcDate);
eq(inventoryEnvelope.meta.horizonFormula, 'SITE_DAILY_V2');
eq(inventoryEnvelope.data.lines[0].horizons.map(h => h.gapQty), [100, 220, 370, 820]);
const orderIO = H.materialIO(H.runContext('ORDER_PLANNING', instant));
const orderEnvelope = orderIO.workspaceGet(body, ss);
eq(orderEnvelope.meta.horizonFormula, null);
eq(orderEnvelope.data.lines[0].horizons[0].incomingAddedQty, 0);
eq(orderEnvelope.data.lines[0].horizons[0].demandQty, 420);
const written = [], resultSheet = { getLastColumn: () => H.headers.length,
  getLastRow: () => written.length + 1,
  getRange(row) { return row === 1 ? { getValues: () => [H.headers] } : { getValues: () => written }; },
  appendRow: r => written.push(r) };
const matIo = { now: () => new Date(instant), tz: () => 'Asia/Taipei', openTarget: () => ss,
  workspaceGet: () => ({ ...result, data: { lines: [{ ...line, diagnostics: { issues: [] } }] } }) };
const mapped = H.slice([site], matIo, resultSheet, { product: 'INVENTORY', map: H.mapper }, 'TEST-RUN');
eq(mapped.ready, 1);
const saved = Object.fromEntries(H.headers.map((k, i) => [k, written[0][i]]));
eq(saved.calculation_date, calcDate);
assert.match(saved.note, /FORMULA=SITE_DAILY_V2 SITE_TZ=America\/Los_Angeles/); checks++;
assert.match(saved.note, /AT=2026-11-25T08:30:00 TZ=Asia\/Taipei/); checks++;
// Independent oracle: required extra opening supply = maximum positive prefix deficit.
// This does not call KMTPP or repeat its running-covered-balance algorithm.
for (let n = 0; n < 60; n++) {
  const rate = (n % 13) + 1, opening = (n * 17) % 140;
  const events = [{ incomingId: 'A', eta: '2026-12-02', qty: (n * 19) % 200 },
    { incomingId: 'B', eta: '2026-12-25', qty: (n * 11) % 160 }];
  const actual = project({ avgSalesPerDay: rate, openingSupplyQty: opening, incomingEvents: events, specialEventDemands: selling });
  for (const h of actual) {
    const N = Number(h.windowCode.slice(1));
    let need = 0, arrived = 0, demand = 0;
    for (let d = 1; d <= N; d++) {
      const day = new Date(Date.parse(calcDate + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
      arrived += events.filter(e => e.eta === day).reduce((s, e) => s + e.qty, 0);
      demand += rate + (day <= '2026-11-30' ? 20 : 0);
      need = Math.max(need, demand - opening - arrived);
    }
    eq(h.gapQty, Math.max(0, Math.round(need)));
  }
}
console.log('Site Inventory daily formula: ' + checks + ' checks passed');
