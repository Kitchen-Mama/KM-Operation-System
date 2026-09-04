/* ================================================================================================================
 * KMSNF — SCHEDULE-AWARE SNAPSHOT FRESHNESS  (F1-7N-FC-1B-E3-R4-A2-R1 §3)
 * ----------------------------------------------------------------------------------------------------------------
 * "IS THIS SNAPSHOT CURRENT?" IS A QUESTION ABOUT THE SCHEDULE, NOT ABOUT THE CALENDAR.
 *
 * R4 answered it with `rec.calculation_date !== todayInTaipei` and called the difference STALE. That reads as
 * reasonable until you notice what it means: the Inventory Gap materialization is a DAILY 13:30 Asia/Taipei
 * automation, so between midnight and roughly half past one in the afternoon there is no row on today's date
 * for any scope, and the rule declares the entire database stale every single morning. At 10:41 on 2026-09-04
 * it refused a complete, successful 2026-09-03 snapshot — the newest thing that has ever existed — and called
 * it a data problem.
 *
 * The honest question has three parts, and only the third is about dates:
 *
 *   1. WHERE ARE WE IN TODAY'S SCHEDULE? Before the run is due, yesterday's complete result IS the current
 *      one; there is nothing newer and nothing is late. While the run is in flight, yesterday's complete
 *      result is STILL the current one, because a half-written today is not a better answer than a finished
 *      yesterday. Only after the run should have finished does its absence become a fault.
 *   2. IS WHAT WE HAVE INTERNALLY CONSISTENT? A group whose rows carry two different calculation dates is a
 *      run caught mid-write. That is never acceptable, at any hour, and it is a separate failure from being
 *      late.
 *   3. DOES ITS LINEAGE MATCH WHAT WE ARE PLANNING? A snapshot from another planning cycle is not this plan's
 *      demand regardless of how recent it is.
 *
 * WHY THIS IS NOT AN AGE TOLERANCE. "Accept anything under 36 hours" would also have accepted the 2026-09-03
 * rows, and it would have gone on accepting them at 14:00 the next day when today's run had genuinely failed.
 * A tolerance cannot tell "not due yet" from "due and missing", and those two need opposite answers. The
 * schedule is what separates them, so the schedule is what this reads.
 *
 * AND IT IS NOT "YESTERDAY IS ALWAYS FINE" EITHER. There is no rule here that a previous date is acceptable.
 * What is acceptable is the LATEST COMPLETE run, whatever date it carries, and only while today's run is not
 * yet overdue. Once it is overdue or has failed, the same 2026-09-03 snapshot is refused with a typed code.
 *
 * THE CLOCK IS THE SERVER'S. Every input is passed in — the epoch millisecond, the timezone offset, the
 * schedule — and nothing here reads a clock or a browser. A browser clock is not a planning authority, and a
 * module that cannot read one cannot be made into a place where that rule is broken later.
 *
 * COMPLETENESS, HONESTLY. The materialized table carries no run_id column (43_ upserts row by row, keyed by
 * business key), so "this run finished" cannot be read off a row. What CAN be read is agreement: a group whose
 * rows all carry one calculation_date was written by one run, and a group carrying two was not. That is the
 * completeness signal used here, and it is corroborated — never overridden — by the job state when the caller
 * can supply it. Where the two disagree, the more cautious answer wins.
 *
 * Exports: STATES, assess(input) → { state, ok, acceptedDate, reason, detail }.
 * ================================================================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KMSNF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATES = {
    CURRENT_PRE_SCHEDULE: 'CURRENT_PRE_SCHEDULE',
    CURRENT_DURING_REFRESH: 'CURRENT_DURING_REFRESH',
    CURRENT_AFTER_REFRESH: 'CURRENT_AFTER_REFRESH',
    REFRESH_OVERDUE: 'REFRESH_OVERDUE',
    REFRESH_FAILED: 'REFRESH_FAILED',
    PARTIAL_SNAPSHOT_BLOCKED: 'PARTIAL_SNAPSHOT_BLOCKED',
    LINEAGE_MISMATCH: 'LINEAGE_MISMATCH',
    NO_COMPLETE_SNAPSHOT: 'NO_COMPLETE_SNAPSHOT',
    SCHEDULE_UNRESOLVED: 'SCHEDULE_UNRESOLVED'
  };
  // The states in which a snapshot may be used. Everything else is a typed block.
  var ACCEPTING = { CURRENT_PRE_SCHEDULE: 1, CURRENT_DURING_REFRESH: 1, CURRENT_AFTER_REFRESH: 1 };

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  var YMD = /^\d{4}-\d{2}-\d{2}$/;

  // The business calendar day and minute-of-day at an epoch instant, in a FIXED-offset zone. Asia/Taipei has no
  // DST, which is why a fixed offset is correct here and would not be for a zone that observes it.
  function businessNow(nowMs, offsetMinutes) {
    var d = new Date(nowMs + offsetMinutes * 60000);
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return {
      ymd: y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day,
      minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
      hhmm: ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2)
    };
  }

  /* ==============================================================================================================
   * canonicalDate(value, offsetMinutes) — THE ONE PLACE A SNAPSHOT DATE BECOMES A DATE.
   *
   * WHAT WENT WRONG, AND WHY IT LOOKED LIKE A DATA FAULT. A Google Sheets cell formatted as a date does not
   * hand JavaScript the text you see in the cell — it hands back a Date OBJECT, an absolute instant. The
   * snapshot reader put that value through a generic `String(v).trim()`, which is how a perfectly good row
   * arrived at the freshness authority as
   *
   *     "Thu Sep 03 2026 00:00:00 GMT+0800 (Taiwan Standard Time)"
   *
   * failed the YYYY-MM-DD test, and was reported as an unreadable lineage — LINEAGE_MISMATCH, the branch that
   * exists for corrupt provenance. Nothing was corrupt. The reader simply could not read its own column, and
   * the resulting refusal accused the database of a fault that belonged to the code.
   *
   * WHY toISOString().slice(0, 10) IS NOT THE FIX, and is in fact a worse bug. Taipei midnight on 2026-09-03
   * is 2026-09-02T16:00:00Z, so the ISO form of that instant is "2026-09-02". Every daily snapshot would
   * silently shift one business day earlier — the snapshot would still be read, still be accepted, and be
   * wrong by a day with nothing in the output to show it. A refusal you can see beats a number you cannot
   * check. The conversion therefore goes through the SAME fixed-offset business-zone arithmetic `businessNow`
   * uses (Asia/Taipei is UTC+8 with no DST, which is what makes a fixed offset correct here), and is
   * equivalent to Utilities.formatDate(value, AUTOMATION_TZ_, 'yyyy-MM-dd') at the Apps Script boundary.
   *
   * TWO INPUTS ARE LEGAL AND NOTHING ELSE IS: a real Date object, and a canonical YYYY-MM-DD string. A blank,
   * an Invalid Date, a locale string, a number, a datetime string — every one of them is UNKNOWN, and unknown
   * never becomes a date. Widening this to "parse whatever arrives" would reintroduce exactly the ambiguity
   * that produced the shift: Date.parse is locale- and runtime-dependent, and a value it happens to accept is
   * not thereby a value we know the meaning of.
   *
   * Returns { ok, date, kind, reason }.
   */
  function canonicalDate(value, offsetMinutes) {
    // The zone is an AUTHORITY, not a default. Without it a Date object cannot be resolved to a business day
    // at all, and guessing one is how a snapshot silently lands on the wrong side of midnight.
    if (!isInt(offsetMinutes)) {
      return { ok: false, date: null, kind: 'UNKNOWN', reason: 'TIMEZONE_AUTHORITY_UNAVAILABLE' };
    }
    if (value === null || value === undefined || value === '') {
      return { ok: false, date: null, kind: 'BLANK', reason: 'CALCULATION_DATE_MISSING' };
    }
    // A Date is identified by BEHAVIOUR, not by `instanceof`: the value crosses a VM/realm boundary between the
    // spreadsheet runtime and this module, and `instanceof Date` is false for a Date from another realm.
    if (typeof value === 'object' && typeof value.getTime === 'function') {
      var t = value.getTime();
      if (typeof t !== 'number' || !isFinite(t)) {
        return { ok: false, date: null, kind: 'DATE', reason: 'CALCULATION_DATE_INVALID_DATE' };
      }
      var b = businessNow(t, offsetMinutes);
      return { ok: true, date: b.ymd, kind: 'DATE', reason: null };
    }
    if (typeof value === 'string') {
      var sv = value.trim();
      if (!YMD.test(sv)) {
        return { ok: false, date: null, kind: 'STRING', reason: 'CALCULATION_DATE_UNREADABLE' };
      }
      // Shape is not existence: "2026-02-31" matches the pattern and is not a day.
      var y = Number(sv.slice(0, 4)), mo = Number(sv.slice(5, 7)), da = Number(sv.slice(8, 10));
      var probe = new Date(Date.UTC(y, mo - 1, da));
      if (probe.getUTCFullYear() !== y || probe.getUTCMonth() + 1 !== mo || probe.getUTCDate() !== da) {
        return { ok: false, date: null, kind: 'STRING', reason: 'CALCULATION_DATE_NOT_A_CALENDAR_DAY' };
      }
      return { ok: true, date: sv, kind: 'STRING', reason: null };
    }
    // A number, a boolean, an array. Sheets can return a number for a mis-formatted cell, and a serial number
    // read as a date is precisely the kind of silent wrongness this function exists to refuse.
    return { ok: false, date: null, kind: typeof value === 'number' ? 'NUMBER' : 'OTHER',
      reason: 'CALCULATION_DATE_UNREADABLE' };
  }

  /**
   * assess(input) → the freshness verdict.
   *
   * input:
   *   nowMs                  epoch ms, SERVER-supplied
   *   utcOffsetMinutes       the business zone's fixed offset (Asia/Taipei = 480)
   *   schedule               { enabled, hour, minute, driftMinutes, completionBudgetMinutes }
   *                          hour/minute = the configured daily start; drift = the trigger's own firing window;
   *                          budget = how long the run may legitimately take before its absence is a fault.
   *   snapshotDates          [{ date, status, rowCount, planningCycle }] — one entry per DISTINCT calculation_date
   *                          present for the scope being planned.
   *   expectedPlanningCycle  the cycle this plan belongs to
   *   jobState               optional { status, runId, startedAtDate (YYYY-MM-DD, business zone), product } — corroboration only
   */
  function assess(input) {
    input = input || {};
    var out = {
      state: null, ok: false, acceptedDate: null, acceptedCycle: null, reason: null,
      businessNow: null, scheduledStart: null, overdueAfter: null, detail: {}
    };

    // ---- the clock, and it must be given to us -------------------------------------------------------------
    if (!isInt(input.nowMs)) {
      out.state = STATES.SCHEDULE_UNRESOLVED;
      out.reason = 'nowMs must be supplied by the SERVER — this module never reads a clock';
      return out;
    }
    var offset = isInt(input.utcOffsetMinutes) ? input.utcOffsetMinutes : null;
    if (offset === null) {
      out.state = STATES.SCHEDULE_UNRESOLVED;
      out.reason = 'utcOffsetMinutes must be supplied — the business zone is not guessed';
      return out;
    }
    var now = businessNow(input.nowMs, offset);
    out.businessNow = { date: now.ymd, time: now.hhmm, minuteOfDay: now.minuteOfDay, utcOffsetMinutes: offset };

    // ---- the schedule --------------------------------------------------------------------------------------
    var sch = input.schedule || {};
    if (!isInt(sch.hour) || sch.hour < 0 || sch.hour > 23 || !isInt(sch.minute) || sch.minute < 0 || sch.minute > 59) {
      out.state = STATES.SCHEDULE_UNRESOLVED;
      out.reason = 'the daily schedule is unresolved — without it "late" has no meaning and nothing may be assumed';
      return out;
    }
    var startMin = sch.hour * 60 + sch.minute;
    // The trigger's own firing window (Apps Script fires NEAR a minute, not at it) plus the run's budget. Both
    // are inputs: a deployment that changes its schedule changes this without touching the rule.
    var drift = isInt(sch.driftMinutes) ? sch.driftMinutes : 15;
    var budget = isInt(sch.completionBudgetMinutes) ? sch.completionBudgetMinutes : 240;
    var overdueMin = startMin + drift + budget;
    out.scheduledStart = { minuteOfDay: startMin, hhmm: ('0' + sch.hour).slice(-2) + ':' + ('0' + sch.minute).slice(-2) };
    out.overdueAfter = { minuteOfDay: overdueMin, driftMinutes: drift, completionBudgetMinutes: budget };

    // ---- what we actually hold -----------------------------------------------------------------------------
    var rows = Array.isArray(input.snapshotDates) ? input.snapshotDates : [];
    var seen = [], i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var d = str(r.date);
      if (!YMD.test(d)) {
        out.state = STATES.LINEAGE_MISMATCH;
        out.reason = 'a snapshot row carries an unreadable calculation_date (' + (d || '(blank)') + ')';
        return out;
      }
      seen.push({ date: d, status: str(r.status), rowCount: isInt(r.rowCount) ? r.rowCount : null,
        planningCycle: str(r.planningCycle) });
    }
    out.detail.distinctDates = seen.map(function (x) { return x.date; }).sort();

    if (!seen.length) {
      out.state = STATES.NO_COMPLETE_SNAPSHOT;
      out.reason = 'no materialized snapshot exists for this scope at any date';
      return out;
    }

    // ---- (2) INTERNAL CONSISTENCY, checked BEFORE the clock -------------------------------------------------
    // Two calculation dates inside one planned group is a run caught mid-write. 43_ upserts row by row with no
    // atomic publication, so this is the observable form of a partial run — and it is wrong at every hour,
    // which is why it is decided before anything about the schedule is considered.
    if (out.detail.distinctDates.length > 1) {
      out.state = STATES.PARTIAL_SNAPSHOT_BLOCKED;
      out.reason = 'this scope carries rows from ' + out.detail.distinctDates.length
        + ' different calculation dates (' + out.detail.distinctDates.join(', ')
        + ') — a run was caught mid-write and its rows must not be mixed';
      return out;
    }
    var only = seen[0];
    out.detail.snapshotDate = only.date;

    // ---- (3) LINEAGE ---------------------------------------------------------------------------------------
    var wantCycle = str(input.expectedPlanningCycle);
    var haveCycle = only.planningCycle || ('RECO-' + only.date.slice(0, 7));
    out.detail.snapshotCycle = haveCycle;
    if (wantCycle && haveCycle && wantCycle !== haveCycle) {
      out.state = STATES.LINEAGE_MISMATCH;
      out.reason = 'the snapshot belongs to ' + haveCycle + ' and this plan is ' + wantCycle;
      return out;
    }
    // A snapshot dated in the FUTURE is not fresh, it is wrong. Nothing legitimate produces one.
    if (only.date > now.ymd) {
      out.state = STATES.LINEAGE_MISMATCH;
      out.reason = 'the snapshot is dated ' + only.date + ', which is after the business date ' + now.ymd;
      return out;
    }
    // A row that is not READY has no quantity to offer. The per-row gate is the caller's; this refuses to call
    // a not-ready date a complete snapshot.
    if (only.status && only.status !== 'READY') {
      out.state = STATES.NO_COMPLETE_SNAPSHOT;
      out.reason = 'the only snapshot for this scope is ' + only.status + ', not READY';
      return out;
    }

    // ---- the job's own account of itself, when the caller can supply it -------------------------------------
    // Corroboration, never override. A job reporting FAILED is evidence; a job reporting nothing is not
    // evidence of success.
    var job = input.jobState || null;
    var jobStatus = job ? str(job.status).toUpperCase() : '';
    out.detail.jobStatus = jobStatus || null;
    out.detail.jobRunId = job ? (str(job.runId) || null) : null;
    // The caller supplies the job's start as a BUSINESS DATE string, already in the business zone. Converting
    // an epoch here would mean re-deriving a zone the caller has already resolved, and a caller whose stamp is
    // a wall-clock string in another zone would silently land on the wrong day.
    var jobStartedToday = !!(job && YMD.test(str(job.startedAtDate)) && str(job.startedAtDate) === now.ymd);
    out.detail.jobStartedToday = jobStartedToday;
    var jobRunning = jobStatus === 'PENDING' || jobStatus === 'RUNNING' || jobStatus === 'RESCHEDULED_LOCKED';
    var jobFailed = jobStatus === 'FAILED' || jobStatus === 'ERROR' || jobStatus === 'STALLED' || jobStatus === 'BLOCKED';

    var haveToday = (only.date === now.ymd);

    // ---- (1) WHERE ARE WE IN TODAY'S SCHEDULE? --------------------------------------------------------------
    if (haveToday) {
      // Today's run produced this, and it is internally consistent. Use it.
      out.state = STATES.CURRENT_AFTER_REFRESH;
      out.ok = true;
      out.acceptedDate = only.date;
      out.acceptedCycle = haveCycle;
      out.reason = "today's run completed and its snapshot is the current one";
      return out;
    }

    // Today's date is absent. Whether that is fine depends entirely on the hour.
    if (jobFailed && jobStartedToday) {
      out.state = STATES.REFRESH_FAILED;
      out.reason = "today's materialization reported " + jobStatus
        + ' — the previous snapshot is NOT adopted over a known failure';
      return out;
    }
    if (now.minuteOfDay < startMin) {
      // NOT DUE YET. The previous complete run is the newest thing that exists, and nothing is late.
      out.state = STATES.CURRENT_PRE_SCHEDULE;
      out.ok = true;
      out.acceptedDate = only.date;
      out.acceptedCycle = haveCycle;
      out.reason = "today's materialization is scheduled for " + out.scheduledStart.hhmm + ' and it is '
        + now.hhmm + ' — the latest complete snapshot (' + only.date + ') is current, not stale';
      return out;
    }
    if (now.minuteOfDay < overdueMin) {
      // DUE, POSSIBLY IN FLIGHT. A half-written today is not better than a finished yesterday, and the
      // partial-snapshot guard above is what stops today's rows leaking in one at a time.
      out.state = STATES.CURRENT_DURING_REFRESH;
      out.ok = true;
      out.acceptedDate = only.date;
      out.acceptedCycle = haveCycle;
      out.reason = "today's materialization is due or running (" + (jobRunning ? 'job ' + jobStatus : 'no completed rows yet')
        + ') — the last COMPLETE snapshot (' + only.date + ') remains the authority until it finishes';
      return out;
    }
    // PAST THE WINDOW AND STILL ABSENT. Now it is a fault, and the same snapshot that was fine at 10:41 is not.
    out.state = STATES.REFRESH_OVERDUE;
    out.reason = "today's materialization should have completed by "
      + ('0' + Math.floor(overdueMin / 60)).slice(-2) + ':' + ('0' + (overdueMin % 60)).slice(-2)
      + ' and no snapshot for ' + now.ymd + ' exists — the latest is ' + only.date;
    return out;
  }

  return {
    STATES: STATES,
    ACCEPTING: ACCEPTING,
    isAccepting: function (state) { return ACCEPTING[state] === 1; },
    businessNow: businessNow,
    canonicalDate: canonicalDate,
    assess: assess,
    _version: 'f1-7n-fc-1b-e3-r4-a2-r1-r1-snapshot-freshness'
  };
});
