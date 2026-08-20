// Kitchen Mama Operation System — F1-7N-TW-FACTORY-OPERATIONAL-CONFIG-R1
// Two temporary Phase-1 TW-factory OPERATIONAL POLICY booleans (New SKU Participation, General Allocation) persisted
// in the KM_FACTORY_OPERATION_CONFIG Script-Property blob (owner 62_api_v1_factory_operation_config.gs), NOT a Sheet
// tab. Missing config → BOTH false. Save writes ONLY the config blob (no inventory mutation). Canonical policy
// resolvers are the seams the monthly runtime / scheduler / future SKU-init runtime read. Backend + UX + readback.
// Run: node assets/tests/factory-operation-config-tw-f1-7n-r1.test.js
// NO 'use strict' — extracted pure fns eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}
function section(n) { console.log('\n== ' + n + ' =='); }

var FOC = read('specs/active/apps-script/62_api_v1_factory_operation_config.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var FS_JS = read('js/pages/factory-stock.js');
var FS_HTML = read('html/pages/factory-stock.html');

// ---- constants + pure fns from 62_ ------------------------------------------------------------------------------
var FACTORY_OPERATION_CONFIG_VERSION_ = 1;
var FACTORY_OP_TW_RESTRICTED_SCOPE_ = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
eval(extractFn(FOC, 'facOpStr_'));
eval(extractFn(FOC, 'facOpBool_'));
eval(extractFn(FOC, 'factoryOperationParseConfig_'));
eval(extractFn(FOC, 'factoryOperationSerializeConfig_'));
eval(extractFn(FOC, 'factoryOperationApplyPayload_'));
eval(extractFn(FOC, 'factoryOpTwNewSkuParticipationEnabled_'));
eval(extractFn(FOC, 'factoryOpTwGeneralAllocationEnabled_'));
eval(extractFn(FOC, 'factoryOpTwAutoInitOnNewSku_'));
eval(extractFn(FOC, 'factoryOpTwInGeneralAllocationPool_'));
eval(extractFn(FOC, 'factoryOpTwPlanningScope_'));

// ---- handler eval with stubbed globals + injectable in-memory IO ------------------------------------------------
global.jsonResponse_ = function (x) { return x; };
global.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
eval(extractFn(FOC, 'handleFactoryOperationConfigGet_'));
eval(extractFn(FOC, 'handleFactoryOperationConfigSave_'));
function makeIo() { var s = { v: null }; return { getConfig: function () { return s.v; }, setConfig: function (v) { s.v = v; }, stamp: function () { return '2026-08-20'; }, _s: s }; }

// =================================================================================================================
section('A. config absent → both false');
var cfgAbsent = factoryOperationParseConfig_(null);
eq([cfgAbsent.tw.newSkuParticipationEnabled, cfgAbsent.tw.generalAllocationEnabled], [false, false], 'A null → both false');
eq([factoryOperationParseConfig_('').tw.newSkuParticipationEnabled, factoryOperationParseConfig_('not json{').tw.generalAllocationEnabled], [false, false], 'A empty/corrupt → both false (never throws)');
var gAbsent = handleFactoryOperationConfigGet_({}, makeIo());
eq([gAbsent.success, gAbsent.data.tw.newSkuParticipationEnabled, gAbsent.data.tw.generalAllocationEnabled], [true, false, false], 'A GET with absent config → both false');

section('B. save A=true / B=false');
var ioB = makeIo();
var sB = handleFactoryOperationConfigSave_({ payload: { tw: { newSkuParticipationEnabled: true, generalAllocationEnabled: false }, updated_by: 'tester' } }, ioB);
eq([sB.success, sB.data.tw.newSkuParticipationEnabled, sB.data.tw.generalAllocationEnabled], [true, true, false], 'B save A=true/B=false ok');
ok(typeof ioB._s.v === 'string' && ioB._s.v.indexOf('KM_FACTORY') === -1 && ioB._s.v.indexOf('newSkuParticipationEnabled') !== -1, 'B blob is the config JSON (not a sheet/tab name)');

section('C. reload → persists (round-trip through the same blob)');
var gC = handleFactoryOperationConfigGet_({}, ioB);
eq([gC.data.tw.newSkuParticipationEnabled, gC.data.tw.generalAllocationEnabled], [true, false], 'C reload persists A=true/B=false');
eq(gC.data.updatedBy, 'tester', 'C provenance persists (updatedBy)');

section('D. save B=true');
var ioD = makeIo();
handleFactoryOperationConfigSave_({ payload: { tw: { newSkuParticipationEnabled: false, generalAllocationEnabled: true } } }, ioD);
var gD = handleFactoryOperationConfigGet_({}, ioD);
eq([gD.data.tw.newSkuParticipationEnabled, gD.data.tw.generalAllocationEnabled], [false, true], 'D save + reload B=true');

section('E. Cancel → no mutation');
ok(/onclick="closeTwFactorySettingsModal\(\)"/.test(FS_HTML), 'E Cancel button calls closeTwFactorySettingsModal (not Save)');
var closeFn = extractFn(FS_JS, 'closeTwFactorySettingsModal');
ok(!/KM\.DB\.saveFactoryOperationConfig|factoryOperationConfig\.save/.test(closeFn), 'E closing the modal issues NO save (no mutation on Cancel)');
var openFn = extractFn(FS_JS, 'openTwFactorySettingsModal');
ok(!/saveFactoryOperationConfig|setProperty|appendRow|setValue/.test(openFn), 'E opening the modal issues NO write (read-only readback only)');

section('F/G/N. Save writes ONLY the config blob — no inventory / TW / CO1100 row mutation');
var saveHandlerSrc = extractFn(FOC, 'handleFactoryOperationConfigSave_');
ok(!/SpreadsheetApp|getSheetByName|factory_stock|appendRow|insertRow|deleteRow|setValue|removeRow/.test(saveHandlerSrc), 'F/G/N SAVE handler touches no Sheet / inventory row (no delete of TW/CO1100, no physical write)');
ok(!/SpreadsheetApp|factory_stock|appendRow|deleteRow|setValue/.test(FOC), 'F/G/N the entire config owner performs NO spreadsheet/inventory mutation');

section('H. OFF excludes TW from general allocation pool');
var cfgOff = factoryOperationParseConfig_(factoryOperationSerializeConfig_(factoryOperationApplyPayload_({ tw: { newSkuParticipationEnabled: false, generalAllocationEnabled: false } }, 'x', '2026-08-20')));
ok(factoryOpTwInGeneralAllocationPool_(cfgOff) === false, 'H OFF → TW NOT in general allocation pool');

section('I. OFF → restricted planning scope = ResUS / US / Amazon only');
eq(factoryOpTwPlanningScope_(cfgOff), { mode: 'RESTRICTED', restrictedScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' } }, 'I OFF → RESTRICTED to ResUS/US/Amazon');

section('J. ON → canonical allocator considers TW');
var cfgOn = factoryOperationParseConfig_(factoryOperationSerializeConfig_(factoryOperationApplyPayload_({ tw: { newSkuParticipationEnabled: true, generalAllocationEnabled: true } }, 'x', '2026-08-20')));
ok(factoryOpTwInGeneralAllocationPool_(cfgOn) === true, 'J ON → TW IN general allocation pool');
eq(factoryOpTwPlanningScope_(cfgOn), { mode: 'CANONICAL', restrictedScope: null }, 'J ON → CANONICAL (no TW restriction; no separate TW math)');

section('K. setting A does not retroactively backfill SKUs');
ok(factoryOpTwAutoInitOnNewSku_(cfgOn) === true && factoryOpTwAutoInitOnNewSku_(cfgOff) === false, 'K A resolves to a FUTURE auto-init policy boolean only');
ok(!/appendRow|insertRow|setValue|getSheetByName|createFactoryParticipation|initializeSku|initializeFactory/i.test(FOC), 'K the owner creates NO rows — A can never retroactively backfill (policy flag only, no row-creation primitive)');

section('L. scheduler-readable headlessly — Script Property only (no browser session, no DB)');
var ioSrc = extractFn(FOC, 'factoryOperationConfigIo_');
ok(/PropertiesService\.getScriptProperties\(\)/.test(ioSrc), 'L config IO reads PropertiesService.getScriptProperties (headless)');
ok(!/SpreadsheetApp|getActiveSpreadsheet|UrlFetchApp/.test(ioSrc), 'L IO uses NO Spreadsheet / network (pure Script-Property, scheduler-safe)');

section('M. no localStorage anywhere in this feature');
ok(!/localStorage/.test(FOC) && !/localStorage/.test(extractFn(FS_JS, 'openTwFactorySettingsModal')) && !/localStorage/.test(extractFn(FS_JS, 'saveTwFactorySettings')), 'M no localStorage (backend Script Property is the substrate)');

section('wiring — router actions + api client + menu entry + modal');
ok(/action === 'factoryOperationConfig\.get'/.test(ROUTER) && /handleFactoryOperationConfigGet_\(body\)/.test(ROUTER), 'router GET action wired');
ok(/action === 'factoryOperationConfig\.save'/.test(ROUTER) && /handleFactoryOperationConfigSave_\(body\)/.test(ROUTER), 'router SAVE action wired');
ok(/factoryOperationConfig\.get, factoryOperationConfig\.save/.test(ROUTER), 'router supported-actions string updated');
ok(/action: 'factoryOperationConfig\.get'/.test(DBAPI) && /action: 'factoryOperationConfig\.save'/.test(DBAPI), 'api client GET + SAVE call the new actions');
ok(/getFactoryOperationConfig = async function\(\)/.test(DBAPI) && /saveFactoryOperationConfig = async function\(payload\)/.test(DBAPI), 'api client exposes getFactoryOperationConfig / saveFactoryOperationConfig');
ok(/runFactoryAction\('twSettings'\)"[^<]*>TW Factory Settings/.test(FS_HTML), 'Factory More Options exposes "TW Factory Settings" item');
ok(/id="tw-setting-newsku"/.test(FS_HTML) && /id="tw-setting-genalloc"/.test(FS_HTML), 'modal has both policy toggles');
ok(/Default: Off/.test(FS_HTML) && /do NOT change physical stock quantities/i.test(FS_HTML), 'modal shows Default: Off + a not-physical-stock warning');
ok(/kind === 'twSettings' && typeof openTwFactorySettingsModal/.test(FS_JS), 'runFactoryAction routes twSettings → openTwFactorySettingsModal');
ok(/getFactoryOperationConfig\(\)\.then/.test(FS_JS), 'modal reads back the persisted policy on open (not localStorage)');

console.log('\n----------------------------------------');
console.log('FACTORY OPERATION CONFIG — TW POLICIES (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
