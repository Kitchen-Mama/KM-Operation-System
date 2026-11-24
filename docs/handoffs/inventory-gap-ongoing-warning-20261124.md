# Inventory Gap Ongoing Warning

## Scope

Latest user correction is authoritative: change only Inventory materialization's
ONGOING_INCOMPLETE blocking policy. No cross-SKU investigation or fix.
No changes to 42, core JS, GS90, frontend, caches, existing tests, or parent-owned
assets/tests/inventory-rapid-return-browser.cjs. No production writes, deployment,
or git commit. No applicable AGENTS.md was found in the repo or ancestor folders.

## Verified Cause And Fix

In 43_api_v1_gap_materialization.gs, gapInvMapFromLines_ treated
gapOngoingIncompleteNote_(line) as a fatal reason before validating horizons.
This blocked valid Inventory horizons when ongoingAdmission.complete was false.

Inventory now materializes the existing D18/D30/D45/D90 quantities as READY when
otherwise valid. Its note retains ONGOING_INCOMPLETE, excluded PO-line IDs and
known excluded quantity, distinguishes unreadable quantities, and explicitly warns
that excluded ongoing quantity is not counted and suggested quantity may be overstated.
Repeated warning summaries are deduplicated and source note data is sanitized using
the existing helper. Existing Inventory warning flags remain present.

No supply quantities, dates, eligibility, or horizon formulas were changed. Missing
expected_completion_date still produces no timed incoming; no ETA is fabricated.
Inventory is not changed to a new stock-only formula: it continues using its
existing canonical horizons, including any independently valid dated supply.

Order Planning is unchanged: gapOpMapFromLines_ still blocks ONGOING_INCOMPLETE
and keeps quantities null. Inventory still blocks explicit upstream failures,
missing lines/horizons, unavailable sales basis, missing windows and nonfinite or
nonnumeric gap/suggested quantities. Warning-only lines cannot mask another line's
real blocking reason.

## Verification

Run: `node --test assets/tests/inventory-gap-ongoing-warning.test.cjs`

11 tests pass. The test executes the real bundled KMOOR chain, the real 42 horizon
and unaccounted helpers, and the real 43 mappers and slice/upsert writer. Only the
spreadsheet boundary is an in-memory fake. Same-SKU synthetic fixtures demonstrate
an undated PO with 80 unreceived units creates no timed incoming, valid horizons
persist unchanged with a warning, zero stays zero, aggregation is preserved,
Order Planning remains blocked, other blockers remain blocked, notes preserve
identity, retries update rather than duplicate, and inputs are not mutated.
Success and failure envelopes both expose the new deployment-audit handler marker.
Before the fix the initial nine-test regression had 2 passes and 7 failures.

Existing suites were also run; the following failures were reproduced unchanged
with HEAD's original 43 substituted in memory, without reverting workspace files:

- gap-materialization-f1-4b-fm5.test.js: 30 pass / 2 fail, W1 router occurrence
  assertion and N1 forbidden-token assertion.
- inventory-blocked-and-90dayfc-f1-4b-fm5r4uir7.test.js: 28 pass / 1 fail,
  W2 warehouse sales-reason source assertion.
- order-planning-supply-allocation-f1-4b-fm5r2b.test.js: 39 pass / 2 fail,
  T/section 15 and R carry-forward expectations.

These existing failures were left outside this fix. `git diff --check` passes.

## Deployment Handoff

Required Apps Script runtime file: **43_api_v1_gap_materialization.gs only**.
The existing GS90 generator (assets/tools/build-apps-script-bundle.js) bundles
assets/js/core modules, not 43; no bundle regeneration is required for this fix.
42 and GS90 need no deployment changes. No deployment was performed.

GAP_MATERIALIZATION_HANDLER_VERSION_ is now
`inventory-ongoing-warning-20261124`. Verified the current Inventory consumer
captures this marker independently and does not apply the recommendation handler's
accept list to it. No accepted-handler gate for the gap marker was found.

Authorized operator steps (not executed here):

1. Replace only 43_api_v1_gap_materialization.gs in Apps Script and **Save**.
2. **Deploy > Manage deployments > Edit** the existing Web App deployment;
   choose **New version** and deploy. Saving source alone does not update the
   versioned Web App. Retain the existing Web App URL.
3. Verify a gap response has
   `meta.gapMaterializationHandlerVersion = inventory-ongoing-warning-20261124`.
4. Run normal Inventory gap recalculation to replace old materialized BLOCKED
   rows. This code change does not rewrite stored rows by itself.
5. Verify otherwise-valid rows are READY with the excluded-quantity warning and
   unchanged horizon quantities. Missing dates remain missing; separately confirm
   Order Planning still blocks incomplete ongoing supply and other Inventory
   blocking reasons remain blocked.
