'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ExcelJS=require('../vendor/exceljs-4.4.0.min.js');
const window={ExcelJS,KM:{}};const ctx={window,console,Promise,Date};vm.createContext(ctx);
for(const f of ['template-export.js','import-batch.js'])vm.runInContext(fs.readFileSync('assets/js/utils/'+f,'utf8'),ctx,{filename:f});
let passed=0;
(async()=>{
for(const domain of ['po_factory_stock','overseas_inventory','shipment'])for(const withData of [false,true]){
  const cols=[{key:'row_type',kind:'locked',hidden:true,type:'text'},{key:'id',kind:'locked',hidden:true,type:'text'},{key:'quantity',kind:'editable',type:'number'},
    {key:'warehouse',kind:'required',type:'ref',list:'wh'},{key:'conditional',kind:'locked',type:'text',unlock_if_row_flag:'__editable'}];
  const names=domain==='shipment'?['Header','Lines']:domain==='po_factory_stock'?['StockPO']:['Inventory'];
  const t={schema_version:'TEST',sheets:names.map(name=>({name,instruction:'Import rows',columns:cols,rows:[{id:'ID1',quantity:1,warehouse:'WH',conditional:'yes'}],row_flags:{__editable:[0]},example:{quantity:10}})),lists:{wh:[{value:'WH'}]}};
  const spec=window.KM.importBatch._exportSpec(t,{domain},'TEST',withData);
  assert.equal(spec.extendInputColumns,true);
  const built=await window.KM.templateExport.buildWorkbook(spec),bytes=await built.wb.xlsx.writeBuffer();
  const reloaded=new ExcelJS.Workbook();await reloaded.xlsx.load(bytes);
  for(const name of names){const ws=reloaded.getWorksheet(name);assert(ws.sheetProtection.sheet);assert(ws.rowCount>=202);
    const header=2,first=withData?3:4;
    assert.notEqual(ws.getCell(header,3).protection?.locked,false);
    if(!withData)assert.notEqual(ws.getCell(3,3).protection?.locked,false);
    for(const r of [first,53,202,203,500,5000]){
      assert.equal(ws.getCell(r,3).protection?.locked,false,name+' input '+r);assert.notEqual(ws.getCell(r,2).protection?.locked,false,name+' ID '+r);
    }
    assert.notEqual(ws.getCell(5000,5).protection?.locked,false);
    if(withData)assert.equal(ws.getCell(3,5).protection.locked,false);
    assert.equal(ws.getCell(202,4).dataValidation.type,'list');
    for(let i=0;i<250;i++)ws.getCell(first+i,3).value=i+1;
  }
  const final=new ExcelJS.Workbook();await final.xlsx.load(await reloaded.xlsx.writeBuffer());
  const parsed=await window.KM.importBatch._parseWorkbook(null,t,final);
  for(const name of names)assert.equal(parsed.sheets[name].length,250);
  passed++;console.log('PASS '+domain+' '+(withData?'UPDATE':'ADD_NEW')+' 250-row XLSX roundtrip, locked IDs, extensible column style');
}
const unrelated=window.KM.importBatch._exportSpec({sheets:[{name:'Other',columns:[{key:'q',kind:'editable'}]}]},{domain:'other'},'TEST',false);
assert.equal(unrelated.extendInputColumns,false);
const api={};vm.createContext(api);
for(const f of ['78_api_v1_import_batch.gs','80_api_v1_shipment_import.gs','82_api_v1_po_factory_import.gs'])vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/'+f,'utf8'),api);
vm.runInContext(fs.readFileSync('output/dw2-workflow-20261122/release-4/candidate/Production/apps-script/81_api_v1_inventory_import.gs','utf8'),api);
for(const dom of [api.imbPoFactoryDomain_(),api.imbOverseasInventoryDomain_(),api.imbShipmentDomain_()]){
  const req={mode:dom.modes[0],schema_version:dom.schema_version,import_batch_id:'TEST-BATCH-250',sheets:{[dom.sheets[0]]:Array.from({length:250},()=>({sku:'A',quantity:1}))}};
  assert.equal(api.imbReadRequest_(req,dom).issues.length,0);
  req.sheets[dom.sheets[0]][0].quantity='=1+1';assert(api.imbReadRequest_(req,dom).issues.some(i=>i.code==='IMPORT_CELL_FORMULA'));
  console.log('PASS '+dom.domain+' actual 250-row request gate and formula refusal');
}
console.log('IMPORT_TEMPLATE_R3_PASS '+passed);
})().catch(e=>{console.error(e);process.exitCode=1;});
