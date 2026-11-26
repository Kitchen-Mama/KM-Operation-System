'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const {parts}=require('./helpers/write-command-flight-world.cjs');
const c=vm.createContext({});vm.runInContext(parts(fs.readFileSync('assets/js/pages/shipping-plan.js','utf8'),['_spCostBreakdownHtml_','_spSplitCost_','_spSplitCostText_','_spEsc','_spMoney_']),c);
function unit(p,qty){return c._spCostBreakdownHtml_(p,qty).match(/Cost per pcs<\/span><span class="sp-cost-value">([^<]*)/)[1];}
test('single and split currencies show one decimal per piece without changing stored money',()=>{
 const p={shippingPlanId:'P',carrierId:'C',currency:'RMB',raw:{estimated_total_cost:5897.13,estimated_freight_cost:5458.17,estimated_customs_fee:0,estimated_duty:438.96}},before=JSON.stringify(p);
 assert.equal(unit(p,1935),'RMB 3.0');assert.equal(JSON.stringify(p),before);
 p.raw.estimated_duty_currency='USD';assert.equal(unit(p,1935),'RMB 2.8 + USD 0.2');assert(c._spCostBreakdownHtml_(p,1935).includes('RMB 5458.17 + USD 438.96'));
 assert.equal(unit(p,0),'--');assert.equal(unit({raw:{}},10),'--');
});

test('extra carton edits reconcile repeated changes and removal without reducing original whole cartons',()=>{
 const w={KM:{}};vm.runInNewContext(fs.readFileSync('assets/js/utils/weekly-draft-editor.js','utf8'),{window:w});
 const rows=[{sku:'A',quantity:40}],groups=[{additional:true,members:[{sku:'A',quantity:5},{sku:'C',quantity:3}]}],sync=w.KM.weeklyDraftEditor._syncAdditional;
 let totals=sync(rows,groups,{});assert.equal(rows[0].quantity,45);assert.equal(rows[1].quantity,3);
 groups[0].members[0].quantity=7;totals=sync(rows,groups,totals);assert.equal(rows[0].quantity,47);
 totals=sync(rows,groups,totals);assert.equal(rows[0].quantity,47);
 sync(rows,[],totals);assert.equal(rows[0].quantity,40);assert.equal(rows[1].quantity,0);assert.equal(rows[1].removed,true);
});
