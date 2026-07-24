// Confirm Shipment & Dispatch orchestration logic test (pure Node). Mirrors the decision logic in
// assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs: idempotency detection, route-template
// resolution, node-status assignment, factory-stock deduction planner, cumulative offset dates, and the
// both-or-neither coordinate guard. Run: node assets/tests/shipment-dispatch.test.js

var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }
function low(v){ return String(v==null?'':v).trim().toLowerCase(); }
function truthy(v){ var s=low(v); return s==='true'||s==='1'||s==='yes'||s==='y'; }

// --- idempotency detection ---
function alreadyConfirmed(status, existingRoutes, hasEvent, hasMovement) {
  status = low(status);
  return status==='in_transit'||status==='arrived'||status==='received'||status==='completed'||status==='closed'||existingRoutes>0||hasEvent||hasMovement;
}
eq(alreadyConfirmed('ready_to_ship',0,false,false), false, 'idempotency: ready_to_ship not yet confirmed');
eq(alreadyConfirmed('in_transit',0,false,false), true, 'idempotency: in_transit → already confirmed');
eq(alreadyConfirmed('ready_to_ship',6,false,false), true, 'idempotency: existing route nodes → already');
eq(alreadyConfirmed('ready_to_ship',0,true,false), true, 'idempotency: existing event → already');
eq(alreadyConfirmed('ready_to_ship',0,false,true), true, 'idempotency: existing movement → already');

// --- route template resolution ---
function resolveTemplate(rows, dest, carrier, method, lastMile, overrideId) {
  if (overrideId) { return rows.some(function(r){return r.id===overrideId;}) ? {ok:true,id:overrideId} : {ok:false,err:'not found'}; }
  var cand = rows.filter(function(r){
    if (r.is_active!=='' && r.is_active!=null && !truthy(r.is_active)) return false;
    if (dest && low(r.destination_country)!==low(dest)) return false;
    if (carrier && r.carrier_id && low(r.carrier_id)!==low(carrier)) return false;
    return true;
  });
  if (cand.length>1 && lastMile) { var n=cand.filter(function(r){return low(r.last_mile_delivery)===low(lastMile);}); if(n.length) cand=n; }
  if (cand.length>1 && method) { var m=cand.filter(function(r){return low(r.transit_type)===low(method)||low(method).indexOf(low(r.transit_type))>=0;}); if(m.length) cand=m; }
  if (cand.length===0) return {ok:false,err:'no match'};
  if (cand.length>1) return {ok:false,err:'multiple'};
  return {ok:true,id:cand[0].id};
}
var TPL = [
  {id:'T-US-SEA', destination_country:'US', carrier_id:'OOCL', transit_type:'sea', last_mile_delivery:'truck', is_active:'TRUE'},
  {id:'T-US-AIR', destination_country:'US', carrier_id:'OOCL', transit_type:'air', last_mile_delivery:'parcel', is_active:'TRUE'},
  {id:'T-CA-SEA', destination_country:'CA', carrier_id:'OOCL', transit_type:'sea', last_mile_delivery:'truck', is_active:'TRUE'}
];
eq(resolveTemplate(TPL,'US','OOCL','sea','truck','').id, 'T-US-SEA', 'template: unique match by dest+carrier+method');
eq(resolveTemplate(TPL,'US','OOCL','','','' ).ok, false, 'template: dest+carrier ambiguous (2) → error');
eq(resolveTemplate(TPL,'JP','OOCL','sea','','' ).ok, false, 'template: no match → error');
eq(resolveTemplate(TPL,'US','OOCL','sea','','T-US-AIR').id, 'T-US-AIR', 'template: explicit override wins');
eq(resolveTemplate(TPL,'US','OOCL','xx','','BAD').ok, false, 'template: override not found → error');

// --- node status assignment ---
function nodeStatuses(n) { var out=[]; for (var i=0;i<n;i++){ out.push(n===1?'current':(i===0?'completed':(i===1?'current':'planned'))); } return out; }
eq(nodeStatuses(1), ['current'], 'node status: single node → current');
eq(nodeStatuses(6), ['completed','current','planned','planned','planned','planned'], 'node status: 6 nodes → origin completed, leg current, rest planned');

// --- factory deduction planner ---
function planDeduction(need, rows) { // rows: [{wh, cur}] sorted by wh
  var avail = rows.reduce(function(a,r){return a+Math.max(0,r.cur);},0);
  if (avail<need) return {ok:false};
  var plan=[], rem=need;
  rows.slice().sort(function(a,b){return String(a.wh).localeCompare(String(b.wh));}).forEach(function(r){
    if (rem<=0||r.cur<=0) return; var take=Math.min(r.cur,rem); plan.push({wh:r.wh,take:take,qty:-take}); rem-=take;
  });
  return {ok:true, plan:plan};
}
eq(planDeduction(600,[{wh:'WH-A',cur:400},{wh:'WH-B',cur:300}]).plan, [{wh:'WH-A',take:400,qty:-400},{wh:'WH-B',take:200,qty:-200}], 'deduction: FIFO by warehouse, movement qty negative');
eq(planDeduction(1000,[{wh:'WH-A',cur:400},{wh:'WH-B',cur:300}]).ok, false, 'deduction: insufficient total → blocked (no writes)');
eq(planDeduction(400,[{wh:'WH-A',cur:400}]).plan, [{wh:'WH-A',take:400,qty:-400}], 'deduction: exact single warehouse');

// --- cumulative offset date (ETD + default_offset_days) ---
function offsetDate(baseYmd, off) {
  var b=String(baseYmd||'').match(/^(\d{4})-(\d{2})-(\d{2})/); if(!b||off===''||off==null||isNaN(parseFloat(off))) return '';
  var ms=Date.UTC(+b[1],+b[2]-1,+b[3])+Math.round(parseFloat(off))*86400000; var d=new Date(ms);
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
}
eq(offsetDate('2026-08-01',11), '2026-08-12', 'offset date: ETD 2026-08-01 + 11 = 2026-08-12 (cumulative)');
eq(offsetDate('2026-08-01',''), '', 'offset date: blank offset → blank (no fabrication)');
eq(offsetDate('',11), '', 'offset date: no ETD → blank');

// --- both-or-neither coordinate guard (never 0,0) ---
function coordGuard(lat, lng) { if ((lat==='')!==(lng==='')) { lat=''; lng=''; } return [lat,lng]; }
eq(coordGuard(33.7,''), ['',''], 'coord guard: lat present, lng blank → both blank');
eq(coordGuard(33.7,-118.2), [33.7,-118.2], 'coord guard: both present → kept');
eq(coordGuard('',''), ['',''], 'coord guard: both blank → blank');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
