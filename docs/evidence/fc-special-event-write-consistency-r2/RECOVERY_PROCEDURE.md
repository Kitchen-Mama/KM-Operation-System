# FC-EU-BFCM RECOVERY PROCEDURE — PREPARED, NOT EXECUTED

```
STATUS = PREPARED. NOT RUN. NOT AUTHORISED.
CURRENT_EU_BFCM_ROWS_MODIFIED = 0        PRODUCTION_ROWS_WRITTEN = 0
RECOVERY_EXPECTED_LINE_COUNT_SOURCE = the authoritative current fc_special_events / campaign graph
HARDCODED_INCIDENT_ROW_COUNT = NO
```

This document exists so the reconciliation round starts from a written procedure rather than a
rediscovery. **Nothing here has been run against production**, and R2 changed no EU BFCM row.

---

## 1. The state, as the graph reports it

```
campaigns            the EU BFCM campaign is PRESENT
fc_special_events    PRESENT for all expected SKU rows  (9 — two Series: 4 + 5)
campaign_sku_lines   MISSING for all of them            (9)
```

Do not take the 9 from this document either. Derive it, every time, from the live graph:

```
graph = fcSummary workspace, slice "graph", scope { campaign_id: <the EU BFCM campaign_id> }

expected_line_ids = distinct(graph.events[].campaign_sku_line_id)
missing_line_ids  = expected_line_ids  minus  graph.lineIds
```

If `missing_line_ids` is empty, the incident is already resolved and this procedure **stops**.

---

## 2. The one fact that decides the whole approach

**The nine events are the only surviving copy of the nine `campaign_sku_line_id` values.**

Everything else follows from that:

| DO NOT | WHY |
|---|---|
| delete the events | the ids go with them, and nothing else holds a copy |
| recreate the events | `fcSeUniquenessConflict_` refuses — one event flag in one target year is one event |
| mint new line ids | the events would still point at the old ones; you would have two holes instead of one |
| re-save the event to "repoint" it | a versionless save is refused `STALE_SPECIAL_EVENT_VERSION` (R1 K7) |

The recovery therefore runs in exactly one direction: **create the missing lines under the ids the events
already name, and do not write a single event row.**

---

## 3. What can and cannot be reconstructed

| FIELD | SOURCE | RECOVERABLE |
|---|---|---|
| `campaign_sku_line_id` | the event's own `campaign_sku_line_id` | YES — authoritative |
| `campaign_id` | the event's `campaign_id` | YES — authoritative |
| `sku` | the event's `sku` | YES — authoritative |
| `marketplace_sku_id` | resolvable from sku + the campaign's company/country/marketplace | YES — derived, verify before use |
| `regular_price`, `price_units` | `pricing_list` **today** | PARTIAL — today's price, not the snapshot taken at save time |
| `promo_price` (deal price) | nothing | **NO** |
| `discount_percent` | nothing | **NO — operator input required** |
| `line_status`, `source` | conventional defaults (`active`, `fc_summary_builder`) | YES by convention |

```
RECOVERY_REQUIRES_OPERATOR_DISCOUNT = YES
```

`price_units` exists precisely *because* the snapshot must not be re-guessed later, so re-deriving prices
from today's `pricing_list` is a decision, not a restoration. The operator confirms each value. This is a
procedure with a human in it, and any version of it that silently filled these fields would be inventing
commercial data.

---

## 4. The procedure

For each `line_id` in `missing_line_ids`, **in order, refusing rather than proceeding**:

```
1. verify the campaign exists                              -> else REFUSE (nothing to attach to)
2. verify line_id is STILL missing                         -> else SKIP (idempotent; someone got there first)
3. verify at least one event references EXACTLY this id     -> else REFUSE (no authority for the id)
4. verify every such event's campaign_id === the campaign   -> else REFUSE (ambiguous parentage)
5. verify no conflicting line exists for the same
   campaign_id + marketplace_sku_id under a DIFFERENT id    -> else REFUSE (would duplicate the identity)
6. collect sku / campaign_id from the events (authoritative)
7. obtain discount_percent, promo_price and the price
   snapshot FROM THE OPERATOR                               -> else STOP for that row
8. create the line with campaign_sku_line_id = line_id
9. re-read the graph and confirm the id now resolves
```

```
NEVER overwrite an existing line to make the graph fit.
NEVER delete a valid row as part of reconciliation.
NEVER write to fc_special_events during recovery.
```

Steps 1–5 make the procedure **idempotent**: re-running it after a partial recovery skips what is already
there and refuses what has become ambiguous.

---

## 5. Which writer performs it

The ordinary `handleUpsertCampaignSkuLines_`, with `campaign_sku_line_id` supplied. R1 proved (K10) that
stage 2 honours a supplied line id and creates the row **under it** rather than minting a new one — which
is the single property this recovery rests on, and it is unchanged by R2.

No new action, no new writer, no migration:

```
NEW_TABLE_REQUIRED = NO   NEW_COLUMNS_REQUIRED = NONE   DB_MIGRATION_REQUIRED = NO
```

After R2, step 8 is also safe in a way it was not before: if a line id were somehow wrong, no *new* event
could later be written against it, because the reference gate would refuse.

---

## 6. Verification, after

Re-read the graph for the campaign and require:

```
missing_line_ids  = []        orphan_event_ids = []
committed_line_count  === expected_line_count
committed_event_count === expected_event_count
```

That is the same comparison the save now performs, run once more with no write behind it.

---

## 7. What this procedure does NOT claim

It does not explain **how** the nine lines vanished. R1 could not prove that and R2 did not try: the
stage-2 handler places its appends correctly at every N from 1 to 200, so "the writer put them in the
wrong place" is excluded, and what remains needs evidence the repository does not hold — the Apps Script
execution log for the save window, and whether anything else touched that sheet in the same minutes.

What R2 changed is that the same loss can no longer be **reported as success**, and the graph can no
longer **acquire a new hole**. The room behind the door is still the operator's to repair.
