# S8-R4D-F1B-R2 — RESTING LAYOUT CORRECTION · PHASE 1 EVIDENCE

```
STATUS = STOPPED AT PHASE 1, BY INSTRUCTION
RUNTIME_MODIFIED = NO · CSS_MODIFIED = NO · DEPLOYED = NO · CACHE_TOKEN_ROTATED = NO
Production target: 230525a (unchanged by this round)
```

The task says: *"If production DOM measurements cannot be performed, provide a safe operator-side DevTools
measurement script and STOP. Do not guess CSS values."* They cannot be performed from here — there is no
browser automation in this environment (no `puppeteer`, no `ws`, no CDP client), and the decisive half of the
report is **data-dependent** (US/Shopify differs from US/Amazon), so a local render could not reproduce it
even with a browser. The probe is `assets/tools/s8-r4d-f1b-r2-resting-gap-probe.js`.

What follows is everything Phase 1 CAN establish without a browser, so the measurement arrives pointed at the
right question rather than fishing.

---

## §1 — THE RENDERED NODES, AND WHAT OWNS THEIR GEOMETRY

```
#opsSection.page-inventory            no CSS rule of its own -> display:block, no padding, no gap
  #alloc-draft-persistence-panel      JS, inserted as firstChild (IR:6364) — ABOVE block 1, shifts all three
  h2                                  background:white, z-index:140
  .replen-control-panel        BLOCK 1  sticky top:0 · z 131 · bg #f8f9fa · border 1px · padding 10px 16px
                                        · margin-bottom: var(--space-lg, 1.5rem)      <- owns GAP A
  .fc-modal x5                        display:none; position:fixed -> ZERO flow contribution
  .replen-category-shell       BLOCK 2  sticky · z 125 · bg #fff · box-shadow 0 1px 3px · padding 8px 14px
                                        · margin-bottom: var(--space-lg, 1.5rem)      <- owns GAP B
    .replen-category-rail               border 1px #e5e7eb · padding 4px · overflow-x auto · nowrap
  .dual-layer-table            BLOCK 3  margin-top: 0 · bg white · border 1px · radius 8px · shadow
    #replenSearchState                  F1B: moved INSIDE here (IR:9953), display:none when empty
    #replen-render-integrity            F1B: moved INSIDE here (IR:1884)
    .table-header-bar                   sticky · z 120 · height 68px · bg #f5f5f5
                                        · box-shadow ... , 0 -100vh 0 100vh white   (the white curtain)
```

`--space-lg: 1.5rem` = 24px, defined once at `base.css:90`. **Both gap declarations are now character-identical**
(F1B made `.replen-control-panel` carry the same fallback). So the two margins are 24px each.

### Every DOM insertion in the page module, classified

| site | inserts | where | in a gap? |
|---|---|---|---|
| IR:1884 | `#replen-render-integrity` | first child of the table card | **no** (F1B moved it) |
| IR:9953 | `#replenSearchState` | first child of the table card | **no** (F1B moved it) |
| IR:6364 | `#alloc-draft-persistence-panel` | `#opsSection` firstChild | no — above block 1 |
| IR:9410 | `#replenScopeRegistryState` | inside `.replen-filters` | no — inside block 1 |
| IR:11104 | `#exec-plan-status-<sku>` | inside an expanded row's list | no — inside the table body |
| IR:3019/3020 | row elements | `#replenFixedBody` / `#replenScrollBody` | no |
| IR:12011, 12866, 14237 | notice / download / overlay | `document.body` | no |

**After F1B there is no node in either gap, and no CSS rule anywhere in the repository adds vertical geometry
between the blocks.** Every rule that touches the three selectors was enumerated across all six stylesheets;
the only vertical owners are the two 24px margins and `.dual-layer-table { margin-top: 0 }`.

---

## §2 — WHY THAT IS A FINDING RATHER THAN A CONTRADICTION

The operator measures GAP B > GAP A on a tree where the two declared gaps are provably identical. Both
statements can be true at once, and the way they can is the hypothesis the probe exists to settle:

> **GEOMETRIC equality is not PERCEIVED equality, because the two blocks do not present their edges the same
> way.**

* `.main-content` is `background: white` (`layout.css:333`). `.replen-category-shell` is `background: #fff`
  with **no border** — against a white page it has no visible edge of its own, only a downward
  `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`.
* So BLOCK 2's visible body is the **rail**, inset by the shell's `padding: 8px 14px`.
* BLOCK 1 is `#f8f9fa` **with** a 1px border — a clearly bounded card.
* BLOCK 3's visible top is the `#f5f5f5` header bar at the card's top edge.

Measured from the visible edges that leaves ~32px on both sides, which is still symmetric — so **if the
perceived gaps are genuinely unequal, something is present at runtime that is absent from source.** That is
exactly what `pageChildren` / `occupantsOfGapA` / `occupantsOfGapB` in the probe enumerate.

### Why F1B's structural fix did not satisfy the contract

F1B removed the one **dynamic** occupant of GAP B (`#replenSearchState`, which the Country change itself
populated) and made the two declarations identical. Both were real and both are now fixed — the suite proves
the host is a child of the table card and absent from the page-level gap. **Neither of them addressed a
STATIC perceived asymmetry**, because the preflight measured declarations and not pixels, and no pixel
measurement of Production existed at that time. That is the gap in the F1B evidence, stated plainly.

### The US/Shopify clue, and why it is the most valuable one

Nothing between the blocks is data-dependent. The category rail cannot wrap (`flex-wrap: nowrap`), tab count
only changes its scroll width, and the shell has no height or min-height (asserted by `category-bar-rebuild`
A15). So a **larger** lower gap specifically on US/Shopify cannot come from any owner identified above.

Candidates the probe distinguishes, in the order it will settle them:

1. **A runtime occupant of GAP B that source does not predict** — `occupantsOfGapB` names it outright.
2. **The rail's scrollbar** — `railScrollbarPx` says whether `scrollbar-gutter: stable` is honoured on this
   axis in this engine, and `railOverflows` / `railTabCount` say whether Shopify's category set overflows
   when Amazon's does not. If `railScrollbarPx` is non-zero, §B.4 of F1B did not take effect and the rail's
   height varies by that amount.
3. **A perceived-edge asymmetry** — `GEOMETRIC` equal while `PERCEIVED` is not, with the paint properties
   (`background-color`, `box-shadow`, `border-*-color`, `border-radius`) dumped for every block so the edge
   the eye uses is identifiable rather than assumed.
4. **A banner left visible inside the table card** — `banners[]` reports parent, display, height and child
   count. This would change the card's top but NOT the gap, and distinguishing those two is the point.

No CSS value is proposed here. Phase 2 begins when the measurement names the owner.

---

## §3 — THE PROBE

`assets/tools/s8-r4d-f1b-r2-resting-gap-probe.js`

**Zero-write, proven mechanically**: the file contains no assignment to `innerHTML`, `textContent`, `style`,
no `setAttribute`, no `appendChild`/`removeChild`/`insertBefore`, no `localStorage`/`sessionStorage`, no
`fetch`/`XMLHttpRequest`, no `.click()`, and no call to `searchReplenishment` or `_irApplySearch_`. The only
write is `window.__F1B_R2__`, a diagnostic handle. It triggers no read, no write and no gap recalculation,
and is safe to run on Production repeatedly.

It refuses to report when `window.scrollY !== 0`, because a sticky block measured mid-scroll is not the
resting position the contract is about.

### Operator procedure

For **US/Amazon**, then **US/Shopify**, then **EU/Amazon**:

1. Load Site Inventory, select the site, press **Search**, let the table finish.
2. Scroll to the very top.
3. Paste the whole probe file into the DevTools console, Enter.
4. `copy(__F1B_R2__.json)` and paste the blob back.

Also worth capturing once, on US/Shopify: a screenshot at the resting position with DevTools' element
overlay on `.replen-category-shell`, so the perceived edge can be checked against the measured box.

### What each answer licenses

```
occupantsOfGapB non-empty              -> a runtime node owns the gap; Phase 2 removes or relocates it
railScrollbarPx > 0                    -> scrollbar-gutter is not honoured here; the rail's height varies
GEOMETRIC equal, PERCEIVED unequal     -> the defect is which edges the blocks present, not their margins
both equal on every site               -> the remaining difference is outside these three blocks; re-aim
```

---

## §4 — SCOPE HELD

No CSS value was changed or proposed. No runtime file, stylesheet, markup, test, backend, API, DB or Apps
Script file was modified. No cache token was rotated — nothing browser-served changed, and rotating a token
for an unchanged tree would publish a cache-bust with no bytes behind it. F1A and F1B guards are untouched.
Production remains `230525a`.

---

# PHASE 1B — PRODUCTION EVIDENCE REVIEW

```
LAYOUT_ROOT_CAUSE = CONFIRMED (the selector-change case) · PARTIAL (the US/Shopify magnitude)
LAYOUT_FIX_AUTHORIZED = NO — evidence gate not yet satisfied; the fix is PROPOSED in §A5 below
RUNTIME_MODIFIED = NO · DEPLOY_REQUIRED = NO
```

## §A1 — THE SCREENSHOTS SHOW A DIFFERENT STATE FROM THE PROBE

This is the reconciliation, and the operator's addendum is what settles it.

```
PROBE STATE   after Search, at rest        geometric 24 / 24   perceived 32 / 32.67   -> EQUAL
SHOT STATE    after a SELECTOR CHANGE,     gap B visibly larger
              before Search
```

The probe was never measuring the defective state. Both observations are correct and they are not about the
same DOM. The `0.67px` is sub-pixel and inside the stated 1–2px tolerance; it is not the defect.

## §A2 — ROOT CAUSE: THE NOTICE IS PAINTED OVER, SO IT RENDERS AS BLANK SPACE

The reproduction names `_irMarkSearchStale_`, bound to the Country/Marketplace `change` event. After a
successful Search it sets `_irSearch.stale` and calls `_irRenderStaleNotice_`, which puts a banner into
`#replenSearchState`. That host then occupies a real band of layout.

**It is invisible, and the stylesheet already says why:**

```
inventory-replenishment.css:490-493
  #ops-section .table-header-bar { z-index: var(--km-sticky-z-header-1, 120);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1), 0 -100vh 0 100vh white; }

inventory-replenishment.css:1701-1703   (the repository's OWN statement of the rule)
  "Sits ABOVE the sticky .table-header-bar (z-index:120, whose `0 -100vh 0 100vh white` box-shadow paints a
   white curtain over everything above it). z-index must beat 120 and the row needs a solid background so
   the tabs are not masked."
```

The curtain spans the header's border box expanded by 100vh and offset up by 100vh — everything from 200vh
above down to the header's own bottom edge, at full page width. `.replen-category-shell` was given
`z-index: 125` **precisely to escape it** (css:1732).

**`#replenSearchState` and `#replen-render-integrity` have no stylesheet rule anywhere in the repository.**
Grepped across all six stylesheets: zero rules for either id, and zero for `.replen-search-stale`,
`.replen-unsaved-banner`, `.replen-dupe-banner`, `.replen-dbunknown-banner`. They are therefore
`position: static; z-index: auto`, painted in the in-flow non-positioned layer — **below** every positioned
element with `z-index >= 0`, including the curtain at 120.

So the banner occupies `bannerHeight + 8px` of layout and paints **white**. The operator sees extra vertical
space with no visible cause. That is the report, exactly.

### This is NOT an F1B regression — F1B changed where the invisible band sits, not that it exists

Before F1B the host was a sibling in the gap (masked). After F1B it is the first child of the table card,
above `.table-header-bar` (still masked). In both arrangements a blank band of the banner's height appears
between the category rail and the grey header. F1B's two repairs were real and remain correct; neither could
have fixed this, because the preflight measured declared geometry and this is a PAINT-ORDER defect.

### The larger finding, which outranks the spacing one

The same masking applies to the three banners that share the host: **"Unsaved — database update failed"**, the
duplicate-plan-rows banner, and the database-unverified disclosure. On this evidence they have never been
visible to an operator. They are data-loss warnings.

This has the same shape as the defect already recorded in this file at IR:11015 — `.replen-ai-plan-result` was
written into a box painted nowhere, and the caller returned `true`, asserting a visibility it never observed.

## §A3 — US/SHOPIFY: PARTIAL

A second masked band stacks if `#replen-render-integrity` is also present. It appears when the rendered row
count does not match the expected one, is plausible on a 101-SKU self-fulfilled Shopify set, and carries its
own `margin: 8px 0`. **Plausible, not proven.** The probe's `masking.hosts[]` names it outright if so.

## §A4 — THE SMALLEST ADDITIONAL MEASUREMENT

Re-run the **existing** probe (now extended) at the addendum's three checkpoints. No new instrument is needed.

```
A  after Search, at rest                     paste the probe, then  __F1B_R2__.capture("A")
B  change Country, DO NOT press Search        paste the probe, then  __F1B_R2__.capture("B")
C  press Search, let it finish                paste the probe, then  __F1B_R2__.capture("C")
then                                          copy(JSON.stringify(__F1B_R2__.checkpoints))
```

The root cause is confirmed if, at **B** and not at A or C: `masking.totalMaskedBandPx > 0`,
`banners[0].display === "block"` with `height > 0`, and `gaps.PERCEIVED.B_rail_to_header` exceeds its value
at A by that height **+ 8**. One visual check completes it: **that band must look WHITE, not amber.**

## §A5 — THE PROPOSED MINIMAL FIX (not implemented)

One canonical contract, no new margins, no fixed heights, no sticky change: give the two notice hosts a
stacking position that escapes the curtain, the way the category rail already does.

```css
#ops-section #replenSearchState,
#ops-section #replen-render-integrity { position: relative; z-index: var(--km-sticky-z-cat-rail, 125); }
```

**Open question that must be settled before this is written.** At 125 the host would also paint over the
sticky header while scrolling past it. Two candidates, to be decided on evidence rather than taste:

* **(i)** accept it — the host is short and scrolls away;
* **(ii)** move both hosts BELOW `.table-header-bar` inside the card, where nothing masks them and the sticky
  header still pins above them.

**(ii) is the stronger candidate** and costs the same two `insertBefore` call sites F1B already touched. Not
chosen yet, because choosing it without the capture would be the same mistake F1B made — repairing the
geometry a document describes instead of the pixels a browser produces.

---

# PHASE B — TRANSPORT TRIAGE (read-only)

```
TRANSPORT_FAILURE_CLASSIFICATION = KNOWN_NAMED_CONDITION + UNEXPLAINED_TIMEOUT  (two findings, not one)
HTTP_404_CAUSAL_LINK = NOT_PROVEN
```

## §B1 — The 404s are expected traffic with a name, and they are already handled

Apps Script answers every `/exec` with a **302 to `script.googleusercontent.com/macros/echo`**
(km-transport.js:78). A 404 on that echo host is classified by **three facts together**, never by the status
alone:

```
km-transport.js:268
  if (fp.httpStatus === 404 && fp.redirected === true && fp.source === EXPIRED_USERCONTENT_REDIRECT)
      return CODES.REDIRECT_TARGET_NOT_FOUND;
```

It is auto-retryable, **reads only**, bounded to exactly one extra attempt (`maxRetries` = 1 for reads, 0 for
writes, :746), and the retry returns to the STABLE `/exec` to obtain a fresh redirect target (:305).

**Seeing these 404s in the console is not by itself a defect.** They are the expired-echo-target condition the
transport was built to name and recover from.

## §B2 — Timeout ownership

```
read bound     60 000 ms at the transport (km-transport.js:329); the scoped DB read layer declares 45 000 ms
write bound    90 000 ms, never auto-replayed
ONE budget     _deadlineAt = start + budget; every attempt is bounded by _remainingMs() — a retry spends the
               REMAINDER of the caller's budget, never a second one (S3-R8 §7)
recovery floor below 2% of the budget the recovery is SKIPPED and the named failure is kept, explicitly so
               REDIRECT_TARGET_NOT_FOUND is not converted into an anonymous REQUEST_TIMEOUT
REQUEST_TIMEOUT is NEVER auto-retried (:297) — "the bound already elapsed; asking again doubles the wait"
```

## §B3 — Why the causal link is NOT_PROVEN

Two readings fit the evidence the operator has, and a console log cannot separate them:

* **benign** — the 404 fired, the single retry succeeded, and the REQUEST_TIMEOUT belongs to a *different*
  request;
* **causal** — the 404 fired late in the budget, the retry consumed the remainder, and the read timed out.

Only per-request correlation distinguishes them.

## §B4 — Is this the E5 request-shape issue? NO — a separate defect

E5 proved the 19-table read came from a **diagnostic probe's** flat body reaching `60_` as `{}`. The shipped
page sends the DTO envelope, and Production's canonical first layer is **13 tables, serverDurationMs 6 197,
7 299 rows**. A 6.2 s read cannot exhaust a 45–60 s bound. Unless server execution has regressed — which is
directly measurable and is in the evidence list below — US/Amazon REQUEST_TIMEOUT is a **separate defect**,
and the E5 record must not be cited as its explanation.

## §B5 — EVIDENCE THE OPERATOR MUST COLLECT (transport)

On a page where the timeout reproduces, with DevTools **Network** open and **Preserve log** on:

1. Network, filter `script.google`. For every row: **Name, Status, Type, Size, Time**, and whether it shows a
   302 followed by a 200 or a 404. Export the **HAR** if possible — it carries the timings and the full
   redirect chain, which is the part the console throws away.
2. In the console, immediately after the failure:
   ```js
   window.KM.transport.metrics && window.KM.transport.metrics()
   window._irReadStageReport_ && window._irReadStageReport_()   // CORRECTED by the R2 closeout
   window._irSearchState_ && window._irSearchState_()
   ```
   If one of those names does not exist, report that rather than substituting another — the exported surface
   is what it is, and guessing it is how the last three rounds went wrong.
3. The **full error object** the page reported: `code`, `details.timeout_ms`, `details.budget_exhausted`,
   `details.attempt`, `request_id`.
4. From Apps Script → **Executions**, the rows covering that minute: status, duration, and whether an
   execution ran at all for that request.

The decisive question those four answer: **did a server execution for the timed-out `request_id` run and
finish inside the bound?** If it did, the loss is on the response hop and the 404 is causal. If none ran, or
it ran past the bound, it is a backend or queueing defect and the 404 is incidental.

---

# REQUIRED REPORT

```
LAYOUT_ROOT_CAUSE             CONFIRMED for the selector-change reproduction — paint-order masking by the
                              .table-header-bar white curtain (z-index 120) over two notice hosts that have
                              no stylesheet rule and therefore no stacking position of their own.
                              PARTIAL for the US/Shopify magnitude — a second stacked band is plausible,
                              not proven.
LAYOUT_FIX_AUTHORIZED         NO — proposed in §A5, blocked on the A/B/C capture and on the
                              paint-over-while-scrolling decision.
TRANSPORT_FAILURE_            KNOWN_NAMED_CONDITION (REDIRECT_TARGET_NOT_FOUND — already classified and
CLASSIFICATION                retried once inside one budget) + UNEXPLAINED_TIMEOUT (unattributed).
HTTP_404_CAUSAL_LINK          NOT_PROVEN
ADDITIONAL_EVIDENCE_REQUIRED  layout — the A/B/C probe capture plus one visual confirmation that the band is
                              WHITE; transport — HAR or Network rows, the transport metrics and dispatch
                              ledger, the full error object, and the Apps Script Executions rows.
RECOMMENDED_NEXT_ATOMIC_TASK  S8-R4D-F1B-R3 — NOTICE VISIBILITY AND RESTING GAP. Frontend-only: give the two
                              notice hosts a stacking position that escapes the curtain, with regression
                              tests asserting the masked band is zero at checkpoint B and that all four
                              banners are reachable. Transport stays a SEPARATE task (S8-R4D-T1) on its own
                              evidence.
RUNTIME_MODIFIED              NO
DEPLOY_REQUIRED               NO
```

---

# S8-R4D-F1B-R2 — EVIDENCE CLOSEOUT

```
LAYOUT_STATUS = NOT_REPRODUCED_IN_VALIDATED_CHECKPOINTS      (explicitly NOT "FIXED")
MASKING_CONCERN = UNVERIFIED  (neither confirmed nor refuted — it was never exercised)
TRANSPORT_STATUS = OPEN
RUNTIME_MODIFIED = NO · BROWSER_SERVED_CHANGES = 0 · BACKEND/API/DB = 0 · DEPLOYED = NO
```

## §C1 — THE PRODUCTION EVIDENCE, AS RECORDED

Operator ran the A/B/C checkpoints on Production (`230525a`). All three returned identical geometry.

```
geometric gaps        A 24px      B 24px
perceived gaps        A 32px      B 32.67px
masked band           0px
rail height           40.26px
gap occupants         none
notice host           display:none
integrity notice      absent
scope                 country: null   marketplace: null
```

Operator clarification, recorded verbatim in substance: *the second test began with the page already in its
expanded visual state; the original A→B→C visual change was not clearly reproduced.*

## §C2 — CLASSIFICATION, AND WHY IT IS NOT "FIXED"

**`NOT_REPRODUCED_IN_VALIDATED_CHECKPOINTS`.**

Nothing in this round changed any browser-served byte. Production is the same `230525a` that produced the
original screenshots. A defect cannot have been repaired by a round that shipped nothing, so three clean
captures are **evidence about the captures**, not about the defect. Recording them as FIXED would convert an
unobserved state into a closed finding, which is the error this whole sequence has been correcting.

## §C3 — WHY THE SCOPE WAS NULL, AND WHY ALL THREE CAPTURES WERE IDENTICAL

These are the same fact. The page refuses to render the stale notice unless a Search has succeeded:

```
inventory-replenishment.js
function _irMarkSearchStale_() {
    if (!_irSearch.applied) { _irRenderSearchGate_(); return; }   <- returns BEFORE the notice
    _irSearch.stale = _irFiltersDiffer_(_irPendingFilters_(), _irSearch.applied);
    _irRenderStaleNotice_();
}
```

`scope.country = null` means the Country `<select>` held an empty value (the probe's `|| null` could not tell
an absent element from an empty one — see §C4). The other readings prove the markup WAS mounted: the rail
measured 40.26px and all three blocks resolved. So the selectors were present and **blank**, which means
`_irSearch.applied` was null, which means:

* changing a selector marked nothing;
* `_irRenderStaleNotice_` was never called;
* `#replenSearchState` stayed empty and `display:none`;
* the masked band was 0 because **there was nothing to mask**;
* and A, B and C were necessarily identical, because none of them was a different state.

**The captures are internally consistent and they describe a page in its pre-search state.** The defect lives
downstream of a successful Search, so this sequence could not have contained it.

### Why `applied` was null — candidates, and the measurement that separates them

1. **The first Search timed out.** A failed Search never applies: `_irApplySearch_` is reached only on
   success, so `status` goes ERROR and `applied` stays null. This is directly consistent with the reported
   US/Amazon REQUEST_TIMEOUT, and it is the leading candidate.
2. **The page was reloaded and the probe run before any Search.** After F1B this is by design — a reload
   restores the SELECTORS and commits nothing. But the probe saw the selectors **blank**, not restored, so
   this requires either no remembered scope or a failed/invalid restore.
3. **The registry rejected the remembered scope**, which calls `_irForgetScope_()` and leaves the selectors
   blank. Note the read-failure branch does NOT leave them blank — it calls `_irSetSelectors_(remembered)` —
   so a blank pair argues against a failed preload read and for 1, 2 or 3.

`window._irBootstrapDiagnostic_()` answers this outright: `mode`, `scope_valid`, `restore_reason`,
`preloaded`, `committed`. It was not captured, because the probe did not ask for it.

## §C4 — INSTRUMENTATION AUDIT: THE PROBE IS WHY THE ATTEMPT WAS WASTED

This is a defect in my instrument, not in the operator's procedure.

| # | defect | consequence |
|---|---|---|
| 1 | **No page-state capture.** The probe reported geometry and never `_irSearch` (status / applied / stale). | An invalid checkpoint A was **indistinguishable** from a valid one. The operator had no way to know the sequence was void before spending all three captures. This is the one that cost the round. |
| 2 | **No precondition guard.** It refused on `scrollY !== 0` but not on "no Search has succeeded" — the actual precondition for the defect. | It accepted and recorded three captures that could not contain the defect. |
| 3 | **`\|\| null` conflated absent with empty.** `(document.getElementById('replenCountry') \|\| {}).value \|\| null` | `country: null` could mean the element was missing OR the value was blank. Those are different diagnoses. |
| 4 | **The Phase-1B record named two console helpers that do not exist** — `_irReadDispatchLedger_` and `_irLastReadMeta_`. | Corrected in §B5 above. The real exports are `window._irReadStageReport_()` (which carries `server_execution_ms`, `server_tables_read`, `read_dispatches`, `request_count`, `retry_count`, `coalesced_count`) and `window._irSearchState_()`. |

Capture TIMING and selector state were therefore the proximate blockers, and the probe is what failed to
surface them. All four are repaired in the probe in this commit. It remains zero-write: no DOM write, no
listener, no storage, no network, no page-function call that changes state.

## §C5 — THE MASKING CONCERN IS PRESERVED AS UNVERIFIED

Carried forward **unverified**, neither promoted nor dropped:

* **PROVEN FROM SOURCE** — `.table-header-bar` carries `box-shadow: …, 0 -100vh 0 100vh white` at z-index 120
  (css:490-493); the stylesheet states the masking rule itself at css:1701 and gave the category rail
  z-index 125 to escape it; and **no stylesheet rule exists anywhere in the repository** for
  `#replenSearchState`, `#replen-render-integrity` or any of the four banner classes, so all of them are
  `position: static; z-index: auto`.
* **NOT PROVEN IN PRODUCTION** — no capture has yet been taken in a state where any banner was rendered. The
  measured `masked band = 0` is consistent with the hypothesis and does not test it, because the host was
  empty.

So the statement *"the unsaved-write warning, the duplicate-rows banner and the database-unverified
disclosure may never have been visible"* stands as a **source-level concern requiring production
confirmation**, not as a confirmed production defect. It is not a basis for changing CSS today.

## §C6 — TRANSPORT EVIDENCE, RECORDED SEPARATELY

```
TRANSPORT_STATUS = OPEN
first Search REQUEST_TIMEOUT        recorded, unattributed
redirect-target HTTP 404            recorded; NAMED and already handled (REDIRECT_TARGET_NOT_FOUND,
                                    auto-retried once, reads only, inside ONE budget)
HTTP_404_CAUSAL_LINK                NOT_PROVEN
relation to E5                      SEPARATE DEFECT — 13 tables / 6 197 ms server time cannot exhaust a
                                    45–60 s bound
```

**New in this closeout, and it changes the ordering:** candidate 1 in §C3 means the transport failure is not
merely a parallel issue — **it is a plausible cause of the layout investigation's inability to reach a valid
checkpoint A.** A Search that times out leaves `applied` null, and a page with `applied` null cannot show the
stale notice. Until a Search reliably succeeds on the site under test, the layout capture cannot be completed.

Evidence still required is unchanged from §B5, with the corrected console names.

## §C7 — BOUNDED FOLLOW-UP DIAGNOSTIC (the only change in this commit)

`assets/tools/s8-r4d-f1b-r2-resting-gap-probe.js` — **not browser-served**; nothing in `index.html` or
`app.js` references `assets/tools`, so this file reaches a browser only when an operator pastes it. No cache
token applies and none was rotated.

Added:

* `state` — `_irSearchState_()`, `_irBootstrapDiagnostic_()`, `_irRenderIntegrity_()`;
* `VALID_FOR_DEFECT` + `VALID_REASON` — a plain-language verdict printed on every run;
* `capture()` now **REFUSES** an invalid checkpoint and says why, instead of recording one;
* selector state reports `present` and `value` separately.

### Re-run procedure

```
1. Load Site Inventory. Select Country + Marketplace. Press Search.
2. CONFIRM THE TABLE RENDERED ROWS. Paste the probe.
   It must print  VALID FOR DEFECT.  If it does not, the sequence is void — stop and send that output.
3. __F1B_R2__.capture("A")
4. Change Country. DO NOT press Search. Paste the probe again. __F1B_R2__.capture("B")
5. Press Search, let it finish. Paste the probe again. __F1B_R2__.capture("C")
6. copy(JSON.stringify(__F1B_R2__.checkpoints))
```

Also note at step 4 whether the gap visibly grows, and whether that band looks **white** or **amber**. That
single observation is worth more than the geometry, because it separates "a notice is masked" from "a gap
grew for another reason".

## §C8 — EXIT CRITERIA

```
no browser-served changes          YES — git diff vs origin/main over assets/js, assets/css, assets/html,
                                   index.html is empty
no backend / API / DB changes      YES — 0 files
no deployment                      YES — origin/main remains 230525a
layout evidence classified         NOT_REPRODUCED_IN_VALIDATED_CHECKPOINTS
transport issue                    OPEN
CSS / layout / sticky / z-index /  UNCHANGED — no rule added, removed or edited
banner positioning / runtime
S8-GLOBAL-NAV-R1                   MAY PROCEED INDEPENDENTLY — see below
```

### May S8-GLOBAL-NAV-R1 proceed independently? YES, with three boundaries

It shares no file with the open work and does not depend on it. Conditions, so it stays independent:

1. **It must not modify** `assets/js/pages/inventory-replenishment.js`, `assets/css/pages/inventory-replenishment.css`,
   `assets/js/core/sticky-header.js`, `assets/css/core/km-sticky-header.css`, or any transport/API file. If it
   needs to, it stops and the two rounds are sequenced instead.
2. **It will rotate the application cache token.** That is normal and append-only, but it means F1B-R3 cannot
   reuse a token Global Nav has published — the two must not be developed on the same token.
3. `showSection` debt is adjacent to global navigation. If Global Nav repairs it, say so, because this
   sequence has been carrying it as open.

---

# NEXT TASK — EXACT RECOMMENDATION

```
S8-R4D-T1 — SITE INVENTORY FIRST-SEARCH TRANSPORT STABILITY (read-only triage)   <- DO THIS FIRST
```

**Before F1B-R3, and before another layout capture.** Not because the transport matters more, but because of
§C3 candidate 1: a Search that times out leaves `applied` null, and a page with `applied` null cannot produce
the layout defect. The transport failure may be what prevented a valid checkpoint A. Collecting its evidence
(§B5, corrected names) is also the cheapest way to get the page into a state where the layout capture is even
possible.

```
S8-R4D-F1B-R3 — NOTICE VISIBILITY AND RESTING GAP     <- BLOCKED
```

Blocked on a **valid** A/B/C capture, i.e. one the probe marks `VALID FOR DEFECT`. Do not implement on the
source-level masking proof alone: that proof says a banner WOULD be masked, not that the operator's gap was
caused by one. Implementing now would be the same mistake F1B made — repairing the geometry a document
describes instead of the pixels a browser produces.

```
S8-GLOBAL-NAV-R1                                       <- MAY PROCEED NOW, under §C8's three boundaries
S8-R4D-F2 — ON-THE-WAY FIRST-LAYER AGGREGATE           <- still queued, unchanged
```
