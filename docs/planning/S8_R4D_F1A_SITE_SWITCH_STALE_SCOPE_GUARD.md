# S8-R4D-F1A — SITE-SWITCH STALE DERIVED-FIELD GUARD

## Two scope authorities advanced at different times, and the renderer combined them. Repaired at the point of use.

```
S8_R4D_F1A_SITE_SWITCH_STALE_FIELD = PASS — root cause proven, repair implemented and tested
ROOT_CAUSE_CLASS      = LOCAL STALE-STATE / MISSING SCOPE-GENERATION GUARD
ROOT_CAUSE_CONFIDENCE = PROVEN — by source, and by mutation (removing the guard reproduces the defect)
ARCHITECTURE_DECISION_REQUIRED = NO
FRONTEND_ONLY = YES · DB_CHANGE_COUNT 0 · SCHEMA_CHANGE_COUNT 0 · RUNTIME_WRITE_CHANGE_COUNT 0
DEPLOYED = NO · PUSHED = NO
```

---

## 1. Root cause

**Two scope authorities exist on this page and they advance at different times.**

```
the TABLE renders the APPLIED scope     _irRenderScope_   -> _irSearch.applied        advances on Search
the reco/gap chain asks the SELECTORS   _irctxScope       -> _replenSelectedScope      advances on change
                                                          -> document.getElementById('replenCountry').value
```

`_irApplySearch_` commits the new scope, paints, and only **then** starts the scope-dependent reads:

```js
_irSearch.applied = { country: pending.country, marketplaceId: pending.marketplaceId };   // :10586
...
renderReplenishment();                                       // :10594   paints the NEW scope
if (typeof _irRecoTrigger === 'function') _irRecoTrigger();   // :10599   clears the OLD state
```

At `:10594` the row builder is already on the new scope while `_irRecoState` and `_irMatState` still hold the
**previous site's** result. Both consumers guarded on *"a scope is loaded"* and never on **which**:

```js
function _irCanonicalSalesBasis_(sku) {
  if (sku == null || !_irRecoState || !_irRecoState.scope || ...) return null;   // truthy, never compared
```

```
RESULT   the previous site's Avg. Sales/day, Days of Supply and Suggested Qty rendered under the new
         site's header until the new response landed and re-rendered.
```

Days of Supply is collateral, not a separate bug: `_dosDisplay` is computed from the same `_canonBasis`
([:12081](../../assets/js/pages/inventory-replenishment.js#L12081)), so it carried the other site's rate too.

```
AVG_SALES_SOURCE
  BASE      amazon_weekly_sales_snapshot -> IR.avgSalesPerDay(weeklyRows, scope)   :12031
            first-layer, filtered by the RENDER scope -> always correct for the site on screen
  OVERRIDE  _irCanonicalSalesBasis_(sku) -> _irRecoState.linesBySku[sku][].horizonBasis.avgSalesPerDay
            ASYNC, from recommendation.workspace.get -> THIS was the stale value
ACTIVE_SCOPE_SOURCE            _irSearch.applied  (the only place it is assigned is _irApplySearch_)
COMMITTED_RESULT_SCOPE_SOURCE  did not exist. That absence IS the defect.
STALE_RENDER_MECHANISM         NEW applied scope + OLD async result, combined by a consumer that could not
                               tell them apart because no result recorded which scope it belonged to.
```

**The §3 hypothesis is confirmed, with one correction worth stating.** The selector state does advance before
the committed result — but **not** for the main table. The explicit-Search gate already protects the row set:
a selector change marks stale and repaints nothing. What advanced early was the *second* authority, feeding
three cells through a side channel. The table was right about which SKUs; it was wrong about three numbers.

## 2. The repair

One scope identity, stamped on every async result, **compared at the point of use**.

```js
function _irAppliedScopeKey_() {                       // country|marketplaceId, from _irSearch.applied
function _irResultMatchesAppliedScope_(st) {           // a MISSING stamp is a mismatch, never a pass
    if (!st || typeof st.appliedScopeKey !== 'string') return false;
    return st.appliedScopeKey === _irAppliedScopeKey_();
}
```

```
STAMPED AT   _irRecoApplyEnvelope (both branches) · the LOADING assignment · loadInventoryGap_ (captured
             ONCE at issue time, so a response can be placed even independently of the sequence guard)
REFUSED AT   _irCanonicalSalesBasis_      -> null  -> the weekly value, which is correct for THIS scope
             _irRecoLinesForSku           -> null  -> PENDING
             _irRecoHasSalesDrivenBasis_  -> false -> no re-render on a foreign result
             _irSuggestedQtyState_        -> { state: 'PENDING', value: null }
```

**Why at the consumer and not at the request.** A guard on ordering protects one call path and holds only
while that ordering holds. A result that carries the scope it belongs to is refused by *every* consumer, on
the first paint, on a late response, on a session-cache hit, and by any field added later — §8's requirement
that the future On-the-Way aggregate inherit this is satisfied by construction rather than by a reminder.

**Avg. Sales/day falls back to a correct number, not to a blank.** §1 permits blank / `--` / pending; the
weekly value is better than all of them because it is computed from `weeklyRows` filtered by the render scope.
The canonical rate replaces it when this scope's own result lands. `--` is still shown where it was before: a
sales-driven SKU whose canonical rate resolved to null.

**Suggested Qty is PENDING, not NONE and not 0** (§7). PENDING means *nothing is known for this scope yet*;
NONE means *this scope has no actionable line*. Collapsing them would be the same class of lie in a quieter
register.

### What was deliberately NOT changed

```
NOT  the Search UX contract — a selector change still only marks stale (option B is unchanged, §5)
NOT  the request timing — _irRecoTrigger still runs after renderReplenishment
NOT  _irctxScope's live-selector reading — it feeds eligible warehouses and the context model, not just
     this page's display, and narrowing it would reach further than this defect
NOT  the first layer — 13 tables, the same single _wsPayload, no new mandatory read (§11)
NOT  the write path — see §5 below
```

## 3. §4 — cache / restore audit

```
AVG_SALES_CACHE_KEY     _irRecoState.contextKey = JSON.stringify({company, country, marketplace})
                        + (NEW) appliedScopeKey = country|marketplaceId of the APPLIED scope
CACHE_SCOPE_COMPLETE    YES, after this round. Before it: the KEYS were complete and the CONSUMERS did not
                        read them — which is why a complete key did not prevent the defect.
```

| cache | key | verdict |
|---|---|---|
| remembered scope (`localStorage`) | country + marketplaceId | complete; restores a scope, never a result |
| in-memory completed result (`_irReadModel`) | — | first-layer, **all sites**; filtered by the render scope at build time, so it cannot be stale |
| lazy exposure (`_irExposureByScope`) | `company\|country\|marketplaceId` from `_irSearch.applied` | **already correct** — S8-R4B-2D made it per-site and it keys off APPLIED |
| recommendation (`_irRecoState`) | contextKey (live selectors) | key complete, **consumer unguarded** -> repaired |
| materialized gap (`_irMatState`) | scopeKey (live selectors) | key complete, **consumer unguarded** -> repaired |
| session reco cache (`_irRecoCacheGet`) | scopeReq | complete; its apply path is now stamped like any other |

**The finding worth keeping: a complete cache key is not a guard.** Both states recorded their scope
accurately and neither consumer ever looked at it.

## 4. §6 — every scope-dependent field, classified

| field | source | class | was it stale? |
|---|---|---|---|
| Current Stock | `amazon_inventory_snapshot` -> `IR.latestSnapshot(invSnaps, scope)` | FIRST_LAYER_ATOMIC | no |
| 3rd Party Stock | overseas + warehouses -> `IR.sitePlanningAllocation` | FIRST_LAYER_ATOMIC | no |
| 90 days FC / Upcoming Event | `fc_*` tables, render scope | FIRST_LAYER_ATOMIC | no |
| Factory Stock (cn/tw) | `factory_stock` -> `IR.factorySiteAllocation`, memoized per SKU **per render** | FIRST_LAYER_ATOMIC | no |
| On the Way (buckets) | lazy exposure, keyed on the APPLIED scope | LAZY_CURRENT_SCOPE | no |
| On the Way (headline) | literal `0` ([:12128](../../assets/js/pages/inventory-replenishment.js#L12128)) | — | **invalid zero semantics — F2, §6 below** |
| **Avg. Sales/day** | weekly (atomic) **overridden by** async canonical basis | LAZY_CURRENT_SCOPE | **YES — repaired** |
| **Days of Supply** | derived from the same basis | LAZY_CURRENT_SCOPE | **YES — repaired** |
| **Suggested Qty** | `_irMatState` (async materialized gap) | LAZY_CURRENT_SCOPE | **YES — repaired** |

Everything built synchronously from `_irReadModel` is atomic by construction: the first-layer model carries
all sites and is filtered by the render scope at build time, so it cannot disagree with the header. **Only the
three fields fed by a side channel could, and all three were.**

## 5. §10 — write-path isolation, and the one place deliberately left unguarded

```
WRITE_ACTIONS_SENT = 0 · RUNTIME_WRITE_CHANGE_COUNT = 0 · no write constructor was touched
```

`_irExpectedDemandFromSnapshot_` ([:11511](../../assets/js/pages/inventory-replenishment.js#L11511)) reads
`_irMatState` **directly**, not through `_irSuggestedQtyState_`, so the display guard does not reach it — and
that is on purpose. It declares the expected demand that lets the server raise `EXPECTED_DEMAND_CONFLICT`.
Making it refuse on a scope mismatch would **suppress a server-side conflict check** rather than tighten one:
the server would receive no declaration and run no comparison. That is a change to Submit Plan semantics,
which §10 forbids, and it would be the wrong change even if it did not.

```
RESIDUAL, REPORTED NOT REPAIRED
  _irExpectedDemandFromSnapshot_  — Submit declares demand from _irMatState without a scope comparison
  handleReplenAiPlan              — AI Plan derives from _irMatState.rows for "the on-screen scope"
                                    (its own comment, :11176), likewise uncompared
EXPOSURE IS NARROW, AND THE REASON IS STRUCTURAL: loadInventoryGap_ sets LOADING **synchronously** inside
_irApplySearch_, so by the time any click can be dispatched _irMatState already belongs to the new scope.
The stale window spans one synchronous statement — long enough to PAINT, too short to CLICK.
Both deserve the same guard in a round authorized to change action inputs. Neither is a display path.
```

## 6. §12 — F2 decision freeze, recorded not implemented

```
D1  STATUS VOCABULARY — do NOT modify the shared classifyStatus in F2.
    Use a dedicated READ-ONLY On-the-Way DISPLAY classifier, derived from the canonical shipment lifecycle
    before implementation. partially_received counts its remainder: MAX(0, shipment_qty - shipment_received_qty).
    (This is the F1 audit's option (b). Rationale stands: repairing the shared classifier moves
    qualified_incoming_snapshot -> calculated_gap_qty -> recommended_qty, i.e. it re-prices PERSISTED
    recommendations. A display round must not do that as a side effect.)

D2  ARCHITECTURE A CONDITIONALLY APPROVED — server computes the compact aggregate, client receives the
    aggregate only; raw Shipment / Plan / Allocation detail stays lazy.
    F2 OWES A PRODUCTION COST GATE for the additional server-side read work.
    THE WHOLE-SHEET 2-4 TABLE READ IS NOT PERMANENTLY SCALABLE AND MUST NOT BE CALLED SO.
    Long-term debt stands: historical shipment growth remains LINEAR in read work. Archive split is the
    cheaper first option; materialization carries a staleness window and a write dependency.

D3  MULTI SITE AUTHORITY = shipping_plan_lines line-level marketplace lineage.
      shipment_lines.shipping_plan_line_id -> shipping_plan_lines -> shipping_plans
    Do NOT infer marketplace from a MULTI shipment header.
    Missing / dangling / ambiguous lineage: FAIL CLOSED, never converted to zero.
    Do NOT add a scalar allocation_draft_id to shipping_plans or shipment_plan_links.

F2 ALSO INHERITS §8: the On-the-Way aggregate must distinguish NOT_LOADED · UNRESOLVED_LINEAGE ·
READ_FAILURE · RESOLVED_ZERO · RESOLVED_QTY, and must carry `appliedScopeKey` so
_irResultMatchesAppliedScope_ refuses a foreign-scope aggregate exactly as it now refuses the other three.
The predicate is exported for that purpose; F2 must not invent a second one.
```

## 7. The cache token — rotated, and why it was not optional

`inventory-replenishment.js` is fetched **by the router** (`app.js:132`), not by `index.html`. A returning
browser holding the cached copy is never told to ask again — so without a rotation this P0 repair would reach
only users who have never opened the page, which is the complement of the population that has the bug.

```
s8r4c-lazyexposure-20261004  IS PUBLISHED — origin/main (3ebc7d6) serves it on 55 index.html entries and
                             8 app.js route assets. By the ROUND_TOKENS rule a published token cannot be
                             reused, so new bytes under it would be exactly the violation the ledger exists
                             to prevent.
APPENDED                     s8r4df1a-scopeguard-20261008
ROTATED                      index.html 55 · app.js 8 · the gitignored local acceptance harness 9
NOT ROTATED                  the MAP, IR-CSS and METHOD-REGISTRY families — no file in them changed, and
                             rotating one along for the ride is a mutant that suite already catches (M6)
COST, STATED                 every returning browser re-downloads the application asset set once
```

`cache-token-rotation-s8-r4c-p1.test.js` A3b pinned the spent token at `length - 2`. That was true of the R4C
round and became a claim about **every round after it**. Converted to the established floor — still in the
ledger, still before the current token — with the reason recorded in place. **Nothing was loosened:** it still
fails if the entry is removed, reordered or rewritten.

## 8. §13 — acceptance

```
AVG_SALES_STALE_SCOPE_REPRODUCED_PRE  = YES — by EXECUTION, not by description. Mutants H1/H2 remove the
                                        guard and the US rate (7.5) and US quantity (900) reappear under CA.
                                        Both are CAUGHT, so the pre-repair behaviour is a measured fact.
AVG_SALES_STALE_SCOPE_POST            = 0 occurrences
LATE_RESPONSE_WRONG_SCOPE_COMMIT      = 0
SUGGESTED_QTY_OLD_SCOPE_COMMIT        = 0
SUGGESTED_QTY_LAZY_PRESERVED          = YES — PENDING, then the current scope's value
FIRST_LAYER_TABLE_COUNT               = 13, unchanged
EXPOSURE_FIRST_LAYER_REGRESSION       = 0 — no exposure table re-imported, no new mandatory load
WRITE_ACTIONS_SENT                    = 0
```

> **CORRECTED BY S8-R4D-F1A-R1.** This section first reported *215/216, the one failure pre-existing*. That
> number was measured on an UNCOMMITTED tree, and it was incomplete: `first-layer-redundant-header-read` E8
> reads `git diff f6b4164 HEAD`, which compares COMMITS, so the change was invisible to it until it landed.
> Measured properly, against the pre-F1A commit and the release commit:
>
> ```
> BASELINE_FAILURE_SET (8826f89)  gap-job-done-notice-f1-small-r1 — 3 Order Planning assertions
> POST_FAILURE_SET     (6e0db0b)  the same 3, and nothing else
> F1A_NEW_FAILURE_COUNT           1 at first measure -> E8, a one-ended interval, repaired -> 0
> ```
>
> A second apparent baseline failure (`b1-advanced-sheets-benchmark-harness`, 3 VACUOUS mutants) was an
> artifact of the FRESH baseline worktree: git checked that tool out CRLF while the committed blob is LF,
> so three mutation anchors found nothing. Converting the file to LF reproduced the release tree's result
> exactly. It is a property of fresh checkouts, not of the commit — the hazard already recorded as
> "the working tree is not the commit".

`site-switch-stale-scope-guard-s8-r4d-f1a.test.js` — **35 assertions, 4 mutants, 0 survived.** Every §9 fixture
is covered: 1 (US->CA), 2 (late response), 3 (CA->EU->JP, only the final scope commits), 4 and 5 (the Search
sequence guard and the fact that a failed Search never assigns `applied`), 6 and 7 (lazy Suggested Qty
discarded then committed), 8 (a synthetic future state, which is exactly what F2's aggregate will be).

Mutant **H3** is the one worth naming: it rewrites the comparison to `st.appliedScopeKey === st.appliedScopeKey`
— a guard that type-checks, reads plausibly, and is a tautology. It is caught. A guard that cannot fail is not
a guard, and this is the shape that would have survived a review.

---

```
STATUS      IMPLEMENTED · TESTED · NOT DEPLOYED · NOT PUSHED
FILES       assets/js/pages/inventory-replenishment.js   the guard + four consumers
            index.html · assets/js/app.js               cache token rotation
            assets/tests/_release-order.js              the appended token + its justification
            assets/tests/cache-token-rotation-s8-r4c-p1.test.js   A3b equality -> floor
            assets/tests/manual-route-composer-...-e2.test.js     fixture stamped for its own scope
            assets/tests/site-switch-stale-scope-guard-s8-r4d-f1a.test.js   NEW
NEXT        S8-R4D-F2 — the On-the-Way first-layer aggregate, under the D1/D2/D3 freeze in §6
QUEUED      G1 Amazon blank-date decision · showSection UI debt · auto-load UX (KEEP, frozen)
```
