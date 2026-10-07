/**
 * TEMP_S8_R4D_G1_INVENTORY_BLANK_DATE_KEY_SAFETY.gs
 *
 * PASTE · RUN · REPORT · REMOVE
 *
 * S8-R4D-G1 §1/§3/§5 — measure whether amazon_inventory_snapshot's natural key could drop
 * snapshot_date without collapsing two source rows into one.
 *
 * READ ONLY. It opens two SOURCE spreadsheets and reads their values. It writes nothing: no sheet
 * write, no property, no cache, no Drive, no mail, no trigger. ZERO_WRITE is asserted by a repository
 * test against the canonical write-primitive list, not by this comment.
 *
 * IT MEASURES WITH THE SHIPPED PREDICATES, NOT WITH COPIES OF THEM. `amazonIsBlank_` and
 * `amazonNormalizeDate_` live in 10_amazon_import_helpers.gs and IMPORT_CONFIGS lives in
 * 06_amazon_import_config.gs. A local reimplementation would measure this file's opinion of the
 * importer rather than the importer, which is the error the D2 benchmark made when it validated
 * headers against its own copy of the rules. If any of them is missing, this REFUSES rather than
 * falling back to a copy.
 *
 * IT DOES NOT DUMP THE SOURCE. Only counts, header NAMES, and a bounded sample of at most
 * G1_SAMPLE_MAX_ colliding identities are returned. No quantity, no price, no row contents.
 *
 * HOW TO RUN
 *   1. Paste this file into the Production Apps Script project.
 *   2. Run  s8r4dG1Report()  from the editor.
 *   3. Copy the logged JSON back to the operator.
 *   4. DELETE this file from the project.
 */

var G1_SAMPLE_MAX_ = 10;

/** Entry point. Logs one JSON object and returns it. */
function s8r4dG1Report() {
  var out = {
    tool: 'S8-R4D-G1',
    generated_at: (typeof amazonTimestamp_ === 'function') ? amazonTimestamp_() : String(new Date()),
    zero_write: true,
    refusals: [],
    inventory: null,
    health: null
  };
  var missing = [];
  if (typeof IMPORT_CONFIGS === 'undefined') missing.push('IMPORT_CONFIGS (06_amazon_import_config.gs)');
  if (typeof amazonIsBlank_ !== 'function') missing.push('amazonIsBlank_ (10_amazon_import_helpers.gs)');
  if (typeof amazonNormalizeDate_ !== 'function') missing.push('amazonNormalizeDate_ (10_amazon_import_helpers.gs)');
  if (missing.length) {
    // FAIL CLOSED. A measurement taken with a local copy of the rules is not a measurement of the importer.
    out.refusals.push('SHIPPED_DEPENDENCY_MISSING: ' + missing.join(', ')
      + ' — paste this tool into the project that carries the importer, and do not reimplement them here.');
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }
  out.inventory = s8r4dG1Measure_('amazon_inventory_snapshot');
  out.health = s8r4dG1Measure_('amazon_inventory_health_snapshot');
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/** Locate a destination table's shipped import config by destinationSheetName. */
function s8r4dG1Config_(destName) {
  for (var i = 0; i < IMPORT_CONFIGS.length; i++) {
    if (IMPORT_CONFIGS[i] && IMPORT_CONFIGS[i].destinationSheetName === destName) return IMPORT_CONFIGS[i];
  }
  return null;
}

function s8r4dG1Measure_(destName) {
  var cfg = s8r4dG1Config_(destName);
  if (!cfg) return { table: destName, refused: 'NO_SHIPPED_CONFIG' };
  if (cfg.sourceType !== 'sheet') {
    return { table: destName, refused: 'SOURCE_IS_NOT_A_SHEET (' + cfg.sourceType + ') — this tool reads sheets only' };
  }

  var ss = SpreadsheetApp.openById(cfg.sourceId);
  if (!ss) return { table: destName, refused: 'SOURCE_SPREADSHEET_NOT_FOUND' };
  var sh = ss.getSheetByName(cfg.sourceSheetName);
  if (!sh) return { table: destName, refused: 'SOURCE_SHEET_NOT_FOUND: ' + cfg.sourceSheetName };

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    return { table: destName, source_row_count: 0, refused: 'SOURCE_HAS_NO_DATA_ROWS' };
  }
  var header = values[0].map(function (h) { return String(h).trim(); });
  var col = {};
  for (var c = 0; c < header.length; c++) { if (header[c] !== '' && col[header[c]] === undefined) col[header[c]] = c; }

  // The grouping is derived from the SHIPPED config, never from this file's assumptions. A key field
  // that is supplied by fixedValues cannot vary within the source and is therefore NOT a grouping
  // dimension; one supplied by fieldMap is. §1 requires that distinction to be proven, not asserted.
  var fixed = cfg.fixedValues || {};
  var fieldMap = cfg.fieldMap || {};
  var groupFields = [], fixedFields = [], unresolved = [];
  for (var k = 0; k < cfg.naturalKey.length; k++) {
    var f = cfg.naturalKey[k];
    if ((cfg.dateFields || []).indexOf(f) !== -1) continue;             // the date is the thing being tested
    if (Object.prototype.hasOwnProperty.call(fixed, f)) { fixedFields.push(f); continue; }
    if (Object.prototype.hasOwnProperty.call(fieldMap, f)) {
      if (col[fieldMap[f]] === undefined) { unresolved.push(f + ' -> header "' + fieldMap[f] + '" ABSENT'); }
      else groupFields.push(f);
      continue;
    }
    unresolved.push(f + ' -> neither fixedValues nor fieldMap');
  }

  var dateField = (cfg.dateFields && cfg.dateFields[0]) || 'snapshot_date';
  var dateHeader = fieldMap[dateField];
  if (dateHeader === undefined || col[dateHeader] === undefined) {
    return { table: destName, refused: 'DATE_SOURCE_HEADER_NOT_FOUND for ' + dateField };
  }

  var identities = {};                 // key -> { dates: {}, blankRows: 0, rows: 0 }
  var sourceRows = 0, blankDateRows = 0, blankDateWithCountry = 0, blankDateWithSku = 0, blankDateImportable = 0;
  var invalidDateRows = 0;

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    // A wholly blank spreadsheet row is not a source row. getDataRange pads to the used range.
    var anything = false;
    for (var q = 0; q < header.length && !anything; q++) { if (!amazonIsBlank_(row[q])) anything = true; }
    if (!anything) continue;
    sourceRows++;

    var rawDate = row[col[dateHeader]];
    var dateBlank = amazonIsBlank_(rawDate);
    var dateValue = '';
    if (!dateBlank) {
      var nd = amazonNormalizeDate_(rawDate);
      if (nd.ok) dateValue = nd.value; else { invalidDateRows++; dateValue = '__INVALID__'; }
    }

    // The grouping key, built from the same trimmed source values the importer would map.
    var parts = [];
    for (var g = 0; g < groupFields.length; g++) {
      var raw = row[col[fieldMap[groupFields[g]]]];
      parts.push(String(raw === null || raw === undefined ? '' : raw).trim());
    }
    var key = parts.join('|');
    var ent = identities[key] || (identities[key] = { dates: {}, distinct: 0, blankRows: 0, rows: 0 });
    ent.rows++;
    if (dateBlank) { ent.blankRows++; }
    else if (!Object.prototype.hasOwnProperty.call(ent.dates, dateValue)) { ent.dates[dateValue] = 1; ent.distinct++; }

    if (dateBlank) {
      blankDateRows++;
      // "Otherwise importable" = every OTHER natural-key field is present, which is exactly the test the
      // importer applies. Measured with the shipped blank predicate.
      var otherOk = true;
      for (var g2 = 0; g2 < groupFields.length; g2++) {
        if (amazonIsBlank_(row[col[fieldMap[groupFields[g2]]]])) { otherOk = false; break; }
      }
      if (col[fieldMap.country] !== undefined && !amazonIsBlank_(row[col[fieldMap.country]])) blankDateWithCountry++;
      if (col[fieldMap.sku] !== undefined && !amazonIsBlank_(row[col[fieldMap.sku]])) blankDateWithSku++;
      if (otherOk) blankDateImportable++;
    }
  }

  var zero = 0, one = 0, many = 0, maxDistinct = 0, sample = [];
  for (var key2 in identities) {
    if (!Object.prototype.hasOwnProperty.call(identities, key2)) continue;
    var e = identities[key2];
    if (e.distinct === 0) zero++;
    else if (e.distinct === 1) one++;
    else {
      many++;
      if (sample.length < G1_SAMPLE_MAX_) {
        var dl = [];
        for (var d in e.dates) { if (Object.prototype.hasOwnProperty.call(e.dates, d)) dl.push(d); }
        dl.sort();
        sample.push({ identity: key2, distinct_dates: e.distinct, dates: dl.slice(0, 6), rows: e.rows });
      }
    }
    if (e.distinct > maxDistinct) maxDistinct = e.distinct;
  }

  return {
    table: destName,
    source_file_id: cfg.sourceId,
    source_sheet: cfg.sourceSheetName,
    source_header_names: header.filter(function (h) { return h !== ''; }),
    write_mode: cfg.writeMode || 'FULL_SNAPSHOT_REWRITE',
    shipped_natural_key: cfg.naturalKey.slice(),
    // §1: marketplace is config-fixed, so it is not a grouping dimension. Reported as a measurement.
    key_fields_from_fixed_values: fixedFields,
    key_fields_from_source: groupFields,
    key_fields_unresolved: unresolved,
    effective_grouping: groupFields.slice(),
    date_field: dateField,
    date_source_header: dateHeader,

    SOURCE_ROW_COUNT: sourceRows,
    LOGICAL_IDENTITY_COUNT: one + zero + many,
    IDENTITIES_WITH_0_DATE_VALUES: zero,
    IDENTITIES_WITH_1_DISTINCT_DATE: one,
    IDENTITIES_WITH_GT1_DISTINCT_DATES: many,
    MAX_DISTINCT_DATES_PER_IDENTITY: maxDistinct,
    COLLISION_SAMPLE: sample,

    BLANK_DATE_ROW_COUNT: blankDateRows,
    BLANK_DATE_ROWS_WITH_VALID_COUNTRY: blankDateWithCountry,
    BLANK_DATE_ROWS_WITH_VALID_SKU: blankDateWithSku,
    BLANK_DATE_ROWS_OTHERWISE_IMPORTABLE: blankDateImportable,
    INVALID_NONBLANK_DATE_ROW_COUNT: invalidDateRows
  };
}
