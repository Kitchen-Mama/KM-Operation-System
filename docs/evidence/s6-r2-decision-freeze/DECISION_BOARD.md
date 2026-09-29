# S6-R2 — shipping / inventory business decision freeze

**Base** `9c11eac` · decision + spec round · `BEHAVIOR_CHANGED = NO` · `PRODUCTION_ROWS_WRITTEN = 0`

Suite: `assets/tests/s6-r2-decision-board.test.js` — 46 passed / 0 failed.
Contract owner: `docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md` Part II.

```
PRE_SHA = 9c11eac   HEAD = 9c11eac   branch = feature/product-strategy-board-p0
origin/main = origin/feature = 2b82288        WORKTREE_CLEAN_AT_START = YES
S3_FINAL_SEAL = YES   S4_FINAL_SEAL = YES   S5_READY_FOR_INTEGRATION = YES
S6_CONTRACT_AUDIT_COMPLETE = YES              S5_DEPLOYMENT = HOLD   S6_DEPLOYMENT = HOLD
```

---

## The correction this round owes to S6-R1

S6-R1 recorded `D-S6-1` as *"an overseas-origin shipment reserves nothing, because `wh_reserved_stock` has no
writer"* and classified it **OPEN, not new**. Both halves were too mild.

Auditing the actual path for this round — which §2 required, and which R1 did not do — the finding is not that
an overseas-origin shipment ships without a reservation. **It is that an overseas-origin shipment cannot be
created at all**, and the plan that asked for it can never be closed. R1's phrasing implied a missing safeguard
on a working flow. It is a blocked flow.

Four facts compose, each pinned by the suite:

```
1  inventory-compat buildCandidates:  an Active overseas 3PL is a CANONICAL Ship From candidate
                                      ("3PL Overseas: same company + country-compatible → both From and To")
2  createShipmentFromApprovedPlan_:   checks sufficiency with factoryStockReadBalanceTx_(…, srcWarehouseId, …)
                                      and contains NO is_factory_warehouse branch
3  factoryStockReadBalanceTx_:        a missing row returns { found:false, available:0 } — and an overseas
                                      warehouse HAS no factory_stock row, by design (§6.0 separate domains)
4  therefore                          available 0 < need → INSUFFICIENT_FACTORY_STOCK, zero rows written
```

And the guard upstream does not catch it — it *invites the operator through it*. Executed against KMFSG with a
1000-unit factory pool and a 500-unit overseas-source plan:

```
verdict        FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED
overage_pools  1        pool_row_found  false        overage_qty  500
overridable    true
```

So the operator is asked to confirm a 500-unit **factory stock** overage against a 3PL warehouse that has no
factory stock because it is not a factory — confirms it, because that is the only way forward — and then hits
`INSUFFICIENT_FACTORY_STOCK` at the Execution Commit. The message names factory stock at a warehouse that will
never have any.

**And the plan is then stuck**, which is the second finding.

---

## The second finding: an approved plan with no shipment has no exit

Not previously recorded anywhere, and proven this round:

```
VALID_TRANSITIONS = ['submit', 'approve', 'reject', 'cancel']    — none starts from `approved`
cancel   refused unless status is draft | pending_approval
reject   refused unless status is pending_approval
Done     refused unless status is approved AND a shipment exists ("Execution Commit required before Done")
```

An `approved` plan whose Shipment Draft cannot be created therefore cannot be cancelled, cannot be returned to
draft, and cannot be completed. It has **no terminal state**.

That is not merely untidy. `approved` is in `PLAN_EXPOSURE_STATUSES` and the plan is never transferred, so it
**permanently subtracts its full quantity from `available_to_allocate`** for that pool:

```
approved, never transferred, 300 units  →  planExposure.byPool[WH-F||S].qty = 300, forever
```

A stuck plan is a ghost reservation by another name — held at the Decision Layer instead of on
`fac_reserved_stock`, and with no release event of any kind. §10 requires
`CANCEL_MUST_NOT_LEAVE_GHOST_RESERVATION = YES`; cancellation honours that, but this state is reached *without*
a cancellation and honours nothing.

Reachability differs by cause, and that matters for urgency:

| cause | self-heals? |
|---|---|
| overseas source | **never** — no amount of factory stock will ever satisfy an overseas warehouse |
| factory genuinely short | yes — Retry succeeds once stock arrives or a competing shipment releases |

The first is a permanent trap. The second is the recovery path FC-1A designed, working as intended.

---

## Decision board

Seven decisions. Six carried from S6-R1, one new and proven above. Every other question §2–§13 asked is
answered by live code and is listed under **Already frozen** instead.

### D-S6-A · Formally supersede B-1's reserve trigger

**Question.** Should Shipment Draft creation become the canonical factory-stock reserve trigger, replacing
B-1's Ready to Ship?
**Current behavior.** Reservation is acquired at Shipment Draft creation and has been live in production since
F1-7N-FC-1A. Two canonical documents still say Ready to Ship; both now carry a superseding marker.
**Why it matters.** Until B-1 is formally superseded, a later round can cite a frozen decision to move working,
deployed behaviour backwards.
**A.** Supersede B-1; Shipment Draft creation is canonical. · **B.** Keep B-1 and move the code back.
**Example.** 1000 on hand, two sites each want 800. Under A the second Shipment Draft is refused at creation.
Under B both drafts are created and the collision surfaces at Confirm Shipment, after documents are prepared.
**Recommendation: A.** The trigger moved for a measured reason.
**Business:** collisions surface when the claim is made. **System:** A is a doc change; B is a behaviour change
to deployed code. **Phase 2:** none.

### D-S6-B · Overseas-origin shipping (supersedes R1's D-S6-1)

> **⚠ RECOMMENDATION SUPERSEDED — S6-R2A.** The operator chose **option A**: overseas is a first-class
> Phase-1 shipping source, and the double-allocation protection must be BUILT rather than sidestepped. The
> recommendation below (option D — remove overseas from the Ship From picker for Phase 1) is **not** the
> decision. Read it as the argument that was considered and rejected, never as current advice.
> Frozen: `OVERSEAS_ORIGIN_SUPPORTED_PHASE1 = YES`, `OVERSEAS_RESERVATION_REQUIRED = YES`,
> `OVERSEAS_DOUBLE_ALLOCATION_ALLOWED = NO`. See the S6 contract Part III §18 / §20.

**Question.** Overseas-origin Shipment Drafts are refused today against factory stock they can never have —
should Phase 1 unblock them, and with what reservation model?
**Current behavior.** Blocked, as proven above; the plan is then permanently stuck.
**Why it matters.** The Ship From picker offers overseas 3PL sources as a canonical option, so this is
reachable through the supported UI, and every attempt leaves an unclosable plan holding phantom exposure.

**A. Reserve overseas stock at Shipment Draft creation** (mirror the factory model on
`overseas_inventory_snapshot.wh_reserved_stock`, with `overseas_inventory_movements` as the ledger — the
columns and the from/to stock-type model already exist and are unused).
 · double-allocation: closed · UX: identical to factory, familiar · cancel: symmetrical release
 · write complexity: **high** — a second reservation domain, its own availability term, its own guard path
 · consistency: the two domains stay separate, as §6.0 requires, but the *pattern* is shared.

**B. Reserve at a later submit/confirm boundary.**
 · double-allocation: **open between draft and confirm** — the window this whole mechanism exists to close
 · UX: collision surfaces late, after documents · complexity: medium · **not recommended**: it is the pre-FC-1A
 model the system deliberately left.

**C. No overseas reservation; validate availability again at dispatch.**
 · double-allocation: open throughout · UX: worst — failure at the last step
 · complexity: **low** · consistency: honest about doing nothing.

**D. Refuse an overseas source explicitly, at the picker and at Submit** — remove overseas 3PL from the *From*
candidate set for Phase 1 and refuse it server-side with a named reason.
 · double-allocation: n/a — the flow does not exist · UX: **the option disappears instead of failing three
 steps later** · complexity: **lowest** · consistency: matches what the system can actually do today.

**Example.** A US 3PL holds 500 units that ResUS wants moved to an Amazon FC. Today: the operator picks it as
Ship From, submits, is asked to confirm a 500-unit *factory* overage, confirms, approves — and the Shipment
Draft is refused. Under D the warehouse is simply not offered as a source, with a reason. Under A it works.

**Recommendation: D for Phase 1, A for Phase 2.** D is the honest description of a system whose overseas
outbound lifecycle is specified and unimplemented, and it converts a three-step trap into a clear refusal at
the first step. A is the right destination, but it is a new reservation domain — a slice, not a decision — and
building it inside S6 would widen this series well past a closing seal.
**Business:** D removes a capability nobody can currently use. **System:** D is a picker filter plus a server
refusal. **Phase 2:** A becomes the Overseas Outbound Lock lifecycle already specified.

### D-S6-C · The approved-plan dead end (new)

**Question.** What is the exit for an approved plan whose Shipment Draft cannot be created?
**Current behavior.** There is none: no cancel, no reject, no Done — and it holds pool exposure forever.
**Why it matters.** Availability silently shrinks by the stuck quantity, permanently, with no surface that
explains why.
**A.** Allow `cancel` from `approved` **when no shipment exists** (the condition is already derived for the
Retry banner — `APPROVED_SHIPMENT_CREATION_PENDING`). · **B.** Allow `approved → draft` return so the plan can
be edited and resubmitted. · **C.** Leave it; rely on D-S6-B removing the only permanent cause.
**Example.** An approved plan for 300 whose source warehouse was wrong. Today it holds 300 units of exposure
forever and the operator's only lever is a Retry that always fails.
**Recommendation: A.** It is the smallest change that gives the state a terminal, it reuses a condition the
system already computes, and it cannot touch a plan that has a shipment. B is a bigger lifecycle change and
re-opens the question of what an approved-then-edited plan means. C leaves the factory-short case with a
permanent trap whenever stock never arrives.
**Business:** a mistaken approval becomes correctable. **System:** one extra allowed from-status, guarded on
"no shipment exists". **Phase 2:** none.

### D-S6-D · Movement vocabulary, and the type on neither axis

**Question.** Accept the factory movement vocabulary at seven, and fix `shipment_receipt` being declared in the
factory list while only ever written to the overseas ledger?
**Current behavior.** FC-1A grew the closed five to seven and asked for acknowledgement; never recorded.
`shipment_receipt` is in `FSTX_MOVEMENT_TYPES_` but in neither `FSTX_CURRENT_AXIS_TYPES_` nor
`FSTX_RESERVED_AXIS_TYPES_`, and 31_ writes it onto `overseas_inventory_movements`.
**A.** Accept seven; drop `shipment_receipt` from the factory list. · **B.** Accept seven as-is.
**Recommendation: A**, in R3 — a constant and a document, no write.

### D-S6-E · PO over-receipt: clamp or refuse

> **⚠ PREMISE WRONG, AND THE RECOMMENDATION WITH IT — corrected in S6-R2A.** The "current behavior"
> stated below is stale. `FC-1A-R1 §K` had already replaced the silent clamp with a typed
> `PO_RECEIPT_EXCEEDS_REMAINING_QTY` refusal carrying `attempted` / `remaining` / `excess`, evaluated
> before any inventory mutation, with tolerance deliberately unimplemented. I cited `FC-1A §H.4` without
> re-reading the code, across two rounds. The operator froze **option B** (refuse) — which deployed code
> already does, so the decision needs no implementation. `PO_OVER_RECEIPT_SILENT_CLAMP = NO`.

**Question.** Keep the frozen clamp, or refuse an over-receipt?
**Current behavior.** Receiving 900 against 500 ordered receives 500 and stops (`if (recv > maxRecv) recv = maxRecv`).
**A.** Keep the clamp. · **B.** Refuse and make the operator correct the number.
**Example.** 500 ordered, 900 keyed by mistake → 500 received, 400 silently discarded.
**Recommendation: A.** No phantom stock is created either way and a clamp never blocks a warehouse; B trades a
silent truncation for a stopped receipt, which is worse at the dock.

### D-S6-F · `factory_stock_allocation_plans` — two columns, one meaning

**Question.** `warehouse_id` or `source_factory_warehouse_id` as the source-factory identity?
**Current behavior.** Both exist; the DB map names `warehouse_id` current and defers the other.
**A.** Deprecate `source_factory_warehouse_id` (read-fallback only). · **B.** Migrate onto it.
**Recommendation: A**, recorded in R3, no migration.

### D-S6-G · Scope of S6 production write validation

**Question.** Does S6 need its own write smoke, or does it join S5's deferred gate?
**Current behavior.** Rollback is structurally non-deterministic on both mainlines: every delete in the
shipping surface is a same-call rollback or draft regeneration, and no path deletes a committed shipment,
plan or line after its call closes.
**A.** Fold S6 into the post-S7 gate with S5. · **B.** Build a disposable scope first.
**Recommendation: A.** Same blocker, and two half-gates are worse than one.

---

## Already frozen (17)

Recorded so nobody re-decides them. Each is pinned by the suite section named.

```
§C   FACTORY_RESERVATION_TIMING = Shipment Draft creation; no plan transition reserves or releases
§C   OVERSEAS_RESERVATION_TIMING = NONE — no overseas movement addresses the reserved bucket
§D   approved_qty is editable ONLY while the plan is Draft
§D   shipment_qty = approved_qty verbatim, and immutable after creation (absent from SHIPMENT_EDITABLE_FIELDS_)
§D   one Shipment Draft per approved plan — Plan→Shipment 0..1, no execution split
§D   RECEIPT may be partial, reconciled exactly-once through the movement ledger
§D   source_warehouse_id is a plan grouping dimension — two sources are two plans, never one split plan
§E   SOURCE_SELECTION_AUTHORITY = operator; AUTOMATIC_SOURCE_PRIORITY_EXISTS = NO
§E   marketplaces.allocation_priority is a RECEIVER priority, never a source-domain priority
§F   carrier authority is three layers: AI Plan proposes method · Weekly Plan picks carrier · Submit may refuse
§F   the shipment resolves an EXACT rate card and NEVER silently switches carrier (RATE REVIEW instead)
§G   DESTINATION_AVAILABILITY_EVENT = warehouse receipt; `delivered` posts no inventory
§G   a factory destination is never credited with overseas stock
§H   ROUTE_FREEZE_EVENT = Confirm Shipment & Dispatch; the snapshot is never re-taken
§H   POST_DISPATCH_ROUTE_EDIT = forward advance only; backward refused, no leg added or removed
§I   WEEKLY_PLAN_AUTHORITY = approves quantities AND triggers the Execution Commit on approval
§I   the four boundary NOs (PO / Request Order / recommendation / shipment) all hold
```

`ALREADY_FROZEN_COUNT = 17`

---

## Phase-1 filter

Every decision above was tested against §14. None requires production lead-time orchestration, ordering
lead-time back-propagation, ETA-driven Request Order creation, automatic replenishment from a shipping
shortage, or cross-mainline scheduling. D-S6-B's option A is explicitly pushed to Phase 2 for that reason.

```
PHASE2_DECISION_COUNT_IMPLEMENTED_NOW = 0
```

---

## Results

```
FOCUSED   s6-r2-decision-board   46 passed / 0 failed
MUTATION  N/A — no executable enforcement code was added (§18)
FILES_CHANGED  1 new test      SPECS_CHANGED  1 new evidence doc + Part II of the S6 contract
BEHAVIOR_CHANGED NO · DB_MIGRATION_REQUIRED NO · APPS_SCRIPT_SYNC_REQUIRED NO · FRONTEND_DEPLOY_REQUIRED NO
```

## Sweep

```
565 passed / 570   canonical 5   19 lines   DIRTY 0   WORKTREE_CLEAN_AT_END = YES
570 rather than 569 because this round adds one suite. It contributed zero fail lines.
CANONICAL_FAILURE_SET_CHANGED = NO — diff-clean against the R8 artifact, line for line
CANONICAL_DIGEST = ebcf7bc1651e792f7dbab73544cfa2593f91664a9ed399a04f9a5ba9c9bc4f92
```

**The digest reproduced, which is the first time in this series it has meant anything.** S6-R1 had to
re-baseline it because the runner that produced S5-R8's `596eeb64…` was session-local and its formula was not
recoverable; the input and the formula were committed as `CANONICAL_FAILURE_SET.txt` so the next round could
compare numbers rather than only sets. This is that next round, and the number came back identical — so from
here a moved digest is evidence of a moved failure set rather than evidence of a different script.
