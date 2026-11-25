// Physical carton ownership is separate from SKU quantities. No inventory or document writes.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.mixedCartons = api; }
})(this, function () {
  'use strict';
  var VERSION = 'MIXED_CARTONS_V1';
  function str(v) { return String(v == null ? '' : v).trim(); }
  function fail(code, detail) { var e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; throw e; }
  function integer(v, positive) {
    var n = str(v) === '' || typeof v === 'boolean' ? NaN : Number(v);
    if (!Number.isSafeInteger(n) || n < (positive ? 1 : 0)) fail('MIXED_QUANTITY_INVALID');
    return n;
  }
  function known(v) { return v === '' || v == null || typeof v === 'boolean' || !isFinite(Number(v)) || Number(v) < 0 ? null : Number(v); }
  function round(v, d) { return v == null ? null : Math.round((v + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d); }
  function plus(a, b) { return a == null || b == null ? null : a + b; }
  function times(a, b) { return b === 0 ? 0 : a == null ? null : a * b; }
  function box(spec) {
    spec = spec || {};
    var f = { cm: 0.01, mm: 0.001, m: 1, in: 0.0254, inch: 0.0254 }[str(spec.unit || 'cm').toLowerCase()];
    var l = known(spec.length), w = known(spec.width), h = known(spec.height), gross = known(spec.grossKg);
    return { length: l, width: w, height: h, unit: str(spec.unit || 'cm'), grossKg: gross,
      cbm: f && l > 0 && w > 0 && h > 0 ? l * w * h * f * f * f : null };
  }
  function project(input) {
    input = input || {}; var lines = input.lines || [], groups = input.groups || [], byId = Object.create(null), used = Object.create(null);
    if (!Array.isArray(groups) || groups.length > 100 || lines.length > 1000) fail('MIXED_PACKING_LIMIT');
    var result = lines.map(function (l) {
      var id = str(l.id); if (!id || byId[id]) fail('MIXED_LINE_ID_NOT_UNIQUE', id);
      var r = { id: id, sku: str(l.sku), quantity: integer(l.quantity, false), unitsPerCarton: integer(l.unitsPerCarton, true),
        packedQuantity: 0, ordinaryQuantity: 0, ordinaryCartons: 0, ownedCartons: 0, cbm: 0, grossKg: 0,
        netKg: times(known(l.itemKg), Number(l.quantity)), box: box(l.box), groups: [], source: l };
      if (!r.sku) fail('MIXED_SKU_REQUIRED', id); byId[id] = r; return r;
    });
    var normalized = [], blocks = [];
    groups.forEach(function (g) {
      var id = str(g.id); if (!/^[A-Za-z0-9_.:/-]{1,160}$/.test(id) || used[id]) fail('MIXED_GROUP_ID_INVALID', id); used[id] = true;
      if (!Array.isArray(g.members) || g.members.length < 2 || g.members.length > 1000) fail('MIXED_GROUP_REQUIRES_MULTIPLE_SKUS', id);
      var seen = Object.create(null), skus = Object.create(null), rep = byId[str(g.representativeId)], total = 0;
      var members = g.members.map(function (m) {
        var r = byId[str(m.lineId)]; if (!r || seen[r.id]) fail('MIXED_MEMBER_NOT_UNIQUE', id); seen[r.id] = true; skus[r.sku] = true;
        var q = integer(m.quantity, true); r.packedQuantity += q;
        if (r.packedQuantity > r.quantity) fail('MIXED_MEMBER_EXCEEDS_SHIPPING_QUANTITY', r.sku);
        total += q; if (!Number.isSafeInteger(total)) fail('MIXED_QUANTITY_INVALID');
        r.groups.push(id); return { lineId: r.id, quantity: q };
      });
      if (Object.keys(skus).length < 2) fail('MIXED_GROUP_REQUIRES_MULTIPLE_SKUS', id);
      if (!rep || !seen[rep.id]) fail('MIXED_REPRESENTATIVE_NOT_MEMBER', id);
      var specs = box(g.box || rep.source.box);
      if (!(specs.cbm > 0) || !(specs.grossKg > 0)) fail('MIXED_REPRESENTATIVE_CARTON_SPEC_MISSING', rep.sku);
      rep.ownedCartons++; rep.cbm += specs.cbm; rep.grossKg += specs.grossKg;
      var canonical = { id: id, representativeId: rep.id, box: specs, members: members };
      normalized.push(canonical);
      blocks.push({ id: id, mixed: true, cartons: 1, box: specs, representativeId: rep.id,
        rows: members.map(function (m) { return { lineId: m.lineId, sku: byId[m.lineId].sku, quantity: m.quantity }; }), quantity: total });
    });
    result.forEach(function (r) {
      r.ordinaryQuantity = r.quantity - r.packedQuantity;
      r.ordinaryCartons = Math.ceil(r.ordinaryQuantity / r.unitsPerCarton); r.ownedCartons += r.ordinaryCartons;
      r.cbm = round(plus(r.cbm, times(r.box.cbm, r.ordinaryCartons)), 6);
      r.grossKg = round(plus(r.grossKg, times(r.box.grossKg, r.ordinaryCartons)), 3); r.netKg = round(r.netKg, 3);
      if (r.ordinaryQuantity) blocks.push({ id: 'ORDINARY:' + r.id, mixed: false, cartons: r.ordinaryCartons, box: r.box,
        rows: [{ lineId: r.id, sku: r.sku, quantity: r.ordinaryQuantity }], quantity: r.ordinaryQuantity });
    });
    var totals = result.reduce(function (t, r) { t.quantity += r.quantity; t.cartons += r.ownedCartons;
      t.cbm = plus(t.cbm, r.cbm); t.grossKg = plus(t.grossKg, r.grossKg); t.netKg = plus(t.netKg, r.netKg); return t;
    }, { quantity: 0, cartons: 0, cbm: 0, grossKg: 0, netKg: 0 });
    if (!Number.isSafeInteger(totals.quantity) || !Number.isSafeInteger(totals.cartons)) fail('MIXED_QUANTITY_INVALID');
    totals.cbm = round(totals.cbm, 6); totals.grossKg = round(totals.grossKg, 3); totals.netKg = round(totals.netKg, 3);
    return { version: VERSION, groups: normalized, lines: result, blocks: blocks, totals: totals };
  }
  function parse(value) {
    if (value === '' || value == null) return [];
    var x; try { x = typeof value === 'string' ? JSON.parse(value) : value; } catch (e) { fail('MIXED_PACKING_JSON_INVALID'); }
    if (!x || x.version !== VERSION || !Array.isArray(x.groups)) fail('MIXED_PACKING_VERSION_INVALID');
    return x.groups;
  }
  function serialize(groups) { return JSON.stringify({ version: VERSION, groups: groups }); }
  var MARK = /(?:^|\n)\[KMPACK1:([^\]\r\n]*)\]/g;
  function metadata(note) {
    var matches = Array.from(str(note).matchAll(MARK));
    if (!matches.length) { if (str(note).indexOf('[KMPACK1:')>=0) fail('MIXED_PACKING_METADATA_INVALID'); return null; }
    if (matches.length !== 1) fail('MIXED_PACKING_METADATA_DUPLICATE');
    var m; try { m = JSON.parse(decodeURIComponent(matches[0][1])); } catch (e) { fail('MIXED_PACKING_METADATA_INVALID'); }
    if (!m || m.version !== VERSION || !m.ref || !Array.isArray(m.groups)) fail('MIXED_PACKING_METADATA_INVALID');
    return m;
  }
  function clean(note) { return str(note).replace(MARK, '').trim(); }
  function annotate(lines, groups) {
    var p = project({ lines: lines, groups: groups });
    return p.lines.map(function (r) {
      var l = r.source, note = clean(l.note);
      if (p.groups.length) {
        var m = { version: VERSION, ref: r.id, sku: r.sku, quantity: r.quantity, unitsPerCarton: r.unitsPerCarton,
          itemKg: known(l.itemKg), box: r.box, series: str(l.series),
          groups: p.groups.filter(function (g) { return g.members.some(function (a) { return a.lineId === r.id; }); }) };
        note += (note ? '\n' : '') + '[KMPACK1:' + encodeURIComponent(JSON.stringify(m)) + ']';
      }
      if (note.length > 45000) fail('MIXED_PACKING_NOTE_LIMIT');
      return Object.assign({}, r, { note: note });
    });
  }
  // The versioned JSON envelope travels with the existing canonical line note and its frozen snapshot.
  function layout(records) {
    var metas = records.map(function (r) { return metadata(r.note); });
    if (!metas.some(Boolean)) return null;
    var groups = Object.create(null), inputs = [], byRef = Object.create(null);
    records.forEach(function (r, i) {
      var m = metas[i];
      if (m) {
        if (str(m.sku) !== str(r.sku) || m.quantity !== Number(r.quantity) || byRef[m.ref]) fail('MIXED_PACKING_LINE_CHANGED', r.sku);
        byRef[m.ref] = r;
        inputs.push(Object.assign({}, m, { id: m.ref }));
        m.groups.forEach(function (g) {
          if (groups[g.id] && JSON.stringify(groups[g.id]) !== JSON.stringify(g)) fail('MIXED_PACKING_GROUP_CONFLICT', g.id);
          groups[g.id] = g;
        });
      }
    });
    var p = project({ lines: inputs, groups: Object.keys(groups).sort().map(function (id) { return groups[id]; }) });
    if (!p.groups.length) fail('MIXED_PACKING_GROUPS_MISSING');
    p.lines.forEach(function (l) {
      var r = byRef[l.id];
      [['ownedCartons','cartons',0],['cbm','cbm',0.0000011],['grossKg','grossKg',0.0011],['netKg','netKg',0.0011]].forEach(function (k) {
        var actual = known(r[k[1]]), expected = l[k[0]];
        if ((actual === null) !== (expected === null) || actual !== null && Math.abs(actual - expected) > k[2]) fail('MIXED_PACKING_METRIC_CHANGED', r.sku + '/' + k[1]);
      });
    });
    p.blocks.forEach(function (b) { b.rows.forEach(function (r) { r.source = byRef[r.lineId]; }); });
    records.forEach(function (r, i) {
      if (metas[i] || Number(r.quantity) === 0) return;
      if (!Number.isSafeInteger(Number(r.cartons)) || Number(r.cartons) <= 0) fail('MIXED_ORDINARY_CARTONS_UNKNOWN', r.sku);
      p.blocks.push({ id: 'ORDINARY:' + r.id, mixed: false, cartons: Number(r.cartons), quantity: Number(r.quantity),
        box: {}, rows: [{ lineId: r.id, sku: r.sku, quantity: Number(r.quantity), source: r }] });
    });
    var next = 1;
    p.blocks.forEach(function (b) { b.start = next; b.end = next + b.cartons - 1; next += b.cartons; });
    p.physicalCartons = next - 1;
    return p;
  }
  function portions(records, family) {
    var p = layout(records); if (!p) return null;
    var out = [];
    p.blocks.forEach(function (b) {
      var portions = b.rows.map(function (r) {
        var source = r.source, m = metadata(source.note), ratio = r.quantity / Number(source.quantity);
        return Object.assign({}, source, { quantity: r.quantity, series: m ? m.series : source.series,
          netKg: known(source.netKg) === null ? null : source.netKg * ratio,
          declaredTotal: known(source.unitValue) === null ? null : Number(source.unitValue) * r.quantity });
      });
      var partitions = [];
      portions.forEach(function (r) {
        // Missing or incompatible customs authority must never be hidden by a representative SKU.
        var key = family === 'SHIPDETAIL' || !b.mixed ? r.id :
          JSON.stringify([str(r.series) || r.sku, str(r.hsCode), str(r.origin), str(r.currency)]);
        var hit = partitions.find(function (x) { return x.key === key; });
        if (!hit) { hit = { key: key, members: [] }; partitions.push(hit); } hit.members.push(r);
      });
      partitions.forEach(function (part, i) {
        var members = part.members, representative = members.find(function (r) { var m = metadata(r.note); return m && m.ref === b.representativeId; }) || members[0];
        var q = members.reduce(function (n, r) { return n + r.quantity; }, 0), value = 0, net = 0;
        members.forEach(function (r) { value = plus(value, r.declaredTotal); net = plus(net, r.netKg); });
        var first = i === 0, boxSpec = b.box || {}, original = b.rows[0].source;
        out.push(Object.assign({}, representative, { quantity: q, cartons: first ? b.cartons : 0,
          cbm: first ? (b.mixed ? boxSpec.cbm : metadata(original.note) ? times(boxSpec.cbm,b.cartons) : original.cbm) : 0,
          grossKg: first ? (b.mixed ? boxSpec.grossKg : metadata(original.note) ? times(boxSpec.grossKg,b.cartons) : original.grossKg) : 0,
          netKg: net, declaredTotal: value, unitValue: value === null ? null : value / q,
          start: b.start, end: b.end, mixed: b.mixed, groupId: b.id, box: boxSpec,
          members: members.map(function (r) { return { id: r.id, sku: r.sku, quantity: r.quantity }; }) }));
      });
    });
    return out;
  }
  function uiRecords(lines, kind) {
    return lines.map(function (l) {
      var r = l.raw || l, plan = kind === 'plan';
      function value(rawKey, key) { return Object.prototype.hasOwnProperty.call(r, rawKey) ? r[rawKey] : l[key]; }
      return { id: plan ? l.shippingPlanLineId : l.shipmentLineId, sku: l.sku,
        quantity: value(plan ? 'approved_qty' : 'shipment_qty', plan ? 'approvedQty' : 'qty'),
        cartons: value(plan ? 'plan_carton_qty' : 'shipment_carton_qty','cartonQty'),
        cbm: value(plan ? 'cbm' : 'shipment_carton_cbm',plan ? 'cbm' : 'shipmentCartonCbm'),
        grossKg: value('gross_weight','grossWeight'), netKg: value('net_weight','netWeight'), note: value('note','note'), source: l };
    });
  }
  return { VERSION: VERSION, project: project, parse: parse, serialize: serialize,
    metadata: metadata, clean: clean, annotate: annotate, layout: layout, portions: portions, uiRecords: uiRecords };
});
