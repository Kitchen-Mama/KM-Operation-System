'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../js/utils/promotion-risk-ratio.js');
const scope={company:'KM',country:'US',marketplace:'Amazon'},master=[{...scope}],anchor='2026-11-26';
function rows(n=30){return Array.from({length:n},(_,i)=>({...scope,sku:'A',snapshot_date:R.shift(anchor,-30+i),sales_units:1,channel:'Amazon'}));}
function promo(n){return {sku:'A',marketplaceSkuId:'MA',startDate:R.shift(anchor,-30),endDate:R.shift(anchor,-31+n)};}
function calc(extra={}){return R.evaluate({scope,marketplaces:master,sku:'A',marketplaceSkuId:'MA',rows:rows(),promotions:[promo(16)],anchorDate:anchor,...extra});}
test('16 of 30 positive-sales days is High Risk',()=>{const r=calc();assert.equal(r.riskLevel,'High Risk');assert.equal(r.salesDays,30);assert.equal(r.promoSalesDays,16);assert.equal(r.ratio,16/30);});
for(const [days,risk]of [[0,'Safe'],[8,'Safe'],[9,'Watch'],[15,'Watch'],[16,'High Risk']])test('threshold '+days+'/30 = '+risk,()=>assert.equal(calc({promotions:days?[promo(days)]:[]}).riskLevel,risk));
test('zero-unit records, duplicate rows and multiple channels do not inflate the denominator',()=>{
 const data=rows().concat(rows(),rows(1).map(r=>({...r,channel:'Other'})),[{...scope,sku:'A',snapshot_date:R.shift(anchor,-31),sales_units:0}]);
 assert.equal(calc({rows:data}).salesDays,30);
});
test('promotion dates on non-selling days do not inflate the numerator',()=>{
 const r=calc({rows:rows().filter((_,i)=>i%2===0)});assert.equal(r.salesDays,15);assert.equal(r.promoSalesDays,8);
});
test('Campaign and Special Event overlap count each day once, including annual flags',()=>assert.equal(calc({promotions:[promo(16),promo(16),{...promo(16),eventFlag:'BFCM'}]}).promoSalesDays,16));
test('window is start minus 90 through start minus 1, never the activity start day',()=>{
 const data=[-91,-90,-1,0].map(d=>({...scope,sku:'A',snapshot_date:R.shift(anchor,d),sales_units:1})),r=calc({rows:data,promotions:[{sku:'A',startDate:R.shift(anchor,-91),endDate:anchor}]});
 assert.equal(r.salesDays,2);assert.equal(r.promoSalesDays,2);assert.equal(r.windowStart,'2026-08-28');assert.equal(r.windowEnd,'2026-11-25');
});
test('future anchor moves the window and marks missing future observations as partial',()=>{
 const r=calc({anchorDate:'2027-02-01'});assert.equal(r.partial,true);assert.equal(r.salesDays,23);assert.equal(r.promoSalesDays,9);
 assert.equal(calc({anchorDate:'2027-06-01'}).riskLevel,'Missing Data');
});
test('no source or no positive sales can never be Safe',()=>{
 assert.equal(calc({rows:[]}).riskLevel,'Missing Data');assert.equal(calc({rows:rows().map(r=>({...r,sales_units:0}))}).riskLevel,'Missing Data');
});
test('wrong company, marketplace, SKU and marketplace-SKU id never join',()=>{
 assert.equal(calc({rows:rows().map(r=>({...r,company:'OTHER'}))}).riskLevel,'Missing Data');
 assert.equal(calc({rows:rows().map(r=>({...r,marketplace:'Shopify'}))}).riskLevel,'Missing Data');
 assert.equal(calc({rows:rows().map(r=>({...r,sku:'B'}))}).riskLevel,'Missing Data');
 assert.equal(calc({promotions:[{...promo(16),marketplaceSkuId:'MB'}]}).promoSalesDays,0);
});
test('company-less Amazon source requires a unique country/marketplace owner',()=>{
 const data=rows().map(r=>({...r,company:undefined}));assert.equal(calc({rows:data}).salesDays,30);
 assert.equal(calc({rows:data,marketplaces:master.concat({...scope,company:'OTHER'})}).riskLevel,'Missing Data');
});
for(const value of ['',null,true,'NaN',-1])test('bad units are not interpreted as zero: '+value,()=>assert.equal(calc({rows:rows().map(r=>({...r,sales_units:value}))}).riskLevel,'Missing Data'));
test('conflicting duplicate rows are unknown, not an arbitrary winner',()=>assert.equal(calc({rows:rows().concat({...rows()[0],sales_units:0})}).reason,'SALES_DUPLICATE_CONFLICT'));
test('a malformed quantity outside the evaluated window does not block valid recent history',()=>assert.equal(calc({rows:rows().concat({...rows()[0],snapshot_date:'2025-01-01',sales_units:'bad'})}).riskLevel,'High Risk'));
test('invalid promotion date cannot silently yield Safe',()=>assert.equal(calc({promotions:[{sku:'A',startDate:'2026-02-30',endDate:'2026-03-01'}]}).reason,'PROMOTION_DATES_INVALID'));
test('UK/GB identity aliases and EU source membership reuse the existing country authority',()=>{
 const uk={...scope,country:'UK'};assert.equal(calc({scope:uk,rows:rows().map(r=>({...r,country:'GB'}))}).salesDays,30);
 const eu={...scope,country:'EU'};assert.equal(calc({scope:eu,rows:rows().map((r,i)=>({...r,country:i%2?'DE':'FR'}))}).salesDays,30);
});
test('today uses site timezone and date offsets cross a leap year correctly',()=>{
 assert.equal(R.today(Date.parse('2026-11-26T02:00:00Z'),scope),'2026-11-25');assert.equal(R.shift('2028-03-01',-1),'2028-02-29');
});
test('a future campaign is evaluated at its own start, without counting its duration',()=>{
 const r=R.summarize({scope,rows:rows(),marketplaces:master,sku:'A',marketplaceSkuId:'MA',anchorDate:anchor,promotions:[promo(16),{sku:'A',startDate:'2027-02-01',endDate:'2027-02-14'}]});
 assert.equal(r.futureRisks.length,1);assert.equal(r.futureRisks[0].salesDays,23);assert.equal(r.futureRisks[0].promoSalesDays,9);
});
test('actual sales today count for a future window but never for today\'s trailing window',()=>{
 const data=rows().concat({...rows()[0],snapshot_date:anchor}),index=R.salesIndex({scope,rows:data,marketplaces:master,today:anchor});
 assert.equal(calc({index}).salesDays,30);assert.equal(calc({index,anchorDate:'2026-11-27'}).salesDays,31);
});
test('a future campaign with no observable selling days is not advertised as Safe',()=>{
 const r=R.summarize({scope,rows:rows(),marketplaces:master,sku:'A',marketplaceSkuId:'MA',anchorDate:anchor,promotions:[{sku:'A',startDate:'2027-06-01',endDate:'2027-06-10'}]});
 assert.equal(r.currentRisk,'Safe');assert.equal(r.futureRisks[0].riskLevel,'Missing Data');assert.equal(r.riskLevel,'Missing Data');
});
