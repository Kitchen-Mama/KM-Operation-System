# F1-7N-FC-1A — Shipment Draft Recovery · Factory Stock Reservation · One Stock Authority

**PRE** `c7f2813` · **Branch** `main` · **Scope** implementation of the four decisions frozen in §0.
**Constraints honoured:** NO live Submit / Approval / Shipment creation / dispatch / PO receipt / stock write /
DB repair / migration / push / deploy.

This round closes three of the four findings the FC-0A audit measured, and it does so on the existing schema:
**no new table, no new column, no migration.**

---

## 1. §E — The reservation source of truth, and why it is not a new table

§E required the existing model to be used if it can express seven facts. It can, exactly:

| fact | where it lives | new? |
|---|---|---|
| reserved balance | `factory_stock.fac_reserved_stock` | no — column exists since 2026-07-21 |
| which units | `factory_stock_movements.warehouse_id` + `.sku` | no |
| reserved qty | `factory_stock_movements.qty` (+acquire / −release) | no |
| **owner** | `related_entity_type='shipment'` + `related_entity_id=<shipment_id>` | no |
| **idempotency** | the same field pair — the mechanism `factoryImportCommittedKeys_` and `13_`'s `receiptAlreadyApplied_` already use | no |
| lifecycle status | **derived**: Σ(acquire) − Σ(release) per owner per (warehouse, sku) | no |
| release | a `reservation_release` row | no |

The FC-0A audit measured that **nothing had ever written a non-zero `fac_reserved_stock`**. The column was
already the right shape; it simply had no writer. It has one now.

Lifecycle is **derived, never stored twice.** A `reservation_status` column would be a third copy of a fact the
balance and the ledger already carry between them, and the one thing this codebase has proved repeatedly is
that a duplicated fact eventually disagrees with its sources. Arithmetic cannot drift from the ledger it is
computed from.

### The one thing that needs your acknowledgement

The movement-type vocabulary FC-0A measured as **closed at five** becomes **seven**:

```
inventory_import · manual_adjustment · po_receipt · shipment_out · shipment_receipt
+ reservation_acquire · reservation_release
```

This is additive to an existing column's value set. It needs no migration, and **no reader validates
`movement_type` against an allowlist** — verified across every non-generated `.gs` and the browser adapter. It
is exactly how `inventory_import` was introduced. It is flagged here because FC-0A recorded the vocabulary as
closed, and a closed set growing is a decision, not an implementation detail.

---

## 2. §F — One stock authority, enforceably

`21_`'s comment claimed *"No second stock-mutation implementation lives in any other file"* while `22_` carried
its own inline `setValue` + movement append. **The comment was false, and a comment that describes the
ownership one wishes for is worse than none: it is the reason a second implementation could exist unnoticed for
rounds.** It is corrected in the file, and the correction is now enforced rather than promised:

- `22_` **delegates** to `factoryStockApplyDeltaTx_`, passing both deltas in ONE call so the dispatch deduction
  and the reservation release are a **single indivisible movement row**, never two rows that can disagree.
- `12_` reaches stock **only** through the reservation primitives.
- `13_` (PO receipt) already delegated and is unchanged.
- **No file outside `21_` writes a `factory_stock` balance cell** — asserted as an equality over every
  non-generated `.gs`. This is the check that would have caught the old `22_`.

`21_` takes no lock of its own (it runs under the caller's), which is what prevents a nested-lock deadlock now
that four callers reach it.

### Three invariants, all checked before the first write

```
after_current  >= 0
after_reserved >= 0
after_current - after_reserved >= 0      ← the one that makes a reservation mean something
```

A refusal therefore leaves the sheet **byte-identical**, not half-applied-then-rolled-back.

`reservedDelta` defaults to `0`, so every pre-existing caller is byte-identical to its prior behaviour: a zero
delta does not dirty the reserved cell, does not add a journal entry, and does not make a replay look like a
write.

---

## 3. §B/§C/§D — The recovery, connected

**The measured S6 contract:** Approve writes `status='approved'`, then creates the Shipment Draft inside a
`try/catch` that does not undo it. The approval is kept (correct, and frozen by §0) — but the answer was a bare
success, and the only hint was an alert saying *"You can retry from Shipment Overview"*. That instruction was
unkeepable twice over: nothing in the frontend could reach `createShipmentFromPlan`, **and Shipment Overview
renders `shipped` onward, so the very state needing recovery could never appear there.**

**What changed:**

| | before | after |
|---|---|---|
| Approve answer | `{success:true, shipment:{…}}` | + `execution_commit`, + typed `recovery` |
| commit state | inferred from prose | `SHIPMENT_PRESENT` \| `APPROVED_SHIPMENT_CREATION_PENDING` |
| second Approve click | *"Only a Pending Approval plan can be approved (current: approved)"* — reads as though the approval failed | idempotent readback of the current state; **writes nothing** |
| recovery surface | none | the Approved plan card: banner + **Retry Shipment Draft** |
| recovery state storage | — | **none** — derived from `status='approved'` + no `shipments` reference |

Because the state is derived, a **reload shows the same answer with no migration and no reconciliation step**,
and a lost transport response cannot leave the UI claiming something the rows do not say.

**Done is deliberately not offered on a recoverable plan.** Marking the planning task complete while its
shipment is missing is exactly how this state used to leave the active view and stop being anybody's problem.

The retry adapter moved onto the canonical command runner (`_kmWeeklyCommand_`). The old adapter threw on a
business rejection, and the Weekly page's runner classifies a thrown error as `HTTP_TRANSPORT_ERROR` — so
`INSUFFICIENT_FACTORY_STOCK`, a precise and actionable answer, would have reached the operator as *"the network
failed"*. FC-0A measured that the action had no caller, so nothing depended on the old shape.

---

## 4. §G — The collision moved to where it belongs

Before: availability always equalled current stock, so a Submit Plan and a Shipment Draft for 800 left
availability reading the full 1000. Two sites planned the same physical units and the collision surfaced only
at **Confirm Shipment — after documents were prepared.**

Executed, with 1000 on hand and two sites each wanting 800:

| step | current | reserved | available | outcome |
|---|---|---|---|---|
| Site A Shipment Draft | 1000 | 800 | **200** | created |
| Site B Shipment Draft | 1000 | 800 | 200 | **refused, ZERO partial rows** |
| Site A dispatch | 200 | 0 | 200 | one `shipment_out` −800 |
| Site A dispatch replay | 200 | 0 | 200 | **not one cell changed** |
| *alt:* Site A cancels | 1000 | 0 | **1000** | Site B unblocked by the release, not by a timer |

Site B's **approval is still committed** (the frozen §0 decision). Only its Execution Commit is refused, and it
stays recoverable through the same Retry.

---

## 5. Two real bugs this round introduced, and the fixtures that caught them

Both were found by **executing** the handlers, not by reading the diff. Neither would have been visible in
review.

**(a) `csdMovementExists_` treated any shipment-owned movement as proof of dispatch.** Harmless while the only
shipment-owned type was `shipment_out`. From the moment reservations became real, **every reserved shipment
carries a `reservation_acquire` row referencing itself from the instant its draft is created** — so every
reserved shipment reported `already_confirmed` and could never be confirmed. **Nothing would have shipped at
all.** Now it asks the question that was always meant: is there a *deduction*? A reservation is a claim on
units; only `shipment_out` is evidence they left. (A movements tab predating the `movement_type` column keeps
the old, safe behaviour.)

**(b) The movement row's `qty` carried only the current-stock delta.** A reservation moves no physical units,
so every `reservation_acquire` row was written with `qty = 0` — and `factoryStockOwnerReservedTx_` sums exactly
that column. The per-owner ledger would have read **0 for every owner**, silently breaking three things at
once: acquire idempotency (a replay reserves again), the dispatch release (gives back `min(held, take) = 0`),
and the census reconciliation (balance vs ledger disagreeing on every row). `qty` is now the movement's primary
quantity — the current delta when there is one, otherwise the reserved delta.

---

## 6. Two §E branches that describe transitions this system does not have

Reported, not invented.

**Cancellation.** There is **no shipment-cancellation action anywhere in the router** — a shipment can be
hidden (`hidden_from_draft_at`) but never cancelled. So the release-at-cancellation contract has a **complete
authority and no trigger.** The primitive is exercised directly and proved: current unchanged, released exactly
once, reason recorded on the ledger row, replay a zero delta. This is the same class of gap S6b was.

**Quantity change.** `shipment_lines.shipment_qty` is the immutable Execution Snapshot — absent from
`SHIPMENT_EDITABLE_FIELDS_`, written by no handler after creation. The quantity-adjustment branch is
**vacuous by design, not unimplemented.** That immutability is now pinned by a test, because the day it becomes
editable the reservation silently stops matching the shipment.

**The source branch is not vacuous.** `source_warehouse_id` **is** editable, which was a real hole: moving the
source while the reservation sits on the old warehouse leaves units reserved where nothing ships from and
unreserved where something does. The edit now **moves** the reservation under one lock — availability at the new
warehouse validated first (a refusal writes nothing at all), then release at the old and acquire at the new,
with full lineage at both.

---

## 7. §H — A semantics correction worth keeping

`purchase_order_lines.remaining_qty` = `MAX(0, completed_qty − shipped_qty)` — the quantity **received and not
yet shipped**, not "ordered but not yet received". A full 500 receipt against an order of 500 reads **500**, not
0. Pinned with its formula.

**§H.4 asked for an over-receipt refusal. Measured, the frozen behaviour is a CLAMP:**
`if (recv > maxRecv) recv = maxRecv;`. Receiving 900 against 500 ordered receives 500 and stops. Reporting the
clamp as a refusal would be false, so the test pins the property the refusal was asked for — `completed_qty` can
never exceed `ordered_qty`, and no phantom stock is created. Receipt policy is **not changed** by this round.

A receipt into a warehouse that holds a reservation raises availability (200 → 400) and leaves the hold alone.

---

## 8. §I — Why the census is a replacement rather than an edit

The A3 census printed a full carrier eligibility trace before it printed the eligible-id list, and the Apps
Script log truncated **before** the list. Verbosity is not a presentation problem there; it destroys the answer.

`TEMP_FC1A_COMPACT_READINESS_CENSUS()` prints ONE compact JSON object: counts and capped id arrays, no row
dumps, no carrier trace. Every list goes through a cap that **always reports the true total** — a truncated list
hiding its own length would be the same failure as the truncated log. Worst case, every list full: **under 50 KB**.

Zero-write is **structural, not promised**: every sheet goes through `readOnly_()`, which exposes only
`headers`/`rows`/`col`/`count` and retains no write-capable handle. A test fails if `setValue`, `appendRow`,
`deleteRow`, `setValues`, `insertSheet`, `getScriptLock`, `PropertiesService`, `UrlFetchApp`, `MailApp`,
`DriveApp` or `clearContent` appears anywhere in its **code** with string literals blanked, so prose that names
a verb cannot mask a call.

It reconciles the reserved **balance** against the reservation **ledger** and reports `RECONCILED` or
`BALANCE_DISAGREES` with both numbers — **never rounded into agreement.**

---

## 9. §J — The deployment contract, and the two owners that lie by succeeding

`createShipmentFromPlan` joins `SYS_REQUIRED_ACTIONS_`; `SYS_REQUIRED_ACTION_LIST_VERSION_` 10 → 11.
`SYS_DEPLOYED_ACTION_CONTRACT_VERSION_` deliberately **does not move** — its rule is "bump when a router action
is added or removed", and this round adds no route. The action has been routed all along; what changed is that
a page now depends on it.

Four owner build stamps, because **an action list cannot see a file that is a round behind**:

| owner | a round behind does what? |
|---|---|
| `21_` `FSTX_BUILD_VERSION_` | no reservation primitives → `12_`/`22_` throw on an undefined function |
| `12_` `SHIPMENT_BUILD_VERSION_` | **returns SUCCESS** while creating drafts that reserve nothing |
| `22_` `CSD_BUILD_VERSION_` | **returns SUCCESS** using its old inline implementation, never releasing a reservation → available stock drifts permanently downward, and the only symptom is shipments refused for stock that is physically present |
| `11_` `SP_BUILD_VERSION_` (moved) | approves, fails to create the shipment, reports plain success |

The `12_` and `22_` cases are the dangerous ones **precisely because they succeed.** Only a declared build can
distinguish them from a healthy deployment.

An **unanswered** contract probe is `null`, which is deliberately not `false`: a slow probe must never disable a
working page.

---

## 10. What the sweep needed, and why

Nine suites failed after this round. Every one was the same underlying mistake — an assertion pinning the state
of a *later* round's world — and every one is restated to say what it meant, never weakened:

- **Five** pinned `11_`'s stamp literal to mean *"my round did not change the Submit owner"*. True when written;
  false the moment any later round legitimately changes it. Restated the way this repository already restated
  the identical assertion for `16_` in FB-4F-B3: **`11_` declares exactly the build its deployment manifest
  expects** — read from `63_`, so the pair can only ever be edited together. A stamp nobody expects and an
  expectation no file declares are the two halves of a partial sync, and either alone is the bug. Each round's
  own behavioural claim (the grouping key carries no `allocation_draft_id`) is kept beside it, stated directly.
- **Two** asserted that *nothing* writes `fac_reserved_stock` — a true statement about the whole pre-FC-1A
  system, and the reason two sites could plan the same units. Scoped to the paths those suites are about: the
  **import** still never writes it; the **PO receipt** passes no `reservedDelta`.
- **One** pinned the retry adapter's `= async function` shape. It moved to the command runner, which performs
  **no** whole-DB reload at all — stricter than the seam. A fifth writer category; the 47-method accounting is
  unchanged.
- **One** needed `12_` added to a handler-probe source list, which that list's own comment warns about.
- Plus `SYS_REQUIRED_ACTION_LIST_VERSION_ === 10` → **at-or-after 10**, and A3's *"A3 is the newest stamp"* →
  registered-and-at-or-after, with a new check that no asset is still pinned to the superseded token.

**Result: 404 suites, 400 pass, 4 fail — the four long-standing failures, 0 new.** FC-1A suite 329/0 with
**18/18 mutations caught**. FC-0A audit updated to the post-FC-1A truth: 234/0, 11/11.

---

## 11. Still open

| # | decision |
|---|---|
| 1 | **The two new movement types.** Additive, no migration, no validator — but the vocabulary FC-0A recorded as closed at five is now seven. Acknowledge or rename. |
| 2 | **No cancellation trigger.** The release authority is complete and proved. Connecting it needs a shipment-cancellation action, which does not exist. Same class as S6b was. |
| 3 | **`S7b` `getShippingMethodCandidates`** — still routed with no caller (the carrier batch). |
| 4 | **`S8b` `finalizeShipmentFinalOutput`, `P10b` `document.list`** — REQUIRED actions, still unconnected. |
| 5 | **Over-receipt is a clamp, not a refusal.** Frozen behaviour, unchanged this round. Confirm that is intended. |

## 12. Controlled production acceptance

Reservation is live from the moment `12_` and `21_` are synced. **Pre-existing shipments hold nothing**, which
is safe: they dispatch normally and release nothing (proved). The one-way step is that new Shipment Drafts begin
reserving, so availability starts reflecting commitments.

1. Sync in dependency order: **`21_` → `12_` → `22_` → `11_` → `63_`**, then publish ONE new deployment version.
2. Push the frontend (`index.html` + the two JS files). The cache token moved, so a stale page cannot linger.
3. Paste + run `TEMP_FC1A_COMPACT_READINESS_CENSUS()`, read `approved_plans_without_shipment` and
   `reserved_balance_vs_ledger`, then **remove the file**. Expect `RECONCILED` with a zero ledger on first run.
4. Retry ONE approved-plan-without-shipment from the plan card. Expect `CREATED` + a reservation, or a typed
   `INSUFFICIENT_FACTORY_STOCK` naming the shortfall.
5. Confirm ONE shipment. Expect current down, reserved to zero, one `shipment_out` carrying both pairs.
