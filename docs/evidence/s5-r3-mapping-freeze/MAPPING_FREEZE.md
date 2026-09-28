# S5-R3 — recommendation schema / mapping freeze

**Base** `dce0550` · spec + tests only · `PRODUCTION_CODE_CHANGED = NO` · `BEHAVIOR_CHANGED = NO`
`DB_MIGRATION_REQUIRED = NO` · `NEW_TABLE_REQUIRED = NO` · `SCHEMA_EXTENSION_REQUIRED = NO`

Owner of record: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md` **Part IV, §40–§53**.

---

## The finding that reordered the round

The round was framed as "map the frozen contract onto storage". The first hour of auditing found that the
thing being mapped **already exists**: `assets/js/core/supply-recommendation.js` (`KMREC`) describes itself as
*"ONE pure, deterministic Phase-1 Recommendation owner"*, already reads a materialized `order_planning_gap`
row, already derives staleness, already cartonizes once through `KMCALC`, and is already driven by both the
manual button and the scheduled job.

So S5-R3 is not a design for a new engine. It is a bounded additive derivation on an existing one, and every
slice in §50 is written against `KMREC` for that reason. `SECOND_CALCULATION_PATH_COUNT = 0` is then structural
rather than a promise.

---

## Three fields the frozen model asks for that the data cannot honestly supply

Each was reached by reading the live header array and the live expansion path, not by inferring from a name.

**`destination_warehouse_id`.** On the monthly MONTHLY_ORDER mainline `destinationWarehouseId` is accepted only
as *deprecated compatibility input* and is *"NEVER used to drive fanout"* (`42_:60-63`). A `platform_fulfilled`
SKU expands to one MARKETPLACE line with no warehouse; a `self_fulfilled` SKU expands to several WAREHOUSE
lines whose quantities `43_:167` then sums into a single row. The warehouse axis is collapsed before
persistence, deliberately. There is no column, and there is no recoverable value.

**`starting_gap_qty`.** Overseas and Factory coverage are folded into the single KMTPP **opening supply**
(`42_:458-463`), so the residual's coverage terms are pinned to literal zero (`42_:506`) and
`residualOrderNeedQty === destinationGapQty === remainingGapQty`. `starting_gap_qty` and `remaining_shortage`
are therefore **not two stored columns — they are the same one**, and the pre-coverage number is never computed
as a separate value anywhere. It cannot be recovered by adding a column; that is why it is class **D** and not
class **C**.

**`required_by_date`.** It exists inside the engine and orders §41 receivers, but the monthly tier grain is a
month. Choosing a day-of-month would be inventing business policy, so the honest grain (`tN_month`) is exposed
and the field is reported unavailable at day precision.

---

## A correction: `reallocation_in_qty_snapshot` is not cross-company

Part II §27 mapped `cross_company_supply_used` to `reallocation_in_qty_snapshot`, and the frozen token set
named the branch `CROSS_COMPANY_REALLOCATION`. The stored number is **intra-company**: `43_:542` groups §41
receivers as `r.company + '||' + r.sku`, so a KMFSR transfer cannot cross a company boundary.

Cross-company arbitration is a different, earlier step — the R2G-B pre-pass allocating a contended physical
Factory pool once via `KMAR` — and **whether a SKU was contended is not persisted**, so true cross-company
usage cannot be read back from any column.

The token is therefore renamed to `FACTORY_SURPLUS_REALLOCATION_APPLIED`, which is the live code's own word
(`supply-planning-surplus-reallocation.js:225`). Deriving the name from the declaration rather than inventing
one is the same discipline the earlier rounds settled on.

```
S5_R2_CROSS_COMPANY_FIELD_NAME = SUPERSEDED_BY_S5_R3_EVIDENCE
```

Parts I–III are **not rewritten**. The correction is recorded in Part IV, exactly as S5-R2A recorded S5-R1's
contention premise.

## And three frozen tokens are withdrawn

`OWN_SUPPLY_APPLIED`, `OVERSEAS_SUPPLY_APPLIED` and `COMMITTED_SUPPLY_APPLIED` were frozen from the *branch
names* of §22 rather than from stored evidence. Each cites a value that is computed at `42_:463` and then
discarded. §6 of this round is explicit that a token may not exist because a branch name sounds plausible.

Each withdrawal is stated as a missing **column**, not a missing concept, so all three return automatically —
with no contract change — if the optional snapshot columns proposed in Part II §38 are ever added.
`FORWARD_VISIBILITY_ONLY` is added because `KMREC` already computes that exact distinction and it was
previously unnamed.

```
REASON_TOKEN_SET_SIZE = 7   (was 9: 3 withdrawn, 1 renamed, 1 added)
TOKEN_WITHOUT_EVIDENCE_COUNT = 0
```

---

## The action derivation is a model, because Slice A is not authorized

Nothing in production derives an action after this round. The frozen §45 rule is written once, in the test
suite, as a pure function of one gap row plus the **real** `KMREC` DTO. That proves the action is derivable
from values that already exist — which is what a mapping round must prove, and all it may prove.

The grain is the **row**, not the tier, and that is forced by the data: `reallocation_in_qty_snapshot` exists
once per gap row, and `totalRecommendedQty` is a single cartonize-once figure. A per-tier `REALLOCATE` could
not be evidenced, so it is not offered.

`REALLOCATE` is evaluated before `NEW_ORDER` because a line may be both and the reallocation is what must be
acted on first; the surviving residual is still carried in the quantity and the tokens.

---

## What the tests caught in my own work

Three failures on the first run, all mine, all real:

| probe | what it said | what was actually true |
|---|---|---|
| A6 | "exactly one core consumer of `KMCALC.calculateSuggestedOrderQty`" | **four** modules call it, and all four delegate. One *owner of the formula* with several callers is the intended shape; per-tier cartonizing for display is legitimate. The probe was wrong, not the repo. |
| E2 | `t1_gap_qty: 55` → `NEW_ORDER` | got `MANUAL_REVIEW`. `KMREC` resolves `KMCALC` from a global that does not exist under bare node, so the total silently became `null` and every `NEW_ORDER` fixture degraded. |
| F4 | `totalRecommendedQty` is a number | same cause as E2 |

**E2 is the more instructive one.** An un-wired suite would have gone green on a weaker assertion and "proved"
a derivation that never ran a carton calculation. The fix publishes the **real frozen owner** on the global so
the derivation runs against the canonical CEILING — deliberately not an `opts.cartonize` stub, which would have
proved only that the stub was called.

A6's fix names its one exception rather than filtering it: `supply-planning-recommendation-audit.js` reproduces
the published formula to explain a discrepancy and computes no planning quantity. Naming it keeps it a recorded
decision instead of a gap nobody can see. The contract's §44 was corrected to match.

---

## Results

```
s5-r3-mapping-freeze     134 passed / 0 failed     15/15 mutants killed
s5-r1-recommendation-contract-freeze   99 / 0      9/9
s5-r2-decision-freeze                  35 / 0      6/6
s5-r2a-contention-policy-freeze        59 / 0      8/8

FILES_CHANGED = 3   (1 spec, 1 new test suite, 1 evidence doc)  — unchanged by the decision round
PRODUCTION_CODE_CHANGED = NO    BEHAVIOR_CHANGED = NO
NEW_TABLE_REQUIRED = NO         SCHEMA_EXTENSION_REQUIRED = NO      DB_MIGRATION_REQUIRED = NO
APPS_SCRIPT_SYNC_REQUIRED = NO  FRONTEND_DEPLOY_REQUIRED = NO       TOKEN_ROTATION_REQUIRED = NO
IMPLEMENTATION_SLICE_COUNT = 5  SLICES_AUTHORIZED_BY_THIS_ROUND = 0
```

## Data safety, recorded before anyone needs it

No table in this path is test-only. `shipping_allocation_draft_lines` held **real** duplicated operator rows at
11:18:11 / 11:19:53 / 11:20:07 (`PRODUCTION_DATA_INTEGRITY_CLOSURE_F1-7N-FB-4B.md` §B.2). Every slice in §50
tests against in-memory fixtures and needs no production write; if a later round does, it needs its own
explicit authorization. The Order and Shipment tables must not be assumed test-only.

---

## Operator decisions — both accepted, and now enforced by structure

**D-S5-7 · reason token correction = ACCEPT.** A token exists only where live evidence supports it; a token
whose name asserts more than its evidence is renamed from the declaration in live code; a token whose evidence
is discarded is withdrawn, stated as a missing column. The Part II list is superseded where evidence disproves
it. `D_S5_4_EXPLAINABILITY` is unchanged — the explanation *model* is what found the bad members; D-S5-7 amends
the set, not the model.

**D-S5-8 · optional snapshot columns = DO NOT ADD NOW.** `NEW_TABLE_REQUIRED = NO`,
`SCHEMA_EXTENSION_REQUIRED = NO`, `DB_MIGRATION_REQUIRED = NO`. The named fields stay `NOT_AVAILABLE`.

Both were already the state of the tree, so nothing was implemented for them. What changed is that they are now
**structurally enforced** rather than only written down (suite §J):

- `J1/J2` walk the eleven deferred fields as a **closed set** against *both* storage tables.
- `J3` asserts each withdrawn token and its evidence column as a **pairing**, in both directions — which is what
  makes the withdrawal automatically reversible instead of a judgement someone must remember to revisit. If the
  column ever lands, the test fails until the token comes back.
- `J4` pins that the rename came from the live code's own word, not a fresh coinage.

None of these greps the decision's prose. A test that pins how a decision was *worded* bans the next round from
rewording it; what must not drift is the storage, so the storage is what is asserted.

```
D_S5_7 = FROZEN     D_S5_8 = DEFERRED (decided)     UNRESOLVED_DECISION_COUNT = 0
s5-r3-mapping-freeze  134 passed / 0 failed  15/15 mutants
S5_MAPPING_FREEZE_COMPLETE = YES
NEXT_TASK = S5-R4 — Slice A: pure action + reason derivation
```
