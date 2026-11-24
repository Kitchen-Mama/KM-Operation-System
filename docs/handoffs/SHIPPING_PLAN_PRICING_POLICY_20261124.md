# Shipping Plan Pricing Policy Handoff

## Owned Changes

- GS: `assets/specs/active/apps-script/11_shipping_plan_handlers.gs` only.
- New offline test: `assets/tests/shipping-plan-quotation-policy.test.cjs`.
- This handoff only describes the pricing work. Euler owns route/batch grouping in the same GS file; retain those concurrent changes. No consolidation, inventory UI, shipping-plan UI, display helper, app/index, or `12_` edits were made by this work.
- No production spreadsheet writes, deployment, or packaging was performed.

## Policy

- Match the existing origin/destination, validity, marketplace, battery and customs scope first, then retain only the highest threshold not exceeding the plan's known physical gross kg within each same-carrier/service/lane/terms ladder. Different carrier, method, last mile, currency, customs, battery, destination constraints, charge basis, dimensional/min-box terms and fees remain separate choices. Equal highest tiers remain ambiguous; never pick cheapest or first.
- Per the follow-up clarification, display tier eligibility uses the existing persisted gross-weight snapshot (`spRcTotals_`), not a newly invented dimensional-weight formula. A card's `dim_divisor=6000` or `min_box_weight=10/12` does NOT hide that card. The existing freight engine still owns price calculation.
- Current `17_ shippingFreight_` supports weight (gross kg/lb), volume, carton, shipment and container. It does not implement dimensional/chargeable weight or minimum-box weighting. `spRcQuote_` keeps unsupported charge types visible but unpriced instead of accepting the old engine's unknown-type flat-rate fallback. This is not a new dimensional-pricing implementation.
- Unknown/invalid weight, including one unknown line in a mixed plan, cannot produce an eligible priced tier. Existing service-only discovery and explicit-service Update paths remain available.
- Rate-card selection validates against the filtered lane under the existing lock. Obsolete lower tiers and above-weight tiers return existing `RATE_CARD_NOT_APPLICABLE` with zero writes.
- `shippingPlanRoughQuote_` now builds the same existing logistics snapshots and uses the same filtered lane as options/selection. With no chosen carrier, creation defaults only one unique active carrier + the plan's matching method + compatible last mile. Ambiguous services stay blank. Different cards/terms for one service may identify the service but NOT a price.
- Defaults are persisted as part of the existing plan append transaction, before the existing fingerprint/commit. No read endpoint defaults or persists anything. Existing explicit carrier choices are not overwritten. Customs is never defaulted from a rate card; when required and still blank, costs remain blank.
- `spUpdateLineQtyCore_` prepares fresh logistics and pricing before its first business mutation, marks affected plan quotes PENDING, updates lines, writes the recalculated or explicitly blank cost snapshot, and advances each affected plan token. An interrupted write keeps PENDING instead of presenting the former quote as valid. It does not change carrier/service/customs or invent a price when several eligible terms remain.
- Quote callers pass their already-filtered lane to `spRcQuote_`, avoiding a second per-option lane/table match. A standalone call without a lane validates once for itself.

## UI/API Contract

- Existing actions and request payloads are unchanged.
- `shippingPlanRateCardOptions` response `options[]` rate-card entries now also expose `weight_tier` and `weight_tier_unit`. Rate-card options are already highest-eligible filtered; service-only fallback entries have no rate-card tier.
- Selection refusal remains `RATE_CARD_NOT_APPLICABLE`. Refresh options/plan tokens after that refusal rather than resending a cached lower-tier choice.
- Quantity update success now includes additive `data.repriced_plans[]`: `{ shipping_plan_id, priced, unpriced_reason, rate_card_id, updated_at }`. The transient rate-card ID is not persisted on the plan. Re-read quotes/costs and use each returned plan token for subsequent plan/service changes. Existing `data.updated_at` is still the line token, NOT the plan token.
- Common repricing reasons: `NO_CARRIER`, `NO_APPLICABLE_CARD`, `CARD_CHOICE_REQUIRED`, `PLAN_CUSTOMS_REQUIRED`, `RATE_CARD_COST_UNRESOLVED`. Blank costs are unknown, never free. Users can still Update service/customs/rate card later.
- Single-choice shipping labels and per-Submit independent grouping remain other agents' work.

## Dependencies And Deployment Caution

- No new undefined `12_` dependency was introduced: existing `shipCarrierCheck_`, `shipBatteryClass_`, `shipRateDestination_`, `shipCustomsApplicability_`, `shipmentExactRateAndCost_`, edit-token helpers and write-stage helpers are already present in `12_shipment_handlers.gs`.
- The source mirror's `17_carrier_handlers.gs` is older than its `11_/12_` consumers: it lacks already-referenced `shippingTaxQuote_`, `shippingTaxNumber_` and `shippingQuoteComplete_`. It also lacks the later engine's `shippingMeasureKnown_`; the new totals helper no longer needs that function. This work did not overwrite or upgrade `17_`. Do not deploy a standalone source-mirror bundle assuming those existing dependencies are complete. The release owner must retain the compatible shared engine from the established candidate baseline.
- `shipBatteryClass_` also depends on existing `36_ kmBatteryKind_`; the new test loads that real implementation.
- The new test uses actual source `11_/12_/17_/36_`, in-memory spreadsheet adapters, and explicitly labelled tax/quote-completeness, token, ETA and stock fixtures. It is not live Apps Script or tax-engine certification.

## Verification

- `node assets/tests/shipping-plan-quotation-policy.test.cjs`: focused cases include 6000 + min-box 10/12 retention; 100kg => 100 only; 10kg vs 20 minimum zero-write rejection; old lower-tier rejection; distinct terms; unknown weight; read-only options; lane reuse; unique-service creation persistence with customs blank; ambiguity; quantity 100/50/10 repricing; interrupted write PENDING; unpriced service fallback. Parent integration adds CURRENT_EQUIVALENT verification: one currently eligible quote reproduces saved cost even if lower historical tiers share its terms, without inventing the original card ID. Multiple current matches remain ambiguous. See the overall release handoff for final counts.
- `node assets/tests/shipping-cost-engine.test.js`: 21/21 passing (legacy formula regression tests).
- `node assets/tests/shipping-plan-runtime.test.js`: 25/25 passing (legacy runtime contract tests).
- `node assets/tests/shipping-plan-canonical-fingerprint-cumulative-release-f1-7n-fa-3c-r6e1a.test.js`: 105/105 passing.
