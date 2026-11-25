# Price And Service Display Repairs, 2026-11-25

## Frontend Scope

- The Weekly Review Save now interprets a server-listed option labelled for later quoting as a service choice when its quote is explicitly unavailable. It sends the existing `service_only` envelope, all three canonical transport fields, customs, the expected current carrier and the plan edit token. The existing locked backend revalidates availability and either prices the service or clears stale costs. A priced card keeps its original ID/version path. An unpriced selection no longer silently becomes a customs-only write.
- Save outcomes are mirrored beside the lower Save button as well as in the existing plan notice. Conflict, unverified and unknown-outcome handling remains fail-closed; nothing is resent automatically.
- Carrier Rate Card's maintenance command and dialog title are `Update Price/Service`. Its native dialog explicitly centers itself against the viewport, including the global reset CSS, with bounded scrolling and mobile-width controls.
- Opening maintenance performs the existing bounded DB read of `carrier_rate_cards` and `carriers`; it no longer depends on Search, a primed broad cache, or the initial page read having finished. Loading, refusal, true empty data and retry have distinct states. Closing/reopening a pending read cannot repaint an obsolete dialog. The explicit legacy kill switch retains its getter-based behavior.
- Every Cost Breakdown uses the same Carrier, Freight, Duty / Custom, Total Cost, Currency and Cost per pcs rows. The old split-currency alternate markup is removed. Where no exchange rate has been applied, amounts are displayed as separately labelled currency components in both the breakdown and the card summary. No mixed-currency numeric total is fabricated or persisted.

No Apps Script, schema, pricing engine, exchange rate or live shipping-plan row is modified by this repair. The previous factory atomic-import candidate remains separate and is not included in this frontend publication. The separately requested product image was pushed in its own commit, `ee7d8f61`.

## Updating Quotes

1. Open Carrier Rate Card and select **Update Price/Service**. Wait for the DB-backed service list.
2. Choose the existing carrier + origin/destination + method + last-mile service. Its destination/weight-tier quotes stay together.
3. Edit the Unit Rate values that changed and select **Save Prices**. Only changed rows are submitted, with their optimistic edit tokens; identity, tier, currency and unchanged terms stay intact.
4. Reopen/refresh and verify the saved rates. For a Draft shipping plan that should use them, select its service/customs and Save again to obtain a new server quote. Updating reference rates does not silently overwrite all previously saved plan estimates. Shipment Draft uses its actual destination for execution pricing.

Use **Add Rate** for a new destination or tier inside an existing service. Use **New Service** only for a new service identity, not a new price for the same service. For existing-row effective dates, surcharges, fees or status, the separate **Update Rate Card** workflow exports the carrier-scoped update template; retain its `rate_card_id`, edit the allowed fields, and import it back. Avoid overlapping active quotes when adding validity versions; do not assume the UI will choose the cheapest or newest row.

The quick price writer depends on the previously supplied router/17b maintenance module already being installed. This frontend-only repair requires no additional GS installation or redeployment.

## Verification

- `price-service-fixes-browser.cjs`: 38 checks on desktop/mobile, using the actual DB adapter and locked 11_/12_ business handlers with synthetic sheets; no production writes. Includes cold DB reads, read failures/recovery, dialog geometry, unpriced service Save, genuine lock refusal, currency separation, missing amounts, and consistent cost rows/header.
- `shipping-plan-review-browser.cjs`: 135 checks across 1440/1024/390 px.
- `maintenance-ui-browser.cjs`: 18 checks, including acknowledged-row-only updates, conflicts, duplicate service blocking and tier preservation.
- `review-service-save-recovery-browser.cjs`: 9 checks.
- Quotation policy: 29 checks. Existing rate-card facets: 41 checks. Rate-maintenance backend: 15 checks.
- Two historical suites remain non-green on both the pre-change source and this candidate: `km-weekly-command-reliability.test.js` extracts a runner without its `_spReadbackBlocked_` fixture global; `s7-r2a1-weekly-carrier-label.test.js` reports the same six obsolete source-census failures (35 pass, six fail, all nine mutants caught). Neither is presented as a new passing test.

Desktop/mobile PNG evidence and live read-only investigation notes remain under the ignored output directory. No live business values are included in this public handoff or its synthetic fixtures.
