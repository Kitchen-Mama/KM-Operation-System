/**
 * TEMP — PRICING-R4-OPERATOR-SMOKE §2/§3/§4 — SMOKE ROW SELECTION. READ ONLY.
 *
 * PASTE INTO THE APPS SCRIPT PROJECT -> RUN -> REPORT -> REMOVE.
 * Repository-only operator tool. NOT a release file and never synced as one.
 *
 *     TEMP_PRICING_R4_SMOKE_SELECT()     // reads pricing_list + marketplace_skus. Writes NOTHING.
 *
 * WHAT IT IS FOR. The smoke needs four real rows that satisfy a dozen conditions at once, and three of
 * those conditions cannot be seen by eye: whether an id is unique, whether its marketplace_skus row is
 * unique, and whether a field's effective price ALREADY equals its auto value. Picking by scrolling a
 * 495-row export is how a smoke lands on a phasing-out SKU or on a row whose USE AUTO would move a live
 * price. So the constraints are applied here, once, and the output is the §2 block, the §3 template rows,
 * the §4 pre-snapshot and the §8 restore rows — all from the same read, so they cannot disagree.
 *
 * IT IS DETERMINISTIC ON PURPOSE. Candidates are sorted by marketplace_sku_id and the first match wins, so
 * running it twice returns the same four rows. A selector that answered differently each run would make
 * the pre-snapshot describe rows the operator is no longer about to touch.
 *
 * WHAT IT DELIBERATELY DOES NOT FILTER ON. `price_status` is an OPEN QUESTION in
 * PRICING_DATABASE_MAPPING (§ open items: "default: draft or active — system convention unclear"). Using
 * it to include or exclude a row would settle that question inside a diagnostic, so it is reported per
 * candidate and never acted on. Lifecycle comes from marketplace_skus.marketplace_sku_status, which has a
 * validated vocabulary and a handler that maintains it.
 *
 * Every count here is a count. Nothing is classified, nothing is proposed, nothing is written.
 */

var TEMP_PR4S_PRICING_TAB_ = 'pricing_list';
var TEMP_PR4S_MSKU_TAB_ = 'marketplace_skus';
var TEMP_PR4S_LOG_TAB_ = 'pricing_change_log';

// THE TEST DELTA IS ONE WHOLE CURRENCY UNIT, and that is the reason rather than a convenience: adding 1.00
// leaves the minor units untouched, so a price of 44.99 becomes 45.99 and a price of 40.00 becomes 41.00.
// A row that already ends in .99 keeps its ending and a row that does not does not acquire one — which is
// PRICING-R4 §3's "no psychological adjustment unless the current value already is one", satisfied by
// arithmetic instead of by a rule somebody has to remember.
var TEMP_PR4S_TEST_DELTA_ = 1;

// A phasing-out or discontinued listing is a poor smoke subject: it may be delisted between the write and
// the restore. Set to false only if no active row qualifies and you have decided to accept that.
var TEMP_PR4S_REQUIRE_ACTIVE_ = true;

function tempPr4sStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function tempPr4sCsvCell_(v) {
  var s = String(v === undefined || v === null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function TEMP_PRICING_R4_SMOKE_SELECT() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  p('TEMP PRICING-R4 SMOKE ROW SELECTION — READ ONLY');
  p('generated_at (script clock): ' + new Date().toISOString());
  rule();

  // The authority gate. Precision, the field map and the number/flag readers all come from the deployed
  // 73_, because a selector that disagreed with the writer about what counts as a number would hand the
  // operator a row the upload then refuses.
  var missing = [];
  if (typeof prwReadSheet_ !== 'function') missing.push('prwReadSheet_');
  if (typeof pricingReadNumber_ !== 'function') missing.push('pricingReadNumber_');
  if (typeof pricingReadFlag_ !== 'function') missing.push('pricingReadFlag_');
  if (typeof pricingExceedsPrecision_ !== 'function') missing.push('pricingExceedsPrecision_');
  if (typeof pricingDecimalsFor_ !== 'function') missing.push('pricingDecimalsFor_');
  if (typeof pricingStr_ !== 'function') missing.push('pricingStr_');
  if (typeof PRICING_FIELDS_ === 'undefined') missing.push('PRICING_FIELDS_');
  if (typeof PRICING_FX_DECIMALS_ === 'undefined') missing.push('PRICING_FX_DECIMALS_');
  if (typeof PRICING_OWNER_UNKNOWN_ === 'undefined') missing.push('PRICING_OWNER_UNKNOWN_');
  if (missing.length) {
    p('AUTHORITY_NOT_LOADED — sync 73_api_v1_pricing_write.gs and SAVE first.');
    missing.forEach(function (n) { p('  missing: ' + n); });
    p('BLOCKED'); return done();
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var priceSheet = ss.getSheetByName(TEMP_PR4S_PRICING_TAB_);
  if (!priceSheet) { p('BLOCKED — ' + TEMP_PR4S_PRICING_TAB_ + ' is not present.'); return done(); }
  var mskuSheet = ss.getSheetByName(TEMP_PR4S_MSKU_TAB_);
  if (!mskuSheet) { p('BLOCKED — ' + TEMP_PR4S_MSKU_TAB_ + ' is not present; company and lifecycle live there.'); return done(); }
  var logSheet = ss.getSheetByName(TEMP_PR4S_LOG_TAB_);

  var state = prwReadSheet_(priceSheet);
  var msku = prwReadSheet_(mskuSheet);

  // marketplace_skus indexed by id, WITH its own duplicate detection: two rows for one id is an ambiguous
  // source, and the smoke must not run on one.
  var mIx = {}, mDupe = {};
  msku.rows.forEach(function (r) {
    var k = tempPr4sStr_(r.values.marketplace_sku_id);
    if (!k) return;
    if (mIx[k]) { mDupe[k] = 1; return; }
    mIx[k] = r.values;
  });

  // pricing_list duplicate detection, on the only identity a pricing row has.
  var seen = {}, pDupe = {};
  state.rows.forEach(function (r) {
    var k = tempPr4sStr_(r.values.marketplace_sku_id);
    if (!k) return;
    if (seen[k]) { pDupe[k] = 1; return; }
    seen[k] = 1;
  });

  var reject = {};
  function no(why) { reject[why] = (reject[why] || 0) + 1; return null; }

  var candidates = [];
  state.rows.forEach(function (r) {
    var v = r.values;
    var id = tempPr4sStr_(v.marketplace_sku_id);
    if (!id) return no('IDENTITY_MISSING');
    if (pDupe[id]) return no('DUPLICATE_IN_PRICING_LIST');
    if (mDupe[id]) return no('AMBIGUOUS_MARKETPLACE_SKUS_SOURCE');
    var m = mIx[id];
    if (!m) return no('NO_MARKETPLACE_SKUS_ROW');

    var currency = pricingStr_(v.currency).toUpperCase();
    if (!currency) return no('CURRENCY_MISSING');
    if (pricingDecimalsFor_(currency) === null) return no('CURRENCY_UNSUPPORTED');

    var status = tempPr4sStr_(m.marketplace_sku_status).toLowerCase();
    if (TEMP_PR4S_REQUIRE_ACTIVE_ && status !== 'active') return no('NOT_ACTIVE_' + (status || 'blank'));

    // Every flag must still be unstated. A row already carrying authority is a row somebody has decided
    // about, and a smoke is not the place to find out who.
    var flagsClean = true;
    PRICING_FIELDS_.forEach(function (sp) {
      if (pricingReadFlag_(v[sp.flag]) !== PRICING_OWNER_UNKNOWN_) flagsClean = false;
    });
    if (!flagsClean) return no('AUTHORITY_ALREADY_STATED');

    // A whole healthy row: every base present, every auto present, every effective present. §2 says avoid
    // blank base / blank auto, and a row that is healthy in one field and hollow in another is a poor
    // subject for a test whose entire point is that the other fields do not move.
    var f = {}, healthy = true;
    PRICING_FIELDS_.forEach(function (sp) {
      var base = pricingReadNumber_(v[sp.base]);
      var auto = pricingReadNumber_(v[sp.auto]);
      var eff = pricingReadNumber_(v[sp.field]);
      if (!base.present || !auto.present || !eff.present) healthy = false;
      f[sp.field] = { base: base, auto: auto, eff: eff };
    });
    if (!healthy) return no('BLANK_BASE_AUTO_OR_EFFECTIVE');

    // A price the currency cannot already hold would be REFUSED at upload as PRICE_PRECISION_UNSUPPORTED.
    // Finding that out at the Confirm step, after the pre-snapshot has been taken, wastes a whole cycle.
    var precisionOk = true;
    PRICING_FIELDS_.forEach(function (sp) {
      if (pricingExceedsPrecision_(f[sp.field].eff.value, currency)) precisionOk = false;
    });
    if (!precisionOk) return no('EFFECTIVE_EXCEEDS_CURRENCY_PRECISION');

    candidates.push({ id: id, rowNumber: r.rowNumber, v: v, m: m, currency: currency, f: f, status: status });
  });

  // Deterministic order, so a re-run selects the same four rows and the pre-snapshot stays true.
  candidates.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });

  rule();
  p('SELECTION FUNNEL');
  rule();
  p('PRICING_ROWS_TOTAL              = ' + state.rows.length);
  Object.keys(reject).sort().forEach(function (k) { p('  excluded ' + pad(k, 38) + reject[k]); });
  p('CANDIDATE_ROWS                  = ' + candidates.length);
  if (!candidates.length) {
    p('');
    p('NO CANDIDATE ROWS. Nothing below can be filled in. Send this funnel back rather than relaxing a');
    p('constraint here — which constraint to relax is an operator decision, not a diagnostic one.');
    p('BLOCKED'); return done();
  }

  // ROW D FIRST, because it is the most constrained: it needs a field whose effective value ALREADY equals
  // its auto value, so USE AUTO moves the ownership without moving the price a customer sees. Minimum is
  // preferred, then MSRP, then Regular — least customer-visible first, so that even if the equality check
  // were somehow wrong the blast radius is smallest.
  var PREF = ['minimum_price', 'msrp', 'regular_price'];
  var rowD = null, rowDField = null;
  for (var pi = 0; pi < PREF.length && !rowD; pi++) {
    for (var ci = 0; ci < candidates.length; ci++) {
      var c = candidates[ci], ff = c.f[PREF[pi]];
      if (ff.eff.value === ff.auto.value) { rowD = c; rowDField = PREF[pi]; break; }
    }
  }

  var used = {};
  if (rowD) used[rowD.id] = 1;
  function pick() {
    for (var i = 0; i < candidates.length; i++) if (!used[candidates[i].id]) { used[candidates[i].id] = 1; return candidates[i]; }
    return null;
  }
  var rowA = pick(), rowB = pick(), rowC = pick();

  var SPEC_BY_FIELD = {};
  PRICING_FIELDS_.forEach(function (sp) { SPEC_BY_FIELD[sp.field] = sp; });
  var LABEL = { regular_price: 'regular', minimum_price: 'minimum', msrp: 'msrp' };

  function testValue(c, field) {
    var d = pricingDecimalsFor_(c.currency);
    var raw = c.f[field].eff.value + TEMP_PR4S_TEST_DELTA_;
    var fpow = Math.pow(10, d);
    return Math.round(raw * fpow) / fpow;
  }

  function block(tag, c, field, mode) {
    rule();
    if (!c) {
      p('SMOKE_ROW_' + tag + ' = NOT AVAILABLE — fewer than four distinct candidate rows.');
      return;
    }
    p('SMOKE_ROW_' + tag + '   (' + (mode === 'AUTO' ? 'AUTO restore' : LABEL[field] + ' MANUAL smoke') + ')');
    p('  marketplace_sku_id            = ' + c.id);
    p('  master_sku                    = ' + tempPr4sStr_(c.v.sku || c.m.sku));
    p('  site_sku                      = ' + tempPr4sStr_(c.v.site_sku || c.m.site_sku));
    p('  company                       = ' + tempPr4sStr_(c.m.company));
    p('  country                       = ' + tempPr4sStr_(c.v.country || c.m.country));
    p('  marketplace                   = ' + tempPr4sStr_(c.v.marketplace || c.m.marketplace));
    p('  currency                      = ' + c.currency + '   (' + pricingDecimalsFor_(c.currency) + ' decimals)');
    p('  marketplace_sku_status        = ' + (c.status || '(blank)'));
    p('  price_status (reported, NOT used as a filter) = ' + (tempPr4sStr_(c.v.price_status) || '(blank)'));
    PRICING_FIELDS_.forEach(function (sp) {
      p('  ' + pad('current ' + LABEL[sp.field], 30) + '= ' + c.f[sp.field].eff.value
        + '   auto ' + LABEL[sp.field] + ' = ' + c.f[sp.field].auto.value
        + (sp.field === field ? '   <- the field this row tests' : ''));
    });
    if (mode === 'AUTO') {
      p('  selected field                = ' + field);
      p('  effective                     = ' + c.f[field].eff.value);
      p('  auto                          = ' + c.f[field].auto.value);
      p('  effective_equals_auto         = ' + (c.f[field].eff.value === c.f[field].auto.value ? 'YES' : 'NO'));
    } else {
      p('  TEST VALUE (current + ' + TEMP_PR4S_TEST_DELTA_ + ')     = ' + testValue(c, field));
      p('  RESTORE VALUE (the current one) = ' + c.f[field].eff.value);
    }
  }

  rule();
  p('§2 — THE FOUR SELECTED ROWS');
  block('A', rowA, 'regular_price', 'MANUAL');
  block('B', rowB, 'minimum_price', 'MANUAL');
  block('C', rowC, 'msrp', 'MANUAL');
  block('D', rowD, rowDField, 'AUTO');

  if (!rowD) {
    rule();
    p('SMOKE_ROW_D = NOT AVAILABLE.');
    p('No candidate row has any field whose effective price already equals its auto value, so every');
    p('possible AUTO restore would MOVE a live price. Per the runbook: stop and report, rather than');
    p('running row D against a row whose effective and auto differ. Rows A/B/C are unaffected.');
  }

  // ---- §3 / §8 — the exact file contents ------------------------------------------------------------
  var TCOLS = ['marketplace_sku_id', 'master_sku', 'site_sku', 'company', 'country', 'marketplace', 'currency',
    'regular_price_mode', 'regular_price', 'minimum_price_mode', 'minimum_price', 'msrp_mode', 'msrp'];
  function templateLine(c, field, mode, value) {
    var o = {
      marketplace_sku_id: c.id,
      master_sku: tempPr4sStr_(c.v.sku || c.m.sku),
      site_sku: tempPr4sStr_(c.v.site_sku || c.m.site_sku),
      company: tempPr4sStr_(c.m.company),
      country: tempPr4sStr_(c.v.country || c.m.country),
      marketplace: tempPr4sStr_(c.v.marketplace || c.m.marketplace),
      currency: c.currency
    };
    PRICING_FIELDS_.forEach(function (sp) {
      o[sp.mode] = (sp.field === field) ? mode : 'NO_CHANGE';
      o[sp.field] = (sp.field === field && mode === 'MANUAL') ? String(value) : '';
    });
    return TCOLS.map(function (k) { return tempPr4sCsvCell_(o[k]); }).join(',');
  }

  rule();
  p('§3 — SMOKE_TEMPLATE_ROWS  (paste under the template header, unedited rows may stay or be deleted)');
  rule();
  p(TCOLS.join(','));
  if (rowA) p(templateLine(rowA, 'regular_price', 'MANUAL', testValue(rowA, 'regular_price')));
  if (rowB) p(templateLine(rowB, 'minimum_price', 'MANUAL', testValue(rowB, 'minimum_price')));
  if (rowC) p(templateLine(rowC, 'msrp', 'MANUAL', testValue(rowC, 'msrp')));
  if (rowD) p(templateLine(rowD, rowDField, 'AUTO', ''));
  p('');
  p('AUTO carries an EMPTY value cell. A number there would be dropped at the file boundary and again at');
  p('the writer, but the file should say what it means.');

  rule();
  p('§8 — RESTORE_TEMPLATE_ROWS  (run AFTER acceptance; sets A/B/C back to the values above)');
  rule();
  p(TCOLS.join(','));
  if (rowA) p(templateLine(rowA, 'regular_price', 'MANUAL', rowA.f.regular_price.eff.value));
  if (rowB) p(templateLine(rowB, 'minimum_price', 'MANUAL', rowB.f.minimum_price.eff.value));
  if (rowC) p(templateLine(rowC, 'msrp', 'MANUAL', rowC.f.msrp.eff.value));
  p('');
  p('ROW D HAS NO RESTORE LINE, and that is deliberate: its price never moved, and setting it MANUAL would');
  p('write TRUE — further from where it started, not closer. Its flag stays FALSE unless a person clears');
  p('the cell by hand.');
  p('The restore leaves A/B/C flags at TRUE. OWNERSHIP_RETURNED_TO_UNKNOWN = NO, by design.');

  // ---- §4 — the pre-snapshot -------------------------------------------------------------------------
  var SNAP = ['pricing_id', 'marketplace_sku_id', 'currency',
    'base_regular_price', 'base_minimum_price', 'base_msrp',
    'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
    'regular_price', 'minimum_price', 'msrp',
    'regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual',
    'updated_at', 'updated_by'];
  rule();
  p('§4 — SMOKE_PRE_SNAPSHOT  (copy this block verbatim; it is the acceptance baseline AND the rollback data)');
  rule();
  p(SNAP.join(','));
  [rowA, rowB, rowC, rowD].forEach(function (c) {
    if (!c) return;
    p(SNAP.map(function (k) { return tempPr4sCsvCell_(tempPr4sStr_(c.v[k])); }).join(','));
  });
  p('');
  p('A blank in a flag column above is the UNKNOWN state, not an empty string and not FALSE. After the');
  p('smoke those four cells are the only ones that cannot be put back by this tool.');

  var logPre = logSheet ? Math.max(0, logSheet.getLastRow() - 1) : null;
  p('');
  p('CHANGE_LOG_PRE_COUNT            = ' + (logPre === null ? 'UNAVAILABLE — ' + TEMP_PR4S_LOG_TAB_ + ' not present' : logPre));
  p('  (data rows, header excluded. Expect this + 4 after the smoke, + 3 more after the restore.)');

  rule();
  var ready = !!(rowA && rowB && rowC && rowD);
  p('SMOKE_PRE_SNAPSHOT_READY        = ' + (ready ? 'YES' : 'NO — see the missing row above'));
  p('DB_WRITES                       = 0');
  p('NOTHING HAS BEEN UPLOADED. This tool only reads.');
  rule();
  return done();
}
