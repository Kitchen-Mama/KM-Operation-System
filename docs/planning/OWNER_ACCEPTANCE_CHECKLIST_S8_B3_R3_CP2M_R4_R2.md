# OWNER ACCEPTANCE CHECKLIST — S8-B3-R3-CP2M-R4-R2

Candidate HEAD `<see the round report>` · backend **R52 / Version 308** · Preview **OFF** · `origin` unchanged.

> **WHAT A PUSH WOULD ACTUALLY CARRY, stated before anything else.** This branch is **seven commits** ahead of
> `origin/main` — CP2M, R1, R2, R3, R4, R4-R1 and R4-R2. Accepting this round is not the same decision as
> releasing it, because releasing it releases all seven. Across all seven: **38 js, 16 json, 12 png, 11 md,
> 2 html, 2 css, 1 .gitignore — and ZERO `.gs` files.** The whole line is frontend, tests, documents and
> evidence, so **the Apps Script half of the manual release is not needed for this push at all.**

> **THE LISTS ARE SEPARATED BY WHAT THEY COST, NOT BY WHAT THEY COVER.** The previous checklist mixed a
> read-only walk with steps that write, which left the Owner to work out for themselves which line was safe.
> That is the wrong way round.
>
> | list | may it change anything? | where |
> |---|---|---|
> | **A** | **No.** Every step is a read, a render or a gesture that is cancelled | the real Main application |
> | **B** | No — but it needs states the real data does not contain | an isolated fixture / the suites |
> | **C** | **Yes. Each item needs its own Owner authorisation** | nowhere until separately approved |
>
> **Nothing in A or B authorises a write.** The single rule that keeps A read-only: **in A, never press Save.**

---

## LIST A — MAIN, READ-ONLY

Safe on the live application. No step here writes, and no step asks for test data to be created.

### A1 · The build is the one that was reviewed

| # | Check | Expected |
|---|---|---|
| A1.1 | `git log --oneline -1` | the candidate HEAD in the round report |
| A1.2 | `git status` | clean |
| A1.3 | `git rev-list --count origin/main..HEAD` | **7** — a push carries the whole CP2M line, not this round alone |
| A1.3a | `git diff --name-only origin/main HEAD -- '*.gs'` | **empty** — across ALL SEVEN commits, so **no Apps Script sync step is required by this push** |
| A1.4 | the served application token | `r53-coldstartshell-20261013` (unchanged this round) |
| A1.5 | the served MAP token | `map-canvaslifecycle-r12-20261013` |
| A1.6 | `KM.RELEASE` | `r6a1-request-send-20260822`, unchanged |

### A2 · Site Priority — the page and the gesture, never the save

| # | Do | Expected |
|---|---|---|
| A2.1 | Open Site Priority | sites listed per company, **highest weight first**; equal weights keep a stable order |
| A2.2 | Pick up a row with the mouse and drop it between two others | a **draft / preview** appears; the table does not re-order behind it |
| A2.3 | Read the proposed weight | strictly between the two neighbours it was dropped between |
| A2.4 | Press **Cancel** | the draft disappears, **nothing is written**, and the message says nothing was sent |
| A2.5 | Repeat A2.2 with **touch** | same draft, same proposed weight |
| A2.6 | Repeat A2.2 with the **keyboard** | same draft, same proposed weight |
| A2.7 | Drag to the **top** of a company | proposed weight is above the current highest |
| A2.8 | Drag to the **bottom** | proposed weight is below the current lowest; a lowest of 0 refuses, with a reason |
| A2.9 | Start a draft, switch company or filter | the draft is **not silently discarded or auto-saved** |
| A2.10 | Start a draft, navigate away, come back | no save was sent |

> **A2 writes nothing because Save is never pressed.** The write path itself is **C1**.

### A3 · Navigation and the responsive shell

| # | Do | Expected |
|---|---|---|
| A3.1 | Move between pages quickly, including back to one already open | exactly one page visible at a time; no page reappears over the next |
| A3.2 | At 360 / 768 / 1024 / 1440 / 1920 px wide, open the navigation drawer | the drawer opens and the page below stays usable |
| A3.3 | In the drawer press **Tab**, then **Shift+Tab**, then **Home** | focus stays inside the drawer and wraps; Home goes to the first item |
| A3.4 | With the drawer open, navigate directly | the drawer closes |

### A4 · The Map — this round's fix

| # | Do | Expected |
|---|---|---|
| A4.1 | Open **On the Way** and let it finish loading | the globe draws |
| A4.2 | Press **↻ Refresh** | **the globe does NOT disappear.** A quiet "Refreshing…" marker appears; the map stays on screen for the whole wait |
| A4.3 | Leave for another page and return | the map comes back; the globe is **not** rebuilt |
| A4.4 | Open the map, and **before it finishes loading** click the logo to go Home | Home appears and **stays**. The map must not flash in, must not take the screen back, and the Home page must not be covered |
| A4.5 | Repeat A4.4 but go to another page instead of Home | same |
| A4.6 | Open the map, leave immediately, come straight back | the map loads **once**, not twice — one loading state, then the data |

> **A4.4–A4.6 are the new ones.** Everything else on this page was accepted at CP2M-R4-R1.

### A5 · Related pages still work

| # | Do | Expected |
|---|---|---|
| A5.1 | Open Site Inventory, Carrier Rate Card, Overseas Stock, FC Summary, Request Order | each loads from its own route; no console error |
| A5.2 | Return to Home from each | Home renders; no page stays visible underneath |

---

## LIST B — ISOLATED FIXTURE ONLY

These need states the live data does not contain — a delayed server, a cancelled request, a garbled cell.
**None of them should be created in the real master**, and each is already covered by a suite, named below so
the evidence can be read instead of re-created.

| # | What is checked | Why it cannot be done on Main | Where it lives |
|---|---|---|---|
| B1 | Press **Save**, then **Cancel** while it still says "Checking…" → **zero writer calls** | needs a slow preflight, and pressing Save on Main is a write | `site-priority-save-cancellation-…-r4-r1` |
| B2 | Save → leave → return while the preflight is in flight → **zero writer calls** | same | same suite |
| B3 | After the request has been **sent**, Cancel is **withdrawn**; reaching it another way refuses; the draft **survives** to receive its answer | needs a request held open | same suite |
| B4 | A stale answer does not clear a newer draft's busy state, overwrite its banner, or dispatch its write | needs two overlapping operations | same suite |
| B5 | `OUTCOME_UNKNOWN` is reported as unknown and **never auto-resent** | cannot be induced safely on Main | same suite |
| B6 | A **garbled** `allocation_priority` is refused by the server with `PRIORITY_CHANGED`, zero write | **would require writing a garbled value into the live marketplaces sheet** | `invalid-priority-fail-closed-…-r4-r1` |
| B7 | The map's superseded mount dispatches **no read, no render, no globe** | needs the markup answered late | `map-mount-continuation-…-r4-r2` |
| B8 | A forced refresh never takes the globe host off the page | needs a slowed read | `map-canvas-lifecycle-…-r4-r1` |

> ### B6 — AND A CORRECTION TO WHAT WAS PROMISED LAST ROUND
>
> The CP2M-R4-R1 checklist said a garbled row would show *Missing* **and a disabled drag handle**. The first
> half is right. **The second is wrong.** The page disables the handle only on an **INVALID** value, and the
> browser's normalizer produces INVALID only for a value it can read and reject — a negative number.
> Unreadable TEXT becomes `null`, which reads as **MISSING**, so the row looks like any other unset site and
> **the handle is live**.
>
> The refusal is real and it is fail-closed — it simply happens at the **server**, which reads the raw cell,
> classifies it INVALID and writes nothing. An acceptance step that waits for a disabled handle would wait
> for something that never comes, and would then report a working safeguard as broken.

---

## LIST C — REQUIRES A SEPARATE OWNER AUTHORISATION

Each of these WRITES. None is authorised by this round, and none was exercised.

| # | Action | What it would change | Minimum to authorise it |
|---|---|---|---|
| C1 | **Site Priority → Save** | three cells in one `marketplaces` row (`allocation_priority`, `updated_by`, `updated_at`) under a lock, after a mandatory CAS | one named site, one expected weight, and agreement that the previous value is recorded first |
| C2 | **Request Order → Submit / Send** | `request_orders`, `request_order_lines`; the send orchestration | a named RO and an agreed stopping point |
| C3 | **Confirm and dispatch** | shipment status, events, routes, **and it CONSUMES the shipment's reservation** | a named shipment, plus agreement on what an interrupted dispatch should look like |
| C4 | **Receive PO lines** | PO lines, `factory_stock` balance **and** its movement ledger | a named PO and the quantities |
| C5 | **Email** | outbound mail | explicit, per recipient |
| C6 | **Document generation / retry** | Drive artefacts — **Drive has no compare-and-set**, so a retry can produce a second document | explicit, and a plan for removing a duplicate |

> **For the next round, the smallest useful write in each mainline** — stated so the authorisation can be
> small rather than open-ended:
>
> - **Shipping / replenishment:** **C3 on one draft shipment with one line**, chosen so the before-state is
>   recorded and the reservation it holds is known. It is the smallest action that exercises deduction and
>   reservation-consumption **together**, which is the one failure that silently changes stock.
> - **Request order / purchase order:** **C4 on one PO line for a small quantity**, with `factory_stock` and
>   `factory_stock_movements` read before and after at the `warehouse_id` + `sku` grain. It is the smallest
>   action that can leave a balance disagreeing with its own ledger.
>
> Both are `W*`. Both have a compensating rollback that runs on a **caught** failure and does **not** run if
> the execution is killed. Neither should be attempted without the before-state written down first.

---

## WHAT THIS CHECKLIST DOES NOT CLAIM

- **No performance claim.** The 30-second problem is unresolved, cold-start wall clock is unchanged, eight
  page scripts still load at boot, and `global-logistics-map` is genuinely slower on a return visit — a
  finding this round's counterfactual showed **predates** this round and did not fix.
- **No status-transition table.** Only `cancelShipmentDraft`'s three sets are established. The rest is the
  first item of next-round work rather than a guess.
- **No step in A or B was executed against Production**, and nothing in C was executed at all.
