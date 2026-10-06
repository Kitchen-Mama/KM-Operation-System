/**
 * TEMP — S8-R4D-D2 §8 ADVANCED SHEETS AVAILABILITY PROBE.   PASTE · RUN · REPORT · REMOVE.
 *
 * WHAT IT IS FOR. The operator has enabled the Google Sheets API in the attached Cloud project and added the
 * Sheets v4 advanced service. No repository file can prove either happened — Google's console is not in this
 * repository — so ADVANCED_SHEETS_SERVICE_LIVE is a fact that has to be ASKED, in the project, before a
 * single measurement is taken. §8 exists so that a benchmark failure is never ambiguous between "the
 * candidate is slow" and "the candidate was never available".
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It takes no timing. A probe that also reported milliseconds would invite
 * its number to be read as the benchmark's, and one sample taken minutes after a service is first enabled is
 * the worst sample there is — a cold code path, a first-ever OAuth handshake for the service, and no paired
 * control to subtract any of it against. The benchmark is a separate tool, run separately, in pairs.
 *
 * READ ONLY. No setValue/setValues/appendRow/insert/delete, no PropertiesService write, no CacheService
 * write, no DriveApp, no trigger, no mail. It registers no action, is unreachable from 01_router.gs, and is
 * called by no handler. It reads at most one cell.
 *
 * THREE SEPARATE QUESTIONS, THREE SEPARATE ANSWERS. The namespace resolving, `get` working and `batchGet`
 * working are different failures with different causes — the advanced service not added, the Cloud API not
 * enabled, and a scope or permission problem respectively. Collapsing them into one boolean would throw away
 * the only diagnosis this probe exists to produce, so each is reported on its own and the raw error text of
 * each is kept verbatim rather than summarised.
 */

function D2PROBE_run() {
  var out = {
    PROBE: 'S8-R4D-D2 §8',
    SHEETS_NAMESPACE_RESOLVES: false,
    SPREADSHEETS_GET_OK: false,
    VALUES_BATCHGET_OK: false,
    ADVANCED_SHEETS_SERVICE_LIVE: 'NO',
    SPREADSHEET_ID_SOURCE: 'PRODUCTION_DB_SPREADSHEET_ID_ (00_config.gs) — no id is introduced by this probe',
    errors: []
  };

  // 1. THE NAMESPACE. If the advanced service was not added to the project, `Sheets` is simply undefined and
  //    every later call would throw the same opaque ReferenceError. Asked first so that answer is unambiguous.
  try {
    out.SHEETS_NAMESPACE_RESOLVES = (typeof Sheets !== 'undefined')
      && !!(Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values);
  } catch (e) {
    out.errors.push('namespace: ' + e);
  }
  if (!out.SHEETS_NAMESPACE_RESOLVES) {
    out.errors.push('STOP: the Sheets advanced service is not resolvable in this project. Nothing below ran.');
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  // The SAME spreadsheet the Web App already reads, under the .../auth/spreadsheets scope it already holds.
  var id = PRODUCTION_DB_SPREADSHEET_ID_;

  // 2. METADATA. Field-limited to titles: the smallest metadata read there is, and it pulls no grid data.
  //    This is the call most likely to surface a Cloud-side problem (API not enabled -> 403 SERVICE_DISABLED).
  try {
    var meta = Sheets.Spreadsheets.get(id, { fields: 'sheets.properties.title' });
    out.SPREADSHEETS_GET_OK = !!(meta && meta.sheets && meta.sheets.length);
    out.SHEET_COUNT = (meta && meta.sheets) ? meta.sheets.length : 0;
  } catch (e) {
    out.errors.push('get: ' + e);
  }

  // 3. VALUES. One cell of one sheet. Callability is the whole question; the value is not inspected and is
  //    not reported, because a probe that printed business data would be a probe that leaked it.
  try {
    var r = Sheets.Spreadsheets.Values.batchGet(id, { ranges: ['marketplaces!A1:A1'] });
    out.VALUES_BATCHGET_OK = !!(r && r.valueRanges && r.valueRanges.length === 1);
  } catch (e) {
    out.errors.push('batchGet: ' + e);
  }

  // ALL THREE, or NO. A partial pass is not a pass: the benchmark needs both calls, and reporting LIVE on
  // two of three would hand the next step a candidate arm that cannot complete.
  out.ADVANCED_SHEETS_SERVICE_LIVE =
    (out.SHEETS_NAMESPACE_RESOLVES && out.SPREADSHEETS_GET_OK && out.VALUES_BATCHGET_OK) ? 'YES' : 'NO';

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
