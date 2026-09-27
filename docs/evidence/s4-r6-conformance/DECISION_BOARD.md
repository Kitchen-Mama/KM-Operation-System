# S4-R6 — Decision board

`DECISION_REQUIRED_COUNT = 2`. Neither is implemented. Both change what a page loads before the
operator has asked for anything, which §1-D reserves for the operator.

---

## A — Order Planning: the first SKU expand costs 8 requests

**PAGE** Order Planning / 下單系統

**QUESTION** The first row expanded on the page issues eight requests: seven bounded second-layer
tables (`fc_regular_forecast`, `fc_special_events`, `fc_target_rules`, `factory_stock`, `warehouses`,
`purchase_orders`, `purchase_order_lines`) plus one per-scope materialized gap read. Every later
expand in the same scope costs **zero**. Should that first expand still wait on the network?

**What §1A actually says, and what is and is not violated.** The rule forbids deferring a SKU's normal
second-level detail until the user clicks *that individual SKU*, and it requires
`PER_SKU_EXPAND_REQUEST_COUNT = 0`, `N_PLUS_ONE_EXPAND_PATTERN = FORBIDDEN` and
`SECOND_LEVEL_FIRST_EXPAND_BLOCKS_ON_NETWORK = NO`. Measured: the first two hold — the cost is
per-scope, bounded by the number of company/country/marketplace scopes on screen, never by rows. The
third does not: the first expand on the page, and the first expand in each new scope, shows a skeleton
while the network answers.

**Why this is not something to fix quietly.** The deferral is *sealed*.
`api-ai-plan-first-layer-composer-f1-7e-prereq5-r1` asserts that the second-layer expand surfaces
lazy-load their bounded tables on expand (F1-7L), and that seal exists because those seven tables were
what the retired whole-DB startup prime used to pay for. Undoing it re-adds seven tables to a read the
operator has not asked anything of yet.

| | OPTION A — keep as built | OPTION B — fold the seven into the workspace read | OPTION C — prefetch on Search |
|---|---|---|---|
| **UX** | first expand waits; every later one is instant | every expand instant | every expand instant; Search slower |
| **Freshness** | second-layer read is as fresh as the expand | as fresh as the page | as fresh as the Search |
| **Failure isolation** | a second-layer failure leaves the table intact | one failure can empty the whole page | a failure is attributable to Search |
| **Request cost** | 8 once per page + 1 per new scope | +7 on every page load, expanded or not | +7 on every Search |
| **Complexity** | none | breaks the F1-7L seal; changes first-load data | moderate; §13 forbids *speculative* prefetch, and whether a user-initiated Search counts is the operator's call |

**RECOMMENDED TECHNICAL DIRECTION — A, with a reservation.** Most Order Planning sessions expand at
least one row, so B would mostly be paying the seven reads at a moment when the operator is not
waiting for them — which is the honest argument *for* B. What decides it against B is failure
isolation: under `Promise.all` any one of the seven failing empties the page, whereas today it only
degrades the expanded panel. If the operator's priority is that the first expand never waits, **C** is
the better shape than B, because it keeps the failure attributable to an action the user took.

`OPERATOR_DECISION_REQUIRED = YES`

---

## B — Six pages tell the operator to press a Retry that is not there

**PAGE** Order Planning, Shipment Draft, Request Order Draft, Purchase Order Workspace, Purchase Order
Overview, SKU Details

**QUESTION** All six render a truthful read failure with the transport reason, the action and the
request id. None renders a Retry control, and several print "Press Retry. It issues exactly one new
request" beside no such button. The workspace and composer error paths lost the Retry their legacy
counterparts kept — Order Planning still has one in its *legacy* empty-state branch.

This is listed as a decision rather than repaired with the other five because it is not one defect: it
is six error surfaces on six pages, each needing its own safe single-read entry point, and three of
the six have no existing idempotent re-init function to call. Adding one per page is ordinary work,
but it is the kind of work that introduces a defect when it is done in the last hour of a long round.

**Why it is P2 and not a lie.** All six recover by leaving the route and returning — measured: each
re-reads on warm re-entry. The operator is told the truth and has a way out; what is missing is the
one-click way out the message promises.

| | OPTION A — add a Retry to each of the six | OPTION B — remove the "Press Retry" wording where no button exists |
|---|---|---|
| **UX** | consistent with the other twelve pages | honest, but the operator must re-navigate |
| **Freshness** | unchanged | unchanged |
| **Failure isolation** | unchanged | unchanged |
| **Request cost** | one read per press | unchanged |
| **Complexity** | six page-local entry points, three of which must be written | trivial |

**RECOMMENDED TECHNICAL DIRECTION — A**, as its own small round, with the same mutation coverage the
five repaired pages got. B is strictly worse for the operator and only cheaper for us.

`OPERATOR_DECISION_REQUIRED = YES`

---

## Carried forward, unchanged

- **S4-R5 §11** — the Inventory Replenishment internal split (AI Plan 62 KB + Import 16 KB of 941 KB).
  Recommendation was and remains **keep eager**; §1-B of this round's brief confirms it.
- **`fc-summary.js` (476 KB) and `request-order.js` (357 KB)** at boot. Route-owned by ownership;
  reachability from other pages not established. Not a decision yet — a measurement nobody has taken.
- The remaining S4-R1 deferred decisions, and
  `docs/evidence/s3-r13-fc-special-deferred/S3_FINAL_OPERATOR_CAPTURE.md`.
