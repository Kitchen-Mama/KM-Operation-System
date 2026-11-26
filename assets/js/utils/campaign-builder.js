(function () {
  'use strict';
  var KM=window.KM=window.KM||{}, current=null;
  var VERSION='campaign-builder-20261125-v1';
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function error(r){var e=r&&r.error;return e&&typeof e==='object'?(e.message||e.code):String(e||r&&r.code||'Unable to complete request.');}
  function open(options) {
    if(current){current.dialog.showModal();return;}
    var C=KM.campaignBuilderCore,opts=options||{},d=document.createElement('dialog');d.className='cb-dialog';d.setAttribute('aria-label',opts.origin==='promotion'?'Add Promotion':'Add Special Event');
    var S={dialog:d,rows:[],catalog:[],data:null,sites:[],scope:null,preview:null,busy:false,unknown:false,saved:false,token:0,requestId:null};current=S;
    var q=function(id){return d.querySelector('[data-cb="'+id+'"]');};
    var val=function(id){return q(id).value;};
    function status(text,bad){q('status').textContent=text;q('status').className=bad?'cb-status cb-error':'cb-status';}
    function option(v,label){return '<option value="'+esc(v)+'">'+esc(label==null?v:label)+'</option>';}
    function optionsHTML(values){return values.map(function(v){return option(v);}).join('');}
    function close(){if(S.busy)return;S.token++;d.close();d.remove();if(current===S)current=null;}
    function dirty(){S.preview=null;S.requestId=null;q('preview').hidden=true;q('save').hidden=true;q('review').hidden=false;}
    function pendingKey(){return 'km.campaign.pending.v1:'+JSON.stringify(S.scope&&[S.scope.company,S.scope.country,S.scope.marketplace_id]);}
    function remember(id){try{if(id)sessionStorage.setItem(pendingKey(),id);else sessionStorage.removeItem(pendingKey());}catch(e){}}
    function lock(on){S.busy=on;d.setAttribute('aria-busy',String(on));d.querySelectorAll('input,select,button').forEach(function(el){el.disabled=on||S.unknown||S.saved;});q('close').disabled=on;q('cancel').disabled=on;
      if(S.unknown||S.saved)q('check').disabled=on;
    }
    function scopePayload(){return Object.assign({},S.scope,{campaign_name:val('name').trim(),promotion_type:val('type'),event_flag:val('flag'),start_date:val('start'),end_date:val('end'),source:opts.origin==='promotion'?'promotion_risk_builder':'fc_summary_builder',source_campaign_id:val('method')==='history'?val('history'):'',growth_pct:val('growth'),discount_pct:val('discount')});}
    function payloadRows(){return S.rows.map(function(r){return {marketplace_sku_id:r.marketplaceSkuId,sku:r.sku,regular_price:r.regularPrice,price_units:r.currency,promo_price:r.dealPrice,fc_qty:r.newFc};});}
    function candidates(){return S.data?C.history(S.data,S.scope,val('type'),val('start'),S.data.today):[];}
    function history(){var old=val('history');q('history').innerHTML=option('','Select campaign')+candidates().map(function(c){var get=C.get;return option(get(c,'campaign_id','campaignId'),get(c,'campaign_name','campaignName')+' / '+get(c,'start_date','startDate')+' - '+get(c,'end_date','endDate'));}).join('');q('history').value=old;}
    function filters(){var cat=val('category'),series=val('series');q('category').innerHTML=option('','All Categories')+optionsHTML(Array.from(new Set(S.catalog.map(function(r){return r.category;}))).sort());q('category').value=cat;
      q('series').innerHTML=option('','All Series')+optionsHTML(Array.from(new Set(S.catalog.filter(function(r){return !val('category')||r.category===val('category');}).map(function(r){return r.series;}))).sort());q('series').value=series;
      q('sku').innerHTML=option('','Select SKU')+S.catalog.map(function(r){return option(r.marketplaceSkuId,r.sku+(r.siteSku?' / '+r.siteSku:''));}).join('');}
    function fresh(r){return Object.assign({},r,{newFc:'',baseFc:null,discountPct:'',dealPrice:r.regularPrice==null?'':r.regularPrice});}
    function rowCells(r,i){return '<tr data-row="'+i+'"><td>'+esc(r.sku)+'</td><td>'+esc(r.regularPrice==null?'Missing price':r.regularPrice+' '+r.currency)+'</td>'+
      '<td><input aria-label="'+esc(r.sku)+' Discount %" data-field="discountPct" type="number" min="0" max="99.99" step="any" value="'+esc(r.discountPct)+'"></td>'+
      '<td><input aria-label="'+esc(r.sku)+' Deal Price" data-field="dealPrice" type="number" min="0" step="any" value="'+esc(r.dealPrice)+'"></td>'+
      '<td>'+esc(r.baseFc==null?'--':r.baseFc)+'</td><td><input aria-label="'+esc(r.sku)+' Forecast Qty" data-field="newFc" type="number" min="1" step="1" value="'+esc(r.newFc)+'"></td>'+
      '<td data-diff>'+esc(r.baseFc==null||r.newFc===''?'--':Number(r.newFc)-r.baseFc)+'</td><td><button type="button" data-remove="'+i+'" title="Remove '+esc(r.sku)+'" aria-label="Remove '+esc(r.sku)+'">&times;</button></td></tr>';}
    function render(){var groups=Object.create(null);S.rows.forEach(function(r,i){var key=[r.category,r.series,r.currency].join('\u001f');if(!groups[key])groups[key]={r:r,rows:[]};groups[key].rows.push(rowCells(r,i));});
      q('cards').innerHTML=Object.keys(groups).map(function(key,i){var g=groups[key];return '<article class="cb-group"><header><strong>'+esc(g.r.category)+' / '+esc(g.r.series)+'</strong><span>'+esc(g.r.currency)+'</span><label>Discount % <input type="number" min="0" max="99.99" step="any" data-group-discount="'+i+'" aria-label="'+esc(g.r.series)+' Group Discount %"></label><button type="button" data-group-apply="'+i+'">Apply</button><button type="button" data-group-remove="'+i+'" aria-label="Remove '+esc(g.r.series)+' group" title="Remove group">&times;</button></header><div class="cb-table-wrap"><table><thead><tr><th>SKU</th><th>Regular</th><th>Disc %</th><th>Deal</th><th>Base Event FC</th><th>New Event FC</th><th>Diff</th><th></th></tr></thead><tbody>'+g.rows.join('')+'</tbody></table></div></article>';}).join('')||'<p class="cb-empty">No SKU rows.</p>';
      S.groups=Object.keys(groups).map(function(k){var g=groups[k];return S.rows.filter(function(r){return r.category===g.r.category&&r.series===g.r.series&&r.currency===g.r.currency;});});
      q('count').textContent=S.rows.length+' SKUs';
    }
    async function load(scope) {
      var token=++S.token;S.data=null;S.rows=[];S.catalog=[];dirty();render();lock(true);status('Loading campaign data...');
      try {var r=await KM.DB.getCampaignBuilder(scope||{});if(token!==S.token)return;if(!r.success)throw Error(error(r));var data=r.data;
        S.sites=data.sites||[];var countries=Array.from(new Set(S.sites.map(function(s){return s.country;}))).sort();q('country').innerHTML=option('','Select Country')+optionsHTML(countries);
        if(scope)q('country').value=scope.country;siteOptions(scope&&scope.marketplace_id);
        if(scope){S.scope=scope;S.data=data;S.catalog=C.catalog(data,scope);filters();history();var missing=C.missingForecasts(data,scope,data.today);q('missing').textContent=(missing.length?'Missing period FC: '+missing.map(function(x){return x.sku+' ('+x.campaignId+')';}).join(', '):'')+(opts.missingLocalCount?' Local-only promotions without canonical FC: '+opts.missingLocalCount+'.':'');status('');
          try{var pending=sessionStorage.getItem(pendingKey());if(pending){S.requestId=pending;S.unknown=true;q('check').hidden=false;status('A previous save is unconfirmed. Check Save Status before creating another campaign.',true);}}catch(storageError){}
        }
        else status('Select Country and Marketplace.');
      }catch(e){if(token===S.token){status(e.message,true);q('retry').hidden=false;}}
      finally {if(token===S.token){lock(false);if(opts.lockScope){q('country').disabled=true;q('site').disabled=true;}}}
    }
    function siteOptions(mid){q('site').innerHTML=option('','Select Marketplace')+S.sites.filter(function(s){return s.country===val('country');}).map(function(s){return option(s.marketplace_id,s.marketplace+' / '+s.company);}).join('');if(mid)q('site').value=mid;}
    function chooseSite(){var site=S.sites.find(function(s){return String(s.marketplace_id)===val('site');});if(site)load(Object.assign({},site));else{S.scope=null;S.data=null;S.rows=[];S.catalog=[];dirty();render();}}
    function applyDiscount(rows,pct){if(String(pct).trim()==='')throw Error('Discount % is required.');var edits=rows.map(function(r){return r.regularPrice==null?null:C.discount(r.regularPrice,pct,r.currency);});rows.forEach(function(r,i){r.discountPct=pct;r.dealPrice=edits[i]==null?'':edits[i];});dirty();render();}
    function mode(){q('batch').hidden=val('mode')!=='batch';q('single').hidden=val('mode')!=='single';}
    function method(){q('past').hidden=val('method')!=='history';history();}
    async function review(){if(opts.ensureRisk)await opts.ensureRisk();if(current!==S)return;if(!S.data||!S.scope)throw Error('Select a site and load campaign data first.');var s=scopePayload(),v=C.validate(s,payloadRows(),S.data),today=S.data.today;
      if(s.end_date<today)throw Error('Campaign end date is in the past.');var warnings=[];
      if(typeof window.calculateSkuRisk==='function'){
        var headers={};S.data.campaigns.forEach(function(c){headers[c.campaign_id]=c;});
        var promos=S.data.campaignSkuLines.filter(function(l){var c=headers[l.campaign_id]||{};return C.same(c,S.scope)&&!(/^(cancelled|canceled|deleted|inactive|draft|rejected)$/i.test(c.status||''))&&!(/^(cancelled|canceled|deleted|inactive)$/i.test(l.line_status||''));}).map(function(l){var c=headers[l.campaign_id]||{};return {sku:l.sku,marketplaceSkuId:l.marketplace_sku_id,startDate:c.start_date,endDate:c.end_date,eventFlag:c.event_flag||c.major_event_flag};});
        if(typeof window._crEventPromotions_==='function')promos=promos.concat(window._crEventPromotions_((S.data.fcSpecialEvents||[]).map(normalizeFcSpecialEventRecord),S.scope));
        var proposed=v.rows.map(function(r){return {sku:r.sku,marketplaceSkuId:r.marketplaceSkuId,startDate:s.start_date,endDate:s.end_date,eventFlag:s.event_flag};});
        v.rows.forEach(function(r){var risk=window.calculateSkuRisk(r.marketplaceSkuId,r.sku,promos.concat(proposed),{scope:S.scope,anchorDate:s.start_date});if(risk.riskLevel!=='Safe')warnings.push(r.sku+': '+risk.riskLevel);if(risk.partial)warnings.push(r.sku+': partial sales history');});
      }
      S.preview={scope:s,lines:payloadRows(),warnings:warnings};q('preview').hidden=false;q('preview').textContent=v.rows.length+' SKUs / '+v.rows.reduce(function(sum,r){return sum+r.fcQty;},0)+' FC / '+v.start+' - '+v.end+(v.skipped?' / '+v.skipped+' skipped':'')+'.'+(warnings.length?' Promotion risk: '+warnings.join('; '):'');q('save').hidden=false;q('review').hidden=true;status('');}
    async function refresh(result){
      var r=await KM.DB.getCampaignBuilder(S.scope);if(!r.success)throw Error(error(r));var data=r.data,id=result.campaign_id;
      var h=data.campaigns.filter(function(c){return c.campaign_id===id;}),lines=data.campaignSkuLines.filter(function(l){return l.campaign_id===id;}),events=data.fcSpecialEvents.filter(function(e){return e.campaign_id===id;});
      if(h.length!==1||lines.length!==result.sku_count||events.length!==result.fc_count||!events.every(function(e){return lines.some(function(l){return l.campaign_sku_line_id===e.campaign_sku_line_id&&l.sku===e.sku;});}))throw Error('Campaign readback is incomplete.');
      S.saved=true;S.unknown=false;S.result=result;remember(null);status('Saved: '+id+' / '+events.length+' period forecasts.');q('check').hidden=true;
      if(opts.onSaved)await opts.onSaved(data);
    }
    async function save(){if(S.busy||S.saved||S.unknown||!S.preview)return;if(S.preview.warnings.length&&!window.confirm(S.preview.warnings.join('\n')+'\nContinue saving this campaign?'))return;lock(true);status('Saving campaign and forecasts...');
      if(!S.requestId)S.requestId='CB-'+(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));
      remember(S.requestId);
      var refused=false;
      try {var r=await KM.DB.saveCampaignBundle({builder_version:C.VERSION,request_id:S.requestId,scope:S.preview.scope,lines:S.preview.lines});
        if(!r.success){var e=r.error||{},detail=e.details||{};refused=detail.zero_write===true;if(!refused){S.unknown=true;q('check').hidden=false;}
          throw Error((detail.issues||[]).map(function(i){return i.message||i.code;}).join('; ')||error(r));}
        if(!r.data||r.data.readback_verified!==true)throw Error('Save receipt is not confirmed.');S.result=r.data;S.saved=true;await refresh(r.data);
      }catch(e){if(!S.saved&&!refused){S.unknown=true;q('check').hidden=false;}if(refused)remember(null);
        status((S.saved?'Saved; view refresh failed: ':S.unknown?'Outcome unconfirmed; do not submit again. ':'')+e.message,true);if(S.saved)q('check').hidden=false;
      }finally{lock(false);}}
    async function check(){if(S.busy)return;lock(true);status('Checking saved receipt...');
      try{if(S.result){await refresh(S.result);return;}var r=await KM.DB.getCampaignBuilderStatus(S.requestId);if(!r.success)throw Error(error(r));var receipt=r.data.receipt;
        if(receipt.status==='COMMITTED'){var result=JSON.parse(receipt.result_json);S.saved=true;S.result=result;await refresh(result);}
        else if(receipt.status==='FAILED_ROLLED_BACK'){S.unknown=false;remember(null);dirty();status('The server rolled back this save. Review the campaign before saving again.',true);q('check').hidden=true;}
        else status('Receipt status: '+receipt.status+'. No second save was sent.',true);
      }catch(e){status('Receipt check failed: '+e.message+'. No second save was sent.',true);}finally{lock(false);}}
    d.innerHTML='<form method="dialog"><header class="cb-heading"><h2>'+esc(opts.origin==='promotion'?'Add Promotion':'Add Special Event')+'</h2><button type="button" data-cb="close" aria-label="Close" title="Close">&times;</button></header><div class="cb-body">'+
      '<section><h3>Scope</h3><div class="cb-grid"><label>Country<select data-cb="country"></select></label><label>Marketplace<select data-cb="site"></select></label></div></section>'+
      '<section><h3>Campaign Info</h3><div class="cb-grid"><label>Campaign Name<input data-cb="name" maxlength="200"></label><label>Promotion Type<select data-cb="type">'+option('','Select Promotion Type')+optionsHTML(C.TYPES)+'</select></label><label>Event Flag<select data-cb="flag">'+optionsHTML(C.FLAGS)+'</select></label><label>Target Year<output data-cb="year">--</output></label><label>Start Date<input data-cb="start" type="date" required></label><label>End Date<input data-cb="end" type="date" required></label></div></section>'+
      '<section><h3>Builder Mode</h3><div class="cb-segments"><label><input type="radio" name="cb-mode" value="single" checked>Single SKU</label><label><input type="radio" name="cb-mode" value="batch">Category / Series</label></div><input data-cb="mode" type="hidden" value="single">'+
      '<div data-cb="single" class="cb-inline"><select data-cb="sku" aria-label="Select SKU"></select><button type="button" data-cb="add">+ Add SKU</button></div><div data-cb="batch" hidden><div class="cb-grid"><label>Category<select data-cb="category"></select></label><label>Series<select data-cb="series"></select></label></div><button type="button" data-cb="build">Build / Refresh Group Cards</button></div></section>'+
      '<section><h3>Price and Forecast</h3><div class="cb-grid"><label>Discount %<input data-cb="discount" type="number" min="0" max="99.99" step="any"></label><button type="button" data-cb="discount-apply">Apply Discount to Cards</button><label>Method<select data-cb="method">'+option('manual','Manual Entry')+option('history','Apply from previous campaign')+'</select></label></div><div data-cb="past" hidden><label>Previous Campaign<select data-cb="history"></select></label><div class="cb-grid"><label>FC Growth %<input data-cb="growth" type="number" step="any" value="0"></label><button type="button" data-cb="history-apply">Apply Campaign</button></div></div></section>'+
      '<div data-cb="missing" class="cb-missing"></div><h3>Group Cards <span data-cb="count"></span></h3><div data-cb="cards"></div><div data-cb="preview" class="cb-preview" hidden></div><p data-cb="status" role="status" aria-live="polite"></p><button type="button" data-cb="retry" hidden>Retry Load</button><button type="button" data-cb="check" hidden>Check Save Status</button></div><footer>'+ (opts.onExisting?'<button type="button" data-cb="existing">Existing Events</button>':'')+'<button type="button" data-cb="cancel">Close</button><button type="button" data-cb="review" class="cb-primary">Preview &amp; Validate</button><button type="button" data-cb="save" class="cb-primary" hidden>Save Campaign</button></footer></form>';
    document.body.appendChild(d);d.showModal();
    d.addEventListener('cancel',function(e){e.preventDefault();close();});
    d.addEventListener('submit',function(e){e.preventDefault();});
    d.addEventListener('input',function(e){if(S.busy||S.saved||S.unknown)return;dirty();var el=e.target,tr=el.closest('[data-row]');if(tr&&el.dataset.field){var r=S.rows[Number(tr.dataset.row)],field=el.dataset.field;r[field]=el.value;
        try{if(field==='discountPct'){r.dealPrice=el.value===''||r.regularPrice==null?'':C.discount(r.regularPrice,el.value,r.currency);tr.querySelector('[data-field="dealPrice"]').value=r.dealPrice;}
          if(field==='dealPrice'){r.discountPct=el.value===''||!r.regularPrice?'':Math.round((1-Number(el.value)/r.regularPrice)*1000000)/10000;tr.querySelector('[data-field="discountPct"]').value=r.discountPct;}
          tr.querySelector('[data-diff]').textContent=r.baseFc==null||r.newFc===''?'--':Number(r.newFc)-r.baseFc;status('');
        }catch(err){status(err.message,true);}}});
    d.addEventListener('change',function(e){if(S.busy||S.saved||S.unknown)return;var el=e.target;dirty();
      if(el.name==='cb-mode'){if(el.value==='single'&&S.rows.length>8){d.querySelector('input[name="cb-mode"][value="batch"]').checked=true;status('Remove rows before switching to Single SKU (maximum 8).',true);return;}q('mode').value=el.value;mode();}
      if(el===q('country')){siteOptions();chooseSite();}
      if(el===q('site'))chooseSite();
      if(el===q('category'))filters();
      if(el===q('method'))method();
      if(el===q('start')||el===q('type')){history();q('year').textContent=val('start').slice(0,4)||'--';}
    });
    d.addEventListener('click',function(e){var el=e.target.closest('button');if(!el||el.disabled)return;
      try{var id=el.dataset.cb;if(id==='close'||id==='cancel'){close();return;}if(id==='existing'){close();opts.onExisting();return;}if(id==='retry'){q('retry').hidden=true;load(S.scope);return;}if(id==='check'){check();return;}if(id==='save'){save();return;}
        if(S.busy||S.saved||S.unknown)return;
        if(id==='review'){review().catch(function(err){status(err.message,true);});return;}
        if(!S.data)throw Error('Load a site first.');
        if(id==='add'){if(S.rows.length>=8&&val('mode')==='single')throw Error('Single SKU mode allows up to 8 rows.');var row=S.catalog.find(function(r){return r.marketplaceSkuId===val('sku');});if(!row)throw Error('Select a SKU.');if(S.rows.some(function(r){return r.marketplaceSkuId===row.marketplaceSkuId;}))throw Error('SKU already added.');S.rows.push(fresh(row));dirty();render();}
        if(id==='build'){var old={};S.rows.forEach(function(r){old[r.marketplaceSkuId]=r;});S.rows=S.catalog.filter(function(r){return (!val('category')||r.category===val('category'))&&(!val('series')||r.series===val('series'));}).map(function(r){return old[r.marketplaceSkuId]||fresh(r);});dirty();render();}
        if(id==='discount-apply')applyDiscount(S.rows,val('discount'));
        if(id==='history-apply'){S.rows=C.applyHistory(S.data,S.scope,val('history'),val('type'),val('start'),S.data.today,S.catalog,val('growth'),val('discount'));q('mode').value='batch';d.querySelector('input[name="cb-mode"][value="batch"]').checked=true;mode();dirty();render();status(S.rows.length+' participating SKUs loaded.');}
        if(el.hasAttribute('data-remove')){S.rows.splice(Number(el.dataset.remove),1);dirty();render();}
        if(el.hasAttribute('data-group-apply'))applyDiscount(S.groups[Number(el.dataset.groupApply)],d.querySelector('[data-group-discount="'+el.dataset.groupApply+'"]').value);
        if(el.hasAttribute('data-group-remove')){var removed=S.groups[Number(el.dataset.groupRemove)];S.rows=S.rows.filter(function(r){return removed.indexOf(r)<0;});dirty();render();}
      }catch(err){status(err.message,true);}});
    mode();method();render();load(opts.scope&&opts.scope.marketplace_id?opts.scope:null);
  }
  KM.campaignBuilder={open:open,version:VERSION};
})();
