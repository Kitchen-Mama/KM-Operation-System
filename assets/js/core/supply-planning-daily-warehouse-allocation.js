// Shared 3PL allocation: date first, then ascending priority, proportional within a rank.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {}; window.KM.core = window.KM.core || {};
    window.KM.core.dailyWarehouseAllocation = api;
  }
  return api;
})(this, function () {
  'use strict';
  var EPS = 1e-9, VERSION = 'DAILY_3PL_V1';
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function qty(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
  function day(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v; }
  function fail(code) { return { ready: false, issues: [{ code: code }], version: VERSION }; }

  // Small residual network, also used for integer rounding. Reverse edges allow a flexible receiver to
  // move to another warehouse rather than starving a receiver that can use only one warehouse.
  function network(n) {
    var g = []; for (var i = 0; i < n; i++) g.push([]);
    function add(a, b, cap, cost) {
      var e = { to: b, rev: g[b].length, cap: cap, initial: cap, cost: cost || 0 };
      g[a].push(e); g[b].push({ to: a, rev: g[a].length - 1, cap: 0, initial: 0, cost: -(cost || 0) });
      return e;
    }
    function flow(s, t, limit) {
      var sent = 0;
      while (sent + EPS < limit) {
        var dist = [], prev = [], k, a;
        for (k = 0; k < n; k++) dist[k] = Infinity;
        dist[s] = 0;
        for (k = 0; k < n - 1; k++) {
          var changed = false;
          for (a = 0; a < n; a++) {
            if (!isFinite(dist[a])) continue;
            for (var j = 0; j < g[a].length; j++) {
              var e = g[a][j], nd = dist[a] + e.cost;
              if (e.cap > EPS && nd < dist[e.to] - 1e-12) { dist[e.to] = nd; prev[e.to] = [a, j]; changed = true; }
            }
          }
          if (!changed) break;
        }
        if (!prev[t]) break;
        var q = limit - sent, v = t;
        while (v !== s) { var p = prev[v]; q = Math.min(q, g[p[0]][p[1]].cap); v = p[0]; }
        v = t;
        while (v !== s) { var pp = prev[v], ee = g[pp[0]][pp[1]]; ee.cap -= q; g[v][ee.rev].cap += q; v = pp[0]; }
        sent += q;
      }
      return sent;
    }
    function reachable(s) {
      var seen = {}, queue = [s]; seen[s] = true;
      for (var i = 0; i < queue.length; i++) g[queue[i]].forEach(function (e) { if (e.cap > EPS && !seen[e.to]) { seen[e.to] = true; queue.push(e.to); } });
      return seen;
    }
    return { add: add, flow: flow, reachable: reachable };
  }

  function match(pools, receivers, wants, fraction) {
    var net = network(pools.length + receivers.length + 2), sink = pools.length + receivers.length + 1, edges = [], target = 0;
    pools.forEach(function (p, i) {
      net.add(0, i + 1, p.available);
      receivers.forEach(function (r, j) {
        if (r.warehouseIds.indexOf(p.warehouseId) !== -1) edges.push({ i: i, j: j, e: net.add(i + 1, pools.length + j + 1, p.available) });
      });
    });
    receivers.forEach(function (r, j) { var q = wants[r.key] * fraction; target += q; net.add(pools.length + j + 1, sink, q); });
    var sent = net.flow(0, sink, target);
    return { feasible: target - sent < EPS, edges: edges, reachable: net.reachable(0), offset: pools.length + 1 };
  }

  // Weighted progressive filling on an eligibility graph. A tight warehouse subset is frozen;
  // the other receivers can continue filling from their remaining eligible warehouses.
  function proportional(pools, receivers, wants, assign) {
    var pending = receivers.filter(function (r) { return wants[r.key] > EPS; });
    while (pending.length) {
      if (!pools.some(function (p) { return p.available > EPS; })) break;
      var full = match(pools, pending, wants, 1), result = full, ratio = 1, frozen = pending;
      if (!full.feasible) {
        var lo = 0, hi = 1;
        for (var k = 0; k < 45; k++) { var mid = (lo + hi) / 2; if (match(pools, pending, wants, mid).feasible) lo = mid; else hi = mid; }
        ratio = Math.max(0, lo - 1e-10);
        result = match(pools, pending, wants, ratio);
        var cut = match(pools, pending, wants, Math.min(1, hi + 1e-7));
        frozen = pending.filter(function (r, i) { return !cut.reachable[cut.offset + i]; });
        if (!frozen.length) frozen = pending;
      }
      var keys = {}; frozen.forEach(function (r) { keys[r.key] = true; });
      result.edges.forEach(function (x) {
        var r = pending[x.j], q = Math.max(0, x.e.initial - x.e.cap);
        if (keys[r.key] && q > EPS) { assign(pools[x.i], r, q); pools[x.i].available = Math.max(0, pools[x.i].available - q); }
      });
      pending = pending.filter(function (r) { return !keys[r.key]; });
    }
  }

  function allocate(input) {
    if (!input || !input.company || !input.country || !input.sku || !day(input.calculationDate)) return fail('ALLOCATION_SCOPE_INVALID');
    var receivers = (input.receivers || []).slice().sort(function (a, b) { return cmp(a.key, b.key); });
    var lots = (input.lots || []).slice().sort(function (a, b) { return cmp(a.date, b.date) || cmp(a.id, b.id); });
    var rmap = {}, ids = {}, dates = {}, bad = null;
    receivers.forEach(function (r) {
      if (!r.key || rmap[r.key] || r.company !== input.company || r.country !== input.country || r.sku !== input.sku ||
          !qty(r.priority) || !Array.isArray(r.warehouseIds) || !r.warehouseIds.length || !qty(r.ownedOpeningQty) || !Array.isArray(r.demand)) bad = 'ALLOCATION_RECEIVER_INVALID';
      rmap[r.key] = { receiver: r, balance: r.ownedOpeningQty, byDate: {}, exact: {}, owned: r.ownedIncoming || [] };
      (r.demand || []).forEach(function (d) {
        var end = new Date(Date.parse(input.calculationDate + 'T00:00:00Z') + 90 * 864e5).toISOString().slice(0, 10);
        if (!day(d.date) || d.date <= input.calculationDate || d.date > end || !qty(d.qty)) bad = 'ALLOCATION_DEMAND_INVALID';
        dates[d.date] = true; rmap[r.key].byDate[d.date] = (rmap[r.key].byDate[d.date] || 0) + d.qty;
      });
      var ownedIds = {};
      (r.ownedIncoming || []).forEach(function (e) {
        if (!e.incomingId || ownedIds[e.incomingId] || !day(e.eta) || !qty(e.qty)) bad = 'ALLOCATION_OWNED_INCOMING_INVALID';
        ownedIds[e.incomingId] = true;
      });
    });
    lots.forEach(function (l) {
      if (!l.id || ids[l.id] || !l.warehouseId || !day(l.date) || !Number.isSafeInteger(l.qty) || l.qty < 0 ||
          (l.opening && l.date > input.calculationDate) || l.company !== input.company || l.country !== input.country || l.sku !== input.sku) bad = 'ALLOCATION_LOT_INVALID';
      ids[l.id] = true;
    });
    if (bad) return fail(bad);
    var remaining = lots.map(function (l) { return l.qty; }), exactByLot = lots.map(function () { return {}; });
    Object.keys(dates).sort().forEach(function (date) {
      var pools = {}, wants = {};
      lots.forEach(function (l, i) {
        if (l.date > date || remaining[i] <= EPS) return;
        if (!pools[l.warehouseId]) pools[l.warehouseId] = { warehouseId: l.warehouseId, available: 0, lots: [] };
        pools[l.warehouseId].available += remaining[i]; pools[l.warehouseId].lots.push(i);
      });
      receivers.forEach(function (r) {
        var state = rmap[r.key];
        state.owned.forEach(function (e) { if (e.eta <= date && !state['in:' + e.incomingId]) { state.balance += e.qty; state['in:' + e.incomingId] = true; } });
        var d = state.byDate[date] || 0, covered = Math.min(d, state.balance); state.balance -= covered; wants[r.key] = d - covered;
      });
      var pp = Object.keys(pools).sort().map(function (k) { return pools[k]; });
      var ranks = {}; receivers.forEach(function (r) { (ranks[r.priority] = ranks[r.priority] || []).push(r); });
      Object.keys(ranks).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (rank) {
        proportional(pp, ranks[rank], wants, function (p, r, q) {
          p.lots.forEach(function (i) {
            var used = Math.min(q, remaining[i]); if (!(used > EPS)) return;
            remaining[i] -= used; q -= used;
            exactByLot[i][r.key] = (exactByLot[i][r.key] || 0) + used;
          });
        });
      });
    });

    // Integerize ONCE after all 90 days. A min-cost remainder matching preserves both warehouse-lot
    // capacity and each receiver's ceiling of its exact total, including overlapping eligibility.
    var allocated = lots.map(function () { return {}; }), floorBySite = {}, exactBySite = {}, cells = [], floorTotal = 0, exactTotal = 0;
    lots.forEach(function (l, i) {
      Object.keys(exactByLot[i]).sort().forEach(function (key) {
        var q = exactByLot[i][key], whole = Math.floor(q + EPS);
        allocated[i][key] = whole; floorTotal += whole; exactTotal += q;
        floorBySite[key] = (floorBySite[key] || 0) + whole; exactBySite[key] = (exactBySite[key] || 0) + q;
        if (q - whole > EPS) cells.push({ i: i, key: key, fraction: q - whole });
      });
    });
    var net = network(lots.length + receivers.length + 2), sink = lots.length + receivers.length + 1;
    lots.forEach(function (l, i) {
      var used = 0; Object.keys(allocated[i]).forEach(function (key) { used += allocated[i][key]; });
      net.add(0, i + 1, l.qty - used);
    });
    receivers.forEach(function (r, j) { net.add(lots.length + j + 1, sink, Math.max(0, Math.ceil((exactBySite[r.key] || 0) - EPS) - (floorBySite[r.key] || 0))); });
    cells.sort(function (a, b) { return b.fraction - a.fraction || rmap[a.key].receiver.priority - rmap[b.key].receiver.priority || cmp(a.key, b.key) || cmp(lots[a.i].id, lots[b.i].id); });
    cells.forEach(function (c, k) {
      var j = receivers.indexOf(rmap[c.key].receiver);
      c.edge = net.add(c.i + 1, lots.length + j + 1, 1, -c.fraction + k * 1e-12);
    });
    var extra = Math.max(0, Math.round(exactTotal + EPS) - floorTotal), sent = net.flow(0, sink, extra);
    if (Math.abs(sent - extra) > EPS) return fail('ALLOCATION_ROUNDING_INFEASIBLE');
    cells.forEach(function (c) { if (c.edge.cap < 0.5) allocated[c.i][c.key]++; });
    var bySite = {}, reconciliation = [];
    receivers.forEach(function (r) { bySite[r.key] = { openingQty: 0, incoming: [], warehouses: {}, exactQty: exactBySite[r.key] || 0, allocatedQty: 0 }; });
    lots.forEach(function (l, i) {
      var used = 0, perSite = [];
      Object.keys(allocated[i]).sort().forEach(function (key) {
        var q = allocated[i][key]; if (!q) return; var out = bySite[key];
        used += q; out.allocatedQty += q; out.warehouses[l.warehouseId] = (out.warehouses[l.warehouseId] || 0) + q;
        if (l.opening) out.openingQty += q;
        else out.incoming.push({ incomingId: l.id, eta: l.date, qty: q, sourceType: l.sourceType, warehouseId: l.warehouseId });
        perSite.push({ siteKey: key, qty: q });
      });
      reconciliation.push({ lotId: l.id, warehouseId: l.warehouseId, poolQty: l.qty, allocatedQty: used, unallocatedQty: l.qty - used, perSite: perSite });
    });
    return { ready: true, version: VERSION, bySite: bySite, reconciliation: reconciliation, issues: [] };
  }
  return { allocate: allocate, VERSION: VERSION };
});
