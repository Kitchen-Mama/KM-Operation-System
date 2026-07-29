// Weekly Shipping Plan runtime test (pure Node — mirrors 11_/12_/17_ logic; no Sheets / DOM).
// Covers the 2026-07-28 next phase: unified rate matcher modes, battery scope, method recommendation dedup,
// rough candidates (no auto-select), Combined-Plan eligibility / effective lines / marketplace scope / L1
// clear, and Shipment exact combined marketplace → Split decision. Run: node assets/tests/shipping-plan-runtime.test.js

var fail = 0;
function eq(a, e, label) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + label); }
function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

// ---- battery scope: any lithium SKU → whole shipment lithium (mirror shippingBatteryClass_) ----
function batteryClass(skus, batteryBySku) {
  for (var i = 0; i < skus.length; i++) { if (lc(batteryBySku[skus[i]]).indexOf('lithium') !== -1) return 'lithium_battery'; }
  return '';
}
var bat = { A: 'no_battery', B: 'lithium_battery', C: 'alkaline_battery' };
eq(batteryClass(['A', 'C'], bat), '', '1: non-lithium shipment → normal candidates (battery class blank)');
eq(batteryClass(['A', 'B', 'C'], bat), 'lithium_battery', '2/9: any lithium SKU → whole shipment lithium (even mixed / combined)');

// ---- unified matcher (mirror shippingRateMatch_) ----
function match(cards, cr) {
  var mode = cr.mode || 'rough';
  var wantLithium = lc(cr.batteryType) === 'lithium_battery';
  function has(rc, f) { return String(rc[f] == null ? '' : rc[f]).trim() !== ''; }
  function eqi(a, b) { return lc(a) === lc(b); }
  return cards.filter(function (rc) {
    if (lc(rc.status) !== 'active') return false;
    if (cr.destinationCountry && !eqi(rc.destination_country, cr.destinationCountry)) return false;
    if (wantLithium) { if (lc(rc.battery_type) !== 'lithium_battery') return false; } else { if (lc(rc.battery_type) === 'lithium_battery') return false; }
    if (mode === 'recommendation') return true;
    if (cr.shippingMethod && !eqi(rc.shipping_method, cr.shippingMethod)) return false;
    if (cr.lastMile && !eqi(rc.last_mile_delivery, cr.lastMile)) return false;
    if (cr.customsType && has(rc, 'customs_type') && !eqi(rc.customs_type, cr.customsType)) return false;
    if (mode !== 'exact') return true;
    if (cr.carrierId && !eqi(rc.carrier_id, cr.carrierId)) return false;
    if (cr.marketplace && String(cr.marketplace).toUpperCase() !== 'MULTI' && has(rc, 'marketplace') && !eqi(rc.marketplace, cr.marketplace)) return false;
    return true;
  });
}
var CARDS = [
  { rate_card_id: 'R1', carrier_id: 'C_A', status: 'active', destination_country: 'US', battery_type: '', shipping_method: 'Sea', last_mile_delivery: 'Parcel', customs_type: 'formal_customs', marketplace: '', charge_type: 'weight', unit_rate: 2 },
  { rate_card_id: 'R2', carrier_id: 'C_B', status: 'active', destination_country: 'US', battery_type: '', shipping_method: 'Sea', last_mile_delivery: 'Parcel', customs_type: 'formal_customs', marketplace: '', charge_type: 'weight', unit_rate: 1 },
  { rate_card_id: 'R3', carrier_id: 'C_A', status: 'active', destination_country: 'US', battery_type: 'lithium_battery', shipping_method: 'Air', last_mile_delivery: 'Parcel', customs_type: 'formal_customs', marketplace: '', charge_type: 'weight', unit_rate: 5 },
  { rate_card_id: 'R4', carrier_id: 'C_A', status: 'active', destination_country: 'US', battery_type: '', shipping_method: 'Sea', last_mile_delivery: 'Truck', customs_type: 'third_party_customs', marketplace: 'US Amazon', charge_type: 'weight', unit_rate: 3 }
];

// recommendation dedup: distinct method+last_mile
function methodCandidates(cards, cr) {
  var m = match(cards, { mode: 'recommendation', destinationCountry: cr.destinationCountry, batteryType: cr.batteryType });
  var seen = {}, out = [];
  m.forEach(function (rc) { var k = lc(rc.shipping_method) + '||' + lc(rc.last_mile_delivery); if (seen[k]) return; seen[k] = 1; out.push(rc.shipping_method + '/' + rc.last_mile_delivery); });
  return out;
}
eq(methodCandidates(CARDS, { destinationCountry: 'US', batteryType: '' }), ['Sea/Parcel', 'Sea/Truck'], '1: non-lithium → Sea/Parcel + Sea/Truck (lithium Air card excluded), deduped');
eq(methodCandidates(CARDS, { destinationCountry: 'US', batteryType: 'lithium_battery' }), ['Air/Parcel'], '2: lithium → only the lithium Air candidate');

// rough candidates: user picks (>1 → never auto-select)
var rough = match(CARDS, { mode: 'rough', destinationCountry: 'US', batteryType: '', shippingMethod: 'Sea', lastMile: 'Parcel', customsType: 'formal_customs' });
eq(rough.map(function (c) { return c.rate_card_id; }).sort(), ['R1', 'R2'], '6: rough Sea/Parcel/formal → TWO candidates (R1,R2) presented — no auto-cheapest');
eq(rough.length > 1, true, '6: multiple candidates → user must choose (engine never picks)');

// ---- Combined-Plan eligibility (mirror handleCombineShippingPlans_ checks) ----
function combineEligible(plans) {
  if (plans.length < 2) return { ok: false, reason: 'need>=2' };
  var keys = ['company', 'country', 'source_warehouse_id', 'destination_warehouse_id', 'ship_from_type', 'destination_type'];
  var ref = plans[0], cur = '';
  for (var i = 0; i < plans.length; i++) {
    var p = plans[i];
    if (p.status !== 'draft') return { ok: false, reason: 'not_draft' };
    if (p.cancelled_at || p.transferred_shipment_id) return { ok: false, reason: 'transferred_or_cancelled' };
    if (p.parent && p.parent !== p.id) return { ok: false, reason: 'already_child' };
    if (p.is_parent) return { ok: false, reason: 'already_parent' };
    for (var k = 0; k < keys.length; k++) if (String(p[keys[k]] || '') !== String(ref[keys[k]] || '')) return { ok: false, reason: keys[k] };
    if (p.currency && cur && p.currency !== cur) return { ok: false, reason: 'currency' };
    if (!cur && p.currency) cur = p.currency;
  }
  return { ok: true };
}
var base = { status: 'draft', company: 'KM', country: 'US', source_warehouse_id: 'W1', destination_warehouse_id: 'W9', ship_from_type: 'factory', destination_type: 'fba', currency: '' };
function mk(id, over) { var o = Object.assign({ id: id, parent: id, is_parent: false }, base, over || {}); return o; }
eq(combineEligible([mk('P1'), mk('P2', { marketplace: 'US Walmart' })]).ok, true, '7: same route, different marketplace → eligible to combine');
eq(combineEligible([mk('P1'), mk('P2', { destination_warehouse_id: 'W8' })]).reason, 'destination_warehouse_id', 'not combinable: different destination warehouse');
eq(combineEligible([mk('P1'), mk('P2', { status: 'approved' })]).reason, 'not_draft', 'not combinable: approved plan');
eq(combineEligible([mk('P1', { currency: 'USD' }), mk('P2', { currency: 'RMB' })]).reason, 'currency', 'not combinable: different quoted currency');
eq(combineEligible([mk('P1'), mk('P2', { parent: 'PX' })]).reason, 'already_child', 'not combinable: already a child');

// ---- effective owner ids + measures (parent → children, no double count) ----
function effectiveOwnerIds(plans, planId) {
  var kids = plans.filter(function (p) { return p.parent === planId && p.id !== planId; });
  return kids.length ? kids.map(function (k) { return k.id; }) : [planId];
}
var TOPO = [mk('PARENT'), Object.assign(mk('P1'), { parent: 'PARENT' }), Object.assign(mk('P2'), { parent: 'PARENT' }), mk('SOLO')];
eq(effectiveOwnerIds(TOPO, 'PARENT'), ['P1', 'P2'], '8/10: Combined Parent effective owners = its children (never parent-direct)');
eq(effectiveOwnerIds(TOPO, 'SOLO'), ['SOLO'], '8: normal plan effective owner = itself');

var LINES = { P1: [{ sku: 'A', marketplace: 'US Amazon', qty: 100, cbm: 1 }], P2: [{ sku: 'A', marketplace: 'US Walmart', qty: 50, cbm: 0.5 }] };
function effectiveMeasures(plans, planId) {
  var ids = effectiveOwnerIds(plans, planId);
  var qty = 0, cbm = 0, mk2 = {}, lineCount = 0;
  ids.forEach(function (id) { (LINES[id] || []).forEach(function (l) { qty += l.qty; cbm += l.cbm; mk2[l.marketplace] = 1; lineCount++; }); });
  return { qty: qty, cbm: cbm, marketplaces: Object.keys(mk2), lineCount: lineCount };
}
var em = effectiveMeasures(TOPO, 'PARENT');
eq(em.qty, 150, '8: combined totals summed ONCE from effective lines (100+50), no double count');
eq(em.lineCount, 2, '7: combined keeps both marketplace lines separately (not merged)');
eq(em.marketplaces.sort(), ['US Amazon', 'US Walmart'], '7: effective lines expose both real marketplaces');

// marketplace scope (actual / MULTI)
function mkScope(list) { var d = {}; list.forEach(function (m) { if (m) d[m] = 1; }); var k = Object.keys(d); return k.length === 1 ? k[0] : (k.length >= 2 ? 'MULTI' : ''); }
eq(mkScope(em.marketplaces), 'MULTI', '7: parent marketplace = MULTI when children span marketplaces');
eq(mkScope(['US Amazon']), 'US Amazon', 'single-marketplace parent = actual marketplace');

// ---- L1 change clears carrier/cost ----
function applyRationaleChange(plan) {
  var cleared = { carrier_id: '', carrier_unit_rate: '', carrier_rate_type: '', import_duty_treatment: '', estimated_freight_cost: '', estimated_duty: '', estimated_customs_fee: '', estimated_total_cost: '', currency: '' };
  return Object.assign({}, plan, { shipping_method: 'Air' }, cleared, { plan_version: plan.plan_version + 1 });
}
var quoted = { shipping_method: 'Sea', carrier_id: 'C_A', estimated_total_cost: 500, currency: 'USD', plan_version: 2 };
var after = applyRationaleChange(quoted);
eq([after.carrier_id, after.estimated_total_cost, after.currency], ['', '', ''], '3: changing Method clears carrier + estimated cost');
eq(after.plan_version, 3, '3: rationale change bumps plan_version');

// ---- Shipment exact combined marketplace → Split decision ----
function exactCombinedDecision(cards, cr) {
  var cand = match(cards, { mode: 'exact', destinationCountry: cr.destinationCountry, batteryType: cr.batteryType, shippingMethod: cr.shippingMethod, lastMile: cr.lastMile, carrierId: cr.carrierId, marketplace: 'MULTI' });
  var whole = cand.filter(function (c) { return String(c.marketplace || '').trim() === ''; });
  if (whole.length) return { result: 'matched', rate_card_id: whole[0].rate_card_id };
  if (cand.length) return { result: 'split_required' };
  return { result: 'rate_review' };
}
eq(exactCombinedDecision(CARDS, { destinationCountry: 'US', batteryType: '', shippingMethod: 'Sea', lastMile: 'Parcel', carrierId: 'C_A' }).result, 'matched', '11: MULTI shipment with a whole-shipment (blank-marketplace) card → matched');
var perMkOnly = [{ rate_card_id: 'M1', carrier_id: 'C_A', status: 'active', destination_country: 'US', battery_type: '', shipping_method: 'Sea', last_mile_delivery: 'Truck', marketplace: 'US Amazon' }];
eq(exactCombinedDecision(perMkOnly, { destinationCountry: 'US', batteryType: '', shippingMethod: 'Sea', lastMile: 'Truck', carrierId: 'C_A' }).result, 'split_required', '11: MULTI shipment, only per-marketplace cards → SPLIT required (no average/merge)');
eq(exactCombinedDecision([], { destinationCountry: 'US', batteryType: '', shippingMethod: 'Sea', lastMile: 'Parcel', carrierId: 'C_A' }).result, 'rate_review', '11: no card at all → Rate Review');

// ---- carrier name lookup (never stored; carrier_id → carriers.carrier_name) ----
function carrierName(carriers, id) { for (var i = 0; i < carriers.length; i++) if (carriers[i].carrier_id === id) return carriers[i].carrier_name; return ''; }
eq(carrierName([{ carrier_id: 'C_A', carrier_name: '中外運' }], 'C_A'), '中外運', '5: carrier name resolved live from carrier_id');
eq(carrierName([{ carrier_id: 'C_A', carrier_name: '中外運' }], 'C_X'), '', '5: unknown carrier_id → blank (never fabricated)');

if (fail) { console.error('\n' + fail + ' FAILED'); process.exit(1); }
console.log('\nALL PASS');
