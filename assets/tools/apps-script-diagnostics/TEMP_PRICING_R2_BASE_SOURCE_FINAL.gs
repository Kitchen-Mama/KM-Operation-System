/**
 * TEMP — PRICING-R2 BASE SOURCE RECONCILIATION AND SCHEMA FINAL.
 *
 *     TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN()   // reads only, writes nothing, ever.
 *     TEMP_PRICING_R2_BASE_SOURCE_FINAL_COMMIT()    // one bounded write. Refuses unless the dry run still holds.
 *
 * Repository-only operator tool. NOT a release file, no manifest row, no stamp, no deployment.
 *
 * ================================================================================================
 * WHAT CHANGED, AND WHY THIS SUPERSEDES THE SURGICAL REPAIR
 * ================================================================================================
 *
 * TEMP_PRICING_R2_SURGICAL_REPAIR restores base_msrp from PRE__pricing_list__20260923-184134,
 * because at the time PRE was the only authority anyone had for a base price. The business has now
 * frozen a different one: SKU Details owns BASE pricing, and pricing_list owns FX-derived AUTO
 * pricing and final field-level authority. A restore from PRE would therefore reinstate a value
 * that is no longer the source of truth — correct as forensics, wrong as a target.
 *
 * So PRE is used here for exactly four things, none of which is "what the price should be":
 *   - proving row identity is intact (pricing_id, row for row)
 *   - detecting drift in fields this round is not allowed to touch
 *   - supplying the NUMBER FORMAT of each field, by field name, uncontaminated by the incident
 *   - showing the old intended value beside the new one, for diagnostics
 *
 * DO NOT DELETE THE PRE SNAPSHOTS. They remain the only rollback.
 *
 * ================================================================================================
 * THE SOURCE MAP IS DERIVED FROM CODE, NOT FROM THE TASK TEXT
 * ================================================================================================
 *
 * 04_marketplace_forecast_import.gs is the only thing that has ever written a base price, and it
 * writes them exactly once, at row creation, from sku_details (04_:376-379):
 *
 *     sku_details.selling_price   ->  pricing_list.base_regular_price
 *     sku_details.minimum_price   ->  pricing_list.base_minimum_price
 *     sku_details.msrp            ->  pricing_list.base_msrp
 *
 * That is the mapping this tool implements, and it is implemented BY READING 04_'s own constant
 * names rather than by trusting the three names above. base_currency is the one that does NOT
 * follow: 04_ takes it from the import row and defaults it to 'USD' (04_:376), never from
 * sku_details. sku_details.base_currency does exist — it is an editable enum on the SKU Details
 * page and the canonical read in operation-system-db-api.js:254 — so this round makes it the
 * authority for the first time. See PSF_BASE_CURRENCY_POLICY_ below for what happens when it is
 * blank, which is NOT "guess".
 *
 * ================================================================================================
 * THE JOIN TRAVELS ON THE ID, NOT ON THE SKU TEXT
 * ================================================================================================
 *
 *     pricing_list.marketplace_sku_id  ->  marketplace_skus.marketplace_sku_id
 *     marketplace_skus.sku             ->  sku_details.sku
 *
 * This is 72_api_v1_product_pricing_workspace.gs:1031-1034, the site-membership authority, and it
 * is deliberately not `pricing_list.sku -> sku_details.sku`. pricing_list carries a denormalised
 * `sku` copy and no `company` column at all (72_:27-30); marketplace_skus is the row that actually
 * knows which master SKU a priced site row belongs to. Joining on the local copy would work right
 * up until the two disagree, and then it would silently price the wrong product.
 *
 * AMBIGUITY IS NEVER RESOLVED BY PICKING ONE. 72_'s own index keeps the first row per sku, which is
 * fine for a read and unacceptable for a write: if two sku_details rows share a sku, or two
 * marketplace_skus rows share a marketplace_sku_id, this tool reports the identities and STOPS.
 *
 * ================================================================================================
 * A BLANK BASE PRICE IS DATA, NOT DAMAGE
 * ================================================================================================
 *
 * A SKU may legitimately have no base price — phasing out, SKU Details not filled in, deliberately
 * unmaintained. Blank source therefore produces blank target. It never produces 0, it never falls
 * back to the effective price, it never falls back to auto, and it never marks the row broken. 0 is
 * a price; blank is the absence of one, and the difference is the whole point.
 *
 * ================================================================================================
 * WHAT THIS DOES NOT DO
 * ================================================================================================
 *
 * No FX. No rate fetched, no auto_* recomputed, no effective price touched, no ownership flag
 * classified, no pricing_change_log row written, no price template uploaded, no deployment. The
 * three flag columns are CREATED BLANK, which is UNKNOWN — writing FALSE would declare the entire
 * price book system-owned without anyone being asked, and the next FX run would act on it.
 */

var PSF_PRICE_TAB_ = 'pricing_list';
var PSF_LOG_TAB_ = 'pricing_change_log';
var PSF_MSKU_TAB_ = 'marketplace_skus';
var PSF_SKU_TAB_ = 'sku_details';
var PSF_SNAP_PREFIX_ = 'PRE__pricing_list__';
var PSF_LOG_SNAP_PREFIX_ = 'PRE__pricing_change_log__';
var PSF_PREBASE_PREFIX_ = 'PREBASE__pricing_list__';
var PSF_LOCK_MS_ = 30000;

// §0 — the frozen base source map. `source` names are sku_details columns; `target` names are
// pricing_list columns. psfAssertSourceMap_ re-derives this from 04_'s own code at run time where
// 04_ is present, so a rename there cannot leave this list quietly wrong.
var PSF_BASE_MAP_ = [
  { target: 'base_regular_price', source: 'selling_price' },
  { target: 'base_minimum_price', source: 'minimum_price' },
  { target: 'base_msrp', source: 'msrp' }
];

// base_currency has its own contract. sku_details.base_currency is canonical when present. When it
// is BLANK the row's existing pricing_list.base_currency is LEFT ALONE and counted — not blanked,
// not defaulted to USD, not inferred from `currency`. Blanking it would disarm the FX reconciliation
// for that row (73_:810 reads it), and defaulting it would invent the denomination of a price.
var PSF_BASE_CURRENCY_SOURCE_ = 'base_currency';
var PSF_BASE_CURRENCY_POLICY_ = 'SOURCE_WINS_WHEN_PRESENT / PRESERVE_WHEN_SOURCE_BLANK / NEVER_INFER';
// Legacy per-field unit columns. operation-system-db-api.js:254 still reads them as a fallback for a
// blank base_currency. This tool does NOT apply that fallback — it counts how often it WOULD have
// mattered, so the decision to adopt it stays a decision.
var PSF_BASE_CURRENCY_LEGACY_ = ['selling_unit', 'minimum_price_unit', 'msrp_unit'];

// The state this round is authorised to start from. Not a description of the sheet — the shape the
// run refuses to begin without, so a sheet that has moved on cannot be rewritten to an old plan.
var PSF_EXPECT_LEGACY_ROW_COUNT_ = 495;
var PSF_EXPECT_LEGACY_COLUMN_COUNT_ = 29;
var PSF_EXPECT_EXTENSIONS_ = ['marketplace_id', 'company'];
var PSF_EXPECT_LOG_COLUMN_COUNT_ = 15;
var PSF_EXPECT_LOG_ROW_COUNT_ = 0;
var PSF_EXPECT_LOG_EXTENSIONS_ = ['sku', 'country', 'marketplace', 'old_currency', 'new_currency', 'source'];

// Every field the PRE sheet had, so "only base_msrp has drifted" is a claim about all of them.
var PSF_PRE_FIELDS_ = [
  'pricing_id', 'marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price',
  'base_minimum_price', 'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price',
  'auto_msrp', 'regular_price', 'minimum_price', 'msrp', 'price_source', 'price_status', 'created_by',
  'created_at', 'updated_by', 'updated_at', 'note'
];

// Fields this round must leave byte-identical. The dry run states each group separately rather than
// making the reader derive it from a single "only base_msrp differs" line.
var PSF_UNTOUCHED_GROUPS_ = [
  ['FX_VALUES', ['fx_rate', 'fx_rate_date', 'currency']],
  ['AUTO_VALUES', ['auto_regular_price', 'auto_minimum_price', 'auto_msrp']],
  ['EFFECTIVE_VALUES', ['regular_price', 'minimum_price', 'msrp']],
  ['IDENTITY_VALUES', ['pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'site_sku',
    'marketplace_product_id']],
  ['METADATA_VALUES', ['price_source', 'price_status', 'created_by', 'created_at', 'updated_by',
    'updated_at', 'note']],
  ['EXTENSION_VALUES', ['marketplace_id', 'company']]
];

// Fields that must read back as a number or blank, never a Date. base_msrp is on this list because
// it is what this incident produced; the rest are on it because the same mechanism could reach them.
var PSF_NUMERIC_FIELDS_ = ['base_regular_price', 'base_minimum_price', 'base_msrp', 'fx_rate',
  'auto_regular_price', 'auto_minimum_price', 'auto_msrp', 'regular_price', 'minimum_price', 'msrp'];
var PSF_DATE_FIELDS_ = ['fx_rate_date', 'created_at', 'updated_at'];
var PSF_NUMERIC_FMT_ = '0.00';
var PSF_TEXT_FMT_ = '@';

// AN UNMATCHED ROW IS PRESERVED. It has no SKU Details source, so this round has nothing to say about
// its base prices and says nothing: every base_* and base_currency keeps exactly the value it has, the
// identity is reported, and the row does not hold up the rows that DID resolve. There is deliberately no
// flag that would let this be turned into blanking — a switch whose only setting is destructive is a
// switch that will eventually be flipped by someone who did not read this comment.
var PSF_UNMATCHED_BASE_POLICY_ = 'PRESERVE_CURRENT_AND_REPORT';

// Paste from the DRY RUN before COMMIT.
var PSF_EXPECT_LIVE_HEADER_HASH_ = '';
var PSF_EXPECT_ROW_COUNT_ = -1;
var PSF_EXPECT_TARGET_HASH_ = '';

function psfStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function psfLower_(v) { return psfStr_(v).toLowerCase(); }
function psfBlank_(v) { return psfStr_(v) === ''; }

function psfSha_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  var h = '';
  for (var i = 0; i < b.length; i++) {
    var v = (b[i] < 0 ? b[i] + 256 : b[i]).toString(16);
    h += v.length === 1 ? '0' + v : v;
  }
  return h;
}

function psfIndex_(header) { var m = {}; header.forEach(function (h, i) { m[h] = i; }); return m; }

function psfKind_(v) {
  if (v === '' || v === null || v === undefined) return 'blank';
  if (v instanceof Date) return 'Date';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

/** The serial a cell would have as a number, whatever type it is wearing. Diagnostics only. */
function psfSerial_(v) {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return (v.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  var f = parseFloat(v);
  return isNaN(f) ? null : f;
}

/**
 * Read a SOURCE price. Three outcomes and no fourth, because every fourth one invents money:
 *   { blank: true }              the source says nothing. The target says nothing.
 *   { value: <number> }          a usable price.
 *   { invalid: true, raw: ... }  present but not a number — including a Date, which is what a
 *                                price looks like after this incident and must never be copied on.
 */
function psfReadSourcePrice_(v) {
  if (v === '' || v === null || v === undefined) return { blank: true };
  if (v instanceof Date) return { invalid: true, raw: v, why: 'Date' };
  if (typeof v === 'number') return isFinite(v) ? { value: v } : { invalid: true, raw: v, why: 'not finite' };
  var s = psfStr_(v);
  if (s === '') return { blank: true };
  var n = Number(s.replace(/[$,\s]/g, ''));
  if (s.replace(/[$,\s]/g, '') === '' || isNaN(n) || !isFinite(n)) {
    return { invalid: true, raw: v, why: 'not numeric' };
  }
  return { value: n };
}

function psfIsDateFormat_(f) {
  var s = psfStr_(f);
  if (s === '' || s === PSF_TEXT_FMT_) return false;
  if (/^[0#.,$%\s]+$/.test(s)) return false;
  return /y{2,}|d{1,2}\/|m{1,2}\/|dd|mmm/.test(s);
}

/** A stable digest of the whole grid over the named fields, keyed by pricing_id. */
function psfLogicalHash_(header, grid, fields) {
  var idx = psfIndex_(header);
  var f = fields.slice().sort();
  var idCol = idx['pricing_id'];
  var lines = [];
  for (var r = 1; r < grid.length; r++) {
    var parts = [];
    for (var i = 0; i < f.length; i++) {
      var c = idx[f[i]];
      parts.push(f[i] + '|~|' + (c === undefined ? '' : psfStr_(grid[r][c])));
    }
    lines.push(psfStr_(idCol === undefined ? '' : grid[r][idCol]) + '|#|' + parts.join('|#|'));
  }
  return psfSha_(lines.join('\n'));
}

/**
 * Re-derive the base source map from 04_'s own source where 04_ is loaded, instead of trusting the
 * three pairs written at the top of this file. The import assigns sdRef.sellingPrice into baseRegular
 * and so on; if those names are ever changed, this notices instead of this tool writing the wrong
 * column full of the right numbers. Returns a list of complaints — empty means agreed.
 */
function psfAssertSourceMap_() {
  var problems = [];
  if (typeof handleImportMarketplaceSkusBatch_ !== 'function') {
    problems.push('04_marketplace_forecast_import.gs is not loaded — the source map could not be ' +
      're-derived from code and is being taken on trust.');
    return problems;
  }
  var src = String(handleImportMarketplaceSkusBatch_);
  var EXPECT = [
    { local: 'sellingPrice', target: 'base_regular_price', source: 'selling_price' },
    { local: 'minimumPrice', target: 'base_minimum_price', source: 'minimum_price' },
    { local: 'msrp', target: 'base_msrp', source: 'msrp' }
  ];
  EXPECT.forEach(function (e) {
    if (src.indexOf("indexOf('" + e.source + "')") === -1) {
      problems.push('04_ no longer reads sku_details.' + e.source);
    }
    if (src.indexOf('sdRef.' + e.local) === -1) {
      problems.push('04_ no longer carries ' + e.local + ' from sku_details');
    }
    if (src.indexOf("prCol('" + e.target + "')") === -1) {
      problems.push('04_ no longer writes pricing_list.' + e.target);
    }
  });
  return problems;
}

/**
 * §3 — resolve every pricing_list row to exactly one sku_details row, or to an explicit non-answer.
 * Nothing here picks a winner among candidates; a duplicate on either hop is reported as ambiguous
 * and the run stops on it.
 */
function psfResolveJoin_(P, pIdx, M, mIdx, D, dIdx) {
  var mById = {}, mDupIds = {};
  for (var i = 1; i < M.values.length; i++) {
    var id = psfStr_(M.values[i][mIdx['marketplace_sku_id']]);
    if (id === '') continue;
    if (mById[id]) { mDupIds[id] = (mDupIds[id] || 1) + 1; } else { mById[id] = M.values[i]; }
  }
  var dBySku = {}, dDupSkus = {};
  for (var j = 1; j < D.values.length; j++) {
    var sk = psfLower_(D.values[j][dIdx['sku']]);
    if (sk === '') continue;
    if (dBySku[sk]) { dDupSkus[sk] = (dDupSkus[sk] || 1) + 1; } else { dBySku[sk] = D.values[j]; }
  }

  var rows = [];
  for (var r = 1; r < P.values.length; r++) {
    var mskuId = psfStr_(P.values[r][pIdx['marketplace_sku_id']]);
    var localSku = pIdx['sku'] === undefined ? '' : psfStr_(P.values[r][pIdx['sku']]);
    var rec = {
      row: r, pricing_id: psfStr_(P.values[r][pIdx['pricing_id']]),
      marketplace_sku_id: mskuId, local_sku: localSku,
      master_sku: '', status: '', source: null, sku_disagrees: false
    };
    if (mskuId === '') { rec.status = 'NO_IDENTITY'; rows.push(rec); continue; }
    if (mDupIds[mskuId]) { rec.status = 'AMBIGUOUS_MARKETPLACE_SKU'; rows.push(rec); continue; }
    var mrow = mById[mskuId];
    if (!mrow) { rec.status = 'NO_MARKETPLACE_SKU'; rows.push(rec); continue; }
    rec.master_sku = psfStr_(mrow[mIdx['sku']]);
    // The denormalised copy is not used to join, but a disagreement is worth surfacing: it means one
    // of the two tables is wrong about which product this row prices.
    rec.sku_disagrees = localSku !== '' && rec.master_sku !== '' && psfLower_(localSku) !== psfLower_(rec.master_sku);
    if (rec.master_sku === '') { rec.status = 'NO_MASTER_SKU'; rows.push(rec); continue; }
    var key = psfLower_(rec.master_sku);
    if (dDupSkus[key]) { rec.status = 'AMBIGUOUS_SKU_DETAILS'; rows.push(rec); continue; }
    var drow = dBySku[key];
    if (!drow) { rec.status = 'NO_SKU_DETAILS'; rows.push(rec); continue; }
    rec.status = 'MATCHED'; rec.source = drow;
    rows.push(rec);
  }
  return { rows: rows, dupMarketplaceSkuIds: Object.keys(mDupIds), dupSkuDetails: Object.keys(dDupSkus) };
}

function TEMP_PRICING_R2_BASE_SOURCE_FINAL_DRY_RUN() { return psfRun_(false); }
function TEMP_PRICING_R2_BASE_SOURCE_FINAL_COMMIT() { return psfRun_(true); }

function psfRun_(commit) {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  p('TEMP PRICING-R2 BASE SOURCE RECONCILIATION AND SCHEMA FINAL — ' + (commit ? 'COMMIT' : 'DRY RUN'));
  p('generated_at (script clock): ' + new Date().toISOString());
  p('BASE_PRICE_SOURCE = sku_details.  PRE snapshots are forensic evidence only and are never deleted.');
  rule();

  if (typeof PRICING_LIST_HEADERS_ === 'undefined' || typeof PRICING_MANUAL_FLAG_COLUMNS_ === 'undefined'
      || typeof PRICING_CHANGE_LOG_HEADERS_ === 'undefined') {
    p('AUTHORITY_NOT_LOADED — 73_api_v1_pricing_write.gs is not in this project. Sync it and SAVE first.');
    p('BLOCKED'); return done();
  }
  var CANON = PRICING_LIST_HEADERS_.slice();
  var FLAGS = PRICING_MANUAL_FLAG_COLUMNS_.slice();
  var LOGCANON = PRICING_CHANGE_LOG_HEADERS_.slice();
  p('authority 73_ build: ' + (typeof PRW_BUILD_VERSION_ === 'string' ? PRW_BUILD_VERSION_ : '(unknown)'));

  var mapProblems = psfAssertSourceMap_();
  p('SOURCE_MAP re-derived from 04_marketplace_forecast_import.gs: '
    + (mapProblems.length ? 'DISAGREES' : 'AGREES'));
  mapProblems.forEach(function (m) { p('  ! ' + m); });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function need(name) {
    var s = ss.getSheetByName(name);
    if (!s) { p('BLOCKED — ' + name + ' is not present.'); return null; }
    return s;
  }
  var sh = need(PSF_PRICE_TAB_); if (!sh) return done();
  var msh = need(PSF_MSKU_TAB_); if (!msh) return done();
  var dsh = need(PSF_SKU_TAB_); if (!dsh) return done();

  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var snaps = names.filter(function (n) { return n.indexOf(PSF_SNAP_PREFIX_) === 0; }).sort();
  if (!snaps.length) {
    p('BLOCKED — no ' + PSF_SNAP_PREFIX_ + '* snapshot. It is not the price source any more, but it is');
    p('still the only way to prove row identity is intact and that nothing outside base_msrp has moved.');
    return done();
  }
  var snapName = snaps[snaps.length - 1];
  var snap = ss.getSheetByName(snapName);
  var logSnapPresent = names.filter(function (n) { return n.indexOf(PSF_LOG_SNAP_PREFIX_) === 0; }).length > 0;

  function readSheet(sheet) {
    var r = sheet.getLastRow(), c = sheet.getLastColumn();
    if (r < 1 || c < 1) return { values: [[]], formats: [[]], header: [] };
    var rg = sheet.getRange(1, 1, r, c);
    return { values: rg.getValues(), formats: rg.getNumberFormats(),
      header: sheet.getRange(1, 1, 1, c).getValues()[0].map(psfStr_) };
  }
  var L = readSheet(sh), S = readSheet(snap), M = readSheet(msh), D = readSheet(dsh);
  var lIdx = psfIndex_(L.header), sIdx = psfIndex_(S.header);
  var mIdx = psfIndex_(M.header), dIdx = psfIndex_(D.header);
  var rowCount = L.values.length - 1;
  var liveHeaderHash = psfSha_(L.header.join('|#|'));

  rule();
  p('LIVE     ' + PSF_PRICE_TAB_ + '   rows ' + rowCount + '   columns ' + L.header.length);
  p('SNAPSHOT ' + snapName + '   rows ' + (S.values.length - 1) + '   columns ' + S.header.length);
  p('SOURCE   ' + PSF_SKU_TAB_ + '   rows ' + (D.values.length - 1) + '   columns ' + D.header.length);
  p('BRIDGE   ' + PSF_MSKU_TAB_ + '   rows ' + (M.values.length - 1) + '   columns ' + M.header.length);
  p('LIVE_HEADER_HASH = ' + liveHeaderHash);

  // ---- REQUIRED SOURCE COLUMNS -----------------------------------------------------------------------------
  var missingSrc = [];
  ['sku'].forEach(function (h) { if (dIdx[h] === undefined) missingSrc.push(PSF_SKU_TAB_ + '.' + h); });
  PSF_BASE_MAP_.forEach(function (m) {
    if (dIdx[m.source] === undefined) missingSrc.push(PSF_SKU_TAB_ + '.' + m.source);
  });
  ['marketplace_sku_id', 'sku'].forEach(function (h) {
    if (mIdx[h] === undefined) missingSrc.push(PSF_MSKU_TAB_ + '.' + h);
  });
  ['pricing_id', 'marketplace_sku_id'].forEach(function (h) {
    if (lIdx[h] === undefined) missingSrc.push(PSF_PRICE_TAB_ + '.' + h);
  });
  if (missingSrc.length) {
    p('BLOCKED — required source column(s) absent: ' + missingSrc.join(', '));
    p('This tool never provisions a column and never substitutes a different one.');
    return done();
  }
  var haveSrcCurrency = dIdx[PSF_BASE_CURRENCY_SOURCE_] !== undefined;
  p('SOURCE base_currency column present in ' + PSF_SKU_TAB_ + ': ' + (haveSrcCurrency ? 'YES' : 'NO'));

  // =========================================================================================================
  // PHASE 1 PROOF — the state this round is authorised to start from.
  // =========================================================================================================
  rule();
  p('PHASE 1 PROOF');
  var proof = [];
  function prove(label, cond, detail) { proof.push({ label: label, ok: !!cond, detail: detail }); }

  prove('pricing_list ROW_COUNT == ' + PSF_EXPECT_LEGACY_ROW_COUNT_,
    rowCount === PSF_EXPECT_LEGACY_ROW_COUNT_, String(rowCount));
  prove('pricing_list is the legacy ' + PSF_EXPECT_LEGACY_COLUMN_COUNT_ + '-column layout',
    L.header.length === PSF_EXPECT_LEGACY_COLUMN_COUNT_, String(L.header.length));
  prove('the three authority flags are NOT present yet',
    FLAGS.every(function (f) { return L.header.indexOf(f) === -1; }),
    FLAGS.filter(function (f) { return L.header.indexOf(f) !== -1; }).join(',') || 'none present');
  prove('live header matches the PRE snapshot header exactly',
    L.header.length === S.header.length && L.header.every(function (h, i) { return h === S.header[i]; }));

  var canonSet = {}; CANON.forEach(function (h) { canonSet[h] = 1; });
  var extensions = L.header.filter(function (h) { return h !== '' && !canonSet[h]; });
  prove('extensions are exactly ' + PSF_EXPECT_EXTENSIONS_.join(', '),
    extensions.length === PSF_EXPECT_EXTENSIONS_.length
      && extensions.every(function (h, i) { return h === PSF_EXPECT_EXTENSIONS_[i]; }),
    extensions.join(',') || '(none)');
  prove('the base source map agrees with 04_', mapProblems.length === 0, String(mapProblems.length) + ' complaint(s)');

  // pricing_change_log — already migrated, and read-only for the whole of this round.
  var logSh = ss.getSheetByName(PSF_LOG_TAB_);
  var logHead = [];
  if (!logSh) {
    prove('pricing_change_log is present', false, 'absent');
  } else {
    logHead = logSh.getLastColumn() ? logSh.getRange(1, 1, 1, logSh.getLastColumn()).getValues()[0].map(psfStr_) : [];
    var logRows = logSh.getLastRow() - 1;
    var logExt = logHead.slice(LOGCANON.length);
    prove('pricing_change_log COLUMN_COUNT == ' + PSF_EXPECT_LOG_COLUMN_COUNT_,
      logHead.length === PSF_EXPECT_LOG_COLUMN_COUNT_, String(logHead.length));
    prove('pricing_change_log canonical positions 1..' + LOGCANON.length + ' EXACT',
      LOGCANON.every(function (h, i) { return logHead[i] === h; }), logHead.slice(0, LOGCANON.length).join(','));
    prove('pricing_change_log PK is log_id at position 1', logHead[0] === 'log_id', String(logHead[0]));
    prove('pricing_change_log extensions exact and in order',
      logExt.length === PSF_EXPECT_LOG_EXTENSIONS_.length
        && PSF_EXPECT_LOG_EXTENSIONS_.every(function (h, i) { return logExt[i] === h; }), logExt.join(','));
    prove('pricing_change_log ROW_COUNT == ' + PSF_EXPECT_LOG_ROW_COUNT_,
      logRows === PSF_EXPECT_LOG_ROW_COUNT_, String(logRows));
  }
  prove('PRE pricing_list snapshot present', true, snapName);
  prove('PRE pricing_change_log snapshot present', logSnapPresent);

  // Row identity, and the drift census. The census is what makes "this round changed only the base
  // fields" checkable afterwards rather than asserted now.
  var misaligned = 0, firstMis = -1;
  if ((S.values.length - 1) !== rowCount) {
    prove('PRE snapshot has the same row count', false, (S.values.length - 1) + ' vs ' + rowCount);
  } else {
    prove('PRE snapshot has the same row count', true, String(rowCount));
    for (var r0 = 1; r0 <= rowCount; r0++) {
      if (psfStr_(L.values[r0][lIdx['pricing_id']]) !== psfStr_(S.values[r0][sIdx['pricing_id']])) {
        misaligned++; if (firstMis === -1) firstMis = r0 + 1;
      }
    }
    prove('pricing_id identity matches PRE row for row', misaligned === 0,
      misaligned ? misaligned + ' differ, first at row ' + firstMis : String(rowCount) + ' rows');
  }

  var seenPid = {}, dupPid = [];
  for (var rp = 1; rp <= rowCount; rp++) {
    var pid = psfStr_(L.values[rp][lIdx['pricing_id']]);
    if (pid === '') { if (dupPid.indexOf('(blank)') === -1) dupPid.push('(blank)'); continue; }
    if (seenPid[pid]) { if (dupPid.indexOf(pid) === -1) dupPid.push(pid); } else { seenPid[pid] = 1; }
  }
  prove('pricing_id is unique across pricing_list', dupPid.length === 0,
    dupPid.slice(0, 10).join(',') || String(rowCount) + ' distinct');

  var differing = [];
  if (misaligned === 0 && (S.values.length - 1) === rowCount) {
    PSF_PRE_FIELDS_.forEach(function (f) {
      if (lIdx[f] === undefined || sIdx[f] === undefined) return;
      for (var rr = 1; rr <= rowCount; rr++) {
        if (psfStr_(L.values[rr][lIdx[f]]) !== psfStr_(S.values[rr][sIdx[f]])) { differing.push(f); return; }
      }
    });
  }
  // What must hold is not that base_msrp HAS drifted — an undamaged sheet has drifted in nothing, and
  // this round syncs base prices whether or not the incident ever happened. What must hold is that
  // nothing OUTSIDE base_msrp has moved since PRE.
  var unexpectedDrift = differing.filter(function (f) { return f !== 'base_msrp'; });
  prove('no field OTHER than base_msrp has drifted from PRE', unexpectedDrift.length === 0,
    unexpectedDrift.join(',') || (differing.length ? 'base_msrp only' : '(none differ)'));

  PSF_UNTOUCHED_GROUPS_.forEach(function (grp) {
    var moved = grp[1].filter(function (f) { return differing.indexOf(f) !== -1; });
    prove(grp[0] + '_UNCHANGED_SINCE_PRE', moved.length === 0, moved.join(',') || '');
  });

  // The incident, measured rather than assumed.
  var dateMsrpPre = 0, blankMsrpPre = 0;
  if (lIdx['base_msrp'] !== undefined) {
    for (var rm = 1; rm <= rowCount; rm++) {
      var vm2 = L.values[rm][lIdx['base_msrp']];
      if (vm2 instanceof Date) dateMsrpPre++;
      else if (psfBlank_(vm2)) blankMsrpPre++;
    }
  }
  p('  BASE_MSRP_DATE_VALUE_COUNT_PRE = ' + dateMsrpPre + '   blank = ' + blankMsrpPre
    + '   other = ' + (rowCount - dateMsrpPre - blankMsrpPre));

  var proofOk = true;
  proof.forEach(function (c) {
    if (!c.ok) proofOk = false;
    p('  ' + (c.ok ? 'PASS  ' : 'FAIL  ') + c.label + (c.detail ? '   [' + c.detail + ']' : ''));
  });
  if (!proofOk) {
    p('');
    p('BLOCKED — the sheet is not in the state this round is authorised to start from. Nothing is written.');
    p('BASE_SOURCE_FINAL_DRY_RUN = NO-GO');
    return done();
  }

  // =========================================================================================================
  // §3 JOIN AUDIT
  // =========================================================================================================
  rule();
  p('§3 JOIN AUDIT');
  p('BASE_PRICE_SOURCE_TABLE = ' + PSF_SKU_TAB_);
  p('BASE_PRICE_SOURCE_IDENTITY = ' + PSF_SKU_TAB_ + '.sku (master SKU)');
  p('PRICING_TO_SKU_DETAILS_JOIN = pricing_list.marketplace_sku_id -> marketplace_skus.marketplace_sku_id'
    + ' -> marketplace_skus.sku -> sku_details.sku');
  p('  (72_api_v1_product_pricing_workspace.gs:1031-1034. NOT pricing_list.sku, which is a denormalised copy.)');

  var J = psfResolveJoin_(L, lIdx, M, mIdx, D, dIdx);
  var byStatus = {};
  J.rows.forEach(function (rec) { byStatus[rec.status] = (byStatus[rec.status] || 0) + 1; });
  var matched = byStatus['MATCHED'] || 0;
  var ambiguous = (byStatus['AMBIGUOUS_MARKETPLACE_SKU'] || 0) + (byStatus['AMBIGUOUS_SKU_DETAILS'] || 0);
  var noIdentity = byStatus['NO_IDENTITY'] || 0;
  var unmatched = rowCount - matched - ambiguous - noIdentity;

  p('SKU_DETAILS_MATCHED = ' + matched);
  p('SKU_DETAILS_UNMATCHED = ' + unmatched);
  p('JOIN_AMBIGUITY_COUNT = ' + ambiguous);
  p('UNMATCHED_PRICING_ROWS = ' + (unmatched + noIdentity + ambiguous) + '   (every row that is not MATCHED)');
  Object.keys(byStatus).sort().forEach(function (k) { p('  ' + k + ' = ' + byStatus[k]); });

  var disagree = J.rows.filter(function (rec) { return rec.sku_disagrees; });
  p('LOCAL_SKU_DISAGREES_WITH_MASTER = ' + disagree.length
    + '   (reported, never used — the join travels on the id)');
  disagree.slice(0, 10).forEach(function (rec) {
    p('    row ' + (rec.row + 1) + ' | ' + rec.pricing_id + ' | pricing_list.sku=' + rec.local_sku
      + ' | marketplace_skus.sku=' + rec.master_sku);
  });

  function offenders(label, statuses, limit) {
    var hits = J.rows.filter(function (rec) { return statuses.indexOf(rec.status) !== -1; });
    if (!hits.length) return;
    p('  ' + label + ' (' + hits.length + ')');
    p('    row | pricing_id | marketplace_sku_id | master sku | status');
    hits.slice(0, limit).forEach(function (rec) {
      p('    ' + (rec.row + 1) + ' | ' + rec.pricing_id + ' | ' + (rec.marketplace_sku_id || '(blank)')
        + ' | ' + (rec.master_sku || '(none)') + ' | ' + rec.status);
    });
    if (hits.length > limit) p('    ... and ' + (hits.length - limit) + ' more');
  }
  offenders('AMBIGUOUS — more than one source row shares this identity',
    ['AMBIGUOUS_MARKETPLACE_SKU', 'AMBIGUOUS_SKU_DETAILS'], 40);
  offenders('NO IDENTITY — the row cannot be joined at all', ['NO_IDENTITY'], 40);
  offenders('UNMATCHED — joined, but no SKU Details row', ['NO_MARKETPLACE_SKU', 'NO_MASTER_SKU', 'NO_SKU_DETAILS'], 40);

  // §9 blocks on ambiguity and on a missing join identity; UNMATCHED alone is not a block.
  var blockers = [];
  if (ambiguous > 0) {
    blockers.push('JOIN_AMBIGUITY_COUNT = ' + ambiguous + '. A duplicate source identity is never resolved '
      + 'by picking one: duplicated ids = ' + J.dupMarketplaceSkuIds.slice(0, 10).join(',')
      + ' ; duplicated sku_details skus = ' + J.dupSkuDetails.slice(0, 10).join(','));
  }
  if (noIdentity > 0) {
    blockers.push('NO_IDENTITY = ' + noIdentity + '. A pricing_list row with a blank marketplace_sku_id '
      + 'cannot be joined to anything, and a 32-column rewrite would fix the layout while leaving the row '
      + 'unattached to a product.');
  }

  // =========================================================================================================
  // §4 BASE SYNC PLAN — counts, and the per-field decision behind each one.
  // =========================================================================================================
  rule();
  p('§4 BASE PRICE SYNC PLAN');
  p('BLANK_BASE_PRICE_ALLOWED = YES   blank source -> blank target. Never 0, never effective, never auto.');
  p('BASE_CURRENCY_POLICY = ' + PSF_BASE_CURRENCY_POLICY_);

  var plan = [];                       // per pricing_list row: { base_regular_price: {...}, ... }
  var count = {};
  function bump(k) { count[k] = (count[k] || 0) + 1; }
  var invalids = [];
  var preservedUnmatched = [];        // { rec, field, current } for every value left exactly as found
  var legacyUnitRescuable = 0;

  J.rows.forEach(function (rec) {
    var cell = {};
    PSF_BASE_MAP_.forEach(function (m) {
      var tgt = m.target;
      var currentRaw = lIdx[tgt] === undefined ? '' : L.values[rec.row][lIdx[tgt]];
      if (rec.status !== 'MATCHED') {
        // No source, so nothing to say. The cell keeps exactly what it holds, including its type: this
        // round does not get to decide that a row nobody can identify has no price.
        cell[tgt] = { value: currentRaw, from: 'PRESERVED_UNMATCHED' };
        if (!psfBlank_(currentRaw)) preservedUnmatched.push({ rec: rec, field: tgt, current: currentRaw });
        return;
      }
      var read = psfReadSourcePrice_(rec.source[dIdx[m.source]]);
      if (read.blank) {
        cell[tgt] = { value: '', from: 'SOURCE_BLANK' };
        bump(tgt + '_WOULD_BLANK'); bump('MATCHED_' + tgt + '_BLANK');
      } else if (read.invalid) {
        cell[tgt] = { value: '', from: 'SOURCE_INVALID' };
        invalids.push({ rec: rec, field: tgt, source: m.source, raw: read.raw, why: read.why });
      } else {
        cell[tgt] = { value: read.value, from: 'SOURCE' };
        bump(tgt + '_WOULD_UPDATE'); bump('MATCHED_' + tgt + '_NONBLANK');
      }
    });

    // base_currency.
    var curNow = lIdx['base_currency'] === undefined ? '' : psfStr_(L.values[rec.row][lIdx['base_currency']]);
    var curSrc = (rec.status === 'MATCHED' && haveSrcCurrency)
      ? psfStr_(rec.source[dIdx[PSF_BASE_CURRENCY_SOURCE_]]) : '';
    var curRaw = lIdx['base_currency'] === undefined ? '' : L.values[rec.row][lIdx['base_currency']];
    if (curSrc !== '') {
      cell['base_currency'] = { value: curSrc, from: 'SOURCE' };
      bump('BASE_CURRENCY_SOURCE_NONBLANK');
      if (curSrc !== curNow) bump('BASE_CURRENCY_WOULD_UPDATE');
    } else {
      // A blank base_currency is NOT the same kind of fact as a blank price. A blank price is a valid
      // commercial state; a blank base_currency would disable the FX relationship for the row, which is a
      // data-quality condition and a separate conversation. Either way it is preserved, never blanked.
      cell['base_currency'] = { value: curRaw, from: 'PRESERVED' };
      if (rec.status === 'MATCHED') {
        bump('BASE_CURRENCY_SOURCE_BLANK');
        if (!psfBlank_(curRaw)) bump('BASE_CURRENCY_PRESERVED_DUE_TO_BLANK_SOURCE');
        if (rec.source) {
          var rescuable = PSF_BASE_CURRENCY_LEGACY_.some(function (h) {
            return dIdx[h] !== undefined && !psfBlank_(rec.source[dIdx[h]]);
          });
          if (rescuable) legacyUnitRescuable++;
        }
      } else if (!psfBlank_(curRaw)) {
        preservedUnmatched.push({ rec: rec, field: 'base_currency', current: curRaw });
      }
    }
    plan[rec.row] = cell;
  });

  PSF_BASE_MAP_.forEach(function (m) {
    p((m.target + '_WOULD_UPDATE').toUpperCase() + ' = ' + (count[m.target + '_WOULD_UPDATE'] || 0)
      + '    <- ' + PSF_SKU_TAB_ + '.' + m.source);
    p((m.target + '_WOULD_BLANK').toUpperCase() + ' = ' + (count[m.target + '_WOULD_BLANK'] || 0));
  });

  // The matched census, per field, blank beside nonblank — because 'WOULD_BLANK' alone cannot be read
  // back as 'the source said nothing' rather than 'something went wrong'.
  PSF_BASE_MAP_.forEach(function (m) {
    var key = m.target.replace('base_', '').replace('_price', '').toUpperCase();
    p('MATCHED_BASE_' + key + '_NONBLANK = ' + (count['MATCHED_' + m.target + '_NONBLANK'] || 0)
      + '    MATCHED_BASE_' + key + '_BLANK = ' + (count['MATCHED_' + m.target + '_BLANK'] || 0));
  });

  p('BASE_CURRENCY_SOURCE_NONBLANK = ' + (count['BASE_CURRENCY_SOURCE_NONBLANK'] || 0));
  p('BASE_CURRENCY_SOURCE_BLANK = ' + (count['BASE_CURRENCY_SOURCE_BLANK'] || 0));
  p('BASE_CURRENCY_PRESERVED_DUE_TO_BLANK_SOURCE = '
    + (count['BASE_CURRENCY_PRESERVED_DUE_TO_BLANK_SOURCE'] || 0)
    + '   (left exactly as they are; NOT blanked, NOT defaulted)');
  p('BASE_CURRENCY_WOULD_UPDATE = ' + (count['BASE_CURRENCY_WOULD_UPDATE'] || 0));
  p('BASE_CURRENCY_LEGACY_UNIT_AVAILABLE = ' + legacyUnitRescuable
    + '   (' + PSF_BASE_CURRENCY_LEGACY_.join('/') + ' holds a value where base_currency is blank —');
  p('   operation-system-db-api.js:254 reads that fallback; this tool does NOT apply it. Adopting it is a decision.)');
  if ((count['BASE_CURRENCY_WOULD_UPDATE'] || 0) > 0) {
    p('  NOTE: a changed base_currency makes that row\'s auto_* stale until the FX round runs. This round');
    p('  does not recompute auto_*, by instruction, and the staleness is visible rather than hidden.');
  }

  if (invalids.length) {
    p('');
    p('INVALID NONBLANK SOURCE VALUES (' + invalids.length + ') — a price that is present but is not a number.');
    p('  row | pricing_id | master sku | target field | sku_details column | raw | type | why');
    invalids.slice(0, 40).forEach(function (x) {
      p('  ' + (x.rec.row + 1) + ' | ' + x.rec.pricing_id + ' | ' + x.rec.master_sku + ' | ' + x.field
        + ' | ' + PSF_SKU_TAB_ + '.' + x.source
        + ' | ' + JSON.stringify(x.raw instanceof Date ? x.raw.toISOString() : x.raw)
        + ' | ' + psfKind_(x.raw) + ' | ' + x.why);
    });
    if (invalids.length > 40) p('  ... and ' + (invalids.length - 40) + ' more');
    blockers.push('INVALID_NONBLANK_SOURCE = ' + invalids.length + '. Blanking these would destroy a price '
      + 'someone entered; copying them would put a non-number in a price column. Fix them in SKU Details.');
  }

  // UNMATCHED — reported, never gated. An unmatched row is a row nobody can identify; that is a reason to
  // leave it alone and say so, not a reason to hold up every row that DID resolve.
  p('');
  p('UNMATCHED_BASE_POLICY = ' + PSF_UNMATCHED_BASE_POLICY_);
  var unmatchedRows = J.rows.filter(function (rec) { return rec.status !== 'MATCHED'; });
  p('UNMATCHED_ROWS_PRESERVED = ' + unmatchedRows.length);
  p('UNMATCHED_BASE_VALUES_PRESERVED_NONBLANK = ' + preservedUnmatched.length);
  if (preservedUnmatched.length) {
    p('  row | pricing_id | marketplace_sku_id | field | value kept | type | status');
    preservedUnmatched.slice(0, 40).forEach(function (x) {
      p('  ' + (x.rec.row + 1) + ' | ' + x.rec.pricing_id + ' | ' + (x.rec.marketplace_sku_id || '(blank)')
        + ' | ' + x.field + ' | ' + JSON.stringify(x.current instanceof Date ? x.current.toISOString() : x.current)
        + ' | ' + psfKind_(x.current) + ' | ' + x.rec.status);
    });
    if (preservedUnmatched.length > 40) p('  ... and ' + (preservedUnmatched.length - 40) + ' more');
  }

  // AND THE CONSEQUENCE, STATED RATHER THAN DISCOVERED. Preserving a base_msrp that is currently a Date
  // preserves the Date. The quantity is intact — Sheets' epoch makes serial 35 read as 1900-02-03 — but
  // every consumer of getValues() still receives a Date where a price belongs, and this round has no
  // authority to change that on a row it cannot identify. Giving these SKUs a sku_details row and
  // re-running is what clears them.
  var unmatchedDates = preservedUnmatched.filter(function (x) { return x.current instanceof Date; });
  p('UNMATCHED_ROWS_STILL_HOLDING_A_DATE_BASE_VALUE = ' + unmatchedDates.length);
  if (unmatchedDates.length) {
    p('  These rows keep the incident. The quantity is intact but the TYPE is not, and no repair here is');
    p('  authorised to touch a row with no identified source. Their serials, from PRE, are:');
    unmatchedDates.slice(0, 40).forEach(function (x) {
      var pre = sIdx[x.field] === undefined ? '' : S.values[x.rec.row][sIdx[x.field]];
      p('  ' + x.rec.pricing_id + ' | ' + x.field + ' | serial ' + psfSerial_(x.current)
        + ' | PRE ' + JSON.stringify(pre instanceof Date ? pre.toISOString() : pre));
    });
  }

  // =========================================================================================================
  // §6 TARGET LAYOUT and §7 FORMATS BY FIELD NAME
  // =========================================================================================================
  var missingNonFlag = CANON.filter(function (h) { return L.header.indexOf(h) === -1 && FLAGS.indexOf(h) === -1; });
  if (missingNonFlag.length) {
    p('BLOCKED — canonical column(s) absent that this tool does not provision: ' + missingNonFlag.join(', '));
    return done();
  }
  var target = CANON.concat(extensions);
  rule();
  p('§6 TARGET LAYOUT');
  p('TARGET_PRICING_LIST_COLUMNS = ' + target.length + '   = canonical ' + CANON.length
    + ' + ' + extensions.length + ' extension(s)');
  p('  ' + target.join(', '));
  p('MANUAL_FLAG_INITIALIZATION = UNKNOWN_BLANK for all ' + rowCount + ' rows (format @). Never FALSE.');

  // A field's format is decided by the FIELD, taken from PRE by name, and then overruled where PRE's own
  // format would contradict the field's type. That second step is what makes the guarantee independent of
  // the snapshot: a numeric field never receives a date format from anywhere.
  function formatFor(name, rr) {
    var fromPre = (sIdx[name] !== undefined) ? S.formats[rr][sIdx[name]]
      : (lIdx[name] !== undefined ? L.formats[rr][lIdx[name]] : PSF_TEXT_FMT_);
    if (PSF_NUMERIC_FIELDS_.indexOf(name) !== -1) {
      return psfIsDateFormat_(fromPre) || psfStr_(fromPre) === '' ? PSF_NUMERIC_FMT_ : fromPre;
    }
    if (PSF_DATE_FIELDS_.indexOf(name) !== -1) return fromPre;
    if (FLAGS.indexOf(name) !== -1) return PSF_TEXT_FMT_;
    return fromPre;
  }

  var projected = [target.slice()];
  var formats = [target.map(function () { return PSF_TEXT_FMT_; })];
  var baseTargets = {}; PSF_BASE_MAP_.forEach(function (m) { baseTargets[m.target] = 1; });
  for (var rr2 = 1; rr2 <= rowCount; rr2++) {
    var rowOut = new Array(target.length), fmtOut = new Array(target.length);
    var cellPlan = plan[rr2] || {};
    for (var c = 0; c < target.length; c++) {
      var name = target[c];
      if (baseTargets[name] || name === 'base_currency') {
        rowOut[c] = cellPlan[name] ? cellPlan[name].value : '';
      } else if (FLAGS.indexOf(name) !== -1) {
        rowOut[c] = '';                                    // UNKNOWN, for every existing row
      } else if (lIdx[name] !== undefined) {
        rowOut[c] = L.values[rr2][lIdx[name]];             // preserved by field name
      } else {
        rowOut[c] = '';
      }
      fmtOut[c] = formatFor(name, rr2);
    }
    projected.push(rowOut); formats.push(fmtOut);
  }

  // The projection must not have moved anything this round is not allowed to move. Checked against the
  // LIVE sheet by field name, which is the only comparison that survives a reorder.
  var movedUntouched = [];
  PSF_UNTOUCHED_GROUPS_.forEach(function (grp) {
    grp[1].forEach(function (f) {
      if (lIdx[f] === undefined) return;
      var tc = target.indexOf(f);
      if (tc === -1) { movedUntouched.push(f + ' (absent from target)'); return; }
      for (var q = 1; q <= rowCount; q++) {
        if (psfStr_(projected[q][tc]) !== psfStr_(L.values[q][lIdx[f]])) {
          movedUntouched.push(f + ' (row ' + (q + 1) + ')'); return;
        }
      }
    });
  });
  if (movedUntouched.length) {
    blockers.push('THE PROJECTION MOVED A FIELD THIS ROUND MAY NOT TOUCH: ' + movedUntouched.join(', '));
  }

  // UNMATCHED PRESERVATION, measured off the finished projection rather than trusted to the branch that
  // built it. Every base field of every unmatched row must be byte-identical to what the sheet holds now.
  var UNMATCHED_FIELDS = PSF_BASE_MAP_.map(function (m) { return m.target; }).concat(['base_currency']);
  var unmatchedChanged = [];
  J.rows.forEach(function (rec) {
    if (rec.status === 'MATCHED') return;
    UNMATCHED_FIELDS.forEach(function (f) {
      var tc = target.indexOf(f);
      if (tc === -1 || lIdx[f] === undefined) return;
      if (psfStr_(projected[rec.row][tc]) !== psfStr_(L.values[rec.row][lIdx[f]])) {
        unmatchedChanged.push(rec.pricing_id + ' / ' + f);
      }
    });
  });
  p('UNMATCHED_BASE_VALUES_CHANGED = ' + unmatchedChanged.length
    + (unmatchedChanged.length ? '   ' + unmatchedChanged.slice(0, 10).join(', ') : ''));
  if (unmatchedChanged.length) {
    blockers.push('UNMATCHED_BASE_VALUES_CHANGED = ' + unmatchedChanged.length + '. An unmatched row is preserved, and the projection does not preserve it.');
  }

  // §7's guarantee, asserted on the projection before it is ever written.
  // Two populations, counted apart. A Date this round CHOSE to write is a defect and blocks; a Date it was
  // told to preserve on a row nobody can identify is the incident being left where it is, on purpose, and
  // must not be able to hide behind the same number.
  var unmatchedRow = {};
  J.rows.forEach(function (rec) { if (rec.status !== 'MATCHED') unmatchedRow[rec.row] = 1; });
  var projDates = 0, projDateWhere = [], preservedDates = 0;
  PSF_NUMERIC_FIELDS_.forEach(function (f) {
    var tc = target.indexOf(f);
    if (tc === -1) return;
    for (var q2 = 1; q2 <= rowCount; q2++) {
      if (!(projected[q2][tc] instanceof Date)) continue;
      if (unmatchedRow[q2] && UNMATCHED_FIELDS.indexOf(f) !== -1) { preservedDates++; continue; }
      projDates++; if (projDateWhere.length < 10) projDateWhere.push(f + ' row ' + (q2 + 1));
    }
  });
  var msrpCol = target.indexOf('base_msrp');
  var projDateMsrp = 0, projDateMsrpMatched = 0;
  for (var q3 = 1; q3 <= rowCount; q3++) {
    if (!(projected[q3][msrpCol] instanceof Date)) continue;
    projDateMsrp++;
    if (!unmatchedRow[q3]) projDateMsrpMatched++;
  }
  rule();
  p('§7 FORMAT / TYPE SAFETY');
  p('  formats are assigned by FIELD NAME, from PRE, and a numeric field can never receive a date format.');
  p('BASE_MSRP_DATE_VALUE_COUNT_POST (projected, matched rows) = ' + projDateMsrpMatched);
  p('BASE_MSRP_DATE_VALUE_COUNT_POST (projected, ALL rows)     = ' + projDateMsrp
    + '   of which ' + (projDateMsrp - projDateMsrpMatched) + ' are preserved on unmatched rows');
  p('NUMERIC_FIELDS_HOLDING_A_DATE (projected, this round\'s doing) = ' + projDates
    + (projDateWhere.length ? '   ' + projDateWhere.join(', ') : ''));
  p('NUMERIC_FIELDS_HOLDING_A_DATE (preserved, unmatched) = ' + preservedDates);
  p('BASE_MSRP_DATE_CORRUPTION_REMOVED = ' + (dateMsrpPre > 0 && projDateMsrpMatched === 0
    ? (projDateMsrp === 0 ? 'YES' : 'YES for every matched row; ' + (projDateMsrp - projDateMsrpMatched)
        + ' preserved on unmatched rows by PSF_UNMATCHED_BASE_POLICY_')
    : (dateMsrpPre === 0 ? 'N/A — no Date values present' : 'NO')));
  if (projDates > 0) blockers.push('A numeric field this round WRITES still holds a Date in the PROJECTION. '
    + 'Nothing is written.');

  var fmtBad = [];
  PSF_NUMERIC_FIELDS_.forEach(function (f) {
    var tc = target.indexOf(f);
    if (tc === -1) return;
    for (var q4 = 1; q4 <= rowCount; q4++) {
      if (projected[q4][tc] instanceof Date) continue;    // a preserved Date belongs in a date cell
      if (psfIsDateFormat_(formats[q4][tc])) { fmtBad.push(f + ' row ' + (q4 + 1)); return; }
    }
  });
  p('NUMERIC_FIELDS_WITH_A_DATE_FORMAT (projected) = ' + fmtBad.length + (fmtBad.length ? '   ' + fmtBad.slice(0, 10).join(', ') : ''));
  if (fmtBad.length) blockers.push('A numeric field would be written into a date-formatted cell. That is the '
    + 'exact mechanism of the original incident.');

  // =========================================================================================================
  // §8 SAMPLE ROWS
  // =========================================================================================================
  rule();
  p('§8 SAMPLE ROWS — SKU Details source, current pricing_list, and the target');
  p('  pricing_id | sku | SRC sell/min/msrp/cur | NOW reg/min/msrp(raw:type)/cur | TARGET reg/min/msrp/cur');
  var shown = 0;
  function srcOfFor(rec) {
    return function (colName) {
      return dIdx[colName] === undefined ? '(no col)' : JSON.stringify(rec.source[dIdx[colName]]);
    };
  }
  for (var sr = 1; sr <= rowCount && shown < 8; sr++) {
    var rec2 = J.rows[sr - 1];
    if (!rec2 || rec2.status !== 'MATCHED') continue;
    var cp = plan[sr] || {};
    var srcOf = srcOfFor(rec2);
    var nowMsrp = L.values[sr][lIdx['base_msrp']];
    p('  ' + rec2.pricing_id + ' | ' + rec2.master_sku
      + ' | ' + srcOf('selling_price') + '/' + srcOf('minimum_price') + '/' + srcOf('msrp') + '/' + (haveSrcCurrency ? srcOf(PSF_BASE_CURRENCY_SOURCE_) : '(no col)')
      + ' | ' + JSON.stringify(L.values[sr][lIdx['base_regular_price']])
      + '/' + JSON.stringify(L.values[sr][lIdx['base_minimum_price']])
      + '/' + JSON.stringify(nowMsrp instanceof Date ? nowMsrp.toISOString() : nowMsrp) + ':' + psfKind_(nowMsrp)
      + '/' + JSON.stringify(L.values[sr][lIdx['base_currency']])
      + ' | ' + JSON.stringify(cp['base_regular_price'] ? cp['base_regular_price'].value : '')
      + '/' + JSON.stringify(cp['base_minimum_price'] ? cp['base_minimum_price'].value : '')
      + '/' + JSON.stringify(cp['base_msrp'] ? cp['base_msrp'].value : '')
      + '/' + JSON.stringify(cp['base_currency'] ? cp['base_currency'].value : ''));
    shown++;
  }
  if (!shown) p('  (no MATCHED row to sample)');

  var targetHash = psfLogicalHash_(target, projected, target.slice());

  // =========================================================================================================
  // §9 GATE
  // =========================================================================================================
  rule();
  p('§9 GO GATE');
  p('  A blank SKU Details price is never a reason to stop. These are:');
  if (!blockers.length) {
    p('  (none)');
  } else {
    blockers.forEach(function (b) { p('  BLOCK  ' + b); });
  }

  if (!commit) {
    rule();
    p('DRY RUN COMPLETE — ZERO WRITES.');
    p('TARGET_LOGICAL_HASH = ' + targetHash);
    if (blockers.length) {
      p('BASE_SOURCE_FINAL_DRY_RUN = NO-GO');
      return done();
    }
    p('Paste these three, then run TEMP_PRICING_R2_BASE_SOURCE_FINAL_COMMIT():');
    p('');
    p("  var PSF_EXPECT_LIVE_HEADER_HASH_ = '" + liveHeaderHash + "';");
    p('  var PSF_EXPECT_ROW_COUNT_ = ' + rowCount + ';');
    p("  var PSF_EXPECT_TARGET_HASH_ = '" + targetHash + "';");
    p('');
    var armed = PSF_EXPECT_ROW_COUNT_ !== -1 || PSF_EXPECT_LIVE_HEADER_HASH_ !== '' || PSF_EXPECT_TARGET_HASH_ !== '';
    if (!armed) {
      p('CONSTANTS_ARMED = NO — paste the three above and run the DRY RUN again before COMMIT.');
      p('BASE_SOURCE_FINAL_DRY_RUN = GO (gate passed; not yet authorised)');
    } else {
      var match = PSF_EXPECT_LIVE_HEADER_HASH_ === liveHeaderHash
        && PSF_EXPECT_ROW_COUNT_ === rowCount && PSF_EXPECT_TARGET_HASH_ === targetHash;
      p('CONSTANTS_ARMED = YES');
      p('  header hash  ' + (PSF_EXPECT_LIVE_HEADER_HASH_ === liveHeaderHash ? 'MATCH' : 'DRIFT'));
      p('  row count    ' + (PSF_EXPECT_ROW_COUNT_ === rowCount ? 'MATCH' : 'DRIFT'));
      p('  target hash  ' + (PSF_EXPECT_TARGET_HASH_ === targetHash ? 'MATCH' : 'DRIFT'));
      p('BASE_SOURCE_FINAL_DRY_RUN = ' + (match ? 'GO / READY — COMMIT is authorised'
        : 'NO-GO — the armed constants do not match this sheet'));
    }
    return done();
  }

  // =========================================================================================================
  // §10 COMMIT
  // =========================================================================================================
  rule();
  if (blockers.length) {
    p('BLOCKED — the gate above did not pass. NOTHING WAS WRITTEN.');
    return done();
  }
  if (PSF_EXPECT_LIVE_HEADER_HASH_ !== liveHeaderHash || PSF_EXPECT_ROW_COUNT_ !== rowCount
      || PSF_EXPECT_TARGET_HASH_ !== targetHash) {
    p('BLOCKED — the sheet is not what the dry run measured.');
    p('  expected header hash ' + PSF_EXPECT_LIVE_HEADER_HASH_ + '   live ' + liveHeaderHash);
    p('  expected row count   ' + PSF_EXPECT_ROW_COUNT_ + '   live ' + rowCount);
    p('  expected target hash ' + PSF_EXPECT_TARGET_HASH_ + '   live ' + targetHash);
    return done();
  }
  p('DRIFT GATE PASSED.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(PSF_LOCK_MS_)) {
    p('BLOCKED — could not take the script lock. NOTHING WAS WRITTEN.');
    return done();
  }
  try {
    // Re-read UNDER the lock. Everything above was measured without one, so anything could have moved
    // between the gate and here; this is the only comparison that is actually serialised with the write.
    var L2 = readSheet(sh);
    if (psfSha_(L2.header.join('|#|')) !== liveHeaderHash || (L2.values.length - 1) !== rowCount) {
      p('BLOCKED under the lock — pricing_list changed between the gate and the write. NOTHING WAS WRITTEN.');
      return done();
    }
    var l2Idx = psfIndex_(L2.header);
    var drifted = 0;
    for (var v1 = 1; v1 <= rowCount; v1++) {
      for (var v2 = 0; v2 < L.header.length; v2++) {
        if (psfStr_(L.values[v1][v2]) !== psfStr_(L2.values[v1][v2])) { drifted++; break; }
      }
    }
    if (drifted) {
      p('BLOCKED under the lock — ' + drifted + ' row(s) changed since the gate. NOTHING WAS WRITTEN.');
      return done();
    }
    if (l2Idx['pricing_id'] === undefined) {
      p('BLOCKED under the lock — pricing_id vanished. NOTHING WAS WRITTEN.');
      return done();
    }
    p('RE-READ UNDER LOCK — identical to the gated state.');

    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    var mySnapName = PSF_PREBASE_PREFIX_ + stamp;
    sh.copyTo(ss).setName(mySnapName);
    p('PRE_WRITE_SNAPSHOT = ' + mySnapName);
    p('  the PRE__ snapshots are untouched and remain the rollback of record.');

    var needCols = target.length - sh.getMaxColumns();
    if (needCols > 0) sh.insertColumnsAfter(sh.getMaxColumns(), needCols);
    var rg = sh.getRange(1, 1, projected.length, target.length);
    // Formats first. The order does not decide correctness — the value is stored either way and the
    // format decides what comes back — but if this dies between the two calls, formats-first leaves
    // correct formats over old values, and values-first would leave new values wearing whatever format
    // the physical column happened to carry. That second state is the one being repaired.
    rg.setNumberFormats(formats);
    rg.setValues(projected);
    SpreadsheetApp.flush();
    p('WRITE COMPLETE — formats then values, one bounded range, ' + projected.length + ' x ' + target.length + '.');

    // ---- POST VALIDATOR ------------------------------------------------------------------------------
    var post = sh.getDataRange().getValues();
    var postHeader = (post[0] || []).map(psfStr_);
    var pIdx2 = psfIndex_(postHeader);
    var checks = [];
    function check(l, c2, d) { checks.push({ label: l, ok: !!c2, detail: d }); }

    check('ROW_COUNT_POST == ' + rowCount, (post.length - 1) === rowCount, (post.length - 1) + '');
    check('COLUMN_COUNT_POST == ' + target.length, postHeader.length === target.length, postHeader.length + '');
    check('canonical prefix EXACT', CANON.every(function (h, i) { return postHeader[i] === h; }));
    check('extensions preserved in order',
      extensions.every(function (h, i) { return postHeader[CANON.length + i] === h; }));
    check('TARGET_LOGICAL_HASH reproduced', psfLogicalHash_(postHeader, post, target.slice()) === targetHash);

    var idsOk = 0;
    for (var pv = 1; pv <= rowCount; pv++) {
      if (psfStr_(post[pv][pIdx2['pricing_id']]) === psfStr_(L.values[pv][lIdx['pricing_id']])) idsOk++;
    }
    check('pricing_id identity preserved row for row', idsOk === rowCount, idsOk + ' of ' + rowCount);

    PSF_UNTOUCHED_GROUPS_.forEach(function (grp) {
      var moved = [];
      grp[1].forEach(function (f) {
        if (lIdx[f] === undefined || pIdx2[f] === undefined) return;
        for (var pw = 1; pw <= rowCount; pw++) {
          if (psfStr_(post[pw][pIdx2[f]]) !== psfStr_(L.values[pw][lIdx[f]])) { moved.push(f); return; }
        }
      });
      check(grp[0] + '_CHANGED = NO', moved.length === 0, moved.join(',') || '');
    });

    PSF_NUMERIC_FIELDS_.forEach(function (f) {
      if (pIdx2[f] === undefined) return;
      var dates = 0, kept = 0;
      for (var px = 1; px <= rowCount; px++) {
        if (!(post[px][pIdx2[f]] instanceof Date)) continue;
        if (unmatchedRow[px] && UNMATCHED_FIELDS.indexOf(f) !== -1) { kept++; continue; }
        dates++;
      }
      check(f + ' holds no Date this round wrote', dates === 0,
        dates + ' Date cells' + (kept ? ' (+' + kept + ' preserved on unmatched rows)' : ''));
    });

    PSF_BASE_MAP_.forEach(function (m) {
      var bad = 0, keptB = 0;
      for (var py = 1; py <= rowCount; py++) {
        var v3 = post[py][pIdx2[m.target]];
        if (psfBlank_(v3) || typeof v3 === 'number') continue;
        // A value preserved on an unmatched row is whatever that row already held. This round did not
        // choose it and is not entitled to reshape it; it is counted, not failed.
        if (unmatchedRow[py]) { keptB++; continue; }
        bad++;
      }
      check(m.target + ' is number-or-blank on every MATCHED row', bad === 0,
        bad + ' other' + (keptB ? ' (+' + keptB + ' preserved on unmatched rows)' : ''));
    });

    // THE PRESERVATION, RE-MEASURED AFTER THE WRITE. The dry run checked the projection; this checks the
    // sheet, which is the only thing a later reader can go and look at.
    var postUnmatchedChanged = [];
    J.rows.forEach(function (rec) {
      if (rec.status === 'MATCHED') return;
      UNMATCHED_FIELDS.forEach(function (f) {
        if (pIdx2[f] === undefined || lIdx[f] === undefined) return;
        if (psfStr_(post[rec.row][pIdx2[f]]) !== psfStr_(L.values[rec.row][lIdx[f]])) {
          postUnmatchedChanged.push(rec.pricing_id + ' / ' + f);
        }
      });
    });
    check('UNMATCHED_BASE_VALUES_CHANGED = 0', postUnmatchedChanged.length === 0,
      postUnmatchedChanged.slice(0, 10).join(', ') || String(Object.keys(unmatchedRow).length)
        + ' unmatched row(s) preserved');

    FLAGS.forEach(function (f) {
      var blank = 0;
      for (var pz = 1; pz <= rowCount; pz++) if (psfStr_(post[pz][pIdx2[f]]) === '') blank++;
      check(f + ' blank (UNKNOWN) on every row', blank === rowCount, blank + ' of ' + rowCount);
    });

    // pricing_change_log must be exactly where it was. This round never opens it for writing.
    var logAfter = logSh ? (logSh.getLastColumn()
      ? logSh.getRange(1, 1, 1, logSh.getLastColumn()).getValues()[0].map(psfStr_) : []) : [];
    check('pricing_change_log header unchanged',
      logAfter.length === logHead.length && logAfter.every(function (h, i) { return h === logHead[i]; }),
      logAfter.join(','));
    check('pricing_change_log ROW_COUNT still ' + PSF_EXPECT_LOG_ROW_COUNT_,
      !!logSh && (logSh.getLastRow() - 1) === PSF_EXPECT_LOG_ROW_COUNT_);

    check('PRE snapshots still present',
      ss.getSheets().map(function (s) { return s.getName(); })
        .filter(function (n) { return n.indexOf(PSF_SNAP_PREFIX_) === 0; }).length > 0);

    function prodCheck(name, expected) {
      if (typeof prodRequireSheet_ !== 'function') return 'UNAVAILABLE';
      try { prodRequireSheet_(ss, name, expected); return 'PASS'; }
      catch (e) { return 'FAIL ' + (e && e.message ? e.message : String(e)); }
    }
    var pp = prodCheck(PSF_PRICE_TAB_, CANON), pl = prodCheck(PSF_LOG_TAB_, LOGCANON);
    check('prodRequireSheet_ pricing_list PASS', pp === 'PASS', pp);
    check('prodRequireSheet_ pricing_change_log PASS', pl === 'PASS', pl);

    rule();
    p('POST VALIDATOR');
    var allOk = true;
    checks.forEach(function (c4) {
      if (!c4.ok) allOk = false;
      p('  ' + (c4.ok ? 'PASS  ' : 'FAIL  ') + c4.label + (c4.detail ? '   [' + c4.detail + ']' : ''));
    });
    p('');
    p('BASE_SOURCE_FINAL_COMMIT = ' + (allOk ? 'PASS' : 'FAIL'));
    if (!allOk) {
      p('*** FAILED. Nothing here repairs it automatically. ***');
      p('Restore pricing_list from ' + mySnapName + ' by hand and report this output. A partial success');
      p('is not a success.');
    } else {
      p('Now run TEMP_PRICING_R2_POST_VERIFY() — the independent verifier — before calling this sealed.');
    }
    return done();
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
