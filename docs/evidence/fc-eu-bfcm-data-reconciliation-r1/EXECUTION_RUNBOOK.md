# FC-EU-BFCM-DATA-RECONCILIATION — BOUNDED EXECUTION RUNBOOK (R2)

```
STATUS = PROPOSED. NOT RUN. NOT AUTHORIZED.
PRODUCTION_REPAIR_EXECUTION_AUTHORIZED = NO
PRODUCTION_ROWS_WRITTEN = 0   (this round)
```

This is what a future **FC-EU-BFCM-DATA-RECONCILIATION-R2** would do, written down now so the round that does
it starts from a procedure rather than a rediscovery. Nothing here has been run. No executor exists in the
tree, deliberately: an executor committed before authorization is an executor somebody can run.

---

## 0 — Authorization gate

Execution requires, in one explicit operator turn:

```
D_FC_RECON_EXECUTE = ACCEPT
DISCOUNT_PERCENT = 20                 (frozen by the operator in R1A §0)
CAMPAIGN_SCOPE = <the campaign_id the census reported>
```

Absent any of the three, R2 stops. A reconciliation that guessed a discount would be inventing commercial
data, and a reconciliation with no named campaign scope is unbounded.

---

## 1 — Preflight (read-only, mandatory, same run)

```
TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1({ campaign_id: '<id>' })
```

STOP unless all of:

```
verdict                                 = PLAN_READY
refused_conflict_count                  = 0
unknown_count                           = 0
schema_extension_required               = NO
new_line_id_mint_count                  = 0
missing_line_count                      > 0
every plan row's status                 = READY_FOR_REPAIR    (R1A derives the prices; a row still
                                          WAITING means the discount did not reach the census)
```

The preflight runs **immediately before** the write, in the same session. A plan produced an hour earlier
describes a graph that may have moved.

---

## 2 — Review the worksheet  *(R1A: no longer a data-entry step)*

R1A froze the discount and derived the rest, so `operator_required_discount_by_series` now arrives FILLED:

```
discount_percent    OPERATOR_FIXED  20, from FCRC_R1A_DISCOUNT_PERCENT_ in the entry file
regular_price       DERIVED         pricingResolveEffective_ (73_) over today's pricing_list row
price_units         DERIVED         the currency of that same row
promo_price         DERIVED         pricingRoundFx_ (73_) — the frozen precision contract
```

The operator's job here is to **read** the rows, not to fill them. Two things are worth reading for:

* a `regular_price_source` of `AUTO` means the site has no manual price and the figure came from the FX
  chain — correct, and worth a glance before it is written into a commercial record;
* the prices are **today's**, and the honest claim about them is `REPAIR_PRICE_PROVENANCE =
  OPERATOR_AUTHORIZED_CURRENT_SITE_REGULAR_PRICE`. They are not proof of what the lost line held.

Any row the census refused is NOT in this list. It is in `repair_plan` with its conflict named, and it
stays out of the execution.

---

## 3 — The write, per row, bounded

One `campaign_sku_lines` row per missing id, through the **ordinary** writer — no new action, no new handler,
no migration:

```
action : upsertCampaignSkuLines          -> handleUpsertCampaignSkuLines_ (20_)
body   : { campaign_id: '<the campaign the census reported>',
           updated_by : '<operator>',
           lines: [ { campaign_sku_line_id : '<the id the EVENT names>',   // supplied, never minted
                      sku                  : '<from the event>',
                      marketplace_sku_id   : '<census, 1:1 only>',
                      discount_percent     : <census: operator-fixed 20>,
                      promo_price          : <census: pricingRoundFx_>,
                      regular_price        : <census: pricingResolveEffective_>,
                      price_units          : '<census: the pricing row currency>',
                      line_status          : 'active',
                      source               : 'fc_reconciliation' } ] }
```

Supplying `campaign_sku_line_id` is the property the whole repair rests on: R1 `K10` proved stage 2 honours a
supplied id and creates the row **under it** rather than minting a new one, and R2 left that unchanged.

Per row, in order, refusing rather than proceeding:

```
1  the campaign exists                                        else REFUSE
2  the line id is STILL missing                               else SKIP   (idempotent)
3  at least one event references EXACTLY this id              else REFUSE (no authority for the id)
4  every such event's campaign_id is the target campaign      else REFUSE (ambiguous parentage)
5  no other line holds this campaign + SKU/MSKU identity      else REFUSE (would duplicate)
6  the census reported this row READY_FOR_REPAIR              else SKIP it (refused or waiting)
7  write the single row
8  re-read and confirm the id now resolves                    else STOP the whole run
```

```
NEVER write to fc_special_events during recovery.
NEVER overwrite an existing line to make the graph fit.
NEVER delete a valid row as part of reconciliation.
NEVER mint a campaign_sku_line_id.
```

Steps 1–5 are what make a re-run safe: it skips what is there and refuses what has become ambiguous. Do not
rely on the writer's unchanged short-circuit for idempotency — it only protects an *identical* payload, and a
re-run carrying a different discount would be an update, which is an overwrite.

Batch size: one row per request for the first row, then the remainder may go in one batch. The first row alone
is the cheapest proof that the id is honoured rather than replaced.

---

## 4 — Acceptance

```
TEMP_FC_EU_BFCM_RECONCILIATION_VERIFY_R1({ campaign_id: '<id>' })
```

Required: `accepted = true`, `failed_checks = []`.

Then open FC Summary for that campaign and save an unmodified event. R2's graph readback must report
`verified` — the same comparison, reached the ordinary way.

---

## 5 — If it goes wrong

| SYMPTOM | ACTION |
|---|---|
| step 8 says the id still does not resolve | STOP the run. Do not retry, do not write the next row. The id was not honoured, and that is a different defect. |
| a row refuses at step 5 | leave it. Surface the occupant to the operator; it is a decision, not a repair. |
| `CAMPAIGN_SKU_LINE_LOCK_TIMEOUT` | nothing was written (R2 §6). Re-run the preflight and retry the row. |
| the write times out with no answer | **do not resend.** Re-run the preflight: step 2 will say whether it landed. |

The last row is the one R2 exists to make answerable. Before it, a lost response and a lost write looked the
same.

---

## 6 — Afterwards

```
Delete TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1.gs from the Apps Script project.
Record in the evidence: rows written, ids, the discounts supplied and who supplied them.
```

The file is `PASTE · RUN · REMOVE`. It is not part of the deployment and no release stamp moves for it.
