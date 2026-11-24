# Manual Order Allocation Production Repair

Baseline: `8b5f8e8e8c323fc351f24a789ee0d8a4998120b5`. User authorized repair and GitHub push; no live business mutations or automatic Apps Script deployment.

## Findings And Changes

- Confirmed missing drafts were locked by an older UI rule despite the existing manual create-on-quantity-edit handler. Unlock their quantity fields, initially blank. Keep loading/conflict/error/unresolved states locked. Remove obsolete AI Plan-required banners. Notes require a saved, month-bound tier.
- The real 15_ readback loader returns `{status,row}`, not a tier DTO. Convert through `KMRDV2P.flatReadbackDto` before verifying both saved quantity and month; preserve committed-but-unverified refusals.
- Bind all three zero-quantity monthly slots when a manual draft is first created. Their months are calendar offsets anchored to the user's selected tier/month, not server-clock guesses. Only the explicit edited quantity is adopted; no recommendation recalculation or schema change.
- The Production policy blocked subsequent locked user edits. Enable only `updateRecommendationDecisionLocked` with a MONTHLY_ORDER canonical ID, token and T1/T2/T3 quantity/note edits. Weekly types, snapshots, reconcile/insert, invalid quantities, AI generation and administration remain refused.
- Synchronize server/public policy SHA and router/health MA1 stamps. Add the required `RAEE_BUILD_VERSION_` stamp so 01_ + 63_ without the updated 15_ cannot identify as complete.
- Retain the exact prior DR4 identity for its existing actions during manual rollout. New manual writes require the new identity. No unknown-policy fallback, alternate endpoint or weakened DB/auth/module gate.
- Block Send while an allocation is saving/invalid/conflicted or differs from its saved DTO, including when its detail panel is closed. Note flush callbacks return their promises. Negative/nonfinite edits do not write a previous valid value.
- Draft-less advisory rows do not become Send assertions; editing one SKU must not accidentally assert all untouched suggestions on the page. The server still owns the comprehensive persisted workset.

## Installation

`output/manual-allocation-20261124/release-3/Production/apps-script` contains exactly:

1. `01_router.gs`
2. `15_request_allocation_handlers.gs`
3. `63_api_v1_system_health.gs`

Back up, replace all three, save, and update the existing Production Web App deployment to a new version without changing the URL. No 00_, 84_, manifest/OAuth, 90_, schema migration, reimport, initialization or data cleanup. Refresh frontend after deployment.

Health build suffix: `-DR4-MA1`. Required manual module: `RAEE_BUILD_VERSION_=MANUAL-ALLOCATION-20261124`. Policy SHA: `cc77c5a4692be7e787c65557198f7d673bcc06ece2cfb658f6655601fffd9420`.

The prior Shipment Overview 57_ update remains separate and unchanged. The running Sandbox and its frozen cumulative package are deliberately untouched; never install the Production router/health into Sandbox.

## Verification

- `node --test assets/tests/manual-allocation-production.cjs`: 10 policy/backend tests, including old-policy refusal, scoped edits, health/hash consistency, missing 15_, real flat readback and unverified readback.
- `node assets/tests/manual-allocation-browser.cjs`: 44 checks at 1440/390 using real Production guard/config, actual READY gap/readback, manual create, subsequent edits/notes, zero, T1/T2/T3 months, reload, failed read/save refusal and actual Send to Request without untouched draft-less suggestions. Old backend remains zero-write for this new manual UI.
- Mainline Node suites: 98 tests (Planning, Request transactions, PO setup and documents).
- Mainline browser C1: 64; C2: 39. Synthetic document, receipt, stock and schedule workflow preserved.
- New manual screenshots/results: `output/manual-allocation-20261124/verification`.

Known boundary: existing legacy drafts with missing/wrong tier months are not silently migrated. A month mismatch is never called Saved. Real Production /exec deployment and owner UAT remain required; no live order, receipt, dispatch, stock or Drive mutation was executed.
