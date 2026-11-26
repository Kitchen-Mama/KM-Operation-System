(function(root,factory){
    var api=factory(typeof module==='object'&&module.exports?require('../core/supply-planning-country-identity.js'):root.KM&&root.KM.countryIdentity);
    if(typeof module==='object'&&module.exports)module.exports=api;
    if(root){root.KM=root.KM||{};root.KM.promotionRiskRatio=api;}
})(typeof window!=='undefined'?window:globalThis,function(country){
    'use strict';
    var DAY=86400000,VERSION='PROMOTION_SALES_DAYS_V1';
    function s(v){return String(v==null?'':v).trim();}
    function eq(a,b){return s(a).toLowerCase()===s(b).toLowerCase();}
    function get(r,a,b){return r[a]===undefined?r[b]:r[a];}
    function date(v){
        if(Object.prototype.toString.call(v)==='[object Date]')return isNaN(v)?null:v.toISOString().slice(0,10);
        var m=s(v).match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:$|[T\s])/);if(!m)return null;
        var d=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
        return !isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d?d:null;
    }
    function shift(d,n){return new Date(Date.parse(d+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);}
    function today(now,scope){
        var code=country.canonicalCountryCode(scope.country),tz=({US:'America/Los_Angeles',CA:'America/Toronto',GB:'Europe/London',EU:'Europe/Berlin',DE:'Europe/Berlin',FR:'Europe/Paris',IT:'Europe/Rome',ES:'Europe/Madrid',AU:'Australia/Sydney',JP:'Asia/Tokyo'})[code]||'UTC';
        var parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
        function p(t){return parts.find(function(x){return x.type===t;}).value;}return p('year')+'-'+p('month')+'-'+p('day');
    }
    function classification(promo,sales){return !sales?'Missing Data':promo*2>sales?'High Risk':promo*10<sales*3?'Safe':'Watch';}
    function invalid(reason,anchor){return {version:VERSION,missing:true,reason:reason,riskLevel:'Missing Data',ratio:null,salesDays:null,promoSalesDays:null,anchorDate:anchor||null};}
    function salesIndex(input){
        var scope=input.scope||{},members=country.sourceCountriesForScope(scope.country,scope.marketplace).members;
        if(!s(scope.company)||!s(scope.country)||!s(scope.marketplace))return {error:'SITE_SCOPE_MISSING'};
        var rows=(input.rows||[]).filter(function(r){return eq(r.marketplace,scope.marketplace)&&members.indexOf(country.canonicalCountryCode(r.country))!==-1;});
        // The Amazon report has no company column. Only an unambiguous exact marketplace master can bind it.
        var masters=(input.marketplaces||[]).filter(function(m){return eq(m.marketplace,scope.marketplace)&&country.countryMatches(m.country,scope.country);});
        var unique=masters.length===1&&eq(masters[0].company,scope.company),bySku=Object.create(null),first=null,last=null,any=false;
        rows.forEach(function(r){
            var owner=s(r.company),sku=s(r.sku);if(owner&&!eq(owner,scope.company))return;
            if(!owner&&!unique){bySku[sku]={error:'SALES_COMPANY_UNRESOLVED'};return;}
            var state=bySku[sku]||(bySku[sku]={days:Object.create(null),facts:Object.create(null),errors:Object.create(null),skippedDateRows:0});if(state.error)return;
            var d=date(get(r,'snapshot_date','snapshotDate'));if(!d){state.skippedDateRows++;return;}
            if(input.today&&d>input.today)return;
            any=true;if(!first||d<first)first=d;if(!last||d>last)last=d;
            var raw=get(r,'sales_units','salesUnits'),n=typeof raw==='boolean'||raw==null||s(raw)===''?NaN:Number(raw);
            if(!Number.isFinite(n)||n<0){state.errors[d]='SALES_UNITS_INVALID';return;}
            var key=[country.canonicalCountryCode(r.country),s(r.channel),d].join('|');
            if(state.facts[key]!==undefined&&state.facts[key]!==n){state.errors[d]='SALES_DUPLICATE_CONFLICT';return;}
            state.facts[key]=n;if(n>0)state.days[d]=true;
        });
        return {bySku:bySku,first:first,last:last,error:!any?'SALES_SOURCE_UNAVAILABLE':null};
    }
    function evaluate(input){
        var anchor=date(input.anchorDate);if(!anchor)return invalid('RISK_ANCHOR_INVALID');
        var start=shift(anchor,-90),end=shift(anchor,-1),idx=input.index||salesIndex(input),sku=s(input.sku);
        if(idx.error)return invalid(idx.error,anchor);
        var state=idx.bySku[sku];if(!state)return invalid('SKU_SALES_UNAVAILABLE',anchor);if(state.error)return invalid(state.error,anchor);
        var badDay=Object.keys(state.errors||{}).find(function(d){return d>=start&&d<=end;});if(badDay)return invalid(state.errors[badDay],anchor);
        var days=Object.keys(state.days).filter(function(d){return d>=start&&d<=end;}).sort(),ranges=[],bad=false,seen={};
        (input.promotions||[]).forEach(function(p){
            if(p.marketplaceSkuId&&input.marketplaceSkuId?p.marketplaceSkuId!==input.marketplaceSkuId:s(p.sku)!==sku)return;
            var a=date(p.startDate),b=date(p.endDate);if(!a||!b||a>b){bad=true;return;}
            var key=a+'|'+b;if(!seen[key]){seen[key]=true;ranges.push([a,b]);}
        });
        if(bad)return invalid('PROMOTION_DATES_INVALID',anchor);
        var count=days.filter(function(d){return ranges.some(function(r){return r[0]<=d&&r[1]>=d;});}).length;
        var ratio=days.length?count/days.length:null;
        return {version:VERSION,anchorDate:anchor,windowStart:start,windowEnd:end,salesDays:days.length,promoSalesDays:count,
            ratio:ratio,riskLevel:classification(count,days.length),missing:!days.length,reason:days.length?null:'NO_POSITIVE_SALES_DAYS',
            partial:!!state.skippedDateRows||!idx.first||idx.first>start||!idx.last||idx.last<end,
            skippedDateRows:state.skippedDateRows||0,observedThrough:idx.last,totalPromos:ranges.length};
    }
    function summarize(input){
        var current=evaluate(input),future=[],todayDate=input.anchorDate,seen={};
        (input.promotions||[]).forEach(function(p){var a=date(p.startDate);if(!a||a<=todayDate||seen[a])return;
            if(p.marketplaceSkuId&&input.marketplaceSkuId?p.marketplaceSkuId!==input.marketplaceSkuId:s(p.sku)!==s(input.sku))return;
            seen[a]=true;future.push(evaluate(Object.assign({},input,{anchorDate:a})));
        });
        future.sort(function(a,b){return a.anchorDate.localeCompare(b.anchorDate);});
        var known=[current].concat(future).filter(function(r){return !r.missing;});
        var worst=known.sort(function(a,b){return b.ratio-a.ratio;})[0];
        var risk=worst?worst.riskLevel:'Missing Data';if(risk==='Safe'&&future.some(function(f){return f.missing;}))risk='Missing Data';
        return Object.assign({},current,{currentRisk:current.riskLevel,futureRisks:future,riskLevel:risk,
            worstRisk:worst||current,partial:current.partial||future.some(function(f){return f.partial||f.missing;})});
    }
    return {VERSION:VERSION,date:date,shift:shift,today:today,salesIndex:salesIndex,evaluate:evaluate,summarize:summarize,classification:classification};
});
