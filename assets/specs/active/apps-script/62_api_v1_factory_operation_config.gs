// Kitchen Mama Operation System — Factory Operation config owner (F1-7N-TW-FACTORY-OPERATIONAL-CONFIG-R1).
// -----------------------------------------------------------------------------------------------------------------
// Canonical persistence owner : PropertiesService.getScriptProperties()  (NOT the spreadsheet DB, NOT a Sheet tab).
//
// Holds TWO temporary Phase-1 TW-factory OPERATIONAL POLICY booleans (NOT inventory quantities):
//   tw.newSkuParticipationEnabled  — whether the canonical new-SKU initialization event auto-creates TW factory
//                                     participation for a newly-Running SKU. Default OFF. OFF never deletes existing
//                                     TW rows and never retroactively backfills; ON only permits FUTURE auto-init.
//   tw.generalAllocationEnabled    — whether TW physical inventory joins the GENERAL proportional/shared multi-site
//                                     factory-allocation pool. Default OFF. While OFF, TW planning is restricted to
//                                     company=ResUS / country=US / marketplace=Amazon; CN keeps normal general
//                                     allocation. ON lets TW join the SAME canonical allocation framework (no separate
//                                     TW math is ever invented here).
//
// This mirrors the established Script-Property config precedent (45_api_v1_automation_schedule.gs and
// 50_api_v1_warehouse_allocation_config.gs: ONE JSON blob under ONE key, read headlessly by time-driven triggers /
// the monthly recommendation runtime / a future SKU-initialization runtime via the default IO seam, with NO browser
// session). It authors NO business formula, touches NO spreadsheet DB, creates NO DB table, and NEVER writes/moves/
// deletes any inventory row. PropertiesService is touched ONLY in the default IO (factoryOperationConfigIo_) so the
// pure resolvers stay Node-testable. Missing / empty / corrupt config safely resolves to BOTH policies FALSE.
//
// SCOPE OF THIS ROUND: config substrate + bounded GET/SAVE owner + canonical policy RESOLVERS (the seams the runtimes
// read) + the Factory More Options UX. The live allocator / new-SKU initialization WIRING that consumes these
// resolvers is a SEPARATE future slice — this round does not change any allocation math (frozen).

var FACTORY_OPERATION_CONFIG_PROP_KEY_ = 'KM_FACTORY_OPERATION_CONFIG';   // ONE Script Property; ONE JSON blob
var FACTORY_OPERATION_CONFIG_VERSION_ = 1;
// While TW General Allocation is OFF, TW planning participation is restricted to exactly this scope (frozen policy).
var FACTORY_OP_TW_RESTRICTED_SCOPE_ = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };

function facOpStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
// STRICT boolean: only an explicit true (boolean true or the string "true") is ON; everything else — including
// missing / null / "false" / 0 / "" — is OFF. A policy is NEVER implicitly enabled.
function facOpBool_(v) { return v === true || facOpStr_(v).toLowerCase() === 'true'; }

// ---- CONFIG owner (Script Properties) — the ONLY place a Spreadsheet-free Apps Script service is touched ----------
function factoryOperationConfigIo_() {
  return {
    getConfig: function () { return PropertiesService.getScriptProperties().getProperty(FACTORY_OPERATION_CONFIG_PROP_KEY_); },
    setConfig: function (v) { PropertiesService.getScriptProperties().setProperty(FACTORY_OPERATION_CONFIG_PROP_KEY_, v); },
    stamp: function () { try { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch (e) { return ''; } }
  };
}

// ---- PURE — parse the stored blob. Absent/empty/corrupt → both policies FALSE. NEVER throws. ---------------------
function factoryOperationParseConfig_(raw) {
  var cfg = { version: FACTORY_OPERATION_CONFIG_VERSION_, tw: { newSkuParticipationEnabled: false, generalAllocationEnabled: false }, updatedAt: '', updatedBy: '' };
  try {
    var p = JSON.parse(raw);
    if (p && p.tw && typeof p.tw === 'object') {
      cfg.tw.newSkuParticipationEnabled = facOpBool_(p.tw.newSkuParticipationEnabled);
      cfg.tw.generalAllocationEnabled = facOpBool_(p.tw.generalAllocationEnabled);
    }
    if (p) { cfg.updatedAt = facOpStr_(p.updatedAt); cfg.updatedBy = facOpStr_(p.updatedBy); }
  } catch (e) { /* corrupt → defaults (both false) */ }
  return cfg;
}
// PURE — serialize a config object to the canonical stored shape (only the two owned booleans + provenance).
function factoryOperationSerializeConfig_(cfg) {
  cfg = cfg || {};
  var tw = cfg.tw || {};
  return JSON.stringify({
    version: FACTORY_OPERATION_CONFIG_VERSION_,
    tw: { newSkuParticipationEnabled: facOpBool_(tw.newSkuParticipationEnabled), generalAllocationEnabled: facOpBool_(tw.generalAllocationEnabled) },
    updatedAt: facOpStr_(cfg.updatedAt), updatedBy: facOpStr_(cfg.updatedBy) || 'operation-system'
  });
}
// PURE — build the next config from a raw client payload (never mutates input; strict booleans; stamps provenance).
function factoryOperationApplyPayload_(payload, actor, stamp) {
  var tw = (payload && payload.tw) || {};
  return {
    version: FACTORY_OPERATION_CONFIG_VERSION_,
    tw: { newSkuParticipationEnabled: facOpBool_(tw.newSkuParticipationEnabled), generalAllocationEnabled: facOpBool_(tw.generalAllocationEnabled) },
    updatedAt: facOpStr_(stamp), updatedBy: facOpStr_(actor) || 'operation-system'
  };
}

// ---- PURE canonical POLICY RESOLVERS — the seams the monthly runtime / scheduler / SKU-init runtime read. --------
// (No consumer is wired in THIS round; these are the single source of the policy decision so no caller re-derives it.)
function factoryOpTwNewSkuParticipationEnabled_(cfg) { return !!(cfg && cfg.tw && cfg.tw.newSkuParticipationEnabled === true); }
function factoryOpTwGeneralAllocationEnabled_(cfg) { return !!(cfg && cfg.tw && cfg.tw.generalAllocationEnabled === true); }
// Whether a canonical new-SKU initialization event should AUTO-CREATE TW participation (never a backfill of existing).
function factoryOpTwAutoInitOnNewSku_(cfg) { return factoryOpTwNewSkuParticipationEnabled_(cfg); }
// Whether TW is eligible for the GENERAL shared/proportional factory-allocation pool.
function factoryOpTwInGeneralAllocationPool_(cfg) { return factoryOpTwGeneralAllocationEnabled_(cfg); }
// TW planning scope: OFF → RESTRICTED to ResUS/US/Amazon; ON → CANONICAL (no TW-specific restriction). CN is never
// restricted by this resolver (it always follows normal general allocation).
function factoryOpTwPlanningScope_(cfg) {
  if (factoryOpTwGeneralAllocationEnabled_(cfg)) return { mode: 'CANONICAL', restrictedScope: null };
  return { mode: 'RESTRICTED', restrictedScope: { company: FACTORY_OP_TW_RESTRICTED_SCOPE_.company, country: FACTORY_OP_TW_RESTRICTED_SCOPE_.country, marketplace: FACTORY_OP_TW_RESTRICTED_SCOPE_.marketplace } };
}

// ---- READ handler — router action `factoryOperationConfig.get`. Opening the modal mutates nothing. ---------------
// Absent config → both policies FALSE (never a fabricated ON). io injectable for tests.
function handleFactoryOperationConfigGet_(body, io) {
  io = io || factoryOperationConfigIo_();
  var cfg = factoryOperationParseConfig_(io.getConfig());
  return jsonResponse_({
    success: true, data: {
      version: cfg.version,
      tw: { newSkuParticipationEnabled: cfg.tw.newSkuParticipationEnabled, generalAllocationEnabled: cfg.tw.generalAllocationEnabled },
      updatedAt: cfg.updatedAt, updatedBy: cfg.updatedBy
    }
  });
}

// ---- SAVE handler — router action `factoryOperationConfig.save`. Writes ONLY the Script-Property blob. -----------
// NO inventory read/write, NO Sheet tab, NO row create/delete — Save changes operational policy ONLY. Lock-guarded.
// body = { payload:{ tw:{ newSkuParticipationEnabled, generalAllocationEnabled }, updated_by? } } | { tw, updated_by }.
function handleFactoryOperationConfigSave_(body, io) {
  body = body || {};
  io = io || factoryOperationConfigIo_();
  var payload = body.payload || body;
  var actor = facOpStr_(payload.updated_by || body.updated_by);
  var lock = null;
  try { lock = LockService.getScriptLock(); if (lock && !lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock (another save in progress)' }); } catch (e) { /* LockService absent in some contexts */ }
  try {
    var next = factoryOperationApplyPayload_(payload, actor, io.stamp());
    io.setConfig(factoryOperationSerializeConfig_(next));
    return jsonResponse_({ success: true, data: { version: next.version, tw: next.tw, updatedAt: next.updatedAt, updatedBy: next.updatedBy } });
  } catch (err) {
    return jsonResponse_({ success: false, error: (err && err.message) ? String(err.message) : String(err) });
  } finally {
    try { if (lock) lock.releaseLock(); } catch (_e) {}
  }
}
