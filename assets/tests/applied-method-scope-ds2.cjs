'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {extract}=require('./ad4/extract.cjs');
const source=fs.readFileSync(process.env.DS2_PAGE||'assets/js/pages/inventory-replenishment.js','utf8');
const fn=extract(source,n=>n==='_irMethodScope_',()=>false)[0].text;
const records=[{marketplaceId:'RESUS-AMAZON',company:'ResUS',country:'US',marketplace:'Amazon'},
  {marketplaceId:'KM-SHOPIFY',company:'KM',country:'US',marketplace:'Shopify'},
  {marketplaceId:'RESTW-DE',company:'ResTW',country:'DE',marketplace:'Amazon'}];
const ctx={_irSearch:{applied:{country:'US',marketplaceId:'RESUS-AMAZON'}},_irWsGet:()=>records,
  _replenSelectedScope:()=>({company:'KM',country:'US',marketplace:'Shopify'})};
vm.createContext(ctx);vm.runInContext(fn,ctx);
const get=()=>JSON.parse(JSON.stringify(ctx._irMethodScope_()));let pass=0;
function test(name,f){f();pass++;console.log('PASS '+name);}
test('actual Search shape resolves ResUS/Amazon by ID, not pending Shopify selection',()=>assert.deepEqual(get(),{company:'ResUS',country:'US',marketplace:'Amazon'}));
test('KM Shopify remains a different company and catalogue scope',()=>{ctx._irSearch.applied={country:'US',marketplaceId:'KM-SHOPIFY'};assert.deepEqual(get(),{company:'KM',country:'US',marketplace:'Shopify'});});
test('another country uses its own master record',()=>{ctx._irSearch.applied={country:'DE',marketplaceId:'RESTW-DE'};assert.deepEqual(get(),{company:'ResTW',country:'DE',marketplace:'Amazon'});});
test('unknown marketplace ID does not infer company from source warehouse or live selects',()=>{ctx._irSearch.applied={country:'US',marketplaceId:'MISSING',company:'ResUS',marketplace:'Amazon'};assert.deepEqual(get(),{company:'',country:'US',marketplace:''});});
test('duplicate ID refuses even when duplicate records are identical',()=>{records.push({...records[0]});ctx._irSearch.applied={country:'US',marketplaceId:'RESUS-AMAZON'};assert.equal(get().company,'');records.pop();});
test('country/ID mismatch refuses',()=>{ctx._irSearch.applied={country:'CA',marketplaceId:'RESUS-AMAZON'};assert.equal(get().company,'');});
test('missing master fails closed',()=>{const saved=ctx._irWsGet;ctx._irWsGet=()=>[];ctx._irSearch.applied={country:'US',marketplaceId:'RESUS-AMAZON'};assert.equal(get().company,'');ctx._irWsGet=saved;});
test('inactive marketplace fails closed',()=>{records[0].status='inactive';assert.equal(get().company,'');delete records[0].status;});
test('unreadable master fails closed',()=>{const saved=ctx._irWsGet;ctx._irWsGet=()=>{throw Error('read failed');};assert.equal(get().company,'');ctx._irWsGet=saved;});
test('blank company is not inferred from warehouse',()=>{const saved=records[0].company;records[0].company='';assert.equal(get().company,'');records[0].company=saved;});
test('legacy explicit applied shape remains supported, without reading pending selects',()=>{ctx._irSearch.applied={company:'ResUS',country:'US',marketplace:'Amazon'};assert.deepEqual(get(),{company:'ResUS',country:'US',marketplace:'Amazon'});});
test('before the first Search the existing selector fallback is unchanged',()=>{ctx._irSearch.applied=null;assert.deepEqual(get(),{company:'KM',country:'US',marketplace:'Shopify'});});
test('both lazy-load cache tokens are changed',()=>{
  assert(fs.readFileSync('index.html','utf8').includes('assets/js/app.js?v=r76-a2sad3-20261129-ds2'));
  assert(fs.readFileSync('assets/js/app.js','utf8').includes('assets/js/pages/inventory-replenishment.js?v=r76-a2sad3-20261129-ds2'));
});
console.log('DS2_SCOPE_PASS '+pass+' live=NOT_RUN');
