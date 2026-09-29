# FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R1 — THE THREE-TABLE SAVE

```
PRE_SHA = 7cf7c0d   branch = feature/product-strategy-board-p0
MODE = investigation. PRODUCTION_ROWS_WRITTEN = 0. No production row read, written, deleted or replayed.
```

Two operator incidents on the same EU event, in **opposite** directions:

```
A   campaigns ✓   campaign_sku_lines ✓   fc_special_events MISSING
B   campaigns ✓   fc_special_events ✓    campaign_sku_lines MISSING
```

The flip is the most useful fact either incident carries. It rules out *"stage 2 is broken"* and points at
what they share: **the UI said SAVED both times, and the operator learned otherwise only by inspecting the
database.**

---

## §1 — The save transaction

```
SAVE_ENTRYPOINT              saveEventUpdate()            assets/js/pages/fc-summary.js
CLIENT_WRITE_OWNER           KM.DB.upsertCampaign · upsertCampaignSkuLines · importFcSpecialEventsBatch
SERVER_WRITE_OWNER           20_campaign_write_handlers.gs (1,2) · 14_fc_write_handlers.gs (3)
WRITE_OWNER_COUNT            3 — three separately routed actions, three HTTP requests

WRITE_ORDER   1. campaigns              handleUpsertCampaign_            LOCKED
              2. campaign_sku_lines     handleUpsertCampaignSkuLines_    NOT LOCKED
              3. fc_special_events      handleImportFcSpecialEventsBatch_ -> fcSpecialEventUpsert_

TRANSACTIONAL_BOUNDARY_EXISTS = NO      (three requests cannot be one transaction)
ROLLBACK_EXISTS               = NO      (nothing undoes a committed stage)
PARTIAL_COMMIT_REACHABLE      = YES
```

The page *knows* this: it keeps `_fcEbCommitted_`, a manifest of stages already committed, so a failure can
tell the operator what exists and that it *"still needs reconciling"*. That is the honest report of a partial
commit — and it only ever runs on the **failure** path.

### The lock asymmetry

Stage 1 takes a `ScriptLock`, with a comment stating why: *"Two concurrent creates must not both read 'no
match' and both append."* **Stage 2 takes no lock at all**, while doing the identical read-then-append: it
computes its append position as `s.rows.length + 1` from a read taken earlier in the same call. Two
concurrent saves therefore both compute the same position and the second overwrites the first.

This needs no operator error and no timeout. It is not offered as the cause of either incident — it is a
defect found while looking for one.

---

## §2 — What the success receipt is made of

This is the finding, and it is decidable entirely from source.

```
SUCCESS_RECEIPT_COUNT_SOURCE
  campaigns: 1              THE LITERAL 1        — not a count, not a read, not a proof
  campaign_sku_lines: N     linePayloads.length  — the length of a CLIENT array, built before the request
  fc_special_events: N      evCls.written        — classified from the stage-3 server envelope

SUCCESS_RECEIPT_IS_AUTHORITATIVE = NO
FALSE_SUCCESS_REACHABLE          = YES
CAN_UI_REPORT_campaign_sku_lines_5_WITH_ZERO_ROWS_COMMITTED = YES
```

`linePayloads` is `lines.map(...)` — the SKUs the operator authored. It is the number of lines **sent**, not
the number of rows that **exist**, and it would print `5` for a sheet holding none. The stage-2 *response*
is read for exactly one purpose — harvesting ids into `lineIdBySku` — and its own `created` / `updated` /
`unchanged` / `upserted` counts are never read at all.

### The asymmetry, which is the root cause statement

| stage | what the page knows about it |
|---|---|
| **3 · fc_special_events** | fully classified. Results matched to rows **by the server's index**, a mismatch recorded rather than misapplied, a missing result treated as REFUSED, per-row typed refusals shown in a partial dialog that keeps the form open. |
| **2 · campaign_sku_lines** | receipt read for ids only; its own counts discarded. |
| **1 · campaigns** | a literal `1`. |

**The save reports most confidently about the stage that is hardest to get wrong, and says nothing checkable
about the two that precede it.** That is why two incidents in opposite directions produced the same message.

```
POST_WRITE_CAMPAIGN_READBACK          = the writer's returned row, reconciled into the model (not re-read)
POST_WRITE_CAMPAIGN_SKU_LINES_READBACK = NONE
POST_WRITE_FC_SPECIAL_EVENTS_READBACK  = NONE (the events slice is refreshed; the graph is never verified)
```

---

## §3 — Identity

```
CAMPAIGN_ID_GENERATION_OWNER          SERVER  20_  'CMP-' + uuid
CAMPAIGN_SKU_LINE_ID_GENERATION_OWNER SERVER  20_  'CSL-' + uuid
EVENT_FC_ID_GENERATION_OWNER          SERVER  14_  'EFC-' + uuid
```

MIXED in one direction only: the **client supplies an id it is already holding** — `campaign_sku_line_id`,
`event_fc_id`, `expected_row_version` — and that is what makes an edit an update rather than a duplicate. It
is also the reuse surface: a held id survives the row it names.

### There is no referential integrity, in either direction

`fcSpecialEventUpsert_` never reads `campaign_sku_lines`. An `fc_special_events` row naming a
`campaign_sku_line_id` that does not exist is **a legal write** — driven and committed in the suite (D1/D2)
— and afterwards it is indistinguishable from a legitimate row.

The only thing standing in that place is a **client-side** precondition, and it accepts a held id:

```js
!(lineIdBySku[sku] || l.campaignSkuLineId)     // stage 3 may run if EITHER is present
```

So an id the form is merely holding — from a row the operator deleted — satisfies the only check there is.

---

## §4 — The manual delete

```
MANUAL_DELETE_CAN_EXPLAIN_CURRENT_INCIDENT = PARTIAL
```

It **can** explain how orphans arise and it is proven to leave the system unable to heal itself (§7). It is
**not** proven to have produced INCIDENT B, and the repository cannot prove it did. The deletion is not
blamed here.

What *is* proven: deleting the lines and re-saving does **not** fail — stage 2 recreates them (G-G, 5
created). So the cleanup on its own does not produce a missing-lines state.

---

## §5 — Timeout, replay, and the write-outcome model

```
WRITE_OUTCOME_CLASSIFICATION_IMPLEMENTED = YES
UNKNOWN_OUTCOME_CAN_BE_REPORTED_SUCCESS  = NO   for a THROWN outcome
UNKNOWN_OUTCOME_CAN_BE_RETRIED_UNSAFELY  = NO   nothing replays a Save by itself
TIMEOUT_PARTIAL_COMMIT_REACHABLE         = YES  bounded to ONE transport replay
RETRY_IDEMPOTENT                         = YES  per stage, proven (G-D, G-E)
DUPLICATE_OR_PARTIAL_RETRY_RISK          = LOW for duplicates, HIGH for partial graphs
```

`_fcBuilderFailure_` distinguishes a proven zero-write from `OUTCOME_UNKNOWN` and reports each in its own
words. The transport replays `upsertCampaignSkuLines` once on a lost delivery hop and says honestly that a
dead echo target is *"INDETERMINATE, not a proven zero write"*. A replayed stage 2 writes no second row and
returns the same ids (G-D, G-D1).

**The gap is not on the failure path.** A stage that *answers* is never checked against the sheet. The model
classifies outcomes it is told about; it has no way to notice a stage that reported success and left nothing
behind.

---

## §6 — Authoritative readback

```
SUCCESS must mean:  campaign ─┬─ campaign_sku_lines (N) ─┬─ fc_special_events (N)
                              └── every event references an existing campaign AND an existing line
```

None of it is checked. No count is read back, no link is verified, and the message is emitted from a literal,
an array length and one classified envelope.

---

## §7 — The current production state, and how to repair it

### Classification of the observed rows

| class | rows | basis |
|---|---|---|
| `VALID_GRAPH` | the `campaigns` row | created and confirmed |
| `MISSING_CAMPAIGN_SKU_LINE` | 5 | the operator's inspection |
| `ORPHAN_FC_SPECIAL_EVENT` | 5 | each references a `campaign_sku_line_id` with no row |
| `DUPLICATE_*` / `IDENTITY_MISMATCH` | 0 observed | the uniqueness gate makes duplicates hard to create |

### The state is NOT self-healing, and that is the load-bearing finding

Both obvious operator recoveries are **refused**, proven against the shipped writer:

| attempt | outcome |
|---|---|
| re-Save carrying `event_fc_id` but no version | `STALE_SPECIAL_EVENT_VERSION` — refused, nothing written (K6) |
| rebuild the event from scratch (new line ids) | `DUPLICATE_SPECIAL_EVENT_IDENTITY` — refused, nothing written (K9) |

and the orphan link is **sticky**: a refused save repoints nothing, so the dangling
`campaign_sku_line_id` stays exactly as it is (K7).

Both refusals are *correct*. One event flag in one target year is one event; a versionless save may not
overwrite a row the model did not know about. The consequence is simply that the operator cannot click their
way out of this state.

### The repair that does work — and it is the ordinary Save

```
PRODUCTION_REPAIR_DETERMINISTIC = PARTIAL — identity YES, commercial values NO
```

**The orphan events still carry the deleted `campaign_sku_line_id` values.** The builder hydrates those back
onto its rows (`_evtBuildGroups` takes `campaignSkuLineId`, `eventFcId` and `rowVersion` from
`_evtBaseEventForSku`), and **stage 2 honours a supplied `campaign_sku_line_id`**: finding no row for it, it
creates one *under that id* (K10). The link closes by **recreating the line the events already point at**,
not by rewriting a single event row (K10a/K10b).

```
PRODUCTION_REPAIR_PLAN
  1. Do NOT delete anything. The 5 orphan events are the only surviving record of the deleted line ids.
  2. Record, read-only: for each fc_special_events row of this event —
     event_fc_id · campaign_id · campaign_sku_line_id · sku · fc_qty.
  3. Open the event in the Special Event Builder and Build the group cards. Confirm each row shows the
     stored Base Event FC (proof the form hydrated event_fc_id + row_version from the sheet).
  4. Re-enter the commercial values that no table holds: Discount %. Regular Price and currency will
     resolve from pricing_list; confirm they match what the event was priced at.
  5. Save. Stage 2 recreates the 5 lines UNDER THE EXISTING IDS; stage 3 updates the 5 events in place,
     carrying event_fc_id + expected_row_version, so no duplicate and no new identity is minted.
  6. Verify in the database, not in the toast: 1 campaign, 5 lines, 5 events, every event's
     campaign_sku_line_id present in campaign_sku_lines.

ROWS_TO_DELETE_PROPOSED      = 0
ROWS_TO_RECONSTRUCT_PROPOSED = 5 campaign_sku_lines, under their existing ids
```

**Why reconstruction is only PARTIAL.** `fc_special_events` carries the identity skeleton
(`campaign_sku_line_id`, `campaign_id`, `sku`) and **no commercial value at all** — nine line columns have no
counterpart on the event row. `regular_price` and `price_units` could be re-derived from `pricing_list`, but
that gives *today's* price, not the one snapshotted at save time, and `price_units` exists precisely so a
currency is never re-guessed later. **`discount_percent` and `promo_price` are recoverable from no table.**
Only the operator holds them, which is why step 4 is a human step and why this is not a script.

**"Delete all and recreate" is explicitly NOT recommended.** It would destroy the only surviving copy of the
line ids, convert a repairable graph into an unrepairable one, and then be refused by the uniqueness gate
anyway.

---

## §8 — Target architecture (decision gate, not implemented)

Minimum properties: idempotent · retry-safe · no false success · no silent partial graph · authoritative
readback · stable ids · fail-closed on identity · existing valid rows preserved · no auto-replay after
`OUTCOME_UNKNOWN` · no duplicate campaign on retry.

Three designs reach them. **They are not equivalent and the choice is the operator's.**

### OPTION 1 — Authoritative receipt (smallest change)

Keep three requests. Add a bounded post-write read of the three tables for **this campaign only**, and gate
the success message on the graph being whole; anything else reports a named partial state through the
existing partial dialog.

*Pros* — smallest surface; no server transaction; reuses the partial dialog and the reconcile advice that
already exist; makes every future incident self-reporting on the spot. *Cons* — does not prevent a partial
commit, only stops it being called a success. One extra bounded read per save.

### OPTION 2 — One server action for the whole graph

A single routed action that takes campaign + lines + events, runs all three writes under **one** ScriptLock,
and returns authoritative counts read back inside the lock.

*Pros* — removes the lock asymmetry and the partial-commit window together; one request instead of three;
receipt is authoritative by construction. *Cons* — a new routed action and a new payload contract; Apps
Script still has no rollback, so a failure mid-way is still partial — it is merely much narrower; the largest
change of the three, on the tree's most incident-prone path.

### OPTION 3 — Referential integrity at the event writer

Make `fcSpecialEventUpsert_` refuse a `campaign_sku_line_id` that names no row.

*Pros* — makes the orphan structurally impossible; tiny; fails closed. *Cons* — **it would refuse today's
production rows**, so it cannot ship before the repair in §7 is complete; adds a read to a hot write path;
does not by itself make the receipt truthful.

**Recommendation: 1 + 3, in that order, and not 2 yet.** Option 1 makes the system honest about what it did,
which is the defect both incidents actually share. Option 3 then makes the specific fault unreachable, and it
is safe to add *only after* §7's repair leaves no orphan to refuse. Option 2 is the right end state and the
wrong next step: it rewrites the save while the tree already holds six unshipped releases.

**This recommendation is not self-authorising.**

---

## §9 / §11 — Safety, tests, required output

```
CODE_FIX_REQUIRED     = YES (R2)   DB_MIGRATION_REQUIRED = NO
NEW_COLUMNS_REQUIRED  = NONE       NEW_TABLE_REQUIRED    = NO
S6_BEHAVIOR_CHANGED   = NO         PRODUCTION_ROWS_WRITTEN = 0
FORECAST/GAP/PRICING/S5/S6 — untouched. No runtime file changed in this round.

CURRENT_INCIDENT_CLASSIFICATION = ORPHAN_FC_SPECIAL_EVENT (5) + MISSING_CAMPAIGN_SKU_LINE (5)
ROOT_CAUSE = PROVEN for the reporting defect: the save has no transactional boundary, no rollback, no
             referential integrity and no authoritative readback, and its success message is composed of a
             literal, a client-side array length and one classified envelope — so ANY partial outcome in
             ANY stage is reported as a complete success.
             NOT PROVEN: which specific fault emptied campaign_sku_lines in INCIDENT B.
CONFIDENCE = HIGH for the reporting defect and the non-self-healing state (both driven against the shipped
             handlers). LOW for the specific vanishing mechanism.
FC_SPECIAL_EVENT_WRITE_CONSISTENCY_ROOT_CAUSE_PROVEN = PARTIAL
```

### What would decide the part that is not proven

The handler places its appends correctly at every N from 1 to 200 (`fc-special-stage2-large-batch-r1`), so
*"the writer put the rows in the wrong place"* is excluded. Deciding the rest needs evidence the repository
does not hold — from the operator, read-only:

> 1. The Apps Script **execution log** for the failed save window: how many `upsertCampaignSkuLines`
>    executions ran, their durations, and whether any ended in error or timeout. Two executions would prove
>    the transport replay fired; a >6-minute execution would prove a server-side timeout after the receipt
>    was composed.
> 2. Whether `campaign_sku_lines` holds rows for that `campaign_id` **anywhere** in the sheet, including far
>    below the visible data — filter on `campaign_id`, not by scrolling.
> 3. Whether any **other** save or import touched `campaign_sku_lines` in the same minutes (the unlocked
>    stage 2 loses a concurrent write).

Until one of those answers, naming a single cause for INCIDENT B would be a guess, and §4 forbids one.

```
FOCUSED_TESTS   assets/tests/fc-special-event-write-consistency-r1.test.js   84 / 0
MUTATION_TESTS  6 / 6
FIXTURES        §10 A–L all driven against the REAL handlers with a fake spreadsheet
```

`NEXT_TASK = OPERATOR DECISION GATE` — the §8 architecture choice and the §7 repair, in that order. R2 is
`FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R2 — authoritative receipt (option 1)` once the gate clears.
