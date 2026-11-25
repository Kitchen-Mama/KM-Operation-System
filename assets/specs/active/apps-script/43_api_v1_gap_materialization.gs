




























var INV_GAP_TABLE_ = 'inventory_replenishment_gap';
var INV_GAP_HEADERS_ = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_date',
'd18_gap_qty', 'd18_suggested_qty', 'd30_gap_qty', 'd30_suggested_qty', 'd45_gap_qty', 'd45_suggested_qty',
'd90_gap_qty', 'd90_suggested_qty', 'note', 'calculated_at', 'updated_at'];

var OP_GAP_TABLE_ = 'order_planning_gap';




var OP_GAP_FACTORY_SNAPSHOT_COLS_ = ['factory_available_qty_snapshot', 'reallocation_in_qty_snapshot', 'reallocation_out_qty_snapshot'];
var OP_GAP_HEADERS_ = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_month',
't1_month', 't1_gap_qty', 't1_suggested_qty', 't2_month', 't2_gap_qty', 't2_suggested_qty',
't3_month', 't3_gap_qty', 't3_suggested_qty', 't4_month', 't4_gap_qty', 't4_suggested_qty',
'note', 'calculated_at', 'updated_at',
'factory_available_qty_snapshot', 'reallocation_in_qty_snapshot', 'reallocation_out_qty_snapshot'];






var GAP_MATERIALIZATION_HANDLER_VERSION_ = 'inventory-ongoing-warning-20261124';

var GAP_KEY_COLS_ = ['company', 'country', 'marketplace', 'sku'];
var GAP_MAX_SKUS_ = 5000;
var GAP_INV_WINDOWS_ = ['D18', 'D30', 'D45', 'D90'];
var GAP_OP_TIERS_ = ['T1', 'T2', 'T3', 'T4'];


function gapIsFiniteNum_(v) { return typeof v === 'number' && isFinite(v); }
function gapStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function gapNum_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function gapTruthy_(v) { if (v === true) return true; var s = gapStr_(v).toLowerCase(); return s === 'true' || s === 'yes' || s === '1'; }





function gapOngoingIncompleteNote_(L) {
var a = L && L.ongoingAdmission;
if (!a || a.complete !== false) return null;
var open = (a.excluded || []).filter(function (x) { return x.code !== 'ONGOING_PO_DRAFT' && x.code !== 'ONGOING_UNALLOCATED_RESIDUAL'; });
var qty = 0, unknown = 0; open.forEach(function (x) { if (typeof x.qty === 'number' && isFinite(x.qty)) qty += x.qty; else unknown++; });
return 'ONGOING_INCOMPLETE: ' + open.length + ' PO line(s), ' + qty + ' unaccounted' + (unknown ? ' + ' + unknown + ' unreadable' : '') + ' ('
+ open.slice(0, 3).map(function (x) { return x.code + ' ' + x.line; }).join('; ') + (open.length > 3 ? '; ...' : '') + ')';
}

function gapCanonCountry_(v) { return (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.canonicalCountryCode === 'function') ? KMCID.canonicalCountryCode(v) : gapStr_(v).toUpperCase(); }


function gapReceiverKey_(company, country, marketplace, sku) {
return (typeof KMMSA !== 'undefined' && KMMSA && typeof KMMSA.receiverKeyOf === 'function')
? KMMSA.receiverKeyOf({ company: company, country: country, marketplace: marketplace, sku: sku })
: [gapStr_(company), gapCanonCountry_(country), gapStr_(marketplace), gapStr_(sku)].join('||');
}


function gapReadObjects_(ss, name) {
var sh = ss.getSheetByName(name);
if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return [];
var vals = sh.getDataRange().getValues();
var hdr = vals[0].map(function (h) { return gapStr_(h); });
var out = [];
for (var r = 1; r < vals.length; r++) {
var o = {}; for (var c = 0; c < hdr.length; c++) o[hdr[c]] = vals[r][c];
out.push(o);
}
return out;
}


function gapEnumerateScopes_(ss) {
var rows = gapReadObjects_(ss, 'marketplace_skus');
var seen = {}, out = [];
rows.forEach(function (r) {
var company = gapStr_(r.company), country = gapStr_(r.country), marketplace = gapStr_(r.marketplace);
if (!company || !country || !marketplace) return;
var k = company + '||' + country + '||' + marketplace;
if (seen[k]) return; seen[k] = 1;
out.push({ company: company, country: country, marketplace: marketplace });
});
return out;
}




// D5-V3-R5: flags a READY row carries in its note - a warehouse part not counted (share unknown) and arrival dates taken
// from the PLAN (estimated, not an ETA). Text only; quantities and status are unchanged.
function gapLineFlags_(lines, calc) {   // D5-V3-R5F (m-3): calc = 'INVENTORY' | 'ORDER_PLANNING' picks the per-calculation counted flag
var unk = [], plan = [], shm = [], dup = [], nct = [], rsp = [], inc = [], rcn = [], p3l = [];   // + P3PL-2 r3   // D5-V3-R5G: + #4 / #11 / #12 / #15
(lines || []).forEach(function (L) {
(L && L.inventoryShareUnknown || []).forEach(function (u) { var w = gapNoteTok_(u && u.warehouseId); if (!w) return; var wr = w + '=' + (gapNoteTok_(u && u.reason) || 'UNKNOWN'); if (unk.indexOf(wr) === -1) unk.push(wr); });   // D5-V3-R5G: <warehouse>=<reason> (#6-10 distinguishable)
gapNoteWarnings_(L, calc, nct, rsp, inc, rcn);   // D5-V3-R5G
((L && L.shipmentDuplicates && L.shipmentDuplicates.identical) || []).forEach(function (d) { var id = gapNoteTok_(d && d.id); if (id && dup.indexOf(id) === -1) dup.push(id); });   // D5-V3-R5E (r5h: token)
(L && L.platformVia3pl || []).forEach(function (x) { var id3 = gapNoteTok_(x && (x.shipmentId || x.lineageKey)); if (!id3) return; var t3 = id3 + '=' + (Number(x && x.qty) || 0); if (p3l.indexOf(t3) === -1) p3l.push(t3); });   // P3PL-2 r3 (narrow)
(L && L.incomingDateSources || []).forEach(function (d) { if (d && d.dateSource === 'PLAN_DATE' && (calc === 'ORDER_PLANNING' ? d.countedOrderPlanning : (d.countedInventory !== undefined ? d.countedInventory : d.counted)) !== false) { var id = gapNoteTok_(d.shipmentId || d.lineageKey); if (id && plan.indexOf(id) === -1) plan.push(id); }
if (d && d.dateSource === 'ETA_MISSING') { var id2 = gapNoteTok_(d.shipmentId || d.lineageKey); if (id2 && shm.indexOf(id2) === -1) shm.push(id2); } });   // D5-V3-R5D
});
var otr = [], ofs = [], ofk = [], ofn = [], ovAny = false, fcAny = false;   // b4 + b5 Q1: ORDER_PLANNING only - the layers of the platform need
if (calc === 'ORDER_PLANNING') (lines || []).forEach(function (L) { ((L && L.monthlyProjection) || []).forEach(function (r) { if (!r || !r.tier) return; var ov = Number(r.overseasCoveredQty) || 0, fk = Number(r.factoryShipFromStockQty) || 0, tk = gapNoteTok_(r.tier);
  if (ov > 0) { ovAny = true; otr.push(tk + '=' + gapNoteNum_(ov)); } if (fk > 0) { fcAny = true; ofk.push(tk + '=' + gapNoteNum_(fk)); }
  if (typeof r.factoryShipQty === 'number' && isFinite(r.factoryShipQty)) ofs.push(tk + '=' + gapNoteNum_(r.factoryShipQty));
  if (typeof r.residualOrderNeedQty === 'number' && isFinite(r.residualOrderNeedQty)) ofn.push(tk + '=' + gapNoteNum_(r.residualOrderNeedQty)); }); });
var s = '';
if (unk.length) s += ' | WAREHOUSE_SHARE_UNKNOWN (not counted): ' + gapNoteList_(unk);
if (plan.length) s += ' | ARRIVAL_FROM_PLAN_DATE (estimated, not ETA): ' + gapNoteList_(plan);
if (shm.length) s += ' | SHIPPED_ETA_MISSING (not counted): ' + gapNoteList_(shm);
if (p3l.length) s += ' | PLATFORM_VIA_3PL_NOT_COUNTED (supply may be understated): ' + gapNoteList_(p3l);   // P3PL-2 r3: <shipment>=<held qty>
if (ovAny) s += ' | OVERSEAS_TRANSFER_SUGGESTED (FBA leg date unknown B-Q1 - not platform sellable): ' + gapNoteList_(otr);   // b4
if (ovAny || fcAny) s += ' | FACTORY_SHIP: ' + gapNoteList_(ofs) + (fcAny ? ' | FROM_FACTORY_STOCK (not platform sellable before arrival): ' + gapNoteList_(ofk) : '') + ' | NEW_PURCHASE (before carton rounding): ' + gapNoteList_(ofn);   // b5 Q1
if (dup.length) s += ' | SHIPMENT_DUPLICATE_ROWS (counted once): ' + gapNoteList_(dup);
if (nct.length) s += ' | NOT_COUNTED_THIS_CALC: ' + gapNoteList_(nct);   // D5-V3-R5G #4 (per calculation)
if (rsp.length) s += ' | INCOMING_RATIO_SPLIT (no lineage): ' + gapNoteList_(rsp);   // D5-V3-R5G #11
if (inc.length) s += ' | INCOMING_NOT_COUNTED: ' + gapNoteList_(inc);   // D5-V3-R5G #12
rcn.sort().slice(0, GAP_NOTE_LIST_MAX_).forEach(function (x) { s += ' | ' + x; });   // D5-V3-R5G #15 (one segment per warehouse part)
if (rcn.length > GAP_NOTE_LIST_MAX_) s += ' | RECON_MORE: ' + (rcn.length - GAP_NOTE_LIST_MAX_);
return s;
}
// D5-V3-R5G: the Gap note carries the contract warnings a normal user must see (#4, #6-10 reasons, #11, #12, #15) and the
// CALCULATION IDENTITY, so a note is never read as a newer calculation than it is. Grammar: docs/WARNING_CONTRACT.md delta 9.
// Text only - no new request, no new column, quantities and status unchanged. GAP_NOTE_MAX_ bounds the cell (the Sheets
// per-cell hard limit is 50,000 characters; 43_ had no limit of its own): whole segments past it are dropped AND counted.
var GAP_NOTE_MAX_ = 5000;
var GAP_NOTE_LIST_MAX_ = 10;
function gapNoteTok_(v) { return gapStr_(v).replace(/[^A-Za-z0-9_.#-]/g, '_'); }   // D5-V3-R5H: '@' replaced too (it only separates id@warehouse)
function gapNoteSite_(k) { return gapStr_(k).split('||').map(function (x) { return gapNoteTok_(x) || '-'; }).join('/'); }   // D5-V3-R5H: empty part -> '-'
function gapNoteNum_(n) { if (!(typeof n === 'number' && isFinite(n))) return '-'; var t = String(n); return /^-?[0-9]+([.][0-9]+)?$/.test(t) ? t : 'NUM_' + gapNoteTok_(t); }   // D5-V3-R5H
function gapNoteList_(arr) { var a = arr.slice().sort(); return a.slice(0, GAP_NOTE_LIST_MAX_).join(',') + (a.length > GAP_NOTE_LIST_MAX_ ? ',+' + (a.length - GAP_NOTE_LIST_MAX_) : ''); }
var GAP_NOTE_NOT_COUNTED_MODES_ = { LINEAGE_SITE_NOT_IN_POOL: 1, CROSS_COMPANY_LINEAGE: 1, CROSS_COMPANY_HEADER: 1, RATIO_UNKNOWN: 1, INCOMING_QTY_NOT_WHOLE: 1, INCOMING_QTY_TOO_LARGE: 1 };
// #15: RECON <warehouse> <STOCK|INCOMING> pool=<n> cnt=<site>:<n>+<site>:<n> rnd=<n> una=<n> nc=<n>[ ncr=<reason>:<n>,...] ok=<1|0>
function gapNoteRecon_(wh, part, r, shared) {
if (!r || typeof r !== 'object') return null;
var rnd = r.roundingRemainderQty || 0, una = r.unassignedQty || 0, nc = r.notCountedQty || 0;
if (part === 'INCOMING' && !(r.poolQty > 0)) return null;
if (!shared && !rnd && !una && !nc) return null;   // a sole-site warehouse that counted everything has no remainder to show
var cnt = (r.perSite || []).slice().sort(function (a, b) { return gapStr_(a.siteKey) < gapStr_(b.siteKey) ? -1 : 1; }).map(function (p) { return gapNoteSite_(p.siteKey) + ':' + gapNoteNum_(p.countedQty); }).join('+') || '-';
var ncr = [];
if (r.notCountedByReason) Object.keys(r.notCountedByReason).sort().forEach(function (k) { ncr.push((gapNoteTok_(k) || '-') + ':' + gapNoteNum_(r.notCountedByReason[k])); });
else if (r.notCountedReason && nc) ncr.push((gapNoteTok_(r.notCountedReason) || '-') + ':' + gapNoteNum_(nc));
return 'RECON ' + (gapNoteTok_(wh) || '-') + ' ' + part + ' pool=' + gapNoteNum_(r.poolQty) + ' cnt=' + cnt + ' rnd=' + gapNoteNum_(rnd) + ' una=' + gapNoteNum_(una) + ' nc=' + gapNoteNum_(nc) + (ncr.length ? ' ncr=' + ncr.join(',') : '') + ' ok=' + (r.reconciled === false ? 0 : 1);
}
function gapNoteWarnings_(L, calc, nct, rsp, inc, rcn) {
if (!L) return;
function add(a, x) { if (x && a.indexOf(x) === -1) a.push(x); }
// #4: a dated entry this calculation did NOT use (Inventory: D90; Order Planning: end of T4) - per-calculation flags only
(L.incomingDateSources || []).forEach(function (d) {
if (!d || (d.dateSource !== 'ETA' && d.dateSource !== 'PLAN_DATE')) return;
var op = calc === 'ORDER_PLANNING';
var cf = op ? d.countedOrderPlanning : (d.countedInventory !== undefined ? d.countedInventory : d.counted);
if (cf !== false) return;
var inSet = op ? d.inOrderPlanningSet : d.inSupplySet, end = op ? d.orderPlanningHorizonEnd : d.inventoryHorizonEnd;
add(nct, (gapNoteTok_(d.shipmentId || d.lineageKey) || '-') + '=' + (inSet === false ? 'NOT_IN_SET' : ('AFTER_' + (gapNoteTok_(end) || 'HORIZON'))));
});
(L.incomingAttribution || []).forEach(function (e) {
if (!e) return;
var id = (gapNoteTok_(e.incomingId) || '-') + '@' + (gapNoteTok_(e.warehouseId) || '-');   // D5-V3-R5H
if (e.mode === 'RATIO') add(rsp, id + '=' + gapNoteNum_(e.countedForThisSite) + '/' + gapNoteNum_(e.qty));   // #11
else if (GAP_NOTE_NOT_COUNTED_MODES_[e.mode]) add(inc, id + '=' + gapNoteTok_(e.mode) + ':' + gapNoteNum_(e.qty));   // #12
});
(L.inventoryShareReconciliation || []).forEach(function (x) {   // #15
if (!x) return;
var shared = (x.linkedSites || 1) > 1;
add(rcn, gapNoteRecon_(x.warehouseId, 'STOCK', x.stock, shared));
add(rcn, gapNoteRecon_(x.warehouseId, 'INCOMING', x.incoming, shared));
});
}
// Identity (ALWAYS the last segment of every READY and BLOCKED note):
//   CALC D=<calculation date, Asia/Taipei> AT=<run timestamp = calculated_at, T-separated> TZ=<zone of AT> [RUN=<run id>]
function gapNoteIdentity_(calcDate, ts, runId, tz) {
return 'CALC D=' + (gapNoteTok_(calcDate) || '-') + ' AT=' + (gapStr_(ts) ? gapStr_(ts).replace(' ', 'T').replace(/[^0-9T:-]/g, '_') : '-') + ' TZ=' + (gapStr_(tz).replace(/[^A-Za-z0-9_+/-]/g, '_') || '-') + (gapStr_(runId) ? ' RUN=' + gapNoteTok_(runId) : '');
}
function gapNoteTz_(io) { try { return (io && typeof io.tz === 'function') ? io.tz() : ''; } catch (e) { return ''; } }
// D5-V3-R5H: a BLOCKED / non-READY note is ONE reason segment. Its leading reason code (what gapBlockedReasonKey_ reads)
// is kept byte-identical; in the data part after it every '|' becomes '/', CR / LF / TAB become a space, and 'CALC D='
// becomes 'CALC_D=' - so a data value can never open a new segment or look like the identity.
function gapNoteReason_(note) {
var t = String(note == null ? '' : note), m = /^[A-Z][A-Z0-9_]{2,}/.exec(t), code = m ? m[0] : '', rest = t.slice(code.length);
[13, 10, 9].forEach(function (c) { rest = rest.split(String.fromCharCode(c)).join(' '); });
return code + rest.split('|').join('/').split('CALC D=').join('CALC_D=');
}
// The identity is ALWAYS the last segment and is never truncated; the first segment (status / blocked reason) is kept.
// D5-V3-R5H: a segment that does not fit is dropped and counted, LATER segments that still fit are kept (order unchanged).
function gapNoteFinalize_(note, identity, isReason) {
var segs = isReason ? [gapNoteReason_(note)] : String(note == null ? '' : note).split(' | ').map(function (x) { return x.split('CALC D=').join('CALC_D='); });
var tail = ' | ' + identity, out = segs[0], dropped = 0, room = GAP_NOTE_MAX_ - tail.length - 32;
if (out.length > room) out = out.slice(0, room - 3) + '...';
for (var i = 1; i < segs.length; i++) { var add = ' | ' + segs[i]; if (out.length + add.length <= room) out += add; else dropped++; }
if (dropped) out += ' | NOTE_TRUNCATED: ' + dropped;
return out + tail;
}
function gapInvMapFromLines_(lines, scope, sku, calcDate) {
var base = {
company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku,
calculation_status: 'READY', calculation_date: calcDate || '',
d18_gap_qty: null, d18_suggested_qty: null, d30_gap_qty: null, d30_suggested_qty: null,
d45_gap_qty: null, d45_suggested_qty: null, d90_gap_qty: null, d90_suggested_qty: null, note: ''
};
if (!lines || !lines.length) { base.calculation_status = 'BLOCKED'; base.note = 'RECOMMENDATION_LINE_NOT_FOUND'; return base; }
var acc = { D18: { g: 0, s: 0 }, D30: { g: 0, s: 0 }, D45: { g: 0, s: 0 }, D90: { g: 0, s: 0 } };
var blockedReason = null, ongoingWarnings = [];
for (var i = 0; i < lines.length && !blockedReason; i++) {
var L = lines[i];
if (L && L.blocked) { blockedReason = gapStr_(L.blockedReason) || 'BLOCKED'; break; }
// Inventory uses the existing horizons; undated ongoing supply stays excluded, not a row-level block.
// Order Planning retains its incomplete-ongoing protection in gapOpMapFromLines_.
var ongoingNote = gapOngoingIncompleteNote_(L);
if (ongoingNote && ongoingWarnings.indexOf(ongoingNote) === -1) ongoingWarnings.push(ongoingNote);
var hz = L && L.horizons;



if (!hz || !hz.length) { blockedReason = gapStr_(L && L.horizonsBlockedReason) || 'HORIZONS_NOT_AVAILABLE'; break; }
var byW = {}; hz.forEach(function (h) { if (h && h.windowCode) byW[h.windowCode] = h; });
for (var w = 0; w < GAP_INV_WINDOWS_.length; w++) {
var wc = GAP_INV_WINDOWS_[w], h = byW[wc];
if (!h || !gapIsFiniteNum_(h.gapQty) || !gapIsFiniteNum_(h.suggestedOrderQty)) { blockedReason = 'HORIZON_WINDOW_MISSING:' + wc; break; }
acc[wc].g += h.gapQty; acc[wc].s += h.suggestedOrderQty;
}
}
if (blockedReason) { base.calculation_status = 'BLOCKED'; base.note = blockedReason; return base; }
base.d18_gap_qty = acc.D18.g; base.d18_suggested_qty = acc.D18.s;
base.d30_gap_qty = acc.D30.g; base.d30_suggested_qty = acc.D30.s;
base.d45_gap_qty = acc.D45.g; base.d45_suggested_qty = acc.D45.s;
base.d90_gap_qty = acc.D90.g; base.d90_suggested_qty = acc.D90.s;
var anyGap = acc.D18.g > 0 || acc.D30.g > 0 || acc.D45.g > 0 || acc.D90.g > 0;
base.note = !anyGap ? 'No shortage' : ((acc.D18.g > 0 || acc.D30.g > 0) ? 'Shortage within 30 days' : 'Replenishment required');
ongoingWarnings.forEach(function (n) { base.note += ' | WARNING: ' + gapNoteReason_(n) + '; excluded ongoing quantity not counted, suggested quantity may be overstated'; });
base.note += gapLineFlags_(lines, 'INVENTORY');   // D5-V3-R5
return base;
}




function gapOpMapFromLines_(lines, scope, sku, calcMonth) {
var base = {
company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku,
calculation_status: 'READY', calculation_month: calcMonth || '',
t1_month: '', t1_gap_qty: null, t1_suggested_qty: null, t2_month: '', t2_gap_qty: null, t2_suggested_qty: null,
t3_month: '', t3_gap_qty: null, t3_suggested_qty: null, t4_month: '', t4_gap_qty: null, t4_suggested_qty: null, note: '',

factory_available_qty_snapshot: null, reallocation_in_qty_snapshot: null, reallocation_out_qty_snapshot: null
};
if (!lines || !lines.length) { base.calculation_status = 'BLOCKED'; base.note = 'RECOMMENDATION_LINE_NOT_FOUND'; return base; }


var fsr = null; for (var fx = 0; fx < lines.length; fx++) { if (lines[fx] && lines[fx].factorySurplusReallocation) { fsr = lines[fx].factorySurplusReallocation; break; } }
var tiers = { T1: { m: '', g: 0, s: 0, seen: false }, T2: { m: '', g: 0, s: 0, seen: false }, T3: { m: '', g: 0, s: 0, seen: false }, T4: { m: '', g: 0, s: 0, seen: false } };
var blockedReason = null;
for (var i = 0; i < lines.length && !blockedReason; i++) {
var L = lines[i];
if (L && L.blocked) { blockedReason = gapStr_(L.blockedReason) || 'BLOCKED'; break; }
if ((blockedReason = gapOngoingIncompleteNote_(L))) break;
var mp = L && L.monthlyProjection;
if (!mp || !mp.length) { blockedReason = 'MONTHLY_PROJECTION_NOT_AVAILABLE'; break; }
for (var t = 0; t < mp.length && !blockedReason; t++) {
var row = mp[t], k = row && row.tier;
if (!k || !tiers[k]) continue;
if (!gapIsFiniteNum_(row.remainingGapQty) || !gapIsFiniteNum_(row.suggestedOrderQty)) { blockedReason = 'TIER_VALUE_MISSING:' + k; break; }
tiers[k].m = gapStr_(row.month); tiers[k].g += row.remainingGapQty; tiers[k].s += row.suggestedOrderQty; tiers[k].seen = true;
}
}
if (!blockedReason) { for (var q = 0; q < GAP_OP_TIERS_.length; q++) { if (!tiers[GAP_OP_TIERS_[q]].seen) { blockedReason = 'TIER_MISSING:' + GAP_OP_TIERS_[q]; break; } } }
if (blockedReason) { base.calculation_status = 'BLOCKED'; base.note = blockedReason; return base; }
base.t1_month = tiers.T1.m; base.t1_gap_qty = tiers.T1.g; base.t1_suggested_qty = tiers.T1.s;
base.t2_month = tiers.T2.m; base.t2_gap_qty = tiers.T2.g; base.t2_suggested_qty = tiers.T2.s;
base.t3_month = tiers.T3.m; base.t3_gap_qty = tiers.T3.g; base.t3_suggested_qty = tiers.T3.s;
base.t4_month = tiers.T4.m; base.t4_gap_qty = tiers.T4.g; base.t4_suggested_qty = tiers.T4.s;
var anyGap = tiers.T1.g > 0 || tiers.T2.g > 0 || tiers.T3.g > 0 || tiers.T4.g > 0;
base.note = anyGap ? 'Order need' : 'No order need';
base.note += gapLineFlags_(lines, 'ORDER_PLANNING');   // D5-V3-R5

if (fsr) {
var fsrNum = function (v) { return (typeof v === 'number' && isFinite(v)) ? v : null; };
base.factory_available_qty_snapshot = fsrNum(fsr.factoryAvailableQtySnapshot);
base.reallocation_in_qty_snapshot = fsrNum(fsr.reallocationInQtySnapshot);
base.reallocation_out_qty_snapshot = fsrNum(fsr.reallocationOutQtySnapshot);
}
return base;
}




function gapUpsertByKey_(sheet, rowObj) {
var lastCol = sheet.getLastColumn();
var hdr = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return gapStr_(h); });
var colIdx = {}; for (var i = 0; i < hdr.length; i++) colIdx[hdr[i]] = i;
function cell(v) { return (v === null || v === undefined) ? '' : v; }
function buildArr(existing) {
var arr = [];
for (var c = 0; c < hdr.length; c++) arr.push(existing ? existing[c] : '');
for (var key in rowObj) { if (Object.prototype.hasOwnProperty.call(rowObj, key) && colIdx[key] !== undefined) arr[colIdx[key]] = cell(rowObj[key]); }
return arr;
}
var lastRow = sheet.getLastRow();
if (lastRow >= 2) {
var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
for (var r = 0; r < data.length; r++) {
var match = true;
for (var kk = 0; kk < GAP_KEY_COLS_.length; kk++) { var kc = GAP_KEY_COLS_[kk]; if (gapStr_(data[r][colIdx[kc]]) !== gapStr_(rowObj[kc])) { match = false; break; } }
if (match) { sheet.getRange(2 + r, 1, 1, lastCol).setValues([buildArr(data[r])]); return 'update'; }
}
}
sheet.appendRow(buildArr(null));
return 'insert';
}











var GAP_CALC_TZ_ = 'Asia/Taipei';
var GAP_CALC_UTC_OFFSET_MIN_ = 480;
function gapCalcLeap_(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function gapCalcDaysInMonth_(y, m) { return [31, gapCalcLeap_(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
function gapCalcYmdValid_(ymd) {
ymd = String(ymd == null ? '' : ymd);
if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(ymd)) return false;
return +ymd.slice(8, 10) <= gapCalcDaysInMonth_(+ymd.slice(0, 4), +ymd.slice(5, 7));
}

function gapCalcTaipeiYmd_(epochMs) {
var d = new Date(epochMs + GAP_CALC_UTC_OFFSET_MIN_ * 60000);
var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function gapCalcPrevYmd_(ymd) {
var y = +ymd.slice(0, 4), m = +ymd.slice(5, 7), d = +ymd.slice(8, 10);
d -= 1; if (d < 1) { m -= 1; if (m < 1) { m = 12; y -= 1; } d = gapCalcDaysInMonth_(y, m); }
return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}

function gapCalcContextForJob_(jobType, execYmd) {
if (!gapCalcYmdValid_(execYmd)) return { ok: false, code: 'CALCULATION_CONTEXT_DATE_INVALID', message: 'execution Asia/Taipei date invalid: ' + execYmd };
var calcDate = (String(jobType) === 'ORDER_PLANNING') ? gapCalcPrevYmd_(execYmd) : execYmd;
var calcMonth = calcDate.slice(0, 7);
return { ok: true, jobType: String(jobType), calculationDate: calcDate, calculationMonth: calcMonth, planningCycle: 'RECO-' + calcMonth, timezone: GAP_CALC_TZ_ };
}
function gapCalcNowMs_() { return new Date().getTime(); }

function gapCalcResolveContext_(jobType, nowMs) {
var instant = nowMs != null ? nowMs : gapCalcNowMs_();
var ctx = gapCalcContextForJob_(jobType, gapCalcTaipeiYmd_(instant));
ctx.instantMs = instant;
return ctx;
}





function gapMaterializationDefaultIo_(calcContext) {
var _ss = null;
var _preRead = null;
var _poCache = {};
var ctx = (calcContext && calcContext.ok) ? calcContext : null;







function preReadSnapshots_(ss) {
if (!_preRead) _preRead = KMPS.readCanonicalSnapshots(ss, null);
return _preRead;
}
return {
now: function () { return new Date(); },
tz: function () { try { return Session.getScriptTimeZone(); } catch (e) { return 'UTC'; } },
calcContext: ctx,
openTarget: function () {
if (_ss) return _ss;
var id = prodExpectedDbId_();
if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
var ss = SpreadsheetApp.openById(id);
prodAssertDbTarget_(ss, id);
_ss = ss; return ss;
},



workspaceGet: function (body, sharedSs) {
var recoIo = recommendationWorkspaceDefaultIo_();
recoIo.openTarget = function () { return sharedSs; };
// Order Planning must not inherit the interactive Inventory daily policy.
if (ctx) recoIo.inventoryContextForScope = ctx.jobType === 'INVENTORY'
? function (scope) { return recoWsSiteInventoryContext_(ctx, scope); } : null;



if (typeof KMPS !== 'undefined' && KMPS && typeof KMPS.readCanonicalSnapshots === 'function') {
var pre = preReadSnapshots_(sharedSs);


recoIo.readCanonicalSnapshots = function () { return { snapshots: pre.snapshots, issues: pre.issues, __poCache: _poCache }; };
}
if (ctx) {
recoIo.configDate = function () { return ctx.calculationDate; };
recoIo.configMonth = function () { return ctx.calculationMonth; };
}
return handleRecommendationWorkspaceGet_(body, recoIo);
}
};
}

function gapBatchTimestamp_(io) {
try { return Utilities.formatDate(io.now(), io.tz(), 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return ''; }
}
function gapBatchEnvelope_(ok, data, errorToken, message) {

var meta = { gapMaterializationHandlerVersion: GAP_MATERIALIZATION_HANDLER_VERSION_ };
return ok ? { success: true, data: data, meta: meta, errors: [] }
: { success: false, data: null, meta: meta, errors: [{ code: errorToken || 'GAP_BATCH_ERROR', message: message || errorToken || 'gap batch error', details: null }] };
}





var gapRunSeq_ = 0;
function gapRunId_(product, io) {
var p = (product === 'INVENTORY') ? 'INV' : ((product === 'ORDER_PLANNING') ? 'OP' : gapStr_(product) || 'GAP');
var ts = (gapBatchTimestamp_(io) || '').replace(/-/g, '').replace(/:/g, '').replace(' ', 'T');
gapRunSeq_ = (gapRunSeq_ + 1) % 10000;
return 'GAP-' + p + '-' + ts + '-' + ('000' + gapRunSeq_).slice(-4);
}









function gapBlockedReasonKey_(note) { var m = /^[A-Z][A-Z0-9_]{2,}/.exec(String(note == null ? '' : note).trim()); return m ? m[0] : 'BLOCKED'; }
function gapTallyBlocked_(acc, note) { var r = acc.blockedReasons = acc.blockedReasons || {}, k = gapBlockedReasonKey_(note); if (!(k in r) && Object.keys(r).length >= 8) k = 'OTHER'; r[k] = (r[k] || 0) + 1; }
function gapProcessScopeSlice_(scopes, io, sheet, cfg, runId) {   // D5-V3-R5G: runId optional (46_ job slices pass none)
var acc = { scopesCalculated: 0, written: 0, ready: 0, blocked: 0, errors: 0, calculationAuthority: null, scopeErrors: [], calculatedAt: null };
var ts = gapBatchTimestamp_(io);
acc.calculatedAt = ts;
var ss = io.openTarget();
for (var s = 0; s < scopes.length; s++) {
var scope = scopes[s];
var reqBody = { requestId: 'GAP-' + cfg.product + '-' + (scope.company + '/' + scope.country + '/' + scope.marketplace), payload: { scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace }, pagination: { page: 1, size: GAP_MAX_SKUS_ } } };
var env;
try { env = io.workspaceGet(reqBody, ss); } catch (e) { env = null; }
if (!env || env.success !== true) {
acc.errors++;
acc.scopeErrors.push({ scope: scope.company + '/' + scope.country + '/' + scope.marketplace, code: (env && env.errors && env.errors[0] && env.errors[0].code) || 'SCOPE_CALCULATION_FAILED' });
continue;
}
acc.scopesCalculated++;
var meta = env.meta || {};
var calcAuthority = cfg.product === 'INVENTORY' ? (meta.calculationDate || '') : (meta.calculationMonth || '');
if (acc.calculationAuthority == null && calcAuthority) acc.calculationAuthority = calcAuthority;
var lines = (env.data && env.data.lines) ? env.data.lines : [];
var bySku = {}; lines.forEach(function (L) { var k = gapStr_(L.sku); if (!k) return; (bySku[k] = bySku[k] || []).push(L); });
for (var sku in bySku) {
if (!Object.prototype.hasOwnProperty.call(bySku, sku)) continue;
var row = cfg.map(bySku[sku], scope, sku, calcAuthority);
row.calculated_at = ts;
row.updated_at = ts;
var identity = gapNoteIdentity_(meta.calculationDate || (cfg.product === 'INVENTORY' ? calcAuthority : ''), ts, runId, gapNoteTz_(io));
// Keep the formula marker in the non-truncatable identity. AT/TZ still describe the stored run timestamp.
if (cfg.product === 'INVENTORY' && meta.horizonFormula === 'SITE_DAILY_V2') identity += ' FORMULA=SITE_DAILY_V2 SITE_TZ=' + (meta.siteTimeZone || '-');
row.note = gapNoteFinalize_(row.note, identity, row.calculation_status !== 'READY');
gapUpsertByKey_(sheet, row);
acc.written++;
if (row.calculation_status === 'READY') acc.ready++;
else if (row.calculation_status === 'BLOCKED') { acc.blocked++; gapTallyBlocked_(acc, row.note); }
else acc.errors++;
}
}
return acc;
}

function gapRunBatch_(body, io, cfg) {
io = io || gapMaterializationDefaultIo_();
try {
var startedAt = gapBatchTimestamp_(io);
var runId = gapRunId_(cfg.product, io);
var ss = io.openTarget();
var sheet = prodRequireSheet_(ss, cfg.table, cfg.headers);
var scopes = io.enumerateScopes ? io.enumerateScopes(ss) : gapEnumerateScopes_(ss);
var acc = gapProcessScopeSlice_(scopes, io, sheet, cfg, runId);

var summary = { product: cfg.product, materializationRunId: runId, startedAt: startedAt, finishedAt: acc.calculatedAt,
calculationAuthority: acc.calculationAuthority, totalScopes: scopes.length, scopesCalculated: acc.scopesCalculated,
ready: acc.ready, blocked: acc.blocked, errors: acc.errors, written: acc.written, calculatedAt: acc.calculatedAt, scopeErrors: acc.scopeErrors };
return gapBatchEnvelope_(true, summary);
} catch (e) {
var token = (e && e.safetyToken) ? e.safetyToken : (e && e.schemaStatus) ? e.schemaStatus : 'GAP_BATCH_ERROR';
return gapBatchEnvelope_(false, null, token, e && e.message ? String(e.message) : String(e));
}
}



















// b4 Q2 default (a), INTERIM until the ABC cut (B7r3 bucket c): hold a 3PL that serves a non-platform site.
var GAP_OP_POOL_INTERIM_SHARED_HOLD_ = true;
function gapOvDay_(v) { if (v === null || v === undefined || v === '') return ''; if (Object.prototype.toString.call(v) === '[object Date]') { if (!isFinite(v.getTime())) return '';
  try { return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch (e) { return v.toISOString().slice(0, 10); } }
  var s = gapStr_(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; }
// The 3PLs that any allocation rule (any status: fail closed) links to a site whose marketplaces.fulfillment_model is not platform_fulfilled
// (self_fulfilled, blank, unknown, or no marketplace row). b6 (Oracle M1, Owner 2026-11-21: hybrid follows the SKU's actual mode): a HYBRID site's
// links are kept per site in hybridByWh and resolved per SKU by gapOpSelfLinkFor_ (marketplace_skus modes in mskModes). Rules: 50_ warehouseAllocationSnapshot_ (the Script Property owner) when
// deployed, else the replenishment_demand_allocation_rules sheet. A read failure holds every 3PL pool (ALLOCATION_RULES_UNREADABLE).
function gapOpSelfLinkedWarehouses_(ss) {
var out = { byWh: {}, unreadable: false, hybridByWh: {}, mskModes: {}, mskUnreadable: false };
try {
var fm = {}; gapReadObjects_(ss, 'marketplaces').forEach(function (m) { fm[gapStr_(m.company) + '||' + gapCanonCountry_(m.country) + '||' + gapStr_(m.marketplace)] = gapStr_(m.fulfillment_model).toLowerCase(); });
var rules;
if (typeof warehouseAllocationSnapshot_ === 'function') { var sn = warehouseAllocationSnapshot_(); rules = ((sn && sn.rows) || []).map(function (row) { var o = {}; (sn.headers || []).forEach(function (h, i) { o[h] = row[i]; }); return o; }); }
else rules = gapReadObjects_(ss, 'replenishment_demand_allocation_rules');
(rules || []).forEach(function (r) { var w = gapStr_(r.destination_warehouse_id); if (!w) return; var k = gapStr_(r.company) + '||' + gapCanonCountry_(r.country) + '||' + gapStr_(r.marketplace), f = fm[k];
  if (f === 'platform_fulfilled') return;
  if (f === 'hybrid') { (out.hybridByWh[w] = out.hybridByWh[w] || []); if (out.hybridByWh[w].indexOf(k) === -1) out.hybridByWh[w].push(k); return; }   // b6: per SKU below
  var t = gapNoteSite_(k) + '=' + (f || 'unknown'); (out.byWh[w] = out.byWh[w] || []); if (out.byWh[w].indexOf(t) === -1) out.byWh[w].push(t); });
} catch (e) { out.unreadable = true; }
// b6: marketplace_skus modes, read only when a hybrid site links a 3PL; a read failure leaves every hybrid SKU UNRESOLVED (held), nothing else.
if (!out.unreadable && Object.keys(out.hybridByWh).length) {
  try { gapReadObjects_(ss, 'marketplace_skus').forEach(function (r) { var sk = gapStr_(r.sku); if (!sk) return; var mk = gapStr_(r.company) + '||' + gapCanonCountry_(r.country) + '||' + gapStr_(r.marketplace) + '||' + sk, v = gapStr_(r.fulfillment_model).toLowerCase();
    (out.mskModes[mk] = out.mskModes[mk] || []); if (out.mskModes[mk].indexOf(v) === -1) out.mskModes[mk].push(v); }); } catch (eM) { out.mskUnreadable = true; }
}
return out;
}
// b6: the self links of ONE 3PL x SKU. sites = site-wide links (unchanged) + hybrid sites whose SKU mode is not explicitly platform_fulfilled.
// reason: SHARED_WITH_SELF_FULFILLED when any link is a self link (a non-platform site, or a hybrid site whose SKU is self_fulfilled);
// HYBRID_SKU_MODE_UNRESOLVED when the only links are hybrid sites whose SKU mode is blank / unknown / missing / conflicting / unreadable; else null.
function gapOpSelfLinkFor_(sl, wh, sku) {
var sites = (sl.byWh[wh] || []).slice(), self = sites.length > 0, unresolved = false;
(sl.hybridByWh[wh] || []).forEach(function (k) {
  var modes = sl.mskUnreadable ? null : (sl.mskModes[k + '||' + gapStr_(sku)] || []), m = modes === null ? 'unreadable' : !modes.length ? 'missing' : modes.length > 1 ? 'conflict' : (modes[0] || 'blank');
  if (m === 'platform_fulfilled') return;
  if (m === 'self_fulfilled') self = true; else unresolved = true;
  sites.push(gapNoteSite_(k) + '=hybrid:' + gapNoteTok_(sku) + '=' + m);
});
return { sites: sites, reason: self ? 'SHARED_WITH_SELF_FULFILLED' : unresolved ? 'HYBRID_SKU_MODE_UNRESOLVED' : null };
}
function gapOpReadSupplyPoolFacts_(ss) {
var whById = {}, factoryWhIds = {};
gapReadObjects_(ss, 'warehouses').forEach(function (w) {
var id = gapStr_(w.warehouse_id); if (!id) return;
whById[id] = { company: gapStr_(w.company), country: gapCanonCountry_(w.country), type: gapStr_(w.warehouse_type).toUpperCase(), active: gapTruthy_(w.is_active), factory: gapTruthy_(w.is_factory_warehouse) };
if (whById[id].factory) factoryWhIds[id] = 1;
});
var priorityByMkt = {};
gapReadObjects_(ss, 'marketplaces').forEach(function (m) {
var key = gapStr_(m.company) + '||' + gapCanonCountry_(m.country) + '||' + gapStr_(m.marketplace);
var ap = gapNum_(m.allocation_priority); if (ap !== null) priorityByMkt[key] = ap;
});

// b4 (Owner three-layer rule, layer 2; 2026-11-21): the overseas 3PL pool is a SEPARATE transfer source for platform receivers. It never
// enters the platform opening (42_ RECO_WS_OVERSEAS_TO_PLATFORM_OPENING_) - it only reduces the remaining FACTORY net need. Offered =
// one readable row per warehouse x SKU (b5: no date / row-order resolution of duplicates) of an active 3PL with a known company (wh_available_stock is already net of the
// system's reservations - 63_ GROSS semantic - and excludes wh_on_the_way_qty). Everything else is HELD and LISTED with its reason, never
// summed, guessed or dropped silently: WAREHOUSE_COMPANY_UNKNOWN, WAREHOUSE_TYPE_UNKNOWN, MULTIPLE_STOCK_ROWS (several rows on the latest
// date, or several rows without a readable date), POOL_STOCK_UNREADABLE, and - INTERIM rule, switch GAP_OP_POOL_INTERIM_SHARED_HOLD_ -
// SHARED_WITH_SELF_FULFILLED / HYBRID_SKU_MODE_UNRESOLVED (b6) / ALLOCATION_RULES_UNREADABLE: a 3PL that any allocation rule links to a site that is not platform_fulfilled
// (b6: for a hybrid site, only when THIS SKU's mode is not explicitly platform_fulfilled)
// is that site's fulfilment stock (42_ WAREHOUSE path counts it), so it is not offered a second time. (ABC cut: B7r3 bucket c replaces it.)
var overseasPoolsByKey = {}, heldOverseasPools = [], ovGroups_ = {}, selfLinked_ = GAP_OP_POOL_INTERIM_SHARED_HOLD_ ? gapOpSelfLinkedWarehouses_(ss) : { byWh: {}, unreadable: false, hybridByWh: {}, mskModes: {}, mskUnreadable: false };
gapReadObjects_(ss, 'overseas_inventory_snapshot').forEach(function (r) {
var wh = gapStr_(r.warehouse_id), sku = gapStr_(r.sku); if (!wh || !sku) return;
var meta = whById[wh]; if (!meta) return;
if (meta.type && meta.type !== '3PL') return;   // FBA / factory / other typed warehouses are not overseas transfer pools (unchanged)
if (!meta.active) return;                       // an inactive warehouse is not a pool (unchanged)
var gk = wh + '||' + sku;
(ovGroups_[gk] = ovGroups_[gk] || { key: gapStr_(meta.company) + '||' + meta.country + '||' + sku, warehouseId: wh, sku: sku, meta: meta, rows: [] }).rows.push({ q: gapNum_(r.wh_available_stock), day: gapOvDay_(r.snapshot_date) });
});
Object.keys(ovGroups_).sort().forEach(function (gk) {
var g = ovGroups_[gk], pick = null, why = null, superseded = 0, link_ = gapOpSelfLinkFor_(selfLinked_, g.warehouseId, g.sku);   // b6: SKU-level for hybrid sites
if (g.rows.length === 1) pick = g.rows[0];   // b5 (b): the grain is ONE current row per warehouse_id + sku (05_ / 31_ / 81_); several rows are a data conflict, never resolved by snapshot_date or row order
if (!gapStr_(g.meta.company)) why = 'WAREHOUSE_COMPANY_UNKNOWN';
else if (!g.meta.type) why = 'WAREHOUSE_TYPE_UNKNOWN';
else if (!pick) why = 'MULTIPLE_STOCK_ROWS';
else if (pick.q === null || pick.q < 0) why = 'POOL_STOCK_UNREADABLE';
else if (GAP_OP_POOL_INTERIM_SHARED_HOLD_ && selfLinked_.unreadable) why = 'ALLOCATION_RULES_UNREADABLE';
else if (GAP_OP_POOL_INTERIM_SHARED_HOLD_ && link_.reason) why = link_.reason;   // b6: SHARED_WITH_SELF_FULFILLED | HYBRID_SKU_MODE_UNRESOLVED
if (why) { heldOverseasPools.push({ key: g.key, warehouseId: g.warehouseId, sku: g.sku, physicalQty: (pick && pick.q !== null && pick.q >= 0) ? pick.q : null, rows: g.rows.length, snapshotDate: pick ? (pick.day || null) : null, sites: link_.sites.slice(0, 10), reason: why }); return; }
(overseasPoolsByKey[g.key] = overseasPoolsByKey[g.key] || []).push({ poolKey: 'OV:' + g.warehouseId + ':' + g.sku, poolType: 'THREE_PL', warehouseId: g.warehouseId, effectiveSupplyQty: pick.q });   // the AD1 pool shape (KMMSA / 61_ / 74_ unchanged); older superseded rows: not offered
});

// D5-V3 (Owner OD-3 + D1, 2026-11-13): a factory pool is AVAILABLE = current - reserved. The reserved units belong to a
// created Shipment (draft / ready_to_ship) and are counted ONCE through it (KMDR planned incoming at its ETA), never also
// as free pool. A blank reserved cell = 0 (as 21_ reads it). A reserved value that is not a number, is negative, or exceeds
// current is UNKNOWN ownership: the pool is not offered (never guessed) and the row is named in poolIssues. Inventory is
// never modified here.
var factoryPoolsBySku = {}, poolIssues = [];
var fcRows_ = gapReadObjects_(ss, 'factory_stock'), fcCount_ = {};   // b5 (b): factory_stock grain = one row per warehouse_id + sku (81_ DB_DUPLICATE_KEY)
fcRows_.forEach(function (r) { var k = gapStr_(r.warehouse_id) + '||' + gapStr_(r.sku); fcCount_[k] = (fcCount_[k] || 0) + 1; });
var fcDupSeen_ = {};
fcRows_.forEach(function (r) {
if (fcCount_[gapStr_(r.warehouse_id) + '||' + gapStr_(r.sku)] > 1 && factoryWhIds[gapStr_(r.warehouse_id)]) { var dk_ = gapStr_(r.warehouse_id) + '||' + gapStr_(r.sku); if (!fcDupSeen_[dk_]) { fcDupSeen_[dk_] = 1; poolIssues.push({ code: 'FACTORY_STOCK_DUPLICATE_ROWS', warehouseId: gapStr_(r.warehouse_id), sku: gapStr_(r.sku), rows: fcCount_[dk_] }); } return; }
var q = gapNum_(r.fac_current_stock); if (q === null || q < 0) return;
var wh = gapStr_(r.warehouse_id), sku = gapStr_(r.sku); if (!wh || !sku) return;
if (!factoryWhIds[wh]) return;
var resRaw = r.fac_reserved_stock, res = (resRaw === '' || resRaw === null || resRaw === undefined) ? 0 : gapNum_(resRaw);
if (res === null || res < 0 || res > q) { poolIssues.push({ code: 'FACTORY_RESERVED_STOCK_INVALID', warehouseId: wh, sku: sku, current: q, reserved: (res === null ? gapStr_(resRaw) : res) }); return; }
(factoryPoolsBySku[sku] = factoryPoolsBySku[sku] || []).push({ poolKey: 'FC:' + wh + ':' + sku, poolType: 'FACTORY', warehouseId: wh, effectiveSupplyQty: q - res, currentQty: q, reservedQty: res });
});
return { overseasPoolsByKey: overseasPoolsByKey, heldOverseasPools: heldOverseasPools, factoryPoolsBySku: factoryPoolsBySku,
eligibleFactoryWarehouseIds: Object.keys(factoryWhIds).sort(), priorityByMkt: priorityByMkt, poolIssues: poolIssues };
}





















function gapBlockedIssue_(scope, res, fallbackCode, list, keyOf) {
var first = (res && res.issues && res.issues[0]) || null;
return {
scope: scope,
code: (first && first.code) || fallbackCode,
message: (first && first.message) || null,
receiverKeys: (list || []).map(keyOf)
};
}

function gapOpBuildSupplyAllocation_(receivers, poolFacts, contention) {
var out = {}, issues = [];
if (typeof KMMSA === 'undefined' || !KMMSA || typeof KMMSA.allocateMarketplaceReceiverSupply !== 'function') {
return { byReceiverKey: out, issues: [{ scope: '', code: 'KMMSA_NOT_BUNDLED' }] };
}
var contendedSkus = (contention && contention.contendedSkus) || {};
var partition = (contention && contention.partition) || {};
var partitionBySource = (contention && contention.partitionBySource) || {};
var byCompanySku = {}, byCompanyCountrySku = {};
(receivers || []).forEach(function (r) {
var cc = gapCanonCountry_(r.country);
(byCompanySku[r.company + '||' + r.sku] = byCompanySku[r.company + '||' + r.sku] || []).push(r);
(byCompanyCountrySku[r.company + '||' + cc + '||' + r.sku] = byCompanyCountrySku[r.company + '||' + cc + '||' + r.sku] || []).push(r);
});
function ensure(k) { if (!out[k]) out[k] = { overseasCoveredQty: 0, factoryCoveredQty: 0, factoryBySource: {} }; return out[k]; }
function addFactorySource(rec, wh, q) { wh = gapStr_(wh); if (wh && q > 0) rec.factoryBySource[wh] = (rec.factoryBySource[wh] || 0) + q; }
function recvKeyOf(r) { return r.key || gapReceiverKey_(r.company, r.country, r.marketplace, r.sku); }
function msaReceivers(list, eligiblePoolTypes) {
return list.map(function (r) {
var o = { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku, demandQty: r.demandQty, allocationPriority: r.allocationPriority, requiredByDate: r.requiredByDate };
if (eligiblePoolTypes) o.eligiblePoolTypes = eligiblePoolTypes;
return o;
});
}
Object.keys(byCompanySku).forEach(function (cs) {
var list = byCompanySku[cs], sku = list[0].sku, pools = poolFacts.factoryPoolsBySku[sku] || [];
if (!pools.length) return;
if (contendedSkus[sku]) {
list.forEach(function (r) {
var rk = recvKeyOf(r);
if (!Object.prototype.hasOwnProperty.call(partition, rk)) throw new RangeError('FACTORY_CONTENTION_PARTITION_MISSING: ' + rk);
var rec = ensure(rk); rec.factoryCoveredQty += (partition[rk] || 0);
var bs = partitionBySource[rk] || {};
for (var wh in bs) if (Object.prototype.hasOwnProperty.call(bs, wh)) addFactorySource(rec, wh, bs[wh]);
});
return;
}
var res = KMMSA.allocateMarketplaceReceiverSupply({ company: list[0].company, masterSku: sku, factoryPools: pools, eligibleFactoryWarehouseIds: poolFacts.eligibleFactoryWarehouseIds, receivers: msaReceivers(list) });
if (!res || res.blocked) { issues.push(gapBlockedIssue_(cs, res, 'FACTORY_ALLOCATION_BLOCKED', list, recvKeyOf)); return; }
for (var k in res.byReceiver) if (Object.prototype.hasOwnProperty.call(res.byReceiver, k)) ensure(k).factoryCoveredQty += (res.byReceiver[k].allocatedFactoryQty || 0);

if (res.factory && Array.isArray(res.factory.allocations)) {
res.factory.allocations.forEach(function (a) { if (out[a.demandKey]) addFactorySource(out[a.demandKey], a.sourceWarehouseId, (a.allocatedQty || 0)); });
} else if (res.singleReceiver) {
var eids = {}; (poolFacts.eligibleFactoryWarehouseIds || []).forEach(function (w) { eids[gapStr_(w)] = 1; });
var soleKey = recvKeyOf(list[0]), soleRec = out[soleKey];
if (soleRec) pools.forEach(function (p) { if (eids[gapStr_(p.warehouseId)]) addFactorySource(soleRec, p.warehouseId, (gapNum_(p.effectiveSupplyQty) || 0)); });
}
});
Object.keys(byCompanyCountrySku).forEach(function (ccs) {
var list = byCompanyCountrySku[ccs], pools = poolFacts.overseasPoolsByKey[ccs] || [];
if (!pools.length) return;
var res = KMMSA.allocateMarketplaceReceiverSupply({ company: list[0].company, masterSku: list[0].sku, overseasPools: pools, receivers: msaReceivers(list, ['THREE_PL']) });
if (!res || res.blocked) { issues.push(gapBlockedIssue_(ccs, res, 'OVERSEAS_ALLOCATION_BLOCKED', list, recvKeyOf)); return; }
for (var k2 in res.byReceiver) if (Object.prototype.hasOwnProperty.call(res.byReceiver, k2)) ensure(k2).overseasCoveredQty += (res.byReceiver[k2].allocatedOverseasQty || 0);
});
return { byReceiverKey: out, issues: issues };
}











function gapOpApplyFactorySurplusReallocation_(allocMap, receivers, poolFacts, calculationDate) {
if (typeof KMFSR === 'undefined' || !KMFSR || typeof KMFSR.reallocatePreallocatedFactorySupply !== 'function') return { applied: false, reason: 'KMFSR_NOT_BUNDLED', groups: 0, transfers: 0 };
if (typeof KMCALC === 'undefined' || !KMCALC || typeof KMCALC.classifyRequiredByWindow !== 'function') return { applied: false, reason: 'KMCALC_NOT_BUNDLED', groups: 0, transfers: 0 };
if (!gapStr_(calculationDate)) return { applied: false, reason: 'CALCULATION_DATE_UNRESOLVED', groups: 0, transfers: 0 };
var eids = (poolFacts.eligibleFactoryWarehouseIds || []).slice();
var byGroup = {};
(receivers || []).forEach(function (r) {
if (!allocMap[r.key]) return;
var actionable = false;
try { actionable = !!KMCALC.classifyRequiredByWindow({ calculationDate: calculationDate, requiredByDate: r.requiredByDate }).engineB.allocationEligible; }
catch (e) { actionable = false; }
if (!actionable) return;
var g = r.company + '||' + r.sku;
(byGroup[g] = byGroup[g] || { masterSku: r.sku, receivers: [] }).receivers.push(r);
});
var groups = 0, transfers = 0;
Object.keys(byGroup).forEach(function (g) {
var grp = byGroup[g];
var kmfsrReceivers = grp.receivers.map(function (r) {
var a = allocMap[r.key] || {};
return { demandKey: r.key, requiredByDate: r.requiredByDate, allocationPriority: r.allocationPriority,
projectedRequirementQty: Math.max(0, (r.gapQty != null ? r.gapQty : r.demandQty) || 0),
eligibleFactoryWarehouseIds: eids.slice(), initialAllocationBySource: a.factoryBySource || {} };
});
var totalFactory = 0; kmfsrReceivers.forEach(function (x) { for (var w in x.initialAllocationBySource) if (Object.prototype.hasOwnProperty.call(x.initialAllocationBySource, w)) totalFactory += x.initialAllocationBySource[w]; });
if (totalFactory <= 0) return;
var out;
try { out = KMFSR.reallocatePreallocatedFactorySupply({ masterSku: grp.masterSku, calculationDate: calculationDate, unusedFactorySupplyQty: 0, receivers: kmfsrReceivers }); }
catch (e2) { return; }
groups++;
(out.receivers || []).forEach(function (f) {
var a = allocMap[f.demandKey]; if (!a) return;
var initial = f.initialFactoryAllocationQty || 0, inQ = f.reallocatedInQty || 0, outQ = f.reallocatedOutQty || 0;
a.factoryAvailableQtySnapshot = initial;
a.reallocationInQty = inQ; a.reallocationOutQty = outQ;
a.factoryCoveredQty = Math.max(0, initial - outQ + inQ);
});
transfers += (out.transferLedger || []).length;
});
return { applied: true, groups: groups, transfers: transfers };
}


















function gapOpFindFactoryContentionCandidates_(ss, poolFacts) {
var rows = gapReadObjects_(ss, 'marketplace_skus');
var companiesBySku = {}, scopeRowsBySku = {};
rows.forEach(function (r) {
var company = gapStr_(r.company), country = gapStr_(r.country), marketplace = gapStr_(r.marketplace), sku = gapStr_(r.sku);
if (!company || !country || !marketplace || !sku) return;
(companiesBySku[sku] = companiesBySku[sku] || {})[company] = 1;
(scopeRowsBySku[sku] = scopeRowsBySku[sku] || []).push({ company: company, country: country, marketplace: marketplace });
});
var candidateSkus = {}, scopeSeen = {}, candidateScopes = [];
Object.keys(companiesBySku).forEach(function (sku) {
if (Object.keys(companiesBySku[sku]).length < 2) return;
if (!(poolFacts.factoryPoolsBySku[sku] || []).length) return;
candidateSkus[sku] = 1;
scopeRowsBySku[sku].forEach(function (s) {
var k = s.company + '||' + s.country + '||' + s.marketplace;
if (scopeSeen[k]) return; scopeSeen[k] = 1; candidateScopes.push(s);
});
});
return { candidateSkus: candidateSkus, candidateScopes: candidateScopes,
candidateSkuCount: Object.keys(candidateSkus).length, candidateScopeCount: candidateScopes.length };
}







function gapOpComputeFactoryContention_(receivers, poolFacts) {
var contendedSkus = {}, partition = {}, partitionBySource = {}, issues = [];
if (typeof KMAR === 'undefined' || !KMAR || typeof KMAR.allocateFactoryCrossCompany !== 'function') {
return { contendedSkus: contendedSkus, partition: partition, issues: [{ code: 'KMAR_NOT_BUNDLED' }], contendedSkuCount: 0, contendedReceiverCount: 0 };
}
var bySku = {};
(receivers || []).forEach(function (r) {
var sku = gapStr_(r.sku); if (!sku) return;
if (!(poolFacts.factoryPoolsBySku[sku] || []).length) return;
var rk = r.key || gapReceiverKey_(r.company, r.country, r.marketplace, r.sku);
var g = bySku[sku] || (bySku[sku] = { companies: {}, byCompany: {} });
g.companies[r.company] = 1;
(g.byCompany[r.company] = g.byCompany[r.company] || []).push({ r: r, key: rk });
});
var eids = poolFacts.eligibleFactoryWarehouseIds || [];
Object.keys(bySku).forEach(function (sku) {
var g = bySku[sku], companies = Object.keys(g.companies).sort();
if (companies.length < 2) return;
var pools = poolFacts.factoryPoolsBySku[sku] || [];
var perCompany = companies.map(function (co) {
var demands = g.byCompany[co].map(function (x) {
var r = x.r;
return { demandKey: x.key, company: co, marketplace: gapStr_(r.marketplace) || x.key, destinationWarehouseId: x.key,
requiredByDate: gapStr_(r.requiredByDate), allocationPriority: (r.allocationPriority != null ? r.allocationPriority : 0),
demandQty: r.demandQty, eligibleFactoryWarehouseIds: eids.slice() };
});
return { company: co, factoryPools: pools, demands: demands };
});
var res;
try { res = KMAR.allocateFactoryCrossCompany(sku, perCompany); }
catch (e) { issues.push({ sku: sku, code: 'FACTORY_CROSS_COMPANY_ALLOCATION_ERROR', message: e && e.message ? String(e.message) : String(e) }); return; }
contendedSkus[sku] = 1;
companies.forEach(function (co) { g.byCompany[co].forEach(function (x) { if (!Object.prototype.hasOwnProperty.call(partition, x.key)) { partition[x.key] = 0; partitionBySource[x.key] = {}; } }); });
(res && res.allocations ? res.allocations : []).forEach(function (a) {
if (!Object.prototype.hasOwnProperty.call(partition, a.demandKey)) return;
partition[a.demandKey] += (a.allocatedQty || 0);
var wh = gapStr_(a.sourceWarehouseId);
if (wh && (a.allocatedQty || 0) > 0) partitionBySource[a.demandKey][wh] = (partitionBySource[a.demandKey][wh] || 0) + (a.allocatedQty || 0);
});
});
var rc = 0; for (var k in partition) if (Object.prototype.hasOwnProperty.call(partition, k)) rc++;
return { contendedSkus: contendedSkus, partition: partition, partitionBySource: partitionBySource, issues: issues, contendedSkuCount: Object.keys(contendedSkus).length, contendedReceiverCount: rc };
}




function gapOpRunFactoryContentionPrepass_(io, ss, poolFacts) {
var discovery = gapOpFindFactoryContentionCandidates_(ss, poolFacts);
if (!discovery.candidateScopeCount) {
return { contention: { contendedSkus: {}, partition: {} }, candidateSkuCount: discovery.candidateSkuCount,
candidateScopeCount: 0, harvestedReceiverCount: 0, contendedSkuCount: 0, contendedReceiverCount: 0, issues: [] };
}
var harvested = gapOpHarvestReceivers_(discovery.candidateScopes, io, ss, poolFacts, { skuFilter: discovery.candidateSkus });
var contention = gapOpComputeFactoryContention_(harvested.receivers, poolFacts);
return { contention: { contendedSkus: contention.contendedSkus, partition: contention.partition },
candidateSkuCount: discovery.candidateSkuCount, candidateScopeCount: discovery.candidateScopeCount,
harvestedReceiverCount: harvested.receivers.length, contendedSkuCount: contention.contendedSkuCount,
contendedReceiverCount: contention.contendedReceiverCount, issues: contention.issues };
}






function handleRecalculateInventoryReplenishmentGapBatch_(body, io) {
if (!io) {
var ctx = gapCalcResolveContext_('INVENTORY');
if (!ctx.ok) return gapBatchEnvelope_(false, null, ctx.code, ctx.message);
io = gapMaterializationDefaultIo_(ctx);
}
return gapRunBatch_(body, io, { product: 'INVENTORY', table: INV_GAP_TABLE_, headers: INV_GAP_HEADERS_, map: gapInvMapFromLines_ });
}













function gapOpHarvestReceivers_(scopes, io, ss, poolFacts, opts) {
opts = opts || {};
var skuFilter = opts.skuFilter || null;
var receivers = [], envByScope = {}, s, scope, env, lines, calcMonth = '';
for (s = 0; s < scopes.length; s++) {
scope = scopes[s];
var reqBody = { requestId: 'GAP-OP-H-' + (scope.company + '/' + scope.country + '/' + scope.marketplace), payload: { scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace }, pagination: { page: 1, size: GAP_MAX_SKUS_ } } };
try { env = io.workspaceGet(reqBody, ss); } catch (e) { env = null; }
envByScope[scope.company + '||' + scope.country + '||' + scope.marketplace] = env;
if (!env || env.success !== true) continue;
if (!calcMonth && env.meta && env.meta.calculationMonth) calcMonth = gapStr_(env.meta.calculationMonth);
lines = (env.data && env.data.lines) ? env.data.lines : [];
var country = gapCanonCountry_(scope.country), pkey = scope.company + '||' + country + '||' + scope.marketplace;
lines.forEach(function (L) {
if (!L || L.recommendationMode !== 'MARKETPLACE_ORDER_NEED' || L.blocked) return;
var sku = gapStr_(L.sku); if (!sku) return;
if (skuFilter && !skuFilter[sku]) return;
var demandQty = gapNum_(L.allocatedForecastQty); if (demandQty === null) return;
var mp = L.monthlyProjection; if (!mp || !mp.length || !gapStr_(mp[0].month)) return;
receivers.push({ company: scope.company, country: country, marketplace: scope.marketplace, sku: sku,
demandQty: demandQty, requiredByDate: gapStr_(mp[0].month) + '-01',
gapQty: gapNum_(L.calculatedGap),





allocationPriority: (poolFacts.priorityByMkt[pkey] != null ? poolFacts.priorityByMkt[pkey] : null),
key: gapReceiverKey_(scope.company, country, scope.marketplace, sku) });
});
}
return { receivers: receivers, envByScope: envByScope, calculationMonth: calcMonth };
}







// b4: the overseas stock of this platform line's company / canonical country / SKU that is NOT offered for transfer, with its reason.
function gapOpPoolHeldNote_(poolFacts, scope, sku, lines) {
if (!(lines || []).some(function (L) { return L && L.recommendationMode === 'MARKETPLACE_ORDER_NEED' && L.blocked !== true; })) return '';
var k = gapStr_(scope.company) + '||' + gapCanonCountry_(scope.country) + '||' + gapStr_(sku);
var ku = '||' + gapCanonCountry_(scope.country) + '||' + gapStr_(sku);   // a 3PL of UNKNOWN company: listed on every row of its country / SKU (owner never guessed)
var t = ((poolFacts && poolFacts.heldOverseasPools) || []).filter(function (h) { return h && (h.key === k || (h.reason === 'WAREHOUSE_COMPANY_UNKNOWN' && h.key === ku)); }).map(function (h) { return gapNoteTok_(h.warehouseId) + '=' + gapNoteTok_(h.reason) + (typeof h.physicalQty === 'number' ? ':' + gapNoteNum_(h.physicalQty) : ''); });
return t.length ? ' | OVERSEAS_POOL_HELD (not offered for transfer): ' + gapNoteList_(t) : '';
}
function gapProcessOrderPlanningScopeSlice_(scopes, io, ss, sheet, poolFacts, map, contention, runId) {   // D5-V3-R5G: runId optional
var acc = { scopesCalculated: 0, written: 0, ready: 0, blocked: 0, errors: 0, scopeErrors: [], allocationIssues: [], receiversConsidered: 0, scopesReprojected: 0, calculatedAt: null, contendedSkuCount: 0, contendedReceiverCount: 0 };
var ts = gapBatchTimestamp_(io);
acc.calculatedAt = ts;


var harvested = gapOpHarvestReceivers_(scopes, io, ss, poolFacts);
var receivers = harvested.receivers, envByScope = harvested.envByScope, s, scope;



var effectiveContention = (contention != null) ? contention : gapOpComputeFactoryContention_(receivers, poolFacts);
acc.contendedSkuCount = (effectiveContention && effectiveContention.contendedSkus) ? Object.keys(effectiveContention.contendedSkus).length : 0;
acc.contendedReceiverCount = (effectiveContention && effectiveContention.partition) ? Object.keys(effectiveContention.partition).length : 0;


var alloc = gapOpBuildSupplyAllocation_(receivers, poolFacts, effectiveContention);
acc.allocationIssues = alloc.issues; acc.receiversConsidered = receivers.length;
var allocMap = alloc.byReceiverKey, scopeHasAlloc = {};


var refusedBy = {};
(alloc.issues || []).forEach(function (i) { (i.receiverKeys || []).forEach(function (k) { if (!refusedBy[k]) refusedBy[k] = i.code; }); });


var f41CalcDate = (gapStr_(harvested.calculationMonth) ? harvested.calculationMonth + '-01' : '');
acc.factorySurplusReallocation = gapOpApplyFactorySurplusReallocation_(allocMap, receivers, poolFacts, f41CalcDate);
receivers.forEach(function (r) { var a = allocMap[r.key]; if (a && (a.overseasCoveredQty > 0 || a.factoryCoveredQty > 0)) scopeHasAlloc[r.company + '||' + r.country + '||' + r.marketplace] = 1; });


for (s = 0; s < scopes.length; s++) {
scope = scopes[s];
var envKey = scope.company + '||' + scope.country + '||' + scope.marketplace;
var canonKey = scope.company + '||' + gapCanonCountry_(scope.country) + '||' + scope.marketplace;
var env2;
if (scopeHasAlloc[canonKey]) {
var reqBody2 = { requestId: 'GAP-OP-M-' + (scope.company + '/' + scope.country + '/' + scope.marketplace), payload: { scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace }, pagination: { page: 1, size: GAP_MAX_SKUS_ }, supplyAllocationByReceiver: allocMap } };
try { env2 = io.workspaceGet(reqBody2, ss); } catch (e2) { env2 = null; }
if (env2 && env2.success === true) acc.scopesReprojected++;
} else {
env2 = envByScope[envKey];
}
if (!env2 || env2.success !== true) {
acc.errors++;
acc.scopeErrors.push({ scope: envKey, code: (env2 && env2.errors && env2.errors[0] && env2.errors[0].code) || 'SCOPE_CALCULATION_FAILED' });
continue;
}
acc.scopesCalculated++;
var calcAuthority = (env2.meta && env2.meta.calculationMonth) || '';
var lines2 = (env2.data && env2.data.lines) ? env2.data.lines : [];
var bySku = {}; lines2.forEach(function (L) { var k = gapStr_(L.sku); if (!k) return; (bySku[k] = bySku[k] || []).push(L); });
for (var sku2 in bySku) {
if (!Object.prototype.hasOwnProperty.call(bySku, sku2)) continue;
var rc = refusedBy[gapReceiverKey_(scope.company, gapCanonCountry_(scope.country), scope.marketplace, sku2)];
// D5-V3-R2 (review M1, OD-3): a factory pool whose reserved stock is invalid (non-numeric, negative or above current) is not
// offered (never guessed); the affected SKU is now FLAGGED - its row is BLOCKED with the warehouse(s) named - instead of
// staying READY on a silently missing pool. Inventory is never modified here.
if (!rc) { var piW = {}; (poolFacts && poolFacts.poolIssues || []).forEach(function (pi) { if (gapStr_(pi.sku) !== sku2) return; var c_ = gapStr_(pi.code) || 'FACTORY_RESERVED_STOCK_INVALID'; (piW[c_] = piW[c_] || []); if (piW[c_].indexOf(gapStr_(pi.warehouseId)) === -1) piW[c_].push(gapStr_(pi.warehouseId)); });   // b5: each pool issue keeps its own code
if (Object.keys(piW).length) rc = Object.keys(piW).sort().map(function (c_) { return c_ + ': ' + piW[c_].sort().join(','); }).join('; '); }
var row = map(rc ? [{ blocked: true, blockedReason: rc }] : bySku[sku2], scope, sku2, calcAuthority);
if (!rc && row.calculation_status === 'READY') { var phn_ = gapOpPoolHeldNote_(poolFacts, scope, sku2, bySku[sku2]); if (phn_) row.note = row.note ? row.note + phn_ : phn_.slice(3); }   // b4
row.calculated_at = ts; row.updated_at = ts;
row.note = gapNoteFinalize_(row.note, gapNoteIdentity_((env2.meta && env2.meta.calculationDate) || '', ts, runId, gapNoteTz_(io)), row.calculation_status !== 'READY');   // D5-V3-R5G/R5H
gapUpsertByKey_(sheet, row);
acc.written++;
if (row.calculation_status === 'READY') acc.ready++;
else if (row.calculation_status === 'BLOCKED') { acc.blocked++; gapTallyBlocked_(acc, row.note); }
else acc.errors++;
}
}
return acc;
}





function handleRecalculateOrderPlanningGapBatch_(body, io) {
if (!io) {
var opCtx = gapCalcResolveContext_('ORDER_PLANNING');
if (!opCtx.ok) return gapBatchEnvelope_(false, null, opCtx.code, opCtx.message);
io = gapMaterializationDefaultIo_(opCtx);
}
try {
var ss = io.openTarget();
var sheet = prodRequireSheet_(ss, OP_GAP_TABLE_, OP_GAP_HEADERS_);
var scopes = io.enumerateScopes ? io.enumerateScopes(ss) : gapEnumerateScopes_(ss);
var poolFacts = io.readSupplyPoolFacts ? io.readSupplyPoolFacts(ss) : gapOpReadSupplyPoolFacts_(ss);
var opRunId = gapRunId_('ORDER_PLANNING', io);   // D5-V3-R5G: the OP batch now names its run like the Inventory batch
var acc = gapProcessOrderPlanningScopeSlice_(scopes, io, ss, sheet, poolFacts, gapOpMapFromLines_, undefined, opRunId);
var summary = { product: 'ORDER_PLANNING', materializationRunId: opRunId, totalScopes: scopes.length, scopesCalculated: acc.scopesCalculated, ready: acc.ready, blocked: acc.blocked, errors: acc.errors, written: acc.written, calculatedAt: acc.calculatedAt, scopeErrors: acc.scopeErrors, allocationIssues: acc.allocationIssues, receiversConsidered: acc.receiversConsidered, scopesReprojected: acc.scopesReprojected };
return gapBatchEnvelope_(true, summary);
} catch (e) {
var token = (e && e.safetyToken) ? e.safetyToken : (e && e.schemaStatus) ? e.schemaStatus : 'GAP_BATCH_ERROR';
return gapBatchEnvelope_(false, null, token, e && e.message ? String(e.message) : String(e));
}
}







function gapReadScopeRows_(body, io, cfg) {
io = io || gapMaterializationDefaultIo_();
var reqId = (body && body.requestId) || null;
var srcRev = (typeof kmSrcRevGet_ === 'function') ? kmSrcRevGet_() : null;
try {
var payload = (body && body.payload) || body || {};
var scope = payload.scope || payload || {};
var company = gapStr_(scope.company), country = gapStr_(scope.country), marketplace = gapStr_(scope.marketplace), sku = gapStr_(scope.sku);
if (!company || !country || !marketplace) return gapBatchEnvelope_(false, null, 'INVALID_SCOPE', 'company + country + marketplace required');
var ss = io.openTarget();
var sheet = prodRequireSheet_(ss, cfg.table, cfg.headers);
var all = gapReadObjects_(ss, cfg.table);
var lc = function (v) { return gapStr_(v).toLowerCase(); };
var rows = [];
all.forEach(function (r) {
if (lc(r.company) !== lc(company) || lc(r.country) !== lc(country) || lc(r.marketplace) !== lc(marketplace)) return;
if (sku && lc(r.sku) !== lc(sku)) return;
var out = {}; for (var i = 0; i < cfg.headers.length; i++) { var h = cfg.headers[i]; out[h] = (r[h] === undefined ? null : r[h]); }
rows.push(out);
});
var env = gapBatchEnvelope_(true, { product: cfg.product, scope: { company: company, country: country, marketplace: marketplace, sku: sku || null }, rows: rows, requestId: reqId });
env.meta.sourceRevision = srcRev;
return env;
} catch (e) {
var token = (e && e.safetyToken) ? e.safetyToken : (e && e.schemaStatus) ? e.schemaStatus : 'GAP_READ_ERROR';
return gapBatchEnvelope_(false, null, token, e && e.message ? String(e.message) : String(e));
}
}
function handleGetInventoryReplenishmentGap_(body, io) {
return gapReadScopeRows_(body, io, { product: 'INVENTORY', table: INV_GAP_TABLE_, headers: INV_GAP_HEADERS_ });
}
function handleGetOrderPlanningGap_(body, io) {
return gapReadScopeRows_(body, io, { product: 'ORDER_PLANNING', table: OP_GAP_TABLE_, headers: OP_GAP_HEADERS_ });
}








var GAP_MAT_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-AD1B';   // PGSC1N1: new module stamp (registration per build-production-profile.cjs:37,42,43)
