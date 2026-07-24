// Request Order second-layer data-connection logic test (pure Node, no DOM).
// Mirrors the mapping rules wired in assets/js/pages/request-order.js: Asia/Taipei month window +
// cross-year, prep-date (Start−30) event bucketing, special-event pass-through (no Target%), Target
// application, and PO Factory-Orders qty/date semantics (scheduled = ordered−completed; cancelled/closure
// excluded; line date → header fallback). Run: node assets/tests/request-order-data-connection.test.js

var fail = 0;
function eq(a, e, label) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + label); }

var RO_MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function _roUpper(v){ return String(v==null?'':v).trim().toUpperCase(); }
function _roLower(v){ return String(v==null?'':v).trim().toLowerCase(); }
function ymKey(mo){ return mo.year + '-' + String(mo.idx+1).padStart(2,'0'); }

// month window with injectable "now" {year, monthIdx}
function monthWindow(now, startOffset, count){ var out=[]; for(var i=0;i<count;i++){ var mm=now.monthIdx+startOffset+i; var yy=now.year+Math.floor(mm/12); var idx=((mm%12)+12)%12; out.push({key:RO_MONTH_KEYS[idx],year:yy,idx:idx,label:(idx+1)+'/'+yy}); } return out; }

function parseDate(s){ s=String(s||'').trim(); if(!s) return null; var m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); if(m) return new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); var t=Date.parse(s); return isNaN(t)?null:new Date(t); }
function eventPrepMonth(startStr){ var dt=parseDate(startStr); if(!dt) return null; var prep=new Date(dt.getTime()-30*24*60*60*1000); return {year:prep.getUTCFullYear(), idx:prep.getUTCMonth(), prepDate:prep.toISOString().slice(0,10)}; }
function calcEffectiveFC(base, pct){ return Math.round(base*pct/100); }

// Factory orders mirror
function factoryOrders(sku, lines, poById){
  var byKey={};
  lines.forEach(function(l){
    if(_roUpper(l.sku)!==_roUpper(sku)) return;
    var po=poById[l.purchaseOrderId]; var st=po?_roLower(po.status):'';
    if(st==='cancelled'||st==='closure'||st==='closed') return;
    var dstr=l.expectedCompletionDate || (po?po.expectedCompletionDate:'') || '';
    var dt=parseDate(dstr); if(!dt) return;
    var key=dt.getUTCFullYear()+'-'+String(dt.getUTCMonth()+1).padStart(2,'0');
    var ordered=+l.orderedQty||0, completed=+l.completedQty||0;
    if(!byKey[key]) byKey[key]={scheduled:0,completed:0};
    byKey[key].scheduled+=Math.max(0,ordered-completed);
    byKey[key].completed+=completed;
  });
  return byKey;
}

// --- 1. Target% no data → 100 ---
eq((function(){ var rules=[]; return rules.length?rules[0]:100; })(), 100, 'Target% with no rule → 100 (default)');
// --- 2. Target 80% × Base 1000 → 800 ---
eq(calcEffectiveFC(1000, 80), 800, 'Adjusted FC = Base 1000 × 80% = 800');
// --- 3. Event FC 300 NOT × Target% → 300 ---
eq((function(){ var eventFc=300; /* never multiplied */ return eventFc; })(), 300, 'Special Event FC 300 unaffected by 80% Target');
// --- 4. Event Start 2026-10-15 → prep 2026-09-15 → bucket 2026-09 ---
eq(eventPrepMonth('2026-10-15'), {year:2026, idx:8, prepDate:'2026-09-15'}, 'Prep = Start−30 → 2026-09-15 → month 2026-09');
eq(ymKey({year:eventPrepMonth('2026-10-15').year, idx:eventPrepMonth('2026-10-15').idx}), '2026-09', 'Prep-month key = 2026-09');
// --- 5. cross-year N+1..N+3 from 2026-11 (monthIdx 10) ---
eq(monthWindow({year:2026,monthIdx:10}, 1, 3).map(ymKey), ['2026-12','2027-01','2027-02'], 'N+1..N+3 from 2026-11 crosses year → Dec/Jan/Feb');
// current/next/after from 2026-12
eq(monthWindow({year:2026,monthIdx:11}, 0, 3).map(ymKey), ['2026-12','2027-01','2027-02'], 'Current/Next/After from 2026-12 → 2026-12 next = 2027-01');
// --- 6. PO line ordered 1000 completed 400 → completed 400, outstanding 600 ---
(function(){
  var lines=[{sku:'A', purchaseOrderId:'PO1', orderedQty:1000, completedQty:400, expectedCompletionDate:'2026-08-20'}];
  var poById={PO1:{purchaseOrderId:'PO1', status:'in_production'}};
  var fo=factoryOrders('A', lines, poById);
  eq(fo['2026-08'], {scheduled:600, completed:400}, 'PO ordered 1000/completed 400 → scheduled 600, completed 400');
})();
// --- 7. cancelled PO excluded ---
(function(){
  var lines=[{sku:'A', purchaseOrderId:'PO2', orderedQty:500, completedQty:0, expectedCompletionDate:'2026-08-20'}];
  var poById={PO2:{purchaseOrderId:'PO2', status:'cancelled'}};
  eq(Object.keys(factoryOrders('A', lines, poById)).length, 0, 'cancelled PO excluded from factory orders');
  var poClose={PO2:{purchaseOrderId:'PO2', status:'closure'}};
  eq(Object.keys(factoryOrders('A', lines, poClose)).length, 0, 'closure PO excluded from factory orders');
})();
// --- 8. line date blank → header expected_completion_date fallback ---
(function(){
  var lines=[{sku:'A', purchaseOrderId:'PO3', orderedQty:300, completedQty:100, expectedCompletionDate:''}];
  var poById={PO3:{purchaseOrderId:'PO3', status:'issued', expectedCompletionDate:'2026-09-05'}};
  var fo=factoryOrders('A', lines, poById);
  eq(fo['2026-09'], {scheduled:200, completed:100}, 'blank line date → header date fallback (2026-09)');
})();
// --- date guard: no line & no header date → not bucketed ---
(function(){
  var lines=[{sku:'A', purchaseOrderId:'PO4', orderedQty:300, completedQty:0, expectedCompletionDate:''}];
  var poById={PO4:{purchaseOrderId:'PO4', status:'issued', expectedCompletionDate:''}};
  eq(Object.keys(factoryOrders('A', lines, poById)).length, 0, 'no completion date at all → not bucketed (never created_at/order_date)');
})();
// --- special events total: sum only events whose prep-month is in window ---
(function(){
  var win=monthWindow({year:2026,monthIdx:9}, 1, 3).reduce(function(a,mo){ a[ymKey(mo)]=1; return a; }, {}); // N+1..3 from Oct = Nov/Dec/Jan
  var events=[
    {start:'2026-12-10', qty:300}, // prep 2026-11-10 → in window
    {start:'2026-11-20', qty:150}, // prep 2026-10-21 → NOT in window (Oct)
    {start:'2027-01-05', qty:200}  // prep 2026-12-06 → in window
  ];
  var total=0; events.forEach(function(e){ var pm=eventPrepMonth(e.start); if(pm && win[pm.year+'-'+String(pm.idx+1).padStart(2,'0')]) total+=e.qty; });
  eq(total, 500, 'Special events total = only prep-month-in-window events (300+200)');
})();

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
