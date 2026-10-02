/**
 * TEMP — F1-7N-FB-4E-R4B-R1 §2 · ORDER PLANNING DRAFT READBACK DIAGNOSE
 * =====================================================================================================
 * PURPOSE COMPLETE — REMOVABLE FROM THE LIVE APPS SCRIPT PROJECT (F1-7N-FB-4E-R4B-R2 §7).
 *
 * It was run twice against live data and it answered the question it was built for:
 *
 *     rescuedByBlankFieldDefaults = 0
 *
 * So the R4B-R1 blank-status / blank-draft_purpose coherence fix is NOT the live cause of the missing Order
 * Qty. It remains in place because it is independently correct (the reader disagreed with its own DTO and its
 * own writer), but it is not the root cause and R4B-R1's report was wrong to present it as the leading
 * candidate. The REAL cause was found by instrumenting the shipped path end to end: the router's GET read-table
 * dispatch re-wrapped a handler that already returned a ContentService TextOutput, so requestOrderDraft.getActive
 * answered every GET with the literal body {}. Fixed in 01_router.gs (rtrEmitHandlerResult_).
 *
 * The run also showed why one line of its own output must not be over-read: with NO scope it reported
 * scopeRows = 0. That is a property of THIS FILE's matcher, which compares blank against blank exactly. It is
 * NOT how the runtime behaves — KMRDV2P.scopeMatches_ treated a blank field as a wildcard (now fixed to match
 * nothing), and the handler refuses a blank scope outright. Three matchers, three meanings for blank; only the
 * shipped path is evidence about the shipped path.
 *
 * DISPOSITION: the USER may delete this file from the live Apps Script editor at any time. It is kept in the
 * repository as tooling (the R4B-R1 suite asserts its read-only properties) and it must stay UN-ROUTED and
 * READ-ONLY for as long as it exists. It is NOT a runtime dependency of anything and needs no re-sync.
 * =====================================================================================================
 * STRICTLY READ-ONLY. It answers ONE question with live evidence: the live
 * request_order_allocation_drafts table has rows, and the Order Planning grid shows blank Order Qty —
 * where between the sheet and the input does the row stop?
 *
 * WHY IT EXISTS. Every remaining branch of the readback turns on a live CELL VALUE (status,
 * draft_purpose, planning_cycle, and the exact company / country / marketplace spellings), and none of
 * those can be read from the repository. Repository evidence took the trace as far as it goes:
 *
 *   · REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ is TRUE (00_config.gs) — the flat path IS the live path, so
 *     the earlier "the flag is off and a retired child-line table is being read" lead is DISPROVED.
 *   · The flat reader disagreed with its OWN DTO about blank status / blank draft_purpose (fixed this
 *     round in KMRDV2P.withFlatDefaults). A row with either cell blank was invisible to the reader while
 *     the DTO would have called it an active regular draft. THAT is the mechanism this run confirms or
 *     eliminates: `defaultedRows` below is exactly the number of rows the fix rescues.
 *   · submittedSkus was empty by construction and noDraftSkus was hardcoded [] (both fixed this round).
 *
 * WRITE SAFETY. It calls getSheetByName + getDataRange().getValues() ONLY. It deliberately does NOT use
 * rprBuildSheetSet_ / procurementEnsureSheet_ / sheetEnsureColumns_, because those CREATE a missing tab
 * and APPEND missing columns — real writes. It opens no lock, sets no property, creates no trigger. The
 * report ends with DB_WRITES = 0 and that is a property of the code, not a promise.
 *
 * NOT ROUTED. There is no router entry and no action name for any function here. It is run by the USER
 * from the Apps Script editor and its output is read from the execution log / return value.
 *
 * Entry points (public — no trailing underscore):
 *   TEMP_ORDER_PLANNING_DRAFT_READBACK_DIAGNOSE()          — every concrete scope found in marketplace_skus
 *   TEMP_ORDER_PLANNING_DRAFT_READBACK_DIAGNOSE_SCOPE(c,co,mk) — one scope
 */

var TEMP_ROD_TABLE_ = 'request_order_allocation_drafts';
var TEMP_ROD_LEGACY_LINES_TABLE_ = 'request_order_allocation_draft_lines';
var TEMP_ROD_MAX_IDENTITY_SAMPLES_ = 25;

function tempRodStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function tempRodUp_(v) { return tempRodStr_(v).toUpperCase(); }

/** Mask a business identifier: enough to correlate a row, never a full dump of live identifiers. */
function tempRodMask_(v) {
  var s = tempRodStr_(v);
  if (s.length <= 5) return s ? (s.charAt(0) + '***') : '';
  return s.slice(0, 3) + '***' + s.slice(-2);
}

/** READ-ONLY raw table read. Returns null when the tab is absent — it never creates it. */
function tempRodReadTable_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return null;
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) return { headers: [], rows: [] };
  var vals = sh.getDataRange().getValues();
  var headers = (vals[0] || []).map(function (h) { return tempRodStr_(h); });
  return { headers: headers, rows: vals.slice(1) };
}

function tempRodRowObj_(headers, row) {
  var o = {};
  for (var i = 0; i < headers.length; i++) o[headers[i]] = row[i];
  return o;
}

/** A stable fingerprint of the header row: count + a short digest, so schema drift is visible at a glance. */
function tempRodHeaderFingerprint_(headers) {
  var joined = (headers || []).join('|');
  var h = 0;
  for (var i = 0; i < joined.length; i++) { h = ((h << 5) - h + joined.charCodeAt(i)) | 0; }
  return { count: (headers || []).length, digest: ('00000000' + (h >>> 0).toString(16)).slice(-8) };
}

/** Blank status / draft_purpose carry the SAME defaults the DTO and the writer use. */
function tempRodEffStatus_(o) { var s = tempRodStr_(o.status); return s === '' ? 'draft' : s; }
function tempRodEffPurpose_(o) { var s = tempRodStr_(o.draft_purpose); return s === '' ? 'regular' : s; }

function TEMP_ORDER_PLANNING_DRAFT_READBACK_DIAGNOSE_SCOPE(company, country, marketplace) {
  return tempRodRun_([{ company: tempRodStr_(company), country: tempRodStr_(country), marketplace: tempRodStr_(marketplace) }]);
}

function TEMP_ORDER_PLANNING_DRAFT_READBACK_DIAGNOSE() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mk = tempRodReadTable_(ss, 'marketplace_skus');
  var seen = {}, scopes = [];
  if (mk) {
    for (var i = 0; i < mk.rows.length; i++) {
      var o = tempRodRowObj_(mk.headers, mk.rows[i]);
      var c = tempRodStr_(o.company), co = tempRodStr_(o.country), m = tempRodStr_(o.marketplace);
      if (!c || !co || !m) continue;
      var k = c + '|' + co + '|' + m;
      if (seen[k]) continue;
      seen[k] = 1; scopes.push({ company: c, country: co, marketplace: m });
    }
  }
  return tempRodRun_(scopes);
}

function tempRodRun_(scopes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = {
    diagnostic: 'TEMP_ORDER_PLANNING_DRAFT_READBACK_DIAGNOSE',
    round: 'F1-7N-FB-4E-R4B-R1',
    readOnly: true,
    DB_WRITES: 0,
    cutover: {},
    flatTable: {},
    legacyChildTable: {},
    scopes: [],
    duplicateNaturalKeys: [],
    proposedRuntimePath: '',
    cutoverFlagChangeMechanicallySafe: null,
    notes: []
  };

  // ---- 1. the cutover flag actually in force in THIS deployment ---------------------------------------
  var flagOn = (typeof requestOrderDraftV2FlatCutoverEnabled_ === 'function') ? requestOrderDraftV2FlatCutoverEnabled_() : null;
  report.cutover = {
    REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_: (typeof REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ === 'undefined') ? 'UNDEFINED' : REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_,
    effective: flagOn,
    kmrdv2Present: (typeof KMRDV2 !== 'undefined' && !!KMRDV2),
    kmrdv2pPresent: (typeof KMRDV2P !== 'undefined' && !!KMRDV2P),
    kmrdv2pVersion: (typeof KMRDV2P !== 'undefined' && KMRDV2P) ? KMRDV2P.VERSION : null
  };

  // ---- 2. the flat table: presence, header fingerprint, schema readiness -----------------------------
  var flat = tempRodReadTable_(ss, TEMP_ROD_TABLE_);
  if (!flat) {
    report.flatTable = { present: false, totalRows: 0 };
    report.proposedRuntimePath = 'BLOCKED — the canonical flat table does not exist in this spreadsheet.';
    report.cutoverFlagChangeMechanicallySafe = false;
    return tempRodEmit_(report);
  }
  var expected = (typeof KMRDV2 !== 'undefined' && KMRDV2 && Array.isArray(KMRDV2.V2_HEADERS)) ? KMRDV2.V2_HEADERS : [];
  var have = {}; flat.headers.forEach(function (h) { have[h] = 1; });
  var missing = expected.filter(function (h) { return !have[h]; });
  var extra = flat.headers.filter(function (h) { return h && expected.indexOf(h) === -1; });
  report.flatTable = {
    present: true,
    totalRows: flat.rows.length,
    headerFingerprint: tempRodHeaderFingerprint_(flat.headers),
    expectedHeaderCount: expected.length,
    missingHeaders: missing,
    extraHeaders: extra,
    flatSchemaReady: missing.length === 0,
    // The three cells the reader branches on. Counted over the WHOLE table, before any scope filter, so a
    // systematic blank is visible even when a single scope looks fine.
    blankStatusRows: 0,
    blankDraftPurposeRows: 0,
    blankPlanningCycleRows: 0,
    distinctStatusValues: {},
    distinctDraftPurposeValues: {}
  };
  var allObjs = flat.rows.map(function (r) { return tempRodRowObj_(flat.headers, r); });
  allObjs.forEach(function (o) {
    if (tempRodStr_(o.status) === '') report.flatTable.blankStatusRows++;
    if (tempRodStr_(o.draft_purpose) === '') report.flatTable.blankDraftPurposeRows++;
    if (tempRodStr_(o.planning_cycle) === '') report.flatTable.blankPlanningCycleRows++;
    var s = tempRodStr_(o.status) || '(blank)';
    var p = tempRodStr_(o.draft_purpose) || '(blank)';
    report.flatTable.distinctStatusValues[s] = (report.flatTable.distinctStatusValues[s] || 0) + 1;
    report.flatTable.distinctDraftPurposeValues[p] = (report.flatTable.distinctDraftPurposeValues[p] || 0) + 1;
  });

  // ---- 3. the retired child-line table: is anything still there, and is anything still reading it? ----
  var legacy = tempRodReadTable_(ss, TEMP_ROD_LEGACY_LINES_TABLE_);
  report.legacyChildTable = {
    present: !!legacy,
    totalRows: legacy ? legacy.rows.length : 0,
    readByRuntime: (flagOn === true) ? false : true,
    note: (flagOn === true)
      ? 'Cutover ON: the readback reads the flat table ONLY and never joins this table.'
      : 'Cutover OFF/UNKNOWN: the legacy line-join readback would run against the flat table — this is the state to escalate.'
  };

  // ---- 4. duplicate / ambiguous natural keys (a duplicate is a BLOCKED_CONFLICT, not a silent pick) ---
  var byNatural = {};
  allObjs.forEach(function (o) {
    var st = tempRodEffStatus_(o);
    if (st !== 'draft' && st !== 'partially_submitted' && st !== 'site_confirmed') return;   // active rows only
    var k = [tempRodUp_(o.company), tempRodUp_(o.country), tempRodStr_(o.marketplace).toLowerCase(),
             tempRodUp_(o.sku), tempRodEffPurpose_(o), tempRodStr_(o.planning_cycle)].join('|');
    (byNatural[k] = byNatural[k] || []).push(tempRodStr_(o.request_allocation_draft_id));
  });
  Object.keys(byNatural).forEach(function (k) {
    if (byNatural[k].length > 1) {
      report.duplicateNaturalKeys.push({ naturalKey: k.split('|').map(tempRodMask_).join('|'), count: byNatural[k].length, ids: byNatural[k].map(tempRodMask_) });
    }
  });

  // ---- 5. per-scope census, with the persisted Order Qty values (ZEROS INCLUDED) ----------------------
  var TIERS = ['t1', 't2', 't3'];
  scopes.forEach(function (sc) {
    var entry = {
      scope: { company: sc.company, country: sc.country, marketplace: sc.marketplace },
      scopeRows: 0, active: 0, submitted: 0, otherStatus: 0,
      // The number that decides whether this round's coherence fix IS the live root cause.
      rescuedByBlankFieldDefaults: 0,
      byStatus: {},
      // "Actionable" = an active row carrying at least one non-null persisted tier quantity, including 0.
      actionableRows: 0,
      rowsWithAllTierQtyBlank: 0,
      orderQtyValueCensus: { zero: 0, positive: 0, blank: 0 },
      identitySamples: []
    };
    allObjs.forEach(function (o) {
      if (tempRodUp_(o.company) !== tempRodUp_(sc.company)) return;
      if (tempRodUp_(o.country) !== tempRodUp_(sc.country)) return;
      if (tempRodStr_(o.marketplace).toLowerCase() !== tempRodStr_(sc.marketplace).toLowerCase()) return;
      if (tempRodEffPurpose_(o) !== 'regular') return;
      entry.scopeRows++;
      var wasBlank = (tempRodStr_(o.status) === '' || tempRodStr_(o.draft_purpose) === '');
      var st = tempRodEffStatus_(o);
      entry.byStatus[st] = (entry.byStatus[st] || 0) + 1;
      var isActive = (st === 'draft' || st === 'partially_submitted' || st === 'site_confirmed');
      if (isActive) { entry.active++; if (wasBlank) entry.rescuedByBlankFieldDefaults++; }
      else if (st === 'submitted') entry.submitted++;
      else entry.otherStatus++;
      if (!isActive) return;
      var anyQty = false, allBlank = true;
      var tierSnapshot = {};
      TIERS.forEach(function (t) {
        var raw = o[t + '_order_qty'];
        var s = tempRodStr_(raw);
        if (s === '') { entry.orderQtyValueCensus.blank++; tierSnapshot[t] = null; return; }
        allBlank = false;
        var n = Number(raw);
        if (isFinite(n) && n === 0) entry.orderQtyValueCensus.zero++;
        else if (isFinite(n) && n > 0) { entry.orderQtyValueCensus.positive++; anyQty = true; }
        tierSnapshot[t] = isFinite(n) ? n : s;
      });
      if (anyQty || !allBlank) entry.actionableRows++;
      if (allBlank) entry.rowsWithAllTierQtyBlank++;
      if (entry.identitySamples.length < TEMP_ROD_MAX_IDENTITY_SAMPLES_) {
        entry.identitySamples.push({
          draftId: tempRodMask_(o.request_allocation_draft_id),
          sku: tempRodMask_(o.sku),
          planningCycle: tempRodStr_(o.planning_cycle),
          statusRaw: tempRodStr_(o.status), statusEffective: st,
          draftPurposeRaw: tempRodStr_(o.draft_purpose),
          orderQty: tierSnapshot
        });
      }
    });
    report.scopes.push(entry);
  });

  // ---- 6. the verdict -------------------------------------------------------------------------------
  var totalRescued = 0, totalActive = 0, totalScopeRows = 0;
  report.scopes.forEach(function (s) { totalRescued += s.rescuedByBlankFieldDefaults; totalActive += s.active; totalScopeRows += s.scopeRows; });
  report.summary = { totalScopeRows: totalScopeRows, totalActive: totalActive, totalRescuedByBlankFieldDefaults: totalRescued };

  if (flagOn !== true) {
    report.proposedRuntimePath = 'ESCALATE — the flat cutover flag is not TRUE in this deployment while the live table is the 53-column flat schema. The runtime would read the RETIRED child-line model. This is a USER-owned flag decision; it is NOT changed here.';
    report.cutoverFlagChangeMechanicallySafe = (report.flatTable.flatSchemaReady === true);
  } else if (!report.flatTable.flatSchemaReady) {
    report.proposedRuntimePath = 'BLOCKED — cutover is ON but the flat schema is incomplete (see missingHeaders). The reader fails closed rather than reading a half-migrated row.';
    report.cutoverFlagChangeMechanicallySafe = false;
  } else if (totalRescued > 0) {
    report.proposedRuntimePath = 'CONFIRMED — ' + totalRescued + ' active row(s) are visible to the reader ONLY because of the R4B-R1 blank-field defaults. Before this round those rows existed in the table and never reached the page: that is the blank Order Qty. No flag change and no migration is required.';
    report.cutoverFlagChangeMechanicallySafe = true;
  } else if (totalActive === 0 && totalScopeRows > 0) {
    report.proposedRuntimePath = 'ELIMINATED (defaults) / NEW FINDING — rows exist for these scopes but NONE is in an active status. Read byStatus: the drafts are terminal (submitted/cancelled), so the page is correctly showing no editable draft and the defect is upstream in generation, not in readback.';
    report.cutoverFlagChangeMechanicallySafe = true;
  } else if (totalScopeRows === 0 && report.flatTable.totalRows > 0) {
    report.proposedRuntimePath = 'ELIMINATED (defaults) / NEW FINDING — the table has rows but NONE matches these company/country/marketplace spellings. Compare identitySamples with the marketplace_skus scopes: the scope match is exact and case-sensitive on company/country and case-insensitive on marketplace.';
    report.cutoverFlagChangeMechanicallySafe = true;
  } else {
    report.proposedRuntimePath = 'ELIMINATED — the reader accepts the rows that exist. If Order Qty is still blank, the loss is downstream of the readback (client hydration / render), not in the sheet or the reader.';
    report.cutoverFlagChangeMechanicallySafe = true;
  }

  report.notes.push('This function performed ZERO writes: it called getSheetByName + getDataRange().getValues() only, and deliberately avoided procurementEnsureSheet_ / sheetEnsureColumns_ / rprBuildSheetSet_, which create tabs and append columns.');
  report.notes.push('No cutover flag, script property, trigger or cell was changed. Any flag or schema change remains USER-owned.');
  return tempRodEmit_(report);
}

function tempRodEmit_(report) {
  try { Logger.log(JSON.stringify(report, null, 2)); } catch (e) {}
  return report;
}
