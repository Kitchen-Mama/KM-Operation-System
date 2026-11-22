
























// Restored from the reviewed AD3-c2 renderer; DW2 adds safe read-only probe diagnostics and a deployment pin.
var DFO_BUILD_VERSION_ = 'DW2-RENDERER-20261122';
var DFO_SUPPORTED_TYPES_ = { google_sheet: 'application/vnd.google-apps.spreadsheet', google_doc: 'application/vnd.google-apps.document' };



function dfoStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function dfoLc_(v) { return dfoStr_(v).toLowerCase(); }
function dfoCell_(v) { return (v === null || v === undefined) ? '' : String(v); }
function dfoWrap_(token) { return '{{' + token + '}}'; }
function dfoSupportedType_(type) { return !!DFO_SUPPORTED_TYPES_[dfoLc_(type)]; }
function dfoValidateAsset_(template) {
if (!dfoStr_(template && template.template_file_id)) return { ok: false, error: 'DOCUMENT_TEMPLATE_ASSET_MISSING' };
if (!dfoSupportedType_(template.template_file_type)) return { ok: false, error: 'DOCUMENT_TEMPLATE_ASSET_TYPE_UNSUPPORTED', type: dfoStr_(template.template_file_type), supported: Object.keys(DFO_SUPPORTED_TYPES_) };
return { ok: true };
}

function dfoSplitValues_(values) {
var scalars = {}, collections = {};
var v = values || {};
Object.keys(v).forEach(function (k) { if (Object.prototype.toString.call(v[k]) === '[object Array]') collections[k] = v[k]; else scalars[k] = v[k]; });
return { scalars: scalars, collections: collections };
}



function dfoScalarCtx_(scalars, meta) {
var ctx = {}; var s = scalars || {}, m = meta || {};
ctx.DOCUMENT_TYPE = dfoStr_(m.document_type); ctx.SHIPMENT_ID = dfoStr_(m.shipment_id);
ctx.SHIPMENT_NO = dfoStr_(m.shipment_no) || dfoStr_(m.shipment_id); ctx.SNAPSHOT_ID = dfoStr_(m.snapshot_id);
ctx.SNAPSHOT_VERSION = dfoStr_(m.snapshot_version); ctx.DISPATCH_DATE = dfoStr_(m.dispatch_date);
Object.keys(s).forEach(function (k) { if (dfoStr_(s[k]) !== '' || !ctx[k]) ctx[k] = s[k]; });
return ctx;
}


function dfoFillText_(text, primary, secondary) {
return dfoCell_(text).replace(/\{\{([A-Z0-9_]+)\}\}/g, function (m, k) {
var c = [primary, secondary].filter(function (x) { return x && Object.prototype.hasOwnProperty.call(x, k); })[0];
return c ? dfoCell_(c[k]) : '';
});
}


function dfoFillCell_(cell, primary, secondary) {
var s = dfoCell_(cell);
var whole = s.match(/^\{\{([A-Z0-9_]+)\}\}$/);
if (whole) {
var k = whole[1];
if (primary && Object.prototype.hasOwnProperty.call(primary, k)) return primary[k];
if (secondary && Object.prototype.hasOwnProperty.call(secondary, k)) return secondary[k];
return '';
}
return dfoFillText_(s, primary, secondary);
}

function dfoRowChildKeys_(row) {
var keys = {}; (row || []).forEach(function (cell) { var m = dfoCell_(cell).match(/\{\{([A-Z0-9_]+)\}\}/g) || []; m.forEach(function (t) { keys[t.replace(/[{}]/g, '')] = 1; }); });
return keys;
}
function dfoCollectionChildTokens_(items) {
var set = {}; (items || []).forEach(function (it) { Object.keys(it || {}).forEach(function (k) { set[k] = 1; }); }); return set;
}




function dfoFillSheetMatrix_(matrix, ctx, collections) {
var cols = collections || {};

var colInfo = Object.keys(cols).map(function (name) { return { name: name, items: cols[name] || [], childTokens: dfoCollectionChildTokens_(cols[name] || []) }; });
var out = [];
(matrix || []).forEach(function (row) {
var childKeys = dfoRowChildKeys_(row);

var match = null;
for (var i = 0; i < colInfo.length; i++) {
var ci = colInfo[i], hit = false;
for (var t in ci.childTokens) { if (childKeys[t]) { hit = true; break; } }
if (hit) { match = ci; break; }
}
if (match) {
match.items.forEach(function (item) {
out.push((row || []).map(function (cell) { return dfoFillCell_(cell, item, ctx); }));
});
} else {
out.push((row || []).map(function (cell) { return dfoFillCell_(cell, ctx, null); }));
}
});
return out;
}

function dfoFilename_(rule, ctx) {
var name = dfoStr_(rule) ? dfoFillText_(rule, ctx) : ('KitchenMama_' + dfoStr_(ctx.DOCUMENT_TYPE) + '_' + dfoStr_(ctx.SHIPMENT_NO) + '_' + dfoStr_(ctx.SNAPSHOT_ID));
name = name.replace(/[\\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
return name || ('KitchenMama_' + dfoStr_(ctx.SNAPSHOT_ID || ctx.SHIPMENT_ID));
}





function dfoTokens_(t) { return (dfoCell_(t).match(/\{\{[A-Z0-9_]+\}\}/g) || []).map(function (x) { return x.slice(2, -2); }); }
function dfoSheetValue_(v) { return typeof v === 'string' && /^[=+]/.test(v) ? "'" + v : v; }
function dfoPlanSheet_(vals, fx, w, x) {
var cells = [], has = {}, anchors = [], at = {}, via = [], mg = (x && x.merges) || [], q;
vals.forEach(function (row, r) { row.forEach(function (v, c) { var t = fx[r][c] ? [] : dfoTokens_(v); if (t.length) { cells.push({ row: r + 1, col: c + 1, text: dfoCell_(v), t: t }); t.forEach(function (k) { has[k] = 1; }); } }); });
var binds = [], bb;
for (q = 0; x && q < (x.binds || []).length; q++) {
bb = x.binds[q];
if (!Object.prototype.hasOwnProperty.call(w.scalars || {}, bb.key)) return { error: 'DOCUMENT_BINDING_UNKNOWN ' + w.name + ': ' + bb.name };
if (bb.cells !== 1) return { error: 'DOCUMENT_BINDING_NOT_ONE_CELL ' + w.name + ': ' + bb.name };
if (has[bb.key]) return { error: 'DOCUMENT_BINDING_AMBIGUOUS ' + w.name + ': ' + bb.key + ' is a token and ' + bb.name };
if (fx[bb.row - 1] && fx[bb.row - 1][bb.col - 1]) return { error: 'DOCUMENT_BINDING_ON_FORMULA ' + w.name + '!' + dfoA1_(bb.row, bb.col) };
var bm = dfoMergeAt_(mg, bb.row, bb.col); if (bm && (bm.r1 !== bb.row || bm.c1 !== bb.col)) return { error: 'DOCUMENT_TEMPLATE_MERGE_UNSUPPORTED ' + w.name + '!' + dfoA1_(bb.row, bb.col) + ': a binding inside a merged range' };
has[bb.key] = 1; binds.push(bb);
}
var gone = (w.required || []).filter(function (k) { var s = !has[k] && x && dfoSupply_(fx, w, x, k); if (s) via.push(s); return !has[k] && !s; });
if (gone.length) return { error: 'DOCUMENT_TOKEN_NOT_IN_TEMPLATE ' + w.name + ': ' + gone.join(', ') };
for (q = 0; q < via.length; q++) if (dfoCell_(w.scalars[via[q].key]) !== dfoCell_(x.sib[via[q].tab].scalars[via[q].key])) return { error: 'DOCUMENT_FORMULA_SUPPLY_MISMATCH ' + w.name + '!' + via[q].a1 + ': ' + via[q].key + ' is not the value of ' + via[q].from };
for (q = 0; q < cells.length; q++) { var mm = dfoMergeAt_(mg, cells[q].row, cells[q].col); if (mm && (mm.r1 !== cells[q].row || mm.c1 !== cells[q].col)) return { error: 'DOCUMENT_TEMPLATE_MERGE_UNSUPPORTED ' + w.name + '!' + dfoA1_(cells[q].row, cells[q].col) + ': a token inside a merged range' }; }
for (var key in w.children) {
var own = w.children[key].filter(function (k) { return !Object.prototype.hasOwnProperty.call(w.scalars, k); }), rows = {};
cells.forEach(function (c) { if (c.t.some(function (k) { return own.indexOf(k) >= 0; })) rows[c.row] = 1; });
rows = Object.keys(rows).map(Number);
if (rows.length !== 1 || at[rows[0]]) return { error: (rows.length ? 'DOCUMENT_COLLECTION_ANCHOR_AMBIGUOUS ' : 'DOCUMENT_COLLECTION_ANCHOR_MISSING ') + w.name + ': ' + key };
var a = rows[0], cap = Infinity, r;
for (r = a; r < vals.length && cap === Infinity; r++) if (fx[r].some(function (f) { return f && dfoRange_(f, w.name, w.name, a, 0) !== f; })) cap = r + 1 - a;
for (r = a; r < vals.length && cap === Infinity; r++) if (vals[r].some(function (v, c) { return v !== '' || fx[r][c]; })) cap = r + 1 - a;
var last = cap === Infinity ? vals.length : a + cap - 1;
if (mg.some(function (m) { return m.r1 <= last && m.r2 >= a && m.r1 !== m.r2; })) return { error: 'DOCUMENT_TEMPLATE_MERGE_UNSUPPORTED ' + w.name + ': a merge spanning rows across the line rows of ' + key };
at[a] = 1; anchors.push({ key: key, row: a, cap: cap, cells: cells.filter(function (c) { return c.row === a; }) });
}
return { via: via, anchors: anchors.sort(function (x, y) { return y.row - x.row; }), scalars: cells.filter(function (c) { return !at[c.row]; }), binds: binds };
}



function dfoRange_(f, own, tab, first, last) {
return String(f).split(/("(?:[^"]|"")*")/).map(function (p, i) {
return i % 2 ? p : p.replace(/((?:'(?:[^']|'')+'|[^\s'"!(),=+\-*\/&;:<>^{}]+)!)?(\$?[A-Z]+\$?)(\d+):(\$?[A-Z]+\$?)(\d+)/g, function (m, q, c1, r1, c2) {
var t = !q ? own : q.charAt(0) === "'" ? q.slice(1, -2).replace(/''/g, "'") : q.slice(0, -1);
return t === tab && +r1 === first ? (q || '') + c1 + r1 + ':' + c2 + last : m;
});
}).join('');
}


function dfoRuns_(cells) {
var out = [];
cells.slice().sort(function (x, y) { return x.row - y.row || x.col - y.col; }).forEach(function (c) {
var l = out[out.length - 1];
if (l && l.row === c.row && l.col + l.cells.length === c.col) l.cells.push(c); else out.push({ row: c.row, col: c.col, cells: [c] });
});
return out;
}

function dfoA1_(r, c) { var s = ''; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s + r; }
function dfoColN_(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n; }
function dfoMergeAt_(mg, r, c) { return mg.filter(function (m) { return r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2; })[0]; }


function dfoSupply_(fx, w, x, k) {
for (var r = 0; r < fx.length; r++) for (var c = 0; c < fx[r].length; c++) {
var m = /^=\s*('(?:[^']|'')+'|[^\s'!=(),"]+)!\$?([A-Z]+)\$?(\d+)\s*$/.exec(fx[r][c] || ''), t = m && (m[1].charAt(0) === "'" ? m[1].slice(1, -1).replace(/''/g, "'") : m[1]);
if (m && x.sib[t] && Object.prototype.hasOwnProperty.call(x.sib[t].scalars || {}, k) && x.peek(t, +m[3], dfoColN_(m[2])) === '{{' + k + '}}')
return { key: k, tab: t, row: r + 1, col: c + 1, a1: dfoA1_(r + 1, c + 1), from: t + '!' + m[2] + m[3] };
}
return null;
}




var DFO_DYNAMIC_RE_ = /(^|[^\w.])(INDIRECT|IMPORTRANGE|GETPIVOTDATA|IMPORTDATA|IMPORTXML|IMPORTHTML|IMPORTFEED)\s*\(/i;
function dfoPdfRefs_(t, keep, all, names) {
var out = all.filter(function (n) { return keep.indexOf(n) < 0; }), k, r, c, e, f, a, g, id, u, nm = {}, re = /([A-Za-z_\u00C0-\uFFFF][\w.\u00C0-\uFFFF]*)(\s*\()?/g;
if (!out.length) return '';
for (u in names || {}) if (Object.prototype.hasOwnProperty.call(names, u)) {
if (Object.prototype.hasOwnProperty.call(nm, u.toUpperCase())) return 'DOCUMENT_PDF_SCOPE_DEPENDENCY_UNVERIFIABLE named range ' + u + ': the same name twice';
nm[u.toUpperCase()] = names[u];
}
for (k = 0; k < keep.length; k++) for (r = 0; t[keep[k]] && r < t[keep[k]].fx.length; r++) for (c = 0; c < t[keep[k]].fx[r].length; c++) {
f = String(t[keep[k]].fx[r][c] || '').replace(/"(?:[^"]|"")*"/g, '');
a = keep[k] + '!' + dfoA1_(r + 1, c + 1); g = f.replace(/'(?:[^']|'')+'!|[^\s'"!(),=+\-*\/&;:<>^{}]+!/g, ' ').replace(/\$(?=[A-Za-z0-9])/g, '');
if (f && DFO_DYNAMIC_RE_.test(f)) return 'DOCUMENT_PDF_SCOPE_DEPENDENCY_UNVERIFIABLE ' + a + ': ' + DFO_DYNAMIC_RE_.exec(f)[2].toUpperCase();
for (re.lastIndex = 0; f && (id = re.exec(g)); ) {
if (id[2] || /^(TRUE|FALSE)$/i.test(id[1])) continue;
if (Object.prototype.hasOwnProperty.call(nm, (u = id[1].toUpperCase()))) {
if (all.indexOf(nm[u]) < 0) return 'DOCUMENT_PDF_SCOPE_DEPENDENCY_UNVERIFIABLE ' + a + ': ' + id[1] + ' (its range is unreadable)';
if (out.indexOf(nm[u]) >= 0) return 'DOCUMENT_PDF_SCOPE_REFERENCES_EXCLUDED_TAB ' + a + ' -> ' + nm[u] + ' (' + id[1] + ')';
continue;
}
if (/^[A-Z]{1,3}[1-9]\d*$/.test(u) || (/^[A-Z]{1,3}$/.test(u) && (/:\s*$/.test(g.slice(0, id.index)) || /^\s*:/.test(g.slice(re.lastIndex))))) continue;
return 'DOCUMENT_PDF_SCOPE_DEPENDENCY_UNVERIFIABLE ' + a + ': ' + id[1];
}
for (e = 0; f && e < out.length; e++) if (f.indexOf("'" + out[e].replace(/'/g, "''") + "'!") >= 0 || new RegExp('(^|[^\\w.\'])' + out[e].replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '!').test(f))
return 'DOCUMENT_PDF_SCOPE_REFERENCES_EXCLUDED_TAB ' + keep[k] + '!' + dfoA1_(r + 1, c + 1) + ' -> ' + out[e];
}
return '';
}



function dfoNames_(ss) { var o = {}; (ss.getNamedRanges ? ss.getNamedRanges() : []).forEach(function (n) { try { o[n.getName()] = n.getRange().getSheet().getName(); } catch (e) { o[n.getName()] = null; } }); return o; }

function dfoBindRule_(b, v, tab) {
var d = b.range.getDataValidations ? b.range.getDataValidations() : [[null]], r = d && d[0] && d[0][0], list;
if (!r || String(r.getCriteriaType()) !== 'VALUE_IN_LIST' || r.getAllowInvalid() !== false) return '';
list = (r.getCriteriaValues()[0] || []).map(function (x) { return String(x); });
return list.indexOf(dfoCell_(v)) >= 0 ? '' : 'DOCUMENT_FIELD_VALUE_NOT_ALLOWED ' + tab + '!' + dfoA1_(b.row, b.col) + ': ' + b.key + ' is not in the cell\'s list';
}
function dfoReadTabs_(ss, sheets) {
var t = {}, sib = {};
sheets.forEach(function (w) {
var sh = ss.getSheetByName(w.name); if (!sh) throw new Error('DOCUMENT_WORKSHEET_MISSING ' + w.name);
var dr = sh.getDataRange();
t[w.name] = { sh: sh, n2: dr.getNumColumns(), vals: dr.getValues(), fx: dr.getFormulas(), merges: dr.getMergedRanges().map(function (m) { return { r1: m.getRow(), c1: m.getColumn(), r2: m.getLastRow(), c2: m.getLastColumn() }; }) };
sib[w.name] = w;
});
function peek(tab, r, c) { var o = t[tab]; return o && o.vals[r - 1] && !o.fx[r - 1][c - 1] ? dfoCell_(o.vals[r - 1][c - 1]) : undefined; }
var binds = {};
(ss.getNamedRanges ? ss.getNamedRanges() : []).forEach(function (n) {
var nm = String(n.getName()), r; if (!/^KM_[A-Z0-9_]+$/.test(nm)) return;
r = n.getRange(); (binds[r.getSheet().getName()] = binds[r.getSheet().getName()] || []).push({ name: nm, key: nm.slice(3), row: r.getRow(), col: r.getColumn(), cells: r.getNumRows() * r.getNumColumns(), range: r });
});
Object.keys(t).forEach(function (k) { t[k].x = { merges: t[k].merges, sib: sib, peek: peek, binds: binds[k] || [] }; });
return t;
}



function dfoGenerateFile_(io, template, mapped, meta, opts) {
var v = dfoValidateAsset_(template);
if (!v.ok) return v;
var split = dfoSplitValues_(mapped.values);
var ctx = dfoScalarCtx_(split.scalars, meta);
var filename = dfoFilename_(template.file_name_rule, ctx);






var folderId = dfoStr_(opts && opts.folder_id) || dfoStr_(template.output_folder_id);
var copy;
try { copy = io.copyTemplate(dfoStr_(template.template_file_id), filename, folderId); }
catch (e) { return { ok: false, error: 'DOCUMENT_FILE_COPY_FAILED', message: (e && e.message ? String(e.message) : String(e)) }; }
if (!copy || !copy.file_id) return { ok: false, error: 'DOCUMENT_FILE_COPY_FAILED' };
try {
var matrix = io.readSheetMatrix(copy.file_id);
io.writeSheetMatrix(copy.file_id, dfoFillSheetMatrix_(matrix, ctx, split.collections));
} catch (e2) {
return { ok: false, error: 'DOCUMENT_FILE_FILL_FAILED', message: (e2 && e2.message ? String(e2.message) : String(e2)), partial_file_id: copy.file_id };
}
var pdf = { pdf_file_id: '', pdf_file_url: '' };
if (!opts || opts.exportPdf !== false) {
try { pdf = io.exportPdf(copy.file_id, filename, folderId) || pdf; } catch (e3) { pdf = { pdf_file_id: '', pdf_file_url: '' }; }
}
return { ok: true, file_name: filename, file_id: copy.file_id, file_url: dfoStr_(copy.file_url), pdf_file_id: dfoStr_(pdf.pdf_file_id), pdf_file_url: dfoStr_(pdf.pdf_file_url), output_folder_id: folderId };
}




function dfoRenderPayload_(io, payload, opts) {
payload = payload || {};
var template = {
template_file_id: payload.template_file_id, template_file_type: payload.template_file_type,
file_name_rule: '', template_key: payload.template_key, template_id: payload.template_id
};
var v = dfoValidateAsset_(template);
if (!v.ok) return v;
if (!dfoStr_(payload.folder_id)) return { ok: false, error: 'DOCUMENT_OUTPUT_FOLDER_REQUIRED' };
if (!dfoStr_(payload.file_name)) return { ok: false, error: 'DOCUMENT_FILE_NAME_UNRESOLVED' };
var mapped = { values: {} };
Object.keys(payload.scalars || {}).forEach(function (k) { mapped.values[k] = payload.scalars[k]; });
Object.keys(payload.collections || {}).forEach(function (k) { mapped.values[k] = payload.collections[k]; });
var split = dfoSplitValues_(mapped.values);
var ctx = dfoScalarCtx_(split.scalars, {});
var copy, pre = payload.sheets && io.planWorkbook(dfoStr_(payload.template_file_id), payload.sheets, payload.pdf_sheets, { check_values: true });
if (pre) return { ok: false, error: 'DOCUMENT_TEMPLATE_CONTRACT_INVALID', message: pre };
try { copy = io.copyTemplate(dfoStr_(payload.template_file_id), dfoStr_(payload.file_name), dfoStr_(payload.folder_id)); }
catch (e) { return { ok: false, error: 'DOCUMENT_FILE_COPY_FAILED', message: (e && e.message ? String(e.message) : String(e)) }; }
if (!copy || !copy.file_id) return { ok: false, error: 'DOCUMENT_FILE_COPY_FAILED' };

function failed(err, e, extra) {
var p = { renamed: false };
if (copy.file_id !== dfoStr_(payload.template_file_id)) {
try { io.renameFile(copy.file_id, dfoStr_(payload.file_name) + ' (failed attempt ' + dfoStr_(opts && opts.attempt) + ')', dfoStr_(payload.folder_id)); p.renamed = true; }
catch (eR) { p.rename_error = String(eR && eR.message || eR); }
}
return Object.assign({ ok: false, error: err, message: String(e && e.message || e), partial_file_id: copy.file_id, partial: p }, extra);
}
try {
if (payload.sheets) io.fillWorkbook(copy.file_id, payload.sheets);
else if (dfoLc_(payload.template_file_type) === 'google_doc') io.fillDoc(copy.file_id, ctx, split.collections);
else io.writeSheetMatrix(copy.file_id, dfoFillSheetMatrix_(io.readSheetMatrix(copy.file_id), ctx, split.collections));
} catch (e2) { return failed('DOCUMENT_FILE_FILL_FAILED', e2); }
var pdf = { pdf_file_id: '', pdf_file_url: '' };
if (!opts || opts.exportPdf !== false) {
try { pdf = io.exportPdf(copy.file_id, dfoStr_(payload.file_name), dfoStr_(payload.folder_id), payload.pdf_sheets) || pdf; }
catch (e3) { return failed('DOCUMENT_PDF_EXPORT_FAILED', e3, { file_id: copy.file_id }); }
}
return { ok: true, file_name: dfoStr_(payload.file_name), file_id: copy.file_id, file_url: dfoStr_(copy.file_url),
pdf_file_id: dfoStr_(pdf.pdf_file_id), pdf_file_url: dfoStr_(pdf.pdf_file_url), output_folder_id: dfoStr_(payload.folder_id) };
}









function dofFolderIo_() {
return {
listChildFolders: function (parentId) {
var out = [], it = DriveApp.getFolderById(parentId).getFolders();
while (it.hasNext()) { var f = it.next(); out.push({ id: f.getId(), name: f.getName() }); }
return out;
},
createFolder: function (parentId, name) {
var f = DriveApp.getFolderById(parentId).createFolder(name);
return { id: f.getId(), name: f.getName() };
}
};
}





function dfoProbeError_(e) {
var message = String(e && e.message || e || 'Drive read failed');
var code = /required permissions|permission to call|authorization is required|scope/i.test(message) ? 'GOOGLE_AUTHORIZATION_REQUIRED' :
  /too many|quota|temporar|try again|service unavailable/i.test(message) ? 'GOOGLE_SERVICE_UNAVAILABLE' : 'DRIVE_ACCESS_FAILED';
return { code: code, message: message.replace(/https?:\/\/\S+/g, '[url]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[email]').replace(/[A-Za-z0-9_-]{40,}/g, '[id]').slice(0, 500) };
}
function dofProbeIo_() {
return {
probeFolder: function (folderId) {
try { var f = DriveApp.getFolderById(String(folderId || '').trim()); return { ok: true, id: f.getId(), name: f.getName() }; }
catch (e) { return { ok: false, reason: 'FOLDER_INACCESSIBLE', diagnostic: dfoProbeError_(e) }; }
},
probeFile: function (fileId) {
try { var f = DriveApp.getFileById(String(fileId || '').trim()); return { ok: true, id: f.getId(), name: f.getName(), mime: f.getMimeType() }; }
catch (e) { return { ok: false, reason: 'FILE_INACCESSIBLE', diagnostic: dfoProbeError_(e) }; }
}
};
}

function dfoInside_(file, folderId) {
for (var p = file.getParents(); p.hasNext();) if (p.next().getId() === folderId) return true;
return false;
}

var DFO_TAG_ = '\\{\\{[A-Z0-9_]+\\}\\}';
function dfoTag_(h) { return h.getElement().asText().getText().slice(h.getStartOffset() + 2, h.getEndOffsetInclusive() - 1); }


function dfoRowCols_(row, strict) {
var out = [], n = row.getNumCells();
for (var j = 0, s; j < n; j += s) {
var c = row.getCell(j); s = c.getColSpan();
if (!(s >= 1) || (strict && c.getRowSpan() !== 1)) throw new Error('DOCUMENT_COLLECTION_ROW_UNSUPPORTED merge');
for (var q = 1; q < s; q++) if (j + q >= n || row.getCell(j + q).getColSpan() !== 0) throw new Error('DOCUMENT_COLLECTION_ROW_UNSUPPORTED merge');
out.push(j);
}
return out;
}

function dfoPut_(t, s, e, v) {
var a = t.getAttributes(s), q = {};
Object.keys(a).forEach(function (x) { if (a[x] != null) q[x] = a[x]; });
if (v) { t.insertText(e + 1, v); t.setAttributes(e + 1, e + v.length, q); }
t.deleteText(s, e);
}
function dfoDefaultIo_() {
return {


copyTemplate: function (templateFileId, filename, folderId) {
if (!dfoStr_(folderId)) throw new Error('DOCUMENT_OUTPUT_FOLDER_REQUIRED');
var copy = DriveApp.getFileById(templateFileId).makeCopy(filename, DriveApp.getFolderById(folderId));
if (copy.getId() === templateFileId || !dfoInside_(copy, folderId)) throw new Error('DOCUMENT_COPY_TARGET_INVALID ' + copy.getId());
return { file_id: copy.getId(), file_url: copy.getUrl() };
},
renameFile: function (fileId, name, folderId) {
var f = DriveApp.getFileById(fileId);
if (!dfoInside_(f, folderId)) throw new Error('DOCUMENT_RENAME_TARGET_INVALID');
f.setName(name);
},
readSheetMatrix: function (fileId) {
var sh = SpreadsheetApp.openById(fileId).getSheets()[0];
return sh.getDataRange().getValues();
},
writeSheetMatrix: function (fileId, matrix) {
var sh = SpreadsheetApp.openById(fileId).getSheets()[0];
sh.clearContents();
if (matrix && matrix.length) {
var w = 0; matrix.forEach(function (r) { if (r.length > w) w = r.length; });
var norm = matrix.map(function (r) { var c = r.slice(); while (c.length < w) c.push(''); return c; });
sh.getRange(1, 1, norm.length, w).setValues(norm);
}
SpreadsheetApp.flush();
},




fillDoc: function (fileId, ctx, cols) {
var d = DocumentApp.openById(fileId), hits = [], at = {}, T = DocumentApp.ElementType;
[d.getBody(), d.getHeader(), d.getFooter()].forEach(function (s) { for (var h = s && s.findText(DFO_TAG_); h; h = s.findText(DFO_TAG_, h)) hits.push(h); });
Object.keys(cols).forEach(function (k) {
var m = hits.filter(function (h) { return dfoTag_(h) === k; }), c = m.length === 1 && m[0].getElement().getParent().getParent();
if (!c || c.getType() != T.TABLE_CELL || dfoStr_(c.getText()) !== dfoWrap_(k)) throw new Error('DOCUMENT_COLLECTION_MARKER_INVALID ' + k);
var row = c.getParentRow(), tb = row.getParentTable(), i = tb.getChildIndex(row), vis = dfoRowCols_(row, 1), n = Object.keys(cols[k][0] || {}).length, mk = 0;
if (!i || dfoRowCols_(tb.getRow(i - 1)).join() !== vis.join()) throw new Error('DOCUMENT_COLLECTION_ROW_UNSUPPORTED ' + k + ' header');
if (n > vis.length) throw new Error('DOCUMENT_COLLECTION_CELLS_SHORT ' + k);
vis.slice(0, n).forEach(function (j) {
var x = row.getCell(j), p = x.getChild(0), t = dfoStr_(x.getText());
if (x.getNumChildren() !== 1 || p.getType() != T.PARAGRAPH || p.getNumChildren() > 1 || (p.getNumChildren() && p.getChild(0).getType() != T.TEXT) || (t && t !== dfoWrap_(k))) throw new Error('DOCUMENT_COLLECTION_ROW_UNSUPPORTED ' + k + ' cell');
if (t) mk++;
});
if (n && !mk) throw new Error('DOCUMENT_COLLECTION_ROW_UNSUPPORTED ' + k + ' cell');
at[k] = { row: row, tb: tb, vis: vis };
});
hits.reverse().forEach(function (h) { var k = dfoTag_(h); if (!cols[k]) dfoPut_(h.getElement().asText(), h.getStartOffset(), h.getEndOffsetInclusive(), dfoCell_(ctx[k])); });
Object.keys(cols).forEach(function (k) {
var a = at[k], i = a.tb.getChildIndex(a.row);
cols[k].forEach(function (it, q) {
var r = a.tb.insertTableRow(i + 1 + q, a.row.copy());
if (dfoRowCols_(r, 1).join() !== a.vis.join()) throw new Error('DOCUMENT_COLLECTION_ROW_UNSUPPORTED ' + k + ' copy');
Object.keys(it).forEach(function (f, j) { var t = r.getCell(a.vis[j]).getChild(0).editAsText(), L = t.getText().length, v = dfoCell_(it[f]); if (L) dfoPut_(t, 0, L - 1, v); else if (v) t.insertText(0, v); });
});
a.tb.removeRow(i);
});
d.saveAndClose();
},
planWorkbook: function (templateFileId, sheets, pdf, opts) {
var ss = SpreadsheetApp.openById(templateFileId), bad = '', t;
try { t = dfoReadTabs_(ss, sheets); } catch (e) { return String(e && e.message || e); }
sheets.forEach(function (w) { if (!bad) { var pl = dfoPlanSheet_(t[w.name].vals, t[w.name].fx, w, t[w.name].x); bad = pl.error || '';
if (!bad && opts && opts.check_values) (pl.binds || []).forEach(function (b) { if (!bad) bad = dfoBindRule_(b, w.scalars[b.key], w.name); }); } });
if (!bad && pdf) bad = dfoPdfRefs_(t, pdf, ss.getSheets().map(function (s) { return s.getName(); }), dfoNames_(ss));
return bad;
},
fillWorkbook: function (fileId, sheets) {
var ss = SpreadsheetApp.openById(fileId), t = dfoReadTabs_(ss, sheets), via = [];
var plans = sheets.map(function (w) { var p = dfoPlanSheet_(t[w.name].vals, t[w.name].fx, w, t[w.name].x); if (p.error) throw new Error(p.error); return p; });
sheets.forEach(function (w, wi) {
var sh = t[w.name].sh, ctx = dfoScalarCtx_(w.scalars, {}), p = plans[wi], n2 = t[w.name].n2;
p.via.forEach(function (s) { via.push({ sh: sh, s: s, v: w.scalars[s.key], row: s.row }); });
dfoRuns_(p.scalars).forEach(function (u) { sh.getRange(u.row, u.col, 1, u.cells.length).setValues([u.cells.map(function (c) { return dfoSheetValue_(dfoFillCell_(c.text, ctx, null)); })]); });
(p.binds || []).forEach(function (b) { var bv = w.scalars[b.key]; sh.getRange(b.row, b.col).setValue(dfoSheetValue_(bv == null ? '' : bv)); });
p.anchors.forEach(function (a) {
var items = w.collections[a.key] || [], n = items.length, i;
if (n > a.cap) { sh.insertRowsAfter(a.row + a.cap - 1, n - a.cap); via.forEach(function (q) { if (q.sh === sh && q.row > a.row + a.cap - 1) q.row += n - a.cap; }); }
for (i = 1; i < n; i++) sh.getRange(a.row, 1, 1, n2).copyTo(sh.getRange(a.row + i, 1, 1, n2));
dfoRuns_(a.cells).forEach(function (u) {
var m = []; for (i = 0; i < Math.max(n, 1); i++) m.push(u.cells.map(function (c) { return n ? dfoSheetValue_(dfoFillCell_(c.text, items[i], ctx)) : ''; }));
sh.getRange(a.row, u.col, m.length, u.cells.length).setValues(m);
});
if (n) ss.getSheets().forEach(function (s2) {
var fx = s2.getDataRange().getFormulas();
fx.forEach(function (row, r) { row.forEach(function (f, c) { var g = f && dfoRange_(f, s2.getName(), w.name, a.row, a.row + n - 1); if (g && g !== f) s2.getRange(r + 1, c + 1).setFormula(g); }); });
});
});
});
SpreadsheetApp.flush();
via.forEach(function (q) { if (dfoCell_(q.sh.getRange(q.row, q.s.col).getValue()) !== dfoCell_(q.v)) throw new Error('DOCUMENT_FORMULA_SUPPLY_FAILED ' + q.s.a1 + ': ' + q.s.key + ' from ' + q.s.from); });
},
fileMeta: function (fileId) {
var f = DriveApp.getFileById(fileId), p = [], it = f.getParents(); while (it.hasNext()) p.push(it.next().getId());
return { mime: f.getMimeType(), trashed: f.isTrashed(), parents: p };
},
exportOffice: function (fileId, mime) {
var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/export?mimeType=' + encodeURIComponent(mime),
{ headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true, followRedirects: false });
var h = r.getHeaders() || {}, c = r.getResponseCode();
return { code: c, type: String(h['Content-Type'] || h['content-type'] || ''), bytes: c === 200 ? r.getContent() : [], text: c === 200 ? '' : String(r.getContentText()).slice(0, 300) };
},
attemptFiles: function (folderId, ids) {
var out = [], it = DriveApp.getFolderById(folderId).getFiles();
while (it.hasNext()) { var f = it.next(), n = f.getName(); ids.forEach(function (a) { if (n.indexOf('[' + a + ']') >= 0) out.push({ id: f.getId(), name: n, attempt: a }); }); }
return out;
},


exportPdf: function (fileId, filename, folderId, tabs) {
if (!dfoStr_(folderId)) throw new Error('DOCUMENT_OUTPUT_FOLDER_REQUIRED');
var file = DriveApp.getFileById(fileId), blob = null, tmp = null, err = null, names, out, nm = function (s) { return s.getName(); };
var compact = Array.isArray(tabs) && tabs.length === 2 && ['通用發票導入模版', '裝箱單發票通用模板'].every(function (n) { return tabs.indexOf(n) >= 0; });
if (tabs) {
names = SpreadsheetApp.openById(fileId).getSheets().map(nm); out = names.filter(function (n) { return tabs.indexOf(n) < 0; });
if (tabs.some(function (n) { return names.indexOf(n) < 0; })) throw new Error('DOCUMENT_PDF_SCOPE_TAB_MISSING ' + tabs.filter(function (n) { return names.indexOf(n) < 0; }).join(', '));
if (out.length || compact) {
try {
tmp = file.makeCopy(filename + ' (PDF scope)', DriveApp.getFolderById(folderId));
if (tmp.getId() === fileId || !dfoInside_(tmp, folderId)) throw new Error('DOCUMENT_COPY_TARGET_INVALID');
var c = SpreadsheetApp.openById(tmp.getId()), fx = {}, dep;
tabs.forEach(function (n) { var s = c.getSheetByName(n); fx[n] = { fx: s ? s.getDataRange().getFormulas() : [] }; });
if ((dep = dfoPdfRefs_(fx, tabs, c.getSheets().map(nm), dfoNames_(c)))) throw new Error(dep);
out.forEach(function (n) { c.deleteSheet(c.getSheetByName(n)); }); SpreadsheetApp.flush();
if (c.getSheets().map(nm).sort().join('\n') !== tabs.slice().sort().join('\n')) throw new Error('DOCUMENT_PDF_SCOPE_MISMATCH');
if (compact) {
// Change only the disposable PDF copy; retain source workbook, formulas and templates.
c.getSheets().forEach(dfoCompactPdfSheet_); SpreadsheetApp.flush();
// Use the existing Drive scope; Sheets' HTTP export would require a new external_request scope.
blob = tmp.getAs('application/pdf');
} else blob = tmp.getAs('application/pdf');
} catch (e) { err = e; }
if (tmp && tmp.getId() !== fileId) try { tmp.setTrashed(true); } catch (eT) { err = new Error('DOCUMENT_PDF_SCOPE_COPY_NOT_REMOVED ' + tmp.getId() + (err ? '; ' + String(err.message || err) : '')); }
if (err) throw err;
}
}
blob = (blob || file.getAs('application/pdf')).setName(filename + '.pdf');
var pdf = DriveApp.getFolderById(folderId).createFile(blob);
return { pdf_file_id: pdf.getId(), pdf_file_url: pdf.getUrl() };
}
};
}

function dfoCompactPdfSheet_(sheet) {
// Charts have independent layout: retain their existing print area.
if (sheet.getCharts().length) return;
var range = sheet.getDataRange(), values = range.getValues(), formulas = range.getFormulas(), row = 1, col = 1;
values.forEach(function (r, i) { r.forEach(function (v, j) { if (v !== '' && v != null || formulas[i] && formulas[i][j]) { row = Math.max(row, i + 1); col = Math.max(col, j + 1); } }); });
sheet.getImages().forEach(function (image) {
var anchor = image.getAnchorCell(), r = anchor.getRow(), c = anchor.getColumn();
var width = image.getWidth() + image.getAnchorCellXOffset(), height = image.getHeight() + image.getAnchorCellYOffset();
while (width > 0 && c <= sheet.getMaxColumns()) { col = Math.max(col, c); width -= sheet.getColumnWidth(c++); }
while (height > 0 && r <= sheet.getMaxRows()) { row = Math.max(row, r); height -= sheet.getRowHeight(r++); }
});
var merges = range.getMergedRanges(), changed = true;
while (changed) { changed = false; merges.forEach(function (m) { if (m.getRow() <= row && m.getColumn() <= col && (m.getLastRow() > row || m.getLastColumn() > col)) { row = Math.max(row, m.getLastRow()); col = Math.max(col, m.getLastColumn()); changed = true; } }); }
if (row < sheet.getMaxRows()) sheet.hideRows(row + 1, sheet.getMaxRows() - row);
if (col < sheet.getMaxColumns()) sheet.hideColumns(col + 1, sheet.getMaxColumns() - col);
sheet.setHiddenGridlines(true);
}
