# Follow-up — Inventory Replenishment Recommendation Summary wording polish (deferred)

> **Status: DEFERRED — do NOT implement until AFTER the controlled live cutover verification.** Opened by
> the F1-4B-FM2 diagnosis round (2026-08-06) at the user's explicit instruction. This is a **UI-wording-only**
> follow-up; it is NOT a runtime defect and NOT part of the FM2 commit.

## Why this exists (diagnosis result, not a bug)

The Inventory Replenishment "Recommendation Summary" shows:

> "No recommendation generated — the recommendation engine is not active. Build routes in the Execution Plan below."

Source: [inventory-replenishment.js:1570](../../assets/js/pages/inventory-replenishment.js#L1570) — reached
**only** via `_legacyRecSummaryTableHtml` → `_recSummaryRows`, i.e. **only when the recommendation Workspace
flag is OFF** (`_irRecommendationWorkspaceEnabled()` false). The runtime, transport, mapping, identity, and
per-destination presentation are all correctly implemented and correctly wired (search →
`renderReplenishment` → `loadRecommendationWorkspace_` → flags ON → one scope-only request). The placeholder
is **expected disabled behavior** while any of the following hold:

- `USE_WORKSPACE_API = false` (master), or
- `WORKSPACE_ENABLED.recommendation = false` (per-workspace), or
- the deployment / `RECOMMENDATION_CALCULATION_MONTH` Script Property is not enabled/configured.

Classification: **`FLAGS_DISABLED_EXPECTED_LEGACY` — NO CODE DEFECT.** The current wording is merely
*misleading* ("the recommendation engine is not active" reads as **broken** rather than **flag-gated off**).

## The deferred change (wording only)

Replace the misleading phrase with wording that truthfully reflects the feature state, e.g.:

- "Recommendation Workspace is currently disabled." — or —
- "Recommendation is unavailable until Recommendation Workspace is enabled."

## Constraints when this is eventually done

- **Do NOT change runtime behavior**, the flag predicate, the request path, or any calculation.
- **Do NOT enable any source flag by default.**
- Touch only the disabled-state string in `_recSummaryRows` / `_legacyRecSummaryTableHtml`.
- Update the one coupled assertion in
  [replen-recommendation-context-f1-4b-b-pre.test.js](../../assets/tests/replen-recommendation-context-f1-4b-b-pre.test.js)
  (currently asserts `/No recommendation generated/` + `/AI Pending/`) to the new wording.
- Sequence: only **after** the controlled live cutover verification (F1-4B-FM1-V and the FM2 live check)
  confirms the enabled path renders correctly, so the disabled wording and the enabled path are validated
  together.

## Not in scope here

No Execution Plan / Allocation Draft / Submit / persistence / formula / schema change. Pure wording.
