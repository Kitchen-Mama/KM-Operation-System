// S8-R4B-3 — quantify the transport bounce from the R4A1 acceptance dataset. Read-only, no new traffic.
'use strict';
var fs = require('fs');
var R = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
var ev = R.events;

function urlClass(u) {
  if (/^https:\/\/script\.google\.com\/macros\/s\/[^\/]+\/exec/.test(u)) return 'EXEC';
  if (/^https:\/\/script\.googleusercontent\.com\/macros\/echo/.test(u)) return 'ECHO';
  if (/^https:\/\/script\.google/.test(u)) return 'GOOGLE_OTHER';
  return 'OTHER';
}
function rid(u) { var m = /[?&]km_rid=([^&]*)/.exec(u); return m ? decodeURIComponent(m[1]) : null; }
function uck(u) { var m = /[?&]user_content_key=([^&]*)/.exec(u); return m ? m[1] : null; }
function pad(s, n) { s = String(s === undefined || s === null ? '-' : s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

// A LOGICAL BROWSER READ = one Chrome networkId belonging to an approved application read.
var byNid = {};
ev.forEach(function (e) {
  if (!e.nid) return;
  (byNid[e.nid] = byNid[e.nid] || []).push(e);
});
var logical = Object.keys(byNid).filter(function (k) {
  return byNid[k].some(function (e) { return e.cls === 'B_APPROVED_APPLICATION_READ'; });
});

var dist = {}, bounced = [];
logical.forEach(function (k) {
  var hops = byNid[k];
  var execs = hops.filter(function (h) { return urlClass(h.url) === 'EXEC'; }).length;
  dist[execs] = (dist[execs] || 0) + 1;
  if (execs > 1) bounced.push(k);
});

console.log('TOTAL_LOGICAL_READS  = ' + logical.length);
console.log('BOUNCED_LOGICAL_READS= ' + bounced.length);
console.log('BOUNCE_RATE          = ' + (bounced.length / logical.length * 100).toFixed(1) + '%');
console.log('EXEC_HOP_DISTRIBUTION= ' + Object.keys(dist).sort().map(function (k) {
  return k + ' exec: ' + dist[k] + ' reads';
}).join('  |  '));
console.log('SERVER_EXECUTIONS    = ' + logical.reduce(function (a, k) {
  return a + byNid[k].filter(function (h) { return urlClass(h.url) === 'EXEC'; }).length; }, 0) +
  '  for ' + logical.length + ' logical reads');

var actions = {}, surfaces = {}, scen = {};
bounced.forEach(function (k) {
  var h = byNid[k].filter(function (x) { return x.action; })[0] || byNid[k][0];
  actions[h.action] = (actions[h.action] || 0) + 1;
  surfaces[h.surface] = (surfaces[h.surface] || 0) + 1;
  scen[h.scenario] = (scen[h.scenario] || 0) + 1;
});
console.log('AFFECTED_ACTIONS     = ' + JSON.stringify(actions));
console.log('AFFECTED_SURFACES    = ' + JSON.stringify(surfaces));
console.log('AFFECTED_SCENARIOS   = ' + JSON.stringify(scen));

console.log('\n== PER BOUNCED LOGICAL READ ==');
console.log(pad('action', 30) + pad('surface', 21) + pad('scenario', 11) + pad('nid', 12) + pad('km_rid', 13) +
  pad('execs', 6) + pad('wall_ms', 9) + pad('result', 22) + 'visible_failure');
bounced.forEach(function (k) {
  var hops = byNid[k];
  var first = hops.filter(function (x) { return x.action; })[0] || hops[0];
  var execs = hops.filter(function (h) { return urlClass(h.url) === 'EXEC'; }).length;
  var wall = hops[hops.length - 1].t - hops[0].t + (hops[hops.length - 1].ms || 0);
  var failed = hops.filter(function (h) { return h.failed; }).map(function (h) { return h.failed; })[0];
  var http = hops.filter(function (h) { return h.http !== undefined; }).map(function (h) { return h.http; })[0];
  var result = failed ? failed : (http !== undefined ? ('HTTP ' + http) : 'no response recorded');
  console.log(pad(first.action, 30) + pad(first.surface, 21) + pad(first.scenario, 11) +
    pad(String(k).slice(-10), 12) + pad(rid(first.url), 13) + pad(execs, 6) + pad(wall, 9) +
    pad(result, 22) + (failed || http === 404 ? 'YES' : 'NO'));
});

console.log('\n== PER-HOP DETAIL (§5) ==');
bounced.forEach(function (k) {
  var hops = byNid[k];
  var first = hops.filter(function (x) { return x.action; })[0] || hops[0];
  console.log('\n--- ' + first.action + ' / ' + first.surface + ' / ' + first.scenario + '  nid …' + String(k).slice(-10));
  var keys = [];
  hops.forEach(function (h, i) {
    var cls = urlClass(h.url);
    var key = uck(h.url);
    if (key && keys.indexOf(key) === -1) keys.push(key);
    var next = hops[i + 1];
    console.log('  HOP ' + (i + 1) +
      '  URL_CLASS=' + pad(cls, 6) +
      ' METHOD=' + pad(h.method, 5) +
      ' HTTP_STATUS=' + pad(h.http === undefined ? 'not-observed' : h.http, 13) +
      ' REDIRECT_TO=' + pad(next ? urlClass(next.url) : '(chain end)', 12) +
      ' KM_RID=' + pad(rid(h.url), 12) +
      ' UCK=' + pad(key ? ('present#' + (keys.indexOf(key) + 1)) : 'none', 11) +
      ' BODY=' + pad(h.method === 'GET' ? 'NO (query)' : 'yes', 11) +
      ' HANDLER_EXECUTED=' + (cls === 'EXEC' ? 'YES (inferred)' : 'NO'));
  });
  console.log('  distinct user_content_keys in this chain: ' + keys.length + '  (values redacted)');
});

// §10 / §11 correlation
console.log('\n== §10 SHIPMENT / §11 FC CORRELATION ==');
['shipment.workspace.get', 'fcSummary.workspace.get'].forEach(function (a) {
  var mine = logical.filter(function (k) {
    return byNid[k].some(function (h) { return h.action === a; });
  });
  var b = mine.filter(function (k) { return byNid[k].filter(function (h) { return urlClass(h.url) === 'EXEC'; }).length > 1; });
  console.log('  ' + pad(a, 28) + 'logical=' + pad(mine.length, 5) + 'bounced=' + pad(b.length, 4) +
    'exec hops=' + mine.map(function (k) { return byNid[k].filter(function (h) { return urlClass(h.url) === 'EXEC'; }).length; }).join(','));
});
// FC slices
console.log('\n  FC slices (cold A-cold window):');
ev.filter(function (e) { return e.action === 'fcSummary.workspace.get' && e.scenario === 'A-cold'; }).forEach(function (e) {
  var m = /km_body=([^&]*)/.exec(e.url);
  var slice = m ? (/"slice"\s*:\s*"([a-z]+)"/.exec(decodeURIComponent(m[1])) || [])[1] : null;
  console.log('    km_rid=' + pad(rid(e.url), 12) + ' slice=' + pad(slice || '(not in body)', 12) +
    ' urlClass=' + pad(urlClass(e.url), 6) + ' execHops=' + byNid[e.nid].filter(function (h) { return urlClass(h.url) === 'EXEC'; }).length);
});
