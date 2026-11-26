'use strict';
// Real runtime/DTO/diagnostic functions with synthetic Sheets and Drive. No live requests.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=process.env.DOCUMENT_RECOVERY_GS||'assets/specs/active/apps-script';
function context(){
 const c=vm.createContext({console});
 for(const f of ['34_shipment_final_output_handlers.gs','35_shipment_document_renderer.gs','36_document_template_handlers.gs','38_document_output_folder_resolver.gs','39_document_runtime_service.gs','57_api_v1_shipment_workspace.gs']){
  const p=fs.existsSync(dir+'/'+f)?dir+'/'+f:'assets/specs/active/apps-script/'+f;
  vm.runInContext(fs.readFileSync(p,'utf8'),c,{filename:f});
 }
 c.jsonResponse_=v=>v;c.dgsLog_=()=>{};return c;
}
const plain=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const shipment={shipment_id:'S',status:'shipped',final_output_validated_digest:'CONFIRM-DIGEST'};
test('confirmed zero-row output is recoverable in both list and workspace DTOs',()=>{
 const c=context();c.dgsGeneratedFor_=()=>[];c.dgsShipmentContext_=()=>({ok:true,row:shipment});
 const dto=c.dgsEntityDocumentDtos_({},'shipment','S',0);
 assert.equal(dto.documentGenerationStatus,'CONFIRMED_RETRY_REQUIRED');assert.equal(dto.canRetryDocuments,true);
 assert.deepEqual(plain(c.shipWsDocumentsFor_({},'S',shipment)),plain(dto));assert.equal(dto.documents.length,0);
 assert.equal(dto.documentGenerationError.reason,'DOCUMENT_OUTPUTS_MISSING');
});
for(const status of ['draft','ready_to_ship','cancelled'])test(status+' never offers document recovery',()=>assert.equal(context().dgsMissingShipmentDocuments_({...shipment,status}),null));
test('historical dispatched rows without a Confirm digest do not acquire a missing-output warning',()=>assert.equal(context().dgsMissingShipmentDocuments_({...shipment,final_output_validated_digest:''}),null));
test('ready output URLs survive the workspace projection unchanged',()=>{
 const c=context(),row={document_id:'DOC',related_entity_type:'shipment',related_entity_id:'S',status:'generated',file_id:'FILE',file_url:'https://example.invalid/file',pdf_file_id:'PDF',pdf_file_url:'https://example.invalid/pdf'};
 const dto=c.shipWsDocumentsFor_({S:[row]},'S',shipment);assert.equal(dto.documents[0].status,'READY');assert.equal(dto.documents[0].file_url,row.file_url);assert.equal(dto.documents[0].pdf_file_url,row.pdf_file_url);assert.equal(dto.canRetryDocuments,false);
});
const snapshot={header:{shipment_id:'S',snapshot_id:'SNAP',status:'final',snapshot_version:1,shipment_no:'EXT',external_shipment_id:'EXT',shipper_legal_name:'Exporter',consignee_name:'FC',country:'US',company:'ResUS',marketplace:'Amazon'},
 lines:[80,40].map((qty,i)=>({shipment_line_id:'L'+i,sku:'SKU',shipment_qty:qty,shipment_carton_qty:qty/40,units_per_carton:40,carton_no_start:i?'3':'1',carton_no_end:i?'3':'2',gross_weight:qty/4,net_weight:qty/5,cbm:qty/1000})),
 po_lineage:[{shipment_line_id:'L0',po_no:'PO-A',allocated_qty:30},{shipment_line_id:'L0',po_no:'PO-B',allocated_qty:50},{shipment_line_id:'L1',po_no:'PO-C',allocated_qty:40}],readiness:{shipping_detail:{status:'READY'}}};
const tpl={template_id:'T',template_key:'SHIPDETAIL_STANDARD',template_version:1,template_file_type:'google_sheet',file_name_rule:''};
const detail={template:tpl,template_id:'T',template_key:tpl.template_key,template_version:1,render:'SHIPDETAIL',class_key:'SHIPMENT_DETAIL',requirement:'ALWAYS'};
const fields=[{worksheet_name:'List 1',placeholder:'SHIPMENT_LINES',collection_key:'SHIPMENT_LINES',field_type:'collection',data_scope:'line',transform_rule:'expand_allocations',is_active:true},
 ...[['SKU','shipment_lines','sku'],['QTY','shipment_line_allocations','allocated_qty'],['CARTONS','shipment_lines','carton_qty'],['PO_NO','purchase_orders','po_no']].map(([placeholder,data_source_table,data_source_field])=>({worksheet_name:'List 1',placeholder,collection_key:'SHIPMENT_LINES',field_type:'collection_item',data_scope:'line',data_source_table,data_source_field,required:true,is_active:true,transform_rule:placeholder==='QTY'||placeholder==='PO_NO'?'':'merge_by_shipment_line'}))];

for(const [check,verdict] of [
 [{success:false,code:'DATA_WRITE_IN_PROGRESS',definitive:false},'WAITING_FOR_WRITE'],
 [{success:false,definitive:false},'VALUES_UNVERIFIED'],
 [{success:true,definitive:true,values_ok:false,blockers:[{code:'MISSING_DECLARED_VALUE'}]},'BLOCKED'],
 [{success:true,definitive:true,values_ok:true},'READY']
])test('pre-dispatch diagnostic reports '+verdict+' without treating uncreated files as failed outputs',()=>{
 const c=context();c.dgsDb_=()=>({});c.dgsShipmentContext_=()=>({ok:true,status:'ready_to_ship',ctx:{},row:{shipment_id:'S'},external_shipment_id:'EXT'});
 c.dgsShipmentReadiness_=()=>({ok:true,blockers:[],manifest:[detail],drive_readiness:{status:'READY'},destination_bucket:'EU'});
 c.handleShipmentDocumentValuesCheck_=()=>check;c.docReadSnapshot_=()=>null;c.dgsTemplates_=()=>[tpl];c.dgsShipmentManifest_=()=>({entries:[detail]});c.dgsFieldsFor_=()=>fields;c.dgsGeneratedFor_=()=>[];
 const r=c.handleShipmentDocumentDiagnostic_({shipment_id:'S'});
 assert.equal(r.confirm_shipment_verdict,verdict);assert.deepEqual(plain(r.pre_dispatch_value_check),check);
 assert.equal(r.safe_retry_verdict,'NOT_DISPATCHED');assert.equal(r.missing_or_failed_outputs.length,0);assert.equal(r.writes_performed,0);assert.equal(r.files_created,0);
 if(verdict==='BLOCKED')assert.equal(r.blocking_reasons[0].code,'MISSING_DECLARED_VALUE');
});
test('diagnostic uses the real physical-SKU payload, not the obsolete PO-expanded merge path',()=>{
 const c=context(),before=JSON.stringify(snapshot);c.dgsFieldsFor_=()=>fields;c.xcoLinkCount_=()=>0;
 const raw=c.dtMapPlaceholders_(c.docRenderByClass_('SHIPDETAIL',snapshot),fields);
 assert(raw.missing.some(m=>m.problems&&m.problems.includes('DOCUMENT_MERGE_NOT_IMPLEMENTED')));
 const payload=c.dgsResolvePayload_({}, {entry:detail,model:c.docRenderByClass_('SHIPDETAIL',snapshot),related_entity_type:'shipment',related_entity_id:'S',folder_id:'preview',fallback_file_name:'Detail'});
 assert.equal(payload.ok,true,JSON.stringify(payload));const rows=payload.payload.sheets[0].collections.SHIPMENT_LINES;
 assert.equal(rows.length,1);assert.equal(rows[0].QTY,120);assert.equal(rows[0].CARTONS,3);assert.equal(rows[0].PO_NO,'PO-A: 30 pcs; PO-B: 50 pcs; PO-C: 40 pcs');
 c.dgsDb_=()=>({});c.dgsShipmentContext_=()=>({ok:true,status:'shipped',ctx:{},row:shipment,external_shipment_id:'EXT'});
 c.dgsShipmentReadiness_=()=>({ok:true,blockers:[],manifest:[detail],drive_readiness:{status:'READY'},destination_bucket:'US'});
 c.dgsTemplates_=()=>[tpl];c.dgsShipmentManifest_=()=>({ok:true,entries:[detail]});c.docReadSnapshot_=()=>snapshot;c.dgsGeneratedFor_=()=>[];
 const d=c.handleShipmentDocumentDiagnostic_({shipment_id:'S'});
 assert.equal(d.documents_ready,1);assert.equal(d.documents_configuration_required,0);assert.equal(d.safe_retry_verdict,'RETRY_SAFE');
 assert.equal(d.missing_or_failed_outputs[0].status,'NOT_GENERATED');assert.equal(d.eligible_for_confirm,false);assert.equal(d.writes_performed,0);assert.equal(JSON.stringify(snapshot),before);
 snapshot.lines[0].sku='';const invalid=c.handleShipmentDocumentDiagnostic_({shipment_id:'S'});snapshot.lines[0].sku='SKU';
 assert.equal(invalid.documents_configuration_required,1);assert.notEqual(invalid.safe_retry_verdict,'RETRY_SAFE');
});
function generator(){
 const c=context(),rows=[],calls=[];let seq=0;
 const entries=[detail,{...detail,template:{...tpl,template_id:'BOOK'},template_id:'BOOK',render:'BOOKING',class_key:'CARRIER_BOOKING'}];
 c.dgsShipmentContext_=()=>({ok:true,status:'shipped',ctx:{country:'US',marketplace:'Amazon'},shipped_at:'2026-11-26',external_shipment_id:'EXT'});
 c.sfoFinalizeWith_=()=>({getContent:()=>JSON.stringify({success:true})});c.docReadSnapshot_=()=>snapshot;
 c.dgsTemplates_=()=>[];c.dgsShipmentManifest_=()=>({ok:true,entries});c.dofFolderIo_=()=>({});
 c.dofResolveShipmentFolder_=()=>({ok:true,folder_id:'FOLDER',folder_name:'EXT_20261126'});c.dgsShipmentLeafOwnership_=()=>({ok:true});
 c.prodRequireSheet_=()=>({});c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
 c.dgsGeneratedFor_=()=>rows;c.dtReadTable_=()=>rows;c.shipmentTimestamp_=()=> '2026-11-26 00:00:00';c.dgsNewDocId_=()=> 'D'+(++seq);
 c.dgsWriteRegistry_=(_,row)=>rows.push({...row});c.dgsUpdateRegistry_=(_,id,patch)=>{Object.assign(rows.find(r=>r.document_id===id),patch);return true;};
 c.dfoDefaultIo_=()=>({attemptFiles:()=>[],renameFile(){}});c.docRenderByClass_=()=>({ok:true});
 c.dgsRenderOne_=(_,opts)=>{calls.push(opts.entry.class_key);return {ok:true,file:{file_id:'FILE-'+opts.entry.template_id,file_url:'https://example.invalid/file'},payload:{source_checksum:'CHECKSUM'}};};
 c.handleConfirmShipmentAndDispatch_=c.factoryStockConsumeReservationTx_=()=>{throw Error('BUSINESS WRITE FORBIDDEN');};
 return {c,rows,calls,run:()=>c.dgsGenerateShipmentDocuments_({},'S','fixture',{})};
}
test('zero attempts generates all manifest classes; another retry reuses them without rendering',()=>{
 const g=generator(),a=g.run();assert.equal(a.ok,true);assert.equal(a.generated,2);assert.equal(g.rows.length,2);
 const b=g.run();assert.equal(b.ok,true);assert.equal(b.reused,2);assert.equal(b.generated,0);assert.equal(g.calls.length,2);assert.equal(g.rows.length,2);
});
test('a model exception is recorded and does not prevent the next carrier class rendering',()=>{
 const g=generator();g.c.docRenderByClass_=render=>{if(render==='SHIPDETAIL')throw Error('fixture mapper failed');return {ok:true};};
 const a=g.run();assert.equal(a.ok,false);assert.equal(a.failed,1);assert.equal(a.generated,1);assert.equal(g.rows.length,2);assert.match(g.rows[0].note,/DOCUMENT_RENDER_FAILED/);assert.equal(a.results[1].status,'READY');
});
test('unexpected renderer exception is recorded, with other documents still generated',()=>{
 const g=generator(),render=g.c.dgsRenderOne_;g.c.dgsRenderOne_=(_,opts)=>{if(opts.entry.class_key==='SHIPMENT_DETAIL')throw Error('fixture renderer failed');return render(_,opts);};
 const a=g.run();assert.equal(a.ok,false);assert.equal(a.failed,1);assert.equal(a.generated,1);assert.match(g.rows[0].note,/fixture renderer failed/);
});
test('configuration-required outputs cannot report a successful batch',()=>{
 const g=generator();g.c.dgsRenderOne_=()=>({ok:false,configuration_required:true,reason:'DOCUMENT_REQUIRED_FIELD_MISSING',missing:[{placeholder:'SKU'}]});
 const a=g.run();assert.equal(a.ok,false);assert.equal(a.configuration_required,2);assert.equal(a.generated,0);
});
test('an active document lease prevents a duplicate render',()=>{
 const g=generator();g.rows.push({related_entity_type:'shipment',related_entity_id:'S',template_id:'T',template_version:1,document_id:'ACTIVE',status:'failed',note:'DGS_REASON=DOCUMENT_ATTEMPT_RESERVED; DGS_LEASE='+(Date.now()+60000)+';'});
 const a=g.run();assert.equal(a.results[0].reason,'DOCUMENT_ATTEMPT_IN_PROGRESS');assert.deepEqual(g.calls,['CARRIER_BOOKING']);
});
console.log('SHIPMENT_DOCUMENT_RECOVERY_PASS '+passed+' live_requests=0');
