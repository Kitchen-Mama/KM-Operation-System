






































































var __kmModules = {};
function __kmRegister(name, exps) { __kmModules[name] = exps; }
function __kmRequire(p) {
var base = String(p).replace(/^.*\//, "").replace(/\.js$/, "");
if (!__kmModules.hasOwnProperty(base)) { throw new Error("KM bundle: module not registered: " + base); }
return __kmModules[base];
}


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;

(function (root, factory) {
var api = factory();
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.siteCalendar = api; }
})(this, function () {
'use strict';

var ZONES = { US: 'America/Los_Angeles', CA: 'America/Los_Angeles', UK: 'Europe/London', GB: 'Europe/London',
EU: 'Europe/Berlin', DE: 'Europe/Berlin', FR: 'Europe/Paris', IT: 'Europe/Rome', ES: 'Europe/Madrid',
JP: 'Asia/Tokyo', AU: 'Australia/Sydney', TW: 'Asia/Taipei', CN: 'Asia/Shanghai' };
function timeZone(country) { return ZONES[String(country || '').trim().toUpperCase()] || null; }
function localDate(epochMs, country, formatter) {
var tz = timeZone(country);
if (!tz || typeof epochMs !== 'number' || !isFinite(epochMs)) throw new Error('SITE_CALENDAR_UNAVAILABLE');
if (formatter) return formatter(new Date(epochMs), tz);
var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(epochMs));
var by = {}; parts.forEach(function (p) { by[p.type] = p.value; });
return by.year + '-' + by.month + '-' + by.day;
}
return { timeZone: timeZone, localDate: localDate, VERSION: 'site-daily-20261125-v2' };
});
__kmRegister("supply-planning-site-calendar", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;













(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.countryIdentity = api; }
if (typeof root !== 'undefined' && root) { root.KMCID = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

function up(v) { return String(v === undefined || v === null ? '' : v).trim().toUpperCase(); }



var SAME_MARKET_ALIAS = { 'UK': ['UK', 'GB'], 'GB': ['UK', 'GB'] };

var CANON = { 'UK': 'GB', 'GB': 'GB' };


function canonicalCountryCode(v) { var c = up(v); return CANON[c] || c; }

function aliasMembers(country) { var c = up(country); return SAME_MARKET_ALIAS[c] ? SAME_MARKET_ALIAS[c].slice() : (c ? [c] : []); }


function countryMatches(a, b) { var A = up(a), B = up(b); if (!A || !B) return false; return canonicalCountryCode(A) === canonicalCountryCode(B); }









var EU_SALES_SOURCE_ = { 'EU': ['IT', 'DE', 'ES', 'FR'] };


function _uniq(a) { var seen = {}, out = []; a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; }
function sourceCountriesForScope(country, marketplace) {
var c = up(country), isAmazon = up(marketplace) === 'AMAZON';
if (isAmazon && EU_SALES_SOURCE_[c]) return { members: _uniq(EU_SALES_SOURCE_[c].map(canonicalCountryCode)), aggregate: true };
return { members: _uniq(aliasMembers(c).map(canonicalCountryCode)), aggregate: false };
}







var PLANNING_SET_WAREHOUSE_COUNTRIES_ = { 'EU': ['EU', 'DE', 'ES', 'IT', 'FR'] };
function planningSetMembers(code) { var c = up(code); return Object.prototype.hasOwnProperty.call(PLANNING_SET_WAREHOUSE_COUNTRIES_, c) ? PLANNING_SET_WAREHOUSE_COUNTRIES_[c].slice() : null; }

return {
planningSetMembers: planningSetMembers,
PLANNING_SET_WAREHOUSE_COUNTRIES: { 'EU': ['EU', 'DE', 'ES', 'IT', 'FR'] },
canonicalCountryCode: canonicalCountryCode,
countryMatches: countryMatches,
aliasMembers: aliasMembers,
sourceCountriesForScope: sourceCountriesForScope,
SAME_MARKET_ALIAS: { 'UK': ['UK', 'GB'], 'GB': ['UK', 'GB'] },
EU_SALES_SOURCE: { 'EU': ['IT', 'DE', 'ES', 'FR'] },
VERSION: 'kmcid-r15g-eu-1'
};
});
__kmRegister("supply-planning-country-identity", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;






































































(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.core = window.KM.core || {};
window.KM.core.supplyPlanningCalculations = api;
}
})(this, function () {
'use strict';



function assertQty(v, name) {
if (typeof v !== 'number' || !isFinite(v)) {
throw new Error('supplyPlanningCalculations: ' + name + ' must be a finite number (got ' + describe(v) + ')');
}
if (v < 0) {
throw new Error('supplyPlanningCalculations: ' + name + ' must be non-negative (got ' + v + ')');
}
return v;
}

function assertFiniteNumber(v, name) {
if (typeof v !== 'number' || !isFinite(v)) {
throw new Error('supplyPlanningCalculations: ' + name + ' must be a finite number (got ' + describe(v) + ')');
}
return v;
}

function assertUnitsPerCarton(v) {
if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 1) {
throw new Error('supplyPlanningCalculations: unitsPerCarton must be a positive integer — ' +
'missing/invalid UPC blocks the calculation (no silent default of 1/12/any) (got ' + describe(v) + ')');
}
return v;
}
function describe(v) {
if (typeof v === 'number') return String(v);
if (v === null) return 'null';
if (typeof v === 'string') return 'string "' + v + '"';
return typeof v;
}
function pad2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }


function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function isRealCalendarDate(y, m, d) {
if (m < 1 || m > 12 || d < 1) return false;
var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
return d <= dim[m - 1];
}

function parseStrictIsoDate(s) {
if (typeof s !== 'string') {
throw new Error('supplyPlanningCalculations: eventStartDate must be a "YYYY-MM-DD" string (got ' + describe(s) + ')');
}
var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
if (!m) {
throw new Error('supplyPlanningCalculations: eventStartDate must match strict YYYY-MM-DD (got "' + s + '")');
}
var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
if (!isRealCalendarDate(y, mo, d)) {
throw new Error('supplyPlanningCalculations: eventStartDate is not a real calendar date ("' + s + '")');
}
return { y: y, mo: mo, d: d };
}

var MS_PER_DAY = 24 * 60 * 60 * 1000;




function eventPreparationDate(eventStartDate) {
var p = parseStrictIsoDate(eventStartDate);
var startMs = Date.UTC(p.y, p.mo - 1, p.d);
var prepMs = startMs - 45 * MS_PER_DAY;
var dt = new Date(prepMs);
return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
}


function eventPreparationMonth(eventStartDate) {
return eventPreparationDate(eventStartDate).slice(0, 7);
}




function calculateGap(input) {
var i = input || {};
var demand = assertQty(i.demand, 'demand');
var stock = assertQty(i.destinationCurrentStock, 'destinationCurrentStock');
var incoming = assertQty(i.timelyQualifiedIncoming, 'timelyQualifiedIncoming');
var committed = assertQty(i.timelyApprovedCommittedSupply, 'timelyApprovedCommittedSupply');
return Math.max(demand - stock - incoming - committed, 0);
}


function classifyProjectedBalance(projectedBalance) {
var b = assertFiniteNumber(projectedBalance, 'projectedBalance');
if (b < 0) return { shortage: Math.abs(b), surplus: 0 };
if (b > 0) return { shortage: 0, surplus: b };
return { shortage: 0, surplus: 0 };
}







function calculateShippingAndResidual(input) {
var i = input || {};
var gap = assertQty(i.calculatedGap, 'calculatedGap');
var source = assertQty(i.eligibleSourceAvailable, 'eligibleSourceAvailable');
var other = assertQty(i.otherLegallyAllocatedTimelySupply, 'otherLegallyAllocatedTimelySupply');
var upc = assertUnitsPerCarton(i.unitsPerCarton);

var rawShippableQty = Math.min(gap, source);
var recommendedShippingQty = Math.floor(rawShippableQty / upc) * upc;
var residualProductionRequired = Math.max(gap - recommendedShippingQty - other, 0);

return {
rawShippableQty: rawShippableQty,
recommendedShippingQty: recommendedShippingQty,
residualProductionRequired: residualProductionRequired
};
}



function calculateSuggestedOrderQty(input) {
var i = input || {};
var need = assertQty(i.netOrderNeed, 'netOrderNeed');
var upc = assertUnitsPerCarton(i.unitsPerCarton);
return Math.ceil(need / upc) * upc;
}




function feasibleReallocationQty(input) {
var i = input || {};
var recv = assertQty(i.receiverRemainingShortage, 'receiverRemainingShortage');
var donor = assertQty(i.donorRemainingSurplus, 'donorRemainingSurplus');
var timely = assertQty(i.timelyTransferableQty, 'timelyTransferableQty');
return Math.min(recv, donor, timely);
}



function applyFeasibleReallocation(input) {
var i = input || {};
var recv = assertQty(i.receiverRemainingShortage, 'receiverRemainingShortage');
var donor = assertQty(i.donorRemainingSurplus, 'donorRemainingSurplus');
var timely = assertQty(i.timelyTransferableQty, 'timelyTransferableQty');
var qty = Math.min(recv, donor, timely);
return {
reallocatedQty: qty,
receiverRemainingShortage: recv - qty,
donorRemainingSurplus: donor - qty
};
}























function _parseIso(s, name) {
if (typeof s !== 'string') throw new Error('supplyPlanningCalculations: ' + name + ' must be a "YYYY-MM-DD" string (got ' + describe(s) + ')');
var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
if (!m) throw new Error('supplyPlanningCalculations: ' + name + ' must match strict YYYY-MM-DD (got "' + s + '")');
var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
if (!isRealCalendarDate(y, mo, d)) throw new Error('supplyPlanningCalculations: ' + name + ' is not a real calendar date ("' + s + '")');
return Date.UTC(y, mo - 1, d);
}
function _isoOf(ms) {
var dt = new Date(ms);
return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
}

function _addRangeWithinWindow(set, startMs, endMs, winStartMs, winEndMs) {
var from = Math.max(startMs, winStartMs), to = Math.min(endMs, winEndMs);
for (var ms = from; ms <= to; ms += MS_PER_DAY) set[_isoOf(ms)] = true;
}
function _eventActive(status) {
if (status == null) return true;
var s = String(status).toLowerCase();
return s !== 'cancelled' && s !== 'canceled' && s !== 'invalid';
}

function _scopeString(scope, name, required) {
var v = scope[name];
if (v == null || v === '') {
if (required) throw new Error('supplyPlanningCalculations: scope.' + name + ' must be a non-empty string (canonical marketplace identity must be resolved before scope isolation)');
return null;
}
if (typeof v !== 'string') throw new Error('supplyPlanningCalculations: scope.' + name + ' must be a string (got ' + describe(v) + ')');
return v;
}
function normalizedAvgSalesPerDay(input) {
var i = input || {};
var calendar30 = i.windowPolicy === 'calendar_30';
if (i.windowPolicy != null && i.windowPolicy !== 'calendar_30' && i.windowPolicy !== 'normal_30_in_90') throw new Error('supplyPlanningCalculations: WINDOW_POLICY_INVALID');
var calcMs = _parseIso(i.calcDate, 'calcDate');
var scope = i.scope;
if (scope == null || typeof scope !== 'object') throw new Error('supplyPlanningCalculations: scope must be an object carrying the canonical marketplace identity {marketplaceSkuId, marketplaceId, sku, company, country, marketplace, channel}');
var sku = _scopeString(scope, 'sku', true);
var country = _scopeString(scope, 'country', true);
var marketplace = _scopeString(scope, 'marketplace', true);
var channel = _scopeString(scope, 'channel', true);
var marketplaceSkuId = _scopeString(scope, 'marketplaceSkuId', false);
var marketplaceId = _scopeString(scope, 'marketplaceId', false);



var company = _scopeString(scope, 'company', true);
var weekly7d = assertQty(i.weekly7d, 'weekly7d');
if (!Array.isArray(i.dailySales)) throw new Error('supplyPlanningCalculations: dailySales must be an array of {date,sku,units,company,country,marketplace,channel} (company = resolved Analysis-Layer identity)');
var campaigns = i.campaigns == null ? [] : i.campaigns;
var events = i.events == null ? [] : i.events;
if (!Array.isArray(campaigns)) throw new Error('supplyPlanningCalculations: campaigns must be an array');
if (!Array.isArray(events)) throw new Error('supplyPlanningCalculations: events must be an array');
if (campaigns.length && marketplaceSkuId == null) throw new Error('supplyPlanningCalculations: scope.marketplaceSkuId is required to isolate campaign contamination (campaigns present)');


var winEndMs = calcMs - MS_PER_DAY;
var winStartMs = calcMs - (calendar30 ? 30 : 90) * MS_PER_DAY;









var contaminated = {};
campaigns.forEach(function (c, idx) {
c = c || {};
if (!_eventActive(c.status)) return;
var lines = c.skuLines;
if (!Array.isArray(lines)) throw new Error('supplyPlanningCalculations: campaigns[' + idx + '].skuLines must be an array of {marketplaceSkuId, sku}');
var participates = false;
for (var li = 0; li < lines.length; li++) {
var line = lines[li] || {};
var mSkuId = line.marketplaceSkuId;
if (typeof mSkuId === 'string' && mSkuId !== '') {
if (mSkuId === marketplaceSkuId) participates = true;

} else if (line.sku == null || line.sku === sku) {

throw new Error('supplyPlanningCalculations: campaigns[' + idx + '].skuLines[' + li + '] is missing marketplaceSkuId for master sku "' + sku + '" — canonical marketplace-SKU identity must be resolved before scope isolation (refusing to guess by master sku)');
}

}
if (participates) _addRangeWithinWindow(contaminated, _parseIso(c.start, 'campaigns[' + idx + '].start'), _parseIso(c.end, 'campaigns[' + idx + '].end'), winStartMs, winEndMs);
});
events.forEach(function (e, idx) {
e = e || {};
if (!_eventActive(e.status)) return;
if (e.sku !== sku) return;
var hasMktId = e.marketplaceId != null && e.marketplaceId !== '';
var inScope;
if (hasMktId) {


if (typeof e.marketplaceId !== 'string') throw new Error('supplyPlanningCalculations: events[' + idx + '].marketplaceId must be a string when present (got ' + describe(e.marketplaceId) + ')');




if (marketplaceId == null) throw new Error('supplyPlanningCalculations: events[' + idx + '] carries an authoritative marketplaceId ("' + e.marketplaceId + '") but scope.marketplaceId is required to isolate an ID-bearing event (a resolved scope marketplace_id must be provided — the event is never silently ignored and never rescued by the company+country+marketplace composite)');
inScope = (e.marketplaceId === marketplaceId);
} else {


inScope = (e.company === company && e.country === country && e.marketplace === marketplace);
}
if (!inScope) return;
_addRangeWithinWindow(contaminated, _parseIso(e.start, 'events[' + idx + '].start'), _parseIso(e.end, 'events[' + idx + '].end'), winStartMs, winEndMs);
});










var keyCompany = {};
var byDate = {};
i.dailySales.forEach(function (row, idx) {
row = row || {};

if (row.sku !== sku || row.country !== country || row.marketplace !== marketplace || row.channel !== channel) return;
if (calendar30 && (row.date == null || String(row.date).trim() === '')) return;

if (row.company == null || row.company === '') throw new Error('supplyPlanningCalculations: unresolved daily-sales company scope — dailySales[' + idx + '] matches the source natural key (' + country + '/' + marketplace + '/' + channel + '/' + sku + ') but has no resolved company (Analysis-Layer identity must be resolved upstream; never inferred)');
if (typeof row.company !== 'string') throw new Error('supplyPlanningCalculations: dailySales[' + idx + '].company must be a string (got ' + describe(row.company) + ')');
var ms = _parseIso(row.date, 'dailySales[' + idx + '].date');
var key = _isoOf(ms);

if (Object.prototype.hasOwnProperty.call(keyCompany, key)) {
if (keyCompany[key] !== row.company) throw new Error('supplyPlanningCalculations: ambiguous daily-sales company resolution for one source natural key (snapshot_date=' + key + ', ' + country + '/' + marketplace + '/' + channel + '/' + sku + ') resolves to both "' + keyCompany[key] + '" and "' + row.company + '" — one persisted source key must resolve to exactly one company');
throw new Error('supplyPlanningCalculations: duplicate daily-sales natural key (snapshot_date=' + key + ', country=' + country + ', marketplace=' + marketplace + ', channel=' + channel + ', sku=' + sku + ', company=' + row.company + ') — the natural key must be unique (no last-write-wins)');
}
keyCompany[key] = row.company;

if (row.company !== company) return;

if (ms < winStartMs || ms > winEndMs) return;
byDate[key] = assertQty(row.units, 'dailySales[' + idx + '].units');
});


var eligible = Object.keys(byDate).filter(function (d) { return !contaminated[d]; })
.sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); });
var selected = eligible.slice(0, 30);
if (calendar30) {


if (!Object.keys(byDate).length) throw new Error('supplyPlanningCalculations: DAILY_SALES_WINDOW_UNAVAILABLE');
selected = [];
for (var dayMs = winEndMs; dayMs >= winStartMs; dayMs -= MS_PER_DAY) {
var dayKey = _isoOf(dayMs); if (!contaminated[dayKey]) selected.push(dayKey);
}
if (!selected.length) throw new Error('supplyPlanningCalculations: NO_NORMAL_DAYS_IN_WINDOW');
}
var normalDayCount = selected.length;
var sum = 0;
selected.forEach(function (d) { sum += Object.prototype.hasOwnProperty.call(byDate, d) ? byDate[d] : 0; });

var excludedDates = Object.keys(byDate).filter(function (d) { return contaminated[d]; })
.sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });

var source, warning, avg;
if (calendar30) {
source = 'normalized_30d'; warning = normalDayCount < 7 ? 'low_sample_warning' : ''; avg = sum / normalDayCount;
excludedDates = Object.keys(contaminated).sort();
}
else if (normalDayCount >= 7) { source = 'normalized_30d'; warning = ''; avg = sum / normalDayCount; }
else if (normalDayCount >= 3) { source = 'normalized_30d'; warning = 'low_sample_warning'; avg = sum / normalDayCount; }
else { source = 'weekly_7d'; warning = 'insufficient_normal_days'; avg = weekly7d / 7; }

var normalized = {
source: source,
warning: warning,
normalDayCount: normalDayCount,
avgSalesPerDay: avg,
windowStart: _isoOf(winStartMs),
windowEnd: _isoOf(winEndMs),
selectedDates: selected,
excludedDates: excludedDates
};
if (calendar30) { normalized.windowPolicy = 'calendar_30'; normalized.normalSalesUnits = sum; }
return normalized;
}



function sumRemainingShortages(values) {
if (!Array.isArray(values)) {
throw new Error('supplyPlanningCalculations: sumRemainingShortages expects an array of non-negative numbers');
}
var total = 0;
for (var idx = 0; idx < values.length; idx++) {
total += assertQty(values[idx], 'remainingShortage[' + idx + ']');
}
return total;
}















function _parseYearMonth(s, name) {
if (typeof s !== 'string') throw new Error('supplyPlanningCalculations: ' + name + ' must be a "YYYY-MM" string (got ' + describe(s) + ')');
var m = /^(\d{4})-(\d{2})$/.exec(s);
if (!m) throw new Error('supplyPlanningCalculations: ' + name + ' must match strict YYYY-MM (got "' + s + '")');
var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
if (mo < 1 || mo > 12) throw new Error('supplyPlanningCalculations: ' + name + ' is not a real month ("' + s + '")');
return { y: y, mo: mo };
}

function _daysInMonth(y, mo) {
return [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
}


function _assertPercent(v, name) {
if (typeof v !== 'number' || !isFinite(v)) throw new Error('supplyPlanningCalculations: ' + name + ' must be a finite number percent (50 = 50%, never a fraction) (got ' + describe(v) + ')');
if (v < 0) throw new Error('supplyPlanningCalculations: ' + name + ' must be non-negative (got ' + v + ')');
return v;
}



function _resolveTargetRule(rules) {
var r = rules || {};
if (r.skuPercent != null) return { source: 'sku', percent: _assertPercent(r.skuPercent, 'targetRules.skuPercent') };
if (r.seriesPercent != null) return { source: 'series', percent: _assertPercent(r.seriesPercent, 'targetRules.seriesPercent') };
if (r.categoryPercent != null) return { source: 'category', percent: _assertPercent(r.categoryPercent, 'targetRules.categoryPercent') };
return { source: 'default', percent: 100 };
}

function calculateForecastDrivenRemainingNeed(input) {
var i = input || {};
var fm1 = i.forecastMonth1 || {};
var fm2 = i.forecastMonth2 || {};


var ym1 = _parseYearMonth(fm1.month, 'forecastMonth1.month');
var ym2 = _parseYearMonth(fm2.month, 'forecastMonth2.month');
var expectedY = ym1.mo === 12 ? ym1.y + 1 : ym1.y;
var expectedMo = ym1.mo === 12 ? 1 : ym1.mo + 1;
if (ym2.y !== expectedY || ym2.mo !== expectedMo) {
throw new Error('supplyPlanningCalculations: forecastMonth2.month must be the calendar month immediately after forecastMonth1.month (got "' + fm2.month + '" after "' + fm1.month + '")');
}

var base1 = assertQty(fm1.baseForecast, 'forecastMonth1.baseForecast');
var base2 = assertQty(fm2.baseForecast, 'forecastMonth2.baseForecast');

var tr = _resolveTargetRule(i.targetRules);
var adj1 = base1 * tr.percent / 100;
var adj2 = base2 * tr.percent / 100;
var adjustedRegularForecast = adj1 + adj2;

var d1 = _daysInMonth(ym1.y, ym1.mo);
var d2 = _daysInMonth(ym2.y, ym2.mo);
var totalDays = d1 + d2;
var forecastDailyDemand = adjustedRegularForecast / totalDays;


var safetyDemand = adjustedRegularForecast * 30 / totalDays;

var specialEventDemand = assertQty(i.specialEventDemand, 'specialEventDemand');
var totalForecastDrivenDemand = adjustedRegularForecast + safetyDemand + specialEventDemand;

var forecastDrivenRemainingNeed = calculateGap({
demand: totalForecastDrivenDemand,
destinationCurrentStock: i.destinationCurrentStock,
timelyQualifiedIncoming: i.timelyQualifiedIncoming,
timelyApprovedCommittedSupply: i.timelyApprovedCommittedSupply
});
return {
targetRuleSource: tr.source,
targetRulePercent: tr.percent,
adjustedForecastMonth1: adj1,
adjustedForecastMonth2: adj2,
adjustedRegularForecast: adjustedRegularForecast,
month1CalendarDays: d1,
month2CalendarDays: d2,
forecastDailyDemand: forecastDailyDemand,
safetyDemand: safetyDemand,
specialEventDemand: specialEventDemand,
totalForecastDrivenDemand: totalForecastDrivenDemand,
forecastDrivenRemainingNeed: forecastDrivenRemainingNeed
};
}













function _classifierIsoField(input, field) {
var v = input[field];
if (typeof v !== 'string') {
throw new TypeError('classifyRequiredByWindow: ' + field + ' must be a "YYYY-MM-DD" string (got ' + describe(v) + ')');
}
var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
if (!m) {
throw new RangeError('classifyRequiredByWindow: ' + field + ' must be strict YYYY-MM-DD (got "' + v + '")');
}
var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
if (!isRealCalendarDate(y, mo, d)) {
throw new RangeError('classifyRequiredByWindow: ' + field + ' is not a real calendar date ("' + v + '")');
}
return { y: y, mo: mo, d: d };
}

function classifyRequiredByWindow(input) {
if (input === null || typeof input !== 'object' || Array.isArray(input)) {
throw new TypeError('classifyRequiredByWindow: input must be a non-null, non-array object (got ' + describe(input) + ')');
}
var c = _classifierIsoField(input, 'calculationDate');
var r = _classifierIsoField(input, 'requiredByDate');





var daysOut = (Date.UTC(r.y, r.mo - 1, r.d) - Date.UTC(c.y, c.mo - 1, c.d)) / MS_PER_DAY;



var monthDelta = (r.y - c.y) * 12 + (r.mo - c.mo);


var aBucket, aAllocationEligible;
if (daysOut > 90) { aBucket = '>90d'; aAllocationEligible = false; }
else if (daysOut >= 46) { aBucket = '46–90d'; aAllocationEligible = true; }
else if (daysOut >= 31) { aBucket = '31–45d'; aAllocationEligible = true; }
else if (daysOut >= 19) { aBucket = '19–30d'; aAllocationEligible = true; }
else { aBucket = '0–18d'; aAllocationEligible = true; }


var bTier, bVisible, bAllocationEligible, bPayloadEligible;
if (daysOut < 0) {
bTier = 'T1'; bVisible = true; bAllocationEligible = true; bPayloadEligible = true;
} else if (monthDelta === 0 || monthDelta === 1) {
bTier = 'T1'; bVisible = true; bAllocationEligible = true; bPayloadEligible = true;
} else if (monthDelta === 2) {
bTier = 'T2'; bVisible = true; bAllocationEligible = true; bPayloadEligible = true;
} else if (monthDelta === 3) {
bTier = 'T3'; bVisible = true; bAllocationEligible = true; bPayloadEligible = true;
} else if (monthDelta === 4) {
bTier = 'T4'; bVisible = true; bAllocationEligible = false; bPayloadEligible = false;
} else {
bTier = null; bVisible = false; bAllocationEligible = false; bPayloadEligible = false;
}

return {
daysOut: daysOut,
monthDelta: monthDelta,
engineA: { bucket: aBucket, visible: true, allocationEligible: aAllocationEligible },
engineB: { tier: bTier, visible: bVisible, allocationEligible: bAllocationEligible, payloadEligible: bPayloadEligible }
};
}













function _reallocationTierRank(tier) {
if (tier === 'T1') return 1;
if (tier === 'T2') return 2;
if (tier === 'T3') return 3;
return 0;
}




function _assertReallocationParty(party, name) {
if (party === null || typeof party !== 'object' || Array.isArray(party)) {
throw new TypeError('evaluateReallocationEligibility: ' + name + ' must be a non-null, non-array object (got ' + describe(party) + ')');
}
if (typeof party.masterSku !== 'string' || party.masterSku.trim() === '') {
throw new TypeError('evaluateReallocationEligibility: ' + name + '.masterSku must be a non-empty string (got ' + describe(party.masterSku) + ')');
}
}

function evaluateReallocationEligibility(input) {
if (input === null || typeof input !== 'object' || Array.isArray(input)) {
throw new TypeError('evaluateReallocationEligibility: input must be a non-null, non-array object (got ' + describe(input) + ')');
}
_assertReallocationParty(input.donor, 'donor');
_assertReallocationParty(input.receiver, 'receiver');





var donorClass = classifyRequiredByWindow({ calculationDate: input.calculationDate, requiredByDate: input.donor.requiredByDate });
var receiverClass = classifyRequiredByWindow({ calculationDate: input.calculationDate, requiredByDate: input.receiver.requiredByDate });



var sameMasterSku = input.donor.masterSku === input.receiver.masterSku;



var donorB = donorClass.engineB;
var receiverB = receiverClass.engineB;
var donorRank = _reallocationTierRank(donorB.tier);
var receiverRank = _reallocationTierRank(receiverB.tier);





var tierOrderingEligible =
donorB.allocationEligible === true &&
receiverB.allocationEligible === true &&
donorRank > 0 &&
receiverRank > 0 &&
donorRank <= receiverRank;

var eligible = sameMasterSku && tierOrderingEligible;

return {
sameMasterSku: sameMasterSku,
donor: { tier: donorB.tier, allocationEligible: donorB.allocationEligible },
receiver: { tier: receiverB.tier, allocationEligible: receiverB.allocationEligible },
tierOrderingEligible: tierOrderingEligible,
eligible: eligible
};
}
















function _assertPlanningBoolean(v, name) {
if (typeof v !== 'boolean') {
throw new TypeError('classifyPlanningDataState: ' + name + ' must be a boolean (got ' + describe(v) + ')');
}
return v;
}


function _assertPlanningDayCount(v, name) {
if (typeof v !== 'number') {
throw new TypeError('classifyPlanningDataState: ' + name + ' must be a number when snapshotPresent===true (got ' + describe(v) + ')');
}
if (!isFinite(v) || v < 0) {
throw new RangeError('classifyPlanningDataState: ' + name + ' must be a finite number >= 0 (got ' + describe(v) + ')');
}
return v;
}

function classifyPlanningDataState(input) {
if (input === null || typeof input !== 'object' || Array.isArray(input)) {
throw new TypeError('classifyPlanningDataState: input must be a non-null, non-array object (got ' + describe(input) + ')');
}

_assertPlanningBoolean(input.snapshotPresent, 'snapshotPresent');
if (typeof input.replenishmentModel !== 'string') {
throw new TypeError('classifyPlanningDataState: replenishmentModel must be a string (got ' + describe(input.replenishmentModel) + ')');
}
if (input.replenishmentModel !== 'forecast_driven' && input.replenishmentModel !== 'sales_driven') {
throw new RangeError('classifyPlanningDataState: replenishmentModel must be "forecast_driven" or "sales_driven" (got "' + input.replenishmentModel + '")');
}





if (input.snapshotPresent !== true) {
return { state: 'MISSING_SNAPSHOT', calculationAllowed: false };
}




var demandBasisMissing;
if (input.replenishmentModel === 'forecast_driven') {
_assertPlanningBoolean(input.forecastPresent, 'forecastPresent');
demandBasisMissing = (input.forecastPresent === false) ? 'MISSING_FORECAST' : null;
} else {
_assertPlanningBoolean(input.salesBasisPresent, 'salesBasisPresent');
demandBasisMissing = (input.salesBasisPresent === false) ? 'MISSING_SALES_BASIS' : null;
}
var age = _assertPlanningDayCount(input.snapshotAgeDays, 'snapshotAgeDays');
var threshold = _assertPlanningDayCount(input.stalenessThresholdDays, 'stalenessThresholdDays');



if (demandBasisMissing !== null) {
return { state: demandBasisMissing, calculationAllowed: false };
}


if (age > threshold) {
return { state: 'STALE_SNAPSHOT', calculationAllowed: true };
}

return { state: 'OK', calculationAllowed: true };
}

return {

eventPreparationDate: eventPreparationDate,
eventPreparationMonth: eventPreparationMonth,

calculateGap: calculateGap,

classifyProjectedBalance: classifyProjectedBalance,

calculateShippingAndResidual: calculateShippingAndResidual,

calculateSuggestedOrderQty: calculateSuggestedOrderQty,

feasibleReallocationQty: feasibleReallocationQty,
applyFeasibleReallocation: applyFeasibleReallocation,
sumRemainingShortages: sumRemainingShortages,

normalizedAvgSalesPerDay: normalizedAvgSalesPerDay,

calculateForecastDrivenRemainingNeed: calculateForecastDrivenRemainingNeed,

classifyRequiredByWindow: classifyRequiredByWindow,

evaluateReallocationEligibility: evaluateReallocationEligibility,

classifyPlanningDataState: classifyPlanningDataState
};
});
__kmRegister("supply-planning-calculations", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.qualifiedIncoming = api;
}
})(this, function () {
'use strict';

var KM_ADAPTER_TYPE = 'KM_SHIPMENT_INCOMING';
var EXTERNAL_ADAPTER_TYPE = 'EXTERNAL_INCOMING_AUTHORITY';


var GATE_KEYS = [
'MASTER_SKU_MATCH',
'COMPANY_MATCH',
'DESTINATION_OR_SERVICE_SCOPE_MATCH',
'TABLE_STATUS_QUALIFIED',
'ETA_RESOLVED',
'ETA_ON_OR_BEFORE_REQUIRED_BY',
'REMAINING_QUANTITY_POSITIVE',
'NOT_EXCLUDED_LIFECYCLE_STATE',
'NOT_POSTED_TO_CURRENT_STOCK',
'COUNT_ONCE_OWNERSHIP'
];

var EXCLUDING_GATES = [
'MASTER_SKU_MATCH', 'COMPANY_MATCH', 'DESTINATION_OR_SERVICE_SCOPE_MATCH', 'TABLE_STATUS_QUALIFIED',
'REMAINING_QUANTITY_POSITIVE', 'NOT_EXCLUDED_LIFECYCLE_STATE', 'NOT_POSTED_TO_CURRENT_STOCK', 'COUNT_ONCE_OWNERSHIP'
];


var B4R6_EXCLUSION_ORDER = [
'SOURCE_ADAPTER_NOT_ELIGIBLE', 'DUPLICATE_STABLE_LINEAGE', 'POSTED_TO_CURRENT_STOCK', 'ACTIVE_IN_OTHER_BUCKET'
];
var B4R6_REVIEW_ORDER = ['ETA_MISSING', 'ETA_INVALID', 'DUPLICATE_LINEAGE_CONFLICT'];
var B4R6_INFO_ORDER = ['ETA_AFTER_REQUIRED_BY', 'LINKED_EXTERNAL_EVIDENCE_PRESENT'];
var SUMMARY_ORDER = B4R6_EXCLUSION_ORDER.concat(B4R6_REVIEW_ORDER).concat(B4R6_INFO_ORDER);

function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
function isFinitePositive(n) { return typeof n === 'number' && isFinite(n) && n > 0; }
function finitePosOrZero(n) { return isFinitePositive(n) ? n : 0; }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }


var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isRealCalendarDate(y, m, d) {
if (m < 1 || m > 12 || d < 1) return false;
var mdays = [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
return d <= mdays[m - 1];
}
function isValidIsoDate(s) {
if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
return isRealCalendarDate(parseInt(s.slice(0, 4), 10), parseInt(s.slice(5, 7), 10), parseInt(s.slice(8, 10), 10));
}

function requireObject(v, name) {
if (!isObject(v)) throw new TypeError('evaluateQualifiedIncoming: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
return v;
}
function requireArray(v, name) {
if (!Array.isArray(v)) throw new TypeError('evaluateQualifiedIncoming: ' + name + ' must be an array (got ' + describe(v) + ')');
return v;
}
function requireNonBlankString(v, name) {
if (v === null || v === undefined) throw new RangeError('evaluateQualifiedIncoming: ' + name + ' is required (got ' + describe(v) + ')');
if (typeof v !== 'string') throw new TypeError('evaluateQualifiedIncoming: ' + name + ' must be a string (got ' + describe(v) + ')');
if (v.trim() === '') throw new RangeError('evaluateQualifiedIncoming: ' + name + ' must be a non-empty string');
return v;
}
function requireStrictDate(v, name) {
requireNonBlankString(v, name);
if (!DATE_RE.test(v)) throw new RangeError('evaluateQualifiedIncoming: ' + name + ' must be strict YYYY-MM-DD (got "' + v + '")');
if (!isValidIsoDate(v)) throw new RangeError('evaluateQualifiedIncoming: ' + name + ' is not a real calendar date ("' + v + '")');
return v;
}

function hasToken(arr, t) { return Array.isArray(arr) && arr.indexOf(t) >= 0; }


function mergeReasons(upstream, addSet, canonicalOrder) {
var out = [], seen = {};
if (Array.isArray(upstream)) {
for (var i = 0; i < upstream.length; i++) { if (!seen[upstream[i]]) { seen[upstream[i]] = 1; out.push(upstream[i]); } }
}
for (var j = 0; j < canonicalOrder.length; j++) {
var t = canonicalOrder[j];
if (addSet[t] && !seen[t]) { seen[t] = 1; out.push(t); }
}
return out;
}


function snapshotCandidate(c) {
var out = {};
for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k]; }
return out;
}


function fingerprint(res) {
var c = res.candidate || {};
return JSON.stringify([
c.supplyCandidateId, c.sourceLineRef, c.linkedShipmentId, c.linkedShipmentLineId,
c.company, c.country, c.marketplace, c.sku, c.destinationWarehouseId, c.status, c.eta, c.quantityRemaining,
res.sourceEligible, res.adapterEligibleQuantity, res.statusClass,
Array.isArray(res.exclusionReasons) ? res.exclusionReasons : null,
Array.isArray(res.reviewReasons) ? res.reviewReasons : null
]);
}






function evaluateQualifiedIncoming(input) {
requireObject(input, 'input');
var requiredByDate = requireStrictDate(input.requiredByDate, 'input.requiredByDate');

var kmResults = requireArray(input.kmShipmentResults, 'input.kmShipmentResults');
var externalResults = input.externalAuthorityResults === undefined || input.externalAuthorityResults === null
? [] : requireArray(input.externalAuthorityResults, 'input.externalAuthorityResults');
var postedKeysArr = input.postedToCurrentStockLineageKeys === undefined || input.postedToCurrentStockLineageKeys === null
? [] : requireArray(input.postedToCurrentStockLineageKeys, 'input.postedToCurrentStockLineageKeys');
var otherBucketArr = input.activeOtherBucketLineageKeys === undefined || input.activeOtherBucketLineageKeys === null
? [] : requireArray(input.activeOtherBucketLineageKeys, 'input.activeOtherBucketLineageKeys');


var postedSet = {}, otherSet = {};
postedKeysArr.forEach(function (k, i) { requireNonBlankString(k, 'input.postedToCurrentStockLineageKeys[' + i + ']'); postedSet[k] = 1; });
otherBucketArr.forEach(function (k, i) { requireNonBlankString(k, 'input.activeOtherBucketLineageKeys[' + i + ']'); otherSet[k] = 1; });


kmResults.forEach(function (r, i) {
requireObject(r, 'input.kmShipmentResults[' + i + ']');
if (r.adapterType !== KM_ADAPTER_TYPE) throw new TypeError('evaluateQualifiedIncoming: kmShipmentResults[' + i + '].adapterType must be ' + KM_ADAPTER_TYPE + ' (got ' + describe(r.adapterType) + ')');
requireObject(r.candidate, 'input.kmShipmentResults[' + i + '].candidate');
requireNonBlankString(r.candidate.lineageKey, 'input.kmShipmentResults[' + i + '].candidate.lineageKey');
requireNonBlankString(r.candidate.supplyCandidateId, 'input.kmShipmentResults[' + i + '].candidate.supplyCandidateId');
requireNonBlankString(r.candidate.sourceLineRef, 'input.kmShipmentResults[' + i + '].candidate.sourceLineRef');
});


externalResults.forEach(function (r, i) {
requireObject(r, 'input.externalAuthorityResults[' + i + ']');
if (r.adapterType !== EXTERNAL_ADAPTER_TYPE) throw new TypeError('evaluateQualifiedIncoming: externalAuthorityResults[' + i + '].adapterType must be ' + EXTERNAL_ADAPTER_TYPE + ' (got ' + describe(r.adapterType) + ')');
if (r.planningEligible !== false) throw new RangeError('evaluateQualifiedIncoming: externalAuthorityResults[' + i + '].planningEligible must be false (external records never contribute to planning)');
if (r.adapterEligibleQuantity !== 0) throw new RangeError('evaluateQualifiedIncoming: externalAuthorityResults[' + i + '].adapterEligibleQuantity must be 0 (external records never contribute to planning)');
});


var groups = {}, groupOrder = [];
kmResults.forEach(function (r, i) {
var key = r.candidate.lineageKey;
if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
groups[key].push({ res: r, idx: i });
});

var dupRole = new Array(kmResults.length);
groupOrder.forEach(function (key) {
var members = groups[key];
if (members.length === 1) { dupRole[members[0].idx] = 'SINGLE'; return; }
var fp0 = fingerprint(members[0].res), identical = true;
for (var m = 1; m < members.length; m++) { if (fingerprint(members[m].res) !== fp0) { identical = false; break; } }
if (identical) {

var repIdx = members[0].idx;
for (var n = 1; n < members.length; n++) { if (members[n].idx < repIdx) repIdx = members[n].idx; }
members.forEach(function (mm) { dupRole[mm.idx] = (mm.idx === repIdx) ? 'REP_IDENTICAL' : 'DUP_IDENTICAL'; });
} else {
members.forEach(function (mm) { dupRole[mm.idx] = 'CONFLICT'; });
}
});


var kmLinkedShipmentIds = {};
kmResults.forEach(function (r) { var sid = r.candidate.linkedShipmentId; if (!isBlank(sid)) kmLinkedShipmentIds[String(sid)] = 1; });
var externalLinkedShipmentIds = {};
externalResults.forEach(function (r) {
if (r.linkedEvidence === true && r.candidate && !isBlank(r.candidate.linkedShipmentId)) externalLinkedShipmentIds[String(r.candidate.linkedShipmentId)] = 1;
});


var summarySet = {};
var candidateResults = kmResults.map(function (r, i) {
var c = r.candidate;
var role = dupRole[i];
var exclAdd = {}, reviewAdd = {}, infoAdd = {};
var gate = {};

var etaResolved = r.etaPresent === true && isValidIsoDate(c.eta);
var etaMissing = r.etaPresent !== true || isBlank(c.eta);
var etaInvalid = !etaMissing && !isValidIsoDate(c.eta);


gate.MASTER_SKU_MATCH = (!hasToken(r.exclusionReasons, 'SKU_SCOPE_MISMATCH') && !isBlank(c.sku)) ? 'PASS' : 'FAIL';

gate.COMPANY_MATCH = hasToken(r.exclusionReasons, 'COMPANY_SCOPE_MISMATCH') ? 'FAIL'
: ((isBlank(c.company) || hasToken(r.reviewReasons, 'MISSING_COMPANY')) ? 'REVIEW' : 'PASS');

gate.DESTINATION_OR_SERVICE_SCOPE_MATCH = hasToken(r.exclusionReasons, 'DESTINATION_SCOPE_MISMATCH') ? 'FAIL'
: ((hasToken(r.reviewReasons, 'MISSING_DESTINATION_IDENTITY') || isBlank(c.destinationWarehouseId) || c.destinationIdentitySource === 'MISSING') ? 'REVIEW' : 'PASS');

gate.TABLE_STATUS_QUALIFIED = (r.statusEligible === true && r.statusClass === 'ELIGIBLE_INCOMING_STATUS') ? 'PASS'
: ((r.statusClass === 'MISSING_STATUS' || r.statusClass === 'UNKNOWN_STATUS') ? 'REVIEW' : 'FAIL');

gate.ETA_RESOLVED = etaResolved ? 'PASS' : 'REVIEW';
if (etaMissing) reviewAdd.ETA_MISSING = 1;
else if (etaInvalid) reviewAdd.ETA_INVALID = 1;

if (!etaResolved) gate.ETA_ON_OR_BEFORE_REQUIRED_BY = 'REVIEW';
else if (c.eta <= requiredByDate) gate.ETA_ON_OR_BEFORE_REQUIRED_BY = 'PASS';
else { gate.ETA_ON_OR_BEFORE_REQUIRED_BY = 'FAIL'; infoAdd.ETA_AFTER_REQUIRED_BY = 1; }





gate.REMAINING_QUANTITY_POSITIVE = (r.quantityEligible === true && isFinitePositive(c.quantityRemaining)) ? 'PASS' : 'FAIL';

gate.NOT_EXCLUDED_LIFECYCLE_STATE = (r.statusClass === 'ELIGIBLE_INCOMING_STATUS' && !hasToken(r.exclusionReasons, 'STATUS_NOT_ELIGIBLE')) ? 'PASS'
: ((r.statusClass === 'MISSING_STATUS' || r.statusClass === 'UNKNOWN_STATUS') ? 'REVIEW' : 'FAIL');

var posted = postedSet[c.lineageKey] === 1;
gate.NOT_POSTED_TO_CURRENT_STOCK = posted ? 'FAIL' : 'PASS';
if (posted) exclAdd.POSTED_TO_CURRENT_STOCK = 1;

var inOtherBucket = otherSet[c.lineageKey] === 1;
var gate10Fail = false;
if (role === 'CONFLICT') { gate10Fail = true; reviewAdd.DUPLICATE_LINEAGE_CONFLICT = 1; }
if (role === 'DUP_IDENTICAL') { gate10Fail = true; exclAdd.DUPLICATE_STABLE_LINEAGE = 1; }
if (inOtherBucket) { gate10Fail = true; exclAdd.ACTIVE_IN_OTHER_BUCKET = 1; }
gate.COUNT_ONCE_OWNERSHIP = gate10Fail ? 'FAIL' : 'PASS';

if (r.sourceEligible !== true) exclAdd.SOURCE_ADAPTER_NOT_ELIGIBLE = 1;
if (!isBlank(c.linkedShipmentId) && externalLinkedShipmentIds[String(c.linkedShipmentId)] === 1) infoAdd.LINKED_EXTERNAL_EVIDENCE_PRESENT = 1;


var anyExcludingFail = EXCLUDING_GATES.some(function (g) { return gate[g] === 'FAIL'; });
var anyReview = GATE_KEYS.some(function (g) { return gate[g] === 'REVIEW'; });
var state;
if (anyExcludingFail) state = 'EXCLUDED';
else if (anyReview) state = 'REVIEW';
else if (gate.ETA_ON_OR_BEFORE_REQUIRED_BY === 'FAIL') state = 'LATE_RISK';
else state = 'QUALIFIED';


if (state === 'QUALIFIED' && r.sourceEligible !== true) state = 'EXCLUDED';


var qualifiedQuantity = 0, lateRiskQuantity = 0, excludedQuantity = 0, reviewQuantity = 0;
if (state === 'QUALIFIED') qualifiedQuantity = r.adapterEligibleQuantity;
else if (state === 'LATE_RISK') lateRiskQuantity = r.adapterEligibleQuantity;
else if (state === 'REVIEW') reviewQuantity = finitePosOrZero(c.quantityRemaining);
else  excludedQuantity = (role === 'DUP_IDENTICAL') ? 0 : finitePosOrZero(c.quantityRemaining);

var exclusionReasons = mergeReasons(r.exclusionReasons, exclAdd, B4R6_EXCLUSION_ORDER);
var reviewReasons = mergeReasons(r.reviewReasons, reviewAdd, B4R6_REVIEW_ORDER);
var informationalReasons = mergeReasons([], infoAdd, B4R6_INFO_ORDER);
[exclAdd, reviewAdd, infoAdd].forEach(function (set) { for (var t in set) { if (set[t]) summarySet[t] = 1; } });

return {
candidate: snapshotCandidate(c),
lineageKey: c.lineageKey,
qualificationState: state,
qualifiedQuantity: qualifiedQuantity,
lateRiskQuantity: lateRiskQuantity,
excludedQuantity: excludedQuantity,
reviewQuantity: reviewQuantity,
gateResults: gate,
exclusionReasons: exclusionReasons,
reviewReasons: reviewReasons,
informationalReasons: informationalReasons
};
});


var externalObservedQuantity = 0, linkedExternalEvidenceCount = 0, quarantinedExternalCount = 0,
adoptedExternalCount = 0, adoptionPendingCount = 0;
var externalResultsOut = externalResults.map(function (r) {
var obs = finitePosOrZero(r.observedQuantity);
externalObservedQuantity += obs;
if (r.linkedEvidence === true) linkedExternalEvidenceCount++;
if (r.quarantined === true) quarantinedExternalCount++;
if (r.adoptedToKm === true) adoptedExternalCount++;
if (r.stateClass === 'ADOPTION_REVIEW_PENDING') adoptionPendingCount++;
return {
candidate: r.candidate ? snapshotCandidate(r.candidate) : null,
adapterType: EXTERNAL_ADAPTER_TYPE,
planningEligible: false,
adapterEligibleQuantity: 0,
observedQuantity: obs,
stateClass: r.stateClass,
linkedEvidence: r.linkedEvidence === true,
quarantined: r.quarantined === true,
adoptedToKm: r.adoptedToKm === true,
exclusionReasons: Array.isArray(r.exclusionReasons) ? r.exclusionReasons.slice() : [],
reviewReasons: Array.isArray(r.reviewReasons) ? r.reviewReasons.slice() : []
};
});


var qualifiedIncomingQuantity = 0, lateRiskQuantity = 0, excludedIncomingQuantity = 0, reviewIncomingQuantity = 0;
candidateResults.forEach(function (cr) {
qualifiedIncomingQuantity += cr.qualifiedQuantity;
lateRiskQuantity += cr.lateRiskQuantity;
excludedIncomingQuantity += cr.excludedQuantity;
reviewIncomingQuantity += cr.reviewQuantity;
});

var summaryReasons = [];
for (var s = 0; s < SUMMARY_ORDER.length; s++) { if (summarySet[SUMMARY_ORDER[s]]) summaryReasons.push(SUMMARY_ORDER[s]); }







var qualifiedEvents = candidateResults
.filter(function (cr) { return cr.qualificationState === 'QUALIFIED'; })
.map(function (cr) {
return { incomingId: cr.lineageKey, eta: (cr.candidate && cr.candidate.eta) || null,
eligibleQty: cr.qualifiedQuantity, sourceType: 'KM', state: cr.qualificationState };
});

return {
engineType: 'QUALIFIED_INCOMING',
requiredByDate: requiredByDate,
qualifiedIncomingQuantity: qualifiedIncomingQuantity,
lateRiskQuantity: lateRiskQuantity,
excludedIncomingQuantity: excludedIncomingQuantity,
reviewIncomingQuantity: reviewIncomingQuantity,
kmCandidateCount: kmResults.length,
deduplicatedKmCandidateCount: groupOrder.length,
externalObservationCount: externalResults.length,
externalObservedQuantity: externalObservedQuantity,
linkedExternalEvidenceCount: linkedExternalEvidenceCount,
quarantinedExternalCount: quarantinedExternalCount,
adoptedExternalCount: adoptedExternalCount,
adoptionPendingCount: adoptionPendingCount,
candidateResults: candidateResults,
qualifiedEvents: qualifiedEvents,
externalResults: externalResultsOut,
summaryReasons: summaryReasons
};
}

return { evaluateQualifiedIncoming: evaluateQualifiedIncoming };
});
__kmRegister("supply-planning-qualified-incoming", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.ledgers = api;
}
})(this, function () {
'use strict';


var DEMAND_TYPES = { REGULAR: 1, SALES_RUN_RATE: 1, SPECIAL_EVENT: 1, SAFETY: 1 };
var POOL_TYPES = { FBA: 1, THREE_PL: 1, FACTORY: 1 };

var ACTIVE_BUCKETS = {
COMMITTED_PRODUCTION: 1, APPROVED_SHIPPING_PLAN: 1, SHIPPED_IN_TRANSIT: 1,
DELIVERED_NOT_RECEIVED: 1, RECEIVED_NOT_REFLECTED: 1, CURRENT_STOCK: 1
};
var EXCLUDED_BUCKETS = { DRAFT: 1, CANCELLED_INVALID: 1, CORRECTION_REVERSAL: 1 };
var LIFECYCLE_BUCKETS = {};
(function () { var k; for (k in ACTIVE_BUCKETS) LIFECYCLE_BUCKETS[k] = 1; for (k in EXCLUDED_BUCKETS) LIFECYCLE_BUCKETS[k] = 1; })();

var SEP = '';


function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

function requireObject(v, name) {
if (!isObject(v)) throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
return v;
}
function requireArray(v, name) {
if (!Array.isArray(v)) throw new TypeError('supplyPlanningLedgers: ' + name + ' must be an array (got ' + describe(v) + ')');
return v;
}
function requireNonEmptyString(v, name) {
if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a string (got ' + describe(v) + ')');
if (v.trim() === '') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a non-empty string');
return v;
}

function optNullableString(v, name) {
if (v === undefined || v === null) return null;
if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a string or null (got ' + describe(v) + ')');
return v;
}

function requireEnum(v, set, name) {
if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a string (got ' + describe(v) + ')');
if (set[v] !== 1) throw new RangeError('supplyPlanningLedgers: ' + name + ' is not a supported token (got "' + v + '")');
return v;
}

function requireQty(v, name) {
if (typeof v !== 'number') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a number (got ' + describe(v) + ')');
if (!isFinite(v)) throw new RangeError('supplyPlanningLedgers: ' + name + ' must be finite (got ' + v + ')');
if (v < 0) throw new RangeError('supplyPlanningLedgers: ' + name + ' must be non-negative (got ' + v + ')');
return v;
}


function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function isRealCalendarDate(y, m, d) {
if (m < 1 || m > 12 || d < 1) return false;
var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
return d <= dim[m - 1];
}
function requireStrictIsoDate(v, name) {
if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a "YYYY-MM-DD" string (got ' + describe(v) + ')');
var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
if (!m) throw new RangeError('supplyPlanningLedgers: ' + name + ' must be strict YYYY-MM-DD (got "' + v + '")');
if (!isRealCalendarDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))) {
throw new RangeError('supplyPlanningLedgers: ' + name + ' is not a real calendar date ("' + v + '")');
}
return v;
}







function buildDemandLedger(input) {
var root = requireObject(input, 'input');
var entries = requireArray(root.entries, 'input.entries');

var normalized = entries.map(function (e, i) {
var ctx = 'input.entries[' + i + ']';
requireObject(e, ctx);
var demandType = requireEnum(e.demandType, DEMAND_TYPES, ctx + '.demandType');
var masterSku = requireNonEmptyString(e.masterSku, ctx + '.masterSku');
var company = requireNonEmptyString(e.company, ctx + '.company');
var country = optNullableString(e.country, ctx + '.country');
var marketplace = optNullableString(e.marketplace, ctx + '.marketplace');
var destinationWarehouseId = requireNonEmptyString(e.destinationWarehouseId, ctx + '.destinationWarehouseId');
var planningCycle = requireNonEmptyString(e.planningCycle, ctx + '.planningCycle');
var requiredByDate = requireStrictIsoDate(e.requiredByDate, ctx + '.requiredByDate');
var sourceRef = requireNonEmptyString(e.sourceRef, ctx + '.sourceRef');
var quantity = requireQty(e.quantity, ctx + '.quantity');
var isEvent = demandType === 'SPECIAL_EVENT';
var eventId = isEvent ? requireNonEmptyString(e.eventId, ctx + '.eventId') : null;
var demandKey = isEvent
? [company, destinationWarehouseId, masterSku, planningCycle, eventId].join(SEP)
: [company, destinationWarehouseId, masterSku, planningCycle, demandType, sourceRef].join(SEP);
return {
demandKey: demandKey, demandType: demandType, masterSku: masterSku, company: company,
country: country, marketplace: marketplace, destinationWarehouseId: destinationWarehouseId,
planningCycle: planningCycle, requiredByDate: requiredByDate, eventId: eventId, quantity: quantity, _i: i
};
});

var groups = {}; var order = [];
normalized.forEach(function (n) {
if (!groups[n.demandKey]) { groups[n.demandKey] = []; order.push(n.demandKey); }
groups[n.demandKey].push(n);
});

var outEntries = []; var blockedCount = 0;
order.forEach(function (key) {
var rows = groups[key];
var qtySet = {}; rows.forEach(function (r) { qtySet[r.quantity] = 1; });

var rep = rows.slice().sort(function (a, b) { return cmpStr(a.requiredByDate, b.requiredByDate) || (a._i - b._i); })[0];
var isEvent = rep.demandType === 'SPECIAL_EVENT';
var out = {
demandKey: rep.demandKey, demandType: rep.demandType, masterSku: rep.masterSku, company: rep.company,
country: rep.country, marketplace: rep.marketplace, destinationWarehouseId: rep.destinationWarehouseId,
planningCycle: rep.planningCycle, requiredByDate: rep.requiredByDate, eventId: rep.eventId,
effectiveDemandQty: 0, state: 'COUNTED', reason: null
};
if (Object.keys(qtySet).length > 1) {
blockedCount++;
out.effectiveDemandQty = 0;
out.state = 'BLOCKED_CONFLICT';
out.reason = isEvent ? 'DEMAND_EVENT_QTY_CONFLICT' : 'DEMAND_SOURCE_QTY_CONFLICT';
} else {
out.effectiveDemandQty = rep.quantity;
}
outEntries.push(out);
});

outEntries.sort(function (a, b) {
return cmpStr(a.requiredByDate, b.requiredByDate) || cmpStr(a.demandType, b.demandType) || cmpStr(a.demandKey, b.demandKey);
});

var total = 0;
outEntries.forEach(function (e) { if (e.state === 'COUNTED') total += e.effectiveDemandQty; });

return { ledgerType: 'DEMAND_LEDGER', entries: outEntries, totalEffectiveDemandQty: total, blockedCount: blockedCount };
}











function buildSupplyLedger(input) {
var root = requireObject(input, 'input');
var entries = requireArray(root.entries, 'input.entries');

var normalized = entries.map(function (e, i) {
var ctx = 'input.entries[' + i + ']';
requireObject(e, ctx);
var supplyLineageRef = requireNonEmptyString(e.supplyLineageRef, ctx + '.supplyLineageRef');
var masterSku = requireNonEmptyString(e.masterSku, ctx + '.masterSku');
var company = requireNonEmptyString(e.company, ctx + '.company');
var warehouseId = requireNonEmptyString(e.warehouseId, ctx + '.warehouseId');
var poolType = requireEnum(e.poolType, POOL_TYPES, ctx + '.poolType');
var lifecycleBucket = requireEnum(e.lifecycleBucket, LIFECYCLE_BUCKETS, ctx + '.lifecycleBucket');
var quantity = requireQty(e.quantity, ctx + '.quantity');
var poolKey = [company, warehouseId, masterSku, poolType].join('|');
return {
supplyLineageRef: supplyLineageRef, masterSku: masterSku, company: company, warehouseId: warehouseId,
poolType: poolType, lifecycleBucket: lifecycleBucket, quantity: quantity, poolKey: poolKey, _i: i
};
});


var seenExact = {}; var deduped = [];
normalized.forEach(function (n) {
var sig = [n.supplyLineageRef, n.poolKey, n.lifecycleBucket, n.quantity].join(SEP);
if (!seenExact[sig]) { seenExact[sig] = 1; deduped.push(n); }
});


var lineGroups = {}; var lineOrder = [];
deduped.forEach(function (n) {
if (!lineGroups[n.supplyLineageRef]) { lineGroups[n.supplyLineageRef] = []; lineOrder.push(n.supplyLineageRef); }
lineGroups[n.supplyLineageRef].push(n);
});
var lineageRes = {};
lineOrder.forEach(function (ref) {
var rows = lineGroups[ref];
var pbSet = {}; var pbOrder = []; var qtySet = {}; var touchedSet = {}; var touched = [];
rows.forEach(function (r) {
var pb = r.poolKey + SEP + r.lifecycleBucket;
if (!pbSet[pb]) { pbSet[pb] = r; pbOrder.push(pb); }
qtySet[r.quantity] = 1;
if (!touchedSet[r.poolKey]) { touchedSet[r.poolKey] = 1; touched.push(r.poolKey); }
});
if (pbOrder.length > 1) {
lineageRes[ref] = { status: 'BLOCKED', reason: 'SUPPLY_LINEAGE_CONFLICT', touched: touched };
} else if (Object.keys(qtySet).length > 1) {
lineageRes[ref] = { status: 'BLOCKED', reason: 'PHYSICAL_POOL_QTY_CONFLICT', touched: touched };
} else {
var one = pbSet[pbOrder[0]];
lineageRes[ref] = { status: 'COUNTED', poolKey: one.poolKey, bucket: one.lifecycleBucket, quantity: one.quantity, touched: touched };
}
});


var poolMeta = {}; var poolOrder = [];
deduped.forEach(function (n) { if (!poolMeta[n.poolKey]) { poolMeta[n.poolKey] = n; poolOrder.push(n.poolKey); } });

var pools = []; var blockedCount = 0;
poolOrder.forEach(function (pk) {
var meta = poolMeta[pk];
var counted = []; var blockedReasons = []; var refSet = {}; var refs = [];
lineOrder.forEach(function (ref) {
var res = lineageRes[ref];
if (res.touched.indexOf(pk) === -1) return;
if (!refSet[ref]) { refSet[ref] = 1; refs.push(ref); }
if (res.status === 'BLOCKED') blockedReasons.push(res.reason);
else counted.push(res);
});
refs.sort(cmpStr);
var base = { poolKey: pk, company: meta.company, warehouseId: meta.warehouseId, masterSku: meta.masterSku, poolType: meta.poolType };
if (blockedReasons.length) {
blockedCount++;
base.byLifecycleBucket = {};
base.effectiveSupplyQty = 0;
base.lineageRefs = refs;
base.state = 'BLOCKED_CONFLICT';
base.reason = blockedReasons.indexOf('SUPPLY_LINEAGE_CONFLICT') !== -1 ? 'SUPPLY_LINEAGE_CONFLICT' : 'PHYSICAL_POOL_QTY_CONFLICT';
} else {
var byBucket = {}; var eff = 0;
counted.forEach(function (c) { byBucket[c.bucket] = (byBucket[c.bucket] || 0) + c.quantity; });
Object.keys(byBucket).forEach(function (b) { if (ACTIVE_BUCKETS[b] === 1) eff += byBucket[b]; });
base.byLifecycleBucket = byBucket;
base.effectiveSupplyQty = eff;
base.lineageRefs = refs;
base.state = 'COUNTED';
base.reason = null;
}
pools.push(base);
});

pools.sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); });

var total = 0;
pools.forEach(function (p) { if (p.state === 'COUNTED') total += p.effectiveSupplyQty; });

return { ledgerType: 'SUPPLY_LEDGER', pools: pools, totalEffectiveSupplyQty: total, blockedCount: blockedCount };
}

return { buildDemandLedger: buildDemandLedger, buildSupplyLedger: buildSupplyLedger };
});
__kmRegister("supply-planning-ledgers", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;
















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.allocations = api;
}
})(this, function () {
'use strict';

var POOL_TYPES_OVERSEAS = { THREE_PL: 1, FBA: 1 };
var FULFILLMENT_MODELS = { self_fulfilled: 1, platform_fulfilled: 1, hybrid: 1 };
var LEDGER_STATES = { COUNTED: 1, BLOCKED_CONFLICT: 1 };
var MODE_SEVERITY = { NORMAL_ALLOCATION: 0, PROTECTED_REALLOCATION: 1, SHORTAGE_ALLOCATION: 2 };


function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

function requireObject(v, name) {
if (!isObject(v)) throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
return v;
}
function requireArray(v, name) {
if (!Array.isArray(v)) throw new TypeError('supplyPlanningAllocations: ' + name + ' must be an array (got ' + describe(v) + ')');
return v;
}
function requireNonEmptyString(v, name) {
if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string (got ' + describe(v) + ')');
if (v.trim() === '') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a non-empty string');
return v;
}
function requireEnum(v, set, name) {
if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string (got ' + describe(v) + ')');
if (set[v] !== 1) throw new RangeError('supplyPlanningAllocations: ' + name + ' is not a supported token (got "' + v + '")');
return v;
}
function requireQty(v, name) {
if (typeof v !== 'number') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a number (got ' + describe(v) + ')');
if (!isFinite(v)) throw new RangeError('supplyPlanningAllocations: ' + name + ' must be finite (got ' + v + ')');
if (v < 0) throw new RangeError('supplyPlanningAllocations: ' + name + ' must be non-negative (got ' + v + ')');
return v;
}
function optNullableString(v, name) {
if (v === undefined || v === null) return null;
if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string or null (got ' + describe(v) + ')');
return v;
}
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function isRealCalendarDate(y, m, d) {
if (m < 1 || m > 12 || d < 1) return false;
var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
return d <= dim[m - 1];
}
function requireStrictIsoDate(v, name) {
if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a "YYYY-MM-DD" string (got ' + describe(v) + ')');
var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
if (!m) throw new RangeError('supplyPlanningAllocations: ' + name + ' must be strict YYYY-MM-DD (got "' + v + '")');
if (!isRealCalendarDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))) {
throw new RangeError('supplyPlanningAllocations: ' + name + ' is not a real calendar date ("' + v + '")');
}
return v;
}
function optState(v, name) {
if (v === undefined || v === null) return 'COUNTED';
if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string state (got ' + describe(v) + ')');
if (LEDGER_STATES[v] !== 1) throw new RangeError('supplyPlanningAllocations: ' + name + ' is not a supported Ledger state (got "' + v + '")');
return v;
}




function distributeByWeightCapped(pool, items, leftoverCmp) {
var alloc = {}; items.forEach(function (it) { alloc[it.key] = 0; });
var remaining = pool;
var guard = 0;
while (remaining > 0 && guard++ < 100000) {
var active = items.filter(function (it) { return it.weight > 0 && alloc[it.key] < it.cap; });
if (active.length === 0) break;
var sumW = 0; active.forEach(function (it) { sumW += it.weight; });
if (sumW <= 0) break;
var entries = active.map(function (it) { return { it: it, raw: remaining * it.weight / sumW }; });
var cappedThisRound = false;
entries.forEach(function (e) {
var room = e.it.cap - alloc[e.it.key];
var fl = Math.floor(e.raw);
if (fl >= room) { e.give = room; cappedThisRound = true; }
else { e.give = fl; }
});
entries.forEach(function (e) { alloc[e.it.key] += e.give; remaining -= e.give; });
if (cappedThisRound) continue;

var cands = entries.slice().sort(leftoverCmp);
var pass = 0;
while (remaining > 0 && pass++ < 100000) {
var gaveAny = false;
for (var k = 0; k < cands.length && remaining > 0; k++) {
var c = cands[k];
if (alloc[c.it.key] < c.it.cap) { alloc[c.it.key] += 1; remaining -= 1; gaveAny = true; }
}
if (!gaveAny) break;
}
break;
}
return { alloc: alloc, unused: remaining < 0 ? 0 : remaining };
}


function allocateOverseasSharedPool(input) {
var root = requireObject(input, 'input');
var company = requireNonEmptyString(root.company, 'input.company');
var country = requireNonEmptyString(root.country, 'input.country');
var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
var supplyPools = requireArray(root.supplyPools, 'input.supplyPools');
var receivers = requireArray(root.receivers, 'input.receivers');

var blockedInputs = [];
var poolSeen = {};
var pools = [];
supplyPools.forEach(function (p, i) {
var ctx = 'input.supplyPools[' + i + ']';
requireObject(p, ctx);
var poolKey = requireNonEmptyString(p.poolKey, ctx + '.poolKey');
var state = optState(p.state, ctx + '.state');
if (poolSeen[poolKey]) throw new RangeError('supplyPlanningAllocations: duplicate poolKey "' + poolKey + '"');
poolSeen[poolKey] = 1;
if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'SUPPLY', key: poolKey, reason: typeof p.reason === 'string' ? p.reason : 'BLOCKED_CONFLICT' }); return; }
var poolType = requireEnum(p.poolType, POOL_TYPES_OVERSEAS, ctx + '.poolType');
var warehouseId = requireNonEmptyString(p.warehouseId, ctx + '.warehouseId');
var effectiveSupplyQty = requireQty(p.effectiveSupplyQty, ctx + '.effectiveSupplyQty');
pools.push({ poolKey: poolKey, poolType: poolType, warehouseId: warehouseId, effectiveSupplyQty: effectiveSupplyQty, remaining: effectiveSupplyQty });
});

var recvSeen = {}, demandSeen = {};
var recvs = [];
receivers.forEach(function (r, i) {
var ctx = 'input.receivers[' + i + ']';
requireObject(r, ctx);
var receiverKey = requireNonEmptyString(r.receiverKey, ctx + '.receiverKey');
var demandKey = requireNonEmptyString(r.demandKey, ctx + '.demandKey');
var state = optState(r.state, ctx + '.state');
if (recvSeen[receiverKey]) throw new RangeError('supplyPlanningAllocations: duplicate receiverKey "' + receiverKey + '"');
recvSeen[receiverKey] = 1;
if (demandSeen[demandKey]) throw new RangeError('supplyPlanningAllocations: duplicate demandKey "' + demandKey + '"');
demandSeen[demandKey] = 1;
if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'DEMAND', key: demandKey, reason: typeof r.reason === 'string' ? r.reason : 'BLOCKED_CONFLICT' }); return; }
var marketplace = requireNonEmptyString(r.marketplace, ctx + '.marketplace');
var destinationWarehouseId = requireNonEmptyString(r.destinationWarehouseId, ctx + '.destinationWarehouseId');
var fulfillmentModel = requireEnum(r.fulfillmentModel, FULFILLMENT_MODELS, ctx + '.fulfillmentModel');
var demandQty = requireQty(r.demandQty, ctx + '.demandQty');
var survivalNeedQty = requireQty(r.survivalNeedQty, ctx + '.survivalNeedQty');
var allocationPriority = requireQty(r.allocationPriority, ctx + '.allocationPriority');
var demandWeight = requireQty(r.demandWeight, ctx + '.demandWeight');
var eligiblePoolTypes = requireArray(r.eligiblePoolTypes, ctx + '.eligiblePoolTypes').map(function (t, j) {
return requireEnum(t, POOL_TYPES_OVERSEAS, ctx + '.eligiblePoolTypes[' + j + ']');
});
recvs.push({ receiverKey: receiverKey, demandKey: demandKey, marketplace: marketplace, destinationWarehouseId: destinationWarehouseId,
fulfillmentModel: fulfillmentModel, demandQty: demandQty, survivalNeedQty: survivalNeedQty,
allocationPriority: allocationPriority, demandWeight: demandWeight, eligiblePoolTypes: eligiblePoolTypes });
});

var allocations = []; var seq = { n: 0 };
var unallocatedDemand = [];
var laneModes = [];


function recvOrder(a, b) {
return (b.allocationPriority - a.allocationPriority) || (b.demandWeight - a.demandWeight)
|| cmpStr(a.marketplace, b.marketplace) || cmpStr(a.receiverKey, b.receiverKey);
}

['FBA', 'THREE_PL'].forEach(function (lane) {
var lanePools = pools.filter(function (p) { return p.poolType === lane; }).sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); });
var laneRecvs = recvs.filter(function (r) { return r.eligiblePoolTypes.indexOf(lane) !== -1; });
if (laneRecvs.length === 0) return;
var poolSupply = 0; lanePools.forEach(function (p) { poolSupply += p.remaining; });
var sumSurvival = 0; laneRecvs.forEach(function (r) { sumSurvival += Math.min(r.survivalNeedQty, r.demandQty); });

var mode, finalAlloc = {}, survivalAlloc = {};
if (poolSupply < sumSurvival) {
mode = 'SHORTAGE_ALLOCATION';

var items = laneRecvs.map(function (r) { return { key: r.receiverKey, weight: Math.min(r.survivalNeedQty, r.demandQty) * Math.max(r.allocationPriority, 1), cap: r.demandQty, r: r }; });
var res = distributeByWeightCapped(poolSupply, items, function (a, b) {
var ra = a.it.r, rb = b.it.r;
return (rb.allocationPriority - ra.allocationPriority)
|| ((rb.survivalNeedQty) - (ra.survivalNeedQty))
|| cmpStr(ra.marketplace, rb.marketplace) || cmpStr(ra.receiverKey, rb.receiverKey);
});
laneRecvs.forEach(function (r) { finalAlloc[r.receiverKey] = res.alloc[r.receiverKey] || 0; survivalAlloc[r.receiverKey] = finalAlloc[r.receiverKey]; });
} else {

var wItems = laneRecvs.map(function (r) { return { key: r.receiverKey, weight: r.demandWeight, cap: r.demandQty, r: r }; });
var prov = distributeByWeightCapped(poolSupply, wItems, function (a, b) {
return (b.it.r.allocationPriority - a.it.r.allocationPriority) || cmpStr(a.it.r.marketplace, b.it.r.marketplace) || cmpStr(a.it.r.receiverKey, b.it.r.receiverKey);
});
var allSafe = laneRecvs.every(function (r) { return (prov.alloc[r.receiverKey] || 0) >= Math.min(r.survivalNeedQty, r.demandQty); });
mode = allSafe ? 'NORMAL_ALLOCATION' : 'PROTECTED_REALLOCATION';

var remainingPool = poolSupply;
laneRecvs.forEach(function (r) { var sv = Math.min(r.survivalNeedQty, r.demandQty, remainingPool); survivalAlloc[r.receiverKey] = sv; remainingPool -= sv; });
var wItems2 = laneRecvs.map(function (r) { return { key: r.receiverKey, weight: r.demandWeight, cap: r.demandQty - survivalAlloc[r.receiverKey], r: r }; });
var wres = distributeByWeightCapped(remainingPool, wItems2, function (a, b) {
return (b.it.r.allocationPriority - a.it.r.allocationPriority) || cmpStr(a.it.r.marketplace, b.it.r.marketplace) || cmpStr(a.it.r.receiverKey, b.it.r.receiverKey);
});
laneRecvs.forEach(function (r) { finalAlloc[r.receiverKey] = survivalAlloc[r.receiverKey] + (wres.alloc[r.receiverKey] || 0); });
}
laneModes.push(mode);


var ordered = laneRecvs.slice().sort(recvOrder);
function reserveReason(r, baseReason) { return (lane === 'THREE_PL' && r.fulfillmentModel === 'platform_fulfilled') ? 'THREE_PL_REPLENISHMENT_RESERVE' : baseReason; }
function assign(r, qty, reason) {
var need = qty;
for (var pi = 0; pi < lanePools.length && need > 0; pi++) {
var p = lanePools[pi];
if (p.remaining <= 0) continue;
var take = Math.min(need, p.remaining);
if (take <= 0) continue;
p.remaining -= take; need -= take;
allocations.push({
allocationKey: 'OVERSEAS_SHARED_POOL|' + p.poolKey + '|' + r.demandKey + '|' + seq.n,
allocationType: 'OVERSEAS_SHARED_POOL', sourcePoolKey: p.poolKey, sourcePoolType: p.poolType, sourceWarehouseId: p.warehouseId,
masterSku: masterSku, company: company, country: country, marketplace: r.marketplace, destinationWarehouseId: r.destinationWarehouseId,
demandKey: r.demandKey, allocatedQty: take, allocationSequence: seq.n, allocationReason: reason
});
seq.n += 1;
}
}
var survReasonBase = mode === 'PROTECTED_REALLOCATION' ? 'PROTECTION_REALLOCATION' : (mode === 'SHORTAGE_ALLOCATION' ? 'SHORTAGE_LARGEST_REMAINDER' : 'SURVIVAL_18D');
if (mode !== 'SHORTAGE_ALLOCATION') {
ordered.forEach(function (r) { if (survivalAlloc[r.receiverKey] > 0) assign(r, survivalAlloc[r.receiverKey], reserveReason(r, survReasonBase)); });
ordered.forEach(function (r) { var w = finalAlloc[r.receiverKey] - survivalAlloc[r.receiverKey]; if (w > 0) assign(r, w, reserveReason(r, 'WEIGHTED_REMAINDER')); });
} else {
ordered.forEach(function (r) { if (finalAlloc[r.receiverKey] > 0) assign(r, finalAlloc[r.receiverKey], reserveReason(r, 'SHORTAGE_LARGEST_REMAINDER')); });
}


ordered.forEach(function (r) {
var unmet = r.demandQty - finalAlloc[r.receiverKey];
if (unmet > 0) {
var reason = mode === 'SHORTAGE_ALLOCATION' ? 'SHORTAGE_UNMET'
: (survivalAlloc[r.receiverKey] < Math.min(r.survivalNeedQty, r.demandQty) ? 'PROTECTION_FLOOR_BLOCKED' : 'DEMAND_UNMET');
unallocatedDemand.push({ demandKey: r.demandKey, company: company, country: country, marketplace: r.marketplace,
destinationWarehouseId: r.destinationWarehouseId, poolType: lane, unallocatedQty: unmet, allocationReason: reason });
}
});
});


var totalDemandQty = 0;
['FBA', 'THREE_PL'].forEach(function (lane) {
recvs.forEach(function (r) { if (r.eligiblePoolTypes.indexOf(lane) !== -1) totalDemandQty += r.demandQty; });
});
var totalSupplyQty = 0; pools.forEach(function (p) { totalSupplyQty += p.effectiveSupplyQty; });

var unusedSupply = pools.slice().sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); })
.filter(function (p) { return p.remaining > 0; })
.map(function (p) { return { poolKey: p.poolKey, poolType: p.poolType, warehouseId: p.warehouseId, unusedQty: p.remaining }; });

allocations.sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || cmpStr(a.demandKey, b.demandKey) || (a.allocationSequence - b.allocationSequence); });
unallocatedDemand.sort(function (a, b) { return cmpStr(a.demandKey, b.demandKey) || cmpStr(a.poolType, b.poolType); });

var totalAllocatedQty = 0; allocations.forEach(function (a) { totalAllocatedQty += a.allocatedQty; });
var totalUnallocatedDemandQty = 0; unallocatedDemand.forEach(function (u) { totalUnallocatedDemandQty += u.unallocatedQty; });
var totalUnusedSupplyQty = 0; unusedSupply.forEach(function (u) { totalUnusedSupplyQty += u.unusedQty; });

var allocationMode = laneModes.length
? laneModes.reduce(function (acc, m) { return MODE_SEVERITY[m] > MODE_SEVERITY[acc] ? m : acc; }, 'NORMAL_ALLOCATION')
: 'NORMAL_ALLOCATION';

verifyConservation(totalAllocatedQty, totalUnallocatedDemandQty, totalDemandQty, totalUnusedSupplyQty, totalSupplyQty);

return {
allocationType: 'OVERSEAS_SHARED_POOL', allocationMode: allocationMode,
allocations: allocations, unallocatedDemand: unallocatedDemand, unusedSupply: unusedSupply, blockedInputs: blockedInputs,
totalDemandQty: totalDemandQty, totalSupplyQty: totalSupplyQty, totalAllocatedQty: totalAllocatedQty,
totalUnallocatedDemandQty: totalUnallocatedDemandQty, totalUnusedSupplyQty: totalUnusedSupplyQty
};
}


function allocateFactoryDeterministic(input) {
var root = requireObject(input, 'input');
var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
var factoryPools = requireArray(root.factoryPools, 'input.factoryPools');
var demands = requireArray(root.demands, 'input.demands');

var blockedInputs = [];
var poolSeen = {}; var pools = []; var poolByKey = {};
factoryPools.forEach(function (p, i) {
var ctx = 'input.factoryPools[' + i + ']';
requireObject(p, ctx);
var poolKey = requireNonEmptyString(p.poolKey, ctx + '.poolKey');
var state = optState(p.state, ctx + '.state');
if (poolSeen[poolKey]) throw new RangeError('supplyPlanningAllocations: duplicate poolKey "' + poolKey + '"');
poolSeen[poolKey] = 1;
if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'SUPPLY', key: poolKey, reason: typeof p.reason === 'string' ? p.reason : 'BLOCKED_CONFLICT' }); return; }
var poolType = requireEnum(p.poolType, { FACTORY: 1 }, ctx + '.poolType');
var warehouseId = requireNonEmptyString(p.warehouseId, ctx + '.warehouseId');
var effectiveSupplyQty = requireQty(p.effectiveSupplyQty, ctx + '.effectiveSupplyQty');
var rec = { poolKey: poolKey, poolType: poolType, warehouseId: warehouseId, effectiveSupplyQty: effectiveSupplyQty, remaining: effectiveSupplyQty };
pools.push(rec); poolByKey[poolKey] = rec;
});

var demandSeen = {}; var dems = [];
demands.forEach(function (dd, i) {
var ctx = 'input.demands[' + i + ']';
requireObject(dd, ctx);
var demandKey = requireNonEmptyString(dd.demandKey, ctx + '.demandKey');
var state = optState(dd.state, ctx + '.state');
if (demandSeen[demandKey]) throw new RangeError('supplyPlanningAllocations: duplicate demandKey "' + demandKey + '"');
demandSeen[demandKey] = 1;
if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'DEMAND', key: demandKey, reason: typeof dd.reason === 'string' ? dd.reason : 'BLOCKED_CONFLICT' }); return; }
var comp = requireNonEmptyString(dd.company, ctx + '.company');
var marketplace = requireNonEmptyString(dd.marketplace, ctx + '.marketplace');
var destinationWarehouseId = requireNonEmptyString(dd.destinationWarehouseId, ctx + '.destinationWarehouseId');
var requiredByDate = requireStrictIsoDate(dd.requiredByDate, ctx + '.requiredByDate');
var allocationPriority = requireQty(dd.allocationPriority, ctx + '.allocationPriority');
var demandQty = requireQty(dd.demandQty, ctx + '.demandQty');
var eligibleFactoryWarehouseIds = requireArray(dd.eligibleFactoryWarehouseIds, ctx + '.eligibleFactoryWarehouseIds').map(function (w, j) {
return requireNonEmptyString(w, ctx + '.eligibleFactoryWarehouseIds[' + j + ']');
});
dems.push({ demandKey: demandKey, company: comp, marketplace: marketplace, destinationWarehouseId: destinationWarehouseId,
requiredByDate: requiredByDate, allocationPriority: allocationPriority, demandQty: demandQty, remaining: demandQty,
eligibleFactoryWarehouseIds: eligibleFactoryWarehouseIds });
});


var ordered = dems.slice().sort(function (a, b) {
return cmpStr(a.requiredByDate, b.requiredByDate) || (b.allocationPriority - a.allocationPriority)
|| cmpStr(a.company, b.company) || cmpStr(a.marketplace, b.marketplace)
|| cmpStr(a.destinationWarehouseId, b.destinationWarehouseId) || cmpStr(a.demandKey, b.demandKey);
});
var sortedPoolKeys = pools.map(function (p) { return p.poolKey; }).sort(cmpStr);

var allocations = []; var seqn = 0;
ordered.forEach(function (d) {
for (var pi = 0; pi < sortedPoolKeys.length && d.remaining > 0; pi++) {
var p = poolByKey[sortedPoolKeys[pi]];
if (d.eligibleFactoryWarehouseIds.indexOf(p.warehouseId) === -1) continue;
if (p.remaining <= 0) continue;
var take = Math.min(d.remaining, p.remaining);
if (take <= 0) continue;
p.remaining -= take; d.remaining -= take;
allocations.push({
allocationKey: 'FACTORY_DETERMINISTIC|' + p.poolKey + '|' + d.demandKey + '|' + seqn,
allocationType: 'FACTORY_DETERMINISTIC', sourcePoolKey: p.poolKey, sourcePoolType: p.poolType, sourceWarehouseId: p.warehouseId,
masterSku: masterSku, company: d.company, country: null, marketplace: d.marketplace, destinationWarehouseId: d.destinationWarehouseId,
demandKey: d.demandKey, allocatedQty: take, allocationSequence: seqn, allocationReason: 'FACTORY_FIFO'
});
seqn += 1;
}
});

var unallocatedDemand = ordered.filter(function (d) { return d.remaining > 0; }).map(function (d) {
return { demandKey: d.demandKey, company: d.company, country: null, marketplace: d.marketplace,
destinationWarehouseId: d.destinationWarehouseId, poolType: 'FACTORY', unallocatedQty: d.remaining, allocationReason: 'FACTORY_SUPPLY_EXHAUSTED' };
}).sort(function (a, b) { return cmpStr(a.demandKey, b.demandKey); });

var unusedSupply = pools.slice().sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); })
.filter(function (p) { return p.remaining > 0; })
.map(function (p) { return { poolKey: p.poolKey, poolType: p.poolType, warehouseId: p.warehouseId, unusedQty: p.remaining }; });

allocations.sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || cmpStr(a.demandKey, b.demandKey) || (a.allocationSequence - b.allocationSequence); });

var totalDemandQty = 0; dems.forEach(function (d) { totalDemandQty += d.demandQty; });
var totalSupplyQty = 0; pools.forEach(function (p) { totalSupplyQty += p.effectiveSupplyQty; });
var totalAllocatedQty = 0; allocations.forEach(function (a) { totalAllocatedQty += a.allocatedQty; });
var totalUnallocatedDemandQty = 0; unallocatedDemand.forEach(function (u) { totalUnallocatedDemandQty += u.unallocatedQty; });
var totalUnusedSupplyQty = 0; unusedSupply.forEach(function (u) { totalUnusedSupplyQty += u.unusedQty; });

verifyConservation(totalAllocatedQty, totalUnallocatedDemandQty, totalDemandQty, totalUnusedSupplyQty, totalSupplyQty);

return {
allocationType: 'FACTORY_DETERMINISTIC',
allocations: allocations, unallocatedDemand: unallocatedDemand, unusedSupply: unusedSupply, blockedInputs: blockedInputs,
totalDemandQty: totalDemandQty, totalSupplyQty: totalSupplyQty, totalAllocatedQty: totalAllocatedQty,
totalUnallocatedDemandQty: totalUnallocatedDemandQty, totalUnusedSupplyQty: totalUnusedSupplyQty
};
}


function verifyConservation(alloc, unallocDemand, totalDemand, unusedSupply, totalSupply) {
if (alloc + unallocDemand !== totalDemand) {
throw new RangeError('supplyPlanningAllocations: demand conservation violated (' + alloc + ' + ' + unallocDemand + ' != ' + totalDemand + ')');
}
if (alloc + unusedSupply !== totalSupply) {
throw new RangeError('supplyPlanningAllocations: supply conservation violated (' + alloc + ' + ' + unusedSupply + ' != ' + totalSupply + ')');
}
}

return { allocateOverseasSharedPool: allocateOverseasSharedPool, allocateFactoryDeterministic: allocateFactoryDeterministic };
});
__kmRegister("supply-planning-allocations", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;




















(function (root, factory) {
'use strict';
var api = factory(
(typeof require !== 'undefined') ? require('./supply-planning-allocations.js') : (root.KM && root.KM.allocations)
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.allocationRuntime = api; }
})(this, function (ALLOC) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function str(v) { return String(v === undefined || v === null ? '' : v); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }



var INACTIVE_STATUS = { inactive: 1, cancelled: 1, canceled: 1, archived: 1, closed: 1, draft: 1, disabled: 1, paused: 1 };
function isPlannableStatus(s) { var t = str(s).trim().toLowerCase(); return t === '' || INACTIVE_STATUS[t] !== 1; }




function receiverExclusionReason(r) {
if (!isObj(r)) return 'INVALID_RECEIVER';
if (!isPlannableStatus(r.marketplaceStatus)) return 'MARKETPLACE_INACTIVE';
if (!isPlannableStatus(r.marketplaceSkuStatus)) return 'MARKETPLACE_SKU_INACTIVE';
if (!str(r.company) || !str(r.marketplace) || !(str(r.sku) || str(r.masterSku))) return 'INVALID_PLANNING_IDENTITY';
if (num(r.demandQty) === null) return 'DEMAND_AUTHORITY_UNRESOLVED';
if (r.fulfillmentIncompatible === true) return 'FULFILLMENT_INCOMPATIBLE';
return null;
}
function filterEligibleReceivers(receivers) {
var eligible = [], excluded = [];
(Array.isArray(receivers) ? receivers : []).forEach(function (r) {
var reason = receiverExclusionReason(r);
if (reason) excluded.push({ receiver: r, reason: reason }); else eligible.push(r);
});

excluded.sort(function (a, b) { return cmpStr(str(a.receiver && a.receiver.receiverKey), str(b.receiver && b.receiver.receiverKey)) || cmpStr(a.reason, b.reason); });
return { eligible: eligible, excluded: excluded };
}







function allocateFactoryCrossCompany(masterSku, perCompanyFactoryInputs) {
var poolByKey = {}, pools = [], demands = [], demandSeen = {};
(Array.isArray(perCompanyFactoryInputs) ? perCompanyFactoryInputs : []).forEach(function (inp) {
if (!isObj(inp)) return;
(inp.factoryPools || []).forEach(function (p) {
var k = str(p && p.poolKey);
if (!k) return;
if (!poolByKey[k]) { poolByKey[k] = p; pools.push(p); }
});
(inp.demands || []).forEach(function (d) {
var dk = str(d && d.demandKey);
if (!dk) return;
if (demandSeen[dk]) throw new RangeError('allocateFactoryCrossCompany: duplicate demandKey across companies: ' + dk);
demandSeen[dk] = 1; demands.push(d);
});
});

return ALLOC.allocateFactoryDeterministic({ masterSku: str(masterSku), factoryPools: pools, demands: demands });
}



function allocateOverseas(overseasInput) { return ALLOC.allocateOverseasSharedPool(overseasInput); }








function projectHealth(input) {
var f = isObj(input) ? input : {};
var allocatedQty = num(f.allocatedQty) || 0;
var demandQty = num(f.demandQty) || 0;
var survivalNeedQty = num(f.survivalNeedQty) || 0;
var poolSupply = num(f.poolSupply);
var sumSurvivalNeed = num(f.sumSurvivalNeed);
var survivalFloor = Math.min(survivalNeedQty, demandQty);
var competition = (poolSupply !== null && sumSurvivalNeed !== null) ? (poolSupply < sumSurvivalNeed) : false;
var survivalShortfallQty = Math.max(0, survivalFloor - allocatedQty);
var healthState;
if (allocatedQty < survivalFloor) healthState = 'CRITICAL';
else if (allocatedQty < demandQty) healthState = 'RISK';
else healthState = 'NORMAL';
var requiresExpediteReview = (healthState === 'CRITICAL') || competition;
return {
healthState: healthState, survivalNeedQty: survivalNeedQty, allocatedQty: allocatedQty,
survivalShortfallQty: survivalShortfallQty, competition: competition, requiresExpediteReview: requiresExpediteReview
};
}

return {

filterEligibleReceivers: filterEligibleReceivers,
receiverExclusionReason: receiverExclusionReason,
isPlannableStatus: isPlannableStatus,

allocateFactoryCrossCompany: allocateFactoryCrossCompany,
allocateOverseas: allocateOverseas,

projectHealth: projectHealth
};
});
__kmRegister("supply-planning-allocation-runtime", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





















(function (root, factory) {
'use strict';
var api = factory(
(typeof require !== 'undefined') ? require('./supply-planning-allocation-runtime.js') : (root.KM && root.KM.allocationRuntime)
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.factoryCohort = api; }
})(this, function (KMAR) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function str(v) { return String(v === undefined || v === null ? '' : v); }
function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }


function factoryCohortKey(warehouseId, sku) { return str(warehouseId) + '||' + str(sku); }



function collectPools(perCompany) {
var byKey = {}, order = [];
perCompany.forEach(function (c) {
(c.factoryPools || []).forEach(function (p) {
var k = str(p && p.poolKey); if (!k) return;
if (!byKey[k]) { byKey[k] = p; order.push(k); }
});
});
order.sort(cmpStr);
return order.map(function (k) { return byKey[k]; });
}











function allocateFactoryPoolCohort(input) {
var f = isObj(input) ? input : {};
var masterSku = str(f.masterSku);
var perCompany = Array.isArray(f.perCompany) ? f.perCompany : [];



var excluded = [], eligibleDemandKeys = {};
perCompany.forEach(function (c) {
var company = str(c.company);
var res = KMAR.filterEligibleReceivers(Array.isArray(c.receivers) ? c.receivers : []);
(res.excluded || []).forEach(function (x) { excluded.push({ company: company, receiver: x.receiver, reason: x.reason }); });
(res.eligible || []).forEach(function (r) { var dk = str(r.demandKey); if (dk) eligibleDemandKeys[company + '\u0000' + dk] = 1; });
});


function demandEligible(company, d) {
var hasReceivers = perCompany.some(function (c) { return str(c.company) === company && Array.isArray(c.receivers) && c.receivers.length; });
if (!hasReceivers) return true;
return eligibleDemandKeys[company + '\u0000' + str(d.demandKey)] === 1;
}



var companies = perCompany.map(function (c) { return c; }).sort(function (a, b) { return cmpStr(str(a.company), str(b.company)); });
var kmarInputs = companies.map(function (c) {
var company = str(c.company);
var demands = (c.demands || []).filter(function (d) { return demandEligible(company, d); });
return { company: company, factoryPools: (c.factoryPools || []), demands: demands };
}).filter(function (c) { return c.demands.length; });

var pools = collectPools(perCompany);
var poolSupplyByKey = {}, totalSupplyQty = 0, cohortKeys = [];
pools.forEach(function (p) {
var q = num(p.effectiveSupplyQty) || 0; poolSupplyByKey[str(p.poolKey)] = q; totalSupplyQty += q;
cohortKeys.push(factoryCohortKey(p.warehouseId, masterSku));
});


var allocation = kmarInputs.length
? KMAR.allocateFactoryCrossCompany(masterSku, kmarInputs)
: { allocationType: 'FACTORY_DETERMINISTIC', allocations: [], unallocatedDemand: [], unusedSupply: [], blockedInputs: [], totalDemandQty: 0, totalSupplyQty: totalSupplyQty, totalAllocatedQty: 0, totalUnallocatedDemandQty: 0, totalUnusedSupplyQty: totalSupplyQty };


var byCompany = {};
companies.forEach(function (c) { byCompany[str(c.company)] = { allocationType: allocation.allocationType, allocations: [], totalAllocatedQty: 0, masterSku: masterSku }; });
var totalAllocatedQty = 0;
(allocation.allocations || []).forEach(function (a) {
var company = str(a.company);
if (!byCompany[company]) byCompany[company] = { allocationType: allocation.allocationType, allocations: [], totalAllocatedQty: 0, masterSku: masterSku };
byCompany[company].allocations.push(a);
var q = num(a.allocatedQty) || 0; byCompany[company].totalAllocatedQty += q; totalAllocatedQty += q;
});


var unusedSupplyQty = num(allocation.totalUnusedSupplyQty);
if (unusedSupplyQty === null) unusedSupplyQty = Math.max(0, totalSupplyQty - totalAllocatedQty);
var conserved = (totalAllocatedQty <= totalSupplyQty + 1e-9) && (Math.abs((totalAllocatedQty + unusedSupplyQty) - totalSupplyQty) < 1e-6);

excluded.sort(function (a, b) { return cmpStr(a.company, b.company) || cmpStr(str(a.receiver && a.receiver.receiverKey), str(b.receiver && b.receiver.receiverKey)) || cmpStr(a.reason, b.reason); });
cohortKeys = cohortKeys.filter(function (k, i, arr) { return arr.indexOf(k) === i; }).sort(cmpStr);

return {
masterSku: masterSku, cohortKeys: cohortKeys, pools: pools, poolSupplyByKey: poolSupplyByKey,
totalSupplyQty: totalSupplyQty, totalAllocatedQty: totalAllocatedQty, unusedSupplyQty: unusedSupplyQty,
conserved: conserved, allocation: allocation, byCompany: byCompany, excluded: excluded
};
}



function factorySliceForCompany(cohortResult, company) {
var c = str(company);
return (cohortResult && cohortResult.byCompany && cohortResult.byCompany[c]) || { allocationType: 'FACTORY_DETERMINISTIC', allocations: [], totalAllocatedQty: 0, masterSku: (cohortResult && cohortResult.masterSku) || '' };
}

return {
factoryCohortKey: factoryCohortKey,
allocateFactoryPoolCohort: allocateFactoryPoolCohort,
factorySliceForCompany: factorySliceForCompany
};
});
__kmRegister("supply-planning-factory-cohort", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;

















(function (root, factory) {
'use strict';
var deps;
if (typeof module !== 'undefined' && module.exports) {
deps = {
evaluateQualifiedIncoming: require('./supply-planning-qualified-incoming.js').evaluateQualifiedIncoming,
calculateGap: require('./supply-planning-calculations.js').calculateGap
};
module.exports = factory(deps);
} else {
root.KM = root.KM || {};
var km = root.KM;
deps = {
evaluateQualifiedIncoming: km.qualifiedIncoming && km.qualifiedIncoming.evaluateQualifiedIncoming,
calculateGap: km.core && km.core.supplyPlanningCalculations && km.core.supplyPlanningCalculations.calculateGap
};
km.lineRuntime = factory(deps);
}
})(this, function (deps) {
'use strict';

var evaluateQualifiedIncoming = deps && deps.evaluateQualifiedIncoming;
var calculateGap = deps && deps.calculateGap;

function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function normToken(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }
function optStr(v) { if (v === null || v === undefined) return null; var s = String(v).trim(); return s === '' ? null : s; }

function requireObject(v, name) {
if (!isObject(v)) throw new TypeError('runSupplyPlanningLine: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
return v;
}
function requireArray(v, name) {
if (!Array.isArray(v)) throw new TypeError('runSupplyPlanningLine: ' + name + ' must be an array (got ' + describe(v) + ')');
return v;
}
function requireNonBlankString(v, name) {
if (v === null || v === undefined) throw new RangeError('runSupplyPlanningLine: ' + name + ' is required (got ' + describe(v) + ')');
if (typeof v !== 'string') throw new TypeError('runSupplyPlanningLine: ' + name + ' must be a string (got ' + describe(v) + ')');
if (v.trim() === '') throw new RangeError('runSupplyPlanningLine: ' + name + ' must be a non-empty string');
return v.trim();
}


function requireQty(v, name) {
if (typeof v !== 'number') throw new TypeError('runSupplyPlanningLine: ' + name + ' must be a number (got ' + describe(v) + ')');
if (!isFinite(v)) throw new RangeError('runSupplyPlanningLine: ' + name + ' must be finite (got ' + v + ')');
if (v < 0) throw new RangeError('runSupplyPlanningLine: ' + name + ' must be non-negative (got ' + v + ')');
return v;
}



function scopeConflict(candVal, scopeVal, exact) {
if (isBlank(candVal)) return false;
return exact ? (String(candVal).trim() !== String(scopeVal).trim()) : (normToken(candVal) !== normToken(scopeVal));
}






function runSupplyPlanningLine(input) {
if (typeof evaluateQualifiedIncoming !== 'function' || typeof calculateGap !== 'function') {
throw new Error('runSupplyPlanningLine: required dependencies (evaluateQualifiedIncoming, calculateGap) are not available');
}


requireObject(input, 'input');
var lineScope = requireObject(input.lineScope, 'input.lineScope');
var scCompany = requireNonBlankString(lineScope.company, 'input.lineScope.company');
var scSku = requireNonBlankString(lineScope.sku, 'input.lineScope.sku');
var scDest = requireNonBlankString(lineScope.destinationWarehouseId, 'input.lineScope.destinationWarehouseId');
var scCountry = optStr(lineScope.country);
var scMarketplace = optStr(lineScope.marketplace);

var demand = requireQty(input.demand, 'input.demand');
var destinationCurrentStock = requireQty(input.destinationCurrentStock, 'input.destinationCurrentStock');
var timelyApprovedCommittedSupply = requireQty(input.timelyApprovedCommittedSupply, 'input.timelyApprovedCommittedSupply');

var kmShipmentResults = requireArray(input.kmShipmentResults, 'input.kmShipmentResults');
var externalAuthorityResults = input.externalAuthorityResults === undefined || input.externalAuthorityResults === null
? [] : requireArray(input.externalAuthorityResults, 'input.externalAuthorityResults');
var postedToCurrentStockLineageKeys = input.postedToCurrentStockLineageKeys === undefined || input.postedToCurrentStockLineageKeys === null
? [] : requireArray(input.postedToCurrentStockLineageKeys, 'input.postedToCurrentStockLineageKeys');
var activeOtherBucketLineageKeys = input.activeOtherBucketLineageKeys === undefined || input.activeOtherBucketLineageKeys === null
? [] : requireArray(input.activeOtherBucketLineageKeys, 'input.activeOtherBucketLineageKeys');



kmShipmentResults.forEach(function (r, i) {
requireObject(r, 'input.kmShipmentResults[' + i + ']');
var c = requireObject(r.candidate, 'input.kmShipmentResults[' + i + '].candidate');
if (scopeConflict(c.company, scCompany, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] company out of line scope (dimension=company)');
if (scopeConflict(c.sku, scSku, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] sku out of line scope (dimension=sku)');
if (scopeConflict(c.destinationWarehouseId, scDest, true)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] destinationWarehouseId out of line scope (dimension=destinationWarehouseId)');
if (scCountry !== null && scopeConflict(c.country, scCountry, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] country out of line scope (dimension=country)');
if (scMarketplace !== null && scopeConflict(c.marketplace, scMarketplace, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] marketplace out of line scope (dimension=marketplace)');
});


var qualifiedIncomingResult = evaluateQualifiedIncoming({
requiredByDate: input.requiredByDate,
kmShipmentResults: kmShipmentResults,
externalAuthorityResults: externalAuthorityResults,
postedToCurrentStockLineageKeys: postedToCurrentStockLineageKeys,
activeOtherBucketLineageKeys: activeOtherBucketLineageKeys
});


var timelyQualifiedIncoming = qualifiedIncomingResult.qualifiedIncomingQuantity;


var calculatedGap = calculateGap({
demand: demand,
destinationCurrentStock: destinationCurrentStock,
timelyQualifiedIncoming: timelyQualifiedIncoming,
timelyApprovedCommittedSupply: timelyApprovedCommittedSupply
});



return {
runtimeType: 'SUPPLY_PLANNING_LINE',
lineScope: { company: scCompany, sku: scSku, destinationWarehouseId: scDest, country: scCountry, marketplace: scMarketplace },
requiredByDate: qualifiedIncomingResult.requiredByDate,
demand: demand,
destinationCurrentStock: destinationCurrentStock,
timelyApprovedCommittedSupply: timelyApprovedCommittedSupply,
timelyQualifiedIncoming: timelyQualifiedIncoming,
calculatedGap: calculatedGap,
qualifiedIncomingResult: qualifiedIncomingResult,
incomingBreakdown: {
timelyQualifiedIncoming: timelyQualifiedIncoming,
lateRiskQuantity: qualifiedIncomingResult.lateRiskQuantity,
excludedIncomingQuantity: qualifiedIncomingResult.excludedIncomingQuantity,
reviewIncomingQuantity: qualifiedIncomingResult.reviewIncomingQuantity,
externalObservedQuantity: qualifiedIncomingResult.externalObservedQuantity
},
sourceSummary: {
kmCandidateCount: qualifiedIncomingResult.kmCandidateCount,
deduplicatedKmCandidateCount: qualifiedIncomingResult.deduplicatedKmCandidateCount,
externalObservationCount: qualifiedIncomingResult.externalObservationCount,
linkedExternalEvidenceCount: qualifiedIncomingResult.linkedExternalEvidenceCount,
quarantinedExternalCount: qualifiedIncomingResult.quarantinedExternalCount,
adoptedExternalCount: qualifiedIncomingResult.adoptedExternalCount,
adoptionPendingCount: qualifiedIncomingResult.adoptionPendingCount
}
};
}

return { runSupplyPlanningLine: runSupplyPlanningLine };
});
__kmRegister("supply-planning-line-runtime", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;









(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.incomingAdapters = api;
}
})(this, function () {
'use strict';





var ELIGIBLE_STATUSES = { ready_to_ship: 1, shipped: 1, in_transit: 1, arrived: 1, partially_received: 1, partial_received: 1 };


var EXCLUSION_ORDER = [
'AUTHORITY_NOT_SUPPORTED', 'SOURCE_TYPE_NOT_SUPPORTED', 'DOMAIN_NOT_SUPPORTED',
'STATUS_NOT_ELIGIBLE',
'COMPANY_SCOPE_MISMATCH', 'SKU_SCOPE_MISMATCH', 'DESTINATION_SCOPE_MISMATCH',
'COUNTRY_SCOPE_MISMATCH', 'MARKETPLACE_SCOPE_MISMATCH',
'ZERO_REMAINING_QUANTITY', 'INVALID_REMAINING_QUANTITY'
];
var REVIEW_ORDER = ['MISSING_STATUS', 'UNKNOWN_STATUS', 'MISSING_COMPANY', 'MISSING_DESTINATION_IDENTITY', 'MISSING_ETA'];

var DEFINITE_EXCLUDED_STATUS = {
EXCLUDED_DRAFT: 1, EXCLUDED_ALREADY_RECEIVED: 1, EXCLUDED_TERMINAL: 1, EXCLUDED_CANCELLED: 1,
EXCLUDED_LEGACY_STATUS: 1, EXCLUDED_OPERATIONAL_ALERT: 1, EXCLUDED_EVENT_TOKEN: 1
};

function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
function optStr(v) { if (v === null || v === undefined) return null; var s = String(v).trim(); return s === '' ? null : s; }
function normToken(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }

function requireObject(v, name) {
if (v === null || typeof v !== 'object' || Array.isArray(v)) {
throw new TypeError('adaptKmShipmentIncomingCandidate: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
}
return v;
}

function requireStringField(v, name) {
if (v === null || v === undefined) throw new RangeError('adaptKmShipmentIncomingCandidate: ' + name + ' is required (got ' + describe(v) + ')');
if (typeof v !== 'string') throw new TypeError('adaptKmShipmentIncomingCandidate: ' + name + ' must be a string (got ' + describe(v) + ')');
var t = v.trim();
if (t === '') throw new RangeError('adaptKmShipmentIncomingCandidate: ' + name + ' must be a non-empty string');
return t;
}


function classifyStatus(raw) {
if (raw === null || raw === undefined) return 'MISSING_STATUS';
var s = String(raw).trim().toLowerCase();
if (s === '') return 'MISSING_STATUS';
if (ELIGIBLE_STATUSES[s]) return 'ELIGIBLE_INCOMING_STATUS';
if (s === 'draft') return 'EXCLUDED_DRAFT';
if (s === 'received') return 'EXCLUDED_ALREADY_RECEIVED';
if (s === 'closed') return 'EXCLUDED_TERMINAL';
if (s === 'cancelled' || s === 'canceled') return 'EXCLUDED_CANCELLED';
if (s === 'planned' || s === 'completed') return 'EXCLUDED_LEGACY_STATUS';
if (s === 'stuck') return 'EXCLUDED_OPERATIONAL_ALERT';
if (s === 'delivered') return 'EXCLUDED_EVENT_TOKEN';
return 'UNKNOWN_STATUS';
}

function orderUnique(order, set) {
var out = [];
for (var i = 0; i < order.length; i++) { if (set[order[i]]) out.push(order[i]); }
return out;
}







function adaptKmShipmentIncomingCandidate(input) {
requireObject(input, 'input');
var candidate = requireObject(input.candidate, 'input.candidate');
var scope = requireObject(input.scope, 'input.scope');


requireStringField(candidate.supplyCandidateId, 'input.candidate.supplyCandidateId');
requireStringField(candidate.sourceLineRef, 'input.candidate.sourceLineRef');


var scCompany = requireStringField(scope.company, 'input.scope.company');
var scSku = requireStringField(scope.sku, 'input.scope.sku');
var scDest = requireStringField(scope.destinationWarehouseId, 'input.scope.destinationWarehouseId');
var scCountry = optStr(scope.country);
var scMarketplace = optStr(scope.marketplace);

var exSet = {}, rvSet = {};
function excl(t) { exSet[t] = 1; }
function review(t) { rvSet[t] = 1; }


var authorityOk = candidate.authorityType === 'KM_CANONICAL';
var sourceOk = candidate.sourceType === 'KM_SHIPMENT_LINE';
var domainOk = candidate.supplyDomain === 'KM_3PL_OVERSEAS';
if (!authorityOk) excl('AUTHORITY_NOT_SUPPORTED');
if (!sourceOk) excl('SOURCE_TYPE_NOT_SUPPORTED');
if (!domainOk) excl('DOMAIN_NOT_SUPPORTED');
var typeAccepted = authorityOk && sourceOk && domainOk;


var statusClass = classifyStatus(candidate.status);
var statusEligible = statusClass === 'ELIGIBLE_INCOMING_STATUS';
if (DEFINITE_EXCLUDED_STATUS[statusClass]) excl('STATUS_NOT_ELIGIBLE');
if (statusClass === 'MISSING_STATUS') review('MISSING_STATUS');
if (statusClass === 'UNKNOWN_STATUS') review('UNKNOWN_STATUS');


var scopeEligible = true;
if (candidate.company === null || candidate.company === undefined) { review('MISSING_COMPANY'); scopeEligible = false; }
else if (normToken(candidate.company) !== normToken(scCompany)) { excl('COMPANY_SCOPE_MISMATCH'); scopeEligible = false; }

if (normToken(candidate.sku) !== normToken(scSku)) { excl('SKU_SCOPE_MISMATCH'); scopeEligible = false; }

if (isBlank(candidate.destinationWarehouseId) || candidate.destinationIdentitySource === 'MISSING') { review('MISSING_DESTINATION_IDENTITY'); scopeEligible = false; }
else if (String(candidate.destinationWarehouseId).trim() !== scDest) { excl('DESTINATION_SCOPE_MISMATCH'); scopeEligible = false; }

if (scCountry !== null) {
if (candidate.country === null || candidate.country === undefined || normToken(candidate.country) !== normToken(scCountry)) { excl('COUNTRY_SCOPE_MISMATCH'); scopeEligible = false; }
}
if (scMarketplace !== null) {
if (candidate.marketplace === null || candidate.marketplace === undefined || normToken(candidate.marketplace) !== normToken(scMarketplace)) { excl('MARKETPLACE_SCOPE_MISMATCH'); scopeEligible = false; }
}


var qty = candidate.quantityRemaining;
var quantityEligible = false;
if (typeof qty !== 'number' || !isFinite(qty)) excl('INVALID_REMAINING_QUANTITY');
else if (qty > 0) quantityEligible = true;
else if (qty === 0) excl('ZERO_REMAINING_QUANTITY');
else excl('INVALID_REMAINING_QUANTITY');


var etaPresent = !isBlank(candidate.eta);
if (!etaPresent) review('MISSING_ETA');

var sourceEligible = typeAccepted && statusEligible && scopeEligible && quantityEligible && etaPresent;
var adapterEligibleQuantity = sourceEligible ? qty : 0;

return {




candidate: {
supplyCandidateId: candidate.supplyCandidateId,
sourceRef: candidate.sourceRef,
sourceLineRef: candidate.sourceLineRef,
lineageKey: candidate.lineageKey,
linkedShipmentId: candidate.linkedShipmentId,
linkedShipmentLineId: candidate.linkedShipmentLineId,
linkedPurchaseOrderLineId: candidate.linkedPurchaseOrderLineId,
linkedShippingPlanLineId: candidate.linkedShippingPlanLineId,
company: candidate.company,
country: candidate.country,
marketplace: candidate.marketplace,
sku: candidate.sku,
siteSku: candidate.siteSku,
status: candidate.status,
eta: candidate.eta,
sourceUpdatedAt: candidate.sourceUpdatedAt,
destinationWarehouseId: candidate.destinationWarehouseId,
destinationIdentitySource: candidate.destinationIdentitySource,
quantityRemaining: candidate.quantityRemaining,
authorityType: candidate.authorityType,
sourceType: candidate.sourceType,
supplyDomain: candidate.supplyDomain
},
adapterType: 'KM_SHIPMENT_INCOMING',
sourceEligible: sourceEligible,
statusEligible: statusEligible,
scopeEligible: scopeEligible,
quantityEligible: quantityEligible,
etaPresent: etaPresent,
adapterEligibleQuantity: adapterEligibleQuantity,
statusClass: statusClass,
exclusionReasons: orderUnique(EXCLUSION_ORDER, exSet),
reviewReasons: orderUnique(REVIEW_ORDER, rvSet)
};
}

return { adaptKmShipmentIncomingCandidate: adaptKmShipmentIncomingCandidate };
});
__kmRegister("supply-planning-incoming-adapters", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;




















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.externalIncomingAdapters = api;
}
})(this, function () {
'use strict';


var SUPPORTED_SOURCE_TYPES = { EXTERNAL_INBOUND_RECORD: 1, EXTERNAL_WMS_INBOUND: 1, EXTERNAL_OMS_INBOUND: 1 };
var SUPPORTED_DOMAIN = 'EXTERNAL_3PL_OVERSEAS';


var STATE_MAP = {
LINKED_EXTERNAL_EVIDENCE:      { cls: 'LINKED_EVIDENCE_ONLY',             excl: 'LINKED_EXTERNAL_EVIDENCE_ONLY' },
EXTERNAL_UNLINKED_QUARANTINED: { cls: 'QUARANTINED_UNLINKED',            excl: 'EXTERNAL_UNLINKED_QUARANTINED' },
ADOPTION_PENDING:              { cls: 'ADOPTION_REVIEW_PENDING',         excl: 'ADOPTION_PENDING' },
ADOPTED_TO_KM:                 { cls: 'ADOPTED_USE_KM_CANONICAL_RECORD', excl: 'ADOPTED_USE_KM_CANONICAL_RECORD' },
REJECTED_EXTERNAL_RECORD:      { cls: 'REJECTED',                        excl: 'REJECTED_EXTERNAL_RECORD' },
IGNORED_FOR_PLANNING:          { cls: 'IGNORED',                         excl: 'IGNORED_FOR_PLANNING' },
SUPERSEDED:                    { cls: 'SUPERSEDED',                      excl: 'SUPERSEDED_EXTERNAL_RECORD' },
REVERSED:                      { cls: 'REVERSED',                        excl: 'REVERSED_EXTERNAL_RECORD' }
};


var EXCLUSION_ORDER = [
'EXTERNAL_RECORD_NOT_PLANNING_AUTHORITY',
'SOURCE_TYPE_NOT_SUPPORTED', 'DOMAIN_NOT_SUPPORTED',
'LINKED_EXTERNAL_EVIDENCE_ONLY', 'EXTERNAL_UNLINKED_QUARANTINED', 'ADOPTION_PENDING',
'ADOPTED_USE_KM_CANONICAL_RECORD', 'REJECTED_EXTERNAL_RECORD', 'IGNORED_FOR_PLANNING',
'SUPERSEDED_EXTERNAL_RECORD', 'REVERSED_EXTERNAL_RECORD'
];
var REVIEW_ORDER = [
'EXTERNAL_IDENTITY_INCOMPLETE', 'MISSING_AUTHORITY_STATE', 'UNKNOWN_AUTHORITY_STATE',
'LINKAGE_MISSING', 'ADOPTED_KM_LINK_MISSING', 'QUARANTINE_LINKAGE_CONFLICT',
'INVALID_EXTERNAL_QUANTITY', 'MISSING_EXTERNAL_ETA', 'MISSING_EXTERNAL_SOURCE_TIMESTAMP',
'NEEDS_RECONCILIATION'
];


var NEEDS_RECON_TOKENS = { needs_reconciliation: 1, discrepancy: 1, mismatch: 1, reconcile: 1 };

function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
function normToken(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }

function requireObject(v, name) {
if (v === null || typeof v !== 'object' || Array.isArray(v)) {
throw new TypeError('adaptExternalIncomingAuthority: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
}
return v;
}

function requireStringField(v, name) {
if (v === null || v === undefined) throw new RangeError('adaptExternalIncomingAuthority: ' + name + ' is required (got ' + describe(v) + ')');
if (typeof v !== 'string') throw new TypeError('adaptExternalIncomingAuthority: ' + name + ' must be a string (got ' + describe(v) + ')');
var t = v.trim();
if (t === '') throw new RangeError('adaptExternalIncomingAuthority: ' + name + ' must be a non-empty string');
return t;
}


function classifyAuthorityState(raw) {
if (raw === null || raw === undefined) return { cls: 'MISSING_AUTHORITY_STATE', excl: null, known: false, missing: true };
var s = String(raw).trim();
if (s === '') return { cls: 'MISSING_AUTHORITY_STATE', excl: null, known: false, missing: true };
if (STATE_MAP[s]) return { cls: STATE_MAP[s].cls, excl: STATE_MAP[s].excl, known: true, missing: false };
return { cls: 'UNKNOWN_AUTHORITY_STATE', excl: null, known: false, missing: false };
}

function orderUnique(order, set) {
var out = [];
for (var i = 0; i < order.length; i++) { if (set[order[i]]) out.push(order[i]); }
return out;
}










function adaptExternalIncomingAuthority(input) {
requireObject(input, 'input');
var candidate = requireObject(input.candidate, 'input.candidate');


requireStringField(candidate.sku, 'input.candidate.sku');

var exSet = {}, rvSet = {};
function excl(t) { exSet[t] = 1; }
function review(t) { rvSet[t] = 1; }


excl('EXTERNAL_RECORD_NOT_PLANNING_AUTHORITY');


if (!SUPPORTED_SOURCE_TYPES[candidate.sourceType]) excl('SOURCE_TYPE_NOT_SUPPORTED');
if (candidate.supplyDomain !== SUPPORTED_DOMAIN) excl('DOMAIN_NOT_SUPPORTED');


var identityIncomplete =
isBlank(candidate.externalCandidateId) || isBlank(candidate.provider) ||
isBlank(candidate.externalAccountRef) || isBlank(candidate.externalOperationRef) ||
isBlank(candidate.externalLineRef);
if (identityIncomplete) review('EXTERNAL_IDENTITY_INCOMPLETE');


var st = classifyAuthorityState(candidate.authorityState);
var stateClass = st.cls;
if (st.excl) excl(st.excl);
if (st.missing) review('MISSING_AUTHORITY_STATE');
else if (!st.known) review('UNKNOWN_AUTHORITY_STATE');


var hasShipmentLink = !isBlank(candidate.linkedShipmentId);
var hasOperationLink = !isBlank(candidate.linkedOperationId);
var hasAnyLink = hasShipmentLink || hasOperationLink;
if (stateClass === 'LINKED_EVIDENCE_ONLY' && !hasAnyLink) review('LINKAGE_MISSING');
if (stateClass === 'ADOPTED_USE_KM_CANONICAL_RECORD' && !hasAnyLink) review('ADOPTED_KM_LINK_MISSING');
if (stateClass === 'QUARANTINED_UNLINKED' && hasAnyLink) review('QUARANTINE_LINKAGE_CONFLICT');


var rawQty = candidate.quantityObserved;
var observedQuantity = 0;
if (rawQty === null || rawQty === undefined) {

} else if (typeof rawQty === 'number' && isFinite(rawQty) && rawQty >= 0) {
observedQuantity = rawQty;
} else {
review('INVALID_EXTERNAL_QUANTITY');
}


if (isBlank(candidate.eta)) review('MISSING_EXTERNAL_ETA');
if (isBlank(candidate.sourceUpdatedAt)) review('MISSING_EXTERNAL_SOURCE_TIMESTAMP');


if (NEEDS_RECON_TOKENS[normToken(candidate.reconciliationState)] || NEEDS_RECON_TOKENS[normToken(candidate.reviewStatus)]) {
review('NEEDS_RECONCILIATION');
}

var linkedEvidence = stateClass === 'LINKED_EVIDENCE_ONLY';
var quarantined = stateClass === 'QUARANTINED_UNLINKED';
var adoptedToKm = stateClass === 'ADOPTED_USE_KM_CANONICAL_RECORD';

var reviewReasons = orderUnique(REVIEW_ORDER, rvSet);



var requiresHumanReview = reviewReasons.length > 0 ||
stateClass === 'QUARANTINED_UNLINKED' || stateClass === 'ADOPTION_REVIEW_PENDING' ||
stateClass === 'MISSING_AUTHORITY_STATE' || stateClass === 'UNKNOWN_AUTHORITY_STATE';

return {


candidate: {
externalCandidateId: candidate.externalCandidateId,
sourceType: candidate.sourceType,
supplyDomain: candidate.supplyDomain,
authorityState: candidate.authorityState,
provider: candidate.provider,
externalAccountRef: candidate.externalAccountRef,
externalOperationRef: candidate.externalOperationRef,
externalLineRef: candidate.externalLineRef,
company: candidate.company,
country: candidate.country,
marketplace: candidate.marketplace,
sku: candidate.sku,
siteSku: candidate.siteSku,
destinationWarehouseId: candidate.destinationWarehouseId,
quantityObserved: candidate.quantityObserved,
eta: candidate.eta,
sourceUpdatedAt: candidate.sourceUpdatedAt,
linkedShipmentId: candidate.linkedShipmentId,
linkedShipmentLineId: candidate.linkedShipmentLineId,
linkedOperationId: candidate.linkedOperationId,
reviewStatus: candidate.reviewStatus,
reconciliationState: candidate.reconciliationState
},
adapterType: 'EXTERNAL_INCOMING_AUTHORITY',
planningEligible: false,
adapterEligibleQuantity: 0,
observedQuantity: observedQuantity,
stateClass: stateClass,
linkedEvidence: linkedEvidence,
quarantined: quarantined,
adoptedToKm: adoptedToKm,
requiresHumanReview: requiresHumanReview,
exclusionReasons: orderUnique(EXCLUSION_ORDER, exSet),
reviewReasons: reviewReasons
};
}

return { adaptExternalIncomingAuthority: adaptExternalIncomingAuthority };
});
__kmRegister("supply-planning-external-incoming-adapters", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;











(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.supplyCandidates = api;
}
})(this, function () {
'use strict';

function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }

function isBlank(v) {
return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}


function optStr(v) {
if (v === null || v === undefined) return null;
var s = String(v).trim();
return s === '' ? null : s;
}



function requireIdField(v, name) {
if (v === null || v === undefined) {
throw new RangeError('buildKmShipmentSupplyCandidate: ' + name + ' is required (got ' + describe(v) + ')');
}
if (typeof v !== 'string') {
throw new TypeError('buildKmShipmentSupplyCandidate: ' + name + ' must be a string (got ' + describe(v) + ')');
}
var t = v.trim();
if (t === '') {
throw new RangeError('buildKmShipmentSupplyCandidate: ' + name + ' must be a non-empty string');
}
return t;
}

function requireObject(v, name) {
if (v === null || typeof v !== 'object' || Array.isArray(v)) {
throw new TypeError('buildKmShipmentSupplyCandidate: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
}
return v;
}




function resolveQuantity(canon, legacy) {
if (!isBlank(canon)) {
var n = parseFloat(canon);
if (isFinite(n) && n >= 0) return { value: n, invalid: false };
return { value: 0, invalid: true };
}
if (!isBlank(legacy)) {
var m = parseFloat(legacy);
if (isFinite(m) && m >= 0) return { value: m, invalid: false };
return { value: 0, invalid: true };
}
return { value: 0, invalid: false };
}




function resolveReceived(v) {
if (isBlank(v)) return { value: 0, invalid: false };
var n = parseFloat(v);
if (isFinite(n) && n >= 0) return { value: n, invalid: false };
return { value: 0, invalid: true };
}




function resolveDestination(canon, legacy) {
if (!isBlank(canon)) return { id: String(canon).trim(), source: 'CANONICAL_DESTINATION_WAREHOUSE_ID' };
if (!isBlank(legacy)) return { id: String(legacy).trim(), source: 'LEGACY_WAREHOUSE_ID_FALLBACK' };
return { id: null, source: 'MISSING' };
}






function buildKmShipmentSupplyCandidate(input) {
requireObject(input, 'input');
var shipment = requireObject(input.shipment, 'input.shipment');
var line = requireObject(input.line, 'input.line');


var shipmentId = requireIdField(shipment.shipmentId, 'input.shipment.shipmentId');
var shipmentLineId = requireIdField(line.shipmentLineId, 'input.line.shipmentLineId');
var sku = requireIdField(line.sku, 'input.line.sku');


var company = optStr(shipment.company);
var country = optStr(shipment.country);
var marketplace = optStr(shipment.marketplace);
var eta = optStr(shipment.eta);
var sourceUpdatedAt = optStr(shipment.sourceUpdatedAt);
var status = optStr(shipment.status);
var siteSku = optStr(line.siteSku);
var purchaseOrderLineId = optStr(line.purchaseOrderLineId);
var shippingPlanLineId = optStr(line.shippingPlanLineId);


var q = resolveQuantity(line.shipmentQty, line.legacyQty);
var dest = resolveDestination(shipment.destinationWarehouseId, shipment.legacyWarehouseId);






var recv = resolveReceived(line.shipmentReceivedQty);
var remaining = Math.max(0, q.value - recv.value);


var sourceRef = 'shipment:' + shipmentId;
var sourceLineRef = 'shipment:' + shipmentId + ':' + shipmentLineId;
var supplyCandidateId = sourceLineRef;
var lineageKey = sourceLineRef;


var reviewFlags = [];
if (company === null) reviewFlags.push('MISSING_COMPANY');
if (dest.source === 'MISSING') reviewFlags.push('MISSING_DESTINATION_IDENTITY');
if (q.invalid) reviewFlags.push('INVALID_QUANTITY');
if (recv.invalid) reviewFlags.push('INVALID_RECEIVED_QUANTITY');
if (recv.value > q.value) reviewFlags.push('RECEIVED_EXCEEDS_SHIPPED');
if (eta === null) reviewFlags.push('MISSING_ETA');
if (status === null) reviewFlags.push('MISSING_STATUS');

return {
supplyCandidateId: supplyCandidateId,
supplyDomain: 'KM_3PL_OVERSEAS',
supplyStage: 'FORMAL_SHIPMENT',
authorityType: 'KM_CANONICAL',
sourceType: 'KM_SHIPMENT_LINE',
sourceRef: sourceRef,
sourceLineRef: sourceLineRef,
lineageKey: lineageKey,
company: company,
country: country,
marketplace: marketplace,
sku: sku,
siteSku: siteSku,
destinationWarehouseId: dest.id,
destinationIdentitySource: dest.source,
quantityOriginal: q.value,
quantityReceived: recv.value,
quantityRemaining: remaining,
eta: eta,
sourceUpdatedAt: sourceUpdatedAt,
status: status,
linkedShipmentId: shipmentId,
linkedShipmentLineId: shipmentLineId,
linkedPurchaseOrderLineId: purchaseOrderLineId,
linkedShippingPlanLineId: shippingPlanLineId,
reviewFlags: reviewFlags
};
}

return { buildKmShipmentSupplyCandidate: buildKmShipmentSupplyCandidate };
});
__kmRegister("supply-planning-supply-candidates", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;
















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-supply-candidates.js') : (root.KMCAND || (root.KM && root.KM.supplyCandidates))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.shipmentLineSource = api; }
})(this, function (CAND) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nonEmpty(v) { return str(v).length > 0; }
function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }

function g(o, snake, camel) { if (has(o, snake)) return o[snake]; if (camel && has(o, camel)) return o[camel]; return undefined; }



function isMergedMarketplace(m) { var s = str(m).toLowerCase(); return s === '' || /multi|merged|mixed|combined/.test(s); }
function isSpecificReceiver(company, country, marketplace) {
return nonEmpty(company) && nonEmpty(country) && nonEmpty(marketplace) && !isMergedMarketplace(marketplace);
}











function resolveShipmentLineReceiver(input) {
input = input || {};
var line = input.shipmentLine || {}, shipment = input.shipment || {};
var planLineById = input.shippingPlanLineById || {}, planById = input.shippingPlanById || {};
function resolved(source, co, cy, mk) { return { status: 'RESOLVED', source: source, reason: null, company: co, country: cy, marketplace: mk }; }
function unresolved(reason) { return { status: 'UNRESOLVED', source: 'UNRESOLVED', reason: reason, company: '', country: '', marketplace: '' }; }

var planLineId = str(g(line, 'shipping_plan_line_id', 'shippingPlanLineId'));
var merged = Number(input.linkCount) >= 2 || lineageNamesOtherPlan(line, shipment);
if (merged && !planLineId) return unresolved('MERGED_LINE_LINEAGE_MISSING');
if (planLineId) {
var pl = planLineById[planLineId];
if (!pl) return unresolved('LINEAGE_PLAN_LINE_NOT_FOUND');
var plSku = str(g(pl, 'sku', 'sku')), lnSku = str(g(line, 'sku', 'sku'));
if (plSku && lnSku && plSku !== lnSku) return unresolved('LINEAGE_SKU_MISMATCH');
var plan = planById[str(g(pl, 'shipping_plan_id', 'shippingPlanId'))];
if (!plan) return unresolved('LINEAGE_PLAN_NOT_FOUND');
var co = str(g(plan, 'company', 'company')), cy = str(g(plan, 'country', 'country')), mk = str(g(plan, 'marketplace', 'marketplace'));
if (!isSpecificReceiver(co, cy, mk)) return unresolved('LINEAGE_RECEIVER_NOT_SPECIFIC');
if (merged) {
var lg = mergedLineage(line, shipment, pl, plan, planLineId, co);
if (lg.reason) return unresolved(lg.reason);
var rm = resolved('FROZEN_SHIPPING_PLAN_LINE', co, cy, mk); rm.destinationWarehouseId = lg.dest; return rm;
}
return resolved('FROZEN_SHIPPING_PLAN_LINE', co, cy, mk);
}


var hco = str(g(shipment, 'company', 'company')), hcy = str(g(shipment, 'country', 'country')), hmk = str(g(shipment, 'marketplace', 'marketplace'));
if (isSpecificReceiver(hco, hcy, hmk)) return resolved('SHIPMENT_HEADER', hco, hcy, hmk);
return unresolved('HEADER_MULTI_OR_MISSING');
}


var XCO_SIG_FIELDS = ['v', 'plan_id', 'plan_line_id', 'company', 'country', 'marketplace', 'site_sku', 'sku', 'qty', 'dest'];
var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
function utf8Bytes(s) {
var out = [];
for (var i = 0; i < s.length; i++) {
var c = s.charCodeAt(i);
if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { var d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
if (c < 0x80) out.push(c);
else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
}
return out;
}
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
function sha256Hex(bytes) {
var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
var bits = bytes.length * 8, m = bytes.slice(), w = new Array(64), off, t;
m.push(0x80); while (m.length % 64 !== 56) m.push(0);
m.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
for (off = 0; off < m.length; off += 64) {
for (t = 0; t < 16; t++) w[t] = (m[off + 4 * t] << 24) | (m[off + 4 * t + 1] << 16) | (m[off + 4 * t + 2] << 8) | m[off + 4 * t + 3];
for (t = 16; t < 64; t++) {
var x = w[t - 15], y = w[t - 2];
w[t] = (w[t - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + w[t - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) | 0;
}
var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], gg = H[6], hh = H[7];
for (t = 0; t < 64; t++) {
var t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & gg)) + K256[t] + w[t]) | 0;
var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
hh = gg; gg = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
}
H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + gg) | 0; H[7] = (H[7] + hh) | 0;
}
return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
}
function lineageSig(o, shipmentId) {
var text = XCO_SIG_FIELDS.map(function (k) { return String(o[k] === undefined || o[k] === null ? '' : o[k]); }).concat([String(shipmentId)]).join('\u001f');
return sha256Hex(utf8Bytes(text)).slice(0, 16);
}
function parseLineageMarker(note) {
var m = String(note === undefined || note === null ? '' : note).trim().match(/(?:^|\n)\[SC13_SOURCE:([^\]]+)\]/);
if (!m) return null;
try { var o = JSON.parse(decodeURIComponent(m[1])); return o && typeof o === 'object' ? o : { unreadable: true }; } catch (e) { return { unreadable: true }; }
}
function assignedDest(line, shipment) {
var a = str(g(line, 'note', 'note')).match(/\[SC13_ASSIGN:[^\]\r\n]*\]/g) || [];
if (!a.length) return '';
var d = ''; try { d = decodeURIComponent(a[a.length - 1].slice('[SC13_ASSIGN:'.length).split(':')[0]); } catch (e) { return ''; }
return d && d === str(g(shipment, 'destination_warehouse_id', 'destinationWarehouseId')) ? d : '';
}
function lineRemoved(line) {
var st = g(line, 'line_status', 'lineStatus');
if (st !== undefined && st !== null && ['', 'active', 'removed'].indexOf(str(st)) < 0) return 'INVALID';
return (str(st) === 'removed' || /(?:^|\n)\[SC13_REMOVED:/.test(str(g(line, 'note', 'note')))) ? 'REMOVED' : '';
}
function lineageNamesOtherPlan(line, shipment) {
var m = parseLineageMarker(g(line, 'note', 'note')), hp = str(g(shipment, 'shipping_plan_id', 'shippingPlanId'));
if (m && m.unreadable) return true;
return !!(m && str(m.plan_id) && hp && str(m.plan_id) !== hp);
}
function mergedLineage(line, shipment, pl, plan, planLineId, co) {
var mkr = parseLineageMarker(g(line, 'note', 'note'));
if (!mkr) return { reason: 'MERGED_LINE_LINEAGE_MISSING' };
if (mkr.unreadable) return { reason: 'MERGED_LINE_LINEAGE_UNREADABLE' };
if (mkr.v !== 2) return { reason: 'MERGED_LINE_LINEAGE_LEGACY' };
var sid = str(g(shipment, 'shipment_id', 'shipmentId'));
if (!sid || typeof mkr.sig !== 'string' || mkr.sig !== lineageSig(mkr, sid)) return { reason: 'MERGED_LINE_LINEAGE_TAMPERED' };
var planDest = g(plan, 'destination_warehouse_id', 'destinationWarehouseId'), qty = g(line, 'shipment_qty', 'shipmentQty');
if (planDest === undefined || qty === undefined || str(qty) === '') return { reason: 'MERGED_LINE_SOURCE_UNVERIFIABLE' };
var plMk = g(pl, 'marketplace', 'marketplace'), mk2 = str(plMk) || str(g(plan, 'marketplace', 'marketplace'));
if (str(mkr.plan_line_id) !== planLineId || str(mkr.plan_id) !== str(g(pl, 'shipping_plan_id', 'shippingPlanId')) || str(mkr.company) !== co ||
str(mkr.country) !== str(g(plan, 'country', 'country')) || str(mkr.marketplace) !== mk2 || str(mkr.site_sku) !== str(g(pl, 'site_sku', 'siteSku')) ||
str(mkr.sku) !== str(g(line, 'sku', 'sku')) || str(mkr.dest) !== str(planDest) || Number(qty) !== Number(mkr.qty)) return { reason: 'MERGED_LINE_SOURCE_CHANGED' };
var hasAssign = /\[SC13_ASSIGN:/.test(str(g(line, 'note', 'note'))), dest = hasAssign ? assignedDest(line, shipment) : str(mkr.dest);
if (hasAssign && !dest) return { reason: 'MERGED_LINE_DEST_CONTRADICTS_SHIPMENT' };
if (!dest) return { reason: 'MERGED_LINE_LINEAGE_DEST_MISSING' };
return { reason: null, dest: dest };
}


function shipmentLinkCountsFromRows(rows) {
var by = {}, out = {};
(rows || []).forEach(function (r) { if (!isObj(r)) return; var s = str(g(r, 'shipment_id', 'shipmentId')), p = str(g(r, 'shipping_plan_id', 'shippingPlanId')); if (!s || !p) return; (by[s] = by[s] || {})[p] = 1; });
Object.keys(by).forEach(function (s) { out[s] = Object.keys(by[s]).length; });
return out;
}
function indexBy(rows, snake, camel) {
var m = {};
(rows || []).forEach(function (r) { if (!isObj(r)) return; var k = str(g(r, snake, camel)); if (k && !m[k]) m[k] = r; });
return m;
}
















function isDisplayOnlyOpening(shipment) {
return str(g(shipment, 'record_origin', 'recordOrigin')) === 'IMPORT_HISTORICAL' && str(g(shipment, 'opening_supply_mode', 'openingSupplyMode')).toUpperCase() === 'DISPLAY_ONLY';
}



function isUncountedOpening(shipment) {
var mode = str(g(shipment, 'opening_supply_mode', 'openingSupplyMode')).toUpperCase();
return str(g(shipment, 'record_origin', 'recordOrigin')) === 'IMPORT_HISTORICAL' && mode !== '' && mode !== 'COUNTED';
}
function buildShipmentLineCandidates(input) {
input = input || {};
var lines = input.shipmentLines || [];
var shipmentById = input.shipmentById || indexBy(input.shipments, 'shipment_id', 'shipmentId');
var planLineById = input.shippingPlanLineById || indexBy(input.shippingPlanLines, 'shipping_plan_line_id', 'shippingPlanLineId');
var planById = input.shippingPlanById || indexBy(input.shippingPlans, 'shipping_plan_id', 'shippingPlanId');
var linkCountById = input.shipmentLinkCountById || null;
var dMerged = {};
lines.forEach(function (l) {
if (!isObj(l)) return; var sid0 = str(g(l, 'shipment_id', 'shipmentId')), sh0 = shipmentById[sid0]; if (!sh0) return;
var hp0 = str(g(sh0, 'shipping_plan_id', 'shippingPlanId')), m0 = parseLineageMarker(g(l, 'note', 'note'));
if (m0 && (m0.unreadable || (str(m0.plan_id) && hp0 && str(m0.plan_id) !== hp0))) dMerged[sid0] = dMerged[sid0] || 'LINEAGE_MARKER';
var pl0 = planLineById[str(g(l, 'shipping_plan_line_id', 'shippingPlanLineId'))];
if (pl0 && hp0 && str(g(pl0, 'shipping_plan_id', 'shippingPlanId')) !== hp0) dMerged[sid0] = dMerged[sid0] || 'PLAN_LINE_OF_ANOTHER_PLAN';
if (/\[SC13_(?:DONE:(?!register-)|PENDING:|UNLINKED:)/.test(str(g(sh0, 'note', 'note')))) dMerged[sid0] = dMerged[sid0] || 'HEADER_MERGE_RECORD';
});

var shipmentInputs = [], candidates = [], issues = [], displayOnlyExcluded = [], unfinishedOpeningExcluded = [];
for (var i = 0; i < lines.length; i++) {
var ln = lines[i]; if (!isObj(ln)) { issues.push({ i: i, reason: 'MALFORMED_LINE' }); continue; }
var shipmentId = str(g(ln, 'shipment_id', 'shipmentId'));
var shipment = shipmentById[shipmentId];
if (!shipment) { issues.push({ i: i, reason: 'SHIPMENT_NOT_FOUND:' + shipmentId }); continue; }


var siteDisplaySupply = input.includeDisplayOnlyOpening === true && isDisplayOnlyOpening(shipment);
if (isDisplayOnlyOpening(shipment) && !siteDisplaySupply) { displayOnlyExcluded.push({ i: i, shipmentId: shipmentId, shipmentLineId: str(g(ln, 'shipment_line_id', 'shipmentLineId')) }); continue; }
if (isUncountedOpening(shipment) && !siteDisplaySupply) { unfinishedOpeningExcluded.push({ i: i, shipmentId: shipmentId, mode: str(g(shipment, 'opening_supply_mode', 'openingSupplyMode')) }); continue; }
var lrm_ = lineRemoved(ln); if (lrm_) { issues.push({ i: i, reason: lrm_ === 'INVALID' ? 'LINE_STATUS_INVALID' : 'LINE_REMOVED' }); continue; }

var mergedShip = (!!linkCountById && Number(linkCountById[shipmentId]) >= 2) || !!dMerged[shipmentId];
var rcv = resolveShipmentLineReceiver({ shipmentLine: ln, shipment: shipment, shippingPlanLineById: planLineById, shippingPlanById: planById, linkCount: mergedShip ? Math.max(2, Number(linkCountById && linkCountById[shipmentId]) || 0) : undefined });



var shipObj = {
shipmentId: nonEmpty(shipmentId) ? shipmentId : undefined,
company: nonEmpty(rcv.company) ? rcv.company : undefined,
country: nonEmpty(rcv.country) ? rcv.country : undefined,
marketplace: nonEmpty(rcv.marketplace) ? rcv.marketplace : undefined,
destinationWarehouseId: (mergedShip || lineageNamesOtherPlan(ln, shipment)) ? (nonEmpty(rcv.destinationWarehouseId) ? str(rcv.destinationWarehouseId) : undefined) : (nonEmpty(g(shipment, 'destination_warehouse_id', 'destinationWarehouseId')) ? str(g(shipment, 'destination_warehouse_id', 'destinationWarehouseId')) : undefined),
legacyWarehouseId: nonEmpty(g(shipment, 'warehouse_id', 'warehouseId')) ? str(g(shipment, 'warehouse_id', 'warehouseId')) : undefined,
eta: has(shipment, 'eta') ? shipment.eta : g(shipment, 'eta', 'eta'),
status: has(shipment, 'status') ? shipment.status : g(shipment, 'status', 'status'),
sourceUpdatedAt: nonEmpty(g(shipment, 'source_data_as_of', 'sourceUpdatedAt')) ? str(g(shipment, 'source_data_as_of', 'sourceUpdatedAt')) : undefined
};
var lineObj = {
shipmentLineId: nonEmpty(g(ln, 'shipment_line_id', 'shipmentLineId')) ? str(g(ln, 'shipment_line_id', 'shipmentLineId')) : undefined,
sku: nonEmpty(g(ln, 'sku', 'sku')) ? str(g(ln, 'sku', 'sku')) : undefined,
shipmentQty: has(ln, 'shipment_qty') ? ln.shipment_qty : g(ln, 'shipment_qty', 'shipmentQty'),
legacyQty: has(ln, 'qty') ? ln.qty : g(ln, 'qty', 'legacyQty'),
shipmentReceivedQty: has(ln, 'shipment_received_qty') ? ln.shipment_received_qty : g(ln, 'shipment_received_qty', 'shipmentReceivedQty'),
siteSku: nonEmpty(g(ln, 'site_sku', 'siteSku')) ? str(g(ln, 'site_sku', 'siteSku')) : undefined,
shippingPlanLineId: nonEmpty(g(ln, 'shipping_plan_line_id', 'shippingPlanLineId')) ? str(g(ln, 'shipping_plan_line_id', 'shippingPlanLineId')) : undefined
};

var shipInput = { shipment: shipObj, line: lineObj };
var built = null;
try { built = CAND.buildKmShipmentSupplyCandidate(shipInput); }
catch (e) { issues.push({ i: i, reason: 'ADAPT_FAILED:' + (e && e.message ? e.message : e) }); continue; }


built.receiverResolutionSource = rcv.source;
built.receiverResolutionStatus = rcv.status;
built.receiverResolutionReason = rcv.reason;

shipmentInputs.push(shipInput);
candidates.push({
candidate: built, resolution: rcv, shipmentStatus: str(g(shipment, 'status', 'status')),
headerScope: { company: str(g(shipment, 'company', 'company')), country: str(g(shipment, 'country', 'country')), marketplace: str(g(shipment, 'marketplace', 'marketplace')) }
});
}
return { shipmentInputs: shipmentInputs, candidates: candidates, issues: issues, displayOnlyExcluded: displayOnlyExcluded, unfinishedOpeningExcluded: unfinishedOpeningExcluded };
}






function toMarketplaceIncomingCandidate(entry) {
var c = (entry && entry.candidate) || {};
return {
destinationType: 'MARKETPLACE',
company: str(c.company), country: str(c.country), marketplace: str(c.marketplace),
sku: str(c.sku), status: c.status, eta: c.eta,
quantity: c.quantityRemaining, quantityRemaining: c.quantityRemaining,
ref: str(c.sourceLineRef), shipmentId: str(c.linkedShipmentId), lineageKey: str(c.lineageKey),
supplyCandidateId: str(c.supplyCandidateId), shipmentLineId: str(c.linkedShipmentLineId),
shippingPlanLineId: str(c.linkedShippingPlanLineId),
receiverResolutionStatus: c.receiverResolutionStatus, receiverResolutionSource: c.receiverResolutionSource
};
}

return {
resolveShipmentLineReceiver: resolveShipmentLineReceiver,
buildShipmentLineCandidates: buildShipmentLineCandidates,
isDisplayOnlyOpening: isDisplayOnlyOpening,
isUncountedOpening: isUncountedOpening,
toMarketplaceIncomingCandidate: toMarketplaceIncomingCandidate,
isSpecificReceiver: isSpecificReceiver,
isMergedMarketplace: isMergedMarketplace
, lineageSig: lineageSig, parseLineageMarker: parseLineageMarker
, shipmentLinkCountsFromRows: shipmentLinkCountsFromRows
};
});





















__kmRegister("supply-planning-shipment-line-source", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;




















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.persistence = api;
}
})(this, function () {
'use strict';


var REC_TYPES = { WEEKLY_SHIPPING: 1, MONTHLY_ORDER: 1 };
var MODES = { SCHEDULED_REFRESH: 1, MANUAL_REGENERATE: 1 };
var ACTIVE_STATUSES = { draft: 1, site_confirmed: 1 };

var STAGES = ['RUN_METADATA', 'HEADER', 'LINES', 'RECONCILE', 'LINEAGE', 'TOTALS', 'COMPLETED'];


function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function aType(cond, msg) { if (!cond) throw new TypeError(msg); }
function aRange(cond, msg) { if (!cond) throw new RangeError(msg); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function stageIdx(name) { return STAGES.indexOf(name); }

function sortedScope(scope) {
var out = {}; Object.keys(scope).sort().forEach(function (k) { out[k] = scope[k]; }); return out;
}
function scopeKey(scope) {
var s = sortedScope(scope);
return Object.keys(s).map(function (k) { return k + '=' + String(s[k]); }).join('|');
}
function activeKeyOf(type, cycle, scope) {




var sc = scope;
if (scope && Object.prototype.hasOwnProperty.call(scope, 'planning_cycle')) {
sc = {}; for (var k in scope) if (scope.hasOwnProperty(k) && k !== 'planning_cycle') sc[k] = scope[k];
}
return type + '::' + cycle + '::' + scopeKey(sc);
}
function draftIdOf(activeKey) { return 'RD::' + activeKey; }
function runIdOf(draftId, version) { return 'RUN::' + draftId + '::v' + version; }
function lineIdOf(draftId, lineKey) { return 'RL::' + draftId + '::' + lineKey; }

function findDraft(store, draftId) { for (var i = 0; i < store.drafts.length; i++) if (store.drafts[i].draftId === draftId) return store.drafts[i]; return null; }
function findRun(store, runId) { for (var i = 0; i < store.runs.length; i++) if (store.runs[i].calculationRunId === runId) return store.runs[i]; return null; }
function findLine(store, lineId) { for (var i = 0; i < store.lines.length; i++) if (store.lines[i].lineId === lineId) return store.lines[i]; return null; }
function draftLines(store, draftId) { return store.lines.filter(function (l) { return l.draftId === draftId; }); }

function normStore(store) {
var s = clone(store) || {};
s.drafts = s.drafts || []; s.lines = s.lines || []; s.runs = s.runs || [];
return s;
}
function createStore() { return { drafts: [], lines: [], runs: [] }; }


function validateScopeQuery(q) {
aType(isObj(q), 'query must be an object');
aRange(REC_TYPES[q.recommendationType] === 1, 'unknown recommendationType (expect WEEKLY_SHIPPING | MONTHLY_ORDER)');
aType(typeof q.planningCycle === 'string' && q.planningCycle.length > 0, 'planningCycle must be a non-empty string');
aType(isObj(q.businessScope), 'businessScope must be an object');
}
function validateLines(lines) {
aType(Array.isArray(lines), 'recommendedLines must be an array');
lines.forEach(function (l, i) {
aType(isObj(l), 'recommendedLines[' + i + '] must be an object');
aType(typeof l.lineKey === 'string' && l.lineKey.length > 0, 'recommendedLines[' + i + '].lineKey must be a non-empty string');
if (l.lineState === 'BLOCKED') {
aType(typeof l.reason === 'string' && l.reason.length > 0, 'recommendedLines[' + i + '] BLOCKED requires a reason token');
} else {
aRange(l.lineState === undefined || l.lineState === 'OK', 'recommendedLines[' + i + '].lineState must be "OK" | "BLOCKED"');
aType(typeof l.recommendedQty === 'number', 'recommendedLines[' + i + '].recommendedQty must be a number');
aRange(isFinite(l.recommendedQty) && l.recommendedQty >= 0, 'recommendedLines[' + i + '].recommendedQty must be finite ≥ 0');
}
});

var seen = {};
lines.forEach(function (l) { aRange(seen[l.lineKey] !== 1, 'duplicate lineKey in recommendedLines: ' + l.lineKey); seen[l.lineKey] = 1; });
}


function resolveActiveDraft(store, query) {
validateScopeQuery(query);
var s = normStore(store);
var ak = activeKeyOf(query.recommendationType, query.planningCycle, query.businessScope);
var matches = s.drafts.filter(function (d) { return d.activeKey === ak && ACTIVE_STATUSES[d.status] === 1; });
if (matches.length === 0) return { status: 'CREATE', activeKey: ak, draftId: draftIdOf(ak), draft: null };
if (matches.length === 1) return { status: 'REUSE', activeKey: ak, draftId: draftIdOf(ak), draft: clone(matches[0]) };

return { status: 'BLOCKED_CONFLICT', activeKey: ak, draftId: null, matchCount: matches.length, draft: null };
}

function hasUserEdits(store, draftId) {
return draftLines(store, draftId).some(function (l) {
return l.userEdited === true && l.lineStatus !== 'SUPERSEDED' && l.lineStatus !== 'SUPERSEDED_USER_REVIEW';
});
}


function execStage(store, run, stage, counts) {
if (stage === 'RUN_METADATA') {

run.status = 'RUNNING';
return;
}
if (stage === 'HEADER') {
var d = findDraft(store, run.draftId);
if (!d) {
store.drafts.push({
draftId: run.draftId, activeKey: run.activeKey, recommendationType: run.recommendationType,
planningCycle: run.planningCycle, businessScope: clone(run.businessScope), draftVersion: run.draftVersion,
status: 'draft', calculationRunId: run.calculationRunId, formulaVersion: run.formulaVersion,
sourceDataAsOf: run.sourceDataAsOf, totals: null
});
counts.created++;
} else {
d.draftVersion = run.draftVersion; d.calculationRunId = run.calculationRunId;
d.formulaVersion = run.formulaVersion; d.sourceDataAsOf = run.sourceDataAsOf;
if (ACTIVE_STATUSES[d.status] !== 1) {  }
counts.updated++;
}
return;
}
if (stage === 'LINES') {
run.plannedLines.forEach(function (pl) {
var lineId = lineIdOf(run.draftId, pl.lineKey);
var line = findLine(store, lineId);
var blocked = pl.lineState === 'BLOCKED';
if (!line) {
store.lines.push({
lineId: lineId, draftId: run.draftId, lineKey: pl.lineKey,
recommendedQty: blocked ? null : pl.recommendedQty,


userQty: blocked ? null : (typeof pl.userQty === 'number' && isFinite(pl.userQty) ? pl.userQty : pl.recommendedQty),
userEdited: false,
lineStatus: blocked ? 'BLOCKED' : 'ACTIVE',
reason: blocked ? pl.reason : null,
demandKey: pl.demandKey !== undefined ? pl.demandKey : null,
calculationRunId: run.calculationRunId
});
if (blocked) counts.blocked++; else counts.created++;
return;
}

if (blocked) {
line.lineStatus = 'BLOCKED'; line.reason = pl.reason; line.recommendedQty = null;
counts.blocked++;
} else if (run.action === 'REFRESH') {

if (line.lineStatus === 'BLOCKED') { line.lineStatus = 'ACTIVE'; line.reason = null; }
counts.skipped++;
} else {
line.recommendedQty = pl.recommendedQty;
if (run.reInitUserQty === true) { line.userQty = (typeof pl.userQty === 'number' && isFinite(pl.userQty) ? pl.userQty : pl.recommendedQty); line.userEdited = false; }
line.lineStatus = 'ACTIVE'; line.reason = null;
counts.updated++;
}
line.calculationRunId = run.calculationRunId;
});
return;
}
if (stage === 'RECONCILE') {
var planned = {}; run.plannedLines.forEach(function (pl) { planned[pl.lineKey] = 1; });
draftLines(store, run.draftId).forEach(function (line) {
if (planned[line.lineKey] === 1) return;
if (line.lineStatus === 'SUPERSEDED' || line.lineStatus === 'SUPERSEDED_USER_REVIEW') return;

line.lineStatus = line.userEdited === true ? 'SUPERSEDED_USER_REVIEW' : 'SUPERSEDED';
counts.superseded++;
});
return;
}
if (stage === 'LINEAGE') {
var plannedKeys = {}; run.plannedLines.forEach(function (pl) { plannedKeys[pl.lineKey] = 1; });
draftLines(store, run.draftId).forEach(function (line) {
if (plannedKeys[line.lineKey] === 1) {
line.calculationRunId = run.calculationRunId;
line.sourceDataAsOf = run.sourceDataAsOf;
}
});
return;
}
if (stage === 'TOTALS') {
var totRec = 0, totUser = 0, active = 0, blockedN = 0, supersededN = 0;
draftLines(store, run.draftId).forEach(function (line) {
if (line.lineStatus === 'ACTIVE') { totRec += (line.recommendedQty || 0); totUser += (line.userQty || 0); active++; }
else if (line.lineStatus === 'BLOCKED') blockedN++;
else supersededN++;
});
var d2 = findDraft(store, run.draftId);
if (d2) {
d2.totals = { totalRecommendedQty: totRec, totalUserQty: totUser, activeLineCount: active, blockedCount: blockedN, supersededCount: supersededN };
d2.calculationRunId = run.calculationRunId; d2.draftVersion = run.draftVersion;
}
return;
}

}

function driveStages(store, run, startIdx, stopAfterStage) {
var counts = { created: 0, updated: 0, superseded: 0, blocked: 0, skipped: 0 };
run.status = 'RUNNING';
for (var i = startIdx; i < STAGES.length; i++) {
var st = STAGES[i];
execStage(store, run, st, counts);
run.stage = st;
if (stopAfterStage && st === stopAfterStage) {
run.status = (st === 'COMPLETED') ? 'COMPLETED' : 'PARTIAL';
return counts;
}
}
run.status = 'COMPLETED';
return counts;
}

function buildResult(run, counts, extra) {
var r = {
status: run.status, draftId: run.draftId, draftVersion: run.draftVersion,
calculationRunId: run.calculationRunId, stage: run.stage, action: run.action, counts: counts
};
if (extra) for (var k in extra) r[k] = extra[k];
return r;
}


function persistRecommendationDraft(store, plan) {
aType(isObj(plan) && typeof plan.draftId === 'string', 'plan must be an object with a draftId');
aType(Array.isArray(plan.recommendedLines), 'plan.recommendedLines must be an array');
if (plan.stopAfterStage !== undefined) aRange(stageIdx(plan.stopAfterStage) !== -1, 'plan.stopAfterStage must be a valid stage');
var s = normStore(store);

var run = findRun(s, plan.calculationRunId);
if (!run) {
run = {
calculationRunId: plan.calculationRunId, draftId: plan.draftId, activeKey: plan.activeKey,
recommendationType: plan.recommendationType, planningCycle: plan.planningCycle,
businessScope: clone(plan.businessScope), draftVersion: plan.draftVersion,
formulaVersion: plan.formulaVersion !== undefined ? plan.formulaVersion : null,
sourceDataAsOf: plan.sourceDataAsOf !== undefined ? plan.sourceDataAsOf : null,
action: plan.action, reInitUserQty: plan.reInitUserQty === true,
plannedLines: clone(plan.recommendedLines), status: 'RUNNING', stage: null
};
s.runs.push(run);
} else {

run.status = 'RUNNING'; run.plannedLines = clone(plan.recommendedLines); run.action = plan.action;
run.reInitUserQty = plan.reInitUserQty === true;
run.formulaVersion = plan.formulaVersion !== undefined ? plan.formulaVersion : run.formulaVersion;
run.sourceDataAsOf = plan.sourceDataAsOf !== undefined ? plan.sourceDataAsOf : run.sourceDataAsOf;
}
var counts = driveStages(s, run, 0, plan.stopAfterStage);
return { store: s, result: buildResult(run, counts) };
}


function generateRecommendationDraft(store, command) {
validateScopeQuery(command);
aRange(MODES[command.mode] === 1, 'unknown mode (expect SCHEDULED_REFRESH | MANUAL_REGENERATE)');
validateLines(command.recommendedLines);
var s = normStore(store);
var resolved = resolveActiveDraft(s, command);
if (resolved.status === 'BLOCKED_CONFLICT') {

return { store: clone(store) || createStore(), result: { status: 'BLOCKED', reason: 'DUPLICATE_ACTIVE_DRAFT', activeKey: resolved.activeKey, draftId: null, matchCount: resolved.matchCount } };
}
var draftId = resolved.draftId, action, version, reInit;
if (resolved.status === 'CREATE') {
action = 'CREATE'; version = 1; reInit = true;
} else {
if (command.mode === 'SCHEDULED_REFRESH') {
action = 'REFRESH'; version = resolved.draft.draftVersion; reInit = false;
} else {
var edits = hasUserEdits(s, draftId);
if (edits && command.confirmRegenerateOverUserEdits !== true) {

return { store: clone(store) || createStore(), result: { status: 'BLOCKED', reason: 'REGENERATE_NEEDS_CONFIRMATION', draftId: draftId, draftVersion: resolved.draft.draftVersion, activeKey: resolved.activeKey } };
}
action = 'REGENERATE'; version = resolved.draft.draftVersion + 1;
reInit = true;
}
}
var plan = {
draftId: draftId, activeKey: resolved.activeKey, recommendationType: command.recommendationType,
planningCycle: command.planningCycle, businessScope: sortedScope(command.businessScope),
draftVersion: version, calculationRunId: runIdOf(draftId, version),
formulaVersion: command.formulaVersion !== undefined ? command.formulaVersion : null,
sourceDataAsOf: command.sourceDataAsOf !== undefined ? command.sourceDataAsOf : null,
action: action, reInitUserQty: reInit, recommendedLines: clone(command.recommendedLines),
stopAfterStage: command.stopAfterStage
};
return persistRecommendationDraft(s, plan);
}


function resumeRecommendationRun(store, query) {
aType(isObj(query), 'query must be an object');
var s = normStore(store);
var draftId = query.draftId;
if (!draftId) { validateScopeQuery(query); draftId = draftIdOf(activeKeyOf(query.recommendationType, query.planningCycle, query.businessScope)); }
var candidates = s.runs.filter(function (r) { return r.draftId === draftId && r.status !== 'COMPLETED'; });
candidates.sort(function (a, b) { return (b.draftVersion - a.draftVersion) || cmpStr(b.calculationRunId, a.calculationRunId); });
var run = candidates[0];
if (!run) return { store: s, result: { status: 'NOOP', reason: 'NO_RESUMABLE_RUN', draftId: draftId } };
var fromIdx = run.stage == null ? 0 : stageIdx(run.stage) + 1;
var counts = driveStages(s, run, fromIdx, undefined);
return { store: s, result: buildResult(run, counts, { resumed: true, resumedFromStage: fromIdx < STAGES.length ? STAGES[fromIdx] : 'COMPLETED' }) };
}


function applyUserEdit(store, edit) {
aType(isObj(edit) && typeof edit.draftId === 'string' && typeof edit.lineKey === 'string', 'edit requires draftId + lineKey');
aType(typeof edit.userQty === 'number', 'edit.userQty must be a number');
aRange(isFinite(edit.userQty) && edit.userQty >= 0, 'edit.userQty must be finite ≥ 0');
var s = normStore(store);
var line = findLine(s, lineIdOf(edit.draftId, edit.lineKey));
aRange(!!line, 'no such line for draftId+lineKey');
line.userQty = edit.userQty; line.userEdited = true; line.userEditedBy = edit.actor || 'user';
return { store: s, result: { draftId: edit.draftId, lineKey: edit.lineKey, userQty: edit.userQty, userEdited: true } };
}

return {
createStore: createStore,
resolveActiveDraft: resolveActiveDraft,
generateRecommendationDraft: generateRecommendationDraft,
persistRecommendationDraft: persistRecommendationDraft,
resumeRecommendationRun: resumeRecommendationRun,
applyUserEdit: applyUserEdit,
STAGES: STAGES.slice()
};
});
__kmRegister("supply-planning-persistence", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;


















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.persistenceRepository = api; }
})(this, function () {
'use strict';


var LINE_ADDITIVE_HEADERS = ['user_edited', 'user_edited_by'];
var RUN_JOURNAL_HEADERS = [
'calculation_run_id', 'recommendation_type', 'draft_id', 'planning_cycle', 'business_scope_key',
'draft_version', 'run_status', 'current_stage', 'formula_version', 'source_data_as_of',
'started_by', 'started_at', 'completed_by', 'completed_at', 'error_summary', 'attempt_count'
];
var RUN_STATUSES = { RUNNING: 1, PARTIAL: 1, COMPLETED: 1, FAILED: 1 };
var STAGES = ['RUN_METADATA', 'HEADER', 'LINES', 'RECONCILE', 'LINEAGE', 'TOTALS', 'COMPLETED'];
var LINE_OPS = { INSERT: 1, UPDATE: 1, SUPERSEDE: 1 };

var LINE_STATES = { active: 1, blocked: 1, superseded: 1, superseded_user_review: 1, draft: 1, submitted: 1, cancelled: 1 };
var ACTIVE_DRAFT_STATUSES = { draft: 1, site_confirmed: 1 };
var RUN_JOURNAL_TABLE = 'recommendation_calculation_runs';


var TABLES = {
WEEKLY_SHIPPING: {
header: 'shipping_allocation_drafts', lines: 'shipping_allocation_draft_lines',
headerId: 'allocation_draft_id', lineDraftId: 'allocation_draft_id', lineId: 'allocation_draft_line_id',
scope: ['planning_cycle', 'company', 'country', 'marketplace', 'source_page'],






lineKey: ['sku', 'site_sku', 'window_code', 'source_warehouse_id', 'route_no'],
nullableLineKey: { source_warehouse_id: 1, route_no: 1 }, userQty: 'planned_qty'
},
MONTHLY_ORDER: {
header: 'request_order_allocation_drafts', lines: 'request_order_allocation_draft_lines',
headerId: 'request_allocation_draft_id', lineDraftId: 'request_allocation_draft_id', lineId: 'request_allocation_line_id',
scope: ['planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku'],
lineKey: ['request_month', 'request_bucket'], userQty: 'order_qty'
}
};


function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function aRange(c, m) { if (!c) throw new RangeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function tableCfg(type) { aRange(TABLES[type], 'unknown recommendationType: ' + type); return TABLES[type]; }
function isBool(v) { return v === true || v === 'TRUE' || v === 'true'; }
function boolCell(v) { return v ? 'TRUE' : 'FALSE'; }


function fnv1a(str) {
var h = 0x811c9dc5;
for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
return ('00000000' + h.toString(16)).slice(-8);
}


function ensureHeaders(existing, required) {
aType(Array.isArray(existing) && Array.isArray(required), 'ensureHeaders needs arrays');
var out = existing.slice(), added = [];
required.forEach(function (h) { if (out.indexOf(h) === -1) { out.push(h); added.push(h); } });
return { headers: out, added: added, changed: added.length > 0 };
}

function buildBusinessScopeKey(type, scopeObj) {
var cfg = tableCfg(type);
aType(isObj(scopeObj), 'businessScope must be an object');
return cfg.scope.map(function (c) { return c + '=' + String(scopeObj[c] === undefined || scopeObj[c] === null ? '' : scopeObj[c]); }).join('|');
}


function buildUserEditFingerprint(lineTuples) {
aType(Array.isArray(lineTuples), 'lineTuples must be an array');
var canon = lineTuples.map(function (t) {
return String(t.lineKey) + '' + String(t.userQty === undefined || t.userQty === null ? '' : t.userQty) + '' + (isBool(t.userEdited) ? '1' : '0');
}).sort(cmpStr).join('');
return fnv1a(canon);
}
function computeExpectedToken(draftVersion, lineTuples) {
return { draft_version: draftVersion, userEditFingerprint: buildUserEditFingerprint(lineTuples) };
}
function tokensMatch(a, b) {
return !!a && !!b && String(a.draft_version) === String(b.draft_version) && String(a.userEditFingerprint) === String(b.userEditFingerprint);
}


function getTable(sheetSet, name) {
var t = sheetSet[name];
aType(t && Array.isArray(t.headers) && Array.isArray(t.rows), 'missing/invalid table: ' + name);
return t;
}
function rowObj(headers, row) { var o = {}; for (var i = 0; i < headers.length; i++) o[headers[i]] = row[i]; return o; }
function objRow(headers, obj) { return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }); }
function tableObjects(t) { return t.rows.map(function (r) { return rowObj(t.headers, r); }); }
function matchesScope(o, cfg, query) { for (var i = 0; i < cfg.scope.length; i++) { var c = cfg.scope[i]; if (String(o[c] === undefined ? '' : o[c]) !== String(query[c] === undefined ? '' : query[c])) return false; } return true; }
function naturalKeyStr(cols, o) { return cols.map(function (c) { return String(o[c] === undefined || o[c] === null ? '' : o[c]); }).join(''); }


function loadActiveDraftContext(sheetSet, query) {
aType(isObj(query) && typeof query.recommendationType === 'string', 'query needs recommendationType');
var cfg = tableCfg(query.recommendationType);
aType(typeof query.planningCycle === 'string' && query.planningCycle.length > 0, 'query.planningCycle required');
aType(isObj(query.businessScope), 'query.businessScope required');
var scopeQ = {}; scopeQ.planning_cycle = query.planningCycle;
cfg.scope.forEach(function (c) { if (c !== 'planning_cycle') scopeQ[c] = query.businessScope[c] === undefined ? '' : query.businessScope[c]; });
var t = getTable(sheetSet, cfg.header);
var scopeKey = buildBusinessScopeKey(query.recommendationType, scopeQ);
var matches = tableObjects(t).filter(function (o) {
return ACTIVE_DRAFT_STATUSES[String(o.status || '').trim()] === 1 && matchesScope(o, cfg, scopeQ);
});
if (matches.length === 0) return { status: 'CREATE', activeKey: query.recommendationType + '::' + scopeKey, draftId: null, businessScopeKey: scopeKey };
if (matches.length === 1) return { status: 'REUSE', activeKey: query.recommendationType + '::' + scopeKey, draftId: matches[0][cfg.headerId], draft: matches[0], businessScopeKey: scopeKey };
return { status: 'BLOCKED_CONFLICT', activeKey: query.recommendationType + '::' + scopeKey, draftId: null, matchCount: matches.length, businessScopeKey: scopeKey };
}


function loadDraftSnapshot(sheetSet, draftId, recommendationType) {
var cfg = tableCfg(recommendationType);
aType(typeof draftId === 'string' && draftId.length > 0, 'draftId required');
var hT = getTable(sheetSet, cfg.header), lT = getTable(sheetSet, cfg.lines);
var draft = tableObjects(hT).filter(function (o) { return String(o[cfg.headerId]) === draftId; })[0] || null;
var hasUserEditedCol = lT.headers.indexOf('user_edited') !== -1;
var lines = tableObjects(lT).filter(function (o) { return String(o[cfg.lineDraftId]) === draftId; }).map(function (o) {
var lineKey = naturalKeyStr(cfg.lineKey, o);

var explicit = hasUserEditedCol && (o.user_edited === true || o.user_edited === false || o.user_edited === 'TRUE' || o.user_edited === 'FALSE');
var userEdited = explicit ? isBool(o.user_edited) : true;
return { lineKey: lineKey, raw: o, userQty: o[cfg.userQty], userEdited: userEdited, legacyProtected: !explicit, lineStatus: String(o.line_status || '').trim() };
});
lines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
var runs = [];
if (sheetSet[RUN_JOURNAL_TABLE]) runs = tableObjects(getTable(sheetSet, RUN_JOURNAL_TABLE)).filter(function (o) { return String(o.draft_id) === draftId; });
return { draft: draft, lines: lines, runs: runs };
}


function loadIncompleteRun(sheetSet, draftId) {
aType(typeof draftId === 'string' && draftId.length > 0, 'draftId required');
if (!sheetSet[RUN_JOURNAL_TABLE]) return { status: 'NOT_FOUND' };
var runs = tableObjects(getTable(sheetSet, RUN_JOURNAL_TABLE)).filter(function (o) {
return String(o.draft_id) === draftId && (o.run_status === 'RUNNING' || o.run_status === 'PARTIAL');
});
if (runs.length === 0) return { status: 'NOT_FOUND' };
if (runs.length === 1) return { status: 'FOUND', run: runs[0] };
return { status: 'BLOCKED_CONFLICT', matchCount: runs.length };
}


function hasSheetRef(v) {
if (typeof v === 'function') return true;
if (v && typeof v === 'object') { if (typeof v.getRange === 'function' || typeof v.getValues === 'function' || typeof v.getSheetByName === 'function' || typeof v.getA1Notation === 'function') return true; }
return false;
}
function validatePersistencePlan(plan) {
aType(isObj(plan), 'plan must be an object');
aRange(TABLES[plan.recommendationType], 'plan.recommendationType invalid');
aType(isObj(plan.sourceTables) && typeof plan.sourceTables.header === 'string' && typeof plan.sourceTables.lines === 'string', 'plan.sourceTables invalid');
aType(typeof plan.draftId === 'string' && plan.draftId.length > 0, 'plan.draftId required');
aType(typeof plan.activeKey === 'string' && plan.activeKey.length > 0, 'plan.activeKey required');
aType(typeof plan.calculationRunId === 'string' && plan.calculationRunId.length > 0, 'plan.calculationRunId required');
aType(plan.draftVersion !== undefined, 'plan.draftVersion required');
aType(isObj(plan.expectedToken) && plan.expectedToken.draft_version !== undefined && typeof plan.expectedToken.userEditFingerprint === 'string', 'plan.expectedToken invalid');
aType(isObj(plan.runMeta), 'plan.runMeta required');
aType(isObj(plan.headerOp) && (plan.headerOp.op === 'INSERT' || plan.headerOp.op === 'UPDATE'), 'plan.headerOp op must be INSERT|UPDATE');
aType(isObj(plan.headerOp.row), 'plan.headerOp.row required');
aType(Array.isArray(plan.lineOps), 'plan.lineOps must be an array');
aType(Array.isArray(plan.lineageOps), 'plan.lineageOps must be an array');
aType(isObj(plan.totals), 'plan.totals required');
aType(Array.isArray(plan.stages), 'plan.stages must be an array');
aRange(plan.stages.length === STAGES.length && plan.stages.every(function (s, i) { return s === STAGES[i]; }), 'plan.stages must equal the frozen stage sequence');
aType(Array.isArray(plan.auditEvents), 'plan.auditEvents must be an array');
aType(!hasSheetRef(plan.headerOp.row) && Object.keys(plan.headerOp.row).every(function (k) { return !hasSheetRef(plan.headerOp.row[k]); }), 'headerOp.row has a Sheet/Range/function reference');
var cfg = TABLES[plan.recommendationType], seen = {};
plan.lineOps.forEach(function (op, i) {
aType(isObj(op), 'lineOps[' + i + '] must be object');
aRange(LINE_OPS[op.op] === 1, 'lineOps[' + i + '].op must be INSERT|UPDATE|SUPERSEDE');
aType(isObj(op.naturalKey), 'lineOps[' + i + '].naturalKey required');


var nlk = cfg.nullableLineKey || {};
cfg.lineKey.forEach(function (kc) { if (nlk[kc] === 1) { aType(op.naturalKey[kc] !== undefined && op.naturalKey[kc] !== null, 'lineOps[' + i + '] nullable natural-key part must be defined (may be blank): ' + kc); } else { aType(op.naturalKey[kc] !== undefined && op.naturalKey[kc] !== null && op.naturalKey[kc] !== '', 'lineOps[' + i + '] missing natural-key part: ' + kc); } });
var nk = naturalKeyStr(cfg.lineKey, op.naturalKey);
aRange(seen[nk] !== 1, 'duplicate lineOps natural key: ' + nk); seen[nk] = 1;
if (op.op !== 'SUPERSEDE') {
aType(isObj(op.row), 'lineOps[' + i + '].row required for ' + op.op);
aType(Object.keys(op.row).every(function (k) { return !hasSheetRef(op.row[k]); }), 'lineOps[' + i + '].row has a Sheet/Range/function reference');
if (op.targetLineStatus === 'blocked') {  }
else if (op.row[cfg.userQty] !== undefined && op.row[cfg.userQty] !== null && op.row[cfg.userQty] !== '') {
var q = Number(op.row[cfg.userQty]); aRange(isFinite(q) && q >= 0, 'lineOps[' + i + '] user qty must be finite ≥ 0');
}
}
if (op.targetLineStatus !== undefined) aRange(LINE_STATES[op.targetLineStatus] === 1, 'lineOps[' + i + '].targetLineStatus invalid');
});
return true;
}



function upsertRow(t, keyCols, keyObj, valueObj, mode) {

var target = -1, dup = 0, i, o;
for (i = 0; i < t.rows.length; i++) { o = rowObj(t.headers, t.rows[i]); if (naturalKeyStr(keyCols, o) === naturalKeyStr(keyCols, keyObj)) { dup++; if (target === -1) target = i; } }
if (dup > 1) return { action: 'BLOCKED_CONFLICT' };
if (target === -1) { t.rows.push(objRow(t.headers, valueObj)); return { action: 'INSERT', index: t.rows.length - 1 }; }
var cur = rowObj(t.headers, t.rows[target]);
for (var k in valueObj) if (valueObj.hasOwnProperty(k)) cur[k] = valueObj[k];
t.rows[target] = objRow(t.headers, cur);
return { action: 'UPDATE', index: target };
}

function applyPersistencePlan(sheetSet, plan, expectedToken, opts) {
validatePersistencePlan(plan);
opts = opts || {};
var cfg = TABLES[plan.recommendationType];
var hT = getTable(sheetSet, cfg.header), lT = getTable(sheetSet, cfg.lines), rT = getTable(sheetSet, RUN_JOURNAL_TABLE);
var now = opts.now !== undefined ? opts.now : '', actor = opts.actor !== undefined ? opts.actor : '';


var snap = loadDraftSnapshot(sheetSet, plan.draftId, plan.recommendationType);
var liveFingerprint = buildUserEditFingerprint(snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));

var persistedVersion = snap.draft ? snap.draft.draft_version : (plan.headerOp.op === 'INSERT' ? plan.draftVersion : undefined);
var liveToken = { draft_version: persistedVersion === undefined ? expectedToken.draft_version : persistedVersion, userEditFingerprint: liveFingerprint };
if (!tokensMatch(liveToken, expectedToken)) {
return { runStatus: 'CONFLICT', conflict: true, stageReached: null, reason: 'TOKEN_MISMATCH', expected: expectedToken, live: liveToken };
}


var runFind = null, ri;
for (ri = 0; ri < rT.rows.length; ri++) { var ro = rowObj(rT.headers, rT.rows[ri]); if (String(ro.calculation_run_id) === plan.calculationRunId) { runFind = ro; break; } }
var startIdx = 0, attempt = 1;
if (runFind) {
attempt = (parseInt(runFind.attempt_count, 10) || 1) + 1;
if (runFind.run_status === 'PARTIAL' || runFind.run_status === 'RUNNING') {

startIdx = runFind.current_stage ? STAGES.indexOf(runFind.current_stage) + 1 : 0;
if (startIdx < 0 || startIdx >= STAGES.length) startIdx = 0;
} else {


startIdx = 0;
}
}

function markStage(stage, status, err) {
var run = {
calculation_run_id: plan.calculationRunId, recommendation_type: plan.recommendationType, draft_id: plan.draftId,
planning_cycle: (plan.runMeta.planning_cycle !== undefined ? plan.runMeta.planning_cycle : ''), business_scope_key: (plan.runMeta.business_scope_key !== undefined ? plan.runMeta.business_scope_key : ''),
draft_version: plan.draftVersion, run_status: status, current_stage: stage,
formula_version: (plan.runMeta.formulaVersion !== undefined ? plan.runMeta.formulaVersion : ''), source_data_as_of: (plan.runMeta.sourceDataAsOf !== undefined ? plan.runMeta.sourceDataAsOf : ''),
started_by: (runFind ? runFind.started_by : (opts.startedBy !== undefined ? opts.startedBy : actor)), started_at: (runFind ? runFind.started_at : now),
completed_by: status === 'COMPLETED' ? actor : (runFind ? runFind.completed_by : ''), completed_at: status === 'COMPLETED' ? now : (runFind ? runFind.completed_at : ''),
error_summary: err || '', attempt_count: attempt
};
var res = upsertRow(rT, ['calculation_run_id'], run, run, 'blind');
if (res.action === 'INSERT' || res.action === 'UPDATE') runFind = run;
return res;
}

var counts = { inserted: 0, updated: 0, superseded: 0, blocked: 0, skipped: 0 };
var i;
for (i = startIdx; i < STAGES.length; i++) {
var stage = STAGES[i];
if (opts.failBeforeStage === stage) { markStage(i > 0 ? STAGES[i - 1] : null, 'PARTIAL', 'failBeforeStage:' + stage); return { runStatus: 'PARTIAL', stageReached: i > 0 ? STAGES[i - 1] : null, applied: counts }; }

if (stage === 'RUN_METADATA') { markStage('RUN_METADATA', 'RUNNING'); }
else if (stage === 'HEADER') {
var hrow = defObj(cfg.headerId, plan.draftId, plan.headerOp.row);
var hres = upsertRow(hT, [cfg.headerId], hrow, hrow, plan.headerOp.op === 'INSERT' ? 'insert' : 'update');
if (hres.action === 'BLOCKED_CONFLICT') { markStage('RUN_METADATA', 'FAILED', 'DUPLICATE_HEADER'); return { runStatus: 'FAILED', stageReached: 'RUN_METADATA', reason: 'DUPLICATE_HEADER' }; }
}
else if (stage === 'LINES') {
var lr = applyLineOps(lT, cfg, plan.lineOps, ['INSERT', 'UPDATE'], now, actor, snap, counts);
if (lr) { markStage('HEADER', 'FAILED', lr); return { runStatus: 'FAILED', stageReached: 'HEADER', reason: lr }; }
}
else if (stage === 'RECONCILE') {
var rr = applyLineOps(lT, cfg, plan.lineOps, ['SUPERSEDE'], now, actor, snap, counts);
if (rr) { markStage('LINES', 'FAILED', rr); return { runStatus: 'FAILED', stageReached: 'LINES', reason: rr }; }
}
else if (stage === 'LINEAGE') {
if (lT.headers.indexOf('calculation_run_id') !== -1 || lT.headers.indexOf('source_data_as_of') !== -1) {
plan.lineageOps.forEach(function (op) {
var v = {}; if (lT.headers.indexOf('calculation_run_id') !== -1) v.calculation_run_id = plan.calculationRunId; if (lT.headers.indexOf('source_data_as_of') !== -1) v.source_data_as_of = plan.runMeta.sourceDataAsOf || '';
upsertRow(lT, cfg.lineKey, op.naturalKey, mergeKey(cfg.lineKey, op.naturalKey, v), 'update');
});
}
}
else if (stage === 'TOTALS') {


}
else if (stage === 'COMPLETED') { markStage('COMPLETED', 'COMPLETED'); }

if (stage !== 'RUN_METADATA' && stage !== 'COMPLETED') {
if (opts.failBeforeMark === stage) {  return { runStatus: 'PARTIAL', stageReached: STAGES[i - 1], applied: counts, crashedAt: stage }; }
markStage(stage, i === STAGES.length - 1 ? 'COMPLETED' : 'PARTIAL');
}
}
return { runStatus: 'COMPLETED', stageReached: 'COMPLETED', applied: counts };
}

function defObj(idCol, idVal, row) { var o = {}; for (var k in row) o[k] = row[k]; if (o[idCol] === undefined) o[idCol] = idVal; return o; }
function mergeKey(keyCols, keyObj, extra) { var o = {}; keyCols.forEach(function (c) { o[c] = keyObj[c]; }); for (var k in extra) o[k] = extra[k]; return o; }


function applyLineOps(lT, cfg, lineOps, allowed, now, actor, snap, counts) {
var protectedKeys = {}; snap.lines.forEach(function (l) { if (l.userEdited || l.legacyProtected) protectedKeys[l.lineKey] = 1; });
for (var i = 0; i < lineOps.length; i++) {
var op = lineOps[i]; if (allowed.indexOf(op.op) === -1) continue;
var nk = naturalKeyStr(cfg.lineKey, op.naturalKey);
if (op.op === 'SUPERSEDE') {
var sres = supersedeLine(lT, cfg, op.naturalKey, op.targetLineStatus || (protectedKeys[nk] ? 'superseded_user_review' : 'superseded'), now, actor);
if (sres === 'BLOCKED_CONFLICT') return 'DUPLICATE_LINE_KEY:' + nk;
if (sres === 'INSERT' || sres === 'UPDATE') counts.superseded++;
continue;
}

var blocked = op.targetLineStatus === 'blocked';
var row = {}; for (var k in op.row) row[k] = op.row[k];
cfg.lineKey.forEach(function (c) { row[c] = op.naturalKey[c]; });
if (lT.headers.indexOf(cfg.lineDraftId) !== -1 && op.naturalKey[cfg.lineDraftId] !== undefined) row[cfg.lineDraftId] = op.naturalKey[cfg.lineDraftId];
row.line_status = blocked ? 'blocked' : (op.targetLineStatus || 'active');

var preserve = op.preserveUserQty === true || (op.op === 'UPDATE' && protectedKeys[nk]);
if (preserve && row[cfg.userQty] !== undefined) delete row[cfg.userQty];

if (lT.headers.indexOf('user_edited') !== -1) {
if (op.setUserEdited === true) { row.user_edited = 'TRUE'; row.user_edited_by = op.userEditedBy || actor || 'user'; }
else if (op.op === 'INSERT') { row.user_edited = 'FALSE'; row.user_edited_by = ''; }

}
var mode = op.op === 'INSERT' ? 'insert' : 'update';
var res = upsertRow(lT, cfg.lineKey, op.naturalKey, row, mode);
if (res.action === 'BLOCKED_CONFLICT') return 'DUPLICATE_LINE_KEY:' + nk;
if (res.action === 'INSERT') { blocked ? counts.blocked++ : counts.inserted++; }
else counts.updated++;
}
return null;
}

function supersedeLine(lT, cfg, keyObj, targetStatus, now, actor) {
var target = -1, dup = 0;
for (var i = 0; i < lT.rows.length; i++) { var o = rowObj(lT.headers, lT.rows[i]); if (naturalKeyStr(cfg.lineKey, o) === naturalKeyStr(cfg.lineKey, keyObj)) { dup++; if (target === -1) target = i; } }
if (dup > 1) return 'BLOCKED_CONFLICT';
if (target === -1) return 'MISSING';
var cur = rowObj(lT.headers, lT.rows[target]);
if (cur.line_status === targetStatus) return 'NOOP';
cur.line_status = targetStatus; if (lT.headers.indexOf('updated_at') !== -1) cur.updated_at = now;
lT.rows[target] = objRow(lT.headers, cur);
return 'UPDATE';
}

function createSheetSet(seed) {
var s = {};
['shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'request_order_allocation_drafts', 'request_order_allocation_draft_lines', RUN_JOURNAL_TABLE].forEach(function (n) { s[n] = { headers: [], rows: [] }; });
if (seed) for (var k in seed) s[k] = { headers: seed[k].headers.slice(), rows: seed[k].rows.map(function (r) { return r.slice(); }) };
return s;
}



var TERMINAL_DRAFT_STATUSES = { submitted: 1, cancelled: 1 };

var LINE_TERMINAL_STATUSES = { submitted: 1, cancelled: 1, superseded: 1, superseded_user_review: 1 };



var GENERATION_BLOCKED_STATUSES = { submitted: 1, cancelled: 1, partially_submitted: 1 };
function nstat(s) { return String(s === undefined || s === null ? '' : s).trim().toLowerCase(); }
function isTerminalDraftStatus(s) { return TERMINAL_DRAFT_STATUSES[nstat(s)] === 1; }
function isLineTerminalStatus(s) { return LINE_TERMINAL_STATUSES[nstat(s)] === 1; }
function isGenerationBlockedStatus(s) { return GENERATION_BLOCKED_STATUSES[nstat(s)] === 1; }



var EDITABLE_DECISION_FIELDS = {
WEEKLY_SHIPPING: { planned_qty: 1, selected_source_warehouse_id: 1, selected_destination_warehouse_id: 1, selected_shipping_method: 1, expected_arrival: 1, note: 1 },
MONTHLY_ORDER: { order_qty: 1, carton_qty: 1, allocation_method: 1, note: 1 }
};








function applyUserDecisionEdits(sheetSet, command, opts) {
opts = opts || {};
aType(isObj(command), 'command must be an object');
var cfg = tableCfg(command.recommendationType);
aType(typeof command.draftId === 'string' && command.draftId.length > 0, 'command.draftId required');
aType(Array.isArray(command.edits) && command.edits.length > 0, 'command.edits must be a non-empty array');
var allow = EDITABLE_DECISION_FIELDS[command.recommendationType];
var lT = getTable(sheetSet, cfg.lines);
var now = opts.now !== undefined ? opts.now : '', actor = opts.actor !== undefined ? opts.actor : 'user';
var counts = { inserted: 0, updated: 0, superseded: 0, skippedTerminal: 0 };


var seen = {}, i, k;
for (i = 0; i < command.edits.length; i++) {
var e = command.edits[i];
aType(isObj(e) && isObj(e.naturalKey), 'edits[' + i + '] needs a naturalKey object');
var nlkE = cfg.nullableLineKey || {};
cfg.lineKey.forEach(function (kc) { if (nlkE[kc] === 1) { aType(e.naturalKey[kc] !== undefined && e.naturalKey[kc] !== null, 'edits[' + i + '] nullable natural-key part must be defined (may be blank): ' + kc); } else { aType(e.naturalKey[kc] !== undefined && e.naturalKey[kc] !== null && String(e.naturalKey[kc]).length > 0, 'edits[' + i + '] missing natural-key part: ' + kc); } });
var nk = naturalKeyStr(cfg.lineKey, e.naturalKey);
if (seen[nk] === 1) return { status: 'DUPLICATE_LINE_KEY', reason: 'DUPLICATE_LINE_KEY:' + nk, counts: counts };
seen[nk] = 1;
var fields = isObj(e.fields) ? e.fields : {};
for (k in fields) { if (fields.hasOwnProperty(k) && allow[k] !== 1) return { status: 'INVALID_EDIT_FIELD', reason: 'INVALID_EDIT_FIELD:' + k, counts: counts }; }
}
var editByKey = {};
command.edits.forEach(function (e2) { editByKey[naturalKeyStr(cfg.lineKey, e2.naturalKey)] = e2; });
function findRows(nk) { var idxs = []; for (var r = 0; r < lT.rows.length; r++) { var o = rowObj(lT.headers, lT.rows[r]); if (String(o[cfg.lineDraftId]) === String(command.draftId) && naturalKeyStr(cfg.lineKey, o) === nk) idxs.push(r); } return idxs; }


for (i = 0; i < command.edits.length; i++) {
var ed = command.edits[i], nk2 = naturalKeyStr(cfg.lineKey, ed.naturalKey), rowsFound = findRows(nk2);
if (rowsFound.length > 1) return { status: 'DUPLICATE_LINE_KEY', reason: 'DUPLICATE_LINE_KEY:' + nk2, counts: counts };
var f = isObj(ed.fields) ? ed.fields : {};
if (rowsFound.length === 0) {

if (command.allowInsert !== true) return { status: 'LINE_NOT_FOUND', reason: 'LINE_NOT_FOUND:' + nk2, counts: counts };
var ins = {}; cfg.lineKey.forEach(function (c) { ins[c] = ed.naturalKey[c]; }); ins[cfg.lineDraftId] = command.draftId;
if (isObj(ed.recommendedSnapshot)) for (k in ed.recommendedSnapshot) if (ed.recommendedSnapshot.hasOwnProperty(k)) ins[k] = ed.recommendedSnapshot[k];
for (k in f) if (f.hasOwnProperty(k)) ins[k] = f[k];
ins.line_status = 'active';
if (lT.headers.indexOf('user_edited') !== -1) { ins.user_edited = 'TRUE'; ins.user_edited_by = actor; }
if (lT.headers.indexOf('updated_at') !== -1) ins.updated_at = now;
if (lT.headers.indexOf('created_at') !== -1) ins.created_at = now;
lT.rows.push(objRow(lT.headers, ins)); counts.inserted++;
} else {
var ri = rowsFound[0], cur = rowObj(lT.headers, lT.rows[ri]);
if (isLineTerminalStatus(cur.line_status)) { counts.skippedTerminal++; continue; }
for (k in f) if (f.hasOwnProperty(k)) cur[k] = f[k];
if (lT.headers.indexOf('user_edited') !== -1) { cur.user_edited = 'TRUE'; cur.user_edited_by = actor; }
if (lT.headers.indexOf('updated_at') !== -1) cur.updated_at = now;
lT.rows[ri] = objRow(lT.headers, cur); counts.updated++;
}
}

if (command.reconcile === true) {
for (var r3 = 0; r3 < lT.rows.length; r3++) {
var o3 = rowObj(lT.headers, lT.rows[r3]);
if (String(o3[cfg.lineDraftId]) !== String(command.draftId)) continue;
if (editByKey[naturalKeyStr(cfg.lineKey, o3)]) continue;
if (isLineTerminalStatus(o3.line_status)) continue;
o3.line_status = isBool(o3.user_edited) ? 'superseded_user_review' : 'superseded';
if (lT.headers.indexOf('updated_at') !== -1) o3.updated_at = now;
lT.rows[r3] = objRow(lT.headers, o3); counts.superseded++;
}
}
return { status: 'APPLIED', counts: counts };
}

return {
TERMINAL_DRAFT_STATUSES: (function () { var o = {}; for (var k in TERMINAL_DRAFT_STATUSES) o[k] = 1; return o; })(),
LINE_TERMINAL_STATUSES: (function () { var o = {}; for (var k in LINE_TERMINAL_STATUSES) o[k] = 1; return o; })(),
GENERATION_BLOCKED_STATUSES: (function () { var o = {}; for (var k in GENERATION_BLOCKED_STATUSES) o[k] = 1; return o; })(),
EDITABLE_DECISION_FIELDS: EDITABLE_DECISION_FIELDS,
isTerminalDraftStatus: isTerminalDraftStatus,
isLineTerminalStatus: isLineTerminalStatus,
isGenerationBlockedStatus: isGenerationBlockedStatus,
applyUserDecisionEdits: applyUserDecisionEdits,
LINE_ADDITIVE_HEADERS: LINE_ADDITIVE_HEADERS.slice(),
RUN_JOURNAL_HEADERS: RUN_JOURNAL_HEADERS.slice(),
RUN_JOURNAL_TABLE: RUN_JOURNAL_TABLE,
STAGES: STAGES.slice(),
TABLES: TABLES,
ensureHeaders: ensureHeaders,
buildBusinessScopeKey: buildBusinessScopeKey,
buildUserEditFingerprint: buildUserEditFingerprint,
computeExpectedToken: computeExpectedToken,
tokensMatch: tokensMatch,
loadActiveDraftContext: loadActiveDraftContext,
loadDraftSnapshot: loadDraftSnapshot,
loadIncompleteRun: loadIncompleteRun,
validatePersistencePlan: validatePersistencePlan,
applyPersistencePlan: applyPersistencePlan,
createSheetSet: createSheetSet
};
});
__kmRegister("supply-planning-persistence-repository", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;

















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.persistenceLocking = api; }
})(this, function () {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function errMsg(e) { return (e && e.message !== undefined && e.message !== null) ? String(e.message) : String(e); }


function tokenEq(a, b) {
return !!a && !!b && String(a.draft_version) === String(b.draft_version) &&
String(a.userEditFingerprint) === String(b.userEditFingerprint);
}


var STATUS = {
COMPLETED: 'COMPLETED',
LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE',
CONFLICT: 'CONFLICT',
BLOCKED_CONFLICT: 'BLOCKED_CONFLICT',
FAILED: 'FAILED'
};
var REQUIRED_DEPS = ['acquireLock', 'releaseLock', 'loadActiveDraftContext', 'reloadSnapshot', 'recomputeToken', 'applyPlan'];


















function executeLockedPersistence(command) {
aType(isObj(command), 'command must be an object');
var plan = command.plan, expectedToken = command.expectedToken, deps = command.deps, opts = command.opts || {};
var generationType = command.generationType || 'SCHEDULED_REFRESH';
aType(isObj(deps), 'command.deps must be an object');
REQUIRED_DEPS.forEach(function (fn) { aType(typeof deps[fn] === 'function', 'command.deps.' + fn + ' must be a function'); });
aType(isObj(plan), 'command.plan must be an object');
aType(typeof plan.draftId === 'string' && plan.draftId.length > 0, 'plan.draftId required');
aType(typeof plan.calculationRunId === 'string' && plan.calculationRunId.length > 0, 'plan.calculationRunId required');
aType(isObj(plan.headerOp) && (plan.headerOp.op === 'INSERT' || plan.headerOp.op === 'UPDATE'), 'plan.headerOp.op must be INSERT|UPDATE');
aType(isObj(expectedToken) && expectedToken.draft_version !== undefined && typeof expectedToken.userEditFingerprint === 'string', 'command.expectedToken invalid');

if (typeof deps.validatePlan === 'function') deps.validatePlan(plan);

var issues = [];
var draftId = plan.draftId, calcRunId = plan.calculationRunId;
var draftVersion = (plan.draftVersion === undefined ? null : plan.draftVersion);
function audit(ev) { if (typeof deps.audit === 'function') { try { deps.audit(ev); } catch (ae) { issues.push('AUDIT_FAILED:' + errMsg(ae)); } } }
function dto(status, extra) {
var d = {
success: status === STATUS.COMPLETED, status: status, stage: null, reason: null,
draftId: draftId, calculationRunId: calcRunId, draftVersion: draftVersion,
applied: false, conflict: false, issues: []
};
if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
return d;
}
function finish(d) { d.issues = issues.slice().sort(cmpStr); audit({ event: 'locked_persistence_result', status: d.status, reason: d.reason, draftId: draftId }); return d; }


var acquired = false, acqErr = null;
try { acquired = deps.acquireLock() === true; } catch (e) { acqErr = e; }
if (acqErr) return finish(dto(STATUS.LOCK_UNAVAILABLE, { stage: 'lock', reason: 'LOCK_ERROR:' + errMsg(acqErr) }));
if (!acquired) return finish(dto(STATUS.LOCK_UNAVAILABLE, { stage: 'lock', reason: 'LOCK_UNAVAILABLE' }));


var result = null, stage = 'revalidate';
try {

var active = deps.loadActiveDraftContext();
var op = plan.headerOp.op;
if (isObj(active) && active.status === 'BLOCKED_CONFLICT') {
result = dto(STATUS.BLOCKED_CONFLICT, { stage: stage, reason: 'DUPLICATE_ACTIVE_DRAFT', conflict: true, matchCount: active.matchCount });
} else if (isObj(active) && active.status === 'CREATE' && op === 'UPDATE') {

result = dto(STATUS.CONFLICT, { stage: stage, reason: 'ACTIVE_DRAFT_MISSING', conflict: true });
} else if (isObj(active) && active.status === 'REUSE' && op === 'INSERT') {

result = dto(STATUS.CONFLICT, { stage: stage, reason: 'ACTIVE_DRAFT_ALREADY_EXISTS', conflict: true });
} else if (isObj(active) && active.status === 'REUSE' && String(active.draftId) !== String(draftId)) {

result = dto(STATUS.CONFLICT, { stage: stage, reason: 'ACTIVE_DRAFT_IDENTITY_MISMATCH', conflict: true });
} else {

var snap = deps.reloadSnapshot();
var st = (snap && snap.draft) ? String(snap.draft.status === undefined || snap.draft.status === null ? '' : snap.draft.status).trim().toLowerCase() : '';
if (st === 'submitted' || st === 'cancelled') {
result = dto(STATUS.CONFLICT, { stage: stage, reason: 'IMMUTABLE_TERMINAL_STATUS:' + st, conflict: true });
} else {

var liveToken = deps.recomputeToken(snap);
if (!tokenEq(liveToken, expectedToken)) {
result = dto(STATUS.CONFLICT, { stage: stage, reason: 'CONCURRENCY_TOKEN_MISMATCH', conflict: true, expectedToken: expectedToken, liveToken: liveToken, generationType: generationType });
} else {

stage = 'apply';
var repo = deps.applyPlan(expectedToken, opts);
result = mapApply(repo, dto);
}
}
}
} catch (e) {

result = dto(STATUS.FAILED, { stage: stage, reason: 'EXCEPTION:' + errMsg(e) });
} finally {
try { deps.releaseLock(); } catch (re) { issues.push('RELEASE_FAILED:' + errMsg(re)); }
}
if (!result) result = dto(STATUS.FAILED, { stage: stage, reason: 'NO_RESULT' });
return finish(result);
}



function mapApply(repo, dto) {
if (!isObj(repo)) return dto('FAILED', { stage: 'apply', reason: 'REPOSITORY_NO_RESULT' });
var rs = repo.runStatus;
if (rs === 'COMPLETED') return dto('COMPLETED', { stage: 'apply', reason: null, applied: (repo.applied !== undefined && repo.applied !== null) ? repo.applied : true, conflict: false });
if (repo.conflict === true || rs === 'CONFLICT') return dto('CONFLICT', { stage: 'apply', reason: repo.reason || 'TOKEN_MISMATCH', conflict: true, applied: false, liveToken: repo.live, expectedToken: repo.expected });
if (rs === 'PARTIAL') return dto('FAILED', { stage: 'apply', reason: 'REPOSITORY_PARTIAL', partial: true, applied: (repo.applied !== undefined && repo.applied !== null) ? repo.applied : false });
return dto('FAILED', { stage: 'apply', reason: 'REPOSITORY_' + (rs || 'UNKNOWN') + (repo.reason ? (':' + repo.reason) : ''), applied: false });
}

return {
STATUS: { COMPLETED: 'COMPLETED', LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', CONFLICT: 'CONFLICT', BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', FAILED: 'FAILED' },
REQUIRED_DEPS: REQUIRED_DEPS.slice(),
executeLockedPersistence: executeLockedPersistence
};
});
__kmRegister("supply-planning-persistence-locking", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;




















(function (root, factory) {
'use strict';
var api = factory(
(typeof require !== 'undefined') ? require('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.planBuilder = api; }
})(this, function (REPO) {
'use strict';

var SEP = '';

var MODE_TO_GENERATION_TYPE = { SCHEDULED_REFRESH: 'scheduled', MANUAL_REGENERATE: 'manual_refresh' };

var LIVE_ANALYSIS_FORBIDDEN = {
gap: 1, calculated_gap: 1, shortage: 1, shortage_qty: 1, coverage: 1, coverage_status: 1,
days_of_supply: 1, suggested_qty: 1, uncovered_qty: 1, risk: 1, risk_label: 1, current_risk: 1
};

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function aRange(c, m) { if (!c) throw new RangeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function str(v) { return String(v === undefined || v === null ? '' : v); }
function typeCfg(type) { aRange(REPO && REPO.TABLES && REPO.TABLES[type], 'unknown recommendationType: ' + type); return REPO.TABLES[type]; }




function buildLineKey(type, obj) {
var cfg = typeCfg(type);
var nlk = cfg.nullableLineKey || {};
return cfg.lineKey.map(function (c) {
var v = str(obj[c]);
if (nlk[c] !== 1) aRange(v.length > 0, 'line natural-key part missing/blank: ' + c);
aRange(v.indexOf(SEP) === -1, 'line natural-key part must not contain the reserved separator: ' + c);
return v;
}).join(SEP);
}
function splitLineKey(type, key) {
var cfg = typeCfg(type);
var parts = String(key).split(SEP);
aRange(parts.length === cfg.lineKey.length, 'lineKey arity mismatch for ' + type);
var o = {}; cfg.lineKey.forEach(function (c, i) { o[c] = parts[i]; });
return o;
}

function mapGenerationType(mode) {
aRange(MODE_TO_GENERATION_TYPE[mode] !== undefined, 'unsupported mode → generation_type: ' + mode);
return MODE_TO_GENERATION_TYPE[mode];
}











function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function shallow(o) { var r = {}; for (var k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }
function withSourceSnapshot(baseSnap, srcId, srcCode, allocQty) {
var r = isObj(baseSnap) ? shallow(baseSnap) : {};
r.source_warehouse_id = str(srcId);
r.source_warehouse_code_snapshot = str(srcCode);
r.source_allocated_qty_snapshot = (allocQty === null || allocQty === undefined) ? '' : allocQty;
return r;
}










function wholeCartonAvailable(x, upc) { var v = (typeof x === 'number' && isFinite(x) && x > 0) ? x : 0; return Math.floor(v / upc) * upc; }
function tierRank(t) { return t === 'FACTORY' ? 1 : 0; }
function classifyTier(e) {
var pt = str(e && e.sourcePoolType).toUpperCase();
if (pt === 'FACTORY') return 'FACTORY';
if (pt === 'FBA' || pt === 'THREE_PL' || pt === '3PL') return 'OVERSEAS';
var asrc = str(e && e.allocationSource).toUpperCase(); if (asrc === 'FACTORY') return 'FACTORY'; if (asrc === 'OVERSEAS') return 'OVERSEAS';
return str(e && e.allocationReason).toUpperCase().indexOf('FACTORY') !== -1 ? 'FACTORY' : 'OVERSEAS';
}



function allocateWholeCartonSources(recommendedQty, unitsPerCarton, sources) {
var upc = unitsPerCarton;
aType(typeof upc === 'number' && isFinite(upc) && upc > 0 && Math.floor(upc) === upc, 'allocateWholeCartonSources: unitsPerCarton must be a positive integer (got ' + upc + ')');
var R = (typeof recommendedQty === 'number' && isFinite(recommendedQty) && recommendedQty >= 0) ? recommendedQty : 0;
aRange(R % upc === 0, 'allocateWholeCartonSources: recommendedQty must already be a whole-carton multiple (frozen cartonization is NOT re-run here): ' + R + ' % ' + upc);
var ordered = (sources || []).slice().sort(function (a, b) {
return (tierRank(a.tier) - tierRank(b.tier)) || ((num(a.seq) || 0) - (num(b.seq) || 0)) ||
cmpStr(str(a.sourceWarehouseId), str(b.sourceWarehouseId)) || cmpStr(str(a.routeNo), str(b.routeNo));
});
var remaining = R, perSource = [], overseasAllocated = 0, factoryAllocated = 0;
for (var i = 0; i < ordered.length; i++) {
var s = ordered[i], cartonAvail = wholeCartonAvailable(s.availableQty, upc);
var take = Math.min(remaining, cartonAvail); if (take < 0) take = 0;
aRange(take % upc === 0, 'allocateWholeCartonSources: per-source allocation must be a carton multiple');
perSource.push({ sourceWarehouseId: str(s.sourceWarehouseId), routeNo: str(s.routeNo), tier: (s.tier === 'FACTORY' ? 'FACTORY' : 'OVERSEAS'), availableQty: (num(s.availableQty) || 0), cartonAvailableQty: cartonAvail, allocatedQty: take });
if (s.tier === 'FACTORY') factoryAllocated += take; else overseasAllocated += take;
remaining -= take;
}
var uncoveredQty = remaining;
aRange(uncoveredQty >= 0, 'allocateWholeCartonSources: uncovered must be ≥ 0');
aRange(overseasAllocated + factoryAllocated + uncoveredQty === R, 'allocateWholeCartonSources: allocated + uncovered must equal recommendedQty (' + (overseasAllocated + factoryAllocated) + ' + ' + uncoveredQty + ' != ' + R + ')');
return { perSource: perSource, uncoveredQty: uncoveredQty, overseasAllocated: overseasAllocated, factoryAllocated: factoryAllocated, recommendedQty: R };
}

function expandSourceFacts(type, cfg, f) {
if (type !== 'WEEKLY_SHIPPING' || !cfg.nullableLineKey) return [f];
var lin = isObj(f.lineage) ? f.lineage : {};
var bd = Array.isArray(lin.allocationBreakdown) ? lin.allocationBreakdown : [];
var routeNo = str(f.route_no);
var R = num(f.recommendedQty);
if (f.blocked === true || bd.length === 0) {
var one = shallow(f);
one.source_warehouse_id = str(f.source_warehouse_id);
one.route_no = routeNo;


one.snapshotRow = withSourceSnapshot(f.snapshotRow, one.source_warehouse_id, f.source_warehouse_code_snapshot, f.blocked === true ? null : 0);
return [one];
}


var order = [], byKey = {};
for (var i = 0; i < bd.length; i++) {
var e = bd[i]; var sid = str(e && e.sourceWarehouseId); var k = sid + SEP + routeNo;
if (!byKey[k]) { byKey[k] = { sid: sid, route: routeNo, code: str(e && (e.sourceWarehouseCode || e.sourceWarehouseCodeSnapshot)), qty: 0, tier: classifyTier(e), seq: num(e && e.allocationSequence) }; order.push(k); }
var g0 = byKey[k];
var q = num(e && e.allocatedQty); if (q !== null) g0.qty += q;
var sq = num(e && e.allocationSequence); if (sq !== null && (g0.seq === null || sq < g0.seq)) g0.seq = sq;
}

var sources = order.map(function (k) { var g = byKey[k]; return { sourceWarehouseId: g.sid, routeNo: g.route, tier: g.tier, availableQty: g.qty, seq: g.seq }; });
var exec = (R === null) ? null : allocateWholeCartonSources(R, num(lin.unitsPerCarton), sources);
var execByKey = {};
if (exec) exec.perSource.forEach(function (p) { execByKey[p.sourceWarehouseId + SEP + p.routeNo] = p.allocatedQty; });
return order.map(function (k) {
var g = byKey[k], out = shallow(f);
out.source_warehouse_id = g.sid;
out.route_no = routeNo;
out.executionQty = exec ? execByKey[g.sid + SEP + routeNo] : null;
out.snapshotRow = withSourceSnapshot(f.snapshotRow, g.sid, g.code, g.qty);
return out;
});
}

function assertNoLiveAnalysisAuthority(row, where) {
if (!row) return;
Object.keys(row).forEach(function (k) {
aRange(LIVE_ANALYSIS_FORBIDDEN[k] !== 1, 'live-analysis field may not be persisted as authority (' + where + '): ' + k);
});
}



function projectLine(type, cfg, f, idx) {
aType(isObj(f), 'lines[' + idx + '] must be an object');

var nkObj = {}; cfg.lineKey.forEach(function (c) { nkObj[c] = f[c]; });
var lineKey = buildLineKey(type, nkObj);
var blocked = f.blocked === true;
if (blocked) {
aType(typeof f.reason === 'string' && f.reason.length > 0, 'lines[' + idx + '] blocked requires a reason token');
} else {
aType(typeof f.recommendedQty === 'number', 'lines[' + idx + '].recommendedQty must be a number');
aRange(isFinite(f.recommendedQty) && f.recommendedQty >= 0, 'lines[' + idx + '].recommendedQty must be finite ≥ 0');
}

var extraRow = isObj(f.snapshotRow) ? f.snapshotRow : {};
assertNoLiveAnalysisAuthority(extraRow, type + ' snapshotRow');

var commandLine = { lineKey: lineKey, recommendedQty: blocked ? null : f.recommendedQty, lineState: blocked ? 'BLOCKED' : 'OK' };



if (!blocked && typeof f.executionQty === 'number' && isFinite(f.executionQty)) commandLine.userQty = f.executionQty;
if (blocked) commandLine.reason = f.reason;
if (f.demandKey !== undefined) commandLine.demandKey = f.demandKey;
var detail = {
lineKey: lineKey,
naturalKey: nkObj,
row: extraRow,
targetLineStatus: blocked ? 'blocked' : undefined,
lineage: isObj(f.lineage) ? f.lineage : {},
blocked: blocked, reason: blocked ? f.reason : null
};
return { commandLine: commandLine, detail: detail };
}




function buildRecommendation(input) {
aType(isObj(input), 'input must be an object');
var type = input.recommendationType;
var cfg = typeCfg(type);
var generationType = mapGenerationType(input.mode);
aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
aType(isObj(input.businessScope), 'businessScope required');
aType(typeof input.calculationRunId === 'string' && input.calculationRunId.length > 0, 'calculationRunId required');
aType(Array.isArray(input.lines), 'lines must be an array');

var seen = {}, commandLines = [], detailByKey = {};
input.lines.forEach(function (f0, i) {


expandSourceFacts(type, cfg, f0).forEach(function (f) {
var p = projectLine(type, cfg, f, i);
aRange(seen[p.commandLine.lineKey] !== 1, 'duplicate line natural key: ' + p.commandLine.lineKey);
seen[p.commandLine.lineKey] = 1;
commandLines.push(p.commandLine);
detailByKey[p.commandLine.lineKey] = p.detail;
});
});


commandLines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
var lineDetails = {};
commandLines.forEach(function (l) { lineDetails[l.lineKey] = detailByKey[l.lineKey]; });

var command = {
recommendationType: type, mode: input.mode, planningCycle: input.planningCycle,
businessScope: input.businessScope, recommendedLines: commandLines,
calculationRunId: input.calculationRunId,
formulaVersion: input.formulaVersion !== undefined ? input.formulaVersion : null,
sourceDataAsOf: input.sourceDataAsOf !== undefined ? input.sourceDataAsOf : null
};
return {
command: command,
lineDetails: lineDetails,
generationType: generationType,
recommendationType: type,
userQtyColumn: cfg.userQty
};
}

return {
SEP: SEP,
MODE_TO_GENERATION_TYPE: (function () { var o = {}; for (var k in MODE_TO_GENERATION_TYPE) o[k] = MODE_TO_GENERATION_TYPE[k]; return o; })(),
LIVE_ANALYSIS_FORBIDDEN: (function () { var o = {}; for (var k in LIVE_ANALYSIS_FORBIDDEN) o[k] = 1; return o; })(),
mapGenerationType: mapGenerationType,
buildLineKey: buildLineKey,
splitLineKey: splitLineKey,
assertNoLiveAnalysisAuthority: assertNoLiveAnalysisAuthority,
buildRecommendation: buildRecommendation,


allocateWholeCartonSources: allocateWholeCartonSources,
wholeCartonAvailable: wholeCartonAvailable
};
});
__kmRegister("supply-planning-plan-builder", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;














(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)),
req ? req('./supply-planning-plan-builder.js') : (root.KMPB || (root.KM && root.KM.planBuilder))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.persistencePlanBuilder = api; }
})(this, function (REPO, PB) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function aRange(c, m) { if (!c) throw new RangeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function str(v) { return String(v === undefined || v === null ? '' : v); }
function clone(o) { var r = {}; for (var k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }


var STATUS_MAP = { ACTIVE: 'active', BLOCKED: 'blocked', SUPERSEDED: 'superseded', SUPERSEDED_USER_REVIEW: 'superseded_user_review' };

function typeCfg(type) { aRange(REPO && REPO.TABLES && REPO.TABLES[type], 'unknown recommendationType: ' + type); return REPO.TABLES[type]; }
function indexByKey(lines) { var m = {}; (lines || []).forEach(function (l) { m[l.lineKey] = l; }); return m; }


function buildHeaderRow(type, cfg, draftId, scope, generationType, calcRunId, formulaVersion, sourceDataAsOf, draftVersion) {
var row = {}; row[cfg.headerId] = draftId;
cfg.scope.forEach(function (c) { row[c] = scope[c] === undefined || scope[c] === null ? '' : scope[c]; });
row.status = 'draft';
row.generation_type = generationType;
row.calculation_run_id = calcRunId;
row.formula_version = formulaVersion === undefined || formulaVersion === null ? '' : formulaVersion;
row.source_data_as_of = sourceDataAsOf === undefined || sourceDataAsOf === null ? '' : sourceDataAsOf;
row.draft_version = draftVersion;
return row;
}


function buildPersistencePlan(args) {
aType(isObj(args), 'args must be an object');
var type = args.recommendationType, cfg = typeCfg(type);
aType(isObj(args.identity) && typeof args.identity.draftId === 'string' && args.identity.draftId.length > 0, 'identity.draftId required');
aType(isObj(args.nextStore) && Array.isArray(args.nextStore.lines) && Array.isArray(args.nextStore.drafts), 'nextStore StoreSlice required');
var prevStore = isObj(args.prevStore) ? args.prevStore : { drafts: [], lines: [], runs: [] };
aType(isObj(args.coreResult), 'coreResult required');
aType(isObj(args.command), 'command required');
aType(isObj(args.lineDetails), 'lineDetails required');
aType(typeof args.generationType === 'string' && args.generationType.length > 0, 'generationType required');

aType(isObj(args.expectedToken) && args.expectedToken.draft_version !== undefined && typeof args.expectedToken.userEditFingerprint === 'string', 'expectedToken (pre-calculation) required');

var draftId = args.identity.draftId;
var scope = isObj(args.command.businessScope) ? args.command.businessScope : {};
var scopeWithCycle = clone(scope); if (args.command.planningCycle !== undefined) scopeWithCycle.planning_cycle = args.command.planningCycle;
var businessScopeKey = args.identity.businessScopeKey || REPO.buildBusinessScopeKey(type, scopeWithCycle);
var calcRunId = args.coreResult.calculationRunId || args.command.calculationRunId;
var draftVersion = args.coreResult.draftVersion;
aType(calcRunId, 'calculationRunId required (coreResult/command)');
aType(draftVersion !== undefined, 'draftVersion required (coreResult)');


var prevDraftExists = (prevStore.drafts || []).some(function (d) { return String(d.draftId) === String(draftId); });
var headerOp = {
op: prevDraftExists ? 'UPDATE' : 'INSERT',
naturalKey: (function () { var k = {}; k[cfg.headerId] = draftId; return k; })(),
row: buildHeaderRow(type, cfg, draftId, scopeWithCycle, args.generationType, calcRunId, args.command.formulaVersion, args.command.sourceDataAsOf, draftVersion)
};

var prevByKey = indexByKey(prevStore.lines.filter(function (l) { return String(l.draftId) === String(draftId); }));
var nextLines = args.nextStore.lines.filter(function (l) { return String(l.draftId) === String(draftId); }).slice();
nextLines.sort(function (a, b) { return cmpStr(str(a.lineKey), str(b.lineKey)); });

var lineOps = [], lineageOps = [];
nextLines.forEach(function (nl) {
var lineKey = nl.lineKey;
var nkComponents = PB.splitLineKey(type, lineKey);
var naturalKey = clone(nkComponents); naturalKey[cfg.lineDraftId] = draftId;
var nextStatus = nl.lineStatus;
var prev = prevByKey[lineKey];

if (nextStatus === 'SUPERSEDED' || nextStatus === 'SUPERSEDED_USER_REVIEW') {

if (prev && (prev.lineStatus === 'SUPERSEDED' || prev.lineStatus === 'SUPERSEDED_USER_REVIEW')) return;
lineOps.push({ op: 'SUPERSEDE', naturalKey: naturalKey, targetLineStatus: STATUS_MAP[nextStatus] });
return;
}

var detail = args.lineDetails[lineKey] || { row: {} };
var blocked = nextStatus === 'BLOCKED';
var row = clone(isObj(detail.row) ? detail.row : {});

if (!blocked) {
row.recommended_qty = (nl.recommendedQty === undefined || nl.recommendedQty === null) ? '' : nl.recommendedQty;
if (nl.userQty !== undefined && nl.userQty !== null) row[cfg.userQty] = nl.userQty;
} else {
row.recommended_qty = '';
if (detail.reason) row.recommendation_flags = row.recommendation_flags !== undefined ? row.recommendation_flags : detail.reason;
}
var op = prev && prev.lineStatus !== 'SUPERSEDED' && prev.lineStatus !== 'SUPERSEDED_USER_REVIEW' ? 'UPDATE' : (prev ? 'UPDATE' : 'INSERT');
var lineOp = { op: op, naturalKey: naturalKey, row: row, targetLineStatus: blocked ? 'blocked' : 'active' };

if (op === 'UPDATE' && prev && prev.userEdited === true) lineOp.preserveUserQty = true;
lineOps.push(lineOp);
lineageOps.push({ naturalKey: naturalKey });
});


var nextDraft = args.nextStore.drafts.filter(function (d) { return String(d.draftId) === String(draftId); })[0];
var t = (nextDraft && nextDraft.totals) || {};
var totals = {
totalRecommendedQty: t.totalRecommendedQty || 0, totalUserQty: t.totalUserQty || 0,
activeLineCount: t.activeLineCount || 0, blockedCount: t.blockedCount || 0, supersededCount: t.supersededCount || 0
};

var counts = args.coreResult.counts || {};
var auditEvents = [{
event: 'recommendation_draft_persisted', op: args.coreResult.action, recommendationType: type,
draftId: draftId, calculationRunId: calcRunId, draftVersion: draftVersion, generationType: args.generationType,
inserted: counts.created || 0, updated: counts.updated || 0, superseded: counts.superseded || 0,
blocked: counts.blocked || 0, skipped: counts.skipped || 0
}];

var plan = {
recommendationType: type,
sourceTables: { header: cfg.header, lines: cfg.lines },
draftId: draftId,
activeKey: args.identity.activeKey || (type + '::' + businessScopeKey),
calculationRunId: calcRunId,
draftVersion: draftVersion,
expectedToken: args.expectedToken,
runMeta: {
planning_cycle: args.command.planningCycle, business_scope_key: businessScopeKey,
formulaVersion: args.command.formulaVersion, sourceDataAsOf: args.command.sourceDataAsOf, action: args.coreResult.action
},
headerOp: headerOp,
lineOps: lineOps,
lineageOps: lineageOps,
totals: totals,
stages: REPO.STAGES.slice(),
auditEvents: auditEvents
};

REPO.validatePersistencePlan(plan);
return plan;
}

return {
STATUS_MAP: (function () { var o = {}; for (var k in STATUS_MAP) o[k] = STATUS_MAP[k]; return o; })(),
buildPersistencePlan: buildPersistencePlan
};
});
__kmRegister("supply-planning-persistence-plan-builder", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-persistence.js') : (root.KMPC || (root.KM && root.KM.persistence)),
req ? req('./supply-planning-plan-builder.js') : (root.KMPB || (root.KM && root.KM.planBuilder)),
req ? req('./supply-planning-persistence-plan-builder.js') : (root.KMPPB || (root.KM && root.KM.persistencePlanBuilder)),
req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.recommendationOrchestrator = api; }
})(this, function (KMPC, KMPB, KMPPB, KMPR) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function aRange(c, m) { if (!c) throw new RangeError(m); }
function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function isBool(v) { return v === true || v === 'TRUE' || v === 'true'; }

var TERMINAL = { submitted: 1, cancelled: 1 };
var REPO_STATUS_TO_CORE = { active: 'ACTIVE', blocked: 'BLOCKED', superseded: 'SUPERSEDED', superseded_user_review: 'SUPERSEDED_USER_REVIEW', '': 'ACTIVE', draft: 'ACTIVE' };

function res(status, extra) {
var d = { status: status, success: status === 'COMPLETED', reason: null, draftId: null, calculationRunId: null, draftVersion: null, generationType: null, coreAction: null, lock: null, wrote: status === 'COMPLETED' };
if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
return d;
}




function storeSliceFromRepoSnapshot(snapshot, type, planningCycle, businessScope) {
if (!snapshot || !snapshot.draft) return KMPC.createStore();
var base = [];
(snapshot.lines || []).forEach(function (l) {
var st = String(l.lineStatus || '').trim();
if (st === 'superseded' || st === 'superseded_user_review') return;
var raw = l.raw || {};
var lineKey = KMPB.buildLineKey(type, raw);
if (st === 'blocked') { base.push({ lineKey: lineKey, lineState: 'BLOCKED', reason: String(raw.recommendation_flags || raw.recommendation_reason || 'BLOCKED') }); }
else { base.push({ lineKey: lineKey, recommendedQty: num(raw.recommended_qty) === null ? 0 : num(raw.recommended_qty), lineState: 'OK' }); }
});
var g0 = KMPC.generateRecommendationDraft(KMPC.createStore(), {
recommendationType: type, mode: 'SCHEDULED_REFRESH', planningCycle: planningCycle, businessScope: businessScope, recommendedLines: base
});
var store = g0.store, draftId = g0.result.draftId, cfg = KMPR.TABLES[type];

(snapshot.lines || []).forEach(function (l) {
var st = String(l.lineStatus || '').trim();
if (st === 'superseded' || st === 'superseded_user_review') return;
if (!isBool(l.userEdited)) return;
var raw = l.raw || {}; var q = num(raw[cfg.userQty]);
if (q !== null) { try { KMPC.applyUserEdit(store, { draftId: draftId, lineKey: KMPB.buildLineKey(type, raw), userQty: q, actor: String(raw.user_edited_by || 'user') }); } catch (e) {  } }
});

var d = store.drafts[0]; if (d) d.draftVersion = num(snapshot.draft.draft_version) === null ? d.draftVersion : num(snapshot.draft.draft_version);
return store;
}



function computeKeyedDeltaWrites(before, after) {
aType(Array.isArray(before) && Array.isArray(after), 'before/after must be arrays');
var updates = [], appends = [];
for (var i = 0; i < before.length && i < after.length; i++) {
if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) updates.push({ rowIndex: i, values: after[i] });
}
for (var j = before.length; j < after.length; j++) appends.push(after[j]);
return { updates: updates, appends: appends, unchanged: before.length - updates.length };
}




function runRecommendationGeneration(input, deps) {
aType(isObj(input), 'input must be an object');
var type = input.recommendationType;
aRange(KMPR.TABLES[type], 'unknown recommendationType: ' + type);
aRange(input.mode === 'SCHEDULED_REFRESH' || input.mode === 'MANUAL_REGENERATE', 'unsupported mode: ' + input.mode);
aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
aType(isObj(input.businessScope), 'businessScope required');
aType(isObj(deps) && typeof deps.loadActiveContext === 'function' && typeof deps.computeFacts === 'function' && typeof deps.lockedApply === 'function', 'deps.loadActiveContext/computeFacts/lockedApply required');
var query = { recommendationType: type, planningCycle: input.planningCycle, businessScope: input.businessScope };


var canonical = KMPC.resolveActiveDraft(KMPC.createStore(), query);
var canonicalDraftId = canonical.draftId, activeKey = canonical.activeKey;


var active = deps.loadActiveContext(query);
if (isObj(active) && active.status === 'BLOCKED_CONFLICT') return res('BLOCKED_CONFLICT', { reason: 'DUPLICATE_ACTIVE_DRAFT', draftId: canonicalDraftId, matchCount: active.matchCount });
if (isObj(active) && active.status === 'REUSE' && String(active.draftId) !== String(canonicalDraftId)) return res('BLOCKED_CONFLICT', { reason: 'FOREIGN_DRAFT_ADOPT_REQUIRED', draftId: canonicalDraftId, foundDraftId: active.draftId });



var priorSnapshot = typeof deps.loadPriorSnapshot === 'function' ? deps.loadPriorSnapshot(canonicalDraftId) : null;
var priorDraft = priorSnapshot && priorSnapshot.draft ? priorSnapshot.draft : null;


if (priorDraft && KMPR.isGenerationBlockedStatus(priorDraft.status)) {
var ps = String(priorDraft.status).trim().toLowerCase();
var rsn = KMPR.isTerminalDraftStatus(ps) ? ('IMMUTABLE_TERMINAL_STATUS:' + ps) : ('GENERATION_BLOCKED_STATUS:' + ps);
return res('BLOCKED_CONFLICT', { reason: rsn, draftId: canonicalDraftId });
}
var reuse = !!priorDraft;
var priorVersion = priorSnapshot && priorSnapshot.draft ? (num(priorSnapshot.draft.draft_version) === null ? 1 : num(priorSnapshot.draft.draft_version)) : 1;
var priorTokenLines = priorSnapshot ? (priorSnapshot.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }) : [];
var expectedToken = KMPR.computeExpectedToken(priorVersion, priorTokenLines);


var facts = deps.computeFacts(query);
aType(isObj(facts) && Array.isArray(facts.lines), 'computeFacts must return { lines:[...] }');
if (facts.ready === false) return res('BLOCKED_CONFLICT', { reason: 'SOURCE_NOT_READY:' + (facts.reason || 'UNKNOWN'), draftId: canonicalDraftId });


var built = KMPB.buildRecommendation({
recommendationType: type, mode: input.mode, planningCycle: input.planningCycle, businessScope: input.businessScope,
calculationRunId: 'PENDING', formulaVersion: facts.formulaVersion, sourceDataAsOf: facts.sourceDataAsOf, draftVersion: 1, lines: facts.lines
});
built.command.confirmRegenerateOverUserEdits = input.confirmRegenerateOverUserEdits === true;


var priorStore = reuse && priorSnapshot ? storeSliceFromRepoSnapshot(priorSnapshot, type, input.planningCycle, input.businessScope) : KMPC.createStore();
var gen = KMPC.generateRecommendationDraft(priorStore, built.command);
if (gen.result.status === 'BLOCKED') return res('BLOCKED_CONFLICT', { reason: gen.result.reason, draftId: canonicalDraftId, draftVersion: gen.result.draftVersion, generationType: built.generationType, coreAction: 'BLOCKED' });


var plan = KMPPB.buildPersistencePlan({
recommendationType: type, identity: { draftId: gen.result.draftId, activeKey: activeKey, businessScopeKey: KMPR.buildBusinessScopeKey(type, withCycle(input.planningCycle, input.businessScope)) },
prevStore: priorStore, nextStore: gen.store, coreResult: gen.result, command: built.command, lineDetails: built.lineDetails,
generationType: built.generationType, expectedToken: expectedToken, actor: input.actor || 'system', now: input.now || ''
});


var lock = deps.lockedApply(plan, expectedToken, { actor: input.actor || 'system', now: input.now || '', generationType: built.generationType, recommendationType: type, draftId: gen.result.draftId });
var okStatus = lock && lock.status === 'COMPLETED';
return res(okStatus ? 'COMPLETED' : (lock && lock.status) || 'FAILED', {
reason: okStatus ? null : (lock && lock.reason) || 'LOCKED_APPLY_FAILED',
draftId: gen.result.draftId, calculationRunId: gen.result.calculationRunId, draftVersion: gen.result.draftVersion,
generationType: built.generationType, coreAction: gen.result.action, lock: lock, wrote: okStatus
});
}

function withCycle(cycle, scope) { var o = {}; for (var k in scope) o[k] = scope[k]; o.planning_cycle = cycle; return o; }

return {
TERMINAL: { submitted: 1, cancelled: 1 },
storeSliceFromRepoSnapshot: storeSliceFromRepoSnapshot,
computeKeyedDeltaWrites: computeKeyedDeltaWrites,
runRecommendationGeneration: runRecommendationGeneration
};
});
__kmRegister("supply-planning-recommendation-orchestrator", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;

















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)));
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.userEdit = api; }
})(this, function (KMPR) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function errMsg(e) { return (e && e.message !== undefined && e.message !== null) ? String(e.message) : String(e); }
function tokenEq(a, b) { return !!a && !!b && String(a.draft_version) === String(b.draft_version) && String(a.userEditFingerprint) === String(b.userEditFingerprint); }

var STATUS = { COMPLETED: 'COMPLETED', LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', CONFLICT: 'CONFLICT', BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', FAILED: 'FAILED' };
var REQUIRED_DEPS = ['acquireLock', 'releaseLock', 'reloadSnapshot', 'recomputeToken', 'applyEdits'];






function runUserDecisionEdit(command, deps) {
aType(isObj(command), 'command must be an object');
aType(KMPR.TABLES[command.recommendationType], 'unknown recommendationType');
aType(typeof command.draftId === 'string' && command.draftId.length > 0, 'command.draftId required');
aType(Array.isArray(command.edits) && command.edits.length > 0, 'command.edits must be a non-empty array');
aType(isObj(command.expectedToken) && command.expectedToken.draft_version !== undefined && typeof command.expectedToken.userEditFingerprint === 'string', 'command.expectedToken required (pre-edit)');
aType(isObj(deps), 'deps required');
REQUIRED_DEPS.forEach(function (fn) { aType(typeof deps[fn] === 'function', 'deps.' + fn + ' required'); });

var issues = [];
var draftId = command.draftId, expected = command.expectedToken;
function audit(ev) { if (typeof deps.audit === 'function') { try { deps.audit(ev); } catch (ae) { issues.push('AUDIT_FAILED:' + errMsg(ae)); } } }
function dto(status, extra) {
var d = { success: status === STATUS.COMPLETED, status: status, reason: null, draftId: draftId, applied: false, conflict: false, counts: null, issues: [] };
if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
return d;
}
function finish(d) { d.issues = issues.slice().sort(cmpStr); audit({ event: 'user_decision_edit_result', status: d.status, reason: d.reason, draftId: draftId }); return d; }


var acquired = false, acqErr = null;
try { acquired = deps.acquireLock() === true; } catch (e) { acqErr = e; }
if (acqErr) return finish(dto(STATUS.LOCK_UNAVAILABLE, { reason: 'LOCK_ERROR:' + errMsg(acqErr) }));
if (!acquired) return finish(dto(STATUS.LOCK_UNAVAILABLE, { reason: 'LOCK_UNAVAILABLE' }));

var result = null;
try {
var snap = deps.reloadSnapshot();
if (!snap || !snap.draft) { result = dto(STATUS.CONFLICT, { reason: 'DRAFT_NOT_FOUND', conflict: true }); }
else if (KMPR.isTerminalDraftStatus(snap.draft.status)) { result = dto(STATUS.BLOCKED_CONFLICT, { reason: 'IMMUTABLE_TERMINAL_STATUS:' + String(snap.draft.status).trim().toLowerCase(), conflict: true }); }
else {
var live = deps.recomputeToken(snap);
if (!tokenEq(live, expected)) { result = dto(STATUS.CONFLICT, { reason: 'CONCURRENCY_TOKEN_MISMATCH', conflict: true, expectedToken: expected, liveToken: live }); }
else {
var r = deps.applyEdits(command);
if (r && r.status === 'APPLIED') { result = dto(STATUS.COMPLETED, { reason: null, applied: r.counts || true, counts: r.counts || null }); }
else if (r && (r.status === 'DUPLICATE_LINE_KEY' || r.status === 'INVALID_EDIT_FIELD' || r.status === 'LINE_NOT_FOUND')) { result = dto(STATUS.CONFLICT, { reason: r.reason || r.status, conflict: true, counts: r.counts || null }); }
else { result = dto(STATUS.FAILED, { reason: (r && (r.reason || r.status)) || 'APPLY_EDITS_FAILED' }); }
}
}
} catch (e2) {
result = dto(STATUS.FAILED, { reason: 'EXCEPTION:' + errMsg(e2) });
} finally {
try { deps.releaseLock(); } catch (re) { issues.push('RELEASE_FAILED:' + errMsg(re)); }
}
if (!result) result = dto(STATUS.FAILED, { reason: 'NO_RESULT' });
return finish(result);
}

return {
STATUS: { COMPLETED: 'COMPLETED', LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', CONFLICT: 'CONFLICT', BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', FAILED: 'FAILED' },
REQUIRED_DEPS: REQUIRED_DEPS.slice(),
runUserDecisionEdit: runUserDecisionEdit
};
});
__kmRegister("supply-planning-user-edit", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;


















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations)),
req ? req('./supply-planning-ledgers.js') : (root.KMLEDGER || (root.KM && root.KM.ledgers)),
req ? req('./supply-planning-supply-candidates.js') : (root.KMCAND || (root.KM && root.KM.supplyCandidates)),
req ? req('./supply-planning-incoming-adapters.js') : (root.KMINC || (root.KM && root.KM.incomingAdapters)),
req ? req('./supply-planning-qualified-incoming.js') : (root.KMQI || (root.KM && root.KM.qualifiedIncoming)),
req ? req('./supply-planning-allocations.js') : (root.KMALLOC || (root.KM && root.KM.allocations))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.sourceFacts = api; }
})(this, function (CALC, LEDGER, CAND, INC, QI, ALLOC) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nonEmpty(v) { return str(v).length > 0; }

function readQty(v) {
if (v === undefined || v === null || v === '') return { qty: null, missing: true };
var n = Number(v); if (!isFinite(n)) return { qty: null, missing: true, invalid: true };
return { qty: n, missing: false };
}



var READINESS_STATES = {
OK: 1, STALE_SNAPSHOT: 1, MISSING_SNAPSHOT: 1, MISSING_FORECAST: 1, MISSING_SALES_BASIS: 1,
IDENTITY_CONFLICT: 1, DUPLICATE_SOURCE: 1, BLOCKED_CONFLICT: 1, SOURCE_NOT_AVAILABLE: 1
};
var CURRENT_STOCK_POOL_TYPES = { FBA: 1, THREE_PL: 1, FACTORY: 1 };
var POOL_TYPES = { FBA: 1, THREE_PL: 1, FACTORY: 1 };
var DEMAND_TYPES = { REGULAR: 1, SALES_RUN_RATE: 1, SPECIAL_EVENT: 1, SAFETY: 1 };




var ACTIVE_BUCKETS = {
COMMITTED_PRODUCTION: 1, APPROVED_SHIPPING_PLAN: 1, SHIPPED_IN_TRANSIT: 1,
DELIVERED_NOT_RECEIVED: 1, RECEIVED_NOT_REFLECTED: 1, CURRENT_STOCK: 1
};
var EXCLUDED_BUCKETS = { DRAFT: 1, CANCELLED_INVALID: 1, CORRECTION_REVERSAL: 1 };







var OMIT_TRANSFERRED = 'OMIT_TRANSFERRED', OMIT_POSTED = 'OMIT_POSTED', OMIT_RECEIVING_AUTHORITY = 'OMIT_RECEIVING_AUTHORITY';


var PRODUCTION_STATUS_MAP = {
draft: 'DRAFT',
issued: 'COMMITTED_PRODUCTION', in_production: 'COMMITTED_PRODUCTION',
partial_completed: 'COMMITTED_PRODUCTION', completed: 'COMMITTED_PRODUCTION',
partial_shipped: OMIT_TRANSFERRED, shipped: OMIT_TRANSFERRED,
closure: 'CANCELLED_INVALID', cancelled: 'CANCELLED_INVALID'
};

var SHIPPING_PLAN_STATUS_MAP = {
draft: 'DRAFT', pending_approval: 'DRAFT',
approved: 'APPROVED_SHIPPING_PLAN',
cancelled: 'CANCELLED_INVALID',
completed: OMIT_TRANSFERRED
};







var SHIPMENT_STATUS_MAP = {
draft: 'DRAFT',
ready_to_ship: 'APPROVED_SHIPPING_PLAN',
shipped: 'SHIPPED_IN_TRANSIT', in_transit: 'SHIPPED_IN_TRANSIT',
arrived: 'SHIPPED_IN_TRANSIT',


partially_received: 'SHIPPED_IN_TRANSIT', partial_received: 'SHIPPED_IN_TRANSIT',
received: OMIT_RECEIVING_AUTHORITY,
closed: OMIT_POSTED,
cancelled: 'CANCELLED_INVALID'
};



var ROUTE_EVENT_MAP = {
arrived: 'SHIPPED_IN_TRANSIT', arrived_port: 'SHIPPED_IN_TRANSIT', delivered: 'DELIVERED_NOT_RECEIVED',
received: 'RECEIVED_NOT_REFLECTED',
correction: 'CORRECTION_REVERSAL', reversal: 'CORRECTION_REVERSAL'
};


var RECEIVING_STATUS_MAP = {
draft: 'DRAFT', confirmed: 'RECEIVED_NOT_REFLECTED', reversed: 'CORRECTION_REVERSAL'
};


function classifySourceReadiness(input) {
aType(isObj(input), 'classifySourceReadiness: input must be an object');
var r = CALC.classifyPlanningDataState(input);
return { ready: r.calculationAllowed === true, status: r.state, reason: r.state === 'OK' ? null : r.state };
}




function resolveSourceIdentity(input) {
aType(isObj(input) && isObj(input.rawScope), 'resolveSourceIdentity: input.rawScope required');
var q = input.rawScope, issues = [];
var company = str(q.company), country = str(q.country), marketplace = str(q.marketplace), masterSku = str(q.sku);
function block(status, reason) { return { status: status, reason: reason, identity: null, issues: issues.concat([reason]) }; }
if (!nonEmpty(masterSku)) return block('BLOCKED_CONFLICT', 'MISSING_MASTER_SKU');
if (!nonEmpty(company)) return block('BLOCKED_CONFLICT', 'MISSING_COMPANY');


var skuRows = (input.skuDetailRows || []).filter(function (r) { return str(r.sku) === masterSku; });
if (skuRows.length === 0) return block('SOURCE_NOT_AVAILABLE', 'MASTER_SKU_NOT_FOUND:' + masterSku);
if (skuRows.length > 1) return block('DUPLICATE_SOURCE', 'DUPLICATE_MASTER_SKU:' + masterSku);


var msRows = (input.marketplaceSkuRows || []).filter(function (r) {
return str(r.company) === company && str(r.country) === country && str(r.marketplace) === marketplace && str(r.sku) === masterSku;
});
var marketplaceSkuId = null, siteSku = null, fulfillmentModel = null;
if (msRows.length > 1) return block('IDENTITY_CONFLICT', 'DUPLICATE_MARKETPLACE_SKU:' + [company, country, marketplace, masterSku].join('|'));
if (msRows.length === 1) {
marketplaceSkuId = str(msRows[0].marketplace_sku_id) || null;
siteSku = str(msRows[0].site_sku) || null;
fulfillmentModel = str(msRows[0].fulfillment_model) || null;
} else { issues.push('MARKETPLACE_SKU_NOT_FOUND:' + [company, country, marketplace, masterSku].join('|')); }


var destinationWarehouseId = nonEmpty(input.destinationWarehouseId) ? str(input.destinationWarehouseId) : null;
var sourceWarehouseId = nonEmpty(input.sourceWarehouseId) ? str(input.sourceWarehouseId) : null;
if (destinationWarehouseId && (input.warehouseRows || []).length) {
var wh = (input.warehouseRows || []).filter(function (r) { return str(r.warehouse_id) === destinationWarehouseId; });
if (wh.length === 0) issues.push('DESTINATION_WAREHOUSE_NOT_FOUND:' + destinationWarehouseId);
else if (wh.length > 1) return block('DUPLICATE_SOURCE', 'DUPLICATE_WAREHOUSE_ID:' + destinationWarehouseId);
}

return {
status: 'RESOLVED', reason: null,
identity: {
masterSku: masterSku, marketplaceSkuId: marketplaceSkuId, company: company, country: country || null,
marketplace: marketplace || null, siteSku: siteSku, fulfillmentModel: fulfillmentModel,
destinationWarehouseId: destinationWarehouseId, sourceWarehouseId: sourceWarehouseId
},
issues: issues
};
}




function projectDemandLedger(input) {
aType(isObj(input), 'projectDemandLedger: input must be an object');
aType(nonEmpty(input.masterSku) && nonEmpty(input.company) && nonEmpty(input.destinationWarehouseId) && nonEmpty(input.planningCycle), 'projectDemandLedger: masterSku/company/destinationWarehouseId/planningCycle required');
var rows = input.demandRows || [], entries = [], issues = [];
for (var i = 0; i < rows.length; i++) {
var d = rows[i] || {}, dt = str(d.demandType);
if (DEMAND_TYPES[dt] !== 1) { issues.push({ i: i, reason: 'UNKNOWN_DEMAND_TYPE:' + dt }); continue; }
var qr = readQty(d.quantity);
if (qr.missing) { issues.push({ i: i, reason: 'MISSING_DEMAND_QUANTITY:' + str(d.sourceRef) }); continue; }
var entry = {
demandType: dt, masterSku: str(input.masterSku), company: str(input.company),
country: input.country == null ? null : str(input.country), marketplace: input.marketplace == null ? null : str(input.marketplace),
destinationWarehouseId: str(input.destinationWarehouseId), planningCycle: str(input.planningCycle),
requiredByDate: str(d.requiredByDate), sourceRef: str(d.sourceRef), quantity: qr.qty
};
if (dt === 'SPECIAL_EVENT') entry.eventId = str(d.eventId);
entries.push(entry);
}
var ledger = LEDGER.buildDemandLedger({ entries: entries });
return { entries: entries, ledger: ledger, issues: issues };
}







function buildCurrentStockEntries(masterSku, company, rows, issues) {
var entries = [];
for (var i = 0; i < rows.length; i++) {
var s = rows[i] || {}, pt = str(s.poolType);
if (CURRENT_STOCK_POOL_TYPES[pt] !== 1) { issues.push({ i: i, reason: 'UNKNOWN_POOL_TYPE:' + pt }); continue; }
if (!nonEmpty(s.warehouseId)) { issues.push({ i: i, reason: 'MISSING_WAREHOUSE_ID' }); continue; }
var qr = readQty(s.quantity);
if (qr.missing) { issues.push({ i: i, reason: 'MISSING_STOCK_QUANTITY:' + str(s.warehouseId) }); continue; }
entries.push({
supplyLineageRef: nonEmpty(s.supplyLineageRef) ? str(s.supplyLineageRef) : ('stock:' + pt + ':' + str(s.warehouseId) + ':' + str(masterSku)),
masterSku: str(masterSku), company: str(company), warehouseId: str(s.warehouseId),
poolType: pt, lifecycleBucket: 'CURRENT_STOCK', quantity: qr.qty
});
}
return entries;
}

function projectCurrentStockSupplyLedger(input) {
aType(isObj(input), 'projectCurrentStockSupplyLedger: input must be an object');
aType(nonEmpty(input.masterSku) && nonEmpty(input.company), 'projectCurrentStockSupplyLedger: masterSku/company required');
var issues = [];
var entries = buildCurrentStockEntries(input.masterSku, input.company, input.stockRows || [], issues);
var ledger = LEDGER.buildSupplyLedger({ entries: entries });
return { entries: entries, ledger: ledger, issues: issues };
}



function adaptIncomingSupplyCandidates(input) {
aType(isObj(input) && Array.isArray(input.shipmentInputs), 'adaptIncomingSupplyCandidates: input.shipmentInputs[] required');
aType(isObj(input.scope), 'adaptIncomingSupplyCandidates: input.scope required');
var results = [], issues = [];
for (var i = 0; i < input.shipmentInputs.length; i++) {
try {
var candidate = CAND.buildKmShipmentSupplyCandidate(input.shipmentInputs[i]);
results.push(INC.adaptKmShipmentIncomingCandidate({ candidate: candidate, scope: input.scope }));
} catch (e) { issues.push({ i: i, reason: 'ADAPT_FAILED:' + (e && e.message ? e.message : e) }); }
}
return { results: results, issues: issues };
}





function projectSupplyLifecycle(input) {
aType(isObj(input), 'projectSupplyLifecycle: input must be an object');
var entries = [], issues = [];
function addIssue(domain, i, reason) { issues.push({ domain: domain, i: i, reason: reason }); }



function projectRows(domain, rows, statusMap, statusKeyField, fixedBucket) {
rows = rows || [];
aType(Array.isArray(rows), 'projectSupplyLifecycle: input.' + domain + ' must be an array');
for (var i = 0; i < rows.length; i++) {
var r = rows[i]; aType(isObj(r), 'projectSupplyLifecycle: input.' + domain + '[' + i + '] must be an object');
var bucket;
if (fixedBucket) { bucket = fixedBucket; }
else {
var st = str(r[statusKeyField]).toLowerCase();
if (!st) { addIssue(domain, i, 'MISSING_STATUS'); continue; }
bucket = statusMap[st];
if (bucket === undefined) { addIssue(domain, i, 'UNKNOWN_STATUS:' + st); continue; }
if (bucket === OMIT_TRANSFERRED) { addIssue(domain, i, 'LINEAGE_TRANSFERRED_DOWNSTREAM:' + st); continue; }
if (bucket === OMIT_POSTED) { addIssue(domain, i, 'POSTED_TO_CURRENT_STOCK_AUTHORITY:' + st); continue; }
if (bucket === OMIT_RECEIVING_AUTHORITY) { addIssue(domain, i, 'RECEIVING_AUTHORITY_REQUIRED:' + st); continue; }
}
if (!nonEmpty(r.supplyLineageRef)) { addIssue(domain, i, 'MISSING_SUPPLY_LINEAGE_REF'); continue; }
if (!nonEmpty(r.company)) { addIssue(domain, i, 'MISSING_COMPANY'); continue; }
if (!nonEmpty(r.masterSku)) { addIssue(domain, i, 'MISSING_MASTER_SKU'); continue; }
if (!nonEmpty(r.warehouseId)) { addIssue(domain, i, 'MISSING_WAREHOUSE_ID'); continue; }
var pt = str(r.poolType);
if (POOL_TYPES[pt] !== 1) { addIssue(domain, i, 'UNKNOWN_POOL_TYPE:' + pt); continue; }
var qr = readQty(r.quantity);
if (qr.missing) { addIssue(domain, i, 'MISSING_QUANTITY:' + str(r.supplyLineageRef)); continue; }
if (qr.qty < 0) { addIssue(domain, i, 'NEGATIVE_QUANTITY:' + str(r.supplyLineageRef)); continue; }
entries.push({
supplyLineageRef: str(r.supplyLineageRef), masterSku: str(r.masterSku), company: str(r.company),
warehouseId: str(r.warehouseId), poolType: pt, lifecycleBucket: bucket, quantity: qr.qty,
eta: (nonEmpty(r.eta) ? str(r.eta) : null)
});
}
}


projectRows('committedProduction', input.committedProduction, PRODUCTION_STATUS_MAP, 'status', null);
projectRows('approvedShippingPlans', input.approvedShippingPlans, SHIPPING_PLAN_STATUS_MAP, 'status', null);


var shp = input.shipments;
if (shp !== undefined && shp !== null) {
aType(isObj(shp) && Array.isArray(shp.shipmentInputs) && isObj(shp.scope),
'projectSupplyLifecycle: input.shipments requires { shipmentInputs:[], scope:{} }');
var adapted = adaptIncomingSupplyCandidates({ shipmentInputs: shp.shipmentInputs, scope: shp.scope });
adapted.issues.forEach(function (x) { addIssue('shipment', x.i, x.reason); });
var qi = QI.evaluateQualifiedIncoming({
requiredByDate: shp.requiredByDate,
kmShipmentResults: adapted.results,
externalAuthorityResults: shp.externalResults || [],
postedToCurrentStockLineageKeys: shp.postedToCurrentStockLineageKeys || [],
activeOtherBucketLineageKeys: shp.activeOtherBucketLineageKeys || []
});
for (var k = 0; k < qi.candidateResults.length; k++) {
var cr = qi.candidateResults[k], c = cr.candidate;


var posted = cr.gateResults && cr.gateResults.NOT_POSTED_TO_CURRENT_STOCK === 'FAIL';
var otherBucket = (cr.exclusionReasons || []).indexOf('ACTIVE_IN_OTHER_BUCKET') >= 0;
if (posted || otherBucket) { addIssue('shipment', k, 'COUNT_ONCE_OWNED_ELSEWHERE:' + c.lineageKey); continue; }
var sst = str(c.status).toLowerCase();
if (!sst) { addIssue('shipment', k, 'MISSING_STATUS:' + c.lineageKey); continue; }
var sbucket = SHIPMENT_STATUS_MAP[sst];
if (sbucket === undefined) { addIssue('shipment', k, 'UNKNOWN_STATUS:' + sst); continue; }
if (sbucket === OMIT_POSTED) { addIssue('shipment', k, 'POSTED_TO_CURRENT_STOCK_AUTHORITY:' + sst); continue; }
if (sbucket === OMIT_RECEIVING_AUTHORITY) { addIssue('shipment', k, 'RECEIVING_AUTHORITY_REQUIRED:' + sst); continue; }
if (!nonEmpty(c.company)) { addIssue('shipment', k, 'MISSING_COMPANY:' + c.lineageKey); continue; }
if (!nonEmpty(c.sku)) { addIssue('shipment', k, 'MISSING_MASTER_SKU:' + c.lineageKey); continue; }
if (!nonEmpty(c.destinationWarehouseId)) { addIssue('shipment', k, 'MISSING_WAREHOUSE_ID:' + c.lineageKey); continue; }
var spt = 'THREE_PL';
var sqr = readQty(c.quantityRemaining);
if (sqr.missing) { addIssue('shipment', k, 'MISSING_QUANTITY:' + c.lineageKey); continue; }
if (sqr.qty < 0) { addIssue('shipment', k, 'NEGATIVE_QUANTITY:' + c.lineageKey); continue; }
entries.push({
supplyLineageRef: str(c.lineageKey), masterSku: str(c.sku), company: str(c.company),
warehouseId: str(c.destinationWarehouseId), poolType: spt, lifecycleBucket: sbucket, quantity: sqr.qty,
eta: (nonEmpty(c.eta) ? str(c.eta) : null)
});
}
}


projectRows('routeEvents', input.routeEvents, ROUTE_EVENT_MAP, 'eventType', null);
projectRows('receivingFacts', input.receivingFacts, RECEIVING_STATUS_MAP, 'status', null);


if (input.currentStockFacts !== undefined && input.currentStockFacts !== null) {
aType(Array.isArray(input.currentStockFacts), 'projectSupplyLifecycle: input.currentStockFacts must be an array');
aType(nonEmpty(input.masterSku) && nonEmpty(input.company), 'projectSupplyLifecycle: masterSku/company required for currentStockFacts');
var csIssues = [];
var csEntries = buildCurrentStockEntries(input.masterSku, input.company, input.currentStockFacts, csIssues);
csIssues.forEach(function (x) { addIssue('currentStock', x.i, x.reason); });
for (var ce = 0; ce < csEntries.length; ce++) entries.push(csEntries[ce]);
}


projectRows('correctionFacts', input.correctionFacts, null, null, 'CORRECTION_REVERSAL');


var ledger = LEDGER.buildSupplyLedger({ entries: entries });


var sortedEntries = entries.slice().sort(function (a, b) {
return cmpStr(a.company, b.company) || cmpStr(a.warehouseId, b.warehouseId) || cmpStr(a.masterSku, b.masterSku)
|| cmpStr(a.poolType, b.poolType) || cmpStr(a.lifecycleBucket, b.lifecycleBucket)
|| cmpStr(a.supplyLineageRef, b.supplyLineageRef) || (a.quantity - b.quantity);
});
issues.sort(function (a, b) { return cmpStr(a.domain, b.domain) || (a.i - b.i) || cmpStr(a.reason, b.reason); });
var lineageSet = {}, lineage = [];
sortedEntries.forEach(function (e) { if (!lineageSet[e.supplyLineageRef]) { lineageSet[e.supplyLineageRef] = 1; lineage.push(e.supplyLineageRef); } });
lineage.sort(cmpStr);

var blocked = ledger.blockedCount > 0;
var reason = null;
if (blocked) { for (var p = 0; p < ledger.pools.length; p++) { if (ledger.pools[p].state === 'BLOCKED_CONFLICT') { reason = ledger.pools[p].reason; break; } } }

return {
ready: !blocked,
status: blocked ? 'BLOCKED_CONFLICT' : 'OK',
reason: reason,
entries: sortedEntries,
ledger: ledger,
issues: issues,
lineage: lineage,
sourceDataAsOf: (input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf)
};
}







var OVERSEAS_POOL_TYPES = { FBA: 1, THREE_PL: 1 };
var FULFILLMENT_MODELS = { self_fulfilled: 1, platform_fulfilled: 1, hybrid: 1 };
var SURVIVAL_HORIZON_DAYS = 18;

function finiteNonNeg(v) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null; }
function isoDateOk(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return false; var mo = +m[2], d = +m[3]; return mo >= 1 && mo <= 12 && d >= 1 && d <= 31; }
function normalizeIdList(v, validate) {
if (!Array.isArray(v)) return { ok: false, list: null };
var seen = {}, out = [];
for (var i = 0; i < v.length; i++) { var t = str(v[i]); if (validate && validate(t) !== true) return { ok: false, list: null, bad: t }; if (t === '' && !validate) return { ok: false, list: null }; if (!seen[t]) { seen[t] = 1; out.push(t); } }
out.sort(cmpStr);
return { ok: true, list: out };
}

function projectAllocationInputs(input) {
aType(isObj(input), 'projectAllocationInputs: input must be an object');
var identity = input.identity; aType(isObj(identity), 'projectAllocationInputs: input.identity must be an object');
var company = str(identity.company), country = identity.country == null ? null : str(identity.country), masterSku = str(identity.masterSku);
aType(nonEmpty(company) && nonEmpty(masterSku), 'projectAllocationInputs: identity.company/masterSku required');
var demandLedger = input.demandLedger; aType(isObj(demandLedger) && Array.isArray(demandLedger.entries), 'projectAllocationInputs: input.demandLedger.entries required');
var supplyLedger = input.supplyLedger; aType(isObj(supplyLedger) && Array.isArray(supplyLedger.pools), 'projectAllocationInputs: input.supplyLedger.pools required');
var receiverFacts = input.receiverFacts == null ? [] : input.receiverFacts;
var factoryDemandFacts = input.factoryDemandFacts == null ? [] : input.factoryDemandFacts;
aType(Array.isArray(receiverFacts), 'projectAllocationInputs: input.receiverFacts must be an array');
aType(Array.isArray(factoryDemandFacts), 'projectAllocationInputs: input.factoryDemandFacts must be an array');

var issues = [], blockedInputs = [];
function addIssue(kind, key, reason) { issues.push({ kind: kind, key: key, reason: reason }); }


var demandByKey = {};
demandLedger.entries.forEach(function (e) {
demandByKey[e.demandKey] = e;
if (e.state === 'BLOCKED_CONFLICT') blockedInputs.push({ kind: 'DEMAND', key: e.demandKey, reason: e.reason || 'BLOCKED_CONFLICT' });
});


var overseasPools = [], factoryPools = [];
supplyLedger.pools.forEach(function (p) {
if (p.state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'SUPPLY', key: p.poolKey, reason: p.reason || 'BLOCKED_CONFLICT' }); return; }
var base = { poolKey: str(p.poolKey), poolType: str(p.poolType), warehouseId: str(p.warehouseId), effectiveSupplyQty: p.effectiveSupplyQty };
if (p.poolType === 'FACTORY') factoryPools.push(base);
else if (OVERSEAS_POOL_TYPES[p.poolType] === 1) overseasPools.push(base);
else addIssue('SUPPLY', str(p.poolKey), 'UNSUPPORTED_POOL_TYPE:' + str(p.poolType));
});


var overseasReceivers = [], seenRecv = {}, seenDemO = {};
for (var ri = 0; ri < receiverFacts.length; ri++) {
var rf = receiverFacts[ri]; aType(isObj(rf), 'projectAllocationInputs: input.receiverFacts[' + ri + '] must be an object');
var receiverKey = str(rf.receiverKey), demandKey = str(rf.demandKey);
if (!nonEmpty(receiverKey)) { addIssue('DEMAND', '@' + ri, 'MISSING_RECEIVER_KEY'); continue; }
if (!nonEmpty(demandKey)) { addIssue('DEMAND', receiverKey, 'MISSING_DEMAND_KEY'); continue; }
if (seenRecv[receiverKey]) { addIssue('DEMAND', receiverKey, 'DUPLICATE_RECEIVER_KEY'); continue; }
if (seenDemO[demandKey]) { addIssue('DEMAND', demandKey, 'DUPLICATE_DEMAND_KEY'); continue; }
var e = demandByKey[demandKey];
if (!e) { addIssue('DEMAND', demandKey, 'DEMAND_KEY_NOT_IN_LEDGER'); continue; }
if (e.state === 'BLOCKED_CONFLICT') { seenRecv[receiverKey] = 1; seenDemO[demandKey] = 1; continue; }
if (str(e.company) !== company) { addIssue('DEMAND', demandKey, 'COMPANY_SCOPE_MISMATCH'); continue; }
if (str(e.masterSku) !== masterSku) { addIssue('DEMAND', demandKey, 'MASTER_SKU_SCOPE_MISMATCH'); continue; }
if (country !== null && e.country != null && str(e.country) !== country) { addIssue('DEMAND', demandKey, 'COUNTRY_SCOPE_MISMATCH'); continue; }
var mkt = nonEmpty(rf.marketplace) ? str(rf.marketplace) : str(e.marketplace);
var dest = nonEmpty(rf.destinationWarehouseId) ? str(rf.destinationWarehouseId) : str(e.destinationWarehouseId);
if (!nonEmpty(mkt)) { addIssue('DEMAND', demandKey, 'MISSING_MARKETPLACE'); continue; }
if (!nonEmpty(dest)) { addIssue('DEMAND', demandKey, 'MISSING_DESTINATION_WAREHOUSE'); continue; }
var fm = nonEmpty(rf.fulfillmentModel) ? str(rf.fulfillmentModel) : (identity.fulfillmentModel == null ? '' : str(identity.fulfillmentModel));
if (FULFILLMENT_MODELS[fm] !== 1) { addIssue('DEMAND', demandKey, 'INVALID_FULFILLMENT_MODEL:' + fm); continue; }
var survival;
if (rf.survivalNeedQty !== undefined && rf.survivalNeedQty !== null) { survival = finiteNonNeg(rf.survivalNeedQty); if (survival === null) { addIssue('DEMAND', demandKey, 'INVALID_SURVIVAL_NEED'); continue; } }
else if (rf.dailyDemand !== undefined && rf.dailyDemand !== null) { var dd = finiteNonNeg(rf.dailyDemand); if (dd === null) { addIssue('DEMAND', demandKey, 'INVALID_DAILY_DEMAND'); continue; } survival = Math.ceil(SURVIVAL_HORIZON_DAYS * dd); }
else { addIssue('DEMAND', demandKey, 'MISSING_SURVIVAL_NEED'); continue; }
var pr = finiteNonNeg(rf.allocationPriority); if (pr === null) { addIssue('DEMAND', demandKey, 'MISSING_OR_INVALID_ALLOCATION_PRIORITY'); continue; }
var wt = finiteNonNeg(rf.demandWeight); if (wt === null) { addIssue('DEMAND', demandKey, 'MISSING_OR_INVALID_DEMAND_WEIGHT'); continue; }
var el = normalizeIdList(rf.eligiblePoolTypes, function (t) { return OVERSEAS_POOL_TYPES[t] === 1; });
if (!el.ok) { addIssue('DEMAND', demandKey, 'INVALID_ELIGIBLE_POOL_TYPES' + (el.bad ? ':' + el.bad : '')); continue; }
seenRecv[receiverKey] = 1; seenDemO[demandKey] = 1;
overseasReceivers.push({
receiverKey: receiverKey, demandKey: demandKey, marketplace: mkt, destinationWarehouseId: dest,
fulfillmentModel: fm, demandQty: e.effectiveDemandQty, survivalNeedQty: survival,
allocationPriority: pr, demandWeight: wt, eligiblePoolTypes: el.list
});
}

var overseasInput = null, overseasAllocation = null;
if (overseasReceivers.length) {
if (!nonEmpty(country)) { addIssue('DEMAND', '', 'MISSING_COUNTRY_FOR_OVERSEAS_SCOPE'); }
else {
overseasInput = { company: company, country: country, masterSku: masterSku, supplyPools: overseasPools, receivers: overseasReceivers };
overseasAllocation = ALLOC.allocateOverseasSharedPool(overseasInput);
}
}


var factoryDemands = [], seenDemF = {};
for (var fi = 0; fi < factoryDemandFacts.length; fi++) {
var ff = factoryDemandFacts[fi]; aType(isObj(ff), 'projectAllocationInputs: input.factoryDemandFacts[' + fi + '] must be an object');
var fdKey = str(ff.demandKey);
if (!nonEmpty(fdKey)) { addIssue('DEMAND', '@' + fi, 'MISSING_DEMAND_KEY'); continue; }
if (seenDemF[fdKey]) { addIssue('DEMAND', fdKey, 'DUPLICATE_DEMAND_KEY'); continue; }
var fe = demandByKey[fdKey];
if (!fe) { addIssue('DEMAND', fdKey, 'DEMAND_KEY_NOT_IN_LEDGER'); continue; }
if (fe.state === 'BLOCKED_CONFLICT') { seenDemF[fdKey] = 1; continue; }
if (str(fe.company) !== company) { addIssue('DEMAND', fdKey, 'COMPANY_SCOPE_MISMATCH'); continue; }
if (str(fe.masterSku) !== masterSku) { addIssue('DEMAND', fdKey, 'MASTER_SKU_SCOPE_MISMATCH'); continue; }
var fmkt = nonEmpty(ff.marketplace) ? str(ff.marketplace) : str(fe.marketplace);
var fdest = nonEmpty(ff.destinationWarehouseId) ? str(ff.destinationWarehouseId) : str(fe.destinationWarehouseId);
var rbd = nonEmpty(ff.requiredByDate) ? str(ff.requiredByDate) : str(fe.requiredByDate);
if (!nonEmpty(fmkt)) { addIssue('DEMAND', fdKey, 'MISSING_MARKETPLACE'); continue; }
if (!nonEmpty(fdest)) { addIssue('DEMAND', fdKey, 'MISSING_DESTINATION_WAREHOUSE'); continue; }
if (!isoDateOk(rbd)) { addIssue('DEMAND', fdKey, 'MISSING_OR_INVALID_REQUIRED_BY_DATE'); continue; }
var fpr = finiteNonNeg(ff.allocationPriority); if (fpr === null) { addIssue('DEMAND', fdKey, 'MISSING_OR_INVALID_ALLOCATION_PRIORITY'); continue; }
var few = normalizeIdList(ff.eligibleFactoryWarehouseIds, null);
if (!few.ok) { addIssue('DEMAND', fdKey, 'INVALID_ELIGIBLE_FACTORY_WAREHOUSES'); continue; }
seenDemF[fdKey] = 1;
factoryDemands.push({
demandKey: fdKey, company: company, marketplace: fmkt, destinationWarehouseId: fdest, requiredByDate: rbd,
allocationPriority: fpr, demandQty: fe.effectiveDemandQty, eligibleFactoryWarehouseIds: few.list
});
}

var factoryInput = null, factoryAllocation = null;
if (factoryDemands.length) {
factoryInput = { masterSku: masterSku, factoryPools: factoryPools, demands: factoryDemands };





factoryAllocation = (input.injectedFactoryAllocation && typeof input.injectedFactoryAllocation === 'object')
? input.injectedFactoryAllocation
: ALLOC.allocateFactoryDeterministic(factoryInput);
}


issues.sort(function (a, b) { return cmpStr(a.kind, b.kind) || cmpStr(a.key, b.key) || cmpStr(a.reason, b.reason); });
blockedInputs.sort(function (a, b) { return cmpStr(a.kind, b.kind) || cmpStr(a.key, b.key) || cmpStr(a.reason, b.reason); });
var lineageSet = {}, lineage = [];
function addLineage(k) { if (nonEmpty(k) && !lineageSet[k]) { lineageSet[k] = 1; lineage.push(k); } }
overseasReceivers.forEach(function (r) { addLineage(r.demandKey); });
factoryDemands.forEach(function (d) { addLineage(d.demandKey); });
overseasPools.forEach(function (p) { addLineage(p.poolKey); });
factoryPools.forEach(function (p) { addLineage(p.poolKey); });
lineage.sort(cmpStr);

var clean = (issues.length === 0 && blockedInputs.length === 0);
var reason = blockedInputs.length ? blockedInputs[0].reason : (issues.length ? issues[0].reason : null);
return {
ready: clean,
status: clean ? 'OK' : (blockedInputs.length ? 'BLOCKED_INPUTS_PRESENT' : 'ISSUES_PRESENT'),
reason: reason,
issues: issues,
overseasInput: overseasInput,
factoryInput: factoryInput,
overseasAllocation: overseasAllocation,
factoryAllocation: factoryAllocation,
blockedInputs: blockedInputs,
lineage: lineage,
sourceDataAsOf: (input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf)
};
}






var WEEKLY_LINE_KEY = ['sku', 'site_sku', 'window_code'];
var KEY_SEP = '';

function projectAllocationRecords(alloc, source, mode) {

var byDemand = {}, unalloc = {};
if (!alloc) return { byDemand: byDemand, unalloc: unalloc };
(alloc.allocations || []).forEach(function (a) {
var k = str(a.demandKey);
if (!byDemand[k]) byDemand[k] = [];
byDemand[k].push({
allocationKey: str(a.allocationKey), sourcePoolKey: str(a.sourcePoolKey), sourcePoolType: str(a.sourcePoolType),
sourceWarehouseId: str(a.sourceWarehouseId), allocatedQty: a.allocatedQty, allocationSequence: a.allocationSequence,
allocationReason: str(a.allocationReason), allocationSource: source, allocationMode: mode
});
});
(alloc.unallocatedDemand || []).forEach(function (u) { var k = str(u.demandKey); unalloc[k] = (unalloc[k] || 0) + u.unallocatedQty; });
return { byDemand: byDemand, unalloc: unalloc };
}

function resolveWeeklyRecommendationFacts(input) {
aType(isObj(input), 'resolveWeeklyRecommendationFacts: input must be an object');
aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'resolveWeeklyRecommendationFacts: planningCycle required');
aType(isObj(input.businessScope), 'resolveWeeklyRecommendationFacts: businessScope required');
var ap = input.allocationProjection; aType(isObj(ap), 'resolveWeeklyRecommendationFacts: allocationProjection required');
var facts = input.weeklyPlanningFacts == null ? [] : input.weeklyPlanningFacts;
aType(Array.isArray(facts), 'resolveWeeklyRecommendationFacts: weeklyPlanningFacts must be an array');
var planningCycle = str(input.planningCycle);
var scope = input.businessScope;
var formulaVersion = input.formulaVersion == null ? null : input.formulaVersion;
var sourceDataAsOf = input.sourceDataAsOf === undefined ? (ap.sourceDataAsOf === undefined ? null : ap.sourceDataAsOf) : input.sourceDataAsOf;

var issues = [];
function addIssue(key, reason) { issues.push({ key: key, reason: reason }); }


var ov = projectAllocationRecords(ap.overseasAllocation, 'OVERSEAS', ap.overseasAllocation ? ap.overseasAllocation.allocationMode : null);
var fa = projectAllocationRecords(ap.factoryAllocation, 'FACTORY', 'FACTORY_DETERMINISTIC');
var blockedDemandKeys = {};
(ap.blockedInputs || []).forEach(function (b) { if (b.kind === 'DEMAND') blockedDemandKeys[str(b.key)] = str(b.reason); });


function resolveGap(f) {
if (f.calculatedGap !== undefined && f.calculatedGap !== null) {
return (typeof f.calculatedGap === 'number' && isFinite(f.calculatedGap) && f.calculatedGap >= 0) ? f.calculatedGap : NaN;
}
if (f.demand !== undefined && f.destinationCurrentStock !== undefined && f.timelyQualifiedIncoming !== undefined && f.timelyApprovedCommittedSupply !== undefined) {
try { return CALC.calculateGap({ demand: f.demand, destinationCurrentStock: f.destinationCurrentStock, timelyQualifiedIncoming: f.timelyQualifiedIncoming, timelyApprovedCommittedSupply: f.timelyApprovedCommittedSupply }); }
catch (e) { return NaN; }
}
return undefined;
}
function validUpc(v) { return (typeof v === 'number' && isFinite(v) && v > 0 && Math.floor(v) === v); }

var lines = [], seenLineKey = {};
for (var i = 0; i < facts.length; i++) {
var f = facts[i]; aType(isObj(f), 'resolveWeeklyRecommendationFacts: weeklyPlanningFacts[' + i + '] must be an object');
var recType = nonEmpty(f.recommendationType) ? str(f.recommendationType) : 'WEEKLY_SHIPPING';
if (recType !== 'WEEKLY_SHIPPING') { addIssue(str(f.demandKey), 'NOT_WEEKLY_RECOMMENDATION_TYPE:' + recType); continue; }
var sku = str(f.sku !== undefined ? f.sku : f.masterSku), siteSku = str(f.siteSku), windowCode = str(f.windowCode), demandKey = str(f.demandKey);

var blockedReason = null;
if (!nonEmpty(sku)) blockedReason = 'MISSING_SKU';
else if (!nonEmpty(windowCode)) blockedReason = 'MISSING_WINDOW_CODE';
else if (windowCode.indexOf(KEY_SEP) !== -1 || siteSku.indexOf(KEY_SEP) !== -1 || sku.indexOf(KEY_SEP) !== -1) blockedReason = 'INVALID_NATURAL_KEY_PART';
else if (!nonEmpty(demandKey)) blockedReason = 'MISSING_DEMAND_KEY';

var lineKey = [sku, siteSku, windowCode].join(KEY_SEP);
if (nonEmpty(sku) && nonEmpty(windowCode) && windowCode.indexOf(KEY_SEP) === -1) {
if (seenLineKey[lineKey] === 1) throw new RangeError('resolveWeeklyRecommendationFacts: duplicate Weekly line key: ' + sku + '|' + siteSku + '|' + windowCode);
seenLineKey[lineKey] = 1;
}


var recs = (blockedReason ? [] : (ov.byDemand[demandKey] || []).concat(fa.byDemand[demandKey] || []));
var unallocatedQty = blockedReason ? 0 : ((ov.unalloc[demandKey] || 0) + (fa.unalloc[demandKey] || 0));
var totalAllocated = 0; recs.forEach(function (r) { totalAllocated += r.allocatedQty; });
var breakdown = recs.slice().sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || (a.allocationSequence - b.allocationSequence); });
var lineMode = null;
if (recs.length) { lineMode = recs[0].allocationSource === 'OVERSEAS' ? recs[0].allocationMode : 'FACTORY_DETERMINISTIC'; }


if (!blockedReason && blockedDemandKeys[demandKey]) blockedReason = blockedDemandKeys[demandKey];


var gap = blockedReason ? undefined : resolveGap(f);
if (!blockedReason) {
if (gap === undefined) blockedReason = 'MISSING_CALCULATED_GAP';
else if (typeof gap !== 'number' || isNaN(gap)) blockedReason = 'INVALID_CALCULATED_GAP';
else if (!validUpc(f.unitsPerCarton)) blockedReason = 'MISSING_OR_INVALID_UNITS_PER_CARTON';
}

var recommendedQty = null;
if (!blockedReason) {

var shipRes = CALC.calculateShippingAndResidual({
calculatedGap: gap, eligibleSourceAvailable: totalAllocated,
otherLegallyAllocatedTimelySupply: (typeof f.otherLegallyAllocatedTimelySupply === 'number' ? f.otherLegallyAllocatedTimelySupply : 0),
unitsPerCarton: f.unitsPerCarton
});
recommendedQty = shipRes.recommendedShippingQty;
}


var poolSet = {}, distinctPools = [];
breakdown.forEach(function (b) { if (!poolSet[b.sourcePoolKey]) { poolSet[b.sourcePoolKey] = 1; distinctPools.push(b.sourcePoolKey); } });
var single = (distinctPools.length === 1);
var lineage = [];
if (nonEmpty(demandKey)) lineage.push('demand:' + demandKey);
breakdown.forEach(function (b) { lineage.push('alloc:' + b.allocationKey); });
lineage.sort(cmpStr);

var line = {
lineKey: lineKey,
recommendationType: 'WEEKLY_SHIPPING',
planningCycle: planningCycle,
businessScope: scope,
company: nonEmpty(f.company) ? str(f.company) : (scope.company == null ? null : str(scope.company)),
country: nonEmpty(f.country) ? str(f.country) : (scope.country == null ? null : str(scope.country)),
marketplace: nonEmpty(f.marketplace) ? str(f.marketplace) : (scope.marketplace == null ? null : str(scope.marketplace)),
masterSku: sku, siteSku: siteSku, destinationWarehouseId: nonEmpty(f.destinationWarehouseId) ? str(f.destinationWarehouseId) : null,
windowCode: windowCode, demandKey: demandKey,
calculatedGap: (blockedReason && (gap === undefined || typeof gap !== 'number' || isNaN(gap))) ? null : gap,
recommendedQty: recommendedQty,
unitsPerCarton: validUpc(f.unitsPerCarton) ? f.unitsPerCarton : null,
allocationMode: lineMode,
allocationBreakdown: breakdown,
unallocatedQty: unallocatedQty,
sourcePoolKey: single ? breakdown[0].sourcePoolKey : null,
sourcePoolType: single ? breakdown[0].sourcePoolType : null,
sourceWarehouseId: single ? breakdown[0].sourceWarehouseId : null,
blockedReason: blockedReason,
formulaVersion: formulaVersion,
sourceDataAsOf: sourceDataAsOf,
lineage: lineage
};
if (f.liveAnalysis !== undefined) line.liveAnalysis = f.liveAnalysis;
lines.push(line);
}

lines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
issues.sort(function (a, b) { return cmpStr(a.key, b.key) || cmpStr(a.reason, b.reason); });

var totalRecommendedQty = 0; lines.forEach(function (l) { if (typeof l.recommendedQty === 'number') totalRecommendedQty += l.recommendedQty; });
var lineageSet = {}, lineage = [];
lines.forEach(function (l) { l.lineage.forEach(function (k) { if (!lineageSet[k]) { lineageSet[k] = 1; lineage.push(k); } }); });
lineage.sort(cmpStr);

var clean = (issues.length === 0);
return {
ready: clean,
status: clean ? 'OK' : 'ISSUES_PRESENT',
reason: clean ? null : issues[0].reason,
issues: issues,
recommendationType: 'WEEKLY_SHIPPING',
planningCycle: planningCycle,
businessScope: scope,
lines: lines,
allocationSummary: {
overseasAllocationMode: ap.overseasAllocation ? ap.overseasAllocation.allocationMode : null,
factoryPresent: !!ap.factoryAllocation,
lineCount: lines.length,
blockedLineCount: lines.filter(function (l) { return l.blockedReason !== null; }).length,
totalRecommendedQty: totalRecommendedQty
},
blockedInputs: (ap.blockedInputs || []).slice(),
sourceDataAsOf: sourceDataAsOf,
formulaVersion: formulaVersion,
lineage: lineage
};
}








var MONTHLY_LINE_KEY = ['master_sku', 'request_month', 'request_bucket'];

function resolveMonthlyRecommendationFacts(input) {
aType(isObj(input), 'resolveMonthlyRecommendationFacts: input must be an object');
aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'resolveMonthlyRecommendationFacts: planningCycle required');
aType(isObj(input.businessScope), 'resolveMonthlyRecommendationFacts: businessScope required');
var ap = input.allocationProjection; aType(isObj(ap), 'resolveMonthlyRecommendationFacts: allocationProjection required');
var facts = input.monthlyPlanningFacts == null ? [] : input.monthlyPlanningFacts;
aType(Array.isArray(facts), 'resolveMonthlyRecommendationFacts: monthlyPlanningFacts must be an array');
var planningCycle = str(input.planningCycle);
var scope = input.businessScope;
var formulaVersion = input.formulaVersion == null ? null : input.formulaVersion;
var sourceDataAsOf = input.sourceDataAsOf === undefined ? (ap.sourceDataAsOf === undefined ? null : ap.sourceDataAsOf) : input.sourceDataAsOf;

var issues = [];
function addIssue(key, reason) { issues.push({ key: key, reason: reason }); }
function finiteNonNeg(v) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null; }
function validUpc(v) { return (typeof v === 'number' && isFinite(v) && v > 0 && Math.floor(v) === v); }


var fa = projectAllocationRecords(ap.factoryAllocation, 'FACTORY', 'FACTORY_DETERMINISTIC');
var demandByKeyLedger = {};
if (isObj(input.demandLedger) && Array.isArray(input.demandLedger.entries)) input.demandLedger.entries.forEach(function (e) { demandByKeyLedger[e.demandKey] = e; });
var blockedDemandKeys = {};
(ap.blockedInputs || []).forEach(function (b) { if (b.kind === 'DEMAND') blockedDemandKeys[str(b.key)] = str(b.reason); });


function resolveNeed(f) {
if (f.netOrderNeed !== undefined && f.netOrderNeed !== null) { var n = finiteNonNeg(f.netOrderNeed); return n === null ? NaN : n; }
if (Array.isArray(f.remainingShortages)) { try { return CALC.sumRemainingShortages(f.remainingShortages); } catch (e) { return NaN; } }
if (f.demand !== undefined && f.destinationCurrentStock !== undefined && f.timelyQualifiedIncoming !== undefined && f.timelyApprovedCommittedSupply !== undefined) {
try { return CALC.calculateGap({ demand: f.demand, destinationCurrentStock: f.destinationCurrentStock, timelyQualifiedIncoming: f.timelyQualifiedIncoming, timelyApprovedCommittedSupply: f.timelyApprovedCommittedSupply }); }
catch (e) { return NaN; }
}
return undefined;
}

var lines = [], seenLineKey = {};
for (var i = 0; i < facts.length; i++) {
var f = facts[i]; aType(isObj(f), 'resolveMonthlyRecommendationFacts: monthlyPlanningFacts[' + i + '] must be an object');
var recType = nonEmpty(f.recommendationType) ? str(f.recommendationType) : 'MONTHLY_ORDER';
if (recType !== 'MONTHLY_ORDER') { addIssue(str(f.demandKey), 'NOT_MONTHLY_RECOMMENDATION_TYPE:' + recType); continue; }
var masterSku = str(f.masterSku !== undefined ? f.masterSku : f.sku), requestMonth = str(f.requestMonth), requestBucket = str(f.requestBucket), demandKey = str(f.demandKey);

var blockedReason = null;
if (!nonEmpty(masterSku)) blockedReason = 'MISSING_MASTER_SKU';
else if (!nonEmpty(requestMonth)) blockedReason = 'MISSING_REQUEST_MONTH';
else if (!nonEmpty(requestBucket)) blockedReason = 'MISSING_REQUEST_BUCKET';
else if (masterSku.indexOf(KEY_SEP) !== -1 || requestMonth.indexOf(KEY_SEP) !== -1 || requestBucket.indexOf(KEY_SEP) !== -1) blockedReason = 'INVALID_NATURAL_KEY_PART';
else if (!nonEmpty(demandKey)) blockedReason = 'MISSING_DEMAND_KEY';

var lineKey = [masterSku, requestMonth, requestBucket].join(KEY_SEP);
if (nonEmpty(masterSku) && nonEmpty(requestMonth) && nonEmpty(requestBucket) && masterSku.indexOf(KEY_SEP) === -1 && requestMonth.indexOf(KEY_SEP) === -1 && requestBucket.indexOf(KEY_SEP) === -1) {
if (seenLineKey[lineKey] === 1) throw new RangeError('resolveMonthlyRecommendationFacts: duplicate Monthly line key: ' + masterSku + '|' + requestMonth + '|' + requestBucket);
seenLineKey[lineKey] = 1;
}


if (!blockedReason && blockedDemandKeys[demandKey]) blockedReason = blockedDemandKeys[demandKey];


var recs = (blockedReason ? [] : (fa.byDemand[demandKey] || []));
var unallocatedQty = blockedReason ? 0 : (fa.unalloc[demandKey] || 0);
var breakdown = recs.slice().sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || (a.allocationSequence - b.allocationSequence); });
var poolSet = {}, distinctPools = [];
breakdown.forEach(function (b) { if (!poolSet[b.sourcePoolKey]) { poolSet[b.sourcePoolKey] = 1; distinctPools.push(b.sourcePoolKey); } });
var single = (distinctPools.length === 1);
var lineMode = recs.length ? 'FACTORY_DETERMINISTIC' : null;


var need = blockedReason ? undefined : resolveNeed(f);
var needResolved = (typeof need === 'number' && !isNaN(need));
if (!blockedReason) {
if (need === undefined) blockedReason = 'MISSING_NET_ORDER_NEED';
else if (!needResolved) blockedReason = 'INVALID_NET_ORDER_NEED';
else if (!validUpc(f.unitsPerCarton)) blockedReason = 'MISSING_OR_INVALID_UNITS_PER_CARTON';
}

var recommendedQty = null, cartonQty = null;
if (!blockedReason) {

recommendedQty = CALC.calculateSuggestedOrderQty({ netOrderNeed: need, unitsPerCarton: f.unitsPerCarton });
cartonQty = recommendedQty / f.unitsPerCarton;
}

var eDemand = demandByKeyLedger[demandKey];
var monthlyDemandQty = null;
if (eDemand && eDemand.state === 'COUNTED') monthlyDemandQty = eDemand.effectiveDemandQty;
else if (typeof f.monthlyDemandQty === 'number' && isFinite(f.monthlyDemandQty)) monthlyDemandQty = f.monthlyDemandQty;

var lineage = [];
if (nonEmpty(demandKey)) lineage.push('demand:' + demandKey);
breakdown.forEach(function (b) { lineage.push('alloc:' + b.allocationKey); });
lineage.sort(cmpStr);

var line = {
lineKey: lineKey,
recommendationType: 'MONTHLY_ORDER',
planningCycle: planningCycle,
businessScope: scope,
company: nonEmpty(f.company) ? str(f.company) : (scope.company == null ? null : str(scope.company)),
country: nonEmpty(f.country) ? str(f.country) : (scope.country == null ? null : str(scope.country)),
marketplace: nonEmpty(f.marketplace) ? str(f.marketplace) : (scope.marketplace == null ? null : str(scope.marketplace)),
masterSku: masterSku, siteSku: str(f.siteSku), destinationWarehouseId: nonEmpty(f.destinationWarehouseId) ? str(f.destinationWarehouseId) : null,
requestMonth: requestMonth, requestBucket: requestBucket, demandKey: demandKey,
monthlyDemandQty: monthlyDemandQty,
netOrderNeed: needResolved ? need : null,
unitsPerCarton: validUpc(f.unitsPerCarton) ? f.unitsPerCarton : null,
recommendedQty: recommendedQty,
cartonQty: cartonQty,
allocationMode: lineMode,
allocationBreakdown: breakdown,
unallocatedQty: unallocatedQty,
sourcePoolKey: single ? breakdown[0].sourcePoolKey : null,
sourceWarehouseId: single ? breakdown[0].sourceWarehouseId : null,
blockedReason: blockedReason,
formulaVersion: formulaVersion,
sourceDataAsOf: sourceDataAsOf,
lineage: lineage
};
if (f.liveAnalysis !== undefined) line.liveAnalysis = f.liveAnalysis;
lines.push(line);
}

lines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
issues.sort(function (a, b) { return cmpStr(a.key, b.key) || cmpStr(a.reason, b.reason); });

var totalRecommendedQty = 0, totalNetOrderNeed = 0;
lines.forEach(function (l) { if (typeof l.recommendedQty === 'number') totalRecommendedQty += l.recommendedQty; if (typeof l.netOrderNeed === 'number') totalNetOrderNeed += l.netOrderNeed; });
var lineageSet = {}, lineage = [];
lines.forEach(function (l) { l.lineage.forEach(function (k) { if (!lineageSet[k]) { lineageSet[k] = 1; lineage.push(k); } }); });
lineage.sort(cmpStr);

var clean = (issues.length === 0);
return {
ready: clean,
status: clean ? 'OK' : 'ISSUES_PRESENT',
reason: clean ? null : issues[0].reason,
issues: issues,
recommendationType: 'MONTHLY_ORDER',
planningCycle: planningCycle,
businessScope: scope,
lines: lines,
allocationSummary: {
factoryPresent: !!ap.factoryAllocation,
lineCount: lines.length,
blockedLineCount: lines.filter(function (l) { return l.blockedReason !== null; }).length,
totalNetOrderNeed: totalNetOrderNeed,
totalRecommendedQty: totalRecommendedQty
},
blockedInputs: (ap.blockedInputs || []).slice(),
sourceDataAsOf: sourceDataAsOf,
formulaVersion: formulaVersion,
lineage: lineage
};
}

return {
READINESS_STATES: (function () { var o = {}; for (var k in READINESS_STATES) o[k] = 1; return o; })(),
CURRENT_STOCK_POOL_TYPES: (function () { var o = {}; for (var k in CURRENT_STOCK_POOL_TYPES) o[k] = 1; return o; })(),
DEMAND_TYPES: (function () { var o = {}; for (var k in DEMAND_TYPES) o[k] = 1; return o; })(),
ACTIVE_LIFECYCLE_BUCKETS: (function () { var o = {}; for (var k in ACTIVE_BUCKETS) o[k] = 1; return o; })(),
EXCLUDED_LIFECYCLE_BUCKETS: (function () { var o = {}; for (var k in EXCLUDED_BUCKETS) o[k] = 1; return o; })(),
classifySourceReadiness: classifySourceReadiness,
resolveSourceIdentity: resolveSourceIdentity,
projectDemandLedger: projectDemandLedger,
projectCurrentStockSupplyLedger: projectCurrentStockSupplyLedger,
adaptIncomingSupplyCandidates: adaptIncomingSupplyCandidates,
projectSupplyLifecycle: projectSupplyLifecycle,
projectAllocationInputs: projectAllocationInputs,
resolveWeeklyRecommendationFacts: resolveWeeklyRecommendationFacts,
resolveMonthlyRecommendationFacts: resolveMonthlyRecommendationFacts
};
});
__kmRegister("supply-planning-source-facts", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





























(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.planBridge = api; }
})(this, function () {
'use strict';

var SEP = String.fromCharCode(1);

var SUPPORTED_MODES = { SCHEDULED_REFRESH: 1, MANUAL_REGENERATE: 1 };
var SUPPORTED_TYPES = { WEEKLY_SHIPPING: 1, MONTHLY_ORDER: 1 };


var LINE_KEY_MAP = {
WEEKLY_SHIPPING: [
{ col: 'sku', from: 'masterSku' },
{ col: 'site_sku', from: 'siteSku' },
{ col: 'window_code', from: 'windowCode' }
],
MONTHLY_ORDER: [
{ col: 'request_month', from: 'requestMonth' },
{ col: 'request_bucket', from: 'requestBucket' }
]
};

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function aRange(c, m) { if (!c) throw new RangeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }
function nonEmptyStr(v) { return typeof v === 'string' && v.length > 0; }
function str(v) { return String(v === undefined || v === null ? '' : v); }


function validKeyPart(v) { var s = str(v); return s.length > 0 && s.indexOf(SEP) === -1; }


function scopeAgrees(scopeVal, lineVal) {
if (scopeVal === undefined || scopeVal === null) return true;
if (lineVal === undefined || lineVal === null) return true;
return str(scopeVal) === str(lineVal);
}




function bridgeRecommendationFactsToPlan(input) {
aType(isObj(input), 'bridgeRecommendationFactsToPlan: input must be an object');
var facts = input.recommendationFacts;
aType(isObj(facts), 'bridgeRecommendationFactsToPlan: recommendationFacts must be an object');
aType(Array.isArray(facts.lines), 'bridgeRecommendationFactsToPlan: recommendationFacts.lines must be an array');


var type = facts.recommendationType;
aRange(SUPPORTED_TYPES[type] === 1, 'bridgeRecommendationFactsToPlan: unsupported recommendationType: ' + type);
if (input.recommendationType !== undefined && input.recommendationType !== null) {
aRange(str(input.recommendationType) === str(type),
'bridgeRecommendationFactsToPlan: recommendationType mismatch (input ' + input.recommendationType + ' vs facts ' + type + ')');
}


aType(nonEmptyStr(facts.planningCycle), 'bridgeRecommendationFactsToPlan: planningCycle required (facts)');
aType(isObj(facts.businessScope), 'bridgeRecommendationFactsToPlan: businessScope required (facts)');
aType(nonEmptyStr(input.mode), 'bridgeRecommendationFactsToPlan: mode required (caller-owned)');
aRange(SUPPORTED_MODES[input.mode] === 1, 'bridgeRecommendationFactsToPlan: unsupported mode: ' + input.mode);
aType(nonEmptyStr(input.calculationRunId), 'bridgeRecommendationFactsToPlan: calculationRunId required (caller-owned)');
var draftVersion = null;
if (input.draftVersion !== undefined && input.draftVersion !== null) {
aRange(isFiniteNum(input.draftVersion) && input.draftVersion > 0 && Math.floor(input.draftVersion) === input.draftVersion,
'bridgeRecommendationFactsToPlan: invalid draftVersion (must be a positive integer): ' + input.draftVersion);
draftVersion = input.draftVersion;
}
var planningCycle = str(facts.planningCycle);
var scope = facts.businessScope;
var formulaVersion = facts.formulaVersion === undefined ? null : facts.formulaVersion;
var sourceDataAsOf = facts.sourceDataAsOf === undefined ? null : facts.sourceDataAsOf;

var keyMap = LINE_KEY_MAP[type];

var mappable = [];
var unmappable = [];
var seen = {};

for (var i = 0; i < facts.lines.length; i++) {
var line = facts.lines[i];
aType(isObj(line), 'bridgeRecommendationFactsToPlan: recommendationFacts.lines[' + i + '] must be an object');
var blocked = (line.blockedReason !== undefined && line.blockedReason !== null);


aRange(scopeAgrees(scope.company, line.company), 'bridgeRecommendationFactsToPlan: line company conflicts with scope: ' + line.company);
aRange(scopeAgrees(scope.country, line.country), 'bridgeRecommendationFactsToPlan: line country conflicts with scope: ' + line.country);
aRange(scopeAgrees(scope.marketplace, line.marketplace), 'bridgeRecommendationFactsToPlan: line marketplace conflicts with scope: ' + line.marketplace);
if (type === 'MONTHLY_ORDER') {
aRange(scopeAgrees(scope.sku, line.masterSku), 'bridgeRecommendationFactsToPlan: line masterSku conflicts with scope.sku: ' + line.masterSku);
}


var nk = {}, parts = [], complete = true;
for (var k = 0; k < keyMap.length; k++) {
var v = str(line[keyMap[k].from]);
nk[keyMap[k].col] = v;
if (!validKeyPart(v)) complete = false;
parts.push(v);
}


var meta = {
recommendationType: type,
demandKey: line.demandKey === undefined ? null : line.demandKey,
recommendedQty: line.recommendedQty === undefined ? null : line.recommendedQty,
unallocatedQty: line.unallocatedQty === undefined ? null : line.unallocatedQty,
allocationMode: line.allocationMode === undefined ? null : line.allocationMode,
allocationBreakdown: Array.isArray(line.allocationBreakdown) ? line.allocationBreakdown.slice() : [],
sourcePoolKey: line.sourcePoolKey === undefined ? null : line.sourcePoolKey,
sourceWarehouseId: line.sourceWarehouseId === undefined ? null : line.sourceWarehouseId,
lineage: Array.isArray(line.lineage) ? line.lineage.slice() : [],
blockedReason: blocked ? line.blockedReason : null
};
if (type === 'WEEKLY_SHIPPING') {
meta.calculatedGap = line.calculatedGap === undefined ? null : line.calculatedGap;
meta.sourcePoolType = line.sourcePoolType === undefined ? null : line.sourcePoolType;
} else {
meta.netOrderNeed = line.netOrderNeed === undefined ? null : line.netOrderNeed;
meta.cartonQty = line.cartonQty === undefined ? null : line.cartonQty;
meta.monthlyDemandQty = line.monthlyDemandQty === undefined ? null : line.monthlyDemandQty;
meta.unitsPerCarton = line.unitsPerCarton === undefined ? null : line.unitsPerCarton;
}
if (line.liveAnalysis !== undefined) meta.liveAnalysis = line.liveAnalysis;

if (!complete) {

unmappable.push({
blockedReason: blocked ? str(line.blockedReason) : 'INCOMPLETE_NATURAL_KEY',
partialIdentity: nk,
demandKey: line.demandKey === undefined ? null : line.demandKey
});
continue;
}

var mappedKey = parts.join(SEP);
aRange(seen[mappedKey] !== 1, 'bridgeRecommendationFactsToPlan: duplicate mapped Plan Builder line key: ' + parts.join('|'));
seen[mappedKey] = 1;


var lineageObj = {
demandKey: line.demandKey === undefined ? null : line.demandKey,
allocationMode: line.allocationMode === undefined ? null : line.allocationMode,
sourcePoolKey: line.sourcePoolKey === undefined ? null : line.sourcePoolKey,
sourceWarehouseId: line.sourceWarehouseId === undefined ? null : line.sourceWarehouseId,



allocationBreakdown: Array.isArray(line.allocationBreakdown) ? line.allocationBreakdown.slice() : [],



unitsPerCarton: (type === 'WEEKLY_SHIPPING' && line.unitsPerCarton !== undefined && line.unitsPerCarton !== null) ? line.unitsPerCarton : null,
keys: Array.isArray(line.lineage) ? line.lineage.slice() : []
};
var planFact = {};
for (var c = 0; c < keyMap.length; c++) planFact[keyMap[c].col] = nk[keyMap[c].col];
if (blocked) {
planFact.blocked = true;
planFact.reason = str(line.blockedReason);
planFact.recommendedQty = null;
} else {
aType(isFiniteNum(line.recommendedQty), 'bridgeRecommendationFactsToPlan: non-blocked line recommendedQty must be a number');
aRange(line.recommendedQty >= 0, 'bridgeRecommendationFactsToPlan: recommendedQty must be finite ≥ 0');
planFact.blocked = false;
planFact.recommendedQty = line.recommendedQty;
}
if (line.demandKey !== undefined && str(line.demandKey).length > 0) planFact.demandKey = line.demandKey;
planFact.lineage = lineageObj;

mappable.push({ mappedKey: mappedKey, planFact: planFact, meta: meta });
}


mappable.sort(function (a, b) { return cmpStr(a.mappedKey, b.mappedKey); });
unmappable.sort(function (a, b) {
return cmpStr(a.blockedReason, b.blockedReason) || cmpStr(str(a.demandKey), str(b.demandKey));
});

var lines = [], lineMetaByKey = {};
mappable.forEach(function (m) { lines.push(m.planFact); lineMetaByKey[m.mappedKey] = m.meta; });

return {
recommendationType: type,
mode: input.mode,
planningCycle: planningCycle,
businessScope: scope,
calculationRunId: input.calculationRunId,
formulaVersion: formulaVersion,
sourceDataAsOf: sourceDataAsOf,
draftVersion: draftVersion,
lines: lines,
lineage: Array.isArray(facts.lineage) ? facts.lineage.slice() : [],
metadata: {
lineMetaByKey: lineMetaByKey,
unmappableBlockedLines: unmappable,
blockedInputs: Array.isArray(facts.blockedInputs) ? facts.blockedInputs.slice() : [],
allocationSummary: isObj(facts.allocationSummary) ? facts.allocationSummary : null,
mappedLineCount: lines.length,
unmappableLineCount: unmappable.length
}
};
}

return {
SEP: SEP,
SUPPORTED_MODES: (function () { var o = {}; for (var k in SUPPORTED_MODES) o[k] = 1; return o; })(),
SUPPORTED_TYPES: (function () { var o = {}; for (var k in SUPPORTED_TYPES) o[k] = 1; return o; })(),
LINE_KEY_MAP: (function () { var o = {}; for (var t in LINE_KEY_MAP) o[t] = LINE_KEY_MAP[t].map(function (m) { return { col: m.col, from: m.from }; }); return o; })(),
bridgeRecommendationFactsToPlan: bridgeRecommendationFactsToPlan
};
});
__kmRegister("supply-planning-plan-bridge", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-allocations.js') : (root.KMALLOC || (root.KM && root.KM.allocations)),
req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklySourceAllocation = api; }
})(this, function (ALLOC, SF) {
'use strict';

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function aType(c, m) { if (!c) throw new TypeError('weeklySourceAllocation: ' + m); }
function str(v) { return String(v === undefined || v === null ? '' : v); }
function setOf(list) { var s = {}; (Array.isArray(list) ? list : []).forEach(function (x) { if (x != null && str(x) !== '') s[str(x)] = 1; }); return s; }
function sumAllocated(recs) { var t = 0; (recs || []).forEach(function (a) { t += (typeof a.allocatedQty === 'number' ? a.allocatedQty : 0); }); return t; }
function shallowClone(o) { var n = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k]; return n; }
function emptyFactoryResult() { return { allocationType: 'FACTORY_DETERMINISTIC', allocations: [], unallocatedDemand: [], unusedSupply: [], blockedInputs: [] }; }





function residualDemands(baseDemands, residualMap, hasUpstream) {
var out = [];
(baseDemands || []).forEach(function (d) {
var key = str(d.demandKey);
var q;
if (Object.prototype.hasOwnProperty.call(residualMap, key)) q = residualMap[key];
else q = hasUpstream[key] ? 0 : d.demandQty;
if (typeof q === 'number' && q > 0) {
var nd = shallowClone(d);
nd.demandQty = q;
out.push(nd);
}
});
return out;
}

















function buildWeeklySourceAllocation(input) {
aType(isObj(input), 'input must be an object');
aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
aType(isObj(input.businessScope), 'businessScope required');
var masterSku = str(input.masterSku);
var weeklyPlanningFacts = input.weeklyPlanningFacts == null ? [] : input.weeklyPlanningFacts;
aType(Array.isArray(weeklyPlanningFacts), 'weeklyPlanningFacts must be an array');

var issues = [];


var overseasAllocation = null;
var overseasResidualByDemand = {};
var overseasSeen = {};
if (input.overseasInput != null) {
aType(isObj(input.overseasInput), 'overseasInput must be an object or null');
overseasAllocation = ALLOC.allocateOverseasSharedPool(input.overseasInput);
var ovAllocByDemand = {};
(overseasAllocation.allocations || []).forEach(function (a) { var k = str(a.demandKey); ovAllocByDemand[k] = (ovAllocByDemand[k] || 0) + a.allocatedQty; });
(input.overseasInput.receivers || []).forEach(function (r) {
var k = str(r.demandKey); overseasSeen[k] = 1;
var residual = (typeof r.demandQty === 'number' ? r.demandQty : 0) - (ovAllocByDemand[k] || 0);
overseasResidualByDemand[k] = residual > 0 ? residual : 0;
});
}


var factoryAllocation = null, cnAlloc = emptyFactoryResult(), twAlloc = emptyFactoryResult();
if (input.factory != null) {
aType(isObj(input.factory), 'factory must be an object or null');
aType(masterSku.length > 0, 'masterSku required when factory passes are present');
var f = input.factory;
var cnIds = setOf(f.cnYouxinWarehouseIds), twIds = setOf(f.twShengyiWarehouseIds);



var cnPools = [], twPools = [];
(f.factoryPools || []).forEach(function (p) {
var wh = str(p.warehouseId);
var inCn = cnIds[wh] === 1, inTw = twIds[wh] === 1;
if (inCn && inTw) { issues.push({ kind: 'SUPPLY', key: str(p.poolKey), reason: 'FACTORY_WAREHOUSE_CLASSIFIED_BOTH_CN_AND_TW:' + wh }); return; }
if (inCn) cnPools.push(p);
else if (inTw) twPools.push(p);
else issues.push({ kind: 'SUPPLY', key: str(p.poolKey), reason: 'UNCLASSIFIED_FACTORY_WAREHOUSE:' + wh });
});


var cnDemands = residualDemands(f.demands || [], overseasResidualByDemand, overseasSeen);
if (cnPools.length && cnDemands.length) cnAlloc = ALLOC.allocateFactoryDeterministic({ masterSku: masterSku, factoryPools: cnPools, demands: cnDemands });


var cnResidualMap = {}, cnSeen = {};
cnDemands.forEach(function (d) { cnSeen[str(d.demandKey)] = 1; });
(cnAlloc.unallocatedDemand || []).forEach(function (u) { cnResidualMap[str(u.demandKey)] = u.unallocatedQty; });
var twDemands = residualDemands(cnDemands, cnResidualMap, cnSeen);
if (twPools.length && twDemands.length) twAlloc = ALLOC.allocateFactoryDeterministic({ masterSku: masterSku, factoryPools: twPools, demands: twDemands });



factoryAllocation = {
allocationType: 'FACTORY_DETERMINISTIC',
allocations: (cnAlloc.allocations || []).concat(twAlloc.allocations || []),
unallocatedDemand: (twAlloc.unallocatedDemand || []).slice(),
unusedSupply: (cnAlloc.unusedSupply || []).concat(twAlloc.unusedSupply || []),
blockedInputs: (cnAlloc.blockedInputs || []).concat(twAlloc.blockedInputs || [])
};
}


var allocationProjection = {
overseasAllocation: overseasAllocation,
factoryAllocation: factoryAllocation,
blockedInputs: ((overseasAllocation && overseasAllocation.blockedInputs) || []).concat((factoryAllocation && factoryAllocation.blockedInputs) || []),
sourceDataAsOf: input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf
};
var weekly = SF.resolveWeeklyRecommendationFacts({
planningCycle: input.planningCycle,
businessScope: input.businessScope,
allocationProjection: allocationProjection,
weeklyPlanningFacts: weeklyPlanningFacts,
formulaVersion: input.formulaVersion,
sourceDataAsOf: input.sourceDataAsOf
});




var cnWh = setOf(input.factory ? input.factory.cnYouxinWarehouseIds : []);
var twWh = setOf(input.factory ? input.factory.twShengyiWarehouseIds : []);
var lines = (weekly.lines || []).map(function (l) {
var out = shallowClone(l);
var residual = null;
if (!l.blockedReason && typeof l.calculatedGap === 'number' && typeof l.recommendedQty === 'number') {
residual = l.calculatedGap - l.recommendedQty;
if (residual < 0) residual = 0;
}
out.unresolvedProductionNeedQty = residual;
var stages = {};
(l.allocationBreakdown || []).forEach(function (b) {
if (b.sourcePoolType && b.sourcePoolType !== 'FACTORY') stages.SOURCE_OVERSEAS = 1;
else if (cnWh[str(b.sourceWarehouseId)] === 1) stages.SOURCE_FACTORY_CN_YOUXIN = 1;
else if (twWh[str(b.sourceWarehouseId)] === 1) stages.SOURCE_FACTORY_TW_SHENGYI = 1;
});
if (residual !== null && residual > 0) stages.UNRESOLVED_PRODUCTION_NEED = 1;
out.sourceStages = Object.keys(stages).sort();
return out;
});

var unresolvedTotal = 0;
lines.forEach(function (l) { if (typeof l.unresolvedProductionNeedQty === 'number') unresolvedTotal += l.unresolvedProductionNeedQty; });
issues.sort(function (a, b) { return (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0); });

return {
recommendationType: 'WEEKLY_SHIPPING',
planningCycle: str(input.planningCycle),
businessScope: input.businessScope,
allocationProjection: allocationProjection,
lines: lines,
weeklyFacts: weekly,
sourcePriority: {
overseasAllocatedQty: sumAllocated(overseasAllocation ? overseasAllocation.allocations : []),
cnAllocatedQty: sumAllocated(cnAlloc.allocations),
twAllocatedQty: sumAllocated(twAlloc.allocations),
unresolvedProductionNeedQty: unresolvedTotal
},
issues: issues,
ready: (weekly.ready !== false) && issues.length === 0
};
}

return { buildWeeklySourceAllocation: buildWeeklySourceAllocation, _version: 'f1-7n-b-r1' };
});
__kmRegister("supply-planning-weekly-source-allocation", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyInputAssembler = api; }
})(this, function () {
'use strict';

var WINDOW_ORDER = ['D18', 'D30', 'D45', 'D90'];
var DEFAULT_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';
var LINEKEY_SEP = '|';

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function aType(c, m) { if (!c) throw new TypeError('weeklyInputAssembler: ' + m); }
function str(v) { return String(v === undefined || v === null ? '' : v); }
function nonEmpty(v) { return str(v).length > 0; }
function isTrue(v) { return v === true || v === 'TRUE' || v === 'true'; }
function num0(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function shallowClone(o) { var n = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k]; return n; }


function weeklyDemandKey(sku, destinationWarehouseId, windowCode) {
return [str(sku), str(destinationWarehouseId), str(windowCode)].join('|');
}


function incrementalNeeds(cumulative) {
var out = [], runMax = 0;
for (var i = 0; i < cumulative.length; i++) {
var g = Math.max(0, num0(cumulative[i]));
out.push(Math.max(0, g - runMax));
if (g > runMax) runMax = g;
}
return out;
}


function resolveWeeklyFactoryIdentity(warehouseId, config) {
var wh = str(warehouseId);
if (config && str(config.CN_YOUXIN) === wh && wh !== '') return 'CN_YOUXIN';
if (config && str(config.TW_SHENGYI) === wh && wh !== '') return 'TW_SHENGYI';
return 'UNKNOWN';
}


function validateFactoryConfig(config, warehousesById) {
aType(isObj(config), 'factoryIdentityConfig required');
var whById = warehousesById || {};
var idents = ['CN_YOUXIN', 'TW_SHENGYI'], wids = {};
for (var i = 0; i < idents.length; i++) {
var ident = idents[i], wid = str(config[ident]);
if (!nonEmpty(wid)) return { ok: false, reason: 'FACTORY_IDENTITY_UNCONFIGURED:' + ident };
if (wids[wid]) return { ok: false, reason: 'FACTORY_IDENTITY_OVERLAP:' + wid };
wids[wid] = ident;
var row = whById[wid];
if (!row) return { ok: false, reason: 'FACTORY_WAREHOUSE_MISSING:' + wid };
if (str(row.warehouse_type) !== 'FACTORY') return { ok: false, reason: 'FACTORY_WAREHOUSE_NOT_FACTORY_TYPE:' + wid };
if (!isTrue(row.is_factory_warehouse)) return { ok: false, reason: 'FACTORY_WAREHOUSE_FLAG_FALSE:' + wid };
if (!isTrue(row.is_active)) return { ok: false, reason: 'FACTORY_WAREHOUSE_INACTIVE:' + wid };
}
return { ok: true };
}



























function assembleWeeklySourceAllocationInput(input) {
aType(isObj(input), 'input must be an object');
aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
aType(isObj(input.businessScope), 'businessScope required');
var masterSku = str(input.masterSku);
aType(nonEmpty(masterSku), 'masterSku required');
aType(Array.isArray(input.lanes), 'lanes must be an array');

var issues = [];
var formulaVersion = nonEmpty(input.formulaVersion) ? str(input.formulaVersion) : DEFAULT_FORMULA_VERSION;
var sourceDataAsOf = input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf;


var cfg = input.factoryIdentityConfig;
var fv = validateFactoryConfig(cfg, input.warehousesById);
if (!fv.ok) {
return { ready: false, issues: [{ kind: 'FACTORY_IDENTITY', reason: fv.reason }], builderInput: null, cumulativeByLane: [] };
}
var cnId = str(cfg.CN_YOUXIN), twId = str(cfg.TW_SHENGYI);
var eligibleFactoryWarehouseIds = [cnId, twId].sort();



var cnPools = [], twPools = [];
(input.factoryPools || []).forEach(function (p) {
var id = resolveWeeklyFactoryIdentity(p.warehouseId, cfg);
if (id === 'CN_YOUXIN') cnPools.push(shallowClone(p));
else if (id === 'TW_SHENGYI') twPools.push(shallowClone(p));
else issues.push({ kind: 'SUPPLY', key: str(p.poolKey), reason: 'UNCONFIGURED_FACTORY_POOL_EXCLUDED:' + str(p.warehouseId) });
});




if (cnPools.length === 0) cnPools.push({ poolKey: 'FC:' + cnId, poolType: 'FACTORY', warehouseId: cnId, effectiveSupplyQty: 0 });
if (twPools.length === 0) twPools.push({ poolKey: 'FC:' + twId, poolType: 'FACTORY', warehouseId: twId, effectiveSupplyQty: 0 });
var factoryPools = cnPools.concat(twPools);
var overseasSupplyPools = (input.overseasSupplyPools || []).map(shallowClone);


var receivers = [], demands = [], weeklyPlanningFacts = [], cumulativeByLane = [], seenLineKey = {};
for (var li = 0; li < input.lanes.length; li++) {
var lane = input.lanes[li];
aType(isObj(lane), 'lanes[' + li + '] must be an object');
var laneSku = nonEmpty(lane.sku) ? str(lane.sku) : masterSku;
var siteSku = str(lane.siteSku);
var dest = str(lane.destinationWarehouseId);
var cumByWin = lane.cumulativeGapByWindow || {};
var reqBy = lane.requiredByByWindow || {};

var cum = WINDOW_ORDER.map(function (w) { return Math.max(0, num0(cumByWin[w])); });
var inc = incrementalNeeds(cum);
cumulativeByLane.push({ siteSku: siteSku, destinationWarehouseId: dest, cumulative: cum, incremental: inc });

var activeIdx = [];
for (var wi = 0; wi < WINDOW_ORDER.length; wi++) { if (inc[wi] > 0) activeIdx.push(wi); }
if (activeIdx.length === 0) { continue; }


if (!nonEmpty(dest)) { issues.push({ kind: 'DEMAND', key: laneSku + '|' + siteSku, reason: 'MISSING_DESTINATION_WAREHOUSE' }); continue; }

var earliest = activeIdx[0];
var totalInc = 0; activeIdx.forEach(function (i) { totalInc += inc[i]; });
var canonicalWeight = num0(lane.demandWeight);
var laneSurvival = num0(lane.survivalNeedQty);













var prRaw = lane.allocationPriority;
var prNum = (prRaw === null || prRaw === undefined || prRaw === '') ? null : Number(prRaw);
if (prNum === null || !isFinite(prNum) || prNum < 0) {
issues.push({ kind: 'DEMAND', key: laneSku + '|' + siteSku, reason: 'UNRESOLVED_ALLOCATION_PRIORITY' });
continue;
}
var priority = prNum;
var eligiblePoolTypes = Array.isArray(lane.eligiblePoolTypes) ? lane.eligiblePoolTypes.slice() : [];

for (var a = 0; a < activeIdx.length; a++) {
var idx = activeIdx[a];
var windowCode = WINDOW_ORDER[idx];
var demandQty = inc[idx];
var demandKey = weeklyDemandKey(laneSku, dest, windowCode);

var lk = [laneSku, siteSku, windowCode].join(LINEKEY_SEP);
if (seenLineKey[lk]) { issues.push({ kind: 'DEMAND', key: demandKey, reason: 'DUPLICATE_WEEKLY_LINE_KEY' }); continue; }
seenLineKey[lk] = 1;

var survivalNeedQty = (idx === earliest) ? laneSurvival : 0;
var demandWeight = totalInc > 0 ? (canonicalWeight * demandQty / totalInc) : 0;

receivers.push({
receiverKey: 'WR|' + demandKey, demandKey: demandKey, marketplace: str(lane.marketplace),
destinationWarehouseId: dest, fulfillmentModel: str(lane.fulfillmentModel),
demandQty: demandQty, survivalNeedQty: survivalNeedQty, allocationPriority: priority,
demandWeight: demandWeight, eligiblePoolTypes: eligiblePoolTypes.slice()
});
demands.push({
demandKey: demandKey, company: str(lane.company), marketplace: str(lane.marketplace),
destinationWarehouseId: dest, requiredByDate: str(reqBy[windowCode]), allocationPriority: priority,
demandQty: demandQty, eligibleFactoryWarehouseIds: eligibleFactoryWarehouseIds.slice()
});
weeklyPlanningFacts.push({
recommendationType: 'WEEKLY_SHIPPING', sku: laneSku, siteSku: siteSku, windowCode: windowCode,
marketplace: str(lane.marketplace),
demandKey: demandKey, destinationWarehouseId: dest, requiredByDate: str(reqBy[windowCode]),
calculatedGap: demandQty,
cumulativeGapQty: cum[idx],
unitsPerCarton: lane.unitsPerCarton,
allocationPriority: priority
});
}
}

var overseasInput = {
company: str(input.businessScope.company), country: str(input.businessScope.country),
masterSku: masterSku, supplyPools: overseasSupplyPools, receivers: receivers
};
var factory = {
factoryPools: factoryPools, demands: demands,
cnYouxinWarehouseIds: [cnId], twShengyiWarehouseIds: [twId]
};

var builderInput = {
planningCycle: str(input.planningCycle), businessScope: input.businessScope, masterSku: masterSku,
formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf,
overseasInput: overseasInput, factory: factory, weeklyPlanningFacts: weeklyPlanningFacts
};

issues.sort(function (x, y) {
return (x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : 0) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0) || (x.reason < y.reason ? -1 : x.reason > y.reason ? 1 : 0);
});
return { ready: true, issues: issues, builderInput: builderInput, cumulativeByLane: cumulativeByLane };
}

return {
assembleWeeklySourceAllocationInput: assembleWeeklySourceAllocationInput,
resolveWeeklyFactoryIdentity: resolveWeeklyFactoryIdentity,
validateFactoryConfig: validateFactoryConfig,
incrementalNeeds: incrementalNeeds,
weeklyDemandKey: weeklyDemandKey,
WINDOW_ORDER: WINDOW_ORDER.slice(),
_version: 'f1-7n-d0-b-r1'
};
});
__kmRegister("supply-planning-weekly-input-assembler", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-weekly-source-allocation.js') : (root.KMWSA || (root.KM && root.KM.weeklySourceAllocation)),
req ? req('./supply-planning-plan-bridge.js') : (root.KMBRIDGE || (root.KM && root.KM.planBridge)),
req ? req('./supply-planning-recommendation-orchestrator.js') : (root.KMORCH || (root.KM && root.KM.recommendationOrchestrator))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyRecommendationDraft = api; }
})(this, function (WSA, BRIDGE, ORCH) {
'use strict';

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function aType(c, m) { if (!c) throw new TypeError('weeklyRecommendationDraft: ' + m); }
function str(v) { return String(v === undefined || v === null ? '' : v); }





function weeklyComputeFacts(builderInput, opts) {
aType(isObj(builderInput), 'builderInput must be an object');
opts = opts || {};
var b = WSA.buildWeeklySourceAllocation(builderInput);
var bridged = BRIDGE.bridgeRecommendationFactsToPlan({
recommendationFacts: b.weeklyFacts,
mode: opts.mode || 'SCHEDULED_REFRESH',
calculationRunId: opts.calculationRunId || 'PENDING'
});
return {
lines: bridged.lines,
ready: b.weeklyFacts.ready !== false,
reason: b.weeklyFacts.reason == null ? null : b.weeklyFacts.reason,
formulaVersion: bridged.formulaVersion,
sourceDataAsOf: bridged.sourceDataAsOf,
weekly: b,
bridgeMetadata: bridged.metadata
};
}







function persistWeeklyRecommendationDraft(input, deps) {
aType(isObj(input), 'input must be an object');
aType(isObj(input.builderInput), 'input.builderInput required');
aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'input.planningCycle required');
aType(isObj(input.businessScope), 'input.businessScope required (K3 scope incl. source_page)');
aType(isObj(deps) && typeof deps.loadActiveContext === 'function' && typeof deps.lockedApply === 'function', 'deps.loadActiveContext/lockedApply required');

if (typeof input.builderInput.planningCycle === 'string' && input.builderInput.planningCycle.length > 0) {
aType(str(input.builderInput.planningCycle) === str(input.planningCycle), 'planningCycle mismatch: builderInput ' + input.builderInput.planningCycle + ' vs identity ' + input.planningCycle);
}
var mode = input.mode || 'SCHEDULED_REFRESH';
var computeFacts = function () { return weeklyComputeFacts(input.builderInput, { mode: mode }); };
return ORCH.runRecommendationGeneration({
recommendationType: 'WEEKLY_SHIPPING',
mode: mode,
planningCycle: input.planningCycle,
businessScope: input.businessScope,
confirmRegenerateOverUserEdits: input.confirmRegenerateOverUserEdits === true,
actor: input.actor,
now: input.now
}, {
loadActiveContext: deps.loadActiveContext,
loadPriorSnapshot: deps.loadPriorSnapshot,
computeFacts: computeFacts,
lockedApply: deps.lockedApply
});
}

return {
weeklyComputeFacts: weeklyComputeFacts,
persistWeeklyRecommendationDraft: persistWeeklyRecommendationDraft,
_version: 'f1-7n-c1-r1'
};
});
__kmRegister("supply-planning-weekly-recommendation-draft", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;























(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-weekly-input-assembler.js') : (root.KMWIA || (root.KM && root.KM.weeklyInputAssembler)),
req ? req('./supply-planning-weekly-source-allocation.js') : (root.KMWSA || (root.KM && root.KM.weeklySourceAllocation)),
req ? req('./supply-planning-weekly-recommendation-draft.js') : (root.KMWRD || (root.KM && root.KM.weeklyRecommendationDraft))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyRecommendationRuntime = api; }
})(this, function (WIA, WSA, WRD) {
'use strict';

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function aType(c, m) { if (!c) throw new TypeError('weeklyRecommendationRuntime: ' + m); }
function str(v) { return String(v === undefined || v === null ? '' : v); }
function nonEmpty(v) { return str(v).length > 0; }
function assign(target, src) { var o = {}, k; for (k in target) if (target.hasOwnProperty(k)) o[k] = target[k]; for (k in src) if (src.hasOwnProperty(k)) o[k] = src[k]; return o; }

var DEFAULT_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';


function result(fields) {
var base = {
success: false, recommendationType: 'WEEKLY_SHIPPING', planningCycle: null, businessScope: null,
draftId: null, draftVersion: null, status: null, reason: null,
generatedLineCount: 0, blockedLineCount: 0, recommendedQtyTotal: 0, unresolvedProductionNeedQty: 0,
sourcePrioritySummary: null, issues: [], ready: false, sourceDataAsOf: null, formulaVersion: DEFAULT_FORMULA_VERSION
};
if (fields) for (var k in fields) if (fields.hasOwnProperty(k)) base[k] = fields[k];
return base;
}











function generateWeeklyShippingRecommendationDraft(request, deps) {
aType(isObj(request), 'request must be an object');
aType(isObj(deps) && typeof deps.loadActiveContext === 'function' && typeof deps.lockedApply === 'function', 'deps.loadActiveContext/lockedApply required');

var scope = isObj(request.businessScope) ? request.businessScope : {};
var formulaVersion = nonEmpty(request.formulaVersion) ? str(request.formulaVersion) : DEFAULT_FORMULA_VERSION;
var sourceDataAsOf = request.sourceDataAsOf === undefined ? null : request.sourceDataAsOf;
var provenance = { planningCycle: nonEmpty(request.planningCycle) ? str(request.planningCycle) : null, businessScope: scope, sourceDataAsOf: sourceDataAsOf, formulaVersion: formulaVersion };


var missing = [];
['company', 'country', 'marketplace', 'source_page'].forEach(function (k) { if (!nonEmpty(scope[k])) missing.push('businessScope.' + k); });
if (!nonEmpty(request.planningCycle)) missing.push('planningCycle');
if (!nonEmpty(request.masterSku)) missing.push('masterSku');
if (missing.length) {
return result(assign(provenance, { status: 'BLOCKED_INPUT', reason: 'MISSING_SCOPE:' + missing.join(','), issues: missing.map(function (m) { return { kind: 'INPUT', reason: 'MISSING:' + m }; }) }));
}


var asm;
try {
asm = WIA.assembleWeeklySourceAllocationInput({
planningCycle: request.planningCycle, businessScope: scope, masterSku: request.masterSku,
formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf,
factoryIdentityConfig: request.factoryIdentityConfig, warehousesById: request.warehousesById,
overseasSupplyPools: request.overseasSupplyPools || [], factoryPools: request.factoryPools || [],
lanes: request.lanes || []
});
} catch (e) {
return result(assign(provenance, { status: 'BLOCKED_INPUT', reason: 'ASSEMBLER_ERROR:' + (e && e.message ? e.message : e), issues: [{ kind: 'INPUT', reason: 'ASSEMBLER_ERROR' }] }));
}
if (!asm.ready) {
return result(assign(provenance, { status: 'BLOCKED_INPUT', reason: (asm.issues && asm.issues[0] && asm.issues[0].reason) || 'ASSEMBLER_NOT_READY', issues: asm.issues || [], ready: false }));
}


var built = WSA.buildWeeklySourceAllocation(asm.builderInput);
var lines = built.lines || [];
var blocked = 0, recTotal = 0;
lines.forEach(function (l) {
if (l.blockedReason) blocked++;
if (typeof l.recommendedQty === 'number') recTotal += l.recommendedQty;
});
var sp = built.sourcePriority || {};


var persistRes;
try {
persistRes = WRD.persistWeeklyRecommendationDraft({
builderInput: asm.builderInput, mode: request.mode, planningCycle: request.planningCycle,
businessScope: scope, confirmRegenerateOverUserEdits: request.confirmRegenerateOverUserEdits === true,
actor: request.actor, now: request.now
}, { loadActiveContext: deps.loadActiveContext, loadPriorSnapshot: deps.loadPriorSnapshot, lockedApply: deps.lockedApply });
} catch (e) {
return result(assign(provenance, {
status: 'PERSISTENCE_ERROR', reason: (e && e.message ? e.message : String(e)),
generatedLineCount: lines.length, blockedLineCount: blocked, recommendedQtyTotal: recTotal,
unresolvedProductionNeedQty: sp.unresolvedProductionNeedQty || 0, sourcePrioritySummary: sp,
issues: (asm.issues || []).concat(built.issues || []), ready: true
}));
}


var okStatus = persistRes && persistRes.status === 'COMPLETED';
return result(assign(provenance, {
success: !!okStatus,
status: (persistRes && persistRes.status) || 'FAILED',
reason: okStatus ? null : (persistRes && persistRes.reason) || 'PERSISTENCE_FAILED',
draftId: persistRes ? persistRes.draftId : null,
draftVersion: persistRes ? persistRes.draftVersion : null,
generatedLineCount: lines.length,
blockedLineCount: blocked,
recommendedQtyTotal: recTotal,
unresolvedProductionNeedQty: sp.unresolvedProductionNeedQty || 0,
sourcePrioritySummary: sp,
issues: (asm.issues || []).concat(built.issues || []),
ready: true
}));
}

return {
generateWeeklyShippingRecommendationDraft: generateWeeklyShippingRecommendationDraft,
_version: 'f1-7n-d-1-r1'
};
});
__kmRegister("supply-planning-weekly-recommendation-runtime", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;
























(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-weekly-input-assembler.js') : (root.KMWIA || (root.KM && root.KM.weeklyInputAssembler)),
req ? req('./supply-planning-weekly-source-allocation.js') : (root.KMWSA || (root.KM && root.KM.weeklySourceAllocation)),
req ? req('./supply-planning-plan-bridge.js') : (root.KMBRIDGE || (root.KM && root.KM.planBridge)),
req ? req('./supply-planning-recommendation-orchestrator.js') : (root.KMORCH || (root.KM && root.KM.recommendationOrchestrator))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyRecommendationBatch = api; }
})(this, function (WIA, WSA, BRIDGE, ORCH) {
'use strict';

var DEFAULT_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function aType(c, m) { if (!c) throw new TypeError('weeklyRecommendationBatch: ' + m); }
function str(v) { return String(v === undefined || v === null ? '' : v); }
function nonEmpty(v) { return str(v).length > 0; }
function cmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }












function buildWeeklySourceLines(request) {
aType(isObj(request), 'request must be an object');
var scope = isObj(request.businessScope) ? request.businessScope : {};
var company = str(scope.company), country = str(scope.country), sourcePage = str(scope.source_page);
var planningCycle = str(request.planningCycle);
var mode = nonEmpty(request.mode) ? str(request.mode) : 'SCHEDULED_REFRESH';
var formulaVersion = nonEmpty(request.formulaVersion) ? str(request.formulaVersion) : DEFAULT_FORMULA_VERSION;
var sourceDataAsOf = request.sourceDataAsOf === undefined ? null : request.sourceDataAsOf;
var meta = { company: company, country: country, sourcePage: sourcePage, planningCycle: planningCycle, mode: mode, formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf };


var missing = [];
if (!nonEmpty(company)) missing.push('businessScope.company');
if (!nonEmpty(country)) missing.push('businessScope.country');
if (!nonEmpty(sourcePage)) missing.push('businessScope.source_page');
if (!nonEmpty(planningCycle)) missing.push('planningCycle');
if (!Array.isArray(request.skus) || request.skus.length === 0) missing.push('skus');
if (missing.length) return { ok: false, status: 'BLOCKED_INPUT', reason: 'MISSING_SCOPE:' + missing.join(','), issues: [], lines: [], skuCount: 0, unresolvedTotal: 0, meta: meta };


var fv = WIA.validateFactoryConfig(request.factoryIdentityConfig, request.warehousesById);
if (!fv.ok) return { ok: false, status: 'BLOCKED_INPUT', reason: fv.reason, issues: [{ kind: 'FACTORY_IDENTITY', reason: fv.reason }], lines: [], skuCount: 0, unresolvedTotal: 0, meta: meta };


var issues = [], allLines = [], unresolvedTotal = 0, skuCount = 0;
var skus = request.skus.slice().sort(function (a, b) { return cmp(str(a.masterSku), str(b.masterSku)); });
for (var si = 0; si < skus.length; si++) {
var s = skus[si];
if (!isObj(s) || !nonEmpty(s.masterSku)) { issues.push({ kind: 'INPUT', reason: 'INVALID_SKU_ENTRY:' + si }); continue; }
var asm;
try {
asm = WIA.assembleWeeklySourceAllocationInput({
planningCycle: planningCycle, businessScope: { company: company, country: country }, masterSku: s.masterSku,
formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf,
factoryIdentityConfig: request.factoryIdentityConfig, warehousesById: request.warehousesById,
overseasSupplyPools: s.overseasSupplyPools || [], factoryPools: s.factoryPools || [], lanes: s.lanes || []
});
} catch (e) { issues.push({ kind: 'SKU', reason: 'ASSEMBLER_ERROR:' + s.masterSku }); continue; }
if (!asm.ready) { issues.push({ kind: 'SKU', reason: (asm.issues && asm.issues[0] && asm.issues[0].reason) || 'ASSEMBLER_NOT_READY', key: str(s.masterSku) }); continue; }
if (asm.issues && asm.issues.length) asm.issues.forEach(function (x) { issues.push(x); });
var built = WSA.buildWeeklySourceAllocation(asm.builderInput);
skuCount++;
(built.weeklyFacts && built.weeklyFacts.lines ? built.weeklyFacts.lines : []).forEach(function (l) { allLines.push(l); });
var sp = built.sourcePriority || {};
if (typeof sp.unresolvedProductionNeedQty === 'number') unresolvedTotal += sp.unresolvedProductionNeedQty;
}
return { ok: true, issues: issues, lines: allLines, skuCount: skuCount, unresolvedTotal: unresolvedTotal, meta: meta };
}

function generateWeeklyShippingRecommendationBatch(request, deps) {
aType(isObj(request), 'request must be an object');
aType(isObj(deps) && typeof deps.loadActiveContext === 'function' && typeof deps.lockedApply === 'function', 'deps.loadActiveContext/lockedApply required');

var scope = isObj(request.businessScope) ? request.businessScope : {};
var company = str(scope.company), country = str(scope.country), sourcePage = str(scope.source_page);
var planningCycle = str(request.planningCycle);
var mode = nonEmpty(request.mode) ? str(request.mode) : 'SCHEDULED_REFRESH';
var formulaVersion = nonEmpty(request.formulaVersion) ? str(request.formulaVersion) : DEFAULT_FORMULA_VERSION;
var sourceDataAsOf = request.sourceDataAsOf === undefined ? null : request.sourceDataAsOf;

function envelope(fields) {
var base = {
success: false, recommendationType: 'WEEKLY_SHIPPING', planningCycle: planningCycle,
businessScope: { company: company, country: country, source_page: sourcePage },
status: null, reason: null, marketplaceResults: [], skuCount: 0, marketplaceCount: 0,
recommendedQtyTotal: 0, unresolvedProductionNeedQty: 0, issues: [], formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf
};
if (fields) for (var k in fields) if (fields.hasOwnProperty(k)) base[k] = fields[k];
return base;
}


var srcRes = buildWeeklySourceLines(request);
if (!srcRes.ok) return envelope({ status: srcRes.status, reason: srcRes.reason, issues: srcRes.issues || [] });
var issues = srcRes.issues, allLines = srcRes.lines, recTotal = 0, unresolvedTotal = srcRes.unresolvedTotal, skuCount = srcRes.skuCount;


var byMkt = {};
allLines.forEach(function (l) {
var m = str(l.marketplace);
if (!nonEmpty(m)) { issues.push({ kind: 'LINE', reason: 'LINE_MISSING_MARKETPLACE:' + str(l.demandKey) }); return; }
if (!byMkt[m]) byMkt[m] = [];
byMkt[m].push(l);
if (typeof l.recommendedQty === 'number') recTotal += l.recommendedQty;
});
var marketplaces = Object.keys(byMkt).sort(cmp);


var marketplaceResults = [], anyPersist = false, allOk = marketplaces.length > 0;
for (var mi = 0; mi < marketplaces.length; mi++) {
var M = marketplaces[mi];
var mScope = { company: company, country: country, marketplace: M, source_page: sourcePage };
var mLines = byMkt[M];
var factsM = {
recommendationType: 'WEEKLY_SHIPPING', planningCycle: planningCycle, businessScope: mScope,
formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf,
lines: mLines, lineage: [], blockedInputs: [], allocationSummary: null
};
var res, bridged;
try {
bridged = BRIDGE.bridgeRecommendationFactsToPlan({ recommendationFacts: factsM, mode: mode, calculationRunId: 'PENDING' });
var computeFacts = (function (b) { return function () { return { lines: b.lines, ready: true, formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf }; }; })(bridged);
res = ORCH.runRecommendationGeneration({
recommendationType: 'WEEKLY_SHIPPING', mode: mode, planningCycle: planningCycle, businessScope: mScope,
confirmRegenerateOverUserEdits: request.confirmRegenerateOverUserEdits === true, actor: request.actor, now: request.now
}, { loadActiveContext: deps.loadActiveContext, loadPriorSnapshot: deps.loadPriorSnapshot, computeFacts: computeFacts, lockedApply: deps.lockedApply });
} catch (e) {
marketplaceResults.push({ marketplace: M, success: false, status: 'GENERATION_ERROR', reason: (e && e.message ? e.message : String(e)), draftId: null, draftVersion: null, lineCount: mLines.length });
allOk = false; continue;
}
var okM = res && res.status === 'COMPLETED';
if (okM) anyPersist = true; else allOk = false;
marketplaceResults.push({
marketplace: M, success: !!okM, status: (res && res.status) || 'FAILED', reason: okM ? null : (res && res.reason) || 'PERSISTENCE_FAILED',
draftId: res ? res.draftId : null, draftVersion: res ? res.draftVersion : null, lineCount: mLines.length
});
}

issues.sort(function (x, y) { return cmp(str(x.kind), str(y.kind)) || cmp(str(x.reason), str(y.reason)); });
return envelope({
success: allOk && marketplaces.length > 0,
status: marketplaces.length === 0 ? 'NO_DEMAND' : (allOk ? 'COMPLETED' : (anyPersist ? 'PARTIAL' : 'FAILED')),
marketplaceResults: marketplaceResults, skuCount: skuCount, marketplaceCount: marketplaces.length,
recommendedQtyTotal: recTotal, unresolvedProductionNeedQty: unresolvedTotal, issues: issues
});
}

return {
generateWeeklyShippingRecommendationBatch: generateWeeklyShippingRecommendationBatch,
buildWeeklySourceLines: buildWeeklySourceLines,
_version: 'f1-7n-d-2a-r1'
};
});
__kmRegister("supply-planning-weekly-recommendation-batch", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;


















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyHarvestAdapter = api; }
})(this, function () {
'use strict';

var SURVIVAL_HORIZON_DAYS = 18;
var DEFAULT_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function aType(c, m) { if (!c) throw new TypeError('weeklyHarvestAdapter: ' + m); }
function str(v) { return String(v === undefined || v === null ? '' : v); }
function nonEmpty(v) { return str(v).length > 0; }
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }














function resolveWorkspaceLineDestination(line) {
line = isObj(line) ? line : {};
var type = str(line.destinationType).toUpperCase();
var whId = str(line.warehouseId);
var mktRef = nonEmpty(line.destinationRefId) ? str(line.destinationRefId) : str(line.marketplaceId);
if (!type) type = nonEmpty(whId) ? 'WAREHOUSE' : (nonEmpty(mktRef) ? 'MARKETPLACE' : '');
if (type === 'WAREHOUSE') {
var wref = nonEmpty(whId) ? whId : str(line.destinationRefId);
return { destinationRef: wref, destinationType: nonEmpty(wref) ? 'WAREHOUSE' : '', isPhysicalWarehouse: nonEmpty(wref) };
}
if (type === 'MARKETPLACE') {
var mref = nonEmpty(line.destinationRefId) ? str(line.destinationRefId) : str(line.marketplaceId);
return { destinationRef: mref, destinationType: nonEmpty(mref) ? 'MARKETPLACE' : '', isPhysicalWarehouse: false };
}
return { destinationRef: '', destinationType: '', isPhysicalWarehouse: false };
}






























var READINESS_CODES = {
SOURCE_DATA_AS_OF_MISSING: 'SOURCE_DATA_AS_OF_MISSING',
PLANNING_CYCLE_MISSING: 'PLANNING_CYCLE_MISSING',
REQUESTED_SCOPE_EMPTY: 'REQUESTED_SCOPE_EMPTY',
SKU_FACTS_MISSING: 'SKU_FACTS_MISSING',
SUGGESTED_QTY_UNRESOLVED: 'SUGGESTED_QTY_UNRESOLVED',
FACTORY_SOURCE_UNRESOLVED: 'FACTORY_SOURCE_UNRESOLVED',
DESTINATION_UNRESOLVED: 'DESTINATION_UNRESOLVED',
CANONICAL_MAPPING_INCOMPLETE: 'CANONICAL_MAPPING_INCOMPLETE'
};



var ENGINE_TO_READINESS = {

MISSING_DESTINATION_WAREHOUSE: READINESS_CODES.DESTINATION_UNRESOLVED,
RECEIVER_IDENTITY_INCOMPLETE: READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE,
MISSING_WINDOW_CODE: READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE,
POOL_ELIGIBILITY_UNRESOLVED: READINESS_CODES.FACTORY_SOURCE_UNRESOLVED,
DEMAND_WEIGHT_UNRESOLVED: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
DAILY_DEMAND_UNRESOLVED: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
WEIGHT_BASIS_UNRESOLVED: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
MISSING_FORECAST_WEIGHT_SOURCE: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,

PLANNING_FACTS_NOT_READY: READINESS_CODES.SKU_FACTS_MISSING,
KMAF_NOT_READY: READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE,





FORECAST_BASIS_UNRESOLVED: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
FORECAST_SHARE_INCOMPLETE: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
RECEIVER_WITHOUT_PLANNING_FACT: READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE,





CANONICAL_DEMAND_UNAVAILABLE: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
CANONICAL_DEMAND_ROW_MISSING: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
CANONICAL_DEMAND_NOT_READY: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
CANONICAL_DEMAND_STALE: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
CANONICAL_DEMAND_LINEAGE_MISSING: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
CANONICAL_DEMAND_DUPLICATE_ROWS: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
CANONICAL_DEMAND_WINDOW_UNRESOLVED: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
CANONICAL_DEMAND_INVALID: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
EXPECTED_DEMAND_CONFLICT: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED,
EXPECTED_DEMAND_INVALID: READINESS_CODES.SUGGESTED_QTY_UNRESOLVED
};


var ENGINE_TRANSPORT = {
WORKSPACE_THREW: 1, KMAF_THREW: 1, SUPPLY_POOL_FACTS_UNAVAILABLE: 1,
FORECAST_MONTHS_UNRESOLVED: 1, WORKSPACE_NOT_OK: 1, WEEKLY_AI_PLAN_NOT_BUNDLED: 1
};


function sanitize(v) {
if (v === undefined) return '';
if (v === null) return 'null';
if (Array.isArray(v)) return 'array(' + v.length + ')';
if (typeof v === 'object') return 'object(' + Object.keys(v).length + ' keys)';
var s = String(v);
return s.length > 120 ? s.slice(0, 117) + '...' : s;
}
function readinessIssue(o) {
o = isObj(o) ? o : {};
var engine = str(o.engine_code);
var kind = o.kind || (ENGINE_TRANSPORT[engine] ? 'TRANSPORT' : 'DATA');
var code = str(o.code) || (kind === 'TRANSPORT' ? engine : (ENGINE_TO_READINESS[engine] || READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE));
var sc = isObj(o.affected_scope) ? o.affected_scope : {};
return {
code: code,
engine_code: engine,
kind: kind,
blocking: o.blocking === false ? false : true,
field: str(o.field),
stage: str(o.stage) || 'MAPPER',
expected: sanitize(o.expected),
actual: sanitize(o.actual),
source_table: str(o.source_table),
source_header: str(o.source_header),

affected_scope: {
company: str(sc.company), country: str(sc.country), marketplace: str(sc.marketplace),
sku: str(sc.sku), demandRef: str(sc.demandRef)
}
};
}


function fromEngineIssue(e, stage, scope) {
e = isObj(e) ? e : {};
var engine = str(e.code) || str(e.reason) || str(e.kind);
var ref = str(e.ref) || str(e.demandRef);
var sc = { company: str(scope && scope.company), country: str(scope && scope.country), demandRef: ref };


var parts = ref.split('|');
if (parts.length === 5) { sc.marketplace = parts[2]; sc.sku = parts[3]; }
return readinessIssue({
engine_code: engine, stage: stage, field: str(e.field), affected_scope: sc,
expected: e.expected === undefined ? 'a canonical value' : e.expected,
actual: e.actual === undefined ? (str(e.message) || 'unresolved') : e.actual,
source_table: str(e.source_table), source_header: str(e.source_header)
});
}











function mapWeeklyHarvestToBatchRequest(harvest) {
aType(isObj(harvest), 'harvest must be an object');
var scope = isObj(harvest.businessScope) ? harvest.businessScope : {};
var issues = [];
var formulaVersion = nonEmpty(harvest.formulaVersion) ? str(harvest.formulaVersion) : DEFAULT_FORMULA_VERSION;
var sourceDataAsOf = harvest.sourceDataAsOf === undefined ? null : harvest.sourceDataAsOf;

var kmaf = harvest.kmaf;



var predicates = [];
function pred(name, required, passed, detail) {
predicates.push({ name: name, required: required === true, passed: passed === true, detail: str(detail) });
return passed === true;
}
var warnings = [];
var scopeIdent = { company: str(scope.company), country: str(scope.country) };

var pKmafPresent = pred('KMAF_PRESENT', true, isObj(kmaf), isObj(kmaf) ? 'kmaf is an object' : 'kmaf is ' + (kmaf === undefined ? 'undefined' : typeof kmaf));
var pKmafReady = pred('KMAF_READY', true, isObj(kmaf) && kmaf.ready !== false, (isObj(kmaf) ? 'kmaf.ready=' + kmaf.ready : 'no kmaf'));
var pFactsArray = pred('KMAF_RECEIVER_FACTS_ARRAY', true, isObj(kmaf) && Array.isArray(kmaf.receiverFacts),
isObj(kmaf) ? 'receiverFacts is ' + (Array.isArray(kmaf.receiverFacts) ? 'an array(' + kmaf.receiverFacts.length + ')' : typeof kmaf.receiverFacts) : 'no kmaf');


pred('KMAF_RECEIVER_FACTS_NON_EMPTY', false, isObj(kmaf) && Array.isArray(kmaf.receiverFacts) && kmaf.receiverFacts.length > 0,
isObj(kmaf) && Array.isArray(kmaf.receiverFacts) ? kmaf.receiverFacts.length + ' receiver fact(s)' : 'not an array');
pred('PLANNING_CYCLE_PRESENT', false, nonEmpty(harvest.planningCycle), 'planningCycle=' + (str(harvest.planningCycle) || 'BLANK'));
pred('SCOPE_COMPANY_PRESENT', false, nonEmpty(scope.company), 'company=' + (str(scope.company) || 'BLANK'));
pred('SCOPE_COUNTRY_PRESENT', false, nonEmpty(scope.country), 'country=' + (str(scope.country) || 'BLANK'));





if (!nonEmpty(sourceDataAsOf)) {
warnings.push(readinessIssue({
code: READINESS_CODES.SOURCE_DATA_AS_OF_MISSING, blocking: false, kind: 'DATA',
field: 'sourceDataAsOf', stage: 'HARVEST',
expected: 'the source-data cutoff carried by a surviving recommendation-workspace line (YYYY-MM-DD)',
actual: sourceDataAsOf === null ? 'null' : (sourceDataAsOf === '' ? 'blank' : sourceDataAsOf),
source_table: 'recommendation workspace (derived; see gap run lineage for the STORED value)',
source_header: 'sourceDataAsOf',
affected_scope: scopeIdent
}));
}
pred('SOURCE_DATA_AS_OF_PRESENT', false, nonEmpty(sourceDataAsOf), nonEmpty(sourceDataAsOf) ? 'present' : 'blank/null (NON-BLOCKING here)');




var harvestErrs = Array.isArray(harvest.errors) ? harvest.errors : [];
var carried = harvestErrs.map(function (e) { return fromEngineIssue(e, 'HARVEST', scopeIdent); });




if (!pKmafPresent || !pKmafReady || !pFactsArray) {
var eng = (isObj(kmaf) && Array.isArray(kmaf.issues) ? kmaf.issues : []).map(function (e) { return fromEngineIssue(e, 'KMAF', scopeIdent); });
var out = carried.concat(eng);








if (!eng.length) {
var reason = (isObj(kmaf) && nonEmpty(kmaf.reason)) ? str(kmaf.reason)
: (!pKmafPresent ? 'KMAF_NOT_READY' : (!pFactsArray ? 'KMAF_NOT_READY' : 'PLANNING_FACTS_NOT_READY'));
out = out.concat([readinessIssue({
engine_code: reason, stage: 'KMAF',
field: !pFactsArray ? 'kmaf.receiverFacts' : 'kmaf.receiverFacts[]',
expected: 'at least one receiver fact for the requested (company, country) universe',
actual: reason === 'PLANNING_FACTS_NOT_READY'
? 'zero receiver facts and zero receiver issues — every site was dropped before KMAF was called'
: 'KMAF produced no usable result',
source_table: 'fc_regular_forecast',
source_header: 'company, country, marketplace, sku, year + the month column for each of M+1..M+4',
affected_scope: scopeIdent
})]);
}



var reasonCode = out.filter(function (i) { return i.blocking; })[0];
return {
ready: false, reason: reasonCode ? reasonCode.code : READINESS_CODES.CANONICAL_MAPPING_INCOMPLETE,
issues: out, warnings: warnings, predicates: predicates, request: null
};
}


var pfByRef = {};
(kmaf.planningFacts || []).forEach(function (pf) { if (nonEmpty(pf.demandRef)) pfByRef[str(pf.demandRef)] = pf; });

var horizonsByRef = isObj(harvest.horizonsByDemandRef) ? harvest.horizonsByDemandRef : {};
var poolsBySku = isObj(harvest.poolsBySku) ? harvest.poolsBySku : {};

var bySku = {}, skuOrder = [];
for (var i = 0; i < kmaf.receiverFacts.length; i++) {
var rf = kmaf.receiverFacts[i];
var ref = str(rf.demandRef);
var pf = pfByRef[ref];
if (!pf) {


issues.push(readinessIssue({
engine_code: 'RECEIVER_WITHOUT_PLANNING_FACT', stage: 'MAPPER', field: 'planningFacts[demandRef]',
expected: 'a planning fact for every receiver fact, joined on demandRef',
actual: 'no planning fact for this demandRef',
affected_scope: { company: str(scope.company), country: str(scope.country), demandRef: ref }
}));
continue;
}
var sku = nonEmpty(pf.masterSku) ? str(pf.masterSku) : str(pf.sku);
var dest = str(rf.destinationWarehouseId);
var mkt = str(rf.marketplace);
var h = horizonsByRef[ref];

if (!isObj(h) || !isObj(h.cumulativeGapByWindow)) { continue; }
var dd = num(rf.dailyDemand);
var survival = (dd === null) ? 0 : Math.ceil(SURVIVAL_HORIZON_DAYS * dd);

var lane = {
siteSku: str(pf.siteSku), destinationWarehouseId: dest, marketplace: mkt,
company: str(scope.company), country: str(scope.country),
cumulativeGapByWindow: h.cumulativeGapByWindow,
requiredByByWindow: isObj(h.requiredByByWindow) ? h.requiredByByWindow : {},
unitsPerCarton: pf.unitsPerCarton,
survivalNeedQty: survival,
demandWeight: num(rf.demandWeight) === null ? 0 : num(rf.demandWeight),
fulfillmentModel: str(rf.fulfillmentModel),
eligiblePoolTypes: Array.isArray(rf.eligiblePoolTypes) ? rf.eligiblePoolTypes.slice() : [],












allocationPriority: (rf.allocationPriority === null || rf.allocationPriority === undefined || rf.allocationPriority === '')
? null : num(rf.allocationPriority)
};
if (!bySku[sku]) { bySku[sku] = []; skuOrder.push(sku); }
bySku[sku].push(lane);
}

skuOrder.sort();
var skus = skuOrder.map(function (sku) {
var pools = isObj(poolsBySku[sku]) ? poolsBySku[sku] : {};
return {
masterSku: sku,
overseasSupplyPools: Array.isArray(pools.overseasSupplyPools) ? pools.overseasSupplyPools : [],
factoryPools: Array.isArray(pools.factoryPools) ? pools.factoryPools : [],
lanes: bySku[sku]
};
});

var request = {
planningCycle: str(harvest.planningCycle),
businessScope: { company: str(scope.company), country: str(scope.country), source_page: str(scope.source_page) },
mode: harvest.mode, confirmRegenerateOverUserEdits: harvest.confirmRegenerateOverUserEdits === true,
actor: harvest.actor, now: harvest.now,
sourceDataAsOf: sourceDataAsOf, formulaVersion: formulaVersion,
factoryIdentityConfig: harvest.factoryIdentityConfig, warehousesById: harvest.warehousesById,
skus: skus
};



pred('SKU_LANES_NON_EMPTY', false, skus.length > 0, skus.length + ' sku group(s) after the join');
var allIssues = carried.concat(issues);
allIssues.sort(function (a, b) {
return (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
(a.engine_code < b.engine_code ? -1 : a.engine_code > b.engine_code ? 1 : 0);
});



var blockingNow = allIssues.filter(function (i) { return i.blocking; });
return {
ready: true, reason: null, issues: allIssues, warnings: warnings, predicates: predicates,
partial: blockingNow.length > 0, request: request
};
}

return {
mapWeeklyHarvestToBatchRequest: mapWeeklyHarvestToBatchRequest,
resolveWorkspaceLineDestination: resolveWorkspaceLineDestination,
SURVIVAL_HORIZON_DAYS: SURVIVAL_HORIZON_DAYS,


READINESS_CODES: READINESS_CODES,
ENGINE_TO_READINESS: ENGINE_TO_READINESS,
ENGINE_TRANSPORT: ENGINE_TRANSPORT,
readinessIssue: readinessIssue,
fromEngineIssue: fromEngineIssue,
_version: 'f1-7n-fc-1b-e3-r4-readiness'
};
});
__kmRegister("supply-planning-weekly-harvest-adapter", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





























(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.routeAuthority = api; }
})(this, function () {
'use strict';

function s(v) { return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim(); }
function low(v) { return s(v).toLowerCase(); }
function num(v) { var n = Number(v); return isFinite(n) ? n : NaN; }








function days(v) {
if (v === null || v === undefined) return NaN;
if (typeof v === 'string' && v.trim() === '') return NaN;
return num(v);
}
function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function pick() { for (var i = 0; i < arguments.length; i++) { var v = arguments[i]; if (v !== undefined && v !== null && String(v) !== '') return v; } return ''; }


function dateToOrdinal(v) {
var str = s(v); if (!str) return null;
var m = str.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null;
var y = +m[1], mo = +m[2], d = +m[3];
if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
y -= mo <= 2 ? 1 : 0;
var era = Math.floor((y >= 0 ? y : y - 399) / 400);
var yoe = y - era * 400;
var doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
return era * 146097 + doe - 719468;
}


var INACTIVE_STATUS = { inactive: 1, disabled: 1, archived: 1, expired: 1, void: 1, deleted: 1 };



function statusActive(status) { return low(status) === 'active'; }
function inEffectiveWindow(effectiveFrom, effectiveTo, asOfOrdinal) {
if (asOfOrdinal == null) return true;
var from = dateToOrdinal(effectiveFrom), to = dateToOrdinal(effectiveTo);
if (from != null && asOfOrdinal < from) return false;
if (to != null && asOfOrdinal > to) return false;
return true;
}







var METHOD_ALIAS_RULES = [
{ canonical: 'Air', leadingTokens: ['air'] },
{ canonical: 'Sea Express', leadingTokens: ['sea express'] },
{ canonical: 'Sea', leadingTokens: ['sea'] },
{ canonical: 'Courier', leadingTokens: ['express', 'courier'] },


{ canonical: 'Truck', leadingTokens: ['truck'] }

];
function canonicalMethodKey(method) {
var m = low(method); if (!m) return '';
for (var i = 0; i < METHOD_ALIAS_RULES.length; i++) {
var toks = METHOD_ALIAS_RULES[i].leadingTokens;
for (var j = 0; j < toks.length; j++) { if (m.indexOf(toks[j]) === 0) return METHOD_ALIAS_RULES[i].canonical; }
}
return '';
}


function normalizeRateCard(raw) {
raw = isObj(raw) ? raw : {};
var method = s(pick(raw.shipping_method, raw.shippingMethod));
return {
rateCardId: s(pick(raw.rate_card_id, raw.rateCardId)),
carrierId: s(pick(raw.carrier_id, raw.carrierId)),
originCountry: s(pick(raw.origin_country, raw.originCountry)),
destinationCountry: s(pick(raw.destination_country, raw.destinationCountry)),
destinationWarehouseCode: s(pick(raw.destination_warehouse_code, raw.destinationWarehouseCode)),
marketplace: s(pick(raw.marketplace, raw.marketplace)),
batteryType: low(pick(raw.battery_type, raw.batteryType)),
shippingMethod: method,
shippingMethodLabel: s(pick(raw.shipping_method_label, raw.shippingMethodLabel)) || method,
methodKey: canonicalMethodKey(method),
lastMileDelivery: s(pick(raw.last_mile_delivery, raw.lastMileDelivery)),
currency: s(pick(raw.currency, raw.currency)),
unitRate: num(pick(raw.unit_rate, raw.unitRate)),
minCharge: num(pick(raw.min_charge, raw.minCharge)),
chargeType: low(pick(raw.charge_type, raw.chargeType)),
chargeUnit: low(pick(raw.charge_unit, raw.chargeUnit)),
status: s(pick(raw.status, raw.status)),
effectiveFrom: s(pick(raw.effective_from, raw.effectiveFrom)),
effectiveTo: s(pick(raw.effective_to, raw.effectiveTo))
};
}
function normalizeLeadTime(raw) {
raw = isObj(raw) ? raw : {};
var method = s(pick(raw.shipping_method, raw.shippingMethod));
return {
leadTimeId: s(pick(raw.lead_time_id, raw.leadTimeId)),
carrierId: s(pick(raw.carrier_id, raw.carrierId)),
originCountry: s(pick(raw.origin_country, raw.originCountry)),
destinationCountry: s(pick(raw.destination_country, raw.destinationCountry)),
shippingMethod: method,
methodKey: canonicalMethodKey(method),
lastMileDelivery: s(pick(raw.last_mile_delivery, raw.lastMileDelivery)),

minDays: days(pick(raw.min_days, raw.minDays)),
maxDays: days(pick(raw.max_days, raw.maxDays)),
avgDays: days(pick(raw.avg_days, raw.avgDays))
};
}




function leadTimeActive(raw) {
if (!isObj(raw)) return true;
var st = low(raw.status); if (st === 'inactive' || st === 'disabled') return false;
var a = raw.is_active !== undefined ? raw.is_active : raw.isActive;
if (a === false) return false;
var t = low(a); return !(t === 'false' || t === '0' || t === 'no' || t === 'n');
}
function rateCardUsable(card, asOfOrdinal) {
var dto = card && card.__kmra ? card : normalizeRateCard(card);
return statusActive(dto.status) && inEffectiveWindow(dto.effectiveFrom, dto.effectiveTo, asOfOrdinal);
}



function axisOk(cardVal, queryVal) {
var c = low(cardVal), q = low(queryVal);
if (q === '') return true;
if (c === '') return true;
return c === q;
}




var BATTERY_UNCLASSIFIED = 'unclassified';
function batteryOk(cardBattery, queryBattery) {
var q = low(queryBattery), c = low(cardBattery);
if (q === BATTERY_UNCLASSIFIED) return false;
return q === 'lithium_battery' ? c === 'lithium_battery' : c !== 'lithium_battery';
}

function getKMCID15e() { try { if (typeof require === 'function') { var k0 = require('./supply-planning-country-identity'); if (k0 && k0.planningSetMembers) return k0; } } catch (e) {} try { if (typeof KMCID !== 'undefined' && KMCID) return KMCID; } catch (e1) {} try { if (typeof window !== 'undefined' && window.KM && window.KM.countryIdentity) return window.KM.countryIdentity; } catch (e2) {} return null; }
function planningSetMembers(code) { var k = getKMCID15e(); try { return (k && typeof k.planningSetMembers === 'function') ? k.planningSetMembers(code) : null; } catch (e) { return null; } }


function destinationOk(cardVal, queryVal) { var set = planningSetMembers(queryVal); if (!set) return axisOk(cardVal, queryVal); var c = s(cardVal).toUpperCase(); return c === '' || set.indexOf(c) !== -1; }
function cardMatchesRoute(dto, query) {
return axisOk(dto.originCountry, query.originCountry)
&& destinationOk(dto.destinationCountry, query.destinationCountry)
&& axisOk(dto.marketplace, query.marketplace)

&& axisOk(dto.destinationWarehouseCode, query.destinationWarehouseCode)
&& batteryOk(dto.batteryType, query.batteryType);
}




function resolveAsOf(opts) {
opts = opts || {};
if (opts.asOfOrdinal !== undefined && opts.asOfOrdinal !== null) return opts.asOfOrdinal;
if (opts.shipDate) return dateToOrdinal(opts.shipDate);
return null;
}
function laneCards(query, cards, opts) {
query = query || {}; var asOf = resolveAsOf(opts);
var out = [];
(cards || []).forEach(function (raw) {
var dto = normalizeRateCard(raw);
if (!rateCardUsable(dto, asOf)) return;
if (!cardMatchesRoute(dto, query)) return;
out.push(dto);
});
return out;
}




function eligibleMethods(query, cards, opts) {
var lane = laneCards(query, cards, opts);
var seen = {}, out = [];
lane.forEach(function (dto) {
var value = dto.shippingMethod; if (!value) return;
var k = value.toLowerCase(); if (seen[k]) return; seen[k] = 1;
out.push({ value: value, label: dto.shippingMethodLabel || value });
});
out.sort(function (a, b) { return a.label.localeCompare(b.label); });
return out;
}




function leadDays(query, leadTimes, method, opts) {
query = query || {}; opts = opts || {};
var key = canonicalMethodKey(method); if (!key) return { days: null, source: null };
if (planningSetMembers(query.destinationCountry)) return { days: null, source: 'REGION_DESTINATION_NOT_CHOSEN' };
var rows = (leadTimes || []).filter(leadTimeActive).map(normalizeLeadTime).filter(function (lt) {
return lt.methodKey === key
&& axisOk(lt.originCountry, query.originCountry)
&& axisOk(lt.destinationCountry, query.destinationCountry)
&& (s(query.lastMile) === '' || axisOk(lt.lastMileDelivery, query.lastMile));
});
if (!rows.length) return { days: null, source: null };
var withAvg = rows.filter(function (r) { return isFinite(r.avgDays); })[0];
if (withAvg) return { days: withAvg.avgDays, source: 'avg' };
if (opts.fallback) {
var wMax = rows.filter(function (r) { return isFinite(r.maxDays); })[0];
if (wMax) return { days: wMax.maxDays, source: 'max' };
var wMin = rows.filter(function (r) { return isFinite(r.minDays); })[0];
if (wMin) return { days: wMin.minDays, source: 'min' };
}
return { days: null, source: null };
}







function whActive(w) {
if (!w) return false;
var a = low(w.is_active !== undefined ? w.is_active : w.isActive);
if (a === 'false' || a === 'no' || a === '0') return false;
if (w.is_active === false || w.isActive === false) return false;
return true;
}
function indexWarehouses(warehouses) {
var byId = {}, byCode = {};
(warehouses || []).forEach(function (w) {
var id = s(w.warehouse_id !== undefined ? w.warehouse_id : w.warehouseId);
var code = low(w.warehouse_code !== undefined ? w.warehouse_code : w.warehouseCode);
if (id) byId[id] = w;
if (code) { (byCode[code] = byCode[code] || []).push(w); }
});
return { byId: byId, byCode: byCode };
}
function resolveWarehouse(query, warehousesOrIndex, aliasDict) {
query = query || {};
var idx = (warehousesOrIndex && warehousesOrIndex.byId) ? warehousesOrIndex : indexWarehouses(warehousesOrIndex);
aliasDict = aliasDict || {};

var id = s(query.id);
if (id) {
var w = idx.byId[id];
if (!w) return { ok: false, block: 'WAREHOUSE_UNKNOWN' };
if (!whActive(w)) return { ok: false, block: 'WAREHOUSE_INACTIVE' };
return { ok: true, warehouse_id: id, matched_by: 'exact_id' };
}

var code = low(query.code);
if (code) {
var cands = (idx.byCode[code] || []).filter(function (w) {
if (!whActive(w)) return false;
var co = low(w.company !== undefined ? w.company : w.company);
var ct = low(w.country !== undefined ? w.country : w.country);
if (s(query.company) !== '' && co !== '' && co !== low(query.company)) return false;
if (s(query.country) !== '' && ct !== '' && ct !== low(query.country)) return false;
return true;
});
if (cands.length === 1) return { ok: true, warehouse_id: s(cands[0].warehouse_id !== undefined ? cands[0].warehouse_id : cands[0].warehouseId), matched_by: 'exact_code' };
if (cands.length > 1) return { ok: false, block: 'WAREHOUSE_AMBIGUOUS' };

var aliasId = s(aliasDict[code] || aliasDict[query.code]);
if (aliasId && idx.byId[aliasId]) {
if (!whActive(idx.byId[aliasId])) return { ok: false, block: 'WAREHOUSE_INACTIVE' };
return { ok: true, warehouse_id: aliasId, matched_by: 'alias' };
}
return { ok: false, block: 'WAREHOUSE_UNKNOWN' };
}
return { ok: false, block: 'WAREHOUSE_UNKNOWN' };
}

return {
VERSION: 'kmra-r15c-eu-1',

dateToOrdinal: dateToOrdinal, statusActive: statusActive, batteryOk: batteryOk, inEffectiveWindow: inEffectiveWindow,

METHOD_ALIAS_RULES: METHOD_ALIAS_RULES, canonicalMethodKey: canonicalMethodKey,

normalizeRateCard: normalizeRateCard, normalizeLeadTime: normalizeLeadTime, leadTimeActive: leadTimeActive, rateCardUsable: rateCardUsable,

axisOk: axisOk, cardMatchesRoute: cardMatchesRoute, destinationOk: destinationOk, planningSetMembers: planningSetMembers, laneCards: laneCards, eligibleMethods: eligibleMethods,

leadDays: leadDays,

whActive: whActive, indexWarehouses: indexWarehouses, resolveWarehouse: resolveWarehouse
};
});
__kmRegister("supply-planning-route-authority", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;












































(function (root, factory) {
if (typeof module === 'object' && module.exports) module.exports = factory(require('./supply-planning-route-authority.js'));
else root.KMMR = factory(root.KMRA);
})(this, function (KMRA) {
'use strict';

function s(v) { return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim(); }
function low(v) { return s(v).toLowerCase(); }
function num(v) { var n = Number(v); return isFinite(n) ? n : NaN; }
function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }


var METHOD_STATUS = {
AUTO_RECOMMENDED: 'AUTO_RECOMMENDED',
MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED'
};
var METHOD_REVIEW_REASONS = {
NO_LEAD_TIME_AUTHORITY_FOR_LANE: 'NO_LEAD_TIME_AUTHORITY_FOR_LANE',
NO_SAFE_METHOD_WITHIN_BUFFER: 'NO_SAFE_METHOD_WITHIN_BUFFER',
NO_REQUIRED_ARRIVAL_DATE: 'NO_REQUIRED_ARRIVAL_DATE'
};



var RISK = { SAFE: 'SAFE', TIGHT: 'TIGHT', UNSAFE: 'UNSAFE' };






function serviceProfiles(leadTimes, lane) {
lane = lane || {};
var out = [], byKey = {};
var ok = (KMRA && typeof KMRA.normalizeLeadTime === 'function' && typeof KMRA.axisOk === 'function');
var set15e = (ok && typeof KMRA.planningSetMembers === 'function') ? KMRA.planningSetMembers(lane.destinationCountry) : null;
if (!ok) return out;
(leadTimes || []).forEach(function (raw) {
if (typeof KMRA.leadTimeActive === 'function' && !KMRA.leadTimeActive(raw)) return;
var lt = KMRA.normalizeLeadTime(raw);
if (!KMRA.axisOk(lt.originCountry, lane.originCountry)) return;
if (set15e) { if (!KMRA.destinationOk(lt.destinationCountry, lane.destinationCountry)) return; } else
if (!KMRA.axisOk(lt.destinationCountry, lane.destinationCountry)) return;


if (!lt.methodKey) return;

if (!isFinite(lt.avgDays) && !isFinite(lt.maxDays) && !isFinite(lt.minDays)) return;
var key = lt.methodKey + '|' + low(lt.lastMileDelivery);
var p = byKey[key];
if (!p) {
p = byKey[key] = {
profile_key: key,
shipping_method: lt.shippingMethod, method_key: lt.methodKey,
last_mile_delivery: lt.lastMileDelivery,
min_days: null, avg_days: null, max_days: null,
carrier_ids: [], row_count: 0,

carrier_selection: 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN'
};
out.push(p);
}
p.row_count++;
if (set15e) { var dc15e = s(lt.destinationCountry).toUpperCase() || '*'; p.destination_countries = p.destination_countries || []; if (p.destination_countries.indexOf(dc15e) === -1) p.destination_countries.push(dc15e);
var bc15e = (p.transit_by_country = p.transit_by_country || {}), e15e = bc15e[dc15e] || (bc15e[dc15e] = { min_days: null, avg_days: null, max_days: null });
if (isFinite(lt.maxDays)) e15e.max_days = e15e.max_days == null ? lt.maxDays : Math.max(e15e.max_days, lt.maxDays); if (isFinite(lt.avgDays)) e15e.avg_days = e15e.avg_days == null ? lt.avgDays : Math.max(e15e.avg_days, lt.avgDays); if (isFinite(lt.minDays)) e15e.min_days = e15e.min_days == null ? lt.minDays : Math.min(e15e.min_days, lt.minDays); }
var cid = s(lt.carrierId);
if (cid && p.carrier_ids.indexOf(cid) === -1) p.carrier_ids.push(cid);



if (isFinite(lt.maxDays)) p.max_days = (p.max_days == null) ? lt.maxDays : Math.max(p.max_days, lt.maxDays);
if (isFinite(lt.avgDays)) p.avg_days = (p.avg_days == null) ? lt.avgDays : Math.max(p.avg_days, lt.avgDays);
if (isFinite(lt.minDays)) p.min_days = (p.min_days == null) ? lt.minDays : Math.min(p.min_days, lt.minDays);
});
out.forEach(function (p) { p.carrier_ids.sort(); if (set15e) { p.destination_countries.sort(); p.min_days = null; p.avg_days = null; p.max_days = null; p.transit_undetermined = 'REGION_DESTINATION_NOT_CHOSEN'; } });
out.sort(function (a, b) { return a.profile_key < b.profile_key ? -1 : (a.profile_key > b.profile_key ? 1 : 0); });
return out;
}



function conservativeBasis(p) {
if (p.max_days != null && isFinite(p.max_days)) return { days: p.max_days, basis: 'max_days' };
if (p.avg_days != null && isFinite(p.avg_days)) return { days: p.avg_days, basis: 'avg_days_no_max_recorded' };
return { days: null, basis: 'NONE' };
}












function recommend(input) {
input = isObj(input) ? input : {};
var lane = input.lane || {};
var buf = input.buffer || {};
var bufferDays = num(buf.days);
if (!isFinite(bufferDays) || bufferDays < 0) bufferDays = 0;



var dus = (input.daysUntilStockout === null || input.daysUntilStockout === undefined
|| input.daysUntilStockout === '') ? NaN : num(input.daysUntilStockout);
var profiles = serviceProfiles(input.leadTimes, lane);

var out = {
lane: { origin_country: s(lane.originCountry), destination_country: s(lane.destinationCountry) },

marketplace_used_in_lead_time_join: false,
days_until_stockout: isFinite(dus) ? dus : null,
required_by_date: s(input.requiredByDate) || null,
ship_date: s(input.shipDate) || null,
buffer_days: bufferDays,
buffer_source: s(buf.source) || null,
buffer_provisional: buf.provisional === true,
safety_rule: 'SAFE requires max_days + buffer_days < days_until_stockout (strict). min_days is display-only and is never consulted.',
profile_count: profiles.length,
options: [],
recommended: null,
alternatives: [],
status: METHOD_STATUS.MANUAL_REVIEW_REQUIRED,
review_reason: null,

carrier_selection: 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN'
};

if (!profiles.length) {
out.review_reason = METHOD_REVIEW_REASONS.NO_LEAD_TIME_AUTHORITY_FOR_LANE;
return out;
}
if (!isFinite(dus)) {


out.options = profiles.map(function (p) {
var cb = conservativeBasis(p);
return option(p, cb, bufferDays, null);
});
out.alternatives = out.options.slice();
out.review_reason = METHOD_REVIEW_REASONS.NO_REQUIRED_ARRIVAL_DATE;
return out;
}

out.options = profiles.map(function (p) { return option(p, conservativeBasis(p), bufferDays, dus); });
var safe = out.options.filter(function (o) { return o.risk === RISK.SAFE; });

if (!safe.length) {


out.review_reason = METHOD_REVIEW_REASONS.NO_SAFE_METHOD_WITHIN_BUFFER;
out.alternatives = rank(out.options);
return out;
}


var ranked = safe.slice().sort(function (a, b) {
if (a.conservative_transit_days !== b.conservative_transit_days) return b.conservative_transit_days - a.conservative_transit_days;
return a.profile_key < b.profile_key ? -1 : 1;
});
out.recommended = ranked[0];
out.status = METHOD_STATUS.AUTO_RECOMMENDED;
out.alternatives = rank(out.options.filter(function (o) { return o.profile_key !== out.recommended.profile_key; }));
return out;
}

function option(p, cb, bufferDays, dus) {
var cons = (cb.days == null) ? null : (cb.days + bufferDays);
var headroom = (cons == null || dus == null) ? null : (dus - cons);
var avgPlus = (p.avg_days == null || !isFinite(p.avg_days)) ? null : (p.avg_days + bufferDays);
var risk;
if (dus == null || cons == null) risk = null;
else if (cons < dus) risk = RISK.SAFE;
else if (avgPlus != null && avgPlus < dus) risk = RISK.TIGHT;
else risk = RISK.UNSAFE;
return {
profile_key: p.profile_key,
shipping_method: p.shipping_method, method_key: p.method_key,
last_mile_delivery: p.last_mile_delivery,
min_days: p.min_days, avg_days: p.avg_days, max_days: p.max_days,
transit_basis: cb.basis,
buffer_days: bufferDays,
conservative_transit_days: cons,
arrival_headroom_days: headroom,
risk: risk,

carrier_ids: p.carrier_ids.slice(), lead_time_row_count: p.row_count,
carrier_selection: 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN',

estimated_cost: null, cost_basis: 'NOT_EVALUATED_IN_AI_PLAN'
};
}


var BAND = { SAFE: 0, TIGHT: 1, UNSAFE: 2 };
function rank(options) {
return options.slice().sort(function (a, b) {
var ba = BAND[a.risk] === undefined ? 3 : BAND[a.risk];
var bb = BAND[b.risk] === undefined ? 3 : BAND[b.risk];
if (ba !== bb) return ba - bb;
var ha = a.arrival_headroom_days == null ? -Infinity : a.arrival_headroom_days;
var hb = b.arrival_headroom_days == null ? -Infinity : b.arrival_headroom_days;
if (ha !== hb) return hb - ha;
return a.profile_key < b.profile_key ? -1 : 1;
});
}



function bufferFor(config, methodKey) {
config = isObj(config) ? config : {};
var byMethod = isObj(config.by_method) ? config.by_method : {};
var d = num(config.default_days);
if (!isFinite(d) || d < 0) d = 0;
var src = 'default_days';
var k = (KMRA && typeof KMRA.canonicalMethodKey === 'function') ? KMRA.canonicalMethodKey(methodKey) : s(methodKey);
for (var name in byMethod) {
if (!Object.prototype.hasOwnProperty.call(byMethod, name)) continue;
var nk = (KMRA && typeof KMRA.canonicalMethodKey === 'function') ? KMRA.canonicalMethodKey(name) : s(name);
if (nk && k && nk === k) {
var v = num(byMethod[name]);
if (isFinite(v) && v >= 0) { d = v; src = 'by_method:' + name; }
break;
}
}




return { days: d, source: src, provisional: config.provisional === true,
calendar: s(config.calendar) || 'calendar_days' };
}

return {
VERSION: 'kmmr-r15c-eu-1',
METHOD_STATUS: METHOD_STATUS,
METHOD_REVIEW_REASONS: METHOD_REVIEW_REASONS,
RISK: RISK,
serviceProfiles: serviceProfiles,
conservativeBasis: conservativeBasis,
recommend: recommend,
bufferFor: bufferFor
};
});
__kmRegister("supply-planning-method-recommendation", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;



















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyRouteDerivation = api; }
})(this, function () {
'use strict';






function getKMMR() {
try { if (typeof require === 'function') return require('./supply-planning-method-recommendation'); } catch (e) {}
if (typeof KMMR !== 'undefined' && KMMR) return KMMR;
try { if (typeof window !== 'undefined' && window.KM && window.KM.methodRecommendation) return window.KM.methodRecommendation; } catch (e2) {}
return null;
}
function getKMRA() {
try { if (typeof require === 'function') return require('./supply-planning-route-authority'); } catch (e) {}
if (typeof KMRA !== 'undefined' && KMRA) return KMRA;
try { if (typeof window !== 'undefined' && window.KM && window.KM.routeAuthority) return window.KM.routeAuthority; } catch (e2) {}
return null;
}

function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function low(v) { return s(v).toLowerCase(); }
function num(v) { var n = Number(v); return isFinite(n) ? n : NaN; }
function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }


function dateToOrdinal(v) {
var str = s(v); if (!str) return null;
var m = str.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null;
var y = +m[1], mo = +m[2], d = +m[3];
if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

y -= mo <= 2 ? 1 : 0;
var era = Math.floor((y >= 0 ? y : y - 399) / 400);
var yoe = y - era * 400;
var doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
return era * 146097 + doe - 719468;
}

function ordinalToDate(z) {
if (z == null || !isFinite(z)) return '';
z += 719468;
var era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
var doe = z - era * 146097;
var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
var y = yoe + era * 400;
var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
var mp = Math.floor((5 * doy + 2) / 153);
var d = doy - Math.floor((153 * mp + 2) / 5) + 1;
var m = mp + (mp < 10 ? 3 : -9);
y += (m <= 2 ? 1 : 0);
return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
}


var INACTIVE_STATUS = { inactive: 1, disabled: 1, archived: 1, expired: 1, void: 1, deleted: 1 };
function statusActive(row) { var st = low(row && row.status); return st === '' ? true : !INACTIVE_STATUS[st]; }
function whActive(w) {
if (!w) return false;
if (w.is_active === false || low(w.is_active) === 'false' || low(w.is_active) === 'no') return false;
return true;
}
function inEffectiveWindow(row, asOfOrdinal) {
if (asOfOrdinal == null) return true;
var from = dateToOrdinal(row.effective_from), to = dateToOrdinal(row.effective_to);
if (from != null && asOfOrdinal < from) return false;
if (to != null && asOfOrdinal > to) return false;
return true;
}


function indexWarehouses(warehouses) {
var byId = {};
(warehouses || []).forEach(function (w) { var id = s(w.warehouse_id); if (id) byId[id] = w; });
return byId;
}
















function deriveRoute(input) {
input = isObj(input) ? input : {};
var whById = input.warehousesById || indexWarehouses(input.warehouses);
var override = input.override || {};
var asOf = dateToOrdinal(input.shipDate);



var srcId = s(input.source && input.source.warehouse_id);
if (!srcId) return blocked((input.source && input.source.multi_pool) ? 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED' : 'ROUTE_SOURCE_UNKNOWN');
var srcWh = whById[srcId];
if (!srcWh) return blocked('ROUTE_SOURCE_UNKNOWN');
if (!whActive(srcWh)) return blocked('ROUTE_SOURCE_INACTIVE');
var originCountry = s(srcWh.country);





var dest = input.destination || {};
var destKind, destWarehouseId = '', destMarketplace = '', destCountry = s(dest.country), destWhCode = '';
if (low(dest.kind) === 'warehouse') {
destWarehouseId = s(dest.warehouse_id);
if (!destWarehouseId) return blocked('DESTINATION_MISSING');
var destWh = whById[destWarehouseId];
if (!destWh) return blocked('DESTINATION_UNKNOWN');
if (!whActive(destWh)) return blocked('DESTINATION_INACTIVE');
var whC15e = s(destWh.country).toUpperCase(), kmra15e = getKMRA(), set15e = (destCountry && kmra15e && typeof kmra15e.planningSetMembers === 'function') ? kmra15e.planningSetMembers(destCountry) : null;
destCountry = (set15e && whC15e && set15e.indexOf(whC15e) !== -1) ? whC15e : (destCountry || s(destWh.country)); destWhCode = s(destWh.warehouse_code);
destKind = 'WAREHOUSE';
} else if (low(dest.kind) === 'marketplace') {
destMarketplace = s(dest.marketplace);
if (!destMarketplace) return blocked('DESTINATION_MISSING');
destKind = 'MARKETPLACE';
} else {
return blocked('DESTINATION_MISSING');
}







var kmra = getKMRA();
if (!kmra || typeof kmra.laneCards !== 'function') return blocked('ROUTE_METHOD_UNRESOLVED', 'KMRA_UNAVAILABLE');


var routeQuery = { originCountry: originCountry, destinationCountry: destCountry, marketplace: destKind === 'MARKETPLACE' ? destMarketplace : '',
destinationWarehouseCode: destKind === 'WAREHOUSE' ? destWhCode : '', batteryType: s(input.batteryType) };
if (low(input.batteryType) === 'unclassified') return blocked('ROUTE_METHOD_UNRESOLVED', 'RATE_CARD_BATTERY_UNCLASSIFIED');
var lane = kmra.laneCards(routeQuery, input.rateCards, { asOfOrdinal: asOf });
if (typeof kmra.planningSetMembers === 'function' && kmra.planningSetMembers(destCountry)) lane = lane.map(function (dto) { return Object.assign({}, dto, { currency: '', unitRate: NaN, minCharge: NaN, chargeType: '', chargeUnit: '', priced: false }); });



















var methodSource = 'RATE_CARD';
var candidates = lane;
var kmmr = getKMMR();
var profiles = (kmmr && typeof kmmr.serviceProfiles === 'function')
? kmmr.serviceProfiles(input.leadTimes, { originCountry: originCountry, destinationCountry: destCountry })
: [];
var pricedKey = {}; lane.forEach(function (dto) { pricedKey[low(dto.shippingMethod) + '||' + low(dto.lastMileDelivery)] = 1; });
var unpriced = profiles.filter(function (p) { return !pricedKey[low(p.shipping_method) + '||' + low(p.last_mile_delivery)]; });
var rankSet = lane;
if (unpriced.length) {
{
if (!lane.length) methodSource = 'LEAD_TIME_AUTHORITY';


var unpricedDtos = unpriced.map(function (p) {
return { rateCardId: '', carrierId: '', shippingMethod: p.shipping_method,
shippingMethodLabel: p.shipping_method, lastMileDelivery: p.last_mile_delivery,
currency: '', unitRate: NaN, minCharge: NaN, chargeType: '', chargeUnit: '', priced: false,
originCountry: originCountry, destinationCountry: destCountry, marketplace: '' };
});
candidates = lane.concat(unpricedDtos);
if (!lane.length) rankSet = unpricedDtos;
}
}
if (!candidates.length) {



var relaxed = (input.rateCards || []).map(kmra.normalizeRateCard).filter(function (dto) { return kmra.cardMatchesRoute(dto, routeQuery); });




var reason = !relaxed.length ? 'NO_TRANSIT_AUTHORITY_FOR_LANE'
: (!relaxed.some(function (dto) { return dto.shippingMethod; }) ? 'NO_CANONICAL_METHOD' : 'CARD_INACTIVE_OR_OUTSIDE_EFFECTIVE_DATE');


var b = blocked('ROUTE_METHOD_UNRESOLVED', reason);
b.lane_query = { originCountry: routeQuery.originCountry, destinationCountry: routeQuery.destinationCountry,
marketplace: routeQuery.marketplace, shipDate: s(input.shipDate) };
b.method_unresolved_candidates = relaxed.slice(0, 10).map(function (dto) {
return { rateCardId: dto.rateCardId, originCountry: dto.originCountry,
destinationCountry: dto.destinationCountry, marketplace: dto.marketplace,
shippingMethod: dto.shippingMethod, status: dto.status,
effectiveFrom: dto.effectiveFrom, effectiveTo: dto.effectiveTo };
});
return b;
}

var reqOrd = dateToOrdinal(input.requiredByDate);
function leadDaysFor(method, lastMile) {
var r = kmra.leadDays({ originCountry: originCountry, destinationCountry: destCountry, lastMile: lastMile }, input.leadTimes, method, { fallback: true });
return (r && isFinite(r.days)) ? r.days : null;
}
function onTime(days) { return reqOrd == null || asOf == null || days == null ? (days != null) : (asOf + days <= reqOrd); }
function estCost(dto) {


var r = num(dto.unitRate); var mc = num(dto.minCharge);
return isFinite(r) ? r : (isFinite(mc) ? mc : NaN);
}


if (s(override.shipping_method)) {
var ovLane = candidates.filter(function (dto) { return low(dto.shippingMethod) === low(override.shipping_method) && (s(override.last_mile_delivery) === '' || low(dto.lastMileDelivery) === low(override.last_mile_delivery)); });
if (!ovLane.length) return blocked('OVERRIDE_INVALID');
var ovLm = resolveLastMile(ovLane, override.last_mile_delivery);
if (ovLm.block) return blocked(ovLm.block);
return okRoute(srcId, destKind, destWarehouseId, destMarketplace, s(override.shipping_method), ovLm.value, { override: true });
}





var manualSeen = {}, manualOptions = [];
candidates.forEach(function (dto) { var m = s(dto.shippingMethod); if (!m) return; var mk = low(m); if (manualSeen[mk]) { if (dto.priced !== false) manualSeen[mk].priced = true; return; } manualSeen[mk] = { value: m, label: s(dto.shippingMethodLabel) || m, priced: dto.priced !== false }; manualOptions.push(manualSeen[mk]); });
manualOptions.sort(function (a, b) { return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0); });


var pairSeen = {}, pairs = [], rankKeys = {};
rankSet.forEach(function (dto) { rankKeys[low(dto.shippingMethod) + '||' + low(dto.lastMileDelivery)] = 1; });
candidates.forEach(function (dto) {
var m = s(dto.shippingMethod); if (!m) return;
var lmv = s(dto.lastMileDelivery), pk = low(m) + '||' + low(lmv);
if (pairSeen[pk]) return; pairSeen[pk] = 1;
var days = leadDaysFor(m, lmv);
pairs.push({ method: m, last_mile: lmv, days: days, onTime: onTime(days), cost: estCost(dto), currency: s(dto.currency), chargeType: low(dto.chargeType), chargeUnit: low(dto.chargeUnit), tuple: low(m) + '|' + low(lmv) });
});

var allPairs = pairs; pairs = allPairs.filter(function (p) { return rankKeys[low(p.method) + '||' + low(p.last_mile)]; });

if (s(override.shipping_method)) {
var ov = allPairs.filter(function (p) { return low(p.method) === low(override.shipping_method) && (s(override.last_mile_delivery) === '' || low(p.last_mile) === low(override.last_mile_delivery)); });
if (!ov.length) return blocked('OVERRIDE_INVALID');
if (s(override.last_mile_delivery) === '' && uniq(ov.map(function (p) { return low(p.last_mile); })).length > 1) return authorityRequired(manualOptions, ov.map(pairEvi));
var ovp = ov[0];
return okRoute(srcId, destKind, destWarehouseId, destMarketplace, ovp.method, ovp.last_mile, { cost: ovp.cost, currency: ovp.currency, days: ovp.days, override: true }, { status: 'AI_RANKED', manualOptions: manualOptions, aiPairs: [pairEvi(ovp)], selected: pairEvi(ovp) });
}

var onTimePairs = pairs.filter(function (p) { return p.onTime === true; });
var anyDays = pairs.some(function (p) { return p.days != null; });
if (!onTimePairs.length) {
var fastest = pairs.slice().filter(function (p) { return p.days != null; }).sort(function (a, b) { return a.days - b.days; })[0] || null;
return manualOnly(anyDays ? 'NO_ON_TIME' : 'NO_LEAD_TIME', manualOptions, pairs.map(pairEvi), fastest);
}

var aiPairs = onTimePairs.filter(function (p) { return p.days != null; });
if (!aiPairs.length) return manualOnly('NO_LEAD_TIME', manualOptions, onTimePairs.map(pairEvi), null);




var pricedPairs = aiPairs.filter(function (p) { return isFinite(p.cost); });
var costCurr = uniq(pricedPairs.map(function (p) { return p.currency; }).filter(Boolean));
var costUnit = uniq(pricedPairs.map(function (p) { return p.chargeType + '|' + p.chargeUnit; }));
if (pricedPairs.length && (costCurr.length > 1 || costUnit.length > 1)) return manualOnly('COST_NOT_COMPARABLE', manualOptions, aiPairs.map(pairEvi), null);
var comparableCost = pricedPairs.length > 0;
function costOf(p) { return isFinite(p.cost) ? p.cost : Infinity; }
var ranked = aiPairs.slice().sort(function (a, b) {
if (comparableCost && costOf(a) !== costOf(b)) return costOf(a) - costOf(b);
if (a.days !== b.days) return a.days - b.days;
return a.tuple < b.tuple ? -1 : (a.tuple > b.tuple ? 1 : 0);
});
var win = ranked[0];

var tieGroup = ranked.filter(function (p) { return p.days === win.days && (!comparableCost || costOf(p) === costOf(win)); });
if (uniq(tieGroup.map(function (p) { return p.tuple; })).length > 1) return authorityRequired(manualOptions, tieGroup.map(pairEvi));

return okRoute(srcId, destKind, destWarehouseId, destMarketplace, win.method, win.last_mile, { cost: win.cost, currency: win.currency, days: win.days }, { status: 'AI_RANKED', manualOptions: manualOptions, aiPairs: aiPairs.map(pairEvi), selected: pairEvi(win) });

function pairEvi(p) { return { method: p.method, last_mile: p.last_mile, days: p.days, cost: isFinite(p.cost) ? p.cost : null, currency: p.currency, onTime: p.onTime }; }
function blocked(tok, reason) { return { ok: false, block: tok, method_unresolved_reason: reason || null, route_candidate_status: 'BLOCKED', manual_method_options: (typeof manualOptions !== 'undefined' && manualOptions) ? manualOptions : [] }; }


function authorityRequired(manualOpts, tie) {
return { ok: false, block: 'LAST_MILE_AMBIGUOUS', route_candidate_status: 'AMBIGUOUS',
manual_method_options: manualOpts || [], ai_rankable_route_pairs: tie || [], tie_group: tie || [] };
}

function manualOnly(reason, manualOpts, cands, fastest) {
return { ok: false, block: 'ROUTE_AUTO_RANKING_INSUFFICIENT', route_candidate_status: 'MANUAL_ONLY',
auto_ranking_insufficient_reason: reason, manual_method_options: manualOpts || [], ai_rankable_route_pairs: [],
candidates: cands || [], advisory: fastest ? { fastest_method: fastest.method, fastest_days: fastest.days } : null };
}
function okRoute(sourceId, dk, dwid, dmk, method, lastMile, ev, dto) {
dto = dto || {}; ev = ev || {};
var days = isFinite(ev.days) ? ev.days : null;
var eta = (days != null && asOf != null) ? ordinalToDate(asOf + days) : '';
return { ok: true, route: {
source_warehouse_id: sourceId, destination_kind: dk, destination_warehouse_id: dwid, destination_marketplace: dmk,
recommended_source_warehouse_id: sourceId, recommended_destination_warehouse_id: dwid,
recommended_shipping_method: method, recommended_last_mile_delivery: lastMile,
destination_marketplace: dmk
}, evidence: ev,
route_candidate_status: dto.status || 'AI_RANKED',
manual_method_options: dto.manualOptions || [{ value: method, label: method }],
ai_rankable_route_pairs: dto.aiPairs || [],
selected_ai_route: dto.selected || { method: method, last_mile: lastMile },
auto_rankable_methods: (dto.aiPairs || []).map(function (p) { return { method: p.method, days: p.days, cost: p.cost, currency: p.currency }; }),
selected_method: method, selected_last_mile: lastMile,



expected_arrival: eta, transit_days: days,


method_source: methodSource,


selected_priced: !!pricedKey[low(method) + '||' + low(lastMile)],
method_set_source: unpriced.length ? (lane.length ? 'RATE_CARD+LEAD_TIME_AUTHORITY' : 'LEAD_TIME_AUTHORITY') : 'RATE_CARD',
estimated_cost: isFinite(ev.cost) ? ev.cost : null, currency: s(ev.currency),
cost_basis: (methodSource === 'RATE_CARD' && !!pricedKey[low(method) + '||' + low(lastMile)]) ? 'RATE_CARD' : 'NOT_PRICED_NO_RATE_CARD_FOR_LANE' };
}
}





function resolveLastMile(cards, override) {
if (s(override)) {
var ok = cards.some(function (rc) { return low(rc.lastMileDelivery) === low(override); });
return ok ? { value: s(override) } : { block: 'OVERRIDE_INVALID' };
}
var vals = uniq(cards.map(function (rc) { return s(rc.lastMileDelivery); }).filter(function (v) { return v !== ''; }));
if (vals.length === 1) return { value: vals[0] };
if (vals.length === 0) {

var allBlank = cards.every(function (rc) { return s(rc.lastMileDelivery) === ''; });
return allBlank ? { value: '' } : { block: 'LAST_MILE_UNRESOLVED' };
}
return { block: 'LAST_MILE_AMBIGUOUS' };
}

function evi(c) { return { method: c.method, days: c.days, onTime: c.onTime, cost: c.cost, currency: c.currency }; }
function uniq(a) { var seen = {}, out = []; (a || []).forEach(function (x) { var k = String(x); if (!seen[k]) { seen[k] = 1; out.push(x); } }); return out; }








function routeTuple(route) {
return [low(route.source_warehouse_id), low(route.destination_kind),
low(route.destination_warehouse_id), low(route.destination_marketplace),
low(route.recommended_shipping_method), low(route.recommended_last_mile_delivery)].join('|');
}
function partitionRoutedLines(scope, routedLines) {
scope = scope || {};
var buckets = {}, order = [], blocked = [];
(routedLines || []).forEach(function (rl) {








if (!rl || !rl.route || rl.block) { if (rl && rl.block) blocked.push({ line: rl.line, block: rl.block, advisory: rl.advisory || null, route_candidate_status: rl.route_candidate_status || 'BLOCKED', auto_ranking_insufficient_reason: rl.auto_ranking_insufficient_reason || null, method_unresolved_reason: rl.method_unresolved_reason || null, lane_query: rl.lane_query || null, manual_method_options: rl.manual_method_options || [] }); return; }
var key = routeTuple(rl.route);
if (!buckets[key]) { buckets[key] = { routeKey: key, route: rl.route, lines: [], evidence: [] }; order.push(key); }
buckets[key].lines.push(rl.line);















buckets[key].evidence.push({ expected_arrival: s(rl.expected_arrival), transit_days: (rl.transit_days == null ? null : num(rl.transit_days)), estimated_cost: (rl.estimated_cost == null ? null : num(rl.estimated_cost)), currency: s(rl.currency), route_candidate_status: s(rl.route_candidate_status), method_source: s(rl.method_source), cost_basis: s(rl.cost_basis) });
});

order.sort();
var groups = order.map(function (key, i) {
var b = buckets[key];



var evUniq = uniq((b.evidence || []).map(function (e) { return e.expected_arrival + '|' + e.transit_days + '|' + e.estimated_cost + '|' + e.currency; }));
var ev0 = (b.evidence || [])[0] || { expected_arrival: '', transit_days: null, estimated_cost: null, currency: '', route_candidate_status: '', method_source: '', cost_basis: '' };
return {
groupNo: i + 1, routeKey: key,
header: buildGroupHeader(scope, b.route, i + 1),
lines: b.lines,
route_evidence: { expected_arrival: ev0.expected_arrival, transit_days: ev0.transit_days,
estimated_cost: ev0.estimated_cost,
currency: ev0.currency, route_candidate_status: ev0.route_candidate_status,
method_source: ev0.method_source, cost_basis: ev0.cost_basis,
line_count: (b.evidence || []).length,
evidence_uniform: evUniq.length <= 1,
disagreement: evUniq.length > 1 ? evUniq : null }
};
});
return { groups: groups, blocked: blocked };
}
function buildGroupHeader(scope, route, groupNo) {
return {
planning_cycle: s(scope.planning_cycle), company: s(scope.company), country: s(scope.country),
marketplace: s(scope.marketplace), source_page: s(scope.source_page || 'inventory_replenishment'),
recommended_source_warehouse_id: s(route.recommended_source_warehouse_id),
recommended_destination_warehouse_id: s(route.recommended_destination_warehouse_id),
recommended_shipping_method: s(route.recommended_shipping_method),
recommended_last_mile_delivery: s(route.recommended_last_mile_delivery),
recommendation_group_no: String(groupNo),
destination_marketplace: s(route.destination_marketplace)
};
}




function checkConservation(authorizedBySkuWindow, groups, sourceCeilingById) {
authorizedBySkuWindow = authorizedBySkuWindow || {};
sourceCeilingById = sourceCeilingById || {};
var allocatedBySkuWindow = {}, allocatedBySource = {}, dupKeys = [], seen = {};
(groups || []).forEach(function (g) {
(g.lines || []).forEach(function (l) {
var sw = low(l.sku) + '|' + low(l.window_code);
var q = num(l.planned_qty); if (!isFinite(q)) q = num(l.recommended_qty); if (!isFinite(q)) q = 0;
allocatedBySkuWindow[sw] = (allocatedBySkuWindow[sw] || 0) + q;
var src = low(g.header.recommended_source_warehouse_id);
allocatedBySource[src] = (allocatedBySource[src] || 0) + q;
var dk = g.header.recommendation_group_no + '|' + sw;
if (seen[dk]) dupKeys.push(dk); else seen[dk] = 1;
});
});
var overAuthorized = [], overSource = [];
Object.keys(allocatedBySkuWindow).forEach(function (k) {
var auth = num(authorizedBySkuWindow[k]);
if (isFinite(auth) && allocatedBySkuWindow[k] - auth > 1e-9) overAuthorized.push({ key: k, allocated: allocatedBySkuWindow[k], authorized: auth });
});
Object.keys(allocatedBySource).forEach(function (id) {
var cap = num(sourceCeilingById[id]);
if (isFinite(cap) && allocatedBySource[id] - cap > 1e-9) overSource.push({ source_warehouse_id: id, allocated: allocatedBySource[id], ceiling: cap });
});
return {
conserved: overAuthorized.length === 0 && overSource.length === 0 && dupKeys.length === 0,
over_authorized: overAuthorized, over_source: overSource, duplicate_sku_window_in_group: dupKeys,
allocated_by_sku_window: allocatedBySkuWindow, allocated_by_source: allocatedBySource
};
}














function planLineKey(l) { return [low(l.sku), low(l.site_sku), low(l.window_code), low(l.source_warehouse_id)].join('|'); }
function buildK2GenerationPlan(input) {
input = isObj(input) ? input : {};
var scope = input.scope || {};
var whById = input.warehousesById || indexWarehouses(input.warehouses);
var overrides = input.overridesByKey || {};
var routed = (input.allocatedLines || []).map(function (al) {
al = al || {};
var lineKey = planLineKey(al);
var r = deriveRoute({
source: { warehouse_id: al.source_warehouse_id, multi_pool: al.source_multi_pool === true },
destination: al.destination || {},
requiredByDate: al.required_by_date, shipDate: input.shipDate,
warehousesById: whById, rateCards: input.rateCards, leadTimes: input.leadTimes,
override: overrides[lineKey] || null
});

var line = {
sku: s(al.sku), site_sku: s(al.site_sku), window_code: s(al.window_code),
window_start_date: s(al.window_start_date), window_end_date: s(al.window_end_date),
required_by_date: s(al.required_by_date),
source_warehouse_id: s(al.source_warehouse_id), source_warehouse_code_snapshot: s(al.source_warehouse_code_snapshot),
planned_qty: al.planned_qty, recommended_qty: al.recommended_qty, units_per_carton: al.units_per_carton
};
var destKind = (al.destination && low(al.destination.kind)) === 'marketplace' ? 'MARKETPLACE' : ((al.destination && low(al.destination.kind)) === 'warehouse' ? 'WAREHOUSE' : '');

return r.ok
? { line: line, route: r.route, destination_kind: destKind, route_candidate_status: r.route_candidate_status, manual_method_options: r.manual_method_options, ai_rankable_route_pairs: r.ai_rankable_route_pairs, selected_ai_route: r.selected_ai_route, auto_rankable_methods: r.auto_rankable_methods, expected_arrival: r.expected_arrival, transit_days: (r.transit_days == null ? null : r.transit_days), estimated_cost: r.estimated_cost, currency: r.currency, method_source: r.method_source || null, cost_basis: r.cost_basis || null }











: { line: line, block: r.block, destination_kind: destKind, route_candidate_status: r.route_candidate_status, auto_ranking_insufficient_reason: r.auto_ranking_insufficient_reason || null, method_unresolved_reason: r.method_unresolved_reason || null, lane_query: r.lane_query || null, method_unresolved_candidates: r.method_unresolved_candidates || [], manual_method_options: r.manual_method_options || [], ai_rankable_route_pairs: r.ai_rankable_route_pairs || [], advisory: r.advisory || null };
});
var part = partitionRoutedLines(scope, routed);
var conservation = checkConservation(input.authorizedBySkuWindow, part.groups, input.sourceCeilingById);
var completeness = buildCompleteness(input.authorizedBySkuWindow, part, conservation);

var lineOutcomes = routed.map(function (rl) {
return {
source_warehouse_id: rl.line.source_warehouse_id, destination_kind: rl.destination_kind || '',
route_candidate_status: rl.route_candidate_status || (rl.route ? 'AI_RANKED' : 'BLOCKED'),
block: rl.block || null, auto_ranking_insufficient_reason: rl.auto_ranking_insufficient_reason || null,
method_unresolved_reason: rl.method_unresolved_reason || null,
manual_method_options: rl.manual_method_options || [], ai_rankable_route_pairs: rl.ai_rankable_route_pairs || [],
selected_ai_route: rl.selected_ai_route || null,
selected_method: rl.route ? rl.route.recommended_shipping_method : null,
selected_last_mile: rl.route ? rl.route.recommended_last_mile_delivery : null, expected_arrival: rl.expected_arrival || null,
transit_days: (rl.transit_days == null ? null : rl.transit_days)
};
});
return { ok: conservation.conserved, groups: part.groups, blocked: part.blocked, conservation: conservation,
completeness: completeness, lineOutcomes: lineOutcomes };
}

































function buildCompleteness(authorizedBySkuWindow, part, conservation) {
authorizedBySkuWindow = authorizedBySkuWindow || {};
var authorized = 0, authKeys = [];
Object.keys(authorizedBySkuWindow).forEach(function (k) {
var q = num(authorizedBySkuWindow[k]); if (!isFinite(q)) q = 0;
authorized += q; authKeys.push(k);
});
var emitted = 0, routedKeys = {};
((part && part.groups) || []).forEach(function (g) {
(g.lines || []).forEach(function (l) {
var q = num(l.planned_qty); if (!isFinite(q)) q = num(l.recommended_qty); if (!isFinite(q)) q = 0;
emitted += q;
routedKeys[low(l.sku) + '|' + low(l.window_code)] = 1;
});
});

var blockers = [], seenB = {};
((part && part.blocked) || []).forEach(function (b) {
var tok = s(b && b.block); if (!tok) return;
var sub2 = s(b && (b.method_unresolved_reason || b.auto_ranking_insufficient_reason));
var k = tok + '|' + sub2;
if (seenB[k]) { seenB[k].quantity += (num(b.line && (b.line.planned_qty != null ? b.line.planned_qty : b.line.recommended_qty)) || 0); return; }
var entry = { block: tok, reason: sub2 || null, lane_query: (b && b.lane_query) || null,
quantity: num(b.line && (b.line.planned_qty != null ? b.line.planned_qty : b.line.recommended_qty)) || 0 };
seenB[k] = entry; blockers.push(entry);
});


var tokens = [];
blockers.forEach(function (b) {
if (b.reason && tokens.indexOf(b.reason) === -1) tokens.push(b.reason);
if (tokens.indexOf(b.block) === -1) tokens.push(b.block);
});





















var MANUAL_RESOLVABLE_BLOCKS = ['ROUTE_METHOD_UNRESOLVED', 'ROUTE_AUTO_RANKING_INSUFFICIENT',
'LAST_MILE_AMBIGUOUS', 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED'];
var manualReviewQty = 0, dataFaultQty = 0;
((part && part.blocked) || []).forEach(function (b) {
var q = num(b && b.line && (b.line.planned_qty != null ? b.line.planned_qty : b.line.recommended_qty));
if (!isFinite(q)) q = 0;
if (MANUAL_RESOLVABLE_BLOCKS.indexOf(s(b && b.block)) !== -1) manualReviewQty += q;
else dataFaultQty += q;
});
var unroutedKeys = authKeys.filter(function (k) { return !routedKeys[k]; });
var fullyRoutable = ((part && part.blocked) || []).length === 0 && unroutedKeys.length === 0
&& Math.abs((authorized - emitted)) <= 1e-9;
return {
authorized_quantity: authorized,
supply_allocated_quantity: authorized,



unresolved_supply_quantity: 0,

automatic_route_quantity: emitted,

manual_route_review_quantity: manualReviewQty,
route_data_fault_quantity: dataFaultQty,
unresolved_route_quantity: authorized - emitted,





execution_route_materialized_quantity: emitted,
route_materialization_complete: fullyRoutable,
quantity_axes: {
supply: ['authorized_quantity', 'supply_allocated_quantity', 'unresolved_supply_quantity'],
route: ['automatic_route_quantity', 'manual_route_review_quantity', 'route_data_fault_quantity',
'unresolved_route_quantity', 'execution_route_materialized_quantity'],
note: 'A route number is NEVER a statement about supply. unresolved_route_quantity of 760 beside '
+ 'unresolved_supply_quantity of 0 means the units are sourced and awaiting a route, not that '
+ 'sourcing failed.'
},


legacy_fields: {
emitted_route_quantity: 'ROUTE axis. Quantity that reached a derived route. Same number as '
+ 'automatic_route_quantity. Says NOTHING about whether supply was allocated.',
unresolved_quantity: 'ROUTE axis. authorized minus emitted. Renamed unresolved_route_quantity.',
fully_routable: 'ROUTE axis. Renamed route_materialization_complete.',
conserved: 'SUPPLY axis, SAFETY only. True means nothing was over-allocated, went negative or was '
+ 'claimed twice. It is NOT a coverage verdict and never was.',
total_allocated_quantity: 'ROUTE axis, despite the name. It is the EMITTED ROUTE total. A value of 0 '
+ 'does NOT mean supply allocation produced nothing — read supply_allocated_quantity for that.'
},
emitted_route_quantity: emitted,
unresolved_quantity: authorized - emitted,
route_count: ((part && part.groups) || []).length,
blocked_line_count: ((part && part.blocked) || []).length,
unrouted_sku_window_keys: unroutedKeys,

supply_allocation_conserved: !!(conservation && conservation.conserved),


route_quantity_conserved: Math.abs((authorized - emitted)) <= 1e-9,


fully_routable: fullyRoutable,
blockers: blockers,
blocker_tokens: tokens
};
}

return {
VERSION: 'kmwrr-r15c-eu-1',
buildK2GenerationPlan: buildK2GenerationPlan, planLineKey: planLineKey,






BLOCK_TOKENS: ['ROUTE_SOURCE_UNKNOWN', 'ROUTE_SOURCE_INACTIVE', 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED',
'DESTINATION_MISSING', 'DESTINATION_UNKNOWN', 'DESTINATION_INACTIVE',
'ROUTE_METHOD_UNRESOLVED', 'ROUTE_AUTO_RANKING_INSUFFICIENT', 'LAST_MILE_AMBIGUOUS', 'OVERRIDE_INVALID'],
METHOD_UNRESOLVED_REASONS: ['NO_TRANSIT_AUTHORITY_FOR_LANE', 'NO_CARRIER_CARD_FOR_LANE', 'CARD_INACTIVE_OR_OUTSIDE_EFFECTIVE_DATE', 'NO_CANONICAL_METHOD', 'KMRA_UNAVAILABLE'],
ROUTE_CANDIDATE_STATUSES: ['AI_RANKED', 'MANUAL_ONLY', 'AMBIGUOUS', 'BLOCKED'],
dateToOrdinal: dateToOrdinal, ordinalToDate: ordinalToDate, indexWarehouses: indexWarehouses,
deriveRoute: deriveRoute, routeTuple: routeTuple,
partitionRoutedLines: partitionRoutedLines, buildGroupHeader: buildGroupHeader,
checkConservation: checkConservation
};
});
__kmRegister("supply-planning-weekly-route-derivation", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;
























(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.sourceReader = api; }
})(this, function (SF) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function aRange(c, m) { if (!c) throw new RangeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nonEmpty(v) { return str(v).length > 0; }

var DEMAND_TYPES = { REGULAR: 1, SALES_RUN_RATE: 1, SPECIAL_EVENT: 1, SAFETY: 1 };
var POOL_TYPES = { FBA: 1, THREE_PL: 1, FACTORY: 1 };
var FULFILLMENT_MODELS = { self_fulfilled: 1, platform_fulfilled: 1, hybrid: 1 };
var KEY_SEP = String.fromCharCode(1);



















var DEFAULT_COLUMNS = {
demand: {
demandType: 'demand_type', sourceRef: 'source_ref', requiredByDate: 'required_by_date',
quantity: 'quantity', eventId: 'event_id',
masterSku: 'sku', company: 'company', country: 'country', marketplace: 'marketplace',
destinationWarehouseId: 'destination_warehouse_id', planningCycle: 'planning_cycle'
},
supply: {
supplyLineageRef: 'supply_lineage_ref', masterSku: 'sku', company: 'company',
warehouseId: 'warehouse_id', poolType: 'pool_type', lifecycleBucket: 'lifecycle_bucket', quantity: 'quantity'
},
receiver: {
receiverKey: 'receiver_key', demandRef: 'demand_source_ref', marketplace: 'marketplace',
destinationWarehouseId: 'destination_warehouse_id', fulfillmentModel: 'fulfillment_model',
survivalNeedQty: 'survival_need_qty', dailyDemand: 'daily_demand',
allocationPriority: 'allocation_priority', demandWeight: 'demand_weight', eligiblePoolTypes: 'eligible_pool_types'
},
factory: {
demandRef: 'demand_source_ref', marketplace: 'marketplace', destinationWarehouseId: 'destination_warehouse_id',
requiredByDate: 'required_by_date', allocationPriority: 'allocation_priority',
eligibleFactoryWarehouseIds: 'eligible_factory_warehouse_ids'
},
weeklyFact: {
recommendationType: 'recommendation_type', masterSku: 'sku', siteSku: 'site_sku',
windowCode: 'window_code', demandRef: 'demand_source_ref', company: 'company', country: 'country',
marketplace: 'marketplace', destinationWarehouseId: 'destination_warehouse_id',
calculatedGap: 'calculated_gap_qty', unitsPerCarton: 'units_per_carton',
formulaVersion: 'formula_version', sourceDataAsOf: 'source_data_as_of'
},
monthlyFact: {
recommendationType: 'recommendation_type', masterSku: 'sku', siteSku: 'site_sku',
requestMonth: 'request_month', requestBucket: 'request_bucket', demandRef: 'demand_source_ref',
company: 'company', country: 'country', marketplace: 'marketplace',
destinationWarehouseId: 'destination_warehouse_id', netOrderNeed: 'net_order_need_snapshot',
unitsPerCarton: 'units_per_carton', formulaVersion: 'formula_version', sourceDataAsOf: 'source_data_as_of'
}
};


function normalizeRows(values, where) {
if (values === undefined || values === null) return [];
aType(Array.isArray(values), where + ' must be an array (2D values or row objects)');
if (values.length === 0) return [];
if (Array.isArray(values[0])) {

var header = values[0].map(function (h) { return str(h); });
var out = [];
for (var r = 1; r < values.length; r++) {
var rowArr = values[r];
aType(Array.isArray(rowArr), where + '[' + r + '] must be an array row');
var o = {};
for (var c = 0; c < header.length; c++) { if (header[c] !== '') o[header[c]] = rowArr[c]; }
out.push(o);
}
return out;
}

return values.map(function (o, i) { aType(isObj(o), where + '[' + i + '] must be a row object'); var n = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k]; return n; });
}


function pick(row, col) { return row[col]; }
function normStr(v) { return nonEmpty(v) ? str(v) : null; }
function normQty(v) {
if (v === undefined || v === null || v === '') return { ok: false, missing: true };
var n = Number(v); if (typeof v === 'boolean' || !isFinite(n)) return { ok: false, invalid: true };
return { ok: true, qty: n };
}
function normList(v) {

var raw = [];
if (Array.isArray(v)) raw = v;
else if (typeof v === 'string') raw = v.split(',');
else if (v === undefined || v === null || v === '') return { ok: true, list: [] };
else return { ok: false };
var seen = {}, out = [];
for (var i = 0; i < raw.length; i++) { var t = str(raw[i]); if (t === '') continue; if (!seen[t]) { seen[t] = 1; out.push(t); } }
out.sort(cmpStr);
return { ok: true, list: out };
}


function readRunMeta(input, fn) {
aType(isObj(input), fn + ': input must be an object');
aType(isObj(input.scope), fn + ': input.scope required');
aType(nonEmpty(input.planningCycle), fn + ': planningCycle required');
return {
scope: input.scope,
planningCycle: str(input.planningCycle),
formulaVersion: input.formulaVersion === undefined ? null : input.formulaVersion,
sourceDataAsOf: input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf
};
}



function readIdentity(input, scope, fn) {
if (input.identityTables && SF && typeof SF.resolveSourceIdentity === 'function') {
var it = input.identityTables;
var res = SF.resolveSourceIdentity({
rawScope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: scope.sku },
marketplaceSkuRows: normalizeRows(it.marketplaceSkus, fn + ': identityTables.marketplaceSkus'),
skuDetailRows: normalizeRows(it.skuDetails, fn + ': identityTables.skuDetails'),
warehouseRows: normalizeRows(it.warehouses, fn + ': identityTables.warehouses'),
destinationWarehouseId: input.destinationWarehouseId
});
aRange(res.status === 'RESOLVED', fn + ': identity not resolved (' + res.status + ':' + res.reason + ')');
return res.identity;
}
return {
company: normStr(scope.company), country: normStr(scope.country), marketplace: normStr(scope.marketplace),
masterSku: normStr(scope.sku), fulfillmentModel: normStr(scope.fulfillmentModel)
};
}


function readDemandEntries(rows, cols, meta, issues) {
var entries = [];
for (var i = 0; i < rows.length; i++) {
var d = rows[i];
var dt = str(pick(d, cols.demandType));
if (DEMAND_TYPES[dt] !== 1) { issues.push({ domain: 'demand', i: i, reason: 'INVALID_DEMAND_TYPE:' + dt }); continue; }
var sourceRef = normStr(pick(d, cols.sourceRef));
if (!sourceRef) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_SOURCE_REF' }); continue; }
var masterSku = normStr(pick(d, cols.masterSku)) || normStr(meta.scope.sku);
if (!masterSku) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_MASTER_SKU' }); continue; }
var company = normStr(pick(d, cols.company)) || normStr(meta.scope.company);
if (!company) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_COMPANY' }); continue; }
var dest = normStr(pick(d, cols.destinationWarehouseId));
if (!dest) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_DESTINATION_WAREHOUSE_ID' }); continue; }
var pc = normStr(pick(d, cols.planningCycle)) || meta.planningCycle;
if (pc !== meta.planningCycle) { issues.push({ domain: 'demand', i: i, reason: 'PLANNING_CYCLE_MISMATCH:' + pc }); continue; }
var qr = normQty(pick(d, cols.quantity));
if (!qr.ok) { issues.push({ domain: 'demand', i: i, reason: (qr.missing ? 'MISSING_DEMAND_QUANTITY:' : 'INVALID_DEMAND_QUANTITY:') + sourceRef }); continue; }
var entry = {
demandType: dt, masterSku: masterSku, company: company,
country: normStr(pick(d, cols.country)) != null ? normStr(pick(d, cols.country)) : (normStr(meta.scope.country)),
marketplace: normStr(pick(d, cols.marketplace)) != null ? normStr(pick(d, cols.marketplace)) : (normStr(meta.scope.marketplace)),
destinationWarehouseId: dest, planningCycle: pc,
requiredByDate: str(pick(d, cols.requiredByDate)), sourceRef: sourceRef, quantity: qr.qty
};
if (dt === 'SPECIAL_EVENT') { var ev = normStr(pick(d, cols.eventId)); if (!ev) { issues.push({ domain: 'demand', i: i, reason: 'MISSING_EVENT_ID:' + sourceRef }); continue; } entry.eventId = ev; }
entries.push(entry);
}
return entries;
}


function readSupplyEntries(rows, cols, meta, issues) {
var entries = [];
for (var i = 0; i < rows.length; i++) {
var s = rows[i];
var pt = str(pick(s, cols.poolType));
if (POOL_TYPES[pt] !== 1) { issues.push({ domain: 'supply', i: i, reason: 'INVALID_POOL_TYPE:' + pt }); continue; }
var wh = normStr(pick(s, cols.warehouseId));
if (!wh) { issues.push({ domain: 'supply', i: i, reason: 'MISSING_WAREHOUSE_ID' }); continue; }
var masterSku = normStr(pick(s, cols.masterSku)) || normStr(meta.scope.sku);
if (!masterSku) { issues.push({ domain: 'supply', i: i, reason: 'MISSING_MASTER_SKU' }); continue; }
var company = normStr(pick(s, cols.company)) || normStr(meta.scope.company);
if (!company) { issues.push({ domain: 'supply', i: i, reason: 'MISSING_COMPANY' }); continue; }
var qr = normQty(pick(s, cols.quantity));
if (!qr.ok) { issues.push({ domain: 'supply', i: i, reason: (qr.missing ? 'MISSING_STOCK_QUANTITY:' : 'INVALID_STOCK_QUANTITY:') + wh }); continue; }
var lineage = normStr(pick(s, cols.supplyLineageRef)) || ('stock:' + pt + ':' + wh + ':' + masterSku);
var bucket = normStr(pick(s, cols.lifecycleBucket)) || 'CURRENT_STOCK';
entries.push({ supplyLineageRef: lineage, masterSku: masterSku, company: company, warehouseId: wh, poolType: pt, lifecycleBucket: bucket, quantity: qr.qty });
}
return entries;
}


function readReceiverFacts(rows, cols, issues) {
var out = [];
for (var i = 0; i < rows.length; i++) {
var r = rows[i];
var receiverKey = normStr(pick(r, cols.receiverKey));
if (!receiverKey) { issues.push({ domain: 'receiver', i: i, reason: 'MISSING_RECEIVER_KEY' }); continue; }
var demandRef = normStr(pick(r, cols.demandRef));
if (!demandRef) { issues.push({ domain: 'receiver', i: i, reason: 'MISSING_DEMAND_SOURCE_REF:' + receiverKey }); continue; }
var fm = normStr(pick(r, cols.fulfillmentModel));
if (fm !== null && FULFILLMENT_MODELS[fm] !== 1) { issues.push({ domain: 'receiver', i: i, reason: 'INVALID_FULFILLMENT_MODEL:' + fm }); continue; }
var el = normList(pick(r, cols.eligiblePoolTypes));
if (!el.ok) { issues.push({ domain: 'receiver', i: i, reason: 'INVALID_ELIGIBLE_POOL_TYPES' }); continue; }
var fact = { receiverKey: receiverKey, demandRef: demandRef, eligiblePoolTypes: el.list };
var mkt = normStr(pick(r, cols.marketplace)); if (mkt !== null) fact.marketplace = mkt;
var dest = normStr(pick(r, cols.destinationWarehouseId)); if (dest !== null) fact.destinationWarehouseId = dest;
if (fm !== null) fact.fulfillmentModel = fm;
var sv = normQty(pick(r, cols.survivalNeedQty)); if (sv.ok) fact.survivalNeedQty = sv.qty;
var dd = normQty(pick(r, cols.dailyDemand)); if (dd.ok) fact.dailyDemand = dd.qty;
var pr = normQty(pick(r, cols.allocationPriority)); if (pr.ok) fact.allocationPriority = pr.qty;
var wt = normQty(pick(r, cols.demandWeight)); if (wt.ok) fact.demandWeight = wt.qty;
out.push(fact);
}
return out;
}


function readFactoryFacts(rows, cols, issues) {
var out = [];
for (var i = 0; i < rows.length; i++) {
var r = rows[i];
var demandRef = normStr(pick(r, cols.demandRef));
if (!demandRef) { issues.push({ domain: 'factory', i: i, reason: 'MISSING_DEMAND_SOURCE_REF' }); continue; }
var few = normList(pick(r, cols.eligibleFactoryWarehouseIds));
if (!few.ok) { issues.push({ domain: 'factory', i: i, reason: 'INVALID_ELIGIBLE_FACTORY_WAREHOUSES' }); continue; }
var fact = { demandRef: demandRef, eligibleFactoryWarehouseIds: few.list };
var mkt = normStr(pick(r, cols.marketplace)); if (mkt !== null) fact.marketplace = mkt;
var dest = normStr(pick(r, cols.destinationWarehouseId)); if (dest !== null) fact.destinationWarehouseId = dest;
var rbd = normStr(pick(r, cols.requiredByDate)); if (rbd !== null) fact.requiredByDate = rbd;
var pr = normQty(pick(r, cols.allocationPriority)); if (pr.ok) fact.allocationPriority = pr.qty;
out.push(fact);
}
return out;
}


function readWeeklyFacts(rows, cols, meta, issues) {
var out = [], seen = {};
for (var i = 0; i < rows.length; i++) {
var f = rows[i];
var rt = normStr(pick(f, cols.recommendationType)) || 'WEEKLY_SHIPPING';
if (rt !== 'WEEKLY_SHIPPING') { issues.push({ domain: 'weeklyFact', i: i, reason: 'NOT_WEEKLY_RECOMMENDATION_TYPE:' + rt }); continue; }
var demandRef = normStr(pick(f, cols.demandRef));
if (!demandRef) { issues.push({ domain: 'weeklyFact', i: i, reason: 'MISSING_DEMAND_SOURCE_REF' }); continue; }
var fv = pick(f, cols.formulaVersion); if (fv !== undefined && fv !== null && str(fv) !== '' && meta.formulaVersion != null && str(fv) !== str(meta.formulaVersion)) { issues.push({ domain: 'weeklyFact', i: i, reason: 'FORMULA_VERSION_MISMATCH:' + str(fv) }); continue; }
var fact = { recommendationType: 'WEEKLY_SHIPPING', demandRef: demandRef };
var sku = normStr(pick(f, cols.masterSku)) || normStr(meta.scope.sku); if (sku !== null) fact.sku = sku;
var site = normStr(pick(f, cols.siteSku)); if (site !== null) fact.siteSku = site;
var win = normStr(pick(f, cols.windowCode)); if (win !== null) fact.windowCode = win;
var comp = normStr(pick(f, cols.company)) || normStr(meta.scope.company); if (comp !== null) fact.company = comp;
var ctry = normStr(pick(f, cols.country)) || normStr(meta.scope.country); if (ctry !== null) fact.country = ctry;
var mkt = normStr(pick(f, cols.marketplace)) || normStr(meta.scope.marketplace); if (mkt !== null) fact.marketplace = mkt;
var dest = normStr(pick(f, cols.destinationWarehouseId)); if (dest !== null) fact.destinationWarehouseId = dest;
var gap = normQty(pick(f, cols.calculatedGap)); if (gap.ok) fact.calculatedGap = gap.qty;
var upc = normQty(pick(f, cols.unitsPerCarton)); if (upc.ok) fact.unitsPerCarton = upc.qty;

var nk = str(fact.sku) + KEY_SEP + str(fact.siteSku) + KEY_SEP + str(fact.windowCode);
if (nonEmpty(fact.sku) && nonEmpty(fact.windowCode)) { aRange(seen[nk] !== 1, 'readWeeklyRecommendationSource: duplicate Weekly line identity: ' + str(fact.sku) + '|' + str(fact.siteSku) + '|' + str(fact.windowCode)); seen[nk] = 1; }
out.push(fact);
}
return out;
}


function readMonthlyFacts(rows, cols, meta, issues) {
var out = [], seen = {};
for (var i = 0; i < rows.length; i++) {
var f = rows[i];
var rt = normStr(pick(f, cols.recommendationType)) || 'MONTHLY_ORDER';
if (rt !== 'MONTHLY_ORDER') { issues.push({ domain: 'monthlyFact', i: i, reason: 'NOT_MONTHLY_RECOMMENDATION_TYPE:' + rt }); continue; }
var demandRef = normStr(pick(f, cols.demandRef));
if (!demandRef) { issues.push({ domain: 'monthlyFact', i: i, reason: 'MISSING_DEMAND_SOURCE_REF' }); continue; }
var fv = pick(f, cols.formulaVersion); if (fv !== undefined && fv !== null && str(fv) !== '' && meta.formulaVersion != null && str(fv) !== str(meta.formulaVersion)) { issues.push({ domain: 'monthlyFact', i: i, reason: 'FORMULA_VERSION_MISMATCH:' + str(fv) }); continue; }
var fact = { recommendationType: 'MONTHLY_ORDER', demandRef: demandRef };
var sku = normStr(pick(f, cols.masterSku)) || normStr(meta.scope.sku); if (sku !== null) fact.masterSku = sku;
var site = normStr(pick(f, cols.siteSku)); if (site !== null) fact.siteSku = site;
var rm = normStr(pick(f, cols.requestMonth)); if (rm !== null) fact.requestMonth = rm;
var rb = normStr(pick(f, cols.requestBucket)); if (rb !== null) fact.requestBucket = rb;
var comp = normStr(pick(f, cols.company)) || normStr(meta.scope.company); if (comp !== null) fact.company = comp;
var ctry = normStr(pick(f, cols.country)) || normStr(meta.scope.country); if (ctry !== null) fact.country = ctry;
var mkt = normStr(pick(f, cols.marketplace)) || normStr(meta.scope.marketplace); if (mkt !== null) fact.marketplace = mkt;
var dest = normStr(pick(f, cols.destinationWarehouseId)); if (dest !== null) fact.destinationWarehouseId = dest;
var need = normQty(pick(f, cols.netOrderNeed)); if (need.ok) fact.netOrderNeed = need.qty;
var upc = normQty(pick(f, cols.unitsPerCarton)); if (upc.ok) fact.unitsPerCarton = upc.qty;
var nk = str(fact.masterSku) + KEY_SEP + str(fact.requestMonth) + KEY_SEP + str(fact.requestBucket);
if (nonEmpty(fact.masterSku) && nonEmpty(fact.requestMonth) && nonEmpty(fact.requestBucket)) { aRange(seen[nk] !== 1, 'readMonthlyRecommendationSource: duplicate Monthly line identity: ' + str(fact.masterSku) + '|' + str(fact.requestMonth) + '|' + str(fact.requestBucket)); seen[nk] = 1; }
out.push(fact);
}
return out;
}


function makeReader(config) {
var COLS = mergeColumns(config && config.columns);

function readWeekly(input) {
var meta = readRunMeta(input, 'readWeeklyRecommendationSource');
var sheets = isObj(input.sheets) ? input.sheets : {};
var issues = [];
var identity = readIdentity(input, meta.scope, 'readWeeklyRecommendationSource');
var demandEntries = readDemandEntries(normalizeRows(sheets.demand, 'sheets.demand'), COLS.demand, meta, issues);
var supplyEntries = readSupplyEntries(normalizeRows(sheets.supply, 'sheets.supply'), COLS.supply, meta, issues);
var receiverFacts = readReceiverFacts(normalizeRows(sheets.receivers, 'sheets.receivers'), COLS.receiver, issues);
var weeklyFacts = readWeeklyFacts(normalizeRows(sheets.planningFacts, 'sheets.planningFacts'), COLS.weeklyFact, meta, issues);
issues.sort(sortIssue);
return {
recommendationType: 'WEEKLY_SHIPPING', planningCycle: meta.planningCycle, businessScope: meta.scope,
identity: identity, formulaVersion: meta.formulaVersion, sourceDataAsOf: meta.sourceDataAsOf,
demandLedgerInput: { entries: demandEntries }, supplyLedgerInput: { entries: supplyEntries },
receiverFacts: receiverFacts, weeklyPlanningFacts: weeklyFacts, issues: issues
};
}

function readMonthly(input) {
var meta = readRunMeta(input, 'readMonthlyRecommendationSource');
var sheets = isObj(input.sheets) ? input.sheets : {};
var issues = [];
var identity = readIdentity(input, meta.scope, 'readMonthlyRecommendationSource');
var demandEntries = readDemandEntries(normalizeRows(sheets.demand, 'sheets.demand'), COLS.demand, meta, issues);
var supplyEntries = readSupplyEntries(normalizeRows(sheets.supply, 'sheets.supply'), COLS.supply, meta, issues);
var factoryFacts = readFactoryFacts(normalizeRows(sheets.factoryDemands, 'sheets.factoryDemands'), COLS.factory, issues);
var monthlyFacts = readMonthlyFacts(normalizeRows(sheets.planningFacts, 'sheets.planningFacts'), COLS.monthlyFact, meta, issues);
issues.sort(sortIssue);
return {
recommendationType: 'MONTHLY_ORDER', planningCycle: meta.planningCycle, businessScope: meta.scope,
identity: identity, formulaVersion: meta.formulaVersion, sourceDataAsOf: meta.sourceDataAsOf,
demandLedgerInput: { entries: demandEntries }, supplyLedgerInput: { entries: supplyEntries },
factoryDemandFacts: factoryFacts, monthlyPlanningFacts: monthlyFacts, issues: issues
};
}

return { readWeeklyRecommendationSource: readWeekly, readMonthlyRecommendationSource: readMonthly };
}

function sortIssue(a, b) { return cmpStr(a.domain, b.domain) || (a.i - b.i) || cmpStr(a.reason, b.reason); }

function mergeColumns(over) {
var out = {};
for (var group in DEFAULT_COLUMNS) {
out[group] = {};
for (var k in DEFAULT_COLUMNS[group]) out[group][k] = DEFAULT_COLUMNS[group][k];
if (over && over[group]) for (var o in over[group]) out[group][o] = str(over[group][o]);
}
return out;
}





function buildRefIndex(demandLedger, fn) {
aType(isObj(demandLedger) && Array.isArray(demandLedger.entries), fn + ': demandLedger.entries required');
var byRef = {}, dup = {};
demandLedger.entries.forEach(function (e) {
var key = str(e.demandKey); var parts = key.split(KEY_SEP); var ref = parts[parts.length - 1];
if (byRef[ref] !== undefined && byRef[ref] !== key) dup[ref] = 1;
byRef[ref] = key;
});
return { byRef: byRef, dup: dup };
}
function linkFactList(list, idx, fn) {
return list.map(function (f) {
var ref = str(f.demandRef);
var copy = {}; for (var k in f) if (k !== 'demandRef') copy[k] = f[k];
if (ref !== '' && idx.byRef[ref] !== undefined) {
aRange(idx.dup[ref] !== 1, fn + ': ambiguous demandRef (multiple demandKeys share trailing segment): ' + ref);
copy.demandKey = idx.byRef[ref];
}

return copy;
});
}
function resolveDemandKeys(dto, demandLedger) {
aType(isObj(dto), 'resolveDemandKeys: dto must be an object');
var fn = 'resolveDemandKeys';
var idx = buildRefIndex(demandLedger, fn);
var out = {};
for (var k in dto) out[k] = dto[k];
if (Array.isArray(dto.receiverFacts)) out.receiverFacts = linkFactList(dto.receiverFacts, idx, fn);
if (Array.isArray(dto.factoryDemandFacts)) out.factoryDemandFacts = linkFactList(dto.factoryDemandFacts, idx, fn);
if (Array.isArray(dto.weeklyPlanningFacts)) out.weeklyPlanningFacts = linkFactList(dto.weeklyPlanningFacts, idx, fn);
if (Array.isArray(dto.monthlyPlanningFacts)) out.monthlyPlanningFacts = linkFactList(dto.monthlyPlanningFacts, idx, fn);
return out;
}

var DEFAULT = makeReader(null);

return {
DEMAND_TYPES: (function () { var o = {}; for (var k in DEMAND_TYPES) o[k] = 1; return o; })(),
POOL_TYPES: (function () { var o = {}; for (var k in POOL_TYPES) o[k] = 1; return o; })(),
DEFAULT_COLUMNS: mergeColumns(null),
createRecommendationSourceReader: function (config) { return makeReader(config); },
readWeeklyRecommendationSource: DEFAULT.readWeeklyRecommendationSource,
readMonthlyRecommendationSource: DEFAULT.readMonthlyRecommendationSource,
resolveDemandKeys: resolveDemandKeys
};
});
__kmRegister("supply-planning-source-reader", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;


























(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-source-reader.js') : (root.KMSR || (root.KM && root.KM.sourceReader)),
req ? req('./supply-planning-ledgers.js') : (root.KMLEDGER || (root.KM && root.KM.ledgers)),
req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts)),
req ? req('./supply-planning-plan-bridge.js') : (root.KMBRIDGE || (root.KM && root.KM.planBridge))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.recommendationSourceIntegration = api; }
})(this, function (KMSR_D, KMLEDGER_D, KMSF_D, KMBRIDGE_D) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function aRange(c, m) { if (!c) throw new RangeError(m); }
function str(v) { return String(v === undefined || v === null ? '' : v); }


var ROUTES = {
WEEKLY_SHIPPING: { readFn: 'readWeeklyRecommendationSource', allocKey: 'receiverFacts', factsKey: 'weeklyPlanningFacts', resolveFn: 'resolveWeeklyRecommendationFacts' },
MONTHLY_ORDER: { readFn: 'readMonthlyRecommendationSource', allocKey: 'factoryDemandFacts', factsKey: 'monthlyPlanningFacts', resolveFn: 'resolveMonthlyRecommendationFacts' }
};

function selectReaderName(recommendationType) {
var r = ROUTES[recommendationType];
aRange(!!r, 'recommendation source integration: unsupported recommendationType: ' + recommendationType);
return r.readFn;
}

function makeIntegration(overrides) {
var KMSR = (overrides && overrides.KMSR) || KMSR_D;
var KMLEDGER = (overrides && overrides.KMLEDGER) || KMLEDGER_D;
var KMSF = (overrides && overrides.KMSF) || KMSF_D;
var KMBRIDGE = (overrides && overrides.KMBRIDGE) || KMBRIDGE_D;



function resolveRecommendationFactsFromSource(sourceInput, opts) {
aType(isObj(sourceInput), 'resolveRecommendationFactsFromSource: sourceInput must be an object');
opts = opts || {};
var type = opts.recommendationType != null ? str(opts.recommendationType) : str(sourceInput.recommendationType);
var route = ROUTES[type];
aRange(!!route, 'resolveRecommendationFactsFromSource: unsupported recommendationType: ' + type);


var dto = KMSR[route.readFn](sourceInput);


var demandLedger = KMLEDGER.buildDemandLedger(dto.demandLedgerInput);
var supplyLedger = KMLEDGER.buildSupplyLedger(dto.supplyLedgerInput);


var linked = KMSR.resolveDemandKeys(dto, demandLedger);


var apInput = { identity: dto.identity, demandLedger: demandLedger, supplyLedger: supplyLedger };
apInput[route.allocKey] = linked[route.allocKey];
var allocationInput = KMSF.projectAllocationInputs(apInput);


var resolverInput = {
planningCycle: dto.planningCycle, businessScope: dto.businessScope,
allocationProjection: allocationInput, formulaVersion: dto.formulaVersion,
sourceDataAsOf: dto.sourceDataAsOf, demandLedger: demandLedger
};
resolverInput[route.factsKey] = linked[route.factsKey];
var resolverResult = KMSF[route.resolveFn](resolverInput);


var bridgeResult = KMBRIDGE.bridgeRecommendationFactsToPlan({
recommendationFacts: resolverResult,
mode: opts.mode != null ? opts.mode : 'SCHEDULED_REFRESH',
calculationRunId: opts.calculationRunId != null ? opts.calculationRunId : 'PENDING',
draftVersion: opts.draftVersion != null ? opts.draftVersion : 1
});


var sourceIssues = [];
(dto.issues || []).forEach(function (x) { sourceIssues.push({ stage: 'reader', domain: x.domain, i: x.i, reason: x.reason }); });
(allocationInput.issues || []).forEach(function (x) { sourceIssues.push({ stage: 'allocation', kind: x.kind, key: x.key, reason: x.reason }); });
(allocationInput.blockedInputs || []).forEach(function (x) { sourceIssues.push({ stage: 'allocationBlocked', kind: x.kind, key: x.key, reason: x.reason }); });
(resolverResult.issues || []).forEach(function (x) { sourceIssues.push({ stage: 'resolver', key: x.key, reason: x.reason }); });
((bridgeResult.metadata && bridgeResult.metadata.unmappableBlockedLines) || []).forEach(function (x) { sourceIssues.push({ stage: 'bridge', reason: x.blockedReason }); });

var lines = bridgeResult.lines;


var ready = resolverResult.ready === true && lines.length > 0;
var reason = resolverResult.ready !== true
? (resolverResult.reason || 'SOURCE_ISSUES_PRESENT')
: (lines.length > 0 ? null : 'NO_RECOMMENDATION_LINES');

return {
recommendationType: type,
planningCycle: dto.planningCycle,
businessScope: dto.businessScope,
formulaVersion: bridgeResult.formulaVersion,
sourceDataAsOf: bridgeResult.sourceDataAsOf,
sourceIssues: sourceIssues,
ledgerResult: { demandLedger: demandLedger, supplyLedger: supplyLedger },
allocationInput: allocationInput,
resolverResult: resolverResult,
bridgeResult: bridgeResult,
lines: lines,
ready: ready,
reason: reason
};
}




function createComputeFacts(sourceInput, opts) {
opts = opts || {};
return function computeFacts(query) {
var type = (query && query.recommendationType != null) ? query.recommendationType : opts.recommendationType;
var full = resolveRecommendationFactsFromSource(sourceInput, {
recommendationType: type, mode: opts.mode, calculationRunId: opts.calculationRunId, draftVersion: opts.draftVersion
});
return {
lines: full.lines, ready: full.ready, reason: full.reason,
formulaVersion: full.formulaVersion, sourceDataAsOf: full.sourceDataAsOf,
sourceIssues: full.sourceIssues
};
};
}

return {
selectReaderName: selectReaderName,
resolveRecommendationFactsFromSource: resolveRecommendationFactsFromSource,
createComputeFacts: createComputeFacts
};
}

var DEFAULT = makeIntegration(null);

return {
ROUTES: (function () { var o = {}; for (var t in ROUTES) { o[t] = {}; for (var k in ROUTES[t]) o[t][k] = ROUTES[t][k]; } return o; })(),
selectReaderName: selectReaderName,
createRecommendationSourceIntegration: makeIntegration,
resolveRecommendationFactsFromSource: DEFAULT.resolveRecommendationFactsFromSource,
createComputeFacts: DEFAULT.createComputeFacts
};
});
__kmRegister("supply-planning-recommendation-source-integration", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;






















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-source-reader.js') : (root.KMSR || (root.KM && root.KM.sourceReader)),
req ? req('./supply-planning-recommendation-source-integration.js') : (root.KMSI || (root.KM && root.KM.recommendationSourceIntegration))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.sourceReaderProduction = api; }
})(this, function (KMSR, KMSI) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function aRange(c, m) { if (!c) throw new RangeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nonEmpty(v) { return str(v).length > 0; }





var REGISTRY = [

{ sourceType: 'skuDetails', role: 'identity', sheetName: 'sku_details', requiredHeaders: ['sku'], optionalHeaders: ['category', 'series', 'units_per_carton'], identityHeaders: ['sku'], asOfHeader: 'updated_at', applicability: 'BOTH', required: false },
{ sourceType: 'marketplaceSkus', role: 'identity', sheetName: 'marketplace_skus', requiredHeaders: ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace'], optionalHeaders: ['site_sku', 'fulfillment_model'], identityHeaders: ['marketplace_sku_id'], asOfHeader: 'updated_at', applicability: 'BOTH', required: false },
{ sourceType: 'warehouses', role: 'identity', sheetName: 'warehouses', requiredHeaders: ['warehouse_id'], optionalHeaders: ['warehouse_type', 'is_factory_warehouse', 'is_active', 'company', 'country'], identityHeaders: ['warehouse_id'], asOfHeader: 'updated_at', applicability: 'BOTH', required: false },

{ sourceType: 'demand', role: 'demand', sheetName: 'recommendation_source_demand', requiredHeaders: ['demand_type', 'source_ref', 'quantity'], optionalHeaders: ['required_by_date', 'sku', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'planning_cycle', 'event_id'], identityHeaders: ['source_ref'], asOfHeader: 'source_data_as_of', applicability: 'BOTH', required: true },
{ sourceType: 'supply', role: 'supply', sheetName: 'recommendation_source_supply', requiredHeaders: ['pool_type', 'warehouse_id', 'quantity'], optionalHeaders: ['supply_lineage_ref', 'sku', 'company', 'lifecycle_bucket'], identityHeaders: ['supply_lineage_ref'], asOfHeader: 'source_data_as_of', applicability: 'BOTH', required: true },
{ sourceType: 'receivers', role: 'receivers', sheetName: 'recommendation_source_receivers', requiredHeaders: ['receiver_key', 'demand_source_ref'], optionalHeaders: ['eligible_pool_types', 'survival_need_qty', 'daily_demand', 'allocation_priority', 'demand_weight', 'fulfillment_model', 'marketplace', 'destination_warehouse_id'], identityHeaders: ['receiver_key'], asOfHeader: 'source_data_as_of', applicability: 'WEEKLY', required: false },
{ sourceType: 'factoryDemands', role: 'factoryDemands', sheetName: 'recommendation_source_factory_demands', requiredHeaders: ['demand_source_ref'], optionalHeaders: ['eligible_factory_warehouse_ids', 'allocation_priority', 'marketplace', 'destination_warehouse_id', 'required_by_date'], identityHeaders: ['demand_source_ref'], asOfHeader: 'source_data_as_of', applicability: 'MONTHLY', required: false },
{ sourceType: 'planningFacts', role: 'planningFacts', sheetName: 'recommendation_source_planning_facts', requiredHeaders: ['recommendation_type', 'demand_source_ref'], optionalHeaders: ['sku', 'site_sku', 'window_code', 'request_month', 'request_bucket', 'calculated_gap_qty', 'net_order_need_snapshot', 'units_per_carton', 'company', 'country', 'marketplace', 'formula_version', 'source_data_as_of'], identityHeaders: ['demand_source_ref'], asOfHeader: 'source_data_as_of', applicability: 'BOTH', required: true }
];

function registryFor(recommendationType, config) {
var over = (config && config.sheetNames) || {};
var applies = recommendationType === 'WEEKLY_SHIPPING' ? 'WEEKLY' : (recommendationType === 'MONTHLY_ORDER' ? 'MONTHLY' : null);
aRange(applies !== null, 'source-reader-production: unsupported recommendationType: ' + recommendationType);
return REGISTRY.filter(function (e) { return e.applicability === 'BOTH' || e.applicability === applies; })
.map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; if (over[e.sourceType]) c.sheetName = str(over[e.sourceType]); return c; });
}




function readRawTableSnapshot(spreadsheet, entry) {
aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'readRawTableSnapshot: spreadsheet.getSheetByName required');
aType(isObj(entry) && nonEmpty(entry.sheetName), 'readRawTableSnapshot: entry.sheetName required');
var out = { sourceType: entry.sourceType, sheetName: entry.sheetName, headers: [], rows: [], rowCount: 0, sourceDataAsOfEvidence: null, found: false, issues: [] };
var sheet = spreadsheet.getSheetByName(entry.sheetName);
if (!sheet) { out.issues.push('SOURCE_NOT_AVAILABLE'); return out; }
out.found = true;
var lastRow = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : null;
if (lastRow === 0) { out.issues.push('MISSING_SNAPSHOT'); return out; }
var values = sheet.getDataRange().getValues();
if (!values || !values.length) { out.issues.push('MISSING_SNAPSHOT'); return out; }
out.headers = values[0].map(function (h) { return str(h); });
for (var r = 1; r < values.length; r++) out.rows.push(values[r].slice());
out.rowCount = out.rows.length;

if (entry.asOfHeader) {
var ai = out.headers.indexOf(entry.asOfHeader);
if (ai >= 0) { for (var i = 0; i < out.rows.length; i++) { if (nonEmpty(out.rows[i][ai])) { out.sourceDataAsOfEvidence = str(out.rows[i][ai]); break; } } }
}
return out;
}


function readAllSnapshots(spreadsheet, recommendationType, config) {
var entries = registryFor(recommendationType, config);
var snapshots = {};
entries.forEach(function (e) { snapshots[e.sourceType] = readRawTableSnapshot(spreadsheet, e); });
return snapshots;
}


function validateSnapshot(snapshot, entry) {
var issues = [];
if (!snapshot || snapshot.found === false) { issues.push({ sourceType: entry.sourceType, reason: 'SOURCE_NOT_AVAILABLE' }); return issues; }
var headers = snapshot.headers || [];
if (!headers.length) { issues.push({ sourceType: entry.sourceType, reason: 'MISSING_REQUIRED_HEADER' }); return issues; }
var seen = {};
headers.forEach(function (h) { if (h === '') issues.push({ sourceType: entry.sourceType, reason: 'MISSING_REQUIRED_HEADER:blank' }); else if (seen[h]) issues.push({ sourceType: entry.sourceType, reason: 'DUPLICATE_HEADER:' + h }); else seen[h] = 1; });
(entry.requiredHeaders || []).forEach(function (h) { if (!seen[h]) issues.push({ sourceType: entry.sourceType, reason: 'MISSING_REQUIRED_HEADER:' + h }); });
(snapshot.rows || []).forEach(function (row, i) { if (row.length !== headers.length) issues.push({ sourceType: entry.sourceType, reason: 'INVALID_ROW_WIDTH:@' + i }); });
return issues;
}





function buildRecommendationSourceFacts(input) {
aType(isObj(input), 'buildRecommendationSourceFacts: input must be an object');
aType(nonEmpty(input.planningCycle), 'buildRecommendationSourceFacts: planningCycle required');
aType(isObj(input.businessScope), 'buildRecommendationSourceFacts: businessScope required');
var type = str(input.recommendationType);
var entries = registryFor(type, input.config);
var snapshots = isObj(input.snapshots) ? input.snapshots : {};

var schemaIssues = [];
entries.forEach(function (e) {
var snap = snapshots[e.sourceType];
if (e.required && (!snap || snap.found === false)) { schemaIssues.push({ sourceType: e.sourceType, reason: 'SOURCE_NOT_AVAILABLE' }); return; }
if (snap && snap.found !== false) validateSnapshot(snap, e).forEach(function (x) { schemaIssues.push(x); });
});


function sheet2D(sourceType) { var s = snapshots[sourceType]; return (s && s.found !== false && s.headers.length) ? [s.headers.slice()].concat(s.rows.map(function (r) { return r.slice(); })) : []; }


var asOf = input.sourceDataAsOf !== undefined ? input.sourceDataAsOf
: ((snapshots.demand && snapshots.demand.sourceDataAsOfEvidence) || (snapshots.planningFacts && snapshots.planningFacts.sourceDataAsOfEvidence) || null);

var sourceInput = {
recommendationType: type, planningCycle: str(input.planningCycle), scope: input.businessScope,
formulaVersion: input.formulaVersion === undefined ? null : input.formulaVersion, sourceDataAsOf: asOf,
identityTables: { skuDetails: sheet2D('skuDetails'), marketplaceSkus: sheet2D('marketplaceSkus'), warehouses: sheet2D('warehouses') },
sheets: {
demand: sheet2D('demand'), supply: sheet2D('supply'), planningFacts: sheet2D('planningFacts')
}
};
if (type === 'WEEKLY_SHIPPING') sourceInput.sheets.receivers = sheet2D('receivers');
if (type === 'MONTHLY_ORDER') sourceInput.sheets.factoryDemands = sheet2D('factoryDemands');

if (!sourceInput.identityTables.skuDetails.length && !sourceInput.identityTables.marketplaceSkus.length && !sourceInput.identityTables.warehouses.length) delete sourceInput.identityTables;


var hardSchema = schemaIssues.filter(function (x) {
var e = entries.filter(function (z) { return z.sourceType === x.sourceType; })[0];
return e && e.required;
});
if (hardSchema.length) {
return { recommendationType: type, planningCycle: str(input.planningCycle), businessScope: input.businessScope,
formulaVersion: sourceInput.formulaVersion, sourceDataAsOf: asOf, ready: false, reason: hardSchema[0].reason,
schemaIssues: schemaIssues, sourceIssues: [], lines: [], bridgeResult: null, resolverResult: null,
ledgerResult: null, allocationInput: null };
}


var full = KMSI.resolveRecommendationFactsFromSource(sourceInput, { mode: 'SCHEDULED_REFRESH', recommendationType: type });
var out = {};
for (var k in full) out[k] = full[k];
out.schemaIssues = schemaIssues;
return out;
}


function readRecommendationSourceFacts(spreadsheet, cmd, config) {
aType(isObj(cmd), 'readRecommendationSourceFacts: cmd required');
var snapshots = readAllSnapshots(spreadsheet, str(cmd.recommendationType), config);
return buildRecommendationSourceFacts({
recommendationType: cmd.recommendationType, planningCycle: cmd.planningCycle, businessScope: cmd.businessScope,
snapshots: snapshots, formulaVersion: cmd.formulaVersion, sourceDataAsOf: cmd.sourceDataAsOf, config: config
});
}

return {
SOURCE_TABLE_REGISTRY: REGISTRY.map(function (e) { var c = {}; for (var k in e) c[k] = Array.isArray(e[k]) ? e[k].slice() : e[k]; return c; }),
registryFor: registryFor,
readRawTableSnapshot: readRawTableSnapshot,
readAllSnapshots: readAllSnapshots,
validateSnapshot: validateSnapshot,
buildRecommendationSourceFacts: buildRecommendationSourceFacts,
readRecommendationSourceFacts: readRecommendationSourceFacts
};
});
__kmRegister("supply-planning-source-reader-production", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;




























(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-source-reader-production.js') : (root.KMSRP || (root.KM && root.KM.sourceReaderProduction)),
req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts)),
req ? req('./supply-planning-shipment-line-source.js') : (root.KMSLS || (root.KM && root.KM.shipmentLineSource)),
req ? req('./supply-planning-country-identity.js') : (root.KMCID || (root.KM && root.KM.countryIdentity))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.sourceProjection = api; }
})(this, function (KMSRP, KMSF, KMSLS, CID) {
'use strict';


function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nonEmpty(v) { return str(v).length > 0; }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }































var MKT_SEP = String.fromCharCode(124);
var MKT_ESC = String.fromCharCode(92);
function canonCountry(v) {
return (CID && typeof CID.canonicalCountryCode === 'function') ? CID.canonicalCountryCode(v) : str(v).toUpperCase();
}
function mktIdentityKey(company, country, marketplace) {
return [str(company), canonCountry(country), str(marketplace)].map(function (v) {
return str(v).split(MKT_ESC).join(MKT_ESC + MKT_ESC).split(MKT_SEP).join(MKT_ESC + MKT_SEP);
}).join(MKT_SEP);
}

var ORIGIN = 'PROJECTION_RUNTIME';
var FACTORY_SHARED = 'FACTORY_SHARED';
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];








function isStrictDate(v) {
var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v)); if (!m) return false;
var y = +m[1], mo = +m[2], d = +m[3]; if (mo < 1 || mo > 12 || d < 1) return false;
var dim = [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
return d <= dim[mo - 1];
}


function normalizeCanonical(snapshot, where) {
if (snapshot === undefined || snapshot === null) return [];
if (isObj(snapshot) && Array.isArray(snapshot.rows) && Array.isArray(snapshot.headers)) {

var hs = snapshot.headers.map(function (h) { return str(h); });
return snapshot.rows.map(function (r, i) {
aType(Array.isArray(r), where + '.rows[' + i + '] must be an array');
var o = {}; for (var c = 0; c < hs.length; c++) if (hs[c] !== '') o[hs[c]] = r[c]; return o;
});
}
aType(Array.isArray(snapshot), where + ' must be an array (2D values or row objects) or a {headers,rows} snapshot');
if (snapshot.length === 0) return [];
if (Array.isArray(snapshot[0])) {
var header = snapshot[0].map(function (h) { return str(h); });
var out = [];
for (var rr = 1; rr < snapshot.length; rr++) {
aType(Array.isArray(snapshot[rr]), where + '[' + rr + '] must be an array row');
var ro = {}; for (var cc = 0; cc < header.length; cc++) if (header[cc] !== '') ro[header[cc]] = snapshot[rr][cc];
out.push(ro);
}
return out;
}
return snapshot.map(function (o, i) { aType(isObj(o), where + '[' + i + '] must be a row object'); var n = {}; for (var k in o) if (has(o, k)) n[k] = o[k]; return n; });
}



function toSnapshot(sourceType, rowObjs, headers, asOfEvidence) {
var rows = rowObjs.map(function (o) { return headers.map(function (h) { return has(o, h) ? o[h] : ''; }); });
return { sourceType: sourceType, sheetName: sourceType, headers: headers.slice(), rows: rows, rowCount: rows.length,
sourceDataAsOfEvidence: asOfEvidence === undefined ? null : asOfEvidence, found: true, origin: ORIGIN, issues: [] };
}


function indexBy(rows, key) { var m = {}; rows.forEach(function (r) { var k = str(r[key]); if (k) m[k] = r; }); return m; }


function maxAsOf(list) { var best = null; list.forEach(function (v) { if (nonEmpty(v) && (best === null || cmpStr(str(v), best) > 0)) best = str(v); }); return best; }












function projectRecommendationProductionSources(input) {
aType(isObj(input), 'projectRecommendationProductionSources: input must be an object');
aType(isObj(input.businessScope), 'projectRecommendationProductionSources: businessScope required');
aType(nonEmpty(input.planningCycle), 'projectRecommendationProductionSources: planningCycle required');
var type = str(input.recommendationType);
aType(type === 'WEEKLY_SHIPPING' || type === 'MONTHLY_ORDER', 'projectRecommendationProductionSources: recommendationType must be WEEKLY_SHIPPING | MONTHLY_ORDER');
var snaps = isObj(input.sourceSnapshots) ? input.sourceSnapshots : {};
var scope = input.businessScope;
var issues = [];
function addIssue(domain, ref, reason) { issues.push({ domain: domain, ref: ref === undefined ? null : ref, reason: reason }); }


var skuRows = normalizeCanonical(snaps.skuDetails, 'sourceSnapshots.skuDetails');
var mskRows = normalizeCanonical(snaps.marketplaceSkus, 'sourceSnapshots.marketplaceSkus');
var whRows = normalizeCanonical(snaps.warehouses, 'sourceSnapshots.warehouses');
var mktRows = normalizeCanonical(snaps.marketplaces, 'sourceSnapshots.marketplaces');
var fcReg = normalizeCanonical(snaps.fcRegularForecast, 'sourceSnapshots.fcRegularForecast');
var fcEvt = normalizeCanonical(snaps.fcSpecialEvents, 'sourceSnapshots.fcSpecialEvents');
var fba = normalizeCanonical(snaps.amazonInventorySnapshot, 'sourceSnapshots.amazonInventorySnapshot');
var ovs = normalizeCanonical(snaps.overseasInventorySnapshot, 'sourceSnapshots.overseasInventorySnapshot');
var fac = normalizeCanonical(snaps.factoryStock, 'sourceSnapshots.factoryStock');
var plans = normalizeCanonical(snaps.shippingPlans, 'sourceSnapshots.shippingPlans');
var ships = normalizeCanonical(snaps.shipments, 'sourceSnapshots.shipments');

var shipLines = normalizeCanonical(snaps.shipmentLines, 'sourceSnapshots.shipmentLines');
var planLines = normalizeCanonical(snaps.shippingPlanLines, 'sourceSnapshots.shippingPlanLines');

var whById = indexBy(whRows, 'warehouse_id');
var upcBySku = {}; skuRows.forEach(function (r) { if (nonEmpty(r.sku) && has(r, 'units_per_carton')) upcBySku[str(r.sku)] = r.units_per_carton; });



















var priorityByMktKey = {}, priorityKeyConflict = {};
mktRows.forEach(function (r) {
if (!nonEmpty(r.marketplace)) return;
if (!has(r, 'allocation_priority')) return;
var k = mktIdentityKey(r.company, r.country, r.marketplace);
if (has(priorityByMktKey, k) && str(priorityByMktKey[k]) !== str(r.allocation_priority)) {
if (!priorityKeyConflict[k]) {
priorityKeyConflict[k] = 1;
addIssue('MARKETPLACE', k, 'CANONICAL_MARKETPLACE_IDENTITY_CONFLICT');
}
return;
}



if (!has(priorityByMktKey, k)) priorityByMktKey[k] = r.allocation_priority;
});


function priorityForMktKey(k) { return priorityKeyConflict[k] ? undefined : priorityByMktKey[k]; }










function emitPriority(v, ref) {
if (v === undefined || v === null) return undefined;
if (typeof v !== 'number' && typeof v !== 'string') {
addIssue('RECEIVER', ref, 'INVALID_ALLOCATION_PRIORITY: non-scalar'); return undefined;
}
if (typeof v === 'string' && v.trim() === '') return undefined;
var n = (typeof v === 'number') ? v : Number(v.trim());
if (!isFinite(n) || n < 0) {
addIssue('RECEIVER', ref, 'INVALID_ALLOCATION_PRIORITY: ' + JSON.stringify(v)); return undefined;
}
return v;
}
var ffByMskKey = {}; mskRows.forEach(function (r) { var k = [str(r.company), str(r.country), str(r.marketplace), str(r.sku)].join('|'); if (has(r, 'fulfillment_model')) ffByMskKey[k] = r.fulfillment_model; });


var routing = isObj(input.routing) ? input.routing : {};
function resolveDestination(demandRef, factHint) {
if (nonEmpty(factHint)) return str(factHint);
if (nonEmpty(routing[demandRef])) return str(routing[demandRef]);
if (nonEmpty(scope.destinationWarehouseId)) return str(scope.destinationWarehouseId);
return null;
}


var demandRows = [];
var seenDemandRef = {};
var requiredByDate = input.requiredByDate;
var forecastMonth = nonEmpty(input.forecastMonth) ? str(input.forecastMonth).toLowerCase() : null;

if (fcReg.length) {
if (!forecastMonth || MONTHS.indexOf(forecastMonth) < 0) { addIssue('DEMAND', null, 'MISSING_FORECAST'); }
else {
fcReg.forEach(function (r) {
var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
if (!nonEmpty(sku)) { addIssue('DEMAND', null, 'MISSING_FORECAST'); return; }
var val = r[forecastMonth];
if (val === undefined || val === null || val === '') return;
var srcRef = nonEmpty(r.forecast_id) ? 'FC:' + str(r.forecast_id)
: 'REG:' + [str(r.company) || str(scope.company), str(r.country) || str(scope.country), str(r.marketplace) || str(scope.marketplace), sku, str(input.planningCycle)].join(':');
if (seenDemandRef[srcRef]) { addIssue('DEMAND', srcRef, 'DUPLICATE_SOURCE'); return; }
seenDemandRef[srcRef] = 1;
var dest = resolveDestination(srcRef, null);
if (!dest) { addIssue('DEMAND', srcRef, 'MISSING_DESTINATION_WAREHOUSE'); return; }
demandRows.push({ demand_type: 'REGULAR', source_ref: srcRef, quantity: val, sku: sku,
company: str(r.company) || str(scope.company), country: str(r.country) || str(scope.country),
marketplace: str(r.marketplace) || str(scope.marketplace), destination_warehouse_id: dest,
planning_cycle: str(input.planningCycle), required_by_date: requiredByDate });
});
}
}
if (fcEvt.length) {
fcEvt.forEach(function (r) {
var eventId = nonEmpty(r.event_fc_id) ? str(r.event_fc_id) : (nonEmpty(r.event_id) ? str(r.event_id) : null);
if (!eventId) { addIssue('DEMAND', null, 'BLOCKED_CONFLICT'); return; }
if (r.fc_qty === undefined || r.fc_qty === null || r.fc_qty === '') return;
var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
var srcRef = 'EVT:' + eventId;
if (seenDemandRef[srcRef]) { addIssue('DEMAND', srcRef, 'DUPLICATE_SOURCE'); return; }
seenDemandRef[srcRef] = 1;
var dest = resolveDestination(srcRef, null);
if (!dest) { addIssue('DEMAND', srcRef, 'MISSING_DESTINATION_WAREHOUSE'); return; }
demandRows.push({ demand_type: 'SPECIAL_EVENT', source_ref: srcRef, event_id: eventId, quantity: r.fc_qty, sku: sku,
company: str(r.company) || str(scope.company), country: str(r.country) || str(scope.country),
marketplace: str(r.marketplace) || str(scope.marketplace), destination_warehouse_id: dest,
planning_cycle: str(input.planningCycle), required_by_date: requiredByDate });
});
}


var supplyRows = [];
var asOfByType = {};


var fbaAsOf = [];
fba.forEach(function (r) {
if (r.available_qty === undefined || r.available_qty === null || r.available_qty === '') return;
var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
var wh = str(r.warehouse_id) || str(scope.fbaWarehouseId);
if (!nonEmpty(wh)) { addIssue('SUPPLY', sku, 'SOURCE_NOT_AVAILABLE'); return; }
var company = str(scope.company);
fbaAsOf.push(r.snapshot_date);
supplyRows.push({ pool_type: 'FBA', warehouse_id: wh, quantity: r.available_qty, sku: sku, company: company,
lifecycle_bucket: 'CURRENT_STOCK', supply_lineage_ref: 'stock:FBA:' + wh + ':' + sku });
});
if (fba.length) asOfByType.amazonInventorySnapshot = maxAsOf(fbaAsOf);


var ovsAsOf = [];
ovs.forEach(function (r) {
if (r.wh_available_stock === undefined || r.wh_available_stock === null || r.wh_available_stock === '') return;
var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
var wh = str(r.warehouse_id);
if (!nonEmpty(wh)) { addIssue('SUPPLY', sku, 'SOURCE_NOT_AVAILABLE'); return; }
var whRow = whById[wh];
var company = whRow && nonEmpty(whRow.company) ? str(whRow.company) : str(scope.company);
ovsAsOf.push(r.snapshot_date);
supplyRows.push({ pool_type: 'THREE_PL', warehouse_id: wh, quantity: r.wh_available_stock, sku: sku, company: company,
lifecycle_bucket: 'CURRENT_STOCK', supply_lineage_ref: 'stock:THREE_PL:' + wh + ':' + sku });
});
if (ovs.length) asOfByType.overseasInventorySnapshot = maxAsOf(ovsAsOf);


var facAsOf = [];
fac.forEach(function (r) {
if (r.fac_current_stock === undefined || r.fac_current_stock === null || r.fac_current_stock === '') return;
var sku = nonEmpty(r.sku) ? str(r.sku) : str(scope.sku);
var wh = str(r.warehouse_id);
if (!nonEmpty(wh)) { addIssue('SUPPLY', sku, 'SOURCE_NOT_AVAILABLE'); return; }
var rowAsOf = nonEmpty(r.last_transaction_at) ? str(r.last_transaction_at) : (nonEmpty(r.updated_at) ? str(r.updated_at) : null);
if (rowAsOf === null) addIssue('SUPPLY', 'stock:FACTORY:' + wh + ':' + sku, 'SOURCE_AS_OF_MISSING');
else facAsOf.push(rowAsOf);
supplyRows.push({ pool_type: 'FACTORY', warehouse_id: wh, quantity: r.fac_current_stock, sku: sku,
company: FACTORY_SHARED, lifecycle_bucket: 'CURRENT_STOCK', supply_lineage_ref: 'stock:FACTORY:' + wh + ':' + sku });
});
if (fac.length) asOfByType.factoryStock = facAsOf.length ? maxAsOf(facAsOf) : null;









var planAsOf = [], shipAsOf = [];




function resolveRunDestination() {
if (nonEmpty(scope.destinationWarehouseId)) return str(scope.destinationWarehouseId);
for (var k in routing) { if (has(routing, k) && nonEmpty(routing[k])) return str(routing[k]); }
return null;
}



var approvedShippingPlans = plans.map(function (r) {
planAsOf.push(r.source_data_as_of);
var lineId = str(r.shipping_plan_line_id), planId = str(r.shipping_plan_id);
return {
status: r.status,
supplyLineageRef: lineId ? (planId ? 'shipping_plan:' + planId + ':' + lineId : 'shipping_plan:' + lineId) : '',
company: str(r.company) || str(scope.company),
masterSku: nonEmpty(r.sku) ? str(r.sku) : str(scope.sku),
warehouseId: str(r.destination_warehouse_id) || str(r.source_warehouse_id),
poolType: 'THREE_PL',
quantity: r.approved_qty
};
});
if (plans.length) asOfByType.shippingPlans = maxAsOf(planAsOf);






ships.forEach(function (r) { shipAsOf.push(r.source_data_as_of); });
var slLinks = normalizeCanonical(snaps.shipmentPlanLinks, 'sourceSnapshots.shipmentPlanLinks');
var slBuilt = KMSLS.buildShipmentLineCandidates({ shipmentLines: shipLines, shipments: ships, shippingPlanLines: planLines, shippingPlans: plans,
shipmentLinkCountById: (typeof KMSLS.shipmentLinkCountsFromRows === 'function' && snaps.shipmentPlanLinks) ? KMSLS.shipmentLinkCountsFromRows(slLinks) : undefined });
var shipmentInputs = slBuilt.shipmentInputs;
(slBuilt.issues || []).forEach(function (x) { addIssue('SUPPLY', 'shipment_line@' + x.i, x.reason); });
if (ships.length) asOfByType.shipments = maxAsOf(shipAsOf);




var lifecycleInput = { approvedShippingPlans: approvedShippingPlans, sourceDataAsOf: input.sourceDataAsOf };
if (shipmentInputs.length) {
var runDest = resolveRunDestination();
if (!isStrictDate(requiredByDate)) { addIssue('SUPPLY', 'shipments', 'MISSING_REQUIRED_BY_DATE'); }
else if (!runDest) { addIssue('SUPPLY', 'shipments', 'MISSING_DESTINATION_FOR_SHIPMENT_SCOPE'); }
else {
lifecycleInput.shipments = {
shipmentInputs: shipmentInputs,
scope: { company: str(scope.company), sku: str(scope.sku), destinationWarehouseId: runDest,
country: nonEmpty(scope.country) ? str(scope.country) : undefined,
marketplace: nonEmpty(scope.marketplace) ? str(scope.marketplace) : undefined },
requiredByDate: str(requiredByDate),
postedToCurrentStockLineageKeys: Array.isArray(input.postedToCurrentStockLineageKeys) ? input.postedToCurrentStockLineageKeys : [],
activeOtherBucketLineageKeys: Array.isArray(input.activeOtherBucketLineageKeys) ? input.activeOtherBucketLineageKeys : []
};
}
}

var lifecycle = KMSF.projectSupplyLifecycle(lifecycleInput);


(lifecycle.issues || []).forEach(function (x) { addIssue('SUPPLY', x.domain + '@' + x.i, x.reason); });
if (lifecycle.ready === false) addIssue('SUPPLY', 'lifecycle', lifecycle.reason || 'BLOCKED_CONFLICT');

(lifecycle.entries || []).forEach(function (e) {
supplyRows.push({ pool_type: e.poolType, warehouse_id: e.warehouseId, quantity: e.quantity,
supply_lineage_ref: e.supplyLineageRef, sku: e.masterSku, company: e.company, lifecycle_bucket: e.lifecycleBucket,
eta: (e.eta == null ? null : str(e.eta)) });
});









var warehouseQualifiedEvents = [];
supplyRows.forEach(function (e) {
if (e.lifecycle_bucket !== 'SHIPPED_IN_TRANSIT') return;
if (!nonEmpty(e.eta)) return;
warehouseQualifiedEvents.push({
incomingId: str(e.supply_lineage_ref), eta: str(e.eta), eligibleQty: e.quantity,
warehouseId: str(e.warehouse_id), sourceType: 'KM', state: 'QUALIFIED'
});
});
warehouseQualifiedEvents.sort(function (a, b) {
return cmpStr(a.warehouseId, b.warehouseId) || cmpStr(a.eta, b.eta) || cmpStr(a.incomingId, b.incomingId);
});


var callerFacts = Array.isArray(input.planningFacts) ? input.planningFacts : [];
var planningRows = callerFacts.map(function (f) {
var sku = nonEmpty(f.sku) ? str(f.sku) : str(scope.sku);
var row = { recommendation_type: type, demand_source_ref: str(f.demandRef), sku: sku,
site_sku: f.siteSku, company: str(f.company) || str(scope.company),
country: str(f.country) || str(scope.country), marketplace: str(f.marketplace) || str(scope.marketplace),
units_per_carton: has(f, 'unitsPerCarton') ? f.unitsPerCarton : upcBySku[sku],
formula_version: input.formulaVersion, source_data_as_of: input.sourceDataAsOf };
if (type === 'WEEKLY_SHIPPING') { row.window_code = f.windowCode; row.calculated_gap_qty = f.calculatedGap; }
else { row.request_month = f.requestMonth; row.request_bucket = f.requestBucket; row.net_order_need_snapshot = f.netOrderNeed; }
return row;
});




var receiverInput = Array.isArray(input.receiverFacts) ? input.receiverFacts : [];
var receiverRows = receiverInput.map(function (f) {
var mkt = str(f.marketplace) || str(scope.marketplace);
var mskKey = [str(scope.company), str(scope.country), mkt, str(f.sku || scope.sku)].join('|');
return { receiver_key: str(f.receiverKey), demand_source_ref: str(f.demandRef),
eligible_pool_types: f.eligiblePoolTypes, survival_need_qty: f.survivalNeedQty, daily_demand: f.dailyDemand,
allocation_priority: emitPriority(has(f, 'allocationPriority') ? f.allocationPriority : priorityForMktKey(mktIdentityKey(scope.company, scope.country, mkt)), str(f.demandRef)),
demand_weight: f.demandWeight,
fulfillment_model: nonEmpty(f.fulfillmentModel) ? f.fulfillmentModel : ffByMskKey[mskKey],
marketplace: mkt, destination_warehouse_id: resolveDestination(str(f.demandRef), f.destinationWarehouseId) };
});

var factoryInput = Array.isArray(input.factoryDemandFacts) ? input.factoryDemandFacts : [];
var factoryRows = factoryInput.map(function (f) {
var mkt = str(f.marketplace) || str(scope.marketplace);
return { demand_source_ref: str(f.demandRef), eligible_factory_warehouse_ids: f.eligibleFactoryWarehouseIds,
allocation_priority: emitPriority(has(f, 'allocationPriority') ? f.allocationPriority : priorityForMktKey(mktIdentityKey(scope.company, scope.country, mkt)), str(f.demandRef)),
required_by_date: has(f, 'requiredByDate') ? f.requiredByDate : requiredByDate,
marketplace: mkt, destination_warehouse_id: resolveDestination(str(f.demandRef), f.destinationWarehouseId) };
});


var demandAsOf = asOfByType.overseasInventorySnapshot || null;
var demandHeaders = ['demand_type', 'source_ref', 'quantity', 'required_by_date', 'sku', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'planning_cycle', 'event_id'];
var supplyHeaders = ['pool_type', 'warehouse_id', 'quantity', 'supply_lineage_ref', 'sku', 'company', 'lifecycle_bucket'];
var planningHeaders = type === 'WEEKLY_SHIPPING'
? ['recommendation_type', 'demand_source_ref', 'sku', 'site_sku', 'window_code', 'calculated_gap_qty', 'units_per_carton', 'company', 'country', 'marketplace', 'formula_version', 'source_data_as_of']
: ['recommendation_type', 'demand_source_ref', 'sku', 'site_sku', 'request_month', 'request_bucket', 'net_order_need_snapshot', 'units_per_carton', 'company', 'country', 'marketplace', 'formula_version', 'source_data_as_of'];
var receiverHeaders = ['receiver_key', 'demand_source_ref', 'eligible_pool_types', 'survival_need_qty', 'daily_demand', 'allocation_priority', 'demand_weight', 'fulfillment_model', 'marketplace', 'destination_warehouse_id'];
var factoryHeaders = ['demand_source_ref', 'eligible_factory_warehouse_ids', 'allocation_priority', 'required_by_date', 'marketplace', 'destination_warehouse_id'];

var sourceAsOf = input.sourceDataAsOf !== undefined ? input.sourceDataAsOf
: maxAsOf([asOfByType.amazonInventorySnapshot, asOfByType.overseasInventorySnapshot, asOfByType.factoryStock, asOfByType.shippingPlans, asOfByType.shipments]);

var reader = {
skuDetails: toSnapshot('skuDetails', skuRows, unionHeaders(skuRows, ['sku', 'units_per_carton', 'category', 'series']), null),
marketplaceSkus: toSnapshot('marketplaceSkus', mskRows, unionHeaders(mskRows, ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model']), null),
warehouses: toSnapshot('warehouses', whRows, unionHeaders(whRows, ['warehouse_id', 'warehouse_type', 'is_factory_warehouse', 'is_active', 'company', 'country']), null),
demand: toSnapshot('demand', demandRows, demandHeaders, demandAsOf),
supply: toSnapshot('supply', supplyRows, supplyHeaders, sourceAsOf),
planningFacts: toSnapshot('planningFacts', planningRows, planningHeaders, input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf)
};
if (type === 'WEEKLY_SHIPPING') reader.receivers = toSnapshot('receivers', receiverRows, receiverHeaders, null);
if (type === 'MONTHLY_ORDER') reader.factoryDemands = toSnapshot('factoryDemands', factoryRows, factoryHeaders, null);


var hardReason = null;
if (!demandRows.length) hardReason = 'SOURCE_NOT_AVAILABLE';
else if (!supplyRows.length) hardReason = 'MISSING_SNAPSHOT';
else if (!planningRows.length) hardReason = 'SOURCE_NOT_AVAILABLE';

return {
ready: hardReason === null, status: hardReason === null ? 'READY' : 'BLOCKED', reason: hardReason,
issues: issues, recommendationType: type, planningCycle: str(input.planningCycle), businessScope: scope,
sourceReaderInput: reader,
demandSourceEntries: demandRows, supplySourceEntries: supplyRows,
warehouseQualifiedEvents: warehouseQualifiedEvents,
receiverFacts: receiverRows, factoryDemandFacts: factoryRows, planningFacts: planningRows,
sourceDataAsOf: sourceAsOf, sourceAsOfByType: asOfByType,
lineage: { origin: ORIGIN, demandCount: demandRows.length, supplyCount: supplyRows.length }
};
}

function unionHeaders(rows, base) {
var seen = {}; base.forEach(function (h) { seen[h] = 1; });
var extra = [];
rows.forEach(function (r) { for (var k in r) if (has(r, k) && !seen[k]) { seen[k] = 1; extra.push(k); } });
extra.sort(cmpStr);
return base.concat(extra);
}


function projectAndRead(input) {
var p = projectRecommendationProductionSources(input);
if (!p.ready) {
return { projection: p, ready: false, reason: p.reason, recommendationType: p.recommendationType,
planningCycle: p.planningCycle, businessScope: p.businessScope, lines: [], bridgeResult: null };
}
var full = KMSRP.buildRecommendationSourceFacts({
recommendationType: p.recommendationType, planningCycle: p.planningCycle, businessScope: p.businessScope,
snapshots: p.sourceReaderInput, formulaVersion: input.formulaVersion, sourceDataAsOf: p.sourceDataAsOf
});
full.projection = p;
return full;
}

return {
FACTORY_SHARED: FACTORY_SHARED,
projectRecommendationProductionSources: projectRecommendationProductionSources,
projectAndRead: projectAndRead
};
});



__kmRegister("supply-planning-source-projection", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





























(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.allocationFacts = api; }
})(this, function (CALC) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nonEmpty(v) { return str(v).length > 0; }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function cmpStr(a, b) { a = str(a); b = str(b); return a < b ? -1 : a > b ? 1 : 0; }
function finiteNonNeg(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return (isFinite(n) && n >= 0) ? n : null; }

var DEMAND_DRIVERS = { SALES_DRIVEN: 1, FORECAST_DRIVEN: 1 };
var OVERSEAS_POOL_TYPES = { FBA: 1, THREE_PL: 1 };

var FBA_FULFILLMENT = { platform_fulfilled: 1, hybrid: 1 };
var THREE_PL_FULFILLMENT = { self_fulfilled: 1, hybrid: 1 };



function threePlEligible(warehouses, company, country) {
for (var i = 0; i < warehouses.length; i++) {
var w = warehouses[i];
if (str(w.warehouse_type).toUpperCase() === '3PL' && truthyFlag(w.is_active) &&
str(w.company) === company && (country === '' || str(w.country) === country)) return true;
}
return false;
}

function eligibleFactoryWarehouseIds(warehouses) {
var seen = {}, out = [];
for (var i = 0; i < warehouses.length; i++) {
var w = warehouses[i];
if (truthyFlag(w.is_factory_warehouse) && truthyFlag(w.is_active)) {
var id = str(w.warehouse_id);
if (nonEmpty(id) && !seen[id]) { seen[id] = 1; out.push(id); }
}
}
out.sort(cmpStr);
return out;
}
function truthyFlag(v) { if (v === true) return true; var s = str(v).toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || s === 'y'; }


function eligiblePoolTypesFor(fulfillmentModel, threePlOk) {
var pools = [];
if (FBA_FULFILLMENT[fulfillmentModel] === 1) pools.push('FBA');
if (THREE_PL_FULFILLMENT[fulfillmentModel] === 1 && threePlOk) pools.push('THREE_PL');

if (fulfillmentModel === 'platform_fulfilled' && threePlOk && pools.indexOf('THREE_PL') === -1) pools.push('THREE_PL');
var seen = {}, out = [];
pools.forEach(function (p) { if (OVERSEAS_POOL_TYPES[p] === 1 && !seen[p]) { seen[p] = 1; out.push(p); } });
out.sort(cmpStr);
return out;
}


function deriveDailyDemand(r, driver, calculationDate, recvIssues, key) {
if (driver === 'SALES_DRIVEN') {
var sb = r.salesBasis;
if (!isObj(sb)) { recvIssues.push(issue('DAILY_DEMAND_SOURCE_MISSING', key, 'Sales-Driven receiver has no salesBasis for §22 run-rate')); return null; }
var res = CALC.normalizedAvgSalesPerDay({
windowPolicy: 'calendar_30',
calcDate: nonEmpty(sb.calcDate) ? str(sb.calcDate) : str(calculationDate),
scope: sb.scope, weekly7d: sb.weekly7d, dailySales: sb.dailySales || [],
campaigns: sb.campaigns || [], events: sb.events || []
});
var dd = finiteNonNeg(res.avgSalesPerDay);
if (dd === null) { recvIssues.push(issue('INVALID_DAILY_DEMAND', key, 'normalizedAvgSalesPerDay returned a non-finite avgSalesPerDay')); return null; }
return { dailyDemand: dd, runRateSource: res.source, runRateWarning: res.warning };
}
if (driver === 'FORECAST_DRIVEN') {
var fb = r.forecastBasis;
if (!isObj(fb)) { recvIssues.push(issue('DAILY_DEMAND_SOURCE_MISSING', key, 'Forecast-Driven receiver has no forecastBasis for §2D')); return null; }
var fres = CALC.calculateForecastDrivenRemainingNeed({
forecastMonth1: fb.forecastMonth1, forecastMonth2: fb.forecastMonth2, targetRules: fb.targetRules,
specialEventDemand: fb.specialEventDemand,
destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0
});
var fdd = finiteNonNeg(fres.forecastDailyDemand);
if (fdd === null) { recvIssues.push(issue('INVALID_DAILY_DEMAND', key, 'calculateForecastDrivenRemainingNeed returned a non-finite forecastDailyDemand')); return null; }
return { dailyDemand: fdd, forecastTotalDemand: fres.totalForecastDrivenDemand };
}

recvIssues.push(issue('DEMAND_WEIGHT_UNRESOLVED', key, 'receiver has no valid demandDriver (SALES_DRIVEN|FORECAST_DRIVEN); the Sales-vs-Forecast classifier is caller-owned and has no canonical column'));
return null;
}




function weightBasisFor(r, driver, dailyDemand, recvIssues, key) {
if (driver === 'SALES_DRIVEN') return dailyDemand;
if (driver === 'FORECAST_DRIVEN') {
var fb = r.forecastBasis || {};
var b = finiteNonNeg(fb.forecastShareQty);
if (b === null) { recvIssues.push(issue('DEMAND_WEIGHT_UNRESOLVED', key, 'Forecast-Driven weight needs forecastBasis.forecastShareQty (§7 rolling-4-month FC basis; window anchor caller-owned, never guessed)')); return null; }
return b;
}
return null;
}

function issue(code, ref, message) { return { code: code, ref: ref === undefined ? null : ref, message: message, details: {} }; }
function resolveDestination(r, routing, scope) {
if (nonEmpty(r.destinationWarehouseId)) return str(r.destinationWarehouseId);
if (nonEmpty(routing[str(r.demandRef)])) return str(routing[str(r.demandRef)]);
if (nonEmpty(scope.destinationWarehouseId)) return str(scope.destinationWarehouseId);
return null;
}

function projectAllocationFacts(input) {
aType(isObj(input), 'projectAllocationFacts: input must be an object');
aType(isObj(input.businessScope), 'projectAllocationFacts: input.businessScope required');
var type = str(input.recommendationType);
aType(type === 'WEEKLY_SHIPPING' || type === 'MONTHLY_ORDER', 'projectAllocationFacts: recommendationType must be WEEKLY_SHIPPING | MONTHLY_ORDER');
var scope = input.businessScope;
var company = str(scope.company);
var country = str(scope.country);
aType(nonEmpty(company), 'projectAllocationFacts: businessScope.company required');
var calculationDate = nonEmpty(input.calculationDate) ? str(input.calculationDate) : null;
var receivers = Array.isArray(input.receivers) ? input.receivers : [];
var warehouses = Array.isArray(input.warehouses) ? input.warehouses : [];
var routing = isObj(input.routing) ? input.routing : {};

var issues = [];
var threePlOk = threePlEligible(warehouses, company, country);
var factoryIds = eligibleFactoryWarehouseIds(warehouses);

if (type === 'MONTHLY_ORDER') return buildMonthly(input, scope, company, receivers, routing, factoryIds, issues);
return buildWeekly(input, scope, company, country, calculationDate, receivers, warehouses, routing, threePlOk, issues);
}


function buildWeekly(input, scope, company, country, calculationDate, receivers, warehouses, routing, threePlOk, issues) {
var stage = [];
for (var i = 0; i < receivers.length; i++) {
var r = receivers[i]; aType(isObj(r), 'projectAllocationFacts: receivers[' + i + '] must be an object');
var key = nonEmpty(r.receiverKey) ? str(r.receiverKey) : ('@' + i);
var recvIssues = [];
if (!nonEmpty(r.receiverKey)) recvIssues.push(issue('RECEIVER_IDENTITY_INCOMPLETE', key, 'receiverKey required'));
if (!nonEmpty(r.demandRef)) recvIssues.push(issue('RECEIVER_IDENTITY_INCOMPLETE', key, 'demandRef required'));
var driver = str(r.demandDriver).toUpperCase();
if (!DEMAND_DRIVERS[driver]) driver = '';
var dd = deriveDailyDemand(r, driver, calculationDate, recvIssues, key);
var dailyDemand = dd ? dd.dailyDemand : null;
var basis = (dailyDemand !== null || driver === 'FORECAST_DRIVEN') ? weightBasisFor(r, driver, dailyDemand, recvIssues, key) : null;
var fulfillmentModel = str(r.fulfillmentModel);
var pools = eligiblePoolTypesFor(fulfillmentModel, threePlOk);
if (!pools.length) recvIssues.push(issue('POOL_ELIGIBILITY_UNRESOLVED', key, 'no eligible pool type (fulfillment_model=' + (fulfillmentModel || '∅') + '; 3PL warehouse-eligible=' + threePlOk + ')'));
var dest = resolveDestination(r, routing, scope);
if (dest === null) recvIssues.push(issue('MISSING_DESTINATION_WAREHOUSE', key, 'no canonical destination (fact / routing / frozen scope); D-3 caller-owned, never inferred'));
var windowCode = nonEmpty(r.windowCode) ? str(r.windowCode) : null;
if (windowCode === null) recvIssues.push(issue('MISSING_WINDOW_CODE', key, 'windowCode is a caller-owned planning-window fact (§6)'));
var priority = finiteNonNeg(r.allocationPriority);
var upc = r.unitsPerCarton;
stage.push({ r: r, key: key, driver: driver, dailyDemand: dailyDemand, basis: basis, pools: pools, dest: dest,
windowCode: windowCode, fulfillmentModel: fulfillmentModel, priority: priority, upc: upc, recvIssues: recvIssues, extra: dd || {} });
}


var totalBasis = 0; stage.forEach(function (s) { if (!s.recvIssues.length && typeof s.basis === 'number') totalBasis += s.basis; });

var receiverFacts = [], planningFacts = [];
stage.forEach(function (s) {
var demandWeight = null;
if (!s.recvIssues.length) {
if (totalBasis > 0 && typeof s.basis === 'number') demandWeight = s.basis / totalBasis;
else s.recvIssues.push(issue('DEMAND_WEIGHT_UNRESOLVED', s.key, 'group demand basis total is 0 — no proportional share is defined (never averaged/faked)'));
}
if (s.recvIssues.length) { s.recvIssues.forEach(function (x) { issues.push(x); }); return; }


receiverFacts.push({
receiverKey: s.key, demandKey: str(s.r.demandKey) || str(s.r.demandRef), demandRef: str(s.r.demandRef),
marketplace: str(s.r.marketplace), destinationWarehouseId: s.dest, fulfillmentModel: s.fulfillmentModel,
dailyDemand: s.dailyDemand, allocationPriority: s.priority, demandWeight: demandWeight, eligiblePoolTypes: s.pools
});

planningFacts.push(weeklyPlanningFact(s, scope, company, country, input));
});

receiverFacts.sort(function (a, b) { return cmpStr(a.receiverKey, b.receiverKey); });
planningFacts.sort(function (a, b) { return cmpStr(a.demandRef, b.demandRef); });
issues.sort(function (a, b) { return cmpStr(a.code, b.code) || cmpStr(a.ref, b.ref); });
var ready = issues.length === 0 && receiverFacts.length > 0;
return {
ready: ready, reason: ready ? null : (issues.length ? issues[0].code : 'PLANNING_FACTS_NOT_READY'),
recommendationType: 'WEEKLY_SHIPPING', receiverFacts: receiverFacts, factoryDemandFacts: [], planningFacts: planningFacts,
issues: issues, meta: { formulaVersion: input.formulaVersion == null ? null : input.formulaVersion, sourceDataAsOf: input.sourceDataAsOf == null ? null : input.sourceDataAsOf, deterministic: true }
};
}

function weeklyPlanningFact(s, scope, company, country, input) {
var r = s.r;
var f = {
recommendationType: 'WEEKLY_SHIPPING', demandRef: str(r.demandRef), demandKey: str(r.demandKey) || str(r.demandRef),
sku: nonEmpty(r.masterSku) ? str(r.masterSku) : str(r.sku), siteSku: str(r.siteSku), windowCode: s.windowCode,
company: nonEmpty(r.company) ? str(r.company) : company, country: nonEmpty(r.country) ? str(r.country) : country,
marketplace: str(r.marketplace), destinationWarehouseId: s.dest, unitsPerCarton: r.unitsPerCarton
};

if (has(r, 'demand')) f.demand = r.demand;
else if (s.extra && has(s.extra, 'forecastTotalDemand')) f.demand = s.extra.forecastTotalDemand;
if (has(r, 'destinationCurrentStock')) f.destinationCurrentStock = r.destinationCurrentStock;
if (has(r, 'timelyQualifiedIncoming')) f.timelyQualifiedIncoming = r.timelyQualifiedIncoming;
if (has(r, 'timelyApprovedCommittedSupply')) f.timelyApprovedCommittedSupply = r.timelyApprovedCommittedSupply;
if (has(r, 'requiredByDate')) f.requiredByDate = r.requiredByDate;
return f;
}


function buildMonthly(input, scope, company, receivers, routing, factoryIds, issues) {
var factoryDemandFacts = [], planningFacts = [];
for (var i = 0; i < receivers.length; i++) {
var r = receivers[i]; aType(isObj(r), 'projectAllocationFacts: receivers[' + i + '] must be an object');
var key = nonEmpty(r.receiverKey) ? str(r.receiverKey) : ('@' + i);
var recvIssues = [];
if (!nonEmpty(r.demandRef)) recvIssues.push(issue('RECEIVER_IDENTITY_INCOMPLETE', key, 'demandRef required'));
var dest = resolveDestination(r, routing, scope);
if (dest === null) recvIssues.push(issue('MISSING_DESTINATION_WAREHOUSE', key, 'no canonical destination; D-3 caller-owned'));
var requiredByDate = nonEmpty(r.requiredByDate) ? str(r.requiredByDate) : null;
if (requiredByDate === null) recvIssues.push(issue('MISSING_REQUIRED_BY_DATE', key, 'factory FIFO requires a required-by date (§6 caller-owned)'));
if (!factoryIds.length) recvIssues.push(issue('FACTORY_ELIGIBILITY_UNRESOLVED', key, 'no is_factory_warehouse eligible warehouse (§35/§40)'));
var priority = finiteNonNeg(r.allocationPriority);
if (priority === null) recvIssues.push(issue('FACTORY_ELIGIBILITY_UNRESOLVED', key, 'allocationPriority missing/invalid (§20.4/§35 ordering)'));
var requestMonth = nonEmpty(r.requestMonth) ? str(r.requestMonth) : null;
var requestBucket = nonEmpty(r.requestBucket) ? str(r.requestBucket) : null;
if (requestMonth === null || requestBucket === null) recvIssues.push(issue('PLANNING_FACTS_NOT_READY', key, 'requestMonth/requestBucket are caller-owned Monthly grain facts'));
if (recvIssues.length) { recvIssues.forEach(function (x) { issues.push(x); }); continue; }
factoryDemandFacts.push({
demandKey: str(r.demandKey) || str(r.demandRef), demandRef: str(r.demandRef), company: nonEmpty(r.company) ? str(r.company) : company,
marketplace: str(r.marketplace), destinationWarehouseId: dest, requiredByDate: requiredByDate,
allocationPriority: priority, eligibleFactoryWarehouseIds: factoryIds.slice()
});
planningFacts.push(monthlyPlanningFact(r, scope, company, dest, requestMonth, requestBucket));
}
factoryDemandFacts.sort(function (a, b) { return cmpStr(a.demandRef, b.demandRef); });
planningFacts.sort(function (a, b) { return cmpStr(a.demandRef, b.demandRef); });
issues.sort(function (a, b) { return cmpStr(a.code, b.code) || cmpStr(a.ref, b.ref); });
var ready = issues.length === 0 && factoryDemandFacts.length > 0;
return {
ready: ready, reason: ready ? null : (issues.length ? issues[0].code : 'PLANNING_FACTS_NOT_READY'),
recommendationType: 'MONTHLY_ORDER', receiverFacts: [], factoryDemandFacts: factoryDemandFacts, planningFacts: planningFacts,
issues: issues, meta: { formulaVersion: input.formulaVersion == null ? null : input.formulaVersion, sourceDataAsOf: input.sourceDataAsOf == null ? null : input.sourceDataAsOf, deterministic: true }
};
}

function monthlyPlanningFact(r, scope, company, dest, requestMonth, requestBucket) {
var f = {
recommendationType: 'MONTHLY_ORDER', demandRef: str(r.demandRef), demandKey: str(r.demandKey) || str(r.demandRef),
masterSku: nonEmpty(r.masterSku) ? str(r.masterSku) : str(r.sku), siteSku: str(r.siteSku),
requestMonth: requestMonth, requestBucket: requestBucket, company: nonEmpty(r.company) ? str(r.company) : company,
country: str(r.country), marketplace: str(r.marketplace), destinationWarehouseId: dest, unitsPerCarton: r.unitsPerCarton
};

if (Array.isArray(r.remainingShortages)) f.remainingShortages = r.remainingShortages.slice();
if (has(r, 'netOrderNeed')) f.netOrderNeed = r.netOrderNeed;
if (has(r, 'demand')) f.demand = r.demand;
if (has(r, 'destinationCurrentStock')) f.destinationCurrentStock = r.destinationCurrentStock;
if (has(r, 'timelyQualifiedIncoming')) f.timelyQualifiedIncoming = r.timelyQualifiedIncoming;
if (has(r, 'timelyApprovedCommittedSupply')) f.timelyApprovedCommittedSupply = r.timelyApprovedCommittedSupply;
return f;
}

return {
projectAllocationFacts: projectAllocationFacts,

_eligiblePoolTypesFor: eligiblePoolTypesFor,
_eligibleFactoryWarehouseIds: eligibleFactoryWarehouseIds,
_threePlEligible: threePlEligible
};
});
__kmRegister("supply-planning-allocation-facts", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;






















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.planningContext = api; }
})(this, function (CALC) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nonEmpty(v) { return str(v).length > 0; }
function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
function cmpStr(a, b) { a = str(a); b = str(b); return a < b ? -1 : a > b ? 1 : 0; }
function truthyFlag(v) { if (v === true) return true; var s = str(v).toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || s === 'y'; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function issue(code, ref, message) { return { code: code, ref: ref === undefined ? null : ref, message: message, details: {} }; }


function parseYM(s) { var m = /^(\d{4})-(\d{2})$/.exec(str(s)); if (!m) return null; var y = parseInt(m[1], 10), mo = parseInt(m[2], 10); if (mo < 1 || mo > 12) return null; return { y: y, mo: mo }; }
function addMonths(ym, n) { var idx = ym.y * 12 + (ym.mo - 1) + n; return { y: Math.floor(idx / 12), mo: (idx % 12) + 1 }; }
function ymStr(ym) { return ym.y + '-' + pad2(ym.mo); }
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function daysInMonth(y, mo) { return [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]; }
function firstDay(ym) { return ymStr(ym) + '-01'; }
function lastDay(ym) { return ymStr(ym) + '-' + pad2(daysInMonth(ym.y, ym.mo)); }
function finiteNonNeg(v) { if (v === '' || v === null || v === undefined) return null; if (typeof v !== 'number' && typeof v !== 'string') return null; var n = Number(v); return (isFinite(n) && n >= 0) ? n : null; }


function normalizeDestination(r) {

var raw = r.destinationWarehouseId;
var list = Array.isArray(raw) ? raw.slice() : (nonEmpty(raw) ? [raw] : []);
if (Array.isArray(r.destinationWarehouseIds)) list = list.concat(r.destinationWarehouseIds);
var seen = {}, distinct = [];
list.forEach(function (v) { var id = str(v); if (nonEmpty(id) && !seen[id]) { seen[id] = 1; distinct.push(id); } });
return distinct;
}
function validateDestination(r, whById, recvIssues, key, explicitId) {


var distinct = (explicitId !== undefined && explicitId !== null && str(explicitId) !== '') ? [str(explicitId)] : normalizeDestination(r);
if (distinct.length === 0) { recvIssues.push(issue('MISSING_DESTINATION_WAREHOUSE', key, 'destinationWarehouseId is a required caller-owned canonical warehouse_id (D-F1-5B-1; never inferred)')); return null; }
if (distinct.length > 1) { recvIssues.push(issue('DESTINATION_AUTHORITY_CONFLICT', key, 'multiple distinct destination authorities supplied: ' + distinct.join(','))); return null; }
var id = distinct[0];
var w = whById[id];
if (!w) { recvIssues.push(issue('DESTINATION_NOT_ELIGIBLE', key, 'destination warehouse_id not found in canonical warehouses: ' + id)); return null; }
if (!truthyFlag(w.is_active)) { recvIssues.push(issue('DESTINATION_NOT_ELIGIBLE', key, 'destination warehouse is inactive: ' + id)); return null; }
if (nonEmpty(w.company) && nonEmpty(r.company) && str(w.company) !== str(r.company)) {
recvIssues.push(issue('DESTINATION_NOT_ELIGIBLE', key, 'destination warehouse company (' + str(w.company) + ') ≠ receiver company (' + str(r.company) + ') — no cross-company borrowing')); return null;
}
return { id: id, code: str(w.warehouse_code), type: str(w.warehouse_type) };
}




function validateMarketplaceDestination(r, destNode, mktById, recvIssues, key) {
var refId = destNode ? str(destNode.marketplaceId || destNode.destinationRefId) : str(r.marketplaceId || r.destinationRefId);
if (!nonEmpty(refId)) { recvIssues.push(issue('MISSING_DESTINATION_MARKETPLACE', key, 'MARKETPLACE destination requires a canonical marketplace_id (never inferred)')); return null; }

if ((destNode && nonEmpty(destNode.warehouseId)) || nonEmpty(r.destinationWarehouseId)) { recvIssues.push(issue('MARKETPLACE_DESTINATION_SCOPE_MISMATCH', key, 'MARKETPLACE destination must not carry a warehouseId (no fabricated Amazon warehouse)')); return null; }
var hasAuth = mktById && Object.keys(mktById).length > 0;
if (hasAuth) {
var m = mktById[refId];
if (!m) { recvIssues.push(issue('MARKETPLACE_DESTINATION_NOT_FOUND', key, 'marketplace_id not in canonical marketplaces: ' + refId)); return null; }
var st = (m.status !== undefined ? m.status : m.is_active);
var active = (str(st).toLowerCase() === 'active' || st === true);
if (!active) { recvIssues.push(issue('MARKETPLACE_DESTINATION_INACTIVE', key, 'marketplace destination inactive: ' + refId)); return null; }
if (nonEmpty(m.company) && nonEmpty(r.company) && str(m.company) !== str(r.company)) { recvIssues.push(issue('MARKETPLACE_DESTINATION_SCOPE_MISMATCH', key, 'marketplace company (' + str(m.company) + ') ≠ receiver company (' + str(r.company) + ')')); return null; }
return { refId: refId, code: str(m.marketplace || m.marketplace_alias) || null, label: str(m.marketplace_display_name) || str(m.marketplace) || refId, marketplaceId: refId };
}
if (destNode && nonEmpty(destNode.warehouseId)) { recvIssues.push(issue('MARKETPLACE_DESTINATION_SCOPE_MISMATCH', key, 'MARKETPLACE destination must not carry a warehouseId (no fabricated Amazon warehouse)')); return null; }
return { refId: refId, code: destNode ? (str(destNode.destinationCode) || null) : null, label: destNode ? (str(destNode.destinationLabel) || refId) : refId, marketplaceId: refId };
}


function resolveForecastWeight(r, M, recvIssues, key) {
var months = [addMonths(M, 1), addMonths(M, 2), addMonths(M, 3), addMonths(M, 4)].map(ymStr);
var fcMap = has(r, 'regularForecastByMonth') && isObj(r.regularForecastByMonth) ? r.regularForecastByMonth : null;
if (!fcMap) { recvIssues.push(issue('MISSING_FORECAST_WEIGHT_SOURCE', key, 'regularForecastByMonth is required for the Phase-1 Forecast weight basis')); return { months: months, qty: null }; }
var sum = 0, blocked = false;
for (var i = 0; i < months.length; i++) {
var ms = months[i];
if (!has(fcMap, ms)) { recvIssues.push(issue('MISSING_FORECAST_WEIGHT_SOURCE', key + '|' + ms, 'Regular FC month missing (MISSING is not 0): ' + ms)); blocked = true; continue; }
var n = finiteNonNeg(fcMap[ms]);
if (n === null) { recvIssues.push(issue('INVALID_FORECAST_WEIGHT_VALUE', key + '|' + ms, 'Regular FC month value is not a finite non-negative number: ' + ms)); blocked = true; continue; }
sum += n;
}
return { months: months, qty: blocked ? null : sum };
}


function resolveWindow(r, M, planningCycle, recvIssues, key) {
var mStart = addMonths(M, 1), mEnd = addMonths(M, 4);
var windowStartDate = firstDay(mStart), windowEndDate = lastDay(mEnd);
var regularRequiredBy = windowStartDate;
var earliest = regularRequiredBy;
var events = Array.isArray(r.specialEventFacts) ? r.specialEventFacts : [];
for (var i = 0; i < events.length; i++) {
var ef = events[i]; var start = ef && nonEmpty(ef.eventStartDate) ? str(ef.eventStartDate) : '';
if (!start) continue;
var prep;
try { prep = CALC.eventPreparationDate(start); }
catch (e) { recvIssues.push(issue('MISSING_REQUIRED_BY_DATE', key, 'special event date invalid for §10 pull-forward: ' + start)); continue; }
if (prep < earliest) earliest = prep;
}
return { windowCode: planningCycle, windowStartDate: windowStartDate, windowEndDate: windowEndDate, requiredByDate: earliest };
}

function resolveRecommendationPlanningContext(input, options) {
aType(isObj(input), 'resolveRecommendationPlanningContext: input must be an object');
options = options || {};
var issues = [];
var planningCycle = nonEmpty(input.planningCycle) ? str(input.planningCycle) : null;
if (planningCycle === null) issues.push(issue('MISSING_PLANNING_CYCLE', null, 'planningCycle is required (caller/scheduler run parameter, SC-3.3)'));
var M = parseYM(input.calculationMonth);
if (M === null) issues.push(issue('MISSING_REQUIRED_BY_DATE', null, 'calculationMonth (injected "YYYY-MM") is required to derive the window/required-by (no browser-current-date inference)'));
if (planningCycle === null || M === null) {
return { ready: false, contexts: [], issues: issues, meta: { deterministic: true } };
}
var recommendationType = nonEmpty(input.recommendationType) ? str(input.recommendationType) : null;
var warehouses = Array.isArray(input.warehouses) ? input.warehouses : [];
var whById = {}; warehouses.forEach(function (w) { var id = str(w.warehouse_id); if (nonEmpty(id) && !whById[id]) whById[id] = w; });
var marketplaces = Array.isArray(input.marketplaces) ? input.marketplaces : [];
var mktById = {}; marketplaces.forEach(function (m) { var id = str(m.marketplace_id || m.marketplaceId); if (nonEmpty(id) && !mktById[id]) mktById[id] = m; });
var receivers = Array.isArray(input.receivers) ? input.receivers : [];

var byContextId = {};
var contexts = [];
for (var i = 0; i < receivers.length; i++) {
var r = receivers[i]; aType(isObj(r), 'resolveRecommendationPlanningContext: receivers[' + i + '] must be an object');
var key = nonEmpty(r.sku) ? str(r.sku) : ('@' + i);
var recvIssues = [];


var demandDriver = 'FORECAST';
if (has(r, 'demandDriver') && nonEmpty(r.demandDriver) && str(r.demandDriver).toUpperCase() !== 'FORECAST') {
recvIssues.push(issue('UNSUPPORTED_PHASE1_DEMAND_DRIVER', key, 'Phase-1 replenishment is FORECAST-driven only (D-F1-5B-2); got "' + str(r.demandDriver) + '"'));
}
var fw = resolveForecastWeight(r, M, recvIssues, key);
var win = resolveWindow(r, M, planningCycle, recvIssues, key);




var destNode = isObj(r.destination) && nonEmpty(r.destination.destinationType) ? r.destination : null;
var destType = destNode ? str(destNode.destinationType).toUpperCase() : (nonEmpty(r.destinationType) ? str(r.destinationType).toUpperCase() : 'WAREHOUSE');

var ctx;
if (destType === 'MARKETPLACE') {
var md = validateMarketplaceDestination(r, destNode, mktById, recvIssues, key);
if (recvIssues.length) { recvIssues.forEach(function (x) { issues.push(x); }); continue; }
ctx = {
contextId: [str(r.company), str(r.country), str(r.marketplace), key, md.refId, planningCycle, win.windowCode].join('|'),
company: str(r.company), country: str(r.country), marketplace: str(r.marketplace), sku: str(r.sku), siteSku: str(r.siteSku),
recommendationType: recommendationType,
destinationType: 'MARKETPLACE', destinationRefId: md.refId, marketplaceId: md.marketplaceId,
destinationWarehouseId: null, destinationWarehouseCode: null, destinationWarehouseType: null,
planningCycle: planningCycle,
windowCode: win.windowCode, windowStartDate: win.windowStartDate, windowEndDate: win.windowEndDate, requiredByDate: win.requiredByDate,
demandDriver: demandDriver, forecastWeightAnchor: ymStr(M), forecastWeightMonths: fw.months, forecastShareQty: fw.qty,
issues: []
};
} else {
var dest = validateDestination(r, whById, recvIssues, key, destNode ? destNode.warehouseId : null);
if (recvIssues.length) { recvIssues.forEach(function (x) { issues.push(x); }); continue; }
ctx = {
contextId: [str(r.company), str(r.country), str(r.marketplace), key, dest.id, planningCycle, win.windowCode].join('|'),
company: str(r.company), country: str(r.country), marketplace: str(r.marketplace), sku: str(r.sku), siteSku: str(r.siteSku),
recommendationType: recommendationType,
destinationWarehouseId: dest.id, destinationWarehouseCode: dest.code, destinationWarehouseType: dest.type,
planningCycle: planningCycle,
windowCode: win.windowCode, windowStartDate: win.windowStartDate, windowEndDate: win.windowEndDate, requiredByDate: win.requiredByDate,
demandDriver: demandDriver, forecastWeightAnchor: ymStr(M), forecastWeightMonths: fw.months, forecastShareQty: fw.qty,
issues: []
};
}
var ser = JSON.stringify(ctx);
if (has(byContextId, ctx.contextId)) {
if (byContextId[ctx.contextId] !== ser) issues.push(issue('PLANNING_CONTEXT_NOT_READY', ctx.contextId, 'conflicting planning contexts share one identity with differing facts'));
continue;
}
byContextId[ctx.contextId] = ser;
contexts.push(ctx);
}

contexts.sort(function (a, b) { return cmpStr(a.contextId, b.contextId); });
issues.sort(function (a, b) { return cmpStr(a.code, b.code) || cmpStr(a.ref, b.ref); });
var ready = issues.length === 0 && contexts.length > 0;
return { ready: ready, contexts: contexts, issues: issues, meta: { deterministic: true } };
}






function toAllocationFactReceiver(ctx, extras) {
aType(isObj(ctx), 'toAllocationFactReceiver: ctx required');
extras = extras || {};
var r = {
receiverKey: str(extras.receiverKey) || ctx.contextId,
demandRef: str(extras.demandRef) || ctx.contextId,
demandKey: extras.demandKey,
masterSku: ctx.sku, siteSku: ctx.siteSku, marketplace: ctx.marketplace, company: ctx.company, country: ctx.country,
fulfillmentModel: extras.fulfillmentModel,
demandDriver: 'FORECAST_DRIVEN',
forecastBasis: {
forecastMonth1: extras.forecastMonth1, forecastMonth2: extras.forecastMonth2, targetRules: extras.targetRules,
specialEventDemand: extras.specialEventDemand,
forecastShareQty: ctx.forecastShareQty
},
allocationPriority: extras.allocationPriority, unitsPerCarton: extras.unitsPerCarton,
destinationWarehouseId: ctx.destinationWarehouseId, windowCode: ctx.windowCode, requiredByDate: ctx.requiredByDate
};
['demand', 'destinationCurrentStock', 'timelyQualifiedIncoming', 'timelyApprovedCommittedSupply'].forEach(function (k) { if (has(extras, k)) r[k] = extras[k]; });
return r;
}

return {
resolveRecommendationPlanningContext: resolveRecommendationPlanningContext,
toAllocationFactReceiver: toAllocationFactReceiver,

_forecastWeightMonths: function (calcMonth) { var m = parseYM(calcMonth); return m ? [addMonths(m, 1), addMonths(m, 2), addMonths(m, 3), addMonths(m, 4)].map(ymStr) : null; }
};
});
__kmRegister("supply-planning-planning-context", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;


















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.demandAllocation = api; }
})(this, function () {
'use strict';

var BASIS = 10000;
var DEST_TYPES = { MARKETPLACE: 1, WAREHOUSE: 1 };

function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function eqv(a, b) { return s(a).toLowerCase() === s(b).toLowerCase(); }
function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function cmpStr(a, b) { a = s(a); b = s(b); return a < b ? -1 : a > b ? 1 : 0; }
function truthy(v) { if (v === true) return true; var t = s(v).toLowerCase(); return t === 'true' || t === '1' || t === 'yes' || t === 'y'; }
function issue(code, message, field, source) { return { code: code, message: message, field: field === undefined ? null : field, source: source === undefined ? null : source }; }

function ratioToBp(v) {
if (v === '' || v === null || v === undefined) return null;
if (typeof v !== 'number' && typeof v !== 'string') return null;
var n = Number(v);
if (!isFinite(n) || n < 0 || n > 1) return null;
return Math.round(n * BASIS);
}

function qtyOrNull(v) {
if (v === '' || v === null || v === undefined) return null;
var n = Number(v);
if (!isFinite(n) || n < 0) return null;
return Math.round(n);
}





function buildDestinationDTO(input) {
input = input || {};
var company = s(input.company), country = s(input.country), marketplace = s(input.marketplace);
var marketplaceId = s(input.marketplaceId) || null;

var type = s(input.destinationType).toUpperCase();
var legacyWh = s(input.destinationWarehouseId);
if (!type) type = legacyWh ? 'WAREHOUSE' : (input.warehouseId ? 'WAREHOUSE' : 'MARKETPLACE');
if (DEST_TYPES[type] !== 1) type = 'MARKETPLACE';

if (type === 'WAREHOUSE') {
var whId = s(input.warehouseId) || legacyWh;
return {
destinationType: 'WAREHOUSE', destinationRefId: whId || null,
destinationCode: s(input.warehouseCode) || null,
destinationLabel: s(input.warehouseName) || s(input.warehouseCode) || whId || null,
company: company, country: country, marketplace: marketplace,
warehouseId: whId || null, marketplaceId: marketplaceId
};
}

var refId = marketplaceId || s(input.marketplaceRefId) || marketplace || null;
return {
destinationType: 'MARKETPLACE', destinationRefId: refId,
destinationCode: s(input.marketplaceCode) || null,
destinationLabel: s(input.marketplaceDisplayName) || marketplace || refId || null,
company: company, country: country, marketplace: marketplace,
warehouseId: null, marketplaceId: marketplaceId
};
}
function destinationKey(dto) {
dto = dto || {};
return [s(dto.destinationType), s(dto.company), s(dto.country), s(dto.marketplace), s(dto.destinationRefId)].join('||');
}







function _norm(v) { return s(v).toLowerCase(); }
function _isActiveStatus(st) { var t = _norm(st); return t === 'active' || st === true || t === 'true'; }
function _rowsFrom(authorities, arrKey, mapKey) {
var a = authorities || {};
if (Array.isArray(a[arrKey])) return a[arrKey].slice();
if (isObj(a[mapKey])) { var out = []; for (var k in a[mapKey]) if (Object.prototype.hasOwnProperty.call(a[mapKey], k)) out.push(a[mapKey][k]); return out; }
return [];
}
function _mktRow(r) {
r = r || {};
return {
marketplaceId: s(r.marketplaceId || r.marketplace_id), company: s(r.company), country: s(r.country),
marketplace: s(r.marketplace), status: (r.status === undefined ? r.is_active : r.status),
code: s(r.marketplace || r.marketplaceAlias || r.marketplace_alias),
label: s(r.marketplaceDisplayName || r.marketplace_display_name) || s(r.marketplace)
};
}
function _whRow(r) {
r = r || {};
return {
warehouseId: s(r.warehouseId || r.warehouse_id), company: s(r.company), country: s(r.country),
isActive: (r.is_active !== undefined ? r.is_active : r.isActive),
code: s(r.warehouse_code || r.warehouseCode), name: s(r.warehouse_name || r.warehouseName)
};
}
function normalizeRecommendationDestination(input, authorities) {
input = input || {}; authorities = authorities || {};
var issues = [];
function fail(code, message, field) { issues.push(issue(code, message, field === undefined ? null : field)); return { ok: false, destination: null, issues: issues }; }
var company = s(input.company), country = s(input.country), marketplace = s(input.marketplace);
var type = s(input.destinationType).toUpperCase();

var legacyWh = s(input.warehouseId) || s(input.destinationWarehouseId);
if (!type) type = legacyWh ? 'WAREHOUSE' : (input.marketplaceId || input.destinationRefId ? 'MARKETPLACE' : '');
if (DEST_TYPES[type] !== 1) return fail('DESTINATION_TYPE_UNSUPPORTED', 'unsupported destinationType: "' + s(input.destinationType) + '"', 'destinationType');

if (type === 'MARKETPLACE') {
var rows = _rowsFrom(authorities, 'marketplaces', 'marketplacesById').map(_mktRow);
var wantId = s(input.marketplaceId) || s(input.destinationRefId);
var row = null;
if (wantId) {
var byId = rows.filter(function (r) { return r.marketplaceId === wantId; });
if (byId.length === 0) return fail('MARKETPLACE_DESTINATION_NOT_FOUND', 'no canonical marketplaces row for marketplace_id: ' + wantId, 'marketplaceId');
if (byId.length > 1) return fail('MARKETPLACE_DESTINATION_CONFLICT', 'multiple marketplaces rows for marketplace_id: ' + wantId, 'marketplaceId');
row = byId[0];
if ((company && row.company && !eqv(row.company, company)) || (country && row.country && !eqv(row.country, country)) || (marketplace && row.marketplace && !eqv(row.marketplace, marketplace))) {
return fail('MARKETPLACE_DESTINATION_SCOPE_MISMATCH', 'marketplace_id ' + wantId + ' scope (' + [row.company, row.country, row.marketplace].join('/') + ') ≠ requested (' + [company, country, marketplace].join('/') + ')', 'marketplaceId');
}
if (!_isActiveStatus(row.status)) return fail('MARKETPLACE_DESTINATION_INACTIVE', 'marketplace destination inactive: ' + wantId, 'marketplaceId');
} else {

if (!company || !country || !marketplace) return fail('MARKETPLACE_DESTINATION_NOT_FOUND', 'company/country/marketplace required to resolve a marketplace destination (no marketplace_id supplied)', 'marketplace');
var scoped = rows.filter(function (r) { return eqv(r.company, company) && eqv(r.country, country) && eqv(r.marketplace, marketplace); });
if (scoped.length === 0) return fail('MARKETPLACE_DESTINATION_NOT_FOUND', 'no marketplaces row for scope: ' + [company, country, marketplace].join('/'), 'marketplace');
var active = scoped.filter(function (r) { return _isActiveStatus(r.status); });
if (active.length === 0) return fail('MARKETPLACE_DESTINATION_INACTIVE', 'marketplace destination inactive for scope: ' + [company, country, marketplace].join('/'), 'marketplace');
if (active.length > 1) return fail('MARKETPLACE_DESTINATION_CONFLICT', 'ambiguous marketplace destination for scope: ' + [company, country, marketplace].join('/'), 'marketplace');
row = active[0];
}
var mDest = {
destinationType: 'MARKETPLACE', destinationRefId: row.marketplaceId,
destinationCode: row.code || marketplace || null, destinationLabel: row.label || marketplace || row.marketplaceId,
company: company || row.company, country: country || row.country, marketplace: marketplace || row.marketplace,
marketplaceId: row.marketplaceId, warehouseId: null
};
mDest.destinationKey = destinationKey(mDest);
return { ok: true, destination: mDest, issues: issues };
}


var whRows = _rowsFrom(authorities, 'warehouses', 'warehousesById').map(_whRow);
var whId = legacyWh || s(input.destinationRefId);
if (!whId) return fail('DESTINATION_WAREHOUSE_INVALID', 'destination warehouse_id is required (never defaulted)', 'warehouseId');
var whMatches = whRows.filter(function (r) { return r.warehouseId === whId; });
if (whMatches.length === 0) return fail('DESTINATION_WAREHOUSE_INVALID', 'warehouse_id not a canonical warehouse: ' + whId, 'warehouseId');
if (whMatches.length > 1) return fail('DESTINATION_WAREHOUSE_INVALID', 'duplicate canonical warehouse_id: ' + whId, 'warehouseId');
var w = whMatches[0];
if (!truthy(w.isActive)) return fail('DESTINATION_WAREHOUSE_INACTIVE', 'destination warehouse inactive: ' + whId, 'warehouseId');
if (company && w.company && !eqv(w.company, company)) return fail('DESTINATION_COMPANY_MISMATCH', 'destination warehouse company (' + w.company + ') ≠ requested (' + company + ') — no cross-company borrowing', 'warehouseId');
var wDest = {
destinationType: 'WAREHOUSE', destinationRefId: whId,
destinationCode: w.code || null, destinationLabel: w.name || w.code || whId,
company: company || w.company, country: country || w.country, marketplace: marketplace,
marketplaceId: s(input.marketplaceId) || null, warehouseId: whId
};
wDest.destinationKey = destinationKey(wDest);
return { ok: true, destination: wDest, issues: issues };
}





function readActiveAllocationRules(rows, scope, effectiveDate) {
scope = scope || {};
var ed = s(effectiveDate);
var out = [];
(rows || []).forEach(function (r) {
if (!isObj(r)) return;
if (scope.company && !eqv(r.company, scope.company)) return;
if (scope.country && !eqv(r.country, scope.country)) return;
if (scope.marketplace && !eqv(r.marketplace, scope.marketplace)) return;

var st = s(r.status).toLowerCase();
if (!(st === 'active' || r.status === true)) return;

if (ed) {
var from = s(r.effective_from), to = s(r.effective_to);
if (from && ed < from) return;
if (to && ed > to) return;
}
out.push(r);
});
return out;
}



function validateAllocationRules(rules, scope, warehousesById) {
scope = scope || {}; warehousesById = warehousesById || {};
var issues = [];
var active = Array.isArray(rules) ? rules.slice() : [];
if (active.length === 0) {
issues.push(issue('DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'no active demand-allocation rule for scope', null, 'replenishment_demand_allocation_rules'));
return { ok: false, warehouses: [], forecastBpTotal: 0, salesBpTotal: 0, issues: issues };
}
var seenWh = {}, warehouses = [], fBpTotal = 0, sBpTotal = 0;

active.sort(function (a, b) { return cmpStr(a.destination_warehouse_id, b.destination_warehouse_id); });
active.forEach(function (r) {
var whId = s(r.destination_warehouse_id);
if (!whId) { issues.push(issue('DESTINATION_WAREHOUSE_INVALID', 'rule missing destination_warehouse_id', 'destination_warehouse_id')); return; }
if (seenWh[whId]) { issues.push(issue('DEMAND_ALLOCATION_DESTINATION_CONFLICT', 'duplicate active destination warehouse: ' + whId, 'destination_warehouse_id')); return; }
seenWh[whId] = 1;
var w = warehousesById[whId];
if (!w) { issues.push(issue('DESTINATION_WAREHOUSE_INVALID', 'destination_warehouse_id not a canonical warehouse: ' + whId, 'destination_warehouse_id', 'warehouses')); return; }
if (!truthy(w.is_active !== undefined ? w.is_active : w.isActive)) { issues.push(issue('DESTINATION_WAREHOUSE_INVALID', 'destination warehouse inactive: ' + whId, 'destination_warehouse_id', 'warehouses')); return; }
if (scope.company && s(w.company) && !eqv(w.company, scope.company)) { issues.push(issue('DESTINATION_WAREHOUSE_INVALID', 'cross-company destination warehouse: ' + whId + ' (' + s(w.company) + ' ≠ ' + s(scope.company) + ')', 'destination_warehouse_id', 'warehouses')); return; }
var fBp = ratioToBp(r.forecast_allocation_ratio);
var sBp = ratioToBp(r.sales_allocation_ratio);
if (fBp === null) { issues.push(issue('DEMAND_ALLOCATION_RATIO_INVALID', 'forecast_allocation_ratio not a number in [0,1]: ' + whId, 'forecast_allocation_ratio')); return; }
if (sBp === null) { issues.push(issue('DEMAND_ALLOCATION_RATIO_INVALID', 'sales_allocation_ratio not a number in [0,1]: ' + whId, 'sales_allocation_ratio')); return; }
fBpTotal += fBp; sBpTotal += sBp;
warehouses.push({ warehouseId: whId, forecastBp: fBp, salesBp: sBp });
});


var byWh = {}; (active).forEach(function (r) { var k = s(r.destination_warehouse_id); if (!k) return; (byWh[k] = byWh[k] || []).push(r); });
Object.keys(byWh).forEach(function (k) {
if (byWh[k].length > 1) {
var periods = {};
byWh[k].forEach(function (r) { periods[s(r.effective_from) + '..' + s(r.effective_to)] = 1; });
if (Object.keys(periods).length > 1) issues.push(issue('DEMAND_ALLOCATION_PERIOD_CONFLICT', 'overlapping effective periods for warehouse ' + k, 'effective_from', 'replenishment_demand_allocation_rules'));
}
});
if (warehouses.length && fBpTotal !== BASIS) issues.push(issue('DEMAND_ALLOCATION_RATIO_TOTAL_INVALID', 'forecast ratios sum to ' + (fBpTotal / 100) + '% (must be exactly 100%)', 'forecast_allocation_ratio'));
if (warehouses.length && sBpTotal !== BASIS) issues.push(issue('DEMAND_ALLOCATION_RATIO_TOTAL_INVALID', 'sales ratios sum to ' + (sBpTotal / 100) + '% (must be exactly 100%)', 'sales_allocation_ratio'));
var ok = issues.length === 0 && warehouses.length > 0;
return { ok: ok, warehouses: warehouses, forecastBpTotal: fBpTotal, salesBpTotal: sBpTotal, issues: issues };
}




function allocateByBasisPoints(qty, weights) {
var q = qtyOrNull(qty);
if (q === null) return null;
weights = (weights || []).map(function (w) { return { key: s(w.key), bp: w.bp | 0 }; });
var byKey = {}, base = 0;
var ranked = weights.map(function (w) {
var prod = q * w.bp;
var b = Math.floor(prod / BASIS);
byKey[w.key] = b; base += b;
return { key: w.key, frac: prod % BASIS };
});
var leftover = q - base;
ranked.sort(function (a, b) { return (b.frac - a.frac) || cmpStr(a.key, b.key); });
for (var i = 0; i < ranked.length && leftover > 0; i++) { byKey[ranked[i].key] += 1; leftover -= 1; }
return { byKey: byKey, total: q };
}




function allocateMarketplaceDemand(qty, ruleset, kind) {
if (!ruleset || ruleset.ok !== true) return { ready: false, byKey: null, issues: (ruleset && ruleset.issues) || [issue('DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'ruleset not valid', null)] };
var bpKey = (s(kind).toLowerCase() === 'sales') ? 'salesBp' : 'forecastBp';
var weights = ruleset.warehouses.map(function (w) { return { key: w.warehouseId, bp: w[bpKey] }; });
var res = allocateByBasisPoints(qty, weights);
if (res === null) return { ready: false, byKey: null, missing: true, issues: [] };
return { ready: true, byKey: res.byKey, total: res.total, issues: [] };
}



function passthroughWarehouseDemand(warehouseId, qty) {
var whId = s(warehouseId); var q = qtyOrNull(qty);
var byKey = {}; if (whId) byKey[whId] = q;
return { ready: !!whId, byKey: byKey, split: false };
}



function buildWarehouseDemandFacts(input) {
input = input || {};
var ruleset = input.ruleset;
if (!ruleset || ruleset.ok !== true) return { ready: false, perWarehouse: [], issues: (ruleset && ruleset.issues) || [issue('DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'ruleset not valid', null)] };
var fc = allocateMarketplaceDemand(input.marketplaceForecastQty, ruleset, 'forecast');
var sa = allocateMarketplaceDemand(input.marketplaceSalesQty, ruleset, 'sales');
var perWarehouse = ruleset.warehouses.map(function (w) {
return {
warehouseId: w.warehouseId,
allocatedForecastQty: (fc.byKey && Object.prototype.hasOwnProperty.call(fc.byKey, w.warehouseId)) ? fc.byKey[w.warehouseId] : null,
allocatedSalesQty: (sa.byKey && Object.prototype.hasOwnProperty.call(sa.byKey, w.warehouseId)) ? sa.byKey[w.warehouseId] : null,
forecastBp: w.forecastBp, salesBp: w.salesBp
};
});
return { ready: true, perWarehouse: perWarehouse, issues: [] };
}


function allocationRuleId(company, country, marketplace, warehouseId) {
return ['RDAR', s(company), s(country), s(marketplace), s(warehouseId)].join('-');
}

function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }


function _toRuleRow(rec) {
if (!isObj(rec)) return {};
if (has(rec, 'destination_warehouse_id') || has(rec, 'forecast_allocation_ratio')) return rec;
return {
allocation_rule_id: rec.allocationRuleId, company: rec.company, country: rec.country, marketplace: rec.marketplace,
destination_warehouse_id: rec.destinationWarehouseId,
forecast_allocation_ratio: rec.forecastAllocationRatio, sales_allocation_ratio: rec.salesAllocationRatio,
status: rec.status, effective_from: rec.effectiveFrom, effective_to: rec.effectiveTo
};
}







function resolveScopeWarehouseDemandFacts(input) {
input = input || {};
var scope = input.scope || {};
var whById = input.warehousesById || {};
var rows = (Array.isArray(input.allocationRules) ? input.allocationRules : []).map(_toRuleRow);
var active = readActiveAllocationRules(rows, scope, input.effectiveDate);
var ruleset = validateAllocationRules(active, scope, whById);
if (!ruleset.ok) return { ready: false, scope: scope, warehouses: [], issues: ruleset.issues };
var facts = buildWarehouseDemandFacts({ ruleset: ruleset, marketplaceForecastQty: input.marketplaceForecastQty, marketplaceSalesQty: input.marketplaceSalesQty });
var warehouses = facts.perWarehouse.map(function (w) {
var wh = whById[w.warehouseId] || {};
return {
warehouseId: w.warehouseId,
destination: buildDestinationDTO({
destinationType: 'WAREHOUSE', company: scope.company, country: scope.country, marketplace: scope.marketplace,
marketplaceId: scope.marketplaceId, warehouseId: w.warehouseId,
warehouseCode: s(wh.warehouse_code || wh.warehouseCode), warehouseName: s(wh.warehouse_name || wh.warehouseName)
}),
allocatedForecastQty: w.allocatedForecastQty,
allocatedSalesQty: w.allocatedSalesQty
};
});
return { ready: true, scope: scope, warehouses: warehouses, issues: [] };
}

return {
BASIS: BASIS,
buildDestinationDTO: buildDestinationDTO,
normalizeRecommendationDestination: normalizeRecommendationDestination,
destinationKey: destinationKey,
readActiveAllocationRules: readActiveAllocationRules,
validateAllocationRules: validateAllocationRules,
allocateByBasisPoints: allocateByBasisPoints,
allocateMarketplaceDemand: allocateMarketplaceDemand,
passthroughWarehouseDemand: passthroughWarehouseDemand,
buildWarehouseDemandFacts: buildWarehouseDemandFacts,
resolveScopeWarehouseDemandFacts: resolveScopeWarehouseDemandFacts,
allocationRuleId: allocationRuleId,

_ratioToBp: ratioToBp
};
});
__kmRegister("supply-planning-demand-allocation", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;







































(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-allocations.js') : (root.KMALLOC || (root.KM && root.KM.allocations)),
req ? req('./supply-planning-country-identity.js') : (root.KMCID || (root.KM && root.KM.countryIdentity))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.marketplaceSupplyAllocation = api; }
if (typeof root !== 'undefined' && root) { root.KMMSA = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ALLOC, CID) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function qty(v) { var n = Number(v); return (typeof v === 'number' && isFinite(n) && n >= 0) ? n : null; }
function canonCountry(v) { return (CID && typeof CID.canonicalCountryCode === 'function') ? CID.canonicalCountryCode(v) : s(v).toUpperCase(); }


function receiverKeyOf(r) { return [s(r.company), canonCountry(r.country), s(r.marketplace), s(r.sku || r.masterSku)].join('||'); }








function allocateMarketplaceReceiverSupply(input) {
var root = input || {};
var issues = [];
var company = s(root.company);
var masterSku = s(root.masterSku);
if (!company) return blocked('COMPANY_REQUIRED', 'input.company required');
if (!masterSku) return blocked('MASTER_SKU_REQUIRED', 'input.masterSku required');
var receivers = Array.isArray(root.receivers) ? root.receivers : [];


if (!receivers.length) return { ready: true, blocked: false, company: company, masterSku: masterSku, receiverCount: 0, byReceiver: {}, overseas: null, factory: null, issues: [], VERSION: 'kmmsa-fm5r2a-1' };


for (var ci = 0; ci < receivers.length; ci++) {
if (s(receivers[ci].company) !== company) return blocked('CROSS_COMPANY_POOL_FORBIDDEN', 'receiver company mismatch: ' + s(receivers[ci].company) + ' != ' + company);
}


var norm = [], keySeen = {};
for (var i = 0; i < receivers.length; i++) {
var r = receivers[i] || {};
var d = qty(r.demandQty);
if (d === null) return blocked('RECEIVER_DEMAND_INVALID', 'demandQty missing/invalid for ' + s(r.marketplace));














var pr = qty(r.allocationPriority);
if (pr === null) {
return blocked('RECEIVER_PRIORITY_UNRESOLVED',
'allocationPriority missing, blank, negative or non-numeric for ' +
[s(r.company) || company, canonCountry(r.country), s(r.marketplace), s(r.sku) || masterSku].join('/') +
' — set a non-negative allocation_priority on the marketplace row; no value is assumed');
}
var key = receiverKeyOf(Object.assign({ masterSku: masterSku }, r));
if (keySeen[key]) return blocked('RECEIVER_IDENTITY_CONFLICT', 'duplicate receiver ' + key);
keySeen[key] = 1;
norm.push({ key: key, company: company, country: s(r.country), marketplace: s(r.marketplace), sku: s(r.sku) || masterSku,
demandQty: d, allocationPriority: pr, requiredByDate: s(r.requiredByDate),
survivalNeedQty: (qty(r.survivalNeedQty) === null ? 0 : qty(r.survivalNeedQty)),
demandWeight: (qty(r.demandWeight) === null ? d : qty(r.demandWeight)),
eligiblePoolTypes: (Array.isArray(r.eligiblePoolTypes) && r.eligiblePoolTypes.length) ? r.eligiblePoolTypes.slice() : ['THREE_PL', 'FBA'] });
}

var byReceiver = {};
norm.forEach(function (r) { byReceiver[r.key] = { allocatedOverseasQty: 0, allocatedFactoryQty: 0 }; });
var overseasPools = Array.isArray(root.overseasPools) ? root.overseasPools : [];
var factoryPools = Array.isArray(root.factoryPools) ? root.factoryPools : [];
var eligibleFactoryIds = Array.isArray(root.eligibleFactoryWarehouseIds) ? root.eligibleFactoryWarehouseIds.map(s).filter(Boolean) : [];
if (factoryPools.length && !eligibleFactoryIds.length) return blocked('FACTORY_ELIGIBILITY_UNRESOLVED', 'eligibleFactoryWarehouseIds required for factory allocation');
var overseasResult = null, factoryResult = null;
var singleReceiver = (norm.length === 1);




if (singleReceiver) {
var r0 = norm[0];
var ov = 0; overseasPools.forEach(function (p) { if (r0.eligiblePoolTypes.indexOf(s(p.poolType)) !== -1) ov += (qty(p.effectiveSupplyQty) || 0); });
var fc = 0; factoryPools.forEach(function (p) { if (eligibleFactoryIds.indexOf(s(p.warehouseId)) !== -1) fc += (qty(p.effectiveSupplyQty) || 0); });
byReceiver[r0.key] = { allocatedOverseasQty: ov, allocatedFactoryQty: fc };
return { ready: true, blocked: false, company: company, masterSku: masterSku, receiverCount: 1, byReceiver: byReceiver,
overseas: null, factory: null, singleReceiver: true, issues: issues, VERSION: 'kmmsa-fm5r2a-1' };
}



if (overseasPools.length) {
var ovReceivers = norm.map(function (r) {
return { receiverKey: r.key, demandKey: r.key, marketplace: r.marketplace || r.key, destinationWarehouseId: r.key ,
fulfillmentModel: 'platform_fulfilled', demandQty: r.demandQty, survivalNeedQty: Math.min(r.survivalNeedQty, r.demandQty),
allocationPriority: r.allocationPriority, demandWeight: r.demandWeight, eligiblePoolTypes: r.eligiblePoolTypes };
});
try {
overseasResult = ALLOC.allocateOverseasSharedPool({ company: company, country: canonCountry(norm[0].country) || 'NA', masterSku: masterSku,
supplyPools: overseasPools.map(function (p, idx) { return { poolKey: s(p.poolKey) || ('OV' + idx), poolType: s(p.poolType), warehouseId: s(p.warehouseId) || ('OVW' + idx), effectiveSupplyQty: qty(p.effectiveSupplyQty) || 0 }; }),
receivers: ovReceivers });
} catch (e) { return blocked('OVERSEAS_ALLOCATION_INPUT_INVALID', e && e.message ? String(e.message) : String(e)); }
(overseasResult.allocations || []).forEach(function (a) { if (byReceiver[a.demandKey]) byReceiver[a.demandKey].allocatedOverseasQty += (a.allocatedQty || 0); });
}
if (factoryPools.length) {
var factoryDemands = [];
for (var fi = 0; fi < norm.length; fi++) {
var fr = norm[fi];
if (!fr.requiredByDate) return blocked('MISSING_REQUIRED_BY_DATE', 'requiredByDate required for factory FIFO on ' + fr.marketplace);
factoryDemands.push({ demandKey: fr.key, company: company, marketplace: fr.marketplace || fr.key, destinationWarehouseId: fr.key ,
requiredByDate: fr.requiredByDate, allocationPriority: fr.allocationPriority, demandQty: fr.demandQty, eligibleFactoryWarehouseIds: eligibleFactoryIds.slice() });
}
try {
factoryResult = ALLOC.allocateFactoryDeterministic({ masterSku: masterSku,
factoryPools: factoryPools.map(function (p, idx) { return { poolKey: s(p.poolKey) || ('FC' + idx), poolType: 'FACTORY', warehouseId: s(p.warehouseId) || ('FCW' + idx), effectiveSupplyQty: qty(p.effectiveSupplyQty) || 0 }; }),
demands: factoryDemands });
} catch (e2) { return blocked('FACTORY_ALLOCATION_INPUT_INVALID', e2 && e2.message ? String(e2.message) : String(e2)); }
(factoryResult.allocations || []).forEach(function (a) { if (byReceiver[a.demandKey]) byReceiver[a.demandKey].allocatedFactoryQty += (a.allocatedQty || 0); });
}

return { ready: true, company: company, masterSku: masterSku, receiverCount: norm.length, byReceiver: byReceiver,
overseas: overseasResult, factory: factoryResult, issues: issues, blocked: false, VERSION: 'kmmsa-fm5r2a-1' };

function blocked(code, message) {
return { ready: false, blocked: true, byReceiver: {}, overseas: null, factory: null, issues: [{ code: code, message: message || code }], VERSION: 'kmmsa-fm5r2a-1' };
}
}

return { allocateMarketplaceReceiverSupply: allocateMarketplaceReceiverSupply, receiverKeyOf: receiverKeyOf, VERSION: 'kmmsa-fm5r2a-1' };
});
__kmRegister("supply-planning-marketplace-supply-allocation", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;


























(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-planning-context.js') : (root.KMPCX || (root.KM && root.KM.planningContext)),
req ? req('./supply-planning-allocation-facts.js') : (root.KMAF || (root.KM && root.KM.allocationFacts)),
req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations)),
req ? req('./supply-planning-country-identity.js') : (root.KMCID || (root.KM && root.KM.countryIdentity))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.productionAssembly = api; }
})(this, function (KMPCX, KMAF, CALC, CID) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nonEmpty(v) { return str(v).length > 0; }
function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }













var MKT_SEP = String.fromCharCode(124);
var MKT_ESC = String.fromCharCode(92);
function canonCountry(v) {
return (CID && typeof CID.canonicalCountryCode === 'function') ? CID.canonicalCountryCode(v) : str(v).toUpperCase();
}
function sameCountry(a, b) { return canonCountry(a) === canonCountry(b); }
function mktIdentityKey(company, country, marketplace) {
return [str(company), canonCountry(country), str(marketplace)].map(function (v) {
return str(v).split(MKT_ESC).join(MKT_ESC + MKT_ESC).split(MKT_SEP).join(MKT_ESC + MKT_SEP);
}).join(MKT_SEP);
}
function cmpStr(a, b) { a = str(a); b = str(b); return a < b ? -1 : a > b ? 1 : 0; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function issue(code, ref, message) { return { code: code, ref: ref === undefined ? null : ref, message: message, details: {} }; }
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseYM(s) { var m = /^(\d{4})-(\d{2})$/.exec(str(s)); if (!m) return null; var y = +m[1], mo = +m[2]; if (mo < 1 || mo > 12) return null; return { y: y, mo: mo }; }


function toRowObjects(snap) {
if (!isObj(snap) || !Array.isArray(snap.headers) || !Array.isArray(snap.rows)) return [];
var headers = snap.headers.map(function (h) { return str(h); });
return snap.rows.map(function (r) { var o = {}; for (var c = 0; c < headers.length; c++) o[headers[c]] = r[c]; return o; });
}
function finiteNonNeg(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return (isFinite(n) && n >= 0) ? n : null; }


function inScope(row, scope) {
return str(row.company) === scope.company && sameCountry(row.country, scope.country) &&
str(row.marketplace) === scope.marketplace && (scope.sku === null || str(row.sku) === scope.sku);
}


function buildRegularForecastByMonth(fcRows, scope, sku, monthsYm, recvIssues, key) {
var map = {}, forecastId = null;
monthsYm.forEach(function (ym) {
var p = parseYM(ym), abbrev = MONTHS[p.mo - 1];
var matches = fcRows.filter(function (r) {
return str(r.company) === scope.company && sameCountry(r.country, scope.country) && str(r.marketplace) === scope.marketplace &&
str(r.sku) === sku && Number(r.year) === p.y;
});
if (!matches.length) return;
var vals = {}; matches.forEach(function (r) { var v = r[abbrev]; if (v !== '' && v !== null && v !== undefined) vals[String(v)] = 1; if (forecastId === null && nonEmpty(r.forecast_id)) forecastId = str(r.forecast_id); });
var distinct = Object.keys(vals);
if (distinct.length > 1) { recvIssues.push(issue('FORECAST_SOURCE_CONFLICT', key + '|' + ym, 'conflicting Regular FC values for ' + ym + ': ' + distinct.join(','))); return; }
if (distinct.length === 1) map[ym] = Number(distinct[0]);
});
return { map: map, forecastId: forecastId };
}

function validateRequest(request, issues) {
if (!isObj(request)) { issues.push(issue('INVALID_RECOMMENDATION_ASSEMBLY_REQUEST', null, 'request must be an object')); return null; }
var recType = nonEmpty(request.recommendationType) ? str(request.recommendationType) : 'WEEKLY_SHIPPING';
var scope = { company: str(request.company), country: str(request.country), marketplace: str(request.marketplace), sku: nonEmpty(request.sku) ? str(request.sku) : null };
if (!nonEmpty(scope.company) || !nonEmpty(scope.country) || !nonEmpty(scope.marketplace)) issues.push(issue('INVALID_RECOMMENDATION_ASSEMBLY_REQUEST', null, 'company/country/marketplace are mandatory (no implicit first company/marketplace)'));
if (!nonEmpty(request.destinationWarehouseId)) issues.push(issue('MISSING_DESTINATION_WAREHOUSE', null, 'destinationWarehouseId is mandatory Phase-1 (no automatic destination inference)'));
if (!parseYM(request.calculationMonth)) issues.push(issue('MISSING_CALCULATION_MONTH', null, 'calculationMonth (injected "YYYY-MM") is mandatory (no browser/current-date inference)'));
if (!nonEmpty(request.planningCycle)) issues.push(issue('MISSING_PLANNING_CYCLE', null, 'planningCycle is mandatory'));
if (has(request, 'demandDriver') && nonEmpty(request.demandDriver) && str(request.demandDriver).toUpperCase() !== 'FORECAST') issues.push(issue('UNSUPPORTED_PHASE1_DEMAND_DRIVER', null, 'Phase-1 demandDriver is FORECAST only'));



var fcOverride = has(request, 'regularForecastByMonthOverride') && isObj(request.regularForecastByMonthOverride) ? request.regularForecastByMonthOverride : null;
return issues.length ? null : { recommendationType: recType, scope: scope, destinationWarehouseId: str(request.destinationWarehouseId), calculationMonth: str(request.calculationMonth), planningCycle: str(request.planningCycle), sourceDataAsOf: nonEmpty(request.sourceDataAsOf) ? str(request.sourceDataAsOf) : null, formulaVersion: nonEmpty(request.formulaVersion) ? str(request.formulaVersion) : null, regularForecastByMonthOverride: fcOverride };
}

function assembleProductionRecommendationFacts(rawSnapshots, request, options) {
aType(isObj(rawSnapshots), 'assembleProductionRecommendationFacts: rawSnapshots must be an object');
options = options || {};
var issues = [];
var meta = { calculationMonth: null, planningCycle: null, sourceDataAsOf: null, formulaVersion: null, deterministic: true };
var vr = validateRequest(request, issues);
if (!vr) return blocked(issues, meta);
meta.calculationMonth = vr.calculationMonth; meta.planningCycle = vr.planningCycle; meta.sourceDataAsOf = vr.sourceDataAsOf; meta.formulaVersion = vr.formulaVersion;

var snaps = isObj(rawSnapshots.snapshots) ? rawSnapshots.snapshots : rawSnapshots;
var mskRows = toRowObjects(snaps.marketplaceSkus);
var skuRows = toRowObjects(snaps.skuDetails);
var whRows = toRowObjects(snaps.warehouses);
var mktRows = toRowObjects(snaps.marketplaces);
var fcRows = toRowObjects(snaps.fcRegularForecast);
var evtRows = toRowObjects(snaps.fcSpecialEvents);

var upcBySku = {}; skuRows.forEach(function (r) { if (nonEmpty(r.sku)) upcBySku[str(r.sku)] = r.units_per_carton; });









var prByMktKey = {}, prKeyConflict = {};
mktRows.forEach(function (r) {
if (!nonEmpty(r.marketplace)) return;
if (!has(r, 'allocation_priority')) return;
var k = mktIdentityKey(r.company, r.country, r.marketplace);
if (has(prByMktKey, k) && str(prByMktKey[k]) !== str(r.allocation_priority)) {
if (!prKeyConflict[k]) {
prKeyConflict[k] = 1;
issues.push(issue('CANONICAL_MARKETPLACE_IDENTITY_CONFLICT', k,
'two marketplaces rows resolve to one canonical identity with different allocation_priority values'));
}
return;
}


if (!has(prByMktKey, k)) prByMktKey[k] = r.allocation_priority;
});
function priorityForMktKey(k) { return prKeyConflict[k] ? undefined : prByMktKey[k]; }





function emitPriority(v, ref) {
if (v === undefined || v === null) return undefined;
if (typeof v !== 'number' && typeof v !== 'string') {
issues.push(issue('INVALID_ALLOCATION_PRIORITY', ref, 'allocation_priority is not a scalar value')); return undefined;
}
if (typeof v === 'string' && v.trim() === '') return undefined;
var n = (typeof v === 'number') ? v : Number(v.trim());
if (!isFinite(n) || n < 0) {
issues.push(issue('INVALID_ALLOCATION_PRIORITY', ref, 'allocation_priority is present but unusable: ' + JSON.stringify(v))); return undefined;
}
return v;
}

var monthsYm = KMPCX._forecastWeightMonths(vr.calculationMonth);
var forecastMonthAbbrev = MONTHS[parseYM(monthsYm[0]).mo - 1];


var receivers = mskRows.filter(function (r) { return inScope(r, vr.scope); });
if (!receivers.length) { issues.push(issue('MISSING_SKU_MAPPING', null, 'no marketplace_skus row for the scope (company/country/marketplace' + (vr.scope.sku ? '/sku ' + vr.scope.sku : '') + ')')); return blocked(issues, meta); }

var kmpcxReceivers = [], recvMeta = {};
receivers.forEach(function (m) {
var sku = str(m.sku), key = sku;
var recvIssues = [];


var fc = vr.regularForecastByMonthOverride ? { map: vr.regularForecastByMonthOverride, forecastId: null } : buildRegularForecastByMonth(fcRows, vr.scope, sku, monthsYm, recvIssues, key);
recvIssues.forEach(function (x) { issues.push(x); });
var events = evtRows.filter(function (r) { return inScope(r, vr.scope) && str(r.sku) === sku; })
.map(function (r) { return { eventStartDate: str(r.event_start_date || r.start_date || r.eventStartDate) }; })
.filter(function (e) { return nonEmpty(e.eventStartDate); });
kmpcxReceivers.push({ company: vr.scope.company, country: vr.scope.country, marketplace: vr.scope.marketplace, sku: sku, siteSku: str(m.site_sku),
destinationWarehouseId: vr.destinationWarehouseId, regularForecastByMonth: fc.map, specialEventFacts: events });
recvMeta[sku] = { forecastId: fc.forecastId, upc: upcBySku[sku], priority: emitPriority(priorityForMktKey(mktIdentityKey(vr.scope.company, vr.scope.country, vr.scope.marketplace)), sku), fulfillmentModel: str(m.fulfillment_model), siteSku: str(m.site_sku), fcMap: fc.map };
});


var pcx = KMPCX.resolveRecommendationPlanningContext({
calculationMonth: vr.calculationMonth, planningCycle: vr.planningCycle, recommendationType: vr.recommendationType,
receivers: kmpcxReceivers, warehouses: whRows
});
(pcx.issues || []).forEach(function (x) { issues.push(x); });
if (!pcx.ready) { issues.push(issue('PLANNING_CONTEXT_NOT_READY', null, 'planning context did not resolve for all receivers')); return blocked(issues, meta); }


var kmafReceivers = pcx.contexts.map(function (ctx) {
var rm = recvMeta[ctx.sku] || {};
var demandRef = nonEmpty(rm.forecastId) ? ('FC:' + rm.forecastId) : ('REG:' + [ctx.company, ctx.country, ctx.marketplace, ctx.sku, vr.planningCycle].join(':'));
var m1 = monthsYm[0], m2 = monthsYm[1];
var fcM1 = finiteNonNeg((rm.fcMap || {})[m1]);
return KMPCX.toAllocationFactReceiver(ctx, {
receiverKey: demandRef, demandRef: demandRef, fulfillmentModel: rm.fulfillmentModel, allocationPriority: rm.priority, unitsPerCarton: rm.upc,
forecastMonth1: { month: m1, baseForecast: (rm.fcMap || {})[m1] }, forecastMonth2: { month: m2, baseForecast: (rm.fcMap || {})[m2] }, targetRules: {}, specialEventDemand: 0,


demand: fcM1 === null ? undefined : fcM1, destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0
});
});

var af = KMAF.projectAllocationFacts({ recommendationType: vr.recommendationType, planningCycle: vr.planningCycle,
businessScope: { company: vr.scope.company, country: vr.scope.country }, calculationDate: vr.calculationMonth + '-01',
receivers: kmafReceivers, warehouses: whRows });
(af.issues || []).forEach(function (x) { issues.push(x); });
if (!af.ready) { issues.push(issue('ALLOCATION_FACTS_NOT_READY', null, 'allocation facts did not resolve')); return blocked(issues, meta, pcx, af); }



var planningFacts = (af.planningFacts || []).map(function (f) {
var o = {}; for (var k in f) if (has(f, k)) o[k] = f[k];
if (vr.recommendationType === 'WEEKLY_SHIPPING') {
if (typeof f.demand === 'number' && typeof f.destinationCurrentStock === 'number' && typeof f.timelyQualifiedIncoming === 'number' && typeof f.timelyApprovedCommittedSupply === 'number') {
o.calculatedGap = CALC.calculateGap({ demand: f.demand, destinationCurrentStock: f.destinationCurrentStock, timelyQualifiedIncoming: f.timelyQualifiedIncoming, timelyApprovedCommittedSupply: f.timelyApprovedCommittedSupply });
}
} else {
if (has(f, 'netOrderNeed') && typeof f.netOrderNeed === 'number') o.netOrderNeed = f.netOrderNeed;
else if (typeof f.demand === 'number' && typeof f.destinationCurrentStock === 'number' && typeof f.timelyQualifiedIncoming === 'number' && typeof f.timelyApprovedCommittedSupply === 'number') {
o.netOrderNeed = CALC.calculateGap({ demand: f.demand, destinationCurrentStock: f.destinationCurrentStock, timelyQualifiedIncoming: f.timelyQualifiedIncoming, timelyApprovedCommittedSupply: f.timelyApprovedCommittedSupply });
}
}
return o;
});

var routing = {}; kmafReceivers.forEach(function (r) { routing[str(r.demandRef)] = vr.destinationWarehouseId; });
var businessScope = { company: vr.scope.company, country: vr.scope.country, marketplace: vr.scope.marketplace, destinationWarehouseId: vr.destinationWarehouseId };
if (vr.scope.sku) businessScope.sku = vr.scope.sku;
if (vr.recommendationType === 'WEEKLY_SHIPPING') businessScope.source_page = str(request.source_page) || 'replen';
else businessScope.draft_purpose = str(request.draft_purpose) || 'monthly';

var productionRequest = {
recommendationType: vr.recommendationType, planningCycle: vr.planningCycle, businessScope: businessScope,
forecastMonth: forecastMonthAbbrev, requiredByDate: (pcx.contexts[0] && pcx.contexts[0].requiredByDate) || null,
routing: routing, formulaVersion: vr.formulaVersion, sourceDataAsOf: vr.sourceDataAsOf,
receiverFacts: af.receiverFacts, factoryDemandFacts: af.factoryDemandFacts, planningFacts: planningFacts
};

return {
ready: issues.length === 0,
planningContextResult: pcx, allocationFactsResult: { ready: af.ready, receiverFacts: af.receiverFacts, factoryDemandFacts: af.factoryDemandFacts, planningFacts: planningFacts },
productionRequest: issues.length === 0 ? productionRequest : null,
issues: sortIssues(issues), meta: meta
};
}

function blocked(issues, meta, pcx, af) {
return { ready: false, planningContextResult: pcx || null, allocationFactsResult: af ? { ready: af.ready, receiverFacts: af.receiverFacts, factoryDemandFacts: af.factoryDemandFacts, planningFacts: [] } : null,
productionRequest: null, issues: sortIssues(issues.length ? issues : [issue('PRODUCTION_RECOMMENDATION_SOURCE_INCOMPLETE', null, 'assembly incomplete')]), meta: meta };
}
function sortIssues(issues) { return issues.slice().sort(function (a, b) { return cmpStr(a.code, b.code) || cmpStr(a.ref, b.ref); }); }

return { assembleProductionRecommendationFacts: assembleProductionRecommendationFacts };
});
__kmRegister("supply-planning-production-assembly", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;



























(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-demand-allocation.js') : (root.KM && root.KM.demandAllocation),
req ? req('./supply-planning-planning-context.js') : (root.KMPCX || (root.KM && root.KM.planningContext)),
req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations)),
req ? req('./supply-planning-qualified-incoming.js') : (root.KMQI || (root.KM && root.KM.qualifiedIncoming))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.destinationRuntime = api; }
})(this, function (DA, KMPCX, CALC, QI) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function eqv(a, b) { return s(a).toLowerCase() === s(b).toLowerCase(); }
function nonEmpty(v) { return s(v).length > 0; }




function countryEqv(a, b) {
var CID = (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.countryMatches === 'function') ? KMCID : null;
return CID ? CID.countryMatches(a, b) : eqv(a, b);
}
function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
function cmpStr(a, b) { a = s(a); b = s(b); return a < b ? -1 : a > b ? 1 : 0; }
function iss(code, message, field) { return { code: code, message: message, field: field === undefined ? null : field }; }

function qtyNum(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return (isFinite(n) && n >= 0) ? n : null; }
function validUpc(v) { return (typeof v === 'number' && isFinite(v) && v > 0 && v % 1 === 0); }










var ACTIVE_INCOMING_STATUS = { draft: 1, shipped: 1, in_transit: 1, arrived: 1, ready_to_ship: 1, approved: 1, partially_received: 1, partial_received: 1 };
var KNOWN_NOT_INCOMING_STATUS = { pending_approval: 1, cancelled: 1, canceled: 1, received: 1, closed: 1, completed: 1, delivered: 1, stuck: 1, planned: 1 };


function normalizeRecommendationDestination(input, authorities) {
return DA.normalizeRecommendationDestination(input, authorities);
}









function resolveMarketplaceCurrentStock(input) {
input = input || {}; var scope = input.scope || {}; var issues = [];
if (input.rows === undefined || input.rows === null) {
return { ready: false, qty: null, missing: true, conflict: false, issues: [iss('MARKETPLACE_STOCK_SOURCE_UNAVAILABLE', 'amazon inventory source not provided (missing ≠ 0)')] };
}
var rows = Array.isArray(input.rows) ? input.rows : [];
var country = s(scope.country), marketplace = s(scope.marketplace), sku = s(scope.sku);
var vals = {}, matched = 0;
rows.forEach(function (r) {
if (!isObj(r)) return;

if (nonEmpty(r.warehouseId) || nonEmpty(r.warehouse_id)) return;
var hasAvail = has(r, 'availableQty') || has(r, 'available_qty');
if (!hasAvail) return;
if (!(countryEqv(r.country, country) && eqv(r.marketplace, marketplace) && eqv(r.sku, sku))) return;
var q = qtyNum(has(r, 'availableQty') ? r.availableQty : r.available_qty);
if (q === null) return;
var tr = qtyNum(has(r, 'fcTransferQty') ? r.fcTransferQty : r.fc_transfer_qty); if (tr === null) tr = 0;
var pr = qtyNum(has(r, 'fcProcessingQty') ? r.fcProcessingQty : r.fc_processing_qty); if (pr === null) pr = 0;
var site = q + tr + pr;
matched++;
vals[String(site)] = site;
});
var distinct = Object.keys(vals);
if (matched === 0) return { ready: false, qty: null, missing: true, conflict: false, issues: [] };
if (distinct.length > 1) return { ready: false, qty: null, missing: false, conflict: true, issues: [iss('MARKETPLACE_STOCK_CONFLICT', 'conflicting amazon Site Stock for ' + [country, marketplace, sku].join('/') + ': ' + distinct.join(','))] };
return { ready: true, qty: vals[distinct[0]], missing: false, conflict: false, issues: issues };
}







function resolveMarketplaceIncomingIdentity(input) {
input = input || {}; var scope = input.scope || {}; var marketplaces = input.marketplaces;
var scopeMktId = s(scope.marketplaceId || scope.destinationRefId);
var cands = Array.isArray(input.candidates) ? input.candidates : [];
return cands.map(function (c) {
c = c || {};
var destType = s(c.destinationType).toUpperCase();
var candMktId = s(c.marketplaceId);
var whId = s(c.destinationWarehouseId || c.destination_warehouse_id);

if (destType !== 'MARKETPLACE' && !candMktId && whId) return { resolutionStatus: 'NOT_MARKETPLACE', marketplaceId: null, issueCode: null };
var mkt = s(c.marketplace);
if (eqv(mkt, 'MULTI') || !nonEmpty(mkt) && !candMktId) return { resolutionStatus: 'UNRESOLVED', marketplaceId: null, issueCode: 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED' };

var nd = DA.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: s(c.company), country: s(c.country), marketplace: mkt, marketplaceId: candMktId || undefined }, { marketplaces: marketplaces });
if (!nd.ok) {
var code = (nd.issues && nd.issues[0] && nd.issues[0].code) || 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED';
if (code === 'MARKETPLACE_DESTINATION_CONFLICT') return { resolutionStatus: 'UNRESOLVED', marketplaceId: null, issueCode: 'MARKETPLACE_INCOMING_IDENTITY_CONFLICT' };
return { resolutionStatus: 'UNRESOLVED', marketplaceId: null, issueCode: 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED' };
}
var resolvedId = nd.destination.marketplaceId;
if (scopeMktId && resolvedId !== scopeMktId) return { resolutionStatus: 'NOT_MARKETPLACE', marketplaceId: resolvedId, issueCode: 'MARKETPLACE_INCOMING_SCOPE_MISMATCH' };
return { resolutionStatus: 'RESOLVED', marketplaceId: resolvedId, issueCode: null };
});
}




function _toKmIncomingResult(c, marketplaceId, idx) {
var q = qtyNum(has(c, 'quantity') ? c.quantity : c.quantityRemaining);
var status = s(c.status).toLowerCase();
var statusEligible = ACTIVE_INCOMING_STATUS[status] === 1;
var statusClass = statusEligible ? 'ELIGIBLE_INCOMING_STATUS' : (!status ? 'MISSING_STATUS' : KNOWN_NOT_INCOMING_STATUS[status] === 1 ? 'STATUS_NOT_ELIGIBLE' : 'UNKNOWN_STATUS');
var eta = s(c.eta);
var ref = s(c.ref || c.shipmentId || c.lineageKey || c.supplyCandidateId) || ('mkt-inc-' + idx);
return {
adapterType: 'KM_SHIPMENT_INCOMING', sourceEligible: true, statusEligible: statusEligible, statusClass: statusClass,
quantityEligible: (typeof q === 'number' && q > 0), etaPresent: nonEmpty(eta),
adapterEligibleQuantity: (statusEligible && typeof q === 'number' && q > 0) ? q : 0,
exclusionReasons: [], reviewReasons: [],
candidate: {
lineageKey: s(c.lineageKey) || ref, supplyCandidateId: s(c.supplyCandidateId) || ref, sourceLineRef: s(c.sourceLineRef) || ref,
company: s(c.company), country: s(c.country), marketplace: s(c.marketplace), sku: s(c.sku),
destinationWarehouseId: marketplaceId, destinationIdentitySource: 'RESOLVED_MARKETPLACE',
status: status, eta: eta, quantityRemaining: (typeof q === 'number' ? q : null), linkedShipmentId: s(c.linkedShipmentId) || ''
}
};
}





function resolveMarketplaceQualifiedIncoming(input) {
input = input || {}; var issues = [];
if (input.candidates === undefined || input.candidates === null) {
return { confirmedQualifiedIncomingQty: null, incomingCompleteness: 'UNAVAILABLE', unresolvedIncomingCount: 0, unresolvedIncomingRefs: [], issues: [iss('MARKETPLACE_INCOMING_SOURCE_UNAVAILABLE', 'marketplace incoming source not provided (missing ≠ 0)')], perCandidate: [] };
}
var cands = Array.isArray(input.candidates) ? input.candidates : [];
var identity = resolveMarketplaceIncomingIdentity({ candidates: cands, marketplaces: input.marketplaces, scope: input.scope || {} });
var resolvedResults = [], unresolvedRefs = [], unknownStatusRefs = [];
identity.forEach(function (r, i) {
var c = cands[i] || {};
if (r.issueCode) issues.push(iss(r.issueCode, 'incoming candidate ' + (s(c.ref || c.shipmentId) || ('@' + i)) + ' → ' + r.resolutionStatus, 'marketplace'));


var st0 = s(c.status).toLowerCase(), unknownStatus = !!st0 && ACTIVE_INCOMING_STATUS[st0] !== 1 && KNOWN_NOT_INCOMING_STATUS[st0] !== 1;
if ((r.resolutionStatus === 'RESOLVED' || r.resolutionStatus === 'UNRESOLVED') && unknownStatus) unknownStatusRefs.push(s(c.ref || c.shipmentId || c.lineageKey) || ('@' + i));
if (r.resolutionStatus === 'RESOLVED') {
resolvedResults.push(_toKmIncomingResult(c, r.marketplaceId, i));
} else if (r.resolutionStatus === 'UNRESOLVED') {

if (ACTIVE_INCOMING_STATUS[s(c.status).toLowerCase()] === 1) unresolvedRefs.push(s(c.ref || c.shipmentId || c.lineageKey) || ('@' + i));
}
});
unresolvedRefs.sort(cmpStr); unknownStatusRefs.sort(cmpStr);
if (unknownStatusRefs.length) issues.push(iss('MARKETPLACE_INCOMING_STATUS_UNKNOWN', 'incoming shipment(s) ' + unknownStatusRefs.join(', ') + ' carry a status outside the shipment vocabulary - neither counted nor a confirmed 0', 'status'));

var confirmed = 0, qiEvents = [];
if (resolvedResults.length) {
if (!nonEmpty(input.requiredByDate)) { issues.push(iss('MISSING_REQUIRED_BY_DATE', 'requiredByDate required to evaluate marketplace Qualified Incoming')); return { confirmedQualifiedIncomingQty: null, incomingCompleteness: 'UNAVAILABLE', unresolvedIncomingCount: unresolvedRefs.length, unresolvedIncomingRefs: unresolvedRefs, issues: issues, perCandidate: identity, qualifiedEvents: [] }; }
var qi = QI.evaluateQualifiedIncoming({ requiredByDate: s(input.requiredByDate), kmShipmentResults: resolvedResults, externalAuthorityResults: input.externalIncomingResults || [] });
confirmed = qi.qualifiedIncomingQuantity;
qiEvents = (qi && qi.qualifiedEvents) ? qi.qualifiedEvents : [];
} else if (input.externalIncomingResults && input.externalIncomingResults.length) {

QI.evaluateQualifiedIncoming({ requiredByDate: s(input.requiredByDate) || '2000-01-01', kmShipmentResults: [], externalAuthorityResults: input.externalIncomingResults });
}

var completeness = unresolvedRefs.length > 0 || unknownStatusRefs.length > 0 ? 'PARTIAL' : 'COMPLETE';
return {
confirmedQualifiedIncomingQty: confirmed, incomingCompleteness: completeness,
unresolvedIncomingCount: unresolvedRefs.length, unresolvedIncomingRefs: unresolvedRefs, unknownStatusIncomingRefs: unknownStatusRefs, issues: issues, perCandidate: identity,
qualifiedEvents: qiEvents
};
}




function resolveMarketplaceDemand(input) {
input = input || {}; var dest = input.destination || {};
var pcx = KMPCX.resolveRecommendationPlanningContext({
calculationMonth: input.calculationMonth, planningCycle: input.planningCycle, recommendationType: 'MONTHLY_ORDER',
marketplaces: input.marketplaces || [], warehouses: input.warehouses || [],
receivers: [{
company: dest.company, country: dest.country, marketplace: dest.marketplace, sku: s(input.sku), siteSku: s(input.siteSku),
destination: dest, regularForecastByMonth: input.regularForecastByMonth, specialEventFacts: input.specialEventFacts || []
}]
});
if (!pcx.ready || !pcx.contexts.length) return { ready: false, qty: null, context: null, issues: pcx.issues || [] };
return { ready: true, qty: pcx.contexts[0].forecastShareQty, context: pcx.contexts[0], issues: [] };
}


function resolveMarketplaceRecommendation(input) {
input = input || {}; var issues = [], mode = 'MARKETPLACE_ORDER_NEED';
var completeness = s(input.incomingCompleteness).toUpperCase() || 'COMPLETE';
var demand = qtyNum(input.demandQty), stock = qtyNum(input.currentStockQty);
var confirmed = qtyNum(input.confirmedQualifiedIncomingQty); if (confirmed === null) confirmed = 0;
var approved = qtyNum(input.approvedCommittedSupplyQty); if (approved === null) approved = 0;
var upc = input.unitsPerCarton;
function out(gap, prov, blocked, reason) { return { recommendationMode: mode, calculatedGap: gap, recommendedQty: (blocked ? null : prov), provisionalOrderNeed: prov, blocked: blocked, blockedReason: reason, incomingCompleteness: completeness, issues: issues }; }
if (demand === null) { issues.push(iss('MISSING_MARKETPLACE_DEMAND', 'marketplace Regular-FC demand missing (missing ≠ 0)')); return out(null, null, true, 'MISSING_MARKETPLACE_DEMAND'); }
if (stock === null) { issues.push(iss('MARKETPLACE_STOCK_MISSING', 'marketplace current stock missing (missing ≠ 0)')); return out(null, null, true, 'MARKETPLACE_STOCK_MISSING'); }
if (!validUpc(upc)) { issues.push(iss('MISSING_OR_INVALID_UNITS_PER_CARTON', 'units_per_carton must be a positive integer')); return out(null, null, true, 'MISSING_OR_INVALID_UNITS_PER_CARTON'); }
var gap, prov;
try { gap = CALC.calculateGap({ demand: demand, destinationCurrentStock: stock, timelyQualifiedIncoming: confirmed, timelyApprovedCommittedSupply: approved }); }
catch (e) { issues.push(iss('GAP_INPUT_INVALID', String(e && e.message || e))); return out(null, null, true, 'GAP_INPUT_INVALID'); }
try { prov = CALC.calculateSuggestedOrderQty({ netOrderNeed: gap, unitsPerCarton: upc }); }
catch (e) { issues.push(iss('ORDER_NEED_INPUT_INVALID', String(e && e.message || e))); return out(gap, null, true, 'ORDER_NEED_INPUT_INVALID'); }
if (completeness === 'PARTIAL' || completeness === 'UNAVAILABLE') return out(gap, prov, true, 'INCOMING_COMPLETENESS_' + completeness);
return out(gap, prov, false, null);
}


function resolveWarehouseRecommendation(input) {
input = input || {}; var issues = [], mode = 'WAREHOUSE_REPLENISHMENT', node = input.destinationNode || null;
var demand = qtyNum(input.allocatedForecastQty), sales = qtyNum(input.allocatedSalesQty), stock = qtyNum(input.currentStockQty);
var incoming = qtyNum(input.qualifiedIncomingQty), supply = qtyNum(input.allocatedSupplyQty);
var approved = qtyNum(input.approvedCommittedSupplyQty); if (approved === null) approved = 0;
var other = qtyNum(input.otherLegallyAllocatedTimelySupply); if (other === null) other = 0;
var upc = input.unitsPerCarton;
function out(gap, rec, resid, blocked, reason) {
return { recommendationMode: mode, destinationNode: node, allocatedForecastQty: demand, allocatedSalesQty: sales, currentStockQty: stock, qualifiedIncomingQty: incoming, calculatedGap: gap, allocatedSupplyQty: supply, recommendedQty: rec, residualShortageQty: resid, blocked: blocked, blockedReason: reason, issues: issues };
}
if (demand === null) { issues.push(iss('MISSING_WAREHOUSE_DEMAND', 'allocated warehouse Forecast demand missing (missing ≠ 0)')); return out(null, null, null, true, 'MISSING_WAREHOUSE_DEMAND'); }
if (stock === null) { issues.push(iss('MISSING_WAREHOUSE_STOCK', 'warehouse current stock missing (missing ≠ 0)')); return out(null, null, null, true, 'MISSING_WAREHOUSE_STOCK'); }
if (incoming === null) { issues.push(iss('MISSING_WAREHOUSE_INCOMING', 'warehouse Qualified Incoming missing (missing ≠ 0)')); return out(null, null, null, true, 'MISSING_WAREHOUSE_INCOMING'); }
if (supply === null) { issues.push(iss('MISSING_ALLOCATED_SUPPLY', 'allocated source availability missing (missing ≠ 0)')); return out(null, null, null, true, 'MISSING_ALLOCATED_SUPPLY'); }
if (!validUpc(upc)) { issues.push(iss('MISSING_OR_INVALID_UNITS_PER_CARTON', 'units_per_carton must be a positive integer')); return out(null, null, null, true, 'MISSING_OR_INVALID_UNITS_PER_CARTON'); }
var gap, ship;
try { gap = CALC.calculateGap({ demand: demand, destinationCurrentStock: stock, timelyQualifiedIncoming: incoming, timelyApprovedCommittedSupply: approved }); }
catch (e) { issues.push(iss('GAP_INPUT_INVALID', String(e && e.message || e))); return out(null, null, null, true, 'GAP_INPUT_INVALID'); }
try { ship = CALC.calculateShippingAndResidual({ calculatedGap: gap, eligibleSourceAvailable: supply, otherLegallyAllocatedTimelySupply: other, unitsPerCarton: upc }); }
catch (e) { issues.push(iss('SHIPPING_INPUT_INVALID', String(e && e.message || e))); return out(gap, null, null, true, 'SHIPPING_INPUT_INVALID'); }
return out(gap, ship.recommendedShippingQty, ship.residualProductionRequired, false, null);
}


function _whById(warehouses) { var m = {}; (Array.isArray(warehouses) ? warehouses : []).forEach(function (w) { var id = s(w.warehouse_id || w.warehouseId); if (id && !m[id]) m[id] = w; }); return m; }
function resolveUnifiedDestinationRecommendation(rawSnapshots, request, options) {
rawSnapshots = rawSnapshots || {}; request = request || {}; options = options || {};
var scope = request.scope || {};
var meta = { deterministic: true, calculationMonth: s(request.calculationMonth) || null, planningCycle: s(request.planningCycle) || null, sourceDataAsOf: request.sourceDataAsOf == null ? null : s(request.sourceDataAsOf), formulaVersion: request.formulaVersion == null ? null : s(request.formulaVersion), recommendationType: s(request.recommendationType) || null };
var authorities = { marketplaces: rawSnapshots.marketplaces || options.marketplaces || [], warehouses: rawSnapshots.warehouses || options.warehouses || [] };
var din = request.destination || {};
var normInput = {
destinationType: din.destinationType, company: nonEmpty(din.company) ? din.company : scope.company,
country: nonEmpty(din.country) ? din.country : scope.country, marketplace: nonEmpty(din.marketplace) ? din.marketplace : scope.marketplace,
marketplaceId: din.marketplaceId, warehouseId: din.warehouseId, destinationWarehouseId: din.destinationWarehouseId, destinationRefId: din.destinationRefId
};
var nd = DA.normalizeRecommendationDestination(normInput, authorities);
if (!nd.ok) return { ready: false, destination: null, recommendationMode: null, line: null, issues: nd.issues, meta: meta };
var dest = nd.destination;

if (dest.destinationType === 'MARKETPLACE') {
var demandQty;
if (has(options, 'marketplaceDemandQty')) { demandQty = options.marketplaceDemandQty; }
else {
var dres = resolveMarketplaceDemand({ destination: dest, calculationMonth: request.calculationMonth, planningCycle: request.planningCycle, marketplaces: authorities.marketplaces, warehouses: authorities.warehouses, sku: scope.sku, siteSku: options.siteSku, regularForecastByMonth: options.regularForecastByMonth, specialEventFacts: options.specialEventFacts });
if (!dres.ready) return { ready: false, destination: dest, recommendationMode: 'MARKETPLACE_ORDER_NEED', line: null, issues: dres.issues, meta: meta };
demandQty = dres.qty;
}
var stockRes = resolveMarketplaceCurrentStock({ rows: (rawSnapshots.amazonInventory !== undefined ? rawSnapshots.amazonInventory : options.amazonInventory), scope: { country: dest.country, marketplace: dest.marketplace, sku: scope.sku } });
var qir = resolveMarketplaceQualifiedIncoming({ candidates: (rawSnapshots.marketplaceIncomingCandidates !== undefined ? rawSnapshots.marketplaceIncomingCandidates : options.marketplaceIncomingCandidates), marketplaces: authorities.marketplaces, scope: dest, requiredByDate: options.requiredByDate || request.requiredByDate, externalIncomingResults: options.externalIncomingResults });
var mrec = resolveMarketplaceRecommendation({ demandQty: demandQty, currentStockQty: stockRes.qty, confirmedQualifiedIncomingQty: qir.confirmedQualifiedIncomingQty, incomingCompleteness: qir.incomingCompleteness, approvedCommittedSupplyQty: options.approvedCommittedSupplyQty, unitsPerCarton: options.unitsPerCarton });
var mline = { destination: dest, recommendationMode: mrec.recommendationMode, calculatedGap: mrec.calculatedGap, recommendedQty: mrec.recommendedQty, provisionalOrderNeed: mrec.provisionalOrderNeed, blocked: mrec.blocked, blockedReason: mrec.blockedReason, incomingCompleteness: mrec.incomingCompleteness, currentStockQty: stockRes.qty, confirmedQualifiedIncomingQty: qir.confirmedQualifiedIncomingQty, unresolvedIncomingCount: qir.unresolvedIncomingCount, unresolvedIncomingRefs: qir.unresolvedIncomingRefs, unknownStatusIncomingRefs: qir.unknownStatusIncomingRefs || [], qualifiedEvents: qir.qualifiedEvents || [] };
var mIssues = (mrec.issues || []).concat(stockRes.issues || []).concat(qir.issues || []);
return { ready: !mrec.blocked, destination: dest, recommendationMode: 'MARKETPLACE_ORDER_NEED', line: mline, issues: mIssues, meta: meta };
}


var whId = dest.warehouseId;
var fan = DA.resolveScopeWarehouseDemandFacts({
scope: { company: dest.company, country: dest.country, marketplace: dest.marketplace, marketplaceId: dest.marketplaceId },
allocationRules: rawSnapshots.allocationRules || options.allocationRules || [], warehousesById: _whById(authorities.warehouses),
effectiveDate: s(request.calculationMonth), marketplaceForecastQty: options.marketplaceForecastQty, marketplaceSalesQty: options.marketplaceSalesQty
});
if (!fan.ready) return { ready: false, destination: dest, recommendationMode: 'WAREHOUSE_REPLENISHMENT', line: null, issues: fan.issues, meta: meta };
var leg = fan.warehouses.filter(function (w) { return w.warehouseId === whId; })[0];
if (!leg) return { ready: false, destination: dest, recommendationMode: 'WAREHOUSE_REPLENISHMENT', line: null, issues: [iss('DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'no active allocation rule for requested destination warehouse: ' + whId)], meta: meta };
var perWh = (isObj(options.perWarehouseSupply) && options.perWarehouseSupply[whId]) || options.warehouseSupplyFacts || {};
var wrec = resolveWarehouseRecommendation({
destinationNode: dest, allocatedForecastQty: leg.allocatedForecastQty, allocatedSalesQty: leg.allocatedSalesQty,
currentStockQty: perWh.currentStockQty, qualifiedIncomingQty: perWh.qualifiedIncomingQty, allocatedSupplyQty: perWh.allocatedSupplyQty,
approvedCommittedSupplyQty: perWh.approvedCommittedSupplyQty, otherLegallyAllocatedTimelySupply: perWh.otherLegallyAllocatedTimelySupply, unitsPerCarton: options.unitsPerCarton
});
return { ready: !wrec.blocked, destination: dest, recommendationMode: 'WAREHOUSE_REPLENISHMENT', line: wrec, issues: wrec.issues || [], meta: meta };
}






function _numOrNull(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function recommendationLineId(mode, company, country, marketplace, sku, siteSku, destinationKey) {
return [s(mode), s(company), s(country), s(marketplace), s(sku), s(siteSku), s(destinationKey)].join('|');
}
function buildRecommendationLine(input) {
input = input || {}; var d = input.destination || {};
var mode = s(input.recommendationMode);
var company = s(d.company) || s(input.company), country = s(d.country) || s(input.country), marketplace = s(d.marketplace) || s(input.marketplace);
var sku = s(input.sku), siteSku = s(input.siteSku);
var destinationKey = s(d.destinationKey) || DA.destinationKey(d);
return {
recommendationLineId: recommendationLineId(mode, company, country, marketplace, sku, siteSku, destinationKey),
recommendationMode: mode || null,
company: company || null, country: country || null, marketplace: marketplace || null, marketplaceId: d.marketplaceId || null,
sku: sku || null, siteSku: siteSku || null,
destinationType: d.destinationType || null, destinationRefId: d.destinationRefId || null, destinationKey: destinationKey || null,
destinationCode: d.destinationCode || null, destinationLabel: d.destinationLabel || null, warehouseId: d.warehouseId || null,
allocatedForecastQty: _numOrNull(input.allocatedForecastQty), allocatedSalesQty: _numOrNull(input.allocatedSalesQty),
currentStockQty: _numOrNull(input.currentStockQty), qualifiedIncomingQty: _numOrNull(input.qualifiedIncomingQty),
incomingCompleteness: input.incomingCompleteness == null ? null : s(input.incomingCompleteness),
calculatedGap: _numOrNull(input.calculatedGap), allocatedSupplyQty: _numOrNull(input.allocatedSupplyQty),
recommendedQty: _numOrNull(input.recommendedQty), provisionalOrderNeed: _numOrNull(input.provisionalOrderNeed),
residualShortageQty: _numOrNull(input.residualShortageQty),
blocked: input.blocked === true, blockedReason: input.blocked === true ? (s(input.blockedReason) || null) : null,
formulaVersion: input.formulaVersion == null ? null : s(input.formulaVersion),
sourceDataAsOf: input.sourceDataAsOf == null ? null : s(input.sourceDataAsOf),
diagnostics: (input.diagnostics && typeof input.diagnostics === 'object') ? input.diagnostics : { issues: [] }
};
}

return {
normalizeRecommendationDestination: normalizeRecommendationDestination,
buildRecommendationLine: buildRecommendationLine,
recommendationLineId: recommendationLineId,
resolveMarketplaceCurrentStock: resolveMarketplaceCurrentStock,
resolveMarketplaceIncomingIdentity: resolveMarketplaceIncomingIdentity,
resolveMarketplaceQualifiedIncoming: resolveMarketplaceQualifiedIncoming,
resolveMarketplaceDemand: resolveMarketplaceDemand,
resolveMarketplaceRecommendation: resolveMarketplaceRecommendation,
resolveWarehouseRecommendation: resolveWarehouseRecommendation,
resolveUnifiedDestinationRecommendation: resolveUnifiedDestinationRecommendation
};
});
__kmRegister("supply-planning-destination-runtime", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.planningDemand = api; window.KM.planningDemand = api; }
return api;
})(this, function () {
'use strict';

var MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
var DEAD_EVENT = { inactive: 1, deleted: 1, archived: 1, cancelled: 1, void: 1 };

var SPECIAL_EVENT_PREP_OFFSET_DAYS = 45;
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function U(v) { return s(v).toUpperCase(); }
function L(v) { return s(v).toLowerCase(); }
function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function daysInMonth(y, m) { return [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
















var TR_SCOPE_TYPES_ = ['CATEGORY', 'SERIES', 'SKU'];
var TR_PRECEDENCE_ = ['SKU', 'SERIES', 'CATEGORY'];
var TR_RETIRED_IDENTITY_ = 'ALL';
var TR_DEFAULT_PCT_ = 100;


function trScopeType(v) {
var u = U(v);
return TR_SCOPE_TYPES_.indexOf(u) !== -1 ? u : '';
}
function trBusinessKey(o) {
return [U(o.year), U(o.company), U(o.country), U(o.marketplace), U(o.scopeType), U(o.scopeId)].join('|');
}

function trMonthIndex(v) {
var n = Number(v);
if (isFinite(n) && n >= 1 && n <= 12 && String(v).indexOf('.') === -1) return n - 1;
var i = MONTH_ABBR.indexOf(L(v).slice(0, 3));
return i;
}
function trIdentityUsable(v) {
var t = s(v);
return !!t && U(t) !== TR_RETIRED_IDENTITY_;
}












function resolveTargetRule(ruleRows, request) {
var req = request || {};
function answer(reason, pct, hit) {
return {
matched: reason === 'OK',
targetPct: pct,
targetRuleId: hit ? s(hit.row.target_rule_id) : null,
scopeType: hit ? hit.scopeType : null,
scopeId: hit ? hit.scopeId : null,
businessKey: hit ? hit.key : null,
sourceMonth: hit ? hit.monthColumn : null,
reason: reason
};
}


if (!trIdentityUsable(req.year) || !trIdentityUsable(req.company)
|| !trIdentityUsable(req.country) || !trIdentityUsable(req.marketplace)) {
return answer('INVALID_REQUEST_IDENTITY', null, null);
}

var mi = trMonthIndex(req.month);
if (mi < 0 || mi > 11) return answer('INVALID_MONTH', null, null);
var monthColumn = MONTH_ABBR[mi] + '_pct';

var rules = Array.isArray(ruleRows) ? ruleRows : [];
if (!rules.length) return answer('NO_RULES', TR_DEFAULT_PCT_, null);

var wantDim = { SKU: s(req.sku), SERIES: s(req.series), CATEGORY: s(req.category) };


var candidates = [];
for (var i = 0; i < rules.length; i++) {
var r = rules[i] || {};

if (!trIdentityUsable(r.year) || !trIdentityUsable(r.company)
|| !trIdentityUsable(r.country) || !trIdentityUsable(r.marketplace)) continue;

if (U(r.year) !== U(req.year)) continue;
if (U(r.company) !== U(req.company)) continue;
if (U(r.country) !== U(req.country)) continue;
if (U(r.marketplace) !== U(req.marketplace)) continue;

var st = trScopeType(r.scope_type);
if (!st) continue;


var sid = s(r.scope_id);
if (!trIdentityUsable(sid)) continue;
var want = wantDim[st];
if (!want || U(sid) !== U(want)) continue;


var raw = r[monthColumn];
var pct = num(raw);
if (pct === null) continue;
candidates.push({ row: r, scopeType: st, scopeId: sid, pct: pct, monthColumn: monthColumn,
key: trBusinessKey({ year: r.year, company: r.company, country: r.country,
marketplace: r.marketplace, scopeType: st, scopeId: sid }) });
}

if (!candidates.length) return answer('NO_MATCH', TR_DEFAULT_PCT_, null);



var seen = {};
for (var d = 0; d < candidates.length; d++) {
if (seen[candidates[d].key]) return answer('DUPLICATE_TARGET_RULE_IDENTITY', null, null);
seen[candidates[d].key] = 1;
}


for (var p = 0; p < TR_PRECEDENCE_.length; p++) {
for (var c = 0; c < candidates.length; c++) {
if (candidates[c].scopeType === TR_PRECEDENCE_[p]) {
return answer('OK', candidates[c].pct, candidates[c]);
}
}
}
return answer('NO_MATCH', TR_DEFAULT_PCT_, null);
}







function resolveTargetPct(targetRuleRows, skuMeta, scope, ym) {
var m = /^(\d{4})-(\d{2})$/.exec(s(ym));
if (!m) return TR_DEFAULT_PCT_;
var meta = skuMeta || {}, sc = scope || {};
var res = resolveTargetRule(targetRuleRows, {
year: m[1], company: sc.company, country: sc.country, marketplace: sc.marketplace,
category: meta.category, series: meta.series, sku: meta.sku, month: Number(m[2])
});
return res.targetPct;
}


function baseRegularFc(fcRows, scope, sku, ym) {
var m = /^(\d{4})-(\d{2})$/.exec(s(ym)); if (!m) return null;
var year = Number(m[1]), abbr = MONTH_ABBR[(+m[2]) - 1], sc = scope || {}, vals = {};
(fcRows || []).forEach(function (r) {
r = r || {};
if (U(r.company) !== U(sc.company) || U(r.country) !== U(sc.country) || U(r.marketplace) !== U(sc.marketplace) || U(r.sku) !== U(sku)) return;
if (Number(r.year) !== year) return;
var v = r[abbr]; if (v !== '' && v !== null && v !== undefined && isFinite(Number(v))) vals[String(Number(v))] = Number(v);
});
var keys = Object.keys(vals); return keys.length === 1 ? vals[keys[0]] : null;
}




function adjustedRegularFc(fcRows, targetRuleRows, skuMeta, scope, sku, ym) {
var base = baseRegularFc(fcRows, scope, sku, ym); if (base === null) return null;
var pct = resolveTargetPct(targetRuleRows, skuMeta, scope, ym);
if (pct === null) return null;
return { base: base, targetPct: pct, adjusted: Math.round(base * (pct / 100)) };
}


function parseIsoDate(v) {
var m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s(v)); if (!m) return null;
return { y: +m[1], mo: +m[2], d: +m[3] };
}
function addDaysYmd(ymd, delta) {

var y = ymd.y, mo = ymd.mo, d = ymd.d + delta;
while (d < 1) { mo--; if (mo < 1) { mo = 12; y--; } d += daysInMonth(y, mo); }
while (d > daysInMonth(y, mo)) { d -= daysInMonth(y, mo); mo++; if (mo > 12) { mo = 1; y++; } }
return { y: y, mo: mo, d: d };
}
function eventScopeMatch(r, scope, sku) {
r = r || {}; var sc = scope || {};
var skuMatch = U(r.sku) === U(sku) || (L(r.scope_type) === 'sku' && U(r.scope_id) === U(sku));
if (!skuMatch) return false;
if (s(r.company) && s(sc.company) && U(r.company) !== U(sc.company)) return false;
if (s(r.country) && s(sc.country) && U(r.country) !== U(sc.country)) return false;
if (s(r.marketplace) && s(sc.marketplace) && L(r.marketplace) !== L(sc.marketplace)) return false;
var st = L(r.status); if (st && DEAD_EVENT[st]) return false;
return true;
}

function eventPrepMonth(r) {
var start = parseIsoDate((r || {}).event_start_date || (r || {}).eventStartDate);
if (!start) return null;
var prep = addDaysYmd(start, -SPECIAL_EVENT_PREP_OFFSET_DAYS);
return { ym: prep.y + '-' + pad2(prep.mo), prepDate: prep.y + '-' + pad2(prep.mo) + '-' + pad2(prep.d), y: prep.y, mo: prep.mo, d: prep.d };
}







function ymdOrd(o) { return o.y * 10000 + o.mo * 100 + o.d; }
function realYmd(v) {
var p = parseIsoDate(v); if (!p) return null;
if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > daysInMonth(p.y, p.mo)) return null;
return p;
}
function blank(v) { return v === undefined || v === null || s(v) === ''; }
function eventStartRaw(r) { r = r || {}; return blank(r.event_start_date) ? r.eventStartDate : r.event_start_date; }
function eventEndRaw(r) { r = r || {}; return blank(r.event_end_date) ? r.eventEndDate : r.event_end_date; }



function eventQtyOf(r) {
r = r || {};
var raw = !blank(r.fc_qty) ? r.fc_qty : r.qty;
if (blank(raw)) return { ok: true, qty: 0 };
if (typeof raw === 'number') return (isFinite(raw) && raw >= 0) ? { ok: true, qty: raw } : { ok: false, qty: null };
if (typeof raw !== 'string') return { ok: false, qty: null };
var t = raw.trim();
if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, qty: null };
return { ok: true, qty: Number(t) };
}

function eventRowIssue(r) {
var st = realYmd(eventStartRaw(r));
if (!st) return 'EVENT_START_DATE_INVALID';
var endRaw = eventEndRaw(r);
if (!blank(endRaw)) {
var en = realYmd(endRaw);
if (!en) return 'EVENT_END_DATE_INVALID';
if (ymdOrd(en) < ymdOrd(st)) return 'EVENT_DATE_RANGE_INVALID';
}
if (!eventQtyOf(r).ok) return 'EVENT_QTY_INVALID';
return null;
}


function weekdayMon0(y, mo, d) {
var t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4], yy = mo < 3 ? y - 1 : y;
var dow = (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[mo - 1] + d) % 7;
return (dow + 6) % 7;
}
function ymdIso(o) { return o.y + '-' + pad2(o.mo) + '-' + pad2(o.d); }
function eventDates(r) {
var st = realYmd(eventStartRaw(r)); if (!st) return null;
var prep = addDaysYmd(st, -SPECIAL_EVENT_PREP_OFFSET_DAYS);
var mon = addDaysYmd(prep, -weekdayMon0(prep.y, prep.mo, prep.d));
return { startDate: ymdIso(st), prepDate: ymdIso(prep), firstSuggestionMonday: ymdIso(mon), planningMonth: st.y + '-' + pad2(st.mo) };
}
function eventLastDay(r) { return realYmd(eventEndRaw(r)) || realYmd(eventStartRaw(r)); }
function eventCountsOn(r, calcYmd) {
var last = eventLastDay(r);
return !!(last && calcYmd && ymdOrd(last) >= ymdOrd(calcYmd));
}
function eventIdOf(r) { r = r || {}; return s(r.event_fc_id || r.event_id || r.event_name) || null; }


function validateScopedEvents(eventRows, scope, sku, calculationDate) {
var issues = [], any = false;
(eventRows || []).forEach(function (r) {
if (!eventScopeMatch(r, scope || {}, s(sku))) return;
any = true;
var code = eventRowIssue(r); if (code) issues.push({ code: code, eventId: eventIdOf(r) });
});
if (any && !realYmd(calculationDate)) issues.unshift({ code: 'EVENT_CALCULATION_DATE_INVALID', eventId: null, got: (calculationDate == null ? null : s(calculationDate)) });
return { ok: issues.length === 0, issues: issues };
}
function eventError(code, detail) { var e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; e.kmpdEventError = true; return e; }
function specialEventFcForMonth(eventRows, scope, sku, ym) {
var total = 0, any = false, bad = false;
(eventRows || []).forEach(function (r) {
if (!eventScopeMatch(r, scope, sku)) return;
if (eventRowIssue(r)) { bad = true; return; }
var ed = eventDates(r); if (!ed || ed.planningMonth !== s(ym)) return;
var q = eventQtyOf(r).qty; if (!(q > 0)) return;
total += q; any = true;
});
if (bad) return null;
return any ? total : 0;
}




function planningDemandByMonth(input) {
input = input || {};
var fcRows = input.fcRegularRows, tgtRows = input.fcTargetRuleRows, evtRows = input.fcSpecialEventRows;
var scope = input.scope || {}, sku = s(input.sku), skuMeta = input.skuMeta || { sku: sku };
var months = Array.isArray(input.months) ? input.months : [];
var out = {};
months.forEach(function (ym) {
var adj = adjustedRegularFc(fcRows, tgtRows, skuMeta, scope, sku, ym);
if (!adj) return;
var special = specialEventFcForMonth(evtRows, scope, sku, ym);
if (special === null) return;
out[ym] = { regularBase: adj.base, targetPct: adj.targetPct, adjustedRegular: adj.adjusted, special: special, demand: adj.adjusted + special };
});
return out;
}





function currentMonthRemainingDemand(input) {
input = input || {};
var cd = parseIsoDate(input.calculationDate);
if (!cd) return { ready: false, issues: [{ code: 'CALCULATION_DATE_INVALID', message: 'calculationDate must be YYYY-MM-DD' }] };
var ym = cd.y + '-' + pad2(cd.mo);
var dim = daysInMonth(cd.y, cd.mo);
var remainingDays = dim - cd.d;
if (remainingDays < 0) remainingDays = 0;
var adj = adjustedRegularFc(input.fcRegularRows, input.fcTargetRuleRows, input.skuMeta || { sku: s(input.sku) }, input.scope || {}, s(input.sku), ym);
if (!adj) return { ready: false, ym: ym, remainingDays: remainingDays, daysInMonth: dim, issues: [{ code: 'CURRENT_MONTH_FORECAST_MISSING', message: 'no regular FC for the calculation month ' + ym }] };
var dailyRate = adj.adjusted / dim;
var regularRemaining = dailyRate * remainingDays;



var special = 0, specialPastPrep = 0, badEvents = [];
(input.fcSpecialEventRows || []).forEach(function (r) {
if (!eventScopeMatch(r, input.scope || {}, s(input.sku))) return;
var code = eventRowIssue(r); if (code) { badEvents.push({ code: code, eventId: eventIdOf(r) }); return; }
var ed = eventDates(r); if (!ed) return;
if (ed.planningMonth > ym) return;
if (!eventCountsOn(r, cd)) return;
var q = eventQtyOf(r).qty; if (!(q > 0)) return;
special += q; if (ed.planningMonth < ym) specialPastPrep += q;
});
if (badEvents.length) return { ready: false, ym: ym, remainingDays: remainingDays, daysInMonth: dim, issues: badEvents.map(function (b) { return { code: b.code, eventId: b.eventId, message: 'special event row invalid - current-month remaining demand not computed' }; }) };
return { ready: true, requiredByDate: ym + '-' + pad2(dim), ym: ym, remainingDays: remainingDays, daysInMonth: dim,
dailyRate: dailyRate, regularRemaining: regularRemaining, special: special, specialPastPrep: specialPastPrep, demand: regularRemaining + special, targetPct: adj.targetPct, issues: [] };
}







function scopedSpecialEventPreps(eventRows, scope, sku, calculationDate) {
var out = [], cd = realYmd(calculationDate);
(eventRows || []).forEach(function (r) {
if (!eventScopeMatch(r, scope || {}, s(sku))) return;
if (!cd) throw eventError('EVENT_CALCULATION_DATE_INVALID', calculationDate == null ? 'missing' : s(calculationDate));
var code = eventRowIssue(r); if (code) throw eventError(code, eventIdOf(r) || '');
if (!eventCountsOn(r, cd)) return;
var ed = eventDates(r); if (!ed) return;
var q = eventQtyOf(r).qty; if (!(q > 0)) return;


out.push({ prepDate: ed.prepDate, qty: q, startDate: ed.startDate, firstSuggestionMonday: ed.firstSuggestionMonday });
});
return out;
}


function eventSellingWindow(startDate, endDate, qty, calculationDate) {
var st = realYmd(startDate), en = realYmd(endDate || startDate), cd = realYmd(calculationDate);
if (!st || !en || !cd || ymdOrd(en) < ymdOrd(st) || typeof qty !== 'number' || !isFinite(qty) || qty < 0) {
throw eventError('EVENT_SELLING_WINDOW_INVALID');
}
var startMs = Date.UTC(st.y, st.mo - 1, st.d), endMs = Date.UTC(en.y, en.mo - 1, en.d);
var tomorrow = Date.UTC(cd.y, cd.mo - 1, cd.d) + 86400000;
var totalDays = (endMs - startMs) / 86400000 + 1;
var remainingDays = Math.max(0, (endMs - Math.max(startMs, tomorrow)) / 86400000 + 1);
return { startDate: ymdIso(st), endDate: ymdIso(en), qty: qty, totalDays: totalDays,
dailyQty: qty / totalDays, remainingDays: remainingDays, remainingQty: qty * remainingDays / totalDays };
}
function scopedSpecialEventSellingDays(eventRows, scope, sku, calculationDate) {
var check = validateScopedEvents(eventRows, scope, sku, calculationDate);
if (!check.ok) throw eventError(check.issues[0].code);
return (eventRows || []).filter(function (r) { return eventScopeMatch(r, scope, sku); }).map(function (r) {
return eventSellingWindow(eventStartRaw(r), eventEndRaw(r), eventQtyOf(r).qty, calculationDate);
}).filter(function (e) { return e.remainingDays > 0 && e.qty > 0; });
}

return {
VERSION: 'kmpd-v3-1',
SPECIAL_EVENT_PREP_OFFSET_DAYS: SPECIAL_EVENT_PREP_OFFSET_DAYS,
resolveTargetRule: resolveTargetRule,
resolveTargetPct: resolveTargetPct,
trScopeType: trScopeType,
trBusinessKey: trBusinessKey,
TR_SCOPE_TYPES: TR_SCOPE_TYPES_,
TR_PRECEDENCE: TR_PRECEDENCE_,
scopedSpecialEventPreps: scopedSpecialEventPreps,
eventSellingWindow: eventSellingWindow,
scopedSpecialEventSellingDays: scopedSpecialEventSellingDays,
validateScopedEvents: validateScopedEvents,
eventDates: eventDates,
eventQtyOf: eventQtyOf,
baseRegularFc: baseRegularFc,
adjustedRegularFc: adjustedRegularFc,
eventPrepMonth: eventPrepMonth,
specialEventFcForMonth: specialEventFcForMonth,
planningDemandByMonth: planningDemandByMonth,
currentMonthRemainingDemand: currentMonthRemainingDemand
};
});
__kmRegister("supply-planning-planning-demand", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;

















(function (root, factory) {
var api = factory();
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.timePhasedProjection = api; window.KM.timePhasedProjection = api; }
return api;
})(this, function () {
'use strict';

var DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function iss(code, message, details) { return { code: code, message: message || code, details: details || null }; }

function numOrNull(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return (isFinite(n)) ? n : null; }
function isIso(v) { return typeof v === 'string' && DATE_RE.test(v); }

function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function dayOrdinal(iso) {
var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var n = d; for (var i = 0; i < m - 1; i++) n += dim[i]; return y * 366 + n;
}






function streamCompare(a, b) {
if (a.ord !== b.ord) return a.ord - b.ord;
if (a.t !== b.t) return a.t - b.t;
return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
}


function projectTimePhasedSupply(input) {
var issues = [];
if (!isObj(input)) return fail([iss('INVALID_INPUT', 'input must be an object')], null);
var destination = (input.destination === undefined ? null : input.destination);

var opening = numOrNull(input.openingSupplyQty);
if (opening === null) {

return fail([iss('OPENING_SUPPLY_UNAVAILABLE', 'openingSupplyQty is required (missing ≠ zero)')], destination);
}
if (opening < 0) return fail([iss('OPENING_SUPPLY_INVALID', 'openingSupplyQty must be ≥ 0')], destination);

var demandRaw = Array.isArray(input.demandEvents) ? input.demandEvents : [];
var incomingRaw = Array.isArray(input.incomingEvents) ? input.incomingEvents : [];
var cpRaw = Array.isArray(input.checkpoints) ? input.checkpoints : [];

var stream = [];
var i, e, q, dt;

for (i = 0; i < incomingRaw.length; i++) {
e = incomingRaw[i] || {}; dt = e.availableDate; q = numOrNull(e.qty);
if (!isIso(dt)) return fail([iss('INCOMING_DATE_INVALID', 'incomingEvents[' + i + '].availableDate must be YYYY-MM-DD', { got: dt })], destination);
if (q === null || q < 0) return fail([iss('INCOMING_QTY_INVALID', 'incomingEvents[' + i + '].qty must be a finite number ≥ 0', { got: e.qty })], destination);
stream.push({ t: 0, ord: dayOrdinal(dt), key: String(e.incomingId == null ? ('in#' + i) : e.incomingId),
ev: { kind: 'INCOMING', date: dt, qty: q, incomingId: (e.incomingId == null ? null : String(e.incomingId)), sourceType: (e.sourceType == null ? null : String(e.sourceType)), tier: (e.tier == null ? null : String(e.tier)) } });
}
for (i = 0; i < demandRaw.length; i++) {
e = demandRaw[i] || {}; dt = e.date; q = numOrNull(e.qty);
if (!isIso(dt)) return fail([iss('DEMAND_DATE_INVALID', 'demandEvents[' + i + '].date must be YYYY-MM-DD', { got: dt })], destination);
if (q === null || q < 0) return fail([iss('DEMAND_QTY_INVALID', 'demandEvents[' + i + '].qty must be a finite number ≥ 0', { got: e.qty })], destination);
stream.push({ t: 1, ord: dayOrdinal(dt), key: String(e.tier == null ? '' : e.tier) + '|' + String(e.demandId == null ? ('d#' + i) : e.demandId),
ev: { kind: 'DEMAND', date: dt, qty: q, demandId: (e.demandId == null ? null : String(e.demandId)), demandType: (e.demandType == null ? null : String(e.demandType)), tier: (e.tier == null ? null : String(e.tier)), month: (e.month == null ? null : String(e.month)) } });
}
for (i = 0; i < cpRaw.length; i++) {
e = cpRaw[i] || {}; dt = e.date;
if (!isIso(dt)) return fail([iss('CHECKPOINT_DATE_INVALID', 'checkpoints[' + i + '].date must be YYYY-MM-DD', { got: dt })], destination);
stream.push({ t: 2, ord: dayOrdinal(dt), key: String(e.checkpointId == null ? ('cp#' + i) : e.checkpointId),
ev: { kind: 'CHECKPOINT', date: dt, checkpointId: (e.checkpointId == null ? null : String(e.checkpointId)), cpKind: (e.kind == null ? null : String(e.kind)), tier: (e.tier == null ? null : String(e.tier)), month: (e.month == null ? null : String(e.month)) } });
}

stream.sort(streamCompare);

var balance = opening, cumDemand = 0, cumCovered = 0, cumIncoming = 0;
var timeline = [], checkpoints = [];
var tierMap = {}, tierOrder = [];
function tierRec(tier, month) {
if (!Object.prototype.hasOwnProperty.call(tierMap, tier)) {


tierMap[tier] = { tier: tier, month: (month == null ? null : month), openingSupplyQty: balance,
incomingAddedQty: 0, demandQty: 0, coveredQty: 0, remainingSupplyQty: balance, remainingGapQty: 0 };
tierOrder.push(tier);
} else if (month != null && tierMap[tier].month == null) { tierMap[tier].month = month; }
return tierMap[tier];
}

for (i = 0; i < stream.length; i++) {
e = stream[i].ev;
if (e.kind === 'INCOMING') {
if (e.tier != null) tierRec(e.tier).incomingAddedQty += e.qty;
balance += e.qty; cumIncoming += e.qty;
if (e.tier != null) tierMap[e.tier].remainingSupplyQty = balance;
timeline.push({ date: e.date, kind: 'INCOMING', qty: e.qty, tier: e.tier, balanceAfter: balance });
} else if (e.kind === 'DEMAND') {
var rec = (e.tier != null) ? tierRec(e.tier, e.month) : null;
var covered = Math.min(balance, e.qty);
balance -= covered; cumDemand += e.qty; cumCovered += covered;
if (rec) { rec.demandQty += e.qty; rec.coveredQty += covered; rec.remainingGapQty += (e.qty - covered); rec.remainingSupplyQty = balance; }
timeline.push({ date: e.date, kind: 'DEMAND', qty: e.qty, tier: e.tier, coveredQty: covered, shortageQty: (e.qty - covered), balanceAfter: balance });
} else {
checkpoints.push({ checkpointId: e.checkpointId, date: e.date, kind: e.cpKind, tier: e.tier, month: e.month,
cumulativeDemandQty: cumDemand, cumulativeCoveredQty: cumCovered, cumulativeIncomingQty: cumIncoming, remainingSupplyQty: balance, gapQty: (cumDemand - cumCovered) });
}
}

var monthlyProjection = tierOrder.map(function (t) {
var r = tierMap[t];
return { tier: r.tier, month: r.month, openingSupplyQty: r.openingSupplyQty, incomingAddedQty: r.incomingAddedQty,
demandQty: r.demandQty, coveredQty: r.coveredQty, remainingSupplyQty: r.remainingSupplyQty, remainingGapQty: r.remainingGapQty };
});

return {
ready: true, timeline: timeline, checkpoints: checkpoints, monthlyProjection: monthlyProjection, issues: issues,
meta: { deterministic: true, destination: destination, openingSupplyQty: opening, totalIncomingQty: cumIncoming,
totalDemandQty: cumDemand, totalCoveredQty: cumCovered, endingSupplyQty: balance,
checkpointCount: checkpoints.length, tierCount: tierOrder.length }
};

function fail(errs, dest) {
return { ready: false, timeline: [], checkpoints: [], monthlyProjection: [], issues: errs,
meta: { deterministic: true, destination: dest } };
}
}

return { projectTimePhasedSupply: projectTimePhasedSupply, VERSION: 'kmtpp-fm3b-1' };
});
__kmRegister("supply-planning-time-phased-projection", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;














(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-time-phased-projection.js') : (root.KMTPP || (root.KM && root.KM.core && root.KM.core.timePhasedProjection)),
req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations))
);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.horizonProjection = api; window.KM.horizonProjection = api; }
return api;
})(this, function (KMTPP, KMCALC) {
'use strict';

var DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
var HORIZON_DAYS = [18, 30, 45, 90];
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isIso(v) { return typeof v === 'string' && DATE_RE.test(v); }
function numOrNull(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }

function daysInMonth(y, m) { return [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }

function nextDay(y, m, d) { d++; if (d > daysInMonth(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; } } return [y, m, d]; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function iso(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }


function hround(x, tolerance) {
var half = Math.floor(x) + 0.5;
if (tolerance && Math.abs(x - half) <= tolerance) x = half;
return Math.round(x);
}




function projectHorizons(input) {
if (!isObj(input)) return fail(null, 'INVALID_INPUT', 'input must be an object');
var calcDate = input.calculationDate;
if (calcDate === undefined || calcDate === null || calcDate === '') return fail(null, 'CALCULATION_DATE_NOT_CONFIGURED', 'calculationDate is required (no clock fallback)');
if (!isIso(calcDate)) return fail(null, 'CALCULATION_DATE_INVALID', 'calculationDate must be YYYY-MM-DD', { got: calcDate });

var destination = (input.destination === undefined ? null : input.destination);
var fcByMonth = isObj(input.regularFcByMonth) ? input.regularFcByMonth : {};
var upc = input.unitsPerCarton;
var horizonDays = (Array.isArray(input.horizonDays) && input.horizonDays.length) ? input.horizonDays.slice() : HORIZON_DAYS.slice();
var maxN = 0; horizonDays.forEach(function (n) { if (n > maxN) maxN = n; });











var demandMode = (input.demandMode === undefined || input.demandMode === null || input.demandMode === '') ? 'forecast_driven' : String(input.demandMode);
if (demandMode !== 'forecast_driven' && demandMode !== 'sales_driven') return fail(null, 'PLANNING_MODEL_UNKNOWN', 'demandMode must be forecast_driven | sales_driven (the Planning Model is caller-resolved and never guessed)', { got: input.demandMode });
var salesRate = null;
if (demandMode === 'sales_driven') {
salesRate = numOrNull(input.avgSalesPerDay);
if (salesRate === null || salesRate < 0) return fail(null, 'SALES_BASIS_UNAVAILABLE', 'sales_driven horizon requires a finite non-negative avgSalesPerDay from the canonical normalizedAvgSalesPerDay owner', { got: input.avgSalesPerDay });
}

var y = +calcDate.slice(0, 4), m = +calcDate.slice(5, 7), d = +calcDate.slice(8, 10);

var sellingDays = input.specialEventTiming === 'selling_days';
var sellingEvents = sellingDays && Array.isArray(input.specialEventDemands) ? input.specialEventDemands : [];
for (var si = 0; si < sellingEvents.length; si++) {
var seCheck = sellingEvents[si];
if (!seCheck || !isIso(seCheck.startDate) || !isIso(seCheck.endDate) || seCheck.endDate < seCheck.startDate ||
numOrNull(seCheck.dailyQty) === null || seCheck.dailyQty < 0) return fail(null, 'EVENT_SELLING_WINDOW_INVALID');
}





var demandEvents = [], missingMonths = {}, cy = y, cm = m, cd = d, i, t;
for (i = 1; i <= maxN; i++) {
t = nextDay(cy, cm, cd); cy = t[0]; cm = t[1]; cd = t[2];
var dISO = iso(cy, cm, cd), ym = dISO.slice(0, 7);
var eventDaily = 0;
sellingEvents.forEach(function (se) {
if (dISO >= se.startDate && dISO <= se.endDate) eventDaily += Number(se.dailyQty);
});
if (eventDaily > 0) demandEvents.push({ demandId: 'SEV-' + dISO, date: dISO, qty: eventDaily, demandType: 'SPECIAL_EVENT_DAILY', month: ym });
if (demandMode === 'sales_driven') {
demandEvents.push({ demandId: 'SRD-' + dISO, date: dISO, qty: salesRate, demandType: 'SALES_RUN_RATE_DAILY', month: ym });
continue;
}
var mfc = numOrNull(fcByMonth[ym]);
if (mfc === null) { missingMonths[ym] = 1; continue; }
demandEvents.push({ demandId: 'RFC-' + dISO, date: dISO, qty: mfc / daysInMonth(cy, cm), demandType: 'REGULAR_FORECAST_DAILY', month: ym });
}


(Array.isArray(input.specialEventDemands) ? input.specialEventDemands : []).forEach(function (se, k) {
if (sellingDays) return;
se = se || {}; var pd = String(se.prepDate == null ? '' : se.prepDate); var q = numOrNull(se.qty);
if (!isIso(pd) || q === null || q <= 0) return;
demandEvents.push({ demandId: 'SEV-' + k + '-' + pd, date: pd, qty: q, demandType: 'SPECIAL_EVENT', month: pd.slice(0, 7) });
});


var checkpoints = [], cpDateByN = {};
horizonDays.forEach(function (N) {
var wy = y, wm = m, wd = d, k, r;
for (k = 0; k < N; k++) { r = nextDay(wy, wm, wd); wy = r[0]; wm = r[1]; wd = r[2]; }
cpDateByN[N] = iso(wy, wm, wd);
checkpoints.push({ checkpointId: 'D' + N, date: cpDateByN[N], kind: 'DAY' });
});


var incomingEvents = (Array.isArray(input.incomingEvents) ? input.incomingEvents : []).map(function (e) {
e = e || {};
return { incomingId: (e.incomingId == null ? null : String(e.incomingId)), availableDate: String(e.eta == null ? '' : e.eta), qty: numOrNull(e.qty), sourceType: (e.sourceType == null ? null : String(e.sourceType)) };
});


var proj = KMTPP.projectTimePhasedSupply({ destination: destination, openingSupplyQty: input.openingSupplyQty, demandEvents: demandEvents, incomingEvents: incomingEvents, checkpoints: checkpoints });
if (!proj || proj.ready !== true) {
return { ready: false, horizons: [], issues: (proj && proj.issues) || [{ code: 'HORIZON_PROJECTION_BLOCKED', message: 'time-phased projection not ready', details: null }],
meta: { deterministic: true, calculationDate: calcDate, destination: destination } };
}

var cpByN = {}; proj.checkpoints.forEach(function (c) { cpByN[c.checkpointId] = c; });
function windowHasMissing(N) { var wy = y, wm = m, wd = d, k, r; for (k = 0; k < N; k++) { r = nextDay(wy, wm, wd); wy = r[0]; wm = r[1]; wd = r[2]; if (missingMonths[iso(wy, wm, wd).slice(0, 7)]) return true; } return false; }

var opening = proj.meta.openingSupplyQty;
var horizons = horizonDays.map(function (N) {
var wc = 'D' + N, cp = cpByN[wc], reqBy = cpDateByN[N];
if (!cp || windowHasMissing(N)) {

return { windowCode: wc, requiredByDate: reqBy, demandQty: null, openingSupplyQty: opening, incomingAddedQty: null, coveredQty: null, remainingSupplyQty: null, gapQty: null, suggestedOrderQty: null };
}


var tolerance = sellingDays ? Math.min(1e-7, Number.EPSILON * 4 * (demandEvents.length + incomingEvents.length + 1)
* Math.max(1, cp.cumulativeDemandQty, cp.cumulativeCoveredQty, opening + cp.cumulativeIncomingQty)) : 0;
var demandQty = hround(cp.cumulativeDemandQty, tolerance);
var coveredQty = hround(cp.cumulativeCoveredQty, tolerance);
var remainingSupplyQty = hround(cp.remainingSupplyQty, tolerance);
var incomingAddedQty = hround(cp.cumulativeIncomingQty || 0, tolerance);
var gapQty = Math.max(0, hround(cp.cumulativeDemandQty - cp.cumulativeCoveredQty, tolerance));
var sug = null;
if (gapQty <= 0) sug = 0;
else if (typeof upc === 'number' && isFinite(upc) && upc > 0 && Math.floor(upc) === upc) { try { sug = KMCALC.calculateSuggestedOrderQty({ netOrderNeed: gapQty, unitsPerCarton: upc }); } catch (e) { sug = null; } }
return { windowCode: wc, requiredByDate: reqBy, demandQty: demandQty, openingSupplyQty: opening, incomingAddedQty: incomingAddedQty, coveredQty: coveredQty, remainingSupplyQty: remainingSupplyQty, gapQty: gapQty, suggestedOrderQty: sug };
});

var result = { ready: true, horizons: horizons, issues: [],
meta: { deterministic: true, calculationDate: calcDate, destination: destination, openingSupplyQty: opening, horizonDays: horizonDays,
demandMode: demandMode, avgSalesPerDay: (demandMode === 'sales_driven' ? salesRate : null) } };
if (input.includeTimeline === true) result.timeline = proj.timeline;
return result;

function fail(dummy, code, message, details) {
return { ready: false, horizons: [], issues: [{ code: code, message: message || code, details: details || null }],
meta: { deterministic: true, calculationDate: (isIso(input && input.calculationDate) ? input.calculationDate : null), destination: (isObj(input) && input.destination !== undefined ? input.destination : null) } };
}
}

return { projectHorizons: projectHorizons, HORIZON_DAYS: HORIZON_DAYS.slice(), VERSION: 'kmhp-fm5r4uir3-1' };
});
__kmRegister("supply-planning-horizon-projection", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;

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
__kmRegister("supply-planning-daily-warehouse-allocation", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;
















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-source-projection.js') : (root.KMSP || (root.KM && root.KM.sourceProjection)),
req ? req('./supply-planning-plan-builder.js') : (root.KMPB || (root.KM && root.KM.planBuilder)),
req ? req('./supply-planning-allocation-facts.js') : (root.KMAF || (root.KM && root.KM.allocationFacts))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.productionSource = api; }
})(this, function (KMSP, KMPB, KMAF) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nonEmpty(v) { return str(v).length > 0; }




var XCO_PLAN_LINKS_READ_MODE = 'A';
var CANONICAL_TABLES = [
{ key: 'skuDetails', sheet: 'sku_details', required: false },
{ key: 'marketplaceSkus', sheet: 'marketplace_skus', required: false },
{ key: 'warehouses', sheet: 'warehouses', required: false },
{ key: 'marketplaces', sheet: 'marketplaces', required: false },
{ key: 'fcRegularForecast', sheet: 'fc_regular_forecast', required: false },
{ key: 'fcSpecialEvents', sheet: 'fc_special_events', required: false },
{ key: 'amazonInventorySnapshot', sheet: 'amazon_inventory_snapshot', required: false },
{ key: 'overseasInventorySnapshot', sheet: 'overseas_inventory_snapshot', required: false },
{ key: 'factoryStock', sheet: 'factory_stock', required: false },
{ key: 'shippingPlans', sheet: 'shipping_plans', required: false },
{ key: 'shipments', sheet: 'shipments', required: false },


{ key: 'shipmentLines', sheet: 'shipment_lines', required: false },
{ key: 'shippingPlanLines', sheet: 'shipping_plan_lines', required: false },

{ key: 'shipmentPlanLinks', sheet: 'shipment_plan_links', required: false },

{ key: 'replenishmentDemandAllocationRules', sheet: 'replenishment_demand_allocation_rules', required: false },

{ key: 'fcTargetRules', sheet: 'fc_target_rules', required: false },



{ key: 'amazonDailySalesSnapshot', sheet: 'amazon_daily_sales_snapshot', required: false },
{ key: 'amazonWeeklySalesSnapshot', sheet: 'amazon_weekly_sales_snapshot', required: false },




{ key: 'campaigns', sheet: 'campaigns', required: false },
{ key: 'campaignSkuLines', sheet: 'campaign_sku_lines', required: false },



{ key: 'purchaseOrderLines', sheet: 'purchase_order_lines', required: false },
{ key: 'requestOrderLineSources', sheet: 'request_order_line_sources', required: false }
];





























function tablesFor(config) {
var over = (config && config.sheetNames) || {};
var only = (config && Array.isArray(config.only)) ? config.only : null;
if (only) {
var known = {};
CANONICAL_TABLES.forEach(function (e) { known[e.key] = 1; });
var bad = only.filter(function (k) { return !Object.prototype.hasOwnProperty.call(known, k); });
if (bad.length) {
throw new Error('readCanonicalSnapshots: config.only names unknown canonical table key(s): '
+ bad.join(', ') + '. Known keys: ' + Object.keys(known).join(', '));
}
}
var out = [];
CANONICAL_TABLES.forEach(function (e) {
if (only && only.indexOf(e.key) === -1) return;
if (e.key === 'shipmentPlanLinks' && XCO_PLAN_LINKS_READ_MODE !== 'A') return;
out.push({ key: e.key, sheet: over[e.key] ? str(over[e.key]) : e.sheet, required: e.required });
});
return out;
}




function readCanonicalSnapshots(spreadsheet, config) {
aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'readCanonicalSnapshots: spreadsheet.getSheetByName required');
var entries = tablesFor(config);
var snapshots = {};
var issues = [];
entries.forEach(function (e) {
var sheet = spreadsheet.getSheetByName(e.sheet);
if (!sheet) { issues.push({ sourceType: e.key, sheetName: e.sheet, reason: 'SOURCE_NOT_AVAILABLE' }); return; }
var lastRow = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : null;
if (lastRow === 0) { issues.push({ sourceType: e.key, sheetName: e.sheet, reason: 'MISSING_SNAPSHOT' }); return; }
var values = sheet.getDataRange().getValues();
if (!values || !values.length) { issues.push({ sourceType: e.key, sheetName: e.sheet, reason: 'MISSING_SNAPSHOT' }); return; }
var headers = values[0].map(function (h) { return str(h); });
var rows = [];
for (var r = 1; r < values.length; r++) rows.push(values[r].slice());
snapshots[e.key] = { headers: headers, rows: rows };
});
return { snapshots: snapshots, issues: issues };
}


function projectionInput(request, snapshots) {
return {
recommendationType: request.recommendationType, planningCycle: request.planningCycle,
businessScope: request.businessScope, sourceSnapshots: snapshots,
planningFacts: request.planningFacts, receiverFacts: request.receiverFacts,
factoryDemandFacts: request.factoryDemandFacts, routing: request.routing,
requiredByDate: request.requiredByDate, forecastMonth: request.forecastMonth,
formulaVersion: request.formulaVersion, sourceDataAsOf: request.sourceDataAsOf
};
}








function applyAllocationFacts(request) {
if (!isObj(request) || !isObj(request.allocationFactsInput)) return { request: request, facts: null };
aType(KMAF && typeof KMAF.projectAllocationFacts === 'function', 'applyAllocationFacts: KMAF.projectAllocationFacts unavailable');
var afInput = request.allocationFactsInput;
if (afInput.recommendationType === undefined) afInput = mergeShallow(afInput, { recommendationType: request.recommendationType });
if (afInput.businessScope === undefined) afInput = mergeShallow(afInput, { businessScope: request.businessScope });
if (afInput.planningCycle === undefined) afInput = mergeShallow(afInput, { planningCycle: request.planningCycle });
var facts = KMAF.projectAllocationFacts(afInput);
var merged = mergeShallow(request, {
receiverFacts: facts.receiverFacts, factoryDemandFacts: facts.factoryDemandFacts, planningFacts: facts.planningFacts
});
return { request: merged, facts: facts };
}
function mergeShallow(a, b) { var o = {}; for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k]; for (var j in b) if (Object.prototype.hasOwnProperty.call(b, j)) o[j] = b[j]; return o; }
function producerIssues(facts) { return facts ? (facts.issues || []).map(function (x) { return { stage: 'allocationFacts', code: x.code, ref: x.ref, reason: x.message }; }) : []; }




function resolveProductionFacts(spreadsheet, request) {
aType(isObj(request), 'resolveProductionFacts: request required');
var af = applyAllocationFacts(request); request = af.request;
var read = readCanonicalSnapshots(spreadsheet, request.config);
var full = KMSP.projectAndRead(projectionInput(request, read.snapshots));
var projIssues = (full.projection && full.projection.issues) || [];
var srcIssues = (full.sourceIssues || []).concat(read.issues).concat(projIssues).concat(producerIssues(af.facts));
if (full.ready === false) {
return { lines: [], ready: false, reason: full.reason, formulaVersion: request.formulaVersion,
sourceDataAsOf: (full.projection && full.projection.sourceDataAsOf) || request.sourceDataAsOf, sourceIssues: srcIssues };
}
return { lines: full.lines || [], ready: full.ready !== false, reason: full.reason,
formulaVersion: full.formulaVersion, sourceDataAsOf: full.sourceDataAsOf, sourceIssues: srcIssues };
}


function buildProductionRecommendationSource(spreadsheet, request) {
aType(isObj(request), 'buildProductionRecommendationSource: request required');
var af = applyAllocationFacts(request); request = af.request;



var read = isObj(request.preReadSnapshots) ? { snapshots: request.preReadSnapshots, issues: [] } : readCanonicalSnapshots(spreadsheet, request.config);
var full = KMSP.projectAndRead(projectionInput(request, read.snapshots));
var proj = full.projection || {};
var srcIssues = (full.sourceIssues || []).concat(read.issues).concat(proj.issues || []).concat(producerIssues(af.facts));
var ready = full.ready !== false && !!full.bridgeResult;
var recommendationPlan = ready ? KMPB.buildRecommendation(full.bridgeResult) : null;
return {
ready: ready, status: ready ? 'READY' : 'BLOCKED', reason: full.reason || null,
recommendationType: request.recommendationType, planningCycle: request.planningCycle,
businessScope: request.businessScope,
recommendationPlan: recommendationPlan,
lines: (full.bridgeResult && full.bridgeResult.lines) || [],
issues: srcIssues,




supplySourceEntries: (proj.supplySourceEntries || []),


warehouseQualifiedEvents: (proj.warehouseQualifiedEvents || []),
demandSourceEntries: (proj.demandSourceEntries || []),
sourceDataAsOf: full.sourceDataAsOf !== undefined ? full.sourceDataAsOf : (proj.sourceDataAsOf || null),
formulaVersion: full.formulaVersion !== undefined ? full.formulaVersion : (request.formulaVersion || null),
lineage: { origin: 'PRODUCTION_SOURCE_READ_ONLY', demandCount: (proj.demandSourceEntries || []).length, supplyCount: (proj.supplySourceEntries || []).length },
persistenceStatus: 'NOT_EXECUTED'
};
}

return {
CANONICAL_TABLES: CANONICAL_TABLES.map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; return c; }),
tablesFor: tablesFor,
readCanonicalSnapshots: readCanonicalSnapshots,
xcoPlanLinksReadMode: XCO_PLAN_LINKS_READ_MODE,
resolveProductionFacts: resolveProductionFacts,
buildProductionRecommendationSource: buildProductionRecommendationSource
};
});






__kmRegister("supply-planning-production-source", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;















(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.productionSafety = api; }
if (typeof root !== 'undefined' && root) { root.KMSAFE = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }


var EXECUTION_MODES = { RUNTIME_READ: 'RUNTIME_READ', RUNTIME_WRITE: 'RUNTIME_WRITE', DIAGNOSTIC_READ: 'DIAGNOSTIC_READ', SCHEMA_MIGRATION: 'SCHEMA_MIGRATION' };


var SCHEMA_STATUS = {
SCHEMA_VALID: 'SCHEMA_VALID', SHEET_MISSING: 'SHEET_MISSING', HEADER_MISSING: 'HEADER_MISSING',
HEADER_BLANK: 'HEADER_BLANK', HEADER_DUPLICATE: 'HEADER_DUPLICATE', HEADER_ORDER_MISMATCH: 'HEADER_ORDER_MISMATCH',
HEADER_UNEXPECTED: 'HEADER_UNEXPECTED', ROW_WIDTH_MISMATCH: 'ROW_WIDTH_MISMATCH',
WRONG_SPREADSHEET_TARGET: 'WRONG_SPREADSHEET_TARGET', SCHEMA_NOT_PROVISIONED: 'SCHEMA_NOT_PROVISIONED'
};
var BARRIER = {
HEADER_WRITE_PROHIBITED: 'HEADER_WRITE_PROHIBITED', STRUCTURAL_MUTATION_PROHIBITED: 'STRUCTURAL_MUTATION_PROHIBITED',
WHOLE_SHEET_REPLACEMENT_PROHIBITED: 'WHOLE_SHEET_REPLACEMENT_PROHIBITED', MIGRATION_AUTHORIZATION_REQUIRED: 'MIGRATION_AUTHORIZATION_REQUIRED'
};


var STRUCTURAL_OPS = {
clear: 1, clearContent: 1, clearContents: 1, deleteRow: 1, deleteRows: 1, deleteColumn: 1, deleteColumns: 1,
insertRowsBefore: 1, insertRowsAfter: 1, insertColumnsBefore: 1, insertColumnsAfter: 1, insertColumns: 1,
insertColumn: 1, deleteSheet: 1, insertSheet: 1, copyTo: 1, moveTo: 1, setName: 1, renameSheet: 1,
resetSheet: 1, reinitializeSheet: 1
};
var WHOLE_SHEET_OPS = { wholeSheetSetValues: 1, replaceSheet: 1, rebuildSheet: 1 };

function safetyError(token, message) { var e = new Error(token + (message ? ': ' + message : '')); e.safetyToken = token; return e; }




function assertExpectedSpreadsheetId(spreadsheet, expectedSpreadsheetId) {
var expected = str(expectedSpreadsheetId);
if (expected === '') throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'no configured expected Spreadsheet ID (fail closed)');
if (!isObj(spreadsheet) || typeof spreadsheet.getId !== 'function') throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'no Spreadsheet / getId() (fail closed)');
var actual;
try { actual = str(spreadsheet.getId()); } catch (e) { throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'getId() threw (fail closed)'); }
if (actual === '') throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'Spreadsheet has no id (fail closed)');
if (actual !== expected) throw safetyError(SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, 'expected ' + expected + ' got ' + actual);
return { ok: true, spreadsheetId: actual };
}

function checkExpectedSpreadsheetId(spreadsheet, expectedSpreadsheetId) {
try { return assertExpectedSpreadsheetId(spreadsheet, expectedSpreadsheetId); }
catch (e) { return { ok: false, spreadsheetId: (isObj(spreadsheet) && typeof spreadsheet.getId === 'function') ? (function () { try { return str(spreadsheet.getId()); } catch (x) { return ''; } })() : '' }; }
}


function dupHeaders(headers) { var seen = {}, dup = []; headers.forEach(function (h) { if (h === '') return; if (seen[h]) { if (dup.indexOf(h) < 0) dup.push(h); } else seen[h] = 1; }); return dup; }
function blankIndexes(headers) { var out = []; headers.forEach(function (h, i) { if (h === '') out.push(i); }); return out; }




function classifySchemaMismatch(input) {
aType(isObj(input), 'classifySchemaMismatch: input required');
aType(Array.isArray(input.expectedHeaders), 'classifySchemaMismatch: expectedHeaders[] required');
var expected = input.expectedHeaders.map(str);
var exists = input.exists !== false;
var actual = Array.isArray(input.actualHeaders) ? input.actualHeaders.map(str) : [];
var rowWidths = Array.isArray(input.rowWidths) ? input.rowWidths.slice() : null;
var policy = str(input.extraColumnsPolicy).toUpperCase() === 'ALLOW' ? 'ALLOW' : 'BLOCK';

var have = {}; actual.forEach(function (h) { if (h !== '') have[h] = 1; });
var expectedSet = {}; expected.forEach(function (h) { expectedSet[h] = 1; });
var missingHeaders = expected.filter(function (h) { return !have[h]; });
var duplicateHeaders = dupHeaders(actual);
var blankHeaderIndexes = blankIndexes(actual);
var unexpectedHeaders = actual.filter(function (h) { return h !== '' && !expectedSet[h]; });

var orderMismatch = false;
for (var i = 0; i < expected.length; i++) { if (actual[i] !== expected[i]) { orderMismatch = true; break; } }
var rowWidthMismatch = false;
if (rowWidths) { for (var r = 0; r < rowWidths.length; r++) { if (rowWidths[r] > actual.length) { rowWidthMismatch = true; break; } } }


var schemaStatus;
if (!exists) schemaStatus = SCHEMA_STATUS.SHEET_MISSING;
else if (actual.length === 0) schemaStatus = SCHEMA_STATUS.HEADER_MISSING;
else if (blankHeaderIndexes.length) schemaStatus = SCHEMA_STATUS.HEADER_BLANK;
else if (duplicateHeaders.length) schemaStatus = SCHEMA_STATUS.HEADER_DUPLICATE;
else if (missingHeaders.length) schemaStatus = SCHEMA_STATUS.HEADER_MISSING;
else if (orderMismatch) schemaStatus = SCHEMA_STATUS.HEADER_ORDER_MISMATCH;
else if (policy === 'BLOCK' && unexpectedHeaders.length) schemaStatus = SCHEMA_STATUS.HEADER_UNEXPECTED;
else if (rowWidthMismatch) schemaStatus = SCHEMA_STATUS.ROW_WIDTH_MISMATCH;
else schemaStatus = SCHEMA_STATUS.SCHEMA_VALID;

return {
schemaStatus: schemaStatus, valid: schemaStatus === SCHEMA_STATUS.SCHEMA_VALID,
actualHeaders: actual, expectedHeaders: expected, missingHeaders: missingHeaders,
blankHeaderIndexes: blankHeaderIndexes, duplicateHeaders: duplicateHeaders,
unexpectedHeaders: unexpectedHeaders, orderMismatch: orderMismatch, rowWidthMismatch: rowWidthMismatch,
extraColumnsPolicy: policy
};
}



function createReadOnlyTableSnapshot(spreadsheet, sheetName) {
aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'createReadOnlyTableSnapshot: spreadsheet.getSheetByName required');
var sheet = spreadsheet.getSheetByName(sheetName);
if (!sheet) return { exists: false, headers: [], rows: [], rowCount: 0, rowWidths: [] };
var lastRow = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : null;
if (lastRow === 0) return { exists: true, headers: [], rows: [], rowCount: 0, rowWidths: [] };
var values = sheet.getDataRange().getValues();
if (!values || !values.length) return { exists: true, headers: [], rows: [], rowCount: 0, rowWidths: [] };
var headers = values[0].map(str);
var rows = [], rowWidths = [];
for (var r = 1; r < values.length; r++) { rows.push(values[r].slice()); rowWidths.push(values[r].length); }
return { exists: true, headers: headers, rows: rows, rowCount: rows.length, rowWidths: rowWidths };
}


function validateCanonicalHeaders(snapshot, expectedHeaders, opts) {
opts = isObj(opts) ? opts : {};
var s = isObj(snapshot) ? snapshot : {};
return classifySchemaMismatch({
exists: s.exists, actualHeaders: s.headers || [], rowWidths: s.rowWidths || null,
expectedHeaders: expectedHeaders, extraColumnsPolicy: opts.extraColumnsPolicy
});
}




function validateCanonicalTable(spreadsheet, opts) {
aType(isObj(opts) && str(opts.sheetName) !== '', 'validateCanonicalTable: opts.sheetName required');
aType(Array.isArray(opts.expectedHeaders), 'validateCanonicalTable: opts.expectedHeaders[] required');
var idCheck = checkExpectedSpreadsheetId(spreadsheet, opts.expectedSpreadsheetId);
if (!idCheck.ok) {
return {
ready: false, spreadsheetId: idCheck.spreadsheetId, sheetName: opts.sheetName,
schemaStatus: SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, actualHeaders: [], expectedHeaders: opts.expectedHeaders.map(str),
missingHeaders: opts.expectedHeaders.map(str), blankHeaderIndexes: [], duplicateHeaders: [], unexpectedHeaders: [],
orderMismatch: false, rowCount: 0, issues: [{ reason: SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET }]
};
}
var snap = createReadOnlyTableSnapshot(spreadsheet, opts.sheetName);
var c = validateCanonicalHeaders(snap, opts.expectedHeaders, { extraColumnsPolicy: opts.extraColumnsPolicy });
var issues = c.schemaStatus === SCHEMA_STATUS.SCHEMA_VALID ? [] : [{ reason: c.schemaStatus }];
return {
ready: c.valid, spreadsheetId: idCheck.spreadsheetId, sheetName: opts.sheetName,
schemaStatus: c.schemaStatus, actualHeaders: c.actualHeaders, expectedHeaders: c.expectedHeaders,
missingHeaders: c.missingHeaders, blankHeaderIndexes: c.blankHeaderIndexes, duplicateHeaders: c.duplicateHeaders,
unexpectedHeaders: c.unexpectedHeaders, orderMismatch: c.orderMismatch, rowCount: snap.rowCount, issues: issues
};
}




function assertDataRowWriteRange(op) {
aType(isObj(op), 'assertDataRowWriteRange: op required');
var startRow = Number(op.startRow);
var numRows = op.numberOfRows === undefined ? (op.numRows === undefined ? 1 : Number(op.numRows)) : Number(op.numberOfRows);
if (!(startRow >= 1)) throw safetyError(BARRIER.HEADER_WRITE_PROHIBITED, 'invalid startRow ' + op.startRow);
if (numRows < 1) numRows = 1;
if (startRow <= 1) throw safetyError(BARRIER.HEADER_WRITE_PROHIBITED, (op.operation || 'write') + ' intersects Header row 1 on ' + (op.sheetName || '?'));
return { ok: true, startRow: startRow, endRow: startRow + numRows - 1 };
}




function assertRuntimeMutationAllowed(op) {
aType(isObj(op), 'assertRuntimeMutationAllowed: op required');
var operation = str(op.operation);
var mode = str(op.executionMode) || EXECUTION_MODES.RUNTIME_WRITE;

if (mode === EXECUTION_MODES.SCHEMA_MIGRATION) {
var auth = validateMigrationAuthorization(op.migrationAuthorization);
if (!auth.valid) throw safetyError(BARRIER.MIGRATION_AUTHORIZATION_REQUIRED, 'missing: ' + auth.missing.join(','));
return { ok: true, mode: mode, operation: operation, migration: true };
}

if (WHOLE_SHEET_OPS[operation]) throw safetyError(BARRIER.WHOLE_SHEET_REPLACEMENT_PROHIBITED, operation + ' outside SCHEMA_MIGRATION');
if (STRUCTURAL_OPS[operation]) throw safetyError(BARRIER.STRUCTURAL_MUTATION_PROHIBITED, operation + ' outside SCHEMA_MIGRATION');
if (mode === EXECUTION_MODES.RUNTIME_READ || mode === EXECUTION_MODES.DIAGNOSTIC_READ) {

if (operation) throw safetyError(BARRIER.STRUCTURAL_MUTATION_PROHIBITED, 'write "' + operation + '" attempted in ' + mode);
return { ok: true, mode: mode, operation: operation };
}

assertDataRowWriteRange(op);
return { ok: true, mode: mode, operation: operation };
}


var MIGRATION_REQUIRED_FIELDS = ['migrationId', 'expectedSpreadsheetId', 'expectedSheetName', 'expectedOldHeaderHash', 'expectedNewHeaderHash', 'backupReference', 'execute', 'actor'];
function validateMigrationAuthorization(dto) {
if (!isObj(dto)) return { valid: false, missing: MIGRATION_REQUIRED_FIELDS.slice() };
var missing = MIGRATION_REQUIRED_FIELDS.filter(function (f) {
if (f === 'execute') return typeof dto.execute !== 'boolean';
return str(dto[f]) === '';
});
return { valid: missing.length === 0, missing: missing, execute: dto.execute === true };
}


function headerHash(headers) {
aType(Array.isArray(headers), 'headerHash: headers[] required');
var canon = headers.map(str).join('');
var h = 0x811c9dc5;
for (var i = 0; i < canon.length; i++) { h ^= canon.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
return ('00000000' + h.toString(16)).slice(-8);
}

return {
EXECUTION_MODES: EXECUTION_MODES, SCHEMA_STATUS: SCHEMA_STATUS, BARRIER: BARRIER,
STRUCTURAL_OPS: Object.keys(STRUCTURAL_OPS), WHOLE_SHEET_OPS: Object.keys(WHOLE_SHEET_OPS),
MIGRATION_REQUIRED_FIELDS: MIGRATION_REQUIRED_FIELDS.slice(),
assertExpectedSpreadsheetId: assertExpectedSpreadsheetId,
checkExpectedSpreadsheetId: checkExpectedSpreadsheetId,
classifySchemaMismatch: classifySchemaMismatch,
validateCanonicalHeaders: validateCanonicalHeaders,
createReadOnlyTableSnapshot: createReadOnlyTableSnapshot,
validateCanonicalTable: validateCanonicalTable,
assertDataRowWriteRange: assertDataRowWriteRange,
assertRuntimeMutationAllowed: assertRuntimeMutationAllowed,
validateMigrationAuthorization: validateMigrationAuthorization,
headerHash: headerHash
};
});
__kmRegister("supply-planning-production-safety", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;
















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-recommendation-orchestrator.js') : (root.KMORCH || (root.KM && root.KM.recommendationOrchestrator)),
req ? req('./supply-planning-persistence-locking.js') : (root.KMPL || (root.KM && root.KM.persistenceLocking)),
req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)),
req ? req('./supply-planning-production-source.js') : (root.KMPS || (root.KM && root.KM.productionSource)),
req ? req('./supply-planning-production-safety.js') : (root.KMSAFE || (root.KM && root.KM.productionSafety))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.productionWriter = api; }
})(this, function (KMORCH, KMPL, KMPR, KMPS, KMSAFE) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }



var DRAFT_HEADERS = {
WEEKLY_SHIPPING: {
header: ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
'recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_source_warehouse_code_snapshot',
'recommended_destination_warehouse_code_snapshot', 'recommendation_group_no', 'recommended_shipping_method',
'recommended_last_mile_delivery', 'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at',
'source_data_as_of', 'draft_version', 'created_by', 'created_at', 'updated_by', 'updated_at', 'submitted_by',
'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'],
lines: ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code', 'window_start_date',
'window_end_date', 'required_by_date', 'regular_demand_snapshot', 'special_event_demand_snapshot',
'destination_stock_snapshot', 'qualified_incoming_snapshot', 'approved_supply_snapshot', 'calculated_gap_qty',
'source_initial_available_qty_snapshot', 'source_available_before_allocation_snapshot', 'allocation_sequence',
'recommendation_reason', 'recommendation_flags', 'recommended_qty',






'source_warehouse_id', 'source_warehouse_code_snapshot',
'planned_qty', 'units_per_carton', 'route_no', 'line_status', 'override_reason', 'note', 'created_at', 'updated_at']
},
MONTHLY_ORDER: {
header: ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku',
'category_snapshot', 'series_snapshot', 'status', 'generation_type', 'draft_purpose', 'calculation_run_id',
'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version', 'created_by', 'created_at',
'updated_by', 'updated_at', 'submitted_by', 'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'],
lines: ['request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket',
'regular_demand_snapshot', 'special_event_demand_snapshot', 'destination_stock_snapshot',
'third_party_available_qty_snapshot', 'qualified_incoming_snapshot', 'approved_supply_snapshot',
'factory_available_qty_snapshot', 'target_pct_snapshot', 'calculated_gap_qty_snapshot',
'recommended_shipping_qty_snapshot', 'residual_production_required_snapshot', 'reallocation_in_qty_snapshot',
'reallocation_out_qty_snapshot', 'net_order_need_snapshot', 'recommended_qty', 'order_qty', 'carton_qty',
'units_per_carton', 'allocation_method', 'recommendation_reason', 'recommendation_flags', 'line_status',
'submitted_by', 'submitted_at', 'note', 'created_at', 'updated_at']
}
};


function seedSheetSet(type) {
aType(DRAFT_HEADERS[type], 'seedSheetSet: unknown recommendationType: ' + type);
var cfg = KMPR.TABLES[type];
var seed = {};
seed[cfg.header] = { headers: DRAFT_HEADERS[type].header.slice(), rows: [] };
seed[cfg.lines] = { headers: DRAFT_HEADERS[type].lines.slice(), rows: [] };
seed[KMPR.RUN_JOURNAL_TABLE] = { headers: KMPR.RUN_JOURNAL_HEADERS.slice(), rows: [] };
return KMPR.createSheetSet(seed);
}





function sheetSetDeps(env) {
aType(isObj(env) && isObj(env.sheetSet), 'sheetSetDeps: env.sheetSet required');
aType(isObj(env.request), 'sheetSetDeps: env.request required');
aType(isObj(env.lock) && typeof env.lock.acquire === 'function' && typeof env.lock.release === 'function', 'sheetSetDeps: env.lock.acquire/release required');
var type = env.request.recommendationType;
var query = { recommendationType: type, planningCycle: env.request.planningCycle, businessScope: env.request.businessScope };
return {
loadActiveContext: function (q) { return KMPR.loadActiveDraftContext(env.sheetSet, q || query); },
loadPriorSnapshot: function (id) { return KMPR.loadDraftSnapshot(env.sheetSet, id, type); },
computeFacts: function () { return KMPS.resolveProductionFacts(env.canonicalSpreadsheet, env.request); },
lockedApply: function (plan, expectedToken, opts) {
return KMPL.executeLockedPersistence({
plan: plan, expectedToken: expectedToken, opts: opts, generationType: opts.generationType,
deps: {
validatePlan: function (p) { return KMPR.validatePersistencePlan(p); },
acquireLock: function () { return env.lock.acquire() === true; },
releaseLock: function () { return env.lock.release(); },
loadActiveDraftContext: function () { return KMPR.loadActiveDraftContext(env.sheetSet, query); },
reloadSnapshot: function () { return KMPR.loadDraftSnapshot(env.sheetSet, plan.draftId, type); },
recomputeToken: function (snap) {
var dv = snap.draft ? snap.draft.draft_version : plan.draftVersion;
return KMPR.computeExpectedToken(dv, (snap.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
},
applyPlan: function (tok, o) { return KMPR.applyPersistencePlan(env.sheetSet, plan, tok, o || opts || {}); }
}
});
}
};
}












function draftTableSpecs_(type) {
var t = KMPR.TABLES[type], h = DRAFT_HEADERS[type];






return [
{ sheetName: t.header, expectedHeaders: h.header, required: true, extraColumnsPolicy: 'ALLOW' },
{ sheetName: t.lines, expectedHeaders: h.lines, required: true, extraColumnsPolicy: 'ALLOW' }
];
}
function authorizedTableSpecs(recommendationType) {
var journal = { sheetName: KMPR.RUN_JOURNAL_TABLE, expectedHeaders: KMPR.RUN_JOURNAL_HEADERS, required: true, extraColumnsPolicy: 'ALLOW' };
if (recommendationType && KMPR.TABLES[recommendationType] && DRAFT_HEADERS[recommendationType]) {
return draftTableSpecs_(recommendationType).concat([journal]);
}
return draftTableSpecs_('WEEKLY_SHIPPING').concat(draftTableSpecs_('MONTHLY_ORDER')).concat([journal]);
}





function validateAuthorizedRecommendationSchemas(spreadsheet, opts) {
aType(isObj(opts) && str(opts.expectedSpreadsheetId) !== '', 'validateAuthorizedRecommendationSchemas: opts.expectedSpreadsheetId required (exact-ID gate)');
var idCheck = KMSAFE.checkExpectedSpreadsheetId(spreadsheet, opts.expectedSpreadsheetId);
var tables = {}, blockers = [];




var specs = (Array.isArray(opts.tableSpecsOverride) && opts.tableSpecsOverride.length) ? opts.tableSpecsOverride : authorizedTableSpecs(opts.recommendationType);
specs.forEach(function (spec) {
var report;
if (!idCheck.ok) {
report = { ready: false, sheetName: spec.sheetName, schemaStatus: KMSAFE.SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET, issues: [{ reason: KMSAFE.SCHEMA_STATUS.WRONG_SPREADSHEET_TARGET }] };
} else {
report = KMSAFE.validateCanonicalTable(spreadsheet, {
sheetName: spec.sheetName, expectedHeaders: spec.expectedHeaders,
expectedSpreadsheetId: opts.expectedSpreadsheetId, extraColumnsPolicy: spec.extraColumnsPolicy
});

if (report.schemaStatus === KMSAFE.SCHEMA_STATUS.SHEET_MISSING) { report.schemaStatus = KMSAFE.SCHEMA_STATUS.SCHEMA_NOT_PROVISIONED; report.issues = [{ reason: KMSAFE.SCHEMA_STATUS.SCHEMA_NOT_PROVISIONED }]; report.ready = false; }
}
report.required = spec.required;
tables[spec.sheetName] = report;
if (spec.required && !report.ready) blockers.push({ table: spec.sheetName, schemaStatus: report.schemaStatus });
});
return { ready: blockers.length === 0, spreadsheetId: idCheck.spreadsheetId || '', tables: tables, blockers: blockers };
}

function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }



function assertAuthorizedSchemasReady(spreadsheet, opts) {
var v = validateAuthorizedRecommendationSchemas(spreadsheet, opts);
if (!v.ready) { var e = new Error('RECOMMENDATION_SCHEMA_NOT_READY: ' + v.blockers.map(function (b) { return b.table + '=' + b.schemaStatus; }).join('; ')); e.schemaValidation = v; throw e; }
return v;
}





function persistProductionRecommendation(command, deps) {
aType(isObj(command), 'persistProductionRecommendation: command required');
aType(isObj(deps) && typeof deps.computeFacts === 'function' && typeof deps.lockedApply === 'function', 'persistProductionRecommendation: deps.computeFacts/lockedApply required');
var result = KMORCH.runRecommendationGeneration(command, deps);
var wrote = result.wrote === true && result.status === 'COMPLETED';
var cfg = KMPR.TABLES[command.recommendationType];
result.persistenceStatus = wrote ? 'COMPLETED' : 'NOT_EXECUTED';
result.writtenTables = wrote && cfg ? [cfg.header, cfg.lines, KMPR.RUN_JOURNAL_TABLE] : [];
return result;
}


function persistToSheetSet(env) {
var deps = sheetSetDeps(env);
return persistProductionRecommendation({
recommendationType: env.request.recommendationType, mode: env.request.mode,
planningCycle: env.request.planningCycle, businessScope: env.request.businessScope,
confirmRegenerateOverUserEdits: env.request.confirmRegenerateOverUserEdits === true,
actor: env.request.actor || 'system', now: env.request.now || ''
}, deps);
}

return {
DRAFT_HEADERS: DRAFT_HEADERS,
seedSheetSet: seedSheetSet,
sheetSetDeps: sheetSetDeps,
persistProductionRecommendation: persistProductionRecommendation,
persistToSheetSet: persistToSheetSet,
authorizedTableSpecs: authorizedTableSpecs,
validateAuthorizedRecommendationSchemas: validateAuthorizedRecommendationSchemas,
assertAuthorizedSchemasReady: assertAuthorizedSchemasReady
};
});
__kmRegister("supply-planning-production-writer", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;














(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)),
req ? req('./supply-planning-production-writer.js') : (root.KMPW || (root.KM && root.KM.productionWriter))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.verificationDiagnostics = api; }
})(this, function (KMPR, KMPW) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function nstat(v) { return str(v).toLowerCase(); }

var TERMINAL = { submitted: 1, cancelled: 1 };


function namespaceReport(env) {
env = isObj(env) ? env : {};
var required = ['KMSP', 'KMPS', 'KMPW', 'KMPR', 'KMPL', 'KMORCH', 'KMSRP', 'KMSR', 'KMSI', 'KMPB', 'KMPPB', 'KMPC'];
var namespaces = {};
required.forEach(function (n) { namespaces[n] = env[n] ? typeof env[n] : 'undefined'; });
var functions = {
'KMPW.persistProductionRecommendation': !!(env.KMPW && typeof env.KMPW.persistProductionRecommendation === 'function'),
'KMPS.resolveProductionFacts': !!(env.KMPS && typeof env.KMPS.resolveProductionFacts === 'function'),
'KMPS.buildProductionRecommendationSource': !!(env.KMPS && typeof env.KMPS.buildProductionRecommendationSource === 'function'),
'KMSP.projectAndRead': !!(env.KMSP && typeof env.KMSP.projectAndRead === 'function'),
'KMPR.applyPersistencePlan': !!(env.KMPR && typeof env.KMPR.applyPersistencePlan === 'function'),
'KMPR.loadActiveDraftContext': !!(env.KMPR && typeof env.KMPR.loadActiveDraftContext === 'function'),
'KMPL.executeLockedPersistence': !!(env.KMPL && typeof env.KMPL.executeLockedPersistence === 'function'),
'KMORCH.runRecommendationGeneration': !!(env.KMORCH && typeof env.KMORCH.runRecommendationGeneration === 'function')
};
var info = env.KM_BUNDLE_INFO && isObj(env.KM_BUNDLE_INFO) ? env.KM_BUNDLE_INFO : null;
var moduleCount = info && Array.isArray(info.modules) ? info.modules.length : null;
var ready = required.every(function (n) { return namespaces[n] === 'object'; }) &&
Object.keys(functions).every(function (k) { return functions[k]; });
return { namespaces: namespaces, functions: functions, moduleCount: moduleCount, bundleInfo: info, ready: ready };
}


function readTable(spreadsheet, name) {
var sheet = spreadsheet.getSheetByName(name);
if (!sheet) return { exists: false, headers: [], rows: [], rowCount: 0 };
var lastRow = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : null;
if (lastRow === 0) return { exists: true, headers: [], rows: [], rowCount: 0 };
var values = sheet.getDataRange().getValues();
if (!values || !values.length) return { exists: true, headers: [], rows: [], rowCount: 0 };
var headers = values[0].map(function (h) { return str(h); });
var rows = []; for (var r = 1; r < values.length; r++) rows.push(values[r].slice());
return { exists: true, headers: headers, rows: rows, rowCount: rows.length };
}
function dupHeaders(headers) { var seen = {}, dup = []; headers.forEach(function (h) { if (h === '') return; if (seen[h]) { if (dup.indexOf(h) < 0) dup.push(h); } else seen[h] = 1; }); return dup; }
function missing(headers, required) { var have = {}; headers.forEach(function (h) { have[h] = 1; }); return required.filter(function (h) { return !have[h]; }); }
function rowObj(headers, row) { var o = {}; for (var i = 0; i < headers.length; i++) if (headers[i] !== '') o[headers[i]] = row[i]; return o; }


function auditHeaderTable(spreadsheet, type, opts) {
var cfg = KMPR.TABLES[type];
var t = readTable(spreadsheet, cfg.header);
var expected = KMPW.DRAFT_HEADERS[type].header;
var out = { table: cfg.header, exists: t.exists, rowCount: t.rowCount, headers: t.headers,
duplicateHeaders: dupHeaders(t.headers), missingRequiredHeaders: missing(t.headers, expected),
activeByKey: {}, duplicateActiveConflicts: [], submittedCount: 0, cancelledCount: 0 };
t.rows.forEach(function (row) {
var o = rowObj(t.headers, row);
var st = nstat(o.status);
if (st === 'submitted') out.submittedCount++;
if (st === 'cancelled') out.cancelledCount++;
if (TERMINAL[st]) return;
var key;
try { key = KMPR.buildBusinessScopeKey(type, o); } catch (e) { key = 'UNRESOLVED_SCOPE'; }
out.activeByKey[key] = (out.activeByKey[key] || 0) + 1;
});
for (var k in out.activeByKey) if (out.activeByKey[k] > 1) out.duplicateActiveConflicts.push({ key: k, count: out.activeByKey[k] });
return out;
}
function auditLineTable(spreadsheet, type) {
var cfg = KMPR.TABLES[type];
var t = readTable(spreadsheet, cfg.lines);
return { table: cfg.lines, exists: t.exists, rowCount: t.rowCount, headers: t.headers,
duplicateHeaders: dupHeaders(t.headers), missingRequiredHeaders: missing(t.headers, KMPW.DRAFT_HEADERS[type].lines) };
}
function auditRunJournal(spreadsheet) {
var t = readTable(spreadsheet, KMPR.RUN_JOURNAL_TABLE);
return { table: KMPR.RUN_JOURNAL_TABLE, exists: t.exists, rowCount: t.rowCount, headers: t.headers,
duplicateHeaders: dupHeaders(t.headers), missingRequiredHeaders: missing(t.headers, KMPR.RUN_JOURNAL_HEADERS) };
}
function auditDraftTables(spreadsheet, opts) {
aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'auditDraftTables: spreadsheet.getSheetByName required');
var tables = {
shipping_allocation_drafts: auditHeaderTable(spreadsheet, 'WEEKLY_SHIPPING', opts),
shipping_allocation_draft_lines: auditLineTable(spreadsheet, 'WEEKLY_SHIPPING'),
request_order_allocation_drafts: auditHeaderTable(spreadsheet, 'MONTHLY_ORDER', opts),
request_order_allocation_draft_lines: auditLineTable(spreadsheet, 'MONTHLY_ORDER'),
recommendation_calculation_runs: auditRunJournal(spreadsheet)
};
var issues = [];
for (var name in tables) {
var a = tables[name];
if (!a.exists) issues.push({ table: name, reason: 'SHEET_MISSING' });
if (a.duplicateHeaders.length) issues.push({ table: name, reason: 'DUPLICATE_HEADER', detail: a.duplicateHeaders });
if (a.missingRequiredHeaders.length) issues.push({ table: name, reason: 'MISSING_REQUIRED_HEADER', detail: a.missingRequiredHeaders });
if (a.duplicateActiveConflicts && a.duplicateActiveConflicts.length) issues.push({ table: name, reason: 'DUPLICATE_ACTIVE_DRAFT', detail: a.duplicateActiveConflicts });
}
return { tables: tables, issues: issues, ready: issues.length === 0 };
}


function activeDraftAudit(spreadsheet, query) {
aType(isObj(spreadsheet) && typeof spreadsheet.getSheetByName === 'function', 'activeDraftAudit: spreadsheet.getSheetByName required');
aType(isObj(query) && KMPR.TABLES[query.recommendationType], 'activeDraftAudit: query.recommendationType invalid');
var type = query.recommendationType, cfg = KMPR.TABLES[type];
var t = readTable(spreadsheet, cfg.header);
var sheetSet = KMPR.createSheetSet();
sheetSet[cfg.header] = { headers: t.headers.slice(), rows: t.rows.map(function (r) { return r.slice(); }) };
var ctx = KMPR.loadActiveDraftContext(sheetSet, query);
var decision = ctx.status === 'CREATE' ? 'AUTHORIZED_CREATE_TEST'
: ctx.status === 'REUSE' ? 'AUTHORIZED_REUSE_TEST'
: 'BLOCKED_CONFLICT_HALT';
return { recommendationType: type, businessScopeKey: ctx.businessScopeKey, status: ctx.status,
draftId: ctx.draftId || null, matchCount: ctx.matchCount !== undefined ? ctx.matchCount : (ctx.status === 'REUSE' ? 1 : 0), decision: decision };
}

return {
namespaceReport: namespaceReport,
auditDraftTables: auditDraftTables,
activeDraftAudit: activeDraftAudit
};
});
__kmRegister("supply-planning-verification-diagnostics", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;





















(function (root, factory) {
var api = factory();
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.recommendation = api; window.KMREC = api; }
return api;
})(this, function () {
'use strict';

var SOURCE_TYPE = { INVENTORY: 'INVENTORY_GAP', ORDER_PLANNING: 'ORDER_PLANNING_GAP' };
var STATUS = { READY: 'READY', NO_ACTION: 'NO_ACTION', BLOCKED: 'BLOCKED' };
var INV_WINDOWS = ['D18', 'D30', 'D45', 'D90'];
var OP_TIERS = ['T1', 'T2', 'T3', 'T4'];
var OP_ACTIONABLE_TIERS = ['T1', 'T2', 'T3'];

var ORDER_TOTAL_AUTHORITY = 'SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE';
var ORDER_TOTAL_UPC_UNAVAILABLE = 'UNITS_PER_CARTON_NOT_AVAILABLE';




var ACTION = { REALLOCATE: 'REALLOCATE', NEW_ORDER: 'NEW_ORDER',
REALLOCATE_AND_NEW_ORDER: 'REALLOCATE_AND_NEW_ORDER',
NO_ACTION: 'NO_ACTION', MANUAL_REVIEW: 'MANUAL_REVIEW' };










var ACTION_UNAVAILABLE_MULTIPLICITY = null;



var REASON_TOKENS = ['FACTORY_SUPPLY_APPLIED', 'FACTORY_SURPLUS_REALLOCATION_APPLIED', 'RESIDUAL_SHORTAGE',
'NEW_ORDER_REQUIRED', 'NO_ACTION_REQUIRED', 'MANUAL_REVIEW_REQUIRED', 'FORWARD_VISIBILITY_ONLY'];

function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function isActionableQty(v) { return typeof v === 'number' && isFinite(v) && v > 0; }

function validGap(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }



function resolveCartonizer_(opts) {
if (opts && typeof opts.cartonize === 'function') return opts.cartonize;
var calc = (typeof KMCALC !== 'undefined' && KMCALC) ? KMCALC
: (typeof window !== 'undefined' && window.KM && window.KM.core ? window.KM.core.supplyPlanningCalculations : null);
if (calc && typeof calc.calculateSuggestedOrderQty === 'function') {
return function (need, upc) { return calc.calculateSuggestedOrderQty({ netOrderNeed: need, unitsPerCarton: upc }); };
}
return null;
}


function upcFor_(row, opts) {
var cands = [opts && opts.unitsPerCarton,
(opts && opts.unitsPerCartonBySku) ? opts.unitsPerCartonBySku[str(row && row.sku)] : undefined,
row && row.units_per_carton];
for (var i = 0; i < cands.length; i++) { var n = num(cands[i]); if (n !== null && n > 0) return n; }
return null;
}
function businessKey(row) { return [str(row.company), str(row.country), str(row.marketplace), str(row.sku)].join('||'); }


function fingerprint(product, row) { return [str(product), businessKey(row), str(row && row.calculated_at)].join('#'); }

function baseDto(sourceType, row, opts) {
opts = opts || {};
return {
recommendationId: sourceType + ':' + businessKey(row),
product: sourceType,
company: str(row.company), country: str(row.country), marketplace: str(row.marketplace), sku: str(row.sku),
sourceType: sourceType,
sourceCalculatedAt: str(row.calculated_at) || null,
sourceCalculationDate: (sourceType === SOURCE_TYPE.INVENTORY) ? (str(row.calculation_date) || null) : null,
sourceCalculationMonth: (sourceType === SOURCE_TYPE.ORDER_PLANNING) ? (str(row.calculation_month) || null) : null,
sourceFingerprint: fingerprint(sourceType, row),
status: STATUS.BLOCKED,
primaryWindow: null, primaryMonth: null,
gapQty: null, suggestedQty: null,
tiers: null, windows: null,
totalRecommendedQty: null, totalAuthority: null,
reason: '', generatedAt: (opts.now != null ? String(opts.now) : null)
};
}
function blocked(dto, row) {
dto.status = STATUS.BLOCKED;

dto.reason = 'Recommendation unavailable — the latest calculation for this SKU is ' + (str(row.calculation_status) || 'not READY') + '.';
return dto;
}


function generateInventoryRecommendation(row, opts) {
if (!row) return null;
var dto = baseDto(SOURCE_TYPE.INVENTORY, row, opts);
dto.windows = INV_WINDOWS.map(function (w) {
var lc = w.toLowerCase();
return { window: w, gapQty: num(row[lc + '_gap_qty']), suggestedQty: num(row[lc + '_suggested_qty']) };
});
if (str(row.calculation_status) !== 'READY') return blocked(dto, row);
var chosen = null;
for (var i = 0; i < dto.windows.length; i++) { if (isActionableQty(dto.windows[i].suggestedQty)) { chosen = dto.windows[i]; break; } }
if (!chosen) { dto.status = STATUS.NO_ACTION; dto.reason = 'No action required — no materialized replenishment shortage.'; return dto; }
dto.status = STATUS.READY;
dto.primaryWindow = chosen.window;
dto.gapQty = chosen.gapQty;
dto.suggestedQty = chosen.suggestedQty;
dto.reason = 'Earliest replenishment shortage requiring action (' + chosen.window + ').';
return dto;
}




function buildOrderPlanningDto(row, opts) {
if (!row) return null;
var dto = baseDto(SOURCE_TYPE.ORDER_PLANNING, row, opts);
dto.tiers = OP_TIERS.map(function (t) {
var lc = t.toLowerCase();
return { tier: t, month: str(row[lc + '_month']) || null, gapQty: num(row[lc + '_gap_qty']), suggestedQty: num(row[lc + '_suggested_qty']) };
});
dto.primaryMonth = dto.tiers[0].month;

dto.actionableTierCount = OP_ACTIONABLE_TIERS.length;
dto.totalAuthority = ORDER_TOTAL_AUTHORITY;
dto.actionableGapQty = null;
dto.forwardVisibility = { t4Month: dto.tiers[3].month, t4GapQty: dto.tiers[3].gapQty, t4SuggestedQty: dto.tiers[3].suggestedQty };
if (str(row.calculation_status) !== 'READY') return blocked(dto, row);

var actionable = Math.max(0, validGap(dto.tiers[0].gapQty) + validGap(dto.tiers[1].gapQty) + validGap(dto.tiers[2].gapQty));
dto.actionableGapQty = actionable;
if (actionable <= 0) {
dto.status = STATUS.NO_ACTION;
dto.totalRecommendedQty = 0;
dto.reason = isActionableQty(dto.tiers[3].gapQty)
? 'No action now — order need appears only in T4 (forward visibility, not automatically actionable).'
: 'No action required — no materialized order need across the actionable tiers (T1–T3).';
return dto;
}
dto.status = STATUS.READY;

var upc = upcFor_(row, opts);
var cartonize = resolveCartonizer_(opts);
if (upc !== null && cartonize) {
dto.totalRecommendedQty = cartonize(actionable, upc);
} else {
dto.totalRecommendedQty = null;
dto.totalUnavailableReason = ORDER_TOTAL_UPC_UNAVAILABLE;
}
dto.reason = 'Actionable order need across T1–T3 — the total is the raw gap sum cartonized once (per-tier values are display only; T4 is forward visibility).';
return dto;
}



function factorySupplyUsed(row) {
var init = num(row && row.factory_available_qty_snapshot);
var outQ = num(row && row.reallocation_out_qty_snapshot);
var inQ = num(row && row.reallocation_in_qty_snapshot);
if (init === null || outQ === null || inQ === null) return null;
return Math.max(0, init - outQ + inQ);
}



function reallocatedInQty(row) { return num(row && row.reallocation_in_qty_snapshot); }



function deriveRecommendationAction(row, dto) {
if (!row || !dto) return null;
if (dto.status === STATUS.BLOCKED) return { action: ACTION.MANUAL_REVIEW, unavailableReason: null };





var inQ = reallocatedInQty(row);
var hasReallocation = (inQ !== null && inQ > 0);




var total = dto.totalRecommendedQty;
if (total === null || typeof total !== 'number' || !isFinite(total)) {
return { action: ACTION.MANUAL_REVIEW, unavailableReason: null };
}
var hasNewOrder = total > 0;

if (hasReallocation && hasNewOrder) return { action: ACTION.REALLOCATE_AND_NEW_ORDER, unavailableReason: null };
if (hasReallocation) return { action: ACTION.REALLOCATE, unavailableReason: null };
if (hasNewOrder) return { action: ACTION.NEW_ORDER, unavailableReason: null };




if (dto.status === STATUS.NO_ACTION) return { action: ACTION.NO_ACTION, unavailableReason: null };
return { action: ACTION.MANUAL_REVIEW, unavailableReason: null };
}



function deriveReasonTokens(row, dto) {
if (!row || !dto) return [];
var on = {};
var fsu = factorySupplyUsed(row);
if (fsu !== null && fsu > 0) on.FACTORY_SUPPLY_APPLIED = 1;
var inQ = reallocatedInQty(row);
if (inQ !== null && inQ > 0) on.FACTORY_SURPLUS_REALLOCATION_APPLIED = 1;
if (dto.status === STATUS.BLOCKED) {
on.MANUAL_REVIEW_REQUIRED = 1;
} else {
var gap = dto.actionableGapQty;
if (typeof gap === 'number' && isFinite(gap) && gap > 0) on.RESIDUAL_SHORTAGE = 1;
if (typeof dto.totalRecommendedQty === 'number' && dto.totalRecommendedQty > 0) on.NEW_ORDER_REQUIRED = 1;
if (dto.totalRecommendedQty === null) on.MANUAL_REVIEW_REQUIRED = 1;
if (typeof gap === 'number' && isFinite(gap) && gap <= 0) {





if (!(inQ !== null && inQ > 0)) on.NO_ACTION_REQUIRED = 1;
var t4 = dto.forwardVisibility ? num(dto.forwardVisibility.t4GapQty) : null;
if (t4 !== null && t4 > 0) on.FORWARD_VISIBILITY_ONLY = 1;
}
}
return REASON_TOKENS.filter(function (t) { return on[t] === 1; });
}




function decorateDecision(row, dto) {
if (!dto) return dto;
var d = deriveRecommendationAction(row, dto);
dto.recommendationAction = d ? d.action : null;
dto.recommendationActionUnavailableReason = d ? d.unavailableReason : null;
dto.reasonTokens = deriveReasonTokens(row, dto);
return dto;
}

function generateOrderPlanningRecommendation(row, opts) {
return decorateDecision(row, buildOrderPlanningDto(row, opts));
}


function generateForRow(product, row, opts) {
var p = str(product).toUpperCase();
if (p === SOURCE_TYPE.INVENTORY || p === 'INVENTORY') return generateInventoryRecommendation(row, opts);
if (p === SOURCE_TYPE.ORDER_PLANNING || p === 'ORDER_PLANNING') return generateOrderPlanningRecommendation(row, opts);
return null;
}

function generateBatch(product, rows, opts) {
var out = [], ready = 0, noAction = 0, blockedN = 0;
(rows || []).forEach(function (r) {
var dto = generateForRow(product, r, opts);
if (!dto) return;
out.push(dto);
if (dto.status === STATUS.READY) ready++;
else if (dto.status === STATUS.NO_ACTION) noAction++;
else blockedN++;
});
return { recommendations: out, summary: { product: str(product), total: out.length, ready: ready, noAction: noAction, blocked: blockedN } };
}


function isStale(dto, latestRow) {
if (!dto || !latestRow) return false;
return String(dto.sourceFingerprint) !== fingerprint(dto.sourceType, latestRow);
}

return {
SOURCE_TYPE: SOURCE_TYPE, STATUS: STATUS, INV_WINDOWS: INV_WINDOWS.slice(), OP_TIERS: OP_TIERS.slice(),
OP_ACTIONABLE_TIERS: OP_ACTIONABLE_TIERS.slice(),
ORDER_TOTAL_AUTHORITY: ORDER_TOTAL_AUTHORITY, ORDER_TOTAL_UPC_UNAVAILABLE: ORDER_TOTAL_UPC_UNAVAILABLE,
fingerprint: fingerprint,
generateInventoryRecommendation: generateInventoryRecommendation,
generateOrderPlanningRecommendation: generateOrderPlanningRecommendation,
generateForRow: generateForRow, generateBatch: generateBatch, isStale: isStale,
ACTION: ACTION, REASON_TOKENS: REASON_TOKENS.slice(),
ACTION_UNAVAILABLE_MULTIPLICITY: ACTION_UNAVAILABLE_MULTIPLICITY,
factorySupplyUsed: factorySupplyUsed,
deriveRecommendationAction: deriveRecommendationAction, deriveReasonTokens: deriveReasonTokens,
VERSION: 'kmrec-s5r4a-1'
};
});
__kmRegister("supply-recommendation", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;

























(function (root, factory) {
var api = factory();
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.executionHandoff = api; window.KMREX = api; }
return api;
})(this, function () {
'use strict';

var SOURCE_TYPE = { OVERSEAS: 'OVERSEAS_THREE_PL', FACTORY: 'FACTORY', ORDER_TIER: 'ORDER_TIER' };
var STATUS = { ACTION: 'ACTION', PARTIAL: 'PARTIAL', NO_ACTION: 'NO_ACTION', BLOCKED: 'BLOCKED' };
var OP_ACTIONABLE_TIERS = ['T1', 'T2', 'T3'];

function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function businessKey(rec) { return [str(rec.company), str(rec.country), str(rec.marketplace), str(rec.sku)].join('||'); }
function lineage(rec) {
return {
recommendationId: str(rec.recommendationId) || (str(rec.product) + ':' + businessKey(rec)),
product: str(rec.product) || null, businessKey: businessKey(rec), sku: str(rec.sku) || null,
sourceFingerprint: (rec.sourceFingerprint != null ? String(rec.sourceFingerprint) : null),
sourceCalculatedAt: (rec.sourceCalculatedAt != null ? String(rec.sourceCalculatedAt) : null)
};
}






function allocateInventoryExecution(rec, availability, opts) {
if (!rec) return null;
opts = opts || {}; availability = availability || {};
var base = lineage(rec);
var now = (opts.now != null ? String(opts.now) : null);
function shell(status, R, allocated, uncovered, lines, unresolved) {
return {
recommendationId: base.recommendationId, product: base.product, businessKey: base.businessKey, sku: base.sku,
recommendedQty: R, executionLines: lines || [], allocatedQty: allocated, uncoveredQty: uncovered,
unresolvedSources: unresolved || [], primaryWindow: (rec.primaryWindow != null ? String(rec.primaryWindow) : null),
sourceFingerprint: base.sourceFingerprint, sourceCalculatedAt: base.sourceCalculatedAt, status: status, generatedAt: now
};
}
if (str(rec.status) === 'BLOCKED') return shell(STATUS.BLOCKED, null, null, null, [], []);
var R = num(rec.suggestedQty);
if (str(rec.status) !== 'READY' || R == null || R <= 0) return shell(STATUS.NO_ACTION, R, 0, 0, [], []);

var ovAvail = num(availability.overseasAvailable), facAvail = num(availability.factoryAvailable);
var ov = (ovAvail != null && ovAvail > 0) ? ovAvail : 0;
var fac = (facAvail != null && facAvail > 0) ? facAvail : 0;
var overseasAllocated = Math.min(R, ov);
var factoryAllocated = Math.min(Math.max(0, R - overseasAllocated), fac);
var uncoveredQty = Math.max(0, R - overseasAllocated - factoryAllocated);
var lines = [];
if (overseasAllocated > 0) lines.push({ sourceType: SOURCE_TYPE.OVERSEAS, sourceId: (availability.overseasSourceId != null ? availability.overseasSourceId : null), sourceWarehouseId: (availability.overseasWarehouseId != null ? availability.overseasWarehouseId : null), destinationType: str(availability.destinationType) || 'MARKETPLACE', destinationId: (availability.destinationId != null ? availability.destinationId : null), allocatedQty: overseasAllocated, eligibilityReason: 'OVERSEAS_ELIGIBLE_AVAILABLE', sourceAvailableQty: ovAvail });
if (factoryAllocated > 0) lines.push({ sourceType: SOURCE_TYPE.FACTORY, sourceId: (availability.factorySourceId != null ? availability.factorySourceId : null), sourceWarehouseId: (availability.factoryWarehouseId != null ? availability.factoryWarehouseId : null), destinationType: str(availability.destinationType) || 'MARKETPLACE', destinationId: (availability.destinationId != null ? availability.destinationId : null), allocatedQty: factoryAllocated, eligibilityReason: 'FACTORY_ELIGIBLE_AVAILABLE', sourceAvailableQty: facAvail });
var unresolved = [];
if (ovAvail == null) unresolved.push('OVERSEAS');
if (facAvail == null) unresolved.push('FACTORY');
var allocatedQty = overseasAllocated + factoryAllocated;
return shell(uncoveredQty === 0 ? STATUS.ACTION : STATUS.PARTIAL, R, allocatedQty, uncoveredQty, lines, unresolved);
}


function buildOrderPlanningExecution(rec, opts) {
if (!rec) return null;
opts = opts || {};
var base = lineage(rec);
var now = (opts.now != null ? String(opts.now) : null);
var tiers = (rec.tiers || []).map(function (t) { return { tier: str(t.tier), month: (t.month != null ? String(t.month) : null), gapQty: num(t.gapQty), suggestedQty: num(t.suggestedQty) }; });
var dto = {
recommendationId: base.recommendationId, product: base.product, businessKey: base.businessKey, sku: base.sku,
tiers: tiers,
actionableTierCount: (rec.actionableTierCount != null ? rec.actionableTierCount : OP_ACTIONABLE_TIERS.length),
actionableGapQty: num(rec.actionableGapQty),
totalRecommendedQty: num(rec.totalRecommendedQty),
totalAuthority: (rec.totalAuthority != null ? String(rec.totalAuthority) : null),
forwardVisibility: rec.forwardVisibility || null,
executionLines: [], allocatedQty: null,
sourceFingerprint: base.sourceFingerprint, sourceCalculatedAt: base.sourceCalculatedAt,
status: STATUS.BLOCKED, generatedAt: now
};
if (str(rec.status) === 'BLOCKED') { dto.status = STATUS.BLOCKED; return dto; }
if (str(rec.status) !== 'READY') { dto.status = STATUS.NO_ACTION; return dto; }


var lines = [], allocated = 0;
tiers.forEach(function (t) {
if (OP_ACTIONABLE_TIERS.indexOf(t.tier) !== -1 && typeof t.suggestedQty === 'number' && t.suggestedQty > 0) {
lines.push({ sourceType: SOURCE_TYPE.ORDER_TIER, tier: t.tier, month: t.month, destinationType: 'ORDER_PLAN', allocatedQty: t.suggestedQty, eligibilityReason: 'ORDER_TIER_ACTIONABLE', sourceAvailableQty: null });
allocated += t.suggestedQty;
}
});
dto.executionLines = lines; dto.allocatedQty = allocated;
dto.status = (lines.length > 0 || (typeof dto.totalRecommendedQty === 'number' && dto.totalRecommendedQty > 0)) ? STATUS.ACTION : STATUS.NO_ACTION;
return dto;
}

return {
SOURCE_TYPE: SOURCE_TYPE, STATUS: STATUS, OP_ACTIONABLE_TIERS: OP_ACTIONABLE_TIERS.slice(),
businessKey: businessKey,
allocateInventoryExecution: allocateInventoryExecution,
buildOrderPlanningExecution: buildOrderPlanningExecution,
VERSION: 'kmrex-fm6r2-1'
};
});
__kmRegister("supply-execution-handoff", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;




























(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.core = window.KM.core || {};
window.KM.core.supplyPlanningOngoingOrderProjection = api;
window.KMOOP = api;
}
})(this, function () {
'use strict';

function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function requireObject(v, name) { if (!isObject(v)) throw new TypeError('KMOOP: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')'); return v; }
function requireArray(v, name) { if (!Array.isArray(v)) throw new TypeError('KMOOP: ' + name + ' must be an array (got ' + describe(v) + ')'); return v; }
function s(v) { return String(v == null ? '' : v).trim(); }
function intQty(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? Math.round(n) : NaN; }
function receiverKey(company, country, marketplace, siteSku) { return [s(company), s(country), s(marketplace), s(siteSku)].join('||'); }




function floorAllocateByRatio_(availableQty, items) {
var sumR = 0; items.forEach(function (it) { sumR += it.ratio; });
if (sumR > 1 + 1e-9) return { ok: false, issue: 'RATIO_TOTAL_EXCEEDS_100', ratioTotal: sumR };
var allocations = items.map(function (it) { return { key: it.key, ratio: it.ratio, allocatedQty: Math.floor(availableQty * it.ratio), meta: it.meta }; });
var sumQ = 0; allocations.forEach(function (a) { sumQ += a.allocatedQty; });
return { ok: true, allocations: allocations, residual: availableQty - sumQ, ratioTotal: sumR };
}

function projectOngoingOrderSupply(input) {
var root = requireObject(input, 'input');
var poLines = requireArray(root.purchaseOrderLines, 'input.purchaseOrderLines');
var requestSourceFacts = requireArray(root.requestSourceFacts || [], 'input.requestSourceFacts');
var monthlySiteFcFacts = requireArray(root.monthlySiteFcFacts || [], 'input.monthlySiteFcFacts');


var sourcesByRol = {};
requestSourceFacts.forEach(function (r) {
var rol = s(r.requestOrderLineId);
if (!rol) return;
(sourcesByRol[rol] = sourcesByRol[rol] || []).push({
company: s(r.company), country: s(r.country), marketplace: s(r.marketplace), siteSku: s(r.siteSku),
requestedQty: intQty(r.requestedQty)
});
});
var fcByCompany = {};
monthlySiteFcFacts.forEach(function (f) {
var co = s(f.company);
if (!co) return;
(fcByCompany[co] = fcByCompany[co] || []).push({
company: co, country: s(f.country), marketplace: s(f.marketplace), siteSku: s(f.siteSku),
siteFcBasis: Number(f.siteFcBasis)
});
});

var outLines = poLines.map(function (pl, i) {
var ctx = 'input.purchaseOrderLines[' + i + ']';
requireObject(pl, ctx);
var poLineId = s(pl.purchaseOrderLineId);
var poId = s(pl.purchaseOrderId);
var masterSku = s(pl.masterSku || pl.sku);
var company = s(pl.company);
var orderedQty = intQty(pl.orderedQty);
var requestedQty = intQty(pl.requestedQty);
var completedQty = intQty(pl.completedQty);
var shippedQty = intQty(pl.shippedQty);
var requestOrderLineId = s(pl.requestOrderLineId);
var issues = [];

function line(mode, allocs, residual, notYetReceived, completedNotShipped, shipped) {
return {
purchaseOrderLineId: poLineId, purchaseOrderId: poId, masterSku: masterSku, company: company,
orderedQty: isNaN(orderedQty) ? null : orderedQty, requestedQty: isNaN(requestedQty) ? null : requestedQty,
completedQty: isNaN(completedQty) ? null : completedQty, shippedQty: isNaN(shippedQty) ? null : shippedQty,
notYetReceivedCommittedQty: notYetReceived, completedNotShippedQty: completedNotShipped, shippedLifecycleQty: shipped,
allocationMode: mode, siteAllocations: allocs, unallocatedResidualQty: residual, issues: issues
};
}


if (isNaN(orderedQty) || isNaN(completedQty) || isNaN(shippedQty) || orderedQty < 0 || completedQty < 0 || shippedQty < 0) {
issues.push({ code: 'INVALID_LIFECYCLE_QTY', detail: 'ordered/completed/shipped must be non-negative numbers' });
return line('BLOCKED', [], 0, 0, 0, 0);
}
if (completedQty > orderedQty) { issues.push({ code: 'COMPLETED_EXCEEDS_ORDERED', detail: completedQty + ' > ' + orderedQty }); return line('BLOCKED', [], 0, 0, 0, 0); }
if (shippedQty > completedQty) { issues.push({ code: 'SHIPPED_EXCEEDS_COMPLETED', detail: shippedQty + ' > ' + completedQty }); return line('BLOCKED', [], 0, 0, 0, 0); }

var notYetReceived = Math.max(0, orderedQty - completedQty);
var completedNotShipped = Math.max(0, completedQty - shippedQty);
var shippedLifecycle = Math.min(completedQty, shippedQty);


var isA1 = !isNaN(requestedQty) && orderedQty === requestedQty;
var mode = isA1 ? 'REQUEST_SOURCE_LINEAGE' : 'COMPANY_MONTHLY_FC_SHARE';

if (notYetReceived === 0) return line(mode, [], 0, notYetReceived, completedNotShipped, shippedLifecycle);

var items = [], reason;
if (isA1) {
reason = 'A1_ORIGINAL_REQUEST_SHARE';
var srcs = (sourcesByRol[requestOrderLineId] || []).slice();
if (!srcs.length) { issues.push({ code: 'A1_NO_REQUEST_SOURCES', detail: 'no request_order_line_sources for requestOrderLineId=' + requestOrderLineId }); return line(mode, [], notYetReceived, notYetReceived, completedNotShipped, shippedLifecycle); }
var crossCo = srcs.filter(function (x) { return x.company !== company; });
if (crossCo.length) { issues.push({ code: 'A1_CROSS_COMPANY_SOURCE', detail: 'source company != PO line company ' + company }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
var total = 0, bad = false; srcs.forEach(function (x) { if (isNaN(x.requestedQty) || x.requestedQty < 0) bad = true; else total += x.requestedQty; });
if (bad) { issues.push({ code: 'A1_INVALID_SOURCE_QTY' }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
if (total !== requestedQty) { issues.push({ code: 'A1_SOURCE_TOTAL_MISMATCH', detail: 'Σ source.requested_qty ' + total + ' != PO requested_qty ' + requestedQty }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
if (total === 0) { return line(mode, [], notYetReceived, notYetReceived, completedNotShipped, shippedLifecycle); }
srcs.sort(function (a, b) { return cmpStr(a.company, b.company) || cmpStr(a.country, b.country) || cmpStr(a.marketplace, b.marketplace) || cmpStr(a.siteSku, b.siteSku); });
items = srcs.map(function (x) { return { key: receiverKey(x.company, x.country, x.marketplace, x.siteSku), ratio: x.requestedQty / total, meta: x }; });
} else {
reason = 'A2_COMPANY_MONTHLY_FC_SHARE';
var sites = (fcByCompany[company] || []).slice();
if (!sites.length) { issues.push({ code: 'A2_NO_ELIGIBLE_SITES', detail: 'no monthly FC sites for company ' + company }); return line(mode, [], notYetReceived, notYetReceived, completedNotShipped, shippedLifecycle); }
var badFc = sites.filter(function (x) { return !(typeof x.siteFcBasis === 'number' && isFinite(x.siteFcBasis) && x.siteFcBasis >= 0); });
if (badFc.length) { issues.push({ code: 'A2_INVALID_FC_BASIS' }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
var companyFc = 0; sites.forEach(function (x) { companyFc += x.siteFcBasis; });
if (companyFc === 0) { issues.push({ code: 'A2_ZERO_FC_DENOMINATOR', detail: 'Σ same-company siteFcBasis = 0' }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
sites.sort(function (a, b) { return cmpStr(a.company, b.company) || cmpStr(a.country, b.country) || cmpStr(a.marketplace, b.marketplace) || cmpStr(a.siteSku, b.siteSku); });
items = sites.map(function (x) { return { key: receiverKey(x.company, x.country, x.marketplace, x.siteSku), ratio: x.siteFcBasis / companyFc, meta: x }; });
}

var alloc = floorAllocateByRatio_(notYetReceived, items);
if (!alloc.ok) { issues.push({ code: alloc.issue, detail: 'Σ ratio = ' + alloc.ratioTotal + ' > 1.0' }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
var siteAllocations = alloc.allocations.map(function (a) {
return {
receiverKey: a.key, company: a.meta.company, country: a.meta.country, marketplace: a.meta.marketplace, siteSku: a.meta.siteSku,
share: a.ratio, allocatedQty: a.allocatedQty, sourceReason: reason
};
});
return line(mode, siteAllocations, alloc.residual, notYetReceived, completedNotShipped, shippedLifecycle);
}).sort(function (a, b) { return cmpStr(a.purchaseOrderLineId, b.purchaseOrderLineId); });

var totalNotYetReceived = 0, totalSiteAllocated = 0, totalResidual = 0, blockedLines = 0;
outLines.forEach(function (l) {
totalNotYetReceived += l.notYetReceivedCommittedQty;
l.siteAllocations.forEach(function (a) { totalSiteAllocated += a.allocatedQty; });
totalResidual += l.unallocatedResidualQty;
if (l.allocationMode === 'BLOCKED') blockedLines++;
});

return {
lines: outLines,
totals: {
totalNotYetReceivedCommittedQty: totalNotYetReceived,
totalSiteAllocatedQty: totalSiteAllocated,
totalUnallocatedResidualQty: totalResidual,
blockedLines: blockedLines
}
};
}

return { projectOngoingOrderSupply: projectOngoingOrderSupply };
});
__kmRegister("supply-planning-ongoing-order-projection", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;




























(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.core = window.KM.core || {};
window.KM.core.supplyPlanningOngoingOrderTppAdapter = api;
window.KMOTA = api;
}
})(this, function () {
'use strict';

var DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
var SOURCE_TYPE = 'ONGOING_ORDER';

function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function requireObject(v, name) { if (!isObject(v)) throw new TypeError('KMOTA: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')'); return v; }
function requireArray(v, name) { if (!Array.isArray(v)) throw new TypeError('KMOTA: ' + name + ' must be an array (got ' + describe(v) + ')'); return v; }
function s(v) { return String(v == null ? '' : v).trim(); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function isIso(v) { return typeof v === 'string' && DATE_RE.test(v); }









function resolveOngoingAvailableDate_(timingFact) {
var raw = s(timingFact && timingFact.expectedCompletionDate);
if (!raw) return { ok: false, code: 'ONGOING_ORDER_ETA_UNRESOLVED', detail: 'expected_completion_date is blank (future-factory availability date unresolved)' };
if (!isIso(raw)) return { ok: false, code: 'ONGOING_ORDER_ETA_UNRESOLVED', detail: 'expected_completion_date is not strict YYYY-MM-DD (got ' + raw + ')' };
return { ok: true, availableDate: raw, authority: 'PHASE_1_BASELINE_TIMING_AUTHORITY' };
}






function projectOngoingOrderIncoming(input) {
var root = requireObject(input, 'input');
var proj = requireObject(root.ongoingProjection, 'input.ongoingProjection');
var lines = requireArray(proj.lines, 'input.ongoingProjection.lines');
var timingArr = requireArray(root.poLineTiming || [], 'input.poLineTiming');
var tierByMonth = isObject(root.tierByMonth) ? root.tierByMonth : {};

var timingByLine = {};
timingArr.forEach(function (t) {
var id = s(t && t.purchaseOrderLineId);
if (id) timingByLine[id] = { expectedCompletionDate: s(t.expectedCompletionDate) };
});

var incomingEvents = [], issues = [];
var unresolvedLines = 0, blockedLines = 0, emittedLines = 0;

lines.forEach(function (l) {
var poLineId = s(l.purchaseOrderLineId);


if (l.allocationMode === 'BLOCKED') {
blockedLines++;
issues.push({ code: 'ONGOING_ORDER_LINE_BLOCKED_UPSTREAM', purchaseOrderLineId: poLineId, detail: 'KMOOP allocationMode=BLOCKED; no incoming emitted' });
return;
}

var allocs = Array.isArray(l.siteAllocations) ? l.siteAllocations : [];
var positive = allocs.filter(function (a) { return Number(a.allocatedQty) > 0; });
if (!positive.length) return;


var timed = resolveOngoingAvailableDate_(timingByLine[poLineId]);
if (!timed.ok) {
unresolvedLines++;
issues.push({ code: timed.code, purchaseOrderLineId: poLineId, detail: timed.detail });
return;
}

var tier = tierByMonth[timed.availableDate.slice(0, 7)];
tier = (tier == null) ? null : String(tier);

positive.forEach(function (a) {
var receiverKey = s(a.receiverKey);
incomingEvents.push({
availableDate: timed.availableDate,
qty: Number(a.allocatedQty),
incomingId: poLineId + '||' + receiverKey,
sourceType: SOURCE_TYPE,
tier: tier,

purchaseOrderLineId: poLineId,
purchaseOrderId: s(l.purchaseOrderId),
receiverKey: receiverKey,
company: s(a.company), country: s(a.country), marketplace: s(a.marketplace), siteSku: s(a.siteSku),
timingAuthority: timed.authority
});
});
emittedLines++;
});

incomingEvents.sort(function (a, b) { return cmpStr(a.incomingId, b.incomingId); });

var totalIncomingQty = 0;
incomingEvents.forEach(function (e) { totalIncomingQty += e.qty; });

return {
ready: true,
incomingEvents: incomingEvents,
issues: issues,
totals: {
eventCount: incomingEvents.length,
totalIncomingQty: totalIncomingQty,
emittedLines: emittedLines,
unresolvedLines: unresolvedLines,
blockedLines: blockedLines
}
};
}

return {
projectOngoingOrderIncoming: projectOngoingOrderIncoming,
resolveOngoingAvailableDate_: resolveOngoingAvailableDate_,
SOURCE_TYPE: SOURCE_TYPE,
VERSION: 'kmota-fa3b2-1'
};
});
__kmRegister("supply-planning-ongoing-order-tpp-adapter", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;































(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts)),
req ? req('./supply-planning-ongoing-order-projection.js') : (root.KMOOP || (root.KM && root.KM.core && root.KM.core.supplyPlanningOngoingOrderProjection)),
req ? req('./supply-planning-ongoing-order-tpp-adapter.js') : (root.KMOTA || (root.KM && root.KM.core && root.KM.core.supplyPlanningOngoingOrderTppAdapter))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.core = window.KM.core || {};
window.KM.core.supplyPlanningOngoingOrderRuntime = api;
window.KMOOR = api;
}
})(this, function (KMSF, KMOOP, KMOTA) {
'use strict';

var SOURCE_TYPE = 'ONGOING_ORDER';
var TIERS = ['T1', 'T2', 'T3', 'T4'];

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function s(v) { return String(v == null ? '' : v).trim(); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function intOr(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? Math.round(n) : NaN; }
function requireArray(v, name) { if (!Array.isArray(v)) throw new TypeError('KMOOR: ' + name + ' must be an array'); return v; }
function requireObject(v, name) { if (!isObj(v)) throw new TypeError('KMOOR: ' + name + ' must be a non-null, non-array object'); return v; }

function tierByMonthOf(months) {
var m = {}; (months || []).forEach(function (ym, i) { if (i < 4 && s(ym)) m[s(ym)] = TIERS[i]; }); return m;
}


function normalizePoRow_(r) {
return {
poLineId: s(r.purchase_order_line_id), poId: s(r.purchase_order_id),
requestOrderLineId: s(r.request_order_line_id), company: s(r.company), sku: s(r.sku),
supplierWarehouseId: s(r.supplier_warehouse_id),
orderedQty: intOr(r.ordered_qty), completedQty: intOr(r.completed_qty), shippedQty: intOr(r.shipped_qty),
requestedQty: intOr(r.requested_qty), expectedCompletionDate: s(r.expected_completion_date)
};
}









function projectOngoingIncomingForSku(input) {
var root = requireObject(input, 'input');
var masterSku = s(root.masterSku), company = s(root.company);
var poRows = requireArray(root.purchaseOrderLines || [], 'input.purchaseOrderLines');
var reqSrcRows = requireArray(root.requestOrderLineSources || [], 'input.requestOrderLineSources');
var monthlySiteFcFacts = requireArray(root.monthlySiteFcFacts || [], 'input.monthlySiteFcFacts');
var months = requireArray(root.months || [], 'input.months');
var issues = [];
if (!masterSku || !company) throw new TypeError('KMOOR: input.masterSku and input.company are required');


var lines = poRows.map(normalizePoRow_).filter(function (p) { return p.company === company && p.sku === masterSku && p.poLineId; });


var committedRows = [], skuByLineage = {}, poRowByLineage = {};
lines.forEach(function (p) {
poRowByLineage[p.poLineId] = p; skuByLineage[p.poLineId] = p.sku;
if (isNaN(p.orderedQty) || isNaN(p.completedQty)) { issues.push({ stage: 'KMOOR', code: 'INVALID_LIFECYCLE_QTY', poLineId: p.poLineId }); return; }
var notYetReceived = Math.max(0, p.orderedQty - p.completedQty);
if (notYetReceived <= 0) return;
if (!p.supplierWarehouseId) { issues.push({ stage: 'KMOOR', code: 'ONGOING_ORDER_FACTORY_WAREHOUSE_UNRESOLVED', poLineId: p.poLineId }); return; }
committedRows.push({
supplyLineageRef: p.poLineId, company: p.company, masterSku: p.sku, warehouseId: p.supplierWarehouseId,
poolType: 'FACTORY', status: 'in_production', quantity: notYetReceived
});
});

var admittedByLineage = {};
if (committedRows.length) {
var lc = KMSF.projectSupplyLifecycle({ committedProduction: committedRows });
(lc.issues || []).forEach(function (x) { if (x.domain === 'committedProduction') issues.push({ stage: 'KMSF', code: x.reason, i: x.i }); });
(lc.entries || []).forEach(function (e) {
if (e.lifecycleBucket === 'COMMITTED_PRODUCTION') admittedByLineage[e.supplyLineageRef] = (admittedByLineage[e.supplyLineageRef] || 0) + e.quantity;
});
}


var admittedLines = lines.filter(function (p) { return Object.prototype.hasOwnProperty.call(admittedByLineage, p.poLineId); });
var kmoopPoLines = admittedLines.map(function (p) {
return {
purchaseOrderLineId: p.poLineId, purchaseOrderId: p.poId, sku: p.sku, company: p.company,
orderedQty: p.orderedQty, requestedQty: p.requestedQty, completedQty: p.completedQty, shippedQty: p.shippedQty,
requestOrderLineId: p.requestOrderLineId
};
});
var requestSourceFacts = reqSrcRows.map(function (r) {
return { requestOrderLineId: s(r.request_order_line_id), company: s(r.company), country: s(r.country),
marketplace: s(r.marketplace), siteSku: s(r.site_sku), requestedQty: intOr(r.requested_qty) };
});

var byReceiver = {};
if (kmoopPoLines.length) {
var kmoop = KMOOP.projectOngoingOrderSupply({ purchaseOrderLines: kmoopPoLines, requestSourceFacts: requestSourceFacts, monthlySiteFcFacts: monthlySiteFcFacts });

(kmoop.lines || []).forEach(function (l) {
var admitted = admittedByLineage[l.purchaseOrderLineId];
if (admitted !== undefined && l.notYetReceivedCommittedQty !== admitted) {
issues.push({ stage: 'KMOOR', code: 'ONGOING_ADMITTED_QTY_MISMATCH', poLineId: l.purchaseOrderLineId, admitted: admitted, kmoop: l.notYetReceivedCommittedQty });
}
(l.issues || []).forEach(function (x) { issues.push({ stage: 'KMOOP', code: x.code, poLineId: l.purchaseOrderLineId }); });
});


var poLineTiming = admittedLines.map(function (p) { return { purchaseOrderLineId: p.poLineId, expectedCompletionDate: p.expectedCompletionDate }; });
var kmota = KMOTA.projectOngoingOrderIncoming({ ongoingProjection: kmoop, poLineTiming: poLineTiming, tierByMonth: tierByMonthOf(months) });
(kmota.issues || []).forEach(function (x) { issues.push({ stage: 'KMOTA', code: x.code, poLineId: x.purchaseOrderLineId }); });



kmota.incomingEvents.forEach(function (ev) {
var rk = s(ev.receiverKey);
(byReceiver[rk] = byReceiver[rk] || []).push({ incomingId: s(ev.incomingId), eta: s(ev.availableDate), qty: ev.qty, sourceType: SOURCE_TYPE });
});
Object.keys(byReceiver).forEach(function (rk) { byReceiver[rk].sort(function (a, b) { return cmpStr(a.incomingId, b.incomingId); }); });
}

var totalAdmitted = 0, k; for (k in admittedByLineage) if (Object.prototype.hasOwnProperty.call(admittedByLineage, k)) totalAdmitted += admittedByLineage[k];
var totalIncoming = 0, receiverCount = 0;
Object.keys(byReceiver).forEach(function (rk) { receiverCount++; byReceiver[rk].forEach(function (e) { totalIncoming += e.qty; }); });

return {
ready: true, byReceiver: byReceiver, admittedByLineage: admittedByLineage, issues: issues,
totals: { admittedLineages: Object.keys(admittedByLineage).length, totalAdmittedQty: totalAdmitted, receiverCount: receiverCount, totalTimedIncomingQty: totalIncoming }
};
}

return { projectOngoingIncomingForSku: projectOngoingIncomingForSku, SOURCE_TYPE: SOURCE_TYPE, VERSION: 'kmoor-fa3b3a-1' };
});
__kmRegister("supply-planning-ongoing-order-runtime", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;
























(function (root, factory) {
'use strict';
var api = factory(
(typeof require !== 'undefined') ? require('./supply-planning-allocations.js') : (root.KM && root.KM.allocations),
(typeof require !== 'undefined') ? require('./supply-planning-calculations.js') : (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations)
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') {
window.KM = window.KM || {};
window.KM.core = window.KM.core || {};
window.KM.core.supplyPlanningSurplusReallocation = api;
window.KMFSR = api;
}
})(this, function (KMALLOC, KMCALC) {
'use strict';

if (!KMALLOC || typeof KMALLOC.allocateFactoryDeterministic !== 'function') {
throw new Error('KMFSR: KMALLOC.allocateFactoryDeterministic dependency is missing');
}
if (!KMCALC || typeof KMCALC.classifyRequiredByWindow !== 'function' ||
typeof KMCALC.evaluateReallocationEligibility !== 'function' ||
typeof KMCALC.feasibleReallocationQty !== 'function' ||
typeof KMCALC.applyFeasibleReallocation !== 'function' ||
typeof KMCALC.sumRemainingShortages !== 'function') {
throw new Error('KMFSR: KMCALC reallocation/net-order-need dependencies are missing');
}


function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function requireObject(v, name) {
if (!isObject(v)) throw new TypeError('KMFSR: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
return v;
}
function requireArray(v, name) {
if (!Array.isArray(v)) throw new TypeError('KMFSR: ' + name + ' must be an array (got ' + describe(v) + ')');
return v;
}
function requireNonEmptyString(v, name) {
if (typeof v !== 'string' || v.trim() === '') throw new TypeError('KMFSR: ' + name + ' must be a non-empty string (got ' + describe(v) + ')');
return v;
}
function requireQty(v, name) {
if (typeof v !== 'number') throw new TypeError('KMFSR: ' + name + ' must be a number (got ' + describe(v) + ')');
if (!isFinite(v)) throw new RangeError('KMFSR: ' + name + ' must be finite (got ' + v + ')');
if (v < 0) throw new RangeError('KMFSR: ' + name + ' must be non-negative (got ' + v + ')');
return v;
}
function requireIntQty(v, name) {
requireQty(v, name);
if (Math.floor(v) !== v) throw new RangeError('KMFSR: ' + name + ' must be a whole number (got ' + v + ')');
return v;
}
function tierRank(tier) { return tier === 'T1' ? 1 : (tier === 'T2' ? 2 : (tier === 'T3' ? 3 : 0)); }




function normalizeReceivers(receiversIn, calculationDate) {
var recSeen = {};
return requireArray(receiversIn, 'input.receivers').map(function (r, i) {
var ctx = 'input.receivers[' + i + ']';
requireObject(r, ctx);
var demandKey = requireNonEmptyString(r.demandKey, ctx + '.demandKey');
if (recSeen[demandKey]) throw new RangeError('KMFSR: duplicate demandKey "' + demandKey + '"');
recSeen[demandKey] = 1;
var receiverKey = (r.receiverKey === undefined || r.receiverKey === null) ? demandKey : requireNonEmptyString(r.receiverKey, ctx + '.receiverKey');
var projectedRequirementQty = requireQty(r.projectedRequirementQty, ctx + '.projectedRequirementQty');
var eligibleWh = requireArray(r.eligibleFactoryWarehouseIds, ctx + '.eligibleFactoryWarehouseIds').map(function (w, j) {
return requireNonEmptyString(w, ctx + '.eligibleFactoryWarehouseIds[' + j + ']');
});
var cls = KMCALC.classifyRequiredByWindow({ calculationDate: calculationDate, requiredByDate: r.requiredByDate });
var tier = cls.engineB.tier;
return {
demandKey: demandKey, receiverKey: receiverKey, ctx: ctx, raw: r,
requiredByDate: r.requiredByDate, allocationPriority: r.allocationPriority,
projectedRequirementQty: projectedRequirementQty,
eligibleFactoryWarehouseIds: eligibleWh,
tier: tier, actionable: tierRank(tier) > 0
};
});
}







function runReallocation(masterSku, calculationDate, receivers, actionable, bySource, initialQtyBy, totalsIn) {

if (totalsIn.totalInitialAllocatedQty > totalsIn.totalFactorySupplyQty) {
throw new RangeError('KMFSR: initial allocation exceeded physical supply (' + totalsIn.totalInitialAllocatedQty + ' > ' + totalsIn.totalFactorySupplyQty + ')');
}


var facts = {};
var sourceSurplusRemaining = {};
actionable.forEach(function (r) {
var initialQty = initialQtyBy[r.demandKey];
var projReq = r.projectedRequirementQty;
var protectedFactoryQty = Math.min(initialQty, projReq);
var releasableSurplusQty = Math.max(0, initialQty - protectedFactoryQty);
var preTransferRemainingShortageQty = Math.max(0, projReq - initialQty);

var whKeys = Object.keys(bySource[r.demandKey]).sort(cmpStr);
var protectRemaining = protectedFactoryQty;
var srcSurplus = {};
whKeys.forEach(function (wh) {
var q = bySource[r.demandKey][wh];
var consume = Math.min(q, protectRemaining);
protectRemaining -= consume;
var surplusHere = q - consume;
if (surplusHere > 0) srcSurplus[wh] = surplusHere;
});
sourceSurplusRemaining[r.demandKey] = srcSurplus;

facts[r.demandKey] = {
demandKey: r.demandKey, receiverKey: r.receiverKey, tier: r.tier, actionable: true,
requiredByDate: r.requiredByDate, allocationPriority: r.allocationPriority,
eligibleFactoryWarehouseIds: r.eligibleFactoryWarehouseIds,
initialFactoryAllocationQty: initialQty,
protectedFactoryQty: protectedFactoryQty,
releasableSurplusQty: releasableSurplusQty,
preTransferRemainingShortageQty: preTransferRemainingShortageQty,
remainingShortageQty: preTransferRemainingShortageQty,
reallocatedInQty: 0, reallocatedOutQty: 0,
sourceInitial: bySource[r.demandKey]
};
});

receivers.filter(function (r) { return !r.actionable; }).forEach(function (r) {
facts[r.demandKey] = {
demandKey: r.demandKey, receiverKey: r.receiverKey, tier: r.tier, actionable: false,
requiredByDate: r.requiredByDate, allocationPriority: r.allocationPriority,
eligibleFactoryWarehouseIds: r.eligibleFactoryWarehouseIds,
initialFactoryAllocationQty: 0, protectedFactoryQty: 0, releasableSurplusQty: 0,
preTransferRemainingShortageQty: 0, remainingShortageQty: 0,
reallocatedInQty: 0, reallocatedOutQty: 0, sourceInitial: {}
};
});


var receiverOrder = actionable.slice().sort(function (a, b) {
return cmpStr(a.requiredByDate, b.requiredByDate) || (b.allocationPriority - a.allocationPriority) || cmpStr(a.demandKey, b.demandKey);
});
var donorOrder = actionable.slice().sort(function (a, b) {
return cmpStr(a.requiredByDate, b.requiredByDate) || cmpStr(a.demandKey, b.demandKey);
});
var transferLedger = [];

receiverOrder.forEach(function (recv) {
var rf = facts[recv.demandKey];
if (rf.remainingShortageQty <= 0) return;

for (var di = 0; di < donorOrder.length && rf.remainingShortageQty > 0; di++) {
var donor = donorOrder[di];
if (donor.demandKey === recv.demandKey) continue;
var df = facts[donor.demandKey];
if (df.releasableSurplusQty <= 0) continue;


var elig = KMCALC.evaluateReallocationEligibility({
calculationDate: calculationDate,
donor: { masterSku: masterSku, requiredByDate: donor.requiredByDate },
receiver: { masterSku: masterSku, requiredByDate: recv.requiredByDate }
});
if (!elig.eligible) continue;

var srcSurplus = sourceSurplusRemaining[donor.demandKey];
var whKeys = Object.keys(srcSurplus).sort(cmpStr);
for (var wi = 0; wi < whKeys.length && rf.remainingShortageQty > 0; wi++) {
var wh = whKeys[wi];
var avail = srcSurplus[wh];
if (avail <= 0) continue;
if (recv.eligibleFactoryWarehouseIds.indexOf(wh) === -1) continue;


var applied = KMCALC.applyFeasibleReallocation({
receiverRemainingShortage: rf.remainingShortageQty,
donorRemainingSurplus: avail,
timelyTransferableQty: avail
});
var qty = applied.reallocatedQty;
if (qty <= 0) continue;

rf.remainingShortageQty = applied.receiverRemainingShortage;
srcSurplus[wh] = applied.donorRemainingSurplus;
df.releasableSurplusQty -= qty;
df.reallocatedOutQty += qty;
rf.reallocatedInQty += qty;

transferLedger.push({
sourceWarehouseId: wh,
donorDemandKey: donor.demandKey,
receiverDemandKey: recv.demandKey,
qty: qty,
donorTier: elig.donor.tier,
receiverTier: elig.receiver.tier,
reason: 'FACTORY_SURPLUS_REALLOCATION'
});
}
}
});


transferLedger.sort(function (a, b) {
return cmpStr(a.receiverDemandKey, b.receiverDemandKey) || cmpStr(a.donorDemandKey, b.donorDemandKey) || cmpStr(a.sourceWarehouseId, b.sourceWarehouseId);
});

var outReceivers = receivers.map(function (r) { return facts[r.demandKey]; })
.sort(function (a, b) { return cmpStr(a.demandKey, b.demandKey); })
.map(function (f) {
var sourceBreakdown = Object.keys(f.sourceInitial).sort(cmpStr).map(function (wh) {
return { warehouseId: wh, initialAllocatedQty: f.sourceInitial[wh] };
});
var coverageReason;
if (!f.actionable) {
coverageReason = 'NON_ACTIONABLE_VISIBILITY_ONLY';
} else if (f.initialFactoryAllocationQty === 0 && f.preTransferRemainingShortageQty === 0) {
coverageReason = 'NO_REQUIREMENT';
} else if (f.reallocatedOutQty > 0) {
coverageReason = 'DONOR_SURPLUS_RELEASED';
} else if (f.preTransferRemainingShortageQty === 0) {
coverageReason = 'FACTORY_INITIAL_COVERED';
} else if (f.reallocatedInQty > 0 && f.remainingShortageQty === 0) {
coverageReason = 'SURPLUS_REALLOCATION_COVERED';
} else if (f.reallocatedInQty > 0 && f.remainingShortageQty > 0) {
coverageReason = 'SURPLUS_REALLOCATION_PARTIAL';
} else {
coverageReason = 'SHORTAGE_REMAINS';
}
return {
demandKey: f.demandKey,
receiverKey: f.receiverKey,
tier: f.tier,
actionable: f.actionable,
initialFactoryAllocationQty: f.initialFactoryAllocationQty,
protectedFactoryQty: f.protectedFactoryQty,
releasableSurplusQty: f.releasableSurplusQty,
reallocatedInQty: f.reallocatedInQty,
reallocatedOutQty: f.reallocatedOutQty,
remainingShortageQty: f.remainingShortageQty,
netOrderNeed: f.actionable ? f.remainingShortageQty : 0,
coverageReason: coverageReason,
sourceBreakdown: sourceBreakdown
};
});


var totalNetOrderNeed = KMCALC.sumRemainingShortages(
outReceivers.filter(function (f) { return f.actionable; }).map(function (f) { return f.remainingShortageQty; })
);

var totalReallocatedQty = 0; transferLedger.forEach(function (t) { totalReallocatedQty += t.qty; });
var totalReleasableSurplusQty = 0; outReceivers.forEach(function (f) { totalReleasableSurplusQty += (f.releasableSurplusQty + f.reallocatedOutQty); });

return {
masterSku: masterSku,
calculationDate: calculationDate,
receivers: outReceivers,
transferLedger: transferLedger,
totalNetOrderNeed: totalNetOrderNeed,
totals: {
totalFactorySupplyQty: totalsIn.totalFactorySupplyQty,
totalInitialAllocatedQty: totalsIn.totalInitialAllocatedQty,
totalReleasableSurplusQty: totalReleasableSurplusQty,
totalReallocatedQty: totalReallocatedQty,
totalUnusedFactorySupplyQty: totalsIn.totalUnusedFactorySupplyQty
}
};
}





function projectSurplusReallocation(input) {
var root = requireObject(input, 'input');
var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
var calculationDate = requireNonEmptyString(root.calculationDate, 'input.calculationDate');
var factoryPools = requireArray(root.factoryPools, 'input.factoryPools');
var receivers = normalizeReceivers(root.receivers, calculationDate);
var actionable = receivers.filter(function (r) { return r.actionable; });


var poolsForAlloc = factoryPools.map(function (p) {
if (!isObject(p)) return p;
var o = {}; for (var k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k]; } return o;
});
var initial = KMALLOC.allocateFactoryDeterministic({
masterSku: masterSku, factoryPools: poolsForAlloc,
demands: actionable.map(function (r) {
var d = r.raw;
return {
demandKey: r.demandKey, company: d.company, marketplace: d.marketplace,
destinationWarehouseId: d.destinationWarehouseId, requiredByDate: r.requiredByDate,
allocationPriority: r.allocationPriority, demandQty: d.demandQty,
eligibleFactoryWarehouseIds: r.eligibleFactoryWarehouseIds.slice(), state: d.state
};
})
});

var bySource = {}, initialQtyBy = {};
actionable.forEach(function (r) { bySource[r.demandKey] = {}; initialQtyBy[r.demandKey] = 0; });
initial.allocations.forEach(function (a) {
if (!Object.prototype.hasOwnProperty.call(bySource, a.demandKey)) return;
bySource[a.demandKey][a.sourceWarehouseId] = (bySource[a.demandKey][a.sourceWarehouseId] || 0) + a.allocatedQty;
initialQtyBy[a.demandKey] += a.allocatedQty;
});

return runReallocation(masterSku, calculationDate, receivers, actionable, bySource, initialQtyBy, {
totalFactorySupplyQty: initial.totalSupplyQty,
totalInitialAllocatedQty: initial.totalAllocatedQty,
totalUnusedFactorySupplyQty: initial.totalUnusedSupplyQty
});
}










function reallocatePreallocatedFactorySupply(input) {
var root = requireObject(input, 'input');
var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
var calculationDate = requireNonEmptyString(root.calculationDate, 'input.calculationDate');
var unusedFactorySupplyQty = (root.unusedFactorySupplyQty === undefined || root.unusedFactorySupplyQty === null)
? 0 : requireIntQty(root.unusedFactorySupplyQty, 'input.unusedFactorySupplyQty');
var receivers = normalizeReceivers(root.receivers, calculationDate);
var actionable = receivers.filter(function (r) { return r.actionable; });



var bySource = {}, initialQtyBy = {}, totalInitialAllocatedQty = 0;
receivers.forEach(function (r) {
var raw = r.raw;
var srcRaw = raw.initialAllocationBySource;
var normalized = {}, sum = 0;
if (srcRaw !== undefined && srcRaw !== null) {
requireObject(srcRaw, r.ctx + '.initialAllocationBySource');
Object.keys(srcRaw).forEach(function (wh) {
requireNonEmptyString(wh, r.ctx + '.initialAllocationBySource key');
var q = requireIntQty(srcRaw[wh], r.ctx + '.initialAllocationBySource["' + wh + '"]');
if (q > 0) { normalized[wh] = q; sum += q; }
});
}
if (!r.actionable) {


if (sum > 0) throw new RangeError('KMFSR: initialAllocationBySource present for non-actionable receiver "' + r.demandKey + '" (tier ' + r.tier + ')');
return;
}
bySource[r.demandKey] = normalized;
initialQtyBy[r.demandKey] = sum;
totalInitialAllocatedQty += sum;
});

return runReallocation(masterSku, calculationDate, receivers, actionable, bySource, initialQtyBy, {
totalFactorySupplyQty: totalInitialAllocatedQty + unusedFactorySupplyQty,
totalInitialAllocatedQty: totalInitialAllocatedQty,
totalUnusedFactorySupplyQty: unusedFactorySupplyQty
});
}

return {
projectSurplusReallocation: projectSurplusReallocation,
reallocatePreallocatedFactorySupply: reallocatePreallocatedFactorySupply
};
});
__kmRegister("supply-planning-surplus-reallocation", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;












(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.requestDraftV2 = api; }
})(this, function () {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function num(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
function nn(v) { var n = num(v); return (n !== null && n > 0) ? n : 0; }

var TIERS = ['T1', 'T2', 'T3'];
var TIER_STATUS = { draft: 1, submitted: 1, cancelled: 1 };
var HEADER_STATUS = { draft: 1, partially_submitted: 1, submitted: 1, cancelled: 1 };

var SCOPE_FIELDS = ['company', 'country', 'draft_purpose', 'marketplace', 'sku'];


function tierCols(t) {
var p = t.toLowerCase() + '_';
return [p + 'month', p + 'recommended_qty', p + 'order_qty', p + 'carton_qty', p + 'status',
p + 'submitted_by', p + 'submitted_at', p + 'user_edited', p + 'user_edited_by', p + 'note'];
}
var V2_HEADERS = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku',
'status', 'generation_type', 'draft_purpose', 'draft_version',
'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'units_per_carton']
.concat(tierCols('T1')).concat(tierCols('T2')).concat(tierCols('T3'))
.concat(['created_by', 'created_at', 'updated_by', 'updated_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note']);


function normalizePlanningCycleMonthly(input) {
var s = str(input);
var m = /^(\d{4})-(\d{1,2})$/.exec(s);
if (!m) throw new Error('INVALID_PLANNING_CYCLE: expected YYYY-MM, got "' + s + '"');
var mo = Number(m[2]);
if (mo < 1 || mo > 12) throw new Error('INVALID_PLANNING_CYCLE: month out of range in "' + s + '"');
return m[1] + '-' + (mo < 10 ? '0' + mo : String(mo));
}


function scopeKey(scope) {
aType(isObj(scope), 'scopeKey: scope object required');
return SCOPE_FIELDS.map(function (k) { return k + '=' + str(scope[k]); }).join('|');
}
function draftId(scope, planningCycle) {
return 'RD::MONTHLY_ORDER::' + normalizePlanningCycleMonthly(planningCycle) + '::' + scopeKey(scope);
}
function naturalKey(scope, planningCycle) {
return { recommendationType: 'MONTHLY_ORDER', planning_cycle: normalizePlanningCycleMonthly(planningCycle),
company: str(scope.company), country: str(scope.country), marketplace: str(scope.marketplace),
sku: str(scope.sku), draft_purpose: str(scope.draft_purpose) };
}


function sumRecommended(row) { return nn(row.t1_recommended_qty) + nn(row.t2_recommended_qty) + nn(row.t3_recommended_qty); }
function isActionable(row) { return sumRecommended(row) > 0; }
function nonActionableGate(row, opts) {
var manual = !!(opts && opts.manual === true);
if (manual) return { persist: true, manual: true };
return isActionable(row) ? { persist: true, manual: false }
: { persist: false, reason: 'NON_ACTIONABLE_ZERO_RECOMMENDATION' };
}

function deriveCarton(orderQty, upc) { var u = num(upc); var o = nn(orderQty); return (u && u > 0) ? Math.ceil(o / u) : ''; }





function projectFlatDraftRow(input) {
aType(isObj(input) && isObj(input.scope) && isObj(input.tiers), 'projectFlatDraftRow: scope + tiers required');
var cycle = normalizePlanningCycleMonthly(input.planningCycle);
var upc = num(input.unitsPerCarton);
var prov = input.provenance || {};
var row = {};
V2_HEADERS.forEach(function (h) { row[h] = ''; });
row.request_allocation_draft_id = draftId(input.scope, cycle);
row.planning_cycle = cycle;
row.company = str(input.scope.company); row.country = str(input.scope.country);
row.marketplace = str(input.scope.marketplace); row.sku = str(input.scope.sku);
row.draft_purpose = str(input.scope.draft_purpose) || 'regular';
row.generation_type = str(input.generationType) || 'ai_plan';
row.draft_version = (num(input.draftVersion) !== null) ? num(input.draftVersion) : 1;
row.calculation_run_id = str(prov.calculationRunId);
row.formula_version = str(prov.formulaVersion) || 'ORDER_PLANNING_GAP';
row.calculated_at = str(prov.calculatedAt);
row.source_data_as_of = str(prov.sourceDataAsOf);
row.units_per_carton = (upc !== null) ? upc : '';
TIERS.forEach(function (t) {
var p = t.toLowerCase() + '_', f = input.tiers[t] || {};
var rec = nn(f.recommendedQty);
var ord = (f.orderQty === undefined || f.orderQty === null) ? rec : nn(f.orderQty);
row[p + 'month'] = str(f.month);
row[p + 'recommended_qty'] = rec;
row[p + 'order_qty'] = ord;
row[p + 'carton_qty'] = deriveCarton(ord, upc);
row[p + 'status'] = 'draft';
row[p + 'user_edited'] = false;
});
row.created_by = str(input.actor) || 'system';
row.created_at = str(input.now);
row.updated_by = row.created_by;
row.updated_at = str(input.now);
row.status = deriveHeaderStatus(row);
return row;
}


function tierSubmittable(row, t) { var p = t.toLowerCase() + '_'; return nn(row[p + 'order_qty']) > 0 && row[p + 'status'] !== 'submitted' && row[p + 'status'] !== 'cancelled'; }
function deriveHeaderStatus(row) {
if (str(row.status) === 'cancelled') return 'cancelled';
var submittable = 0, submitted = 0;
TIERS.forEach(function (t) {
var p = t.toLowerCase() + '_';
if (nn(row[p + 'order_qty']) > 0 && row[p + 'status'] !== 'cancelled') {
submittable++;
if (row[p + 'status'] === 'submitted') submitted++;
}
});
if (submittable === 0 || submitted === 0) return 'draft';
return (submitted === submittable) ? 'submitted' : 'partially_submitted';
}

function clone(row) { var o = {}; Object.keys(row).forEach(function (k) { o[k] = row[k]; }); return o; }


function applyTierEdit(row, tier, patch, actor, now) {
aType(TIERS.indexOf(tier) !== -1, 'applyTierEdit: bad tier ' + tier);
var p = tier.toLowerCase() + '_', out = clone(row);
if (out[p + 'status'] === 'submitted' || out[p + 'status'] === 'cancelled') { return { ok: false, reason: 'TIER_TERMINAL', row: out }; }
patch = patch || {};
if (patch.order_qty !== undefined) { out[p + 'order_qty'] = nn(patch.order_qty); out[p + 'carton_qty'] = deriveCarton(out[p + 'order_qty'], out.units_per_carton); }
if (patch.carton_qty !== undefined) { out[p + 'carton_qty'] = nn(patch.carton_qty); }
if (patch.note !== undefined) { out[p + 'note'] = str(patch.note); }
out[p + 'user_edited'] = true; out[p + 'user_edited_by'] = str(actor);
out.updated_by = str(actor); out.updated_at = str(now);
out.status = deriveHeaderStatus(out);
return { ok: true, row: out };
}


function applySubmit(row, buckets, actor, now) {
var out = clone(row), results = {};
(buckets || []).forEach(function (t) {
var p = t.toLowerCase() + '_';
if (TIERS.indexOf(t) === -1) { results[t] = 'UNKNOWN_TIER'; return; }
if (nn(out[p + 'order_qty']) <= 0) { results[t] = 'NOT_SUBMITTABLE_ZERO_QTY'; return; }
if (out[p + 'status'] === 'submitted') { results[t] = 'ALREADY_SUBMITTED'; return; }
if (out[p + 'status'] === 'cancelled') { results[t] = 'TIER_CANCELLED'; return; }
out[p + 'status'] = 'submitted'; out[p + 'submitted_by'] = str(actor); out[p + 'submitted_at'] = str(now);
results[t] = 'SUBMITTED';
});
out.updated_by = str(actor); out.updated_at = str(now); out.status = deriveHeaderStatus(out);
return { row: out, results: results };
}
function applyCancel(row, actor, now, reason) {
var out = clone(row); out.status = 'cancelled'; out.cancelled_by = str(actor); out.cancelled_at = str(now);
out.cancel_reason = str(reason); out.updated_by = str(actor); out.updated_at = str(now); return out;
}


function reuse(existing) { return clone(existing); }
function refresh(existing, freshTiers, now) {
var out = clone(existing);
TIERS.forEach(function (t) {
var p = t.toLowerCase() + '_', f = (freshTiers && freshTiers[t]) || null;
if (!f) return;
if (out[p + 'status'] === 'submitted' || out[p + 'status'] === 'cancelled') return;
if (out[p + 'user_edited'] === true) return;
var rec = nn(f.recommendedQty);
out[p + 'recommended_qty'] = rec; out[p + 'order_qty'] = rec; out[p + 'carton_qty'] = deriveCarton(rec, out.units_per_carton);
if (f.month !== undefined) out[p + 'month'] = str(f.month);
});
out.updated_at = str(now); out.status = deriveHeaderStatus(out);
return out;
}
function regenerate(existing, freshTiers, opts, now) {
var confirmOverEdits = !!(opts && opts.confirmRegenerateOverUserEdits === true);
var out = clone(existing);
out.draft_version = (num(out.draft_version) || 1) + 1;
TIERS.forEach(function (t) {
var p = t.toLowerCase() + '_', f = (freshTiers && freshTiers[t]) || null;
if (!f) return;
if (out[p + 'status'] === 'submitted' || out[p + 'status'] === 'cancelled') return;
if (out[p + 'user_edited'] === true && !confirmOverEdits) return;
var rec = nn(f.recommendedQty);
out[p + 'recommended_qty'] = rec; out[p + 'order_qty'] = rec; out[p + 'carton_qty'] = deriveCarton(rec, out.units_per_carton);
if (out[p + 'user_edited'] === true) { out[p + 'user_edited'] = false; out[p + 'user_edited_by'] = ''; }
if (f.month !== undefined) out[p + 'month'] = str(f.month);
});
out.updated_at = str(now); out.status = deriveHeaderStatus(out);
return out;
}


function explodeSendRequestLines(row) {
var out = [];
TIERS.forEach(function (t) {
var p = t.toLowerCase() + '_', q = nn(row[p + 'order_qty']);
if (q <= 0) return;
if (row[p + 'status'] === 'cancelled') return;
out.push({ sku: str(row.sku), company: str(row.company), country: str(row.country), marketplace: str(row.marketplace),
request_bucket: t, request_month: str(row[p + 'month']), requested_qty: q,
units_per_carton: row.units_per_carton, carton_qty: row[p + 'carton_qty'],
request_allocation_draft_id: str(row.request_allocation_draft_id) });
});
return out;
}


function explodeSendRequestLinesFromDto(dto) {
aType(isObj(dto) && Array.isArray(dto.tiers) && isObj(dto.scope), 'explodeSendRequestLinesFromDto: flat readback DTO required');
var out = [];
dto.tiers.forEach(function (t) {
var q = nn(t.orderQty);
if (q <= 0) return;
if (t.status === 'cancelled') return;
out.push({ sku: str(dto.scope.sku), company: str(dto.scope.company), country: str(dto.scope.country), marketplace: str(dto.scope.marketplace),
request_bucket: t.tier, request_month: str(t.month), requested_qty: q,
units_per_carton: (dto.unitsPerCarton === null || dto.unitsPerCarton === undefined) ? '' : dto.unitsPerCarton,
carton_qty: (t.cartonQty === null || t.cartonQty === undefined) ? '' : t.cartonQty,
request_allocation_draft_id: str(dto.draftId) });
});
return out;
}


function idFamily(id) { var s = str(id); if (/^RD::/.test(s)) return 'RD'; if (/^RAD-/.test(s)) return 'RAD'; if (/^RAL-/.test(s)) return 'RAL'; return s ? 'UNKNOWN' : 'BLANK'; }
function classifyLegacyDraft(header, lines) {
lines = lines || [];
var byTier = { T1: [], T2: [], T3: [], T4: [], OTHER: [] };
lines.forEach(function (l) { var b = str(l.request_bucket).toUpperCase(); (byTier[b] || byTier.OTHER).push(l); });
var reasons = [];
if (!header) reasons.push('ORPHAN_LINE_NO_HEADER');
if (byTier.T4.length > 0) reasons.push('T4_PRESENT');
['T1', 'T2', 'T3'].forEach(function (t) { if (byTier[t].length > 1) reasons.push('DUPLICATE_' + t); });
var fam = idFamily(header && header.request_allocation_draft_id);
if (fam === 'RAL' || fam === 'UNKNOWN') reasons.push('UNRECOGNIZED_ID_' + fam);
var upcs = {}; lines.forEach(function (l) { var u = str(l.units_per_carton); if (u !== '') upcs[u] = 1; });
if (Object.keys(upcs).length > 1) reasons.push('INCONSISTENT_UNITS_PER_CARTON');
var actionable = false; lines.forEach(function (l) { if (nn(l.recommended_qty) > 0 || nn(l.order_qty) > 0) actionable = true; });
if (header && lines.length === 0 && actionable) reasons.push('ACTIONABLE_HEADER_ZERO_LINES');
var klass = reasons.length ? 'NEEDS_MANUAL_REVIEW' : 'MIGRATION_SAFE';
if (fam === 'RAL') klass = 'NEEDS_MANUAL_REVIEW';
return { classification: klass, reasons: reasons, idFamily: fam };
}

var ACTIVE_HEADER = { draft: 1, partially_submitted: 1, site_confirmed: 1 };
function detectActiveConflicts(headers) {
var byKey = {}, conflicts = [];
(headers || []).forEach(function (h) {
if (!ACTIVE_HEADER[str(h.status)]) return;
var k = [str(h.company), str(h.country), str(h.marketplace), str(h.sku), str(h.draft_purpose), str(h.planning_cycle)].join('|');
(byKey[k] = byKey[k] || []).push(str(h.request_allocation_draft_id));
});
Object.keys(byKey).forEach(function (k) { if (byKey[k].length > 1) conflicts.push({ naturalScope: k, draftIds: byKey[k] }); });
return conflicts;
}
function mapTierStatus_(legacy) { var s = str(legacy).toLowerCase(); if (s === 'submitted') return 'submitted'; if (s === 'cancelled') return 'cancelled'; return 'draft'; }
function flattenLegacy(header, lines) {
var row = {}; V2_HEADERS.forEach(function (h) { row[h] = ''; });
header = header || {};
['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku', 'status',
'generation_type', 'draft_purpose', 'draft_version', 'calculation_run_id', 'formula_version', 'calculated_at',
'source_data_as_of', 'created_by', 'created_at', 'updated_by', 'updated_at', 'cancelled_by', 'cancelled_at',
'cancel_reason', 'note'].forEach(function (k) { if (header[k] !== undefined) row[k] = header[k]; });
var byTier = {}; (lines || []).forEach(function (l) { byTier[str(l.request_bucket).toUpperCase()] = l; });
var upc = '';
TIERS.forEach(function (t) {
var p = t.toLowerCase() + '_', l = byTier[t];
if (!l) { row[p + 'status'] = 'draft'; row[p + 'user_edited'] = false; row[p + 'order_qty'] = 0; row[p + 'recommended_qty'] = 0; return; }
row[p + 'month'] = str(l.request_month);
row[p + 'recommended_qty'] = nn(l.recommended_qty);
row[p + 'order_qty'] = nn(l.order_qty);
row[p + 'carton_qty'] = (l.carton_qty === undefined || l.carton_qty === '') ? '' : nn(l.carton_qty);
row[p + 'status'] = mapTierStatus_(l.line_status);
row[p + 'submitted_by'] = str(l.submitted_by); row[p + 'submitted_at'] = str(l.submitted_at);
row[p + 'user_edited'] = (l.user_edited === true || str(l.user_edited).toUpperCase() === 'TRUE');
row[p + 'user_edited_by'] = str(l.user_edited_by); row[p + 'note'] = str(l.note);
if (str(l.units_per_carton) !== '') upc = l.units_per_carton;
});
if (str(row.units_per_carton) === '' && upc !== '') row.units_per_carton = upc;
row.status = str(header.status) || deriveHeaderStatus(row);
return row;
}



var CANONICAL_CYCLE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
var MIGRATION_STATUS_MAP = { draft: 'draft', partially_submitted: 'partially_submitted', submitted: 'submitted', cancelled: 'cancelled', site_confirmed: 'draft' };
var MIGRATION_MARKETPLACE_MAP = { 'Amazon': 'Amazon', 'Shopify': 'Shopify', 'KM Walmart': 'Walmart', 'Walmart': 'Walmart' };
var MIGRATION_DRAFT_PURPOSE_ALLOWED = { 'regular': 1 };



function migrateLegacyToCanonical(header, lines, opts) {
opts = opts || {}; header = header || {};
var row = flattenLegacy(header, lines);
var id = str(row.request_allocation_draft_id);
var cyc = str(opts.cycle);
if (!cyc) return { ok: false, halt: 'MIGRATION_CYCLE_MAPPING_MISSING', id: id };
if (!CANONICAL_CYCLE_RE.test(cyc)) return { ok: false, halt: 'MIGRATION_CYCLE_MAPPING_INVALID', id: id, cycle: cyc };
var st = MIGRATION_STATUS_MAP[str(header.status)];
if (st === undefined) return { ok: false, halt: 'MIGRATION_STATUS_UNSUPPORTED', id: id, status: str(header.status) };
var dpRaw = str(header.draft_purpose), dp = (dpRaw === '') ? 'regular' : dpRaw;
if (MIGRATION_DRAFT_PURPOSE_ALLOWED[dp] !== 1) return { ok: false, halt: 'MIGRATION_DRAFT_PURPOSE_UNSUPPORTED', id: id, draft_purpose: dpRaw };
var mk = MIGRATION_MARKETPLACE_MAP[str(header.marketplace)];
if (mk === undefined) return { ok: false, halt: 'MIGRATION_MARKETPLACE_UNSUPPORTED', id: id, marketplace: str(header.marketplace) };
row.planning_cycle = cyc; row.status = st; row.draft_purpose = dp; row.marketplace = mk;
return { ok: true, row: row, normalized: {
cycle_changed: str(header.planning_cycle) !== cyc, status_changed: str(header.status) !== st,
purpose_changed: dpRaw !== dp, marketplace_changed: str(header.marketplace) !== mk } };
}


function summarizeMigration(headers, linesByDraftId) {
headers = headers || []; linesByDraftId = linesByDraftId || {};
var out = { TOTAL_HEADERS: headers.length, RD_HEADERS: 0, RAD_HEADERS: 0, UNKNOWN_HEADERS: 0,
HEADERS_WITH_0_LINES: 0, HEADERS_WITH_1_LINE: 0, HEADERS_WITH_2_LINES: 0, HEADERS_WITH_3_LINES: 0, HEADERS_WITH_GT3_LINES: 0,
DUPLICATE_T1: 0, DUPLICATE_T2: 0, DUPLICATE_T3: 0, T4_PRESENT: 0,
ACTIVE: 0, PARTIALLY_SUBMITTED: 0, SUBMITTED: 0, CANCELLED: 0, ALL_ZERO: 0, ACTIONABLE: 0, USER_EDITED: 0,
MIGRATION_SAFE: 0, NEEDS_MANUAL_REVIEW: 0, BLOCKED_CONFLICT: 0, review: [], conflicts: [] };
var conflicts = detectActiveConflicts(headers);
var conflictIds = {}; conflicts.forEach(function (c) { c.draftIds.forEach(function (id) { conflictIds[id] = c.naturalScope; }); });
out.conflicts = conflicts; out.BLOCKED_CONFLICT = conflicts.reduce(function (a, c) { return a + c.draftIds.length; }, 0);
headers.forEach(function (h) {
var id = str(h.request_allocation_draft_id), fam = idFamily(id), lines = linesByDraftId[id] || [];
if (fam === 'RD') out.RD_HEADERS++; else if (fam === 'RAD') out.RAD_HEADERS++; else out.UNKNOWN_HEADERS++;
var n = lines.length;
out['HEADERS_WITH_' + (n === 0 ? '0_LINES' : n === 1 ? '1_LINE' : n === 2 ? '2_LINES' : n === 3 ? '3_LINES' : 'GT3_LINES')]++;
var byTier = { T1: 0, T2: 0, T3: 0, T4: 0 }; lines.forEach(function (l) { var b = str(l.request_bucket).toUpperCase(); if (byTier[b] !== undefined) byTier[b]++; });
if (byTier.T1 > 1) out.DUPLICATE_T1++; if (byTier.T2 > 1) out.DUPLICATE_T2++; if (byTier.T3 > 1) out.DUPLICATE_T3++;
if (byTier.T4 > 0) out.T4_PRESENT++;
var s = str(h.status);
if (s === 'cancelled') out.CANCELLED++; else if (s === 'submitted') out.SUBMITTED++;
else if (s === 'partially_submitted') out.PARTIALLY_SUBMITTED++; else out.ACTIVE++;
var actionable = false, edited = false;
lines.forEach(function (l) { if (nn(l.recommended_qty) > 0 || nn(l.order_qty) > 0) actionable = true; if (l.user_edited === true || str(l.user_edited).toUpperCase() === 'TRUE') edited = true; });
if (actionable) out.ACTIONABLE++; else out.ALL_ZERO++;
if (edited) out.USER_EDITED++;
var c = classifyLegacyDraft(h, lines);
if (conflictIds[id]) {  out.review.push({ id: id, classification: 'BLOCKED_CONFLICT', reasons: ['ACTIVE_DUPLICATE:' + conflictIds[id]] }); }
else if (c.classification === 'MIGRATION_SAFE') out.MIGRATION_SAFE++;
else { out.NEEDS_MANUAL_REVIEW++; out.review.push({ id: id, classification: c.classification, reasons: c.reasons }); }
});

var headerIds = {}; headers.forEach(function (h) { headerIds[str(h.request_allocation_draft_id)] = 1; });
out.ORPHAN_LINES = Object.keys(linesByDraftId).filter(function (id) { return !headerIds[id] && (linesByDraftId[id] || []).length > 0; }).length;
return out;
}

return {
V2_HEADERS: V2_HEADERS.slice(), TIERS: TIERS.slice(), TIER_STATUS: TIER_STATUS, HEADER_STATUS: HEADER_STATUS,
normalizePlanningCycleMonthly: normalizePlanningCycleMonthly, scopeKey: scopeKey, draftId: draftId, naturalKey: naturalKey,
sumRecommended: sumRecommended, isActionable: isActionable, nonActionableGate: nonActionableGate,
projectFlatDraftRow: projectFlatDraftRow, deriveHeaderStatus: deriveHeaderStatus, tierSubmittable: tierSubmittable,
applyTierEdit: applyTierEdit, applySubmit: applySubmit, applyCancel: applyCancel,
reuse: reuse, refresh: refresh, regenerate: regenerate, explodeSendRequestLines: explodeSendRequestLines,
explodeSendRequestLinesFromDto: explodeSendRequestLinesFromDto,
classifyLegacyDraft: classifyLegacyDraft, detectActiveConflicts: detectActiveConflicts, flattenLegacy: flattenLegacy,
summarizeMigration: summarizeMigration,
CANONICAL_CYCLE_RE: CANONICAL_CYCLE_RE, MIGRATION_STATUS_MAP: MIGRATION_STATUS_MAP,
MIGRATION_MARKETPLACE_MAP: MIGRATION_MARKETPLACE_MAP, migrateLegacyToCanonical: migrateLegacyToCanonical,
VERSION: 'kmrdv2-fa3c-r4c-1'
};
});
__kmRegister("supply-planning-request-draft-v2", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;



















(function (root, factory) {
'use strict';
var req = (typeof require !== 'undefined') ? require : null;
var api = factory(
req ? req('./supply-planning-request-draft-v2.js') : (root.KMRDV2 || (root.KM && root.KM.requestDraftV2)),
req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository))
);
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.requestDraftV2Persistence = api; }
})(this, function (KMRDV2, KMPR) {
'use strict';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function aType(c, m) { if (!c) throw new TypeError(m); }
function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function num(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
function nn(v) { var n = num(v); return (n !== null && n > 0) ? n : 0; }

var RECOMMENDATION_TYPE = 'MONTHLY_ORDER';
var HEADER_TABLE = 'request_order_allocation_drafts';
var TIERS = ['T1', 'T2', 'T3'];
var SCOPE_FIELDS = ['company', 'country', 'marketplace', 'sku', 'draft_purpose'];

var ACTIVE_FLAT_STATUSES = { draft: 1, partially_submitted: 1, site_confirmed: 1 };
var SUBMITTED_FLAT_STATUS = 'submitted';















function withFlatDefaults_(o) {
if (!isObj(o)) return o;
var st = str(o.status), dp = str(o.draft_purpose);
if (st !== '' && dp !== '') return o;
var c = {}; for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; }
if (st === '') c.status = 'draft';
if (dp === '') c.draft_purpose = 'regular';
return c;
}
function neededFlatDefaults_(o) { return isObj(o) && (str(o.status) === '' || str(o.draft_purpose) === ''); }





function v2TableSpecs() {
return [
{ sheetName: HEADER_TABLE, expectedHeaders: KMRDV2.V2_HEADERS.slice(), required: true, extraColumnsPolicy: 'ALLOW' },
{ sheetName: KMPR.RUN_JOURNAL_TABLE, expectedHeaders: KMPR.RUN_JOURNAL_HEADERS.slice(), required: true, extraColumnsPolicy: 'ALLOW' }
];
}
function v2ExpectedHeaderCount() { return KMRDV2.V2_HEADERS.length; }


function tierTuples(row) {
row = row || {};
return TIERS.map(function (t) {
var p = t.toLowerCase() + '_';
return { lineKey: t, userQty: row[p + 'order_qty'], userEdited: row[p + 'user_edited'] };
});
}


function expectedTokenForExisting(existingRow, newVersionIfInsert) {
if (existingRow) return KMPR.computeExpectedToken(existingRow.draft_version, tierTuples(existingRow));
return KMPR.computeExpectedToken(newVersionIfInsert, []);
}


function tiersFromFactLines(lines) {
var tiers = {}, upc = null;
(lines || []).forEach(function (l) {
var b = str(l.request_bucket || l.requestBucket).toUpperCase();
if (TIERS.indexOf(b) === -1) return;
var rec = (l.recommendedQty !== undefined) ? l.recommendedQty : l.recommended_qty;
tiers[b] = { month: str(l.request_month || l.requestMonth), recommendedQty: nn(rec) };
var u = num((l.snapshotRow && l.snapshotRow.units_per_carton) !== undefined ? l.snapshotRow.units_per_carton : (l.units_per_carton !== undefined ? l.units_per_carton : l.unitsPerCarton));
if (u !== null && upc === null) upc = u;
});
return { tiers: tiers, unitsPerCarton: upc };
}

















var REQUIRED_SITE_FIELDS = ['company', 'country', 'marketplace'];
function scopeMatches_(row, scope, cycle) {
var c = str(cycle);
if (c !== '' && str(row.planning_cycle) !== c) return false;
for (var s = 0; s < REQUIRED_SITE_FIELDS.length; s++) {
var sf = REQUIRED_SITE_FIELDS[s], sq = str(scope[sf]);
if (sq === '') return false;
if (str(row[sf]) !== sq) return false;
}
for (var i = 0; i < SCOPE_FIELDS.length; i++) {
var f = SCOPE_FIELDS[i], q = str(scope[f]);
if (REQUIRED_SITE_FIELDS.indexOf(f) !== -1) continue;
if (q !== '' && str(row[f]) !== q) return false;
}
return true;
}


function isConcreteScope(scope) {
for (var i = 0; i < REQUIRED_SITE_FIELDS.length; i++) { if (str((scope || {})[REQUIRED_SITE_FIELDS[i]]) === '') return false; }
return true;
}
function loadActiveFlat(sheetSet, query) {
aType(isObj(query) && isObj(query.businessScope), 'loadActiveFlat: query.businessScope required');
var cycle = KMRDV2.normalizePlanningCycleMonthly(query.planningCycle);
var t = sheetSet[HEADER_TABLE]; aType(t && Array.isArray(t.headers) && Array.isArray(t.rows), 'loadActiveFlat: missing ' + HEADER_TABLE);
var scope = query.businessScope;
var scopeKey = KMPR.buildBusinessScopeKey(RECOMMENDATION_TYPE, {
planning_cycle: cycle, company: str(scope.company), country: str(scope.country),
marketplace: str(scope.marketplace), draft_purpose: str(scope.draft_purpose), sku: str(scope.sku)
});
var matches = t.rows.map(function (r) { return withFlatDefaults_(rowObj_(t.headers, r)); }).filter(function (o) {
return ACTIVE_FLAT_STATUSES[str(o.status)] === 1 && scopeMatches_(o, scope, cycle);
});
if (matches.length === 0) return { status: 'CREATE', activeKey: RECOMMENDATION_TYPE + '::' + scopeKey, draftId: null, businessScopeKey: scopeKey };
if (matches.length === 1) return { status: 'REUSE', activeKey: RECOMMENDATION_TYPE + '::' + scopeKey, draftId: str(matches[0].request_allocation_draft_id), draft: matches[0], businessScopeKey: scopeKey };
return { status: 'BLOCKED_CONFLICT', activeKey: RECOMMENDATION_TYPE + '::' + scopeKey, matchCount: matches.length, businessScopeKey: scopeKey };
}






function planFlat(input) {
aType(isObj(input) && isObj(input.scope), 'planFlat: scope required');
var cycle = KMRDV2.normalizePlanningCycleMonthly(input.planningCycle);
var manual = input.mode === 'manual';
var factTiers = input.tiers ? { tiers: input.tiers, unitsPerCarton: input.unitsPerCarton } : tiersFromFactLines(input.factLines);
var tiers = factTiers.tiers;
var upc = (input.unitsPerCarton !== undefined && input.unitsPerCarton !== null) ? input.unitsPerCarton : factTiers.unitsPerCarton;
var existing = input.existingRow || null;

var row, op, action;
if (!existing) {
action = 'create'; op = 'INSERT';
row = KMRDV2.projectFlatDraftRow({
scope: input.scope, planningCycle: cycle, tiers: tiers, unitsPerCarton: upc,
provenance: input.provenance || {}, generationType: input.generationType || (manual ? 'manual' : 'ai_plan'),
draftVersion: 1, actor: input.actor, now: input.now
});

var gate = KMRDV2.nonActionableGate(row, { manual: manual });
if (!gate.persist) return { persist: false, reason: gate.reason, action: action, op: op, draftId: row.request_allocation_draft_id };
} else {
action = str(input.action).toLowerCase() || 'refresh';
op = 'UPDATE';
if (action === 'reuse') { row = KMRDV2.reuse(existing); }
else if (action === 'regenerate') { row = KMRDV2.regenerate(existing, tiers, { confirmRegenerateOverUserEdits: input.confirmRegenerateOverUserEdits === true }, input.now); }
else { action = 'refresh'; row = KMRDV2.refresh(existing, tiers, input.now); }

if (isObj(input.provenance)) {
if (str(input.provenance.calculationRunId)) row.calculation_run_id = str(input.provenance.calculationRunId);
if (str(input.provenance.formulaVersion)) row.formula_version = str(input.provenance.formulaVersion);
if (str(input.provenance.calculatedAt)) row.calculated_at = str(input.provenance.calculatedAt);
if (str(input.provenance.sourceDataAsOf)) row.source_data_as_of = str(input.provenance.sourceDataAsOf);
}
row.updated_by = str(input.actor) || row.updated_by;
}

var draftVersion = (num(row.draft_version) !== null) ? num(row.draft_version) : 1;
var expectedToken = expectedTokenForExisting(existing, draftVersion);
var calcRunId = str((input.provenance && input.provenance.calculationRunId) || row.calculation_run_id) || ('RUN::' + row.request_allocation_draft_id + '::v' + draftVersion);
row.calculation_run_id = calcRunId;
return {
persist: true, recommendationType: RECOMMENDATION_TYPE, action: action, op: op,
draftId: row.request_allocation_draft_id, draftVersion: draftVersion,
calculationRunId: calcRunId, expectedToken: expectedToken, row: row,
runMeta: {
planning_cycle: cycle, business_scope_key: input.businessScopeKey || '',
formulaVersion: str(row.formula_version), sourceDataAsOf: str(row.source_data_as_of)
}
};
}

















var DECISION_REFUSAL = {
RECOMMENDATION_UNAVAILABLE: 'RECOMMENDATION_UNAVAILABLE',
RECOMMENDATION_STALE: 'RECOMMENDATION_STALE',
ACTION_AUTHORIZES_NO_ORDER: 'ACTION_AUTHORIZES_NO_ORDER',
OPERATOR_AUTHORIZATION_REQUIRED: 'OPERATOR_AUTHORIZATION_REQUIRED'
};


var ORDER_AUTHORIZING_ACTIONS = { NEW_ORDER: 1, REALLOCATE_AND_NEW_ORDER: 1 };
var NON_ORDER_AUTHORIZING_ACTIONS = { REALLOCATE: 1, NO_ACTION: 1, MANUAL_REVIEW: 1 };










function actionAuthorizesOrderWrite(action) {
var a = str(action);
if (a === '') return { eligible: false, reason: DECISION_REFUSAL.RECOMMENDATION_UNAVAILABLE, detail: 'ACTION_ABSENT' };
if (ORDER_AUTHORIZING_ACTIONS[a] === 1) return { eligible: true, reason: null, detail: a };
if (NON_ORDER_AUTHORIZING_ACTIONS[a] === 1) return { eligible: false, reason: DECISION_REFUSAL.ACTION_AUTHORIZES_NO_ORDER, detail: a };
return { eligible: false, reason: DECISION_REFUSAL.RECOMMENDATION_UNAVAILABLE, detail: 'ACTION_NOT_IN_CLOSED_SET' };
}





function planOperatorDecision(input) {
aType(isObj(input), 'planOperatorDecision: input object required');
var action = str(input.recommendationAction);
function refuse(reason, detail) {
return { authorized: false, refusal: reason, detail: str(detail), recommendationAction: action || null,
planInput: null, plan: null, reallocationQtyWritten: false, actionPersisted: false };
}



var elig = actionAuthorizesOrderWrite(action);
if (!elig.eligible && elig.reason === DECISION_REFUSAL.RECOMMENDATION_UNAVAILABLE) return refuse(elig.reason, elig.detail);
if (input.recommendationStale === true) return refuse(DECISION_REFUSAL.RECOMMENDATION_STALE, 'REFRESH_REQUIRED');
if (!elig.eligible) return refuse(elig.reason, elig.detail);
if (input.operatorConfirmed !== true) return refuse(DECISION_REFUSAL.OPERATOR_AUTHORIZATION_REQUIRED, '');



var planInput = {
existingRow: input.existingRow || null,
scope: input.scope, planningCycle: input.planningCycle,
tiers: input.tiers, factLines: input.factLines,
unitsPerCarton: input.unitsPerCarton,
provenance: input.provenance || {},
generationType: input.generationType,
mode: input.mode, action: input.draftAction,
confirmRegenerateOverUserEdits: input.confirmRegenerateOverUserEdits === true,
actor: input.actor, now: input.now, businessScopeKey: input.businessScopeKey
};
return {
authorized: true, refusal: null, detail: '', recommendationAction: action,
planInput: planInput, plan: planFlat(planInput),
reallocationQtyWritten: false, actionPersisted: false
};
}


function rowObj_(headers, row) { var o = {}; for (var i = 0; i < headers.length; i++) o[headers[i]] = row[i]; return o; }
function objRow_(headers, obj) { return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }); }
function findByDraftId_(t, draftId) {
var target = -1, dup = 0;
for (var i = 0; i < t.rows.length; i++) { var o = rowObj_(t.headers, t.rows[i]); if (str(o.request_allocation_draft_id) === str(draftId)) { dup++; if (target === -1) target = i; } }
return { target: target, dup: dup };
}
function applyFlat(sheetSet, plan, expectedToken, opts) {
aType(isObj(plan) && plan.recommendationType === RECOMMENDATION_TYPE, 'applyFlat: MONTHLY_ORDER plan required');
aType(isObj(plan.row) && str(plan.row.request_allocation_draft_id) !== '', 'applyFlat: plan.row with draft id required');
opts = opts || {};
var now = opts.now !== undefined ? opts.now : '', actor = opts.actor !== undefined ? opts.actor : '';
var hT = sheetSet[HEADER_TABLE]; aType(hT && Array.isArray(hT.headers) && Array.isArray(hT.rows), 'applyFlat: missing ' + HEADER_TABLE);
var rT = sheetSet[KMPR.RUN_JOURNAL_TABLE]; aType(rT && Array.isArray(rT.headers) && Array.isArray(rT.rows), 'applyFlat: missing ' + KMPR.RUN_JOURNAL_TABLE);


var found = findByDraftId_(hT, plan.draftId);
if (found.dup > 1) return { runStatus: 'FAILED', wrote: false, reason: 'DUPLICATE_HEADER' };
var existing = found.target === -1 ? null : rowObj_(hT.headers, hT.rows[found.target]);
var liveVersion = existing ? existing.draft_version : expectedToken.draft_version;
var liveToken = { draft_version: liveVersion, userEditFingerprint: KMPR.buildUserEditFingerprint(existing ? tierTuples(existing) : []) };
if (!KMPR.tokensMatch(liveToken, expectedToken)) {
return { runStatus: 'CONFLICT', conflict: true, wrote: false, reason: 'TOKEN_MISMATCH', expected: expectedToken, live: liveToken };
}


var writeRow = objRow_(hT.headers, plan.row);
var action;
if (found.target === -1) { hT.rows.push(writeRow); action = 'INSERT'; }
else { hT.rows[found.target] = writeRow; action = 'UPDATE'; }


var prev = null, ri;
for (ri = 0; ri < rT.rows.length; ri++) { var ro = rowObj_(rT.headers, rT.rows[ri]); if (str(ro.calculation_run_id) === str(plan.calculationRunId)) { prev = ro; break; } }
var attempt = prev ? ((parseInt(prev.attempt_count, 10) || 1) + 1) : 1;
var runRow = {
calculation_run_id: plan.calculationRunId, recommendation_type: RECOMMENDATION_TYPE, draft_id: plan.draftId,
planning_cycle: (plan.runMeta && plan.runMeta.planning_cycle) || '', business_scope_key: (plan.runMeta && plan.runMeta.business_scope_key) || '',
draft_version: plan.draftVersion, run_status: 'COMPLETED', current_stage: 'COMPLETED',
formula_version: (plan.runMeta && plan.runMeta.formulaVersion) || '', source_data_as_of: (plan.runMeta && plan.runMeta.sourceDataAsOf) || '',
started_by: prev ? prev.started_by : actor, started_at: prev ? prev.started_at : now,
completed_by: actor, completed_at: now, error_summary: '', attempt_count: attempt
};
if (ri < rT.rows.length && prev) rT.rows[ri] = objRow_(rT.headers, runRow); else rT.rows.push(objRow_(rT.headers, runRow));

return { runStatus: 'COMPLETED', wrote: true, action: action, draftId: plan.draftId, draftVersion: plan.draftVersion, writtenTables: [HEADER_TABLE, KMPR.RUN_JOURNAL_TABLE] };
}




function generateMonthlyFlat(command, deps) {
aType(isObj(command), 'generateMonthlyFlat: command required');
aType(isObj(deps) && typeof deps.computeFacts === 'function' && typeof deps.lockedApply === 'function', 'generateMonthlyFlat: deps.computeFacts/lockedApply required');
if (command.recommendationType !== RECOMMENDATION_TYPE) return { success: false, error: 'generateMonthlyFlat handles MONTHLY_ORDER only', stage: 'input' };
var cycle;
try { cycle = KMRDV2.normalizePlanningCycleMonthly(command.planningCycle); }
catch (e) { return { success: false, error: (e && e.message) || 'INVALID_PLANNING_CYCLE', stage: 'input' }; }

var rawScope = command.businessScope || {};
var scope = { company: str(rawScope.company), country: str(rawScope.country), marketplace: str(rawScope.marketplace), sku: str(rawScope.sku), draft_purpose: str(rawScope.draft_purpose) || 'regular' };
var query = { recommendationType: RECOMMENDATION_TYPE, planningCycle: cycle, businessScope: scope };
var active = (typeof deps.loadActiveContext === 'function') ? deps.loadActiveContext(query) : { status: 'CREATE' };
if (active && active.status === 'BLOCKED_CONFLICT') return { success: false, error: 'BLOCKED_CONFLICT', stage: 'active', matchCount: active.matchCount };

var facts = deps.computeFacts();
if (facts && facts.ready === false) return { success: false, error: facts.reason || 'FACTS_NOT_READY', stage: 'facts' };















if (isObj(command.recommendation)) {
var rec = command.recommendation;
var e = actionAuthorizesOrderWrite(rec.action);
if (!e.eligible && e.reason === DECISION_REFUSAL.RECOMMENDATION_UNAVAILABLE) {
return { success: true, wrote: false, persisted: false, outcome: 'NOT_ELIGIBLE',
reason: e.reason, detail: e.detail, recommendationAction: str(rec.action) || null };
}
if (rec.stale === true) {
return { success: true, wrote: false, persisted: false, outcome: 'STALE_RECOMMENDATION',
reason: DECISION_REFUSAL.RECOMMENDATION_STALE, detail: 'REFRESH_REQUIRED', recommendationAction: str(rec.action) };
}
if (!e.eligible) {
return { success: true, wrote: false, persisted: false, outcome: 'NOT_ELIGIBLE',
reason: e.reason, detail: e.detail, recommendationAction: str(rec.action) };
}
}
var manual = command.mode === 'manual' || command.mode === 'MANUAL';
var action = command.action || (/REGENERATE/i.test(str(command.mode)) ? 'regenerate' : 'refresh');
var plan = planFlat({
existingRow: (active && active.draft) ? active.draft : null,
scope: { company: str(scope.company), country: str(scope.country), marketplace: str(scope.marketplace), sku: str(scope.sku), draft_purpose: str(scope.draft_purpose) || 'regular' },
planningCycle: cycle, factLines: facts && facts.lines, tiers: facts && facts.tiers,
unitsPerCarton: facts && facts.unitsPerCarton,
provenance: (facts && facts.provenance) || { formulaVersion: facts && facts.formulaVersion, sourceDataAsOf: facts && facts.sourceDataAsOf },
generationType: command.generationType || (manual ? 'manual' : 'ai_plan'), mode: manual ? 'manual' : 'ai_plan',
action: action, confirmRegenerateOverUserEdits: command.confirmRegenerateOverUserEdits === true,
actor: command.actor || 'system', now: command.now, businessScopeKey: active && active.businessScopeKey
});

if (!plan.persist) return { success: true, wrote: false, persisted: false, outcome: 'NON_ACTIONABLE', reason: plan.reason, draftId: plan.draftId };

var res = deps.lockedApply(plan, plan.expectedToken, { now: command.now, actor: command.actor || 'system', generationType: plan.row.generation_type });
var wrote = !!(res && res.wrote === true && res.runStatus === 'COMPLETED');
return {
success: !!(res && (res.runStatus === 'COMPLETED')), wrote: wrote, persisted: wrote,
outcome: res && res.conflict ? 'CONFLICT' : (wrote ? plan.action.toUpperCase() : 'NOT_EXECUTED'),
draftId: plan.draftId, draftVersion: plan.draftVersion, action: plan.action,
writtenTables: wrote ? [HEADER_TABLE, KMPR.RUN_JOURNAL_TABLE] : [], result: res
};
}


function loadFlatById(sheetSet, draftId) {
var t = sheetSet[HEADER_TABLE]; aType(t && Array.isArray(t.headers), 'loadFlatById: missing ' + HEADER_TABLE);
var f = findByDraftId_(t, draftId);
if (f.dup > 1) return { status: 'BLOCKED_CONFLICT', row: null };
if (f.target === -1) return { status: 'NOT_FOUND', row: null };
return { status: 'FOUND', row: rowObj_(t.headers, t.rows[f.target]) };
}


function planForRow_(newRow, existingRow, opts) {
opts = opts || {};
var draftVersion = (num(newRow.draft_version) !== null) ? num(newRow.draft_version) : 1;
var token = opts.expectedToken || expectedTokenForExisting(existingRow, draftVersion);
var calcRunId = str(newRow.calculation_run_id) || ('RUN::' + newRow.request_allocation_draft_id + '::v' + draftVersion);
newRow.calculation_run_id = calcRunId;
return {
persist: true, recommendationType: RECOMMENDATION_TYPE, op: 'UPDATE', action: opts.action || 'edit',
draftId: str(newRow.request_allocation_draft_id), draftVersion: draftVersion,
calculationRunId: calcRunId, expectedToken: token, row: newRow,
runMeta: { planning_cycle: str(newRow.planning_cycle), business_scope_key: opts.businessScopeKey || '',
formulaVersion: str(newRow.formula_version), sourceDataAsOf: str(newRow.source_data_as_of) }
};
}


function tokenForDraft(sheetSet, draftId) {
var r = loadFlatById(sheetSet, draftId);
if (r.status !== 'FOUND') return { found: false, status: r.status };
return { found: true, status: str(r.row.status) || 'draft', expectedToken: expectedTokenForExisting(r.row, r.row.draft_version) };
}




function editMonthlyFlat(command, deps) {
aType(isObj(command) && Array.isArray(command.edits), 'editMonthlyFlat: command.edits required');
aType(isObj(deps) && typeof deps.loadById === 'function' && typeof deps.lockedApply === 'function', 'editMonthlyFlat: deps.loadById/lockedApply required');
var ld = deps.loadById(str(command.draftId));
if (!ld || ld.status !== 'FOUND' || !ld.row) return { success: false, error: (ld && ld.status) || 'DRAFT_NOT_FOUND', stage: 'load' };
var before = ld.row, working = before, results = [];
for (var i = 0; i < command.edits.length; i++) {
var e = command.edits[i] || {}, nk = e.naturalKey || {}, tier = str(nk.request_bucket).toUpperCase();
if (TIERS.indexOf(tier) === -1) { results.push({ tier: tier || '(none)', ok: false, reason: 'UNKNOWN_TIER' }); continue; }
var f = e.fields || {}, patch = {};
if (f.order_qty !== undefined) patch.order_qty = f.order_qty;
if (f.carton_qty !== undefined) patch.carton_qty = f.carton_qty;
if (f.note !== undefined) patch.note = f.note;
var res = KMRDV2.applyTierEdit(working, tier, patch, command.actor || 'user', command.now);
if (!res.ok) { results.push({ tier: tier, ok: false, reason: res.reason }); continue; }
working = res.row; results.push({ tier: tier, ok: true });
}
var anyApplied = results.some(function (r) { return r.ok; });
if (!anyApplied) return { success: false, error: 'NO_EDIT_APPLIED', stage: 'apply', results: results };
var plan = planForRow_(working, before, { expectedToken: command.expectedToken, action: 'edit' });
var out = deps.lockedApply(plan, plan.expectedToken, { now: command.now, actor: command.actor || 'user' });
var wrote = !!(out && out.wrote === true && out.runStatus === 'COMPLETED');
return { success: !!(out && out.runStatus === 'COMPLETED'), wrote: wrote, outcome: out && out.conflict ? 'CONFLICT' : (wrote ? 'EDITED' : 'NOT_EXECUTED'),
draftId: plan.draftId, results: results, result: out };
}



function submitMonthlyFlat(command, deps) {
aType(isObj(command), 'submitMonthlyFlat: command required');
aType(isObj(deps) && typeof deps.loadById === 'function' && typeof deps.lockedApply === 'function', 'submitMonthlyFlat: deps.loadById/lockedApply required');
var ld = deps.loadById(str(command.draftId));
if (!ld || ld.status !== 'FOUND' || !ld.row) return { success: false, error: (ld && ld.status) || 'DRAFT_NOT_FOUND', stage: 'load' };
var before = ld.row;
if (str(before.status) === 'cancelled') return { success: false, error: 'HEADER_CANCELLED', stage: 'input' };
var buckets = (command.buckets && command.buckets.length) ? command.buckets
: TIERS.filter(function (t) { return KMRDV2.tierSubmittable(before, t); });
var sub = KMRDV2.applySubmit(before, buckets, command.actor || 'user', command.now);
var anySubmitted = Object.keys(sub.results).some(function (k) { return sub.results[k] === 'SUBMITTED'; });
if (!anySubmitted) return { success: false, error: 'NO_TIER_SUBMITTED', stage: 'apply', results: sub.results, headerStatus: sub.row.status };
var plan = planForRow_(sub.row, before, { expectedToken: command.expectedToken, action: 'submit' });
var out = deps.lockedApply(plan, plan.expectedToken, { now: command.now, actor: command.actor || 'user' });
var wrote = !!(out && out.wrote === true && out.runStatus === 'COMPLETED');
return { success: !!(out && out.runStatus === 'COMPLETED'), wrote: wrote, outcome: out && out.conflict ? 'CONFLICT' : (wrote ? 'SUBMITTED' : 'NOT_EXECUTED'),
draftId: plan.draftId, results: sub.results, headerStatus: sub.row.status, result: out };
}


function cancelMonthlyFlat(command, deps) {
aType(isObj(command), 'cancelMonthlyFlat: command required');
aType(isObj(deps) && typeof deps.loadById === 'function' && typeof deps.lockedApply === 'function', 'cancelMonthlyFlat: deps.loadById/lockedApply required');
var ld = deps.loadById(str(command.draftId));
if (!ld || ld.status !== 'FOUND' || !ld.row) return { success: false, error: (ld && ld.status) || 'DRAFT_NOT_FOUND', stage: 'load' };
var before = ld.row;
var cancelled = KMRDV2.applyCancel(before, command.actor || 'user', command.now, command.reason);
var plan = planForRow_(cancelled, before, { expectedToken: command.expectedToken, action: 'cancel' });
var out = deps.lockedApply(plan, plan.expectedToken, { now: command.now, actor: command.actor || 'user' });
var wrote = !!(out && out.wrote === true && out.runStatus === 'COMPLETED');
return { success: !!(out && out.runStatus === 'COMPLETED'), wrote: wrote, outcome: out && out.conflict ? 'CONFLICT' : (wrote ? 'CANCELLED' : 'NOT_EXECUTED'), draftId: plan.draftId, result: out };
}


function buildSendRequestLines(dto) { return KMRDV2.explodeSendRequestLinesFromDto(dto); }


function tierDto_(row, t) {
var p = t.toLowerCase() + '_';
return {
tier: t, month: str(row[p + 'month']), recommendedQty: nn(row[p + 'recommended_qty']),
orderQty: nn(row[p + 'order_qty']), cartonQty: (row[p + 'carton_qty'] === '' || row[p + 'carton_qty'] === undefined) ? null : nn(row[p + 'carton_qty']),
status: str(row[p + 'status']) || 'draft', submittedBy: str(row[p + 'submitted_by']), submittedAt: str(row[p + 'submitted_at']),
userEdited: (row[p + 'user_edited'] === true || str(row[p + 'user_edited']).toUpperCase() === 'TRUE'),
userEditedBy: str(row[p + 'user_edited_by']), note: str(row[p + 'note'])
};
}
function flatReadbackDto(row) {
aType(isObj(row), 'flatReadbackDto: row required');
return {
recommendationType: RECOMMENDATION_TYPE,
draftId: str(row.request_allocation_draft_id), planningCycle: str(row.planning_cycle),
scope: { company: str(row.company), country: str(row.country), marketplace: str(row.marketplace), sku: str(row.sku), draftPurpose: str(row.draft_purpose) || 'regular' },
status: str(row.status) || 'draft', generationType: str(row.generation_type), draftVersion: (num(row.draft_version) !== null) ? num(row.draft_version) : 1,
provenance: { calculationRunId: str(row.calculation_run_id), formulaVersion: str(row.formula_version), calculatedAt: str(row.calculated_at), sourceDataAsOf: str(row.source_data_as_of) },
unitsPerCarton: (num(row.units_per_carton) !== null) ? num(row.units_per_carton) : null,
tiers: TIERS.map(function (t) { return tierDto_(row, t); }),
audit: { createdBy: str(row.created_by), createdAt: str(row.created_at), updatedBy: str(row.updated_by), updatedAt: str(row.updated_at), cancelledBy: str(row.cancelled_by), cancelledAt: str(row.cancelled_at), cancelReason: str(row.cancel_reason) },
note: str(row.note)
};
}




function readSubmittedFlatForScope(sheetSet, query) {
var t = sheetSet[HEADER_TABLE]; aType(t && Array.isArray(t.headers), 'readSubmittedFlatForScope: missing ' + HEADER_TABLE);
var raw = str(query.planningCycle);
var cycle = (raw === '') ? '' : KMRDV2.normalizePlanningCycleMonthly(raw);
var scope = query.businessScope || {};
return t.rows.map(function (r) { return withFlatDefaults_(rowObj_(t.headers, r)); })
.filter(function (o) { return str(o.status) === SUBMITTED_FLAT_STATUS && scopeMatches_(o, scope, cycle); })
.map(flatReadbackDto);
}
function readActiveFlatForScope(sheetSet, query) {
var t = sheetSet[HEADER_TABLE]; aType(t && Array.isArray(t.headers), 'readActiveFlatForScope: missing ' + HEADER_TABLE);


var raw = str(query.planningCycle);
var cycle = (raw === '') ? '' : KMRDV2.normalizePlanningCycleMonthly(raw);
var scope = query.businessScope || {};
return t.rows.map(function (r) { return withFlatDefaults_(rowObj_(t.headers, r)); })
.filter(function (o) { return ACTIVE_FLAT_STATUSES[str(o.status)] === 1 && scopeMatches_(o, scope, cycle); })
.map(flatReadbackDto);
}



function auditFlatForScope(sheetSet, query) {
var t = sheetSet[HEADER_TABLE];
if (!t || !Array.isArray(t.headers)) return { tablePresent: false, totalRows: 0, headerCount: 0, scopeRows: 0, active: 0, submitted: 0, other: 0, defaulted: 0, byStatus: {} };
var raw = str(query && query.planningCycle);
var cycle = (raw === '') ? '' : KMRDV2.normalizePlanningCycleMonthly(raw);
var scope = (query && query.businessScope) || {};
var out = { tablePresent: true, totalRows: t.rows.length, headerCount: t.headers.length, scopeRows: 0, active: 0, submitted: 0, other: 0, defaulted: 0, byStatus: {} };
t.rows.forEach(function (r) {
var o0 = rowObj_(t.headers, r), o = withFlatDefaults_(o0);
if (!scopeMatches_(o, scope, cycle)) return;
out.scopeRows++;
if (neededFlatDefaults_(o0)) out.defaulted++;
var st = str(o.status);
out.byStatus[st] = (out.byStatus[st] || 0) + 1;
if (ACTIVE_FLAT_STATUSES[st] === 1) out.active++;
else if (st === SUBMITTED_FLAT_STATUS) out.submitted++;
else out.other++;
});
return out;
}








function draftActionable_(lines) { var a = false; (lines || []).forEach(function (l) { if (nn(l.recommended_qty) > 0 || nn(l.order_qty) > 0) a = true; }); return a; }
function planMigration(headers, linesByDraftId, opts) {
headers = headers || []; linesByDraftId = linesByDraftId || {}; opts = opts || {};
var expect = opts.expect || {};
var summary = KMRDV2.summarizeMigration(headers, linesByDraftId);

var checks = [
['TOTAL_HEADERS', summary.TOTAL_HEADERS], ['ACTIONABLE', summary.ACTIONABLE], ['ALL_ZERO', summary.ALL_ZERO],
['NEEDS_MANUAL_REVIEW', summary.NEEDS_MANUAL_REVIEW], ['BLOCKED_CONFLICT', summary.BLOCKED_CONFLICT],
['ORPHAN_LINES', summary.ORPHAN_LINES], ['DUPLICATE_T1', summary.DUPLICATE_T1], ['DUPLICATE_T2', summary.DUPLICATE_T2],
['DUPLICATE_T3', summary.DUPLICATE_T3], ['T4_PRESENT', summary.T4_PRESENT]
];
var drift = [];
checks.forEach(function (c) { if (expect[c[0]] !== undefined && Number(expect[c[0]]) !== Number(c[1])) drift.push({ field: c[0], expected: expect[c[0]], live: c[1] }); });
if (summary.NEEDS_MANUAL_REVIEW > 0 || summary.BLOCKED_CONFLICT > 0) drift.push({ field: 'UNSAFE_ROWS', expected: 0, live: summary.NEEDS_MANUAL_REVIEW + summary.BLOCKED_CONFLICT });
if (drift.length) return { ok: false, halt: 'R4_LIVE_DATA_DRIFT_FROM_R3', summary: summary, drift: drift };





var authority = opts.authorizedCycleById || null;

var actionableIds = [], hasLines = 0, submittedExpected = 0;
headers.forEach(function (h) {
var id = str(h.request_allocation_draft_id), lines = linesByDraftId[id] || [];
if (str(h.status) === 'submitted') submittedExpected++;
if (lines.length > 0) hasLines++;
if (draftActionable_(lines)) actionableIds.push(id);
});
if (authority) {
var authIds = Object.keys(authority);
var actSet = {}; actionableIds.forEach(function (id) { actSet[id] = 1; });
var authSet = {}; authIds.forEach(function (id) { authSet[id] = 1; });
var missing = authIds.filter(function (id) { return !actSet[id]; });
var extra = actionableIds.filter(function (id) { return !authSet[id]; });
if (missing.length || extra.length) return { ok: false, halt: 'MIGRATION_AUTHORIZED_ID_SET_MISMATCH', summary: summary,
authorized_count: authIds.length, actionable_count: actionableIds.length, missing_ids: missing, extra_actionable_ids: extra };
}


var stagingRows = [], preservedIds = 0, convertedIds = 0, rd = 0, rad = 0, submittedMigrated = 0;
var seenId = {}, dupSelect = 0;
var norm = { CYCLE_NORMALIZED: 0, STATUS_NORMALIZED: 0, PURPOSE_NORMALIZED: 0, MARKETPLACE_NORMALIZED: 0 };
var dist = { cycle: {}, status: {}, purpose: {}, marketplace: {} };
for (var hi = 0; hi < headers.length; hi++) {
var h = headers[hi], id = str(h.request_allocation_draft_id), lines = linesByDraftId[id] || [];
if (!draftActionable_(lines)) continue;
var row;
if (authority) {
var mig = KMRDV2.migrateLegacyToCanonical(h, lines, { cycle: str(authority[id]) });
if (!mig.ok) return { ok: false, halt: mig.halt, summary: summary, id: mig.id, detail: mig };
row = mig.row;
if (mig.normalized.cycle_changed) norm.CYCLE_NORMALIZED++;
if (mig.normalized.status_changed) norm.STATUS_NORMALIZED++;
if (mig.normalized.purpose_changed) norm.PURPOSE_NORMALIZED++;
if (mig.normalized.marketplace_changed) norm.MARKETPLACE_NORMALIZED++;
} else {
row = KMRDV2.flattenLegacy(h, lines);
}
dist.cycle[str(row.planning_cycle)] = (dist.cycle[str(row.planning_cycle)] || 0) + 1;
dist.status[str(row.status)] = (dist.status[str(row.status)] || 0) + 1;
dist.purpose[str(row.draft_purpose)] = (dist.purpose[str(row.draft_purpose)] || 0) + 1;
dist.marketplace[str(row.marketplace)] = (dist.marketplace[str(row.marketplace)] || 0) + 1;
if (str(row.request_allocation_draft_id) === id && id !== '') preservedIds++; else convertedIds++;
if (seenId[id]) dupSelect++; seenId[id] = 1;
var fam = /^RD::/.test(id) ? 'RD' : (/^RAD-/.test(id) ? 'RAD' : 'OTHER');
if (fam === 'RD') rd++; else if (fam === 'RAD') rad++;
if (str(row.status) === 'submitted') submittedMigrated++;
stagingRows.push(row);
}

if (convertedIds !== 0) return { ok: false, halt: 'MIGRATION_ID_CONVERTED', summary: summary, convertedIds: convertedIds };
if (dupSelect !== 0) return { ok: false, halt: 'MIGRATION_DUPLICATE_ID', summary: summary };
if (expect.SUBMITTED !== undefined && submittedExpected !== Number(expect.SUBMITTED)) return { ok: false, halt: 'R4_LIVE_DATA_DRIFT_FROM_R3', summary: summary, drift: [{ field: 'SUBMITTED', expected: expect.SUBMITTED, live: submittedExpected }] };
if (submittedMigrated !== submittedExpected) return { ok: false, halt: 'SUBMITTED_NOT_FULLY_MIGRATED', summary: summary, submittedExpected: submittedExpected, submittedMigrated: submittedMigrated };
if (stagingRows.length !== summary.ACTIONABLE) return { ok: false, halt: 'ACTIONABLE_SELECTION_MISMATCH', summary: summary, selected: stagingRows.length };
if (hasLines !== summary.ACTIONABLE) return { ok: false, halt: 'HAS_LINES_NE_ACTIONABLE', summary: summary, hasLines: hasLines };

var report = {
SOURCE_HEADERS: headers.length, ACTIONABLE: summary.ACTIONABLE,
NON_ACTIONABLE_DROPPED_FROM_V2: summary.ALL_ZERO, MIGRATE_ROWS: stagingRows.length,
SUBMITTED_SOURCE: submittedExpected, SUBMITTED_MIGRATED: submittedMigrated,
RD_MIGRATED: rd, RAD_MIGRATED: rad, PRESERVED_IDS: preservedIds, CONVERTED_IDS: convertedIds,
TARGET_HEADERS: KMRDV2.V2_HEADERS.length, TARGET_ROWS: stagingRows.length,
AUTHORITY_APPLIED: !!authority, NORMALIZATION_COUNTS: norm, NORMALIZED_DISTRIBUTIONS: dist
};
return { ok: true, summary: summary, report: report, stagingHeaders: KMRDV2.V2_HEADERS.slice(), stagingRows: stagingRows };
}






var CANONICAL_STATUSES = { draft: 1, partially_submitted: 1, submitted: 1, cancelled: 1 };
function validateStaging(stagingHeaders, stagingRows, sourceHeaders, sourceLinesByDraftId, opts) {
opts = opts || {}; sourceHeaders = sourceHeaders || []; sourceLinesByDraftId = sourceLinesByDraftId || {};
var V = KMRDV2.V2_HEADERS;
var schemaOk = Array.isArray(stagingHeaders) && stagingHeaders.length === V.length && stagingHeaders.join('|') === V.join('|');
var retired = ['request_allocation_line_id', 'category_snapshot', 'series_snapshot', 't4_month', 't4_order_qty', 'net_order_need_snapshot', 'factory_available_qty_snapshot'];
var noRetired = (stagingHeaders || []).every(function (h) { return retired.indexOf(h) === -1 && !/^t4_/.test(h); });
schemaOk = schemaOk && noRetired;
var expectRows = (opts.expectRows !== undefined) ? Number(opts.expectRows) : null;
var rowCountOk = expectRows === null ? (stagingRows.length > 0) : (stagingRows.length === expectRows);

var ids = {}, idDup = 0; stagingRows.forEach(function (r) { var id = str(r.request_allocation_draft_id); if (ids[id]) idDup++; ids[id] = 1; });
var idSetOk = idDup === 0 && Object.keys(ids).length === stagingRows.length;

var srcIds = {}; sourceHeaders.forEach(function (h) { srcIds[str(h.request_allocation_draft_id)] = 1; });
var idPreservationOk = stagingRows.every(function (r) { return srcIds[str(r.request_allocation_draft_id)] === 1; });

var srcSubmitted = sourceHeaders.filter(function (h) { return str(h.status) === 'submitted'; }).map(function (h) { return str(h.request_allocation_draft_id); });
var stagingById = {}; stagingRows.forEach(function (r) { stagingById[str(r.request_allocation_draft_id)] = r; });
var submittedSetOk = srcSubmitted.every(function (id) { return stagingById[id] && str(stagingById[id].status) === 'submitted'; });

var cycleFormatOk = stagingRows.every(function (r) { return KMRDV2.CANONICAL_CYCLE_RE.test(str(r.planning_cycle)); });
var authority = opts.authorizedCycleById || null;
var cycleAuthorityOk = !!authority && stagingRows.every(function (r) { return str(r.planning_cycle) === str(authority[str(r.request_allocation_draft_id)]); });

var headerStatusOk = stagingRows.every(function (r) { return CANONICAL_STATUSES[str(r.status)] === 1; });

var draftPurposeOk = stagingRows.every(function (r) { return str(r.draft_purpose) === 'regular'; });

var srcById = {}; sourceHeaders.forEach(function (h) { srcById[str(h.request_allocation_draft_id)] = h; });
var marketplaceOk = stagingRows.every(function (r) {
var mk = str(r.marketplace); if (mk === 'KM Walmart') return false;
var src = srcById[str(r.request_allocation_draft_id)];
var expected = src ? KMRDV2.MIGRATION_MARKETPLACE_MAP[str(src.marketplace)] : undefined;
return expected !== undefined && mk === expected;
});

var scopeSeen = {}, scopeDup = 0;
stagingRows.forEach(function (r) {
if (ACTIVE_FLAT_STATUSES[str(r.status)] !== 1) return;
var k = SCOPE_FIELDS.map(function (f) { return str(r[f]); }).join('|') + '|' + str(r.planning_cycle);
if (scopeSeen[k]) scopeDup++; scopeSeen[k] = 1;
});
var naturalScopeOk = scopeDup === 0;



var idents = opts.canonicalActiveIdentities || [];
var identKey = function (o) { return [str(o.company), str(o.country), str(o.marketplace), str(o.sku), str(o.draft_purpose), str(o.planning_cycle)].join('|'); };
var identSet = {}; idents.forEach(function (o) { identSet[identKey(o)] = 1; });
var activeRows = stagingRows.filter(function (r) { return ACTIVE_FLAT_STATUSES[str(r.status)] === 1; });
var activeScopeReusable = idents.length > 0 && activeRows.every(function (r) { return identSet[identKey(r)] === 1; });

var tierOk = true;
stagingRows.forEach(function (r) {
var id = str(r.request_allocation_draft_id), lines = sourceLinesByDraftId[id] || [], byB = {};
lines.forEach(function (l) { byB[str(l.request_bucket).toUpperCase()] = l; });
TIERS.forEach(function (t) {
var p = t.toLowerCase() + '_', l = byB[t];
if (!l) { if (nn(r[p + 'order_qty']) !== 0 || nn(r[p + 'recommended_qty']) !== 0) tierOk = false; return; }
if (nn(r[p + 'order_qty']) !== nn(l.order_qty)) tierOk = false;
if (nn(r[p + 'recommended_qty']) !== nn(l.recommended_qty)) tierOk = false;
if (str(r[p + 'month']) !== str(l.request_month)) tierOk = false;
});
});

var oldLineTableUntouched = (opts.oldLineWriteCount === undefined) ? true : (Number(opts.oldLineWriteCount) === 0);
var gates = {
SCHEMA_OK: schemaOk, ROW_COUNT_OK: rowCountOk, PLANNING_CYCLE_FORMAT_OK: cycleFormatOk,
PLANNING_CYCLE_AUTHORITY_OK: cycleAuthorityOk, HEADER_STATUS_OK: headerStatusOk, DRAFT_PURPOSE_OK: draftPurposeOk,
CANONICAL_MARKETPLACE_OK: marketplaceOk, ID_PRESERVATION_OK: idPreservationOk, ID_SET_OK: idSetOk,
SUBMITTED_SET_OK: submittedSetOk, TIER_VALUES_OK: tierOk, NATURAL_SCOPE_OK: naturalScopeOk,
ACTIVE_SCOPE_REUSABLE: activeScopeReusable, OLD_LINE_TABLE_UNTOUCHED: oldLineTableUntouched
};
var ready = Object.keys(gates).every(function (k) { return gates[k] === true; });
gates.READY_FOR_SWAP = ready ? 'YES' : 'NO';
return gates;
}

return {
RECOMMENDATION_TYPE: RECOMMENDATION_TYPE, HEADER_TABLE: HEADER_TABLE,
v2TableSpecs: v2TableSpecs, v2ExpectedHeaderCount: v2ExpectedHeaderCount,
tierTuples: tierTuples, expectedTokenForExisting: expectedTokenForExisting,
tiersFromFactLines: tiersFromFactLines, loadActiveFlat: loadActiveFlat, loadFlatById: loadFlatById,
planFlat: planFlat, planOperatorDecision: planOperatorDecision,
actionAuthorizesOrderWrite: actionAuthorizesOrderWrite,
DECISION_REFUSAL: DECISION_REFUSAL,
ORDER_AUTHORIZING_ACTIONS: ORDER_AUTHORIZING_ACTIONS,
NON_ORDER_AUTHORIZING_ACTIONS: NON_ORDER_AUTHORIZING_ACTIONS,
applyFlat: applyFlat, generateMonthlyFlat: generateMonthlyFlat,
tokenForDraft: tokenForDraft, editMonthlyFlat: editMonthlyFlat, submitMonthlyFlat: submitMonthlyFlat,
cancelMonthlyFlat: cancelMonthlyFlat, buildSendRequestLines: buildSendRequestLines,
flatReadbackDto: flatReadbackDto, readActiveFlatForScope: readActiveFlatForScope,
readSubmittedFlatForScope: readSubmittedFlatForScope, auditFlatForScope: auditFlatForScope,
isConcreteScope: isConcreteScope, MAX_READBACK_SCOPES: 25,
withFlatDefaults: withFlatDefaults_,
planMigration: planMigration, validateStaging: validateStaging,
VERSION: 'kmrdv2p-s5r7a-1'
};
});
__kmRegister("supply-planning-request-draft-v2-persistence", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;











































(function (root, factory) {
'use strict';
var api = factory();
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.factorySiteAllocation = api; }
if (typeof root !== 'undefined' && root) { root.KMFSA = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

var VERSION = 'kmfsa-fb4e-r4b-r1-1';

function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function up(v) { return str(v).toUpperCase(); }
function low(v) { return str(v).toLowerCase(); }
function numOr0(v) {
if (v === '' || v === null || v === undefined) return 0;
var n = typeof v === 'number' ? v : parseFloat(v);
return (typeof n === 'number' && isFinite(n)) ? n : 0;
}


function companyKey(v) { return up(v).replace(/[^A-Z0-9]+/g, ''); }
var RESUS_KEY = 'RESUS';






var FACTORY_SOURCE_POLICY = {
CN: { receiverCompanyKeys: null, label: 'SHARED_ALL_ELIGIBLE' },
TW: { receiverCompanyKeys: [RESUS_KEY], label: 'RESUS_ONLY' }
};
function policyFor(countryCode) {
var c = up(countryCode);
return Object.prototype.hasOwnProperty.call(FACTORY_SOURCE_POLICY, c) ? FACTORY_SOURCE_POLICY[c] : null;
}
function isEligibleReceiver(policy, siteCompany) {
if (!policy) return false;
if (policy.receiverCompanyKeys === null) return true;
var k = companyKey(siteCompany);
for (var i = 0; i < policy.receiverCompanyKeys.length; i++) { if (policy.receiverCompanyKeys[i] === k) return true; }
return false;
}


var MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];


function forecastWindowMonths(calculationMonth) {
var m = /^(\d{4})-(\d{1,2})$/.exec(str(calculationMonth));
if (!m) throw new Error('INVALID_CALCULATION_MONTH: expected YYYY-MM, got "' + str(calculationMonth) + '"');
var y = Number(m[1]), mo = Number(m[2]);
if (mo < 1 || mo > 12) throw new Error('INVALID_CALCULATION_MONTH: month out of range in "' + str(calculationMonth) + '"');
var out = [];
for (var i = 1; i <= 4; i++) {
var idx = (mo - 1) + i, yy = y + Math.floor(idx / 12), mm = idx % 12;
out.push({ year: String(yy), key: MONTH_KEYS[mm], label: String(yy) + '-' + (mm + 1 < 10 ? '0' : '') + String(mm + 1) });
}
return out;
}





function siteKey(site) {
var id = str(site && site.marketplaceId);
if (id) return 'MKT:' + id;
return 'CCM:' + up(site && site.company) + '|' + up(site && site.country) + '|' + low(site && site.marketplace);
}


function normFactoryRow(r) {
r = r || {};
var cur = (r.currentStock !== undefined) ? r.currentStock : (r.fac_current_stock !== undefined ? r.fac_current_stock : r.current_stock);
var res = (r.reservedStock !== undefined) ? r.reservedStock : (r.fac_reserved_stock !== undefined ? r.fac_reserved_stock : r.reserved_stock);
return {
sku: str(r.sku),
warehouseId: str(r.warehouseId !== undefined ? r.warehouseId : r.warehouse_id),
currentStock: numOr0(cur),
reservedStock: numOr0(res)
};
}
function truthy(v) {
if (v === true) return true;
var s = low(v);
return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}
function falsy(v) {
if (v === false) return true;
var s = low(v);
return s === 'false' || s === '0' || s === 'no' || s === 'n';
}
function normWarehouse(w) {
w = w || {};
var fac = (w.isFactoryWarehouse !== undefined) ? w.isFactoryWarehouse : w.is_factory_warehouse;
var act = (w.isActive !== undefined) ? w.isActive : w.is_active;
return {
warehouseId: str(w.warehouseId !== undefined ? w.warehouseId : w.warehouse_id),
company: str(w.company),
country: str(w.country),
warehouseName: str(w.warehouseName !== undefined ? w.warehouseName : w.warehouse_name),
isFactory: truthy(fac),


isInactive: falsy(act)
};
}
function normSite(s) {
s = s || {};
return {
marketplaceId: str(s.marketplaceId !== undefined ? s.marketplaceId : s.marketplace_id),
company: str(s.company),
country: str(s.country),
marketplace: str(s.marketplace),
sku: str(s.sku)
};
}
function normFcRow(r) {
r = r || {};
var out = {
year: str(r.year), company: str(r.company), country: str(r.country),
marketplace: str(r.marketplace), sku: str(r.sku)
};
for (var i = 0; i < MONTH_KEYS.length; i++) { var k = MONTH_KEYS[i]; out[k] = numOr0(r[k]); }
return out;
}





function fcIndex(fcRows) {
var idx = {};
(fcRows || []).forEach(function (raw) {
var r = normFcRow(raw);
var k = companyKey(r.company) + '|' + up(r.country) + '|' + low(r.marketplace) + '|' + up(r.sku) + '|' + r.year;
(idx[k] = idx[k] || []).push(r);
});
return idx;
}
function forecastWeight(idx, site, months) {
var base = companyKey(site.company) + '|' + up(site.country) + '|' + low(site.marketplace) + '|' + up(site.sku) + '|';
var total = 0, matchedMonths = 0;
for (var i = 0; i < months.length; i++) {
var mo = months[i], rows = idx[base + mo.year];
if (!rows || !rows.length) continue;
var sum = 0;
for (var j = 0; j < rows.length; j++) { sum += numOr0(rows[j][mo.key]); }
total += sum; matchedMonths++;
}
return { qty: total, matchedMonths: matchedMonths, windowMonths: months.length };
}





function largestRemainder(available, weighted) {
var out = {};
var i;



var ordered = weighted.slice().sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
for (i = 0; i < ordered.length; i++) out[ordered[i].key] = 0;
var sumW = 0;
for (i = 0; i < weighted.length; i++) sumW += weighted[i].weight;
if (!(available > 0) || !(sumW > 0) || !weighted.length) return { byKey: out, allocated: 0 };
var rows = [];
for (i = 0; i < weighted.length; i++) {
var raw = available * weighted[i].weight / sumW;
var fl = Math.floor(raw);
rows.push({ key: weighted[i].key, floor: fl, frac: raw - fl });
out[weighted[i].key] = fl;
}
var assigned = 0;
for (i = 0; i < rows.length; i++) assigned += rows[i].floor;
var remainder = available - assigned;
rows.sort(function (a, b) {
if (b.frac !== a.frac) return b.frac - a.frac;
return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
});
for (i = 0; i < rows.length && remainder > 0; i++) { out[rows[i].key] += 1; remainder -= 1; }
var allocated = 0;
for (i = 0; i < weighted.length; i++) allocated += out[weighted[i].key];
return { byKey: out, allocated: allocated };
}





function project(input) {
input = input || {};
var sku = str(input.sku);
var months = forecastWindowMonths(input.calculationMonth);
var issues = [];
function issue(code, ref, message) { issues.push({ code: code, ref: str(ref), message: str(message) }); }

var whById = {};
(input.warehouses || []).forEach(function (raw) { var w = normWarehouse(raw); if (w.warehouseId) whById[w.warehouseId] = w; });

var sites = [];
var seenSite = {};
(input.sites || []).forEach(function (raw) {
var s = normSite(raw);
if (up(s.sku) !== up(sku)) return;
if (!s.company || !s.country || !s.marketplace) { issue('SITE_SCOPE_INCOMPLETE', siteKey(s), 'site scope missing company/country/marketplace — excluded from every eligible receiver set'); return; }
var k = siteKey(s);
if (seenSite[k]) return;
seenSite[k] = 1;
sites.push({ key: k, site: s });
});

var idx = fcIndex(input.forecastRows);
sites.forEach(function (row) {
var w = forecastWeight(idx, row.site, months);
row.weight = w.qty; row.fcMatchedMonths = w.matchedMonths;
if (w.matchedMonths === 0) issue('SITE_FORECAST_WINDOW_MISSING', row.key, 'no Regular FC row for any month of the rolling four-month window — contributes weight 0');
});


var poolByWh = {};
(input.factoryRows || []).forEach(function (raw) {
var f = normFactoryRow(raw);
if (up(f.sku) !== up(sku)) return;
if (!f.warehouseId) { issue('FACTORY_ROW_WITHOUT_WAREHOUSE', f.sku, 'factory_stock row carries no warehouse_id — cannot resolve a source country, excluded'); return; }
var p = poolByWh[f.warehouseId] || (poolByWh[f.warehouseId] = { warehouseId: f.warehouseId, currentQty: 0, reservedQty: 0 });
p.currentQty += f.currentStock; p.reservedQty += f.reservedStock;
});

var pools = Object.keys(poolByWh).sort().map(function (id) {
var p = poolByWh[id], wh = whById[id] || null;

p.availableQty = Math.max(p.currentQty - p.reservedQty, 0);
p.warehouseName = wh ? (wh.warehouseName || id) : id;
p.sourceCountry = wh ? up(wh.country) : '';
p.allocations = {}; p.allocated = 0; p.eligibleSiteKeys = []; p.denominator = 0;
p.unallocated = p.availableQty; p.unallocatedReason = ''; p.policy = '';

if (!wh) { p.unallocatedReason = 'FACTORY_WAREHOUSE_UNKNOWN'; issue('FACTORY_WAREHOUSE_UNKNOWN', id, 'no warehouses row for this factory warehouse_id — source country unresolved, nothing allocated'); return p; }
if (!wh.isFactory) { p.unallocatedReason = 'NOT_A_FACTORY_WAREHOUSE'; issue('NOT_A_FACTORY_WAREHOUSE', id, 'factory_stock row points at a warehouse that is not flagged is_factory_warehouse'); return p; }
if (wh.isInactive) { p.unallocatedReason = 'FACTORY_WAREHOUSE_INACTIVE'; issue('FACTORY_WAREHOUSE_INACTIVE', id, 'factory warehouse is explicitly inactive — its stock is not allocated to any site'); return p; }
var policy = policyFor(p.sourceCountry);
if (!policy) { p.unallocatedReason = 'NO_AUTHORIZED_SOURCE_POLICY'; issue('NO_AUTHORIZED_SOURCE_POLICY', id, 'no authorized factory-source policy for country "' + p.sourceCountry + '" — fail closed, nothing allocated'); return p; }
p.policy = policy.label;

var eligible = sites.filter(function (row) { return isEligibleReceiver(policy, row.site.company); });
p.eligibleSiteKeys = eligible.map(function (r) { return r.key; });
if (!eligible.length) { p.unallocatedReason = 'NO_ELIGIBLE_RECEIVER'; return p; }

var weighted = eligible.map(function (r) { return { key: r.key, weight: Math.max(r.weight, 0) }; });
p.denominator = weighted.reduce(function (a, x) { return a + x.weight; }, 0);
if (!(p.denominator > 0)) {

eligible.forEach(function (r) { p.allocations[r.key] = 0; });
p.unallocatedReason = 'ZERO_FORECAST_DENOMINATOR';
return p;
}
if (!(p.availableQty > 0)) { eligible.forEach(function (r) { p.allocations[r.key] = 0; }); p.unallocatedReason = 'NO_AVAILABLE_STOCK'; return p; }

var res = largestRemainder(p.availableQty, weighted);
p.allocations = res.byKey; p.allocated = res.allocated;
p.unallocated = p.availableQty - res.allocated;
if (p.unallocated > 0) p.unallocatedReason = 'ROUNDING_REMAINDER';
return p;
});

var bySite = {}, byCountry = {};

sites.slice().sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); })
.forEach(function (row) { bySite[row.key] = { site: row.site, total: 0, byCountry: {}, forecastWeight: row.weight }; });
var totalAvail = 0, totalAlloc = 0;
pools.forEach(function (p) {
totalAvail += p.availableQty; totalAlloc += p.allocated;
var c = p.sourceCountry || 'UNKNOWN';
var bc = byCountry[c] || (byCountry[c] = { available: 0, allocated: 0, unallocated: 0 });
bc.available += p.availableQty; bc.allocated += p.allocated; bc.unallocated += p.unallocated;
Object.keys(p.allocations).forEach(function (k) {
var q = p.allocations[k]; if (!bySite[k]) return;
bySite[k].total += q;
bySite[k].byCountry[c] = (bySite[k].byCountry[c] || 0) + q;
});
});

return {
sku: sku, calculationMonth: str(input.calculationMonth),
windowMonths: months.map(function (m) { return m.label; }),
pools: pools, bySite: bySite, byCountry: byCountry,
totals: { available: totalAvail, allocated: totalAlloc, unallocated: totalAvail - totalAlloc },
issues: issues, version: VERSION
};
}





function siteFactoryAvailability(projection, site) {
var k = siteKey(normSite(site));
var e = projection && projection.bySite ? projection.bySite[k] : null;
var byCountry = (e && e.byCountry) || {};
return {
siteKey: k, total: (e ? e.total : 0),
cn: byCountry.CN || 0, tw: byCountry.TW || 0,
byCountry: byCountry, resolved: !!e
};
}

return {
project: project,
siteFactoryAvailability: siteFactoryAvailability,
siteKey: siteKey, companyKey: companyKey,
forecastWindowMonths: forecastWindowMonths,
policyFor: policyFor, isEligibleReceiver: isEligibleReceiver,
largestRemainder: largestRemainder,
FACTORY_SOURCE_POLICY: FACTORY_SOURCE_POLICY,
VERSION: VERSION
};
});
__kmRegister("supply-planning-factory-site-allocation", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;








































(function (root, factory) {
var mod = factory();
if (typeof module === 'object' && module && module.exports) module.exports = mod;
if (root) root.KMFCN = mod;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';



var PROVENANCE = {
ACTUAL: 'ACTUAL',
EXPLICIT_ZERO: 'EXPLICIT_ZERO',
DEFAULT_ZERO_BLANK_MONTH: 'DEFAULT_ZERO_BLANK_MONTH',
DEFAULT_ZERO_MISSING_YEAR: 'DEFAULT_ZERO_MISSING_YEAR'
};

var BLOCK = {
REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
TRANSPORT_FAILURE: 'TRANSPORT_FAILURE',
TABLE_MISSING: 'TABLE_MISSING',
REQUIRED_HEADER_MISSING: 'REQUIRED_HEADER_MISSING',
SCOPE_IDENTITY_INCOMPLETE: 'SCOPE_IDENTITY_INCOMPLETE',
INVALID_NUMERIC_VALUE: 'INVALID_NUMERIC_VALUE',
DUPLICATE_CONFLICTING_ROWS: 'DUPLICATE_CONFLICTING_ROWS',
READ_OUTCOME_UNKNOWN: 'READ_OUTCOME_UNKNOWN'
};
var BLOCK_CODES = Object.keys(BLOCK).map(function (k) { return BLOCK[k]; });
var MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
var REQUIRED_HEADERS = ['year', 'company', 'country', 'marketplace', 'sku'];

function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function isBlank(v) { return v === '' || v === null || v === undefined; }








function checkContext(ctx) {
ctx = ctx || {};
if (ctx.readOutcomeUnknown === true) return BLOCK.READ_OUTCOME_UNKNOWN;
if (ctx.timedOut === true) return BLOCK.REQUEST_TIMEOUT;
if (ctx.transportFailed === true) return BLOCK.TRANSPORT_FAILURE;
if (ctx.readSucceeded !== true) return BLOCK.READ_OUTCOME_UNKNOWN;
if (ctx.tableMissing === true) return BLOCK.TABLE_MISSING;
if (ctx.schemaValid === false) return BLOCK.REQUIRED_HEADER_MISSING;
if (Array.isArray(ctx.headers) && ctx.headers.length) {
var lower = ctx.headers.map(function (h) { return str(h).toLowerCase(); });
for (var i = 0; i < REQUIRED_HEADERS.length; i++) {
if (lower.indexOf(REQUIRED_HEADERS[i]) === -1) return BLOCK.REQUIRED_HEADER_MISSING;
}
}
if (ctx.scopeValid === false) return BLOCK.SCOPE_IDENTITY_INCOMPLETE;
return null;
}


function scopeComplete(scope, sku) {
scope = scope || {};
return !!(str(scope.company) && str(scope.country) && str(scope.marketplace) && str(sku));
}







function normalizeMonth(input) {
input = input || {};
var ctx = input.context || {};
var blocked = checkContext(ctx);
if (blocked) return { ok: false, value: null, provenance: null, code: blocked, rowCount: 0, distinctCount: 0 };
if (!scopeComplete(input.scope, input.sku)) {
return { ok: false, value: null, provenance: null, code: BLOCK.SCOPE_IDENTITY_INCOMPLETE, rowCount: 0, distinctCount: 0 };
}
var m = /^(\d{4})-(\d{2})$/.exec(str(input.month));
if (!m) return { ok: false, value: null, provenance: null, code: BLOCK.SCOPE_IDENTITY_INCOMPLETE, rowCount: 0, distinctCount: 0 };
var year = Number(m[1]), abbr = MONTH_ABBR[Number(m[2]) - 1];
if (!abbr) return { ok: false, value: null, provenance: null, code: BLOCK.SCOPE_IDENTITY_INCOMPLETE, rowCount: 0, distinctCount: 0 };

var rows = (input.matchingRows || []).filter(function (r) { return r && Number(r.year) === year; });
if (!rows.length) {



return { ok: true, value: 0, provenance: PROVENANCE.DEFAULT_ZERO_MISSING_YEAR, code: null, rowCount: 0, distinctCount: 0 };
}
var distinct = {}, blanks = 0, invalid = 0;
rows.forEach(function (r) {
var v = r[abbr];
if (isBlank(v)) { blanks++; return; }
var n = Number(v);


if (typeof v === 'boolean' || !isFinite(n)) { invalid++; return; }
distinct[String(n)] = n;
});
if (invalid > 0) {
return { ok: false, value: null, provenance: null, code: BLOCK.INVALID_NUMERIC_VALUE, rowCount: rows.length, distinctCount: Object.keys(distinct).length };
}
var keys = Object.keys(distinct);
if (keys.length > 1) {


return { ok: false, value: null, provenance: null, code: BLOCK.DUPLICATE_CONFLICTING_ROWS, rowCount: rows.length, distinctCount: keys.length };
}
if (!keys.length) {

return { ok: true, value: 0, provenance: PROVENANCE.DEFAULT_ZERO_BLANK_MONTH, code: null, rowCount: rows.length, distinctCount: 0, blankCells: blanks };
}
var value = distinct[keys[0]];
return { ok: true, value: value, provenance: value === 0 ? PROVENANCE.EXPLICIT_ZERO : PROVENANCE.ACTUAL,
code: null, rowCount: rows.length, distinctCount: 1 };
}








function normalizeWindow(input) {
input = input || {};
var months = input.months || [];
var out = { ok: true, basis: 0, values: {}, months: [], issues: [],
counters: { actual_count: 0, explicit_zero_count: 0, default_zero_blank_count: 0, default_zero_missing_year_count: 0 } };
if (!months.length) {
out.ok = false;
out.issues.push({ month: null, code: BLOCK.SCOPE_IDENTITY_INCOMPLETE, message: 'no forecast window supplied' });
return out;
}
for (var i = 0; i < months.length; i++) {
var r = normalizeMonth({ context: input.context, scope: input.scope, sku: input.sku,
month: months[i], matchingRows: input.matchingRows });
r.month = months[i];
out.months.push(r);
if (!r.ok) {
out.ok = false;
out.issues.push({ month: months[i], code: r.code, message: 'forecast month cannot be resolved: ' + r.code });
continue;
}
out.values[months[i]] = r.value;
out.basis += r.value;
if (r.provenance === PROVENANCE.ACTUAL) out.counters.actual_count++;
else if (r.provenance === PROVENANCE.EXPLICIT_ZERO) out.counters.explicit_zero_count++;
else if (r.provenance === PROVENANCE.DEFAULT_ZERO_BLANK_MONTH) out.counters.default_zero_blank_count++;
else if (r.provenance === PROVENANCE.DEFAULT_ZERO_MISSING_YEAR) out.counters.default_zero_missing_year_count++;
}
if (!out.ok) { out.basis = null; out.reason = out.issues[0].code; }
return out;
}


function rowsForScope(rows, scope, sku) {
scope = scope || {};
var co = str(scope.company), cn = str(scope.country), mp = str(scope.marketplace), sk = str(sku);
return (rows || []).filter(function (r) {
return r && str(r.company) === co && str(r.country) === cn && str(r.marketplace) === mp && str(r.sku) === sk;
});
}

return {
PROVENANCE: PROVENANCE,
BLOCK: BLOCK,
BLOCK_CODES: BLOCK_CODES,
MONTH_ABBR: MONTH_ABBR,
REQUIRED_HEADERS: REQUIRED_HEADERS,
normalizeMonth: normalizeMonth,
normalizeWindow: normalizeWindow,
rowsForScope: rowsForScope,
_version: 'f1-7n-fc-1b-e3-r3-r1-forecast-normalization'
};
}));
__kmRegister("supply-planning-forecast-normalization", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;













































(function (root, factory) {
var api = factory();
if (typeof module === 'object' && module.exports) module.exports = api;
if (root) root.KMSNF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

var STATES = {
CURRENT_PRE_SCHEDULE: 'CURRENT_PRE_SCHEDULE',
CURRENT_DURING_REFRESH: 'CURRENT_DURING_REFRESH',
CURRENT_AFTER_REFRESH: 'CURRENT_AFTER_REFRESH',
REFRESH_OVERDUE: 'REFRESH_OVERDUE',
REFRESH_FAILED: 'REFRESH_FAILED',
PARTIAL_SNAPSHOT_BLOCKED: 'PARTIAL_SNAPSHOT_BLOCKED',
LINEAGE_MISMATCH: 'LINEAGE_MISMATCH',
NO_COMPLETE_SNAPSHOT: 'NO_COMPLETE_SNAPSHOT',
SCHEDULE_UNRESOLVED: 'SCHEDULE_UNRESOLVED'
};

var ACCEPTING = { CURRENT_PRE_SCHEDULE: 1, CURRENT_DURING_REFRESH: 1, CURRENT_AFTER_REFRESH: 1 };

function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
var YMD = /^\d{4}-\d{2}-\d{2}$/;






function prevYmd(ymd) {
var y = +ymd.slice(0, 4), m = +ymd.slice(5, 7), d = +ymd.slice(8, 10);
d -= 1;
if (d < 1) {
m -= 1;
if (m < 1) { m = 12; y -= 1; }
var leap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
d = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}

function businessNow(nowMs, offsetMinutes) {
var d = new Date(nowMs + offsetMinutes * 60000);
var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
return {
ymd: y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day,
minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
hhmm: ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2)
};
}































function canonicalDate(value, offsetMinutes) {


if (!isInt(offsetMinutes)) {
return { ok: false, date: null, kind: 'UNKNOWN', reason: 'TIMEZONE_AUTHORITY_UNAVAILABLE' };
}
if (value === null || value === undefined || value === '') {
return { ok: false, date: null, kind: 'BLANK', reason: 'CALCULATION_DATE_MISSING' };
}


if (typeof value === 'object' && typeof value.getTime === 'function') {
var t = value.getTime();
if (typeof t !== 'number' || !isFinite(t)) {
return { ok: false, date: null, kind: 'DATE', reason: 'CALCULATION_DATE_INVALID_DATE' };
}
var b = businessNow(t, offsetMinutes);
return { ok: true, date: b.ymd, kind: 'DATE', reason: null };
}
if (typeof value === 'string') {
var sv = value.trim();
if (!YMD.test(sv)) {
return { ok: false, date: null, kind: 'STRING', reason: 'CALCULATION_DATE_UNREADABLE' };
}

var y = Number(sv.slice(0, 4)), mo = Number(sv.slice(5, 7)), da = Number(sv.slice(8, 10));
var probe = new Date(Date.UTC(y, mo - 1, da));
if (probe.getUTCFullYear() !== y || probe.getUTCMonth() + 1 !== mo || probe.getUTCDate() !== da) {
return { ok: false, date: null, kind: 'STRING', reason: 'CALCULATION_DATE_NOT_A_CALENDAR_DAY' };
}
return { ok: true, date: sv, kind: 'STRING', reason: null };
}


return { ok: false, date: null, kind: typeof value === 'number' ? 'NUMBER' : 'OTHER',
reason: 'CALCULATION_DATE_UNREADABLE' };
}















function assess(input) {
input = input || {};
var out = {
state: null, ok: false, acceptedDate: null, acceptedCycle: null, reason: null,
businessNow: null, scheduledStart: null, overdueAfter: null, detail: {}
};


if (!isInt(input.nowMs)) {
out.state = STATES.SCHEDULE_UNRESOLVED;
out.reason = 'nowMs must be supplied by the SERVER — this module never reads a clock';
return out;
}
var offset = isInt(input.utcOffsetMinutes) ? input.utcOffsetMinutes : null;
if (offset === null) {
out.state = STATES.SCHEDULE_UNRESOLVED;
out.reason = 'utcOffsetMinutes must be supplied — the business zone is not guessed';
return out;
}
var now = businessNow(input.nowMs, offset);
out.businessNow = { date: now.ymd, time: now.hhmm, minuteOfDay: now.minuteOfDay, utcOffsetMinutes: offset };


var sch = input.schedule || {};
if (!isInt(sch.hour) || sch.hour < 0 || sch.hour > 23 || !isInt(sch.minute) || sch.minute < 0 || sch.minute > 59) {
out.state = STATES.SCHEDULE_UNRESOLVED;
out.reason = 'the daily schedule is unresolved — without it "late" has no meaning and nothing may be assumed';
return out;
}
var startMin = sch.hour * 60 + sch.minute;


var drift = isInt(sch.driftMinutes) ? sch.driftMinutes : 15;
var budget = isInt(sch.completionBudgetMinutes) ? sch.completionBudgetMinutes : 240;
var overdueMin = startMin + drift + budget;
out.scheduledStart = { minuteOfDay: startMin, hhmm: ('0' + sch.hour).slice(-2) + ':' + ('0' + sch.minute).slice(-2) };
out.overdueAfter = { minuteOfDay: overdueMin, driftMinutes: drift, completionBudgetMinutes: budget };


var rows = Array.isArray(input.snapshotDates) ? input.snapshotDates : [];
var seen = [], i;
for (i = 0; i < rows.length; i++) {
var r = rows[i] || {};
var d = str(r.date);
if (!YMD.test(d)) {
out.state = STATES.LINEAGE_MISMATCH;
out.reason = 'a snapshot row carries an unreadable calculation_date (' + (d || '(blank)') + ')';
return out;
}
seen.push({ date: d, status: str(r.status), rowCount: isInt(r.rowCount) ? r.rowCount : null,
planningCycle: str(r.planningCycle) });
}
out.detail.distinctDates = seen.map(function (x) { return x.date; }).sort();

if (!seen.length) {
out.state = STATES.NO_COMPLETE_SNAPSHOT;
out.reason = 'no materialized snapshot exists for this scope at any date';
return out;
}





if (out.detail.distinctDates.length > 1) {
out.state = STATES.PARTIAL_SNAPSHOT_BLOCKED;
out.reason = 'this scope carries rows from ' + out.detail.distinctDates.length
+ ' different calculation dates (' + out.detail.distinctDates.join(', ')
+ ') — a run was caught mid-write and its rows must not be mixed';
return out;
}
var only = seen[0];
out.detail.snapshotDate = only.date;





























var wantCycle = str(input.expectedPlanningCycle);
var haveCycle = only.planningCycle || ('RECO-' + only.date.slice(0, 7));
out.detail.snapshotCycle = haveCycle;
var prevDay = prevYmd(now.ymd);



var isMonthRolloverCarry = (wantCycle !== haveCycle) && (only.date === prevDay)
&& (wantCycle === 'RECO-' + now.ymd.slice(0, 7))
&& (haveCycle === 'RECO-' + prevDay.slice(0, 7));
out.detail.monthRolloverCarry = isMonthRolloverCarry;
if (wantCycle && haveCycle && wantCycle !== haveCycle && !isMonthRolloverCarry) {
out.state = STATES.LINEAGE_MISMATCH;
out.reason = 'the snapshot belongs to ' + haveCycle + ' and this plan is ' + wantCycle;
return out;
}

if (only.date > now.ymd) {
out.state = STATES.LINEAGE_MISMATCH;
out.reason = 'the snapshot is dated ' + only.date + ', which is after the business date ' + now.ymd;
return out;
}


if (only.status && only.status !== 'READY') {
out.state = STATES.NO_COMPLETE_SNAPSHOT;
out.reason = 'the only snapshot for this scope is ' + only.status + ', not READY';
return out;
}




var job = input.jobState || null;
var jobStatus = job ? str(job.status).toUpperCase() : '';
out.detail.jobStatus = jobStatus || null;
out.detail.jobRunId = job ? (str(job.runId) || null) : null;



var jobStartedToday = !!(job && YMD.test(str(job.startedAtDate)) && str(job.startedAtDate) === now.ymd);
out.detail.jobStartedToday = jobStartedToday;
var jobRunning = jobStatus === 'PENDING' || jobStatus === 'RUNNING' || jobStatus === 'RESCHEDULED_LOCKED';
var jobFailed = jobStatus === 'FAILED' || jobStatus === 'ERROR' || jobStatus === 'STALLED' || jobStatus === 'BLOCKED';

var haveToday = (only.date === now.ymd);


if (haveToday) {

out.state = STATES.CURRENT_AFTER_REFRESH;
out.ok = true;
out.acceptedDate = only.date;
out.acceptedCycle = haveCycle;
out.reason = "today's run completed and its snapshot is the current one";
return out;
}


if (jobFailed && jobStartedToday) {
out.state = STATES.REFRESH_FAILED;
out.reason = "today's materialization reported " + jobStatus
+ ' — the previous snapshot is NOT adopted over a known failure';
return out;
}
if (now.minuteOfDay < startMin) {

out.state = STATES.CURRENT_PRE_SCHEDULE;
out.ok = true;
out.acceptedDate = only.date;
out.acceptedCycle = haveCycle;
out.reason = "today's materialization is scheduled for " + out.scheduledStart.hhmm + ' and it is '
+ now.hhmm + ' — the latest complete snapshot (' + only.date + ') is current, not stale';
return out;
}
if (now.minuteOfDay < overdueMin) {


out.state = STATES.CURRENT_DURING_REFRESH;
out.ok = true;
out.acceptedDate = only.date;
out.acceptedCycle = haveCycle;
out.reason = "today's materialization is due or running (" + (jobRunning ? 'job ' + jobStatus : 'no completed rows yet')
+ ') — the last COMPLETE snapshot (' + only.date + ') remains the authority until it finishes';
return out;
}

out.state = STATES.REFRESH_OVERDUE;
out.reason = "today's materialization should have completed by "
+ ('0' + Math.floor(overdueMin / 60)).slice(-2) + ':' + ('0' + (overdueMin % 60)).slice(-2)
+ ' and no snapshot for ' + now.ymd + ' exists — the latest is ' + only.date;
return out;
}

return {
STATES: STATES,
ACCEPTING: ACCEPTING,
isAccepting: function (state) { return ACCEPTING[state] === 1; },
businessNow: businessNow,
canonicalDate: canonicalDate,
assess: assess,
_version: 'f1-7n-fc-1b-e3-r4-a2-r1-r1-snapshot-freshness'
};
});
__kmRegister("supply-planning-snapshot-freshness", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;












































(function (root, factory) {
var api = factory();
if (typeof module === 'object' && module.exports) module.exports = api;
if (root) root.KMARC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';





var ACTIVE_STATUSES = { draft: 1, site_confirmed: 1, partially_submitted: 1 };


var TERMINAL_STATUSES = { submitted: 1, cancelled: 1, expired: 1 };

var STATUS_CLASS = {
ACTIVE: 'ACTIVE',
TERMINAL: 'TERMINAL',
BLANK: 'BLANK',
UNRECOGNISED: 'UNRECOGNISED'
};



var EXCLUSION = {
STATUS_TERMINAL: 'STATUS_TERMINAL',
STATUS_BLANK: 'STATUS_BLANK',
STATUS_UNRECOGNISED: 'STATUS_UNRECOGNISED',
COMPANY_BLANK_ON_ROW: 'COMPANY_BLANK_ON_ROW',
COMPANY_BLANK_ON_SCOPE: 'COMPANY_BLANK_ON_SCOPE',
COMPANY_MISMATCH: 'COMPANY_MISMATCH',
COUNTRY_BLANK_ON_ROW: 'COUNTRY_BLANK_ON_ROW',
COUNTRY_BLANK_ON_SCOPE: 'COUNTRY_BLANK_ON_SCOPE',
COUNTRY_MISMATCH: 'COUNTRY_MISMATCH',
MARKETPLACE_BLANK_ON_ROW: 'MARKETPLACE_BLANK_ON_ROW',
MARKETPLACE_BLANK_ON_SCOPE: 'MARKETPLACE_BLANK_ON_SCOPE',
MARKETPLACE_MISMATCH: 'MARKETPLACE_MISMATCH'
};

var CONTRACT = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R2 2 - a header counts toward a station current plan when its '
+ 'status is one of {draft, site_confirmed, partially_submitted} AND company, country and the STATION '
+ 'marketplace all match exactly. A blank on either side of any axis is a refusal, never a wildcard. '
+ 'destination_marketplace is route identity and is never a scope input.';

function str(v) { return String(v == null ? '' : v).trim(); }
function lo(v) { return str(v).toLowerCase(); }

function statusClass(v) {
var s = lo(v);
if (!s) return STATUS_CLASS.BLANK;
if (ACTIVE_STATUSES[s] === 1) return STATUS_CLASS.ACTIVE;
if (TERMINAL_STATUSES[s] === 1) return STATUS_CLASS.TERMINAL;
return STATUS_CLASS.UNRECOGNISED;
}


function axis(rowValue, scopeValue, blankRow, blankScope, mismatch) {
var r = lo(rowValue), q = lo(scopeValue);
if (!q) return blankScope;
if (!r) return blankRow;
return (r === q) ? '' : mismatch;
}








function classifyHeader(row, scope) {
row = row || {}; scope = scope || {};
var status = str(row.status);
var cls = statusClass(status);
var reasons = [];

if (cls === STATUS_CLASS.TERMINAL) reasons.push(EXCLUSION.STATUS_TERMINAL);
else if (cls === STATUS_CLASS.BLANK) reasons.push(EXCLUSION.STATUS_BLANK);
else if (cls === STATUS_CLASS.UNRECOGNISED) reasons.push(EXCLUSION.STATUS_UNRECOGNISED);

var rowCompany = row.company != null ? row.company : row.Company;
var rowCountry = row.country != null ? row.country : row.Country;

var rowMarketplace = row.marketplace != null ? row.marketplace : row.Marketplace;

var scopeReasons = [];
var a = axis(rowCompany, scope.company, EXCLUSION.COMPANY_BLANK_ON_ROW, EXCLUSION.COMPANY_BLANK_ON_SCOPE, EXCLUSION.COMPANY_MISMATCH);
if (a) scopeReasons.push(a);
a = axis(rowCountry, scope.country, EXCLUSION.COUNTRY_BLANK_ON_ROW, EXCLUSION.COUNTRY_BLANK_ON_SCOPE, EXCLUSION.COUNTRY_MISMATCH);
if (a) scopeReasons.push(a);
a = axis(rowMarketplace, scope.marketplace, EXCLUSION.MARKETPLACE_BLANK_ON_ROW, EXCLUSION.MARKETPLACE_BLANK_ON_SCOPE, EXCLUSION.MARKETPLACE_MISMATCH);
if (a) scopeReasons.push(a);

return {
allocation_draft_id: str(row.allocation_draft_id || row.allocationDraftId),
status: status,
status_class: cls,
lifecycle_active: cls === STATUS_CLASS.ACTIVE,
scope_match: scopeReasons.length === 0,
scope_reasons: scopeReasons,


counts_toward_current_plan: (cls === STATUS_CLASS.ACTIVE) && scopeReasons.length === 0,
exclusion_reasons: reasons.concat(scopeReasons),

destination_marketplace: str(row.destination_marketplace || row.destinationMarketplace),
contract: CONTRACT
};
}



function partitionHeaders(rows, scope) {
var included = [], excluded = [], byReason = {};
(rows || []).forEach(function (r) {
var c = classifyHeader(r, scope);
if (c.counts_toward_current_plan) { included.push(c); return; }
excluded.push(c);
c.exclusion_reasons.forEach(function (k) { byReason[k] = (byReason[k] || 0) + 1; });
});
return {
contract: CONTRACT,
examined: (rows || []).length,
included: included, excluded: excluded,
included_ids: included.map(function (c) { return c.allocation_draft_id; }),
excluded_ids_with_reason: excluded.map(function (c) {
return { allocation_draft_id: c.allocation_draft_id, reasons: c.exclusion_reasons };
}),
by_reason: byReason
};
}




var TERMINAL_LINE_STATUSES = { cancelled: 1, expired: 1 };
function lineCounts(line) {
var s = lo(line && line.line_status != null ? line.line_status : (line && line.lineStatus));
return !(TERMINAL_LINE_STATUSES[s] === 1);
}



function lineQuantity(line) {
line = line || {};
var p = line.planned_qty != null ? line.planned_qty : line.plannedQty;
if (p !== null && p !== undefined && str(p) !== '') {
var n = Number(p);
if (isFinite(n)) return n;
}
var r = line.recommended_qty != null ? line.recommended_qty : line.recommendedQty;
var m = Number(r);
return (str(r) !== '' && isFinite(m)) ? m : 0;
}



function currentPlanTotal(headers, lines, scope) {
var part = partitionHeaders(headers, scope);
var keep = {};
part.included_ids.forEach(function (id) { if (id) keep[id] = 1; });
var total = 0, counted = [];
(lines || []).forEach(function (l) {
var hid = str(l && (l.allocation_draft_id || l.allocationDraftId));
if (!hid || !keep[hid]) return;
if (!lineCounts(l)) return;
var q = lineQuantity(l);
total += q;
counted.push({ allocation_draft_line_id: str(l.allocation_draft_line_id || l.allocationDraftLineId),
allocation_draft_id: hid, sku: str(l.sku), quantity: q });
});
return { contract: CONTRACT, total: total, header_partition: part, counted_lines: counted };
}

return {
CONTRACT: CONTRACT,
ACTIVE_STATUSES: ACTIVE_STATUSES,
TERMINAL_STATUSES: TERMINAL_STATUSES,
TERMINAL_LINE_STATUSES: TERMINAL_LINE_STATUSES,
STATUS_CLASS: STATUS_CLASS,
EXCLUSION: EXCLUSION,
statusClass: statusClass,
classifyHeader: classifyHeader,
partitionHeaders: partitionHeaders,
lineCounts: lineCounts,
lineQuantity: lineQuantity,
currentPlanTotal: currentPlanTotal,
_version: 'f1-7n-fc-1b-e3-r4-a2-r1-r6-r2-active-route-classification'
};
});
__kmRegister("supply-planning-active-route-classification", module.exports);
})();


(function () {
var require = __kmRequire;
var module = { exports: {} };
var exports = module.exports;















































































(function (root, factory) {
var api = factory();
if (typeof module === 'object' && module.exports) module.exports = api;
if (root) root.KMFSG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

var CONTRACT = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5 - one shared factory pool (warehouse_id||sku, never filtered '
+ 'by company), availability = (fac_current_stock - fac_reserved_stock) - active allocation-draft exposure - '
+ 'active shipping-plan exposure not yet transferred to a shipment. AI is hard-limited and can never override; '
+ 'a human with submit authority may confirm an overage against a fingerprinted snapshot.';













var DRAFT_EXPOSURE_STATUSES = { draft: 1, site_confirmed: 1, partially_submitted: 1 };

var DRAFT_RELEASED_STATUSES = { submitted: 1, cancelled: 1, expired: 1 };


var DRAFT_LINE_RELEASED_STATUSES = { cancelled: 1, expired: 1, superseded: 1, superseded_user_review: 1 };




var PLAN_EXPOSURE_STATUSES = { draft: 1, pending_approval: 1, approved: 1 };
var PLAN_RELEASED_STATUSES = { cancelled: 1, completed: 1 };

var EXPOSURE_STAGE = {
ALLOCATION_DRAFT: 'ALLOCATION_DRAFT',
SHIPPING_PLAN: 'SHIPPING_PLAN',
SHIPMENT_RESERVATION: 'SHIPMENT_RESERVATION'
};

var RELEASE_REASON = {
STATUS_RELEASED: 'STATUS_RELEASED',
LINE_STATUS_RELEASED: 'LINE_STATUS_RELEASED',
STATUS_UNRECOGNISED: 'STATUS_UNRECOGNISED',
TRANSFERRED_TO_SHIPMENT: 'TRANSFERRED_TO_SHIPMENT',
NO_HEADER: 'NO_HEADER',
NO_POOL: 'NO_POOL',
BLANK_QTY: 'BLANK_QTY',
SELF_EXCLUDED: 'SELF_EXCLUDED',
IN_RELEASE_SET: 'IN_RELEASE_SET'
};

var VERDICT = {
PASS: 'PASS',
CLAMPED: 'CLAMPED',
STOP: 'STOP',
OVERAGE_CONFIRMATION_REQUIRED: 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED'
};

var STOP_CODE = {
PRIORITY_UNRESOLVED: 'FACTORY_STOCK_ALLOCATION_PRIORITY_UNRESOLVED',
POOL_UNKNOWN: 'FACTORY_STOCK_POOL_UNKNOWN',
BALANCE_UNREADABLE: 'FACTORY_STOCK_BALANCE_UNREADABLE'
};

var REFUSAL = {
STALE_SNAPSHOT: 'FACTORY_STOCK_OVERAGE_SNAPSHOT_STALE',
MISSING_REASON: 'FACTORY_STOCK_OVERAGE_REASON_REQUIRED',
MISSING_ACTOR: 'FACTORY_STOCK_OVERAGE_ACTOR_REQUIRED',
MISSING_FINGERPRINT: 'FACTORY_STOCK_OVERAGE_FINGERPRINT_REQUIRED',
UNKNOWN_REASON: 'FACTORY_STOCK_OVERAGE_REASON_NOT_RECOGNISED',
NOT_AUTHORISED: 'FACTORY_STOCK_OVERAGE_ACTOR_NOT_AUTHORISED',
NO_OVERAGE: 'FACTORY_STOCK_OVERAGE_NOT_PRESENT'
};




var OVERRIDE_REASONS = {
cross_site_reallocation: 'Cross-site reallocation',
incoming_production_confirmed: 'Incoming production confirmed',
physical_stock_pending_system_update: 'Physical stock pending system update',
other: 'Other'
};

function str(v) { return String(v == null ? '' : v).trim(); }
function lo(v) { return str(v).toLowerCase(); }




function qty(v) {
if (v === null || v === undefined || str(v) === '') return null;
var n = Number(v);
return isFinite(n) ? n : null;
}
function int(v) { var n = qty(v); return n === null ? null : Math.round(n); }



function fnv1a(s) {
var h = 0x811c9dc5; s = String(s);
for (var i = 0; i < s.length; i++) {
h ^= s.charCodeAt(i);
h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
}
return ('00000000' + h.toString(16)).slice(-8);
}









function poolKey(warehouseId, sku, inventoryPoolId) {
var p = str(inventoryPoolId);
var s = str(sku);
if (!s) return '';
if (p) return 'POOL:' + p + '||' + s;
var w = str(warehouseId);
if (!w) return '';
return 'WH:' + w + '||' + s;
}

function poolKeyOf(row, opts) {
row = row || {}; opts = opts || {};
var wh = row.warehouse_id != null ? row.warehouse_id : row.warehouseId;
if (str(wh) === '' && opts.warehouseFallback) wh = opts.warehouseFallback;
return poolKey(wh, row.sku != null ? row.sku : row.SKU, row.inventory_pool_id != null ? row.inventory_pool_id : row.inventoryPoolId);
}













function normalizeBalances(rows, opts) {
opts = opts || {};
var out = { byPool: {}, unreadable: [], examined: 0, counted: 0, skipped_non_factory: 0, skipped_no_pool: 0 };
var eligible = opts.eligibleWarehouseIds || null;
(rows || []).forEach(function (r) {
out.examined++;
var wh = str(r && (r.warehouse_id != null ? r.warehouse_id : r.warehouseId));
var sku = str(r && r.sku);
if (eligible && wh && !eligible[wh]) { out.skipped_non_factory++; return; }
var key = poolKey(wh, sku, r && r.inventory_pool_id);
if (!key) { out.skipped_no_pool++; return; }
var cur = int(r.fac_current_stock != null ? r.fac_current_stock : r.current_stock);
var res = int(r.fac_reserved_stock != null ? r.fac_reserved_stock : r.reserved_stock);
if (cur === null) { out.unreadable.push({ pool_key: key, field: 'fac_current_stock', warehouse_id: wh, sku: sku }); return; }
if (res === null) res = 0;
var e = out.byPool[key] = out.byPool[key] || { pool_key: key, warehouse_id: wh, sku: sku, current: 0, reserved: 0, available: 0, row_count: 0 };
e.current += cur; e.reserved += res; e.available = e.current - e.reserved; e.row_count++;
out.counted++;
});
return out;
}















function draftExposure(headers, lines, opts) {
opts = opts || {};
var releaseSet = opts.releaseSet || {};
var isAiRow = typeof opts.isAiRow === 'function' ? opts.isAiRow : null;
var out = { stage: EXPOSURE_STAGE.ALLOCATION_DRAFT, byPool: {}, counted_lines: 0, header_count: 0,
released: { STATUS_RELEASED: 0, STATUS_UNRECOGNISED: 0, IN_RELEASE_SET: 0, LINE_STATUS_RELEASED: 0,
NO_HEADER: 0, NO_POOL: 0, BLANK_QTY: 0, SELF_EXCLUDED: 0 },
release_set_ids: Object.keys(releaseSet).sort(),


release_refused: [],
rows: [] };
var keep = {};
(headers || []).forEach(function (h) {
var id = str(h && (h.allocation_draft_id != null ? h.allocation_draft_id : h.allocationDraftId));
var st = lo(h && h.status);
if (DRAFT_RELEASED_STATUSES[st]) { out.released.STATUS_RELEASED++; return; }
if (!DRAFT_EXPOSURE_STATUSES[st]) { out.released.STATUS_UNRECOGNISED++; return; }
if (id && releaseSet[id]) {



var relAi = isAiRow ? isAiRow(h) : null;
if (relAi === true) { out.released.IN_RELEASE_SET++; return; }
out.release_refused.push({ allocation_draft_id: id,
reason: relAi === false ? 'MANUAL_SOURCE_NEVER_RELEASED' : 'PROVENANCE_UNKNOWN_NEVER_RELEASED' });
}
keep[id] = h; out.header_count++;
});
(lines || []).forEach(function (l) {
var hid = str(l && (l.allocation_draft_id != null ? l.allocation_draft_id : l.allocationDraftId));
var h = keep[hid];
if (!h) { out.released.NO_HEADER++; return; }
if (DRAFT_LINE_RELEASED_STATUSES[lo(l && (l.line_status != null ? l.line_status : l.lineStatus))]) { out.released.LINE_STATUS_RELEASED++; return; }
var wh = str(l.source_warehouse_id != null ? l.source_warehouse_id : l.sourceWarehouseId)
|| str(h.recommended_source_warehouse_id != null ? h.recommended_source_warehouse_id : h.recommendedSourceWarehouseId);
var key = poolKey(wh, l.sku, l.inventory_pool_id);
if (!key) { out.released.NO_POOL++; return; }


var q = qty(l.planned_qty != null ? l.planned_qty : l.plannedQty);
if (q === null) q = qty(l.recommended_qty != null ? l.recommended_qty : l.recommendedQty);
if (q === null) { out.released.BLANK_QTY++; return; }
var ai = isAiRow ? !!isAiRow(h) : null;
var e = out.byPool[key] = out.byPool[key] || { pool_key: key, qty: 0, manual_qty: 0, ai_qty: 0, unknown_provenance_qty: 0, line_count: 0 };
e.qty += q; e.line_count++;
if (ai === true) e.ai_qty += q; else if (ai === false) e.manual_qty += q; else e.unknown_provenance_qty += q;
out.counted_lines++;
if (out.rows.length < 200) {
out.rows.push({ pool_key: key, allocation_draft_id: hid,
allocation_draft_line_id: str(l.allocation_draft_line_id || l.allocationDraftLineId),
company: str(h.company), country: str(h.country), marketplace: str(h.marketplace),
sku: str(l.sku), warehouse_id: str(wh), status: str(h.status), line_status: str(l.line_status),
quantity: q, ai_generated: ai });
}
});
return out;
}

















function planExposure(plans, planLines, opts) {
opts = opts || {};
var selfId = str(opts.selfPlanId);
var out = { stage: EXPOSURE_STAGE.SHIPPING_PLAN, byPool: {}, selfByPool: {}, counted_lines: 0, header_count: 0,
released: { STATUS_RELEASED: 0, STATUS_UNRECOGNISED: 0, TRANSFERRED_TO_SHIPMENT: 0, NO_HEADER: 0,
NO_POOL: 0, BLANK_QTY: 0, SELF_EXCLUDED: 0 },
self_plan_id: selfId || null, rows: [] };
var keep = {}, selfKeep = {};
(plans || []).forEach(function (p) {
var id = str(p && (p.shipping_plan_id != null ? p.shipping_plan_id : p.shippingPlanId));
var st = lo(p && p.status);
var transferred = str(p && (p.transferred_shipment_id != null ? p.transferred_shipment_id : p.transferredShipmentId))
|| str(p && (p.transferred_to_shipment_at != null ? p.transferred_to_shipment_at : p.transferredToShipmentAt));
if (PLAN_RELEASED_STATUSES[st]) { out.released.STATUS_RELEASED++; return; }
if (!PLAN_EXPOSURE_STATUSES[st]) { out.released.STATUS_UNRECOGNISED++; return; }
if (transferred) { out.released.TRANSFERRED_TO_SHIPMENT++; return; }
if (selfId && id === selfId) { selfKeep[id] = p; out.released.SELF_EXCLUDED++; return; }
keep[id] = p; out.header_count++;
});
(planLines || []).forEach(function (l) {
var pid = str(l && (l.shipping_plan_id != null ? l.shipping_plan_id : l.shippingPlanId));
var mine = selfKeep[pid] ? selfKeep[pid] : keep[pid];
if (!mine) { out.released.NO_HEADER++; return; }
var key = poolKey(str(mine.source_warehouse_id != null ? mine.source_warehouse_id : mine.sourceWarehouseId), l.sku, l.inventory_pool_id);
if (!key) { out.released.NO_POOL++; return; }


var q = qty(l.approved_qty != null && str(l.approved_qty) !== '' ? l.approved_qty : l.requested_qty);
if (q === null) { out.released.BLANK_QTY++; return; }
var bucket = selfKeep[pid] ? out.selfByPool : out.byPool;
var e = bucket[key] = bucket[key] || { pool_key: key, qty: 0, line_count: 0 };
e.qty += q; e.line_count++;
if (!selfKeep[pid]) out.counted_lines++;
if (out.rows.length < 200) {
out.rows.push({ pool_key: key, shipping_plan_id: pid, is_self: !!selfKeep[pid],
company: str(mine.company), country: str(mine.country), marketplace: str(mine.marketplace),
sku: str(l.sku), warehouse_id: str(mine.source_warehouse_id), status: str(mine.status), quantity: q });
}
});
return out;
}




function availableToAllocate(input) {
input = input || {};
var bal = input.balances || { byPool: {}, unreadable: [] };
var dEx = input.draftExposure || { byPool: {} };
var pEx = input.planExposure || { byPool: {}, selfByPool: {} };
var keys = {}, out = { contract: CONTRACT, byPool: {}, pool_keys: [], unreadable: (bal.unreadable || []).slice() };
[bal.byPool, dEx.byPool, pEx.byPool, pEx.selfByPool].forEach(function (m) {
for (var k in (m || {})) if (Object.prototype.hasOwnProperty.call(m || {}, k)) keys[k] = 1;
});
out.pool_keys = Object.keys(keys).sort();
out.pool_keys.forEach(function (k) {
var b = bal.byPool[k] || null;
var d = dEx.byPool[k] || null;
var p = pEx.byPool[k] || null;
var s = (pEx.selfByPool || {})[k] || null;
var current = b ? b.current : 0;
var reserved = b ? b.reserved : 0;
var physicalAvailable = current - reserved;
var draftQty = d ? d.qty : 0;
var planQty = p ? p.qty : 0;
var otherExposure = draftQty + planQty;
out.byPool[k] = {
pool_key: k,
warehouse_id: b ? b.warehouse_id : (d ? '' : ''),
sku: b ? b.sku : '',
pool_row_found: !!b,
factory_current_stock: current,
factory_reserved_stock: reserved,
factory_available_stock: physicalAvailable,
active_allocation_draft_qty: draftQty,
active_allocation_draft_manual_qty: d ? d.manual_qty : 0,
active_allocation_draft_ai_qty: d ? d.ai_qty : 0,
active_shipping_plan_qty: planQty,
current_plan_qty: s ? s.qty : 0,
already_allocated_qty: otherExposure,



available_to_allocate: physicalAvailable - otherExposure,
projected_total_qty: otherExposure + (s ? s.qty : 0),
exposure_stages: [EXPOSURE_STAGE.ALLOCATION_DRAFT, EXPOSURE_STAGE.SHIPPING_PLAN, EXPOSURE_STAGE.SHIPMENT_RESERVATION]
};
});
out.fingerprint = snapshotFingerprint(out);
return out;
}










function snapshotFingerprint(avail) {
var parts = [];
((avail && avail.pool_keys) || []).forEach(function (k) {
var e = avail.byPool[k];
parts.push([k, e.factory_current_stock, e.factory_reserved_stock, e.active_allocation_draft_qty,
e.active_shipping_plan_qty, e.current_plan_qty].join(':'));
});
return fnv1a(parts.join('|'));
}




















function evaluateAiGuard(input) {
input = input || {};
var avail = input.available || { byPool: {}, pool_keys: [] };
var claims = input.claims || [];
var priorityByReceiver = input.priorityByReceiver || {};
var out = { contract: CONTRACT, mechanism: 'AI_HARD_GUARD', verdict: VERDICT.PASS,
overridable: false,
override_note: 'An AI generation has no overage channel. A shortfall it cannot settle with the frozen '
+ 'allocation priority is refused, and only a human with submit authority may accept an overage.',
byPool: {}, claims: [], stops: [], clamped_total: 0, requested_total: 0, granted_total: 0,
fingerprint: avail.fingerprint || null };

var byPoolClaims = {};
claims.forEach(function (c, i) {
var key = str(c && c.pool_key) || poolKey(c && c.warehouse_id, c && c.sku, c && c.inventory_pool_id);
var q = qty(c && c.quantity);
var rec = { index: i, pool_key: key, receiver_key: str(c && c.receiver_key),
company: str(c && c.company), country: str(c && c.country), marketplace: str(c && c.marketplace),
sku: str(c && c.sku), warehouse_id: str(c && c.warehouse_id),
requested_qty: q, granted_qty: null, clamped_by: 0, verdict: null, reason: null };
out.claims.push(rec);
if (!key) { rec.verdict = VERDICT.STOP; rec.reason = STOP_CODE.POOL_UNKNOWN;
out.stops.push({ code: STOP_CODE.POOL_UNKNOWN, claim_index: i, sku: rec.sku, warehouse_id: rec.warehouse_id }); return; }


if (q === null) { rec.verdict = VERDICT.STOP; rec.reason = STOP_CODE.BALANCE_UNREADABLE;
out.stops.push({ code: STOP_CODE.BALANCE_UNREADABLE, claim_index: i, pool_key: key, field: 'quantity' }); return; }
if (q <= 0) { rec.verdict = VERDICT.PASS; rec.granted_qty = q; return; }
(byPoolClaims[key] = byPoolClaims[key] || []).push(rec);
});

Object.keys(byPoolClaims).sort().forEach(function (key) {
var rows = byPoolClaims[key];
var a = avail.byPool[key] || null;
var headroom = a ? a.available_to_allocate : null;
var requested = rows.reduce(function (s, r) { return s + r.requested_qty; }, 0);
var pool = out.byPool[key] = {
pool_key: key, claimant_count: rows.length, requested_qty: requested,
pool_row_found: !!a,
factory_available_stock: a ? a.factory_available_stock : null,
already_allocated_qty: a ? a.already_allocated_qty : null,
available_to_allocate: headroom,
granted_qty: 0, clamped_qty: 0, verdict: VERDICT.PASS, stop_code: null
};


if (!a || !a.pool_row_found) {
pool.verdict = VERDICT.STOP; pool.stop_code = STOP_CODE.POOL_UNKNOWN;
rows.forEach(function (r) { r.verdict = VERDICT.STOP; r.reason = STOP_CODE.POOL_UNKNOWN; });
out.stops.push({ code: STOP_CODE.POOL_UNKNOWN, pool_key: key, requested_qty: requested });
return;
}
if (requested <= headroom) {
rows.forEach(function (r) { r.verdict = VERDICT.PASS; r.granted_qty = r.requested_qty; });
pool.granted_qty = requested;
return;
}
var budget = headroom > 0 ? headroom : 0;
if (rows.length === 1) {
var r0 = rows[0];
r0.granted_qty = budget; r0.clamped_by = r0.requested_qty - budget;
r0.verdict = budget > 0 ? VERDICT.CLAMPED : VERDICT.CLAMPED;
pool.granted_qty = budget; pool.clamped_qty = requested - budget; pool.verdict = VERDICT.CLAMPED;
return;
}

var missing = rows.filter(function (r) { return qty(priorityByReceiver[r.receiver_key]) === null; });
if (missing.length) {
pool.verdict = VERDICT.STOP; pool.stop_code = STOP_CODE.PRIORITY_UNRESOLVED;
rows.forEach(function (r) { r.verdict = VERDICT.STOP; r.reason = STOP_CODE.PRIORITY_UNRESOLVED; });
out.stops.push({ code: STOP_CODE.PRIORITY_UNRESOLVED, pool_key: key, requested_qty: requested,
available_to_allocate: headroom, claimant_count: rows.length,
receivers_without_priority: missing.map(function (r) { return r.receiver_key; }).sort(),
detail: 'the frozen allocation priority (marketplaces.allocation_priority) does not cover every '
+ 'competing receiver on this pool, so no order exists that this guard is permitted to apply' });
return;
}

var ordered = rows.slice().sort(function (x, y) {
var px = Number(priorityByReceiver[x.receiver_key]), py = Number(priorityByReceiver[y.receiver_key]);
if (px !== py) return py - px;
return x.receiver_key < y.receiver_key ? -1 : (x.receiver_key > y.receiver_key ? 1 : 0);
});
var left = budget, stopped = false;
for (var i = 0; i < ordered.length && !stopped; i++) {
var grp = [ordered[i]];
var pi = Number(priorityByReceiver[ordered[i].receiver_key]);
while (i + 1 < ordered.length && Number(priorityByReceiver[ordered[i + 1].receiver_key]) === pi) { grp.push(ordered[++i]); }
var need = grp.reduce(function (s, r) { return s + r.requested_qty; }, 0);
if (need <= left) { grp.forEach(function (r) { r.verdict = VERDICT.PASS; r.granted_qty = r.requested_qty; }); left -= need; continue; }
if (grp.length > 1) {


pool.verdict = VERDICT.STOP; pool.stop_code = STOP_CODE.PRIORITY_UNRESOLVED;
rows.forEach(function (r) { r.verdict = VERDICT.STOP; r.reason = STOP_CODE.PRIORITY_UNRESOLVED; r.granted_qty = null; r.clamped_by = 0; });
out.stops.push({ code: STOP_CODE.PRIORITY_UNRESOLVED, pool_key: key, requested_qty: requested,
available_to_allocate: headroom, claimant_count: rows.length,
tied_receivers: grp.map(function (r) { return r.receiver_key; }).sort(), tied_priority: pi,
detail: 'two or more competing receivers share an allocation_priority and the remaining headroom '
+ 'cannot serve all of them; splitting a tie is an allocation decision this guard may not make' });
stopped = true; break;
}
grp[0].granted_qty = left; grp[0].clamped_by = grp[0].requested_qty - left;
grp[0].verdict = VERDICT.CLAMPED; left = 0;
}
if (stopped) return;
for (var j = 0; j < ordered.length; j++) {
if (ordered[j].verdict === null) { ordered[j].verdict = VERDICT.CLAMPED; ordered[j].granted_qty = 0; ordered[j].clamped_by = ordered[j].requested_qty; }
}
pool.granted_qty = ordered.reduce(function (s, r) { return s + (r.granted_qty || 0); }, 0);
pool.clamped_qty = requested - pool.granted_qty;
pool.verdict = VERDICT.CLAMPED;
});

out.claims.forEach(function (r) {
if (r.requested_qty !== null) out.requested_total += r.requested_qty;
if (r.granted_qty !== null) out.granted_total += r.granted_qty;
out.clamped_total += r.clamped_by || 0;
});
if (out.stops.length) out.verdict = VERDICT.STOP;
else if (out.clamped_total > 0) out.verdict = VERDICT.CLAMPED;
else out.verdict = VERDICT.PASS;
return out;
}









function evaluateOverage(input) {
input = input || {};
var avail = input.available || { byPool: {}, pool_keys: [] };
var out = { contract: CONTRACT, mechanism: 'MANUAL_OVERAGE_CONFIRMATION',
shipping_plan_id: str(input.shippingPlanId) || null,
ok: true, verdict: 'OK', code: null, overridable: true,
inventory_snapshot_fingerprint: avail.fingerprint || null,
pools: [], overage_pools: [], total_overage_qty: 0,
reason_options: overrideReasonOptions(),
affected: [] };
(avail.pool_keys || []).forEach(function (k) {
var e = avail.byPool[k];
var currentPlanQty = e.current_plan_qty || 0;
if (!currentPlanQty) return;
var projected = e.already_allocated_qty + currentPlanQty;
var overage = projected - e.factory_available_stock;
var row = {
pool_key: k, inventory_pool_id: null, source_warehouse_id: e.warehouse_id, sku: e.sku,
factory_current_stock: e.factory_current_stock,
factory_reserved_stock: e.factory_reserved_stock,
factory_available_stock: e.factory_available_stock,
already_allocated_qty: e.already_allocated_qty,
current_plan_qty: currentPlanQty,
projected_total_qty: projected,
overage_qty: overage > 0 ? overage : 0,
pool_row_found: e.pool_row_found
};
out.pools.push(row);
if (overage > 0) { out.overage_pools.push(row); out.total_overage_qty += overage; }
});
if (out.overage_pools.length) {
out.ok = false; out.verdict = VERDICT.OVERAGE_CONFIRMATION_REQUIRED;
out.code = VERDICT.OVERAGE_CONFIRMATION_REQUIRED;
out.confirmation_token = confirmationToken(out.shipping_plan_id, avail.fingerprint);
out.affected = affectedDestinations(input.exposureRows || [], out.overage_pools);
out.title = 'Planned Quantity Exceeds Available Factory Stock';
out.message = 'This plan exceeds the currently available factory stock. Please confirm the total physical '
+ 'inventory and review allocations to other companies and marketplaces. Continue only if the additional '
+ 'quantity can be covered through inventory reallocation, incoming production, or another confirmed '
+ 'arrangement.';
out.buttons = { cancel: 'Cancel', confirm: 'Confirm Overage' };
out.zero_write = true;
}
return out;
}

function overrideReasonOptions() {
return Object.keys(OVERRIDE_REASONS).map(function (k) { return { value: k, label: OVERRIDE_REASONS[k] }; });
}



function confirmationToken(planId, fingerprint) {
return 'FSOC-' + fnv1a(str(planId) + '|' + str(fingerprint)).toUpperCase();
}



function affectedDestinations(rows, overagePools) {
var want = {};
(overagePools || []).forEach(function (p) { want[p.pool_key] = 1; });
var byKey = {};
(rows || []).forEach(function (r) {
if (!want[r.pool_key]) return;
if (r.is_self) return;
var k = [r.pool_key, str(r.company), str(r.country), str(r.marketplace), str(r.stage)].join('|');
var e = byKey[k] = byKey[k] || { pool_key: r.pool_key, company: str(r.company), country: str(r.country),
marketplace: str(r.marketplace), stage: str(r.stage), sku: str(r.sku), quantity: 0, references: [] };
e.quantity += Number(r.quantity) || 0;
var ref = str(r.shipping_plan_id) || str(r.allocation_draft_id);
if (ref && e.references.indexOf(ref) === -1 && e.references.length < 20) e.references.push(ref);
});
return Object.keys(byKey).sort().map(function (k) { return byKey[k]; });
}














function confirmOverage(input) {
input = input || {};
var avail = input.available || {};
var reason = lo(input.reason);
var actor = str(input.actor);
var expected = str(input.expectedFingerprint);
var current = str(avail.fingerprint);
var evaluated = evaluateOverage({ available: avail, shippingPlanId: input.shippingPlanId,
exposureRows: input.exposureRows || [] });
var out = { contract: CONTRACT, mechanism: 'MANUAL_OVERAGE_CONFIRMATION', accepted: false, code: null,
shipping_plan_id: str(input.shippingPlanId) || null, zero_write: true,
inventory_snapshot_fingerprint: current || null, evaluation: evaluated };
if (!expected) { out.code = REFUSAL.MISSING_FINGERPRINT; return out; }
if (!actor) { out.code = REFUSAL.MISSING_ACTOR; return out; }
if (!reason) { out.code = REFUSAL.MISSING_REASON; return out; }
if (!OVERRIDE_REASONS[reason]) { out.code = REFUSAL.UNKNOWN_REASON;
out.reason_options = overrideReasonOptions(); return out; }



if (input.actorMaySubmit === false) { out.code = REFUSAL.NOT_AUTHORISED; return out; }
if (expected !== current) {
out.code = REFUSAL.STALE_SNAPSHOT;
out.stale = { expected_fingerprint: expected, current_fingerprint: current || null };
out.latest = evaluated;
return out;
}
if (evaluated.ok) { out.code = REFUSAL.NO_OVERAGE; return out; }
var tok = str(input.confirmationToken);
if (tok && tok !== evaluated.confirmation_token) {
out.code = REFUSAL.STALE_SNAPSHOT;
out.stale = { expected_token: evaluated.confirmation_token, presented_token: tok };
out.latest = evaluated;
return out;
}
out.accepted = true; out.zero_write = false; out.code = 'FACTORY_STOCK_OVERAGE_CONFIRMED';


out.audit = {
inventory_override: true,
override_reason: reason,
override_reason_label: OVERRIDE_REASONS[reason],
override_note: str(input.note) || null,
override_by: actor,
override_at: str(input.at) || null,
inventory_snapshot_fingerprint: current || null,
pools: evaluated.overage_pools.map(function (p) {
return { inventory_pool_id: p.inventory_pool_id, source_warehouse_id: p.source_warehouse_id, sku: p.sku,
available_qty_at_check: p.factory_available_stock, already_allocated_qty: p.already_allocated_qty,
requested_plan_qty: p.current_plan_qty, projected_total_qty: p.projected_total_qty,
overage_qty: p.overage_qty };
}),
total_overage_qty: evaluated.total_overage_qty
};
return out;
}








function evaluateApprovalRecheck(input) {
input = input || {};
var avail = input.available || {};
var confirmed = str(input.confirmedFingerprint);
var ev = evaluateOverage({ available: avail, shippingPlanId: input.shippingPlanId,
exposureRows: input.exposureRows || [] });
var out = { contract: CONTRACT, mechanism: 'APPROVAL_RECHECK', shipping_plan_id: ev.shipping_plan_id,
snapshot_unchanged: !!confirmed && confirmed === str(avail.fingerprint),
inventory_snapshot_fingerprint: str(avail.fingerprint) || null,
confirmed_fingerprint: confirmed || null,
previously_confirmed_overage_qty: qty(input.confirmedOverageQty),
current_overage_qty: ev.total_overage_qty, evaluation: ev,
proceed: true, reconfirmation_required: false, code: null, silent: false };
if (ev.ok) { out.proceed = true; out.silent = true; return out; }
if (out.snapshot_unchanged) { out.proceed = true; out.silent = true; return out; }
var prior = out.previously_confirmed_overage_qty;


if (prior !== null && ev.total_overage_qty <= prior) { out.proceed = true; out.silent = true;
out.code = 'COVERED_BY_EARLIER_CONFIRMATION'; return out; }
out.proceed = false; out.reconfirmation_required = true;
out.code = VERDICT.OVERAGE_CONFIRMATION_REQUIRED;
return out;
}









function evaluateShipmentDraftAdmission(input) {
input = input || {};
var planStatus = lo(input.planStatus);
var out = { contract: CONTRACT, mechanism: 'SHIPMENT_DRAFT_ADMISSION', admit: false, code: null,
reallocates: false, overridable: false,
note: 'Shipment Draft receives an immutable approved snapshot. It never re-allocates, never re-prices the '
+ 'pool and has no override channel of its own.' };
if (planStatus !== 'approved') { out.code = 'SHIPMENT_DRAFT_REQUIRES_APPROVED_PLAN'; return out; }
if (str(input.transferredShipmentId)) { out.code = 'SHIPMENT_ALREADY_EXISTS'; return out; }
var snap = qty(input.approvedSnapshotQty), req = qty(input.planRequestedQty);
if (snap === null || req === null) { out.code = 'UPSTREAM_SNAPSHOT_INVALID'; return out; }
if (snap !== req) { out.code = 'UPSTREAM_SNAPSHOT_INVALID';
out.detail = { approved_snapshot_qty: snap, plan_requested_qty: req }; return out; }
out.admit = true; out.code = 'ADMITTED';
return out;
}

return {
CONTRACT: CONTRACT,
DRAFT_EXPOSURE_STATUSES: DRAFT_EXPOSURE_STATUSES,
DRAFT_RELEASED_STATUSES: DRAFT_RELEASED_STATUSES,
DRAFT_LINE_RELEASED_STATUSES: DRAFT_LINE_RELEASED_STATUSES,
PLAN_EXPOSURE_STATUSES: PLAN_EXPOSURE_STATUSES,
PLAN_RELEASED_STATUSES: PLAN_RELEASED_STATUSES,
EXPOSURE_STAGE: EXPOSURE_STAGE,
RELEASE_REASON: RELEASE_REASON,
VERDICT: VERDICT,
STOP_CODE: STOP_CODE,
REFUSAL: REFUSAL,
OVERRIDE_REASONS: OVERRIDE_REASONS,
fnv1a: fnv1a,
poolKey: poolKey,
poolKeyOf: poolKeyOf,
normalizeBalances: normalizeBalances,
draftExposure: draftExposure,
planExposure: planExposure,
availableToAllocate: availableToAllocate,
snapshotFingerprint: snapshotFingerprint,
evaluateAiGuard: evaluateAiGuard,
evaluateOverage: evaluateOverage,
overrideReasonOptions: overrideReasonOptions,
confirmationToken: confirmationToken,
affectedDestinations: affectedDestinations,
confirmOverage: confirmOverage,
evaluateApprovalRecheck: evaluateApprovalRecheck,
evaluateShipmentDraftAdmission: evaluateShipmentDraftAdmission,
_version: 'f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r5-factory-stock-guard'
};
});
__kmRegister("supply-planning-factory-stock-guard", module.exports);
})();


var KMSC = __kmModules["supply-planning-site-calendar"];
var KMFCN = __kmModules["supply-planning-forecast-normalization"];
var KMSNF = __kmModules["supply-planning-snapshot-freshness"];
var KMCID = __kmModules["supply-planning-country-identity"];
var KMCALC = __kmModules["supply-planning-calculations"];
var KMQI = __kmModules["supply-planning-qualified-incoming"];
var KMLEDGER = __kmModules["supply-planning-ledgers"];
var KMALLOC = __kmModules["supply-planning-allocations"];
var KMAR = __kmModules["supply-planning-allocation-runtime"];
var KMFC = __kmModules["supply-planning-factory-cohort"];
var KMLINE = __kmModules["supply-planning-line-runtime"];
var KMINC = __kmModules["supply-planning-incoming-adapters"];
var KMEXT = __kmModules["supply-planning-external-incoming-adapters"];
var KMCAND = __kmModules["supply-planning-supply-candidates"];
var KMSLS = __kmModules["supply-planning-shipment-line-source"];
var KMPC = __kmModules["supply-planning-persistence"];
var KMPR = __kmModules["supply-planning-persistence-repository"];
var KMPL = __kmModules["supply-planning-persistence-locking"];
var KMPB = __kmModules["supply-planning-plan-builder"];
var KMPPB = __kmModules["supply-planning-persistence-plan-builder"];
var KMORCH = __kmModules["supply-planning-recommendation-orchestrator"];
var KMUE = __kmModules["supply-planning-user-edit"];
var KMSF = __kmModules["supply-planning-source-facts"];
var KMBRIDGE = __kmModules["supply-planning-plan-bridge"];
var KMWSA = __kmModules["supply-planning-weekly-source-allocation"];
var KMWIA = __kmModules["supply-planning-weekly-input-assembler"];
var KMWRD = __kmModules["supply-planning-weekly-recommendation-draft"];
var KMWRT = __kmModules["supply-planning-weekly-recommendation-runtime"];
var KMWRB = __kmModules["supply-planning-weekly-recommendation-batch"];
var KMWHA = __kmModules["supply-planning-weekly-harvest-adapter"];
var KMRA = __kmModules["supply-planning-route-authority"];
var KMMR = __kmModules["supply-planning-method-recommendation"];
var KMWRR = __kmModules["supply-planning-weekly-route-derivation"];
var KMSR = __kmModules["supply-planning-source-reader"];
var KMSI = __kmModules["supply-planning-recommendation-source-integration"];
var KMSRP = __kmModules["supply-planning-source-reader-production"];
var KMSP = __kmModules["supply-planning-source-projection"];
var KMAF = __kmModules["supply-planning-allocation-facts"];
var KMPCX = __kmModules["supply-planning-planning-context"];
var KMDA = __kmModules["supply-planning-demand-allocation"];
var KMMSA = __kmModules["supply-planning-marketplace-supply-allocation"];
var KMPA = __kmModules["supply-planning-production-assembly"];
var KMDR = __kmModules["supply-planning-destination-runtime"];
var KMPD = __kmModules["supply-planning-planning-demand"];
var KMTPP = __kmModules["supply-planning-time-phased-projection"];
var KMHP = __kmModules["supply-planning-horizon-projection"];
var KMDWA = __kmModules["supply-planning-daily-warehouse-allocation"];
var KMPS = __kmModules["supply-planning-production-source"];
var KMSAFE = __kmModules["supply-planning-production-safety"];
var KMPW = __kmModules["supply-planning-production-writer"];
var KMVD = __kmModules["supply-planning-verification-diagnostics"];
var KMREC = __kmModules["supply-recommendation"];
var KMREX = __kmModules["supply-execution-handoff"];
var KMOOP = __kmModules["supply-planning-ongoing-order-projection"];
var KMOTA = __kmModules["supply-planning-ongoing-order-tpp-adapter"];
var KMOOR = __kmModules["supply-planning-ongoing-order-runtime"];
var KMFSR = __kmModules["supply-planning-surplus-reallocation"];
var KMRDV2 = __kmModules["supply-planning-request-draft-v2"];
var KMRDV2P = __kmModules["supply-planning-request-draft-v2-persistence"];
var KMFSA = __kmModules["supply-planning-factory-site-allocation"];
var KMARC = __kmModules["supply-planning-active-route-classification"];
var KMFSG = __kmModules["supply-planning-factory-stock-guard"];






var KM_BUNDLE_CONTENT_HASH_ = '2136cd321d69e1fe44df2685815c67c60ccbd77cf169d3426720d4f166cfec72';


var KM_BUNDLE_INFO = {"bundleHash":"2136cd321d69e1fe44df2685815c67c60ccbd77cf169d3426720d4f166cfec72","modules":[{"module":"supply-planning-site-calendar","sha256":"667817d3df83fa335d30ee76f2f49691a17aec077c7c4d571052424a7e050fd2"},{"module":"supply-planning-country-identity","sha256":"4b3d8fde7b21290bb1bc6c749eb78f0e8991bfbc0b1b9c8367b438934d2273ff"},{"module":"supply-planning-calculations","sha256":"fed5ea843b3d2893bbfcbeed0e05afcc3e2291463809ebeef56322ec73df1fa2"},{"module":"supply-planning-qualified-incoming","sha256":"dcf812ba1244619bf51342151842cabb063e0960aeb4526646decfbffdf06db5"},{"module":"supply-planning-ledgers","sha256":"3841ab3fe9d5922dad544677e87dd9f2b8507da50c385abb51ae5a071e89a042"},{"module":"supply-planning-allocations","sha256":"79194d50c2dbfb1ea4ebc0f46def5229a85012569956b66f7dffa1e01b8fd911"},{"module":"supply-planning-allocation-runtime","sha256":"7127d4cd3f49ecafbfc180f5c76e9ed09f05a469abf19b25e4bb6ec2a7b6f8a5"},{"module":"supply-planning-factory-cohort","sha256":"2adccb3762d9c0c9350743cd8c5188b92ffa7e5046126b55158f56a85c6ac498"},{"module":"supply-planning-line-runtime","sha256":"0e0b9c3f60d590f7351d541b8c0de9ae6d8d344c882864c7c2fe8dbbca5301c8"},{"module":"supply-planning-incoming-adapters","sha256":"af9f96e387dc75fa68db4fa9734d6e8748c990315c3547f0c4b801b157918f18"},{"module":"supply-planning-external-incoming-adapters","sha256":"ca1cb707ee5ad5ad4437bbc6a3c4056796c340ec278ba8a55803f56aa25b0d93"},{"module":"supply-planning-supply-candidates","sha256":"6f9892b0b210395ddb77589da12685781932efa43e1d7757d4f16960b6c9a270"},{"module":"supply-planning-shipment-line-source","sha256":"5078d152e6169718dc67dd2c42d2c84542d65aa0854a32c28922caa5e86f2a12"},{"module":"supply-planning-persistence","sha256":"b9234bf33ae2de963992156118ee5fdb6c7e8e9063e92c2f9a818b12705612a0"},{"module":"supply-planning-persistence-repository","sha256":"0dd4d80079696e6ce8a8a8b00619907ae1449a03a7a6909cfff53e181badd470"},{"module":"supply-planning-persistence-locking","sha256":"ab2a383e64a5f113c26281cb8b56c82c69dacd969ad25dcc41fbc4c5fb00b12b"},{"module":"supply-planning-plan-builder","sha256":"f243fb00f60a479cc2030da343bfd08b952ebaab79d8b8802ac2d5a0a3d4e203"},{"module":"supply-planning-persistence-plan-builder","sha256":"c4167ea6ba7fb1487674e8f2920b5c28755d274cc8fcfca487991c0d94119304"},{"module":"supply-planning-recommendation-orchestrator","sha256":"23f1cf9ab336f6fb5a7bdb6e81010adb1cb2b97d78b68be31a9692132471b192"},{"module":"supply-planning-user-edit","sha256":"365702d00a5c1ac9544a6086504b2e4961de1129fe3619eace8054ef34172693"},{"module":"supply-planning-source-facts","sha256":"a31843202e6c903027dd34756c299237fcad868572d19bfe469bcbdfedf963bb"},{"module":"supply-planning-plan-bridge","sha256":"c100c56dfc0c652ee440073300085b53699e22e1c7cbe7ddea238715c6911a18"},{"module":"supply-planning-weekly-source-allocation","sha256":"9be80e232758993406dd649fb8d737272cfb8a42822477d47089e9b62ab5bb45"},{"module":"supply-planning-weekly-input-assembler","sha256":"7231378631a778d56e0244e2a59b030eb98393339dc1e7a399c171be9229b9f9"},{"module":"supply-planning-weekly-recommendation-draft","sha256":"ce491ca4939e2a323d051471c231958a03315a7ee8beb3cd6a91d73f5f1cac32"},{"module":"supply-planning-weekly-recommendation-runtime","sha256":"0f944bc6877b215fbe8ab5ca1e714834c1868a25a1ec5654ba30c40b63ca63b3"},{"module":"supply-planning-weekly-recommendation-batch","sha256":"8b62fb304778609b72dc63ef777babaae5254543dee81c21884cf59c50348c8b"},{"module":"supply-planning-weekly-harvest-adapter","sha256":"20762b074c281fffbd069454385b830dcbebc4e3d21856dbbd290db150399c8b"},{"module":"supply-planning-route-authority","sha256":"aed95c90bd219eb655b30ec7af0d2e534ea734882601ae5284c55473326dd10c"},{"module":"supply-planning-method-recommendation","sha256":"690ad53a6a9e6d5cfb726647a571b589f209230e4a50a6a185b67a4f619d3976"},{"module":"supply-planning-weekly-route-derivation","sha256":"e83a84ae16cd91be7b8b12e95fe39a2600c9623e23d275f0e37ceb61031cf1f6"},{"module":"supply-planning-source-reader","sha256":"12e8a883bf2023f4374c279fb89d14ad6e7e97de3e43b8b45ba06673f6fc0169"},{"module":"supply-planning-recommendation-source-integration","sha256":"75e1f8a697ba2c01018aad9518edb9c688d086145521044d50de30ef42cbd570"},{"module":"supply-planning-source-reader-production","sha256":"0f0111ef162ac5120730c9f13ea8fe33ae34d2ef4f6419407d75591db69227ac"},{"module":"supply-planning-source-projection","sha256":"54cf5dbe25e302c1ec5ba08f2b03bd82084c2e60e2026692f7318be93698d992"},{"module":"supply-planning-allocation-facts","sha256":"36344fa81bdc5679c84e5b5810c74271b74244c650453a4d9f7b67a79829385d"},{"module":"supply-planning-planning-context","sha256":"2b7267001c9019b4298f58246859414e55996a77174094400a146457abd113e3"},{"module":"supply-planning-demand-allocation","sha256":"06cbdd2fa79bd21f6dd80fb5d990bca0ded2946c42677d4b3bc69ec4cb4618ed"},{"module":"supply-planning-marketplace-supply-allocation","sha256":"d0495511c8cfc1a5ac1a02cc0f43645c7bd5e74df808fb95c02ff4c8dc2275b6"},{"module":"supply-planning-production-assembly","sha256":"442fb7720da1977e318bb95caa300a47321a961fc5dfcb2777d73a84442faa37"},{"module":"supply-planning-destination-runtime","sha256":"8824bfd8adc2ad9b98627113f21a7784e2b51dfedfdce88d838d35f7b1f61e83"},{"module":"supply-planning-planning-demand","sha256":"2a329bb78af32752c6dc8e91e61e106f848e717d1993932757681eaf47776ed8"},{"module":"supply-planning-time-phased-projection","sha256":"327beb70c4f4eb33a1da08425b049c630c0a3fe1e18e0fd3b4900f12a0ac2947"},{"module":"supply-planning-horizon-projection","sha256":"55a96e1c7decc2f04e1e8184a38573fb2a34484f92acca02f725891c0e803677"},{"module":"supply-planning-daily-warehouse-allocation","sha256":"0670372990dbebfc66c7c4472d5d4ccae8ae1f6fd6ee91e1b3b677514ae249e4"},{"module":"supply-planning-production-source","sha256":"4df614472eafa63afd310a849d1b34d02cc46fe4a5f826803e0e88b86388e6aa"},{"module":"supply-planning-production-safety","sha256":"7494f90ffe42045f6e75b32fb11d05dd91e8275631a0bd028d002810cf0ef3a6"},{"module":"supply-planning-production-writer","sha256":"1e4c4d156fc32d924b9a30116f8b7bcc2b50bb3ba666842c3ced8190f934463c"},{"module":"supply-planning-verification-diagnostics","sha256":"efbbfa0e360a9de20a3025964a6181b7bc00496fbb8283d0528f6d0c89dc5dea"},{"module":"supply-recommendation","sha256":"aecace412b4332846a6dd67dead8ee70994a4c085ea6f7827218b9289f4ecb6f"},{"module":"supply-execution-handoff","sha256":"ba372868cf169cd61cb8f9972b6649afff2917c99f510b9de9acb0882f60643b"},{"module":"supply-planning-ongoing-order-projection","sha256":"571f0e021188ee063b92942fe0240d9bc588df65db64130e714d0218da567cc7"},{"module":"supply-planning-ongoing-order-tpp-adapter","sha256":"d83c6b9f06e98338d64c170233b3fd2ec7f79967e57d2861d55b40bb646b45f5"},{"module":"supply-planning-ongoing-order-runtime","sha256":"37190e390dbfecd85769274aa1e684bab60861a947d2cb6e84ce2e2d591e38a2"},{"module":"supply-planning-surplus-reallocation","sha256":"283e14650f6e5e1ed7168908c6aa98a45c59dc980be108d98123ab9c6d8afa8c"},{"module":"supply-planning-request-draft-v2","sha256":"20c6520c158df94aff2ec25544ba2c27327abe709bb419e2c0846b0941228505"},{"module":"supply-planning-request-draft-v2-persistence","sha256":"a5b22d7012d22f8c2698d1434f25ef2d3c8ee320ea702b3631dddd59c52d33c4"},{"module":"supply-planning-factory-site-allocation","sha256":"cd56eaea5cb40610dc98fab7bfd76b895b163eda5d287f71c454010478970b96"},{"module":"supply-planning-forecast-normalization","sha256":"4c17ccf4cca6f7925b625dc2be396f3c09d372e5a3b214b70668b92ce87ec6f9"},{"module":"supply-planning-snapshot-freshness","sha256":"52ca7a17175b16b37bcc7e0ce2488f928642399bb7bafad6a5c2c393ef2cce2b"},{"module":"supply-planning-active-route-classification","sha256":"09208a12661f0987aae81db783782a56d155860cd7cdde169b8bd2761ed3efaf"},{"module":"supply-planning-factory-stock-guard","sha256":"11783cebdf76504f8e0721a2b4336d2bb30e43eef37e1847e382a8085ba4ac90"}]};
