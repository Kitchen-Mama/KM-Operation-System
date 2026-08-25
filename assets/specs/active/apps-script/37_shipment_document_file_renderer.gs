/**
 * 37_shipment_document_file_renderer.gs
 * Kitchen Mama Operation System — F1-5C-EXPORT-R3C actual document FILE generation (SHIPDETAIL / PL).
 *
 * SOURCE MIRROR / requires Apps Script sync. The binary/file step of the EXISTING R3B generated-document lifecycle —
 * NOT a second engine. It receives the resolved template (R3B dtResolveTemplate_) + the mapped placeholder model
 * (R3B dtMapPlaceholders_, itself built from the frozen R2B snapshot via the R3A renderer) and produces a real Drive
 * file by COPYING the configured template asset and replacing tokens. It NEVER reads a live master, never recomputes
 * a business fact, never resolves a template or maps placeholders itself.
 *
 * Template asset authority = document_templates.template_file_id / template_file_type / template_drive_url /
 * output_folder_id / file_name_rule (frozen §C). Generated file metadata is written back ONLY into the frozen
 * generated_documents file columns (file_name / file_id / file_url / pdf_file_id / pdf_file_url). No new table.
 *
 * Supported fillable type in R3C: `google_sheet` (tabular — the natural SHIPDETAIL / PL shape; full scalar + line +
 * allocation-collection rendering). google_doc / html / xlsx / pdf FAIL CLOSED (DOCUMENT_TEMPLATE_ASSET_TYPE_UNSUPPORTED)
 * — deferred, never faked. A blank template_file_id FAILS CLOSED (DOCUMENT_TEMPLATE_ASSET_MISSING) — never a
 * pseudo/HTML-as-XLSX file.
 *
 * The real DriveApp/SpreadsheetApp work is isolated behind an injected `io` (dfoDefaultIo_); the fill/expand logic is
 * PURE (unit-tested). Multi-PO lineage is preserved: an allocation collection expands to ONE row per executed
 * allocation — never collapsed.
 */

var DFO_SUPPORTED_TYPES_ = { google_sheet: 1 };   // R3C fillable types (others fail closed; deferred)

// __DFO_PURE_START__
// Pure fill/expand/validate/filename helpers (eval'd verbatim by the test harness). No Drive / sheet / clock.
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
// split the R3B mapped values into scalars (string) and collections (array of child rows).
function dfoSplitValues_(values) {
  var scalars = {}, collections = {};
  var v = values || {};
  Object.keys(v).forEach(function (k) { if (Object.prototype.toString.call(v[k]) === '[object Array]') collections[k] = v[k]; else scalars[k] = v[k]; });
  return { scalars: scalars, collections: collections };
}
// flat scalar token context = mapped scalars + document meta (for filename + cell fill).
function dfoScalarCtx_(scalars, meta) {
  var ctx = {}; var s = scalars || {}, m = meta || {};
  Object.keys(s).forEach(function (k) { ctx[k] = s[k]; });
  ctx.DOCUMENT_TYPE = dfoStr_(m.document_type); ctx.SHIPMENT_ID = dfoStr_(m.shipment_id);
  ctx.SHIPMENT_NO = dfoStr_(m.shipment_no) || dfoStr_(m.shipment_id); ctx.SNAPSHOT_ID = dfoStr_(m.snapshot_id);
  ctx.SNAPSHOT_VERSION = dfoStr_(m.snapshot_version); ctx.DISPATCH_DATE = dfoStr_(m.dispatch_date);
  return ctx;
}
// replace every {{TOKEN}} occurrence in a text with its scalar value (missing token -> left as-is here; a final
// sanitize pass blanks any unresolved token so no {{...}} leaks into the output).
function dfoFillText_(text, ctx) {
  var out = dfoCell_(text); var c = ctx || {};
  Object.keys(c).forEach(function (k) { out = out.split(dfoWrap_(k)).join(dfoCell_(c[k])); });
  return out;
}
function dfoSanitize_(text) { return dfoCell_(text).replace(/\{\{[A-Z0-9_]+\}\}/g, ''); }
// fill ONE cell: a whole-token cell ("{{K}}") is replaced by the RAW value (preserves numbers/dates); an
// interpolated cell is string-filled then leftover tokens blanked. primary wins over secondary (collection item
// over scalar context).
function dfoFillCell_(cell, primary, secondary) {
  var s = dfoCell_(cell);
  var whole = s.match(/^\{\{([A-Z0-9_]+)\}\}$/);
  if (whole) {
    var k = whole[1];
    if (primary && Object.prototype.hasOwnProperty.call(primary, k)) return primary[k];
    if (secondary && Object.prototype.hasOwnProperty.call(secondary, k)) return secondary[k];
    return '';
  }
  return dfoSanitize_(dfoFillText_(dfoFillText_(s, primary || {}), secondary || {}));
}
// is this row a collection anchor for collection P? (any cell contains a child token of P's items)
function dfoRowChildKeys_(row) {
  var keys = {}; (row || []).forEach(function (cell) { var m = dfoCell_(cell).match(/\{\{([A-Z0-9_]+)\}\}/g) || []; m.forEach(function (t) { keys[t.replace(/[{}]/g, '')] = 1; }); });
  return keys;
}
function dfoCollectionChildTokens_(items) {
  var set = {}; (items || []).forEach(function (it) { Object.keys(it || {}).forEach(function (k) { set[k] = 1; }); }); return set;
}
// PURE deterministic sheet-matrix render: for each collection, the template's ANCHOR row (a row containing at least
// one of that collection's child tokens) is DUPLICATED once per item with the child tokens filled; all other cells
// get scalar fill. Multi-PO lineage is preserved (one row per allocation). Row-by-row, so multiple collections
// (LINE_ITEMS + PO_ALLOCATIONS) each expand at their own anchor. Finally unresolved tokens are blanked.
function dfoFillSheetMatrix_(matrix, ctx, collections) {
  var cols = collections || {};
  // precompute child-token sets per collection
  var colInfo = Object.keys(cols).map(function (name) { return { name: name, items: cols[name] || [], childTokens: dfoCollectionChildTokens_(cols[name] || []) }; });
  var out = [];
  (matrix || []).forEach(function (row) {
    var childKeys = dfoRowChildKeys_(row);
    // find the FIRST collection whose child token appears in this row → this is its anchor row
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
// filename from file_name_rule (placeholder-filled) or a deterministic default; sanitized + safe for Drive.
function dfoFilename_(rule, ctx) {
  var name = dfoStr_(rule) ? dfoSanitize_(dfoFillText_(rule, ctx)) : ('KitchenMama_' + dfoStr_(ctx.DOCUMENT_TYPE) + '_' + dfoStr_(ctx.SHIPMENT_NO) + '_' + dfoStr_(ctx.SNAPSHOT_ID));
  name = name.replace(/[\\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  return name || ('KitchenMama_' + dfoStr_(ctx.SNAPSHOT_ID || ctx.SHIPMENT_ID));
}
// __DFO_PURE_END__

// io-injected orchestration. Copies the template, fills it, optionally exports a PDF. Fail-closed + partial-file
// reporting for recovery (STEP 10) — never auto-deletes a file it did not just create.
function dfoGenerateFile_(io, template, mapped, meta, opts) {
  var v = dfoValidateAsset_(template);
  if (!v.ok) return v;
  var split = dfoSplitValues_(mapped.values);
  var ctx = dfoScalarCtx_(split.scalars, meta);
  var filename = dfoFilename_(template.file_name_rule, ctx);
  // F1-7N-FB-1B (A): the DESTINATION is decided by the system (39_/38_) and passed in as an already-normalized
  // exact leaf folder id — every live caller now does this, so documents land in the shipment's own folder
  // instead of the shared root, and an unparsed URL can never reach a folder-open call.
  // The template.output_folder_id fallback is retained ONLY for the legacy R3C contract (a raw folder id on the
  // template); it is never exercised by the current callers. The new canonical entry point below
  // (dfoRenderPayload_) is strict and refuses to run without an explicit resolved folder.
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

// F1-7N-FB-1B (F): render a FULLY RESOLVED system payload. This is the boundary the architecture rule is about —
// every value here is already a finished string computed by 39_, so this function performs NO selection, NO join,
// NO arithmetic and NO template choice. It is a copy-fill-export device.
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
  var copy;
  try { copy = io.copyTemplate(dfoStr_(payload.template_file_id), dfoStr_(payload.file_name), dfoStr_(payload.folder_id)); }
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
    try { pdf = io.exportPdf(copy.file_id, dfoStr_(payload.file_name), dfoStr_(payload.folder_id)) || pdf; }
    catch (e3) { return { ok: false, error: 'DOCUMENT_PDF_EXPORT_FAILED', message: (e3 && e3.message ? String(e3.message) : String(e3)), file_id: copy.file_id, file_url: dfoStr_(copy.file_url), file_name: dfoStr_(payload.file_name), output_folder_id: dfoStr_(payload.folder_id) }; }
  }
  return { ok: true, file_name: dfoStr_(payload.file_name), file_id: copy.file_id, file_url: dfoStr_(copy.file_url),
    pdf_file_id: dfoStr_(pdf.pdf_file_id), pdf_file_url: dfoStr_(pdf.pdf_file_url), output_folder_id: dfoStr_(payload.folder_id) };
}

// Default Drive/Sheets io (the ONLY place raw DriveApp/SpreadsheetApp is touched; USER live-verified). copyTemplate
// duplicates the configured template into its output folder (or the template's own parent when unset); the fill
// reads/writes the first sheet's matrix; exportPdf writes a sibling PDF. Scoped to files this call creates.
// F1-7N-FB-1 — Drive FOLDER io for the output-folder resolver (38_document_output_folder_resolver.gs).
// It lives here because 37_ is the ONE sanctioned owner of raw Drive primitives (F1-5C-EXPORT-R1 §K), which
// keeps 38_ fully pure and keeps a single Drive boundary in the codebase. Scope is deliberately minimal:
// it LISTS and CREATES folders only. It never enumerates files, never reads or exports content, and never
// touches sharing/permissions — so it cannot become a second file engine or widen Drive access.
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

// F1-7N-FB-1B (L) — STRICTLY NON-MUTATING Drive readiness probes. They OPEN a configured identity and read its
// name/type to prove it is resolvable and reachable BEFORE a business status transition is allowed. They create
// nothing: no probe folder, no test file, no copy, no permission change — so running readiness a hundred times
// leaves Drive byte-identical. They also never enumerate a folder's FILES, so this cannot become a browsing API.
function dofProbeIo_() {
  return {
    probeFolder: function (folderId) {
      try { var f = DriveApp.getFolderById(String(folderId || '').trim()); return { ok: true, id: f.getId(), name: f.getName() }; }
      catch (e) { return { ok: false, reason: 'FOLDER_INACCESSIBLE' }; }
    },
    probeFile: function (fileId) {
      try { var f = DriveApp.getFileById(String(fileId || '').trim()); return { ok: true, id: f.getId(), name: f.getName(), mime: f.getMimeType() }; }
      catch (e) { return { ok: false, reason: 'FILE_INACCESSIBLE' }; }
    }
  };
}

function dfoDefaultIo_() {
  return {
    copyTemplate: function (templateFileId, filename, folderId) {
      var src = DriveApp.getFileById(templateFileId);
      var folder = dfoStr_(folderId) ? DriveApp.getFolderById(folderId) : null;
      var copy = folder ? src.makeCopy(filename, folder) : src.makeCopy(filename);
      return { file_id: copy.getId(), file_url: copy.getUrl() };
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
    exportPdf: function (fileId, filename, folderId) {
      var blob = DriveApp.getFileById(fileId).getAs('application/pdf').setName(filename + '.pdf');
      var folder = dfoStr_(folderId) ? DriveApp.getFolderById(folderId) : DriveApp.getFileById(fileId).getParents().next();
      var pdf = folder.createFile(blob);
      return { pdf_file_id: pdf.getId(), pdf_file_url: pdf.getUrl() };
    }
  };
}
