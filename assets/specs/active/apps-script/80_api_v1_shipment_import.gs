

































var SHI_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15G-SO8-AFINAL3-A2ROUTE-AD1B-AD2-AD3';   // SHIP-OPEN R4 (review B1); r5.1 SO5; r5.2 SO6; r5.4 (legacy compatibility) -> SO8; A fix1 (Add New template contract) -> SO8-SHTPL1; A fix2 (Update display-only cells) -> SO8-SHTPL2: a new stamp, pinned in Production 01_ module_stamps and 63_
var SHI_SCHEMA_VERSION_ = 'SHIPMENT-IMPORT-2';   // SHIP-OPEN: the opening contract (remaining quantity only)
// A fix1 SHTPL1 (Owner 2026-11-20): the Add New template contract. A downloaded Add New file names it in _SYSTEM.scope.template_contract;
// validate and commit refuse an Add New file without it (an older template: DISTINCT token, optional ETA / Reference ID / Shipping method)
// with IMPORT_FILE_TEMPLATE_OUTDATED - the file is never reinterpreted. The domain schema_version (and so Update files, receipts and
// content hashes) is unchanged.
var SHI_ADD_CONTRACT_ = 'SHIPMENT-ADD-NEW-SHTPL1';
// A fix2 (2026-11-20): the Update export marks the rows whose displayed opening quantity / 資料時間 the server would accept (an Amazon
// imported shipment: IMPORT_HISTORICAL + DISPLAY_ONLY + in_transit - exactly the displayChangeOf conditions). Only those cells of the two
// 'display' columns are unlocked in the downloaded file (template-export.js opt-in unlockIfRowFlag); every other row / column keeps its
// lock. The flag is template-only: the sheet answer carries row_flags { flag: [row indexes] } beside the rows (b2: never inside a row, so a
// client that echoes the rows back is unaffected); never read back, never stored; validation (decrease only, later basis time, row_version) is unchanged.
var SHI_DISPLAY_EDIT_FLAG_ = '__display_editable';
// A-delta2 (Owner rule 6, 2026-11-21): ONE status filter for the Update export, Validate and Apply. Updatable = goods on the way that no receipt has
// started: shipped, in_transit, arrived ('Delivered / 已送達（待收貨）' on screen = NOT received). Everything else is excluded: receipt started or done
// (partially_received / partial_received, received), terminal (closed, completed, delivered, cancelled / canceled), not dispatched (draft,
// ready_to_ship, planned) and stuck / blank / unknown. A file row of an excluded shipment that changes something is refused
// (SHIPMENT_STATUS_NOT_UPDATABLE); one that changes nothing reads 'unchanged' (excluded) and nothing is applied.
var SHI_UPDATABLE_STATUSES_ = ['shipped', 'in_transit', 'arrived'];
function shiUpdatable_(h) { return SHI_UPDATABLE_STATUSES_.indexOf(shiLc_(h && h.status)) >= 0 && !shiIsPending_(h); }
// A-delta2 r3: reserved template flag for unlocking Carrier + Shipping method cells. NOT used: Update keeps the b3 freeze (no row is ever unlocked).
var SHI_TRANSPORT_EDIT_FLAG_ = '__transport_editable';
var SHI_TRANSPORT_KEYS_ = ['carrier_id', 'shipping_method', 'last_mile_delivery'];   // Header only: judged by transportOf (shiValidateUpdate_), never by the generic fixed-field check
// A final (S1/S3, 2026-11-20): list LABELS are display text only. An inline Excel list is comma-separated and strips double quotes, so a
// label holding ',' or '"' arrives in the cell as a FRAGMENT (the Owner's 'WH-... | CN... (CN_YOUXIN'). Labels are therefore written with
// a full-width comma instead, and with every double-quote-like character removed (b3: real Excel 16 REFUSES TO OPEN a file whose inline
// list holds U+201D or U+FF02 - joint-a2s-final runs/excel-char-probe; '"' itself is already stripped by template-export.js inlineList).
// Values (ids / tokens) are never changed.
function shiDisp_(s) { return imbStr_(s).replace(/,/g, '\uFF0C').replace(/["\u201C\u201D\u201E\u201F\u2033\u301D\u301E\u301F\uFF02]/g, ''); }
// A final S1: shipping method = the canonical token (carrier_lead_times / carrier_rate_cards.shipping_method) stored and computed with;
// the Owner picks carrier_rate_cards.shipping_method_label. entries = the dropdown texts, each mapped to exactly ONE token:
//   a label owned by one token and equal to no other token -> the label itself; a label shared by several tokens (or equal to another
//   token) -> 'label (token)' (the minimum distinguishing text); a token without any label -> the raw token (no invented label), or
//   'token (token)' when that text is also another token's label (typing the bare text is then AMBIGUOUS, never first-match).
// resolve(): entry text, raw token, unambiguous label, or 'token | anything' (token = identity) -> the token; a shared label -> AMBIGUOUS
// (never the first match); anything else -> UNKNOWN. Exact text after trimming; no case folding, no fuzzy matching.
function shiMethodModel_(lt, rc) {
var tokens = Object.create(null), labelsOf = Object.create(null), tokensOf = Object.create(null);   // A final2 (REVIEW_AFINAL MINOR-6): null-prototype maps
(lt || []).forEach(function (r) { var t = imbStr_(r.shipping_method); if (t) tokens[t] = 1; });
(rc || []).forEach(function (r) { var t = imbStr_(r.shipping_method); if (!t) return; tokens[t] = 1; var l = imbStr_(r.shipping_method_label); if (!l || !shiActive_(r)) return;
(labelsOf[t] = labelsOf[t] || Object.create(null))[l] = 1; (tokensOf[l] = tokensOf[l] || Object.create(null))[t] = 1; });
var amb = function (l, t) { return Object.keys(tokensOf[l] || {}).length > 1 || (tokens[l] === 1 && l !== t); };
var byText = Object.create(null), dup = Object.create(null), entries = [];
Object.keys(tokens).sort().forEach(function (t) { var ls = Object.keys(labelsOf[t] || {}).sort();
(ls.length ? ls.map(function (l) { return { text: shiDisp_(amb(l, t) ? l + ' (' + t + ')' : l), token: t, label: l }; }) : [{ text: Object.keys(tokensOf[t] || {}).some(function (x) { return x !== t; }) ? t + ' (' + t + ')' : t, token: t, label: '' }]).forEach(function (e) {
if (byText[e.text] && byText[e.text].token !== e.token) dup[e.text] = 1; else if (!byText[e.text]) { byText[e.text] = e; entries.push(e); } }); });
entries = entries.filter(function (e) { return !dup[e.text]; });
function resolve(raw) {
var s = imbStr_(raw); if (!s) return { blank: true };
if (dup[s]) return { ambiguous: true, value: s, candidates: [] };
if (byText[s]) return { token: byText[s].token, label: byText[s].label, via: 'list' };
if (tokens[s] === 1) { var others = Object.keys(tokensOf[s] || {}).filter(function (t) { return t !== s; }); return others.length ? { ambiguous: true, value: s, candidates: [s].concat(others) } : { token: s, label: '', via: 'token' }; }
var ts = Object.keys(tokensOf[s] || {}); if (ts.length === 1) return { token: ts[0], label: s, via: 'label' }; if (ts.length > 1) return { ambiguous: true, value: s, candidates: ts.sort() };
var i = s.indexOf(' | '); if (i > 0) { var id = s.slice(0, i).trim(); if (tokens[id] === 1) { var oth = Object.keys(tokensOf[id] || {}).filter(function (t) { return t !== id; }); return oth.length ? { ambiguous: true, value: s, candidates: [id].concat(oth) } : { token: id, label: '', via: 'id_label' }; } }   // A final2 (MINOR-6): fail closed like the bare token
return { unknown: true, value: s }; }
return { entries: entries, tokens: Object.keys(tokens).sort(), resolve: resolve };
}
// A-delta1 B (P0-2, Owner 2026-11-21): Carrier + Shipping method label -> exactly ONE (shipping_method, last_mile_delivery) tuple over the
// APPLICABLE rate cards: this carrier only (exact id), ACTIVE (shiActive_), destination_country blank or = the row country, destination_warehouse_code
// blank or = the destination code, effective on the ETD (effective_from <= ETD <= effective_to, blank = open). Text match, in this order, exact after
// trim, no case folding, no word parsing: the label; the old dropdown text "label (token)"; the canonical token; "token | anything" (token part).
// Cards that differ only in price / currency / tier are ONE tuple (dedup). Several tuples -> AMBIGUOUS (never the first); none -> the missing
// condition is named. A blank last mile is never defaulted. It selects no card, quote, rate, currency or cost - only the two tokens.
// A-delta1 B (P0-2, Owner 2026-11-21) + b3 (REVIEW_AD1 M-3 / L-5): Carrier + Shipping method label -> exactly ONE (shipping_method,
// last_mile_delivery) tuple over the APPLICABLE rate cards. Applicability is the SYSTEM rule, not a second copy: 17_ shippingRateMatch_
// (mode 'exact') with this carrier, ETD (active + effective), origin country (the source factory warehouse's country), destination country
// (EU rows use the actual destination warehouse country, not the forecast planning set), battery class of the shipment's SKUs, marketplace
// (blank for MULTI), destination warehouse code; 17_ also applies its city / postal scoping and keeps the latest tariff + the narrowest
// geography per service. Only then is the text matched, among the applicable cards, in this order (exact after trim, no case folding): the
// label; the old dropdown text "label (token)"; the canonical token; "token | anything" (token part). Cards that differ only in price /
// currency / tier are ONE tuple. Several tuples -> AMBIGUOUS (never the first); none -> the missing condition is named (diagnostic only:
// the decision is 17_'s). A blank last mile is never defaulted. It selects no card, quote, rate, currency or cost - only the two tokens.
function shiMemoSs_(ss) {   // b3: read-through ss for 17_ readers - each sheet is read ONCE per request
  var cache = {};
  return { getSheetByName: function (n) {
    if (Object.prototype.hasOwnProperty.call(cache, n)) return cache[n];
    var sh = ss && typeof ss.getSheetByName === 'function' ? ss.getSheetByName(n) : null;
    if (!sh) { cache[n] = null; return null; }
    var vals = sh.getDataRange().getValues();
    cache[n] = { getDataRange: function () { return { getValues: function () { return vals; } }; } };
    return cache[n]; } };
}
function shiResolveTuple_(ssM, cards, x) {
  var S = imbStr_, car = S(x.carrier), txt = S(x.text), cc = S(x.country).toUpperCase(), wc = S(x.whCode).toUpperCase(), day = S(x.day), org = S(x.origin).toUpperCase(), mkt = S(x.marketplace);
  var no = function (code, msg, extra) { return Object.assign({ ok: false, code: code, message: msg }, extra || {}); };
  var eqi = function (a, b) { return S(a).toLowerCase() === S(b).toLowerCase(); };
  var mine = (cards || []).filter(function (c) { return S(c.carrier_id) === car; });
  var act = mine.filter(function (c) { return shiActive_(c); });
  if (!act.length) return no('SHIPPING_METHOD_CARRIER_HAS_NO_ACTIVE_CARD', 'carrier ' + car + ' has no active rate card - Shipping method cannot be resolved (fix the carrier or the rate cards)');
  var lm = /^(.*) \((.+)\)$/.exec(txt), pipe = txt.indexOf(' | ') > 0 ? S(txt.slice(0, txt.indexOf(' | '))) : '';
  var byText = function (list) { var a = list.filter(function (c) { return S(c.shipping_method_label) === txt; }); if (a.length) return { via: 'label', cards: a };
    if (lm) { a = list.filter(function (c) { return S(c.shipping_method_label) === S(lm[1]) && S(c.shipping_method) === S(lm[2]); }); if (a.length) return { via: 'label_token', cards: a }; }
    a = list.filter(function (c) { return S(c.shipping_method) === txt; }); if (a.length) return { via: 'token', cards: a };
    if (pipe) { a = list.filter(function (c) { return S(c.shipping_method) === pipe; }); if (a.length) return { via: 'token_pipe', cards: a }; }
    return { via: '', cards: [] }; };
  var named = byText(act);
  if (!named.cards.length) { var others = (cards || []).filter(function (c) { return shiActive_(c) && S(c.carrier_id) !== car && (S(c.shipping_method_label) === txt || S(c.shipping_method) === txt); }).map(function (c) { return S(c.carrier_id); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    return no('SHIPPING_METHOD_NOT_OFFERED_BY_CARRIER', 'carrier ' + car + ' has no active rate card with Shipping method "' + txt + '"' + (others.length ? ' (it exists only for other carriers: ' + others.slice(0, 5).join(', ') + ' - never mixed)' : '')); }
  if (typeof shippingRateMatch_ !== 'function' || typeof shippingBatteryRead_ !== 'function') return no('SHIPPING_RATE_RULE_UNAVAILABLE', 'the system rate-card rule (17_ shippingRateMatch_) is not deployed - Shipping method cannot be resolved');
  if (!org) return no('SHIPPING_METHOD_ORIGIN_UNKNOWN', 'the source warehouse has no country in the master - the rate-card origin cannot be checked (never guessed)');
  var bat = shippingBatteryRead_(ssM, x.skus || []), batUnknown = bat.cls === SHIPPING_BATTERY_UNCLASSIFIED_;
  var dcs = (typeof csdPlanningSet15e_ === 'function' ? csdPlanningSet15e_(cc) : null) || [cc], seen = {}, app = [];
  // A-delta2 (Owner 2026-11-21, route decoupled from quote): layer 1 = the EXACT QUOTE (unchanged: 17_ decides, nothing is selected). A battery
  // class that is unknown only means the quote cannot be decided (quote_reason SHIPPING_METHOD_BATTERY_UNCLASSIFIED); the tracking layer goes on.
  var qWhy = null;
  if (batUnknown) qWhy = no('SHIPPING_METHOD_BATTERY_UNCLASSIFIED', 'battery type unknown for SKU ' + (bat.unclassified || []).slice(0, 10).join(', ') + ' in sku_details - the lithium / non-lithium rate cards cannot be told apart (fix sku_details)');
  else dcs.forEach(function (dc) { shippingRateMatch_(ssM, { mode: 'exact', quoteDate: day, originCountry: org, destinationCountry: dc, batteryType: bat.cls, carrierId: car, marketplace: mkt, destinationWarehouseCode: wc }).forEach(function (c) {
    var k = S(c.rate_card_id) || JSON.stringify(c); if (!seen[k]) { seen[k] = 1; app.push(c); } }); });
  var m0 = byText(app);
  if (!qWhy && !m0.cards.length) {   // diagnostic only (the decision above is 17_'s): name the first scope the named cards miss
    var nc = named.cards, why = [
      [function (c) { return shippingRateActive_(c, day); }, 'SHIPPING_METHOD_NOT_EFFECTIVE', 'has no rate card active and effective on the ETD ' + (day || '(none)')],
      [function (c) { return eqi(c.origin_country, org); }, 'SHIPPING_METHOD_NOT_OFFERED_FOR_ORIGIN', 'has no rate card from origin country ' + org],
      [function (c) { return dcs.some(function (dc) { return eqi(c.destination_country, dc); }); }, 'SHIPPING_METHOD_NOT_OFFERED_FOR_COUNTRY', 'has no rate card for destination country ' + cc],
      [function (c) { var l = S(c.battery_type).toLowerCase() === 'lithium_battery'; return bat.cls === 'lithium_battery' ? l : !l; }, 'SHIPPING_METHOD_NOT_OFFERED_FOR_BATTERY', 'has no rate card for ' + (bat.cls === 'lithium_battery' ? 'lithium' : 'non-lithium') + ' goods'],
      [function (c) { return !S(c.marketplace) || !mkt || eqi(c.marketplace, mkt); }, 'SHIPPING_METHOD_NOT_OFFERED_FOR_MARKETPLACE', 'has no rate card for marketplace ' + (mkt || '(MULTI)')]];
    for (var i = 0; i < why.length && !qWhy; i++) { nc = nc.filter(why[i][0]); if (!nc.length) qWhy = no(why[i][1], 'carrier ' + car + ' / "' + txt + '" ' + why[i][2]); }
    if (!qWhy) qWhy = no('SHIPPING_METHOD_NOT_OFFERED_FOR_DESTINATION', 'carrier ' + car + ' / "' + txt + '" has no rate card for destination warehouse code ' + (wc || '(none)') + ' (cards scoped to a city, postal range or another warehouse code do not apply)'); }
  if (qWhy) return shiTrackingService_(ssM, named, { car: car, txt: txt, org: org, cc: cc, dcs: dcs, bat: bat, batUnknown: batUnknown, mkt: mkt, wc: wc, day: day, quote: qWhy });
  var tup = {}; m0.cards.forEach(function (c) { var k = S(c.shipping_method) + '\u0001' + S(c.last_mile_delivery); (tup[k] = tup[k] || []).push(c); });
  var keys = Object.keys(tup).sort();
  if (keys.length > 1) return no('SHIPPING_METHOD_TUPLE_AMBIGUOUS', 'carrier ' + car + ' / "' + txt + '" maps to ' + keys.length + ' different method + last mile combinations on the applicable rate cards (' + keys.map(function (k) { var p = k.split('\u0001'); return p[0] + ' + ' + (p[1] || '(blank last mile)'); }).join('; ') + ') - nothing is picked; give the cards distinct labels in carrier_rate_cards', { candidates: keys.map(function (k) { var p = k.split('\u0001'); return { shipping_method: p[0], last_mile_delivery: p[1] }; }) });
  var p0 = keys[0].split('\u0001'), cs = tup[keys[0]];
  if (!p0[1]) return no('SHIPPING_LAST_MILE_UNDETERMINED', 'carrier ' + car + ' / "' + txt + '" resolves to method ' + p0[0] + ' but its rate card(s) carry no last_mile_delivery - never defaulted (fill last_mile_delivery on the card)');
  var labels = cs.map(function (c) { return S(c.shipping_method_label); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  return { ok: true, method: p0[0], lastMile: p0[1], label: labels.length === 1 ? labels[0] : (m0.via === 'label' ? txt : ''), quote_status: 'QUOTE_APPLICABLE', quote_reason: '',
    provenance: { rule: 'CARRIER_LABEL_TUPLE_V2 (17_ shippingRateMatch_ exact)', quote_status: 'QUOTE_APPLICABLE', via: m0.via, carrier_id: car, input: txt.slice(0, 120), origin_country: org, country: cc, destination_countries: dcs.slice(0, 10), battery: bat.cls || 'non_lithium', marketplace: mkt || 'MULTI', warehouse_code: wc, etd: day, shipping_method: p0[0], last_mile_delivery: p0[1], rate_card_ids: cs.map(function (c) { return S(c.rate_card_id); }).sort().slice(0, 20), cards: cs.length } };
}
// A-delta2 (Owner 2026-11-21): layer 2 = the TRACKING SERVICE, used only when the exact quote gives nothing. The carrier's ACTIVE cards (shiActive_
// status; effectivity, geography, warehouse code and price are quote matters and are NOT used here) are only the label VOCABULARY: the cards the text
// names (same order: label, "label (token)", token, "token | ...") give candidate (shipping_method, last_mile_delivery) tuples of THIS carrier.
// A tuple is kept only when the master PROVES that service for this origin -> destination country (EU uses the physical warehouse country, as the quote
// layer): an active carrier_lead_times row, an active shipment_route_templates row (transit_type = method) or an active carrier_service_schedules row
// with the same carrier, origin_country, destination_country, shipping_method and last_mile_delivery (all non-blank, exact; blank is never a match).
// One proven tuple -> ok with quote_status QUOTE_UNAVAILABLE (+ the quote layer's diagnostic as quote_reason) and provenance TRACKING_SERVICE_V1
// listing the evidence rows; several -> narrowed by the battery class ONLY when it is known and the label's cards differ by battery, else
// SHIPPING_METHOD_TUPLE_AMBIGUOUS (never the first); none -> SHIPPING_SERVICE_NOT_FOUND (no service / no route: distinct from a missing quote).
// A blank last mile is never defaulted. No card, quote, price, currency or cost is selected or written.
// AD3-B (Owner decisions 8 / 10, 2026-11-21): EXPLICIT SERVICE. A row whose Last mile is filled and whose Shipping method is a canonical token of the
// server vocabulary (12_ shipServiceVocabulary_; exact, or "token | ...") names its service directly: no rate card and no label vocabulary are needed
// (a carrier with ZERO cards works). The quote is judged separately: QUOTE_APPLICABLE only when 17_ shippingRateMatch_ exact gives a card of this
// carrier with exactly this tuple, else QUOTE_UNAVAILABLE (cost pending) with the reason. Master rows naming the service are listed as evidence
// (information only, may be empty). Returns null when the row is not explicit (label mode). Selects no card, price, currency or cost.
function shiSvcVocab_(ssM) {
  var v = null; try { v = (typeof shipServiceVocabulary_ === 'function') ? shipServiceVocabulary_(ssM) : null; } catch (e) { v = null; }
  var m = Object.create(null), l = Object.create(null);
  (v ? v.shipping_method : [{ value: 'air' }, { value: 'sea' }, { value: 'sea_express' }, { value: 'truck' }]).forEach(function (x) { m[x.value] = 1; });
  (v ? v.last_mile_delivery : [{ value: 'parcel' }, { value: 'truck' }]).forEach(function (x) { l[x.value] = 1; });
  return { methods: m, lastMiles: l };
}
// round 6 (integration m-5a): the dropdown vocabulary from rows already in hand - the canonical tokens (12_ SHIP_SVC_METHODS_ / _LAST_MILES_) plus
// the tokens of the ACTIVE lead-time / rate-card rows read by shiLists_. No sheet is read here (the full 12_ vocabulary is used by the resolver).
function shiSvcVocabFromRows_(lt, rc) {
  var m = Object.create(null), l = Object.create(null), ok = function (t) { return /^[a-z0-9_]{1,40}$/.test(t); };
  ((typeof SHIP_SVC_METHODS_ !== 'undefined' && SHIP_SVC_METHODS_) || ['air', 'sea', 'sea_express', 'truck']).forEach(function (t) { m[t] = 1; });
  ((typeof SHIP_SVC_LAST_MILES_ !== 'undefined' && SHIP_SVC_LAST_MILES_) || ['parcel', 'truck']).forEach(function (t) { l[t] = 1; });
  (lt || []).concat(rc || []).forEach(function (r) { if (!shiActive_(r)) return; var a = imbStr_(r.shipping_method), b = imbStr_(r.last_mile_delivery); if (ok(a)) m[a] = 1; if (ok(b)) l[b] = 1; });
  return { methods: m, lastMiles: l };
}
function shiExplicitService_(ssM, cards, x) {
  var S = imbStr_, lm = S(x.lm), txt = S(x.text); if (!lm) return null;
  var tok = txt.indexOf(' | ') > 0 ? S(txt.slice(0, txt.indexOf(' | '))) : txt, V = shiSvcVocab_(ssM);
  if (!V.methods[tok]) return null;
  if (!V.lastMiles[lm]) return { ok: false, code: 'LAST_MILE_NOT_IN_VOCABULARY', message: 'Last mile "' + lm + '" is not in the server vocabulary (' + Object.keys(V.lastMiles).join(', ') + ')' };
  var car = S(x.carrier), org = S(x.origin).toUpperCase(), cc = S(x.country).toUpperCase(), day = S(x.day), wc = S(x.whCode).toUpperCase(), mkt = S(x.marketplace), eqi = function (a, b) { return S(a).toLowerCase() === S(b).toLowerCase(); };
  if (!org) return { ok: false, code: 'SHIPPING_SERVICE_ORIGIN_UNKNOWN', message: 'the source warehouse has no country in the master - an explicit service cannot be checked against the declared lanes of the carrier (never any lane); fix the warehouse country' };   // round 7 (review)
  if (typeof shipSvcCapabilityCheck_ === 'function') { var cap0 = shipSvcCapabilityCheck_(ssM, car, tok, lm, org, cc); if (cap0) return { ok: false, code: cap0.code, message: cap0.message };   // AD3-B (Owner supplement 1): the carrier's declared services only
  }
  var dcs = (typeof csdPlanningSet15e_ === 'function' ? csdPlanningSet15e_(cc) : null) || [cc], q = null, app = [];
  var mine = (cards || []).filter(function (c) { return S(c.carrier_id) === car && shiActive_(c); });
  if (!mine.length) q = 'CARRIER_HAS_NO_ACTIVE_CARD';
  else if (typeof shippingRateMatch_ !== 'function' || typeof shippingBatteryRead_ !== 'function') q = 'SHIPPING_RATE_RULE_UNAVAILABLE';
  else if (!org) q = 'SHIPPING_METHOD_ORIGIN_UNKNOWN';
  else { var bat = shippingBatteryRead_(ssM, x.skus || []);
    if (bat.cls === SHIPPING_BATTERY_UNCLASSIFIED_) q = 'SHIPPING_METHOD_BATTERY_UNCLASSIFIED';
    else { var seen = {}; dcs.forEach(function (dc) { shippingRateMatch_(ssM, { mode: 'exact', quoteDate: day, originCountry: org, destinationCountry: dc, batteryType: bat.cls, carrierId: car, marketplace: mkt, destinationWarehouseCode: wc }).forEach(function (c) {
      var k = S(c.rate_card_id) || JSON.stringify(c); if (!seen[k] && S(c.shipping_method) === tok && S(c.last_mile_delivery) === lm) { seen[k] = 1; app.push(c); } }); });
      if (!app.length) q = 'NO_APPLICABLE_CARD_FOR_SERVICE'; } }
  var ev = [];
  [['carrier_lead_times', 'lead_time_id', 'shipping_method'], ['shipment_route_templates', 'route_template_id', 'transit_type'], ['carrier_service_schedules', 'service_schedule_id', 'shipping_method']].forEach(function (p) {
    (shiRowsOf_(ssM, p[0]) || []).forEach(function (r) { if (S(r.carrier_id) !== car || S(r[p[2]]) !== tok || S(r.last_mile_delivery) !== lm) return;
      if (S(r.origin_country) && org && !eqi(r.origin_country, org)) return; if (S(r.destination_country) && !dcs.some(function (dc) { return eqi(r.destination_country, dc); })) return;
      ev.push(p[0] + ':' + (S(r[p[1]]) || ('row ' + r.__r)) + (shiActive_(r) && !/^(false|0|no)$/i.test(S(r.is_active)) ? '' : ' (inactive)')); }); });
  var qs = q ? 'QUOTE_UNAVAILABLE' : 'QUOTE_APPLICABLE';
  return { ok: true, explicit: true, method: tok, lastMile: lm, label: '', quote_status: qs, quote_reason: q || '', quote_message: q ? 'cost pending (' + q + ')' : '',
    provenance: { rule: 'EXPLICIT_SERVICE_V1 (method token + last mile typed; no rate card needed; no quote selected)', quote_status: qs, quote_reason: q || '', via: 'explicit', carrier_id: car, input: txt.slice(0, 120), last_mile_input: lm,
      origin_country: org, country: cc, destination_countries: dcs.slice(0, 10), marketplace: mkt || 'MULTI', warehouse_code: wc, etd: day, shipping_method: tok, last_mile_delivery: lm, evidence: ev.slice(0, 20),
      rate_card_ids: app.map(function (c) { return S(c.rate_card_id); }).sort().slice(0, 20) } };
}
function shiTrackingService_(ssM, named, q) {
  var S = imbStr_, no = function (code, msg, extra) { return Object.assign({ ok: false, code: code, message: msg, quote_status: 'QUOTE_UNAVAILABLE', quote_reason: q.quote.code }, extra || {}); };
  var eqi = function (a, b) { return S(a).toLowerCase() === S(b).toLowerCase(); };
  var on = function (r) { var a = r.is_active; if (a === undefined) return shiActive_(r); if (a === true) return true; var s = S(a).toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'active'; };
  var tup = {}; named.cards.forEach(function (c) { var k = S(c.shipping_method) + '\u0001' + S(c.last_mile_delivery); (tup[k] = tup[k] || []).push(c); });
  var keys = Object.keys(tup).sort(), qtxt = ' (quote: ' + q.quote.code + ')';
  var src = [['carrier_lead_times', 'lead_time_id', 'shipping_method'], ['shipment_route_templates', 'route_template_id', 'transit_type'], ['carrier_service_schedules', 'service_schedule_id', 'shipping_method']].map(function (p) { return { t: p[0], id: p[1], m: p[2], rows: shiRowsOf_(ssM, p[0]) || [] }; });
  var proof = function (method, lm) { var ev = []; if (!method || !lm) return ev;
    src.forEach(function (s0) { s0.rows.forEach(function (r) { if (!on(r) || S(r.carrier_id) !== q.car || !S(r.origin_country) || !eqi(r.origin_country, q.org)) return;
      if (!q.dcs.some(function (dc) { return S(r.destination_country) && eqi(r.destination_country, dc); })) return;
      if (S(r[s0.m]) !== method || S(r.last_mile_delivery) !== lm) return;
      ev.push(s0.t + ':' + (S(r[s0.id]) || ('row ' + r.__r))); }); });
    return ev; };
  var proven = [], blankLm = [];
  keys.forEach(function (k) { var p = k.split('\u0001'); if (!p[1]) { blankLm.push(p[0]); return; } var ev = proof(p[0], p[1]); if (ev.length) proven.push({ k: k, method: p[0], lastMile: p[1], evidence: ev }); });
  var desc = function (list) { return list.map(function (k) { var p = k.split('\u0001'); return p[0] + ' + ' + (p[1] || '(blank last mile)'); }).join('; '); };
  if (proven.length > 1 && !q.batUnknown) {   // battery only when the label's vocabulary is battery-specific (its tuples differ by battery class)
    var li = q.bat.cls === 'lithium_battery', byBat = proven.filter(function (t) { return tup[t.k].some(function (c) { var l = S(c.battery_type).toLowerCase() === 'lithium_battery'; return li ? l : !l; }); });
    if (byBat.length && byBat.length < proven.length) proven = byBat;
  }
  if (proven.length > 1) return no('SHIPPING_METHOD_TUPLE_AMBIGUOUS', 'carrier ' + q.car + ' / "' + q.txt + '" names ' + proven.length + ' different proven services for ' + q.org + ' -> ' + q.cc + ' (' + desc(proven.map(function (t) { return t.k; })) + ') - nothing is picked; give the cards distinct labels in carrier_rate_cards' + qtxt, { candidates: proven.map(function (t) { return { shipping_method: t.method, last_mile_delivery: t.lastMile }; }) });
  if (!proven.length) {
    if (blankLm.length && blankLm.length === keys.length) return no('SHIPPING_LAST_MILE_UNDETERMINED', 'carrier ' + q.car + ' / "' + q.txt + '" names method ' + blankLm.join(', ') + ' but its rate card(s) carry no last_mile_delivery - never defaulted (fill last_mile_delivery on the card)' + qtxt);
    return no('SHIPPING_SERVICE_NOT_FOUND', '真正無路線／無服務: carrier ' + q.car + ' / "' + q.txt + '" names ' + desc(keys) + ', but no active carrier_lead_times / shipment_route_templates / carrier_service_schedules row proves that service from ' + q.org + ' to ' + q.cc + ' for this carrier - no tracking service (and no quote: ' + q.quote.code + ' - ' + String(q.quote.message || '').slice(0, 300) + '); nothing is guessed');
  }
  var t0 = proven[0], cs = tup[t0.k], labels = cs.map(function (c) { return S(c.shipping_method_label); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  return { ok: true, method: t0.method, lastMile: t0.lastMile, label: labels.length === 1 ? labels[0] : (named.via === 'label' ? q.txt : ''), quote_status: 'QUOTE_UNAVAILABLE', quote_reason: q.quote.code, quote_message: q.quote.message,
    provenance: { rule: 'TRACKING_SERVICE_V1 (label vocabulary of the carrier\'s active cards + master service evidence; no quote selected)', quote_status: 'QUOTE_UNAVAILABLE', quote_reason: q.quote.code, via: named.via, carrier_id: q.car, input: q.txt.slice(0, 120),
      origin_country: q.org, country: q.cc, destination_countries: q.dcs.slice(0, 10), battery: q.batUnknown ? 'unclassified (not needed)' : (q.bat.cls || 'non_lithium'), marketplace: q.mkt || 'MULTI', warehouse_code: q.wc, etd: q.day,
      shipping_method: t0.method, last_mile_delivery: t0.lastMile, evidence: t0.evidence.slice(0, 20), vocabulary_cards: cs.map(function (c) { return S(c.rate_card_id); }).sort().slice(0, 20), rate_card_ids: [] } };
}
function shiDestCountryOk_(w, rowCountry) { var wc = imbStr_(w && w.country).toUpperCase(), rc = imbStr_(rowCountry).toUpperCase();
if (typeof csdShipmentDestinationCountryOk_ === 'function') return csdShipmentDestinationCountryOk_(wc, rc);
if (!wc || !rc) return false; if (wc === rc) return true;
  var set = (typeof csdPlanningSet15e_ === 'function') ? csdPlanningSet15e_(rc) : null; return !!(set && set.indexOf(wc) !== -1); }   // A-delta1 B: 22_ csdRouteDestination16_ rule
// Keep the business scope EU; carrier lanes must use the unique destination's physical country.
function shiDeliveryCountry_(rowCountry, destinations) {
var rc = imbStr_(rowCountry).toUpperCase();
if (rc !== 'EU') return rc;
return destinations.length === 1 && shiDestCountryOk_(destinations[0], rc) ? imbStr_(destinations[0].country).toUpperCase() : '';
}
function shiDisplayEditable_(h) { return imbStr_(h && h.record_origin) === SHI_ORIGIN_HISTORICAL_ && imbStr_(h && h.opening_supply_mode) === 'DISPLAY_ONLY' && shiLc_(h && h.status) === 'in_transit'; }
var SHI_ORIGIN_HISTORICAL_ = 'IMPORT_HISTORICAL';
// A-delta2 (Owner rule 6): what may change the transport (carrier / method / last mile) of an existing shipment. Read once per request.
function shiTransportIndex_(ss) {
  var routes = {}, evs = {};
  (shiRowsOf_(ss, 'shipment_routes') || []).forEach(function (r) { var s = imbStr_(r.shipment_id); if (s) routes[s] = (routes[s] || 0) + 1; });
  (shiRowsOf_(ss, 'shipment_events') || []).forEach(function (r) { var s = imbStr_(r.shipment_id); if (s && /^(route|confirm):/.test(imbStr_(r.source_event_id))) evs[s] = 1; });
  return { routes: routes, events: evs };
}
// the code that keeps an Update row's transport (always one: b3 freeze). The specific codes name why (status / route / events / selected quote);
// SHIPMENT_TRANSPORT_FROZEN is the general b3 / 12_ rule. Never '' (no transport change is applied by Update).
function shiTransportLock_(tx, h) {
  var sid = imbStr_(h && h.shipment_id);
  if (!shiUpdatable_(h)) return 'SHIPMENT_STATUS_NOT_UPDATABLE';
  if (imbStr_(h.record_origin) !== SHI_ORIGIN_HISTORICAL_) return 'SHIPMENT_TRANSPORT_FROZEN';
  if (tx.routes[sid]) return 'SHIPMENT_TRANSPORT_ROUTE_EXISTS';
  if (tx.events[sid]) return 'SHIPMENT_TRANSPORT_DISPATCH_EVIDENCE';
  if (imbStr_(h.rate_card_id)) return 'SHIPMENT_TRANSPORT_QUOTE_SELECTED';
  // A-delta2 r2 (Owner: never looser than b3 - b3 Update kept carrier / method / last mile FIXED; 12_ freezes every dispatched shipment): no transport
  // change is applied by an Update import. A correction on an imported no-route shipment is an OWNER DECISION, not enabled here.
  return 'SHIPMENT_TRANSPORT_FROZEN';
}
// the Shipping method cell an Update export shows: the business label when exactly ONE active card label of this carrier names this
// (method, last mile) and the dropdown carries that text (else the dropdown text of the token, else the token itself) - display only
function shiMethodText_(methods, cards, h) {
  var car = imbStr_(h.carrier_id), tok = imbStr_(h.shipping_method), lm = imbStr_(h.last_mile_delivery); if (!tok) return '';
  var ls = (cards || []).filter(function (c) { return shiActive_(c) && imbStr_(c.carrier_id) === car && imbStr_(c.shipping_method) === tok && imbStr_(c.last_mile_delivery) === lm && imbStr_(c.shipping_method_label); })
    .map(function (c) { return imbStr_(c.shipping_method_label); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  var es = (methods && methods.entries) || [];
  if (ls.length === 1) { var e = es.filter(function (x) { return x.token === tok && x.label === ls[0]; })[0]; if (e) return e.text; }
  var e2 = es.filter(function (x) { return x.token === tok && !x.label; })[0]; return e2 ? e2.text : tok;
}


var SHI_HIST_STATUSES_ = ['shipped', 'in_transit', 'arrived', 'partially_received', 'received', 'closed'];
var SHI_OPEN_STATUSES_ = ['shipped', 'in_transit', 'arrived', 'partially_received'];
var SHI_DONE_STATUSES_ = ['received', 'closed'];

var SHI_STATUS_ALIASES_ = { partial_received: 'partially_received' };

var SHI_REFUSED_STATUSES_ = {
draft: 'SHIPMENT_OPERATIONAL_IMPORT_BLOCKED', ready_to_ship: 'SHIPMENT_OPERATIONAL_IMPORT_BLOCKED',
completed: 'SHIPMENT_STATUS_NOT_IMPORTABLE', delivered: 'SHIPMENT_STATUS_NOT_IMPORTABLE', cancelled: 'SHIPMENT_STATUS_NOT_IMPORTABLE',
canceled: 'SHIPMENT_STATUS_NOT_IMPORTABLE', stuck: 'SHIPMENT_STATUS_NOT_IMPORTABLE', planned: 'SHIPMENT_STATUS_NOT_IMPORTABLE'
};
var SHI_NEW_COLUMNS_ = { shipments: ['record_origin', 'opening_as_of', 'opening_supply_mode', 'import_batch_id'], shipment_lines: ['import_batch_id'] };   // SHIP-OPEN R4: 5 columns (lines first needs the batch id on lines)
var SHI_DISPATCHED_ = ['shipped', 'in_transit', 'arrived', 'received', 'closed', 'completed', 'delivered', 'partial_received', 'partially_received'];






function shiF_(sheet, key, db, type, kind, add, update, o) {
o = o || {};
return { sheet: sheet, key: key, header: o.header || key, addHeader: o.addHeader || '', updHeader: o.updHeader || '' /* AD3-B */, db: db, type: type, kind: kind, add: add, update: update, list: o.list || '', clear: !!o.clear,
when: o.when || '', hidden: !!o.hidden, comment: o.comment || '', addComment: o.addComment || '', oldHeaders: o.oldHeaders || [] };   // A final3 r6
}
// SHIP-OPEN (2026-11-19, Owner decisions Q1-Q8 + business facts): ADD_NEW is the OPENING import of shipments that left the factory
// before go-live and are still not (fully) received. The user types only what is still on the way
// (opening_remaining_qty, 在途中數量（僅顯示）) - never the original total, never a historical received quantity, never a system id or plan
// lineage. Company and the cut-off are chosen once in the dialog (scope) and carried in the template metadata.
var SHI_FIELDS_ = [
shiF_('Header', 'shipment_id', 'shipments.shipment_id', 'text', 'key', 'no', 'key', { comment: 'System id (Update Existing only).' }),
shiF_('Header', 'row_version', '(server digest of the shipment rows - not stored)', 'text', 'system', 'no', 'version', { hidden: true, comment: 'Do not edit. An old export is refused (STALE_EXPORT).' }),
shiF_('Header', 'shipment_no', 'shipments.shipment_no', 'text', 'system', 'no', 'fixed', { comment: 'Internal number, minted by the server.' }),
shiF_('Header', 'record_origin', 'shipments.record_origin', 'text', 'system', 'no', 'fixed', { comment: 'IMPORT_HISTORICAL = an imported shipment; blank = created by the system.' }),
shiF_('Header', 'status', 'shipments.status', 'enum', 'system', 'no', 'fixed', { comment: 'Derived by the system (an imported shipment starts in_transit); moved only by receipts.' }),
shiF_('Header', 'company', 'shipments.company', 'ref', 'scope', 'no', 'fixed', { list: 'company', comment: 'Chosen once in the import dialog; never typed per row.' }),
shiF_('Header', 'opening_as_of', 'shipments.opening_as_of', 'text', 'scope', 'no', 'display', { header: '資料時間 opening_as_of', comment: 'The basis time (yyyy-MM-dd HH:mm, project time zone) of the remaining quantity. Add New: chosen once in the dialog. Update Existing: may move FORWARD only, and only on an Amazon display-only record (with its remaining quantity).' }),
shiF_('Header', 'opening_supply_mode', 'shipments.opening_supply_mode', 'text', 'system', 'no', 'fixed', { comment: 'R4: COUNTED (overseas 3PL: in-transit supply, receivable) or DISPLAY_ONLY (Amazon FBA destination: shown only - no supply, no receipt). Set by the server from the destination warehouse type.' }),
shiF_('Header', 'external_shipment_id', 'shipments.external_shipment_id', 'text', 'input', 'req', 'fixed', { header: '外部出貨單號 external_shipment_id', addHeader: '出貨單號', comment: 'Your own shipment number (legacy system / forwarder). Unique per company; ONE number = ONE destination.', addComment: '出貨單號: your own shipment number, typed freely (leading zeros and hyphens are kept). Unique per company; ONE number = ONE destination. Not the system shipment number.' }),
shiF_('Header', 'country', 'shipments.country', 'ref', 'input', 'req', 'fixed', { header: '國家 country', addHeader: '國家', list: 'country', addComment: '國家: pick from the list, or type / paste the exact code (checked by the server).' }),
shiF_('Header', 'marketplace', 'shipments.marketplace', 'ref', 'input', 'req', 'fixed', { header: '站點 marketplace', addHeader: '站點', list: 'marketplace', comment: 'One receiver; MULTI is refused.', addComment: '站點: one receiver of this company; pick from the list, or type / paste the exact value. MULTI is refused.' }),
shiF_('Header', 'source_warehouse_id', 'shipments.source_warehouse_id', 'ref', 'input', 'req', 'fixed', { header: '出貨倉 source_warehouse_id', addHeader: '出貨倉', oldHeaders: ['出貨工廠倉 source_warehouse_id', '出貨工廠倉'], list: 'source_warehouse', addComment: '出貨倉: an active factory warehouse or an active 3PL overseas warehouse owned by the selected company; pick from the list, or type / paste its warehouse id.' }),
shiF_('Header', 'destination_warehouse_id', 'shipments.destination_warehouse_id', 'ref', 'input', 'req', 'fixed', { header: '目的倉 destination_warehouse_id', addHeader: '目的倉', list: 'destination_warehouse', addComment: '目的倉: an ACTIVE FBA or 3PL warehouse of this company; pick from the list, or type / paste its warehouse id.' }),
shiF_('Header', 'warehouse_code', 'shipments.warehouse_code', 'text', 'derived', 'no', 'fixed', { comment: 'Derived from the destination warehouse master.' }),
shiF_('Header', 'etd', 'shipments.etd', 'date', 'input', 'req', 'fixed', { header: '工廠實際出貨日 etd', addHeader: 'ETD', comment: 'The date the goods left the source warehouse (yyyy-MM-dd), not after the import time (or 資料時間 when given). No other logistics date is derived from it.', addComment: 'ETD: the date the goods left the source warehouse (yyyy-MM-dd), not after the import time (or 資料時間 when given).' }),
shiF_('Header', 'eta', 'shipments.eta', 'date', 'input', 'req', 'edit', { header: 'ETA（未知請留白） eta', addHeader: 'ETA', comment: 'Blank = unknown (never guessed; not counted as dated supply until filled). Update Existing may fill or change it, never clear it.', addComment: 'ETA (yyyy-MM-dd): REQUIRED on Add New (Owner 2026-11-20); not before ETD. Never guessed by the system.' }),   // A fix1: Add New 'opt' -> 'req'; Update unchanged
shiF_('Header', 'reference_id', 'shipments.reference_id', 'text', 'input', 'req', 'fixed', { addHeader: 'Reference ID', addComment: 'Reference ID: REQUIRED on Add New; your reference text (stored in shipments.reference_id; not a system id).' }),   // A fix1: Add New 'opt' -> 'req'
shiF_('Header', 'carrier_id', 'shipments.carrier_id', 'ref', 'input', 'req', 'fixed', { list: 'carrier', addHeader: 'Carrier', addComment: 'Carrier: REQUIRED on Add New (Owner 2026-11-21); an ACTIVE carrier id - pick from the list, or type / paste the exact id. Shipping method and last mile are resolved from this carrier\'s rate cards.' }),   // A-delta1 B (P0-2): opt -> req (Add New only; Update keeps fixed)
shiF_('Header', 'shipping_method', 'shipments.shipping_method', 'ref', 'input', 'req', 'fixed', { addHeader: 'Shipping method', list: 'shipping_method', comment: 'The method token exactly as carrier_lead_times / carrier_rate_cards spell it.', addComment: 'Shipping method: REQUIRED on Add New - the carrier\'s rate-card label (A-delta1: resolved by Carrier + label to ONE method + last mile; a label with several different methods / last miles is refused, never the first). Pick from the list, or type / paste the method exactly as the carrier master spells it.' }),   // A fix1: Add New 'opt' -> 'req'
shiF_('Header', 'last_mile_delivery', 'shipments.last_mile_delivery', 'ref', 'input', 'opt', 'fixed', { list: 'last_mile', addHeader: 'Last mile', updHeader: 'last_mile_delivery', addComment: 'Last mile: OPTIONAL. Fill it (e.g. parcel / truck) together with a method TOKEN in Shipping method (air / sea / sea_express / truck) for an EXPLICIT service: no rate card is needed and the cost stays pending. Leave it blank when Shipping method is a rate-card label (then it is resolved from the label).' }),   // AD3-B (Owner 10)
shiF_('Header', 'shipments_customs_type', 'shipments.shipments_customs_type', 'ref', 'input', 'no', 'fixed', { list: 'customs_type' }),
shiF_('Header', 'import_duty_treatment', 'shipments.import_duty_treatment', 'ref', 'input', 'no', 'fixed', { list: 'import_duty_treatment' }),
shiF_('Header', 'currency', 'shipments.currency', 'ref', 'input', 'no', 'fixed', { list: 'currency' }),
shiF_('Header', 'booking_no', 'shipments.booking_no', 'text', 'input', 'opt', 'edit', { clear: true }),
shiF_('Header', 'master_tracking_number', 'shipments.master_tracking_number', 'text', 'input', 'opt', 'edit', { clear: true }),
shiF_('Header', 'tracking_number', 'shipments.tracking_number', 'text', 'input', 'opt', 'edit', { clear: true }),
shiF_('Header', 'container_no', 'shipments.container_no', 'text', 'input', 'opt', 'edit', { clear: true }),
shiF_('Header', 'bl_no', 'shipments.bl_no', 'text', 'input', 'opt', 'edit', { clear: true }),
shiF_('Header', 'invoice_no', 'shipments.invoice_no', 'text', 'input', 'opt', 'edit', { clear: true }),
shiF_('Header', 'actual_departure_date', 'shipments.actual_departure_date', 'date', 'input', 'no', 'edit', { clear: true, when: 'dispatched' }),
shiF_('Header', 'actual_arrival_date', 'shipments.actual_arrival_date', 'date', 'input', 'no', 'edit', { clear: true, when: 'dispatched' }),
shiF_('Header', 'customs_clearance_date', 'shipments.customs_clearance_date', 'date', 'input', 'no', 'edit', { clear: true, when: 'dispatched' }),
shiF_('Header', 'delivered_date', 'shipments.delivered_date', 'date', 'input', 'no', 'edit', { clear: true, when: 'dispatched' }),
shiF_('Header', 'freight_cost_actual', 'shipments.freight_cost_actual', 'decimal', 'input', 'no', 'edit', { clear: true }),
shiF_('Header', 'duty_actual', 'shipments.duty_actual', 'decimal', 'input', 'no', 'edit', { clear: true }),
shiF_('Header', 'total_cost_actual', 'shipments.total_cost_actual', 'decimal', 'input', 'no', 'edit', { clear: true }),
shiF_('Header', 'note', 'shipments.note', 'text', 'input', 'opt', 'edit', { clear: true }),
shiF_('Header', 'distinct_shipment_ack', '(file only - recorded in the import audit)', 'enum', 'input', 'opt', 'ignore', { header: '確認為不同出貨 distinct_shipment_ack', addHeader: '確認為不同出貨', list: 'distinct_ack', comment: 'ONLY for a row the preview flags SHIPMENT_OPENING_SUSPECTED_DUPLICATE: TRUE confirms it is a different physical shipment. Never change dates or quantities to get around the check.', addComment: 'TRUE / FALSE (blank = FALSE). ONLY for a row the preview flags SHIPMENT_OPENING_SUSPECTED_DUPLICATE: TRUE confirms it is a different physical shipment and needs 不同出貨原因. Any other value is refused.' }),
shiF_('Header', 'distinct_shipment_reason', '(file only - recorded in the import audit)', 'text', 'input', 'opt', 'ignore', { header: '不同出貨原因 distinct_shipment_reason', addHeader: '不同出貨原因', comment: 'Required with TRUE (at least 5 characters): why this is a different shipment. Stored in import_batch_changes.' }),
shiF_('Header', 'shipment_total_qty', 'shipments.shipment_total_qty', 'int', 'derived', 'no', 'fixed', { comment: 'Sum of the lines (server).' }),
shiF_('Header', 'shipment_total_cartons', 'shipments.shipment_total_cartons', 'int', 'derived', 'no', 'fixed'),
shiF_('Header', 'shipment_total_cbm', 'shipments.shipment_total_cbm', 'decimal', 'derived', 'no', 'fixed'),
shiF_('Header', 'shipment_total_gross_weight', 'shipments.shipment_total_gross_weight', 'decimal', 'derived', 'no', 'fixed'),
shiF_('Header', 'shipment_total_net_weight', 'shipments.shipment_total_net_weight', 'decimal', 'derived', 'no', 'fixed'),

shiF_('Lines', 'external_shipment_id', '(file only - links the line to its Header row)', 'text', 'key', 'link', 'ignore', { header: '外部出貨單號 external_shipment_id', addHeader: '出貨單號', comment: 'The same number as on the Header row.', addComment: '出貨單號: the same number as on the Header row (typed freely).' }),
shiF_('Lines', 'shipment_id', 'shipment_lines.shipment_id', 'text', 'key', 'no', 'link', { comment: 'UPDATE: the shipment this line belongs to.' }),
shiF_('Lines', 'shipment_line_id', 'shipment_lines.shipment_line_id', 'text', 'key', 'no', 'key', { comment: 'System line id (Update Existing only).' }),
shiF_('Lines', 'sku', 'shipment_lines.sku', 'ref', 'input', 'req', 'fixed', { addHeader: 'SKU', list: 'sku', addComment: 'SKU: an ACTIVE SKU; pick from the list, or type / paste the exact SKU.' }),
shiF_('Lines', 'opening_remaining_qty', 'shipment_lines.shipment_qty (imported shipment = the quantity still not received)', 'int', 'input', 'req', 'display', { header: '在途中數量（僅顯示） opening_remaining_qty', addHeader: '在途中數量', oldHeaders: ['開帳剩餘在途量 opening_remaining_qty'], comment: 'The units of this SKU still NOT received (integer > 0). Not the original shipped total; no historical received quantity. Amazon (FBA) destination: shown only, never counted as supply.', addComment: '在途中數量: ONLY the units of this SKU still NOT received (whole number > 0). Not the original shipped total, not a historical received quantity.' }),
shiF_('Lines', 'shipment_qty', 'shipment_lines.shipment_qty', 'int', 'system', 'no', 'fixed', { comment: 'An imported shipment stores its remaining quantity here.' }),
shiF_('Lines', 'shipment_received_qty', 'shipment_lines.shipment_received_qty', 'int', 'system', 'no', 'fixed', { comment: 'Received after the opening (receipts only).' }),
shiF_('Lines', 'shipment_carton_qty', 'shipment_lines.shipment_carton_qty', 'int', 'input', 'no', 'fixed'),
shiF_('Lines', 'carton_no_start', 'shipment_lines.carton_no_start', 'int', 'input', 'no', 'fixed'),
shiF_('Lines', 'carton_no_end', 'shipment_lines.carton_no_end', 'int', 'input', 'no', 'fixed'),
shiF_('Lines', 'units_per_carton', 'shipment_lines.units_per_carton', 'int', 'input', 'no', 'fixed'),
shiF_('Lines', 'shipment_carton_cbm', 'shipment_lines.shipment_carton_cbm', 'decimal', 'input', 'no', 'fixed'),
shiF_('Lines', 'gross_weight', 'shipment_lines.gross_weight', 'decimal', 'input', 'no', 'fixed'),
shiF_('Lines', 'net_weight', 'shipment_lines.net_weight', 'decimal', 'input', 'no', 'fixed'),
shiF_('Lines', 'purchase_order_line_id', 'shipment_line_allocations.purchase_order_line_id (read-only; an imported shipment carries no PO lineage)', 'ref', 'system', 'no', 'fixed'),
shiF_('Lines', 'shipping_plan_line_id', 'shipment_lines.shipping_plan_line_id (read-only; an imported shipment carries no plan lineage)', 'ref', 'system', 'no', 'fixed'),
shiF_('Lines', 'note', 'shipment_lines.note', 'text', 'input', 'opt', 'edit', { clear: true })
];
var SHI_NOT_IMPORTABLE_ = ['import_ref', 'rate_card_id', 'rate_card_version', 'shipping_plan_id', 'ship_from', 'destination', 'destination_type', 'sales_order_id', 'is_cross_dock', 'temperature_requirement',
'hazmat_flag', 'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost', 'created_by', 'created_at', 'updated_at', 'updated_by',
'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by', 'warehouse_id', 'total_gross_weight', 'total_net_weight', 'cancelled_by', 'cancelled_at', 'cancel_reason',
'import_batch_id', 'opening_received_qty', 'factory_stock_allocation_qty', 'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply', 'snapshot_suggested_qty',
'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context', 'snapshot_avg_sales_source', 'snapshot_avg_sales_warning', 'qty', 'carton_qty', 'carton_cbm', 'total_qty',
'total_cartons', 'total_cbm', 'actor', 'mode', 'import_batch', 'allocation_status', 'allocated_qty', 'reserved_qty', 'movement_id', 'line_status', 'link_status', 'ended_at'];   // XCO-R15G O-1

function shiFields_(sheet) { return SHI_FIELDS_.filter(function (f) { return f.sheet === sheet; }); }
function shiField_(sheet, key) { var m = SHI_FIELDS_.filter(function (f) { return f.sheet === sheet && f.key === key; }); return m.length ? m[0] : null; }
function shiTz_() { return Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'Asia/Taipei'; }
function shiDateText_(v) { if (v instanceof Date) return Utilities.formatDate(v, shiTz_(), 'yyyy-MM-dd'); var s = imbStr_(v); var m = /^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$/.exec(s); return m ? m[1] : s; }
function shiNumText_(v) { var s = imbStr_(v).replace(/,/g, ''); if (s === '') return ''; var n = Number(s); return isFinite(n) ? String(n) : s; }
function shiCanonCell_(v) { if (v instanceof Date) return Utilities.formatDate(v, shiTz_(), 'yyyy-MM-dd HH:mm:ss'); if (typeof v === 'number' || typeof v === 'boolean') return String(v); return imbStr_(v); }

function shiShow_(f, v) { if (f.type === 'date') return shiDateText_(v); if (f.type === 'int' || f.type === 'decimal') return shiNumText_(v); return imbStr_(v); }
function shiLc_(v) { return imbStr_(v).toLowerCase(); }
function shiActive_(w) { var a = w.is_active, s = shiLc_(w.status); return !(a === false || shiLc_(a) === 'false' || a === 0 || s === 'inactive' || s === 'discontinued'); }
function shiIsMulti_(m) { var s = shiLc_(m); return s === '' || /multi|merged|mixed|combined/.test(s); }

function shiDecSum_(list) { var t = 0, any = false; list.forEach(function (s) { if (s === '' || s === null || s === undefined) return; any = true; t += Math.round(Number(s) * 10000); }); return any ? t / 10000 : ''; }


function shiTable_(ss, name) {
var sh = ss.getSheetByName(name); if (!sh) return null;
var d = sh.getDataRange().getValues(), h = (d[0] || []).map(imbStr_), rows = [];
for (var i = 1; i < d.length; i++) { var o = { __r: i + 1 }; for (var c = 0; c < h.length; c++) if (h[c]) o[h[c]] = d[i][c]; rows.push(o); }
return { sheet: sh, headers: h, rows: rows, has: function (k) { return h.indexOf(k) >= 0; }, col: function (k) { return h.indexOf(k); } };
}
function shiRowsOf_(ss, name) { var t = shiTable_(ss, name); return t ? t.rows : null; }


// SHIP-OPEN: the company master is the existing one (13_ RO_COMPANIES_, the list PO import uses - 79_ pmiCompanies_); nothing is
// hard-coded here and nothing is created. A name that differs only in case / spacing is refused, never mapped (the owner is never guessed).
function shiCompanyMaster_() { return typeof RO_COMPANIES_ !== 'undefined' && Array.isArray(RO_COMPANIES_) ? RO_COMPANIES_.map(imbStr_).filter(String) : null; }
function shiCompanyCheck_(ss, raw) {
var c = imbStr_(raw), master = shiCompanyMaster_();
if (!c) return { code: 'IMPORT_SCOPE_REQUIRED', message: 'choose the company once in the import dialog' };
if (!master) return { code: 'SHIPMENT_COMPANY_MASTER_UNAVAILABLE', message: 'the company master (RO_COMPANIES_) is not deployed with this importer - nothing was checked' };
if (master.indexOf(c) < 0) {
var norm = function (s) { return String(s).toLowerCase().replace(/[\s_.-]+/g, ''); }, near = master.filter(function (m) { return norm(m) === norm(c); });
return near.length ? { code: 'SHIPMENT_COMPANY_NAME_MISMATCH', message: '"' + c + '" is not written as in the company master (' + near.join(', ') + '); the owner is never guessed - choose the company in the dialog' }
: { code: 'SHIPMENT_COMPANY_UNKNOWN', message: '"' + c + '" is not in the company master (' + master.join(', ') + '); no company is created by an import' };
}
var mk = (shiRowsOf_(ss, 'marketplaces') || []).filter(function (m) { return imbStr_(m.company) === c; });
if (!mk.length) return { code: 'SHIPMENT_COMPANY_HAS_NO_MARKETPLACE', message: 'company ' + c + ' has no row in the marketplaces master - no receiver can be checked' };
return { code: null, company: c };
}
function shiIsFactoryWh_(w) { return w.is_factory_warehouse === true || shiLc_(w.is_factory_warehouse) === 'true' || shiLc_(w.warehouse_type) === 'factory'; }
// One source rule for both the template list and validation of typed / pasted warehouse ids.
function shiSourceWhIssue_(w, company) {
if (shiIsFactoryWh_(w)) return shiActive_(w) ? null : { code: 'SHIPMENT_SOURCE_FACTORY_INACTIVE', message: 'the source factory warehouse is inactive in the master' };
if (shiLc_(w.warehouse_type) !== '3pl') return { code: 'SHIPMENT_SOURCE_TYPE_NOT_ALLOWED', message: 'the source must be a factory or a 3PL overseas warehouse' };
if (!imbStr_(w.company)) return { code: 'SHIPMENT_SOURCE_COMPANY_UNKNOWN', message: 'the source overseas warehouse has no company in the master - its owner is never guessed' };
if (!imbStr_(company) || imbStr_(w.company) !== imbStr_(company)) return { code: 'SHIPMENT_SOURCE_COMPANY_MISMATCH', message: 'the source overseas warehouse must belong to the selected import company' };
if (!shiActive_(w)) return { code: 'SHIPMENT_SOURCE_INACTIVE', message: 'the source overseas warehouse is inactive in the master' };
return null;
}
// 'yyyy-MM-dd HH:mm' (or the browser's yyyy-MM-ddTHH:mm) -> 'yyyy-MM-dd HH:mm'; anything else -> ''
function shiCutoff_(v) {
if (v instanceof Date) return Utilities.formatDate(v, shiTz_(), 'yyyy-MM-dd HH:mm');
var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/.exec(imbStr_(v));
if (!m || imbDate_(m[1]) === null || +m[2] > 23 || +m[3] > 59) return '';
return m[1] + ' ' + m[2] + ':' + m[3];
}
// a timestamp cell -> 'yyyy-MM-dd HH:mm:ss'; a date-only or unreadable cell -> '' (its time is unknown)
function shiTs_(v) {
if (v instanceof Date) return Utilities.formatDate(v, shiTz_(), 'yyyy-MM-dd HH:mm:ss');
var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(imbStr_(v));
return m ? m[1] + ' ' + m[2] + ':' + m[3] + ':' + (m[4] || '00') : '';
}

function shiLists_(ss, company) {
company = imbStr_(company);
var L = { status: SHI_HIST_STATUSES_.map(function (s) { return { value: s, label: s, status: 'active' }; }) }, unreadable = [];
function add(name, value, label, status) { value = imbStr_(value); if (!value) return; L[name] = L[name] || []; var ex = L[name].filter(function (x) { return x.value === value; })[0];
if (ex) { if (name === 'warehouse' || name === 'source_warehouse' || name === 'destination_warehouse' || name === 'sku' || name === 'carrier') ex.status = 'ambiguous'; return; } L[name].push({ value: value, label: shiDisp_(label || value), status: status || 'active' }); }   // A final: display text never breaks an inline list
function act(r) { return shiActive_(r) ? 'active' : 'inactive'; }
var master = shiCompanyMaster_(); if (!master) unreadable.push('company master');
var mk = shiRowsOf_(ss, 'marketplaces'); if (!mk) unreadable.push('marketplaces');
(master || []).forEach(function (c) { add('company', c, c, (mk || []).some(function (m) { return imbStr_(m.company) === c; }) ? 'active' : 'no_marketplace'); });
var wh = shiRowsOf_(ss, 'warehouses'); if (!wh) unreadable.push('warehouses');
(wh || []).forEach(function (r) { var lab = imbStr_(r.warehouse_name) + ' (' + (imbStr_(r.warehouse_code) || '-') + ' / ' + (imbStr_(r.warehouse_type) || '-') + ' / ' + (imbStr_(r.company) || '-') + ')';   // A final S3: no comma in the label (display only; the id is the identity)
add('warehouse', r.warehouse_id, lab, act(r));
if (!shiSourceWhIssue_(r, company)) add('source_warehouse', r.warehouse_id, lab, act(r));
if (!shiIsFactoryWh_(r) && (!company || imbStr_(r.company) === company)) add('destination_warehouse', r.warehouse_id, lab, act(r)); });
(mk || []).forEach(function (r) { if (company && imbStr_(r.company) !== company) return; add('country', r.country); add('marketplace', r.marketplace, imbStr_(r.marketplace_display_name) || r.marketplace, act(r)); add('currency', r.currency); });
var sk = shiRowsOf_(ss, 'sku_details'); if (!sk) unreadable.push('sku_details');
(sk || []).forEach(function (r) { add('sku', r.sku, imbStr_(r.sku) + (imbStr_(r.product_name) ? ' - ' + imbStr_(r.product_name) : ''), act(r)); });
(shiRowsOf_(ss, 'carriers') || []).forEach(function (r) { add('carrier', r.carrier_id, imbStr_(r.carrier_name) || r.carrier_id, act(r)); });
var cltRows = shiRowsOf_(ss, 'carrier_lead_times') || [], crcRows = shiRowsOf_(ss, 'carrier_rate_cards') || [];
cltRows.forEach(function (r) { add('last_mile', r.last_mile_delivery); });
crcRows.forEach(function (r) { add('last_mile', r.last_mile_delivery); add('currency', r.currency); });
var svc0 = shiSvcVocabFromRows_(cltRows, crcRows);   // AD3-B (Owner 10): the server vocabulary tokens are always offered, with or without a rate card; round 6: from the rows THIS function already read (no extra sheet read)
Object.keys(svc0.lastMiles).forEach(function (t) { add('last_mile', t); });
var methods = shiMethodModel_(cltRows.concat(Object.keys(svc0.methods).map(function (t) { return { shipping_method: t }; })), crcRows);   // A final S1: the dropdown shows the business label; the token is what is stored
L.shipping_method = methods.entries.map(function (e) { return { value: e.text, label: '', status: 'active' }; });
Object.keys(svc0.methods).sort().forEach(function (t) { if (!L.shipping_method.some(function (e) { return e.value === t; })) L.shipping_method.push({ value: t, label: '', status: 'active' }); });   // AD3-B: the bare tokens for an EXPLICIT service (with Last mile)
L.shipping_method_label = Object.keys(crcRows.reduce(function (m, r) { var l = imbStr_(r.shipping_method_label); if (l && shiActive_(r)) m[l] = 1; return m; }, {})).sort().map(function (l) { return { value: l, label: '', status: 'active' }; });   // A-delta1 B: label-only dropdown for Add New
Object.keys(typeof CUSTOMS_TYPE_LABELS_ === 'object' ? CUSTOMS_TYPE_LABELS_ : {}).forEach(function (k) { add('customs_type', k, k + ' - ' + CUSTOMS_TYPE_LABELS_[k]); });
Object.keys(typeof CRC_IMPORT_DUTY_TREATMENTS_ === 'object' ? CRC_IMPORT_DUTY_TREATMENTS_ : {}).forEach(function (k) { add('import_duty_treatment', k); });
L.distinct_ack = [{ value: 'TRUE', label: '', status: 'active' }, { value: 'FALSE', label: '', status: 'active' }];   // SHIP-OPEN R5; A fix1: TRUE / FALSE (Owner 2026-11-20), no label so the cell holds exactly TRUE or FALSE
['company', 'warehouse', 'source_warehouse', 'destination_warehouse', 'country', 'marketplace', 'sku', 'carrier', 'shipping_method', 'last_mile', 'customs_type', 'import_duty_treatment', 'currency'].forEach(function (n) { L[n] = L[n] || []; });
return { lists: L, unreadable: unreadable, methods: methods };
}
function shiInList_(L, name, v) { var m = (L[name] || []).filter(function (x) { return x.value === v; }); return m.length ? m[0] : null; }


function shiDb_(ss) {
var sh = shiTable_(ss, 'shipments'), ln = shiTable_(ss, 'shipment_lines'), al = shiTable_(ss, 'shipment_line_allocations');
var byId = {}, linesBy = {}, allocBy = {};
(sh ? sh.rows : []).forEach(function (r) { var id = imbStr_(r.shipment_id); if (!id) return; (byId[id] = byId[id] || []).push(r); });
(ln ? ln.rows : []).forEach(function (r) { var id = imbStr_(r.shipment_id); if (!id) return; (linesBy[id] = linesBy[id] || []).push(r); });
(al ? al.rows : []).forEach(function (r) { var id = imbStr_(r.shipment_line_id); if (!id) return; (allocBy[id] = allocBy[id] || []).push(r); });
return { sh: sh, ln: ln, al: al, byId: byId, linesBy: linesBy, allocBy: allocBy };
}
function shiRowVersion_(db, sid) {
var h = (db.byId[sid] || [])[0] || {}, lines = (db.linesBy[sid] || []).slice().sort(function (a, b) { return imbStr_(a.shipment_line_id) < imbStr_(b.shipment_line_id) ? -1 : 1; });
function canon(r) { var o = {}; Object.keys(r).sort().forEach(function (k) { if (k !== '__r') o[k] = shiCanonCell_(r[k]); }); return o; }
var payload = { h: canon(h), l: lines.map(canon), a: lines.map(function (l) { return (db.allocBy[imbStr_(l.shipment_line_id)] || []).map(canon); }) };
return 'rv1:' + imbSha_(JSON.stringify(payload)).slice(0, 24);
}
function shiLinePo_(db, line) {
return (db.allocBy[imbStr_(line.shipment_line_id)] || []).filter(function (a) { var s = shiLc_(a.allocation_status); return s === 'executed' || s === 'draft'; })
.map(function (a) { return imbStr_(a.purchase_order_line_id); }).filter(String).sort().join(' + ');
}
function shiCurrent_(db, f, row, line) {
if (f.key === 'row_version') return shiRowVersion_(db, imbStr_(row.shipment_id));
if (f.sheet === 'Lines' && f.key === 'purchase_order_line_id') return shiLinePo_(db, line);
if (f.sheet === 'Lines' && f.key === 'opening_remaining_qty') return imbStr_(row && row.record_origin) === SHI_ORIGIN_HISTORICAL_ && imbStr_(row && row.opening_supply_mode) !== '' && line ? shiShow_(f, line.shipment_qty) : '';   // SHIP-OPEN R5; r5.4: never for a legacy row (blank mode)
if (f.sheet === 'Header' && f.key === 'opening_as_of') return shiCutoff_(row && row.opening_as_of) || imbStr_(row && row.opening_as_of);   // SHIP-OPEN R5
var src = f.sheet === 'Header' ? row : line;
return shiShow_(f, src ? src[f.key] : '');
}


function shiColumns_(sheet, mode) {
return shiFields_(sheet).filter(function (f) {
if (mode === 'ADD_NEW') return f.add !== 'no';
return f.update !== 'ignore';
}).map(function (f) {
var req = mode === 'ADD_NEW' ? (f.add === 'req' || f.add === 'link') : (f.update === 'key' || f.update === 'version' || f.update === 'link');
var kind = mode === 'UPDATE' && f.update === 'fixed' ? 'readonly' : (mode === 'UPDATE' && f.update === 'edit' ? 'editable' : f.kind);
// A fix1 SHTPL1 (root cause: the shared template-export.js unlocks a protected-sheet data cell only for kind editable / required /
// business; b5 sent 'input' / 'key', so every Add New data cell was locked). ADD_NEW ONLY: a user-input field (kind 'input') and the
// Lines link number (kind 'key', add 'link') are sent as 'required' (yellow, unlocked) or 'editable' (white, unlocked). Every other kind
// (system / scope / derived) and every UPDATE column keep the b5 kind, so Update ids, row_version and fixed columns stay locked.
if (mode === 'ADD_NEW' && (f.kind === 'input' || (f.kind === 'key' && f.add === 'link'))) kind = req ? 'required' : 'editable';
// Add New shows the plain business label (no technical key); the parser maps it back by header text, and every older header / the key
// stays an alias so a file is read by stable keys, never by column position.
// A-delta2 (Owner rule 6): Update Existing shows the SAME friendly headers as Add New (the old technical header and the key stay aliases, so an
// older Update file is still read by stable keys). Kinds / locks of UPDATE are unchanged except the two transport columns (below).
var header = (mode === 'UPDATE' && f.updHeader) ? f.updHeader : f.addHeader ? f.addHeader : f.header;   // AD3-B: a column new to Add New keeps its Update header
var aliases = [f.header, f.addHeader].concat(f.oldHeaders || []).filter(function (h, i, a) { return h && h !== header && h !== f.key && a.indexOf(h) === i; });
var col = { key: f.key, header: header, aliases: aliases, kind: kind, type: f.type, required: req, list: f.list, comment: mode === 'ADD_NEW' && f.addComment ? f.addComment : f.comment, hidden: f.hidden, db: f.db, clearable: mode === 'UPDATE' && f.clear };
if (mode === 'UPDATE' && f.update === 'display') col.unlock_if_row_flag = SHI_DISPLAY_EDIT_FLAG_;   // A fix2: unlocked only on the rows the server marks
// A-delta2 r3 (b3 freeze, Owner: never looser than b3): Update shows the Add New Carrier + Shipping method texts and dropdown lists, but both cells
// stay LOCKED on every row and any different value is refused (shiTransportLock_ / transportOf). Last mile is derived (read-only).
if (mode === 'UPDATE' && sheet === 'Header' && (f.key === 'carrier_id' || f.key === 'shipping_method')) col.comment = f.key === 'carrier_id' ? 'Carrier: read-only in Update (as b3). A different value is listed in the preview and refused (SHIPMENT_TRANSPORT_FROZEN, or a more specific lock code); no route or event is deleted or rebuilt.' : 'Shipping method: read-only in Update (as b3). The exported text, or any text that resolves to the SAME stored method + last mile for this carrier, is no change; anything else is listed in the preview and refused.';   // A-delta2 r3: cells stay locked (b3 scope)
if (mode === 'UPDATE' && sheet === 'Header' && f.key === 'last_mile_delivery') col.comment = 'Derived from Carrier + Shipping method (read-only).';
return col;
});
}
var SHI_PREP_MARK_ = 'PREPARATION_ONLY';
function shiTemplate_(ss, o) {
var mode = o.mode, scope = o.scope || {}, rows = { Header: [], Lines: [] }, notes = [], flagRows = { Header: [], Lines: [] };   // A fix2 b2: indexes of the rows the server would accept a display change on
var company = imbStr_(scope.company), cut = shiCutoff_(scope.opening_as_of);
// SHIP-OPEN R5 (Owner, G0): a PREPARATION template (company lists only) is built before the cut-off is decided - the cut-off stays EMPTY
// (never defaulted to today) and the file is marked PREPARATION_ONLY in its _SYSTEM scope; validate and commit refuse such a file
// (IMPORT_FILE_PREPARATION_ONLY). Only the local template generator asks for it; the Download button never does.
var prep = mode === 'ADD_NEW' && imbStr_(scope.preparation_only) === SHI_PREP_MARK_;
if (prep && imbStr_(scope.opening_as_of)) { var eP = new Error('a preparation template carries no cut-off - the Owner sets it later in the import dialog'); eP.importCode = 'OPENING_PREPARATION_HAS_CUTOFF'; throw eP; }
// SHIP-OPEN: a Download names its company (and, for Add New, its cut-off) - both are checked and embedded in the file's _SYSTEM
// metadata; the option read (no company) only returns the lists.
if (company) { var co = shiCompanyCheck_(ss, company); if (co.code) { var e0 = new Error(co.message); e0.importCode = co.code; throw e0; } }
if (company && mode === 'ADD_NEW' && !prep) {
/* A final3 (Owner 2026-11-20, option A): no date is chosen at download; opening_as_of is the SOURCE data time only - optional */
if (imbStr_(scope.opening_as_of) && !cut) { var e2 = new Error('資料時間 must be yyyy-MM-dd HH:mm'); e2.importCode = 'OPENING_CUTOFF_INVALID'; throw e2; }
}
var li = shiLists_(ss, company);
// R4 (review m3): an unreadable master is a FAILURE with its reason, never success with an empty list
if (li.unreadable.length) { var eU = new Error('master data could not be read: ' + li.unreadable.join(', ') + ' - no list is offered'); eU.importCode = li.unreadable.indexOf('company master') >= 0 ? 'SHIPMENT_COMPANY_MASTER_UNAVAILABLE' : 'SHIPMENT_MASTER_UNREADABLE'; throw eU; }
if (mode === 'UPDATE' && o.include_data) {
if (!company) { var e = new Error('UPDATE export needs scope.company - the export is the complete set of one company\'s updatable shipments'); e.importCode = 'IMPORT_SCOPE_REQUIRED'; throw e; }
var db = shiDb_(ss), tx = shiTransportIndex_(ss), trFlags = { Header: [] }, crcT = shiRowsOf_(ss, 'carrier_rate_cards') || [];
Object.keys(db.byId).sort().forEach(function (sid) {
var h = db.byId[sid][0]; if (imbStr_(h.company) !== company || !shiUpdatable_(h)) return;   // A-delta2: the ONE status filter (shipped / in_transit / arrived; never PENDING)
var hr = {}; shiColumns_('Header', 'UPDATE').forEach(function (c) { hr[c.key] = shiCurrent_(db, shiField_('Header', c.key), h, null); }); if (shiDisplayEditable_(h)) flagRows.Header.push(rows.Header.length);   // A fix2 (b2: the flag stays OUT of the row data)
hr.shipping_method = shiMethodText_(li.methods, crcT, h);   // A-delta2: the business label (the Add New pair), never the bare token when one label names it
if (!shiTransportLock_(tx, h)) trFlags.Header.push(rows.Header.length);   // A-delta2 r2: never true (the lock always answers) - the flag list stays empty
rows.Header.push(hr);
(db.linesBy[sid] || []).forEach(function (l) { var lr = {}; shiColumns_('Lines', 'UPDATE').forEach(function (c) { lr[c.key] = c.key === 'shipment_id' ? sid : shiCurrent_(db, shiField_('Lines', c.key), h, l); }); if (shiDisplayEditable_(h)) flagRows.Lines.push(rows.Lines.length); rows.Lines.push(lr); });   // A fix2 (b2)
});
flagRows.__transport = trFlags.Header;
notes.push('UPDATE: only the editable columns may change (tracking / booking / invoice numbers, ETA, actual dates, actual costs, notes). A blank keeps the current value; [CLEAR] clears a clearable field (ETA is never cleared).');
notes.push('Updatable = shipped / in_transit / arrived (已送達待收貨). Shipments whose receipt has started or that are finished (partially_received, received, closed, completed, delivered, cancelled), drafts and ready_to_ship are not exported and an Update row for them is refused.');
notes.push('Carrier + Shipping method (label) show the Add New texts and stay read-only, as before: a different value is listed in the preview with its route impact and refused - no route or event is deleted or rebuilt.');
notes.push('Amazon display-only shipments: 在途中數量（僅顯示） may only go down or stay, with a LATER 資料時間 (not in the future). Only the shown number changes. Other shipments change quantity only through receipts.');
notes.push('Status, quantities, SKU, company / receiver, warehouses and system columns are read-only: a different value is refused (Carrier / Shipping method too - see below). Receipts: shipment.receipt.update.');   // A-delta2
} else {
notes.push('Add New = shipments already on the way (left the source warehouse, not fully received). Type only the quantity still not received (在途中數量) - not the original total, not what was already received.');
notes.push('Required on Header: 出貨單號, 國家, 站點, 出貨倉, 目的倉, ETD, ETA, Reference ID, Shipping method. Required on Lines: 出貨單號, SKU, 在途中數量 (whole number > 0). Source = an active factory or the selected company\'s active 3PL overseas warehouse. List cells accept a picked value or the same value typed / pasted; the server checks every value.');
notes.push('No factory stock deduction, reservation, PO allocation, PO change, route, event, receipt, document or e-mail is created. Lines link to their Header row by 出貨單號.');
notes.push('One shipment may carry several different SKUs (one line each); the same SKU twice in one shipment is refused. A row whose content equals another shipment under a different number is SUSPECTED_DUPLICATE: if it really is a different shipment, set 確認為不同出貨 = TRUE and give 不同出貨原因 (recorded in the audit); FALSE or blank does not acknowledge. Never change dates or quantities to get past it.');
notes.push('One 出貨單號 = one shipment = one destination (no split). ETD is the source warehouse departure date; ETA is required and never guessed.');
notes.push('Amazon (FBA) destination: shown only - not supply, cannot be received. Overseas 3PL destination: counted once and received normally. The server records the import time; 資料時間 stays blank unless the source gives one.');
}
var outScope = { company: company }; if (mode === 'ADD_NEW') { outScope.opening_as_of = cut; outScope.timezone = shiTz_(); outScope.template_contract = SHI_ADD_CONTRACT_; }   // A fix1: the Add New contract travels in _SYSTEM.scope
if (prep) { outScope.opening_as_of = ''; outScope.preparation_only = SHI_PREP_MARK_; notes.unshift('準備用：不可上傳 Apply - PREPARATION ONLY: copy the rows into a template downloaded from the import dialog (this file is refused at validate and Apply).'); }   // A final3: short note
return { sheets: ['Header', 'Lines'].map(function (sn) { var s = { name: sn, columns: shiColumns_(sn, mode), rows: rows[sn] }; if (mode === 'UPDATE' && o.include_data) { s.row_flags = {}; s.row_flags[SHI_DISPLAY_EDIT_FLAG_] = flagRows[sn]; if (sn === 'Header') s.row_flags[SHI_TRANSPORT_EDIT_FLAG_] = flagRows.__transport || []; } return s; }), lists: li.lists,   // A fix2 b2: row_flags = { flag: [row index] } (template-only; never part of a row); A-delta2: + the transport flag
scope: outScope, scope_label: prep ? '準備用：不可上傳 Apply · company = ' + company : company ? 'company = ' + company + (mode === 'ADD_NEW' && cut ? ' · 資料時間 ' + cut : '') + (mode === 'UPDATE' && o.include_data ? ' - every updatable shipment of this company (' + rows.Header.length + ')' : '') : 'choose the company first',   // A final3: no cut-off text
row_counts: { Header: rows.Header.length, Lines: rows.Lines.length }, timezone: shiTz_(), notes: notes };
}

function shiCheckColumns_(req, issues) {
['Header', 'Lines'].forEach(function (sn) {
var seen = {};
(req.sheets[sn] || []).forEach(function (r) {
Object.keys(r).forEach(function (k) {
if (k === '__row' || seen[k]) return; seen[k] = 1;
if (shiField_(sn, k)) return;
if (SHI_NOT_IMPORTABLE_.indexOf(k) >= 0) imbIssue_(issues, sn, '', k, 'SHIPMENT_FIELD_NOT_IMPORTABLE', 'a system / frozen / actor / ledger column cannot be imported (' + k + '); remove the column');
else imbIssue_(issues, sn, '', k, 'IMPORT_COLUMN_UNKNOWN', 'this column is not part of the Shipment import (' + k + ')');
});
});
});
}

function shiTyped_(f, row, issues, sn, L, required) {
var c = imbCell_(row, f.key);
if (c.absent || c.blank) { if (required) imbIssue_(issues, sn, row.__row, f.key, 'REQUIRED', f.key + ' is required'); return { ok: !required, blank: true, value: '' }; }
if (c.clear) return { ok: true, clear: true, value: '' };
var v = c.value, out = v;
if (f.type === 'int') { var n = imbInt_(v); if (n === null) { imbIssue_(issues, sn, row.__row, f.key, 'NOT_INTEGER', f.key + ' must be a whole number', v); return { ok: false }; } out = n; }
else if (f.type === 'decimal') { var d = imbMoney_(v); if (d === null) { imbIssue_(issues, sn, row.__row, f.key, 'NOT_DECIMAL', f.key + ' must be a number with at most 4 decimals', v); return { ok: false }; } out = d; }
else if (f.type === 'date') { var dt = imbDate_(v); if (dt === null) { imbIssue_(issues, sn, row.__row, f.key, 'DATE_INVALID', f.key + ' must be a real date yyyy-MM-dd', v); return { ok: false }; } out = dt; }
else out = imbStr_(v);
if (f.list && L) {
if (f.list === 'status' || f.list === 'marketplace') out = f.list === 'status' ? shiLc_(out) : out;
if (f.list === 'status' && SHI_STATUS_ALIASES_[out]) out = SHI_STATUS_ALIASES_[out];
var hit = shiInList_(L, f.list, out);
if (!hit && f.list === 'marketplace' && shiIsMulti_(out)) hit = shiInList_(L, 'marketplace', 'MULTI');
if (!hit) { if (!(f.list === 'status' && SHI_REFUSED_STATUSES_[out])) imbIssue_(issues, sn, row.__row, f.key, 'REFERENCE_UNKNOWN', f.key + ' is not in the ' + f.list + ' list' + ((L[f.list] || []).length ? '' : ' (the list is empty)'), out); if (!(f.list === 'status' && SHI_REFUSED_STATUSES_[out])) return { ok: false, value: out }; }
else if (hit.status === 'ambiguous') { imbIssue_(issues, sn, row.__row, f.key, 'REFERENCE_AMBIGUOUS', f.key + ' ' + out + ' appears more than once in its master - fix the master first', out); return { ok: false, value: out }; }
}
return { ok: true, value: out };
}

// A fix1 SHTPL1 (Owner 2026-11-20): 確認為不同出貨 -> { ack, raw } or { invalid, raw }. A boolean cell (true / false), or the text TRUE / FALSE
// in any letter case (surrounding spaces ignored); blank = FALSE. Anything else - DISTINCT, 1 / 0, Y / N, [CLEAR] - is invalid.
// The value is compared as text, never converted with Boolean() (Boolean('FALSE') would be true).
function shiAckOf_(row) {
var c = imbCell_(row, 'distinct_shipment_ack');
if (c.absent || c.blank) return { ack: false, raw: '' };
var v0 = row.distinct_shipment_ack;
if (v0 === true) return { ack: true, raw: 'TRUE' };
if (v0 === false) return { ack: false, raw: 'FALSE' };
var s = typeof c.value === 'string' ? c.value.trim().toUpperCase() : '';
if (!c.clear && s === 'TRUE') return { ack: true, raw: 'TRUE' };
if (!c.clear && s === 'FALSE') return { ack: false, raw: 'FALSE' };
return { invalid: true, raw: imbStr_(c.value) };
}

// SHIP-OPEN: status of every import batch (receipt), read once - a shipment row written by a batch that is not COMMITTED is never
// treated as 'already imported' and never made re-addable (SHIPMENT_OPENING_BATCH_UNRESOLVED).
function shiBatchStatuses_(ss) {
var out = {}, S = typeof imbSheets_ === 'function' ? imbSheets_(ss) : null; if (!S) return out;
imbRows_(S.receipts).forEach(function (r) { var id = imbStr_(r.import_batch_id); if (id) out[id] = imbStr_(r.status); });
return out;
}
// SHIP-OPEN R4 (Owner rule 3): reconciliation NEVER blocks. Per destination || sku the preview shows 未對帳 with the data basis time of
// the stock it could be compared with - an overseas 3PL key: the latest COUNT row's apply time (31_ shipReceiptIsCountRow_; a count row
// carries no as-of of its own); an Amazon key: the latest report day of amazon_inventory_snapshot. Nothing is compared, adjusted or refused.
function shiOverseasFacts_(ss) {
var out = {}, mv = shiTable_(ss, 'overseas_inventory_movements');
(mv ? mv.rows : []).forEach(function (r) {
var type = imbStr_(r.movement_type), note = r.note;
var isCount = typeof shipReceiptIsCountRow_ === 'function' ? shipReceiptIsCountRow_(type, note) : (type === 'snapshot_import' || (type === 'inventory_import' && !/^import ADD /.test(imbStr_(note))));
if (!isCount) return;
var k = imbStr_(r.warehouse_id) + '||' + imbStr_(r.sku), x = out[k] = out[k] || { latest: '', untimed: 0 }, t = shiTs_(r.created_at);
if (!t) x.untimed++; else if (t > x.latest) x.latest = t;
});
return out;
}
function shiAmazonFacts_(ss) {
var out = {}; (shiRowsOf_(ss, 'amazon_inventory_snapshot') || []).forEach(function (r) {
var k = [imbStr_(r.company), imbStr_(r.country), imbStr_(r.marketplace), imbStr_(r.sku)].join('|'), x = out[k] = out[k] || { latest: '' }, d = shiDateText_(r.snapshot_date);
if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > x.latest) x.latest = d; });
return out;
}
// SHIP-OPEN R5 (review r4-M1 + Owner G0 read 2026-11-19: the real warehouses carry exactly 3PL / FACTORY / FBA, uppercase): the
// destination warehouse_type must EXACTLY equal a known value (no case folding, no mapping); the set is read from code - the canonical
// warehouse_type set is FBA / 3PL / RETURN / FACTORY (site/assets/js/utils/inventory-compat.js:17); 3PL is the token every overseas
// supply reader matches (supply-planning-allocation-facts.js:60, 43_:551). FBA -> DISPLAY_ONLY (Amazon opening, Owner rule 4);
// 3PL -> COUNTED; FACTORY is refused before this (SHIPMENT_DESTINATION_IS_FACTORY); RETURN, blank and every other spelling
// (AMAZON_FBA, AWD, ...) are refused with a code that names the value - never guessed. The marketplace's fulfillment_model must agree:
// FBA needs platform_fulfilled or hybrid (FBA_FULFILLMENT, allocation-facts.js:52); a platform_fulfilled receiver whose destination is
// not FBA is refused too.
var SHI_DEST_TYPE_MODE_ = { 'FBA': 'DISPLAY_ONLY', '3PL': 'COUNTED' };
function shiSupplyModeOf_(wh, mk) {
var raw = imbStr_(wh && wh.warehouse_type), t = raw, fm = imbStr_(mk && mk.fulfillment_model).toLowerCase();
if (!raw) return { code: 'SHIPMENT_DESTINATION_TYPE_UNKNOWN', message: 'the destination warehouse has no warehouse_type in the master (known: FBA, 3PL) - Amazon (display only) or overseas (counted) cannot be decided; fix the master first' };
if (t === 'FACTORY') return { code: 'SHIPMENT_DESTINATION_IS_FACTORY', message: 'a shipment destination cannot be a factory warehouse (warehouse_type FACTORY)' };
if (t === 'RETURN') return { code: 'SHIPMENT_DESTINATION_TYPE_NOT_ALLOWED', message: 'the destination warehouse_type is ' + raw + ' - an imported in-transit shipment goes to an FBA or 3PL warehouse only' };
var mode = Object.prototype.hasOwnProperty.call(SHI_DEST_TYPE_MODE_, t) ? SHI_DEST_TYPE_MODE_[t] : '';
if (!mode) return { code: 'SHIPMENT_DESTINATION_TYPE_UNKNOWN', message: 'the destination warehouse_type "' + raw + '" is not a known type (known: FBA = Amazon display only, 3PL = overseas counted) - fix the master; the value is never mapped or guessed' };
if (mode === 'DISPLAY_ONLY' && fm && fm !== 'platform_fulfilled' && fm !== 'hybrid') return { code: 'SHIPMENT_OPENING_AMAZON_AMBIGUOUS', message: 'the destination is an FBA warehouse but the marketplace is marked ' + fm + ' in the master - fix the master first (never guessed)' };
// A-delta1 B (Owner 2026-11-21, item C): the platform_fulfilled -> 3PL refusal is REMOVED. Any configured site of the company may receive into a
// same-company ACTIVE 3PL warehouse: COUNTED (in-transit supply, receivable into that 3PL only). FBA stays DISPLAY_ONLY; FACTORY / RETURN / unknown types stay refused.
return { mode: mode };
}

function shiValidateAdd_(ss, req) {
var rti0_ = typeof rtiSplitRequest_ === 'function' ? rtiSplitRequest_(req) : { req: req, choices: {} }; req = rti0_.req;   // STAGE 2 ROUTE_INIT (87_): the five Current Position keys leave the Header rows before the column check
var issues = [], scope = req.scope || {}, db = shiDb_(ss), plan = { mode: 'ADD_NEW', shipments: [] }, prevRows = [], unrec = [];
var co = shiCompanyCheck_(ss, scope.company), company = co.code ? '' : co.company, cut = shiCutoff_(scope.opening_as_of);
var li = shiLists_(ss, company), L = li.lists;
var state = { mode: 'ADD_NEW', company: imbStr_(scope.company), cut: cut, schema: {}, refs: {}, existing: {}, batches: {} };
shiCheckColumns_(req, issues);
if (co.code) imbIssue_(issues, '', '', 'scope.company', co.code, co.message, imbStr_(scope.company));
// A final3 (option A): opening_as_of = the SOURCE data time only (optional; blank = unknown; never the import time). The server import time
// is fixed at the FIRST Validate of a batch (preview.server_scope), carried back by the page as scope.import_time and reused by every later
// Validate / Apply / retry of the same batch id; it is recorded in the batch receipt (scope_key) and the result - never in opening_as_of.
// A file / page that still carries a source time keeps every afinal2 rule for it (format, not in the future, ETD not after it).
var it0_ = imbStr_(scope.import_time), shiMin_ = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(s); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : NaN; };
if (!imbStr_(scope.opening_as_of)) {
if (it0_ && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(it0_)) imbIssue_(issues, '', '', 'scope.import_time', 'IMPORT_TIME_INVALID', 'the batch import time is not valid - choose the file again (a new batch)', it0_);
else if (it0_ && it0_ + ':00' > imbNow_()) imbIssue_(issues, '', '', 'scope.import_time', 'IMPORT_TIME_INVALID', 'the batch import time is in the future - choose the file again (a new batch)', it0_);
else if (it0_ && shiMin_(imbNow_()) - shiMin_(it0_) > 1440) imbIssue_(issues, '', '', 'scope.import_time', 'IMPORT_TIME_EXPIRED', 'this batch was first validated more than 24 hours ago - choose the file again (a new batch)', it0_);
state.import_time = it0_ || imbNow_().slice(0, 16); }
else if (!cut) imbIssue_(issues, '', '', 'scope.opening_as_of', 'OPENING_CUTOFF_INVALID', '資料時間 must be yyyy-MM-dd HH:mm (' + shiTz_() + ')', scope.opening_as_of);
else if (cut + ':00' > imbNow_()) imbIssue_(issues, '', '', 'scope.opening_as_of', 'OPENING_CUTOFF_IN_FUTURE', '資料時間 ' + cut + ' (' + shiTz_() + ') is in the future', cut);
// the file's own metadata (written at Download) must name the same company, mode, cut-off and template version as this dialog
var fm = req.file_meta, fsc = null;
if (!fm) imbIssue_(issues, '', '', '_SYSTEM', 'IMPORT_FILE_META_MISSING', 'the file carries no template metadata (_SYSTEM) - download the template from this dialog and fill that file');
else {
try { fsc = JSON.parse(imbStr_(fm.scope) || '{}'); } catch (eS) { fsc = null; }
if (!fsc || typeof fsc !== 'object') imbIssue_(issues, '', '', '_SYSTEM.scope', 'IMPORT_FILE_META_INVALID', 'the file metadata scope cannot be read - download a new template');
else if (imbStr_(fsc.preparation_only)) imbIssue_(issues, '', '', '_SYSTEM.scope.preparation_only', 'IMPORT_FILE_PREPARATION_ONLY', '準備用：不可上傳 Apply - this is a PREPARATION template (no cut-off decided); download the real template from the import dialog and copy the rows into it', imbStr_(fsc.preparation_only));
else {
if (imbStr_(fsc.company) !== imbStr_(scope.company)) imbIssue_(issues, '', '', '_SYSTEM.scope.company', 'IMPORT_FILE_SCOPE_MISMATCH', 'the file was downloaded for company ' + (imbStr_(fsc.company) || 'blank') + ', the dialog says ' + (imbStr_(scope.company) || 'blank'), imbStr_(fsc.company));
if (shiCutoff_(fsc.opening_as_of) !== cut) imbIssue_(issues, '', '', '_SYSTEM.scope.opening_as_of', 'IMPORT_FILE_SCOPE_MISMATCH', 'the file was downloaded for cut-off ' + (imbStr_(fsc.opening_as_of) || 'blank') + ', the dialog says ' + (cut || 'blank'), imbStr_(fsc.opening_as_of));
// A fix1 SHTPL1: an Add New file downloaded before this contract (DISTINCT token; ETA / Reference ID / Shipping method optional) is refused, never reinterpreted
if (imbStr_(fsc.template_contract) !== SHI_ADD_CONTRACT_) imbIssue_(issues, '', '', '_SYSTEM.scope.template_contract', 'IMPORT_FILE_TEMPLATE_OUTDATED', 'this Add New file was downloaded from an older template (' + (imbStr_(fsc.template_contract) || 'no contract mark') + '); this server reads ' + SHI_ADD_CONTRACT_ + ' (確認為不同出貨 = TRUE / FALSE; ETA, Reference ID and Shipping method required). Download a new template from this dialog and copy the rows into it - nothing in the old file is reinterpreted', imbStr_(fsc.template_contract));
}
if (imbStr_(fm.mode) !== 'ADD_NEW') imbIssue_(issues, '', '', '_SYSTEM.mode', 'IMPORT_FILE_SCOPE_MISMATCH', 'the file is a ' + (imbStr_(fm.mode) || 'blank') + ' file, not Add New', imbStr_(fm.mode));
if (imbStr_(fm.template_version) !== SHI_SCHEMA_VERSION_) imbIssue_(issues, '', '', '_SYSTEM.template_version', 'IMPORT_FILE_SCOPE_MISMATCH', 'the file is template ' + (imbStr_(fm.template_version) || 'blank') + '; this server reads ' + SHI_SCHEMA_VERSION_, imbStr_(fm.template_version));
}
[['shipments', db.sh], ['shipment_lines', db.ln]].forEach(function (p) {
var miss = !p[1] ? ['(sheet)'] : SHI_NEW_COLUMNS_[p[0]].filter(function (k) { return !p[1].has(k); });
state.schema[p[0]] = miss;
if (miss.length) imbIssue_(issues, '', '', p[0] + '.' + miss.join(','), 'SHIPMENT_IMPORT_SCHEMA_MISSING', 'the ' + p[0] + ' sheet lacks the opening-record column(s) ' + miss.join(', ') + ' - an approved schema change adds them; nothing is auto-created');
});
li.unreadable.forEach(function (t) { imbIssue_(issues, '', '', t, 'SHIPMENT_MASTER_UNREADABLE', 'the ' + t + ' master could not be read - nothing was checked against it'); });
var whBy = Object.create(null); /* A final2 (MINOR-6): a warehouse id named like an Object.prototype key is a plain key */ (shiRowsOf_(ss, 'warehouses') || []).forEach(function (r) { var id = imbStr_(r.warehouse_id); if (id) (whBy[id] = whBy[id] || []).push(r); });
var mkRows = shiRowsOf_(ss, 'marketplaces') || [];
var crcAll_ = shiRowsOf_(ss, 'carrier_rate_cards');   // A-delta1 B (P0-2): Carrier + label -> (shipping_method, last_mile_delivery)
if (!crcAll_) imbIssue_(issues, '', '', 'carrier_rate_cards', 'SHIPMENT_MASTER_UNREADABLE', 'the carrier_rate_cards master could not be read - Shipping method cannot be resolved');
var batchSt = shiBatchStatuses_(ss);
// existing shipments of THIS company by external number (another company's same number is a different shipment - Owner Q5)
var exByExt = {}, histSig = {};
(db.sh ? db.sh.rows : []).forEach(function (r) { if (!company || imbStr_(r.company) !== company) return; var x = imbStr_(r.external_shipment_id).toLowerCase(); if (x) (exByExt[x] = exByExt[x] || []).push(r); });
function sigOf(dst, mk, etd, lines) { return [dst, mk, etd, lines.map(function (l) { return l[0] + ':' + l[1]; }).sort().join(',')].join('|'); }
function linesOfDb(sid) { return (db.linesBy[sid] || []).filter(function (l) { return shiLc_(l.line_status) !== 'cancelled' && shiLc_(l.line_status) !== 'removed'; }).map(function (l) { return [imbStr_(l.sku), Number(l.shipment_qty) || 0]; }); }
(db.sh ? db.sh.rows : []).forEach(function (r) { if (!company || imbStr_(r.company) !== company || imbStr_(r.record_origin) !== SHI_ORIGIN_HISTORICAL_) return;
histSig[sigOf(imbStr_(r.destination_warehouse_id), imbStr_(r.marketplace), shiDateText_(r.etd), linesOfDb(imbStr_(r.shipment_id)))] = r; });
// R4 (review M1): the company's LIVE (system-created) shipments still in transit, by destination + receiver + the remaining quantity of every
// SKU - an opening row with exactly that content is the same goods re-entered under another number (e.g. a forwarder number)
var LIVE_OPEN_ = { shipped: 1, in_transit: 1, arrived: 1, partially_received: 1, partial_received: 1 }, liveSig = {}, liveList = [];
(db.sh ? db.sh.rows : []).forEach(function (r) { if (!company || imbStr_(r.company) !== company || imbStr_(r.record_origin) === SHI_ORIGIN_HISTORICAL_ || !LIVE_OPEN_[shiLc_(r.status)]) return;
var ls = (db.linesBy[imbStr_(r.shipment_id)] || []).filter(function (l) { return shiLc_(l.line_status) !== 'cancelled' && shiLc_(l.line_status) !== 'removed'; }).map(function (l) { return [imbStr_(l.sku), Math.max(0, (Number(l.shipment_qty) || 0) - (Number(l.shipment_received_qty) || 0))]; }).filter(function (x) { return x[1] > 0; });
if (ls.length) { liveSig[[imbStr_(r.destination_warehouse_id), imbStr_(r.marketplace), ls.map(function (l) { return l[0] + ':' + l[1]; }).sort().join(',')].join('|')] = r;
liveList.push({ r: r, dst: imbStr_(r.destination_warehouse_id), mk: imbStr_(r.marketplace), skus: ls.map(function (l) { return l[0]; }) }); } });
var heads = {}, order = [];
(req.sheets.Header || []).forEach(function (r) {
var sn = 'Header', rowIssues = issues.length, h = { row: r.__row, lines: [], warnings: [] };
shiFields_(sn).forEach(function (f) {
if (f.add !== 'no' || f.key === 'warehouse_code') return;
var c = imbCell_(r, f.key); if (c.absent || c.blank) return;
imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_IMPORTABLE', f.key + (f.kind === 'scope' ? ' is chosen once in the import dialog, not per row' : ' is not part of this import (set by the server, or a logistics date this import does not record)') + '; leave it blank / remove the column', c.value);
});
var rawMk = imbCell_(r, 'marketplace'), multi = !rawMk.absent && !rawMk.blank && shiIsMulti_(rawMk.value);
if (multi) imbIssue_(issues, sn, r.__row, 'marketplace', 'SHIPMENT_OPENING_MULTI_NOT_ALLOWED', 'an imported shipment names ONE receiver; MULTI is refused', rawMk.value);
var v = {};
shiFields_(sn).forEach(function (f) {
if (f.add === 'no') return;
if (f.key === 'marketplace' && multi) { v.marketplace = imbStr_(rawMk.value); return; }
if (f.key === 'distinct_shipment_ack') { var a0 = shiAckOf_(r); h.ack0 = a0; v.distinct_shipment_ack = a0.raw; return; }
if (f.key === 'shipping_method') {   // A final S1: label / token / 'token | ...' -> the canonical token; a shared label is refused, never first-match
var mc = imbCell_(r, 'shipping_method'); h.methodRaw = mc.absent ? '' : imbStr_(mc.value); if (!h.methodRaw) { imbIssue_(issues, sn, r.__row, 'shipping_method', 'REQUIRED', 'Shipping method (the carrier\'s rate-card label) is required'); } v.shipping_method = ''; return;   // A-delta1 B: resolved after the destination checks
var mr = li.methods.resolve(mc.absent ? '' : mc.value);
if (mr.blank) { if (f.add === 'req') imbIssue_(issues, sn, r.__row, 'shipping_method', 'REQUIRED', 'shipping_method is required'); v.shipping_method = ''; return; }
if (mr.ambiguous) { imbIssue_(issues, sn, r.__row, 'shipping_method', 'SHIPPING_METHOD_LABEL_AMBIGUOUS', 'Shipping method "' + mr.value + '" names more than one method in carrier_rate_cards' + (mr.candidates.length ? ' (' + mr.candidates.join(', ') + ')' : '') + ' - pick the entry that carries the method in brackets; nothing is guessed', mr.value); v.shipping_method = mr.value; return; }
if (mr.unknown) { imbIssue_(issues, sn, r.__row, 'shipping_method', 'REFERENCE_UNKNOWN', 'shipping_method is not in the shipping_method list' + (li.methods.entries.length ? '' : ' (the list is empty)'), mr.value); v.shipping_method = mr.value; return; }
v.shipping_method = mr.token; h.methodLabel = mr.label || ''; return;
}   // A fix1: TRUE / FALSE, judged below with the suspicion
var wh = f.key === 'source_warehouse_id' || f.key === 'destination_warehouse_id';
var t = shiTyped_(f, r, issues, sn, wh ? null : L, f.add === 'req');
if (f.key === 'note' && /\[SC13_/.test(String(t.value == null ? '' : t.value))) { imbIssue_(issues, sn, r.__row, 'note', 'IMPORT_LINEAGE_MARKER_PROTECTED', 'a note may not contain a system marker [SC13_...] - remove it', ''); return; }
if (t.clear) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_CLEARABLE', '[CLEAR] has no meaning on Add New'); return; }
v[f.key] = t.ok ? t.value : (t.value === undefined ? '' : t.value);
});
if (v.etd && cut && v.etd > cut.slice(0, 10)) imbIssue_(issues, sn, r.__row, 'etd', 'SHIPMENT_SHIPPED_AFTER_CUTOFF', 'ETD ' + v.etd + ' is after 資料時間 ' + cut, v.etd);
else if (v.etd && !cut && state.import_time && v.etd > state.import_time.slice(0, 10)) imbIssue_(issues, sn, r.__row, 'etd', 'SHIPMENT_ETD_AFTER_IMPORT_TIME', 'ETD ' + v.etd + ' is after the import time ' + state.import_time, v.etd);   // A final3 (c): the batch time
if (v.etd && v.eta && v.etd > v.eta) imbIssue_(issues, sn, r.__row, 'eta', 'SHIPMENT_DATES_CONTRADICT', 'eta is before the source warehouse departure date', v.eta);
if (!v.eta) h.warnings.push({ code: 'SHIPMENT_ETA_UNKNOWN', message: 'ETA unknown: shown as unknown and not dated (never guessed)' });
var mk0 = null;
if (company && v.country && v.marketplace && !multi) { mk0 = mkRows.filter(function (m) { return imbStr_(m.company) === company && imbStr_(m.country) === v.country && imbStr_(m.marketplace) === v.marketplace; })[0] || null;
if (!mk0) imbIssue_(issues, sn, r.__row, 'marketplace', 'SHIPMENT_RECEIVER_UNKNOWN', 'no marketplace ' + [company, v.country, v.marketplace].join(' / ') + ' in the marketplaces master'); }
// A final S3: the warehouse id is the identity. A cell that is not an exact id but reads '<id> | <any label>' (the system dropdown text, also
// when the label was renamed, cut or re-typed) is read by its id part ONLY when that part is an exact warehouse_id; every check below
// (unknown / duplicate / factory / inactive / company / type) then runs on that id. No name matching.
['source_warehouse_id', 'destination_warehouse_id'].forEach(function (k) { var x = imbStr_(v[k]); if (!x || whBy[x]) return; var i = x.indexOf(' | '); if (i > 0 && whBy[x.slice(0, i).trim()]) v[k] = x.slice(0, i).trim(); });
var src = whBy[v.source_warehouse_id] || [], dst = whBy[v.destination_warehouse_id] || [];
if (v.source_warehouse_id) {
if (!src.length) imbIssue_(issues, sn, r.__row, 'source_warehouse_id', 'REFERENCE_UNKNOWN', 'no warehouse ' + v.source_warehouse_id, v.source_warehouse_id);
else if (src.length > 1) imbIssue_(issues, sn, r.__row, 'source_warehouse_id', 'REFERENCE_AMBIGUOUS', 'warehouse ' + v.source_warehouse_id + ' appears more than once - fix the master first', v.source_warehouse_id);
else { var srcIssue = shiSourceWhIssue_(src[0], company); if (srcIssue) imbIssue_(issues, sn, r.__row, 'source_warehouse_id', srcIssue.code, srcIssue.message, v.source_warehouse_id); }
}
if (v.destination_warehouse_id) {
if (!dst.length) imbIssue_(issues, sn, r.__row, 'destination_warehouse_id', 'REFERENCE_UNKNOWN', 'no warehouse ' + v.destination_warehouse_id, v.destination_warehouse_id);
else if (dst.length > 1) imbIssue_(issues, sn, r.__row, 'destination_warehouse_id', 'REFERENCE_AMBIGUOUS', 'warehouse ' + v.destination_warehouse_id + ' appears more than once - fix the master first', v.destination_warehouse_id);
else {
var d0 = dst[0];
if (shiIsFactoryWh_(d0)) imbIssue_(issues, sn, r.__row, 'destination_warehouse_id', 'SHIPMENT_DESTINATION_IS_FACTORY', 'a shipment destination cannot be a factory warehouse', v.destination_warehouse_id);
else if (!imbStr_(d0.company)) imbIssue_(issues, sn, r.__row, 'destination_warehouse_id', 'SHIPMENT_DESTINATION_COMPANY_UNKNOWN', 'the destination warehouse has no company in the master - its owner is never guessed', v.destination_warehouse_id);
else if (company && imbStr_(d0.company) !== company) imbIssue_(issues, sn, r.__row, 'destination_warehouse_id', 'SHIPMENT_DESTINATION_COMPANY_MISMATCH', 'the destination warehouse belongs to ' + imbStr_(d0.company) + ', the import to ' + company, v.destination_warehouse_id);
else if (!shiActive_(d0)) imbIssue_(issues, sn, r.__row, 'destination_warehouse_id', 'SHIPMENT_DESTINATION_INACTIVE', 'goods still on the way cannot go to an inactive warehouse', v.destination_warehouse_id);
else if (v.country && !shiDestCountryOk_(d0, v.country)) imbIssue_(issues, sn, r.__row, 'destination_warehouse_id', 'SHIPMENT_DESTINATION_COUNTRY_MISMATCH', 'the destination warehouse is in ' + (imbStr_(d0.country) || '(no country in the master)') + ', the row country is ' + v.country + ' - destination must match the country or its shipping region (EU member countries only for EU)', v.destination_warehouse_id);
else { var sm = shiSupplyModeOf_(d0, mk0); if (sm.code) imbIssue_(issues, sn, r.__row, 'destination_warehouse_id', sm.code, sm.message, v.destination_warehouse_id); else h.mode = sm.mode; }
h.warehouse_code = imbStr_(d0.warehouse_code); state.refs['wh:' + v.destination_warehouse_id] = d0;
}
if (v.source_warehouse_id === v.destination_warehouse_id) imbIssue_(issues, sn, r.__row, 'destination_warehouse_id', 'SHIPMENT_SOURCE_EQUALS_DESTINATION', 'source and destination are the same warehouse', v.destination_warehouse_id);
}
if (src.length === 1) state.refs['wh:' + v.source_warehouse_id] = src[0];
if (v.carrier_id) { var carHit_ = shiInList_(L, 'carrier', v.carrier_id); if (carHit_ && carHit_.status === 'inactive') imbIssue_(issues, sn, r.__row, 'carrier_id', 'SHIPMENT_CARRIER_INACTIVE', 'carrier ' + v.carrier_id + ' is inactive in the carriers master - an Add New shipment is refused for it', v.carrier_id); }
if (h.methodRaw && v.carrier_id && crcAll_) { v.shipping_method = h.methodRaw; h.tupleQ = { lm: imbStr_(v.last_mile_delivery) /* AD3-B */, carrier: v.carrier_id, text: h.methodRaw, country: shiDeliveryCountry_(v.country, dst), whCode: h.warehouse_code || '', day: v.etd || '', origin: src.length === 1 ? imbStr_(src[0].country) : '', marketplace: multi ? '' : imbStr_(v.marketplace) }; }   // b3 M-3: resolved after the Lines (the battery class needs the SKUs)
h.v = v; h.ext = imbStr_(v.external_shipment_id); h.key = h.ext.toLowerCase();
// R4 (Owner rule 1): ONE external number = ONE shipment = ONE destination. A second row with the same number is refused.
if (h.ext) {
if (heads[h.key]) imbIssue_(issues, sn, r.__row, 'external_shipment_id', 'SHIPMENT_EXTERNAL_ID_DUPLICATE_IN_FILE', 'external number ' + h.ext + ' is already on row ' + heads[h.key].row + ' - one number is one shipment with one destination (no split, no transfer)', h.ext);
else { heads[h.key] = h; order.push(h.key); }
}
h.bad = issues.length > rowIssues;
});
(req.sheets.Lines || []).forEach(function (r) {
var sn = 'Lines';
shiFields_(sn).forEach(function (f) { if (f.add !== 'no') return; var c = imbCell_(r, f.key); if (!c.absent && !c.blank) imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_IMPORTABLE', f.key + ' is not part of this import (' + (f.key === 'shipment_qty' || f.key === 'shipment_received_qty' ? 'type only 在途中數量 (opening_remaining_qty)' : 'set by the server or not used') + '); leave it blank / remove the column', c.value); });
var ext = imbStr_(imbCell_(r, 'external_shipment_id').value), h = ext ? heads[ext.toLowerCase()] : null;
if (!ext) imbIssue_(issues, sn, r.__row, 'external_shipment_id', 'REQUIRED', 'external_shipment_id is required (the Header row this line belongs to)');
else if (!h) imbIssue_(issues, sn, r.__row, 'external_shipment_id', 'SHIPMENT_LINE_ORPHAN', 'no Header row has the external number ' + ext, ext);
var v = {};
shiFields_(sn).forEach(function (f) { if (f.add !== 'req' && f.add !== 'opt') return; var t = shiTyped_(f, r, issues, sn, L, f.add === 'req');
if (f.key === 'note' && /\[SC13_/.test(String(t.value == null ? '' : t.value))) { imbIssue_(issues, sn, r.__row, 'note', 'IMPORT_LINEAGE_MARKER_PROTECTED', 'a note may not contain a system marker [SC13_...] - remove it', ''); return; }
if (t.clear) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_CLEARABLE', '[CLEAR] has no meaning on Add New'); return; } v[f.key] = t.ok ? t.value : ''; });
var skuHit = v.sku ? shiInList_(L, 'sku', v.sku) : null;
if (skuHit && skuHit.status === 'inactive') imbIssue_(issues, sn, r.__row, 'sku', 'SHIPMENT_SKU_INACTIVE', 'SKU ' + v.sku + ' is inactive in sku_details - fix the master or leave it out', v.sku);
var q = v.opening_remaining_qty;
if (q !== '' && q !== undefined && q <= 0) imbIssue_(issues, sn, r.__row, 'opening_remaining_qty', 'OPENING_REMAINING_NOT_POSITIVE', '在途中數量 (opening_remaining_qty) must be a whole number greater than 0 (a line with nothing on the way is not an imported shipment)', q);
if (h) h.lines.push({ row: r.__row, v: v });
prevRows.push({ sheet: sn, row: r.__row, key: ext, action: 'create', sku: v.sku || '', opening_remaining_qty: q });
});
var unchanged = 0, overseas = shiOverseasFacts_(ss), amazon = shiAmazonFacts_(ss), fileSig = {};
var rcSs_ = shiMemoSs_(ss);   // b3 M-3: one read of carrier_rate_cards / sku_details per request, whatever the row count
order.forEach(function (k0) {
var h = heads[k0];
if (h.tupleQ) { var tq_ = h.tupleQ; tq_.skus = h.lines.map(function (l) { return imbStr_(l.v.sku); }).filter(Boolean); var tu_ = shiExplicitService_(rcSs_, crcAll_, tq_) || shiResolveTuple_(rcSs_, crcAll_, tq_);   // AD3-B: an explicit method token + last mile first; else the c2 label layers
  if (tu_.ok && !tu_.explicit && tq_.lm && tu_.lastMile !== tq_.lm) tu_ = { ok: false, code: 'SHIPPING_LAST_MILE_CONFLICT', message: 'Shipping method "' + tq_.text + '" resolves to ' + tu_.method + ' + ' + tu_.lastMile + ', but Last mile says ' + tq_.lm + ' - nothing is guessed (type the method token for an explicit service, or leave Last mile blank)', quote_status: tu_.quote_status, quote_reason: tu_.quote_reason };
  if (tu_.ok) { h.v.shipping_method = tu_.method; h.v.last_mile_delivery = tu_.lastMile; h.methodLabel = tu_.label; h.methodResolution = tu_.provenance; h.quote = { status: tu_.quote_status, reason: tu_.quote_reason || '', message: tu_.quote_message || '' };
    state.method_tuples = state.method_tuples || {}; state.method_tuples['row' + h.row] = [tu_.method, tu_.lastMile, tu_.quote_status].concat(tu_.provenance.rate_card_ids, tu_.provenance.evidence || []); }   // in the preview digest - a rate-card / service-evidence change between Validate and Apply refuses (IMPORT_PREVIEW_STALE)
  else { imbIssue_(issues, 'Header', h.row, 'shipping_method', tu_.code, tu_.message, h.methodRaw); h.serviceError = tu_.code; if (tu_.quote_status) h.quote = { status: tu_.quote_status, reason: tu_.quote_reason || '', message: '' }; } }
  else if (h.methodRaw && h.v.carrier_id) h.serviceError = 'SHIPPING_SERVICE_NOT_EVALUATED';   // no carrier: 87_ answers ROUTE_INIT_CARRIER_REQUIRED itself
if (!h.lines.length) imbIssue_(issues, 'Header', h.row, 'external_shipment_id', 'SHIPMENT_NO_LINES', 'a shipment needs at least one line', h.ext);
var seen = {}; h.lines.forEach(function (l) { if (!l.v.sku) return; if (seen[l.v.sku]) imbIssue_(issues, 'Lines', l.row, 'sku', 'SHIPMENT_LINE_DUPLICATE', 'SKU ' + l.v.sku + ' is already on row ' + seen[l.v.sku] + ' of this shipment - one SKU is one line', l.v.sku); seen[l.v.sku] = l.row; });
var sig = sigOf(imbStr_(h.v.destination_warehouse_id), imbStr_(h.v.marketplace), h.v.etd || '', h.lines.map(function (l) { return [imbStr_(l.v.sku), Number(l.v.opening_remaining_qty) || 0]; }));
// R5 (Owner item 3): identical content under ANOTHER external number is a SUSPECTED duplicate, not proof. It blocks Apply unless this
// Header row carries distinct_shipment_ack = DISTINCT and a distinct_shipment_reason (>= 5 characters); the server then records the
// acknowledgement and reason in the import audit (shiApplyAdd_). Dates and quantities never have to be changed to get past it.
var sus = [];
if (fileSig[sig]) sus.push({ kind: 'FILE', against: 'row ' + fileSig[sig].row + ' (' + fileSig[sig].ext + ')', text: 'row ' + fileSig[sig].row + ' (' + fileSig[sig].ext + ') in this file has the same destination, receiver, factory ship date and exactly the same SKU quantities' });
else fileSig[sig] = h;
var ls0 = liveSig[[imbStr_(h.v.destination_warehouse_id), imbStr_(h.v.marketplace), h.lines.map(function (l) { return imbStr_(l.v.sku) + ':' + (Number(l.v.opening_remaining_qty) || 0); }).sort().join(',')].join('|')];
if (ls0) sus.push({ kind: 'LIVE', against: imbStr_(ls0.shipment_no), text: 'shipment ' + imbStr_(ls0.shipment_no) + ' (' + (imbStr_(ls0.external_shipment_id) || 'no external number') + ', ' + imbStr_(ls0.status) + ') already in the system has the same destination and exactly these remaining quantities - if it is the same goods they would be counted twice' });
var hs = histSig[sig];
if (hs && imbStr_(hs.external_shipment_id).toLowerCase() !== h.key) sus.push({ kind: 'OPENING', against: imbStr_(hs.shipment_no), text: 'imported shipment ' + imbStr_(hs.shipment_no) + ' (' + imbStr_(hs.external_shipment_id) + ') already has the same destination, receiver, ship date and lines' });
// A fix1 SHTPL1 (Owner 2026-11-20): 確認為不同出貨 is TRUE / FALSE (shiAckOf_); TRUE is an explicit acknowledgement that still needs the reason,
// FALSE and blank never acknowledge, any other value (the old DISTINCT token included) is refused. The suspicion checks and the audit are unchanged.
var ack = h.ack0 || { ack: false, raw: '' }, ackR = imbStr_(h.v.distinct_shipment_reason);
if (ack.invalid) imbIssue_(issues, 'Header', h.row, 'distinct_shipment_ack', 'DISTINCT_SHIPMENT_ACK_INVALID', '確認為不同出貨 accepts only TRUE or FALSE (blank = FALSE)' + (ack.raw.toUpperCase() === 'DISTINCT' ? ' - DISTINCT belongs to an older template; download a new template' : ''), ack.raw);
else if (ack.ack && ackR.length < 5) imbIssue_(issues, 'Header', h.row, 'distinct_shipment_reason', 'DISTINCT_SHIPMENT_REASON_REQUIRED', '確認為不同出貨 = TRUE needs 不同出貨原因 of at least 5 characters (it is recorded in the import audit)', ackR);
if (sus.length) {
h.suspected = sus.map(function (x) { return { kind: x.kind, against: x.against }; });
if (ack.ack === true && !ack.invalid && ackR.length >= 5) { h.ack = { reason: ackR, against: h.suspected }; h.warnings.push({ code: 'SHIPMENT_OPENING_SUSPECTED_DUPLICATE_ACKNOWLEDGED', message: 'SUSPECTED_DUPLICATE acknowledged as a different shipment: ' + sus.map(function (x) { return x.text; }).join('; ') + ' - reason recorded in the audit: ' + ackR }); }
else imbIssue_(issues, 'Header', h.row, 'external_shipment_id', 'SHIPMENT_OPENING_SUSPECTED_DUPLICATE', 'SUSPECTED_DUPLICATE: ' + sus.map(function (x) { return x.text; }).join('; ') + '. If this really is a different shipment, set 確認為不同出貨 = TRUE and write the reason in 不同出貨原因 on this row (recorded in the audit); otherwise remove the row. Do not change dates or quantities to get around this.', h.ext);
}
// R5 (review r4 delta): a LIVE shipment of this company to the same destination + receiver that shares some SKUs (but not exactly
// this content) is a non-blocking warning - the opening may overlap goods already in the system.
var skuSet = {}; h.lines.forEach(function (l) { if (l.v.sku) skuSet[imbStr_(l.v.sku)] = 1; });
liveList.forEach(function (x) { if (x.r === ls0 || x.dst !== imbStr_(h.v.destination_warehouse_id) || x.mk !== imbStr_(h.v.marketplace)) return;
var shared = x.skus.filter(function (s) { return skuSet[s]; }); if (!shared.length) return;
h.warnings.push({ code: 'SHIPMENT_OPENING_LIVE_OVERLAP_SUSPECTED', message: 'SUSPECTED overlap (not blocking): live shipment ' + imbStr_(x.r.shipment_no) + ' (' + (imbStr_(x.r.external_shipment_id) || 'no external number') + ', ' + imbStr_(x.r.status) + ') to the same destination still carries SKU ' + shared.join(', ') + ' - check that the quantity on the way does not include those goods' }); });
// 未對帳 + data basis time (information only; never blocks, never adjusts)
h.lines.forEach(function (l) { if (!l.v.sku || !h.v.destination_warehouse_id || !h.mode) return;
var fba = h.mode === 'DISPLAY_ONLY', k = fba ? [company, h.v.country, h.v.marketplace, l.v.sku].map(imbStr_).join('|') : imbStr_(h.v.destination_warehouse_id) + '||' + imbStr_(l.v.sku);
if (unrec.some(function (u) { return u.key === k; }) || unrec.length >= 200) return;
var x = fba ? amazon[k] : overseas[k];
unrec.push({ key: k, code: 'OPENING_UNRECONCILED', label: '未對帳', stock_source: fba ? 'amazon_inventory_snapshot (report day)' : 'overseas_inventory count (apply time)', stock_basis_time: (x && x.latest) || '', stock_basis_untimed: !!(x && x.untimed), opening_basis_time: cut,
message: (fba ? 'Amazon ' : '3PL ') + k + ': 未對帳 - stock basis ' + ((x && x.latest) || 'none recorded') + (x && x.untimed ? ' (+ rows without a time)' : '') + ', 資料時間 ' + (cut || '未提供') + '. Nothing is compared or adjusted.' });
});
});
// existing records with the same company + external number (Owner Q5: dedup scope = company + external number)
order.forEach(function (k0) {
var h = heads[k0], ex = exByExt[k0] || [];
state.existing[k0] = ex.map(function (r) { return [imbStr_(r.shipment_id), shiRowVersion_(db, imbStr_(r.shipment_id))]; });
if (!ex.length) return;
var live = ex.filter(function (r) { return imbStr_(r.record_origin) !== SHI_ORIGIN_HISTORICAL_; });
if (live.length) { imbIssue_(issues, 'Header', h.row, 'external_shipment_id', 'SHIPMENT_EXTERNAL_ID_EXISTS_LIVE', 'company ' + company + ' already has shipment ' + live.map(function (r) { return imbStr_(r.shipment_no) + ' (' + imbStr_(r.status) + ')'; }).join(', ') + ' with this number - importing it again would count the same goods twice', h.ext); return; }
var open = ex.filter(function (r) { var b = imbStr_(r.import_batch_id); state.batches[b] = batchSt[b] || ''; return batchSt[b] !== 'COMMITTED'; });
var eff = open.filter(function (r) { return !shiIsPending_(r) && imbStr_(r.status) !== ''; });   // r5.2 (Owner): effective rows of a batch whose receipt is not COMMITTED
if (open.length && eff.length === open.length) { imbIssue_(issues, 'Header', h.row, 'external_shipment_id', 'SHIPMENT_OPENING_AWAITING_MANUAL_RECONCILIATION', 'imported shipment ' + eff.map(function (r) { return imbStr_(r.shipment_no); }).join(', ') + ' with this number is EFFECTIVE (in transit, counted once) but its batch ' + imbStr_(open[0].import_batch_id) + ' receipt reads ' + (batchSt[imbStr_(open[0].import_batch_id)] || 'missing') + ' - it awaits manual reconciliation; nothing is added again and nothing is deleted (read that batch: Check this batch)', h.ext); return; }
if (open.length) { imbIssue_(issues, 'Header', h.row, 'external_shipment_id', 'SHIPMENT_OPENING_BATCH_UNRESOLVED', 'imported shipment ' + open.map(function (r) { return imbStr_(r.shipment_no); }).join(', ') + ' with this number was written by batch ' + imbStr_(open[0].import_batch_id) + ' whose receipt reads ' + (batchSt[imbStr_(open[0].import_batch_id)] || 'missing') + ' - read that batch (reconcile) first; nothing is added again', h.ext); return; }
var er = ex[0];
// R4 (Owner rule 1): same company + same number with another destination is never a second shipment / a split / a transfer
if (ex.length > 1 || imbStr_(er.destination_warehouse_id) !== imbStr_(h.v.destination_warehouse_id) || imbStr_(er.marketplace) !== imbStr_(h.v.marketplace)) {
imbIssue_(issues, 'Header', h.row, 'destination_warehouse_id', 'SHIPMENT_EXTERNAL_ID_DESTINATION_CONFLICT', 'number ' + h.ext + ' is already imported for ' + ex.map(function (r) { return imbStr_(r.marketplace) + ' -> ' + imbStr_(r.destination_warehouse_id) + ' (' + imbStr_(r.shipment_no) + ')'; }).join(', ') + '; the file says ' + imbStr_(h.v.marketplace) + ' -> ' + imbStr_(h.v.destination_warehouse_id) + ' - one number has one destination (no split, rename or transfer)', h.ext); return; }
var diffs = [];
['country', 'source_warehouse_id', 'etd', 'eta', 'reference_id', 'carrier_id', 'shipping_method', 'booking_no', 'master_tracking_number', 'tracking_number', 'container_no', 'bl_no', 'invoice_no', 'note'].forEach(function (k) {
var f = shiField_('Header', k), a = shiShow_(f, er[k]), b = shiShow_(f, h.v[k] === undefined ? '' : h.v[k]); if (k === 'eta' && b === '' && a !== '') return;   /* R4 m1: an ETA filled later by Update is not contradicted by the original blank */ if (a !== b) diffs.push({ field: k, existing: a, file: b }); });
if (shiCutoff_(er.opening_as_of) !== cut) diffs.push({ field: 'opening_as_of', existing: shiCutoff_(er.opening_as_of) || imbStr_(er.opening_as_of), file: cut });
var el = {}; linesOfDb(imbStr_(er.shipment_id)).forEach(function (l) { el[l[0]] = l[1]; }); var fl = {}; h.lines.forEach(function (l) { fl[imbStr_(l.v.sku)] = Number(l.v.opening_remaining_qty) || 0; });
Object.keys(el).concat(Object.keys(fl)).filter(function (k, i, a) { return a.indexOf(k) === i; }).sort().forEach(function (s) { if (el[s] !== fl[s]) diffs.push({ field: 'line ' + s + ' opening_remaining_qty', existing: el[s] === undefined ? '(no line)' : String(el[s]), file: fl[s] === undefined ? '(no line)' : String(fl[s]) }); });
if (diffs.length) { h.conflict = diffs; imbIssue_(issues, 'Header', h.row, 'external_shipment_id', 'SHIPMENT_OPENING_CONFLICT', 'already imported as ' + imbStr_(er.shipment_no) + ' with different data: ' + diffs.slice(0, 10).map(function (d) { return d.field + ' ' + (d.existing || '(blank)') + ' -> ' + (d.file || '(blank)'); }).join('; '), h.ext); }
else { h.unchanged = imbStr_(er.shipment_no); unchanged++; }
});
if (typeof rtiValidateAdd_ === 'function') rtiValidateAdd_(ss, heads, order, rti0_.choices, issues, state);   // STAGE 2 ROUTE_INIT (87_): candidates for every header + the chosen positions checked (Validate and Apply)
// A-delta2: a row whose tracking service did not resolve has NO route evaluation - its route state names the service error (never a misleading
// ROUTE_INIT_NO_TEMPLATE computed from the raw label text). A row with a resolved service keeps 87_'s own route answer (a template, or e.g.
// ROUTE_INIT_NO_TEMPLATE / ROUTE_INIT_DESTINATION_INVALID - a ROUTE error, never a quote error).
// 87_ answers that do not depend on the method (carrier missing, source country unknown, destination invalid, row incomplete) are kept as they are.
order.forEach(function (k0) { var h = heads[k0]; if (h.serviceError && h.routeInfo && !/^ROUTE_INIT_(CARRIER_REQUIRED|SOURCE_COUNTRY_UNKNOWN|DESTINATION_INVALID|ROW_INCOMPLETE)/.test(String(h.routeInfo.reason || ''))) h.routeInfo = { status: 'NONE', reason: 'SHIPPING_SERVICE_UNRESOLVED: ' + h.serviceError, candidates: [], chosen: null, origin_undeclared: [], origin_excluded: [] }; });
var rejected = {}; issues.forEach(function (i) { if (i.sheet && i.row) rejected[i.sheet + ':' + i.row] = 1; });
var incoming = {}, display = {}, nLines = 0;
order.forEach(function (k0) {
var h = heads[k0];
prevRows.push({ sheet: 'Header', row: h.row, key: h.ext, action: rejected['Header:' + h.row] ? 'reject' : (h.unchanged ? 'unchanged' : 'create'), status: 'in_transit', supply_mode: h.mode || '',
receiver: imbStr_(h.v.marketplace) + ' -> ' + imbStr_(h.v.destination_warehouse_id), shipping_method: imbStr_(h.v.shipping_method), shipping_method_label: h.methodLabel || '', last_mile_delivery: imbStr_(h.v.last_mile_delivery), method_resolution: h.methodResolution || null, already_imported_as: h.unchanged || '', diff: h.conflict || '', warnings: h.warnings, suspected_duplicate: h.suspected ? (h.ack ? 'ACKNOWLEDGED' : 'SUSPECTED_DUPLICATE') : '', suspected_of: h.suspected || [] });
if (h.unchanged) return;
var tq = 0; h.lines.forEach(function (l) { var q = Number(l.v.opening_remaining_qty) || 0; tq += q; nLines++;
var k = [company, imbStr_(h.v.marketplace), l.v.sku, h.v.destination_warehouse_id, h.v.eta || 'UNKNOWN'].join('|'), T = h.mode === 'DISPLAY_ONLY' ? display : incoming; T[k] = (T[k] || 0) + q; });
plan.shipments.push({ ref: k0, row: h.row, v: h.v, mode: h.mode, method_label: h.methodLabel || '', method_resolution: h.methodResolution || null, warehouse_code: h.warehouse_code || '', lines: h.lines.map(function (l) { return { row: l.row, v: l.v }; }), totals: { shipment_total_qty: tq }, ack: h.ack || null });
});
plan.company = company; plan.cut = cut; plan.import_time = state.import_time || '';   // A final3 (2A)
if (typeof rtiPlanAdd_ === 'function') rtiPlanAdd_(plan, heads);   // STAGE 2 ROUTE_INIT (87_)
prevRows.forEach(function (p) { if (rejected[p.sheet + ':' + p.row]) p.action = 'reject'; });
var created = issues.length ? 0 : plan.shipments.length;
function list(T) { return Object.keys(T).sort().map(function (k) { var p = k.split('|'); return { company: p[0], marketplace: p[1], sku: p[2], destination_warehouse_id: p[3], eta: p[4], remaining_qty: T[k], basis_time: cut }; }); }
var preview = { counts: { create: created, update: 0, unchanged: unchanged, reject: Object.keys(rejected).length, lines_create: issues.length ? 0 : nLines }, rows: prevRows,
server_scope: state.import_time ? { import_time: state.import_time } : null,   // A final3 (2A): the page keeps it for this batch id
warnings: [],   // A final S2 (Owner 2026-11-20): reconciliation is NOT enabled - no per-SKU yellow lines; one status in impacts.reconciliation
impacts: { timezone: shiTz_(), shipments: created, shipment_lines: issues.length ? 0 : nLines, status: 'in_transit', opening_as_of: cut || '資料時間未提供', import_time: state.import_time || '', executed_allocations: 0, factory_stock_movements: 0, overseas_inventory_movements: 0,
amazon_inventory_snapshot: 0, reservations: 0, purchase_order_lines: 0, shipment_routes: 0, shipment_events: 0, documents: 0, emails: 0, reconciliation: { status: 'NOT_ENABLED', label: '對帳未啟用', keys: unrec.length, message: '對帳未啟用：本輪不比對數量、不調整庫存、不因此拒絕匯入' }, unreconciled: unrec,
incoming_remaining: list(incoming), display_only_amazon: list(display) } };
if (typeof rtiPreviewAdd_ === 'function') rtiPreviewAdd_(preview, heads, order, issues);   // STAGE 2 ROUTE_INIT (87_): per-row candidates + route / event counts
// A-delta2 (Owner): the preview shows TWO separate states per Header row - route / tracking (the template, or the route / service error) and quote
// (QUOTE_APPLICABLE, or 缺報價 with its reason). A missing quote never reads as "no route" and never blocks the tracking import.
preview.rows.forEach(function (p) { if (p.sheet !== 'Header') return; var h = heads[String(p.key || '').toLowerCase()]; if (!h || h.row !== p.row) return;
  var rt = p.route || h.routeInfo || null, cs = (rt && rt.candidates) || [];
  p.route_status = !rt ? '' : rt.status === 'ONE' ? 'ROUTE_TEMPLATE ' + cs[0].route_template_id : rt.status === 'MULTIPLE' ? 'ROUTE_TEMPLATE_CHOICE ' + cs.map(function (c) { return c.route_template_id; }).join(', ') : (rt.reason || rt.status || '');
  p.quote_status = h.quote ? h.quote.status : ''; p.quote_reason = h.quote ? h.quote.reason : '';
  p.quote_label = !h.quote ? '' : h.quote.status === 'QUOTE_APPLICABLE' ? '有適用報價 (quote applicable; not selected here)' : '缺報價 (quote unavailable)' + (h.quote.reason ? ': ' + h.quote.reason : ''); });
return { issues: issues, plan: plan, preview: preview, state: state };
}

// SHIP-OPEN R5 (Owner decision, final): an OPENING shipment may get its actual logistics dates filled manually through Update Existing -
// exactly this FIXED whitelist (no switch, no schema column, no Script Property). Blank = unknown / unchanged; nothing is derived from etd.
// They are logistics records only: the Update apply writes the cells + the audit rows and nothing else (no stock, remaining quantity,
// receipt, status, route, event, plan lineage or supply-mode change). Any OTHER date column of an imported shipment is refused.
var SHI_OPENING_UPDATE_DATES_ = ['actual_departure_date', 'actual_arrival_date', 'customs_clearance_date', 'delivered_date'];
function shiValidateUpdate_(ss, req) {
var issues = [], scopeCo = imbStr_((req.scope || {}).company), li = shiLists_(ss, scopeCo), L = li.lists, db = shiDb_(ss), plan = { mode: 'UPDATE', targets: [] }, prevRows = [];
var state = { mode: 'UPDATE', scope: scopeCo, targets: {} };
shiCheckColumns_(req, issues);
if (!scopeCo) imbIssue_(issues, '', '', 'scope.company', 'IMPORT_SCOPE_REQUIRED', 'an Update names the company it was exported for');
else { var co = shiCompanyCheck_(ss, scopeCo); if (co.code) imbIssue_(issues, '', '', 'scope.company', co.code, co.message, scopeCo); }
// R4 (review m7): the Update file carries its export metadata too - mode, company and template version must match this dialog
var fmU = req.file_meta, fscU = null;
if (!fmU) imbIssue_(issues, '', '', '_SYSTEM', 'IMPORT_FILE_META_MISSING', 'the file carries no template metadata (_SYSTEM) - export the Update file from this dialog');
else { try { fscU = JSON.parse(imbStr_(fmU.scope) || '{}'); } catch (eU) { fscU = null; }
if (imbStr_(fmU.mode) !== 'UPDATE') imbIssue_(issues, '', '', '_SYSTEM.mode', 'IMPORT_FILE_SCOPE_MISMATCH', 'the file is a ' + (imbStr_(fmU.mode) || 'blank') + ' file, not Update Existing', imbStr_(fmU.mode));
if (imbStr_(fmU.template_version) !== SHI_SCHEMA_VERSION_) imbIssue_(issues, '', '', '_SYSTEM.template_version', 'IMPORT_FILE_SCOPE_MISMATCH', 'the file is template ' + (imbStr_(fmU.template_version) || 'blank') + '; this server reads ' + SHI_SCHEMA_VERSION_, imbStr_(fmU.template_version));
if (!fscU || imbStr_(fscU.company) !== scopeCo) imbIssue_(issues, '', '', '_SYSTEM.scope.company', 'IMPORT_FILE_SCOPE_MISMATCH', 'the file was exported for company ' + (fscU ? imbStr_(fscU.company) || 'blank' : 'unreadable') + ', the dialog says ' + (scopeCo || 'blank'), fscU ? imbStr_(fscU.company) : ''); }
var tg = {}, counts = { update: 0, unchanged: 0 };
// SHIP-OPEN R5 (Owner item 1): the DISPLAYED remaining quantity (stored in shipment_lines.shipment_qty) and its basis time (資料時間,
// shipments.opening_as_of) of an AMAZON imported shipment (IMPORT_HISTORICAL + DISPLAY_ONLY) may be updated - nothing else may. Rules:
// the quantity may only go DOWN or stay (an increase would invent goods that were never on the way; an upward correction is a separate
// Owner action), never below what is received; the basis time may only move FORWARD and never into the future; a quantity change needs a
// later basis time in the same row (the new number must say "as of when"). DISPLAY_ONLY rows feed no supply reader and 31_ refuses
// them, so the change moves no stock, supply, PO, reservation or receipt. The row_version check (STALE_EXPORT) applies as for any edit.
function displayChangeOf(f, r, sn, cur, status, row, line) {
var c = imbCell_(r, f.key), nv;
if (!c.clear && imbStr_(c.value) === cur) return null;   // r5.4 (legacy): the exported value sent back unchanged is never parsed or refused
if (c.clear) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_CLEARABLE', f.key + ' cannot be cleared'); return null; }
if (f.key === 'opening_as_of') { nv = shiCutoff_(c.value); if (!nv) { imbIssue_(issues, sn, r.__row, f.key, 'OPENING_CUTOFF_INVALID', '資料時間 must be yyyy-MM-dd HH:mm (' + shiTz_() + ')', c.value); return null; } }
else { var t = shiTyped_(f, r, issues, sn, L, false); if (!t.ok) return null; nv = shiShow_(f, t.value); }
if (nv === cur) return null;
var origin = imbStr_(row && row.record_origin), mode = imbStr_(row && row.opening_supply_mode);
if (origin !== SHI_ORIGIN_HISTORICAL_ || mode !== 'DISPLAY_ONLY') { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_OPENING_DISPLAY_FIELD_NOT_EDITABLE', f.key + ' may be updated only on an Amazon display-only shipment; this shipment is ' + (origin === SHI_ORIGIN_HISTORICAL_ ? 'an imported shipment counted as supply (' + (mode || 'blank') + ') - its quantity changes only through receipts' : 'not an imported shipment'), nv); return null; }
if (status !== 'in_transit') { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_FOR_STATUS', f.key + ' is updated only while the record is in_transit; this one is ' + (status || 'blank'), nv); return null; }
if (f.key === 'opening_as_of') {
if (cur && nv <= cur) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_OPENING_BASIS_TIME_NOT_FORWARD', '資料時間 may only move forward (current ' + cur + ', file ' + nv + ')', nv); return null; }
if (nv + ':00' > imbNow_()) { imbIssue_(issues, sn, r.__row, f.key, 'OPENING_CUTOFF_IN_FUTURE', '資料時間 ' + nv + ' (' + shiTz_() + ') is in the future', nv); return null; }
return { field: 'opening_as_of', before: cur, after: nv, display: true };
}
var a = Number(nv), b = Number(cur), rec = Number(line && line.shipment_received_qty) || 0;
if (!(a >= 0)) { imbIssue_(issues, sn, r.__row, f.key, 'OPENING_REMAINING_NEGATIVE', '在途中數量（僅顯示） cannot be negative', nv); return null; }
if (cur !== '' && a > b) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_OPENING_REMAINING_INCREASE_NOT_ALLOWED', '在途中數量（僅顯示） may only decrease or stay (current ' + cur + ', file ' + nv + ') - an increase would add goods that were never on the way; ask the Owner for a correction', nv); return null; }
if (a < rec) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_QTY_BELOW_RECEIVED', 'the quantity cannot go below the received ' + rec, nv); return null; }
return { field: 'shipment_qty', display_field: 'opening_remaining_qty', before: b, after: a, display: true };
}
function changeOf(f, r, sn, cur, status, row, line) {
var c = imbCell_(r, f.key);
if (c.absent || c.blank) return null;
if (f.update === 'display') return displayChangeOf(f, r, sn, cur, status, row, line);
if (f.update === 'fixed') {
if (c.clear) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_CLEARABLE', f.key + ' cannot be cleared by an import'); return null; }
if (shiShow_(f, f.type === 'enum' ? shiLc_(c.value) : c.value) !== cur) imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_UPDATABLE', f.key + ' is read-only in an import (current ' + (cur || 'blank') + ')' + (f.key === 'status' ? ' - status moves only through Confirm / receipt' : f.key === 'shipment_received_qty' ? ' - receipts go through shipment.receipt.update' : ''), c.value);
return null;
}
if (f.update !== 'edit') return null;
var nv;
// SHIP-OPEN (Owner Q4): ETA may be filled or changed, never cleared; blank = no change
if (f.key === 'eta' && c.clear) { imbIssue_(issues, sn, r.__row, 'eta', 'SHIPMENT_ETA_NOT_CLEARABLE', 'an import never clears an ETA (blank = keep the current value)'); return null; }
if (c.clear) { if (!f.clear) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_CLEARABLE', f.key + ' cannot be cleared'); return null; } nv = ''; }
else { var t = shiTyped_(f, r, issues, sn, L, false); if (!t.ok) return null; nv = shiShow_(f, t.value); }
if (nv === cur) return null;
if (f.type === 'date' && f.key !== 'eta' && imbStr_(row && row.record_origin) === SHI_ORIGIN_HISTORICAL_ && SHI_OPENING_UPDATE_DATES_.indexOf(f.key) < 0) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_OPENING_DATE_NOT_EDITABLE', f.key + ' is not an updatable date of an imported shipment (allowed: ETA, ' + SHI_OPENING_UPDATE_DATES_.join(', ') + ')', nv); return null; }
if (f.when === 'dispatched' && SHI_DISPATCHED_.indexOf(status) < 0) { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_FIELD_NOT_FOR_STATUS', f.key + ' is an actual date of a dispatched shipment; this one is ' + (status || 'blank'), nv); return null; }
if (status === 'cancelled') { imbIssue_(issues, sn, r.__row, f.key, 'SHIPMENT_CANCELLED_NOT_UPDATABLE', 'a cancelled shipment is not changed by an import', nv); return null; }
if (f.key === 'eta') {
if (status === 'received' || status === 'closed') { imbIssue_(issues, sn, r.__row, 'eta', 'SHIPMENT_FIELD_NOT_FOR_STATUS', 'nothing of a ' + status + ' shipment is still on the way; its ETA is not changed', nv); return null; }
var etd = shiDateText_(row && row.etd); if (etd && nv < etd) { imbIssue_(issues, sn, r.__row, 'eta', 'SHIPMENT_DATES_CONTRADICT', 'eta ' + nv + ' is before the ship date ' + etd, nv); return null; }
}
return { field: f.key, before: cur, after: f.type === 'decimal' && nv !== '' ? Number(nv) : nv };
}
// A-delta2 r3 (b3 freeze): Carrier + Shipping method on an Update row are READ-ONLY, exactly as b3 (fields 'fixed'; 12_ freezes a dispatched
// shipment's transport). A cell is NO change when it is blank, equals the exported text / stored token, or (review F3: a card label renamed
// between export and upload) resolves with the SAME resolver as Add New, for the same carrier, to exactly the stored (shipping_method,
// last_mile_delivery). Anything else - a different carrier, or a text that resolves elsewhere / not at all - is a change: it is LISTED
// (preview transport.requested / blocked) and refused with the lock code (SHIPMENT_TRANSPORT_FROZEN unless a more specific one applies).
// Nothing is ever written: there is no transport apply branch. Last mile is derived (a different last-mile cell alone is read-only).
var txU = shiTransportIndex_(ss), crcU = shiRowsOf_(ss, 'carrier_rate_cards') || [], memoU = shiMemoSs_(ss), whU = Object.create(null);
(shiRowsOf_(ss, 'warehouses') || []).forEach(function (w) { var id = imbStr_(w.warehouse_id); if (id) (whU[id] = whU[id] || []).push(w); });
function transportOf(r, h, t) {
  var sn = 'Header', cc = imbCell_(r, 'carrier_id'), mc = imbCell_(r, 'shipping_method'), lc = imbCell_(r, 'last_mile_delivery');
  var curCar = imbStr_(h.carrier_id), curTok = imbStr_(h.shipping_method), curLm = imbStr_(h.last_mile_delivery), curTxt = shiMethodText_(li.methods, crcU, h);
  if (cc.clear || mc.clear || lc.clear) { imbIssue_(issues, sn, r.__row, cc.clear ? 'carrier_id' : mc.clear ? 'shipping_method' : 'last_mile_delivery', 'SHIPMENT_FIELD_NOT_CLEARABLE', 'Carrier / Shipping method / last mile cannot be cleared by an import'); return null; }
  var car = cc.absent || cc.blank ? curCar : imbStr_(cc.value), txt = mc.absent || mc.blank ? '' : imbStr_(mc.value);
  var same = car === curCar && (!txt || txt === curTxt || txt === curTok);
  if (!same && car === curCar && txt && curTok) {   // F3: an equivalent text (same resolver, same carrier) is no change
    var src0 = whU[imbStr_(h.source_warehouse_id)] || [], sk0 = (db.linesBy[t.sid] || []).filter(function (l) { var s0 = shiLc_(l.line_status); return s0 !== 'cancelled' && s0 !== 'removed'; }).map(function (l) { return imbStr_(l.sku); }).filter(Boolean);
    var eq = shiResolveTuple_(memoU, crcU, { carrier: car, text: txt, country: shiDeliveryCountry_(h.country, whU[imbStr_(h.destination_warehouse_id)] || []), whCode: h.warehouse_code, day: shiDateText_(h.etd), origin: src0.length === 1 ? imbStr_(src0[0].country) : '', marketplace: shiIsMulti_(h.marketplace) ? '' : imbStr_(h.marketplace), skus: sk0 });
    same = !!(eq.ok && eq.method === curTok && eq.lastMile === curLm); }
  if (same) {
    if (!lc.absent && !lc.blank && imbStr_(lc.value) !== curLm) imbIssue_(issues, sn, r.__row, 'last_mile_delivery', 'SHIPMENT_FIELD_NOT_UPDATABLE', 'last_mile_delivery is derived from Carrier + Shipping method (current ' + (curLm || 'blank') + ') - change the Shipping method label instead', lc.value);
    return null; }
  var want = (car !== curCar ? 'carrier ' + (curCar || 'blank') + ' -> ' + car : 'carrier ' + car) + ', Shipping method ' + (curTxt || curTok || 'blank') + ' -> ' + (txt || '(blank)');
  t.transport = { requested: want, current: { carrier_id: curCar, shipping_method: curTok, last_mile_delivery: curLm }, routes: txU.routes[t.sid] || 0 };
  var lock = shiTransportLock_(txU, h);
  if (lock) { t.transport.blocked = lock;
    imbIssue_(issues, sn, r.__row, car !== curCar ? 'carrier_id' : 'shipping_method', lock, 'a transport change (' + want + ') is not applied: ' + ({ SHIPMENT_STATUS_NOT_UPDATABLE: 'the shipment status ' + (shiLc_(h.status) || 'blank') + ' is not updatable', SHIPMENT_TRANSPORT_FROZEN: 'Update keeps the stored carrier / method / last mile (b3 rule; 12_ SHIPMENT_TRANSPORT_FROZEN for a dispatched shipment)',
      SHIPMENT_TRANSPORT_ROUTE_EXISTS: 'the shipment already has a route (' + (txU.routes[t.sid] || 0) + ' route rows) - no route or event is deleted or rebuilt by an import', SHIPMENT_TRANSPORT_DISPATCH_EVIDENCE: 'the shipment has route / dispatch events - they are never rewritten',
      SHIPMENT_TRANSPORT_QUOTE_SELECTED: 'the shipment has a selected quote (rate_card_id ' + imbStr_(h.rate_card_id) + ') - an import never modifies a selected quote' })[lock], (car !== curCar ? car : txt)); return null; }
  t.transport.blocked = 'SHIPMENT_TRANSPORT_FROZEN';   // r3: unreachable (shiTransportLock_ always answers) - kept fail-closed
  imbIssue_(issues, sn, r.__row, 'shipping_method', 'SHIPMENT_TRANSPORT_FROZEN', 'a transport change (' + want + ') is not applied (Update keeps carrier / method as b3)', txt); return null;
}
(req.sheets.Header || []).forEach(function (r) {
var sn = 'Header', sid = imbStr_(r.shipment_id), rowIssues = issues.length;
if (!sid) { imbIssue_(issues, sn, r.__row, 'shipment_id', 'REQUIRED', 'Update identifies a shipment by shipment_id (Add New creates new ones)'); prevRows.push({ sheet: sn, row: r.__row, key: '', action: 'reject' }); return; }
var rows = db.byId[sid] || [];
if (!rows.length) { imbIssue_(issues, sn, r.__row, 'shipment_id', 'SHIPMENT_NOT_FOUND', 'no shipment ' + sid + ' (rows are never created by Update)', sid); prevRows.push({ sheet: sn, row: r.__row, key: sid, action: 'reject' }); return; }
if (rows.length > 1) { imbIssue_(issues, sn, r.__row, 'shipment_id', 'SHIPMENT_DUPLICATED', 'shipment ' + sid + ' appears ' + rows.length + ' times in the database', sid); return; }
if (tg[sid]) { imbIssue_(issues, sn, r.__row, 'shipment_id', 'SHIPMENT_ROW_DUPLICATE', 'shipment ' + sid + ' is already on row ' + tg[sid].row, sid); return; }
var h = rows[0], rv = shiRowVersion_(db, sid), status = shiLc_(h.status);
state.targets[sid] = rv;
var t = tg[sid] = { sid: sid, row: r.__row, sheetRow: h.__r, changes: [], lineChanges: [], status: status, origin: imbStr_(h.record_origin) || 'SYSTEM', lines: {} };
if (shiIsPending_(h)) imbIssue_(issues, sn, r.__row, 'shipment_id', 'SHIPMENT_OPENING_NOT_COMMITTED', 'shipment ' + sid + ' was written by an import batch that never finished (' + imbStr_(h.opening_supply_mode) + ', batch ' + imbStr_(h.import_batch_id) + ') - read that batch first; it is not updated', sid);
if (scopeCo && imbStr_(h.company) !== scopeCo) imbIssue_(issues, sn, r.__row, 'shipment_id', 'SHIPMENT_OUT_OF_SCOPE', 'shipment ' + sid + ' belongs to another company, the import is for ' + scopeCo + ' (cross-company)', sid);
var ver = imbStr_(r.row_version);
if (!ver) imbIssue_(issues, sn, r.__row, 'row_version', 'REQUIRED', 'row_version is required - export a fresh Update file');
else if (ver !== rv) t.stale = ver;   // SHIP-OPEN: judged after the lines - a file whose every value already holds is 'unchanged', not stale
t.updatable = shiUpdatable_(h);
shiFields_(sn).forEach(function (f) { if (f.update === 'key' || f.update === 'version' || f.update === 'ignore' || SHI_TRANSPORT_KEYS_.indexOf(f.key) >= 0) return; var ch = changeOf(f, r, sn, shiCurrent_(db, f, h, null), status, h); if (ch && ch.field === 'note') ch = xcoImportNote_(ss, issues, sn, r, ch, h, null); if (ch) t.changes.push(ch);   /* XCO-R15G E3 */ });
(transportOf(r, h, t) || []).forEach(function (ch) { t.changes.push(ch); });   // A-delta2: Carrier + label -> the Add New service resolver
t.bad = issues.length > rowIssues;
});
(req.sheets.Lines || []).forEach(function (r) {
var sn = 'Lines', sid = imbStr_(r.shipment_id), lid = imbStr_(r.shipment_line_id), t = tg[sid];
if (!lid) { imbIssue_(issues, sn, r.__row, 'shipment_line_id', 'SHIPMENT_LINE_ADD_NOT_ALLOWED', 'Update never adds a line (a line is identified by shipment_line_id, never by SKU)'); return; }
if (!t) { imbIssue_(issues, sn, r.__row, 'shipment_id', 'SHIPMENT_HEADER_ROW_MISSING', 'the line\'s shipment (' + (sid || 'blank') + ') has no Header row in this file - its row_version is checked there', sid); return; }
// SHIP-OPEN 2a: one line is one row - a second row with the same shipment_line_id is refused (before: both applied, the last one won)
if (t.lines[lid]) { imbIssue_(issues, sn, r.__row, 'shipment_line_id', 'SHIPMENT_LINE_ROW_DUPLICATE', 'line ' + lid + ' is already on row ' + t.lines[lid] + ' of this file - one line is one row', lid); t.bad = true; return; }
t.lines[lid] = r.__row;
var line = (db.linesBy[sid] || []).filter(function (l) { return imbStr_(l.shipment_line_id) === lid; });
if (line.length !== 1) { imbIssue_(issues, sn, r.__row, 'shipment_line_id', 'SHIPMENT_LINE_NOT_IN_SHIPMENT', 'line ' + lid + ' is not a line of shipment ' + sid, lid); return; }
var h = db.byId[sid][0], rowIssues = issues.length, chs = [];
shiFields_(sn).forEach(function (f) { if (f.update === 'key' || f.update === 'link' || f.update === 'ignore') return; var ch = changeOf(f, r, sn, shiCurrent_(db, f, h, line[0]), t.status, h, line[0]); if (ch && ch.field === 'note') ch = xcoImportNote_(ss, issues, sn, r, ch, h, line[0]);   /* XCO-R15G E3 */ if (ch) { ch.line_id = lid; ch.sheetRow = line[0].__r; chs.push(ch); } });
t.lineChanges = t.lineChanges.concat(chs); if (issues.length > rowIssues) t.bad = true;
});
Object.keys(tg).forEach(function (sid) {
var t = tg[sid];
// R5 (Owner item 1): a displayed-quantity change needs a later 資料時間 in the same file; the header total follows the lines
var qd = t.lineChanges.filter(function (c) { return c.display; });
if (qd.length) {
if (!t.changes.some(function (c) { return c.field === 'opening_as_of'; })) { imbIssue_(issues, 'Header', t.row, 'opening_as_of', 'SHIPMENT_OPENING_BASIS_TIME_REQUIRED', 'the displayed remaining quantity changed - also move 資料時間 opening_as_of forward to the time the new number is true', ''); t.bad = true; }
var h0 = db.byId[sid][0], byL = {}; qd.forEach(function (c) { byL[c.line_id] = c.after; });
var tot = (db.linesBy[sid] || []).filter(function (l) { return shiLc_(l.line_status) !== 'cancelled' && shiLc_(l.line_status) !== 'removed'; }).reduce(function (s0, l) { var id = imbStr_(l.shipment_line_id); return s0 + (byL.hasOwnProperty(id) ? byL[id] : (Number(l.shipment_qty) || 0)); }, 0);
if (tot !== (Number(h0.shipment_total_qty) || 0)) t.changes.push({ field: 'shipment_total_qty', before: Number(h0.shipment_total_qty) || 0, after: tot, display: true });
}
var n = t.changes.length + t.lineChanges.length;
if (t.stale && n) { imbIssue_(issues, 'Header', t.row, 'row_version', 'STALE_EXPORT', 'shipment ' + sid + ' changed after this file was exported (a receipt, dispatch or edit) and the file still changes it - nothing of this shipment is applied', t.stale); t.bad = true; }
// A-delta2 (Owner rule 6): the ONE status filter - an excluded shipment is never changed (receipt started / finished / not dispatched)
if (!t.updatable && (n || t.bad) && !issues.some(function (i) { return i.code === 'SHIPMENT_STATUS_NOT_UPDATABLE' && i.sheet === 'Header' && i.row === t.row; })) { imbIssue_(issues, 'Header', t.row, 'shipment_id', 'SHIPMENT_STATUS_NOT_UPDATABLE', 'shipment ' + sid + ' is ' + (t.status || 'blank') + ' - Update Existing changes only shipped / in_transit / arrived (已送達待收貨) shipments; a started or finished receipt, a closed / completed / delivered / cancelled shipment, a draft or a ready_to_ship shipment is never changed by an import', t.status); t.bad = true; }
if (!t.bad) { if (n) counts.update++; else counts.unchanged++; }
var tr_ = t.transport ? { requested: t.transport.requested, current: t.transport.current, resolved: t.transport.resolved || null, blocked: t.transport.blocked || '', error: t.transport.error || '', route_rows: t.transport.routes, route_impact: t.transport.blocked === 'SHIPMENT_TRANSPORT_ROUTE_EXISTS' ? 'the shipment has a route - the transport change is NOT applied; no route / event is deleted or rebuilt' : (t.transport.route_impact || ''),
  quote_status: t.transport.quote_status || '', quote_label: !t.transport.quote_status ? '' : t.transport.quote_status === 'QUOTE_APPLICABLE' ? '有適用報價 (quote applicable; not selected here)' : '缺報價 (quote unavailable)' + (t.transport.quote_reason ? ': ' + t.transport.quote_reason : '') } : null;
prevRows.push({ sheet: 'Header', row: t.row, key: sid, origin: t.origin, status: t.status, action: t.bad ? 'reject' : (n ? 'update' : 'unchanged'), note: !t.bad && !n && !t.updatable ? 'excluded: status ' + (t.status || 'blank') + ' is not updatable - nothing is applied' : (!t.bad && !n && t.stale ? 'every value in the file already holds (already applied)' : ''), changes: t.changes.concat(t.lineChanges).map(function (c) { return { line_id: c.line_id || '', field: c.display_field || c.field, before: c.before, after: c.after, display_only: !!c.display }; }), transport: tr_ });
if (n && !t.bad) plan.targets.push({ sid: sid, changes: t.changes, lineChanges: t.lineChanges });
});
var rejected = {}; issues.forEach(function (i) { if (i.sheet && i.row) rejected[i.sheet + ':' + i.row] = 1; });
return { issues: issues, plan: plan, state: state, preview: { counts: { create: 0, update: issues.length ? 0 : counts.update, unchanged: counts.unchanged, reject: Object.keys(rejected).length }, rows: prevRows,
impacts: { fields_changed: plan.targets.reduce(function (s, t) { return s + t.changes.length + t.lineChanges.length; }, 0), factory_stock_movements: 0, overseas_inventory_movements: 0, reservations: 0, shipment_routes: 0, shipment_events: 0, documents: 0, emails: 0, status_changes: 0, quantity_changes: 0, receipts: 0,
display_only_changes: plan.targets.reduce(function (s, t) { return s + t.changes.concat(t.lineChanges).filter(function (c) { return c.display; }).length; }, 0),
display_only_rule: 'An Amazon display-only shipment (display only) changes only its displayed remaining quantity (down or equal) and its 資料時間 (forward, not in the future); no stock, supply, PO, reservation or receipt follows.' } } };
}

function shiMint_(prefix, taken) { for (var i = 0; i < 20; i++) { var id = prefix + Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase(); if (!taken[id]) { taken[id] = 1; return id; } } throw new Error('SHIPMENT_ID_MINT_FAILED'); }
// INT-CAND2 (local candidate): shipment_no = SHP-yyyymmdd-NNNN, the same per-day serial as 12_ - the highest same-day all-digit suffix
// on the shipments rows and in the 34_ snapshot history, + 1; at least four digits, never truncated. Read-only; no persistent sequence.
function shiShipNoSerial_(v, prefix) { v = String(v == null ? '' : v).trim().toUpperCase(); if (v.indexOf(prefix) !== 0) return 0; v = v.slice(prefix.length); return /^[0-9]+$/.test(v) ? parseInt(v, 10) : 0; }
function shiShipNoFmt_(prefix, n) { return prefix + (n < 1000 ? ('000' + n).slice(-4) : String(n)); }
function shiShipNoMax_(ss, rows, prefix) {
var max = 0; (rows || []).forEach(function (r) { max = Math.max(max, shiShipNoSerial_(r.shipment_no, prefix)); });
var snap = ss.getSheetByName('shipment_final_output_snapshots');
if (snap && snap.getLastRow() > 1 && snap.getLastColumn() > 0) {
var c = snap.getRange(1, 1, 1, snap.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }).indexOf('shipment_no');
if (c !== -1) snap.getRange(2, c + 1, snap.getLastRow() - 1, 1).getValues().forEach(function (r) { max = Math.max(max, shiShipNoSerial_(r[0], prefix)); });
}
return max;
}
// SHIP-OPEN R5: a header row written but not yet flipped carries opening_supply_mode PENDING:<COUNTED|DISPLAY_ONLY> and status blank.
var SHI_PENDING_PREFIX_ = 'PENDING:';
function shiIsPending_(r) { return imbStr_(r && r.opening_supply_mode).indexOf(SHI_PENDING_PREFIX_) === 0; }
function shiApplyAdd_(ss, plan, ctx) {
var shT = shiTable_(ss, 'shipments'), lnT = shiTable_(ss, 'shipment_lines'), J = ctx.journal, actor = 'import:' + ctx.batch_id, now = ctx.now, created = [];
if (!shT || !lnT) throw new Error('SHIPMENT_SHEETS_MISSING');
var taken = {}; shT.rows.forEach(function (r) { taken[imbStr_(r.shipment_id)] = 1; }); lnT.rows.forEach(function (r) { taken[imbStr_(r.shipment_line_id)] = 1; });
var ymd = now.slice(0, 10).replace(/-/g, '');
// INT-CAND2: the batch's numbers, in file order, from the rows read above inside the import lock; then a FRESH read before the first
// write - a number already taken refuses the whole batch here, before any put (nothing to undo).
var snPrefix = 'SHP-' + ymd + '-', snNext = shiShipNoMax_(ss, shT.rows, snPrefix);
var snPlan = plan.shipments.map(function () { snNext++; return shiShipNoFmt_(snPrefix, snNext); });
var snFresh = shiTable_(ss, 'shipments'), snTaken = {};
(snFresh ? snFresh.rows : []).forEach(function (r) { snTaken[String(r.shipment_no == null ? '' : r.shipment_no).trim().toUpperCase()] = 1; });
var snDup = snPlan.filter(function (n) { return snTaken[n]; });
if (snDup.length) throw new Error('SHIPMENT_NO_NOT_UNIQUE: ' + snDup.join(', ') + ' already on a shipments row - nothing was written; validate again (the same batch may be applied again)');
// SHIP-OPEN: an imported shipment = shipments + shipment_lines only. shipment_qty = the remaining quantity, shipment_received_qty = 0,
// status in_transit, record_origin IMPORT_HISTORICAL, opening_supply_mode COUNTED (overseas 3PL) or DISPLAY_ONLY (Amazon FBA).
// ETD is the source warehouse departure date; no other logistics date is written.
// R4 (review M2): the LINES are written FIRST, the headers second. Every reader joins lines to a shipments row, so an interruption between
// the two writes leaves only lines nobody reads (found by their import_batch_id; shipOpenCleanupDryRun lists them) - never a visible
// in-transit header without lines.
var hdrs = [], lines = [];
function audit(T, table, obj, entityId, lineId) { T.headers.forEach(function (k) { var v = obj[k]; if (v === undefined || v === null || v === '') return; J.change({ entity_table: table, entity_id: entityId, line_id: lineId || '', field: k, before: '', after: v }); }); }
plan.shipments.forEach(function (s, i) {
var v = s.v, sid = shiMint_('SH-', taken), out = { row: s.row, external_shipment_id: v.external_shipment_id, shipment_id: sid, shipment_no: snPlan[i], opening_supply_mode: s.mode, lines: [] };
var h = { shipment_id: sid, shipment_no: snPlan[i], record_origin: SHI_ORIGIN_HISTORICAL_, opening_as_of: plan.cut, opening_supply_mode: s.mode, import_batch_id: ctx.batch_id,
status: 'in_transit', company: plan.company, country: v.country, marketplace: v.marketplace, source_warehouse_id: v.source_warehouse_id, destination_warehouse_id: v.destination_warehouse_id,
warehouse_code: s.warehouse_code, external_shipment_id: v.external_shipment_id, reference_id: v.reference_id, carrier_id: v.carrier_id, shipping_method: v.shipping_method, last_mile_delivery: v.last_mile_delivery || '',   // A-delta1 B: the resolved last mile is persisted
booking_no: v.booking_no, master_tracking_number: v.master_tracking_number, tracking_number: v.tracking_number, container_no: v.container_no, bl_no: v.bl_no, invoice_no: v.invoice_no,
etd: v.etd, eta: v.eta, note: v.note, shipment_total_qty: s.totals.shipment_total_qty,
hidden_from_draft_at: now, hidden_from_draft_by: actor, created_by: actor, created_at: now, updated_by: actor, updated_at: now };
audit(shT, 'shipments', h, sid);
// R5 (Owner item 4): the header row LANDS as status '' + opening_supply_mode 'PENDING:<mode>' and is flipped to in_transit + the final
// mode (one journaled range write) only after every line and header row is on the sheet - see below.
hdrs.push(Object.assign({}, h, { status: '', opening_supply_mode: SHI_PENDING_PREFIX_ + s.mode }));
if (s.method_resolution) J.change({ entity_table: 'shipments', entity_id: sid, line_id: '', field: 'method_resolution (provenance, not stored)', before: '', after: JSON.stringify(s.method_resolution).slice(0, 500) });   // A-delta1 B
if (s.method_label) J.change({ entity_table: 'shipments', entity_id: sid, line_id: '', field: 'shipping_method_label (file, not stored)', before: '', after: String(s.method_label).slice(0, 300), result: 'SHIPPING_METHOD_LABEL_SELECTED' });   // A final S1: the label choice is audited, the token is stored
if (s.ack) J.change({ entity_table: 'shipments', entity_id: sid, line_id: '', field: 'distinct_shipment_ack', before: '', after: ('DISTINCT | reason: ' + s.ack.reason + ' | suspected of: ' + s.ack.against.map(function (x) { return x.kind + ' ' + x.against; }).join(', ')).slice(0, 1000), result: 'ACKNOWLEDGED_SUSPECTED_DUPLICATE' });
s.lines.forEach(function (l) {
var lid = shiMint_('SHL-', taken), lo = { shipment_line_id: lid, shipment_id: sid, sku: l.v.sku, shipment_qty: l.v.opening_remaining_qty, shipment_received_qty: 0, note: l.v.note,
line_status: 'active', import_batch_id: ctx.batch_id, created_at: now, updated_at: now };
lines.push(lo); audit(lnT, 'shipment_lines', lo, sid, lid);
out.lines.push({ row: l.row, shipment_line_id: lid, sku: l.v.sku, opening_remaining_qty: l.v.opening_remaining_qty });
});
created.push(out);
});
J.appendRows(lnT.sheet, lnT.headers, lines);
var hStart = J.appendRows(shT.sheet, shT.headers, hdrs);
// R5 (Owner item 4): interruption points. (1) inside / after the lines write: only lines exist - no shipments row joins them, every
// reader (KMSLS, 13_, IR, Overview, Tracking, 57_, 31_) starts from a shipments row. (2) after the headers write, before the flip: the
// rows read status '' (no Overview / Tracking / draft status, 31_ refuses an unknown status) and mode PENDING:* (KMSLS / 13_ / IR count
// only COUNTED; 31_ n1ReceiptOpeningGate_ refuses anything not COMMITTED as COUNTED/DISPLAY_ONLY). (3) after the flip, before 78_
// writes the audit rows + COMMITTED: complete rows, receipt COMMITTING - a resend reads OUTCOME_UNKNOWN, a new batch reads
// SHIPMENT_OPENING_BATCH_UNRESOLVED; nothing is ever written twice. Any thrown error undoes every journaled write.
var cSt = shT.headers.indexOf('status'), cMd = shT.headers.indexOf('opening_supply_mode');
if (cSt < 0 || cMd < 0) throw new Error('SHIPMENT_IMPORT_SCHEMA_MISSING: status / opening_supply_mode');
// The flip is ONE range write over every new header row (columns status .. opening_supply_mode): status and mode change together, so no
// row can read in_transit + PENDING or blank + a final mode. Each cell's previous value is journaled first, so a failure undoes it.
if (hdrs.length) {
var lo = Math.min(cSt, cMd), hi = Math.max(cSt, cMd), flip = [];
hdrs.forEach(function (h0, i) {
var fin = Object.assign({}, h0, { status: 'in_transit', opening_supply_mode: String(h0.opening_supply_mode).slice(SHI_PENDING_PREFIX_.length) });
var prev = imbRowArray_(shT.headers, h0).slice(lo, hi + 1); prev.forEach(function (p, k) { J.push({ kind: 'cell', sheet: shT.sheet, row: hStart + i, col: lo + k, prev: p }); });
flip.push(imbRowArray_(shT.headers, fin).slice(lo, hi + 1));
});
shT.sheet.getRange(hStart, lo + 1, flip.length, hi - lo + 1).setValues(flip);
}
var rti_ = plan.shipments.some(function (s) { return !!s.route; }) ? rtiApplyAdd_(ss, plan, ctx, created) : null;   // STAGE 2 ROUTE_INIT (87_): after the flip - events, then routes (journaled; a throw undoes all)
var out_ = { result: { created: created, opening_as_of: plan.cut, import_time: plan.import_time || '', timezone: shiTz_(), company: plan.company, stock_movements: 0, reservations: 0, allocations: 0, po_lines: 0, routes: rti_ ? rti_.routes : 0, events: rti_ ? rti_.events : 0, documents: 0, emails: 0 } };
if (rti_) out_.result.positions = rti_.positions;   // absent without a position: the no-choice result_json stays byte-identical
return out_;
}
// SHIP-OPEN 2a / R4: READ-ONLY reconcile of a batch whose receipt is not COMMITTED (COMMITTING after an interrupted run, UNKNOWN_OUTCOME,
// FAILED_ROLLED_BACK). It reports what this batch's id left in the rows; it never writes, never changes the receipt, never turns a
// COMMITTING batch into success and never makes it re-addable (Add New refuses the same shipments: SHIPMENT_OPENING_BATCH_UNRESOLVED).
function shiResidue_(ss, batchId, receipt) {
var id = imbStr_(batchId), mode = imbStr_(receipt && receipt.mode), sh = shiTable_(ss, 'shipments'), ln = shiTable_(ss, 'shipment_lines');
var out = { domain: 'shipment', import_batch_id: id, mode: mode, receipt_status: imbStr_(receipt && receipt.status), read_only: true, writes_performed: 0,
rule: 'Read-only. This read never changes the receipt or any row; a batch that is not COMMITTED is never shown as applied and never re-added. Only rows that never became effective (orphan lines, PENDING headers) can be removed, and only by the Owner-approved cleanup (shipOpenCleanupDryRun, then shipOpenCleanupApply with its digest); effective rows are never deleted - they await manual reconciliation. Nothing is resent automatically.' };
var cnt = {}; try { cnt = JSON.parse(imbStr_(receipt && receipt.row_counts_json) || '{}'); } catch (e) { cnt = {}; }
var S = typeof imbSheets_ === 'function' ? imbSheets_(ss) : null;
out.audit_rows = S ? imbRows_(S.changes).filter(function (c) { return imbStr_(c.import_batch_id) === id; }).length : null;
if (!sh || !ln) { out.verdict = 'UNREADABLE'; return out; }
if (mode === 'UPDATE') {
var marked = sh.rows.filter(function (r) { return imbStr_(r.updated_by) === 'import:' + id; });
out.update_rows_marked = marked.map(function (r) { return { shipment_id: imbStr_(r.shipment_id), shipment_no: imbStr_(r.shipment_no), updated_at: shiCanonCell_(r.updated_at) }; });
out.expected_updates = cnt.update === undefined ? null : Number(cnt.update);
out.verdict = marked.length ? 'UPDATE_MARK_PRESENT_CELLS_NOT_PROVABLE' : 'NO_UPDATE_MARK_FOUND';
return out;
}
if (mode === 'ROUTE_INIT' && typeof rtiResidue_ === 'function') return rtiResidue_(ss, id, receipt, out);   // STAGE 2 ROUTE_INIT (87_): read-only
if (!sh.has('import_batch_id') || !ln.has('import_batch_id')) { out.verdict = 'BATCH_COLUMN_MISSING'; return out; }
var mine = sh.rows.filter(function (r) { return imbStr_(r.import_batch_id) === id; }), ids = {};
mine.forEach(function (r) { ids[imbStr_(r.shipment_id)] = 1; });
var lines = ln.rows.filter(function (l) { return imbStr_(l.import_batch_id) === id || ids[imbStr_(l.shipment_id)]; });
out.shipments = mine.map(function (r) { var sid = imbStr_(r.shipment_id); return { shipment_id: sid, shipment_no: imbStr_(r.shipment_no), external_shipment_id: imbStr_(r.external_shipment_id), receiver: imbStr_(r.marketplace) + ' -> ' + imbStr_(r.destination_warehouse_id), line_rows: lines.filter(function (l) { return imbStr_(l.shipment_id) === sid; }).length }; });
out.shipment_rows = mine.length; out.line_rows = lines.length;
if (typeof rtiResidueAdd_ === 'function') rtiResidueAdd_(ss, id, ids, out);   // STAGE 2 ROUTE_INIT (87_): the batch's position rows, read-only
out.pending_header_rows = mine.filter(shiIsPending_).length;   /* R5: written, never flipped - invisible to every reader, never receivable */
out.effective_header_rows = mine.length - out.pending_header_rows;   /* r5.2: flipped = effective data - never cleaned */
out.awaiting_manual_reconciliation = out.effective_header_rows > 0 && out.receipt_status !== IMB_STATUS_.COMMITTED;
out.cleanup = out.effective_header_rows > 0 ? 'REFUSED_EFFECTIVE_DATA (shipOpenCleanup* refuses: SHIPMENT_EFFECTIVE_NOT_CLEANABLE)' : (mine.length || lines.length ? 'POSSIBLE_ONLY_WITH_OWNER_APPROVAL (orphan lines / PENDING headers)' : 'NOTHING_TO_REMOVE');
out.orphan_line_rows = lines.filter(function (l) { return !ids[imbStr_(l.shipment_id)]; }).length;
out.expected_shipments = cnt.create === undefined ? null : Number(cnt.create); out.expected_lines = cnt.lines_create === undefined ? null : Number(cnt.lines_create);
out.verdict = !mine.length && !lines.length ? 'NO_ROWS_FOUND_FOR_THIS_BATCH'
: (out.expected_shipments === mine.length && out.expected_lines === lines.length && !out.orphan_line_rows && out.shipments.every(function (s) { return s.line_rows > 0; }) ? (out.pending_header_rows ? 'ALL_ROWS_PRESENT_NOT_FLIPPED' : 'EFFECTIVE_AWAITING_MANUAL_RECONCILIATION') : 'PARTIAL_WRITE');
return out;
}
// ===== SHIP-OPEN R4 (review M2): Owner-approved cleanup of a NOT-COMMITTED batch's leftover rows. Run ONLY by the Owner from the Apps Script
// editor (never routed, never automatic). Step 1 shipOpenCleanupDryRun(batchId): read-only, lists exactly the rows it would remove and
// refuses when any of them has been used since (a receipt, a status change, an edit, a route/event/movement/allocation). Step 2, separately
// approved, shipOpenCleanupApply(batchId, digest): under the script lock it recomputes the dry run, requires the SAME digest, deletes only
// those rows (journaled; undone on failure) and marks the receipt FAILED_ROLLED_BACK with the cleanup note - the batch is then a proven
// zero-write and may be applied again. A COMMITTED batch is never touched.
function shiCleanupPlan_(ss, batchId) {
var id = imbStr_(batchId), S = typeof imbSheets_ === 'function' ? imbSheets_(ss) : null, out = { import_batch_id: id, removable: false, reasons: [], shipment_rows: [], line_rows: [], writes_performed: 0 };
if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) { out.reasons.push('BATCH_ID_INVALID'); return out; }
if (!S) { out.reasons.push('IMPORT_SCHEMA_NOT_PROVISIONED'); return out; }
var rc = imbFindReceipt_(S, id); if (!rc) { out.reasons.push('IMPORT_BATCH_NOT_FOUND'); return out; }
out.receipt_status = imbStr_(rc.status); out.receipt_domain = imbStr_(rc.domain); out.receipt_mode = imbStr_(rc.mode);
if (out.receipt_domain !== 'shipment' || out.receipt_mode !== 'ADD_NEW') out.reasons.push('NOT_A_SHIPMENT_ADD_NEW_BATCH');
if (out.receipt_status === IMB_STATUS_.COMMITTED) out.reasons.push('BATCH_IS_COMMITTED_NEVER_CLEANED');
var sh = shiTable_(ss, 'shipments'), ln = shiTable_(ss, 'shipment_lines');
if (!sh || !ln || !sh.has('import_batch_id') || !ln.has('import_batch_id')) { out.reasons.push('BATCH_COLUMN_MISSING'); return out; }
var mine = sh.rows.filter(function (r) { return imbStr_(r.import_batch_id) === id; }), ids = {}; mine.forEach(function (r) { ids[imbStr_(r.shipment_id)] = 1; });
var lines = ln.rows.filter(function (l) { return imbStr_(l.import_batch_id) === id || ids[imbStr_(l.shipment_id)]; }), lids = {}; lines.forEach(function (l) { lids[imbStr_(l.shipment_line_id)] = 1; });
// r5.2 (Owner): deleting EFFECTIVE data is never a recovery path. Only a header that never became effective (status blank + PENDING:*) and
// orphan lines may be removed; a flipped header (in_transit + final mode, or anything else) is refused, whatever signature is offered.
mine.forEach(function (r) { var pend = shiIsPending_(r) && imbStr_(r.status) === '';
if (!pend) out.reasons.push('SHIPMENT_EFFECTIVE_NOT_CLEANABLE ' + imbStr_(r.shipment_id));
else if (imbStr_(r.updated_by) !== 'import:' + id || imbStr_(r.record_origin) !== SHI_ORIGIN_HISTORICAL_) out.reasons.push('SHIPMENT_CHANGED_SINCE_IMPORT ' + imbStr_(r.shipment_id)); });
lines.forEach(function (l) { if (imbStr_(l.line_status) && shiLc_(l.line_status) !== 'active') out.reasons.push('LINE_CHANGED_SINCE_IMPORT ' + imbStr_(l.shipment_line_id)); });
// r5.4 (legacy): a line whose shipment_id is an EXISTING shipments row that is not one of this batch's headers belongs to that shipment
// (e.g. a legacy line carrying another batch id) - it is never removed as an orphan
var allSid = {}; sh.rows.forEach(function (r) { allSid[imbStr_(r.shipment_id)] = 1; });
lines.forEach(function (l) { var s0 = imbStr_(l.shipment_id); if (s0 && allSid[s0] && !ids[s0]) out.reasons.push('LINE_BELONGS_TO_EXISTING_SHIPMENT ' + imbStr_(l.shipment_line_id)); });
lines.forEach(function (l) { if ((Number(l.shipment_received_qty) || 0) !== 0) out.reasons.push('LINE_RECEIVED ' + imbStr_(l.shipment_line_id)); });
var used = {};
[['shipment_routes', 'shipment_id'], ['shipment_events', 'shipment_id'], ['shipment_line_allocations', 'shipment_line_id'], ['shipment_plan_links', 'shipment_id'], ['import_batch_changes', 'entity_id'], ['import_batch_changes', 'line_id']].forEach(function (p) {   // r5.2: + plan links + ANY audit row (a display-qty / date / Update edit, or this batch's own audit)
(shiRowsOf_(ss, p[0]) || []).forEach(function (r) { var k = imbStr_(r[p[1]]); if (ids[k] || lids[k]) used[p[0]] = 1; }); });
(shiRowsOf_(ss, 'overseas_inventory_movements') || []).forEach(function (m) { var ref = imbStr_(m.reference_id), c = ref.lastIndexOf(':'); if (c > 0 && lids[ref.slice(0, c)]) used.overseas_inventory_movements = 1; });
Object.keys(used).forEach(function (t) { out.reasons.push('REFERENCED_BY ' + t); });
out.shipment_rows = mine.map(function (r) { return { row: r.__r, shipment_id: imbStr_(r.shipment_id), shipment_no: imbStr_(r.shipment_no), external_shipment_id: imbStr_(r.external_shipment_id) }; });
out.line_rows = lines.map(function (l) { return { row: l.__r, shipment_line_id: imbStr_(l.shipment_line_id), shipment_id: imbStr_(l.shipment_id), sku: imbStr_(l.sku), qty: shiNumText_(l.shipment_qty) }; });
if (!mine.length && !lines.length) out.reasons.push('NOTHING_TO_REMOVE');
function canon(r) { var o = {}; Object.keys(r).sort().forEach(function (k) { if (k !== '__r') o[k] = shiCanonCell_(r[k]); }); return o; }
out.digest = 'cl1:' + imbSha_(JSON.stringify([id, out.receipt_status, mine.map(canon), lines.map(canon)])).slice(0, 24);
out.removable = !out.reasons.length;
return out;
}
function shipOpenCleanupDryRun(batchId) {
var out = shiCleanupPlan_(imbDb_(), batchId); out.mode = 'DRY_RUN';
try { Logger.log(JSON.stringify(out)); } catch (e) {}
return out;
}
function shipOpenCleanupApply(batchId, digest) {
var ss = imbDb_(), lock = LockService.getScriptLock();
if (!lock.tryLock(IMB_LOCK_MS_)) return { mode: 'APPLY', applied: false, reasons: ['LOCK_UNAVAILABLE'], writes_performed: 0 };
var J = null;
try {
var p = shiCleanupPlan_(ss, batchId);
if (!p.removable) return { mode: 'APPLY', applied: false, reasons: p.reasons, writes_performed: 0 };
if (imbStr_(digest) !== p.digest) return { mode: 'APPLY', applied: false, reasons: ['DIGEST_MISMATCH - the rows changed since the dry run (or another digest was given); run the dry run again'], writes_performed: 0 };
var sh = ss.getSheetByName('shipments'), ln = ss.getSheetByName('shipment_lines'), S = imbSheets_(ss), now = imbNow_();
J = imbJournal_();
p.line_rows.map(function (x) { return x.row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { J.deleteRow(ln, r); });
p.shipment_rows.map(function (x) { return x.row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { J.deleteRow(sh, r); });
var rc = imbFindReceipt_(S, p.import_batch_id);
imbSetReceipt_(S, rc.__sheetRow, { status: IMB_STATUS_.FAILED_ROLLED_BACK, updated_at: now, error: ('OWNER_CLEANUP ' + now + ' removed ' + p.shipment_rows.length + ' shipment row(s) + ' + p.line_rows.length + ' line row(s) of a ' + p.receipt_status + ' batch; digest ' + p.digest + ' | ' + imbStr_(rc.error)).slice(0, 1000) });
SpreadsheetApp.flush();
return { mode: 'APPLY', applied: true, removed_shipment_rows: p.shipment_rows.length, removed_line_rows: p.line_rows.length, receipt_status_before: p.receipt_status, receipt_status_after: IMB_STATUS_.FAILED_ROLLED_BACK, digest: p.digest };
} catch (e) {
var failed = J ? J.undo() : 0;
return { mode: 'APPLY', applied: false, reasons: ['CLEANUP_FAILED ' + imbStr_(e && e.message || e)], undo_failures: failed, outcome: failed ? 'UNKNOWN - read the rows before anything else' : 'UNDONE' };
} finally { try { lock.releaseLock(); } catch (eU) {} }
}
function shiApplyUpdate_(ss, plan, ctx) {
var shT = shiTable_(ss, 'shipments'), lnT = shiTable_(ss, 'shipment_lines'), J = ctx.journal, actor = 'import:' + ctx.batch_id, now = ctx.now, n = 0;
var rowOf = {}; shT.rows.forEach(function (r) { rowOf[imbStr_(r.shipment_id)] = r.__r; });
var lineRowOf = {}; lnT.rows.forEach(function (r) { lineRowOf[imbStr_(r.shipment_line_id)] = r.__r; });
function set(T, table, row, field, value, before, entityId, lineId) { var c = T.col(field); if (c < 0) throw new Error('SHIPMENT_COLUMN_MISSING ' + table + '.' + field); var prev = J.setCell(T.sheet, row, c, value); J.change({ entity_table: table, entity_id: entityId, line_id: lineId || '', field: field, before: before === undefined ? shiCanonCell_(prev) : before, after: value }); n++; }
plan.targets.forEach(function (t) {
var row = rowOf[t.sid]; if (!row) throw new Error('SHIPMENT_VANISHED ' + t.sid);
t.changes.forEach(function (c) { set(shT, 'shipments', row, c.field, c.after, c.before, t.sid); });
var lines = {};
t.lineChanges.forEach(function (c) { var lr = lineRowOf[c.line_id]; if (!lr) throw new Error('SHIPMENT_LINE_VANISHED ' + c.line_id); set(lnT, 'shipment_lines', lr, c.field, c.after, c.before, t.sid, c.line_id); lines[c.line_id] = lr; });
Object.keys(lines).forEach(function (lid) { if (lnT.col('updated_at') >= 0) set(lnT, 'shipment_lines', lines[lid], 'updated_at', now, undefined, t.sid, lid); });
if (shT.col('updated_at') >= 0) set(shT, 'shipments', row, 'updated_at', editNextStamp_(now, [(shT.rows.filter(function (x) { return x.__r === row; })[0] || {}).updated_at]), undefined, t.sid);   // R71 small-3 (review m1)
if (shT.col('updated_by') >= 0) set(shT, 'shipments', row, 'updated_by', actor, undefined, t.sid);
});
return { result: { updated_shipments: plan.targets.length, cells_written: n, stock_movements: 0, reservations: 0, status_changes: 0, quantity_changes: 0 } };
}


function imbShipmentDomain_() {
return {
domain: 'shipment', schema_version: SHI_SCHEMA_VERSION_, modes: ['ADD_NEW', 'UPDATE', 'ROUTE_INIT'], sheets: ['Header', 'Lines'], maxRows: IMB_MAX_ROWS_,   // STAGE 2: + ROUTE_INIT (87_, existing imported shipments)
template: function (ss, o) { if (o && o.mode === 'ROUTE_INIT') { var eT = new Error('ROUTE_INIT has no XLSX template - positions are chosen in the import preview'); eT.importCode = 'IMPORT_MODE_INVALID'; throw eT; } return shiTemplate_(ss, o || {}); },
validate: function (ss, req) { return req.mode === 'ROUTE_INIT' ? rtiValidateInit_(ss, req) : (req.mode === 'UPDATE' ? shiValidateUpdate_(ss, req) : shiValidateAdd_(ss, req)); },
apply: function (ss, plan, ctx) { return plan && plan.mode === 'ROUTE_INIT' ? rtiApplyInit_(ss, plan, ctx) : (plan && plan.mode === 'UPDATE' ? shiApplyUpdate_(ss, plan, ctx) : shiApplyAdd_(ss, plan, ctx)); },
residue: function (ss, id, receipt) { return shiResidue_(ss, id, receipt); }   // SHIP-OPEN 2a: read-only reconcile
};
}

function shiDictionary_() {
return { schema_version: SHI_SCHEMA_VERSION_, fields: SHI_FIELDS_, not_importable: SHI_NOT_IMPORTABLE_, historical_statuses: SHI_HIST_STATUSES_, open_statuses: SHI_OPEN_STATUSES_,
done_statuses: SHI_DONE_STATUSES_, status_aliases: SHI_STATUS_ALIASES_, refused_statuses: SHI_REFUSED_STATUSES_, proposed_columns: SHI_NEW_COLUMNS_, origin_historical: SHI_ORIGIN_HISTORICAL_ };
}

// ===== XCO-R15G (80_): an import never erases or forges a system marker =====
function xcoImportNote_(ss, issues, sn, r, ch, ship, line) {
  var re = /\[SC13_[A-Z_]+:[^\]\r\n]*\]/g;
  var before = String(ch.before == null ? '' : ch.before).match(re) || [], after = String(ch.after == null ? '' : ch.after).match(re) || [];
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    imbIssue_(issues, sn, r.__row, 'note', 'IMPORT_LINEAGE_MARKER_PROTECTED', 'this note carries ' + before.length + ' system marker(s) [SC13_...] and the file has ' + after.length + ' that differ: they must stay exactly as exported - edit only the text around them', '');
    return null;
  }
  if (line) {
    var n = 0;
    try { n = xcoLinkCount_(ss, imbStr_(ship.shipment_id)); }
    catch (e) { imbIssue_(issues, sn, r.__row, 'note', 'IMPORT_LINEAGE_INVALID', 'the plan links of shipment ' + imbStr_(ship.shipment_id) + ' cannot be proven (' + String(e && e.message || e) + ')', ''); return null; }
    if (n >= 2) {
      try { sc13SourceStrict_(ss, Object.assign({}, line, { note: ch.after }), ship); }
      catch (e2) { imbIssue_(issues, sn, r.__row, 'note', 'IMPORT_LINEAGE_INVALID', 'line ' + imbStr_(line.shipment_line_id) + ' of a consolidated shipment: its lineage does not validate (' + String(e2 && e2.message || e2) + ')', ''); return null; }
    }
  }
  return ch;
}
// XCO-R15G-80 (xco-r15g-impl): patched

// XCO-R15G B1-MINOR-3: ADD_NEW never accepts [SC13_ text in a note.
// XCO-R15G-80B (xco-r15g-impl): patched

// XCO-R15G O-1 (80_): the status columns are never importable; ADD_NEW lines get an explicit line_status.
// XCO-R15G-80C-O1 (xco-r15g-impl): patched
// R15G-STAMPS (final candidate): patched
// SHIP-OPEN (joint-ship-open, local candidate): opening import of in-transit shipments; stamp bump left to the integrator
