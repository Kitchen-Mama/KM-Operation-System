// ============================================================================
// Kitchen Mama Operation System — Amazon Daily Sales historical duplicate
// DRY-RUN analyzer (HOTFIX A2). PURE + READ-ONLY: no Sheet/Range access, no
// deletion, no mutation. Given a snapshot of {headers, rows} it computes the
// normalized-key duplicate inventory, classifies every duplicate group, and
// proposes a deterministic last-wins keep/remove plan — WITHOUT applying it.
//
// The natural key and date-normalization semantics are byte-compatible with the
// importer fixed in HOTFIX A (commit 0f777ef):
//   normalize(snapshot_date) + country + marketplace + channel + sku
// snapshot_date is canonicalized via the SAME rule as apps-script
// amazonNormalizeDate_ (Date value OR 'yyyy-MM-dd' string → 'yyyy-MM-dd'); this
// module does NOT introduce a competing parser — the companion test asserts
// byte-equality against the actual extracted amazonNormalizeDate_.
//
// Winner rule = last-wins by LATER input-row order (mirrors 09_ line 128-129:
// a later existing row overwrites an earlier one at the same key). This is NOT a
// timestamp comparison; do not redefine it here.
// ============================================================================

(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.KM = root.KM || {};
  root.KM.amazonDailySalesDedup = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NATURAL_KEY = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku'];
  var DATE_KEY_FIELD = 'snapshot_date';

  // Canonical business (sales) facts — identical set to the importer rowHashFields
  // MINUS the natural key (06_amazon_import_config.gs rowHashFields). Equality of
  // these fields defines "same business facts".
  var BUSINESS_FACT_FIELDS = [
    'currency', 'sales_units', 'sales_amount', 'sales_amount_usd', 'return_units',
    'total_orders', 'session', 'page_view', 'unit_session_percentage',
    'buy_box_percentage', 'browser_session', 'browser_page_views', 'app_session', 'app_page_view'
  ];

  // Core sales measures — NEVER eligible for the derived-field numeric tolerance below.
  var CORE_SALES_FIELDS = [
    'currency', 'sales_units', 'sales_amount', 'sales_amount_usd', 'return_units', 'total_orders', 'session'
  ];

  // The ONLY two fields for which a numeric-meaning (not string) comparison may be enabled, per the
  // HOTFIX A3-PREP §7 user authorization. Differences here are display/precision artifacts of derived
  // Amazon metrics; they are tolerated ONLY when both sides parse to finite numbers. Opt-in via
  // input.tolerantDerivedFields — DEFAULT OFF, so the conservative A2 classification is unchanged.
  var TOLERANT_DERIVED_FIELDS = ['buy_box_percentage', 'unit_session_percentage'];

  var GROUP_CLASS = {
    IDENTICAL: 'IDENTICAL_FACTS',
    METADATA_ONLY: 'METADATA_ONLY_DIFFERENCE',
    CONFLICTING: 'CONFLICTING_FACTS',
    INVALID: 'INVALID_KEY'
  };
  var ELIGIBILITY = { AUTO: 'AUTO_ELIGIBLE', REVIEW: 'REVIEW_REQUIRED', BLOCKED: 'BLOCKED' };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Mirror of apps-script amazonNormalizeDate_ (10_amazon_import_helpers.gs). Returns
  // { ok, empty, value } with value = 'yyyy-MM-dd'. Date objects are rendered in `tz`
  // via en-CA (yyyy-MM-dd); date/datetime strings use the SAME regex + pad the importer
  // uses; otherwise a Date(parse) fallback. No current-clock fallback.
  function normalizeSnapshotDate(v, tz) {
    tz = tz || 'Asia/Taipei';
    if (v === null || v === undefined) return { ok: false, empty: true, value: '' };
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return { ok: false, empty: false, value: '' };
      return { ok: true, empty: false, value: formatDateInTz(v, tz) };
    }
    var s = String(v).trim();
    if (s === '') return { ok: false, empty: true, value: '' };
    var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) {
      var mo = +m[2], d = +m[3];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { ok: true, empty: false, value: m[1] + '-' + pad2(mo) + '-' + pad2(d) };
      return { ok: false, empty: false, value: '' };
    }
    var dt = new Date(s);
    if (!isNaN(dt.getTime())) return { ok: true, empty: false, value: formatDateInTz(dt, tz) };
    return { ok: false, empty: false, value: '' };
  }

  function formatDateInTz(date, tz) {
    // en-CA renders as yyyy-MM-dd; timeZone makes it tz-correct (Asia/Taipei = UTC+8).
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(date);
    } catch (e) {
      // Deterministic fallback for Asia/Taipei (UTC+8, no DST) when Intl/tz is unavailable.
      var shifted = new Date(date.getTime() + 8 * 3600 * 1000);
      return shifted.getUTCFullYear() + '-' + pad2(shifted.getUTCMonth() + 1) + '-' + pad2(shifted.getUTCDate());
    }
  }

  function trimStr(v) { return String(v == null ? '' : v).trim(); }

  function headerIndexMap(headers) {
    var idx = {};
    for (var c = 0; c < headers.length; c++) idx[trimStr(headers[c]).toLowerCase()] = c;
    return idx;
  }

  function cellByName(row, colIndex, name) {
    var ci = colIndex[String(name).toLowerCase()];
    return (ci == null) ? undefined : row[ci];
  }

  // Build the normalized natural key for a row. Returns { key, valid, reason, dateRaw, dateNorm }.
  function rowKey(row, colIndex, tz) {
    var parts = [];
    var dateRaw = cellByName(row, colIndex, DATE_KEY_FIELD);
    var nd = normalizeSnapshotDate(dateRaw, tz);
    var valid = true, reason = '';
    if (!nd.ok) { valid = false; reason = nd.empty ? 'missing_snapshot_date' : 'invalid_snapshot_date'; }
    for (var i = 0; i < NATURAL_KEY.length; i++) {
      var k = NATURAL_KEY[i];
      if (k === DATE_KEY_FIELD) { parts.push(nd.ok ? nd.value : ''); continue; }
      var raw = cellByName(row, colIndex, k);
      var t = trimStr(raw);
      if (t === '') { valid = false; if (!reason) reason = 'missing_' + k; }
      parts.push(t);
    }
    return { key: parts.join('||'), valid: valid, reason: reason, dateRaw: dateRaw, dateNorm: nd.value };
  }

  // Canonical numeric meaning of a derived-percentage cell: strip ONE optional leading currency
  // symbol and a trailing %, then parse. Returns a finite Number or null (non-numeric/blank).
  function derivedNumeric(v) {
    var s = trimStr(v);
    if (s === '') return null;
    s = s.replace(/^[^0-9.\-]+/, '').replace(/%\s*$/, '').replace(/,/g, '');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  // Compare one business field between two rows. For a tolerant derived field (only when enabled),
  // equality is by numeric meaning — "$100.00" == "100", and a precision-only gap like 33 vs 33.33 is
  // tolerated — BUT ONLY if BOTH sides parse to finite numbers; otherwise it falls back to strict
  // string compare (so a non-numeric derived value stays a real conflict). Core fields are ALWAYS strict.
  function fieldEqual(a, b, colIndex, field, tolerantSet) {
    var av = cellByName(a, colIndex, field), bv = cellByName(b, colIndex, field);
    if (tolerantSet[field]) {
      var an = derivedNumeric(av), bn = derivedNumeric(bv);
      if (an !== null && bn !== null) return true; // both numeric → tolerate representation/precision
      return trimStr(av) === trimStr(bv);          // else strict (invalid/nonnumeric → conflict preserved)
    }
    return trimStr(av) === trimStr(bv);
  }

  function factsEqual(a, b, colIndex, tolerantSet) {
    tolerantSet = tolerantSet || {};
    for (var i = 0; i < BUSINESS_FACT_FIELDS.length; i++) {
      var f = BUSINESS_FACT_FIELDS[i];
      if (colIndex[f] == null) continue; // field absent in this export → skip
      if (!fieldEqual(a, b, colIndex, f, tolerantSet)) return false;
    }
    return true;
  }

  // Metadata = any header NOT in the natural key and NOT a business fact.
  function metadataFields(headers, colIndex) {
    var reserved = {};
    NATURAL_KEY.concat(BUSINESS_FACT_FIELDS).forEach(function (f) { reserved[f] = true; });
    var out = [];
    for (var c = 0; c < headers.length; c++) {
      var h = trimStr(headers[c]).toLowerCase();
      if (h && !reserved[h]) out.push(h);
    }
    return out;
  }

  function metaEqual(a, b, metaFields, colIndex) {
    for (var i = 0; i < metaFields.length; i++) {
      var f = metaFields[i];
      if (trimStr(cellByName(a, colIndex, f)) !== trimStr(cellByName(b, colIndex, f))) return false;
    }
    return true;
  }

  function fieldDiffs(rows, fields, colIndex) {
    var diffs = [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (colIndex[f] == null) continue;
      var vals = {};
      for (var r = 0; r < rows.length; r++) vals[trimStr(cellByName(rows[r], colIndex, f))] = true;
      if (Object.keys(vals).length > 1) diffs.push({ field: f, values: Object.keys(vals).sort() });
    }
    return diffs;
  }

  function uniqSorted(arr) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) { var v = arr[i]; if (!seen[v]) { seen[v] = true; out.push(v); } }
    return out.sort();
  }

  // -------------------------------------------------------------------------
  // Main analyzer. input = { headers:[], rows:[[]], timezone?, winnerRule? }.
  // Row indexes are 0-based into `rows`; sheetRow (1-based data row incl. header)
  // is reported as index+2 for operator cross-reference.
  // -------------------------------------------------------------------------
  function analyzeAmazonDailySalesDuplicates(input) {
    input = input || {};
    var headers = (input.headers || []).map(function (h) { return trimStr(h); });
    var rows = input.rows || [];
    var tz = input.timezone || 'Asia/Taipei';
    var winnerRule = input.winnerRule || 'last-wins-row-order';
    if (winnerRule !== 'last-wins-row-order') {
      throw new Error('unsupported winnerRule (importer uses later-row-order last-wins): ' + winnerRule);
    }
    var colIndex = headerIndexMap(headers);
    var metaFields = metadataFields(headers, colIndex);
    var issues = [];

    // Opt-in derived-field numeric tolerance (HOTFIX A3-PREP §7). true → the two authorized fields;
    // an array → intersect with the authorized set (a caller can NEVER make a core measure tolerant).
    var tolerantSet = {};
    if (input.tolerantDerivedFields) {
      var requested = (input.tolerantDerivedFields === true) ? TOLERANT_DERIVED_FIELDS : input.tolerantDerivedFields;
      var coreGuard = {}; CORE_SALES_FIELDS.forEach(function (f) { coreGuard[f] = true; });
      requested.forEach(function (f) {
        var fl = String(f).toLowerCase();
        if (TOLERANT_DERIVED_FIELDS.indexOf(fl) >= 0 && !coreGuard[fl]) tolerantSet[fl] = true;
      });
    }
    var derivedFormatGroups = 0; // groups AUTO only because of the derived-field tolerance

    // Bucket rows by normalized key (preserving input order → index order == sheet order).
    var buckets = {};        // key -> [rowIndex,...]
    var order = [];          // key first-seen order for determinism
    var invalidRows = [];    // rows whose key can't be safely formed
    for (var i = 0; i < rows.length; i++) {
      var rk = rowKey(rows[i], colIndex, tz);
      if (!rk.valid) {
        invalidRows.push({ index: i, sheetRow: i + 2, reason: rk.reason, snapshot_date_raw: safeRaw(rk.dateRaw) });
        issues.push({ severity: 'error', type: 'invalid_key', index: i, sheetRow: i + 2, reason: rk.reason });
        continue;
      }
      if (!buckets[rk.key]) { buckets[rk.key] = []; order.push(rk.key); }
      buckets[rk.key].push(i);
    }

    var groups = [];
    var countByClass = { IDENTICAL_FACTS: 0, METADATA_ONLY_DIFFERENCE: 0, CONFLICTING_FACTS: 0, INVALID_KEY: 0 };
    var countByElig = { AUTO_ELIGIBLE: 0, REVIEW_REQUIRED: 0, BLOCKED: 0 };
    var duplicateGroupCount = 0, duplicateExtraRowCount = 0, maxRowsPerKey = rows.length ? 1 : 0;
    var autoRemoveTotal = 0;
    var affectedDates = [], affectedCountries = [], affectedChannels = [], affectedSkus = [];

    for (var g = 0; g < order.length; g++) {
      var key = order[g];
      var idxs = buckets[key];
      if (idxs.length > maxRowsPerKey) maxRowsPerKey = idxs.length;
      if (idxs.length < 2) continue; // not a duplicate group

      duplicateGroupCount++;
      duplicateExtraRowCount += (idxs.length - 1);
      var groupRows = idxs.map(function (ix) { return rows[ix]; });
      var parts = key.split('||');
      affectedDates.push(parts[0]);
      affectedCountries.push(parts[1]);
      affectedChannels.push(parts[3]);
      affectedSkus.push(parts[4]);

      // classify. allFactsEqual uses the (possibly) tolerant comparator; strictFactsEqual ignores
      // tolerance — a group that is equal ONLY under tolerance is an authorized derived-format group.
      var allFactsEqual = true, strictFactsEqual = true;
      for (var a = 1; a < groupRows.length; a++) {
        if (allFactsEqual && !factsEqual(groupRows[0], groupRows[a], colIndex, tolerantSet)) allFactsEqual = false;
        if (strictFactsEqual && !factsEqual(groupRows[0], groupRows[a], colIndex, {})) strictFactsEqual = false;
      }
      var allMetaEqual = true;
      for (var b = 1; b < groupRows.length; b++) { if (!metaEqual(groupRows[0], groupRows[b], metaFields, colIndex)) { allMetaEqual = false; break; } }
      var toleranceApplied = (allFactsEqual && !strictFactsEqual);
      if (toleranceApplied) derivedFormatGroups++;

      var klass, elig;
      if (!allFactsEqual) { klass = GROUP_CLASS.CONFLICTING; elig = ELIGIBILITY.REVIEW; }
      else if (!allMetaEqual || toleranceApplied) { klass = GROUP_CLASS.METADATA_ONLY; elig = ELIGIBILITY.AUTO; }
      else { klass = GROUP_CLASS.IDENTICAL; elig = ELIGIBILITY.AUTO; }
      countByClass[klass]++; countByElig[elig]++;

      // winner = last-wins by later input-row order = the max original index.
      var winnerIndex = idxs[idxs.length - 1];
      var removeIndexes = idxs.slice(0, idxs.length - 1);
      if (elig === ELIGIBILITY.AUTO) autoRemoveTotal += removeIndexes.length;

      // source_row_hash audit for this group
      var hashes = groupRows.map(function (r) { return trimStr(cellByName(r, colIndex, 'source_row_hash')); });
      var distinctHashes = uniqSorted(hashes.filter(function (h) { return h !== ''; }));
      var blankHash = hashes.some(function (h) { return h === ''; });

      groups.push({
        normalizedKey: key,
        snapshot_date: parts[0], country: parts[1], marketplace: parts[2], channel: parts[3], sku: parts[4],
        rowCount: idxs.length,
        rowIndexes: idxs.slice(),
        sheetRows: idxs.map(function (ix) { return ix + 2; }),
        rawSnapshotDates: groupRows.map(function (r) { return safeRaw(cellByName(r, colIndex, DATE_KEY_FIELD)); }),
        classification: klass,
        eligibility: elig,
        businessFactDiffs: fieldDiffs(groupRows, BUSINESS_FACT_FIELDS, colIndex),
        metadataDiffs: fieldDiffs(groupRows, metaFields, colIndex),
        winnerIndex: winnerIndex,
        winnerSheetRow: winnerIndex + 2,
        proposedRemoveIndexes: removeIndexes,
        proposedRemoveSheetRows: removeIndexes.map(function (ix) { return ix + 2; }),
        winnerReason: 'later-row-order (max input index) — mirrors importer 09_ last-wins',
        sourceRowHash: { distinct: distinctHashes, distinctCount: distinctHashes.length, hasBlank: blankHash, allSame: distinctHashes.length <= 1 && !blankHash },
        toleranceApplied: toleranceApplied, // AUTO only because of the authorized derived-field tolerance
        confidence: (klass === GROUP_CLASS.IDENTICAL) ? 'high' : (klass === GROUP_CLASS.METADATA_ONLY ? 'high' : 'manual-review'),
        cleanupEligible: (elig === ELIGIBILITY.AUTO)
      });
    }

    // invalid-key groups are BLOCKED (cannot form a key → cannot dedup safely)
    var invalidKeyGroups = invalidRows.length; // each invalid row reported; blocked as a class
    if (invalidRows.length) { countByClass.INVALID_KEY = invalidRows.length; countByElig.BLOCKED += invalidRows.length; }

    var projectedOutputRows = rows.length - autoRemoveTotal;

    return {
      naturalKey: NATURAL_KEY.slice(),
      timezone: tz,
      winnerRule: winnerRule,
      totalInputRows: rows.length,
      uniqueKeyCount: order.length,
      duplicateGroupCount: duplicateGroupCount,
      duplicateExtraRowCount: duplicateExtraRowCount,
      affectedDateRange: affectedDates.length ? { from: affectedDates.slice().sort()[0], to: affectedDates.slice().sort()[affectedDates.length - 1] } : null,
      affectedDates: uniqSorted(affectedDates),
      affectedCountries: uniqSorted(affectedCountries),
      affectedChannels: uniqSorted(affectedChannels),
      affectedSkus: uniqSorted(affectedSkus),
      maxRowsPerKey: maxRowsPerKey,
      identicalFactGroups: countByClass.IDENTICAL_FACTS,
      metadataOnlyGroups: countByClass.METADATA_ONLY_DIFFERENCE,
      authorizedDerivedFormatGroups: derivedFormatGroups,
      conflictingFactGroups: countByClass.CONFLICTING_FACTS,
      invalidKeyRows: countByClass.INVALID_KEY,
      tolerantDerivedFieldsApplied: Object.keys(tolerantSet).sort(),
      autoEligibleGroups: countByElig.AUTO_ELIGIBLE,
      reviewRequiredGroups: countByElig.REVIEW_REQUIRED,
      blockedGroups: countByElig.BLOCKED,
      autoEligibleRemoveRows: autoRemoveTotal,
      projectedOutputRows: projectedOutputRows,
      groups: groups,
      invalidRows: invalidRows,
      issues: issues
    };
  }

  function safeRaw(v) {
    if (Object.prototype.toString.call(v) === '[object Date]') return { type: 'Date', iso: isNaN(v.getTime()) ? 'invalid' : v.toISOString() };
    return { type: typeof v, value: v == null ? '' : String(v) };
  }

  // -------------------------------------------------------------------------
  // Dedup PLAN (still pure/read-only): the deterministic keep/remove set that a
  // FUTURE authorized migration would apply — ONLY for AUTO_ELIGIBLE groups.
  // REVIEW_REQUIRED / BLOCKED / INVALID rows are always retained. Never applied here.
  // -------------------------------------------------------------------------
  function buildAmazonDailySalesDedupPlan(input) {
    var a = analyzeAmazonDailySalesDuplicates(input);
    var removeSet = {};
    for (var g = 0; g < a.groups.length; g++) {
      if (a.groups[g].eligibility !== ELIGIBILITY.AUTO) continue;
      a.groups[g].proposedRemoveIndexes.forEach(function (ix) { removeSet[ix] = true; });
    }
    var keepIndexes = [], removeIndexes = [];
    for (var i = 0; i < a.totalInputRows; i++) { if (removeSet[i]) removeIndexes.push(i); else keepIndexes.push(i); }
    return {
      mode: 'DRY_RUN',
      applied: false,
      naturalKey: a.naturalKey,
      winnerRule: a.winnerRule,
      totalInputRows: a.totalInputRows,
      keepIndexes: keepIndexes,
      removeIndexes: removeIndexes,
      projectedOutputRows: keepIndexes.length,
      autoEligibleGroups: a.autoEligibleGroups,
      reviewRequiredGroups: a.reviewRequiredGroups,
      blockedGroups: a.blockedGroups,
      requiresManualReview: (a.reviewRequiredGroups > 0 || a.blockedGroups > 0)
    };
  }

  return {
    NATURAL_KEY: NATURAL_KEY,
    BUSINESS_FACT_FIELDS: BUSINESS_FACT_FIELDS,
    GROUP_CLASS: GROUP_CLASS,
    ELIGIBILITY: ELIGIBILITY,
    normalizeSnapshotDate: normalizeSnapshotDate,
    analyzeAmazonDailySalesDuplicates: analyzeAmazonDailySalesDuplicates,
    buildAmazonDailySalesDedupPlan: buildAmazonDailySalesDedupPlan
  };
});
