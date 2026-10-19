// Kitchen Mama Operation System - S8-B3-R3-CP2T-R1 helper
// THE Asia/Taipei PROBE for campaign-event-date-passing-s8-b3-r3-cp2t-r1.test.js
//
// Run (the suite does this): TZ=Asia/Taipei node assets/tests/_cp2t-r1-tz-probe.js
//
// WHY A CHILD PROCESS. The defect this guards against is a UTC slice of a local-midnight Date: in a +08:00
// zone, new Date(2026, 8, 5) is 2026-09-04T16:00:00Z, so toISOString().slice(0, 10) reports the FOURTH.
// On a UTC runner the trap does not exist, so an in-process assertion would pass while proving nothing.
// Node reads TZ at startup, so the zone has to be set for a whole process - hence this file.
//
// It prints ONE line of JSON and asserts nothing. The suite owns the verdicts.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var RECO = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8').replace(/\r\n/g, '\n');
var KMCALC = require(path.join(ROOT, 'assets/js/core/supply-planning-calculations.js'));
var box = { console: console, KMCALC: KMCALC };
var ctx = vm.createContext(box);
vm.runInContext(RECO, ctx);

var SKU = 'CO1150-AG';
var COMPANY = 'Kitchen Mama';
var SCOPE = { company: COMPANY, country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-1' };
var LOCAL_MIDNIGHT = new Date(2026, 8, 5);              // 2026-09-05 00:00 local
var LOCAL_LATE = new Date(2026, 8, 5, 23, 30, 0);       // 2026-09-05 23:30 local

function snap(headers, rows) { return { headers: headers, rows: rows }; }
box.__s = { snapshots: {
  campaigns: snap(['campaign_id', 'status', 'start_date', 'end_date'], [['CMP-1', 'active', LOCAL_MIDNIGHT, LOCAL_MIDNIGHT]]),
  campaignSkuLines: snap(['campaign_id', 'marketplace_sku_id', 'sku'], [['CMP-1', 'MSKU-1', SKU]]),
  fcSpecialEvents: snap(['sku', 'status', 'marketplace_id', 'company', 'country', 'marketplace', 'event_start_date', 'event_end_date'],
    [[SKU, 'active', 'MKT-1', COMPANY, 'US', 'Amazon', LOCAL_MIDNIGHT, LOCAL_MIDNIGHT]])
} };
var facts = vm.runInContext('recoWsBuildContaminationFacts_(__s, ' + JSON.stringify(SCOPE) + ', '
  + JSON.stringify(SKU) + ', "MSKU-1")', ctx);

// The module-level normaliser, by name. Absent in the build this round repairs, which is the point: the
// coercion existed only inside recoWsResolveSalesRate_, where the campaign marshaller could not reach it.
box.__d = LOCAL_MIDNIGHT;
box.__l = LOCAL_LATE;
var hasYmd = vm.runInContext('typeof recoWsYmd_ === "function"', ctx);

process.stdout.write(JSON.stringify({
  offsetMinutes: LOCAL_MIDNIGHT.getTimezoneOffset(),
  toISO: LOCAL_MIDNIGHT.toISOString().slice(0, 10),
  ymd: hasYmd ? vm.runInContext('recoWsYmd_(__d)', ctx) : 'NO_MODULE_LEVEL_NORMALISER',
  lateYmd: hasYmd ? vm.runInContext('recoWsYmd_(__l)', ctx) : 'NO_MODULE_LEVEL_NORMALISER',
  campaignStart: (facts.campaigns[0] || {}).start || null,
  eventStart: (facts.events[0] || {}).start || null
}) + '\n');
