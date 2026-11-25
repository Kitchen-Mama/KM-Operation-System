# Inventory Job Observer Follow-Up

## Implemented

- An acknowledged START with a run ID immediately paints calculation progress, before the first status reply.
- Inventory observes at most three consecutive unusable status replies. A successful reply resets that counter.
- A lost status or observation timeout is unconfirmed, not a failed backend calculation. The manual run keeps its run ID and read-only Check status action; it never automatically resends START.
- Mount recovery mirrors progress on the visible AI Support trigger immediately after confirming an active run.
- Returning to idle uses the fixed AI Support label, never a captured Starting label.
- Frontend cache tag: daily-3pl-20261125-v5.

The observer change is frontend-only. The combined release also contains the separately implemented daily allocation repair described in SITE_INVENTORY_DAILY_3PL_20261125.md. No production deployment or production recalculation was performed by this task. DB row writes alone do not prove a backend job reached DONE.

## Allocation Diagnosis And Confirmed Decision

The inspected Shopify rows were blocked by WAREHOUSE_SHARE_UNKNOWN / SHARE_MISSING for WH-KM-US-3PL-AMZLGS and WH-KM-US-3PL-WINIT. This is not a requirement for Avg Sales in Forecast Driven mode.

Overseas inventory allocation is the prerequisite task, separate from the later B/C transport routes, as recorded in ORDER_MAINLINE_PHASE1_20261123.txt. Shared stock is now conserved by the daily allocator instead of requiring a manual inventory_share for Site Inventory.

The operator confirmed the following policy on 2026-11-25:

1. Tomorrow through day 90, date first, smaller priority number first.
2. Equal-priority receivers share that day's demand proportionally.
3. Company, country, SKU, warehouse eligibility, and shipment lineage remain isolated.
4. Residual supply may remain unallocated; 3PL stock is not instantly sellable FBA stock.

The combined source implements this policy. Current marketplace priorities include fractions and values above 100; they are preserved, not clamped to 1..100.

Gap and AI Support use the same allocated supply, including the full competing-site component for a current-scope request. Incoming is dated and lineage-owned first. Inactive SKUs overwrite prior actionable gaps with SKIPPED and blank quantities. Genuine missing stock or FC remains distinguishable from zero and Inactive. Backend deployment and live acceptance remain outstanding.

## Verification

Offline tests:

    node assets/tests/manual-gap-response-deadlines.test.cjs
    node assets/tests/manual-gap-status-browser.cjs
    node assets/tests/gap-recalc-transport-f1-4b-fm5r4t.test.js
    node assets/tests/gap-job-startup-hydration-f1-4b-fm5r4jlive6.test.js

The browser fixture covers desktop 1440 and mobile 390, hung and delayed status reads, repeated unusable replies, truthful completion, refresh failure, unknown-outcome recovery, and duplicate-click protection. It performs no live business writes.

## Acceptance

1. After an acknowledged Start, the visible button changes from Starting to Calculating N/M without waiting for a second reply.
2. Repeated status-read failure stops the spinner and exposes Check status. It does not report that the calculation itself failed.
3. Checking status or repeated clicking cannot issue another START while that manual outcome is unknown.
4. Confirmed DONE plus successful readback restores AI Support and refreshes results.
5. A real production run still needs separate acceptance; offline fixtures do not prove that the user's previous run finished.
