# F1-7N-FC-1A-R1 — Reservation Release · Shipment Cancellation · Movement Vocabulary · PO Over-Receipt

**PRE** `d94d5bd` · **Branch** `main` · FC-1A + R1 are **ONE atomic release**.
**Constraints honoured:** NO live Submit / Approval / Shipment creation / cancellation / dispatch / PO receipt /
stock write / DB repair / migration / push / deploy.

---

## 0. ⚠ Precondition divergence, reported before any edit

`origin/main` was expected at `c7f2813`. **It is `d94d5bd`** — FC-1A has already been pushed, **alone**.

That is exactly the hazard §0 names: origin now carries reservation *acquisition* with no routed way to
release one. HEAD is exactly `d94d5bd` as §B.2 requires and all three ancestors are present, so the baseline is
correct and nothing is compromised. The divergence **raises the urgency** of this round rather than blocking
it, which is why I reported it and proceeded rather than stopping with nothing delivered.

---

## 1. §C — The cancellation authority audit

Four cancellation-shaped authorities exist. None could do this job, and the fourth was worse than missing.

| authority | entity | allowed from | reservation effect | verdict |
|---|---|---|---|---|
| `updateShippingPlanStatus` `transition='cancel'` | shipping **plan** | `draft` \| `pending_approval` | none | **cannot reach an approved plan** — the only kind that has a draft |
| `cancelShippingAllocationDraft` (16_) | Execution Plan allocation draft | draft | none | different entity |
| `cancelRequestOrderTier` (13_) | request order tier | — | none | purchase mainline |
| `updateShipment { status }` | shipment | **anything** | **none** | ⚠ see below |
| **`cancelShipmentDraft`** (new, 12_) | Shipment Draft | `draft` \| `ready_to_ship` | **releases, atomically** | added |

### ⚠ The finding that mattered: `updateShipment` had no status allowlist

It wrote whatever string arrived. So `status:'cancelled'` would have been **persisted straight through with
zero reservation release** — units held by a shipment nobody can dispatch, availability permanently reduced for
stock that is physically on the floor, no error and no evidence except a ledger nobody was reading.

That is not a missing feature. It is a **reachable** path, and it is now closed: cancellation is refused *by
name* (pointing at the action that does it properly), and an unrecognised status is refused too — a shipment
sitting in an unknown status is invisible to every page that filters by the known set.

Exactly **one** action was added. No duplicate of an existing authority.

---

## 2. §D — `cancelShipmentDraft`, measured

`Shipment Draft card → shCancelShipmentDraft → KM.DB.cancelShipmentDraft (command runner) → router →
handleCancelShipmentDraft_ → factoryStockReleaseReservationTx_ (21_)`

**Cancelling returns a claim, not physical units** — that is the one thing separating it from a dispatch:

| | before | after |
|---|---|---|
| `fac_current_stock` | 1000 | **1000, unchanged** |
| `fac_reserved_stock` | 800 | **0** |
| movements | 1 acquire | + **one** `reservation_release`, qty −800, both pairs recorded, reason on the row |
| shipment | `ready_to_ship` | `cancelled` + who/when/why |
| plan | approved, `transferred_shipment_id=SHP-1` | **approved**, handoff **cleared** |
| replay | — | **REUSED, zero cells** |

### The plan-handoff clear is not cosmetic

While `transferred_shipment_id` still pointed at the cancelled draft, both the server's recovery derivation and
the plan card read `SHIPMENT_PRESENT` — so the operator would see a healthy approved plan with no shipment and
no Retry. **That is the exact silence FC-1A was written to end, reintroduced by the cancellation.** Cleared, the
parent derives `APPROVED_SHIPMENT_CREATION_PENDING` again and Retry creates a *new* draft with a *new*
reservation, correctly attributed in the ledger.

### The state matrix

| from | cancel | code |
|---|---|---|
| `draft`, `ready_to_ship` | ✅ | `CANCELLED` |
| already `cancelled` | ✅ no-op | `REUSED`, zero writes |
| `shipped` … `closed` | ❌ | `SHIPMENT_ALREADY_DISPATCHED` |
| **any** status with a `shipment_out` / route / event | ❌ | `SHIPMENT_ALREADY_DISPATCHED` |
| `stuck` or unrecognised | ❌ fail-closed | `SHIPMENT_STATUS_NOT_CANCELLABLE` |
| stale `expected_status` | ❌ | `SHIPMENT_STATUS_CHANGED` |
| lock unavailable | ❌ | `LOCK_UNAVAILABLE` |

Guarding on **physical evidence as well as status** matters: an interrupted Confirm can leave either one first.
A shipment whose status still reads `ready_to_ship` but which carries a `shipment_out` row is refused.

Every refusal writes **nothing**. A failure mid-transaction rolls back the release, the status and the handoff
together — proved with a two-SKU fixture where the second release throws after the first has written.

Release is **owner-scoped**: SHP-1 cancelling releases its own 800 and leaves SHP-2's 200 untouched.

---

## 3. §G — One movement vocabulary owner, and the axis each type moves

Seven types, defined once in `21_`, with the question that was previously answerable only by knowing the list
by heart now answered by two predicates:

| type | axis |
|---|---|
| `inventory_import`, `manual_adjustment`, `po_receipt` | current |
| `shipment_out` | current **and** reserved (on its own row) |
| `shipment_receipt` | neither (overseas table) |
| `reservation_acquire`, `reservation_release` | **reserved** |

A reservation is **not** on the current axis. That is what stops 800 reserved units being reported as 800 units
of physical movement that never happened. An unknown type is **reported, never silently dropped**.

Anything in the repository still claiming the vocabulary is closed at five is now a test failure.

---

## 4. §H — Reconciliation, and the arithmetic I got backwards

```
derived = Σ acquire.qty  +  Σ release.qty  −  Σ (shipment_out reserved drop)
```

I first wrote it to **exclude** the third term, reasoning that a dispatch releases its own hold and counting it
again would double-count. **That inverted the actual risk.** A dispatch writes no separate `reservation_release`,
so its reserved drop is the *only* record of the release. Measured on a healthy world — acquire 800, dispatch
800, a second shipment holding 300 — it reported stored 300 against derived 1100: a
`FACTORY_RESERVATION_LEDGER_MISMATCH` on a perfectly correct ledger. **Every dispatched shipment in production
would have raised one**, which is precisely the noise that teaches an operator to stop reading the report.

§H.1's rule is *never count a shipment_out twice as both a release row and an implicit release*. What satisfies
it is not exclusion; it is that **a dispatch never writes a separate release row for the same units**. The drop
is subtracted exactly once, and reported separately as `consumed_by_shipment_out`.

It never auto-repairs — there is nothing in it that could. A mismatch returns both numbers and the difference,
**never rounded into agreement**. Orphan cases (a reservation against a non-existent stock row) are surfaced.

`TEMP_FC1AR1_RESERVATION_RECONCILIATION()` contains **no arithmetic of its own** — it calls the canonical
function. A diagnostic with a private copy of the rule is a second opinion, and when the two disagree nobody
can adjudicate. Bounded: worst case under 50 KB.

---

## 5. ⚠ A second real bug: a cancelled shipment could still be dispatched

`22_`'s already-confirmed guard lists the post-dispatch statuses, and `cancelled` is correctly absent — a
cancellation is not a confirmation. So Confirm & Dispatch on a cancelled draft **fell through every guard and
deducted factory stock**, for a shipment whose reservation had already been released and whose units another
site may already have claimed. Measured: current went 1000 → 200 with a matching `shipment_out`.

It is now a **refusal** (`SHIPMENT_CANCELLED`), not an idempotent no-op: answering "already confirmed" for a
cancelled shipment would tell the operator it shipped.

---

## 6. §K — PO over-receipt: the clamp is gone

`if (recv > maxRecv) recv = maxRecv;` → typed `PO_RECEIPT_EXCEEDS_REMAINING_QTY` carrying **attempted 900,
remaining 500, excess 400**, with zero writes to stock, movements or the PO line.

The clamp never created phantom stock, which is why it survived review. **Silence was the harm:** an operator
typing 900 against a remaining 500 got a *success* reporting a receipt, and nothing anywhere said that 400 units
they believe they received were not recorded. The physical count then disagrees with the system, and a miscount
and a typo are indistinguishable — they need different people.

`remaining_qty = MAX(0, completed − shipped)` is unchanged. **No tolerance or override was invented** — that
stays an explicit future decision, because inventing one silently is how the clamp happened.

---

## 7. §E — Whole-plan cancellation: STOPPED and reported

An **approved** plan cannot be cancelled at all (`draft | pending_approval` only), so "cancel an approved plan
with an active pre-dispatch draft" is **unreachable**. §E's own instruction for this case is to stop the branch
and report rather than invent a plan lifecycle, so **no approved-plan cancellation was added**, and a test now
fails if one appears without a decision.

The reachable equivalent is per-shipment cancellation, which R1 provides: it frees the units and **keeps the
approval standing**, which is the frozen §0 behaviour.

---

## 8. §L — Contract versions, and the two owners that lie by succeeding

`SYS_DEPLOYED_ACTION_CONTRACT_VERSION_` **10 → 11**. The rule fires here for real: a deployment at 10 routes
everything else normally but **cannot route `cancelShipmentDraft`**, so it can acquire reservations and never
release one. The frontend pin moves to 11 in the same commit, so that deployment is refused **by version** at
the browser's first contract check rather than discovered when an operator presses Cancel.

`SYS_REQUIRED_ACTION_LIST_VERSION_` 11 → 12. `SYS_TRANSPORT_CONTRACT_VERSION_` unchanged — the envelope shape
did not move, and those are two independent axes.

Owner stamps at `F1-7N-FC-1A-R1`: `01_`, `12_`, `13_`, `21_`. Each one answers every action normally when a
round behind:

| behind | symptom |
|---|---|
| `01_` | cannot route the cancel; everything else works |
| `12_` | **returns success** — cannot cancel; lets `status:'cancelled'` through with no release |
| `13_` | **returns success** — silently clamps an over-receipt |
| `21_` | no vocabulary owner, no reconciliation; the cancel throws |

---

## 9. What the sweep needed

22 new failures. **Twenty were one mistake made twenty times:** an assertion pinning the *current* value of a
shared version constant to express "my round did not move it". True when written; false the moment any later
round legitimately moves it — which is what `SYS_DEPLOYED_ACTION_CONTRACT_VERSION_` exists to signal.

Each keeps its real property and drops only the equality-with-now: **the deployment and the client pin AGREE,
and both are at or after what that round required.** Router stamps became manifest-*derived* — the file declares
exactly what `63_` expects — because a stamp nobody expects and an expectation no file declares are the two
halves of a partial sync, and either alone is the bug.

Two were substantive:

- `live-inventory-…r4b-r3` ranked an out-of-family stamp as **−1, i.e. the oldest possible**, so a router
  correctly declaring `F1-7N-FC-1A-R1` read as "advertises a pre-change stamp". Now deferred to the manifest
  pairing when the stamp is outside the FB-4E list it ranks against.
- `shipment-draft-expand…` pinned `SH_DRAFT_STATUSES` as an exact array, so **adding** `cancelled` looked like
  **removing** `shipped`. Restated as the set membership it cares about.

Two were the FC suites recording findings R1 closed — both **inverted** to hold the closure in place.

**Result: 405 suites, 401 pass, 4 fail — the four long-standing failures, 0 new.**
R1 **310/0, 20/20 mutations**. FC-1A 333/0, 18/18. FC-0A 234/0, 11/11. Bundle `--check` PASS, hash unchanged.

### A tooling note worth keeping

A leftover `token.py` from a much earlier session sat in the shared scratchpad, **shadowing the stdlib `token`
module** and self-executing on import — it hijacked a patch run with output from a different round. It exits on
its first anchor and wrote nothing (verified against `git status`), but every patch script since runs under
`python -P`, and the file is renamed `.bak`.

---

## 10. Release — FC-1A and R1 are ONE release

`origin/main` already carries FC-1A alone. **Deploy R1 with it, or neither.**

**Apps Script sync order** (dependency order; then **one** new deployment version):

```
21_  →  12_  →  22_  →  13_  →  11_  →  01_  →  63_
```

`21_` first (it owns the primitives everything else calls); `63_` last (it is the manifest that judges the rest).

**Frontend:** `index.html`, `operation-system-db-api.js`, `shipping-plan.js`, `shipping-history.js`.
~~Cache token stays `fc1a-shipmentrecovery-20260903` — **deliberately**. R1 mints no token of its own: a second
one would let the two halves be cached, shipped and reasoned about separately, which is what the atomic-release
decision forbids.~~ The **action-contract version** is what refuses a half-synced deployment.

> **CORRECTED BY F1-7N-FC-1A-R1-HF1.** The struck-through paragraph is wrong. Its premise holds — FC-1A and
> R1 are one release — but atomicity and cache identity are different axes with different enforcement, and
> the sentence that follows it here says so: the action-contract version (10 -> 11) is what refuses a half-synced
> deployment. A token buys exactly one thing, a refetch, and reusing a **published** token buys none of it.
> FC-1A was pushed as `d94d5bd`, so browsers already held `?v=fc1a-shipmentrecovery-20260903`; reusing it would
> have served them the FC-1A `shipping-history.js` — the Shipment Draft card **without** a Cancel button
> — against a server that routes `cancelShipmentDraft`, leaving the reservation held with no reachable way
> to release it. Worse, `shipping-plan.js` carries the entire recovery feature and FC-1A never rotated it at all:
> it was still served at `donenotice-20260811`, dated 2026-08-11. The application set now moves together onto
> **`fc1ar1-cancelrelease-20260903`** (19 references), and `22_`'s build stamp — which R1 changed and did
> not move — now reads `F1-7N-FC-1A-R1` so the module manifest can detect a 22_ left behind.

`DATABASE_MIGRATION: NO` · `BUNDLE_REBUILD: NO`.

### Controlled acceptance

1. Sync in the order above, publish **one** version, push the frontend.
2. Hard-reload. A deployment below action contract 11 now refuses **by version** with the message naming the fix.
3. Paste + run `TEMP_FC1AR1_RESERVATION_RECONCILIATION()`. Expect `RECONCILED`. **Then remove the file.**
4. Cancel **one** pre-dispatch draft. Expect current unchanged, reserved down by exactly the held quantity, one
   `reservation_release`, the plan still approved with Retry available.
5. Retry that plan. Expect `CREATED` and a **new** shipment id.
6. Attempt an over-receipt. Expect `PO_RECEIPT_EXCEEDS_REMAINING_QTY` with all three quantities and zero writes.
7. Re-run the reconciliation. Expect `RECONCILED`.

**Safe to delete after running:** `TEMP_FC1AR1_RESERVATION_RECONCILIATION.gs`,
`TEMP_FC1A_COMPACT_READINESS_CENSUS.gs`.

---

## 11. Next batch — S7b / S8b (carrier and documents)

1. **`S7b` `getShippingMethodCandidates`** — routed, handled, adapter-wrapped, no caller. Connect it to the
   Execution Plan method picker, which currently has no candidate list to offer.
2. **`S8b` `finalizeShipmentFinalOutput`** — a REQUIRED action with **no adapter at all**. Either connect it to
   the post-dispatch document flow or remove it from `SYS_REQUIRED_ACTIONS_`; today every deployment is judged
   incomplete for something nothing calls.
3. **`P10b` `document.list`** — REQUIRED and superseded by the workspace `documents` include. Prove parity, then
   de-require.

## 12. Remaining STOP conditions

| # | condition |
|---|---|
| 1 | **Whole-plan cancellation does not exist.** Unreachable for an approved plan; needs a product decision, not an implementation. |
| 2 | **Over-receipt tolerance / override** is deliberately unimplemented. |
| 3 | **`S8b` / `P10b`** are REQUIRED actions with no caller — connect or de-require. |
| 4 | **No TW carrier rate cards** were added; `TW勝一 → Amazon` still has no eligible method. |
| 5 | **Shipment qty stays immutable.** The reservation matches the shipment only because of that; the day it becomes editable, the adjustment path must land in the same round. |
