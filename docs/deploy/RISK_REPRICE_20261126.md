# Promotion Risk and Weekly SKU Repricing

## Install

The frontend is published by Git push. To activate automatic Edit SKUs repricing,
replace these four files together in the existing production Apps Script project:

1. `01_router.gs`
2. `20_campaign_write_handlers.gs`
3. `63_api_v1_system_health.gs`
4. `83_api_v1_weekly_draft_lines.gs`

Files are in `output/risk-reprice-20261126/`. Generate/check the package with:

```powershell
node assets/tools/build-risk-reprice-release.cjs
```

Save all four, create a new version, and update the existing Web App deployment.
Keep the existing `/exec` URL. Do not upload an entire source folder or replace
configuration/password files. `20_` is the unchanged prior Campaign append module,
included so the router's prerequisite pin cannot be missed.

Expected Weekly module: `WDL1-AUTO-REPRICE-20261126-V2`.
Expected policy: `e2eafb38f249636bc4657eb8ce00817a267a7547607ee05a1d0017adb3775138`.
The frontend accepts the exact prior policy during manual rollout. Automatic
repricing is NOT active until this GS deployment is completed.

## Behavior

- Undated sales observations no longer invalidate every dated observation for
  the same SKU. Only valid positive-sales dates enter the numerator/denominator;
  undated rows are excluded and disclosed as partial data. No sales date is
  inferred, no zero denominator becomes Safe, and quantity/conflicting-duplicate
  errors in the evaluated window remain blocking. Future campaigns use the same
  rule at their own start date; a wholly unobserved window remains Missing Data.
- Weekly Edit SKUs now calls the existing canonical quote calculator inside the
  import lock against the final proposed lines and packing, before business
  mutations. The same journal saves and verifies both SKU facts and quote fields.
  The saved carrier/method/last-mile/customs are retained. Applicable threshold
  changes are recalculated. Ambiguous or inapplicable cards clear the old price
  and return an explicit unpriced reason. Replay does not write again; a failure
  rolls back both quantities and quote. No browser-side price formula or second
  automatic pricing request is introduced.
- Both shipping views use natural alphanumeric SKU order. Mixed-carton groups
  remain adjacent and each group's members are sorted. The group's carton
  measures still come from the owning portion even if it is no longer the first
  visible SKU. Physical carton ranges, documents and raw records are unchanged.

## Checks

Local fixtures only for business mutations, with the actual journal and pricing
owners (tax authority is explicitly stubbed in the dedicated quote fixture).

- `promotion-risk-ratio.test.cjs`: 31 checks.
- `promotion-risk-page-browser.cjs`: 36 checks, desktop/mobile, actual DTO mapper.
- `weekly-draft-repricing.test.cjs`: 8 checks, quantity/add/remove/mixed/tier changes,
  replay, no rate, ambiguous rates and quote-write rollback.
- `mixed-carton-command.test.cjs` + `mixed-carton-extra.test.cjs`: 15 checks,
  including downstream Shipment handoff and document-family models.
- `mixed-carton-browser.cjs`: 52 checks, including grouped natural sorting and
  shared carton weight/CBM on desktop/mobile.
- `shipping-plan-review-browser.cjs`: 153 checks across three viewports.

No production recalculation, shipment, campaign, inventory or source-sheet writes.
Existing blank source dates are not repaired by inventing a date.
