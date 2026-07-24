// On-the-Way / Shipment Runtime logic test (pure Node). Mirrors assets/js/pages/global-logistics-map.js
// derivations: shipment-grain KPI flags, current-position priority (§E.3), node-status classification,
// route-segment class, event dedupe, and the SHP-202607-001 fixture. Run: node assets/tests/shipment-runtime.test.js

var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }

function low(v){ return String(v==null?'':v).trim().toLowerCase(); }
function validCoord(lat,lng){ return typeof lat==='number'&&typeof lng==='number'&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180&&!(lat===0&&lng===0); }
function nodeStatusClass(st){ st=low(st); if(/exception|delay|hold|problem|stuck|fail/.test(st)) return 'exception'; if(/current|in_progress|active|transit|ongoing/.test(st)) return 'current'; if(/complete|done|departed|arrived|received|cleared|delivered/.test(st)) return 'completed'; return 'planned'; }
function dedupe(evs){ var seen={},out=[]; evs.forEach(function(e){ var k=(e.source||'')+'|'+(e.sourceEventId||''); if(e.source&&e.sourceEventId){ if(seen[k])return; seen[k]=1;} out.push(e);}); return out; }
function resolvePos(vm, locById){
  for(var i=vm.events.length-1;i>=0;i--){ var e=vm.events[i]; if(validCoord(e.latitude,e.longitude)) return {source:'LATEST_EVENT',drawable:true,lat:e.latitude,lng:e.longitude}; }
  if(vm.currentNode&&validCoord(vm.currentNode.latitude,vm.currentNode.longitude)) return {source:'CURRENT_NODE',drawable:true};
  if(vm.lastCompleted&&validCoord(vm.lastCompleted.latitude,vm.lastCompleted.longitude)) return {source:'LAST_COMPLETED_NODE',drawable:true};
  var ref=vm.currentNode||vm.lastCompleted; if(ref&&ref.locationRefId){ var l=locById[ref.locationRefId]; if(l&&validCoord(l.latitude,l.longitude)) return {source:'LOCATION_REF',drawable:true}; }
  return {source:'COORDINATE_PENDING',drawable:false};
}
function segClass(a,b){ if(nodeStatusClass(a.status)==='exception'||nodeStatusClass(b.status)==='exception') return 'exc'; var lc=nodeStatusClass(b.status); if(lc==='completed'||lc==='current') return 'done'; return 'upcoming'; }
function antimeridianSkip(aLng,bLng){ return Math.abs(bLng-aLng)>180; }

// --- node status classification ---
eq(nodeStatusClass('completed'),'completed','node status: completed');
eq(nodeStatusClass('current'),'current','node status: current');
eq(nodeStatusClass('planned'),'planned','node status: planned');
eq(nodeStatusClass('exception'),'exception','node status: exception');

// --- current position priority (§E.3) ---
eq(resolvePos({ events:[{latitude:20,longitude:-150}], currentNode:{latitude:33,longitude:-118}, lastCompleted:null }, {}).source, 'LATEST_EVENT', 'position: latest event coord wins');
eq(resolvePos({ events:[{latitude:null,longitude:null}], currentNode:{latitude:33,longitude:-118}, lastCompleted:null }, {}).source, 'CURRENT_NODE', 'position: current node when no event coord');
eq(resolvePos({ events:[], currentNode:null, lastCompleted:{latitude:31,longitude:121} }, {}).source, 'LAST_COMPLETED_NODE', 'position: last completed node');
eq(resolvePos({ events:[], currentNode:{latitude:null,longitude:null,locationRefId:'L1'}, lastCompleted:null }, {L1:{latitude:22,longitude:114}}).source, 'LOCATION_REF', 'position: location_ref master');
eq(resolvePos({ events:[], currentNode:null, lastCompleted:null }, {}).source, 'COORDINATE_PENDING', 'position: pending when nothing');
eq(resolvePos({ events:[{latitude:0,longitude:0}], currentNode:{latitude:31,longitude:121}, lastCompleted:null }, {}).source, 'CURRENT_NODE', 'position: 0,0 event ignored (not a coordinate)');

// --- event dedupe by source + source_event_id ---
eq(dedupe([{source:'carrier_api',sourceEventId:'X1'},{source:'carrier_api',sourceEventId:'X1'},{source:'carrier_api',sourceEventId:'X2'}]).length, 2, 'dedupe: same source+source_event_id collapses');

// --- route segment class + antimeridian ---
eq(segClass({status:'completed'},{status:'completed'}),'done','segment: completed→completed solid');
eq(segClass({status:'completed'},{status:'planned'}),'upcoming','segment: →planned dashed');
eq(segClass({status:'current'},{status:'exception'}),'exc','segment: exception red');
eq(antimeridianSkip(121,-118), true, 'antimeridian: CN→US skipped (no cross-map line)');
eq(antimeridianSkip(121,114), false, 'antimeridian: nearby drawn');

// --- shipment-grain KPI + date flags (fixed today = 2026-07-24 UTC) ---
var today = Date.UTC(2026,6,24), soon = today + 7*86400000;
function parseD(s){ var m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?Date.UTC(+m[1],+m[2]-1,+m[3]):null; }
function flags(s){
  var status=low(s.status), delivered=/received|completed|delivered|closed/.test(status)||!!s.deliveredDate;
  var etaMs=parseD(s.eta);
  var deliveredMs=s.deliveredDate?parseD(s.deliveredDate):null;
  return {
    onTheWay: !delivered && (status==='shipped'||status==='in_transit'),
    arrivingSoon: !delivered && etaMs!=null && etaMs>=today && etaMs<=soon,
    delayed: !delivered && etaMs!=null && etaMs<today,
    exception: status==='stuck',
    deliveredToday: delivered && deliveredMs!=null && deliveredMs===today
  };
}
// fixture SHP-202607-001: in_transit, ETA 2026-07-28 (within 7d) → onTheWay + arrivingSoon, counted once each
var fx = flags({ status:'in_transit', eta:'2026-07-28' });
eq([fx.onTheWay, fx.arrivingSoon, fx.delayed, fx.exception], [true,true,false,false], 'SHP-202607-001: on the way + arriving soon (once each)');
eq(flags({status:'in_transit', eta:'2026-07-10'}).delayed, true, 'delayed: ETA past, not delivered');
eq(flags({status:'received', eta:'2026-07-10'}).delayed, false, 'delivered shipment not delayed');
eq(flags({status:'completed', deliveredDate:'2026-07-24'}).deliveredToday, true, 'delivered today (TPE date match)');
eq(flags({status:'completed', deliveredDate:'2026-07-20'}).deliveredToday, false, 'delivered earlier ≠ delivered today');
eq(flags({status:'stuck', eta:'2026-08-01'}).exception, true, 'exception: status stuck');

// --- fixture route: upcoming nodes from shipment_routes; timeline from events only ---
var routeNodes = [
  {sequenceNo:1,status:'completed',nodeType:'origin_factory'},
  {sequenceNo:2,status:'completed',nodeType:'port'},
  {sequenceNo:3,status:'current',nodeType:'ocean_transit'},
  {sequenceNo:4,status:'planned',nodeType:'port'},
  {sequenceNo:5,status:'planned',nodeType:'customs_facility'},
  {sequenceNo:6,status:'planned',nodeType:'fulfillment_center'}
];
var events = [{eventType:'pickup_completed'},{eventType:'port_departure'},{eventType:'in_transit'}];
eq(routeNodes.filter(function(n){return nodeStatusClass(n.status)==='planned';}).length, 3, 'fixture: 3 upcoming nodes from shipment_routes (Long Beach / Customs / LGB8)');
eq(events.length, 3, 'fixture: timeline shows 3 actual events only (no planned events fabricated)');
eq(nodeStatusClass(routeNodes[2].status), 'current', 'fixture: node 3 (Pacific Ocean) is current');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
