(function(root,factory){var api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof window!=='undefined'){window.KM=window.KM||{};window.KM.campaignBuilderCore=api;}})(this,function(){
  'use strict';
  var TYPES=['Best Deal','Lightning Deal','Coupon','Price Discount','Prime Exclusive Discount'];
  var FLAGS=['Normal','Spring Deal','Prime Day','Fall Prime','BFCM',"Mother's Day"];
  function s(v){return String(v==null?'':v).trim();}
  function get(r,k,c){r=r||{};return r[k]!==undefined?r[k]:r.raw&&r.raw[k]!==undefined?r.raw[k]:r[c];}
  function up(v){return s(v).toUpperCase();}
  function type(v){return s(v)==='PED'?'Prime Exclusive Discount':s(v);}
  function fail(code,detail){var e=new Error(code+(detail?': '+detail:''));e.code=code;throw e;}
  function same(r,scope){return ['company','country','marketplace'].every(function(k){return up(get(r,k,k))===up(scope[k]);});}
  function day(v){
    var t=s(v).slice(0,10),m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(t);if(!m)return null;
    var d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()+1===+m[2]&&d.getUTCDate()===+m[3]?t:null;
  }
  function number(v){return v===''||v==null||typeof v==='boolean'||!isFinite(Number(v))?null:Number(v);}
  function money(v,currency){var f=up(currency)==='JPY'?1:100;return Math.round((Number(v)+Number.EPSILON)*f)/f;}
  function discount(price,pct,currency){var p=number(pct);if(p===null||p<0||p>=100)fail('CAMPAIGN_DISCOUNT_INVALID');return money(price*(1-p/100),currency);}
  function growth(base,pct){var b=number(base),p=number(pct);if(b===null)return null;if(p===null||p<=-100)fail('CAMPAIGN_GROWTH_INVALID');var q=Math.round(b*(1+p/100));if(!Number.isSafeInteger(q)||q<0)fail('CAMPAIGN_FC_INVALID');return q;}
  function live(r){return !/^(cancelled|canceled|deleted|inactive|rejected)$/i.test(s(get(r,'status','status')));}
  function catalog(data,scope){
    var masters=Object.create(null),seen=Object.create(null),seenSku=Object.create(null),out=[];
    (data.skuDetails||[]).forEach(function(r){var k=up(get(r,'sku','sku'));(masters[k]||(masters[k]=[])).push(r);});
    (data.marketplaceSkus||[]).filter(function(r){return same(r,scope)&&/^(active|running_in_the_market)$/i.test(s(get(r,'marketplace_sku_status','marketplaceSkuStatus')));}).forEach(function(r){
      var id=s(get(r,'marketplace_sku_id','marketplaceSkuId')),sku=s(get(r,'sku','sku'));if(!id||seen[up(id)]||seenSku[up(sku)])fail('CAMPAIGN_SKU_IDENTITY_AMBIGUOUS',id||sku);seen[up(id)]=true;seenSku[up(sku)]=true;
      var m=masters[up(sku)]||[];if(m.length!==1)fail('CAMPAIGN_SKU_MASTER_AMBIGUOUS',sku);
      if(/^(inactive|discontinued|closure)$/i.test(s(get(m[0],'product_status','productStatus'))))return;
      var prices=(data.pricingList||[]).filter(function(p){return up(get(p,'marketplace_sku_id','marketplaceSkuId'))===up(id);}),price=null,cur='',issue='';
      if(prices.length!==1)issue=prices.length?'CAMPAIGN_PRICE_AMBIGUOUS':'MISSING_PRICING_LIST_ROW';
      else if(['company','country','marketplace'].some(function(k){return s(get(prices[0],k,k))&&up(get(prices[0],k,k))!==up(scope[k]);}))issue='CAMPAIGN_PRICE_SCOPE_MISMATCH';
      else {price=number(prices[0].resolvedRegularPrice);cur=s(get(prices[0],'currency','currency'));if(!(price>0)||!cur){price=null;issue='MISSING_PRICING_LIST_ROW';}}
      out.push({marketplaceSkuId:id,sku:sku,siteSku:s(get(r,'site_sku','siteSku')),category:s(get(m[0],'category','category')),series:s(get(m[0],'series','series')),
        productName:s(get(m[0],'product_name','productName')),regularPrice:price,currency:cur,priceIssue:issue});
    });return out.sort(function(a,b){return a.sku.localeCompare(b.sku);});
  }
  function members(data,campaign){
    var id=s(get(campaign,'campaign_id','campaignId'));
    return (data.campaignSkuLines||[]).filter(function(l){return s(get(l,'campaign_id','campaignId'))===id&&!/^(inactive|cancelled|deleted)$/i.test(s(get(l,'line_status','lineStatus')));});
  }
  function baseFor(data,campaign,line){
    var id=s(get(campaign,'campaign_id','campaignId')),lineId=s(get(line,'campaign_sku_line_id','campaignSkuLineId')),sku=up(get(line,'sku','sku'));
    var rows=(data.fcSpecialEvents||[]).filter(function(e){return s(get(e,'campaign_id','campaignId'))===id&&(lineId?s(get(e,'campaign_sku_line_id','campaignSkuLineId'))===lineId:up(get(e,'sku','sku'))===sku);});
    if(rows.length!==1)return null;var n=number(get(rows[0],'fc_qty','fcQty'));return n!==null&&n>=0?n:null;
  }
  function history(data,scope,promotionType,targetStart,today){
    var start=day(targetStart),now=day(today);if(!start||!now)return [];
    return (data.campaigns||[]).filter(function(c){var end=day(get(c,'end_date','endDate'));
      return same(c,scope)&&live(c)&&type(get(c,'promotion_type','promotionType'))===type(promotionType)&&end&&end<start&&end<now&&members(data,c).some(function(l){return baseFor(data,c,l)!==null;});
    }).sort(function(a,b){return s(get(b,'end_date','endDate')).localeCompare(s(get(a,'end_date','endDate')));});
  }
  function applyHistory(data,scope,campaignId,promotionType,start,today,catalogRows,pct,discountPct){
    var candidates=history(data,scope,promotionType,start,today),campaign=candidates.find(function(c){return s(get(c,'campaign_id','campaignId'))===s(campaignId);});
    if(!campaign)fail('CAMPAIGN_HISTORY_SCOPE_MISMATCH');var byId=Object.create(null),bySku=Object.create(null);
    catalogRows.forEach(function(r){byId[r.marketplaceSkuId]=r;bySku[up(r.sku)]=r;});
    var rows=[],seen=Object.create(null);
    members(data,campaign).forEach(function(l){var mid=s(get(l,'marketplace_sku_id','marketplaceSkuId')),r=mid?byId[mid]:bySku[up(get(l,'sku','sku'))];if(!r)return;
      if(seen[r.marketplaceSkuId])fail('CAMPAIGN_HISTORY_LINE_AMBIGUOUS',r.sku);seen[r.marketplaceSkuId]=true;
      var base=baseFor(data,campaign,l),oldRegular=number(get(l,'regular_price','regularPrice')),oldDeal=number(get(l,'promo_price','promoPrice'));
      var d=number(discountPct);if(d===null)d=oldRegular>0&&oldDeal!==null?(1-oldDeal/oldRegular)*100:number(get(l,'discount_percent','discountPercent'));
      rows.push(Object.assign({},r,{baseFc:base,newFc:base===null?'':growth(base,pct),discountPct:d===null?'':Math.round(d*10000)/10000,
        dealPrice:r.regularPrice===null||d===null?'':discount(r.regularPrice,d,r.currency)}));
    });return rows;
  }
  function conflicts(data,scope,rows,start,end,excludeId){
    var byId=Object.create(null),bySku=Object.create(null),out=[];rows.forEach(function(r){byId[s(r.marketplaceSkuId)]=true;bySku[up(r.sku)]=true;});
    (data.campaigns||[]).forEach(function(c){var id=s(get(c,'campaign_id','campaignId'));if(id===s(excludeId)||!same(c,scope)||!live(c))return;
      var a=day(get(c,'start_date','startDate')),b=day(get(c,'end_date','endDate'));
      members(data,c).forEach(function(l){var mid=s(get(l,'marketplace_sku_id','marketplaceSkuId')),sku=s(get(l,'sku','sku'));if(!(mid?byId[mid]:bySku[up(sku)]))return;
        if(!a||!b||b<a)fail('CAMPAIGN_EXISTING_WINDOW_INVALID',id);
        if(start<=b&&end>=a)out.push({campaignId:id,sku:sku,promotionType:type(get(c,'promotion_type','promotionType')),startDate:a,endDate:b});
      });
    });return out;
  }
  function missingForecasts(data,scope,today){
    var out=[];(data.campaigns||[]).filter(function(c){var end=day(get(c,'end_date','endDate'));return same(c,scope)&&live(c)&&end&&end>=today;}).forEach(function(c){
      members(data,c).forEach(function(l){if(baseFor(data,c,l)===null)out.push({campaignId:s(get(c,'campaign_id','campaignId')),sku:s(get(l,'sku','sku'))});});
    });return out;
  }
  function validate(scope,rows,data){
    var start=day(scope.start_date),end=day(scope.end_date);if(!start||!end||end<start)fail('CAMPAIGN_DATE_INVALID');
    if(TYPES.indexOf(type(scope.promotion_type))<0||FLAGS.indexOf(scope.event_flag)<0)fail('CAMPAIGN_TYPE_INVALID');
    if(!Array.isArray(rows)||!rows.length||rows.length>500)fail('CAMPAIGN_ROWS_INVALID');var available=catalog(data,scope),seen=Object.create(null),skipped=0;
    var result=[];rows.forEach(function(l){if(l.fc_qty==null||typeof l.fc_qty==='string'&&!l.fc_qty.trim()){skipped++;return;}var q=number(l.fc_qty);if(q===null||!Number.isSafeInteger(q)||q<=0)fail('CAMPAIGN_FC_INVALID',l.sku);
      var r=available.find(function(a){return a.marketplaceSkuId===s(l.marketplace_sku_id);});if(!r||up(r.sku)!==up(l.sku))fail('CAMPAIGN_SKU_OUT_OF_SCOPE',l.sku);
      if(seen[r.marketplaceSkuId])fail('CAMPAIGN_SKU_DUPLICATE',r.sku);seen[r.marketplaceSkuId]=true;
      if(r.priceIssue)fail(r.priceIssue,r.sku);if(number(l.regular_price)!==r.regularPrice||up(l.price_units)!==up(r.currency))fail('CAMPAIGN_PRICE_CHANGED',r.sku);
      var deal=number(l.promo_price);if(deal===null||deal<=0||deal>r.regularPrice)fail('CAMPAIGN_PROMO_PRICE_INVALID',r.sku);
      deal=money(deal,r.currency);if(deal<=0||deal>r.regularPrice)fail('CAMPAIGN_PROMO_PRICE_INVALID',r.sku);
      result.push(Object.assign({},r,{fcQty:q,dealPrice:deal,discountPct:Math.round((1-deal/r.regularPrice)*1000000)/10000}));
    });if(!result.length)fail('CAMPAIGN_NO_FORECAST_ROWS');
    var overlap=conflicts(data,scope,result,start,end);if(overlap.length)fail('CAMPAIGN_SKU_DATE_OVERLAP',overlap.map(function(o){return o.sku+' / '+o.promotionType+' / '+o.startDate+' - '+o.endDate;}).join('; '));
    return {rows:result,skipped:skipped,start:start,end:end};
  }
  return {VERSION:'CAMPAIGN_BUILDER_V1',TYPES:TYPES,FLAGS:FLAGS,get:get,day:day,type:type,same:same,catalog:catalog,history:history,applyHistory:applyHistory,
    conflicts:conflicts,missingForecasts:missingForecasts,validate:validate,discount:discount,growth:growth,money:money};
});
