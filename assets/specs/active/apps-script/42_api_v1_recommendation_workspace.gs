




























var RECO_WS_SEQ_ = 0;
var RECO_WS_PAGE_MAX_ = 100;
var RECO_WS_PAGE_DEFAULT_ = 50;









var RECO_WS_HANDLER_VERSION_ = 'dc2-r2-f7';






var RECO_WS_BUILD_VERSION_ = "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R68-R15G-AV1-V3A10-A2B12-AD1B";




function recoWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function recoWsNum_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function recoWsIsObj_(x) { return x && typeof x === 'object' && !Array.isArray(x); }







function recoWsYmd_(v) {
if (v == null || v === '') return '';
if (Object.prototype.toString.call(v) === '[object Date]') {
if (isNaN(v.getTime())) return recoWsStr_(v);
return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
}
var s = recoWsStr_(v);
var a = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); if (a) return a[1] + '-' + ('0' + a[2]).slice(-2) + '-' + ('0' + a[3]).slice(-2);
var b = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); if (b) return b[3] + '-' + ('0' + b[1]).slice(-2) + '-' + ('0' + b[2]).slice(-2);
return s;
}

// D5F1 (D5: an event is added once and never silently omitted) - fc_special_events date cells reach this file as Date
// values (getValues, and the serial date map of 60_ SIR_B1_DATE_MAP_ which declares event_start_date/event_end_date).
// KMPD reads YYYY-MM-DD text only, so a Date cell made the whole event vanish from horizons, tiers and pre-T1 alike while
// the Avg-Sales exclusion (recoWsYmd_, above) still removed its selling days. Normalize the two event date fields with
// that SAME recoWsYmd_ before any KMPD call. Returns copies; the cached snapshot rows are never mutated.
function recoWsEventRowsYmd_(rows) {
return (rows || []).map(function (r) {
var o = {}; for (var k in r) { if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k]; }
if (o.event_start_date != null && o.event_start_date !== '') o.event_start_date = recoWsYmd_(o.event_start_date);
if (o.event_end_date != null && o.event_end_date !== '') o.event_end_date = recoWsYmd_(o.event_end_date);
return o;
});
}

// D5F1-R2 (reviewer m1/m2) - an invalid in-scope special event (start missing / not a real date, end not a real date,
// end before start) or an unusable calculation date while such events exist makes the SKU's calculation INCOMPLETE:
// the line is BLOCKED with a typed reason (43_ writes the row BLOCKED with that note). Never "no filter", never 0, and
// the source rows are not touched. Validation authority = KMPD.validateScopedEvents (the same rules KMPD applies inside).
function recoWsEventCheck_(evtRows, scope, sku, calc) {
if (typeof KMPD === 'undefined' || !KMPD || typeof KMPD.validateScopedEvents !== 'function') return { ok: true, issues: [] };
return KMPD.validateScopedEvents(evtRows, scope, sku, calc ? calc.calculationDate : null);
}
function recoWsEventBlockedLine_(destination, mode, sku, siteSku, evChk, vmeta) {
var codes = [];
(evChk.issues || []).forEach(function (x) { var c = x.code + (x.eventId ? '@' + x.eventId : ''); if (codes.indexOf(c) === -1) codes.push(c); });
var reason = 'SPECIAL_EVENT_INVALID: ' + codes.slice(0, 5).join('; ') + (codes.length > 5 ? '; +' + (codes.length - 5) + ' more' : '');
return KMDR.buildRecommendationLine({ destination: destination, recommendationMode: mode, sku: sku, siteSku: siteSku, blocked: true, blockedReason: reason,
formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf,
diagnostics: { issues: (evChk.issues || []).map(function (x) { return { code: x.code, message: 'special event ' + (x.eventId || '(no id)') + (x.got != null ? ' calculationDate=' + x.got : '') + ' - calculation incomplete' }; }) } });
}

// D5-V3 (OD-3): pre-dispatch (draft / ready_to_ship) shipment lines resolved to THIS marketplace destination, with remaining
// quantity, whose ETA is not a real YYYY-MM-DD date. Returns the sorted, de-duplicated shipment ids (empty = nothing to flag).
// P3PL-2 (Owner 2026-11-21: any site may ship to a LEGAL 3PL). The receiver of a shipment line is its frozen lineage (KMSLS); its
// physical destination is shipments.destination_warehouse_id. For a PLATFORM (marketplace-mode) site a line that it owns by lineage but
// that is bound for a 3PL warehouse arrives at the 3PL on its ETA - NOT a marketplace (FBA) sellable date. The 3PL -> marketplace
// leg / handling / putaway is B-Q1 (unresolved): UNKNOWN, never 0 days. Returns those open lines (RESOLVED to this site, 3PL
// destination, active status = KMDR ACTIVE_INCOMING_STATUS, remaining > 0). Read only. Receipt still posts to the 3PL only (31_).
var RECO_WS_P3PL_ACTIVE_ = { draft: 1, shipped: 1, in_transit: 1, arrived: 1, ready_to_ship: 1, approved: 1, partially_received: 1, partial_received: 1 };   // = KMDR ACTIVE_INCOMING_STATUS
function recoWsPlatformVia3pl_(read, sku, whRows, mktRows, destination) {
if (typeof KMDR === 'undefined' || !KMDR || typeof KMDR.resolveMarketplaceIncomingIdentity !== 'function' || typeof KMSLS === 'undefined') return [];
var raw = ((recoWsShipmentLineCandidates_(read).candidates) || []).filter(function (e) { return e && e.candidate && recoWsStr_(e.candidate.sku) === sku; });
if (!raw.length) return [];
var t3 = {}; (whRows || []).forEach(function (w) { var id = recoWsStr_(w && w.warehouse_id); if (id && recoWsStr_(w.warehouse_type).toUpperCase() === '3PL') t3[id] = 1; });
var ids = KMDR.resolveMarketplaceIncomingIdentity({ candidates: raw.map(function (e) { return KMSLS.toMarketplaceIncomingCandidate(e); }), marketplaces: mktRows, scope: destination || {} });
var out = [];
for (var i = 0; i < raw.length; i++) {
var c = raw[i].candidate, r = ids[i] || {};
if (r.resolutionStatus !== 'RESOLVED') continue;
var wid = recoWsStr_(c.destinationWarehouseId); if (!wid || !t3[wid]) continue;
var st = recoWsStr_(c.status).toLowerCase(); if (RECO_WS_P3PL_ACTIVE_[st] !== 1) continue;
var q = recoWsNum_(c.quantityRemaining); if (q === null || q <= 0) continue;
out.push({ shipmentId: recoWsStr_(c.linkedShipmentId) || null, shipmentLineId: recoWsStr_(c.linkedShipmentLineId) || null, lineageKey: recoWsStr_(c.lineageKey) || null, destinationWarehouseId: wid, qty: q, status: st, threePlEta: recoWsYmd_(c.eta) || null, marketplaceAvailableDate: null, reason: 'THREE_PL_TO_MARKETPLACE_LEG_UNKNOWN', decision: 'B-Q1' });
}
return out;
}
function recoWsPreDispatchEtaGaps_(candidates, mktRows, destination) {
if (typeof KMDR === 'undefined' || !KMDR || typeof KMDR.resolveMarketplaceIncomingIdentity !== 'function') return [];
var cands = candidates || [];
var ids = KMDR.resolveMarketplaceIncomingIdentity({ candidates: cands, marketplaces: mktRows, scope: destination || {} });
var out = [];
for (var i = 0; i < cands.length; i++) {
var c = cands[i] || {}, r = ids[i] || {};
if (r.resolutionStatus !== 'RESOLVED') continue;
var st = recoWsStr_(c.status).toLowerCase(); if (st !== 'draft' && st !== 'ready_to_ship') continue;
var q = recoWsNum_(c.quantityRemaining); if (q === null || q <= 0) continue;
var eta = recoWsYmd_(c.eta);   // D5-V3-R5C (F-1): Date cell / 'YYYY/MM/DD' text normalised first
if (/^\d{4}-\d{2}-\d{2}$/.test(eta) && !isNaN(Date.parse(eta + 'T00:00:00Z'))) continue;
var id = recoWsStr_(c.shipmentId) || recoWsStr_(c.ref) || ('#' + i);
if (out.indexOf(id) === -1) out.push(id);
}
return out.sort();
}

// D5-V3-R2 (review m1, D1): label the dated supply events of a line - PLANNED (a created-but-unconfirmed Shipment:
// draft / ready_to_ship), SHIPPED in transit, ONGOING PO - separately. Pure labelling; the quantities used are unchanged.
function recoWsSupplyBreakdown_(events, statusById) {
var b = { plannedShipmentQty: 0, inTransitQty: 0, ongoingQty: 0, otherQty: 0 };
(events || []).forEach(function (e) {
var q = recoWsNum_(e && e.qty); if (q === null) return;
var st = recoWsStr_((statusById || {})[recoWsStr_(e.incomingId)]).toLowerCase();
var srcT = recoWsStr_(e && e.sourceType).toUpperCase();
if (srcT === 'PLANNED_SHIPMENT' || st === 'draft' || st === 'ready_to_ship') b.plannedShipmentQty += q;
else if (srcT.indexOf('ONGOING') === 0) b.ongoingQty += q;
else if (st || srcT === 'KM') b.inTransitQty += q;
else b.otherQty += q;
});
return b;
}

function recoWsRequestId_(provided, io) {
var p = recoWsStr_(provided);
if (/^REQ-[A-Za-z0-9_-]{1,40}$/.test(p)) return p;
var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
return 'REQ-S' + ('000000' + seq).slice(-6);
}
function recoWsEnvelope_(ok, data, errors, meta) {
var m = { apiVersion: '1', source: 'recommendation.workspace.get', workspace: 'recommendation', mode: 'WORKSPACE', cached: false, recommendationWorkspaceHandlerVersion: RECO_WS_HANDLER_VERSION_,
sourceRevision: RECO_WS_SRC_REV_ };
if (meta) { for (var k in meta) m[k] = meta[k]; }
return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}
function recoWsErr_(code, message, details) { return { code: code, message: String(message == null ? code : message), details: (details === undefined ? null : details) }; }





function validateRecommendationWorkspaceRequest_(payload) {
payload = recoWsIsObj_(payload) ? payload : {};
var scope = recoWsIsObj_(payload.scope) ? payload.scope : {};
var company = recoWsStr_(scope.company), country = recoWsStr_(scope.country), marketplace = recoWsStr_(scope.marketplace);
if (!company || !country || !marketplace) return { ok: false, error: recoWsErr_('VALIDATION_FAILED', 'scope.company/country/marketplace are mandatory (no implicit first company/marketplace)', { scope: scope }) };
if (recoWsIsObj_(payload.filters) && payload.filters.demandDriver && recoWsStr_(payload.filters.demandDriver).toUpperCase() !== 'FORECAST') {
return { ok: false, error: recoWsErr_('UNSUPPORTED_PHASE1_DEMAND_DRIVER', 'Phase-1 demandDriver is FORECAST only; no client override') };
}
var filters = recoWsIsObj_(payload.filters) ? payload.filters : {};
var pg = recoWsIsObj_(payload.pagination) ? payload.pagination : {};
var size = recoWsNum_(pg.size); size = (size && size > 0) ? Math.min(Math.floor(size), RECO_WS_PAGE_MAX_) : RECO_WS_PAGE_DEFAULT_;
var page = recoWsNum_(pg.page); page = (page && page > 0) ? Math.floor(page) : 1;
return {
ok: true,
scope: { company: company, country: country, marketplace: marketplace, sku: recoWsStr_(scope.sku) || recoWsStr_(filters.sku) || null, siteSku: recoWsStr_(scope.siteSku) || recoWsStr_(filters.siteSku) || null },
filters: { sku: recoWsStr_(scope.sku) || recoWsStr_(filters.sku) || null, siteSku: recoWsStr_(scope.siteSku) || recoWsStr_(filters.siteSku) || null, category: recoWsStr_(filters.category) || null, series: recoWsStr_(filters.series) || null },
page: page, size: size, include: recoWsIsObj_(payload.include) ? payload.include : {},
formulaVersion: recoWsStr_(payload.formulaVersion) || null, sourceDataAsOf: recoWsStr_(payload.sourceDataAsOf) || null,


supplyAllocationByReceiver: recoWsIsObj_(payload.supplyAllocationByReceiver) ? payload.supplyAllocationByReceiver : null,
deprecatedCompat: { destinationWarehouseId: recoWsStr_(payload.destinationWarehouseId) || null, calculationMonth: recoWsStr_(payload.calculationMonth) || null, planningCycle: recoWsStr_(payload.planningCycle) || null }
};
}




function recoWsResolveCalcContext_(io) {
var raw = recoWsStr_((io && typeof io.configMonth === 'function') ? io.configMonth() : '');
if (!raw) return { ok: false, error: recoWsErr_('RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED', 'RECOMMENDATION_CALCULATION_MONTH is not configured (no clock fallback)') };
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return { ok: false, error: recoWsErr_('RECOMMENDATION_CALCULATION_MONTH_INVALID', 'RECOMMENDATION_CALCULATION_MONTH must be YYYY-MM (got "' + raw + '")') };
return { ok: true, calculationMonth: raw, planningCycle: 'RECO-' + raw };
}





function recoWsResolveCalcDate_(io) {
var raw = recoWsStr_((io && typeof io.configDate === 'function') ? io.configDate() : '');
if (!raw) return { ok: false, error: recoWsErr_('RECOMMENDATION_CALCULATION_DATE_NOT_CONFIGURED', 'RECOMMENDATION_CALCULATION_DATE is not configured (no clock fallback)') };
if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(raw)) return { ok: false, error: recoWsErr_('RECOMMENDATION_CALCULATION_DATE_INVALID', 'RECOMMENDATION_CALCULATION_DATE must be YYYY-MM-DD (got "' + raw + '")') };
return { ok: true, calculationDate: raw };
}


function recoWsHorizonWindowMonths_(calcDate, maxDays) {
var y = +calcDate.slice(0, 4), m = +calcDate.slice(5, 7), d = +calcDate.slice(8, 10);
function leap(Y) { return (Y % 4 === 0 && Y % 100 !== 0) || (Y % 400 === 0); }
function dim(Y, M) { return [31, leap(Y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][M - 1]; }
function key(Y, M) { return Y + '-' + (M < 10 ? '0' : '') + M; }
var seen = {}, out = []; function add(Y, M) { var k = key(Y, M); if (!seen[k]) { seen[k] = 1; out.push(k); } }
add(y, m);
for (var i = 0; i < maxDays; i++) { d++; if (d > dim(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; } } add(y, m); }
return out;
}





function recoWsResolvePlanningModel_(read, scope, sku) {
var rows = recoWsRows_(read, 'marketplaceSkus');
for (var i = 0; i < rows.length; i++) {
var r = rows[i];
if (recoWsStr_(r.sku) !== sku) continue;
if (recoWsStr_(r.company) !== '' && recoWsStr_(r.company) !== scope.company) continue;
if (recoWsStr_(r.country) !== scope.country || recoWsStr_(r.marketplace) !== scope.marketplace) continue;
var m = recoWsStr_(r.replenishment_model);
return m === '' ? 'sales_driven' : m;
}
return 'sales_driven';
}

















function recoWsBuildContaminationFacts_(read, scope, sku, mSkuId) {
var snaps = read.snapshots || {};








var campPresent = recoWsIsObj_(snaps.campaigns) && recoWsIsObj_(snaps.campaignSkuLines);
var evtPresent = recoWsIsObj_(snaps.fcSpecialEvents);
var campaigns = [];
if (campPresent) {
var linesByCampaign = {};
recoWsRows_(read, 'campaignSkuLines').forEach(function (r) {
var cid = recoWsStr_(r.campaign_id); if (!cid) return;
(linesByCampaign[cid] = linesByCampaign[cid] || []).push({ marketplaceSkuId: recoWsStr_(r.marketplace_sku_id) || null, sku: recoWsStr_(r.sku) });
});
recoWsRows_(read, 'campaigns').forEach(function (c) {
var cid = recoWsStr_(c.campaign_id); if (!cid) return;
var lines = linesByCampaign[cid] || [];


var touches = lines.some(function (ln) { return (mSkuId && ln.marketplaceSkuId === mSkuId) || (ln.sku && recoWsStr_(ln.sku) === sku); });
if (!touches) return;
campaigns.push({ status: recoWsStr_(c.status), start: recoWsYmd_(c.start_date), end: recoWsYmd_(c.end_date), skuLines: lines });
});
}
var events = [];
if (evtPresent) {
recoWsRows_(read, 'fcSpecialEvents').forEach(function (r) {
if (recoWsStr_(r.sku) !== sku) return;
events.push({ sku: recoWsStr_(r.sku), status: recoWsStr_(r.status), marketplaceId: recoWsStr_(r.marketplace_id) || null,
company: recoWsStr_(r.company), country: recoWsStr_(r.country), marketplace: recoWsStr_(r.marketplace),
start: recoWsYmd_(r.event_start_date) || recoWsYmd_(r.eventStartDate), end: recoWsYmd_(r.event_end_date) || recoWsYmd_(r.eventEndDate) });
});
}
return { ok: true, campaigns: campaigns, events: events, sourceStatus: { campaigns: campPresent ? 'PRESENT' : 'ABSENT', events: evtPresent ? 'PRESENT' : 'ABSENT' } };
}

















function recoWsResolveSalesRate_(read, scope, sku, calcDate) {
var snaps = read.snapshots || {};
if (typeof KMCALC === 'undefined' || !KMCALC || typeof KMCALC.normalizedAvgSalesPerDay !== 'function') return { ok: false, reason: 'SALES_RUNTIME_UNAVAILABLE' };
if (!calcDate) return { ok: false, reason: 'CALCULATION_DATE_NOT_CONFIGURED' };




var recoWsCanonC = function (v) { return (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.canonicalCountryCode === 'function') ? KMCID.canonicalCountryCode(v) : recoWsStr_(v).toUpperCase(); };
var scopeCountryC = recoWsCanonC(scope.country);






var srcSet = (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.sourceCountriesForScope === 'function')
? KMCID.sourceCountriesForScope(scope.country, scope.marketplace) : { members: [scopeCountryC], aggregate: false };
var srcMembers = {}; srcSet.members.forEach(function (m) { srcMembers[m] = 1; });
function recoWsInSrc_(c) { return srcMembers[recoWsCanonC(c)] === 1; }












var blankDates = 0;
var daily = recoWsRows_(read, 'amazonDailySalesSnapshot').filter(function (r) {
if (recoWsStr_(r.sku) !== sku || !recoWsInSrc_(r.country) || recoWsStr_(r.marketplace) !== scope.marketplace) return false;
if (recoWsStr_(r.snapshot_date) === '') { blankDates++; return false; }
return true;
});
var weeklyAll = recoWsRows_(read, 'amazonWeeklySalesSnapshot').filter(function (r) {
return recoWsStr_(r.sku) === sku && recoWsInSrc_(r.country) && recoWsStr_(r.marketplace) === scope.marketplace;
});












function toYmd(v) { return recoWsYmd_(v); }


function undatedNote() { return blankDates ? ' (' + blankDates + ' undated rows skipped)' : ''; }




function srcNote() {
var dAll = recoWsRows_(read, 'amazonDailySalesSnapshot'), wAll = recoWsRows_(read, 'amazonWeeklySalesSnapshot');
function forSku(rows) { var t = 0; for (var i = 0; i < rows.length; i++) { if (recoWsStr_(rows[i].sku) === sku) t++; } return t; }
return ' [daily ' + (recoWsIsObj_(snaps.amazonDailySalesSnapshot) ? 'PRESENT' : 'ABSENT') + ', ' + dAll.length + ' rows, ' + forSku(dAll) + ' for this SKU'
+ '; weekly ' + (recoWsIsObj_(snaps.amazonWeeklySalesSnapshot) ? 'PRESENT' : 'ABSENT') + ', ' + wAll.length + ' rows, ' + forSku(wAll) + ' for this SKU]';
}
var calcYmd = toYmd(calcDate);
var dailyKeySet = {}, dailyIssue = null;
daily.forEach(function (r) {
var day = toYmd(r.snapshot_date), units = recoWsNum_(r.sales_units);
if (!recoWsValidYmd_(day) || units === null || units < 0) { dailyIssue = 'DAILY_SALES_ROW_INVALID'; return; }
var key = [recoWsCanonC(r.country), recoWsStr_(r.marketplace), recoWsStr_(r.channel), sku, day].join('||');
if (dailyKeySet[key]) dailyIssue = 'DAILY_SALES_DUPLICATE_KEY';
dailyKeySet[key] = true;
});
if (dailyIssue) return { ok: false, reason: 'SALES_BASIS_UNAVAILABLE', detail: dailyIssue, blankDateRows: blankDates };




var channel, kmcalcChannel, weekly7d = 0, weeklyOk = false, dailySales;
if (srcSet.aggregate) {





if (!daily.length && !weeklyAll.length) return { ok: false, reason: 'SALES_BASIS_UNAVAILABLE', detail: 'no daily or weekly rows for EU source set [' + srcSet.members.join(',') + '] @ ' + recoWsStr_(scope.marketplace) + undatedNote() + srcNote(), blankDateRows: blankDates };
channel = 'EU_AGG'; kmcalcChannel = channel;


var byDate = {};
daily.forEach(function (r) { var d = toYmd(r.snapshot_date); var u = recoWsNum_(r.sales_units); byDate[d] = (byDate[d] || 0) + ((u === null || u < 0) ? 0 : u); });
dailySales = Object.keys(byDate).sort().map(function (d) { return { date: d, sku: sku, units: byDate[d], company: scope.company, country: scope.country, marketplace: scope.marketplace, channel: channel }; });


srcSet.members.forEach(function (m) {
var mr = weeklyAll.filter(function (r) { return recoWsCanonC(r.country) === m; });
if (!mr.length) return;
mr.sort(function (a, b) { return recoWsCmp_(recoWsStr_(a.week_end_date), recoWsStr_(b.week_end_date)); });
var wv = recoWsNum_(mr[mr.length - 1].sales_units_7d);
if (wv !== null && wv >= 0) { weekly7d += wv; weeklyOk = true; }
});
} else {

var chSource = daily.length ? daily : weeklyAll;
if (!chSource.length) return { ok: false, reason: 'SALES_BASIS_UNAVAILABLE', detail: 'no daily or weekly rows @ ' + scopeCountryC + '/' + recoWsStr_(scope.marketplace) + undatedNote() + srcNote(), blankDateRows: blankDates };
var chSet = {}; chSource.forEach(function (r) { chSet[recoWsStr_(r.channel)] = 1; });
var chKeys = Object.keys(chSet);
if (chKeys.length !== 1) return { ok: false, reason: 'SALES_BASIS_AMBIGUOUS', detail: 'channels=' + chKeys.length + ' [' + chKeys.map(function (c) { return c || '(blank)'; }).join(',') + ']', blankDateRows: blankDates };
channel = chKeys[0];



kmcalcChannel = (!daily.length && !channel) ? 'WEEKLY_ONLY' : channel;
var weekly = weeklyAll.filter(function (r) { return recoWsStr_(r.channel) === channel; });
if (weekly.length) {
weekly.sort(function (a, b) { return recoWsCmp_(recoWsStr_(a.week_end_date), recoWsStr_(b.week_end_date)); });
var wv = recoWsNum_(weekly[weekly.length - 1].sales_units_7d);
if (wv !== null && wv >= 0) { weekly7d = wv; weeklyOk = true; }
}
dailySales = daily.map(function (r) {
return { date: toYmd(r.snapshot_date), sku: sku, units: recoWsNum_(r.sales_units), company: scope.company, country: scope.country, marketplace: scope.marketplace, channel: channel };
});
}



var mSkuSet = {};
recoWsRows_(read, 'marketplaceSkus').forEach(function (mr) {
if (recoWsStr_(mr.sku) !== sku || recoWsStr_(mr.company) !== scope.company
|| recoWsStr_(mr.country) !== scope.country || recoWsStr_(mr.marketplace) !== scope.marketplace) return;
var id = recoWsStr_(mr.marketplace_sku_id); if (id) mSkuSet[id] = 1;
});
var mSkuAll = Object.keys(mSkuSet);
if (mSkuAll.length > 1) return { ok: false, reason: 'MARKETPLACE_SKU_AMBIGUOUS', detail: mSkuAll.join(','), blankDateRows: blankDates };
var mSkuId = mSkuAll.length ? mSkuAll[0] : null;


var scopeMktId = null;
recoWsRows_(read, 'marketplaces').forEach(function (m) { if (scopeMktId) return; if (recoWsStr_(m.company) === scope.company && recoWsStr_(m.country) === scope.country && recoWsStr_(m.marketplace) === scope.marketplace) scopeMktId = recoWsStr_(m.marketplace_id) || null; });



var contam = recoWsBuildContaminationFacts_(read, scope, sku, mSkuId);
function compute(campaigns, events) {
return KMCALC.normalizedAvgSalesPerDay({
windowPolicy: 'calendar_30',
calcDate: calcYmd,
scope: { sku: sku, country: scope.country, marketplace: scope.marketplace, channel: kmcalcChannel, company: scope.company, marketplaceId: scopeMktId, marketplaceSkuId: mSkuId },
weekly7d: weekly7d, dailySales: dailySales, campaigns: campaigns, events: events
});
}

function ownerErr(e) { return (e && e.message) ? String(e.message).replace(/^supplyPlanningCalculations:\s*/, '').slice(0, 140) : '?'; }



var res;
try { res = compute(contam.campaigns, contam.events); }
catch (e) {
var m = ownerErr(e);
if ((contam.campaigns.length || contam.events.length) && /campaigns\[|events\[|marketplaceSkuId|marketplaceId/.test(m)) {
return { ok: false, reason: 'SALES_BASIS_CONTAMINATION_UNRESOLVED', detail: m, blankDateRows: blankDates };
}
return { ok: false, reason: 'SALES_BASIS_UNAVAILABLE', detail: 'run-rate owner error: ' + m, blankDateRows: blankDates };
}






if (res && res.source === 'weekly_7d' && !weeklyOk) {
return { ok: false, reason: 'SALES_BASIS_WEEKLY_UNAVAILABLE', blankDateRows: blankDates,
detail: 'normal days=' + res.normalDayCount + ' (below the 3-day rung), no readable weekly sales_units_7d @ '
+ scopeCountryC + '/' + recoWsStr_(scope.marketplace) + undatedNote() + srcNote() };
}
var v = (res && typeof res.avgSalesPerDay === 'number' && isFinite(res.avgSalesPerDay) && res.avgSalesPerDay >= 0) ? res.avgSalesPerDay : null;
if (v === null) return { ok: false, reason: 'SALES_BASIS_UNAVAILABLE', detail: 'non-finite avg (' + daily.length + ' daily rows)', blankDateRows: blankDates };
return { ok: true, avgSalesPerDay: v, source: res.source, warning: res.warning, normalDayCount: res.normalDayCount, excludedDates: res.excludedDates,
windowPolicy: res.windowPolicy, windowStart: res.windowStart, windowEnd: res.windowEnd, normalSalesUnits: res.normalSalesUnits,
contaminationSource: contam.sourceStatus, blankDateRows: blankDates };
}









// D5F1-R2 / D5-V3: special events are passed with the calculation date, so an event that ENDED before D is never demand
// (ending on D or in progress counts in full); the event demand date is its prep date (start - 45, OD-1 = B). Demand is
// computed ONCE for the site - it is never split by warehouse (V3-3).
// D5-V3-R3 (Owner m5 ruling, 2026-11-13): the line's `horizons` (Gap table / chart) keep every event at its prep date.
// The AI may create an event's replenishment only from the event's first-suggestion Monday (start - 45 -> Monday on/before).
// For each in-scope live event whose Monday is still AFTER the calculation date, the line also carries `aiHorizons` = the
// SAME projection (same opening, incoming, carton, mode) without those events, and `aiGatedEvents` naming them. Read-only,
// in-memory, no schema; 43_ / the Gap table ignore both fields.
function recoWsAiGateEvents_(evtRows, scope, sku, calc) {
var out = { rows: evtRows || [], gated: [] };
if (typeof KMPD === 'undefined' || !KMPD || typeof KMPD.eventDates !== 'function' || typeof KMPD.scopedSpecialEventPreps !== 'function') return out;
var cd = recoWsStr_(calc && calc.calculationDate); if (!/^\d{4}-\d{2}-\d{2}$/.test(cd)) return out;
var preps = []; try { preps = KMPD.scopedSpecialEventPreps(evtRows, scope, sku, cd) || []; } catch (eP) { return out; }
out.gated = preps.filter(function (p) { return p && p.firstSuggestionMonday && p.firstSuggestionMonday > cd; })
.map(function (p) { return { startDate: p.startDate, prepDate: p.prepDate, firstSuggestionMonday: p.firstSuggestionMonday, qty: p.qty }; });
if (!out.gated.length) return out;
out.rows = (evtRows || []).filter(function (r) { var ed = null; try { ed = KMPD.eventDates(r); } catch (eD) { ed = null; } return !(ed && ed.firstSuggestionMonday && ed.firstSuggestionMonday > cd); });
return out;
}
function recoWsBuildHorizons_(calc, fcRows, tgtRows, evtRows, skuMeta, scope, sku, openingSupplyQty, incomingEvents, unitsPerCarton, destination, demandMode, avgSalesPerDay, includeProjection) {
if (typeof KMHP === 'undefined' || !KMHP || typeof KMHP.projectHorizons !== 'function') return null;
if (!calc || !calc.calculationDate) return null;
var mode = (demandMode === 'sales_driven' || demandMode === 'forecast_driven') ? demandMode : 'forecast_driven';
var winMonths = recoWsHorizonWindowMonths_(calc.calculationDate, 90);
var hFc = {}, specialEventDemands = [];
if (typeof KMPD !== 'undefined' && KMPD && typeof KMPD.adjustedRegularFc === 'function') {


if (mode === 'forecast_driven') winMonths.forEach(function (ym) { var a = KMPD.adjustedRegularFc(fcRows, tgtRows, skuMeta, scope, sku, ym); if (a) hFc[ym] = a.adjusted; });
try { specialEventDemands = calc.siteInventoryDaily
? KMPD.scopedSpecialEventSellingDays(evtRows, scope, sku, calc.calculationDate)
: KMPD.scopedSpecialEventPreps(evtRows, scope, sku, calc.calculationDate); } catch (eSev) { return null; }
} else if (mode === 'forecast_driven') {
hFc = recoWsRegularForecastByMonth_(fcRows, scope, sku, winMonths);
}
var hr = KMHP.projectHorizons({ destination: destination || null, calculationDate: calc.calculationDate,
openingSupplyQty: openingSupplyQty, regularFcByMonth: hFc, specialEventDemands: specialEventDemands,
specialEventTiming: calc.siteInventoryDaily ? 'selling_days' : 'prep_date',
incomingEvents: incomingEvents || [], unitsPerCarton: unitsPerCarton,
demandMode: mode, avgSalesPerDay: (mode === 'sales_driven' ? avgSalesPerDay : null), includeTimeline: includeProjection === true });
if (includeProjection) return hr;
return (hr && hr.ready) ? hr.horizons : null;
}



function recoWsSupplyBySku_(supplySourceEntries) {
var by = {};
(supplySourceEntries || []).forEach(function (e) {
var sku = recoWsStr_(e.sku); if (!sku) return;
if (!by[sku]) by[sku] = { currentStockQty: 0, qualifiedIncomingQty: 0 };
var q = recoWsNum_(e.quantity); if (q === null) return;
var bucket = recoWsStr_(e.lifecycle_bucket);
if (bucket === 'CURRENT_STOCK') by[sku].currentStockQty += q;
else if (bucket === 'SHIPPED_IN_TRANSIT') by[sku].qualifiedIncomingQty += q;
});
return by;
}

function recoWsGapBySku_(planningFacts) {
var by = {};
(planningFacts || []).forEach(function (f) { var sku = recoWsStr_(f.sku || f.masterSku); if (sku && by[sku] === undefined && typeof f.calculatedGap === 'number') by[sku] = f.calculatedGap; });
return by;
}


var RECO_WS_MONTH_ABBR_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function recoWsToRowObjects_(snap) {
if (!recoWsIsObj_(snap) || !Array.isArray(snap.headers) || !Array.isArray(snap.rows)) return [];
var h = snap.headers.map(function (x) { return recoWsStr_(x); });
return snap.rows.map(function (r) { var o = {}; for (var c = 0; c < h.length; c++) o[h[c]] = r[c]; return o; });
}
function recoWsUpcBySku_(skuRows) { var m = {}; (skuRows || []).forEach(function (r) { var s = recoWsStr_(r.sku); if (s && m[s] === undefined) m[s] = recoWsNum_(r.units_per_carton); }); return m; }
function recoWsSiteSkuBySku_(mskRows, scope) {
var m = {};
(mskRows || []).forEach(function (r) {
if (recoWsStr_(r.company) !== scope.company || recoWsStr_(r.country) !== scope.country || recoWsStr_(r.marketplace) !== scope.marketplace) return;
var s = recoWsStr_(r.sku); if (s && m[s] === undefined) m[s] = recoWsStr_(r.site_sku) || null;
});
return m;
}



function recoWsFulfillmentModelBySku_(mskRows, scope) {
var m = {};
(mskRows || []).forEach(function (r) {
if (recoWsStr_(r.company) !== scope.company || recoWsStr_(r.country) !== scope.country || recoWsStr_(r.marketplace) !== scope.marketplace) return;
var s = recoWsStr_(r.sku); if (s && m[s] === undefined) m[s] = recoWsStr_(r.fulfillment_model);
});
return m;
}


function recoWsResolveFulfillment_(mktRows, scope) {
var rows = (mktRows || []).filter(function (r) { return recoWsStr_(r.company) === scope.company && recoWsStr_(r.country) === scope.country && recoWsStr_(r.marketplace) === scope.marketplace; });
if (!rows.length) return { mode: null, row: null };
var active = rows.filter(function (r) { var st = recoWsStr_(r.status).toLowerCase(); return st === 'active' || r.status === true || st === ''; });
var pick = active.length ? active[0] : rows[0];
var fm = recoWsStr_(pick.fulfillment_model).toLowerCase();
if (fm === 'platform_fulfilled') return { mode: 'MARKETPLACE', row: pick };
if (fm === 'self_fulfilled') return { mode: 'WAREHOUSE', row: pick };
return { mode: null, row: pick };
}


function recoWsRegularForecastByMonth_(fcRows, scope, sku, months) {
var out = {};
(months || []).forEach(function (ym) {
var m = /^(\d{4})-(\d{2})$/.exec(ym); if (!m) return;
var year = Number(m[1]), abbr = RECO_WS_MONTH_ABBR_[Number(m[2]) - 1], vals = {};
(fcRows || []).forEach(function (r) {
if (recoWsStr_(r.company) !== scope.company || recoWsStr_(r.country) !== scope.country || recoWsStr_(r.marketplace) !== scope.marketplace || recoWsStr_(r.sku) !== sku) return;
if (Number(r.year) !== year) return;
var v = r[abbr]; if (v !== '' && v !== null && v !== undefined && isFinite(Number(v))) vals[String(Number(v))] = Number(v);
});
var keys = Object.keys(vals);
if (keys.length === 1) out[ym] = vals[keys[0]];
});
return out;
}




var RECO_WS_TIERS_ = ['T1', 'T2', 'T3', 'T4'];



function recoWsWarehouseOpeningStock_(supplySourceEntries, warehouseId) {
var sum = 0, found = false;
(supplySourceEntries || []).forEach(function (e) {
if (recoWsStr_(e.lifecycle_bucket) !== 'CURRENT_STOCK') return;
if (recoWsStr_(e.warehouse_id) !== warehouseId) return;
var q = recoWsNum_(e.quantity); if (q === null) return;
sum += q; found = true;
});
return found ? sum : null;
}








function recoWsComposeOpeningSupply_(siteStockQty, allocatedOverseasQty, allocatedFactoryQty) {
var site = recoWsNum_(siteStockQty);
var ov = recoWsNum_(allocatedOverseasQty); if (ov === null) ov = 0;
var fc = recoWsNum_(allocatedFactoryQty); if (fc === null) fc = 0;
var opening = (site === null) ? null : (site + ov + fc);
return { siteStockQty: site, allocatedOverseasQty: ov, allocatedFactoryQty: fc, openingSupplyQty: opening };
}













// b4 (Owner three-layer rule): the overseas transfer (and, when RECO_WS_FACTORY_STOCK_TO_PLATFORM_OPENING_ is false, the factory stock) is NOT
// platform supply: it is consumed tier by tier (T1 first) against the platform gap and only lowers the FACTORY net need. Layer 1 constant:
var RECO_WS_OVERSEAS_TO_PLATFORM_OPENING_ = false;      // true = AD1 (3PL pool added to the platform opening at day 0)
var RECO_WS_FACTORY_STOCK_TO_PLATFORM_OPENING_ = false; // Q1 APPROVED (Owner 2026-11-21): factory finished stock is a separate source pool (never platform opening / DoS); true = AD1
function recoWsBuildMonthlyProjection_(months, openingSupplyQty, demandByMonth, incomingEvents, unitsPerCarton, destination, preT1Demand, preT1Date, overseasTransferQty, factoryOffsetQty) {
if (typeof KMTPP === 'undefined' || !KMTPP || typeof KMTPP.projectTimePhasedSupply !== 'function') return null;
if (!Array.isArray(months) || months.length !== 4) return null;
var demandEvents = [], i;



if (preT1Demand != null && isFinite(Number(preT1Demand)) && Number(preT1Demand) > 0 && recoWsStr_(preT1Date)) {
demandEvents.push({ demandId: 'PRE-T1', date: recoWsStr_(preT1Date), qty: Number(preT1Demand), demandType: 'CURRENT_MONTH_REMAINING', month: recoWsStr_(preT1Date).slice(0, 7), tier: null });
}
for (i = 0; i < 4; i++) {
var ym = months[i], q = demandByMonth ? demandByMonth[ym] : undefined;
if (q === null || q === undefined || !isFinite(Number(q))) return null;
demandEvents.push({ demandId: 'DMD-' + RECO_WS_TIERS_[i] + '-' + ym, date: ym + '-01', qty: Number(q), demandType: 'PLANNING_DEMAND', month: ym, tier: RECO_WS_TIERS_[i] });
}
var tierByMonth = {}; for (i = 0; i < 4; i++) tierByMonth[months[i]] = RECO_WS_TIERS_[i];
var inEvents = (incomingEvents || []).map(function (e) {
var eta = recoWsStr_(e.eta), ym2 = eta.slice(0, 7);
return { incomingId: recoWsStr_(e.incomingId) || null, availableDate: eta, qty: recoWsNum_(e.qty),
sourceType: recoWsStr_(e.sourceType) || null, tier: (tierByMonth[ym2] || null) };
});
var proj = KMTPP.projectTimePhasedSupply({ destination: destination || null, openingSupplyQty: openingSupplyQty, demandEvents: demandEvents, incomingEvents: inEvents });
if (!proj || proj.ready !== true) return null;
var ovLeft_ = (typeof overseasTransferQty === 'number' && isFinite(overseasTransferQty) && overseasTransferQty > 0) ? overseasTransferQty : 0;   // b4
var fcLeft_ = (typeof factoryOffsetQty === 'number' && isFinite(factoryOffsetQty) && factoryOffsetQty > 0) ? factoryOffsetQty : 0;   // b4 (Q1 false only)
return (proj.monthlyProjection || []).map(function (r) {



var destinationGapQty = r.remainingGapQty;
var gapFin_ = (typeof destinationGapQty === 'number' && isFinite(destinationGapQty) && destinationGapQty > 0) ? destinationGapQty : 0;   // b4: FIFO over the tiers
var overseasCoveredQty = Math.min(ovLeft_, gapFin_); ovLeft_ -= overseasCoveredQty;
var factoryCoveredQty = Math.min(fcLeft_, gapFin_ - overseasCoveredQty); fcLeft_ -= factoryCoveredQty;
var factoryShipQty = (typeof destinationGapQty === 'number' && isFinite(destinationGapQty)) ? gapFin_ - overseasCoveredQty : null;   // b5 Q1: what the factory must ship toward this platform tier
var residualOrderNeedQty = (typeof destinationGapQty === 'number' && isFinite(destinationGapQty)) ? Math.max(0, destinationGapQty - overseasCoveredQty - factoryCoveredQty) : destinationGapQty;
var sug = null;
if (typeof residualOrderNeedQty === 'number' && isFinite(residualOrderNeedQty)) {
if (residualOrderNeedQty <= 0) sug = 0;
else if (typeof unitsPerCarton === 'number' && isFinite(unitsPerCarton) && unitsPerCarton > 0 && Math.floor(unitsPerCarton) === unitsPerCarton) {
try { sug = KMCALC.calculateSuggestedOrderQty({ netOrderNeed: residualOrderNeedQty, unitsPerCarton: unitsPerCarton }); } catch (e) { sug = null; }
} else sug = null;
}
return { tier: r.tier, month: r.month,
openingSupplyQty: r.openingSupplyQty, openingDestinationSupplyQty: r.openingSupplyQty,
incomingAddedQty: r.incomingAddedQty, qualifiedIncomingQty: r.incomingAddedQty,
demandQty: r.demandQty, coveredQty: r.coveredQty, remainingSupplyQty: r.remainingSupplyQty,
destinationGapQty: destinationGapQty, overseasCoveredQty: overseasCoveredQty, factoryCoveredQty: factoryCoveredQty,
remainingGapQty: r.remainingGapQty, residualOrderNeedQty: residualOrderNeedQty, suggestedOrderQty: sug,
factoryShipQty: factoryShipQty, factoryShipFromStockQty: factoryCoveredQty, newPurchaseQty: residualOrderNeedQty };   // b5 Q1: platform need = overseas transfer + factory ship; factory ship = from stock + new purchase
});
}










function recoWsShipmentLineCandidates_(read) {
if (read.__slCandidates) return read.__slCandidates;
var snaps = read.snapshots || {};
read.__slCandidates = KMSLS.buildShipmentLineCandidates({
includeDisplayOnlyOpening: read.__siteInventoryDaily === true,
shipmentLines: recoWsToRowObjects_(snaps.shipmentLines),
shipments: recoWsToRowObjects_(snaps.shipments),
shippingPlanLines: recoWsToRowObjects_(snaps.shippingPlanLines),
shippingPlans: recoWsToRowObjects_(snaps.shippingPlans),
shipmentLinkCountById: (typeof KMSLS.shipmentLinkCountsFromRows === 'function' && snaps.shipmentPlanLinks) ? KMSLS.shipmentLinkCountsFromRows(recoWsToRowObjects_(snaps.shipmentPlanLinks)) : undefined   // XCO-R15G projection
});
recoWsApplyPlanDates_(read);   // D5-V3-R5 (Owner ETA decision)
return read.__slCandidates;
}
function recoWsApplyPlanDates_(read) {
var map = read.__etaSourceByLineage = {};
((read.__slCandidates && read.__slCandidates.candidates) || []).forEach(function (e) {
var c = e && e.candidate; if (!c) return;
var lk = recoWsStr_(c.lineageKey), st = recoWsStr_(c.status).toLowerCase();
// D5-V3-R5C (F-1): the candidate's eta is already String(cell) (supply-candidates optStr), so a Date cell arrives as
// 'Wed Nov 25 2026 ...'; the RAW shipments.eta cell of the snapshot is normalised instead (recoWsYmd_: Date cell,
// 'YYYY/MM/DD', 'MM/DD/YYYY', ISO). The snapshot rows are only read, never changed.
var sid = recoWsStr_(c.linkedShipmentId) || null, rawEta = sid ? recoWsShipEtaRaw_(read)[sid] : undefined;
var etaN = recoWsYmd_((rawEta !== undefined && rawEta !== null && rawEta !== '') ? rawEta : c.eta);
if (recoWsValidYmd_(etaN)) {
if (recoWsStr_(c.eta) !== etaN) e.candidate = Object.assign({}, c, { eta: etaN });   // memory-only copy, ISO text - EVERY status (D5-V3-R5D, rule D2)
if (lk) map[lk] = { dateSource: 'ETA', date: etaN, field: 'shipments.eta', estimated: false, shipmentId: sid }; return; }
if (st !== 'draft' && st !== 'ready_to_ship') {   // D5-V3-R5D: shipped without any ETA -> not counted, not guessed, FLAGGED
if (lk && RECO_WS_SHIPPED_ST_[st] && (recoWsNum_(c.quantityRemaining) || 0) > 0) map[lk] = { dateSource: 'ETA_MISSING', date: null, field: 'shipments.eta', estimated: false, label: RECO_WS_SHIPPED_ETA_MISSING_LABEL_, shipmentId: sid };   // D5-V3-R5E: remaining > 0 only
return; }
var pd = recoWsPlanDateOf_(read, c.linkedShippingPlanLineId);
if (!pd) { if (lk) map[lk] = { dateSource: 'UNDETERMINED', date: null, field: null, estimated: false, label: RECO_WS_ARRIVAL_UNDETERMINED_LABEL_, shipmentId: sid }; return; }
// a COPY carries the plan date; the shipment row and the canonical snapshot are untouched (nothing is ever written back)
e.candidate = Object.assign({}, c, { eta: pd.date });
if (lk) map[lk] = { dateSource: 'PLAN_DATE', date: pd.date, field: pd.field, estimated: true, label: RECO_WS_PLAN_DATE_LABEL_, planLineId: pd.planLineId, draftLineId: pd.draftLineId, shipmentId: sid };
});
}










// ============================================================================================================
// D5-V3-R5 (Owner decisions 2026-11-18)
// ============================================================================================================
function recoWsValidYmd_(v) { var t = recoWsStr_(v); return /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(Date.parse(t + 'T00:00:00Z')); }
function recoWsSiteKey_(c, k, m) { return [recoWsStr_(c), recoWsStr_(k), recoWsStr_(m)].join('||').toLowerCase(); }
// (1a) warehouse -> site inventory shares, read from the SAME Script Property config the allocation rules come from
// (KM_WAREHOUSE_ALLOCATION_CONFIG, owner 50_). Shape: scopes[<company||country||marketplace>].warehouses[i] =
// { warehouse_id, forecast_ratio, sales_ratio, inventory_share } - inventory_share is a FRACTION 0..1 of the warehouse's
// available pool that belongs to THIS site. Read-only here; raw values are kept so an invalid one can be reported.
function recoWsReadInventoryShares_() {
var out = { available: false, byWh: {}, error: null };
try {
if (typeof warehouseAllocationParseConfig_ !== 'function' || typeof warehouseAllocationConfigIo_ !== 'function') { out.error = 'CONFIG_READER_UNAVAILABLE'; return out; }
var cfg = warehouseAllocationParseConfig_(warehouseAllocationConfigIo_().getConfig()) || {};
out.available = true;
var scopes = cfg.scopes || {};
Object.keys(scopes).forEach(function (k) {
var sc = scopes[k]; if (!sc || !Array.isArray(sc.warehouses)) return;
var sk = recoWsSiteKey_(sc.company, sc.country, sc.marketplace);
sc.warehouses.forEach(function (w) {
var wid = recoWsStr_(w && (w.warehouse_id || w.warehouseId)); if (!wid) return;
var has = !!w && (Object.prototype.hasOwnProperty.call(w, 'inventory_share') || Object.prototype.hasOwnProperty.call(w, 'inventoryShare'));
var raw = has ? (w.inventory_share !== undefined ? w.inventory_share : w.inventoryShare) : undefined;
(out.byWh[wid] = out.byWh[wid] || {})[sk] = { present: has && raw !== null && raw !== '' && raw !== undefined, raw: (raw === undefined ? null : raw) };
});
});
} catch (e) { out.available = false; out.error = 'CONFIG_READ_FAILED: ' + String(e && e.message || e).slice(0, 120); }
return out;
}
// (1a)+(1c) the share of warehouse `wid` that belongs to site `siteKey`. linkedSiteKeys = every site whose valid setting
// links `wid` (this site included). Rules (no normalising, no demand weights, never a guess):
//   * a stated share must be a number in [0, 1]; a non-number / negative / > 1 value -> UNKNOWN for this site
//   * the stated shares of ALL linked sites must sum to <= 100%; > 100% -> UNKNOWN for every linked site; a linked
//     site's invalid value makes that sum unverifiable -> UNKNOWN as well
//   * no stated share: a warehouse linked to this site ONLY belongs to it in full (factor 1, as before); a warehouse
//     linked to several sites -> UNKNOWN (SHARE_MISSING)
// D5-V3-R5E share engine (Owner gate 2026-11-18). A share is a decimal fraction in [0, 1] with AT MOST 4 decimal places,
// held as an exact integer number of basis points (bp, 0..10000). Anything else is an ERROR for that warehouse:
//   SHARE_NOT_A_NUMBER / SHARE_NEGATIVE / SHARE_OVER_100 / WAREHOUSE_SHARE_PRECISION (more than 4 decimals, or a binary
//   number farther than 1e-7 bp from a whole bp - i.e. not reliably a 4-decimal value; 0.29999999995 is an error).
// No rounding happens anywhere: bp are exact, q x bp is an exact integer (q <= RECO_WS_SHARE_MAX_POOL_), floor is exact.
var RECO_WS_SHARE_MAX_POOL_ = 900719925474;   // q x 10000 and q x bp stay exact (< 2^53)
function recoWsShareParse_(e) {
if (!e || !e.present) return { present: false, ok: false };
var raw = e.raw;
if (typeof raw === 'number') {
if (!isFinite(raw)) return { present: true, ok: false, reason: 'SHARE_NOT_A_NUMBER', raw: raw };
if (raw < 0) return { present: true, ok: false, reason: 'SHARE_NEGATIVE', raw: raw };
if (raw > 1) return { present: true, ok: false, reason: 'SHARE_OVER_100', raw: raw };
// D5-V3-R5F (m-4): a number is judged by its SHORTEST decimal form (String(v) - exactly what was written in the JSON); no
// tolerance at all. 0.299999999999 stays 12 decimals -> PRECISION; 0.29 is '0.29' -> 2900 bp exactly.
var tn = String(raw), mn = /^(\d+)(?:\.(\d+))?$/.exec(tn);
if (!mn) return { present: true, ok: false, reason: 'WAREHOUSE_SHARE_PRECISION', raw: raw };   // exponent form (e.g. 5e-7)
var fn = (mn[2] || '').replace(/0+$/, '');
if (fn.length > 4) return { present: true, ok: false, reason: 'WAREHOUSE_SHARE_PRECISION', raw: raw };
return { present: true, ok: true, bp: Number(mn[1]) * 10000 + Number((fn + '0000').slice(0, 4)) };
}
if (typeof raw === 'string') {
var t = raw.trim(), m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(t);
if (!m) return { present: true, ok: false, reason: 'SHARE_NOT_A_NUMBER', raw: raw };
var n = Number(t);
if (n < 0) return { present: true, ok: false, reason: 'SHARE_NEGATIVE', raw: raw };
if (n > 1) return { present: true, ok: false, reason: 'SHARE_OVER_100', raw: raw };
var fs3 = (m[3] || '').replace(/0+$/, '');   // D5-V3-R5F: trailing zeros allowed ('0.123400' == 0.1234); > 4 significant decimals -> error
if (fs3.length > 4) return { present: true, ok: false, reason: 'WAREHOUSE_SHARE_PRECISION', raw: raw };
return { present: true, ok: true, bp: Number(m[2]) * 10000 + Number((fs3 + '0000').slice(0, 4)) };
}
return { present: true, ok: false, reason: 'SHARE_NOT_A_NUMBER', raw: raw };
}
// exact floor(q x bp / 10000); bp 10000 returns q unchanged (any finite q >= 0); otherwise q must be a whole number <= max
// D5-V3-R5F (N-9): why a quantity cannot be split - over the exact-arithmetic cap, or not a whole number
function recoWsQtyUnsplittable_(q, prefix) { return (typeof q === 'number' && isFinite(q) && Math.floor(q) === q && q > RECO_WS_SHARE_MAX_POOL_) ? prefix + '_TOO_LARGE' : prefix + '_NOT_WHOLE'; }
function recoWsShareSplit_(q, bp) {
if (bp === 10000) return (typeof q === 'number' && isFinite(q) && q >= 0) ? q : null;
if (!(typeof q === 'number' && Math.floor(q) === q && q >= 0 && q <= RECO_WS_SHARE_MAX_POOL_)) return null;
var p = q * bp; return (p - (p % 10000)) / 10000;
}
// the share of `wid` for `siteKey`; linkedSiteKeys = every site whose valid rule links `wid` (this site included).
// warehouseLevel=true -> nobody can count this warehouse (an invalid value anywhere, a sum > 100%, config unreadable).
function recoWsInventoryShareOf_(shares, wid, siteKey, linkedSiteKeys) {
var shared = linkedSiteKeys.length > 1;
if (!shares || shares.available !== true) {
return shared ? { factor: null, unknown: { reason: 'SHARE_CONFIG_UNAVAILABLE', detail: (shares && shares.error) || null }, warehouseLevel: true, bpBySite: {}, linkedKeys: linkedSiteKeys.slice() }
: { factor: 1, bp: 10000, source: 'SOLE_SITE_FULL', bpBySite: {}, linkedKeys: linkedSiteKeys.slice() };
}
var byS = shares.byWh[wid] || {}, parsed = {}, invalid = [], sumBp = 0, bpBySite = {};
linkedSiteKeys.forEach(function (sk) { var p = recoWsShareParse_(byS[sk]); parsed[sk] = p; bpBySite[sk] = p.ok ? p.bp : null; if (p.present && !p.ok) invalid.push(sk); else if (p.ok) sumBp += p.bp; });
var mine = parsed[siteKey] || { present: false, ok: false }, base = { bpBySite: bpBySite, linkedKeys: linkedSiteKeys.slice() };
function u(o) { for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = base[k]; return o; }
if (invalid.length) return u({ factor: null, unknown: { reason: (invalid.indexOf(siteKey) !== -1) ? mine.reason : 'SHARE_SUM_UNVERIFIABLE', value: mine.present ? mine.raw : undefined, invalidAt: invalid.sort() }, warehouseLevel: true });
if (sumBp > 10000) return u({ factor: null, unknown: { reason: 'SHARE_SUM_OVER_100', sumBp: sumBp }, warehouseLevel: true });
if (!mine.present) return shared ? u({ factor: null, unknown: { reason: 'SHARE_MISSING' }, warehouseLevel: false }) : u({ factor: 1, bp: 10000, source: 'SOLE_SITE_FULL' });
return u({ factor: mine.bp / 10000, bp: mine.bp, source: 'INVENTORY_SHARE' });
}
// reconciliation of ONE quantity q of warehouse W across all linked sites, exact in units of 1/10000:
//   q x 10000 = C (counted, every site with a valid share) + R (rounding remainder) + U (share assigned to no site) + N (not counted)
function recoWsShareReconcile_(q, sh, mySiteKey) {
var out = { poolQty: q, perSite: [], countedQty: 0, roundingRemainderQty: 0, unassignedQty: 0, notCountedQty: 0, notCountedReason: null, reconciled: false, check: null };
var keys = (sh.linkedKeys || []).slice().sort();
var whole = (typeof q === 'number' && Math.floor(q) === q && q >= 0 && q <= RECO_WS_SHARE_MAX_POOL_);
if (!whole) {   // a non-whole / out-of-range pool cannot be split exactly: never split, never guessed
var full = sh.source === 'SOLE_SITE_FULL' && !sh.unknown;
out.perSite = keys.map(function (k) { return { siteKey: k, shareBp: full ? 10000 : null, countedQty: full ? q : 0 }; });
if (full) { out.countedQty = q; } else { out.notCountedQty = q; out.notCountedReason = recoWsQtyUnsplittable_(q, 'WAREHOUSE_POOL'); }
out.reconciled = true; out.check = 'not split (pool not a whole number)'; return out;
}
var Q = q * 10000, C = 0, R = 0, U = 0, N = 0, sumB = 0;
if (sh.unknown && sh.warehouseLevel) {
N = Q; out.notCountedReason = sh.unknown.reason;
out.perSite = keys.map(function (k) { return { siteKey: k, shareBp: null, countedQty: 0, status: 'NOT_COUNTED' }; });
} else {
keys.forEach(function (k) {
var bp = sh.bpBySite[k]; if ((bp === null || bp === undefined) && sh.source === 'SOLE_SITE_FULL' && k === mySiteKey) bp = 10000;
if (bp === null || bp === undefined) { out.perSite.push({ siteKey: k, shareBp: null, countedQty: 0, status: 'NO_VALID_SHARE' }); return; }
var c = recoWsShareSplit_(q, bp); out.perSite.push({ siteKey: k, shareBp: bp, countedQty: c, status: 'COUNTED' }); C += c * 10000; sumB += bp;
});
R = q * sumB - C; U = Q - q * sumB;
}
out.countedQty = C / 10000; out.roundingRemainderQty = R / 10000; out.unassignedQty = U / 10000; out.notCountedQty = N / 10000;
out.reconciled = (Q === C + R + U + N) && C >= 0 && R >= 0 && U >= 0 && N >= 0;
out.check = 'pool x 10000: ' + Q + ' = counted ' + C + ' + rounding ' + R + ' + unassigned ' + U + ' + not counted ' + N;
return out;
}
// ======== D5-V3-R5E (Owner 2026-11-18): IN-TRANSIT IS LINEAGE-FIRST ========
// An incoming quantity bound for a member warehouse belongs to the site its frozen Plan/Shipment lineage names (KMSLS
// receiver resolution - the existing rules, incl. cross-company). Only a quantity that cannot be attributed to a site
// (receiver UNRESOLVED, e.g. a merged/MULTI line without a plan line, or a non-shipment event) of a SHARED warehouse is
// split by the user-specified ratio (RECO_WS_INTRANSIT_RATIO_SOURCE_), each site floor(q x bp / 10000) - never more than
// the unreceived quantity q itself. Confirmed goods of one site are never redistributed to another.
var RECO_WS_INTRANSIT_RATIO_SOURCE_ = 'inventory_share';   // ONE source constant; alternative 'forecast_ratio' (50_ forecast_ratio)
function recoWsLineageByKey_(read) {
if (!read.__lineageByKey) { read.__lineageByKey = {};
((recoWsShipmentLineCandidates_(read).candidates) || []).forEach(function (e) { var c = (e && e.candidate) || {}; var lk = recoWsStr_(c.lineageKey); if (!lk) return;
var ok = recoWsStr_(c.receiverResolutionStatus).toUpperCase() === 'RESOLVED' && !!recoWsStr_(c.marketplace);
read.__lineageByKey[lk] = { resolved: ok, siteKey: ok ? recoWsSiteKey_(c.company, c.country, c.marketplace) : null, company: recoWsStr_(c.company), reason: c.receiverResolutionReason || null, shipmentId: recoWsStr_(c.linkedShipmentId) || null }; }); }
return read.__lineageByKey;
}
function recoWsIntransitRatio_(sh, wid, linkedKeys, fcRatioByWh) {
if (RECO_WS_INTRANSIT_RATIO_SOURCE_ === 'forecast_ratio') {
var by = (fcRatioByWh || {})[wid] || {}, bpBySite = {}, sum = 0, bad = null;
linkedKeys.forEach(function (k) { var v = by[k]; var p = recoWsShareParse_({ present: v !== undefined && v !== null && v !== '', raw: v }); bpBySite[k] = p.ok ? p.bp : null; if (p.present && !p.ok) bad = p.reason; else if (p.ok) sum += p.bp; });
if (bad) return { source: 'forecast_ratio', bpBySite: {}, unknown: bad };
if (sum > 10000) return { source: 'forecast_ratio', bpBySite: {}, unknown: 'SHARE_SUM_OVER_100' };
return { source: 'forecast_ratio', bpBySite: bpBySite, unknown: null };
}
if (sh.unknown && sh.warehouseLevel) return { source: 'inventory_share', bpBySite: {}, unknown: sh.unknown.reason };
return { source: 'inventory_share', bpBySite: sh.bpBySite || {}, unknown: null };
}
// attribute the incoming events of ONE member warehouse; exact reconciliation in units of 1/10000:
//   incoming x 10000 = counted (all sites) + rounding + unassigned + not counted
function recoWsIncomingAttribute_(evs, sh, mySiteKey, myCompany, lin, ratio) {
var linked = (sh.linkedKeys && sh.linkedKeys.length) ? sh.linkedKeys.slice() : [mySiteKey];
if (linked.indexOf(mySiteKey) === -1) linked.push(mySiteKey);
var shared = linked.length > 1, per = {}, notBy = {}, U = { pool: 0, counted: 0, round: 0, unassigned: 0, notc: 0 };
var out = { ratioSource: ratio.source, poolQty: 0, perSite: [], countedForThisSite: 0, countedQty: 0, roundingRemainderQty: 0, unassignedQty: 0, notCountedQty: 0, notCountedByReason: {}, ratioEvents: 0, reconciled: true, events: [] };
function add(k, q) { per[k] = (per[k] || 0) + q; U.counted += q * 10000; }
function notc(q, why) { notBy[why] = (notBy[why] || 0) + q; U.notc += q * 10000; }
(evs || []).forEach(function (e) {
var q = recoWsNum_(e.qty); if (q === null) return;
U.pool += q * 10000; out.poolQty += q;
var L = lin[recoWsStr_(e.incomingId)] || null, mode, mine = 0;
if (e.crossCompanyHeader) { mode = 'CROSS_COMPANY_HEADER'; notc(q, mode); }   // D5-V3-R5F (m-6)
else if (L && L.resolved) {
if (L.company && myCompany && L.company !== myCompany) { mode = 'CROSS_COMPANY_LINEAGE'; notc(q, mode); }
else if (L.siteKey === mySiteKey) { mode = 'LINEAGE'; mine = q; add(mySiteKey, q); }
else if (linked.indexOf(L.siteKey) !== -1) { mode = 'LINEAGE_OTHER_SITE'; add(L.siteKey, q); }
else { mode = 'LINEAGE_SITE_NOT_IN_POOL'; notc(q, mode); }
} else if (!shared) { mode = 'SOLE_SITE'; mine = q; add(mySiteKey, q); }
else if (ratio.unknown) { mode = 'RATIO_UNKNOWN'; notc(q, ratio.unknown); }
else if (!(Math.floor(q) === q && q >= 0 && q <= RECO_WS_SHARE_MAX_POOL_)) { mode = recoWsQtyUnsplittable_(q, 'INCOMING_QTY'); notc(q, mode); }
else {
mode = 'RATIO'; out.ratioEvents++; var sumB = 0, C = 0;
linked.forEach(function (k) { var bp = ratio.bpBySite[k]; if (bp === null || bp === undefined) return; var c = recoWsShareSplit_(q, bp); per[k] = (per[k] || 0) + c; C += c * 10000; sumB += bp; if (k === mySiteKey) mine = c; });
U.counted += C; U.round += q * sumB - C; U.unassigned += q * 10000 - q * sumB;
var myBp = ratio.bpBySite[mySiteKey]; if (myBp === null || myBp === undefined) mode = 'RATIO_UNKNOWN';   // D5-V3-R5F (m-5): this site has no valid ratio
}
out.countedForThisSite += mine;
out.events.push({ incomingId: e.incomingId || null, sourceType: e.sourceType || null, qty: q, mode: mode, lineageSite: (L && L.resolved) ? L.siteKey : null, lineageReason: (L && !L.resolved) ? L.reason : null, countedForThisSite: mine, __src: e });
});
out.countedQty = U.counted / 10000; out.roundingRemainderQty = U.round / 10000; out.unassignedQty = U.unassigned / 10000; out.notCountedQty = U.notc / 10000; out.notCountedByReason = notBy;
out.reconciled = Math.abs(U.pool - (U.counted + U.round + U.unassigned + U.notc)) < 1e-6 && U.round >= 0 && U.unassigned >= 0;
out.check = 'incoming x 10000: ' + U.pool + ' = counted ' + U.counted + ' + rounding ' + U.round + ' + unassigned ' + U.unassigned + ' + not counted ' + U.notc;
out.perSite = Object.keys(per).sort().map(function (k) { return { siteKey: k, countedQty: per[k] }; });
return out;
}
// (2) missing ETA -> the PLAN date through the frozen lineage: shipment_lines.shipping_plan_line_id ->
// shipping_plan_lines.source_reason 'line:<allocation_draft_line_id>' -> shipping_allocation_draft_lines.expected_arrival,
// else .required_by_date. It is a PLANNED date, never an ETA: tagged PLAN_DATE + estimated, used in memory only and NEVER
// written back to the Shipment. The draft-line table is read lazily, once per request, only when such a shipment exists.
function recoWsPlanDateOf_(read, planLineId) {
planLineId = recoWsStr_(planLineId); if (!planLineId) return null;
if (!read.__planLineById) { read.__planLineById = {}; recoWsRows_(read, 'shippingPlanLines').forEach(function (r) { var id = recoWsStr_(r.shipping_plan_line_id); if (id) read.__planLineById[id] = r; }); }
var pl = read.__planLineById[planLineId]; if (!pl) return null;
var m = /(?:^|\|)line:([^|]+)/.exec(recoWsStr_(pl.source_reason)); if (!m) return null;
var dlId = recoWsStr_(m[1]);
if (!read.__draftLineById) {
read.__draftLineById = {}; var rows = [];
try { if (read.__poHeaderSs && typeof gapReadObjects_ === 'function') rows = gapReadObjects_(read.__poHeaderSs, 'shipping_allocation_draft_lines') || []; } catch (eR) { rows = []; }
rows.forEach(function (r) { var id = recoWsStr_(r.allocation_draft_line_id); if (id) read.__draftLineById[id] = r; });
}
var dl = read.__draftLineById[dlId]; if (!dl) return null;
var ea = recoWsYmd_(dl.expected_arrival), rb = recoWsYmd_(dl.required_by_date);
if (recoWsValidYmd_(ea)) return { date: ea, field: 'shipping_allocation_draft_lines.expected_arrival', planLineId: planLineId, draftLineId: dlId };
if (recoWsValidYmd_(rb)) return { date: rb, field: 'shipping_allocation_draft_lines.required_by_date', planLineId: planLineId, draftLineId: dlId };
return null;
}
var RECO_WS_PLAN_DATE_LABEL_ = '依計畫日期，非 ETA (estimated from the plan date, not an ETA)';
var RECO_WS_ARRIVAL_UNDETERMINED_LABEL_ = '到貨日未定：ETA 與計畫日期都沒有；未計入、未猜日期、未回補工廠池 (arrival date undetermined: no ETA and no plan date; not counted, not dated by guess, not returned to the factory pool)';
// the date source of every dated / undated incoming Shipment line of one SKU, for the response (page marker)
// D5-V3-R5E: ONE definition on both paths - counted = the entry is in the line's supply set (the incoming events the
// projection receives) AND its date is on or before the D90 required-by date (calculation date + 90 days).
function recoWsHorizonEnd_(calc) { var d = recoWsStr_(calc && calc.calculationDate); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(Date.parse(d + 'T00:00:00Z') + 90 * 864e5).toISOString().slice(0, 10) : null; }
function recoWsMonthsEnd_(months) { var m = recoWsStr_((months || [])[(months || []).length - 1]); var a = /^(\d{4})-(\d{2})$/.exec(m); return a ? new Date(Date.UTC(Number(a[1]), Number(a[2]), 0)).toISOString().slice(0, 10) : null; }
// D5-V3-R5F (m-3): `counted` is defined PER CALCULATION - countedInventory: in the Inventory supply set and dated on/before
// the D90 required-by date; countedOrderPlanning: in the Order Planning supply set and dated on/before the end of T4.
// `counted` stays as the Inventory flag (unchanged name). The label never says 'not counted' - the page decides per calculation.
function recoWsIncomingDateSources_(read, keys, countedIds, horizonEnd, opIds, opEnd) {
var map = read.__etaSourceByLineage || {}, out = [];
(keys || []).forEach(function (k) { var lk = recoWsStr_(k && k.lineageKey); var e = map[lk]; if (!e) return;
var inSet = (e.dateSource === 'ETA' || e.dateSource === 'PLAN_DATE') && !!countedIds && (k.ids || [lk]).some(function (x) { return !!countedIds[recoWsStr_(x)]; });
var inHorizon = !!e.date && (!horizonEnd || e.date <= horizonEnd);
var counted = inSet && inHorizon;
var label = e.label || null;
var dated = (e.dateSource === 'ETA' || e.dateSource === 'PLAN_DATE');
var opInSet = dated && !!opIds && (k.ids || [lk]).some(function (x) { return !!opIds[recoWsStr_(x)]; });
var opInHorizon = !!e.date && (!opEnd || e.date <= opEnd);
out.push({ shipmentId: recoWsStr_(k.shipmentId) || recoWsStr_(e.shipmentId) || null, lineageKey: lk, qty: recoWsNum_(k.qty), date: e.date, dateSource: e.dateSource, counted: counted, countedInventory: counted, countedOrderPlanning: opInSet && opInHorizon, inSupplySet: inSet, withinHorizon: inHorizon, inOrderPlanningSet: opInSet, withinOrderPlanningHorizon: opInHorizon, inventoryHorizonEnd: horizonEnd || null, orderPlanningHorizonEnd: opEnd || null,
estimated: e.estimated === true, sourceField: e.field, label: label, planLineId: e.planLineId || null, draftLineId: e.draftLineId || null }); });
return out;
}
// D5-V3-R5D: raw shipments.eta cells by shipment_id - the FIRST row of a duplicated id wins, exactly as core (KMSLS
// indexBy) resolves it; duplicated ids are listed in read.__shipEtaDupIds. Read-only.
function recoWsShipEtaRaw_(read) {
if (!read.__shipEtaRawById) { read.__shipEtaRawById = {}; read.__shipEtaDupIds = [];
recoWsRows_(read, 'shipments').forEach(function (r) { var id0 = recoWsStr_(r.shipment_id); if (!id0) return;
if (Object.prototype.hasOwnProperty.call(read.__shipEtaRawById, id0)) { if (read.__shipEtaDupIds.indexOf(id0) === -1) read.__shipEtaDupIds.push(id0); return; }
read.__shipEtaRawById[id0] = r.eta; }); }
return read.__shipEtaRawById;
}
function recoWsSidByLineage_(read) {
if (!read.__sidByLineage) { read.__sidByLineage = {}; ((recoWsShipmentLineCandidates_(read).candidates) || []).forEach(function (e) { var c = (e && e.candidate) || {}; var lk = recoWsStr_(c.lineageKey); if (lk) read.__sidByLineage[lk] = recoWsStr_(c.linkedShipmentId); }); }
return read.__sidByLineage;
}
// a source-projection event's ETA, normalised from the RAW cell of its shipment (Date cell / 'YYYY/MM/DD' / ISO)
function recoWsEventEtaYmd_(read, lineageKey, eta) {
var sid = recoWsSidByLineage_(read)[recoWsStr_(lineageKey)], raw = sid ? recoWsShipEtaRaw_(read)[sid] : undefined;
var y = recoWsYmd_((raw !== undefined && raw !== null && raw !== '') ? raw : eta);
return recoWsValidYmd_(y) ? y : eta;
}
var RECO_WS_SHIPPED_ST_ = { shipped: 1, in_transit: 1, arrived: 1, partially_received: 1 };   // A-DELTA1 P0-1: `arrived` (at the destination, not received) is still incoming - never dropped
var RECO_WS_SHIPPED_ETA_MISSING_LABEL_ = '已出貨但沒有 ETA：未計入、未猜日期 (shipped without an ETA: not counted, not dated by guess)';
var RECO_WS_NOT_COUNTED_LABEL_ = '未計入此計算 (not counted in this calculation)';
// D5-V3-R5E: duplicate ids in shipments (shipment_id) / shipment_lines (shipment_line_id). Rows equal in EVERY cell are
// IDENTICAL - counted once (the in-memory view keeps the first; the sheet is never touched) and reported. Rows that differ
// in ANY cell CONFLICT - kept as they are, reported, and every line they touch is BLOCKED (SHIPMENT_DUPLICATE_CONFLICT).
function recoWsCellKey_(v) { if (Object.prototype.toString.call(v) === '[object Date]') return 'D:' + v.getTime(); return (typeof v) + ':' + String(v); }
var RECO_WS_DUP_CACHE_ = (typeof WeakMap === 'function') ? new WeakMap() : null;   // D5-V3-R5F (M-1): scan cache keyed by the shared snapshots map
function recoWsDupScan_(snaps, key, idCol) {
var out = { identical: {}, conflict: {} }, snap = snaps && snaps[key];
if (!recoWsIsObj_(snap) || !Array.isArray(snap.headers) || !Array.isArray(snap.rows)) return out;
var H = snap.headers.map(function (x) { return recoWsStr_(x); }), ix = H.indexOf(idCol); if (ix < 0) return out;
var groups = {}, order = [];
snap.rows.forEach(function (r, i) { var id = recoWsStr_(r[ix]); if (!id) return; if (!groups[id]) { groups[id] = []; order.push(id); } groups[id].push(i); });
var drop = {};
order.forEach(function (id) { var g = groups[id]; if (g.length < 2) return;
var first = snap.rows[g[0]], diff = [];
g.slice(1).forEach(function (i) { var r = snap.rows[i]; H.forEach(function (h, c) { if (recoWsCellKey_(r[c]) !== recoWsCellKey_(first[c]) && diff.indexOf(h) === -1) diff.push(h); }); });
if (!diff.length) { out.identical[id] = { rows: g.length }; g.slice(1).forEach(function (i) { drop[i] = 1; }); }
else { var info = { rows: g.length, fields: diff.sort(), marketplaces: [], warehouses: [] };
var mi = H.indexOf('marketplace'), wi = H.indexOf('destination_warehouse_id'), wi2 = H.indexOf('warehouse_id');
g.forEach(function (i) { var r = snap.rows[i]; if (mi >= 0 && info.marketplaces.indexOf(recoWsStr_(r[mi])) === -1) info.marketplaces.push(recoWsStr_(r[mi]));
[wi, wi2].forEach(function (w) { if (w >= 0 && recoWsStr_(r[w]) && info.warehouses.indexOf(recoWsStr_(r[w])) === -1) info.warehouses.push(recoWsStr_(r[w])); }); });
out.conflict[id] = info; } });
if (Object.keys(drop).length) snaps[key] = { headers: snap.headers, rows: snap.rows.filter(function (r, i) { return !drop[i]; }) };   // a NEW view object in the CALLER'S private map copy (D5-V3-R5F)   // in-memory view only
return out;
}
// the duplicates a set of candidates touches, for one site: conflicts (block) and identical repeats (report)
function recoWsDupTouch_(read, cands, siteMarketplace, members, mySiteKey) {
var D = read.__dupScan || { shipments: { identical: {}, conflict: {} }, lines: { identical: {}, conflict: {} } }, conf = [], ident = [], seen = {};
(cands || []).forEach(function (c) {
var sid = recoWsStr_(c.shipmentId || c.linkedShipmentId), lid = recoWsStr_(c.shipmentLineId || c.linkedShipmentLineId);
var mine = members ? (members.indexOf(recoWsStr_(c.destinationWarehouseId)) !== -1) : (recoWsStr_(c.marketplace) === recoWsStr_(siteMarketplace));
var cs = sid && D.shipments.conflict[sid];
if (cs && (mine || cs.marketplaces.indexOf(recoWsStr_(siteMarketplace)) !== -1 || (members && cs.warehouses.some(function (w) { return members.indexOf(w) !== -1; }))) && !seen['S' + sid]) { seen['S' + sid] = 1; conf.push({ table: 'shipments', id: sid, rows: cs.rows, fields: cs.fields }); }
var cl = lid && D.lines.conflict[lid];
if (cl && mine && !seen['L' + lid]) { seen['L' + lid] = 1; conf.push({ table: 'shipment_lines', id: lid, rows: cl.rows, fields: cl.fields }); }
// D5-V3-R5F (M-1): an identical-row report goes to the site that OWNS the goods by lineage (receiver resolved); an unresolved
// candidate falls back to the destination / marketplace relation
var owner = (recoWsStr_(c.receiverResolutionStatus).toUpperCase() === 'RESOLVED' && recoWsStr_(c.marketplace)) ? recoWsSiteKey_(c.company, c.country, c.marketplace) : null;
var ownsIt = mySiteKey ? (owner ? owner === mySiteKey : mine) : mine;
if (ownsIt && sid && D.shipments.identical[sid] && !seen['s' + sid]) { seen['s' + sid] = 1; ident.push({ table: 'shipments', id: sid, rows: D.shipments.identical[sid].rows, countedOnce: true }); }
if (ownsIt && lid && D.lines.identical[lid] && !seen['l' + lid]) { seen['l' + lid] = 1; ident.push({ table: 'shipment_lines', id: lid, rows: D.lines.identical[lid].rows, countedOnce: true }); }
});
return { conflicts: conf, identical: ident };
}
var RECO_WS_DUP_CONFLICT_LABEL_ = 'conflicting duplicate shipment rows - this line is not calculated until the rows are fixed at the source';
var RECO_WS_DUP_IDENTICAL_LABEL_ = 'identical duplicate shipment rows - counted once';
// D5-V3-R5E (docs/WARNING_CONTRACT.md): the warning fields exist on every calculated line of both paths - an empty array /
// object means 'nothing to warn', never 'not computed'. A BLOCKED line carries blockedReason + its own detail field.
function recoWsWarnDefaults_(L) {
if (!L) return L;
['incomingDateSources', 'arrivalUndetermined', 'shippedEtaMissing', 'inventoryShares', 'inventoryShareUnknown', 'inventoryShareReconciliation', 'incomingAttribution'].forEach(function (k) { if (!Array.isArray(L[k])) L[k] = []; });
if (!L.shipmentDuplicates) L.shipmentDuplicates = { conflicts: [], identical: [] };
return L;
}
function recoWsRows_(read, key) {
if (!read.__rowCache) read.__rowCache = {};
if (read.__rowCache[key] === undefined) read.__rowCache[key] = recoWsToRowObjects_((read.snapshots || {})[key]);
return read.__rowCache[key];
}








function recoWsOngoingIncomingForReceiver_(read, scope, sku, siteSku, months) {
var poRows = recoWsRows_(read, 'purchaseOrderLines');
if (!poRows.length) return [];
if (!recoWsFormalPoLines_(read).rows.length) return [];
var res = recoWsOngoingRun_(read, scope.company, sku, months);
var rk = [scope.company, scope.country, scope.marketplace, siteSku].join('||');
return (res && res.byReceiver && res.byReceiver[rk]) ? res.byReceiver[rk] : [];
}







function recoWsOngoingRun_(read, company, sku, months) {
var poRows = recoWsFormalPoLines_(read).rows;
var okey = company + '|' + sku, ograw = (read.__ogOut = read.__ogOut || {});
if (typeof KMOOR === 'undefined' || !KMOOR || typeof KMOOR.projectOngoingIncomingForSku !== 'function') {
if (!ograw[okey]) ograw[okey] = recoWsOngoingUnaccounted_(poRows, company, sku, null, 'ONGOING_RUNTIME_UNAVAILABLE', '');
return null;
}
var srcRows = recoWsRows_(read, 'requestOrderLineSources');
var fcRows = recoWsRows_(read, 'fcRegularForecast');
var mskRows = recoWsRows_(read, 'marketplaceSkus');

var siteFc = [], seenSite = {};
mskRows.forEach(function (m) {
if (recoWsStr_(m.company) !== company || recoWsStr_(m.sku) !== sku) return;
var country = recoWsStr_(m.country), marketplace = recoWsStr_(m.marketplace), ssk = recoWsStr_(m.site_sku);
var key = country + '||' + marketplace + '||' + ssk; if (seenSite[key]) return; seenSite[key] = 1;
var byM = recoWsRegularForecastByMonth_(fcRows, { company: company, country: country, marketplace: marketplace }, sku, months);
var basis = 0; (months || []).forEach(function (ym) { var v = byM[ym]; if (typeof v === 'number' && isFinite(v)) basis += v; });
siteFc.push({ company: company, country: country, marketplace: marketplace, siteSku: ssk, siteFcBasis: basis });
});
var res;
try { res = KMOOR.projectOngoingIncomingForSku({ masterSku: sku, company: company, purchaseOrderLines: poRows, requestOrderLineSources: srcRows, monthlySiteFcFacts: siteFc, months: months }); }
catch (e) {
if (!ograw[okey]) ograw[okey] = recoWsOngoingUnaccounted_(poRows, company, sku, null, 'ONGOING_RUNTIME_FAILED', String(e && e.message || e).slice(0, 120));
return null;
}
if (!ograw[okey]) ograw[okey] = recoWsOngoingUnaccounted_(poRows, company, sku, res, null, '');
return res;
}





function recoWsOngoingAdmission_(read, company, sku) {
if (!recoWsRows_(read, 'purchaseOrderLines').length) return null;
var k = company + '|' + sku, ogOut = (recoWsFormalPoLines_(read).excluded[k] || []).concat((read.__ogOut || {})[k] || []);
return ogOut.length ? { excluded: ogOut, complete: ogOut.every(function (x) { return x.code === 'ONGOING_PO_DRAFT' || x.code === 'ONGOING_UNALLOCATED_RESIDUAL'; }) } : null;
}






function recoWsOngoingAdmissionLive_(ss, keys, io) {
var out = { ok: false, code: null, byKey: {} };
try {
if (typeof KMPS === 'undefined' || !KMPS || typeof KMPS.readCanonicalSnapshots !== 'function') { out.code = 'ONGOING_CHECK_RUNTIME_UNAVAILABLE'; return out; }
var read = KMPS.readCanonicalSnapshots(ss, { only: ['purchaseOrderLines'] }), has = {};
read.__poHeaderSs = ss;
recoWsRows_(read, 'purchaseOrderLines').forEach(function (l) { has[recoWsStr_(l.company) + '|' + recoWsStr_(l.sku)] = 1; });
var want = (keys || []).filter(function (k) { if (has[k]) return true; out.byKey[k] = { complete: true, excluded: [] }; return false; });
if (want.length) {
var calc = recoWsResolveCalcContext_(io || recommendationWorkspaceDefaultIo_());
if (!calc.ok) { out.code = 'ONGOING_CHECK_CALC_CONTEXT_UNAVAILABLE'; return out; }
var more = KMPS.readCanonicalSnapshots(ss, { only: ['requestOrderLineSources', 'fcRegularForecast', 'marketplaceSkus'] }).snapshots || {};
Object.keys(more).forEach(function (t) { read.snapshots[t] = more[t]; });
var months = (typeof KMPCX !== 'undefined' && KMPCX._forecastWeightMonths) ? KMPCX._forecastWeightMonths(calc.calculationMonth) : [];
var formal = recoWsFormalPoLines_(read).rows, hasFormal = {};
formal.forEach(function (l) { hasFormal[recoWsStr_(l.company) + '|' + recoWsStr_(l.sku)] = 1; });
want.forEach(function (k) {
var p = k.split('|');
if (hasFormal[k]) recoWsOngoingRun_(read, p[0], p[1], months);
out.byKey[k] = recoWsOngoingAdmission_(read, p[0], p[1]) || { complete: true, excluded: [] };
});
}
out.ok = true;
return out;
} catch (e) { out.code = 'ONGOING_CHECK_FAILED'; out.message = String(e && e.message || e).slice(0, 120); return out; }
}




function recoWsOngoingUnaccounted_(formalRows, company, sku, res, whole, wholeDetail) {
var mine = {}, order = [];
formalRows.forEach(function (l) {
if (recoWsStr_(l.company) !== company || recoWsStr_(l.sku) !== sku) return;
var id = recoWsStr_(l.purchase_order_line_id), q = recoWsNum_(l.ordered_qty), c = recoWsNum_(l.completed_qty);
var u = q === null || c === null ? null : Math.max(0, q - c);
if (!id || u === 0 || mine[id]) return;
mine[id] = { line: id, po: recoWsStr_(l.purchase_order_id), qty: u }; order.push(id);
});
if (whole) return order.map(function (id) { var m = mine[id]; return { line: m.line, po: m.po, code: whole, detail: wholeDetail, qty: m.qty }; });
var out = [], seen = {}, named = 0;
((res && res.issues) || []).forEach(function (x) {
var id = recoWsStr_(x.poLineId);
if (!id || seen[id] || !mine[id]) return;
seen[id] = 1; named += mine[id].qty || 0;
out.push({ line: id, po: mine[id].po, code: x.stage === 'KMOTA' && x.code === 'ONGOING_ORDER_ETA_UNRESOLVED' ? 'ONGOING_ETA_UNRESOLVED' : 'ONGOING_NOT_ACCOUNTED', detail: recoWsStr_(x.stage) + ' ' + recoWsStr_(x.code), qty: mine[id].qty });
});
var t = (res && res.totals) || {}, rest = (recoWsNum_(t.totalAdmittedQty) || 0) - (recoWsNum_(t.totalTimedIncomingQty) || 0) - named;
if (rest > 0) out.push({ line: '(SKU)', po: '', code: 'ONGOING_UNALLOCATED_RESIDUAL', detail: 'KMOOP floor residual', qty: rest });
return out;
}













function recoWsFormalPoLines_(read) {
if (read.__formalPo) return read.__formalPo;
var out = { rows: [], excluded: {} }, heads = {}, down = null, snap = recoWsPoHeaders_(read), memo = read.__poCache || read, drift = memo.__poDrift || {};
if (typeof aplOgOPEN_ === 'undefined' || typeof aplOgSHUT_ === 'undefined' || typeof aplOgDead_ !== 'function') down = 'ONGOING_PO_STATUS_AUTHORITY_UNAVAILABLE';
else if (!snap) down = memo.__poHeadersWhy || 'ONGOING_PO_HEADERS_UNAVAILABLE';
else recoWsToRowObjects_(snap).forEach(function (h) { var id = recoWsStr_(h.purchase_order_id); if (id) (heads[id] = heads[id] || []).push(h); });
recoWsRows_(read, 'purchaseOrderLines').forEach(function (l, i) {
var code = down, detail = '';
if (!code && drift[recoWsStr_(l.company) + '|' + recoWsStr_(l.sku)]) { code = 'ONGOING_PO_READ_DRIFT'; detail = 'its lines changed after the snapshot'; }
if (!code) {
if (aplOgDead_(l)) return;
var hs = heads[recoWsStr_(l.purchase_order_id)] || [], st = hs.length === 1 ? recoWsStr_(hs[0].order_status || hs[0].status).toLowerCase() : '';
if (!hs.length) code = 'ONGOING_PO_HEADER_MISSING';
else if (hs.length > 1) code = 'ONGOING_PO_HEADER_DUPLICATE';
else if (aplOgOPEN_[st] === 1) { out.rows.push(l); return; }
else if (st === 'draft') code = 'ONGOING_PO_DRAFT';
else if (aplOgSHUT_[st] === 1) return;
else { code = 'ONGOING_PO_STATUS_UNKNOWN'; detail = st || '(blank)'; }
}
var k = recoWsStr_(l.company) + '|' + recoWsStr_(l.sku), q = recoWsNum_(l.ordered_qty), c = recoWsNum_(l.completed_qty);
(out.excluded[k] = out.excluded[k] || []).push({ line: recoWsStr_(l.purchase_order_line_id) || '#' + (i + 1), po: recoWsStr_(l.purchase_order_id), code: code, detail: detail,
qty: q === null || c === null ? null : Math.max(0, q - c) });
});

Object.keys(memo.__poDriftNew || {}).forEach(function (k) {
(memo.__poDriftNew[k] || []).forEach(function (x) { (out.excluded[k] = out.excluded[k] || []).push({ line: x.line, po: x.po, code: 'ONGOING_PO_READ_DRIFT', detail: 'line added after the snapshot', qty: null }); });
});
read.__formalPo = out;
return out;
}


var RECO_WS_PO_LINE_FIELDS_ = ['purchase_order_line_id', 'purchase_order_id', 'request_order_line_id', 'company', 'sku', 'ordered_qty', 'requested_qty',
'completed_qty', 'shipped_qty', 'expected_completion_date', 'supplier_warehouse_id', 'line_status', 'status'];
var RECO_WS_PO_LOCK_WAIT_MS_ = 10000;
function recoWsPoLineSig_(o) {
return RECO_WS_PO_LINE_FIELDS_.map(function (f) {
var v = o[f];
if (Object.prototype.toString.call(v) === '[object Date]') return 'D' + v.getTime();
var s = recoWsStr_(v), n = Number(s);
return s !== '' && isFinite(n) ? 'N' + n : 'S' + s;
}).join('\u0001');
}

function recoWsPoLineDrift_(before, after) {
function index(rows) { var m = {}; rows.forEach(function (l, i) { var id = recoWsStr_(l.purchase_order_line_id) || '#' + (i + 1); m[id] = { k: recoWsStr_(l.company) + '|' + recoWsStr_(l.sku), sig: recoWsPoLineSig_(l), po: recoWsStr_(l.purchase_order_id) }; }); return m; }
var a = index(before), b = index(after), drift = {}, added = {};
Object.keys(a).forEach(function (id) { if (!b[id] || b[id].sig !== a[id].sig) { drift[a[id].k] = 1; if (b[id]) drift[b[id].k] = 1; } });
Object.keys(b).forEach(function (id) { if (!a[id]) { drift[b[id].k] = 1; (added[b[id].k] = added[b[id].k] || []).push({ line: id, po: b[id].po }); } });
return { drift: drift, added: added };
}














function recoWsPoHeaders_(read) {
var memo = read.__poCache || read;
if (memo.__poHeaders !== undefined) return memo.__poHeaders;
var snap = null, ss = read.__poHeaderSs, why = null;
var lock = null, held = false, drift = {}, added = {};
try {
lock = (typeof LockService !== 'undefined' && LockService) ? LockService.getScriptLock() : null;
held = !!(lock && lock.hasLock());
if (!lock || (!held && !lock.tryLock(RECO_WS_PO_LOCK_WAIT_MS_))) { lock = null; why = 'ONGOING_PO_CONSISTENCY_LOCK_UNAVAILABLE'; }
} catch (eL) { lock = null; why = 'ONGOING_PO_CONSISTENCY_LOCK_UNAVAILABLE'; }
if (!why) {
try {
var sh = ss && typeof ss.getSheetByName === 'function' ? ss.getSheetByName('purchase_orders') : null;
var v = sh ? sh.getDataRange().getValues() : [];
if (v.length) snap = { headers: v[0].map(function (x) { return recoWsStr_(x); }), rows: v.slice(1) };
if (snap && snap.headers.indexOf('purchase_order_id') < 0) snap = null;
if (!snap) why = sh ? 'ONGOING_PO_HEADERS_EMPTY' : 'ONGOING_PO_HEADERS_SHEET_MISSING';
} catch (e) { snap = null; why = 'ONGOING_PO_HEADERS_READ_FAILED'; }
if (snap) {
try {
var lsh = ss.getSheetByName('purchase_order_lines'), lv = lsh ? lsh.getDataRange().getValues() : null;
if (!lv || !lv.length) throw new Error('purchase_order_lines not readable');
var d = recoWsPoLineDrift_(recoWsRows_(read, 'purchaseOrderLines'), recoWsToRowObjects_({ headers: lv[0], rows: lv.slice(1) }));
drift = d.drift; added = d.added;
} catch (e2) { snap = null; why = 'ONGOING_PO_CONSISTENCY_UNVERIFIED'; }
}
if (lock && !held) { try { lock.releaseLock(); } catch (eR) {} }
}
memo.__poHeaders = snap; memo.__poHeadersWhy = why; memo.__poDrift = drift; memo.__poDriftNew = added;
return snap;
}

function recoWsExpandMarketplace_(read, scope, sku, siteSku, calc, vmeta, supplyAllocationByReceiver) {
var snaps = read.snapshots || {};
var mktRows = recoWsRows_(read, 'marketplaces'), whRows = recoWsRows_(read, 'warehouses');
var amazonRows = recoWsRows_(read, 'amazonInventorySnapshot');


var shipmentRows = recoWsShipmentLineCandidates_(read).candidates
.filter(function (e) { return recoWsStr_(e.candidate.sku) === sku; })
.map(function (e) { return KMSLS.toMarketplaceIncomingCandidate(e); });
var fcRows = recoWsRows_(read, 'fcRegularForecast');
var skuDetailRows = recoWsRows_(read, 'skuDetails');
var upc = recoWsUpcBySku_(skuDetailRows)[sku];
var skuRow = null; for (var si = 0; si < skuDetailRows.length; si++) { if (recoWsStr_(skuDetailRows[si].sku) === sku) { skuRow = skuDetailRows[si]; break; } }
var skuMeta = { sku: sku, series: skuRow ? recoWsStr_(skuRow.series) : '', category: skuRow ? recoWsStr_(skuRow.category) : '', company: scope.company };
var tgtRows = recoWsRows_(read, 'fcTargetRules');
var evtRows = recoWsEventRowsYmd_(recoWsRows_(read, 'fcSpecialEvents').filter(function (r) { return recoWsStr_(r.company) === '' || recoWsStr_(r.company) === scope.company; }));
var nd = KMDR.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: scope.company, country: scope.country, marketplace: scope.marketplace }, { marketplaces: mktRows });
if (!nd.ok) {
var code = (nd.issues && nd.issues[0] && nd.issues[0].code) || 'DESTINATION_AUTHORITY_UNRESOLVED';
return KMDR.buildRecommendationLine({ destination: { destinationType: 'MARKETPLACE', company: scope.company, country: scope.country, marketplace: scope.marketplace, destinationRefId: null, destinationKey: 'MARKETPLACE||' + scope.company + '||' + scope.country + '||' + scope.marketplace + '||' }, recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: sku, siteSku: siteSku, blocked: true, blockedReason: code, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf, diagnostics: { issues: [{ code: code, message: (nd.issues && nd.issues[0] && nd.issues[0].message) || '' }] } });
}
var evChk = recoWsEventCheck_(evtRows, scope, sku, calc);
if (!evChk.ok) return recoWsEventBlockedLine_(nd.destination, 'MARKETPLACE_ORDER_NEED', sku, siteSku, evChk, vmeta);
// D5-V3 (OD-3): reserved units of a created-but-unconfirmed Shipment are counted ONLY through the Shipment (planned supply at
// its ETA) because the factory pool is current - reserved. Without a valid ETA they could not be dated, so the SKU is BLOCKED
// with the shipment ids named - never dropped silently, never dated by guess.
var _dupM = recoWsDupTouch_(read, shipmentRows, scope.marketplace, null, recoWsSiteKey_(scope.company, scope.country, scope.marketplace));   // D5-V3-R5E
if (_dupM.conflicts.length) { var _bD = KMDR.buildRecommendationLine({ destination: nd.destination, recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: sku, siteSku: siteSku, blocked: true,
blockedReason: 'SHIPMENT_DUPLICATE_CONFLICT: ' + _dupM.conflicts.map(function (x) { return x.id; }).join(','), formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf,
diagnostics: { issues: [{ code: 'SHIPMENT_DUPLICATE_CONFLICT', message: RECO_WS_DUP_CONFLICT_LABEL_ + ': ' + _dupM.conflicts.map(function (x) { return x.table + ' ' + x.id + ' (' + x.fields.join(', ') + ')'; }).join('; ') }] } });
_bD.shipmentDuplicates = { conflicts: _dupM.conflicts, identical: _dupM.identical }; return _bD; }
var etaGap = recoWsPreDispatchEtaGaps_(shipmentRows, mktRows, nd.destination);
if (etaGap.length) { var _auM = shipmentRows.filter(function (c) { return etaGap.indexOf(recoWsStr_(c.shipmentId) || recoWsStr_(c.ref)) !== -1; })
.map(function (c) { return { shipmentId: recoWsStr_(c.shipmentId) || null, lineageKey: recoWsStr_(c.lineageKey) || null, qty: recoWsNum_(c.quantityRemaining), dateSource: 'UNDETERMINED', reason: 'NO_ETA_NO_PLAN_DATE', label: RECO_WS_ARRIVAL_UNDETERMINED_LABEL_ }; });
var _blkM = KMDR.buildRecommendationLine({ destination: nd.destination, recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: sku, siteSku: siteSku, blocked: true,
blockedReason: 'PLANNED_SHIPMENT_ETA_MISSING: ' + etaGap.join(','), formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf,
diagnostics: { issues: [{ code: 'PLANNED_SHIPMENT_ETA_MISSING', message: 'pre-dispatch shipment(s) ' + etaGap.join(', ') + ' hold reserved stock for this site but have no valid ETA and no plan date' },
{ code: 'ARRIVAL_DATE_UNDETERMINED', message: RECO_WS_ARRIVAL_UNDETERMINED_LABEL_ }] } });
_blkM.arrivalUndetermined = _auM; return _blkM; }
// P3PL-2 r3 (Owner 2026-11-21, NARROW): an open line owned by this platform site but bound for a 3PL arrives at the 3PL on its ETA - that is
// not a platform (FBA / WFS ...) sellable date, and the 3PL -> platform leg is B-Q1 = UNKNOWN, never 0 days. ONLY those rows' platform-sellable
// attribution is held: they are taken out of this site's dated supply (KMDR qualification, horizons, AI horizons) and named on the line
// (platformVia3pl, supplyUnderstatedQty, issue PLATFORM_VIA_3PL_NOT_COUNTED). The rest of the site x SKU keeps planning (same contract as
// SHIPPED_ETA_MISSING: not counted, not dated by guess, flagged, line READY). RISK, stated on the line: the gap does not count goods already on
// their way to the 3PL, so the suggested qty may be overstated by up to supplyUnderstatedQty. A held row without a lineage key cannot be taken
// out exactly, so the SKU falls back to the r2 whole-line HOLD below (fail closed - never counted at the 3PL ETA).
var _v3 = recoWsPlatformVia3pl_(read, sku, whRows, mktRows, nd.destination), _h3 = {}, _q3 = 0, _noKey3 = false;
_v3.forEach(function (x) { if (x && x.lineageKey) _h3[x.lineageKey] = 1; else _noKey3 = true; _q3 += Number(x && x.qty) || 0; });
if (_v3.length && !_noKey3) shipmentRows = shipmentRows.filter(function (c) { return !_h3[recoWsStr_(c.lineageKey)]; });
if (_v3.length && _noKey3) { var _n3 = _v3.map(function (x) { return x.shipmentId || x.lineageKey || '?'; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
var _b3 = KMDR.buildRecommendationLine({ destination: nd.destination, recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: sku, siteSku: siteSku, blocked: true,
blockedReason: 'PLATFORM_INCOMING_VIA_3PL_LEG_UNKNOWN: ' + _n3.join(','), formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf,
diagnostics: { issues: [{ code: 'PLATFORM_INCOMING_VIA_3PL_LEG_UNKNOWN', message: 'shipment(s) ' + _n3.join(', ') + ' belong to this site but go to a 3PL warehouse; the 3PL ETA is not the marketplace arrival and the 3PL -> marketplace leg is not decided (B-Q1), so the date is UNKNOWN (HOLD, not 0 days)' }] } });
_b3.platformVia3pl = _v3; return _b3; }
var months = (typeof KMPCX !== 'undefined' && KMPCX._forecastWeightMonths) ? KMPCX._forecastWeightMonths(calc.calculationMonth) : [];


var useKMPD = (typeof KMPD !== 'undefined' && KMPD && typeof KMPD.planningDemandByMonth === 'function');
var pdmMap = useKMPD ? KMPD.planningDemandByMonth({ fcRegularRows: fcRows, fcTargetRuleRows: tgtRows, fcSpecialEventRows: evtRows, scope: scope, sku: sku, skuMeta: skuMeta, months: months }) : null;
var rawFcByMonth = recoWsRegularForecastByMonth_(fcRows, scope, sku, months);
var demandByMonth = {}, demandQty = 0, haveAll = months.length === 4;
months.forEach(function (mm) {
var d = useKMPD ? (pdmMap[mm] ? pdmMap[mm].demand : undefined) : rawFcByMonth[mm];
if (d === null || d === undefined) { haveAll = false; return; }
demandByMonth[mm] = d; demandQty += d;
});
var requiredBy = (months[0] || calc.calculationMonth) + '-01';
var res = KMDR.resolveUnifiedDestinationRecommendation(
{ marketplaces: mktRows, warehouses: whRows, amazonInventory: amazonRows, marketplaceIncomingCandidates: shipmentRows },
{ recommendationType: 'MONTHLY_ORDER', scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku }, destination: { destinationType: 'MARKETPLACE' }, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf },
{ regularForecastByMonth: demandByMonth, unitsPerCarton: upc, requiredByDate: requiredBy }
);
var L = res.line || {};
var partial = L.incomingCompleteness === 'PARTIAL' || L.incomingCompleteness === 'UNAVAILABLE';

var unknownSt = (L.unknownStatusIncomingRefs || []).length > 0 && !(L.unresolvedIncomingRefs || []).length;
var blockedReason = L.blocked ? (partial ? (unknownSt ? 'MARKETPLACE_INCOMING_STATUS_UNKNOWN' : 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED') : (recoWsStr_(L.blockedReason) || null)) : null;
var mLine = KMDR.buildRecommendationLine({
destination: nd.destination, recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: sku, siteSku: siteSku,
allocatedForecastQty: haveAll ? demandQty : (demandQty > 0 ? demandQty : null),
currentStockQty: L.currentStockQty, qualifiedIncomingQty: L.confirmedQualifiedIncomingQty, incomingCompleteness: L.incomingCompleteness,
calculatedGap: L.calculatedGap, recommendedQty: L.recommendedQty, provisionalOrderNeed: L.provisionalOrderNeed,
blocked: L.blocked === true, blockedReason: blockedReason, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf,
diagnostics: { issues: (res.issues || []).map(function (x) { return { code: x.code, message: x.message }; }) }
});



var mIncoming = (L.qualifiedEvents || []).map(function (e) { return { incomingId: e.incomingId, eta: e.eta, qty: e.eligibleQty, sourceType: e.sourceType }; });



var mOngoing = recoWsOngoingIncomingForReceiver_(read, scope, sku, siteSku, months);
if (mOngoing.length) mIncoming = mIncoming.concat(mOngoing);




var ogAdm = recoWsOngoingAdmission_(read, scope.company, sku), ogOut = ogAdm ? ogAdm.excluded : [];
if (ogAdm) {
mLine.ongoingAdmission = ogAdm;
if (mLine.diagnostics && Array.isArray(mLine.diagnostics.issues)) ogOut.forEach(function (x) {
var known = x.code === 'ONGOING_PO_DRAFT' || x.code === 'ONGOING_UNALLOCATED_RESIDUAL';
mLine.diagnostics.issues.push({ code: x.code, message: 'PO line ' + x.line + ' (' + (x.qty === null ? 'quantity unreadable' : x.qty + ' unreceived') + (x.detail ? '; ' + x.detail : '') + '): not counted as incoming'
+ (x.code === 'ONGOING_PO_DRAFT' ? ' - a draft PO is not confirmed supply' : known ? ' - given to no site' : ' - its Ongoing is incomplete, not a verified 0') });
});
}
var cmr = (useKMPD && calc.calculationDate) ? KMPD.currentMonthRemainingDemand({ calculationDate: calc.calculationDate, fcRegularRows: fcRows, fcTargetRuleRows: tgtRows, fcSpecialEventRows: evtRows, scope: scope, sku: sku, skuMeta: skuMeta }) : null;
var preT1Demand = (cmr && cmr.ready) ? Math.round(cmr.demand) : null;
var preT1Date = (cmr && cmr.ready) ? cmr.requiredByDate : null;




var siteStockQty = recoWsNum_(L.currentStockQty);
var rKey = (typeof KMMSA !== 'undefined' && KMMSA && typeof KMMSA.receiverKeyOf === 'function')
? KMMSA.receiverKeyOf({ company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku }) : null;
var rAlloc = (recoWsIsObj_(supplyAllocationByReceiver) && rKey && recoWsIsObj_(supplyAllocationByReceiver[rKey])) ? supplyAllocationByReceiver[rKey] : null;
var ovAlloc_ = rAlloc ? (recoWsNum_(rAlloc.overseasCoveredQty) || 0) : 0, fcAlloc_ = rAlloc ? (recoWsNum_(rAlloc.factoryCoveredQty) || 0) : 0;   // b4
var composition = recoWsComposeOpeningSupply_(siteStockQty, RECO_WS_OVERSEAS_TO_PLATFORM_OPENING_ ? ovAlloc_ : 0, RECO_WS_FACTORY_STOCK_TO_PLATFORM_OPENING_ ? fcAlloc_ : 0);
composition.overseasTransferOfferedQty = RECO_WS_OVERSEAS_TO_PLATFORM_OPENING_ ? 0 : ovAlloc_; composition.factoryOffsetOfferedQty = RECO_WS_FACTORY_STOCK_TO_PLATFORM_OPENING_ ? 0 : fcAlloc_;   // b4: offered, not in the opening
var mProj = recoWsBuildMonthlyProjection_(months, composition.openingSupplyQty, (haveAll ? demandByMonth : null), mIncoming, upc, nd.destination, preT1Demand, preT1Date, composition.overseasTransferOfferedQty, composition.factoryOffsetOfferedQty);
if (mProj) { mLine.monthlyProjection = mProj; mLine.openingSupplyComposition = composition;
  var ovUsed_ = mProj.reduce(function (a, x) { return a + (x.overseasCoveredQty || 0); }, 0);   // b4: the suggested transfer (FIFO-consumed part of the offer)
  if (composition.overseasTransferOfferedQty > 0) mLine.overseasTransfer = { offeredQty: composition.overseasTransferOfferedQty, suggestedQty: ovUsed_, legDate: 'UNKNOWN', reason: 'FBA_LEG_UNDECIDED_B_Q1', platformSellable: false };
  var sum_ = function (k) { return mProj.reduce(function (a, x) { return a + (typeof x[k] === 'number' && isFinite(x[k]) ? x[k] : 0); }, 0); };   // b5 Q1: the factory layer of the platform need
  if (composition.factoryOffsetOfferedQty > 0 || ovUsed_ > 0) mLine.factoryShip = { stockOfferedQty: composition.factoryOffsetOfferedQty, shipQty: sum_('factoryShipQty'), fromStockQty: sum_('factoryShipFromStockQty'), newPurchaseQty: sum_('newPurchaseQty'), platformSellable: false }; }


if (rAlloc && (rAlloc.reallocationInQty != null || rAlloc.reallocationOutQty != null || rAlloc.factoryAvailableQtySnapshot != null)) {
mLine.factorySurplusReallocation = { factoryAvailableQtySnapshot: recoWsNum_(rAlloc.factoryAvailableQtySnapshot), reallocationInQtySnapshot: recoWsNum_(rAlloc.reallocationInQty), reallocationOutQtySnapshot: recoWsNum_(rAlloc.reallocationOutQty) };
}
if (cmr && cmr.ready) mLine.currentMonthRemaining = { requiredByDate: cmr.requiredByDate, month: cmr.ym, remainingDays: cmr.remainingDays, demandQty: Math.round(cmr.demand) };




var planModel = recoWsResolvePlanningModel_(read, scope, sku);
var salesRate = null, salesReason = null;









var sr = recoWsResolveSalesRate_(read, scope, sku, calc.calculationDate);
if (planModel === 'sales_driven') { if (sr.ok) salesRate = sr.avgSalesPerDay; else salesReason = (sr.reason || 'SALES_BASIS_UNAVAILABLE') + (sr.detail ? ': ' + sr.detail : ''); }








var horizonOpening = recoWsNum_(L.currentStockQty);
if (horizonOpening === null && typeof KMDR.resolveMarketplaceCurrentStock === 'function') {
var siteRes = KMDR.resolveMarketplaceCurrentStock({ rows: amazonRows, scope: { country: scope.country, marketplace: scope.marketplace, sku: sku } });
if (siteRes && siteRes.ready && typeof siteRes.qty === 'number') horizonOpening = siteRes.qty;
}



var hzIncoming = mIncoming;
if (calc.calculationDate && typeof KMDR.resolveMarketplaceQualifiedIncoming === 'function') {
var c90 = new Date(Date.parse(calc.calculationDate + 'T00:00:00Z') + 90 * 864e5).toISOString().slice(0, 10);
hzIncoming = (KMDR.resolveMarketplaceQualifiedIncoming({ candidates: shipmentRows, marketplaces: mktRows, scope: nd.destination, requiredByDate: c90 }).qualifiedEvents || [])
.map(function (e) { return { incomingId: e.incomingId, eta: e.eta, qty: e.eligibleQty, sourceType: e.sourceType }; }).concat(mOngoing);
}
var mHz = (planModel === 'sales_driven' && salesRate === null) ? null
: recoWsBuildHorizons_(calc, fcRows, tgtRows, evtRows, skuMeta, scope, sku, horizonOpening, hzIncoming, upc, nd.destination, planModel, salesRate);
if (mHz) mLine.horizons = mHz;
if (read.__dailyAllocationCollect) mLine.__allocationProjection = recoWsBuildHorizons_(calc, fcRows, tgtRows, evtRows, skuMeta, scope, sku, horizonOpening, hzIncoming, upc, nd.destination, planModel, salesRate, true);




else mLine.horizonsBlockedReason = salesReason || 'HORIZON_PROJECTION_UNAVAILABLE';
if (mHz) { var gM = recoWsAiGateEvents_(evtRows, scope, sku, calc); if (gM.gated.length) { mLine.aiGatedEvents = gM.gated;   // D5-V3-R3 (m5)
mLine.aiHorizons = recoWsBuildHorizons_(calc, fcRows, tgtRows, gM.rows, skuMeta, scope, sku, horizonOpening, hzIncoming, upc, nd.destination, planModel, salesRate) || null; } }
// D5-V3-R2 (review m1): planned / shipped / ongoing labelled separately (quantities unchanged)
var stById = {}; shipmentRows.forEach(function (c) { var lk = recoWsStr_(c.lineageKey); if (lk) stById[lk] = c.status; });
var _cntM = {}; (hzIncoming || []).forEach(function (ev) { var id = recoWsStr_(ev && ev.incomingId); if (id) _cntM[id] = 1; });   // D5-V3-R5D
mLine.incomingDateSources = recoWsIncomingDateSources_(read, shipmentRows.map(function (c) { return { lineageKey: c.lineageKey, shipmentId: c.shipmentId, qty: c.quantityRemaining, ids: [c.lineageKey, c.supplyCandidateId, c.ref, c.shipmentLineId] }; }), _cntM, recoWsHorizonEnd_(calc),
(function () { var o = {}; (mIncoming || []).forEach(function (ev) { var id = recoWsStr_(ev && ev.incomingId); if (id) o[id] = 1; }); return o; })(), recoWsMonthsEnd_(months));   // D5-V3-R5F (m-3)
if (_dupM.identical.length) { mLine.shipmentDuplicates = { conflicts: [], identical: _dupM.identical }; mLine.diagnostics = mLine.diagnostics || { issues: [] }; mLine.diagnostics.issues = (mLine.diagnostics.issues || []).concat([{ code: 'SHIPMENT_DUPLICATE_ROWS', message: RECO_WS_DUP_IDENTICAL_LABEL_ + ': ' + _dupM.identical.map(function (x) { return x.table + ' ' + x.id + ' x' + x.rows; }).join('; ') }]); }
var _shM = mLine.incomingDateSources.filter(function (d) { return d.dateSource === 'ETA_MISSING'; });
if (_shM.length) { mLine.shippedEtaMissing = _shM; mLine.diagnostics = mLine.diagnostics || { issues: [] }; mLine.diagnostics.issues = (mLine.diagnostics.issues || []).concat([{ code: 'SHIPPED_ETA_MISSING', message: RECO_WS_SHIPPED_ETA_MISSING_LABEL_ + ': ' + _shM.map(function (d) { return d.shipmentId || d.lineageKey; }).join(', ') }]); }   // D5-V3-R5
recoWsWarnDefaults_(mLine);   // D5-V3-R5E
if (_v3.length) { mLine.platformVia3pl = _v3; mLine.supplyUnderstatedQty = _q3; mLine.diagnostics = mLine.diagnostics || { issues: [] };   // P3PL-2 r3 (narrow)
mLine.diagnostics.issues = (mLine.diagnostics.issues || []).concat([{ code: 'PLATFORM_VIA_3PL_NOT_COUNTED', message: _v3.map(function (x) { return (x.shipmentId || x.lineageKey) + ' ' + x.qty + ' -> 3PL ' + x.destinationWarehouseId + ' (3PL ETA ' + (x.threePlEta || 'none') + ')'; }).join('; ') + ': not counted as this site\'s sellable supply - the 3PL -> platform leg is not decided (B-Q1, UNKNOWN, never 0 days). Supply may be UNDERSTATED by up to ' + _q3 + ' (the suggested qty may be overstated by up to ' + _q3 + ').' }]); }
mLine.supplyBreakdown = recoWsSupplyBreakdown_(hzIncoming, stById);











mLine.horizonBasis = recoWsBasisOf_(sr, planModel, horizonOpening, (hzIncoming || []).length);
return mLine;
}














function recoWsBasisOf_(sr, planModel, openingQty, incomingCount) {
return { demandMode: planModel, avgSalesPerDay: (sr.ok ? sr.avgSalesPerDay : null),
source: (sr.ok ? sr.source : null), warning: (sr.ok ? sr.warning : null),
normalDayCount: (sr.ok ? sr.normalDayCount : null), excludedDates: (sr.ok ? sr.excludedDates : null),
windowPolicy: (sr.ok ? sr.windowPolicy : null), windowStart: (sr.ok ? sr.windowStart : null), windowEnd: (sr.ok ? sr.windowEnd : null), normalSalesUnits: (sr.ok ? sr.normalSalesUnits : null),
horizonOpeningQty: (openingQty === undefined ? null : openingQty),
qualifiedIncomingCount: (incomingCount === undefined ? null : incomingCount),
blankDateRows: (sr.blankDateRows == null ? null : sr.blankDateRows),
basisQualityError: (sr.ok ? null : (sr.reason || null)), contaminationSource: (sr.ok ? sr.contaminationSource : null) };
}




function recoWsSkuInactive_(read, scope, sku) {
var rows = recoWsRows_(read, 'marketplaceSkus').filter(function (r) {
return recoWsStr_(r.company) === scope.company && recoWsStr_(r.country) === scope.country &&
recoWsStr_(r.marketplace) === scope.marketplace && recoWsStr_(r.sku) === sku;
});
return rows.length > 0 && rows.every(function (r) { return recoWsStr_(r.marketplace_sku_status).toLowerCase() === 'inactive'; });
}

function recoWsDailyWarehouse_(read, ss, scope, sku, siteSku, calc, vmeta) {
var cache = read.__dailyWarehouseCache || (read.__dailyWarehouseCache = {});
var groupKey = [scope.company, scope.country, sku, calc.calculationDate].join('||');
var wanted = recoWsSiteKey_(scope.company, scope.country, scope.marketplace);
function blocked(code) {
return { lines: [KMDR.buildRecommendationLine({ destination: { destinationType: 'WAREHOUSE', company: scope.company,
country: scope.country, marketplace: scope.marketplace, warehouseId: null, destinationKey: 'WAREHOUSE||' + wanted + '||' },
recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku, blocked: true, blockedReason: code,
formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf })] };
}
if (typeof KMDWA === 'undefined') return blocked('DAILY_ALLOCATION_RUNTIME_MISSING');
if (cache[groupKey] && cache[groupKey][wanted]) return cache[groupKey][wanted];
var mappings = recoWsRows_(read, 'marketplaceSkus'), marketRows = recoWsRows_(read, 'marketplaces');
var rules = recoWsRows_(read, 'replenishmentDemandAllocationRules'), whRows = recoWsRows_(read, 'warehouses'), whById = {};
whRows.forEach(function (w) { whById[recoWsStr_(w.warehouse_id)] = w; });
var sites = {}, candidates = {};
mappings.forEach(function (r) {
if (recoWsStr_(r.company) !== scope.company || recoWsStr_(r.country) !== scope.country || recoWsStr_(r.sku) !== sku) return;
var sc = { company: scope.company, country: scope.country, marketplace: recoWsStr_(r.marketplace) };
var key = recoWsSiteKey_(sc.company, sc.country, sc.marketplace);
if (sites[key] || recoWsSkuInactive_(read, sc, sku)) return;
var f = recoWsResolveFulfillment_(marketRows, sc), model = recoWsStr_(f && f.row && f.row.fulfillment_model).toLowerCase();
var masters = marketRows.filter(function (m) {
var st = recoWsStr_(m.status).toLowerCase();
return recoWsStr_(m.company) === sc.company && recoWsStr_(m.country) === sc.country &&
recoWsStr_(m.marketplace) === sc.marketplace && (st === '' || st === 'active' || st === 'true');
});
if (f && f.row && recoWsStr_(f.row.status).toLowerCase() === 'inactive') return;
if (model === 'hybrid') model = recoWsStr_(recoWsFulfillmentModelBySku_(mappings, sc)[sku]).toLowerCase();
var active = KMDA.readActiveAllocationRules(rules, sc, calc.calculationMonth);
if (!active.length && model === 'platform_fulfilled') return; // no 3PL membership, hence no 3PL reserve
var valid = KMDA.validateAllocationRules(active, sc, whById);
var members = valid.ok ? valid.warehouses.map(function (w) { return w.warehouseId; })
: active.map(function (a) { return recoWsStr_(a.destination_warehouse_id); }).filter(Boolean);
var priorityRaw = f && f.row && f.row.allocation_priority;
sites[key] = { scope: sc, siteSku: recoWsSiteSkuBySku_(mappings, sc)[sku] || null, members: members,
model: model, priority: priorityRaw === '' || priorityRaw == null ? 100 : recoWsNum_(priorityRaw), rulesValid: valid.ok && masters.length === 1 };
});
if (!sites[wanted]) return blocked('DEMAND_ALLOCATION_RULE_NOT_CONFIGURED');

// Solve the complete connected component, even when the request only names one marketplace.
var component = {}, whSet = {}, changed = true;
component[wanted] = true;
while (changed) {
changed = false;
Object.keys(component).forEach(function (key) { sites[key].members.forEach(function (wid) { whSet[wid] = true; }); });
Object.keys(sites).forEach(function (key) {
if (!component[key] && sites[key].members.some(function (wid) { return whSet[wid]; })) { component[key] = true; changed = true; }
});
}
var keys = Object.keys(component).sort(), error = null;
read.__dailyAllocationCollect = true;
try {
keys.forEach(function (key) {
if (error) return;
var s = sites[key];
if (!s.rulesValid || s.priority === null || s.priority < 0 || ['self_fulfilled', 'platform_fulfilled'].indexOf(s.model) === -1) {
error = 'DAILY_ALLOCATION_RECEIVER_UNRESOLVED: ' + key; return;
}
if (s.members.some(function (wid) {
var w = whById[wid] || {};
return recoWsStr_(w.company) !== scope.company || recoWsStr_(w.country).toUpperCase() !== scope.country.toUpperCase() ||
recoWsStr_(w.warehouse_type).toLowerCase() !== '3pl' || recoWsStr_(w.is_factory_warehouse).toLowerCase() === 'true';
})) { error = 'DAILY_ALLOCATION_WAREHOUSE_SCOPE_INVALID: ' + key; return; }
var c = recoWsExpandWarehouse_(read, ss, s.scope, sku, s.siteSku, calc, vmeta);
if (!c.dailySource) { error = 'DAILY_ALLOCATION_SOURCE_BLOCKED: ' + key + ': ' + recoWsStr_(c.lines && c.lines[0] && c.lines[0].blockedReason); return; }
var hp = c.dailySource.projection;
if (s.model === 'platform_fulfilled') {
var p = recoWsExpandMarketplace_(read, s.scope, sku, s.siteSku, calc, vmeta, null);
hp = p && !p.blocked ? p.__allocationProjection : null;
}
if (!hp || !hp.ready || hp.horizons.some(function (h) { return h.demandQty === null; })) { error = 'DAILY_ALLOCATION_DEMAND_UNKNOWN: ' + key; return; }
candidates[key] = { collector: c, demand: hp.timeline.filter(function (t) { return t.kind === 'DEMAND'; }).map(function (t) {
return { date: t.date, qty: s.model === 'platform_fulfilled' ? t.shortageQty : t.qty };
}), ownedIncoming: [] };
});
} finally { delete read.__dailyAllocationCollect; }
if (error) return blocked(error);

var stock = {}, incoming = {}, lineage = recoWsLineageByKey_(read), lots = [];
keys.forEach(function (key) {
var raw = candidates[key].collector.dailySource;
raw.members.forEach(function (wid) {
var q = raw.openingByWarehouse[wid];
if (q === undefined || q === null || (stock[wid] !== undefined && stock[wid] !== q)) error = 'DAILY_ALLOCATION_STOCK_UNKNOWN: ' + wid;
stock[wid] = q;
});
raw.incoming.forEach(function (e) {
if (e.crossCompanyHeader) return;
var id = recoWsStr_(e.incomingId);
if (!id || !recoWsValidYmd_(e.eta) || recoWsNum_(e.qty) === null) { error = 'DAILY_ALLOCATION_INCOMING_INVALID'; return; }
var previous = incoming[id];
if (previous && (previous.qty !== e.qty || previous.eta !== e.eta || previous.warehouseId !== e.warehouseId)) error = 'DAILY_ALLOCATION_INCOMING_CONFLICT: ' + id;
incoming[id] = e;
});
});
Object.keys(stock).sort().forEach(function (wid) {
lots.push({ id: 'STOCK:' + wid, warehouseId: wid, company: scope.company, country: scope.country, sku: sku,
date: calc.calculationDate, qty: stock[wid], opening: true });
});
Object.keys(incoming).sort().forEach(function (id) {
var e = incoming[id], owner = lineage[id];
if (owner && owner.resolved) {
if (owner.company && owner.company !== scope.company) return;
// Lineage-owned supply is never redistributed, including an inactive/non-member owner's reservation.
if (candidates[owner.siteKey] && sites[owner.siteKey].members.indexOf(e.warehouseId) !== -1) candidates[owner.siteKey].ownedIncoming.push(e);
return;
}
lots.push({ id: id, warehouseId: e.warehouseId, company: scope.company, country: scope.country, sku: sku, date: e.eta,
qty: e.qty, sourceType: e.sourceType, opening: false });
});
if (error) return blocked(error);
var allocation = KMDWA.allocate({ company: scope.company, country: scope.country, sku: sku, calculationDate: calc.calculationDate,
lots: lots, receivers: keys.map(function (key) {
return { key: key, company: scope.company, country: scope.country, sku: sku, priority: sites[key].priority,
warehouseIds: sites[key].members, demand: candidates[key].demand, ownedOpeningQty: 0, ownedIncoming: candidates[key].ownedIncoming };
}) });
if (!allocation.ready) return blocked('DAILY_ALLOCATION_BLOCKED: ' + recoWsStr_(allocation.issues && allocation.issues[0] && allocation.issues[0].code));
var results = cache[groupKey] || (cache[groupKey] = {});
keys.forEach(function (key) {
var a = allocation.bySite[key], c = candidates[key], s = sites[key];
if (s.model !== 'self_fulfilled') return; // a platform's reserve never enters FBA sellable stock
var summary = { version: allocation.version, calculationDate: calc.calculationDate, horizonDays: 90,
priority: s.priority, openingQty: a.openingQty, allocatedQty: a.allocatedQty, exactQty: a.exactQty,
warehouseQty: a.warehouses, receiverCount: keys.length, reconciliation: allocation.reconciliation };
results[key] = c.collector.finishDaily({ openingQty: a.openingQty, incoming: a.incoming.concat(c.ownedIncoming),
reconciliation: [], summary: summary });
});
return results[wanted] || blocked('DAILY_ALLOCATION_RESULT_MISSING');
}

function recoWsExpandWarehouse_(read, ss, scope, sku, siteSku, calc, vmeta) {
if (calc.siteInventoryDaily && !read.__dailyAllocationCollect) return recoWsDailyWarehouse_(read, ss, scope, sku, siteSku, calc, vmeta);
var snaps = read.snapshots || {}, lines = [];
var whRows = recoWsRows_(read, 'warehouses'), ruleRows = recoWsRows_(read, 'replenishmentDemandAllocationRules'), fcRows = recoWsRows_(read, 'fcRegularForecast');
var skuDetailRowsW = recoWsRows_(read, 'skuDetails');
var upc = recoWsUpcBySku_(skuDetailRowsW)[sku];
var skuRowW = null; for (var swi = 0; swi < skuDetailRowsW.length; swi++) { if (recoWsStr_(skuDetailRowsW[swi].sku) === sku) { skuRowW = skuDetailRowsW[swi]; break; } }
var skuMetaW = { sku: sku, series: skuRowW ? recoWsStr_(skuRowW.series) : '', category: skuRowW ? recoWsStr_(skuRowW.category) : '', company: scope.company };
var tgtRowsW = recoWsRows_(read, 'fcTargetRules');
var evtRowsW = recoWsEventRowsYmd_(recoWsRows_(read, 'fcSpecialEvents').filter(function (r) { return recoWsStr_(r.company) === '' || recoWsStr_(r.company) === scope.company; }));
var whById = {}; whRows.forEach(function (w) { var id = recoWsStr_(w.warehouse_id); if (id) whById[id] = w; });
var scopeObj = { company: scope.company, country: scope.country, marketplace: scope.marketplace };














var whPlanModel = recoWsResolvePlanningModel_(read, scope, sku);
var wsr = recoWsResolveSalesRate_(read, scope, sku, calc.calculationDate);
var whBasis = recoWsBasisOf_(wsr, whPlanModel);
function whReturn_(ls) { ls.forEach(function (ln) { ln.horizonBasis = whBasis; }); return { lines: ls }; }
var whSalesRate = null, whSalesReason = null;
if (whPlanModel === 'sales_driven') { if (wsr.ok) whSalesRate = wsr.avgSalesPerDay; else whSalesReason = (wsr.reason || 'SALES_BASIS_UNAVAILABLE') + (wsr.detail ? ': ' + wsr.detail : ''); }
var active = KMDA.readActiveAllocationRules(ruleRows, scopeObj, calc.calculationMonth);
var ruleset = KMDA.validateAllocationRules(active, scopeObj, whById);
if (!ruleset.ok) {
var iss = (ruleset.issues && ruleset.issues[0]) || { code: 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED' };
lines.push(KMDR.buildRecommendationLine({ destination: { destinationType: 'WAREHOUSE', company: scope.company, country: scope.country, marketplace: scope.marketplace, destinationRefId: null, warehouseId: null, destinationKey: 'WAREHOUSE||' + scope.company + '||' + scope.country + '||' + scope.marketplace + '||' }, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku, blocked: true, blockedReason: iss.code, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf, diagnostics: { issues: [{ code: iss.code, message: iss.message || '' }] } }));
return whReturn_(lines);
}
var evChkW = recoWsEventCheck_(evtRowsW, scope, sku, calc);
if (!evChkW.ok) {
lines.push(recoWsEventBlockedLine_({ destinationType: 'WAREHOUSE', company: scope.company, country: scope.country, marketplace: scope.marketplace, destinationRefId: null, warehouseId: null, destinationKey: 'WAREHOUSE||' + scope.company + '||' + scope.country + '||' + scope.marketplace + '||' }, 'WAREHOUSE_REPLENISHMENT', sku, siteSku, evChkW, vmeta));
return whReturn_(lines);
}
var months = (typeof KMPCX !== 'undefined' && KMPCX._forecastWeightMonths) ? KMPCX._forecastWeightMonths(calc.calculationMonth) : [];
var fcByMonth = recoWsRegularForecastByMonth_(fcRows, scope, sku, months);
var override = {}; ruleset.warehouses.forEach(function (w) { override[w.warehouseId] = {}; });
months.forEach(function (mm) {
var fcMonth = fcByMonth[mm]; if (fcMonth == null) return;
var split = KMDA.allocateMarketplaceDemand(fcMonth, ruleset, 'forecast');
if (split && split.ready) ruleset.warehouses.forEach(function (w) { if (split.byKey && split.byKey[w.warehouseId] != null) override[w.warehouseId][mm] = split.byKey[w.warehouseId]; });
});
// D5-V3 (Owner V3-3, OD-2, OD-3, 2026-11-13): a self-fulfilled site gets ONE site-level line.
//   Demand is counted ONCE for the site (Regular FC with its existing Target% rule, or the site's Sales Driven daily rate,
//   plus each event once) - it is NEVER split by warehouse (the allocation ratios are not demand ratios).
//   Supply = the site's member warehouses, i.e. the warehouses EXPLICITLY linked by the site's valid allocation setting:
//   their CURRENT_STOCK summed, plus their incoming. A member warehouse that is also linked to another site has unknown
//   ownership -> the line is BLOCKED (never counted twice, never guessed); an unknown member stock -> BLOCKED.
//   Destination (OD-2): exactly one valid member -> it is the destination; several -> the destination is left for the
//   user to choose (destinationChoiceRequired); the quantity is never split or averaged across them.
//   `override` (the raw Regular FC split) is still the KMPA input, used here ONLY to read each member's supply facts; the
//   KMPA per-warehouse gap/recommendation is not surfaced (it is a split-demand figure).
var members = ruleset.warehouses.map(function (w) { return w.warehouseId; });
var siteDest = { destinationType: 'WAREHOUSE', company: scope.company, country: scope.country, marketplace: scope.marketplace, destinationRefId: null, warehouseId: null, destinationKey: 'WAREHOUSE||' + scope.company + '||' + scope.country + '||' + scope.marketplace + '||' };
function siteBlocked_(code, message, extra) {
var ln = KMDR.buildRecommendationLine({ destination: siteDest, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku, blocked: true, blockedReason: code,
formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf, diagnostics: { issues: [{ code: code.split(':')[0], message: message || '' }] } });
if (extra) for (var xk in extra) { if (Object.prototype.hasOwnProperty.call(extra, xk)) ln[xk] = extra[xk]; }
lines.push(ln); return whReturn_(lines);
}
// OD-3: a member linked to ANOTHER site's valid setting is shared; D5-V3-R5 (Owner M4 = (a)+(c)): its part is counted by
// the configured inventory_share(W, S) - pool x share - or, when that share is missing / invalid, NOT counted and flagged.
var allActive = KMDA.readActiveAllocationRules(ruleRows, {}, calc.calculationMonth), shared = [], linkedByWh = {};
// A2-B2 (Owner A0 conditions 2026-11-19): a warehouse is shared only among the sites of the warehouse's OWN company
// (warehouses.company). A rule of another company naming it is not a valid setting for that warehouse (KMDA refuses a
// cross-company destination), so it never makes the warehouse shared; it is reported (crossCompanyLinks). A member
// warehouse whose company is blank cannot say which sites share it -> this site is BLOCKED, never guessed.
var whCoBlankW = members.filter(function (w3) { return !recoWsStr_(whById[w3] && whById[w3].company); }).sort();
if (whCoBlankW.length) return siteBlocked_('WAREHOUSE_COMPANY_UNKNOWN: ' + whCoBlankW.join(','), 'member warehouse(s) ' + whCoBlankW.join(', ') + ' have no company - which sites share them cannot be determined; no suggestion until warehouses.company is set', recoWsWarnDefaults_({ memberWarehouses: members.slice().sort() }));
var crossCoLinks = [];
allActive.forEach(function (r) { var wid0 = recoWsStr_(r.destination_warehouse_id); if (!wid0) return; var sk0 = recoWsSiteKey_(r.company, r.country, r.marketplace);
var wco0 = recoWsStr_(whById[wid0] && whById[wid0].company).toLowerCase();
if (wco0 && recoWsStr_(r.company).toLowerCase() !== wco0) { if (members.indexOf(wid0) !== -1 && !crossCoLinks.some(function (x) { return x.warehouseId === wid0 && x.siteKey === sk0; })) crossCoLinks.push({ warehouseId: wid0, warehouseCompany: recoWsStr_(whById[wid0].company), siteKey: sk0 }); return; }
(linkedByWh[wid0] = linkedByWh[wid0] || []); if (linkedByWh[wid0].indexOf(sk0) === -1) linkedByWh[wid0].push(sk0); });
var mySiteKey = recoWsSiteKey_(scope.company, scope.country, scope.marketplace), shareByWh = {};
var fcRatioByWh = {}; allActive.forEach(function (r) { var w9 = recoWsStr_(r.destination_warehouse_id); if (!w9) return; (fcRatioByWh[w9] = fcRatioByWh[w9] || {})[recoWsSiteKey_(r.company, r.country, r.marketplace)] = r.forecast_allocation_ratio; });   // D5-V3-R5E: used only when RECO_WS_INTRANSIT_RATIO_SOURCE_ = forecast_ratio
members.forEach(function (wid1) { var ls = (linkedByWh[wid1] || []).slice(); if (ls.indexOf(mySiteKey) === -1) ls.push(mySiteKey); shareByWh[wid1] = recoWsInventoryShareOf_(read.__inventoryShares, wid1, mySiteKey, ls.sort()); shareByWh[wid1].linkedSites = ls.length; });
// Collection reads each physical source in full. No collector line is returned as a site's available stock.
if (read.__dailyAllocationCollect) members.forEach(function (wid) { shareByWh[wid] = { factor: 1, bp: 10000, source: 'DAILY_COLLECTION', linkedKeys: [mySiteKey], bpBySite: {} }; });
allActive.forEach(function (r) {
var same = recoWsStr_(r.company).toLowerCase() === recoWsStr_(scope.company).toLowerCase() && recoWsStr_(r.country).toLowerCase() === recoWsStr_(scope.country).toLowerCase()
&& recoWsStr_(r.marketplace).toLowerCase() === recoWsStr_(scope.marketplace).toLowerCase();
var wid = recoWsStr_(r.destination_warehouse_id);
if (!same && members.indexOf(wid) !== -1 && shared.indexOf(wid) === -1) shared.push(wid);
});
// D5-V3-R3/R5: sharing alone never blocks; an unknown share removes only that warehouse's part (below).
var useKMPDW = (typeof KMPD !== 'undefined' && KMPD && typeof KMPD.planningDemandByMonth === 'function');
var demandByMonthW = {}, demandQtyW = 0, haveAllW = months.length === 4;
var pdmW = useKMPDW ? KMPD.planningDemandByMonth({ fcRegularRows: fcRows, fcTargetRuleRows: tgtRowsW, fcSpecialEventRows: evtRowsW, scope: scope, sku: sku, skuMeta: skuMetaW, months: months }) : null;
months.forEach(function (mm) {
var d = useKMPDW ? (pdmW[mm] ? pdmW[mm].demand : undefined) : fcByMonth[mm];
if (d === null || d === undefined) { haveAllW = false; return; }
demandByMonthW[mm] = d; demandQtyW += d;
});
var cmrW = (useKMPDW && calc.calculationDate) ? KMPD.currentMonthRemainingDemand({ calculationDate: calc.calculationDate, fcRegularRows: fcRows, fcTargetRuleRows: tgtRowsW, fcSpecialEventRows: evtRowsW, scope: scope, sku: sku, skuMeta: skuMetaW }) : null;
var preT1W = (cmrW && cmrW.ready) ? Math.round(cmrW.demand) : null;
// supply facts per member (read only; the KMPA demand figures are not used)
var siteOpening = 0, openingKnown = true, unknownStock = [], siteIncoming = [], seenIn = {}, memberNodes = [], fwVer = null, asOf = null, opByWh = {};
for (var mi = 0; mi < members.length; mi++) {
var whId = members[mi];
var nd = KMDR.normalizeRecommendationDestination({ destinationType: 'WAREHOUSE', company: scope.company, country: scope.country, marketplace: scope.marketplace, warehouseId: whId }, { warehouses: whRows });
if (!nd.ok) return siteBlocked_((nd.issues && nd.issues[0] && nd.issues[0].code) || 'DESTINATION_WAREHOUSE_INVALID', 'member warehouse ' + whId + ' is not a valid destination');
memberNodes.push(nd.destination);
var skuReq = { recommendationType: 'WEEKLY_SHIPPING', company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku, destinationWarehouseId: whId, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, regularForecastByMonthOverride: override[whId], formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf };
var src;
if (read.__dailyAllocationCollect) {
// Read the canonical supply projection independently of its legacy monthly demand readiness.
// KMHP owns actual daily demand; Sales mode needs no FC and FC mode needs only its real 90-day window.
var supplySnaps = Object.assign({}, read.snapshots);
supplySnaps.shipmentLines = recoWsRows_(read, 'shipmentLines').filter(function (r) { return recoWsStr_(r.sku) === sku; });
var physical = KMSP.projectRecommendationProductionSources({ recommendationType: 'WEEKLY_SHIPPING',
planningCycle: calc.planningCycle, businessScope: { company: scope.company, country: scope.country, marketplace: scope.marketplace,
sku: sku, destinationWarehouseId: whId }, sourceSnapshots: supplySnaps, requiredByDate: recoWsHorizonEnd_(calc) });
src = { ready: true, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: physical.sourceDataAsOf,
supplySourceEntries: (physical.supplySourceEntries || []).filter(function (e) { return recoWsStr_(e.sku) === sku; }),
warehouseQualifiedEvents: physical.warehouseQualifiedEvents || [] };
} else {
var assembled = KMPA.assembleProductionRecommendationFacts(read, skuReq);
if (!assembled.ready) { var a0 = (assembled.issues && assembled.issues[0]) || { code: 'RECOMMENDATION_RUNTIME_BLOCKED' }; return siteBlocked_(a0.code, 'member ' + whId + ': ' + (a0.message || '')); }
var pr = assembled.productionRequest; pr.preReadSnapshots = read.snapshots;
src = KMPS.buildProductionRecommendationSource(ss, pr);
if (src.ready !== true) { var s0 = (src.issues && src.issues[0]) || {}; return siteBlocked_(s0.code || s0.reason || 'RECOMMENDATION_RUNTIME_BLOCKED', 'member ' + whId + ': ' + (s0.reason || s0.message || '')); }
}
fwVer = fwVer || src.formulaVersion; asOf = asOf || src.sourceDataAsOf;
var op = recoWsWarehouseOpeningStock_(src.supplySourceEntries, whId);
if (op === null) { if (!(shareByWh[whId] && shareByWh[whId].unknown)) { openingKnown = false; unknownStock.push(whId); } } else { opByWh[whId] = op; }
(src.warehouseQualifiedEvents || []).forEach(function (e) {
if (recoWsStr_(e.warehouseId) !== whId) return;
var key = recoWsStr_(e.incomingId) || (whId + '#' + siteIncoming.length);
if (seenIn[key]) return; seenIn[key] = 1;
siteIncoming.push({ incomingId: e.incomingId, eta: recoWsEventEtaYmd_(read, e.incomingId, e.eta), qty: e.eligibleQty, sourceType: e.sourceType, warehouseId: whId });   // D5-V3-R5D (D2)
});
}
if (!openingKnown) return siteBlocked_('WAREHOUSE_STOCK_UNKNOWN: ' + unknownStock.sort().join(','), 'no current-stock fact for member warehouse(s) - the site supply is unknown, not 0');
// D5-V3-R2 (review M3; D1 + D6): a created-but-unconfirmed Shipment (draft / ready_to_ship) bound for a member warehouse is
// PLANNED supply of this site at its ETA - counted ONCE here (the warehouse source projection does not count pre-dispatch
// rows; the AI netting no longer nets a plan once it is transferred to a Shipment). Count-once key = the shipment-line
// lineage (the same key the source projection uses), so a row already in siteIncoming is never added twice. A pre-dispatch
// shipment without a valid ETA is flagged exactly like the marketplace path (PLANNED_SHIPMENT_ETA_MISSING; Owner decision M2).
var plannedEtaGap = [], statusByIdW = {}, plannedSkipByWh = {}, plannedUnkByWh = {}, slRawW = null;   // A2-B1: pre-dispatch quantity bound for a share-unknown warehouse
(recoWsShipmentLineCandidates_(read).candidates || []).forEach(function (e) {
var c = e && e.candidate || {};
if (recoWsStr_(c.sku) !== sku) return;
var whc = recoWsStr_(c.destinationWarehouseId); if (members.indexOf(whc) === -1) return;
if (shareByWh[whc] && shareByWh[whc].unknown) {   // D5-V3-R5: that warehouse's part is not counted at all; A2-B1: its pre-dispatch quantity is remembered (the site is BLOCKED below)
var stU = recoWsStr_(c.status).toLowerCase(), qU = recoWsNum_(c.quantityRemaining);
var rfU = Array.isArray(c.reviewFlags) ? c.reviewFlags : [], badU = rfU.indexOf('INVALID_QUANTITY') !== -1 || rfU.indexOf('INVALID_RECEIVED_QUANTITY') !== -1 || rfU.indexOf('RECEIVED_EXCEEDS_SHIPPED') !== -1;
if (!slRawW) { slRawW = {}; recoWsRows_(read, 'shipmentLines').forEach(function (r7) { var i7 = recoWsStr_(r7.shipment_line_id); if (i7) slRawW[i7] = r7; }); }
var r7r = slRawW[recoWsStr_(c.linkedShipmentLineId)]; if (r7r && recoWsStr_(r7r.shipment_qty) === '' && recoWsStr_(r7r.qty) === '') badU = true;   // blank shipped qty = unknown
if ((stU === 'draft' || stU === 'ready_to_ship') && !(recoWsStr_(c.company) && recoWsStr_(c.company) !== recoWsStr_(scope.company))) { if (badU || qU === null || !isFinite(qU) || qU < 0) plannedUnkByWh[whc] = (plannedUnkByWh[whc] || 0) + 1; else if (qU > 0) plannedSkipByWh[whc] = (plannedSkipByWh[whc] || 0) + qU; }   // r4 (m-1): unreadable remaining qty = unknown, not 0
return; }
if (recoWsStr_(c.company) && recoWsStr_(c.company) !== recoWsStr_(scope.company)) return;
var lk = recoWsStr_(c.lineageKey); if (lk) statusByIdW[lk] = c.status;
var st = recoWsStr_(c.status).toLowerCase(); if (st !== 'draft' && st !== 'ready_to_ship') return;
var q = recoWsNum_(c.quantityRemaining); if (q === null || q <= 0) return;
var eta = recoWsYmd_(c.eta);   // D5-V3-R5C (F-1): Date cell / 'YYYY/MM/DD' text normalised first
if (!(/^\d{4}-\d{2}-\d{2}$/.test(eta) && !isNaN(Date.parse(eta + 'T00:00:00Z')))) { var sid = recoWsStr_(c.linkedShipmentId) || lk || '?'; if (plannedEtaGap.indexOf(sid) === -1) plannedEtaGap.push(sid); return; }
if (lk && seenIn[lk]) return;
if (lk) seenIn[lk] = 1;
siteIncoming.push({ incomingId: lk || ('PLN#' + siteIncoming.length), eta: eta, qty: q, sourceType: 'PLANNED_SHIPMENT', warehouseId: whc });
});
// D5-V3-R5E (Owner lineage rule): a SHIPPED line bound for a member warehouse whose receiver lineage cannot be resolved is an
// unattributable remainder. The source projection does not carry it, so it is added here - same company only (header), dated by
// its normalised ETA, once per lineage key - and the attribution then splits it by the ratio (shared warehouse) or keeps it
// whole (warehouse of this site only). Without an ETA it is flagged SHIPPED_ETA_MISSING and never dated by guess.
(recoWsShipmentLineCandidates_(read).candidates || []).forEach(function (e8) { var c8 = (e8 && e8.candidate) || {};
if (recoWsStr_(c8.sku) !== sku) return; var w8 = recoWsStr_(c8.destinationWarehouseId); if (members.indexOf(w8) === -1) return;
if (recoWsStr_(c8.receiverResolutionStatus).toUpperCase() === 'RESOLVED') return;
if (!RECO_WS_SHIPPED_ST_[recoWsStr_(c8.status).toLowerCase()]) return;
var xco8 = recoWsStr_(e8.headerScope && e8.headerScope.company) !== recoWsStr_(scope.company);   // D5-V3-R5F (m-6): flagged, never counted
var q8 = recoWsNum_(c8.quantityRemaining); if (q8 === null || q8 <= 0) return;
var eta8 = recoWsYmd_(c8.eta); if (!xco8 && !recoWsValidYmd_(eta8)) return;
var lk8 = recoWsStr_(c8.lineageKey); if (lk8 && seenIn[lk8]) return; if (lk8) seenIn[lk8] = 1;
siteIncoming.push({ incomingId: lk8 || ('UNATTR#' + siteIncoming.length), eta: recoWsValidYmd_(eta8) ? eta8 : null, qty: q8, sourceType: 'UNATTRIBUTED_SHIPMENT', warehouseId: w8, crossCompanyHeader: xco8 }); });
var _dupW = recoWsDupTouch_(read, ((recoWsShipmentLineCandidates_(read).candidates) || []).map(function (e6) { return (e6 && e6.candidate) || {}; }).filter(function (c6) { return recoWsStr_(c6.sku) === sku; }), scope.marketplace, members, mySiteKey);   // D5-V3-R5E
if (_dupW.conflicts.length) return siteBlocked_('SHIPMENT_DUPLICATE_CONFLICT: ' + _dupW.conflicts.map(function (x) { return x.id; }).join(','), RECO_WS_DUP_CONFLICT_LABEL_ + ': ' + _dupW.conflicts.map(function (x) { return x.table + ' ' + x.id + ' (' + x.fields.join(', ') + ')'; }).join('; '), { shipmentDuplicates: { conflicts: _dupW.conflicts, identical: _dupW.identical } });
if (plannedEtaGap.length) return siteBlocked_('PLANNED_SHIPMENT_ETA_MISSING: ' + plannedEtaGap.sort().join(','), 'pre-dispatch shipment(s) ' + plannedEtaGap.join(', ') + ' hold stock for this site but have no valid ETA and no plan date. ' + RECO_WS_ARRIVAL_UNDETERMINED_LABEL_,
{ arrivalUndetermined: plannedEtaGap.map(function (id) { return { shipmentId: id, dateSource: 'UNDETERMINED', reason: 'NO_ETA_NO_PLAN_DATE', label: RECO_WS_ARRIVAL_UNDETERMINED_LABEL_ }; }) });
if (read.__dailyAllocationCollect) {
(recoWsShipmentLineCandidates_(read).candidates || []).forEach(function (entry) {
var c = entry && entry.candidate || {}, lk = recoWsStr_(c.lineageKey);
if (!lk || seenIn[lk] || recoWsStr_(c.sku) !== sku || recoWsStr_(c.company) !== scope.company ||
members.indexOf(recoWsStr_(c.destinationWarehouseId)) === -1 || !RECO_WS_SHIPPED_ST_[recoWsStr_(c.status).toLowerCase()]) return;
var q = recoWsNum_(c.quantityRemaining), eta = recoWsEventEtaYmd_(read, lk, c.eta);
if (q === null || q <= 0 || !recoWsValidYmd_(eta)) return;
if ((c.reviewFlags || []).some(function (f) { return ['INVALID_QUANTITY', 'INVALID_RECEIVED_QUANTITY', 'RECEIVED_EXCEEDS_SHIPPED'].indexOf(f) !== -1; })) return;
seenIn[lk] = 1;
siteIncoming.push({ incomingId: lk, eta: eta, qty: q, sourceType: 'SHIPPED_IN_TRANSIT', warehouseId: recoWsStr_(c.destinationWarehouseId) });
});
}
// D5-V3-R5 (Owner M4 = (a)+(c), 2026-11-18): each member's part = its available pool x inventory_share(W, this site),
// rounded DOWN to whole units, so the parts of all sites never exceed the pool (sum of floors <= pool). The pool is
// wh_available_stock (already net of reservations - nothing is deducted a second time) plus the warehouse's incoming,
// each event scaled the same way. A warehouse whose share is unknown contributes NOTHING and is flagged; the rest of
// the site is still calculated. Never normalised, never weighted by demand (KMMSA is not used), never guessed.
if (read.__dailyAllocationCollect) {
var dailyProjection = recoWsBuildHorizons_(calc, fcRows, tgtRowsW, evtRowsW, skuMetaW, scope, sku, 0, [], upc, siteDest, whPlanModel, whSalesRate, true);
return { lines: [], dailySource: { members: members, openingByWarehouse: opByWh, incoming: siteIncoming, projection: dailyProjection },
finishDaily: finishSite_ };
}
return finishSite_(null);
function finishSite_(daily) {
var shareApplied = [], shareUnknown = [], shareRecon = [], incomingAttribution = [];
siteOpening = 0;
var linMap = recoWsLineageByKey_(read), newIncoming = [];
if (daily) {
siteOpening = daily.openingQty;
newIncoming = daily.incoming;
shareRecon = daily.reconciliation;
} else {
members.forEach(function (wid2) {
var sh = shareByWh[wid2] || { factor: 1, bp: 10000, source: 'SOLE_SITE_FULL', bpBySite: {}, linkedKeys: [mySiteKey] }, op2 = (opByWh[wid2] === undefined) ? null : opByWh[wid2];
// STOCK: pool x share (exact); a pool that is not a whole number cannot be split exactly -> not counted (never guessed)
var stockSh = sh;
if (!sh.unknown && sh.bp !== 10000 && op2 !== null && recoWsShareSplit_(op2, sh.bp) === null) { stockSh = {}; for (var k7 in sh) { if (Object.prototype.hasOwnProperty.call(sh, k7)) stockSh[k7] = sh[k7]; } stockSh.unknown = { reason: recoWsQtyUnsplittable_(op2, 'WAREHOUSE_POOL'), poolQty: op2 }; stockSh.warehouseLevel = true; }
// INCOMING: lineage first; only an unattributable remainder of a shared warehouse uses the ratio
var evs = siteIncoming.filter(function (e) { return recoWsStr_(e.warehouseId) === wid2; });
var att = recoWsIncomingAttribute_(evs, sh, mySiteKey, recoWsStr_(scope.company), linMap, recoWsIntransitRatio_(sh, wid2, sh.linkedKeys || [mySiteKey], fcRatioByWh));
att.events.forEach(function (ev) { var e0 = ev.__src; delete ev.__src; if (!(ev.countedForThisSite > 0)) return;
var o4 = {}; for (var k4 in e0) { if (Object.prototype.hasOwnProperty.call(e0, k4)) o4[k4] = e0[k4]; }
if (ev.countedForThisSite !== ev.qty) o4.poolQty = ev.qty; o4.qty = ev.countedForThisSite; o4.attribution = ev.mode; newIncoming.push(o4); });
incomingAttribution = incomingAttribution.concat(att.events.map(function (ev) { var o = { warehouseId: wid2 }; for (var k8 in ev) { if (Object.prototype.hasOwnProperty.call(ev, k8)) o[k8] = ev[k8]; } return o; }));
shareRecon.push({ warehouseId: wid2, linkedSites: (sh.linkedKeys || []).length || 1, shareSource: sh.source || null, shareBp: (sh.bp === undefined ? null : sh.bp),
unknownReason: stockSh.unknown ? stockSh.unknown.reason : null, warehouseLevelUnknown: !!stockSh.warehouseLevel,
stock: (op2 === null) ? null : recoWsShareReconcile_(op2, stockSh, mySiteKey), incoming: att });
if (stockSh.unknown) { shareUnknown.push({ warehouseId: wid2, reason: stockSh.unknown.reason, detail: stockSh.unknown, linkedSites: (sh.linkedKeys || []).length, excludedStockQty: op2, excludedIncomingQty: att.notCountedQty, counted: false }); return; }
if (op2 === null) return;
var cnt = recoWsShareSplit_(op2, stockSh.bp);
siteOpening += cnt;
if (stockSh.source === 'INVENTORY_SHARE') shareApplied.push({ warehouseId: wid2, inventoryShare: stockSh.factor, inventoryShareBp: stockSh.bp, poolStockQty: op2, countedStockQty: cnt, linkedSites: (sh.linkedKeys || []).length });
});
}
// A2-B1 (Owner A0 conditions 2026-11-19; supersedes SPEC_R5 C5 / M4(c) 'the row is not blocked'): stock or incoming of a
// shared warehouse whose share is unknown is NOT this site's stock 0. The site is BLOCKED - no gap, no suggestion, no plan,
// no order - and the line keeps the warning detail (inventoryShareUnknown / reconciliation / attribution). A part with
// exactly 0 stock, nothing excluded in transit and no pre-dispatch shipment holds nothing to allocate: 0 x any share = 0
// is a fact, not a guess, so that part alone does not block (it stays flagged).
// In transit, the excluded part is what the attribution did not give to a known site: not counted + unassigned (RATIO_UNKNOWN).
var unasgInW = {}; shareRecon.forEach(function (x) { unasgInW[x.warehouseId] = Number((x.incoming && x.incoming.unassignedQty) || 0); });
var shareBlockW = shareUnknown.filter(function (u) { var inc = Number(u.excludedIncomingQty || 0) + (unasgInW[u.warehouseId] || 0); return u.excludedStockQty !== 0 || !(inc === 0) || (plannedSkipByWh[u.warehouseId] || 0) > 0 || (plannedUnkByWh[u.warehouseId] || 0) > 0; });
if (shareBlockW.length) { var sbCodeW = shareBlockW.map(function (u) { return u.warehouseId + '=' + u.reason; }).sort();
return siteBlocked_('WAREHOUSE_SHARE_UNKNOWN: ' + sbCodeW.join(','), 'allocation of shared warehouse stock is unknown (' + sbCodeW.join(', ') + ') - it is NOT 0; no suggestion, plan or order until the share is set',
recoWsWarnDefaults_({ inventoryShares: shareApplied, inventoryShareUnknown: shareUnknown, inventoryShareReconciliation: shareRecon, incomingAttribution: incomingAttribution, memberWarehouses: members.slice().sort(), crossCompanyLinks: crossCoLinks,
shareBlockedParts: shareBlockW.map(function (u) { return { warehouseId: u.warehouseId, reason: u.reason, excludedStockQty: u.excludedStockQty, excludedIncomingQty: u.excludedIncomingQty, unassignedIncomingQty: unasgInW[u.warehouseId] || 0, excludedPlannedShipmentQty: plannedUnkByWh[u.warehouseId] ? null : (plannedSkipByWh[u.warehouseId] || 0), plannedShipmentQtyUnknownRows: plannedUnkByWh[u.warehouseId] || 0 }; }) })); }
siteIncoming = newIncoming.concat(siteIncoming.filter(function (e) { return members.indexOf(recoWsStr_(e.warehouseId)) === -1; }));
var single = memberNodes.length === 1;
var lineDest = single ? memberNodes[0] : siteDest;
var inQty = 0; siteIncoming.forEach(function (e) { var q = recoWsNum_(e.qty); if (q !== null) inQty += q; });
var siteLine = KMDR.buildRecommendationLine({
destination: lineDest, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku,
allocatedForecastQty: haveAllW ? demandQtyW : (demandQtyW > 0 ? demandQtyW : null), currentStockQty: siteOpening, qualifiedIncomingQty: inQty, incomingCompleteness: 'COMPLETE',
calculatedGap: null, allocatedSupplyQty: null, recommendedQty: null, residualShortageQty: null, blocked: false, blockedReason: null,
formulaVersion: fwVer || vmeta.formulaVersion, sourceDataAsOf: asOf || vmeta.sourceDataAsOf,
diagnostics: { issues: single ? [] : [{ code: 'DESTINATION_WAREHOUSE_USER_CHOICE', message: 'several valid destination warehouses (' + members.slice().sort().join(', ') + ') - the user chooses one; the quantity is not split' }] }
});
siteLine.siteLevel = true;
siteLine.supplyBreakdown = recoWsSupplyBreakdown_(siteIncoming, statusByIdW);
siteLine.memberWarehouses = members.slice().sort();
if (daily) siteLine.overseasAllocation = daily.summary;
siteLine.inventoryShares = shareApplied;   // D5-V3-R5: the parts counted by share (pool x share, floored)
siteLine.inventoryShareUnknown = shareUnknown;   // the parts NOT counted (share missing / invalid / precision / sum > 100% / pool not whole)
siteLine.inventoryShareReconciliation = shareRecon;   // D5-V3-R5E: per warehouse, pool = counted + rounding + unassigned + not counted
siteLine.incomingAttribution = incomingAttribution;   // D5-V3-R5E: every incoming event of a member warehouse with its lineage-first mode
(function () { var iss = []; shareRecon.forEach(function (x) { var shared = x.linkedSites > 1, showStock = shared || x.shareSource === 'INVENTORY_SHARE' || !!x.unknownReason;
['stock', 'incoming'].forEach(function (part) { var r = x[part]; if (!r) return; if (part === 'stock' && !showStock) return;
if (part === 'incoming' && (!(r.events && r.events.length) || (!shared && !r.notCountedQty))) return;
var nc = r.notCountedReason ? ' [' + r.notCountedReason + ']' : ((r.notCountedByReason && Object.keys(r.notCountedByReason).length) ? ' [' + Object.keys(r.notCountedByReason).map(function (k) { return k + ' ' + r.notCountedByReason[k]; }).join(', ') + ']' : '');
iss.push({ code: 'WAREHOUSE_SHARE_RECONCILIATION', message: x.warehouseId + ' ' + part + ': pool ' + r.poolQty + ' = counted ' + r.countedQty + ' (' + r.perSite.map(function (p) { return p.siteKey + ' ' + p.countedQty; }).join('; ') + ') + rounding ' + r.roundingRemainderQty + ' + unassigned ' + r.unassignedQty + ' + not counted ' + r.notCountedQty + nc + (r.reconciled ? '' : ' [NOT RECONCILED]') }); }); });
if (iss.length) { siteLine.diagnostics = siteLine.diagnostics || { issues: [] }; siteLine.diagnostics.issues = (siteLine.diagnostics.issues || []).concat(iss); } })();
if (shareUnknown.length) { siteLine.diagnostics = siteLine.diagnostics || { issues: [] }; siteLine.diagnostics.issues = (siteLine.diagnostics.issues || []).concat([{ code: 'WAREHOUSE_SHARE_UNKNOWN',
message: 'inventory share unknown for ' + shareUnknown.map(function (u) { return u.warehouseId + ' (' + u.reason + ')'; }).join(', ') + ' - that warehouse part is NOT counted; the rest is calculated' }]); }
var _cntW = {}; siteIncoming.forEach(function (ev) { var id = recoWsStr_(ev && ev.incomingId); if (id) _cntW[id] = 1; });   // D5-V3-R5E: same definition
siteLine.incomingDateSources = recoWsIncomingDateSources_(read, siteIncoming.map(function (e) { return { lineageKey: e.incomingId, shipmentId: null, qty: e.qty }; }), _cntW, recoWsHorizonEnd_(calc), _cntW, recoWsMonthsEnd_(months));   // D5-V3-R5F (m-3): same supply set, T4 horizon
if (_dupW.identical.length) { siteLine.shipmentDuplicates = { conflicts: [], identical: _dupW.identical }; siteLine.diagnostics = siteLine.diagnostics || { issues: [] }; siteLine.diagnostics.issues = (siteLine.diagnostics.issues || []).concat([{ code: 'SHIPMENT_DUPLICATE_ROWS', message: RECO_WS_DUP_IDENTICAL_LABEL_ + ': ' + _dupW.identical.map(function (x) { return x.table + ' ' + x.id + ' x' + x.rows; }).join('; ') }]); }
var _shW = []; (recoWsShipmentLineCandidates_(read).candidates || []).forEach(function (e5) { var c5 = (e5 && e5.candidate) || {}; if (recoWsStr_(c5.sku) !== sku) return;
if (members.indexOf(recoWsStr_(c5.destinationWarehouseId)) === -1) return; var m5 = (read.__etaSourceByLineage || {})[recoWsStr_(c5.lineageKey)];
if (m5 && m5.dateSource === 'ETA_MISSING') _shW.push({ shipmentId: m5.shipmentId, lineageKey: recoWsStr_(c5.lineageKey), qty: recoWsNum_(c5.quantityRemaining), dateSource: 'ETA_MISSING', counted: false, countedInventory: false, countedOrderPlanning: false, label: m5.label }); });   // D5-V3-R5G
if (_shW.length) { siteLine.shippedEtaMissing = _shW; siteLine.incomingDateSources = siteLine.incomingDateSources.concat(_shW); siteLine.diagnostics = siteLine.diagnostics || { issues: [] }; siteLine.diagnostics.issues = (siteLine.diagnostics.issues || []).concat([{ code: 'SHIPPED_ETA_MISSING', message: RECO_WS_SHIPPED_ETA_MISSING_LABEL_ + ': ' + _shW.map(function (d) { return d.shipmentId || d.lineageKey; }).join(', ') }]); }   // D5-V3-R5
if (crossCoLinks.length) { siteLine.crossCompanyLinks = crossCoLinks; siteLine.diagnostics = siteLine.diagnostics || { issues: [] }; siteLine.diagnostics.issues = (siteLine.diagnostics.issues || []).concat([{ code: 'WAREHOUSE_CROSS_COMPANY_LINK_IGNORED', message: 'not counted as sharing (another company; warehouses.company decides): ' + crossCoLinks.map(function (x) { return x.warehouseId + ' <- ' + x.siteKey; }).join(', ') }]); }   // A2-B2
recoWsWarnDefaults_(siteLine);   // D5-V3-R5E
siteLine.destinationChoiceRequired = !single;
siteLine.destinationCandidates = single ? [] : members.slice().sort();
var wProj = recoWsBuildMonthlyProjection_(months, siteOpening, (haveAllW ? demandByMonthW : null), siteIncoming, upc, lineDest, preT1W, preT1W !== null ? cmrW.requiredByDate : null);
if (wProj) siteLine.monthlyProjection = wProj;
if (preT1W !== null) siteLine.currentMonthRemaining = { requiredByDate: cmrW.requiredByDate, month: cmrW.ym, remainingDays: cmrW.remainingDays, demandQty: preT1W };
var wHz = (whPlanModel === 'sales_driven' && whSalesRate === null) ? null
: recoWsBuildHorizons_(calc, fcRows, tgtRowsW, evtRowsW, skuMetaW, scope, sku, siteOpening, siteIncoming, upc, lineDest, whPlanModel, whSalesRate);
if (wHz) siteLine.horizons = wHz;
else siteLine.horizonsBlockedReason = whSalesReason || 'HORIZON_PROJECTION_UNAVAILABLE';
if (wHz) { var gW = recoWsAiGateEvents_(evtRowsW, scope, sku, calc); if (gW.gated.length) { siteLine.aiGatedEvents = gW.gated;   // D5-V3-R3 (m5)
siteLine.aiHorizons = recoWsBuildHorizons_(calc, fcRows, tgtRowsW, gW.rows, skuMetaW, scope, sku, siteOpening, siteIncoming, upc, lineDest, whPlanModel, whSalesRate) || null; } }
lines.push(siteLine);
return whReturn_(lines);
}
}

function recoWsFilterLines_(lines, filters) {
return lines.filter(function (l) {
if (filters.sku && l.sku !== filters.sku) return false;
if (filters.siteSku && l.siteSku !== filters.siteSku) return false;
return true;
});
}

function recoWsSortLines_(lines, scope) {
var copy = lines.slice();
copy.sort(function (a, b) {
return recoWsCmp_(scope.company, scope.company) || recoWsCmp_(scope.country, scope.country) || recoWsCmp_(scope.marketplace, scope.marketplace) ||
recoWsCmp_(a.sku, b.sku) || recoWsCmp_(a.siteSku, b.siteSku) || recoWsCmp_(a.destinationWarehouseId, b.destinationWarehouseId);
});
return copy;
}
function recoWsCmp_(a, b) { a = recoWsStr_(a); b = recoWsStr_(b); return a < b ? -1 : a > b ? 1 : 0; }
function recoWsPaginate_(rows, page, size) {
var total = rows.length, totalPages = size > 0 ? Math.ceil(total / size) : 0, start = (page - 1) * size;
return { items: (start >= 0 && start < total) ? rows.slice(start, start + size) : [], page: page, size: size, total: total, totalPages: totalPages };
}




function recoWsScopeSkus_(mskSnapshot, scope, skuFilter) {
if (!recoWsIsObj_(mskSnapshot) || !Array.isArray(mskSnapshot.headers) || !Array.isArray(mskSnapshot.rows)) return [];
var h = mskSnapshot.headers.map(function (x) { return recoWsStr_(x); });
var iSku = h.indexOf('sku'), iCo = h.indexOf('company'), iCn = h.indexOf('country'), iMk = h.indexOf('marketplace');
if (iSku < 0) return [];
var seen = {}, out = [];
mskSnapshot.rows.forEach(function (r) {
if (iCo >= 0 && recoWsStr_(r[iCo]) !== scope.company) return;
if (iCn >= 0 && recoWsStr_(r[iCn]) !== scope.country) return;
if (iMk >= 0 && recoWsStr_(r[iMk]) !== scope.marketplace) return;
var sku = recoWsStr_(r[iSku]); if (!sku) return;
if (skuFilter && sku !== skuFilter) return;
if (!seen[sku]) { seen[sku] = 1; out.push(sku); }
});
out.sort(recoWsCmp_);
return out;
}



function recommendationWorkspaceBuild_(v, calc, lines) {
var filtered = recoWsFilterLines_(lines, v.filters);
var sorted = filtered.slice().sort(function (a, b) {
return recoWsCmp_(a.recommendationMode, b.recommendationMode) || recoWsCmp_(a.sku, b.sku) || recoWsCmp_(a.siteSku, b.siteSku) || recoWsCmp_(a.destinationKey, b.destinationKey);
});
var pageRes = recoWsPaginate_(sorted, v.page, v.size);
return {
scope: { company: v.scope.company, country: v.scope.country, marketplace: v.scope.marketplace, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle },
lines: pageRes.items,
pagination: { page: pageRes.page, size: pageRes.size, total: pageRes.total, totalPages: pageRes.totalPages },
dataVersion: { formulaVersion: v.formulaVersion, sourceDataAsOf: v.sourceDataAsOf }
};
}
















var RECO_WS_CANON_FALLBACK_ = ['SHEETS_QUOTA_EXCEEDED', 'SHEETS_SERVICE_ERROR', 'ADVANCED_SHEETS_SERVICE_UNAVAILABLE'];




var RECO_WS_CANON_MAX_FALLBACK_ = 1;
var RECO_WS_CANON_FALLBACKS_ = 0;



function recoWsCanonError_(code, detail) {
var e = new Error(code + (detail ? ': ' + detail : ''));
e.apiCode = code; e.safetyToken = code; e.canonicalReadFault = true;
return e;
}





function recoWsCanonValidMeta_(meta) {
if (!meta || typeof meta !== 'object') return 'reply is not an object';
if (!Array.isArray(meta.sheets)) return 'sheets is not an array';
if (!meta.sheets.length) return 'sheets is empty';
for (var i = 0; i < meta.sheets.length; i++) {
var e = meta.sheets[i];
if (!e || typeof e !== 'object' || !e.properties || typeof e.properties !== 'object') return 'sheets[' + i + '] has no properties';
if (typeof e.properties.title !== 'string' || e.properties.title === '') return 'sheets[' + i + '] has no title';
}
return null;
}

function recoWsCanonValidRange_(vr) {
if (vr === null || vr === undefined) return 'entry is null';
if (typeof vr !== 'object' || Array.isArray(vr)) return 'entry is not an object';
if (!Object.prototype.hasOwnProperty.call(vr, 'values')) return null;
var v = vr.values;
if (v === null || v === undefined) return null;
if (!Array.isArray(v)) return 'values is ' + (typeof v) + ', not an array';
for (var i = 0; i < v.length; i++) { if (!Array.isArray(v[i])) return 'row ' + i + ' is not an array'; }
return null;
}


function recoWsCanonSplit_() {
var reg = (typeof KMPS !== 'undefined' && KMPS && KMPS.CANONICAL_TABLES) || [];
var batch = [], rest = [];
for (var i = 0; i < reg.length; i++) {
if (sirWsIsB1Table_(reg[i].sheet)) batch.push(reg[i]); else rest.push(reg[i]);
}
return { batch: batch, rest: rest };
}



function recoWsCanonRect_(values) {
var w = 0, i;
for (i = 0; i < values.length; i++) { var r = values[i]; if (r && r.length > w) w = r.length; }
return sirWsPadRows_(values, w);
}






function recoWsCanonicalRead_(ss, nowFn) {
var now = (typeof nowFn === 'function') ? nowFn : function () { return Date.now(); };
var t0 = now();
var canFull = (typeof KMPS !== 'undefined' && KMPS && typeof KMPS.readCanonicalSnapshots === 'function');
if (!canFull) return { snapshots: {}, issues: [], profile: recoWsCanonProfile_('UNAVAILABLE', 0, 0, 0, 0, 0, null, 'KMPS_READER_ABSENT') };

var full = function (mode, reason, wasted, startedAt, why) {
var fr = now();
var r = KMPS.readCanonicalSnapshots(ss, null);
var nTables = Object.keys(r.snapshots || {}).length;
r.profile = recoWsCanonProfile_(mode, 0, nTables, nTables, (now() - (startedAt === undefined ? fr : startedAt)), 0,
reason ? { count: RECO_WS_CANON_FALLBACKS_, max: RECO_WS_CANON_MAX_FALLBACK_, reason: reason,
batchMsWasted: wasted || 0 } : null, why || null);
return r;
};




if (typeof Sheets === 'undefined' || !Sheets || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
return full('PER_SHEET', null, 0, t0, 'ADVANCED_SHEETS_SERVICE_UNAVAILABLE');
}
if (typeof sirWsIsB1Table_ !== 'function' || typeof sirWsApplyDateMap_ !== 'function'
|| typeof sirWsPadRows_ !== 'function' || typeof sirWsColumnLetter_ !== 'function') {
return full('PER_SHEET', null, 0, t0, 'DATE_MAP_HELPERS_ABSENT');
}




if (!(function () {
try { return KMPS.tablesFor({ only: [] }).length === 0; } catch (e) { return false; }
})()) return full('PER_SHEET', null, 0, t0, 'BUNDLE_SUBSET_READ_UNSUPPORTED');

var split = recoWsCanonSplit_();
if (!split.batch.length) return full('PER_SHEET', null, 0, t0, 'NO_PROVEN_DATE_MAP_TABLES');

var snapshots = {}, issues = [], id = ss.getId(), emptyBack = [], probeReads = 0;
var tz = (typeof ss.getSpreadsheetTimeZone === 'function') ? ss.getSpreadsheetTimeZone() : null;
if (!tz) return full('PER_SHEET', null, 0, t0, 'SPREADSHEET_TIMEZONE_UNAVAILABLE');
var remoteCalls = 0, normalizeMs = 0;

try {


remoteCalls++;
var meta = Sheets.Spreadsheets.get(id, { fields: 'sheets.properties(title,gridProperties(columnCount))' });
var badMeta = recoWsCanonValidMeta_(meta);
if (badMeta) throw recoWsCanonError_('CANONICAL_BATCH_MALFORMED_METADATA', badMeta);
var width = {}, present = {}, sh = meta.sheets, m;
for (m = 0; m < sh.length; m++) {
var pr = sh[m].properties || {};
if (!pr.title) continue;
present[String(pr.title)] = true;
width[String(pr.title)] = Number((pr.gridProperties && pr.gridProperties.columnCount) || 0);
}


var ranges = [], ordered = [], i;
for (i = 0; i < split.batch.length; i++) {
var e = split.batch[i];
if (!present[e.sheet]) { issues.push({ sourceType: e.key, sheetName: e.sheet, reason: 'SOURCE_NOT_AVAILABLE' }); continue; }
var cols = width[e.sheet] > 0 ? width[e.sheet] : 1;


ranges.push("'" + e.sheet.replace(/'/g, "''") + "'!A:" + sirWsColumnLetter_(cols));
ordered.push(e);
}

if (ranges.length) {


remoteCalls++;
var resp = Sheets.Spreadsheets.Values.batchGet(id, { ranges: ranges,
valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
var vrs = (resp && resp.valueRanges) || [];

if (vrs.length !== ordered.length) {
throw recoWsCanonError_('CANONICAL_BATCH_PARTIAL_RESPONSE',
'requested ' + ordered.length + ' ranges, received ' + vrs.length);
}


for (i = 0; i < ordered.length; i++) {
var bad = recoWsCanonValidRange_(vrs[i]);
if (bad) {
throw recoWsCanonError_('CANONICAL_BATCH_MALFORMED_RESPONSE',
'range ' + i + ' [' + ordered[i].sheet + '] ' + bad);
}
}
var tN = now();
for (i = 0; i < ordered.length; i++) {
var sp = ordered[i], vrv = vrs[i].values;
var vals = (vrv && vrv.length) ? vrv : null;
if (!vals) { emptyBack.push(sp); continue; }
var rect = recoWsCanonRect_(vals);
sirWsApplyDateMap_(sp.sheet, rect, tz);
var headers = rect[0].map(function (h) { return recoWsStr_(h); });
snapshots[sp.key] = { headers: headers, rows: rect.slice(1) };
}
normalizeMs += (now() - tN);

}
} catch (eB) {


if (eB && eB.canonicalReadFault) throw eB;
var cls = (typeof sirWsClassifySheetsError_ === 'function') ? sirWsClassifySheetsError_(eB) : '';
if (RECO_WS_CANON_FALLBACK_.indexOf(cls) === -1) throw eB;
if (RECO_WS_CANON_FALLBACKS_ >= RECO_WS_CANON_MAX_FALLBACK_) {
throw recoWsCanonError_('CANONICAL_BATCH_FALLBACK_EXHAUSTED',
'already fell back ' + RECO_WS_CANON_FALLBACKS_ + ' time(s) in this execution; last class ' + cls);
}
RECO_WS_CANON_FALLBACKS_++;
return full('FALLBACK', cls, now() - t0, t0);
}








var restKeys = [];
for (var k = 0; k < split.rest.length; k++) {
var rk = split.rest[k];


if (rk.key === 'replenishmentDemandAllocationRules' && typeof warehouseAllocationSnapshot_ === 'function') continue;
restKeys.push(rk.key);
}
var perSheet = restKeys.length;
probeReads = emptyBack.length;
for (var e2 = 0; e2 < emptyBack.length; e2++) restKeys.push(emptyBack[e2].key);
if (restKeys.length) {
var r2 = KMPS.readCanonicalSnapshots(ss, { only: restKeys });
var sn = r2.snapshots || {};
for (var key in sn) { if (Object.prototype.hasOwnProperty.call(sn, key)) snapshots[key] = sn[key]; }
issues = issues.concat(r2.issues || []);
}
return { snapshots: snapshots, issues: issues,
profile: recoWsCanonProfile_('BATCH', remoteCalls, perSheet + probeReads, Object.keys(snapshots).length,
(now() - t0), normalizeMs, null) };
}



function recoWsCanonProfile_(mode, remoteCalls, perSheetReads, tables, readMs, normalizeMs, fallback, notBatchedReason) {
return { mode: mode, remoteCalls: remoteCalls, perSheetReads: perSheetReads, tables: tables,
readMs: readMs, normalizeMs: normalizeMs, fallback: fallback || null,
notBatchedReason: notBatchedReason || null };
}





function recoWsCanonMeta_(profile, serverMs) {
if (!profile) return { mode: 'INJECTED', remoteCalls: 0, perSheetReads: 0, tables: null,
readMs: null, normalizeMs: null, afterReadMs: null, fallback: null, notBatchedReason: 'PRE_READ_INJECTED' };
var rm = (typeof profile.readMs === 'number') ? profile.readMs : null;
return { mode: profile.mode, remoteCalls: profile.remoteCalls, perSheetReads: profile.perSheetReads,
tables: profile.tables, readMs: rm, normalizeMs: profile.normalizeMs,
afterReadMs: (rm === null || typeof serverMs !== 'number') ? null : (serverMs - rm),
fallback: profile.fallback, notBatchedReason: profile.notBatchedReason || null };
}




function recoWsDailyInventoryContext_() {
// Use the existing INVENTORY date authority in both installed environment profiles.
var sandbox = typeof RTR_SANDBOX_GATE_ !== 'undefined' && RTR_SANDBOX_GATE_ && RTR_SANDBOX_GATE_.env === 'KM_SANDBOX';
var production = typeof RTR_PRODUCTION_PROFILE_ !== 'undefined' && RTR_PRODUCTION_PROFILE_ && RTR_PRODUCTION_PROFILE_.environment === 'KM_PRODUCTION';
if (!sandbox && !production) return null;
if (typeof gapCalcResolveContext_ !== 'function') throw new Error('RECOMMENDATION_DAILY_CONTEXT_UNAVAILABLE');
var context = gapCalcResolveContext_('INVENTORY', Date.now());
if (!context || !context.ok) throw new Error('RECOMMENDATION_DAILY_CONTEXT_INVALID');
return context;
}
function recoWsSiteInventoryContext_(context, scope) {
if (!context || typeof context.instantMs !== 'number' || typeof KMSC === 'undefined') throw new Error('SITE_CALENDAR_CONTEXT_UNAVAILABLE');
var date = KMSC.localDate(context.instantMs, scope.country, function (d, tz) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); });
return { calculationDate: date, calculationMonth: date.slice(0, 7), planningCycle: 'RECO-' + date.slice(0, 7), timezone: KMSC.timeZone(scope.country) };
}
function recommendationWorkspaceDefaultIo_() {
var dailyContext = recoWsDailyInventoryContext_();
return {
inventoryContextForScope: dailyContext ? function (scope) { return recoWsSiteInventoryContext_(dailyContext, scope); } : null,
now: function () { return Date.now(); },
nextSeq: function () { RECO_WS_SEQ_++; return RECO_WS_SEQ_; },

configMonth: function () { if (dailyContext) return dailyContext.calculationMonth; try { return PropertiesService.getScriptProperties().getProperty('RECOMMENDATION_CALCULATION_MONTH'); } catch (e) { return null; } },

configDate: function () { if (dailyContext) return dailyContext.calculationDate; try { return PropertiesService.getScriptProperties().getProperty('RECOMMENDATION_CALCULATION_DATE'); } catch (e) { return null; } },
openTarget: function () {
var id = prodExpectedDbId_();
if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
var ss = SpreadsheetApp.openById(id);
prodAssertDbTarget_(ss, id);
return ss;
},



readCanonicalSnapshots: function (ss) { return recoWsCanonicalRead_(ss, function () { return Date.now(); }); }
};
}

var RECO_WS_SRC_REV_ = null;
function handleRecommendationWorkspaceGet_(body, io) {
RECO_WS_SRC_REV_ = (typeof kmSrcRevGet_ === 'function') ? kmSrcRevGet_() : null;
io = io || recommendationWorkspaceDefaultIo_();
var t0 = io.now();
var reqId = recoWsRequestId_(body && body.requestId, io);
try {
if (typeof KMPA === 'undefined' || typeof KMPS === 'undefined' || typeof KMDR === 'undefined' || typeof KMDA === 'undefined') {
return recoWsEnvelope_(false, null, [recoWsErr_('RECOMMENDATION_RUNTIME_BLOCKED', 'recommendation runtime bundle (KMPA/KMPS/KMDR/KMDA) not present')], { requestId: reqId, serverDurationMs: (io.now() - t0) });
}
var v = validateRecommendationWorkspaceRequest_(body && body.payload);
if (!v.ok) return recoWsEnvelope_(false, null, [v.error], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, sourceReadCount: 0 });
var calc = recoWsResolveCalcContext_(io);
if (!calc.ok) return recoWsEnvelope_(false, null, [calc.error], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, sourceReadCount: 0, calculationMonth: null, planningCycle: null });
var cdRes = recoWsResolveCalcDate_(io);
calc.calculationDate = cdRes.ok ? cdRes.calculationDate : null;
if (io.inventoryContextForScope) {
var siteContext = io.inventoryContextForScope(v.scope);
calc.calculationDate = siteContext.calculationDate;
calc.calculationMonth = siteContext.calculationMonth;
calc.planningCycle = siteContext.planningCycle;
calc.siteInventoryDaily = true;
calc.siteTimeZone = siteContext.timezone;
}

var ss = io.openTarget();





var read = io.readCanonicalSnapshots ? io.readCanonicalSnapshots(ss) : KMPS.readCanonicalSnapshots(ss, null);
if (read) read.__siteInventoryDaily = calc.siteInventoryDaily === true;
if (read && !read.__poHeaderSs) read.__poHeaderSs = ss;
var tablesRead = read && read.snapshots ? Object.keys(read.snapshots).length : 0;





var readProfile = (read && read.profile) || null;
var snaps = read.snapshots || (read.snapshots = {});







if (typeof warehouseAllocationSnapshot_ === 'function') snaps.replenishmentDemandAllocationRules = warehouseAllocationSnapshot_();
read.__inventoryShares = recoWsReadInventoryShares_();   // D5-V3-R5 (Owner M4 (a)): same Script Property, read-only
// D5-V3-R5F (M-1): the duplicate scan runs ONCE per shared snapshot set (43_ hands every scope a NEW read object over the SAME
// snapshots map), cached by that map. The shared map and its row objects are never modified: the scan works on a private copy,
// and this request's read gets its own map whose two shipment entries are the de-duplicated views.
var _dc = RECO_WS_DUP_CACHE_ ? RECO_WS_DUP_CACHE_.get(snaps) : null;
if (!_dc) { var _tmp = Object.assign({}, snaps); _dc = { scan: { shipments: recoWsDupScan_(_tmp, 'shipments', 'shipment_id'), lines: recoWsDupScan_(_tmp, 'shipmentLines', 'shipment_line_id') }, views: { shipments: _tmp.shipments, shipmentLines: _tmp.shipmentLines } }; if (RECO_WS_DUP_CACHE_) RECO_WS_DUP_CACHE_.set(snaps, _dc); }
read.__dupScan = _dc.scan;
if (_dc.views.shipments !== snaps.shipments || _dc.views.shipmentLines !== snaps.shipmentLines) { var _own = Object.assign({}, snaps); if (_dc.views.shipments) _own.shipments = _dc.views.shipments; if (_dc.views.shipmentLines) _own.shipmentLines = _dc.views.shipmentLines; read.snapshots = snaps = _own; }

var scopeSkus = recoWsScopeSkus_(snaps.marketplaceSkus, v.scope, v.scope.sku || null);
if (!scopeSkus.length) return recoWsEnvelope_(false, null, [recoWsErr_('MISSING_SKU_MAPPING', 'no marketplace_skus row for the scope (company/country/marketplace)')], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead, sourceReadCount: 1, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, canonicalRead: recoWsCanonMeta_(readProfile, io.now() - t0) });
var siteSkuBySku = recoWsSiteSkuBySku_(recoWsToRowObjects_(snaps.marketplaceSkus), v.scope);
var ful = recoWsResolveFulfillment_(recoWsToRowObjects_(snaps.marketplaces), v.scope);
var vmeta = { formulaVersion: v.formulaVersion, sourceDataAsOf: v.sourceDataAsOf };



var scopeFulfillmentModel = recoWsStr_(ful && ful.row ? ful.row.fulfillment_model : '');



var isHybridMarketplace = scopeFulfillmentModel.toLowerCase() === 'hybrid';
var fulfillmentBySku = isHybridMarketplace ? recoWsFulfillmentModelBySku_(recoWsToRowObjects_(snaps.marketplaceSkus), v.scope) : null;


var lines = [], seen = {}, issues = [];
for (var i = 0; i < scopeSkus.length; i++) {
var sku = scopeSkus[i], siteSku = siteSkuBySku[sku] || null, produced;
if (calc.siteInventoryDaily && recoWsSkuInactive_(read, v.scope, sku)) {
var inactiveLine = KMDR.buildRecommendationLine({ destination: { destinationType: 'MARKETPLACE', company: v.scope.company,
country: v.scope.country, marketplace: v.scope.marketplace, destinationKey: 'INACTIVE||' + v.scope.company + '||' + v.scope.country + '||' + v.scope.marketplace + '||' + sku },
recommendationMode: 'INACTIVE', sku: sku, siteSku: siteSku, blocked: true, blockedReason: 'SKU_INACTIVE',
formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf });
inactiveLine.skipped = true; lines.push(inactiveLine); continue;
}



var effectiveMode = ful.mode, effectiveModel = scopeFulfillmentModel;
if (isHybridMarketplace) {
var skuFm = recoWsStr_(fulfillmentBySku[sku]).toLowerCase();
effectiveModel = skuFm;
effectiveMode = (skuFm === 'platform_fulfilled') ? 'MARKETPLACE' : (skuFm === 'self_fulfilled') ? 'WAREHOUSE' : null;
}
if (effectiveMode === 'MARKETPLACE') produced = [recoWsExpandMarketplace_(read, v.scope, sku, siteSku, calc, vmeta, v.supplyAllocationByReceiver)];
else if (effectiveMode === 'WAREHOUSE') produced = recoWsExpandWarehouse_(read, ss, v.scope, sku, siteSku, calc, vmeta).lines;
else produced = [KMDR.buildRecommendationLine({ destination: { destinationType: null, company: v.scope.company, country: v.scope.country, marketplace: v.scope.marketplace, destinationKey: 'UNRESOLVED||' + v.scope.company + '||' + v.scope.country + '||' + v.scope.marketplace + '||' + sku }, recommendationMode: 'UNRESOLVED', sku: sku, siteSku: siteSku, blocked: true, blockedReason: 'DESTINATION_AUTHORITY_UNRESOLVED', formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf })];
for (var p = 0; p < produced.length; p++) {
var ln = produced[p]; if (!ln) continue;
if (seen[ln.recommendationLineId]) { issues.push(recoWsErr_('RECOMMENDATION_LINE_IDENTITY_CONFLICT', 'duplicate recommendation line identity: ' + ln.recommendationLineId)); continue; }
ln.fulfillmentModel = effectiveModel;
seen[ln.recommendationLineId] = 1; lines.push(ln);
}
}
if (!lines.length && issues.length) return recoWsEnvelope_(false, null, issues, { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead, sourceReadCount: 1, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, canonicalRead: recoWsCanonMeta_(readProfile, io.now() - t0) });

var vm = recommendationWorkspaceBuild_(v, calc, lines);
return recoWsEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead, sourceReadCount: 1, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, calculationDate: calc.calculationDate, siteTimeZone: calc.siteTimeZone || null, horizonFormula: calc.siteInventoryDaily ? 'SITE_DAILY_V2' : null, warehouseAllocationVersion: calc.siteInventoryDaily ? 'DAILY_3PL_V1' : null, conflicts: issues.length, canonicalRead: recoWsCanonMeta_(readProfile, io.now() - t0) });
} catch (e) {
var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'INTERNAL_ERROR';
return recoWsEnvelope_(false, null, [recoWsErr_(code, String(e && e.message || e), (e && e.schemaDetail) || null)], { requestId: reqId, serverDurationMs: (io.now() - t0) });
}
}

// XCO-R15G (42_): the server recommendation path passes the same ever-merged link counts.
// XCO-R15G-42 (xco-r15g-impl): patched
// R15G-STAMPS (final candidate): patched
