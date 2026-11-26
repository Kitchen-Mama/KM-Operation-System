// Draft-only SKU edits. The existing ScriptLock/import journal owns the command.
var WDL_BUILD_VERSION_ = 'WDL1-AUTO-REPRICE-20261126-V2-CANCEL1';
var WDL_SCHEMA_ = 'WEEKLY-DRAFT-LINES-1';
function wdlNo_(code, text) { return jsonResponse_({ success: false, code: code, zero_write: true, error: text || code }); }
function wdlVersion_(cell, token) { var g=editP1Gate15f2_(cell,token);if(g)pfiFail_(g.code);if(editTokSame_(cell,token)!=='SAME')pfiFail_('EDIT_CONFLICT'); }
function wdlGuard_(ss, pid, note) {
  if (String(note || '').indexOf('[WDL1-PENDING:') >= 0) return 'WEEKLY_LINES_OUTCOME_UNKNOWN';
  var sh = ss.getSheetByName('import_batches');
  if (!sh) return String(note || '').indexOf('[WDL1]') >= 0 ? 'WEEKLY_LINES_RECEIPT_UNREADABLE' : '';
  var rows = imbRows_(sh);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], scope; if (String(r.domain) !== 'weekly_draft_lines') continue;
    try { scope = JSON.parse(String(r.scope_key)); } catch (e) { return 'WEEKLY_LINES_RECEIPT_UNREADABLE'; }
    if (scope.shipping_plan_id === pid && ['COMMITTING','UNKNOWN_OUTCOME'].indexOf(String(r.status)) >= 0) return 'WEEKLY_LINES_OUTCOME_UNKNOWN';
  }
  return '';
}
function wdlBeforeStatus_(ss, pid, note, transition) {
  var code = wdlGuard_(ss, pid, note); if (code) return code;
  if (['submit','approve'].indexOf(transition) >= 0) {
    try { mcpLayout_(pmiTable_(ss, 'shipping_plan_lines').rows.filter(function (l) { return String(l.shipping_plan_id) === pid; }), 'plan'); }
    catch (e) { return e.code || 'MIXED_PACKING_INVALID'; }
  }
  if (String(note || '').indexOf('[WDL1]') >= 0 && ['submit','approve'].indexOf(transition) >= 0) {
    var t = pmiTable_(ss, 'shipping_plan_lines');
    if (!t || !t.rows.some(function (l) { return String(l.shipping_plan_id) === pid && Number(l.approved_qty) > 0; })) return 'WEEKLY_PLAN_EMPTY';
  }
  return '';
}
function handleWeeklyDraftLines_(body) {
  var req = { domain: 'weekly_draft_lines', mode: 'EDIT', schema_version: WDL_SCHEMA_, import_batch_id: String(body.request_id || ''),
    scope: { shipping_plan_id: String(body.shipping_plan_id || ''), expected_plan_updated_at: body.expected_plan_updated_at },
    sheets: { Lines: body.line_edits }, actor: body.actor || body.updated_by || 'operation-system', file: { name: 'weekly-draft-editor' } };
  if (body.packing_version !== undefined) {
    if (body.packing_version !== 'MIXED_CARTONS_V1' || !Array.isArray(body.mixed_cartons)) return wdlNo_('MIXED_PACKING_VERSION_INVALID');
    req.scope.packing_version = body.packing_version; req.scope.mixed_cartons = body.mixed_cartons;
    if (JSON.stringify(req.scope).length>40000) return wdlNo_('MIXED_PACKING_LIMIT');
  }
  // A replay must reach the receipt before validating an old version again.
  if (!imbSheets_(imbDb_())) return wdlNo_('IMPORT_SCHEMA_NOT_PROVISIONED');
  var validation = JSON.parse(handleImportValidate_(req).getContent());
  req.preview_digest = validation.preview_digest;
  if (validation.success === false || (validation.valid === false && !validation.receipt)) return jsonResponse_({success:false,code:'WEEKLY_LINES_VALIDATION_FAILED',zero_write:true,writes_performed:0,
    error:'Draft SKU changes were not saved. Review the validation issues.',issues:validation.issues||[]});
  var result = JSON.parse(handleImportCommit_(req).getContent());
  if (result.success) { result.data = result.result; result.data.request_id = req.import_batch_id; }
  if (result.code === 'IMPORT_OUTCOME_UNKNOWN' || result.code === 'IMPORT_BATCH_OUTCOME_UNKNOWN') result.code = 'WEEKLY_LINES_OUTCOME_UNKNOWN';
  return jsonResponse_(result);
}
function wdlTables_(ss) {
  var p = pmiTable_(ss,'shipping_plans'), l = pmiTable_(ss,'shipping_plan_lines');
  if (!p || !l) pfiFail_('WEEKLY_SCHEMA_MISSING');
  ['shipping_plan_id','status','updated_at','note','company','country','marketplace'].forEach(function(k){if(p.col(k)<0)pfiFail_('WEEKLY_SCHEMA_MISSING',k);});
  ['shipping_plan_line_id','shipping_plan_id','sku','approved_qty','updated_at','units_per_carton','plan_carton_qty','note'].forEach(function(k){if(l.col(k)<0)pfiFail_('WEEKLY_SCHEMA_MISSING',k);});
  return {p:p,l:l};
}
function wdlEligibleSkus_(ss, p) {
  var sk = pmiTable_(ss,'sku_details'), ms = pmiTable_(ss,'marketplace_skus'), out = {}, master = {};
  if(!sk || !ms)pfiFail_('WEEKLY_SKU_MASTER_UNREADABLE');
  sk.rows.forEach(function(r){var k=pmiS_(r.sku);if(master[k])master[k]=false;else if(master[k]!==false)master[k]=r;});
  ms.rows.forEach(function(r){
    if(['company','country','marketplace'].some(function(k){return pmiS_(r[k]).toLowerCase()!==pmiS_(p[k]).toLowerCase();}))return;
    var status=pmiS_(r.marketplace_sku_status === undefined ? (r.status || r.product_status || r.is_active) : r.marketplace_sku_status).toLowerCase().replace(/\s+/g,'_'), sku=pmiS_(r.sku), detail=master[sku];
    if(!detail || !/^(active|true|1|running_in_the_market)$/.test(status) || /^(inactive|discontinued|closure)$/i.test(pmiS_(detail.product_status || detail.status)))return;
    if(out[sku])out[sku]=false;else if(out[sku]!==false)out[sku]={detail:detail,site_sku:pmiS_(r.site_sku)};
  });return out;
}
function wdlCheckStock_(ss, p, lines, edits) {
  if (!edits.some(function(e){return e.op==='add'||(e.op==='update'&&Number(e.values.approved_qty)>Number(e.line.approved_qty));})) return null;
  var facts=fsgReadInventoryFacts_(ss,{selfPlanId:p.shipping_plan_id}), wh=pmiS_(p.source_warehouse_id), proposed={}, totals={};
  if(!facts.ok || !facts.eligibleFactoryWarehouseIds[wh] || facts.available.unreadable.length) pfiFail_('WEEKLY_STOCK_UNKNOWN','Factory availability cannot be verified. Reload before editing.');
  lines.forEach(function(l){proposed[l.shipping_plan_line_id]=l;});
  edits.forEach(function(e){var id=e.line?e.line.shipping_plan_line_id:e.obj.shipping_plan_line_id;if(e.op==='remove')delete proposed[id];else proposed[id]=e.obj||Object.assign({},e.line,e.values);});
  Object.keys(proposed).forEach(function(id){var l=proposed[id],q=pfiInt_(l.approved_qty,false),key=KMFSG.poolKey(wh,l.sku,l.inventory_pool_id);if(q===null||!key)pfiFail_('WEEKLY_STOCK_UNKNOWN');totals[key]=(totals[key]||0)+q;});
  Object.keys(totals).forEach(function(key){if(!totals[key])return;var b=facts.available.byPool[key];if(!b||!b.pool_row_found||!isFinite(b.available_to_allocate))pfiFail_('WEEKLY_STOCK_UNKNOWN');
    if(totals[key]>b.available_to_allocate)pfiFail_('WEEKLY_STOCK_INSUFFICIENT',b.sku+': available '+Math.max(0,b.available_to_allocate)+' pcs after reservations and other plans; requested '+totals[key]+'. Adjust the quantity.');});
  return facts.available.fingerprint;
}
function wdlAttachNewSiteSnapshots_(ss,p,edits) {
  var added=edits.filter(function(e){return e.op==='add';}).map(function(e){return e.obj;});
  if(!added.length)return;
  try {
    // This command never reuses Submit's pre-lock snapshot from another path.
    SAD_SNAPSHOT_PREFETCH_1G_=null;
    sadAttachSiteSnapshot_(ss,[{header:p}],added,'');
  }catch(e){added.forEach(function(l){['snapshot_current_stock','snapshot_avg_sales_per_day','snapshot_days_of_supply'].forEach(function(k){l[k]='';});l.snapshot_avg_sales_warning='SITE_SNAPSHOT_UNAVAILABLE';});}
}
function wdlCheckPlanOwnership_(ss, p) {
  var eligibility=spApprovedCancelEligibility_(ss,p.shipping_plan_id,p.transferred_shipment_id,p.transferred_to_shipment_at);
  if(eligibility.ok)return;
  if(eligibility.code!=='SHIPMENT_EXISTS_FOR_PLAN')pfiFail_(eligibility.code,eligibility.message);
  // Cancellation history is retained, but must no longer own a reservation or an executable allocation.
  var ships=pmiTable_(ss,'shipments'),pid=pmiS_(p.shipping_plan_id),refs=['shipping_plan_id','source_shipping_plan_id','plan_id'];
  if(!ships||['shipment_id','status','source_warehouse_id','cancelled_at','cancelled_by'].some(function(k){return ships.col(k)<0;}))pfiFail_('WEEKLY_CANCEL_STATE_UNPROVEN');
  var matches=ships.rows.filter(function(s){return refs.some(function(k){return pmiS_(s[k])===pid;});});
  if(!matches.length)pfiFail_('WEEKLY_CANCEL_STATE_UNPROVEN');
  matches.forEach(function(s){
    var sid=pmiS_(s.shipment_id),source=pmiS_(s.source_warehouse_id);
    if(pmiS_(s.status).toLowerCase()!=='cancelled')pfiFail_('SHIPMENT_EXISTS_FOR_PLAN','A live Shipment still owns this Plan. Cancel it before editing SKUs.');
    if(!sid||!source||!pmiS_(s.cancelled_at)||!pmiS_(s.cancelled_by)||ships.rows.filter(function(x){return pmiS_(x.shipment_id)===sid;}).length!==1)pfiFail_('WEEKLY_CANCEL_STATE_UNPROVEN');
    if(csdMovementExists_(ss,sid)||csdEventExists_(ss,sid)||csdCountRowsFor_(ss,'shipment_routes','shipment_id',sid)>0)pfiFail_('WEEKLY_CANCEL_DISPATCH_EVIDENCE');
    var books=shipmentCancelBooks_(ss,sid,source);if(books.verdict!=='RECONCILED')pfiFail_('WEEKLY_CANCEL_RESERVATION_UNPROVEN','Cancelled shipment reservation books require review.');
    var domain=shipmentSourceDomain_(ss,source);
    [[SHIPMENT_DOMAIN_FACTORY_,'factory_stock_movements'],[SHIPMENT_DOMAIN_OVERSEAS_,'overseas_inventory_movements']].forEach(function(d){
      var mov=ss.getSheetByName(d[1]);if(!mov){if(d[0]===domain)pfiFail_('WEEKLY_CANCEL_RESERVATION_UNPROVEN');return;}
      var held=shipmentDomainHeld_(d[0],{movSheet:mov},sid);
      if(Object.keys(held).some(function(k){return !isFinite(Number(held[k]))||Number(held[k])!==0;}))pfiFail_('WEEKLY_CANCEL_RESERVATION_UNRELEASED');
    });
    if(!ss.getSheetByName('shipment_line_allocations'))pfiFail_('WEEKLY_CANCEL_ALLOCATION_UNPROVEN');
    var allocations=shipCancelAllocPrepare_(ss,sid);
    if(allocations.refuse)pfiFail_('WEEKLY_CANCEL_ALLOCATION_UNPROVEN','Cancelled shipment allocations require review ('+allocations.refuse.code+').');
    if(allocations.rows.length)pfiFail_('WEEKLY_CANCEL_ALLOCATION_UNRELEASED');
  });
}
function wdlValidate_(ss, req) {
  var issues=[];
  try {
    var t=wdlTables_(ss), pid=pmiS_(req.scope.shipping_plan_id), found=t.p.rows.filter(function(p){return pmiS_(p.shipping_plan_id)===pid;});
    if(found.length!==1)pfiFail_('WEEKLY_PLAN_NOT_UNIQUE');var p=found[0];
    if(pmiS_(p.status)!=='draft')pfiFail_('WEEKLY_DRAFT_REQUIRED','Reject Pending Approval back to Draft before editing.');
    if((pmiS_(p.parent_shipping_plan_id) && pmiS_(p.parent_shipping_plan_id)!==pid) || pmiS_(p.marketplace).toUpperCase()==='MULTI')pfiFail_('WEEKLY_COMBINED_PLAN_REQUIRES_UNCOMBINE');
    if(!pmiS_(req.scope.expected_plan_updated_at))pfiFail_('EDIT_TOKEN_REQUIRED');
    wdlVersion_(p.updated_at,req.scope.expected_plan_updated_at);
    var held=wdlGuard_(ss,pid,p.note);if(held)pfiFail_(held);
    wdlCheckPlanOwnership_(ss,p);
    var lines=t.l.rows.filter(function(l){return pmiS_(l.shipping_plan_id)===pid;}), edits=[], seen={}, remaining={}, selectable=wdlEligibleSkus_(ss,p), logi=shippingPlanSkuLogisticsMap_(ss);
    lines.forEach(function(l){if(remaining[pmiS_(l.sku)])pfiFail_('WEEKLY_EXISTING_SKU_DUPLICATE');remaining[pmiS_(l.sku)]=l;});
    (req.sheets.Lines||[]).forEach(function(r){
      if(Object.keys(r).some(function(k){return ['__row','op','shipping_plan_line_id','sku','quantity','expected_updated_at'].indexOf(k)<0;}))pfiFail_('WEEKLY_EDIT_FIELD_UNKNOWN');
      var op=pmiS_(r.op), id=pmiS_(r.shipping_plan_line_id), l, q;
      if(['add','update','remove'].indexOf(op)<0)pfiFail_('WEEKLY_EDIT_OPERATION_INVALID');
      if(op==='add'){
        var sku=pmiS_(r.sku), e=selectable[sku];if(!e)pfiFail_('WEEKLY_SKU_NOT_ACTIVE_AT_SITE');
        if(seen['sku:'+sku] || remaining[sku])pfiFail_('WEEKLY_SKU_DUPLICATE');seen['sku:'+sku]=true;
        q=pfiInt_(r.quantity,true);if(q===null)pfiFail_('WEEKLY_QUANTITY_INVALID');
        var upc=pfiInt_(e.detail.units_per_carton,true);if(upc===null)pfiFail_('WEEKLY_CARTON_QUANTITY_UNKNOWN');
        var obj={};t.l.headers.forEach(function(k){obj[k]='';});
        Object.assign(obj,{shipping_plan_line_id:'SPL-WDL-'+imbSha_(req.id+'|'+sku).slice(0,16).toUpperCase(),shipping_plan_id:pid,sku:sku,site_sku:e.site_sku,
          requested_qty:q,approved_qty:q,units_per_carton:upc,plan_carton_qty:Math.ceil(q/upc),source_page:'weekly_shipping_plan',source_reason:'manual_draft_edit',created_at:'$NOW',updated_at:'$NOW'});
        obj[t.l.col('marketplace')>=0?'marketplace':'marketplace_seperate']=p.marketplace;
        Object.assign(obj,shippingPlanLineLogistics_(logi[sku],q,obj.plan_carton_qty));
        if(t.l.rows.some(function(a){return pmiS_(a.shipping_plan_line_id)===obj.shipping_plan_line_id;}))pfiFail_('WEEKLY_LINE_ID_COLLISION');
        edits.push({op:op,obj:obj});
      }else{
        var hits=lines.filter(function(a){return pmiS_(a.shipping_plan_line_id)===id;});if(hits.length!==1 || seen[id])pfiFail_('WEEKLY_LINE_NOT_UNIQUE');seen[id]=true;l=hits[0];
        if(!pmiS_(r.expected_updated_at))pfiFail_('EDIT_TOKEN_REQUIRED');wdlVersion_(l.updated_at,r.expected_updated_at);
        if(op==='remove'){delete remaining[pmiS_(l.sku)];edits.push({op:op,line:l});}
        else{q=pfiInt_(r.quantity,false);if(q===null)pfiFail_('WEEKLY_QUANTITY_INVALID');var upc=pfiInt_(l.units_per_carton,true);if(upc===null)pfiFail_('WEEKLY_CARTON_QUANTITY_UNKNOWN');
          edits.push({op:op,line:l,values:Object.assign({approved_qty:q,plan_carton_qty:Math.ceil(q/upc)},shippingPlanLineLogistics_(logi[pmiS_(l.sku)],q,Math.ceil(q/upc)))});}
      }
    });
    if(!edits.length)pfiFail_('WEEKLY_EDIT_EMPTY');
    if (req.scope.packing_version) wdlPackEdits_(ss, p, lines, edits, req.scope.mixed_cartons);
    else if (lines.some(function (l) { return String(l.note).indexOf('[KMPACK1:') >= 0; })) pfiFail_('MIXED_CARTON_EDITOR_REQUIRED');
    var stockFingerprint=wdlCheckStock_(ss,p,lines,edits);
    var summary=edits.map(function(e){return {op:e.op,id:e.line?e.line.shipping_plan_line_id:e.obj.shipping_plan_line_id,sku:e.line?e.line.sku:e.obj.sku,quantity:e.op==='remove'?0:e.values?e.values.approved_qty:e.obj.approved_qty};});
    var note=pmiS_(p.note)+(pmiS_(p.note)?'\n':'')+'[WDL1] '+JSON.stringify({request:req.id,edits:summary});if(note.length>45000)pfiFail_('WEEKLY_AUDIT_NOTE_FULL');
    var plan={pid:pid,plan_row:p.__r,old:p,note:note,edits:edits,rollback:wdlSnapshot_(ss),stamp:editNextStamp_(shippingPlanTimestamp_(),[p.updated_at].concat(lines.map(function(l){return l.updated_at;})))};
    return {issues:[],plan:plan,state:JSON.parse(JSON.stringify({plan:p,lines:t.l.rows,headers:t.l.headers,skus:selectable,stock_fingerprint:stockFingerprint})),preview:{counts:{update:edits.length},rows:summary}};
  }catch(e){issues.push({code:e.importCode||'WEEKLY_EDIT_INVALID',message:String(e.message||e)});return {issues:issues,plan:null,state:{},preview:{counts:{reject:1},rows:[]}};}
}
function wdlSnapshot_(ss){return ['shipping_plans','shipping_plan_lines'].map(function(n){return[n,ss.getSheetByName(n).getDataRange().getValues()];});}
function wdlApply_(ss,plan,ctx){
  var t=wdlTables_(ss),J=ctx.journal,now=plan.stamp,ph=t.p.headers,lh=t.l.headers;
  if (typeof spRcPricingSnapshot_ !== 'function') pfiFail_('DEPLOYMENT_HALF_SYNCED');
  if (String(plan.old.carrier_rate_type || '').indexOf(SP_RC_PENDING_1G_) === 0) pfiFail_('RATE_CARD_SELECTION_PENDING');
  var proposed = {};
  t.l.rows.filter(function(l){return pmiS_(l.shipping_plan_id)===plan.pid;}).forEach(function(l){proposed[l.shipping_plan_line_id]=l;});
  plan.edits.forEach(function(e){var id=e.line?e.line.shipping_plan_line_id:e.obj.shipping_plan_line_id;
    if(e.op==='remove')delete proposed[id];else proposed[id]=e.obj||Object.assign({},e.line,e.values);});
  // Price the final packing inside the import lock, before the first journalled mutation.
  var pricing=spRcPricingSnapshot_(ss,plan.old,Object.keys(proposed).map(function(id){return proposed[id];}),shippingPlanToday_());
  Object.keys(pricing.fields).forEach(function(k){if(ph.indexOf(k)<0)pfiFail_('SHIPPING_PLAN_COLUMNS_MISSING',k);});
  wdlAttachNewSiteSnapshots_(ss,plan.old,plan.edits);
  function setP(k,v){var c=ph.indexOf(k);if(c>=0)J.setCell(t.p.sheet,plan.plan_row,c,v);}
  setP('note','[WDL1-PENDING:'+ctx.batch_id+']\n'+pmiS_(plan.old.note));setP('updated_at',now);
  plan.edits.filter(function(e){return e.op==='update';}).forEach(function(e){
    Object.keys(e.values).forEach(function(k){var c=lh.indexOf(k);if(c<0)pfiFail_('WEEKLY_LOGISTICS_COLUMN_MISSING',k);J.setCell(t.l.sheet,e.line.__r,c,e.values[k]);});
    J.setCell(t.l.sheet,e.line.__r,lh.indexOf('updated_at'),now);
    J.change({entity_table:'shipping_plan_lines',entity_id:plan.pid,line_id:e.line.shipping_plan_line_id,field:'approved_qty',before:e.line.approved_qty,after:e.values.approved_qty});
    if (Object.prototype.hasOwnProperty.call(e.values,'note') && String(e.line.note)!==String(e.values.note)) J.change({entity_table:'shipping_plan_lines',entity_id:plan.pid,line_id:e.line.shipping_plan_line_id,field:'packing_metadata',before:e.line.note,after:e.values.note});
  });
  plan.edits.filter(function(e){return e.op==='remove';}).sort(function(a,b){return b.line.__r-a.line.__r;}).forEach(function(e){
    J.deleteRow(t.l.sheet,e.line.__r);J.change({entity_table:'shipping_plan_lines',entity_id:plan.pid,line_id:e.line.shipping_plan_line_id,field:'removed_line',before:JSON.stringify(e.line),after:'REMOVED'});
  });
  plan.edits.filter(function(e){return e.op==='add';}).forEach(function(e){var o=Object.assign({},e.obj);o.created_at=now;o.updated_at=now;J.appendRow(t.l.sheet,lh,o);J.change({entity_table:'shipping_plan_lines',entity_id:plan.pid,line_id:o.shipping_plan_line_id,field:'added_line',before:'',after:JSON.stringify(o)});});
  Object.keys(pricing.fields).forEach(function(k){setP(k,pricing.fields[k]);
    J.change({entity_table:'shipping_plans',entity_id:plan.pid,field:k,before:plan.old[k],after:pricing.fields[k]});});
  setP('updated_by',ctx.actor);SpreadsheetApp.flush();
  var fresh=wdlTables_(ss),rows=fresh.l.rows.filter(function(l){return pmiS_(l.shipping_plan_id)===plan.pid;});
  plan.edits.forEach(function(e){var id=e.line?e.line.shipping_plan_line_id:e.obj.shipping_plan_line_id,h=rows.filter(function(l){return l.shipping_plan_line_id===id;});
    if(e.op==='remove'){if(h.length)pfiFail_('WEEKLY_EDIT_READBACK_FAILED');}else{var q=e.op==='add'?e.obj.approved_qty:e.values.approved_qty;if(h.length!==1||Number(h[0].approved_qty)!==q)pfiFail_('WEEKLY_EDIT_READBACK_FAILED');
      var expected=e.obj||e.values;Object.keys(expected).forEach(function(k){if(['note','plan_carton_qty','cbm','gross_weight','net_weight'].indexOf(k)>=0&&String(h[0][k])!==String(expected[k]))pfiFail_('WEEKLY_EDIT_READBACK_FAILED',k);});}});
  var saved=fresh.p.rows.filter(function(p){return pmiS_(p.shipping_plan_id)===plan.pid;});
  if(saved.length!==1||Object.keys(pricing.fields).some(function(k){return String(saved[0][k])!==String(pricing.fields[k]);}))pfiFail_('WEEKLY_PRICING_READBACK_FAILED');
  setP('note',plan.note);SpreadsheetApp.flush();
  return {result:{shipping_plan_id:plan.pid,updated_at:editTokWritten15f2_(now),edit_count:plan.edits.length,
    pricing_recalculated:true,priced:pricing.priced,repricing_required:!pricing.priced,unpriced_reason:pricing.unpriced_reason,
    rate_card_id:pricing.rate_card_id,readback_verified:true}};
}
function wdlVerifyRollback_(ss,plan){return JSON.stringify(wdlSnapshot_(ss))===JSON.stringify(plan.rollback);}
function wdlMarkUnknown_(ss,plan,req){var t=wdlTables_(ss);t.p.sheet.getRange(plan.plan_row,t.p.col('note')+1).setValue('[WDL1-PENDING:'+req.id+']\n'+pmiS_(plan.old.note));}
function imbWeeklyDraftDomain_(){return {domain:'weekly_draft_lines',schema_version:WDL_SCHEMA_,modes:['EDIT'],sheets:['Lines'],maxRows:300,validate:wdlValidate_,apply:wdlApply_,verifyRollback:wdlVerifyRollback_,onUnknown:wdlMarkUnknown_};}

function mcpRecords_(lines, kind) {
  return lines.map(function (l) { return { id: String(l.shipment_line_id || l.shipping_plan_line_id), sku: String(l.sku),
    quantity: kind === 'plan' ? l.approved_qty : l.shipment_qty,
    cartons: kind === 'plan' ? l.plan_carton_qty : l.shipment_carton_qty,
    cbm: kind === 'plan' || kind === 'snapshot' ? l.cbm : l.shipment_carton_cbm,
    grossKg: l.gross_weight, netKg: l.net_weight, note: l.note, source: l,
    unitValue: l.declared_unit_value, currency: l.declared_currency, hsCode: l.hs_code, origin: l.country_of_origin }; });
}
function mcpLayout_(lines, kind) {
  if (!lines.some(function (l) { return String(l.note).indexOf('[KMPACK1:') >= 0; })) return null;
  if (typeof KMPACK === 'undefined') throw new Error('MIXED_PACKING_BACKEND_INCOMPLETE');
  return KMPACK.layout(mcpRecords_(lines, kind));
}
function mcpShipment_(ss, sid) {
  var t = pmiTable_(ss, 'shipment_lines');
  if (!t) throw new Error('MIXED_PACKING_LINES_UNREADABLE');
  return mcpLayout_(t.rows.filter(function (l) { return String(l.shipment_id) === String(sid) && !(typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(l)); }), 'shipment');
}
function wdlPackEdits_(ss, p, lines, edits, requested) {
  if (typeof KMPACK === 'undefined') pfiFail_('MIXED_PACKING_BACKEND_INCOMPLETE');
  var proposed = {}, master = {}, bySku = {}, editById = {};
  pmiTable_(ss,'sku_details').rows.forEach(function (r) { var key = String(r.sku); master[key] = Object.prototype.hasOwnProperty.call(master,key) ? false : r; });
  lines.forEach(function (l) { proposed[l.shipping_plan_line_id] = l; });
  edits.forEach(function (e) {
    var id = e.line ? e.line.shipping_plan_line_id : e.obj.shipping_plan_line_id;
    editById[id] = e;
    if (e.op === 'remove') delete proposed[id]; else proposed[id] = e.obj || Object.assign({}, e.line, e.values);
  });
  function kg(value, unit) {
    var f = { kg:1, g:0.001, lb:0.45359237, lbs:0.45359237, oz:0.028349523125 }[String(unit || 'kg').toLowerCase()];
    return value === '' || value == null || !f || !isFinite(Number(value)) ? null : Number(value) * f;
  }
  var inputs = Object.keys(proposed).map(function (id) {
    var l = proposed[id], m = master[String(l.sku)]; if (!m) pfiFail_('MIXED_SKU_MASTER_NOT_UNIQUE',l.sku);
    bySku[String(l.sku)] = id;
    return { id:id, sku:String(l.sku), quantity:l.approved_qty, unitsPerCarton:l.units_per_carton, note:l.note, series:m.series,
      itemKg:kg(m.item_weight,m.item_weight_unit), box:{ length:m.carton_length, width:m.carton_width, height:m.carton_height,
        unit:m.carton_dimension_unit || 'cm', grossKg:kg(m.carton_weight,m.carton_weight_unit) } };
  });
  var groups = requested.map(function (g) {
    if (Object.keys(g).some(function (k) { return ['id','representative_sku','members'].indexOf(k)<0; })) pfiFail_('MIXED_PACKING_FIELD_INVALID');
    if (!Array.isArray(g.members)) pfiFail_('MIXED_PACKING_MEMBERS_REQUIRED');
    var prefix = String(p.shipping_plan_id) + ':';
    return { id:String(g.id).indexOf(prefix)===0 ? String(g.id) : prefix + String(g.id), representativeId:bySku[g.representative_sku],
      members:g.members.map(function (m) { return { lineId:bySku[m.sku], quantity:m.quantity }; }) };
  });
  var packed; try { packed=KMPACK.annotate(inputs,groups); } catch(e) { pfiFail_(e.code || 'MIXED_PACKING_INVALID',e.message); }
  packed.forEach(function (r) {
    var e = editById[r.id], l = proposed[r.id];
    if (!e) { e={op:'update',line:l,values:{approved_qty:Number(l.approved_qty)}};edits.push(e); }
    var v = { plan_carton_qty:r.ownedCartons, cbm:r.cbm===null?'':r.cbm,
      gross_weight:r.grossKg===null?'':r.grossKg, net_weight:r.netKg===null?'':r.netKg, note:r.note };
    Object.assign(e.obj || e.values,v);
  });
}
