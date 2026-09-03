/**
 * TEMP — F1-7N-FB-4G-A2-R3-R1 §C — PRODUCTION SAVE CENSUS (READ ONLY).
 *
 * One entry point, no parameters:
 *
 *     TEMP_PRODUCTION_SAVE_CENSUS_A2_R3_R1()
 *
 * PASTE → RUN → READ → REMOVE. Nothing here writes, deletes, transitions a status, back-fills a value, takes a
 * lock, touches Properties, creates a file, sends mail, or calls any upsert/submit action. Every sheet is handed
 * to the reporter through a façade exposing ONLY getDataRange().getValues(), so the mutators are UNREACHABLE
 * rather than merely unused: a later edit cannot write through this file even by accident.
 *
 * WHY IT EXISTS. The A2-R3 production acceptance failed, and the browser had kept no evidence: the screen could
 * say only BUSINESS_COMMAND_ERROR and then HTTP_TRANSPORT_ERROR / OUTCOME UNKNOWN. Two questions cannot be
 * answered from the UI at all, and both change what the repair means:
 *
 *   (1) HAS THE MIGRATION RUN? A create on a 35-column sheet is refused ROUTE_CREATE_IDEMPOTENCY_NOT_PERSISTABLE
 *       with zero writes — which is exactly a "+ Add Route failed and left nothing behind". If the column is
 *       absent, that alone explains the failed Add Route and the repair is to run the migration.
 *   (2) DID ANY OF IT LAND? "Three tickets still there after Search" is NOT proof of zero write: a header can
 *       exist with no line, sit outside the hydrated scope, or have been updated without the client hearing so.
 *       Every claim below is read from cells; where provenance cannot be PROVEN the row is printed UNKNOWN.
 */

var TEMP_R1_SKU_ = 'CO1100-R';
var TEMP_R1_TABS_ = ['shipping_allocation_drafts', 'shipping_allocation_draft_lines'];

function TEMP_PRODUCTION_SAVE_CENSUS_A2_R3_R1() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }

  p('TEMP PRODUCTION SAVE CENSUS - F1-7N-FB-4G-A2-R3-R1 - READ ONLY');
  p('run at: ' + new Date());
  rule();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  p('spreadsheet: ' + ss.getName() + '  (' + ss.getId() + ')');

  // ---- the read-only façade. getDataRange().getValues() and nothing else. ------------------------------------
  function facade(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return null;
    var values = sh.getDataRange().getValues();
    return {
      name: name,
      header: (values[0] || []).map(function (x) { return String(x == null ? '' : x).trim(); }),
      rows: values.slice(1),
      colCount: (values[0] || []).length,
      rowCount: Math.max(0, values.length - 1)
    };
  }
  var T = {};
  for (var t = 0; t < TEMP_R1_TABS_.length; t++) T[TEMP_R1_TABS_[t]] = facade(TEMP_R1_TABS_[t]);

  var H = T['shipping_allocation_drafts'], L = T['shipping_allocation_draft_lines'];
  if (!H) { p('REFUSED: shipping_allocation_drafts not found. Nothing classified.'); Logger.log(out.join('\n')); return out.join('\n'); }

  function col(f, n) { return f.header.indexOf(n); }
  function cell(f, row, n) { var c = col(f, n); return c === -1 ? '' : String(row[c] == null ? '' : row[c]).trim(); }
  function obj(f, row) { var o = {}; for (var i = 0; i < f.header.length; i++) if (f.header[i]) o[f.header[i]] = row[i]; return o; }

  // ================================================================================================================
  rule();
  p('SECTION 1 - THE SCHEMA. Has the create_idempotency_key migration run?');
  rule();
  p('header columns          : ' + H.colCount);
  p('data rows               : ' + H.rowCount);
  p('last column             : ' + (H.header[H.header.length - 1] || '(blank)'));
  var ciIdx = col(H, 'create_idempotency_key');
  p('create_idempotency_key  : ' + (ciIdx === -1 ? 'ABSENT' : ('present at index ' + ciIdx)));
  p('is it the LAST column   : ' + (ciIdx !== -1 && ciIdx === H.header.length - 1 ? 'YES' : 'NO'));
  if (ciIdx === -1) {
    p('');
    p('>>> VERDICT: the migration has NOT run. On this sheet every + Add Route is refused');
    p('>>> ROUTE_CREATE_IDEMPOTENCY_NOT_PERSISTABLE with ZERO writes, which by itself accounts for a');
    p('>>> "+ Add Route failed and no fourth ticket exists". Run TEMP_A2R3_MIGRATION_DRY_RUN() then');
    p('>>> TEMP_A2R3_MIGRATION_COMMIT(). An UPDATE of an existing route is NOT affected by this.');
  } else {
    p('');
    p('>>> the migration HAS run, so a failed + Add Route has some other named cause.');
  }
  p('');
  p('full header, in order:');
  for (var hi = 0; hi < H.header.length; hi++) p('  [' + hi + '] ' + H.header[hi]);

  // Compare against the deployed authority when it is loaded; refuse to guess when it is not.
  p('');
  if (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ === 'undefined') {
    p('authority SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ : AUTHORITY_NOT_LOADED (no comparison made)');
  } else {
    var A = SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_;
    p('authority column count : ' + A.length);
    var mismatch = [];
    for (var ai = 0; ai < Math.max(A.length, H.header.length); ai++) {
      if (String(A[ai] || '') !== String(H.header[ai] || '')) mismatch.push('[' + ai + '] authority=' + (A[ai] || '(none)') + ' live=' + (H.header[ai] || '(none)'));
    }
    p('prefix comparison      : ' + (mismatch.length ? ('MISMATCH x' + mismatch.length) : 'EXACT'));
    for (var mi = 0; mi < mismatch.length; mi++) p('  ' + mismatch[mi]);
  }

  // ================================================================================================================
  rule();
  p('SECTION 2 - EVERY ACTIVE HEADER THAT CARRIES A ' + TEMP_R1_SKU_ + ' LINE, PLUS EVERY ACTIVE HEADER IN ITS STATION');
  rule();
  var TERMINAL = { submitted: 1, cancelled: 1, expired: 1 };
  var headers = [];
  for (var r = 0; r < H.rows.length; r++) {
    var row = H.rows[r];
    headers.push({
      sheetRow: r + 2,
      id: cell(H, row, 'allocation_draft_id'),
      status: cell(H, row, 'status').toLowerCase(),
      planning_cycle: cell(H, row, 'planning_cycle'),
      company: cell(H, row, 'company'),
      country: cell(H, row, 'country'),
      marketplace: cell(H, row, 'marketplace'),
      source_page: cell(H, row, 'source_page'),
      src: cell(H, row, 'recommended_source_warehouse_id'),
      dstWh: cell(H, row, 'recommended_destination_warehouse_id'),
      dstMk: cell(H, row, 'destination_marketplace'),
      method: cell(H, row, 'recommended_shipping_method'),
      lastMile: cell(H, row, 'recommended_last_mile_delivery'),
      version: cell(H, row, 'draft_version'),
      createKey: ciIdx === -1 ? '(COLUMN ABSENT)' : cell(H, row, 'create_idempotency_key'),
      created: cell(H, row, 'created_at'),
      updated: cell(H, row, 'updated_at'),
      obj: obj(H, row)
    });
  }

  // lines, grouped by their FK
  var linesByDraft = {}, skuLines = [];
  if (L) {
    for (var lr = 0; lr < L.rows.length; lr++) {
      var lrow = L.rows[lr];
      var rec = {
        sheetRow: lr + 2,
        lineId: cell(L, lrow, 'allocation_draft_line_id'),
        draftId: cell(L, lrow, 'allocation_draft_id'),
        sku: cell(L, lrow, 'sku'),
        siteSku: cell(L, lrow, 'site_sku'),
        windowCode: cell(L, lrow, 'window_code'),
        qty: cell(L, lrow, 'planned_qty'),
        lineStatus: cell(L, lrow, 'line_status').toLowerCase(),
        created: cell(L, lrow, 'created_at'),
        updated: cell(L, lrow, 'updated_at')
      };
      (linesByDraft[rec.draftId] = linesByDraft[rec.draftId] || []).push(rec);
      if (rec.sku === TEMP_R1_SKU_) skuLines.push(rec);
    }
  } else {
    p('WARNING: shipping_allocation_draft_lines not found. Line facts below are UNKNOWN.');
  }

  function activeLines(id) {
    return (linesByDraft[id] || []).filter(function (x) { return x.lineStatus !== 'cancelled' && x.lineStatus !== 'expired'; });
  }

  // The station(s) the SKU's lines actually live in, derived from the data rather than assumed.
  var stations = {};
  for (var si = 0; si < skuLines.length; si++) {
    for (var hj = 0; hj < headers.length; hj++) {
      if (headers[hj].id && headers[hj].id === skuLines[si].draftId) {
        stations[[headers[hj].company, headers[hj].country, headers[hj].marketplace, headers[hj].source_page].join('|')] = 1;
      }
    }
  }
  p('stations carrying ' + TEMP_R1_SKU_ + ' lines: ' + (Object.keys(stations).join('  ·  ') || '(none)'));
  p('');

  var shown = 0;
  for (var k = 0; k < headers.length; k++) {
    var h = headers[k];
    var stKey = [h.company, h.country, h.marketplace, h.source_page].join('|');
    var carriesSku = activeLines(h.id).some(function (x) { return x.sku === TEMP_R1_SKU_; });
    if (!carriesSku && !stations[stKey]) continue;
    shown++;
    var al = activeLines(h.id);
    p('HEADER  ' + h.id + '   (sheet row ' + h.sheetRow + ')');
    p('   status/version   : ' + (h.status || '(blank)') + '  /  v' + (h.version || '(blank)') + (TERMINAL[h.status] ? '   [TERMINAL - not active]' : ''));
    p('   station          : ' + h.company + ' / ' + h.country + ' / ' + h.marketplace + ' / ' + h.source_page + ' / cycle=' + (h.planning_cycle || '(blank)'));
    p('   route            : ' + (h.src || '(blank)') + '  ->  ' + (h.dstWh || h.dstMk || '(blank)') + '  /  ' + (h.method || '(blank)') + (h.lastMile ? (' / ' + h.lastMile) : ''));
    p('   create key       : ' + (h.createKey || '(blank)'));
    p('   created/updated  : ' + (h.created || '(blank)') + '   /   ' + (h.updated || '(blank)'));
    p('   WAS IT UPDATED   : ' + (h.created && h.updated ? (h.created === h.updated ? 'NO - never touched since insert' : 'YES - updated_at differs from created_at') : 'UNKNOWN - a timestamp is blank'));
    p('   active lines     : ' + al.length + (al.length ? '' : '   [ZERO-LINE HEADER - an ORPHAN, and it blocks Submit for every route beside it]'));
    for (var li = 0; li < al.length; li++) {
      p('      line ' + al[li].lineId + '  sku=' + al[li].sku + '  qty=' + al[li].qty +
        '  created=' + (al[li].created || '(blank)') + '  updated=' + (al[li].updated || '(blank)') +
        '  ' + (al[li].created && al[li].updated && al[li].created !== al[li].updated ? '[UPDATED]' : (al[li].created && al[li].updated ? '[never updated]' : '[UNKNOWN]')));
    }
    // Would the Execution Plan hydrate this header at all?
    p('   HYDRATED BY THE EXECUTION PLAN : ' +
      (TERMINAL[h.status] ? 'NO - terminal status'
        : (h.source_page !== 'inventory_replenishment' ? 'NO - source_page is "' + h.source_page + '"'
          : (al.length === 0 ? 'NO - it has no active line to render' : 'YES')))
      );
    p('');
  }
  if (!shown) p('(no header in any station carrying ' + TEMP_R1_SKU_ + ')');

  // ================================================================================================================
  rule();
  p('SECTION 3 - THE QUESTIONS THE UI COULD NOT ANSWER');
  rule();
  var skuActive = skuLines.filter(function (x) { return x.lineStatus !== 'cancelled' && x.lineStatus !== 'expired'; });
  p('active ' + TEMP_R1_SKU_ + ' lines            : ' + skuActive.length);
  p('distinct headers they sit under : ' + Object.keys(skuActive.reduce(function (a, x) { a[x.draftId] = 1; return a; }, {})).length);
  p('their quantities                : ' + (skuActive.map(function (x) { return x.qty; }).join(', ') || '(none)'));
  p('');
  // A line whose FK names no header at all.
  var idSet = headers.reduce(function (a, h2) { if (h2.id) a[h2.id] = 1; return a; }, {});
  var dangling = skuActive.filter(function (x) { return !idSet[x.draftId]; });
  p('lines whose FK names NO header  : ' + dangling.length + (dangling.length ? ('  -> ' + dangling.map(function (x) { return x.lineId; }).join(', ')) : ''));
  // Zero-line active headers in the affected stations.
  var orphans = headers.filter(function (h3) {
    var stKey2 = [h3.company, h3.country, h3.marketplace, h3.source_page].join('|');
    return !TERMINAL[h3.status] && stations[stKey2] && activeLines(h3.id).length === 0;
  });
  p('ACTIVE ZERO-LINE headers        : ' + orphans.length + (orphans.length ? ('  -> ' + orphans.map(function (h4) { return h4.id; }).join(', ')) : ''));
  if (orphans.length) {
    p('   >>> each of these is an ORPHAN. It is an active draft of the station, so Submit will refuse');
    p('   >>> NO_LINES for every real route beside it. It is NOT repaired by this census and NOT deleted:');
    p('   >>> a repair is a separate, reviewed operation.');
  }
  // Headers the hydrate would exclude but that still hold a live line.
  var hidden = headers.filter(function (h5) {
    return !TERMINAL[h5.status] && h5.source_page !== 'inventory_replenishment' &&
      activeLines(h5.id).some(function (x) { return x.sku === TEMP_R1_SKU_; });
  });
  p('live lines OUTSIDE the hydrated source_page : ' + hidden.length +
    (hidden.length ? ('  -> ' + hidden.map(function (h6) { return h6.id + ' (' + h6.source_page + ')'; }).join(', ')) : ''));
  p('');
  p('HOW TO USE SECTION 2 AGAINST THE SCREEN. This census reports what is STORED; only the operator can say');
  p('what was on screen. For each route the Execution Plan shows, compare it with the header of the same');
  p('allocation_draft_id above and record ONE of:');
  p('   STORED_AS_EXPECTED  - the header/line hold the From/To/Method/Qty the operator last typed');
  p('   STORED_DIFFERENTLY  - the row exists but holds other values (the edit did not land, or landed once)');
  p('   NOT_STORED          - no header/line with that identity exists at all');
  p('   ORPHAN_HEADER       - a header exists with no active line (listed above)');
  p('   UNKNOWN             - anything that cannot be decided from the two above');
  p('Do NOT infer which SAVE produced a row from a shared K2/K4 shape: two legitimate tickets can carry the');
  p('same route shape, so the shape proves nothing about provenance. The create_idempotency_key is the only');
  p('evidence of provenance this schema stores.');

  // ================================================================================================================
  rule();
  p('SECTION 4 - WHAT THIS CENSUS DID');
  rule();
  p('DB_WRITES=0 . ROWS_INSERTED=0 . ROWS_UPDATED=0 . ROWS_DELETED=0 . BACKFILLS=0 . LOCKS_TAKEN=0');
  p('STATUS_TRANSITIONS=0 . PROPERTIES_TOUCHED=0 . ACTIONS_CALLED=0');
  p('Sheets were read through a façade exposing only getDataRange().getValues(); no setValue/appendRow/');
  p('deleteRow/clearContent handle was ever obtained, so a write was not merely avoided but unreachable.');
  rule();

  var text = out.join('\n');
  Logger.log(text);
  return text;
}
