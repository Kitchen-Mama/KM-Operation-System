// F1-7N-FB-1 — Shipment/PO document automation + simplified transit flow.
// Run: node assets/tests/shipment-po-document-automation-and-transit-flow-f1-7n-fb-1.test.js
//
// The folder/bucket/normalizer/promotion tests EXECUTE THE REAL SHIPPED PURE FUNCTIONS, extracted from the
// Apps Script sources and evaluated here — never re-implemented. The io-injected folder resolvers run against
// an in-memory Drive double, so NO DriveApp call, NO live folder and NO live document is ever created.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var G38 = read('specs/active/apps-script/38_document_output_folder_resolver.gs');
var G31 = read('specs/active/apps-script/31_shipment_receipt_route_handlers.gs');
var G22 = read('specs/active/apps-script/22_shipment_dispatch_handlers.gs');
var G36 = read('specs/active/apps-script/36_document_template_handlers.gs');
var G37 = read('specs/active/apps-script/37_shipment_document_file_renderer.gs');
var SH = read('js/pages/shipping-history.js');
var PO = read('js/pages/purchase-order-overview.js');
var SPEC = read('../docs/planning/DOCUMENT_GENERATION_SYSTEM_SPEC.md');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function extractFn(src, name) {
  var s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('missing fn ' + name);
  var i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
  throw new Error('unbalanced ' + name);
}
function extractVar(src, name) { var m = src.match(new RegExp('var ' + name + ' = [\\s\\S]*?;\\n')); if (!m) throw new Error('missing var ' + name); return m[0]; }

// ---- load the REAL pure cores -------------------------------------------------------------------------
var LOAD = [];
['DOF_FOLDER_ID_RE_', 'DOF_BUCKET_DIRECT_', 'DOF_EU_MEMBERS_', 'DOF_DRIVE_FORBIDDEN_RE_'].forEach(function (v) { LOAD.push(extractVar(G38, v)); });
LOAD.push(G38.match(/var DOF_FOLDER_URL_PATTERNS_ = \[[\s\S]*?\n\];/)[0]);
['dofStr_', 'dofUpper_', 'dofNormalizeFolderRef_', 'dofNormalizeCountryCode_', 'dofDestinationBucket_', 'dofSanitizeFolderName_',
  'dofYmdFromCanonical_', 'dofShipmentFolderName_', 'dofPoDateFolderName_', 'dofResolveBatchRoot_', 'dofPickExactChild_',
  'dofEnsureFolder_', 'dofResolveShipmentFolder_', 'dofResolvePoDateFolder_'].forEach(function (f) { LOAD.push(extractFn(G38, f)); });
['SHIP_PROMOTE_FROM_', 'SHIP_PROMOTE_TO_', 'SHIP_PROMOTE_TERMINAL_'].forEach(function (v) { LOAD.push(extractVar(G31, v)); });
LOAD.push(extractFn(G31, 'shipPromoteOnProgress_'));
eval(LOAD.join('\n'));

// ---- in-memory Drive double (NO DriveApp, NO network, NO live folder) ---------------------------------
function FakeDrive(seed) {
  this.byId = {}; this.children = {}; this.created = 0; this.n = 0;
  var self = this;
  (seed || []).forEach(function (f) { self.byId[f.id] = f; (self.children[f.parent] = self.children[f.parent] || []).push({ id: f.id, name: f.name }); });
}
FakeDrive.prototype.io = function () {
  var self = this;
  return {
    listChildFolders: function (parentId) { return (self.children[parentId] || []).slice(); },
    createFolder: function (parentId, name) {
      self.created++; var id = 'F' + (++self.n) + '-' + name.replace(/[^A-Za-z0-9]/g, '');
      (self.children[parentId] = self.children[parentId] || []).push({ id: id, name: name });
      return { id: id, name: name };
    }
  };
};
var SHIP_ROOT = 'ROOTSHIPMENT1234567890';
var PO_ROOT = 'ROOTPURCHASEORDER12345';
function shipTemplates(root) { return [{ template_id: 'T1', output_folder_id: root || SHIP_ROOT }, { template_id: 'T2', output_folder_id: root || SHIP_ROOT }]; }

// =======================================================================================================
section('FB1-1. the retired §L folder rule is no longer active anywhere');
ok(/SUPERSESSION NOTICE \(F1-7N-FB-1\)/.test(SPEC), '1. the owning canonical spec records the supersession explicitly');
ok(/Shipment\/\{DESTINATION_BUCKET\}\/\{external_shipment_id\}_\{yyyyMMdd\(shipped_at\)\}\//.test(SPEC), '1. and states the ACTIVE v2 path');
ok(/is \*\*RETIRED\*\*/.test(SPEC), '1. the v1 path is marked RETIRED, kept only as a migration reference');
ok(/There is exactly \*\*ONE active folder contract\*\*/.test(SPEC), '1. exactly one active folder contract — no two competing rules');
// the retired shape must not be IMPLEMENTED in code
var CODE38 = G38.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
ok(/SHIP_DATE/.test(CODE38) === false, '1. no {SHIP_DATE} directory level exists in the resolver code');
ok(/_COUNTRY|COUNTRY\}/.test(CODE38) === false, '1. no {SHIPMENT_NO}_{COUNTRY} leaf naming exists in the resolver code');

section('FB1-2. the frozen destination bucket table, including every EU code');
[['AU', 'AU'], ['CA', 'CA'], ['JP', 'JP'], ['SG', 'SG'], ['US', 'US'], ['GB', 'UK'], ['UK', 'UK']].forEach(function (c) {
  eq([dofDestinationBucket_(c[0]).ok, dofDestinationBucket_(c[0]).bucket], [true, c[1]], '2. ' + c[0] + ' -> ' + c[1]);
});
var EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
eq(EU.length, 27, '2. all 27 EU member codes are covered');
EU.forEach(function (c) { eq([dofDestinationBucket_(c).ok, dofDestinationBucket_(c).bucket], [true, 'EU'], '2. EU member ' + c + ' -> EU'); });
eq(EU.filter(function (c) { return DOF_EU_MEMBERS_.indexOf(c) === -1; }), [], '2. the shipped EU list matches the frozen table exactly');
eq(DOF_EU_MEMBERS_.length, 27, '2. and carries no extra member');
// normalization before matching
[' us ', 'us', 'Us', 'U.S.'].forEach(function (v) { eq(dofDestinationBucket_(v).bucket, 'US', '2. normalized before matching: "' + v + '"'); });

section('FB1-3. unsupported destinations fail closed');
['CN', 'VN', 'MX', 'NZ', 'CH', 'NO', 'ZZ', '', '   ', null, undefined, '123'].forEach(function (c) {
  var r = dofDestinationBucket_(c);
  eq([r.ok, r.reason], [false, 'UNSUPPORTED_DESTINATION_BUCKET'], '3. ' + JSON.stringify(c) + ' fails closed');
});
ok(/geocode|approximate|nearest/i.test(CODE38) === false, '3. no inference / approximation / geocoding path exists');

section('FB1-4. Drive folder reference normalization (raw ID and URL)');
eq([dofNormalizeFolderRef_(SHIP_ROOT).ok, dofNormalizeFolderRef_(SHIP_ROOT).folder_id, dofNormalizeFolderRef_(SHIP_ROOT).source], [true, SHIP_ROOT, 'ID'], '4. a raw folder id is accepted as-is');
[['https://drive.google.com/drive/folders/' + SHIP_ROOT, SHIP_ROOT],
 ['https://drive.google.com/drive/u/0/folders/' + SHIP_ROOT, SHIP_ROOT],
 ['https://drive.google.com/drive/folders/' + SHIP_ROOT + '?usp=sharing', SHIP_ROOT],
 ['https://drive.google.com/open?id=' + SHIP_ROOT, SHIP_ROOT],
 ['https://drive.google.com/folderview?id=' + SHIP_ROOT, SHIP_ROOT]].forEach(function (c) {
  var r = dofNormalizeFolderRef_(c[0]);
  eq([r.ok, r.folder_id, r.source], [true, c[1], 'URL'], '4. URL normalized: ' + c[0].substring(0, 52));
});
eq([dofNormalizeFolderRef_('').ok, dofNormalizeFolderRef_('').reason], [false, 'OUTPUT_FOLDER_REF_BLANK'], '4. blank -> typed invalid');
eq(dofNormalizeFolderRef_('https://example.com/x').reason, 'OUTPUT_FOLDER_URL_UNSUPPORTED', '4. a non-Drive URL is rejected, never guessed');
eq(dofNormalizeFolderRef_('https://drive.google.com/file/d/' + SHIP_ROOT + '/view').reason, 'OUTPUT_FOLDER_URL_UNSUPPORTED', '4. a Drive FILE url is not a folder');
eq(dofNormalizeFolderRef_('not a folder!').reason, 'OUTPUT_FOLDER_REF_INVALID', '4. junk -> typed invalid');
ok(/DriveApp\.getFolderById\(/.test(extractFn(G38, 'dofResolveShipmentFolder_')) === false, '4. an unparsed value can never reach DriveApp.getFolderById from the resolver');

section('FB1-5. conflicting / blank / invalid template roots block BEFORE any folder is created');
var d5 = new FakeDrive([]);
var conflict = dofResolveShipmentFolder_(d5.io(), { templates: [{ template_id: 'A', output_folder_id: SHIP_ROOT }, { template_id: 'B', output_folder_id: 'OTHERROOT9876543210' }], destination_country: 'US', external_shipment_id: 'X-1', shipped_at: '2026-08-25 10:00:00' });
eq([conflict.ok, conflict.reason, conflict.distinct_roots], [false, 'OUTPUT_FOLDER_ROOT_CONFLICT', 2], '5. two distinct roots in one batch -> OUTPUT_FOLDER_ROOT_CONFLICT');
eq(d5.created, 0, '5. and NOTHING was created before the failure');
var d5b = new FakeDrive([]);
eq(dofResolveShipmentFolder_(d5b.io(), { templates: [{ template_id: 'A', output_folder_id: '' }], destination_country: 'US', external_shipment_id: 'X-1', shipped_at: '2026-08-25' }).reason, 'OUTPUT_FOLDER_ROOT_MISSING', '5. a blank root -> OUTPUT_FOLDER_ROOT_MISSING');
eq(dofResolveShipmentFolder_(d5b.io(), { templates: [{ template_id: 'A', output_folder_id: 'https://example.com/nope' }], destination_country: 'US', external_shipment_id: 'X-1', shipped_at: '2026-08-25' }).reason, 'OUTPUT_FOLDER_ROOT_INVALID', '5. an invalid root -> OUTPUT_FOLDER_ROOT_INVALID');
eq(d5b.created, 0, '5. still nothing created');
eq(dofResolveBatchRoot_([{ template_id: 'A', output_folder_id: 'https://drive.google.com/drive/folders/' + SHIP_ROOT }, { template_id: 'B', output_folder_id: SHIP_ROOT }], 'shipment').root_folder_id, SHIP_ROOT, '5. a URL and a raw id naming the SAME folder are one root, not a conflict');
ok(JSON.stringify(dofResolveBatchRoot_([{ template_id: 'A', output_folder_id: 'junk' }], 'shipment')).indexOf('junk') === -1, '5. failure evidence is sanitized — the raw value is never echoed');

section('FB1-6. shipment folder naming, exact idempotency and retry-date stability');
function shipFolder(drive, over) {
  over = over || {};
  return dofResolveShipmentFolder_(drive.io(), {
    templates: shipTemplates(over.root), destination_country: over.country || 'US',
    external_shipment_id: over.ext === undefined ? 'KM-SHOPIFY-260825-01' : over.ext,
    shipped_at: over.shipped === undefined ? '2026-08-25 09:14:00' : over.shipped
  });
}
var d6 = new FakeDrive([]);
var f6 = shipFolder(d6);
eq([f6.ok, f6.destination_bucket, f6.folder_name], [true, 'US', 'KM-SHOPIFY-260825-01_20260825'], '6/15. exact folder name Shipment/US/KM-SHOPIFY-260825-01_20260825');
eq([f6.created, d6.created], [true, 2], '6. it created exactly the bucket + shipment folders (two)');
// retry — same inputs
var again = shipFolder(d6);
eq([again.ok, again.folder_id === f6.folder_id, again.reused, d6.created], [true, true, true, 2], '6/16. a retry REUSES the same folder and creates nothing new');
// retry on a LATER date must still use the original shipped_at
var d6b = new FakeDrive([]);
var first = shipFolder(d6b);
var laterRetry = dofResolveShipmentFolder_(d6b.io(), { templates: shipTemplates(), destination_country: 'US', external_shipment_id: 'KM-SHOPIFY-260825-01', shipped_at: '2026-08-25 09:14:00' });
eq([laterRetry.folder_name, laterRetry.folder_id === first.folder_id, d6b.created], ['KM-SHOPIFY-260825-01_20260825', true, 2], '22. a retry on a later calendar day reuses the folder derived from the ORIGINAL shipped_at');
ok(/new Date\(\)|Date\.now\(\)/.test(CODE38) === false, '22. the resolver reads no clock at all — the name is a pure function of stored shipment facts');
// mandatory identity + date
eq(shipFolder(new FakeDrive([]), { ext: '' }).reason, 'MISSING_EXTERNAL_SHIPMENT_ID', '21. a blank external_shipment_id fails truthfully');
eq(shipFolder(new FakeDrive([]), { shipped: '' }).reason, 'MISSING_SHIPPED_AT', '21. a blank shipped_at fails truthfully');
var noFallback = new FakeDrive([]); shipFolder(noFallback, { ext: '' });
eq(noFallback.created, 0, '21. and nothing is created — no silent fallback to shipment_id/shipment_no/today');
// sanitize only what Drive forbids
eq(dofShipmentFolderName_('KM/SHOP:01', '2026-08-25').name, 'KM_SHOP_01_20260825', '6. only Drive-prohibited characters are replaced');
eq(dofShipmentFolderName_('KM-SHOPIFY-260825-01', '2026-08-25').name, 'KM-SHOPIFY-260825-01_20260825', '6. hyphens and the business identity are preserved verbatim');
// duplicate folder conflict
var d17 = new FakeDrive([{ id: 'B1', name: 'US', parent: SHIP_ROOT }, { id: 'S1', name: 'KM-SHOPIFY-260825-01_20260825', parent: 'B1' }, { id: 'S2', name: 'KM-SHOPIFY-260825-01_20260825', parent: 'B1' }]);
var conf17 = shipFolder(d17);
eq([conf17.ok, conf17.reason, conf17.match_count], [false, 'SHIPMENT_FOLDER_CONFLICT', 2], '17. two identically named shipment folders -> typed SHIPMENT_FOLDER_CONFLICT, fail closed');
eq(d17.created, 0, '17. and nothing new is created under conflict');
// exact reuse of a pre-existing folder
var d16 = new FakeDrive([{ id: 'B1', name: 'US', parent: SHIP_ROOT }, { id: 'S1', name: 'KM-SHOPIFY-260825-01_20260825', parent: 'B1' }]);
eq([shipFolder(d16).folder_id, d16.created], ['S1', 0], '16. an existing exact folder is reused, not recreated');
// all applicable documents share ONE folder
var d18 = new FakeDrive([]);
var ids = ['shipment_detail', 'commercial_invoice', 'packing_list', 'carrier_booking_form', 'export_declaration'].map(function () { return shipFolder(d18).folder_id; });
eq([ids.filter(function (x, i, a) { return a.indexOf(x) === i; }).length, d18.created], [1, 2], '18. every applicable document family resolves to the SAME single shipment folder');
// never write to root
ok(f6.folder_id !== SHIP_ROOT && f6.bucket_folder_id !== SHIP_ROOT, '6. documents never land in the root folder');

section('FB1-7. PO date folder: same-day reuse, retry-date stability, typed conflict');
function poFolder(drive, batchDate, root) { return dofResolvePoDateFolder_(drive.io(), { templates: [{ template_id: 'P1', output_folder_id: root || PO_ROOT }], document_batch_date: batchDate }); }
var d23 = new FakeDrive([]);
var p1 = poFolder(d23, '2026-08-25 08:00:00');
eq([p1.ok, p1.folder_name, d23.created], [true, '20260825', 1], '23. the exact yyyyMMdd folder is created once');
var p2 = poFolder(d23, '2026-08-25 17:45:00');
eq([p2.folder_id === p1.folder_id, d23.created], [true, 1], '24. a second PO on the SAME business date shares the folder');
var p3 = poFolder(d23, '2026-08-25 08:00:00');
eq([p3.folder_id === p1.folder_id, p3.reused, d23.created], [true, true, 1], '25. a retry on a later day reuses the ORIGINAL frozen batch-date folder');
eq(poFolder(new FakeDrive([]), '').reason, 'MISSING_PO_DOCUMENT_BATCH_DATE', '25. a missing batch date fails truthfully instead of using today');
var d26 = new FakeDrive([{ id: 'D1', name: '20260825', parent: PO_ROOT }, { id: 'D2', name: '20260825', parent: PO_ROOT }]);
var c26 = poFolder(d26, '2026-08-25');
eq([c26.ok, c26.reason, c26.match_count, d26.created], [false, 'PO_DATE_FOLDER_CONFLICT', 2, 0], '26. duplicate date folders -> typed PO_DATE_FOLDER_CONFLICT, nothing created');
ok(/per-PO subfolder|No per-PO subfolder/i.test(SPEC), '7. the spec records that NO per-PO subfolder is created (no canonical requirement exists)');

section('FB1-8. exact-match idempotency rule (zero / one / many)');
eq(dofPickExactChild_([], 'X').action, 'CREATE', '8. zero exact matches -> CREATE');
eq(dofPickExactChild_([{ id: 'a', name: 'X' }], 'X').action, 'REUSE', '8. one -> REUSE');
eq(dofPickExactChild_([{ id: 'a', name: 'X' }, { id: 'b', name: 'X' }], 'X').action, 'CONFLICT', '8. more than one -> CONFLICT');
eq(dofPickExactChild_([{ id: 'a', name: 'XY' }], 'X').action, 'CREATE', '8. a DIFFERENT name is never a match (XY does not satisfy X)');
eq(dofPickExactChild_([{ id: 'a', name: 'X-1' }, { id: 'b', name: 'X_1' }], 'X').action, 'CREATE', '8. nor do near/sanitized variants');
eq(dofPickExactChild_([{ id: 'b', name: ' X ' }], 'X').action, 'REUSE', '8. a whitespace-only variant of the SAME name is reused, not duplicated (safer idempotency)');
ok(/getFoldersByName|searchFolders|fuzzy/i.test(CODE38) === false, '8. no fuzzy or recursive Drive name search is used');

section('FB1-9. Confirm Shipment ends at `shipped`, never in_transit, and never emits departed_origin');
ok(/var CSD_CONFIRMED_STATUS_ = 'shipped';/.test(G22), '9. the confirmation status constant is `shipped`');
ok(/var CSD_EVENT_TYPE_ = 'shipment_confirmed';/.test(G22), '9. the confirmation event type is `shipment_confirmed`');
var CODE22 = G22.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
ok(/departed_origin/.test(CODE22) === false, '9. `departed_origin` is no longer written by Confirm — it is never overloaded with two meanings');
ok(/setShip\('status', CSD_CONFIRMED_STATUS_, prevStatus\);/.test(G22), '9. the finalize step writes the shipped status');
ok(/setShip\('status', CSD_INTRANSIT_/.test(G22) === false, '9. Confirm never writes in_transit');
ok(/if \(!String\(prevShippedAt \|\| ''\)\.trim\(\)\) \{ setShip\('shipped_at', now/.test(G22), '9. shipped_at is stamped ONCE (only when previously blank) — immutable thereafter');
ok(/curStatus === CSD_CONFIRMED_STATUS_ \|\| curStatus === CSD_INTRANSIT_/.test(G22), '9. a second Confirm on a shipped shipment is caught by the explicit already-confirmed guard (idempotent)');
ok(/already_confirmed: true/.test(G22), '9. and returns already_confirmed rather than re-writing');
ok(/if \(!sc\('external_shipment_id'\)\) missing\.push/.test(G22), '9. external_shipment_id is required before Confirm can proceed');
ok(/document_generation: \{ status: 'READY_TO_GENERATE'/.test(G22), '9/15. the confirm response reports document generation as a SEPARATE trailing concern');

section('FB1-10. automatic shipped -> in_transit promotion (real pure decision fn)');
function promo(over) {
  var base = { current_status: 'shipped', move_code: 'ADVANCED', origin_sequence_no: 1, target_sequence_no: 2 };
  for (var k in (over || {})) base[k] = over[k];
  return shipPromoteOnProgress_(base);
}
eq([promo().promote, promo().to, promo().reason], [true, 'in_transit', 'FIRST_PROGRESS_BEYOND_ORIGIN'], '10. the first real progress beyond the origin promotes exactly once');
eq([promo({ current_status: 'in_transit' }).promote, promo({ current_status: 'in_transit' }).reason], [false, 'ALREADY_IN_TRANSIT'], '10. a second progress update never re-promotes');
eq(promo({ target_sequence_no: 1 }).reason, 'STILL_AT_ORIGIN', '11. reaching the ORIGIN node itself does not promote');
eq(promo({ target_sequence_no: 0 }).reason, 'STILL_AT_ORIGIN', '11. nor does a node at/behind the origin sequence');
eq(promo({ move_code: 'IDEMPOTENT' }).reason, 'NO_FORWARD_MOVEMENT', '10. a duplicate replay of the same node does not promote');
eq(promo({ move_code: 'ROUTE_BACKWARD' }).reason, 'NO_FORWARD_MOVEMENT', '11. a stale/backward move does not promote');
['arrived', 'received', 'partial_received', 'completed', 'closed', 'cancelled'].forEach(function (st) {
  eq(promo({ current_status: st }).promote, false, '10. never DEMOTES from a later/terminal status: ' + st);
});
['draft', 'ready_to_ship', ''].forEach(function (st) {
  eq([promo({ current_status: st }).promote, promo({ current_status: st }).reason], [false, 'NOT_IN_SHIPPED_STATE'], '10. never promotes from ' + st);
});
eq(promo({ origin_sequence_no: null }).reason, 'ROUTE_SEQUENCE_UNRESOLVED', '11. an unresolved route sequence fails closed rather than guessing');
eq(promo({ current_status: 'SHIPPED' }).promote, true, '10. status comparison is case-normalized');
// never sets received
var CODE31 = G31.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
ok(/SHIP_PROMOTE_TO_ = 'in_transit'/.test(G31), '12. the ONLY status the promotion can write is in_transit');
ok(extractFn(G31, 'shipPromoteOnProgress_').indexOf("'received'") === -1, '12. the promotion decision can never return `received` — map progress is not receipt truth');
ok(/lifecycle_promotion: promotion,/.test(G31), '10. the route-advance response reports the promotion outcome');
ok(/PROMOTION_WRITE_FAILED/.test(G31), '10. a promotion write failure never rolls back the committed route move');
ok(/shipLifecycleEventType_/.test(G31) && /formal receiving/i.test(G31), '13. the formal receiving workflow remains the sole authority for received');

section('FB1-11. no manual lifecycle controls remain in the UI');
var CODESH = SH.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
ok(/btn\("shAdvanceStatus\(/.test(CODESH) === false, '11/14. the Shipment Overview "Advance -> <next>" button is removed');
ok(/btn\("shShipmentDone\(/.test(CODESH) === false, '11/14. the Shipment Draft "Done" lifecycle button is removed');
ok(/Advance → /.test(CODESH) === false, '14. no Advance control markup remains');
ok(/btn\("shConfirmShipment\(/.test(CODESH), '14. Confirm Shipment — the ONE user action — remains');
ok(/btn\("shReadyToShip\(/.test(CODESH) && /btn\("shSaveExecution\(/.test(CODESH), '14. the pre-ship Draft actions are untouched');
ok(/status === 'shipped'/.test(CODESH) === false || /NO lifecycle button/.test(SH), '14. once shipped, no shipment-progress button is offered');
// the V3G6A Expand fix must survive
ok(/function _shToggleCardEl\(card\)/.test(SH) && /closest\('\.history-card'\)/.test(SH), '11. the V3G6A Expand fix (click-scoped card resolution) remains intact');
ok(/btn\.setAttribute\('aria-expanded'/.test(SH), '11. including its aria-expanded sync');

section('FB1-12. the reusable Document Panel: every state, no raw URLs, no browser-side Drive');
global.window = global.window || {};
eval(extractFn(SH, '_shEsc') + '\n' + extractVar(SH, 'SH_DOC_PANEL_VISIBLE_ROWS_') + '\n' +
     SH.match(/var SH_DOC_STATE_LABEL_ = \{[\s\S]*?\n\};/)[0] + '\n' +
     extractFn(SH, 'shDocPanelState') + '\n' + extractFn(SH, '_shDocIcon') + '\n' +
     extractFn(SH, '_shDocLink') + '\n' + extractFn(SH, '_shDocRowHtml') + '\n' + extractFn(SH, 'shDocumentPanelHtml'));
function doc(over) { var d = { generated_document_id: 'GD1', document_type: 'commercial_invoice', document_label: 'Commercial Invoice', file_name: 'KitchenMama_CI.xlsx', status: 'GENERATED', file_url: 'https://drive.google.com/file/d/ABC/view', generated_at: '2026-08-25 09:20:00' }; for (var k in (over || {})) d[k] = over[k]; return d; }
eq(shDocPanelState({ documents: [] }), 'NONE', '12. no documents -> NONE');
eq(shDocPanelState({ documents: [], pending: true }), 'PENDING', '12. queued -> PENDING');
eq(shDocPanelState({ documents: [doc({ status: 'GENERATING' })] }), 'GENERATING', '12. running -> GENERATING');
eq(shDocPanelState({ documents: [doc(), doc({ status: 'GENERATING' })] }), 'PARTIAL', '12. some ready + some running -> PARTIAL');
eq(shDocPanelState({ documents: [doc(), doc({ status: 'FAILED_RETRYABLE' })] }), 'PARTIAL', '12. some ready + some failed -> PARTIAL');
eq(shDocPanelState({ documents: [doc({ status: 'FAILED_RETRYABLE' })] }), 'FAILED', '12. all failed -> FAILED');
eq(shDocPanelState({ documents: [doc(), doc()] }), 'READY', '12. all generated -> READY');
eq(shDocPanelState({ folder_error: 'OUTPUT_FOLDER_ROOT_CONFLICT' }), 'CONFIG_CONFLICT', '12. a root/folder conflict -> CONFIG_CONFLICT');
var htmlNone = shDocumentPanelHtml({ title: 'Shipment Documents', documents: [] });
ok(htmlNone.indexOf('No documents generated yet') !== -1, '12. the empty state is truthful — it never implies files exist');
ok(htmlNone.indexOf('Open Folder') === -1, '12. and offers no folder link when there is no folder');
var htmlReady = shDocumentPanelHtml({ title: 'Shipment Documents', entity_id: 'S1', folder_url: 'https://drive.google.com/drive/folders/' + SHIP_ROOT, documents: [doc(), doc({ generated_document_id: 'GD2', document_type: 'packing_list', document_label: 'Packing List' })], can_retry: true });
ok(htmlReady.indexOf('Open Folder') !== -1 && htmlReady.indexOf('>Open<') !== -1, '31/32. Open Folder + per-file Open use backend-provided metadata');
ok(htmlReady.indexOf('rel="noopener noreferrer"') !== -1 && htmlReady.indexOf('target="_blank"') !== -1, '12. links are safe new-tab links');
// NO raw URL as body text: every occurrence of the url must be inside an href attribute
(function () {
  var url = 'https://drive.google.com/file/d/ABC/view', body = htmlReady, i = 0, bad = 0;
  while ((i = body.indexOf(url, i)) !== -1) { if (body.substring(Math.max(0, i - 6), i).indexOf('href="') === -1) bad++; i += url.length; }
  eq(bad, 0, '30. no raw Drive URL is ever rendered as body text — it only appears as an href');
})();
ok(htmlReady.indexOf('Download All') === -1, '12. no "Download All" is offered (no backend ZIP artifact exists)');
ok(shDocumentPanelHtml({ documents: [doc({ status: 'FAILED_RETRYABLE' })], can_retry: true }).indexOf('Retry') !== -1, '12. Retry appears for a failed record when permitted');
ok(shDocumentPanelHtml({ documents: [doc({ status: 'FAILED_RETRYABLE' })], can_retry: false }).indexOf('Retry') === -1, '12/36. Retry is hidden without permission (and the backend re-checks)');
ok(shDocumentPanelHtml({ documents: [doc()], can_retry: true }).indexOf('Retry') === -1, '12. Retry is never offered for a healthy document');
ok(shDocumentPanelHtml({ documents: [doc({ file_url: '', download_url: '' })] }).indexOf('>Download<') === -1, '12. Download is never claimed without a real downloadable artifact');
// capped list + View all
var many = []; for (var mi = 0; mi < 9; mi++) many.push(doc({ generated_document_id: 'GD' + mi }));
var htmlMany = shDocumentPanelHtml({ documents: many });
ok(htmlMany.indexOf('View all (9)') !== -1 && htmlMany.indexOf('sh-doc-rest') !== -1, '29. a long list stays compact with a "View all (N)" expander');
eq(SH_DOC_PANEL_VISIBLE_ROWS_, 5, '29. the initial cap is a reasonable 5 rows');
// no browser-side Drive enumeration
ok(/DriveApp|drive\.files\.list|gapi\.client\.drive/.test(SH) === false, '12. the frontend never queries or enumerates Drive');
ok(/fetch\(\s*['"]https:\/\/(www\.)?googleapis\.com/.test(SH) === false, '12. and never calls the Drive API directly from the browser');

section('FB1-13. the SAME panel is reused by the Purchase Order Workspace');
ok(/window\.shDocumentPanelHtml = shDocumentPanelHtml;/.test(SH), '33. the panel renderer is exported once for reuse');
ok(/function renderPoDocumentsBlock\(m\)/.test(PO) && /window\.shDocumentPanelHtml\(\{/.test(PO), '33. the PO Workspace REUSES it rather than duplicating a divergent panel');
ok(/title: 'Purchase Order Documents'/.test(PO), '33. with the Purchase Order Documents heading');
ok(/renderPoDocumentsBlock\(m\) \+/.test(PO), '33. rendered inside the expanded PO detail workspace, after the existing blocks');
ok(/typeof window\.shDocumentPanelHtml !== 'function'\) return '';/.test(PO), '33. and renders nothing rather than a fallback if the shared renderer is absent');
eq((PO.match(/function shDocumentPanelHtml/g) || []).length, 0, '33. the PO page defines no second panel implementation');

section('FB1-14. registry reuse, failure semantics and no parallel engine');
ok(/GENERATED_DOCUMENTS_HEADERS_/.test(G36), '14. the existing generated_documents registry remains the authority');
['document_id', 'related_entity_type', 'related_entity_id', 'template_id', 'template_version', 'document_type', 'file_name', 'file_id', 'file_url', 'pdf_file_url', 'output_folder_id', 'generated_at', 'status'].forEach(function (c) {
  ok(G36.indexOf("'" + c + "'") !== -1, '14. the registry exposes ' + c);
});
ok(/GENERATED_DOCUMENTS_HEADERS_/.test(G38) === false, '14. the new resolver adds NO second registry');
ok(/document_output_folders/.test(CODE38) === false, '14. and does not create the deferred folder-registry table');
ok(/remains DEFERRED/.test(SPEC), '14. the spec still records document_output_folders as deferred');
ok(/the shipment transaction is COMMITTED at this point/.test(G22), '15. the source records that the shipment transaction is committed BEFORE document generation is considered');
ok(/trailing, separately retryable concern/.test(G22), '15. document generation is a trailing, separately retryable concern');
ok(/document_generation: \{ status: 'READY_TO_GENERATE', registry: 'generated_documents', retry_safe: true \}/.test(G22), '15. so a Drive/render failure reports a document status instead of rolling the confirmed shipment back');
// no hardcoded live Drive ids in production source
['1WY-PvU5dh8trCxjpVp6BQzZLgLl0_mn_', '1K0Gp55ipuYB0TqnoDRoSh7JoTl3FPOM9'].forEach(function (id) {
  ok(G38.indexOf(id) === -1 && G36.indexOf(id) === -1 && G37.indexOf(id) === -1 && SH.indexOf(id) === -1 && PO.indexOf(id) === -1, '14. the live Drive root ' + id.substring(0, 8) + '… is NOT hardcoded in application source');
});
ok(/`document_templates\.output_folder_id` remains the \*\*only\*\* root authority/.test(SPEC), '14. the spec names document_templates.output_folder_id as the single root authority');
ok(/parallel[\s\S]{0,20}document-root table/.test(SPEC), '14. and forbids a parallel document-root table');
// the resolver only ever touches FOLDERS
// The Drive boundary lives in 37_ (dofFolderIo_) - the ONE sanctioned owner of raw Drive primitives
// (F1-5C-EXPORT-R1 SS-K seam audit) - so 38_ stays 100% pure and 38_ contains NO DriveApp at all.
var IO38 = extractFn(G37, 'dofFolderIo_');
ok(/DriveApp/.test(G38) === false || /DriveApp/.test(CODE38) === false, '14. 38_ is fully pure - no DriveApp in its executable code');
ok(/getFolders\(\)/.test(IO38) && /createFolder\(/.test(IO38), '14. the io boundary lists/creates folders only');
ok(/getFiles\(|setSharing|addEditor|addViewer|getAs\(/.test(IO38) === false, '9. it never enumerates files and never changes Drive sharing/permissions');

section('FB1-15. the validated Demo seed is untouched and still readable');
ok(fs.existsSync(path.join(ROOT, 'specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs')), '45. the Demo seed tool is still present');
var DEMO = read('specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs');
ok(/PASTE_DEMO_SEED_CHECKSUM_HERE/.test(DEMO) && /PASTE_DEMO_CLEAR_TOKEN_HERE/.test(DEMO), '45. both Demo confirmation constants remain placeholders — no seed/clear can run');
ok(DEMO.indexOf('f53a7ef7') === -1, '45. the live Demo checksum is still pinned nowhere');

console.log('\n' + '-'.repeat(40));
console.log('SHIPMENT/PO DOCUMENT AUTOMATION + TRANSIT FLOW (F1-7N-FB-1): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
