'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const pack=require('../js/core/mixed-carton-packing.js');
const line=(id,quantity=40,series='CO1100')=>({id,sku:id,quantity,series,unitsPerCarton:40,itemKg:0.25,note:'Factory note',box:{length:50,width:40,height:30,unit:'cm',grossKg:12}});
const group=(id='M1',a=20,b=20)=>({id,representativeId:'A',members:[{lineId:'A',quantity:a},{lineId:'B',quantity:b}]});
const records=packed=>packed.map(l=>({id:l.id,sku:l.sku,quantity:l.quantity,cartons:l.ownedCartons,cbm:l.cbm,grossKg:l.grossKg,netKg:l.netKg,note:l.note,unitValue:l.sku==='A'?2:3,currency:'USD',hsCode:'8509',origin:'CN'}));
const fixture=(lines=[line('A'),line('B')],groups=[group()])=>records(pack.annotate(lines,groups));
test('partial quantities: one mixed plus ordinary remainder, immutable quantities',()=>{
 const lines=[line('A'),line('B')],before=JSON.stringify(lines),p=pack.project({lines,groups:[group()]});
 assert.equal(JSON.stringify(lines),before);assert.equal(p.totals.quantity,80);assert.equal(p.totals.cartons,3);
 assert.equal(p.totals.grossKg,36);assert.equal(p.totals.netKg,20);assert.equal(p.totals.cbm,.18);
 assert.deepEqual(p.blocks.map(b=>b.rows.map(r=>[r.sku,r.quantity])),[[['A',20],['B',20]],[['A',20]],[['B',20]]]);
});
test('multiple groups, same SKU, physical logistics counted once',()=>{
 const p=pack.project({lines:[line('A'),line('B')],groups:[group('M1'),group('M2')]});
 assert.equal(p.totals.cartons,2);assert.deepEqual(p.lines.map(l=>l.ownedCartons),[2,0]);assert.equal(p.totals.grossKg,24);
 const layout=pack.layout(fixture([line('A'),line('B')],[group('M1'),group('M2')]));
 assert.deepEqual(layout.blocks.map(b=>[b.start,b.end]),[[1,1],[2,2]]);
});
for(const [name,mutate,code] of [
 ['overallocated',g=>g.members[0].quantity=41,'EXCEEDS'],['zero',g=>g.members[0].quantity=0,'QUANTITY'],
 ['fraction',g=>g.members[0].quantity=1.5,'QUANTITY'],['blank',g=>g.members[0].quantity='','QUANTITY'],
 ['boolean',g=>g.members[0].quantity=true,'QUANTITY'],['unknown line',g=>g.members[0].lineId='NO','MEMBER'],
 ['repeated member',g=>g.members[1].lineId='A','MEMBER'],['representative outside carton',g=>g.representativeId='C','REPRESENTATIVE']
])test('reject '+name,()=>{const g=group();mutate(g);assert.throws(()=>pack.project({lines:[line('A'),line('B')],groups:[g]}),new RegExp(code));});
test('cumulative allocation across groups, duplicate ids and missing specs reject',()=>{
 assert.throws(()=>pack.project({lines:[line('A'),line('B')],groups:[group('M1',30),group('M2',30)]}),/EXCEEDS/);
 assert.throws(()=>pack.project({lines:[line('A'),line('B')],groups:[group(),group()]}),/GROUP_ID/);
 const a=line('A');a.box.grossKg='';assert.throws(()=>pack.project({lines:[a,line('B')],groups:[group()]}),/SPEC_MISSING/);
});
test('normalization handles inch/mm/metre; unknown ordinary metrics remain unknown',()=>{
 for(const [unit,factor]of[['cm',.01],['mm',.001],['m',1],['in',.0254]]){
  const a=line('A');a.box.unit=unit;const p=pack.project({lines:[a,line('B')],groups:[group('M1',40,40)]});
  assert(Math.abs(p.totals.cbm-Number((50*40*30*factor**3).toFixed(6)))<.0000011);
 }
 const a=line('A');a.box.grossKg='';const rec=fixture([a,line('B')],[{...group(),representativeId:'B'}]);
 assert.equal(rec[0].grossKg,null);assert.equal(pack.portions(rec,'CI').find(r=>r.groupId==='ORDINARY:A').grossKg,null);
});
test('versioned JSON follows notes and survives source-line ID changes',()=>{
 const r=fixture();assert.equal(pack.layout(r).physicalCartons,3);assert.match(r[0].note,/Factory note/);
 r.forEach(l=>l.id='SHIP:'+l.id);assert.equal(pack.layout(r).physicalCartons,3);
 assert.equal(pack.clean(r[0].note),'Factory note');assert.equal(pack.metadata('regular note'),null);
 assert.throws(()=>pack.metadata('[KMPACK1:bad]'),/INVALID/);
 assert.throws(()=>pack.metadata('broken [KMPACK1:bad]'),/INVALID/);
 assert.throws(()=>pack.metadata(r[0].note+'\n'+r[0].note),/DUPLICATE/);
});
test('frozen layout rejects changed SKU/quantity/metrics and missing member',()=>{
 for(const [key,value]of[['sku','X'],['quantity',50],['cartons',9],['cbm',3],['grossKg',99],['netKg',99]]){
  const r=fixture();r[0][key]=value;assert.throws(()=>pack.layout(r),/CHANGED/);
 }
 assert.throws(()=>pack.layout(fixture().slice(0,1)),/MEMBER/);
});
test('factory detail preserves all SKU portions; CI/PL combine only same Series within a box',()=>{
 const r=fixture([line('A'),line('B')],[group('M1',40,40)]);
 for(const family of['CI','PL','BOOKING']){const rows=pack.portions(r,family);assert.equal(rows.length,1);assert.equal(rows[0].quantity,80);assert.equal(rows[0].cartons,1);assert.equal(rows[0].declaredTotal,200);assert.equal(rows[0].unitValue,2.5);}
 const rows=pack.portions(r,'SHIPDETAIL');assert.deepEqual(rows.map(r=>[r.sku,r.quantity,r.cartons]),[['A',40,1],['B',40,0]]);
 assert.equal(rows.reduce((n,l)=>n+l.grossKg,0),12);assert.equal(rows.reduce((n,l)=>n+l.netKg,0),20);
});
test('different Series/customs facts remain separate rows sharing one carton',()=>{
 for(const key of['series','hsCode','origin','currency']){const r=fixture([line('A'),line('B',40,key==='series'?'OTHER':'CO1100')],[group('M1',40,40)]);
  if(key!=='series')r[1][key]='OTHER';const p=pack.portions(r,'CI');assert.equal(p.length,2,key);assert.deepEqual(p.map(r=>r.cartons),[1,0]);assert.deepEqual(p.map(r=>r.start),[1,1]);}
});
test('partial/multiple-group exports conserve each SKU, money, net and physical carton counts',()=>{
 for(let a=1;a<=40;a++)for(let b=1;b<=40;b+=3){const r=fixture([line('A'),line('B')],[group('M1',a,b)]),p=pack.portions(r,'CI');
  assert.equal(p.reduce((s,l)=>s+l.quantity,0),80);assert.equal(p.reduce((s,l)=>s+l.declaredTotal,0),200);
  assert(Math.abs(p.reduce((s,l)=>s+l.netKg,0)-20)<1e-8);assert.equal(p.reduce((s,l)=>s+l.cartons,0),pack.layout(r).physicalCartons);
 }
});
function context(){const c=vm.createContext({console,KMPACK:pack});for(const f of['12_shipment_handlers.gs','34_shipment_final_output_handlers.gs','35_shipment_document_renderer.gs','39_document_runtime_service.gs','83_api_v1_weekly_draft_lines.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+f,'utf8'),c,{filename:f});return c;}
function snapshot(){const r=fixture([line('A'),line('B')],[group('M1',40,40)]);return {header:{shipment_id:'S',snapshot_id:'F',snapshot_version:1,shipper_legal_name:'Factory',consignee_name:'Warehouse'},readiness:{shipping_detail:{status:'READY'},packing_list:{status:'READY'},commercial_invoice:{status:'READY'}},
 lines:r.map(l=>({shipment_line_id:l.id,sku:l.sku,shipment_qty:l.quantity,shipment_carton_qty:l.cartons,cbm:l.cbm,gross_weight:l.grossKg,net_weight:l.netKg,note:l.note,declared_currency:l.currency,declared_unit_value:l.unitValue,hs_code:l.hsCode,country_of_origin:l.origin})),po_lineage:[]};}
test('real snapshot/renderer produces factory detail vs representative forwarder/customs model',()=>{
 const c=context(),s=snapshot(),before=JSON.stringify(s);
 for(const f of['CI','PL','BOOKING','SHIPDETAIL']){const out=c.docRenderByClass_(f,s);assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.lines.length,f==='SHIPDETAIL'?2:1);assert.equal(out.header.totals.cartons,1);assert.equal(out.header.totals.qty,80);}
 assert.equal(c.docRenderByClass_('CI',s).header.invoice_total_value,200);assert.equal(JSON.stringify(s),before);
 s.lines[0].shipment_qty++;assert.equal(c.docRenderByClass_('CI',s).ok,false);
});
test('real dispatch carton validator uses physical group sequence, not overlapping per-SKU ranges',()=>{
 const c=context(),s=snapshot();c.pmiTable_=()=>({rows:s.lines.map(l=>({...l,shipment_id:'S',shipment_carton_cbm:l.cbm}))});
 assert.equal(c.shipmentValidateCartons_({},'S',true).ok,true);
 s.lines[0].gross_weight=999;assert.equal(c.shipmentValidateCartons_({},'S',true).ok,false);
});
test('normal shipments keep original document behavior',()=>{
 const c=context(),s=snapshot();s.lines.forEach(l=>l.note='');assert.equal(c.docRenderByClass_('CI',s).lines.length,2);assert.equal(pack.layout([{id:'A',note:''}]),null);
});
test('multi-PO factory documents preserve whole pieces and never count a PO allocation twice',()=>{
 const c=context(),s=snapshot(),r=fixture([line('A',97),line('B',40)],[group('M1',10,10)]);
 s.lines=r.map(l=>({shipment_line_id:l.id,sku:l.sku,shipment_qty:l.quantity,shipment_carton_qty:l.cartons,cbm:l.cbm,gross_weight:l.grossKg,net_weight:l.netKg,note:l.note,declared_unit_value:l.unitValue,declared_currency:'USD'}));
 s.po_lineage=[{shipment_line_id:'A',purchase_order_line_id:'PA1',po_no:'PO1',allocated_qty:67},{shipment_line_id:'A',purchase_order_line_id:'PA2',po_no:'PO2',allocated_qty:30},{shipment_line_id:'B',purchase_order_line_id:'PB1',po_no:'PO3',allocated_qty:40}];
 const m=c.docRenderByClass_('SHIPDETAIL',s);assert.equal(m.ok,true,JSON.stringify(m));const counts={};
 for(const l of m.lines){assert.equal(l.po_allocations.reduce((n,a)=>n+a.allocated_qty,0),l.shipment_qty);for(const a of l.po_allocations){assert(Number.isSafeInteger(a.allocated_qty));counts[a.purchase_order_line_id]=(counts[a.purchase_order_line_id]||0)+a.allocated_qty;}}
 assert.deepEqual(counts,{PA1:67,PB1:40,PA2:30});
});
test('downstream Series projection retains carton boundaries and frozen Series',()=>{
 const c=context(),s=snapshot(),r=fixture([line('A'),line('B')],[group('M1'),group('M2')]);
 s.lines=r.map(l=>({shipment_line_id:l.id,sku:l.sku,shipment_qty:l.quantity,shipment_carton_qty:l.cartons,cbm:l.cbm,gross_weight:l.grossKg,net_weight:l.netKg,note:l.note,declared_unit_value:l.unitValue,declared_currency:'USD'}));
 const m=c.docRenderByClass_('CI',s),out=c.dgsSeriesExportModel_(m,[{sku:'A',series:'CHANGED-LATER'},{sku:'B',series:'CHANGED-LATER'}],()=> 'KM');
 assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.model.lines.length,2);assert.equal(out.model.lines[0].packing_series,'CO1100');
});
test('shipment Update import exports human notes and preserves server-owned packing metadata',()=>{
 const c=context();vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/80_api_v1_shipment_import.gs','utf8'),c);
 c.imbStr_=v=>String(v==null?'':v).trim();c.imbIssue_=(issues,...args)=>issues.push(args);c.xcoLinkCount_=()=>1;
 const source=snapshot().lines[0],db={},field={sheet:'Lines',key:'note',type:'text'},ship={shipment_id:'S'};
 const text=c.shiCurrent_(db,field,ship,source);assert.equal(text,'Factory note');
 const issues=[],change=c.xcoImportNote_({},issues,'Lines',{__row:3},{field:'note',before:text,after:'Updated note'},ship,source);
 assert.equal(issues.length,0);assert.equal(pack.metadata(change.after).ref,'A');assert.equal(pack.clean(change.after),'Updated note');assert.equal(change.before,source.note);
 assert.equal(c.xcoImportNote_({},issues,'Lines',{__row:3},{field:'note',before:text,after:'[KMPACK1:forged]'},ship,source),null);assert.equal(issues.length,1);
});
module.exports={line,group,records,fixture,context};
