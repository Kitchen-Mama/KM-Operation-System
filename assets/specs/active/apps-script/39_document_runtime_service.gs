

































function dgsStr_(v) { return String(v == null ? '' : v).trim(); }
function dgsCanonicalTimestamp_(v) {
if (Object.prototype.toString.call(v) === '[object Date]') return isFinite(v.getTime()) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : '';
return dgsStr_(v);
}
function dgsLc_(v) { return dgsStr_(v).toLowerCase(); }
function dgsUc_(v) { return dgsStr_(v).toUpperCase(); }
function dgsNum_(v) { if (v === null || v === undefined || v === '') return 0; var n = Number(String(v).replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; }
function dgsBool_(v) { if (v === true) return true; var s = dgsLc_(v); return s === 'true' || s === 'yes' || s === 'y' || s === '1'; }


function dgsCell_(v) {
if (v === null || v === undefined) return '';
if (typeof v === 'number') return isFinite(v) ? String(v) : '';
return String(v);
}


var DGS_ROW_GENERATED_ = 'generated';
var DGS_ROW_REGENERATED_ = 'regenerated';
var DGS_ROW_FAILED_ = 'failed';
var DGS_ROW_CANCELLED_ = 'cancelled';
var DGS_NOTE_REASON_ = 'DGS_REASON=';
var DGS_NOTE_RETRY_ = 'DGS_RETRYABLE=';

function dgsKeptNote_(ids, p) {
ids = ids.filter(Boolean).join(',');
return ids ? (p && p.renamed ? ' Renamed.' : ' Not renamed: ' + (p ? p.rename_error || 'template' : 'under lock') + '.') + ' DGS_KEPT=' + ids + ';' : '';
}


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
ALLOCATION_PREREQUISITE_INVALID: 1, SNAPSHOT_PREREQUISITE_INVALID: 1, DOCUMENT_COLLECTION_UNDEFINED: 1, DOCUMENT_FIELD_VALUE_INVALID: 1,
DOCUMENT_TEMPLATE_TYPE_MISMATCH: 1
};
function dgsFailureClass_(reason) {
return DGS_PRE_DISPATCH_REASONS_[dgsUc_(reason)] ? 'PRE_DISPATCH_BLOCKING' : 'POST_DISPATCH_RECOVERABLE';
}
function dgsRetryable_(reason) { return dgsFailureClass_(reason) === 'POST_DISPATCH_RECOVERABLE'; }






var DGS_SCOPE_DIMS_ = ['series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language'];
function dgsScopeMatch_(row, ctx) {
for (var i = 0; i < DGS_SCOPE_DIMS_.length; i++) {
var d = DGS_SCOPE_DIMS_[i], tv = dgsStr_(row[d]);
if (!tv || (d === 'language' && ctx.language === null)) continue;
if (dgsLc_(tv) !== dgsLc_(d === 'country' && ctx.template_country !== undefined ? ctx.template_country : ctx[d])) return false;   // R15G-EU D2
}
return true;
}


function dgsScopeExact_(row, dim, value) {
var tv = dgsStr_(row[dim]);
return !!tv && !!dgsStr_(value) && dgsLc_(tv) === dgsLc_(value);
}

function dgsDateOnly_(v) {
var s = dgsStr_(v), m, d = Object.prototype.toString.call(v) === '[object Date]' && v;
if (!d) {
if (!s) return '';
m = /^(\d{4})([-\/])(\d\d)\2(\d\d)(?:[T ]([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(Z|[+-][01]\d:[0-5]\d)?)?$/.exec(s);
if (!m || m[3] < 1 || m[3] > 12 || m[4] < 1 || m[4] > new Date(Date.UTC(m[1], m[3], 0)).getUTCDate()) return null;
if (!m[6]) return m[1] + '-' + m[3] + '-' + m[4];
d = new Date(s.replace(/\//g, '-').replace(' ', 'T'));
}
return isNaN(d.getTime()) ? null : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function dgsInWindow_(row, asOf) {
var q = dgsDateOnly_(asOf); if (q === '') return true;
var from = dgsDateOnly_(row.effective_from), to = dgsDateOnly_(row.effective_to);
return q !== null && from !== null && to !== null && !(from && from > q) && !(to && to < q);
}
function dgsActive_(row, asOf) { return dgsLc_(row.status) === 'active' && dgsBool_(row.is_active) && dgsInWindow_(row, asOf); }

























var DGS_SHIPMENT_CLASSES_ = [
{ class_key: 'SHIPMENT_DETAIL', document_type: 'shipment_detail', document_usage: 'internal', requirement: 'ALWAYS', match: 'SCOPED', render: 'SHIPDETAIL', gates_transition: true, renderer_available: true },
{ class_key: 'COMMERCIAL_INVOICE_EXPORT', generic: 'TW_FACTORY', document_type: 'commercial_invoice', document_usage: 'export', requirement: 'ALWAYS', match: 'SCOPED', render: 'CI', gates_transition: false, renderer_available: true },
{ class_key: 'PACKING_LIST_EXPORT', generic: 'TW_FACTORY', document_type: 'packing_list', document_usage: 'export', requirement: 'ALWAYS', match: 'SCOPED', render: 'PL', gates_transition: true, renderer_available: true },
{ class_key: 'COMMERCIAL_INVOICE_IMPORT', generic: 'TW_FACTORY', document_type: 'commercial_invoice', document_usage: 'import', requirement: 'CONDITIONAL', match: 'EXACT_COUNTRY', render: 'CI', gates_transition: false, renderer_available: true },
{ class_key: 'PACKING_LIST_IMPORT', generic: 'TW_FACTORY', document_type: 'packing_list', document_usage: 'import', requirement: 'CONDITIONAL', match: 'EXACT_COUNTRY', render: 'PL', gates_transition: false, renderer_available: true },
{ class_key: 'CARRIER_BOOKING', document_type: 'carrier_booking_form', document_usage: 'carrier', requirement: 'CONDITIONAL', match: 'EXACT_CARRIER', render: 'BOOKING', gates_transition: false, renderer_available: true }
];
var DGS_DOC_STATES_ = ['REQUIRED_AND_EXECUTABLE', 'OPTIONAL_AND_EXECUTABLE', 'CONFIGURATION_REQUIRED', 'RUNTIME_DEFERRED', 'NOT_APPLICABLE'];



function dgsClassifyEntry_(entry, field) {
var cls = null;
for (var i = 0; i < DGS_SHIPMENT_CLASSES_.length; i++) { if (DGS_SHIPMENT_CLASSES_[i].class_key === entry.class_key) cls = DGS_SHIPMENT_CLASSES_[i]; }
var rendererAvailable = !!(cls && cls.renderer_available);
var gatesByPolicy = !!(cls && cls.gates_transition);
var complete = field ? !!field.complete : null;
var missing = (field && field.missing) || [];
var unresolved = (field && field.unresolved) || [];
var state, nextAction, blocks = false, retryable = false, readiness, reasonCode = '';
if (!rendererAvailable) {
state = 'RUNTIME_DEFERRED';
readiness = 'RUNTIME_DEFERRED';
reasonCode = 'RENDERER_NOT_IMPLEMENTED';
nextAction = 'No render model exists for this document class yet. It is listed for visibility and is never generated, never blocking, and never written as a GENERATED registry row.';
} else if (complete === false) {
state = 'CONFIGURATION_REQUIRED';
readiness = 'CONFIGURATION_REQUIRED';
reasonCode = unresolved.length ? 'DOCUMENT_FIELD_AUTHORITY_MISSING' : 'DOCUMENT_REQUIRED_FIELD_MISSING';
nextAction = unresolved.length
? 'The active template marks a field required that has no source of truth in the system. Make it optional, or put the value in the template, or supply the missing business authority.'
: 'Complete the missing business fields listed, then retry document generation.';
retryable = true;
} else if (complete === null) {
state = (entry.requirement === 'ALWAYS') ? 'REQUIRED_AND_EXECUTABLE' : 'OPTIONAL_AND_EXECUTABLE';
readiness = 'FIELD_CONTRACT_UNVERIFIED';
reasonCode = 'FIELD_CONTRACT_UNVERIFIED';
nextAction = 'Template and renderer are in place. The required-field contract is verified against the finalized snapshot, which exists only after dispatch.';
} else {
state = (entry.requirement === 'ALWAYS') ? 'REQUIRED_AND_EXECUTABLE' : 'OPTIONAL_AND_EXECUTABLE';
readiness = 'READY';
nextAction = 'Ready to generate.';
blocks = gatesByPolicy;
}




return {
class_key: entry.class_key, document_type: entry.document_type, document_usage: entry.document_usage,
template_key: entry.template_key, template_id: entry.template_id, template_version: entry.template_version,
applicability: 'APPLICABLE',
renderer_status: rendererAvailable ? 'AVAILABLE' : 'DEFERRED',
field_contract_status: complete === null ? 'UNVERIFIED' : (complete ? 'COMPLETE' : 'INCOMPLETE'),
transition_requirement: gatesByPolicy ? 'GATE' : 'NOT_A_GATE',
blocks_transition: blocks,
readiness_verdict: readiness,
reason_code: reasonCode,
next_action: nextAction,

document_state: state,
requirement: entry.requirement,
renderer_available: rendererAvailable,
required_field_contract_complete: complete === null ? 'UNKNOWN' : complete,
missing_fields: missing,
missing_authorities: unresolved.map(function (u) { return dgsStr_(u.placeholder); }),
retryable: retryable,
gates_by_policy: gatesByPolicy
};
}

function dgsExecutableManifest_(entries, fieldByClass) {
fieldByClass = fieldByClass || {};
var rows = (entries || []).map(function (e) { return dgsClassifyEntry_(e, fieldByClass[e.class_key] || null); });
return {
documents: rows,
blocking: rows.filter(function (r) { return r.blocks_transition; }).map(function (r) { return r.class_key; }),
configuration_required: rows.filter(function (r) { return r.document_state === 'CONFIGURATION_REQUIRED'; }).map(function (r) { return r.class_key; }),
runtime_deferred: rows.filter(function (r) { return r.document_state === 'RUNTIME_DEFERRED'; }).map(function (r) { return r.class_key; }),


policy_gating: rows.filter(function (r) { return r.gates_by_policy; }).map(function (r) { return r.class_key; })
};
}

function dgsGatingClassKeys_() {
return DGS_SHIPMENT_CLASSES_.filter(function (c) { return c.gates_transition; }).map(function (c) { return c.class_key; });
}
function dgsDocumentType_(value) { var v = dgsLc_(value); return v === 'shipment_detail_sheet' ? 'shipment_detail' : v; }
function dgsClassCandidates_(templates, ctx, cls) {
return (templates || []).filter(function (t) {
if (dgsLc_(t.related_entity_type) !== 'shipment') return false;
if (dgsDocumentType_(t.document_type) !== cls.document_type) return false;
if (dgsLc_(t.document_usage) !== cls.document_usage) return false;
if (!dgsActive_(t, ctx.as_of)) return false;
if (cls.match === 'EXACT_COUNTRY' && !dgsScopeExact_(t, 'country', ctx.template_country !== undefined ? ctx.template_country : ctx.country)) return false;   // R15G-EU D2: the shared EU template
if (cls.match === 'EXACT_CARRIER' && !dgsScopeExact_(t, 'carrier_id', ctx.carrier_id)) return false;
return dgsScopeMatch_(t, ctx);
});
}
function dgsShipmentManifest_(templates, ctx) {
ctx = ctx || {};
if (ctx.documents_not_required === true) return { ok: true, entries: [], errors: [], covered: [], fallback: [] };
var entries = [], errors = [], covered = [], setBy = {}, fallback = [];
templates = templates || [];
var ovsOk = !!(ctx.overseas && ctx.overseas.eligible === true);
DGS_SHIPMENT_CLASSES_.forEach(function (cls) {
var cand = dgsClassCandidates_(templates, ctx, cls), src = ctx.source || {}, ty = cls.document_type, own;


if (cls.generic) {
if (setBy[ty]) { if (cand.length) covered.push({ class_key: cls.class_key, status: 'COVERED_BY_CARRIER_SET', by: setBy[ty] }); return; }
own = templates.filter(function (t) { return dgsLc_(t.related_entity_type) === 'shipment' && dgsLc_(t.document_type) === ty && dgsStr_(t.carrier_id) && dgsActive_(t, ctx.as_of) && dgsScopeMatch_(t, ctx); });
if (own.length) cand = own, setBy[ty] = cls.class_key;
// AD3-B (Owner rule 九): DEFINITE "carrier document template not configured" - the template table was read, no active template of THIS carrier
// for this document type and no carrier booking set -> for a server-proven legal overseas source the system Shipment Details is the document.
else if (ovsOk && !templates.some(function (t) { return dgsLc_(t.related_entity_type) === 'shipment' && dgsLc_(t.document_type) === 'carrier_booking_form' && dgsStr_(t.carrier_id) && dgsActive_(t, ctx.as_of) && dgsScopeMatch_(t, ctx); })) {
  fallback.push({ class_key: cls.class_key, document_type: ty, document_usage: cls.document_usage, reason: 'CARRIER_DOCUMENT_TEMPLATE_NOT_CONFIGURED', carrier_id: dgsStr_(ctx.carrier_id) }); return;
}


else if ((own = templates.filter(function (t) { return dgsLc_(t.related_entity_type) === 'shipment' && dgsLc_(t.document_type) === 'carrier_booking_form' && dgsStr_(t.carrier_id) && dgsActive_(t, ctx.as_of) && dgsScopeMatch_(t, ctx); })).length) {
setBy[ty] = 'CARRIER_BOOKING'; covered.push({ class_key: cls.class_key, status: 'COVERED_BY_CARRIER_SET', by: 'CARRIER_BOOKING', template_keys: own.map(function (t) { return dgsStr_(t.template_key); }) }); return;
}
else if (cand.length && src.state !== cls.generic) {
errors.push(src.state === 'SOURCE_UNKNOWN' ? { class_key: cls.class_key, status: 'SOURCE_UNKNOWN', reason: 'SHIPMENT_' + src.reason }


: { class_key: cls.class_key, status: 'CONFIGURATION_REQUIRED', reason: 'SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED', why: cls.requirement === 'ALWAYS' ? 'PURPOSE_UNSERVED' : 'PURPOSE_UNDECIDED', generic: 'NOT_APPLICABLE', source: src.state || 'NONE',
template_keys: templates.filter(function (t) { return dgsStr_(t.carrier_id) && dgsLc_(t.carrier_id) === dgsLc_(ctx.carrier_id) && dgsActive_(t, ctx.as_of); }).map(function (t) { return dgsStr_(t.template_key); }) });
return;
}
}
if (cand.length > 1) {
errors.push({ class_key: cls.class_key, reason: 'SHIPMENT_DOCUMENT_TEMPLATE_AMBIGUOUS', count: cand.length,
template_keys: cand.slice(0, 5).map(function (t) { return dgsStr_(t.template_key); }) });
return;
}
if (!cand.length) {
if (cls.requirement === 'ALWAYS') errors.push({ class_key: cls.class_key, reason: 'SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED', document_type: cls.document_type, document_usage: cls.document_usage });
return;
}
entries.push({
class_key: cls.class_key, document_type: cls.document_type, document_usage: cls.document_usage, overseas_no_po: ovsOk,
requirement: cls.requirement, match_basis: cls.match, render: cls.render,
template_id: dgsStr_(cand[0].template_id), template_key: dgsStr_(cand[0].template_key),
template_version: dgsNum_(cand[0].template_version), template: cand[0]
});
});
if (dgsRecoveryTargetCp2c_(ctx.shipment_id)) entries.forEach(function(e) {
if (e.render !== 'SHIPDETAIL') return;
if (e.template_id !== 'TPL-SHIPDETAIL-STANDARD-V1' || e.template_version !== 1) { errors.push({ reason: 'CP2C_BASE_TEMPLATE_CHANGED' }); return; }
// Output-policy revision only; no shared template/master mutation.
e.template_version = 2; e.template = Object.assign({}, e.template, { template_version: 2 });
});
entries.forEach(function (e) { var c = covered.filter(function (x) { return x.by === e.class_key; }); if (c.length) { e.requirement = 'ALWAYS'; e.covers = c.map(function (x) { return x.class_key; }); } });
var sdE = entries.filter(function (e) { return e.render === 'SHIPDETAIL'; })[0];
return { ok: !errors.length, entries: entries, errors: errors, covered: covered, fallback: fallback,
shipment_details_fallback: fallback.length ? { used: !!sdE, status: sdE ? 'SHIPMENT_DETAILS_FALLBACK_USED' : 'SHIPMENT_DETAILS_TEMPLATE_MISSING', label: '已使用出貨明細備援 (shipment details fallback used)', reason: 'CARRIER_DOCUMENT_TEMPLATE_NOT_CONFIGURED', replaces: fallback.map(function (f) { return f.class_key; }), shipment_details_template_key: sdE ? sdE.template_key : '', source_basis: ctx.overseas } : null,
required_count: entries.filter(function (e) { return e.requirement === 'ALWAYS'; }).length };
}





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

function dgsPoContext_(po, lines, asOf) {
var s = {}, b = 0, k;
lines.forEach(function (l) { var v = dgsStr_(l.series), u = dgsUc_(v); if (v) s[u] = s[u] || v; else b++; });
k = Object.keys(s);
if (b || k.length !== 1) return { ok: false, reason: b ? 'PO_SERIES_MISSING' : 'PO_SERIES_MIXED', series: k };
return { ok: true, ctx: { factory_id: dgsStr_(po.factory_id), series: s[k[0]], supplier_id: dgsStr_(po.supplier_id), language: 'zh-TW', as_of: asOf } };
}











function dgsExplainPoTemplateCandidates_(templates, ctx) {
ctx = ctx || {};
var rows = (templates || []).map(function (t) {
var gates = [];
var entityOk = dgsLc_(t.related_entity_type) === 'purchase_order';
if (!entityOk) gates.push({ gate: 'related_entity_type', expected: 'purchase_order', found: dgsStr_(t.related_entity_type) || '(blank)' });
var typeOk = dgsLc_(t.document_type) === 'purchase_order';
if (!typeOk) gates.push({ gate: 'document_type', expected: 'purchase_order', found: dgsStr_(t.document_type) || '(blank)' });
var statusOk = dgsLc_(t.status) === 'active';
if (!statusOk) gates.push({ gate: 'status', expected: 'active', found: dgsStr_(t.status) || '(blank)' });
var flagOk = dgsBool_(t.is_active);
if (!flagOk) gates.push({ gate: 'is_active', expected: 'TRUE', found: dgsStr_(t.is_active) || '(blank)' });
var windowOk = dgsInWindow_(t, ctx.as_of);
if (!windowOk) gates.push({ gate: 'effective_window', expected: 'covers ' + (dgsStr_(ctx.as_of) || '(no as_of)'),
found: 'effective_from=' + (dgsStr_(t.effective_from) || '(blank)') + ' effective_to=' + (dgsStr_(t.effective_to) || '(blank)') });

var scopeFails = [];
for (var i = 0; i < DGS_SCOPE_DIMS_.length; i++) {
var d = DGS_SCOPE_DIMS_[i], tv = dgsStr_(t[d]);
if (!tv) continue;
if (dgsLc_(tv) !== dgsLc_(ctx[d])) scopeFails.push({ gate: d, expected: dgsStr_(ctx[d]) || '(blank on this PO)', found: tv });
}
gates = gates.concat(scopeFails);
return {
template_id: dgsStr_(t.template_id), template_key: dgsStr_(t.template_key), template_name: dgsStr_(t.template_name),
template_version: dgsNum_(t.template_version),
declared_scope: (function () { var o = {}; for (var k = 0; k < DGS_SCOPE_DIMS_.length; k++) { o[DGS_SCOPE_DIMS_[k]] = dgsStr_(t[DGS_SCOPE_DIMS_[k]]) || '(wildcard)'; } return o; })(),
selected: gates.length === 0,
rejected_by: gates
};
});
var matched = rows.filter(function (r) { return r.selected; });


var poShaped = rows.filter(function (r) {
return !r.rejected_by.some(function (g) { return g.gate === 'related_entity_type' || g.gate === 'document_type'; });
});
var verdict, detail;
if (matched.length === 1) { verdict = 'RESOLVED'; detail = 'exactly one active, in-window, correctly scoped purchase_order template matched'; }
else if (matched.length > 1) { verdict = 'RUNTIME_DEFECT'; detail = 'more than one template matched, so selection is ambiguous — the scope dimensions do not distinguish them'; }
else if (poShaped.length === 0) { verdict = 'CONFIGURATION_REQUIRED'; detail = 'document_templates contains NO purchase_order template row at all'; }
else { verdict = 'CONFIGURATION_REQUIRED'; detail = poShaped.length + ' purchase_order template row(s) exist but every one was rejected — see rejected_by for the exact gate on each'; }
return {
context: (function () { var o = { as_of: dgsStr_(ctx.as_of) || '(none)' }; for (var k = 0; k < DGS_SCOPE_DIMS_.length; k++) { o[DGS_SCOPE_DIMS_[k]] = dgsStr_(ctx[DGS_SCOPE_DIMS_[k]]) || '(blank)'; } return o; })(),
scope_dimensions: DGS_SCOPE_DIMS_.slice(),
total_template_rows: rows.length,
purchase_order_shaped_rows: poShaped.length,
candidate_count: matched.length,
candidates: rows,
verdict: verdict,
detail: detail,

required_configuration_row: matched.length ? null : (function () {
var row = { related_entity_type: 'purchase_order', document_type: 'purchase_order', status: 'active', is_active: 'TRUE',
template_key: '(choose a stable key, e.g. PO_STANDARD_' + (dgsStr_(ctx.factory_id) || 'DEFAULT') + ')',
template_version: 1, effective_from: '(blank = always)', effective_to: '(blank = always)' };
for (var k = 0; k < DGS_SCOPE_DIMS_.length; k++) {
var d = DGS_SCOPE_DIMS_[k];
row[d] = dgsStr_(ctx[d]) ? (dgsStr_(ctx[d]) + '  (or leave BLANK to act as a wildcard)') : '(blank = wildcard)';
}
return row;
})(),
authorization_note: 'PROPOSAL ONLY — no document_templates row was created or modified. Adding it is a separate, user-authorized action.',
no_fallback_note: 'No fallback template is introduced. dgsSelectPoTemplate_ remains the only selection authority and an unresolved template stays a HARD GATE with zero writes.'
};
}




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
var raw = dgsStr_(rule) ? dgsStr_(rule).replace(/\{\{([A-Z0-9_]+)\}\}/g, function (m, k) { return k in (scalars || {}) ? dgsCell_(scalars[k]) : m; }) : dgsStr_(fallback);
var name = raw.replace(DGS_DRIVE_FORBIDDEN_RE_, '_').replace(/\s+/g, ' ').trim();
return name;
}
function dgsFileNameLeft_(rule, have) { var out = []; (dgsStr_(rule).match(/\{\{[A-Z0-9_]+\}\}/g) || []).forEach(function (x) { var k = x.slice(2, -2); if (!(k in (have || {})) && out.indexOf(k) < 0) out.push(k); }); return out; }
function dgsFileNameDefs_(tpl, have, templates, every) {
var need = dgsFileNameLeft_(tpl.file_name_rule, have), out = {}, ids = {}, defs = {}, et = dgsLc_(tpl.related_entity_type); if (!need.length) return out;
templates.forEach(function (t) { if (dgsLc_(t.related_entity_type) === et && dtTemplateActive_(t, '')) ids[dgsStr_(t.template_id)] = 1; });
every.forEach(function (f) { var p = dgsStr_(f.placeholder), ft = dgsLc_(f.field_type);
if (!ids[dgsStr_(f.template_id)] || need.indexOf(p) < 0 || !(dgsBool_(f.is_active) || !dgsStr_(f.is_active)) || ft === 'collection' || ft === 'collection_item' || dgsStr_(f.collection_key) || dgsLc_(f.data_scope) === 'line') return;
(defs[p] = defs[p] || {})[[f.data_source_table, f.data_source_field, f.transform_rule, f.format_rule].map(dgsLc_).join('|')] = Object.assign({}, f, { fallback_rule: '', default_value: '', required: 'TRUE', worksheet_name: '' }); });
// DOC-CONTRACT-R1: missing shipment filename totals have canonical meanings, not cross-template definitions.
need.forEach(function (p) {
var total = et === 'shipment' && { TOTAL_QTY: 'shipment_total_qty', TOTAL_CARTONS: 'shipment_total_cartons' }[p], ks = Object.keys(defs[p] || {});
out[p] = total ? { template_id: tpl.template_id, field_id: p, placeholder: p, field_type: 'scalar', data_scope: 'header',
data_source_table: 'shipments', data_source_field: total, required: 'TRUE', is_active: 'TRUE', transform_rule: '', format_rule: '' } :
ks.length === 1 ? defs[p][ks[0]] : ks.length ? 'DOCUMENT_FILE_NAME_TOKEN_AMBIGUOUS' : 'DOCUMENT_FILE_NAME_TOKEN_UNDEFINED';
});
return out;
}
function dgsShipmentFileNameTotals_(ss, shipmentId) {
var lines = sfoReadTable_(ss, 'shipment_lines', []).filter(function (l) {
return dgsStr_(l.shipment_id) === dgsStr_(shipmentId) && !sc13LineRemoved_(l);
}), totals = docTotals_(lines), out = { qty: '', cartons: '' };
// Do not turn missing/invalid inputs or an empty shipment into a plausible zero in a filename.
[['qty', 'shipment_qty'], ['cartons', 'shipment_carton_qty']].forEach(function (pair) {
if (lines.length && lines.every(function (l) { var s = dgsStr_(l[pair[1]]), n = Number(s.replace(/,/g, '')); return s !== '' && isFinite(n) && n >= 0; }) && isFinite(totals[pair[0]])) out[pair[0]] = totals[pair[0]];
});
return out;
}
function dgsScalarHave_(fs) { var h = {}; fs.forEach(function (f) { var ft = dgsLc_(f.field_type); if (ft !== 'collection' && ft !== 'collection_item' && !dgsStr_(f.collection_key) && dgsLc_(f.data_scope) !== 'line') h[dgsStr_(f.placeholder)] = 1; }); return h; }
var DGS_FN_PRE_ = ['h:shipment_id', 'h:shipment_no', 'h:reference_id', 'h:company', 'h:country', 'h:marketplace', 'h:etd', 'h:eta', 'h:shipping_method', 'h:external_shipment_id', 'h:last_mile_delivery', 'h:shipments_customs_type', 'h:totals.qty', 'h:totals.cartons', 'h:totals.gross_weight', 'h:totals.net_weight', 'h:totals.cbm'];
function dgsTplKeyOf_(tl) { return function (id) { var t = tl.filter(function (x) { return dgsStr_(x.template_id) === dgsStr_(id); })[0]; return t ? dgsStr_(t.template_key) : dgsStr_(id); }; }
function dgsFileNameBorrow_(fd, model, keyOf, pre) {
var values = {}, bad = [];
Object.keys(fd).forEach(function (p) { var d = fd[p], pr = [], src, b, v; if (typeof d === 'string') { bad.push(p + ' ' + d); return; }
src = dgsLc_(d.data_source_table) + '.' + dgsLc_(d.data_source_field);
if (pre && DT_SRC_[src] && DGS_FN_PRE_.indexOf(DT_SRC_[src]) < 0) pr.push('DOCUMENT_FILE_NAME_VALUE_UNPROVABLE:' + src);
else { b = dtMapPlaceholders_(model, [d]); v = b.values[p];
b.missing.forEach(function (m) { pr.push.apply(pr, m.problems || []); });
if (!pr.length && (b.missing.length || v == null || Array.isArray(v) || dgsStr_(v) === '')) pr.push('DOCUMENT_FILE_NAME_VALUE_MISSING'); }
if (pr.length) bad.push(p + ' <- ' + keyOf(d.template_id) + '.' + dgsStr_(d.field_id) + ' ' + pr.join('+')); else values[p] = v; });
return { values: values, bad: bad };
}
function dgsPdfTabs_(t) { var v = dgsStr_(t && t.pdf_sheets); return v ? v.split('|').map(dgsStr_) : null; }

function dgsPlannedTabs_(fields, tpl, render) { var ws = []; if (render !== 'PO' && dgsLc_(tpl && tpl.template_file_type) === 'google_sheet') fields.forEach(function (f) { var w = dgsStr_(f.worksheet_name); if (w && ws.indexOf(w) < 0) ws.push(w); }); return ws; }
function dgsSheetPolicyCarrierR2_(sheet, tpl) {
if (dgsStr_(tpl.template_key) === 'BOOKING_AGL' && dgsNum_(tpl.template_version) === 1 && sheet.name === 'Template') sheet.fixed_scalars = { DECLARED_CURRENCY: 'USD' };
return sheet;
}
function dgsPdfScopeOff_(pdf, ws) { return (pdf || []).map(function (n, i) { return !n || pdf.indexOf(n) !== i ? [n, 'DOCUMENT_PDF_SCOPE_TAB_INVALID'] : ws.indexOf(n) < 0 ? [n, 'DOCUMENT_PDF_SCOPE_TAB_NOT_PLANNED'] : null; }).filter(Boolean); }

function dgsPdfDrift_(row, tpl) { var m = /DGS_PDF=([^;]*);/.exec(dgsStr_(row && row.note)), had = m ? decodeURIComponent(m[1]) : '', want = (dgsPdfTabs_(tpl) || []).join('|'); return had === want ? null : { pdf_delivered: had || '(whole workbook)', pdf_configured: want || '(whole workbook)' }; }
function dgsBuildRenderPayload_(opts) {
opts = opts || {};
var tpl = opts.template || {};
var split = dgsSplitMapped_(opts.values);
var fileName = dgsFilename_(tpl.file_name_rule, split.scalars, opts.fallback_file_name), left = dgsFileNameLeft_(tpl.file_name_rule, split.scalars);
if (!fileName || left.length) return { ok: false, reason: 'DOCUMENT_FILE_NAME_UNRESOLVED', template_key: dgsStr_(tpl.template_key), unresolved: left };
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
if (opts.sheets) payload.sheets = opts.sheets;
var cs = { s: payload.scalars, c: payload.collections, t: payload.template_id, v: payload.template_version, w: payload.sheets };
if (opts.pdf_sheets) cs.p = payload.pdf_sheets = opts.pdf_sheets.slice();
payload.source_checksum = dgsChecksum_(cs);
return { ok: true, payload: payload };
}





function dgsShipMonth_(ymd) {
var m = /^(\d{4})[-\/](\d{2})/.exec(dgsStr_(ymd));
return m ? m[1] + '-' + m[2] : '';
}

function dgsYmd_(v) { var d = dgsDateOnly_(v); return d === null ? dgsStr_(v) : d; }
function dgsQty_(v) { v = dgsStr_(v); return v && Number(v.replace(/,/g, '')); }
function dgsPoNumber_(v) {
if (typeof v === 'boolean' || dgsStr_(v) === '') return '';
var n = Number(dgsStr_(v).replace(/,/g, ''));
return isFinite(n) ? n : '';
}
function dgsPoPayloadModel_(po, poLines, joins) {
po = po || {}; joins = joins || {};
var skuLabel = joins.sku_labels || {};
var lines = (poLines || []).map(function (l, i) {
var sku = dgsStr_(l.sku);
var label = skuLabel[sku] || {};
// Canonical money facts win even when blank or zero; legacy names are read-only aliases.
var qty = dgsNum_(l.ordered_qty), own = Object.prototype.hasOwnProperty;
var price = dgsPoNumber_(own.call(l, 'unit_cost') ? l.unit_cost : l.unit_price);
var amount = own.call(l, 'line_amount') ? dgsPoNumber_(l.line_amount) : (price === '' ? '' : price * qty);
var ready = dgsYmd_(l.expected_completion_date) || dgsYmd_(l.expected_ready_date) || dgsYmd_(po.expected_completion_date) || dgsYmd_(po.supplier_expected_ready_date);
return {
line_no: i + 1,
purchase_order_line_id: dgsStr_(l.purchase_order_line_id),
sku: sku,
site_sku: dgsStr_(l.site_sku),
series: dgsStr_(l.series) || dgsStr_(po.series),


factory_item_name: dgsStr_(l.factory_item_name) || dgsStr_(label.factory_item_name) || dgsStr_(label.product_name_cn) || dgsStr_(label.product_name_en),
factory_item_unit: dgsStr_(l.factory_item_unit) || dgsStr_(label.factory_item_unit) || dgsStr_(l.unit),
product_name_en: dgsStr_(label.product_name_en),
product_name_cn: dgsStr_(label.product_name_cn),
ordered_qty: dgsQty_(l.ordered_qty),
carton_qty: dgsQty_(l.carton_qty),
units_per_carton: dgsNum_(l.units_per_carton),
unit_price: price,
unit_cost: price,
line_amount: amount,
expected_ready_date: ready,
expected_completion_date: ready,
expected_ship_date: dgsYmd_(l.expected_ship_date) || dgsYmd_(po.expected_ship_date)
};
});
var totals = { qty: 0, cartons: 0, amount: 0, sku_count: 0 }, u = {};
var skuSet = {};
lines.forEach(function (l) {
totals.qty += dgsNum_(l.ordered_qty); totals.cartons += dgsNum_(l.carton_qty); totals.amount += dgsNum_(l.line_amount);
if (typeof l.ordered_qty != 'number') u.q = 1;
if (typeof l.carton_qty != 'number') u.c = 1;
if (typeof l.line_amount != 'number') u.a = 1;
if (l.sku) skuSet[l.sku] = 1;
});
totals.sku_count = Object.keys(skuSet).length;
if (u.a) totals.amount = '';



var orderDate = dgsYmd_(po.order_date) || dgsYmd_(joins.order_date_candidate);
var shipDate = dgsYmd_(po.expected_ship_date);
var header = {
purchase_order_id: dgsStr_(po.purchase_order_id),
po_no: dgsStr_(po.po_no),
km_po_no: dgsStr_(po.km_po_no),
order_date: orderDate,
doc_date: orderDate,
deposit_due_date: dgsYmd_(po.deposit_due_date) || dgsYmd_(joins.deposit_due_date_candidate),
supplier_expected_ready_date: dgsYmd_(po.supplier_expected_ready_date),
supplier_confirmed_ready_date: dgsYmd_(po.supplier_confirmed_ready_date),
expected_ship_date: shipDate,
ship_date_full: shipDate,
ship_month: dgsShipMonth_(shipDate),
expected_completion_date: dgsYmd_(po.expected_completion_date),
inspection_date: dgsYmd_(po.inspection_date),
series: dgsStr_(po.series),
currency: dgsStr_(po.currency),
supplier_id: dgsStr_(po.supplier_id),
supplier_name: dgsStr_(po.supplier_name),
factory_id: dgsStr_(po.factory_id),
factory_name: dgsStr_(joins.factory_name),
warehouse_id: dgsStr_(po.warehouse_id),
total_qty: u.q ? '' : totals.qty,
total_cartons: u.c ? '' : totals.cartons,
total_amount: u.a ? '' : totals.amount,
total_sku: totals.sku_count
};
return { ok: true, document_type: 'PO', template_key: 'PURCHASE_ORDER_STANDARD',
purchase_order_id: header.purchase_order_id, header: header, lines: lines, totals: totals };
}

function dgsPoMap_(model, rows) {
var fs = rows.filter(function (f) { return dgsBool_(f.is_active) || !dgsStr_(f.is_active); })
.sort(function (a, b) { return dgsNum_(a.sort_order) - dgsNum_(b.sort_order); });
var values = {}, missing = [], bad = [], keys = {}, X = 'DOCUMENT_FIELD_VALUE_INVALID';
function ph(f) { return dgsStr_(f.placeholder); }
function kid(f) { return dgsLc_(f.field_type) === 'collection_item' || dgsLc_(f.transform_rule) === 'row_number'; }
function no(f, r) { bad.push({ placeholder: ph(f), reason: r }); return ''; }
function one(f, l, i) {
var p = dgsStr_(f.data_source_path) || dgsStr_(f.data_source_field), m = /^purchase_order(s|_lines)\.(\w+)$/.exec(p),
r = dgsStr_(f.format_rule), t = dgsLc_(f.transform_rule), v;
if (!/^(|date_only|month_only|row_number)$/.test(t) || !/^(|text|number|currency|yyyy-MM(-dd)?|#,##0)$/.test(r)) return no(f, 'DOCUMENT_TRANSFORM_UNSUPPORTED');
v = t === 'row_number' ? i + 1 : !m ? dtResolvePath_(l || model, p) : m[1] === 's' ? model.header[m[2]] : l && l[m[2]];
if (dgsStr_(v) === '') { if (dgsBool_(f.required)) missing.push({ placeholder: ph(f), data_source_path: p }); return ''; }
if (r[0] === 'y') return (v = dgsDateOnly_(v)) ? v.slice(0, r.length) : no(f, X);
if (r !== '#,##0') return dtApplyFormat_(v, r);
v = Number(String(v).replace(/,/g, ''));
return v % 1 === 0 ? (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+$)/g, ',') : no(f, X);
}
fs.forEach(function (f) { if (dgsLc_(f.field_type) === 'collection' && dgsLc_(f.data_scope) === 'line') keys[dgsStr_(f.collection_key)] = 1; });
fs.forEach(function (f) {
var k = dgsStr_(f.collection_key);
if (dgsLc_(f.field_type) !== 'collection' && !kid(f)) values[ph(f)] = one(f, null, -1);
else if (!k || !keys[k]) no(f, 'DOCUMENT_COLLECTION_UNDEFINED');
else if (!kid(f)) values[ph(f)] = model.lines.map(function (l, i) {
var o = {}; fs.forEach(function (c) { if (kid(c) && dgsStr_(c.collection_key) === k) o[ph(c)] = one(c, l, i); }); return o;
});
});
return { values: values, missing: missing, problems: bad, reason: bad.length ? bad[0].reason : missing.length ? 'DOCUMENT_REQUIRED_FIELD_MISSING' : '' };
}






function dgsDriveReadiness_(io, entries, entityType) {
var templates = (entries || []).map(function (e) { return e.template || e; });
var root = dofResolveBatchRoot_(templates, entityType);
if (!root.ok) return { ok: false, status: 'BLOCKED', reason: root.reason, detail: root, checks: [] };
var checks = [];
var rootProbe = io.probeFolder(root.root_folder_id);
checks.push({ check: 'ROOT_FOLDER', target: root.root_folder_id, ok: !!(rootProbe && rootProbe.ok), reason: (rootProbe && rootProbe.ok) ? '' : 'OUTPUT_FOLDER_ROOT_INACCESSIBLE', diagnostic: rootProbe && rootProbe.diagnostic || null });
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
var fok = !!(fileProbe && fileProbe.ok), r = fok ? (fileProbe.mime === DFO_SUPPORTED_TYPES_[dgsLc_(t.template_file_type)] ? '' : 'DOCUMENT_TEMPLATE_TYPE_MISMATCH') : 'DOCUMENT_TEMPLATE_ASSET_INACCESSIBLE';
checks.push({ check: 'TEMPLATE_ASSET', class_key: dgsStr_(e.class_key), template_key: dgsStr_(t.template_key), target: assetId, ok: !r, reason: r, diagnostic: fileProbe && fileProbe.diagnostic || null });
if (r) blocked = blocked || r;
}
if (blocked) return { ok: false, status: 'BLOCKED', reason: blocked, root_folder_id: root.root_folder_id, checks: checks };
return { ok: true, status: 'READY', root_folder_id: root.root_folder_id, checks: checks,
note: 'Readiness only — configured identities resolved and reachable. It does not guarantee a later write succeeds.' };
}


function dgsIdentityKey_(entityType, entityId, templateId, templateVersion) {
return dgsLc_(entityType) + '|' + dgsStr_(entityId) + '|' + dgsStr_(templateId) + '|' + dgsNum_(templateVersion);
}

function dgsPoBatchDate_(po, candidate) {
var d = procurementDateOnly_(po.order_date) || procurementDateOnly_(candidate);
return /^\d{4}-\d\d-\d\d$/.test(d) ? { ymd: d.replace(/-/g, ''), date: d, source: dgsStr_(po.order_date) ? 'ORDER_DATE' : 'SEND_PO_DATE' } : { ymd: '', source: 'UNRESOLVED' };
}


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


function dgsFactoryName_(ss, factoryId) {
var id = dgsStr_(factoryId); if (!id) return '';
var rows = sfoReadTable_(ss, 'warehouses', []);
for (var i = 0; i < rows.length; i++) {
if (dgsStr_(rows[i].warehouse_id) === id) {
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




function dgsLocked_(lock, fn) {
var o = { lock_acquired: !lock, recorded: false };
try { if (lock) o.lock_acquired = lock.tryLock(30000); if (o.lock_acquired) o.recorded = !!fn(); }
catch (e) { o.registry_error = String(e && e.message || e); }
finally { if (lock && o.lock_acquired) try { lock.releaseLock(); } catch (e) {} }
if (!o.lock_acquired) o.registry_error = o.registry_error || 'LOCK_UNAVAILABLE';
return o;
}

function dgsUnregistered_(id, f, folderId, reg) {
var t = Object.assign({ document_id: id, file_id: f.file_id, pdf_file_id: f.pdf_file_id, output_folder_id: f.output_folder_id || folderId }, reg);
if (!t.recorded) console.error('DGS_UNREGISTERED ' + JSON.stringify(t));
return t;
}
function dgsUpdateRegistry_(sheet, documentId, patch, force) {
var d = sheet.getDataRange().getValues();
var head = d[0].map(function (x) { return String(x).trim(); });
var cId = head.indexOf('document_id');
if (cId === -1) return false;
for (var r = 1; r < d.length; r++) {
if (String(d[r][cId]).trim() === dgsStr_(documentId)) {

if (!force && d[r][head.indexOf('file_id')] && /^(re)?generated$/.test(d[r][head.indexOf('status')])) {
var t = d[r].map(function (v, i) { return /file_(id|url)$|^regen/.test(head[i]) ? '' : v; });
t[cId] = dgsNewDocId_(); t[head.indexOf('status')] = DGS_ROW_CANCELLED_;
t[head.indexOf('note')] = 'Not attached; ' + documentId + ' was current. ' + patch.note + dgsKeptNote_([patch.file_id, patch.pdf_file_id]);
sheet.appendRow(t);
return 'TRACED';
}
var o = /DGS_KEPT=.*/.exec(d[r][head.indexOf('note')]);
if (o && 'note' in patch) patch.note += ' ' + o[0];
Object.keys(patch).forEach(function (k) { var c = head.indexOf(k); if (c !== -1) sheet.getRange(r + 1, c + 1).setValue(patch[k]); });
return true;
}
}
return false;
}
function dgsNewDocId_() { return 'GDOC-' + Utilities.getUuid().substring(0, 12).toUpperCase(); }





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
office_format: state !== 'READY' ? '' : /\/spreadsheets\//.test(dgsStr_(row.file_url)) ? 'xlsx' : /\/document\//.test(dgsStr_(row.file_url)) ? 'docx' : '',
office_export: dgsExportHint_(),
output_folder_id: dgsStr_(row.output_folder_id),
generated_at: dgsStr_(row.generated_at),
status: state,
reason: meta.reason,
message: meta.text,
retryable: state === 'FAILED_RETRYABLE' || (state === 'CONFIGURATION_REQUIRED' && dgsLc_(row.related_entity_type) === 'shipment'),
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

function dgsFolderUrl_(folderId) {
var id = dgsStr_(folderId);
return id ? ('https://drive.google.com/drive/folders/' + id) : '';
}






function dgsShipmentSource_(ss, id) {
id = dgsStr_(id); if (!id) return { state: 'SOURCE_UNKNOWN', reason: 'SOURCE_BLANK' };
var w = sfoReadTable_(ss, 'warehouses', []).filter(function (r) { return dgsLc_(r.warehouse_id) === dgsLc_(id); }), c = w.length === 1 ? dgsUc_(w[0].country) : '';
if (w.length !== 1) return { state: 'SOURCE_UNKNOWN', reason: w.length ? 'SOURCE_DUPLICATED_IN_MASTER' : 'SOURCE_NOT_IN_MASTER' };
if (!dgsBool_(w[0].is_factory_warehouse) && dgsUc_(w[0].warehouse_type) !== 'FACTORY') return { state: 'NOT_A_FACTORY', documents_not_required: !dgsShipmentDocumentsRequired_(id, w) };
if (!/^[A-Z]{2}$/.test(c)) return { state: 'SOURCE_UNKNOWN', reason: !('country' in w[0]) ? 'SOURCE_COUNTRY_COLUMN_MISSING' : c ? 'SOURCE_COUNTRY_NOT_ISO2' : 'SOURCE_COUNTRY_BLANK' };
return { state: c === 'TW' ? 'TW_FACTORY' : 'OTHER_FACTORY', country: c };
}
function dgsShipmentDocumentsRequired_(sourceId, warehouses) {
  var id=dgsStr_(sourceId), rows=(warehouses||[]).filter(function(w){return dgsStr_(w.warehouse_id)===id;});
  if(!id||rows.length!==1)return true;
  var w=rows[0],type=dgsUc_(w.warehouse_type),flag=dgsLc_(w.is_factory_warehouse);
  if(dgsBool_(w.is_factory_warehouse)||type==='FACTORY')return true;
  return !(/^(false|0|no|n)$/.test(flag)||type==='3PL'||type==='FBA');
}
function dgsNoShipmentDocuments_(shipmentId) {
  return {ok:true,status:'NOT_REQUIRED',reason:'OVERSEAS_SOURCE_NO_DOCUMENTS',shipment_id:dgsStr_(shipmentId),expected:0,generated:0,reused:0,failed:0,configuration_required:0,results:[],zero_write:true};
}
function dgsShipmentContext_(ss, shipmentId) { var o = dgsShipmentContext0_(ss, shipmentId); if (o.ok) { o.ctx.documents_not_required=o.ctx.source.documents_not_required===true; o.ctx.overseas = o.ctx.documents_not_required ? null : dgsOverseasDocBasis_(ss, o.row, o.ctx.source); o.overseas = o.ctx.overseas; } return o; }
// AD3-B (Owner rule 九): the documents of a shipment whose source the SERVER proves is a legal overseas 3PL on an APPROVED transfer branch (22_
// csdOverseasTransferEligibility_ on the saved row - never a client claim). Factory / unknown sources -> null (their rules are unchanged).
function dgsOverseasDocBasis_(ss, row, src) {
  if (!src || src.state !== 'NOT_A_FACTORY') return null;
  var e = (typeof sfoOverseasNoPoTransfer_ === 'function') ? sfoOverseasNoPoTransfer_(ss, row) : { eligible: false, reason: 'RULE_UNAVAILABLE' };
  return { eligible: e.eligible === true, reason: e.reason || '', transfer_kind: e.transfer_kind || '' };
}
function dgsShipmentContext0_(ss, shipmentId) {
var row = dgsFindRow_(sfoReadTable_(ss, 'shipments', []), 'shipment_id', shipmentId);
if (!row) return { ok: false, reason: 'SHIPMENT_NOT_FOUND' };
var dest15g = dgsDestCountry15g_(ss, row);   // R15G-EU D2: a planning-set row's actual country from its SAVED destination warehouse
return {
ok: true, row: row,
ctx: {
shipment_id: dgsStr_(shipmentId), country: dest15g.country, template_country: dgsUc_(row.country), site_country: dgsUc_(row.country), set_unresolved: dest15g.unresolved, marketplace: dgsStr_(row.marketplace), carrier_id: dgsStr_(row.carrier_id),
series: '', sku: '', supplier_id: '', factory_id: '', language: null,
as_of: dgsStr_(row.etd) ? row.etd : row.shipped_at, source: dgsShipmentSource_(ss, row.source_warehouse_id)
},
overseas: null,
status: dgsLc_(row.status),
external_shipment_id: dgsStr_(row.external_shipment_id),
reference_id: dgsStr_(row.reference_id),
warehouse_code: dgsStr_(row.warehouse_code),
shipped_at: dgsCanonicalTimestamp_(row.shipped_at)
};
}





function dgsResolveShipmentLeafFolder_(ss, tpl, shipmentId) {
var sc = dgsShipmentContext_(ss, shipmentId);
if (!sc.ok) return { ok: false, reason: sc.reason };
var folder = dofResolveShipmentFolder_(dofFolderIo_(), {
templates: [tpl], destination_country: sc.ctx.country,
external_shipment_id: sc.external_shipment_id, shipped_at: sc.shipped_at
});
if (!folder.ok) return folder;
var own = dgsShipmentLeafOwnership_(ss, folder, shipmentId);
return own.ok ? folder : Object.assign({}, own, { ok: false, folder_id: '' });
}

// R69+EXTID-CAND2 (local candidate): a shipment writes into an EXISTING leaf only when the leaf is provably its own. Every
// generated_documents row filed in that folder must belong to this shipment; with none of its own there, the folder must hold no file.
function dgsLeafForeignRows_(all, folderId, shipmentId) {
var fid = dgsStr_(folderId), sid = dgsStr_(shipmentId);
return (all || []).filter(function (r) { return fid && dgsStr_(r.output_folder_id) === fid && !(dgsLc_(r.related_entity_type) === 'shipment' && dgsStr_(r.related_entity_id) === sid); }).length;
}
function dgsShipmentLeafOwnership_(ss, folder, shipmentId) {
if (!folder || !folder.ok || !folder.reused) return { ok: true };
var all = dtReadTable_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_), fid = dgsStr_(folder.folder_id);
var other = dgsLeafForeignRows_(all, fid, shipmentId);
if (other) return { ok: false, reason: 'SHIPMENT_FOLDER_OWNED_BY_ANOTHER_ENTITY', folder_name: folder.folder_name, other_rows: other };
var own = all.filter(function (r) { return dgsStr_(r.output_folder_id) === fid; }).length;
if (!own && DriveApp.getFolderById(fid).getFiles().hasNext()) return { ok: false, reason: 'SHIPMENT_FOLDER_NOT_PROVEN_OWN', folder_name: folder.folder_name, own_rows: 0 };
return { ok: true, own_rows: own };
}
// R69+EXTID-CAND3 (local candidate): before Confirm commits - the leaf this shipment WOULD use, looked at read-only. A conflict or a
// leaf that is not provably its own refuses; anything the readiness gate owns (no context, no manifest, no root) is left to it.
function dgsShipmentLeafPeek_(ss, shipmentId) {
var sc = dgsShipmentContext_(ss, shipmentId);
if (!sc.ok) return { ok: true, skipped: sc.reason };
if(sc.ctx.documents_not_required)return dgsNoShipmentDocuments_(shipmentId);
var manifest = dgsShipmentManifest_(dgsTemplates_(ss), sc.ctx);
if (!manifest.ok) return { ok: true, skipped: 'MANIFEST' };
var peek = dofPeekShipmentFolder_(dofFolderIo_(), { templates: manifest.entries.map(function (e) { return e.template; }), destination_country: sc.ctx.country,
external_shipment_id: sc.external_shipment_id, shipped_at: dgsStr_(sc.shipped_at) || shipmentTimestamp_() });
if (!peek.ok) return /CONFLICT$/.test(dgsStr_(peek.reason)) ? peek : { ok: true, skipped: peek.reason };
if (!peek.exists) return { ok: true, exists: false };
return dgsShipmentLeafOwnership_(ss, { ok: true, reused: true, folder_id: peek.folder_id, folder_name: peek.folder_name }, shipmentId);
}









// SANDBOX-GATE-1l (K-1): the frozen measures whose UNKNOWN value a REQUIRED placeholder must refuse before any write
var DGS_K1_SRC_ = ['l:cbm', 'l:gross_weight', 'l:net_weight', 'l:carton_length', 'l:carton_width', 'l:carton_height', 'h:totals.cbm', 'h:totals.gross_weight', 'h:totals.net_weight'];
function dgsFieldContract_(ss, e, cols, x) {
var all = dgsFieldsFor_(ss, e.template_id), out = [], keys = {}, ws = dgsPlannedTabs_(all, e.template, e.render), pdf = dgsPdfTabs_(e.template), off = dgsPdfScopeOff_(pdf, ws);
var fs = all.filter(function (f) { return dgsBool_(f.is_active) || !dgsStr_(f.is_active); });
fs.forEach(function (f) { if (dgsLc_(f.field_type) === 'collection') keys[dgsStr_(f.collection_key)] = 1; });
fs.forEach(function (f) {
var ft = dgsLc_(f.field_type), tb = dgsLc_(f.data_source_table), src = tb + '.' + dgsLc_(f.data_source_field), sm = DT_SRC_[src], w = dgsStr_(f.worksheet_name), bad = [], t = [];
if (ft === 'collection') return;
if (!sm && tb && tb !== '-' && tb !== '.') bad.push('DOCUMENT_SOURCE_NOT_IN_MODEL:' + src);
if (sm && DT_DB12_.indexOf(sm.slice(2)) >= 0 && cols().indexOf(sm.slice(2)) < 0) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:' + src);
else if (sm && DT_DB12_.indexOf(sm.slice(2)) >= 0 && x && x.db12) bad.push.apply(bad, x.db12(f, ws.length > 0));
if (sm && DGS_K1_SRC_.indexOf(sm) >= 0 && dgsBool_(f.required) && x && x.k1) bad.push.apply(bad, x.k1(sm, src));   // SANDBOX-GATE-1l (K-1): a REQUIRED measure that is UNKNOWN
if (sm && SFO_DB16L_.indexOf(sm.slice(2)) >= 0 && SFO_DB16L_.some(function (k) { return cols().indexOf(k) < 0; })) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:' + src);
var mh = sm && DT_MASTER_[src] && sm.charAt(0) === 'h', mg = sm && DT_MASTER_[src] && !mh ? (SFO_DB16A_.indexOf(sm.slice(2)) >= 0 ? SFO_DB16A_ : SFO_DB16U_) : null;
if (mh && x && x.snap().indexOf(sm.slice(2)) >= 0 && x.snap().indexOf('consignee_contact_ref') < 0) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:' + src);
else if (mh && x && x.snap().indexOf(sm.slice(2)) >= 0 && x.contact) bad.push.apply(bad, x.contact(src));
if (mg && mg.some(function (k) { return cols().indexOf(k) < 0; })) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:' + src);
else if (mg && x && x.master) bad.push.apply(bad, x.master(src, dgsBool_(f.required)));
if (/(^|;)\s*exact_regional_match\s*(;|$)/i.test(dgsStr_(f.transform_rule)) && tb !== 'sku_regional_details') bad.push('DOCUMENT_TRANSFORM_SOURCE_MISMATCH:exact_regional_match');
if (/(^|;)\s*carton_reference_format\s*(;|$)/i.test(dgsStr_(f.transform_rule)) && x && x.snap().indexOf('external_shipment_id') < 0) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:shipments.external_shipment_id');
if (sm && x && SFO_DB16_.indexOf(sm.slice(2)) >= 0 && x.snap().indexOf(sm.slice(2)) < 0) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:' + src);
else if (sm === 'h:shipping_method_label' && x && !x.rc().ok) bad.push('DOCUMENT_RATE_CARD_UNRESOLVED:' + x.rc().reason);
if (sm && /^h:consignee/.test(sm) && x && !x.dest().ok) bad.push('DOCUMENT_DESTINATION_UNRESOLVED:' + x.dest().error);
if ((ft === 'collection_item' || dgsLc_(f.data_scope) === 'line' || dgsStr_(f.collection_key)) && !keys[dgsStr_(f.collection_key)]) bad.push('DOCUMENT_COLLECTION_UNDEFINED:' + dgsStr_(f.collection_key));
dtApplyTransform_('', f.transform_rule, t, {}); dtApplyFormat_('x', f.format_rule, t);
t.forEach(function (p) { if (/_UNSUPPORTED/.test(p)) bad.push(p); });
if (bad.length) out.push(dgsStr_(f.placeholder) + (w ? ' (' + w + ')' : '') + ': ' + bad.join(', '));
});
var fh = dgsScalarHave_(fs);
if (x && x.fn && dgsFileNameLeft_(e.template.file_name_rule, fh).length) { var fb = x.fn(e.template, fh).bad;
if (fb.length) out.push('DOCUMENT_FILE_NAME_UNRESOLVED: ' + fb.join(', ')); }
if (off.length) out.push('DOCUMENT_PDF_SCOPE_INVALID: ' + off.map(function (x) { return (x[0] || '(blank)') + ' ' + x[1]; }).join(', '));
if (!out.length && ws.length) {
var pre; try { pre = dfoDefaultIo_().planWorkbook(dgsStr_(e.template.template_file_id), ws.map(function (w) {
var mine = fs.filter(function (f) { return dgsStr_(f.worksheet_name) === w; }), s = { name: w, scalars: {}, children: {}, required: [] };
mine.forEach(function (f) { var ft = dgsLc_(f.field_type), ph = dgsStr_(f.placeholder);
if (ft === 'collection') s.children[ph] = mine.filter(function (c) { return dgsLc_(c.field_type) !== 'collection' && dgsStr_(c.collection_key) === dgsStr_(f.collection_key); }).map(function (c) { return dgsStr_(c.placeholder); });
else { if (!dgsStr_(f.collection_key)) s.scalars[ph] = 1; if (dgsBool_(f.required)) s.required.push(ph); } });
return dgsSheetPolicyCarrierR2_(s, e.template); }), pdf); } catch (eT) { pre = 'DOCUMENT_TEMPLATE_UNREADABLE: ' + dgsStr_(eT && eT.message || eT); }
if (pre) out.push(pre);
}
return out;
}




function dgsDb12FrozenIssues_(f, ls, hdr, num) {
var line = dgsLc_(f.field_type) === 'collection_item' || dgsLc_(f.data_scope) === 'line' || dgsStr_(f.collection_key) !== '', req = dgsBool_(f.required), out = [];
var col = DT_SRC_[dgsLc_(f.data_source_table) + '.' + dgsLc_(f.data_source_field)].slice(2), at = function (l, i) { return (i + 1) + ' ' + l.sku; };
ls.forEach(function (l, i) { if (l.__amb.indexOf(col) >= 0) out.push('DOCUMENT_SOURCE_AMBIGUOUS:sku_details.' + col + ' (line ' + at(l, i) + ': ' + l.__rows + ' rows)'); });
if (out.length) return out;
(line ? ls.map(function (l, i) { return [Object.assign({}, l, { __row: i + 1 }), [at(l, i)]]; }) : [[{ header: hdr, lines: ls }, null]]).forEach(function (c) {
var r = dtResolveField_(f, c[0], num, hdr), w = c[1] || ls.map(function (l, i) { return dgsStr_(l[col]) === '' ? at(l, i) : ''; }).filter(Boolean);
r.bad.forEach(function (b) { out.push(b + (/\(line /.test(b) ? '' : ' (line ' + (c[1] || ls.map(at)).join(', ') + ')')); });
if (req && !r.present && !r.bad.length) out.push('DOCUMENT_FIELD_VALUE_MISSING:sku_details.' + col + ' (line ' + (w.length ? w : ls.map(at)).join(', ') + ')');
});
return out;
}
function dgsReadinessLineContextCp2a_(ss, shipment) {
    var strict = typeof xcoLinkCount_ === 'function' && xcoLinkCount_(ss, shipment.shipment_id) >= 2;
    return function (line) {
        var marked = typeof xcoMarkerOf_ === 'function' && xcoMarkerOf_(line.note);
        if (!strict && !marked) return shipment;
        var source = sc13SourceStrict_(ss, line, shipment);
        return Object.assign({}, shipment, { company: source.company, country: source.country, marketplace: source.marketplace });
    };
}

function dgsShipmentReadiness_(ss, shipmentId, opts) {
opts = opts || {};
var sc = dgsShipmentContext_(ss, shipmentId);
if (!sc.ok) return { ok: false, status: 'BLOCKED', reason: sc.reason, shipment_id: dgsStr_(shipmentId) };
if(sc.ctx.documents_not_required)return Object.assign(dgsNoShipmentDocuments_(shipmentId),{source_warehouse_id:dgsStr_(sc.row.source_warehouse_id),blockers:[],manifest:[],configuration_issues:[],drive_readiness:{status:'NOT_REQUIRED',checks:[]}});
var blockers = [];
if (!sc.external_shipment_id) blockers.push({ reason: 'MISSING_EXTERNAL_SHIPMENT_ID', field: 'shipments.external_shipment_id', correction: 'Shipment Draft > Execution Fields > Shipment ID' });
var bucket = dofDestinationBucket_(sc.ctx.country);
if (sc.ctx.set_unresolved) blockers.push({ reason: 'PLANNING_SET_DESTINATION_UNRESOLVED', field: 'shipments.destination_warehouse_id', value: sc.ctx.set_unresolved, correction: 'Shipment Draft > Destination warehouse (a DE / ES / IT / FR warehouse)' });   // R15G-EU D2
if (!bucket.ok) blockers.push({ reason: 'UNSUPPORTED_DESTINATION_BUCKET', field: 'shipments.country', value: bucket.country, correction: 'Shipment Draft > Destination' });
var manifest = dgsShipmentManifest_(dgsTemplates_(ss), sc.ctx);


var gating = {}; dgsGatingClassKeys_().forEach(function (k) { gating[k] = 1; });
(manifest.covered || []).forEach(function (c) { if (gating[c.class_key]) gating[c.by] = 1; });
var configIssues = [];
manifest.errors.forEach(function (e) {
var item = { reason: e.reason, status: e.status || '', why: e.why || '', class_key: e.class_key, count: e.count || 0, template_keys: e.template_keys || [], correction: 'Admin > Document Templates' };
if (gating[e.class_key]) blockers.push(item); else configIssues.push(item);
});
var xcoCur_ = (typeof xcoCiCurrencyConflict_ === 'function') ? xcoCiCurrencyConflict_(ss, sc, manifest, gating) : null; if (xcoCur_) blockers.push(xcoCur_);   // XCO-R15G O-5: before Confirm
var hdr = null, cols = function () { var sh = hdr || ss.getSheetByName('shipment_final_output_lines'); return (hdr = hdr || (sh ? sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(dgsStr_) : [])); };
var sh2 = null, rc = null, x = { snap: function () { var s = sh2 || ss.getSheetByName('shipment_final_output_snapshots'); return (sh2 = sh2 || (s ? s.getRange(1, 1, 1, Math.max(1, s.getLastColumn())).getValues()[0].map(dgsStr_) : [])); },
rc: function () { return (rc = rc || sfoRateCardLabel_(ss, sc.row)); },
dest: function () { return (dst = dst || partyResolveConsignee_(partyReadLogisticsLocations_(ss), sc.row, null, partyReadWarehouses_(ss))); },
master: function (src, required) {
if (!mst) { try { var src0 = sfoMasterSource_(ss, { a: true, u: true }), sid = dgsStr_(sc.row.shipment_id), lineContextCp2a = dgsReadinessLineContextCp2a_(ss, sc.row);
mst = { ls: sfoReadTable_(ss, 'shipment_lines', []).filter(function (l) { return dgsStr_(l.shipment_id) === sid && !(typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(l)); }).map(function (l) { return sfoMasterFacts_(src0, dgsStr_(l.sku), lineContextCp2a(l)); }) }; } catch (eM) { mst = { err: 'DOCUMENT_MASTER_UNREADABLE' }; } }
return mst.err ? [mst.err + ':' + src] : !mst.ls.length ? ['DOCUMENT_SOURCE_UNRESOLVED:' + src + ' (no shipment line)'] : dtMasterBad_(dtMasterIssues_(mst.ls, src), src, required);
},
k1: function (sm, src) {   // SANDBOX-GATE-1l (K-1): the same builder the snapshot uses (34_ sfoBuildLine_), on this shipment's lines
if (!k1c) { try { var sid1 = dgsStr_(sc.row.shipment_id), first1 = {};
sfoReadTable_(ss, 'sku_details', []).forEach(function (r) { var k = sfoStr_(r.sku); if (k && !first1[k]) first1[k] = r; });
k1c = { ls: sfoReadTable_(ss, 'shipment_lines', []).filter(function (l) { return dgsStr_(l.shipment_id) === sid1 && !(typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(l)); }).map(function (l) { return sfoBuildLine_(l, first1[sfoStr_(l.sku)] || {}, '', null, ''); }) }; } catch (eK) { k1c = { err: 'DOCUMENT_MASTER_UNREADABLE' }; } }
if (k1c.err) return [k1c.err + ':' + src];
if (!k1c.ls.length) return ['DOCUMENT_SOURCE_UNRESOLVED:' + src + ' (no shipment line)'];
var col = sm.slice(2).replace(/^totals\./, ''), miss = k1c.ls.map(function (b, i) { return dgsStr_(b[col]) === '' ? (i + 1) + ' ' + b.sku : ''; }).filter(Boolean);
return miss.length ? ['DOCUMENT_FIELD_VALUE_MISSING:' + src + ' (unknown, not 0; line ' + miss.join(', ') + ')'] : [];
},
db12: function (f, num) {
if (!d12) { try { var sid = dgsStr_(sc.row.shipment_id), first = {}, rows = {};
sfoReadTable_(ss, 'sku_details', []).forEach(function (r) { var k = sfoStr_(r.sku); if (!k) return; (rows[k] = rows[k] || []).push(r); if (!first[k]) first[k] = r; });
d12 = { ls: sfoReadTable_(ss, 'shipment_lines', []).filter(function (l) { return dgsStr_(l.shipment_id) === sid && !(typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(l)); }).map(function (l) {
var b = sfoBuildLine_(l, first[sfoStr_(l.sku)], '', null, ''), rs = rows[b.sku] || [], o = { sku: b.sku, __amb: [], __rows: rs.length };
DT_DB12_.forEach(function (k) { o[k] = b[k]; if (rs.some(function (r) { return sfoStr_(r[k]) !== b[k]; })) o.__amb.push(k); });
return o; }) }; } catch (eD) { d12 = { err: 'DOCUMENT_MASTER_UNREADABLE' }; } }
return d12.err ? [d12.err + ':sku_details'] : !d12.ls.length ? ['DOCUMENT_SOURCE_UNRESOLVED:sku_details (no shipment line)'] : dgsDb12FrozenIssues_(f, d12.ls, x.pre().header, num);
},
fn: function (tpl, have) { fnT = fnT || dgsTemplates_(ss); fnF = fnF || dtReadTable_(ss, 'document_template_fields', DOCUMENT_TEMPLATE_FIELDS_HEADERS_);
var defs = dgsFileNameDefs_(tpl, have, fnT, fnF), model = x.pre();
if (Object.keys(defs).some(function (p) { var f = defs[p]; return typeof f !== 'string' && /^h:totals\.(qty|cartons)$/.test(DT_SRC_[dgsLc_(f.data_source_table) + '.' + dgsLc_(f.data_source_field)] || ''); })) {
model = { header: Object.assign({}, model.header, { totals: Object.assign({}, model.header.totals, dgsShipmentFileNameTotals_(ss, shipmentId)) }), lines: model.lines };
}
return dgsFileNameBorrow_(defs, model, dgsTplKeyOf_(fnT), true); },
pre: function () { if (pre0) return pre0; var h = sfoBuildHeader_(sc.row), sn = x.snap();
[['external_shipment_id', sfoStr_], ['last_mile_delivery', sfoLc_], ['shipments_customs_type', sfoLc_]].forEach(function (k) { if (sn.indexOf(k[0]) >= 0) h[k[0]] = k[1](sc.row[k[0]]); });
return (pre0 = { header: docHeaderBlock_(h, [], []), lines: [] }); },
contact: function (src) {
if (!wct) { var t; try { t = sfoMasterTable_(ss, 'warehouses'); } catch (eC) { t = { err: 'UNREADABLE' }; } var d = x.dest(); wct = sfoWarehouseContact_(t, sc.row.destination_warehouse_id, d.ok ? d.consignee.warehouse_id : ''); }
var o = dtMasterIssues_([wct], src); o.miss = []; return dtMasterBad_(o, src, false);
} }, dst = null, mst = null, wct = null, fnT = null, fnF = null, pre0 = null, d12 = null, k1c = null;
manifest.entries.forEach(function (e) {
var c = dgsFieldContract_(ss, e, cols, x);
if (c.length) (gating[e.class_key] ? blockers : configIssues).push({ reason: 'DOCUMENT_FIELD_CONTRACT_INVALID', status: 'CONFIGURATION_REQUIRED', class_key: e.class_key, template_key: e.template_key, problems: c, correction: 'Admin > Document Templates' });
});


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
configuration_issues: configIssues, covered_by_carrier_set: manifest.covered, shipment_details_fallback: manifest.shipment_details_fallback || null,
drive_readiness: { status: drive.status, reason: drive.reason || '', root_folder_id: drive.root_folder_id || '', checks: drive.checks || [] },
non_gating_drive_readiness: { status: nonGatingDrive.status, reason: nonGatingDrive.reason || '' },
blockers: blockers
};
}







function dgsSeriesExportPage_(entry, worksheet) {
if (entry.document_usage === 'export' && /^(CI|PL)$/.test(entry.render)) return true;
// Only these verified carrier customs tabs are export projections, not every booking page.
return entry.render === 'BOOKING' && entry.template_key === 'BOOKING_TOP_SEALAND' &&
['通用發票導入模版', '裝箱單發票通用模板'].indexOf(worksheet) >= 0;
}

function dgsSeriesExportModel_(model, skuRows, companyOf) {   // XCO-R15G G3: companyOf(line) -> company | null (unproven); absent = one company
var bySku = Object.create(null), groups = Object.create(null), ordered = [], problems = [], lineageGaps = [];
(skuRows || []).forEach(function (r) { var k = dgsStr_(r.sku); if (k) (bySku[k] || (bySku[k] = [])).push(r); });
(model.lines || []).forEach(function (l, i) {
var sku = dgsStr_(l.sku), rows = bySku[sku] || [], series = l.packing_group ? dgsStr_(l.packing_series) : rows.length === 1 ? dgsStr_(rows[0].series) : '';
if (rows.length > 1) problems.push('DOCUMENT_SERIES_SOURCE_AMBIGUOUS:' + sku);
var co = companyOf ? companyOf(l) : ''; if (co === null || co === undefined) lineageGaps.push('DOCUMENT_LINE_LINEAGE_MISSING:' + dgsStr_(l.shipment_line_id || l.sku));
var key = series ? 'series:' + JSON.stringify([series, dgsStr_(co), dgsStr_(l.packing_group)].concat(XCO_SERIES_FACTS_.map(function (k) { return dgsStr_(l[k]); }))) : 'line:' + i;
if (!groups[key]) { groups[key] = []; ordered.push(key); }
groups[key].push({ line: l, series: series });
});
if (lineageGaps.length) return { ok: false, reason: 'DOCUMENT_LINE_LINEAGE_MISSING', problems: lineageGaps };   // XCO-R15G G3
if (problems.length) return { ok: false, reason: 'DOCUMENT_SERIES_SOURCE_AMBIGUOUS', problems: problems };
var lines = ordered.map(function (key) {
var g = groups[key].slice().sort(function (a, b) { var x = dgsStr_(a.line.sku), y = dgsStr_(b.line.sku); return x < y ? -1 : x > y ? 1 : 0; });
var representative = g[0].line, out = Object.assign({}, representative);
if (g.length < 2) return out;
// Never turn incompatible customs or carton facts into representative-SKU facts.
['hs_code', 'country_of_origin', 'declared_currency', 'units_per_carton', 'carton_length', 'carton_width', 'carton_height',
'material', 'product_use', 'battery_type', 'magnet_type', 'carton_weight', 'package_weight', 'tax_rate_id', 'vat_no', 'eori_no',
'regular_price', 'regular_price_currency'].forEach(function (k) {
if (g.some(function (x) { return dgsStr_(x.line[k]) !== dgsStr_(representative[k]); })) problems.push('DOCUMENT_SERIES_FACT_CONFLICT:' + g[0].series + ':' + k);
});
['shipment_qty', 'carton_qty', 'gross_weight', 'net_weight', 'cbm', 'declared_total_value'].forEach(function (k) {
var total = 0, known = true, present = false;
g.forEach(function (x) { var v = x.line[k]; present = present || k in x.line; if (v === '' || v == null || !isFinite(Number(v))) known = false; else total += Number(v); });
if (present) out[k] = known ? total : '';
});
if ('declared_total_value' in out) out.declared_unit_value = out.shipment_qty > 0 && out.declared_total_value !== '' ? out.declared_total_value / out.shipment_qty : '';
var ranges = g.map(function (x) { return { start: Number(x.line.carton_no_start), end: Number(x.line.carton_no_end) }; }).sort(function (a, b) { return a.start - b.start; });
if (ranges.every(function (r, i) { return Number.isInteger(r.start) && r.start > 0 && Number.isInteger(r.end) && r.end >= r.start && (!i || r.start === ranges[i - 1].end + 1); })) {
out.carton_no_start = String(ranges[0].start); out.carton_no_end = String(ranges[ranges.length - 1].end);
} else if (g.some(function (x) { return dgsStr_(x.line.carton_no_start) || dgsStr_(x.line.carton_no_end); })) return g.map(function (x) { return Object.assign({}, x.line); });   // XCO-R15G G3: a broken carton run goes back to one row per line
out.po_allocations = [];
g.forEach(function (x) { (x.line.po_allocations || []).forEach(function (p) { out.po_allocations.push(Object.assign({}, p)); }); });
out.series = g[0].series;
out.source_skus = g.map(function (x) { return { sku: dgsStr_(x.line.sku), shipment_qty: x.line.shipment_qty }; });
return out;
});
lines = [].concat.apply([], lines.map(function (x) { return Array.isArray(x) ? x : [x]; }));   // XCO-R15G G3
if (problems.length) return { ok: false, reason: 'DOCUMENT_SERIES_FACT_CONFLICT', problems: problems };
return { ok: true, model: Object.assign({}, model, { lines: lines }), source_basis: 'CURRENT_SKU_DETAILS_SERIES' };
}

// CODEX-DOC-TAX-SOURCE-1: Owner policy is US-only; do not change shared master definitions.
function dgsCountryFieldsDoc1_(fields, model) {
var h = (model || {}).header || {}, dest = sfoUc_(((h.consignee || {}).address || {}).country || h.country);
if (dest !== 'US') return fields;
return fields.map(function (f) {
var src = dgsLc_(f.data_source_table) + '.' + dgsLc_(f.data_source_field);
if (!/^tax_referral_rates\.(vat_no|eori_no)$/.test(src)) return f;
return Object.assign({}, f, { field_type: 'constant', data_source_table: '', data_source_field: '', data_source_path: '', required: false,
default_value: '', fallback_rule: '', transform_rule: '', format_rule: 'text' });
});
}
function dgsSkuProjectionCp2_(model, companyOf) {
    var groups = Object.create(null), order = [], gaps = [];
    var additive = ['shipment_qty', 'carton_qty', 'gross_weight', 'net_weight', 'cbm', 'declared_total_value'];
    var references = ['shipment_line_id', 'site_sku', 'product_url', 'marketplace_product_id', 'regional_ref', 'regular_price_ref', 'sku_master_ref', 'po_allocations', 'carton_no_start', 'carton_no_end'];
    (model.lines || []).forEach(function (l, i) {
        var company = companyOf ? companyOf(l) : '';
        if (company == null) gaps.push(String(l.shipment_line_id || l.sku));
        var facts = Object.keys(l).filter(function (k) { return additive.indexOf(k) < 0 && references.indexOf(k) < 0; }).sort().map(function (k) { return [k, l[k]]; });
        var key = l.sku ? JSON.stringify(facts) : 'line:' + i;
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push({ line: l, company: company });
    });
    if (gaps.length) return { ok: false, reason: 'DOCUMENT_LINE_LINEAGE_MISSING', problems: gaps };
    var output = [];
    order.forEach(function (key) {
        var members = groups[key], first = members[0].line, row = Object.assign({}, first);
        if (members.length < 2) { output.push(row); return; }
        var ranges = members.map(function (m) { return { s: String(m.line.carton_no_start || ''), e: String(m.line.carton_no_end || ''), n: Number(m.line.carton_qty) }; }).sort(function (a, b) { return Number(a.s) - Number(b.s); });
        var blank = ranges.every(function (r) { return !r.s && !r.e; });
        var contiguous = ranges.every(function (r, i) { return /^\d+$/.test(r.s) && /^\d+$/.test(r.e) && Number(r.s) > 0 && Number(r.e) - Number(r.s) + 1 === r.n && (!i || Number(r.s) === Number(ranges[i - 1].e) + 1); });
        if (!blank && !contiguous) { members.forEach(function (m) { output.push(Object.assign({}, m.line)); }); return; }
        additive.forEach(function (k) {
            if (!members.some(function (m) { return k in m.line; })) return;
            row[k] = members.every(function (m) { var v = m.line[k]; return v !== '' && v != null && isFinite(Number(v)); }) ? members.reduce(function (n, m) { return n + Number(m.line[k]); }, 0) : '';
        });
        row.carton_no_start = blank ? '' : ranges[0].s;
        row.carton_no_end = blank ? '' : ranges[ranges.length - 1].e;
        row.po_allocations = [];
        members.forEach(function (m) { (m.line.po_allocations || []).forEach(function (p) { row.po_allocations.push(Object.assign({}, p)); }); });
        row.source_line_ids = members.map(function (m) { return m.line.shipment_line_id; });
        row.source_companies = members.map(function (m) { return m.company; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
        row.product_url = members.map(function (m) { return m.line.product_url; }).filter(Boolean)[0] || '';
        output.push(row);
    });
    var allocationProblems = [];
    output.forEach(function (l) {
        var names = [], poQuantitiesCp2b = Object.create(null), total = 0;
        l.po_allocations = (l.po_allocations || []).map(function (p) {
            if (p.po_no && names.indexOf(p.po_no) < 0) names.push(p.po_no);
            total += Number(p.allocated_qty);
            if (p.po_no) poQuantitiesCp2b[p.po_no] = (poQuantitiesCp2b[p.po_no] || 0) + Number(p.allocated_qty);
            return Object.assign({}, p);
        });
        if (l.po_allocations.length && (!isFinite(total) || total !== Number(l.shipment_qty))) allocationProblems.push('DOCUMENT_ALLOCATION_QTY_MISMATCH:' + l.sku);
        l.po_no = names.map(function (name) { return name + ': ' + Number(poQuantitiesCp2b[name].toFixed(8)) + ' pcs'; }).join('; ');
    });
    if (allocationProblems.length) return { ok: false, reason: 'DOCUMENT_ALLOCATION_QTY_MISMATCH', problems: allocationProblems };
    return { ok: true, model: Object.assign({}, model, { lines: output }) };
}

function dgsSkuFieldsCp2_(fields, render) {
    if (render !== 'SHIPDETAIL') return fields;
    var keys = Object.create(null);
    fields.forEach(function (f) {
        if (String(f.field_type).toLowerCase() === 'collection' && /expand_allocations/.test(String(f.transform_rule))) keys[f.collection_key] = true;
    });
    return fields.map(function (f) {
        if (!keys[f.collection_key]) return f;
        var next = Object.assign({}, f);
        if (String(f.field_type).toLowerCase() === 'collection') {
            next.data_scope = 'line'; next.transform_rule = ''; next.data_source_path = '';
        } else if (f.data_source_table === 'shipment_line_allocations' && f.data_source_field === 'allocated_qty') {
            next.data_source_table = 'shipment_lines'; next.data_source_field = 'shipment_qty'; next.data_source_path = ''; next.data_scope = 'line';
        }
        return next;
    });
}

function dgsOverseasFieldsDw1_(opts, fields, model) {
    if (!opts.entry || opts.entry.render !== 'SHIPDETAIL' || opts.entry.overseas_no_po !== true || opts.related_entity_type !== 'shipment' || !(model.lines || []).length || model.lines.some(function (l) { return (l.po_allocations || []).length; })) return fields;
    // An approved overseas transfer has no factory PO. Keep it blank, not invented; factory documents retain their requirement.
    return fields.map(function (f) { return dgsLc_(f.data_source_table) === 'purchase_orders' && dgsLc_(f.data_source_field) === 'po_no' ? Object.assign({}, f, { required: false, default_value: '', fallback_rule: '' }) : f; });
}
function dgsResolvePayload_(ss, opts) {
var entry = opts.entry, model = opts.model, tpl = entry.template;
var fields = dgsCountryFieldsDoc1_(dgsFieldsFor_(ss, entry.template_id), model), ws = dgsPlannedTabs_(fields, tpl, entry.render), sheets = null, mapped;
// CP2: physical-SKU projections do not replace the existing CI/PL Series policy.
var skuProjectionCp2 = /^(SHIPDETAIL|BOOKING)$/.test(entry.render) ? dgsSkuProjectionCp2_(model, xcoSeriesCompanyOf_(ss, model)) : null;
if (skuProjectionCp2 && !skuProjectionCp2.ok) return { ok: false, configuration_required: true, reason: skuProjectionCp2.reason, missing: [{ placeholder: 'SKU', problems: skuProjectionCp2.problems }] };
if (skuProjectionCp2) { model = skuProjectionCp2.model; fields = dgsSkuFieldsCp2_(fields, entry.render); }
fields = dgsOverseasFieldsDw1_(opts, fields, model);
var seriesModel = null;
if (!skuProjectionCp2 && (ws.length ? ws : ['']).some(function (w) { return dgsSeriesExportPage_(entry, w); })) {
seriesModel = dgsSeriesExportModel_(model, sfoReadTable_(ss, 'sku_details', []), xcoSeriesCompanyOf_(ss, model));   // XCO-R15G G3: the line company
if (!seriesModel.ok) return { ok: false, configuration_required: true, reason: seriesModel.reason, missing: [{ placeholder: 'SERIES', problems: seriesModel.problems }] };
}
if (ws.length) {
mapped = { values: {}, missing: [], warnings: [] };
sheets = ws.map(function (w) {
var fs = fields.filter(function (f) { return dgsStr_(f.worksheet_name) === w && (dgsBool_(f.is_active) || !dgsStr_(f.is_active)); }), pageModel = seriesModel && dgsSeriesExportPage_(entry, w) ? seriesModel.model : model, m = dtMapPlaceholders_(pageModel, fs, true), sp = { scalars: {}, collections: {} }, ch = {};
Object.keys(m.values).forEach(function (k) { var v = m.values[k]; if (Array.isArray(v)) sp.collections[k] = v; else sp.scalars[k] = v == null ? '' : v; });
m.missing.forEach(function (x) { mapped.missing.push(Object.assign({ worksheet_name: w }, x)); });
(m.warnings || []).forEach(function (x) { mapped.warnings.push(Object.assign({ worksheet_name: w }, x)); });
Object.keys(sp.scalars).forEach(function (k) { if (!(k in mapped.values)) mapped.values[k] = sp.scalars[k]; });
fs.forEach(function (f) { if (dgsLc_(f.field_type) === 'collection') ch[dgsStr_(f.placeholder)] = fs.filter(function (c) { return dgsLc_(c.field_type) !== 'collection' && dgsStr_(c.collection_key) === dgsStr_(f.collection_key); }).map(function (c) { return dgsStr_(c.placeholder); }); });
return dgsSheetPolicyCarrierR2_({ name: w, scalars: sp.scalars, collections: sp.collections, children: ch,
required: fs.filter(function (f) { return dgsBool_(f.required) && dgsLc_(f.field_type) !== 'collection'; }).map(function (f) { return dgsStr_(f.placeholder); }) }, tpl);
});
} else mapped = entry.render === 'PO' ? dgsPoMap_(model, fields) : dtMapPlaceholders_(seriesModel ? seriesModel.model : model, fields);


var unresolved = (entry.render === 'CI') ? docCiUnresolvedFields_(fields) : [];
if (mapped.reason || mapped.missing.length || unresolved.length) {
return { ok: false, configuration_required: true, reason: unresolved.length ? 'DOCUMENT_FIELD_AUTHORITY_MISSING' : mapped.reason || 'DOCUMENT_REQUIRED_FIELD_MISSING',
missing: mapped.missing, problems: mapped.problems || [], unresolved_authority: unresolved };
}
if (sheets && sheets.some(function (s) { return s.fixed_scalars && dgsStr_(s.scalars.DECLARED_CURRENCY) !== s.fixed_scalars.DECLARED_CURRENCY; })) {
return { ok: false, configuration_required: true, reason: 'DOCUMENT_FIXED_VALUE_MISMATCH', missing: [{ placeholder: 'DECLARED_CURRENCY', problems: ['DOCUMENT_FIXED_VALUE_MISMATCH: AGL v1 requires resolved USD'] }] };
}
if (entry.render !== 'PO' && dgsStr_(tpl.file_name_rule)) { var have = {}; Object.keys(mapped.values).forEach(function (k) { if (!Array.isArray(mapped.values[k])) have[k] = 1; });
if (dgsFileNameLeft_(tpl.file_name_rule, have).length) { var tl = dgsTemplates_(ss), fb = dgsFileNameBorrow_(dgsFileNameDefs_(tpl, have, tl, dtReadTable_(ss, 'document_template_fields', DOCUMENT_TEMPLATE_FIELDS_HEADERS_)), model, dgsTplKeyOf_(tl));
if (fb.bad.length) return { ok: false, configuration_required: true, reason: 'DOCUMENT_FILE_NAME_UNRESOLVED', template_key: entry.template_key, missing: [{ worksheet_name: '(file name)', problems: ['DOCUMENT_FILE_NAME_UNRESOLVED: ' + fb.bad.join(', ')] }] };
Object.keys(fb.values).forEach(function (p) { mapped.values[p] = fb.values[p]; }); } }
var pdf = dgsPdfTabs_(tpl), off = dgsPdfScopeOff_(pdf, ws);
if (off.length) return { ok: false, configuration_required: true, reason: 'DOCUMENT_PDF_SCOPE_INVALID', missing: off.map(function (x) { return { worksheet_name: x[0], problems: [x[1]] }; }) };
var built = dgsBuildRenderPayload_({
template: tpl, values: mapped.values, class_key: entry.class_key, sheets: sheets, pdf_sheets: pdf,
related_entity_type: opts.related_entity_type, related_entity_id: opts.related_entity_id,
folder_id: opts.folder_id, destination_bucket: opts.destination_bucket,
fallback_file_name: opts.fallback_file_name
});
if (!built.ok) return { ok: false, reason: built.reason, template_key: entry.template_key, configuration_required: !!(built.unresolved && built.unresolved.length), missing: (built.unresolved || []).map(function (p) { return { placeholder: p, worksheet_name: '(file name)', problems: ['DOCUMENT_FILE_NAME_UNRESOLVED'] }; }) };
return { ok: true, payload: built.payload, field_verdict: { complete: true, missing: [], unresolved: [], warnings: mapped.warnings || [] } };
}

// CP2C: Owner-approved Sandbox-only output revision for one shipped ticket.
function dgsRecoveryTargetCp2c_(sid) { return false; }
function dgsRecoveryIoCp2c_(io, opts) { return io; }

function dgsRenderOne_(ss, opts) {
var resolved = dgsResolvePayload_(ss, opts);
if (!resolved.ok) return resolved;
if (opts.tag) resolved.payload = Object.assign({}, resolved.payload, { final_name: resolved.payload.file_name, file_name: resolved.payload.file_name + opts.tag });
var fr = dfoRenderPayload_(dgsRecoveryIoCp2c_(dfoDefaultIo_(), opts), resolved.payload, { attempt: opts.attempt });
var tc = fr.error === 'DOCUMENT_TEMPLATE_CONTRACT_INVALID';
if (!fr.ok) return { ok: false, reason: fr.error, message: fr.message || '', payload: resolved.payload, configuration_required: tc, missing: tc ? [{ problems: [fr.message] }] : [], partial_file_id: fr.partial_file_id || fr.file_id || '', partial: fr.partial };
return { ok: true, file: fr, payload: resolved.payload, warnings: resolved.field_verdict.warnings || [] };
}












var DGS_TEMPLATE_CODE_RE_ = /^(DOCUMENT_SOURCE_NOT_IN_MODEL|DOCUMENT_SOURCE_NOT_FROZEN|DOCUMENT_COLLECTION_UNDEFINED|DOCUMENT_SOURCE_PATH_UNSUPPORTED|DOCUMENT_FALLBACK_UNSUPPORTED|DOCUMENT_TRANSFORM_UNSUPPORTED|DOCUMENT_FORMAT_UNSUPPORTED|DOCUMENT_TRANSFORM_SOURCE_MISMATCH|DOCUMENT_FIELD_AUTHORITY_MISSING|DOCUMENT_PDF_SCOPE_)/;
// R15d (SH-8B2637CC-5 document_values): a READ-ONLY diagnosis of the pre-dispatch frozen-value gate for ONE shipment - the SAME
// dgsFrozenValueGate_ Confirm runs before any write. Returns only the blockers (reason, template / class, and the gate's own problem strings:
// placeholder, worksheet, line, SKU, missing reason / source field). No lock, no write, no Drive file, no render, nothing stored.
function handleShipmentDocumentValuesCheck_(body) {
  var sid = dgsStr_(body && body.shipment_id); if (!sid) return jsonResponse_({ success: false, code: 'SHIPMENT_ID_REQUIRED', read_only: true, zero_write: true });
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sc, g;
  try { sc = dgsShipmentContext_(ss, sid); } catch (e0) { return jsonResponse_({ success: false, code: 'SHIPMENT_CONTEXT_UNREADABLE', read_only: true, zero_write: true }); }
  if (!sc.ok) return jsonResponse_({ success: false, code: dgsStr_(sc.reason) || 'SHIPMENT_CONTEXT_UNAVAILABLE', read_only: true, zero_write: true });
  // Owner condition 2 (no lock => never report on mixed data): a marker before and after the evaluation - the source revision (01_ kmSrcRevGet_:
  // false while any doPost write is in flight, bumped by every doPost write) + a digest of THIS shipment's row, lines and their allocations
  // (covers a direct sheet edit too). Any difference -> DATA_CHANGED_DURING_CHECK and NO blockers (never presented as definitive).
  var m0 = dgsDocValuesMarker16_(ss, sid);
  if (m0.rev === false) return jsonResponse_({ success: false, code: 'DATA_WRITE_IN_PROGRESS', definitive: false, message: 'a write is in progress - diagnose again in a moment', read_only: true, zero_write: true });
  if (m0.rev === null || !m0.digest) return jsonResponse_({ success: false, code: 'SOURCE_REVISION_UNAVAILABLE', definitive: false, read_only: true, zero_write: true });
  try { g = dgsFrozenValueGate_(ss, sid); } catch (e1) { return jsonResponse_({ success: false, code: 'DOCUMENT_VALUE_CHECK_FAILED', error: dgsStr_(e1 && e1.message || e1).slice(0, 300), read_only: true, zero_write: true }); }
  var m1 = dgsDocValuesMarker16_(ss, sid);
  if (m1.rev !== m0.rev || m1.digest !== m0.digest) return jsonResponse_({ success: false, code: 'DATA_CHANGED_DURING_CHECK', definitive: false, message: 'the data changed while it was being checked - diagnose again', read_only: true, zero_write: true });
  return jsonResponse_({ success: true, read_only: true, zero_write: true, definitive: true, shipment_id: sid, status: dgsStr_(sc.status), documents: g.documents || 0, values_ok: g.ok === true,
    blockers: (g.blockers || []).map(function (b) { return { reason: dgsStr_(b.reason), template_key: dgsStr_(b.template_key), class_key: dgsStr_(b.class_key), problems: (b.problems || []).map(dgsStr_) }; }) });
}
function dgsDocValuesMarker16_(ss, sid) {   // READ ONLY: { rev, digest }; rev = kmSrcRevGet_() (false = a write in flight, null = unreadable)
  var rev = (typeof kmSrcRevGet_ === 'function') ? kmSrcRevGet_() : null, dig = '';
  try {
    var sh = sfoReadTable_(ss, 'shipments', []).filter(function (r) { return dgsStr_(r.shipment_id) === sid; }), ln = sfoReadTable_(ss, 'shipment_lines', []).filter(function (l) { return dgsStr_(l.shipment_id) === sid && !(typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(l)); }), ids = {};
    ln.forEach(function (l) { ids[dgsStr_(l.shipment_line_id)] = 1; });
    var al = sfoReadTable_(ss, 'shipment_line_allocations', []).filter(function (a) { return ids[dgsStr_(a.shipment_line_id)]; });
    dig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify([sh, ln, al]), Utilities.Charset.UTF_8).map(function (b) { return ((b & 255) + 256).toString(16).slice(1); }).join('');
  } catch (e) { dig = ''; }
  return { rev: rev, digest: dig };
}
function dgsDeclaredValueProblems_(snap, dutyCountry) {
  return ((snap || {}).lines || []).map(function (l, i) {
    var missing=[];
    if(!dgsStr_(l.declared_currency))missing.push('tax_referral_rates.declared_currency is blank');
    if(!(Number(l.declared_unit_value)>0)||!isFinite(Number(l.declared_unit_value)))missing.push('tax_referral_rates.declared_value must be greater than 0');
    return missing.length ? 'line '+(i+1)+' '+dgsStr_(l.sku)+': '+missing.join('; ')+' (duty_country='+dgsStr_(dutyCountry)+', tax_match='+dgsStr_(l.tax_match||'NOT_FROZEN')+', tax_rate_id='+dgsStr_(l.tax_rate_id||'NONE')+')' : '';
  }).filter(function(p){return !!p;});
}
function dgsFrozenValueGate_(ss, shipmentId) {
var sc = dgsShipmentContext_(ss, shipmentId);
if (!sc.ok) return { ok: false, built: null, blockers: [{ reason: sc.reason }] };
if(sc.ctx.documents_not_required)return Object.assign(dgsNoShipmentDocuments_(shipmentId),{built:null,blockers:[],documents:0});
var entries = dgsShipmentManifest_(dgsTemplates_(ss), sc.ctx).entries || [];
if (!entries.length) return { ok: true, built: null, blockers: [], documents: 0 };
var built, snap, out = [];
try {
built = sfoBuildSnapshot_(ss, shipmentId, { prospective: true });
if (!built.ok) return { ok: false, built: null, blockers: [{ reason: 'DOCUMENT_SNAPSHOT_NOT_BUILDABLE', problems: [built.error + (built.stage ? ' (' + built.stage + ')' : '')] }] };
var fr = sfoFrozenRows_(built, dgsStr_(shipmentId), '', ''), hdr = function (name, hd) { var c = prodRequireSheet_(ss, name, hd); return c.getRange(1, 1, 1, Math.max(1, c.getLastColumn())).getValues()[0].map(dgsStr_); };
var as = function (h) { return function (row) { var o = {}; h.forEach(function (k) { if (k) o[k] = row[k] === undefined || row[k] === null ? '' : row[k]; }); return o; }; };
snap = { header: as(hdr('shipment_final_output_snapshots', SFO_SNAPSHOT_HEADERS_))(fr.header), lines: fr.lines.map(as(hdr('shipment_final_output_lines', SFO_LINE_HEADERS_))),
po_lineage: fr.pos.map(as(hdr('shipment_final_output_line_pos', SFO_LINE_PO_HEADERS_))), readiness: built.readiness };
} catch (eB) { return { ok: false, built: null, blockers: [{ reason: 'DOCUMENT_SNAPSHOT_NOT_BUILDABLE', problems: [dgsStr_(eB && eB.message || eB)] }] }; }
entries.forEach(function (e) {
var model = docRenderByClass_(e.render, snap), probs = [];
if (!model.ok) {
  if ((model.error || model.reason) !== 'UNSUPPORTED_DOCUMENT_TYPE') probs.push('DOCUMENT_MODEL_BLOCKED:' + dgsStr_(model.error || model.reason));
  if ((model.error || model.reason) === 'MISSING_DECLARED_VALUE') probs=probs.concat(dgsDeclaredValueProblems_(snap,sc.ctx.country));
}
else {
var r; try { r = dgsResolvePayload_(ss, { entry: e, model: model, related_entity_type: 'shipment', related_entity_id: dgsStr_(shipmentId), fallback_file_name: 'R66_VALUE_GATE' }); }
catch (eR) { r = { ok: false, missing: [{ placeholder: '(document)', problems: ['DOCUMENT_VALUE_CHECK_FAILED:' + dgsStr_(eR && eR.message || eR)] }] }; }
(r.ok ? [] : r.missing || []).forEach(function (m) {
var ps = (m.problems || []).filter(function (p) { return !DGS_TEMPLATE_CODE_RE_.test(dgsStr_(p)); });
if (m.problems && m.problems.length && !ps.length) return;
var at = m.line ? ' (line ' + m.line + ' ' + dgsStr_(m.sku) + ')' : '';
probs.push(dgsStr_(m.placeholder) + (m.worksheet_name ? ' (' + m.worksheet_name + ')' : '') + ': ' + (ps.length ? ps.join(', ') : 'DOCUMENT_FIELD_VALUE_MISSING:' + dgsStr_(m.data_source_field || m.data_source_path)) + (/\(line /.test(ps.join()) ? '' : at));
});
}
if (probs.length) out.push({ reason: 'DOCUMENT_FROZEN_VALUE_INVALID', class_key: e.class_key, template_key: e.template_key, problems: probs, correction: 'the master data the document reads (e.g. Admin > SKU details), then Confirm again' });
});
return { ok: !out.length, built: out.length ? null : built, blockers: out, documents: entries.length };
}
function dgsGenerateShipmentDocuments_(ss, shipmentId, actor, opts) {
opts = opts || {};
var sc = dgsShipmentContext_(ss, shipmentId);
if (!sc.ok) return { ok: false, reason: sc.reason, shipment_id: dgsStr_(shipmentId) };
if(sc.ctx.documents_not_required)return dgsNoShipmentDocuments_(shipmentId);
if (!SFO_DISPATCHED_STATUS_[sc.status]) {
return { ok: false, reason: 'SNAPSHOT_PREREQUISITE_INVALID', shipment_id: dgsStr_(shipmentId), status: sc.status,
message: 'Documents are generated after the dispatch transaction commits.' };
}


var snapRes = sfoFinalizeWith_({ shipment_id: shipmentId, actor: actor }, opts.prebuilt || null);
var snapOut = {}; try { snapOut = JSON.parse(snapRes.getContent()); } catch (e) {}
if (!snapOut.success) return { ok: false, reason: 'SNAPSHOT_PREREQUISITE_INVALID', shipment_id: dgsStr_(shipmentId), detail: snapOut };
var snap = docReadSnapshot_(ss, shipmentId);
if (!snap) return { ok: false, reason: 'SNAPSHOT_PREREQUISITE_INVALID', shipment_id: dgsStr_(shipmentId) };

var manifest = dgsShipmentManifest_(dgsTemplates_(ss), sc.ctx);
if (!manifest.ok) return { ok: false, reason: manifest.errors[0].reason, shipment_id: dgsStr_(shipmentId), errors: manifest.errors };


var shippedAt = sc.shipped_at;
var folder = dofResolveShipmentFolder_(dofFolderIo_(), {
templates: manifest.entries.map(function (e) { return e.template; }),
destination_country: sc.ctx.country, external_shipment_id: sc.external_shipment_id, shipped_at: shippedAt
});
if (!folder.ok) return { ok: false, reason: folder.reason, shipment_id: dgsStr_(shipmentId), detail: folder };
var leafOwn = dgsShipmentLeafOwnership_(ss, folder, shipmentId);
if (!leafOwn.ok) return { ok: false, reason: leafOwn.reason, shipment_id: dgsStr_(shipmentId), detail: leafOwn };

var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_), lock = LockService.getScriptLock();
var existing = dgsGeneratedFor_(ss, 'shipment', shipmentId);
var plan = dgsPlanBatch_(manifest.entries, existing, 'shipment', shipmentId);
var now = shipmentTimestamp_();
var results = [], generated = 0, failed = 0, configRequired = 0;
function reuse(e, row) {
var d = dgsPdfDrift_(row, e.template);
if (!d) return { class_key: e.class_key, status: 'READY', reused: true, document_id: dgsStr_(row.document_id) };
return Object.assign({ class_key: e.class_key, status: 'CONFIGURATION_REQUIRED', reason: 'DOCUMENT_OUTPUT_POLICY_CHANGED', document_id: dgsStr_(row.document_id), kept_as_issued: true, correction: 'a new template_version, then retry' }, d);
}
plan.reuse.forEach(function (r) { var ru = reuse(r.entry, r.row); if (ru.status !== 'READY') configRequired++; results.push(ru); });









var LEASE = 10 * 60 * 1000, io = dfoDefaultIo_();
function lease(r) { var m = /DGS_LEASE=(\d+)/.exec(dgsStr_(r.note)); return dgsDecodeNote_(r.note).reason === DGS_PO_RESERVED_ && m ? +m[1] : 0; }
plan.todo.forEach(function (item) {
var entry = item.entry, model, did = dgsNewDocId_(), tag = ' [' + did + ']', st = '', cur = null, prior = [], found = [], one;
var key = dgsIdentityKey_('shipment', shipmentId, entry.template_id, entry.template_version);
var base = {
template_id: entry.template_id, template_key: entry.template_key, template_version: entry.template_version,
related_entity_type: 'shipment', related_entity_id: shipmentId, document_type: entry.document_type,
factory_id: dgsStr_(snap.header.factory_id), carrier_id: dgsStr_(snap.header.carrier_id),
country: sc.ctx.country, marketplace: sc.ctx.marketplace, language: dgsStr_(entry.template.language),
output_folder_id: folder.folder_id, generated_by: actor, generated_at: now, created_at: now, updated_at: now
};
function rows() { return dgsGeneratedFor_(ss, 'shipment', shipmentId).filter(function (r) { return dgsIdentityKey_(r.related_entity_type, r.related_entity_id, r.template_id, r.template_version) === key; }); }
function done(res) {
if (res.status === 'READY') generated += res.reused ? 0 : 1; else if (res.status === 'CONFIGURATION_REQUIRED') configRequired++; else failed++;
results.push(Object.assign({ class_key: entry.class_key, attempt_id: st === 'OWN' ? did : '' }, res));
}

var lk = dgsLocked_(lock, function () {
var all = dtReadTable_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_), t = new Date().getTime();
if (dgsLeafForeignRows_(all, folder.folder_id, shipmentId)) return st = 'FOREIGN';
var rs = all.filter(function (r) { return dgsLc_(r.related_entity_type) === 'shipment' && dgsStr_(r.related_entity_id) === dgsStr_(shipmentId) && dgsIdentityKey_(r.related_entity_type, r.related_entity_id, r.template_id, r.template_version) === key; });
cur = rs.filter(function (r) { return dgsRowState_(r) === 'READY'; })[0];
if (cur) return st = 'CURRENT';
if (rs.some(function (r) { return lease(r) > t; })) return st = 'BUSY';
rs.forEach(function (r) {
if (dgsRowState_(r) === 'SUPERSEDED') return;
prior.push(dgsStr_(r.document_id));
if (lease(r)) dgsUpdateRegistry_(genSheet, r.document_id, { updated_at: now, note: dgsEncodeNote_('DOCUMENT_ATTEMPT_ABANDONED', true, 'Its lease passed with no outcome; found by ' + did + '.') });
});
dgsWriteRegistry_(genSheet, Object.assign({}, base, { document_id: did, status: DGS_ROW_FAILED_, regenerated_from_document_id: prior.length ? prior[prior.length - 1] : '',
note: dgsEncodeNote_(DGS_PO_RESERVED_, true, 'Attempt reserved; Drive rendering in progress. DGS_LEASE=' + (t + LEASE) + ';') }));
return st = 'OWN';
});
if (st === 'CURRENT') return done(reuse(entry, cur));
if (st === 'BUSY') return done({ status: 'FAILED_RETRYABLE', reason: 'DOCUMENT_ATTEMPT_IN_PROGRESS' });
if (st === 'FOREIGN') return done({ status: 'FAILED', reason: 'SHIPMENT_FOLDER_OWNED_BY_ANOTHER_ENTITY' });
if (st !== 'OWN') return done({ status: 'FAILED_RETRYABLE', reason: lk.registry_error || 'LOCK_UNAVAILABLE' });

if (prior.length) {
try { found = io.attemptFiles(folder.folder_id, prior); }
catch (eF) { one = { ok: false, reason: 'DOCUMENT_ATTEMPT_UNVERIFIED', message: String(eF && eF.message || eF) }; }
}
// Record the attempt before mapping/rendering; one class failing must not hide the other outputs.
if (!one) try { model = docRenderByClass_(entry.render, snap); }
catch (eM) { one = { ok: false, reason: 'DOCUMENT_RENDER_FAILED', message: String(eM && eM.message || eM) }; }
if (!one && !model.ok) {
var mreason = model.error || model.reason || 'DOCUMENT_NOT_READY';
one = { ok: false, configuration_required: mreason === 'UNSUPPORTED_DOCUMENT_TYPE', reason: mreason, model: true };
}
if (!one) try { one = dgsRenderOne_(ss, {
entry: entry, model: model, related_entity_type: 'shipment', related_entity_id: shipmentId, attempt: did, tag: tag,
folder_id: folder.folder_id, destination_bucket: folder.destination_bucket,
fallback_file_name: 'KitchenMama_' + entry.class_key + '_' + sc.external_shipment_id
}); } catch (eR) { one = { ok: false, reason: 'DOCUMENT_RENDER_FAILED', message: String(eR && eR.message || eR) }; }
var f = one.ok ? one.file : { file_id: one.partial_file_id || '' };

var res, fin = dgsLocked_(lock, function () {
var rs = rows(), me = rs.filter(function (r) { return dgsStr_(r.document_id) === did; })[0];
var other = rs.filter(function (r) { return dgsRowState_(r) === 'READY' && dgsStr_(r.document_id) !== did; })[0];
var by = {}; found.forEach(function (x) { (by[x.attempt] = by[x.attempt] || []).push(x.id); });
Object.keys(by).forEach(function (a) { var r = rs.filter(function (x) { return dgsStr_(x.document_id) === a; })[0]; if (r) dgsUpdateRegistry_(genSheet, a, { updated_at: now, note: dgsStr_(r.note).replace(/ ?DGS_KEPT=[^;]*;/g, '') + ' Its files found by ' + did + '.' + dgsKeptNote_(by[a]) }); });
if (!me || lease(me) === 0 || other) {
dgsUpdateRegistry_(genSheet, did, { status: DGS_ROW_CANCELLED_, updated_at: now, note: (me ? dgsStr_(me.note).replace(/ ?DGS_KEPT=[^;]*;/g, '') + ' ' : '') + 'Not attached; ' + (other ? dgsStr_(other.document_id) + ' was current.' : 'its lease passed and another run took the class over.') + dgsKeptNote_([f.file_id, f.pdf_file_id]) }, 1);
res = other ? { status: 'READY', reused: true, document_id: dgsStr_(other.document_id) } : { status: 'FAILED_RETRYABLE', reason: 'DOCUMENT_ATTEMPT_TAKEN_OVER' };
return 1;
}

prior.forEach(function (a) { var r = rs.filter(function (x) { return dgsStr_(x.document_id) === a; })[0]; if (r && dgsRowState_(r) !== 'READY') dgsUpdateRegistry_(genSheet, a, { status: DGS_ROW_CANCELLED_, updated_at: now, note: dgsStr_(r.note).replace(/ ?DGS_KEPT=[^;]*;/g, '') + ' DGS_SUPERSEDED_BY=' + did + ';' }); });
if (!one.ok) {
var conf = !!one.configuration_required, reason = conf ? 'DOCUMENT_CONFIGURATION_REQUIRED' : one.reason;
var human = conf ? (one.model ? 'No render model is implemented for ' + entry.class_key + '.' : 'Template field mapping is incomplete for ' + entry.template_key + '. ' + one.reason + ' ' + JSON.stringify(one.missing || []).slice(0, 6000))
: (one.model ? 'Render model blocked: ' + one.reason + '.' : 'Drive generation failed: ' + one.reason + (one.message ? ' — ' + one.message : '') + '.' + dgsKeptNote_([one.partial_file_id], one.partial));
dgsUpdateRegistry_(genSheet, did, { status: DGS_ROW_FAILED_, updated_at: now, note: dgsEncodeNote_(reason, !conf && dgsRetryable_(one.reason), human) });
res = { status: conf ? 'CONFIGURATION_REQUIRED' : one.model ? 'FAILED' : 'FAILED_RETRYABLE', reason: one.reason, missing: one.missing || [], unresolved_authority: one.unresolved_authority || [] };
return 1;
}
dgsUpdateRegistry_(genSheet, did, { file_name: f.file_name, file_id: f.file_id, file_url: f.file_url, pdf_file_id: f.pdf_file_id, pdf_file_url: f.pdf_file_url,
output_folder_id: f.output_folder_id || folder.folder_id, status: prior.length ? DGS_ROW_REGENERATED_ : DGS_ROW_GENERATED_, generated_at: now, updated_at: now,
note: dgsEncodeNote_('', false, 'checksum ' + one.payload.source_checksum + '; snapshot ' + dgsStr_(snap.header.snapshot_id) + '.' + (one.payload.pdf_sheets ? ' PDF: ' + one.payload.pdf_sheets.join(' + ') + '. DGS_PDF=' + encodeURIComponent(one.payload.pdf_sheets.join('|')) + ';' : '') + ((entry.render === 'SHIPDETAIL' && manifest.shipment_details_fallback) ? ' Shipment details fallback used (carrier document template not configured) for ' + manifest.shipment_details_fallback.replaces.join(',') + '. DGS_FALLBACK=SHIPMENT_DETAILS;' : '')) });
res = { status: 'READY', document_id: did, retried: prior.length > 0, reused: false, attempts_superseded: prior.length,
warnings: (one.warnings || []).map(function (w) { return (w.worksheet_name ? w.worksheet_name + ' ' : '') + w.placeholder + (w.line ? ' line ' + w.line : '') + ': ' + w.warning; }) };
return 1;
});
if (!fin.recorded) return done(Object.assign({ status: 'FAILED_RETRYABLE', reason: fin.registry_error || 'LOCK_UNAVAILABLE' }, f.file_id ? dgsUnregistered_(did, f, folder.folder_id, fin) : {}));
if (res.status === 'READY' && !res.reused && one.payload && one.payload.final_name) {
try {
io.renameFile(f.file_id, one.payload.final_name, folder.folder_id); if (f.pdf_file_id) io.renameFile(f.pdf_file_id, one.payload.final_name + '.pdf', folder.folder_id);
dgsLocked_(lock, function () { return dgsUpdateRegistry_(genSheet, did, { file_name: one.payload.final_name, updated_at: now }, 1); });
} catch (eN) { res.rename_error = String(eN && eN.message || eN); }
}
done(res);
});

return {
ok: failed === 0 && configRequired === 0, shipment_id: dgsStr_(shipmentId), snapshot_id: dgsStr_(snap.header.snapshot_id),
folder_id: folder.folder_id, folder_name: folder.folder_name, folder_url: dgsFolderUrl_(folder.folder_id),
destination_bucket: folder.destination_bucket, expected: manifest.entries.length,
generated: generated, reused: plan.reuse.length, failed: failed, configuration_required: configRequired,
shipment_details_fallback: manifest.shipment_details_fallback || null,
results: results
};
}



























var DGS_PO_RESERVED_ = 'DOCUMENT_ATTEMPT_RESERVED';
var DGS_PO_DRIFT_ = 'DOCUMENT_SOURCE_DRIFT';



function dgsPoIdentity_(ss, po) {
var w = procurementResolveWarehouse_(ss, po.warehouse_id, po.factory_id, 'history');
return w.ok ? { ok: true, po: Object.assign({}, po, { warehouse_id: w.warehouse_id, factory_id: w.warehouse_id }) } : { ok: false, reason: 'PO_WAREHOUSE_' + w.reason, detail: w.value || '' };
}
function dgsPoLoad_(ss, poId) {
var po = dgsFindRow_(sfoReadTable_(ss, 'purchase_orders', []), 'purchase_order_id', poId);
if (!po) return { ok: false, reason: 'PURCHASE_ORDER_NOT_FOUND' };
var pi = dgsPoIdentity_(ss, po);
if (!pi.ok) return pi;
po = pi.po;
var lines = sfoReadTable_(ss, 'purchase_order_lines', []).filter(function (l) { return dgsStr_(l.purchase_order_id) === dgsStr_(poId); });
if (!lines.length) return { ok: false, reason: 'PURCHASE_ORDER_HAS_NO_LINES' };
return { ok: true, po: po, lines: lines };
}


function dgsPoSourceChecksum_(po, lines) {
var built = dgsPoPayloadModel_(po, lines, {});
return dgsChecksum_({ h: built.header, l: built.lines });
}
function dgsPoRecordedChecksum_(row) {
var m = /\bchecksum (CS[0-9A-F]{8})(?=[;.\s]|$)/.exec(dgsStr_(row && row.note));
return m ? m[1] : '';
}
function dgsPoReusePrepared_(ss, prepared) {
var loaded = dgsPoLoad_(ss, prepared.purchase_order_id);
if (!loaded.ok) return { ok: false, reason: loaded.reason };
if (prepared.require_draft && dgsPoStatus_(loaded.po) !== 'draft') return { ok: false, reason: 'PURCHASE_ORDER_NOT_DRAFT' };
if (dgsPoSourceChecksum_(loaded.po, loaded.lines) !== prepared.source_checksum) return { ok: false, reason: DGS_PO_DRIFT_, retryable: true };
var row = dgsGeneratedFor_(ss, 'purchase_order', prepared.purchase_order_id).filter(function (r) { return dgsStr_(r.document_id) === prepared.document_id; })[0];
if (!row || dgsRowState_(row) !== 'READY' || dgsPoRecordedChecksum_(row) !== prepared.source_checksum) return { ok: false, reason: 'DOCUMENT_REUSE_UNVERIFIED', retryable: true };
return { ok: true };
}
function dgsPoStatus_(po) { return dgsLc_(po.order_status) || dgsLc_(po.status); }


function dgsPoPrepare_(ss, poId, opts) {
opts = opts || {};
var loaded = dgsPoLoad_(ss, poId);
if (!loaded.ok) return { ok: false, reason: loaded.reason, purchase_order_id: dgsStr_(poId) };
var po = loaded.po, poLines = loaded.lines;
if (opts.require_draft && dgsPoStatus_(po) !== 'draft') {
return { ok: false, reason: 'PURCHASE_ORDER_NOT_DRAFT', purchase_order_id: dgsStr_(poId), order_status: dgsPoStatus_(po) };
}
var pc = dgsPoContext_(po, poLines, dgsStr_(opts.order_date_candidate) || po.order_date), series = pc.ok && pc.ctx.series;
if (!pc.ok) return Object.assign({ purchase_order_id: dgsStr_(poId) }, pc);
var sel = dgsSelectPoTemplate_(dgsTemplates_(ss), pc.ctx);
if (!sel.ok) return { ok: false, reason: sel.reason, purchase_order_id: dgsStr_(poId), detail: sel };



var existing = dgsGeneratedFor_(ss, 'purchase_order', poId);
var batch = dgsPoBatchDate_(opts.require_draft ? {} : po, opts.order_date_candidate || opts.today);
if (!batch.ymd) return { ok: false, reason: 'PO_FOLDER_IDENTITY_INVALID', purchase_order_id: dgsStr_(poId) };

var built = dgsPoPayloadModel_(Object.assign({}, po, { order_date: batch.date, series: series }), poLines, {
factory_name: dgsStr_(opts.factory_name), sku_labels: opts.sku_labels || {},
deposit_due_date_candidate: opts.deposit_due_date_candidate
});
var entry = { class_key: 'PURCHASE_ORDER', render: 'PO', document_type: 'purchase_order',
template: sel.template, template_id: sel.template_id, template_key: sel.template_key, template_version: sel.template_version };
var resolved = dgsResolvePayload_(ss, {
entry: entry, model: built, related_entity_type: 'purchase_order', related_entity_id: poId,
folder_id: '', destination_bucket: '', fallback_file_name: 'KitchenMama_PO_' + dgsStr_(po.po_no)
});
if (!resolved.ok) {
return { ok: false, reason: resolved.reason, configuration_required: !!resolved.configuration_required,
purchase_order_id: dgsStr_(poId), missing: resolved.missing || [], problems: resolved.problems || [], unresolved_authority: resolved.unresolved_authority || [] };
}

var plan = dgsPlanBatch_([entry], existing, 'purchase_order', poId);
var checksum = dgsPoSourceChecksum_(po, poLines);
var now = shipmentTimestamp_(), stale = '';
var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_);

if (plan.complete && dgsPoStatus_(po) === 'draft' && (dgsStr_(plan.reuse[0].row.note).indexOf('doc_date ' + batch.date) < 0 || dgsPoRecordedChecksum_(plan.reuse[0].row) !== checksum)) {
stale = dgsStr_(plan.reuse[0].row.document_id);
var staleReason = dgsStr_(plan.reuse[0].row.note).indexOf('doc_date ' + batch.date) < 0 ? 'DOCUMENT_DATE_SUPERSEDED' : DGS_PO_DRIFT_;
if (dgsUpdateRegistry_(genSheet, stale, { status: DGS_ROW_CANCELLED_, updated_at: now,
note: dgsEncodeNote_(staleReason, false, 'Draft PO document does not match the current date/source. Original files retained.') }, 1) !== true) return { ok: false, reason: 'DOCUMENT_REGISTRY_WRITE_FAILED', purchase_order_id: dgsStr_(poId) };
plan = { todo: [{}] };
}
var base = {
template_id: entry.template_id, template_key: entry.template_key, template_version: entry.template_version,
related_entity_type: 'purchase_order', related_entity_id: poId, document_type: 'purchase_order',
series: series, supplier_id: dgsStr_(po.supplier_id), factory_id: dgsStr_(po.factory_id),
language: dgsStr_(sel.template.language), output_folder_id: '',
generated_by: dgsStr_(opts.actor), generated_at: now, created_at: now, updated_at: now
};
if (plan.complete) {

return { ok: true, complete: true, purchase_order_id: dgsStr_(poId), document_id: dgsStr_(plan.reuse[0].row.document_id),
source_checksum: checksum, document_batch_date: batch.ymd, document_date: batch.date, template: entry, require_draft: opts.require_draft };
}


var prior = plan.todo[0].row;
var docId = prior ? dgsStr_(prior.document_id) : dgsNewDocId_();
var reservedNote = dgsEncodeNote_(DGS_PO_RESERVED_, true, 'Attempt reserved; Drive rendering in progress. checksum ' + checksum + '.');
if (prior) dgsUpdateRegistry_(genSheet, docId, { status: DGS_ROW_FAILED_, note: reservedNote, updated_at: now });
else dgsWriteRegistry_(genSheet, Object.assign({}, base, { document_id: docId, status: DGS_ROW_FAILED_, note: reservedNote }));
return {
ok: true, complete: false, purchase_order_id: dgsStr_(poId), document_id: docId,
payload: resolved.payload, template: entry, base: base, source_checksum: checksum,
document_batch_date: batch.ymd, document_date: batch.date,
regenerated_from_document_id: prior ? dgsStr_(prior.document_id) : stale, require_draft: opts.require_draft
};
}




function dgsPoRenderPrepared_(ss, prepared) {
var drive = dgsDriveReadiness_(dofProbeIo_(), [{ class_key: 'PURCHASE_ORDER', template: prepared.template.template }], 'purchase_order');
if (!drive.ok) return { ok: false, reason: drive.reason, drive_readiness: drive, stage: 'drive_readiness' };
var folder = dofResolvePoDateFolder_(dofFolderIo_(), {
templates: [prepared.template.template],
document_batch_date: prepared.document_batch_date.substring(0, 4) + '-' + prepared.document_batch_date.substring(4, 6) + '-' + prepared.document_batch_date.substring(6, 8)
});
if (!folder.ok) return { ok: false, reason: folder.reason, detail: folder };
var payload = prepared.payload;
payload.folder_id = folder.folder_id;
var fr = dfoRenderPayload_(dfoDefaultIo_(), payload, { attempt: prepared.document_id });
if (!fr.ok) return { ok: false, reason: fr.error, message: fr.message || '', folder_id: folder.folder_id, partial_file_id: fr.partial_file_id || fr.file_id || '', partial: fr.partial };
return { ok: true, file: fr, folder_id: folder.folder_id, folder_url: dgsFolderUrl_(folder.folder_id), root_folder_id: drive.root_folder_id };
}










function dgsPoFinalize_(ss, prepared, rendered, actor) {
var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_);
var now = shipmentTimestamp_();
var loaded = dgsPoLoad_(ss, prepared.purchase_order_id);
if (!loaded.ok) return { ok: false, reason: loaded.reason };
var liveStatus = dgsPoStatus_(loaded.po);
if (liveStatus !== 'draft' && prepared.require_draft) {



var already = dgsGeneratedFor_(ss, 'purchase_order', prepared.purchase_order_id)
.filter(function (r) { return dgsRowState_(r) === 'READY'; });
var w, we; try { w = dgsUpdateRegistry_(genSheet, prepared.document_id, { status: DGS_ROW_CANCELLED_, updated_at: now,
note: dgsEncodeNote_('PURCHASE_ORDER_ALREADY_ISSUED', false, 'PO left draft during rendering (now ' + liveStatus + '); this attempt is superseded and NOT attached. Rendered file ' + dgsStr_(rendered.file.file_id) + ' retained for recovery.' + dgsKeptNote_([rendered.file.file_id, rendered.file.pdf_file_id])) }); } catch (e) { we = String(e && e.message || e); }
return { ok: false, authorizes_issue: false, reason: 'PURCHASE_ORDER_ALREADY_ISSUED', order_status: liveStatus, recorded: !!w, registry_error: we,
current_document_id: already.length ? dgsStr_(already[0].document_id) : '',
message: 'This Purchase Order was already sent by another request; it is now ' + liveStatus + '. No second document or transition was created.' };
}
var after = dgsPoSourceChecksum_(loaded.po, loaded.lines);
if (after !== prepared.source_checksum) {



w = dgsUpdateRegistry_(genSheet, prepared.document_id, { status: DGS_ROW_FAILED_, updated_at: now,
note: dgsEncodeNote_(DGS_PO_DRIFT_, true, 'Source data changed during rendering (' + prepared.source_checksum + ' -> ' + after + '). Regenerate from the new payload. Stale file ' + dgsStr_(rendered.file.file_id) + ' retained, not attached.' + dgsKeptNote_([rendered.file.file_id, rendered.file.pdf_file_id])) });
return { ok: false, authorizes_issue: false, reason: DGS_PO_DRIFT_, recorded: !!w,
expected_checksum: prepared.source_checksum, actual_checksum: after,
message: 'The Purchase Order changed while its document was being generated, so the document no longer matches the order. Nothing was issued. Press Send PO again to regenerate from the current data.' };
}
if (!dgsStr_(rendered.file.file_id)) return { ok: false, authorizes_issue: false, reason: 'DOCUMENT_OUTPUT_MISSING' };
if ((w = dgsUpdateRegistry_(genSheet, prepared.document_id, {
file_name: rendered.file.file_name, file_id: rendered.file.file_id, file_url: rendered.file.file_url,
pdf_file_id: rendered.file.pdf_file_id, pdf_file_url: rendered.file.pdf_file_url,
output_folder_id: rendered.file.output_folder_id || rendered.folder_id,
status: prepared.regenerated_from_document_id ? DGS_ROW_REGENERATED_ : DGS_ROW_GENERATED_,
note: dgsEncodeNote_('', false, 'checksum ' + prepared.source_checksum + '; doc_date ' + prepared.document_date + '.'),
regenerated_from_document_id: prepared.regenerated_from_document_id || '',
generated_by: dgsStr_(actor), generated_at: now, updated_at: now
})) !== true) return { ok: false, authorizes_issue: false, reason: 'DOCUMENT_ATTACHED_BY_ANOTHER_REQUEST', recorded: !!w };

return { ok: true, authorizes_issue: true, document_id: prepared.document_id, file_name: rendered.file.file_name,
folder_id: rendered.folder_id, folder_url: rendered.folder_url, checksum: prepared.source_checksum };
}



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
var rendered = dgsPoRenderPrepared_(ss, prepared);
var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_);
if (!rendered.ok) {
return Object.assign({ ok: false, reason: rendered.reason, message: rendered.message || '', purchase_order_id: prepared.purchase_order_id,
document_id: prepared.document_id, retryable: dgsRetryable_(rendered.reason), partial_file_id: rendered.partial_file_id }, dgsLocked_(lock, function () {
return dgsUpdateRegistry_(genSheet, prepared.document_id, { status: DGS_ROW_FAILED_, updated_at: shipmentTimestamp_(),
note: dgsEncodeNote_(rendered.reason, dgsRetryable_(rendered.reason), 'Drive generation failed' + (rendered.message ? ': ' + rendered.message : '') + '.' + dgsKeptNote_([rendered.partial_file_id], rendered.partial)) }); }));
}

var fin = {}, reg = dgsLocked_(lock, function () { fin = dgsPoFinalize_(ss, prepared, rendered, actor); return fin.ok || fin.recorded; });
if (!fin.ok) return Object.assign({ ok: false, reason: fin.reason || (reg.lock_acquired ? 'DOCUMENT_REGISTRY_WRITE_FAILED' : reg.registry_error), purchase_order_id: prepared.purchase_order_id, retryable: true, detail: fin },
dgsUnregistered_(prepared.document_id, rendered.file, rendered.folder_id, reg));
return { ok: true, purchase_order_id: prepared.purchase_order_id, generated: 1, document_id: fin.document_id,
file_name: fin.file_name, folder_id: fin.folder_id, folder_url: fin.folder_url,
document_batch_date: prepared.document_batch_date, checksum: fin.checksum,
results: [{ class_key: 'PURCHASE_ORDER', status: 'READY', document_id: fin.document_id }] };
}



function dgsVersionRole_(rows, row) {
var k = function (r) { return dgsStr_(r.template_key) || dgsLc_(r.document_type); }, v = dgsNum_(row.template_version);
if (dgsRowState_(row) !== 'READY') return '';
return rows.some(function (r) { return r !== row && dgsRowState_(r) === 'READY' && k(r) === k(row) && dgsNum_(r.template_version) > v; }) ? 'HISTORY' : 'CURRENT';
}
function dgsEntityDocumentDtos_(ss, entityType, entityId, expected) {
if(dgsLc_(entityType)==='shipment'){
  var policyContext=dgsShipmentContext_(ss,entityId);
  if(policyContext.ok&&policyContext.ctx&&policyContext.ctx.documents_not_required)return {documents:[],documentFolderUrl:'',documentGenerationStatus:'NOT_REQUIRED',documentGenerationError:null,canRetryDocuments:false};
}
var rows = dgsGeneratedFor_(ss, entityType, entityId);
var live = rows.filter(function (r) { return dgsRowState_(r) !== 'SUPERSEDED'; });
var docs = live.map(function (r) { return Object.assign(dgsDocumentDto_(r), { version_role: dgsVersionRole_(live, r) }); });
var folderId = '';
for (var i = live.length - 1; i >= 0; i--) { if (dgsStr_(live[i].output_folder_id)) { folderId = dgsStr_(live[i].output_folder_id); break; } }
var state = dgsBatchState_(live, { expected: expected, entity_committed: !!(expected && dgsLc_(entityType) === 'shipment') });
if (!live.length && dgsLc_(entityType) === 'shipment') {
  var context = dgsShipmentContext_(ss, entityId);
  var missing = context.ok ? dgsMissingShipmentDocuments_(context.row) : null;
  if (missing) return missing;
}
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
// A Confirm-owned digest distinguishes an interrupted modern generation from imported history.
function dgsMissingShipmentDocuments_(shipment) {
  if (!shipment || !SFO_DISPATCHED_STATUS_[dgsLc_(shipment.status)] || !dgsStr_(shipment.final_output_validated_digest)) return null;
  return { documents: [], documentFolderUrl: '', documentGenerationStatus: 'CONFIRMED_RETRY_REQUIRED',
    documentGenerationError: { reason: 'DOCUMENT_OUTPUTS_MISSING', message: 'Shipment is dispatched, but document generation has no recorded outputs. Generate documents only; do not dispatch again.', retryable: true }, canRetryDocuments: true };
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

var DGS_OFFICE_ = { 'application/vnd.google-apps.spreadsheet': { f: 'xlsx', part: 'xl/workbook.xml', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
'application/vnd.google-apps.document': { f: 'docx', part: 'word/document.xml', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } };
var DGS_OFFICE_MAX_ = 10 * 1024 * 1024;

var DGS_ZIP_LIM_ = { entries: 2000, expanded: 50 * 1024 * 1024, ms: 25000 };
var DGS_OOXML_ = { ct: 'http://schemas.openxmlformats.org/package/2006/content-types', pr: 'http://schemas.openxmlformats.org/package/2006/relationships',
rel: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/', xlsx: { ns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', root: 'workbook', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' },
docx: { ns: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', root: 'document', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' } };
var DGS_CRC_ = null;
function dgsCrc32_(a) {
var t = DGS_CRC_, c, i, k;
if (!t) { t = DGS_CRC_ = []; for (i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } }
for (c = 0xFFFFFFFF, i = 0; i < a.length; i++) c = t[(c ^ a[i]) & 255] ^ (c >>> 8);
return (c ^ 0xFFFFFFFF) >>> 0;
}

var DGS_INF_ = { lb: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258], le: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0],
db: [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577], de: [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13],
ord: [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15] };
function dgsInflate_(u, p, end, n, dl) {
var out = new Uint8Array(n), o = 0, bb = 0, bit = 0, T = DGS_INF_, last, type, i, fl, fd, lens, step = 0;
function bad(w) { throw new Error('ZIP_DATA_' + w); }
function bits(k) { while (bit < k) { if (p >= end) bad('TRUNCATED'); bb |= u[p++] << bit; bit += 8; } var v = bb & ((1 << k) - 1); bb >>>= k; bit -= k; return v; }
function huff(l, n0) {
var c = [], s = [], off = [0, 0], i, left = 1;
for (i = 0; i < 16; i++) c[i] = 0;
for (i = 0; i < n0; i++) c[l[i]]++;
for (c[0] = 0, i = 1; i < 16; i++) { left = left * 2 - c[i]; if (left < 0) bad('INVALID'); }
for (i = 1; i < 15; i++) off[i + 1] = off[i] + c[i];
for (i = 0; i < n0; i++) if (l[i]) s[off[l[i]]++] = i;
return { c: c, s: s };
}
function dec(h) { for (var code = 0, first = 0, idx = 0, l = 1, k; l < 16; l++) { code |= bits(1); k = h.c[l]; if (code - k < first) return h.s[idx + code - first]; idx += k; first = (first + k) << 1; code <<= 1; } bad('INVALID'); }
function codes(lt, dt) {
for (;;) {
var s = dec(lt), len, d;
if (++step > 65536) { step = 0; if (Date.now() > dl) throw new Error('ZIP_TIME_LIMIT'); }
if (s < 256) { if (o >= n) bad('SIZE'); out[o++] = s; continue; }
if (s === 256) return;
if ((s -= 257) >= 29) bad('INVALID');
len = T.lb[s] + bits(T.le[s]); s = dec(dt); if (s >= 30) bad('INVALID');
d = T.db[s] + bits(T.de[s]);
if (d > o) bad('INVALID'); if (o + len > n) bad('SIZE');
while (len--) { out[o] = out[o - d]; o++; }
}
}
do {
last = bits(1); type = bits(2);
if (type === 0) {
bb = 0; bit = 0; if (p + 4 > end) bad('TRUNCATED');
i = u[p] | u[p + 1] << 8; if ((i ^ 0xFFFF) !== (u[p + 2] | u[p + 3] << 8)) bad('INVALID'); p += 4;
if (p + i > end) bad('TRUNCATED'); if (o + i > n) bad('SIZE');
out.set(u.subarray(p, p + i), o); o += i; p += i;
} else if (type === 1) {
if (!fl) { lens = []; for (i = 0; i < 288; i++) lens[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8; fl = huff(lens, 288); lens = []; for (i = 0; i < 30; i++) lens[i] = 5; fd = huff(lens, 30); }
codes(fl, fd);
} else if (type === 2) {
var nl = bits(5) + 257, nd = bits(5) + 1, nc = bits(4) + 4, cl = [], all = [], h, sym, rep, prev;
if (nl > 286 || nd > 30) bad('INVALID');
for (i = 0; i < 19; i++) cl[i] = 0;
for (i = 0; i < nc; i++) cl[T.ord[i]] = bits(3);
h = huff(cl, 19);
while (all.length < nl + nd) {
sym = dec(h);
if (sym < 16) { all.push(sym); continue; }
if (sym === 16) { if (!all.length) bad('INVALID'); prev = all[all.length - 1]; rep = 3 + bits(2); } else { prev = 0; rep = sym === 17 ? 3 + bits(3) : 11 + bits(7); }
if (all.length + rep > nl + nd) bad('INVALID');
while (rep--) all.push(prev);
}
if (!all[256]) bad('INVALID');
codes(huff(all.slice(0, nl), nl), huff(all.slice(nl), nd));
} else bad('INVALID');
} while (!last);
if (o !== n) bad('SIZE');
if (p !== end) bad('TRAILING');
return out;
}
function dgsLatin_(a) { for (var s = '', i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, Array.prototype.slice.call(a.subarray(i, i + 8192))); return s; }


function dgsXmlTags_(s) {
var tags = [], st = [], roots = 0, re = /<(\/?)([A-Za-z_][\w.\-]*(?::[A-Za-z_][\w.\-]*)?)((?:\s+[A-Za-z_][\w.\-:]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/g, m, at, a, x;
s = s.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>/g, ' ');
for (re.lastIndex = 0, x = 0; (m = re.exec(s)); x = re.lastIndex) {
if (s.slice(x, m.index).indexOf('<') >= 0) return null;
if (m[1]) { if (m[3] || m[4] || st.pop() !== m[2]) return null; continue; }
if (!st.length && ++roots > 1) return null;
for (a = {}, at = /([A-Za-z_][\w.\-:]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; (x = at.exec(m[3])); ) { if (x[1] in a) return null; a[x[1]] = x[2] !== undefined ? x[2] : x[3]; }
tags.push({ n: m[2], a: a, d: st.length });
if (!m[4]) st.push(m[2]);
}
return st.length || roots !== 1 || /</.test(s.slice(x)) ? null : tags;
}
function dgsLocal_(q) { return q.slice(q.indexOf(':') + 1); }
function dgsNsOf_(tag, q) { var p = q.indexOf(':') < 0 ? '' : q.slice(0, q.indexOf(':')); return tag.a[p ? 'xmlns:' + p : 'xmlns']; }
function dgsOfficeZip_(b, f) {
var n = b.length, u = new Uint8Array(n), i, e = -1, dl = Date.now() + DGS_ZIP_LIM_.ms, K = DGS_OOXML_[f], ents = [], seen = {}, total = 0, parts = {};
for (i = 0; i < n; i++) u[i] = b[i] & 255;
function u16(k) { return u[k] | u[k + 1] << 8; } function u32(k) { return (u[k] | u[k + 1] << 8 | u[k + 2] << 16) + u[k + 3] * 16777216; }
if (!K || n < 22 || u32(0) !== 0x04034B50) return 'ZIP_SIGNATURE';
for (i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) if (u32(i) === 0x06054B50 && i + 22 + u16(i + 20) === n) { e = i; break; }
if (e < 0) return 'ZIP_END_RECORD';
var cnt = u16(e + 10), cs = u32(e + 12), co = u32(e + 16), q = co;
if (u16(e + 4) || u16(e + 6) || u16(e + 8) !== cnt || cnt === 0xFFFF || co === 0xFFFFFFFF) return 'ZIP_MULTI_DISK_OR_ZIP64';
if (cnt < 1 || cnt > DGS_ZIP_LIM_.entries) return 'ZIP_ENTRY_COUNT';
if (co + cs !== e) return 'ZIP_DIRECTORY_POSITION';
for (i = 0; i < cnt; i++) {
if (q + 46 > e || u32(q) !== 0x02014B50) return 'ZIP_DIRECTORY_ENTRY';
var fl = u16(q + 8), me = u16(q + 10), crc = u32(q + 16), csz = u32(q + 20), usz = u32(q + 24), nl = u16(q + 28), xl = u16(q + 30), cl = u16(q + 32), lo = u32(q + 42);
if (q + 46 + nl + xl + cl > e) return 'ZIP_DIRECTORY_ENTRY';
var nm = dgsLatin_(u.subarray(q + 46, q + 46 + nl)), key = nm.toLowerCase();
q += 46 + nl + xl + cl;
if (!nm || /^\/|\\|(^|\/)\.\.?(\/|$)|[\u0000-\u001f]/.test(nm)) return 'ZIP_NAME_UNSAFE';
if (seen[key]) return 'ZIP_DUPLICATE_PART'; seen[key] = 1;
if (fl & 1 || fl & 64) return 'ZIP_ENCRYPTED';
if (me !== 0 && me !== 8) return 'ZIP_METHOD';
if (usz > DGS_ZIP_LIM_.expanded || (total += usz) > DGS_ZIP_LIM_.expanded || (me === 8 ? usz > csz * 1032 + 1024 : usz !== csz)) return 'ZIP_EXPANDED_LIMIT';
if (lo + 30 > co || u32(lo) !== 0x04034B50) return 'ZIP_LOCAL_HEADER';
var lnl = u16(lo + 26), lxl = u16(lo + 28), ds = lo + 30 + lnl + lxl;
if (u16(lo + 8) !== me || (u16(lo + 6) & 0xF9) !== (fl & 0xF9) || lnl !== nl || dgsLatin_(u.subarray(lo + 30, lo + 30 + lnl)) !== nm) return 'ZIP_LOCAL_HEADER';
if (!(fl & 8) && (u32(lo + 14) !== crc || u32(lo + 18) !== csz || u32(lo + 22) !== usz)) return 'ZIP_LOCAL_HEADER';
if (ds + csz > co) return 'ZIP_DATA_RANGE';
ents.push({ nm: nm, me: me, crc: crc, csz: csz, usz: usz, lo: lo, ds: ds, end: ds + csz + (fl & 8 ? 12 : 0) });
}
if (q !== e) return 'ZIP_DIRECTORY_SIZE';
ents.sort(function (a, z) { return a.lo - z.lo; });
for (i = 1; i < ents.length; i++) if (ents[i].lo < ents[i - 1].end) return 'ZIP_DATA_OVERLAP';
for (i = 0; i < ents.length; i++) {
var x = ents[i], d;
if (Date.now() > dl) return 'ZIP_TIME_LIMIT';
try { d = x.me === 0 ? u.subarray(x.ds, x.ds + x.csz) : dgsInflate_(u, x.ds, x.ds + x.csz, x.usz, dl); } catch (er) { return /^ZIP_/.test(er.message) ? er.message : 'ZIP_DATA_INVALID'; }
if (dgsCrc32_(d) !== x.crc) return 'ZIP_CRC_MISMATCH';
if (/^(\[content_types\]\.xml|_rels\/\.rels|xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|word\/document\.xml)$/i.test(x.nm)) parts[x.nm] = dgsLatin_(d);
if (/^xl\/worksheets\//i.test(x.nm)) parts['?' + x.nm] = 1;
}
var main = f === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml', ct = dgsXmlTags_(parts['[Content_Types].xml'] || ''), rl = dgsXmlTags_(parts['_rels/.rels'] || ''), mt = dgsXmlTags_(parts[main] || '');
if (!ct || ct[0].n !== 'Types' || ct[0].a.xmlns !== DGS_OOXML_.ct) return 'OOXML_CONTENT_TYPES';
var ov = ct.filter(function (t) { return t.n === 'Override' && dgsLc_(t.a.PartName) === '/' + main; }), df = ct.filter(function (t) { return t.n === 'Default' && dgsLc_(t.a.Extension) === 'xml'; });
if (ov.length > 1 || df.length > 1 || (ov.length ? ov[0].a.ContentType : df.length ? df[0].a.ContentType : '') !== K.type) return 'OOXML_MAIN_CONTENT_TYPE';
if (!rl || rl[0].n !== 'Relationships' || rl[0].a.xmlns !== DGS_OOXML_.pr) return 'OOXML_PACKAGE_RELATIONSHIPS';
rl = rl.filter(function (t) { return t.n === 'Relationship' && t.a.Type === DGS_OOXML_.rel + 'officeDocument'; });
if (rl.length !== 1 || rl[0].a.TargetMode || rl[0].a.Target.replace(/^\//, '') !== main) return 'OOXML_OFFICE_DOCUMENT_RELATIONSHIP';
if (!mt || dgsLocal_(mt[0].n) !== K.root || dgsNsOf_(mt[0], mt[0].n) !== K.ns) return 'OOXML_MAIN_PART';
if (f === 'docx') return mt.some(function (t) { return t.d === 1 && dgsLocal_(t.n) === 'body' && dgsNsOf_(mt[0], t.n) === K.ns; }) ? '' : 'OOXML_DOCUMENT_BODY';
var wr = dgsXmlTags_(parts['xl/_rels/workbook.xml.rels'] || ''), sh = mt.filter(function (t) { return dgsLocal_(t.n) === 'sheet' && dgsNsOf_(mt[0], t.n) === K.ns; }), byId = {};
if (!wr || wr[0].n !== 'Relationships' || wr[0].a.xmlns !== DGS_OOXML_.pr) return 'OOXML_WORKBOOK_RELATIONSHIPS';
wr.forEach(function (t) { if (t.n === 'Relationship' && !t.a.TargetMode) byId[t.a.Id] = t.a; });
if (!sh.length) return 'OOXML_NO_SHEET';
for (i = 0; i < sh.length; i++) {
var rid = '', k, r;
for (k in sh[i].a) if (/:id$/.test(k) && mt[0].a['xmlns:' + k.split(':')[0]] === DGS_OOXML_.rel.replace(/\/$/, '')) rid = sh[i].a[k];
r = byId[rid];
if (!r || r.Type !== DGS_OOXML_.rel + 'worksheet' || !parts['?' + (r.Target.charAt(0) === '/' ? r.Target.slice(1) : 'xl/' + r.Target.replace(/^\.\//, ''))]) return 'OOXML_SHEET_RELATIONSHIP';
}
return '';
}
function dgsOfficeName_(n, ext) { n = dgsStr_(n).replace(/[\u0000-\u001f\u007f\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.(xlsx|docx|pdf)$/i, ''); return (n || 'document') + '.' + ext; }


var DGS_EXPORT_IDENTITY_ = null;
function dgsExportHint_() { var b = null; try { b = dgsExportBoundary_(); } catch (e) {} return !b ? 'IDENTITY_NOT_CONFIGURED' : b.kind === 'GOOGLE_SIGN_IN' ? 'SIGN_IN_REQUIRED' : b.kind === 'WORKSPACE_SESSION' ? 'RESTRICTED_ENTRY_REQUIRED' : 'AVAILABLE'; }
function dgsSessionIdentity_(raw, other) {
var c = null, ok; try { c = JSON.parse(raw); } catch (e) { c = null; }
ok = !!c && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dgsStr_(c.domain)) && /^[A-Za-z0-9_-]{20,}$/.test(dgsStr_(c.deployment_id)) && !!c.users && typeof c.users === 'object' && !Array.isArray(c.users) &&
Object.keys(c.users).every(function (u) { return u === dgsLc_(u) && /^[^@\s]+@[^@\s]+$/.test(u) && u.split('@')[1] === c.domain && Array.isArray(c.users[u]); });
function no(code) { return function () { return { no: code }; }; }
if (other) return { kind: 'WORKSPACE_SESSION', principal: no('DOCUMENT_EXPORT_IDENTITY_AMBIGUOUS'), companies: function () { return []; } };
if (!ok) return { kind: 'WORKSPACE_SESSION', principal: no('DOCUMENT_EXPORT_IDENTITY_CONFIG_INVALID'), companies: function () { return []; } };
return { kind: 'WORKSPACE_SESSION',
principal: function () { var url = '', em = '';
try { url = dgsStr_(ScriptApp.getService().getUrl()); } catch (e) { url = ''; }
if (url.indexOf('/s/' + c.deployment_id + '/') < 0) return { no: 'DOCUMENT_EXPORT_ENTRY_NOT_RESTRICTED' };
try { em = dgsLc_(Session.getActiveUser().getEmail()); } catch (e) { em = ''; }
if (!em) return { no: 'DOCUMENT_EXPORT_SESSION_IDENTITY_UNAVAILABLE' };
return em.split('@')[1] === c.domain ? { subject: em, verified: true } : { no: 'DOCUMENT_EXPORT_SESSION_DOMAIN' }; },
companies: function (p) { var a = Object.prototype.hasOwnProperty.call(c.users, p.subject) ? c.users[p.subject] : null; return Array.isArray(a) ? a.map(dgsStr_).filter(Boolean) : []; } };
}
function dgsExportPrincipal_(body) {
var b = dgsExportBoundary_(), p = null, tok = body && body.id_token;
if (body) delete body.id_token;
if (!b || typeof b.principal !== 'function' || typeof b.companies !== 'function') return { no: 'DOCUMENT_EXPORT_IDENTITY_NOT_CONFIGURED' };
try { p = b.principal({ id_token: tok, export_nonce: body && body.export_nonce }); } catch (e) { p = null; }
if (p && p.no) return { no: p.no };
return p && p.verified === true && dgsStr_(p.subject) ? { p: p, b: b } : { no: 'DOCUMENT_EXPORT_UNAUTHENTICATED' };
}


function dgsExportBoundary_() {
if (DGS_EXPORT_IDENTITY_) return DGS_EXPORT_IDENTITY_;
var pr = PropertiesService.getScriptProperties(), cid = dgsStr_(pr.getProperty('KM_EXPORT_GIS_CLIENT_ID')), al = pr.getProperty('KM_EXPORT_ALLOWLIST_V1'), a, sv = pr.getProperty('KM_EXPORT_SESSION_V1');
if (sv) return dgsSessionIdentity_(sv, !!(cid || al));
if (!cid || !al) return null;
try { a = JSON.parse(al); } catch (e) { a = null; }
return dgsGisIdentity_({ clientId: cid, allowlist: a, keys: dgsGisKeys_, nonceOk: dgsGisNonceOk_,
verifyRs256: typeof KJUR === 'undefined' || typeof KEYUTIL === 'undefined' ? null : function (si, sig, jwk) { return KJUR.jws.JWS.verify(si + '.' + sig, KEYUTIL.getKey(jwk), ['RS256']) === true; } });
}
var DGS_GIS_ISS_ = ['accounts.google.com', 'https://accounts.google.com'], DGS_GIS_SKEW_S_ = 60, DGS_GIS_CERTS_ = 'https://www.googleapis.com/oauth2/v3/certs';
function dgsGisIdentity_(cfg) {
return { kind: 'GOOGLE_SIGN_IN', clientId: cfg.clientId,
principal: function (q) { return dgsGisVerify_(cfg, dgsStr_(q && q.id_token), dgsStr_(q && q.export_nonce)); },
companies: function (p) { var s = cfg.allowlist && cfg.allowlist.subjects, a = s && Object.prototype.hasOwnProperty.call(s, p.subject) ? s[p.subject] : null; return Array.isArray(a) ? a.map(dgsStr_).filter(Boolean) : []; } };
}
function dgsB64uText_(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Utilities.newBlob(Utilities.base64Decode(s)).getDataAsString('UTF-8'); }
function dgsGisVerify_(cfg, tok, nonce) {
function no(c) { return { no: c }; }
var parts = tok.split('.'), h, p, keys, ok = false, now;
if (!cfg.clientId || !cfg.allowlist || typeof cfg.allowlist.subjects !== 'object' || typeof cfg.keys !== 'function' || typeof cfg.nonceOk !== 'function') return no('DOCUMENT_EXPORT_IDENTITY_NOT_CONFIGURED');
if (typeof cfg.verifyRs256 !== 'function') return no('DOCUMENT_EXPORT_VERIFIER_UNAVAILABLE');
if (!tok) return no('DOCUMENT_EXPORT_SIGN_IN_REQUIRED');
if (tok.length > 4096 || parts.length !== 3 || !parts.every(function (x) { return /^[A-Za-z0-9_-]+$/.test(x); })) return no('DOCUMENT_EXPORT_TOKEN_MALFORMED');
try { h = JSON.parse(dgsB64uText_(parts[0])); p = JSON.parse(dgsB64uText_(parts[1])); } catch (e) { return no('DOCUMENT_EXPORT_TOKEN_MALFORMED'); }
if (!h || !p || h.alg !== 'RS256' || !dgsStr_(h.kid) || h.crit) return no('DOCUMENT_EXPORT_TOKEN_ALGORITHM');
try { keys = cfg.keys(false); if (!keys || !keys[h.kid]) keys = cfg.keys(true); } catch (e) { return no('DOCUMENT_EXPORT_KEYS_UNAVAILABLE'); }
if (!keys || !keys[h.kid]) return no('DOCUMENT_EXPORT_TOKEN_KEY_UNKNOWN');
try { ok = cfg.verifyRs256(parts[0] + '.' + parts[1], parts[2], keys[h.kid]) === true; } catch (e) { ok = false; }
if (!ok) return no('DOCUMENT_EXPORT_TOKEN_SIGNATURE');
now = Math.floor((cfg.now ? cfg.now() : Date.now()) / 1000);
if (DGS_GIS_ISS_.indexOf(p.iss) < 0) return no('DOCUMENT_EXPORT_TOKEN_ISSUER');
if (p.aud !== cfg.clientId || (p.azp !== undefined && p.azp !== cfg.clientId)) return no('DOCUMENT_EXPORT_TOKEN_AUDIENCE');
if (typeof p.exp !== 'number' || typeof p.iat !== 'number' || now > p.exp + DGS_GIS_SKEW_S_ || p.iat > now + DGS_GIS_SKEW_S_ || p.exp - p.iat > 3600 + DGS_GIS_SKEW_S_) return no('DOCUMENT_EXPORT_TOKEN_EXPIRED');
if (cfg.allowlist.hd && p.hd !== cfg.allowlist.hd) return no('DOCUMENT_EXPORT_TOKEN_DOMAIN');
if (!dgsStr_(nonce) || p.nonce !== nonce || cfg.nonceOk(nonce) !== true) return no('DOCUMENT_EXPORT_TOKEN_NONCE');
if (!/^[0-9A-Za-z_-]{1,255}$/.test(dgsStr_(p.sub))) return no('DOCUMENT_EXPORT_TOKEN_MALFORMED');
return { subject: p.sub, verified: true };
}

function dgsGisKeys_(refresh) {
var c = CacheService.getScriptCache(), k = c.get('km.gis.jwks'), r, o = {}, age;
if (k && !refresh) return JSON.parse(k);
if (refresh && c.get('km.gis.jwks.refetched')) return k ? JSON.parse(k) : {};
if (refresh) c.put('km.gis.jwks.refetched', '1', 60);
r = UrlFetchApp.fetch(DGS_GIS_CERTS_, { muteHttpExceptions: true, followRedirects: false });
if (r.getResponseCode() !== 200) throw new Error('KEYS_HTTP_' + r.getResponseCode());
(JSON.parse(r.getContentText()).keys || []).forEach(function (j) { if (j && j.kty === 'RSA' && dgsStr_(j.kid) && j.n && j.e && (!j.alg || j.alg === 'RS256')) o[j.kid] = { kty: 'RSA', n: j.n, e: j.e }; });
age = /max-age=(\d+)/.exec(String((r.getHeaders() || {})['Cache-Control'] || (r.getHeaders() || {})['cache-control'] || ''));
if (Object.keys(o).length) c.put('km.gis.jwks', JSON.stringify(o), Math.max(60, Math.min(21600, age ? Number(age[1]) : 3600)));
return o;
}
function dgsGisNonceOk_(n) { return /^[0-9a-f]{32}$/.test(n) && CacheService.getScriptCache().get('km.gis.nonce.' + n) === '1'; }

function handleDocumentExportNonce_() {
var b = dgsExportBoundary_(), n;
if (!b || b.kind !== 'GOOGLE_SIGN_IN') return jsonResponse_({ success: false, error: 'DOCUMENT_EXPORT_IDENTITY_NOT_CONFIGURED', code: 'DOCUMENT_EXPORT_IDENTITY_NOT_CONFIGURED', zero_write: true });
n = Utilities.getUuid().replace(/-/g, '').toLowerCase();
CacheService.getScriptCache().put('km.gis.nonce.' + n, '1', 600);
return jsonResponse_({ success: true, nonce: n, client_id: b.clientId, expires_in: 600 });
}
function handleDocumentExport_(body, io) {
function no(code, more) { return jsonResponse_(Object.assign({ success: false, error: code, code: code, zero_write: true }, more || {})); }
var who = dgsExportPrincipal_(body);
if (who.no) return no(who.no);
io = io || dfoDefaultIo_();
var id = dgsStr_(body && body.document_id), type = dgsLc_(body && body.related_entity_type), eid = dgsStr_(body && body.related_entity_id), fmt = dgsLc_(body && body.format), co = dgsStr_(body && body.company);
if (!id) return no('DOCUMENT_ID_REQUIRED');
if ((type !== 'shipment' && type !== 'purchase_order') || !eid) return no('RELATED_ENTITY_REQUIRED');
if (fmt !== 'xlsx' && fmt !== 'docx') return no('DOCUMENT_EXPORT_FORMAT_UNSUPPORTED', { supported: ['xlsx', 'docx'], pdf: 'the registered pdf_file_url' });
var ss = dgsDb_(), rows = dtReadTable_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_).filter(function (r) { return dgsStr_(r.document_id) === id; }), r = rows[0];
if (rows.length !== 1) return no(rows.length ? 'DOCUMENT_ID_DUPLICATED' : 'DOCUMENT_NOT_FOUND');
if (dgsLc_(r.related_entity_type) !== type || dgsStr_(r.related_entity_id) !== eid) return no('DOCUMENT_ENTITY_MISMATCH');
if (dgsRowState_(r) !== 'READY') return no('DOCUMENT_NOT_READY', { status: dgsRowState_(r) });
if (dgsVersionRole_(dgsGeneratedFor_(ss, type, eid).filter(function (x) { return dgsRowState_(x) !== 'SUPERSEDED'; }), r) === 'HISTORY' && dgsLc_(body.version_scope) !== 'history') return no('DOCUMENT_NOT_CURRENT', { version_role: 'HISTORY' });
var ent = sfoReadTable_(ss, type === 'shipment' ? 'shipments' : 'purchase_orders', []).filter(function (x) { return dgsStr_(type === 'shipment' ? x.shipment_id : x.purchase_order_id) === eid; });
if (ent.length !== 1) return no('DOCUMENT_ENTITY_NOT_FOUND');
var may; try { may = who.b.companies(who.p); } catch (e) { may = null; }
if (!dgsStr_(ent[0].company) || !Array.isArray(may) || may.map(dgsStr_).indexOf(dgsStr_(ent[0].company)) < 0) return no('DOCUMENT_EXPORT_FORBIDDEN', who.b.kind === 'GOOGLE_SIGN_IN' && !(may && may.length) ? { account: who.p.subject } : {});
if (co && dgsLc_(ent[0].company) !== dgsLc_(co)) return no('DOCUMENT_COMPANY_MISMATCH');
var meta, x, kind, n;
try { meta = io.fileMeta(dgsStr_(r.file_id)); } catch (e) { return no('DOCUMENT_SOURCE_UNREADABLE'); }
if (meta.trashed) return no('DOCUMENT_SOURCE_MISSING');
if (dgsStr_(r.output_folder_id) && meta.parents.indexOf(dgsStr_(r.output_folder_id)) < 0) return no('DOCUMENT_SOURCE_LOCATION_MISMATCH');
if (!(kind = DGS_OFFICE_[meta.mime])) return no('DOCUMENT_EXPORT_TYPE_UNSUPPORTED');
if (kind.f !== fmt) return no('DOCUMENT_EXPORT_FORMAT_MISMATCH', { offered: kind.f });
try { x = io.exportOffice(dgsStr_(r.file_id), kind.mime); } catch (e) { return no('DOCUMENT_EXPORT_FAILED', { retryable: true }); }
if (x.code !== 200) return no(x.code === 403 ? 'DOCUMENT_EXPORT_PERMISSION_DENIED' : x.code === 413 || /exportSizeLimitExceeded/.test(x.text || '') ? 'DOCUMENT_EXPORT_TOO_LARGE' : 'DOCUMENT_EXPORT_FAILED', { http: x.code, retryable: x.code >= 500 || x.code === 429 });
n = (x.bytes || []).length;
if (n > DGS_OFFICE_MAX_) return no('DOCUMENT_EXPORT_TOO_LARGE');
if (dgsLc_(x.type).split(';')[0] !== kind.mime) return no('DOCUMENT_EXPORT_NOT_OFFICE', { check: 'CONTENT_TYPE' });
var chk = dgsOfficeZip_(x.bytes || [], kind.f); if (chk) return no('DOCUMENT_EXPORT_NOT_OFFICE', { check: chk });
return jsonResponse_({ success: true, document_id: id, format: fmt, mime: kind.mime, file_name: dgsOfficeName_(r.file_name, fmt), size: n, content_base64: Utilities.base64Encode(x.bytes), writes: 0 });
}
function handleGeneratedDocumentGet_(body) {
var documentId = dgsStr_(body && body.document_id);
if (!documentId) return jsonResponse_({ success: false, error: 'DOCUMENT_ID_REQUIRED' });
var rows = dtReadTable_(dgsDb_(), 'generated_documents', GENERATED_DOCUMENTS_HEADERS_)
.filter(function (r) { return dgsStr_(r.document_id) === documentId; });
if (!rows.length) return jsonResponse_({ success: true, found: false, document_id: documentId });
return jsonResponse_({ success: true, found: true, document: dgsDocumentDto_(rows[0]) });
}


// INT-CAND1 (local candidate): the PO retry builds the Send PO path's own inputs (13_ pcPoPrepareForIssue_) - the canonical warehouse's
// name and the SKU labels. Read-only (purchase_orders, purchase_order_lines, warehouses, sku_details); no write is added.
function dgsPoRetryOpts_(ss, poId) {
var l = dgsPoLoad_(ss, poId);
return { today: shipmentToday_(), factory_name: l.ok ? dgsFactoryName_(ss, l.po.warehouse_id) : '', sku_labels: l.ok ? dgsSkuLabels_(ss, l.lines.map(function (x) { return x.sku; })) : {} };
}
function handleDocumentRetry_(body) {
var entityType = dgsLc_(body && (body.related_entity_type || body.entity_type));
var entityId = dgsStr_(body && (body.related_entity_id || body.entity_id || body.shipment_id || body.purchase_order_id));
var actor = dgsStr_(body && body.actor) || 'operation-system';
if (!entityId) return jsonResponse_({ success: false, error: 'RELATED_ENTITY_ID_REQUIRED', zero_write: true });
if (entityType !== 'shipment') return jsonResponse_({ success: false, code: 'SANDBOX_DOCUMENT_RETRY_SCOPE_REFUSED', zero_write: true });
try {
var ss = dgsDb_();
var context = dgsShipmentContext_(ss, entityId);
if (!context.ok || !SFO_DISPATCHED_STATUS_[context.status]) return jsonResponse_({ success: false, code: 'SHIPMENT_NOT_DISPATCHED', zero_write: true });
if(context.ctx.documents_not_required)return jsonResponse_({success:true,retried:false,result:dgsNoShipmentDocuments_(entityId),zero_write:true});
var frozen = docReadSnapshot_(ss, entityId);
if (!frozen || dgsStr_(frozen.header.shipment_id) !== entityId || dgsLc_(frozen.header.status) !== 'final') return jsonResponse_({ success: false, code: 'FROZEN_SNAPSHOT_REQUIRED', zero_write: true });
// Generation reuses READY documents and the existing snapshot; dispatch is never invoked.
var res = dgsGenerateShipmentDocuments_(ss, entityId, actor, {});
return jsonResponse_({ success: !!res.ok, retried: true, result: res });
} catch (err) {
return jsonResponse_({ success: false, error: 'DOCUMENT_RETRY_FAILED: ' + (err && err.message ? err.message : err), related_entity_id: entityId });
}
}




function dgsLog_(tag, obj) { try { Logger.log(tag + ' ' + JSON.stringify(obj)); } catch (e) {} }









function dgsPoGeneratedSplit_(dtos) {
var out = { attempt_count: 0, current_count: 0, current: [], in_progress: [], failed: [], superseded: [] };
(dtos || []).forEach(function (d) {
out.attempt_count++;
var s = dgsStr_(d && d.status);
if (s === 'READY') { out.current.push(d); out.current_count++; }
else if (s === 'SUPERSEDED') { out.superseded.push(d); }
else if (s === 'GENERATING') { out.in_progress.push(d); }
else { out.failed.push(d); }
});
return out;
}





function dgsPoBlockingContract_(out) {
var reasons = (out && out.blocking_reasons) || [];
var first = reasons.length ? dgsUc_(reasons[0].reason) : '';
var stageOf = {
PURCHASE_ORDER_NOT_DRAFT: 'eligibility',
DOCUMENT_REQUIRED_FIELD_MISSING: 'field_contract',
DOCUMENT_FIELD_AUTHORITY_MISSING: 'field_contract',
DOCUMENT_FILE_NAME_UNRESOLVED: 'file_name',
DOCUMENT_TRANSFORM_UNSUPPORTED: 'field_contract'
};
var stage = stageOf[first];
if (!stage && first) stage = (first.indexOf('TEMPLATE') !== -1) ? 'template_selection'
: ((first.indexOf('FOLDER') !== -1 || first.indexOf('DRIVE') !== -1) ? 'drive_readiness' : 'document_generation');
var missing = ((out && out.field_completeness && out.field_completeness.required_missing) || []).map(function (m) { return dgsStr_(m.placeholder); });
var next;
if (!first) next = 'No blocker. Send PO will generate the Purchase Order document and move the PO out of Draft.';
else if (stage === 'eligibility') next = 'Send PO applies to a Draft PO only. No document action is required.';
else if (stage === 'template_selection') next = 'Configure exactly ONE active Purchase Order template matching this PO\'s factory + series, then re-run this diagnostic.';
else if (stage === 'field_contract') next = 'Populate the unresolved required source field(s) on the authoritative record — ' + (missing.length ? missing.slice(0, 8).join(', ') : 'see field_completeness.required_missing') + ' — then re-run this diagnostic. Send PO stays blocked and the PO stays Draft.';
else if (stage === 'file_name') next = 'The document file name could not be constructed from the template naming rule. Correct the naming rule or the field it reads, then re-run this diagnostic.';
else if (stage === 'drive_readiness') next = 'Resolve the Drive output configuration named by reason_code (root/folder authority), then re-run this diagnostic. Nothing was created in Drive.';
else next = 'Resolve the reason_code above, then re-run this diagnostic.';
return {
blocking_stage: first ? stage : 'none',
reason_code: first || 'NONE',
safe_retry_verdict: !first ? 'NOT_APPLICABLE_NOT_BLOCKED'
: (dgsFailureClass_(first) === 'PRE_DISPATCH_BLOCKING'
? 'RETRY_CANNOT_HELP_CONFIGURATION_REQUIRED'
: 'RETRY_MAY_HELP_TRANSIENT'),
next_action: next
};
}

function handlePoDocumentDiagnostic_(body) {
var poId = dgsStr_(body && body.purchase_order_id);
if (!poId) return jsonResponse_({ success: false, error: 'PURCHASE_ORDER_ID_REQUIRED' });
var ss = dgsDb_();
var po = dgsFindRow_(sfoReadTable_(ss, 'purchase_orders', []), 'purchase_order_id', poId);
if (!po) return jsonResponse_({ success: false, error: 'PURCHASE_ORDER_NOT_FOUND', purchase_order_id: poId });
var pi = dgsPoIdentity_(ss, po);
if (!pi.ok) return jsonResponse_({ success: true, purchase_order_id: poId, po_no: dgsStr_(po.po_no), template: null, template_error: '', verdict: 'BLOCKED', send_po_verdict: 'BLOCKED',
system_payload_verdict: 'BLOCKED', drive_readiness_verdict: 'NOT_EVALUATED', required_document_manifest: [], blocking_stage: 'warehouse_identity', reason_code: pi.reason,
blocking_reasons: [{ reason: pi.reason, detail: pi.detail }], safe_retry_verdict: 'RETRY_CANNOT_HELP_CONFIGURATION_REQUIRED', writes_performed: 0, folders_created: 0, files_created: 0,
next_action: 'Correct this PO\'s warehouse_id (' + pi.reason + (pi.detail ? ': ' + pi.detail : '') + '); factory_id is only its alias - blank or the same warehouse. No template was selected; Drive was not checked.' });
po = pi.po;
var poLines = sfoReadTable_(ss, 'purchase_order_lines', []).filter(function (l) { return dgsStr_(l.purchase_order_id) === poId; });
var status = dgsLc_(po.order_status) || dgsLc_(po.status);
var today = shipmentToday_();
var pc = dgsPoContext_(po, poLines, dgsStr_(po.order_date) ? po.order_date : today);
var sel = pc.ok ? dgsSelectPoTemplate_(dgsTemplates_(ss), pc.ctx) : pc;
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
var model = dgsPoPayloadModel_(Object.assign({}, po, { series: pc.ctx.series }), poLines, { order_date_candidate: today, sku_labels: {} });
var mapped = dgsPoMap_(model, fields), fok = !mapped.reason;
var built = dgsBuildRenderPayload_({ template: sel.template, values: mapped.values, class_key: 'PURCHASE_ORDER',
related_entity_type: 'purchase_order', related_entity_id: poId, folder_id: '(preview)', fallback_file_name: 'KitchenMama_PO_' + dgsStr_(po.po_no) });
var existing = dgsGeneratedFor_(ss, 'purchase_order', poId);
var batch = dgsPoBatchDate_(status === 'draft' ? {} : po, today);
var drive = dgsDriveReadiness_(dofProbeIo_(), [{ class_key: 'PURCHASE_ORDER', template: sel.template }], 'purchase_order');
out.field_completeness = { required_missing: mapped.missing, problems: mapped.problems, complete: fok, mapped_placeholders: Object.keys(mapped.values).length };
out.payload_checksum = built.ok ? built.payload.source_checksum : '';
out.expected_file_name = built.ok ? built.payload.file_name : '';
out.drive_readiness = { status: drive.status, reason: drive.reason || '', root_folder_id: drive.root_folder_id || '', checks: drive.checks || [] };
var month = (batch.date || '').slice(0, 7);
out.folder_preview = { root_folder_id: drive.root_folder_id || '', date_folder: month, date_source: batch.source, path: 'PurchaseOrder/' + month + '/' };
out.existing_documents = existing.map(function (r) { return dgsDocumentDto_(r); });
out.expected_registry_identity = { related_entity_type: 'purchase_order', related_entity_id: poId, template_id: sel.template_id, template_version: sel.template_version, key: dgsIdentityKey_('purchase_order', poId, sel.template_id, sel.template_version) };
out.system_payload_verdict = (fok && built.ok) ? 'READY' : 'BLOCKED';
out.drive_readiness_verdict = drive.ok ? 'READY' : 'BLOCKED';
out.required_document_manifest = [{
class_key: 'PURCHASE_ORDER', document_type: 'purchase_order', template_key: sel.template_key,
requirement: 'ALWAYS', state: (out.system_payload_verdict === 'READY' && drive.ok) ? 'REQUIRED_AND_EXECUTABLE' : 'CONFIGURATION_REQUIRED',
blocks_transition: true, renderer_available: true,
required_field_contract_complete: fok,
missing_fields: mapped.missing, missing_authorities: [], retryable: !drive.ok,
next_action: (out.system_payload_verdict === 'READY' && drive.ok) ? 'Ready to Send PO.' : 'Resolve the blocking reasons below, then re-run this diagnostic.'
}];
out.blocking_reasons = []
.concat(out.eligible_for_send_po ? [] : [{ reason: 'PURCHASE_ORDER_NOT_DRAFT', detail: 'Send PO applies to a Draft PO; this one is ' + status + '.' }])
.concat(fok ? [] : [{ reason: mapped.reason, detail: 'See field_completeness.' }])
.concat(built.ok ? [] : [{ reason: built.reason, detail: 'The filename could not be constructed.' }])
.concat(drive.ok ? [] : [{ reason: drive.reason, detail: 'Drive readiness failed.' }]);
out.send_po_verdict = out.blocking_reasons.length ? 'BLOCKED' : 'READY';
out.verdict = out.send_po_verdict;




out.generated_documents = dgsPoGeneratedSplit_(out.existing_documents);
var poBlk = dgsPoBlockingContract_(out);
out.blocking_stage = poBlk.blocking_stage;
out.reason_code = poBlk.reason_code;
out.safe_retry_verdict = poBlk.safe_retry_verdict;
out.next_action = poBlk.next_action;
} else {
out.system_payload_verdict = 'BLOCKED';
out.drive_readiness_verdict = 'NOT_EVALUATED';
out.required_document_manifest = [];
out.blocking_reasons = [{ reason: sel.reason, detail: 'No single active Purchase Order template matches factory "' + dgsStr_(po.factory_id) + '" + series "' + dgsStr_(po.series) + '".' }];
out.send_po_verdict = 'BLOCKED';
out.verdict = 'BLOCKED';
out.generated_documents = dgsPoGeneratedSplit_([]);
out.blocking_stage = 'template_selection';
out.reason_code = dgsStr_(sel.reason) || 'PO_TEMPLATE_UNRESOLVED';
out.safe_retry_verdict = 'RETRY_CANNOT_HELP_CONFIGURATION_REQUIRED';
out.next_action = 'Configure exactly ONE active Purchase Order document template matching factory "' + dgsStr_(po.factory_id) + '" + series "' + dgsStr_(po.series) + '", then re-run this diagnostic. Send PO stays blocked and the PO stays Draft until then.';
}
dgsLog_('[DGS-PO-DIAG]', { po: poId, verdict: out.verdict, template: out.template && out.template.template_key });
return jsonResponse_(out);
}
// Run manually in the editor after updating oauthScopes. Opens configured identities only; creates nothing.
function documentWorkflowAuthorizationCheck() {
var io = dofProbeIo_(), rows = dgsTemplates_(dgsDb_()).filter(function (t) { return dgsBool_(t.is_active); });
var checks = rows.map(function (t) {
var root = dofNormalizeFolderRef_(t.output_folder_id);
return { template_key: dgsStr_(t.template_key), root: root.ok ? io.probeFolder(root.folder_id) : root,
  asset: dgsStr_(t.template_file_id) ? io.probeFile(dgsStr_(t.template_file_id)) : { ok: false, reason: 'DOCUMENT_TEMPLATE_ASSET_MISSING' } };
});
var result = { read_only: true, writes_performed: 0, checks: checks };
Logger.log(JSON.stringify(result)); return result;
}
function handleShipmentDocumentDiagnostic_(body) {
var shipmentId = dgsStr_(body && body.shipment_id);
if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
var ss = dgsDb_();
var sc = dgsShipmentContext_(ss, shipmentId);
if (!sc.ok) return jsonResponse_({ success: false, error: sc.reason, shipment_id: shipmentId });
if(sc.ctx.documents_not_required)return jsonResponse_(Object.assign(dgsNoShipmentDocuments_(shipmentId),{success:true,db_status:sc.status,documents_required:false,applicable_manifest:[],existing_documents:[],safe_retry_verdict:'NOT_REQUIRED',writes_performed:0,folders_created:0,files_created:0,read_only:true}));
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
var beforeDispatch=sc.status==='draft'||sc.status==='ready_to_ship',valueCheck=null;
if(beforeDispatch){var checked=handleShipmentDocumentValuesCheck_({shipment_id:shipmentId});valueCheck=checked&&checked.getContent?JSON.parse(checked.getContent()):checked;out.pre_dispatch_value_check=valueCheck;}
var snap = docReadSnapshot_(ss, shipmentId);
out.snapshot_eligible = !!SFO_DISPATCHED_STATUS_[sc.status];
out.snapshot_present = !!snap;
var byDoc = [], ready = 0, configReq = 0, fieldByClass = {}, ciAuthority = [];
var selected = dgsShipmentManifest_(dgsTemplates_(ss), sc.ctx);
readiness.manifest.forEach(function (m) {
var fields = dgsFieldsFor_(ss, m.template_id);
var row = { class_key: m.class_key, template_key: m.template_key, requirement: m.requirement };
var cls = null;
for (var i = 0; i < DGS_SHIPMENT_CLASSES_.length; i++) { if (DGS_SHIPMENT_CLASSES_[i].class_key === m.class_key) cls = DGS_SHIPMENT_CLASSES_[i]; }
if (cls && cls.render === 'CI') {

docCiFieldAuthorityReport_(fields).forEach(function (a) { ciAuthority.push(Object.assign({ class_key: m.class_key, template_key: m.template_key }, a)); });
}



if (!snap) { row.field_completeness = 'SNAPSHOT_NOT_AVAILABLE'; byDoc.push(row); return; }
var model = docRenderByClass_(cls ? cls.render : '', snap);
if (!model.ok) {
row.status = 'CONFIGURATION_REQUIRED'; row.reason = model.error || model.reason;
row.required_missing=row.reason==='MISSING_DECLARED_VALUE'?dgsDeclaredValueProblems_(snap,sc.ctx.country).map(function(p){return {placeholder:'DECLARED_VALUE',problems:[p]};}):[];
fieldByClass[m.class_key] = { complete: false, missing: row.required_missing, unresolved: [] };
configReq++; byDoc.push(row); return;
}
// Diagnose the same SKU/Series projection, worksheet scoping and filename mapping as generation.
var entry = (selected.entries || []).filter(function (e) { return e.class_key === m.class_key && e.template_id === m.template_id; })[0];
var mapped = entry ? dgsResolvePayload_(ss, { entry: entry, model: model, related_entity_type: 'shipment',
related_entity_id: shipmentId, folder_id: '(preview)', destination_bucket: readiness.destination_bucket,
fallback_file_name: 'KitchenMama_' + m.class_key + '_' + sc.external_shipment_id }) : { ok: false, reason: 'DOCUMENT_TEMPLATE_NOT_CONFIGURED' };
var unresolved = mapped.unresolved_authority || [];
row.required_missing = mapped.missing || [];
row.unresolved_authority = unresolved;
row.status = mapped.ok ? 'READY' : 'CONFIGURATION_REQUIRED';
if (!mapped.ok) row.reason = mapped.reason;
fieldByClass[m.class_key] = { complete: row.status === 'READY', missing: row.required_missing, unresolved: unresolved };
if (row.status === 'READY') ready++; else configReq++;
byDoc.push(row);
});
out.field_completeness_by_document = byDoc;
out.documents_ready = ready;
out.documents_configuration_required = configReq;

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
var absent = readiness.manifest.filter(function (m) {
return !existing.some(function (r) { return dgsStr_(r.template_id) === dgsStr_(m.template_id) && dgsStr_(r.template_version) === dgsStr_(m.template_version) && dgsRowState_(r) === 'READY'; });
});
absent.forEach(function (m) {
if(beforeDispatch)return;
if (!existing.some(function (r) { return dgsStr_(r.template_id) === dgsStr_(m.template_id) && dgsStr_(r.template_version) === dgsStr_(m.template_version); })) {
out.missing_or_failed_outputs.push({ document_label: m.class_key, template_key: m.template_key, status: 'NOT_GENERATED', reason: 'DOCUMENT_OUTPUTS_MISSING' });
}
});
out.safe_retry_verdict = out.existing_documents.some(function (d) { return d.retryable; }) ? 'RETRY_SAFE' : (out.missing_or_failed_outputs.length ? 'CONFIGURATION_REQUIRED' : 'NOTHING_TO_RETRY');
if (snap && SFO_DISPATCHED_STATUS_[sc.status] && absent.length && configReq === 0 && readiness.drive_readiness.status === 'READY') out.safe_retry_verdict = 'RETRY_SAFE';
if(beforeDispatch)out.safe_retry_verdict='NOT_DISPATCHED';
out.system_readiness_verdict = out.pre_dispatch_system_readiness.status;
out.drive_readiness_verdict = readiness.drive_readiness.status === 'READY' ? 'READY' : (readiness.drive_readiness.status === 'SKIPPED' ? 'NOT_EVALUATED' : 'BLOCKED');
out.blocking_reasons = readiness.blockers;
out.configuration_issues = readiness.configuration_issues || [];
out.confirm_shipment_verdict = (readiness.ok && out.eligible_for_confirm) ? 'READY' : 'BLOCKED';
if(beforeDispatch&&readiness.ok){
  if(valueCheck&&valueCheck.code==='DATA_WRITE_IN_PROGRESS')out.confirm_shipment_verdict='WAITING_FOR_WRITE';
  else if(!valueCheck||valueCheck.definitive!==true)out.confirm_shipment_verdict='VALUES_UNVERIFIED';
  else if(valueCheck.values_ok!==true){out.confirm_shipment_verdict='BLOCKED';out.blocking_reasons=out.blocking_reasons.concat(valueCheck.blockers||[]);}
}
out.verdict = out.confirm_shipment_verdict;
dgsLog_('[DGS-SHIP-DIAG]', { shipment: shipmentId, verdict: out.verdict, manifest: out.applicable_manifest.length, ready: ready });
return jsonResponse_(out);
}

// R15G-EU D2: the actual destination country of a shipment row. A row whose country is a PLANNING SET (KMCID, carried by the 90_ bundle)
// resolves through its SAVED destination warehouse to a member country other than the set code itself ('EU' is never a receiving country);
// anything else keeps the row country and names why (the readiness blocker refuses Confirm). A non-set row: its own country, unchanged.
function dgsDestCountry15g_(ss, row) {
var site = dgsUc_(row.country), m = null;
try { m = (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.planningSetMembers === 'function') ? KMCID.planningSetMembers(site) : null; } catch (e) { m = null; }
if (!m) return { country: site, set: false, unresolved: '' };
var wid = dgsStr_(row.destination_warehouse_id), w = wid ? sfoReadTable_(ss, 'warehouses', []).filter(function (r) { return dgsLc_(r.warehouse_id) === dgsLc_(wid); }) : [];
var c = w.length === 1 ? dgsUc_(w[0].country) : '';
var destinationOk = typeof csdShipmentDestinationCountryOk_ === 'function' ? csdShipmentDestinationCountryOk_(c, site) : m.indexOf(c) !== -1;
if (c && c !== site && destinationOk) return { country: c, set: true, unresolved: '' };
return { country: site, set: true, unresolved: !wid ? 'DESTINATION_WAREHOUSE_BLANK' : w.length !== 1 ? (w.length ? 'DESTINATION_WAREHOUSE_DUPLICATED' : 'DESTINATION_WAREHOUSE_NOT_FOUND') : !c ? 'DESTINATION_WAREHOUSE_COUNTRY_BLANK' : 'DESTINATION_COUNTRY_NOT_A_SET_MEMBER:' + c };
}
// R15G-EU-DOCS-39 (sbx-r15g-eu): patched

// ===== XCO-R15G (39_): series grouping by company and by every fact that would conflict =====
var XCO_SERIES_FACTS_ = ['hs_code', 'country_of_origin', 'declared_currency', 'units_per_carton', 'carton_length', 'carton_width', 'carton_height',
  'material', 'product_use', 'battery_type', 'magnet_type', 'carton_weight', 'package_weight', 'tax_rate_id', 'vat_no', 'eori_no',
  'regular_price', 'regular_price_currency'];
// -> undefined (a shipment with 0 / 1 live plan link: one company, grouping as before) | function (snapshot line) -> company | null
function xcoSeriesCompanyOf_(ss, model) {
  var sid = dgsStr_(model && model.header && model.header.shipment_id);
  if (!sid || typeof xcoLinkCount_ !== 'function') return undefined;
  var n = 0;
  try { n = xcoLinkCount_(ss, sid); } catch (e) { return function () { return null; }; }
  if (n < 2) return undefined;
  var ship = null, lt = [];
  try {
    ship = sc13One_(sc13Read_(ss, 'shipments', ['shipment_id']).rows, 'shipment_id', sid);
    lt = sc13Read_(ss, 'shipment_lines', ['shipment_line_id', 'shipment_id', 'shipping_plan_line_id', 'shipment_qty', 'sku', 'note']).rows
      .filter(function (l) { return sc13Str_(l.shipment_id) === sid; });
  } catch (e2) { return function () { return null; }; }
  return function (l) {
    var lid = dgsStr_(l && l.shipment_line_id), rows = lt.filter(function (x) { return sc13Str_(x.shipment_line_id) === lid; });
    if (!lid || rows.length !== 1) return null;
    try { var c = sc13Str_(sc13Source_(ss, rows[0], ship).company); return c || null; } catch (e3) { return null; }
  };
}
// XCO-R15G-39 (xco-r15g-impl): patched

// XCO-R15G O-1 / H2 (39_): document readiness reads only live lines (shared predicate).
// XCO-R15G-39B-O1 (xco-r15g-impl): patched

// XCO-R15G O-5: -> a readiness blocker when a GATING Commercial Invoice would receive more than one declared currency, else null
function xcoCiCurrencyConflict_(ss, sc, manifest, gating) {
  try {
    var ci = ((manifest && manifest.entries) || []).filter(function (e) { return e.render === 'CI' && ((gating && gating[e.class_key]) || e.requirement === 'ALWAYS'); });   // REQUIRED = gating OR requirement ALWAYS (the export CI does not gate the transition but is always required)
    if (!ci.length || !sc || !sc.row) return null;
    var sid = dgsStr_(sc.row.shipment_id);
    var lines = sfoReadTable_(ss, 'shipment_lines', []).filter(function (l) { return dgsStr_(l.shipment_id) === sid && !(typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(l)); });
    if (!lines.length) return null;
    var master = sfoSkuMasterMap_(ss), taxRows = sfoReadTable_(ss, 'tax_referral_rates', []);
    var duty = typeof sfoDestCountry15g_ === 'function' ? sfoDestCountry15g_(ss, sc.row) : sfoStr_(sc.row.country), asOf = sfoStr_(sc.row.actual_departure_date) || null;
    var cur = {}, originWarehousesDoc1 = sfoWarehouseNameMap_(ss);
    lines.forEach(function (l) { var m = master[sfoStr_(l.sku)] || {}, c = sfoResolveCustoms_(taxRows, sfoStr_(m.series), duty, sc.row.actual_departure_date || sc.row.etd || sc.row.shipped_at || asOf, sfoCustomsOriginDoc1_(l, m, originWarehousesDoc1[sfoUc_(sc.row.source_warehouse_id)]), ss); if (c && c.resolved && sfoStr_(c.declared_currency)) cur[sfoUc_(c.declared_currency)] = 1; });
    var list = Object.keys(cur).sort();
    if (list.length < 2) return null;
    return { reason: 'COMMERCIAL_INVOICE_CURRENCY_CONFLICT', field: 'tax_referral_rates.declared_currency', value: list.join(' / '), class_keys: ci.map(function (e) { return e.class_key; }),
      correction: 'A Commercial Invoice carries ONE currency and no currency is converted. These lines would be declared in ' + list.length + ' currencies; align the declared currency of their series (tax_referral_rates) or ship them on separate drafts.' };
  } catch (e) { return null; }
}
// XCO-R15G-39C-O5 (xco-r15g-impl): patched

var DGS_PRODUCTION_PROFILE_BUILD_VERSION_ = 'PROD1-DGS-20261112-AD3-DW1-DW2-MC1-WH1-DG1-EUD1-OND1-EUT1-DSR1';
