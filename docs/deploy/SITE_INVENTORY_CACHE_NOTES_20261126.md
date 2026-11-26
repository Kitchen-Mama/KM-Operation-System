# Site Inventory Cache and Shipping Notes

Frontend-only follow-up to `656c8d37`. No Apps Script files, schema changes,
production recalculation, inventory writes or business-record changes.

## Fixes

- Normalize `inventory_replenishment_gap.calculation_date` through the existing
  Taipei timestamp adapter before comparing it to the site's planning date.
  The reported production value `2026-11-24T16:00:00.000Z` represents the stored
  November 25 date, not November 24. The READY row's stored zero must render `0`.
- Keep readable, current-formula stored suggestions visible when genuinely
  dated, with an asterisk and a tooltip identifying the stored calculation date.
  BLOCKED, failed, missing-value and superseded-formula rows remain unavailable.
- Restore scoped recommendation/gap caches before the first table composition.
  Retain completed secondary display cells separately per applied site and
  environment while a refresh waits. Display snapshots are not calculation inputs.
  Existing source-revision, write-epoch, site-day and request-sequence guards remain.
- Retain the latest 12 cache decisions in the existing read-only diagnostic so a
  successful response cannot erase the reason its earlier cache lookup missed.
- Hide recognized Weekly edit receipts, pending markers and packing envelopes
  from Shipping Plan Review Notes only. Preserve manual notes, multiline rejection
  reasons, unrecognized text and escaped HTML. The original plan note is untouched.

## Verification

All browser runs use local fixtures and recording/stub APIs, not live mutations.

- `node assets/tests/inventory-site-switch-cache-browser.cjs`: 34 checks.
  Actual page, DB adapter and workspace mapper; US/Amazon -> AU/Amazon -> US/Amazon
  at 1440px and 390px. Warm return has zero recommendation, gap or exposure data
  requests, with all cached columns present on its first table paint. A revision
  probe still occurs. Source writes trigger one refresh per affected reader.
  Includes the reported UTC ISO zero, stored-date warning, blocked/obsolete/error
  refusals, per-site fallback and cross-environment exclusion.
- `node assets/tests/site-inventory-daily-browser.cjs`: 50 checks.
- `node assets/tests/inventory-rapid-return-browser.cjs`: 18 checks.
- `node assets/tests/inventory-cache-pending-route-browser.cjs`: 42 checks.
- `node assets/tests/shipping-plan-review-browser.cjs`: 150 checks at
  1440px, 1024px and 390px, including 15 new notes checks.
- `node assets/tests/shipping-plan-runtime.test.js`: 25 checks.
- Syntax checks and `git diff --check`.

The two older cache browser fixtures were updated to carry the current
`SITE_DAILY_V2` response contract; the rapid-return clock is pinned to its fixture
calculation day. Their failures with the prior fixtures were not fixed by relaxing
production compatibility checks.

The legacy `dc1-r1-source-write-epoch-and-reader-invalidation.test.js` still reports
30 passes / 13 failures, identically with the pre-change HEAD page loaded via a
read-only filesystem overlay. Its response fixtures predate the current formula
contract and its writer census is outdated. This release does not claim a green
whole-repository suite.

## Deployment Scope

Publish the committed frontend through GitHub Pages. Runtime version token:
`inventory-cache-notes-20261126-v1`. No additional GS upload is needed for this
release; the previous Campaign append GS package is independent and unchanged.

This changes Site Inventory's cache presentation, not every page's cache owner.
Live diagnostics confirmed current primary/recommendation/gap source stamps agree
and the primary model was REUSED. Earlier NO_ENTRY/FORCED output did not retain
the historical eviction reason; it does not prove the server changed. The new
decision history supports checking that separately if the production symptom
persists after the frontend update.
