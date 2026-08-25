// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 39_document_runtime_service.gs — F1-7N-FB-1B system-computed document runtime (PO + Shipment)
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER.
// ------------------------------------------------------------
// THE ARCHITECTURAL BOUNDARY THIS MODULE EXISTS TO ENFORCE (F1-7N-FB-1B §A).
//
//   Business DB -> system reader -> canonical snapshot -> template applicability -> field resolver
//   -> fully resolved IMMUTABLE render payload -> Drive readiness check -> Drive renderer (37_)
//   -> file/PDF -> generated_documents (36_) -> API DTO -> UI Document Panel
//
// EVERY business decision lives on this side of the boundary: data selection, joins, totals, carton and
// weight arithmetic, customs values, date derivation, template applicability, template selection, field
// resolution, filename construction and required-field validation. By the time 37_ is called, the payload
// carries only finished STRINGS (TOTAL_QTY: "360", COUNTRY: "US") — Google Drive is an OUTPUT DEVICE, never
// a calculation engine and never a business-data source. 37_ may not read a business table, select a
// template, choose an applicable class, infer a country/carrier/factory/series, or decide whether a
// business transition is allowed. Source-fact tests enforce that separation in both directions.
//
// NO PARALLEL REGISTRY. The three existing tables remain the only authorities: document_templates,
// document_template_fields, generated_documents (36_ owns the registry; 35_ owns the render MODEL; 37_ owns
// the Drive primitives; 38_ owns folder identity). This module ORCHESTRATES them and adds no table.
//
// NO NEW PHYSICAL ENUM TOKEN (§O). The frozen generated_documents.status enum is
// generated / regenerated / emailed / archived / cancelled / failed (SPEC §D). The richer lifecycle the UI
// needs (preparing, generating, partial, failed_retryable, failed_terminal, stale) is expressed WITHOUT
// widening that enum: transient states are never persisted, a row stores a frozen token, the typed reason +
// retryability ride in the existing free-text `note` under a parseable prefix, and PARTIAL is DERIVED across
// the batch. dgsRowState_ / dgsBatchState_ are the single interpretation owner.
//
// Everything above __DGS_PURE_END__ is pure — no DriveApp, no SpreadsheetApp, no clock, no router — and is
// executed directly by the offline test suite.
// ============================================================

function dgsStr_(v) { return String(v == null ? '' : v).trim(); }
function dgsLc_(v) { return dgsStr_(v).toLowerCase(); }
function dgsUc_(v) { return dgsStr_(v).toUpperCase(); }
function dgsNum_(v) { if (v === null || v === undefined || v === '') return 0; var n = Number(String(v).replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; }
function dgsBool_(v) { if (v === true) return true; var s = dgsLc_(v); return s === 'true' || s === 'yes' || s === 'y' || s === '1'; }
// Every value handed to the Drive renderer is a finished string (§F). Numbers are rendered without locale
// separators so the sheet cell receives exactly what the system computed.
function dgsCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  return String(v);
}

// ---- §O generation states — DERIVED, on top of the FROZEN physical enum ---------------------------------
var DGS_ROW_GENERATED_ = 'generated';
var DGS_ROW_REGENERATED_ = 'regenerated';
var DGS_ROW_FAILED_ = 'failed';
var DGS_ROW_CANCELLED_ = 'cancelled';        // frozen token reused for stale/superseded attempts
var DGS_NOTE_REASON_ = 'DGS_REASON=';
var DGS_NOTE_RETRY_ = 'DGS_RETRYABLE=';
// Encode the typed reason + retryability into the existing free-text note. Parseable, human-readable, and it
// adds NO column and NO enum token.
function dgsEncodeNote_(reason, retryable, text) {
  var r = dgsUc_(reason);
  if (!r) return dgsStr_(text);
  return DGS_NOTE_REASON_ + r + '; ' + DGS_NOTE_RETRY_ + (retryable ? '1' : '0') + '; ' + dgsStr_(text);
}
function dgsDecodeNote_(note) {
  var s = dgsStr_(note);
  var mr = /DGS_REASON=([A-Z0-9_]+)/.exec(s);
  var mt = /DGS_RETRYABLE=([01])/.exec(s);
  return {
    reason: mr ? mr[1] : '',
    retryable: mt ? mt[1] === '1' : false,
    text: dgsStr_(s.replace(/DGS_REASON=[A-Z0-9_]+;?\s*/, '').replace(/DGS_RETRYABLE=[01];?\s*/, ''))
  };
}
// One registry row -> the state the UI and the retry planner reason about.
function dgsRowState_(row) {
  row = row || {};
  var st = dgsLc_(row.status);
  var meta = dgsDecodeNote_(row.note);
  if (st === DGS_ROW_GENERATED_ || st === DGS_ROW_REGENERATED_ || st === 'emailed') {
    return dgsStr_(row.file_id) ? 'READY' : 'GENERATING';
  }
  if (st === DGS_ROW_FAILED_) {
    if (meta.reason === 'DOCUMENT_CONFIGURATION_REQUIRED') return 'CONFIGURATION_REQUIRED';
    return meta.retryable ? 'FAILED_RETRYABLE' : 'FAILED_TERMINAL';
  }
  if (st === DGS_ROW_CANCELLED_ || st === 'archived') return 'SUPERSEDED';
  return 'GENERATING';
}
// Batch state across every applicable class. `expected` is the applicability manifest size, so a batch that
// produced 2 of 5 required documents reports PARTIAL rather than an optimistic READY.
function dgsBatchState_(rows, opts) {
  opts = opts || {};
  if (opts.checking) return 'CHECKING';
  if (dgsStr_(opts.folder_error)) return 'CONFIGURATION_REQUIRED';
  var live = (rows || []).filter(function (r) { return dgsRowState_(r) !== 'SUPERSEDED'; });
  if (!live.length) return opts.pending ? 'GENERATING' : 'NONE';
  var ready = 0, failed = 0, running = 0, config = 0;
  live.forEach(function (r) {
    var s = dgsRowState_(r);
    if (s === 'READY') ready++;
    else if (s === 'FAILED_RETRYABLE' || s === 'FAILED_TERMINAL') failed++;
    else if (s === 'CONFIGURATION_REQUIRED') config++;
    else running++;
  });
  var expected = dgsNum_(opts.expected) || live.length;
  if (running) return (ready || failed) ? 'PARTIAL' : 'GENERATING';
  if (failed && opts.entity_committed) return 'CONFIRMED_RETRY_REQUIRED';
  if (failed && ready) return 'PARTIAL';
  if (failed) return 'FAILED';
  if (config && !ready) return 'CONFIGURATION_REQUIRED';
  if (config || ready < expected) return 'PARTIAL';
  return 'READY';
}

// ---- §D failure classification ---------------------------------------------------------------------------
// D1 = deterministic, knowable BEFORE the dispatch transaction -> block the business transition.
// D2 = an unexpected Drive/render/runtime failure AFTER a real physical dispatch -> never reverse the
// dispatch; record a retryable document failure instead. The distinction is the whole safety model: a
// shipment that physically left must never be un-shipped because a PDF export timed out.
var DGS_PRE_DISPATCH_REASONS_ = {
  MISSING_EXTERNAL_SHIPMENT_ID: 1, MISSING_SHIPPED_AT: 1, UNSUPPORTED_DESTINATION_BUCKET: 1,
  SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED: 1, SHIPMENT_DOCUMENT_TEMPLATE_AMBIGUOUS: 1,
  PO_DOCUMENT_TEMPLATE_UNRESOLVED: 1, PO_DOCUMENT_TEMPLATE_AMBIGUOUS: 1,
  DOCUMENT_TEMPLATE_NOT_CONFIGURED: 1, DOCUMENT_TEMPLATE_AMBIGUOUS: 1, DOCUMENT_TEMPLATE_INACTIVE: 1,
  DOCUMENT_REQUIRED_FIELD_MISSING: 1, DOCUMENT_FIELD_AUTHORITY_MISSING: 1, DOCUMENT_TRANSFORM_UNSUPPORTED: 1,
  DOCUMENT_FILE_NAME_UNRESOLVED: 1,
  OUTPUT_FOLDER_REF_BLANK: 1, OUTPUT_FOLDER_REF_INVALID: 1, OUTPUT_FOLDER_URL_UNSUPPORTED: 1,
  OUTPUT_FOLDER_ROOT_MISSING: 1, OUTPUT_FOLDER_ROOT_INVALID: 1, OUTPUT_FOLDER_ROOT_CONFLICT: 1,
  OUTPUT_FOLDER_ROOT_INACCESSIBLE: 1, DOCUMENT_TEMPLATE_ASSET_MISSING: 1,
  DOCUMENT_TEMPLATE_ASSET_INACCESSIBLE: 1, DOCUMENT_TEMPLATE_TYPE_UNSUPPORTED: 1,
  SHIPMENT_FOLDER_IDENTITY_INVALID: 1, PO_FOLDER_IDENTITY_INVALID: 1,
  ALLOCATION_PREREQUISITE_INVALID: 1, SNAPSHOT_PREREQUISITE_INVALID: 1
};
function dgsFailureClass_(reason) {
  return DGS_PRE_DISPATCH_REASONS_[dgsUc_(reason)] ? 'PRE_DISPATCH_BLOCKING' : 'POST_DISPATCH_RECOVERABLE';
}
function dgsRetryable_(reason) { return dgsFailureClass_(reason) === 'POST_DISPATCH_RECOVERABLE'; }

// ---- template scope matching --------------------------------------------------------------------------
// Canonical §C semantics: a BLANK template dimension is UNSCOPED (matches any request value); a populated
// one must match EXACTLY (case-insensitive, trimmed). There is no prefix / substring / "closest" matching
// anywhere in this module — approximate series or factory matching is exactly the class of bug that emits a
// document for the wrong factory.
var DGS_SCOPE_DIMS_ = ['series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language'];
function dgsScopeMatch_(row, ctx) {
  for (var i = 0; i < DGS_SCOPE_DIMS_.length; i++) {
    var d = DGS_SCOPE_DIMS_[i], tv = dgsStr_(row[d]);
    if (!tv) continue;
    if (dgsLc_(tv) !== dgsLc_(ctx[d])) return false;
  }
  return true;
}
// A dimension that must be PRESENT on the template AND equal — used for destination/carrier-specific
// classes so an UNSCOPED template can never silently trigger a US import form on a JP shipment.
function dgsScopeExact_(row, dim, value) {
  var tv = dgsStr_(row[dim]);
  return !!tv && !!dgsStr_(value) && dgsLc_(tv) === dgsLc_(value);
}
function dgsInWindow_(row, asOf) {
  var q = dgsStr_(asOf); if (!q) return true;
  var from = dgsStr_(row.effective_from), to = dgsStr_(row.effective_to);
  if (from && from > q) return false;
  if (to && to < q) return false;
  return true;
}
function dgsActive_(row, asOf) { return dgsLc_(row.status) === 'active' && dgsBool_(row.is_active) && dgsInWindow_(row, asOf); }

// ---- §H shipment applicability manifest -----------------------------------------------------------------
// The manifest is built ENTIRELY in the system, before any Drive call. Requirement semantics:
//   ALWAYS      — a cross-border shipment always needs it; 0 matches is a blocking configuration failure.
//   CONDITIONAL — applicable only when an exactly-scoped active template exists; 0 matches simply means the
//                 class does not apply to this shipment (never an error, never a broadened manifest).
// `match` controls the scoping rule, which is what keeps AGL forms off a TOP SEALAND shipment and US import
// forms off a non-US destination.
// F1-7N-FB-1B-G1 (C/D). THREE INDEPENDENT FACTS per class, deliberately not collapsed into one flag:
//   requirement        - what the business says about the document itself (ALWAYS / CONDITIONAL).
//   gates_transition   - whether it may BLOCK Confirm Shipment in this controlled version.
//   renderer_available - whether a render model exists at all.
// Collapsing them is exactly the bug this gate exists to prevent: "applicable" must never imply "blocking".
//
// Why only SHIPMENT_DETAIL + PACKING_LIST_EXPORT gate: NO active canonical specification declares any document
// class mandatory for the dispatch transition (DOCUMENT_GENERATION_SYSTEM_SPEC's only "mandatory" statements are
// about folder identity - external_shipment_id and shipped_at). So the gate is the explicit minimum the user
// froze in G1 D, and nothing else is allowed to block. In particular:
//   COMMERCIAL_INVOICE_* - a renderer exists, but whether its ACTIVE required-field contract is complete cannot
//     be known before dispatch (the field contract is evaluated against the finalized snapshot, which needs the
//     EXECUTED allocations the dispatch transaction produces). An unverifiable condition must not block.
//   *_IMPORT - destination-side paperwork. No canonical owner makes it mandatory, so it is produced when an
//     exactly-scoped active template exists, and never blocks.
//   CARRIER_BOOKING - no render model exists (CARRIER_BOOKING_MAPPING_SPEC defines the mapping; the runtime is
//     deferred), so it is RUNTIME_DEFERRED and can never block.
var DGS_SHIPMENT_CLASSES_ = [
  { class_key: 'SHIPMENT_DETAIL', document_type: 'shipment_detail', document_usage: 'internal', requirement: 'ALWAYS', match: 'SCOPED', render: 'SHIPDETAIL', gates_transition: true, renderer_available: true },
  { class_key: 'COMMERCIAL_INVOICE_EXPORT', document_type: 'commercial_invoice', document_usage: 'export', requirement: 'ALWAYS', match: 'SCOPED', render: 'CI', gates_transition: false, renderer_available: true },
  { class_key: 'PACKING_LIST_EXPORT', document_type: 'packing_list', document_usage: 'export', requirement: 'ALWAYS', match: 'SCOPED', render: 'PL', gates_transition: true, renderer_available: true },
  { class_key: 'COMMERCIAL_INVOICE_IMPORT', document_type: 'commercial_invoice', document_usage: 'import', requirement: 'CONDITIONAL', match: 'EXACT_COUNTRY', render: 'CI', gates_transition: false, renderer_available: true },
  { class_key: 'PACKING_LIST_IMPORT', document_type: 'packing_list', document_usage: 'import', requirement: 'CONDITIONAL', match: 'EXACT_COUNTRY', render: 'PL', gates_transition: false, renderer_available: true },
  { class_key: 'CARRIER_BOOKING', document_type: 'carrier_booking_form', document_usage: 'carrier', requirement: 'CONDITIONAL', match: 'EXACT_CARRIER', render: 'BOOKING', gates_transition: false, renderer_available: false }
];
var DGS_DOC_STATES_ = ['REQUIRED_AND_EXECUTABLE', 'OPTIONAL_AND_EXECUTABLE', 'CONFIGURATION_REQUIRED', 'RUNTIME_DEFERRED', 'NOT_APPLICABLE'];
// Classify ONE applicable document into exactly one state, with the evidence the user asked to see. `field`
// carries the per-document field verdict when a snapshot exists ({complete, missing, unresolved}); when it is
// absent (pre-dispatch) the contract is reported as UNKNOWN rather than assumed either way.
function dgsClassifyEntry_(entry, field) {
  var cls = null;
  for (var i = 0; i < DGS_SHIPMENT_CLASSES_.length; i++) { if (DGS_SHIPMENT_CLASSES_[i].class_key === entry.class_key) cls = DGS_SHIPMENT_CLASSES_[i]; }
  var rendererAvailable = !!(cls && cls.renderer_available);
  var gatesByPolicy = !!(cls && cls.gates_transition);
  var complete = field ? !!field.complete : null;
  var missing = (field && field.missing) || [];
  var unresolved = (field && field.unresolved) || [];
  var state, nextAction, blocks = false, retryable = false;
  if (!rendererAvailable) {
    state = 'RUNTIME_DEFERRED';
    nextAction = 'No render model exists for this document class yet. It is listed for visibility and is never generated, never blocking, and never written as a GENERATED registry row.';
  } else if (complete === false) {
    state = 'CONFIGURATION_REQUIRED';
    nextAction = unresolved.length
      ? 'The active template marks a field required that has no source of truth in the system. Make it optional, or put the value in the template, or supply the missing business authority.'
      : 'Complete the missing business fields listed, then retry document generation.';
    retryable = true;
  } else {
    state = (entry.requirement === 'ALWAYS') ? 'REQUIRED_AND_EXECUTABLE' : 'OPTIONAL_AND_EXECUTABLE';
    nextAction = 'Ready to generate.';
    // it blocks ONLY when policy says it gates AND its field contract is actually proven complete
    blocks = gatesByPolicy && complete === true;
  }
  return {
    class_key: entry.class_key, document_type: entry.document_type, document_usage: entry.document_usage,
    template_key: entry.template_key, template_id: entry.template_id, template_version: entry.template_version,
    requirement: entry.requirement, state: state,
    blocks_transition: blocks,
    renderer_available: rendererAvailable,
    required_field_contract_complete: complete === null ? 'UNKNOWN' : complete,
    missing_fields: missing,
    missing_authorities: unresolved.map(function (u) { return dgsStr_(u.placeholder); }),
    retryable: retryable,
    gates_by_policy: gatesByPolicy,
    next_action: nextAction
  };
}
// The executable manifest: every applicable document classified, plus the subset that may actually block.
function dgsExecutableManifest_(entries, fieldByClass) {
  fieldByClass = fieldByClass || {};
  var rows = (entries || []).map(function (e) { return dgsClassifyEntry_(e, fieldByClass[e.class_key] || null); });
  return {
    documents: rows,
    blocking: rows.filter(function (r) { return r.blocks_transition; }).map(function (r) { return r.class_key; }),
    configuration_required: rows.filter(function (r) { return r.state === 'CONFIGURATION_REQUIRED'; }).map(function (r) { return r.class_key; }),
    runtime_deferred: rows.filter(function (r) { return r.state === 'RUNTIME_DEFERRED'; }).map(function (r) { return r.class_key; }),
    // the classes that gate BY POLICY, whether or not their contract has been proven yet - this is what the
    // pre-dispatch gate must find a template for
    policy_gating: rows.filter(function (r) { return r.gates_by_policy; }).map(function (r) { return r.class_key; })
  };
}
// The class keys that gate the transition by policy, independent of any live data.
function dgsGatingClassKeys_() {
  return DGS_SHIPMENT_CLASSES_.filter(function (c) { return c.gates_transition; }).map(function (c) { return c.class_key; });
}
function dgsClassCandidates_(templates, ctx, cls) {
  return (templates || []).filter(function (t) {
    if (dgsLc_(t.related_entity_type) !== 'shipment') return false;
    if (dgsLc_(t.document_type) !== cls.document_type) return false;
    if (dgsLc_(t.document_usage) !== cls.document_usage) return false;
    if (!dgsActive_(t, ctx.as_of)) return false;
    if (cls.match === 'EXACT_COUNTRY' && !dgsScopeExact_(t, 'country', ctx.country)) return false;
    if (cls.match === 'EXACT_CARRIER' && !dgsScopeExact_(t, 'carrier_id', ctx.carrier_id)) return false;
    return dgsScopeMatch_(t, ctx);
  });
}
function dgsShipmentManifest_(templates, ctx) {
  ctx = ctx || {};
  var entries = [], errors = [];
  DGS_SHIPMENT_CLASSES_.forEach(function (cls) {
    var cand = dgsClassCandidates_(templates, ctx, cls);
    if (cand.length > 1) {
      errors.push({ class_key: cls.class_key, reason: 'SHIPMENT_DOCUMENT_TEMPLATE_AMBIGUOUS', count: cand.length,
        template_keys: cand.slice(0, 5).map(function (t) { return dgsStr_(t.template_key); }) });
      return;
    }
    if (!cand.length) {
      if (cls.requirement === 'ALWAYS') errors.push({ class_key: cls.class_key, reason: 'SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED', document_type: cls.document_type, document_usage: cls.document_usage });
      return;   // CONDITIONAL + 0 matches = genuinely not applicable
    }
    entries.push({
      class_key: cls.class_key, document_type: cls.document_type, document_usage: cls.document_usage,
      requirement: cls.requirement, match_basis: cls.match, render: cls.render,
      template_id: dgsStr_(cand[0].template_id), template_key: dgsStr_(cand[0].template_key),
      template_version: dgsNum_(cand[0].template_version), template: cand[0]
    });
  });
  return { ok: !errors.length, entries: entries, errors: errors,
    required_count: entries.filter(function (e) { return e.requirement === 'ALWAYS'; }).length };
}

// ---- §G Purchase Order template selection ----------------------------------------------------------------
// EXACT factory_id + EXACT series, active + in window, related_entity_type/document_type = purchase_order.
// Never "the first row in sheet order", never approximate series, and never a fall-through from a populated
// but non-matching factory to an unrelated one (a populated mismatch EXCLUDES the row; it does not degrade).
function dgsSelectPoTemplate_(templates, ctx) {
  ctx = ctx || {};
  var cand = (templates || []).filter(function (t) {
    if (dgsLc_(t.related_entity_type) !== 'purchase_order') return false;
    if (dgsLc_(t.document_type) !== 'purchase_order') return false;
    if (!dgsActive_(t, ctx.as_of)) return false;
    return dgsScopeMatch_(t, ctx);
  });
  if (!cand.length) return { ok: false, reason: 'PO_DOCUMENT_TEMPLATE_UNRESOLVED', factory_id: dgsStr_(ctx.factory_id), series: dgsStr_(ctx.series), count: 0 };
  if (cand.length > 1) {
    return { ok: false, reason: 'PO_DOCUMENT_TEMPLATE_AMBIGUOUS', count: cand.length,
      template_keys: cand.slice(0, 5).map(function (t) { return dgsStr_(t.template_key); }) };
  }
  return { ok: true, template: cand[0], template_id: dgsStr_(cand[0].template_id), template_key: dgsStr_(cand[0].template_key), template_version: dgsNum_(cand[0].template_version) };
}

// ---- §F deterministic checksum ---------------------------------------------------------------------------
// Canonical JSON (object keys sorted) so the same facts always hash the same regardless of read order, then
// FNV-1a/32. Used to prove the source data did not drift between readiness and generation.
function dgsCanonicalJson_(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Object.prototype.toString.call(v) === '[object Array]') {
    return '[' + v.map(function (x) { return dgsCanonicalJson_(x); }).join(',') + ']';
  }
  var keys = Object.keys(v).sort();
  return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + dgsCanonicalJson_(v[k]); }).join(',') + '}';
}
function dgsChecksum_(v) {
  var s = dgsCanonicalJson_(v), h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  var hex = h.toString(16);
  while (hex.length < 8) hex = '0' + hex;
  return 'CS' + hex.toUpperCase();
}

// ---- §F fully resolved immutable render payload -----------------------------------------------------------
// The LAST system step. After this returns, no business value remains to be computed: scalars and collection
// cells are finished strings, the filename is final, and the destination folder identity is fixed. 37_ copies
// the template and writes these strings. If a caller ever needed 37_ to "work out" a value, the bug is here.
function dgsSplitMapped_(values) {
  var scalars = {}, collections = {};
  Object.keys(values || {}).forEach(function (k) {
    var v = values[k];
    if (Object.prototype.toString.call(v) === '[object Array]') {
      collections[k] = v.map(function (row) {
        var out = {};
        Object.keys(row || {}).forEach(function (c) { out[c] = dgsCell_(row[c]); });
        return out;
      });
    } else { scalars[k] = dgsCell_(v); }
  });
  return { scalars: scalars, collections: collections };
}
function dgsFillText_(text, scalars) {
  var out = dgsCell_(text);
  Object.keys(scalars || {}).forEach(function (k) { out = out.split('{{' + k + '}}').join(dgsCell_(scalars[k])); });
  return out;
}
var DGS_DRIVE_FORBIDDEN_RE_ = /[\\\/:*?"<>|]+/g;
function dgsFilename_(rule, scalars, fallback) {
  var raw = dgsStr_(rule) ? dgsFillText_(rule, scalars) : dgsStr_(fallback);
  var name = raw.replace(/\{\{[A-Z0-9_]+\}\}/g, '').replace(DGS_DRIVE_FORBIDDEN_RE_, '_').replace(/\s+/g, ' ').trim();
  return name;
}
function dgsBuildRenderPayload_(opts) {
  opts = opts || {};
  var tpl = opts.template || {};
  var split = dgsSplitMapped_(opts.values);
  var fileName = dgsFilename_(tpl.file_name_rule, split.scalars, opts.fallback_file_name);
  if (!fileName) return { ok: false, reason: 'DOCUMENT_FILE_NAME_UNRESOLVED', template_key: dgsStr_(tpl.template_key) };
  var payload = {
    related_entity_type: dgsStr_(opts.related_entity_type),
    related_entity_id: dgsStr_(opts.related_entity_id),
    class_key: dgsStr_(opts.class_key),
    document_type: dgsLc_(tpl.document_type),
    document_usage: dgsLc_(tpl.document_usage),
    template_id: dgsStr_(tpl.template_id),
    template_key: dgsStr_(tpl.template_key),
    template_version: dgsNum_(tpl.template_version),
    template_file_id: dgsStr_(tpl.template_file_id),
    template_file_type: dgsLc_(tpl.template_file_type),
    file_name: fileName,
    folder_id: dgsStr_(opts.folder_id),
    destination_bucket: dgsUc_(opts.destination_bucket),
    scalars: split.scalars,
    collections: split.collections
  };
  payload.source_checksum = dgsChecksum_({ s: payload.scalars, c: payload.collections, t: payload.template_id, v: payload.template_version });
  return { ok: true, payload: payload };
}

// ---- §G Purchase Order system payload --------------------------------------------------------------------
// Every PO value the document needs, computed HERE from the canonical PO snapshot (purchase_orders +
// purchase_order_lines are themselves the PO Snapshot — RO&PO §8A). sku_details is joined for DISPLAY LABELS
// only, never to replace a committed execution value.
function dgsShipMonth_(ymd) {
  var m = /^(\d{4})[-\/](\d{2})/.exec(dgsStr_(ymd));
  return m ? m[1] + '-' + m[2] : '';
}
function dgsPoPayloadModel_(po, poLines, joins) {
  po = po || {}; joins = joins || {};
  var skuLabel = joins.sku_labels || {};
  var lines = (poLines || []).map(function (l, i) {
    var sku = dgsStr_(l.sku);
    var label = skuLabel[sku] || {};
    var qty = dgsNum_(l.ordered_qty), price = dgsNum_(l.unit_price);
    return {
      line_no: i + 1,
      purchase_order_line_id: dgsStr_(l.purchase_order_line_id),
      sku: sku,
      site_sku: dgsStr_(l.site_sku),
      series: dgsStr_(l.series) || dgsStr_(po.series),
      // factory-facing display labels: the PO line owns them when populated; sku_details is a LABEL-only join
      // (RO&PO §8A / DOC-GEN §H) and never replaces a committed execution value.
      factory_item_name: dgsStr_(l.factory_item_name) || dgsStr_(label.factory_item_name) || dgsStr_(label.product_name_cn) || dgsStr_(label.product_name_en),
      factory_item_unit: dgsStr_(l.factory_item_unit) || dgsStr_(label.factory_item_unit) || dgsStr_(l.unit),
      product_name_en: dgsStr_(label.product_name_en),
      product_name_cn: dgsStr_(label.product_name_cn),
      ordered_qty: qty,
      carton_qty: dgsNum_(l.carton_qty),
      units_per_carton: dgsNum_(l.units_per_carton),
      unit_price: price,
      line_amount: price * qty,
      expected_ready_date: dgsStr_(l.expected_ready_date) || dgsStr_(po.supplier_expected_ready_date),
      expected_ship_date: dgsStr_(l.expected_ship_date) || dgsStr_(po.expected_ship_date)
    };
  });
  var totals = { qty: 0, cartons: 0, amount: 0, sku_count: 0 };
  var skuSet = {};
  lines.forEach(function (l) {
    totals.qty += dgsNum_(l.ordered_qty); totals.cartons += dgsNum_(l.carton_qty); totals.amount += dgsNum_(l.line_amount);
    if (l.sku) skuSet[l.sku] = 1;
  });
  totals.sku_count = Object.keys(skuSet).length;   // COUNT(DISTINCT sku) - RO&PO §7.4
  // DOC_DATE is the Send PO date. On a DRAFT PO order_date is still blank because the canonical issue writer
  // stamps it - so the system freezes ONE candidate date, renders the document with it, and the issue writer
  // then persists exactly that same value. Document date and order_date can never disagree.
  var orderDate = dgsStr_(po.order_date) || dgsStr_(joins.order_date_candidate);
  var shipDate = dgsStr_(po.expected_ship_date);
  var header = {
    purchase_order_id: dgsStr_(po.purchase_order_id),
    po_no: dgsStr_(po.po_no),
    km_po_no: dgsStr_(po.km_po_no),
    order_date: orderDate,
    doc_date: orderDate,
    deposit_due_date: dgsStr_(po.deposit_due_date) || dgsStr_(joins.deposit_due_date_candidate),
    supplier_expected_ready_date: dgsStr_(po.supplier_expected_ready_date),
    supplier_confirmed_ready_date: dgsStr_(po.supplier_confirmed_ready_date),
    expected_ship_date: shipDate,
    ship_date_full: shipDate,
    ship_month: dgsShipMonth_(shipDate),
    expected_completion_date: dgsStr_(po.expected_completion_date),
    inspection_date: dgsStr_(po.inspection_date),
    series: dgsStr_(po.series),
    currency: dgsStr_(po.currency),
    supplier_id: dgsStr_(po.supplier_id),
    supplier_name: dgsStr_(po.supplier_name),
    factory_id: dgsStr_(po.factory_id),
    factory_name: dgsStr_(joins.factory_name),
    warehouse_id: dgsStr_(po.warehouse_id),
    total_qty: totals.qty,
    total_cartons: totals.cartons,
    total_amount: totals.amount,
    total_sku: totals.sku_count
  };
  return { ok: true, document_type: 'PO', template_key: 'PURCHASE_ORDER_STANDARD',
    purchase_order_id: header.purchase_order_id, header: header, lines: lines, totals: totals };
}

// ---- §L Drive readiness (io-injected, STRICTLY NON-MUTATING) ---------------------------------------------
// Runs BEFORE any business status transition. It normalizes and OPENS identities and reads metadata; it never
// creates a probe folder, a test file or anything else, and it never claims that a later real write is
// guaranteed — it only proves the configured identities are resolvable and reachable right now.
// io = { probeFolder(id) -> {ok,id,name}|{ok:false,reason}, probeFile(id) -> {ok,id,name,mime}|{ok:false,reason} }
function dgsDriveReadiness_(io, entries, entityType) {
  var templates = (entries || []).map(function (e) { return e.template || e; });
  var root = dofResolveBatchRoot_(templates, entityType);
  if (!root.ok) return { ok: false, status: 'BLOCKED', reason: root.reason, detail: root, checks: [] };
  var checks = [];
  var rootProbe = io.probeFolder(root.root_folder_id);
  checks.push({ check: 'ROOT_FOLDER', target: root.root_folder_id, ok: !!(rootProbe && rootProbe.ok), reason: (rootProbe && rootProbe.ok) ? '' : 'OUTPUT_FOLDER_ROOT_INACCESSIBLE' });
  if (!rootProbe || !rootProbe.ok) {
    return { ok: false, status: 'BLOCKED', reason: 'OUTPUT_FOLDER_ROOT_INACCESSIBLE', root_folder_id: root.root_folder_id, checks: checks };
  }
  var blocked = null;
  for (var i = 0; i < (entries || []).length; i++) {
    var e = entries[i], t = e.template || e;
    var assetId = dgsStr_(t.template_file_id);
    if (!assetId) {
      checks.push({ check: 'TEMPLATE_ASSET', class_key: dgsStr_(e.class_key), template_key: dgsStr_(t.template_key), ok: false, reason: 'DOCUMENT_TEMPLATE_ASSET_MISSING' });
      blocked = blocked || 'DOCUMENT_TEMPLATE_ASSET_MISSING';
      continue;
    }
    if (!dfoSupportedType_(t.template_file_type)) {
      checks.push({ check: 'TEMPLATE_TYPE', class_key: dgsStr_(e.class_key), template_key: dgsStr_(t.template_key), ok: false, reason: 'DOCUMENT_TEMPLATE_TYPE_UNSUPPORTED', type: dgsLc_(t.template_file_type) });
      blocked = blocked || 'DOCUMENT_TEMPLATE_TYPE_UNSUPPORTED';
      continue;
    }
    var fileProbe = io.probeFile(assetId);
    var fok = !!(fileProbe && fileProbe.ok);
    checks.push({ check: 'TEMPLATE_ASSET', class_key: dgsStr_(e.class_key), template_key: dgsStr_(t.template_key), target: assetId, ok: fok, reason: fok ? '' : 'DOCUMENT_TEMPLATE_ASSET_INACCESSIBLE' });
    if (!fok) blocked = blocked || 'DOCUMENT_TEMPLATE_ASSET_INACCESSIBLE';
  }
  if (blocked) return { ok: false, status: 'BLOCKED', reason: blocked, root_folder_id: root.root_folder_id, checks: checks };
  return { ok: true, status: 'READY', root_folder_id: root.root_folder_id, checks: checks,
    note: 'Readiness only — configured identities resolved and reachable. It does not guarantee a later write succeeds.' };
}

// ---- §O logical identity ----------------------------------------------------------------------------------
function dgsIdentityKey_(entityType, entityId, templateId, templateVersion) {
  return dgsLc_(entityType) + '|' + dgsStr_(entityId) + '|' + dgsStr_(templateId) + '|' + dgsNum_(templateVersion);
}
// The immutable PO document-batch date: the EARLIEST canonical generated_documents attempt for this PO.
// A retry therefore never derives a new date folder (§N); only a genuine first attempt stamps the date.
function dgsPoBatchDate_(existingRows, todayYmd) {
  var dates = (existingRows || []).map(function (r) { return dofYmdFromCanonical_(r.generated_at) || dofYmdFromCanonical_(r.created_at); })
    .filter(function (d) { return !!d; }).sort();
  if (dates.length) return { ymd: dates[0], source: 'REGISTRY_FIRST_ATTEMPT' };
  var t = dofYmdFromCanonical_(todayYmd);
  return t ? { ymd: t, source: 'FIRST_ATTEMPT' } : { ymd: '', source: 'UNRESOLVED' };
}
// Which manifest entries still need work — the retry planner. A READY row is reused verbatim; only missing
// or failed classes are regenerated, so a retry can never duplicate a file that already exists.
function dgsPlanBatch_(manifestEntries, existingRows, entityType, entityId) {
  var byKey = {};
  (existingRows || []).forEach(function (r) {
    var k = dgsIdentityKey_(r.related_entity_type, r.related_entity_id, r.template_id, r.template_version);
    var st = dgsRowState_(r);
    if (st === 'SUPERSEDED') return;
    if (!byKey[k] || (dgsRowState_(byKey[k]) !== 'READY' && st === 'READY')) byKey[k] = r;
  });
  var todo = [], reuse = [];
  (manifestEntries || []).forEach(function (e) {
    var k = dgsIdentityKey_(entityType, entityId, e.template_id, e.template_version);
    var row = byKey[k];
    if (row && dgsRowState_(row) === 'READY') reuse.push({ entry: e, row: row });
    else todo.push({ entry: e, row: row || null });
  });
  return { todo: todo, reuse: reuse, complete: todo.length === 0 };
}

// __DGS_PURE_END__

// ============================================================================================
// io-injected orchestration. Everything below reads/writes Sheets and calls the 37_ Drive boundary; every
// business DECISION it makes was already made by a pure function above.
// ============================================================================================

function dgsDb_() { return SpreadsheetApp.openById(prodExpectedDbId_()); }
function dgsTemplates_(ss) { return dtReadTable_(ss, 'document_templates', DOCUMENT_TEMPLATES_HEADERS_); }
function dgsFieldsFor_(ss, templateId) {
  var id = dgsStr_(templateId);
  return dtReadTable_(ss, 'document_template_fields', DOCUMENT_TEMPLATE_FIELDS_HEADERS_)
    .filter(function (r) { return dgsStr_(r.template_id) === id; });
}
function dgsGeneratedFor_(ss, entityType, entityId) {
  var t = dgsLc_(entityType), i = dgsStr_(entityId);
  return dtReadTable_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_)
    .filter(function (r) { return dgsLc_(r.related_entity_type) === t && dgsStr_(r.related_entity_id) === i; });
}
// Authorized master joins for DISPLAY LABELS only. They never replace a committed execution value: the PO line
// owns its own factory item name/unit when populated, and these are consulted only when it does not.
function dgsFactoryName_(ss, factoryId) {
  var id = dgsStr_(factoryId); if (!id) return '';
  var rows = sfoReadTable_(ss, 'warehouses', []);
  for (var i = 0; i < rows.length; i++) {
    if (dgsStr_(rows[i].factory_id) === id || dgsStr_(rows[i].warehouse_id) === id || dgsStr_(rows[i].warehouse_code) === id) {
      return dgsStr_(rows[i].warehouse_name) || dgsStr_(rows[i].warehouse_code);
    }
  }
  return '';
}
function dgsSkuLabels_(ss, skus) {
  var want = {}; (skus || []).forEach(function (s) { if (dgsStr_(s)) want[dgsStr_(s)] = 1; });
  var out = {};
  if (!Object.keys(want).length) return out;
  sfoReadTable_(ss, 'sku_details', []).forEach(function (r) {
    var k = dgsStr_(r.sku); if (!want[k]) return;
    out[k] = { product_name_en: dgsStr_(r.product_name_en) || dgsStr_(r.product_name),
      product_name_cn: dgsStr_(r.product_name_cn), factory_item_name: dgsStr_(r.factory_item_name),
      factory_item_unit: dgsStr_(r.factory_item_unit) };
  });
  return out;
}
function dgsFindRow_(rows, key, value) {
  var v = dgsStr_(value);
  for (var i = 0; i < rows.length; i++) { if (dgsStr_(rows[i][key]) === v) return rows[i]; }
  return null;
}

// §B — the FULL frozen generated_documents projection, in ONE place. Every one of the 30 physical columns is
// written explicitly (blank where genuinely not applicable) so a schema drift is a loud failure rather than a
// silently missing value, and a test can prove writer completeness without a live sheet.
function dgsRegistryRow_(o) {
  o = o || {};
  return {
    document_id: dgsStr_(o.document_id),
    template_id: dgsStr_(o.template_id),
    template_key: dgsStr_(o.template_key),
    template_version: dgsNum_(o.template_version),
    related_entity_type: dgsLc_(o.related_entity_type),
    related_entity_id: dgsStr_(o.related_entity_id),
    document_type: dgsLc_(o.document_type),
    series: dgsStr_(o.series),
    sku: dgsStr_(o.sku),
    supplier_id: dgsStr_(o.supplier_id),
    factory_id: dgsStr_(o.factory_id),
    carrier_id: dgsStr_(o.carrier_id),
    country: dgsUc_(o.country),
    marketplace: dgsStr_(o.marketplace),
    language: dgsStr_(o.language),
    file_name: dgsStr_(o.file_name),
    file_id: dgsStr_(o.file_id),
    file_url: dgsStr_(o.file_url),
    pdf_file_id: dgsStr_(o.pdf_file_id),
    pdf_file_url: dgsStr_(o.pdf_file_url),
    // the ACTUAL leaf folder holding this document — never the configured root (§B)
    output_folder_id: dgsStr_(o.output_folder_id),
    generated_by: dgsStr_(o.generated_by),
    generated_at: dgsStr_(o.generated_at),
    status: dgsLc_(o.status),
    email_status: dgsLc_(o.email_status) || 'not_sent',
    email_sent_at: dgsStr_(o.email_sent_at),
    regenerated_from_document_id: dgsStr_(o.regenerated_from_document_id),
    note: dgsStr_(o.note),
    created_at: dgsStr_(o.created_at),
    updated_at: dgsStr_(o.updated_at)
  };
}
function dgsWriteRegistry_(sheet, row) { dtAppendByHeader_(sheet, dgsRegistryRow_(row)); }
// Update an existing attempt row in place (retry of a failed/partial attempt) — file columns + status/note
// only. Factual lineage columns (entity, template, scope) are never rewritten.
function dgsUpdateRegistry_(sheet, documentId, patch) {
  var d = sheet.getDataRange().getValues();
  var head = d[0].map(function (x) { return String(x).trim(); });
  var cId = head.indexOf('document_id');
  if (cId === -1) return false;
  for (var r = 1; r < d.length; r++) {
    if (String(d[r][cId]).trim() === dgsStr_(documentId)) {
      Object.keys(patch).forEach(function (k) { var c = head.indexOf(k); if (c !== -1) sheet.getRange(r + 1, c + 1).setValue(patch[k]); });
      return true;
    }
  }
  return false;
}
function dgsNewDocId_() { return 'GDOC-' + Utilities.getUuid().substring(0, 12).toUpperCase(); }

// ---- §P API DTO ---------------------------------------------------------------------------------------
// The ONE projection the workspaces and the Document Panel consume. It exposes safe links only (Drive URLs the
// backend already holds), the derived state, and the error assistance the UI needs — never a stack trace, never
// a credential, and never anything that would let the browser enumerate Drive.
function dgsDocumentDto_(row) {
  var meta = dgsDecodeNote_(row.note);
  var state = dgsRowState_(row);
  return {
    generated_document_id: dgsStr_(row.document_id),
    related_entity_type: dgsLc_(row.related_entity_type),
    related_entity_id: dgsStr_(row.related_entity_id),
    document_type: dgsLc_(row.document_type),
    document_label: dgsDocumentLabel_(row),
    template_key: dgsStr_(row.template_key),
    template_version: dgsNum_(row.template_version),
    file_name: dgsStr_(row.file_name),
    file_url: dgsStr_(row.file_url),
    pdf_file_url: dgsStr_(row.pdf_file_url),
    download_url: dgsStr_(row.pdf_file_url) || dgsStr_(row.file_url),
    output_folder_id: dgsStr_(row.output_folder_id),
    generated_at: dgsStr_(row.generated_at),
    status: state,
    reason: meta.reason,
    message: meta.text,
    retryable: state === 'FAILED_RETRYABLE',
    email_status: dgsLc_(row.email_status)
  };
}
var DGS_DOC_LABEL_ = {
  purchase_order: 'Purchase Order', shipment_detail: 'Shipment Detail',
  commercial_invoice: 'Commercial Invoice', packing_list: 'Packing List', carrier_booking_form: 'Carrier Booking'
};
function dgsDocumentLabel_(row) {
  var base = DGS_DOC_LABEL_[dgsLc_(row.document_type)] || dgsStr_(row.document_type) || 'Document';
  var usage = dgsLc_(row.document_usage);
  var key = dgsUc_(row.template_key);
  if (!usage) { if (key.indexOf('IMPORT') !== -1) usage = 'import'; else if (key.indexOf('EXPORT') !== -1) usage = 'export'; }
  if (usage === 'export') return base + ' (Export)';
  if (usage === 'import') return base + ' (Destination Customs)';
  return base;
}
// A folder URL the UI may open. Built from the id the backend already resolved — the browser never queries Drive.
function dgsFolderUrl_(folderId) {
  var id = dgsStr_(folderId);
  return id ? ('https://drive.google.com/drive/folders/' + id) : '';
}

// ---- shipment context ---------------------------------------------------------------------------------
// The business identity used for applicability + template scoping. `shipments.country` is the DESTINATION
// country (the same field csdResolveTemplate_ matches route templates on).
function dgsShipmentContext_(ss, shipmentId) {
  var row = dgsFindRow_(sfoReadTable_(ss, 'shipments', []), 'shipment_id', shipmentId);
  if (!row) return { ok: false, reason: 'SHIPMENT_NOT_FOUND' };
  return {
    ok: true, row: row,
    ctx: {
      country: dgsUc_(row.country), marketplace: dgsStr_(row.marketplace), carrier_id: dgsStr_(row.carrier_id),
      series: '', sku: '', supplier_id: '', factory_id: '', language: '',
      as_of: dgsStr_(row.etd) || dgsStr_(row.shipped_at)
    },
    status: dgsLc_(row.status),
    external_shipment_id: dgsStr_(row.external_shipment_id),
    reference_id: dgsStr_(row.reference_id),
    warehouse_code: dgsStr_(row.warehouse_code),
    shipped_at: dgsStr_(row.shipped_at)
  };
}

// The exact LEAF folder one shipment's documents belong in. It lives here (and not in 36_) because resolving
// it needs a live `shipments` read, and F1-5C-EXPORT-R3B requires 36_ to stay a document-tables-only runtime.
// The configured root may legitimately hold a Drive URL; dofResolveBatchRoot_ normalizes it, so an unparsed URL
// can never reach DriveApp.getFolderById.
function dgsResolveShipmentLeafFolder_(ss, tpl, shipmentId) {
  var sc = dgsShipmentContext_(ss, shipmentId);
  if (!sc.ok) return { ok: false, reason: sc.reason };
  return dofResolveShipmentFolder_(dofFolderIo_(), {
    templates: [tpl], destination_country: sc.ctx.country,
    external_shipment_id: sc.external_shipment_id, shipped_at: sc.shipped_at
  });
}

// ---- §D1 pre-dispatch readiness (NO WRITE, NO FOLDER, NO FILE) -----------------------------------------
// Everything deterministic that could make document generation impossible is proven HERE, before Confirm
// Shipment is allowed to mutate anything. A BLOCKED result keeps the shipment at ready_to_ship with a blank
// shipped_at. Note what this deliberately CANNOT check: the finalized snapshot does not exist yet (the PO
// allocations are still draft), so per-field completeness against the real snapshot is a post-dispatch fact.
// What it CAN prove is identity + configuration + reachability, which is where every deterministic failure
// actually lives.
function dgsShipmentReadiness_(ss, shipmentId, opts) {
  opts = opts || {};
  var sc = dgsShipmentContext_(ss, shipmentId);
  if (!sc.ok) return { ok: false, status: 'BLOCKED', reason: sc.reason, shipment_id: dgsStr_(shipmentId) };
  var blockers = [];
  if (!sc.external_shipment_id) blockers.push({ reason: 'MISSING_EXTERNAL_SHIPMENT_ID', field: 'shipments.external_shipment_id', correction: 'Shipment Draft > Execution Fields > Shipment ID' });
  var bucket = dofDestinationBucket_(sc.ctx.country);
  if (!bucket.ok) blockers.push({ reason: 'UNSUPPORTED_DESTINATION_BUCKET', field: 'shipments.country', value: bucket.country, correction: 'Shipment Draft > Destination' });
  var manifest = dgsShipmentManifest_(dgsTemplates_(ss), sc.ctx);
  // G1 (D): a template problem BLOCKS only for a class that gates the transition by policy. For every other
  // class it is a configuration issue the user should see and fix, never a reason to refuse a real shipment.
  var gating = {}; dgsGatingClassKeys_().forEach(function (k) { gating[k] = 1; });
  var configIssues = [];
  manifest.errors.forEach(function (e) {
    var item = { reason: e.reason, class_key: e.class_key, count: e.count || 0, template_keys: e.template_keys || [], correction: 'Admin > Document Templates' };
    if (gating[e.class_key]) blockers.push(item); else configIssues.push(item);
  });
  // Drive readiness is only asserted over the templates that gate; an unreachable asset for a non-gating class
  // is reported, never blocking. (An unreachable ROOT still blocks, because the gating classes share it.)
  var gatingEntries = manifest.entries.filter(function (e) { return gating[e.class_key]; });
  var drive = { status: 'SKIPPED' };
  if (gatingEntries.length) {
    drive = dgsDriveReadiness_(dofProbeIo_(), gatingEntries, 'shipment');
    if (!drive.ok) blockers.push({ reason: drive.reason, correction: 'Admin > Document Templates (output_folder_id / template_file_id)', detail: drive.checks || [] });
  }
  var nonGatingDrive = { status: 'SKIPPED' };
  var nonGating = manifest.entries.filter(function (e) { return !gating[e.class_key]; });
  if (nonGating.length) {
    nonGatingDrive = dgsDriveReadiness_(dofProbeIo_(), nonGating, 'shipment');
    if (!nonGatingDrive.ok) configIssues.push({ reason: nonGatingDrive.reason, correction: 'Admin > Document Templates (output_folder_id / template_file_id)', detail: nonGatingDrive.checks || [] });
  }
  var executable = dgsExecutableManifest_(manifest.entries, null);
  return {
    ok: !blockers.length, status: blockers.length ? 'BLOCKED' : 'READY',
    shipment_id: dgsStr_(shipmentId), destination_country: sc.ctx.country, destination_bucket: bucket.bucket || '',
    external_shipment_id: sc.external_shipment_id,
    manifest: manifest.entries.map(function (e) { return { class_key: e.class_key, document_type: e.document_type, document_usage: e.document_usage, requirement: e.requirement, match_basis: e.match_basis, template_key: e.template_key, template_id: e.template_id, template_version: e.template_version }; }),
    executable_manifest: executable.documents,
    transition_gate_classes: dgsGatingClassKeys_(),
    configuration_issues: configIssues,
    drive_readiness: { status: drive.status, reason: drive.reason || '', root_folder_id: drive.root_folder_id || '', checks: drive.checks || [] },
    non_gating_drive_readiness: { status: nonGatingDrive.status, reason: nonGatingDrive.reason || '' },
    blockers: blockers
  };
}

// ---- render ONE applicable document -------------------------------------------------------------------
// SYSTEM: render model -> field mapping -> required-field verdict -> fully resolved payload.
// DRIVE:  copy + fill + export, from that payload only.
// STAGE 1 of the render, and the ONLY part that reads business data: map the fields, apply the required-field
// verdict, and build the finished payload. It performs NO Drive call at all, so it is safe to run inside a
// business lock — which is what lets the Drive half run outside one.
function dgsResolvePayload_(ss, opts) {
  var entry = opts.entry, model = opts.model, tpl = entry.template;
  var fields = dgsFieldsFor_(ss, entry.template_id);
  var mapped = dtMapPlaceholders_(model, fields);
  // §J — a CI whose ACTIVE template requires a field with no canonical owner is CONFIGURATION_REQUIRED. It is
  // never rendered with a blank or invented value, and never silently dropped from the manifest.
  var unresolved = (entry.render === 'CI') ? docCiUnresolvedFields_(fields) : [];
  if (mapped.missing.length || unresolved.length) {
    return { ok: false, configuration_required: true, reason: unresolved.length ? 'DOCUMENT_FIELD_AUTHORITY_MISSING' : 'DOCUMENT_REQUIRED_FIELD_MISSING',
      missing: mapped.missing, unresolved_authority: unresolved };
  }
  var built = dgsBuildRenderPayload_({
    template: tpl, values: mapped.values, class_key: entry.class_key,
    related_entity_type: opts.related_entity_type, related_entity_id: opts.related_entity_id,
    folder_id: opts.folder_id, destination_bucket: opts.destination_bucket,
    fallback_file_name: opts.fallback_file_name
  });
  if (!built.ok) return { ok: false, reason: built.reason, template_key: entry.template_key };
  return { ok: true, payload: built.payload, field_verdict: { complete: true, missing: [], unresolved: [] } };
}
// STAGE 2: the Drive half. Never called while a business lock is held.
function dgsRenderOne_(ss, opts) {
  var resolved = dgsResolvePayload_(ss, opts);
  if (!resolved.ok) return resolved;
  var fr = dfoRenderPayload_(dfoDefaultIo_(), resolved.payload, {});
  if (!fr.ok) return { ok: false, reason: fr.error, message: fr.message || '', payload: resolved.payload, partial_file_id: fr.partial_file_id || fr.file_id || '' };
  return { ok: true, file: fr, payload: resolved.payload };
}

// ---- §C/§E Shipment post-dispatch document orchestration ------------------------------------------------
// Runs AFTER the dispatch transaction has committed, OUTSIDE its ScriptLock. Sequence: finalize the snapshot
// exactly once (idempotent, the existing 34_ owner — no second implementation) -> build the manifest -> resolve
// the leaf folder from the PERSISTED shipped_at -> render each applicable class -> register. A failure here is
// D2: it records a retryable document failure and NEVER touches the shipment's status, shipped_at, stock,
// allocations, routes or events.
function dgsGenerateShipmentDocuments_(ss, shipmentId, actor, opts) {
  opts = opts || {};
  var sc = dgsShipmentContext_(ss, shipmentId);
  if (!sc.ok) return { ok: false, reason: sc.reason, shipment_id: dgsStr_(shipmentId) };
  if (!SFO_DISPATCHED_STATUS_[sc.status]) {
    return { ok: false, reason: 'SNAPSHOT_PREREQUISITE_INVALID', shipment_id: dgsStr_(shipmentId), status: sc.status,
      message: 'Documents are generated after the dispatch transaction commits.' };
  }
  // ONE snapshot owner, called once and idempotently. finalizeShipmentFinalOutput reuses an existing active
  // snapshot rather than creating a second one.
  var snapRes = handleFinalizeShipmentFinalOutput_({ shipment_id: shipmentId, actor: actor });
  var snapOut = {}; try { snapOut = JSON.parse(snapRes.getContent()); } catch (e) {}
  if (!snapOut.success) return { ok: false, reason: 'SNAPSHOT_PREREQUISITE_INVALID', shipment_id: dgsStr_(shipmentId), detail: snapOut };
  var snap = docReadSnapshot_(ss, shipmentId);
  if (!snap) return { ok: false, reason: 'SNAPSHOT_PREREQUISITE_INVALID', shipment_id: dgsStr_(shipmentId) };

  var manifest = dgsShipmentManifest_(dgsTemplates_(ss), sc.ctx);
  if (!manifest.ok) return { ok: false, reason: manifest.errors[0].reason, shipment_id: dgsStr_(shipmentId), errors: manifest.errors };

  // Folder identity from the PERSISTED shipped_at — never the retry date, never a clock read here.
  var shippedAt = sc.shipped_at;
  var folder = dofResolveShipmentFolder_(dofFolderIo_(), {
    templates: manifest.entries.map(function (e) { return e.template; }),
    destination_country: sc.ctx.country, external_shipment_id: sc.external_shipment_id, shipped_at: shippedAt
  });
  if (!folder.ok) return { ok: false, reason: folder.reason, shipment_id: dgsStr_(shipmentId), detail: folder };

  var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_);
  var existing = dgsGeneratedFor_(ss, 'shipment', shipmentId);
  var plan = dgsPlanBatch_(manifest.entries, existing, 'shipment', shipmentId);
  var now = shipmentTimestamp_();
  var results = [], generated = 0, failed = 0, configRequired = 0;
  plan.reuse.forEach(function (r) { results.push({ class_key: r.entry.class_key, status: 'READY', reused: true, document_id: dgsStr_(r.row.document_id) }); });

  plan.todo.forEach(function (item) {
    var entry = item.entry;
    var model = docRenderByClass_(entry.render, snap);
    var base = {
      template_id: entry.template_id, template_key: entry.template_key, template_version: entry.template_version,
      related_entity_type: 'shipment', related_entity_id: shipmentId, document_type: entry.document_type,
      factory_id: dgsStr_(snap.header.factory_id), carrier_id: dgsStr_(snap.header.carrier_id),
      country: sc.ctx.country, marketplace: sc.ctx.marketplace, language: dgsStr_(entry.template.language),
      output_folder_id: folder.folder_id, generated_by: actor, generated_at: now, created_at: now, updated_at: now,
      regenerated_from_document_id: item.row ? dgsStr_(item.row.document_id) : ''
    };
    if (!model.ok) {
      var mreason = model.error || model.reason || 'DOCUMENT_NOT_READY';
      var mconfig = (entry.render === 'BOOKING' || mreason === 'UNSUPPORTED_DOCUMENT_TYPE');
      failed += mconfig ? 0 : 1; configRequired += mconfig ? 1 : 0;
      dgsWriteRegistry_(genSheet, Object.assign({}, base, {
        document_id: dgsNewDocId_(), status: DGS_ROW_FAILED_,
        note: dgsEncodeNote_(mconfig ? 'DOCUMENT_CONFIGURATION_REQUIRED' : mreason, !mconfig && dgsRetryable_(mreason),
          mconfig ? ('No render model is implemented for ' + entry.class_key + '.') : ('Render model blocked: ' + mreason + '.'))
      }));
      results.push({ class_key: entry.class_key, status: mconfig ? 'CONFIGURATION_REQUIRED' : 'FAILED', reason: mreason });
      return;
    }
    var one = dgsRenderOne_(ss, {
      entry: entry, model: model, related_entity_type: 'shipment', related_entity_id: shipmentId,
      folder_id: folder.folder_id, destination_bucket: folder.destination_bucket,
      fallback_file_name: 'KitchenMama_' + entry.class_key + '_' + sc.external_shipment_id
    });
    if (!one.ok) {
      var conf = !!one.configuration_required;
      failed += conf ? 0 : 1; configRequired += conf ? 1 : 0;
      var reason = conf ? 'DOCUMENT_CONFIGURATION_REQUIRED' : one.reason;
      var human = conf
        ? ('Template field mapping is incomplete for ' + entry.template_key + '.')
        : ('Drive generation failed: ' + one.reason + (one.message ? ' — ' + one.message : '') + '.');
      var patch = { status: DGS_ROW_FAILED_, note: dgsEncodeNote_(reason, !conf && dgsRetryable_(one.reason), human), updated_at: now };
      if (item.row) dgsUpdateRegistry_(genSheet, dgsStr_(item.row.document_id), patch);
      else dgsWriteRegistry_(genSheet, Object.assign({}, base, { document_id: dgsNewDocId_() }, patch));
      results.push({ class_key: entry.class_key, status: conf ? 'CONFIGURATION_REQUIRED' : 'FAILED_RETRYABLE',
        reason: one.reason, missing: one.missing || [], unresolved_authority: one.unresolved_authority || [] });
      return;
    }
    generated++;
    var okRow = Object.assign({}, base, {
      file_name: one.file.file_name, file_id: one.file.file_id, file_url: one.file.file_url,
      pdf_file_id: one.file.pdf_file_id, pdf_file_url: one.file.pdf_file_url,
      output_folder_id: one.file.output_folder_id || folder.folder_id,
      status: item.row ? DGS_ROW_REGENERATED_ : DGS_ROW_GENERATED_,
      note: dgsEncodeNote_('', false, 'checksum ' + one.payload.source_checksum + '; snapshot ' + dgsStr_(snap.header.snapshot_id) + '.')
    });
    if (item.row) {
      dgsUpdateRegistry_(genSheet, dgsStr_(item.row.document_id), {
        file_name: okRow.file_name, file_id: okRow.file_id, file_url: okRow.file_url,
        pdf_file_id: okRow.pdf_file_id, pdf_file_url: okRow.pdf_file_url, output_folder_id: okRow.output_folder_id,
        status: DGS_ROW_GENERATED_, note: okRow.note, generated_at: now, updated_at: now
      });
      results.push({ class_key: entry.class_key, status: 'READY', document_id: dgsStr_(item.row.document_id), retried: true });
    } else {
      okRow.document_id = dgsNewDocId_();
      dgsWriteRegistry_(genSheet, okRow);
      results.push({ class_key: entry.class_key, status: 'READY', document_id: okRow.document_id });
    }
  });

  return {
    ok: failed === 0, shipment_id: dgsStr_(shipmentId), snapshot_id: dgsStr_(snap.header.snapshot_id),
    folder_id: folder.folder_id, folder_name: folder.folder_name, folder_url: dgsFolderUrl_(folder.folder_id),
    destination_bucket: folder.destination_bucket, expected: manifest.entries.length,
    generated: generated, reused: plan.reuse.length, failed: failed, configuration_required: configRequired,
    results: results
  };
}

// ---- §C/§G Purchase Order document generation — STAGED SAGA (F1-7N-FB-1B-G1 §A) -------------------------
// The PO has no snapshot circularity (purchase_orders + purchase_order_lines ARE the PO Snapshot, RO&PO §8A), so
// the document is produced BEFORE the issue transition. But it must NOT be produced while holding the business
// ScriptLock: folder resolution, folder creation, template copy, cell population and PDF export are all slow,
// blocking Drive calls, and holding a global lock across them risks an Apps Script timeout stranding the lock
// and blocking every other writer. The flow is therefore split into three stages:
//
//   STAGE 1  dgsPoPrepare_        (inside the lock)   verify draft, checksum, template, payload, reserve attempt
//   ---- lock released ----
//   STAGE 2  dgsPoRenderPrepared_ (NO lock)           folder resolve/create, copy, fill, PDF
//   ---- lock reacquired ----
//   STAGE 3  dgsPoFinalize_       (inside the lock)   re-verify draft + checksum, then the issue writer runs
//
// The reserved attempt row is the crash-safety mechanism: it is written with the frozen `failed` token and a
// retryable DOCUMENT_ATTEMPT_RESERVED reason, so a process that dies mid-render leaves a truthful "attempted,
// no file" record that a retry picks up — never a phantom `generated` row with no file.
var DGS_PO_RESERVED_ = 'DOCUMENT_ATTEMPT_RESERVED';
var DGS_PO_DRIFT_ = 'DOCUMENT_SOURCE_DRIFT';

function dgsPoLoad_(ss, poId) {
  var po = dgsFindRow_(sfoReadTable_(ss, 'purchase_orders', []), 'purchase_order_id', poId);
  if (!po) return { ok: false, reason: 'PURCHASE_ORDER_NOT_FOUND' };
  var lines = sfoReadTable_(ss, 'purchase_order_lines', []).filter(function (l) { return dgsStr_(l.purchase_order_id) === dgsStr_(poId); });
  if (!lines.length) return { ok: false, reason: 'PURCHASE_ORDER_HAS_NO_LINES' };
  return { ok: true, po: po, lines: lines };
}
// The immutable source identity for a PO document attempt. It covers exactly the facts the document renders,
// so an edit to any of them between STAGE 1 and STAGE 3 is real drift and must stop the issue.
function dgsPoSourceChecksum_(po, lines) {
  var built = dgsPoPayloadModel_(po, lines, {});
  return dgsChecksum_({ h: built.header, l: built.lines });
}
function dgsPoStatus_(po) { return dgsLc_(po.order_status) || dgsLc_(po.status); }

// ---- STAGE 1 (inside the business lock; NO Drive mutation whatsoever) -----------------------------------
function dgsPoPrepare_(ss, poId, opts) {
  opts = opts || {};
  var loaded = dgsPoLoad_(ss, poId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, purchase_order_id: dgsStr_(poId) };
  var po = loaded.po, poLines = loaded.lines;
  if (opts.require_draft && dgsPoStatus_(po) !== 'draft') {
    return { ok: false, reason: 'PURCHASE_ORDER_NOT_DRAFT', purchase_order_id: dgsStr_(poId), order_status: dgsPoStatus_(po) };
  }
  var ctx = {
    factory_id: dgsStr_(po.factory_id), series: dgsStr_(po.series), supplier_id: dgsStr_(po.supplier_id),
    sku: '', carrier_id: '', country: '', marketplace: '', language: '',
    as_of: dgsStr_(opts.order_date_candidate) || dgsStr_(po.order_date)
  };
  var sel = dgsSelectPoTemplate_(dgsTemplates_(ss), ctx);
  if (!sel.ok) return { ok: false, reason: sel.reason, purchase_order_id: dgsStr_(poId), detail: sel };

  // Drive READINESS only — probes open configured identities and read metadata. They create nothing, so this
  // is safe inside the lock and is exactly the deterministic check that must pass before the PO can be issued.
  var drive = dgsDriveReadiness_(dofProbeIo_(), [{ class_key: 'PURCHASE_ORDER', template: sel.template }], 'purchase_order');
  if (!drive.ok) return { ok: false, reason: drive.reason, purchase_order_id: dgsStr_(poId), drive_readiness: drive };

  var existing = dgsGeneratedFor_(ss, 'purchase_order', poId);
  var batch = dgsPoBatchDate_(existing, opts.today);
  if (!batch.ymd) return { ok: false, reason: 'PO_FOLDER_IDENTITY_INVALID', purchase_order_id: dgsStr_(poId) };

  var built = dgsPoPayloadModel_(po, poLines, {
    factory_name: dgsStr_(opts.factory_name), sku_labels: opts.sku_labels || {},
    order_date_candidate: opts.order_date_candidate, deposit_due_date_candidate: opts.deposit_due_date_candidate
  });
  var entry = { class_key: 'PURCHASE_ORDER', render: 'PO', document_type: 'purchase_order',
    template: sel.template, template_id: sel.template_id, template_key: sel.template_key, template_version: sel.template_version };
  var resolved = dgsResolvePayload_(ss, {
    entry: entry, model: built, related_entity_type: 'purchase_order', related_entity_id: poId,
    folder_id: '', destination_bucket: '', fallback_file_name: 'KitchenMama_PO_' + dgsStr_(po.po_no)
  });
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason, configuration_required: !!resolved.configuration_required,
      purchase_order_id: dgsStr_(poId), missing: resolved.missing || [], unresolved_authority: resolved.unresolved_authority || [] };
  }

  var plan = dgsPlanBatch_([entry], existing, 'purchase_order', poId);
  var checksum = dgsPoSourceChecksum_(po, poLines);
  var now = shipmentTimestamp_();
  var base = {
    template_id: entry.template_id, template_key: entry.template_key, template_version: entry.template_version,
    related_entity_type: 'purchase_order', related_entity_id: poId, document_type: 'purchase_order',
    series: dgsStr_(po.series), supplier_id: dgsStr_(po.supplier_id), factory_id: dgsStr_(po.factory_id),
    language: dgsStr_(sel.template.language), output_folder_id: '',
    generated_by: dgsStr_(opts.actor), generated_at: now, created_at: now, updated_at: now
  };
  if (plan.complete) {
    // an already-generated current-version document is REUSED verbatim; no Drive work at all
    return { ok: true, complete: true, purchase_order_id: dgsStr_(poId), document_id: dgsStr_(plan.reuse[0].row.document_id),
      source_checksum: checksum, document_batch_date: batch.ymd, template: entry, root_folder_id: drive.root_folder_id };
  }
  // reserve (or reuse) the idempotent attempt row, so a crash mid-render is recoverable and a concurrent
  // caller converges on the SAME document_id instead of appending a second row
  var prior = plan.todo[0].row;
  var docId = prior ? dgsStr_(prior.document_id) : dgsNewDocId_();
  var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_);
  var reservedNote = dgsEncodeNote_(DGS_PO_RESERVED_, true, 'Attempt reserved; Drive rendering in progress. checksum ' + checksum + '.');
  if (prior) dgsUpdateRegistry_(genSheet, docId, { status: DGS_ROW_FAILED_, note: reservedNote, updated_at: now });
  else dgsWriteRegistry_(genSheet, Object.assign({}, base, { document_id: docId, status: DGS_ROW_FAILED_, note: reservedNote }));
  return {
    ok: true, complete: false, purchase_order_id: dgsStr_(poId), document_id: docId,
    payload: resolved.payload, template: entry, base: base, source_checksum: checksum,
    document_batch_date: batch.ymd, root_folder_id: drive.root_folder_id,
    regenerated_from_document_id: prior ? dgsStr_(prior.document_id) : ''
  };
}

// ---- STAGE 2 (NO business lock held; this is the only Drive-mutating step) -------------------------------
function dgsPoRenderPrepared_(ss, prepared) {
  var folder = dofResolvePoDateFolder_(dofFolderIo_(), {
    templates: [prepared.template.template],
    document_batch_date: prepared.document_batch_date.substring(0, 4) + '-' + prepared.document_batch_date.substring(4, 6) + '-' + prepared.document_batch_date.substring(6, 8)
  });
  if (!folder.ok) return { ok: false, reason: folder.reason, detail: folder };
  var payload = prepared.payload;
  payload.folder_id = folder.folder_id;   // the destination the SYSTEM resolved; the renderer never picks one
  var fr = dfoRenderPayload_(dfoDefaultIo_(), payload, {});
  if (!fr.ok) return { ok: false, reason: fr.error, message: fr.message || '', folder_id: folder.folder_id, partial_file_id: fr.partial_file_id || fr.file_id || '' };
  return { ok: true, file: fr, folder_id: folder.folder_id, folder_url: dgsFolderUrl_(folder.folder_id) };
}

// ---- STAGE 3 (business lock reacquired) -----------------------------------------------------------------
// Re-verify the world, then commit the document. It does NOT write order_status: the caller's ONE canonical
// issue writer does that, and only after this returns ok.
function dgsPoFinalize_(ss, prepared, rendered, actor) {
  var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_);
  var now = shipmentTimestamp_();
  var loaded = dgsPoLoad_(ss, prepared.purchase_order_id);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  if (dgsPoStatus_(loaded.po) !== 'draft') {
    // someone else already moved it — do not double-issue and do not attach this output as current
    dgsUpdateRegistry_(genSheet, prepared.document_id, { status: DGS_ROW_FAILED_, updated_at: now,
      note: dgsEncodeNote_('PURCHASE_ORDER_NOT_DRAFT', true, 'PO left draft during rendering; attempt not attached. Rendered file ' + dgsStr_(rendered.file.file_id) + ' retained for recovery.') });
    return { ok: false, reason: 'PURCHASE_ORDER_NOT_DRAFT', order_status: dgsPoStatus_(loaded.po) };
  }
  var after = dgsPoSourceChecksum_(loaded.po, loaded.lines);
  if (after !== prepared.source_checksum) {
    // §A source drift: never issue, never attach stale output as current, keep the attempt retryable. The
    // rendered file is NOT written into the file columns and is NOT deleted (we never delete what we cannot
    // prove is unreferenced) — its id is recorded so a human can reconcile it.
    dgsUpdateRegistry_(genSheet, prepared.document_id, { status: DGS_ROW_FAILED_, updated_at: now,
      note: dgsEncodeNote_(DGS_PO_DRIFT_, true, 'Source data changed during rendering (' + prepared.source_checksum + ' -> ' + after + '). Regenerate from the new payload. Stale file ' + dgsStr_(rendered.file.file_id) + ' retained, not attached.') });
    return { ok: false, reason: DGS_PO_DRIFT_, expected_checksum: prepared.source_checksum, actual_checksum: after };
  }
  if (!dgsStr_(rendered.file.file_id)) return { ok: false, reason: 'DOCUMENT_OUTPUT_MISSING' };
  dgsUpdateRegistry_(genSheet, prepared.document_id, {
    file_name: rendered.file.file_name, file_id: rendered.file.file_id, file_url: rendered.file.file_url,
    pdf_file_id: rendered.file.pdf_file_id, pdf_file_url: rendered.file.pdf_file_url,
    output_folder_id: rendered.file.output_folder_id || rendered.folder_id,
    status: prepared.regenerated_from_document_id ? DGS_ROW_REGENERATED_ : DGS_ROW_GENERATED_,
    note: dgsEncodeNote_('', false, 'checksum ' + prepared.source_checksum + '.'),
    regenerated_from_document_id: prepared.regenerated_from_document_id || '',
    generated_by: dgsStr_(actor), generated_at: now, updated_at: now
  });
  return { ok: true, document_id: prepared.document_id, file_name: rendered.file.file_name,
    folder_id: rendered.folder_id, folder_url: rendered.folder_url, checksum: prepared.source_checksum };
}

// Retry / API entry point for PO documents. Same three stages, same lock discipline: the lock is HELD for
// stage 1 and stage 3 and RELEASED across the Drive work in stage 2.
function dgsGeneratePoDocuments_(ss, poId, actor, opts) {
  opts = opts || {};
  var lock = LockService.getScriptLock();
  var prepared;
  try { if (!lock.tryLock(30000)) return { ok: false, reason: 'LOCK_UNAVAILABLE', purchase_order_id: dgsStr_(poId) }; }
  catch (e) { return { ok: false, reason: 'LOCK_ERROR', message: (e && e.message ? String(e.message) : String(e)) }; }
  try { prepared = dgsPoPrepare_(ss, poId, Object.assign({ actor: actor }, opts)); }
  finally { try { lock.releaseLock(); } catch (e2) {} }
  if (!prepared.ok) return prepared;
  if (prepared.complete) {
    return { ok: true, purchase_order_id: prepared.purchase_order_id, reused: true, generated: 0,
      document_batch_date: prepared.document_batch_date,
      results: [{ class_key: 'PURCHASE_ORDER', status: 'READY', reused: true, document_id: prepared.document_id }] };
  }
  var rendered = dgsPoRenderPrepared_(ss, prepared);      // <-- NO lock held here
  var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_);
  if (!rendered.ok) {
    dgsUpdateRegistry_(genSheet, prepared.document_id, { status: DGS_ROW_FAILED_, updated_at: shipmentTimestamp_(),
      note: dgsEncodeNote_(rendered.reason, dgsRetryable_(rendered.reason), 'Drive generation failed' + (rendered.message ? ': ' + rendered.message : '') + '.') });
    return { ok: false, reason: rendered.reason, message: rendered.message || '', purchase_order_id: prepared.purchase_order_id,
      document_id: prepared.document_id, retryable: dgsRetryable_(rendered.reason) };
  }
  try { if (!lock.tryLock(30000)) return { ok: false, reason: 'LOCK_UNAVAILABLE_FINALIZE', purchase_order_id: prepared.purchase_order_id, document_id: prepared.document_id, retryable: true }; }
  catch (e3) { return { ok: false, reason: 'LOCK_ERROR', message: (e3 && e3.message ? String(e3.message) : String(e3)) }; }
  try {
    var fin = dgsPoFinalize_(ss, prepared, rendered, actor);
    if (!fin.ok) return { ok: false, reason: fin.reason, purchase_order_id: prepared.purchase_order_id, document_id: prepared.document_id, retryable: true, detail: fin };
    return { ok: true, purchase_order_id: prepared.purchase_order_id, generated: 1, document_id: fin.document_id,
      file_name: fin.file_name, folder_id: fin.folder_id, folder_url: fin.folder_url,
      document_batch_date: prepared.document_batch_date, checksum: fin.checksum,
      results: [{ class_key: 'PURCHASE_ORDER', status: 'READY', document_id: fin.document_id }] };
  } finally { try { lock.releaseLock(); } catch (e4) {} }
}

// ---- §P read path -------------------------------------------------------------------------------------
function dgsEntityDocumentDtos_(ss, entityType, entityId, expected) {
  var rows = dgsGeneratedFor_(ss, entityType, entityId);
  var live = rows.filter(function (r) { return dgsRowState_(r) !== 'SUPERSEDED'; });
  var docs = live.map(function (r) { return dgsDocumentDto_(r); });
  var folderId = '';
  for (var i = live.length - 1; i >= 0; i--) { if (dgsStr_(live[i].output_folder_id)) { folderId = dgsStr_(live[i].output_folder_id); break; } }
  var state = dgsBatchState_(live, { expected: expected, entity_committed: !!(expected && dgsLc_(entityType) === 'shipment') });
  var firstErr = null;
  for (var j = 0; j < docs.length; j++) { if (docs[j].reason && docs[j].status !== 'READY') { firstErr = docs[j]; break; } }
  return {
    documents: docs,
    documentFolderUrl: dgsFolderUrl_(folderId),
    documentGenerationStatus: state,
    documentGenerationError: firstErr ? { reason: firstErr.reason, message: firstErr.message, document_label: firstErr.document_label, template_key: firstErr.template_key, retryable: firstErr.retryable } : null,
    canRetryDocuments: docs.some(function (d) { return d.retryable; })
  };
}
function handleEntityDocumentList_(body) {
  var entityType = dgsLc_(body && (body.related_entity_type || body.entity_type));
  var entityId = dgsStr_(body && (body.related_entity_id || body.entity_id || body.shipment_id || body.purchase_order_id));
  if (entityType !== 'shipment' && entityType !== 'purchase_order') return jsonResponse_({ success: false, error: 'UNSUPPORTED_RELATED_ENTITY_TYPE', supported: ['shipment', 'purchase_order'] });
  if (!entityId) return jsonResponse_({ success: false, error: 'RELATED_ENTITY_ID_REQUIRED' });
  var ss = dgsDb_();
  var dto = dgsEntityDocumentDtos_(ss, entityType, entityId, 0);
  return jsonResponse_({ success: true, related_entity_type: entityType, related_entity_id: entityId,
    documents: dto.documents, folder_url: dto.documentFolderUrl, status: dto.documentGenerationStatus,
    error_assistance: dto.documentGenerationError, can_retry: dto.canRetryDocuments });
}
function handleGeneratedDocumentGet_(body) {
  var documentId = dgsStr_(body && body.document_id);
  if (!documentId) return jsonResponse_({ success: false, error: 'DOCUMENT_ID_REQUIRED' });
  var rows = dtReadTable_(dgsDb_(), 'generated_documents', GENERATED_DOCUMENTS_HEADERS_)
    .filter(function (r) { return dgsStr_(r.document_id) === documentId; });
  if (!rows.length) return jsonResponse_({ success: true, found: false, document_id: documentId });
  return jsonResponse_({ success: true, found: true, document: dgsDocumentDto_(rows[0]) });
}
// §N/§O — retry regenerates ONLY the missing/failed classes; a READY document is reused verbatim, so the
// folder, the native file, the PDF and the registry row are never duplicated.
function handleDocumentRetry_(body) {
  var entityType = dgsLc_(body && (body.related_entity_type || body.entity_type));
  var entityId = dgsStr_(body && (body.related_entity_id || body.entity_id || body.shipment_id || body.purchase_order_id));
  var actor = dgsStr_(body && body.actor) || 'operation-system';
  if (!entityId) return jsonResponse_({ success: false, error: 'RELATED_ENTITY_ID_REQUIRED' });
  // F1-7N-FB-1B-G1 (A) — NO lock is held here. Retry performs Drive work, and a retry must never hold a global
  // ScriptLock across it. The PO path manages its own stage-1/stage-3 locking internally (releasing across the
  // Drive step); the shipment path runs entirely after its dispatch transaction has committed. Idempotency comes
  // from the registry plan (a READY document is reused, never re-rendered) and from exact-name folder matching.
  try {
    var ss = dgsDb_();
    var res = (entityType === 'purchase_order')
      ? dgsGeneratePoDocuments_(ss, entityId, actor, { today: shipmentToday_() })
      : dgsGenerateShipmentDocuments_(ss, entityId, actor, {});
    return jsonResponse_({ success: !!res.ok, retried: true, result: res });
  } catch (err) {
    return jsonResponse_({ success: false, error: 'DOCUMENT_RETRY_FAILED: ' + (err && err.message ? err.message : err), related_entity_id: entityId });
  }
}

// ---- §S read-only diagnostics (ZERO writes, NO folder, NO file) ----------------------------------------
// These prove what WOULD happen. They never create a folder or file, never write a row, and never claim a real
// Drive round trip occurred — the folder they report is a PREVIEW path, not a created object.
function dgsLog_(tag, obj) { try { Logger.log(tag + ' ' + JSON.stringify(obj)); } catch (e) {} }
function handlePoDocumentDiagnostic_(body) {
  var poId = dgsStr_(body && body.purchase_order_id);
  if (!poId) return jsonResponse_({ success: false, error: 'PURCHASE_ORDER_ID_REQUIRED' });
  var ss = dgsDb_();
  var po = dgsFindRow_(sfoReadTable_(ss, 'purchase_orders', []), 'purchase_order_id', poId);
  if (!po) return jsonResponse_({ success: false, error: 'PURCHASE_ORDER_NOT_FOUND', purchase_order_id: poId });
  var poLines = sfoReadTable_(ss, 'purchase_order_lines', []).filter(function (l) { return dgsStr_(l.purchase_order_id) === poId; });
  var status = dgsLc_(po.order_status) || dgsLc_(po.status);
  var today = shipmentToday_();
  var ctx = { factory_id: dgsStr_(po.factory_id), series: dgsStr_(po.series), supplier_id: dgsStr_(po.supplier_id),
    sku: '', carrier_id: '', country: '', marketplace: '', language: '', as_of: dgsStr_(po.order_date) || today };
  var sel = dgsSelectPoTemplate_(dgsTemplates_(ss), ctx);
  var out = {
    success: true, purchase_order_id: poId, po_no: dgsStr_(po.po_no),
    db_status: status, ui_group: (status === 'draft' ? 'Draft' : (status === 'completed' || status === 'closure' ? 'Completed' : 'In Production')),
    eligible_for_send_po: status === 'draft',
    line_count: poLines.length,
    template: sel.ok ? { template_id: sel.template_id, template_key: sel.template_key, template_version: sel.template_version } : null,
    template_error: sel.ok ? '' : sel.reason,
    writes_performed: 0, folders_created: 0, files_created: 0,
    note: 'READ-ONLY diagnostic. No Drive folder or file was created; the folder shown is a preview path.'
  };
  if (sel.ok) {
    var fields = dgsFieldsFor_(ss, sel.template_id);
    var model = dgsPoPayloadModel_(po, poLines, { order_date_candidate: today, sku_labels: {} });
    var mapped = dtMapPlaceholders_(model, fields);
    var built = dgsBuildRenderPayload_({ template: sel.template, values: mapped.values, class_key: 'PURCHASE_ORDER',
      related_entity_type: 'purchase_order', related_entity_id: poId, folder_id: '(preview)', fallback_file_name: 'KitchenMama_PO_' + dgsStr_(po.po_no) });
    var existing = dgsGeneratedFor_(ss, 'purchase_order', poId);
    var batch = dgsPoBatchDate_(existing, today);
    var drive = dgsDriveReadiness_(dofProbeIo_(), [{ class_key: 'PURCHASE_ORDER', template: sel.template }], 'purchase_order');
    out.field_completeness = { required_missing: mapped.missing, complete: mapped.missing.length === 0, mapped_placeholders: Object.keys(mapped.values).length };
    out.payload_checksum = built.ok ? built.payload.source_checksum : '';
    out.expected_file_name = built.ok ? built.payload.file_name : '';
    out.drive_readiness = { status: drive.status, reason: drive.reason || '', root_folder_id: drive.root_folder_id || '', checks: drive.checks || [] };
    out.folder_preview = { root_folder_id: drive.root_folder_id || '', date_folder: batch.ymd, date_source: batch.source, path: 'Purchase Order/' + batch.ymd + '/' };
    out.existing_documents = existing.map(function (r) { return dgsDocumentDto_(r); });
    out.expected_registry_identity = { related_entity_type: 'purchase_order', related_entity_id: poId, template_id: sel.template_id, template_version: sel.template_version, key: dgsIdentityKey_('purchase_order', poId, sel.template_id, sel.template_version) };
    out.system_payload_verdict = (mapped.missing.length === 0 && built.ok) ? 'READY' : 'BLOCKED';
    out.drive_readiness_verdict = drive.ok ? 'READY' : 'BLOCKED';
    out.required_document_manifest = [{
      class_key: 'PURCHASE_ORDER', document_type: 'purchase_order', template_key: sel.template_key,
      requirement: 'ALWAYS', state: (out.system_payload_verdict === 'READY' && drive.ok) ? 'REQUIRED_AND_EXECUTABLE' : 'CONFIGURATION_REQUIRED',
      blocks_transition: true, renderer_available: true,
      required_field_contract_complete: mapped.missing.length === 0,
      missing_fields: mapped.missing, missing_authorities: [], retryable: !drive.ok,
      next_action: (out.system_payload_verdict === 'READY' && drive.ok) ? 'Ready to Send PO.' : 'Resolve the blocking reasons below, then re-run this diagnostic.'
    }];
    out.blocking_reasons = []
      .concat(out.eligible_for_send_po ? [] : [{ reason: 'PURCHASE_ORDER_NOT_DRAFT', detail: 'Send PO applies to a Draft PO; this one is ' + status + '.' }])
      .concat(mapped.missing.length ? [{ reason: 'DOCUMENT_REQUIRED_FIELD_MISSING', detail: mapped.missing.length + ' required template field(s) unresolved.' }] : [])
      .concat(built.ok ? [] : [{ reason: built.reason, detail: 'The filename could not be constructed.' }])
      .concat(drive.ok ? [] : [{ reason: drive.reason, detail: 'Drive readiness failed.' }]);
    out.send_po_verdict = out.blocking_reasons.length ? 'BLOCKED' : 'READY';
    out.verdict = out.send_po_verdict;
  } else {
    out.system_payload_verdict = 'BLOCKED';
    out.drive_readiness_verdict = 'NOT_EVALUATED';
    out.required_document_manifest = [];
    out.blocking_reasons = [{ reason: sel.reason, detail: 'No single active Purchase Order template matches factory "' + dgsStr_(po.factory_id) + '" + series "' + dgsStr_(po.series) + '".' }];
    out.send_po_verdict = 'BLOCKED';
    out.verdict = 'BLOCKED';
  }
  dgsLog_('[DGS-PO-DIAG]', { po: poId, verdict: out.verdict, template: out.template && out.template.template_key });
  return jsonResponse_(out);
}
function handleShipmentDocumentDiagnostic_(body) {
  var shipmentId = dgsStr_(body && body.shipment_id);
  if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
  var ss = dgsDb_();
  var sc = dgsShipmentContext_(ss, shipmentId);
  if (!sc.ok) return jsonResponse_({ success: false, error: sc.reason, shipment_id: shipmentId });
  var readiness = dgsShipmentReadiness_(ss, shipmentId, {});
  var out = {
    success: true, shipment_id: shipmentId, external_shipment_id: sc.external_shipment_id,
    db_status: sc.status, eligible_for_confirm: sc.status === 'ready_to_ship' || sc.status === 'draft',
    pre_dispatch_system_readiness: {
      status: readiness.blockers.filter(function (b) { return b.reason !== 'OUTPUT_FOLDER_ROOT_INACCESSIBLE' && b.reason !== 'DOCUMENT_TEMPLATE_ASSET_INACCESSIBLE' && b.reason !== 'DOCUMENT_TEMPLATE_ASSET_MISSING' && b.reason !== 'DOCUMENT_TEMPLATE_TYPE_UNSUPPORTED'; }).length ? 'BLOCKED' : 'READY',
      blockers: readiness.blockers
    },
    pre_dispatch_drive_readiness: readiness.drive_readiness,
    destination_country: readiness.destination_country, destination_bucket: readiness.destination_bucket,
    applicable_manifest: readiness.manifest,
    writes_performed: 0, folders_created: 0, files_created: 0,
    note: 'READ-ONLY diagnostic. No snapshot was finalized, no Drive folder or file was created; folders shown are preview paths.'
  };
  var snap = docReadSnapshot_(ss, shipmentId);
  out.snapshot_eligible = !!SFO_DISPATCHED_STATUS_[sc.status];
  out.snapshot_present = !!snap;
  var byDoc = [], ready = 0, configReq = 0, fieldByClass = {}, ciAuthority = [];
  readiness.manifest.forEach(function (m) {
    var fields = dgsFieldsFor_(ss, m.template_id);
    var row = { class_key: m.class_key, template_key: m.template_key, requirement: m.requirement };
    var cls = null;
    for (var i = 0; i < DGS_SHIPMENT_CLASSES_.length; i++) { if (DGS_SHIPMENT_CLASSES_[i].class_key === m.class_key) cls = DGS_SHIPMENT_CLASSES_[i]; }
    if (cls && cls.render === 'CI') {
      // §E — classify the five unresolved CI authorities against this template's ACTIVE rows
      docCiFieldAuthorityReport_(fields).forEach(function (a) { ciAuthority.push(Object.assign({ class_key: m.class_key, template_key: m.template_key }, a)); });
    }
    // Field completeness is evaluated against the FINALIZED snapshot. Before dispatch there is none (it needs
    // the EXECUTED allocations), so the contract is reported UNKNOWN rather than assumed either way — which is
    // precisely why a CI can never be a pre-dispatch transition gate.
    if (!snap) { row.field_completeness = 'SNAPSHOT_NOT_AVAILABLE'; byDoc.push(row); return; }
    var model = docRenderByClass_(cls ? cls.render : '', snap);
    if (!model.ok) {
      row.status = 'CONFIGURATION_REQUIRED'; row.reason = model.error || model.reason;
      fieldByClass[m.class_key] = { complete: false, missing: [], unresolved: [] };
      configReq++; byDoc.push(row); return;
    }
    var mapped = dtMapPlaceholders_(model, fields);
    var unresolved = (cls && cls.render === 'CI') ? docCiUnresolvedFields_(fields) : [];
    row.required_missing = mapped.missing;
    row.unresolved_authority = unresolved;
    row.status = (mapped.missing.length || unresolved.length) ? 'CONFIGURATION_REQUIRED' : 'READY';
    fieldByClass[m.class_key] = { complete: row.status === 'READY', missing: mapped.missing, unresolved: unresolved };
    if (row.status === 'READY') ready++; else configReq++;
    byDoc.push(row);
  });
  out.field_completeness_by_document = byDoc;
  out.documents_ready = ready;
  out.documents_configuration_required = configReq;
  // §C — every applicable document in exactly one state, with the evidence behind it
  var execMan = dgsExecutableManifest_(readiness.manifest, snap ? fieldByClass : null);
  out.executable_manifest = execMan.documents;
  out.transition_gate_manifest = { policy_gate_classes: dgsGatingClassKeys_(), currently_blocking: execMan.blocking,
    configuration_required: execMan.configuration_required, runtime_deferred: execMan.runtime_deferred };
  out.commercial_invoice_field_authority = ciAuthority;
  if (sc.shipped_at) {
    out.persisted_shipped_at = sc.shipped_at;
    var leaf = dofShipmentFolderName_(sc.external_shipment_id, sc.shipped_at);
    out.final_folder_preview = leaf.ok ? ('Shipment/' + readiness.destination_bucket + '/' + leaf.name + '/') : ('UNRESOLVED: ' + leaf.reason);
  }
  var existing = dgsGeneratedFor_(ss, 'shipment', shipmentId);
  out.existing_documents = existing.map(function (r) { return dgsDocumentDto_(r); });
  out.missing_or_failed_outputs = out.existing_documents.filter(function (d) { return d.status !== 'READY'; }).map(function (d) { return { document_label: d.document_label, status: d.status, reason: d.reason }; });
  out.safe_retry_verdict = out.existing_documents.some(function (d) { return d.retryable; }) ? 'RETRY_SAFE' : (out.missing_or_failed_outputs.length ? 'CONFIGURATION_REQUIRED' : 'NOTHING_TO_RETRY');
  out.system_readiness_verdict = out.pre_dispatch_system_readiness.status;
  out.drive_readiness_verdict = readiness.drive_readiness.status === 'READY' ? 'READY' : (readiness.drive_readiness.status === 'SKIPPED' ? 'NOT_EVALUATED' : 'BLOCKED');
  out.blocking_reasons = readiness.blockers;
  out.configuration_issues = readiness.configuration_issues || [];
  out.confirm_shipment_verdict = (readiness.ok && out.eligible_for_confirm) ? 'READY' : 'BLOCKED';
  out.verdict = out.confirm_shipment_verdict;
  dgsLog_('[DGS-SHIP-DIAG]', { shipment: shipmentId, verdict: out.verdict, manifest: out.applicable_manifest.length, ready: ready });
  return jsonResponse_(out);
}
