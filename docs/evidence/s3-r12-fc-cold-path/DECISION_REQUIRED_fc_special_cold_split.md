# §11 DECISION REQUIRED — deferring two tables out of the FC Special cold path

**Written for:** the operator, as the decision-maker. Nothing in this document has been implemented.
The variant described here was built, measured and reverted; the shipped tree still loads both tables.

```
PAGE = FC Summary → + New FC Update → Special Event → Next
CRITICAL_SECONDARY_LAZY_DECISION_REQUIRED = YES
```

## What was measured, and how

A real Special builder open, in real headless Chrome, over a populated fixture world, with every
broad-cache getter wrapped and counted. Not a grep.

| Table | Fetched before the builder opens | Getter called during the open | Read later by |
|---|---|---|---|
| `sku_details` | yes | **yes** | scope + category/series |
| `marketplace_skus` | yes | **yes** | scope + category/series |
| `campaigns` | yes | **yes** | Base Campaign list, existing-event picker |
| `campaign_sku_lines` | yes | **no** | `_evtHydrateExisting_` — only when you pick an existing event |
| `pricing_list` | yes | **no** | `resolveRegionalPricingContext` — only when a SKU row is given a SKU |
| `fc_special_events` | ~~yes~~ **removed this round** | yes | now served by the `events` slice |

Two tables are bought before the builder opens and are not touched by opening it.

## Why this is your decision and not mine

Those two tables *are* needed later. Taking them out of the cold path does not delete work — it
**moves** work to the moment you first pick an existing event, or first type a SKU. That is a
Critical / Secondary / Lazy split, and §11 reserves it for you. I measured it and stopped.

## The two candidates

```
CURRENT_COLD_DEPENDENCIES = sku_details, marketplace_skus, campaigns, campaign_sku_lines, pricing_list
FIRST_USEFUL_UI_REQUIRES  = sku_details, marketplace_skus, campaigns
DEFERABLE_DATA            = campaign_sku_lines, pricing_list

PROPOSED_CRITICAL  = sku_details, marketplace_skus, campaigns
PROPOSED_SECONDARY = campaign_sku_lines  (load when an existing event is selected)
PROPOSED_LAZY      = pricing_list        (load when the first SKU row is filled in)
```

## Expected benefit — measured, not estimated

```
                        SHIPPED (today)        PROPOSED
requests on Special Next    4                      2
sequential read rounds      2                      1
```

Those are the harness figures. On a session that goes straight to Special without opening Regular
first, the declared cold set is 5 tables → **3 rounds**, and the proposal makes it 3 tables →
**2 rounds**. The read pool is 2 lanes, which is what turns a table count into a round count.

The two tables removed are also the **largest** in the set. `campaign_sku_lines` grows with campaigns
× SKUs; `pricing_list` is one row per marketplace SKU with about twenty columns. Against fixtures at a
plausible business scale they are roughly half the bytes of the whole six-table set.

**What I will not claim:** that this turns ~37 s into a specific number. I have no production row
counts and no production timings. What I can say is that it removes the two largest reads and one of
the three sequential rounds from a path you measured at ~37 s while the two-table Regular path
measured at ~6 s.

## Trade-offs, stated plainly

```
FRESHNESS_IMPACT = NONE by construction, but the timing of the read moves.
```
Both tables would be read *later in the same session*, not cached across routes and not given a TTL.
Each read stays the same canonical read with the same freshness semantics. The honest change is that
`pricing_list` would be read at the moment you fill in a SKU rather than a minute earlier — which is
**fresher**, not staler.

```
FAILURE_ISOLATION_IMPACT = IMPROVED for the open, INTRODUCED for two interactions.
```
Today a failure on either table fails the whole Next, with one refusal surface you already know.
After the split, opening the builder can no longer fail for those reasons — but picking an existing
event, or filling in the first SKU row, each gain a failure mode they do not have today. Each would
need its own visible, retryable refusal. **This is the real cost**, and it is not small: the FC
builder's refusal surfaces are the thing FC-SUMMARY-R1 and R2-STABILITY spent two rounds getting
right, and this adds two more places that have to be right.

```
COMPLEXITY_COST = MODERATE.
```
Two new load points, two new in-flight latches (so a second click does not double-fetch), two new
refusal surfaces, and their tests. The existing per-path latch machinery is reusable, so this is
extension rather than invention — but it is not a one-line change and I would not want it rushed.

## The alternative you could pick instead

A **purpose-built, site-scoped builder prerequisite** — one server action returning only the fields
the builder needs for the chosen company/country/marketplace. That would cut bytes far harder than
the split does and keep one failure surface.

I did not propose it as the primary option for one concrete reason: **the scope is chosen inside the
modal, after Next has already run.** The prerequisite load happens before the operator has told us
which site they mean, so there is nothing to scope by yet. Making it work would mean moving scope
selection ahead of Next — a product change to the builder flow, not a performance fix. If you want
that, it is a different round and it starts with the flow, not the read.

## What I need from you

Pick one:

1. **Do the split as proposed** — I implement Secondary + Lazy with their own refusal surfaces and tests.
2. **Split only `pricing_list`** — the lazier of the two, lowest risk, and it is the larger table on
   most row counts. Leaves `campaign_sku_lines` in the cold path.
3. **Leave it alone** — the cold path stays as it is, and this stays recorded as measured debt.
4. **Move scope selection before Next** — a product change first; then a scoped read becomes possible
   and beats all of the above.

If it helps you decide, the single most useful thing you could send back is the
`FC_NEW_UPDATE_NEXT_MS` capture from `OPERATOR_INTERACTION_CAPTURE.md` for the **Special** path, cold
and warm. If cold is slow and warm is instant, this proposal is aimed at the right thing. If warm is
also slow, it is not, and I should be looking somewhere else entirely.
