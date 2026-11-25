# Inventory And Pricing Lock Hotfix

## Status

- Source changes and offline verification are complete. Git publication is separate from Apps Script deployment.
- No production Apps Script deployment or production Recalculate All Sites was performed by this task.
- With explicit owner approval, only the blank import_duty_treatment cells in carrier_rate_cards!AE344:AE393 and AE486 were filled with included_in_rate. All other fields, prices and formatting were read back unchanged.
- No shipping plan was edited, repriced or submitted directly in the DB.

## Frontend

- Upcoming Event quantities use ceiling integers in both the summary and expanded detail. Calculation inputs retain full precision.
- Hide the expanded source-not-linked banner only. Source attribution and missing-data guards remain intact.
- Service options display known freight and the reason a total is pending, instead of always saying pricing must wait for Shipment Draft.
- Cache tags are updated in app.js and index.html.

## Backend Deployment

1. Wait for existing Apps Script executions to finish before deploying. An old in-flight worker still uses the old ScriptLock until it exits. Do not clear locks or delete active job state.
2. Replace 46_api_v1_gap_materialization_job.gs with the new version. The worker uses an eight-minute durable gap lease. ScriptLock is held only for claiming/releasing that lease, allowing shipping and rate maintenance writers to proceed. All gap execution remains serialized. A second Start joins the healthy same-product run. Losing continuations cannot overwrite owner checkpoints or fail a healthy job.
3. In the INSTALLED 17_ engine, replace only shippingRateActive_ and add shippingRateDay_ from the extracted function patch. Do not append duplicate function declarations or replace the whole installed 17_ file with the repository mirror: the installed tax/freight engine has additional helpers not mirrored here. The patch preserves the optional timezone argument; the current DB calendar is Asia/Taipei. Matching remains inclusive on both effective dates, and malformed dates fail closed.
4. Preserve the previously supplied calculation repair: 01_, 42_, 43_, 46_, 63_ and 90_. A combined release should use the new 46_, not the older one from the first calculation package.
5. Save and publish a NEW VERSION to the EXISTING Apps Script web-app deployment. GitHub Pages publication alone does not publish these backend changes.
6. Refresh the app. Recalculate All Sites once and observe status progress through DONE. Clicking again while that same job is healthy must join it, not start another run.

No 11_, 12_, or 17b_ replacement is required for this hotfix. Existing shipping edit tokens, zero-write failures, unknown-outcome readback and no-automatic-write-retry protections are preserved.

## Acceptance

- Upcoming Event 9.714 -> 10, 2.285 -> 3, 0.571 -> 1; raw values unchanged.
- Expanded source-not-linked banner absent; genuinely missing inventory remains unknown, not zero.
- Recalculation plus shipping service Save and Update Price/Service must not block each other for the duration of a worker.
- Native Sheets Date effective_from/effective_to match on calendar days, including the inclusive end date. Expired/inactive/wrong-lane cards remain excluded.
- The owner-confirmed included-duty service can quote freight, zero additional duty, and a complete same-currency total after a fresh server-validated Save. Mixed-currency services retain separate amounts and the existing six-row Cost Breakdown.
- Rate maintenance timeout explicitly confirmed zero-write remains retryable by the user; unknown outcomes require Refresh/readback, never automatic resend.

## Verification

Run from the repository root:

```text
node assets/tests/gap-job-lease.test.cjs
node assets/tests/gap-materialization-job-f1-4b-fm5r4j.test.js
node assets/tests/carrier-rate-maintenance.test.cjs
node assets/tests/shipping-plan-quotation-policy.test.cjs
node assets/tests/site-inventory-daily-browser.cjs
```

These are offline/browser-fixture checks. They do not prove production deployment or a production job completed.
