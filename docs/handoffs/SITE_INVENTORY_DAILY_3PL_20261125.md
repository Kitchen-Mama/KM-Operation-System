# Site Inventory Daily 3PL Allocation

## Status And Authority

The owner explicitly approved the 90-day chronological policy on 2026-11-25. This supersedes the old 18-day weighted or manual inventory_share allocation for Site Inventory daily recommendations only.

Source implementation and offline acceptance are complete. Production Apps Script deployment and live recalculation are separate owner actions. No production stock, reservation, price, shipping plan, or fulfillment mode was edited by this task.

## Policy

1. The station-local calculation date is frozen. Demand runs from tomorrow through day 90.
2. Scope is company + country + master SKU. Only valid, active, explicitly configured 3PL memberships participate. Warehouse company/country/type must match.
3. All connected active receivers compete, even when only one marketplace is being recalculated. Inactive SKUs do not consume the pool.
4. For each date, smaller allocation_priority is served first. Equal ranks share proportionally to that day's remaining demand. Priorities may contain decimals and exceed 100; missing priority defaults to 100, malformed values block.
5. Overlapping warehouse eligibility uses proportional progressive filling with residual matching, not arbitrary warehouse iteration. An exclusive receiver is not starved because another receiver can use multiple warehouses.
6. Demand is the existing canonical KMHP daily demand: precise Avg Sales or Target-adjusted monthly FC / actual month days, plus independent Special Event daily demand. The supply reader does not require monthly FC in Sales mode.
7. Known platform stock and dated platform incoming reduce a platform receiver's reserve demand first. Platform participation requires an explicit 3PL membership. Allocated 3PL remains a reserve, never instant FBA sellable stock.
8. Lineage-owned incoming remains owned by its receiver and is never redistributed. Unattributed eligible incoming joins the warehouse pool at its ETA. Late arrivals do not erase earlier shortages. Imported historical shipments count only their unreceived quantity.
9. Exact quantities carry through all 90 days. Final integerization uses a conserved remainder matching, respecting each source lot's capacity and each site's ceiling of its exact allocation. Residual stock can remain unallocated.
10. Allocation is a read-only planning projection, not a physical reservation or movement. B/C route creation, transfer legs, and Order Planning's separate monthly/factory allocation are not changed.

## Integration

- Canonical allocator: supply-planning-daily-warehouse-allocation.js, bundled as KMDWA.
- The 42_ workspace gathers physical supply with the canonical KMSP projection and demand with KMHP, solves the complete shared component, and reuses those allocated quantities for horizons and AI Support.
- The main 3rd Party Stock display remains the physical pool. Allocated stock and pool reconciliation are carried separately in workspace diagnostics; they must not be mistaken for another physical balance.
- 43_ writes ALLOC=DAILY_3PL_V1 in the non-truncatable calculation identity.
- The frontend retires prior workspace caches and refuses old materialized quantities without that marker. Recalculate after deployment.
- Explicit Inactive SKU rows become SKIPPED with blank gap/suggestion cells, replacing any old READY values. Job status exposes skippedCount separately from failures.
- Genuine missing stock, missing required FC, ambiguous identities, invalid memberships, or conflicting shipment facts still block. Active does not mean unknown input can be treated as zero.

## Deployment

1. Wait for the existing job to stop; do not delete its live state or clear its lock.
2. Replace these six files together from the release package: 01_router.gs, 42_api_v1_recommendation_workspace.gs, 43_api_v1_gap_materialization.gs, 46_api_v1_gap_materialization_job.gs, 63_api_v1_system_health.gs, 90_generated_supply_planning_bundle.gs.
3. Save and publish a new version to the existing Apps Script web-app deployment. Git push alone does not deploy GAS.
4. Preserve the previously installed 17_ carrier pricing/date repair. No 17_, 11_, 12_, or 50_ replacement is required here.
5. Refresh the app and run Recalculate All Sites once. Then Search the desired scope and inspect D18/D30/D45/D90.

## Acceptance Checklist

- [ ] Active Forecast Driven Shopify/Target/Target Plus/Walmart/eBay with known FC and stock produce horizons without requiring Avg Sales.
- [ ] Avg Sales mode with a valid sales basis does not require regular FC.
- [ ] Missing manual inventory_share no longer blocks an otherwise valid daily allocation.
- [ ] Same-company/country/SKU allocations sum to no more than each warehouse lot; other companies/countries/SKUs are untouched.
- [ ] Smaller priority first within a date; equal rank proportional; earlier date before later-date higher rank.
- [ ] Shipment ETA on day 19 does not reduce D18; partial receipts count only the remainder; received shipments are absent.
- [ ] FBA stock stays separate from 3PL reserves.
- [ ] Inactive rows are SKIPPED, with no retained prior gap or actionable AI quantity.
- [ ] Old results show Recalculate required until rebuilt with ALLOC=DAILY_3PL_V1.
- [ ] START acknowledgment leaves Starting immediately. Lost status replies stop the spinner and expose read-only Check status without another START.
- [ ] Confirmed DONE plus successful result refresh restores AI Support.

## Offline Verification

    node assets/tests/daily-warehouse-allocation.test.cjs
    node assets/tests/daily-warehouse-workspace.test.cjs
    node assets/tests/site-inventory-daily-formula.test.cjs
    node assets/tests/site-sales-calendar-30.test.cjs
    node assets/tests/site-inventory-daily-browser.cjs
    node assets/tests/manual-gap-response-deadlines.test.cjs
    node assets/tests/manual-gap-status-browser.cjs
    node assets/tests/gap-job-lease.test.cjs
    node assets/tests/gap-materialization-job-f1-4b-fm5r4j.test.js
    node assets/tools/check-published-bundle-equivalence.cjs

The browser suites cover desktop and mobile without live business writes. These results do not certify that the previously running production job reached DONE.
