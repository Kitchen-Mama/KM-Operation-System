# Site Inventory Cache and Pending Route

Date: 2026-11-24
Baseline: 836713e30303ecd5605b228a8baeb66bd6953f74

## Scope

- Retain an already confirmed same-site inventory result across navigation, including after its ten-minute freshness threshold. Cold loads and a different site still use the existing Search gate.
- Preserve the last completed On the Way, Avg. Sales/day and Days of Supply presentation while background validation runs. This display-only snapshot is never an input to stock, gap, route validation or Submit.
- Continue source revision and write-epoch checks. An unchanged revision reuses the completed exposure and recommendation results without those workspace requests. A changed or unknown revision still requires validation; it is not promoted to current merely because a screen is cached.
- If exposure is retired on return, start the existing one-per-site batched read immediately instead of leaving the first-level On the Way waiting for an expanded SKU.
- Show a cached/updating notice during refresh; retain the snapshot with an error notice if refresh fails. Install new values and remove cached attribution when fresh reads settle.
- Ignore abandoned async markup mounts.
- Rename AI Action to AI Plan. Show `Pending Route` for an active persisted or real local Execution Plan route. Leave the cell blank otherwise. Reuse KMARC's scope/lifecycle classification and the already batched exposure tables; no per-SKU API calls.
- Exclude empty manual composers, cancelled lines, terminal headers and routes belonging to another company/site. Update first-level status on draft recovery/persistence, cancellation, submit and exposure settlement.

No Apps Script, DB columns, endpoint configuration or stock-limit changes. No cloud business writes, no Sandbox synchronization. Git push publishes the frontend only through the existing GitHub Pages workflow.

## Verification

- `node --check assets/js/pages/inventory-replenishment.js`
- `node assets/tests/inventory-cache-pending-route-browser.cjs`: 42 checks passed at 1440px and 390px. Uses the actual page script, HTML, shared/page CSS, revision checks, primary/exposure/recommendation loaders and cell painters. Normalized fixture data and the row-data projection replace the cloud boundary; this is not a live Production data test.
- Browser checks cover expired-cache return, secondary-number retention, no secondary workspace request on unchanged revision, actual changed-revision reads, fresh-value installation, failed background read, company/site isolation, route deletion/cancellation/submission and abandoned mounts. External service requests blocked; live business writes: zero.
- `node assets/tests/ir-cache-invalidation-counterexamples-s8-b3-r3-cp2x-r2.test.js`: 54 passed.
- `git diff --check`: passed.
- Screenshots: `output/site-inventory-cache-pending-route-20261124/browser/` (ignored generated output).

Two older suites were also run and fail identically against baseline source loaded with `git show HEAD:assets/js/pages/inventory-replenishment.js` before this commit:

- `ir-scope-reuse-and-inflight-dedup-s8-b3-r3-cp2x.test.js`: its old fixture handler is rejected by the existing handler-version cache policy (`HANDLER_NOT_ACCEPTED`); eventually dereferences a missing revision.
- `site-inventory-lazy-once-exposure-s8-r4b-2b.test.js`: older extracted-function harness settles exposure FAILED rather than READY, then dereferences a null table. The same failure exists before this change. Neither suite is represented as passing.

## Stock Question: 183 Versus 157

Read-only code trace, not a live row audit:

- CN 183 is a site reference quota, proportional share of the CN factory pool. See `_irFactoryDetailHtml_`.
- The route's 157 is the selected factory warehouse's plannable pool: `factory_current_stock - factory_reserved_stock - active_allocation_draft_qty - active_shipping_plan_qty`, plus the current card's own already-counted saved draft quantity to avoid double deduction. See `_execFactoryPoolsFor_`, `_execFactoryOwnCounted_` and `IRWarehouse.fromAvailability`.
- Shipping Plan Review being empty does not rule out reservations, draft occupancy, other-site occupancy or a different warehouse-level total. Do not assume `183 - 157 = 26` identifies one particular hold: these quantities have different scopes.
- Exact attribution requires the factory breakdown opened by the blue 183: On hand, Reserved, Draft occupancy, Plan occupancy and Plannable for CN factory warehouses. No inventory limit was changed.

## Open Follow-up: FBA19PYJ56KK Receiving

Status: OPEN, explicitly requested as subsequent work on 2026-11-24.

The user confirms installing 31 and 80, but FBA19PYJ56KK still has no receipt inputs and displays the old display-only/no-receiving text. The supplied screenshot also still shows the old Destination filter. These observations require investigation, not an assumption that cloud code installation failed.

Next investigation must verify the frontend assets actually loaded by that browser, the deployed Web App version versus saved editor source, the shipment's origin/mode/destination classification, and the receipt-panel eligibility branch. The intended contract remains: record partial/full Amazon receipts without adding Site Inventory Current Stock; show remaining quantity and remove fully received shipments from the active map.

This follow-up is NOT implemented or claimed fixed in this release. Do not reimport shipment quantities, reset receipt progress, edit Production business rows, or synchronize Production to Sandbox as part of diagnosis without the appropriate request.
