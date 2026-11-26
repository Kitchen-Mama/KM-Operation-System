(function(root){
    'use strict';
    var KM=root.KM=root.KM||{},mounted=false,state={rows:[],filters:{},page:1,size:25,start:'',end:'',flight:null,revision:0};
    var fields=['company','marketplace','country','category','series','promotionType'];
    function str(v){return String(v==null?'':v).trim();}
    function esc(v){return str(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function el(id){return document.getElementById('co-'+id);}
    function day(v){return str(v).slice(0,10);}
    function join(data){
        var headers=Object.create(null),skus=Object.create(null),out=[];
        (data.campaigns||[]).forEach(function(c){if(headers[c.campaignId])throw Error('CAMPAIGN_IDENTITY_AMBIGUOUS');headers[c.campaignId]=c;});
        (data.skuDetails||[]).forEach(function(s){skus[s.sku]=s;});
        (data.campaignSkuLines||[]).forEach(function(l){var c=headers[l.campaignId];if(!c)return;
            var m=skus[l.sku]||{};out.push({sku:l.sku,company:c.company,marketplace:c.marketplace,country:c.country,category:m.category||m.productCategory,
                series:m.series||m.productSeries,promotionType:c.promotionType,eventType:c.majorEventFlag||c.eventFlag,
                campaignName:c.campaignName,start:day(c.startDate),end:day(c.endDate),status:l.lineStatus||c.status,campaignId:c.campaignId});
        });
        return out.sort(function(a,b){return b.start.localeCompare(a.start)||str(a.campaignName).localeCompare(str(b.campaignName))||str(a.sku).localeCompare(str(b.sku));});
    }
    function filtered(rows,filters,start,end){return rows.filter(function(r){return fields.every(function(k){return !filters[k]||str(r[k])===filters[k];})&&
        (!filters.sku||str(r.sku).toLowerCase().indexOf(filters.sku.toLowerCase())!==-1)&&
        (!start||(r.end&&r.end>=start))&&(!end||(r.start&&r.start<=end));});}
    function render(){
        var rows=filtered(state.rows,state.filters,state.start,state.end),pages=Math.max(1,Math.ceil(rows.length/state.size));state.page=Math.min(state.page,pages);
        var cols=['sku','company','marketplace','country','category','series','promotionType','eventType','campaignName','start','end','status'];
        el('body').innerHTML=rows.slice((state.page-1)*state.size,state.page*state.size).map(function(r){return '<tr>'+cols.map(function(k){return '<td>'+esc(r[k]||'--')+'</td>';}).join('')+'</tr>';}).join('')||'<tr><td colspan="12">No campaigns found.</td></tr>';
        el('count').textContent=rows.length+' SKU entries';el('page').textContent=state.page+' / '+pages;el('prev').disabled=state.page===1;el('next').disabled=state.page===pages;
    }
    async function reload(){
        if(state.flight)return state.flight;var revision=++state.revision;
        el('status').textContent='Loading campaigns...';el('refresh').disabled=true;
        state.flight=(async function(){try{
            var data=await KM.DB.loadScopedTables(['campaigns','campaign_sku_lines','sku_details']);if(revision!==state.revision)return;
            state.rows=join(data);fields.forEach(function(k){var select=el(k),selected=state.filters[k]||'';
                select.innerHTML='<option value="">All</option>'+Array.from(new Set(state.rows.map(function(r){return str(r[k]);}).filter(Boolean))).sort().map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>';}).join('');
                select.value=selected;if(select.value!==selected)state.filters[k]='';});el('status').textContent='';render();
        }catch(e){el('status').textContent='Campaign read failed: '+(e.message||e);state.rows=[];el('body').innerHTML='<tr><td colspan="12">Results were not loaded.</td></tr>';el('count').textContent='';}
        finally{state.flight=null;el('refresh').disabled=false;}})();return state.flight;
    }
    // Claim the same shared two-calendar modal used by Shipment Overview, without changing its state.
    var selection={start:null,end:null,preset:null},temp,months;
    function fmt(d){return d?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'):'';}
    function dateClose(){var modal=document.getElementById('frDateModal');if(modal.dataset.currentUser!=='campaign-overview')return;['frDateModal','frDateBackdrop'].forEach(function(id){document.getElementById(id).classList.remove('is-open');});delete modal.dataset.currentUser;}
    function datePaint(){
        document.getElementById('frStartDisplay').value=fmt(temp.start);document.getElementById('frEndDisplay').value=fmt(temp.end);
        document.querySelectorAll('#frDateModal .fr-preset-item').forEach(function(p){p.classList.toggle('is-active',p.dataset.preset===temp.preset);});
        ['start','end'].forEach(function(type){var m=months[type],cap=type==='start'?'Start':'End',body=document.getElementById('frCalendar'+cap+'Body');
            document.getElementById('frCalendar'+cap+'Title').textContent=m.toLocaleString('en',{month:'long',year:'numeric'});
            body.innerHTML=['Su','Mo','Tu','We','Th','Fr','Sa'].map(function(d){return '<div class="fr-calendar-weekday">'+d+'</div>';}).join('');
            for(var blank=0;blank<new Date(m.getFullYear(),m.getMonth(),1).getDay();blank++)body.insertAdjacentHTML('beforeend','<div class="fr-calendar-day is-disabled"></div>');
            for(var n=1;n<=new Date(m.getFullYear(),m.getMonth()+1,0).getDate();n++){
                var d=new Date(m.getFullYear(),m.getMonth(),n),button=document.createElement('button');button.className='fr-calendar-day';button.textContent=n;button.type='button';button.dataset.date=fmt(d);button.setAttribute('aria-label',fmt(d));
                button.classList.toggle('is-start',fmt(d)===fmt(temp.start));button.classList.toggle('is-end',fmt(d)===fmt(temp.end));button.classList.toggle('is-in-range',!!(temp.start&&temp.end&&d>temp.start&&d<temp.end));
                button.onclick=(function(value,kind){return function(){temp[kind]=value;if(temp.start&&temp.end&&temp.start>temp.end){var swap=temp.start;temp.start=temp.end;temp.end=swap;}temp.preset=null;datePaint();};})(d,type);body.appendChild(button);
            }
        });
    }
    function dateOpen(){
        document.getElementById('frDateModal').dataset.currentUser='campaign-overview';
        temp=Object.assign({},selection);months={start:new Date(temp.start||Date.now()),end:new Date(temp.end||Date.now())};months.start.setDate(1);months.end.setDate(1);
        ['frDateModal','frDateBackdrop'].forEach(function(id){document.getElementById(id).classList.add('is-open');});
        document.getElementById('frDateBackdrop').onclick=dateClose;document.getElementById('frDateCancel').onclick=dateClose;
        document.getElementById('frDateApply').onclick=function(){if(!temp.start||!temp.end)return;selection=Object.assign({},temp);state.start=fmt(temp.start);state.end=fmt(temp.end);el('date-text').textContent=state.start+' ~ '+state.end;state.page=1;dateClose();render();};
        document.querySelectorAll('#frDateModal .fr-calendar-nav').forEach(function(b){b.onclick=function(){var p=b.dataset.nav.split('-'),m=months[p[1]];m.setMonth(m.getMonth()+(p[0]==='prev'?-1:1));datePaint();};});
        document.querySelectorAll('#frDateModal .fr-preset-item').forEach(function(b){b.onclick=function(){var p=b.dataset.preset,t=new Date(),a=new Date(t),z=new Date(t),match;
            if(p==='yesterday'){a.setDate(a.getDate()-1);z.setDate(z.getDate()-1);}
            else if((match=p.match(/^last-(\d+)-days$/)))a.setDate(a.getDate()-Number(match[1]));
            else if(p==='last-year'){a=new Date(t.getFullYear()-1,0,1);z=new Date(t.getFullYear()-1,11,31);}
            else if(p==='last-month'||(match=p.match(/^last-(\d+)-months$/))){a=new Date(t.getFullYear(),t.getMonth()-(match?Number(match[1]):1),1);z=new Date(t.getFullYear(),t.getMonth(),0);}
            temp={start:a,end:z,preset:p};months={start:new Date(a.getFullYear(),a.getMonth(),1),end:new Date(z.getFullYear(),z.getMonth(),1)};datePaint();};});datePaint();
    }
    function bind(){fields.forEach(function(k){el(k).onchange=function(){state.filters[k]=el(k).value;state.page=1;render();};});
        el('sku').oninput=function(){state.filters.sku=el('sku').value.trim();state.page=1;render();};el('refresh').onclick=reload;el('date').onclick=dateOpen;
        el('clear').onclick=function(){selection={start:null,end:null,preset:null};state.start=state.end='';state.filters={};fields.concat('sku').forEach(function(k){el(k).value='';});el('date-text').textContent='All';state.page=1;render();};
        el('prev').onclick=function(){state.page--;render();};el('next').onclick=function(){state.page++;render();};
    }
    KM.campaignOverview={join:join,filtered:filtered,reload:reload,state:state};
    if(KM.lifecycle)KM.lifecycle.register('campaign-overview-section',{async mount(){
        mounted=true;
        await KM.partialLoader.loadPartial('campaign-overview','assets/html/pages/campaign-overview.html?v=promo-ratio-20261126-v1','#campaign-overview-mount');
        if(!mounted)return;
        document.getElementById('campaign-overview-section').classList.add('active');bind();await reload();
    },unmount(){mounted=false;var modal=document.getElementById('frDateModal');if(modal)dateClose();}});
})(window);
