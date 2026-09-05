/* ================================================================================================================
 * KMARC — ACTIVE ROUTE CLASSIFICATION  (F1-7N-FC-1B-E3-R4-A2-R1-R6-R2 §2)
 * ----------------------------------------------------------------------------------------------------------------
 * THE PAGE AND THE CENSUS WERE ANSWERING THE SAME QUESTION WITH TWO DIFFERENT PREDICATES, AND ONE OF THEM COULD
 * NEVER BE TRUE.
 *
 * The live screen showed two persisted routes totalling 520 units. The census, reading the same sheet in the same
 * scope in the same minute, reported `active_allocation_drafts: 0`. Both numbers were produced honestly; they were
 * simply not answers to the same question.
 *
 *   THE PAGE asked: status is not `cancelled` and not `submitted`, country exact, scope-marketplace exact, and
 *   (since R6-R1) company exact.
 *
 *   THE CENSUS asked: status === 'active', company exact, country exact, and `destination_marketplace` matching
 *   when present.
 *
 * THE CENSUS PREDICATE HAS NO SATISFIER. The canonical header status enum is 16_ `SAD_STATUSES_` =
 * { draft, site_confirmed, submitted, cancelled, expired } — `active` is not a member of it. The write handler
 * coerces anything unrecognised to `draft` (`if (!SAD_STATUSES_[status]) status = 'draft';`), so no writer in this
 * system has ever produced the value the census tests for. `active_allocation_drafts: 0` was therefore not a
 * measurement of the data at all: it is a constant, and it would read 0 against a sheet holding ten thousand rows.
 * That is the whole of the 520-vs-0 discrepancy, and it is a defect in the DIAGNOSTIC, not in the data.
 *
 * The server itself already knows the right answer and states it three times — `sadK2ResolveActiveDraft_`,
 * `sadK4ResolveActiveDraft_` and the scope resolver each open with the identical literal
 * `var ACTIVE = { draft: 1, site_confirmed: 1, partially_submitted: 1 };`. Three copies of a rule are three
 * chances to drift, and the census's fourth copy is what drifted. This module is the ONE named owner.
 *
 * WHICH MARKETPLACE COLUMN IS THE SCOPE. `marketplace` and `destination_marketplace` are different facts.
 * `marketplace` is the STATION the header belongs to — the company/country/marketplace the operator has on
 * screen. `destination_marketplace` is a ROUTE dimension: where the goods are going, and one of ricK4GroupKey_'s
 * identity axes. Scope membership is decided by the station, never by the destination, because a route whose
 * destination is a 3PL warehouse has a BLANK destination_marketplace and is still unambiguously part of its
 * station's plan. The census matched on the destination column and so would have dropped exactly those rows.
 *
 * A BLANK IS NEVER A WILDCARD, ON EITHER SIDE. R6-R1 established this for company after finding that an unknown
 * page company matched every stored row and a stored row with a blank company matched every company. The rule is
 * the same for all three axes here: a blank on the query and a blank on the row are both refusals. Fail closed.
 *
 * THIS MODULE DECIDES NOTHING ELSE. It does not read a sheet, it does not know what a quantity is for, it never
 * mutates its input, and it has no opinion about whether a route should exist. It answers one question — is THIS
 * persisted header part of THAT station's current plan, and if not, which axis excluded it — so that the page and
 * the census can stop guessing at each other's arithmetic.
 * ================================================================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KMARC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The three statuses in which a header is part of a live plan. Byte-for-byte the server's own ACTIVE literal
  // (16_ sadK2ResolveActiveDraft_ / sadK4ResolveActiveDraft_). `partially_submitted` is not in SAD_STATUSES_ and
  // is kept anyway, exactly as the server keeps it: the server is the authority on what it treats as live, and a
  // status it accepts as active must not become invisible here.
  var ACTIVE_STATUSES = { draft: 1, site_confirmed: 1, partially_submitted: 1 };
  // The statuses that end a header's participation. Named individually because they mean different things to a
  // reader: submitted became a shipment, cancelled was withdrawn, expired aged out of its cycle.
  var TERMINAL_STATUSES = { submitted: 1, cancelled: 1, expired: 1 };

  var STATUS_CLASS = {
    ACTIVE: 'ACTIVE',                       // in ACTIVE_STATUSES
    TERMINAL: 'TERMINAL',                   // in TERMINAL_STATUSES
    BLANK: 'BLANK',                         // no status stored at all
    UNRECOGNISED: 'UNRECOGNISED'            // a value in neither set — reported, never guessed at
  };

  // Every reason a header can fail to count. One row is attributed to EVERY axis that excluded it, so a reader
  // sees the whole picture rather than the first thing that happened to be checked.
  var EXCLUSION = {
    STATUS_TERMINAL: 'STATUS_TERMINAL',
    STATUS_BLANK: 'STATUS_BLANK',
    STATUS_UNRECOGNISED: 'STATUS_UNRECOGNISED',
    COMPANY_BLANK_ON_ROW: 'COMPANY_BLANK_ON_ROW',
    COMPANY_BLANK_ON_SCOPE: 'COMPANY_BLANK_ON_SCOPE',
    COMPANY_MISMATCH: 'COMPANY_MISMATCH',
    COUNTRY_BLANK_ON_ROW: 'COUNTRY_BLANK_ON_ROW',
    COUNTRY_BLANK_ON_SCOPE: 'COUNTRY_BLANK_ON_SCOPE',
    COUNTRY_MISMATCH: 'COUNTRY_MISMATCH',
    MARKETPLACE_BLANK_ON_ROW: 'MARKETPLACE_BLANK_ON_ROW',
    MARKETPLACE_BLANK_ON_SCOPE: 'MARKETPLACE_BLANK_ON_SCOPE',
    MARKETPLACE_MISMATCH: 'MARKETPLACE_MISMATCH'
  };

  var CONTRACT = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R2 2 - a header counts toward a station current plan when its '
    + 'status is one of {draft, site_confirmed, partially_submitted} AND company, country and the STATION '
    + 'marketplace all match exactly. A blank on either side of any axis is a refusal, never a wildcard. '
    + 'destination_marketplace is route identity and is never a scope input.';

  function str(v) { return String(v == null ? '' : v).trim(); }
  function lo(v) { return str(v).toLowerCase(); }

  function statusClass(v) {
    var s = lo(v);
    if (!s) return STATUS_CLASS.BLANK;
    if (ACTIVE_STATUSES[s] === 1) return STATUS_CLASS.ACTIVE;
    if (TERMINAL_STATUSES[s] === 1) return STATUS_CLASS.TERMINAL;
    return STATUS_CLASS.UNRECOGNISED;
  }

  // One axis, three outcomes, both blanks refused. Returns '' when the axis matches.
  function axis(rowValue, scopeValue, blankRow, blankScope, mismatch) {
    var r = lo(rowValue), q = lo(scopeValue);
    if (!q) return blankScope;
    if (!r) return blankRow;
    return (r === q) ? '' : mismatch;
  }

  /**
   * Classify one persisted allocation-draft HEADER against one station.
   *
   * `row` is read verbatim from the sheet/DTO and is never mutated. Both the snake_case sheet spelling and the
   * page's camelCase DTO spelling are accepted, because the page and the census hold the same row in two shapes
   * and neither shape is more correct than the other.
   */
  function classifyHeader(row, scope) {
    row = row || {}; scope = scope || {};
    var status = str(row.status);
    var cls = statusClass(status);
    var reasons = [];

    if (cls === STATUS_CLASS.TERMINAL) reasons.push(EXCLUSION.STATUS_TERMINAL);
    else if (cls === STATUS_CLASS.BLANK) reasons.push(EXCLUSION.STATUS_BLANK);
    else if (cls === STATUS_CLASS.UNRECOGNISED) reasons.push(EXCLUSION.STATUS_UNRECOGNISED);

    var rowCompany = row.company != null ? row.company : row.Company;
    var rowCountry = row.country != null ? row.country : row.Country;
    // The STATION marketplace, never `destination_marketplace`. See the header note.
    var rowMarketplace = row.marketplace != null ? row.marketplace : row.Marketplace;

    var scopeReasons = [];
    var a = axis(rowCompany, scope.company, EXCLUSION.COMPANY_BLANK_ON_ROW, EXCLUSION.COMPANY_BLANK_ON_SCOPE, EXCLUSION.COMPANY_MISMATCH);
    if (a) scopeReasons.push(a);
    a = axis(rowCountry, scope.country, EXCLUSION.COUNTRY_BLANK_ON_ROW, EXCLUSION.COUNTRY_BLANK_ON_SCOPE, EXCLUSION.COUNTRY_MISMATCH);
    if (a) scopeReasons.push(a);
    a = axis(rowMarketplace, scope.marketplace, EXCLUSION.MARKETPLACE_BLANK_ON_ROW, EXCLUSION.MARKETPLACE_BLANK_ON_SCOPE, EXCLUSION.MARKETPLACE_MISMATCH);
    if (a) scopeReasons.push(a);

    return {
      allocation_draft_id: str(row.allocation_draft_id || row.allocationDraftId),
      status: status,
      status_class: cls,
      lifecycle_active: cls === STATUS_CLASS.ACTIVE,
      scope_match: scopeReasons.length === 0,
      scope_reasons: scopeReasons,
      // THE one question. A header counts toward a station's current plan when it is lifecycle-active AND every
      // scope axis matches exactly. Nothing else participates in this decision.
      counts_toward_current_plan: (cls === STATUS_CLASS.ACTIVE) && scopeReasons.length === 0,
      exclusion_reasons: reasons.concat(scopeReasons),
      // Route identity dimensions, carried for the report. NOT scope inputs — see the header note.
      destination_marketplace: str(row.destination_marketplace || row.destinationMarketplace),
      contract: CONTRACT
    };
  }

  // Partition a list of headers in one pass. `included` / `excluded` are the two sides of
  // counts_toward_current_plan, and `by_reason` is the histogram a reader needs to see WHY a total is what it is.
  function partitionHeaders(rows, scope) {
    var included = [], excluded = [], byReason = {};
    (rows || []).forEach(function (r) {
      var c = classifyHeader(r, scope);
      if (c.counts_toward_current_plan) { included.push(c); return; }
      excluded.push(c);
      c.exclusion_reasons.forEach(function (k) { byReason[k] = (byReason[k] || 0) + 1; });
    });
    return {
      contract: CONTRACT,
      examined: (rows || []).length,
      included: included, excluded: excluded,
      included_ids: included.map(function (c) { return c.allocation_draft_id; }),
      excluded_ids_with_reason: excluded.map(function (c) {
        return { allocation_draft_id: c.allocation_draft_id, reasons: c.exclusion_reasons };
      }),
      by_reason: byReason
    };
  }

  // A LINE is terminal on its own axis, independently of its header. `submitted` is deliberately NOT terminal
  // here: 16_ keeps a submitted line in its active set (a partially submitted header still owns the quantity it
  // submitted), and this must not disagree with the writer.
  var TERMINAL_LINE_STATUSES = { cancelled: 1, expired: 1 };
  function lineCounts(line) {
    var s = lo(line && line.line_status != null ? line.line_status : (line && line.lineStatus));
    return !(TERMINAL_LINE_STATUSES[s] === 1);
  }

  // The planned quantity a line contributes. `planned_qty` is what an operator decided; `recommended_qty` is
  // what a generation proposed. The decided value wins whenever one exists, and a blank is not a zero.
  function lineQuantity(line) {
    line = line || {};
    var p = line.planned_qty != null ? line.planned_qty : line.plannedQty;
    if (p !== null && p !== undefined && str(p) !== '') {
      var n = Number(p);
      if (isFinite(n)) return n;
    }
    var r = line.recommended_qty != null ? line.recommended_qty : line.recommendedQty;
    var m = Number(r);
    return (str(r) !== '' && isFinite(m)) ? m : 0;
  }

  // The station's CURRENT PLAN TOTAL: every counting line of every counting header. This is the single
  // arithmetic both the page and the census report, so `totals_agree` is a property rather than a coincidence.
  function currentPlanTotal(headers, lines, scope) {
    var part = partitionHeaders(headers, scope);
    var keep = {};
    part.included_ids.forEach(function (id) { if (id) keep[id] = 1; });
    var total = 0, counted = [];
    (lines || []).forEach(function (l) {
      var hid = str(l && (l.allocation_draft_id || l.allocationDraftId));
      if (!hid || !keep[hid]) return;
      if (!lineCounts(l)) return;
      var q = lineQuantity(l);
      total += q;
      counted.push({ allocation_draft_line_id: str(l.allocation_draft_line_id || l.allocationDraftLineId),
        allocation_draft_id: hid, sku: str(l.sku), quantity: q });
    });
    return { contract: CONTRACT, total: total, header_partition: part, counted_lines: counted };
  }

  return {
    CONTRACT: CONTRACT,
    ACTIVE_STATUSES: ACTIVE_STATUSES,
    TERMINAL_STATUSES: TERMINAL_STATUSES,
    TERMINAL_LINE_STATUSES: TERMINAL_LINE_STATUSES,
    STATUS_CLASS: STATUS_CLASS,
    EXCLUSION: EXCLUSION,
    statusClass: statusClass,
    classifyHeader: classifyHeader,
    partitionHeaders: partitionHeaders,
    lineCounts: lineCounts,
    lineQuantity: lineQuantity,
    currentPlanTotal: currentPlanTotal,
    _version: 'f1-7n-fc-1b-e3-r4-a2-r1-r6-r2-active-route-classification'
  };
});
