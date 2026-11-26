'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.env.DOCUMENT_CARTON_GS||'assets/specs/active/apps-script',c=vm.createContext({console});
for(const file of ['34_shipment_final_output_handlers.gs','35_shipment_document_renderer.gs','36_document_template_handlers.gs','39_document_runtime_service.gs']){
 const p=fs.existsSync(root+'/'+file)?root+'/'+file:'assets/specs/active/apps-script/'+file;
 vm.runInContext(fs.readFileSync(p,'utf8'),c,{filename:file});
}
const plain=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const line=(sku,start,end,qty)=>({shipment_line_id:sku,sku,carton_no_start:start,carton_no_end:end,shipment_qty:qty,carton_qty:Number(end)-Number(start)+1,units_per_carton:1,po_allocations:[]});
const rows=[line('Z','26','40',15),line('X','1','10',10),line('Y','11','25',15)];
test('numeric start carton order matches 1-10, 11-25, 26-40',()=>assert.deepEqual(plain(c.dtCartonOrder_(rows)).map(r=>r.sku),['X','Y','Z']));
test('numeric sorting does not compare carton labels lexicographically',()=>assert.deepEqual(plain(c.dtCartonOrder_([line('TEN','10','10',1),line('TWO','2','2',1),line('ONE','1','1',1)])).map(r=>r.sku),['ONE','TWO','TEN']));
test('equal starts preserve existing order, including shared mixed-carton rows',()=>assert.deepEqual(plain(c.dtCartonOrder_([line('B','1','1',1),line('A',1,1,1)])).map(r=>r.sku),['B','A']));
test('blank or invalid starts stay last without reordering or inventing a carton number',()=>{
 const invalid=['',null,undefined,0,-1,'bad','1.5',Infinity,'9007199254740992'].map((start,i)=>({sku:'UNKNOWN'+i,carton_no_start:start}));
 const sorted=c.dtCartonOrder_([...invalid,line('VALID','02','2',1)]);
 assert.equal(sorted[0].sku,'VALID');assert.deepEqual(Array.from(sorted.slice(1),r=>r.sku),invalid.map(r=>r.sku));
});
test('sort does not mutate a frozen source array or its row facts',()=>{
 const frozen=Object.freeze(rows.map(r=>Object.freeze({...r}))),before=JSON.stringify(frozen),sorted=c.dtCartonOrder_(frozen);
 assert.notEqual(sorted,frozen);assert.equal(JSON.stringify(frozen),before);assert.equal(sorted[0],frozen[1]);
});
const controller={placeholder:'LINES',collection_key:'LINES',field_type:'collection',data_scope:'line',is_active:true};
const fields=[controller,...[['SKU','sku'],['QTY','shipment_qty'],['START','carton_no_start'],['END','carton_no_end']].map(([placeholder,data_source_field])=>({placeholder,data_source_field,data_source_table:placeholder==='START'||placeholder==='END'?'':'shipment_lines',collection_key:'LINES',field_type:'collection_item',data_scope:'line',required:true,is_active:true}))];
test('line mapper moves complete rows together without changing values or totals',()=>{
 const model={header:{},lines:rows},before=JSON.stringify(model),m=c.dtMapPlaceholders_(model,fields,true);
 assert.deepEqual(plain(m.missing),[]);assert.deepEqual(plain(m.values.LINES),[{SKU:'X',QTY:10,START:'1',END:'10'},{SKU:'Y',QTY:15,START:'11',END:'25'},{SKU:'Z',QTY:15,START:'26',END:'40'}]);
 assert.equal(JSON.stringify(model),before);
});
test('PO allocation expansion follows carton order while preserving each allocation',()=>{
 const model={header:{},lines:rows.map(r=>({...r,po_allocations:[{po_no:r.sku+'-A',allocated_qty:1},{po_no:r.sku+'-B',allocated_qty:r.shipment_qty-1}]}))};
 const f=[{...controller,transform_rule:'expand_allocations'},fields[1],{...fields[2],data_source_table:'shipment_line_allocations',data_source_field:'allocated_qty'},{...fields[1],placeholder:'PO',data_source_table:'purchase_orders',data_source_field:'po_no'}];
 const m=c.dtMapPlaceholders_(model,f,true);assert.deepEqual(plain(m.missing),[]);
 assert.deepEqual(plain(m.values.LINES).map(r=>r.PO),['X-A','X-B','Y-A','Y-B','Z-A','Z-B']);assert.equal(m.values.LINES.reduce((n,r)=>n+r.QTY,0),40);
});
test('allocation-scope collections use the same physical carton order',()=>{
 const model={header:{},lines:rows.map(r=>({...r,po_allocations:[{po_no:r.sku,allocated_qty:r.shipment_qty}]}))};
 const f=[{...controller,data_scope:'allocation'},{...fields[1],placeholder:'PO',data_source_table:'purchase_orders',data_source_field:'po_no'}];
 assert.deepEqual(plain(c.dtMapPlaceholders_(model,f,true).values.LINES).map(r=>r.PO),['X','Y','Z']);
});
c.xcoLinkCount_=()=>0;c.dgsTemplates_=()=>[];
for(const render of ['SHIPDETAIL','BOOKING','PL','CI'])test(render+' final payload sorts after SKU/Series projection',()=>{
 c.dgsFieldsFor_=()=>fields;
 const model={header:{shipment_id:'S',country:'US'},lines:[line('A','26','40',15),line('A','1','10',10),line('B','11','25',15)]};
 const entry={render,class_key:'TEST',template_id:'T',template_key:'TEST',document_usage:render==='CI'||render==='PL'?'export':'carrier',template:{template_file_type:'google_sheet',file_name_rule:''}};
 c.sfoReadTable_=()=>[{sku:'A',series:'SERIES-A'},{sku:'B',series:'SERIES-B'}];
 const before=JSON.stringify(model),resolved=c.dgsResolvePayload_({}, {entry,model,related_entity_type:'shipment',related_entity_id:'S',folder_id:'TEST',fallback_file_name:'Test'});
 assert.equal(resolved.ok,true,JSON.stringify(resolved));assert.deepEqual(plain(resolved.payload.collections.LINES).map(r=>Number(r.START)),[1,11,26]);assert.equal(JSON.stringify(model),before);
});
test('scalar totals and documents without carton numbers keep existing behavior',()=>{
 const noCartons=[{sku:'B',shipment_qty:2},{sku:'A',shipment_qty:3}],model={header:{totals:{qty:5}},lines:noCartons};
 const f=[controller,fields[1],{placeholder:'TOTAL',field_type:'scalar',data_source_table:'shipments',data_source_field:'shipment_total_qty',required:true}];
 const m=c.dtMapPlaceholders_(model,f,true);assert.equal(m.values.TOTAL,5);assert.deepEqual(plain(m.values.LINES).map(r=>r.SKU),['B','A']);
});
console.log('DOCUMENT_CARTON_ORDER_PASS '+passed+' live_requests=0');
