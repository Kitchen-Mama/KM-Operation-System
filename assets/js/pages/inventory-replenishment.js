// Inventory Replenishment - Add SKU Modal

// F1-4B-FM5-R4UI-R3 (§9): the visible "Target Days" filter was removed — the canonical replenishment horizons are
// FIXED at D18/D30/D45/D90 and the materialized gap authority never consumes a UI target-days value, so a user must
// not be able to alter the horizon authority. This internal constant preserves the ONE legacy consumer that still
// records a target-days figure in the shipping-plan Decision Snapshot (snapshot_target_days / allocation draft).
var REPLEN_TARGET_DAYS = 90;

// F1-SHIPMENT-INCOMING-R4 — canonical MUTUALLY-EXCLUSIVE ETA bucket model for the "Shipping Shipment" card.
// A shipment line's REMAINING incoming (max(0, shipment_qty − shipment_received_qty)) lands in EXACTLY ONE
// bucket by its ETA distance in whole days from today. NOT cumulative (a +25-day line is 19_30 ONLY, never
// also 0_18). Boundaries: 0–18 (0..18) · 19–30 · 31–45 · 45+ (>=46). ETA before today (< 0) is OVERDUE — the
// planning authority has no canonical overdue treatment (reported SHIPMENT_OVERDUE_BUCKET_AUTHORITY_GAP), so
// this returns a distinct 'overdue' key by default; pass foldOverdueIntoEarliest=true to fold it into 0_18.
// Pure: no clock (caller supplies etaDays), no locale, no mutation.
function _irShipmentEtaBucket(etaDays, foldOverdueIntoEarliest) {
  var d = parseFloat(etaDays);
  if (!isFinite(d)) return 'unknown';
  if (d < 0) return foldOverdueIntoEarliest ? 'd0_18' : 'overdue';
  if (d <= 18) return 'd0_18';
  if (d <= 30) return 'd19_30';
  if (d <= 45) return 'd31_45';
  return 'd45_plus';
}

// Frontend mirror of the canonical remaining-incoming authority (backend owner = supply candidate
// quantityRemaining / procShipmentRemainingQty_). max(0, shipmentQty − receivedQty); blank/invalid → 0.
function _irRemainingIncoming(shipmentQty, receivedQty) {
  var s = parseFloat(shipmentQty); if (!isFinite(s) || s < 0) s = 0;
  var r = parseFloat(receivedQty); if (!isFinite(r) || r < 0) r = 0;
  var rem = s - r;
  return rem > 0 ? rem : 0;
}

// Aggregate remaining incoming into the four mutually-exclusive ETA buckets. lines = [{ etaDays, remaining }].
// Returns { d0_18, d19_30, d31_45, d45_plus, overdue } (numbers). This is the bucket MODEL the card consumes
// once wired to real shipment data; it never double-counts a line across buckets.
function _irBucketRemainingByEta(lines, foldOverdueIntoEarliest) {
  var b = { d0_18: 0, d19_30: 0, d31_45: 0, d45_plus: 0, overdue: 0, unknown: 0 };
  (lines || []).forEach(function (ln) {
    var key = _irShipmentEtaBucket(ln.etaDays, foldOverdueIntoEarliest);
    var q = parseFloat(ln.remaining); if (!isFinite(q) || q < 0) q = 0;
    b[key] = (b[key] || 0) + q;
  });
  return b;
}
// F1-SHIPMENT-INCOMING-R5 — canonical receiver identity + shipment→receiver remaining-incoming projection.
// Receiver key = company|country|marketplace|sku (lowercased). NEVER derived from destination display text
// or warehouse_code; warehouse identity is separate. A MULTI-marketplace (merged) shipment keys as
// '…|multi|…' so it never lands on a specific-marketplace receiver row (merged per-receiver split has no
// frozen shipment-line→plan-line linkage — MERGED_SHIPMENT_FROZEN_SHARE_AUTHORITY_GAP; excluded here).
function _irReceiverKey(company, country, marketplace, sku) {
  return [company, country, marketplace, sku].map(function (x) { return String(x == null ? '' : x).trim().toLowerCase(); }).join('|');
}
// R7C: mirrors the core owner's isSpecificReceiver — a receiver is specific only with a company + country +
// a non-merged marketplace (blank / multi / merged / mixed / combined are NOT a specific receiver).
function _irIsSpecificReceiver(company, country, marketplace) {
  var c = String(company == null ? '' : company).trim(), cy = String(country == null ? '' : country).trim();
  var m = String(marketplace == null ? '' : marketplace).trim().toLowerCase();
  return c.length > 0 && cy.length > 0 && m.length > 0 && !/multi|merged|mixed|combined/.test(m);
}
// Strict YYYY-MM-DD → UTC ms (midnight). Returns null on anything else (no clock, no locale).
function _irEtaMs(s) {
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s == null ? '' : s).trim());
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}
// Terminal shipment statuses contribute ZERO incoming (mirrors the procurement CLOSED set / R4 filter).
var _IR_TERMINAL_SHIPMENT_STATUS = { completed: 1, received: 1, closed: 1, cancelled: 1, canceled: 1, delivered: 1 };

// ONE projection owner: shipments + shipment_lines → { receiverKey → { overdue, d0_18, d19_30, d31_45,
// d45_plus, unknown } } of REMAINING incoming (MAX(0, shipment_qty − shipment_received_qty)), bucketed
// mutually-exclusively by the shipment ETA distance in whole days from todayMs. Terminal shipments and
// fully-received lines contribute 0. wh_on_the_way_* is NEVER read. Pure (todayMs supplied by caller).
// lineReceiverById (R6, optional): shipping_plan_line_id → { company, country, marketplace } FROZEN receiver
// lineage. When a shipment line carries valid lineage, the line is attributed to that receiver (this is how a
// MERGED/MULTI shipment's lines land on their real receivers — deterministic, dispatch-time, never live FC
// Share). When absent (historical rows / ordinary shipments), the shipment HEADER scope is used (ordinary =
// correct; MULTI header → '…|multi|…' → excluded from any specific-marketplace receiver, exactly as R5).
function _irBuildShipmentRemainingByReceiver(shipments, shipmentLines, todayMs, lineReceiverById) {
  var byId = {};
  (shipments || []).forEach(function (s) { if (s && s.shipmentId) byId[s.shipmentId] = s; });
  var lineRecv = lineReceiverById || {};
  var map = {};
  (shipmentLines || []).forEach(function (ln) {
    if (!ln) return;
    var s = byId[ln.shipmentId]; if (!s) return;
    if (_IR_TERMINAL_SHIPMENT_STATUS[String(s.status || '').trim().toLowerCase()]) return;   // terminal → 0
    var remaining = _irRemainingIncoming(ln.shipmentQty, ln.shipmentReceivedQty);
    if (remaining <= 0) return;   // fully received / nothing remaining
    var etaMs = _irEtaMs(s.eta);
    var days = (etaMs === null) ? null : Math.floor((etaMs - todayMs) / 86400000);
    var bucket = (days === null) ? 'unknown' : _irShipmentEtaBucket(days);   // negative → 'overdue'
    // R7C card parity with the core resolver (KMSLS): FROZEN lineage wins (1:1 shipment_line→plan_line). A
    // PRESENT-but-unresolvable lineage FAILS CLOSED — it must NOT silently fall back to the shipment header
    // (that would mis-attribute a merged line to a MULTI/wrong header). Only a BLANK lineage uses header scope
    // (ordinary rows correct; a MULTI header then yields a '…|multi|…' key excluded from specific receivers).
    var rcv;
    if (ln.shippingPlanLineId) {
      var lr = lineRecv[ln.shippingPlanLineId];
      if (!lr || !_irIsSpecificReceiver(lr.company, lr.country, lr.marketplace)) return;   // present but unresolved → fail closed
      rcv = lr;
    } else {
      rcv = s;   // blank lineage → header scope
    }
    var key = _irReceiverKey(rcv.company, rcv.country, rcv.marketplace, ln.sku);
    var rec = map[key] || (map[key] = { overdue: 0, d0_18: 0, d19_30: 0, d31_45: 0, d45_plus: 0, unknown: 0 });
    rec[bucket] += remaining;
  });
  return map;
}
if (typeof window !== 'undefined') {
  window._irShipmentEtaBucket = _irShipmentEtaBucket;
  window._irRemainingIncoming = _irRemainingIncoming;
  window._irBucketRemainingByEta = _irBucketRemainingByEta;
  window._irReceiverKey = _irReceiverKey;
  window._irIsSpecificReceiver = _irIsSpecificReceiver;
  window._irBuildShipmentRemainingByReceiver = _irBuildShipmentRemainingByReceiver;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _irShipmentEtaBucket: _irShipmentEtaBucket, _irRemainingIncoming: _irRemainingIncoming, _irBucketRemainingByEta: _irBucketRemainingByEta, _irReceiverKey: _irReceiverKey, _irIsSpecificReceiver: _irIsSpecificReceiver, _irEtaMs: _irEtaMs, _irBuildShipmentRemainingByReceiver: _irBuildShipmentRemainingByReceiver };
}

function openReplenAddSkuModal() {
  const modal = document.getElementById('replen-add-sku-modal');
  const overlay = document.getElementById('replen-modal-overlay');

  if (!modal || !overlay) return;

  // Marketplace dropdown is sourced from the active marketplaces registry.
  populateReplenAddSkuMarketplaces();

  // Company / Country / Currency are derived (read-only) from the selected marketplace.
  ['replen-add-company', 'replen-add-country', 'replen-add-currency'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  // Reset SKU + Site SKU (Site SKU re-prefills from SKU).
  var skuEl = document.getElementById('replen-add-sku');
  if (skuEl) skuEl.value = '';
  var siteEl = document.getElementById('replen-add-site-sku');
  if (siteEl) { siteEl.value = ''; siteEl.dataset.autofill = '1'; }

  modal.classList.add('is-open');
  overlay.classList.add('is-open');
}

// Ensure a select carries (and selects) a value even if it's not in the static option list.
function setSelectValueEnsureOption(sel, val) {
  if (!sel) return;
  val = val || '';
  if (val) {
    var found = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === val) { found = true; break; }
    }
    if (!found) {
      var o = document.createElement('option');
      o.value = val; o.textContent = val;
      sel.appendChild(o);
    }
  }
  sel.value = val;
}

// Populate the Add SKU marketplace dropdown from active marketplaces (registry).
function populateReplenAddSkuMarketplaces() {
  var sel = document.getElementById('replen-add-marketplace');
  if (!sel) return;
  var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  var active = list.filter(function(m) { var s = (m.status || '').toLowerCase(); return !s || s === 'active'; });
  sel.innerHTML = '';
  if (active.length === 0) {
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'No active marketplaces — add one first';
    sel.appendChild(ph);
  } else {
    var ph0 = document.createElement('option');
    ph0.value = '';
    ph0.textContent = 'Select marketplace…';
    sel.appendChild(ph0);
    active.forEach(function(m) {
      var o = document.createElement('option');
      o.value = m.marketplaceId || '';
      o.setAttribute('data-company', m.company || '');
      o.setAttribute('data-country', m.country || '');
      o.setAttribute('data-marketplace', m.marketplace || '');
      o.setAttribute('data-currency', m.currency || '');
      o.setAttribute('data-fulfillment', m.fulfillmentModel || '');
      o.textContent = (m.marketplaceDisplayName || m.marketplace || '') + ' (' + (m.company || '') + ' / ' + (m.country || '') + ')';
      sel.appendChild(o);
    });
  }
  onReplenAddMarketplaceChange();
}

// When a marketplace is selected, auto-fill company / country / currency / marketplace_id.
function onReplenAddMarketplaceChange() {
  var sel = document.getElementById('replen-add-marketplace');
  var opt = sel && sel.selectedOptions && sel.selectedOptions[0];
  var company = opt ? (opt.getAttribute('data-company') || '') : '';
  var country = opt ? (opt.getAttribute('data-country') || '') : '';
  var currency = opt ? (opt.getAttribute('data-currency') || '') : '';
  var ffModel = opt ? (opt.getAttribute('data-fulfillment') || '') : '';
  var mpId = opt ? (opt.value || '') : '';
  setSelectValueEnsureOption(document.getElementById('replen-add-company'), company);
  setSelectValueEnsureOption(document.getElementById('replen-add-country'), country);
  setSelectValueEnsureOption(document.getElementById('replen-add-currency'), currency);
  var idEl = document.getElementById('replen-add-marketplace-id');
  if (idEl) idEl.value = mpId;

  // Fulfillment Model lock rule (platform/self locked; hybrid lets PM choose platform/self).
  var ffSel = document.getElementById('replen-add-fulfillment');
  var ffHint = document.getElementById('replen-add-fulfillment-hint');
  if (!mpId) {
    if (ffSel) { ffSel.innerHTML = '<option value=""></option>'; ffSel.disabled = true; ffSel.value = ''; }
    if (ffHint) ffHint.textContent = 'Select a marketplace first.';
  } else {
    applyFulfillmentLock(ffSel, ffHint, ffModel, '');
  }
  // ASIN required rule: required for Amazon marketplaces, optional otherwise — driven by the SAME owner the
  // submit validation uses (isReplenAmazonMarketplace). Updates immediately on marketplace switch; never clears
  // the existing ASIN value.
  var marketplaceToken = opt ? (opt.getAttribute('data-marketplace') || '') : '';
  updateReplenAsinRequirement(marketplaceToken);
}

// Canonical Amazon-marketplace detection (ONE owner for the ASIN required indicator + submit validation). Matches
// by PLATFORM PREFIX of the canonical marketplace token (AMAZON_<country>, e.g. AMAZON_US / AMAZON_UK / AMAZON_CA,
// and a literal "Amazon") — NOT a hardcoded list of Amazon countries. Non-Amazon tokens (Walmart / KM Walmart /
// WALMART_US / …) return false. "AMAZONIA"-style false-positives are excluded by the letter boundary.
function isReplenAmazonMarketplace(marketplaceToken) {
  var s = String(marketplaceToken == null ? '' : marketplaceToken).trim().toUpperCase();
  return /^AMAZON(?:$|[^A-Z])/.test(s);
}
// Apply the ASIN requirement to the label (* suffix) + input required state from the SAME authority. Never clears
// the value (a marketplace switch keeps whatever ASIN was already typed).
function updateReplenAsinRequirement(marketplaceToken) {
  var amazon = isReplenAmazonMarketplace(marketplaceToken);
  var label = document.getElementById('replen-add-asin-label');
  var input = document.getElementById('replen-add-asin');
  if (label) label.textContent = amazon ? 'ASIN *' : 'ASIN';
  if (input) {
    if (amazon) { input.setAttribute('required', 'required'); input.setAttribute('aria-required', 'true'); }
    else { input.removeAttribute('required'); input.setAttribute('aria-required', 'false'); }
    input.setAttribute('data-asin-required', amazon ? 'true' : 'false');   // shared flag (DOM required state)
  }
}
window.isReplenAmazonMarketplace = isReplenAmazonMarketplace;
window.updateReplenAsinRequirement = updateReplenAsinRequirement;

// Fulfillment Model lock rule (shared by Add SKU / Edit SKU):
//  - marketplace = platform_fulfilled | self_fulfilled  -> SKU value auto-filled + locked.
//  - marketplace = hybrid                               -> PM picks platform_fulfilled / self_fulfilled.
//  - marketplace model unknown/blank                    -> free choice (no enforcement).
var FULFILLMENT_LABELS = { platform_fulfilled: 'Platform Fulfilled', self_fulfilled: 'Self Fulfilled', hybrid: 'Hybrid' };
function applyFulfillmentLock(selectEl, hintEl, marketplaceModel, currentValue) {
  if (!selectEl) return;
  marketplaceModel = String(marketplaceModel || '').trim();
  function opt(v) { return '<option value="' + v + '">' + (FULFILLMENT_LABELS[v] || v) + '</option>'; }
  if (marketplaceModel === 'platform_fulfilled' || marketplaceModel === 'self_fulfilled') {
    selectEl.innerHTML = opt(marketplaceModel);
    selectEl.value = marketplaceModel;
    selectEl.disabled = true;
    if (hintEl) hintEl.textContent = 'Locked — inherited from marketplace (' + FULFILLMENT_LABELS[marketplaceModel] + ').';
  } else if (marketplaceModel === 'hybrid') {
    selectEl.innerHTML = opt('platform_fulfilled') + opt('self_fulfilled');
    selectEl.value = (currentValue === 'platform_fulfilled' || currentValue === 'self_fulfilled') ? currentValue : 'platform_fulfilled';
    selectEl.disabled = false;
    if (hintEl) hintEl.textContent = 'Hybrid marketplace — select this SKU\'s fulfillment model.';
  } else {
    selectEl.innerHTML = '<option value="">(marketplace has no fulfillment model)</option>' + opt('platform_fulfilled') + opt('self_fulfilled') + opt('hybrid');
    selectEl.value = currentValue || '';
    selectEl.disabled = false;
    if (hintEl) hintEl.textContent = 'Marketplace has no fulfillment model set; choose if known.';
  }
}

window.populateReplenAddSkuMarketplaces = populateReplenAddSkuMarketplaces;
window.onReplenAddMarketplaceChange = onReplenAddMarketplaceChange;
window.applyFulfillmentLock = applyFulfillmentLock;

// ============================================================================
// IRMap — Inventory Table Mapping (Phase 1)
// Pure mapping/calculation helpers from existing snapshot/forecast/inventory data
// to the 貨物庫存表 fields. Implements docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md v1.0
// (Stock Card, Long Term Storage, Sales Trend, First Layer Summary, Days-of-Supply UI,
// AI Suggestion column structure, Fulfillment Model foundation).
//
// Constraints: read-only mapping. NO source is fabricated — every missing field/table
// safe-falls-back to 0 / empty (never random / placeholder values that look like data).
// The Need-bucket calculation engine is NOT implemented in Phase 1 (returns 0 structure).
// ============================================================================
window.IRMap = (function () {
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function eq(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
  function ymd(s) { return String(s == null ? '' : s).trim().slice(0, 10); }
  // Country compatibility (System Repair 1) — delegates to the shared inventory-compat contract
  // (UK ≡ GB same-market alias; EU sales aggregation handled separately). Safe exact-match fallback
  // if the shared module has not loaded, so behavior degrades to the previous exact comparison.
  function _irCountryMatch(rowCountry, scopeCountry) {
    return (typeof window !== 'undefined' && window.IRCountry)
      ? window.IRCountry.matches(rowCountry, scopeCountry)
      : eq(rowCountry, scopeCountry);
  }

  function todayYmd() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function ymdNDaysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // Pick the row with the latest snapshotDate matching company + country + sku (marketplace optional).
  // company is enforced only when the row carries one (Amazon snapshot tables have no company column;
  // isolation is guaranteed upstream by the company-scoped SKU universe — see _getCloudReplenishmentData).
  function latestSnapshot(rows, scope) {
    if (!rows || !rows.length) return null;
    var best = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!eq(r.sku, scope.sku)) continue;
      if (scope.company && r.company && !eq(r.company, scope.company)) continue;
      // Country is alias-aware (UK ≡ GB — same market; e.g. amazon_inventory_snapshot.country='GB'
      // for an Amazon UK site). NO EU aggregation here — inventory identity is per single market.
      if (scope.country && r.country && !_irCountryMatch(r.country, scope.country)) continue;
      if (scope.marketplace && r.marketplace && !eq(r.marketplace, scope.marketplace)) continue;
      if (!best || ymd(r.snapshotDate) > ymd(best.snapshotDate)) best = r;
    }
    return best;
  }

  // Stock Card ← amazon_inventory_snapshot
  function stockCard(inv) {
    return {
      available: inv ? num(inv.availableQty) : 0,
      fcTransfer: inv ? num(inv.fcTransferQty) : 0,
      fcProcessing: inv ? num(inv.fcProcessingQty) : 0,
      customerOrders: inv ? num(inv.customerOrderQty) : 0,
      unsellable: inv ? num(inv.unfulfillableQty) : 0
    };
  }

  // Long Term Storage ← amazon_inventory_health_snapshot.
  // Over 90+ = 91–180 bucket; Over 180+ = 181_270 + 271_365 + 366_455 + 456_plus.
  // The finer 366_455 / 456_plus buckets may be absent → safe 0 (no error).
  // Long Term Storage (unified, no country branch; missing/blank → 0):
  //   Over 90+  = inv_age_91_to_180_days   (inv_age_0_to_90_days is NOT included)
  //   Over 180+ = inv_age_181_to_270_days + inv_age_271_to_365_days + inv_age_365_plus_days
  //               + inv_age_366_to_455_days + inv_age_456_plus_days
  // (INVENTORY_TABLE_MAPPING_SPEC §5; never uses inv_age_61_to_90_days.)
  function longTermStorage(h) {
    if (!h) return { over90: 0, over180: 0 };
    var over90 = num(h.invAge91To180Days);
    var over180 = num(h.invAge181To270Days) + num(h.invAge271To365Days)
                + num(h.invAge365PlusDays) + num(h.invAge366To455Days) + num(h.invAge456PlusDays);
    return { over90: over90, over180: over180 };
  }

  // Sales Trend — exactly SEVEN calendar dates ending on the LATEST available sales date in the
  // scoped DB result (NOT browser-today, NOT the last N returned rows). Range = latest_db_date − 6
  // … latest_db_date, sorted chronologically. A date within the window with no row is still rendered
  // (its `units` is null = explicit no-data GAP, never a fabricated 0 — see DO-NOT rule). Returns []
  // only when the scope has zero daily rows (honest empty chart). (INVENTORY_TABLE_MAPPING_SPEC §6.)
  function salesTrend7d(dailyRows, scope) {
    var byDate = {}, latest = '';
    // Country membership (System Repair 1): UK ≡ GB alias; Amazon EU sums IT/DE/ES/FR per date
    // (byDate accumulation naturally sums the member markets). Legacy 'EU' rows are used only when no
    // per-country member row exists (salesTrendCountries applies that precedence).
    var _trendSet = (typeof window !== 'undefined' && window.IRCountry)
      ? window.IRCountry.salesTrendCountries(dailyRows || [], scope) : null;
    (dailyRows || []).forEach(function (r) {
      if (!eq(r.sku, scope.sku)) return;
      if (scope.company && r.company && !eq(r.company, scope.company)) return;
      if (scope.country && r.country) {
        if (_trendSet) { if (!_trendSet.any && _trendSet.members.indexOf(window.IRCountry.up(r.country)) === -1) return; }
        else if (!eq(r.country, scope.country)) return;
      }
      if (scope.marketplace && r.marketplace && !eq(r.marketplace, scope.marketplace)) return;
      var d = ymd(r.snapshotDate);
      if (!d) return;
      byDate[d] = (byDate[d] || 0) + num(r.salesUnits);
      if (d > latest) latest = d;   // latest DB date in the SCOPED result
    });
    if (!latest) return [];   // no scoped sales data → honest empty (never fabricated)
    // Build the 7 calendar dates ending on `latest`, oldest → newest.
    var parts = latest.split('-');
    var end = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var dt = new Date(end.getTime());
      dt.setUTCDate(end.getUTCDate() - i);
      var key = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
      var has = byDate.hasOwnProperty(key);
      out.push({ date: key, label: key.slice(5).replace('-', '/'), units: has ? byDate[key] : null, hasData: has });
    }
    return out;   // always 7 entries when any scoped data exists
  }

  // Avg Sales / Day ← amazon_weekly_sales_snapshot.sales_units_7d / 7 (1 decimal).
  // Country handling (System Repair 1) is delegated to the shared inventory-compat contract:
  //   - single market: the latest week's units (UK ≡ GB alias-aware)
  //   - Amazon EU (scope.country='EU'): SUM of IT + DE + ES + FR (each market's OWN latest week;
  //     legacy pan-EU 'EU' row used only as a fallback, never double-counted)
  // Isolation: Amazon FR/DE/ES/IT and every non-EU context stay single-market. The /7 rounding is
  // unchanged (no formula change). Falls back to the previous exact-match logic if the module is absent.
  function avgSalesPerDay(weeklyRows, scope) {
    if (!weeklyRows || !weeklyRows.length) return 0;
    var units;
    if (typeof window !== 'undefined' && window.IRCountry) {
      units = window.IRCountry.weeklyUnits7d(weeklyRows, scope);
    } else {
      var best = null;
      weeklyRows.forEach(function (r) {
        if (!eq(r.sku, scope.sku)) return;
        if (scope.company && r.company && !eq(r.company, scope.company)) return;
        if (scope.country && r.country && !eq(r.country, scope.country)) return;
        if (scope.marketplace && r.marketplace && !eq(r.marketplace, scope.marketplace)) return;
        var key = r.weekEndDate || r.snapshotWeek || '';
        if (!best || String(key) > String(best.weekEndDate || best.snapshotWeek || '')) best = r;
      });
      units = best ? num(best.salesUnits7d) : null;
    }
    if (units == null) return 0;
    return Math.round((units / 7) * 10) / 10;
  }

  // Resolve the single applicable Target Rule % (SKU > Series > Category). Default 100%.
  function targetPct(rules, scope) {
    if (!rules || !rules.length) return 100;
    function inScope(r) {
      if (r.company && scope.company && !eq(r.company, scope.company)) return false;
      if (r.country && scope.country && !eq(r.country, scope.country)) return false;
      if (r.marketplace && scope.marketplace && !eq(r.marketplace, scope.marketplace)) return false;
      return true;
    }
    var levels = [['sku', scope.sku], ['series', scope.series], ['category', scope.category]];
    for (var i = 0; i < levels.length; i++) {
      var type = levels[i][0], id = levels[i][1];
      if (!id) continue;
      var hit = rules.find(function (r) {
        return inScope(r) && r.scopeType === type && eq(r.scopeId, id) && r.targetPercentage != null;
      });
      if (hit) return num(hit.targetPercentage);
    }
    return 100;
  }

  // F1-4B-FM5-R4UI-R7 §0/§F — canonical "90 days FC" USER REFERENCE field (independent of Planning Model):
  //   SUM of the next 3 forecast months' Base FC  +  SUM of Special Event fc_qty whose applicable month falls
  //   inside those same 3 forecast months (each event counted ONCE). This is a display reference ONLY — NOT
  //   D90 demandQty, NOT Avg Sales/day × 90, NO inventory subtraction, NO gap logic, NO Target% (it is Base FC).
  //   It reuses the SAME already-loaded fc_regular_forecast + fc_special_events facts that power the Forecast
  //   Breakdown + Upcoming Event cards. Sales-Driven and Forecast-Driven SKUs display the SAME reference.
  //   (`rules` retained in the signature for call-site compatibility; Target% is intentionally NOT applied.)
  function forecast60d(fcRows, rules, scope, events) {
    var cm = new Date().getMonth();
    var base = 0;
    if (fcRows && fcRows.length) {
      var fc = fcRows.find(function (r) {
        return eq(r.sku, scope.sku)
          && (!scope.company || !r.company || eq(r.company, scope.company))
          && (!scope.country || !r.country || eq(r.country, scope.country))
          && (!scope.marketplace || !r.marketplace || eq(r.marketplace, scope.marketplace));
      });
      if (fc) base = num(fc[MONTHS[(cm + 1) % 12]]) + num(fc[MONTHS[(cm + 2) % 12]]) + num(fc[MONTHS[(cm + 3) % 12]]);
    }
    // Special events whose applicable calendar month ∈ the next-3 forecast months, active + scope-matched, once.
    var allowed = {}; allowed[((cm + 1) % 12) + 1] = 1; allowed[((cm + 2) % 12) + 1] = 1; allowed[((cm + 3) % 12) + 1] = 1;
    var evtQty = 0;
    (events || []).forEach(function (ev) {
      if (!_irEventActive(ev) || !_irEventScopeMatch(ev, scope)) return;
      var mo = parseEventMonth(ev);
      if (mo === null) { var sd = _irParseDate(ev.eventStartDate); if (sd) mo = sd.getMonth() + 1; }
      if (mo === null || !allowed[mo]) return;
      evtQty += num(ev.fcQty);
    });
    return Math.round(base + evtQty);
  }

  // Planning-only 2-month Target%-adjusted forecast used by the 3PL 18-day site-planning allocation (§20/§23/§24).
  // Kept SEPARATE from the UI "90 days FC" reference (forecast60d) so the R7 §F reference-field redefinition never
  // leaks into a planning/shortage calc. This preserves the pre-R7 3PL allocation behavior byte-for-byte.
  function _irForecastPlanning2mo(fcRows, rules, scope) {
    if (!fcRows || !fcRows.length) return 0;
    var fc = fcRows.find(function (r) {
      return eq(r.sku, scope.sku)
        && (!scope.company || !r.company || eq(r.company, scope.company))
        && (!scope.country || !r.country || eq(r.country, scope.country))
        && (!scope.marketplace || !r.marketplace || eq(r.marketplace, scope.marketplace));
    });
    if (!fc) return 0;
    var cm = new Date().getMonth();
    var pct = targetPct(rules, {
      company: scope.company, country: scope.country, marketplace: scope.marketplace,
      sku: scope.sku, series: fc.series || scope.series, category: fc.category || scope.category
    }) / 100;
    return Math.round((num(fc[MONTHS[(cm + 1) % 12]]) + num(fc[MONTHS[(cm + 2) % 12]])) * pct);
  }

  function parseEventMonth(ev) {
    if (ev.eventMonth) { var em = parseInt(ev.eventMonth, 10); if (em >= 1 && em <= 12) return em; }
    var m = String(ev.eventPeriod || '').match(/(\d{1,2})\s*[\/\-]/);
    if (m) { var mm = parseInt(m[1], 10); if (mm >= 1 && mm <= 12) return mm; }
    return null;
  }

  // Parse an ISO-ish yyyy-mm-dd (or yyyy/mm/dd) date string → Date (local midnight), else null.
  function _irParseDate(d) {
    var s = String(d == null ? '' : d).trim(); if (!s) return null;
    var m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); if (!m) return null;
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }
  // First day of the month, addMonths from `date`.
  function _irFirstOfMonthPlus(date, addMonths) { return new Date(date.getFullYear(), date.getMonth() + addMonths, 1); }
  // Event is active unless explicitly inactive/cancelled/archived/closed (blank status = active, since
  // the live schema has no status column yet — never silently drop a blank-status event).
  function _irEventActive(ev) {
    var st = String(ev.status == null ? '' : ev.status).trim().toLowerCase();
    return !(st === 'inactive' || st === 'cancelled' || st === 'canceled' || st === 'archived' || st === 'closed' || st === 'draft');
  }
  function _irEventScopeMatch(ev, scope) {
    if (ev.country && scope.country && !eq(ev.country, scope.country)) return false;
    if (ev.marketplace && scope.marketplace && !eq(ev.marketplace, scope.marketplace)) return false;
    return (ev.sku && eq(ev.sku, scope.sku)) ||
      (ev.scopeType === 'sku' && eq(ev.scopeId, scope.sku)) ||
      (ev.scopeType === 'series' && eq(ev.scopeId, scope.series)) ||
      (ev.scopeType === 'category' && eq(ev.scopeId, scope.category)) ||
      (!ev.sku && !ev.scopeId);
  }

  // Dynamic Upcoming Events (scope-matched, active) from today through the next three calendar months.
  // Eligibility: event_end_date >= today AND event_start_date < first_day_of_month(today + 4 months).
  // Legacy rows without parseable start/end dates fall back to a month-window check (never dropped).
  // Returns the matched events (NOT merged) sorted nearest-first — the caller may total them, but the
  // underlying records stay separate.
  function upcomingEvents(events, scope) {
    if (!events || !events.length) return [];
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var windowEnd = _irFirstOfMonthPlus(today, 4);   // exclusive upper bound (start < windowEnd)
    var out = [];
    events.forEach(function (ev) {
      if (!_irEventActive(ev)) return;
      if (!_irEventScopeMatch(ev, scope)) return;
      var start = _irParseDate(ev.eventStartDate);
      var end = _irParseDate(ev.eventEndDate);
      if (start && end) {
        if (!(end >= today && start < windowEnd)) return;
      } else {
        // Legacy fallback: month-based window (current month + next 3). Unparseable month → included.
        var mo = parseEventMonth(ev);
        if (mo !== null) {
          var allowed = [today.getMonth() + 1, ((today.getMonth() + 1) % 12) + 1, ((today.getMonth() + 2) % 12) + 1, ((today.getMonth() + 3) % 12) + 1];
          if (allowed.indexOf(mo) === -1) return;
        }
      }
      out.push(ev);
    });
    out.sort(function (a, b) {
      var sa = _irParseDate(a.eventStartDate), sb = _irParseDate(b.eventStartDate);
      if (sa && sb) return sa - sb; if (sa) return -1; if (sb) return 1; return 0;
    });
    return out;
  }

  // Upcoming Event total = sum of fc_qty across the matched events (count-once; records stay separate).
  function upcomingEventQty(events, scope) {
    var list = upcomingEvents(events, scope);
    return list.reduce(function (s, ev) { return s + num(ev.fcQty); }, 0);
  }

  // 3rd Party Stock = Σ available_stock across eligible overseas warehouses (same country).
  function thirdPartyStock(overseasRows, warehouses, scope) {
    if (!overseasRows || !overseasRows.length) return 0;
    var whById = {};
    (warehouses || []).forEach(function (w) { if (w.warehouseId) whById[w.warehouseId] = w; });
    var total = 0;
    overseasRows.forEach(function (r) {
      if (!eq(r.sku, scope.sku)) return;
      var wh = whById[r.warehouseId];
      // Eligible = same country; exclude factory warehouses (warehouse country is the source of truth).
      if (wh) {
        if (scope.country && wh.country && !eq(wh.country, scope.country)) return;
        var isFactory = String((wh.raw && wh.raw.is_factory_warehouse) || '').toLowerCase();
        if (isFactory === 'true' || isFactory === '1' || isFactory === 'yes') return;
      }
      total += num(r.availableStock);
    });
    return total;
  }

  // ===== 3PL shared-pool 18-day virtual planning allocation (SUPPLY_PLANNING_CALCULATION_RULES §20/§23/§24) =====
  // Analysis/display only — moves no inventory, reserves nothing, writes nothing, creates no movement.

  // Eligible 3PL warehouses for a company+country scope: warehouse_type='3PL', is_active TRUE,
  // company AND country match. Never matched by warehouse_name / display text (identity is warehouse_id).
  function eligible3plWarehouses(warehouses, scope) {
    return (warehouses || []).filter(function (w) {
      if (!w || !w.warehouseId) return false;
      if (scope.company) { if (!w.company || !eq(w.company, scope.company)) return false; }
      if (scope.country) { if (!w.country || !eq(w.country, scope.country)) return false; }
      if (String(w.warehouseType || '').trim().toUpperCase() !== '3PL') return false;
      if (w.isActive !== true) return false;   // tri-state _whBool: require explicit TRUE (blank/unknown excluded)
      return true;
    });
  }

  // Shared physical pool for company+country+Master SKU. Joins overseas_inventory_snapshot to eligible
  // 3PL warehouses by warehouse_id + sku, retains warehouse-level detail, dedups by warehouse_id
  // (never by marketplace). Returns eligibility + snapshot presence so callers can show honest states.
  function sharedPhysicalPool(overseasRows, warehouses, scope) {
    var eligible = eligible3plWarehouses(warehouses, scope);
    var eligById = {}; eligible.forEach(function (w) { eligById[w.warehouseId] = w; });
    var byWh = {}; var snapshotAt = ''; var matchedAny = false;
    (overseasRows || []).forEach(function (r) {
      if (!eq(r.sku, scope.sku)) return;
      if (!eligById[r.warehouseId]) return;   // join strictly on eligible warehouse_id + sku
      matchedAny = true;
      byWh[r.warehouseId] = (byWh[r.warehouseId] || 0) + (num(r.availableStock) || 0);
      var ts = r.snapshotDate || r.lastMovementAt || r.updatedAt || r.createdAt || '';
      if (String(ts) > String(snapshotAt)) snapshotAt = String(ts);
    });
    var contributions = eligible.map(function (w) {
      return { warehouseId: w.warehouseId, warehouseName: w.warehouseName || w.warehouseId,
        qty: byWh[w.warehouseId] || 0, hasRow: Object.prototype.hasOwnProperty.call(byWh, w.warehouseId) };
    });
    var poolQty = contributions.reduce(function (s, c) { return s + c.qty; }, 0);
    return { eligibleCount: eligible.length, hasEligibleWarehouse: eligible.length > 0,
      hasSnapshot: matchedAny, poolQty: poolQty, contributions: contributions, snapshotAt: snapshotAt };
  }

  function _findMktReg(reg, scope) {
    return (reg || []).filter(function (m) {
      return (scope.marketplaceId && m.marketplaceId && m.marketplaceId === scope.marketplaceId) ||
        (eq(m.country, scope.country) && eq(m.marketplace, scope.marketplace) && (!scope.company || eq(m.company, scope.company)));
    })[0] || null;
  }

  // Allocate the shared pool across eligible self-fulfilled sites (§24). PHASE-1 SCOPE:
  //  - NORMAL (pool >= Σ 18-day need): each site protected to its 18-day need; the remainder stays
  //    UNALLOCATED. The §24.5-step-3 / Mode-B distribution of surplus BEYOND the 18-day floor requires
  //    the site's "applicable calculated Need" (Suggested-Qty engine), which is NOT implemented and which
  //    this task must not enable — so no surplus is distributed (reported as a known gap).
  //  - SHORTAGE (pool < Σ 18-day need): §24.7 weighted largest-remainder, deterministic tie-break
  //    (higher allocation_priority → larger unmet 18-day need → stable marketplace key). Caps at need.
  // Invariant: Σ allocations ≤ pool; each ≤ its 18-day need; non-negative integers; deterministic.
  function _allocateShared(pool, sites) {
    var byKey = {}; sites.forEach(function (s) { byKey[s.key] = 0; });
    var sumNeed = sites.reduce(function (a, s) { return a + Math.max(s.minNeed, 0); }, 0);
    if (!sites.length || sumNeed <= 0) {
      return { mode: 'NO_DEMAND', byKey: byKey, coverageRate: null,
        basis: 'No 18-day demand for any eligible site', warn: '' };
    }
    if (pool >= sumNeed) {
      sites.forEach(function (s) { byKey[s.key] = Math.max(s.minNeed, 0); });
      return { mode: 'NORMAL_ALLOCATION', byKey: byKey, coverageRate: 1,
        basis: '18-day protected need — each eligible site fully protected; surplus unallocated', warn: '' };
    }
    // SHORTAGE (§24.7)
    var rows = sites.map(function (s) {
      var w = Math.max(s.minNeed, 0) * Math.max(s.allocationPriority, 1);
      return { s: s, w: w };
    });
    var sumW = rows.reduce(function (a, x) { return a + x.w; }, 0);
    rows.forEach(function (x) {
      var raw = sumW > 0 ? (pool * x.w / sumW) : 0;
      var fl = Math.floor(raw);
      if (fl > x.s.minNeed) fl = x.s.minNeed;
      x.raw = raw; x.frac = raw - Math.floor(raw); x.qty = fl;
    });
    var assigned = rows.reduce(function (a, x) { return a + x.qty; }, 0);
    var remainder = pool - assigned;
    var order = rows.slice().sort(function (a, b) {
      if (b.frac !== a.frac) return b.frac - a.frac;                                  // largest remainder
      if (b.s.allocationPriority !== a.s.allocationPriority) return b.s.allocationPriority - a.s.allocationPriority; // (1)
      var ua = a.s.minNeed - a.qty, ub = b.s.minNeed - b.qty;
      if (ub !== ua) return ub - ua;                                                  // (2) larger unmet 18-day need
      return String(a.s.key) < String(b.s.key) ? -1 : (String(a.s.key) > String(b.s.key) ? 1 : 0); // (3) stable key
    });
    while (remainder > 0) {
      var placed = false;
      for (var i = 0; i < order.length && remainder > 0; i++) {
        if (order[i].qty < order[i].s.minNeed) { order[i].qty += 1; remainder -= 1; placed = true; }
      }
      if (!placed) break;   // every site capped at its 18-day need
    }
    rows.forEach(function (x) { byKey[x.s.key] = x.qty; });
    var warn = rows.some(function (x) { return x.qty === 0 && x.s.minNeed > 0; })
      ? 'Shortage: a site is allocated 0 vs its 18-day need — review allocation_priority.' : '';
    return { mode: 'SHORTAGE_ALLOCATION', byKey: byKey, coverageRate: pool / sumNeed,
      basis: 'Weighted shortage (18-day need × priority), deterministic largest-remainder', warn: warn };
  }

  // Orchestrator: build the pool + eligible self-fulfilled sibling sites (same company+country+Master
  // SKU), run the §24 engine, and return the CURRENT site's planning allocation + full display detail.
  // ctx = { scope, overseasRows, warehouses, mpSkus, marketplacesReg, weeklyRows, fcRows, targetRules }
  function sitePlanningAllocation(ctx) {
    var scope = ctx.scope;
    var pool = sharedPhysicalPool(ctx.overseasRows, ctx.warehouses, scope);

    // 3PL reserve is REPLENISHMENT RESERVE for the whole company+country scope. Fulfillment type does
    // NOT gate participation (fix 2026-07-22): a platform-fulfilled marketplace can still own/use the
    // overseas 3PL reserve as future platform-warehouse replenishment. Eligibility is warehouse-side
    // only (company + country + warehouse_type='3PL' + is_active), never marketplace fulfillment model.
    var participates = true;

    // Sibling sites sharing this pool = every scoped marketplace_sku (company + country + Master SKU),
    // regardless of fulfillment model. Each contributes its 18-day need to the shared allocation.
    var siteRows = (ctx.mpSkus || []).filter(function (m) {
      return eq(m.sku, scope.sku) && eq(m.country, scope.country) && (!scope.company || eq(m.company, scope.company)); });
    var sites = [];
    siteRows.forEach(function (m) {
      var reg = _findMktReg(ctx.marketplacesReg, { company: m.company, country: m.country, marketplace: m.marketplace, marketplaceId: m.marketplaceId });
      var siteScope = { company: m.company, country: m.country, marketplace: m.marketplace, sku: m.sku, series: '', category: '' };
      var demandMode = (m.replenishmentModel || 'sales_driven');
      var daily;
      if (demandMode === 'forecast_driven') {
        var fc60 = _irForecastPlanning2mo(ctx.fcRows, ctx.targetRules, siteScope);   // planning-only (NOT the UI 90-day reference)
        daily = fc60 > 0 ? (fc60 / 60) : 0;
      } else {
        daily = avgSalesPerDay(ctx.weeklyRows, siteScope);               // §22 canonical Avg Sales/Day
      }
      sites.push({
        key: m.marketplaceId || (m.company + '|' + m.country + '|' + m.marketplace),
        marketplace: m.marketplace, company: m.company, country: m.country,
        demandMode: demandMode, dailyDemand: daily,
        minNeed: Math.ceil(daily * 18),                                  // §24.4 CEILING(daily × 18)
        allocationPriority: (reg && reg.allocationPriority) || 0,
        isCurrent: eq(m.marketplace, scope.marketplace)
      });
    });

    var alloc = _allocateShared(pool.poolQty, sites);
    var cur = sites.filter(function (s) { return s.isCurrent; })[0];
    var curAlloc = cur ? (alloc.byKey[cur.key] || 0) : 0;
    var allocatedTotal = Object.keys(alloc.byKey).reduce(function (s, k) { return s + alloc.byKey[k]; }, 0);

    var state = 'OK';
    if (!pool.hasEligibleWarehouse) state = 'NO_ELIGIBLE_3PL';
    else if (!pool.hasSnapshot) state = 'MISSING_SNAPSHOT';
    // (No NOT_SELF_FULFILLED state — platform-fulfilled sites participate in the shared 3PL reserve.)

    return {
      state: state, participates: participates,
      sitePlanningAvailable: (state === 'OK') ? curAlloc : null,
      physicalPool: pool.poolQty, minNeed: cur ? cur.minNeed : 0,
      allocationMode: alloc.mode, allocationBasis: alloc.basis,
      allocatedToCurrent: curAlloc, allocatedToOthers: Math.max(allocatedTotal - curAlloc, 0),
      unallocatedPool: Math.max(pool.poolQty - allocatedTotal, 0),
      contributions: pool.contributions, eligibleCount: pool.eligibleCount,
      snapshotAt: pool.snapshotAt, coverageRate: alloc.coverageRate, warn: alloc.warn || '',
      siteCount: sites.length
    };
  }

  // Factory CN / TW = Σ factory_stock.current_stock joined to warehouses by warehouse_id,
  // filtered by warehouse country (CN / TW).
  function factoryByCountry(factoryRows, warehouses, sku, countryCode) {
    if (!factoryRows || !factoryRows.length) return 0;
    var whById = {};
    (warehouses || []).forEach(function (w) { if (w.warehouseId) whById[w.warehouseId] = w; });
    var total = 0;
    factoryRows.forEach(function (f) {
      if (!eq(f.sku, sku)) return;
      var wh = whById[f.warehouseId];
      var c = (wh && wh.country) || f.country || '';
      // Fallback: parse country from the WH-{COMPANY}-{COUNTRY}-... id convention.
      if (!c && f.warehouseId) { var parts = f.warehouseId.split('-'); if (parts.length >= 3) c = parts[2]; }
      if (eq(c, countryCode)) total += num(f.currentStock);
    });
    return total;
  }

  function daysOfSupply(currentStock, avgPerDay) {
    if (!avgPerDay || avgPerDay <= 0) return null; // undefined coverage — show '--', never fake
    return Math.round((num(currentStock) / avgPerDay) * 10) / 10;
  }

  // Days of Supply UI color: <30 red, 30–150 normal, >150 khaki/brown (long inventory warning).
  function dosColorClass(dos) {
    if (dos === null || dos === undefined || dos === '' || dos === '--') return '';
    var n = parseFloat(dos);
    if (isNaN(n)) return '';
    if (n < 30) return 'ir-dos--red';
    if (n > 150) return 'ir-dos--khaki';
    return '';
  }

  // Fulfillment model resolution + lock rule (Marketplace SKU overrides only when marketplace = hybrid).
  function resolveFulfillment(mpRow, mpSkuRow) {
    var mpModel = (mpRow && mpRow.fulfillmentModel) || '';
    var skuModel = (mpSkuRow && mpSkuRow.fulfillmentModel) || '';
    if (mpModel === 'platform_fulfilled') return { model: 'platform_fulfilled', locked: true, source: 'marketplace' };
    if (mpModel === 'self_fulfilled') return { model: 'self_fulfilled', locked: true, source: 'marketplace' };
    if (mpModel === 'hybrid') return { model: skuModel || 'hybrid', locked: false, source: skuModel ? 'sku' : 'marketplace' };
    // Marketplace model unknown (column absent): fall back to the SKU-level value if present.
    return { model: skuModel || '', locked: false, source: skuModel ? 'sku' : 'none' };
  }

  // Need-bucket structure. Phase 1: the calculation engine is NOT implemented → return 0s.
  // The bucket windows and Suggested Qty roll-up shape match the spec so the engine can drop in.
  function needBuckets() {
    return { need0_18: 0, need19_30: 0, need31_45: 0, need46_90: 0, suggestedQty: 0 };
  }

  return {
    num: num, latestSnapshot: latestSnapshot, stockCard: stockCard,
    longTermStorage: longTermStorage, salesTrend7d: salesTrend7d, avgSalesPerDay: avgSalesPerDay,
    targetPct: targetPct, forecast60d: forecast60d, upcomingEventQty: upcomingEventQty, upcomingEvents: upcomingEvents,
    thirdPartyStock: thirdPartyStock, factoryByCountry: factoryByCountry,
    eligible3plWarehouses: eligible3plWarehouses, sharedPhysicalPool: sharedPhysicalPool,
    sitePlanningAllocation: sitePlanningAllocation,
    daysOfSupply: daysOfSupply, dosColorClass: dosColorClass,
    resolveFulfillment: resolveFulfillment, needBuckets: needBuckets
  };
})();

// Format an Upcoming Event date range as "M.D~M.D" for the 3-month window (year always dropped —
// same-month 7.27~7.31, cross-month 7.29~8.4, cross-year 12.29~1.4 all render year-less). Parsing is
// done by regex on the Y-M-D / Y.M.D / Y/M/D string (NOT new Date()) to avoid any UTC off-by-one
// shift. The underlying event dates are NEVER mutated — this is display formatting only. Returns null
// when neither end parses so callers keep their existing safe fallback.
function _irParseYMD(s) {
    if (s == null) return null;
    var m = String(s).trim().match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return null;
    var mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
    return { m: mo, d: d };
}
function _irFmtEventDate(s) {
    var p = _irParseYMD(s);
    return p ? (p.m + '.' + p.d) : null;
}
function _irFmtEventRange(start, end) {
    var a = _irFmtEventDate(start), b = _irFmtEventDate(end);
    if (a && b) return a + '~' + b;
    return a || b || null;
}
window._irFmtEventRange = _irFmtEventRange;

// Render the Upcoming Event card body from a matched, nearest-first event list (IRMap.upcomingEvents):
// nearest event (name + start/end + fc_qty) shown first, remaining events in an expandable "+N more"
// (native <details> — keyboard accessible). Events are displayed separately (never merged into one row).
function _irRenderUpcoming(list) {
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function qty(v){ return (window.IRMap && IRMap.num) ? IRMap.num(v) : (parseFloat(v) || 0); }
  if (!list || !list.length) {
    return '<div class="replen-card__row"><span class="replen-card__label">No upcoming event</span><span class="replen-card__value">-</span></div>';
  }
  function line(ev){
    // Display "M.D~M.D" (year-less); keep the full range in title= for accessibility / hover.
    var fullR = (ev.eventStartDate && ev.eventEndDate) ? (ev.eventStartDate + ' ~ ' + ev.eventEndDate) : (ev.eventPeriod || '');
    var dates = _irFmtEventRange(ev.eventStartDate, ev.eventEndDate) || fullR;
    var titleAttr = fullR ? (' title="' + esc(fullR) + '"') : '';
    return '<div class="replen-card__row"><span class="replen-card__label">' + esc(ev.event || ev.scopeId || 'Event') +
      (dates ? (' <span class="replen-evt-dates"' + titleAttr + '>(' + esc(dates) + ')</span>') : '') +
      '</span><span class="replen-card__value">' + qty(ev.fcQty) + '</span></div>';
  }
  var html = line(list[0]);
  if (list.length > 1) {
    html += '<details class="replen-evt-more"><summary>+' + (list.length - 1) + ' more</summary>' +
      list.slice(1).map(line).join('') + '</details>';
  }
  return html;
}

// Render the 3rd Party Stock (Site Planning Available) detail body from a sitePlanningAllocation() result.
// Honest missing-data states — never a fabricated zero. Labels the number "Planning Available" (a
// distribution of the shared pool), never implying the site owns the whole pool.
// 3rd Party Stock card — SIMPLIFIED daily view (2026-07-22): shows only the physical 3PL warehouses
// contributing stock to the current Company/Country/Marketplace/SKU scope + their Available Physical
// Quantity + an optional Total. The full allocation/runtime detail (site_planning_available,
// physical_3pl_pool, protected_need, allocation_method, allocated_to_other_sites, unallocated_pool,
// coverage_rate, snapshot_as_of, priority/weighted-shortage/largest-remainder) is NOT deleted — it
// stays on the returned `plan` object (thirdPartyPlan) for the replenishment/shortage engine, the API
// response, and Admin Debug / Calculation Details. It is only hidden from this daily SKU-expand card.
function _irRenderThirdPartyDetail(plan) {
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmt(v){ return (Math.round(Number(v)) || 0).toLocaleString(); }
  function whRow(name, qty){ return '<div class="replen-card__row replen-tp-wh"><span class="replen-card__label">' + esc(name) + '</span><span class="replen-card__value">' + fmt(qty) + '</span></div>'; }
  if (!plan) return '<div class="replen-tp-empty">No 3rd Party Stock</div>';
  // SINGLE shared source (Round 4 Decision A): the summary total and this detail use the SAME rows
  // from IRWarehouse.buildPhysicalThirdPartyBreakdown → total = SUM(rows.qty). One row per physical
  // 3PL warehouse (deduped by warehouse_id; UK/GB same physical row never double-counted). Physical
  // availability only — never sitePlanningAvailable / FBA / virtual allocation.
  var bd = (window.IRWarehouse && window.IRWarehouse.buildPhysicalThirdPartyBreakdown)
    ? window.IRWarehouse.buildPhysicalThirdPartyBreakdown(plan)
    : { rows: (plan.contributions || []).map(function (c) { return { warehouseName: c.warehouseName || c.warehouseId, qty: Number(c.qty) || 0 }; }), total: 0, hasRows: (plan.contributions || []).length > 0 };
  var visible = bd.rows.filter(function (r) { return (Number(r.qty) || 0) > 0; });
  if (!visible.length) return '<div class="replen-tp-empty">No 3rd Party Stock</div>';
  var html = visible.map(function (r) { return whRow(r.warehouseName || r.warehouseId, r.qty); }).join('');
  html += '<div class="replen-card__row replen-tp-total"><span class="replen-card__label">Total</span><span class="replen-card__value">' + fmt(bd.total) + '</span></div>';
  return html;
}

// Persisted Recommendation Summary snapshot for a scope + SKU. Reads the active shipping_allocation_draft
// (SSOT) matching company+country+marketplace whose status is not cancelled, returns its RAW draft-line
// rows for this SKU (snake_case, as the Recommendation Summary reads them). Empty [] → honest empty state
// (no recommendation generated / backend not deployed). The engine that fills these is NOT activated here.
function _shippingDraftLinesFor(scope, drafts, lines) {
    if (!scope || !drafts || !drafts.length || !lines || !lines.length) return [];
    function lo(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
    var draft = drafts.filter(function (d) {
        return lo(d.country) === lo(scope.country) && lo(d.marketplace) === lo(scope.marketplace) &&
            (!scope.company || !d.company || lo(d.company) === lo(scope.company)) &&
            lo(d.status) !== 'cancelled';
    }).sort(function (a, b) { return String(b.updatedAt || '') < String(a.updatedAt || '') ? -1 : 1; })[0];
    if (!draft) return [];
    return lines.filter(function (l) {
        return l.allocationDraftId === draft.allocationDraftId && lo(l.sku) === lo(scope.sku);
    }).map(function (l) { return l.raw || l; });   // raw snake_case rows for the Recommendation Summary
}

// Plain-text tooltip for the results-table 3rd Party Stock cell (hover). Detail lives in the expand card.
function _irThirdPartyTitle(plan) {
  // Simplified hover: list the contributing physical 3PL warehouses (name + qty). Allocation detail
  // stays on the plan object for the engine / Admin Debug, not surfaced here.
  if (!plan) return '';
  var contribs = (plan.contributions || []).filter(function (c) { return (Number(c.qty) || 0) > 0; })
    .sort(function (a, b) { return (Number(b.qty) - Number(a.qty)) || String(a.warehouseName || '').localeCompare(String(b.warehouseName || '')); });
  if (!contribs.length) return 'No 3rd Party Stock in scope.';
  return '3rd Party Stock (physical, by warehouse):\n' +
    contribs.map(function (c) { return (c.warehouseName || c.warehouseId) + ': ' + Math.round(c.qty).toLocaleString(); }).join('\n');
}

function closeReplenModal() {
  const modal = document.getElementById('replen-add-sku-modal');
  const overlay = document.getElementById('replen-modal-overlay');
  
  if (!modal || !overlay) return;
  
  modal.classList.remove('is-open');
  overlay.classList.remove('is-open');
  
  const skuInput = document.getElementById('replen-add-sku');
  if (skuInput) skuInput.value = '';

  const siteInput = document.getElementById('replen-add-site-sku');
  if (siteInput) { siteInput.value = ''; siteInput.dataset.autofill = '1'; }
}

// F1-SMALL: after a CONFIRMED successful Add SKU, reset the WHOLE modal form to a brand-new-SKU state so the
// NEXT open never inherits the just-created SKU's field values. The Inventory Add SKU modal has NO draft cache —
// closeReplenModal()/open reset only SKU + Site SKU, so ASIN / Product URL / Launch Date / Planning Model /
// Fulfillment leaked across a successful create. This clears exactly those leaked DOM fields (text → blank;
// selects → their existing HTML default option — NO invented defaults; marketplace/company/country/currency
// re-derive on the next open via populateReplenAddSkuMarketplaces). Called ONLY on success; Cancel/close and the
// failure branches are deliberately untouched so unsaved / failed values are preserved for retry.
function resetReplenAddSkuForm() {
  ['replen-add-sku', 'replen-add-site-sku', 'replen-add-asin', 'replen-add-product-url', 'replen-add-launch-date'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var siteEl = document.getElementById('replen-add-site-sku'); if (siteEl) siteEl.dataset.autofill = '1';
  ['replen-add-model', 'replen-add-fulfillment'].forEach(function (id) {
    var sel = document.getElementById(id); if (sel && sel.options && sel.options.length) sel.selectedIndex = 0;   // existing HTML default option
  });
}
window.resetReplenAddSkuForm = resetReplenAddSkuForm;

function saveReplenSku() {
  const sku = document.getElementById('replen-add-sku')?.value.trim();
  let siteSku = (document.getElementById('replen-add-site-sku')?.value || '').trim();
  const status = 'active';
  const model = document.getElementById('replen-add-model')?.value || 'sales_driven';
  const launchDate = document.getElementById('replen-add-launch-date')?.value || '';
  const fulfillmentModel = document.getElementById('replen-add-fulfillment')?.value || '';
  // SKU Domain v2.0: the field is a platform-neutral marketplace_product_id (UI may label it "ASIN"
  // for Amazon). We send marketplace_product_id and never write the legacy `asin` column.
  const asinEl = document.getElementById('replen-add-asin');
  const marketplaceProductId = asinEl ? asinEl.value.trim() : '';
  // product_url is a regional identity field (sku_regional_details.product_url). Required on Add SKU.
  const productUrl = (document.getElementById('replen-add-product-url')?.value || '').trim();

  // Company / country / marketplace / currency / marketplace_id come from the selected
  // marketplaces-registry option (authoritative), so they stay consistent.
  const mpSelect = document.getElementById('replen-add-marketplace');
  const opt = mpSelect && mpSelect.selectedOptions && mpSelect.selectedOptions[0];
  const marketplaceId = opt ? (opt.value || '').trim() : '';
  const marketplace = opt ? (opt.getAttribute('data-marketplace') || '').trim() : '';
  const company = opt ? (opt.getAttribute('data-company') || '').trim() : '';
  const country = opt ? (opt.getAttribute('data-country') || '').trim() : '';
  const currency = opt ? (opt.getAttribute('data-currency') || '').trim() : '';

  if (!sku) { alert('SKU is required'); return; }
  if (!siteSku) siteSku = sku; // default/prefill from SKU
  if (!marketplaceId || !marketplace || !company || !country) {
    alert('Please select a marketplace. If the list is empty, add one via + Marketplace first.');
    return;
  }
  if (!currency) { alert('The selected marketplace has no currency configured.'); return; }
  // ASIN / marketplace_product_id required ONLY for Amazon marketplaces (case preserved; no fixed length —
  // marketplaces differ). Non-Amazon marketplaces (Walmart / KM Walmart / …) accept an empty ASIN. Same
  // authority (isReplenAmazonMarketplace) that drives the label * / input required state. Empty non-Amazon
  // ASIN keeps the existing blank contract — NO fabricated 'N/A' / 'NONE' placeholder.
  if (isReplenAmazonMarketplace(marketplace) && !marketplaceProductId) { alert('ASIN (Marketplace Product ID) is required for Amazon marketplaces.'); return; }
  // Product URL required. Accept any http(s) URL (do not force a specific marketplace domain).
  if (!productUrl) { alert('Product URL is required.'); return; }
  if (!/^https?:\/\/\S+/i.test(productUrl)) { alert('Product URL must be a valid http:// or https:// link.'); return; }

  // Primary path: shared import backend chain
  // (creates marketplace_skus + pricing_list + fc_regular_forecast).
  if (window.KM && window.KM.DB && window.KM.DB.importMarketplaceSkusBatch) {
    var oneRow = {
      sku: sku,
      company: company,
      country: country,
      marketplace: marketplace,
      marketplace_id: marketplaceId,
      site_sku: siteSku,
      currency: currency,
      marketplace_product_id: marketplaceProductId,
      product_url: productUrl,
      marketplace_sku_status: status,
      replenishment_model: model,
      fulfillment_model: fulfillmentModel,
      launch_date: launchDate
    };
    window.KM.DB.importMarketplaceSkusBatch([oneRow], {
      priceStatusDefault: 'draft',
      forecastStatusDefault: 'draft'
    }).then(function(result) {
      if (!result || result.success === false) {
        alert('Could not add SKU. ' + (result && result.error ? result.error : 'Please check the API connection and try again.'));
        return;
      }
      var data = result.data || {};
      var rr = (data.results && data.results[0]) || {};
      if (rr.status === 'error') {
        alert('Could not add SKU. ' + (rr.message || 'Validation failed.'));
        return;
      }
      alert('SKU "' + sku + '" ' + (rr.status || 'processed') + ' for ' + country + ' - ' + marketplace + (rr.message ? ('\n' + rr.message) : ''));
      closeReplenModal();
      resetReplenAddSkuForm();   // F1-SMALL: confirmed success → clear leaked fields so the next Add SKU starts fresh
      renderReplenishment();
    }).catch(function(err) {
      alert('Error: ' + (err && err.message ? err.message : err));
    });
    return;
  }

  // Fallback: legacy single-row upsert (only if import method is unavailable).
  if (window.KM && window.KM.DB && window.KM.DB.upsertMarketplaceSku) {
    window.KM.DB.upsertMarketplaceSku({
      sku: sku,
      country: country,
      marketplace: marketplace,
      marketplace_sku_status: status,
      replenishment_model: model,
      launch_date: launchDate
    }).then(function(result) {
      if (result && result.success === false) {
        alert('Could not add SKU. ' + (result.error || 'Please check the API connection and try again.'));
        return;
      }
      alert('SKU "' + sku + '" added to ' + country + ' - ' + marketplace);
      closeReplenModal();
      resetReplenAddSkuForm();   // F1-SMALL: confirmed success → clear leaked fields so the next Add SKU starts fresh
      renderReplenishment();
    }).catch(function(err) {
      alert('Error: ' + err.message);
    });
    return;
  }

  // Fallback: in-memory only (demo/mock, no KM.DB methods present)
  if (!window.replenishmentData) window.replenishmentData = [];
  var exists = replenishmentData.some(function(item) {
    return item.sku === sku && item.country === country && item.marketplace === marketplace;
  });
  if (exists) {
    alert('SKU "' + sku + '" already exists for ' + country + ' - ' + marketplace);
    return;
  }
  replenishmentData.push({ sku: sku, country: country, marketplace: marketplace, status: status, currentStock: 0, onTheWay: 0, thirdPartyStock: 0, avgSalesPerDay: 0, fc60Days: 0, upcomingEvent: '', daysOfSupply: 0, suggestedQty: 0, plannedQty: 0, cnStock: 0, twStock: 0 });
  if (typeof renderReplenishment === 'function') renderReplenishment();
  closeReplenModal();
  resetReplenAddSkuForm();   // F1-SMALL: confirmed success → clear leaked fields so the next Add SKU starts fresh
  alert('SKU "' + sku + '" added (in-memory only)');
}

function prefillReplenSiteSku() {
  var skuEl = document.getElementById('replen-add-sku');
  var siteEl = document.getElementById('replen-add-site-sku');
  if (!skuEl || !siteEl) return;
  // Auto-fill Site SKU from SKU while the user hasn't manually edited it.
  if (!siteEl.value.trim() || siteEl.dataset.autofill === '1') {
    siteEl.value = skuEl.value.trim();
    siteEl.dataset.autofill = '1';
  }
}
window.prefillReplenSiteSku = prefillReplenSiteSku;
  
// The modal-overlay listener lives inside the partial markup (Phase 3-12), so it is bound
// once via _inventoryReplenStaticInit() after the markup is injected. On the initial
// DOMContentLoaded (before the user opens the page) the markup isn't present yet, so this
// is a safe no-op; the page lifecycle mount calls it again once the partial exists.
document.addEventListener('DOMContentLoaded', () => {
  _inventoryReplenStaticInit();
});

// ========================================
// Inventory Replenishment - 從 app.js 搬移 (批次 1: Mock Data + 核心計算渲染)
// ========================================

const replenishmentMockData = [
    { sku: "CO1100-R", lifecycle: "Mature", productName: "Can Opener Pro", forecast90d: 450, onTheWay: 20, unitsPerCarton: 40 },
    { sku: "CO1100-S", lifecycle: "New", productName: "Manual Opener Basic", forecast90d: 320, onTheWay: 15, unitsPerCarton: 50 },
    { sku: "CO1150-R", lifecycle: "Mature", productName: "Kitchen Tool Set", forecast90d: 1100, onTheWay: 50, unitsPerCarton: 30 },
    { sku: "CO1150-AG", lifecycle: "Mature", productName: "Electric Peeler", forecast90d: 380, onTheWay: 10, unitsPerCarton: 40 },
    { sku: "SP3120-R", lifecycle: "New", productName: "Smart Opener", forecast90d: 600, onTheWay: 30, unitsPerCarton: 50 },
    { sku: "SP3410-R", lifecycle: "Phasing Out", productName: "Classic Knife", forecast90d: 280, onTheWay: 5, unitsPerCarton: 30 },
    { sku: "MO5600-R", lifecycle: "Mature", productName: "Food Processor", forecast90d: 750, onTheWay: 40, unitsPerCarton: 40 }
];

const specialEvents = [
    { name: "Spring Deal", startDate: "3/22", endDate: "3/29", month: 3, tag: "Special Event" },
    { name: "Prime Day", startDate: "7/15", endDate: "7/16", month: 7, tag: "Special Event" },
    { name: "Fall Prime", startDate: "10/20", endDate: "10/21", month: 10, tag: "Special Event" },
    { name: "BFCM", startDate: "11/20", endDate: "12/1", month: 11, tag: "Special Event" }
];

const skuEventData = [
    { sku: "CO1100-R", events: [{ name: "Spring Deal", qty: 500 }, { name: "Prime Day", qty: 800 }] },
    { sku: "CO1100-S", events: [{ name: "BFCM", qty: 1200 }] },
    { sku: "CO1150-R", events: [{ name: "Prime Day", qty: 1500 }, { name: "Fall Prime", qty: 900 }] },
    { sku: "CO1150-AG", events: [{ name: "Spring Deal", qty: 400 }] },
    { sku: "SP3120-R", events: [{ name: "BFCM", qty: 2000 }] },
    { sku: "SP3410-R", events: [] },
    { sku: "MO5600-R", events: [{ name: "Prime Day", qty: 1000 }, { name: "BFCM", qty: 1800 }] }
];

// 運輸方式資料結構 (Stage 1 靜態資料)
const shippingMethodsByMarket = {
    'US-amazon': [
        { name: '3rd Party', leadTime: 7, priority: 1, costLevel: 'Medium' },
        { name: 'Air Freight', leadTime: 12, priority: 4, costLevel: 'High' },
        { name: 'Private Ship', leadTime: 25, priority: 3, costLevel: 'Medium' },
        { name: 'AGL Ship', leadTime: 45, priority: 2, costLevel: 'Low' }
    ],
    'UK-amazon': [
        { name: '3rd Party', leadTime: 7, priority: 1, costLevel: 'Medium' },
        { name: 'Air Freight', leadTime: 10, priority: 4, costLevel: 'High' },
        { name: 'Sea Freight', leadTime: 35, priority: 2, costLevel: 'Low' }
    ],
    'DE-amazon': [
        { name: '3rd Party', leadTime: 7, priority: 1, costLevel: 'Medium' },
        { name: 'Air Freight', leadTime: 10, priority: 4, costLevel: 'High' },
        { name: 'Sea Freight', leadTime: 35, priority: 2, costLevel: 'Low' }
    ]
};

let currentExpandedRow = null;
let replenishmentPlans = {};
let replenishmentNotes = {};
let replenishmentShippingMethods = {};
let cachedExpandData = {};

// Stage 2 預留：多方案運輸計算函數
function calculateShippingSuggestions(skuData, marketplace) {
    // Stage 1: 返回空陣列
    // Stage 2: 實作多方案計算邏輯
    // 計算邏輯：
    // 1. 計算斷貨時間點
    // 2. 優先使用 3rd Party Stock
    // 3. 從 AGL Ship (最慢/最便宜) 開始填補缺口
    // 4. 依序使用 Private Ship, Air Freight
    return [];
}

function getReplenishmentData() {
    // === Demo Data Layer: Phase 2A ===
    if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        return _getDemoReplenishmentData();
    }

    // === End Demo Data Layer ===
    // Demo OFF: search-triggered loading from KM.DB. The Inventory Table (貨物庫存表) is mapped
    // from existing snapshot/forecast/inventory tables via IRMap (Phase 1). Source tables that
    // are not yet exposed to the frontend return [] → every field safe-falls-back to 0 / '--'
    // (no fabricated data). See docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md v1.0.
    return _getCloudReplenishmentData();
    return siteData.map(item => {
        const mockData = replenishmentMockData.find(m => m.sku === item.sku) || {
            lifecycle: "Mature",
            productName: item.sku + " Product",
            forecast90d: Math.floor(Math.random() * 500) + 200,
            onTheWay: Math.floor(Math.random() * 30),
            unitsPerCarton: 40
        };
        
        // Add marketplace and company from siteData
        mockData.marketplace = item.site;
        // Assign company based on SKU
        if (item.sku === 'CO1100-R' || item.sku === 'CO1150-R' || item.sku === 'SP3120-R' || item.sku === 'MO5600-R') {
            mockData.company = 'Res US';
        } else if (item.sku === 'CO1100-S' || item.sku === 'CO1150-AG' || item.sku === 'SP3410-R') {
            mockData.company = 'Res TW';
        } else {
            mockData.company = 'Kitchen Mama';
        }
        
        // Mock expand panel data - 根據 SKU 設定不同規模
        // 使用快取避免每次展開時數據變動
        if (!cachedExpandData[item.sku]) {
            let available, fcTransfer, fcProcessing, winitStock, onusStock, within18days, within30days, within45days, lastWeek;
            let fcNextMonth, fcNext2Month, fcLastMonth, fcLast2Month, achievementLastMonth, achievementLast2Month;
            let salesDay2, salesDay3, salesDay4;
            
            if (item.sku === 'CO1100-R' || item.sku === 'CO1100-S') {
            // 大規模數量
            available = Math.floor(Math.random() * 2000) + 3000;
            fcTransfer = Math.floor(Math.random() * 500) + 800;
            fcProcessing = Math.floor(Math.random() * 500) + 600;
            winitStock = Math.floor(Math.random() * 300) + 500;
            onusStock = Math.floor(Math.random() * 300) + 400;
            within18days = Math.floor(Math.random() * 800) + 1200;
            within30days = Math.floor(Math.random() * 600) + 800;
            within45days = Math.floor(Math.random() * 600) + 800;
            lastWeek = Math.floor(Math.random() * 500) + 1500;
            fcNextMonth = Math.floor(Math.random() * 5000) + 8000;
            fcNext2Month = Math.floor(Math.random() * 5000) + 7000;
            fcLastMonth = Math.floor(Math.random() * 5000) + 7500;
            fcLast2Month = Math.floor(Math.random() * 4000) + 7000;
            salesDay2 = Math.floor(Math.random() * 100) + 200;
            salesDay3 = Math.floor(Math.random() * 100) + 180;
            salesDay4 = Math.floor(Math.random() * 100) + 170;
        } else if (item.sku === 'CO1150-R' || item.sku === 'CO1150-AG') {
            // 小規模數量
            available = Math.floor(Math.random() * 100) + 50;
            fcTransfer = Math.floor(Math.random() * 30) + 20;
            fcProcessing = Math.floor(Math.random() * 30) + 15;
            winitStock = Math.floor(Math.random() * 20) + 10;
            onusStock = Math.floor(Math.random() * 20) + 8;
            within18days = Math.floor(Math.random() * 50) + 30;
            within30days = Math.floor(Math.random() * 40) + 20;
            within45days = Math.floor(Math.random() * 40) + 20;
            lastWeek = Math.floor(Math.random() * 80) + 120;
            fcNextMonth = Math.floor(Math.random() * 500) + 800;
            fcNext2Month = Math.floor(Math.random() * 500) + 700;
            fcLastMonth = Math.floor(Math.random() * 500) + 750;
            fcLast2Month = Math.floor(Math.random() * 400) + 700;
            salesDay2 = Math.floor(Math.random() * 20) + 15;
            salesDay3 = Math.floor(Math.random() * 20) + 12;
            salesDay4 = Math.floor(Math.random() * 20) + 10;
        } else {
            // 中等規模數量
            available = Math.floor(Math.random() * 500) + 300;
            fcTransfer = Math.floor(Math.random() * 100) + 80;
            fcProcessing = Math.floor(Math.random() * 100) + 60;
            winitStock = Math.floor(Math.random() * 80) + 50;
            onusStock = Math.floor(Math.random() * 60) + 40;
            within18days = Math.floor(Math.random() * 200) + 150;
            within30days = Math.floor(Math.random() * 150) + 100;
            within45days = Math.floor(Math.random() * 150) + 100;
            lastWeek = Math.floor(Math.random() * 200) + 400;
            fcNextMonth = Math.floor(Math.random() * 2000) + 3000;
            fcNext2Month = Math.floor(Math.random() * 2000) + 2500;
            fcLastMonth = Math.floor(Math.random() * 2000) + 2800;
            fcLast2Month = Math.floor(Math.random() * 1500) + 2500;
            salesDay2 = Math.floor(Math.random() * 40) + 50;
            salesDay3 = Math.floor(Math.random() * 40) + 45;
            salesDay4 = Math.floor(Math.random() * 40) + 40;
        }
        
            // Monthly Achievement Rate has NO defined source/formula → never fabricated (not even in
            // demo). The honest table (_irRenderMonthlyAchievement) shows "—" for these.
            achievementLastMonth = null;
            achievementLast2Month = null;
            
            // LTS data - 部分 SKU 設為 0 以測試篩選
            let over90, over180;
            if (item.sku === 'CO1100-S' || item.sku === 'CO1150-AG') {
                over90 = 0;
                over180 = 0;
            } else if (item.sku === 'SP3410-R') {
                over90 = Math.floor(Math.random() * 15) + 5;
                over180 = 0;
            } else {
                over90 = Math.floor(Math.random() * 15) + 5;
                over180 = Math.floor(Math.random() * 8) + 2;
            }
            
            // Factory stock - 快取以避免每次計算時變動
            const cnStock = Math.floor(Math.random() * 5000) + 1000;
            const twStock = Math.floor(Math.random() * 3000) + 500;
            
            cachedExpandData[item.sku] = {
                available, fcTransfer, fcProcessing, winitStock, onusStock,
                within18days, within30days, within45days, lastWeek, fcNextMonth, fcNext2Month,
                fcLastMonth, fcLast2Month, achievementLastMonth, achievementLast2Month,
                salesDay2, salesDay3, salesDay4, over90, over180, cnStock, twStock
            };
        }
        
        const expandData = cachedExpandData[item.sku];
        
        // Dynamic sales trend (past 3 days)
        const today = new Date();
        const day2ago = new Date(today);
        day2ago.setDate(today.getDate() - 2);
        const day3ago = new Date(today);
        day3ago.setDate(today.getDate() - 3);
        const day4ago = new Date(today);
        day4ago.setDate(today.getDate() - 4);
        
        // Dynamic forecast months
        const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
        const currentMonth = today.getMonth();
        const nextMonthIndex = (currentMonth + 1) % 12;
        const next2MonthIndex = (currentMonth + 2) % 12;
        const next3MonthIndex = (currentMonth + 3) % 12;
        const lastMonthIndex = (currentMonth - 1 + 12) % 12;
        const last2MonthIndex = (currentMonth - 2 + 12) % 12;
        
        // Generate FC for next 3 months
        const fcNext3Month = Math.floor(Math.random() * 5000) + 7000;
        
        // 60 days FC = The Following 前兩個月份的 FC 總和
        const forecast60d = expandData.fcNextMonth + expandData.fcNext2Month;
        
        // Get upcoming events for this SKU (檢查接下來三個月內的事件)
        const skuEvents = skuEventData.find(e => e.sku === item.sku)?.events || [];
        const next3Months = [
            (currentMonth + 1) % 12 || 12,
            (currentMonth + 2) % 12 || 12,
            (currentMonth + 3) % 12 || 12
        ];
        
        // 篩選出接下來三個月內的事件
        const filteredEvents = skuEvents.filter(e => {
            const event = specialEvents.find(se => se.name === e.name);
            return event && next3Months.includes(event.month);
        });
        
        const upcomingEventQty = filteredEvents.length > 0 ? filteredEvents[0].qty : null;
        
        const upcomingEventsText = filteredEvents.length > 0
            ? filteredEvents.map(e => {
                const event = specialEvents.find(se => se.name === e.name);
                // "M.D~M.D" year-less display; full range preserved in title= for accessibility.
                const fullR = `${event?.startDate}~${event?.endDate}`;
                const shortR = _irFmtEventRange(event?.startDate, event?.endDate) || fullR;
                return `<div class="replen-card__row"><span class="replen-card__label" title="${fullR}">${e.name} (${shortR})</span><span class="replen-card__value">${e.qty}</span></div>`;
              }).join('')
            : '<div class="replen-card__row"><span class="replen-card__label">No upcoming event</span><span class="replen-card__value">-</span></div>';
        
        // 1. Current Stock = Available + FC Transfer + FC Processing
        const currentInventory = expandData.available + expandData.fcTransfer + expandData.fcProcessing;
        
        // 2. On the Way = 根據期望天數動態計算
        let onTheWay;
        if (targetDays <= 18) {
            onTheWay = expandData.within18days;
        } else if (targetDays <= 30) {
            onTheWay = expandData.within18days + expandData.within30days;
        } else {
            onTheWay = expandData.within18days + expandData.within30days + expandData.within45days;
        }
        
        // 3. 3rd Party Stock = 3rd Party Stock 加總
        const thirdPartyStock = expandData.winitStock + expandData.onusStock;
        
        // 4. Avg. Sales/day = Last Week / 7
        const avgDailySales = expandData.lastWeek / 7;
        
        // Days of Supply = Current Stock / Avg. Sales
        const daysOfSupply = (currentInventory / avgDailySales).toFixed(1);
        
        // 檢查是否需要紅燈警示：Days of Supply < 18 且 (Current Stock + Within 18 days) / Avg. Sales < 18
        const daysWithin18 = ((currentInventory + expandData.within18days) / avgDailySales).toFixed(1);
        const needsAlert = parseFloat(daysOfSupply) < 18 && parseFloat(daysWithin18) < 18;
        
        // Suggested Qty - 依產品生命週期計算 (不包含 3rd Party Stock)
        let need18, need30, need45Plus;
        
        if (mockData.lifecycle === 'New') {
            // New 產品：60 days FC + 本月剩餘天數銷售 - (Current Stock + On the Way)
            const totalInventory = currentInventory + onTheWay;
            
            // 計算本月剩餘天數
            const today = new Date();
            const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            const remainingDays = lastDayOfMonth.getDate() - today.getDate();
            const remainingSales = remainingDays > 0 ? remainingDays * avgDailySales : 0;
            
            // New 產品的分時段計算（基於 FC）
            const totalDemand = forecast60d + remainingSales;
            const demand18 = totalDemand * (Math.min(18, targetDays) / targetDays);
            const demand30 = totalDemand * (Math.min(30, targetDays) / targetDays);
            
            const available18 = currentInventory + expandData.within18days;
            const available30 = currentInventory + expandData.within18days + expandData.within30days;
            const availableTotal = currentInventory + expandData.within18days + expandData.within30days + expandData.within45days;
            
            need18 = Math.max(0, Math.ceil(demand18 - available18));
            need30 = Math.max(0, Math.ceil(demand30 - available30 - need18));
            need45Plus = Math.max(0, Math.ceil(totalDemand - availableTotal - need18 - need30));
        } else {
            // Mature / Phasing Out：分時段計算（基於 Avg Sales）
            const demand18 = avgDailySales * Math.min(18, targetDays);
            const demand30 = avgDailySales * Math.min(30, targetDays);
            const demandTotal = avgDailySales * targetDays;
            
            const available18 = currentInventory + expandData.within18days;
            const available30 = currentInventory + expandData.within18days + expandData.within30days;
            const availableTotal = currentInventory + expandData.within18days + expandData.within30days + expandData.within45days;
            
            need18 = Math.max(0, Math.ceil(demand18 - available18));
            need30 = Math.max(0, Math.ceil(demand30 - available30 - need18));
            need45Plus = Math.max(0, Math.ceil(demandTotal - availableTotal - need18 - need30));
        }
        
        // Suggested Qty = 三個時段的加總
        let suggestedQty = need18 + need30 + need45Plus;
        
        // 進位到整箱數量
        const unitsPerCarton = mockData.unitsPerCarton || 40;
        if (suggestedQty > 0) {
            suggestedQty = Math.ceil(suggestedQty / unitsPerCarton) * unitsPerCarton;
        }
        
        return {
            sku: item.sku,
            lifecycle: mockData.lifecycle,
            productName: mockData.productName,
            marketplace: mockData.marketplace,
            company: mockData.company,
            currentInventory: currentInventory,
            avgDailySales: avgDailySales.toFixed(2),
            forecast60d: forecast60d,
            daysOfSupply: daysOfSupply,
            needsAlert: needsAlert,
            onTheWay: onTheWay,
            thirdPartyStock: thirdPartyStock,
            suggestedQty: suggestedQty,
            need18: need18,
            need30: need30,
            need45Plus: need45Plus,
            plannedQty: replenishmentPlans[item.sku] || 0,
            note: replenishmentNotes[item.sku] || '',
            status: suggestedQty > 0 ? "Need Restock" : "Sufficient",
            upcomingEventQty: upcomingEventQty,
            cnStock: expandData.cnStock,
            twStock: expandData.twStock,
            // Expand panel data
            available: expandData.available,
            fcTransfer: expandData.fcTransfer,
            fcProcessing: expandData.fcProcessing,
            winitStock: expandData.winitStock,
            onusStock: expandData.onusStock,
            within18days: expandData.within18days,
            within30days: expandData.within30days,
            within45days: expandData.within45days,
            lastWeek: expandData.lastWeek,
            // Sales trend dates and values
            day2ago: `${day2ago.getMonth() + 1}/${day2ago.getDate()}`,
            day3ago: `${day3ago.getMonth() + 1}/${day3ago.getDate()}`,
            day4ago: `${day4ago.getMonth() + 1}/${day4ago.getDate()}`,
            salesDay2: expandData.salesDay2,
            salesDay3: expandData.salesDay3,
            salesDay4: expandData.salesDay4,
            // Forecast months
            nextMonth: monthNames[nextMonthIndex],
            next2Month: monthNames[next2MonthIndex],
            next3Month: monthNames[next3MonthIndex],
            lastMonth: monthNames[lastMonthIndex],
            last2Month: monthNames[last2MonthIndex],
            fcNextMonth: expandData.fcNextMonth,
            fcNext2Month: expandData.fcNext2Month,
            fcNext3Month: fcNext3Month,
            fcLastMonth: expandData.fcLastMonth,
            fcLast2Month: expandData.fcLast2Month,
            achievementLastMonth: expandData.achievementLastMonth,
            achievementLast2Month: expandData.achievementLast2Month,
            upcomingEventsText: upcomingEventsText
        };
    }).filter(item => {
        if (!ltsFilter) return true;
        const expandData = cachedExpandData[item.sku];
        if (!expandData) return true;
        
        if (ltsFilter === 'over90') return expandData.over90 > 0;
        if (ltsFilter === 'over180') return expandData.over180 > 0;
        return true;
    });
}

// ========================================
// Main table Category tabs — filter the 貨物庫存表 main table by sku_details.category so the
// page stays focused instead of rendering every SKU at once. Tabs are built dynamically from the
// distinct non-empty categories present in the current (search-scoped) result set, plus "All".
// Mirrors the Request Order Category filter (sku_details.category; canonical values only — category
// is NEVER guessed from the SKU prefix/series). The dedupe + sort matches Request Order's _roDistinct
// so the Category tab order is identical to Request Order's.
// ========================================
var replenCategoryTab = 'All';

// Canonical category value for a row (trimmed). Uncategorized rows return '' and only appear under
// the "All" tab — category is never inferred from the SKU/series.
function _replenCategoryOf(item) {
    return item && item.category != null ? String(item.category).trim() : '';
}

function setReplenCategoryTab(category) {
    replenCategoryTab = category;
    renderReplenishment();
}
window.setReplenCategoryTab = setReplenCategoryTab;

// One category tab — uses Inventory Replenishment's OWN page-scoped rail markup
// (.replen-category-rail__tab / __label / __count). These are INDEPENDENT of the shared
// km-tab-rail / km-category-card component (Round 3): own class/id/state/event owner, styled in
// inventory-replenishment.css to visually match the Order Planning category bar. Clicking re-renders
// (via the inline onclick); active state is rebuilt on every render from `replenCategoryTab`.
function _replenCatTabHtml(name, count, active) {
    var safe = escapeReplenHtml(name);
    var arg = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<button type="button" class="replen-category-rail__tab' + (active ? ' is-active' : '') + '" data-cat="' + safe +
        '" onclick="setReplenCategoryTab(\'' + arg + '\')">' +
        '<span class="replen-category-rail__label">' + safe + '</span>' +
        '<span class="replen-category-rail__count">' + count + '</span></button>';
}

// Build the Category Tab Rail. All categories live in ONE horizontally-scrollable rail (the old
// measure-based overflow dropdown that hid later categories was removed 2026-07-28) — the shared
// KM.ui.tabRail handles wheel/keyboard/scroll-into-view, and the last category is always reachable.
function renderReplenCategoryTabs(allData) {
    var bar = document.getElementById('replenCategoryTabs');
    if (!bar) return;

    // Empty-data state: the Category Bar shell is NEVER hidden. The old empty-data gate (which hid the
    // rail via an inline none display) is removed — we always render at least `All (0)` so the bar is a
    // clearly-visible standalone panel even before a Marketplace/dataset is chosen.
    var rows = allData || [];

    // Distinct non-empty categories in the current (upstream-filtered) result set — dedupe +
    // alphabetical sort (matches Request Order's category order).
    var seen = {}, categoryList = [];
    rows.forEach(function (it) {
        var c = _replenCategoryOf(it);
        if (c && !seen[c]) { seen[c] = 1; categoryList.push(c); }
    });
    categoryList.sort();

    // Reset to All if the previously-active category is no longer present (data changed / empty).
    if (replenCategoryTab !== 'All' && categoryList.indexOf(replenCategoryTab) === -1) replenCategoryTab = 'All';

    // 'All' is always first; counts come from the full upstream-scoped set (computed BEFORE the
    // category filter is applied) so selecting a category never zeroes the other category counts.
    var tabs = [{ name: 'All', count: rows.length }].concat(categoryList.map(function (c) {
        return { name: c, count: rows.filter(function (it) { return _replenCategoryOf(it) === c; }).length };
    }));

    // Actively clear any stale inline display (the old empty-gate could leave display:none in the DOM);
    // the bar always shows.
    bar.style.display = '';
    bar.innerHTML = tabs.map(function (t) {
        return _replenCatTabHtml(t.name, t.count, t.name === replenCategoryTab);
    }).join('');

    if (window.KM && window.KM.ui && window.KM.ui.tabRail) {
        window.KM.ui.tabRail.enhance(bar);
        window.KM.ui.tabRail.scrollActiveIntoView(bar);
    }
}
window.renderReplenCategoryTabs = renderReplenCategoryTabs;

// ── Planning Model display (Canonical Decision 1) ────────────────────────────────────────────────
// The first column holds the canonical replenishment_model value (sales_driven / forecast_driven).
// The DB / API / payload / filter-state keep the canonical value; the UI shows ONLY the friendly label
// via this single shared formatter (table cell + Add/Edit forms + anywhere the field is displayed).
// Never render "Sales Driven" / "Forecast Driven" / "Status" for this field anymore.
function _replenPlanningModelLabel(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'forecast_driven') return 'Forecast';
    if (s === 'sales_driven') return 'Sales';
    return v ? String(v) : 'Sales';
}
window._replenPlanningModelLabel = _replenPlanningModelLabel;

// ── Whole-row expand: interactive-target guard (mirrors request-order._roIsInteractiveTarget) ─────
// A click on any control (button/link/input/select/…) or a [data-no-row-toggle] element must NOT
// toggle the row — those elements own their own behaviour.
var IR_INTERACTIVE_TAGS = { BUTTON: 1, A: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1, OPTION: 1 };
function _irIsInteractiveTarget(el, stopAt) {
    while (el && el !== stopAt && el.nodeType === 1) {
        if (IR_INTERACTIVE_TAGS[el.tagName]) return true;
        if (el.isContentEditable) return true;
        var role = el.getAttribute && el.getAttribute('role');
        if (role === 'button' || role === 'link' || role === 'checkbox' || role === 'radio' || role === 'textbox' || role === 'switch') return true;
        if (el.hasAttribute && el.hasAttribute('data-no-row-toggle')) return true;
        el = el.parentNode;
    }
    return false;
}

// Canonical row key for the expanded-row state — prefer marketplace_sku_id; fall back to the composite
// (company|country|marketplace|sku) when that field isn't on the row. Exposed for callers/tests.
function _irRowKey(item) {
    if (!item) return '';
    if (item.marketplaceSkuId) return String(item.marketplaceSkuId);
    return [item.company, item.country, item.marketplace, item.sku]
        .map(function (v) { return String(v == null ? '' : v); }).join('|');
}
// Pure single-state toggle decision: returns the NEXT expanded key. One variable drives BOTH the left
// (fixed) and right (scroll) sides, so they can never desync no matter how fast the user clicks.
function _irNextExpandedKey(currentKey, clickedKey) {
    return currentKey === clickedKey ? null : clickedKey;
}
// Stable detail-panel DOM id for aria-controls (sku sanitised to an id-safe token).
function _irPanelId(sku) {
    return 'replen-detail-' + String(sku == null ? '' : sku).replace(/[^A-Za-z0-9_-]/g, '-');
}
// Escape a sku for safe interpolation into an inline on* handler argument.
function _irSkuArg(sku) {
    return String(sku == null ? '' : sku).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
window._irRowKey = _irRowKey;
window._irNextExpandedKey = _irNextExpandedKey;
window._irIsInteractiveTarget = _irIsInteractiveTarget;

// Row-level click handler: toggle unless the click landed on an interactive control (which handles
// itself). Bound on BOTH the fixed row and the scroll row so the whole row is a hit target.
function _replenRowClick(event, sku) {
    if (event && _irIsInteractiveTarget(event.target, event.currentTarget)) return;
    toggleReplenRow(sku);
}
// Chevron click: stopPropagation so the row handler doesn't also fire (no double-toggle), then toggle
// exactly once. aria-expanded / rotation are synced inside toggleReplenRow.
function _replenChevronClick(event, sku) {
    if (event) { try { event.stopPropagation(); } catch (_e) {} }
    toggleReplenRow(sku);
}
window._replenRowClick = _replenRowClick;
window._replenChevronClick = _replenChevronClick;

function renderReplenishment() {
    const allData = getReplenishmentData();

    // Category rail renders FIRST and UNCONDITIONALLY — BEFORE the table-body guard below. It must
    // appear across initial mount, loading, empty-data, filter-change, and remount even when the table
    // bodies are not (yet) in the DOM, so `.replen-category-shell` is never left as an empty container.
    // (Universal Filter UI Repair root-cause fix: the rail render used to sit AFTER the
    // `if (!fixedBody || !scrollBody) return;` guard, so an absent/late table body left the shell blank.)
    renderReplenCategoryTabs(allData);
    // Keep the Category Section header title in sync with the active tab (persists across re-render/switch).
    var _catTitleEl = document.getElementById('replenCategoryTitle');
    if (_catTitleEl) _catTitleEl.textContent = (replenCategoryTab === 'All') ? 'All Categories' : replenCategoryTab;

    const fixedBody = document.getElementById('replenFixedBody');
    const scrollBody = document.getElementById('replenScrollBody');
    if (!fixedBody || !scrollBody) return;

    const data = (replenCategoryTab === 'All')
        ? allData
        : allData.filter(function (it) { return _replenCategoryOf(it) === replenCategoryTab; });

    currentExpandedRow = null;
    
    // Render fixed column (chevron + SKU). The chevron is a native <button> (Enter/Space operable) with
    // aria-expanded synced to the open state and aria-controls pointing at the detail panel it opens.
    // Clicking it stopPropagation()s so the row + chevron handlers never double-fire.
    fixedBody.innerHTML = data.map(item => {
        const arg = _irSkuArg(item.sku);
        const skuText = escapeReplenHtml(item.sku);
        return `
        <div class="fixed-row" data-sku="${item.sku}" data-rowkey="${escapeReplenHtml(_irRowKey(item))}" onclick="_replenRowClick(event, '${arg}')">
            <button type="button" class="replen-row-chevron" aria-expanded="false" aria-controls="${_irPanelId(item.sku)}"
                    aria-label="Toggle replenishment details for ${skuText}"
                    onclick="_replenChevronClick(event, '${arg}')">
                <span class="replen-row-chevron__icon" aria-hidden="true">▸</span>
            </button>
            <span class="replen-row-sku">${skuText}</span>
        </div>
    `;
    }).join('');

    // Render scrollable columns
    scrollBody.innerHTML = data.map(item => `
        <div class="scroll-row" data-sku="${item.sku}" data-rowkey="${escapeReplenHtml(_irRowKey(item))}" onclick="_replenRowClick(event, '${_irSkuArg(item.sku)}')">
            <div class="scroll-cell">${_replenPlanningModelLabel(item.replenishmentModel)}</div>
            <div class="scroll-cell">${item.company}</div>
            <div class="scroll-cell">${_replenMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
            <div class="scroll-cell">${item.currentInventory}</div>
            <div class="scroll-cell">${item.onTheWay}</div>
            <div class="scroll-cell" title="${(item.thirdPartyTitle || '').replace(/"/g, '&quot;')}">${item.thirdPartyStock}</div>
            <div class="scroll-cell">${item.avgDailySales}</div>
            <div class="scroll-cell">${item.forecast60d}</div>
            <div class="scroll-cell">${item.upcomingEventQty !== null ? item.upcomingEventQty : '-'}</div>
            <div class="scroll-cell ${(window.IRMap ? window.IRMap.dosColorClass(item.daysOfSupply) : '')}${item.needsAlert ? ' alert-red' : ''}">${item.daysOfSupply}</div>
            <div class="scroll-cell replen-suggested-cell">
                ${_irSuggestedCellHtml(item)}
            </div>
            <div class="scroll-cell">${item.cnStock || 0}</div>
            <div class="scroll-cell">${item.twStock || 0}</div>
            <div class="scroll-cell ai-action-cell" role="button" data-no-row-toggle onclick="openAISuggestion(event, '${_irSkuArg(item.sku)}')" style="width: 175px; min-width: 175px; max-width: 175px; flex-shrink: 0;">
                <span class="ai-action-cell__text">View Recommendation</span>
            </div>
        </div>
    `).join('');
    
    // Initialize header scroll sync
    initReplenHeaderSync();
}

function initReplenHeaderSync() {
    // Select the detail table scroll-col (not the ir-overview one)
    var tables = document.querySelectorAll('#ops-section .dual-layer-table:not(.ir-overview-table)');
    var detailTable = tables[tables.length - 1]; // last dual-layer-table is the detail table
    if (!detailTable) return;
    var scrollCol = detailTable.querySelector('.scroll-col');
    var scrollHeader = detailTable.querySelector('.scroll-header');
    
    if (!scrollCol || !scrollHeader) return;
    
    // Remove existing listener to avoid duplicates
    if (scrollCol._syncHandler) {
        scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
    }
    
    // Create and store handler
    scrollCol._syncHandler = function() {
        scrollHeader.style.transform = 'translateX(-' + scrollCol.scrollLeft + 'px)';
    };
    
    scrollCol.addEventListener('scroll', scrollCol._syncHandler);
}


// ========================================
// Inventory Replenishment - 從 app.js 搬移 (批次 2: toggleReplenRow + 操作函式 + Shipping Allocation)
// ========================================

// F1-4B-FM3a: top-table Suggested Qty = a NUMERIC PRESENTATION AGGREGATION of the canonical recommendation
// lines for this SKU (NOT a formula — see _irAggregateActionableRecommendedQty). Sums ONLY source-proven,
// non-blocked, finite recommendedQty across the SKU's destination lines (MARKETPLACE and/or each WAREHOUSE);
// provisional / blocked / null / residual are excluded. Valid canonical 0 shows "0". When no actionable
// canonical line exists (all blocked / none), it shows an honest "—" (never a fake 0) and the expanded
// Recommendation Summary explains why. Before the scope result is available it shows a compact "…" pending
// marker. When the workspace is OFF (kill switch), the legacy suggestedQty number is preserved verbatim.
// (Supersedes the FM2B "— breakdown" indicator, per the FM3 audit authorization.)
function _irSuggestedCellHtml(item) {
  // F1-4B-FM5-R4UI-R5 §5 — the top-table Suggested Qty is the MATERIALIZED actionable total from
  // inventory_replenishment_gap. D18/D30/D45/D90 are CUMULATIVE checkpoints, so summing them double-counts need;
  // the ONE actionable replenishment recommendation is the FURTHEST configured horizon's stored suggested qty
  // (canonical max horizon = D90). READY → stored d90_suggested_qty (valid 0 → "0"); BLOCKED / not-calculated →
  // "—"; still loading → "…". No page-side gap math, no live per-SKU calculation.
  if (_irUseMaterializedGapRead()) {
    var st = _irMatState.status;
    if (st === 'IDLE' || st === 'LOADING' || st === 'CONTEXT_NOT_READY') return '<span class="replen-suggested-cell__value replen-suggested-cell__value--pending" title="Loading materialized replenishment gap…">…</span>';
    var row = (item && _irMatState.bySku[String(item.sku)]) || null;
    if (!row || String(row.calculation_status) !== 'READY') return '<span class="replen-suggested-cell__value replen-suggested-cell__value--none" title="No actionable materialized recommendation — run Recalculate All Sites / see the expanded Recommendation Summary">—</span>';
    var v = _irMatNum(row.d90_suggested_qty);   // furthest cumulative checkpoint = the single actionable total
    if (v === null) return '<span class="replen-suggested-cell__value replen-suggested-cell__value--none">—</span>';
    return '<span class="replen-suggested-cell__value">' + v + '</span>';
  }
  if (!_irRecommendationWorkspaceEnabled()) {
    return '<span class="replen-suggested-cell__value">' + (item && item.suggestedQty != null ? item.suggestedQty : 0) + '</span>';
  }
  var lines = (typeof _irRecoLinesForSku === 'function') ? _irRecoLinesForSku(item) : null;
  if (lines === null) {
    return '<span class="replen-suggested-cell__value replen-suggested-cell__value--pending" title="Calculating recommendation…">…</span>';
  }
  var agg = _irAggregateActionableRecommendedQty(lines);
  if (agg.actionableCount === 0) {
    return '<span class="replen-suggested-cell__value replen-suggested-cell__value--none" title="No actionable canonical recommendation — see the expanded Recommendation Summary">—</span>';
  }
  return '<span class="replen-suggested-cell__value">' + agg.total + '</span>';
}

// Recommendation Summary table body (read-only system suggestion — NOT the submitted plan).
// Rows: 0–18d / 19–30d / 31–45d / 46–90d / Total. Columns: Window / Qty / Route / Reason.
// First version: Qty from the need-bucket data; Route is a placeholder ('--') until
// replenishment_route_rules is implemented; Reason is a placeholder from the allowed set
// (AI Pending / Stock Sufficient). See INVENTORY_TABLE_MAPPING_SPEC §11.
// Recommendation Summary body — FINAL 5 columns: Window / Calculated Gap / Recommended Qty / Route /
// Reason (§11.2). Read-only. Displays the persisted system recommendation snapshot when one exists
// (skuData._recDraftLines); otherwise renders an HONEST empty/not-generated state — never fabricates
// recommended quantities (the formal engine is NOT active; needBuckets returns 0 pre-engine).
function _recSummaryRows(skuData) {
    function num(v) { return (typeof v === 'number') ? v : (parseInt(v, 10) || 0); }
    var draftLines = skuData && skuData._recDraftLines;   // persisted snapshot (Draft), when hydrated
    var windows;
    if (draftLines && draftLines.length) {
        var byWin = {}; draftLines.forEach(function (l) { byWin[l.window_code || l.windowCode] = l; });
        windows = ['0–18d', '19–30d', '31–45d', '46–90d'].map(function (w, i) {
            var code = ['0-18', '19-30', '31-45', '46-90'][i];
            var l = byWin[code] || byWin[w] || {};
            // Route is DERIVED from recommended transport fields (a route display string is never persisted, §C).
            var routeTxt = [l.recommended_shipping_method, l.recommended_last_mile_delivery].filter(Boolean).join(' / ') || '--';
            return { label: w, gap: num(l.calculated_gap_qty), rec: num(l.recommended_qty),
                route: routeTxt, reason: l.recommendation_reason || '' };
        });
    } else {
        // No persisted snapshot + engine inactive → honest empty state.
        var total0 = num(skuData && skuData.suggestedQty);
        var anyGap = total0 > 0 || num(skuData && skuData.need0_18) > 0 || num(skuData && skuData.need19_30) > 0 ||
            num(skuData && skuData.need31_45) > 0 || num(skuData && skuData.need46_90) > 0;
        if (!anyGap) {
            return '<tr><td colspan="5" class="replen-recsum-empty">No recommendation generated — the recommendation engine is not active. Build routes in the Execution Plan below.</td></tr>';
        }
        // Pre-engine placeholder: Calculated Gap and Recommended Qty share the bucket value (source-
        // availability / carton / route-feasibility adjustment is applied by the engine, which is off).
        windows = [
            { label: '0–18d', gap: num(skuData.need0_18), rec: num(skuData.need0_18), route: '--', reason: 'AI Pending' },
            { label: '19–30d', gap: num(skuData.need19_30), rec: num(skuData.need19_30), route: '--', reason: 'AI Pending' },
            { label: '31–45d', gap: num(skuData.need31_45), rec: num(skuData.need31_45), route: '--', reason: 'AI Pending' },
            { label: '46–90d', gap: num(skuData.need46_90), rec: num(skuData.need46_90), route: '--', reason: 'AI Pending' }
        ];
    }
    function evBadge(w) {
        // Special-event badge on affected Window rows (event qty is shown in Reason, not a wide column §11.2).
        return (skuData && skuData.upcomingEventQty && (w.label === '0–18d' || w.label === '19–30d'))
            ? ' <span class="replen-recsum-evt" title="Special event in window">EVENT</span>' : '';
    }
    function row(w, isTotal) {
        var style = isTotal ? 'border-top: 1px solid var(--border-light); font-weight: 600;' : '';
        return '<tr style="' + style + '">' +
            '<td>' + w.label + (isTotal ? '' : evBadge(w)) + '</td>' +
            '<td class="replen-recsum-table__num">' + w.gap + '</td>' +
            '<td class="replen-recsum-table__num">' + w.rec + '</td>' +
            '<td style="color: #94A3B8;">' + (isTotal ? '' : (w.route || '--')) + '</td>' +
            '<td style="color: #64748B;">' + (isTotal ? '' : (w.reason || '')) + '</td>' +
            '</tr>';
    }
    var html = windows.map(function (w) { return row(w, false); }).join('');
    var totGap = windows.reduce(function (s, w) { return s + w.gap; }, 0);
    var totRec = windows.reduce(function (s, w) { return s + w.rec; }, 0);
    html += row({ label: 'Total', gap: totGap, rec: totRec, route: '', reason: '' }, true);
    return html;
}

// FM5-R4UI-R7 §2 — the expanded master row + its detail panel are ONE natural scroll unit. The R6 fixed-overlay
// clone pinned the master row below the header, but ANY pin (native sticky OR a floating overlay) necessarily
// FLOATS over the content that scrolls beneath it — which occluded the top of the second-level detail (the reported
// R6 defect). There is no offset that removes that occlusion for free vertical scrolling. So the pin is removed:
// the active master row keeps ONLY the .is-active-selected highlight (no reposition, no float) and scrolls TOGETHER
// with its detail panel — zero jump, zero occlusion, zero detachment; collapse/switch restores normal layout.
// These are safe no-op stubs kept so the toggleReplenRow call sites are unchanged; _irRemoveStickyOverlay also tears
// down any legacy #ir-sticky-overlay node a stale (R6) build may have left in the DOM.
function _irBindStickyScrollOnce() { _irRemoveStickyOverlay(); }

// F1-4B-FM5-R4UI-R5G §1 — expanded LEFT/RIGHT bottom-baseline parity when the right `.scroll-col` shows a
// HORIZONTAL scrollbar. That scrollbar consumes ~scrollbar-height of vertical space inside `.scroll-col`, which
// `align-items:stretch` makes the scrollbar-free `.fixed-col` match — pushing the LEFT divider below the RIGHT one.
// No CSS property reserves BOTTOM-scrollbar space, so we measure the LIVE scrollbar thickness (0 on overlay/macOS,
// ~15–17px on Windows) and expose it as `--km-hscroll-gutter`; the CSS lifts the fixed panel's divider by exactly
// that. This reads ONE metric (offsetHeight − clientHeight, with overflow-y hidden the h-scrollbar is its only
// contributor); it is NOT a height sync and NOT a poll — it fires only on mount, expand/collapse, and window resize.
function _irUpdateHScrollGutter_() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    var sec = document.getElementById('ops-section'); if (!sec) return;
    var col = sec.querySelector('.dual-layer-table .scroll-col');
    var gutter = col ? Math.max(0, col.offsetHeight - col.clientHeight) : 0;   // horizontal scrollbar thickness (0 if none/overlay)
    sec.style.setProperty('--km-hscroll-gutter', gutter + 'px');
}
var _irHScrollGutterResizeBound = false;
function _irBindHScrollGutterResizeOnce_() {
    if (_irHScrollGutterResizeBound || typeof window === 'undefined' || !window.addEventListener) return;
    _irHScrollGutterResizeBound = true;
    window.addEventListener('resize', function () { _irUpdateHScrollGutter_(); });   // event-driven, not polling
}
if (typeof window !== 'undefined') { window._irUpdateHScrollGutter_ = _irUpdateHScrollGutter_; }
function _irRemoveStickyOverlay() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    var ov = document.getElementById('ir-sticky-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
}

function toggleReplenRow(sku) {
    const fixedRows = document.querySelectorAll('#ops-section .fixed-row');
    const scrollRows = document.querySelectorAll('#ops-section .scroll-row');
    const fixedBody = document.getElementById('replenFixedBody');
    const scrollBody = document.getElementById('replenScrollBody');
    
    // ONE render transaction drives BOTH sides. Collapse everything first (both bodies, both rows'
    // .expanded class, and every chevron's aria-expanded/rotation) so left and right can never desync.
    const existingFixedPanels = document.querySelectorAll('#ops-section .fixed-body .replen-expand-panel');
    const existingScrollPanels = document.querySelectorAll('#ops-section .scroll-body .replen-expand-panel');
    existingFixedPanels.forEach(panel => panel.remove());
    existingScrollPanels.forEach(panel => panel.remove());

    // FM5-R4UI-R4 §2: clear the active-selected + active-sticky state everywhere on every collapse pass so only the
    // ONE currently expanded master row is ever highlighted/sticky (collapse fully restores normal row flow).
    fixedRows.forEach(row => { row.classList.remove('expanded'); row.classList.remove('is-active-sticky'); row.classList.remove('is-active-selected'); });
    scrollRows.forEach(row => { row.classList.remove('expanded'); row.classList.remove('is-active-sticky'); row.classList.remove('is-active-selected'); });
    // FM5-R4UI-R6 §5 — every collapse pass tears down the sticky visual overlay so a stale pinned bar can never
    // linger (also covers the re-click-to-collapse path, which returns before re-adding .is-active-selected below).
    if (typeof _irRemoveStickyOverlay === 'function') _irRemoveStickyOverlay();
    document.querySelectorAll('#ops-section .replen-row-chevron').forEach(function (btn) {
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('is-open');
    });

    // Single source of truth: currentExpandedRow. _irNextExpandedKey collapses on re-click, else opens.
    const nextKey = _irNextExpandedKey(currentExpandedRow, sku);
    if (nextKey === null) {
        currentExpandedRow = null;
        return;
    }

    currentExpandedRow = nextKey;
    const fixedRow = Array.from(fixedRows).find(row => row.dataset.sku === sku);
    const scrollRow = Array.from(scrollRows).find(row => row.dataset.sku === sku);

    // Both containers receive their expanded class in the SAME synchronous pass (no per-side setTimeout).
    // FM5-R4UI-R4 §2: on expand the active master row gets ONLY the subtle selected highlight (.is-active-selected)
    // — NOT position:sticky — so expanding causes ZERO vertical jump (the earlier R3 code applied sticky+top at
    // expand, which clamped a near-top row downward). The sticky positioning (.is-active-sticky) is added lazily by
    // the scroll handler once the user actually scrolls, so the row only pins under the header when it would leave
    // the viewport (see _irBindStickyScrollOnce). Collapse clears BOTH classes → normal flow restored.
    if (fixedRow) { fixedRow.classList.add('expanded'); fixedRow.classList.add('is-active-selected'); }
    if (scrollRow) { scrollRow.classList.add('expanded'); scrollRow.classList.add('is-active-selected'); }
    _irBindStickyScrollOnce();
    if (fixedRow) {
        const chevron = fixedRow.querySelector('.replen-row-chevron');
        if (chevron) { chevron.setAttribute('aria-expanded', 'true'); chevron.classList.add('is-open'); }
    }

    const data = getReplenishmentData();
    const skuData = data.find(item => item.sku === sku);
    
    const expandFixedHTML = `
        <div class="replen-expand-panel replen-expand-panel--fixed">
            <div class="replen-expand-fixed">
                <strong>${sku}</strong>
                <div style="margin-top: 8px; font-size: 14px; color: #333;">
                    ${skuData?.productName || 'Product Name'}
                </div>
                <div style="margin-top: 8px; font-size: 12px; color: #666;">
                    Click row to close
                </div>
            </div>
        </div>
    `;
    
    // TODO (Stage 2 / 3):
    // Replace rule-based suggestion with AI / seasonality model
    // - incorporate historical promotions, deals, yearly cycle
    // - weekly replenishment recommendation
    
    const expandScrollHTML = `
        <div class="replen-expand-panel replen-expand-panel--scroll" id="${_irPanelId(sku)}">
            <div class="replen-expand-scroll">
                <div class="ir-panel ir-panel--inventory-group ir-fulfillment--${skuData?.fulfillmentModel || 'unset'}" data-fulfillment="${skuData?.fulfillmentModel || ''}">
                    <section class="replen-expand-section--inventory">
                        <div class="replen-card-grid">
                            <article class="replen-card replen-card--stock">
                                <h4 class="replen-card__title">Stock${skuData?.fulfillmentModel ? ` <span class="ir-ff-badge">${skuData.fulfillmentModel}</span>` : ''}</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Available</span><span class="replen-card__value">${skuData?.available || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">FC Transfer</span><span class="replen-card__value">${skuData?.fcTransfer || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">FC Processing</span><span class="replen-card__value">${skuData?.fcProcessing || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Customer Orders</span><span class="replen-card__value">${skuData?.customerOrders || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Unsellable</span><span class="replen-card__value">${skuData?.unsellable || 0}</span></div>
                            </article>
                            <article class="replen-card replen-card--lts">
                                <h4 class="replen-card__title">Long Term Storage</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Over 90+</span><span class="replen-card__value">${skuData?.over90 || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Over 180+</span><span class="replen-card__value">${skuData?.over180 || 0}</span></div>
                            </article>
                            <article class="replen-card replen-card--shipping">
                                <h4 class="replen-card__title">Shipping Shipment</h4>
                                ${(skuData?.shipOverdue || 0) > 0 ? ('<div class="replen-card__row replen-card__row--overdue"><span class="replen-card__label">Overdue</span><span class="replen-card__value">' + (skuData.shipOverdue) + '</span></div>') : ''}
                                <div class="replen-card__row"><span class="replen-card__label">Within 18 days</span><span class="replen-card__value">${skuData?.within18days || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Within 30 days</span><span class="replen-card__value">${skuData?.within30days || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Within 45 days</span><span class="replen-card__value">${skuData?.within45days || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">45+ days</span><span class="replen-card__value">${skuData?.within45plus || 0}</span></div>
                            </article>
                            <article class="replen-card replen-card--third-party">
                                <h4 class="replen-card__title">3rd Party Stock</h4>
                                ${skuData?.thirdPartyDetailHtml || ('<div class="replen-card__row"><span class="replen-card__label">Winit</span><span class="replen-card__value">' + (skuData?.winitStock || 0) + '</span></div><div class="replen-card__row"><span class="replen-card__label">ONUS</span><span class="replen-card__value">' + (skuData?.onusStock || 0) + '</span></div>')}
                            </article>
                        </div>
                    </section>
                </div>
                <div class="ir-panel-column ir-panel-column--context">
                    <article class="ir-panel replen-card replen-card--forecast">
                        <h4 class="replen-card__title">Forecast Breakdown</h4>
                        <div class="replen-card__row" style="font-weight: 600; margin-top: 4px;"><span class="replen-card__label">The Following</span><span class="replen-card__value"></span></div>
                        <div class="replen-card__row"><span class="replen-card__label">${skuData?.nextMonth || '-'}</span><span class="replen-card__value">${skuData?.fcNextMonth || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">${skuData?.next2Month || '-'}</span><span class="replen-card__value">${skuData?.fcNext2Month || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">${skuData?.next3Month || '-'}</span><span class="replen-card__value">${skuData?.fcNext3Month || 0}</span></div>
                        <div class="replen-card__row" style="font-weight: 600;"><span class="replen-card__label">Total</span><span class="replen-card__value">${(skuData?.fcNextMonth || 0) + (skuData?.fcNext2Month || 0) + (skuData?.fcNext3Month || 0)}</span></div>
                    </article>
                    <article class="ir-panel replen-card replen-card--upcoming">
                        <h4 class="replen-card__title">Upcoming Event</h4>
                        ${skuData?.upcomingEventsText || '<div class="replen-card__row"><span class="replen-card__label">No upcoming event</span><span class="replen-card__value">-</span></div>'}
                    </article>
                </div>
                <!-- Analysis area (insight column): Sales Trend + Monthly Achievement Rate directly below it (§11.5). -->
                <div class="ir-panel-column ir-panel-column--insight">
                    <article class="ir-panel replen-card replen-card--sales-trend">
                        <h4 class="replen-card__title">Sales Trend (Past Week)</h4>
                        <canvas id="sales-trend-chart-${sku}" style="max-height: 100px;"></canvas>
                    </article>
                    <article class="ir-panel replen-card replen-card--achievement">
                        <h4 class="replen-card__title">Monthly Achievement Rate <span class="replen-card__title-note">(past 3 completed months)</span></h4>
                        ${_irRenderMonthlyAchievement(skuData)}
                    </article>
                </div>
                <!-- Decision area (action column): Recommendation Summary directly ABOVE Execution Plan,
                     stacked, same width, technically separate (§11.5). -->
                <div class="ir-panel-column ir-panel-column--action ir-decision-area">
                    <article class="replen-card replen-card--recommendation-summary" id="recommendation-summary-${sku}">
                        <h4 class="replen-card__title">Recommendation Summary</h4>
                        ${_irRecoSummaryCardBody(skuData)}
                    </article>
                    <article class="replen-card replen-card--execution-plan" id="execution-plan-${sku}">
                        <div class="replen-card__title-row">
                            <h4 class="replen-card__title" style="margin: 0;">Execution Plan</h4>
                            <button class="replen-card__add-route-btn" onclick="addExecutionRoute(event, '${sku}')" onmousedown="event.stopPropagation()">+ Add Route</button>
                        </div>
                        <div class="ir-exec-plan__grid ir-exec-plan__grid--head">
                            <span>From</span><span>To</span><span class="ir-exec-plan__qty">Qty</span><span>Method</span><span>Expected Arrival</span><span>Action</span>
                        </div>
                        <div id="shipping-methods-${sku}" class="exec-routes-list"></div>
                        <div class="replen-card__summary" style="border-top: 1px solid var(--border-light); margin-top: 4px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: 600;">
                            <span class="replen-card__summary-label">Total</span>
                            <span class="replen-card__summary-value" id="allocation-total-${sku}">0</span>
                        </div>
                        <div class="replen-card__hint" id="allocation-hint-${sku}" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Factory Stock Available</div>
                        <div class="replen-card__carton-error" id="allocation-carton-error-${sku}" style="display: none; font-size: 11px; color: #EF4444; margin-top: 4px;"></div>
                    </article>
                </div>
            </div>
        </div>
    `;
    
    const expandPanelFixed = document.createElement('div');
    expandPanelFixed.innerHTML = expandFixedHTML;
    const fixedElement = expandPanelFixed.firstElementChild;
    
    const expandPanelScroll = document.createElement('div');
    expandPanelScroll.innerHTML = expandScrollHTML;
    const scrollElement = expandPanelScroll.firstElementChild;
    
    const rowIndex = Array.from(fixedRows).indexOf(fixedRow);
    if (rowIndex < fixedRows.length - 1) {
        fixedRows[rowIndex + 1].before(fixedElement);
        scrollRows[rowIndex + 1].before(scrollElement);
    } else {
        fixedBody.appendChild(fixedElement);
        scrollBody.appendChild(scrollElement);
    }
    
    // Expand-row equal height is CSS-native (flex-column .fixed-col / .fixed-body + the
    // .replen-expand-panel--fixed { flex:1 } that stretches to the taller .scroll-col) — the SKU identity panel is
    // full height in the FIRST paint, with NO JS height sync and NO inline height writes. This tick only seeds
    // routes + charts, then refreshes --km-hscroll-gutter (R5G §1): after async content the right column's
    // horizontal overflow (hence its scrollbar) is settled, so the LEFT panel can reserve the matching bottom gutter.
    setTimeout(() => {
        // Seed / restore the Execution Plan routes (from Working Draft, or a default preview).
        initializeShippingAllocation(sku, skuData);
        // Initialize charts (Monthly Achievement Rate is now an honest table, not a chart — no init needed).
        initSalesTrendChart(sku, skuData);
        if (typeof _irUpdateHScrollGutter_ === 'function') _irUpdateHScrollGutter_();
    }, 0);
}

function updatePlannedQty(sku, qty) {
    replenishmentPlans[sku] = parseInt(qty) || 0;
}

function updateShippingMethod(sku, method) {
    replenishmentShippingMethods[sku] = method;
}

function updateGlobalShippingMethod(method) {
    // 全域運輸方式選擇，可用於批次設定或顯示
    console.log('Global shipping method selected:', method);
}

function updateReplenNote(sku, note) {
    replenishmentNotes[sku] = note;
}

function createPlan(sku) {
    console.log('Create plan for SKU:', sku);
    alert(`Create plan for ${sku} - Stage 1 placeholder`);
}

function submitReplenishmentPlans() {
    const data = getReplenishmentData();
    // Country + marketplace NAME are derived from the selected scope (the Marketplace dropdown value is a
    // marketplace_id in Cloud mode), so the payload carries the marketplace NAME — not the raw id.
    const _scope = _replenSelectedScope();
    const country = _scope.country;
    const marketplace = _scope.marketplace;
    // F1-4B-FM5-R4UI-R3 (§9): the visible "Target Days" control was removed — the canonical horizons are fixed at
    // D18/D30/D45/D90 and the materialized gap authority never consumes a UI target-days value. The legacy
    // shipping-plan Decision Snapshot still records a target-days figure, so fall back to the internal constant when
    // the (now-absent) control is not present. Reads the control ONLY if a page variant still renders it.
    var _tdEl = document.getElementById('replenTargetDays');
    const targetDays = _tdEl ? _tdEl.value : REPLEN_TARGET_DAYS;
    const shippingPlans = {};
    
    console.log('=== Submit Plan Debug ===');
    console.log('Total SKUs:', data.length);
    
    // Submit Plan reads ONLY the Execution Plan state (the Working Draft) — the single source of
    // the PM's actual shipping decision. It NEVER reads the Recommendation Summary (system
    // suggestion) or the live DOM. A SKU whose Execution Plan the PM never customized (no draft
    // row) is NOT submitted. Each Execution Plan route carries ship_from / destination /
    // shipping_method / qty. This is the only place that turns the Execution Plan into
    // shipping_plans — Decision Commit.
    data.forEach(item => {
        const draftRows = _allocationDraftRowsFor(item.sku);
        if (!draftRows || !draftRows.length) return;
        draftRows.forEach(r => {
            const method = r.shipping_method;
            const qty = parseInt(r.qty) || 0;
            if (qty > 0 && method) {
                if (!shippingPlans[method]) shippingPlans[method] = [];
                shippingPlans[method].push({
                    sku: item.sku,
                    qty: qty,
                    skuData: item,
                    ship_from: r.ship_from || '',                         // display name
                    source_warehouse_id: r.source_warehouse_id || '',    // canonical From id
                    ship_from_type: r.ship_from_type || '',
                    destination: r.destination || '',                    // display name
                    destination_warehouse_id: r.destination_warehouse_id || '',  // canonical To id
                    destination_type: r.destination_type || '',
                    sourceReason: r.source_reason || 'pm_adjustment'
                });
            }
        });
    });
    
    console.log('Shipping Plans:', shippingPlans);
    console.log('Total Methods:', Object.keys(shippingPlans).length);
    
    // 檢查是否有任何數值
    let totalSkus = 0;
    Object.keys(shippingPlans).forEach(method => {
        totalSkus += shippingPlans[method].length;
    });
    
    if (totalSkus === 0) {
        alert('No SKUs Submitted');
        return;
    }

    var targetDaysNum = parseFloat(targetDays) || 0;

    // Build a flat line list (one row per SKU×method). The backend groups into shipping_plans by
    // the six-value key (company + country + marketplace + ship_from + destination + shipping_method)
    // and freezes the per-SKU Decision Snapshot. See WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md.
    var planLines = [];
    Object.keys(shippingPlans).forEach(function(method) {
        shippingPlans[method].forEach(function(item) {
            var sd = item.skuData || {};
            var mock = (typeof replenishmentMockData !== 'undefined') ? replenishmentMockData.find(function(m){ return m.sku === item.sku; }) : null;
            var lineCompany = (sd.company && sd.company !== '--') ? sd.company : '';   // backend resolves if blank
            planLines.push({
                company: lineCompany,
                country: country,
                marketplace: marketplace,
                ship_from: item.ship_from || '',                             // display name (Warehouse Name is display-only)
                source_warehouse_id: item.source_warehouse_id || '',        // canonical From (warehouse_id)
                ship_from_type: item.ship_from_type || '',
                destination: item.destination || '',                        // display name
                destination_warehouse_id: item.destination_warehouse_id || '',  // canonical To (warehouse_id)
                destination_type: item.destination_type || '',
                shipping_method: method,
                sku: item.sku,
                requested_qty: item.qty,
                units_per_carton: (mock && mock.unitsPerCarton) || sd.unitsPerCarton || '',
                source_page: 'inventory_replenishment',
                source_reason: item.sourceReason || 'manual_submit',
                inventory_snapshot_date: '',
                snapshot_current_stock: sd.currentInventory != null ? sd.currentInventory : '',
                snapshot_avg_sales_per_day: sd.avgDailySales != null ? sd.avgDailySales : '',
                snapshot_days_of_supply: sd.daysOfSupply != null ? sd.daysOfSupply : '',
                snapshot_suggested_qty: sd.suggestedQty != null ? sd.suggestedQty : '',
                snapshot_target_days: targetDaysNum,
                snapshot_fc_context: sd.forecast60d != null ? sd.forecast60d : '',
                snapshot_event_context: (sd.upcomingEventQty != null ? sd.upcomingEventQty : '')
            });
        });
    });

    // Carton validation gate (Fix 7): every submitted line qty must be an integer multiple of
    // units_per_carton; a missing units_per_carton blocks Submit Plan. Never silently round.
    var cartonErrors = [];
    var badSkus = {};
    planLines.forEach(function(l) {
        var upc = parseInt(l.units_per_carton) || 0;
        var qty = parseInt(l.requested_qty) || 0;
        if (qty <= 0) return;
        if (!upc) {
            cartonErrors.push(l.sku + ' (units per carton missing)');
            badSkus[l.sku] = true;
        } else if (qty % upc !== 0) {
            cartonErrors.push(l.sku + ' (qty ' + qty + ' not a multiple of ' + upc + ')');
            badSkus[l.sku] = true;
        }
    });
    if (cartonErrors.length) {
        // Surface inline red text on any expanded allocation blocks for the offending SKUs.
        Object.keys(badSkus).forEach(function(sku) {
            if (typeof validateAllocationCartons === 'function') validateAllocationCartons(sku);
        });
        alert('Cannot Submit Plan — Shipping Qty must be a full carton multiple.\n\n' + cartonErrors.join('\n'));
        return;
    }

    // Primary path: persist to shipping_plans / shipping_plan_lines via the API (Decision Commit).
    var canCloudWrite = window.KM && window.KM.DB && window.KM.DB.createShippingPlansBatch &&
        window.KM.DB.isCloudWriteEnabled && window.KM.DB.isCloudWriteEnabled();
    if (canCloudWrite) {
        window.KM.DB.createShippingPlansBatch({
            source: 'inventory_replenishment_submit_plan',
            target_days: targetDaysNum,
            lines: planLines
        }).then(function(result) {
            if (result && result.success === false) {
                alert('Could not create Weekly Shipping Plan. ' + (result.error || 'Please check the API connection and try again.'));
                return;
            }
            var planCount = (result && result.plan_count) || 0;
            var lineCount = (result && result.line_count) || planLines.length;
            // Decision Commit succeeded → clear the Working Draft (JS State + sessionStorage).
            _clearAllocationDraft();
            alert('Weekly Shipping Plan created.\nShipping Plans: ' + planCount + '\nSKU lines: ' + lineCount + '\nStatus: Draft');
            showSection('shippingplan');
            setTimeout(function() { renderShippingPlan(); }, 100);
        }).catch(function(err) {
            // Failure → keep the Working Draft (JS State + sessionStorage) so the user can retry.
            alert('Error creating Weekly Shipping Plan: ' + (err && err.message ? err.message : err));
        });
        return;
    }

    // Fallback (Demo / API not configured): keep the legacy sessionStorage behavior so navigation works.
    var allPlans = [];
    var existingData = sessionStorage.getItem('allShippingPlans');
    if (existingData) { allPlans = JSON.parse(existingData); }
    var newPlan = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        country: country,
        marketplace: marketplace,
        targetDays: targetDays,
        plans: shippingPlans,
        status: {},
        notes: {}
    };
    Object.keys(shippingPlans).forEach(function(method) {
        newPlan.status[method] = 'draft';
        newPlan.notes[method] = [];
    });
    allPlans.push(newPlan);
    sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
    // Demo fallback success → also clear the Working Draft (kept separate from the demo store).
    _clearAllocationDraft();
    alert('Weekly Shipping Plan created (Demo / local mode).\nTotal SKUs: ' + totalSkus + '\nMethods: ' + Object.keys(shippingPlans).length);
    showSection('shippingplan');
    setTimeout(function() { renderShippingPlan(); }, 100);
}

window.renderReplenishment = renderReplenishment;
window.toggleReplenRow = toggleReplenRow;
window.updatePlannedQty = updatePlannedQty;
window.updateShippingMethod = updateShippingMethod;
window.updateGlobalShippingMethod = updateGlobalShippingMethod;
window.updateReplenNote = updateReplenNote;
window.createPlan = createPlan;
window.submitReplenishmentPlans = submitReplenishmentPlans;

function openShippingAllocation(event, sku) {
    event.stopPropagation();
    const fixedRows = document.querySelectorAll('#ops-section .fixed-row');
    const targetRow = Array.from(fixedRows).find(row => row.dataset.sku === sku);
    
    if (targetRow && targetRow.classList.contains('expanded')) {
        toggleReplenRow(sku);
    } else {
        if (!targetRow || !targetRow.classList.contains('expanded')) {
            toggleReplenRow(sku);
        }
        setTimeout(() => {
            const execCard = document.getElementById(`execution-plan-${sku}`);
            if (execCard) {
                execCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    }
}

function openAISuggestion(event, sku) {
    event.stopPropagation();
    const fixedRows = document.querySelectorAll('#ops-section .fixed-row');
    const targetRow = Array.from(fixedRows).find(row => row.dataset.sku === sku);
    if (!targetRow || !targetRow.classList.contains('expanded')) {
        toggleReplenRow(sku);
    }
    // Scroll to the Recommendation Summary (system suggestion) block.
    setTimeout(() => {
        const recCard = document.getElementById(`recommendation-summary-${sku}`);
        if (recCard) recCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// ============================================================================
// Shipping Allocation Working Draft (Temporary Decision — NOT a Decision Snapshot)
// Lives only inside Inventory Replenishment before Submit Plan. JS State is the live
// editing state; sessionStorage is temporary recovery only. It NEVER writes shipping_plans
// or updates Weekly Shipping Plan — only Submit Plan (Decision Commit) does that.
// See SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md (Working Draft Principle) +
//     WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md (Shipping Allocation Working Draft).
// ============================================================================
var REPLEN_ALLOC_DRAFT_KEY = 'km_replen_alloc_draft_v1';
var replenAllocationDraft = { context: { company: '', country: '', marketplace: '' }, targetDays: '', bySku: {} };
if (!window.KM) window.KM = {};
window.KM.shippingAllocationDraft = replenAllocationDraft;

function _replenCtx() {
    // Company + marketplace NAME are derived from the selected marketplace_id (no Company select); this
    // keeps the allocation-draft context keyed on stable, human-meaningful scope values (not the raw id).
    var s = (typeof _replenSelectedScope === 'function') ? _replenSelectedScope() : { company: '', country: '', marketplace: '' };
    return { company: s.company, country: s.country, marketplace: s.marketplace };
}
function _replenCtxEq(a, b) {
    return !!a && !!b && a.company === b.company && a.country === b.country && a.marketplace === b.marketplace;
}
function _persistAllocationDraft() {
    // sessionStorage is a UI RECOVERY CACHE only — NOT the Draft SSOT (Round 4 Decision E).
    try { sessionStorage.setItem(REPLEN_ALLOC_DRAFT_KEY, JSON.stringify(replenAllocationDraft)); } catch (e) {}
}
// ── Draft DB persistence (Round 4 Decision E + System Repair 2 Part A) ───────────────────────────────
// SSOT = shipping_allocation_drafts / _lines. A working-draft route is persisted ONLY when it is a
// COMPLETE Execution Plan line (From + To + Qty>0 + Method — the single shared IRDraft.isRouteComplete
// gate, §4/§7); an incomplete route stays frontend-only and NEVER reaches the DB (§20). Persistence is
// incremental upsert-by-line-id (never a blanket REPLACE): each complete route carries a STABLE
// allocation_draft_line_id so repeated edits UPDATE the same line instead of inserting duplicates
// (§6/§13). A user edit sends planned_qty + selected_* only; recommended_qty is sent ONLY for a
// system-generated line (protects the immutable snapshot). Amazon logical destination persists as
// selected_destination_warehouse_id=null. The header is upserted ONLY when ≥1 complete line exists —
// never an empty header (§20); when the last valid line is gone the header is soft-cancelled (§5.3).
// BROWSER/LIVE-DB-UNVERIFIED: when the API is not configured (headless), the adapter no-ops and the
// sessionStorage recovery cache remains — behaviour is unchanged until deployed.

// Shared completeness predicate (single source — §7). Prefer the pure IRDraft implementation so the
// frontend gate and the Node unit tests exercise the exact same logic; keep a tiny inline fallback so
// the page still gates correctly if the shared module failed to load.
function _isRouteComplete(route) {
    if (window.IRDraft && typeof window.IRDraft.isRouteComplete === 'function') return window.IRDraft.isRouteComplete(route);
    route = route || {};
    var from = String(route.source_warehouse_id == null ? '' : route.source_warehouse_id).trim();
    var toReal = String(route.destination_warehouse_id == null ? '' : route.destination_warehouse_id).trim();
    var logical = route.destination_type === 'MARKETPLACE_DESTINATION' || !!(route.destination_marketplace && String(route.destination_marketplace).trim());
    var qty = Number(route.planned_qty != null ? route.planned_qty : route.qty); if (!isFinite(qty)) qty = 0;
    var method = String(route.shipping_method == null ? '' : route.shipping_method).trim();
    return !!from && (!!toReal || logical) && qty > 0 && !!method && method.toLowerCase().indexOf('no available') === -1;
}
window._isRouteComplete = _isRouteComplete;

// Stable client-side draft line id (§6): assigned when a route first becomes COMPLETE so every later
// edit upserts the SAME shipping_allocation_draft_lines row (idempotent — no duplicate lines). Survives
// reload because the DB stores the row under this id and _hydrateAllocationDraftFromDb reads it back.
function _newDraftLineId() {
    var rnd = (Math.random().toString(36).slice(2) + Date.now().toString(36)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return 'SADL-' + rnd.slice(0, 10);
}

// Debounced DB sync (§5.4/§7): rapid Qty keystrokes / re-renders collapse into ONE write after the edit
// settles, and an in-flight guard prevents duplicate concurrent writes / out-of-order overwrite.
var _draftDbTimers = {};        // sku -> setTimeout handle
var _pendingDraftCancels = {};  // sku -> [ line_id, ... ] lines to soft-cancel on the next flush (§5)
var _draftDbInFlight = {};      // sku -> bool
var _draftDbDirty = {};         // sku -> bool (an edit landed while a write was in flight)
function _scheduleDraftDbPersist(sku) {
    if (_draftDbTimers[sku]) clearTimeout(_draftDbTimers[sku]);
    _draftDbTimers[sku] = setTimeout(function () { _draftDbTimers[sku] = null; _flushDraftDbPersist(sku); }, 400);
}
window._scheduleDraftDbPersist = _scheduleDraftDbPersist;

// Soft-cancel the (now empty) Draft Header once its last valid line is gone (§5.3) — never a hard
// delete, never an orphan/empty header. Upserts the header with status='cancelled' so it is excluded
// from hydrate; the local id is cleared so a future complete route starts a fresh header.
function _cancelAllocationDraftHeader() {
    try {
        var draftId = replenAllocationDraft.allocationDraftId;
        if (!draftId || !(window.KM && window.KM.DB && window.KM.DB.upsertShippingAllocationDraft && window.IRDraft)) { replenAllocationDraft.allocationDraftId = ''; return; }
        if (typeof isOperationDbApiConfigured === 'function' && !isOperationDbApiConfigured()) { replenAllocationDraft.allocationDraftId = ''; return; }
        var ctx = _replenCtx();
        var header = window.IRDraft.buildDraftHeaderPayload({ allocation_draft_id: draftId, company: ctx.company, country: ctx.country, marketplace: ctx.marketplace, status: 'cancelled' });
        replenAllocationDraft.allocationDraftId = '';
        return window.KM.DB.upsertShippingAllocationDraft(header);
    } catch (e) { console.warn('[replen] cancel draft header error:', e); }
}
window._cancelAllocationDraftHeader = _cancelAllocationDraftHeader;

// The actual DB sync for one SKU: soft-cancel any queued now-invalid lines, then upsert the header +
// the COMPLETE line set (or cancel the header if nothing valid remains). Called by the debounced flush.
function _flushDraftDbPersist(sku) {
    try {
        var cancels = _pendingDraftCancels[sku] || []; _pendingDraftCancels[sku] = [];
        if (!(window.KM && window.KM.DB && window.KM.DB.upsertShippingAllocationDraft &&
              window.KM.DB.upsertShippingAllocationDraftLines && window.IRDraft)) return;
        if (typeof isOperationDbApiConfigured === 'function' && !isOperationDbApiConfigured()) return; // headless → cache only
        if (_draftDbInFlight[sku]) { _draftDbDirty[sku] = true; if (cancels.length) _pendingDraftCancels[sku] = (_pendingDraftCancels[sku] || []).concat(cancels); return; }

        var ctx = _replenCtx();
        var rows = (replenAllocationDraft.bySku && replenAllocationDraft.bySku[sku]) || [];
        var complete = rows.filter(_isRouteComplete);

        // De-dupe queued cancels and drop any id that is STILL a live complete line this flush (e.g. the
        // user cleared then retyped a Qty within the debounce window) — never cancel a line we are about
        // to upsert. Cancelling an id the DB never stored is a defensive no-op (see the backend guard).
        var liveIds = {}; complete.forEach(function (r) { if (r.allocation_draft_line_id) liveIds[r.allocation_draft_line_id] = 1; });
        var seen = {};
        cancels = cancels.filter(function (id) { if (!id || seen[id] || liveIds[id]) return false; seen[id] = 1; return true; });
        // Soft-cancel lines that became invalid this edit (keeps the DB free of stale/incomplete plans, §5).
        cancels.forEach(function (id) { if (typeof _cancelAllocationDraftLine === 'function') _cancelAllocationDraftLine(id); });

        // No valid line left → never keep an empty header (§5.3).
        if (!complete.length) { _cancelAllocationDraftHeader(); return; }

        // C2-D2 §7: Phase-1 = ONE route context per Draft. If the complete lines carry >1 distinct
        // From/To/Method/Last-mile route context, BLOCK (MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1) — never
        // silently persist only route0. Genuinely different routes → separate Submit cycles / Drafts (§3/§4).
        var _routeKeys = (window.IRDraft && window.IRDraft.distinctRouteContexts) ? window.IRDraft.distinctRouteContexts(complete) : [];
        if (_routeKeys.length > 1) {
            if (typeof _irShowDraftSaveError === 'function') _irShowDraftSaveError(sku, { message: 'MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1 — ' + _routeKeys.length + ' distinct From/To/Method routes in one Draft; Phase-1 persists one route per Draft (use separate Submit cycles). NOT SAVED TO DB.' });
            return;
        }

        _draftDbInFlight[sku] = true;
        // C2-D1R: route context (From/To/Method) is HEADER-level in the approved 30-col schema. Phase-1 persists
        // ONE route per Draft — the shared route of this scope's complete lines (route0). Genuinely different
        // routes in the same week are handled via separate Submit cycles / subsequent Drafts (§3), never a
        // multi-route single header. From/To ids + display-name snapshots map onto the header recommended_* fields.
        var route0 = complete[0] || {};
        var header = window.IRDraft.buildDraftHeaderPayload({
            allocation_draft_id: replenAllocationDraft.allocationDraftId,
            company: ctx.company, country: ctx.country, marketplace: ctx.marketplace,
            source_warehouse_id: route0.source_warehouse_id,
            source_warehouse_code: route0.ship_from,                       // Execution Plan has no separate code → display-name snapshot
            destination_warehouse_id: route0.destination_warehouse_id,     // '' for an Amazon logical destination
            destination_warehouse_code: route0.destination,
            shipping_method: route0.shipping_method,
            last_mile_delivery: route0.last_mile_delivery,                 // undefined → header blank (no last-mile field in the Execution Plan)
            destination_marketplace: (route0.destination_type === 'MARKETPLACE_DESTINATION') ? (route0.destination_marketplace || route0.destination_country || ctx.marketplace) : undefined
        });
        return window.KM.DB.upsertShippingAllocationDraft(header).then(function (hres) {
            if (!hres || hres.success === false) throw new Error((hres && hres.error) || 'draft header upsert failed');
            var draftId = (hres.data && hres.data.allocation_draft_id) || replenAllocationDraft.allocationDraftId;
            replenAllocationDraft.allocationDraftId = draftId;
            var lines = complete.map(function (r) {
                return window.IRDraft.buildDraftLinePayload(sku, r, { scope: ctx, system: r.generation_type === 'system_generated' });
            });
            return window.KM.DB.upsertShippingAllocationDraftLines({ allocation_draft_id: draftId, lines: lines });
        }).then(function (lres) {
            if (lres && lres.success === false) throw new Error(lres.error || 'draft line upsert failed');
            _draftDbInFlight[sku] = false;
            if (_draftDbDirty[sku]) { _draftDbDirty[sku] = false; _flushDraftDbPersist(sku); }   // coalesced edit → one more write
        }).catch(function (err) {
            _draftDbInFlight[sku] = false;
            // Never fake success; keep the sessionStorage recovery cache so the user can retry.
            if (typeof _irShowDraftSaveError === 'function') _irShowDraftSaveError(sku, err);
            console.warn('[replen] Draft DB persistence failed (kept local cache):', err && err.message ? err.message : err);
        });
    } catch (e) { _draftDbInFlight[sku] = false; console.warn('[replen] Draft DB persistence error:', e); }
}
window._flushDraftDbPersist = _flushDraftDbPersist;

// Back-compat entry point (older callers / AI Plan): route through the debounced flush.
function _persistAllocationDraftToDb(sku) { _scheduleDraftDbPersist(sku); }
window._persistAllocationDraftToDb = _persistAllocationDraftToDb;

// Non-fatal Draft save error surface (never fakes success; keeps the recovery cache).
function _irShowDraftSaveError(sku, err) {
    var el = document.getElementById('allocation-carton-error-' + sku);
    if (el) { el.textContent = 'Draft not saved to DB — ' + (err && err.message ? err.message : 'error') + ' (kept locally; retry).'; el.style.display = 'block'; el.style.color = '#dc2626'; }
}
// Soft-cancel ONE persisted draft line (Decision E §16) — never hard delete. line_status='cancelled'.
function _cancelAllocationDraftLine(lineId) {
    try {
        if (!lineId || !(window.KM && window.KM.DB && window.KM.DB.upsertShippingAllocationDraftLines && window.IRDraft)) return;
        if (typeof isOperationDbApiConfigured === 'function' && !isOperationDbApiConfigured()) return;
        var draftId = replenAllocationDraft.allocationDraftId;
        if (!draftId) return;
        return window.KM.DB.upsertShippingAllocationDraftLines(window.IRDraft.buildCancelLinePayload(draftId, lineId));
    } catch (e) { console.warn('[replen] cancel draft line error:', e); }
}
window._cancelAllocationDraftLine = _cancelAllocationDraftLine;
// Async-race guard: only the newest context hydrate may write the working draft.
var _replenHydrateToken = 0;
// Hydrate the working draft from the DB (SSOT) for the current scope. DB state wins over the
// sessionStorage cache when present; cancelled lines are excluded. Reads the already-loaded adapter
// cache (getShippingAllocationDrafts/_Lines). BROWSER/LIVE-DB-UNVERIFIED.
function _hydrateAllocationDraftFromDb(ctx) {
    var myToken = ++_replenHydrateToken;
    try {
        if (!(window.KM && window.KM.DB && window.KM.DB.getShippingAllocationDrafts && window.KM.DB.getShippingAllocationDraftLines)) return false;
        var drafts = window.KM.DB.getShippingAllocationDrafts() || [];
        var lines = window.KM.DB.getShippingAllocationDraftLines() || [];
        function lo(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
        var draft = drafts.filter(function (d) {
            return lo(d.country) === lo(ctx.country) && lo(d.marketplace) === lo(ctx.marketplace) &&
                (!ctx.company || !d.company || lo(d.company) === lo(ctx.company)) && lo(d.status) !== 'cancelled';
        }).sort(function (a, b) { return String(b.updatedAt || '') < String(a.updatedAt || '') ? -1 : 1; })[0];
        if (myToken !== _replenHydrateToken) return false;   // a newer context request superseded this one
        if (!draft) return false;
        var bySku = {};
        lines.filter(function (l) {
            return l.allocationDraftId === draft.allocationDraftId && lo(l.lineStatus || l.line_status) !== 'cancelled';
        }).forEach(function (l) {
            var raw = l.raw || l;
            var sku = raw.sku;
            if (!sku) return;
            (bySku[sku] = bySku[sku] || []).push({
                allocation_draft_line_id: raw.allocation_draft_line_id,
                sku: sku,
                planned_qty: Number(raw.planned_qty) || 0,
                qty: Number(raw.planned_qty) || 0,
                recommended_qty: (raw.recommended_qty == null || raw.recommended_qty === '') ? null : Number(raw.recommended_qty),
                source_warehouse_id: raw.selected_source_warehouse_id || '',
                destination_warehouse_id: raw.selected_destination_warehouse_id || '',
                destination_type: (raw.destination_marketplace ? 'MARKETPLACE_DESTINATION' : ''),
                destination_marketplace: raw.destination_marketplace || '',
                shipping_method: raw.selected_shipping_method || '',
                generation_type: raw.generation_type || 'user_created'
            });
        });
        replenAllocationDraft = { context: ctx, allocationDraftId: draft.allocationDraftId, targetDays: replenAllocationDraft.targetDays || '', bySku: bySku };
        window.KM.shippingAllocationDraft = replenAllocationDraft;
        _persistAllocationDraft();
        return true;
    } catch (e) { console.warn('[replen] hydrate draft error:', e); return false; }
}
window._hydrateAllocationDraftFromDb = _hydrateAllocationDraftFromDb;
function _clearAllocationDraft() {
    replenAllocationDraft = { context: { country: '', marketplace: '' }, targetDays: '', bySku: {} };
    window.KM.shippingAllocationDraft = replenAllocationDraft;
    try { sessionStorage.removeItem(REPLEN_ALLOC_DRAFT_KEY); } catch (e) {}
}
// ===== C2-D2A-UI: Allocation Draft persistence UI workspace (truthful state machine + targeted readback) =====
// One controller (IRDraftWorkspace, inventory-compat.js — deps-injected) owns the canonical persistence state; the
// compact panel renders ONLY from committed DB acknowledgements + the targeted readback
// (getShippingAllocationDraftWorkspace) — never from toast text and never via a whole-DB reload.
var _allocWorkspace = null;
function _allocWorkspaceScope() {
    var ctx = _replenCtx() || {};
    return { planning_cycle: ctx.planning_cycle || ctx.planningCycle || '', company: ctx.company || '', country: ctx.country || '', marketplace: ctx.marketplace || '', source_page: 'inventory_replenishment' };
}
function _getAllocWorkspace() {
    if (_allocWorkspace) return _allocWorkspace;
    if (!(window.IRDraftWorkspace && window.KM && window.KM.DB && window.KM.DB.getShippingAllocationDraftWorkspace)) return null;
    _allocWorkspace = window.IRDraftWorkspace.create({
        readback: function (scope) { return window.KM.DB.getShippingAllocationDraftWorkspace(scope); },
        save: function (header) { return window.KM.DB.upsertShippingAllocationDraft(header); },
        saveLines: function (payload) { return window.KM.DB.upsertShippingAllocationDraftLines(payload); },
        cancel: function (payload) { return window.KM.DB.cancelShippingAllocationDraft(payload); },
        onState: _renderAllocDraftPanel,
        getLocalBuffer: function () { try { return !!sessionStorage.getItem(REPLEN_ALLOC_DRAFT_KEY); } catch (e) { return false; } }
    });
    return _allocWorkspace;
}
function _allocStateLabel(state) {
    var map = { NOT_SAVED: 'Not Saved', SAVING: 'Saving…', SAVED: 'Saved to DB', SAVE_FAILED: 'Save Failed', CONFLICT: 'Conflict', CANCELLED: 'Cancelled', SUBMITTED: 'Submitted' };
    return '● ' + (map[state] || state);   // glyph + text (non-color indicator, accessibility)
}
// Migration: remove ONLY a body-level panel wrongly attached by previously-loaded code (never a page-local one).
function _removeLegacyBodyAllocPanel() {
    var legacy = document.querySelector('body > #alloc-draft-persistence-panel');
    if (legacy && legacy.remove) legacy.remove();
}
function _ensureAllocDraftPanel() {
    // The Allocation Draft persistence panel belongs to the Inventory Replenishment page ONLY. Its host is the page
    // content root (#opsSection, inside the #ops-section module-section) — NEVER document.body. A body-level panel
    // stays in document flow on every page and pushes the whole app-layout down (the persistent cream top strip).
    // The previous host lookup targeted #inventory-replenishment / .inventory-replenishment which DO NOT EXIST, so
    // it silently fell back to <body>. Fail closed (return null) when the page root is absent so the panel is never
    // orphaned onto <body>; while the panel is page-owned it is hidden with the section on non-Inventory pages.
    var host = document.getElementById('opsSection') || document.getElementById('ops-section');
    if (!host) { _removeLegacyBodyAllocPanel(); return null; }
    var el = document.getElementById('alloc-draft-persistence-panel');
    if (el) {
        if (el.parentElement !== host) host.insertBefore(el, host.firstChild);   // migrate a stale/body-level node into the page root
        return el;
    }
    el = document.createElement('div');
    el.id = 'alloc-draft-persistence-panel';
    el.className = 'alloc-draft-panel';
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    host.insertBefore(el, host.firstChild);
    return el;
}
// Truthful persistence panel — renders from the controller state snapshot only (never from toast text).
function _renderAllocDraftPanel(s) {
    var el = _ensureAllocDraftPanel(); if (!el) return;
    var draftId = (s.draft && (s.draft.allocation_draft_id || s.draft.allocationDraftId)) || '—';
    var version = (s.draft && (s.draft.draft_version || s.draft.draftVersion)) || '—';
    var when = s.savedAt || '—';
    var source = s.source === 'DB' ? 'Database' : 'Local Recovery';
    var conflict = (s.conflictIds && s.conflictIds.length) ? (' [' + s.conflictIds.join(', ') + ']') : '';
    var issues = (s.issues && s.issues.length) ? s.issues.map(function (i) { return String(i.code) + (i.missing ? (': ' + i.missing.join('/')) : (i.routeContexts ? (': ' + i.routeContexts.length + ' routes') : '')); }).join('; ') : '';
    el.setAttribute('data-alloc-state', s.state);
    var html = '<div class="alloc-draft-panel__row"><span class="alloc-draft-panel__label">Status</span>' +
        '<span class="alloc-draft-panel__badge alloc-draft-panel__badge--' + String(s.state).toLowerCase() + '">' + _allocStateLabel(s.state) + conflict + '</span></div>' +
        '<div class="alloc-draft-panel__row"><span>Draft</span><span>' + draftId + '</span></div>' +
        '<div class="alloc-draft-panel__row"><span>Version</span><span>' + version + '</span></div>' +
        '<div class="alloc-draft-panel__row"><span>Last DB confirmation</span><span>' + when + '</span></div>' +
        '<div class="alloc-draft-panel__row"><span>Source</span><span>' + source + '</span></div>';
    if (issues) html += '<div class="alloc-draft-panel__issues">' + issues + '</div>';
    if (s.code === 'WRITE_COMMITTED_READBACK_FAILED') html += '<div class="alloc-draft-panel__issues">已寫入資料庫，正在重新確認狀態 <button type="button" onclick="_allocDraftRefresh()">Retry Readback</button></div>';
    if (s.state === 'SAVED' && s.draft && (s.draft.allocation_draft_id || s.draft.allocationDraftId)) {
        html += '<div class="alloc-draft-panel__row"><button type="button" class="alloc-draft-cancel-btn" onclick="_allocDraftCancel()">Cancel Draft</button></div>';
    }
    el.innerHTML = html;
}
function _allocDraftRefresh() { var ws = _getAllocWorkspace(); if (ws) ws.refresh(_allocWorkspaceScope()); }
window._allocDraftRefresh = _allocDraftRefresh;
function _allocDraftCancel() {
    var ws = _getAllocWorkspace(); if (!ws) return;
    var st = ws.getState();
    var draftId = (st.draft && (st.draft.allocation_draft_id || st.draft.allocationDraftId)) || '';
    var lineCount = (st.lines && st.lines.length) || 0;
    var okGo = false;
    try { okGo = window.confirm('Cancel Allocation Draft ' + draftId + '?\nScope: ' + JSON.stringify(_allocWorkspaceScope()) + '\nLines: ' + lineCount + '\nCancellation preserves history and cannot be edited afterward.'); } catch (e) { okGo = false; }
    if (!okGo) return;
    var reason = ''; try { reason = window.prompt('Cancel reason (optional):') || ''; } catch (e) { reason = ''; }
    ws.cancel(_allocWorkspaceScope(), { reason: reason });
}
window._allocDraftCancel = _allocDraftCancel;
// A complete K3 planning scope. An incomplete/unselected initial scope is NOT a persistence failure — it must never
// trigger a readback (a failed/empty read is classified SAVE_FAILED, line ~403), and must never open the panel with
// a scary global SAVE_FAILED before the user has picked a valid Country/Marketplace.
function _allocDraftScopeComplete(scope) {
    return !!(scope && scope.planning_cycle && scope.company && scope.country && scope.marketplace);
}
// Initial targeted load for the current scope (ONE request; stale-guarded inside the controller). Never getOperationDb.
function _allocDraftInitialLoad() {
    var ws = _getAllocWorkspace();
    var scope = _allocWorkspaceScope();
    if (!ws || !_allocDraftScopeComplete(scope)) return;   // incomplete scope → no DB read, no panel, no false SAVE_FAILED (stays NOT_SAVED)
    if (typeof isOperationDbApiConfigured === 'function' && isOperationDbApiConfigured()) ws.load(scope);
}
window._allocDraftInitialLoad = _allocDraftInitialLoad;

// Restore the working draft. SSOT = DB (Round 4 Decision E): try DB hydrate for the current scope
// first (DB wins); sessionStorage is only a recovery cache used when the DB has nothing / is not
// configured (headless). Never let a stale cache overwrite a successful DB load.
function _restoreAllocationDraftFromSession() {
    try {
        var ctx = _replenCtx();
        if (typeof _allocDraftInitialLoad === 'function') { try { _allocDraftInitialLoad(); } catch (e) {} }   // C2-D2A-UI: truthful targeted readback + persistence panel
        if (ctx && (ctx.country || ctx.marketplace) && typeof _hydrateAllocationDraftFromDb === 'function') {
            if (_hydrateAllocationDraftFromDb(ctx)) return;   // DB SSOT loaded → do not overlay the cache
        }
        var raw = sessionStorage.getItem(REPLEN_ALLOC_DRAFT_KEY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && parsed.bySku) {
            replenAllocationDraft = {
                context: parsed.context || { country: '', marketplace: '' },
                targetDays: parsed.targetDays || '',
                bySku: parsed.bySku || {}
            };
            window.KM.shippingAllocationDraft = replenAllocationDraft;
        }
    } catch (e) {}
}
// Discard the draft if the stored context no longer matches the active Country/Marketplace.
function _clearAllocationDraftIfContextChanged() {
    var ctx = _replenCtx();
    if (!_replenCtxEq(replenAllocationDraft.context, ctx)) _clearAllocationDraft();
}
// Returns the draft rows for a SKU only when the draft context matches the active search.
function _allocationDraftRowsFor(sku) {
    var ctx = _replenCtx();
    if (!_replenCtxEq(replenAllocationDraft.context, ctx)) return null;
    var rows = replenAllocationDraft.bySku[sku];
    return (rows && rows.length) ? rows : null;
}
// Capture the current Execution Plan route rows for a SKU into the Working Draft (live +
// sessionStorage). One draft row per Execution Plan route: { ship_from, destination,
// shipping_method, qty }. This is the SINGLE source Submit Plan reads (API-ready — never the DOM).
function _saveAllocationDraftFromDom(sku) {
    var routesList = document.getElementById('shipping-methods-' + sku);
    if (!routesList) return;
    var ctx = _replenCtx();
    replenAllocationDraft.context = ctx;
    replenAllocationDraft.targetDays = (document.getElementById('replenTargetDays') || {}).value || REPLEN_TARGET_DAYS;   // FM5-R4UI-R3: control removed → internal default
    var rows = [];
    routesList.querySelectorAll('.exec-route-row').forEach(function (rowEl) {
        function fieldVal(f) {
            var el = rowEl.querySelector('[data-field="' + f + '"]');
            return el ? String(el.value || '').trim() : '';
        }
        // Read the display name + warehouse_type off the SELECTED <option> of a warehouse picker (so
        // ship_from/destination stay the human label while *_warehouse_id holds the canonical value).
        function selOptData(f, attr) {
            var el = rowEl.querySelector('[data-field="' + f + '"]');
            if (!el || !el.options || el.selectedIndex < 0) return '';
            var opt = el.options[el.selectedIndex];
            return opt ? String(opt.getAttribute(attr) || '').trim() : '';
        }
        var method = fieldVal('shipping_method');
        var qty = parseInt(fieldVal('qty')) || 0;
        var sourceWarehouseId = fieldVal('source_warehouse_id');       // canonical id (option value)
        var destRawValue = fieldVal('destination_warehouse_id');       // real warehouse_id OR Amazon logical token
        var shipFrom = selOptData('source_warehouse_id', 'data-wh-name');       // display name
        var shipFromType = selOptData('source_warehouse_id', 'data-wh-type');   // warehouse_type snapshot
        var destination = selOptData('destination_warehouse_id', 'data-wh-name');
        var destType = selOptData('destination_warehouse_id', 'data-wh-type');
        // Round 4 Decision B: an Amazon logical destination (MARKETPLACE_DESTINATION token) persists as
        // marketplace=Amazon + destination_warehouse_id=null (NEVER a fake warehouse_id). Real 3PL keeps
        // its warehouse_id. The actual FBA warehouse_id is resolved later at the Shipment Draft stage.
        var destPayload = (window.IRWarehouse && window.IRWarehouse.resolveDestinationPayload)
            ? window.IRWarehouse.resolveDestinationPayload(destRawValue, ctx)
            : { selected_destination_warehouse_id: (destRawValue && destRawValue.indexOf('MARKETPLACE_DESTINATION:') === 0) ? null : (destRawValue || null) };
        var isLogicalAmazon = (destType === 'MARKETPLACE_DESTINATION') || (typeof destRawValue === 'string' && destRawValue.indexOf('MARKETPLACE_DESTINATION:') === 0);
        var destWarehouseId = isLogicalAmazon ? '' : destRawValue;   // canonical To id ('' = none/logical)
        var etaEl = rowEl.querySelector('[data-field="expected_arrival"]');
        var expectedArrival = etaEl ? String(etaEl.textContent || '').trim() : '';
        var lineId = rowEl.getAttribute('data-line-id') || '';   // persisted Draft line identity (§6)
        // ALL rows are kept in the local render/recovery draft so an in-progress (still incomplete) route
        // survives collapse/expand. Whether a row is PERSISTED to the DB is decided ONLY by the shared
        // four-field completeness gate below — a truthy "any intent" check is NOT enough (§4).
        var row = {
            shipping_method: method,
            qty: qty,                              // = planned_qty (canonical)
            planned_qty: qty,
            source_warehouse_id: sourceWarehouseId,   // canonical From (warehouse_id)
            ship_from: shipFrom,                       // display name only
            ship_from_type: shipFromType,
            // Amazon logical destination → destination_warehouse_id null + marketplace=Amazon (Decision B).
            destination_warehouse_id: (destPayload.selected_destination_warehouse_id == null ? '' : destPayload.selected_destination_warehouse_id),
            destination: isLogicalAmazon ? 'Amazon' : destination,   // display name only
            destination_type: isLogicalAmazon ? 'MARKETPLACE_DESTINATION' : destType,
            destination_marketplace: isLogicalAmazon ? 'Amazon' : '',
            destination_country: isLogicalAmazon ? (destPayload.country || (ctx && ctx.country) || '') : '',
            expected_arrival: expectedArrival,
            source_reason: 'pm_adjustment'
        };
        if (_isRouteComplete(row)) {
            // A complete route is persistable. Assign a STABLE line id the first time so every later edit
            // UPDATES the same shipping_allocation_draft_lines row (idempotent — no duplicate lines, §6/§13).
            if (!lineId) { lineId = _newDraftLineId(); rowEl.setAttribute('data-line-id', lineId); }
            row.allocation_draft_line_id = lineId;
        } else if (lineId) {
            // Was persisted, now incomplete → queue a soft-cancel and drop the persisted identity so we
            // never overwrite the stored line with a null/invalid payload (§5). It stays in the local
            // draft as editable temporary state, but is no longer a DB line.
            (_pendingDraftCancels[sku] = _pendingDraftCancels[sku] || []).push(lineId);
            rowEl.removeAttribute('data-line-id');
            row.allocation_draft_line_id = '';
        }
        rows.push(row);
    });
    if (rows.length) replenAllocationDraft.bySku[sku] = rows;
    else delete replenAllocationDraft.bySku[sku];
    window.KM.shippingAllocationDraft = replenAllocationDraft;
    _persistAllocationDraft();            // recovery cache (not SSOT)
    _scheduleDraftDbPersist(sku);         // SSOT: shipping_allocation_drafts/_lines — debounced; only COMPLETE routes are written
}
// Explicit user edit on an Execution Plan route: recompute totals AND capture the Working Draft.
// (Pure render must NOT call this.)
function onExecutionRouteEdit(sku) {
    _execEnforceDistinctWarehouses(sku);   // From and To can never be the same warehouse_id (verify #19)
    _execRebuildMethodOptions(sku);        // re-filter Method from carrier_rate_cards on From/scope change (§3.5)
    updateShippingAllocationTotal(sku);
    _irUpdateRouteEtas(sku);        // recompute Expected Arrival on From/To/Method change (§11.3)
    _saveAllocationDraftFromDom(sku);
}
// Back-compat alias (older callers).
function onAllocationEdit(sku) { onExecutionRouteEdit(sku); }
window.onExecutionRouteEdit = onExecutionRouteEdit;
window.onAllocationEdit = onAllocationEdit;
window._clearAllocationDraft = _clearAllocationDraft;

// Resolve units_per_carton for a SKU (cloud: sku_details; demo/mock: replenishmentMockData). 0 = missing.
function _replenUnitsPerCarton(sku) {
    try {
        var data = getReplenishmentData();
        var item = data && data.find(function (d) { return d.sku === sku; });
        if (item && item.unitsPerCarton) return parseInt(item.unitsPerCarton) || 0;
    } catch (e) {}
    var mock = (typeof replenishmentMockData !== 'undefined') ? replenishmentMockData.find(function (m) { return m.sku === sku; }) : null;
    return (mock && mock.unitsPerCarton) ? (parseInt(mock.unitsPerCarton) || 0) : 0;
}

// Carton-multiple validation for a SKU's Shipping Allocation (Fix 7). Shows inline red text and
// returns { valid, unitsPerCarton, reason }. Each method qty must be an integer multiple of UPC;
// a missing UPC is invalid (blocks Submit Plan).
function validateAllocationCartons(sku) {
    var methodsList = document.getElementById('shipping-methods-' + sku);
    var errDiv = document.getElementById('allocation-carton-error-' + sku);
    var upc = _replenUnitsPerCarton(sku);
    function showErr(msg) { if (errDiv) { errDiv.textContent = msg; errDiv.style.display = 'block'; } }
    function clearErr() { if (errDiv) { errDiv.textContent = ''; errDiv.style.display = 'none'; } }

    var qtys = [];
    if (methodsList) {
        methodsList.querySelectorAll('input[data-field="qty"]').forEach(function (inp) {
            qtys.push(parseInt(inp.value) || 0);
        });
    }
    var hasQty = qtys.some(function (q) { return q > 0; });
    if (!hasQty) { clearErr(); return { valid: true, unitsPerCarton: upc, reason: '' }; }

    if (!upc || upc <= 0) {
        showErr('Units per carton is missing for this SKU. Submit Plan is blocked until it is set.');
        return { valid: false, unitsPerCarton: 0, reason: 'missing_upc' };
    }
    var bad = qtys.some(function (q) { return q > 0 && (q % upc !== 0); });
    if (bad) {
        showErr('Shipping Qty must be a full carton multiple. Units per carton: ' + upc + '.');
        return { valid: false, unitsPerCarton: upc, reason: 'not_multiple' };
    }
    clearErr();
    return { valid: true, unitsPerCarton: upc, reason: '' };
}
window.validateAllocationCartons = validateAllocationCartons;

function updateShippingAllocationTotal(sku) {
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList) return;

    const inputs = methodsList.querySelectorAll('input[data-field="qty"]');
    let total = 0;
    inputs.forEach(input => {
        total += parseInt(input.value) || 0;
    });

    const totalSpan = document.getElementById(`allocation-total-${sku}`);
    const hintDiv = document.getElementById(`allocation-hint-${sku}`);

    if (totalSpan) totalSpan.textContent = total;

    // Live carton-multiple validation (inline red text under the allocation block).
    validateAllocationCartons(sku);

    if (hintDiv) {
        // 獲取工廠庫存 (CN + TW)
        const data = getReplenishmentData();
        const skuData = data.find(item => item.sku === sku);
        const factoryStock = (skuData?.cnStock || 0) + (skuData?.twStock || 0);
        
        if (total > factoryStock) {
            hintDiv.style.color = '#991B1B';
            hintDiv.textContent = `Insufficient Stock (Factory: ${factoryStock}, Need: ${total})`;
        } else {
            hintDiv.style.color = 'var(--text-muted)';
            hintDiv.textContent = `Factory Stock Available: ${factoryStock} units`;
        }
    }
}

// Escape a value for use inside an HTML attribute (Execution Plan route inputs).
function _execEsc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Execution Plan shipping-method options — REAL carrier_rate_cards read path (2026-07-28) ──────────
// Method is NO LONGER a hardcoded list. Options are derived live from `carrier_rate_cards`
// (KM.DB.getCarrierRateCards) matched to the route: origin country (From warehouse) + destination
// country (selected Marketplace/Site country — for Amazon this comes from the Site context, NEVER from
// an FBA warehouse) + marketplace. The displayed value is the rate card's real shipping_method (label
// falls back to shipping_method_label when present). No mock, no static fallback — when nothing matches
// the picker shows an explicit "No available methods" empty state. See CARRIER_AND_ROUTE_SPEC.

// A rate card is usable if it is not explicitly inactive and (when effective dates are present) today
// falls inside the effective window. carrier_rate_cards has NO is_active column — the only status
// signal is the free-text `status` field, so we exclude explicit inactive tokens rather than allow-list.
function _execRateCardUsable(rc) {
    if (!rc) return false;
    var st = String(rc.status || '').trim().toLowerCase();
    if (st === 'inactive' || st === 'disabled' || st === 'archived' || st === 'expired' || st === 'void' || st === 'deleted') return false;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    function parseD(s) { var d = new Date(String(s == null ? '' : s).trim()); return isNaN(d.getTime()) ? null : d; }
    var from = rc.effectiveFrom ? parseD(rc.effectiveFrom) : null;
    var to = rc.effectiveTo ? parseD(rc.effectiveTo) : null;
    if (from && today < from) return false;
    if (to && today > to) return false;
    return true;
}

// Distinct { value, label } shipping methods from carrier_rate_cards for a route. originCountry may be ''
// (From not yet chosen) — then origin is not constrained; destination + marketplace still narrow the set.
// A rate card field that is blank does not exclude it (blank = wildcard on that axis).
function _execRateCardMethods(originCountry, destCountry, marketplace) {
    var DB = (window.KM && window.KM.DB) ? window.KM.DB : null;
    var cards = (DB && DB.getCarrierRateCards) ? (DB.getCarrierRateCards() || []) : [];
    function lo(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
    var seen = {}, out = [];
    cards.forEach(function (rc) {
        if (!_execRateCardUsable(rc)) return;
        if (destCountry && rc.destinationCountry && lo(rc.destinationCountry) !== lo(destCountry)) return;
        if (originCountry && rc.originCountry && lo(rc.originCountry) !== lo(originCountry)) return;
        if (marketplace && rc.marketplace && lo(rc.marketplace) !== lo(marketplace)) return;
        var value = String(rc.shippingMethod || '').trim();
        if (!value) return;
        var label = String(rc.shippingMethodLabel || '').trim() || value;
        var k = value.toLowerCase();
        if (seen[k]) return;
        seen[k] = 1;
        out.push({ value: value, label: label });
    });
    out.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return out;
}

// Build the Method <select> option HTML. Empty match set → single explicit empty-state option (never a
// fabricated method). A previously-saved method that is no longer in the set is dropped (not re-added).
function _execMethodOptionsHtml(methods, selected) {
    if (!methods || !methods.length) return '<option value="">No available methods</option>';
    var html = '<option value="">Method…</option>';
    methods.forEach(function (m) {
        var sel = (String(selected == null ? '' : selected) === m.value) ? ' selected' : '';
        html += '<option value="' + _execEsc(m.value) + '"' + sel + '>' + _execEsc(m.label) + '</option>';
    });
    return html;
}

// Re-filter every route row's Method options after a From/To/scope change: origin country is read off the
// selected From option; a still-valid selection is preserved, an out-of-scope one is cleared (§3.5).
function _execRebuildMethodOptions(sku) {
    var list = document.getElementById('shipping-methods-' + sku);
    if (!list) return;
    var scope = _replenSelectedScope();
    list.querySelectorAll('.exec-route-row').forEach(function (rowEl) {
        var fromEl = rowEl.querySelector('[data-field="source_warehouse_id"]');
        var methodEl = rowEl.querySelector('[data-field="shipping_method"]');
        if (!methodEl) return;
        var originCountry = '';
        if (fromEl && fromEl.options && fromEl.selectedIndex >= 0) {
            var opt = fromEl.options[fromEl.selectedIndex];
            originCountry = opt ? String(opt.getAttribute('data-wh-country') || '').trim() : '';
        }
        var methods = _execRateCardMethods(originCountry, scope.country, scope.marketplace);
        var current = methodEl.value;
        var stillValid = methods.some(function (m) { return m.value === current; });
        methodEl.innerHTML = _execMethodOptionsHtml(methods, stillValid ? current : '');
        if (!stillValid) methodEl.value = '';
        methodEl.disabled = !methods.length;
    });
}

// Map an Execution Plan method label to a carrier_lead_times.shipping_method value.
function _irMethodToLeadKey(method) {
    var m = String(method || '').trim().toLowerCase();
    if (m.indexOf('air') === 0) return 'Air';
    if (m.indexOf('sea express') === 0) return 'Sea Express';
    if (m.indexOf('sea') === 0) return 'Sea';
    if (m.indexOf('express') === 0 || m.indexOf('courier') === 0) return 'Courier';
    return '';   // Rail / unknown → no lead-time mapping
}

// Expected Arrival for an Execution Plan route (§11.3). ETA priority: runtime actual ETA → formal
// planned ETA → carrier_lead_times estimate. In Inventory Replenishment (planning) there is no
// runtime/formal shipment yet, so the estimate is the carrier_lead_times avg_days from today's ship
// date. If lead-time data is incomplete → explicit unavailable state (never a fabricated ETA).
// Route-template node offsets are NEVER used as a lead-time source.
function _irComputeRouteEta(destCountry, route) {
    var method = route && route.shipping_method;
    if (!method) return { text: '—', available: false };
    var key = _irMethodToLeadKey(method);
    if (!key) return { text: 'Lead time unavailable', available: false };
    var rows = (window.KM && window.KM.DB && window.KM.DB.getCarrierLeadTimes) ? window.KM.DB.getCarrierLeadTimes() : [];
    function lo(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
    var matches = rows.filter(function (r) {
        return lo(r.shippingMethod) === lo(key) &&
            (!destCountry || !r.destinationCountry || lo(r.destinationCountry) === lo(destCountry));
    });
    // Prefer a row that actually carries avg_days.
    var withAvg = matches.filter(function (r) { return r.avgDays !== '' && r.avgDays != null && !isNaN(r.avgDays); })[0];
    if (!withAvg) return { text: 'Lead time unavailable', available: false };
    var days = Math.round(parseFloat(withAvg.avgDays));
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days);
    var iso = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return { text: iso + ' (est. ' + days + 'd)', available: true };
}

// Recompute + write every route row's Expected Arrival cell for a SKU (called on any route edit).
function _irUpdateRouteEtas(sku) {
    var list = document.getElementById('shipping-methods-' + sku);
    if (!list) return;
    var destCountry = '';
    try { var data = getReplenishmentData(); var sd = data && data.find(function (d) { return d.sku === sku; }); destCountry = sd ? sd.country : ''; } catch (e) {}
    list.querySelectorAll('.exec-route-row').forEach(function (rowEl) {
        var method = (rowEl.querySelector('[data-field="shipping_method"]') || {}).value || '';
        var eta = _irComputeRouteEta(destCountry, { shipping_method: method });
        var cell = rowEl.querySelector('[data-field="expected_arrival"]');
        if (cell) { cell.textContent = eta.text; cell.classList.toggle('replen-card__eta--na', !eta.available); }
    });
}

// ── Execution Plan warehouse pickers (2026-07-28) ────────────────────────────────────────────────
// From / To are Dropdowns sourced from the `warehouses` master — no free text. Each option's VALUE is
// the canonical warehouse_id; the label is warehouse_name (Warehouse Name is display-only, NEVER a
// stored key). Candidates are scoped to the current Company + the selected Marketplace country:
//   FROM = Factory warehouses (ANY country — factory source may be CN/TW) + company/country 3PL.
//   TO   = company/country 3PL + (Amazon marketplace only) real Amazon FBA destinations in that country.
// Every concrete option is a real warehouse_id (no fabricated Amazon id). Country/Marketplace/Company
// changes re-derive candidates on the next render; a saved selection no longer in scope is cleared.
function _execEq(a, b) { return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase(); }
function _execWhType(w) { return String((w && w.warehouseType) || '').trim().toUpperCase(); }

function _execWarehouseCandidates() {
    var scope = _replenSelectedScope();
    var DB = (window.KM && window.KM.DB) ? window.KM.DB : null;
    var whs = (DB && DB.getWarehouses) ? (DB.getWarehouses() || []) : [];

    // One central candidate contract for EVERY site (System Repair 1) — see inventory-compat.js
    // IRWarehouse.buildCandidates. Classification is by warehouse master fields (warehouse_type /
    // is_factory_warehouse), never by display name; country is UK≡GB alias-aware (no EU expansion for
    // warehouses). FROM = Factory (any country) + same-company/country Active 3PL Overseas. TO =
    // same-company/country Active 3PL Overseas + (Amazon only) matching Active FBA — every option a
    // REAL warehouse_id.
    if (window.IRWarehouse && window.IRWarehouse.buildCandidates) {
        return window.IRWarehouse.buildCandidates(whs, scope);
    }

    // Fallback (shared module absent): previous inline logic, kept only for resilience. Aligned with
    // the Round 2 strict contract — STRICT active (is_active must resolve to TRUE; blank/null/false
    // excluded) and Factory company-scoped (no blank-company sharing). It does NOT enumerate FBA
    // destinations (Amazon To handled by the legacy _execToOptionsHtml path).
    var isAmazon = _execEq(scope.marketplace, 'Amazon');
    function activeStrict(w) {
        if (!w || !w.warehouseId) return false;
        var v = w.isActive;
        if (v === true) return true;
        if (v === false) return false;
        var s = String(v == null ? '' : v).trim().toLowerCase();
        return s === 'true' || s === 'yes' || s === 'y' || s === '1';
    }
    function companyStrict(w) { return !scope.company || _execEq(w.company, scope.company); }
    function countryStrict(w) { return !scope.country || _execEq(w.country, scope.country); }

    var from = [], to = [];
    whs.forEach(function (w) {
        if (!activeStrict(w)) return;
        var t = _execWhType(w);
        var isFactory = (w.isFactoryWarehouse === true) || t === 'FACTORY';
        if (isFactory && companyStrict(w)) from.push(w);
        else if (t === '3PL' && companyStrict(w) && countryStrict(w)) from.push(w);
        if (!isAmazon && t === '3PL' && companyStrict(w) && countryStrict(w)) to.push(w);
    });
    return { from: _execDedupWh(from), to: _execDedupWh(to), isAmazon: isAmazon };
}

function _execDedupWh(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (w) { var id = String(w.warehouseId); if (seen[id]) return; seen[id] = 1; out.push(w); });
    out.sort(function (a, b) { return String(a.warehouseName || a.warehouseId).localeCompare(String(b.warehouseName || b.warehouseId)); });
    return out;
}

// Resolve a warehouse_id from a saved display name (legacy drafts that stored only ship_from/destination
// text before the picker existed). Returns '' if no candidate name matches.
function _execResolveIdByName(list, name) {
    if (!name) return '';
    var hit = (list || []).filter(function (w) { return _execEq(w.warehouseName, name); })[0];
    return hit ? String(hit.warehouseId) : '';
}

function _execNameKey(w) { return String((w && w.warehouseName) || '').trim().toLowerCase(); }
function _execNameCounts(list) {
    var counts = {};
    (list || []).forEach(function (w) { var k = _execNameKey(w); counts[k] = (counts[k] || 0) + 1; });
    return counts;
}
// One <option>. Secondary info (code / country) is appended to the label ONLY when names repeat — the
// VALUE always stays the raw warehouse_id.
function _execWhOption(w, selectedId, ambiguous) {
    var name = w.warehouseName || w.warehouseId;
    var label = name;
    if (ambiguous) { var extra = [w.warehouseCode, w.country].filter(Boolean).join(' / '); if (extra) label = name + ' (' + extra + ')'; }
    var sel = (selectedId && String(w.warehouseId) === String(selectedId)) ? ' selected' : '';
    return '<option value="' + _execEsc(String(w.warehouseId)) + '" data-wh-name="' + _execEsc(name) +
        '" data-wh-type="' + _execEsc(w.warehouseType || '') + '" data-wh-country="' + _execEsc(w.country || '') + '"' + sel + '>' + _execEsc(label) + '</option>';
}
function _execFromOptionsHtml(list, selectedId) {
    if (!list.length) return '<option value="">No warehouses</option>';
    var counts = _execNameCounts(list);
    var html = '<option value="">From…</option>';
    list.forEach(function (w) { html += _execWhOption(w, selectedId, (counts[_execNameKey(w)] || 0) > 1); });
    return html;
}
function _execToOptionsHtml(list, selectedId, isAmazon) {
    // Round 4 Decision B (Weekly Shipping Plan / planning level): To = eligible real 3PL warehouses
    // (value = real warehouse_id) PLUS — for an Amazon marketplace — EXACTLY ONE Amazon logical
    // destination (value = MARKETPLACE_DESTINATION token, NOT a warehouse_id; no individual FBA codes).
    // buildCandidates already appended the single logical destination for Amazon. The real FBA
    // warehouse_id is resolved later at the Shipment Draft execution stage (contract unchanged).
    if (!list.length) return '<option value="">No eligible warehouses</option>';
    var reals = list.filter(function (w) { return !w.logicalDestination; });
    var counts = _execNameCounts(reals);
    var html = '<option value="">To…</option>';
    list.forEach(function (w) {
        if (w.logicalDestination) {
            var lsel = (selectedId && String(selectedId) === String(w.token)) ? ' selected' : '';
            html += '<option value="' + _execEsc(String(w.token)) + '" data-wh-name="Amazon" data-wh-type="MARKETPLACE_DESTINATION" data-wh-country="' + _execEsc(w.country || '') + '"' + lsel + '>Amazon</option>';
        } else {
            html += _execWhOption(w, selectedId, (counts[_execNameKey(w)] || 0) > 1);
        }
    });
    return html;
}
// From and To must never be the same warehouse_id — clear the To selection if it collides (verify #19).
function _execEnforceDistinctWarehouses(sku) {
    var list = document.getElementById('shipping-methods-' + sku);
    if (!list) return;
    list.querySelectorAll('.exec-route-row').forEach(function (rowEl) {
        var fromEl = rowEl.querySelector('[data-field="source_warehouse_id"]');
        var toEl = rowEl.querySelector('[data-field="destination_warehouse_id"]');
        if (fromEl && toEl && fromEl.value && toEl.value && fromEl.value === toEl.value) {
            toEl.value = '';
            toEl.classList.add('replen-card__select--error');
            setTimeout(function () { if (toEl) toEl.classList.remove('replen-card__select--error'); }, 1500);
        }
    });
}

// Render one Execution Plan route row: From / To / Qty / Method / Expected Arrival / Action (§11.3).
function _renderExecutionRoute(sku, route) {
    route = route || {};
    var qty = parseInt(route.qty) || 0;
    var scope = _replenSelectedScope();
    var destCountry = '';
    try { var data = getReplenishmentData(); var sd = data && data.find(function (d) { return d.sku === sku; }); destCountry = sd ? sd.country : ''; } catch (e) {}
    if (!destCountry) destCountry = scope.country;   // Amazon dest country comes from Site/Marketplace context
    var eta = _irComputeRouteEta(destCountry, route);
    // Warehouse picker candidates for the current scope + the saved (or name-resolved) selections.
    var cand = _execWarehouseCandidates();
    var fromSelId = route.source_warehouse_id || _execResolveIdByName(cand.from, route.ship_from);
    var toSelId = route.destination_warehouse_id || _execResolveIdByName(cand.to, route.destination);
    var fromDisabled = cand.from.length ? '' : ' disabled';
    // System Repair 1: To is enabled only when there are REAL candidates (Amazon no longer force-enabled
    // via a synthetic option). Empty → disabled + explicit empty state, for every site type alike.
    var toDisabled = cand.to.length ? '' : ' disabled';
    // Method options from real carrier_rate_cards, keyed on the chosen From origin country (if any) +
    // destination country + marketplace. No hardcoded fallback.
    var fromWh = cand.from.filter(function (w) { return String(w.warehouseId) === String(fromSelId); })[0];
    var originCountry = fromWh ? fromWh.country : '';
    var methods = _execRateCardMethods(originCountry, destCountry, scope.marketplace);
    var methodOpts = _execMethodOptionsHtml(methods, route.shipping_method);
    var methodDisabled = methods.length ? '' : ' disabled';
    var row = document.createElement('div');
    row.className = 'exec-route-row ir-exec-plan__grid';
    // Persisted Draft line identity (Round 4 Decision E) — enables incremental update + soft-cancel of
    // the SAME shipping_allocation_draft_lines row (empty for a new/unsaved route).
    if (route && route.allocation_draft_line_id) row.setAttribute('data-line-id', String(route.allocation_draft_line_id));
    row.innerHTML =
        '<select class="replen-card__select replen-card__select--wh" data-field="source_warehouse_id" onchange="onExecutionRouteEdit(\'' + sku + '\')" onclick="event.stopPropagation()"' + fromDisabled + '>' + _execFromOptionsHtml(cand.from, fromSelId) + '</select>' +
        '<select class="replen-card__select replen-card__select--wh" data-field="destination_warehouse_id" onchange="onExecutionRouteEdit(\'' + sku + '\')" onclick="event.stopPropagation()"' + toDisabled + '>' + _execToOptionsHtml(cand.to, toSelId, cand.isAmazon) + '</select>' +
        '<input class="replen-card__input" type="number" data-field="qty" value="' + qty + '" oninput="onExecutionRouteEdit(\'' + sku + '\')" onclick="event.stopPropagation()">' +
        '<select class="replen-card__select" data-field="shipping_method" onchange="onExecutionRouteEdit(\'' + sku + '\')" onclick="event.stopPropagation()"' + methodDisabled + '>' + methodOpts + '</select>' +
        '<span class="replen-card__eta' + (eta.available ? '' : ' replen-card__eta--na') + '" data-field="expected_arrival">' + _execEsc(eta.text) + '</span>' +
        '<button class="replen-card__remove-btn" onclick="removeExecutionRoute(event, \'' + sku + '\')" title="Delete">×</button>';
    var list = document.getElementById('shipping-methods-' + sku);
    if (list) list.appendChild(row);
}

// + Add Route: append a blank Execution Plan route the PM fills in.
function addExecutionRoute(event, sku) {
    if (event) event.stopPropagation();
    _renderExecutionRoute(sku, {});
    onExecutionRouteEdit(sku);
    syncExpandPanelHeight(sku);
}

// Delete an Execution Plan route = SOFT CANCEL the persisted Draft line (Round 4 Decision E §16);
// never a hard delete. If the row was persisted (has data-line-id) its DB line is soft-cancelled
// (line_status='cancelled'); the remaining rows are re-saved incrementally. New/unsaved rows just
// drop from the DOM. (No-op headless — API not configured.)
function removeExecutionRoute(event, sku) {
    if (event) event.stopPropagation();
    var row = event.target.closest('.exec-route-row');
    if (row) {
        var lineId = row.getAttribute('data-line-id');
        if (lineId && typeof _cancelAllocationDraftLine === 'function') _cancelAllocationDraftLine(lineId);
        row.remove();
        onExecutionRouteEdit(sku);
        syncExpandPanelHeight(sku);
    }
}
window.addExecutionRoute = addExecutionRoute;
window.removeExecutionRoute = removeExecutionRoute;

function syncExpandPanelHeight(sku) {
    // No-op. Expand-row equal height is now CSS-native: .fixed-col / .fixed-body are flex columns and
    // .replen-expand-panel--fixed { flex:1 } stretches the SKU identity panel to the taller .scroll-col
    // (via .table-body-bar's default align-items:stretch). This must NEVER write inline height again —
    // doing so reintroduced the two-stage first-paint height flash. Kept as a stub so existing callers
    // (Execution Plan route add/remove) don't break; when the right panel's content changes height, the
    // left panel re-stretches in the same frame with no measurement.
}

// Render the Execution Plan routes for a SKU (from Working Draft, or a default preview).
function initializeShippingAllocation(sku, skuData) {
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList || !skuData) return;

    // 1) If a Working Draft exists for this SKU (same context), rebuild the Execution Plan from it
    //    so PM edits survive collapse / expand. This is a pure render — it must NOT re-capture.
    var draftRows = _allocationDraftRowsFor(sku);
    if (draftRows) {
        draftRows.forEach(function (r) { _renderExecutionRoute(sku, r); });
        updateShippingAllocationTotal(sku);
        return;
    }

    // 2) Otherwise seed a single default Execution Plan route from the Recommendation Summary total
    //    (Suggested Qty). ship_from / destination / shipping_method are left blank — FUTURE they are
    //    defaulted from replenishment_route_rules (CARRIER_AND_ROUTE_SPEC). This is a default preview:
    //    it is captured into the Working Draft only once the PM edits it.
    var suggested = parseInt(skuData.suggestedQty) || 0;
    _renderExecutionRoute(sku, { ship_from: '', destination: '', shipping_method: '', qty: suggested });
    updateShippingAllocationTotal(sku);
}

window.initializeShippingAllocation = initializeShippingAllocation;

window.openShippingAllocation = openShippingAllocation;
window.openAISuggestion = openAISuggestion;
window.updateShippingAllocationTotal = updateShippingAllocationTotal;


// ========================================
// Inventory Replenishment - 從 app.js 搬移 (批次 3: Charts + Modals)
// ========================================

// ========================================

function initSalesTrendChart(sku, skuData) {
    const canvas = document.getElementById(`sales-trend-chart-${sku}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const today = new Date();
    const labels = [];
    const data = [];

    const realTrend = skuData && Array.isArray(skuData.salesTrend7d) ? skuData.salesTrend7d : null;
    if (realTrend && realTrend.length) {
        // Cloud mapping: SEVEN calendar dates ending on the latest DB date (#2). Every date is shown on
        // the x-axis; a day with no row has units === null → rendered as a GAP (never a fabricated 0).
        realTrend.forEach(function(pt) { labels.push(pt.label); data.push(pt.units == null ? null : pt.units); });
    } else if (skuData && skuData._source === 'cloud-mapping') {
        // Cloud mapping with no daily-sales data — show empty (never fabricate sales).
    } else {
        // Demo fallback: synthetic past-7-day shape derived from the weekly average.
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
            const baseValue = skuData.lastWeek / 7;
            const variance = baseValue * 0.3;
            data.push(Math.round(baseValue + (Math.random() - 0.5) * variance));
        }
    }

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales Units',
                data: data,
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                spanGaps: false,      // missing days stay as gaps (no fabricated bridge / no 0)
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

// The random-data Achievement Rate chart was removed (2026-07-22). Monthly Achievement Rate is now an
// honest read-only TABLE (see _irRenderMonthlyAchievement): no mock/random/fabricated percentages, and
// no 0% (which would imply a computed-zero). Kept as a no-op so any legacy caller can't throw.
function initAchievementChart(/* sku, skuData */) { /* intentionally empty — see _irRenderMonthlyAchievement */ }

// The N most-recently COMPLETED calendar months ending with the month BEFORE referenceDate's month
// (the current partial month is excluded). Handles year rollover. Returns oldest→newest.
// e.g. getPreviousCompletedMonths(2026-07-22, 3) → [Apr 2026, May 2026, Jun 2026].
function getPreviousCompletedMonths(referenceDate, n) {
    var ref = referenceDate ? new Date(referenceDate) : new Date();
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var out = [];
    for (var i = n; i >= 1; i--) {
        // First day of (this month − i) safely handles year boundaries.
        var d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
        out.push({ year: d.getFullYear(), monthIdx: d.getMonth(), label: MON[d.getMonth()] + ' ' + d.getFullYear() });
    }
    return out;
}

// PLACEHOLDER interface — the canonical Monthly Achievement metric is NOT defined/implemented yet.
// Returns an explicit unavailable state; NEVER computes a rate from FC / sales / any approximation.
// When the formal metric is defined, this is the single wiring point.
function getMonthlyAchievementMetrics(/* { marketplace_sku_id, company, country, marketplace, year, month } */) {
    return { status: 'unavailable', achievementRate: null, actual: null, sessions: null, usp: null };
}

// Real historical FC Qty for a scoped SKU + a specific completed year/month, from fc_regular_forecast
// (company + country + marketplace, company-safe). Returns a number or null (→ "—"; never fabricated 0).
var _IR_MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function _irHistoricalFcQty(skuData, year, monthIdx) {
    if (!skuData || !skuData.sku) return null;
    var DB = (window.KM && window.KM.DB) ? window.KM.DB : null;
    if (!DB || !DB.getFcRegularForecast) return null;
    function up(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
    function lo(v){ return String(v == null ? '' : v).trim().toLowerCase(); }
    var rows = DB.getFcRegularForecast() || [];
    var row = rows.filter(function (r) {
        return up(r.sku) === up(skuData.sku) && String(r.year) === String(year) &&
            (!skuData.company || !r.company || up(r.company) === up(skuData.company)) &&
            (!skuData.country || !r.country || up(r.country) === up(skuData.country)) &&
            (!skuData.marketplace || !r.marketplace || lo(r.marketplace) === lo(skuData.marketplace));
    })[0];
    if (!row) return null;
    var raw = row[_IR_MONTH_KEYS[monthIdx]];
    if (raw === '' || raw == null) return null;
    var num = Number(raw);
    return isNaN(num) ? null : Math.round(num);
}

// Monthly Achievement Rate — honest read-only table for the past 3 COMPLETED months. Achievement Rate /
// Actual / Sessions / USP have no defined source yet → "—" (never 0%, never mock). FC Qty shows real
// historical fc_regular_forecast when present, else "—".
function _irRenderMonthlyAchievement(skuData) {
    var DASH = '—';
    var months = getPreviousCompletedMonths(new Date(), 3);
    var body = months.map(function (m) {
        var metrics = getMonthlyAchievementMetrics({
            marketplace_sku_id: skuData ? skuData.marketplaceSkuId : '', company: skuData ? skuData.company : '',
            country: skuData ? skuData.country : '', marketplace: skuData ? skuData.marketplace : '',
            year: m.year, month: m.monthIdx + 1
        });
        var ach = (metrics && metrics.achievementRate != null) ? (metrics.achievementRate + '%') : DASH;
        var fcQty = _irHistoricalFcQty(skuData, m.year, m.monthIdx);
        var fcDisp = (fcQty == null) ? DASH : fcQty.toLocaleString();
        var actual = (metrics && metrics.actual != null) ? Number(metrics.actual).toLocaleString() : DASH;
        var sessions = (metrics && metrics.sessions != null) ? Number(metrics.sessions).toLocaleString() : DASH;
        var usp = (metrics && metrics.usp != null) ? metrics.usp : DASH;
        return '<tr><td>' + m.label + '</td><td>' + ach + '</td><td class="replen-achv__num">' + fcDisp +
            '</td><td class="replen-achv__num">' + actual + '</td><td class="replen-achv__num">' + sessions +
            '</td><td class="replen-achv__num">' + usp + '</td></tr>';
    }).join('');
    return '<table class="replen-achv-table"><thead><tr>' +
        '<th>Month</th><th>Achievement</th><th class="replen-achv__num">FC Qty</th>' +
        '<th class="replen-achv__num">Actual</th><th class="replen-achv__num">Sessions</th><th class="replen-achv__num">USP</th>' +
        '</tr></thead><tbody>' + body + '</tbody></table>';
}

window.initSalesTrendChart = initSalesTrendChart;
window.initAchievementChart = initAchievementChart;
window.getPreviousCompletedMonths = getPreviousCompletedMonths;
window.getMonthlyAchievementMetrics = getMonthlyAchievementMetrics;


// Add Marketplace Modal Functions
function openAddMarketplaceModal() {
    const modal = document.getElementById('add-marketplace-modal');
    const overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.add('is-open');
        overlay.classList.add('is-open');
    }
}

function closeAddMarketplaceModal() {
    const modal = document.getElementById('add-marketplace-modal');
    const overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.remove('is-open');
        overlay.classList.remove('is-open');
    }
    // Clear inputs
    document.getElementById('add-mp-country').value = 'US';
    document.getElementById('add-mp-company').value = 'KM';
    document.getElementById('add-mp-marketplace').value = '';
    var curEl = document.getElementById('add-mp-currency');
    if (curEl) curEl.value = 'USD';
    var dnEl = document.getElementById('add-mp-display-name');
    if (dnEl) dnEl.value = '';
    var ffEl = document.getElementById('add-mp-fulfillment');
    if (ffEl) ffEl.value = 'platform_fulfilled';
}

function saveMarketplace() {
    const country = document.getElementById('add-mp-country').value;
    const company = document.getElementById('add-mp-company').value;
    const marketplace = document.getElementById('add-mp-marketplace').value.trim();
    const curEl = document.getElementById('add-mp-currency');
    const currency = curEl ? curEl.value : 'USD';
    const dnEl = document.getElementById('add-mp-display-name');
    const displayName = dnEl ? dnEl.value.trim() : '';
    const ffEl = document.getElementById('add-mp-fulfillment');
    const fulfillmentModel = ffEl ? ffEl.value : '';

    if (!marketplace) { alert('Please enter marketplace name'); return; }
    if (!company || !country) { alert('Company and Country are required'); return; }
    if (!currency) { alert('Currency is required'); return; }
    if (!fulfillmentModel) { alert('Fulfillment Model is required'); return; }

    if (!(window.KM && window.KM.DB && window.KM.DB.upsertMarketplace)) {
        alert('Marketplace API is not available.');
        return;
    }

    window.KM.DB.upsertMarketplace({
        company: company,
        country: country,
        marketplace: marketplace,
        marketplace_display_name: displayName || marketplace,
        // MVP: alias defaults to the marketplace value. (Backend also defaults this when blank.)
        marketplace_alias: marketplace,
        fulfillment_model: fulfillmentModel,
        currency: currency,
        status: 'active'
    }).then(function(result) {
        if (result && result.success === false) {
            alert('Could not save marketplace. ' + (result.error || 'Please check the API connection and try again.'));
            return;
        }
        var st = (result && result.status) ? result.status : 'saved';
        alert('Marketplace ' + st + ': ' + company + ' / ' + country + ' / ' + marketplace);
        closeAddMarketplaceModal();
        // Refresh registry-backed dropdowns/filters.
        if (typeof populateReplenFiltersFromRegistry === 'function') populateReplenFiltersFromRegistry();
    }).catch(function(err) {
        alert('Could not save marketplace. ' + (err && err.message ? err.message : err));
    });
}

window.openAddMarketplaceModal = openAddMarketplaceModal;
window.closeAddMarketplaceModal = closeAddMarketplaceModal;
window.saveMarketplace = saveMarketplace;

// ---- Sync Regional Details (idempotent, resumable backfill trigger) ----
// Scans marketplace_skus and CREATES the missing sku_regional_details row for each
// (match key sku+company+country+marketplace). Idempotent: existing rows are skipped, never rewritten.
// Batched server-side (default 300 creates/run) to avoid timeouts — if it stops early, click again to
// continue. Repeatable without creating duplicates. Compliance-document fields are never touched.
function syncRegionalDetails() {
    if (!window.KM || !window.KM.DB || typeof window.KM.DB.syncMarketplaceSkusToSkuRegionalDetails !== 'function') {
        alert('Sync is unavailable (KM.DB API not loaded).');
        return;
    }
    if (!confirm('Backfill SKU Regional Details from marketplace_skus?\n\n' +
        '• Missing regional rows are CREATED.\n' +
        '• Rows that already exist are SKIPPED (never rewritten).\n' +
        '• Runs in batches (default 300 per click) to avoid timeouts.\n' +
        '• Safe to run repeatedly — no duplicates. If it stops early, click again to continue.\n\n' +
        'Continue?')) {
        return;
    }
    var btn = document.querySelector('button[onclick="syncRegionalDetails()"]');
    var prevLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }

    window.KM.DB.syncMarketplaceSkusToSkuRegionalDetails().then(function(res) {
        var r = res || {};
        var finished = (r.finished !== false) && !(r.remaining_count > 0);
        var lines = [
            finished ? 'SKU Regional Details sync FINISHED.' : 'SKU Regional Details batch done — more rows remain.',
            '',
            'Created:                ' + (r.created_count || 0),
            'Skipped (already exists): ' + (r.skipped_exists_count || 0),
            'Skipped (invalid):       ' + (r.skipped_invalid_count || 0),
            'Remaining:               ' + (r.remaining_count || 0),
            'Finished:                ' + (finished ? 'true' : 'false')
        ];
        if (!finished) {
            lines.push('', '➡ Click "Sync Regional Details" again to continue (already-created rows are skipped).');
        }
        if (r.warnings && r.warnings.length) {
            lines.push('', '— Warnings —');
            lines.push.apply(lines, r.warnings.slice(0, 20));
            if (r.warnings.length > 20) lines.push('…and ' + (r.warnings.length - 20) + ' more');
        }
        if (r.errors && r.errors.length) {
            lines.push('', '— Errors —');
            lines.push.apply(lines, r.errors.slice(0, 20));
            if (r.errors.length > 20) lines.push('…and ' + (r.errors.length - 20) + ' more');
        }
        alert(lines.join('\n'));
    }).catch(function(err) {
        alert('Sync failed. ' + (err && err.message ? err.message : err));
    }).then(function() {
        if (btn) { btn.disabled = false; btn.textContent = prevLabel; }
    });
}
window.syncRegionalDetails = syncRegionalDetails;

// Add Country Functions
function showAddCountryInput() {
    const container = document.getElementById('add-country-input-container');
    if (container) {
        container.style.display = 'block';
    }
}

function cancelAddCountry() {
    const container = document.getElementById('add-country-input-container');
    const input = document.getElementById('new-country-code');
    if (container) container.style.display = 'none';
    if (input) input.value = '';
}

function addNewCountry() {
    const input = document.getElementById('new-country-code');
    const select = document.getElementById('add-mp-country');
    
    if (!input || !select) return;
    
    const countryCode = input.value.trim().toUpperCase();
    
    if (!countryCode) {
        alert('Please enter a country code');
        return;
    }
    
    // Check if country already exists
    const existingOptions = Array.from(select.options);
    if (existingOptions.some(opt => opt.value === countryCode)) {
        alert('Country code already exists');
        return;
    }
    
    // Add new option
    const newOption = document.createElement('option');
    newOption.value = countryCode;
    newOption.textContent = countryCode;
    select.appendChild(newOption);
    
    // Select the new option
    select.value = countryCode;
    
    // Clear and hide input
    input.value = '';
    const container = document.getElementById('add-country-input-container');
    if (container) container.style.display = 'none';
}

window.showAddCountryInput = showAddCountryInput;
window.cancelAddCountry = cancelAddCountry;
window.addNewCountry = addNewCountry;



// ========================================
// Search-triggered loading (Demo OFF + Cloud Read)
// ========================================
function searchReplenishment() {
    // A new search (incl. Country / Marketplace change then Search) resets the Category tab to All.
    replenCategoryTab = 'All';

    // Demo ON: just re-render (demo does not need search)
    if (_replenDemoOn()) {
        renderReplenishment();
        return;
    }

    // Demo OFF: if the DB cache isn't loaded yet, load once, populate filters, then search.
    if (!window._opDbCache) {
        var loader = (window.KM && window.KM.DB && window.KM.DB.loadOperationDb)
            ? window.KM.DB.loadOperationDb
            : (window.reloadOperationDb || null);
        if (loader) {
            loader({ force: true }).then(function() {
                populateReplenFiltersFromRegistry();
                _doReplenSearch();
            }).catch(function() {
                _doReplenSearch();
            });
            return;
        }
    }
    _doReplenSearch();
}

function _doReplenSearch() {
    var country = document.getElementById('replenCountry').value;
    // marketplace = marketplace_id (Cloud) or marketplace name (Demo); company is derived from it.
    var marketplace = document.getElementById('replenMarketplace').value;
    if (!country && !marketplace) {
        alert('Please select Country and Marketplace before searching.');
        return;
    }
    if (!country) {
        alert('Please select a Country.');
        return;
    }
    if (!marketplace) {
        alert('Please select a Marketplace.');
        return;
    }
    renderReplenishment();
    // F1-4B-B / FM5-R1: after loading the scope, read the materialized gap (default) or issue at most one live
    // recommendation.workspace.get (diagnostic/fallback). One request per scope; never per SKU; never both.
    if (typeof _irRecoTrigger === 'function') _irRecoTrigger();
}
window.searchReplenishment = searchReplenishment;

// ---- F1-4B-FM5-R4J · "Recalculate All Sites" (Inventory Replenishment Gap) — BACKEND-OWNED RESUMABLE JOB ------
// The ~14-min all-site materialization is NO LONGER owned by the browser request. One click STARTS one backend job
// (a quick write returning { runId, status, scopesTotal }; NO calculation in the request, NO write retry) and the
// page then POLLS a strictly READ-ONLY status endpoint until terminal, showing Starting… / Calculating N/M /
// Refreshing… / Completed. The backend owns the job to completion even if this tab is closed/refreshed (recovered
// on mount by _irResumeGapJobOnMount_). On DONE the page refreshes the materialized read — NO page-side formula.
var _irRecalcAllBusy = false;
var _irActiveRunId = null;         // LIVE4 — the backend runId of the in-flight job (for a targeted Cancel)
var _irCancelRequested = false;    // LIVE4 — set once by the Cancel button so the poller stops cooperatively
function _irRecalcBtn_() { return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('replen-recalc-all-btn') : null; }
function _irCancelBtn_() { return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('replen-cancel-recalc-btn') : null; }
function _irShowCancel_(show) { var c = _irCancelBtn_(); if (c) { c.style.display = show ? '' : 'none'; if (show) c.disabled = false; } }
// LIVE10 §13/§14 — ONE handler, optional bounded scope. scopeSpec = { mode:'ALL_SITES'|'CURRENT_COUNTRY'|
// 'CURRENT_SCOPE', company?, country?, marketplace? }; omitted ⇒ ALL_SITES (the existing button, unchanged). The
// scope is passed to the backend job START; nothing else about the lifecycle changes (one START → poll → refresh).
function handleRecalcAllInventoryGap(scopeSpec) {
  if (_irRecalcAllBusy) return;
  if (!(window.KM && window.KM.DB && typeof window.KM.DB.startInventoryReplenishmentGapJob === 'function')) {
    alert('Recalculation service is unavailable (Operation DB API not configured).');
    return;
  }
  var _scopeMode = (scopeSpec && scopeSpec.mode) ? String(scopeSpec.mode) : 'ALL_SITES';
  var _scopeText = _scopeMode === 'CURRENT_SCOPE' ? 'the SELECTED site' : (_scopeMode === 'CURRENT_COUNTRY' ? 'the SELECTED country' : 'ALL sites');
  if (typeof window.confirm === 'function' && !window.confirm('Start a recalculation of the materialized replenishment gap for ' + _scopeText + '?\n\nThis runs as a backend job that keeps going even if you close or refresh this page. The latest result per site/SKU is overwritten.')) return;
  var btn = _irRecalcBtn_();
  var label = (btn && btn.dataset && btn.dataset.idleLabel) ? btn.dataset.idleLabel : (btn ? btn.textContent : '');
  if (btn && btn.dataset) btn.dataset.idleLabel = label || 'Recalculate All Sites';
  _irRecalcAllBusy = true; _irActiveRunId = null; _irCancelRequested = false;
  function setBtn(txt, disabled) { if (btn) { btn.disabled = !!disabled; btn.textContent = txt; } }
  // §8 the ONE deterministic reset — always hides Cancel and returns the button to idle (used by every terminal path).
  function restore() { _irRecalcAllBusy = false; _irActiveRunId = null; _irShowCancel_(false); setBtn(label || 'Recalculate All Sites', false); }
  var gr = (window.KM && window.KM.gapRecalc) ? window.KM.gapRecalc : null;
  var startFn = function () { return window.KM.DB.startInventoryReplenishmentGapJob(scopeSpec ? { payload: { scope: scopeSpec } } : {}); };   // the WRITE POST — exactly ONCE (optional bounded scope §13)
  var statusFn = function () { return window.KM.DB.getGapJobStatus('INVENTORY'); };            // READ-ONLY poll
  var refreshFn = function () { if (typeof refreshInventoryGapAfterRecalc_ === 'function') return refreshInventoryGapAfterRecalc_(); };
  if (!gr || typeof gr.runJob !== 'function') {                                                // module absent → start + single refresh
    setBtn('Starting…', true);
    return Promise.resolve(startFn()).then(function () { refreshFn(); restore(); }).catch(function () { restore(); });
  }
  return gr.runJob(startFn, statusFn, {
    product: 'INVENTORY',   // LIVE7 §3 — names the product in the [GapJob] START_ERROR DevTools diagnostic
    refresh: refreshFn,
    onRunId: function (rid) { _irActiveRunId = rid; },
    isCancelled: function () { return _irCancelRequested; },
    ui: {
      starting: function () { setBtn('Starting…', true); },
      progress: function (st) { if (!(st && st.status)) return; var n = (st && st.scopesProcessed != null) ? st.scopesProcessed : 0, m = (st && st.scopesTotal != null) ? st.scopesTotal : 0; setBtn((st && st.recovering ? 'Recovering… ' : 'Calculating… ') + n + ' / ' + m, true); _irShowCancel_(true); },   // LIVE10 §11 guard non-status polls; §7 show Recovering while the backend self-heals
      refreshing: function () { _irShowCancel_(false); setBtn('Refreshing…', true); },
      // F1-SMALL-GAP-JOB-DONE-NOTICE-R1: this MANUAL runJob done() fires only on terminal DONE, AFTER refresh() — so the
      // notice is truthful and never precedes fresh data. Keyed to _irActiveRunId (one notice per manual run). The
      // resume-on-mount done() below deliberately does NOT announce, so scheduled/resumed jobs stay silent.
      done: function (finalState) { _irShowCancel_(false); setBtn('Completed', true); try { if (gr && typeof gr.announceManualDone === 'function') gr.announceManualDone(_irActiveRunId, gr.formatDoneMessage('Inventory', scopeSpec, finalState)); } catch (e) {} if (typeof setTimeout === 'function') setTimeout(restore, 1500); else restore(); },
      cancelled: function () { _irShowCancel_(false); setBtn('Cancelled — results preserved', true); try { console.info('[GapJob] Calculation cancelled. Latest completed results are preserved.'); } catch (e) {} if (typeof setTimeout === 'function') setTimeout(restore, 1500); else restore(); },
      failed: function (st) { alert(_irGapJobFailMsg_('Inventory', st)); restore(); }
    }
  });
}
window.handleRecalcAllInventoryGap = handleRecalcAllInventoryGap;
// LIVE10 §14 — STABLE AI-Assist callable contracts (no toolbar redesign in this round). A later UI round places these
// under an "AI Assist" menu alongside the existing Generate AI Plan (handleReplenAiPlan). They REUSE the one recalc
// handler above (no duplicated lifecycle) and default to the current on-screen scope; a caller may pass an explicit
// { company, country, marketplace }. If the page cannot resolve a current scope they fall back to ALL_SITES.
function _irCurrentScopeSpec_(mode) {
  var sc = (typeof _irScope !== 'undefined' && _irScope) ? _irScope : ((typeof _irMatState !== 'undefined' && _irMatState && _irMatState.scope) ? _irMatState.scope : null);
  if (!sc || !sc.company) return { mode: 'ALL_SITES' };
  return { mode: mode, company: sc.company, country: sc.country, marketplace: sc.marketplace };
}
function recalcInventoryGapAllSites() { return handleRecalcAllInventoryGap({ mode: 'ALL_SITES' }); }
function recalcInventoryGapCurrentCountry() { return handleRecalcAllInventoryGap(_irCurrentScopeSpec_('CURRENT_COUNTRY')); }
function recalcInventoryGapCurrentScope() { return handleRecalcAllInventoryGap(_irCurrentScopeSpec_('CURRENT_SCOPE')); }
window.recalcInventoryGapAllSites = recalcInventoryGapAllSites;
window.recalcInventoryGapCurrentCountry = recalcInventoryGapCurrentCountry;
window.recalcInventoryGapCurrentScope = recalcInventoryGapCurrentScope;

// LIVE4 §6 — manual Cancel: ONE backend cancel write for the active runId, stop this poller cooperatively; the shared
// runJob poller then refreshes the materialized READ and resets the button (never a browser-only cancel, no reload).
function handleCancelInventoryGapJob() {
  if (!_irRecalcAllBusy || _irCancelRequested) return;
  var c = _irCancelBtn_(); if (c) c.disabled = true;
  _irCancelRequested = true;   // the poller returns CANCELLED on its next tick → runJob refreshes + resets
  try { console.info('[GapJob] CANCEL_REQUEST INVENTORY run=' + _irActiveRunId); } catch (e) {}
  if (window.KM && window.KM.DB && typeof window.KM.DB.cancelInventoryReplenishmentGapJob === 'function') {
    try { window.KM.DB.cancelInventoryReplenishmentGapJob(_irActiveRunId); } catch (e) {}   // exactly ONE cancel write
  }
}
window.handleCancelInventoryGapJob = handleCancelInventoryGapJob;

// §5/§12 — truthful terminal message. STALLED / POLL_TIMEOUT = "could not be confirmed" (recoverable, NO auto retry);
// any other non-DONE state = a genuine failure. Either way the button returns to a retryable idle state.
function _irGapJobFailMsg_(product, st) {
  var gr = (window.KM && window.KM.gapRecalc), status = (st && st.status) || 'unknown';
  if (gr && typeof gr.isUnconfirmedJob === 'function' && gr.isUnconfirmedJob(status)) {
    return product + ' calculation status could not be confirmed. Check the latest data before retrying (no automatic retry was issued).';
  }
  var why = (st && st.lastError) ? (' — ' + st.lastError) : '';
  return product + ' recalculation failed (status: ' + status + ')' + why + '.\nNo automatic retry was issued; check the latest data.';
}
window._irGapJobFailMsg_ = _irGapJobFailMsg_;

// §13 mount/reload recovery — if a backend Inventory job is already PENDING/RUNNING (e.g. started in another tab, or
// this tab was refreshed), resume READ-ONLY status polling and refresh on DONE. The original tab need not be alive.
function _irResumeGapJobOnMount_() {
  var gr = (window.KM && window.KM.gapRecalc), db = (window.KM && window.KM.DB);
  if (!gr || typeof gr.resumeIfRunning !== 'function' || !db || typeof db.getGapJobStatus !== 'function') return;
  var btn = _irRecalcBtn_();
  var label = (btn && btn.dataset && btn.dataset.idleLabel) ? btn.dataset.idleLabel : (btn ? btn.textContent : 'Recalculate All Sites');
  if (btn && btn.dataset) btn.dataset.idleLabel = label;
  function setBtn(txt, disabled) { if (btn) { btn.disabled = !!disabled; btn.textContent = txt; } }
  function resReset() { _irRecalcAllBusy = false; _irActiveRunId = null; _irShowCancel_(false); setBtn(label, false); }
  _irCancelRequested = false;
  return gr.resumeIfRunning(function () { return db.getGapJobStatus('INVENTORY'); }, {
    refresh: function () { if (typeof refreshInventoryGapAfterRecalc_ === 'function') return refreshInventoryGapAfterRecalc_(); },
    isCancelled: function () { return _irCancelRequested; },
    ui: {
      resume: function (st) { _irRecalcAllBusy = true; if (st && st.runId) _irActiveRunId = st.runId; },   // a resumed job is cancellable too
      progress: function (st) { if (!(st && st.status)) return; if (st && st.runId) _irActiveRunId = st.runId; var n = (st && st.scopesProcessed != null) ? st.scopesProcessed : 0, m = (st && st.scopesTotal != null) ? st.scopesTotal : 0; setBtn((st && st.recovering ? 'Recovering… ' : 'Calculating… ') + n + ' / ' + m, true); _irShowCancel_(true); },
      refreshing: function () { _irShowCancel_(false); setBtn('Refreshing…', true); },
      done: function () { _irShowCancel_(false); setBtn('Completed', true); if (typeof setTimeout === 'function') setTimeout(resReset, 1500); else resReset(); },
      cancelled: function () { _irShowCancel_(false); setBtn('Cancelled — results preserved', true); if (typeof setTimeout === 'function') setTimeout(resReset, 1500); else resReset(); },
      // §5 a resumed job that ends non-DONE (stalled/failed) must NOT leave the button stuck at Calculating.
      failed: function (st) { resReset(); if (st && st.status && st.status !== 'DONE') { try { console.warn(_irGapJobFailMsg_('Inventory', st)); } catch (e) {} } }
    }
  });
}
window._irResumeGapJobOnMount_ = _irResumeGapJobOnMount_;

// F1-4B-FM5-R4UI-R4 §6/§7 — SHARED manual-recalc transport-recovery contract (Inventory + Order Planning use it
// identically, §11.P). A transport error = the browser never received an acknowledged batch envelope. On it we
// refetch the READ ONLY (never the WRITE), then decide from the stored calculated_at: if the newest stored row is
// newer than the pre-recalc snapshot, the batch completed despite the lost response → report completion from the
// refreshed data; otherwise report that completion could not be confirmed (never a fabricated success).
// F1-4B-FM5-R4T — transport-error + recovery now delegate to the ONE shared, bounded-poll, READ-ONLY contract
// (window.KM.gapRecalc, assets/js/utils/gap-recalc-transport.js), used identically by Inventory + Order Planning.
function _irIsTransportError_(e) {
  return (window.KM && window.KM.gapRecalc) ? window.KM.gapRecalc.isTransportError(e)
    : (function () { var c = e && e.code ? String(e.code) : ''; return c === 'HTTP_TRANSPORT_ERROR' || c === 'NON_JSON_RESPONSE'; })();
}
// Newest calculated_at among the currently-loaded materialized rows (server 'YYYY-MM-DD HH:MM:SS' → lexical compare).
function _irMaxCalculatedAt_() {
  var rows = (_irMatState && _irMatState.rows) || []; var mx = '';
  for (var i = 0; i < rows.length; i++) { var c = rows[i] && rows[i].calculated_at ? String(rows[i].calculated_at) : ''; if (c > mx) mx = c; }
  return mx;
}
// Thin delegator to the shared recovery contract: bounded READ-ONLY verification (2s/5s/10s/20s), NEVER a write
// retry. refetchFn re-READs the materialized gap; maxFn re-reads the newest stored calculated_at.
function _irRecalcTransportRecovery_(product, preMax, refetchFn, maxFn, restore) {
  var done = function () { if (typeof restore === 'function') restore(); };
  if (window.KM && window.KM.gapRecalc) {
    return window.KM.gapRecalc.recover(product, preMax, refetchFn, maxFn, { done: done });
  }
  // Fallback (module absent): single READ-ONLY refetch + confirm from calculated_at (no write retry).
  return Promise.resolve(typeof refetchFn === 'function' ? refetchFn() : null).then(function () {
    var postMax = (typeof maxFn === 'function') ? maxFn() : '';
    alert(postMax && (!preMax || postMax > preMax)
      ? (product + ' recalculation completed. The connection was interrupted while receiving the response — results refreshed.')
      : (product + ': unable to confirm completion. Check the latest data before retrying (no automatic retry was issued).'));
    done();
  }).catch(done);
}
window._irRecalcTransportRecovery_ = _irRecalcTransportRecovery_;
window._irIsTransportError_ = _irIsTransportError_;

// AI Plan (Inventory Replenishment) — refreshes replenishment suggestions using the EXISTING Suggested Qty /
// View Recommendation calculation (renderReplenishment recomputes + re-renders with the CURRENT filter /
// planning scope; the same entry used on load + Search). It does NOT reset the Category tab, NEVER runs
// Submit Plan, and NEVER creates a Shipping Plan. No new AI model / API / recommendation schema. Loading
// state guards double-click and shows success/error styling.
// F1-4B-FM6 — AI Plan is now DETERMINISTIC Phase-1 recommendation generation (NOT an LLM): it reads the latest
// MATERIALIZED inventory_replenishment_gap rows already loaded for the scope (_irMatState.rows) and runs the
// canonical KMREC generator (earliest non-zero shortage window D18→D90). It recalculates NO gap, writes NOTHING,
// and never overwrites the gap table — it only produces a Recommended Action decision per SKU held in page state.
var _irRecoByKey = {};   // sku → KMREC inventory recommendation DTO (Phase-1 page state; regenerated by AI Plan)
function _irRecoNow_() { try { return (new Date()).toISOString(); } catch (e) { return null; } }   // display stamp only (DTO identity excludes it)
function _irRecoFmtQty(n) { try { return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString() : '—'; } catch (e) { return String(n); } }
// The Recommended Action block appended UNDER the fixed 4-row summary table (never replaces it). Empty until AI
// Plan runs; hidden/stale-guarded when the stored gap is newer than the recommendation (never shown against a
// newer gap). READY → qty + based-on window + reason; NO_ACTION / BLOCKED → truthful state.
function _irRecoActionHtml(skuData) {
    if (!skuData || typeof window === 'undefined' || !window.KMREC) return '';
    var dto = _irRecoByKey[String(skuData.sku)];
    if (!dto) return '';
    var row = (_irMatState && _irMatState.bySku) ? _irMatState.bySku[String(skuData.sku)] : null;
    if (row && window.KMREC.isStale(dto, row)) return '<div class="replen-reco-action replen-reco-action--stale">⚠ Recommendation outdated — run AI Plan to refresh.</div>';
    if (dto.status === 'BLOCKED') return '<div class="replen-reco-action replen-reco-action--blocked"><div class="replen-reco-action__title">Recommended Action</div><div class="replen-reco-action__reason">Recommendation unavailable.</div></div>';
    if (dto.status === 'NO_ACTION') return '<div class="replen-reco-action replen-reco-action--none"><div class="replen-reco-action__title">Recommended Action</div><div class="replen-reco-action__reason">No action required.</div></div>';
    return '<div class="replen-reco-action replen-reco-action--ready">'
        + '<div class="replen-reco-action__title">Recommended Action</div>'
        + '<div class="replen-reco-action__row"><span class="replen-reco-action__label">Recommended Qty</span><strong class="replen-reco-action__qty">' + _irRecoFmtQty(dto.suggestedQty) + '</strong></div>'
        + '<div class="replen-reco-action__row"><span class="replen-reco-action__label">Based On</span><span class="replen-reco-action__win">' + escapeReplenHtml(dto.primaryWindow) + '</span></div>'
        + '<div class="replen-reco-action__reason">' + escapeReplenHtml(dto.reason) + '</div>'
        + '</div>';
}
function handleReplenAiPlan(scope) {
    var btn = document.getElementById('replen-ai-plan-btn');
    if (btn && btn.disabled) return;
    // F1-AI-SUPPORT-SCOPE-R1: capture the user-chosen { company, country, marketplace, marketplaceId } DTO when the
    // scope modal supplied one. HONEST BOUNDARY: the canonical page-level AI Plan generator (window.KMREC) is not
    // yet FM6-R4 scope-parameterized — it deterministically derives from the MATERIALIZED gap rows already loaded
    // for the on-screen scope. The DTO is threaded + retained (window._irAiPlanScope) so FM6-R4 can later route it
    // to the canonical persister → DB draft → Execution Plan; this round does NOT invent a scope-filtered engine.
    if (scope && typeof scope === 'object') { window._irAiPlanScope = scope; }
    if (btn) { btn.disabled = true; btn.classList.remove('is-success', 'is-error'); btn.classList.add('is-loading'); }
    try {
        // Deterministic generation from the MATERIALIZED gap rows already loaded for the scope (no gap recalc, no API).
        if (window.KMREC && _irMatState && Array.isArray(_irMatState.rows)) {
            var now = _irRecoNow_();
            _irRecoByKey = {};
            _irMatState.rows.forEach(function (r) { var dto = window.KMREC.generateInventoryRecommendation(r, { now: now }); if (dto) _irRecoByKey[String(r.sku)] = dto; });
        }
        renderReplenishment();   // re-render surfaces the Recommended Action block (does NOT run Submit Plan)
        if (btn) { btn.classList.remove('is-loading'); btn.classList.add('is-success'); setTimeout(function () { if (btn) btn.classList.remove('is-success'); }, 1200); }
    } catch (err) {
        if (btn) { btn.classList.remove('is-loading'); btn.classList.add('is-error'); setTimeout(function () { if (btn) btn.classList.remove('is-error'); }, 1600); }
        console.error('[AI Plan] recommendation generation failed:', err);
    } finally {
        if (btn) btn.disabled = false;
    }
}
window.handleReplenAiPlan = handleReplenAiPlan;

// ========================================
// Cloud mapping (Demo OFF): Inventory Table Phase 1 mapping via IRMap
// ========================================
function _getCloudReplenishmentData() {
    var DB = (window.KM && window.KM.DB) ? window.KM.DB : null;
    var IR = window.IRMap;
    // IDENTITY: the Marketplace dropdown value is the marketplace_id (no Company select). Company +
    // country + marketplace are DERIVED from the marketplaces master for that marketplace_id below.
    var marketplaceId = document.getElementById('replenMarketplace') ? document.getElementById('replenMarketplace').value : '';
    var country = document.getElementById('replenCountry') ? document.getElementById('replenCountry').value : '';
    var ltsFilter = document.getElementById('replenLTSFilter') ? document.getElementById('replenLTSFilter').value : '';
    if (!marketplaceId || !DB || !DB.getMarketplaceSkus || !IR) return [];

    function eqv(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
    function get(name) { return (DB[name]) ? (DB[name]() || []) : []; }

    // Source tables — all safe [] when not yet exposed to the frontend.
    var marketplacesReg = get('getMarketplaces');
    // Resolve the selected marketplace_id to its marketplaces master record; company + country +
    // marketplace all come from THIS record (the SSOT). No Company select, no first-row fallback.
    var scopeMkt = marketplacesReg.find(function (m) { return String(m.marketplaceId) === String(marketplaceId); });
    if (!scopeMkt) return [];
    var company = scopeMkt.company;
    var marketplace = scopeMkt.marketplace;
    var mktCountry = scopeMkt.country;

    var mpSkus = get('getMarketplaceSkus');
    // STRICT SCOPE: identity-first on marketplace_id (which already encodes company+country+marketplace,
    // so KM/US/Amazon and ResUS/US/Amazon never merge — the company bleed is impossible). Legacy rows
    // without a marketplace_id fall back to the master's derived company+country+marketplace.
    var filtered = mpSkus.filter(function (mp) {
        if (mp.marketplaceId) return String(mp.marketplaceId) === String(marketplaceId);
        return eqv(mp.company, company) && eqv(mp.country, mktCountry) && eqv(mp.marketplace, marketplace);
    });
    if (filtered.length === 0) return [];

    var invSnaps = get('getAmazonInventorySnapshot');
    var healthSnaps = get('getAmazonInventoryHealthSnapshot');
    var dailyRows = get('getAmazonDailySalesSnapshot');
    var weeklyRows = get('getAmazonWeeklySalesSnapshot');
    var fcRows = get('getFcRegularForecast');
    var targetRules = get('getFcTargetRules');
    var events = get('getFcSpecialEvents');
    var overseas = get('getOverseasInventorySnapshot');
    var warehouses = get('getWarehouses');
    var factory = get('getFactoryStock');
    var skuDetails = get('getSkuDetails');

    // F1-SHIPMENT-INCOMING-R5 — Shipping Shipment card now derives from REAL shipment authority (NOT the
    // mock/dead within* block, NOT wh_on_the_way_*). Build the receiver→remaining-incoming-by-ETA map ONCE
    // for this marketplace scope. REMAINING = MAX(0, shipment_qty − shipment_received_qty); terminal
    // shipments + fully-received lines contribute 0; MULTI/merged shipments are excluded from per-marketplace
    // attribution (MERGED_SHIPMENT_FROZEN_SHARE_AUTHORITY_GAP — see completion report).
    var shipments = get('getShipments');
    var shipmentLines = get('getShipmentLines');
    // R6 — FROZEN receiver lineage map: shipping_plan_line_id → {company,country,marketplace} resolved via
    // shipping_plan_lines → shipping_plans. Lets a merged (MULTI) shipment's lines attribute to their real
    // receivers deterministically (dispatch-time lineage; NOT live FC Share, NOT destination text).
    var planLinesReg = get('getShippingPlanLines');
    var plansReg = get('getShippingPlans');
    var _planById = {}; plansReg.forEach(function (p) { if (p && p.shippingPlanId) _planById[p.shippingPlanId] = p; });
    var lineReceiverById = {};
    planLinesReg.forEach(function (pl) {
        if (!pl || !pl.shippingPlanLineId) return;
        var p = _planById[pl.shippingPlanId] || {};
        lineReceiverById[pl.shippingPlanLineId] = { company: p.company || '', country: p.country || '', marketplace: p.marketplace || '' };
    });
    var _irNow = new Date();
    var _irTodayMs = Date.UTC(_irNow.getFullYear(), _irNow.getMonth(), _irNow.getDate());
    var shipRemainByReceiver = _irBuildShipmentRemainingByReceiver(shipments, shipmentLines, _irTodayMs, lineReceiverById);

    var monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
    var MK = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    var cm = new Date().getMonth();

    var rows = filtered.map(function (mp) {
        var det = skuDetails.find(function (d) { return eqv(d.sku, mp.sku); }) || {};
        // The marketplaces master (scopeMkt) is authoritative for this marketplace_id. If a
        // marketplace_skus row carries a denormalized company/country/marketplace that DISAGREES with
        // the master, prefer the master and warn (mapping-integrity note) — never silently take the row.
        var scopeMktReg = scopeMkt;
        if (mp.marketplaceId && (
                (mp.company && !eqv(mp.company, scopeMkt.company)) ||
                (mp.country && !eqv(mp.country, scopeMkt.country)) ||
                (mp.marketplace && !eqv(mp.marketplace, scopeMkt.marketplace)))) {
            console.warn('[Replenishment] marketplace_skus scope disagrees with marketplaces master for marketplace_id ' +
                marketplaceId + ' (sku ' + mp.sku + '); using master.',
                { row: { company: mp.company, country: mp.country, marketplace: mp.marketplace },
                  master: { company: scopeMkt.company, country: scopeMkt.country, marketplace: scopeMkt.marketplace } });
        }
        var scope = {
            company: scopeMkt.company, country: scopeMkt.country, marketplace: scopeMkt.marketplace, sku: mp.sku,
            marketplaceId: marketplaceId,
            series: det.series || '', category: det.category || det.productLine || ''
        };
        // R5 — real Shipping Shipment buckets for THIS receiver (canonical company/country/marketplace/sku).
        var shipRem = shipRemainByReceiver[_irReceiverKey(scopeMkt.company, scopeMkt.country, scopeMkt.marketplace, mp.sku)]
            || { overdue: 0, d0_18: 0, d19_30: 0, d31_45: 0, d45_plus: 0 };

        var inv = IR.latestSnapshot(invSnaps, scope);
        var health = IR.latestSnapshot(healthSnaps, scope);
        var stock = IR.stockCard(inv);
        var lts = IR.longTermStorage(health);
        var trend = IR.salesTrend7d(dailyRows, scope);
        var avg = IR.avgSalesPerDay(weeklyRows, scope);
        var fc60 = IR.forecast60d(fcRows, targetRules, scope, events);   // R7 §F: 3-month Base FC + scoped Special Events (once)
        var eventQty = IR.upcomingEventQty(events, scope);
        // 3rd Party Stock = Site Planning Available (18-day virtual planning allocation of the shared
        // 3PL pool; §20/§23/§24). Display-only — no movement, no reserve, no snapshot write.
        var thirdPartyPlan = IR.sitePlanningAllocation({
          scope: scope, overseasRows: overseas, warehouses: warehouses, mpSkus: mpSkus,
          marketplacesReg: marketplacesReg, weeklyRows: weeklyRows, fcRows: fcRows, targetRules: targetRules
        });
        // Recommendation Summary snapshot: hydrate the read-only system recommendation from the persisted
        // shipping_allocation_draft (the SSOT, §11.4) when one exists for this scope + SKU; otherwise the
        // Recommendation Summary renders its honest "not generated" empty state (engine is inactive).
        var recDraftLines = _shippingDraftLinesFor(scope, get('getShippingAllocationDrafts'), get('getShippingAllocationDraftLines'));
        // 3rd Party Stock card = PHYSICAL 3PL availability (Round 4 Decision A). Summary total and the
        // expanded detail use the SAME shared breakdown rows (IRWarehouse.buildPhysicalThirdPartyBreakdown);
        // it is NEVER sitePlanningAvailable (the 18-day virtual planning allocation stays in the planning
        // path only). Empty → state label (No 3PL / No Data), never a fallback to the virtual value.
        var _tpBreakdown = (window.IRWarehouse && window.IRWarehouse.buildPhysicalThirdPartyBreakdown)
          ? window.IRWarehouse.buildPhysicalThirdPartyBreakdown(thirdPartyPlan)
          : { total: 0, hasRows: false, rows: (thirdPartyPlan.contributions || []) };
        var thirdPartyDisplay = (thirdPartyPlan.state === 'NO_ELIGIBLE_3PL') ? 'No 3PL'
          : (thirdPartyPlan.state === 'MISSING_SNAPSHOT') ? 'No Data'
          : (thirdPartyPlan.state === 'OK' || _tpBreakdown.hasRows) ? String(Math.round(_tpBreakdown.total).toLocaleString())
          : '—';
        var cnStock = IR.factoryByCountry(factory, warehouses, mp.sku, 'CN');
        var twStock = IR.factoryByCountry(factory, warehouses, mp.sku, 'TW');
        var need = IR.needBuckets();

        var currentStock = stock.available + stock.fcTransfer + stock.fcProcessing;
        var dos = IR.daysOfSupply(currentStock, avg);
        // F1-4B-FM5-R4J-LIVE9 — align the Sales-Driven Avg Sales/day + Days of Supply to the CANONICAL horizon
        // sales-rate (horizonBasis.avgSalesPerDay = the SAME KMCALC normalized rate D18/D30/D45/D90 uses), closing
        // SALES_DOS_HORIZON_AUTHORITY_DIVERGENCE. The value is CARRIED from the workspace read (never recomputed on
        // the page — reuses IR.daysOfSupply, adds NO calculator). Forecast-Driven and the weekly Sales Trend chart
        // are untouched. A Sales-Driven SKU whose canonical rate is unavailable shows '--' (never a silent weekly
        // fallback); rate 0 → IR.daysOfSupply returns null → '--' (safe no-demand). When no canonical basis is
        // resolved (e.g. workspace read off), the existing weekly display is preserved (no regression).
        var _avgDisplay = avg.toFixed(1);
        var _dosDisplay = (dos === null ? '--' : String(dos));
        var _canonBasis = (typeof _irCanonicalSalesBasis_ === 'function') ? _irCanonicalSalesBasis_(mp.sku) : null;
        if (_canonBasis && _canonBasis.demandMode === 'sales_driven') {
          var _cr = _canonBasis.avgSalesPerDay;
          if (_cr == null) { _avgDisplay = '--'; _dosDisplay = '--'; }
          else {
            _avgDisplay = (Math.round(_cr * 10) / 10).toFixed(1);
            var _cdos = IR.daysOfSupply(currentStock, _cr);
            _dosDisplay = (_cdos === null ? '--' : String(_cdos));
          }
        }

        // Forecast breakdown (next 3 months, Target Rule applied)
        var fcRow = fcRows.find(function (r) {
            return eqv(r.sku, mp.sku) && (!r.company || eqv(r.company, mp.company)) &&
                (!r.country || eqv(r.country, mp.country)) && (!r.marketplace || eqv(r.marketplace, mp.marketplace));
        });
        var pct = IR.targetPct(targetRules, scope) / 100;
        function fcMonth(off) { return fcRow ? Math.round((parseFloat(fcRow[MK[(cm + off) % 12]]) || 0) * pct) : 0; }

        // Fulfillment model resolution — reuse the company-safe registry match resolved above.
        var ff = IR.resolveFulfillment(scopeMktReg, mp);

        // Upcoming event display: dynamic, date-eligible (today .. first day of month(today+4mo)),
        // scope-matched, active. Shows the nearest event (name + start/end + fc_qty), then "+N more"
        // in an expandable list. Multiple events are NOT merged — each record stays separate.
        var evRows = IR.upcomingEvents(events, scope);
        var upcomingEventsText = _irRenderUpcoming(evRows);

        return {
            sku: mp.sku,
            siteSku: mp.siteSku || '',   // F1-4B-B canonical row identity (with sku + destination) for API line matching
            lifecycle: det.lifecycle || '--',
            replenishmentModel: mp.replenishmentModel || 'sales_driven',
            company: scope.company || '--',       // derived from the marketplaces master (marketplace_id)
            country: scope.country,
            marketplace: scope.marketplace,
            marketplaceId: scope.marketplaceId,
            series: scope.series || '',
            category: scope.category || '',        // Category tab filter (sku_details.category)
            // First Layer Summary
            currentInventory: currentStock,
            onTheWay: 0,                       // Shipping Shipment — pending mapping (spec §9)
            _recDraftLines: recDraftLines,               // persisted Recommendation Summary snapshot (raw draft lines) or []
            thirdPartyStock: thirdPartyDisplay,          // Site Planning Available (or state label)
            thirdPartyPlan: thirdPartyPlan,              // full allocation detail (tooltip/expand)
            thirdPartyDetailHtml: _irRenderThirdPartyDetail(thirdPartyPlan),
            thirdPartyTitle: _irThirdPartyTitle(thirdPartyPlan),
            avgDailySales: _avgDisplay,        // LIVE9: canonical horizon rate for Sales-Driven; weekly otherwise (1 decimal)
            forecast60d: fc60,
            upcomingEventQty: eventQty > 0 ? eventQty : null,
            daysOfSupply: _dosDisplay,
            needsAlert: false,                 // color now driven by IRMap.dosColorClass
            suggestedQty: need.suggestedQty,
            cnStock: cnStock,
            twStock: twStock,
            unitsPerCarton: det.unitsPerCarton || 0,   // from sku_details — drives carton validation
            // AI Suggestion buckets (Phase 1 structure — engine not implemented)
            need0_18: need.need0_18, need19_30: need.need19_30, need31_45: need.need31_45, need46_90: need.need46_90,
            plannedQty: (typeof replenishmentPlans !== 'undefined' && replenishmentPlans[mp.sku]) || 0,
            note: (DB.getAmazonInventorySnapshot && get('getAmazonInventorySnapshot').length === 0) ? 'Cloud read — Amazon snapshot data pending' : '',
            status: need.suggestedQty > 0 ? 'Need Restock' : 'Sufficient',
            productName: mp.siteSku || mp.sku,
            // Stock Card detail (expand)
            available: stock.available,
            fcTransfer: stock.fcTransfer,
            fcProcessing: stock.fcProcessing,
            customerOrders: stock.customerOrders,
            unsellable: stock.unsellable,
            // Long Term Storage
            over90: lts.over90,
            over180: lts.over180,
            // Shipping Shipment — REAL shipment-derived remaining incoming, mutually-exclusive ETA buckets (R5).
            within18days: shipRem.d0_18, within30days: shipRem.d19_30, within45days: shipRem.d31_45,
            within45plus: shipRem.d45_plus, shipOverdue: shipRem.overdue,
            // 3rd Party detail (only aggregate available in Phase 1)
            winitStock: 0, onusStock: 0,
            // Forecast breakdown (next 3 months)
            nextMonth: monthNames[(cm + 1) % 12], next2Month: monthNames[(cm + 2) % 12], next3Month: monthNames[(cm + 3) % 12],
            fcNextMonth: fcMonth(1), fcNext2Month: fcMonth(2), fcNext3Month: fcMonth(3),
            upcomingEventsText: upcomingEventsText,
            // Sales trend (past 7 completed days)
            salesTrend7d: trend,
            lastWeek: Math.round(avg * 7),
            // Fulfillment model foundation
            fulfillmentModel: ff.model, fulfillmentLocked: ff.locked,
            _source: 'cloud-mapping'
        };
    });

    // LTS filter (Over 90+ / Over 180+)
    if (ltsFilter === 'over90') rows = rows.filter(function (r) { return r.over90 > 0; });
    else if (ltsFilter === 'over180') rows = rows.filter(function (r) { return r.over180 > 0; });
    return rows;
}

// ========================================
// Demo Data Layer: Phase 2A - Inventory Mapping
// ========================================
function _getDemoReplenishmentData() {
    var country = document.getElementById('replenCountry')?.value || '';
    var marketplace = document.getElementById('replenMarketplace')?.value || '';
    var rows = window.KM.DemoData.getInventoryRows({});
    return rows.filter(function(r) {
        // Filter by selected country + marketplace
        if (country && r.country && r.country !== country) return false;
        if (marketplace && r.marketplace && r.marketplace !== marketplace) return false;
        return true;
    }).map(function(r) {
        var avgDaily = r.sales_30d > 0 ? (r.sales_30d / 30) : 0;
        var currentInv = r.fba_stock + r.third_wh_david + r.third_wh_winit;
        var onTheWay = r.overseas_on_way_18d + r.overseas_on_way_45d;
        var thirdParty = r.third_wh_david + r.third_wh_winit;
        var daysOfSupply = avgDaily > 0 ? (currentInv / avgDaily).toFixed(1) : '999';
        var forecast60d = Math.round(avgDaily * 60);
        var suggestedQty = Math.max(0, Math.round(avgDaily * 90 - currentInv - onTheWay));
        var needsAlert = parseFloat(daysOfSupply) < 18;
        return {
            sku: r.sku,
            lifecycle: r.warning_status === 'upcoming' ? 'New' : 'Mature',
            replenishmentModel: r.replenishment_model || 'sales_driven',
            company: 'Kitchen Mama',
            country: r.country || 'US',
            marketplace: r.marketplace,
            series: r.series || '',
            category: r.category || '',   // Category tab filter (sku_details.category)
            currentInventory: currentInv,
            onTheWay: onTheWay,
            thirdPartyStock: thirdParty,
            avgDailySales: avgDaily.toFixed(2),
            forecast60d: forecast60d,
            upcomingEventQty: null,
            daysOfSupply: daysOfSupply,
            needsAlert: needsAlert,
            suggestedQty: suggestedQty,
            cnStock: r.factory_youxin,
            twStock: r.factory_shengyi,
            unitsPerCarton: r.units_per_carton || 0,   // drives carton validation
            need18: 0,
            need30: 0,
            need45Plus: suggestedQty,
            // New AI Suggestion bucket structure (Phase 1: engine not implemented → 0)
            need0_18: 0, need19_30: 0, need31_45: 0, need46_90: 0,
            plannedQty: 0,
            note: r.recommendation || '',
            status: suggestedQty > 0 ? 'Need Restock' : 'Sufficient',
            productName: r.product_name,
            available: r.fba_stock,
            fcTransfer: 0,
            fcProcessing: 0,
            customerOrders: 0,
            unsellable: 0,
            over90: 0,
            over180: 0,
            winitStock: r.third_wh_winit,
            onusStock: r.third_wh_david,
            within18days: r.overseas_on_way_18d,
            within30days: 0,
            within45days: r.overseas_on_way_45d,
            lastWeek: Math.round(avgDaily * 7),
            salesTrend7d: [],
            fulfillmentModel: '', fulfillmentLocked: false
        };
    });
}

function _showDemoBadge() {
    var panel = document.querySelector('#ops-section .replen-control-panel');
    if (!panel) return;
    if (panel.querySelector('.demo-badge')) return;
    var badge = document.createElement('span');
    badge.className = 'demo-badge';
    badge.style.cssText = 'background:#8b5cf6;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:12px;vertical-align:middle;';
    badge.textContent = 'Demo Data Mode';
    panel.appendChild(badge);
}

function _removeDemoBadge() {
    var badge = document.querySelector('#ops-section .demo-badge');
    if (badge) badge.remove();
}

// Patch renderReplenishment to show/hide badge
var _originalRenderReplenishment = renderReplenishment;
renderReplenishment = function() {
    _originalRenderReplenishment();
    if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        _showDemoBadge();
    } else {
        _removeDemoBadge();
    }
};
window.renderReplenishment = renderReplenishment;

// Debug helper
// ========================================
// Edit SKU / Delete SKU
// ========================================

var _editSkuTarget = null;

function openEditSkuModal() {
    // Find selected SKU from current table (use first expanded or prompt user)
    var fixedRows = document.querySelectorAll('#ops-section .dual-layer-table:not(.ir-overview-table) .fixed-row');
    var selectedSku = null;
    fixedRows.forEach(function(row) {
        if (row.classList.contains('expanded')) selectedSku = row.dataset.sku;
    });
    if (!selectedSku) {
        // Prompt user to select
        var allSkus = Array.from(fixedRows).map(function(r) { return r.dataset.sku; }).filter(Boolean);
        if (allSkus.length === 0) { alert('No SKU data available. Please search first.'); return; }
        selectedSku = prompt('Enter SKU to edit (or expand a row first):\n\nAvailable: ' + allSkus.slice(0, 10).join(', ') + (allSkus.length > 10 ? '...' : ''));
        if (!selectedSku) return;
    }

    // Find the SKU in current data
    var data = getReplenishmentData();
    var item = data.find(function(d) { return d.sku === selectedSku; });
    if (!item) { alert('SKU not found in current results: ' + selectedSku); return; }

    // Also try to get marketplace_skus record for current values
    var mpSkus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
    var _selCompany = item.company || _replenSelectedCompany();
    function _eqLo(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
    var mpRecord = mpSkus.find(function(mp) {
        // Company-safe: never match a different company's row for the same SKU + country + marketplace.
        return mp.sku === selectedSku &&
            (!_selCompany || _eqLo(mp.company, _selCompany)) &&
            mp.country === (item.country || document.getElementById('replenCountry')?.value) &&
            mp.marketplace === (item.marketplace || document.getElementById('replenMarketplace')?.value);
    });

    _editSkuTarget = {
        sku: selectedSku,
        company: _selCompany || '',
        country: item.country || document.getElementById('replenCountry')?.value || '',
        marketplace: item.marketplace || document.getElementById('replenMarketplace')?.value || '',
        marketplaceSkuId: mpRecord ? mpRecord.marketplaceSkuId : '',
        replenishmentModel: mpRecord ? mpRecord.replenishmentModel : 'sales_driven',
        marketplaceSkuStatus: mpRecord ? mpRecord.marketplaceSkuStatus : 'active',
        launchDate: mpRecord ? mpRecord.launchDate : '',
        fulfillmentModel: mpRecord ? mpRecord.fulfillmentModel : ''
    };

    // Populate modal
    document.getElementById('edit-sku-code').value = selectedSku;
    document.getElementById('edit-sku-site').value = _editSkuTarget.country + ' / ' + _editSkuTarget.marketplace;
    document.getElementById('edit-sku-model').value = _editSkuTarget.replenishmentModel || 'sales_driven';
    document.getElementById('edit-sku-status').value = _editSkuTarget.marketplaceSkuStatus || 'active';
    document.getElementById('edit-sku-launch-date').value = _editSkuTarget.launchDate || '';

    // Fulfillment Model with the same lock rule, resolved from the marketplace registry.
    var _mpReg = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces ? window.KM.DB.getMarketplaces() : []).find(function(m) {
        if (mpRecord && mpRecord.marketplaceId && m.marketplaceId === mpRecord.marketplaceId) return true;
        return String(m.country || '').toLowerCase() === String(_editSkuTarget.country || '').toLowerCase()
            && String(m.marketplace || '').toLowerCase() === String(_editSkuTarget.marketplace || '').toLowerCase();
    });
    applyFulfillmentLock(
        document.getElementById('edit-sku-fulfillment'),
        document.getElementById('edit-sku-fulfillment-hint'),
        _mpReg ? _mpReg.fulfillmentModel : '',
        _editSkuTarget.fulfillmentModel
    );

    // Open modal
    var modal = document.getElementById('replen-edit-sku-modal');
    var overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.add('is-open');
        overlay.classList.add('is-open');
    }
}

function closeEditSkuModal() {
    var modal = document.getElementById('replen-edit-sku-modal');
    var overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.remove('is-open');
        overlay.classList.remove('is-open');
    }
    _editSkuTarget = null;
}

function saveEditSku() {
    if (!_editSkuTarget) { alert('No SKU selected'); return; }

    var model = document.getElementById('edit-sku-model').value;
    var status = document.getElementById('edit-sku-status').value;
    var launchDate = document.getElementById('edit-sku-launch-date').value;
    var fulfillmentModel = document.getElementById('edit-sku-fulfillment') ? document.getElementById('edit-sku-fulfillment').value : '';

    var payload = {
        marketplace_sku_id: _editSkuTarget.marketplaceSkuId,
        sku: _editSkuTarget.sku,
        country: _editSkuTarget.country,
        marketplace: _editSkuTarget.marketplace,
        replenishment_model: model,
        marketplace_sku_status: status,
        fulfillment_model: fulfillmentModel,
        launch_date: launchDate
    };

    if (window.KM && window.KM.DB && window.KM.DB.updateMarketplaceSkuModel) {
        window.KM.DB.updateMarketplaceSkuModel(payload).then(function(result) {
            if (result && result.success === false) {
                alert('Could not update SKU. ' + (result.error || 'Please check the API connection and try again.'));
                return;
            }
            alert('SKU updated successfully.');
            closeEditSkuModal();
            renderReplenishment();
        }).catch(function(err) {
            alert('Error: ' + err.message);
        });
    } else {
        alert('Cloud write not available. Edit saved locally only.');
        closeEditSkuModal();
    }
}

function handleDeleteSku() {
    alert('Delete SKU is not enabled yet.');
}

window.openEditSkuModal = openEditSkuModal;
window.closeEditSkuModal = closeEditSkuModal;
window.saveEditSku = saveEditSku;
window.handleDeleteSku = handleDeleteSku;

// ========================================
// Import SKU (CSV -> KM.DB.importMarketplaceSkusBatch)
// ========================================

// Marketplace-scoped import: user picks Country + Marketplace (display name); company/country/
// marketplace/currency/marketplace_id are resolved from the registry. CSV carries only
// sku, site_sku, replenishment_model.
var REPLEN_VALID_MODELS = ['sales_driven', 'forecast_driven'];
var _replenImportResolved = null; // { company, country, marketplace, marketplaceId, currency, displayName }

function _replenImportActiveMarketplaces() {
    var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
    return list.filter(function(m) { var s = (m.status || '').toLowerCase(); return !s || s === 'active'; });
}

function _replenImportRowValue(m) {
    return (m.marketplaceId && m.marketplaceId !== '') ? m.marketplaceId : (m.company + '|' + m.country + '|' + m.marketplace);
}

function _replenImportSetResolvedText(message, color) {
    var el = document.getElementById('replen-import-resolved');
    if (!el) return;
    el.style.color = color || '#475569';
    el.textContent = message;
}

function openReplenImportModal() {
    var modal = document.getElementById('replen-import-sku-modal');
    var overlay = document.getElementById('replen-modal-overlay');
    if (!modal || !overlay) return;

    var countrySel = document.getElementById('replen-import-country');
    if (countrySel) {
        var active = _replenImportActiveMarketplaces();
        var countries = [];
        active.forEach(function(m) { if (m.country && countries.indexOf(m.country) === -1) countries.push(m.country); });
        countries.sort();
        countrySel.innerHTML = '<option value="">Select Country</option>' +
            countries.map(function(c) { return '<option value="' + escapeReplenHtml(c) + '">' + escapeReplenHtml(c) + '</option>'; }).join('');
    }
    var mpSel = document.getElementById('replen-import-marketplace');
    if (mpSel) mpSel.innerHTML = '<option value="">Select Marketplace</option>';
    _replenImportResolved = null;
    _replenImportSetResolvedText('Select Country + Marketplace to resolve company/currency.', '#475569');

    var fileInput = document.getElementById('replen-import-file');
    if (fileInput) fileInput.value = '';
    var resultBox = document.getElementById('replen-import-result');
    if (resultBox) { resultBox.style.display = 'none'; resultBox.innerHTML = ''; }
    var runBtn = document.getElementById('replen-import-run-btn');
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
    modal.classList.add('is-open');
    overlay.classList.add('is-open');
}

function closeReplenImportModal() {
    var modal = document.getElementById('replen-import-sku-modal');
    var overlay = document.getElementById('replen-modal-overlay');
    if (modal) modal.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-open');
}

function onReplenImportCountryChange() {
    var countrySel = document.getElementById('replen-import-country');
    var mpSel = document.getElementById('replen-import-marketplace');
    var country = countrySel ? countrySel.value : '';
    if (mpSel) {
        var active = _replenImportActiveMarketplaces();
        var rowsForCountry = active.filter(function(m) { return !country || m.country === country; });
        mpSel.innerHTML = '<option value="">Select Marketplace</option>' +
            rowsForCountry.map(function(m) {
                var val = _replenImportRowValue(m);
                var label = m.marketplaceDisplayName || m.marketplace || m.marketplaceId || val;
                return '<option value="' + escapeReplenHtml(val) + '">' + escapeReplenHtml(label) + '</option>';
            }).join('');
    }
    _replenImportResolved = null;
    _replenImportSetResolvedText('Select Country + Marketplace to resolve company/currency.', '#475569');
}

// Resolve exactly one active registry row by the selected option value (marketplace_id / composite key).
function _resolveReplenImportMarketplace() {
    _replenImportResolved = null;
    var mpSel = document.getElementById('replen-import-marketplace');
    var val = mpSel ? mpSel.value : '';
    if (!val) return { ok: false, error: 'Select Country and Marketplace.' };
    var matches = _replenImportActiveMarketplaces().filter(function(m) { return _replenImportRowValue(m) === val; });
    if (matches.length === 0) return { ok: false, error: 'Selected marketplace not found in the active registry.' };
    if (matches.length > 1) return { ok: false, error: 'Selected marketplace value is ambiguous in the registry.' };
    var m = matches[0];
    _replenImportResolved = {
        company: m.company,
        country: m.country,
        marketplace: m.marketplace,
        marketplaceId: m.marketplaceId || '',
        currency: m.currency || 'USD',
        fulfillmentModel: m.fulfillmentModel || '',
        displayName: m.marketplaceDisplayName || m.marketplace || (m.marketplaceId || '')
    };
    return { ok: true };
}

function onReplenImportMarketplaceChange() {
    var res = _resolveReplenImportMarketplace();
    if (_replenImportResolved) {
        var isHybrid = _replenImportResolved.fulfillmentModel === 'hybrid';
        _replenImportSetResolvedText(
            'Resolved → Company: ' + _replenImportResolved.company +
            ' | Country: ' + _replenImportResolved.country +
            ' | Marketplace: ' + (_replenImportResolved.displayName || _replenImportResolved.marketplace) +
            ' | Marketplace ID: ' + (_replenImportResolved.marketplaceId || '(none)') +
            ' | Currency: ' + _replenImportResolved.currency +
            ' | Fulfillment: ' + (_replenImportResolved.fulfillmentModel || '(unset)') +
            (isHybrid ? '  ⚠ Hybrid — CSV must include a fulfillment_model column (platform_fulfilled / self_fulfilled).' : ''),
            '#166534'
        );
    } else {
        _replenImportSetResolvedText((res && res.error) ? res.error : 'Select Country + Marketplace to resolve company/currency.', '#b91c1c');
    }
}

// Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes, and CRLF/LF.
function parseReplenCsv(text) {
    var rows = [];
    var field = '', row = [], inQuotes = false;
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else { field += c; }
        } else {
            if (c === '"') { inQuotes = true; }
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else { field += c; }
        }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

// (csvRowsToImportObjects removed — Import SKU is now marketplace-scoped; parsing is inline in runReplenImport.)

function escapeReplenHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderReplenImportError(message) {
    var box = document.getElementById('replen-import-result');
    if (!box) { alert(message); return; }
    box.style.display = 'block';
    box.innerHTML = '<div class="replen-import__status replen-import__status--error">Error: ' + escapeReplenHtml(message) + '</div>';
}

function renderReplenImportResult(data) {
    var box = document.getElementById('replen-import-result');
    if (!box) return;
    var summary = data.summary || { total: 0, created: 0, updated: 0, skipped: 0, error: 0 };
    var results = data.results || [];

    var html = '<div class="replen-import__summary">' +
        '<span>Total: ' + summary.total + '</span>' +
        '<span class="replen-import__status--created">Created: ' + summary.created + '</span>' +
        '<span class="replen-import__status--updated">Updated: ' + summary.updated + '</span>' +
        '<span class="replen-import__status--skipped">Skipped: ' + summary.skipped + '</span>' +
        '<span class="replen-import__status--error">Error: ' + summary.error + '</span>' +
        '</div>';

    html += results.map(function(rr) {
        return '<div class="replen-import__row">' +
            '<span class="replen-import__status replen-import__status--' + escapeReplenHtml(rr.status) + '">' + escapeReplenHtml(rr.status) + '</span>' +
            '<span>#' + escapeReplenHtml(String(rr.rowIndex)) + '</span>' +
            '<span>' + escapeReplenHtml(rr.sku || '') + '</span>' +
            '<span>' + escapeReplenHtml(rr.message || '') + '</span>' +
            '</div>';
    }).join('');

    box.style.display = 'block';
    box.innerHTML = html;
}

function runReplenImport() {
    var res = _resolveReplenImportMarketplace();
    if (!_replenImportResolved) { renderReplenImportError((res && res.error) ? res.error : 'Select Country and Marketplace first.'); return; }

    var fileInput = document.getElementById('replen-import-file');
    var runBtn = document.getElementById('replen-import-run-btn');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) { alert('Please choose a CSV file first.'); return; }
    if (!(window.KM && window.KM.DB && window.KM.DB.importMarketplaceSkusBatch)) { alert('Import API is not available.'); return; }

    var meta = _replenImportResolved;
    var file = fileInput.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        var cells;
        try { cells = parseReplenCsv(e.target.result); } catch (err) { renderReplenImportError('Failed to parse CSV: ' + (err && err.message ? err.message : err)); return; }
        if (!cells || cells.length < 2) { renderReplenImportError('No data rows found (need a header row + at least one data row).'); return; }
        var headers = cells[0].map(function(h) { return String(h == null ? '' : h).trim().toLowerCase(); });
        var skuIdx = headers.indexOf('sku');
        var siteIdx = headers.indexOf('site_sku');
        var modelIdx = headers.indexOf('replenishment_model');
        var ffIdx = headers.indexOf('fulfillment_model');
        var isHybridImport = meta.fulfillmentModel === 'hybrid';
        if (skuIdx === -1 || siteIdx === -1) { renderReplenImportError('CSV must include "sku" and "site_sku" headers.'); return; }
        if (isHybridImport && ffIdx === -1) { renderReplenImportError('Hybrid marketplace requires a "fulfillment_model" column (platform_fulfilled / self_fulfilled).'); return; }

        var rows = [];
        var clientErrors = [];
        var dataRowNum = 0;
        for (var r = 1; r < cells.length; r++) {
            var raw = cells[r];
            var allEmpty = raw.every(function(v) { return String(v == null ? '' : v).trim() === ''; });
            if (allEmpty) continue;
            dataRowNum++;
            var sku = String(raw[skuIdx] == null ? '' : raw[skuIdx]).trim();
            var siteSku = String(raw[siteIdx] == null ? '' : raw[siteIdx]).trim();
            var model = modelIdx === -1 ? '' : String(raw[modelIdx] == null ? '' : raw[modelIdx]).trim();

            if (!sku) { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'SKU is required' }); continue; }
            if (!siteSku) { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'site_sku is required' }); continue; }
            if (model && REPLEN_VALID_MODELS.indexOf(model) === -1) {
                clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'Invalid replenishment_model: "' + model + '" (use sales_driven or forecast_driven)' });
                continue;
            }

            // Fulfillment model: only consumed for Hybrid marketplaces (required there);
            // ignored for platform/self marketplaces (model is fixed by the marketplace).
            var ff = ffIdx === -1 ? '' : String(raw[ffIdx] == null ? '' : raw[ffIdx]).trim();
            if (isHybridImport) {
                if (!ff) { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'fulfillment_model required for Hybrid (platform_fulfilled / self_fulfilled)' }); continue; }
                if (ff !== 'platform_fulfilled' && ff !== 'self_fulfilled') { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'Invalid fulfillment_model: "' + ff + '" (use platform_fulfilled / self_fulfilled)' }); continue; }
            }

            rows.push({
                sku: sku,
                site_sku: siteSku,
                company: meta.company,
                country: meta.country,
                marketplace: meta.marketplace,
                marketplace_id: meta.marketplaceId,
                currency: meta.currency,
                marketplace_sku_status: 'active',
                replenishment_model: model || 'sales_driven',
                fulfillment_model: isHybridImport ? ff : '',
                asin: '',
                launch_date: ''
            });
        }

        if (rows.length === 0 && clientErrors.length === 0) { renderReplenImportError('No data rows found.'); return; }
        if (rows.length === 0) {
            // All rows rejected client-side; show errors, nothing sent to backend.
            renderReplenImportResult({ summary: { total: clientErrors.length, created: 0, updated: 0, skipped: 0, error: clientErrors.length }, results: clientErrors });
            return;
        }

        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Importing...'; }
        window.KM.DB.importMarketplaceSkusBatch(rows, { priceStatusDefault: 'draft', forecastStatusDefault: 'draft' })
            .then(function(result) {
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                if (!result || result.success === false) {
                    renderReplenImportError(result && result.error ? result.error : 'Import failed. API may not be configured.');
                    return;
                }
                var data = result.data || {};
                var s = data.summary || { total: 0, created: 0, updated: 0, skipped: 0, error: 0 };
                var mergedSummary = {
                    total: (s.total || 0) + clientErrors.length,
                    created: s.created || 0,
                    updated: s.updated || 0,
                    skipped: s.skipped || 0,
                    error: (s.error || 0) + clientErrors.length
                };
                var mergedResults = clientErrors.concat(data.results || []);
                renderReplenImportResult({ summary: mergedSummary, results: mergedResults });
                // Refresh table after a successful import (wrapper already reloaded the DB cache).
                if (typeof renderReplenishment === 'function') renderReplenishment();
            })
            .catch(function(err) {
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                renderReplenImportError(err && err.message ? err.message : 'Import request failed.');
            });
    };
    reader.onerror = function() { renderReplenImportError('Could not read the selected file.'); };
    reader.readAsText(file);
}

function downloadReplenImportTemplate() {
    var res = _resolveReplenImportMarketplace();
    if (!_replenImportResolved) { alert('Please select Country and Marketplace first.' + (res && res.error ? ('\n' + res.error) : '')); return; }
    // Hybrid marketplace: template gains a fulfillment_model column (platform_fulfilled / self_fulfilled).
    // Non-hybrid: column is omitted (the SKU model is fixed by the marketplace).
    var isHybrid = _replenImportResolved.fulfillmentModel === 'hybrid';
    var headers = isHybrid ? 'sku,site_sku,replenishment_model,fulfillment_model' : 'sku,site_sku,replenishment_model';
    var sample = isHybrid ? 'SAMPLE-SKU,SAMPLE-SITE-SKU,sales_driven,platform_fulfilled' : 'SAMPLE-SKU,SAMPLE-SITE-SKU,sales_driven';
    var csv = headers + '\n' + sample + '\n';

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'marketplace_skus_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.openReplenImportModal = openReplenImportModal;
window.closeReplenImportModal = closeReplenImportModal;
window.onReplenImportCountryChange = onReplenImportCountryChange;
window.onReplenImportMarketplaceChange = onReplenImportMarketplaceChange;
window.runReplenImport = runReplenImport;
window.downloadReplenImportTemplate = downloadReplenImportTemplate;

// Populate the main Country / Marketplace filters from the marketplaces registry
// (cloud mode only, non-destructive: keeps static options when registry is empty or in Demo mode).
function _replenDemoOn() {
    return !!(window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled());
}

function _replenActiveMarketplaces() {
    var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
    return list.filter(function(m) { var s = (m.status || '').toLowerCase(); return !s || s === 'active'; });
}

// Resolve the CURRENT scope from the Marketplace dropdown. There is no Company select: in Cloud mode
// the dropdown value is a marketplace_id, so company + country + marketplace are DERIVED from the
// marketplaces master. In Demo mode the dropdown keeps its static marketplace-NAME options, so the
// value is the marketplace name directly (and company is unused for the demo scope).
function _replenSelectedScope() {
    var country = (document.getElementById('replenCountry') || {}).value || '';
    var mpVal = (document.getElementById('replenMarketplace') || {}).value || '';
    if (_replenDemoOn()) {
        return { company: '', country: country, marketplace: mpVal, marketplaceId: '' };
    }
    var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
    var rec = mpVal ? list.find(function(m){ return String(m.marketplaceId) === String(mpVal); }) : null;
    if (!rec) return { company: '', country: country, marketplace: '', marketplaceId: mpVal };
    return { company: rec.company || '', country: rec.country || country, marketplace: rec.marketplace || '', marketplaceId: rec.marketplaceId || mpVal };
}
window._replenSelectedScope = _replenSelectedScope;

// Selected replenishment company ('' = none) — now DERIVED from the selected marketplace_id (no
// Company select). Kept for callers that still ask for the company of the current scope.
function _replenSelectedCompany() {
    return _replenSelectedScope().company;
}
window._replenSelectedCompany = _replenSelectedCompany;

// Rebuild Country options from active marketplaces. Demo OFF only. Resets an invalid selection.
function refreshReplenCountryOptions() {
    if (_replenDemoOn()) return;
    var countrySel = document.getElementById('replenCountry');
    if (!countrySel) return;

    var active = _replenActiveMarketplaces();
    var selCountry = countrySel.value;

    var countries = [];
    active.forEach(function(m) {
        if (!m.country) return;
        if (countries.indexOf(m.country) === -1) countries.push(m.country);
    });
    countries.sort();

    countrySel.innerHTML = '<option value="">Select Country</option>' +
        countries.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    countrySel.value = (selCountry && countries.indexOf(selCountry) !== -1) ? selCountry : '';
}

// Rebuild Marketplace options, scoped to the selected Country + active status. Demo OFF only.
// Each option's value = marketplace_id (identity), label = marketplace_display_name. Company is NOT a
// separate selector — it is carried by the marketplace_id and derived downstream. Distinct marketplace_ids
// are never collapsed, so KM/US/Amazon and ResUS/US/Amazon remain two separate options.
function refreshReplenMarketplaceOptions() {
    if (_replenDemoOn()) return;
    var countrySel = document.getElementById('replenCountry');
    var mpSel = document.getElementById('replenMarketplace');
    if (!mpSel) return;

    var active = _replenActiveMarketplaces();
    var selCountry = countrySel ? countrySel.value : '';
    var selMarketplaceId = mpSel.value;

    var opts = [], ids = {};
    active.forEach(function(m) {
        if (!m.marketplaceId) return;
        if (selCountry && m.country !== selCountry) return;
        if (ids[m.marketplaceId]) return; ids[m.marketplaceId] = 1;
        opts.push({ value: m.marketplaceId, label: m.marketplaceDisplayName || m.marketplace || m.marketplaceId, company: m.company || '' });
    });

    // Canonical Decision 2: the option LABEL is marketplace_display_name only — NO country suffix (the
    // Country filter already scopes the list). The value stays marketplace_id (identity); the display
    // string is never used as identity. Single-select must resolve to ONE marketplace_id, so ONLY when
    // two options within this country share the EXACT same display name (rare KM vs ResUS case) do we
    // append a minimal company hint to disambiguate — otherwise the label is channel-only.
    var labelCount = {};
    opts.forEach(function(o) { labelCount[o.label] = (labelCount[o.label] || 0) + 1; });
    opts.forEach(function(o) { o.display = (labelCount[o.label] > 1 && o.company) ? (o.label + ' (' + o.company + ')') : o.label; });
    opts.sort(function(a, b) { return a.display.localeCompare(b.display); });

    mpSel.innerHTML = '<option value="">Select Marketplace</option>' +
        opts.map(function(o) { return '<option value="' + escapeReplenHtml(o.value) + '">' + escapeReplenHtml(o.display) + '</option>'; }).join('');
    // Keep the current marketplace_id ONLY if it still belongs to the (new) country scope — otherwise
    // reset to "" (no US/first-match fallback, no silent fallback to the first marketplace).
    mpSel.value = (selMarketplaceId && ids[selMarketplaceId]) ? selMarketplaceId : '';
}

// Resolve a canonical marketplace key to its display label (marketplace_display_name if present,
// else the key). Optionally disambiguate by company + country.
function _replenMarketplaceLabel(key, company, country) {
    key = String(key == null ? '' : key).trim();
    if (!key) return '';
    var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
    function up(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
    var exact = list.filter(function(m){ return up(m.marketplace) === up(key) &&
        (!company || up(m.company) === up(company)) && (!country || up(m.country) === up(country)) &&
        m.marketplaceDisplayName; })[0];
    if (exact) return exact.marketplaceDisplayName;
    var any = list.filter(function(m){ return up(m.marketplace) === up(key) && m.marketplaceDisplayName; })[0];
    return any ? any.marketplaceDisplayName : key;
}
window._replenMarketplaceLabel = _replenMarketplaceLabel;

// Full (initial) population of both filters from the registry. Demo OFF only;
// in Demo mode this is a no-op so the static demo options/behavior are preserved.
function populateReplenFiltersFromRegistry() {
    if (_replenDemoOn()) return;
    refreshReplenCountryOptions();
    refreshReplenMarketplaceOptions();
}

// Bind dependency handlers. Idempotent (onchange property assignment). Canonical scope:
// Country → Marketplace (marketplace_id). There is no Company select — company is derived from the
// selected marketplace_id. Changing Country resets the marketplace if its id no longer belongs.
function bindReplenFilterDependencies() {
    var countrySel = document.getElementById('replenCountry');
    var mpSel = document.getElementById('replenMarketplace');
    if (countrySel) {
        countrySel.onchange = function() {
            // Context (Country) changed → discard the Shipping Allocation Working Draft (both modes).
            _clearAllocationDraft();
            if (_replenDemoOn()) { if (typeof onReplenRecoScopeChanged === 'function') onReplenRecoScopeChanged(); return; }
            // Country changed -> re-scope Marketplace options; resets the marketplace_id selection if it
            // does not belong to the new country (no fallback to US / first marketplace).
            refreshReplenMarketplaceOptions();
            // Recommendation Context (F1-4B-B-PRE): re-scope destination options + drop a now-invalid
            // destination selection. Pure page-input recompute — NO API call.
            if (typeof onReplenRecoScopeChanged === 'function') onReplenRecoScopeChanged();
        };
    }
    if (mpSel) {
        mpSel.onchange = function() {
            // Context (Marketplace) changed → discard the Shipping Allocation Working Draft (both modes).
            // The chosen marketplace_id already belongs to the selected Country (options are country-scoped),
            // so no further re-scoping is needed.
            _clearAllocationDraft();
            // Recommendation Context (F1-4B-B-PRE): re-scope destination options for the new marketplace
            // scope + drop a now-invalid destination. Pure page-input recompute — NO API call.
            if (typeof onReplenRecoScopeChanged === 'function') onReplenRecoScopeChanged();
        };
    }
}

window.populateReplenFiltersFromRegistry = populateReplenFiltersFromRegistry;
window.refreshReplenCountryOptions = refreshReplenCountryOptions;
window.refreshReplenMarketplaceOptions = refreshReplenMarketplaceOptions;
window.bindReplenFilterDependencies = bindReplenFilterDependencies;

// ============================================================================
// F1-4B-B-PRE — Recommendation Context Input Authority (page-local; NO API call).
// ----------------------------------------------------------------------------
// Explicit, truthful page ownership of the THREE caller-owned inputs the read endpoint
// recommendation.workspace.get (F1-4B-A) mandates and the frozen Phase-1 registry forbids
// inferring:
//   • destinationWarehouseId — D-F1-5B-1: an explicit canonical warehouse_id, VALIDATED
//     (active + same company + compatible country); NEVER auto-selected/inferred.
//   • calculationMonth        — D-F1-5B-3: explicit injected "YYYY-MM"; NEVER the browser clock.
//   • planningCycle           — explicit caller/scheduler run identifier (opaque required string;
//     the runtime echoes it as windowCode and never parses it — no strict format is frozen, so we
//     require an explicit non-empty deterministic value and DO NOT invent a format validator).
// This slice ONLY establishes the input authority + a validated normalized context. It does NOT
// call the API, does NOT touch/replace any Recommendation Summary placeholder, authors NO
// formula/runtime, imports no runtime module, and performs NO write (sessionStorage page-input
// preference only). Pure helpers live in window.IRContext; DOM wiring below is thin.
// __IRCTX_START__ (test extraction marker — do not remove)
window.IRContext = (function () {
  'use strict';
  var MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  function s(v) { return String(v == null ? '' : v).trim(); }
  function eqv(a, b) { return s(a).toLowerCase() === s(b).toLowerCase(); }
  // Country compatibility reuses the shared inventory-compat contract (UK ≡ GB alias) with a safe
  // exact-match fallback — identical to how the rest of this page matches country. A blank country on
  // EITHER side is not a proven mismatch (never over-exclude a valid destination on missing data).
  function countryMatch(whCountry, scopeCountry) {
    if (!s(whCountry) || !s(scopeCountry)) return true;
    return (typeof window !== 'undefined' && window.IRCountry && window.IRCountry.matches)
      ? window.IRCountry.matches(whCountry, scopeCountry) : eqv(whCountry, scopeCountry);
  }

  // Eligible destination options for a scope (§5): canonical warehouse_id, explicitly active, same
  // company (no cross-company borrowing), compatible country. Identity is ALWAYS warehouse_id — never a
  // display name. Returns a deterministic, sorted list. Does NOT select anything.
  function eligibleDestinationWarehouses(warehouses, scope) {
    scope = scope || {};
    var out = (warehouses || []).filter(function (w) {
      if (!w || !s(w.warehouseId)) return false;         // identity is warehouse_id (never name)
      if (w.isActive !== true) return false;             // explicit active only (tri-state; blank/null excluded)
      if (scope.company && !eqv(w.company, scope.company)) return false;   // same company only
      if (!countryMatch(w.country, scope.country)) return false;          // compatible country scope
      return true;
    }).map(function (w) {
      return { warehouseId: s(w.warehouseId), warehouseCode: s(w.warehouseCode),
        warehouseName: s(w.warehouseName), warehouseType: s(w.warehouseType) };
    });
    out.sort(function (a, b) {
      var ka = a.warehouseCode || a.warehouseId, kb = b.warehouseCode || b.warehouseId;
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.warehouseId < b.warehouseId ? -1 : (a.warehouseId > b.warehouseId ? 1 : 0);
    });
    return out;
  }

  // Explicit YYYY-MM only. Blank → UNSELECTED (never a browser-clock default); malformed → INVALID_FORMAT.
  function validateCalculationMonth(v) {
    var raw = s(v);
    if (raw === '') return { value: null, state: 'UNSELECTED' };
    if (!MONTH_RE.test(raw)) return { value: null, state: 'INVALID_FORMAT' };
    return { value: raw, state: 'VALID' };
  }

  // Planning cycle: explicit non-empty run identifier (deterministic whitespace-normalized). No frozen
  // strict format exists, so we do NOT invent one; blank → UNSELECTED, any non-empty value → VALID.
  function validatePlanningCycle(v) {
    var raw = s(v).replace(/\s+/g, ' ');
    if (raw === '') return { value: null, state: 'UNSELECTED' };
    return { value: raw, state: 'VALID' };
  }

  // Destination sub-state from an EXPLICIT selection over the eligible set — never auto-picks a first/
  // only option. An array with >1 distinct id → DESTINATION_AUTHORITY_CONFLICT (mirrors the runtime).
  function destinationState(scope, eligible, selected) {
    scope = scope || {}; eligible = eligible || [];
    var sel;
    if (Array.isArray(selected)) {
      var distinct = [], seen = {};
      selected.forEach(function (x) { var id = s(x); if (id && !seen[id]) { seen[id] = 1; distinct.push(id); } });
      if (distinct.length > 1) return { state: 'DESTINATION_AUTHORITY_CONFLICT', destinationWarehouseId: null };
      sel = distinct[0] || '';
    } else { sel = s(selected); }
    if (eligible.length === 0) {
      return { state: (s(scope.fulfillmentModel).toLowerCase() === 'platform_fulfilled')
        ? 'PLATFORM_DESTINATION_IDENTITY_UNRESOLVED' : 'NO_ELIGIBLE_DESTINATION', destinationWarehouseId: null };
    }
    var ids = {}; eligible.forEach(function (w) { ids[w.warehouseId] = 1; });
    if (sel === '') return { state: 'UNSELECTED', destinationWarehouseId: null };
    if (ids[sel] === 1) return { state: 'SELECTED_VALID', destinationWarehouseId: sel };
    return { state: 'SELECTED_INVALID', destinationWarehouseId: null };
  }

  function contextScopeKey(scope) {
    scope = scope || {};
    return [s(scope.company), s(scope.country), s(scope.marketplaceId) || s(scope.marketplace)].join('|');
  }

  // The ONE page-local normalized context model (the shape the next round reads via toRequestContext).
  function normalizeRecommendationContext(input) {
    input = input || {};
    var scope = input.scope || {};
    var eligible = input.eligibleWarehouses || eligibleDestinationWarehouses(input.warehouses, scope);
    var dest = destinationState(scope, eligible, input.destinationSelectedId);
    var cm = validateCalculationMonth(input.calculationMonthRaw);
    var pc = validatePlanningCycle(input.planningCycleRaw);

    var model = {
      status: 'NOT_READY',
      company: s(scope.company) || null,
      country: s(scope.country) || null,
      marketplace: s(scope.marketplace) || null,
      marketplaceId: s(scope.marketplaceId) || null,
      destinationWarehouseId: dest.destinationWarehouseId,
      calculationMonth: cm.value,
      planningCycle: pc.value,
      destinationState: dest.state,
      calculationMonthState: cm.state,
      planningCycleState: pc.state,
      missing: [],
      issues: []
    };
    if (!model.company) model.missing.push('company');
    if (!model.country) model.missing.push('country');
    if (!model.marketplace) model.missing.push('marketplace');
    if (!model.destinationWarehouseId) model.missing.push('destinationWarehouseId');
    if (!model.calculationMonth) model.missing.push('calculationMonth');
    if (!model.planningCycle) model.missing.push('planningCycle');

    var hardInvalid = (cm.state === 'INVALID_FORMAT') || (dest.state === 'SELECTED_INVALID') || (dest.state === 'DESTINATION_AUTHORITY_CONFLICT');
    var destBlocked = (dest.state === 'NO_ELIGIBLE_DESTINATION') || (dest.state === 'PLATFORM_DESTINATION_IDENTITY_UNRESOLVED');
    if (cm.state === 'INVALID_FORMAT') model.issues.push('INVALID_CALCULATION_MONTH');
    if (dest.state === 'SELECTED_INVALID') model.issues.push('SELECTED_INVALID_DESTINATION');
    if (dest.state === 'DESTINATION_AUTHORITY_CONFLICT') model.issues.push('DESTINATION_AUTHORITY_CONFLICT');
    if (dest.state === 'NO_ELIGIBLE_DESTINATION') model.issues.push('NO_ELIGIBLE_DESTINATION');
    if (dest.state === 'PLATFORM_DESTINATION_IDENTITY_UNRESOLVED') model.issues.push('PLATFORM_DESTINATION_IDENTITY_UNRESOLVED');

    if (hardInvalid) model.status = 'INVALID';
    else if (destBlocked) model.status = 'DESTINATION_BLOCKED';
    else if (model.missing.length === 0) model.status = 'READY';
    else model.status = 'NOT_READY';
    return model;
  }

  // Pure predicate re-derived from a normalized model (idempotent truth check).
  function validateRecommendationContext(model) {
    model = model || {};
    var ready = !!(model.company && model.country && model.marketplace &&
      model.destinationWarehouseId && model.calculationMonth && model.planningCycle) &&
      model.status === 'READY';
    return { ready: ready, status: model.status || 'NOT_READY',
      missing: (model.missing || []).slice(), issues: (model.issues || []).slice() };
  }

  // The normalized context DTO the NEXT round (F1-4B-B) passes to recommendation.workspace.get.
  // Returned ONLY when READY; null otherwise (never a partial/guessed context). The key set matches the
  // F1-4B-A request contract (scope + explicit destination + injected month + planning cycle).
  function toRequestContext(model) {
    if (!validateRecommendationContext(model).ready) return null;
    return {
      company: model.company, country: model.country, marketplace: model.marketplace,
      destinationWarehouseId: model.destinationWarehouseId,
      calculationMonth: model.calculationMonth, planningCycle: model.planningCycle
    };
  }

  // F1-4B-FM1-T: the SCOPE-ONLY request context (company/country/marketplace). The server owns destination
  // expansion + calculation month/cycle, so the request NO LONGER carries destination/month/cycle. Returned only
  // when the business scope is complete; null otherwise (never a partial/guessed scope).
  function toScopeRequest(model) {
    model = model || {};
    var company = s(model.company), country = s(model.country), marketplace = s(model.marketplace);
    if (!company || !country || !marketplace) return null;
    return { company: company, country: country, marketplace: marketplace };
  }

  // Validate a restored (session) selection against the CURRENT scope + options; drop anything invalid.
  // Destination is kept only when the stored scope key matches AND the id is still eligible.
  function restoreContextSelection(stored, scope, eligible) {
    stored = stored || {};
    var out = { destinationSelectedId: '', calculationMonthRaw: '', planningCycleRaw: '' };
    var ids = {}; (eligible || []).forEach(function (w) { ids[w.warehouseId] = 1; });
    if (s(stored.scopeKey) && s(stored.scopeKey) === contextScopeKey(scope) && ids[s(stored.destinationWarehouseId)] === 1) {
      out.destinationSelectedId = s(stored.destinationWarehouseId);
    }
    if (validateCalculationMonth(stored.calculationMonth).state === 'VALID') out.calculationMonthRaw = s(stored.calculationMonth);
    var pc = validatePlanningCycle(stored.planningCycle);
    if (pc.state === 'VALID') out.planningCycleRaw = pc.value;
    return out;
  }

  return {
    eligibleDestinationWarehouses: eligibleDestinationWarehouses,
    validateCalculationMonth: validateCalculationMonth,
    validatePlanningCycle: validatePlanningCycle,
    destinationState: destinationState,
    contextScopeKey: contextScopeKey,
    normalizeRecommendationContext: normalizeRecommendationContext,
    validateRecommendationContext: validateRecommendationContext,
    toRequestContext: toRequestContext,
    toScopeRequest: toScopeRequest,
    restoreContextSelection: restoreContextSelection
  };
})();
// __IRCTX_END__ (test extraction marker — do not remove)

// ---- F1-4B-C — Recommendation Context is now INTERNAL (no UI). ---------------------------------------
// The three inputs the Recommendation Runtime requires (destinationWarehouseId / calculationMonth /
// planningCycle) were briefly surfaced as page controls (F1-4B-B-PRE). That was an implementation leak —
// users should never be asked for Recommendation-Runtime internals. F1-4B-C REMOVES the "Recommendation
// Context" panel from the UI and keeps the context purely as INTERNAL, HIDDEN page state: no control, no
// readiness indicator, no session-persisted user selection, no render. The pure IRContext MODEL is
// retained (frozen decisions unchanged); the Runtime still receives the three inputs, but now ONLY from
// this internal context (populated by a non-UI seam), never from user input. The Country / Marketplace
// filters remain the ONLY scope controls. Absent an internal populator the context stays NOT_READY, so
// the Recommendation Summary keeps its honest legacy placeholder until the runtime is truly Ready.
var _irctxLastContext = null;   // last normalized context model (INTERNAL; read by loadRecommendationWorkspace_)
// Internal (hidden) Recommendation-Runtime context. NOT user-entered, NOT rendered. Defaults empty; a
// future authorized non-UI seam (scheduler/config) sets it via _irSetInternalRecommendationContext.
var _irInternalContext = { destinationWarehouseId: null, calculationMonth: null, planningCycle: null };

function _irctxWarehouses() {
  // Reads the ALREADY-loaded canonical warehouse cache (same accessor the page uses today). No new
  // fetch, no whole-DB reload, never getOperationDb.
  return (window.KM && window.KM.DB && window.KM.DB.getWarehouses) ? (window.KM.DB.getWarehouses() || []) : [];
}
// Internal context scope = the page's selected scope + the marketplace's fulfillment model.
function _irctxScope() {
  var scope = (typeof _replenSelectedScope === 'function') ? _replenSelectedScope()
    : { company: '', country: '', marketplace: '', marketplaceId: '' };
  var ff = '';
  var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  var rec = scope.marketplaceId ? list.find(function (m) { return String(m.marketplaceId) === String(scope.marketplaceId); }) : null;
  if (rec) ff = rec.fulfillmentModel || '';
  return { company: scope.company, country: scope.country, marketplace: scope.marketplace, marketplaceId: scope.marketplaceId, fulfillmentModel: ff };
}
function _irctxEligible(scope) { return window.IRContext.eligibleDestinationWarehouses(_irctxWarehouses(), scope || _irctxScope()); }

// Recompute the INTERNAL normalized context from the current scope + the hidden internal inputs.
// Renders NOTHING (the readiness indicator was removed). Never calls the API; never writes.
function updateReplenRecoContext() {
  var scope = _irctxScope();
  var model = window.IRContext.normalizeRecommendationContext({
    scope: scope, eligibleWarehouses: _irctxEligible(scope),
    destinationSelectedId: _irInternalContext.destinationWarehouseId || '',
    calculationMonthRaw: _irInternalContext.calculationMonth || '',
    planningCycleRaw: _irInternalContext.planningCycle || ''
  });
  _irctxLastContext = model;
  return model;
}

// Fire the read cutover if it exists (F1-4B-B). No-op unless Workspace mode is effective + context READY.
// FM5-R1: in materialized mode the trigger READS the stored gap (no live calculation) as the AUTHORITATIVE gap
// source. F1-4B-FM5-R4J-LIVE9: the trigger now ALSO issues the one-per-scope recommendation.workspace.get so the
// main table can CARRY the canonical Sales-Driven velocity (horizonBasis.avgSalesPerDay) used by the D-horizon —
// closing SALES_DOS_HORIZON_AUTHORITY_DIVERGENCE. loadRecommendationWorkspace_ self-gates on
// workspaceApiActive('recommendation') + dedupes/caches; when it is off the rate is simply absent (no recompute).
// The materialized gap read remains the sole gap/suggested authority — populating _irRecoState never changes which
// source the Recommendation Summary / Suggested cell display (both prefer _irMatState).
function _irRecoTrigger() {
  var matReady = (typeof _irUseMaterializedGapRead === 'function' && _irUseMaterializedGapRead()
    && window.KM && window.KM.DB && typeof window.KM.DB.getInventoryReplenishmentGap === 'function');
  if (matReady && typeof loadInventoryGap_ === 'function') loadInventoryGap_();
  if (typeof loadRecommendationWorkspace_ === 'function') loadRecommendationWorkspace_();
}

// Non-UI internal seam: a scheduler/config (NOT the user) supplies the Runtime context. Recomputes the
// internal model and re-triggers the (flag-gated) read. There is no control bound to this.
function _irSetInternalRecommendationContext(ctx) {
  ctx = ctx || {};
  if (Object.prototype.hasOwnProperty.call(ctx, 'destinationWarehouseId')) _irInternalContext.destinationWarehouseId = ctx.destinationWarehouseId || null;
  if (Object.prototype.hasOwnProperty.call(ctx, 'calculationMonth')) _irInternalContext.calculationMonth = ctx.calculationMonth || null;
  if (Object.prototype.hasOwnProperty.call(ctx, 'planningCycle')) _irInternalContext.planningCycle = ctx.planningCycle || null;
  updateReplenRecoContext();
  _irRecoTrigger();
  return _irctxLastContext;
}

// Per-mount init: compute the internal context + trigger the flag-gated read. No control/indicator init.
function initReplenRecoContext() {
  updateReplenRecoContext();
  _irRecoTrigger();
}

// Scope change (Country/Marketplace) → recompute the internal context + (F1-4B-B) invalidate/refetch when
// the new scope is READY. No destination-option UI to rebuild (context is internal).
function onReplenRecoScopeChanged() {
  updateReplenRecoContext();
  _irRecoTrigger();
}

window.updateReplenRecoContext = updateReplenRecoContext;
window.initReplenRecoContext = initReplenRecoContext;
window.onReplenRecoScopeChanged = onReplenRecoScopeChanged;
window._irSetInternalRecommendationContext = _irSetInternalRecommendationContext;

// ============================================================================
// F1-4B-B — Recommendation READ cutover (recommendation.workspace.get; default-false flags).
// ----------------------------------------------------------------------------
// When Recommendation Workspace mode is EFFECTIVE (Foundation workspaceApiActive('recommendation') —
// master USE_WORKSPACE_API + per-workspace recommendation, both ON) AND the F1-4B-B-PRE page context is
// READY, this issues ONE recommendation.workspace.get request per full page scope and maps the canonical
// response INTO the Recommendation Summary. The page ONLY validates context, sends the request, maps the
// response, and renders state — it authors NO formula, recomputes NONE of currentStockQty /
// qualifiedIncomingQty / calculatedGap / recommendedQty, imports no runtime module, performs NO write,
// creates NO Allocation Draft / Execution Plan route / Submit, and issues NO per-SKU HTTP loop and NO
// whole-DB reload. When flags are OFF the existing legacy Recommendation Summary (placeholders) is
// preserved verbatim. Note: the main results-table columns keep their existing (FBA/legacy) meaning and
// labels — the API's destination-scoped currentStockQty ≠ the table's FBA "Current Inventory", so the
// source-proven recommendation values are presented ONLY in the correctly-labeled Recommendation Summary.
// __IRRECO_START__ (test extraction marker — do not remove)
var _irRecoSeq = 0;              // monotonic request sequence (stale-response guard)
var _irRecoAbort = null;         // AbortController for the in-flight request (browser response invalidation)
function _irRecoBlank(status) {
  return { status: status || 'DISABLED', contextKey: null, requestId: null, lines: [], linesBySku: {},
    pagination: null, dataVersion: null, errors: [], updatedAt: null, seq: _irRecoSeq, scope: null,
    calculationMonth: null, planningCycle: null, loadedOk: false };
}
var _irRecoState = _irRecoBlank('DISABLED');   // page-local read state (separate from Allocation Draft state)

// Effective cutover predicate — the SINGLE source of truth (delegates to the Foundation effective logic).
function _irRecommendationWorkspaceEnabled() {
  return !!(window.KM && window.KM.api && typeof window.KM.api.workspaceApiActive === 'function' &&
    window.KM.api.workspaceApiActive('recommendation'));
}

// ---- F1-4B-FM3a · Suggested-Qty PRESENTATION aggregation (NOT a recommendation formula) --------------
// Sum ONLY source-proven, non-blocked, finite recommendedQty across a SKU's canonical destination lines.
// Excludes provisional (provisionalOrderNeed), blocked lines, null/non-finite recommendedQty, and residual
// shortage. A legitimate canonical 0 is INCLUDED (valid zero). Returns { total, actionableCount } — the
// caller shows the numeric total when actionableCount>0, else an honest "—" (never a fake 0). No gap /
// stock / forecast / incoming / carton math here — pure read-side summation of already-computed canonical
// recommendedQty values.
function _irAggregateActionableRecommendedQty(lines) {
  var total = 0, actionableCount = 0;
  (lines || []).forEach(function (L) {
    if (!L || L.blocked === true) return;                 // blocked → not actionable
    var q = L.recommendedQty;
    if (typeof q !== 'number' || !isFinite(q)) return;    // null / provisional-only / missing → excluded
    total += q; actionableCount++;
  });
  return { total: total, actionableCount: actionableCount };
}

// ---- F1-4B-FM3a · bounded SESSION cache for successful Recommendation READ results -------------------
// Session-only (sessionStorage + in-memory mirror). Prevents a redundant recommendation.workspace.get on
// repeated navigation / re-expand of the SAME canonical scope. NEVER localStorage/IndexedDB/DB. Only a
// SUCCESSFUL canonical envelope is stored (blocked lines and valid zero ARE valid successes and cacheable);
// transport/API failure, CONFIG_NOT_READY, aborted, and stale responses are NEVER stored. JSON-safe record;
// the canonical envelope is never mutated.
var _IR_RECO_CACHE_KEY = 'km_ir_reco_cache_v1';
var _irRecoCacheMem = null;                                // lazy in-memory mirror of the session store
function _irRecoCacheLoad() {
  if (_irRecoCacheMem) return _irRecoCacheMem;
  _irRecoCacheMem = {};
  try {
    if (typeof sessionStorage !== 'undefined') {
      var raw = sessionStorage.getItem(_IR_RECO_CACHE_KEY);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') _irRecoCacheMem = o; }
    }
  } catch (e) { _irRecoCacheMem = {}; }
  return _irRecoCacheMem;
}
function _irRecoCachePersist() {
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(_IR_RECO_CACHE_KEY, JSON.stringify(_irRecoCacheMem || {})); } catch (e) {}
}
// Scope-only key (the Inventory request is company/country/marketplace scoped; server owns month/cycle).
function _irRecoCacheKey(scopeReq) {
  if (!scopeReq) return null;
  return [scopeReq.company || '', scopeReq.country || '', scopeReq.marketplace || ''].join('||');
}
function _irRecoCacheGet(scopeReq) {
  var k = _irRecoCacheKey(scopeReq); if (!k) return null;
  var e = _irRecoCacheLoad()[k];
  return (e && e.envelopeData) ? e : null;
}
function _irRecoCacheSet(scopeReq, env) {
  var k = _irRecoCacheKey(scopeReq); if (!k || !env || env.success !== true) return;   // successes only
  var c = _irRecoCacheLoad();
  c[k] = {
    requestScope: { company: scopeReq.company, country: scopeReq.country, marketplace: scopeReq.marketplace },
    envelopeData: (env.data && typeof env.data === 'object') ? env.data : {},
    meta: {
      requestId: (env.meta && env.meta.requestId) || null,
      calculationMonth: (env.meta && env.meta.calculationMonth) || null,
      planningCycle: (env.meta && env.meta.planningCycle) || null,
      dataVersion: (env.data && env.data.dataVersion) || null
    },
    cachedAt: (typeof Date !== 'undefined' && Date.now) ? Date.now() : null
  };
  _irRecoCacheMem = c; _irRecoCachePersist();
}
// Narrow programmatic invalidation (no UI this round). No arg → clear all; scopeReq → drop that key.
function invalidateRecommendationSessionCache(scopeReq) {
  var c = _irRecoCacheLoad();
  if (scopeReq === undefined || scopeReq === null) { _irRecoCacheMem = {}; }
  else { var k = _irRecoCacheKey(scopeReq); if (k && c[k]) { delete c[k]; _irRecoCacheMem = c; } }
  _irRecoCachePersist();
}

// explicit null/undefined/'' → null (preserve a legitimate 0; NEVER value || 0).
function _irNumOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v); return isFinite(n) ? n : null;
}
// F1-4B-FM2B: canonical server codes that mean "server configuration is incomplete" (calc-month Script
// Property) — distinct from a transport/API failure. Presented as CONFIG_NOT_READY with truthful wording.
function _irRecoIsConfigCode(code) {
  return code === 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED' || code === 'RECOMMENDATION_CALCULATION_MONTH_INVALID';
}
// F1-4B-FM1-T: the SCOPE-ONLY request context (company/country/marketplace). The server owns destination expansion
// + calculation month/cycle — the request NO LONGER depends on _irInternalContext destination/month/cycle.
function _irRecoScopeRequest() {
  var model = _irctxLastContext || ((typeof updateReplenRecoContext === 'function') ? updateReplenRecoContext() : null);
  if (!model || !window.IRContext || typeof window.IRContext.toScopeRequest !== 'function') return null;
  return window.IRContext.toScopeRequest(model);
}
// Map ONE canonical destination-node API line → the fields the summary renders (direct passthrough; no ||0).
function _irRecoMapLine(L) {
  L = L || {};
  return {
    recommendationLineId: L.recommendationLineId, recommendationMode: L.recommendationMode,
    sku: L.sku, siteSku: L.siteSku, destinationType: L.destinationType, destinationKey: L.destinationKey,
    destinationLabel: L.destinationLabel || L.destinationRefId || L.warehouseId || L.marketplaceId || null,
    warehouseId: L.warehouseId || null, marketplaceId: L.marketplaceId || null,
    allocatedForecastQty: _irNumOrNull(L.allocatedForecastQty), allocatedSalesQty: _irNumOrNull(L.allocatedSalesQty),
    currentStockQty: _irNumOrNull(L.currentStockQty), qualifiedIncomingQty: _irNumOrNull(L.qualifiedIncomingQty),
    incomingCompleteness: (L.incomingCompleteness == null ? null : String(L.incomingCompleteness)),
    calculatedGap: _irNumOrNull(L.calculatedGap), allocatedSupplyQty: _irNumOrNull(L.allocatedSupplyQty),
    recommendedQty: _irNumOrNull(L.recommendedQty), provisionalOrderNeed: _irNumOrNull(L.provisionalOrderNeed),
    residualShortageQty: _irNumOrNull(L.residualShortageQty),
    blocked: L.blocked === true, blockedReason: (L.blockedReason == null ? null : String(L.blockedReason)),
    formulaVersion: (L.formulaVersion == null ? null : String(L.formulaVersion)),
    sourceDataAsOf: (L.sourceDataAsOf == null ? null : String(L.sourceDataAsOf)),
    // F1-4B-FM4b: additive canonical D18/D30/D45/D90 day-horizon projection (server-owned; null when absent).
    // Pure passthrough — the page authors NO horizon math (no gap/covered/suggested computed here).
    horizons: Array.isArray(L.horizons) ? L.horizons.map(_irRecoMapHorizon) : null,
    // F1-4B-FM5-R4J-LIVE9: additive passthrough of the canonical Sales-Driven velocity basis the horizon engine
    // resolved (demandMode + KMCALC-normalized avgSalesPerDay + Site-Stock opening). The page authors NO rate here —
    // it CARRIES the server value so Avg Sales/day + Days of Supply align to the SAME authority as D18/D30/D45/D90.
    horizonBasis: (L.horizonBasis && typeof L.horizonBasis === 'object') ? {
      demandMode: (L.horizonBasis.demandMode == null ? null : String(L.horizonBasis.demandMode)),
      avgSalesPerDay: _irNumOrNull(L.horizonBasis.avgSalesPerDay),
      horizonOpeningQty: _irNumOrNull(L.horizonBasis.horizonOpeningQty),
      qualifiedIncomingCount: _irNumOrNull(L.horizonBasis.qualifiedIncomingCount)
    } : null,
    diagnostics: (L.diagnostics && Array.isArray(L.diagnostics.issues)) ? L.diagnostics.issues.slice() : []
  };
}
// F1-4B-FM4b: map ONE canonical horizon checkpoint → the fields the Horizon Summary renders (direct passthrough,
// preserve a legitimate 0; NEVER value || 0). The page computes NO gap/covered/suggested — all are server facts.
function _irRecoMapHorizon(h) {
  h = h || {};
  return {
    windowCode: (h.windowCode == null ? null : String(h.windowCode)),
    requiredByDate: (h.requiredByDate == null ? null : String(h.requiredByDate)),
    demandQty: _irNumOrNull(h.demandQty), openingSupplyQty: _irNumOrNull(h.openingSupplyQty),
    incomingAddedQty: _irNumOrNull(h.incomingAddedQty), coveredQty: _irNumOrNull(h.coveredQty),
    remainingSupplyQty: _irNumOrNull(h.remainingSupplyQty), gapQty: _irNumOrNull(h.gapQty),
    suggestedOrderQty: _irNumOrNull(h.suggestedOrderQty)
  };
}
// Apply a canonical envelope → state. Failure stays visible (never masked); success indexes lines by SKU
// (each SKU may carry MULTIPLE destination lines — MARKETPLACE and/or one per WAREHOUSE — kept distinct).
function _irRecoApplyEnvelope(env, ctxKey, reqScope) {
  if (!env || env.success !== true) {
    var _errs = (env && Array.isArray(env.errors) && env.errors.length) ? env.errors
      : [{ code: 'WORKSPACE_ERROR', message: 'Recommendation workspace request failed.', details: null }];
    // F1-4B-FM2B: a missing/malformed calculation-month Script Property is a CONFIG state (distinct from a
    // transport/API failure) — surfaced with its own status + wording, never "engine is not active".
    var _isConfig = _irRecoIsConfigCode(_errs[0] && _errs[0].code);
    _irRecoState = _irRecoBlank(_isConfig ? 'CONFIG_NOT_READY' : 'API_ERROR');
    _irRecoState.contextKey = ctxKey; _irRecoState.scope = reqScope;
    _irRecoState.errors = _errs;
    _irRecoState.requestId = (env && env.meta && env.meta.requestId) || null;
    return;
  }
  var data = env.data || {};
  var lines = Array.isArray(data.lines) ? data.lines : [];
  var bySku = {}, mapped = [];
  lines.forEach(function (L) { var m = _irRecoMapLine(L); mapped.push(m); (bySku[m.sku] = bySku[m.sku] || []).push(m); });
  _irRecoState = _irRecoBlank(lines.length ? 'READY' : 'EMPTY');
  _irRecoState.contextKey = ctxKey; _irRecoState.scope = reqScope;
  _irRecoState.lines = mapped; _irRecoState.linesBySku = bySku;
  _irRecoState.pagination = data.pagination || null; _irRecoState.dataVersion = data.dataVersion || null;
  _irRecoState.requestId = (env.meta && env.meta.requestId) || null;
  _irRecoState.calculationMonth = (env.meta && env.meta.calculationMonth) || null;
  _irRecoState.planningCycle = (env.meta && env.meta.planningCycle) || null;
  _irRecoState.updatedAt = (data.dataVersion && data.dataVersion.sourceDataAsOf) || null;   // server value, not browser clock
  _irRecoState.loadedOk = true;
}
// All destination lines for one page SKU (null when scope not loaded; [] when the SKU has no line).
function _irRecoLinesForSku(skuData) {
  if (!skuData || !_irRecoState.scope) return null;
  return _irRecoState.linesBySku[skuData.sku] || [];
}
// F1-4B-FM5-R4J-LIVE9: the canonical Sales-Driven velocity basis for a SKU, sourced (never recomputed) from the
// workspace MARKETPLACE line's horizonBasis — the SAME KMCALC-normalized rate the D18/D30/D45/D90 horizon uses.
// Returns null when the workspace read did not resolve a basis (→ caller keeps the existing weekly display; NO
// page-side sales-rate calculator, NO KMCALC call, NO DOM copy). Marketplace-grain (warehouse lines carry none).
function _irCanonicalSalesBasis_(sku) {
  if (sku == null || !_irRecoState || !_irRecoState.scope || !_irRecoState.linesBySku) return null;
  var lines = _irRecoState.linesBySku[String(sku)];
  if (!lines || !lines.length) return null;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i] && lines[i].destinationType === 'MARKETPLACE' && lines[i].horizonBasis) return lines[i].horizonBasis;
  }
  return null;
}
// Invalidate any in-flight request (bump seq + abort browser response) and reset to a clean status.
function _irRecoInvalidate(status) {
  _irRecoSeq++;
  if (_irRecoAbort && _irRecoAbort.abort) { try { _irRecoAbort.abort(); } catch (e) {} }
  _irRecoAbort = null;
  _irRecoState = _irRecoBlank(status || 'CONTEXT_NOT_READY');
}

// The read cutover: at most ONE scope-only recommendation.workspace.get per READY scope. Deduped, stale-guarded.
// The server owns destination fanout + calc context, so a valid Country/Marketplace scope is the ONLY prerequisite.
function loadRecommendationWorkspace_() {
  if (!_irRecommendationWorkspaceEnabled()) { _irRecoInvalidate('DISABLED'); _irRecoRerenderSummaries(); return null; }
  var scopeReq = _irRecoScopeRequest();
  if (!scopeReq) { _irRecoInvalidate('CONTEXT_NOT_READY'); _irRecoRerenderSummaries(); return null; }
  var ctxKey = JSON.stringify(scopeReq);
  // dedupe: identical scope already loading or loaded → no duplicate request from repeated calls / renders
  if (_irRecoState.contextKey === ctxKey && (_irRecoState.status === 'LOADING' || _irRecoState.loadedOk)) return null;
  // F1-4B-FM3a SESSION CACHE HIT: a previously-successful canonical result for this exact scope → restore it
  // with ZERO HTTP (survives navigate-away/back + re-expand within the browser session). Abort any in-flight
  // request for a superseded scope and bump the sequence so a late response can't clobber the cached state.
  var cachedEntry = _irRecoCacheGet(scopeReq);
  if (cachedEntry) {
    if (_irRecoAbort && _irRecoAbort.abort) { try { _irRecoAbort.abort(); } catch (e) {} }
    _irRecoAbort = null; _irRecoSeq++;
    var cachedEnv = { success: true, data: cachedEntry.envelopeData,
      meta: Object.assign({ source: 'session-cache' }, cachedEntry.meta || {}), errors: [] };
    _irRecoApplyEnvelope(cachedEnv, ctxKey, scopeReq);
    _irRecoState.fromCache = true;
    _irRecoRerenderSummaries();
    _irRecoUpdateSuggestedCells();
    _irRecoRefreshVelocityCells_();   // LIVE9V: cache-hit path also refreshes the velocity cells to the canonical rate
    return null;
  }
  if (!(window.KM && window.KM.api && typeof window.KM.api.getWorkspace === 'function')) {
    _irRecoInvalidate('API_ERROR'); _irRecoState.contextKey = ctxKey;
    _irRecoState.errors = [{ code: 'WORKSPACE_UNAVAILABLE', message: 'Recommendation Workspace is enabled but the API client is unavailable.', details: null }];
    _irRecoRerenderSummaries(); return null;
  }
  var my = ++_irRecoSeq;
  if (_irRecoAbort && _irRecoAbort.abort) { try { _irRecoAbort.abort(); } catch (e) {} }
  _irRecoAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var signal = _irRecoAbort ? _irRecoAbort.signal : undefined;
  _irRecoState = _irRecoBlank('LOADING');
  _irRecoState.contextKey = ctxKey; _irRecoState.seq = my; _irRecoState.scope = scopeReq;
  _irRecoRerenderSummaries();
  var _t0 = (typeof Date !== 'undefined' && Date.now) ? Date.now() : null;   // client-latency stamp (diagnostic only)
  // ONE scope-only request (server expands destinations + loops SKUs internally — no per-SKU HTTP, no dest/month/cycle).
  var params = { scope: { company: scopeReq.company, country: scopeReq.country, marketplace: scopeReq.marketplace, sku: null, siteSku: null },
    filters: { lts: null, series: null, category: null, sku: null, siteSku: null },
    pagination: { page: 1, size: 100 }, include: { diagnostics: true } };
  return Promise.resolve(window.KM.api.getWorkspace('recommendation', params, { signal: signal })).then(function (env) {
    if (my !== _irRecoSeq) return;   // STALE_IGNORED — a newer scope superseded this response (never cached)
    _irRecoRecordDiag(_t0);
    _irRecoApplyEnvelope(env, ctxKey, scopeReq);
    _irRecoCacheSet(scopeReq, env);   // FM3a: cache ONLY a successful canonical envelope (guarded inside)
    _irRecoRerenderSummaries();
    _irRecoUpdateSuggestedCells();
    _irRecoRefreshVelocityCells_();   // LIVE9V: re-render Avg Sales/day + Days of Supply with the now-loaded canonical rate
  }).catch(function (err) {
    if (my !== _irRecoSeq) return;
    _irRecoRecordDiag(_t0);
    _irRecoState = _irRecoBlank('API_ERROR'); _irRecoState.contextKey = ctxKey; _irRecoState.seq = my;
    _irRecoState.errors = [{ code: (err && err.apiCode) || 'PAGE_READ_FAILED', message: String(err && err.message || err), details: null }];
    _irRecoRerenderSummaries();
  });
}
// F1-4B-FM2A: push the client-side latency for the Inventory consumer into the safe Foundation diagnostic
// (guarded — a no-op when the recorder is absent, e.g. unit tests with a stubbed api).
function _irRecoRecordDiag(t0) {
  if (t0 == null || !(window.KM && window.KM.api && typeof window.KM.api.recordRecommendationDiagnostic === 'function')) return;
  try { window.KM.api.recordRecommendationDiagnostic({ lastClientDurationMs: Date.now() - t0 }); } catch (e) {}
}

// ---- Recommendation Summary presentation (workspace vs legacy) --------------------------------------
function _legacyRecSummaryTableHtml(skuData) {
  return '<table class="replen-recsum-table">'
    + '<thead><tr><th>Window</th><th class="replen-recsum-table__num">Calculated Gap</th>'
    + '<th class="replen-recsum-table__num">Recommended Qty</th><th>Route</th><th>Reason</th></tr></thead>'
    + '<tbody>' + _recSummaryRows(skuData) + '</tbody></table>';
}
// Inner diagnostics content (issue list + version meta) WITHOUT the <details> wrapper, so callers can compose
// it inside a single Diagnostics section (avoids nested <details>). Returns '' when nothing to show.
function _irRecoDiagnosticsInnerHtml(line) {
  function esc(v) { return escapeReplenHtml(v == null ? '' : v); }
  var items = [];
  (line.diagnostics || []).forEach(function (d) {
    var code = (d && d.code) ? '<code>' + esc(d.code) + '</code> ' : '';
    var msg = esc((d && d.message) ? d.message : (typeof d === 'string' ? d : ''));
    items.push('<li>' + code + msg + '</li>');
  });
  var meta = [];
  if (line.formulaVersion) meta.push('formulaVersion: ' + esc(line.formulaVersion));
  if (line.sourceDataAsOf) meta.push('sourceDataAsOf: ' + esc(line.sourceDataAsOf));
  if (_irRecoState.requestId) meta.push('requestId: ' + esc(_irRecoState.requestId));
  if (!items.length && !meta.length) return '';
  return (items.length ? ('<ul>' + items.join('') + '</ul>') : '')
    + (meta.length ? ('<div class="replen-recsum-ws__meta">' + meta.join(' · ') + '</div>') : '');
}
function _irRecoDiagnosticsHtml(line) {
  var inner = _irRecoDiagnosticsInnerHtml(line);
  if (!inner) return '';
  return '<details class="replen-recsum-ws__diag"><summary>Diagnostics</summary>' + inner + '</details>';
}
// F1-4B-FM1-T minimal destination presentation — ONE compact row per response destination (MARKETPLACE and/or
// each WAREHOUSE). Distinguishes canonical / valid-zero / blocked / partial-provisional / missing-rule /
// source-insufficient (residual) / API-error / no-line. No Execution-Plan mutation, Submit, or persistence here.
function _irRecoDestModeLabel(mode) {
  if (mode === 'MARKETPLACE_ORDER_NEED') return 'Marketplace Order Need';
  if (mode === 'WAREHOUSE_REPLENISHMENT') return 'Warehouse Replenishment';
  return mode || '—';
}
function _irRecoDestRowHtml(line) {
  function esc(v) { return escapeReplenHtml(v == null ? '' : v); }
  function num(v) { return (v === null || v === undefined) ? '—' : esc(String(v)); }
  var status, statusCls, recCell;
  var reason = line.blockedReason ? ('<code>' + esc(line.blockedReason) + '</code>') : '';
  if (line.blocked) {
    if (line.incomingCompleteness === 'PARTIAL' || line.incomingCompleteness === 'UNAVAILABLE') {
      status = 'Partial incoming — provisional'; statusCls = 'is-partial';
      recCell = '<span class="replen-recsum-ws__provisional">prov. ' + num(line.provisionalOrderNeed) + '</span>';
    } else { status = 'Blocked'; statusCls = 'is-blocked'; recCell = '—'; }
  } else if (line.recommendedQty === 0) {
    status = 'No replenishment needed'; statusCls = 'is-zero'; recCell = '0';
  } else {
    var short = (typeof line.residualShortageQty === 'number' && line.residualShortageQty > 0);
    status = short ? ('Source short by ' + num(line.residualShortageQty)) : 'OK';
    statusCls = short ? 'is-short' : 'is-ok'; recCell = num(line.recommendedQty);
  }
  var demand = (line.recommendationMode === 'MARKETPLACE_ORDER_NEED') ? line.calculatedGap : line.allocatedForecastQty;
  return '<tr class="' + statusCls + '">'
    + '<td>' + esc(line.destinationLabel) + '</td>'
    + '<td>' + esc(_irRecoDestModeLabel(line.recommendationMode)) + '</td>'
    + '<td class="replen-recsum-table__num">' + num(demand) + ' / ' + num(line.calculatedGap) + '</td>'
    + '<td class="replen-recsum-table__num">' + num(line.currentStockQty) + '</td>'
    + '<td class="replen-recsum-table__num">' + num(line.qualifiedIncomingQty) + (line.incomingCompleteness && line.incomingCompleteness !== 'COMPLETE' ? (' <em>(' + esc(line.incomingCompleteness) + ')</em>') : '') + '</td>'
    + '<td class="replen-recsum-table__num">' + recCell + '</td>'
    + '<td>' + esc(status) + '</td>'
    + '<td>' + reason + '</td>'
    + '</tr>';
}
// ---- F1-4B-FM4b · Horizon Summary (the PRIMARY decision surface) -------------------------------------
// Renders the server-owned D18/D30/D45/D90 CUMULATIVE checkpoints for ONE destination line. The page does
// NO horizon math: Window/Required By/Demand/Covered/Gap/Suggested come verbatim from line.horizons[]. A
// legitimate canonical 0 renders "0"; a missing/unavailable value renders "—". The four windows are cumulative
// checkpoints and are NEVER summed together. A short destination-type badge ("Warehouse" / "Marketplace") is
// shown for identity — deliberately NOT the "Warehouse Replenishment" mode phrase (that stays in Diagnostics).
var _IR_HORIZON_WINDOWS = [{ code: 'D18', label: '18 Days' }, { code: 'D30', label: '30 Days' }, { code: 'D45', label: '45 Days' }, { code: 'D90', label: '90 Days' }];
function _irRecoDestTypeBadge(line) {
  if (line.destinationType === 'WAREHOUSE') return 'Warehouse';
  if (line.destinationType === 'MARKETPLACE') return 'Marketplace';
  return line.destinationType || '';
}
function _irRecoHorizonTableHtml(line) {
  function esc(v) { return escapeReplenHtml(v == null ? '' : v); }
  function num(v) { return (v === null || v === undefined) ? '—' : esc(String(v)); }   // valid 0 → "0"; missing → "—"
  var byWin = {};
  (line.horizons || []).forEach(function (h) { if (h && h.windowCode) byWin[h.windowCode] = h; });
  var rows = _IR_HORIZON_WINDOWS.map(function (w) {
    var h = byWin[w.code];
    if (!h) return '<tr class="is-missing"><td>' + w.label + '</td><td>—</td>'
      + '<td class="replen-recsum-table__num">—</td><td class="replen-recsum-table__num">—</td>'
      + '<td class="replen-recsum-table__num">—</td><td class="replen-recsum-table__num">—</td></tr>';
    return '<tr>'
      + '<td>' + w.label + '</td>'
      + '<td>' + (h.requiredByDate ? esc(h.requiredByDate) : '—') + '</td>'
      + '<td class="replen-recsum-table__num">' + num(h.demandQty) + '</td>'
      + '<td class="replen-recsum-table__num">' + num(h.coveredQty) + '</td>'
      + '<td class="replen-recsum-table__num">' + num(h.gapQty) + '</td>'
      + '<td class="replen-recsum-table__num">' + num(h.suggestedOrderQty) + '</td>'
      + '</tr>';
  }).join('');
  return '<table class="replen-horizon-table replen-horizon-table--detail"><thead><tr>'
    + '<th>Window</th><th>Required By</th><th class="replen-recsum-table__num">Demand</th>'
    + '<th class="replen-recsum-table__num">Covered</th><th class="replen-recsum-table__num">Gap</th>'
    + '<th class="replen-recsum-table__num">Suggested</th></tr></thead><tbody>' + rows + '</tbody></table>';
}
// F1-4B-FM6 · truthful per-window Note derived ONLY from the canonical gap (no page formula): missing → "—";
// valid zero → "No shortage"; positive gap → "Replenishment required".
function _irRecoHorizonNote_(h) {
  if (h && h.note != null && String(h.note) !== '') return String(h.note);   // explicit truthful note (e.g. a BLOCKED reason) wins
  if (!h || typeof h.gapQty !== 'number' || !isFinite(h.gapQty)) return '—';
  return h.gapQty <= 0 ? 'No shortage' : 'Replenishment required';
}
// F1-4B-FM6 · FROZEN PRIMARY surface — the compact decision table: Window | Gap | Suggested Qty | Note ONLY.
// Required By is a subtle sub-line under Window (not a column). Demand/Covered and all technical fields live under
// Diagnostics. Valid 0 → "0"; missing → "—". The table is wrapped in an overflow-x container so a very large
// number or a narrow viewport scrolls INTERNALLY and never overflows the SKU card.
function _irRecoHorizonOutlookTableHtml(line) {
  function esc(v) { return escapeReplenHtml(v == null ? '' : v); }
  function num(v) { return (v === null || v === undefined) ? '—' : esc(String(v)); }
  var byWin = {};
  (line.horizons || []).forEach(function (h) { if (h && h.windowCode) byWin[h.windowCode] = h; });
  // F1-4B-FM5-R4UI-R4 §3 — TRUE fixed schema: the four windows ALWAYS render, each cell carries a stable identity
  // (data-ir-gap-window / data-ir-suggested-window / data-ir-note-window) so async data PATCHES cell content in place
  // (see _irRecoPatchSummaryCells) instead of regenerating the table. Missing/absent data → "—"/"…", never dropped.
  var rows = _IR_HORIZON_WINDOWS.map(function (w) {
    var h = byWin[w.code];
    var by = (h && h.requiredByDate) ? ('<span class="replen-horizon-by">by ' + esc(h.requiredByDate) + '</span>') : '';
    var winCell = '<td class="replen-horizon-table__win"><span class="replen-horizon-win">' + w.label + '</span>' + by + '</td>';
    var gap = h ? num(h.gapQty) : '—', sug = h ? num(h.suggestedOrderQty) : '—', note = h ? esc(_irRecoHorizonNote_(h)) : '—';
    return '<tr' + (h ? '' : ' class="is-missing"') + '>' + winCell
      + '<td class="replen-recsum-table__num" data-ir-gap-window="' + w.code + '">' + gap + '</td>'
      + '<td class="replen-recsum-table__num" data-ir-suggested-window="' + w.code + '">' + sug + '</td>'
      + '<td class="replen-horizon-table__note" data-ir-note-window="' + w.code + '">' + note + '</td>'
      + '</tr>';
  }).join('');
  return '<div class="replen-horizon-tablewrap"><table class="replen-horizon-table replen-horizon-table--outlook" data-ir-summary="1"><thead><tr>'
    + '<th class="replen-horizon-table__win">Window</th><th class="replen-recsum-table__num">Gap</th>'
    + '<th class="replen-recsum-table__num">Suggested Qty</th><th class="replen-horizon-table__note">Note</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}
// ONE destination subsection (MARKETPLACE → one; WAREHOUSE → one per warehouse; never pooled). Blocked and
// horizon-unavailable states are shown truthfully instead of a fabricated table.
function _irRecoHorizonSectionHtml(line) {
  function esc(v) { return escapeReplenHtml(v == null ? '' : v); }
  var badge = _irRecoDestTypeBadge(line);
  var head = '<div class="replen-horizon-dest"><div class="replen-horizon-dest__hd">'
    + '<span class="replen-horizon-dest__name">' + esc(line.destinationLabel || '—') + '</span>'
    + (badge ? (' <span class="replen-horizon-dest__badge">' + esc(badge) + '</span>') : '');
  if (line.blocked) {
    var reason = line.blockedReason ? ('<code>' + esc(line.blockedReason) + '</code>') : 'blocked';
    if (line.incomingCompleteness === 'PARTIAL' || line.incomingCompleteness === 'UNAVAILABLE') {
      return head + '</div><div class="replen-horizon-dest__blocked">Partial incoming — provisional; horizon withheld ' + reason + '</div></div>';
    }
    return head + '</div><div class="replen-horizon-dest__blocked">Blocked — ' + reason + '</div></div>';
  }
  if (!line.horizons || !line.horizons.length) {
    return head + '</div><div class="replen-horizon-dest__na">Horizon projection unavailable for this destination. <code>HORIZONS_NOT_AVAILABLE</code></div></div>';
  }
  return head + '</div>' + _irRecoHorizonOutlookTableHtml(line) + '</div>';
}
// The legacy per-destination technical table (Destination/Mode/Demand-Gap/Stock/Incoming/Recommended/Status/
// Reason) — RELOCATED under Diagnostics (no longer the primary surface). Content preserved verbatim.
function _irRecoLegacyDestTableHtml(lines) {
  var rows = lines.map(_irRecoDestRowHtml).join('');
  return '<table class="replen-recsum-table replen-recsum-ws__table"><thead><tr>'
    + '<th>Destination</th><th>Mode</th><th class="replen-recsum-table__num">Demand / Gap</th>'
    + '<th class="replen-recsum-table__num">Stock</th><th class="replen-recsum-table__num">Incoming</th>'
    + '<th class="replen-recsum-table__num">Recommended</th><th>Status</th><th>Reason</th></tr></thead><tbody>'
    + rows + '</tbody></table>';
}
function _irRecoWorkspaceBody(skuData) {
  function esc(v) { return escapeReplenHtml(v == null ? '' : v); }
  function wrap(cls, inner) { return '<div class="replen-recsum-ws ' + cls + '" role="status" aria-live="polite">' + inner + '</div>'; }
  var st = _irRecoState;
  if (st.status === 'DISABLED') return _legacyRecSummaryTableHtml(skuData);   // safety net (should not reach when enabled)
  if (st.status === 'CONTEXT_NOT_READY') return wrap('replen-recsum-ws--info', 'Recommendation scope is not ready. Select a valid Country / Marketplace.');
  if (st.status === 'LOADING') return wrap('replen-recsum-ws--loading', 'Calculating recommendation…');
  if (st.status === 'CONFIG_NOT_READY') {
    var ce = (st.errors && st.errors[0]) || { code: 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED' };
    var crid = st.requestId ? (' <span class="replen-recsum-ws__reqid">[' + esc(st.requestId) + ']</span>') : '';
    return wrap('replen-recsum-ws--config', 'Recommendation configuration is incomplete: <code>' + esc(ce.code || 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED') + '</code>. Ask an administrator to set RECOMMENDATION_CALCULATION_MONTH.' + crid);
  }
  if (st.status === 'API_ERROR') {
    var e = (st.errors && st.errors[0]) || { code: 'API_ERROR', message: 'Recommendation request failed.' };
    var rid = st.requestId ? (' <span class="replen-recsum-ws__reqid">[' + esc(st.requestId) + ']</span>') : '';
    return wrap('replen-recsum-ws--error', 'Recommendation request failed: ' + esc(e.message || '') + ' <code>' + esc(e.code || 'API_ERROR') + '</code>' + rid);
  }
  if (st.status === 'EMPTY') return wrap('replen-recsum-ws--info', 'No SKU matched the current recommendation scope.');
  var lines = _irRecoLinesForSku(skuData);
  if (!lines || !lines.length) return wrap('replen-recsum-ws--info', 'No recommendation line for this SKU in the current scope. <code>RECOMMENDATION_LINE_NOT_FOUND</code>');
  var meta = [];
  if (st.calculationMonth) meta.push('month: ' + esc(st.calculationMonth));
  if (st.planningCycle) meta.push('cycle: ' + esc(st.planningCycle));
  if (st.requestId) meta.push('requestId: ' + esc(st.requestId));
  // PRIMARY surface: one Horizon Summary subsection per destination line (MARKETPLACE → one; WAREHOUSE →
  // one per warehouse; never pooled, never summed across windows).
  var sections = '<div class="replen-horizon-summary">' + lines.map(_irRecoHorizonSectionHtml).join('') + '</div>';
  var metaHtml = meta.length ? ('<div class="replen-recsum-ws__meta">' + meta.join(' · ') + '</div>') : '';
  // Technical destination/runtime detail is DEMOTED under a collapsed <details> — no longer the decision surface.
  // Wide tables (legacy destination table + the full horizon detail: Required By / Demand / Covered) scroll
  // INTERNALLY inside their own overflow-x container so they never widen or overflow the SKU card.
  var horizonDetail = lines.map(function (L) {
    return (L.horizons && L.horizons.length) ? ('<div class="replen-recsum-ws__scroll">' + _irRecoHorizonTableHtml(L) + '</div>') : '';
  }).join('');
  var diag = '<details class="replen-recsum-ws__diag replen-recsum-ws__diag--dest"><summary>Diagnostics</summary>'
    + '<div class="replen-recsum-ws__scroll">' + _irRecoLegacyDestTableHtml(lines) + '</div>'
    + horizonDetail + _irRecoDiagnosticsInnerHtml(lines[0]) + '</details>';
  return wrap('replen-recsum-ws--ready', sections + metaHtml + diag);
}
// The card body: MATERIALIZED read (FM5-R1) is the primary surface once a materialized load has occurred for the
// scope; else the live Workspace presentation (diagnostic/fallback); else the unchanged legacy table.
function _irRecoSummaryCardBody(skuData) {
  if (_irUseMaterializedGapRead() && _irMatState.status !== 'IDLE') return _irMatOutlookBody(skuData);
  if (!_irRecommendationWorkspaceEnabled()) return _legacyRecSummaryTableHtml(skuData);
  return _irRecoWorkspaceBody(skuData);
}

// ================= F1-4B-FM5-R1 · MATERIALIZED GAP READ (inventory_replenishment_gap) =================
// The normal page reads the STORED batch result — it does NOT run recommendation.workspace.get on expand and does
// NO gap math in the browser. recommendation.workspace.get is demoted to the batch owner + a diagnostic/fallback.
// Flag USE_MATERIALIZED_GAP_READ (default true) changes the READ SOURCE only — it is NOT a second engine.
function _irUseMaterializedGapRead() {
  if (typeof window !== 'undefined' && window.KM_FLAGS && typeof window.KM_FLAGS.USE_MATERIALIZED_GAP_READ === 'boolean') return window.KM_FLAGS.USE_MATERIALIZED_GAP_READ;
  return true;
}
var _irMatState = { status: 'IDLE', scopeKey: null, bySku: {}, rows: [], loadedOk: false, error: null };
var _irMatSeq = 0;
// Explicit numeric coercion: '' / null / undefined → null (renders "—", never a fabricated 0); a real number
// (including 0) is preserved. NO arithmetic — the stored value is displayed verbatim.
function _irMatNum(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
// STALE: only when the client is told the currently-expected calculation date and the stored row is older. No
// silent recalculation on expansion — a stale row is shown with a subtle indicator, never recomputed.
function _irMatExpectedCalcDate() { return (typeof window !== 'undefined' && window.KM_FLAGS && window.KM_FLAGS.EXPECTED_CALCULATION_DATE) ? String(window.KM_FLAGS.EXPECTED_CALCULATION_DATE) : null; }
function _irMatIsStale(row) { var exp = _irMatExpectedCalcDate(); var cd = row && row.calculation_date ? String(row.calculation_date) : ''; return !!(exp && cd && cd < exp); }
// Map ONE stored gap row → the frozen horizons-shaped line the FROZEN outlook renderer consumes (no new render).
// Map ONE stored gap row → the frozen horizons-shaped line the outlook renderer consumes (no new render, NO math).
// F1-4B-FM5-R4UI: a non-READY (BLOCKED/ERROR) row has blank gap cells → every window renders "—" plus the truthful
// stored reason (row.note, else the status) as its per-window Note. A READY row leaves note undefined so the
// per-window business Note is derived (No shortage / Replenishment required) from the stored gap. Stored values only.
function _irMatToLine(row) {
  var st = row.calculation_status ? String(row.calculation_status) : '';
  // F1-4B-FM5-R4UI-R5A §3 — the normal Recommendation Summary must NOT surface raw internal codes
  // (SALES_BASIS_* / HORIZONS_NOT_AVAILABLE / …). Show a short user-safe note; the technical row.note stays in the
  // DB and is still visible under Diagnostics (IR_DEBUG_DIAGNOSTICS). READY rows keep the derived business note.
  var reason = (st && st !== 'READY') ? 'Calculation unavailable' : null;
  function hz(code, g, s) { var h = { windowCode: code, gapQty: _irMatNum(g), suggestedOrderQty: _irMatNum(s) }; if (reason) h.note = reason; return h; }
  return {
    destinationType: 'MARKETPLACE', destinationLabel: null, calculationStatus: st,
    horizons: [
      hz('D18', row.d18_gap_qty, row.d18_suggested_qty),
      hz('D30', row.d30_gap_qty, row.d30_suggested_qty),
      hz('D45', row.d45_gap_qty, row.d45_suggested_qty),
      hz('D90', row.d90_gap_qty, row.d90_suggested_qty)
    ]
  };
}
// F1-4B-FM5-R4UI: panel-level engineering metadata (calculation_status / calc date / as-of / aggregate note) is
// DEMOTED under a collapsed Diagnostics section — it is NOT part of the normal presentation. Only the actionable
// "stale" warning stays visible in the normal view (business signal → run Recalculate All Sites). The per-window
// business Note remains in the primary table.
// F1-4B-FM5-R4UI-R4 §3 — the normal user-facing card shows ONLY the fixed 4-row table + (when applicable) the
// actionable "stale" business banner. Engineering metadata (status / calc date / as-of / aggregate note) is NO
// LONGER shown in production — it is emitted ONLY when the developer debug flag is explicitly enabled
// (window.KM_FLAGS.IR_DEBUG_DIAGNOSTICS === true). This removes the collapsed Diagnostics control from ordinary UI.
function _irRecoDebugDiagnosticsEnabled() { return !!(typeof window !== 'undefined' && window.KM_FLAGS && window.KM_FLAGS.IR_DEBUG_DIAGNOSTICS === true); }
function _irMatMetaHtml(row) {
  function esc(v) { return escapeReplenHtml(v == null ? '' : v); }
  var stale = _irMatIsStale(row) ? '<div class="replen-recsum-ws__meta"><span class="replen-mat-stale">⚠ stale — run Recalculate All Sites</span></div>' : '';
  if (!_irRecoDebugDiagnosticsEnabled()) return stale;   // production: no Diagnostics control in the normal card
  var bits = [];
  if (row.calculation_status) bits.push('status: ' + esc(row.calculation_status));
  if (row.calculation_date) bits.push('calc date: ' + esc(row.calculation_date));
  if (row.calculated_at) bits.push('as of ' + esc(row.calculated_at));
  if (row.note != null && String(row.note) !== '') bits.push('note: ' + esc(row.note));
  var diag = bits.length ? ('<details class="replen-recsum-ws__diag replen-recsum-ws__diag--mat"><summary>Diagnostics</summary><div class="replen-recsum-ws__meta">' + bits.join(' · ') + '</div></details>') : '';
  return stale + diag;
}
function _irMatOutlookBody(skuData) {
  function wrap(cls, inner) { return '<div class="replen-recsum-ws ' + cls + '" role="status" aria-live="polite">' + inner + '</div>'; }
  // F1-4B-FM5-R4UI-R5E §1 — TRUE FIXED SCHEMA (like Monthly Achievement): the fixed 4-window outlook table ALWAYS
  // exists from the moment the SKU expands, in EVERY load state. Loading / not-calculated / read-error only change
  // the per-window Note CELL + the wrapper's state class — they NEVER replace the table — so the card DOM and its
  // height are stable from expand and async data PATCHES cells in place (see _irRecoPatchSummaryCells). A response
  // never decides the table structure or height. Only the fixed 4-row table is the primary surface; panel-level
  // engineering metadata stays under the collapsed Diagnostics (debug-flag) section.
  function placeholderLine(note) {
    return { destinationType: 'MARKETPLACE', horizons: _IR_HORIZON_WINDOWS.map(function (w) { return { windowCode: w.code, gapQty: null, suggestedOrderQty: null, note: note }; }) };
  }
  var st = _irMatState, stateCls = 'replen-recsum-ws--ready', line, meta = '';
  if (st.status === 'CONTEXT_NOT_READY') { stateCls = 'replen-recsum-ws--info'; line = placeholderLine('Select a valid Country / Marketplace'); }
  else if (st.status === 'IDLE' || st.status === 'LOADING') { stateCls = 'replen-recsum-ws--loading'; line = placeholderLine('Loading…'); }
  else if (st.status === 'READ_ERROR') { stateCls = 'replen-recsum-ws--error'; line = placeholderLine('Calculation unavailable'); }
  else {
    var row = (skuData && _irMatState.bySku[String(skuData.sku)]) || null;
    if (!row) { stateCls = 'replen-recsum-ws--info'; line = placeholderLine('Not calculated'); }
    else { stateCls = 'replen-recsum-ws--ready'; line = _irMatToLine(row); meta = _irMatMetaHtml(row); }
  }
  var section = '<div class="replen-horizon-summary"><div class="replen-horizon-dest">'
    + _irRecoHorizonOutlookTableHtml(line) + '</div></div>';
  // F1-4B-FM6 — append the deterministic Recommended Action (from AI Plan) UNDER the fixed 4-row gap table; never
  // replaces it (the materialized gap display is preserved). Empty string until AI Plan generates for this SKU.
  return wrap(stateCls, section + meta + (typeof _irRecoActionHtml === 'function' ? _irRecoActionHtml(skuData) : ''));
}
// ONE materialized read per scope (deduped, stale-guarded). Reads STORED rows; no calculation, no per-SKU HTTP.
function loadInventoryGap_(force) {
  if (!_irUseMaterializedGapRead()) return null;
  var scopeReq = _irRecoScopeRequest();
  if (!scopeReq) { _irMatState = { status: 'CONTEXT_NOT_READY', scopeKey: null, bySku: {}, rows: [], loadedOk: false, error: null }; _irRecoRerenderSummaries(); return null; }
  var key = JSON.stringify(scopeReq);
  if (!force && _irMatState.scopeKey === key && _irMatState.loadedOk) { _irRecoRerenderSummaries(); return null; }
  if (!(window.KM && window.KM.DB && typeof window.KM.DB.getInventoryReplenishmentGap === 'function')) {
    _irMatState = { status: 'READ_ERROR', scopeKey: key, bySku: {}, rows: [], loadedOk: false, error: { code: 'READER_UNAVAILABLE', message: 'materialized gap reader unavailable' } };
    _irRecoRerenderSummaries(); return null;
  }
  var my = ++_irMatSeq;
  _irMatState = { status: 'LOADING', scopeKey: key, bySku: {}, rows: [], loadedOk: false, error: null };
  _irRecoRerenderSummaries();
  return Promise.resolve(window.KM.DB.getInventoryReplenishmentGap(scopeReq)).then(function (res) {
    if (my !== _irMatSeq) return;
    if (!res || !res.success) { _irMatState = { status: 'READ_ERROR', scopeKey: key, bySku: {}, rows: [], loadedOk: false, error: (res && res.error) || { code: 'READ_FAILED', message: 'materialized gap read failed' } }; _irRecoRerenderSummaries(); return; }
    var rows = (res.data && res.data.rows) || [];
    var bySku = {}; rows.forEach(function (r) { if (r && r.sku != null) bySku[String(r.sku)] = r; });
    _irMatState = { status: rows.length ? 'READY' : 'EMPTY', scopeKey: key, bySku: bySku, rows: rows, loadedOk: true, error: null };
    _irRecoRerenderSummaries(); _irRecoUpdateSuggestedCells();
  }).catch(function (err) {
    if (my !== _irMatSeq) return;
    _irMatState = { status: 'READ_ERROR', scopeKey: key, bySku: {}, rows: [], loadedOk: false, error: { code: 'READ_FAILED', message: String(err && err.message || err) } };
    _irRecoRerenderSummaries();
  });
}
// Manual-recalc refresh: invalidate the materialized cache + refetch the stored rows (no per-SKU live calc).
function refreshInventoryGapAfterRecalc_() { _irMatState.loadedOk = false; _irMatState.scopeKey = null; return loadInventoryGap_(true); }
window.loadInventoryGap_ = loadInventoryGap_;
// Re-render any OPEN Recommendation Summary card(s) from the current read state (no full-page overlay).
function _irRecoRerenderSummaries() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  var cards = document.querySelectorAll('#ops-section .replen-card--recommendation-summary');
  if (!cards || !cards.length) return;
  var data = (typeof getReplenishmentData === 'function') ? (getReplenishmentData() || []) : [];
  Array.prototype.forEach.call(cards, function (card) {
    var sku = String(card.id || '').replace('recommendation-summary-', '');
    var skuData = null; for (var i = 0; i < data.length; i++) { if (data[i].sku === sku) { skuData = data[i]; break; } }
    // F1-4B-FM5-R4UI-R4 §3 — once the fixed 4-row schema exists in this card, a subsequent materialized-READY read
    // PATCHES the cell values in place (never regenerates the table). The full rebuild runs only on the FIRST render
    // or on a structural state change (loading / error / not-calculated / fallback mode).
    if (_irRecoPatchSummaryCells(card, skuData)) return;
    card.innerHTML = '<h4 class="replen-card__title">Recommendation Summary</h4>' + _irRecoSummaryCardBody(skuData);
  });
}
// Returns true when it patched an existing fixed-schema table in place (materialized READY row present); false when
// a full (re)build is required. Only cell text/notes change — the 4-row structure + identities are untouched.
function _irRecoPatchSummaryCells(card, skuData) {
  if (!_irUseMaterializedGapRead()) return false;
  if (_irMatState.status !== 'READY' && _irMatState.status !== 'EMPTY') return false;
  var table = card.querySelector && card.querySelector('[data-ir-summary]');
  if (!table) return false;
  var row = (skuData && _irMatState.bySku[String(skuData.sku)]) || null;
  // F1-4B-FM5-R4UI-R5E §1 — patch cells in place even when this SKU has no stored row (not-calculated): set the
  // window cells to "—" + a user-safe Note. NEVER fall through to an innerHTML rebuild once the skeleton exists,
  // so the summary DOM/height stays stable after any data load.
  var line = row ? _irMatToLine(row)
    : { horizons: _IR_HORIZON_WINDOWS.map(function (w) { return { windowCode: w.code, gapQty: null, suggestedOrderQty: null, note: 'Not calculated' }; }) };
  var byWin = {}; line.horizons.forEach(function (h) { if (h && h.windowCode) byWin[h.windowCode] = h; });
  function setCell(attr, code, val) { var c = table.querySelector('[data-ir-' + attr + '-window="' + code + '"]'); if (c) c.textContent = val; }
  _IR_HORIZON_WINDOWS.forEach(function (w) {
    var h = byWin[w.code];
    setCell('gap', w.code, (h && h.gapQty != null) ? String(h.gapQty) : '—');
    setCell('suggested', w.code, (h && h.suggestedOrderQty != null) ? String(h.suggestedOrderQty) : '—');
    setCell('note', w.code, _irRecoHorizonNote_(h));
  });
  return true;
}
// F1-4B-FM3a: repaint the main-table Suggested Qty cells from the current recommendation state (numeric
// actionable total per SKU) once the scope result is available (live or from the session cache). No table
// re-render — patches only the .replen-suggested-cell content, so nothing else in the row is disturbed.
function _irRecoUpdateSuggestedCells() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  var rows = document.querySelectorAll('#ops-section .scroll-row[data-sku]');
  if (!rows || !rows.length) return;
  var data = (typeof getReplenishmentData === 'function') ? (getReplenishmentData() || []) : [];
  Array.prototype.forEach.call(rows, function (row) {
    var cell = row.querySelector('.replen-suggested-cell'); if (!cell) return;
    var sku = row.getAttribute('data-sku');
    var skuData = null; for (var i = 0; i < data.length; i++) { if (data[i].sku === sku) { skuData = data[i]; break; } }
    cell.innerHTML = _irSuggestedCellHtml(skuData || { sku: sku });
  });
}
// F1-4B-FM5-R4J-LIVE9V — the canonical Sales-Driven velocity (horizonBasis.avgSalesPerDay) arrives via the ASYNC
// recommendation.workspace.get, which completes AFTER the synchronous main-table render. renderReplenishment()
// computes the Avg Sales/day + Days of Supply cells from _irCanonicalSalesBasis_, so those cells stay on the weekly
// fallback until the table is re-rendered — and neither _irRecoRerenderSummaries (summary cards) nor
// _irRecoUpdateSuggestedCells (Suggested cell) touches the velocity cells. This performs ONE bounded re-render of
// the main table once a Sales-Driven canonical basis has actually loaded, so the displayed Avg Sales/day + Days of
// Supply align to the same authority as the D-horizon. Guarded (only when a sales_driven basis is present) so a
// Forecast-only scope never re-renders; renderReplenishment does NOT re-fire the workspace read (no loop), and the
// scope read is deduped so this runs once per scope. NO recompute here — renderReplenishment is the sole owner.
function _irRecoHasSalesDrivenBasis_() {
  var by = _irRecoState && _irRecoState.linesBySku; if (!by) return false;
  for (var sku in by) { if (!by.hasOwnProperty(sku)) continue; var ls = by[sku] || [];
    for (var i = 0; i < ls.length; i++) { var b = ls[i] && ls[i].horizonBasis; if (b && b.demandMode === 'sales_driven' && b.avgSalesPerDay != null) return true; } }
  return false;
}
function _irRecoRefreshVelocityCells_() {
  if (_irRecoState && _irRecoState.status === 'READY' && _irRecoHasSalesDrivenBasis_() && typeof renderReplenishment === 'function') renderReplenishment();
}
// __IRRECO_END__ (test extraction marker — do not remove)

window._irRecommendationWorkspaceEnabled = _irRecommendationWorkspaceEnabled;
window.loadRecommendationWorkspace_ = loadRecommendationWorkspace_;
window._irRecoSummaryCardBody = _irRecoSummaryCardBody;
window.invalidateRecommendationSessionCache = invalidateRecommendationSessionCache;

// ============================================================================
// Toolbar "More Options" dropdown (renamed 2026-07-23) — UI-only consolidation of the five data-management buttons
// (Add / Import / Edit / Delete SKU, Add Marketplace). Each item calls the EXISTING handler verbatim
// (no second flow); the menu just opens/closes accessibly. No business logic / payload / handler change.
// ============================================================================
var _replenActionsBound = false;
function _replenActionsEls() {
    return {
        menu: document.getElementById('replenActionsMenu'),
        trigger: document.getElementById('replenActionsTrigger'),
        list: document.getElementById('replenActionsList')
    };
}
function _replenActionsItems() {
    var e = _replenActionsEls();
    if (!e.list) return [];
    return Array.prototype.slice.call(e.list.querySelectorAll('.replen-actions-menu__item'))
        .filter(function (b) { return !b.disabled; });
}
function _replenActionsOpen() {
    var e = _replenActionsEls();
    if (!e.list || !e.trigger || !e.list.hidden) return;
    e.list.hidden = false;
    e.trigger.setAttribute('aria-expanded', 'true');
    if (e.menu) e.menu.classList.add('is-open');
    _replenBindActionsMenuGlobal();
    var first = _replenActionsItems()[0];
    if (first) first.focus();
}
function _replenActionsClose(returnFocus) {
    var e = _replenActionsEls();
    if (!e.list || e.list.hidden) return;
    e.list.hidden = true;
    if (e.trigger) e.trigger.setAttribute('aria-expanded', 'false');
    if (e.menu) e.menu.classList.remove('is-open');
    if (returnFocus && e.trigger) e.trigger.focus();
}
// Click trigger → toggle. stopPropagation so the just-fired click doesn't hit the outside-click closer.
function toggleReplenActionsMenu(ev) {
    if (ev) { try { ev.stopPropagation(); } catch (_e) {} }
    var e = _replenActionsEls();
    if (!e.list) return;
    if (e.list.hidden) _replenActionsOpen(); else _replenActionsClose(false);
}
// Run one action = reuse the EXISTING handler verbatim, then close the menu. One item → one handler
// call (no double-trigger). Each handler keeps its own selection / validation / confirmation / modal.
function runReplenAction(kind) {
    _replenActionsClose(false);
    if (kind === 'add' && typeof openReplenAddSkuModal === 'function') return openReplenAddSkuModal();
    if (kind === 'import' && typeof openReplenImportModal === 'function') return openReplenImportModal();
    if (kind === 'edit' && typeof openEditSkuModal === 'function') return openEditSkuModal();
    if (kind === 'delete' && typeof handleDeleteSku === 'function') return handleDeleteSku();
    if (kind === 'marketplace' && typeof openAddMarketplaceModal === 'function') return openAddMarketplaceModal();
}
// Bind outside-click + keyboard once (guarded). Only acts while the menu is open.
function _replenBindActionsMenuGlobal() {
    if (_replenActionsBound) return;
    document.addEventListener('click', function (ev) {
        var e = _replenActionsEls();
        if (!e.list || e.list.hidden) return;
        if (ev.target && ev.target.closest && ev.target.closest('#replenActionsMenu')) return; // inside
        _replenActionsClose(false);
    });
    document.addEventListener('keydown', function (ev) {
        var e = _replenActionsEls();
        if (!e.list || e.list.hidden) return;
        var items = _replenActionsItems();
        if (!items.length) return;
        var idx = items.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); _replenActionsClose(true); }           // return focus to trigger
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); (items[(idx + 1) % items.length] || items[0]).focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); (items[(idx - 1 + items.length) % items.length] || items[items.length - 1]).focus(); }
        else if (ev.key === 'Home') { ev.preventDefault(); items[0].focus(); }
        else if (ev.key === 'End') { ev.preventDefault(); items[items.length - 1].focus(); }
        else if (ev.key === 'Tab') { _replenActionsClose(false); }                              // let focus leave naturally
    });
    _replenActionsBound = true;
}
window.toggleReplenActionsMenu = toggleReplenActionsMenu;
window.runReplenAction = runReplenAction;

// ============================================================================
// F1-UI-RUNTIME-CLOSURE-R1 — "AI Support" dropdown (AI Plan + Recalculate Current Scope + Recalculate All Sites).
// UI-only relocation out of the main toolbar. Each item REUSES the existing handler verbatim (no second gap engine,
// no duplicate recommendation engine). Same accessible open/close pattern as More Options; the existing outside-click
// closers mean opening one menu closes the other (one-at-a-time). Recalculate Current Scope uses the LIVE10 scoped
// gap-job wrapper (recalcInventoryGapCurrentScope → CURRENT_SCOPE payload), so scoped recalc IS backend-supported.
// ============================================================================
var _replenAiSupportBound = false;
function _replenAiEls() {
    return { menu: document.getElementById('replenAiSupportMenu'), trigger: document.getElementById('replenAiSupportTrigger'), list: document.getElementById('replenAiSupportList') };
}
function _replenAiItems() {
    var e = _replenAiEls();
    if (!e.list) return [];
    return Array.prototype.slice.call(e.list.querySelectorAll('.km-action-menu__item')).filter(function (b) { return !b.disabled; });
}
function _replenAiOpen() {
    var e = _replenAiEls();
    if (!e.list || !e.trigger || !e.list.hidden) return;
    e.list.hidden = false; e.trigger.setAttribute('aria-expanded', 'true'); if (e.menu) e.menu.classList.add('is-open');
    _replenBindAiSupportGlobal();
    var first = _replenAiItems()[0]; if (first) first.focus();
}
function _replenAiClose(returnFocus) {
    var e = _replenAiEls();
    if (!e.list || e.list.hidden) return;
    e.list.hidden = true; if (e.trigger) e.trigger.setAttribute('aria-expanded', 'false'); if (e.menu) e.menu.classList.remove('is-open');
    if (returnFocus && e.trigger) e.trigger.focus();
}
function toggleReplenAiSupportMenu(ev) {
    if (ev) { try { ev.stopPropagation(); } catch (_e) {} }
    var e = _replenAiEls(); if (!e.list) return;
    if (e.list.hidden) _replenAiOpen(); else _replenAiClose(false);
}
// One item → one existing handler (no duplicated calculation logic). Close first so a backend job's button-state
// updates land on the (now-hidden) menu item without holding the menu open.
// F1-AI-SUPPORT-SCOPE-R1: "AI Plan" and "Recalculate Current Scope" now open the shared scope-selection modal so
// the user picks a CONCRETE Country / Marketplace before running; on Confirm they delegate to the SAME existing
// handlers (no new route/engine). "Recalculate All Sites" is unchanged (runs directly against the all-sites job).
function runReplenAiSupport(kind) {
    _replenAiClose(false);
    if (kind === 'aiplan') return _openReplenScopeModal('aiplan');
    if (kind === 'recalcScope') return _openReplenScopeModal('recalc');
    if (kind === 'recalcAll' && typeof handleRecalcAllInventoryGap === 'function') return handleRecalcAllInventoryGap();
}
// Prefill the modal from the current toolbar scope (DOM-held). The Marketplace select value is a marketplace_id
// on the live path; "All"/blank is left unselected (never silently treated as a concrete current scope — §6).
function _irScopeModalPrefill_() {
    var c = document.getElementById('replenCountry');
    var m = document.getElementById('replenMarketplace');
    return { country: (c && c.value) ? String(c.value) : '', marketplaceId: (m && m.value) ? String(m.value) : '' };
}
function _openReplenScopeModal(action) {
    if (!(window.KM && window.KM.scopeModal && typeof window.KM.scopeModal.open === 'function')) {
        // Graceful fallback if the shared modal is unavailable: use the argument-less current-on-screen scope path.
        if (action === 'aiplan' && typeof handleReplenAiPlan === 'function') return handleReplenAiPlan();
        if (action === 'recalc' && typeof recalcInventoryGapCurrentScope === 'function') return recalcInventoryGapCurrentScope();
        return;
    }
    window.KM.scopeModal.open({
        title: 'AI Support — Inventory',
        subtitle: action === 'aiplan' ? 'Select the scope for AI Plan' : 'Select the scope to recalculate',
        prefill: _irScopeModalPrefill_(),
        onConfirm: function (scope) {
            if (action === 'aiplan') {
                if (typeof handleReplenAiPlan === 'function') handleReplenAiPlan(scope);
            } else {
                // EXISTING CURRENT_SCOPE gap job (LIVE10 contract) — one site scope = one existing job. No new route.
                if (typeof handleRecalcAllInventoryGap === 'function') {
                    handleRecalcAllInventoryGap({ mode: 'CURRENT_SCOPE', company: scope.company, country: scope.country, marketplace: scope.marketplace });
                }
            }
        }
    });
}
function _replenBindAiSupportGlobal() {
    if (_replenAiSupportBound) return;
    document.addEventListener('click', function (ev) {
        var e = _replenAiEls();
        if (!e.list || e.list.hidden) return;
        if (ev.target && ev.target.closest && ev.target.closest('#replenAiSupportMenu')) return;
        _replenAiClose(false);
    });
    document.addEventListener('keydown', function (ev) {
        var e = _replenAiEls();
        if (!e.list || e.list.hidden) return;
        var items = _replenAiItems(); if (!items.length) return;
        var idx = items.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); _replenAiClose(true); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); (items[(idx + 1) % items.length] || items[0]).focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); (items[(idx - 1 + items.length) % items.length] || items[items.length - 1]).focus(); }
        else if (ev.key === 'Home') { ev.preventDefault(); items[0].focus(); }
        else if (ev.key === 'End') { ev.preventDefault(); items[items.length - 1].focus(); }
        else if (ev.key === 'Tab') { _replenAiClose(false); }
    });
    _replenAiSupportBound = true;
}
window.toggleReplenAiSupportMenu = toggleReplenAiSupportMenu;
window.runReplenAiSupport = runReplenAiSupport;

window.debugInventoryDemoData = function() {
    var enabled = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    console.log('=== Inventory Demo Data Debug ===');
    console.log('Demo enabled:', enabled);
    if (!enabled) { console.log('Demo mode is OFF. Use setDemoDataMode(true) to enable.'); return; }
    var rows = window.KM.DemoData.getInventoryRows({});
    console.log('DemoData inventory rows:', rows.length);
    var mapped = _getDemoReplenishmentData();
    console.log('Mapped replenishment rows:', mapped.length);
    console.log('--- First 5 demo rows ---');
    console.table(rows.slice(0, 5));
    console.log('--- First 10 mapped rows ---');
    console.table(mapped.slice(0, 10));
};

// ========================================
// Lifecycle 註冊
// ========================================
// Ensure the Inventory Replenishment markup is present before initialization runs.
// Idempotent: if #ops-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureInventoryReplenishmentMarkup() {
    if (document.getElementById('ops-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('inventory-replenishment', 'assets/html/pages/inventory-replenishment.html', '#inventory-replenishment-mount')
            .then(function() {
                if (!document.getElementById('ops-section')) {
                    console.warn('[Replenishment] partial loaded but #ops-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[Replenishment] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[Replenishment] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

// KM Sticky Header Framework binding for the Inventory Replenishment main table.
// The sticky control panel (.replen-control-panel) sits above the main table's two-layer header;
// its height varies (it wraps taller on small screens), so we measure it live and write
// --km-sticky-top-base onto #opsSection. The main table header (.table-header-bar) pins at that
// variable — replacing the old hard-coded top:72px that let the taller/wrapping panel cover the
// Current Stock / On the Way / Avg. Sales/day row. Reusable helper: KM.stickyHeader (core).
var _replenStickyHeaderHandle = null;
var _replenCatRailRO = null;
var _replenCatRailResizeHandler = null;
function _bindReplenStickyHeader() {
    if (!(window.KM && window.KM.stickyHeader && window.KM.stickyHeader.bindToolbar)) return;
    var root = document.getElementById('opsSection');            // .page-inventory (var scope)
    var toolbar = document.querySelector('#ops-section .replen-control-panel');
    if (!root || !toolbar) return;
    if (_replenStickyHeaderHandle && _replenStickyHeaderHandle.destroy) {
        _replenStickyHeaderHandle.destroy();
    }
    _replenStickyHeaderHandle = window.KM.stickyHeader.bindToolbar(root, toolbar);

    // Category rail is sticky just below the control panel; the main table header must pin a further
    // "category-rail height" down so the rail is never covered. Measure the rail's live height into
    // --km-replen-cat-rail-h (derived offset — NOT a hard-coded magic number). Re-measure on resize.
    var shell = document.querySelector('#ops-section .replen-category-shell');
    var measureCatRail = function () {
        var h = (shell && shell.getBoundingClientRect) ? Math.ceil(shell.getBoundingClientRect().height) : 0;
        root.style.setProperty('--km-replen-cat-rail-h', h + 'px');
    };
    measureCatRail();
    try { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(measureCatRail); } catch (e) {}
    if (_replenCatRailRO && _replenCatRailRO.disconnect) { try { _replenCatRailRO.disconnect(); } catch (e) {} _replenCatRailRO = null; }
    if (window.ResizeObserver && shell) {
        try { _replenCatRailRO = new ResizeObserver(measureCatRail); _replenCatRailRO.observe(shell); } catch (e) { _replenCatRailRO = null; }
    }
    if (_replenCatRailResizeHandler) window.removeEventListener('resize', _replenCatRailResizeHandler);
    _replenCatRailResizeHandler = measureCatRail;
    window.addEventListener('resize', _replenCatRailResizeHandler);
}

// One-time wiring of the modal-overlay close listener + overview scroll sync. These bind plain
// (non-cloneNode) listeners, so they must run EXACTLY once. Markup is partial-loaded (Phase 3-12),
// so this is a safe no-op until #ops-section exists; mount calls it again once the partial is present.
var _invReplenStaticInitDone = false;
function _inventoryReplenStaticInit() {
    if (_invReplenStaticInitDone) return;
    if (!document.getElementById('ops-section')) return;
    var overlay = document.getElementById('replen-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeReplenModal();
            closeAddMarketplaceModal();
            closeEditSkuModal();
            closeReplenImportModal();
        });
    }
    _invReplenStaticInitDone = true;
}

if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('ops-section', {
        mount() {
            console.log('[Replenishment] mount');
            // Migration compat: sweep any stale body-level Allocation Draft panel created by previously-loaded
            // (pre-fix) code before this page (re)owns it inside its own root.
            _removeLegacyBodyAllocPanel();
            // Markup is partial-loaded (Phase 3-12). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open), wire the once-only
            // listeners, and run the existing initialization unchanged.
            _ensureInventoryReplenishmentMarkup().then(function() {
                var sec = document.getElementById('ops-section');
                if (sec) sec.classList.add('active');
                _inventoryReplenStaticInit();
                // KM Sticky Header Framework: drive --km-sticky-top-base from the sticky control
                // panel's LIVE height (it wraps taller on small screens), so the main table's
                // two-layer header pins right below it instead of being covered (hard-coded top:72px bug).
                _bindReplenStickyHeader();
                // Recovery: restore the Shipping Allocation Working Draft from sessionStorage (live
                // JS State). It is applied per-SKU only when the active Country/Marketplace context
                // matches the stored context (see _allocationDraftRowsFor); otherwise it stays dormant.
                _restoreAllocationDraftFromSession();
                if (typeof bindReplenFilterDependencies === 'function') bindReplenFilterDependencies();
                if (typeof populateReplenFiltersFromRegistry === 'function') populateReplenFiltersFromRegistry();
                // F1-4B-B-PRE: initialize the page-local Recommendation Context inputs (destination /
                // calculation month / planning cycle). Populates options + restores explicit session
                // selections + refreshes the readiness indicator. Does NOT call the Recommendation API.
                if (typeof initReplenRecoContext === 'function') initReplenRecoContext();
                renderReplenishment();
                // F1-4B-FM5-R4UI-R5G §1 — bind the (event-driven) horizontal-scrollbar gutter measurement + seed it.
                if (typeof _irBindHScrollGutterResizeOnce_ === 'function') _irBindHScrollGutterResizeOnce_();
                if (typeof _irUpdateHScrollGutter_ === 'function') _irUpdateHScrollGutter_();
                // F1-4B-FM5-R4J §13 — if a backend Inventory gap job is still PENDING/RUNNING (started here before a
                // refresh, or from another tab / the daily scheduler), resume READ-ONLY status polling and refresh on
                // DONE. The original tab does not need to have stayed alive.
                if (typeof _irResumeGapJobOnMount_ === 'function') { try { _irResumeGapJobOnMount_(); } catch (e) {} }
            });
        },
        unmount() {
            console.log('[Replenishment] unmount');
            // Allocation Draft persistence panel is page-owned — drop its DOM node so it never lingers in layout on
            // other pages (the controller state in _allocWorkspace is retained; re-entering Inventory re-renders it
            // in-page). Also sweep any legacy body-level node.
            var _allocPanel = document.getElementById('alloc-draft-persistence-panel');
            if (_allocPanel && _allocPanel.remove) _allocPanel.remove();
            _removeLegacyBodyAllocPanel();
            // Release the sticky-header toolbar observer (ResizeObserver + resize listener).
            if (_replenStickyHeaderHandle && _replenStickyHeaderHandle.destroy) {
                _replenStickyHeaderHandle.destroy();
                _replenStickyHeaderHandle = null;
            }
            // Release the category-rail height observer (sticky offset for the table header).
            if (_replenCatRailRO && _replenCatRailRO.disconnect) { try { _replenCatRailRO.disconnect(); } catch (e) {} _replenCatRailRO = null; }
            if (_replenCatRailResizeHandler) { window.removeEventListener('resize', _replenCatRailResizeHandler); _replenCatRailResizeHandler = null; }
            // 清理展開面板中的 Chart.js 實例
            var expandPanels = document.querySelectorAll('#ops-section .replen-expand-panel');
            expandPanels.forEach(function(panel) { panel.remove(); });
            currentExpandedRow = null;
            // 清理 scroll sync
            var scrollCol = document.querySelector('#ops-section .scroll-col');
            if (scrollCol && scrollCol._syncHandler) {
                scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
            }
            // F1-4B-B: invalidate any in-flight Recommendation Workspace request (bump seq + abort the
            // browser response) and reset the read state so it never applies to a later mount.
            if (typeof _irRecoInvalidate === 'function') _irRecoInvalidate('DISABLED');
        }
    });
}
