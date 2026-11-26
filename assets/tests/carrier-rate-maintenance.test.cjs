'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'),crypto=require('node:crypto');
const base = 'assets/specs/active/apps-script/';
let writes = 0, locked = false, book;
class Sheet {
  constructor(headers, objects = []) { this.headers = headers; this.rows = [headers, ...objects.map(r => headers.map(h => r[h] ?? ''))]; }
  getDataRange() { return { getValues: () => this.rows.map(r => [...r]) }; }
  getRange(r, c) { return { setValue: v => { writes++; this.rows[r - 1][c - 1] = v; } }; }
  appendRow(r) { writes++; this.rows.push([...r]); }
}
const ctx = { jsonResponse_: x => x, SpreadsheetApp: { getActiveSpreadsheet: () => book, flush() {} },
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,s)=>Array.from(crypto.createHash('sha256').update(s).digest())},
  procurementTimestamp_: () => 'v2', editNextStamp_: () => 'v2', editTok_: x => x, editTokSame_: (a, b) => a === b ? 'SAME' : 'DIFF',
  LockService: { getScriptLock: () => ({ tryLock: () => !locked, releaseLock() {} }) } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(base + '17_carrier_handlers.gs', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(base + '17b_carrier_rate_card_maintenance.gs', 'utf8'), ctx);
const card = (extra = {}) => ({ rate_card_id: 'CRC-Q-00000001', carrier_id: 'C', origin_country: 'CN', destination_country: 'US',
  shipping_method: 'air', last_mile_delivery: 'parcel', shipping_method_label: 'Air Parcel', charge_type: 'weight', charge_unit: 'kg',
  weight_tier: 20, weight_tier_unit: 'kg', currency: 'USD', unit_rate: 10, effective_from: '2026-01-01', status: 'active', updated_at: 'v1', ...extra });
function setup(cards = [card()]) { writes = 0; locked = false; const sheets = { carrier_rate_cards: new Sheet([...ctx.CARRIER_RATE_CARDS_HEADERS_], cards), carriers: new Sheet(['carrier_id', 'status'], [{ carrier_id: 'C', status: 'active' }]) }; book = { getSheetByName: n => sheets[n] }; return sheets; }
function save(mode, rows, request = 'request-00000001') { return ctx.handleCarrierRateCardsQuick_({ mode: 'quick_maintenance', quick_edit: true, maintenance_mode: mode, quick_rows: rows, rows: [], request_id: request }); }
let checks = 0;
function test(name, fn) { setup(); fn(); checks++; console.log('PASS ' + name); }
test('price updates preserve identity/tier and read back', () => { const r = save('update', [{ rate_card_id: card().rate_card_id, expected_updated_at: 'v1', unit_rate: 9 }]); assert(r.success); assert.equal(r.data.rows[0].unit_rate, 9); const row = ctx.crcQuickRead_(book.getSheetByName('carrier_rate_cards')).rows[0]; assert.equal(row.weight_tier, 20); assert.equal(row.shipping_method, 'air'); });
test('stale token refuses all rows before writes', () => { const r = save('update', [{ rate_card_id: card().rate_card_id, expected_updated_at: 'old', unit_rate: 9 }]); assert.equal(r.code, 'EDIT_CONFLICT'); assert.equal(writes, 0); });
test('locked identity cannot be altered by price update', () => { assert.equal(save('update', [{ rate_card_id: card().rate_card_id, expected_updated_at: 'v1', unit_rate: 9, carrier_id: 'X' }]).code, 'FIELD_LOCKED'); assert.equal(writes, 0); });
test('same service cannot be created again, including method alias', () => { const r = save('new_service', [card({ rate_card_id: 'CRC-Q-00000002', shipping_method: 'Air Freight', updated_at: undefined })]); assert.equal(r.code, 'FIELD_LOCKED:updated_at'); const input = card({ rate_card_id: 'CRC-Q-00000002', shipping_method: 'Air Freight' }); delete input.updated_at; assert.equal(save('new_service', [input]).code, 'SERVICE_ALREADY_EXISTS'); assert.equal(writes, 0); });
test('20/50/100 tiers allowed in existing service', () => { for (const tier of [50, 100]) { const input = card({ rate_card_id: 'CRC-Q-' + String(tier).padStart(8, '0'), weight_tier: tier }); delete input.updated_at; assert(save('add_rate', [input], 'request-' + tier).success); } assert.equal(ctx.crcQuickRead_(book.getSheetByName('carrier_rate_cards')).rows.length, 3); });
test('distinct destination rate retained', () => { const input = card({ rate_card_id: 'CRC-Q-00000002', destination_warehouse_code: 'ONT8' }); delete input.updated_at; assert(save('add_rate', [input]).success); });
test('exact duplicate rate refused', () => { const input = card({ rate_card_id: 'CRC-Q-00000002' }); delete input.updated_at; assert.equal(save('add_rate', [input]).code, 'RATE_ALREADY_EXISTS'); assert.equal(writes, 0); });
test('new last-mile is a distinct service', () => { const input = card({ rate_card_id: 'CRC-Q-00000002', last_mile_delivery: 'truck' }); delete input.updated_at; assert(save('new_service', [input]).success); });
test('create receipt replay reuses same row', () => { const input = card({ rate_card_id: 'CRC-Q-00000002', last_mile_delivery: 'truck' }); delete input.updated_at; assert(save('new_service', [input]).success); const n = writes; assert(save('new_service', [input]).success); assert.equal(writes, n); });
test('blank/negative/nonnumeric prices refused, zero accepted', () => { for (const rate of ['', -1, 'x']) { assert.equal(save('update', [{ rate_card_id: card().rate_card_id, expected_updated_at: 'v1', unit_rate: rate }]).code, 'NUMBER_INVALID:unit_rate'); assert.equal(writes, 0); } assert(save('update', [{ rate_card_id: card().rate_card_id, expected_updated_at: 'v1', unit_rate: 0 }]).success); });
test('invalid dates and inactive carrier refused', () => { const input = card({ rate_card_id: 'CRC-Q-00000002', last_mile_delivery: 'truck', effective_from: '2026-02-30' }); delete input.updated_at; assert.equal(save('new_service', [input]).code, 'DATE_INVALID:effective_from'); input.effective_from = '2026-01-01'; book.getSheetByName('carriers').rows[1][1] = 'inactive'; assert.equal(save('new_service', [input]).code, 'ACTIVE_CARRIER_REQUIRED'); assert.equal(writes, 0); });
test('lock unavailable writes nothing', () => { locked = true; assert.equal(save('update', [{ rate_card_id: 'A' }]).code, 'LOCK_TIMEOUT'); assert.equal(writes, 0); });
test('older template importer refuses the quick-maintenance envelope', () => { const answer = ctx.handleImportCarrierRateCards_({ mode: 'quick_maintenance', rows: [], quick_rows: [{ rate_card_id: card().rate_card_id, unit_rate: 9 }] }); assert.equal(answer.success, false); assert.equal(writes, 0); });
test('real client adapter sends quick rows separately, preserving token', () => {
  const text = fs.readFileSync('assets/js/api/operation-system-db-api.js', 'utf8'), start = text.indexOf('window.KM.DB.saveCarrierRateCardsQuick =');
  const client = { window: { KM: { DB: {} } }, _kmWeeklyCommand_: (action, payload) => ({ action, payload }) }; vm.createContext(client);
  vm.runInContext(text.slice(start, text.indexOf('\n};', start) + 3), client);
  const res = client.window.KM.DB.saveCarrierRateCardsQuick({ mode: 'update', rows: [{ rate_card_id: 'R', expected_updated_at: 'v1', unit_rate: 8 }] });
  assert.equal(res.action, 'importCarrierRateCards'); assert.equal(res.payload.rows.length, 0); assert.equal(res.payload.quick_rows[0].expected_updated_at, 'v1'); assert.equal(res.payload.maintenance_mode, 'update');
});
test('native Sheets Date cells cannot bypass exact-rate duplicate checks', () => {
  ctx.Utilities.formatDate=d => d.toISOString().slice(0, 10); ctx.Session = { getScriptTimeZone: () => 'Asia/Taipei' };
  setup([card({ effective_from: vm.runInContext("new Date('2026-01-01T00:00:00Z')", ctx) })]);
  const input = card({ rate_card_id: 'CRC-Q-00000002' }); delete input.updated_at;
  assert.equal(save('add_rate', [input]).code, 'RATE_ALREADY_EXISTS'); assert.equal(writes, 0);
});
test('actual price update succeeds while a gap worker owns its lease', () => {
  const props = new Map(); let seq = 0;
  ctx.Utilities.getUuid = () => 'lease-' + (++seq);
  ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props.get(k) || null,
    setProperty: (k, v) => props.set(k, v), deleteProperty: k => props.delete(k) }) };
  vm.runInContext(fs.readFileSync(base + '46_api_v1_gap_materialization_job.gs', 'utf8'), ctx);
  const gap = ctx.gapJobScriptLock_(); assert.equal(gap.acquire(10000), true);
  const r = save('update', [{ rate_card_id: card().rate_card_id, expected_updated_at: 'v1', unit_rate: 9 }]);
  assert.equal(r.success, true); assert.equal(r.data.rows[0].unit_rate, 9);
  assert.equal(ctx.gapJobScriptLock_().acquire(1), false); gap.release();
});
test('real generic table read truncates display date but preserves opaque version; native Date price update succeeds',()=>{
 vm.runInContext(fs.readFileSync(base+'02_core_sheet_db.gs','utf8'),ctx);ctx.jsonResponse_=x=>x;
 setup([card({updated_at:vm.runInContext("new Date('2026-11-25T08:36:42.123Z')",ctx)})]);
 const row=ctx.readSheetAsObjects_('carrier_rate_cards')[0];assert.equal(row.updated_at,'2026-11-25');assert.match(row.rate_edit_version,/^CRC1-[a-f0-9]{64}$/);
 const r=save('update',[{rate_card_id:row.rate_card_id,expected_updated_at:row.updated_at,expected_version:row.rate_edit_version,unit_rate:8.5}]);assert.equal(r.success,true,JSON.stringify(r));
 const fresh=ctx.readSheetAsObjects_('carrier_rate_cards')[0];assert.equal(fresh.rate_edit_version,r.data.rows[0].rate_edit_version);assert.notEqual(fresh.rate_edit_version,row.rate_edit_version);
 const before=writes,stale=save('update',[{rate_card_id:row.rate_card_id,expected_version:row.rate_edit_version,unit_rate:7}]);assert.equal(stale.code,'EDIT_CONFLICT');assert.equal(writes,before);
});
test('legacy date-only text is safely editable by fingerprint; unrelated rate term change is a conflict',()=>{
 setup([card({updated_at:'2026-11-25'})]);const row=ctx.readSheetAsObjects_('carrier_rate_cards')[0];assert(save('update',[{rate_card_id:row.rate_card_id,expected_version:row.rate_edit_version,unit_rate:8}]).success);
 const fresh=ctx.readSheetAsObjects_('carrier_rate_cards')[0],sh=book.getSheetByName('carrier_rate_cards');sh.rows[1][sh.headers.indexOf('weight_tier')]=101;const n=writes;
 assert.equal(save('update',[{rate_card_id:row.rate_card_id,expected_version:fresh.rate_edit_version,unit_rate:7}]).code,'EDIT_CONFLICT');assert.equal(writes,n);
});
console.log(`RATE_MAINTENANCE_PASS ${checks} offline`);
