// Carrier Rate Card — filter fixes regression test (pure Node, no DOM).
// Covers task section F: F1 date-range contract, F2 country dropdown (data-derived, exact match),
// F5 carrier_id→carrier_name join with Unmapped fallback, F6 dependent/faceted reset logic.
// Combines small logic mirrors of assets/js/pages/carrier-rate-card.js with a CRLF-safe source scan
// of the 3 carrier files so the wiring can't silently regress.
// Run: node assets/tests/carrier-rate-card.test.js

var fs = require('fs');
var path = require('path');

var fail = 0;
function eq(a, e, label) {
    var A = JSON.stringify(a), E = JSON.stringify(e);
    if (A !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); }
    else console.log('ok   ' + label);
}
function ok(cond, label) { eq(!!cond, true, label); }

var js = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'carrier-rate-card.js'), 'utf8');
var html = fs.readFileSync(path.join(__dirname, '..', 'html', 'pages', 'carrier-rate-card.html'), 'utf8');
var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'pages', 'carrier-rate-card.css'), 'utf8');

// ============================================================
// Logic mirrors (kept in lock-step with carrier-rate-card.js)
// ============================================================
function fmt(d) {
    if (!d) return '';
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}
// F2 — distinct, trimmed, non-empty, UPPERCASE destinationCountry values (data-derived).
function distinctCountries(cards) {
    var seen = {}, list = [];
    cards.forEach(function (c) {
        var v = String(c.destinationCountry == null ? '' : c.destinationCountry).trim().toUpperCase();
        if (v && !seen[v]) { seen[v] = 1; list.push(v); }
    });
    list.sort();
    return list;
}
// F5 — carrier options: value = carrier_id, label = carrier_name via carrier_id join; Unmapped fallback.
function carrierOptions(rows, carriers) {
    var nameById = {};
    carriers.forEach(function (c) { if (c.carrierId) nameById[c.carrierId] = String(c.carrierName == null ? '' : c.carrierName).trim(); });
    var seen = {}, opts = [], warnings = [];
    rows.forEach(function (c) {
        var id = String(c.carrierId == null ? '' : c.carrierId).trim();
        if (!id || seen[id]) return;
        seen[id] = 1;
        var name = nameById[id];
        if (name) opts.push({ id: id, label: name });
        else { warnings.push(id); opts.push({ id: id, label: 'Unmapped Carrier (' + id + ')' }); }
    });
    opts.sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); });
    return { opts: opts, warnings: warnings };
}
// F6 — keep a selection only if it is still a valid option, else reset to "All" ('').
function keepOrReset(values, current) { return values.indexOf(current) !== -1 ? current : ''; }
// F1 — rate-card date-range overlap (inclusive; blank effectiveTo = open-ended).
function dateMatch(c, start, end) {
    if (!start && !end) return true;
    var ef = c.effectiveFrom || '', et = c.effectiveTo || '';
    if (start && et && et < start) return false;
    if (end && ef && ef > end) return false;
    return true;
}

// ============================================================
// Sample data
// ============================================================
var CARDS = [
    { carrierId: 'C1', destinationCountry: 'US', shippingMethod: 'Sea', lastMileDelivery: 'parcel', effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' },
    { carrierId: 'C1', destinationCountry: 'us', shippingMethod: 'Air', lastMileDelivery: 'truck', effectiveFrom: '2026-05-01', effectiveTo: '' },
    { carrierId: 'C2', destinationCountry: 'CA', shippingMethod: 'Sea', lastMileDelivery: 'parcel', effectiveFrom: '2026-03-01', effectiveTo: '2026-12-31' },
    { carrierId: 'C9', destinationCountry: ' JP ', shippingMethod: 'Express', lastMileDelivery: '', effectiveFrom: '2026-02-01', effectiveTo: '' } // C9 has NO carriers-master row
];
var CARRIERS = [
    { carrierId: 'C1', carrierName: 'Ocean Star' },
    { carrierId: 'C2', carrierName: 'Maple Freight' }
    // C9 intentionally absent → Unmapped
];

// ---- F2: country options are data-derived + exact-match contract ----
eq(distinctCountries(CARDS), ['CA', 'JP', 'US'], 'F2: country options = distinct UPPERCASE destinationCountry (trimmed, deduped)');
ok(distinctCountries([]).length === 0, 'F2: no hard-coded fallback country list when data is empty');

// ---- F5: carrier_id value, carrier_name label, Unmapped fallback + warning ----
var carr = carrierOptions(CARDS, CARRIERS);
eq(carr.opts, [
    { id: 'C9', label: 'Unmapped Carrier (C9)' },  // sorts before "Maple"/"Ocean" ("U" > "M"/"O"? sort by label)
    { id: 'C2', label: 'Maple Freight' },
    { id: 'C1', label: 'Ocean Star' }
].sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); }), 'F5: value=carrier_id, label=carrier_name, each id once, Unmapped fallback');
eq(carr.warnings, ['C9'], 'F5: unmapped carrier_id (no master row) surfaces a mapping warning, card NOT hidden');
ok(carr.opts.some(function (o) { return o.id === 'C9'; }), 'F5: rate card with unmapped carrier_id still appears as an option');
ok(carr.opts.every(function (o) { return o.id !== o.label || o.label.indexOf('Unmapped') === 0; }), 'F5: no fabricated carrier name (raw id never used as a real label)');

// ---- F6: downstream reset when an upstream selection removes its options ----
// Country=US → methods present are Sea + Air. A previously-chosen "Express" (only under JP) must reset.
var usRows = CARDS.filter(function (c) { return String(c.destinationCountry).trim().toUpperCase() === 'US'; });
var usMethods = (function () { var s = {}, l = []; usRows.forEach(function (c) { var m = String(c.shippingMethod || '').trim(); if (m && !s[m]) { s[m] = 1; l.push(m); } }); l.sort(); return l; })();
eq(usMethods, ['Air', 'Sea'], 'F6: method facet under Country=US is data-derived from matching rows');
eq(keepOrReset(usMethods, 'Express'), '', 'F6: downstream "Express" resets to All when no longer valid under US');
eq(keepOrReset(usMethods, 'Sea'), 'Sea', 'F6: still-valid downstream selection is preserved');

// ---- F1: date-range overlap (inclusive both endpoints; open-ended effectiveTo) ----
eq(dateMatch({ effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' }, '2026-06-30', '2026-07-10'), true, 'F1: range touching effectiveTo overlaps (inclusive end)');
eq(dateMatch({ effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' }, '2026-07-01', '2026-07-10'), false, 'F1: range entirely after effectiveTo does not overlap');
eq(dateMatch({ effectiveFrom: '2026-08-01', effectiveTo: '' }, '2026-01-01', '2026-08-01'), true, 'F1: open-ended card overlaps a range reaching its effectiveFrom');
eq(dateMatch({ effectiveFrom: '2026-08-01', effectiveTo: '' }, '2026-01-01', '2026-07-31'), false, 'F1: card starting after the range end excluded');
eq(dateMatch({ effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' }, '', ''), true, 'F1: empty range = All dates (no date filtering)');
eq(fmt(new Date(2026, 0, 5)), '2026-01-05', 'F1: display format is zero-padded local YYYY-MM-DD');

// ============================================================
// Source-scan (CRLF-safe: match on the raw text with flexible whitespace)
// ============================================================
// F2 — Country is now a MULTI-SELECT checkbox filter (crcf-* checkbox dropdown, reusing the SKU Details
// template), not a <select> and not free-text. Search matches by membership of the selected code array.
ok(/class="crcf-multi"[^>]*data-filter="country"/.test(html) && /id="crcCountryList"/.test(html), 'F2: Country/Ship To is a crcf-multi checkbox filter (search + list)');
ok(!/<select[^>]*id="crcFilterCountry"/.test(html), 'F2: Country is no longer a <select> (converted to checkbox multi-select)');
ok(/f\.country\.indexOf\(up\(c\.destinationCountry\)\)\s*===\s*-1/.test(js), 'F2: search matches country by membership of the selected array (empty = All)');
ok(!/destinationCountry\)\.indexOf\(fCountry\)/.test(js), 'F2: old substring country match removed');
ok(/crcToggleFilterPanel/.test(html) && /crcOnFilterOptionSearch/.test(html) && /crcFilterSelectAll/.test(html) && /crcFilterClear/.test(html), 'F2: checkbox panels have search + Select All + Clear + toggle');

// F5 — mapping warning + unmapped label present, carrier_name never the join key.
ok(/\[CRC\]\s*mapping warning:/.test(js), 'F5: console.warn "[CRC] mapping warning:" present');
ok(/Unmapped Carrier \('/.test(js) || /Unmapped Carrier \(/.test(js), 'F5: "Unmapped Carrier (id)" label present');
ok(/nameById\[id\]/.test(js), 'F5: join is carrier_id → carrier name (id is the key)');

// F6 — facets rebuilt from upstream-matching rows; invalid downstream selections pruned; the four filters
// are checkbox multi-selects; carrier-scoped exports require exactly one carrier.
ok(/_crcRebuildFacets/.test(js), 'F6: faceted rebuild function present');
ok(/function crcOnFilterToggle/.test(js), 'F6: checkbox toggle rebuilds downstream facets');
ok(/function _crcPruneState/.test(js) && /crcFilterState\[kind\]\.filter/.test(js), 'F6: invalid downstream selections pruned to the current universe');
ok(/function _crcSingleCarrier/.test(js) && /crcFilterState\.carrier\.length\s*===\s*1/.test(js), 'F6: carrier-scoped export requires exactly one selected carrier');

// F1 — the date picker now REUSES the shared Shipment-Overview modal (#frDateModal) instead of a bespoke
// crc- modal (2026-07-28). The rate-card query (crcDateMatch), LOCAL YYYY-MM-DD formatting, the "All dates"
// label and Clear semantics are unchanged. Handlers bind the shared .fr-* controls via `.onclick=`.
ok(/onclick="crcOpenDateModal\(\)"/.test(html), 'F1: Date trigger opens the shared modal (crcOpenDateModal)');
ok(!/id="crcDateModal"/.test(html) && !/id="crcDateBackdrop"/.test(html), 'F1: self-contained crc- date modal markup removed');
ok(/id="crcDateClear"/.test(html) && /crcDateClear\(\)/.test(html), 'F1: Clear affordance present (resets to All dates)');
ok(/getElementById\('frDateModal'\)/.test(js) && /getElementById\('frDateBackdrop'\)/.test(js), 'F1: controllers drive the shared #frDateModal / #frDateBackdrop');
ok(/frStartDisplay/.test(js) && /frEndDisplay/.test(js) && /frCalendar/.test(js), 'F1: reuses the shared modal inputs + calendars (fr* ids)');
ok(/\.fr-preset-item/.test(js) && /\.fr-calendar-nav/.test(js), 'F1: binds the shared .fr-preset-item / .fr-calendar-nav controls');
ok(/last-60-days/.test(js) && /last-year/.test(js) && /last-month/.test(js), 'F1: full Shipment-Overview preset set handled (last-60-days / last-month / last-year)');
ok(/padStart\(2,\s*'0'\)/.test(js), 'F1: zero-padded LOCAL date parts (YYYY-MM-DD)');
ok(/crcDateState/.test(js), 'F1: own committed/temp crc- date state retained');
ok(/data-date="'\s*\+\s*crcFmt\(date\)/.test(js), 'F1: day cells use LOCAL crcFmt for data-date (off-by-one safe, no toISOString)');
ok(/temp\.start\s*=\s*end;[\s\S]{0,40}temp\.end\s*=\s*date;/.test(js), 'F1: day-click auto-swap keeps the range ordered');
ok(/crcDateState\.temp\.preset\s*=\s*null;/.test(js), 'F1: manual day click clears the active preset');
ok(/textContent\s*=\s*'All dates'/.test(js), 'F1: "All dates" label preserved');
ok(/\.crc-date-clear/.test(css), 'F1: toolbar Clear affordance styled (scoped crc- CSS)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
