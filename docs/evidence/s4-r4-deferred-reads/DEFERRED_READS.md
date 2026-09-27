# S4-R4 — Page-level critical / secondary data loading

**PRE_SHA** `0bb42ed` · measured at serverMs 400 · every figure below read out of a real headless
Chrome over S3-R11's fixture world.

---

## The finding the round turned on

Promotion Risk Tracker read **five tables over three sequential rounds** to render **three zeros and
a dropdown**.

`CampaignRiskState.country` starts empty and nothing restores it, so `crScopeReady()` is `false` on
every cold entry. Every consumer of the other four tables sits behind that gate:

- `getSkuMasterData()` returns `[]` without a scope — so no rows, and no category/series rails.
- `_crScopedPromotions()` returns `[]` without a scope — so no risk maths.
- `renderRiskKPIs()` prints three neutral zeros *by design* until a full site scope is chosen.

The page **cannot** show a row or a non-zero KPI on first entry, whatever `campaigns`,
`campaign_sku_lines`, `sku_details` and `marketplaces` contain. One table is genuinely critical:
`populateCrSiteFilters()` builds the Country `<select>` from the distinct countries of *active*
`marketplace_skus`, and that select is the only thing the user can act on.

The other two pilots had a quieter version of the same shape. Factory Inventory's Movement Log panel
ships with `style="display:none"`, and `_initFactoryMovementLog` was calling
`_populateFactoryMovFilters()` at mount — filling dropdowns in a hidden panel. Carrier Rate Card
prints *"Set filters and click Search"* and has an empty table by design, while reading
`carrier_lead_times` for a column of it.

---

## Classification

| Page | CRITICAL | DEFERRED | First consumer |
|---|---|---|---|
| Promotion Risk Tracker | `marketplace_skus` | `marketplaces`, `sku_details`, `campaigns`, `campaign_sku_lines` | a country is chosen |
| Factory Inventory | `factory_stock`, `warehouses`, `sku_details` | `factory_stock_movements` | the Movement Log tab is opened |
| Carrier Rate Card | `carrier_rate_cards`, `carriers` | `carrier_lead_times` | Search is clicked |

Nothing was classified `UNKNOWN`, and nothing classified `UNKNOWN` was deferred. Three dependencies
were examined and **kept critical** because a first-screen consumer was found:

- **Factory Inventory / `warehouses`** — the snapshot's Company, Factory and Country columns are
  joined from it via `warehouse_id`. The source says so in a comment; `_factoryWarehouseMap()` is
  called from the snapshot builder as well as from the movement builder.
- **Factory Inventory / `sku_details`** — the snapshot's Category / Series columns.
- **Carrier Rate Card / `carriers`** — `_crcCarrierOptions()` joins `carrier_id → carrier_name` for
  the Carrier filter's *labels*, and that filter is part of the first screen.

---

## Result

| | requests PRE → POST | rounds PRE → POST | first consumer |
|---|---|---|---|
| Promotion Risk Tracker | **5 → 1** | **3 → 1** | 4 requests / 2 rounds |
| Factory Inventory | **4 → 3** | 2 → 2 | 1 / 1 |
| Carrier Rate Card | **3 → 2** | **2 → 1** | 1 / 1 |
| **total** | **12 → 6** | **7 → 4** | |

The first useful UI is **byte-for-byte the same count** before and after: 3 country options, 40
snapshot rows, 3 carrier filter checkboxes. What changed is only when the secondary data arrives.

`DEFERRED_FIRST_USE_REQUEST_COUNT` is **one dependency read** in each case. Promotion Risk's costs
four *requests* because its dependency is four tables and a scoped read asks per table — that is one
read of one dependency, not four dependencies.

---

## The contract each deferred model is held to

`assets/js/core/deferred-read.js` owns four words and nothing else:
`NOT_LOADED · LOADING · READY · FAILED`.

**It is not a cache.** It stores no business rows. A read resolves to the owner page, which merges
the model into the same read model the eager read filled a moment earlier, so every downstream getter
on all three pages is unchanged.

**There is no clock in it.** No `setTimeout`, no `Date.now`, no interval, no TTL. A deferred model is
valid until its *owner* says otherwise.

| | OWNER | VALIDITY | INVALIDATED BY | POST-WRITE |
|---|---|---|---|---|
| `promotionRisk.scope` | campaign-risk.js | the browser session | nothing | **none** — the page has no DB write; promotions are a `localStorage` overlay |
| `factoryInventory.movements` | factory-stock.js | until a factory write | `_fsAfterWrite` | **invalidate**, or re-read outright when the Movement Log is on screen |
| `carrierRateCard.leadTimes` | carrier-rate-card.js | the browser session | nothing | **none required** — the only write imports `carrier_rate_cards`, and the page states that Lead Time is maintained separately and never stored on a rate card |

Factory Inventory is the one that can go stale, and it is handled at both ends. An inventory
adjustment appends to `factory_stock_movements`. If the Movement Log is open, `_fsAfterWrite`
re-reads it with `factory_stock` exactly as before — a visible log missing the row the user just
wrote would be a lie. If it is not open, the model is invalidated and the next tab open pays for one
read. Measured: `READY → NOT_LOADED → exactly 1 re-read → READY`, and 0 on the use after that.

---

## Failure

Measured on all three, with the deferred tables refused at the transport:

| | primary UI | refusal visible | route intact | Retry | recovered |
|---|---|---|---|---|---|
| Promotion Risk | 3 KPI cards, 3 country options — untouched | 1 | yes | 1 read | yes |
| Factory Inventory | 40 snapshot rows — untouched | 1 | yes | 1 read | yes |
| Carrier Rate Card | 18 rate rows — untouched | 1 | yes | 1 read | yes |

`FALSE_EMPTY_COUNT = 0` and `PERMANENT_LOADING_COUNT = 0`. Each refusal names itself and says what is
still usable — *"The country selector above is unaffected"*, *"The Stock Snapshot tab is
unaffected"*, *"The rate rows below are unaffected"* — and carries a Retry.

Two decisions are stated rather than left implicit:

**FAILED is sticky until Retry.** These consumers are re-entered by *rendering*, so a FAILED state
that re-read on every `ensure()` would turn one refused read into a request storm against a server
that is already refusing. The cost: leaving the route and returning shows the same error rather than
silently re-reading. Retry is the only thing that sends again.

**`ensure()` resolves, never rejects.** A caller that forgot a `.catch` would otherwise take the page
down with an unhandled rejection — the defect S4-R2 spent a round removing.

**The Promotion Risk failure path does not fall back to the legacy option list.** That path exists
for a world with no `marketplaces` master at all; using it after a refused read would present weaker
data as though the read had succeeded. The marketplace select stays disabled and empty.

---

## Staleness and re-entry

An answer that arrives after the user has left does not commit: `stillActive: false`, one visible
section, one mounted section, and returning costs **0 requests** with the model intact. Two guards,
and they are independent — the helper refuses an answer from a superseded epoch, and each page
additionally checks the thing the answer was asked *for* (`crcCurrentRows`, `_crLoadToken`,
`_fsReadGen_`).

`LISTENER_DRIFT = 0` on all three. `OPEN_REQUEST_LEAK_COUNT = 0`. Warm re-entry, return with the
secondary loaded, and a rapid A→B→A all read **0** and mount exactly once. S4-R2's retained-model and
lifecycle guarantees are intact.

> The stale scenario records `openRequestsWhileAway: 2` for Promotion Risk. That is the scenario's
> own doing — it delays the answer by 2.5 s and then leaves mid-flight. The re-entry scenario, which
> leaves a settled page, measures 0 for all three.

---

## A correction to S4-R1

S4-R1's `DECISION_BOARD.md` §10, DECISION 3, recorded:

> `FIRST_ACTUAL_CONSUMER = the KPI cards and the risk table — they do use all five`

They do not. On a cold entry there is no scope, so `getSkuMasterData()` and `_crScopedPromotions()
` both return `[]` and the KPI cards render three zeros — which S4-R1's own census recorded as
`useful: 3`, the three cards. Four of the five tables reach nothing on that screen.

The consequence was not cosmetic. From that premise the board offered three options — **A** keep
eager (5 requests), **B** one purpose-built scoped *server* read, **C** defer `campaign_sku_lines`
alone — recommended **B**, and rejected **C** on the grounds that *"the saving does not repay the
second failure surface"*. The option that was actually available was absent from the list: defer
**four of five** to the first country selection, client-side. That is what this round did, and it
reached **5 → 1 requests, 3 → 1 rounds** with no Apps Script change, no new action and no new
deployment risk — a better result than option B was expected to give, from the option the board
had discarded as not worth it.

DECISION 4 (Factory Inventory and Carrier Rate Card) was answered the same way, for the same
reason: both pages open on controls above a table that is empty by design.

S4-R1's board is sealed by its own suite (`F1` asserts `DECISION_REQUIRED_COUNT = 7`), so it is
left byte-identical and the correction lives here.

---

## Instrument corrections made this round

Four, and each would have produced a false finding.

1. **Listener drift is a marginal rate, not a total.** A first reading took the census before a
   page's *first* mount and reported **+89** and **+65** for two pages S4-R2 had sealed at 0. Those
   listeners are one-time registrations a live page is entitled to — document-level handlers, and
   elements inside a section that is hidden rather than removed. The baseline now starts after one
   mount and one unmount, which is the statistic S4-R2 sealed, and all three read **0**. The seal was
   never broken.
2. **The failure scenario lifts its refusals before Retry.** A scoped read rejects its whole batch on
   the first refusal, so arming four tables and then pressing Retry re-refused the two the first
   attempt never reached — and reported the page as failing to recover from a network that was still
   down.
3. **Two error-box selectors matched static hosts** rather than errors, so a healthy page counted a
   refusal it had not had.
4. **The factory snapshot renders `div`s, not rows.** S4-R1's census asked for `tr` and recorded
   `useful: 0` for a table that was full. The correct selector is `.fixed-row`, and the table has 40.

---

## Two latches, named

The single-flight mutant was **inert** in its first form: no scenario asked twice while a read was in
flight, so removing the guard changed nothing observable. Replaced rather than banked (S3-R10 J5),
with a scenario that fires the interaction twice in a row — a double click.

That version then surfaced something worth recording. `KM.DB`'s scoped read **shares its own
in-flight `getTable`**, so a duplicate dispatch for the same table is absorbed before it becomes a
request. The request count is therefore **identical with and without** the helper's guard — 4/1/1
either way — and cannot see the defect at all. `deferredRead.readCount` goes **2 → 3**, which is the
duplicate §12 asks about. A round that had checked only the request count would have been reporting
the transport's defence as though it were this one's.

---

## The fixture world grew

S3-R11's world did not carry `warehouses`, `factory_stock`, `factory_stock_movements`, `carriers`,
`carrier_rate_cards` or `carrier_lead_times` — which is why S4-R1 recorded two of these three routes
with `useful: 0`. Request counts were still true then, but §7 asks what the *first consumer does*,
and a consumer with nothing to consume cannot answer. The rows are shaped by the real normalizers'
column names, and the lead-time table deliberately covers only two of the three carriers, so a
correct blank Lead Time can be told apart from a lost join.
