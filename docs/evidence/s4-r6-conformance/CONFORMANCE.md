# S4-R6 — System-wide conformance

**Base** `75bdff0` · **Routes audited** 21 of 21 · measurements in `measurements.json`

Request counts, dispatch counts, DOM outcomes and listener counts by target class are authoritative.
Milliseconds are not: the virtual clock freezes while a task runs. Nothing here claims visual fidelity.

---

## The route set

21 user-visible routes, re-derived from the two authorities that decide what a user can reach — the
`onclick` handlers in index.html's sidebar, and `KM_STAGED_SECTIONS_` in app.js for Product Strategy,
whose menu is built at boot. It agrees with S4-R1's 21, and the agreement is a result rather than an
inheritance.

Excluded, each for a stated reason: **Overseas Inbound** and **Overseas Outbound** (markup disabled
*and* refused by name inside `showSection` — two independent gates); the three `menu-item--disabled`
planned items (no handler at all); **`shippinghistory`** (not a separate route — it is the section
`shipment-overview` makes visible, and §2 forbids double-counting shared route owners).

## Per-page status

| Page | Initial req / rounds | Drift | Failure surface | Status |
|---|---|---|---|---|
| Site Inventory | 1 / 1 | 0 | error + Retry, recovers | PASS |
| Factory Inventory | 3 / 2 | 0 | error + Retry, recovers | PASS |
| Overseas Inventory | 1 / 1 | 0 | error + Retry, recovers | PASS |
| Forecast | 0 / 0 | 0 | no read on entry | PASS |
| FC Summary | 2 / 1 | 0 | error + Retry, recovers | PASS |
| Order Planning | 2 / 1 | 0 → **repaired** | error, no in-page Retry | **REPAIRED** + open P2 |
| Weekly Shipping Plan | 2 / 1 | 0 | error + Retry, recovers | PASS |
| Shipment Draft | 1 / 1 | 0 | error, no in-page Retry | PASS + open P2 |
| Shipment Overview | 0 / 0 | 0 | no read on entry | PASS |
| On-the-Way Map | 1 / 1 | 0 | error + Retry, recovers | PASS |
| Request Order Draft | 1 / 1 | 0 | error, no in-page Retry | PASS + open P2 |
| Purchase Order Workspace | 1 / 1 | 0 | error, no in-page Retry | PASS + open P2 |
| Purchase Order Overview | 1 / 1 | 0 | error, no in-page Retry | PASS + open P2 |
| Promotion Risk Tracker | 1 / 1 | 0 | **was a false empty** | **REPAIRED** |
| SKU Details | 1 / 1 | 0 | error, no in-page Retry | PASS + open P2 |
| SKU Regional Details | 1 / 1 | 0 | error + Retry, recovers | PASS |
| Carrier Rate Card | 2 / 1 | 0 | **was a false empty** | **REPAIRED** |
| SKU Handbook | 3 / 2 | 0 → **repaired** | **was demo content** | **REPAIRED** |
| Supply Chain Canvas | 0 / 0 | 0 | no read on entry | PASS |
| Automation Schedule | 1 / 1 | 0 | **four states, one class** | **REPAIRED** |
| Product Strategy Board | 1 / 1 | 0 | error + Retry, recovers | PASS |

`PAGES_PASS = 15` · `PAGES_REPAIRED = 5` · `PAGES_DECISION_REQUIRED = 1` (Order Planning, §12-A)

## §9 — the network census is clean

**No page issues 4 or more initial requests. No page pays 3 or more sequential rounds.** The two
three-request pages — Factory Inventory and SKU Handbook — pay **two** rounds, not three, because
`KM_SCOPED_READ_CONCURRENCY_ = 2`. That bound is a deliberate pressure control and §13 forbids
widening it for speed.

The first measurement of this said "3 rounds" and was wrong. At `serverMs = 0` every request settles
before the next is sent, so the round heuristic degenerates into a request count. The census that
answers §9 was retaken at 400 ms, and the suite asserts it was.

## §7 — what was actually broken

Three pages **failed silently** on a refused cold load, and the reason the earlier rounds missed all
three is the same: they were only ever asked what a page does when the network *works*.

**Promotion Risk Tracker — an unreachable error state.** The page had an error state, the loader set
it, and the branch rendered a message and a Retry. It was never reached. `crScopeReady()` is false
until a country and marketplace are chosen, and on a cold load the country selector is populated *from
the read that just failed* — so the scope can never be ready, STATE 1 wins every time, and the page
says "Select a country and marketplace to view promotion risk." Indistinguishable from a healthy
first visit, while inviting an action the failure has made impossible. Repaired by checking the error
state **before** the no-scope state — the same move S4-R4 made for the deferred scope read, which the
critical read never got.

**Carrier Rate Card — `.catch(function () { _crcInit(); })`.** Fail-closed was right and it was half
the job: with no read model the page draws exactly what it would draw for a genuinely empty carrier
list — "No options" in every filter, blank table, no message, nothing to press.

**SKU Handbook — a failed read rendered twenty-five products.** The read *was* fail-closed: it refuses
to widen to a broad read and installs an empty scoped model. What nobody followed through is what
`getSkuHandbookData()` does with an empty knowledge set — it falls through to the built-in
`upcomingSkuData` / `runningSkuData` / `phasingOutSkuData` arrays. Measured on a refused cold load: a
fully populated handbook, 25 Total / 23 Running / 2 Upcoming, and no message of any kind. The only
hint was a "Data: Mock" badge, which reads as a configuration state rather than as *this failed*.
That is worse than the false empty §7 names, because an empty page at least prompts a reload.

**Automation Schedule — four states wearing one class.** `auto-sched-loading` was the presentation
for LOADING, for "API unavailable", for a failed read *and* for "No automations configured". Nothing
in the DOM distinguished them, which is also how the page first registered as permanently loading:
its failure message is named, and styled, as a loading message.

After: `FALSE_EMPTY_PAGE_COUNT = 0`, `PERMANENT_LOADING_PAGE_COUNT = 0`, and every refused read has a
surface. Every Retry that exists dispatches exactly one real request and clears the refusal.

## §7 — listener drift

Measured **marginally**, cycle 3 minus cycle 2 over three mount/unmount cycles, with listeners
classified by target: a handler on a detached element is reported and is not drift. First-mount
registrations are a fixed cost no amount of navigating repeats.

Two routes drifted. **Order Planning +4 per visit** — three `.ro-dropdown-panel` click handlers and
one `#ro-scroll-col` scroll handler. The dropdown *triggers* are cloned-and-replaced, which drops
their old listeners with the old nodes; the panels are not. And since `_roRenderAll()` runs on every
filter change, not just every mount, the count grew with *use*. **SKU Handbook +1** — the search box
re-bound on every mount.

All 21 routes now read 0. Timer drift 0, open requests 0, everywhere.

## §6 / §1A — the expandable workspaces

Five of six exercised on real clicks. Site Inventory and Order Planning could not be measured at all
before this round — the fixture world answered their reads with `{}`, so S4-R1 recorded `useful: 0`
and every later round inherited it. Both now carry rows.

| Workspace | rows | 1st expand | 2nd (same scope) | 3rd (new scope) |
|---|---|---|---|---|
| Site Inventory | 120 | **0** | 0 | 0 |
| SKU Details | 120 | 0 | 0 | 0 |
| SKU Regional Details | 50 | 0 | 0 | 0 |
| Factory Inventory | 40 | 0 | 0 | 0 |
| Order Planning | 50 | **8** | **0** | **1** |
| Request Order Draft | 0 | not measurable in this world | | |

`PER_SKU_EXPAND_REQUEST_VIOLATION_COUNT = 0` · `N_PLUS_ONE_EXPAND_VIOLATION_COUNT = 0`

Order Planning's cost is **per scope**, not per SKU: the materialized gap is cached by
company+country+marketplace and keyed by SKU inside, so the second SKU in a scope costs nothing and
the third only pays because it is in a *different* scope. Bounded by the number of scopes on screen,
never by the number of rows.

**A correction.** The first measurement reported 7 duplicate table reads on the second expand and that
was a race, not a defect: the second expand fired 1.5 s after the first while its seven-table read
was still in flight at 400 ms. With a real settle wait the second expand costs 0.

But the race was real, and it was a defect of its own: `_roEnsureL2Tables` set `_roL2Ready` only when
the read *resolved* and had nothing to consult in between, so two expands inside the load window each
started the whole seven-table set. Repaired with the in-flight promise — the same shape the transport
uses for a shared open read and `core/deferred-read.js` uses for LOADING. Cleared on settle, so a
later expand after a *failed* load can still retry.

## §11 — warm re-entry

`ZERO_READ_WARM_REENTRY_COUNT = 13` · `WARM_REFETCH_ROUTE_COUNT = 8` (S4-R1: 12 / 9).

All eight re-read business state another page can write, so `REQUIRED_BY_FRESHNESS = UNKNOWN` for
every one of them and **none was touched**. §11 is explicit: do not eliminate a read merely to improve
the number, and UNKNOWN means no change.

## §8 — what is left at boot

67 local scripts, 3 849 935 bytes. Up 15 121 bytes from S4-R5 — this round adds code to four page
modules rather than removing any.

Three assets remain over 200 KB and none moves:

- **`operation-system-db-api.js`, 459 KB** — shared infrastructure. §8 says so explicitly.
- **`fc-summary.js`, 476 KB** and **`request-order.js`, 357 KB** — route-owned by *ownership*, but
  reachability was not established this round. Both are reached from pages other than their own
  route. Proving otherwise is a measurement nobody took, and UNKNOWN is not authorization.

## Open, and deliberately not repaired

**Six pages render a truthful failure and offer no in-page Retry** — Order Planning, Shipment Draft,
Request Order Draft, Purchase Order Workspace, Purchase Order Overview, SKU Details. Several print
"Press Retry. It issues exactly one new request" beside no such button: the workspace and composer
error paths lost the Retry their legacy counterparts have. All six recover by leaving the route and
returning, which re-reads, so this is P2 rather than a lie — but it is a closed, asserted set, and a
seventh page losing its Retry fails the suite.

## Mutation

Eight planted defects, all killed. Two are worth recording because each first appeared as a
*surviving* mutant that was really an **inert** one — the failure mode that makes a mutation score a
lie.

K8's first replacement referred to a variable the repair had removed, so the mutated handler threw,
the rejection fell into `.catch`, and `.catch` rendered the *correct* refusal: the planted defect
repaired itself. The obvious retarget to `.catch` then also survived, because this read does not
reject on a transport refusal at all — `_kmGapRead_` resolves with `{ success: false }`, so the branch
a refused automation read takes is the `else` inside `.then`. Found by measuring the mutant by hand
after the second survival, not by reasoning about it a third time.
