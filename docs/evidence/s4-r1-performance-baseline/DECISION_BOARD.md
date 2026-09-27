# S4-R1 — Decision board and draft budgets

**Written for:** the operator, as the decision-maker. **Nothing here has been implemented.** Every
item is a product decision about what loads first, what loads later, and what survives a route change
— which §0 of this round reserves for you.

Read [ARCHITECTURE_CENSUS.md](ARCHITECTURE_CENSUS.md) first if you want the measurements behind these.

```
DECISION_REQUIRED_COUNT = 7
NEXT_TASK = S4-R2, and only after these are answered
```

---

## The one thing that changes how you should read all of this

Client-side work is **not** where your waits come from. Every route in this application — including
the one that renders 3 863 DOM nodes — completes its client work inside the same 1.7–2.1 s band as a
browser run that does nothing at all. The instrument cannot resolve any route above that noise.

So the 5–15 s you measure in production is **network and server**. Every proposal below is therefore
about *requests, rounds and bytes*, and none of them is about rendering. A round spent making the
rendering faster would be a round spent on the part that is already fine.

---

## §9 — Draft user-experience budgets (proposal only)

These are drawn from what the application already does, not from an industry table. The point of
separating them is that **an ERP action that talks to Apps Script cannot be sub-second, and pretending
otherwise produces frozen UI instead of honest waiting.**

| surface | proposed budget | today | basis |
|---|---|---|---|
| **APP_SHELL** — header + menu visible | near-immediate | below instrument resolution | already shell-first |
| **ROUTE_SHELL** — section visible after a menu click | near-immediate, and **never waits for data** | **holds on all 21 routes**, measured | make the existing behaviour a rule |
| **BUTTON_FEEDBACK** — visual acknowledgement of a click | near-immediate, always | not audited this round | a click that looks ignored is the worst failure mode |
| **LOCAL_FILTER** — filtering data already on the client | near-immediate | S3-R11 proved 0 requests on SKU filters and all four SKU Regional switches | already true; worth pinning |
| **MODAL_OPEN** — opening a builder or editor | near-immediate **shell**, data may follow with a stated loading state | FC Special now does exactly this | the S3-R13 pattern, generalised |
| **WARM_REENTRY** — returning to a page visited this session | near-immediate, **zero requests** | **12 of 21 routes**; 9 re-read | the gap is decision 1 |
| **FIRST_USEFUL_UI (cold)** — bounded, explicit, never frozen | one read round wherever possible; **two is a design smell; three needs a reason** | 3 rounds on one route, 2 on two others, 1 on the rest | rounds are the thing that multiplies |
| **NETWORK_DEPENDENT_INTERACTION** — a builder or a save | **progress, not a frozen screen.** No number. | mixed | see below |
| **LARGE_SERVER_OPERATION** — a 40-row pricing write | progress state + a truthful outcome | S3-R10/R13 settled the truthfulness half | 11–12 s is acceptable **if it says so** |

**The distinction this round wants to put on record:**

```
INSTANT FEEDBACK  =  the interface acknowledges you at once.  This is ALWAYS required.
DATA COMPLETE     =  the numbers are there.  This is bounded, stated, and sometimes slow.
```

Nothing above proposes that a network-backed ERP action becomes fast. It proposes that it becomes
*legible*: the shell is there, the control responded, and the wait is named.

`DECISION_REQUIRED = YES` — these are a draft. They are not enforced anywhere and no test asserts them.

---

## §10 — Decision candidates

### DECISION 1 — Warm re-entry: should a page keep what it read?

```
PAGES      = Site Inventory · Order Planning · Weekly Shipping Plan · Request Order Draft ·
             Purchase Order Overview · Purchase Order Workspace · SKU Details ·
             Product Strategy Board · Automation Schedule          (9 routes)
DEPENDENCY = each page's own primary workspace read
CURRENT_LOAD_TIMING  = on EVERY mount, cold and warm alike
FIRST_ACTUAL_CONSUMER = the page's own first screen — it genuinely needs the data
```

This is not about *whether* the data is needed. It is about whether leaving the page and coming back
should buy it again. Twelve routes already say no; nine say yes; the split is historical rather than
designed.

```
OPTION_A  keep eager — every entry re-reads
OPTION_B  keep the page model across route changes, as the other twelve already do
OPTION_C  keep the model, and refresh it in the background while showing it (stale-while-revalidate)
```

```
TRADEOFF_A  Always current. The operator pays a full server round trip for every glance at a page
            they looked at a minute ago. On Site Inventory and Order Planning this is the whole
            re-entry cost.
TRADEOFF_B  Re-entry becomes free. The data is as old as your last visit — and the page has no way to
            say how old, because only FC Summary records per-table freshness. A stale number that
            looks live is worse than a slow one that is right.
TRADEOFF_C  Best of both for the eye, worst for truthfulness: the screen shows one thing and then
            silently becomes another. This is exactly the FALSE-EMPTY class of defect S3 spent four
            rounds removing, in its other direction.
```

`RECOMMENDED_TECHNICAL_DIRECTION` — **B, but only for pages whose data a human cannot change from
elsewhere in the same minute**, and only with a visible "as of" marker. I would start with **SKU
Details**, because its sibling SKU Regional Details already does exactly this, from the same
`skuDetails.workspace.get` action, and has done for several rounds without a freshness complaint. That
one is a precedent rather than an experiment.

I would **not** recommend B for **Site Inventory** or **Order Planning** without more thought: both
sit next to a write path, and both are where a wrong number becomes a wrong purchase order.

`OPERATOR_DECISION_REQUIRED = YES`

---

### DECISION 2 — Boot: should every page's code load on every boot?

```
PAGE       = all
DEPENDENCY = 82 scripts, 5.86 MB of JavaScript, 724 KB of CSS
CURRENT_LOAD_TIMING = all of it, deferred but executed before the menu is usable
FIRST_ACTUAL_CONSUMER = the route that uses it, which most sessions never open
```

Concretely: `inventory-replenishment.js` is 946 KB; `fc-summary.js` 476 KB; the map trio
(`km-globe.js` + world geometry + zh-Hant names) is 460 KB. A session that only opens SKU Details
parses and executes all of it.

```
OPTION_A  keep eager — one bundle, no loading seams, nothing can be missing when a page mounts
OPTION_B  load a page's module when its route is first opened, as its HTML partial already is
OPTION_C  split only the three largest and the map trio, and leave the rest
```

```
TRADEOFF_A  Boot pays for everything; navigation pays for nothing. Simple, and it is why
            JS_DUPLICATE_LOAD_COUNT is 0 and nothing has ever been missing at mount.
TRADEOFF_B  Boot gets much smaller. Every route gains a new failure mode it does not have today —
            "the page's code did not arrive" — and that needs a refusal surface per route, exactly
            like the deferred-table surfaces S3-R13 built. It is also the single biggest structural
            change available here, and §11 of this round forbids doing it now for good reason.
TRADEOFF_C  Most of the benefit, a quarter of the risk, four new failure points instead of twenty.
```

`RECOMMENDED_TECHNICAL_DIRECTION` — **C, and measured before it is committed to.** The map trio is the
cleanest candidate: 460 KB, one route, no other page reads it, and the route already tolerates a
loading state. I would want a real before/after boot measurement on your machine, not this
environment's — the instrument here cannot resolve boot cost, so the case for C is currently made from
*bytes*, not from *seconds*, and bytes are an argument rather than a proof.

`OPERATOR_DECISION_REQUIRED = YES`

---

### DECISION 3 — Promotion Risk Tracker: five broad tables for a KPI strip

```
PAGE       = Promotion Risk Tracker
DEPENDENCY = campaigns, campaign_sku_lines, marketplace_skus, sku_details, marketplaces
CURRENT_LOAD_TIMING = all five on mount, via loadScopedTables
MEASURED   = 5 requests, 3 sequential read rounds (read pool is 2)
FIRST_ACTUAL_CONSUMER = the KPI cards and the risk table — they do use all five
```

```
OPTION_A  keep eager — 5 requests, 3 rounds
OPTION_B  one purpose-built scoped server read, as Overseas Inventory already has (1 request, 1 round)
OPTION_C  defer campaign_sku_lines until a campaign is expanded, as FC Special now defers its two
```

```
TRADEOFF_A  Three server round trips before a KPI strip appears, every cold entry.
TRADEOFF_B  Best result by far — and it is an Apps Script change, which is a different round, a
            different deployment and a different risk profile. Overseas Inventory is the precedent
            and it worked.
TRADEOFF_C  Client-only and cheap, but it saves at most one of five reads and leaves 2 rounds.
```

`RECOMMENDED_TECHNICAL_DIRECTION` — **B**, whenever an Apps Script round is on the table. Not C: the
saving does not repay the second failure surface. `OPERATOR_DECISION_REQUIRED = YES`

---

### DECISION 4 — Factory Inventory and Carrier Rate Card: the same shape, smaller

```
PAGES = Factory Inventory (4 requests / 2 rounds) · Carrier Rate Card (3 / 2)
OPTION_A  keep eager      OPTION_B  one scoped server read, as in decision 3
```
`TRADEOFF` — identical to decision 3 and one round cheaper to leave alone.
`RECOMMENDED_TECHNICAL_DIRECTION` — bundle with decision 3 if you take B there; otherwise leave.
`OPERATOR_DECISION_REQUIRED = YES`

---

### DECISION 5 — `system.health` on every Weekly Shipping Plan mount

```
PAGE = Weekly Shipping Plan
DEPENDENCY = system.health, issued beside the workspace read on EVERY entry, warm or cold
FIRST_ACTUAL_CONSUMER = a deployment-mismatch check
```

```
OPTION_A  keep per-mount        OPTION_B  once per session        OPTION_C  once per session, re-checked after a failed write
```

`TRADEOFF_A` — a second request on every entry to catch a deployment change that happens once a
release. `TRADEOFF_B` — a mid-session deployment goes unnoticed until something fails.
`TRADEOFF_C` — catches the case that matters (a write refused by a server that moved underneath you)
without paying on every navigation.

`RECOMMENDED_TECHNICAL_DIRECTION` — **C**. `OPERATOR_DECISION_REQUIRED = YES`

---

### DECISION 6 — `gapJob.status.get` on every Site Inventory and Order Planning mount

```
PAGES = Site Inventory · Order Planning
DEPENDENCY = gapJob.status.get — a background job status poll
MEASURED   = it is Site Inventory's ONLY warm-re-entry cost, and it fires again on A→B→A
FIRST_ACTUAL_CONSUMER = a resume-the-running-job affordance
```

```
OPTION_A  keep per-mount
OPTION_B  poll only while a job is actually known to be running
OPTION_C  keep per-mount, but do not let it block or delay anything else on the page
```

`TRADEOFF_A` — one request per navigation, forever, for a job that is usually not running.
`TRADEOFF_B` — cheapest, but a job started in another tab is invisible until something else asks.
`TRADEOFF_C` — costs the same as A and fixes nothing measurable, since the shell already does not wait.

`RECOMMENDED_TECHNICAL_DIRECTION` — **B**, with the caveat that "another tab" is a real workflow here
and you would know better than I do whether it happens. `OPERATOR_DECISION_REQUIRED = YES`

---

### DECISION 7 — SKU Regional Details: `include.pricing` on the first read

```
PAGE = SKU Regional Details
DEPENDENCY = pricingList, carried by include.pricing on the mount read
CURRENT_LOAD_TIMING = on mount, inside the SAME request as the master list
FIRST_ACTUAL_CONSUMER = a pricing tab, or the bulk update modal — neither is the first screen
```

This is the one case where the S3-R13 answer does **not** transfer. FC Special's two tables were
separate requests and separate rounds, so deferring them removed round trips. Here the pricing rides
an existing request: deferring it would save **payload** and **cost a new round trip** at the moment
the operator opens a pricing tab.

```
OPTION_A  keep eager — one request, larger payload, pricing instant when wanted
OPTION_B  defer to the first pricing consumer — smaller first payload, one new request later
OPTION_C  leave it exactly as it is and revisit only if payload is ever shown to be the bottleneck
```

`RECOMMENDED_TECHNICAL_DIRECTION` — **C, explicitly.** I am recording this as a decision because §10
asks for every dependency not consumed by the first screen, and this one qualifies on the letter of
it. But the honest engineering answer is that trading a round trip for bytes is the wrong direction in
an application whose measured cost is round trips. I would not spend a round on it.

`OPERATOR_DECISION_REQUIRED = YES` (and "leave it" is a perfectly good answer)

---

## Not a decision — one repair, waiting for permission to be scheduled

**Five pages re-bind every listener on every mount and release none.** FC Summary adds **336 listeners
per re-entry** on top of its first 379; Overseas Inventory +74, Promotion Risk Tracker +63, Factory
Inventory +60, Forecast +38. One census run took the process from 31 listeners to **2 049**.

This has no product question in it — nobody wants duplicate handlers — and SKU Details already shows
the correct shape (678 bound once, +1 thereafter). It is a bind-once or release-on-unmount repair, per
page, and it belongs in S4-R2 as work rather than on this board as a choice.

---

## What I would do first, if you asked

1. **The listener repair.** No decision needed, five pages, and it is the only item here that is
   getting worse the longer a session runs.
2. **Decision 1 for SKU Details only.** Its sibling is the precedent; the change is small and the
   freshness argument is already settled in practice.
3. **Decision 2 option C, map trio first** — but measure boot on your machine before committing.

Everything else can wait for a round that has an Apps Script deployment in it anyway.
