# S8-R4B-2 — SITE INVENTORY CONTROLLED SEARCH EVIDENCE

Read-only Production diagnostic. **No row was written, no schema changed, no repair was made.**
Harness: `assets/tools/s8-fatigue/s8-r4b2-site-inventory-search.js` — real browser, real shipped Search path,
R4A guard armed deny-by-default, ephemeral Chrome profile.

```
SEARCH_COUNTRY = US   SEARCH_MARKETPLACE = Amazon   SEARCH_MARKETPLACE_ID = MKT-RESUS-US-AMAZON
READ_TABLE_COUNT = 19   WRITE_TABLE_COUNT = 0   DELETE_TABLE_COUNT = 0
```

---

## 1. The headline: cost is PER SHEET, not per row

Every measured per-table read time, across 12 samples. Row counts are identical in every sample, so the
spread is run-to-run variance on the same data.

```
table                              rows    measured read_ms
shipping_plans                        6     1238, 1238
shipment_lines                       10     1085
shipping_allocation_draft_lines      14      898,  887
sku_details                         192      804 … 1308   (9 samples)
amazon_weekly_sales_snapshot        247     1031
overseas_inventory_snapshot         260     6221            <- outlier, see §6
amazon_inventory_health_snapshot    345      780, 1184
warehouses                          361      838 … 2622   (9 samples)
fc_special_events                   431     1580, 1675
marketplace_skus                    495      692 … 1128
fc_regular_forecast                 496     1085, 1593
amazon_daily_sales_snapshot        3814     2541 … 4404   (9 samples)
```

**A 6-row table costs 1.24 s. A 3,814-row table costs ~3 s.** A 636× difference in rows produces a ~2.4×
difference in time. The dominant term is a fixed cost of roughly **0.8–1.3 s per sheet opened**, with a
modest size component on top.

`openMs` — the cost of opening the spreadsheet itself — is **133–265 ms**, about 1% of the handler. The cost
is not in opening the file; it is in touching nineteen sheets inside it.

---

## 2. Where the handler time goes

```
sample  arm                       wall_ms  server_ms  open_ms  top5_sum  unaccounted  rows  bytes
A1      COLD                       31751     22107      236     10433      11438      7085  356994
B1      SPACED                     30822     22096      144     12608       9344      7085       -
B2      SPACED                     27088     17166      185      7505       9476      7085       -
B3      SPACED                     59954    ERROR         -         -          -         -       -
C1      IMMEDIATE_REPEAT (void)    61722     20458      265      7456      12737      7085       -
C2      IMMEDIATE_REPEAT (void)    60031    ERROR         -         -          -         -       -
C3      IMMEDIATE_REPEAT (void)    59986    ERROR         -         -          -         -       -
D1      (not a repeat — see §5)    23435     14412      149      6113       8150      7085  356974
D2      UI_REPEAT_CONTROL           3438         —        —         —          —         —       -   0 requests
CC1     IMMEDIATE_REPEAT_CORRECTED 25404     16578      190      6709       9679      7085  356970
CC2     IMMEDIATE_REPEAT_CORRECTED 23913     16382      133      8056       8193      7085  356997
CC3     IMMEDIATE_REPEAT_CORRECTED 23904     17597      183      7796       9618      7085  356986
```

`UNACCOUNTED = server_ms − open_ms − top5_sum` is **8.2–12.7 s, i.e. 39–58% of handler time**, in every
successful sample. Divided over the fourteen tables the top-5 does not name, that is **580–910 ms each** —
which is exactly the per-sheet floor measured directly in §1 for the tables that do appear there.

The residual is therefore **the other fourteen table reads**, not payload construction. §1 and §2 are two
independent routes to the same number.

```
19 tables × ~0.9 s/sheet ≈ 17 s     observed handler range 14.4 – 22.1 s
```

---

## 3. R3B's degradation does NOT reproduce

```
R3B (direct request repetition)   31.7 s  ->  71.4 s  ->  133.8 s    4.2× escalation
R4B-2 corrected Arm C             25.4 s  ->   23.9 s  ->  23.9 s     FLAT
  server_ms                       16.6 s      16.4 s       17.6 s     FLAT
```

`R3B_DEGRADATION_REPRODUCED = NO`. Three back-to-back request-level repeats, same scope, model cleared
between each so every press issued a real read. No escalation in wall time or server time.

This does not say R3B measured wrongly — it says the escalation is **not a reproducible property of this
path today**. R3B remains the only observation of it.

---

## 4. Transport: one redirect, one server execution

Every successful read: exactly **one** 302 hop, `EXEC → ECHO`, `Location` present and of class ECHO, a fresh
`user_content_key` per hop (fingerprinted, never stored). No `ECHO → EXEC` re-entry was seen, so

```
EXEC_HOP_COUNT = 1 redirect        SERVER_EXECUTION_COUNT = 1 per logical read
BOUNCE_OCCURRED = YES (the ordinary /exec 302)      BOUNCE_VISIBLE_FAILURE = NO on successes
TRANSPORT_CONTRIBUTION = PARTIAL
```

Partial, not material: wall exceeds server by a consistent **7–10 s** on every successful read
(e.g. CC2 23.9 s wall vs 16.4 s server). That gap is real and is not handler time, but it is a flat
overhead, not an amplifier. It does not explain the 14–22 s handler.

---

## 5. A confirmed Search is TWO requests, and a repeat is zero

One confirmed Search issues two requests of the same action:

```
1.  the primary read            ~357 KB encoded, 19 tables, 7,085 rows
2.  the carrier catalogue       ~8.5 KB, `only`-scoped to carrier_lead_times + carrier_rate_cards
```

`UI_REPEAT_ZERO_REQUEST_CLAIM_CONFIRMED = YES`, by D2: a second Search in the same session with
`_irReadModel` populated issued **0 requests** and settled in **3.4 s**.

The harness printed `NO` for this, and the harness was wrong: D1 ran immediately after C3, whose read had
FAILED and therefore cleared `_irReadModel` via `_irRenderError_`. D1 was consequently not a repeat at all
but a cold read. D2 is the only valid control in that arm, and it confirms the claim.

**Arm C as originally designed measured nothing**, and the reason is worth keeping. "Reload between each
Search" does not produce a fresh read: on reload the page restores the remembered scope and
`_irBootstrapScope_` performs the workspace read *as part of mount*. By the time Search is pressed either the
model is already populated (zero-request path) or the mount read is still in flight and
`searchReplenishment()` returns at its single-flight guard. C2 and C3 hit the second case — 0 requests, 60 s
of waiting, and an ERROR that belonged to the mount's read. The corrected arm clears the model in place
instead, which is declared in the tool as a harness intervention.

**Consequence worth stating separately: for an operator with a remembered scope, the expensive read happens
at MOUNT, not at Search.**

---

## 6. Two live reliability findings, not asked for and not repaired

**Read failures.** Of the reads observed in the first run, three ended `status: ERROR` with the read model
cleared — B3 as a Search read, and the mount reads behind C2 and C3. B3's request carried id
`REQ-C000001-R2`, the client's own bounded recovery retry, and ended `net::ERR_ABORTED`. The corrected run
had 0 failures in 3. Measured failure rate is therefore somewhere between 0/3 and 3/12 depending on how the
contaminated samples are counted; it is **not zero**, and a failed read leaves Site Inventory showing its
error state.

**One table once took 6.2 s.** `overseas_inventory_snapshot`, 260 rows, read in 6221 ms in sample B1 — 24×
its own cost elsewhere in the same run and the single largest table time recorded. Seen once, in one sample.
Not reproducible from this data and **not** proposed as a cause.

---

## 7. Classification

```
SITE_INVENTORY_ROOT_CAUSE_CLASS = BROAD_READ_COST
ROOT_CAUSE_CONFIDENCE           = MEDIUM

SINGLE_EXECUTION_SLOWDOWN = NO   (flat across back-to-back repeats)
EXEC_HOP_AMPLIFICATION    = NO   (1 redirect, 1 execution, every successful sample)
ONE_TABLE_DOMINANT        = NO   (top-1 is 12–20% of handler time)
OPEN_FIXED_COST           = NO   (openMs ~1%)
PAYLOAD/SERIALIZATION     = NOT SUPPORTED as the dominant term — the residual is accounted for by the
                            fourteen unnamed table reads at the per-sheet floor measured in §1
```

MEDIUM rather than HIGH for one reason only: the per-sheet floor is **measured** for the 12 tables that
appeared in a top-5 and **inferred** for the rest. The inference is arithmetically tight (§2), but the
shipped handler reports only `slowestTables.slice(0, 5)`.

```
ADDITIONAL_INSTRUMENTATION_REQUIRED = YES — per-table read_ms for all 19, which would convert the
  inference into proof. Bounded change to 60_ only. NOT made in this round (§16).
```

---

## 8. Architecture decision gate

```
ARCHITECTURE_DECISION_REQUIRED = YES
```

Nineteen tables, each individually reasonable, together costing ~17 s of handler time because the cost is
per sheet rather than per row. There is no narrow technical repair visible in this evidence: no single table
dominates, the spreadsheet open is ~1%, and the transport adds a flat 7–10 s that is separate from the
handler.

Reducing it means reducing **how many sheets one Search touches**, which is a product/architecture decision
and is the operator's:

- **A — Defer the non-render tables.** Several of the nineteen feed secondary panels rather than the primary
  table. Splitting them into a second read changes the first-load contract.
- **B — Lazy-load on expand.** Exposure tables (shipments, shipment_lines, shipping_plan*, allocation
  draft*) total 46 rows and cost ~4 s; they could be fetched per expanded SKU instead.
- **C — Server-side cache with a freshness window.** Cheapest latency win, introduces a staleness contract
  the business has not been asked to accept.
- **D — Accept the cost and fix only the failures** (§6), leaving ~17 s as the working figure.

Each trades first-load completeness, freshness, or payload shape. **Not chosen here.**
