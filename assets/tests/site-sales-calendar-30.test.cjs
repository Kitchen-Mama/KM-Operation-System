'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const C = require('../js/core/supply-planning-calculations');
const CID = require('../js/core/supply-planning-country-identity');
let checks = 0;
const eq = (a,b) => { assert.deepEqual(a,b); checks++; };
const scope = { company: 'C', country: 'AU', marketplace: 'Amazon', channel: 'Amazon', sku: 'FIXTURE', marketplaceId: 'MP', marketplaceSkuId: 'MS' };
const sale = (date, units) => ({ date, units, ...scope });
const event = { sku: scope.sku, marketplaceId: 'MP', start: '2026-11-17', end: '2026-11-30' };
const dailySales = [sale('', 777), sale('2026-08-27',1), sale('2026-08-29',1), sale('2026-09-03',7), sale('2026-09-29',1),
  sale('2026-10-24',1), sale('2026-11-04',1), sale('2026-11-06',1), sale('2026-11-15',2),
  sale('2026-11-18',100), sale('2026-11-19',100), sale('2026-11-20',100)];
const input = { calcDate: '2026-11-25', scope, weekly7d: 999, dailySales, events: [event], windowPolicy: 'calendar_30' };
const before = JSON.stringify(input), result = C.normalizedAvgSalesPerDay(input);
eq(result.avgSalesPerDay, 4/22); eq(result.normalSalesUnits,4); eq(result.normalDayCount,22);
eq(result.windowStart,'2026-10-26'); eq(result.windowEnd,'2026-11-24');
eq(result.excludedDates.length,8); eq(result.source,'normalized_30d'); eq(JSON.stringify(input),before);
eq(C.normalizedAvgSalesPerDay({ ...input, windowPolicy: 'normal_30_in_90', dailySales: dailySales.filter(r=>r.date) }).avgSalesPerDay,1.875);
eq(C.normalizedAvgSalesPerDay({ ...input, events: [] }).avgSalesPerDay,304/30);
eq(C.normalizedAvgSalesPerDay({ ...input, dailySales: [sale('2026-11-18',100)] }).avgSalesPerDay,0);
assert.throws(()=>C.normalizedAvgSalesPerDay({...input,dailySales:[sale('',777)]}),/DAILY_SALES_WINDOW_UNAVAILABLE/); checks++;
assert.throws(()=>C.normalizedAvgSalesPerDay({...input,events:[{...event,start:'2026-10-01'}]}),/NO_NORMAL_DAYS/); checks++;
assert.throws(()=>C.normalizedAvgSalesPerDay({...input,windowPolicy:'typo'}),/WINDOW_POLICY_INVALID/); checks++;
const overlap = C.normalizedAvgSalesPerDay({ ...input, campaigns: [{ start: '2026-11-17', end: '2026-11-20', skuLines: [{ marketplaceSkuId:'MS',sku:'FIXTURE' }] }] });
eq(overlap.excludedDates.length,8); eq(overlap.avgSalesPerDay,4/22);
eq(C.normalizedAvgSalesPerDay({...input,events:[{...event,status:'cancelled'}]}).avgSalesPerDay,304/30);
eq(C.normalizedAvgSalesPerDay({...input,events:[{...event,marketplaceId:'OTHER'}]}).avgSalesPerDay,304/30);
const handler = fs.readFileSync(path.join(__dirname,'../specs/active/apps-script/42_api_v1_recommendation_workspace.gs'),'utf8');
const resolve = new Function('KMCALC','KMCID',handler+'\nreturn recoWsResolveSalesRate_;')(C,CID);
function snap(rows) { const headers=Object.keys(rows[0]||{});return {headers,rows:rows.map(r=>headers.map(k=>r[k]??''))}; }
function readFor(sc, rows) {
  return {snapshots:{amazonDailySalesSnapshot:snap(rows),amazonWeeklySalesSnapshot:snap([{country:sc.country,marketplace:sc.marketplace,channel:'Amazon',sku:sc.sku,sales_units_7d:999}]),
    marketplaces:snap([{marketplace_id:'MP',company:sc.company,country:sc.country,marketplace:sc.marketplace}]),
    marketplaceSkus:snap([{...sc,marketplace_sku_id:'MS'}]),
    fcSpecialEvents:snap([{sku:sc.sku,marketplace_id:'MP',company:sc.company,country:sc.country,marketplace:sc.marketplace,event_start_date:event.start,event_end_date:event.end}])}};
}
for(const [country,marketplace] of [['US','Amazon'],['CA','Amazon'],['UK','Amazon'],['AU','Amazon'],['JP','Amazon'],['EU','Amazon'],['US','Shopify'],['US','Walmart'],['US','EBay']]) {
  const sc={...scope,country,marketplace};
  const rows=dailySales.map(r=>({snapshot_date:r.date,country:country==='EU'?'DE':country==='UK'?'GB':country,marketplace,channel:'Amazon',sku:sc.sku,sales_units:r.units}));
  const r=resolve(readFor(sc,rows),sc,sc.sku,'2026-11-25');
  eq(r.ok,true); eq(r.avgSalesPerDay,4/22); eq(r.blankDateRows,1); eq(r.normalDayCount,22);
  eq(r.windowPolicy,'calendar_30'); eq(r.normalSalesUnits,4);
  const bad=resolve(readFor(sc,[...rows,{...rows[1]}]),sc,sc.sku,'2026-11-25');
  eq(bad.ok,false); eq(bad.detail,'DAILY_SALES_DUPLICATE_KEY');
}
const amazonRows=dailySales.map(r=>({snapshot_date:r.date,country:'US',marketplace:'Amazon',channel:'Amazon',sku:scope.sku,sales_units:r.units}));
const other={...scope,country:'US',marketplace:'Shopify'};
const noLeak=readFor(other,amazonRows); delete noLeak.snapshots.amazonWeeklySalesSnapshot;
eq(resolve(noLeak,other,other.sku,'2026-11-25').ok,false);
const eu={...scope,country:'EU'};
const invalid=readFor(eu,[{snapshot_date:'2026-11-01',country:'DE',marketplace:'Amazon',channel:'Amazon',sku:eu.sku,sales_units:'#N/A'}]);
eq(resolve(invalid,eu,eu.sku,'2026-11-25').detail,'DAILY_SALES_ROW_INVALID');
console.log('Fixed calendar-30 sales: '+checks+' checks passed');
