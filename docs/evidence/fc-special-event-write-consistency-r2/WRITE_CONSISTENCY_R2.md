# FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R2

```
PRE_SHA = 66819d7 (descendant of the required 7b8bb81)   POST_SHA = see release commit
D_FC_WRITE_1_AUTHORITATIVE_RECEIPT = ACCEPT   (implemented)
D_FC_WRITE_2_REFERENTIAL_INTEGRITY = ACCEPT   (implemented)
D_FC_WRITE_3_SINGLE_ACTION_TRANSACTION = DEFER (not attempted — the save is still three stages)
PRODUCTION_ROWS_WRITTEN = 0   CURRENT_EU_BFCM_ROWS_MODIFIED = 0
```

R1 was an investigation. This round implements the two decisions the operator accepted, and it does so
without touching the three-stage shape — every stage stays independently retry-safe, and the honesty
moves into the receipt rather than into a rewrite.

---

## §1 — The receipt stops being a guess

```
SAVE_SUCCESS_AUTHORITY = POST_WRITE_AUTHORITATIVE_GRAPH_READBACK
FALSE_SUCCESS_REACHABLE = NO
TRANSACTIONAL_BOUNDARY_EXISTS = NO      PARTIAL_COMMIT_REACHABLE = YES (and now REPORTED as such)
```

The message R1 dissected is gone:

| WAS | NOW |
|---|---|
| `campaigns: 1` — a **literal** | the campaign is found in the readback, or it is not |
| `campaign_sku_lines: N` — `linePayloads.length`, the **client's own array** | the ids the readback found under this campaign |
| `fc_special_events: M` — the only server figure | events whose line the campaign actually holds |

**The two halves are read from different objects, deliberately.** `expected` is built from stage 2's
*receipt* — the server's line ids, which the payload never held — and `committed` comes only from the
graph. §3's rule that payload cardinality is never committed cardinality is enforced structurally: there
is no expression in which one could be mistaken for the other.

Success is gated. `Saved` is reachable only through `if (!v.verified) { … return; }`, and the modal does
not close until the graph verifies.

---

## §2 — The four outcomes are S3-R10's

```
CONFIRMED_COMMITTED    the graph verifies
partial graph          NOT success — named rows, form stays open, nothing resent
OUTCOME_UNKNOWN        the readback could not answer
CONFIRMED_REJECTED     unchanged; the existing per-row batch classifier still owns it
OUTCOME_UNKNOWN_AUTOREPLAY_COUNT = 0
```

No fifth vocabulary was introduced. An unreadable graph is **not** turned into a rejection, and the
unknown branch dispatches nothing — asserted by requiring that no write accessor appears within 400
characters of the unknown text.

---

## §3 — The graph readback

```
AUTHORITATIVE_READBACK_OWNER = 58_ `graph` slice -> _evtGraphReadback_ -> _evtVerifyGraph_
AUTHORITATIVE_READBACK_REQUEST_COUNT = 1   (per save, only after a write attempt)
FULL_TABLE_READ_COUNT_ADDED = 0            PER_SKU_REQUEST_COUNT = 0
HEALTHY_SAVE_NEW_REQUEST_COUNT = +1
```

`campaigns` and `campaign_sku_lines` join **`FCS_SLICE_ONLY_TABLES_`**, the set R3 created precisely so a
slice can read a sheet that `FULL` never touches. A healthy FC Summary open still reads four sheets. The
slice is scoped to one `campaign_id` and answers in canonical ids only; an empty scope selects **nothing**,
because a readback that answered for every campaign would verify a save against rows it never wrote.

The receipt structure §3 asks for:

```
EXPECTED_CAMPAIGN_COUNT / COMMITTED_CAMPAIGN_COUNT
EXPECTED_LINE_COUNT     / COMMITTED_LINE_COUNT
EXPECTED_EVENT_COUNT    / COMMITTED_EVENT_COUNT
MISSING_LINE_IDS   MISSING_EVENT_SKUS   ORPHAN_EVENT_IDS   IDENTITY_MISMATCH_IDS
```

Ids, not counts. A count says a save failed; an id says **which row**, which is the difference between a
message and a recovery.

---

## §4 / §5 — Referential integrity

```
EVENT_REFERENTIAL_INTEGRITY_ENFORCED = YES
DANGLING_EVENT_CREATE_REACHABLE = NO
```

`fcSpecialEventUpsert_` never read `campaign_sku_lines`. An event naming a line that does not exist was a
**legal write** — which is why the production incident looks like well-formed data. Before a CREATE it now
proves the line exists and belongs to the same campaign:

```
DANGLING_CAMPAIGN_SKU_LINE_REFERENCE   the line is not there
CAMPAIGN_SKU_LINE_CAMPAIGN_MISMATCH    it is there, under another campaign
CAMPAIGN_SKU_LINE_REGISTRY_UNREADABLE  it could not be read, so nothing was proved
```

All four forbidden repairs are absent by construction, and checked: the gate contains no `appendRow`,
`setValue` or `getRange`, so it cannot create the line; and no `.sku` reference, so it cannot search by SKU
and adopt a different one.

### The UPDATE rule, which is the load-bearing half

An UPDATE is gated **only when the reference changes**. That is not a softening — it is what keeps the
nine orphaned production events editable. Gating unchanged references would freeze exactly the rows that
are the evidence for the defect, and the operator would be unable to correct a quantity on any of them.
Both halves of §5 hold: an edit may not move a reference into an invalid graph, and may not be blocked by
one it did not create. Section D drives both.

---

## §6 — Stage-2 concurrency

```
CAMPAIGN_SKU_LINE_CONCURRENCY_PROTECTED = YES   DUPLICATE_LINE_CREATE_REACHABLE = NO
```

Stage 1 has taken a `ScriptLock` since R17 because *"two concurrent creates must not both read 'no match'
and both append."* Stage 2 ran the identical read-then-append with no lock. It now takes the same lock,
opened **before** the authoritative read and released in a `finally`.

**It is deliberately not R6's two-pass shape**, and the reason is a seal. R6 resolves unlocked and
re-resolves under the lock, which suits stage 1 because its defect was a zero-write path queueing behind
two or three whole-sheet reads. Stage 2 holds **exactly one** authoritative read, pinned by
`fc-special-stage2-large-batch-r1` at N up to 200 — a second resolve pass would be a second read on every
write. One read under the lock is both the smaller cost and the shorter hold. I built the two-pass version
first, measured it against that seal, and took it back out.

---

## §7 — Partial commit UX

```
A  verified          -> "Saved. Verified against the saved data: … Every event is linked to a SKU line
                        that exists under this campaign."
B  rejected          -> unchanged; the existing typed refusal path
C  partial graph     -> "PART of this save committed, and the saved data is INCOMPLETE."
                        campaign / lines / events each reported as committed-of-expected, the missing ids
                        and SKUs named, the form left open, and an explicit instruction to reload before
                        saving again so committed rows are not rewritten
D  unknown           -> "sent and the result could NOT be confirmed … Nothing was sent again."
```

No raw envelope is dumped at the operator, and the word *saved* appears in exactly one of the four.

---

## §8 — The EU BFCM incident: nine, not five

The operator's correction is carried everywhere:

```
CURRENT_INCIDENT_CLASSIFICATION = ORPHAN_FC_SPECIAL_EVENT (9) + MISSING_CAMPAIGN_SKU_LINE (9)
CURRENT_EU_BFCM_EXPECTED_LINE_COUNT = 9   MISSING = 9   ROWS_TO_RECONSTRUCT_PROPOSED = 9
HARDCODED_INCIDENT_ROW_COUNT = NO
RECOVERY_EXPECTED_LINE_COUNT_SOURCE = the authoritative current fc_special_events / campaign graph
```

`J1` asserts it rather than promising it: no literal row count is compared anywhere in the verifier, the
partial text, the reference gate or the projection. `J2` runs the real nine-row shape through the real
projection and comparison and derives nine orphans from the graph.

**Nothing in production was touched.** `CURRENT_EU_BFCM_ROWS_MODIFIED = 0`.

### The recovery, prepared and NOT executed

```
CURRENT_EU_BFCM_RECOVERY_READY = YES        RECOVERY_REQUIRES_OPERATOR_DISCOUNT = YES
```

See `RECOVERY_PROCEDURE.md` beside this file. Its two load-bearing facts:

* **The nine events are the only surviving copy of the nine `campaign_sku_line_id` values.** They must not
  be deleted, recreated, or repointed — the recovery reconstructs lines *under the ids the events already
  name*, and rewrites no event row.
* **`discount_percent` exists on the line and on no event** (`J4`), and neither does any other commercial
  value (`J4a`). It cannot be reconstructed from the graph, so the operator supplies it. That is a
  procedure, not a script, and saying otherwise would be inventing data.

---

## §10 / §12 — Timeout, retry, schema

```
RETRY_IDEMPOTENT = YES   (stage 2 converges on one row and id; stage 3 mints no second event)
NEW_TABLE_REQUIRED = NO  NEW_COLUMNS_REQUIRED = NONE  DB_MIGRATION_REQUIRED = NO
```

No timeout was raised and no blind retry added. Section F drives a committed-then-lost save and shows the
retry converging rather than accumulating, and a retry over partial state creating only what is missing.

---

## §11 — Performance

```
HEALTHY_SAVE_NEW_REQUEST_COUNT = 1      AUTHORITATIVE_READBACK_REQUEST_COUNT = 1
FULL_TABLE_READ_COUNT_ADDED = 0         PER_SKU_REQUEST_COUNT = 0
MODAL_OPEN_REQUEST_COUNT: unchanged     (R3's budget suites remain green — §13.19)
```

Stage 2's single authoritative read is re-measured in this round's own suite (`E4`), because the lock is
exactly the kind of change that would have cost a second one.

---

## §14 — Release

```
BACKEND_RELEASE = R32 (F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R32)
APPS_SCRIPT_SYNC_REQUIRED = YES
APPS_SCRIPT_SYNC_SET (owners, this release) = 14_ · 20_ · 58_ · 63_
  carried (unshipped, must also be copied)  = 47_ (R29) · 01_ (R25) · 73_ (R25) · 90_ (generated)
FRONTEND_DEPLOY_REQUIRED = YES
FRONTEND_DEPLOY_SET = assets/js/pages/fc-summary.js · assets/js/api/operation-system-db-api.js
TOKEN_ROTATION_REQUIRED_AT_DEPLOY = YES   (not rotated here)
```

**Copy order is backend first, and it matters in one direction.** A NEW frontend beside an OLD 58_ asks
for a slice the deployed workspace does not know; it resolves to FULL, the answer carries no graph, and the
client reports `OUTCOME_UNKNOWN` — truthful and safe, but every save would say it could not be confirmed.
The reverse (new 58_, old frontend) is inert: nothing asks for the slice.

14_ returns as a release owner two releases after leaving it, and 20_ moves for the first time since R20.
The ledger tracked both swaps rather than marching either stamp.

---

## §15 — Position

```
FORECAST_FORMULA_CHANGED = NO   GAP_FORMULA_CHANGED = NO   PRICING_AUTHORITY_CHANGED = NO
S5_BEHAVIOR_CHANGED = NO        S6_BEHAVIOR_CHANGED = NO
FC_SPECIAL_EVENT_WRITE_CONSISTENCY_SEAL = YES
NEXT_TASK = FC-EU-BFCM-DATA-RECONCILIATION-R1
```
