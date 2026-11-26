'use strict';
// Real handlers and controls, synthetic data only. No live business writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {extract}=require('./ad4/extract.cjs');
const root='assets/specs/active/apps-script/',read=f=>fs.readFileSync(f,'utf8');
let pass=0;function test(name,fn){fn();pass++;console.log('PASS '+name);}
const c={console,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]}};
vm.createContext(c);
vm.runInContext(read('assets/js/core/supply-planning-country-identity.js'),c);
for(const f of ['22_shipment_dispatch_handlers.gs','36_document_template_handlers.gs','12_shipment_handlers.gs','11_shipping_plan_handlers.gs','34_shipment_final_output_handlers.gs','39_document_runtime_service.gs','71_api_v1_factory_stock_guard.gs']){const candidate=process.env.DW1_GS&&process.env.DW1_GS+'/'+f;vm.runInContext(read(candidate&&fs.existsSync(candidate)?candidate:root+f),c,{filename:f});}
c.jsonResponse_=x=>x;
const wh=[{warehouse_id:'S',company:'ResUS',country:'US',warehouse_type:'3PL',is_active:true,is_factory_warehouse:false},{warehouse_id:'F',company:'ResUS',country:'CN',warehouse_type:'FACTORY',is_factory_warehouse:true,is_active:true},{warehouse_id:'D',company:'ResUS',country:'US',marketplace:'Amazon',warehouse_type:'FBA',is_active:true}];
let sites=[{company:'ResUS',country:'US',marketplace:'Amazon',status:'active'}];
const sheet=rows=>({getDataRange:()=>({getValues:()=>{const h=[...new Set(rows.flatMap(Object.keys))];return [h,...rows.map(r=>h.map(k=>r[k]??''))];}})});
const ss={getSheetByName:n=>n==='warehouses'?sheet(wh):n==='marketplaces'?sheet(sites):null};
const plan={company:'ResUS',country:'US',marketplace:'Amazon',destination:'Amazon',destination_type:'marketplace',source_warehouse_id:'S'};
const lane=p=>c.shipCustomsApplicability_(ss,p,{allow_planned_destination:true});
test('planned same-country Amazon lane does not require customs',()=>assert.equal(lane(plan).applicable,false));
test('actual dispatch cannot use planned destination proof',()=>assert.equal(c.shipCustomsApplicability_(ss,plan).applicable,true));
test('actual same-country FC does not require customs',()=>assert.equal(lane({...plan,destination_warehouse_id:'D'}).applicable,false));
test('factory export still requires customs',()=>assert.equal(lane({...plan,source_warehouse_id:'F'}).applicable,true));
test('unknown source cannot waive customs',()=>assert.equal(lane({...plan,source_warehouse_id:'missing'}).applicable,true));
test('cross-country planned scope cannot waive customs',()=>assert.equal(lane({...plan,country:'CA'}).applicable,true));
test('duplicate marketplace identity fails closed',()=>{sites.push({...sites[0]});assert.equal(lane(plan).applicable,true);sites.pop();});
test('inactive marketplace fails closed',()=>{sites[0].status='inactive';assert.equal(lane(plan).applicable,true);sites[0].status='active';});
test('a generic marketplace label is not domestic proof',()=>assert.equal(lane({...plan,destination:'somewhere'}).applicable,true));
test('UK site and GB warehouse use the same physical country',()=>{wh[0].country='GB';sites[0].country='UK';assert.equal(lane({...plan,country:'UK'}).applicable,false);wh[0].country='US';sites[0].country='US';});
const cls={document_type:'shipment_detail',document_usage:'internal',match:'SCOPED'};
const tpl={template_id:'TPL-SHIPDETAIL-STANDARD-V1',related_entity_type:'shipment',document_type:'shipment_detail_sheet',document_usage:'internal',status:'active',is_active:true,language:'zh-TW'};
test('existing shipment_detail_sheet template resolves',()=>assert.equal(c.dgsClassCandidates_([tpl],{language:null,as_of:''},cls).length,1));
test('canonical shipment_detail still resolves',()=>assert.equal(c.dgsClassCandidates_([{...tpl,document_type:'shipment_detail'}],{language:null,as_of:''},cls).length,1));
test('inactive template remains refused',()=>assert.equal(c.dgsClassCandidates_([{...tpl,is_active:false}],{language:null,as_of:''},cls).length,0));
test('wrong template usage remains refused',()=>assert.equal(c.dgsClassCandidates_([{...tpl,document_usage:'export'}],{language:null,as_of:''},cls).length,0));
const poField=[{data_source_table:'purchase_orders',data_source_field:'po_no',required:true}], noPoModel={lines:[{sku:'SKU',po_allocations:[]}]};
test('approved overseas details leave absent factory PO blank',()=>assert.equal(c.dgsOverseasFieldsDw1_({entry:{render:'SHIPDETAIL',overseas_no_po:true},related_entity_type:'shipment'},poField,noPoModel)[0].required,false));
test('factory details still require factory PO',()=>assert.equal(c.dgsOverseasFieldsDw1_({entry:{render:'SHIPDETAIL'},related_entity_type:'shipment'},poField,noPoModel)[0].required,true));
test('existing PO lineage is never exempted',()=>assert.equal(c.dgsOverseasFieldsDw1_({entry:{render:'SHIPDETAIL',overseas_no_po:true},related_entity_type:'shipment'},poField,{lines:[{po_allocations:[{po_no:'PO'}]}]})[0].required,true));
c.xcoSeriesCompanyOf_=()=>()=> 'ResUS';c.dgsBuildRenderPayload_=opts=>({ok:true,payload:opts});
c.dgsFieldsFor_=()=>[
 {worksheet_name:'List 1',placeholder:'SHIPMENT_LINES',collection_key:'SHIPMENT_LINES',field_type:'collection',data_scope:'line',data_source_table:'shipment_lines',transform_rule:'expand_allocations',required:true,is_active:true},
 {worksheet_name:'List 1',placeholder:'SKU',collection_key:'SHIPMENT_LINES',field_type:'collection_item',data_scope:'line',data_source_table:'shipment_lines',data_source_field:'sku',required:true,is_active:true},
 {worksheet_name:'List 1',placeholder:'QTY',collection_key:'SHIPMENT_LINES',field_type:'collection_item',data_scope:'allocation',data_source_table:'shipment_line_allocations',data_source_field:'allocated_qty',required:true,is_active:true},
 {worksheet_name:'List 1',placeholder:'PO_NO',collection_key:'SHIPMENT_LINES',field_type:'collection_item',data_scope:'allocation',data_source_table:'purchase_orders',data_source_field:'po_no',required:true,is_active:true}
];
const resolve={entry:{render:'SHIPDETAIL',class_key:'SHIPMENT_DETAIL',template_id:'T',template:{template_file_type:'google_sheet'},overseas_no_po:true},model:{header:{},lines:[{shipment_line_id:'L',sku:'CO1100-S',shipment_qty:120,carton_qty:3,po_allocations:[]}]},related_entity_type:'shipment',related_entity_id:'SHIP'};
test('real document mapper produces SKU and physical quantity without a fake PO',()=>{const r=c.dgsResolvePayload_(ss,resolve);assert.equal(r.ok,true,JSON.stringify(r));const lines=r.payload.sheets[0].collections.SHIPMENT_LINES;assert.equal(lines[0].SKU,'CO1100-S');assert.equal(Number(lines[0].QTY),120);assert.equal(lines[0].PO_NO,'');});
test('same document mapping refuses missing factory PO on factory shipment',()=>{const r=c.dgsResolvePayload_(ss,{...resolve,entry:{...resolve.entry,overseas_no_po:false}});assert.equal(r.ok,false);});
let eligibility={allowed:true,reason:'NO_APPLICABLE_RATE',label:'Truck'};
c.shipUnpricedEligibility_=()=>eligibility;c.shipRcLines_=()=>[{sku:'SKU',qty:120}];c.shipmentTimestamp_=()=> '2026-11-22 14:00:00';
const ship={shipment_id:'SHIP',status:'ready_to_ship',carrier_id:'CAR',shipping_method:'truck'};
test('no active quote automatically stays cost pending',()=>assert.equal(c.shipNoRatePolicy_(ss,ship,[],'').allowed,true));
test('document method resolves without manual reason or a DB write',()=>{const r=c.sfoRateCardLabel_(ss,ship);assert.equal(r.ok,true);assert.equal(r.pricing_state,'COST_PENDING_AUTO');assert.equal(r.label,'Truck');assert.equal(ship.rate_card_version,undefined);});
test('an applicable card cannot silently be skipped',()=>{eligibility={allowed:false,reason:'APPLICABLE_RATE_AVAILABLE'};assert.equal(c.shipNoRatePolicy_(ss,ship,[],'').allowed,false);eligibility={allowed:true,reason:'NO_APPLICABLE_RATE',label:'Truck'};});
for(const [name,patch] of [['pending operation',{rate_card_version:'pending-unpriced'}],['existing selected card',{rate_card_id:'RC'}],['stale saved amount',{estimated_total_cost:10}],['cancelled shipment',{status:'cancelled'}]])test(name+' is not auto released',()=>assert.equal(c.shipNoRatePolicy_(ss,{...ship,...patch},[],'').allowed,false));
let released=0,locked=true,rev=false;
c.LockService={getScriptLock:()=>({tryLock:()=>locked,releaseLock:()=>released++})};c.kmSrcRevGet_=()=>rev;
const facts={ok:true,display14:{warehouses:[{warehouse_id:'F',is_factory_warehouse:true}],factory_stock:[{warehouse_id:'F',sku:'SKU',fac_current_stock:100,fac_reserved_stock:20}]},eligibleFactoryWarehouseIds:{F:1},available:{pool_keys:[],byPool:{},fingerprint:'stable'},tables_read:[]};
c.fsgReadInventoryFacts_=()=>facts;c.KMFSG={CONTRACT:'fixture'};
test('pending global revision can read factory display under stock lock',()=>{const r=c.fsgDisplay14_(ss);assert.equal(r.success,true);assert.match(r.data.display14.revision,/^factory-display:/);assert.equal(released,1);});
test('busy stock lock returns a retryable read refusal',()=>{locked=false;assert.equal(c.fsgDisplay14_(ss).code,'SOURCE_REVISION_PENDING');locked=true;});
test('bad balance is not fabricated as zero and releases lock',()=>{facts.display14.factory_stock[0].fac_reserved_stock=101;assert.equal(c.fsgDisplay14_(ss).code,'FACTORY_DISPLAY_BALANCE_INVALID');facts.display14.factory_stock[0].fac_reserved_stock=20;assert.equal(released,2);});
test('unreadable revision is not bypassed',()=>{rev=null;assert.equal(c.fsgDisplay14_(ss).code,'SOURCE_REVISION_UNAVAILABLE');rev=false;});
test('stable revision retains original path',()=>{rev='v1';assert.equal(c.fsgDisplay14_(ss).data.display14.revision,'v1');});
const sp=read('assets/js/pages/shipping-plan.js'),sh=read('assets/js/pages/shipping-history.js');
function context(src,names,vars,seed){const x=vm.createContext(seed);vm.runInContext(extract(src,n=>names.includes(n),n=>vars.includes(n)).map(p=>p.text).join('\n'),x);return x;}
(async()=>{
 const p=context(sp,['_spRunCommand_','_spPlanBusy_','_spReadbackAfterWrite_'],['_spInFlight','_spReadbackBlocked_'],{Promise,_spHoldButtons_:()=>()=>{},_spNotify_:()=>{},_spPlanNotice_:()=>{},_spHandleCommandResult_:()=>Promise.resolve()});
 let resolveA,resolveB,sends=0;
 const a=p._spRunCommand_('A:submit',()=>{sends++;return new Promise(r=>resolveA=r);},{}),b=p._spRunCommand_('B:approve',()=>{sends++;return new Promise(r=>resolveB=r);},{});
 await Promise.resolve();
 test('different plan commands both send before either completes',()=>assert.equal(sends,2));
 test('same plan duplicate rejected while other plan is running',()=>assert.equal(p._spPlanBusy_('A'),true));
 const duplicate=await p._spRunCommand_('A:save',()=>{throw Error('duplicate sent');},{});test('same plan returns IN_FLIGHT',()=>assert.equal(duplicate.error.code,'IN_FLIGHT'));
 resolveB({success:true});await b;test('finishing B does not unlock A',()=>assert.equal(p._spPlanBusy_('A'),true));resolveA({success:true});await a;
 let order=[],release;
 p._spReadbackNow_=()=>{order.push('start');return new Promise(r=>release=r);};
 const r1=p._spReadbackAfterWrite_(),r2=p._spReadbackAfterWrite_();await new Promise(r=>setImmediate(r));test('refreshes are ordered without serializing commands',()=>assert.equal(order.length,1));release(true);await r1;await new Promise(r=>setImmediate(r));test('second refresh starts after first settles',()=>assert.equal(order.length,2));release(true);await r2;
 const s=context(sh,['_shUpd_'],['_shInFlight_','SH_UPD_WAIT_DEFAULT_MS_15C_'],{Promise,setTimeout,clearTimeout,window:{KM:{DB:{updateShipment:p=>new Promise(r=>{sends++;pending[p.shipment_id]=r;})}}},SH_UPD_PHASE_17_:{},SH_AFTER_SENT_17_:{},SH_LAST_SENT_17_:{},SH_PAGE_SESS_17_:'fixture',_shPerf17_:()=>0,_shChangedFields17_:()=>[],_shHoldCard_:()=>()=>{}});
 const pending={};sends=0;
 const sa=s._shUpd_('A',{shipment_id:'A'}),sb=s._shUpd_('B',{shipment_id:'B'});await Promise.resolve();test('different shipment saves can overlap',()=>assert.equal(sends,2));
 await assert.rejects(s._shUpd_('A',{shipment_id:'A'}),/IN_FLIGHT/);test('same shipment duplicate never sends',()=>assert.equal(sends,2));pending.B({success:true});await sb;pending.A({success:true});await sa;
 console.log('DW1_PASS '+pass+' live_business_writes=0');
})().catch(e=>{console.error(e);process.exitCode=1;});
