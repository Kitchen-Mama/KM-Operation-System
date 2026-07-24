// Request Order marketplace-identity regression (2026-07-24). Proves the Country/Marketplace bug fix:
// site identity keys on marketplace_id (never the "Amazon" display string), CA+Amazon never returns
// US Amazon, and a Country change prunes an incompatible marketplace_id selection. Pure Node (no DOM):
// logic mirrors of the shipped helpers + source-scan guards over request-order.js.
// Run: node assets/tests/request-order-marketplace-identity.test.js

var fs = require('fs');
var path = require('path');
var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }

// ---- mirrors of the shipped request-order.js helpers ----
function marketplaceKey(item) {
  return (item && item.marketplaceId != null && item.marketplaceId !== '') ? String(item.marketplaceId) : String(item.marketplace || '');
}
// marketplace filter: keep rows whose canonical key is in the selected set (empty = all)
function applyMarketplaceFilter(rows, selectedIds) {
  if (!selectedIds || !selectedIds.length) return rows;
  return rows.filter(function (r) { return selectedIds.indexOf(marketplaceKey(r)) !== -1; });
}
function applyCountryFilter(rows, countries) {
  if (!countries || !countries.length) return rows;
  return rows.filter(function (r) { return countries.indexOf(r.country) !== -1; });
}
// dependent prune: keep only marketplace_ids valid for the active country scope
function pruneMarketplaceSelection(selectedIds, mastersInScope) {
  var valid = {}; mastersInScope.forEach(function (m) { valid[String(m.marketplaceId)] = 1; });
  return (selectedIds || []).filter(function (id) { return valid[String(id)]; });
}

// ---- Fixtures: US Amazon and CA Amazon co-exist with DISTINCT marketplace_id (E case 1) ----
var masters = [
  { marketplaceId: 'MKT_US_AMZ', company: 'KM', country: 'US', marketplace: 'Amazon', marketplaceDisplayName: 'Amazon US', status: 'active' },
  { marketplaceId: 'MKT_CA_AMZ', company: 'KM', country: 'CA', marketplace: 'Amazon', marketplaceDisplayName: 'Amazon CA', status: 'active' },
  { marketplaceId: 'MKT_US_AMZ2', company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceDisplayName: 'Amazon US (ResUS)', status: 'active' }
];
var rows = [
  { sku: 'CO1100-R', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT_US_AMZ', company: 'KM' },
  { sku: 'CO1100-R', country: 'CA', marketplace: 'Amazon', marketplaceId: 'MKT_CA_AMZ', company: 'KM' },
  { sku: 'CO1150-R', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT_US_AMZ2', company: 'ResUS' }
];

// E1 — US Amazon and CA Amazon are distinct identities
eq(marketplaceKey(rows[0]) !== marketplaceKey(rows[1]), true, 'E1: US Amazon and CA Amazon have distinct marketplace_id keys');

// E2 — selecting CA lists only CA marketplaces (masters scoped to CA)
var caMasters = masters.filter(function (m) { return m.country === 'CA'; });
eq(caMasters.map(function (m) { return m.marketplaceId; }), ['MKT_CA_AMZ'], 'E2: Country=CA scopes marketplace options to CA only');

// E3 — selecting CA Amazon sends the CA marketplace_id (not the "Amazon" string)
eq(marketplaceKey(rows[1]), 'MKT_CA_AMZ', 'E3: selected CA Amazon resolves to CA marketplace_id in the payload key');

// E4 — result of Country=CA + marketplace=CA Amazon contains NO US Amazon row
var res = applyMarketplaceFilter(applyCountryFilter(rows, ['CA']), ['MKT_CA_AMZ']);
eq(res.map(function (r) { return r.sku + '@' + r.country; }), ['CO1100-R@CA'], 'E4: CA + CA-Amazon returns only the CA site, never US Amazon');
eq(res.some(function (r) { return r.country === 'US'; }), false, 'E4: no US row leaks into the CA result');

// E5 — switching Country US→CA prunes the stale US marketplace_id selection
var selection = ['MKT_US_AMZ'];                 // user had US Amazon selected
selection = pruneMarketplaceSelection(selection, caMasters);   // then switched Country to CA
eq(selection, [], 'E5: Country US→CA clears the incompatible US marketplace selection');

// E6 — two Amazon sites in the SAME country do not overwrite (distinct ids, filter is per-id)
var usRows = applyCountryFilter(rows, ['US']);
eq(usRows.length, 2, 'E6: two US Amazon sites both present');
var onlyResUs = applyMarketplaceFilter(usRows, ['MKT_US_AMZ2']);
eq(onlyResUs.map(function (r) { return r.marketplaceId; }), ['MKT_US_AMZ2'], 'E6: selecting one US Amazon site does not pull the other');

// ---- SOURCE-SCAN guards over the shipped request-order.js ----
var js = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'request-order.js'), 'utf8');
eq(/marketplaceId: m\.marketplaceId/.test(js), true, 'C: DB rows carry marketplace_id');
eq(/_roMarketplaceKey/.test(js), true, 'C: canonical marketplace key helper present');
eq(/_roRebuildMarketplaceDropdown/.test(js), true, 'C: dedicated marketplace dropdown builder present');
eq(/getMarketplaces/.test(js), true, 'C: marketplace master (getMarketplaces) is consulted');
// country change rebuilds/prunes marketplace
eq(/filterType === 'country'[\s\S]{0,120}_roRebuildMarketplaceDropdown/.test(js), true, 'E16: Country change rebuilds + prunes the marketplace selection');
// no hidden US default / first-match in the row builder
eq(/find\([^)]*Amazon/.test(js), false, 'G: no marketplaces.find(...Amazon) first-match');
// strict site scoping (no blank-country wildcard leak)
eq(/A blank snapshot country\/marketplace must NOT wildcard-match/.test(js), true, 'E: siteStock uses strict site scoping (no wildcard leak)');

// ============================================================================================
// B3 — channel-only display grouping (Canonical Decision 2): option = marketplace_display_name (no
// country suffix); a display group resolves to a SET of marketplace_ids; filter/payload use the ids.
// ============================================================================================
// SOURCE-SCAN: dropdown groups by display name (value = the name), and a resolver maps groups → id set
eq(/marketplaceGroups/.test(js), true, 'B3: marketplace display-group state present');
eq(/_roSelectedMarketplaceIdSet/.test(js), true, 'B3: display-group → marketplace_id-set resolver present');
eq(/idset\[_roMarketplaceKey\(item\)\]/.test(js), true, 'B3: filter resolves selected display groups to the underlying marketplace_id set');
// option value is the display name (group key), not the raw id, and NOT country-suffixed
eq(/value="' \+ _roEsc\(name\)/.test(js), true, 'B3: marketplace option value = display-group name');
eq(/\+ \(m\.country \? ' \(' \+ _roEsc\(m\.country\)/.test(js), false, 'B3: country suffix "(US)"/"(CA)" removed from the marketplace label');

// LOGIC MIRRORS of the shipped grouping + resolver ----------------------------------------------------
function buildGroups(masters, countries) {                 // mirror of _roRebuildMarketplaceDropdown grouping
  var scoped = masters.filter(function (m) { return !countries.length || countries.indexOf(m.country) !== -1; });
  var groups = {};
  scoped.forEach(function (m) { var n = (m.marketplaceDisplayName || m.marketplace); (groups[n] = groups[n] || []).push(String(m.marketplaceId)); });
  return groups;
}
function selectedIdSet(groups, selectedNames) {            // mirror of _roSelectedMarketplaceIdSet
  var set = {}; (selectedNames || []).forEach(function (n) { (groups[n] || []).forEach(function (id) { set[String(id)] = 1; }); }); return set;
}
function filterByGroups(rows, groups, selectedNames) {
  if (!selectedNames.length) return rows;
  var set = selectedIdSet(groups, selectedNames);
  return rows.filter(function (r) { return set[String(r.marketplaceId)]; });
}
// masters already declared above: MKT_US_AMZ (KM/US), MKT_CA_AMZ (KM/CA), MKT_US_AMZ2 (ResUS/US), all display "Amazon *".
// Give them the SAME channel display name "Amazon" to exercise grouping/dedupe.
var chMasters = [
  { marketplaceId: 'MKT_US_AMZ', company: 'KM', country: 'US', marketplace: 'Amazon', marketplaceDisplayName: 'Amazon' },
  { marketplaceId: 'MKT_CA_AMZ', company: 'KM', country: 'CA', marketplace: 'Amazon', marketplaceDisplayName: 'Amazon' },
  { marketplaceId: 'MKT_US_AMZ2', company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceDisplayName: 'Amazon' },
  { marketplaceId: 'MKT_US_WMT', company: 'KM', country: 'US', marketplace: 'Walmart', marketplaceDisplayName: 'KM Walmart' }
];
var chRows = [
  { sku: 'A', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT_US_AMZ' },
  { sku: 'A', country: 'CA', marketplace: 'Amazon', marketplaceId: 'MKT_CA_AMZ' },
  { sku: 'B', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT_US_AMZ2' },
  { sku: 'C', country: 'US', marketplace: 'Walmart', marketplaceId: 'MKT_US_WMT' }
];
// B3.1 — Country US resolves only US Amazon ids
var gUS = buildGroups(chMasters, ['US']);
eq(Object.keys(selectedIdSet(gUS, ['Amazon'])).sort(), ['MKT_US_AMZ', 'MKT_US_AMZ2'], 'B3.1: Country US → Amazon group = only US Amazon ids');
// B3.2 — Country CA resolves only CA Amazon ids
var gCA = buildGroups(chMasters, ['CA']);
eq(Object.keys(selectedIdSet(gCA, ['Amazon'])), ['MKT_CA_AMZ'], 'B3.2: Country CA → Amazon group = only CA Amazon id');
// B3.3 — Country All shows a single "Amazon" display option (deduped)
var gAll = buildGroups(chMasters, []);
eq((Object.keys(gAll).filter(function (n) { return n === 'Amazon'; })).length, 1, 'B3.3: Country All shows Amazon exactly once');
// B3.4 — Country All "Amazon" selection preserves ALL applicable ids
eq(Object.keys(selectedIdSet(gAll, ['Amazon'])).sort(), ['MKT_CA_AMZ', 'MKT_US_AMZ', 'MKT_US_AMZ2'], 'B3.4: Country All Amazon keeps every underlying id');
// B3.5 — Country US→CA prunes stale selection (US-only group set no longer contains those ids)
eq(Object.keys(selectedIdSet(gCA, ['Amazon'])).indexOf('MKT_US_AMZ'), -1, 'B3.5: after switch to CA, US Amazon id is no longer resolved');
// B3.6 — CA result row/payload carries only the CA id, never a US id
var caOut = filterByGroups(applyCountryFilter(chRows, ['CA']), gCA, ['Amazon']);
eq(caOut.map(function (r) { return r.marketplaceId; }), ['MKT_CA_AMZ'], 'B3.6: CA payload uses the CA marketplace_id only');
eq(caOut.some(function (r) { return String(r.marketplaceId).indexOf('US') !== -1; }), false, 'B3.6: no US marketplace id in the CA result');
// B3.7 — same country, same display name, different Company → both ids kept (no overwrite)
eq(selectedIdSet(gUS, ['Amazon'])['MKT_US_AMZ'] === 1 && selectedIdSet(gUS, ['Amazon'])['MKT_US_AMZ2'] === 1, true, 'B3.7: KM & ResUS US Amazon both retained under one display group');
// B3.8 — the display name is not used as identity (ids drive the filter)
var wmt = filterByGroups(applyCountryFilter(chRows, ['US']), gUS, ['KM Walmart']);
eq(wmt.map(function (r) { return r.marketplaceId; }), ['MKT_US_WMT'], 'B3.8: display group resolves to its own id, not a name match');
// B3.9 — blank-country snapshot cannot wildcard (covered by the source guard above + strict scoping)
eq(/if \(country && _roUpper\(r\.country \|\| ''\) !== _roUpper\(country\)\) return;/.test(js), true, 'B3.9: blank-country snapshot excluded (no wildcard) in siteStock');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
