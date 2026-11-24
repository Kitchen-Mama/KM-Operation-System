# Shipping Service And Review Metrics Release

## Scope

- Site Inventory selects a single Shipping Service label. Hidden canonical method and last-mile tokens remain separate in requests and storage. The method registry preserves real service tuples and labels instead of losing them while folding weight-tier rows.
- Each new Submit execution creates independent Plan cards. Compatible routes inside that execution may share a card. An exact retry retains its execution key and is idempotent; a new submission is not a retry. Historical submitted draft identities no longer prevent a fresh round.
- Later Approved Plan consolidation still uses the existing physical compatibility rules, including customs, carrier, service and warehouse identity. Submit batch/cycle is not added to that merge key. Matching customs can allow separate submissions to merge later; incompatible routes cannot merge merely because their method labels look alike.
- Plan quotes keep the highest reached physical-gross-kg threshold within each otherwise identical carrier/service/lane/terms ladder. Different services, carriers, currencies and terms remain separate. Equal-tier ambiguity is not resolved by first/cheapest choice. Blank/invalid/negative carton weights and missing UPC with positive quantity retain unknown gross weight through creation and quantity updates, never zero. Dimensional/minimum-box metadata does not hide otherwise valid cards; the existing freight engine still owns calculation.
- Plan creation defaults only an unambiguous matching carrier/service inside the existing append transaction. Customs is never inferred. A unique service with ambiguous price terms remains unpriced. Explicit Update is retained. Quantity changes recalculate or invalidate the old quote.
- A blank last-mile rate card covers an existing Plan last-mile preference without erasing it. Options, selection/readback, customs changes and quantity repricing preserve that preference; pricing still uses the original card ID/axes. Both blank stays blank, explicit mismatches are not compatible, and multiple prices still require a choice.
- A single current eligible quote reproducing stored freight, duty, customs fee, their currencies and total can be reported as CURRENT_EQUIVALENT even when historical lower-tier cards share the saved terms. Same total alone is insufficient; split currencies retain separate component authority. This does not invent the unrecorded original card ID. Multiple current matches remain ambiguous.
- Defaults may cause initially distinct blank/explicit-carrier groups to converge to equal final routes. An exact full-batch fingerprint plus line-count match can still replay with zero writes; extra duplicate headers/lines, partial content and changed quantities cannot.
- Known enum display labels are initial-capped without changing raw DB tokens, unknown IDs or names. Business service forms use declared pairs; Shipment's unknown-capability manual fallback is preserved.
- Review card metadata is ordered Status / Submitted Date / Country / Marketplace / Shipping Method, then Ship From / Destination / Total Pcs / Total Cartons / Total Cost. Company remains in identity/payloads but is not displayed here. Dates use Asia/Taipei and show YYYY-MM-DD. The existing bounded warehouse reference restores cold-load Ship From names.
- Review reads optional exact-site live metrics independently of immutable submission snapshots. The old Production SITE_SOURCE_SCOPE_UNDECIDED environment refusal can recover after fresh company/country/marketplace/SKU validation. Stronger account/company/marketplace refusals remain guarded. Missing metrics stay unknown, measured zero remains zero. New Submit snapshots accept either explicitly installed Production or Sandbox profile with the same unique marketplace-master authority as Site Inventory.
- Manual AI Support recalculation now bounds the complete START/status/result-read promises, including a response body that hangs after headers. A lost START can recover only a newly observed exact-scope run; an old DONE cannot prove the new click completed. Named backend refusals remain named refusals. No POST is retried. Unknown outcomes stop the spinner and retain a guarded read-only Check status path across reloads. Late acknowledgements are observed without dispatching another job. The existing daily scheduler and backend calculation owners are unchanged.
- Acknowledged jobs require a matching nonblank run ID. Refresh success validates the actual materialized state and displayed scope, not merely a resolved promise. Preparing a read before START does not persist a false write hold. Repeated clicks during normal progress do not start another job or observer. The adjacent Submit response wait is also bounded: unknown results retain the original execution key without a perpetual busy spinner, and a late acknowledged success completes that original operation.

## GS Deployment

Replace these three modules together in the existing compatible Apps Script project, then publish a new version of its existing Web App deployment:

1. `assets/specs/active/apps-script/11_shipping_plan_handlers.gs`
2. `assets/specs/active/apps-script/16_shipping_allocation_handlers.gs`
3. `assets/specs/active/apps-script/40_api_v1_weekly_workspace.gs`

No DB schema migration or historical Plan resubmission is required. Do not copy unrelated source-mirror modules, credentials, configuration or a full older project baseline. The original build-stamp constants are retained because the installed Production router pins them exactly; file hashes identify this patch without changing the router's authority/profile policy.

The established shared runtime must remain installed: 12_ shipment/edit-token helpers, the compatible carrier/tax/quote engine, 36_ battery classification, canonical KMPS/KMCALC/KMCID readers and 42_ sales-rate/calendar helpers. In particular, this repository's 17_ mirror is older than its existing 11_/12_ consumers and lacks pre-existing tax helpers. It is NOT included as an engine replacement in this patch. Missing shared metric dependencies yield unavailable metrics, not invented values.

Only Site Inventory/Review business UI and the three listed GS modules changed behavior. This release did not install Apps Script remotely, write production business data, sync Sandbox, enable AI/administration, or modify the physical consolidation owner in 12_. GitHub Pages publication updates frontend assets only; GS changes require the deployment above.

## Verification

Focused offline tests run against actual current source, in-memory adapters and blocked-network Chrome fixtures. Shared tax/edit/transport fixtures are explicitly labelled in their tests; they are not live production certification.

- `shipping-plan-quotation-policy.test.cjs`: 27 pricing-policy cases.
- `site-inventory-per-submit-plans.test.cjs`: 14 creation/replay/physical-consolidation cases.
- `inventory-service-picker-browser.cjs`: 18 desktop/mobile checks.
- `shipping-plan-review-browser.cjs`: 135 metadata, service, exact-scope metrics and responsive browser checks.
- `weekly-live-site-metrics.test.cjs`: 18 backend/actual canonical-calculation cases, including read failures and missing dependencies without hiding plans.
- `shipment-service-picker-browser.cjs`: 40 desktop/mobile checks.
- `shared-enum-display.test.js`: 100 assertions.
- `inventory-rapid-return-browser.cjs`: 18 cache/navigation regression checks.
- `domestic-service-declarations-ds1.cjs`: 59 cases.
- `km-api-weekly-workspace.test.js`: 66 cases; default reads remain include-gated.
- `shipping-cost-engine.test.js`: 21 legacy-formula cases.
- `shipping-plan-runtime.test.js`: 25 cases.
- `shipping-plan-canonical-fingerprint-cumulative-release-f1-7n-fa-3c-r6e1a.test.js`: 105 cases.
- `manual-gap-response-deadlines.test.cjs`: 13 complete-response, recovery, business-refusal, late-response and no-retry cases, including the real DB API headers-only hang reproduction.
- `manual-gap-status-browser.cjs`: 76 desktop/mobile checks covering recovered/unknown/late/refused/hung responses, actual readback failure/context absence, reload holds, double clicks and Submit completion.
- Existing gap transport/start-error/startup/done-notice checks preserve their behavior. Two source assertions now distinguish transport observation deadlines from the backend stale-job threshold, and compare the helper cache token to the actual app token rather than an older release manifest.
- Older successful START/poll fixtures now carry the canonical matching run ID emitted by GS46. Dedicated negative cases reject missing IDs and different IDs; fixture updates do not weaken the new identity check.
- Modified JS/GS syntax and `git diff --check` verified.

Known test limitation: `inventory-compat.test.js` retains an unrelated source-text assertion failure for the Amazon logical-destination option. The identical failure was reproduced against HEAD before this patch. Older AD4/domestic browser fixtures that select the removed independent last-mile controls are superseded by the focused real-page paired-picker tests. Not all historical suites are green; do not infer full cloud certification from these checks.

Detailed ownership evidence is in the pricing, frontend, per-Submit, shared-display and site-metrics handoffs beside this file. Generated screenshots and the three-module delivery ZIP are under gitignored `output/`.
