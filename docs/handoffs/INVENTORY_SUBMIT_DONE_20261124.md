# Inventory Submission and Done Fixes

Date: 2026-11-24
Baseline: 08d60cc2c747e871cea28083700328a017ecd3c5

## Changes

- Site Inventory Add SKU had no pending-submit latch or busy state. It now immediately shows `Adding...`, disables the form, and ignores duplicate button/keyboard/programmatic submissions until the outcome settles. Close/reopen cannot bypass the latch. Failed validation/network requests preserve the form and unlock it for an explicit retry. Confirmed success still closes and resets the form using the existing success path. The legacy upsert branch uses the same guard.
- Overseas adjustment previously changed the button text to Done but left it disabled and still wired to the adjustment path. It now has an explicit completed state: enabled Done closes the modal/overlay without another write. Pending adjustments lock their fields and cannot be reset by reopening the modal. Reopening after completion starts a fresh adjustment.
- Added a shared in-flight command guard around all 90 currently registered DB write entrances, including source-family-less settings and the late-defined shipment consolidation policy writer. Identity is environment + command + canonical JSON arguments. Equivalent nested object key order joins the same in-flight promise; distinct payloads/environments do not. Reads are untouched. Source-epoch wrappers and their metadata remain intact; one actual write generates one dispatch/settle pair.
- The shared guard exists only for the concurrent command lifetime. No persisted payloads, completed-result cache, automatic retry, changed idempotency keys or backend permission changes. Existing backend idempotency and unknown-outcome protections remain authoritative. This is not a cross-tab/cross-user distributed lock.
- Frontend asset tokens updated for the API adapter, both page scripts, app loader and Site Inventory CSS.

No GS installation, DB columns, cloud business writes, endpoint changes, data cleanup or Sandbox synchronization.

## Verification

- `node assets/tests/write-command-flight.cjs`: 19 checks passed. Loads the entire real DB adapter in a network-stubbed VM; 50 identical Add SKU invocations produce exactly one HTTP write. Covers all 90 installed guards, source epochs, environment/payload separation, nested key ordering, failure propagation, synchronous throws and release/retry behavior.
- `node assets/tests/inventory-submit-done-browser.cjs`: 38 checks passed at desktop 1440px and mobile 390px. Real page scripts, HTML, shared/page CSS and shared command guard; fake business API only. Includes actual repeated button clicks, direct handler invocations, Add SKU success/business/row/network/synchronous failures, legacy fallback, adjustment repeat/reopen protection and Done closing without another adjustment. Screenshots visually inspected; external services blocked.
- `node assets/tests/inventory-cache-pending-route-browser.cjs`: previous release's 42 checks passed again.
- `node assets/tests/inventory-add-sku-clear-on-success-f1-small.test.js`: 17 passed.
- `node assets/tests/add-sku-asin-amazon-rule.test.js`: 27 passed.
- Syntax checks and `git diff --check` passed.
- Generated screenshots: `output/inventory-submit-done-20261124/browser/` (gitignored).

The older `dc1-r1-source-write-epoch-and-reader-invalidation.test.js` had an A9 assertion requiring two identical concurrent writes to dispatch twice. Updated only that case to the user's new anti-duplicate requirement: one dispatch/settle pair. The rest of that suite still reports 35 passed / 8 failed, identical to its unmodified baseline test running against both unmodified baseline JS files. Existing failures concern its old writer-classification exemptions and rejected recommendation-cache fixtures, eventually dereferencing an absent cache entry. This suite is not represented as passing.

## Remaining Scope

Existing duplicate business rows were not deleted or merged. That requires an identity-aware audit, not blind cleanup.
The FBA19PYJ56KK receiving issue remains the separate open follow-up recorded in `SITE_INVENTORY_CACHE_PENDING_ROUTE_20261124.md`; these two UI fixes do not claim to resolve it.
