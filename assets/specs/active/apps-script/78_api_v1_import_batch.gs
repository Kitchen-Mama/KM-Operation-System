





























var IMB_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-PFI2-WDL1-SBX-SO5-CB1';
var IMB_RECEIPTS_ = 'import_batches', IMB_CHANGES_ = 'import_batch_changes';
var IMB_RECEIPT_HEADERS_ = ['import_batch_id', 'domain', 'mode', 'schema_version', 'scope_key', 'content_hash', 'status', 'row_counts_json', 'result_json', 'actor_claimed', 'actor_source', 'file_name', 'created_at', 'updated_at', 'committed_at', 'error'];
var IMB_CHANGE_HEADERS_ = ['change_id', 'import_batch_id', 'domain', 'entity_table', 'entity_id', 'line_id', 'field', 'before_value', 'after_value', 'result', 'movement_id', 'created_at'];
var IMB_STATUS_ = { COMMITTING: 'COMMITTING', COMMITTED: 'COMMITTED', FAILED_ROLLED_BACK: 'FAILED_ROLLED_BACK', UNKNOWN_OUTCOME: 'UNKNOWN_OUTCOME' };
var IMB_MAX_ROWS_ = 2000, IMB_MAX_BODY_CHARS_ = 4 * 1024 * 1024, IMB_MAX_CELL_CHARS_ = 2000, IMB_LOCK_MS_ = 30000;
var IMB_ERROR_CELL_RE_ = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA)$/i;

function imbStr_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function imbLc_(v) { return imbStr_(v).toLowerCase(); }
function imbNow_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss'); }
function imbSha_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function imbOut_(o) { return jsonResponse_(o); }
function imbNo_(code, msg, extra) { return Object.assign({ success: false, code: code, error: msg || code }, extra || {}); }


function imbDomain_(name) {
var n = imbLc_(name);
if (n === 'po_factory_stock' && typeof imbPoFactoryDomain_ === 'function') return imbPoFactoryDomain_();
if (n === 'weekly_draft_lines' && typeof imbWeeklyDraftDomain_ === 'function') return imbWeeklyDraftDomain_();
if (n === 'campaign_builder' && typeof imbCampaignBuilderDomain_ === 'function') return imbCampaignBuilderDomain_();
if (n === 'purchase_order' && typeof imbPoDomain_ === 'function') return imbPoDomain_();
if (n === 'shipment' && typeof imbShipmentDomain_ === 'function') return imbShipmentDomain_();
if (n === 'factory_inventory' && typeof imbFactoryInventoryDomain_ === 'function') return imbFactoryInventoryDomain_();
if (n === 'overseas_inventory' && typeof imbOverseasInventoryDomain_ === 'function') return imbOverseasInventoryDomain_();
return null;
}





function imbReadRequest_(body, dom) {
body = body || {};
var issues = [], sheets = {}, rows = 0;
var mode = imbStr_(body.mode).toUpperCase();
if (dom.modes.indexOf(mode) < 0) issues.push({ code: 'IMPORT_MODE_INVALID', message: 'mode must be one of ' + dom.modes.join(' / '), field: 'mode', value: mode });
if (imbStr_(body.schema_version) !== dom.schema_version) issues.push({ code: 'IMPORT_SCHEMA_VERSION_MISMATCH', message: 'this server reads ' + dom.schema_version + '; download a new template', field: 'schema_version', value: imbStr_(body.schema_version) });
var id = imbStr_(body.import_batch_id);
if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) issues.push({ code: 'IMPORT_BATCH_ID_INVALID', message: 'import_batch_id: 8-80 letters, digits, - or _', field: 'import_batch_id' });
var src = body.sheets && typeof body.sheets === 'object' ? body.sheets : {};
dom.sheets.forEach(function (sn) {
var list = Array.isArray(src[sn]) ? src[sn] : [];
sheets[sn] = list.map(function (r, i) {
var o = {}, rowNo = (r && r.__row) || (i + 1);
Object.keys(r || {}).forEach(function (k) {
if (k === '__row') return;
var v = r[k];
if (v !== null && typeof v === 'object') { issues.push({ code: 'IMPORT_CELL_NOT_PLAIN', sheet: sn, row: rowNo, field: k, message: 'a cell must hold a plain value' }); return; }
var s = v === null || v === undefined ? '' : String(v);
if (/^\s*=/.test(s)) issues.push({ code: 'IMPORT_CELL_FORMULA', sheet: sn, row: rowNo, field: k, message: 'a formula is not accepted; paste its value' });
else if (IMB_ERROR_CELL_RE_.test(s.trim())) issues.push({ code: 'IMPORT_CELL_ERROR_VALUE', sheet: sn, row: rowNo, field: k, message: 'the cell holds an Excel error (' + s.trim() + ')' });
else if (s.length > IMB_MAX_CELL_CHARS_) issues.push({ code: 'IMPORT_CELL_TOO_LONG', sheet: sn, row: rowNo, field: k, message: 'more than ' + IMB_MAX_CELL_CHARS_ + ' characters' });
o[k] = typeof v === 'number' || typeof v === 'boolean' ? v : s;
});
o.__row = rowNo;
return o;
});
rows += sheets[sn].length;
});
Object.keys(src).forEach(function (sn) { if (dom.sheets.indexOf(sn) < 0) issues.push({ code: 'IMPORT_SHEET_UNKNOWN', sheet: sn, message: 'this importer reads ' + dom.sheets.join(' + ') }); });
if (rows > (dom.maxRows || IMB_MAX_ROWS_)) issues.push({ code: 'IMPORT_TOO_MANY_ROWS', message: rows + ' rows; the limit is ' + (dom.maxRows || IMB_MAX_ROWS_) + ' - split the file' });
if (!rows) issues.push({ code: 'IMPORT_EMPTY', message: 'no data rows' });
var scope = body.scope && typeof body.scope === 'object' ? body.scope : {};
// SHIP-OPEN: the uploaded file's own _SYSTEM metadata (template id / version, mode, scope written at Download), plain text only. A domain
// may compare it with the dialog's scope (80_ does); it is not part of the content hash, so no existing receipt changes meaning.
var fm0 = body.file_meta && typeof body.file_meta === 'object' && !Array.isArray(body.file_meta) ? body.file_meta : null, fileMeta = null;
if (fm0) { fileMeta = {}; ['template_id', 'template_version', 'module', 'mode', 'scope'].forEach(function (k) { var x = fm0[k]; if (x !== undefined && x !== null && typeof x !== 'object') fileMeta[k] = String(x).slice(0, 2000); }); }
return { id: id, mode: mode, scope: scope, sheets: sheets, rows: rows, issues: issues, file_name: imbStr_(body.file && body.file.name).slice(0, 200),
actor: imbStr_(body.actor).slice(0, 120) || 'unknown', file_meta: fileMeta };
}
function imbSorted_(o) {
if (Array.isArray(o)) return o.map(imbSorted_);
if (o && typeof o === 'object') { var r = {}; Object.keys(o).sort().forEach(function (k) { if (k !== '__row') r[k] = imbSorted_(o[k]); }); return r; }
return o === null || o === undefined ? '' : (typeof o === 'number' ? o : String(o));
}
function imbScopeKey_(scope) { return JSON.stringify(imbSorted_(scope || {})); }

function imbContentHash_(dom, req) {
return imbSha_(JSON.stringify({ domain: dom.domain, mode: req.mode, schema_version: dom.schema_version, scope: imbSorted_(req.scope), sheets: imbSorted_(req.sheets) }));
}


function imbSheets_(ss) {
var r = ss.getSheetByName(IMB_RECEIPTS_), c = ss.getSheetByName(IMB_CHANGES_);
if (!r || !c) return null;
var hr = r.getRange(1, 1, 1, Math.max(1, r.getLastColumn())).getValues()[0].map(imbStr_), hc = c.getRange(1, 1, 1, Math.max(1, c.getLastColumn())).getValues()[0].map(imbStr_);
if (IMB_RECEIPT_HEADERS_.some(function (h) { return hr.indexOf(h) < 0; }) || IMB_CHANGE_HEADERS_.some(function (h) { return hc.indexOf(h) < 0; })) return null;
return { receipts: r, changes: c, hr: hr, hc: hc };
}
function imbRows_(sheet) { var d = sheet.getDataRange().getValues(); if (d.length < 2) return []; var h = d[0].map(imbStr_); return d.slice(1).map(function (r, i) { var o = { __sheetRow: i + 2 }; h.forEach(function (k, j) { if (k) o[k] = r[j]; }); return o; }); }
function imbFindReceipt_(S, id) { var m = imbRows_(S.receipts).filter(function (r) { return imbStr_(r.import_batch_id) === id; }); return m.length ? m[m.length - 1] : null; }
function imbRowArray_(headers, obj) { return headers.map(function (h) { var v = obj[h]; return v === undefined || v === null ? '' : v; }); }
function imbSetReceipt_(S, row, obj) {
if (!row) { S.receipts.appendRow(imbRowArray_(S.hr, obj)); return S.receipts.getLastRow(); }
Object.keys(obj).forEach(function (k) { var c = S.hr.indexOf(k); if (c >= 0) S.receipts.getRange(row, c + 1).setValue(obj[k]); });
return row;
}


// INT-CAND3: after a throwing append - n0 = the last row before it, count = rows it writes. Landed in full -> journaled (undone);
// nothing landed -> nothing; a partial or unreadable sheet -> 'unknown' (the commit then reports IMPORT_OUTCOME_UNKNOWN).
function imbJournalLanded_(j, sheet, n0, count) {
var n1 = -1; try { n1 = sheet.getLastRow(); } catch (e) { n1 = -1; }
if (n1 === n0) return;
if (n1 === n0 + count) { j.push(count === 1 ? { kind: 'row', sheet: sheet, row: n1 } : { kind: 'rows', sheet: sheet, row: n0 + 1, count: count }); return; }
j.push({ kind: 'unknown', sheet: sheet, before: n0, after: n1, count: count });
}
function imbJournal_() {
var j = [], changes = [];
return {
entries: j, changes: changes,
deleteRow: function (sheet, row) {
var before = sheet.getDataRange().getValues(), values = before[row - 1], expected = before.slice();
if (!values || row < 2) throw new Error('IMPORT_DELETE_ROW_INVALID'); expected.splice(row - 1, 1);
try { sheet.deleteRow(row); } catch (err) {
  try { var actual = sheet.getDataRange().getValues();
    if (JSON.stringify(actual) === JSON.stringify(expected)) j.push({ kind: 'deleted_row', sheet: sheet, row: row, values: values });
    else if (JSON.stringify(actual) !== JSON.stringify(before)) j.push({ kind: 'unknown', sheet: sheet });
  } catch (readError) { j.push({ kind: 'unknown', sheet: sheet }); }
  throw err;
}
j.push({ kind: 'deleted_row', sheet: sheet, row: row, values: values });
},
// INT-CAND3 (local candidate): a write is journaled even when it LANDS and then throws (its answer lost) - the previous value BEFORE
// the write; an append is located by the last row before and after; what cannot be located is 'unknown' and undo counts it failed.
setCell: function (sheet, row, col0, value) { var cell = sheet.getRange(row, col0 + 1), prev = cell.getValue(); j.push({ kind: 'cell', sheet: sheet, row: row, col: col0, prev: prev }); cell.setValue(value); return prev; },
appendRow: function (sheet, headers, obj) { var n0 = sheet.getLastRow(); try { sheet.appendRow(imbRowArray_(headers, obj)); } catch (e) { imbJournalLanded_(j, sheet, n0, 1); throw e; } var r = sheet.getLastRow(); j.push({ kind: 'row', sheet: sheet, row: r }); return r; },

appendRows: function (sheet, headers, objs) {
if (!objs.length) return 0;
var start = sheet.getLastRow() + 1;
try { sheet.getRange(start, 1, objs.length, headers.length).setValues(objs.map(function (o) { return imbRowArray_(headers, o); })); } catch (e) { imbJournalLanded_(j, sheet, start - 1, objs.length); throw e; }
j.push({ kind: 'rows', sheet: sheet, row: start, count: objs.length }); return start;
},
push: function (entry) { j.push(entry); },
change: function (c) { changes.push(c); },
undo: function () { var failed = 0; for (var i = j.length - 1; i >= 0; i--) { var e = j[i]; try { if (e.kind === 'cell') e.sheet.getRange(e.row, e.col + 1).setValue(e.prev); else if (e.kind === 'row') e.sheet.deleteRow(e.row); else if (e.kind === 'rows') e.sheet.deleteRows(e.row, e.count); else if (e.kind === 'deleted_row') { e.sheet.insertRowsBefore(e.row, 1); e.sheet.getRange(e.row, 1, 1, e.values.length).setValues([e.values]); } else if (e.kind === 'unknown') failed++; } catch (x) { failed++; } } try { SpreadsheetApp.flush(); } catch (x2) {} return failed; }
};
}


function imbDb_() { return SpreadsheetApp.openById(prodExpectedDbId_()); }
function imbResolve_(body) {
if (JSON.stringify(body || {}).length > IMB_MAX_BODY_CHARS_) return { no: imbNo_('IMPORT_PAYLOAD_TOO_LARGE', 'the request is larger than ' + IMB_MAX_BODY_CHARS_ + ' characters - split the file') };
var dom = imbDomain_(body && body.domain);
if (!dom) return { no: imbNo_('IMPORT_DOMAIN_UNKNOWN', 'domain must be purchase_order / shipment / factory_inventory / overseas_inventory') };
return { dom: dom };
}
function handleImportTemplateGet_(body) {
var r = imbResolve_(body); if (r.no) return imbOut_(r.no);
var ss = imbDb_(), mode = imbStr_(body.mode).toUpperCase();
if (r.dom.modes.indexOf(mode) < 0) return imbOut_(imbNo_('IMPORT_MODE_INVALID', 'mode must be one of ' + r.dom.modes.join(' / ')));
try { var t = r.dom.template(ss, { mode: mode, scope: body.scope || {}, include_data: !!body.include_data }); return imbOut_(Object.assign({ success: true, domain: r.dom.domain, mode: mode, schema_version: r.dom.schema_version, exported_at: imbNow_() }, t)); }
catch (e) { return imbOut_(imbNo_(e && e.importCode || 'IMPORT_TEMPLATE_FAILED', imbStr_(e && e.message || e))); }
}

function imbEvaluate_(ss, dom, req) {
if (req.issues.length) return { ok: false, issues: req.issues, plan: null, preview: {}, state_digest: '' };
var v = dom.validate(ss, req) || {};
var issues = req.issues.concat(v.issues || []);
return { ok: !issues.length, issues: issues, plan: v.plan, preview: v.preview || {}, state_digest: imbSha_(JSON.stringify(imbSorted_(v.state || {}))) };
}
function handleImportValidate_(body) {
var r = imbResolve_(body); if (r.no) return imbOut_(r.no);
var dom = r.dom, req = imbReadRequest_(body, dom), ss = imbDb_();
if (req.issues.some(function (i) { return /^IMPORT_(MODE|SCHEMA_VERSION|BATCH_ID|TOO_MANY|EMPTY|SHEET_UNKNOWN)/.test(i.code); })) return imbOut_(imbNo_('IMPORT_REQUEST_INVALID', 'the file cannot be read as this import', { issues: req.issues, writes_performed: 0 }));
var hash = imbContentHash_(dom, req), S = imbSheets_(ss), prior = S ? imbFindReceipt_(S, req.id) : null;
var ev; try { ev = imbEvaluate_(ss, dom, req); } catch (e) { return imbOut_(imbNo_('IMPORT_VALIDATION_FAILED', imbStr_(e && e.message || e), { writes_performed: 0 })); }
return imbOut_({ success: true, domain: dom.domain, mode: req.mode, import_batch_id: req.id, content_hash: hash, valid: ev.ok, issues: ev.issues, preview: ev.preview, preview_digest: ev.state_digest,
schema_ready: !!S, receipt: prior ? { status: imbStr_(prior.status), same_content: imbStr_(prior.content_hash) === hash && imbStr_(prior.mode) === req.mode } : null, writes_performed: 0 });
}
function handleImportCommit_(body) {
var r = imbResolve_(body); if (r.no) return imbOut_(r.no);
var dom = r.dom, req = imbReadRequest_(body, dom), ss = imbDb_();
if (req.issues.some(function (i) { return /^IMPORT_(MODE|SCHEMA_VERSION|BATCH_ID|TOO_MANY|EMPTY|SHEET_UNKNOWN)/.test(i.code); })) return imbOut_(imbNo_('IMPORT_REQUEST_INVALID', 'the file cannot be read as this import', { issues: req.issues, writes_performed: 0 }));
var hash = imbContentHash_(dom, req), lock = LockService.getScriptLock();
try { if (!lock.tryLock(IMB_LOCK_MS_)) return imbOut_(imbNo_('LOCK_UNAVAILABLE', 'another write is in progress; nothing was written - retry', { retryable: true, writes_performed: 0 })); }
catch (eL) { return imbOut_(imbNo_('LOCK_UNAVAILABLE', imbStr_(eL && eL.message || eL), { retryable: true, writes_performed: 0 })); }
var J = null, S = null, row = 0;
try {
S = imbSheets_(ss);
if (!S) return imbOut_(imbNo_('IMPORT_SCHEMA_NOT_PROVISIONED', 'the ' + IMB_RECEIPTS_ + ' / ' + IMB_CHANGES_ + ' sheets are missing or incomplete - nothing was written (an approved migration provisions them)', { writes_performed: 0 }));
var prior = imbFindReceipt_(S, req.id);
if (prior) {
var same = imbStr_(prior.content_hash) === hash && imbStr_(prior.mode) === req.mode && imbStr_(prior.domain) === dom.domain;
if (!same) return imbOut_(imbNo_('IMPORT_BATCH_CONFLICT', 'this batch id was already used with a different file or mode - nothing was written; start a new import', { import_batch_id: req.id, writes_performed: 0 }));
var st = imbStr_(prior.status);
if (st === IMB_STATUS_.COMMITTED) { var res = {}; try { res = JSON.parse(prior.result_json || '{}'); } catch (eP) {} return imbOut_({ success: true, replayed: true, import_batch_id: req.id, status: st, result: res, writes_performed: 0, note: 'This batch was already committed; nothing was applied again.' }); }
if (st !== IMB_STATUS_.FAILED_ROLLED_BACK) return imbOut_(imbNo_('IMPORT_BATCH_OUTCOME_UNKNOWN', 'an earlier run of this batch did not finish (' + st + ') - nothing is applied again automatically; review its audit rows', { import_batch_id: req.id, status: st, audit_rows: imbRows_(S.changes).filter(function (c) { return imbStr_(c.import_batch_id) === req.id; }).length, writes_performed: 0 }));
row = prior.__sheetRow;
}
var ev = imbEvaluate_(ss, dom, req);
if (!ev.ok) return imbOut_(imbNo_('IMPORT_VALIDATION_FAILED', 'the file no longer validates - nothing was written. Every refused row is named in issues (row + code); fix those rows in the file and validate it again - the rows not named are not refused by themselves', { issues: ev.issues, writes_performed: 0 }));
if (imbStr_(body.preview_digest) !== ev.state_digest) return imbOut_(imbNo_('IMPORT_PREVIEW_STALE', 'the data changed since the preview (another receipt, shipment or import) - nothing was written; validate again', { preview: ev.preview, preview_digest: ev.state_digest, writes_performed: 0 }));
if (dom.domain === 'po_factory_stock' || dom.domain === 'factory_inventory') {
if (typeof pfaCommit_ !== 'function') return imbOut_(imbNo_('IMPORT_ATOMIC_WRITER_MISSING', 'Install the matching 82a_factory_atomic_commit.gs module before importing factory stock. Nothing was written.', { writes_performed: 0 }));
return imbOut_(pfaCommit_(ss, dom, req, ev, S, row, hash));
}
var now = imbNow_();
row = imbSetReceipt_(S, row, { import_batch_id: req.id, domain: dom.domain, mode: req.mode, schema_version: dom.schema_version, scope_key: imbScopeKey_(req.scope), content_hash: hash, status: IMB_STATUS_.COMMITTING,
row_counts_json: JSON.stringify((ev.preview && ev.preview.counts) || {}), result_json: '', actor_claimed: req.actor, actor_source: 'CLIENT_CLAIM_UNVERIFIED', file_name: req.file_name, created_at: now, updated_at: now, committed_at: '', error: '' });
SpreadsheetApp.flush();
J = imbJournal_();
var out = dom.apply(ss, ev.plan, { journal: J, batch_id: req.id, mode: req.mode, actor: req.actor, now: now, scope: req.scope }) || {};
var n = 0;
J.appendRows(S.changes, S.hc, J.changes.map(function (c) {
return { change_id: req.id + '-' + (++n), import_batch_id: req.id, domain: dom.domain, entity_table: c.entity_table, entity_id: c.entity_id, line_id: c.line_id || '', field: c.field,
before_value: c.before === undefined || c.before === null ? '' : String(c.before), after_value: c.after === undefined || c.after === null ? '' : String(c.after), result: c.result || 'APPLIED', movement_id: c.movement_id || '', created_at: now };
}));
var result = Object.assign({ counts: (ev.preview && ev.preview.counts) || {}, audit_rows: n }, out.result || {});
imbSetReceipt_(S, row, { status: IMB_STATUS_.COMMITTED, result_json: JSON.stringify(result).slice(0, 45000), updated_at: now, committed_at: now });
SpreadsheetApp.flush();
return imbOut_({ success: true, import_batch_id: req.id, status: IMB_STATUS_.COMMITTED, result: result, writes_performed: J.entries.length });
} catch (e) {
var undoFailed = J ? J.undo() : 0, msg = imbStr_(e && e.message || e);
if (J && dom.verifyRollback) { try { if (!dom.verifyRollback(ss, ev.plan)) undoFailed++; } catch (rollbackReadError) { undoFailed++; } }
if (undoFailed && dom.onUnknown) { try { dom.onUnknown(ss, ev.plan, req); } catch (unknownMarkerError) { undoFailed++; } }
var st2 = undoFailed ? IMB_STATUS_.UNKNOWN_OUTCOME : IMB_STATUS_.FAILED_ROLLED_BACK;
try { if (S && row) { imbSetReceipt_(S, row, { status: st2, error: msg.slice(0, 1000), updated_at: imbNow_() }); SpreadsheetApp.flush(); } } catch (eR) { st2 = IMB_STATUS_.UNKNOWN_OUTCOME; }
return imbOut_(imbNo_(st2 === IMB_STATUS_.UNKNOWN_OUTCOME ? 'IMPORT_OUTCOME_UNKNOWN' : 'IMPORT_FAILED_ROLLED_BACK', st2 === IMB_STATUS_.UNKNOWN_OUTCOME ? 'the import failed and could not be fully undone - review the audit rows before anything else; nothing is retried automatically: ' + msg : 'the import failed and every change it made was undone: ' + msg, { import_batch_id: req.id, status: st2, undo_failures: undoFailed }));
} finally { try { lock.releaseLock(); } catch (eU) {} }
}
function handleImportReceiptGet_(body) {
var ss = imbDb_(), S = imbSheets_(ss), id = imbStr_(body && body.import_batch_id);
if (!S) return imbOut_(imbNo_('IMPORT_SCHEMA_NOT_PROVISIONED', 'no import receipts in this deployment'));
var r = imbFindReceipt_(S, id); if (!r) return imbOut_(imbNo_('IMPORT_BATCH_NOT_FOUND', 'no batch ' + id));
if (body && body.domain && imbStr_(r.domain) !== imbStr_(body.domain)) return imbOut_(imbNo_('IMPORT_RECEIPT_SCOPE_MISMATCH', 'This receipt belongs to another domain; no receipt details returned.'));
var ch = imbRows_(S.changes).filter(function (c) { return imbStr_(c.import_batch_id) === id; }).map(function (c) { delete c.__sheetRow; return c; });
delete r.__sheetRow;
// SHIP-OPEN 2a: a batch that is not COMMITTED gets the domain's READ-ONLY reconcile (what its id left in the rows). Nothing is written,
// the receipt status is never changed here, and a COMMITTING batch is never reported as applied.
var rec = null;
if (imbStr_(r.status) !== IMB_STATUS_.COMMITTED) { var dm = imbDomain_(r.domain); if (dm && typeof dm.residue === 'function') { try { rec = dm.residue(ss, id, r); } catch (eRc) { rec = { verdict: 'RECONCILE_READ_FAILED', error: imbStr_(eRc && eRc.message || eRc), read_only: true, writes_performed: 0 }; } } }
return imbOut_(Object.assign({ success: true, receipt: r, changes: ch.slice(0, 2000), changes_total: ch.length }, rec ? { reconcile: rec } : {}));
}
function handleImportHistoryList_(body) {
var ss = imbDb_(), S = imbSheets_(ss), d = imbLc_(body && body.domain), lim = Math.min(200, Math.max(1, parseInt(body && body.limit, 10) || 50));
if (!S) return imbOut_({ success: true, schema_ready: false, batches: [] });
var rs = imbRows_(S.receipts).filter(function (r) { return !d || imbLc_(r.domain) === d; }).map(function (r) { delete r.__sheetRow; delete r.result_json; return r; });
return imbOut_({ success: true, schema_ready: true, batches: rs.slice(-lim).reverse() });
}




var IMB_CLEAR_TOKEN_ = '[CLEAR]';
function imbCell_(row, key) { if (!row || !Object.prototype.hasOwnProperty.call(row, key)) return { absent: true }; var v = row[key]; var s = v === null || v === undefined ? '' : (typeof v === 'number' ? v : String(v).trim()); return { absent: false, blank: s === '', clear: s === IMB_CLEAR_TOKEN_, value: s }; }
function imbInt_(v) { var s = imbStr_(v); if (!/^-?\d+$/.test(s)) return null; var n = parseInt(s, 10); return isFinite(n) ? n : null; }

function imbMoney_(v) { var s = imbStr_(v).replace(/,/g, ''); return /^-?\d+(\.\d{1,4})?$/.test(s) ? s : null; }
function imbDate_(v) {
if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'Asia/Taipei', 'yyyy-MM-dd');
var s = imbStr_(v), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return null;
var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? s : null;
}
function imbIssue_(issues, sheet, row, field, code, message, value) { issues.push({ sheet: sheet, row: row, field: field, code: code, message: message, value: value === undefined ? '' : String(value).slice(0, 120) }); }
function imbDigestOf_(obj, keys) { var o = {}; keys.forEach(function (k) { o[k] = obj && obj[k] !== undefined && obj[k] !== null ? String(obj[k]) : ''; }); return imbSha_(JSON.stringify(o)).slice(0, 16); }
