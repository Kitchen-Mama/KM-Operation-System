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
 * ONE TARGET. A bulk import is scoped to one country + one marketplace, so four smoke rows spread across
 * four targets would mean four uploads and four chances to get the scope wrong. All four cases are taken
 * from a SINGLE target whenever one can supply them, chosen from production data rather than asked for:
 * the completable targets are ranked by how many healthy rows they hold and then by name, so the answer is
 * the same on every run. When no single target can supply all four the tool says so, gives the minimum
 * number of uploads and the case-to-target plan, and does NOT quietly fall back to a spread selection.
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

    var country = tempPr4sStr_(v.country || m.country).toUpperCase();
    var marketplace = tempPr4sStr_(v.marketplace || m.marketplace);
    if (!country || !marketplace) return no('NO_COUNTRY_OR_MARKETPLACE');
    candidates.push({ id: id, rowNumber: r.rowNumber, v: v, m: m, currency: currency, f: f, status: status,
      country: country, marketplace: marketplace, scopeKey: country + '|' + marketplace });
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

  // THE TARGET CURRENCY IS TAKEN OVER EVERY ROW OF THE TARGET, not over the healthy ones, because that is
  // what the bulk update UI does: one unhealthy row carrying a second currency makes the whole target
  // un-importable, and a smoke plan that ignored it would send the operator to a target the screen refuses.
  var scopeCur = {};
  state.rows.forEach(function (r) {
    var v = r.values;
    var id = tempPr4sStr_(v.marketplace_sku_id); if (!id) return;
    var m = mIx[id] || {};
    var country = tempPr4sStr_(v.country || m.country).toUpperCase();
    var marketplace = tempPr4sStr_(v.marketplace || m.marketplace);
    if (!country || !marketplace) return;
    var key = country + '|' + marketplace;
    var cur = pricingStr_(v.currency).toUpperCase();
    var sc = scopeCur[key] || (scopeCur[key] = { __rows: 0 });
    sc.__rows++;
    if (cur) sc[cur] = (sc[cur] || 0) + 1;
  });

  // ROW D IS THE CONSTRAINED ONE: it needs a field whose effective value ALREADY equals its auto value, so
  // USE AUTO moves the ownership without moving the price a customer sees. Minimum is preferred, then MSRP,
  // then Regular — least customer-visible first, so that even if the equality check were somehow wrong the
  // blast radius is smallest.
  var PREF = ['minimum_price', 'msrp', 'regular_price'];
  function dRowOf(rows) {
    for (var pi = 0; pi < PREF.length; pi++) {
      for (var ci = 0; ci < rows.length; ci++) {
        var ff = rows[ci].f[PREF[pi]];
        if (ff.eff.value === ff.auto.value) return { row: rows[ci], field: PREF[pi] };
      }
    }
    return null;
  }

  var byScope = {};
  candidates.forEach(function (c) {
    var sc = byScope[c.scopeKey] || (byScope[c.scopeKey] = { key: c.scopeKey, country: c.country,
      marketplace: c.marketplace, rows: [] });
    sc.rows.push(c);
  });
  var scopeList = Object.keys(byScope).sort().map(function (k) {
    var sc = byScope[k];
    sc.pricingRowCount = (scopeCur[k] && scopeCur[k].__rows) || 0;
    sc.currencyList = Object.keys(scopeCur[k] || {}).filter(function (x) { return x !== '__rows'; }).sort();
    sc.currency = sc.currencyList.length === 1 ? sc.currencyList[0] : null;
    var d = dRowOf(sc.rows);
    sc.dRow = d ? d.row : null;
    sc.dField = d ? d.field : null;
    // Importable AND complete are different failures and are reported as different failures.
    sc.importable = !!sc.currency;
    sc.complete = !!(sc.importable && sc.dRow && sc.rows.length >= 4);
    return sc;
  });

  rule();
  p('TARGETS (country | marketplace), from the candidate rows');
  rule();
  scopeList.forEach(function (sc) {
    p('  ' + pad(sc.key, 26) + 'rows=' + pad(sc.rows.length, 5)
      + 'currency=' + pad(sc.currency || ('AMBIGUOUS ' + sc.currencyList.join('/')), 22)
      + 'AUTO-capable=' + (sc.dRow ? 'YES (' + sc.dField + ')' : 'no')
      + (sc.complete ? '   <- can host all four' : ''));
  });

  // THE RANKING, and it is a ranking rather than a preference so that two runs cannot disagree: the most
  // healthy rows first, then the name. Most rows is not vanity — it is the target where four rows are the
  // smallest fraction of what is live, and where a replacement row exists if one turns out unsuitable.
  var complete = scopeList.filter(function (sc) { return sc.complete; })
    .sort(function (a, b) { return b.rows.length - a.rows.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); });

  var chosen = complete.length ? complete[0] : null;
  var rowA = null, rowB = null, rowC = null, rowD = null, rowDField = null;
  var plan = null;

  if (chosen) {
    rowD = chosen.dRow; rowDField = chosen.dField;
    var rest = chosen.rows.filter(function (c) { return c.id !== rowD.id; });
    rowA = rest[0]; rowB = rest[1]; rowC = rest[2];
  } else {
    // NO SINGLE TARGET. The minimum number of uploads is computed exactly rather than guessed: for each
    // target that can host the AUTO case, take it plus the largest others until four rows are covered, and
    // keep the smallest count over all of them.
    var usable = scopeList.filter(function (sc) { return sc.importable; });
    var dScopes = usable.filter(function (sc) { return !!sc.dRow; });
    dScopes.forEach(function (d) {
      var others = usable.filter(function (sc) { return sc.key !== d.key; })
        .sort(function (a, b) { return b.rows.length - a.rows.length || (a.key < b.key ? -1 : 1); });
      var set = [d], total = d.rows.length, i = 0;
      while (total < 4 && i < others.length) { set.push(others[i]); total += others[i].rows.length; i++; }
      if (total >= 4 && (plan === null || set.length < plan.set.length)) plan = { set: set, d: d, total: total };
    });
    if (plan) {
      // Assign the cases: AUTO to the target that can host it, then the MANUAL cases in target order.
      rowD = plan.d.dRow; rowDField = plan.d.dField;
      var pool = [];
      plan.set.forEach(function (sc) {
        sc.rows.forEach(function (c) { if (c.id !== rowD.id) pool.push(c); });
      });
      rowA = pool[0]; rowB = pool[1]; rowC = pool[2];
    }
  }

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
    p('  ' + pad('pricing_id', 30) + '= ' + tempPr4sStr_(c.v.pricing_id));
    p('  ' + pad('TARGET (upload scope)', 30) + '= ' + c.scopeKey);
    p('  ' + pad('marketplace_sku_id', 30) + '= ' + c.id);
    p('  ' + pad('master_sku', 30) + '= ' + tempPr4sStr_(c.v.sku || c.m.sku));
    p('  ' + pad('site_sku', 30) + '= ' + tempPr4sStr_(c.v.site_sku || c.m.site_sku));
    p('  ' + pad('company', 30) + '= ' + tempPr4sStr_(c.m.company));
    p('  ' + pad('country', 30) + '= ' + tempPr4sStr_(c.v.country || c.m.country));
    p('  ' + pad('marketplace', 30) + '= ' + tempPr4sStr_(c.v.marketplace || c.m.marketplace));
    p('  ' + pad('currency', 30) + '= ' + c.currency + '   (' + pricingDecimalsFor_(c.currency) + ' decimals)');
    p('  ' + pad('price_status', 30) + '= ' + (tempPr4sStr_(c.v.price_status) || '(blank)')
      + '   (reported only — never used as a filter)');
    p('  ' + pad('marketplace_sku_status', 30) + '= ' + (c.status || '(blank)'));
    PRICING_FIELDS_.forEach(function (sp) { p('  ' + pad(sp.base, 30) + '= ' + c.f[sp.field].base.value); });
    PRICING_FIELDS_.forEach(function (sp) { p('  ' + pad(sp.auto, 30) + '= ' + c.f[sp.field].auto.value); });
    PRICING_FIELDS_.forEach(function (sp) {
      p('  ' + pad(sp.field, 30) + '= ' + c.f[sp.field].eff.value
        + (sp.field === field ? '   <- the field this row tests' : ''));
    });
    // A BLANK FLAG IS PRINTED AS WHAT IT MEANS. An empty space after the '=' would be transcribed as an
    // empty string or, worse, as FALSE — and the whole premise of the smoke is that these start unstated.
    PRICING_FIELDS_.forEach(function (sp) {
      var rawFlag = tempPr4sStr_(c.v[sp.flag]);
      p('  ' + pad(sp.flag, 30) + '= ' + (rawFlag === '' ? '(blank = UNKNOWN)' : rawFlag));
    });
    if (mode === 'AUTO') {
      p('  ' + pad('AUTO_SELECTED_FIELD', 30) + '= ' + field);
      p('  ' + pad('AUTO_EFFECTIVE_VALUE', 30) + '= ' + c.f[field].eff.value);
      p('  ' + pad('AUTO_REFERENCE_VALUE', 30) + '= ' + c.f[field].auto.value);
      p('  ' + pad('EFFECTIVE_EQUALS_AUTO', 30) + '= ' + (c.f[field].eff.value === c.f[field].auto.value ? 'YES' : 'NO'));
    } else {
      p('  ' + pad(tag + '_TEST_VALUE', 30) + '= ' + testValue(c, field)
        + '   (current + ' + TEMP_PR4S_TEST_DELTA_ + ' whole ' + c.currency + ')');
      p('  ' + pad(tag + '_RESTORE_VALUE', 30) + '= ' + c.f[field].eff.value + '   (what §8 puts back)');
    }
  }

  rule();
  p('THE SMOKE TARGET');
  rule();
  var singleScope = !!chosen;
  var scopesNeeded = chosen ? 1 : (plan ? plan.set.length : 0);
  p('SINGLE_SCOPE_SMOKE_AVAILABLE    = ' + (singleScope ? 'YES' : 'NO'));
  if (chosen) {
    p('SMOKE_TARGET_COUNTRY            = ' + chosen.country);
    p('SMOKE_TARGET_MARKETPLACE        = ' + chosen.marketplace);
    p('SMOKE_TARGET_CURRENCY           = ' + chosen.currency);
    p('TARGET_PRICING_ROW_COUNT        = ' + chosen.pricingRowCount + '   (every pricing_list row of this target)');
    p('TARGET_CANDIDATE_ROW_COUNT      = ' + chosen.rows.length + '   (those that pass every smoke guard)');
    p('SMOKE_SCOPE                     = ' + chosen.key);
    p('MINIMUM_SCOPES_REQUIRED         = 1');
    p('');
    p('WHY_THIS_TARGET                 = most qualifying rows, then name');
    p('  ' + complete.length + ' target(s) could host all four cases. Ranked:');
    complete.forEach(function (sc, i) {
      p('    ' + (i + 1) + '. ' + pad(sc.key, 26) + 'candidates=' + pad(sc.rows.length, 5)
        + 'currency=' + pad(sc.currency, 6) + (i === 0 ? '  <- selected' : ''));
    });
    p('  Most qualifying rows wins because four rows are then the smallest fraction of what is live there,');
    p('  and a replacement exists if one turns out unsuitable. Name breaks a tie, so two runs cannot differ.');
    p('  All four cases are ONE upload: Update -> Pricing -> ' + chosen.country + ' -> ' + chosen.marketplace + '.');
  } else if (plan) {
    p('SMOKE_TARGET_COUNTRY            = MULTIPLE — see the plan below');
    p('SMOKE_TARGET_MARKETPLACE        = MULTIPLE — see the plan below');
    p('SMOKE_TARGET_CURRENCY           = VARIES BY TARGET');
    p('TARGET_PRICING_ROW_COUNT        = n/a — no single target hosts the smoke');
    p('MINIMUM_SCOPES_REQUIRED         = ' + plan.set.length + '   (one upload each — the UI scopes an import to one target)');
    p('  No single target can supply all four cases. Every target either has fewer than four healthy rows,');
    p('  has no field whose effective price already equals its auto value, or carries more than one currency.');
    p('  THE EQUALITY RULE IS NOT RELAXED to make a single target work: an AUTO restore on a row whose');
    p('  effective and auto differ would move a live price, which is the one thing the runbook forbids.');
    p('  The plan below is the fewest uploads that covers all four:');
    var caseOf = {};
    if (rowA) (caseOf[rowA.scopeKey] = caseOf[rowA.scopeKey] || []).push('A');
    if (rowB) (caseOf[rowB.scopeKey] = caseOf[rowB.scopeKey] || []).push('B');
    if (rowC) (caseOf[rowC.scopeKey] = caseOf[rowC.scopeKey] || []).push('C');
    if (rowD) (caseOf[rowD.scopeKey] = caseOf[rowD.scopeKey] || []).push('D');
    plan.set.forEach(function (sc, i) {
      p('    Scope ' + (i + 1) + ':  ' + sc.country + ' / ' + sc.marketplace
        + '   currency=' + sc.currency + '   candidates=' + sc.rows.length);
      p('              hosts ' + ((caseOf[sc.key] || []).join(', ') || '(nothing — drop this scope)')
        + (sc.key === plan.d.key ? '   (the AUTO case is here)' : ''));
    });
  } else {
    p('MINIMUM_SCOPES_REQUIRED         = NOT ACHIEVABLE');
    p('  Either no target has a field whose effective price already equals its auto value, or fewer than');
    p('  four healthy rows exist across every importable target. Send this report back; which constraint');
    p('  to relax is an operator decision, not a diagnostic one.');
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
  // ONE BLOCK PER UPLOAD. A bulk import is scoped to one target, so rows from two targets in one file
  // would be refused as ROW_OUTSIDE_TARGET — correctly, and after the operator had built the file.
  var smokeRows = [];
  if (rowA) smokeRows.push({ c: rowA, field: 'regular_price', mode: 'MANUAL', value: testValue(rowA, 'regular_price') });
  if (rowB) smokeRows.push({ c: rowB, field: 'minimum_price', mode: 'MANUAL', value: testValue(rowB, 'minimum_price') });
  if (rowC) smokeRows.push({ c: rowC, field: 'msrp', mode: 'MANUAL', value: testValue(rowC, 'msrp') });
  if (rowD) smokeRows.push({ c: rowD, field: rowDField, mode: 'AUTO', value: '' });
  var uploadKeys = [];
  smokeRows.forEach(function (x) { if (uploadKeys.indexOf(x.c.scopeKey) === -1) uploadKeys.push(x.c.scopeKey); });
  uploadKeys.sort();
  uploadKeys.forEach(function (k, i) {
    p('--- UPLOAD ' + (i + 1) + ' of ' + uploadKeys.length + '   target ' + k + ' ---');
    p(TCOLS.join(','));
    smokeRows.forEach(function (x) {
      if (x.c.scopeKey === k) p(templateLine(x.c, x.field, x.mode, x.value));
    });
    p('');
  });
  p('AUTO carries an EMPTY value cell. A number there would be dropped at the file boundary and again at');
  p('the writer, but the file should say what it means.');

  rule();
  p('§8 — RESTORE_TEMPLATE_ROWS  (run AFTER acceptance; sets A/B/C back to the values above)');
  rule();
  var restoreRows = [];
  if (rowA) restoreRows.push({ c: rowA, field: 'regular_price', value: rowA.f.regular_price.eff.value });
  if (rowB) restoreRows.push({ c: rowB, field: 'minimum_price', value: rowB.f.minimum_price.eff.value });
  if (rowC) restoreRows.push({ c: rowC, field: 'msrp', value: rowC.f.msrp.eff.value });
  var restoreKeys = [];
  restoreRows.forEach(function (x) { if (restoreKeys.indexOf(x.c.scopeKey) === -1) restoreKeys.push(x.c.scopeKey); });
  restoreKeys.sort();
  restoreKeys.forEach(function (k, i) {
    p('--- RESTORE UPLOAD ' + (i + 1) + ' of ' + restoreKeys.length + '   target ' + k + ' ---');
    p(TCOLS.join(','));
    restoreRows.forEach(function (x) {
      if (x.c.scopeKey === k) p(templateLine(x.c, x.field, 'MANUAL', x.value));
    });
    p('');
  });
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
  var logPreTxt = (logPre === null ? 'UNAVAILABLE — ' + TEMP_PR4S_LOG_TAB_ + ' not present' : String(logPre));
  p('PRICING_CHANGE_LOG_PRE_COUNT    = ' + logPreTxt);
  p('CHANGE_LOG_PRE_COUNT            = ' + logPreTxt + '   (the same number, under the name earlier rounds used)');
  p('  (data rows, header excluded. Expect this + 4 after the smoke, + 3 more after the restore.)');

  rule();
  var ready = !!(rowA && rowB && rowC && rowD);
  p('REQUIRED OUTPUT — copy this block whole');
  rule();
  function req(k, v) { p(pad(k, 32) + '= ' + v); }
  function idOf(c) { return c ? c.id : 'NOT AVAILABLE'; }
  req('SINGLE_SCOPE_SMOKE_AVAILABLE', singleScope ? 'YES' : 'NO');
  req('SMOKE_TARGET_COUNTRY', chosen ? chosen.country : 'MULTIPLE');
  req('SMOKE_TARGET_MARKETPLACE', chosen ? chosen.marketplace : 'MULTIPLE');
  req('SMOKE_TARGET_CURRENCY', chosen ? chosen.currency : 'VARIES BY TARGET');
  req('TARGET_PRICING_ROW_COUNT', chosen ? chosen.pricingRowCount : 'n/a');
  req('SMOKE_SCOPE', chosen ? chosen.key : 'MULTIPLE — see the plan above');
  req('MINIMUM_SCOPES_REQUIRED', scopesNeeded || 'NOT ACHIEVABLE');
  req('SMOKE_ROW_A', idOf(rowA));
  req('SMOKE_ROW_B', idOf(rowB));
  req('SMOKE_ROW_C', idOf(rowC));
  req('SMOKE_ROW_D', idOf(rowD));
  req('A_TEST_VALUE', rowA ? testValue(rowA, 'regular_price') : 'NOT AVAILABLE');
  req('B_TEST_VALUE', rowB ? testValue(rowB, 'minimum_price') : 'NOT AVAILABLE');
  req('C_TEST_VALUE', rowC ? testValue(rowC, 'msrp') : 'NOT AVAILABLE');
  req('ROW_D_EFFECTIVE_EQUALS_AUTO',
    rowD ? (rowD.f[rowDField].eff.value === rowD.f[rowDField].auto.value ? 'YES' : 'NO') : 'NOT AVAILABLE');
  req('PRICING_CHANGE_LOG_PRE_COUNT', logPreTxt);
  req('SMOKE_PRE_SNAPSHOT_READY', ready ? 'YES' : 'NO — see the missing row above');
  // Stated by the tool rather than left to the person writing the report, because a diagnostic that
  // cannot write should say so in the same breath as the numbers it hands over.
  req('PRODUCTION_WRITE_AUTHORIZED', 'NO');
  req('DB_WRITES', '0');
  p('NOTHING HAS BEEN UPLOADED. This tool only reads.');
  rule();
  return done();
}
