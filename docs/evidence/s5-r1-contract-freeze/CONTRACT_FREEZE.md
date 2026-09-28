# S5-R1 — Recommendation / Decision Engine contract freeze

**Base** `3f48f58` (S4 final seal) · contract: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md`
· decisions: `DECISION_BOARD.md` · guard: `assets/tests/s5-r1-recommendation-contract-freeze.test.js`

Spec round. `BEHAVIOR_CHANGED = NO` — no runtime, Apps Script, bundle, schema, migration or DB write.

---

## What the round found

**Seven of the eight pipeline stages already exist, frozen and live.** The task frames

> gap → own supply → cross-company → factory → residual → recommendation → operator decision → downstream draft

as something to design. Architecture A already does it: `43_` materializes `order_planning_gap`, KMMSA and the
R2G-B cross-company pre-pass allocate, §41 KMFSR reallocates surplus over the already-allocated coverage,
KMTPP produces one residual, KMCALC cartonizes it, and the flat-V2 draft row holds the operator's decision.

So S5-R1 is a **reconciliation**, not a design. It records the owners, verifies their cited facts are still
true, and puts the genuinely unowned business policy in front of the operator instead of inventing it.

Three things are actually missing, and they are narrower and more useful than a pipeline:

| # | Missing | Status |
|---|---|---|
| 1 | **A recommendation ACTION.** The engine emits a quantity and never says *what to do*. No action enum exists anywhere; the read workspace forbids that vocabulary by name today. | `D-S5-2` |
| 2 | **Half the explanation.** Four of eight §8 evidence fields reach the operator; `own_supply_used` and `committed_supply_used` are computed and then dropped as runtime DTO diagnostics. | `D-S5-4` |
| 3 | **A contention rule.** One donor surplus serving two receivers has no frozen split. | `D-S5-1` |

---

## The measurement worth keeping: coverage is counted exactly once

This is the finding with real operational weight, and it is one line away from being wrong at all times.

Overseas and factory coverage do **not** enter the monthly residual as a subtraction. They are folded into
KMTPP's **opening supply**:

```
42_:458-463   opening = siteStock + allocatedOverseas + allocatedFactory
42_:660       recoWsBuildMonthlyProjection_(months, composition.openingSupplyQty, …)
```

so `remainingGapQty` is already net of them, and the residual line reads:

```
42_:506-507   var overseasCoveredQty = 0, factoryCoveredQty = 0;
              residualOrderNeedQty = MAX(0, destinationGapQty - overseasCoveredQty - factoryCoveredQty)
```

Those two zeros look exactly like an unfinished stub. The allocation map holding the real values
(`rAlloc.overseasCoveredQty`, `rAlloc.factoryCoveredQty`) is in scope, three lines above. Substituting them —
the obvious, confident, wrong repair — would subtract the same coverage twice and understate every order need
in the system.

It is asserted from both ends, so removing either half fails: the fold must exist (E2), and the subtraction
must not (E8). Two mutants cover it (H1, H2).

```
DOUBLE_COUNT_RISKS  7 identified, 7 with a live structural defence (DC-1 … DC-7)
```

---

## What was verified rather than asserted

`§2A` mainline separation, measured over comment-stripped sources. The claim is about artifact **creation**,
not mention — the purchase mainline legitimately reads shipment status as supply evidence, and a shipment line
legitimately carries `purchase_order_line_id` for lineage. A probe that banned the words would have failed on
both honest usages.

```
shipment creator callers          {11_, 12_}   — shipping mainline only
ordering files calling it          0
shipping files naming request_orders / purchase_orders as tables   0
PO creation writes                 purchase_orders + purchase_order_lines only
```

`§3` ledger contract, measured on the key **expressions** rather than the file — `marketplace` is a legitimate
attribute on an emitted entry, so its presence in the module proves nothing either way.

```
demand key (regular)   company + destinationWarehouseId + masterSku + planningCycle + demandType + sourceRef
demand key (event)     company + destinationWarehouseId + masterSku + planningCycle + eventId
pool key               company + warehouseId + masterSku + poolType
marketplace in either  NO
DEMAND_LEDGER_CONTRACT_CHANGED = NO      SUPPLY_LEDGER_CONTRACT_CHANGED = NO
```

`§4` gap authority, read from the declarations so the document cannot drift from them.

```
GAP_KEY        company + country + marketplace + sku
headers        24 (asserted as a SET with a ≥24 floor, not an ordered literal)
status         { READY, BLOCKED }
RECOMMENDATION_RECOMPUTES_FORECAST = NO     RECOMMENDATION_RECOMPUTES_GAP = NO
```

The header is asserted as a set with a floor deliberately. `order_planning_gap` is explicitly designed to be
extended additively at the end — that is how the three §41 transport columns landed — so freezing its exact
spelling would ban the next additive column. Three rounds in this repository have now had to undo a claim that
recorded *how* something was spelled rather than *what* was true.

---

## Two probes that first reported a false failure

Both were my measurement being wrong, not the system drifting. Recording them because each is the kind of
error that reads as a finding.

**`calculation_status` looked like a one-value vocabulary.** The READY default is an object literal
(`calculation_status: 'READY'`) and every BLOCKED is a later assignment (`base.calculation_status = 'BLOCKED'`).
A pattern allowing no whitespace around the separator sees only the first and would have let the document claim
the gap materializer can never report a blocked line.

**`MANUAL_REVIEW` looked like a live action token.** It appears only inside `NEEDS_MANUAL_REVIEW` — the
flat-V2 *migration* classification for legacy draft ids, a different vocabulary answering a different question.
A substring search would have turned §7's honest "no action enum exists" into a false claim that one does.

Each repaired probe then got its own mutant (H8, H9). A probe loosened or tightened until a run goes green is
the easiest place in a suite for a real defect to hide, so each is required to still bite.

---

## Suite

```
s5-r1-recommendation-contract-freeze.test.js    99 passed / 0 failed    9 mutants killed / 9
deterministic across 3 runs · writes no file · leaves the tree clean
```

Sections: A owners exist · B mainline separation · C ledger contract · D gap authority · E the double-count
guard · F decision state vocabulary · G no action enum · H mutation.

---

## Decisions

```
DECISION_REQUIRED_COUNT = 6
```

`D-S5-1` two-receiver split · `D-S5-2` action enum · `D-S5-3` residual outcome ordering ·
`D-S5-4` reason token vocabulary · `D-S5-5` state vocabulary rename · `D-S5-6` recommendation expiry.

Each carries options, business and system effects, and a recommendation, in `DECISION_BOARD.md` and in §15 of
the contract. **No S5 implementation may proceed around any of them.**

```
S5_CONTRACT_FREEZE_READY = YES   (for the frozen sections; the six decisions gate S5-R2)
```
