# S6-R2A — operator decision acceptance + S6 decision freeze

**Base** `61ca8e5` · decision acceptance only · `BEHAVIOR_CHANGED = NO` · `PRODUCTION_ROWS_WRITTEN = 0`

Contract owner: `docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md` **Part III, §18–§21**.
Suite: `assets/tests/s6-r2a-decision-freeze-guards.test.js` — 64 passed / 0 failed, 5/5 mutants.

```
PRE_SHA = 61ca8e5   HEAD = 61ca8e5   branch = feature/product-strategy-board-p0
origin/main = origin/feature = 2b82288        WORKTREE_CLEAN_AT_START = YES
S3_FINAL_SEAL = YES · S4_FINAL_SEAL = YES · S5_READY_FOR_INTEGRATION = YES
S6_CONTRACT_AUDIT_COMPLETE = YES · S6-R2 evidence present
S5_DEPLOYMENT = HOLD   S6_DEPLOYMENT = HOLD
```

All seven decisions are frozen. `UNRESOLVED_DECISION_COUNT = 0`.

---

## How the freeze was made durable

A decision recorded only in prose is the thing this series has now watched rot **three** times — B-1's reserve
trigger, the `spec only` labels on `shipment_routes`, and the PO clamp. So each frozen token is written into
the contract document and the suite **reads them back out of that document**. Delete a freeze from the
contract and the suite fails.

Beyond that, each decision is guarded in the way its state deserves:

| state | how it is guarded |
|---|---|
| already true in deployed code (**A**, **E**) | asserted directly against the code |
| awaiting S6-R3 (**B**, **C**, **D**) | a **tripwire** on today's mechanism — the implementing round fails this suite and must update the decision record |
| must hold through and after the fix (domain separation, closed vocabulary, one reservation owner) | a plain guard |

The tripwires matter most. `B1` asserts the shipment creator still has *no* factory/overseas branch; `C1`
asserts cancel is still refused from `approved`. Both are statements that the defect is still open. When R3
closes them, these lines fail — which is the only reliable way to stop an implementing round from quietly
resolving an operator decision on the operator's behalf.

---

## The correction this round owes

**D-S6-E was already implemented, and I reported the opposite twice.**

S6-R1 recorded the PO over-receipt clamp as frozen live behaviour, and S6-R2 recommended **keeping** it —
both citing `FC-1A §H.4`. `FC-1A-R1 §K` had already removed it:

```
13_ poRcvEvaluateLine_   "THE SILENT CLAMP IS GONE."
  if (recv > maxRecv) return { status: 'error', issue: 'PO_RECEIPT_EXCEEDS_REMAINING_QTY',
    attempted: recv, remaining: maxRecv, excess: recv - maxRecv, … }
  …evaluated BEFORE the `status: 'apply'` branch, so no inventory is mutated
  …and tolerance/override deliberately NOT implemented, "because inventing one silently is how the clamp happened"
```

`13_` is at `…R12`, its `63_` manifest entry expects `…R12` and describes it as *"the typed
`PO_RECEIPT_EXCEEDS_REMAINING_QTY` refusal (no silent clamp)"*, and two existing suites already assert it.
`…R12` precedes the last deployed baseline, so it is live in production.

I carried a document's claim forward across two rounds without re-reading the code — which is exactly the
failure mode S6-R1 was written to catch in *other people's* documents. The operator's decision (refuse, return
remaining/entered/excess, mutate nothing) is already deployed reality and needs no implementation.

**Also superseded:** S6-R2 recommended option **D** for D-S6-B — remove overseas from the Ship From picker for
Phase 1. The operator chose **A**: overseas is a first-class Phase-1 shipping source and the protection must be
built. That is recorded here rather than argued; the R2 board's recommendation is annotated as superseded so
nobody reads it later as current advice.

---

## What S6-R3 inherits — and the headline is that nothing needs a schema change

Every mapping answer below is from live code. Full table in the contract, §20.

**A · Overseas reservation — the ledger already models it.** `overseas_inventory_movements` declares
`from_stock_type` / `to_stock_type` with `reserved` in its allowed set, and carries
`wh_before_reserved_stock` / `wh_after_reserved_stock` beside the available and physical pairs.
`overseas_inventory_snapshot.wh_reserved_stock` exists. So an `available → reserved` movement is expressible
**today, on the existing headers, with no column added**. What is missing is a *writer* and an *availability
term*: `KMFSG.availableToAllocate` reads factory balances only, filtered to `is_factory_warehouse`. R3 builds a
second availability owner for a second domain — deliberately **not** a merged one, per §2A.

**B · The approved-plan escape needs no new field.** `KMFSG.PLAN_RELEASED_STATUSES` already contains
`cancelled`, so setting the status releases the exposure automatically. `cancelled_by` / `cancelled_at` exist
and are already written by the draft/pending path. `shipmentFindForPlan_` already answers "does a shipment
exist". The change is **one precondition in one branch** of `spUpdateShippingPlanStatusCore_`.

**C · `shipment_receipt` is a misfiling, not a missing type.** Declared in `FSTX_MOVEMENT_TYPES_` (the factory
vocabulary), on neither factory axis, and written by `31_` onto the overseas ledger. The overseas domain
declares no vocabulary constant at all. R3 gives it one and removes the type from the factory list. Seven
stays seven — `MOVEMENT_VOCABULARY_EXPANDED = NO` is satisfied by *moving*, never by adding.

**D · Nothing to do.** See above.

**E · The cheapest item in the series.** `factory_stock_allocation_plans` has **zero** references in any `.gs`
or `.js` under `assets/js` or `assets/specs`. Naming `warehouse_id` the authority affects **0 write paths**.
The suite asserts that zero-reference fact, so the day something starts reading the table, the freeze has to be
honoured in code rather than only in a document.

```
SCHEMA_CHANGE_REQUIRED  A NO · B NO · C NO · D NO · E NO
MIGRATION_REQUIRED      A NO · B NO · C NO · D NO · E NO
```

---

## One thing R3 should not be allowed to assume

§2A freezes overseas as a shipping source *and* keeps the domains separate, and those two pull against each
other in exactly one place: `KMFSG`. Its contract sentence begins *"one shared factory pool (warehouse_id||sku,
never filtered by company)"*, and `fsgReadInventoryFacts_` filters balances to `is_factory_warehouse`. A round
that "adds overseas support" by loosening that filter would merge the domains through the back door — the
availability arithmetic would start summing two physically different pools into one headroom number.

The suite guards both directions today (`B4`, `B5`: neither handler reads the other's tables), but those are
handler-level. The arithmetic-level guard does not exist yet because there is nothing to guard. **R3 should add
it in the same change that adds the overseas term**, or the separation becomes a property of nobody's test.

---

## Results

```
FOCUSED   s6-r2a-decision-freeze-guards   64 passed / 0 failed   5/5 mutants
FILES_CHANGED  1 new test
SPECS_CHANGED  Part III of the S6 contract · 1 new evidence doc · 2 annotations in the R2 board
BEHAVIOR_CHANGED NO · PRODUCTION_ROWS_WRITTEN 0 · DB_MIGRATION_REQUIRED NO
APPS_SCRIPT_SYNC_REQUIRED NO · FRONTEND_DEPLOY_REQUIRED NO
```

## Sweep

```
567 passed / 572   canonical 5   19 lines   DIRTY 0   WORKTREE_CLEAN_AT_END = YES
572 rather than 571 because this round adds one suite. It contributed zero fail lines.
CANONICAL_FAILURE_SET_CHANGED = NO — diff-clean against the R8 artifact, line for line
CANONICAL_DIGEST = ebcf7bc1651e792f7dbab73544cfa2593f91664a9ed399a04f9a5ba9c9bc4f92   (reproduced)
```

Canonical on the first sweep, and the third consecutive round to reproduce the re-baselined digest.
